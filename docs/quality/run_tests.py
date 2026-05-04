#!/usr/bin/env python3
"""
Run all 100 test cases against a single persistent local MCP server (stdio).

Earlier versions spawned a fresh server process per test case. With the
post-Phase-2 hybrid backend, each fresh server has to lazy-load the
multilingual-e5 model + ~200MB embedding index — about 25-30s of cold
start. That blew the per-call timeout for ~11 cases on the deep-scrape
benchmark, scoring them 0 even when the data was good.

This version starts ONE server, runs the JSON-RPC initialize handshake
once, then sends all 100 tool/call requests over the same stdio channel.
Per-call timeout is now post-warmup wall time only.

Captures responses to docs/quality/test_results.jsonl.
"""
import json
import os
import select
import subprocess
import sys
import time
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent.parent
CALLS = REPO / "docs" / "quality" / "test_calls.json"
RESULTS = REPO / "docs" / "quality" / "test_results.jsonl"
SERVER_CMD = ["node", "--max-old-space-size=8192", str(REPO / "dist" / "src" / "index.js")]

# Per-call timeout — post-warmup, so 60s is generous.
CALL_TIMEOUT_S = 60
WARMUP_TIMEOUT_S = 120  # initialize + first hybrid call may load the embed
RPC_ID_COUNTER = 0


class PersistentServer:
    def __init__(self) -> None:
        env = os.environ.copy()
        self.proc = subprocess.Popen(
            SERVER_CMD,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            env=env,
            cwd=str(REPO),
            bufsize=0,
        )

    def _send(self, msg: dict) -> None:
        line = (json.dumps(msg) + "\n").encode()
        assert self.proc.stdin is not None
        self.proc.stdin.write(line)
        self.proc.stdin.flush()

    def _recv(self, timeout: float) -> dict | None:
        assert self.proc.stdout is not None
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            ready, _, _ = select.select([self.proc.stdout], [], [], 0.5)
            if not ready:
                continue
            line = self.proc.stdout.readline()
            if not line:
                return None
            text = line.decode(errors="replace").strip()
            if not text.startswith("{"):
                continue
            try:
                return json.loads(text)
            except Exception:
                continue
        return None

    def initialize(self) -> bool:
        global RPC_ID_COUNTER
        RPC_ID_COUNTER += 1
        self._send({
            "jsonrpc": "2.0",
            "id": RPC_ID_COUNTER,
            "method": "initialize",
            "params": {
                "protocolVersion": "2024-11-05",
                "capabilities": {},
                "clientInfo": {"name": "test-harness", "version": "1.0"},
            },
        })
        resp = self._recv(WARMUP_TIMEOUT_S)
        if not resp or "result" not in resp:
            return False
        # initialized notification
        self._send({"jsonrpc": "2.0", "method": "notifications/initialized"})
        return True

    def call(self, tool: str, args: dict, timeout: float = CALL_TIMEOUT_S) -> dict:
        global RPC_ID_COUNTER
        RPC_ID_COUNTER += 1
        rpc_id = RPC_ID_COUNTER
        self._send({
            "jsonrpc": "2.0",
            "id": rpc_id,
            "method": "tools/call",
            "params": {"name": tool, "arguments": args},
        })
        # The server may emit unrelated notifications; loop until we see our id.
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                return {"error": "timeout"}
            resp = self._recv(remaining)
            if not resp:
                return {"error": "timeout"}
            if resp.get("id") != rpc_id:
                continue  # different message, skip
            if "result" not in resp:
                return {"error": "no_result", "raw": resp}
            content = resp["result"].get("content", [])
            if not content:
                return {"error": "empty_content"}
            text = content[0].get("text", "")
            try:
                return {"ok": True, "response": json.loads(text)}
            except Exception:
                return {"ok": True, "response_raw": text[:2000]}
        return {"error": "timeout"}

    def close(self) -> None:
        try:
            self.proc.terminate()
        except Exception:
            pass


def main() -> None:
    cases = json.loads(CALLS.read_text())
    print(f"Running {len(cases)} test cases against ONE persistent server...",
          file=sys.stderr)

    server = PersistentServer()
    print("[harness] initialising server (will warm up embedding on first hybrid call)...",
          file=sys.stderr)
    t0 = time.monotonic()
    if not server.initialize():
        sys.exit("[harness] initialize failed")
    print(f"[harness] initialise OK in {time.monotonic() - t0:.1f}s", file=sys.stderr)

    with RESULTS.open("w") as f:
        for i, c in enumerate(cases, 1):
            t1 = time.monotonic()
            print(
                f"  [{i:3d}/{len(cases)}] {c['id']} {c['tool']}({c['args']})",
                file=sys.stderr,
            )
            r = server.call(c["tool"], c["args"])
            elapsed = time.monotonic() - t1
            if r.get("error"):
                print(f"    → {r['error']} ({elapsed:.1f}s)", file=sys.stderr)
            out = {**c, "result": r, "_elapsed_s": round(elapsed, 2)}
            f.write(json.dumps(out, ensure_ascii=False) + "\n")
            f.flush()

    server.close()
    print(f"Wrote {RESULTS}", file=sys.stderr)


if __name__ == "__main__":
    main()
