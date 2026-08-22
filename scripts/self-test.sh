#!/usr/bin/env bash
# Does the verification actually work?
#
# A check that cannot fail is not a check. This script deliberately breaks the
# code in specific, known ways and asserts that ./scripts/verify.sh turns red
# for each one. If a mutation survives, the corresponding check is decorative
# and the harness is lying about the project's health.
#
# This exists because the project shipped a visibly broken logo twice while
# verify.sh reported PASS: the checks covered "does it parse / does it serve"
# and nothing at all about what the page looks like. The gap was invisible
# precisely because nobody ever asked the checks to prove they could fail.
#
# PROTECTED FILE — see .claude/loop/harness.json.
#
# Usage: ./scripts/self-test.sh      (slow: runs the full verify per mutation)

set -uo pipefail
cd "$(dirname "$0")/.." || exit 1

BACKUP=$(mktemp -d)
trap 'restore; rm -rf "$BACKUP"' EXIT

snapshot() { cp css/style.css "$BACKUP/style.css"; cp js/chat.js "$BACKUP/chat.js"; cp index.html "$BACKUP/index.html"; }
restore()  { [ -f "$BACKUP/style.css" ] && cp "$BACKUP/style.css" css/style.css
             [ -f "$BACKUP/chat.js" ]  && cp "$BACKUP/chat.js"  js/chat.js
             [ -f "$BACKUP/index.html" ] && cp "$BACKUP/index.html" index.html; return 0; }

snapshot
fail=0
n=0

# Each mutation is a real defect that has either shipped here or nearly did.
mutate() {
  n=$((n+1))
  local name="$1" cmd="$2"
  printf '\n[%d] %s\n' "$n" "$name"
  restore
  eval "$cmd"
  if ./scripts/verify.sh >/tmp/selftest-$n.log 2>&1; then
    printf '  SURVIVED  verify.sh still passed — this defect is NOT covered\n'
    fail=1
  else
    printf '  caught    verify.sh failed as it should\n'
  fi
  restore
}

echo "Mutation testing ./scripts/verify.sh — each defect below must turn it red."

mutate "footer lockup stretches (the bug that shipped: MANILA 2x too wide)" \
  "perl -0pi -e 's/(\.foot__lockup\{grid-column:2;grid-row:1;)justify-self:start;/\$1/' css/style.css"

mutate "ring size drifts off the nav's ratio" \
  "perl -0pi -e 's/\.foot__maru\{display:block;width:2\.35rem/.foot__maru{display:block;width:3.6rem/' css/style.css"

mutate "MANILA font-size drifts off the nav's ratio" \
  "perl -0pi -e 's/(\.foot__city\{[^}]*font-size:)\.73rem/\${1}.4rem/' css/style.css"

mutate "chat endpoint hardcoded to an absolute host" \
  "perl -0pi -e \"s|ENDPOINT = '/api/chat'|ENDPOINT = 'https://example.com/api/chat'|\" js/chat.js"

mutate "referenced image is missing" \
  "perl -0pi -e 's|<body|<img src=\"assets/img/does-not-exist.jpg\"><body|' index.html"

mutate "JS syntax error" \
  "printf '\nfunction(' >> js/chat.js"

restore
echo
if [ "$fail" -eq 0 ]; then
  echo "self-test: PASS — every seeded defect was caught."
else
  echo "self-test: FAIL — at least one defect slipped through. Fix the check before trusting verify.sh."
fi
exit "$fail"
