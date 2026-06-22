#!/usr/bin/env python3
"""
Auto-fix orchestrator — diagnoses a failed GitHub Actions run with Claude
and either (tier 1) applies a mechanical fix directly to main, (tier 2)
opens a PR for review, or (tier 3) posts a Slack-only diagnosis.

Wiring: invoked by .github/workflows/auto-fix-on-failure.yml on
`workflow_run` failure events. See that file for the safety model.

Inputs (env):
  ANTHROPIC_API_KEY   — required (Claude API)
  SLACK_WEBHOOK_URL   — required (Slack notifier)
  GH_TOKEN            — required (gh CLI auth + push)
  TARGET_RUN_ID       — failed run id to analyse
  TARGET_WORKFLOW_NAME— failed workflow name (for Slack labelling)
  REPO                — "owner/repo"

Behaviour:
  1. Pull failed step logs via `gh api`.
  2. Rate-limit: skip if this workflow already had an auto-fix attempt
     in the last 6 hours (commit message marker).
  3. Build a structured prompt for Claude with: workflow yaml, failed
     step name, last ~200 lines of log, repo layout hints.
  4. Claude returns JSON with: category, file_changes[], tier,
     slack_message, confidence.
  5. Validate the proposed change against the hard-not-touch list. If it
     attempts to edit a forbidden path, downgrade to tier 3.
  6. Apply per tier:
       tier 1: write files → commit → push to main → Slack notify.
       tier 2: write files on a branch → push → open PR → Slack notify.
       tier 3: Slack notify with diagnosis, no code change.

Hard guards:
  - Whitelist of editable paths (mainly .github/workflows/ + scrapers/).
  - Blacklist of read-only files (data policy, voice policy, hooks).
  - Diff line cap: 50 added + 50 removed total.
  - Max 1 file per fix.
  - Never modifies secrets / billing / scrape-rate constants.
"""
from __future__ import annotations

import json
import os
import re
import subprocess
import sys
import time
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Any

import requests
from anthropic import Anthropic

ROOT = Path(__file__).resolve().parents[1]

# ── safety constants ───────────────────────────────────────────────────

# Files that auto-fix may NEVER modify. The orchestrator downgrades any
# proposed change touching these to tier 3 (Slack only).
FORBIDDEN_PATHS = {
    ".githooks/_scan.sh",
    ".githooks/pre-commit",
    ".githooks/commit-msg",
    ".githooks/pre-push",
    ".github/workflows/no-internal-leakage.yml",
    ".github/workflows/auto-fix-on-failure.yml",
    "AGENT_VOICE_POLICY.md",
    "DATA_POLICY.md",
    "DATA_SOURCES.md",
    "docs/EDITORIAL_POLICY.md",
    "package.json",  # version is bumped by humans
    "scripts/auto_fix.py",  # don't let it edit itself
}

# Paths the orchestrator may write to. Anything outside this allowlist
# is downgraded to tier 3.
EDITABLE_PREFIXES = (
    ".github/workflows/",
    "scrapers/",
    "scripts/",
    "src/",
)

# Hard caps on the diff size.
MAX_FILES_CHANGED = 1
MAX_LINES_ADDED = 50
MAX_LINES_REMOVED = 50

# Rate-limit window: do not auto-fix the same workflow twice within this.
RATE_LIMIT_HOURS = 6

# Categories considered tier-1 safe (applied directly to main).
TIER1_CATEGORIES = {
    "missing_pip_dep",
    "missing_npm_dep",
    "timeout_bump",
    "missing_env_secret_ref",
    "graceful_skip_missing_input",
}

# Branch name template for tier-2 PRs.
PR_BRANCH_PREFIX = "auto-fix/"

MODEL_ID = "claude-sonnet-4-6"  # capable for diagnosis at low cost (~$0.10 per call)
MAX_OUTPUT_TOKENS = 4000

# ── helpers ────────────────────────────────────────────────────────────


def gh(*args: str, check: bool = True, capture: bool = True) -> str:
    """Run gh CLI with the configured token, return stdout."""
    env = os.environ.copy()
    env["GH_TOKEN"] = os.environ.get("GH_TOKEN") or os.environ.get("GITHUB_TOKEN", "")
    r = subprocess.run(
        ["gh", *args],
        cwd=ROOT,
        env=env,
        capture_output=capture,
        text=True,
        check=False,
    )
    if check and r.returncode != 0:
        raise RuntimeError(f"gh {' '.join(args)} → {r.returncode}: {r.stderr}")
    return r.stdout


def git(*args: str, check: bool = True) -> str:
    r = subprocess.run(
        ["git", *args],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    if check and r.returncode != 0:
        raise RuntimeError(f"git {' '.join(args)} → {r.returncode}: {r.stderr}")
    return r.stdout


def slack(message: str) -> None:
    url = os.environ.get("SLACK_WEBHOOK_URL")
    if not url:
        print(f"[auto-fix] (no SLACK_WEBHOOK_URL) {message}", file=sys.stderr)
        return
    try:
        requests.post(url, json={"text": message}, timeout=10)
    except Exception as exc:
        print(f"[auto-fix] slack post failed: {exc}", file=sys.stderr)


def already_attempted_recently(workflow_name: str) -> bool:
    """True if commit history shows an auto-fix for this workflow in the
    last RATE_LIMIT_HOURS. Looks at the last 50 commits for the marker.
    """
    log = git("log", "-50", "--pretty=%H %ct %s")
    cutoff = datetime.now(timezone.utc) - timedelta(hours=RATE_LIMIT_HOURS)
    marker = f"[auto-fix:{workflow_name}]"
    for line in log.splitlines():
        parts = line.split(" ", 2)
        if len(parts) < 3:
            continue
        ts = datetime.fromtimestamp(int(parts[1]), tz=timezone.utc)
        if ts < cutoff:
            return False
        if marker in parts[2]:
            return True
    return False


# ── failure context fetcher ────────────────────────────────────────────


def fetch_failure_context(run_id: str) -> dict[str, Any]:
    """Return structured context about the failed run for the LLM prompt."""
    run = json.loads(gh("api", f"repos/{os.environ['REPO']}/actions/runs/{run_id}"))
    jobs = json.loads(
        gh("api", f"repos/{os.environ['REPO']}/actions/runs/{run_id}/jobs")
    )
    workflow_path = run.get("path") or ""
    workflow_yaml = (ROOT / workflow_path).read_text(encoding="utf-8") if workflow_path else ""

    failed_steps: list[dict[str, Any]] = []
    for job in jobs.get("jobs", []):
        for step in job.get("steps", []):
            if step.get("conclusion") == "failure":
                failed_steps.append(
                    {
                        "job": job.get("name"),
                        "step_number": step.get("number"),
                        "step_name": step.get("name"),
                        "started_at": step.get("started_at"),
                        "completed_at": step.get("completed_at"),
                    }
                )

    log_tail = ""
    if failed_steps:
        try:
            full_log = gh("run", "view", "--log-failed", run_id, check=False)
            # Keep last ~200 lines to fit in prompt window.
            log_tail = "\n".join(full_log.splitlines()[-200:])
        except Exception as exc:
            log_tail = f"(could not fetch logs: {exc})"

    return {
        "run_id": run_id,
        "workflow_name": run.get("name"),
        "workflow_path": workflow_path,
        "workflow_yaml": workflow_yaml,
        "conclusion": run.get("conclusion"),
        "html_url": run.get("html_url"),
        "failed_steps": failed_steps,
        "log_tail": log_tail,
    }


# ── LLM diagnosis ──────────────────────────────────────────────────────


DIAGNOSIS_SYSTEM_PROMPT = """\
You are diagnosing failed GitHub Actions runs for the `japan-travel-mcp`
repository and proposing the minimal mechanical fix.

You must respond with a single JSON object — no prose around it — with this shape:

{
  "category": "<one of: missing_pip_dep, missing_npm_dep, timeout_bump,
               missing_env_secret_ref, graceful_skip_missing_input,
               other_high_confidence, ambiguous>",
  "diagnosis_short": "<one sentence describing the root cause>",
  "diagnosis_detail": "<2–4 sentences with the evidence from the log>",
  "confidence": <float 0..1>,
  "proposed_changes": [
    { "path": "<repo-relative path>", "operation": "edit",
      "find": "<exact existing text>",
      "replace": "<exact replacement text>" }
  ],
  "slack_message": "<single sentence for Slack, prefixed with appropriate emoji>"
}

Rules for `proposed_changes`:
- Use exact string match in `find`. Quote enough surrounding context to
  guarantee a unique match in the file.
- Make the MINIMAL change. Bump a version, add one missing dep, lift one
  timeout. Do NOT refactor.
- For pip dep additions, find the existing `pip install --quiet ...` line
  and add the missing package(s) at the end.
- For timeout bumps, change `timeout-minutes: N` to a value that fits the
  GH Actions 6h hard cap (360); typical bumps: 90→300, 30→90.
- For missing env, add a single `env:` block to the failing step — do NOT
  add a workflow-level `env:`.
- For graceful-skip fixes, the change should be in the script that
  crashed, replacing `throw new Error(...)` or `raise ...` with a log +
  return / exit 0.
- If you cannot determine a unique-match `find` block, set category to
  "ambiguous" and propose no changes.
- Empty `proposed_changes` list is REQUIRED for category=ambiguous.

Categories meaning:
- missing_pip_dep / missing_npm_dep: log shows ModuleNotFoundError or
  "Cannot find package" for a known PyPI / npm package.
- timeout_bump: job cancelled at the timeout boundary; log shows the
  failing step is the long-running one.
- missing_env_secret_ref: log shows the script needs an env var that
  matches a known secret (ANTHROPIC_API_KEY, HF_TOKEN, SLACK_WEBHOOK_URL)
  but the step's env: block does not include it.
- graceful_skip_missing_input: log shows ENOENT or "no such file" on a
  path that an upstream step was supposed to create.
- other_high_confidence: clear root cause but does not fit the above
  shapes (e.g. a syntax fix, a parameter rename).
- ambiguous: cannot identify root cause from the log.

Tone for slack_message: factual, one sentence, with an emoji prefix
(🔧 for tier-1 applied, 📝 for tier-2 PR opened, ⚠️ for tier-3 diagnosis-only).
"""


def diagnose(context: dict[str, Any]) -> dict[str, Any]:
    client = Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
    user_msg = json.dumps(
        {
            "workflow_name": context["workflow_name"],
            "workflow_path": context["workflow_path"],
            "workflow_yaml": context["workflow_yaml"],
            "failed_steps": context["failed_steps"],
            "log_tail": context["log_tail"],
        },
        ensure_ascii=False,
        indent=2,
    )
    resp = client.messages.create(
        model=MODEL_ID,
        max_tokens=MAX_OUTPUT_TOKENS,
        system=DIAGNOSIS_SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_msg}],
    )
    text = ""
    for block in resp.content:
        if getattr(block, "type", None) == "text":
            text += block.text
    # Try to extract JSON robustly.
    m = re.search(r"\{.*\}", text, re.DOTALL)
    if not m:
        raise RuntimeError(f"LLM returned no JSON: {text[:500]}")
    return json.loads(m.group(0))


# ── safety filter ──────────────────────────────────────────────────────


def is_path_editable(path: str) -> bool:
    if path in FORBIDDEN_PATHS:
        return False
    return any(path.startswith(prefix) for prefix in EDITABLE_PREFIXES)


def validate_changes(changes: list[dict[str, Any]]) -> tuple[bool, str | None]:
    """Return (ok, error_reason). Enforces the hard caps."""
    if len(changes) > MAX_FILES_CHANGED:
        return False, f"too many files changed ({len(changes)} > {MAX_FILES_CHANGED})"
    added = removed = 0
    for change in changes:
        path = change.get("path", "")
        if not is_path_editable(path):
            return False, f"path not editable: {path}"
        find = change.get("find", "")
        replace = change.get("replace", "")
        if not find:
            return False, "empty find string"
        added += replace.count("\n") + 1
        removed += find.count("\n") + 1
    if added > MAX_LINES_ADDED:
        return False, f"too many lines added ({added} > {MAX_LINES_ADDED})"
    if removed > MAX_LINES_REMOVED:
        return False, f"too many lines removed ({removed} > {MAX_LINES_REMOVED})"
    return True, None


def apply_changes(changes: list[dict[str, Any]]) -> list[str]:
    """Apply each change. Returns list of file paths edited."""
    edited: list[str] = []
    for change in changes:
        path = ROOT / change["path"]
        body = path.read_text(encoding="utf-8")
        find = change["find"]
        replace = change["replace"]
        if body.count(find) != 1:
            raise RuntimeError(
                f"find string not uniquely matched in {change['path']} "
                f"(matches={body.count(find)})"
            )
        path.write_text(body.replace(find, replace), encoding="utf-8")
        edited.append(change["path"])
    return edited


# ── tier execution ─────────────────────────────────────────────────────


def commit_and_push_main(workflow_name: str, diagnosis: dict[str, Any], edited: list[str]) -> str:
    git("config", "user.name", "japan-travel-mcp-bot")
    git("config", "user.email", "noreply@github.com")
    for path in edited:
        git("add", path)
    short = diagnosis["diagnosis_short"]
    detail = diagnosis["diagnosis_detail"]
    msg = (
        f"🤖 auto-fix: {short}\n\n"
        f"[auto-fix:{workflow_name}] category={diagnosis['category']} "
        f"confidence={diagnosis['confidence']:.2f}\n\n"
        f"{detail}\n"
    )
    git("commit", "-m", msg)
    # Pull + retry to tolerate concurrent pushes.
    for attempt in range(3):
        try:
            git("pull", "--rebase", "origin", "main")
            git("push", "origin", "main")
            break
        except Exception as exc:
            if attempt == 2:
                raise
            print(f"[auto-fix] push attempt {attempt + 1} failed: {exc}", file=sys.stderr)
            time.sleep(5)
    sha = git("rev-parse", "HEAD").strip()
    return sha


def open_pr(workflow_name: str, diagnosis: dict[str, Any], edited: list[str]) -> str:
    branch = f"{PR_BRANCH_PREFIX}{workflow_name}-{int(time.time())}"
    git("config", "user.name", "japan-travel-mcp-bot")
    git("config", "user.email", "noreply@github.com")
    git("checkout", "-b", branch)
    for path in edited:
        git("add", path)
    short = diagnosis["diagnosis_short"]
    detail = diagnosis["diagnosis_detail"]
    msg = (
        f"🤖 auto-fix (PR): {short}\n\n"
        f"[auto-fix:{workflow_name}] category={diagnosis['category']} "
        f"confidence={diagnosis['confidence']:.2f}\n\n"
        f"{detail}\n"
    )
    git("commit", "-m", msg)
    git("push", "origin", branch)
    pr_body = (
        f"### Auto-fix proposal — review before merging\n\n"
        f"**Workflow:** `{workflow_name}`\n"
        f"**Category:** `{diagnosis['category']}`\n"
        f"**Confidence:** {diagnosis['confidence']:.2f}\n\n"
        f"**Diagnosis:** {detail}\n"
    )
    pr_url_raw = gh(
        "pr",
        "create",
        "--base",
        "main",
        "--head",
        branch,
        "--title",
        f"🤖 auto-fix: {short}",
        "--body",
        pr_body,
    )
    return pr_url_raw.strip()


# ── main ───────────────────────────────────────────────────────────────


def main() -> int:
    run_id = os.environ["TARGET_RUN_ID"]
    workflow_name = os.environ.get("TARGET_WORKFLOW_NAME") or "(unknown)"

    if already_attempted_recently(workflow_name):
        slack(
            f"⏸ auto-fix: skipped {workflow_name} — already attempted within "
            f"the last {RATE_LIMIT_HOURS}h (rate limit)."
        )
        return 0

    print(f"[auto-fix] fetching context for run {run_id} ({workflow_name})", flush=True)
    context = fetch_failure_context(run_id)
    if context["conclusion"] != "failure":
        slack(
            f"ℹ️ auto-fix: run {run_id} on {workflow_name} is not a failure "
            f"(conclusion={context['conclusion']}) — skipping."
        )
        return 0

    print(f"[auto-fix] diagnosing with {MODEL_ID}", flush=True)
    diagnosis = diagnose(context)
    print(f"[auto-fix] diagnosis: {json.dumps(diagnosis, ensure_ascii=False)[:800]}", flush=True)

    category = diagnosis.get("category", "ambiguous")
    confidence = float(diagnosis.get("confidence", 0))
    changes = diagnosis.get("proposed_changes", []) or []

    # Tier 3 short-circuit: ambiguous or low-confidence or no changes.
    if category == "ambiguous" or confidence < 0.7 or not changes:
        slack(
            diagnosis.get("slack_message")
            or f"⚠️ auto-fix: {workflow_name} failed — could not identify a safe mechanical fix. {context['html_url']}"
        )
        return 0

    # Validate the proposed changes against the hard caps.
    ok, why = validate_changes(changes)
    if not ok:
        slack(
            f"⚠️ auto-fix: rejected proposed change for {workflow_name} "
            f"({why}). Diagnosis: {diagnosis.get('diagnosis_short')}. {context['html_url']}"
        )
        return 0

    # Apply.
    try:
        edited = apply_changes(changes)
    except Exception as exc:
        slack(
            f"⚠️ auto-fix: failed to apply proposed change for {workflow_name} "
            f"({exc}). Diagnosis: {diagnosis.get('diagnosis_short')}."
        )
        return 0

    # Tier 1 vs tier 2.
    if category in TIER1_CATEGORIES and confidence >= 0.85:
        sha = commit_and_push_main(workflow_name, diagnosis, edited)
        slack(
            f"🔧 auto-fix: {workflow_name} → {diagnosis['diagnosis_short']} "
            f"(commit `{sha[:7]}`). {context['html_url']}"
        )
    else:
        pr_url = open_pr(workflow_name, diagnosis, edited)
        slack(
            f"📝 auto-fix: {workflow_name} — proposed fix PR opened "
            f"({diagnosis['diagnosis_short']}). {pr_url}"
        )

    return 0


if __name__ == "__main__":
    sys.exit(main())
