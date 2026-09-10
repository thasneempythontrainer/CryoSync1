"""AI document-to-form extraction for CryoSync.

Extracts structured shipment/receiving fields from uploaded documents
(packing slips, shipping labels, bills of lading, COAs) using a
vision-capable OpenAI-compatible chat endpoint - the same raw-HTTP auth and
URL handling as `agent.py` (OPENAI_API_KEY / OPENAI_BASE_URL /
OPENAI_VISION_MODEL; Databricks serving needs OPENAI_VISION_BASE_URL because
the gateway routes on the URL path, not the `model` field).

Standard mode runs a single extraction pass. Precision mode adds an
independent second verification pass that re-reads the document and
reconciles every extracted value: disagreements are corrected, confidence
is lowered, and low-confidence fields are flagged for human review.
"""

import asyncio
import base64
import json
import os
import re
import time
from typing import Any, Dict, List, Optional

import httpx

# Vision-capable OpenAI-compatible model. Override with OPENAI_VISION_MODEL;
# falls back to OPENAI_MODEL (the Databricks serving endpoint name).
DEFAULT_VISION_ENDPOINT = os.getenv("OPENAI_VISION_MODEL") or os.getenv("OPENAI_MODEL") or "gpt-4o-mini"

# Fields at or below this confidence are flagged for human review.
REVIEW_THRESHOLD = 0.7

# Maximum decoded payload size accepted for extraction (12 MB).
MAX_DOCUMENT_BYTES = 12 * 1024 * 1024

# PDF handling: pages beyond this cap are skipped (with a warning) so a huge
# scan can't blow up the request size or token budget.
MAX_PDF_PAGES = 20
# Rendered page images target roughly this many pixels on the long side -
# enough for small print to stay legible after model-side downscaling.
PDF_RENDER_LONG_SIDE = 1800

_client: Optional[Any] = None


def _chat_url() -> str:
    """Resolve the chat-completions URL for the configured AI backend.

    Mirrors agent.py: Databricks model serving only serves the exact
    /invocations path, and the endpoint that answers is determined by the URL
    path (the `model` field is ignored by the gateway). Document extraction
    therefore uses OPENAI_VISION_BASE_URL when present, falling back to
    OPENAI_BASE_URL; a base URL ending in /invocations is used as-is,
    everyone else gets the standard /chat/completions suffix appended.
    """
    base = (
        os.getenv("OPENAI_VISION_BASE_URL")
        or os.getenv("OPENAI_BASE_URL")
        or "https://api.openai.com/v1"
    ).rstrip("/")
    if base.endswith("/invocations"):
        return base
    return base + "/chat/completions"


def _headers() -> Dict[str, str]:
    return {
        "Authorization": f"Bearer {os.getenv('OPENAI_API_KEY', '')}",
        "Content-Type": "application/json",
    }


def _get_client() -> Optional[Any]:
    """Return an injected SDK-style client, or None (production raw HTTP).

    Production extraction talks straight to OPENAI_BASE_URL via httpx exactly
    like agent.py: the OpenAI SDK always appends /chat/completions, which the
    Databricks serving gateway rejects. Tests inject a fake SDK-shaped client
    here to run offline.
    """
    return _client


def _complete(
    client: Optional[Any], model: str, messages: List[Dict[str, Any]], temperature: float
) -> str:
    """One model call: raw HTTP to the endpoint, or the injected test client."""
    if client is not None:
        resp = client.chat.completions.create(
            model=model,
            messages=messages,
            temperature=temperature,
            max_tokens=4096,
        )
        return resp.choices[0].message.content or ""

    body: Dict[str, Any] = {
        "model": model,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": 4096,
    }
    api_key = os.getenv("OPENAI_API_KEY", "")
    if not api_key:
        raise RuntimeError(
            "OPENAI_API_KEY is not set. Configure it in backend/.env (see .env.example)."
        )
    try:
        resp = httpx.post(_chat_url(), headers=_headers(), json=body, timeout=120.0)
    except httpx.HTTPError as e:
        raise RuntimeError(f"AI vision endpoint connection error: {e}") from e
    if resp.status_code == 404:
        raise RuntimeError(
            f"OpenAI vision model '{model}' returned 404. "
            "Set OPENAI_VISION_MODEL to a valid vision-capable model in backend/.env."
        )
    if resp.status_code >= 400:
        raise RuntimeError(f"Error code: {resp.status_code} - {resp.text[:600]}")
    choice = (resp.json().get("choices") or [{}])[0]
    return (choice.get("message") or {}).get("content") or ""


# ---------------------------------------------------------------------------
# Field schema - the target form fields. Mirrors the Receiving intake form.
# ---------------------------------------------------------------------------

FIELD_SCHEMA: List[Dict[str, Any]] = [
    # Shipment
    {"key": "shipmentNumber", "label": "Shipment Number", "section": "shipment", "type": "string",
     "description": "Consignment / shipment / AWB reference printed on the document"},
    {"key": "carrier", "label": "Carrier", "section": "shipment", "type": "string",
     "description": "Carrier or courier name (e.g. FedEx, DHL, World Courier, Ceva)"},
    {"key": "trackingNumber", "label": "Tracking Number", "section": "shipment", "type": "string"},
    {"key": "billOfLading", "label": "Bill of Lading", "section": "shipment", "type": "string"},
    {"key": "purchaseOrderNumber", "label": "Purchase Order Number", "section": "shipment", "type": "string"},
    {"key": "sealNumber", "label": "Seal Number", "section": "shipment", "type": "string"},
    {"key": "priority", "label": "Priority", "section": "shipment", "type": "enum",
     "options": ["standard", "expedited", "critical"]},
    # Parties & route
    {"key": "supplierName", "label": "Supplier / Shipper", "section": "parties", "type": "string"},
    {"key": "origin", "label": "Origin", "section": "parties", "type": "string",
     "description": "Ship-from city/country"},
    {"key": "destination", "label": "Destination", "section": "parties", "type": "string",
     "description": "Ship-to city/country or facility"},
    # Product
    {"key": "category", "label": "Product Category", "section": "product", "type": "enum",
     "options": ["hybrid_banking", "univercell_banking", "cord_blood_unit", "maternal_sample",
                 "test_report", "cellular_therapy_release"]},
    {"key": "temperatureRegime", "label": "Temperature Regime", "section": "product", "type": "enum",
     "options": ["ambient", "refrigerated_2_8", "frozen_minus_20", "ultra_frozen_minus_80",
                 "liquid_nitrogen"],
     "description": "Infer from stated storage range, e.g. +2 to +8C -> refrigerated_2_8, "
                    "-20C -> frozen_minus_20, -80C or below -60C -> ultra_frozen_minus_80, "
                    "-150C or LN2 vapor -> liquid_nitrogen"},
    {"key": "productCount", "label": "Product Count", "section": "product", "type": "number"},
    {"key": "lotCount", "label": "Lot Count", "section": "product", "type": "number",
     "description": "Number of distinct lot/batch numbers on the document"},
    {"key": "totalValue", "label": "Total Value", "section": "product", "type": "number",
     "description": "Declared total value in USD (numeric only, no currency symbols)"},
    # Compliance
    {"key": "dangerousGoods", "label": "Dangerous Goods", "section": "compliance", "type": "boolean",
     "description": "True if UN1845/UN3373/dry ice/liquid nitrogen or other DG markings are present"},
    {"key": "unNumber", "label": "UN Number", "section": "compliance", "type": "string"},
    {"key": "condition", "label": "Condition", "section": "compliance", "type": "enum",
     "options": ["excellent", "good", "fair", "damaged"],
     "description": "Package condition as documented; default good when not stated"},
    {"key": "notes", "label": "Notes", "section": "compliance", "type": "string",
     "description": "Any additional handling instructions or remarks worth preserving"},
]

SECTION_LABELS: Dict[str, str] = {
    "shipment": "Shipment Details",
    "parties": "Parties & Route",
    "product": "Product",
    "compliance": "Compliance",
}

_ENUM_LOOKUP: Dict[str, List[str]] = {
    f["key"]: f.get("options", []) for f in FIELD_SCHEMA if f["type"] == "enum"
}
_FIELD_BY_KEY: Dict[str, Dict[str, Any]] = {f["key"]: f for f in FIELD_SCHEMA}


def _schema_prompt_lines() -> List[str]:
    lines = []
    for f in FIELD_SCHEMA:
        line = f'- "{f["key"]}" ({f["type"]}): {f["label"]}'
        if f.get("options"):
            line += f". One of: {', '.join(f['options'])}"
        if f.get("description"):
            line += f". {f['description']}"
        lines.append(line)
    return lines


# ---------------------------------------------------------------------------
# Document preparation - PDFs are rasterized to per-page images
# ---------------------------------------------------------------------------

def _norm_for_match(s: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9]+", " ", (s or "").lower())).strip()


def _pdf_page_images(pdf_bytes: bytes) -> tuple[List[tuple[str, str]], int, List[str]]:
    """Render every PDF page to a base64 JPEG image for the vision model.

    Vision serving endpoints consume images, not raw PDFs, so each page is
    rasterized at a resolution that keeps small print legible. Returns
    (images, total_page_count, per_page_text_layers) - the count includes
    pages beyond MAX_PDF_PAGES; text layers power evidence verification and
    page attribution downstream.
    """
    try:
        import pymupdf
    except ImportError as e:
        raise ValueError("PDF support is unavailable: pymupdf is not installed") from e

    try:
        doc = pymupdf.open(stream=pdf_bytes, filetype="pdf")
    except Exception as e:
        raise ValueError(f"Could not read PDF: {e}") from e

    try:
        if doc.needs_pass:
            raise ValueError("PDF is password-protected; remove the password and retry")
        if doc.page_count == 0:
            raise ValueError("PDF has no pages")
        pages: List[tuple[str, str]] = []
        texts: List[str] = []
        for index in range(min(doc.page_count, MAX_PDF_PAGES)):
            page = doc.load_page(index)
            rect = page.rect
            zoom = min(3.0, max(1.0, PDF_RENDER_LONG_SIDE / max(rect.width, rect.height)))
            pix = page.get_pixmap(matrix=pymupdf.Matrix(zoom, zoom), alpha=False)
            encoded = base64.b64encode(pix.tobytes("jpeg")).decode("ascii")
            pages.append(("image/jpeg", encoded))
            texts.append(page.get_text())
        return pages, doc.page_count, texts
    finally:
        doc.close()


def _sniff_mime(data: bytes) -> Optional[str]:
    """Detect the real document type from magic bytes.

    Browsers occasionally report an empty or wrong file.type (drag-drop from
    some sources, files without extensions), and a malformed data URL makes
    the serving endpoint reject the request with "Invalid base64 string".
    Trusting content instead of the client keeps the request well-formed.
    """
    if data.startswith(b"%PDF-"):
        return "application/pdf"
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if data.startswith(b"\xff\xd8"):
        return "image/jpeg"
    if data.startswith(b"RIFF") and data[8:12] == b"WEBP":
        return "image/webp"
    return None


def _prepare_document_images(
    mime_type: str, data_base64: str
) -> tuple[List[tuple[str, str]], List[str], Dict[str, Any]]:
    """Normalize an upload into a list of (mime_type, base64) page images.

    Images pass through untouched; PDFs are split into per-page renders.
    Returns (images, preparation_warnings, meta) where meta carries render
    timing and per-page text layers for live evidence verification.
    """
    warnings: List[str] = []
    data = base64.b64decode(data_base64)
    sniffed = _sniff_mime(data)

    if sniffed == "application/pdf" or mime_type == "application/pdf":
        t0 = time.perf_counter()
        images, total_pages, page_texts = _pdf_page_images(data)
        meta: Dict[str, Any] = {
            "renderMs": round((time.perf_counter() - t0) * 1000),
            "pageTexts": page_texts,
        }
        if total_pages > MAX_PDF_PAGES:
            warnings.append(
                f"PDF has {total_pages} pages; only the first {MAX_PDF_PAGES} were processed"
            )
        return images, warnings, meta

    if sniffed:
        return [(sniffed, data_base64)], warnings, {"pageTexts": [], "renderMs": 0}
    if mime_type.startswith("image/"):
        return [(mime_type, data_base64)], warnings, {"pageTexts": [], "renderMs": 0}
    raise ValueError(
        "Unsupported document type. Upload a PNG, JPEG, WebP image or a PDF."
    )


# ---------------------------------------------------------------------------
# Prompting
# ---------------------------------------------------------------------------

EXTRACTION_SYSTEM_PROMPT = """You are a precision data-extraction engine for CryoSync, a \
pharmaceutical cold-chain logistics platform. You read photos or scans of shipping documents \
and return structured JSON for a receiving intake form.

Rules:
- A document may be provided as several page images; read ALL pages in order before answering.
- Transcribe values EXACTLY as printed. Never invent or guess values.
- If a field is not present in the document, set its value to null with confidence 0.
- For each field include "confidence" between 0 and 1 reflecting legibility and certainty,
  and "evidence": the exact text snippet from the document the value came from.
- Numbers must be plain JSON numbers. Booleans must be true/false.
- Enum fields must use exactly one of the allowed option strings, or null.
- Respond with ONLY a JSON object, no markdown fences, no commentary.

Output shape:
{"documentType": "<packing_slip|shipping_label|bill_of_lading|certificate_of_analysis|other>",
 "fields": {"<key>": {"value": <value|null>, "confidence": <0..1>, "evidence": "<exact quote>"}}}

Target fields:
"""

VERIFICATION_SYSTEM_PROMPT = """You are a verification engine for CryoSync's precision \
extraction mode. You are given a document and a first-pass extraction result. Re-read the \
document carefully, field by field, and independently verify every value.

Precedence rules:
- If the document contains an amendment, corrigendum or notice stating that earlier \
figures are superseded or corrected, the LATEST statement wins. Never return a value \
that a later page has explicitly replaced.

For each field key in the input:
- If the first-pass value matches the document, set "agree": true and echo the value.
- If it differs, set "agree": false, provide the corrected "value" exactly as printed,
  lower "confidence", and explain briefly in "note".
- If the first pass returned null or a low-confidence value, search EVERY page for the \
field before concluding it is absent; report what you find.
- If the field is genuinely absent from every page, set "agree": false, "value": null,
  and note that it is absent.
- Include "confidence" (0..1) for your own reading of the field.

Respond with ONLY a JSON object of this shape, no fences, no commentary:
{"verdicts": {"<key>": {"agree": <bool>, "value": <value|null>, "confidence": <0..1>, "note": "<...>"}}}"""


def _document_content(
    images: List[tuple[str, str]], document_type: Optional[str]
) -> List[Dict[str, Any]]:
    text = "Extract the fields from this document now."
    if len(images) > 1:
        text += (
            f" The document has {len(images)} pages, provided in order."
            " Read EVERY page before answering - key fields such as line items,"
            " totals, lot counts, or compliance notes often appear on later pages."
            " A field is null only after no page contains it."
        )
    if document_type and document_type != "auto":
        text += f"\n\nThe document type is known to be: {document_type}."
    parts: List[Dict[str, Any]] = [{"type": "text", "text": text}]
    for mime, data in images:
        parts.append({"type": "image_url", "image_url": {"url": f"data:{mime};base64,{data}"}})
    return parts


def _verification_content(
    images: List[tuple[str, str]], first_pass: Dict[str, Any]
) -> List[Dict[str, Any]]:
    parts: List[Dict[str, Any]] = [
        {"type": "text", "text": json.dumps(first_pass, ensure_ascii=False)}
    ]
    for mime, data in images:
        parts.append({"type": "image_url", "image_url": {"url": f"data:{mime};base64,{data}"}})
    return parts


# ---------------------------------------------------------------------------
# Response parsing / normalization
# ---------------------------------------------------------------------------

def _balance_json(text: str) -> str:
    """Best-effort repair of truncated or brace-unbalanced model JSON.

    Vision models occasionally emit structurally glitched JSON (an unclosed
    string, a missing closing bracket, or an extra opening brace). Walk the
    text tracking string state and open containers, then close whatever is
    still open so json.loads gets a well-formed document.
    """
    stack: List[str] = []
    in_string = False
    escaped = False
    for ch in text:
        if in_string:
            if escaped:
                escaped = False
            elif ch == "\\":
                escaped = True
            elif ch == '"':
                in_string = False
            continue
        if ch == '"':
            in_string = True
        elif ch in "{[":
            stack.append(ch)
        elif ch in "}]":
            if stack:
                stack.pop()
    repaired = text
    if in_string:
        repaired += '"'
    for opener in reversed(stack):
        repaired += "}" if opener == "{" else "]"
    return repaired


def _unwrap_nested_value(entry: Any) -> Any:
    """Undo the 'doubly nested value' glitch.

    Some models emit {"carrier": {"value": {"value": ..., "confidence": ...}}}
    instead of {"carrier": {"value": ..., "confidence": ...}}. If the entry's
    value is itself a field-shaped object, hoist it up.
    """
    if not isinstance(entry, dict):
        return entry
    inner = entry.get("value")
    if isinstance(inner, dict) and "value" in inner:
        merged = dict(inner)
        for k in ("confidence", "evidence"):
            if merged.get(k) is None and entry.get(k) is not None:
                merged[k] = entry.get(k)
        return merged
    return entry


# Degenerate repetition glitch: models occasionally emit
# {"value": "value": "..."} - a key immediately followed by itself as a
# string. A well-formed document can never contain "k": "k": so rewriting
# it is always safe.
_DUPLICATED_KEY_RE = re.compile(r'"(\w+)"\s*:\s*"\1"\s*:')


def _parse_json_object(text: str) -> Dict[str, Any]:
    """Parse a JSON object out of a model response, tolerating code fences."""
    cleaned = text.strip()
    fence = re.search(r"```(?:json)?\s*(.*?)```", cleaned, re.DOTALL)
    if fence:
        cleaned = fence.group(1).strip()
    cleaned = _DUPLICATED_KEY_RE.sub(r'"\1":', cleaned)
    try:
        obj = json.loads(cleaned, strict=False)
        if isinstance(obj, dict):
            return obj
    except json.JSONDecodeError:
        pass
    # Fall back to the outermost balanced braces.
    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start != -1 and end > start:
        try:
            obj = json.loads(cleaned[start : end + 1], strict=False)
            if isinstance(obj, dict):
                return obj
        except json.JSONDecodeError:
            pass
    # Last resort: repair truncation / unbalanced brackets and retry.
    obj = json.loads(_balance_json(cleaned), strict=False)
    if isinstance(obj, dict):
        return obj
    raise ValueError("Model did not return valid JSON")


def _coerce_value(raw: Any, field: Dict[str, Any]) -> Any:
    ftype = field["type"]
    if raw is None:
        return None
    if ftype == "boolean":
        if isinstance(raw, bool):
            return raw
        text = str(raw).strip().lower()
        if text in ("true", "yes", "y", "1"):
            return True
        if text in ("false", "no", "n", "0"):
            return False
        return None
    if ftype == "number":
        if isinstance(raw, bool):
            return None
        if isinstance(raw, (int, float)):
            return raw
        digits = re.sub(r"[^0-9.\-]", "", str(raw))
        try:
            num = float(digits)
            return int(num) if num.is_integer() else num
        except ValueError:
            return None
    text = str(raw).strip()
    if not text or text.lower() in ("null", "none", "n/a", "-"):
        return None
    return text


def _normalize_enum(key: str, value: Any) -> tuple[Any, Optional[str]]:
    """Snap a value onto the allowed enum options. Returns (value, warning)."""
    options = _ENUM_LOOKUP.get(key)
    if not options or value is None or not isinstance(value, str):
        return value, None
    lowered = value.strip().lower().replace(" ", "_").replace("-", "_")
    for opt in options:
        if lowered == opt:
            return opt, None
    for opt in options:
        if lowered.startswith(opt) or opt.startswith(lowered):
            return opt, None
    aliases = {
        "temperatureRegime": {
            "refrigerated": "refrigerated_2_8",
            "frozen": "frozen_minus_20",
            "ultra_frozen": "ultra_frozen_minus_80",
            "cryogenic": "liquid_nitrogen",
            "ln2": "liquid_nitrogen",
            "room_temp": "ambient",
        },
        "category": {
            "cord_blood": "cord_blood_unit",
            "cbu": "cord_blood_unit",
            "banking": "hybrid_banking",
            "release": "cellular_therapy_release",
        },
        "condition": {"damange": "damaged"},
        "priority": {"urgent": "critical", "normal": "standard"},
    }
    for alias, opt in aliases.get(key, {}).items():
        if alias in lowered:
            return opt, None
    if key == "temperatureRegime":
        matched, _ = _match_temperature_range(lowered)
        if matched:
            return matched, None
    return value, f'"{value}" is not a valid option for {key}'


def _match_temperature_range(lowered: str) -> tuple[Optional[str], Optional[str]]:
    """Infer the regime from a stated storage range like '+2 to +8C' or '-80C'."""
    numbers = [float(n) for n in re.findall(r"-?\d+(?:\.\d+)?", lowered)]
    if numbers:
        low = min(numbers)
        if low <= -140 or "nitrogen" in lowered or "ln2" in lowered.replace(" ", ""):
            return "liquid_nitrogen", None
        if low <= -60:
            return "ultra_frozen_minus_80", None
        if low <= -15:
            return "frozen_minus_20", None
        if 0 <= low <= 15:
            return "refrigerated_2_8", None
        if low > 15:
            return "ambient", None
    return None, None


def _clamp_confidence(value: Any) -> float:
    try:
        conf = float(value)
    except (TypeError, ValueError):
        return 0.0
    return max(0.0, min(1.0, conf))


# ---------------------------------------------------------------------------
# Extraction passes
# ---------------------------------------------------------------------------

async def _run_passes(
    client: OpenAI,
    model: str,
    images: List[tuple[str, str]],
    precision_mode: bool,
    document_type: Optional[str],
    page_texts: Optional[List[str]] = None,
) -> Dict[str, Any]:
    system = EXTRACTION_SYSTEM_PROMPT + "\n".join(_schema_prompt_lines())
    user_content = _document_content(images, document_type)

    def _call(messages: List[Dict[str, Any]], temperature: float) -> str:
        t0 = time.perf_counter()
        content = _complete(client, model, messages, temperature)
        nonlocal model_ms
        model_ms += round((time.perf_counter() - t0) * 1000)
        return content

    model_ms = 0

    async def _call_json(messages: List[Dict[str, Any]], temperature: float) -> Dict[str, Any]:
        """Call the model and parse JSON, retrying once on unparseable output.

        Vision models occasionally emit structurally glitched JSON; a second
        sample plus the tolerant parser makes that a non-event.
        """
        raw = await asyncio.to_thread(_call, messages, temperature)
        try:
            return _parse_json_object(raw)
        except (ValueError, json.JSONDecodeError):
            raw_retry = await asyncio.to_thread(_call, messages, temperature)
            return _parse_json_object(raw_retry)

    messages = [
        {"role": "system", "content": system},
        {"role": "user", "content": user_content},
    ]
    # Precision mode samples greedily (temperature 0); standard mode allows a
    # little latitude for messy handwriting and partial legibility. Multi-page
    # documents always sample greedily - at higher temperatures the model has
    # been observed to read only the first page and null out later-page fields.
    greedy = precision_mode or len(images) > 1
    first_pass = await _call_json(messages, 0.0 if greedy else 0.1)

    warnings: List[str] = []
    raw_fields = first_pass.get("fields") or {}
    verdicts: Optional[Dict[str, Any]] = None

    if precision_mode:
        verify_messages = [
            {"role": "system", "content": VERIFICATION_SYSTEM_PROMPT},
            {"role": "user", "content": _verification_content(images, first_pass)},
        ]
        verdicts = (await _call_json(verify_messages, 0.0)).get("verdicts") or None

    fields_out: List[Dict[str, Any]] = []
    confidences: List[float] = []
    corrections = 0

    for spec in FIELD_SCHEMA:
        key = spec["key"]
        entry = _unwrap_nested_value(raw_fields.get(key) or {})
        value = _coerce_value(entry.get("value"), spec)
        confidence = _clamp_confidence(entry.get("confidence"))
        evidence = entry.get("evidence") or None
        verified = False

        if isinstance(value, str):
            value, enum_warning = _normalize_enum(key, value)
            if enum_warning:
                warnings.append(f"{spec['label']}: {enum_warning}")
                confidence = min(confidence, 0.6)

        if verdicts is not None and key in verdicts:
            v = _unwrap_nested_value(verdicts.get(key) or {})
            v_value = _coerce_value(v.get("value"), spec)
            v_confidence = _clamp_confidence(v.get("confidence"))
            verified = True
            if v.get("agree") is True or v_value == value:
                confidence = max(confidence, v_confidence) if value is not None else confidence
            else:
                corrections += 1
                warnings.append(
                    f"{spec['label']}: corrected during verification"
                    + (f" ({v.get('note')})" if v.get("note") else "")
                )
                value = v_value
                confidence = min(confidence, v_confidence) * 0.9

        needs_review = value is not None and confidence < REVIEW_THRESHOLD
        if value is not None:
            confidences.append(confidence)

        fields_out.append({
            "key": key,
            "label": spec["label"],
            "section": spec["section"],
            "type": spec["type"],
            "options": spec.get("options"),
            "value": value,
            "confidence": round(confidence, 2),
            "evidence": evidence,
            "needsReview": needs_review,
            "verified": verified,
        })

    overall = round(sum(confidences) / len(confidences), 2) if confidences else 0.0

    # Live run metrics - measured from THIS extraction, not static config.
    # Evidence quotes are verified against the document's own text layer
    # (PDFs only; image scans have no text layer to check against).
    texts = [_norm_for_match(t) for t in (page_texts or [])]
    full_text = " ".join(t for t in texts if t)
    full_alnum = re.sub(r"\W", "", full_text)
    evidence_checked = evidence_verified = fields_found = 0
    field_pages: Dict[str, int] = {}
    buckets = {"high": 0, "medium": 0, "low": 0}

    for f in fields_out:
        if f["value"] is None:
            continue
        fields_found += 1
        if f["confidence"] >= 0.85:
            buckets["high"] += 1
        elif f["confidence"] >= 0.7:
            buckets["medium"] += 1
        else:
            buckets["low"] += 1
        ev = _norm_for_match(f.get("evidence") or "")
        if not ev or not full_text:
            continue
        evidence_checked += 1
        ev_alnum = re.sub(r"\W", "", ev)
        if not (ev in full_text or (ev_alnum and ev_alnum in full_alnum)):
            continue
        evidence_verified += 1
        for i, pt in enumerate(texts):
            pt_alnum = re.sub(r"\W", "", pt)
            if (ev in pt) or (pt and ev_alnum and ev_alnum in pt_alnum):
                field_pages[f["key"]] = i + 1
                break

    return {
        "documentType": first_pass.get("documentType") or document_type or "unknown",
        "mode": "precision" if precision_mode else "standard",
        "model": model,
        "pages": len(images),
        "overallConfidence": overall,
        "fields": fields_out,
        "warnings": warnings,
        "metrics": {
            "modelMs": model_ms,
            "pages": len(images),
            "fieldsTotal": len(FIELD_SCHEMA),
            "fieldsFound": fields_found,
            "needsReview": sum(1 for f in fields_out if f["needsReview"]),
            "verifiedFields": sum(
                1 for f in fields_out if f["verified"] and f["value"] is not None
            ),
            "corrections": corrections,
            "confidenceBuckets": buckets,
            "evidenceChecked": evidence_checked,
            "evidenceVerified": evidence_verified,
            "fieldPages": field_pages,
        },
    }


async def extract_document_fields(
    data_base64: str,
    mime_type: str,
    precision_mode: bool = False,
    document_type: Optional[str] = None,
) -> Dict[str, Any]:
    """Run AI extraction over a document and return normalized form fields.

    Single- and multi-page PDFs are accepted: every page is rasterized and
    sent to the vision model as an ordered set of images.
    """
    decoded_size = len(data_base64) * 3 // 4
    if decoded_size > MAX_DOCUMENT_BYTES:
        raise ValueError("Document too large (max 12 MB)")

    t0 = time.perf_counter()
    images, prep_warnings, meta = await asyncio.to_thread(
        _prepare_document_images, mime_type, data_base64
    )

    client = _get_client()
    model = DEFAULT_VISION_ENDPOINT

    try:
        result = await _run_passes(
            client, model, images, precision_mode, document_type,
            page_texts=meta.get("pageTexts") or [],
        )
        result["warnings"] = prep_warnings + result["warnings"]
        result["metrics"]["elapsedMs"] = round((time.perf_counter() - t0) * 1000)
        result["metrics"]["renderMs"] = meta.get("renderMs", 0)
        return result
    except RuntimeError:
        raise
