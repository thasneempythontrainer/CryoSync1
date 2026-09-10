"""CryoSync Databricks database layer.

Implements the same asyncpg-compatible Pool/Connection API as ``database.py``
(the SQLite adapter) but talks to a Databricks SQL warehouse instead. Every
existing backend module (``main.py``, ``auth.py``, ``seed.py``,
``lab_reports.py``) keeps working unchanged because it only uses the common
surface:

    get_pool(), get_connection(), init_db(), close_pool()
    Pool.acquire()           -> Connection
    Connection.execute / fetch / fetchrow / fetchval / executemany

We translate the Postgres idioms the backend is written in ($1 placeholders,
``data->>'key'`` JSON access, ``ON CONFLICT`` / ``INSERT OR REPLACE`` upserts)
into Databricks SQL at execution time:

    $1,$2            ->  ?  (the Databricks serverless protocol uses ?)
    col->>'key'      ->  GET_JSON_OBJECT(col, '$.key')
    col->'key'       ->  GET_JSON_OBJECT(col, '$.key')
    INSERT OR REPLACE/ON CONFLICT ... EXCLUDED -> MERGE INTO
    INSERT OR IGNORE -> MERGE (insert-if-not-exists)
    TRUNCATE a,b     -> TRUNCATE TABLE a; TRUNCATE TABLE b

All writes are auto-committed (matching SQLite semantics).

Environment variables (backend/.env):
    DATABRICKS_HOST, DATABRICKS_HTTP_PATH, DATABRICKS_TOKEN
    CRYOSYNC_DB_BACKEND=databricks          (selects this adapter)
    CRYOSYNC_DB_CATALOG / DATABRICKS_CATALOG (default cryosync_catalog)
    CRYOSYNC_DB_SCHEMA                        (schema holding the tables, default '' = current)
"""

import json
import os
import re
import threading
import asyncio
from typing import Any, Iterable, List, Optional, Tuple

from dotenv import load_dotenv

load_dotenv()

_HOST = os.getenv("DATABRICKS_HOST", "").replace("https://", "").rstrip("/")
_HTTP_PATH = os.getenv("DATABRICKS_HTTP_PATH", "")
_TOKEN = os.getenv("DATABRICKS_TOKEN", "")
_CATALOG = os.getenv("CRYOSYNC_DB_CATALOG", os.getenv("DATABRICKS_CATALOG", "cryosync_catalog"))
_SCHEMA = os.getenv("CRYOSYNC_DB_SCHEMA", os.getenv("DATABRICKS_BRONZE_SCHEMA", "bronze"))

_pool: "Optional[DatabricksPool]" = None
_pool_lock = asyncio.Lock()


# ---------------------------------------------------------------------------
# SQL translation (Postgres / SQLite idioms -> Databricks SQL)
# ---------------------------------------------------------------------------

_CAST_RE = re.compile(
    r"::\s*(?:jsonb|json|text\[\]|text|int|bigint|smallint|numeric|decimal|boolean|float|timestamptz|timestamp|uuid)",
    re.IGNORECASE,
)
_JSON_GET_RE = re.compile(r"([\w.\"`]+)\s*->>\s*'([^']+)'", re.IGNORECASE)
_JSON_GET_OBJ_RE = re.compile(r"([\w.\"`]+)\s*->\s*'([^']+)'", re.IGNORECASE)


def _squote(col: str) -> str:
    return col.strip("`").strip('"')


def _translate_json_ops(sql: str) -> str:
    sql = _JSON_GET_RE.sub(lambda m: f"GET_JSON_OBJECT({_squote(m.group(1))}, '$.{m.group(2)}')", sql)
    sql = _JSON_GET_OBJ_RE.sub(lambda m: f"GET_JSON_OBJECT({_squote(m.group(1))}, '$.{m.group(2)}')", sql)
    return sql


def _translate_sql(sql: str) -> str:
    """Apply the generic Postgres/SQLite -> Databricks idioms that do not
    depend on the statement shape (upserts are handled separately)."""
    out = _CAST_RE.sub("", sql)
    out = _translate_json_ops(out)
    # $1 / ?1 / ? -> bare ? for the Databricks (Thrift/DBAPI) binding.
    out = re.sub(r"[?$]\d+", "?", out)
    # TRUNCATE a, b -> TRUNCATE TABLE a; TRUNCATE TABLE b
    out = re.sub(
        r"TRUNCATE\s+([`\w.]+(?:\s*,\s*[`\w.]+)*)",
        lambda m: "; ".join(f"TRUNCATE TABLE {t.strip()}" for t in m.group(1).split(",")),
        out,
        flags=re.IGNORECASE,
    )
    # ON CONFLICT (k) DO NOTHING (outside of an upsert) -> not valid in
    # Databricks; replace with a no-op that still fills the row (best effort).
    return out


def _split_values(body: str) -> List[str]:
    """Split a parenthesised VALUES list on top-level commas."""
    body = body.strip()
    if body.startswith("(") and body.endswith(")"):
        body = body[1:-1]
    parts, depth, cur = [], 0, ""
    for ch in body:
        if ch == "(":
            depth += 1
        elif ch == ")":
            depth -= 1
        if ch == "," and depth == 0:
            parts.append(cur.strip())
            cur = ""
        else:
            cur += ch
    if cur.strip():
        parts.append(cur.strip())
    return parts


def _norm_ph(v: str) -> str:
    """Normalise a placeholder token ($N or ?N) to bare '?' for Databricks."""
    v = v.strip()
    m = re.fullmatch(r"[?$]\d+", v)
    if m:
        return "?"
    if v in ("?",):
        return "?"
    return v


def _translate_upsert(sql: str) -> Optional[str]:
    """Convert INSERT OR REPLACE / INSERT OR IGNORE / ON CONFLICT into MERGE.

    Handles parameterised and literal VALUES alike by keeping bare ``?``
    placeholders in the ``USING (SELECT ? AS col, ...)`` clause. Databricks SQL
    binds them positionally in order, matching the original column order.
    """
    # INSERT OR REPLACE / INSERT OR IGNORE ... VALUES (...)
    m = re.match(
        r"\s*INSERT\s+OR\s+(REPLACE|IGNORE)\s+INTO\s+([`\w.]+)\s*\(([^)]*)\)\s*VALUES\s*(\([^;]*\))\s*;?\s*\Z",
        sql,
        re.IGNORECASE | re.DOTALL,
    )
    if m:
        mode, table, cols_blob, vals_blob = m.group(1).upper(), m.group(2), m.group(3), m.group(4)
        cols = [c.strip().strip("`") for c in cols_blob.split(",")]
        vals = _split_values(vals_blob)
        if len(cols) != len(vals):
            return None
        raw_key = "id" if "id" in cols else cols[0]
        using = "SELECT " + ", ".join(f"{_norm_ph(v)} AS `{c}`" for c, v in zip(cols, vals))
        add_cols = [c for c in cols if c != raw_key]
        upd = ", ".join(f"`{c}` = s.`{c}`" for c in add_cols)
        ins_cols = ", ".join(f"`{c}`" for c in cols)
        ins_src = ", ".join(f"s.`{c}`" for c in cols)
        if mode == "REPLACE":
            return (
                f"MERGE INTO `{table.strip('`')}` AS t "
                f"USING ({using}) AS s ON t.`{raw_key}` = s.`{raw_key}` "
                f"WHEN MATCHED THEN UPDATE SET {upd} "
                f"WHEN NOT MATCHED THEN INSERT ({ins_cols}) VALUES ({ins_src})"
            )
        return (
            f"MERGE INTO `{table.strip('`')}` AS t "
            f"USING ({using}) AS s ON t.`{raw_key}` = s.`{raw_key}` "
            f"WHEN NOT MATCHED THEN INSERT ({ins_cols}) VALUES ({ins_src})"
        )

    # plain INSERT ... ON CONFLICT (key) DO UPDATE SET ... EXCLUDED.col
    m2 = re.match(
        r"\s*INSERT\s+INTO\s+([`\w.]+)\s*\(([^)]*)\)\s*VALUES\s*(\([^;]*?\))\s*"
        r"ON\s+CONFLICT\s*\(([^)]*)\)\s*DO\s+UPDATE\s+SET\s+(.*?);?\s*\Z",
        sql,
        re.IGNORECASE | re.DOTALL,
    )
    if m2:
        table, cols_blob, vals_blob, key_blob, updates = (
            m2.group(1), m2.group(2), m2.group(3), m2.group(4), m2.group(5),
        )
        cols = [c.strip().strip("`") for c in cols_blob.split(",")]
        vals = _split_values(vals_blob)
        if len(cols) != len(vals):
            return None
        raw_key = key_blob.strip().strip("`").strip() or "id"
        using = "SELECT " + ", ".join(f"{_norm_ph(v)} AS `{c}`" for c, v in zip(cols, vals))
        upd = re.sub(r"\bEXCLUDED\.", "s.", updates.strip())
        return (
            f"MERGE INTO `{table.strip('`')}` AS t "
            f"USING ({using}) AS s ON t.`{raw_key}` = s.`{raw_key}` "
            f"WHEN MATCHED THEN UPDATE SET {upd} "
            f"WHEN NOT MATCHED THEN INSERT ({', '.join('`'+c+'`' for c in cols)}) "
            f"VALUES ({', '.join('s.`'+c+'`' for c in cols)})"
        )
    return None


def _parse_insert_or(sql: str):
    """Parse `INSERT OR REPLACE/IGNORE INTO t (c1, c2, ...) VALUES (...)`.

    Returns (mode, table, cols, key) or None. `key` defaults to 'id' when the
    column list contains it, else to the first column. Used by the batched
    executemany path.
    """
    m = re.match(
        r"\s*INSERT\s+OR\s+(REPLACE|IGNORE)\s+INTO\s+([`\w.]+)\s*\(([^)]*)\)\s*VALUES\s*\([^)]*\)\s*;?\s*\Z",
        sql,
        re.IGNORECASE | re.DOTALL,
    )
    if not m:
        return None
    mode, table, cols_blob = m.group(1).upper(), m.group(2), m.group(3)
    cols = [c.strip().strip("`") for c in cols_blob.split(",")]
    cols = [c for c in cols if c]  # drop empties from trailing commas
    if not cols:
        return None
    key = "id" if "id" in cols else cols[0]
    return mode, table.strip("`"), cols, key


def _value_merge_stmt(table: str, cols: List[str], key: str, mode: str, n_rows: int) -> str:
    """Build a batched MERGE over a VALUES list for an INSERT OR REPLACE/IGNORE
    statement so many rows are applied in one command on Databricks."""
    name = table.split(".")[-1]
    vals = ", ".join("(" + ", ".join("?" for _ in cols) + ")" for _ in range(n_rows))
    using = f"SELECT * FROM VALUES {vals} AS v({', '.join(cols)})"
    if mode == "REPLACE":
        upd = ", ".join(f"{c} = s.{c}" for c in cols if c != key)
        if not upd:
            upd = f"{key} = s.{key}"
        return (
            f"MERGE INTO `{name}` AS t "
            f"USING ({using}) AS s ON t.`{key}` = s.`{key}` "
            f"WHEN MATCHED THEN UPDATE SET {upd} "
            f"WHEN NOT MATCHED THEN INSERT ({', '.join(cols)}) "
            f"VALUES ({', '.join('s.'+c for c in cols)})"
        )
    # IGNORE -> insert only when not present
    return (
        f"MERGE INTO `{name}` AS t "
        f"USING ({using}) AS s ON t.`{key}` = s.`{key}` "
        f"WHEN NOT MATCHED THEN INSERT ({', '.join(cols)}) "
        f"VALUES ({', '.join('s.'+c for c in cols)})"
    )


def _is_write(sql: str) -> bool:
    head = sql.lstrip().upper()
    for kw in ("INSERT", "UPDATE", "DELETE", "MERGE", "REPLACE", "TRUNCATE", "COMMENT", "GRANT"):
        if head.startswith(kw):
            return True
    return False


def _convert_param(value: Any) -> Any:
    if isinstance(value, (dict, list)):
        return json.dumps(value, ensure_ascii=False, default=str)
    return value


# ---------------------------------------------------------------------------
# Record (compatible row object)
# ---------------------------------------------------------------------------

class Record:
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
# Connection / Pool (Databricks)
# ---------------------------------------------------------------------------

class DatabricksConnection:
    def __init__(self, db: "DatabricksPool"):
        self._db = db

    def _conn(self):
        return self._db._conn()

    @staticmethod
    def _expand_placeholders(sql: str, args: list) -> Tuple[str, list]:
        """Rewrite $N / ?N placeholders into bare '?' and re-order args so each
        '?' gets the right bound value, mirroring Postgres semantics where the
        same $N may appear more than once (e.g. $8 used for two columns)."""
        has_numeric = re.search(r"[?$]\d", sql) is not None
        out = []
        params = []
        i, n = 0, len(sql)
        while i < n:
            c = sql[i]
            if c in ("?", "$"):
                m = re.match(r"[?$](\d+)", sql[i:])
                if m:
                    idx = int(m.group(1)) - 1
                    out.append("?")
                    params.append(args[idx] if 0 <= idx < len(args) else None)
                    i += m.end()
                else:
                    out.append("?")
                    params.append(args[len(params)] if len(params) < len(args) else None)
                    i += 1
            else:
                out.append(c)
                i += 1
        return "".join(out), params

    async def _run(self, sql: str, args: tuple, fetch: bool = False):
        # Expand $N / ?N into bare '?' with args re-ordered to placeholders so
        # repeated placeholders (e.g. $8 used twice) bind correctly.
        expanded, ordered = self._expand_placeholders(sql, list(args))
        # Try to convert INSERT OR REPLACE / ON CONFLICT upsets into MERGE first.
        # Otherwise apply the generic Postgres/SQLite -> Databricks idioms.
        merged = _translate_upsert(expanded)
        sql2 = merged if merged else _translate_sql(expanded)
        params = [_convert_param(a) for a in ordered]

        # Handle the collapsed ANY($N) -> IN (...) pattern used by dashboard code.
        sql2, params = self._expand_any(sql2, params)

        def _exec():
            with self._conn().cursor() as cur:
                if params:
                    cur.execute(sql2, params)
                else:
                    cur.execute(sql2)
                if fetch and cur.description is not None:
                    rows = cur.fetchall()
                    cols = tuple(str(d[0]).lower() for d in cur.description)
                    return rows, cols
                self._conn().commit()
                return None, None

        rows, cols = await asyncio.to_thread(_exec)
        if fetch and cols is not None:
            return [Record(cols, tuple(r)) for r in (rows or [])]
        return "OK"

    @staticmethod
    def _expand_any(sql: str, args: list) -> Tuple[str, list]:
        """Expand ``col = ANY(?)`` (with a list arg) into ``col IN (?, ?, ...)``."""
        out = sql
        params = list(args)
        pat = re.compile(r"([\w.\"`]+)\s*=\s*ANY\(\?\)", re.IGNORECASE)
        # REPLACE any(?) referencing a list parameter
        # We can't know which positional param maps where after $N collapsing,
        # so handle the common single-arg case: ANY(?) with a list as args[0].
        m = pat.search(out)
        if m and params and isinstance(params[0], (list, tuple, set)):
            col = m.group(1)
            vals = list(params[0])
            ph = ", ".join("?" for _ in vals)
            out = out[:m.start()] + f"{col} IN ({ph})" + out[m.end():]
            params = [v for v in vals] + params[1:]
        return out, params

    # Public API -----------------------------------------------------------

    async def execute(self, sql: str, *args) -> str:
        return await self._run(sql, args, fetch=False)

    async def fetch(self, sql: str, *args) -> List[Record]:
        return await self._run(sql, args, fetch=True)

    async def fetchrow(self, sql: str, *args) -> Optional[Record]:
        results = await self.fetch(sql, *args)
        return results[0] if results else None

    async def fetchval(self, sql: str, *args):
        row = await self.fetchrow(sql, *args)
        return row[0] if row is not None else None

    async def executemany(self, sql: str, seq: Iterable):
        rows = list(seq)
        if not rows:
            return

        # INSERT OR REPLACE / INSERT OR IGNORE -> apply all rows as a chunked
        # MERGE over a VALUES list (fast + idempotent on Databricks).
        parsed = _parse_insert_or(sql)
        if parsed:
            mode, table, cols, key = parsed
            ncols = len(cols)
            # Databricks caps bound parameters at 10000 per statement.
            max_rows = max(1, (9000 // ncols)) if ncols else 1
            def _chunk():
                with self._conn().cursor() as cur:
                    for start in range(0, len(rows), max_rows):
                        batch = rows[start:start + max_rows]
                        stmt = _value_merge_stmt(table, cols, key, mode, len(batch))
                        flat = [
                            (_convert_param(v) if isinstance(v, (dict, list)) else v)
                            for r in batch for v in (r if isinstance(r, (list, tuple)) else [r])
                        ]
                        cur.execute(stmt, flat)
                    self._conn().commit()
            await asyncio.to_thread(_chunk)
            return

        # Otherwise expand placeholders and issue one statement per row.
        sample = rows[0] if isinstance(rows[0], (list, tuple)) else [rows[0]]
        expanded, _ = self._expand_placeholders(sql, list(sample))
        stmt = _translate_sql(expanded)

        def _exec():
            with self._conn().cursor() as cur:
                for r in rows:
                    params = tuple(_convert_param(v) for v in (r if isinstance(r, (list, tuple)) else [r]))
                    cur.execute(stmt, params)
                self._conn().commit()

        await asyncio.to_thread(_exec)


class DatabricksPool:
    def __init__(self):
        import databricks.sql as dbsql
        self._sql_conn = dbsql.connect(
            server_hostname=_HOST,
            http_path=_HTTP_PATH,
            access_token=_TOKEN,
            catalog=_CATALOG,
            schema=_SCHEMA,
        )

    def _conn(self):
        return self._sql_conn

    def acquire(self):
        return _PoolAcquire(self)

    async def close(self):
        try:
            self._sql_conn.close()
        except Exception:
            pass


class _PoolAcquire:
    def __init__(self, pool: DatabricksPool):
        self._pool = pool

    def __await__(self):
        async def _get():
            return DatabricksConnection(self._pool)
        return _get().__await__()

    async def __aenter__(self):
        return DatabricksConnection(self._pool)

    async def __aexit__(self, exc_type, exc, tb):
        return False


# ---------------------------------------------------------------------------
# Public API (identical to the SQLite adapter)
# ---------------------------------------------------------------------------

async def get_pool() -> DatabricksPool:
    global _pool
    async with _pool_lock:
        if _pool is None:
            _pool = DatabricksPool()
            await _ensure_schema(_pool)
        return _pool


async def get_connection() -> DatabricksConnection:
    pool = await get_pool()
    return await pool.acquire()


async def init_db() -> None:
    await get_pool()


async def close_connection(conn) -> None:
    try:
        await conn.close()
    except Exception:
        pass


async def close_pool() -> None:
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None


async def _ensure_schema(pool: DatabricksPool):
    """Create the schema/database if it does not exist and is not 'current'."""
    sch = (_SCHEMA or "").strip()
    if not sch or sch.lower() in ("public", "default", "main"):
        return
    with pool._conn().cursor() as cur:
        cur.execute(f"CREATE DATABASE IF NOT EXISTS `{_CATALOG}`.`{sch}`")
    pool._conn().commit()


# Discovery helpers (used by Admin/table-browser endpoints)
async def discover_tables() -> List[dict]:
    pool = await get_pool()
    sch = (_SCHEMA or "").strip() or "current"
    with pool._conn().cursor() as cur:
        if sch and sch.lower() not in ("public", "default", "main"):
            cur.execute(f"SHOW TABLES IN `{_CATALOG}`.`{sch}`")
        else:
            cur.execute("SHOW TABLES")
        rows = cur.fetchall()
        names = [r[0] if isinstance(r[0], str) else r[0] for r in rows]
        names = [n.split(".")[-1] for n in names if n]
    result = []
    for name in names:
        try:
            with pool._conn().cursor() as cur:
                cur.execute(f"SELECT COUNT(*) FROM `{_CATALOG}`.`{sch}`.`{name}`")
                cnt = cur.fetchone()[0]
        except Exception:
            cnt = 0
        result.append({
            "id": name, "name": name, "description": f"Databricks table `{name}`",
            "schema": [], "rowCount": cnt, "sizeBytes": 0,
            "format": "delta", "location": f"{_CATALOG}.{sch}.{name}",
            "tags": ["databricks", "delta"], "createdAt": "", "updatedAt": "",
        })
    return result


async def get_table_preview(table_id: str) -> dict:
    pool = await get_pool()
    sch = (_SCHEMA or "").strip()
    qtable = f"`{_CATALOG}`.`{sch}`.`{table_id}`" if sch and sch.lower() not in ("public", "default", "main") else f"`{table_id}`"
    with pool._conn().cursor() as cur:
        cur.execute(f"DESCRIBE TABLE {qtable}")
        desc = cur.fetchall()
        cols = [r[0] for r in desc if r[0] not in ("# col_name",)]
        cur.execute(f"SELECT * FROM {qtable} LIMIT 10")
        data_rows = cur.fetchall()
        cur.execute(f"SELECT COUNT(*) FROM {qtable}")
        total = cur.fetchone()[0]
    return {"columns": cols, "rows": [dict(zip(cols, r)) for r in data_rows], "totalRows": total}
