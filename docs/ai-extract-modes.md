# AI Extract — Standard vs Precision Mode

A reference comparison of the two extraction modes in CryoSync's AI Extract
feature (`/extract`), for documentation and blog use.

AI Extract turns shipping documents — packing slips, shipping labels, bills of
lading, certificates of analysis — into structured, review-ready form data
using a vision-capable Databricks Model Serving endpoint. Every extracted value
carries a confidence score, the exact evidence quote it came from, and a flag
when it needs human review.

---

## Mode comparison at a glance

| Dimension | Standard Mode | Precision Mode |
|---|---|---|
| **How it works** | One extraction pass over the document | Extraction pass + an independent second pass that re-reads the document and verifies every non-null field |
| **Model calls per document** | 1 | 2 |
| **Sampling temperature** | 0.1 — slight latitude for messy handwriting and partial legibility | 0.0 (greedy, deterministic) on both passes |
| **Relative latency** | ~1x (baseline) | ~2x |
| **Value correction** | None — the first answer stands | Disagreements are auto-corrected; confidence is penalized (×0.9) and a warning is recorded ("corrected during verification") |
| **Confidence scoring** | Single-pass confidence only | On agreement, confidence is raised to the max of both passes |
| **`verified` flag** | Never set | Set on every field the second pass confirmed |
| **Review flagging** | `needsReview` when confidence < 0.7 | Same threshold, but corrections push borderline fields into review honestly instead of hiding them |
| **UI indication** | Confidence badge only | Blue "Precision" badge + green shield icon on verified fields |
| **Warnings panel** | Enum normalization issues only | Adds verification corrections with the verifier's note |
| **Best for** | Quick triage, clean digital documents, high-volume intake | Regulated or high-value shipments (cell & gene therapy), poor scans, results a human will sign off on |

## How each mode works

### Standard mode

1. The document (image, or every page of a PDF rasterized server-side) is sent
   to the vision model with the field schema.
2. The model returns one JSON object: `documentType` plus 20 fields, each with
   `value`, `confidence`, and `evidence`.
3. Values are normalized (numbers stripped of currency symbols, booleans from
   yes/no, enums snapped onto allowed options such as `"+2 to +8C" →
   refrigerated_2_8`) and returned to the UI.

One model call, roughly half the latency of Precision mode.

### Precision mode

1. Pass 1 runs exactly like Standard mode (but at temperature 0).
2. Pass 2 independently re-reads the same document along with the first-pass
   JSON and returns a verdict per field: agree, disagree (with correction), or
   absent.
3. Verdicts are reconciled:
   - **Agree** → confidence raised to the max of both passes; field marked
     `verified`.
   - **Disagree** → value replaced with the corrected reading, confidence
     lowered (min of both × 0.9), warning added.
4. Fields still below 0.7 confidence are flagged `needsReview`.

Two model calls, roughly twice the latency — in exchange for self-checked
output.

## Shared capabilities (both modes)

| Capability | Detail |
|---|---|
| Accepted documents | PNG, JPEG, WebP images; single- or multi-page PDFs (up to 20 pages; each page rasterized server-side and read in order) |
| Fields extracted | 20 fields across four sections: Shipment Details, Parties & Route, Product, Compliance |
| Enum intelligence | Free-text values snap onto allowed options via aliases and range matching (e.g. `-80C` → `ultra_frozen_minus_80`, LN2 vapor → `liquid_nitrogen`) |
| Evidence quotes | Every non-null value carries the exact text snippet it was transcribed from |
| Confidence badges | Green ≥ 85%, amber ≥ 70%, red below; "not found" shown explicitly |
| Robustness | Content-type sniffing (magic bytes), tolerant JSON parsing with repair + retry, automatic endpoint failover |
| Human-in-the-loop | All values are editable before applying; low-confidence fields are visually flagged |
| Downstream handoff | "Use in Receiving" prefills the New Intake form, showing an "AI extraction applied" toast |

## Multi-page PDF handling

- PDFs are split server-side into per-page images (rendered at ~1800 px long
  side) and sent to the model as ordered page images.
- Multi-page requests always sample greedily (temperature 0) — higher
  temperatures were observed to make the model read only the first page.
- Documents over 20 pages are truncated with an explicit warning.
- Password-protected or unreadable PDFs fail fast with clear errors.

## Suggested blog framing

Frame the two modes as **speed vs assurance**:

> Standard mode answers *"what does the document say?"* — Precision mode
> answers *"can I trust it enough to act on it?"*

The verification pass makes trust visible per field rather than per document:
green shields mark what was double-checked, amber warnings mark what was
corrected, and red flags mark what still needs a human eye. For cold-chain
logistics — where a misread lot number or temperature regime has real
consequences — that distinction is the product.

### Demo flow idea for the post

1. Drag a packing slip PNG into `/extract`, Standard mode — show instant
   extraction with confidence badges.
2. Re-run the same document in Precision mode — show the "Precision" badge,
   shield icons, and any corrections in the warnings panel.
3. Drop the 3-page multi-page PDF (`11-packing-slip-refrigerated-multipage.pdf`)
   — show fields recovered from page 2 (line items, totals).
4. Click **Use in Receiving** — show the intake form prefilled.
5. Compare against ground truth in `test-documents/EXPECTED-VALUES.md`.
