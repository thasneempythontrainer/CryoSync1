"""Offline regression tests for the AI document extraction logic.

Run from the project root:  python backend/test_extract.py
No Databricks credentials required - the model client is faked.
"""

import asyncio
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import extract  # noqa: E402


class FakeMessage:
    def __init__(self, content):
        self.content = content


class FakeChoice:
    def __init__(self, content):
        self.message = FakeMessage(content)


class FakeResponse:
    def __init__(self, content):
        self.choices = [FakeChoice(content)]


FIRST_PASS = {
    "documentType": "packing_slip",
    "fields": {
        "shipmentNumber": {"value": "SHP-2024-0091", "confidence": 0.95, "evidence": "SHP-2024-0091"},
        "carrier": {"value": "World Courier", "confidence": 0.9, "evidence": "World Courier"},
        "temperatureRegime": {"value": "+2 to +8C", "confidence": 0.8},
        "productCount": {"value": "24", "confidence": 0.85},
        "dangerousGoods": {"value": "yes", "confidence": 0.75},
        "totalValue": {"value": None, "confidence": 0.0},
    },
}

VERIFY_PASS = {
    "verdicts": {
        "shipmentNumber": {"agree": True, "value": "SHP-2024-0091", "confidence": 0.97},
        "carrier": {"agree": False, "value": "World Courier LLC", "confidence": 0.92, "note": "suffix visible"},
        "temperatureRegime": {"agree": True, "value": "+2 to +8C", "confidence": 0.88},
        "productCount": {"agree": True, "value": 24, "confidence": 0.9},
        "dangerousGoods": {"agree": False, "value": False, "confidence": 0.8, "note": "no DG marking"},
    }
}


class FakeClient:
    api_key = "test"

    def __init__(self):
        self.calls = []

    @property
    def chat(self):
        return self

    @property
    def completions(self):
        return self

    def create(self, **kwargs):
        self.calls.append(kwargs)
        payload = FIRST_PASS if len(self.calls) == 1 else VERIFY_PASS
        return FakeResponse(json.dumps(payload))


def run(precision):
    fake = FakeClient()
    orig_client = extract._client

    orig_get_client = extract._get_client
    extract._get_client = lambda: fake
    extract._client = fake
    try:
        result = asyncio.run(
            extract.extract_document_fields("aGVsbG8=", "image/png", precision_mode=precision)
        )
    finally:
        extract._client = orig_client
        extract._get_client = orig_get_client
    return result, fake.calls


def test_json_parsing():
    obj = extract._parse_json_object(
        '```json\n{"fields": {"a": {"value": "x"}}}\n```'
    )
    assert obj["fields"]["a"]["value"] == "x"


# Real-world model glitch: the whole carrier entry got nested inside an extra
# {"value": ...} object, leaving the document's braces unbalanced.
GLITCHED_OUTPUT = (
    '{"documentType": "packing_slip", "fields": {'
    '"shipmentNumber": {"value": "SHP-2026-1201", "confidence": 1, "evidence": "SHIPMENT NUMBER\\nSHP-2026-1201"}, '
    '"carrier": {"value": {"value": "FedEx Priority", "confidence": 1, "evidence": "CARRIER\\nFedEx Priority"}, '
    '"trackingNumber": {"value": "7942 3381 0107", "confidence": 1, "evidence": "TRACKING NUMBER"}'
    '}'
)


def test_json_parsing_repairs_glitched_output():
    obj = extract._parse_json_object(GLITCHED_OUTPUT)
    assert obj["documentType"] == "packing_slip"
    assert obj["fields"]["carrier"]["value"]["value"] == "FedEx Priority"
    # The nested entry is unwrapped for field processing.
    entry = extract._unwrap_nested_value(obj["fields"]["carrier"])
    assert entry["value"] == "FedEx Priority"
    assert entry["confidence"] == 1


def test_json_parsing_repairs_truncated_output():
    truncated = '{"documentType": "packing_slip", "fields": {"carrier": {"value": "FedEx'
    obj = extract._parse_json_object(truncated)
    assert obj["fields"]["carrier"]["value"] == "FedEx"


def test_json_parsing_repairs_duplicated_key():
    # Observed live: {"value": "value": "SHP-..."} - key repeated as a string.
    glitched = (
        '{"documentType": "packing_slip", "fields": {'
        '"shipmentNumber": {"value": "value": "SHP-2026-1201", "confidence": 1.0, '
        '"evidence": "SHIPMENT NUMBER SHP-2026-1201"}}}'
    )
    obj = extract._parse_json_object(glitched)
    assert obj["fields"]["shipmentNumber"]["value"] == "SHP-2026-1201"


def test_mime_sniffing():
    import base64 as b64

    import pymupdf

    doc = pymupdf.open()
    page = doc.new_page()
    page.insert_text((72, 72), "Sniff test", fontsize=12)
    pdf_b64 = b64.b64encode(doc.tobytes()).decode()
    png_b64 = b64.b64encode(b"\x89PNG\r\n\x1a\nrest").decode()

    # A PDF mislabeled with an empty or image mime type still rasterizes.
    images, warnings, meta = extract._prepare_document_images("", pdf_b64)
    assert len(images) == 1
    assert images[0][0] == "image/jpeg"
    assert warnings == []
    assert meta["pageTexts"] and "Sniff test" in meta["pageTexts"][0]
    images, _, _ = extract._prepare_document_images("image/png", pdf_b64)
    assert len(images) == 1

    # An image passes through with the sniffed (authoritative) mime type.
    images, _, meta = extract._prepare_document_images("", png_b64)
    assert images == [("image/png", png_b64)]
    assert meta["pageTexts"] == []

    # Garbage with no recognizable content is rejected clearly.
    try:
        extract._prepare_document_images("", b64.b64encode(b"not a document").decode())
        raised = False
    except ValueError:
        raised = True
    assert raised


def test_normalization():
    assert extract._normalize_enum("temperatureRegime", "Refrigerated 2-8C")[0] == "refrigerated_2_8"
    assert extract._normalize_enum("temperatureRegime", "-20C frozen")[0] == "frozen_minus_20"
    assert extract._normalize_enum("temperatureRegime", "LN2 vapor -150C")[0] == "liquid_nitrogen"
    assert extract._normalize_enum("priority", "URGENT")[0] == "critical"
    assert extract._coerce_value("12 units", {"type": "number"}) == 12
    assert extract._coerce_value("$1,250.50", {"type": "number"}) == 1250.5
    assert extract._coerce_value("YES", {"type": "boolean"}) is True
    assert extract._coerce_value("N/A", {"type": "string"}) is None


def test_standard_mode():
    result, calls = run(False)
    assert len(calls) == 1
    by_key = {f["key"]: f for f in result["fields"]}
    assert by_key["carrier"]["value"] == "World Courier"
    assert by_key["temperatureRegime"]["value"] == "refrigerated_2_8"
    assert by_key["productCount"]["value"] == 24
    assert by_key["dangerousGoods"]["value"] is True
    assert by_key["totalValue"]["value"] is None
    assert not any(f["verified"] for f in result["fields"])
    assert result["mode"] == "standard"


def test_precision_mode():
    result, calls = run(True)
    assert len(calls) == 2
    by_key = {f["key"]: f for f in result["fields"]}
    assert by_key["carrier"]["value"] == "World Courier LLC"
    assert by_key["carrier"]["verified"]
    assert abs(by_key["carrier"]["confidence"] - 0.81) < 1e-9
    assert by_key["shipmentNumber"]["confidence"] == 0.97
    assert by_key["dangerousGoods"]["value"] is False
    assert by_key["dangerousGoods"]["needsReview"]
    assert any("corrected during verification" in w for w in result["warnings"])
    assert result["mode"] == "precision"


def test_live_metrics():
    # _run_passes computes per-run metrics: evidence quotes are verified
    # against the document's own text layer and fields are attributed to
    # the page their evidence appears on.
    fake = FakeClient()
    page1 = "SHIPMENT NUMBER\nSHP-2024-0091\nCARRIER\nWorld Courier"
    page2 = "TOTAL VALUE\n$1,250.50\nDANGEROUS GOODS: YES"
    result = asyncio.run(
        extract._run_passes(
            fake,
            "test-model",
            [("image/png", "aGVsbG8=")],
            precision_mode=False,
            document_type=None,
            page_texts=[page1, page2],
        )
    )
    m = result["metrics"]
    assert m["pages"] == 1
    assert m["fieldsTotal"] == len(extract.FIELD_SCHEMA)
    assert m["fieldsFound"] == 5  # totalValue is null
    assert m["modelMs"] >= 0
    buckets = m["confidenceBuckets"]
    assert buckets["high"] == 3  # 0.95, 0.9, 0.85
    assert buckets["medium"] == 2  # 0.8, 0.75
    assert buckets["low"] == 0
    # shipmentNumber + carrier have evidence that exists in the text layer;
    # the other three fields carry no evidence, so they aren't checked.
    assert m["evidenceChecked"] == 2
    assert m["evidenceVerified"] == 2
    assert m["fieldPages"] == {"shipmentNumber": 1, "carrier": 1}

    # Evidence that does NOT appear in the document is not counted verified.
    bad = dict(FIRST_PASS)
    bad["fields"] = {
        "shipmentNumber": {
            "value": "SHP-9999",
            "confidence": 0.9,
            "evidence": "This quote is nowhere in the document",
        }
    }

    class BadClient(FakeClient):
        def create(self, **kwargs):
            self.calls.append(kwargs)
            return FakeResponse(json.dumps(bad))

    result2 = asyncio.run(
        extract._run_passes(
            BadClient(),
            "test-model",
            [("image/png", "aGVsbG8=")],
            precision_mode=False,
            document_type=None,
            page_texts=[page1],
        )
    )
    m2 = result2["metrics"]
    assert m2["evidenceChecked"] == 1
    assert m2["evidenceVerified"] == 0
    assert m2["fieldPages"] == {}


if __name__ == "__main__":
    test_json_parsing()
    test_json_parsing_repairs_glitched_output()
    test_json_parsing_repairs_truncated_output()
    test_json_parsing_repairs_duplicated_key()
    test_mime_sniffing()
    test_normalization()
    test_standard_mode()
    test_precision_mode()
    test_live_metrics()
    print("All extraction tests passed")
