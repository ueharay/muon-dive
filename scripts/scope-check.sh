#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# scope-check — did this batch of work stay inside what was declared?
#
# The loop already refuses to loosen a test and refuses to deploy without
# approval. It had no answer for the failure that actually cost the most trust:
# changing things nobody asked for. Three times on this project a small request
# ("move it up", "fix the dash", "make the wording consistent") came back as a
# silent spec change — a duplicated section, a control that stopped offering a
# choice, an invented label.
#
# So: declare the target before touching anything, and let a command — not
# memory, not good intentions — say whether the diff went somewhere else.
#
#   scripts/scope-check.sh declare "js/sim.js" "css/style.css"   # start of batch
#   scripts/scope-check.sh                                        # before commit
#
# Patterns are shell globs matched against repo-relative paths. Out-of-scope
# files are not an error to be silenced: either drop the change, or say out
# loud that it is there and why. Exit 1 means "report it", not "delete it".
# ---------------------------------------------------------------------------
set -uo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || {
  echo "scope-check: not a git repository — nothing to compare against." >&2; exit 0; }
cd "$ROOT"
DECL=".claude/loop/scope.txt"

# self-test.sh seeds a defect, runs verify.sh, then restores the file from its
# own backup. Anything edited while it is running is silently reverted — a whole
# section was written and lost that way, and the run's own STALE/caught verdicts
# were meaningless because the search strings moved underneath it. Both
# directions are destructive, so the answer is not to work at all while it runs.
if pgrep -f 'self-test\.sh' >/dev/null 2>&1; then
  cat >&2 <<'EOF'
scope-check: self-test.sh is RUNNING. Stop.

It mutates and restores files from its own backup, so any edit made now is
discarded without a word, and its verdict on this run is void anyway because
the tree moved under it. Wait for it to finish, then re-run it on a quiet tree.
EOF
  exit 3
fi

if [ "${1:-}" = "declare" ]; then
  shift
  [ $# -gt 0 ] || { echo "usage: scope-check.sh declare <glob> [glob...]" >&2; exit 2; }
  mkdir -p "$(dirname "$DECL")"
  printf '%s\n' "$@" > "$DECL"
  echo "scope declared:"
  printf '  %s\n' "$@"
  exit 0
fi

if [ ! -f "$DECL" ]; then
  cat >&2 <<'EOF'
scope-check: no scope declared for this batch.

  scripts/scope-check.sh declare "<glob>" ["<glob>" ...]

Writing it down takes one line and is the whole point: a scope recalled after
the fact always happens to match whatever was changed.
EOF
  exit 2
fi

# mapfile is bash 4; macOS ships bash 3.2. Read into arrays the portable way.
PATTERNS=(); CHANGED=()
while IFS= read -r line; do PATTERNS+=("$line"); done < <(
  grep -v '^[[:space:]]*$' "$DECL" | grep -v '^[[:space:]]*#')
# The loop's own bookkeeping is not the work under review. The declaration file
# changes on every batch by definition, and observations.md is appended by the
# observer hook on a timer, so both showed up as "out of scope" on every single
# run — noise that trains you to skim the one list that has to be read.
while IFS= read -r line; do CHANGED+=("$line"); done < <(
  git status --porcelain | sed 's/^...//' | sed 's/.* -> //' \
    | grep -v '^\.claude/loop/scope\.txt$' \
    | grep -v '^\.claude/loop/observations\.md$')

if [ "${#CHANGED[@]}" -eq 0 ]; then echo "scope-check: no changes."; exit 0; fi

inside=(); outside=()
for f in "${CHANGED[@]}"; do
  hit=0
  for p in "${PATTERNS[@]}"; do
    # shellcheck disable=SC2053
    [[ "$f" == $p ]] && { hit=1; break; }
  done
  [ "$hit" -eq 1 ] && inside+=("$f") || outside+=("$f")
done

echo "declared:"; printf '  %s\n' "${PATTERNS[@]}"
echo
echo "in scope   (${#inside[@]})"; [ "${#inside[@]}" -gt 0 ] && printf '  %s\n' "${inside[@]}"

if [ "${#outside[@]}" -eq 0 ]; then
  echo
  echo "scope-check: PASS — nothing changed outside the declaration."
  exit 0
fi

echo
echo "OUT OF SCOPE (${#outside[@]}) — drop these, or tell the user they are here and why:"
printf '  %s\n' "${outside[@]}"
exit 1
