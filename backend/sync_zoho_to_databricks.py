"""One-way incremental sync: Zoho CRM -> Databricks (bronze.zoho_*).

For every record-bearing Zoho CRM module (standard + custom), pulls records via
the Zoho REST API (v7) and upserts them into a Delta table in the configured
Databricks catalog + default schema, e.g.  `cryosync_catalog.bronze.zoho_ucb_units`.

Bronze table shape (query-ready, self-describing):
    id BIGINT                      - Zoho record id  (merge key)
    <one STRING column per module field api_name>  - flattened (json for nested)
    record_data STRING             - the complete original record JSON
    synced_at TIMESTAMP            - when Databricks wrote this row

Incremental watermark: a `crm_sync_log` table records last Modified_Time per
module so repeat runs only pull changed records (criteria on Modified_Time).

Config comes from backend/.env:
    ZOHO_CLIENT_ID / ZOHO_CLIENT_SECRET / ZOHO_REFRESH_TOKEN
    ZOHO_REGION (in | us | eu | au | jp | cn)
    DATABRICKS_HOST / DATABRICKS_HTTP_PATH / DATABRICKS_TOKEN
    DATABRICKS_CATALOG (cryosync_catalog) / DATABRICKS_BRONZE_SCHEMA (bronze)

Usage:
    python sync_zoho_to_databricks.py                 # all modules
    python sync_zoho_to_databricks.py --module Contacts   # one module
    python sync_zoho_to_databricks.py --full          # ignore watermark
    python sync_zoho_to_databricks.py --list-modules  # print modules only
"""

import argparse
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

try:
    from dotenv import load_dotenv
except Exception:
    load_dotenv = None

from databricks import sql  # databricks-sql-connector


# ---------------------------------------------------------------------------
# Env / config
# ---------------------------------------------------------------------------

def _load_env():
    if load_dotenv:
        load_dotenv()
    here = os.path.dirname(os.path.abspath(__file__))
    env_path = os.path.join(here, ".env")
    if os.path.exists(env_path):
        for line in open(env_path, encoding="utf-8"):
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, _, v = line.partition("=")
                os.environ.setdefault(k.strip(), v.strip())


_REGIONS = {
    "in": ("https://accounts.zoho.in", "https://www.zohoapis.in/crm/v7"),
    "us": ("https://accounts.zoho.com", "https://www.zohoapis.com/crm/v7"),
    "eu": ("https://accounts.zoho.eu", "https://www.zohoapis.eu/crm/v7"),
    "au": ("https://accounts.zoho.com.au", "https://www.zohoapis.com.au/crm/v7"),
    "jp": ("https://accounts.zoho.jp", "https://www.zohoapis.jp/crm/v7"),
    "cn": ("https://accounts.zoho.com.cn", "https://www.zohoapis.com.cn/crm/v7"),
}

# Modules that are not record data (dashboards, email blobs, analytics, etc.).
_BLOCKLIST = {
    "Home", "Workqueue__s", "Activities", "Reports", "Analytics", "Social",
    "SalesInbox", "Feeds", "Documents", "Attachments", "Emails",
    "Email_Sentiment", "Email_Analytics", "Email_Template_Analytics",
    "Email_Template__s", "Email_Drafts__s", "Actions_Performed", "DealHistory",
    "Forecasts", "Forecast_Quotas", "Forecast_Items", "Forecast_Groups",
    "Locking_Information__s", "Unknown__s", "CalendarBookings__s", "Visits",
}


class Config:
    def __init__(self):
        self.client_id = os.environ["ZOHO_CLIENT_ID"]
        self.client_secret = os.environ["ZOHO_CLIENT_SECRET"]
        self.refresh_token = os.environ["ZOHO_REFRESH_TOKEN"]
        region = os.environ.get("ZOHO_REGION", "in")
        if region not in _REGIONS:
            raise SystemExit(f"Unknown ZOHO_REGION {region!r}")
        self.accounts_url, self.api_url = _REGIONS[region]
        self.catalog = os.environ.get("DATABRICKS_CATALOG", "cryosync_catalog")
        self.schema = os.environ.get("DATABRICKS_BRONZE_SCHEMA", "bronze")
        self.host = os.environ["DATABRICKS_HOST"]
        self.http_path = os.environ["DATABRICKS_HTTP_PATH"]
        self.token = os.environ["DATABRICKS_TOKEN"]


# ---------------------------------------------------------------------------
# Zoho OAuth + REST
# ---------------------------------------------------------------------------

class ZohoClient:
    def __init__(self, cfg: Config):
        self.cfg = cfg
        self.access_token = None
        self.token_expiry = 0.0

    def _refresh_token(self):
        data = urllib.parse.urlencode({
            "grant_type": "refresh_token",
            "refresh_token": self.cfg.refresh_token,
            "client_id": self.cfg.client_id,
            "client_secret": self.cfg.client_secret,
        }).encode()
        req = urllib.request.Request(self.cfg.accounts_url + "/oauth/v2/token",
                                     data=data, method="POST")
        with urllib.request.urlopen(req, timeout=60) as resp:
            body = json.loads(resp.read())
        self.access_token = body["access_token"]
        self.token_expiry = time.time() + int(body.get("expires_in", 3600)) - 120

    _MAX_RETRIES = 6

    def _call(self, method, path, payload=None, retry=True):
        now = time.time()
        if not self.access_token or now >= self.token_expiry:
            self._refresh_token()
        url = self.cfg.api_url + path
        data = json.dumps(payload).encode() if payload is not None else None
        req = urllib.request.Request(url, data=data, method=method)
        req.add_header("Authorization", "Zoho-oauthtoken " + self.access_token)
        if payload is not None:
            req.add_header("Content-Type", "application/json")
        attempt = 0
        while True:
            attempt += 1
            try:
                with urllib.request.urlopen(req, timeout=120) as resp:
                    raw = resp.read()
                    if resp.status == 204 or not raw:
                        return {}  # empty module / no records (not an error)
                    return json.loads(raw)
            except urllib.error.HTTPError as e:
                code = e.code
                body = e.read().decode("utf-8", "ignore")
                if code == 401 and retry:      # stale token -> refresh + retry once
                    self._refresh_token()
                    return self._call(method, path, payload, retry=False)
                if code == 429:                # rate limit -> backoff + retry
                    self._wait_retry_after(e)
                elif code >= 500 and retry:    # transient server error
                    time.sleep(5)
                elif code == 400 and "LIMIT_EXCEEDED" in body:
                    raise RuntimeError(f"Zoho {method} {path} -> 400: {body}")
                else:
                    raise RuntimeError(f"Zoho {method} {path} -> {code}: {body}")
            except urllib.error.URLError as e:
                if attempt > self._MAX_RETRIES:
                    raise RuntimeError(f"Zoho network error: {e}")
                time.sleep(5)
            except (json.JSONDecodeError, UnicodeDecodeError) as e:
                if attempt > self._MAX_RETRIES:
                    raise RuntimeError(f"Zoho {method} {path} bad body: {e}")
                time.sleep(5)
                continue
            if attempt > self._MAX_RETRIES:
                raise RuntimeError(f"Zoho {method} {path} still failing after retries")
            time.sleep(2 * attempt)

    @staticmethod
    def _wait_retry_after(e):
        wait = 5
        retry = e.headers.get("Retry-After") if e.headers else None
        if retry:
            try:
                wait = float(retry)
            except (TypeError, ValueError):
                pass
        time.sleep(min(wait, 60))

    def modules(self):
        data = self._call("GET", "/settings/modules?include=1")
        out = []
        for m in data.get("modules", []):
            api = m.get("api_name") or m.get("module_name")
            if not api or api in _BLOCKLIST:
                continue
            out.append(api)
        return sorted(out)

    def fields(self, module):
        data = self._call("GET", f"/settings/fields?module={urllib.parse.quote(module)}")
        return [f.get("api_name") for f in data.get("fields", []) if f.get("api_name")]

    def records(self, module, fields, since=None):
        """Yield complete records for `module`.

        Zoho caps the `fields` query param at 50, so fields are batched into
        chunks of <=50 and the per-module pages are merged by record id.
        """
        FIELD_CHUNK = 50
        chunks = [fields[i:i + FIELD_CHUNK] for i in range(0, len(fields), FIELD_CHUNK)]
        if not chunks:
            chunks = [["All"]]

        def _fetch(chunk, page):
            q = {"per_page": 200, "page": page, "fields": ",".join(chunk)}
            if since:
                q["criteria"] = f"(Modified_Time:greater_than:{since})"
            path = f"/{module}?{urllib.parse.urlencode(q)}"
            data = self._call("GET", path)
            info = data.get("info") or {}
            rows = data.get("data") or []
            return rows, info.get("more_records", False)

        page = 1
        while True:
            merged = {}
            any_more = False
            any_data = False
            for chunk in chunks:
                rows, more = _fetch(chunk, page)
                if rows:
                    any_data = True
                any_more = any_more or more
                for r in rows:
                    rid = r.get("id")
                    if rid not in merged:
                        merged[rid] = {}
                    merged[rid].update(r)
            if not any_data:
                return
            # re-check: a page may have records for one chunk but not another
            for rid in merged:
                yield merged[rid]
            if not any_more:
                return
            page += 1


# ---------------------------------------------------------------------------
# Databricks writes (batched MERGE - VALUES, same fast path as the adapter)
# ---------------------------------------------------------------------------

def _sanitize(value):
    if value is None:
        return None
    if isinstance(value, (dict, list)):
        return json.dumps(value, ensure_ascii=False, default=str)
    if isinstance(value, bool):
        return str(value).lower()
    return value


def _column_ddl(cols):
    stmts = []
    for c in cols:
        stmts.append(f"ALTER TABLE `{{table}}` ADD COLUMN `{c}` STRING")
    return stmts


def _quote_col(c):
    return "`" + c.replace("`", "``") + "`"


def _merge_stmt(table, cols, key, n_rows):
    name = table.split(".")[-1]
    vals = ", ".join("(" + ", ".join("?" for _ in cols) + ")" for _ in range(n_rows))
    using = f"SELECT * FROM VALUES {vals} AS v({', '.join(_quote_col(c) for c in cols)})"
    upd = ", ".join(f"{_quote_col(c)} = s.{_quote_col(c)}" for c in cols if c != key)
    if not upd:
        upd = f"{_quote_col(key)} = s.{_quote_col(key)}"
    return (
        f"MERGE INTO `{name}` AS t "
        f"USING ({using}) AS s ON t.`{key}` = s.`{key}` "
        f"WHEN MATCHED THEN UPDATE SET {upd} "
        f"WHEN NOT MATCHED THEN INSERT ({', '.join(_quote_col(c) for c in cols)}) "
        f"VALUES ({', '.join('s.'+_quote_col(c) for c in cols)})"
    )


class Databricks:
    """Thin synchronous wrapper around databricks-sql-connector with the
    catalog/schema defaults, chunked MERGE upserts and a schema migration
    helper (ALTER TABLE ADD COLUMN)."""

    MAX_PARAMS = 9000

    def __init__(self, cfg: Config):
        self.cfg = cfg
        self._conn = sql.connect(
            server_hostname=cfg.host,
            http_path=cfg.http_path,
            access_token=cfg.token,
            catalog=cfg.catalog,
            schema=cfg.schema,
        )

    @staticmethod
    def _table(module):
        return "zoho_" + module.lower()

    def execute(self, sql_text, params=None):
        with self._conn.cursor() as cur:
            if params:
                cur.execute(sql_text, params)
            else:
                cur.execute(sql_text)
            if cur.description is not None:
                cols = tuple(str(d[0]).lower() for d in cur.description)
                return cols, cur.fetchall()
            return None, None

    def add_columns(self, table, new_cols):
        for c in new_cols:
            self.execute(f"ALTER TABLE `{table}` ADD COLUMN `{c}` STRING")

    def existing_columns(self, table):
        _, rows = self.execute(f"DESCRIBE TABLE `{table}`")
        if rows is None:
            return set()
        return {str(r[0]).lower() for r in rows}

    def create_if_missing(self, table, cols):
        ddl_cols = ["id BIGINT"] + [f"`{c}` STRING" for c in cols] + [
            "record_data STRING",
            "synced_at TIMESTAMP",
        ]
        ddl = (f"CREATE TABLE IF NOT EXISTS `{table}` ({', '.join(ddl_cols)}) "
               f"USING DELTA")
        self.execute(ddl)

    def upsert(self, table, cols, key, rows):
        """Upsert rows (list of dicts) with the given column order via chunked
        MERGE ... VALUES  (idempotent, fast on serverless)."""
        if not rows:
            return 0
        chunk_params = self.MAX_PARAMS // max(1, len(cols))
        total = 0
        for i in range(0, len(rows), chunk_params):
            chunk = rows[i:i + chunk_params]
            stmt = _merge_stmt(table, cols, key, len(chunk))
            flat = []
            for row in chunk:
                flat.extend(row[c] for c in cols)
            self.execute(stmt, flat)
            total += len(chunk)
        return total

    def watermark(self, module):
        table = self._table(module)
        _, rows = self.execute(f"SELECT last_modified_time FROM `crm_sync_log` "
                               f"WHERE module = ?", (module,))
        if rows and rows[0][0]:
            return rows[0][0]
        return None

    def set_watermark(self, module, modified_time):
        self.execute(
            "MERGE INTO `crm_sync_log` AS t "
            "USING (SELECT CAST(? AS STRING) AS module, CAST(?" 
            " AS STRING) AS last_modified_time) AS s "
            "ON t.module = s.module "
            "WHEN MATCHED THEN UPDATE SET last_modified_time = s.last_modified_time "
            "WHEN NOT MATCHED THEN INSERT (module, last_modified_time) "
            "VALUES (s.module, s.last_modified_time)",
            (module, modified_time),
        )

    def seed_log_table(self):
        self.execute(
            "CREATE TABLE IF NOT EXISTS `crm_sync_log` ("
            "module STRING NOT NULL, "
            "last_modified_time STRING, "
            "last_synced TIMESTAMP"
            ") USING DELTA"
        )

    def close(self):
        self._conn.close()


# ---------------------------------------------------------------------------
# Sync logic
# ---------------------------------------------------------------------------

def _best_name(record):
    for k in ("Name", "Full_Name", "UCB_Unit_ID", "Subject", "Product_Code",
              "Case_Number", "Quote_Number", "Sales_Order_Number",
              "Purchase_Order_Number", "Invoice_Number", "Campaign_Name",
              "Vendor_Name", "Account_Name", "Deal_Name", "Task_Name", "Title"):
        if k in record and record[k] not in (None, ""):
            v = record[k]
            return v if isinstance(v, str) else json.dumps(v, ensure_ascii=False)
    return None


def sync_module(cfg, zoho, db, module, full=False):
    t0 = time.time()
    table = db._table(module)
    ofields = zoho.fields(module)
    if "id" in ofields:
        ofields.remove("id")

    # base columns: id + field columns then record_data + synced_at
    cols = list(ofields)
    if "record_data" in cols:
        cols.remove("record_data")

    db.seed_log_table()
    db.create_if_missing(table, cols)
    existing = db.existing_columns(table)
    to_add = [c for c in cols if c.lower() not in existing]
    if to_add:
        db.add_columns(table, to_add)
        existing.update(c.lower() for c in to_add)

    since = None if full else db.watermark(module)
    all_keys = [c for c in cols]
    payload_cols = ["id"] + all_keys + ["record_data", "synced_at"]

    rows = []
    max_mod = since
    n_total = 0
    n_flush = 0
    for rec in zoho.records(module, ofields, since=since):
        rid = rec.get("id")
        if rid is None:
            continue
        flat = {"id": int(rid)}
        for c in all_keys:
            flat[c] = _sanitize(rec.get(c)) if c in rec else None
        flat["record_data"] = json.dumps(rec, ensure_ascii=False, default=str)
        flat["synced_at"] = time.strftime("%Y-%m-%d %H:%M:%S",
                                          time.gmtime(t0))
        rows.append(flat)
        mod = rec.get("Modified_Time")
        if mod and (max_mod is None or mod > max_mod):
            max_mod = mod
        n_total += 1
        if len(rows) >= 200:
            n_flush += db.upsert(table, payload_cols, "id", rows)
            rows = []
    if rows:
        n_flush += db.upsert(table, payload_cols, "id", rows)

    if max_mod:
        db.set_watermark(module, max_mod)

    mode = "incremental" if since else "full"
    print(f"[{module}] {mode}: pulled={n_total} upserted={n_flush} "
          f"cols={len(all_keys)} since={since} in {round(time.time()-t0,1)}s")
    return n_total


def main():
    _load_env()
    parser = argparse.ArgumentParser(description="Sync Zoho CRM -> Databricks")
    parser.add_argument("--module", help="sync only this module")
    parser.add_argument("--full", action="store_true",
                        help="ignore watermark, pull everything")
    parser.add_argument("--list-modules", action="store_true",
                        help="just print modules and exit")
    args = parser.parse_args()

    cfg = Config()
    zoho = ZohoClient(cfg)

    if args.list_modules:
        for m in zoho.modules():
            print(m)
        return

    if args.module:
        modules = [args.module]
    else:
        modules = zoho.modules()

    db = Databricks(cfg)
    try:
        total = 0
        for i, m in enumerate(modules):
            try:
                total += sync_module(cfg, zoho, db, m, full=args.full)
            except Exception as e:
                print(f"[{m}] FAILED: {e}", file=sys.stderr)
            if i < len(modules) - 1:
                time.sleep(1.5)
        print(f"DONE. synced {len(modules)} modules / {total} records total")
    finally:
        db.close()


if __name__ == "__main__":
    main()
