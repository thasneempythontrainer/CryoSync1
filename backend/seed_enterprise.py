"""Enterprise seed for the cord-blood-bank relational model.

Populates families, enrollments, collection_kits, cord_blood_units,
storage_tanks, tank_temperature_logs and transplant_records so the CBU
lifecycle is a real, interconnected dataset (and so uploaded lab reports can
be matched to real cord blood units). Also seeds the operational tables that
back the Payments, Referrals, Franchisees and Content pages.

Idempotent: the core CBU dataset is seeded only when cord_blood_units is empty;
the newer operational tables use INSERT OR REPLACE so they stay populated on
every boot.
"""

import json
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
        return 0


async def seed_enterprise_idempotent(pool) -> int:
    return await seed_enterprise(pool)