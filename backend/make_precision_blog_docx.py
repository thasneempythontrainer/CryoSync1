"""Build the standalone Precision Mode blog post as a Word document.

Content source: docs/blog-post-precision-mode.md
Run from project root:  python backend/make_precision_blog_docx.py
Output: docs/Precision-Mode-Blog.docx
"""

import os

from docx import Document
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.shared import Inches, Pt, RGBColor

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
DOCS = os.path.join(ROOT, "docs")
ASSETS = os.path.join(DOCS, "blog-assets")

BLUE = RGBColor(0x1D, 0x4E, 0xD8)
DARK = RGBColor(0x1F, 0x29, 0x37)
MUT = RGBColor(0x6B, 0x72, 0x80)

doc = Document()
for sec in doc.sections:
    sec.left_margin = Inches(0.9)
    sec.right_margin = Inches(0.9)


def para(text="", size=11, bold=False, italic=False, color=None,
         align=None, space_after=8):
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


with open(os.path.join(DOCS, "blog-post-precision-mode.md"), encoding="utf-8") as f:
    lines = f.read().splitlines()

first_h1 = True
for raw in lines:
    line = raw.strip()
    if not line or line.startswith("<!--"):
        continue
    if line.startswith("# ") and first_h1:
        h = doc.add_heading(line[2:], level=0)
        for r in h.runs:
            r.font.color.rgb = DARK
        first_h1 = False
    elif line.startswith("## "):
        heading(line[3:], level=1)
    elif line.startswith("- "):
        bullet(line[2:])
    elif line.startswith("|"):
        continue
    elif line.startswith("*") and line.endswith("*"):
        para(line.strip("*"), size=11, italic=True, color=MUT)
    else:
        para(line)

# Results table + figure after the "What precision mode actually delivered"
table_rows = [
    ["What we measured", "Single pass", "With precision pass"],
    ["Field accuracy (187 ground-truth fields)", "94%", "94%"],
    ["Processing time per document", "9.8s", "17.0s"],
    ["Fields flagged for human review", "6", "1"],
    ["Corrections caught and logged", "0", "18"],
    ["Evidence quotes verified verbatim", "34/35", "34/35"],
]
t = doc.add_table(rows=len(table_rows), cols=3)
t.style = "Light Grid Accent 1"
t.alignment = WD_TABLE_ALIGNMENT.CENTER
for i, row in enumerate(table_rows):
    for j, val in enumerate(row):
        cell = t.rows[i].cells[j]
        cell.text = ""
        r = cell.paragraphs[0].add_run(val)
        r.font.size = Pt(10)
        r.bold = i == 0
para("", space_after=10)
fig = os.path.join(ASSETS, "fig-accuracy-by-group.png")
if os.path.exists(fig):
    doc.add_picture(fig, width=Inches(6.2))
    doc.paragraphs[-1].alignment = WD_ALIGN_PARAGRAPH.CENTER
    para("Accuracy by document difficulty across the seventeen-document corpus.",
         size=9, italic=True, color=MUT, align=WD_ALIGN_PARAGRAPH.CENTER,
         space_after=14)

out_path = os.path.join(DOCS, "Precision-Mode-Blog.docx")
doc.save(out_path)
print("wrote", os.path.relpath(out_path, ROOT))
