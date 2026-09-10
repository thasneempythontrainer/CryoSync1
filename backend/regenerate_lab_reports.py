"""Regenerate bronze.lab_test_reports linked to the real seeded CBUs.

The previous lab reports came from template CSVs whose unit references were
placeholders (CBU-UUID-*, CBU-2025-*) that never matched real units. This script
replaces them with realistic batteries attached to the real cord_blood_units,
so gold.unit_summary / v_unit_inventory can answer per-unit lab questions.
Values are derived from each unit's real metrics (TNC, viability, volume, ABO/Rh).
"""
import os, asyncio, math, uuid, datetime
os.environ.setdefault("CRYOSYNC_DB_BACKEND", "databricks")
os.environ.setdefault("CRYOSYNC_DB_CATALOG", "cryosync_catalog")
os.environ.setdefault("CRYOSYNC_DB_SCHEMA", "bronze")
import database as db

CAT = "cryosync_catalog"
BRONZE = f"{CAT}.bronze.lab_test_reports"

REVIEWERS = ["Dr. Smith", "Dr. Jones", "Dr. Chen", "Dr. Patel", "Dr. Wilson", "Dr. Brown", "Dr. Martinez"]
TECHS = ["Tech A", "Tech B", "Tech C", "Tech D", "Tech E", "Tech F", "Tech G", "Tech H"]


def _iso(dt):
    return dt.isoformat()


def _round(x, n=1):
    return round(x, n)


def battery(u):
    """Build a realistic battery of lab_test_reports for one CBU."""
    unit = u["unit_number"]
    uid = u["id"]
    abo_rh = u["abo_rh"] or "O+"
    vol = u["collection_volume_ml"] or 80.0
    pre = int(u["pre_process_tnc"] or 100000)
    post = int(u["post_process_tnc"] or 85000)
    viab = float(u["viability_pct"] or 95.0)
    base = datetime.datetime(2026, 8, 10)
    rows = []

    # deterministic pseudo-random jitter keyed off the unit number
    seed = sum(ord(c) for c in unit)
    def jit(mag, salt=0):
        return (seed + salt) % (mag * 10 + 1) / 10.0 - mag / 2.0

    def add(seq, ttype, tname, method, instrument, value, unit_v, rlow, rhigh, rtext,
            d_offset, tech_off, status="completed", sample="SAMPLE-000"):
        pid = f"REP-{unit}-{seq:03d}"
        performed = base + datetime.timedelta(hours=d_offset, minutes=(seed % 7) * 9)
        reviewed = performed + datetime.timedelta(hours=3)
        reviewer = REVIEWERS[(seed + seq) % len(REVIEWERS)]
        def _s(v):
            return v if isinstance(v, str) else ("%.14g" % v if isinstance(v, float) else str(v))
        rows.append({
            "id": f"{uuid.uuid4().hex}",
            "report_id": pid,
            "unit_number": unit,
            "cord_blood_unit_id": uid,
            "sample_reference": sample,
            "test_type": ttype,
            "test_name": tname,
            "test_method": method,
            "instrument": instrument,
            "performed_at": _iso(performed),
            "performed_by": TECHS[(seed + seq) % len(TECHS)],
            "result_value": _s(value),
            "result_unit": unit_v,
            "result_text": rtext,
            "reference_low": _s(rlow),
            "reference_high": _s(rhigh),
            "reference_text": f"{rlow}-{rhigh} {unit_v}" if rlow and rhigh else rtext,
            "status": status,
            "reviewed_by": reviewer if status == "completed" else None,
            "reviewed_at": _iso(reviewed) if status == "completed" else None,
            "review_notes": None,
            "batch_id": f"BATCH-{base.strftime('%Y%m')}",
            "source_filename": "regenerated_cell_production.py",
            "source_row": seq,
            "details": None,
        })

    s = 0
    # ---- Pre-processing routine (day 0-1) ----
    add(s:=s+1, "CBC", "Total Nucleated Cell Count (TNCC)", "Flow Cytometry", "Sysmex XN-9000",
        _round(pre/1e8,1), "×10⁸", 7.0, 15.0, "Within normal limits", 8, 1)
    add(s:=s+1, "CBC", "CD34+ Cell Count", "Flow Cytometry", "Sysmex XN-9000",
        _round(pre/1e8*0.03,2), "×10⁶", 0.5, 5.0, "Within normal limits", 8, 2)
    add(s:=s+1, "CBC", "Viable CD34+ Cell Count (7-AAD)", "Flow Cytometry", "BD FACSCanto",
        _round(pre/1e8*0.03*0.9,2), "×10⁶", 0.4, 4.5, "Within normal limits", 8, 3)
    add(s:=s+1, "CBC", "CD34+ Viability (%)", "Flow Cytometry", "BD FACSCanto",
        _round(min(99.9, viab + jit(2,1)),1), "%", 80, 100, "Within normal limits", 8, 4)
    add(s:=s+1, "CBC", "TNC Viability (CD45+ 7-AAD-)", "Flow Cytometry", "BD FACSCanto",
        _round(min(99.9, viab + jit(2,2)),1), "%", 90, 100, "Within normal limits", 8, 5)
    add(s:=s+1, "CBC", "Nucleated RBC (nRBC) Count", "Flow Cytometry", "Sysmex XN-9000",
        str(90 - (seed % 40)), "/µL", 0, 100, "<100 /µL", 8, 6)
    add(s:=s+1, "CBC", "CBC with Differential - Neutrophils", "Flow Cytometry", "Sysmex XN-9000",
        str(38 + seed % 12), "%", 40, 70, "Within normal limits", 8, 7)
    add(s:=s+1, "CBC", "CBC with Differential - Lymphocytes", "Flow Cytometry", "Sysmex XN-9000",
        str(35 + seed % 12), "%", 20, 50, "Within normal limits", 8, 8)
    add(s:=s+1, "CBC", "CBC with Differential - Monocytes", "Flow Cytometry", "Sysmex XN-9000",
        str(5 + seed % 6), "%", 2, 10, "Within normal limits", 8, 9)
    add(s:=s+1, "Blood Group", "ABO Typing", "Tube Method", "Manual",
        abo_rh.split("+")[0].split("-")[0], "", "", "", abo_rh, 9, 11)
    add(s:=s+1, "Blood Group", "Rh Typing", "Tube Method", "Manual",
        "Positive" if "+" in abo_rh else "Negative", "", "", "", abo_rh, 9, 12)
    add(s:=s+1, "Hemoglobin", "Hemoglobinopathy Screen", "HPLC", "Bio-Rad Variant",
        "Normal (HbA only)", "", "", "", "Normal", 10, 13)

    # Infectious disease / maternal panel (day 0)
    id_panel = [
        ("HIV-1/2 Ab/Ag", "Negative", "Non-reactive"),
        ("HBV (HBsAg)", "Negative", "Non-reactive"),
        ("HCV Ab", "Negative", "Non-reactive"),
        ("Syphilis (TPA)", "Negative", "Non-reactive"),
        ("CMV IgG/IgM", "IgG Positive / IgM Negative", "Non-reactive (IgM)"),
        ("HTLV-I/II", "Negative", "Non-reactive"),
    ]
    for tname, val, txt in id_panel:
        add(s:=s+1, "Maternal ID", tname, "Immunoassay", "Architect", val, "", "", "", txt, 7, 14)

    # Sterility (bacterial + fungal)
    add(s:=s+1, "Microbiology", "Bacterial Sterility Culture", "BacT/ALERT 3D", "BioMérieux",
        "Negative", "", "", "", "Negative", 38, 15)
    add(s:=s+1, "Microbiology", "Fungal Sterility Culture", "Sabouraud Dextrose Agar", "Incubator",
        "Negative", "", "", "", "Negative", 72, 16)

    # ---- Post-processing QC (day 1) ----
    pvol = _round(vol * 0.26, 1)
    ptnc = _round(post/1e8, 1)
    add(s:=s+1, "Processing QC", "TNC Recovery", "Calculated", "Manual",
        _round(post/ max(pre,1)*100, 1), "%", 70, 100, ">70 %", 30, 17)
    add(s:=s+1, "Processing QC", "CD34+ Recovery", "Calculated", "Manual",
        _round(min(99.9, post/pre*100*0.9), 1), "%", 70, 100, ">70 %", 30, 18)
    add(s:=s+1, "Processing QC", "RBC Depletion", "Flow Cytometry", "Sysmex XN-9000",
        _round(95 + (seed % 50)/10, 1), "%", 95, 100, ">95 %", 30, 19)
    add(s:=s+1, "Processing QC", "Plasma Depletion", "Flow Cytometry", "Sysmex XN-9000",
        _round(95 + (seed % 45)/10, 1), "%", 95, 100, ">95 %", 30, 20)
    add(s:=s+1, "Processing QC", "Processing Volume", "Manual Measurement", "Manual",
        pvol, "mL", 18, 25, "18-25 mL", 30, 21)
    add(s:=s+1, "CBC", "TNCC - Post", "Flow Cytometry", "Sysmex XN-9000",
        ptnc, "×10⁸", 5.0, 15.0, ">5.0 ×10⁸", 30, 22)
    add(s:=s+1, "CBC", "Viable CD34+ - Post", "Flow Cytometry", "BD FACSCanto",
        _round(ptnc*0.03*0.9,2), "×10⁶", 0.3, 5.0, ">0.3 ×10⁶", 30, 23)
    add(s:=s+1, "Potency", "CFU Assay (CFU-GM)", "Methylcellulose", "Manual",
        str(30 + seed % 30), "colonies/10⁵", 20, 200, "20-200 colonies/10⁵", 40, 24)
    add(s:=s+1, "Microbiology", "Bacterial Sterility - Post", "BacT/ALERT 3D", "BioMérieux",
        "Negative", "", "", "", "Negative", 38, 25)

    # ---- HLA typing / release-grade (for units that are cryopreserved/released) ----
    release_states = {"cryopreserved", "released_for_transplant", "shipped"}
    if u["storage_status"] in release_states:
        hla = [
            ("HLA-A", "A*02:01/A*24:02"), ("HLA-B", "B*07:02/B*44:02"),
            ("HLA-C", "C*07:02/C*05:01"), ("HLA-DRB1", "DRB1*01:01/DRB1*15:01"),
        ]
        for tname, val in hla:
            add(s:=s+1, "HLA", f"{tname} Typing", "PCR-SSP", "Luminex", val, "", "", "", val, 34, 26)
        add(s:=s+1, "Microbiology", "Endotoxin (LAL)", "Kinetic Chromogenic", "Lonza PyroGene",
            _round(0.05 + (seed % 8)/100, 2), "EU/mL", 0, 0.5, "<0.5 EU/mL", 36, 27)
        # mark some as under_review for realism
        if seed % 7 == 0:
            rows[-1]["status"] = "under_review"
            rows[-1]["reviewed_by"] = None
            rows[-1]["reviewed_at"] = None

    return rows


BATCH = 100


def chunked(items, size):
    for i in range(0, len(items), size):
        yield items[i:i + size]


async def main():
    conn = await db.get_connection()

    units = await conn.fetch(
        "SELECT id, unit_number, abo_rh, collection_volume_ml, pre_process_tnc, "
        "post_process_tnc, viability_pct, storage_status "
        f"FROM {CAT}.bronze.cord_blood_units")

    # Build the full regenerated dataset in memory.
    all_rows = []
    for u in units:
        all_rows.extend(battery(u))
    print(f"generated {len(all_rows)} lab reports for {len(units)} units")

    cols = list(all_rows[0].keys())
    col_list = ", ".join(f"`{c}`" for c in cols)

    # wipe old placeholder reports
    await conn.execute(f"DELETE FROM {BRONZE}")
    print("deleted stale lab reports")

    inserted = 0
    for batch in chunked(all_rows, BATCH):
        value_tuples = []
        fmt = "(" + ", ".join(["?"] * len(cols)) + ")"
        for r in batch:
            value_tuples.append(fmt)
        sql = f"INSERT INTO {BRONZE} ({col_list}) VALUES " + ", ".join(value_tuples)
        flat = [r[c] for r in batch for c in cols]
        await conn.execute(sql, *flat)
        inserted += len(batch)
        print(f"  inserted {inserted}/{len(all_rows)}")

    print(f"done: {inserted} lab reports across {len(units)} units")
    await db.close_pool()


if __name__ == "__main__":
    asyncio.run(main())
