"""CryoSync database layer against a Databricks Lakebase Postgres database.

Authentication uses a short-lived database credential that Databricks mints
per identity (`POST /api/2.0/postgres/credentials` for a given endpoint
resource `projects/.../branches/.../endpoints/...`). The token expires after
~1 hour, so this module mints a fresh credential and transparently rebuilds
the connection pool before the current token expires - no manual JWT rotation
required. A static password (DATABRICKS_DB_PASSWORD) is also supported as an
escape hatch; set it and no rotation happens.
"""

import asyncio
import os
import time
from datetime import datetime, timezone
from urllib.parse import quote_plus

import asyncpg
import httpx
from dotenv import load_dotenv

from databricks_auth import get_bearer_token, workspace_host

load_dotenv()

DB_USER = os.getenv("DATABRICKS_DB_USER", "thasneem.moosa@abilytics.com")
DB_HOST = os.getenv(
    "DATABRICKS_DB_HOST",
    "ep-bitter-frog-d8048hup.database.us-east-2.cloud.databricks.com",
)
DB_PORT = int(os.getenv("DATABRICKS_DB_PORT", "5432"))
DB_NAME = os.getenv("DATABRICKS_DB_NAME", "proreactapp")

# Optional: full Lakebase endpoint resource name, e.g.
# "projects/proreact/branches/production/endpoints/primary". When empty it is
# auto-discovered from the /api/2.0/postgres API by matching DB_HOST.
DB_ENDPOINT = (os.getenv("DATABRICKS_DB_ENDPOINT") or "").strip() or None

# Optional static password. When set, token minting and rotation are skipped.
STATIC_DB_PASSWORD = os.getenv("DATABRICKS_DB_PASSWORD") or None

# 5 minutes before expiry we consider a credential/pool stale.
ROTATION_MARGIN_S = 300

_credential: dict | None = None
_credential_lock = asyncio.Lock()
_pool_lock = asyncio.Lock()

pool: asyncpg.Pool | None = None
_pool_expires_at: float = 0.0


def _parse_expiration_time(value) -> float:
    try:
        dt = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        return dt.timestamp()
    except (TypeError, ValueError):
        return time.time() + 3600


async def _discover_endpoint(host: str) -> str:
    """Find the Lakebase endpoint resource whose host matches DB_HOST."""
    headers = {"Authorization": f"Bearer {await get_bearer_token()}"}
    base = f"https://{host}/api/2.0/postgres"
    target = DB_HOST.split(":")[0]
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.get(f"{base}/projects", headers=headers)
        if r.status_code != 200:
            raise RuntimeError(
                f"Databricks Lakebase project lookup failed (HTTP {r.status_code}): "
                f"{r.text[:300]}"
            )
        for proj in r.json().get("projects", []):
            project_id = proj.get("project_id") or proj["name"].split("/")[-1]
            rb = await client.get(f"{base}/projects/{project_id}/branches", headers=headers)
            for br in rb.json().get("branches", []) if rb.status_code == 200 else []:
                branch_id = br.get("branch_id") or br["name"].split("/")[-1]
                re = await client.get(
                    f"{base}/projects/{project_id}/branches/{branch_id}/endpoints",
                    headers=headers,
                )
                for ep in re.json().get("endpoints", []) if re.status_code == 200 else []:
                    hosts = (ep.get("status") or {}).get("hosts") or {}
                    hostname = hosts.get("host") or ""
                    if hostname and target in hostname:
                        endpoint_id = ep.get("endpoint_id") or ep["name"].split("/")[-1]
                        return f"projects/{project_id}/branches/{branch_id}/endpoints/{endpoint_id}"
    raise RuntimeError(
        "Could not auto-discover the Databricks Lakebase endpoint. "
        "Set DATABRICKS_DB_ENDPOINT (e.g. projects/<project>/branches/<branch>/endpoints/<endpoint>) "
        "in backend/.env - find it via the Connect dialog in the Lakebase console."
    )


async def _mint_db_credential() -> tuple[str, float]:
    """Mint a fresh database credential token for the current identity."""
    host = workspace_host()
    headers = {"Authorization": f"Bearer {await get_bearer_token()}"}
    endpoint = DB_ENDPOINT or await _discover_endpoint(host)
    url = f"https://{host}/api/2.0/postgres/credentials"
    body = {"endpoint": endpoint}
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(url, headers=headers, json=body)
    if resp.status_code != 200:
        raise RuntimeError(
            f"Databricks database credential request failed (HTTP {resp.status_code}): "
            f"{resp.text[:300]}"
        )
    data = resp.json()
    token = data.get("token")
    if not token:
        raise RuntimeError("Databricks database credential response did not include a token")
    return token, _parse_expiration_time(data.get("expiration_time"))


async def _db_password() -> str:
    """Return the current DB password, minting a fresh credential when stale."""
    if STATIC_DB_PASSWORD:
        return STATIC_DB_PASSWORD
    global _credential
    async with _credential_lock:
        if not _credential or _credential["expires_at"] < time.time() + ROTATION_MARGIN_S:
            token, expires_at = await _mint_db_credential()
            _credential = {"token": token, "expires_at": expires_at}
            print(f"  Minted fresh Databricks DB credential (valid ~{(expires_at - time.time()) / 60:.0f} min)")
        return _credential["token"]


def build_dsn(password: str) -> str:
    encoded_password = quote_plus(password)
    encoded_user = quote_plus(DB_USER)
    return f"postgresql://{encoded_user}:{encoded_password}@{DB_HOST}:{DB_PORT}/{DB_NAME}?sslmode=require"


async def get_pool() -> asyncpg.Pool:
    """Return a pool whose connections all use a non-expiring password.

    Because Databricks enforces token expiry only at login, existing
    connections keep working, but the pool is rebuilt from a fresh token
    before the token used to build it expires.
    """
    global pool, _pool_expires_at
    async with _pool_lock:
        stale = pool is None or _pool_expires_at < time.time() + ROTATION_MARGIN_S
        if not stale:
            return pool

        if pool is not None:
            try:
                await pool.close()
            except Exception:
                pass
            pool = None

        password = await _db_password()
        pool = await asyncpg.create_pool(
            build_dsn(password), min_size=1, max_size=10, command_timeout=30
        )
        _pool_expires_at = (
            _credential["expires_at"] if _credential else time.time() + 3600 * 24 * 365
        )
        return pool


async def close_pool():
    global pool, _pool_expires_at
    async with _pool_lock:
        if pool:
            await pool.close()
            pool = None
        _pool_expires_at = 0.0

CREATE_TABLES_SQL = """
CREATE TABLE IF NOT EXISTS shipments (
    id TEXT PRIMARY KEY,
    shipment_number TEXT NOT NULL,
    supplier_id TEXT NOT NULL DEFAULT '',
    supplier_name TEXT NOT NULL DEFAULT '',
    origin TEXT NOT NULL DEFAULT '',
    destination TEXT NOT NULL DEFAULT '',
    facility_id TEXT NOT NULL DEFAULT '',
    facility_name TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'scheduled',
    category TEXT NOT NULL DEFAULT '',
    temperature_regime TEXT NOT NULL DEFAULT '',
    product_count INTEGER NOT NULL DEFAULT 0,
    lot_count INTEGER NOT NULL DEFAULT 0,
    received_date TEXT NOT NULL DEFAULT '',
    scheduled_date TEXT NOT NULL DEFAULT '',
    shipped_date TEXT NOT NULL DEFAULT '',
    estimated_arrival TEXT NOT NULL DEFAULT '',
    actual_arrival TEXT,
    receiving_technician TEXT NOT NULL DEFAULT '',
    carrier TEXT NOT NULL DEFAULT '',
    tracking_number TEXT NOT NULL DEFAULT '',
    bill_of_lading TEXT NOT NULL DEFAULT '',
    condition TEXT NOT NULL DEFAULT 'good',
    chain_of_custody BOOLEAN NOT NULL DEFAULT FALSE,
    coa_attached BOOLEAN NOT NULL DEFAULT FALSE,
    priority TEXT NOT NULL DEFAULT 'standard',
    storage_zone TEXT NOT NULL DEFAULT '',
    dock_to_inventory_minutes INTEGER NOT NULL DEFAULT 0,
    total_value REAL NOT NULL DEFAULT 0,
    purchase_order_number TEXT NOT NULL DEFAULT '',
    purchase_order_item TEXT NOT NULL DEFAULT '',
    incoterm TEXT NOT NULL DEFAULT '',
    transportation_mode TEXT NOT NULL DEFAULT 'ground',
    container_type TEXT NOT NULL DEFAULT '',
    pallet_count INTEGER NOT NULL DEFAULT 0,
    gross_weight_kg REAL NOT NULL DEFAULT 0,
    net_weight_kg REAL NOT NULL DEFAULT 0,
    volume_cbm REAL NOT NULL DEFAULT 0,
    handling_unit_count INTEGER NOT NULL DEFAULT 0,
    seal_number TEXT NOT NULL DEFAULT '',
    dangerous_goods BOOLEAN NOT NULL DEFAULT FALSE,
    un_number TEXT NOT NULL DEFAULT '',
    proper_shipping_name TEXT NOT NULL DEFAULT '',
    dg_class TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    temperature_readings JSONB NOT NULL DEFAULT '[]'::jsonb,
    loggers JSONB NOT NULL DEFAULT '[]'::jsonb,
    receiving_checklist JSONB NOT NULL DEFAULT '{}'::jsonb,
    disposition JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS inventory_lots (
    id TEXT PRIMARY KEY,
    data JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS storage_zones (
    id TEXT PRIMARY KEY,
    data JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS compliance_incidents (
    id TEXT PRIMARY KEY,
    data JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS genie_conversations (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL DEFAULT '',
    title TEXT NOT NULL DEFAULT 'New Conversation',
    mode TEXT NOT NULL DEFAULT 'chat',
    messages JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    email TEXT NOT NULL DEFAULT '',
    display_name TEXT NOT NULL DEFAULT '',
    title TEXT NOT NULL DEFAULT '',
    role TEXT NOT NULL DEFAULT 'dock',
    password_hash TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT '',
    expires_at TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS suppliers (
    id TEXT PRIMARY KEY,
    data JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    data JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS facilities (
    id TEXT PRIMARY KEY,
    data JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS lakebase_tables (
    id TEXT PRIMARY KEY,
    data JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS deltalake_tables (
    id TEXT PRIMARY KEY,
    data JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS system_logs (
    id TEXT PRIMARY KEY,
    level TEXT NOT NULL DEFAULT 'info',
    service TEXT NOT NULL DEFAULT '',
    message TEXT NOT NULL DEFAULT '',
    timestamp TEXT NOT NULL DEFAULT '',
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);
"""

async def init_db():
    p = await get_pool()
    async with p.acquire() as conn:
        for stmt in CREATE_TABLES_SQL.split(";"):
            stmt = stmt.strip()
            if stmt:
                try:
                    await conn.execute(stmt)
                except Exception as e:
                    print(f"  Table init warning: {e}")
        try:
            col = await conn.fetchval(
                "SELECT 1 FROM information_schema.columns "
                "WHERE table_schema = 'public' AND table_name = 'genie_conversations' "
                "AND column_name = 'mode'"
            )
            if not col:
                await conn.execute(
                    "ALTER TABLE genie_conversations ADD COLUMN mode TEXT NOT NULL DEFAULT 'chat'"
                )
                print("  Added genie_conversations.mode column")
        except Exception as e:
            print(f"  Mode column migration warning: {e}")
        try:
            col = await conn.fetchval(
                "SELECT 1 FROM information_schema.columns "
                "WHERE table_schema = 'public' AND table_name = 'genie_conversations' "
                "AND column_name = 'user_id'"
            )
            if not col:
                await conn.execute(
                    "ALTER TABLE genie_conversations ADD COLUMN user_id TEXT NOT NULL DEFAULT ''"
                )
                print("  Added genie_conversations.user_id column")
        except Exception as e:
            print(f"  user_id column migration warning: {e}")
        try:
            col = await conn.fetchval(
                "SELECT 1 FROM information_schema.columns "
                "WHERE table_schema = 'public' AND table_name = 'shipments' "
                "AND column_name = 'loggers'"
            )
            if not col:
                await conn.execute(
                    "ALTER TABLE shipments ADD COLUMN loggers JSONB NOT NULL DEFAULT '[]'::jsonb"
                )
                print("  Added shipments.loggers column")
        except Exception as e:
            print(f"  Loggers column migration warning: {e}")
        try:
            col = await conn.fetchval(
                "SELECT 1 FROM information_schema.columns "
                "WHERE table_schema = 'public' AND table_name = 'shipments' "
                "AND column_name = 'receiving_checklist'"
            )
            if not col:
                await conn.execute(
                    "ALTER TABLE shipments ADD COLUMN receiving_checklist JSONB NOT NULL DEFAULT '{}'::jsonb"
                )
                print("  Added shipments.receiving_checklist column")
        except Exception as e:
            print(f"  Receiving checklist column migration warning: {e}")
        try:
            col = await conn.fetchval(
                "SELECT 1 FROM information_schema.columns "
                "WHERE table_schema = 'public' AND table_name = 'shipments' "
                "AND column_name = 'disposition'"
            )
            if not col:
                await conn.execute(
                    "ALTER TABLE shipments ADD COLUMN disposition JSONB NOT NULL DEFAULT '{}'::jsonb"
                )
                print("  Added shipments.disposition column")
        except Exception as e:
            print(f"  Disposition column migration warning: {e}")
        print("Database tables initialized")
