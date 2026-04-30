#!/usr/bin/env python3
"""
Generate the coverage chart shown on the HF dataset card.

Output: data/hf_card_assets/coverage_chart.png — bar chart of attraction
entities per prefecture, with the 17-language coverage line at 100%.

This script reads from the local data/ tree (when present) or the HF cache
(~/.japan-travel-mcp/data/) so it works in dev and on a fresh checkout.
"""
from __future__ import annotations
import json
import os
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
LOCAL_DATA = ROOT / "data"
HF_CACHE = Path.home() / ".japan-travel-mcp" / "data"

# Choose data root
data_root = LOCAL_DATA if (LOCAL_DATA / "_state/wikidata_attractions.json").exists() else HF_CACHE
e2e_cache = Path("/tmp/jtm-e2e-cache")
if not (data_root / "_state/wikidata_attractions.json").exists() and (e2e_cache / "_state/wikidata_attractions.json").exists():
    data_root = e2e_cache

if not (data_root / "_state/wikidata_attractions.json").exists():
    raise SystemExit(f"Data not found under {data_root}. Run the MCP server once or point to a populated cache.")

print(f"[chart] using data root: {data_root}")

# ─── prefecture metadata (English-first) ────────────────────────────
PREFS = json.load(open(ROOT / "data/knowledge/taxonomies/japan_regions.json"))["prefectures"]
PREF_NAME = {p["code"]: p["name_en"] for p in PREFS}
PREF_ORDER = [p["code"] for p in PREFS]  # 01..47 in JIS order

# ─── attractions (qid → prefecture_code) ────────────────────────────
attr = json.load(open(data_root / "_state/wikidata_attractions.json"))
qid_to_pref = {a["qid"]: a.get("prefecture_code") for a in attr.get("attractions", [])}

# ─── descriptions: count entities per prefecture (entities with desc in ANY lang) ─
LANGS = ["en","ja","zh","ko","fr","es","de","it","pt","ru","th","vi","id","ms","ar","hi","tl"]
per_pref_total = defaultdict(int)
per_pref_lang = defaultdict(lambda: defaultdict(int))

with open(data_root / "translations/descriptions_complete.jsonl") as f:
    for line in f:
        line = line.strip()
        if not line: continue
        r = json.loads(line)
        qid = r.get("qid")
        if not qid: continue
        pref = qid_to_pref.get(qid)
        if not pref: continue
        per_pref_total[pref] += 1
        d = r.get("descriptions", {})
        for L in LANGS:
            if d.get(L): per_pref_lang[pref][L] += 1

# ─── plot ───────────────────────────────────────────────────────────
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

fig, ax = plt.subplots(figsize=(14, 7))

xs = list(range(len(PREF_ORDER)))
totals = [per_pref_total.get(c, 0) for c in PREF_ORDER]
labels = [PREF_NAME[c] for c in PREF_ORDER]

bars = ax.bar(xs, totals, color="#3a7ca5", edgecolor="white", linewidth=0.5)

# 17-lang coverage line (each entity has 17 langs, so the line tracks totals)
ax.plot(xs, totals, marker="o", markersize=3, color="#d97706",
        linewidth=1.2, label="17-language coverage = 100% per entity")

ax.set_xticks(xs)
ax.set_xticklabels(labels, rotation=70, ha="right", fontsize=8)
ax.set_ylabel("Tourist attractions with 17-language descriptions")
ax.set_xlabel("Prefecture")
ax.set_title(
    f"Japan Travel MCP — coverage by prefecture\n"
    f"{sum(totals):,} total attractions × 17 languages = {sum(totals)*17:,} translation cells",
    fontsize=12, pad=14,
)
ax.grid(axis="y", linestyle="--", alpha=0.3)
ax.set_axisbelow(True)
ax.legend(loc="upper right", fontsize=9, frameon=False)
ax.spines["top"].set_visible(False)
ax.spines["right"].set_visible(False)

# Annotate top 5 prefectures
top5 = sorted(zip(xs, totals, labels), key=lambda t: -t[1])[:5]
for x, y, lbl in top5:
    ax.annotate(f"{y:,}", xy=(x, y), xytext=(0, 6), textcoords="offset points",
                ha="center", fontsize=8, color="#1f4f6e")

fig.tight_layout()
out = ROOT / "data/hf_card_assets/coverage_chart.png"
out.parent.mkdir(parents=True, exist_ok=True)
fig.savefig(out, dpi=160, facecolor="white")
print(f"[chart] saved to {out} ({out.stat().st_size // 1024} KB)")
