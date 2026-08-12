#!/usr/bin/env bash
# pii-guard scanner: blocks personal data (email addresses, JP mobile phone
# numbers, raw data-format files) from entering git.
#
# Modes:
#   pii_scan.sh staged            scan staged changes   (pre-commit)
#   pii_scan.sh range OLD NEW     scan a push range     (pre-push)
#   pii_scan.sh tree              scan full tracked tree (CI)
#
# Repo-specific overrides live in .githooks/pii_allow.txt:
#   plain line   -> extra allowed content pattern (extended regex)
#   path:REGEX   -> paths exempt from scanning (extended regex)
#
# Matched content is never printed (CI logs may be public); only file names,
# line numbers and the pattern type are reported.
set -euo pipefail

MODE="${1:-staged}"
HOOK_DIR="$(cd "$(dirname "$0")" && pwd)"
ALLOW_FILE="$HOOK_DIR/pii_allow.txt"

EMAIL_RE='[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}'
MOBILE_RE='0[789]0[- ]?[0-9]{4}[- ]?[0-9]{4}'
BLOCK_EXT_RE='\.(csv|tsv|xlsx|xls|sqlite3?|db|dump|bak)$'

# Addresses that are not personal-data leaks: RFC-reserved / infra / synthetic.
# Repository-owner addresses belong in pii_allow.txt of the repos that need
# them, never in this shared scanner.
ALLOW_RE='example\.(com|org|net|jp)|noreply|no-reply|@users\.noreply|git@github\.com|github-actions|dependabot|@anthropic\.com|\.gserviceaccount\.com|test@|dummy@|sample@|@example|@localhost|@invalid|@placeholder|@domain\.com|@xx\.co\.jp|a@b\.com|@resend\.dev|@sentry|@email\.com|@company\.com'
DUMMY_PHONE_RE='0[789]0[- ]?0000[- ]?0000|090[- ]?1234[- ]?5678'
# Third-party public metadata (lockfiles, licenses, vendored/minified code).
PATH_EXEMPT_RE='(^|/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|poetry\.lock|Cargo\.lock|uv\.lock)$|(^|/)node_modules/|(^|/)dist/|\.min\.(js|css)$|(^|/)LICENSE|(^|/)\.githooks/'

if [ -f "$ALLOW_FILE" ]; then
  extra_content=$(grep -vE '^[[:space:]]*(#|$)' "$ALLOW_FILE" | grep -v '^path:' | paste -sd'|' - 2>/dev/null || true)
  extra_paths=$(grep -E '^path:' "$ALLOW_FILE" | sed 's/^path://' | paste -sd'|' - 2>/dev/null || true)
  [ -n "${extra_content:-}" ] && ALLOW_RE="$ALLOW_RE|$extra_content"
  [ -n "${extra_paths:-}" ] && PATH_EXEMPT_RE="$PATH_EXEMPT_RE|$extra_paths"
fi
FULL_ALLOW_RE="$ALLOW_RE"

EMPTY_TREE='4b825dc642cb6eb9a060e54bf8d69288fbee4904'
ZERO='0000000000000000000000000000000000000000'

case "$MODE" in
  staged)
    FILES=$(git diff --cached --name-only --no-renames --diff-filter=ACMR)
    ;;
  range)
    OLD="${2:?old sha required}"; NEW="${3:?new sha required}"
    [ "$OLD" = "$ZERO" ] && OLD="$EMPTY_TREE"
    FILES=$(git diff --name-only --no-renames --diff-filter=ACMR "$OLD" "$NEW")
    ;;
  tree)
    FILES=$(git ls-files)
    ;;
  *)
    echo "usage: pii_scan.sh staged | range OLD NEW | tree" >&2; exit 2
    ;;
esac

violations=0

while IFS= read -r f; do
  [ -z "$f" ] && continue
  printf '%s\n' "$f" | grep -Eq "$PATH_EXEMPT_RE" && continue

  if printf '%s\n' "$f" | grep -Eiq "$BLOCK_EXT_RE"; then
    echo "✖ pii-guard: data-format file must not enter git: $f"
    violations=1
    continue
  fi

  case "$MODE" in
    tree)
      [ -f "$f" ] || continue
      lines=$(grep -InE "$EMAIL_RE|$MOBILE_RE" -- "$f" 2>/dev/null \
        | grep -vE "$FULL_ALLOW_RE" | grep -vE "$DUMMY_PHONE_RE" \
        | cut -d: -f1 | head -5 | paste -sd, - 2>/dev/null || true)
      if [ -n "$lines" ]; then
        echo "✖ pii-guard: email/phone pattern in $f (lines: $lines)"
        violations=1
      fi
      ;;
    staged|range)
      if [ "$MODE" = "staged" ]; then
        added=$(git diff --cached -U0 --no-color --no-renames -- "$f" | grep -E '^\+' | grep -vE '^\+\+\+ ' || true)
      else
        added=$(git diff -U0 --no-color --no-renames "$OLD" "$NEW" -- "$f" | grep -E '^\+' | grep -vE '^\+\+\+ ' || true)
      fi
      [ -z "$added" ] && continue
      n=$(printf '%s\n' "$added" | grep -E "$EMAIL_RE|$MOBILE_RE" \
        | grep -vE "$FULL_ALLOW_RE" | grep -vE "$DUMMY_PHONE_RE" | grep -c . || true)
      if [ "${n:-0}" -gt 0 ]; then
        echo "✖ pii-guard: email/phone pattern in added lines of $f ($n line(s))"
        violations=1
      fi
      ;;
  esac
done <<< "$FILES"

if [ "$violations" -ne 0 ]; then
  cat >&2 <<'MSG'

pii-guard blocked this change.
Personal data (real email addresses, phone numbers, raw data files such as
csv/xlsx/sqlite/db/dump/bak) must never enter git. Keep real data in the
database or environment configuration, and use synthetic values in fixtures
and docs. If this is a verified false positive, add a pattern (or a
`path:` exemption) to .githooks/pii_allow.txt and include the reason in
the commit message.
MSG
  exit 1
fi
exit 0
