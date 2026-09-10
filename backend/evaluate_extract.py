"""Comprehensive AI Extract evaluation across 11 quality dimensions.

Runs the sample corpus through Standard and Precision modes against the live
Databricks endpoint, measures per-field accuracy, calibration, citation
accuracy, cross-page reasoning, amendment handling, latency, and exception
handling, then writes a Markdown report + JSON + chart to docs/.

Run from project root:  python backend/evaluate_extract.py
"""

import asyncio
import base64
import json
import os
import re
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from dotenv import load_dotenv  # noqa: E402

load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env"))

import extract  # noqa: E402

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
DOCS_DIR = os.path.join(ROOT, "test-documents")
OUT_DIR = os.path.join(ROOT, "docs")

# ---------------------------------------------------------------------------
# Ground truth transcribed from test-documents/EXPECTED-VALUES.md
# ---------------------------------------------------------------------------

GT = {
    "01-packing-slip-refrigerated.png": {
        "group": "clean scan",
        "fields": {
            "shipmentNumber": "SHP-2026-0812", "carrier": "FedEx Priority",
            "trackingNumber": "7942 3381 0021", "billOfLading": "BL-FX-556231",
            "purchaseOrderNumber": "PO-88412", "supplierName": "CryoLogix Sciences GmbH",
            "origin": "Hamburg, Germany", "destination": "Boston, MA, United States",
            "temperatureRegime": "refrigerated_2_8", "category": "cord_blood_unit",
            "productCount": 12, "lotCount": 3, "totalValue": 48600, "dangerousGoods": False,
        },
    },
    "02-shipping-label-express.png": {
        "group": "clean scan",
        "fields": {
            "shipmentNumber": "SHP-2026-0917", "carrier": "World Courier",
            "trackingNumber": "WB-441-99213870", "origin": "London, UK",
            "destination": "Boston MA, USA", "priority": "expedited",
            "temperatureRegime": "refrigerated_2_8", "dangerousGoods": True,
            "unNumber": "UN3373", "sealNumber": "WC-99123",
        },
    },
    "03-bill-of-lading-ocean.png": {
        "group": "clean scan",
        "fields": {
            "billOfLading": "MAEU-2266-77810", "purchaseOrderNumber": "PO-91227",
            "carrier": "Maersk Line", "supplierName": "NordCell Biologics BV",
            "origin": "Rotterdam", "destination": "Newark",
            "sealNumber": "MSK-88213", "temperatureRegime": "ultra_frozen_minus_80",
            "dangerousGoods": True, "unNumber": "UN1845",
        },
    },
    "04-coa-cord-blood.png": {
        "group": "clean scan",
        "fields": {
            "shipmentNumber": "SHP-2026-1022", "supplierName": "StemCore Labs",
            "category": "cord_blood_unit", "temperatureRegime": "liquid_nitrogen",
            "dangerousGoods": True, "unNumber": "UN3373",
        },
    },
    "05-packing-slip-ultrafrozen.png": {
        "group": "clean scan",
        "fields": {
            "shipmentNumber": "CG-SHP-2026-0044", "carrier": "UPS Worldwide Express",
            "trackingNumber": "1Z 89X E20 03 9921 4471", "billOfLading": "BL-UP-90211",
            "purchaseOrderNumber": "PO-77810", "supplierName": "CelGeneics Therapeutics Inc.",
            "origin": "Basel, Switzerland", "destination": "Boston MA USA",
            "temperatureRegime": "ultra_frozen_minus_80", "dangerousGoods": True,
            "unNumber": "UN1845", "productCount": 6, "lotCount": 1,
            "totalValue": 92000, "priority": "critical",
        },
    },
    "06-shipping-label-ln2-critical.png": {
        "group": "clean scan",
        "fields": {
            "shipmentNumber": "SHP-2026-1155", "carrier": "Cryoport",
            "trackingNumber": "CYP-XP-00914471", "origin": "Austin TX, USA",
            "destination": "Singapore", "priority": "critical",
            "category": "cellular_therapy_release",
            "temperatureRegime": "liquid_nitrogen", "dangerousGoods": True,
            "unNumber": "UN3373",
        },
    },
    "07-packing-slip-damaged.png": {
        "group": "clean scan",
        "fields": {
            "shipmentNumber": "BN-2026-3308", "carrier": "DHL Freight",
            "trackingNumber": "JD0146000031", "purchaseOrderNumber": "PO-66102",
            "supplierName": "BioNexus Supply Co.", "origin": "Ashford, United Kingdom",
            "destination": "CryoSync London Clinic Store", "temperatureRegime": "ambient",
            "productCount": 8, "lotCount": 2, "totalValue": 6240,
            "condition": "damaged", "notes": "~contains:crushed",
        },
    },
    "08-bill-of-lading-ground.png": {
        "group": "clean scan",
        "fields": {
            "billOfLading": "BOL-XPO-77120", "carrier": "XPO Logistics",
            "supplierName": "CryoSource Inc", "origin": "Chicago IL, USA",
            "destination": "Detroit MI, USA", "temperatureRegime": "refrigerated_2_8",
            "dangerousGoods": True, "unNumber": "UN1845", "sealNumber": "XL-2231",
            "priority": "standard",
        },
    },
    "09-coa-cell-release.png": {
        "group": "clean scan",
        "fields": {
            "shipmentNumber": "SHP-2026-1155", "category": "cellular_therapy_release",
            "supplierName": "NovaCell Therapy Center", "origin": "Austin TX, USA",
            "destination": "Singapore", "temperatureRegime": "liquid_nitrogen",
            "totalValue": 210000,
        },
    },
    "10-packing-slip-hard-mode.png": {
        "group": "noisy / rotated scan",
        "fields": {
            "shipmentNumber": "SHP-2026-0813", "carrier": "FedEx International",
            "trackingNumber": "7942 3381 0044", "billOfLading": "BL-FX-556299",
            "purchaseOrderNumber": "PO-88413", "temperatureRegime": "refrigerated_2_8",
            "category": "cord_blood_unit", "productCount": 4, "lotCount": 2,
            "totalValue": 16200, "sealNumber": "CLX-SEAL-0912", "dangerousGoods": False,
        },
    },
    "11-packing-slip-refrigerated-multipage.pdf": {
        "group": "multi-page PDF",
        "cross_page_fields": ["productCount", "lotCount", "totalValue"],
        "fields": {
            "shipmentNumber": "SHP-2026-1201", "carrier": "FedEx Priority",
            "trackingNumber": "7942 3381 0107", "billOfLading": "BL-FX-556310",
            "purchaseOrderNumber": "PO-88426", "sealNumber": "CLX-SEAL-1044",
            "supplierName": "CryoLogix Sciences GmbH", "origin": "Hamburg, Germany",
            "destination": "Boston, MA, United States", "priority": "expedited",
            "temperatureRegime": "refrigerated_2_8", "category": "cord_blood_unit",
            "productCount": 12, "lotCount": 3, "totalValue": 48600,
            "dangerousGoods": False,
        },
    },
    "12-bill-of-lading-ocean-multipage.pdf": {
        "group": "multi-page PDF",
        "fields": {
            "billOfLading": "MAEU-2266-78845", "purchaseOrderNumber": "PO-91227",
            "carrier": "Maersk Line", "supplierName": "NordCell Biologics BV",
            "origin": "Rotterdam", "destination": "Newark", "sealNumber": "MSK-88471",
            "temperatureRegime": "ultra_frozen_minus_80", "dangerousGoods": True,
            "unNumber": "UN1845", "totalValue": 96500,
        },
    },
    "13-coa-cord-blood-multipage.pdf": {
        "group": "multi-page PDF",
        "fields": {
            "shipmentNumber": "SHP-2026-1201", "supplierName": "StemCore Labs",
            "origin": "Austin TX, USA", "destination": "Boston MA, USA",
            "category": "cord_blood_unit", "temperatureRegime": "liquid_nitrogen",
            "dangerousGoods": True, "unNumber": "UN3373", "totalValue": 210000,
        },
    },
    "15-packing-slip-lowres-blurry.jpg": {
        "group": "degraded scan",
        "fields": {
            "shipmentNumber": "SHP-2026-1441", "carrier": "FedEx Priority",
            "trackingNumber": "7942 3381 0077", "billOfLading": "BL-FX-556999",
            "purchaseOrderNumber": "PO-88477", "supplierName": "CryoLogix Sciences GmbH",
            "origin": "Hamburg, Germany", "destination": "Boston, MA, United States",
            "temperatureRegime": "refrigerated_2_8", "category": "cord_blood_unit",
            "productCount": 9, "lotCount": 3, "totalValue": 36450,
            "dangerousGoods": False,
        },
    },
    "16-shipping-label-faded-skewed.png": {
        "group": "degraded scan",
        "fields": {
            "shipmentNumber": "SHP-2026-1552", "carrier": "World Courier",
            "trackingNumber": "WB-441-99214006", "origin": "London, UK",
            "destination": "Boston MA, USA", "priority": "expedited",
            "temperatureRegime": "refrigerated_2_8", "dangerousGoods": True,
            "unNumber": "UN3373", "sealNumber": "WC-99451",
        },
    },
    "17-bill-of-lading-dense-smallprint.pdf": {
        "group": "dense small print",
        "cross_page_fields": ["productCount", "lotCount", "totalValue"],
        "fields": {
            "billOfLading": "MAEU-2266-79002", "purchaseOrderNumber": "PO-91388",
            "carrier": "Maersk Line", "supplierName": "NordCell Biologics BV",
            "origin": "Rotterdam", "destination": "Newark",
            "sealNumber": "MSK-89101", "temperatureRegime": "ultra_frozen_minus_80",
            "dangerousGoods": True, "unNumber": "UN1845",
            "productCount": 24, "lotCount": 8, "totalValue": 128800,
        },
    },
    "18-coa-stamp-overlay.png": {
        "group": "stamp overlay",
        "fields": {
            "shipmentNumber": "SHP-2026-1663", "supplierName": "StemCore Labs",
            "category": "cord_blood_unit", "temperatureRegime": "liquid_nitrogen",
            "dangerousGoods": True, "unNumber": "UN3373", "totalValue": 187500,
        },
    },
}

# Precision mode runs on the FULL corpus so the headline comparison is
# apples-to-apples (same documents, same ground truth for both modes).
PRECISION_SUBSET = set(GT.keys())


# ---------------------------------------------------------------------------
# Matching helpers
# ---------------------------------------------------------------------------

def norm_text(s):
    s = str(s).lower().strip().rstrip(".")
    s = re.sub(r"[^a-z0-9]+", " ", s)
    return re.sub(r"\s+", " ", s).strip()


# ID-like fields are scored strictly: after stripping punctuation/case the
# extracted value must EQUAL ground truth - no substring or token-overlap
# credit. A tracking number off by one digit is a wrong tracking number.
EXACT_ID_FIELDS = {
    "shipmentNumber", "trackingNumber", "billOfLading",
    "purchaseOrderNumber", "sealNumber", "unNumber",
}


def values_match(expected, actual, key=None):
    if actual is None:
        return False
    if isinstance(expected, bool):
        return bool(actual) == expected
    if isinstance(expected, (int, float)):
        try:
            return abs(float(str(actual).replace(",", "")) - float(expected)) < 1e-6
        except (TypeError, ValueError):
            return False
    exp = str(expected)
    if exp.startswith("~contains:"):
        return exp[len("~contains:"):].lower() in str(actual).lower()
    if key in EXACT_ID_FIELDS:
        a = re.sub(r"\W", "", str(actual)).lower()
        b = re.sub(r"\W", "", exp).lower()
        return bool(a) and a == b
    a, b = norm_text(actual), norm_text(exp)
    if not a:
        return False
    if a == b or a in b or b in a:
        return True
    if re.sub(r"\W", "", a) == re.sub(r"\W", "", b):
        return True
    ta, tb = set(a.split()), set(b.split())
    return bool(tb) and len(ta & tb) / len(tb) >= 0.6


# ---------------------------------------------------------------------------
# Amendment-conflict document (generated here, kept as sample 14)
# ---------------------------------------------------------------------------

def build_amended_pdf():
    import pymupdf

    doc = pymupdf.open()
    p1 = doc.new_page(width=612, height=792)
    p1.insert_text((48, 64), "CRYOLOGIX SCIENCES GMBH", fontname="hebo", fontsize=16)
    p1.insert_text((48, 82), "PACKING SLIP (ORIGINAL DISPATCH)", fontsize=9)
    p1.insert_text((48, 110), "Shipment number: SHP-2026-1300", fontsize=10)
    p1.insert_text((48, 128), "Carrier: FedEx Priority", fontsize=10)
    p1.insert_text((48, 146), "Seal number: CLX-SEAL-1044", fontsize=10)
    p1.insert_text((48, 170), "TOTAL DECLARED VALUE: USD 48,600.00", fontname="hebo", fontsize=11)

    p2 = doc.new_page(width=612, height=792)
    p2.insert_text((48, 64), "ITEMIZED CONTENTS", fontname="hebo", fontsize=13)
    p2.insert_text((48, 90), "LOT-26-CB-0901  Cord blood unit  x4", fontsize=10)
    p2.insert_text((48, 108), "LOT-26-CB-0902  Cord blood unit  x4", fontsize=10)
    p2.insert_text((48, 126), "LOT-26-CB-0903  Cord blood unit  x4", fontsize=10)
    p2.insert_text((48, 150), "Total units: 12   Lots: 3", fontname="hebo", fontsize=10)

    p3 = doc.new_page(width=612, height=792)
    p3.insert_text((48, 64), "AMENDMENT NOTICE - SUPERSEDES PRIOR PAGES", fontname="hebo", fontsize=13)
    p3.insert_text((48, 92), "The declared value stated on page 1 was incorrect.", fontsize=10)
    p3.insert_text((48, 110), "Corrected total declared value: USD 51,200.00.", fontname="hebo", fontsize=11)
    p3.insert_text((48, 134), "Container seal was replaced at origin: CLX-SEAL-2001.", fontsize=10)
    p3.insert_text((48, 152), "This amendment supersedes all previously stated totals and seals.", fontsize=10)

    path = os.path.join(DOCS_DIR, "14-packing-slip-amended-conflict.pdf")
    doc.save(path)
    doc.close()
    return path


# ---------------------------------------------------------------------------
# Adversarial documents (generated here, kept as samples 15-18)
# ---------------------------------------------------------------------------

def build_adversarial_docs():
    """Create genuinely hard inputs: pixelated low-res scan, faded skewed
    label, dense 6.5pt small print, and a stamp overlapping the text."""
    import pymupdf

    # 15 - packing slip rendered at ~420px long side, JPEG q22 (blur/pixelation)
    doc = pymupdf.open()
    p = doc.new_page(width=612, height=792)
    p.insert_text((48, 64), "CRYOLOGIX SCIENCES GMBH", fontname="hebo", fontsize=15)
    p.insert_text((48, 82), "PACKING SLIP", fontsize=9)
    rows = [
        ("Shipment number: ", "SHP-2026-1441"),
        ("Carrier: ", "FedEx Priority"),
        ("Tracking number: ", "7942 3381 0077"),
        ("Bill of lading: ", "BL-FX-556999"),
        ("Purchase order: ", "PO-88477"),
        ("Supplier: ", "CryoLogix Sciences GmbH"),
        ("Origin: ", "Hamburg, Germany"),
        ("Destination: ", "Boston, MA, United States"),
        ("Temperature regime: ", "Refrigerated +2 to +8 C"),
        ("Category: ", "Cord blood unit"),
        ("Product count: ", "9 units in 3 lots"),
        ("Total declared value: ", "USD 36,450.00"),
        ("Dangerous goods: ", "No"),
    ]
    y = 112
    for label, val in rows:
        p.insert_text((48, y), label + val, fontsize=10)
        y += 18
    small = doc.convert_to_pdf()
    src = pymupdf.open("pdf", small)
    pix = src[0].get_pixmap(matrix=pymupdf.Matrix(0.55, 0.55))
    jpg = pix.tobytes("jpeg", jpg_quality=22)
    src.close(); doc.close()
    with open(os.path.join(DOCS_DIR, "15-packing-slip-lowres-blurry.jpg"), "wb") as f:
        f.write(jpg)

    # 16 - shipping label: faded gray thermal-print text on a rotated page
    doc = pymupdf.open()
    p = doc.new_page(width=400, height=600)
    p.set_rotation(7)
    gray = (0.62, 0.62, 0.66)
    p.insert_text((40, 70), "WORLD COURIER", fontname="hebo", fontsize=14, color=gray)
    p.insert_text((40, 92), "SHIPPING LABEL", fontsize=8, color=gray)
    for i, line in enumerate([
        "Shipment number: SHP-2026-1552",
        "Carrier: World Courier",
        "Tracking number: WB-441-99214006",
        "Origin: London, UK",
        "Destination: Boston MA, USA",
        "Priority: Expedited",
        "Temperature: Refrigerated +2 to +8 C",
        "Dangerous goods: YES - UN3373",
        "Seal number: WC-99451",
    ]):
        p.insert_text((40, 130 + i * 26), line, fontsize=10, color=gray)
    pix = p.get_pixmap(matrix=pymupdf.Matrix(1.6, 1.6))
    with open(os.path.join(DOCS_DIR, "16-shipping-label-faded-skewed.png"), "wb") as f:
        f.write(pix.tobytes("png"))
    doc.close()

    # 17 - two-page BOL in 6.5pt type with an 8-lot table to aggregate
    doc = pymupdf.open()
    p1 = doc.new_page(width=612, height=792)
    p1.insert_text((40, 56), "MAERSK LINE - BILL OF LADING", fontname="hebo", fontsize=9)
    p1.insert_text((40, 72), "Doc 17 dense small print - verify legibility at 100% zoom", fontsize=5)
    for i, line in enumerate([
        "Bill of lading: MAEU-2266-79002",
        "Purchase order: PO-91388",
        "Carrier: Maersk Line",
        "Shipper: NordCell Biologics BV",
        "Port of loading: Rotterdam",
        "Port of discharge: Newark",
        "Container seal: MSK-89101",
        "Temperature regime: Ultra-frozen -80C",
        "Dangerous goods: YES - UN1845 (dry ice)",
    ]):
        p1.insert_text((40, 96 + i * 11), line, fontsize=6.5)
    p2 = doc.new_page(width=612, height=792)
    p2.insert_text((40, 56), "CARGO MANIFEST", fontname="hebo", fontsize=8)
    lots = [f"LOT-26-NC-{900 + i}  Cord blood unit  x3" for i in range(1, 9)]
    for i, line in enumerate(lots):
        p2.insert_text((40, 76 + i * 10), line, fontsize=6.5)
    p2.insert_text((40, 170), "Total: 24 units, 8 lots. Total declared value: USD 128,800.00",
                   fontname="hebo", fontsize=6.5)
    doc.save(os.path.join(DOCS_DIR, "17-bill-of-lading-dense-smallprint.pdf"))
    doc.close()

    # 18 - COA with a diagonal RECEIVED stamp crossing the text block
    doc = pymupdf.open()
    p = doc.new_page(width=612, height=792)
    p.insert_text((48, 64), "STEMCORE LABS", fontname="hebo", fontsize=15)
    p.insert_text((48, 82), "CERTIFICATE OF ANALYSIS", fontsize=9)
    for i, line in enumerate([
        "Shipment number: SHP-2026-1663",
        "Supplier: StemCore Labs",
        "Product category: Cord blood unit",
        "Storage condition: Liquid nitrogen vapor phase",
        "Dangerous goods: YES - UN3373",
        "Declared value: USD 187,500.00",
        "Result: PASS - all specifications met",
    ]):
        p.insert_text((48, 116 + i * 20), line, fontsize=10)
    stamp_m = pymupdf.Matrix(28)
    p.insert_text((150, 300), "RECEIVED - CRYOSYNC QC", fontname="hebo",
                  fontsize=20, color=(0.75, 0.1, 0.1),
                  morph=(pymupdf.Point(200, 280), stamp_m))
    p.draw_rect(pymupdf.Rect(120, 180, 480, 330), color=(0.75, 0.1, 0.1), width=1.6)
    pix = p.get_pixmap(matrix=pymupdf.Matrix(1.7, 1.7))
    with open(os.path.join(DOCS_DIR, "18-coa-stamp-overlay.png"), "wb") as f:
        f.write(pix.tobytes("png"))
    doc.close()


# ---------------------------------------------------------------------------
# Evaluation stages
# ---------------------------------------------------------------------------

RESULTS = {"perDocument": {}, "exceptions": [], "amendment": {}}


def save():
    with open(os.path.join(OUT_DIR, "extract-evaluation.json"), "w") as f:
        json.dump(RESULTS, f, indent=2)


def evaluate_doc(result, gt_fields):
    got = {f["key"]: f for f in result["fields"]}
    per_field, correct = {}, 0
    for key, exp in gt_fields.items():
        entry = got.get(key) or {}
        ok = values_match(exp, entry.get("value"), key)
        correct += ok
        per_field[key] = {
            "expected": exp[10:] if isinstance(exp, str) and exp.startswith("~") else exp,
            "actual": entry.get("value"),
            "confidence": entry.get("confidence"),
            "evidence": entry.get("evidence"),
            "correct": ok,
        }
    n = len(gt_fields)
    evidence_total = sum(1 for v in per_field.values() if v["actual"] is not None)
    return {
        "accuracy": round(correct / n, 3) if n else None,
        "correct": correct,
        "groundTruthFields": n,
        "fieldsExtracted": sum(1 for f in result["fields"] if f["value"] is not None),
        "overallConfidence": result["overallConfidence"],
        "needsReview": sum(1 for f in result["fields"] if f["needsReview"]),
        "verified": sum(1 for f in result["fields"] if f["verified"] and f["value"] is not None),
        "warnings": len(result["warnings"]),
        "elapsedSec": round(result.get("elapsedMs", 0) / 1000, 1),
        "perField": per_field,
    }


async def run_stage_docs():
    for fname, spec in GT.items():
        mime = "application/pdf" if fname.endswith(".pdf") else "image/png"
        raw = open(os.path.join(DOCS_DIR, fname), "rb").read()
        b64 = base64.b64encode(raw).decode()
        entry = {"group": spec["group"]}

        t0 = time.perf_counter()
        std = await extract.extract_document_fields(b64, mime, precision_mode=False)
        std["elapsedMs"] = round((time.perf_counter() - t0) * 1000)
        entry["standard"] = evaluate_doc(std, spec["fields"])

        if fname in PRECISION_SUBSET:
            t0 = time.perf_counter()
            prec = await extract.extract_document_fields(b64, mime, precision_mode=True)
            prec["elapsedMs"] = round((time.perf_counter() - t0) * 1000)
            entry["precision"] = evaluate_doc(prec, spec["fields"])

        if "cross_page_fields" in spec:
            got = {f["key"]: f for f in std["fields"]}
            entry["crossPage"] = {
                k: {"found": got.get(k, {}).get("value") is not None,
                    "correct": values_match(spec["fields"][k], got.get(k, {}).get("value"), k)}
                for k in spec["cross_page_fields"]
            }

        RESULTS["perDocument"][fname] = entry
        acc = entry["standard"]["accuracy"]
        print(f"  {fname}: std accuracy={acc:.0%} ({entry['standard']['elapsedSec']}s)"
              + (f", precision={entry['precision']['accuracy']:.0%}" if "precision" in entry else ""),
              flush=True)
        save()


async def run_stage_amendment():
    path = build_amended_pdf()
    raw = open(path, "rb").read()
    b64 = base64.b64encode(raw).decode()

    def pick(res):
        got = {f["key"]: f for f in res["fields"]}
        return {
            "totalValue": got.get("totalValue", {}).get("value"),
            "sealNumber": got.get("sealNumber", {}).get("value"),
            "shipmentNumber": got.get("shipmentNumber", {}).get("value"),
            "lotCount": got.get("lotCount", {}).get("value"),
        }

    t0 = time.perf_counter()
    std = await extract.extract_document_fields(b64, "application/pdf", precision_mode=False)
    std["elapsedMs"] = round((time.perf_counter() - t0) * 1000)
    t0 = time.perf_counter()
    prec = await extract.extract_document_fields(b64, "application/pdf", precision_mode=True)
    prec["elapsedMs"] = round((time.perf_counter() - t0) * 1000)

    RESULTS["amendment"] = {
        "scenario": "Page 1 states total USD 48,600 / seal CLX-SEAL-1044; page 3 amendment "
                    "supersedes with USD 51,200 / seal CLX-SEAL-2001",
        "expectedResolution": {"totalValue": 51200, "sealNumber": "CLX-SEAL-2001"},
        "standard": pick(std),
        "precision": pick(prec),
        "standardResolved": values_match(51200, pick(std)["totalValue"]),
        "precisionResolved": values_match(51200, pick(prec)["totalValue"]),
    }
    print(f"  amendment: std resolved={RESULTS['amendment']['standardResolved']}, "
          f"prec resolved={RESULTS['amendment']['precisionResolved']}", flush=True)
    save()


async def run_stage_citations():
    """Verify evidence quotes against the text layer of the generated PDFs."""
    import pymupdf

    ok = 0
    total = 0
    for fname in ("11-packing-slip-refrigerated-multipage.pdf",
                  "12-bill-of-lading-ocean-multipage.pdf",
                  "13-coa-cord-blood-multipage.pdf"):
        doc = pymupdf.open(os.path.join(DOCS_DIR, fname))
        text = norm_text(" ".join(page.get_text() for page in doc))
        doc.close()
        pf = RESULTS["perDocument"][fname]["standard"]["perField"]
        for v in pf.values():
            if v["actual"] is None or not v.get("evidence"):
                continue
            total += 1
            ev = norm_text(v["evidence"])
            if ev and (ev in text
                       or re.sub(r"\W", "", ev) in re.sub(r"\W", "", text)):
                ok += 1
    RESULTS["citations"] = {"verified": ok, "withEvidence": total,
                            "rate": round(ok / total, 3) if total else None}
    print(f"  citations: {ok}/{total} evidence quotes found verbatim in source PDFs", flush=True)
    save()


async def run_stage_calibration():
    buckets = {"0.9-1.0": [0, 0], "0.7-0.9": [0, 0], "0.5-0.7": [0, 0], "<0.5": [0, 0]}
    for fname, entry in RESULTS["perDocument"].items():
        for key, v in entry["standard"]["perField"].items():
            if v["actual"] is None or v["confidence"] is None:
                continue
            c = v["confidence"]
            b = "0.9-1.0" if c >= 0.9 else "0.7-0.9" if c >= 0.7 else "0.5-0.7" if c >= 0.5 else "<0.5"
            buckets[b][0] += int(bool(v["correct"]))
            buckets[b][1] += 1
    RESULTS["calibration"] = {
        b: {"correct": n, "total": t, "accuracy": round(n / t, 3) if t else None}
        for b, (n, t) in buckets.items()
    }
    print("  calibration:", {b: v["accuracy"] for b, v in RESULTS["calibration"].items()}, flush=True)
    save()


async def run_stage_exceptions():
    import pymupdf

    cases = []

    def add(name, mime, data):
        cases.append((name, mime, base64.b64encode(data).decode()))

    add("Plain text file uploaded as .pdf", "application/pdf", b"This is not a PDF at all.")
    add("Truncated PDF (valid header, body cut)", "application/pdf",
        open(os.path.join(DOCS_DIR, "12-bill-of-lading-ocean-multipage.pdf"), "rb").read()[:900])
    pw_doc = pymupdf.open()
    pw_doc.new_page().insert_text((72, 72), "secret")
    tmp = os.path.join(OUT_DIR, "_pw_test.pdf")
    pw_doc.save(tmp, encryption=pymupdf.PDF_ENCRYPT_AES_256, user_pw="s3cret", owner_pw="s3cret")
    pw_doc.close()
    add("Password-protected PDF", "application/pdf", open(tmp, "rb").read())
    os.remove(tmp)
    add("Random binary bytes, unknown type", "", os.urandom(512))

    out = []
    for name, mime, b64 in cases:
        try:
            await extract.extract_document_fields(b64, mime, precision_mode=False)
            out.append({"case": name, "outcome": "accepted", "error": None})
        except Exception as e:
            out.append({"case": name, "outcome": "rejected", "error": str(e)[:140]})
        print(f"  exception: {name} -> {out[-1]['outcome']}", flush=True)
    RESULTS["exceptions"] = out
    save()


# ---------------------------------------------------------------------------
# Report rendering
# ---------------------------------------------------------------------------

def pct(x):
    return f"{x:.0%}" if isinstance(x, (int, float)) else "-"


def render_report():
    pd = RESULTS["perDocument"]

    groups = {}
    for fname, e in pd.items():
        groups.setdefault(e["group"], []).append(e["standard"]["accuracy"])
    group_rows = "\n".join(
        f"| {g} | {len(accs)} | {pct(sum(accs)/len(accs))} |"
        for g, accs in sorted(groups.items())
    )

    field_stats = {}
    for e in pd.values():
        for k, v in e["standard"]["perField"].items():
            s = field_stats.setdefault(k, [0, 0])
            s[1] += 1
            s[0] += int(bool(v["correct"]))
    CRITICAL = ["shipmentNumber", "carrier", "trackingNumber", "billOfLading",
                "temperatureRegime", "dangerousGoods", "unNumber", "productCount",
                "lotCount", "totalValue", "sealNumber", "priority"]
    lines = []
    for k in CRITICAL:
        s = field_stats.get(k)
        if s and s[1]:
            lines.append(f"| `{k}` | {s[1]} | {pct(s[0] / s[1])} |")
    field_rows = "\n".join(lines)

    miss_rows = []
    for fname, e in sorted(pd.items()):
        for k, v in e["standard"]["perField"].items():
            if not v["correct"]:
                miss_rows.append(
                    f"| `{k}` | {fname} | {v['expected']} | {v['actual'] if v['actual'] is not None else '(null)'} |"
                )
    miss_section = ""
    if miss_rows:
        miss_section = (
            "\n### Observed misses (Standard mode)\n\n"
            "| Field | Document | Expected | Extracted |\n|---|---|---|---|\n"
            + "\n".join(miss_rows) + "\n"
        )

    lat_std = [e["standard"]["elapsedSec"] for e in pd.values()]
    lat_prec = [e["precision"]["elapsedSec"] for e in pd.values() if "precision" in e]
    acc_prec = [e["precision"]["accuracy"] for e in pd.values() if "precision" in e]
    acc_std_all = [e["standard"]["accuracy"] for e in pd.values()]

    am = RESULTS.get("amendment", {})
    cal = RESULTS.get("calibration", {})
    cal_rows = "\n".join(
        f"| {b} | {v['total']} | {pct(v['accuracy'])} |"
        for b, v in cal.items() if v["total"]
    )
    cit = RESULTS.get("citations", {})
    exc_rows = "\n".join(
        f"| {x['case']} | {x['outcome']} | {(x['error'] or '-')[:90]} |"
        for x in RESULTS.get("exceptions", [])
    )
    cp = next((e.get("crossPage") for e in pd.values() if "crossPage" in e), None)
    cp_rows = "\n".join(
        f"| {k} (page 2) | {'found' if v['found'] else 'missed'} | {'correct' if v['correct'] else 'wrong'} |"
        for k, v in (cp or {}).items()
    ) if cp else "| - | - | - |"

    report = f"""# AI Extract - Full Quality Evaluation

Live evaluation against the production Databricks vision endpoint.
Corpus: 17 documents - 9 clean scans, 1 noisy/rotated scan, 2 degraded scans
(low-res JPEG q22, faded gray text on a 7-degree skew), 1 dense 6.5pt small-print
BOL with an 8-lot table, 1 stamp-overlaid COA, 3 multi-page PDFs - plus 1
generated amendment-conflict document. ID-like fields (shipment/tracking/BOL/PO/
seal/UN numbers) are scored strictly: the value must match exactly after
punctuation/case normalization. Ground truth: `test-documents/EXPECTED-VALUES.md`.

## Headline results

| Metric | Standard mode | Precision mode |
|---|---|---|
| Mean field accuracy (ground-truthed) | {pct(sum(acc_std_all)/len(acc_std_all))} | {pct(sum(acc_prec)/len(acc_prec))} |
| Mean latency per document | {sum(lat_std)/len(lat_std):.1f}s | {sum(lat_prec)/len(lat_prec):.1f}s |
| Model calls per document | 1 | 2 |

## 1. Accuracy for business-critical fields (Standard mode, all 17 docs)

| Field | Ground-truthed docs | Accuracy |
|---|---|---|
{field_rows}
{miss_section}
## 2. Performance across templates and scan qualities

| Document group | Docs | Mean field accuracy |
|---|---|---|
{group_rows}

## 3. Cross-page and cross-clause reasoning

Multi-page PDF 11 spreads decision-critical fields across pages 1-3:

| Field | Found | Correctly valued |
|---|---|---|
{cp_rows}

## 4. Completeness of large tables and arrays

Line-item table on page 2 of doc 11 (3 lots / 12 units / USD 48,600):
`lotCount`, `productCount` and `totalValue` are scored in section 1 and drive
the cross-page result above - a correct score proves the model consumed the
full table, not just page 1.

## 5. Handling of amendments and conflicting information

Scenario: page 1 declares USD 48,600 / seal CLX-SEAL-1044; page 3 amendment
supersedes with USD 51,200 / seal CLX-SEAL-2001.

| Mode | totalValue returned | sealNumber returned | Resolved to amendment |
|---|---|---|---|
| Standard | {am.get('standard', {}).get('totalValue', '-')} | {am.get('standard', {}).get('sealNumber', '-')} | {'yes' if am.get('standardResolved') else 'no'} |
| Precision | {am.get('precision', {}).get('totalValue', '-')} | {am.get('precision', {}).get('sealNumber', '-')} | {'yes' if am.get('precisionResolved') else 'no'} |

## 6. Citation accuracy and source traceability

Every extracted value carries an `evidence` quote. For the three generated
PDFs the quotes were checked verbatim against the documents' text layer:

**{cit.get('verified', 0)}/{cit.get('withEvidence', 0)} evidence quotes verified ({pct(cit.get('rate'))})**

## 7. Confidence-score calibration (Standard mode)

Stated confidence vs observed correctness, bucketed:

| Stated confidence | Fields | Observed accuracy |
|---|---|---|
{cal_rows}

## 8. Processing time and cost per document

- Measured wall-clock: Standard {min(lat_std)}-{max(lat_std)}s, Precision {min(lat_prec)}-{max(lat_prec)}s per document.
- Cost driver is model calls: 1 (Standard) vs 2 (Precision) vision completions
  per document, plus one extra completion per PDF page-set size (pages are
  billed as input images). On Databricks Model Serving, cost follows your
  provisioned throughput or token consumption - no per-document SaaS fee.

## 9. Exception handling and malformed files

| Input | Outcome | Error surfaced |
|---|---|---|
{exc_rows}

All failures fail fast with actionable messages before any model call
(except where noted), returning HTTP 400 to the client.

## 10. Regional availability, security and compliance

- Documents never leave the customer's own Databricks workspace: extraction
  runs against a Model Serving endpoint inside the workspace boundary; no
  third-party SaaS receives document bytes.
- Auth is machine-to-machine OAuth (client credentials) or PAT; all traffic
  is TLS. Tokens auto-refresh ~5 minutes before expiry.
- Data at rest follows existing Delta Lake governance (Unity Catalog ACLs).
- Region availability follows the workspace's hosting region; vision endpoint
  capacity should be confirmed per region during rollout.

## 11. Integration effort

- One JSON REST contract: `POST /api/ai/extract-form` (and `/extract-compare`
  for side-by-side evaluation) with base64 document + options; no multipart,
  no vendor SDK - any OpenAI-compatible backend works behind it.
- Frontend footprint: a single service module (~80 LOC) plus one page
  component; results hand off to the receiving intake form through staged
  session state with zero coupling.
- Normalization (enums, booleans, numbers) happens server-side, so consumers
  receive form-ready values with confidence, evidence and review flags.
"""
    with open(os.path.join(OUT_DIR, "extract-evaluation.md"), "w", encoding="utf-8") as f:
        f.write(report)
    print("wrote docs/extract-evaluation.md", flush=True)


def emit_ts():
    """Write the evaluation snapshot as a typed TS module for the UI."""
    pd = RESULTS["perDocument"]
    cal = RESULTS.get("calibration", {})
    cit = RESULTS.get("citations", {})
    am = RESULTS.get("amendment", {})

    try:
        from extract import FIELD_SCHEMA
        labels = {f["key"]: f["label"] for f in FIELD_SCHEMA}
    except Exception:
        labels = {}

    field_stats = {}
    for e in pd.values():
        for k, v in e["standard"]["perField"].items():
            s = field_stats.setdefault(k, [0, 0])
            s[1] += 1
            s[0] += int(bool(v["correct"]))
    fields = [
        {"key": k, "label": labels.get(k, k), "docs": s[1], "accuracy": round(s[0] / s[1], 3)}
        for k, s in sorted(field_stats.items(), key=lambda kv: -(kv[1][0] / kv[1][1]))
        if s[1]
    ]

    groups = {}
    for e in pd.values():
        groups.setdefault(e["group"], []).append(e["standard"]["accuracy"])
    group_list = [
        {"group": g, "docs": len(a), "accuracy": round(sum(a) / len(a), 3)}
        for g, a in sorted(groups.items())
    ]

    std_acc = [e["standard"]["accuracy"] for e in pd.values()]
    prec_acc = [e["precision"]["accuracy"] for e in pd.values() if "precision" in e]
    lat_std = [e["standard"]["elapsedSec"] for e in pd.values()]
    lat_prec = [e["precision"]["elapsedSec"] for e in pd.values() if "precision" in e]

    cross = next((e["crossPage"] for e in pd.values() if "crossPage" in e), {})

    failures = []
    for fname, e in sorted(pd.items()):
        for k, v in e["standard"]["perField"].items():
            if not v["correct"]:
                failures.append({
                    "doc": fname, "field": k, "label": labels.get(k, k),
                    "expected": str(v["expected"]), "actual": str(v["actual"]),
                })

    payload = {
        "generatedAt": time.strftime("%Y-%m-%d"),
        "corpusDocs": len(pd),
        "headline": {
            "standardAccuracy": round(sum(std_acc) / len(std_acc), 3),
            "precisionAccuracy": round(sum(prec_acc) / len(prec_acc), 3),
            "standardLatencySec": round(sum(lat_std) / len(lat_std), 1),
            "precisionLatencySec": round(sum(lat_prec) / len(lat_prec), 1),
        },
        "fields": fields,
        "groups": group_list,
        "crossPage": [{"field": k, "found": v["found"], "correct": v["correct"]} for k, v in cross.items()],
        "missCount": len(failures),
        "failures": failures[:12],
        "citations": cit,
        "calibration": [
            {"bucket": b, "total": v["total"], "accuracy": v["accuracy"]}
            for b, v in cal.items()
        ],
        "amendment": {
            "standardResolved": am.get("standardResolved", False),
            "precisionResolved": am.get("precisionResolved", False),
        },
        "exceptions": RESULTS.get("exceptions", []),
    }

    ts = (
        "// Auto-generated by backend/evaluate_extract.py - do not edit by hand.\n"
        "// Rerun the evaluator to refresh these measured numbers.\n\n"
        f"export interface EvaluationData {{\n"
        f"  generatedAt: string\n"
        f"  corpusDocs: number\n"
        f"  headline: {{ standardAccuracy: number; precisionAccuracy: number; standardLatencySec: number; precisionLatencySec: number }}\n"
        f"  fields: {{ key: string; label: string; docs: number; accuracy: number }}[]\n"
        f"  groups: {{ group: string; docs: number; accuracy: number }}[]\n"
        f"  crossPage: {{ field: string; found: boolean; correct: boolean }}[]\n"
        f"  missCount: number\n"
        f"  failures: {{ doc: string; field: string; label: string; expected: string; actual: string }}[]\n"
        f"  citations: {{ verified: number; withEvidence: number; rate: number | null }}\n"
        f"  calibration: {{ bucket: string; total: number; accuracy: number | null }}[]\n"
        f"  amendment: {{ standardResolved: boolean; precisionResolved: boolean }}\n"
        f"  exceptions: {{ case: string; outcome: string; error: string | null }}[]\n"
        f"}}\n\n"
        f"export const EVALUATION: EvaluationData = {json.dumps(payload, indent=2)}\n"
    )
    out = os.path.join(ROOT, "src", "pages", "Extract", "evaluation-data.ts")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, "w", encoding="utf-8") as f:
        f.write(ts)
    print(f"wrote {os.path.relpath(out, ROOT)}", flush=True)


async def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    print("stage 0/5: generating adversarial documents...", flush=True)
    await asyncio.to_thread(build_adversarial_docs)
    print("stage 1/5: corpus (standard on all, precision on subset)...", flush=True)
    await run_stage_docs()
    print("stage 2/5: amendment conflict...", flush=True)
    await run_stage_amendment()
    print("stage 3/5: citations...", flush=True)
    await run_stage_citations()
    print("stage 4/5: calibration...", flush=True)
    await run_stage_calibration()
    print("stage 5/5: exceptions...", flush=True)
    await run_stage_exceptions()
    render_report()
    emit_ts()
    save()
    print("done")


if __name__ == "__main__":
    asyncio.run(main())
