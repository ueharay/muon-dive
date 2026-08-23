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

snapshot() { cp css/style.css "$BACKUP/style.css"; cp js/chat.js "$BACKUP/chat.js"
             cp index.html "$BACKUP/index.html"; cp js/i18n.js "$BACKUP/i18n.js"
             cp js/price.js "$BACKUP/price.js"; cp js/sim.js "$BACKUP/sim.js"
             cp tests/fixtures/lockups.html "$BACKUP/lockups.html"; }
restore()  { [ -f "$BACKUP/style.css" ] && cp "$BACKUP/style.css" css/style.css
             [ -f "$BACKUP/chat.js" ]  && cp "$BACKUP/chat.js"  js/chat.js
             [ -f "$BACKUP/index.html" ] && cp "$BACKUP/index.html" index.html
             [ -f "$BACKUP/i18n.js" ] && cp "$BACKUP/i18n.js" js/i18n.js
             [ -f "$BACKUP/price.js" ] && cp "$BACKUP/price.js" js/price.js
             [ -f "$BACKUP/sim.js" ] && cp "$BACKUP/sim.js" js/sim.js
             [ -f "$BACKUP/lockups.html" ] && cp "$BACKUP/lockups.html" tests/fixtures/lockups.html; return 0; }

snapshot
fail=0
n=0

# Each mutation is a real defect that has either shipped here or nearly did.
# A mutation that no longer matches anything is the more dangerous failure of
# the two: it silently stops seeding a defect, verify.sh passes, and the run
# reads as "this defect is not covered" when the truth is "this test rotted".
# Mutations quote concrete source text, so ordinary copy edits break them.
# Checking that the tree actually changed keeps the two apart.
mutate() {
  n=$((n+1))
  local name="$1" cmd="$2"
  printf '\n[%d] %s\n' "$n" "$name"
  restore
  local sig_before sig_after
  sig_before=$(cat css/style.css js/chat.js index.html js/i18n.js js/price.js js/sim.js tests/fixtures/lockups.html | shasum | cut -d' ' -f1)
  eval "$cmd"
  sig_after=$(cat css/style.css js/chat.js index.html js/i18n.js js/price.js js/sim.js tests/fixtures/lockups.html | shasum | cut -d' ' -f1)

  if [ "$sig_before" = "$sig_after" ]; then
    printf '  STALE     the mutation changed nothing — it references text that no longer exists.\n'
    printf '            Update the mutation to match the current source, then re-run.\n'
    fail=1
    restore
    return
  fi

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

mutate "English copy reverts to selling the Japanese language" \
  "perl -0pi -e 's/\"en\":\"Everything is run to a Japanese standard\.\"/\"en\":\"You are taught in Japanese, and ask in Japanese.\"/' js/i18n.js"

# Targets a dictionary entry that nothing currently renders. It survived until
# the copy test was widened to scan i18n.js itself, which is the point: a banned
# claim sitting dormant in the dictionary is a landmine for the next revision.
mutate "unverified English-instruction claim, in a non-rendered i18n entry" \
  "perl -0pi -e 's/\"en\":\"A PADI instructor, one-on-one\.\"/\"en\":\"An English-speaking instructor, one-on-one.\"/' js/i18n.js"

mutate "untranslated Japanese leaks onto the English page (the 5:00頃 bug)" \
  "perl -0pi -e 's/,\{\"jp\":\"5:00頃\",\"en\":\"5:00\"\}//' js/i18n.js"

mutate "schedule counts revert to spelled-out English numbers" \
  "perl -0pi -e 's/\"en\":\"3 dives\"/\"en\":\"Three dives\"/' js/i18n.js"

mutate "the room charge becomes per-person instead of per-room" \
  "perl -0pi -e 's/\\* PRICING\\.nights \\+ PRICING\\.earlyCheckIn\\) \\* sel\\.rooms;/* PRICING.nights + PRICING.earlyCheckIn) * sel.divers;/' js/price.js"

mutate "an unneeded room stays in the price after switching to a bigger grade" \
  "perl -0pi -e 's/state\\.rooms = roomsPinned \\? Math\\.max\\(state\\.rooms, needed\\) : needed;/if (state.rooms < needed) state.rooms = needed;/' js/sim.js"

# The pixel baselines are taken in tests/fixtures/lockups.html because the live
# page cannot hold the mark still. That only stays honest while the fixture
# matches the page, so drifting them apart must be caught.
mutate "the lockup fixture drifts away from the page" \
  "perl -0pi -e 's/<span class=\"nav__word\">ZEN DIVE<\\/span>/<span class=\"nav__word\">ZEN DIVE X<\\/span>/' tests/fixtures/lockups.html"

restore
echo
if [ "$fail" -eq 0 ]; then
  echo "self-test: PASS — every seeded defect was caught."
else
  echo "self-test: FAIL — at least one defect slipped through. Fix the check before trusting verify.sh."
fi
exit "$fail"
