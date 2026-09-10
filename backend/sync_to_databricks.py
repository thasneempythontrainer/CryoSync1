"""
Incremental sync: push new / updated CryoSync SQLite rows to Databricks Bronze.

Use this after the initial full load (migrate_to_databricks.py) to keep Bronze
current as the on-prem SQLite store keeps receiving uploads (lab reports, etc.).

Behavior (per table):
  * Reads the current max(updated_at) synced previously from a watermark table
    cryosync_catalog.bronze.sync_watermark.
  * SELECTs rows with updated_at > watermark.
  * Upserts them into the Bronze Delta table keyed on the primary key.

Environment variables: DATABRICKS_HOST, DATABRICKS_HTTP_PATH, DATABRICKS_TOKEN,
DATABRICKS_CATALOG, DATABRICKS_BRONZE_SCHEMA.

Usage:
    python sync_to_databricks.py                # sync all tables
    python sync_to_databricks.py --table lab_test_reports
    python sync_to_databricks.py --full         # reset watermarks, full re-merge
"""
import argparse
import json
import os
import sqlite3
import sys
from datetime import datetime

from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

from databricks import sql as dbsql

CATALOG = os.getenv("DATABRICKS_CATALOG", "cryosync_catalog")
SCHEMA = os.getenv("DATABRICKS_BRONZE_SCHEMA", "bronze")

# Tables that have an updated_at column we can watermark on.
UPDATE_TRACKED = [
    "users", "shipments", "families", "enrollments", "collection_kits",
    "cord_blood_units", "lab_test_reports", "transplant_records",
    "storage_tanks", "payment_transactions", "referral_sources", "branches",
    "content_documents", "compliance_incidents", "inventory_lots",
]
# Append-only tables: just insert everything newer than watermark by created_at.
APPEND_ONLY = ["sessions", "tank_temperature_logs", "system_logs", "csv_import_batches"]


def ts_now():
    return datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")


def exec_commit(conn, sql, params=None):
    with conn.cursor() as cur:
        cur.execute(sql, params or [])
    conn.commit()


def get_watermark(conn, table):
    try:
        with conn.cursor() as cur:
            cur.execute(
                f"SELECT watermark FROM `{CATALOG}`.`{SCHEMA}`.sync_watermark WHERE table_name = ?",
                (table,),
            )
            row = cur.fetchone()
        return row[0] if row else None
    except Exception:
        return None


def set_watermark(conn, table, ts):
    with conn.cursor() as cur:
        cur.execute(
            f"""
            MERGE INTO `{CATALOG}`.`{SCHEMA}`.sync_watermark AS w
            USING (SELECT ? AS table_name, ? AS watermark) AS s
            ON w.table_name = s.table_name
            WHEN MATCHED THEN UPDATE SET watermark = s.watermark
            WHEN NOT MATCHED THEN INSERT (table_name, watermark) VALUES (s.table_name, s.watermark)
            """,
            (table, ts),
        )
    conn.commit()


def migrate_table(conn, sconn, table, ds, full, dry_run):
    cols = [(c[1], (c[2] or "TEXT").upper()) for c in sconn.execute(f'PRAGMA table_info("{table}")')]
    names = [name for name, _ in cols]
    if "id" not in names:
        return 0

    wm_col = "updated_at" if table in UPDATE_TRACKED else ("created_at" if table in APPEND_ONLY else None)
    watermark = None if full else (get_watermark(conn, table) if wm_col else None)

    if watermark:
        # Text ISO times compare lexicographically if stored consistently.
        rows = sconn.execute(
            f'SELECT * FROM "{table}" WHERE {wm_col} IS NOT NULL AND {wm_col} > ?', (watermark,)
        ).fetchall()
    else:
        rows = sconn.execute(f'SELECT * FROM "{table}"').fetchall()
    rows = [dict(r) for r in rows]
    if not rows:
        return 0

    if dry_run:
        print(f"  [dry-run] would upsert {len(rows)} rows into {table}")
        return len(rows)

    quoted = ", ".join(f'`{c}`' for c in names)
    placeholders = ", ".join(["?"] * len(names))
    update_target = ", ".join(f'`{c}` = s.`{c}`' for c in names if c != "id")

    with conn.cursor() as cur:
        for r in rows:
            row = [json.dumps(v) if isinstance(v, (dict, list)) else v for v in [r.get(c) for c in names]]
            col_src = ", ".join(f"s.`{c}`" for c in names)
            # Using VALUES (?, ?, ...) with positional params for each column.
            cur.execute(
                f"MERGE INTO `{CATALOG}`.`{SCHEMA}`.`{table}` AS t "
                f"USING (VALUES ({placeholders})) AS s ({quoted}) "
                f"ON t.`id` = s.`id` "
                f"WHEN MATCHED THEN UPDATE SET {update_target} "
                f"WHEN NOT MATCHED THEN INSERT ({quoted}) VALUES ({col_src})",
                row,
            )
    conn.commit()

    if wm_col and rows:
        max_ts = max((r.get(wm_col) for r in rows if r.get(wm_col)), default=None)
        if max_ts:
            set_watermark(conn, table, max_ts)
    return len(rows)


def main():
    parser = argparse.ArgumentParser(description="Incremental sync CryoSync SQLite -> Databricks Bronze")
    parser.add_argument("--db", default=os.path.join(os.path.dirname(__file__), "cryosync.db"))
    parser.add_argument("--table", help="Sync only this table")
    parser.add_argument("--full", action="store_true", help="Reset watermark and merge everything")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    host = os.getenv("DATABRICKS_HOST", "").replace("https://", "").rstrip("/")
    http_path = os.getenv("DATABRICKS_HTTP_PATH")
    token = os.getenv("DATABRICKS_TOKEN")
    if not (host and http_path and token):
        print("ERROR: DATABRICKS_HOST, DATABRICKS_HTTP_PATH and DATABRICKS_TOKEN must be set.", file=sys.stderr)
        sys.exit(1)

    sconn = sqlite3.connect(args.db)
    sconn.row_factory = sqlite3.Row
    candidates = (UPDATE_TRACKED + APPEND_ONLY) if not args.table else [args.table]
    present = {r[0] for r in sconn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    tables = [t for t in candidates if t in present]
    if not tables:
        print("No tables to sync.", file=sys.stderr)
        sys.exit(1)

    if args.dry_run:
        print(f"Dry run: would connect to {host} and upsert changes since last watermark:")
        for t in tables:
            cols = [(c[1], (c[2] or "TEXT").upper()) for c in sconn.execute(f'PRAGMA table_info("{t}")')]
            if "id" not in [c for c, _ in cols]:
                continue
            n = sconn.execute(f'SELECT count(*) FROM "{t}"').fetchone()[0]
            print(f"  {t}: {n} rows")
        return

    conn = dbsql.connect(server_hostname=host, http_path=http_path, access_token=token)
    try:
        exec_commit(conn, f"CREATE TABLE IF NOT EXISTS `{CATALOG}`.`{SCHEMA}`.sync_watermark (table_name STRING PRIMARY KEY, watermark STRING)")
        total = 0
        for t in tables:
            n = migrate_table(conn, sconn, t, args.db, args.full, False)
            total += n
            print(f"{t}: {n} rows")
        print(f"Total synced: {total}")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
