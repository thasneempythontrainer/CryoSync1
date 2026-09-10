"""
CryoSync -> Databricks migration (Bronze layer).

Reads the local SQLite store (backend/cryosync.db) and loads every table into
Databricks Delta tables registered in Unity Catalog under a Bronze schema.

Usage:
    python migrate_to_databricks.py                # full load
    python migrate_to_databricks.py --table users  # load a single table
    python migrate_to_databricks.py --dry-run      # print plan, don't execute

Environment variables (in backend/.env or shell):
    DATABRICKS_HOST          e.g. dbc-xxxx.cloud.databricks.com
    DATABRICKS_HTTP_PATH     e.g. /sql/1.0/endpoints/primary
    DATABRICKS_TOKEN         personal access token / service principal secret
    DATABRICKS_CATALOG       default "cryosync_catalog"
    DATABRICKS_BRONZE_SCHEMA default "bronze"
"""
import argparse
import json
import os
import sqlite3
import sys

from dotenv import load_dotenv

# Backend runs from the backend/ directory; make sure we can import the env.
load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

DEFAULT_CATALOG = os.getenv("DATABRICKS_CATALOG", "cryosync_catalog")
DEFAULT_SCHEMA = os.getenv("DATABRICKS_BRONZE_SCHEMA", "bronze")

# Ordered, canonical intention of what should exist. The script migrates every
# table that is actually present in SQLite, but this list drives ordering (FKs
# before dependents) and column descriptions for Unity Catalog.
TABLE_ORDER = [
    # Reference / small
    "suppliers", "products", "facilities", "storage_zones", "referral_sources",
    "branches", "content_documents",
    # Auth
    "users", "sessions",
    # Cord blood enterprise
    "families", "enrollments", "collection_kits", "cord_blood_units",
    "storage_tanks", "tank_temperature_logs", "lab_test_reports",
    "transplant_records", "payment_transactions",
    # Operations
    "shipments", "inventory_lots", "compliance_incidents",
    # Audit / traceability
    "crm_sync_log", "csv_import_batches", "system_logs", "genie_conversations",
]

# Column-level business descriptions used to seed Unity Catalog metadata so that
# Genie can answer natural-language questions accurately.
COLUMN_COMMENTS = {
    "families": {
        "crm_id": "External CRM/ERP identifier from Zoho CRM",
        "first_name": "Primary contact first name",
        "last_name": "Primary contact last name",
        "email": "Primary contact email",
        "phone": "Primary contact phone number",
        "date_of_birth": "Date of birth of the client",
        "sync_status": "CRM sync state: pending/synced/failed/conflict",
    },
    "enrollments": {
        "enrollment_number": "Unique enrollment/contract number, e.g. ENR-2024-001234",
        "plan_type": "Storage plan: cord_blood/cord_tissue/cord_blood_tissue/lifetime",
        "processing_method": "Processing method: standard_cell/maxcell/prepacyte_cb etc.",
        "status": "Enrollment lifecycle status",
        "family_id": "Foreign key to families",
        "total_amount": "Total contract value",
        "amount_paid": "Amount paid to date",
    },
    "collection_kits": {
        "kit_number": "Unique kit number, e.g. KIT-2024-001234",
        "enrollment_id": "Foreign key to enrollments",
        "barcode": "Kit barcode",
        "status": "Collection lifecycle status",
        "hospital_name": "Hospital / collection site",
    },
    "cord_blood_units": {
        "unit_number": "Unique cord blood unit number, e.g. CBU-2024-001234",
        "enrollment_id": "Foreign key to enrollments",
        "collection_kit_id": "Foreign key to collection_kits",
        "storage_status": "cryopreserved/quarantined/released_for_transplant etc.",
        "pre_process_tnc": "Total nucleated cells before processing",
        "post_process_tnc": "Total nucleated cells after processing",
        "tnc_recovery_pct": "TNC recovery percentage",
        "viability_pct": "Cell viability percentage",
        "volume_ml": "Final volume after processing (ml)",
        "storage_tank_id": "Physical tank identifier",
        "storage_temperature_c": "Storage temperature in Celsius",
    },
    "lab_test_reports": {
        "report_id": "Lab's internal report identifier",
        "unit_number": "Cord blood unit number the test applies to",
        "cord_blood_unit_id": "Foreign key to cord_blood_units",
        "test_type": "tnc/cd34/viability/sterility/hla_typing etc.",
        "test_name": "Human readable test name",
        "performed_at": "When the test was performed",
        "result_value": "Numeric result value",
        "result_unit": "Unit of the result",
        "result_text": "Textual result / interpretation",
        "status": "pending/passed/failed/conditional/under_review",
    },
    "transplant_records": {
        "transplant_number": "Unique transplant number, e.g. TXP-2024-001234",
        "cord_blood_unit_id": "Foreign key to cord_blood_units",
        "patient_id": "External patient identifier",
        "transplant_center": "Transplant center name",
        "diagnosis": "Clinical diagnosis",
        "hla_match_score": "HLA match score 0-100%",
        "status": "requested/matched/shipped/delivered/infused/engrafted etc.",
    },
    "storage_tanks": {
        "tank_id": "Physical tank identifier, e.g. TNK-001",
        "facility": "Facility name (Baldwin Park/Taiwan/Ahmedabad)",
        "capacity_units": "Maximum unit capacity",
        "current_units": "Units currently stored",
        "temperature_c": "Current temperature in Celsius",
        "ln2_level_pct": "Liquid nitrogen level percentage",
    },
    "payment_transactions": {
        "txn_number": "Transaction number",
        "family_id": "Foreign key to families",
        "amount": "Payment amount",
        "status": "Payment status",
        "paid_at": "When payment was made",
    },
    "shipments": {
        "shipment_number": "Inbound/outbound shipment number",
        "status": "Receiving lifecycle status",
        "temperature_regime": "Required temperature regime",
        "tracking_number": "Carrier tracking number",
        "carrier": "Shipping carrier",
    },
}

# SQLite type -> Databricks/Delta type mapping.
_TYPE_MAP = {
    "INTEGER": "BIGINT",
    "INT": "BIGINT",
    "SMALLINT": "INT",
    "BIGINT": "BIGINT",
    "TEXT": "STRING",
    "VARCHAR": "STRING",
    "CHAR": "STRING",
    "REAL": "DOUBLE",
    "FLOAT": "DOUBLE",
    "DOUBLE": "DOUBLE",
    "NUMERIC": "DECIMAL(38,18)",
    "DECIMAL": "DECIMAL(38,18)",
    "BOOLEAN": "BOOLEAN",
    "BLOB": "BINARY",
    "DATE": "DATE",
    "DATETIME": "TIMESTAMP",
    "TIMESTAMP": "TIMESTAMP",
}


def sqlite_columns(conn, table):
    return [(c[1], (c[2] or "TEXT").upper()) for c in conn.execute(f'PRAGMA table_info("{table}")')]


def delta_type(sqlite_type):
    base = sqlite_type.split("(")[0].strip().upper()
    return _TYPE_MAP.get(base, "STRING")


def build_ddl(catalog, schema, table, columns):
    col_defs = [f"  `{name}` {delta_type(stype)}" for name, stype in columns]
    return (
        f"CREATE TABLE IF NOT EXISTS `{catalog}`.`{schema}`.`{table}` (\n"
        + ",\n".join(col_defs)
        + "\n) USING DELTA"
    )


def exec_commit(connection, sql, params=None):
    with connection.cursor() as cur:
        cur.execute(sql, params or [])
    connection.commit()


def fetch_all(connection, sql):
    with connection.cursor() as cur:
        cur.execute(sql)
        rows = cur.fetchall()
        cols = [d[0] for d in cur.description]
    return cols, [dict(zip(cols, r)) for r in rows]


def comment_columns(connection, catalog, schema, table, columns):
    """Attach Unity Catalog column comments so Genie can map business terms."""
    col_map = dict(columns)
    comments = COLUMN_COMMENTS.get(table, {})
    for name, text in comments.items():
        if name not in col_map:
            continue
        safe = text.replace("'", "''")
        exec_commit(
            connection,
            f"COMMENT ON COLUMN `{catalog}`.`{schema}`.`{table}`.`{name}` IS '{safe}'",
        )


def migrate_table(dbc, catalog, schema, table, rows, columns, dry_run):
    cols = [name for name, _ in columns]
    placeholders = ", ".join(["?"] * len(cols))
    quoted = ", ".join(f'`{c}`' for c in cols)

    if dry_run:
        print(f"  [dry-run] would create + insert {len(rows)} rows into {table}")
        return "dry-run"

    # Create the Delta table.
    ddl = build_ddl(catalog, schema, table, columns)
    exec_commit(dbc, ddl)
    print(f"  created {catalog}.{schema}.{table}")

    # Insert rows.
    if rows:
        insert_sql = (
            f"INSERT INTO `{catalog}`.`{schema}`.`{table}` ({quoted}) VALUES ({placeholders})"
        )
        with dbc.cursor() as cur:
            for r in rows:
                row = [r.get(c) for c in cols]
                # Normalise JSON blobs to JSON strings.
                row = [json.dumps(v) if isinstance(v, (dict, list)) else v for v in row]
                cur.execute(insert_sql, row)
        dbc.commit()
        print(f"  inserted {len(rows):,} rows into {table}")

    comment_columns(dbc, catalog, schema, table, columns)
    return "ok"


def main():
    parser = argparse.ArgumentParser(description="Migrate CryoSync SQLite to Databricks Bronze")
    parser.add_argument("--db", default=os.path.join(os.path.dirname(__file__), "cryosync.db"))
    parser.add_argument("--catalog", default=DEFAULT_CATALOG)
    parser.add_argument("--schema", default=DEFAULT_SCHEMA)
    parser.add_argument("--table", help="Migrate only this table")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    host = os.getenv("DATABRICKS_HOST")
    http_path = os.getenv("DATABRICKS_HTTP_PATH")
    token = os.getenv("DATABRICKS_TOKEN") or os.getenv("DATABRICKS_SERVERLESS_STORAGE")
    if not (host and http_path and token):
        print("ERROR: DATABRICKS_HOST, DATABRICKS_HTTP_PATH and DATABRICKS_TOKEN must be set.", file=sys.stderr)
        sys.exit(1)
    host = host.replace("https://", "").rstrip("/")

    croak = None
    try:
        from databricks import sql as dbsql
    except ImportError as e:
        croak = e

    # Connect to SQLite.
    if not os.path.exists(args.db):
        print(f"ERROR: SQLite db not found: {args.db}", file=sys.stderr)
        sys.exit(1)
    sconn = sqlite3.connect(args.db)
    sconn.row_factory = sqlite3.Row
    present = {r[0] for r in sconn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    tables = TABLE_ORDER if not args.table else [args.table]
    tables = [t for t in tables if t in present]

    if not tables:
        print("No matching tables found in SQLite.", file=sys.stderr)
        sys.exit(1)

    if args.dry_run:
        print(f"Dry run: would create schema `{args.catalog}`.`{args.schema}` and migrate:")
        for t in tables:
            cols = sqlite_columns(sconn, t)
            n = sconn.execute(f'SELECT count(*) FROM "{t}"').fetchone()[0]
            ddl = build_ddl(args.catalog, args.schema, t, cols)
            print(f"\n== {t} ({n:,} rows) ==")
            print(ddl)
        return

    if croak:
        print(f"ERROR: missing dependency. Install with: pip install databricks-sql-connector\n{croak}", file=sys.stderr)
        sys.exit(1)

    print(f"Connecting to Databricks at {host} ...")
    dbc = dbsql.connect(
        server_hostname=host,
        http_path=http_path,
        access_token=token,
    )
    try:
        # Ensure schema exists.
        exec_commit(dbc, f"CREATE SCHEMA IF NOT EXISTS `{args.catalog}`.`{args.schema}`")
        print(f"Ensured schema {args.catalog}.{args.schema} exists.")

        for t in tables:
            print(f"\nMigrating {t} ...")
            cols = sqlite_columns(sconn, t)
            rows = sconn.execute(f'SELECT * FROM "{t}"').fetchall()
            rowdicts = [dict(r) for r in rows]
            migrate_table(dbc, args.catalog, args.schema, t, rowdicts, cols, dry_run=False)
    finally:
        dbc.close()

    print("\nMigration complete.")


if __name__ == "__main__":
    main()
