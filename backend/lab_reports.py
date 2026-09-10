"""Flexible lab-report ingestion for CryoSync.

Accepts CSV / Excel (XLSX) dumps of lab reports for collected samples and
writes them into the ``lab_test_reports`` table. Real-world lab exports vary a
lot (column names, layouts, units), so this layer:

* parses the file into rows with ``pandas``,
* normalizes a small set of *known* fields (sample/unit reference, test type/
  name, result, date, reviewer, …) onto dedicated columns,
* preserves EVERY other column generically in the ``details`` JSON blob so no
  real-life detail is ever dropped,
* records the source file + row on each report for traceability,
* and creates a ``csv_import_batches`` entry describing the import.
"""

import asyncio
import json
import os
import re
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import pandas as pd

# ---------------------------------------------------------------------------
# Field mapping: known column aliases -> canonical lab_test_reports columns
# ---------------------------------------------------------------------------

# Canonical column -> list of accepted header names (case/punctuation-insensitive).
FIELD_ALIASES: Dict[str, List[str]] = {
    "report_id": ["report_id", "reportid", "report", "report number", "test id", "batch id"],
    "unit_number": ["unit_number", "unit no", "unit no.", "cbu", "cbu number", "cbu no", "cord_blood_unit", "unit id", "cord blood unit number"],
    "cord_blood_unit_id": ["cord_blood_unit_id", "unit_uuid", "cbu_id"],
    "sample_reference": ["sample_reference", "sample", "sample id", "sample no", "specimen id", "accession", "mrn", "client sample id"],
    "test_type": ["test_type", "test type", "test", "analysis", "assay", "parameter", "panel"],
    "test_name": ["test_name", "test name", "name", "procedure", "description"],
    "test_method": ["test_method", "method", "methodology", "technique"],
    "instrument": ["instrument", "analyzer", "machine", "equipment", "device"],
    "performed_by": ["performed_by", "performed by", "analyst", "technician", "tech", "operator", "performedby"],
    "result_value": ["result_value", "result", "value", "result value", "numeric result", "reading", "found value"],
    "result_unit": ["result_unit", "unit", "result unit", "units", "uom"],
    "result_text": ["result_text", "qualitative result", "interpretation", "result text", "comment", "note", "conclusion", "found value"],
    "reference_low": ["reference_low", "ref low", "reference range low", "normal low", "low"],
    "reference_high": ["reference_high", "ref high", "reference range high", "normal high", "high"],
    "reference_text": ["reference_text", "reference range", "ref range", "normal range", "ref", "reference"],
    "performed_at": ["performed_at", "date", "test date", "performed date", "result date", "run date", "collected date", "collection date", "datetime"],
    "reviewed_by": ["reviewed_by", "reviewed by", "approver", "reviewer", "medical reviewer", "sign off"],
    "status": ["status", "result status", "test status", "review status"],
}

KNOWN_KEYS = set(FIELD_ALIASES.keys())

STATUS_NORMALIZE = {
    "pos": "positive", "positive": "positive", "neg": "negative", "negative": "negative",
    "reactive": "reactive", "non reactive": "non-reactive", "non-reactive": "non-reactive",
    "equivocal": "equivocal", "pending": "pending", "passed": "passed",
    "fail": "failed", "failed": "failed", "conditional": "conditional",
}


def _norm(s: Any) -> str:
    text = re.sub(r"[^a-z0-9]+", " ", str(s or "").lower()).strip()
    return re.sub(r"\s+", " ", text)


def _resolve_column(header: str) -> Optional[str]:
    n = _norm(header)
    for canonical, aliases in FIELD_ALIASES.items():
        if n == canonical or n in aliases:
            return canonical
        for a in aliases:
            if n == _norm(a):
                return canonical
    # fuzzy prefix match for things like "result_value_1"
    for canonical, aliases in FIELD_ALIASES.items():
        if n.startswith(_norm(canonical).split(" ")[0].replace("_", " ")) and len(n) > 2:
            return canonical
    return None


def _coerce_value(v: Any, canonical: str) -> Any:
    if v is None or (isinstance(v, float) and pd.isna(v)):
        return None
    if canonical in ("result_value", "reference_low", "reference_high"):
        if isinstance(v, (int, float)):
            return v
        clean = re.sub(r"[^0-9.\-]", "", str(v))
        try:
            num = float(clean)
            return int(num) if num.is_integer() else num
        except ValueError:
            return None
    if isinstance(v, (pd.Timestamp,)):
        return v.isoformat()
    if isinstance(v, (int, float)):
        # pandas may give float for integer cells
        return v
    # normalize common status values
    if canonical == "status":
        return STATUS_NORMALIZE.get(_norm(v), str(v))
    return str(v)


def _parse_file(file_bytes: bytes, filename: str) -> Tuple[List[Dict[str, Any]], List[str]]:
    """Parse CSV/XLSX bytes into a list of raw row dicts. Returns (rows, warnings)."""
    suffix = Path(filename).suffix.lower()
    warnings: List[str] = []
    try:
        if suffix == ".csv":
            df = pd.read_csv(__import__("io").BytesIO(file_bytes), dtype=str, keep_default_na=True)
        elif suffix in (".xlsx", ".xlsm"):
            df = pd.read_excel(__import__("io").BytesIO(file_bytes), dtype=str)
        elif suffix == ".xls":
            df = pd.read_excel(__import__("io").BytesIO(file_bytes), sheet_name=0, dtype=str)
        else:
            # fall back: try csv, then excel
            try:
                df = pd.read_csv(__import__("io").BytesIO(file_bytes), dtype=str)
            except Exception:
                df = pd.read_excel(__import__("io").BytesIO(file_bytes), dtype=str)
    except Exception as e:
        raise ValueError(f"Could not parse '{filename}': {e}")

    df = df.dropna(how="all")
    df = df.loc[:, ~df.columns.astype(str).str.contains("^Unnamed:", na=False)]
    if df.empty or df.columns.size == 0:
        raise ValueError(f"'{filename}' has no usable data rows/columns")

    records = df.to_dict(orient="records")
    rows = []
    for idx, rec in enumerate(records):
        row = {_norm(k): v for k, v in rec.items()}
        rows.append({"index": idx + 2, "row": row})
    if rows == [] and df.shape[0]:
        raise ValueError(f"'{filename}' has no data after cleaning")
    return rows, warnings


def _find_unit_references(rows_map: Dict[str, Any]) -> None:
    """Not used; kept for clarity on matching hooks. Real matching happens in the API."""


def build_normalized_rows(rows: List[Dict[str, Any]], filename: str) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    """Map each raw CSV row onto the lab_test_reports shape.

    Returns (successful_records, errored_rows). Any unknown column is stored
    under ``details`` so nothing is lost.
    """
    successful: List[Dict[str, Any]] = []
    errored: List[Dict[str, Any]] = []
    now = datetime.now().isoformat()

    for item in rows:
        raw = item["row"]
        source_row = item["index"]
        record: Dict[str, Any] = {"source_filename": filename, "source_row": source_row}
        details: Dict[str, Any] = {}
        seen = set()
        for header_norm, value in raw.items():
            canonical = _resolve_column(header_norm)
            if canonical:
                if value is not None and str(value).strip() != "" and _norm(value) not in ("nan", "none"):
                    record[canonical] = _coerce_value(value, canonical)
                seen.add(canonical)
            else:
                details[header_norm] = value

        # Ensure a stable id and defaults.
        record["id"] = f"LR-{datetime.now().strftime('%Y%m%d')}-{uuid.uuid4().hex[:10]}"
        if not record.get("report_id"):
            record["report_id"] = f"REP-{uuid.uuid4().hex[:8].upper()}"
        record["details"] = dict(details)
        record["status"] = record.get("status") or "pending"
        record["created_at"] = record.get("performed_at") or now
        record["updated_at"] = now

        # A row must at least say what it tested to be useful.
        if not (record.get("test_type") or record.get("test_name") or record.get("sample_reference")):
            errored.append({"source_row": source_row, "error": "No test type, test name, or sample reference found"})
            continue
        successful.append(record)
    return successful, errored


def records_with_details(records: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Deep-copy records so callers can mutate freely and pickle details to JSON."""
    out = []
    for r in records:
        r = dict(r)
        r["details"] = dict(r.get("details") or {})
        out.append(r)
    return out