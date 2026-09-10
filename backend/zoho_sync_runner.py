"""Importable wrapper around sync_zoho_to_databricks for use by the FastAPI app.

Exposes `run_zoho_sync(modules, full)` which performs the pull from Zoho CRM and
writes into the Databricks bronze `zoho_*` tables, returning a structured
summary instead of only printing to stdout. Safe to call from an async context
via `asyncio.to_thread(...)`.

The heavy lifting lives in sync_zoho_to_databricks.py; this module only wires
its pieces together with proper open/close of the Databricks connection.
"""

import os
import re
import time

from sync_zoho_to_databricks import (
    Config,
    Databricks,
    ZohoClient,
    sync_module,
)


_HEX = re.compile(r"[^a-f0-9]", re.I)


def run_zoho_sync(modules=None, full=False):
    """Synchronise Zoho CRM modules into Databricks bronze.

    modules: None -> all record modules; otherwise an iterable of module names.
    full:    True -> ignore the watermark and pull everything.
    Returns a dict summary:
        {synced_at, modules, records, per_module: [...], failed: [...]}
    """
    _load_env_for_runtime()
    cfg = Config()
    zoho = ZohoClient(cfg)
    started = time.time()

    if modules is None:
        module_list = zoho.modules()
    else:
        module_list = list(modules)

    db = Databricks(cfg)
    per_module = []
    failed = []
    total = 0
    try:
        for m in module_list:
            try:
                n = sync_module(cfg, zoho, db, m, full=full)
                total += n
                per_module.append({"module": m, "records": n})
            except Exception as e:
                failed.append({"module": m, "error": str(e)})
            time.sleep(1.5)
    finally:
        db.close()

    return {
        "synced_at": time.strftime("%Y-%m-%d %H:%M:%S", time.gmtime(started)),
        "duration_s": round(time.time() - started, 1),
        "modules": len(module_list),
        "records": total,
        "per_module": per_module,
        "failed": failed,
    }


def _load_env_for_runtime():
    """Make sure .env under this backend dir is on os.environ. sync module's
    script does this at import under __main__ only, so we do it here."""
    try:
        from dotenv import load_dotenv
        load_dotenv()
    except Exception:
        pass
    here = os.path.dirname(os.path.abspath(__file__))
    env_path = os.path.join(here, ".env")
    if os.path.exists(env_path):
        for line in open(env_path, encoding="utf-8"):
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, _, v = line.partition("=")
                os.environ.setdefault(k.strip(), v.strip())
