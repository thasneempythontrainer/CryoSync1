"""Benchmark AI Extract quality: Standard vs Precision mode.

Runs sample documents through both modes against the live Databricks endpoint,
collects quality metrics, and renders a comparison chart.

Run from project root:  python backend/benchmark_extract.py
Output: docs/extract-benchmark.json + docs/extract-benchmark.png
"""

import asyncio
import base64
import json
import os
import sys
import time

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv  # noqa: E402

load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env"))

import extract  # noqa: E402

DOCS = [
    ("01-packing-slip-refrigerated.png", "image/png", "Clean scan"),
    ("10-packing-slip-hard-mode.png", "image/png", "Noisy / rotated"),
    ("11-packing-slip-refrigerated-multipage.pdf", "application/pdf", "Multi-page PDF"),
]

OUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "docs")


def run_metrics(result, elapsed):
    fields = result["fields"]
    return {
        "overallConfidence": result["overallConfidence"],
        "fieldsExtracted": sum(1 for f in fields if f["value"] is not None),
        "needsReview": sum(1 for f in fields if f["needsReview"]),
        "verified": sum(1 for f in fields if f["verified"] and f["value"] is not None),
        "corrections": len(result["warnings"]),
        "elapsedSec": round(elapsed, 1),
    }


async def bench_one(path, mime):
    raw = open(path, "rb").read()
    b64 = base64.b64encode(raw).decode()

    t0 = time.perf_counter()
    std = await extract.extract_document_fields(b64, mime, precision_mode=False)
    t_std = time.perf_counter() - t0

    t0 = time.perf_counter()
    prec = await extract.extract_document_fields(b64, mime, precision_mode=True)
    t_prec = time.perf_counter() - t0

    return {
        "standard": run_metrics(std, t_std),
        "precision": run_metrics(prec, t_prec),
        "stdResult": std,
        "precResult": prec,
    }


async def main():
    results = {}
    for fname, mime, label in DOCS:
        path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "test-documents", fname)
        print(f"running {label} ({fname})...", flush=True)
        r = await bench_one(path, mime)
        results[label] = {k: r[k] for k in ("standard", "precision")}
        s, p = r["standard"], r["precision"]
        print(f"  std : conf={s['overallConfidence']:.0%} fields={s['fieldsExtracted']} "
              f"review={s['needsReview']} warn={s['corrections']} {s['elapsedSec']}s")
        print(f"  prec: conf={p['overallConfidence']:.0%} fields={p['fieldsExtracted']} "
              f"review={p['needsReview']} verified={p['verified']} warn={p['corrections']} {p['elapsedSec']}s")

    os.makedirs(OUT_DIR, exist_ok=True)
    with open(os.path.join(OUT_DIR, "extract-benchmark.json"), "w") as f:
        json.dump(results, f, indent=2)

    render_chart(results)
    print("wrote docs/extract-benchmark.json and docs/extract-benchmark.png")


def render_chart(results):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    import numpy as np

    labels = list(results.keys())
    metrics = [
        ("overallConfidence", "Overall confidence (%)", 100),
        ("fieldsExtracted", "Fields extracted (of 20)", 1),
        ("verified", "Verified fields", 1),
        ("needsReview", "Fields flagged for review", 1),
        ("elapsedSec", "Latency (seconds)", 1),
    ]
    std_vals = [[results[d]["standard"][m] * scale for m, _, scale in metrics] for d in labels]
    prec_vals = [[results[d]["precision"][m] * scale for m, _, scale in metrics] for d in labels]
    std_avg = np.mean(np.array(std_vals), axis=0)
    prec_avg = np.mean(np.array(prec_vals), axis=0)

    x = np.arange(len(metrics))
    w = 0.35
    fig, ax = plt.subplots(figsize=(11, 5.5))
    b1 = ax.bar(x - w / 2, std_avg, w, label="Standard mode", color="#94a3b8")
    b2 = ax.bar(x + w / 2, prec_avg, w, label="Precision mode", color="#2563eb")

    per_doc_colors = ["#cbd5e1", "#b6c2d4", "#a9b8cc"]
    for i in range(len(labels)):
        ax.bar(x - w / 2, std_vals[i], w, color=per_doc_colors[i], alpha=0.55, zorder=0)
        ax.bar(x + w / 2, prec_vals[i], w, color=per_doc_colors[i], alpha=0.55, zorder=0)

    for bars in (b1, b2):
        for rect in bars:
            h = rect.get_height()
            ax.annotate(f"{h:g}", xy=(rect.get_x() + rect.get_width() / 2, h),
                        xytext=(0, 3), textcoords="offset points",
                        ha="center", va="bottom", fontsize=9)

    ax.set_xticks(x)
    ax.set_xticklabels([m[1] for m in metrics], fontsize=9)
    ax.set_title("AI Extract quality: Standard vs Precision mode\n(average across 3 test documents; light bars = individual documents)",
                 fontsize=11)
    ax.legend()
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)
    fig.tight_layout()
    fig.savefig(os.path.join(OUT_DIR, "extract-benchmark.png"), dpi=150)


if __name__ == "__main__":
    asyncio.run(main())
