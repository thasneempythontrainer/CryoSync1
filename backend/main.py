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

from fastapi import FastAPI, Header, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from database import get_pool, init_db, close_pool
from seed import seed_database
from agent import run_agent_chat
from auth import (
    authenticate_user,
    create_session,
    get_user_by_token,
    delete_session,
    public_user,
)

@asynccontextmanager
async def lifespan(app: FastAPI):
    print("Initializing database...")
    await init_db()
    pool = await get_pool()
    await seed_database(pool)
    scanner_task = asyncio.create_task(background_temp_incident_scanner())
    print("Server ready!")
    yield
    scanner_task.cancel()
    await close_pool()
    print("Server shut down.")

app = FastAPI(title="CryoSync API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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

async def write_to_table(table: str, record: dict):
    pool = await get_pool()
    rid = record.get("id", generate_id("REC"))
    async with pool.acquire() as conn:
        await conn.execute(
            f"INSERT INTO {table} (id, data) VALUES ($1, $2::jsonb) ON CONFLICT (id) DO UPDATE SET data = $2::jsonb",
            rid, json.dumps(record)
        )
    return rid

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

def format_compact_currency(value: float) -> str:
    if value >= 1_000_000:
        return f"${value/1_000_000:.1f}M"
    if value >= 1_000:
        return f"${value/1_000:.1f}K"
    return f"${value:.0f}"

@app.get("/api/dashboard")
async def get_dashboard(facility: str = None, dateRange: str = None):
    shipments = await get_shipments_from_db()
    lots = await get_all_from_table("inventory_lots", "id")
    incidents = await get_all_from_table("compliance_incidents", "id")
    zones = await get_all_from_table("storage_zones", "id")
    
    if facility:
        shipments = [s for s in shipments if s.get("facilityId") == facility]
    
    now = datetime.now()
    if dateRange:
        days = int(dateRange)
        cutoff = now - timedelta(days=days)
        shipments = [s for s in shipments if datetime.fromisoformat(s.get("createdAt", now.isoformat())) >= cutoff]
    
    total = len(shipments)
    released = sum(1 for s in shipments if s["status"] == "released")
    quarantined = sum(1 for s in shipments if s["status"] == "quarantined")
    rejected = sum(1 for s in shipments if s["status"] == "rejected")
    in_transit = sum(1 for s in shipments if s["status"] == "in_transit")
    excursions = sum(1 for s in shipments if any(r.get("excursion") for r in s.get("temperatureReadings", [])))
    total_inv_value = sum(l.get("value", 0) * l.get("quantity", 0) for l in lots)
    near_expiry = sum(1 for l in lots if 0 <= l.get("daysUntilExpiry", 999) <= 30)
    open_incidents = sum(1 for c in incidents if c.get("status") in ("open", "investigating"))
    supplier_names = set(s["supplierName"] for s in shipments)
    supplier_compliance = round(sum(1 for s in shipments if s.get("condition") != "damaged") / max(1, total) * 100) if supplier_names else 0
    
    kpis = [
        {"label": "Active Shipments", "value": in_transit, "unit": "", "trend": "up" if in_transit > 5 else "neutral", "trendPercent": 12, "icon": "truck"},
        {"label": "Inventory Value", "value": format_compact_currency(total_inv_value), "unit": "", "trend": "up", "trendPercent": 8.3, "icon": "package"},
        {"label": "Open Incidents", "value": open_incidents, "unit": "", "trend": "up" if open_incidents > 3 else "down", "trendPercent": 15 if open_incidents > 3 else -5, "icon": "alert-triangle"},
        {"label": "Compliance Rate", "value": supplier_compliance, "unit": "%", "trend": "up" if supplier_compliance >= 95 else "down", "trendPercent": 2.1, "icon": "shield-check"},
    ]
    
    shipment_trends = []
    for i in range(29, -1, -1):
        d = now - timedelta(days=i)
        date_str = d.strftime("%Y-%m-%d")
        day_shipments = [s for s in shipments if s.get("receivedDate") == date_str or s.get("createdAt", "").startswith(date_str)]
        shipment_trends.append({
            "date": date_str,
            "received": len(day_shipments),
            "quarantined": sum(1 for s in day_shipments if s["status"] == "quarantined"),
            "rejected": sum(1 for s in day_shipments if s["status"] == "rejected"),
        })
    
    receiving_volume = []
    for m in range(5, -1, -1):
        d = datetime(now.year, now.month - m, 1) if now.month > m else datetime(now.year - 1, 12 + (now.month - m), 1)
        month_str = d.strftime("%Y-%m")
        month_shipments = [s for s in shipments if s.get("createdAt", "").startswith(month_str)]
        target = 40 + round(math.sin(m) * 10)
        receiving_volume.append({"month": month_str, "volume": len(month_shipments), "target": target})
    
    regimes = list(set(s["temperatureRegime"] for s in shipments))
    temperature_compliance = []
    for regime in regimes:
        reg_shipments = [s for s in shipments if s["temperatureRegime"] == regime]
        reg_total = len(reg_shipments)
        reg_excursions = sum(1 for s in reg_shipments if any(r.get("excursion") for r in s.get("temperatureReadings", [])))
        temperature_compliance.append({
            "category": regime,
            "compliant": reg_total - reg_excursions,
            "excursion": reg_excursions,
            "complianceRate": round((reg_total - reg_excursions) / max(1, reg_total) * 100),
        })
    
    supplier_map = {}
    for s in shipments:
        sn = s["supplierName"]
        if sn not in supplier_map:
            supplier_map[sn] = []
        supplier_map[sn].append(s)
    
    supplier_performance = []
    for name, ships in sorted(supplier_map.items(), key=lambda x: -len(x[1]))[:10]:
        if len(ships) < 2:
            continue
        on_time = sum(1 for s in ships if s["status"] in ("released", "arrived"))
        damaged = sum(1 for s in ships if s["condition"] in ("damaged", "fair"))
        compliant = sum(1 for s in ships if not any(r.get("excursion") for r in s.get("temperatureReadings", [])))
        score = round((on_time / len(ships)) * 40 + (1 - damaged / len(ships)) * 30 + (compliant / len(ships)) * 30)
        supplier_performance.append({
            "supplierName": name, "shipments": len(ships), "onTime": on_time,
            "damageRate": round(damaged / len(ships) * 100),
            "complianceRate": round(compliant / len(ships) * 100), "score": score,
        })
    supplier_performance.sort(key=lambda x: -x["score"])
    
    cat_map = {}
    for l in lots:
        cat = l.get("category", "unknown")
        val = l.get("value", 0) * l.get("quantity", 0)
        cat_map[cat] = cat_map.get(cat, 0) + val
    total_val = sum(cat_map.values()) or 1
    inventory_distribution = [{"category": cat, "value": round(val), "percentage": round(val / total_val * 100)} for cat, val in sorted(cat_map.items(), key=lambda x: -x[1])[:8]]
    
    storage_occupancy = [{"zone": z["name"], "capacity": z["capacity"], "utilized": z["utilized"]} for z in zones[:10]]
    
    expiry_timeline = []
    for m in range(6):
        d = datetime(now.year, now.month + m, 1) if now.month + m <= 12 else datetime(now.year + 1, now.month + m - 12, 1)
        month_str = d.strftime("%Y-%m")
        expiring = sum(1 for l in lots if l.get("expiryDate", "").startswith(month_str))
        expiry_timeline.append({"month": month_str, "expiring": expiring, "total": len(lots)})
    
    cold_chain_excursions = []
    for i in range(29, -1, -1):
        d = now - timedelta(days=i)
        date_str = d.strftime("%Y-%m-%d")
        day_excursions = []
        for s in shipments:
            for r in s.get("temperatureReadings", []):
                if r.get("excursion") and r.get("timestamp", "").startswith(date_str):
                    day_excursions.append(r)
        cold_chain_excursions.append({
            "date": date_str,
            "excursions": len(day_excursions),
            "criticalExcursions": sum(1 for r in day_excursions if r.get("temperature", 0) < r.get("minThreshold", 0) - 5 or r.get("temperature", 0) > r.get("maxThreshold", 0) + 5),
        })
    
    quality_results = []
    for m in range(5, -1, -1):
        d = datetime(now.year, now.month - m, 1) if now.month > m else datetime(now.year - 1, 12 + (now.month - m), 1)
        month_str = d.strftime("%Y-%m")
        month_ships = [s for s in shipments if s.get("createdAt", "").startswith(month_str)]
        quality_results.append({
            "month": month_str,
            "passed": sum(1 for s in month_ships if s.get("condition") in ("excellent", "good")),
            "failed": sum(1 for s in month_ships if s.get("condition") == "damaged"),
            "pending": sum(1 for s in month_ships if s.get("status") in ("receiving", "quarantined")),
        })
    
    recent_activity = []
    for s in shipments[:10]:
        activity_type = "lot_released" if s["status"] == "released" else "compliance_flagged" if s["status"] == "quarantined" else "shipment_received"
        severity = "info"
        if s["status"] == "quarantined":
            severity = "warning"
        elif s["status"] == "rejected":
            severity = "error"
        recent_activity.append({
            "id": f"act-{s['id']}",
            "type": activity_type,
            "title": f"{s['shipmentNumber']} - {s['supplierName']}",
            "description": f"{'Lot released to inventory' if s['status'] == 'released' else 'Quarantined for inspection' if s['status'] == 'quarantined' else 'Shipment received'} at {s.get('facilityName', '')}",
            "timestamp": s.get("updatedAt", s.get("createdAt", "")),
            "severity": severity,
        })
    
    return {
        "kpis": kpis, "shipmentTrends": shipment_trends, "receivingVolume": receiving_volume,
        "temperatureCompliance": temperature_compliance, "supplierPerformance": supplier_performance,
        "inventoryDistribution": inventory_distribution, "storageOccupancy": storage_occupancy,
        "expiryTimeline": expiry_timeline, "coldChainExcursions": cold_chain_excursions,
        "qualityInspectionResults": quality_results, "recentActivity": recent_activity,
    }

@app.get("/api/dashboard/refresh")
async def refresh_dashboard(facility: str = None, dateRange: str = None):
    return await get_dashboard(facility, dateRange)

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
    """Persist the full Databricks agent context so a conversation can be resumed later."""
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
# AGENT (Databricks tool-calling)
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
        if "DATABRICKS_TOKEN" in detail or "DATABRICKS_HOST" in detail or "DATABRICKS_CLIENT" in detail:
            raise HTTPException(500, "Missing Databricks credentials. See backend/.env")
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
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = 'public'
              AND table_type = 'BASE TABLE'
            ORDER BY table_name
        """)
        table_names = [r["table_name"] for r in rows if r["table_name"] not in LAKEBASE_EXCLUDED_TABLES]

        tables = []
        for name in table_names:
            cols = await conn.fetch("""
                SELECT column_name, data_type, is_nullable
                FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = $1
                ORDER BY ordinal_position
            """, name)
            count = await conn.fetchval(f"SELECT count(*) FROM {safe_ident(name)}")
            size = await conn.fetchval("SELECT pg_total_relation_size($1::regclass)", name) or 0
            schema = [
                {
                    "name": c["column_name"],
                    "type": pg_data_type_to_label(c["data_type"]),
                    "nullable": c["is_nullable"] == "YES",
                    "description": "",
                }
                for c in cols
            ]
            tags = ["operations", "core"] if name in CORE_LAKE_TABLES else ["lake"]
            tables.append({
                "id": name,
                "name": name,
                "description": f"Lake table `{name}` with {count:,} rows across {len(cols)} columns.",
                "schema": schema,
                "rowCount": count,
                "sizeBytes": size,
                "format": "delta",
                "location": f"/data/lake/{name}",
                "tags": tags,
                "createdAt": now_iso(),
                "updatedAt": now_iso(),
            })
        return tables

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
    name = safe_ident(table_id)
    pool = await get_pool()
    async with pool.acquire() as conn:
        try:
            cols = await conn.fetch(
                "SELECT column_name FROM information_schema.columns "
                "WHERE table_schema = 'public' AND table_name = $1 ORDER BY ordinal_position",
                name,
            )
            if not cols:
                raise HTTPException(404, "Table not found")
            rows = await conn.fetch(f"SELECT * FROM {name} LIMIT 10")
            total = await conn.fetchval(f"SELECT count(*) FROM {name}")
        except HTTPException:
            raise
        except Exception:
            raise HTTPException(404, "Table not found")

    columns = [c["column_name"] for c in cols]
    data_rows = []
    for r in rows:
        record = dict(r)
        for k, v in list(record.items()):
            if v is not None and not isinstance(v, (str, int, float, bool)):
                record[k] = str(v)
        data_rows.append(record)

    return {"columns": columns, "rows": data_rows, "totalRows": total}

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

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
