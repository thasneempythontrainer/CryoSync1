# AI Extract - Full Quality Evaluation

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
| Mean field accuracy (ground-truthed) | 94% | 94% |
| Mean latency per document | 9.8s | 17.0s |
| Model calls per document | 1 | 2 |

## 1. Accuracy for business-critical fields (Standard mode, all 17 docs)

| Field | Ground-truthed docs | Accuracy |
|---|---|---|
| `shipmentNumber` | 13 | 92% |
| `carrier` | 13 | 92% |
| `trackingNumber` | 9 | 89% |
| `billOfLading` | 9 | 78% |
| `temperatureRegime` | 17 | 94% |
| `dangerousGoods` | 15 | 93% |
| `unNumber` | 11 | 100% |
| `productCount` | 7 | 100% |
| `lotCount` | 7 | 86% |
| `totalValue` | 11 | 91% |
| `sealNumber` | 8 | 100% |
| `priority` | 6 | 100% |

### Observed misses (Standard mode)

| Field | Document | Expected | Extracted |
|---|---|---|---|
| `carrier` | 06-shipping-label-ln2-critical.png | Cryoport | (null) |
| `notes` | 07-packing-slip-damaged.png | crushed | Driver signature obtained with damage remark. Photos taken by receiving clerk. Inner packs appear intact, QA inspection due. |
| `billOfLading` | 08-bill-of-lading-ground.png | BOL-XPO-77120 | BOL-XP-77120 |
| `destination` | 13-coa-cord-blood-multipage.pdf | Boston MA, USA | (null) |
| `shipmentNumber` | 15-packing-slip-lowres-blurry.jpg | SHP-2026-1441 | SHP 020 1411 |
| `trackingNumber` | 15-packing-slip-lowres-blurry.jpg | 7942 3381 0077 | 7672 3481 0777 |
| `billOfLading` | 15-packing-slip-lowres-blurry.jpg | BL-FX-556999 | BL 452 6659 |
| `purchaseOrderNumber` | 15-packing-slip-lowres-blurry.jpg | PO-88477 | PO# 93611 |
| `temperatureRegime` | 15-packing-slip-lowres-blurry.jpg | refrigerated_2_8 | frozen_minus_20 |
| `category` | 15-packing-slip-lowres-blurry.jpg | cord_blood_unit | (null) |
| `lotCount` | 15-packing-slip-lowres-blurry.jpg | 3 | (null) |
| `totalValue` | 15-packing-slip-lowres-blurry.jpg | 36450 | 40000 |
| `dangerousGoods` | 15-packing-slip-lowres-blurry.jpg | False | (null) |

## 2. Performance across templates and scan qualities

| Document group | Docs | Mean field accuracy |
|---|---|---|
| clean scan | 9 | 97% |
| degraded scan | 2 | 68% |
| dense small print | 1 | 100% |
| multi-page PDF | 3 | 96% |
| noisy / rotated scan | 1 | 100% |
| stamp overlay | 1 | 100% |

## 3. Cross-page and cross-clause reasoning

Multi-page PDF 11 spreads decision-critical fields across pages 1-3:

| Field | Found | Correctly valued |
|---|---|---|
| productCount (page 2) | found | correct |
| lotCount (page 2) | found | correct |
| totalValue (page 2) | found | correct |

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
| Standard | 51200 | CLX-SEAL-2001 | yes |
| Precision | 48600.0 | CLX-SEAL-1044 | no |

## 6. Citation accuracy and source traceability

Every extracted value carries an `evidence` quote. For the three generated
PDFs the quotes were checked verbatim against the documents' text layer:

**34/35 evidence quotes verified (97%)**

## 7. Confidence-score calibration (Standard mode)

Stated confidence vs observed correctness, bucketed:

| Stated confidence | Fields | Observed accuracy |
|---|---|---|
| 0.9-1.0 | 182 | 96% |

## 8. Processing time and cost per document

- Measured wall-clock: Standard 7.0-14.6s, Precision 14.5-22.5s per document.
- Cost driver is model calls: 1 (Standard) vs 2 (Precision) vision completions
  per document, plus one extra completion per PDF page-set size (pages are
  billed as input images). On Databricks Model Serving, cost follows your
  provisioned throughput or token consumption - no per-document SaaS fee.

## 9. Exception handling and malformed files

| Input | Outcome | Error surfaced |
|---|---|---|
| Plain text file uploaded as .pdf | rejected | Could not read PDF: Failed to open stream |
| Truncated PDF (valid header, body cut) | rejected | Could not read PDF: Failed to open stream |
| Password-protected PDF | rejected | PDF is password-protected; remove the password and retry |
| Random binary bytes, unknown type | rejected | Unsupported document type. Upload a PNG, JPEG, WebP image or a PDF. |

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
