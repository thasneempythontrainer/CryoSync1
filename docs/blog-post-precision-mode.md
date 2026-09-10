# Same Accuracy, One-Sixth the Review Queue: Why We Are Switching On Precision Mode

*A hands-on account from our document-intelligence work with Databricks vision models - seventeen ground-truthed documents, two extraction modes, and an unexpectedly clear answer.*

## Documents where a wrong digit is expensive

We build document intelligence for pharmaceutical cold-chain logistics. Packing slips, shipping labels, bills of lading and certificates of analysis arrive for every shipment of cord blood units and temperature-controlled therapies - and every one of them must become structured, governed data. The fields that matter most are unforgiving: tracking and seal numbers, UN dangerous-goods codes, temperature regimes, declared values. A misread digit does not just dirty a database; it delays a shipment or triggers a compliance incident.

So when Databricks introduced Precision Mode for AI Extract - a mode that runs a second, independent extraction pass and reconciles the results field by field - we did what we always do before recommending anything to a client: we measured it on our own documents.

## The experiment

Seventeen documents with hand-transcribed ground truth: nine clean scans across four templates, one noisy rotated scan, three multi-page PDFs whose totals only exist if you aggregate page two, and four adversarial inputs we generated ourselves - a 420-pixel blurry JPEG, a faded thermal label skewed seven degrees, a bill of lading set in 6.5-point type behind an eight-lot manifest table, and a certificate stamped diagonally across its data block.

Scoring was strict where it matters. ID-like fields had to match ground truth exactly after normalization; a tracking number off by one digit scored zero, because that is precisely how it fails in production. Both modes ran against live vision endpoints.

## What precision mode actually delivered

| What we measured | Single pass | With precision pass |
|---|---|---|
| Field accuracy (187 ground-truth fields) | 94% | 94% |
| Processing time per document | 9.8s | 17.0s |
| Fields flagged for human review | **6** | **1** |
| Corrections caught and logged for operators | 0 | **18** |
| Evidence quotes verified verbatim | 34/35 | 34/35 |

The headline accuracy tied at 94%. Read that row, then look at the next three - because they are where the value lives.

Precision mode cut fields needing human review from six to one. It caught eighteen discrepancies between its two passes and surfaced every one of them as a logged, human-readable warning instead of silently picking a winner. And when both independent reads agreed, operators could trust the value without squinting at the source scan. Accuracy stayed level while the *review queue collapsed by 83%* - and in an intake workflow, the review queue is the cost.

We also stress-tested the promises that matter for regulated workflows. Every extracted value carries an evidence quote; thirty-four of thirty-five quotes appeared verbatim in the documents' own text layer. Confidence scores proved calibrated: values stated at 0.9+ were 95.6% correct in practice, which means automation thresholds can be set on real numbers rather than hope.

## The miss that taught us the most

One result deserves honesty. On our amendment test - page one declaring USD 48,600, superseded by page three at USD 51,200 with a new seal number - the single pass picked up the correction while the verification pass anchored on the original figures. A second reader can entrench a first impression as easily as fix it.

We read this as a design instruction, not a disqualification: verification passes need explicit conflict-resolution instructions, and documents with amendment clauses should always route to human review. Precision mode did not hide the failure - its telemetry made it visible immediately, per document, per field.

## Our routing rule

Run single-pass extraction by default. Switch on precision mode when the document class is new, scan quality is questionable, or the field is expensive enough that seventeen extra seconds vanish against the cost of a wrong seal number. In practice, that means high-value shipments, compliance-critical documents and anything a customer will later audit get the double read - everything else stays fast and cheap.

The enterprise question is no longer whether AI can read a PDF. It is whether you can trace, trust and act on what it extracts. On our measurements, precision mode moves that answer firmly toward yes.
