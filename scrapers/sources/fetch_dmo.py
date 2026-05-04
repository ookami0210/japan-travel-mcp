#!/usr/bin/env python3
"""
Fetch and structure the 観光庁 (Japan Tourism Agency) DMO registry.

Inputs (downloaded inline at run time):
  - https://www.mlit.go.jp/kankocho/seisaku_seido/dmo/ichiran.html
    (the registry's home page; we fetch link references from here so we
     don't hard-code them)
  - 登録 DMO 一覧 PDF (registered, ~326 entities)
  - 候補 DMO 一覧 PDF (candidate, ~24 entities)

Outputs:
  - data/r3/dmo.json
      {
        "fetched_at": "2026-05-01T...Z",
        "source": "https://www.mlit.go.jp/kankocho/seisaku_seido/dmo/ichiran.html",
        "summary": {"registered": N, "candidate": M},
        "entries": [
          {
            "id": "dmo_<slug>",
            "name": "...",
            "name_normalized": "...",   # 法人格 stripped
            "registration_class": "広域連携 | 都道府県 | 地域 | 候補・地域 | ..."
            "status": "registered" | "candidate",
            "prefectures": ["北海道", ...],
            "municipalities": ["札幌市", ...],   # best-effort
            "raw_area_text": "<area cell content>",
            "plan_pdf_url": "https://...",       # null when missing
            "source": "https://www.mlit.go.jp/kankocho/seisaku_seido/dmo/ichiran.html",
            "authority": "観光庁"
          },
          ...
        ]
      }
  - data/_state/dmo_seed_urls.json    (org-level URLs to feed into tourism_org_urls.json)

The match between text rows and URL annotations is positional: each plan
URL annotation has a Y-coordinate on the page; we sort by (page, -y) and
zip with the text rows in the order pdfplumber yields them.

This is a "good-enough" extractor — for a registry with ~350 rows and
heavy human curation upstream, exact-match correctness on every row is
not required for the MVP. Mismatches will surface as null `plan_pdf_url`
or `prefectures` and can be repaired manually.

Usage:
  python3 scrapers/sources/fetch_dmo.py
  python3 scrapers/sources/fetch_dmo.py --no-download   # use cached PDFs
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import urllib.request
from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import pdfplumber  # type: ignore
import pypdf  # type: ignore

ROOT = Path(__file__).resolve().parents[2]
CACHE_DIR = ROOT / "data" / "_cache" / "dmo"
OUT_DMO = ROOT / "data" / "r3" / "dmo.json"
OUT_SEEDS = ROOT / "data" / "_state" / "dmo_seed_urls.json"

REGISTRY_PAGE = "https://www.mlit.go.jp/kankocho/seisaku_seido/dmo/ichiran.html"
REGISTERED_PDF = "https://www.mlit.go.jp/kankocho/content/001993487.pdf"
CANDIDATE_PDF = "https://www.mlit.go.jp/kankocho/content/001994512.pdf"

USER_AGENT = (
    "JapanTravelMCP/1.0 (+https://github.com/ookami0210/japan-travel-mcp; "
    "OSS travel data for AI agents)"
)


@dataclass
class DmoEntry:
    id: str
    name: str
    name_normalized: str
    registration_class: str
    status: str
    prefectures: list[str]
    municipalities: list[str]
    raw_area_text: str
    plan_pdf_url: str | None
    source: str
    authority: str


def fetch_pdf(url: str, dest: Path) -> bytes:
    dest.parent.mkdir(parents=True, exist_ok=True)
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=30) as r:
        body = r.read()
    dest.write_bytes(body)
    return body


_LEGAL_PREFIX_RE = re.compile(
    r"^[（(](?:一社|公社|一財|公財|株|有|NPO|特非|特定非営利活動法人|地独|独法)[）)]"
)


def normalize_name(name: str) -> str:
    s = name.strip()
    s = _LEGAL_PREFIX_RE.sub("", s).strip()
    s = re.sub(r"<※再掲>", "", s).strip()
    s = re.sub(r"\s+", "", s)
    return s


def slugify(name: str, idx: int) -> str:
    safe = re.sub(r"[^A-Za-z0-9一-龯ぁ-んァ-ヴー]", "", name)
    return f"dmo_{idx:04d}_{safe[:24]}"


PREFS = [
    "北海道", "青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県",
    "茨城県", "栃木県", "群馬県", "埼玉県", "千葉県", "東京都", "神奈川県",
    "新潟県", "富山県", "石川県", "福井県", "山梨県", "長野県", "岐阜県",
    "静岡県", "愛知県", "三重県", "滋賀県", "京都府", "大阪府", "兵庫県",
    "奈良県", "和歌山県", "鳥取県", "島根県", "岡山県", "広島県", "山口県",
    "徳島県", "香川県", "愛媛県", "高知県", "福岡県", "佐賀県", "長崎県",
    "熊本県", "大分県", "宮崎県", "鹿児島県", "沖縄県",
]
PREF_RE = re.compile("|".join(PREFS))


def parse_area(area_text: str) -> tuple[list[str], list[str]]:
    """Split a 'マネジメント・マーケティング対象とする区域' cell into
    (prefectures, municipalities). Heuristic — leans on the prefecture name
    list above as anchors."""
    txt = area_text.replace("\n", " ").strip()
    prefs = list(dict.fromkeys(PREF_RE.findall(txt)))
    # Strip prefecture names + delimiters; remaining tokens are municipalities.
    leftover = PREF_RE.sub("", txt)
    leftover = re.sub(r"[、,，]+", "、", leftover)
    parts = [p.strip() for p in leftover.split("、") if p.strip()]
    return prefs, parts


def extract_url_annotations(pdf_path: Path) -> list[list[tuple[float, str]]]:
    """Return a per-page list of (y_top, url) tuples, sorted top-to-bottom."""
    reader = pypdf.PdfReader(str(pdf_path))
    out: list[list[tuple[float, str]]] = []
    for page in reader.pages:
        page_h = float(page.mediabox.height)
        rows: list[tuple[float, str]] = []
        if "/Annots" in page:
            for ann_ref in page["/Annots"]:
                obj = ann_ref.get_object()
                a = obj.get("/A", {})
                uri = a.get("/URI") if a else None
                rect = obj.get("/Rect")
                if uri and rect:
                    # PDF y origin is bottom-left; we want top-down ordering,
                    # so use (page_h - y_top) as the sort key.
                    y_top = float(rect[3])
                    rows.append((page_h - y_top, str(uri)))
        rows.sort(key=lambda r: r[0])
        # dedup adjacent identical URLs (some PDFs annotate same row twice)
        deduped: list[tuple[float, str]] = []
        for r in rows:
            if deduped and deduped[-1][1] == r[1] and abs(deduped[-1][0] - r[0]) < 8:
                continue
            deduped.append(r)
        out.append(deduped)
    return out


def extract_table_rows(pdf_path: Path) -> list[list[list[str]]]:
    """Return a per-page list of rows, each row a list of cell strings."""
    pages: list[list[list[str]]] = []
    with pdfplumber.open(str(pdf_path)) as pdf:
        for page in pdf.pages:
            tables = page.extract_tables()
            page_rows: list[list[str]] = []
            for table in tables:
                for row in table:
                    cells = [(c or "").strip() for c in row]
                    if not any(cells):
                        continue
                    page_rows.append(cells)
            pages.append(page_rows)
    return pages


def is_data_row(cells: list[str]) -> bool:
    if len(cells) < 2:
        return False
    head = cells[0]
    if not head:
        return False
    if "登録区分" in head or "計" in head or "（令" in head:
        return False
    if any(k in head for k in ("広域", "都道府県", "地域")):
        return True
    return False


def harvest_entries(pdf_path: Path, status: str) -> list[DmoEntry]:
    pages_rows = extract_table_rows(pdf_path)
    pages_urls = extract_url_annotations(pdf_path)
    entries: list[DmoEntry] = []
    serial = 0
    for page_idx, rows in enumerate(pages_rows):
        urls_iter = iter(pages_urls[page_idx]) if page_idx < len(pages_urls) else iter([])
        url_pool = list(urls_iter)
        url_used = 0
        for row in rows:
            if not is_data_row(row):
                continue
            reg_class = row[0]
            name = row[1] if len(row) > 1 else ""
            # Detect "<※再掲>" rows — same legal entity reappearing under a
            # different registration class. Drop these to avoid duplication.
            if "再掲" in name:
                continue
            # Area cell: usually row[2], but pdfplumber sometimes splits it
            # into multiple cells.
            area_text = " ".join(row[2:]).strip()
            url = url_pool[url_used][1] if url_used < len(url_pool) else None
            url_used += 1
            prefs, munis = parse_area(area_text)
            serial += 1
            ent = DmoEntry(
                id=slugify(name, serial),
                name=name,
                name_normalized=normalize_name(name),
                registration_class=reg_class,
                status=status,
                prefectures=prefs,
                municipalities=munis,
                raw_area_text=area_text,
                plan_pdf_url=url,
                source=REGISTRY_PAGE,
                authority="観光庁",
            )
            entries.append(ent)
    return entries


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--no-download", action="store_true",
                        help="Skip re-downloading PDFs (use cached copies)")
    args = parser.parse_args()

    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    reg_pdf = CACHE_DIR / "registered.pdf"
    cand_pdf = CACHE_DIR / "candidate.pdf"

    if not args.no_download or not reg_pdf.exists():
        print(f"[dmo] fetching {REGISTERED_PDF}", file=sys.stderr)
        fetch_pdf(REGISTERED_PDF, reg_pdf)
    if not args.no_download or not cand_pdf.exists():
        print(f"[dmo] fetching {CANDIDATE_PDF}", file=sys.stderr)
        fetch_pdf(CANDIDATE_PDF, cand_pdf)

    print(f"[dmo] parsing registered ({reg_pdf})", file=sys.stderr)
    registered = harvest_entries(reg_pdf, "registered")
    print(f"[dmo] parsing candidate ({cand_pdf})", file=sys.stderr)
    candidate = harvest_entries(cand_pdf, "candidate")

    entries = registered + candidate

    OUT_DMO.parent.mkdir(parents=True, exist_ok=True)
    payload: dict[str, Any] = {
        "fetched_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "source": REGISTRY_PAGE,
        "authority": "観光庁",
        "license": "Public sector data — see https://www.mlit.go.jp/.",
        "summary": {
            "registered": len(registered),
            "candidate": len(candidate),
            "total": len(entries),
            "with_plan_url": sum(1 for e in entries if e.plan_pdf_url),
        },
        "entries": [asdict(e) for e in entries],
    }
    OUT_DMO.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"[dmo] wrote {OUT_DMO} ({payload['summary']})", file=sys.stderr)

    # Seed URLs for the existing scraping pipeline.
    OUT_SEEDS.parent.mkdir(parents=True, exist_ok=True)
    seed_payload: dict[str, Any] = {
        "fetched_at": payload["fetched_at"],
        "source": REGISTRY_PAGE,
        "entries": [
            {
                "id": e.id,
                "name": e.name_normalized,
                "prefectures": e.prefectures,
                "municipalities": e.municipalities,
                "plan_pdf_url": e.plan_pdf_url,
            }
            for e in entries
            if e.plan_pdf_url
        ],
    }
    OUT_SEEDS.write_text(json.dumps(seed_payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"[dmo] wrote {OUT_SEEDS} ({len(seed_payload['entries'])} seeds)", file=sys.stderr)


if __name__ == "__main__":
    main()
