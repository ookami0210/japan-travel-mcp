# Project rules for AI coding agents

This repo is public. Anything you commit reaches the internet. Read the
two sections below before you write code or commit anything.

## 1. Forbidden content in git (mechanically enforced)

The repo enforces a no-internal-leakage policy via:

- `.githooks/_scan.sh` — single source of truth for forbidden patterns
- `.githooks/pre-commit` — blocks staged diffs with violations
- `.githooks/commit-msg` — blocks commit messages with violations
- `.githooks/pre-push` — blocks pushes when any commit in the range has violations
- `.github/workflows/no-internal-leakage.yml` — server-side CI guard that
  cannot be bypassed by `--no-verify`

**To see the exact forbidden regex, read `.githooks/_scan.sh` directly.**
The patterns cover internal proper nouns, AI co-author signatures, and
decision-provenance comment markers. The scanner allows the legitimate
author phrase used in `LICENSE` / `package.json` / `README.md` /
`CONTRIBUTING.md`.

To activate the local hooks once after cloning:

```bash
git config core.hooksPath .githooks
# or run any npm command — `npm install` triggers `npm run prepare`
# which sets core.hooksPath automatically
```

To verify a string would be blocked:

```bash
echo "your candidate text" | bash .githooks/_scan.sh
# exit 0 = clean, exit 1 = blocked (with line numbers)
```

## 2. Voice rules

The repo voice is **first-person plural ("we") for collaborative narrative
or third-person neutral for technical text**. Examples:

- ✅ "We added a new fetcher for ..." — collaborative narrative
- ✅ "The fetcher reads ... and writes ..." — neutral technical voice
- ❌ "X approved the change" — naming an internal actor as a third party
- ❌ "Y caught a bug" — internal-narrative storytelling
- ❌ "Iter N (X 2026-MM-DD): ..." — decision-provenance comment with
  attributed actor and date

Why: when a commit lands under the maintainer's account, content phrased
as "X said / X approved" is a third-party impersonation pattern. The
maintainer is the only voice on git; everything is "we" or impersonal.

If you need to record context that would otherwise be a decision-
provenance comment, write it as a neutral rationale instead. Compare:

- ❌ `// Iter N (X 2026-05-03): random-130 surfaced this` — the
  literal `Iter <digits> (` pattern is what the scanner blocks
- ✅ `// Random sample at this iteration surfaced this; see DELTA_iterN.md`

## 3. If a hook blocks you

The hook will print the offending lines. Either:

1. Edit the offending content to comply with the rules above and retry, or
2. Read `.githooks/_scan.sh` to understand exactly which pattern matched.

Do not bypass with `--no-verify`. The CI workflow re-runs the same checks
server-side and will block the merge anyway, so bypassing only delays the
fix.

## 4. Where the rules live (single source of truth)

If `.githooks/_scan.sh` and this document disagree, **the script wins** —
update this document to match. The script is the executable contract; this
document is a human-readable summary.
