"""CryoSync SQLite database layer.

Replaces the former Databricks Lakebase (Postgres) adapter with a local SQLite
store so the app runs fully self-hosted with no Databricks dependency.

The rest of the backend was written against the asyncpg API (POSTGRES-style
``$1`` placeholders, ``::jsonb`` casts, ``data->>'key'`` JSON operators,
``ON CONFLICT`` upserts and ``Record`` objects that behave like dicts). To keep
that code portable we expose an asyncpg-compatible ``Pool``/``Connection`` over
``aiosqlite`` and translate the Postgres idioms we use to SQLite at execution
time (see ``_translate_sql``).

Tables use the ``(id, data)`` JSON pattern for the domain tables and plain
columns for the small relational tables (``users``, ``sessions`` etc.), exactly
as the backend already expects.
"""

import asyncio
import json
import os
import re
import sqlite3
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple

from dotenv import load_dotenv

load_dotenv()

DB_PATH = Path(os.getenv("CRYOSYNC_DB_PATH", os.getenv("DATABASE_URL", "cryosync.db")))
if str(DB_PATH).startswith("sqlite:///"):
    DB_PATH = Path(str(DB_PATH)[len("sqlite:///"):] or "cryosync.db")

_pool: "SQLitePool | None" = None
_pool_lock = asyncio.Lock()


# ---------------------------------------------------------------------------
# SQL translation (Postgres -> SQLite)
# ---------------------------------------------------------------------------

_CAST_RE = re.compile(r"::\s*(?:jsonb|json|text\[\]|text|int|bigint|smallint|numeric|decimal|boolean|float|timestamptz|timestamp|uuid)", re.IGNORECASE)

# data->>'key'  or  data->'key'  (with optional whitespace)
_JSON_GET_RE = re.compile(r"([\w.\"`]+)\s*->>\s*'([^']+)'", re.IGNORECASE)
_JSON_GET_OBJ_RE = re.compile(r"([\w.\"`]+)\s*->\s*'([^']+)'", re.IGNORECASE)


def _translate_json_ops(sql: str) -> str:
    # -> 'key' returns JSON; for SQLite we use json_extract too, but if the value
    # is stored as a JSON string we want the raw text. Most callers use ->> which
    # is handled below. Order matters: handle ->> first, then bare ->.
    sql = _JSON_GET_RE.sub("json_extract(\\1, '$.\\2')", sql)
    sql = _JSON_GET_OBJ_RE.sub("json_extract(\\1, '$.\\2')", sql)
    return sql


def _translate_on_conflict(sql: str) -> str:
    return sql.replace("EXCLUDED.", "excluded.")


def _translate_sql(sql: str) -> str:
    out = _CAST_RE.sub("", sql)
    out = _translate_json_ops(out)
    out = _translate_on_conflict(out)
    # $1, $2 -> ?1, ?2
    out = re.sub(r"\$(\d+)", r"?\1", out)
    # TRUNCATE a, b, c -> DELETE FROM each
    out = re.sub(
        r"TRUNCATE\s+(.+?)(?:\s*;)?$",
        lambda m: "; ".join(f"DELETE FROM {t.strip()}" for t in m.group(1).split(",") if t.strip()),
        out,
        flags=re.IGNORECASE,
    )
    # ANY($1::text[]) held in a WHERE ... = ANY(?N) -- expand not possible here;
    # code paths that need it use sqlite_compat helpers instead.
    return out


# ---------------------------------------------------------------------------
# Record (asyncpg-compatible row object)
# ---------------------------------------------------------------------------

class Record:
    """A row that supports attribute/key-style and positional access."""

    __slots__ = ("_data", "_keys")

    def __init__(self, keys: List[str], values: Tuple[Any, ...]):
        self._keys = keys
        self._data = {k: v for k, v in zip(keys, values)}

    def __getitem__(self, key):
        if isinstance(key, int):
            return self._data[self._keys[key]]
        return self._data[key]

    def __getattr__(self, key):
        try:
            return self._data[key]
        except KeyError:
            raise AttributeError(key)

    def get(self, key, default=None):
        return self._data.get(key, default)

    def __contains__(self, key):
        return key in self._data

    def items(self):
        return self._data.items()

    def keys(self):
        return self._keys

    def values(self):
        return tuple(self._data[k] for k in self._keys)

    def __repr__(self):
        return f"<Record {self._data}>"


# ---------------------------------------------------------------------------
# Connection / Pool
# ---------------------------------------------------------------------------

class SQLiteConnection:
    def __init__(self, db: "SQLitePool"):
        self._db = db
        self._conn = db._raw_conn()  # shared underlying connection

    async def _translate_execute(self, sql: str, args: tuple = ()) -> Tuple[sqlite3.Cursor, list]:
        sql = _translate_sql(sql)
        args = list(args)

        # Postgres "= ANY(?N)" with a Python list param -> "col IN (?, ?, ...)".
        # This is the only array comparison the backend uses (region filtering).
        any_pat = re.compile(r"([\w.\"`]+)\s*=\s*ANY\(\?(\d+)\)", re.IGNORECASE)
        while True:
            m = any_pat.search(sql)
            if not m:
                break
            idx = int(m.group(2)) - 1
            col = m.group(1)
            values = args[idx] if idx < len(args) and isinstance(args[idx], (list, tuple, set)) else None
            if values is None:
                break
            args[idx] = None  # won't be referenced again
            placeholders = ", ".join("?" for _ in values)
            sql = sql[:m.start()] + f"{col} IN ({placeholders})" + sql[m.end():]
            # list args must be flattened into the args tuple at the position
            args[idx:idx+1] = list(values)

        args = tuple(_convert_param(a) for a in args)
        cur = await asyncio.to_thread(self._conn.execute, sql, args)
        rows = cur.fetchall()
        return cur, rows

    async def execute(self, sql: str, *args):
        await self._translate_execute(sql, args)
        self._commit_if_write(sql)
        return "OK"

    def _commit_if_write(self, sql: str) -> bool:
        """Commit DML so writes are durable even if the process later exits.

        Returns True when a commit was issued so callers can avoid redundant ones.
        """
        head = _translate_sql(sql).lstrip().split(None, 1)[0].upper() if sql.strip() else ""
        if head in ("INSERT", "UPDATE", "DELETE", "REPLACE", "TRUNCATE"):
            self._conn.commit()
            return True
        return False

    async def fetch(self, sql: str, *args) -> List[Record]:
        cur, rows = await self._translate_execute(sql, args)
        cols = [d[0] for d in cur.description] if cur.description else []
        return [Record(cols, r) for r in rows]

    async def fetchrow(self, sql: str, *args) -> Optional[Record]:
        results = await self.fetch(sql, *args)
        return results[0] if results else None

    async def fetchval(self, sql: str, *args):
        row = await self.fetchrow(sql, *args)
        if row is None:
            return None
        return row[0]

    async def copy_records_to_table(self, table: str, columns: List[str], records: Iterable, batch: int = 2000):
        cols = ", ".join(columns)
        ph = ", ".join("?" for _ in columns)
        sql = f"INSERT OR REPLACE INTO {table} ({cols}) VALUES ({ph})"
        rows = list(records)
        await asyncio.to_thread(self._conn.executemany, sql, [tuple(_convert_param(v) for v in r) for r in rows])
        self._conn.commit()

    async def executemany(self, sql: str, seq: Iterable):
        rows = list(seq)
        if not rows:
            return
        await asyncio.to_thread(
            self._conn.executemany,
            sql,
            [tuple(_convert_param(v) for v in r) for r in rows],
        )
        self._conn.commit()

    async def close(self):
        pass


class SQLitePool:
    def __init__(self, path: Path):
        self._path = str(path)
        self._conn: Optional[sqlite3.Connection] = None

    def _raw_conn(self) -> sqlite3.Connection:
        if self._conn is None:
            conn = sqlite3.connect(self._path, check_same_thread=False)
            conn.row_factory = sqlite3.Row
            conn.execute("PRAGMA journal_mode=WAL")
            conn.execute("PRAGMA foreign_keys=ON")
            self._conn = conn
        return self._conn

    def acquire(self):
        """Return an object that works with both `async with` and `await`.

        Matches asyncpg's dual awaitable / async-context-manager Pool.acquire().
        """
        return _PoolAcquire(self)

    async def close(self):
        if self._conn is not None:
            await asyncio.to_thread(self._conn.close)
            self._conn = None


class _PoolAcquire:
    def __init__(self, pool: SQLitePool):
        self._pool = pool

    def __await__(self):
        async def _get():
            return SQLiteConnection(self._pool)
        return _get().__await__()

    async def __aenter__(self):
        return SQLiteConnection(self._pool)

    async def __aexit__(self, exc_type, exc, tb):
        return False


def _convert_param(value: Any) -> Any:
    if isinstance(value, (dict, list)):
        # JSONB-ish params become compact JSON strings.
        return json.dumps(value, ensure_ascii=False, default=str)
    return value


# ---------------------------------------------------------------------------
# Public API (kept identical to the old asyncpg-backed module)
# ---------------------------------------------------------------------------

async def get_pool() -> SQLitePool:
    global _pool
    async with _pool_lock:
        if _pool is None:
            _pool = SQLitePool(DB_PATH)
            await _init_schema(_pool)
            _pool._raw_conn().commit()
        return _pool


async def get_connection() -> SQLiteConnection:
    pool = await get_pool()
    return await pool.acquire()


async def close_connection(conn):
    if conn:
        try:
            await conn.close()
        except Exception:
            pass


async def close_pool():
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None


async def init_db():
    await get_pool()


# ---------------------------------------------------------------------------
# Schema
# ---------------------------------------------------------------------------

SCHEMA = [
    # --- Authentication ---
    """
    CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        email TEXT,
        display_name TEXT,
        title TEXT,
        role TEXT,
        password_hash TEXT,
        created_at TEXT,
        updated_at TEXT
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS sessions (
        token TEXT PRIMARY KEY,
        user_id TEXT,
        created_at TEXT,
        expires_at TEXT,
        FOREIGN KEY (user_id) REFERENCES users(id)
    )
    """,
    # --- Domain tables use (id, data) JSON ---
    "CREATE TABLE IF NOT EXISTS shipments (id TEXT PRIMARY KEY, shipment_number TEXT, supplier_id TEXT, supplier_name TEXT, origin TEXT, destination TEXT, facility_id TEXT, facility_name TEXT, status TEXT, category TEXT, temperature_regime TEXT, product_count INTEGER, lot_count INTEGER, received_date TEXT, scheduled_date TEXT, shipped_date TEXT, estimated_arrival TEXT, actual_arrival TEXT, receiving_technician TEXT, carrier TEXT, tracking_number TEXT, bill_of_lading TEXT, condition TEXT, chain_of_custody INTEGER, coa_attached INTEGER, priority TEXT, storage_zone TEXT, dock_to_inventory_minutes INTEGER, total_value TEXT, purchase_order_number TEXT, purchase_order_item TEXT, incoterm TEXT, transportation_mode TEXT, container_type TEXT, pallet_count INTEGER, gross_weight_kg TEXT, net_weight_kg TEXT, volume_cbm TEXT, handling_unit_count INTEGER, seal_number TEXT, dangerous_goods INTEGER, un_number TEXT, proper_shipping_name TEXT, dg_class TEXT, notes TEXT, created_at TEXT, updated_at TEXT, temperature_readings TEXT, loggers TEXT, receiving_checklist TEXT, disposition TEXT)",
    "CREATE TABLE IF NOT EXISTS inventory_lots (id TEXT PRIMARY KEY, data TEXT, product_id TEXT, lot_number TEXT, quantity REAL, status TEXT, expiry_date TEXT, storage_zone TEXT, created_at TEXT)",
    "CREATE TABLE IF NOT EXISTS compliance_incidents (id TEXT PRIMARY KEY, data TEXT, entity_type TEXT, entity_id TEXT, status TEXT, severity TEXT, deviation_type TEXT, created_at TEXT)",
    "CREATE TABLE IF NOT EXISTS storage_zones (id TEXT PRIMARY KEY, data TEXT, name TEXT, facility_id TEXT, capacity REAL, utilized REAL, zone_type TEXT)",
    "CREATE TABLE IF NOT EXISTS suppliers (id TEXT PRIMARY KEY, data TEXT, name TEXT, region TEXT, qualification_status TEXT)",
    "CREATE TABLE IF NOT EXISTS products (id TEXT PRIMARY KEY, data TEXT, name TEXT, category TEXT, supplier_id TEXT)",
    "CREATE TABLE IF NOT EXISTS facilities (id TEXT PRIMARY KEY, data TEXT, name TEXT, region TEXT)",
    "CREATE TABLE IF NOT EXISTS system_logs (id TEXT PRIMARY KEY, level TEXT, service TEXT, message TEXT, timestamp TEXT, metadata TEXT)",
    "CREATE TABLE IF NOT EXISTS genie_conversations (id TEXT PRIMARY KEY, user_id TEXT, title TEXT, mode TEXT, messages TEXT, created_at TEXT, updated_at TEXT)",
    # --- Lab reports (flexible, JSON-backed metadata) ---
    """
    CREATE TABLE IF NOT EXISTS lab_test_reports (
        id TEXT PRIMARY KEY,
        report_id TEXT,
        unit_number TEXT,
        cord_blood_unit_id TEXT,
        sample_reference TEXT,
        test_type TEXT,
        test_name TEXT,
        test_method TEXT,
        instrument TEXT,
        performed_at TEXT,
        performed_by TEXT,
        result_value TEXT,
        result_unit TEXT,
        result_text TEXT,
        reference_low TEXT,
        reference_high TEXT,
        reference_text TEXT,
        status TEXT,
        reviewed_by TEXT,
        reviewed_at TEXT,
        review_notes TEXT,
        batch_id TEXT,
        source_filename TEXT,
        source_row INTEGER,
        details TEXT,
        created_at TEXT,
        updated_at TEXT
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS csv_import_batches (
        id TEXT PRIMARY KEY,
        batch_id TEXT,
        filename TEXT,
        file_size_bytes INTEGER,
        imported_by TEXT,
        total_rows INTEGER,
        successful_rows INTEGER,
        failed_rows INTEGER,
        status TEXT,
        error_summary TEXT,
        started_at TEXT,
        completed_at TEXT,
        metadata TEXT
    )
    """,
    # --- Cord blood bank enterprise model ---------------------------------
    # Families / clients (primary contact for a cord blood banking contract)
    """
    CREATE TABLE IF NOT EXISTS families (
        id TEXT PRIMARY KEY,
        crm_id TEXT UNIQUE,
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL,
        email TEXT,
        phone TEXT,
        address TEXT,
        date_of_birth TEXT,
        medical_history TEXT,
        created_at TEXT,
        updated_at TEXT,
        synced_at TEXT,
        sync_status TEXT DEFAULT 'pending'
    )
    """,
    # Enrollments (contract / payment plan tying a family to a storage plan)
    """
    CREATE TABLE IF NOT EXISTS enrollments (
        id TEXT PRIMARY KEY,
        enrollment_number TEXT UNIQUE,
        family_id TEXT,
        plan_type TEXT,
        processing_method TEXT DEFAULT 'standard_cell',
        storage_plan TEXT DEFAULT 'annual',
        status TEXT DEFAULT 'pending',
        contract_signed_at TEXT,
        payment_plan TEXT,
        total_amount REAL,
        amount_paid REAL DEFAULT 0,
        expected_due_date TEXT,
        hospital_id TEXT,
        sales_rep_id TEXT,
        referral_code TEXT,
        special_programs TEXT,
        metadata TEXT,
        created_at TEXT,
        updated_at TEXT,
        synced_at TEXT,
        sync_status TEXT DEFAULT 'pending',
        FOREIGN KEY (family_id) REFERENCES families(id)
    )
    """,
    # Collection kits shipped out to hospitals for collection
    """
    CREATE TABLE IF NOT EXISTS collection_kits (
        id TEXT PRIMARY KEY,
        kit_number TEXT UNIQUE,
        enrollment_id TEXT,
        barcode TEXT UNIQUE,
        qr_code TEXT,
        anticoagulant TEXT DEFAULT 'CPD',
        gel_pack_count INTEGER DEFAULT 2,
        shipped_at TEXT,
        delivered_at TEXT,
        received_at_hospital TEXT,
        collected_at TEXT,
        collector_name TEXT,
        collector_credentials TEXT,
        hospital_name TEXT,
        hospital_address TEXT,
        delivery_courier TEXT,
        tracking_number TEXT,
        temperature_log TEXT,
        status TEXT NOT NULL DEFAULT 'kit_shipped',
        rejection_reason TEXT,
        metadata TEXT,
        created_at TEXT,
        updated_at TEXT,
        FOREIGN KEY (enrollment_id) REFERENCES enrollments(id)
    )
    """,
    # Cord blood units (the core product) - full professional profile
    """
    CREATE TABLE IF NOT EXISTS cord_blood_units (
        id TEXT PRIMARY KEY,
        unit_number TEXT UNIQUE,
        enrollment_id TEXT,
        collection_kit_id TEXT,
        collect_accession TEXT,
        collected_at TEXT,
        collection_volume_ml REAL,
        collection_weight_g REAL,
        maternal_blood_collected INTEGER DEFAULT 0,
        delayed_clamping INTEGER DEFAULT 0,
        delayed_clamping_duration_min INTEGER,
        processing_method TEXT,
        processing_started_at TEXT,
        processing_completed_at TEXT,
        processed_by TEXT,
        equipment_used TEXT,
        processing_technician_id TEXT,
        pre_process_tnc INTEGER,
        post_process_tnc INTEGER,
        tnc_recovery_pct REAL,
        pre_process_cd34 INTEGER,
        post_process_cd34 INTEGER,
        cd34_recovery_pct REAL,
        viability_pct REAL,
        volume_ml REAL,
        rbc_depletion_pct REAL,
        plasma_depletion_pct REAL,
        storage_bag_type TEXT DEFAULT 'five_chamber',
        storage_bag_barcode TEXT,
        storage_location TEXT,
        cryopreserved_at TEXT,
        storage_status TEXT DEFAULT 'cryopreserved',
        storage_tank_id TEXT,
        storage_temperature_c REAL DEFAULT -196.0,
        hla_typing TEXT,
        abo_rh TEXT,
        infectious_disease_results TEXT,
        sterility_result TEXT,
        cfu_result REAL,
        fact_compliant INTEGER DEFAULT 1,
        aabb_compliant INTEGER DEFAULT 1,
        fda_licensed INTEGER DEFAULT 1,
        cgmp_compliant INTEGER DEFAULT 1,
        transplant_count INTEGER DEFAULT 0,
        last_transplant_at TEXT,
        public_bank_access INTEGER DEFAULT 0,
        public_bank_listed_at TEXT,
        nmdp_id TEXT,
        notes TEXT,
        metadata TEXT,
        created_at TEXT,
        updated_at TEXT,
        FOREIGN KEY (enrollment_id) REFERENCES enrollments(id),
        FOREIGN KEY (collection_kit_id) REFERENCES collection_kits(id)
    )
    """,
    # Transplant / clinical release records
    """
    CREATE TABLE IF NOT EXISTS transplant_records (
        id TEXT PRIMARY KEY,
        transplant_number TEXT UNIQUE,
        cord_blood_unit_id TEXT,
        enrollment_id TEXT,
        patient_id TEXT,
        transplant_center TEXT,
        transplant_center_id TEXT,
        physician_name TEXT,
        diagnosis TEXT,
        indication TEXT,
        requested_at TEXT,
        matched_at TEXT,
        hla_match_score REAL,
        hla_match_details TEXT,
        shipped_at TEXT,
        shipping_courier TEXT,
        shipping_tracking TEXT,
        shipping_temperature_log TEXT,
        delivered_at TEXT,
        thawed_at TEXT,
        infused_at TEXT,
        infused_volume_ml REAL,
        infused_tnc INTEGER,
        infused_cd34 INTEGER,
        post_thaw_viability_pct REAL,
        post_thaw_cfu INTEGER,
        engraftment_at TEXT,
        engraftment_type TEXT,
        status TEXT NOT NULL DEFAULT 'requested',
        outcome_notes TEXT,
        follow_up_schedule TEXT,
        metadata TEXT,
        created_at TEXT,
        updated_at TEXT,
        FOREIGN KEY (cord_blood_unit_id) REFERENCES cord_blood_units(id),
        FOREIGN KEY (enrollment_id) REFERENCES enrollments(id)
    )
    """,
    # Storage tanks & their IoT temperature logs
    """
    CREATE TABLE IF NOT EXISTS storage_tanks (
        id TEXT PRIMARY KEY,
        tank_id TEXT UNIQUE,
        facility TEXT NOT NULL,
        tank_type TEXT DEFAULT 'vapor_phase_ln2',
        capacity_units INTEGER,
        current_units INTEGER DEFAULT 0,
        temperature_c REAL DEFAULT -196.0,
        ln2_level_pct REAL,
        status TEXT DEFAULT 'active',
        last_inspection_at TEXT,
        next_inspection_at TEXT,
        monitoring_enabled INTEGER DEFAULT 1,
        alarm_thresholds TEXT,
        metadata TEXT,
        created_at TEXT,
        updated_at TEXT
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS tank_temperature_logs (
        id TEXT PRIMARY KEY,
        tank_id TEXT,
        recorded_at TEXT NOT NULL,
        temperature_c REAL NOT NULL,
        ln2_level_pct REAL,
        sensor_id TEXT,
        alert_triggered INTEGER DEFAULT 0,
        alert_type TEXT,
        created_at TEXT,
        FOREIGN KEY (tank_id) REFERENCES storage_tanks(id)
    )
    """,
    # Payments / plan transactions
    """
    CREATE TABLE IF NOT EXISTS payment_transactions (
        id TEXT PRIMARY KEY,
        txn_number TEXT,
        family_id TEXT,
        plan_type TEXT,
        amount REAL,
        method TEXT,
        status TEXT,
        milestone TEXT,
        paid_at TEXT,
        created_at TEXT,
        updated_at TEXT,
        FOREIGN KEY (family_id) REFERENCES families(id)
    )
    """,
    # Referral partner sources
    """
    CREATE TABLE IF NOT EXISTS referral_sources (
        id TEXT PRIMARY KEY,
        source_name TEXT,
        source_type TEXT,
        region TEXT,
        contact TEXT,
        referrals INTEGER DEFAULT 0,
        conversions INTEGER DEFAULT 0,
        revenue REAL DEFAULT 0,
        status TEXT,
        created_at TEXT,
        updated_at TEXT
    )
    """,
    # Collection branches (franchisees)
    """
    CREATE TABLE IF NOT EXISTS branches (
        id TEXT PRIMARY KEY,
        branch_number TEXT,
        name TEXT,
        manager TEXT,
        region TEXT,
        status TEXT,
        collections INTEGER DEFAULT 0,
        quality_score REAL,
        accreditation TEXT,
        last_audit TEXT,
        next_audit TEXT,
        staff INTEGER DEFAULT 0,
        readiness INTEGER DEFAULT 0,
        created_at TEXT,
        updated_at TEXT
    )
    """,
    # Knowledge-base content documents
    """
    CREATE TABLE IF NOT EXISTS content_documents (
        id TEXT PRIMARY KEY,
        doc_number TEXT,
        title TEXT,
        content_type TEXT,
        status TEXT,
        author TEXT,
        version TEXT,
        updated_at TEXT,
        views INTEGER DEFAULT 0,
        downloads INTEGER DEFAULT 0,
        shares INTEGER DEFAULT 0,
        language TEXT,
        created_at TEXT
    )
    """,
]


async def _init_schema(pool: SQLitePool):
    conn = pool._raw_conn()
    for stmt in SCHEMA:
        await asyncio.to_thread(conn.execute, stmt)
    # Additive runtime-link columns for JSON-backed domain tables. These add
    # relational handles (FKs, lookups, joins) on top of the flexible `data`
    # blob without breaking the existing read paths that parse `data`.
    # Idempotent: each column is added only if missing.
    _MIGRATION_COLUMNS = {
        "inventory_lots": [
            ("product_id", "TEXT"), ("lot_number", "TEXT"), ("quantity", "REAL"),
            ("status", "TEXT"), ("expiry_date", "TEXT"), ("storage_zone", "TEXT"),
            ("created_at", "TEXT"),
        ],
        "compliance_incidents": [
            ("entity_type", "TEXT"), ("entity_id", "TEXT"), ("status", "TEXT"),
            ("severity", "TEXT"), ("deviation_type", "TEXT"), ("created_at", "TEXT"),
        ],
        "storage_zones": [
            ("name", "TEXT"), ("facility_id", "TEXT"), ("capacity", "REAL"),
            ("utilized", "REAL"), ("zone_type", "TEXT"),
        ],
        "suppliers": [("name", "TEXT"), ("region", "TEXT"), ("qualification_status", "TEXT")],
        "products": [("name", "TEXT"), ("category", "TEXT"), ("supplier_id", "TEXT")],
        "facilities": [("name", "TEXT"), ("region", "TEXT")],
    }
    for table, cols in _MIGRATION_COLUMNS.items():
        try:
            existing = {
                r[1] for r in conn.execute(f"PRAGMA table_info({table})").fetchall()
            }
        except sqlite3.Error:
            continue
        for name, decl in cols:
            if name not in existing:
                try:
                    await asyncio.to_thread(
                        conn.execute, f"ALTER TABLE {table} ADD COLUMN {name} {decl}"
                    )
                except sqlite3.Error:
                    pass


# ---------------------------------------------------------------------------
# Schema discovery / preview (was information_schema + pg_total_relation_size)
# ---------------------------------------------------------------------------

_SKIP_TABLES = {
    "sqlite_sequence",
}


def _table_row_count(conn: sqlite3.Connection, name: str) -> int:
    try:
        return conn.execute(f"SELECT count(*) FROM \"{name}\"").fetchone()[0] or 0
    except sqlite3.Error:
        return 0


def _table_size(conn: sqlite3.Connection, name: str) -> int:
    try:
        row = conn.execute("SELECT SUM(pgsize) FROM dbstat WHERE name = ?", (name,)).fetchone()
        return int(row[0] or 0) if row else 0
    except sqlite3.Error:
        return 0


async def discover_tables() -> List[Dict[str, Any]]:
    conn = (await get_pool())._raw_conn()
    rows = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    ).fetchall()
    tables = []
    for r in rows:
        name = r[0]
        if name in _SKIP_TABLES or name in {"system_logs", "genie_conversations", "csv_import_batches", "lab_test_reports", "cord_blood_units"}:
            continue
        try:
            cols = conn.execute(f"PRAGMA table_info(\"{name}\")").fetchall()
        except sqlite3.Error:
            continue
        schema = [{"name": c[1], "type": c[2], "nullable": not bool(c[3]), "description": ""} for c in cols]
        tables.append({
            "id": name,
            "name": name,
            "description": f"Table `{name}` with {_table_row_count(conn, name):,} rows across {len(schema)} columns.",
            "schema": schema,
            "rowCount": _table_row_count(conn, name),
            "sizeBytes": _table_size(conn, name),
            "format": "sqlite",
            "location": f"sqlite://{DB_PATH}",
            "tags": ["operations", "core"] if name in {"shipments", "inventory_lots", "storage_zones", "compliance_incidents", "suppliers", "products", "facilities"} else ["lake"],
            "createdAt": "",
            "updatedAt": "",
        })
    return tables


async def get_table_preview(table_id: str) -> Dict[str, Any]:
    conn = (await get_pool())._raw_conn()
    name = table_id
    cols = conn.execute(f"PRAGMA table_info(\"{name}\")").fetchall()
    columns = [c[1] for c in cols]
    rows = conn.execute(f"SELECT * FROM \"{name}\" LIMIT 10").fetchall()
    data_rows = [dict(zip(columns, r)) for r in rows]
    total_rows = _table_row_count(conn, name)
    return {"columns": columns, "rows": data_rows, "totalRows": total_rows}


# ---------------------------------------------------------------------------
# Backend switch:  CRYOSYNC_DB_BACKEND=databricks  routes the public API to the
# Databricks SQL adapter (database_databricks) so the whole app operates on
# Databricks with no SQLite.  Anything else keeps the local SQLite store.
# ---------------------------------------------------------------------------
_USE_DATABRICKS = os.getenv("CRYOSYNC_DB_BACKEND", "").strip().lower() == "databricks"

if _USE_DATABRICKS:
    from database_databricks import (  # noqa: F401
        get_pool,
        get_connection,
        close_connection,
        close_pool,
        init_db,
        discover_tables,
        get_table_preview,
        Record,
    )
