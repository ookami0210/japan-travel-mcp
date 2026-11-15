#!/usr/bin/env python3
"""
Local-model pass over the pages the deterministic readers could not parse.

WHY a model at all: a share of official pages state their hours in prose the
rules do not model ("平日は夜まで、週末は昼のみ", a table split across cells,
an image caption). A small instruction model reads those. WHY local: the
pass runs on the operator's own machine with MLX (Apple Silicon), so it
costs nothing per page and no page text leaves the machine.

WHY the validator is the important part: a model can state hours a page
never gave. Every clock time, yen amount and evidence fragment the model
returns is checked against the snippet it was shown, and a value that is
not there is dropped. The output therefore never contains a number that the
page did not contain.

Input  : data/_state/official_page_facts_llm_queue.jsonl   (from fetch_official_page_facts.ts)
Output : data/facts/official_page_facts.llm.jsonl          (one line per entity; append, resumable)

Usage:
    python3 scrapers/llm_local/extract_facts_mlx.py --limit 50          # canary
    python3 scrapers/llm_local/extract_facts_mlx.py                     # whole queue
    python3 scrapers/llm_local/extract_facts_mlx.py --model mlx-community/Qwen3-8B-4bit

Needs: pip install mlx-lm   (Apple Silicon only)
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
QUEUE = REPO_ROOT / "data" / "_state" / "official_page_facts_llm_queue.jsonl"
OUT = REPO_ROOT / "data" / "facts" / "official_page_facts.llm.jsonl"

DEFAULT_MODEL = "mlx-community/Qwen3-8B-4bit"

SYSTEM = (
    "You extract facts from the visible text of a Japanese business or venue page. "
    "Answer with one JSON object and nothing else. Use only what the text states; "
    "when the text does not state a value, use null. Never guess, never infer typical hours, "
    "never convert a price. Copy evidence fragments verbatim from the text."
)

SCHEMA = {
    "opening_hours": "OSM opening_hours string such as 'Mo-Fr 09:00-17:00; Sa,Su,PH 10:00-18:00; We off', or null",
    "open_every_day": "true only if the text says 年中無休 or 無休",
    "adult_jpy": "integer yen for an adult admission or general price, or null",
    "child_jpy": "integer yen for a child admission, or null",
    "free": "true only if the text says admission is 無料",
    "from_jpy": "integer yen for a lodging rate written as 'from' (〜), or null",
    "checkin": "HH:MM or null",
    "checkout": "HH:MM or null",
    "evidence": "list of 1-4 short fragments copied verbatim from the text that support the values",
}

FULLWIDTH = {ord(a): b for a, b in zip("０１２３４５６７８９：（）　", "0123456789:() ")}


def norm(s: str) -> str:
    return s.translate(FULLWIDTH).replace("～", "〜").replace("~", "〜")


def build_prompt(tokenizer, layer: str, snippet: str) -> str:
    user = (
        f"Layer: {layer} (hotel pages state check-in/check-out instead of hours).\n"
        f"Return JSON with these keys: {json.dumps(SCHEMA, ensure_ascii=False)}\n\n"
        f"TEXT:\n{snippet}"
    )
    messages = [{"role": "system", "content": SYSTEM}, {"role": "user", "content": user}]
    try:
        return tokenizer.apply_chat_template(
            messages, add_generation_prompt=True, tokenize=False, enable_thinking=False
        )
    except TypeError:
        return tokenizer.apply_chat_template(messages, add_generation_prompt=True, tokenize=False)


JSON_RE = re.compile(r"\{.*\}", re.S)


def parse_json(text: str) -> dict | None:
    text = re.sub(r"<think>.*?</think>", "", text, flags=re.S)
    m = JSON_RE.search(text)
    if not m:
        return None
    try:
        obj = json.loads(m.group(0))
    except json.JSONDecodeError:
        return None
    return obj if isinstance(obj, dict) else None


TIME_IN_OSM = re.compile(r"(\d{2}):(\d{2})")


def time_forms(hhmm: str) -> list[str]:
    """Ways a page may have written HH:MM: 09:00, 9:00, 9時, 9時00分, 午後5時."""
    h, m = int(hhmm[:2]), int(hhmm[3:])
    if h >= 24:
        h -= 24
    forms = [f"{h}:{m:02d}", f"{h:02d}:{m:02d}", f"{h}時"]
    if m:
        forms += [f"{h}時{m}分", f"{h}時{m:02d}分"]
        if m == 30:
            forms.append(f"{h}時半")
    if h > 12:
        p = h - 12
        forms += [f"午後{p}時", f"PM{p}:{m:02d}", f"{p}:{m:02d}"]
        if m:
            forms.append(f"午後{p}時{m}分")
    if h == 12 and m == 0:
        forms += ["正午", "12時"]
    return forms


def present(forms: list[str], text: str) -> bool:
    return any(f in text for f in forms)


def validate(obj: dict, snippet: str) -> tuple[dict, list[str]]:
    """Drop every value the snippet does not literally support."""
    text = norm(snippet)
    dropped: list[str] = []
    out: dict = {
        "opening_hours": None,
        "open_every_day": False,
        "adult_jpy": None,
        "child_jpy": None,
        "free": False,
        "from_jpy": None,
        "checkin": None,
        "checkout": None,
        "evidence": [],
    }
    oh = obj.get("opening_hours")
    if isinstance(oh, str) and oh.strip():
        times = TIME_IN_OSM.findall(oh)
        if times and all(present(time_forms(f"{h}:{m}"), text) for h, m in times):
            out["opening_hours"] = oh.strip()
        else:
            dropped.append("opening_hours")
    if obj.get("open_every_day") is True and ("無休" in text):
        out["open_every_day"] = True
    for key in ("adult_jpy", "child_jpy", "from_jpy"):
        v = obj.get(key)
        if isinstance(v, (int, float)) and v > 0:
            n = int(v)
            if f"{n:,}" in text or str(n) in text:
                out[key] = n
            else:
                dropped.append(key)
    if obj.get("free") is True and "無料" in text:
        out["free"] = True
    for key in ("checkin", "checkout"):
        v = obj.get(key)
        if isinstance(v, str) and re.fullmatch(r"\d{1,2}:\d{2}", v.strip()):
            hhmm = v.strip().zfill(5)
            if present(time_forms(hhmm), text):
                out[key] = hhmm
            else:
                dropped.append(key)
    ev = obj.get("evidence")
    if isinstance(ev, list):
        for frag in ev[:4]:
            if isinstance(frag, str) and frag.strip() and norm(frag.strip()) in text:
                out["evidence"].append(frag.strip())
    return out, dropped


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--queue", default=str(QUEUE))
    ap.add_argument("--out", default=str(OUT))
    ap.add_argument("--model", default=DEFAULT_MODEL)
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--max-tokens", type=int, default=320)
    ap.add_argument("--force", action="store_true", help="re-run ids already in the output")
    ap.add_argument("--layers", default="", help="comma-separated layers to read, in this order (default all)")
    args = ap.parse_args()

    try:
        from mlx_lm import generate, load
        from mlx_lm.sample_utils import make_sampler
    except ImportError:
        print("[llm_local] mlx-lm is not installed (pip install mlx-lm)", file=sys.stderr)
        return 2

    queue_path = Path(args.queue)
    out_path = Path(args.out)
    if not queue_path.exists():
        print(f"[llm_local] no queue at {queue_path}", file=sys.stderr)
        return 1
    done: set[str] = set()
    if out_path.exists() and not args.force:
        for line in out_path.read_text(encoding="utf-8").splitlines():
            try:
                done.add(json.loads(line)["id"])
            except (json.JSONDecodeError, KeyError):
                continue
    items = []
    for line in queue_path.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        try:
            rec = json.loads(line)
        except json.JSONDecodeError:
            continue
        if rec.get("id") and rec.get("snippet") and rec["id"] not in done:
            items.append(rec)
    if args.layers:
        wanted = [x.strip() for x in args.layers.split(",") if x.strip()]
        items = [it for layer in wanted for it in items if it.get("layer") == layer]
    if args.limit:
        items = items[: args.limit]
    print(f"[llm_local] queue {len(items)} to read (already done {len(done)}), model {args.model}", file=sys.stderr)
    if not items:
        return 0

    t0 = time.time()
    model, tokenizer = load(args.model)
    print(f"[llm_local] model loaded in {time.time() - t0:.1f}s", file=sys.stderr)
    sampler = make_sampler(temp=0.0)

    out_path.parent.mkdir(parents=True, exist_ok=True)
    n = 0
    hours = 0
    price = 0
    parse_fail = 0
    drops = 0
    started = time.time()
    with out_path.open("a", encoding="utf-8") as fh:
        for rec in items:
            t1 = time.time()
            prompt = build_prompt(tokenizer, rec.get("layer", "attraction"), rec["snippet"])
            text = generate(model, tokenizer, prompt=prompt, max_tokens=args.max_tokens, sampler=sampler, verbose=False)
            obj = parse_json(text)
            if obj is None:
                parse_fail += 1
                validated, dropped = (
                    {"opening_hours": None, "open_every_day": False, "adult_jpy": None, "child_jpy": None,
                     "free": False, "from_jpy": None, "checkin": None, "checkout": None, "evidence": []},
                    ["unparseable"],
                )
            else:
                validated, dropped = validate(obj, rec["snippet"])
            drops += len(dropped)
            if validated["opening_hours"] or validated["checkin"]:
                hours += 1
            if validated["adult_jpy"] or validated["from_jpy"] or validated["free"]:
                price += 1
            row = {
                "id": rec["id"],
                "layer": rec.get("layer"),
                "url": rec.get("url"),
                "method": "llm_local",
                "model": args.model,
                "read_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                "seconds": round(time.time() - t1, 2),
                "dropped_by_validator": dropped,
                **validated,
            }
            fh.write(json.dumps(row, ensure_ascii=False) + "\n")
            fh.flush()
            n += 1
            if n % 20 == 0:
                rate = (time.time() - started) / n
                print(f"[llm_local] {n}/{len(items)}  {rate:.1f}s/page  hours {hours}  price {price}  parse_fail {parse_fail}", file=sys.stderr)
    elapsed = time.time() - started
    print(
        f"[llm_local] done {n} pages in {elapsed / 60:.1f} min ({elapsed / max(n, 1):.1f}s/page): "
        f"hours {hours}, price {price}, parse_fail {parse_fail}, values dropped by validator {drops}",
        file=sys.stderr,
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
