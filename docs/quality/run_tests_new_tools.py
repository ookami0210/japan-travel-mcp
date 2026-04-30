#!/usr/bin/env python3
"""
Run the 'new tools' (search_hybrid / search_semantic / get_dmo + keyword)
test corpus against the local MCP server (stdio). Captures responses to
test_results_new_tools.jsonl for human scoring.

Use this alongside the original 100-case harness to measure the post-Phase 1/2/3
upgrades — this corpus targets queries the older lexical-only stack couldn't
handle (cross-lingual paraphrases, English semantic queries, DMO lookups,
substring filtering).
"""
import json
import os
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent.parent
CALLS = REPO / "docs" / "quality" / "test_calls_new_tools.json"
RESULTS = REPO / "docs" / "quality" / "test_results_new_tools.jsonl"
SERVER = ["node", str(REPO / "dist" / "src" / "index.js")]


def call_one(tool: str, args: dict) -> dict:
    init = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "initialize",
        "params": {
            "protocolVersion": "2024-11-05",
            "capabilities": {},
            "clientInfo": {"name": "test-harness-new-tools", "version": "1.0"},
        },
    }
    call = {
        "jsonrpc": "2.0",
        "id": 2,
        "method": "tools/call",
        "params": {"name": tool, "arguments": args},
    }
    payload = json.dumps(init) + "\n" + json.dumps(call) + "\n"
    env = os.environ.copy()
    try:
        r = subprocess.run(
            SERVER,
            input=payload,
            capture_output=True,
            text=True,
            timeout=120,
            env=env,
            cwd=str(REPO),
        )
    except subprocess.TimeoutExpired:
        return {"error": "timeout"}
    lines = [ln for ln in r.stdout.split("\n") if ln.strip().startswith("{")]
    if len(lines) < 2:
        return {"error": "no_response", "stderr": r.stderr[-500:]}
    try:
        resp = json.loads(lines[-1])
    except Exception as e:
        return {"error": "parse", "msg": str(e), "raw": lines[-1][:200]}
    if "result" not in resp:
        return {"error": "no_result", "raw": resp}
    content = resp["result"].get("content", [])
    if not content:
        return {"error": "empty_content"}
    text = content[0].get("text", "")
    try:
        parsed = json.loads(text)
        return {"ok": True, "response": parsed}
    except Exception:
        return {"ok": True, "response_raw": text[:2000]}


def main() -> None:
    cases = json.loads(CALLS.read_text())
    print(f"Running {len(cases)} new-tools test cases...", file=sys.stderr)
    with RESULTS.open("w") as f:
        for i, c in enumerate(cases, 1):
            print(
                f"  [{i:3d}/{len(cases)}] {c['id']} {c['tool']}({c['args']})",
                file=sys.stderr,
            )
            r = call_one(c["tool"], c["args"])
            out = {**c, "result": r}
            f.write(json.dumps(out, ensure_ascii=False) + "\n")
            f.flush()
    print(f"Wrote {RESULTS}", file=sys.stderr)


if __name__ == "__main__":
    main()
