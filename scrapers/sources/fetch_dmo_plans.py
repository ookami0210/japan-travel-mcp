#!/usr/bin/env python3
"""
Fetch each DMO's 形成確立計画 PDF (regional positioning plan), extract its
text, and chunk it for downstream embedding.

Why we want these (confirmed 2026-05-02):
  Each DMO's plan is the official, self-curated statement of what makes
  that region special — what produce, what festivals, what crafts they
  want visitors to know about. It's the highest-quality public-source
  signal we have for "regional positioning". By embedding these and
  exposing them through the same hybrid retrieval as spots / R-3
  designations, a user query like "endangered traditional crafts" finds
  not just official designations but also the regional contexts where
  those crafts are at the centre of the local story.

  We do NOT use plan content to answer "what is this DMO?" — users
  don't care. We use it to enrich retrieval: "show me regions whose
  positioning matches this query".

Inputs:
  data/r3/dmo.json (from fetch_dmo.py) — has plan_pdf_url per entry.

Outputs:
  data/dmo/<id>/plan.json
    {
      "id": "...",
      "name": "...",
      "prefectures": [...],
      "municipalities": [...],
      "plan_pdf_url": "...",
      "fetched_at": "...",
      "plan_chunks": [
        { "idx": 0, "text": "..." },
        { "idx": 1, "text": "..." },
        ...
      ]
    }

  data/r3/dmo.json gets a top-level `plans_fetched_at` updated.

Usage:
  python3 scrapers/sources/fetch_dmo_plans.py
  python3 scrapers/sources/fetch_dmo_plans.py --limit 10   # smoke test
  python3 scrapers/sources/fetch_dmo_plans.py --no-redownload   # use cached
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

import pypdf  # type: ignore

ROOT = Path(__file__).resolve().parents[2]
DMO_JSON = ROOT / "data" / "r3" / "dmo.json"
DMO_DIR = ROOT / "data" / "dmo"
CACHE_DIR = ROOT / "data" / "_cache" / "dmo_plans"

USER_AGENT = (
    "JapanTravelMCP/1.0 (+https://github.com/ookami0210/japan-travel-mcp; "
    "OSS travel data for AI agents)"
)
RATE_LIMIT_S = 1.5  # polite to mlit.go.jp; we hit one URL once

# Chunking: aim for ~400 chars (≈ a paragraph) so each chunk is a
# semantically-coherent unit that the embedder can score independently.
# Plans are typically 5-15 pages → 20-60 chunks per plan.
CHUNK_TARGET_CHARS = 400
CHUNK_MAX_CHARS = 800
CHUNK_MIN_CHARS = 80


def fetch_pdf(url: str, dest: Path) -> bytes:
    dest.parent.mkdir(parents=True, exist_ok=True)
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=30) as r:
        body = r.read()
    dest.write_bytes(body)
    return body


def extract_text(pdf_path: Path) -> str:
    try:
        reader = pypdf.PdfReader(str(pdf_path))
    except Exception as e:
        print(f"[dmo_plans] pypdf parse failed for {pdf_path.name}: {e}", file=sys.stderr)
        return ""
    parts: list[str] = []
    for page in reader.pages:
        try:
            t = page.extract_text() or ""
        except Exception:
            t = ""
        if t.strip():
            parts.append(t)
    return "\n".join(parts)


_WS_RE = re.compile(r"[ \t\r\f\v]+")
_BREAK_RE = re.compile(r"\n{2,}")


def chunk_text(text: str) -> list[str]:
    """Split plan text into semantically-coherent chunks.

    Strategy:
      1. Normalise whitespace (collapse runs of space/tabs).
      2. Split on blank-line boundaries (paragraphs).
      3. Merge small paragraphs into the previous chunk until target size.
      4. Hard-split chunks longer than CHUNK_MAX_CHARS at the nearest
         sentence boundary (。/.).
    """
    text = _WS_RE.sub(" ", text)
    paras = [p.strip() for p in _BREAK_RE.split(text) if p.strip()]
    chunks: list[str] = []
    buf = ""
    for p in paras:
        if not buf:
            buf = p
            continue
        if len(buf) + len(p) + 1 <= CHUNK_TARGET_CHARS:
            buf = buf + " " + p
        else:
            chunks.append(buf)
            buf = p
    if buf:
        chunks.append(buf)

    # Hard-split anything still over the max
    final: list[str] = []
    for c in chunks:
        if len(c) <= CHUNK_MAX_CHARS:
            if len(c) >= CHUNK_MIN_CHARS:
                final.append(c)
            continue
        # split on 。 or . (preferring 。 for Japanese)
        pos = 0
        while pos < len(c):
            end = pos + CHUNK_MAX_CHARS
            if end >= len(c):
                tail = c[pos:].strip()
                if len(tail) >= CHUNK_MIN_CHARS:
                    final.append(tail)
                break
            sub = c[pos:end]
            cut = max(sub.rfind("。"), sub.rfind(". "))
            if cut < CHUNK_MIN_CHARS:
                cut = CHUNK_MAX_CHARS - 1
            piece = c[pos : pos + cut + 1].strip()
            if len(piece) >= CHUNK_MIN_CHARS:
                final.append(piece)
            pos += cut + 1
    return final


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--no-redownload", action="store_true")
    args = parser.parse_args()

    if not DMO_JSON.exists():
        sys.exit(f"missing {DMO_JSON}; run fetch_dmo.py first")
    dmo = json.loads(DMO_JSON.read_text(encoding="utf-8"))
    entries = dmo["entries"]
    if args.limit:
        entries = entries[: args.limit]

    DMO_DIR.mkdir(parents=True, exist_ok=True)
    CACHE_DIR.mkdir(parents=True, exist_ok=True)

    fetched = 0
    parsed = 0
    skipped_no_url = 0
    skipped_cached = 0
    failed = 0
    total_chunks = 0

    last_fetch = 0.0
    for i, e in enumerate(entries, 1):
        url = e.get("plan_pdf_url")
        eid = e["id"]
        if not url:
            skipped_no_url += 1
            continue

        plan_dir = DMO_DIR / eid
        plan_dir.mkdir(parents=True, exist_ok=True)
        plan_json_path = plan_dir / "plan.json"
        cached_pdf = CACHE_DIR / f"{eid}.pdf"

        # Re-use cached PDF if present + flag set
        need_download = not (args.no_redownload and cached_pdf.exists())
        if need_download:
            # Polite rate limit to mlit.go.jp
            elapsed = time.time() - last_fetch
            if elapsed < RATE_LIMIT_S:
                time.sleep(RATE_LIMIT_S - elapsed)
            try:
                fetch_pdf(url, cached_pdf)
                fetched += 1
                last_fetch = time.time()
            except Exception as ex:
                print(f"[dmo_plans] [{i:3d}/{len(entries)}] {eid} fetch FAIL: {ex}",
                      file=sys.stderr)
                failed += 1
                continue
        else:
            skipped_cached += 1

        text = extract_text(cached_pdf)
        if not text or len(text) < 50:
            print(f"[dmo_plans] [{i:3d}/{len(entries)}] {eid} parse empty (len={len(text)})",
                  file=sys.stderr)
            failed += 1
            continue
        chunks = chunk_text(text)
        if not chunks:
            failed += 1
            continue

        plan_payload = {
            "id": eid,
            "name": e["name"],
            "name_normalized": e.get("name_normalized", e["name"]),
            "registration_class": e.get("registration_class"),
            "status": e.get("status"),
            "prefectures": e.get("prefectures", []),
            "municipalities": e.get("municipalities", []),
            "raw_area_text": e.get("raw_area_text", ""),
            "plan_pdf_url": url,
            "fetched_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "plan_chunks": [{"idx": k, "text": c} for k, c in enumerate(chunks)],
        }
        plan_json_path.write_text(
            json.dumps(plan_payload, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        parsed += 1
        total_chunks += len(chunks)

        if i % 25 == 0:
            print(f"[dmo_plans] progress {i}/{len(entries)}  "
                  f"fetched={fetched} parsed={parsed} chunks={total_chunks} "
                  f"failed={failed}", file=sys.stderr)

    # Update top-level dmo.json with plans_fetched_at
    dmo["plans_fetched_at"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    dmo["plans_summary"] = {
        "fetched": fetched,
        "parsed": parsed,
        "skipped_no_url": skipped_no_url,
        "skipped_cached": skipped_cached,
        "failed": failed,
        "total_chunks": total_chunks,
    }
    DMO_JSON.write_text(
        json.dumps(dmo, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(f"[dmo_plans] DONE  fetched={fetched} parsed={parsed} "
          f"chunks={total_chunks} failed={failed}",
          file=sys.stderr)


if __name__ == "__main__":
    main()
