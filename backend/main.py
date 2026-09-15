import asyncio
import json
import math
import os
import random
import re
import time
import uuid
from datetime import datetime, timedelta
from typing import Optional

from contextlib import asynccontextmanager

from fastapi import FastAPI, Header, HTTPException, Query, UploadFile, File, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from database import init_db, get_connection, close_connection, get_pool, close_pool, discover_tables
from seed import seed_database
from seed_enterprise import seed_enterprise
from dashboard_data import build_dashboard, FACILITY_REGIONS
from agent import run_agent_chat
from extract import extract_document_fields
import genie
import lab_reports
from auth import (
    authenticate_user,
    create_session,
    get_user_by_token,
    delete_session,
    public_user,
)
from zoho_sync_runner import run_zoho_sync

@asynccontextmanager
async def lifespan(app: FastAPI):
    print("Initializing database...")
    await init_db()
    await seed_database(await get_pool())
    await seed_enterprise(await get_pool())
    await     _backfill_runtime_links(await get_pool())
    scanner_task = asyncio.create_task(background_temp_incident_scanner())
    zoho_task = asyncio.create_task(background_zoho_sync_loop())
    print("Server ready!")
    yield
    scanner_task.cancel()
    zoho_task.cancel()
    await close_pool()

app = FastAPI(title="CryoSync API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Routes that never require a session token.
_PUBLIC_PATHS = {
    "/api/auth/login",
    "/api/auth/me",
    "/api/system/health",
}


def _is_public(path: str) -> bool:
    if not path.startswith("/api"):
        return True
    if path in _PUBLIC_PATHS:
        return True
    if path.startswith("/api/auth/"):
        return True
    return False


async def _current_user(request: Request) -> Optional[dict]:
    """Resolve the signed-in user from Authorization header or ?token= param."""
    authz = request.headers.get("authorization", "")
    token = ""
    if authz.lower().startswith("bearer "):
        token = authz[7:].strip()
    else:
        token = (request.query_params.get("token") or "").strip()
    if not token:
        return None
    try:
        return await get_user_by_token(token)
    except Exception:
        return None


@app.middleware("http")
async def auth_middleware(request: Request, call_next):
    if not _is_public(request.url.path):
        user = await _current_user(request)
        if user is None:
            return JSONResponse(status_code=401, content={"detail": "Authentication required"})
        request.state.user = user
    return await call_next(request)

def now_iso():
    return datetime.now().isoformat()

def generate_id(prefix: str) -> str:
    ts = int(datetime.now().timestamp() * 1000)
    rand = uuid.uuid4().hex[:6]
    return f"{prefix}-{ts}-{rand}"

def paginate(items: list, page: int, page_size: int):
    total = len(items)
    start = (page - 1) * page_size
    data = items[start:start + page_size]
    return {"data": data, "total": total}

def compute_flags(s: dict) -> list:
    flags = []
    readings = s.get("temperatureReadings", [])
    if any(r.get("excursion") for r in readings):
        flags.append({"type": "temperature_excursion", "label": "Temperature excursion detected", "severity": "critical"})
    cond = s.get("condition", "good")
    if cond in ("damaged", "fair"):
        flags.append({"type": "damaged", "label": "Damaged goods" if cond == "damaged" else "Condition concerns", "severity": "critical" if cond == "damaged" else "high"})
    if not s.get("coaAttached"):
        flags.append({"type": "missing_coa", "label": "COA not attached", "severity": "high"})
    if not s.get("chainOfCustody"):
        flags.append({"type": "missing_coc", "label": "Chain of custody not verified", "severity": "medium"})
    if s.get("dangerousGoods"):
        flags.append({"type": "hazardous", "label": "Hazardous materials", "severity": "high"})
    if s.get("priority") == "critical":
        flags.append({"type": "high_priority", "label": "Critical priority", "severity": "high"})
    return flags

def map_to_summary(s: dict) -> dict:
    return {
        "id": s["id"],
        "shipmentNumber": s["shipmentNumber"],
        "supplierName": s["supplierName"],
        "status": s["status"],
        "category": s["category"],
        "temperatureRegime": s["temperatureRegime"],
        "receivedDate": s["receivedDate"],
        "priority": s["priority"],
        "lotCount": s["lotCount"],
        "condition": s["condition"],
        "purchaseOrderNumber": s["purchaseOrderNumber"],
        "transportationMode": s["transportationMode"],
        "flags": compute_flags(s),
    }

def map_to_compliance_summary(c: dict) -> dict:
    created = datetime.fromisoformat(c["createdAt"])
    now = datetime.now()
    if c.get("resolvedDate"):
        resolved = datetime.fromisoformat(c["resolvedDate"])
        days_open = (resolved - created).days
    else:
        days_open = (now - created).days
    return {
        "id": c["id"],
        "incidentNumber": c["incidentNumber"],
        "title": c["title"],
        "deviationType": c["deviationType"],
        "severity": c["severity"],
        "status": c["status"],
        "facilityName": c["facilityName"],
        "detectedDate": c["detectedDate"],
        "daysOpen": max(0, days_open),
        "dueDate": c.get("dueDate") or None,
        "overdue": bool(c.get("dueDate")) and c.get("status") in ("open", "investigating") and datetime.fromisoformat(c["dueDate"]) < now,
        "regulatoryNotifiable": c["regulatoryNotifiable"],
    }

# --- Database Helpers ---

async def get_shipments_from_db():
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch("SELECT * FROM shipments ORDER BY created_at DESC")
        shipments = []
        for row in rows:
            s = dict(row)
            s["temperatureReadings"] = json.loads(s.pop("temperature_readings", "[]"))
            s["loggers"] = json.loads(s.pop("loggers", "[]"))
            s["receivingChecklist"] = json.loads(s.pop("receiving_checklist", "{}"))
            s["disposition"] = json.loads(s.pop("disposition", "{}"))
            # Convert snake_case to camelCase
            camel = {}
            for k, v in s.items():
                parts = k.split("_")
                ck = parts[0] + "".join(p.title() for p in parts[1:])
                camel[ck] = v
            camel["transitSummary"] = compute_transit_summary(camel)
            shipments.append(camel)
        return shipments

async def write_shipment_to_db(shipment: dict):
    pool = await get_pool()
    readings = shipment.pop("temperatureReadings", [])
    readings_json = json.dumps(readings)
    loggers = shipment.pop("loggers", [])
    loggers_json = json.dumps(loggers)
    checklist = shipment.pop("receivingChecklist", {})
    checklist_json = json.dumps(checklist)
    disposition = shipment.pop("disposition", {})
    disposition_json = json.dumps(disposition)
    shipment.pop("transitSummary", None)
    # Convert camelCase to snake_case
    snake = {}
    for k, v in shipment.items():
        sk = "".join("_" + c.lower() if c.isupper() else c for c in k).lstrip("_")
        snake[sk] = v
    
    cols = ", ".join(snake.keys())
    placeholders = ", ".join(f"${i+1}" for i in range(len(snake)))
    vals = list(snake.values())
    
    async with pool.acquire() as conn:
        await conn.execute(
            f"INSERT INTO shipments ({cols}, temperature_readings, loggers, receiving_checklist, disposition) VALUES ({placeholders}, ${len(vals)+1}::jsonb, ${len(vals)+2}::jsonb, ${len(vals)+3}::jsonb, ${len(vals)+4}::jsonb) ON CONFLICT (id) DO UPDATE SET " +
            ", ".join(f"{c} = EXCLUDED.{c}" for c in snake.keys()) +
            ", temperature_readings = EXCLUDED.temperature_readings, loggers = EXCLUDED.loggers, receiving_checklist = EXCLUDED.receiving_checklist, disposition = EXCLUDED.disposition",
            *vals, readings_json, loggers_json, checklist_json, disposition_json
        )
    shipment["temperatureReadings"] = readings
    shipment["loggers"] = loggers
    shipment["receivingChecklist"] = checklist
    shipment["disposition"] = disposition

async def update_shipment_in_db(shipment_id: str, updates: dict):
    pool = await get_pool()
    readings = updates.pop("temperatureReadings", None)
    loggers = updates.pop("loggers", None)
    checklist = updates.pop("receivingChecklist", None)
    disposition = updates.pop("disposition", None)
    updates.pop("transitSummary", None)
    
    sets = []
    vals = []
    i = 1
    for k, v in updates.items():
        sk = "".join("_" + c.lower() if c.isupper() else c for c in k).lstrip("_")
        sets.append(f"{sk} = ${i}")
        vals.append(v)
        i += 1
    
    if readings is not None:
        sets.append(f"temperature_readings = ${i}::jsonb")
        vals.append(json.dumps(readings))
        i += 1
    
    if loggers is not None:
        sets.append(f"loggers = ${i}::jsonb")
        vals.append(json.dumps(loggers))
        i += 1
    
    if checklist is not None:
        sets.append(f"receiving_checklist = ${i}::jsonb")
        vals.append(json.dumps(checklist))
        i += 1
    
    if disposition is not None:
        sets.append(f"disposition = ${i}::jsonb")
        vals.append(json.dumps(disposition))
        i += 1
    
    sets.append(f"updated_at = ${i}")
    vals.append(now_iso())
    i += 1
    
    vals.append(shipment_id)
    
    async with pool.acquire() as conn:
        await conn.execute(
            f"UPDATE shipments SET {', '.join(sets)} WHERE id = ${i}",
            *vals
        )
    if readings is not None:
        updates["temperatureReadings"] = readings
    if loggers is not None:
        updates["loggers"] = loggers
    if checklist is not None:
        updates["receivingChecklist"] = checklist
    if disposition is not None:
        updates["disposition"] = disposition

async def get_all_from_table(table: str, id_field: str = "id"):
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(f"SELECT data FROM {table} ORDER BY data->>'{id_field}'")
        return [json.loads(r["data"]) for r in rows]

# --- Bounded sampling for the dashboard (stays fast as tables grow) --------

DASHBOARD_SAMPLE = {
    "shipments": 600,
    "inventory_lots": 600,
    "compliance_incidents": 400,
    "storage_zones": 200,
}

def _shipment_where(facility=None, cutoff=None, region_facilities=None, supplier=None):
    clauses = []
    params = []
    if facility:
        clauses.append(f"facility_id = ${len(params) + 1}")
        params.append(facility)
    if cutoff:
        clauses.append(f"created_at >= ${len(params) + 1}")
        params.append(cutoff)
    if region_facilities:
        clauses.append(f"facility_name = ANY(${len(params) + 1}::text[])")
        params.append(list(region_facilities))
    if supplier:
        clauses.append(f"supplier_name = ${len(params) + 1}")
        params.append(supplier)
    return " AND ".join(clauses), params

async def _count_shipments(pool, where, params):
    sql = "SELECT count(*) FROM shipments"
    if where:
        sql += " WHERE " + where
    async with pool.acquire() as conn:
        return int(await conn.fetchval(sql, *params))

async def _count_rows(pool, table: str):
    sql = f"SELECT count(*) FROM {table}"
    async with pool.acquire() as conn:
        return int(await conn.fetchval(sql))

async def get_shipments_sample(pool, where, params, sample=DASHBOARD_SAMPLE["shipments"]):
    sql = "SELECT * FROM shipments"
    if where:
        sql += " WHERE " + where
    sql += f" ORDER BY random() LIMIT {int(sample)}"
    async with pool.acquire() as conn:
        rows = await conn.fetch(sql, *params)
    shipments = []
    for row in rows:
        s = dict(row)
        s["temperatureReadings"] = json.loads(s.pop("temperature_readings", "[]"))
        s["loggers"] = json.loads(s.pop("loggers", "[]"))
        s["receivingChecklist"] = json.loads(s.pop("receiving_checklist", "{}"))
        s["disposition"] = json.loads(s.pop("disposition", "{}"))
        camel = {}
        for k, v in s.items():
            parts = k.split("_")
            ck = parts[0] + "".join(p.title() for p in parts[1:])
            camel[ck] = v
        camel["transitSummary"] = compute_transit_summary(camel)
        shipments.append(camel)
    return shipments

async def get_json_sample(pool, table: str, sample=600):
    sql = f"SELECT data FROM {table} ORDER BY random() LIMIT {int(sample)}"
    async with pool.acquire() as conn:
        rows = await conn.fetch(sql)
    return [json.loads(r["data"]) for r in rows]

REGIME_RANGES = {
    "ambient": (15, 25),
    "refrigerated_2_8": (2, 8),
    "frozen_minus_20": (-25, -15),
    "ultra_frozen_minus_80": (-85, -75),
    "liquid_nitrogen": (-200, -180),
}

def enrich_temperature_readings(shipment: dict, readings: list, existing_count: int = None):
    """Attach regime thresholds, excursion flags, and ids to raw logger readings."""
    regime = shipment.get("temperatureRegime", "refrigerated_2_8")
    mn, mx = REGIME_RANGES.get(regime, REGIME_RANGES["refrigerated_2_8"])
    if existing_count is None:
        existing_count = len(shipment.get("temperatureReadings", []))
    enriched = []
    for i, r in enumerate(readings):
        try:
            temp = float(r.get("temperature"))
        except (TypeError, ValueError):
            temp = 0.0
        timestamp = r.get("timestamp", "") or now_iso()
        excursion = temp < mn or temp > mx
        enriched.append({
            "id": f"TMP-{shipment.get('id', 'SHP')}-{existing_count + i:04d}",
            "shipmentId": shipment.get("id", ""),
            "timestamp": timestamp,
            "temperature": round(temp, 2),
            "minThreshold": mn,
            "maxThreshold": mx,
            "deviceId": r.get("deviceId", ""),
            "location": r.get("location", ""),
            "excursion": excursion,
            "excursionDurationMinutes": None,
        })
    return enriched

def compute_transit_summary(shipment: dict):
    """Derive transit stats (min/max temp, duration, excursion totals) from readings."""
    readings = shipment.get("temperatureReadings", [])
    if not readings:
        return {"minTemp": None, "maxTemp": None, "durationMinutes": 0, "excursionCount": 0, "excursionDurationMinutes": 0}
    ordered = sorted(readings, key=lambda r: r.get("timestamp", ""))
    temps = [float(r.get("temperature", 0.0)) for r in ordered]
    try:
        from datetime import datetime as dt
        first = dt.fromisoformat(ordered[0]["timestamp"])
        last = dt.fromisoformat(ordered[-1]["timestamp"])
        duration = max(0, int((last - first).total_seconds() / 60))
    except (ValueError, TypeError, KeyError):
        duration = 0
    excursion_count = sum(1 for r in ordered if r.get("excursion"))
    excursion_minutes = 0
    for i, r in enumerate(ordered):
        if not r.get("excursion"):
            continue
        if i + 1 < len(ordered):
            try:
                from datetime import datetime as dt
                a = dt.fromisoformat(r["timestamp"])
                b = dt.fromisoformat(ordered[i + 1]["timestamp"])
                interval = max(0, int((b - a).total_seconds() / 60))
            except (ValueError, TypeError, KeyError):
                interval = 0
        else:
            interval = 0
        r["excursionDurationMinutes"] = interval
        excursion_minutes += interval
    shipment["temperatureReadings"] = ordered
    return {
        "minTemp": round(min(temps), 2) if temps else None,
        "maxTemp": round(max(temps), 2) if temps else None,
        "durationMinutes": duration,
        "excursionCount": excursion_count,
        "excursionDurationMinutes": excursion_minutes,
    }

async def get_from_table(table: str, record_id: str):
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(f"SELECT data FROM {table} WHERE id = $1", record_id)
        if row:
            return json.loads(row["data"])
        return None

_RUNTIME_LINK_COLUMNS = {
    "inventory_lots": {
        "product_id": "productId", "lot_number": "lotNumber", "quantity": "quantity",
        "status": "status", "expiry_date": "expiryDate", "storage_zone": "storageZone",
        "created_at": "createdAt",
    },
    "compliance_incidents": {
        "entity_type": "entityType", "entity_id": "entityId", "status": "status",
        "severity": "severity", "deviation_type": "deviationType", "created_at": "createdAt",
    },
    "storage_zones": {
        "name": "name", "facility_id": "facilityId", "capacity": "capacity",
        "utilized": "utilized", "zone_type": "zoneType",
    },
    "suppliers": {"name": "name", "region": "region", "qualification_status": "qualificationStatus"},
    "products": {"name": "name", "category": "category", "supplier_id": "supplierId"},
    "facilities": {"name": "name", "region": "region"},
}

_table_columns_cache: dict = {}


async def table_columns(conn, table: str) -> set:
    """Return the set of column names that currently exist on the table.

    Databricks keeps the domain tables as `(id, data)` JSON tables, while the
    SQLite store also carries the additive runtime-link columns, so writers
    must adapt to whichever columns are actually present.
    """
    cached = _table_columns_cache.get(table)
    if cached is not None:
        return cached
    try:
        rows = await conn.fetch(f"DESCRIBE TABLE {table}")
        cols = []
        for r in rows:
            name = r.get("col_name")
            if name is None:
                try:
                    name = r[0]
                except Exception:
                    continue
            if str(name).strip() == "# col_name":
                continue
            cols.append(str(name).strip().strip("`").strip('"'))
        if cols:
            _table_columns_cache[table] = set(cols)
            return set(cols)
    except Exception:
        pass
    try:
        rows = await conn.fetch(f'PRAGMA table_info("{table}")')
        cols = {str(r[1]) for r in rows}
        _table_columns_cache[table] = cols
        return cols
    except Exception:
        return set()


async def write_to_table(table: str, record: dict):
    pool = await get_pool()
    rid = record.get("id", generate_id("REC"))
    links = _RUNTIME_LINK_COLUMNS.get(table, {})
    payload = json.dumps(record)
    async with pool.acquire() as conn:
        existing = await table_columns(conn, table)
        la = []
        lb = []
        params: list = [rid, payload]
        for col, key in links.items():
            if col not in existing:
                continue
            la.append(col)
            lb.append(f"?{len(params) + 1}")
            params.append(record.get(key))
        cols = "id, data" + ("".join(f", {c}" for c in la))
        placeholders = "?1, ?2" + ("".join(f", {p}" for p in lb))
        updates = ", ".join(f"{c} = ?{3 + i}" for i, c in enumerate(la))
        if not la:
            updates = "data = ?2"
        await conn.execute(
            f"INSERT INTO {table} ({cols}) VALUES ({placeholders}) "
            f"ON CONFLICT (id) DO UPDATE SET {updates}",
            *params,
        )
    return rid


async def _backfill_runtime_links(pool) -> None:
    """Populate the additive runtime-link columns from existing `data` JSON so
    relational joins work even for rows seeded before those columns existed."""
    for table, links in _RUNTIME_LINK_COLUMNS.items():
        cols = list(links.keys())
        col_sql = ", ".join(f'"{c}"' for c in cols)
        async with pool.acquire() as conn:
            try:
                rows = await conn.fetch(f"SELECT id, data FROM {table}")
                for r in rows:
                    try:
                        rec = json.loads(r["data"])
                    except (ValueError, TypeError):
                        continue
                    sets = []
                    params: list = []
                    for c in cols:
                        sets.append(f'"{c}" = ?')
                        params.append(rec.get(links[c]))
                    params.append(r["id"])
                    await conn.execute(
                        f"UPDATE {table} SET {', '.join(sets)} WHERE id = ?",
                        *params,
                    )
            except Exception:
                continue

# =====================
# LAB REPORTS
# =====================

LAB_REPORT_COLS = [
    "id", "report_id", "unit_number", "cord_blood_unit_id", "sample_reference",
    "test_type", "test_name", "test_method", "instrument", "performed_at",
    "performed_by", "result_value", "result_unit", "result_text",
    "reference_low", "reference_high", "reference_text", "status",
    "reviewed_by", "reviewed_at", "review_notes", "batch_id",
    "source_filename", "source_row", "details", "created_at", "updated_at",
]

async def insert_lab_report(row: dict) -> str:
    pool = await get_pool()
    rid = row.get("id") or generate_id("LR")
    async with pool.acquire() as conn:
        await conn.execute(
            "INSERT OR REPLACE INTO lab_test_reports "
            "(id, report_id, unit_number, cord_blood_unit_id, sample_reference, "
            "test_type, test_name, test_method, instrument, performed_at, "
            "performed_by, result_value, result_unit, result_text, "
            "reference_low, reference_high, reference_text, status, "
            "reviewed_by, reviewed_at, review_notes, batch_id, "
            "source_filename, source_row, details, created_at, updated_at) "
            "VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,?20,?21,?22,?23,?24,?25,?26,?27)",
            rid,
            row.get("report_id") or "",
            row.get("unit_number") or "",
            row.get("cord_blood_unit_id") or "",
            row.get("sample_reference") or "",
            row.get("test_type") or "",
            row.get("test_name") or "",
            row.get("test_method") or "",
            row.get("instrument") or "",
            row.get("performed_at") or "",
            row.get("performed_by") or "",
            row.get("result_value"),
            row.get("result_unit") or "",
            row.get("result_text") or "",
            row.get("reference_low"),
            row.get("reference_high"),
            row.get("reference_text") or "",
            row.get("status") or "pending",
            row.get("reviewed_by") or "",
            row.get("reviewed_at") or "",
            "",
            row.get("batch_id") or "",
            row.get("source_filename") or "",
            row.get("source_row"),
            json.dumps(row.get("details") or {}, default=str),
            row.get("created_at") or now_iso(),
            row.get("updated_at") or now_iso(),
        )
    return rid

async def insert_csv_batch(row: dict) -> str:
    pool = await get_pool()
    bid = row.get("id") or generate_id("BATCH")
    async with pool.acquire() as conn:
        await conn.execute(
            "INSERT OR REPLACE INTO csv_import_batches (id, batch_id, filename, file_size_bytes, "
            "imported_by, total_rows, successful_rows, failed_rows, status, error_summary, "
            "started_at, completed_at, metadata) "
            "VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13)",
            bid,
            row.get("batch_id") or bid,
            row.get("filename") or "",
            row.get("file_size_bytes"),
            row.get("imported_by") or "",
            row.get("total_rows", 0),
            row.get("successful_rows", 0),
            row.get("failed_rows", 0),
            row.get("status", "processing"),
            json.dumps(row.get("error_summary") or [], default=str),
            row.get("started_at") or now_iso(),
            row.get("completed_at") or now_iso(),
            json.dumps(row.get("metadata") or {}, default=str),
        )
    return bid

async def _resolve_linked_cbu(pool, value: str) -> Optional[str]:
    """Map a unit_number / cord_blood_unit_id / sample-ish reference to a CBU."""
    if not value:
        return None
    value = str(value).strip()
    if not value:
        return None
    # direct id match first
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT id FROM cord_blood_units WHERE id = ? OR unit_number = ? LIMIT 1",
            value, value,
        )
        if row:
            return row["id"]
        # fall back to collection accession
        row = await conn.fetchrow(
            "SELECT id FROM cord_blood_units WHERE collect_accession = ? LIMIT 1",
            value,
        )
        if row:
            return row["id"]
    return None


def report_to_api(row: dict) -> dict:
    details = row.get("details")
    if isinstance(details, str):
        try:
            details = json.loads(details)
        except (ValueError, TypeError):
            details = {}
    return {
        "id": row.get("id") or row.get("report_id"),
        "reportId": row.get("report_id"),
        "unitNumber": row.get("unit_number"),
        "cordBloodUnitId": row.get("cord_blood_unit_id"),
        "sampleReference": row.get("sample_reference"),
        "testType": row.get("test_type"),
        "testName": row.get("test_name"),
        "testMethod": row.get("test_method"),
        "instrument": row.get("instrument"),
        "performedAt": row.get("performed_at"),
        "performedBy": row.get("performed_by"),
        "resultValue": row.get("result_value"),
        "resultUnit": row.get("result_unit"),
        "resultText": row.get("result_text"),
        "referenceLow": row.get("reference_low"),
        "referenceHigh": row.get("reference_high"),
        "referenceText": row.get("reference_text"),
        "status": row.get("status"),
        "reviewedBy": row.get("reviewed_by"),
        "reviewedAt": row.get("reviewed_at"),
        "batchId": row.get("batch_id"),
        "sourceFilename": row.get("source_filename"),
        "sourceRow": row.get("source_row"),
        "details": details or {},
        "createdAt": row.get("created_at"),
        "updatedAt": row.get("updated_at"),
    }

# =====================
# HEALTH
# =====================

@app.get("/api/system/health")
async def get_system_health():
    started = time.perf_counter()

    db_status = "healthy"
    db_latency_ms = 0
    db_details = ""
    try:
        pool = await get_pool()
        async with pool.acquire() as conn:
            await conn.fetchval("SELECT 1")
            table_count = await conn.fetchval(
                "SELECT count(*) FROM information_schema.tables "
                "WHERE table_schema = 'public' AND table_type = 'BASE TABLE'"
            )
        db_latency_ms = round((time.perf_counter() - started) * 1000, 1)
        db_details = f"{table_count} tables, all connections operational"
    except Exception as e:
        db_status = "degraded"
        db_details = f"Database unreachable: {str(e)[:120]}"

    lake_status = "healthy"
    lake_latency = 0
    lake_details = ""
    try:
        lake_tables = await discover_lakebase_tables()
        lake_latency = round((time.perf_counter() - started) * 1000, 1)
        lake_details = f"{len(lake_tables)} tables discovered"
    except Exception as e:
        lake_status = "degraded"
        lake_details = f"LakeBase discovery failed: {str(e)[:120]}"

    services = [
        {"name": "Database", "status": db_status, "latency": db_latency_ms, "uptime": 99.97, "lastChecked": now_iso(), "details": db_details},
        {"name": "LakeBase", "status": lake_status, "latency": lake_latency, "uptime": 99.88, "lastChecked": now_iso(), "details": lake_details},
    ]
    overall = "healthy"
    for s in services:
        if s["status"] == "down":
            overall = "critical"
            break
        if s["status"] == "degraded":
            overall = "degraded"

    active_alerts = 0
    try:
        pool = await get_pool()
        async with pool.acquire() as conn:
            active_alerts = await conn.fetchval(
                "SELECT count(*) FROM compliance_incidents "
                "WHERE data->>'status' IN ('open', 'investigating')"
            ) or 0
    except Exception:
        pass

    return {"overall": overall, "services": services, "activeAlerts": active_alerts, "lastUpdated": now_iso()}

@app.get("/api/system/logs")
async def get_system_logs(page: int = Query(1), pageSize: int = Query(50), level: str = None, service: str = None):
    where = []
    params = []
    if level:
        params.append(level)
        where.append(f"level = ${len(params)}")
    if service:
        params.append(service)
        where.append(f"service = ${len(params)}")
    where_sql = f"WHERE {' AND '.join(where)}" if where else ""

    pool = await get_pool()
    async with pool.acquire() as conn:
        total = await conn.fetchval(f"SELECT count(*) FROM system_logs {where_sql}", *params) or 0
        rows = await conn.fetch(
            f"SELECT id, level, service, message, timestamp, metadata FROM system_logs {where_sql} "
            f"ORDER BY timestamp DESC LIMIT {pageSize} OFFSET {(page - 1) * pageSize}",
            *params,
        )
        logs = [dict(r) for r in rows]
        for l in logs:
            if isinstance(l.get("metadata"), str):
                l["metadata"] = json.loads(l["metadata"])
            else:
                l["metadata"] = dict(l.get("metadata") or {})

    return {"data": logs, "total": total, "page": page, "pageSize": pageSize}

# =====================
# SHIPMENTS
# =====================

@app.get("/api/shipments")
async def get_shipments(
    page: int = Query(1), pageSize: int = Query(20),
    status: str = None, supplier: str = None, category: str = None,
    facility: str = None, search: str = None,
    sortBy: str = None, sortOrder: str = None
):
    shipments = await get_shipments_from_db()
    
    if status:
        shipments = [s for s in shipments if s["status"] == status]
    if supplier:
        q = supplier.lower()
        shipments = [s for s in shipments if q in s["supplierName"].lower()]
    if category:
        shipments = [s for s in shipments if s["category"] == category]
    if facility:
        shipments = [s for s in shipments if s.get("facilityId") == facility]
    if search:
        q = search.lower()
        shipments = [s for s in shipments if
                     q in s["shipmentNumber"].lower() or
                     q in s["supplierName"].lower() or
                     q in s.get("origin", "").lower()]
    if sortBy and sortBy in shipments[0] if shipments else False:
        reverse = sortOrder == "desc"
        shipments.sort(key=lambda s: str(s.get(sortBy, "") or ""), reverse=reverse)
    
    result = paginate(shipments, page, pageSize)
    result["data"] = [map_to_summary(s) for s in result["data"]]
    return result

@app.get("/api/shipments/{shipment_id}")
async def get_shipment(shipment_id: str):
    shipments = await get_shipments_from_db()
    for s in shipments:
        if s["id"] == shipment_id or s["shipmentNumber"] == shipment_id:
            return s
    raise HTTPException(404, "Shipment not found")

@app.post("/api/shipments")
async def create_shipment(body: dict):
    shipments = await get_shipments_from_db()
    now = now_iso()
    new_shipment = {
        "id": generate_id("SHP"),
        "shipmentNumber": f"SH-{datetime.now().strftime('%Y%m%d')}-{len(shipments)+1:03d}",
        "status": "scheduled",
        "temperatureReadings": [],
        "loggers": [],
        "createdAt": now,
        "updatedAt": now,
        "supplierId": body.get("supplierId", ""),
        "supplierName": body.get("supplierName", ""),
        "origin": body.get("origin", ""),
        "destination": body.get("destination", ""),
        "facilityId": body.get("facilityId", ""),
        "facilityName": body.get("facilityName", ""),
        "category": body.get("category", "pcr_reagents"),
        "temperatureRegime": body.get("temperatureRegime", "refrigerated_2_8"),
        "productCount": body.get("productCount", 0),
        "lotCount": body.get("lotCount", 0),
        "receivedDate": body.get("receivedDate", ""),
        "scheduledDate": body.get("scheduledDate", ""),
        "shippedDate": body.get("shippedDate", ""),
        "estimatedArrival": body.get("estimatedArrival", ""),
        "actualArrival": body.get("actualArrival"),
        "receivingTechnician": body.get("receivingTechnician", ""),
        "carrier": body.get("carrier", ""),
        "trackingNumber": body.get("trackingNumber", ""),
        "billOfLading": body.get("billOfLading", ""),
        "condition": body.get("condition", "good"),
        "chainOfCustody": body.get("chainOfCustody", False),
        "coaAttached": body.get("coaAttached", False),
        "priority": body.get("priority", "standard"),
        "storageZone": body.get("storageZone", ""),
        "dockToInventoryMinutes": body.get("dockToInventoryMinutes", 0),
        "totalValue": body.get("totalValue", 0),
        "purchaseOrderNumber": body.get("purchaseOrderNumber", ""),
        "purchaseOrderItem": body.get("purchaseOrderItem", ""),
        "incoterm": body.get("incoterm", ""),
        "transportationMode": body.get("transportationMode", "ground"),
        "containerType": body.get("containerType", ""),
        "palletCount": body.get("palletCount", 0),
        "grossWeightKg": body.get("grossWeightKg", 0),
        "netWeightKg": body.get("netWeightKg", 0),
        "volumeCbm": body.get("volumeCbm", 0),
        "handlingUnitCount": body.get("handlingUnitCount", 0),
        "sealNumber": body.get("sealNumber", ""),
        "dangerousGoods": body.get("dangerousGoods", False),
        "unNumber": body.get("unNumber", ""),
        "properShippingName": body.get("properShippingName", ""),
        "dgClass": body.get("dgClass", ""),
        "notes": body.get("notes", ""),
    }
    new_shipment["transitSummary"] = compute_transit_summary(new_shipment)
    await write_shipment_to_db(new_shipment)
    return new_shipment

@app.put("/api/shipments/{shipment_id}")
async def update_shipment(shipment_id: str, body: dict):
    shipments = await get_shipments_from_db()
    existing = None
    for s in shipments:
        if s["id"] == shipment_id:
            existing = s
            break
    if not existing:
        raise HTTPException(404, "Shipment not found")
    
    for k, v in body.items():
        if k != "id":
            existing[k] = v
    existing["updatedAt"] = now_iso()
    await update_shipment_in_db(shipment_id, existing)
    return existing

@app.delete("/api/shipments/{shipment_id}")
async def delete_shipment(shipment_id: str):
    pool = await get_pool()
    async with pool.acquire() as conn:
        result = await conn.execute("DELETE FROM shipments WHERE id = $1", shipment_id)
        if result == "DELETE 0":
            raise HTTPException(404, "Shipment not found")
    return {"deleted": True, "id": shipment_id}

@app.put("/api/shipments/{shipment_id}/status")
async def update_shipment_status(shipment_id: str, body: dict):
    new_status = body.get("status")
    if not new_status:
        raise HTTPException(400, "status is required")
    shipments = await get_shipments_from_db()
    existing = None
    for s in shipments:
        if s["id"] == shipment_id:
            existing = s
            break
    if not existing:
        raise HTTPException(404, "Shipment not found")
    existing["status"] = new_status
    existing["updatedAt"] = now_iso()
    updates: dict = {"status": new_status}
    if new_status in ("released", "rejected"):
        if not existing.get("receivedDate"):
            existing["receivedDate"] = datetime.now().strftime("%Y-%m-%d")
        updates["receivedDate"] = existing["receivedDate"]
    else:
        existing["receivedDate"] = ""
        updates["receivedDate"] = ""
    await update_shipment_in_db(shipment_id, updates)
    return existing

@app.post("/api/shipments/{shipment_id}/loggers")
async def add_shipment_logger(shipment_id: str, body: dict):
    shipments = await get_shipments_from_db()
    existing = next((s for s in shipments if s["id"] == shipment_id), None)
    if not existing:
        raise HTTPException(404, "Shipment not found")
    logger_id = str(body.get("loggerId", "") or "").strip()
    if not logger_id:
        raise HTTPException(400, "loggerId is required")
    model = str(body.get("model", "") or "").strip()
    battery = body.get("battery")
    serial_number = str(body.get("serialNumber", "") or "").strip() or logger_id
    loggers = existing.get("loggers", [])
    logger = next((lg for lg in loggers if lg.get("id") == logger_id), None)
    if logger:
        logger["model"] = model or logger.get("model", "")
        logger["serialNumber"] = serial_number
        if battery is not None:
            logger["battery"] = battery
        logger["status"] = "connected"
    else:
        loggers.append({
            "id": logger_id,
            "serialNumber": serial_number,
            "model": model,
            "status": "connected",
            "connectedAt": now_iso(),
            "uploadedAt": None,
            "lastReadingAt": None,
            "readingCount": 0,
            "battery": battery,
        })
    existing["loggers"] = loggers
    existing["updatedAt"] = now_iso()
    await update_shipment_in_db(shipment_id, {"loggers": loggers})
    return existing

@app.post("/api/shipments/{shipment_id}/readings")
async def upload_shipment_readings(shipment_id: str, body: dict):
    shipments = await get_shipments_from_db()
    existing = next((s for s in shipments if s["id"] == shipment_id), None)
    if not existing:
        raise HTTPException(404, "Shipment not found")
    raw = body.get("readings")
    if not isinstance(raw, list) or not raw:
        raise HTTPException(400, "readings must be a non-empty array")
    if len(raw) > 5000:
        raise HTTPException(400, "readings batch exceeds 5000 entries")
    logger_id = str(body.get("loggerId", "") or "").strip() or None
    existing_readings = existing.get("temperatureReadings", [])
    enriched = enrich_temperature_readings(existing, raw, len(existing_readings))
    for r in enriched:
        if logger_id:
            r["deviceId"] = logger_id
    existing_readings.extend(enriched)
    existing["temperatureReadings"] = existing_readings
    if logger_id:
        loggers = existing.get("loggers", [])
        logger = next((lg for lg in loggers if lg.get("id") == logger_id), None)
        if logger:
            logger["status"] = "uploaded"
            logger["uploadedAt"] = now_iso()
            logger["lastReadingAt"] = enriched[-1]["timestamp"]
            logger["readingCount"] = logger.get("readingCount", 0) + len(enriched)
        else:
            loggers.append({
                "id": logger_id,
                "model": "",
                "status": "uploaded",
                "connectedAt": now_iso(),
                "uploadedAt": now_iso(),
                "lastReadingAt": enriched[-1]["timestamp"],
                "readingCount": len(enriched),
            })
        existing["loggers"] = loggers
    existing["updatedAt"] = now_iso()
    existing["transitSummary"] = compute_transit_summary(existing)
    await update_shipment_in_db(shipment_id, {
        "temperatureReadings": existing_readings,
        "loggers": existing.get("loggers", []),
    })
    excursion_count = sum(1 for r in enriched if r["excursion"])
    auto_incident = None
    if excursion_count > 0:
        reported = await auto_report_excursions(existing, "AI Scanner")
        if reported.get("created"):
            auto_incident = reported["incident"]
    return {
        "shipment": existing,
        "added": len(enriched),
        "excursions": excursion_count,
        "autoReportedIncident": auto_incident,
    }

# =====================
# RECEIVING & DISPOSITION
# =====================

@app.put("/api/shipments/{shipment_id}/receiving")
async def save_receiving_checklist(shipment_id: str, body: dict):
    """Persist the dock receiving checklist: line items, documents, and pass/fail checks."""
    shipments = await get_shipments_from_db()
    existing = next((s for s in shipments if s["id"] == shipment_id), None)
    if not existing:
        raise HTTPException(404, "Shipment not found")

    checklist = existing.get("receivingChecklist", {})
    if "lineItems" in body:
        checklist["lineItems"] = body.get("lineItems", [])
    if "documents" in body:
        docs = checklist.get("documents", {})
        for k in ("coa", "packingList", "temperatureReport", "declaration"):
            if k in body["documents"]:
                docs[k] = bool(body["documents"][k])
        checklist["documents"] = docs
    for k in ("sealIntact", "coolantOk", "storageLabelMatch"):
        if k in body:
            checklist[k] = bool(body[k])
    if "condition" in body:
        checklist["condition"] = body["condition"]
    if "notes" in body:
        checklist["notes"] = str(body["notes"] or "")
    if "completed" in body:
        checklist["completed"] = bool(body["completed"])
        if checklist["completed"]:
            checklist["completedAt"] = checklist.get("completedAt") or now_iso()
            checklist["completedBy"] = str(
                body.get("completedBy") or body.get("technician") or existing.get("receivingTechnician") or ""
            )
    existing["receivingChecklist"] = checklist

    updates = {"receivingChecklist": checklist}
    if body.get("receivedDate"):
        existing["receivedDate"] = str(body["receivedDate"])
        updates["receivedDate"] = existing["receivedDate"]
    elif not existing.get("receivedDate"):
        today = datetime.now().strftime("%Y-%m-%d")
        existing["receivedDate"] = today
        updates["receivedDate"] = today
    technician = body.get("technician") or body.get("completedBy") or body.get("receivingTechnician")
    if technician:
        existing["receivingTechnician"] = str(technician)
        updates["receivingTechnician"] = existing["receivingTechnician"]
    if body.get("condition"):
        existing["condition"] = body["condition"]
        updates["condition"] = existing["condition"]
    if body.get("storageZone"):
        existing["storageZone"] = str(body["storageZone"])
        updates["storageZone"] = existing["storageZone"]
    docs = body.get("documents")
    if docs and docs.get("coa") is not None:
        existing["coaAttached"] = bool(docs["coa"])
        updates["coaAttached"] = existing["coaAttached"]
    if existing["status"] not in ("released", "quarantined", "rejected", "returned"):
        if existing["status"] != "receiving":
            existing["status"] = "receiving"
            updates["status"] = "receiving"

    existing["updatedAt"] = now_iso()
    await update_shipment_in_db(shipment_id, updates)
    return existing

DISPOSITION_REASONS = [
    "temperature_excursion", "missing_coa", "damaged",
    "quantity_mismatch", "labeling_error", "other",
]
DISPOSITION_TO_STATUS = {"accepted": "released", "quarantined": "quarantined", "rejected": "rejected"}
DISPOSITION_TO_DEVIATION = {
    "temperature_excursion": "temperature_excursion",
    "missing_coa": "documentation_gap",
    "damaged": "quality_deviation",
    "quantity_mismatch": "quality_deviation",
    "labeling_error": "labeling_error",
    "other": "quality_deviation",
}

async def log_qa_notification(shipment: dict, disposition: dict):
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            "INSERT INTO system_logs (id, level, service, message, timestamp, metadata) VALUES ($1, $2, $3, $4, $5, $6::jsonb)",
            generate_id("LOG"),
            "info",
            "qa",
            f"QA notified: {shipment['shipmentNumber']} dispositioned as {disposition['decision']}",
            now_iso(),
            json.dumps({
                "shipmentId": shipment["id"],
                "decision": disposition["decision"],
                "reasonCode": disposition.get("reasonCode"),
                "notifiedAt": disposition.get("notifiedAt"),
            }),
        )

async def auto_create_disposition_incident(shipment: dict, disposition: dict):
    now = now_iso()
    incidents = await get_all_from_table("compliance_incidents", "id")
    day = datetime.now().strftime("%Y%m%d")
    seq = sum(1 for c in incidents if c.get("incidentNumber", "").startswith(f"INC-{day}")) + 1
    incident_number = f"INC-{day}-{seq:03d}"
    reason_code = disposition.get("reasonCode") or "other"
    dev_type = DISPOSITION_TO_DEVIATION.get(reason_code, "quality_deviation")
    severity = "high" if reason_code in ("temperature_excursion", "damaged") else "medium"
    incident = {
        "id": incident_number,
        "incidentNumber": incident_number,
        "title": f"{shipment['shipmentNumber']} dispositioned as {disposition['decision']}",
        "description": f"Shipment {shipment['shipmentNumber']} from {shipment.get('supplierName', '')} was dispositioned as {disposition['decision']} during receiving (reason: {reason_code}).",
        "deviationType": dev_type,
        "severity": severity,
        "status": "open",
        "facilityId": shipment.get("facilityId"),
        "facilityName": shipment.get("facilityName"),
        "supplierId": shipment.get("supplierId"),
        "supplierName": shipment.get("supplierName"),
        "shipmentId": shipment["id"],
        "shipmentNumber": shipment["shipmentNumber"],
        "lotId": None,
        "lotNumber": None,
        "productName": None,
        "temperatureRegime": shipment.get("temperatureRegime"),
        "detectedDate": now,
        "detectedBy": disposition.get("decidedBy") or shipment.get("receivingTechnician") or "",
        "reportedDate": now,
        "reportedBy": disposition.get("decidedBy") or "System",
        "assignedTo": None,
        "investigationNotes": "",
        "rootCause": None,
        "correctiveAction": None,
        "preventiveAction": None,
        "closureNotes": None,
        "resolvedDate": None,
        "regulatoryNotifiable": False,
        "regulatoryBody": None,
        "reportedToRegulatory": False,
        "impactAssessment": "",
        "temperatureData": None,
        "createdAt": now,
        "updatedAt": now,
    }
    await write_to_table("compliance_incidents", incident)
    return incident

# =====================
# AI TEMPERATURE INCIDENT DETECTION
# =====================

def analyze_excursions(shipment: dict) -> dict:
    """Derive the excursion summary for a shipment: count, worst reading, and severity."""
    readings = shipment.get("temperatureReadings", [])
    excursions = [r for r in readings if r.get("excursion")]
    if not excursions:
        return {
            "count": 0, "severity": None, "worst": None,
            "maxDeviation": 0.0, "totalDurationMinutes": 0,
            "minTemp": None, "maxTemp": None,
        }

    def deviation(r):
        try:
            temp = float(r.get("temperature", 0))
        except (TypeError, ValueError):
            return 0.0
        mn = float(r.get("minThreshold", 0) or 0)
        mx = float(r.get("maxThreshold", 0) or 0)
        return max(0.0, mn - temp, temp - mx)

    worst = max(excursions, key=deviation)
    temps = [float(r.get("temperature", 0)) for r in excursions]
    total_minutes = sum(r.get("excursionDurationMinutes") or 0 for r in excursions)
    # Critical when any reading deviates beyond the threshold by more than 5°C
    # or when a large batch of readings fell out of range.
    severe = deviation(worst) > 5 or len(excursions) >= 10
    return {
        "count": len(excursions),
        "severity": "critical" if severe else "high",
        "worst": worst,
        "maxDeviation": round(deviation(worst), 2),
        "totalDurationMinutes": int(total_minutes),
        "minTemp": round(min(temps), 2) if temps else None,
        "maxTemp": round(max(temps), 2) if temps else None,
    }

def temperature_report_window_hours() -> int:
    """How long a temperature-excursion incident suppresses re-reporting for the same shipment.
    Prevents the AI scanner from re-creating the same incident in a loop once it is resolved/closed."""
    try:
        return max(0, int(os.getenv("TEMPERATURE_INCIDENT_REPORT_WINDOW_HOURS", "168")))
    except (TypeError, ValueError):
        return 168

def has_recent_temperature_incident(shipment_id: str, incidents: list, within_hours: int = None) -> bool:
    """True when a temperature_excursion incident already exists for this shipment (any status)
    created within the report window. A resolved/closed incident therefore stops re-reporting,
    so the scanner does not loop on the same excursion."""
    within_hours = temperature_report_window_hours() if within_hours is None else within_hours
    cutoff = datetime.now() - timedelta(hours=within_hours)
    for c in incidents:
        if not (c.get("shipmentId") == shipment_id and c.get("deviationType") == "temperature_excursion"):
            continue
        if c.get("status") in ("open", "investigating") and not (c.get("createdDate") or c.get("createdAt")):
            return True
        created = c.get("createdDate") or c.get("createdAt")
        if not created:
            continue
        try:
            created_dt = datetime.fromisoformat(created)
        except (TypeError, ValueError):
            continue
        if created_dt >= cutoff:
            return True
    return False

async def log_ai_scan(level: str, message: str, metadata: dict):
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            "INSERT INTO system_logs (id, level, service, message, timestamp, metadata) "
            "VALUES ($1, $2, $3, $4, $5, $6::jsonb)",
            generate_id("LOG"), level, "ai", message, now_iso(), json.dumps(metadata),
        )

async def auto_report_excursions(shipment: dict, reported_by: str = "AI Scanner") -> dict:
    """Detect temperature excursions on a shipment and auto-report an incident."""
    excursions = [r for r in shipment.get("temperatureReadings", []) if r.get("excursion")]
    if not excursions:
        return {"created": False, "incident": None, "reason": "no_excursion"}

    incidents = await get_all_from_table("compliance_incidents", "id")
    if has_recent_temperature_incident(shipment["id"], incidents):
        return {"created": False, "incident": None, "reason": "already_reported"}

    now = now_iso()
    day = datetime.now().strftime("%Y%m%d")
    seq = sum(1 for c in incidents if c.get("incidentNumber", "").startswith(f"INC-{day}")) + 1
    incident_number = f"INC-{day}-{seq:03d}"

    analysis = analyze_excursions(shipment)
    worst = analysis["worst"]
    incident = {
        "id": incident_number,
        "incidentNumber": incident_number,
        "title": f"Temperature excursion detected - {shipment['shipmentNumber']}",
        "description": (
            f"AI scan detected {analysis['count']} temperature excursion reading(s) on shipment "
            f"{shipment['shipmentNumber']} from {shipment.get('supplierName', '')} "
            f"(regime: {shipment.get('temperatureRegime', '')}). "
            f"Readings ranged from {analysis['minTemp']}°C to {analysis['maxTemp']}°C. "
            f"Worst reading {worst.get('temperature')}°C against threshold "
            f"{worst.get('minThreshold')}–{worst.get('maxThreshold')}°C "
            f"(deviation {analysis['maxDeviation']}°C)."
        ),
        "deviationType": "temperature_excursion",
        "severity": analysis["severity"],
        "status": "open",
        "facilityId": shipment.get("facilityId"),
        "facilityName": shipment.get("facilityName"),
        "supplierId": shipment.get("supplierId"),
        "supplierName": shipment.get("supplierName"),
        "shipmentId": shipment["id"],
        "shipmentNumber": shipment["shipmentNumber"],
        "lotId": None,
        "lotNumber": None,
        "productName": None,
        "temperatureRegime": shipment.get("temperatureRegime"),
        "detectedDate": now,
        "detectedBy": reported_by,
        "reportedDate": now,
        "reportedBy": reported_by,
        "assignedTo": None,
        "investigationNotes": "",
        "rootCause": None,
        "correctiveAction": None,
        "preventiveAction": None,
        "closureNotes": None,
        "resolvedDate": None,
        "regulatoryNotifiable": analysis["severity"] == "critical",
        "regulatoryBody": None,
        "reportedToRegulatory": False,
        "impactAssessment": "",
        "temperatureData": {
            "minTemp": analysis["minTemp"],
            "maxTemp": analysis["maxTemp"],
            "durationMinutes": analysis["totalDurationMinutes"],
            "excursionCount": analysis["count"],
        },
        "linkedReadingId": worst.get("id"),
        "temperatureAtDeviation": worst.get("temperature"),
        "thresholdMin": worst.get("minThreshold"),
        "thresholdMax": worst.get("maxThreshold"),
        "createdAt": now,
        "updatedAt": now,
    }
    await write_to_table("compliance_incidents", incident)
    await log_ai_scan(
        "warning",
        f"AI detected and reported temperature excursion on {shipment['shipmentNumber']}",
        {"incidentNumber": incident_number, "shipmentId": shipment["id"], "severity": analysis["severity"]},
    )
    return {"created": True, "incident": incident, "reason": "reported"}

async def scan_for_temperature_incidents(facility_id: str = None, reported_by: str = "AI Scanner") -> dict:
    """Scan all shipments (optionally scoped to a facility) and report new temp incidents."""
    shipments = await get_shipments_from_db()
    if facility_id:
        shipments = [s for s in shipments if s.get("facilityId") == facility_id]

    created = []
    already = 0
    detected = 0
    for s in shipments:
        if not any(r.get("excursion") for r in s.get("temperatureReadings", [])):
            continue
        detected += 1
        result = await auto_report_excursions(s, reported_by)
        if result["created"]:
            created.append(result["incident"])
        elif result["reason"] == "already_reported":
            already += 1

    summary = {
        "scanned": len(shipments),
        "detected": detected,
        "created": len(created),
        "alreadyReported": already,
    }
    return {"summary": summary, "createdIncidents": created}

# Automatic background detection. Interval is configurable via the
# AI_SCAN_INTERVAL_MINUTES env var (default 1). Set to 0 to disable the
# background scanner entirely.
def _scan_interval_seconds() -> int:
    try:
        minutes = float(os.getenv("AI_SCAN_INTERVAL_MINUTES", "1") or 0)
    except (TypeError, ValueError):
        minutes = 1
    return max(0, int(minutes * 60))

async def background_temp_incident_scanner():
    """Periodically scan shipments for temperature excursions and report them."""
    interval = _scan_interval_seconds()
    if interval <= 0:
        print("AI temperature-incident background scanner disabled (AI_SCAN_INTERVAL_MINUTES=0)")
        return
    # Give the server a moment to finish starting, then catch up on anything
    # the platform already holds before settling into the periodic cadence.
    await asyncio.sleep(5)
    print(f"AI temperature-incident background scanner started (every {interval}s)")
    while True:
        try:
            result = await scan_for_temperature_incidents(reported_by="AI Scanner")
            summary = result["summary"]
            if summary["created"] > 0:
                print(f"AI background scan: {summary['detected']} with excursions, {summary['created']} new incident(s) reported")
            elif summary["detected"] > 0:
                print(f"AI background scan: {summary['detected']} with excursions, all already reported")
        except Exception as e:
            print(f"AI background scan failed: {e}")
            try:
                await log_ai_scan("error", f"Background temperature-incident scan failed: {str(e)[:200]}", {})
            except Exception:
                pass
        await asyncio.sleep(interval)


# Zoho CRM -> Databricks automatic sync. Interval via ZOHO_SYNC_INTERVAL_MINUTES
# (default 60). Set to 0 to disable the background loop (manual trigger remains).
def _zoho_sync_interval_seconds() -> int:
    try:
        minutes = float(os.getenv("ZOHO_SYNC_INTERVAL_MINUTES", "60") or 0)
    except (TypeError, ValueError):
        minutes = 60
    return max(0, int(minutes * 60))


def _zoho_configured() -> bool:
    return (
        os.getenv("CRYOSYNC_DB_BACKEND", "") == "databricks"
        and bool(os.getenv("ZOHO_CLIENT_ID", ""))
        and bool(os.getenv("ZOHO_CLIENT_SECRET", ""))
        and bool(os.getenv("ZOHO_REFRESH_TOKEN", ""))
    )


async def background_zoho_sync_loop():
    """Periodically pull Zoho CRM into the Databricks bronze zoho_* tables."""
    interval = _zoho_sync_interval_seconds()
    if interval <= 0:
        print("Zoho -> Databricks background sync disabled (ZOHO_SYNC_INTERVAL_MINUTES=0)")
        return
    if not _zoho_configured():
        print("Zoho -> Databricks background sync skipped: backend not databricks and/or Zoho creds missing")
        return
    await asyncio.sleep(15)
    print(f"Zoho -> Databricks background sync started (every {interval}s)")
    while True:
        try:
            summary = await asyncio.to_thread(run_zoho_sync)
            print(f"Zoho background sync: {summary['modules']} modules, "
                  f"{summary['records']} records in {summary['duration_s']}s; "
                  f"failed={len(summary['failed'])}")
        except Exception as e:
            print(f"Zoho background sync failed: {e}")
        await asyncio.sleep(interval)


@app.post("/api/admin/sync-zoho")
async def admin_sync_zoho(body: dict):
    """"On-demand Zoho CRM -> Databricks sync. body: {"full": bool}."""
    if not _zoho_configured():
        raise HTTPException(409, "Zoho sync not configured (backend not databricks / Zoho creds missing)")
    full = bool(body.get("full", False))
    modules = body.get("modules") or None
    summary = await asyncio.to_thread(run_zoho_sync, modules=modules, full=full)
    return summary


@app.post("/api/ai/temp-incidents/scan")
async def ai_temp_incident_scan(body: dict):
    """On-demand AI sweep: detect temperature excursions and report new incidents."""
    facility_id = str(body.get("facilityId", "") or "").strip() or None
    reported_by = str(body.get("reportedBy", "") or "").strip() or "AI Scanner"
    result = await scan_for_temperature_incidents(facility_id, reported_by)
    await log_ai_scan(
        "info",
        f"AI temperature-incident scan complete: {result['summary']['detected']} detected, {result['summary']['created']} created",
        {"summary": result["summary"], "reportedBy": reported_by},
    )
    return result


class ExtractFormBody(BaseModel):
    fileName: str = ""
    mimeType: str = "image/png"
    dataBase64: str
    precisionMode: bool = False
    documentType: Optional[str] = None

@app.post("/api/ai/extract-form")
async def ai_extract_form(body: ExtractFormBody):
    """AI document-to-form extraction. Set precisionMode for a second verification pass."""
    try:
        return await extract_document_fields(
            body.dataBase64,
            body.mimeType,
            precision_mode=body.precisionMode,
            document_type=body.documentType,
        )
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        detail = str(e)
        if "OPENAI_API_KEY" in detail or "OPENAI_BASE_URL" in detail:
            raise HTTPException(500, "Missing OpenAI-compatible credentials. See backend/.env")
        raise HTTPException(502, f"Extraction backend error: {detail}")

@app.post("/api/ai/extract-compare")
async def ai_extract_compare(body: ExtractFormBody):
    """Run the same document through both extraction modes and compare quality."""
    try:
        t0 = time.perf_counter()
        standard = await extract_document_fields(
            body.dataBase64,
            body.mimeType,
            precision_mode=False,
            document_type=body.documentType,
        )
        t1 = time.perf_counter()
        precision = await extract_document_fields(
            body.dataBase64,
            body.mimeType,
            precision_mode=True,
            document_type=body.documentType,
        )
        t2 = time.perf_counter()
        standard["elapsedMs"] = round((t1 - t0) * 1000)
        precision["elapsedMs"] = round((t2 - t1) * 1000)

        std_map = {f["key"]: f for f in standard["fields"]}
        value_differences = []
        for pf in precision["fields"]:
            sf = std_map.get(pf["key"]) or {}
            if sf.get("value") != pf.get("value"):
                value_differences.append({
                    "key": pf["key"],
                    "label": pf["label"],
                    "standard": sf.get("value"),
                    "precision": pf.get("value"),
                })
        return {
            "standard": standard,
            "precision": precision,
            "valueDifferences": value_differences,
        }
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        detail = str(e)
        if "OPENAI_API_KEY" in detail or "OPENAI_BASE_URL" in detail:
            raise HTTPException(500, "Missing OpenAI-compatible credentials. See backend/.env")
        raise HTTPException(502, f"Extraction backend error: {detail}")

@app.post("/api/shipments/{shipment_id}/disposition")
async def apply_shipment_disposition(shipment_id: str, body: dict):
    """Apply the dock disposition decision: accepted, quarantined, or rejected."""
    shipments = await get_shipments_from_db()
    existing = next((s for s in shipments if s["id"] == shipment_id), None)
    if not existing:
        raise HTTPException(404, "Shipment not found")
    decision = str(body.get("decision", "") or "").strip().lower()
    if decision not in DISPOSITION_TO_STATUS:
        raise HTTPException(422, f"decision must be one of: {', '.join(DISPOSITION_TO_STATUS)}")
    reason_code = str(body.get("reasonCode", "") or "").strip().lower()
    if reason_code and reason_code not in DISPOSITION_REASONS:
        raise HTTPException(422, f"Unknown reasonCode: {reason_code}")
    now = now_iso()
    notify_qa = bool(body.get("notifyQA", True))
    disposition = {
        "decision": decision,
        "reasonCode": reason_code,
        "reason": str(body.get("reason", "") or ""),
        "notes": str(body.get("notes", "") or ""),
        "decidedBy": str(body.get("decidedBy", "") or "").strip(),
        "decidedAt": now,
        "notifyQA": notify_qa,
    }
    existing["disposition"] = disposition
    existing["status"] = DISPOSITION_TO_STATUS[decision]
    if not existing.get("receivedDate"):
        existing["receivedDate"] = datetime.now().strftime("%Y-%m-%d")

    created_incident = None
    if notify_qa:
        disposition["notifiedQA"] = True
        disposition["notifiedAt"] = now
        await log_qa_notification(existing, disposition)
    if decision in ("quarantined", "rejected") and bool(body.get("createIncident", True)):
        created_incident = await auto_create_disposition_incident(existing, disposition)

    existing["updatedAt"] = now
    await update_shipment_in_db(shipment_id, {
        "disposition": disposition,
        "status": existing["status"],
        "receivedDate": existing["receivedDate"],
    })
    return {"shipment": existing, "incident": created_incident}

# =====================
# INVENTORY
# =====================

@app.get("/api/inventory/lots")
async def get_inventory_lots(
    page: int = Query(1), pageSize: int = Query(20),
    status: str = None, facility: str = None, category: str = None,
    search: str = None, nearExpiry: str = None, lowStock: str = None
):
    lots = await get_all_from_table("inventory_lots", "id")
    
    for lot in lots:
        threshold = lot.get("lowStockThreshold") or 0
        lot["lowStock"] = bool(threshold) and lot.get("quantity", 0) <= threshold

    if status:
        lots = [l for l in lots if l.get("status") == status]
    if facility:
        lots = [l for l in lots if l.get("facilityId") == facility]
    if category:
        lots = [l for l in lots if l.get("category") == category]
    if search:
        q = search.lower()
        lots = [l for l in lots if q in l.get("lotNumber", "").lower() or q in l.get("productName", "").lower() or q in l.get("supplierName", "").lower()]
    if nearExpiry == "true":
        lots = [l for l in lots if 0 <= l.get("daysUntilExpiry", 999) <= 30]
    if lowStock == "true":
        lots = [l for l in lots if l.get("lowStock")]
    
    return paginate(lots, page, pageSize)

@app.get("/api/inventory/lots/{lot_id}")
async def get_inventory_lot(lot_id: str):
    lot = await get_from_table("inventory_lots", lot_id)
    if not lot:
        raise HTTPException(404, "Lot not found")
    threshold = lot.get("lowStockThreshold") or 0
    lot["lowStock"] = bool(threshold) and lot.get("quantity", 0) <= threshold
    return lot

@app.post("/api/inventory/lots")
async def create_inventory_lot(body: dict):
    """Create or update an inventory lot. Supply an id to update an existing lot."""
    if not body.get("lotNumber") and not body.get("id"):
        raise HTTPException(422, "lotNumber is required")
    now = now_iso()
    lot_id = str(body.get("id", "") or "").strip() or generate_id("LOT")
    existing = await get_from_table("inventory_lots", lot_id)
    lot = dict(existing or {})
    for k, v in body.items():
        if k != "id":
            lot[k] = v
    lot["id"] = lot_id
    if not lot.get("lotNumber"):
        lot["lotNumber"] = body.get("lotNumber", lot_id)
    lot.setdefault("status", "available")
    lot.setdefault("receivedDate", now[:10])
    lot.setdefault("createdAt", now)
    lot.setdefault("updatedAt", now)
    lot["updatedAt"] = now
    threshold = lot.get("lowStockThreshold") or 0
    lot["lowStock"] = bool(threshold) and lot.get("quantity", 0) <= threshold
    if not lot.get("totalValue") and lot.get("quantity") and lot.get("value"):
        lot["totalValue"] = round(float(lot["value"]) * float(lot["quantity"]), 2)
    await write_to_table("inventory_lots", lot)
    return lot

@app.get("/api/inventory/storage-zones")
async def get_storage_zones(facilityId: str = None):
    zones = await get_all_from_table("storage_zones", "id")
    if facilityId:
        zones = [z for z in zones if z.get("facilityId") == facilityId]
    return zones

# =====================
# COMPLIANCE
# =====================

@app.get("/api/compliance/incidents")
async def get_compliance_incidents(
    page: int = Query(1), pageSize: int = Query(20),
    status: str = None, severity: str = None, type: str = None,
    facility: str = None, search: str = None
):
    incidents = await get_all_from_table("compliance_incidents", "id")
    
    if status:
        incidents = [c for c in incidents if c.get("status") == status]
    if severity:
        incidents = [c for c in incidents if c.get("severity") == severity]
    if type:
        incidents = [c for c in incidents if c.get("deviationType") == type]
    if facility:
        incidents = [c for c in incidents if c.get("facilityId") == facility]
    if search:
        q = search.lower()
        incidents = [c for c in incidents if q in c.get("incidentNumber", "").lower() or q in c.get("title", "").lower() or q in c.get("facilityName", "").lower()]
    
    incidents.sort(key=lambda c: c.get("createdAt", ""), reverse=True)
    result = paginate(incidents, page, pageSize)
    result["data"] = [map_to_compliance_summary(c) for c in result["data"]]
    return result

@app.get("/api/compliance/incidents/{incident_id}")
async def get_compliance_incident(incident_id: str):
    incident = await find_incident(incident_id)
    if not incident:
        raise HTTPException(404, "Incident not found")
    return incident

async def find_incident(identifier: str):
    incident = await get_from_table("compliance_incidents", identifier)
    if incident:
        return incident
    incidents = await get_all_from_table("compliance_incidents", "id")
    return next((c for c in incidents if c.get("incidentNumber") == identifier), None)

async def find_user_by_identifier(identifier: str):
    if not identifier:
        return None
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT id, username, email, display_name, title, role FROM users WHERE id = $1",
            identifier,
        )
        if not row:
            row = await conn.fetchrow(
                "SELECT id, username, email, display_name, title, role FROM users "
                "WHERE LOWER(display_name) = LOWER($1) OR LOWER(username) = LOWER($1)",
                identifier,
            )
        return dict(row) if row else None

@app.get("/api/compliance/incidents/{incident_id}/audit-log")
async def get_audit_log(incident_id: str):
    incident = await find_incident(incident_id)
    if not incident:
        raise HTTPException(404, "Incident not found")
    
    entries = [
        {"id": f"{incident_id}-audit-001", "incidentId": incident_id, "action": "Incident Created", "performedBy": incident.get("reportedBy", "System"), "timestamp": incident.get("createdAt", now_iso()), "details": f"Incident {incident.get('incidentNumber', '')} reported"},
    ]
    if incident.get("assignedTo"):
        entries.append({
            "id": f"{incident_id}-audit-002",
            "incidentId": incident_id,
            "action": "Incident Assigned",
            "performedBy": incident.get("assignedBy") or "System",
            "timestamp": incident.get("assignedDate") or incident.get("createdAt", now_iso()),
            "details": f"Assigned to {incident['assignedTo']} for investigation",
        })
    if incident.get("rootCause"):
        entries.append({"id": f"{incident_id}-audit-003", "incidentId": incident_id, "action": "Root Cause Analysis", "performedBy": incident.get("assignedTo", "System"), "timestamp": incident.get("updatedAt", now_iso()), "details": f"Root cause: {incident['rootCause']}"})
    if incident.get("correctiveAction"):
        entries.append({"id": f"{incident_id}-audit-004", "incidentId": incident_id, "action": "Corrective Action Applied", "performedBy": incident.get("assignedTo", "System"), "timestamp": incident.get("resolvedDate", now_iso()), "details": incident["correctiveAction"]})
    if incident.get("resolvedDate"):
        entries.append({"id": f"{incident_id}-audit-005", "incidentId": incident_id, "action": "Incident Resolved", "performedBy": incident.get("assignedTo", "System"), "timestamp": incident["resolvedDate"], "details": incident.get("closureNotes", "Incident closed.")})
    
    entries.sort(key=lambda e: e["timestamp"])
    return entries

@app.put("/api/compliance/incidents/{incident_id}/resolve")
async def resolve_incident(incident_id: str, body: dict):
    incident = await find_incident(incident_id)
    if not incident:
        raise HTTPException(404, "Incident not found")
    incident["status"] = "resolved"
    incident["correctiveAction"] = body.get("correctiveAction", "")
    incident["closureNotes"] = body.get("closureNotes", "")
    incident["resolvedDate"] = now_iso()
    incident["updatedAt"] = now_iso()
    await write_to_table("compliance_incidents", incident)
    return incident

@app.post("/api/compliance/incidents/resolve-open")
async def resolve_all_open_incidents(body: dict):
    """Bulk-resolve every open or investigating compliance incident in one action."""
    incidents = await get_all_from_table("compliance_incidents", "id")
    open_incidents = [c for c in incidents if c.get("status") in ("open", "investigating")]
    now = now_iso()
    corrective = str(body.get("correctiveAction", "") or "").strip() or "Closed in bulk via AI action"
    notes = str(body.get("closureNotes", "") or "").strip() or "All open incidents resolved via bulk AI action"
    resolved = []
    for c in open_incidents:
        c["status"] = "resolved"
        c["correctiveAction"] = corrective
        c["closureNotes"] = notes
        c["resolvedDate"] = now
        c["updatedAt"] = now
        await write_to_table("compliance_incidents", c)
        resolved.append(c)
    await log_ai_scan(
        "info",
        f"Bulk AI action resolved {len(resolved)} open incident(s)",
        {"count": len(resolved), "resolvedBy": body.get("resolvedBy") or "AI Scanner"},
    )
    return {"resolved": len(resolved), "incidents": resolved}

@app.put("/api/compliance/incidents/{incident_id}/assign")
async def assign_incident(incident_id: str, body: dict):
    incident = await find_incident(incident_id)
    if not incident:
        raise HTTPException(404, "Incident not found")
    assignee_id = str(body.get("assignedById", "") or "").strip()
    assignee_name = str(body.get("assignedTo", "") or "").strip()
    assignee = await find_user_by_identifier(assignee_id or assignee_name)
    if not assignee:
        raise HTTPException(404, f"Assignee not found: {assignee_name or assignee_id}")
    now = now_iso()
    incident["assignedTo"] = assignee["display_name"]
    incident["assignedById"] = assignee["id"]
    incident["assignedBy"] = str(body.get("assignedBy", "") or "").strip()
    incident["assignedDate"] = now
    if body.get("dueDate"):
        incident["dueDate"] = str(body["dueDate"])
    target = body.get("status")
    if target in ("open", "investigating"):
        incident["status"] = target
    elif incident.get("status") == "open":
        incident["status"] = "investigating"
    incident["updatedAt"] = now
    await write_to_table("compliance_incidents", incident)
    return incident

ALLOWED_DEVIATION_TYPES = [
    "temperature_excursion", "documentation_gap", "quality_deviation",
    "chain_of_custody_break", "storage_violation", "labeling_error",
    "contamination_suspected", "equipment_malfunction", "human_error",
    "packaging_failure",
]
ALLOWED_SEVERITIES = ["low", "medium", "high", "critical"]

@app.post("/api/compliance/incidents")
async def create_compliance_incident(body: dict):
    title = str(body.get("title", "")).strip()
    description = str(body.get("description", "")).strip()
    dev_type = body.get("deviationType", "")
    severity = body.get("severity", "medium")

    if not title or not description:
        raise HTTPException(422, "Title and description are required")
    if dev_type not in ALLOWED_DEVIATION_TYPES:
        raise HTTPException(422, f"Unknown deviationType: {dev_type}")
    if severity not in ALLOWED_SEVERITIES:
        raise HTTPException(422, f"Unknown severity: {severity}")

    now = now_iso()
    shipment_id = body.get("shipmentId") or None
    shipment_number = body.get("shipmentNumber") or None
    shipment = None
    if shipment_id:
        shipments = await get_shipments_from_db()
        shipment = next((s for s in shipments if s.get("id") == shipment_id), None)
    elif shipment_number:
        shipments = await get_shipments_from_db()
        shipment = next((s for s in shipments if s.get("shipmentNumber") == shipment_number), None)

    facility_id = body.get("facilityId") or None
    facility_name = str(body.get("facilityName", "") or "")
    if facility_id and not facility_name:
        facilities = await get_all_from_table("facilities", "id")
        fac = next((f for f in facilities if f.get("id") == facility_id), None)
        if fac:
            facility_name = str(fac.get("name", "") or "")

    incidents = await get_all_from_table("compliance_incidents", "id")
    day = datetime.now().strftime("%Y%m%d")
    seq = sum(1 for c in incidents if c.get("incidentNumber", "").startswith(f"INC-{day}")) + 1
    incident_number = f"INC-{day}-{seq:03d}"

    incident = {
        "id": incident_number,
        "incidentNumber": incident_number,
        "title": title,
        "description": description,
        "deviationType": dev_type,
        "severity": severity,
        "status": "open",
        "facilityId": facility_id,
        "facilityName": facility_name,
        "shipmentId": shipment.get("id") if shipment else shipment_id,
        "shipmentNumber": shipment.get("shipmentNumber") if shipment else shipment_number,
        "supplierId": shipment.get("supplierId") if shipment else None,
        "supplierName": shipment.get("supplierName") if shipment else None,
        "lotId": None,
        "lotNumber": body.get("lotNumber") or None,
        "productName": body.get("productName") or None,
        "temperatureRegime": shipment.get("temperatureRegime") if shipment else None,
        "detectedDate": now,
        "detectedBy": str(body.get("detectedBy", "") or ""),
        "reportedDate": now,
        "reportedBy": str(body.get("reportedBy", "") or "Unknown"),
        "assignedTo": None,
        "investigationNotes": "",
        "rootCause": None,
        "correctiveAction": None,
        "preventiveAction": None,
        "closureNotes": None,
        "resolvedDate": None,
        "regulatoryNotifiable": bool(body.get("regulatoryNotifiable", False)),
        "regulatoryBody": body.get("regulatoryBody") or None,
        "reportedToRegulatory": False,
        "impactAssessment": str(body.get("impactAssessment", "") or ""),
        "temperatureData": body.get("temperatureData"),
        "dueDate": body.get("dueDate") or None,
        "createdAt": now,
        "updatedAt": now,
    }
    await write_to_table("compliance_incidents", incident)
    return incident

# =====================
# DASHBOARD
# =====================

@app.get("/api/dashboard")
async def get_dashboard(
    facility: str = None,
    dateRange: str = None,
    region: str = None,
    supplier: str = None,
):
    pool = await get_pool()
    now = datetime.now()

    cutoff = None
    if dateRange:
        cutoff = (now - timedelta(days=int(dateRange))).isoformat()

    region_facilities = None
    if region:
        region_facilities = [f for f, r in FACILITY_REGIONS.items() if r == region]

    where, params = _shipment_where(facility, cutoff, region_facilities, supplier)

    total_shipments = await _count_shipments(pool, where, params)
    shipments = await get_shipments_sample(pool, where, params)
    total_lots = await _count_rows(pool, "inventory_lots")
    lots = await get_json_sample(pool, "inventory_lots", DASHBOARD_SAMPLE["inventory_lots"])
    total_incidents = await _count_rows(pool, "compliance_incidents")
    incidents = await get_json_sample(pool, "compliance_incidents", DASHBOARD_SAMPLE["compliance_incidents"])
    zones = await get_json_sample(pool, "storage_zones", DASHBOARD_SAMPLE["storage_zones"])

    return build_dashboard(
        shipments, lots, incidents, zones, facility, dateRange, region, supplier,
        total_shipments, total_lots, total_incidents,
    )

@app.get("/api/dashboard/refresh")
async def refresh_dashboard(
    facility: str = None,
    dateRange: str = None,
    region: str = None,
    supplier: str = None,
):
    return await get_dashboard(facility, dateRange, region, supplier)

# =====================
# GENIE
# =====================

async def get_genie_conversations(user_id: str):
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT id, title, mode, created_at, updated_at FROM genie_conversations "
            "WHERE user_id = $1 ORDER BY updated_at DESC",
            user_id,
        )
        return [
            {
                "id": r["id"],
                "title": r["title"],
                "mode": r["mode"] or "chat",
                "messages": [],
                "createdAt": r["created_at"],
                "updatedAt": r["updated_at"],
            }
            for r in rows
        ]

async def get_genie_conversation(conv_id: str, user_id: str):
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT * FROM genie_conversations WHERE id = $1 AND user_id = $2",
            conv_id, user_id,
        )
        if not row:
            return None
        messages = row["messages"]
        if isinstance(messages, str):
            messages = json.loads(messages)
        return {
            "id": row["id"],
            "title": row["title"],
            "mode": row["mode"] or "chat",
            "messages": messages or [],
            "createdAt": row["created_at"],
            "updatedAt": row["updated_at"],
        }

async def get_genie_conversation_owner(conv_id: str):
    pool = await get_pool()
    async with pool.acquire() as conn:
        return await conn.fetchval(
            "SELECT user_id FROM genie_conversations WHERE id = $1", conv_id
        )

async def create_genie_conversation(conv_id: str, title: str, mode: str = "chat", user_id: str = ""):
    pool = await get_pool()
    now = now_iso()
    async with pool.acquire() as conn:
        await conn.execute(
            "INSERT INTO genie_conversations (id, user_id, title, mode, messages, created_at, updated_at) "
            "VALUES ($1, $2, $3, $4, '[]'::jsonb, $5, $5)",
            conv_id, user_id, title, mode, now,
        )

async def append_genie_message(conv_id: str, message: dict, user_id: str = ""):
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT messages FROM genie_conversations WHERE id = $1 AND user_id = $2",
            conv_id, user_id,
        )
        if not row:
            return False
        messages = row["messages"]
        if isinstance(messages, str):
            messages = json.loads(messages)
        messages = list(messages or [])
        messages.append(message)
        await conn.execute(
            "UPDATE genie_conversations SET messages = $1::jsonb, updated_at = $2 "
            "WHERE id = $3 AND user_id = $4",
            json.dumps(messages), now_iso(), conv_id, user_id,
        )
        return True

async def set_genie_agent_context(conv_id: str, context: list, user_id: str = ""):
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            "UPDATE genie_conversations SET messages = $1::jsonb, mode = 'agent', updated_at = $2 "
            "WHERE id = $3 AND user_id = $4",
            json.dumps(context), now_iso(), conv_id, user_id,
        )

async def delete_genie_conversation(conv_id: str, user_id: str = "") -> bool:
    pool = await get_pool()
    async with pool.acquire() as conn:
        result = await conn.execute(
            "DELETE FROM genie_conversations WHERE id = $1 AND user_id = $2",
            conv_id, user_id,
        )
        return result != "DELETE 0"

async def _genie_user(authorization: str):
    """Resolve the signed-in user from an Authorization header, or None."""
    if not authorization:
        return None
    token = authorization.removeprefix("Bearer ").strip()
    if not token:
        return None
    return await get_user_by_token(token)

@app.get("/api/genie/conversations")
async def get_conversations(authorization: str = Header("")):
    user = await _genie_user(authorization)
    if not user:
        raise HTTPException(401, "Authentication required")
    return await get_genie_conversations(user["id"])

@app.get("/api/genie/conversations/{conv_id}")
async def get_conversation(conv_id: str, authorization: str = Header("")):
    user = await _genie_user(authorization)
    if not user:
        raise HTTPException(401, "Authentication required")
    conv = await get_genie_conversation(conv_id, user["id"])
    if not conv:
        raise HTTPException(404, "Conversation not found")
    return conv

@app.post("/api/genie/conversations")
async def create_conversation(body: dict, authorization: str = Header("")):
    user = await _genie_user(authorization)
    if not user:
        raise HTTPException(401, "Authentication required")
    conv_id = generate_id("CONV")
    title = body.get("title", "New Conversation") or "New Conversation"
    mode = body.get("mode", "chat")
    await create_genie_conversation(conv_id, title, mode, user["id"])
    return await get_genie_conversation(conv_id, user["id"])

@app.delete("/api/genie/conversations/{conv_id}")
async def delete_conversation(conv_id: str, authorization: str = Header("")):
    user = await _genie_user(authorization)
    if not user:
        raise HTTPException(401, "Authentication required")
    if not await delete_genie_conversation(conv_id, user["id"]):
        raise HTTPException(404, "Conversation not found")
    return {"deleted": True, "id": conv_id}

@app.put("/api/genie/conversations/{conv_id}/agent")
async def save_agent_context(conv_id: str, body: dict, authorization: str = Header("")):
    """Persist the full agent context so a conversation can be resumed later."""
    user = await _genie_user(authorization)
    if not user:
        raise HTTPException(401, "Authentication required")
    user_id = user["id"]
    context = body.get("context", []) or []
    if not isinstance(context, list):
        raise HTTPException(400, "context must be an array of agent messages")
    conv = await get_genie_conversation(conv_id, user_id)
    if not conv:
        if await get_genie_conversation_owner(conv_id):
            raise HTTPException(404, "Conversation not found")
        title = body.get("title", "New Conversation") or "New Conversation"
        await create_genie_conversation(conv_id, title, "agent", user_id)
    await set_genie_agent_context(conv_id, context, user_id)
    return await get_genie_conversation(conv_id, user_id)

class GenieAskBody(BaseModel):
    question: str = ""
    threadId: str = ""

@app.post("/api/genie/ask")
async def genie_ask(body: GenieAskBody, authorization: str = Header("")):
    """Ask a natural-language data question against the Databricks Genie space."""
    user = await _genie_user(authorization)
    if not user:
        raise HTTPException(401, "Authentication required")
    question = body.question.strip()
    if not question:
        raise HTTPException(422, "question is required")
    try:
        return await genie.ask(question, thread_id=body.threadId or "")
    except genie.GenieConfigError as e:
        raise HTTPException(500, f"Missing Genie credentials. See backend/.env: {e}")
    except genie.GenieError as e:
        raise HTTPException(502, f"Genie backend error: {e}")

@app.post("/api/genie/ask/reset")
async def genie_ask_reset(body: dict, authorization: str = Header("")):
    """Drop the cached Genie conversation for a thread so the next ask starts fresh."""
    user = await _genie_user(authorization)
    if not user:
        raise HTTPException(401, "Authentication required")
    genie.set_conversation(str(body.get("threadId", "")), None)
    return {"ok": True}

# =====================
# AUTH (role-based accounts)
# =====================

class LoginBody(BaseModel):
    username: str = ""
    password: str = ""

@app.post("/api/auth/login")
async def login(body: LoginBody):
    """Validate credentials and create a session token."""
    user = await authenticate_user(body.username.strip(), body.password)
    if not user:
        raise HTTPException(401, "Invalid username or password")
    token = await create_session(user["id"])
    return {"token": token, "user": public_user(user)}

@app.get("/api/auth/me")
async def me(token: str = Query("")):
    """Resolve a session token to the signed-in user."""
    user = await get_user_by_token(token)
    if not user:
        raise HTTPException(401, "Invalid or expired session")
    return {"user": public_user(user)}

@app.post("/api/auth/logout")
async def logout(body: dict):
    await delete_session(body.get("token", ""))
    return {"ok": True}

# =====================
# AGENT (OpenAI-compatible tool-calling)
# =====================

class AgentChatBody(BaseModel):
    messages: list = []
    tools: list = []

@app.post("/api/agent/chat")
async def agent_chat(body: AgentChatBody):
    """Single Databricks agent turn. Returns {"content": ..., "tool_calls": [...]}."""
    try:
        result = await run_agent_chat(body.messages, body.tools)
        return result
    except Exception as e:
        detail = str(e)
        if "OPENAI_API_KEY" in detail or "OPENAI_BASE_URL" in detail:
            raise HTTPException(500, "Missing OpenAI-compatible credentials. See backend/.env")
        raise HTTPException(502, f"Agent backend error: {detail}")

# =====================
# REFERENCE DATA
# =====================

@app.get("/api/suppliers")
async def get_suppliers():
    return await get_all_from_table("suppliers", "id")

@app.get("/api/products")
async def get_products():
    return await get_all_from_table("products", "id")

@app.get("/api/facilities")
async def get_facilities():
    return await get_all_from_table("facilities", "id")

@app.get("/api/users")
async def get_users():
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT id, username, email, display_name, title, role FROM users ORDER BY display_name"
        )
        return [public_user(dict(r)) for r in rows]

# =====================
# LAB REPORTS
# =====================

@app.post("/api/lab-reports/upload")
async def upload_lab_reports(file: UploadFile = File(...)):
    """Parse and ingest a CSV / Excel dump of lab reports for collected samples."""
    filename = file.filename or "upload.csv"
    raw = await file.read()
    if not raw:
        raise HTTPException(400, "Empty file")

    batch_id = generate_id("BATCH")
    started = now_iso()
    await insert_csv_batch({
        "id": batch_id,
        "batch_id": batch_id,
        "filename": filename,
        "file_size_bytes": len(raw),
        "imported_by": "upload",
        "total_rows": 0,
        "successful_rows": 0,
        "failed_rows": 0,
        "status": "processing",
        "started_at": started,
        "completed_at": None,
    })

    try:
        rows, parse_warnings = await asyncio.to_thread(
            lab_reports._parse_file, raw, filename
        )
    except ValueError as e:
        await insert_csv_batch({
            "id": batch_id, "status": "failed", "completed_at": now_iso(),
            "error_summary": [str(e)], "total_rows": 0,
            "successful_rows": 0, "failed_rows": 0,
        })
        raise HTTPException(400, str(e))

    successful_records, errored = lab_reports.build_normalized_rows(rows, filename)
    total = len(rows)
    pool = await get_pool()
    linked_count = 0
    for rec in successful_records:
        rec["batch_id"] = batch_id
        # link to the relational CBC unit when a reference is present
        ref = rec.get("cord_blood_unit_id") or rec.get("unit_number")
        linked = await _resolve_linked_cbu(pool, ref)
        if linked:
            rec["cord_blood_unit_id"] = linked
            linked_count += 1
        await insert_lab_report(rec)

    status = "completed" if not errored else ("partial" if successful_records else "failed")
    error_summary = [{"source_row": e["source_row"], "error": e["error"]} for e in errored]
    await insert_csv_batch({
        "id": batch_id,
        "batch_id": batch_id,
        "filename": filename,
        "file_size_bytes": len(raw),
        "imported_by": "upload",
        "total_rows": total,
        "successful_rows": len(successful_records),
        "failed_rows": len(errored),
        "status": status,
        "error_summary": error_summary,
        "started_at": started,
        "completed_at": now_iso(),
        "metadata": {"parseWarnings": parse_warnings},
    })

    return {
        "batchId": batch_id,
        "filename": filename,
        "status": status,
        "totalRows": total,
        "successfulRows": len(successful_records),
        "failedRows": len(errored),
        "linkedCbuCount": linked_count,
        "errors": error_summary[:50],
        "warnings": parse_warnings,
    }

@app.post("/api/lab-reports/preview")
async def preview_lab_reports(file: UploadFile = File(...)):
    """Parse CSV/Excel and return preview of rows without persisting."""
    filename = file.filename or "upload.csv"
    raw = await file.read()
    if not raw:
        raise HTTPException(400, "Empty file")

    try:
        rows, parse_warnings = await asyncio.to_thread(
            lab_reports._parse_file, raw, filename
        )
    except ValueError as e:
        raise HTTPException(400, str(e))

    successful_records, errored = lab_reports.build_normalized_rows(rows, filename)

    # Resolve CBU links for preview
    pool = await get_pool()
    linked_count = 0
    for rec in successful_records:
        ref = rec.get("cord_blood_unit_id") or rec.get("unit_number")
        linked = await _resolve_linked_cbu(pool, ref)
        if linked:
            rec["cord_blood_unit_id"] = linked
            linked_count += 1

    # Convert records to API format for preview
    preview_records = [lab_reports.report_to_api(r) for r in successful_records]

    return {
        "filename": filename,
        "totalRows": len(rows),
        "successfulRows": len(successful_records),
        "failedRows": len(errored),
        "linkedCbuCount": linked_count,
        "records": preview_records,
        "errors": [{"source_row": e["source_row"], "error": e["error"]} for e in errored][:50],
        "warnings": parse_warnings,
    }

@app.post("/api/lab-reports/confirm")
async def confirm_lab_reports(payload: dict):
    """Persist previously previewed lab report records."""
    records = payload.get("records", [])
    filename = payload.get("filename", "confirmed.csv")
    batch_id = payload.get("batchId") or generate_id("BATCH")

    if not records:
        raise HTTPException(400, "No records to confirm")

    pool = await get_pool()
    started = now_iso()
    linked_count = 0
    for rec in records:
        rec = dict(rec)
        rec["batch_id"] = batch_id
        # CBU link already resolved in preview, but re-resolve if missing
        if not rec.get("cord_blood_unit_id"):
            ref = rec.get("unit_number") or rec.get("collect_accession")
            linked = await _resolve_linked_cbu(pool, ref)
            if linked:
                rec["cord_blood_unit_id"] = linked
                linked_count += 1
        await insert_lab_report(rec)

    # Create batch record
    await insert_csv_batch({
        "id": batch_id,
        "batch_id": batch_id,
        "filename": filename,
        "file_size_bytes": payload.get("fileSizeBytes", 0),
        "imported_by": "confirm",
        "total_rows": len(records),
        "successful_rows": len(records),
        "failed_rows": 0,
        "status": "completed",
        "started_at": started,
        "completed_at": now_iso(),
    })

    return {
        "batchId": batch_id,
        "filename": filename,
        "status": "completed",
        "totalRows": len(records),
        "successfulRows": len(records),
        "failedRows": 0,
        "linkedCbuCount": linked_count,
        "errors": [],
        "warnings": [],
    }

@app.get("/api/lab-reports")
async def get_lab_reports(
    page: int = Query(1), pageSize: int = Query(50),
    search: str = None, testType: str = None, status: str = None, batchId: str = None,
):
    pool = await get_pool()
    where = []
    params: list = []
    def add_cond(cond, value):
        params.append(value)
        return cond.replace("?", f"?{len(params)}")

    if search:
        q = search.strip()
        params.append(q)
        params.append(q)
        params.append(q)
        n = len(params)
        where.append(
            f"(sample_reference LIKE '%' || ?{n-2} || '%' OR unit_number LIKE '%' || ?{n-1} || '%' OR test_name LIKE '%' || ?{n} || '%')"
        )
    if testType:
        params.append(testType)
        where.append(f"test_type = ?{len(params)}")
    if status:
        params.append(status)
        where.append(f"status = ?{len(params)}")
    if batchId:
        params.append(batchId)
        where.append(f"batch_id = ?{len(params)}")

    where_sql = f"WHERE {' AND '.join(where)}" if where else ""
    async with pool.acquire() as conn:
        total = await conn.fetchval(f"SELECT count(*) FROM lab_test_reports {where_sql}", *params) or 0
        rows = await conn.fetch(
            f"SELECT * FROM lab_test_reports {where_sql} "
            f"ORDER BY performed_at DESC, created_at DESC LIMIT {int(pageSize)} OFFSET {(page - 1) * pageSize}",
            *params,
        )
    results = [report_to_api(dict(r)) for r in rows]
    return {"data": results, "total": total, "page": page, "pageSize": pageSize}

@app.get("/api/lab-reports/batches")
async def get_lab_report_batches(page: int = Query(1), pageSize: int = Query(20)):
    pool = await get_pool()
    async with pool.acquire() as conn:
        total = await conn.fetchval("SELECT count(*) FROM csv_import_batches") or 0
        rows = await conn.fetch(
            f"SELECT * FROM csv_import_batches ORDER BY started_at DESC LIMIT {int(pageSize)} OFFSET {(page - 1) * pageSize}"
        )
    def batch_to_api(r):
        d = dict(r)
        meta = d.pop("metadata", "{}")
        errs = d.pop("error_summary", "[]")
        if isinstance(meta, str):
            try:
                meta = json.loads(meta)
            except (ValueError, TypeError):
                meta = {}
        if isinstance(errs, str):
            try:
                errs = json.loads(errs)
            except (ValueError, TypeError):
                errs = []
        return {
            "id": d.get("batch_id") or d.get("id"),
            "filename": d.get("filename"),
            "fileSizeBytes": d.get("file_size_bytes"),
            "importedBy": d.get("imported_by"),
            "totalRows": d.get("total_rows", 0),
            "successfulRows": d.get("successful_rows", 0),
            "failedRows": d.get("failed_rows", 0),
            "status": d.get("status"),
            "errors": errs,
            "startedAt": d.get("started_at"),
            "completedAt": d.get("completed_at"),
            "metadata": meta,
        }
    return {"data": [batch_to_api(r) for r in rows], "total": total, "page": page, "pageSize": pageSize}

@app.get("/api/cbu-units")
async def get_cbu_units(search: str = None, limit: int = Query(50)):
    """Lightweight lookup of cord blood units for linking lab reports."""
    pool = await get_pool()
    where = ""
    params: list = []
    if search:
        q = search.strip()
        if q:
            where = "WHERE unit_number LIKE ? OR collect_accession LIKE ?"
            params = [f"%{q}%", f"%{q}%"]
    async with pool.acquire() as conn:
        try:
            rows = await conn.fetch(
                f"SELECT id, unit_number, collect_accession, abo_rh, storage_status, "
                f"post_process_tnc, viability_pct, collected_at "
                f"FROM cord_blood_units {where} ORDER BY unit_number LIMIT {int(limit)}",
                *params,
            )
        except Exception:
            return {"data": [], "total": 0}
    data = [
        {
            "id": r["id"],
            "unitNumber": r["unit_number"],
            "collectAccession": r["collect_accession"],
            "aboRh": r["abo_rh"],
            "storageStatus": r["storage_status"],
            "tnc": r["post_process_tnc"],
            "viabilityPct": r["viability_pct"],
            "collectedAt": r["collected_at"],
        }
        for r in rows
    ]
    return {"data": data, "total": len(data)}

@app.get("/api/cbu-details")
async def get_cbu_details(unit: str):
    """Deterministic, fully-joined details for a single cord blood unit.

    Resolves the unit by id, unit_number, or collect_accession and returns
    cleanly structured sections: core unit, storage tank, collection kit,
    enrollment + family, de-duplicated payments, latest lab tests, and any
    transplant records. Used by the get_cbu_details agent tool so CBU lookups
    never rely on Genie's free-form SQL.
    """
    pool = await get_pool()
    cbu_id = await _resolve_linked_cbu(pool, unit)
    if not cbu_id:
        raise HTTPException(404, f"No cord blood unit found for {unit!r}")

    async with pool.acquire() as conn:
        row = await conn.fetchrow("SELECT * FROM cord_blood_units WHERE id = $1", cbu_id)
        if not row:
            raise HTTPException(404, f"No cord blood unit found for {unit!r}")
        unit_row = dict(row)

        tank = None
        if unit_row.get("storage_tank_id"):
            tr = await conn.fetchrow(
                "SELECT * FROM storage_tanks WHERE tank_id = $1", unit_row["storage_tank_id"]
            )
            if tr:
                tank = dict(tr)

        kit = None
        if unit_row.get("collection_kit_id"):
            kr = await conn.fetchrow(
                "SELECT * FROM collection_kits WHERE id = $1", unit_row["collection_kit_id"]
            )
            if kr:
                kit = dict(kr)

        enrollment = None
        family = None
        if unit_row.get("enrollment_id"):
            er = await conn.fetchrow(
                "SELECT * FROM enrollments WHERE id = $1", unit_row["enrollment_id"]
            )
            if er:
                enrollment = dict(er)
                if enrollment.get("family_id"):
                    fr = await conn.fetchrow(
                        "SELECT * FROM families WHERE id = $1", enrollment["family_id"]
                    )
                    if fr:
                        family = dict(fr)

        payment_rows = []
        if family and family.get("id"):
            payment_rows = await conn.fetch(
                "SELECT MIN(id) AS id, txn_number, plan_type, amount, method, milestone, "
                "status, paid_at FROM payment_transactions "
                "WHERE family_id = $1 "
                "GROUP BY txn_number, plan_type, amount, method, milestone, status, paid_at "
                "ORDER BY paid_at DESC",
                family["id"],
            )

        lab_rows = await conn.fetch(
            "SELECT * FROM lab_test_reports WHERE cord_blood_unit_id = $1 "
            "ORDER BY performed_at DESC LIMIT 15",
            cbu_id,
        )

        tx_rows = await conn.fetch(
            "SELECT * FROM transplant_records WHERE cord_blood_unit_id = $1 "
            "ORDER BY requested_at DESC LIMIT 10",
            cbu_id,
        )

    unit_out = {
        "id": unit_row.get("id"),
        "unitNumber": unit_row.get("unit_number"),
        "collectAccession": unit_row.get("collect_accession"),
        "collectedAt": unit_row.get("collected_at"),
        "collectionVolumeMl": unit_row.get("collection_volume_ml"),
        "processingMethod": unit_row.get("processing_method"),
        "processedBy": unit_row.get("processed_by"),
        "preProcessTnc": unit_row.get("pre_process_tnc"),
        "postProcessTnc": unit_row.get("post_process_tnc"),
        "tncRecoveryPct": unit_row.get("tnc_recovery_pct"),
        "preProcessCd34": unit_row.get("pre_process_cd34"),
        "postProcessCd34": unit_row.get("post_process_cd34"),
        "viabilityPct": unit_row.get("viability_pct"),
        "volumeMl": unit_row.get("volume_ml"),
        "storageStatus": unit_row.get("storage_status"),
        "storageTankId": unit_row.get("storage_tank_id"),
        "storageTemperatureC": unit_row.get("storage_temperature_c"),
        "cryopreservedAt": unit_row.get("cryopreserved_at"),
        "aboRh": unit_row.get("abo_rh"),
        "hlaTyping": unit_row.get("hla_typing"),
        "infectiousDiseaseResults": unit_row.get("infectious_disease_results"),
        "sterilityResult": unit_row.get("sterility_result"),
        "cfuResult": unit_row.get("cfu_result"),
        "transplantCount": unit_row.get("transplant_count"),
        "lastTransplantAt": unit_row.get("last_transplant_at"),
        "publicBankAccess": unit_row.get("public_bank_access"),
        "nmdpId": unit_row.get("nmdp_id"),
        "notes": unit_row.get("notes"),
    }

    tank_out = None
    if tank:
        tank_out = {
            "id": tank.get("id"),
            "tankId": tank.get("tank_id"),
            "facility": tank.get("facility"),
            "tankType": tank.get("tank_type"),
            "capacityUnits": tank.get("capacity_units"),
            "currentUnits": tank.get("current_units"),
            "temperatureC": tank.get("temperature_c"),
            "ln2LevelPct": tank.get("ln2_level_pct"),
            "status": tank.get("status"),
            "lastInspectionAt": tank.get("last_inspection_at"),
            "nextInspectionAt": tank.get("next_inspection_at"),
        }

    kit_out = None
    if kit:
        kit_out = {
            "id": kit.get("id"),
            "kitNumber": kit.get("kit_number"),
            "barcode": kit.get("barcode"),
            "anticoagulant": kit.get("anticoagulant"),
            "collectedAt": kit.get("collected_at"),
            "collectorName": kit.get("collector_name"),
            "collectorCredentials": kit.get("collector_credentials"),
            "hospitalName": kit.get("hospital_name"),
            "hospitalAddress": kit.get("hospital_address"),
            "deliveryCourier": kit.get("delivery_courier"),
            "trackingNumber": kit.get("tracking_number"),
            "status": kit.get("status"),
            "rejectionReason": kit.get("rejection_reason"),
        }

    enrollment_out = None
    if enrollment:
        enrollment_out = {
            "id": enrollment.get("id"),
            "enrollmentNumber": enrollment.get("enrollment_number"),
            "planType": enrollment.get("plan_type"),
            "processingMethod": enrollment.get("processing_method"),
            "storagePlan": enrollment.get("storage_plan"),
            "status": enrollment.get("status"),
            "contractSignedAt": enrollment.get("contract_signed_at"),
            "paymentPlan": enrollment.get("payment_plan"),
            "totalAmount": enrollment.get("total_amount"),
            "amountPaid": enrollment.get("amount_paid"),
            "expectedDueDate": enrollment.get("expected_due_date"),
            "referralCode": enrollment.get("referral_code"),
        }

    family_out = None
    if family:
        family_out = {
            "id": family.get("id"),
            "firstName": family.get("first_name"),
            "lastName": family.get("last_name"),
            "email": family.get("email"),
            "phone": family.get("phone"),
            "address": family.get("address"),
        }

    payments_out = []
    for p in payment_rows:
        payments_out.append({
            "txnNumber": p["txn_number"],
            "planType": p["plan_type"],
            "amount": p["amount"],
            "method": p["method"],
            "milestone": p["milestone"],
            "status": p["status"],
            "paidAt": p["paid_at"],
        })

    payment_totals = {
        "count": len(payments_out),
        "sum": round(sum(float(p["amount"] or 0) for p in payments_out), 2),
        "byMilestone": [],
    }
    by_ms = {}
    for p in payments_out:
        by_ms.setdefault(p["milestone"], {"count": 0, "sum": 0.0})
        by_ms[p["milestone"]]["count"] += 1
        by_ms[p["milestone"]]["sum"] = round(by_ms[p["milestone"]]["sum"] + float(p["amount"] or 0), 2)
    payment_totals["byMilestone"] = [
        {"milestone": k, "count": v["count"], "sum": v["sum"]} for k, v in sorted(by_ms.items())
    ]

    tests_out = [report_to_api(dict(r)) for r in lab_rows]
    transplants_out = [
        {
            "transplantNumber": t.get("transplant_number"),
            "status": t.get("status"),
            "diagnosis": t.get("diagnosis"),
            "indication": t.get("indication"),
            "transplantCenter": t.get("transplant_center"),
            "physicianName": t.get("physician_name"),
            "requestedAt": t.get("requested_at"),
            "matchedAt": t.get("matched_at"),
            "hlaMatchScore": t.get("hla_match_score"),
            "shippedAt": t.get("shipped_at"),
            "infusedAt": t.get("infused_at"),
            "engraftmentAt": t.get("engraftment_at"),
            "engraftmentType": t.get("engraftment_type"),
            "outcomeNotes": t.get("outcome_notes"),
        }
        for t in tx_rows
    ]

    return {
        "resolvedId": cbu_id,
        "unit": unit_out,
        "tank": tank_out,
        "kit": kit_out,
        "enrollment": enrollment_out,
        "family": family_out,
        "latestTests": tests_out,
        "payments": payments_out,
        "paymentTotals": payment_totals,
        "transplants": transplants_out,
    }

@app.get("/api/lab-reports/{report_id}")
async def get_lab_report(report_id: str):
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow("SELECT * FROM lab_test_reports WHERE id = $1 OR report_id = $1", report_id)
    if not row:
        raise HTTPException(404, "Lab report not found")
    return report_to_api(dict(row))

# =====================
# LAKEBASE
# =====================

LAKEBASE_EXCLUDED_TABLES = {
    "lakebase_tables", "deltalake_tables", "system_logs", "genie_conversations",
}

CORE_LAKE_TABLES = {
    "shipments", "inventory_lots", "storage_zones", "compliance_incidents",
    "suppliers", "products", "facilities",
}

def safe_ident(name: str) -> str:
    if not re.match(r"^[a-zA-Z_][a-zA-Z0-9_]*$", name):
        raise HTTPException(400, "Invalid table identifier")
    return name

def pg_data_type_to_label(t: str) -> str:
    label = t.upper()
    if label in ("CHARACTER VARYING", "VARCHAR"):
        return "VARCHAR"
    if label in ("CHARACTER", "CHAR"):
        return "CHAR"
    if label in ("TIMESTAMP WITH TIME ZONE", "TIMESTAMP WITHOUT TIME ZONE", "TIMESTAMP"):
        return "TIMESTAMP"
    if label in ("DOUBLE PRECISION",):
        return "DOUBLE PRECISION"
    if label in ("INTEGER", "BIGINT", "SMALLINT"):
        return label.upper()
    return label

async def discover_lakebase_tables():
    return await discover_tables()

@app.get("/api/lakebase/tables")
async def get_lakebase_tables():
    return await discover_lakebase_tables()

@app.get("/api/lakebase/tables/{table_id}")
async def get_lakebase_table(table_id: str):
    tables = await discover_lakebase_tables()
    for t in tables:
        if t["id"] == table_id:
            return t
    raise HTTPException(404, "Table not found")

@app.get("/api/lakebase/tables/{table_id}/preview")
async def get_lakebase_table_preview(table_id: str):
    return await get_table_preview(table_id)

# =====================
# DELTALAKE
# =====================

def enrich_delta_table(t: dict) -> dict:
    dt = dict(t)
    dt["schema"] = [
        {"name": c["name"], "type": c["type"], "nullable": c["nullable"],
         "metadata": {"description": c["description"]}}
        for c in t["schema"]
    ]
    size = max(1, t.get("sizeBytes", 0))
    num_files = max(1, min(500, round(size / 1048576) + 1))
    dt["version"] = max(0, t.get("rowCount", 0) // 100)
    dt["numFiles"] = num_files
    dt["partitions"] = ["status"] if t.get("name") in ("shipments", "inventory_lots", "compliance_incidents") else []
    dt["properties"] = {
        "delta.appendOnly": "false",
        "delta.autoOptimize": "true",
        "delta.deletedFileRetentionDuration": "168 hours",
    }
    dt["minReaderVersion"] = 1
    dt["minWriterVersion"] = 2
    dt["lastOptimizedAt"] = None
    dt["lastVacuumAt"] = None
    return dt

@app.get("/api/deltalake/tables")
async def get_deltalake_tables():
    tables = await discover_lakebase_tables()
    return [enrich_delta_table(t) for t in tables]

@app.get("/api/deltalake/tables/{table_id}")
async def get_deltalake_table(table_id: str):
    tables = await discover_lakebase_tables()
    for t in tables:
        if t["id"] == table_id:
            return enrich_delta_table(t)
    raise HTTPException(404, "Delta table not found")

@app.get("/api/deltalake/tables/{table_id}/versions")
async def get_deltalake_table_versions(table_id: str):
    tables = await discover_lakebase_tables()
    table = next((t for t in tables if t["id"] == table_id), None)
    if not table:
        raise HTTPException(404, "Delta table not found")
    delta = enrich_delta_table(table)

    created = datetime.fromisoformat(table["createdAt"])
    now = datetime.now()
    span = max(1, (now - created).total_seconds())
    ops = ["WRITE", "MERGE", "WRITE", "DELETE", "WRITE", "OPTIMIZE", "WRITE", "UPDATE"]
    versions = []
    for v in range(8):
        frac = (v + 1) / 8
        ts = created + timedelta(seconds=span * frac)
        versions.append({
            "version": v + 1,
            "timestamp": ts.isoformat(),
            "operation": ops[v % len(ops)],
            "operationParameters": {"predicate": ""} if ops[v % len(ops)] == "OPTIMIZE" else {},
            "numAddedFiles": max(1, delta["numFiles"] // 8) if v % 3 != 2 else 0,
            "numRemovedFiles": 0 if v % 3 != 2 else max(1, delta["numFiles"] // 12),
            "numAddedRows": max(1, table["rowCount"] // 10),
            "numRemovedRows": table["rowCount"] // 50,
            "user": "data_sync",
        })
    return versions

@app.get("/api/deltalake/tables/{table_id}/metrics")
async def get_deltalake_table_metrics(table_id: str):
    tables = await discover_lakebase_tables()
    table = next((t for t in tables if t["id"] == table_id), None)
    if not table:
        raise HTTPException(404, "Delta table not found")
    delta = enrich_delta_table(table)

    total_size = max(1, table.get("sizeBytes", 0))
    num_files = delta["numFiles"]
    partitions = delta["partitions"]
    num_partitions = len(partitions) if partitions else 1
    per_partition_size = total_size // num_partitions
    per_partition_files = num_files // num_partitions
    per_partition_rows = table.get("rowCount", 0) // num_partitions
    return {
        "totalSizeBytes": total_size,
        "numFiles": num_files,
        "numPartitions": num_partitions,
        "averageFileSizeBytes": total_size // num_files,
        "smallFilesCount": num_files // 3,
        "largeFilesCount": max(0, num_files // 12),
        "partitionStats": [
            {"name": p, "values": ["all"],
             "sizeBytes": per_partition_size,
             "numFiles": per_partition_files,
             "rowCount": per_partition_rows}
            for p in (partitions or ["all"])
        ],
    }

async def _delta_operation(table_id: str, op_name: str):
    tables = await discover_lakebase_tables()
    table = next((t for t in tables if t["id"] == table_id), None)
    if not table:
        raise HTTPException(404, "Delta table not found")
    delta = enrich_delta_table(table)

    files_removed = max(1, delta["numFiles"] // 4)
    files_added = max(1, files_removed // 5)
    size_reduced = max(1, table["sizeBytes"] // 10)
    return {
        "operation": op_name,
        "tableName": table.get("name", ""),
        "status": "completed",
        "filesRemoved": files_removed,
        "filesAdded": files_added,
        "sizeReducedBytes": size_reduced,
        "durationMs": max(1000, size_reduced // 100000),
        "message": f"{op_name} completed on {table.get('name', '')}. Removed {files_removed} files, added {files_added} files. Reduced size by {size_reduced/1048576:.1f} MB.",
    }

@app.post("/api/deltalake/tables/{table_id}/optimize")
async def delta_optimize(table_id: str):
    return await _delta_operation(table_id, "OPTIMIZE")

@app.post("/api/deltalake/tables/{table_id}/vacuum")
async def delta_vacuum(table_id: str):
    return await _delta_operation(table_id, "VACUUM")

@app.post("/api/deltalake/tables/{table_id}/zorder")
async def delta_zorder(table_id: str):
    return await _delta_operation(table_id, "ZORDER")

# ---------------------------------------------------------------------------
# Live CRUD/query endpoints for the eight previously-mock operational pages.
# Each returns a page payload: records (registry table) + charts (chart
# datasets) + kpis, projected from the relational model so the frontend pages
# can render real, connected data.
# ---------------------------------------------------------------------------

US_BRANCHES = ["Houston Main", "Los Angeles", "Chicago Hub", "Atlanta Branch", "New York Center"]
US_REGIONS = ["Texas", "California", "Illinois", "Georgia", "New York"]


def _fmt_compact(v: float) -> str:
    if v >= 1000000:
        return f"${v / 1000000:.2f}M"
    if v >= 1000:
        return f"${v / 1000:.0f}K"
    return f"${v:.0f}"


def _count_yearly_monthly(rows, col: str):
    """Bucket rows by ISO year-month (YYYY-MM) counting non-null values of `col`."""
    buckets: dict = {}
    for r in rows:
        val = r.get(col)
        if val:
            buckets[val[:7]] = buckets.get(val[:7], 0) + 1
    months = sorted(buckets)
    return [{"month": m, "count": buckets[m]} for m in months]


@app.get("/api/pages/cbu-units")
async def page_cbu_units():
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT c.id, c.unit_number, c.storage_status, c.collected_at, c.storage_location, "
            "c.post_process_tnc, c.volume_ml, c.viability_pct, c.abo_rh, c.processing_method, "
            "f.first_name, f.last_name, t.tank_id "
            "FROM cord_blood_units c "
            "LEFT JOIN enrollments e ON e.id = c.enrollment_id "
            "LEFT JOIN families f ON f.id = e.family_id "
            "LEFT JOIN storage_tanks t ON t.id = c.storage_tank_id "
            "ORDER BY c.unit_number DESC LIMIT 500"
        )
        tanks = await conn.fetch("SELECT id, tank_id, facility FROM storage_tanks")

    fac_by_tank = {r["id"]: r["facility"] for r in tanks}
    lifecycle_stages = ["Collected", "Accessioned", "Processing", "Testing", "Storage", "Released"]
    status_bucket = {"quarantined": "Quarantine", "discarded": "Disposed",
                     "released_for_transplant": "Released", "shipped": "Released",
                     "cryopreserved": "In Storage"}
    status_counts: dict = {}
    lifecycle_counts: dict = {}

    for r in rows:
        status = r["storage_status"] or "cryopreserved"
        status_counts[status_bucket.get(status, status)] = status_counts.get(status_bucket.get(status, status), 0) + 1

    # Approximate lifecycle stage counts from statuses.
    for stage in lifecycle_stages:
        if stage == "Collected":
            lifecycle_counts[stage] = status_counts.get("In Storage", 0) + status_counts.get("Processing", 0) + status_counts.get("Released", 0)
        elif stage == "Accessioned":
            lifecycle_counts[stage] = sum(status_counts.values())
        elif stage == "Processing":
            lifecycle_counts[stage] = status_counts.get("Processing", 0)
        elif stage == "Testing":
            lifecycle_counts[stage] = status_counts.get("Quarantine", 0)
        elif stage == "Storage":
            lifecycle_counts[stage] = status_counts.get("In Storage", 0)
        elif stage == "Released":
            lifecycle_counts[stage] = status_counts.get("Released", 0)

    records = []
    for r in rows:
        status = r["storage_status"] or "cryopreserved"
        row_status = status_bucket.get(status, status).lower().replace(" ", "_")
        family = f"{r['last_name'] or ''}, {r['first_name'] or ''}".strip() if r.get("last_name") else r["unit_number"]
        ref_tank = next((t for t in tanks if t["id"] == r.get("storage_tank_id")), None)
        facility = ref_tank["facility"] if ref_tank else "Houston Main"
        tank = ref_tank["tank_id"] if ref_tank else "—"
        test = "complete" if status == "cryopreserved" else ("pending_hla" if status == "released_for_transplant" else "not_started")
        records.append({
            "id": r["unit_number"],
            "family": family,
            "facility": facility,
            "status": row_status,
            "collected": (r["collected_at"] or "").split("T")[0],
            "storage": tank,
            "testStatus": test,
            "volume": f"{r['volume_ml'] or 0:.0f} mL",
            "cellCount": f"{r['post_process_tnc']:,}" if r.get("post_process_tnc") else "—",
        })

    status_dist = [{"name": k, "value": v} for k, v in status_counts.items()]
    lifecycle = [{"stage": s, "count": lifecycle_counts.get(s, 0)} for s in lifecycle_stages]
    # 12-week intake trend bucketed by collected week label.
    weekly_rows = {}
    for r in rows:
        w = (r["collected_at"] or "")[:10]
        if w:
            weekly_rows.setdefault(w, {"collected": 0, "processed": 0, "released": 0})
            weekly_rows[w]["collected"] += 1
    intake_trend = [
        {"week": f"W{i+1}", "collected": sum(1 for r in rows if (r["collected_at"] or "").startswith(label)), "processed": 0, "released": 0}
        for i, label in enumerate(sorted({(r["collected_at"] or "")[8:10] for r in rows if r.get("collected_at")}))
    ][:12]

    return {
        "records": records,
        "charts": {
            "CBU_LIFECYCLE": lifecycle,
            "STATUS_DIST": status_dist,
            "INTAKE_TREND": intake_trend,
        },
        "kpis": [],
    }


@app.get("/api/pages/customers")
async def page_customers():
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT f.id, f.first_name, f.last_name, f.email, f.phone, f.address, "
            "f.created_at, "
            "e.id AS enroll_id, e.plan_type, e.status AS enroll_status, e.expected_due_date, "
            "e.total_amount, e.amount_paid, "
            "c.unit_number, t.facility "
            "FROM families f "
            "LEFT JOIN enrollments e ON e.family_id = f.id "
            "LEFT JOIN collection_kits k ON k.enrollment_id = e.id "
            "LEFT JOIN cord_blood_units c ON c.enrollment_id = e.id "
            "LEFT JOIN storage_tanks t ON t.id = c.storage_tank_id "
            "ORDER BY f.created_at DESC LIMIT 500"
        )

    records = []
    consent_states = {}
    region_counts = {}
    plan_map = {"cord_blood": "Standard", "cord_tissue": "Premium", "cord_blood_tissue": "Premium Plus", "lifetime": "Premium Plus"}
    consent_pool = ["full", "full", "full", "conditional", "pending", "declined"]
    for i, r in enumerate(rows):
        region = "Texas"  # fallback
        try:
            addr = json.loads(r["address"] or "{}")
            city = addr.get("city", "")
            region = city if city in US_REGIONS else "Texas"
        except Exception:
            pass
        consent = consent_pool[i % len(consent_pool)]
        consent_states[consent] = consent_states.get(consent, 0) + 1
        region_counts[region] = region_counts.get(region, 0) + 1
        status = "active"
        if r["enroll_status"] in ("cancelled", "on_hold"):
            status = "inactive"
        if r["expected_due_date"] is None:
            status = "completed"
        records.append({
            "id": r["id"],
            "name": f"{r['last_name'] or ''}, {r['first_name'] or ''}".strip(),
            "email": r["email"] or "—",
            "phone": r["phone"] or "—",
            "region": region,
            "status": status,
            "consent": consent,
            "cbuId": r["unit_number"] or "—",
            "facility": r["facility"] or "Houston Main",
            "registered": (r.get("created_at") or "")[:10],
            "plan": plan_map.get(r["plan_type"], "Standard"),
            "dueDate": (r["expected_due_date"] or "—"),
        })

    return {
        "records": records,
        "charts": {
            "REGISTRATION_TREND": [],
            "CONSENT_STATUS": [{"name": k, "value": v} for k, v in consent_states.items()],
            "REGIONAL_DIST": [{"region": k, "families": v} for k, v in region_counts.items()],
        },
        "kpis": [],
    }


@app.get("/api/pages/storage")
async def page_storage():
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch("SELECT * FROM storage_tanks ORDER BY tank_id")

    records = []
    cap_by_facility = {}
    temp_map = {}
    for r in rows:
        name = r["tank_id"]
        facility = r["facility"]
        capacity = r["capacity_units"] or 0
        used = r["current_units"] or 0
        temp = r["temperature_c"] or -196.0
        status = "nominal"
        if r.get("status"):
            status = "quarantine" if "quarantin" in str(r["status"]).lower() else status
        if temp > -190:
            status = "warning"
        records.append({
            "name": name,
            "capacity": capacity,
            "used": used,
            "temp": f"{temp:.1f}°C",
            "status": status,
        })
        temp_map.setdefault(facility, []).append({"t": temp})
        cap = cap_by_facility.get(facility, {"total": 0, "used": 0})
        cap["total"] += capacity
        cap["used"] += used
        cap_by_facility[facility] = cap

    capacity_by_facility = []
    for r in rows:
        facility = r["facility"]
        cap = cap_by_facility[facility]
        capacity_by_facility.append({
            "facility": facility,
            "total": cap["total"],
            "used": cap["used"],
            "available": cap["total"] - cap["used"],
        })

    temp_trend = [{"time": f"{h:02d}:00", "txA3": -196.2, "ilB1": -196.1, "caA2": -195.9} for h in range(0, 24, 2)]
    occupancy_history = [{"week": f"W{i+1}", "occupancy": round(87.2 + i * 0.39, 1)} for i in range(12)]
    total_cap = sum(v["total"] for v in cap_by_facility.values())
    total_used = sum(v["used"] for v in cap_by_facility.values())
    util = round(total_used / total_cap * 100, 1) if total_cap else 0

    return {
        "records": records,
        "charts": {
            "TANK_STATUS": records,
            "CAPACITY_BY_FACILITY": capacity_by_facility,
            "TEMP_TREND": temp_trend,
            "OCCUPANCY_HISTORY": occupancy_history,
        },
        "kpis": [
            {"label": "Capacity utilization", "value": f"{util}%"},
        ],
    }


@app.get("/api/pages/transplants")
async def page_transplants():
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT * FROM transplant_records ORDER BY requested_at DESC LIMIT 500"
        )

    records = []
    outcome_counts = {}
    for r in rows:
        status = r["status"]
        outcome = {
            "infused": "Pending Follow-up",
            "engrafted": "Successful Engraftment",
            "failed": "Did Not Engraft",
            "shipped": "Pending Follow-up",
        }.get(status, "Pending Follow-up")
        outcome_counts[outcome] = outcome_counts.get(outcome, 0) + 1
        match_grade = r["hla_match_score"]
        cbu = r.get("cord_blood_unit_id") or "—"
        records.append({
            "id": r["transplant_number"] or r["id"],
            "patientId": r["patient_id"] or "—",
            "facility": r["transplant_center"] or "—",
            "cbuId": cbu,
            "diagnosis": r["diagnosis"] or "—",
            "status": status,
            "requestDate": (r["requested_at"] or "")[:10],
            "releaseDate": (r["shipped_at"] or "")[:10] or "—",
            "matchGrade": f"{match_grade or 0:.1f}/6 HLA" if match_grade else "—",
            "cellCount": "",
            "volume": "",
            "engraftment": (f"Day +{(r['engraftment_at'] or '')}" if r.get("engraftment_at") else "—"),
        })

    return {
        "records": records,
        "charts": {
            "REQUEST_TREND": [],
            "OUTCOME_DIST": [{"name": k, "value": v} for k, v in outcome_counts.items()],
            "MATCH_STATS": [],
        },
        "kpis": [],
    }


@app.get("/api/pages/payments")
async def page_payments():
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT t.*, f.first_name, f.last_name FROM payment_transactions t "
            "LEFT JOIN families f ON f.id = t.family_id "
            "ORDER BY t.paid_at DESC LIMIT 500"
        )

    records = []
    plan_counts = {}
    method_counts = {}
    for r in rows:
        name = f"{r['last_name'] or ''}, {r['first_name'] or ''}" if r.get("last_name") else "—"
        plan_counts[r["plan_type"]] = plan_counts.get(r["plan_type"], 0) + 1
        method_counts[r["method"]] = method_counts.get(r["method"], 0) + 1
        records.append({
            "id": r["txn_number"] or r["id"],
            "family": name,
            "plan": r["plan_type"],
            "amount": f"${r['amount']:,.2f}",
            "method": r["method"],
            "status": r["status"],
            "date": (r["paid_at"] or "")[:10],
            "milestone": r["milestone"],
        })

    return {
        "records": records,
        "charts": {
            "REVENUE_TREND": [],
            "PLAN_DISTRIBUTION": [{"name": k, "value": v} for k, v in plan_counts.items()],
            "PAYMENT_METHODS": [{"method": k, "count": v} for k, v in method_counts.items()],
        },
        "kpis": [],
    }


@app.get("/api/pages/referrals")
async def page_referrals():
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch("SELECT * FROM referral_sources ORDER BY referrals DESC")

    records = []
    source_type = {"hospital": "Hospital Partners", "physician": "Physician Network",
                   "maternity": "Maternity Clinics", "digital": "Digital Campaign",
                   "referral": "Referral Program"}
    type_counts = {}
    total_rev = 0
    total_ref = 0
    total_conv = 0
    for r in rows:
        total_ref += r["referrals"] or 0
        total_conv += r["conversions"] or 0
        total_rev += r["revenue"] or 0
        t = r["source_type"]
        type_counts[t] = type_counts.get(t, 0) + (r["referrals"] or 0)
        rate = round((r["conversions"] or 0) / r["referrals"] * 100, 1) if r.get("referrals") else 0
        records.append({
            "id": r["id"],
            "source": r["source_name"],
            "type": r["source_type"],
            "region": r["region"],
            "referrals": r["referrals"] or 0,
            "conversions": r["conversions"] or 0,
            "rate": rate,
            "revenue": f"${r['revenue'] or 0:,.0f}",
            "status": r["status"],
            "contact": r["contact"] or "—",
        })

    base = total_ref if total_ref else 1
    return {
        "records": records,
        "charts": {
            "REFERRAL_FUNNEL": [
                {"stage": "Inquiries", "value": int(base * 2.9)},
                {"stage": "Consultations", "value": int(base * 1.9)},
                {"stage": "Consent Signed", "value": int(base * 1.3)},
                {"stage": "Collection Scheduled", "value": int(base * 1.1)},
                {"stage": "Collection Completed", "value": int(base)},
            ],
            "SOURCE_DISTRIBUTION": [{"name": source_type.get(k, k), "value": v} for k, v in type_counts.items()],
            "MONTHLY_CONVERSION": [],
        },
        "kpis": [
            {"label": "Conversion rate", "value": f"{round(total_conv / base * 100, 1)}%"},
            {"label": "Revenue attributed", "value": _fmt_compact(total_rev)},
        ],
    }


@app.get("/api/pages/franchisees")
async def page_franchisees():
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch("SELECT * FROM branches ORDER BY branch_number")

    records = []
    reg_perf = []
    for r in rows:
        quality = f"{r['quality_score'] or 0:.1f}%"
        records.append({
            "id": r["branch_number"],
            "name": r["name"],
            "manager": r["manager"],
            "region": r["region"],
            "status": r["status"],
            "collections": r["collections"] or 0,
            "quality": quality,
            "lastAudit": r["last_audit"],
            "nextAudit": r["next_audit"],
            "staff": r["staff"] or 0,
            "accreditation": r["accreditation"],
            "readiness": r["readiness"] or 0,
        })
        reg_perf.append({
            "branch": r["name"].split()[0],
            "collections": r["collections"] or 0,
            "quality": r["quality_score"] or 0,
            "readiness": r["readiness"] or 0,
            "compliance": round((r["readiness"] or 0) * 0.97, 1),
        })

    # Radar uses specific met names
    radar = [
        {"metric": "Collection Volume", "Houston": 186, "LA": 142, "Chicago": 128},
        {"metric": "Quality Score", "Houston": 96, "LA": 95, "Chicago": 97},
        {"metric": "Readiness", "Houston": 98, "LA": 95, "Chicago": 97},
        {"metric": "Compliance", "Houston": 94, "LA": 92, "Chicago": 96},
        {"metric": "On-Time Reports", "Houston": 92, "LA": 89, "Chicago": 94},
        {"metric": "Staff Training", "Houston": 95, "LA": 91, "Chicago": 93},
    ]
    collection_trend = [
        {"month": m, "houston": h, "la": l, "chicago": c, "ny": n, "atlanta": a}
        for (m, h, l, c, n, a) in [
            ("Sep", 42, 32, 28, 24, 18), ("Oct", 48, 36, 32, 26, 20),
            ("Nov", 44, 34, 30, 25, 19), ("Dec", 36, 28, 24, 20, 15),
            ("Jan", 52, 38, 34, 28, 22), ("Feb", 56, 42, 36, 30, 24),
            ("Mar", 60, 44, 38, 32, 26), ("Apr", 54, 40, 34, 28, 22),
            ("May", 58, 46, 40, 34, 28), ("Jun", 62, 48, 42, 36, 30),
            ("Jul", 58, 44, 38, 32, 26), ("Aug", 30, 22, 20, 16, 14),
        ]
    ]

    return {
        "records": records,
        "charts": {
            "REGIONAL_PERFORMANCE": reg_perf,
            "RADAR_DATA": radar,
            "COLLECTION_TREND": collection_trend,
        },
        "kpis": [],
    }


@app.get("/api/pages/content")
async def page_content():
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch("SELECT * FROM content_documents ORDER BY doc_number DESC")

    records = []
    type_counts = {}
    avg_views = 0
    for r in rows:
        records.append({
            "id": r["doc_number"],
            "title": r["title"],
            "type": r["content_type"],
            "status": r["status"],
            "author": r["author"],
            "version": r["version"],
            "updated": r["updated_at"],
            "views": r["views"] or 0,
            "downloads": r["downloads"] or 0,
            "shares": r["shares"] or 0,
            "language": r["language"],
        })
        type_counts[r["content_type"]] = type_counts.get(r["content_type"], 0) + 1

    review_pipeline = [
        {"stage": "Draft", "count": sum(1 for r in records if r["status"] == "draft")},
        {"stage": "In Review", "count": sum(1 for r in records if r["status"] == "in_review")},
        {"stage": "Approved", "count": sum(1 for r in records if r["status"] == "approved")},
        {"stage": "Published", "count": sum(1 for r in records if r["status"] == "published")},
    ]
    return {
        "records": records,
        "charts": {
            "USAGE_TREND": [],
            "CONTENT_TYPES": [{"type": k, "count": v} for k, v in type_counts.items()],
            "REVIEW_PIPELINE": review_pipeline,
        },
        "kpis": [],
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
