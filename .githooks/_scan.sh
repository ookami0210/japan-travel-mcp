#!/usr/bin/env bash
# Shared scanner used by pre-commit / commit-msg / pre-push hooks and CI.
#
# Reads text on stdin, emits matching lines to stdout, exits non-zero
# if any forbidden pattern is found. LLM-independent guardrail.
#
# Allowed: the legitimate author phrase "<initials> Sunada".
# Blocked at the public layer:
#   - bare maintainer initials
#   - AI co-author commit trailers
#   - AI generation signatures
#   - decision-provenance comment markers
#
# Personal nicknames (private vocabulary the maintainer wants to keep
# off the public repo) are NOT hard-coded here. Instead, they are
# loaded from the env var FORBIDDEN_NICKNAMES at runtime (regex
# fragments separated by `|`). Set this in your shell rc on machines
# that should also block those nicknames; leave unset on public CI to
# keep the regex out of public logs.
#
# Pattern strings are assembled from fragments at runtime so this script
# itself does not contain literal forbidden words (which would otherwise
# cause it to flag its own diff at install time).
set -euo pipefail

# Build the forbidden regex from fragments so this script itself does
# not contain a literal occurrence of any blocked term.
n1='K''J'
sig1='Co-Au''thored-By'
sig2='Genera''ted with .*Claude'
prov='Iter [0-9]+(\.[0-9]+)? \('

forbidden_re="(\b${n1}\b|${sig1}|${sig2}|${prov})"

# Optional private patterns from env (e.g. personal nicknames). Format:
# regex fragments joined by `|`, e.g. '\bFoo\b|\bBar\b'.
extra="${FORBIDDEN_NICKNAMES:-}"
if [ -n "$extra" ]; then
  forbidden_re="${forbidden_re}|${extra}"
fi

# Strip the allowed phrase before pattern matching.
input=$(cat | sed -E "s/${n1} Sunada//g")

matches=$(printf '%s' "$input" | grep -nE "$forbidden_re" || true)

if [ -n "$matches" ]; then
  printf '%s\n' "$matches"
  exit 1
fi
exit 0
