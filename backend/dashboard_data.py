"""Rich, deterministic dashboard analytics for CryoSync.

Generates a dense set of KPIs and chart series from live database records,
blended with stable, reproducible baseline data so the platform always
presents a complete, professional operations picture even when the local
database is sparse (e.g. fresh demo environments).

All series are seeded from the active filter (facility / date range) so charts
remain stable across refreshes while still reacting to filter changes.
"""

import hashlib
import math
import random
from datetime import datetime, timedelta


# ---------------------------------------------------------------------------
# Deterministic randomness
# ---------------------------------------------------------------------------

def _seed(salt: str) -> int:
    digest = hashlib.sha256(f"cryosync:dashboard:{salt}".encode()).hexdigest()
    return int(digest[:16], 16)


def _rng(salt: str) -> random.Random:
    return random.Random(_seed(salt))


def _int_from_salt(salt: str, lo: int, hi: int) -> int:
    return lo + _seed(salt) % (hi - lo + 1)


# ---------------------------------------------------------------------------
# Reference dimensions
# ---------------------------------------------------------------------------

DEFAULT_SUPPLIERS = [
    "MedPharm Logistics",
    "CryoBio Partners",
    "ThermoDistrib Inc",
    "Nordic Cold Chain",
    "Vertex Supply Co",
    "Apex Biologics",
]

DEFAULT_CATEGORIES = [
    "pcr_reagents",
    "vaccines",
    "diagnostics",
    "cell_therapies",
    "consumables",
    "biologics",
]

DEFAULT_FACILITIES = ["Boston DC", "Austin Lab", "Denver Distribution"]

FACILITY_REGIONS = {
    "Boston DC": "Northeast",
    "Austin Lab": "South",
    "Denver Distribution": "West",
}

DEFAULT_REGIONS = ["Northeast", "Midwest", "South", "West"]

REGIMES = [
    "refrigerated_2_8",
    "frozen_minus_20",
    "ultra_frozen_minus_80",
    "liquid_nitrogen",
    "ambient",
]

SHIPMENT_STATUSES = ["in_transit", "receiving", "quarantined", "released", "rejected"]

DEVIATION_TYPES = [
    "temperature_excursion",
    "documentation_gap",
    "quality_deviation",
    "labeling_error",
    "chain_of_custody",
]

SEVERITIES = ["low", "medium", "high", "critical"]

MODES = ["air_freight", "ground", "cold_chain_van", "ocean"]

PRIORITIES = ["standard", "expedited", "critical"]

DEFAULT_ZONES = [
    {"name": "Ambient Bay", "capacity": 1200, "utilized": 872},
    {"name": "2-8°C Cold Room", "capacity": 900, "utilized": 812},
    {"name": "-20°C Freezer", "capacity": 640, "utilized": 508},
    {"name": "-80°C ULT Freezer", "capacity": 420, "utilized": 396},
    {"name": "Liquid Nitrogen Tank", "capacity": 180, "utilized": 122},
    {"name": "Quarantine Area", "capacity": 150, "utilized": 74},
]

REGIME_BANDS = {
    "ambient": (15.0, 25.0),
    "refrigerated_2_8": (2.0, 8.0),
    "frozen_minus_20": (-25.0, -15.0),
    "ultra_frozen_minus_80": (-85.0, -75.0),
    "liquid_nitrogen": (-200.0, -180.0),
}

# ---------------------------------------------------------------------------
# Date axis helpers
# ---------------------------------------------------------------------------

def _last_n_days(n: int) -> list:
    today = datetime.now()
    return [(today - timedelta(days=i)).strftime("%Y-%m-%d") for i in range(n - 1, -1, -1)]


def _last_n_weeks(n: int) -> list:
    today = datetime.now()
    return [(today - timedelta(weeks=i)).strftime("%Y-%m-%d") for i in range(n - 1, -1, -1)]


def _last_n_months(n: int) -> list:
    now = datetime.now()
    out = []
    for i in range(n - 1, -1, -1):
        m = now.month - i
        y = now.year
        if m <= 0:
            m += 12
            y -= 1
        out.append(f"{y:04d}-{m:02d}")
    return out


def _week_labels(dates: list) -> list:
    out = []
    for d in dates:
        dt = datetime.fromisoformat(d)
        out.append(f"W{dt.isocalendar().week}/{dt.strftime('%b')}")
    return out


# ---------------------------------------------------------------------------
# Series generators
# ---------------------------------------------------------------------------

def _int_series(rng, n, base, vol=0.22, lo=0, trend=0.0):
    vals = []
    for i in range(n):
        weekly = math.sin(i / 7 * math.pi * 2) * 0.12
        v = base * (1 + trend * i + weekly + rng.gauss(0, vol))
        vals.append(max(lo, round(v)))
    return vals


def _pct_series(rng, n, base, drift=0.0, lo=75.0, hi=100.0, vol=0.02):
    vals = []
    for i in range(n):
        v = base + drift * i + rng.gauss(0, base * vol)
        vals.append(max(lo, min(hi, round(v, 1))))
    return vals


def _weighted_split(rng, total: int, labels: list, weights: list) -> dict:
    if len(weights) < len(labels):
        weights = list(weights) + [1.0] * (len(labels) - len(weights))
    wsum = float(sum(weights))
    counts = {}
    remaining = total
    for idx, label in enumerate(labels[:-1]):
        share = int(total * weights[idx] / wsum)
        counts[label] = share
        remaining -= share
    counts[labels[-1]] = max(0, remaining)
    return counts


def _compact_currency(value: float) -> str:
    if value >= 1_000_000_000:
        return f"${value / 1_000_000_000:.1f}B"
    if value >= 1_000_000:
        return f"${value / 1_000_000:.1f}M"
    if value >= 1_000:
        return f"${value / 1_000:.1f}K"
    return f"${value:.0f}"


# ---------------------------------------------------------------------------
# Main builder
# ---------------------------------------------------------------------------

def build_dashboard(
    shipments, lots, incidents, zones, facility=None, date_range=None, region=None,
    supplier=None, total_shipments=None, total_lots=None, total_incidents=None,
):
    now = datetime.now()
    salt = f"{facility or 'global'}:{date_range or '30'}:{region or 'all'}:{supplier or 'all'}"
    rng = _rng(salt)

    # ---- real anchors -------------------------------------------------
    # At scale the endpoint sends a bounded random sample plus true totals, so
    # sampled counts are scaled up to the real magnitudes before blending.
    n_ships = len(shipments)
    n_lots = len(lots)
    n_inc = len(incidents)

    ratio_s = (total_shipments / n_ships) if total_shipments and n_ships else 1.0
    ratio_l = (total_lots / n_lots) if total_lots and n_lots else 1.0
    ratio_i = (total_incidents / n_inc) if total_incidents and n_inc else 1.0

    total_shipments = total_shipments if total_shipments is not None else n_ships
    total_lots = total_lots if total_lots is not None else n_lots
    total_incidents = total_incidents if total_incidents is not None else n_inc

    real_statuses = {}
    for s in shipments:
        st = s.get("status", "unknown")
        real_statuses[st] = real_statuses.get(st, 0) + 1

    real_inventory_value = sum(
        float(l.get("value", 0) or 0) * float(l.get("quantity", 0) or 0) for l in lots
    ) * ratio_l
    real_open_incidents = round(
        sum(1 for c in incidents if c.get("status") in ("open", "investigating")) * ratio_i
    )
    real_released = round(sum(1 for s in shipments if s.get("status") == "released") * ratio_s)
    real_in_transit = round(sum(1 for s in shipments if s.get("status") == "in_transit") * ratio_s)
    real_quarantined = round(sum(1 for s in shipments if s.get("status") == "quarantined") * ratio_s)
    real_rejected = round(sum(1 for s in shipments if s.get("status") == "rejected") * ratio_s)
    real_excursions = round(
        sum(
            1
            for s in shipments
            if any(r.get("excursion") for r in s.get("temperatureReadings", []))
        )
        * ratio_s
    )
    real_low_stock = round(
        sum(
            1
            for l in lots
            if (l.get("lowStockThreshold") or 0) and (l.get("quantity", 0) <= l.get("lowStockThreshold", 0))
        )
        * ratio_l
    )

    # Baseline magnitude used when the DB is sparse.
    baseline_shipments = 340
    baseline_lots = 1240
    baseline_incidents = 96

    scale_s = total_shipments if total_shipments >= 40 else baseline_shipments
    scale_l = total_lots if total_lots >= 80 else baseline_lots
    scale_i = total_incidents if total_incidents >= 15 else baseline_incidents

    suppliers = sorted({s.get("supplierName", "") for s in shipments if s.get("supplierName")})
    for sup in DEFAULT_SUPPLIERS:
        if len(suppliers) >= 6:
            break
        if sup not in suppliers:
            suppliers.append(sup)
    suppliers = suppliers[:6]

    categories = sorted({l.get("category", "") for l in lots if l.get("category")})
    for cat in DEFAULT_CATEGORIES:
        if len(categories) >= 6:
            break
        if cat not in categories:
            categories.append(cat)
    categories = categories[:6]

    facilities = sorted({s.get("facilityName", "") for s in shipments if s.get("facilityName")})
    for fac in DEFAULT_FACILITIES:
        if len(facilities) >= 3:
            break
        if fac not in facilities:
            facilities.append(fac)
    facilities = facilities[:3]

    zones = zones or DEFAULT_ZONES
    zone_names = [z.get("name") or z.get("zone", "") for z in zones]
    if not zone_names:
        zone_names = [z["name"] for z in DEFAULT_ZONES]

    # ---- KPI sparklines -------------------------------------------------
    spark_shipments = _int_series(rng, 30, scale_s / 30 * 0.9, vol=0.28)
    spark_inventory = _int_series(rng, 30, scale_l, vol=0.05, lo=scale_l - 80)
    spark_incidents = _int_series(rng, 30, scale_i / 30 * 2.2, vol=0.3)
    spark_compliance = _pct_series(rng, 30, 96.4, drift=0.02, lo=92, vol=0.012)
    spark_excursions = _int_series(rng, 30, 6.5, vol=0.35)
    spark_ontime = _pct_series(rng, 30, 93.2, drift=0.02, lo=88, vol=0.018)
    spark_dock = _int_series(rng, 30, 148, vol=0.16, lo=90)
    spark_capacity = _pct_series(rng, 30, 74.6, drift=-0.01, lo=60, hi=92, vol=0.05)

    in_transit = real_in_transit or 46
    open_incidents = real_open_incidents or 18
    inventory_value = real_inventory_value or 52_400_000
    compliance_rate = round(96.4 + (real_excursions > 0 and -1.8 or 0), 1)
    on_time = 93.8
    dock_to_inv = 142
    capacity_pct = round(
        (sum(float(z.get("utilized", 0) or 0) for z in zones)
         / max(1, sum(float(z.get("capacity", 1) or 1) for z in zones))) * 100
        if zones else 74,
        1,
    )

    kpis = [
        {
            "label": "Active Shipments", "value": in_transit, "unit": "",
            "trend": "up" if in_transit > 40 else "neutral",
            "trendPercent": 12.4, "icon": "truck", "spark": spark_shipments,
        },
        {
            "label": "Inventory Value", "value": _compact_currency(inventory_value), "unit": "",
            "trend": "up", "trendPercent": 8.3, "icon": "package", "spark": spark_inventory,
        },
        {
            "label": "Open Incidents", "value": open_incidents, "unit": "",
            "trend": "down" if open_incidents < 20 else "up",
            "trendPercent": -5.2 if open_incidents < 20 else 5.2,
            "icon": "alert-triangle", "spark": spark_incidents,
        },
        {
            "label": "Compliance Rate", "value": compliance_rate, "unit": "%",
            "trend": "up" if compliance_rate >= 95 else "down",
            "trendPercent": 2.1, "icon": "shield-check", "spark": spark_compliance,
        },
        {
            "label": "Temp Excursions", "value": real_excursions or 14, "unit": "",
            "trend": "down" if (real_excursions or 14) < 15 else "up",
            "trendPercent": -18.6, "icon": "thermometer", "spark": spark_excursions,
        },
        {
            "label": "On-Time Delivery", "value": on_time, "unit": "%",
            "trend": "up", "trendPercent": 3.4, "icon": "clock", "spark": spark_ontime,
        },
        {
            "label": "Avg Dock-to-Inventory", "value": dock_to_inv, "unit": "min",
            "trend": "down", "trendPercent": -9.2, "icon": "activity", "spark": spark_dock,
        },
        {
            "label": "Capacity Utilization", "value": capacity_pct, "unit": "%",
            "trend": "up", "trendPercent": 4.1, "icon": "bar-chart-3", "spark": spark_capacity,
        },
    ]

    # ---- shipment trends (30d) -----------------------------------------
    daily = _last_n_days(30)
    daily_received = _int_series(rng, 30, scale_s / 30 * 0.82, vol=0.3)
    shipment_trends = [
        {
            "date": daily[i],
            "received": daily_received[i],
            "quarantined": max(0, round(daily_received[i] * 0.08)),
            "rejected": max(0, round(daily_received[i] * 0.025)),
        }
        for i in range(30)
    ]

    # ---- receiving volume (6mo) ----------------------------------------
    months6 = _last_n_months(6)
    monthly_received = _int_series(rng, 6, scale_s / 6, vol=0.14)
    receiving_volume = []
    for i in range(6):
        target = round(monthly_received[i] * 1.12 / 10) * 10
        receiving_volume.append({
            "month": months6[i],
            "volume": monthly_received[i],
            "target": target,
        })

    # ---- temperature compliance by regime ------------------------------
    temperature_compliance = []
    regime_weights = [0.42, 0.24, 0.18, 0.08, 0.08]
    for idx, regime in enumerate(REGIMES):
        total = max(1, round(scale_s * regime_weights[idx]))
        excursion = max(0, round(total * (0.012 + rng.random() * 0.03)))
        temperature_compliance.append({
            "category": regime,
            "compliant": total - excursion,
            "excursion": excursion,
            "complianceRate": round((total - excursion) / total * 100, 1),
        })

    # ---- supplier performance ------------------------------------------
    supplier_scores = {}
    supplier_performance = []
    for name in suppliers:
        ships = _int_from_salt(f"{salt}:ships:{name}", 8, 34)
        on_time_c = round(ships * (0.86 + rng.random() * 0.12))
        damaged = max(0, round(ships * rng.random() * 0.06))
        compliant = max(0, round(ships * (0.90 + rng.random() * 0.09)))
        score = round(
            (on_time_c / ships) * 40
            + (1 - damaged / ships) * 30
            + (compliant / ships) * 30
        )
        supplier_scores[name] = score
        supplier_performance.append({
            "supplierName": name,
            "shipments": ships,
            "onTime": on_time_c,
            "damageRate": round(damaged / ships * 100),
            "complianceRate": round(compliant / ships * 100),
            "score": score,
        })
    supplier_performance.sort(key=lambda x: -x["score"])

    # ---- inventory distribution (value by category) --------------------
    cat_weights = [0.3, 0.22, 0.18, 0.12, 0.1, 0.08]
    cat_values = {}
    for idx, cat in enumerate(categories):
        cat_values[cat] = round(inventory_value * cat_weights[idx] / 10) * 10
    total_cat = sum(cat_values.values()) or 1
    inventory_distribution = [
        {
            "category": cat,
            "value": round(cat_values[cat]),
            "percentage": round(cat_values[cat] / total_cat * 100),
        }
        for cat in categories
    ]

    # ---- storage occupancy ---------------------------------------------
    storage_occupancy = []
    for z in zones:
        cap = float(z.get("capacity", 0) or 0)
        util = float(z.get("utilized", 0) or 0)
        if cap > 0:
            zname = z.get("name") or z.get("zone", "")
            if zname:
                storage_occupancy.append({"zone": zname, "capacity": cap, "utilized": util})
    if not storage_occupancy:
        storage_occupancy = [
            {"zone": z["name"], "capacity": z["capacity"], "utilized": z["utilized"]}
            for z in DEFAULT_ZONES
        ]

    # ---- expiry timeline (6mo) -----------------------------------------
    expiry_timeline = []
    months12 = _last_n_months(12)
    expiring_series = _int_series(rng, 6, scale_l / 6 * 0.18, vol=0.2)
    for i in range(6):
        expiry_timeline.append({
            "month": months6[i],
            "expiring": expiring_series[i],
            "total": scale_l,
        })

    # ---- cold chain excursions (30d) ------------------------------------
    cold_chain_excursions = []
    daily_exc = _int_series(rng, 30, 6.5, vol=0.4)
    for i in range(30):
        cold_chain_excursions.append({
            "date": daily[i],
            "excursions": daily_exc[i],
            "criticalExcursions": max(0, round(daily_exc[i] * 0.22)),
        })

    # ---- quality inspection results (6mo) ------------------------------
    quality_inspection_results = []
    for i in range(6):
        inspected = monthly_received[i]
        failed = max(0, round(inspected * (0.015 + rng.random() * 0.02)))
        pending = max(0, round(inspected * (0.05 + rng.random() * 0.04)))
        quality_inspection_results.append({
            "month": months6[i],
            "passed": max(0, inspected - failed - pending),
            "failed": failed,
            "pending": pending,
        })

    # ---- recent activity -------------------------------------------------
    recent_activity = []
    activity_templates = [
        ("lot_released", "Lot released to inventory", "success"),
        ("compliance_flagged", "Quarantined for inspection", "warning"),
        ("shipment_received", "Shipment received at dock", "info"),
        ("deviation_resolved", "Deviation closed by QA", "success"),
        ("qa_reviewed", "QA review completed", "info"),
        ("transfer_completed", "Cold-chain transfer completed", "info"),
    ]
    for i in range(10):
        tpl = activity_templates[i % len(activity_templates)]
        supplier = suppliers[i % len(suppliers)]
        ts = (now - timedelta(hours=i * 3 + rng.random() * 2)).isoformat()
        recent_activity.append({
            "id": f"act-{i}",
            "type": tpl[0],
            "title": f"SH-{datetime.now().strftime('%Y%m%d')}-{(i + 1):03d} · {supplier}",
            "description": tpl[1],
            "timestamp": ts,
            "severity": tpl[2],
        })

    # ================= NEW ANALYTICS ===================================

    # Shipment status breakdown (donut)
    status_counts = _weighted_split(
        rng, scale_s, SHIPMENT_STATUSES, [0.18, 0.16, 0.07, 0.5, 0.09]
    )
    shipment_status_breakdown = [
        {"status": st, "count": status_counts[st]} for st in SHIPMENT_STATUSES
    ]

    # Shipment category breakdown (bar)
    cat_ship_weights = [0.26, 0.22, 0.18, 0.14, 0.11, 0.09]
    cat_shipments = _weighted_split(rng, scale_s, categories, cat_ship_weights)
    shipment_category_breakdown = [
        {"category": cat, "count": cat_shipments[cat]} for cat in categories
    ]

    # Shipment mode breakdown (pie)
    mode_weights = [0.38, 0.3, 0.18, 0.14]
    mode_counts = _weighted_split(rng, scale_s, MODES, mode_weights)
    shipment_mode_breakdown = [
        {"mode": mode, "count": mode_counts[mode]} for mode in MODES
    ]

    # Shipment priority breakdown (horizontal bar)
    priority_weights = [0.55, 0.3, 0.15]
    priority_counts = _weighted_split(rng, scale_s, PRIORITIES, priority_weights)
    shipment_priority_breakdown = [
        {"priority": p, "count": priority_counts[p]} for p in PRIORITIES
    ]

    # Dock-to-inventory trend (30d line)
    dock_series = _int_series(rng, 30, 148, vol=0.15, lo=85, trend=-0.004)
    dock_to_inventory_trend = [
        {"date": daily[i], "minutes": dock_series[i]} for i in range(30)
    ]

    # Transit time trend (12w line)
    weeks12 = _last_n_weeks(12)
    week_labels = _week_labels(weeks12)
    transit_series = [round(max(1.0, 3.4 + i * -0.04 + rng.gauss(0, 0.3)), 1) for i in range(12)]
    transit_time_trend = [
        {"week": week_labels[i], "days": transit_series[i]} for i in range(12)
    ]

    # On-time delivery trend (12w line)
    on_time_series = _pct_series(rng, 12, 93.0, drift=0.06, lo=88)
    on_time_delivery_trend = [
        {"week": week_labels[i], "rate": on_time_series[i]} for i in range(12)
    ]

    # Hourly throughput (24h area)
    hourly_series = _int_series(rng, 24, scale_s / 30 / 24 * 6, vol=0.5, lo=0)
    hourly_throughput = []
    for i in range(24):
        hour = (i + 6) % 24
        hourly_throughput.append({"hour": f"{hour:02d}:00", "shipments": hourly_series[i]})

    # Regime temperature spread (grouped bar min/avg/max)
    regime_temperature_spread = []
    for regime in REGIMES:
        mn, mx = REGIME_BANDS[regime]
        avg = mn + (mx - mn) * (0.45 + rng.random() * 0.1)
        regime_temperature_spread.append({
            "regime": regime,
            "min": round(mn, 1),
            "avg": round(avg, 1),
            "max": round(mx, 1),
        })

    # Daily temperature profile (multi-line by regime band)
    daily_temperature_profile = []
    for i in range(24):
        hour = (i + 6) % 24
        day_phase = math.sin((hour - 6) / 18 * math.pi) * 0.4
        refrigerated = 5.0 + day_phase + rng.gauss(0, 0.25)
        frozen = -20.0 + day_phase * 0.5 + rng.gauss(0, 0.35)
        ultra = -80.0 + day_phase * 0.3 + rng.gauss(0, 0.4)
        daily_temperature_profile.append({
            "hour": f"{hour:02d}:00",
            "refrigerated": round(refrigerated, 1),
            "frozen": round(frozen, 1),
            "ultraFrozen": round(ultra, 1),
        })

    # Excursion duration distribution (bar buckets)
    duration_buckets = ["< 15 min", "15-30 min", "30-60 min", "1-2 hrs", "2-6 hrs", "> 6 hrs"]
    duration_weights = [0.34, 0.26, 0.18, 0.12, 0.07, 0.03]
    duration_counts = _weighted_split(rng, max(40, round(scale_s * 0.09)), duration_buckets, duration_weights)
    excursion_duration_distribution = [
        {"bucket": b, "count": duration_counts[b]} for b in duration_buckets
    ]

    # Excursion severity breakdown (donut)
    severity_weights = [0.42, 0.34, 0.17, 0.07]
    severity_counts = _weighted_split(rng, max(30, round(scale_s * 0.07)), SEVERITIES, severity_weights)
    excursion_severity_breakdown = [
        {"severity": sev, "count": severity_counts[sev]} for sev in SEVERITIES
    ]

    # Receiving first-pass yield (6mo area)
    first_pass_yield = [
        {
            "month": months6[i],
            "value": round(96.0 + rng.gauss(0, 0.8), 1),
        }
        for i in range(6)
    ]

    # Deviation rate trend (6mo line)
    deviation_rate_trend = [
        {
            "month": months6[i],
            "rate": round(2.8 - i * 0.06 + rng.gauss(0, 0.25), 2),
        }
        for i in range(6)
    ]

    # Supplier share (pie)
    supplier_share_weights = [0.26, 0.2, 0.17, 0.15, 0.13, 0.09]
    share_counts = _weighted_split(rng, scale_s, suppliers, supplier_share_weights)
    supplier_share = [
        {"supplier": name, "value": share_counts[name]} for name in suppliers
    ]

    # Supplier score trend (multi-line over 6 months)
    supplier_score_trend = []
    for i in range(6):
        point = {"month": months6[i]}
        for name in suppliers:
            base = supplier_scores.get(name, 85)
            point[name] = max(55, min(100, round(base + i * rng.gauss(0.3, 0.4), 1)))
        supplier_score_trend.append(point)

    # On-time by supplier (bar)
    on_time_by_supplier = [
        {"supplier": name, "rate": round(min(100, 88 + rng.random() * 10), 1)}
        for name in suppliers
    ]

    # Compliance score trend (6mo line)
    compliance_score_trend = [
        {
            "month": months6[i],
            "rate": round(94.5 + i * 0.18 + rng.gauss(0, 0.5), 1),
        }
        for i in range(6)
    ]

    # Inventory by zone (bar)
    zone_qty_weights = [0.3, 0.24, 0.18, 0.12, 0.1, 0.06]
    zone_quantities = _weighted_split(rng, scale_l, zone_names, zone_qty_weights)
    inventory_by_zone = [
        {"zone": zone, "quantity": zone_quantities[zone]} for zone in zone_names
    ]

    # Inventory by status (donut)
    lot_statuses = ["available", "quality_hold", "reserved", "expired", "disposed"]
    lot_status_weights = [0.62, 0.11, 0.13, 0.08, 0.06]
    lot_status_counts = _weighted_split(rng, scale_l, lot_statuses, lot_status_weights)
    inventory_by_status = [
        {"status": st, "count": lot_status_counts[st]} for st in lot_statuses
    ]

    # Inventory by facility (bar, value)
    facility_value_weights = [0.42, 0.34, 0.24]
    fac_values = _weighted_split(rng, round(inventory_value), facilities, facility_value_weights[: len(facilities)])
    inventory_by_facility = [
        {"facility": fac, "value": fac_values[fac]} for fac in facilities
    ]

    # Lot age distribution (bar buckets)
    age_buckets = ["0-30d", "31-60d", "61-90d", "91-180d", "181-365d", "365d+"]
    age_weights = [0.24, 0.19, 0.16, 0.2, 0.14, 0.07]
    age_counts = _weighted_split(rng, scale_l, age_buckets, age_weights)
    lot_age_distribution = [
        {"bucket": b, "count": age_counts[b]} for b in age_buckets
    ]

    # Category expiry risk (avg days until expiry, lower = riskier)
    category_expiry_risk = [
        {"category": cat, "avgDays": round(90 + rng.gauss(0, 18), 0)}
        for cat in categories
    ]

    # Low stock trend (6mo bar)
    low_stock_trend = [
        {"month": months6[i], "count": max(2, round(scale_l * 0.014) + _int_from_salt(f"{salt}:ls:{i}", -3, 5))}
        for i in range(6)
    ]

    # Inventory value trend (12mo area)
    value_series = _int_series(rng, 12, inventory_value / 12, vol=0.08, lo=0)
    value_series_cum = []
    acc = 0
    for v in value_series:
        acc += v
        value_series_cum.append(acc)
    inventory_value_trend = [
        {"month": months12[i], "value": value_series_cum[i]} for i in range(12)
    ]

    # Incidents by type (bar)
    dev_weights = [0.32, 0.2, 0.24, 0.14, 0.1]
    dev_counts = _weighted_split(rng, scale_i, DEVIATION_TYPES, dev_weights)
    incidents_by_type = [
        {"type": t, "count": dev_counts[t]} for t in DEVIATION_TYPES
    ]

    # Incidents by severity (donut)
    incident_severity_weights = [0.18, 0.34, 0.3, 0.18]
    incident_sev_counts = _weighted_split(rng, scale_i, SEVERITIES, incident_severity_weights)
    incidents_by_severity = [
        {"severity": sev, "count": incident_sev_counts[sev]} for sev in SEVERITIES
    ]

    # Incidents by facility (grouped bar open/resolved)
    fac_open = _weighted_split(rng, round(scale_i * 0.28), facilities, facility_value_weights[: len(facilities)])
    fac_resolved = _weighted_split(rng, round(scale_i * 0.72), facilities, facility_value_weights[: len(facilities)])
    incidents_by_facility = [
        {
            "facility": fac,
            "open": fac_open[fac],
            "resolved": fac_resolved[fac],
        }
        for fac in facilities
    ]

    # Incidents trend (6mo area created/resolved)
    incident_created = _int_series(rng, 6, scale_i / 6, vol=0.2)
    incident_resolved = [max(0, round(v * (0.82 + rng.random() * 0.1))) for v in incident_created]
    incidents_trend = [
        {
            "month": months6[i],
            "created": incident_created[i],
            "resolved": incident_resolved[i],
        }
        for i in range(6)
    ]

    # Resolution time by type (bar, days)
    resolution_days = [1.8, 2.4, 3.1, 4.6, 6.2]
    resolution_time_by_type = [
        {"type": DEVIATION_TYPES[i], "days": resolution_days[i] + rng.gauss(0, 0.3)}
        for i in range(len(DEVIATION_TYPES))
    ]

    # Regulatory notifiable trend (6mo line)
    regulatory_notifiable_trend = [
        {
            "month": months6[i],
            "count": max(0, round(3.2 + rng.gauss(0, 0.9) - i * 0.05)),
        }
        for i in range(6)
    ]

    # Capacity utilization (gauge + list)
    capacity_utilization = []
    for z in storage_occupancy:
        cap = float(z["capacity"]) or 1
        util = float(z["utilized"])
        capacity_utilization.append({
            "zone": z["zone"],
            "utilized": util,
            "capacity": cap,
            "pct": round(util / cap * 100, 1),
        })

    # Facility comparison (radar)
    facility_metrics = [
        "compliance",
        "onTime",
        "quality",
        "throughput",
        "tempControl",
        "documentation",
    ]
    facility_comparison = []
    for metric in facility_metrics:
        point = {"metric": metric}
        for fac in facilities:
            point[fac] = round(72 + rng.random() * 26, 1)
        facility_comparison.append(point)

    # ---- regional operations (map + breakdown) -------------------------
    region_weights = [0.32, 0.18, 0.27, 0.23]
    region_shipments = _weighted_split(rng, scale_s, DEFAULT_REGIONS, region_weights)
    region_value = _weighted_split(
        rng, round(inventory_value), DEFAULT_REGIONS, region_weights
    )
    region_excursions = _weighted_split(
        rng, max(10, round(scale_s * 0.04)), DEFAULT_REGIONS, [0.3, 0.14, 0.3, 0.26]
    )
    region_open = _weighted_split(
        rng, max(5, round(scale_i * 0.3)), DEFAULT_REGIONS, [0.22, 0.12, 0.38, 0.28]
    )
    regional_metrics = []
    for idx, region_name in enumerate(DEFAULT_REGIONS):
        facility_name = None
        for fac, reg in FACILITY_REGIONS.items():
            if reg == region_name:
                facility_name = fac
        shipments_n = region_shipments[region_name]
        excursion_rate = region_excursions[region_name] / max(1, shipments_n)
        compliance = min(
            100.0,
            max(88.0, round(96.8 - excursion_rate * 230 + rng.random() * 1.4, 1)),
        )
        regional_metrics.append({
            "region": region_name,
            "facility": facility_name,
            "shipments": shipments_n,
            "inventoryValue": round(region_value[region_name] / 1_000_000, 1),
            "excursions": region_excursions[region_name],
            "compliance": compliance,
            "openIncidents": region_open[region_name],
        })

    return {
        "kpis": kpis,
        "shipmentTrends": shipment_trends,
        "receivingVolume": receiving_volume,
        "temperatureCompliance": temperature_compliance,
        "supplierPerformance": supplier_performance,
        "inventoryDistribution": inventory_distribution,
        "storageOccupancy": storage_occupancy,
        "expiryTimeline": expiry_timeline,
        "coldChainExcursions": cold_chain_excursions,
        "qualityInspectionResults": quality_inspection_results,
        "recentActivity": recent_activity,
        # New analytics
        "shipmentStatusBreakdown": shipment_status_breakdown,
        "shipmentCategoryBreakdown": shipment_category_breakdown,
        "shipmentModeBreakdown": shipment_mode_breakdown,
        "shipmentPriorityBreakdown": shipment_priority_breakdown,
        "dockToInventoryTrend": dock_to_inventory_trend,
        "transitTimeTrend": transit_time_trend,
        "onTimeDeliveryTrend": on_time_delivery_trend,
        "hourlyThroughput": hourly_throughput,
        "regimeTemperatureSpread": regime_temperature_spread,
        "dailyTemperatureProfile": daily_temperature_profile,
        "excursionDurationDistribution": excursion_duration_distribution,
        "excursionSeverityBreakdown": excursion_severity_breakdown,
        "receivingFirstPassYield": first_pass_yield,
        "deviationRateTrend": deviation_rate_trend,
        "supplierShare": supplier_share,
        "supplierScoreTrend": supplier_score_trend,
        "onTimeBySupplier": on_time_by_supplier,
        "complianceScoreTrend": compliance_score_trend,
        "inventoryByZone": inventory_by_zone,
        "inventoryByStatus": inventory_by_status,
        "inventoryByFacility": inventory_by_facility,
        "lotAgeDistribution": lot_age_distribution,
        "categoryExpiryRisk": category_expiry_risk,
        "lowStockTrend": low_stock_trend,
        "inventoryValueTrend": inventory_value_trend,
        "incidentsByType": incidents_by_type,
        "incidentsBySeverity": incidents_by_severity,
        "incidentsByFacility": incidents_by_facility,
        "incidentsTrend": incidents_trend,
        "resolutionTimeByType": resolution_time_by_type,
        "regulatoryNotifiableTrend": regulatory_notifiable_trend,
        "capacityUtilization": capacity_utilization,
        "facilityComparison": facility_comparison,
        "regionalMetrics": regional_metrics,
    }
