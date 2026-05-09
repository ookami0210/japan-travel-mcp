#!/usr/bin/env bash
# Auto-improvement loop — mechanical parts.
#
# One invocation = one iteration of:
#   1. typecheck + build
#   2. run 100-case test (or random 130 if --random)
#   3. build v3 prompts (4 batches)
#   4. (caller spawns 4 Sonnet subagents in parallel — NOT in this script)
#   5. aggregate after subagents finish
#   6. write delta vs previous label to docs/quality/DELTA_<label>.md
#
# Why split: spawning Sonnet subagents must happen from the main loop
# via the Agent tool (Claude Code subscription). This shell script handles
# the mechanical setup + teardown.
#
# Usage:
#   bash docs/quality/auto_loop.sh prepare <label>           # steps 1-3
#   bash docs/quality/auto_loop.sh aggregate <label> <prev>  # steps 5-6
#   bash docs/quality/auto_loop.sh prepare <label> --random  # uses random set
#
# Exits non-zero on build failure so caller can abort.

set -euo pipefail

REPO="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$REPO"
PY="${PY:-python3.11}"

cmd="${1:?usage: prepare|aggregate}"
label="${2:?label required (e.g. iter4-hotels)}"
shift 2 || true

if [ "$cmd" = "prepare" ]; then
  RANDOM_FLAG=""
  if [ "${1:-}" = "--random" ]; then
    RANDOM_FLAG="--random"
    shift
  fi

  echo "── [1/3] typecheck + build"
  npm run typecheck
  npm run build

  echo "── [2/3] run tests (label=$label)"
  if [ -n "$RANDOM_FLAG" ]; then
    if [ ! -f docs/quality/test_calls_random.r1.json ]; then
      echo "  random calls file missing — run gen_random_tests.py first" >&2
      exit 2
    fi
    # Persistent server harness reads test_calls.json by default. Swap.
    cp docs/quality/test_calls.json docs/quality/test_calls.bak.json
    cp docs/quality/test_calls_random.r1.json docs/quality/test_calls.json
    "$PY" docs/quality/run_tests.py
    cp docs/quality/test_calls.bak.json docs/quality/test_calls.json
    rm docs/quality/test_calls.bak.json
  else
    "$PY" docs/quality/run_tests.py
  fi

  cp docs/quality/test_results.jsonl "docs/quality/test_results.${label}.jsonl"

  echo "── [3/4] build v3 prompts (4 batches × 2 judges)"
  "$PY" docs/quality/build_v3_prompts.py --label "$label" --batches 4

  echo "── [4/4] compute deterministic metrics (parse / token / field coverage)"
  # These run on the test_results.jsonl directly and don't depend on
  # judge output — useful for byte-for-byte regression checks across
  # iterations even before the LLM judges have started.
  "$PY" docs/quality/deterministic_metrics.py --label "$label" || true

  # Multi-judge default: copy batch dir to siblings for judges 2 and 3.
  # Each judge scores the same prompts independently; the median is taken
  # at aggregation time so single-session judge variance is reduced.
  # Three judges (vs the previous two) eliminate the "single outlier swings
  # the median" failure mode — the median of 3 is the middle vote, robust
  # to one rogue judge.
  src_dir="docs/quality/judge_v3_batches/${label}_100case"
  if [ -d "$src_dir" ]; then
    for jn in 2 3; do
      rm -rf "docs/quality/judge_v3_batches/${label}_100case_j${jn}"
      cp -r "$src_dir" "docs/quality/judge_v3_batches/${label}_100case_j${jn}"
      rm -f "docs/quality/judge_v3_batches/${label}_100case_j${jn}"/batch_*_scored.jsonl
    done
  fi

  echo
  echo "✅ Prepare done. Now spawn 12 Sonnet subagents (4 batches × 3 judges) — multi-judge default."
  echo "   Judge 1 batches: docs/quality/judge_v3_batches/${label}_100case/"
  echo "   Judge 2 batches: docs/quality/judge_v3_batches/${label}_100case_j2/"
  echo "   Judge 3 batches: docs/quality/judge_v3_batches/${label}_100case_j3/"
  echo "   Each batch_N_prompt.txt is identical across j1/j2/j3; the variance"
  echo "   we are pinning down sits in the Sonnet session itself, not the prompt."
  echo "   When all 12 scored.jsonl files are written, run:"
  echo "     bash docs/quality/auto_loop.sh aggregate $label <previous-label>"
  exit 0
fi

if [ "$cmd" = "aggregate" ]; then
  prev="${1:?previous label required for delta (e.g. bigday-0508-rejudge)}"

  batch_dir="docs/quality/judge_v3_batches/${label}_100case"
  batch_dir_j2="docs/quality/judge_v3_batches/${label}_100case_j2"
  batch_dir_j3="docs/quality/judge_v3_batches/${label}_100case_j3"
  if [ ! -d "$batch_dir" ]; then
    echo "  batch dir missing: $batch_dir" >&2
    exit 2
  fi

  expected_batches=4
  j1_found=$(ls "$batch_dir"/batch_*_scored.jsonl 2>/dev/null | wc -l | tr -d ' ')
  if [ "$j1_found" -ne "$expected_batches" ]; then
    # Maybe j1 was already renamed in a previous aggregate run
    j1_found=$(ls "$batch_dir"/batch_*_judge1_scored.jsonl 2>/dev/null | wc -l | tr -d ' ')
  fi
  if [ "$j1_found" -ne "$expected_batches" ]; then
    echo "  expected $expected_batches j1 scored batches, found $j1_found in $batch_dir" >&2
    exit 3
  fi

  # Multi-judge default: 3-judge consolidation. j1 lives in $batch_dir
  # (renamed to _judge1_scored.jsonl), j2 in $batch_dir_j2 (copied as
  # _judge2_scored.jsonl), j3 in $batch_dir_j3 (copied as _judge3_scored.jsonl).
  # The aggregator computes the per-dim median across the 3 judges.
  j2_found=0
  j3_found=0
  if [ -d "$batch_dir_j2" ]; then
    j2_found=$(ls "$batch_dir_j2"/batch_*_scored.jsonl 2>/dev/null | wc -l | tr -d ' ')
  fi
  if [ -d "$batch_dir_j3" ]; then
    j3_found=$(ls "$batch_dir_j3"/batch_*_scored.jsonl 2>/dev/null | wc -l | tr -d ' ')
  fi

  if [ "$j2_found" -eq "$expected_batches" ]; then
    echo "── aggregate $label MULTI-JUDGE (j1+j2$([ "$j3_found" -eq "$expected_batches" ] && echo "+j3"); prev=$prev)"
    for n in 1 2 3 4; do
      if [ -f "$batch_dir/batch_${n}_scored.jsonl" ] && [ ! -f "$batch_dir/batch_${n}_judge1_scored.jsonl" ]; then
        mv "$batch_dir/batch_${n}_scored.jsonl" "$batch_dir/batch_${n}_judge1_scored.jsonl"
      fi
      if [ -f "$batch_dir_j2/batch_${n}_scored.jsonl" ]; then
        cp "$batch_dir_j2/batch_${n}_scored.jsonl" "$batch_dir/batch_${n}_judge2_scored.jsonl"
      fi
      if [ -f "$batch_dir_j3/batch_${n}_scored.jsonl" ]; then
        cp "$batch_dir_j3/batch_${n}_scored.jsonl" "$batch_dir/batch_${n}_judge3_scored.jsonl"
      fi
    done
    "$PY" docs/quality/aggregate_v3_multijudge.py --label "$label"
    cp "docs/quality/test_results_scored.${label}.v3.multijudge.jsonl" \
       "docs/quality/test_results_scored.${label}.v3.jsonl"
    "$PY" docs/quality/detail_v3.py --label "$label"
  else
    echo "── aggregate $label SINGLE-JUDGE FALLBACK (prev=$prev)"
    echo "  WARNING: only $j1_found / $expected_batches judge 2 batches present."
    echo "  Single-judge variance is ±20pp Sat — treat results as indicative only."
    "$PY" docs/quality/aggregate_v3.py --label "$label"
    "$PY" docs/quality/detail_v3.py --label "$label"
  fi

  # Compute delta if previous label exists
  prev_scored="docs/quality/test_results_scored.${prev}.v3.jsonl"
  curr_scored="docs/quality/test_results_scored.${label}.v3.jsonl"

  if [ ! -f "$prev_scored" ]; then
    echo "  prev scored file missing ($prev_scored) — skipping delta"
    exit 0
  fi

  "$PY" - <<PY
import json
from pathlib import Path

def load(p):
    return [json.loads(l) for l in Path(p).read_text().splitlines() if l.strip()]

W = {"intent_understanding":0.25, "factual_accuracy":0.25, "practical_usefulness":0.25,
     "specificity":0.10, "groundedness":0.10, "expression_quality":0.05}
DIMS = ["intent_understanding","groundedness","factual_accuracy","practical_usefulness",
        "constraint_handling","travel_feasibility","specificity","expression_quality"]

def kpis(rows):
    sat = sum(1 for r in rows if sum(W.get(d,0)*r.get(d,0) for d in W) >= 4.0)
    def avg(r): return sum(r.get(d,0) for d in DIMS)/len(DIMS)
    mn  = sum(1 for r in rows if r.get("safety_pass") and r.get("hallucination_pass") and avg(r)>=3.0)
    cat = sum(1 for r in rows if not r.get("safety_pass") or not r.get("hallucination_pass"))
    return sat, mn, cat

prev = load("$prev_scored")
curr = load("$curr_scored")

ps, pm, pc = kpis(prev)
cs, cm, cc = kpis(curr)

prev_by_id = {r["id"]: r for r in prev}
gainers, losers = [], []
for r in curr:
    p = prev_by_id.get(r["id"])
    if not p: continue
    psat = sum(W.get(d,0)*p.get(d,0) for d in W)
    csat = sum(W.get(d,0)*r.get(d,0) for d in W)
    if csat - psat >= 0.5: gainers.append((r["id"], r.get("_tool",""), psat, csat))
    if psat - csat >= 0.5: losers.append((r["id"], r.get("_tool",""), psat, csat))

out = Path("docs/quality/DELTA_$label.md")
lines = [
  f"# Delta: $prev → $label", "",
  "| KPI | Prev | Curr | Δ |",
  "|:---|---:|---:|---:|",
  f"| Satisfaction (≥4.0) | {ps}% | {cs}% | {cs-ps:+d}pp |",
  f"| Minimum Acceptable  | {pm}% | {cm}% | {cm-pm:+d}pp |",
  f"| Catastrophic        | {pc}% | {cc}% | {cc-pc:+d}pp |",
  "",
  f"## Gainers (sat +0.5+)  {len(gainers)} cases", "",
]
for gid, tool, p, c in sorted(gainers, key=lambda x: x[3]-x[2], reverse=True)[:20]:
    lines.append(f"- {gid} ({tool}) {p:.2f} → {c:.2f}")
lines += ["", f"## Losers (sat -0.5+)  {len(losers)} cases — INVESTIGATE", ""]
for gid, tool, p, c in sorted(losers, key=lambda x: x[2]-x[3], reverse=True)[:20]:
    lines.append(f"- {gid} ({tool}) {p:.2f} → {c:.2f}")
out.write_text("\n".join(lines))
print(f"Δ KPI: Sat {ps}→{cs} ({cs-ps:+d}pp) | Min {pm}→{cm} ({cm-pm:+d}pp) | Cat {pc}→{cc} ({cc-pc:+d}pp)")
print(f"  Gainers: {len(gainers)}, Losers: {len(losers)}")
print(f"  wrote {out}")
PY

  echo
  echo "✅ Aggregate done."
  exit 0
fi

echo "Unknown command: $cmd" >&2
exit 1
