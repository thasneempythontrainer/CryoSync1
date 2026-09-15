"""Enterprise seed for the cord-blood-bank relational model.

Populates families, enrollments, collection_kits, cord_blood_units,
storage_tanks, tank_temperature_logs and transplant_records so the CBU
lifecycle is a real, interconnected dataset (and so uploaded lab reports can
be matched to real cord blood units). Also seeds the operational tables that
back the Payments, Referrals, Franchisees and Content pages.

Additionally seeds the cold-chain dataset behind the Compliance / Storage /
Receiving pages: facilities, suppliers, products, storage zones, shipments
(with temperature logs), inventory lots and compliance incidents.

Idempotent: the core CBU dataset is seeded only when cord_blood_units is empty;
the newer operational tables use INSERT OR REPLACE so they stay populated on
every boot, and the cold-chain dataset is seeded only when no facilities exist
yet (i.e. on a fresh database).
"""

import json
import math
import random
import secrets
from datetime import datetime, timedelta

__all__ = ["seed_enterprise"]


def _now_iso() -> str:
    return datetime.now().isoformat()


def _iso(dt: datetime) -> str:
    return dt.isoformat()


_LAST_NAMES = [
    "Iyer", "Shah", "Patel", "Mehta", "Banerjee", "Reddy", "Nair", "Kulkarni",
    "Das", "Menon", "Krishnan", "Aggarwal", "Chawla", "Sethi", "Pillai", "Rao",
]
_FIRST_NAMES = [
    "Aarav", "Diya", "Ishaan", "Ananya", "Vivaan", "Saanvi", "Arjun", "Rachna",
    "Kabir", "Zoya", "Rohan", "Meera", "Aditya", "Priya", "Vikram", "Neha",
]
_FACILITIES = ["Baldwin Park", "Ahmedabad", "Taipei", "Taiwan"]
_HOSPITALS = [
    "Apollo Hospitals", "Fortis", "Max Healthcare", "Manipal", "CIMS",
    "KIMS", "St. John's Medical", "Baptist Health", "Kaiser Permanente",
    "Cedars-Sinai", "UCLA Health", "City Hospital",
]
_COLLECTORS = ["RN Maria Santos", "RN Priya Venkatesh", "Dr. Alan Chen", "RN John Park"]
_PROCESSING_TECHS = ["TL-0412", "TL-0748", "TL-1123", "TL-0965"]
_METHODS = ["sepax", "autoxpress", "maxcell", "prepacyte_cb", "standard_cell"]
_PLAN_TYPES = ["cord_blood", "cord_tissue", "cord_blood_tissue", "lifetime"]
_STORAGE_PLANS = ["annual", "18_year", "lifetime"]
_KIT_STATES = ["kit_shipped", "kit_received_at_hospital", "collected", "in_transit", "received_at_lab", "processing", "completed", "rejected"]
_UNIT_STATES = ["cryopreserved", "quarantined", "released_for_transplant", "shipped", "discarded"]
_TANK_IDS = ["TNK-001", "TNK-002", "TNK-003", "TNK-004", "TNK-005", "TNK-006", "TNK-007", "TNK-008"]
_ABO = ["A+", "O+", "B+", "AB+", "A-", "O-", "B-"]
_HLA_ALLELES = ["01:01", "02:01", "03:01", "04:01", "07:01", "08:01", "11:01", "15:01", "18:01", "24:02"]


def _hla_tag() -> str:
    loci = {}
    for gene in ("A", "B", "C", "DRB1", "DQB1"):
        loci[gene] = random.sample(_HLA_ALLELES, 2)
    return json.dumps(loci)


def _id(prefix: str) -> str:
    return f"{prefix}-{secrets.token_hex(8)}"


def _enroll_no(year: int, seq: int) -> str:
    return f"ENR-{year}-{seq:06d}"


def _unit_no(year: int, seq: int) -> str:
    return f"CBU-{year}-{seq:06d}"


def _kit_no(year: int, seq: int) -> str:
    return f"KIT-{year}-{seq:06d}"


def _txp_no(year: int, seq: int) -> str:
    return f"TXP-{year}-{seq:06d}"


async def _seed_operational_tables(conn, rng, now) -> None:
    """Seed tables backing Payments/Referrals/Franchisees/Content (idempotent)."""
    # --- Payment transactions (plans & payment lifecycle) ---
    TXN_PLANS = ["Premium Plus", "Premium", "Standard", "Basic"]
    TXN_METHODS = ["Credit Card", "Bank Transfer", "Insurance", "Installment", "Manual"]
    TXN_STATUS = ["completed", "pending", "processing", "on_hold", "failed", "refunded"]
    TXN_MILESTONES = ["Collection", "Processing", "Release", "Storage Year 1", "Storage Year 2", "Storage Year 3"]
    txn_rows = []
    fam_rows = await conn.fetch(
        "SELECT f.id FROM families f "
        "WHERE NOT EXISTS (SELECT 1 FROM payment_transactions p WHERE p.family_id = f.id) "
        "ORDER BY f.id"
    )
    fidx = [dict(r) for r in fam_rows]
    for i, fam in enumerate(fidx):
        plan = rng.choice(TXN_PLANS)
        amount = rng.choice([1400, 2200, 3600, 4850, 6000])
        txn_rows.append((
            _id("TXN"), f"TXN-{88400 - i:05d}", fam["id"], plan, amount,
            rng.choice(TXN_METHODS), rng.choice(TXN_STATUS), rng.choice(TXN_MILESTONES),
            _iso(now - timedelta(days=rng.randint(0, 400))).split("T")[0],
            _now_iso(), _now_iso(),
        ))
    if txn_rows:
        await conn.executemany(
            "INSERT OR REPLACE INTO payment_transactions "
            "(id, txn_number, family_id, plan_type, amount, method, status, milestone, paid_at, created_at, updated_at) "
            "VALUES (?,?,?,?,?,?,?,?,?,?,?)",
            txn_rows,
        )

    # --- Referral partner sources ---
    REF_SOURCES = [
        ("Houston Women's Hospital", "hospital", "Texas", "Dr. Sarah Mitchell", 186, 84, 312400, "active"),
        ("Dr. James Park, OB/GYN", "physician", "California", "Dr. James Park", 142, 68, 248800, "active"),
        ("Chicago Maternity Center", "maternity", "Illinois", "Lisa Thompson", 128, 58, 196200, "active"),
        ("Google Ads - Stem Cell", "digital", "National", "Marketing Team", 342, 148, 524600, "active"),
        ("Family Referral Program", "referral", "National", "Referral Desk", 268, 132, 468000, "active"),
        ("Dr. Maria Santos", "physician", "Texas", "Dr. Maria Santos", 96, 44, 156800, "active"),
        ("NYC Women's Health", "hospital", "New York", "Dr. Rachel Kim", 112, 52, 192400, "active"),
        ("Atlanta Birth Center", "maternity", "Georgia", "Patricia Evans", 84, 36, 124800, "under_review"),
        ("Facebook Campaign Q3", "digital", "National", "Marketing Team", 186, 78, 276400, "active"),
        ("Dr. Robert Chen", "physician", "California", "Dr. Robert Chen", 78, 34, 118200, "inactive"),
    ]
    ref_rows = [
        (f"REF-{2472 + i}", src, typ, reg, contact, refs, conv, rev, status, _now_iso(), _now_iso())
        for i, (src, typ, reg, contact, refs, conv, rev, status) in enumerate(REF_SOURCES)
    ]
    if ref_rows:
        await conn.executemany(
            "INSERT OR REPLACE INTO referral_sources "
            "(id, source_name, source_type, region, contact, referrals, conversions, revenue, status, created_at, updated_at) "
            "VALUES (?,?,?,?,?,?,?,?,?,?,?)",
            ref_rows,
        )

    # --- Collection branches (franchisees) ---
    BRANCHES = [
        ("Houston Main", "Dr. Angela Torres", "Texas", "active", 186, 96.2, "AABB", "2026-07-15", "2026-10-15", 24, 98),
        ("Los Angeles", "Dr. Michael Park", "California", "active", 142, 94.8, "AABB", "2026-06-20", "2026-09-20", 18, 95),
        ("Chicago Hub", "Sarah Mitchell, RN", "Illinois", "active", 128, 97.1, "AABB", "2026-08-01", "2026-11-01", 16, 97),
        ("New York Center", "Dr. Rachel Kim", "New York", "active", 112, 93.4, "FACT", "2026-05-10", "2026-08-10", 14, 92),
        ("Atlanta Branch", "Patricia Evans, BSN", "Georgia", "under_review", 84, 95.6, "AABB", "2026-04-22", "2026-07-22", 10, 94),
        ("Dallas Satellite", "TBD", "Texas", "setup", 0, 0.0, "Pending", "—", "—", 4, 45),
        ("Miami Collection Site", "Dr. Carlos Rivera", "Florida", "active", 68, 94.1, "FACT", "2026-06-05", "2026-09-05", 8, 90),
        ("Seattle Partner", "Lisa Chen, RN", "Washington", "active", 52, 96.8, "AABB", "2026-07-20", "2026-10-20", 6, 96),
    ]
    br_rows = [
        (_id("BR"), f"BR-{i + 1:03d}", name, mgr, reg, status, cols, q, acc, la, na, staff, ready, _now_iso(), _now_iso())
        for i, (name, mgr, reg, status, cols, q, acc, la, na, staff, ready) in enumerate(BRANCHES)
    ]
    if br_rows:
        await conn.executemany(
            "INSERT OR REPLACE INTO branches "
            "(id, branch_number, name, manager, region, status, collections, quality_score, accreditation, "
            "last_audit, next_audit, staff, readiness, created_at, updated_at) "
            "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            br_rows,
        )

    # --- Knowledge-base content documents ---
    CONTENT = [
        ("DOC-0241", "Cord Blood Collection: A Guide for Families", "Family Guide", "published", "Dr. Angela Torres", "3.2", "2026-08-15", 2840, 892, 240, "English"),
        ("DOC-0240", "Temperature Monitoring SOP v4.1", "SOP", "published", "Quality Team", "4.1", "2026-08-12", 1560, 342, 96, "English"),
        ("DOC-0239", "Consent Form - Standard Agreement", "Consent Form", "published", "Legal Team", "2.8", "2026-08-10", 3200, 1240, 310, "English/Spanish"),
        ("DOC-0238", "Branch Staff Onboarding Checklist", "Training", "published", "HR Team", "1.4", "2026-08-08", 890, 256, 44, "English"),
        ("DOC-0237", "Cryostorage Handling Procedures", "SOP", "in_review", "Dr. Michael Park", "5.0-draft", "2026-08-18", 0, 0, 0, "English"),
        ("DOC-0236", "What Happens After Collection?", "Family Guide", "published", "Clinical Team", "2.1", "2026-08-05", 1840, 568, 152, "English"),
        ("DOC-0235", "HLA Typing Explained for Parents", "Family Guide", "draft", "Dr. Rachel Kim", "1.0-draft", "2026-08-19", 0, 0, 0, "English"),
        ("DOC-0234", "Emergency Release Protocol", "Clinical Protocol", "published", "Dr. Angela Torres", "3.0", "2026-07-28", 680, 198, 54, "English"),
        ("DOC-0233", "Courier Cold-Chain Requirements", "SOP", "published", "Logistics Team", "2.3", "2026-07-22", 920, 278, 61, "English"),
        ("DOC-0232", "Understanding Your CBU Test Results", "Family Guide", "in_review", "Lab Team", "1.2-review", "2026-08-17", 0, 0, 0, "English"),
        ("DOC-0231", "Quality Inspection Training Module", "Training", "published", "Quality Team", "2.0", "2026-07-15", 1240, 412, 120, "English"),
        ("DOC-0230", "Informed Consent - Research Use", "Consent Form", "approved", "Legal Team", "1.5", "2026-08-14", 320, 88, 12, "English"),
    ]
    for doc_no, title, ctype, status, author, ver, upd, views, dl, shares, lang in CONTENT:
        await conn.execute(
            "INSERT OR REPLACE INTO content_documents "
            "(id, doc_number, title, content_type, status, author, version, updated_at, views, downloads, shares, language, created_at) "
            "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
            _id("DOC"), doc_no, title, ctype, status, author, ver, upd, views, dl, shares, lang, _now_iso(),
        )


# ---------------------------------------------------------------------------
# Cold-chain dataset (Compliance / Storage / Receiving pages)
# ---------------------------------------------------------------------------

_REGIME_RANGES = {
    "refrigerated_2_8": (2, 8),
    "frozen_minus_20": (-25, -15),
    "ultra_frozen_minus_80": (-85, -75),
    "ambient": (15, 25),
    "liquid_nitrogen": (-200, -180),
}

_SEED_FACILITIES = [
    ("FAC-001", "Baldwin Park", "California", "warehouse", "active"),
    ("FAC-002", "Ahmedabad Lab", "Gujarat", "laboratory", "active"),
    ("FAC-003", "Taipei Storage", "Taipei", "warehouse", "active"),
    ("FAC-004", "Tainan Facility", "Tainan", "distribution_center", "active"),
]

_SEED_SUPPLIERS = [
    ("SUP-001", "World Courier", "transport", "New York", "USA", "approved", "platinum"),
    ("SUP-002", "DHL Medical Express", "transport", "Frankfurt", "Germany", "approved", "gold"),
    ("SUP-003", "FedEx Clinical Logistics", "transport", "Memphis", "USA", "approved", "gold"),
    ("SUP-004", "Baldwin BioSupplies", "laboratory", "Los Angeles", "USA", "approved", "silver"),
    ("SUP-005", "MedCold Pharma", "manufacturing", "Ahmedabad", "India", "provisional", "bronze"),
    ("SUP-006", "Taipei CellWorks", "manufacturing", "Taipei", "Taiwan", "approved", "silver"),
]

_SEED_PRODUCTS = [
    ("PRD-001", "Cord Blood Collection Kit", "cord_blood_unit", "refrigerated_2_8", "SUP-004", 730),
    ("PRD-002", "Maternal Blood Vials (5-pack)", "maternal_sample", "refrigerated_2_8", "SUP-004", 365),
    ("PRD-003", "CryoBag 50mL", "cord_blood_unit", "ultra_frozen_minus_80", "SUP-005", 1825),
    ("PRD-004", "Viability Test Reagent", "test_report", "frozen_minus_20", "SUP-005", 450),
    ("PRD-005", "HLA Typing Panel", "test_report", "refrigerated_2_8", "SUP-006", 540),
    ("PRD-006", "Liquid Nitrogen Dewar", "hybrid_banking", "liquid_nitrogen", "SUP-006", 3650),
    ("PRD-007", "Transport Media", "cellular_therapy_release", "refrigerated_2_8", "SUP-001", 365),
    ("PRD-008", "Cold Storage Probe", "hybrid_banking", "ambient", "SUP-002", 730),
]


def _make_temperature_readings(shipment_id, regime, start, hours, rng, excursion=False):
    """Generate an hourly logger trace; optionally force a late-transit excursion."""
    mn, mx = _REGIME_RANGES[regime]
    base = (mn + mx) / 2
    readings = []
    n = int(hours) + 1
    for i in range(n):
        ts = start + timedelta(minutes=60 * i)
        t = base + 1.4 * math.sin(i / 3.0) + rng.uniform(-1.1, 1.1)
        if excursion and i >= int(n * 0.6):
            t = mx + rng.uniform(2.5, 6.0)
        elif excursion and i == int(n * 0.58):
            t = mx + rng.uniform(7.0, 9.0)
        readings.append({
            "id": f"TMP-{shipment_id}-{i:04d}",
            "shipmentId": shipment_id,
            "timestamp": ts.isoformat(),
            "temperature": round(t, 2),
            "minThreshold": mn,
            "maxThreshold": mx,
            "deviceId": f"LB-{rng.randint(1000, 9999)}",
            "location": "in_transit",
            "excursion": bool((t < mn) or (t > mx)),
            "excursionDurationMinutes": None,
        })
    return readings


_COLD_CHAIN_COLUMNS = {
    "facilities": ["id", "data", "name", "region"],
    "suppliers": ["id", "data", "name", "region", "qualification_status"],
    "products": ["id", "data", "name", "category", "supplier_id"],
    "storage_zones": ["id", "data", "name", "facility_id", "capacity", "utilized", "zone_type"],
    "inventory_lots": ["id", "data", "product_id", "lot_number", "quantity", "status", "expiry_date", "storage_zone", "created_at"],
    "compliance_incidents": ["id", "data", "entity_type", "entity_id", "status", "severity", "deviation_type", "created_at"],
    "shipments": [
        "id", "shipment_number", "supplier_id", "supplier_name", "origin", "destination",
        "facility_id", "facility_name", "status", "category", "temperature_regime",
        "product_count", "lot_count", "received_date", "scheduled_date", "shipped_date",
        "estimated_arrival", "actual_arrival", "receiving_technician", "carrier",
        "tracking_number", "bill_of_lading", "condition", "chain_of_custody", "coa_attached",
        "priority", "storage_zone", "dock_to_inventory_minutes", "total_value",
        "purchase_order_number", "purchase_order_item", "incoterm", "transportation_mode",
        "container_type", "pallet_count", "gross_weight_kg", "net_weight_kg", "volume_cbm",
        "handling_unit_count", "seal_number", "dangerous_goods", "un_number",
        "proper_shipping_name", "dg_class", "notes", "created_at", "updated_at",
        "temperature_readings", "loggers", "receiving_checklist", "disposition",
    ],
}


async def _existing_columns(conn, table: str):
    """Return the set of column names that currently exist on the table so the
    seeder adapts to Databricks's `(id, data)` JSON tables as well as SQLite's
    wide tables."""
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
            return set(cols)
    except Exception:
        pass
    try:
        rows = await conn.fetch(f'PRAGMA table_info("{table}")')
        return {str(r[1]) for r in rows if len(rows) > 0}
    except Exception:
        return set()


async def _insert_or_replace(conn, table: str, rows) -> None:
    """Insert rows into a cold-chain table, using only columns that exist on the
    active backend (Databricks keeps JSON tables as `id, data` only)."""
    existing = await _existing_columns(conn, table)
    cols = [c for c in _COLD_CHAIN_COLUMNS[table] if c in existing]
    if not cols or not rows:
        return
    sql_cols = ", ".join(cols)
    placeholders = ", ".join(f"?{i}" for i in range(1, len(cols) + 1))
    await conn.executemany(
        f"INSERT OR REPLACE INTO {table} ({sql_cols}) VALUES ({placeholders})",
        [
            tuple(r[c] if c in r else None for c in cols)
            for r in rows
        ],
    )
    print(f"  cold-chain: {len(rows)} row(s) -> {table} (cols: {cols})")


async def _seed_cold_chain(conn, rng, now) -> None:
    """Seed the cold-chain operational dataset (idempotent via facilities guard)."""
    existing = await conn.fetchval("SELECT count(*) FROM facilities")
    if existing:
        return

    fac_ids = []
    fac_rows = []
    for i, (fid, name, loc, ftype, status) in enumerate(_SEED_FACILITIES):
        cap = rng.choice([1200, 1800, 2400])
        util = rng.randint(int(cap * 0.5), int(cap * 0.9))
        fac_data = {
            "id": fid, "name": name, "location": loc, "type": ftype, "status": status,
            "temperatureRegimes": ["refrigerated_2_8", "frozen_minus_20", "ultra_frozen_minus_80"],
            "storageZones": 2, "totalCapacity": cap, "utilizedCapacity": util,
            "utilizationPercent": round(util * 100 / cap, 1),
        }
        fac_rows.append({"id": fid, "data": json.dumps(fac_data), "name": name, "region": loc})
        fac_ids.append(fid)
    await _insert_or_replace(conn, "facilities", fac_rows)

    sup_rows = []
    for i, (sid, name, cat, loc, country, status, tier) in enumerate(_SEED_SUPPLIERS):
        score = rng.randint(78, 98)
        sup_data = {
            "id": sid, "name": name, "tier": tier, "category": [cat], "location": loc,
            "country": country, "qualificationStatus": status,
            "lastAuditDate": _iso(now - timedelta(days=rng.randint(15, 200))).split("T")[0],
            "nextAuditDate": _iso(now + timedelta(days=rng.randint(20, 300))).split("T")[0],
            "overallScore": score, "onTimeDelivery": rng.randint(80, 99),
            "qualityScore": rng.randint(85, 100), "complianceScore": rng.randint(88, 100),
            "activeContracts": rng.randint(2, 12), "totalShipments": rng.randint(30, 400),
            "contactName": f"Ops Lead {i + 1}", "contactEmail": f"ops{i + 1}@cryosync.local",
            "contactPhone": f"+1-555-01{i:02d}",
        }
        sup_rows.append({"id": sid, "data": json.dumps(sup_data), "name": name, "region": loc, "qualification_status": status})
    await _insert_or_replace(conn, "suppliers", sup_rows)

    prd_rows = []
    for pid, name, category, regime, sup_id, shelf in _SEED_PRODUCTS:
        prd_data = {
            "id": pid, "name": name, "category": category, "temperatureRegime": regime,
            "manufacturer": name.split(" ")[0], "storageRequirements": regime.replace("_", " "),
            "shelfLifeDays": shelf, "requiresCoa": category in ("cord_blood_unit", "cellular_therapy_release"),
            "hazardous": False, "controlledSubstance": False, "unitOfMeasure": "units",
            "listPrice": rng.choice([120, 240, 480, 960, 1900]),
        }
        prd_rows.append({"id": pid, "data": json.dumps(prd_data), "name": name, "category": category, "supplier_id": sup_id})
    await _insert_or_replace(conn, "products", prd_rows)

    zone_rows = []
    facility_names = {f[0]: f[1] for f in _SEED_FACILITIES}
    for fac_id in fac_ids:
        for j, (regime, zname) in enumerate(
            [
                ("refrigerated_2_8", f"{facility_names[fac_id]} Cold Room"),
                ("ultra_frozen_minus_80", f"{facility_names[fac_id]} LN2 Vault"),
            ]
        ):
            cap = rng.choice([400, 600, 800])
            util = rng.randint(int(cap * 0.3), int(cap * 0.85))
            zid = f"ZONE-{fac_id[-3:]}-{j + 1}"
            zone_data = {
                "id": zid, "name": zname, "facilityId": fac_id, "facilityName": facility_names[fac_id],
                "temperatureRegime": regime, "capacity": cap, "utilized": util,
                "utilizationPercent": round(util * 100 / cap, 1),
                "status": "active", "lastInventoryDate": _iso(now - timedelta(days=rng.randint(0, 14))).split("T")[0],
                "warehouseNumber": rng.choice(["WH-A", "WH-B", "WH-C", "WH-D"]), "storageType": regime,
            }
            zone_rows.append({"id": zid, "data": json.dumps(zone_data), "name": zname, "facility_id": fac_id, "capacity": cap, "utilized": util, "zone_type": regime})
    await _insert_or_replace(conn, "storage_zones", zone_rows)

    # --- Shipments (with temperature logs) ---
    STATUSES = ["released", "released", "released", "arrived", "receiving", "in_transit", "quarantined", "rejected", "scheduled"]
    CATEGORIES = ["cord_blood_unit", "maternal_sample", "test_report", "cellular_therapy_release"]
    REGIMES = ["refrigerated_2_8", "frozen_minus_20", "ultra_frozen_minus_80", "liquid_nitrogen"]
    SUPP_NUM = len(_SEED_SUPPLIERS)
    SHIP_COUNT = 24
    EXCURSION_SHIPMENTS = {3, 7, 11, 14, 18, 22}
    shipments = []
    for i in range(SHIP_COUNT):
        sid = f"SHP-{1001 + i}"
        sup = _SEED_SUPPLIERS[i % SUPP_NUM]
        fac = _SEED_FACILITIES[i % len(_SEED_FACILITIES)]
        regime = REGIMES[i % len(REGIMES)]
        status = STATUSES[i % len(STATUSES)]
        shipped = now - timedelta(days=rng.randint(1, 45))
        hours = rng.choice([8, 12, 24, 36, 48])
        readings = _make_temperature_readings(
            sid, regime, shipped, hours, rng, excursion=(i + 1) in EXCURSION_SHIPMENTS
        )
        arrived = shipped + timedelta(hours=hours)
        quarantined = status == "quarantined"
        arrival = None if status in ("scheduled", "in_transit") else (arrived if status != "arrived" else arrived)
        shipment = {
            "id": sid,
            "shipment_number": f"SHP-{1001 + i}",
            "supplier_id": sup[0], "supplier_name": sup[1],
            "origin": sup[3], "destination": fac[1],
            "facility_id": fac[0], "facility_name": fac[1],
            "status": status, "category": CATEGORIES[i % len(CATEGORIES)],
            "temperature_regime": regime,
            "product_count": rng.randint(1, 24), "lot_count": rng.randint(1, 6),
            "received_date": (arrived.isoformat() if arrived else None),
            "scheduled_date": shipped.isoformat(), "shipped_date": shipped.isoformat(),
            "estimated_arrival": (shipped + timedelta(hours=hours)).isoformat(),
            "actual_arrival": (arrived.isoformat() if arrived else None),
            "receiving_technician": rng.choice(["TL-0412", "TL-0748", "TL-1123"]),
            "carrier": sup[1], "tracking_number": f"TRK-{rng.randint(100000, 999999)}",
            "bill_of_lading": f"BOL-{rng.randint(10000, 99999)}",
            "condition": rng.choice(["excellent", "good", "good", "fair"]),
            "chain_of_custody": 1, "coa_attached": 1 if status not in ("rejected", "quarantined") else 0,
            "priority": rng.choice(["standard", "standard", "expedited", "critical"]),
            "storage_zone": f"ZONE-{fac[0][-3:]}-1",
            "dock_to_inventory_minutes": rng.randint(30, 240) if arrived else None,
            "total_value": str(rng.randint(40000, 900000)),
            "purchase_order_number": f"PO-{rng.randint(10000, 99999)}",
            "purchase_order_item": f"LINE-{rng.randint(1, 9)}",
            "incoterm": rng.choice(["EXW", "DDP", "CIP", "FCA"]),
            "transportation_mode": rng.choice(["air", "ground", "air"]),
            "container_type": rng.choice(["ISO-40/HR", "ISO-20/HR", "Insulated Carton"]),
            "pallet_count": rng.randint(1, 8), "gross_weight_kg": str(rng.randint(40, 900)),
            "net_weight_kg": str(rng.randint(20, 700)), "volume_cbm": str(round(rng.uniform(0.3, 6.5), 2)),
            "handling_unit_count": rng.randint(2, 40), "seal_number": f"SEAL-{rng.randint(10000, 99999)}",
            "dangerous_goods": 0, "un_number": "", "proper_shipping_name": "", "dg_class": "",
            "notes": "Seeded demo shipment",
            "created_at": shipped.isoformat(), "updated_at": now.isoformat(),
            "temperature_readings": json.dumps(readings),
            "loggers": json.dumps([]),
            "receiving_checklist": json.dumps({"completed": False, "lineItems": [], "documents": {}}),
            "disposition": json.dumps(
                {
                    "decision": "quarantined" if quarantined else ("rejected" if status == "rejected" else "accepted"),
                    "reasonCode": "temperature_excursion" if quarantined else ("missing_coa" if status == "rejected" else "accepted"),
                    "reason": "Temperature excursion" if quarantined else ("Missing COA" if status == "rejected" else ""),
                    "notes": "", "decidedBy": "Seed Scanner", "decidedAt": (arrived.isoformat() if arrived else now.isoformat()),
                    "notifyQA": bool(quarantined or status == "rejected"), "notifiedQA": False,
                }
                if status in ("quarantined", "rejected")
                else {},
            ),
        }
        shipments.append(shipment)
    await _insert_or_replace(conn, "shipments", shipments)

    # --- Inventory lots ---
    lot_rows = []
    for i in range(12):
        ship = shipments[i % len(shipments)]
        prod = _SEED_PRODUCTS[i % len(_SEED_PRODUCTS)]
        lid = f"LOT-{4001 + i}"
        qty = rng.randint(5, 120)
        expiry = now + timedelta(days=rng.randint(60, 700))
        lot_data = {
            "id": lid, "lotNumber": lid, "productId": prod[0], "productName": prod[1],
            "category": prod[2], "supplierId": ship["supplier_id"], "supplierName": ship["supplier_name"],
            "shipmentId": ship["id"], "quantity": qty, "lowStockThreshold": 10, "lowStock": qty < 15,
            "unit": "units", "status": rng.choice(["available", "available", "quarantined", "released"]),
            "temperatureRegime": prod[3], "storageZone": ship["storage_zone"],
            "storageLocation": ship["storage_zone"], "receivedDate": ship["received_date"],
            "manufacturedDate": (now - timedelta(days=rng.randint(30, 400))).isoformat(),
            "expiryDate": expiry.isoformat(), "daysUntilExpiry": max(1, (expiry - now).days),
            "batchNumber": f"B{rng.randint(1000, 9999)}", "coaReference": f"COA-{rng.randint(10000, 99999)}",
            "coaAttached": bool(ship["coa_attached"]), "qualityStatus": "approved",
            "lastVerifiedDate": (now - timedelta(days=rng.randint(0, 10))).isoformat(),
            "verifiedBy": rng.choice(["QA-Analyst", "Lab-Ops"]), "value": qty * rng.choice([120, 240, 480]),
            "storageType": prod[3], "storageSection": "A", "storageBin": f"BIN-{rng.randint(1, 99)}",
            "warehouseNumber": ship.get("storage_zone", ""), "huNumber": f"HU-{rng.randint(1000, 9999)}",
            "stockType": "unrestricted", "quantId": f"Q-{rng.randint(10000, 99999)}", "notes": "",
        }
        lot_rows.append({
            "id": lid, "data": json.dumps(lot_data), "product_id": prod[0], "lot_number": lid,
            "quantity": qty, "status": lot_data["status"],
            "expiry_date": expiry.isoformat().split("T")[0], "storage_zone": ship["storage_zone"],
            "created_at": now.isoformat(),
        })
    await _insert_or_replace(conn, "inventory_lots", lot_rows)

    # --- Compliance incidents ---
    now_day = now.strftime("%Y%m%d")
    SEEDS = [
        ("INC-101", "Temperature excursion during transit - SHP-1008", "temperature_excursion", "critical", "open", "FAC-001", "SHP-1008", "SHP-1008", 6, True, -2, True),
        ("INC-102", "Temperature excursion during transit - SHP-1012", "temperature_excursion", "high", "investigating", "FAC-002", "SHP-1012", "SHP-1012", 3, False, 1, True),
        ("INC-103", "Temperature excursion during transit - SHP-1015", "temperature_excursion", "high", "open", "FAC-003", "SHP-1015", "SHP-1015", 2, False, 4, False),
        ("INC-104", "Temperature excursion during transit - SHP-1019", "temperature_excursion", "medium", "investigating", "FAC-004", "SHP-1019", "SHP-1019", 5, False, 12, False),
        ("INC-105", "Temperature excursion during transit - SHP-1023", "temperature_excursion", "medium", "resolved", "FAC-001", "SHP-1023", "SHP-1023", 8, False, 26, False),
        ("INC-106", "Labeling error on collection kit", "labeling_error", "low", "resolved", "FAC-002", None, None, 4, False, 31, False),
        ("INC-107", "Documentation gap - missing COA", "documentation_gap", "medium", "open", "FAC-001", None, None, 2, False, 7, False),
        ("INC-108", "Documentation gap - incomplete custody log", "documentation_gap", "low", "resolved", "FAC-003", None, None, 3, False, 22, False),
        ("INC-109", "Quality deviation in viability test batch", "quality_deviation", "high", "investigating", "FAC-002", None, None, 1, True, 9, True),
        ("INC-110", "Quality deviation - media shipment damage", "quality_deviation", "medium", "closed", "FAC-004", None, None, 6, False, 41, False),
        ("INC-111", "Chain of custody break on LN2 dewar", "chain_of_custody_break", "high", "open", "FAC-003", None, None, 0, True, 2, True),
        ("INC-112", "Storage violation - door left ajar", "storage_violation", "medium", "closed", "FAC-001", None, None, 5, False, 55, False),
        ("INC-113", "Storage violation - sensor drift", "storage_violation", "low", "resolved", "FAC-004", None, None, 3, False, 18, False),
        ("INC-114", "Potential contamination in processing lab", "contamination_suspected", "high", "investigating", "FAC-002", None, None, 2, True, 5, True),
        ("INC-115", "Equipment malfunction - thawing bath", "equipment_malfunction", "medium", "resolved", "FAC-001", None, None, 7, False, 29, False),
        ("INC-116", "Shipping delay - ambient excursion risk", "quality_deviation", "low", "closed", "FAC-002", None, None, 9, False, 60, False),
    ]
    incident_rows = []
    for seq, (inc_id, title, dev_type, severity, status, fac_id, ship_id, ship_no, days, regulatory, created_days_ago, critical) in enumerate(SEEDS):
        created = now - timedelta(days=created_days_ago)
        resolved = None
        if status in ("resolved", "closed"):
            resolved = created + timedelta(days=max(0, days))
        if status == "closed":
            resolved = created + timedelta(days=days * 2)
        due = created + timedelta(days=14) if status in ("open", "investigating") else None
        temperature_data = None
        if dev_type == "temperature_excursion":
            temperature_data = {
                "minTemp": round((_REGIME_RANGES["refrigerated_2_8"][0] - 3), 1),
                "maxTemp": round((_REGIME_RANGES["refrigerated_2_8"][1] + rng.uniform(3, 8)), 1),
                "durationMinutes": rng.randint(60, 420),
                "excursionCount": rng.randint(1, 9),
            }
        incident = {
            "id": inc_id, "incidentNumber": inc_id, "title": title,
            "description": f"{title}. Recorded during routine tracking on shipment {ship_no or 'N/A'}.",
            "deviationType": dev_type, "severity": severity, "status": status,
            "facilityId": fac_id, "facilityName": facility_names[fac_id],
            "shipmentId": ship_id, "shipmentNumber": ship_no,
            "supplierId": "SUP-001" if ship_no else None, "supplierName": "World Courier" if ship_no else None,
            "lotId": None, "lotNumber": None, "productName": "Cord Blood Collection Kit",
            "temperatureRegime": "refrigerated_2_8" if dev_type == "temperature_excursion" else None,
            "detectedDate": created.isoformat(), "detectedBy": "AI Scanner" if critical else "QA Analyst",
            "reportedDate": created.isoformat(), "reportedBy": "AI Scanner" if critical else "QA Analyst",
            "assignedTo": rng.choice(["Dr. Rivera", "TL-0412", "QA-Ops", None, None, None]),
            "investigationNotes": "", "rootCause": rng.choice([None, None, "Courier deviation", "Sensor mis-calibration"]),
            "correctiveAction": (rng.choice(["Re-training conducted", "Probe recalibrated", "Process step added"]) if status in ("resolved", "closed") else None),
            "preventiveAction": (rng.choice(["Added spot-check cadence", "Alarm threshold tightened"]) if status in ("resolved", "closed") else None),
            "closureNotes": (rng.choice(["Closed after CAPA review", "Verified with re-test"]) if status in ("resolved", "closed") else None),
            "resolvedDate": resolved.isoformat() if resolved else None,
            "regulatoryNotifiable": regulatory,
            "regulatoryBody": None, "reportedToRegulatory": False, "impactAssessment": "",
            "temperatureData": temperature_data,
            "dueDate": due.isoformat() if due else None,
            "createdAt": created.isoformat(), "updatedAt": now.isoformat(),
        }
        incident_rows.append({
            "id": inc_id, "data": json.dumps(incident),
            "entity_type": None, "entity_id": None, "status": status,
            "severity": severity, "deviation_type": dev_type, "created_at": created.isoformat(),
        })
    await _insert_or_replace(conn, "compliance_incidents", incident_rows)
    print(f"Seeded cold-chain demo data ({len(fac_rows)} facilities, {len(shipments)} shipments, {len(incident_rows)} incidents)")


async def _seed_core_enterprise(conn, rng, now, base) -> None:
    """Seed the core CBU relational dataset (identity/custody chain)."""
    # --- Storage tanks ---
    tank_rows = []
    for i, tid in enumerate(_TANK_IDS):
        cap = rng.choice([240, 360, 480, 576])
        cur = rng.randint(max(0, cap - 120), max(cap - 20, 0))
        tank_rows.append((
            _id("TNK"), tid, rng.choice(_FACILITIES), "vapor_phase_ln2", cap, cur,
            round(rng.uniform(-197.0, -190.0), 2), round(rng.uniform(58.0, 92.0), 1),
            rng.choice(["active", "active", "active", "maintenance"]),
            _iso(base + timedelta(days=rng.randint(-200, -40))),
            _iso(now + timedelta(days=rng.randint(30, 300))),
            1, json.dumps({"temp_max": -170, "ln2_min_pct": 20}),
            "{}", _now_iso(), _now_iso(),
        ))
    await conn.executemany(
        "INSERT OR IGNORE INTO storage_tanks (id, tank_id, facility, tank_type, capacity_units, "
        "current_units, temperature_c, ln2_level_pct, status, last_inspection_at, "
        "next_inspection_at, monitoring_enabled, alarm_thresholds, metadata, created_at, updated_at) "
        "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        tank_rows,
    )
    tank_id = {row[1]: row[0] for row in tank_rows}

    # --- Tank temperature logs (last 30d, hourly-ish, some excursions) ---
    log_rows = []
    for tid, tid_uuid in list(tank_id.items()):
        base_temp = -196.0 + rng.uniform(-1.0, 2.0)
        for hour in range(30 * 24):
            if rng.random() > 0.25:
                continue
            t = base_temp + rng.gauss(0, 0.6)
            alert = t > -170 or rng.random() < 0.01
            log_rows.append((
                _id("TLG"), tid_uuid,
                _iso(now - timedelta(hours=30 * 24 - hour)),
                round(t, 2), round(rng.uniform(58.0, 92.0), 1),
                f"SENS-{tid[-3:]}", 1 if alert else 0,
                "temp_high" if t > -170 else ("ln2_low" if rng.random() < 0.5 else "sensor_fault"),
                _now_iso(),
            ))
    if log_rows:
        await conn.executemany(
            "INSERT OR IGNORE INTO tank_temperature_logs (id, tank_id, recorded_at, temperature_c, "
            "ln2_level_pct, sensor_id, alert_triggered, alert_type, created_at) "
            "VALUES (?,?,?,?,?,?,?,?,?)",
            log_rows,
        )

    n_total = 180
    seq_cbu = 0
    seq_kit = 0
    seq_txp = 0
    units = []
    transplants = []
    fam_rows = []
    enr_rows = []
    kit_rows = []
    unit_rows = []
    txp_rows = []
    per_facility = {fac: _TANK_IDS[i::len(_FACILITIES)] for i, fac in enumerate(_FACILITIES)}

    for idx in range(n_total):
        year = 2024 + (idx % 2)
        seq_cbu += 1
        unit_no = _unit_no(year, seq_cbu)
        kit_no = _kit_no(year, seq_cbu)
        enroll_no = _enroll_no(year, seq_cbu)

        last = rng.choice(_LAST_NAMES)
        first = rng.choice(_FIRST_NAMES)
        family_id = _id("FAM")
        enroll_id = _id("ENR")
        kit_id = _id("KIT")
        unit_id = _id("CBU")

        # Family
        fam_rows.append((
            family_id, f"CRM-{seq_cbu:05d}", first, last,
            f"{first.lower()}.{last.lower()}@example.com", f"+1-{rng.randint(200,999)}-{rng.randint(100,999)}-{rng.randint(1000,9999)}",
            json.dumps({"city": rng.choice(["Mumbai", "Delhi", "Bangalore", "Hyderabad", "Chennai"]), "zip": str(rng.randint(10000, 99999))}),
            _iso(base + timedelta(days=rng.randint(0, 7000))).split("T")[0], "{}",
            _now_iso(), _now_iso(), _now_iso(), "synced",
        ))

        # Enrollment
        plan_type = rng.choice(_PLAN_TYPES)
        storage_plan = rng.choice(_STORAGE_PLANS)
        total_amt = rng.choice([1200, 1800, 2400, 2995, 4000])
        paid = rng.choice([0, int(total_amt * 0.25), int(total_amt * 0.5), total_amt])
        enroll_status = rng.choice(["active", "active", "active", "active", "pending", "on_hold", "cancelled"])
        enr_rows.append((
            enroll_id, enroll_no, family_id, plan_type,
            rng.choice(_METHODS), storage_plan, enroll_status,
            _iso(base + timedelta(days=rng.randint(10, 340))),
            rng.choice(["full", "6_month", "12_month"]),
            total_amt, paid,
            (_iso(now + timedelta(days=rng.randint(10, 180)))).split("T")[0],
            f"HSP-{rng.randint(10,99)}", f"SR-{rng.randint(100,999)}",
            rng.choice(["", "", "FRIEND10", "DISC20", "SIBLING"]),
            "{}", "{}", _now_iso(), _now_iso(), _now_iso(), "synced",
        ))

        # Collection kit
        kit_status = rng.choices(_KIT_STATES, weights=[5, 5, 25, 10, 10, 15, 25, 5], k=1)[0]
        collected_at = None
        if kit_status in ("collected", "in_transit", "received_at_lab", "processing", "completed"):
            collected_at = _iso(base + timedelta(days=rng.randint(5, 360)))
        kit_rows.append((
            kit_id, kit_no, enroll_id, f"BC-{seq_cbu:08d}", f"QR-{seq_cbu:08d}",
            rng.choice(["CPD", "CPDA-1", "Heparin"]), rng.randint(2, 4),
            _iso(base + timedelta(days=rng.randint(1, 30))),
            _iso(base + timedelta(days=rng.randint(3, 40))),
            _iso(base + timedelta(days=rng.randint(5, 60))) if kit_status != "kit_shipped" else None,
            collected_at,
            rng.choice(_COLLECTORS), "RN, BLS", rng.choice(_HOSPITALS),
            json.dumps({"city": rng.choice(["Mumbai", "Delhi", "Bangalore", "Chennai"])}),
            rng.choice(["FedEx", "DHL", "BlueDart"]), f"TRK-{rng.randint(100000, 999999)}",
            json.dumps([]), kit_status, "" if kit_status != "rejected" else "insufficient_volume",
            "{}", _now_iso(), _now_iso(),
        ))

        # Cord blood unit (only for kits that were collected)
        unit_state = rng.choices(_UNIT_STATES, weights=[78, 5, 4, 3, 10], k=1)[0]
        if kit_status in ("completed", "processing") and unit_state != "discarded":
            pre_tnc = rng.randint(70, 160) * 1000
            recovery = rng.uniform(78.0, 94.0)
            viability = rng.uniform(88.0, 99.5)
            tankid = rng.choice(per_facility[rng.choice(_FACILITIES)])
            vol = rng.uniform(18.0, 60.0)
            abo = rng.choice(_ABO)
            unit_cols = [
                "id", "unit_number", "enrollment_id", "collection_kit_id", "collect_accession", "collected_at",
                "collection_volume_ml", "collection_weight_g", "maternal_blood_collected", "delayed_clamping",
                "delayed_clamping_duration_min", "processing_method", "processing_started_at",
                "processing_completed_at", "processed_by", "equipment_used", "processing_technician_id",
                "pre_process_tnc", "post_process_tnc", "tnc_recovery_pct", "pre_process_cd34", "post_process_cd34",
                "cd34_recovery_pct", "viability_pct", "volume_ml", "rbc_depletion_pct", "plasma_depletion_pct",
                "storage_bag_type", "storage_bag_barcode", "storage_location", "cryopreserved_at", "storage_status",
                "storage_tank_id", "storage_temperature_c", "hla_typing", "abo_rh", "infectious_disease_results",
                "sterility_result", "cfu_result", "fact_compliant", "aabb_compliant", "fda_licensed", "cgmp_compliant",
                "transplant_count", "last_transplant_at", "public_bank_access", "public_bank_listed_at", "nmdp_id",
                "notes", "metadata", "created_at", "updated_at",
            ]
            unit_vals = [
                unit_id, unit_no, enroll_id, kit_id, f"CA-{seq_cbu:08d}",
                collected_at, round(rng.uniform(45.0, 150.0), 2), round(rng.uniform(50.0, 170.0), 2),
                rng.randint(0, 1), rng.randint(0, 1), rng.randint(30, 120),
                rng.choice(_METHODS),
                _iso(base + timedelta(days=rng.randint(30, 330))),
                _iso(base + timedelta(days=rng.randint(31, 340))),
                rng.choice(["Dr. H. Wang", "TL-0412", "Dr. R. Shah"]),
                rng.choice(["Sepax II", "AutoXpress AXP", "Hemafuse"]),
                rng.choice(_PROCESSING_TECHS),
                pre_tnc, int(pre_tnc * recovery / 100), round(recovery, 2),
                int(pre_tnc * 0.01), int(pre_tnc * 0.01 * recovery / 100 * 1.05), round(rng.uniform(0.10, 0.30), 2),
                round(viability, 2), round(vol, 2),
                round(rng.uniform(80.0, 98.0), 2), round(rng.uniform(60.0, 96.0), 2),
                rng.choice(["five_chamber", "single_chamber"]), f"BAG-{seq_cbu:06d}",
                json.dumps({"tank": tankid, "rack": f"R-{rng.randint(1,12)}", "pos": f"P-{rng.randint(1,20)}", "level": rng.choice(["vapor", "liquid"])}),
                _iso(base + timedelta(days=rng.randint(32, 345))), unit_state,
                tankid, -196.0, _hla_tag(), abo,
                json.dumps({"hiv": "negative", "hbsag": "negative", "hcv": "negative", "htlv": "negative", "syphilis": "negative", "cmv": rng.choice(["negative", "negative", "positive"])}),
                rng.choice(["passed", "passed", "passed", "pending"]), rng.randint(8, 200),
                1, 1, 1, 1, 0, None,
                rng.randint(0, 1), _iso(base + timedelta(days=rng.randint(40, 355))) if rng.random() > 0.5 else None,
                f"NMDP-{rng.randint(1000, 9999)}" if rng.random() > 0.5 else None,
                "", "{}", _now_iso(), _now_iso(),
            ]
            unit_rows.append(unit_vals)

            # occasional transplant for released units (broaden supply: ~35%
            # of completed units become clinical-release candidates)
            txp_pool = (unit_state == "cryopreserved" and rng.random() < 0.30) or unit_state in ("released_for_transplant", "shipped")
            if txp_pool:
                tc_id = _id("TXP")
                seq_txp += 1
                txp_no = _txp_no(2025, seq_txp)
                transplanted = _iso(base + timedelta(days=rng.randint(60, 350)))
                txp_cols = [
                    "id", "transplant_number", "cord_blood_unit_id", "enrollment_id", "patient_id",
                    "transplant_center", "transplant_center_id", "physician_name", "diagnosis", "indication",
                    "requested_at", "matched_at", "hla_match_score", "hla_match_details", "shipped_at",
                    "shipping_courier", "shipping_tracking", "shipping_temperature_log", "delivered_at",
                    "thawed_at", "infused_at", "infused_volume_ml", "infused_tnc", "infused_cd34",
                    "post_thaw_viability_pct", "post_thaw_cfu", "engraftment_at", "engraftment_type", "status",
                    "outcome_notes", "follow_up_schedule", "metadata", "created_at", "updated_at",
                ]
                txp_vals = [
                    tc_id, txp_no, unit_id, enroll_id, f"PT-{rng.randint(100000,999999)}",
                    rng.choice(["City of Hope", "Mayo Clinic", "Johns Hopkins", "MD Anderson", "Stanford"]),
                    f"TX-{rng.randint(10,99)}", rng.choice(["Dr. Dana Cole", "Dr. Sanjay Gupta", "Dr. Emily Ross"]),
                    rng.choice(["ALL", "AML", "Sickle Cell", "Thalassemia", "Lymphoma", "Neuroblastoma"]),
                    "malignant" if rng.random() > 0.4 else "non-malignant",
                    _iso(base + timedelta(days=rng.randint(50, 300))),
                    _iso(base + timedelta(days=rng.randint(60, 320))),
                    round(rng.uniform(0.7, 0.97), 2), "{}",
                    _iso(base + timedelta(days=rng.randint(65, 330))),
                    rng.choice(["FedEx", "World Courier"]), f"TRK-TX-{rng.randint(100000,999999)}", "[]",
                    _iso(base + timedelta(days=rng.randint(68, 334))),
                    _iso(base + timedelta(days=rng.randint(70, 336))),
                    _iso(base + timedelta(days=rng.randint(72, 338))),
                    round(rng.uniform(40.0, 55.0), 2), int(pre_tnc * 0.7), int(pre_tnc * 0.01 * 0.7),
                    round(rng.uniform(80.0, 97.0), 2), rng.randint(6, 30),
                    _iso(base + timedelta(days=rng.randint(85, 365))) if rng.random() > 0.3 else None,
                    rng.choice(["neutrophil", "platelet", "full"]) if rng.random() > 0.3 else None,
                    rng.choice(["infused", "engrafted", "failed", "shipped"]),
                    rng.choice(["", "Uncomplicated engraftment", "Delayed engraftment - resolved"]),
                    "{}", "{}", _now_iso(), _now_iso(),
                ]
                txp_rows.append(txp_vals)

    # Flush accumulated rows with batched (fast) executemany.
    if fam_rows:
        await conn.executemany(
            "INSERT OR IGNORE INTO families (id, crm_id, first_name, last_name, email, phone, "
            "address, date_of_birth, medical_history, created_at, updated_at, synced_at, sync_status) "
            "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
            fam_rows,
        )
    if enr_rows:
        await conn.executemany(
            "INSERT OR IGNORE INTO enrollments (id, enrollment_number, family_id, plan_type, "
            "processing_method, storage_plan, status, contract_signed_at, payment_plan, "
            "total_amount, amount_paid, expected_due_date, hospital_id, sales_rep_id, referral_code, "
            "special_programs, metadata, created_at, updated_at, synced_at, sync_status) "
            "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            enr_rows,
        )
    if kit_rows:
        await conn.executemany(
            "INSERT OR IGNORE INTO collection_kits (id, kit_number, enrollment_id, barcode, qr_code, "
            "anticoagulant, gel_pack_count, shipped_at, delivered_at, received_at_hospital, collected_at, "
            "collector_name, collector_credentials, hospital_name, hospital_address, delivery_courier, "
            "tracking_number, temperature_log, status, rejection_reason, metadata, created_at, updated_at) "
            "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            kit_rows,
        )
    if unit_rows:
        await conn.executemany(
            "INSERT OR IGNORE INTO cord_blood_units ("
            + ",".join(unit_cols) + ") VALUES ("
            + ",".join("?" for _ in unit_cols) + ")",
            unit_rows,
        )
    if txp_rows:
        await conn.executemany(
            "INSERT OR IGNORE INTO transplant_records ("
            + ",".join(txp_cols) + ") VALUES ("
            + ",".join("?" for _ in txp_cols) + ")",
            txp_rows,
        )


async def seed_enterprise(pool) -> int:
    """Seed the relational cord-blood model. Returns number of CBUs seeded (0 if already present)."""
    async with pool.acquire() as conn:
        existing = await conn.fetchval("SELECT count(*) FROM cord_blood_units") or 0
        rng = random.Random(42)
        now = datetime.now()
        base = now - timedelta(days=365)

        if not existing:
            await _seed_core_enterprise(conn, rng, now, base)
        await _seed_operational_tables(conn, rng, now)
        await _seed_cold_chain(conn, rng, now)
        return 0


async def seed_enterprise_idempotent(pool) -> int:
    return await seed_enterprise(pool)