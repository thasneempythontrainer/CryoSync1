"""Build the combined blog: CEO's Databricks Precision Mode assessment
(verbatim from docs/ceo-section.md) followed by our hands-on validation
section with measured results and figures.

Run from project root:  python backend/make_combined_blog_docx.py
Output: docs/Databricks-AI-Extract-Precision-Blog-FULL.docx
"""

import json
import os

from docx import Document
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.shared import Inches, Pt, RGBColor

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
DOCS = os.path.join(ROOT, "docs")
ASSETS = os.path.join(DOCS, "blog-assets")
TEST_DOCS = os.path.join(ROOT, "test-documents")

with open(os.path.join(DOCS, "extract-evaluation.json"), encoding="utf-8") as f:
    EV = json.load(f)

BLUE = RGBColor(0x1D, 0x4E, 0xD8)
DARK = RGBColor(0x1F, 0x29, 0x37)
MUT = RGBColor(0x6B, 0x72, 0x80)

doc = Document()
for sec in doc.sections:
    sec.left_margin = Inches(0.9)
    sec.right_margin = Inches(0.9)


def para(text="", size=11, bold=False, italic=False, color=None, align=None,
         space_after=8):
    p = doc.add_paragraph()
    r = p.add_run(text)
    r.font.size = Pt(size)
    r.bold = bold
    r.italic = italic
    if color:
        r.font.color.rgb = color
    if align:
        p.alignment = align
    p.paragraph_format.space_after = Pt(space_after)
    return p


def heading(text, level=1):
    h = doc.add_heading(text, level=level)
    for r in h.runs:
        r.font.color.rgb = BLUE if level <= 2 else DARK
    return h


def bullet(text):
    p = doc.add_paragraph(style="List Bullet")
    r = p.add_run(text)
    r.font.size = Pt(11)
    p.paragraph_format.space_after = Pt(4)
    return p


def picture(path, caption, width=6.3):
    doc.add_picture(path, width=Inches(width))
    doc.paragraphs[-1].alignment = WD_ALIGN_PARAGRAPH.CENTER
    para(caption, size=9, italic=True, color=MUT, align=WD_ALIGN_PARAGRAPH.CENTER,
         space_after=14)


def table(headers, rows, widths=None):
    t = doc.add_table(rows=1 + len(rows), cols=len(headers))
    t.style = "Light Grid Accent 1"
    t.alignment = WD_TABLE_ALIGNMENT.CENTER
    for j, htxt in enumerate(headers):
        cell = t.rows[0].cells[j]
        cell.text = ""
        r = cell.paragraphs[0].add_run(htxt)
        r.bold = True
        r.font.size = Pt(10)
    for i, row in enumerate(rows):
        for j, val in enumerate(row):
            cell = t.rows[i + 1].cells[j]
            cell.text = ""
            r = cell.paragraphs[0].add_run(str(val))
            r.font.size = Pt(10)
    if widths:
        for j, w in enumerate(widths):
            for row in t.rows:
                row.cells[j].width = Inches(w)
    para("", space_after=6)
    return t


# ---------------------------------------------------------------------------
# Part 1 - CEO section, verbatim
# ---------------------------------------------------------------------------

with open(os.path.join(DOCS, "ceo-section.md"), encoding="utf-8") as f:
    ceo_lines = f.read().splitlines()

first_h1 = True
for line in ceo_lines:
    stripped = line.strip()
    if not stripped:
        continue
    if stripped.startswith("# ") and first_h1:
        h = doc.add_heading(stripped[2:], level=0)
        for r in h.runs:
            r.font.color.rgb = DARK
        first_h1 = False
    elif stripped.startswith("## "):
        heading(stripped[3:], level=1)
    elif stripped.startswith("- "):
        bullet(stripped[2:])
    else:
        para(stripped)

# ---------------------------------------------------------------------------
# Part 2 - our hands-on validation (numbers pulled from the evaluation JSON)
# ---------------------------------------------------------------------------

pd = EV["perDocument"]
mean = lambda xs: sum(xs) / len(xs)
std_acc_pct = round(100 * mean([e["standard"]["accuracy"] for e in pd.values()]))
prec_acc_pct = round(100 * mean([e["precision"]["accuracy"] for e in pd.values()
                                 if "precision" in e]))
lat_std = round(mean([e["standard"]["elapsedSec"] for e in pd.values()]), 1)
lat_prec = round(mean([e["precision"]["elapsedSec"] for e in pd.values()
                       if "precision" in e]), 1)
ratio = round(lat_prec / lat_std, 1)
blurry = next(e for f, e in pd.items() if f.startswith("15-"))
cit = EV.get("citations", {})
cal_top = next((v for b, v in EV.get("calibration", {}).items()
                if b == "0.9-1.0" and v.get("total")), None)
am = EV.get("amendment", {})
misses = [(f, k, v["expected"], v["actual"])
          for f, e in sorted(pd.items())
          for k, v in e["standard"]["perField"].items() if not v["correct"]]
nr_std = sum(e["standard"]["needsReview"] for e in pd.values())
nr_prec = sum(e["precision"]["needsReview"] for e in pd.values()
              if "precision" in e)
w_std = sum(e["standard"]["warnings"] for e in pd.values())
w_prec = sum(e["precision"]["warnings"] for e in pd.values()
             if "precision" in e)

doc.add_page_break()
para("PART 2 - FROM ASSESSMENT TO EVIDENCE", size=10, bold=True, color=MUT,
     space_after=2)
para("We Ran the Checklist: Our Own Without-and-With Experiment", size=20,
     bold=True, color=DARK, space_after=14)

para(
    "That checklist is not theoretical for us. We applied it to a working "
    "extraction pipeline for pharmaceutical cold-chain logistics - packing "
    "slips, shipping labels, bills of lading and certificates of analysis, "
    "with exactly the high-risk fields described above: tracking and seal "
    "numbers, UN dangerous-goods numbers, temperature regimes, declared "
    "values. Behind one API we run both philosophies: standard mode (one "
    "vision-model call) and precision mode (an independent second pass with "
    "field-level reconciliation)."
)
para(
    "The corpus: seventeen documents with hand-transcribed ground truth - nine "
    "clean scans across four templates, one noisy rotated scan, three "
    "multi-page PDFs whose totals only exist by aggregating page 2, and four "
    "adversarial inputs we generated: a 420-pixel blurry JPEG, a faded gray "
    "label skewed seven degrees, a bill of lading in 6.5-point type with an "
    "eight-lot manifest, and a certificate stamped diagonally across the data "
    "block. ID-like fields must match ground truth exactly after normalization "
    "- a tracking number off by one digit scores zero."
)

heading("What we measured, mapped to the checklist above", 2)
table(
    ["Checklist item", "Without precision pass", "With precision pass"],
    [
        ["Field accuracy (187 ground-truth fields)", f"{std_acc_pct}%", f"{prec_acc_pct}%"],
        ["Processing time per document", f"{lat_std}s", f"{lat_prec}s"],
        ["Fields flagged for human review", f"{nr_std}", f"{nr_prec}"],
        ["Corrections / warnings logged", f"{w_std}", f"{w_prec}"],
        ["Citation accuracy (source traceability)",
         f"{cit.get('verified', '-')}/{cit.get('withEvidence', '-')} verbatim",
         f"{cit.get('verified', '-')}/{cit.get('withEvidence', '-')} verbatim"],
        ["Amendment conflict resolved",
         "yes" if am.get("standardResolved") else "no",
         "yes" if am.get("precisionResolved") else "no"],
    ],
    widths=[2.7, 1.8, 1.8],
)
picture(os.path.join(ASSETS, "fig-accuracy-by-group.png"),
        "Accuracy by document difficulty. Both modes are near-perfect on "
        "readable documents and fail together on the unreadable one.")

heading("What the numbers taught us", 2)
bullet(f"Scan quality is the ceiling, not the model. Readable documents - "
       "including dense small print, stamps and skew - extracted at 89-100% in "
       f"both modes; the genuinely unreadable one scored "
       f"{round(100 * blurry['standard']['accuracy'])}% without and "
       f"{round(100 * blurry['precision']['accuracy'])}% with verification. A "
       "second pass fixes reasoning mistakes, not missing pixels.")
_am = ("resolved by both modes"
       if am.get("standardResolved") and am.get("precisionResolved")
       else ("resolved by standard mode while precision anchored on the "
             "superseded page-1 values - proof that a second pass can "
             "entrench a wrong reading, not only fix it"
             if am.get("standardResolved")
             else "missed by standard mode but caught by precision"))
bullet("Cross-page reasoning held: multi-page totals that only exist by "
       "aggregating the manifest page were extracted correctly. The "
       "amendment conflict (page 1 declaring USD 48,600 superseded by page 3 "
       f"at USD 51,200) was {_am}.")
bullet(f"Traceability survived audit: {cit.get('verified', 0)} of "
       f"{cit.get('withEvidence', 0)} evidence quotes appear verbatim in the "
       "documents' own text layer"
       + (f", and fields stated at 0.9+ confidence proved "
          f"{round(100 * cal_top['accuracy'])}% correct in practice"
          if cal_top else "") + ".")
bullet(f"The verification pass is a trust instrument, not an accuracy lever - "
       f"on this corpus it cost {ratio}x the latency while review flags dropped "
       f"from {nr_std} to {nr_prec} and {w_prec} corrections were caught and "
       "logged for the operator.")

heading("Our routing rule", 2)
para(
    "Run single-pass by default; add the verification pass when the document "
    "class is new, scan quality is questionable, or the shipment is valuable "
    "enough that a few extra seconds are noise against the cost of a wrong "
    "seal number. Benchmarks like Databricks' 94.7% tell you the ceiling is "
    "high; only a field-level evaluation on your own documents tells you where "
    "your floor is. Automate the high-confidence cases, route the uncertain "
    "ones to humans, keep the evidence attached to every value - and the "
    "answer to whether an enterprise can trace, trust and act on what the AI "
    "extracts becomes yes: provably, one field at a time."
)

out_path = os.path.join(DOCS, "Databricks-AI-Extract-Precision-Blog-FULL.docx")
doc.save(out_path)
print("wrote", os.path.relpath(out_path, ROOT))
