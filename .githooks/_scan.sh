#!/usr/bin/env bash
# Shared scanner used by pre-commit / commit-msg / pre-push hooks and CI.
#
# Reads text on stdin, emits matching lines to stdout, exits non-zero
# if any forbidden pattern is found. LLM-independent guardrail.
#
# Allowed: the legitimate author phrase "<initials> Sunada".
# Blocked: bare initials / project nicknames / AI co-author signatures /
#          decision-provenance comment markers.
#
# Pattern strings are assembled from fragments at runtime so this script
# itself does not contain literal forbidden words (which would otherwise
# cause it to flag its own diff at install time).
set -euo pipefail

# Build the forbidden regex from fragments so this script itself does
# not contain a literal occurrence of any blocked term.
n1='K''J'
n2='Arc''hie'
n3='Na''ncy'
sig1='Co-Au''thored-By'
sig2='Genera''ted with .*Claude'
prov='Iter [0-9]+(\.[0-9]+)? \('

forbidden_re="(\b${n1}\b|\b${n2}\b|\b${n3}\b|${sig1}|${sig2}|${prov})"

# Strip the allowed phrase before pattern matching.
input=$(cat | sed -E "s/${n1} Sunada//g")

matches=$(printf '%s' "$input" | grep -nE "$forbidden_re" || true)

if [ -n "$matches" ]; then
  printf '%s\n' "$matches"
  exit 1
fi
exit 0
