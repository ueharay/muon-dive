#!/usr/bin/env bash
# Verification contract for ZEN DIVE Manila.
#
# This is the machine-checkable definition of "not broken". A loop is only
# allowed to declare success when this exits 0.
#
# PROTECTED FILE — see .claude/loop/harness.json. Do not relax a check to make
# a change pass; if a check is wrong, stop and say so.
#
# Usage: ./scripts/verify.sh   (from the project root)

set -uo pipefail
cd "$(dirname "$0")/.." || exit 1

fail=0
pass() { printf '  ok    %s\n' "$1"; }
bad()  { printf '  FAIL  %s\n' "$1"; fail=1; }

# --- 1. JavaScript syntax --------------------------------------------------
echo "[1/5] JS syntax"
for f in js/*.js api/*.js; do
  [ -e "$f" ] || continue
  if err=$(node --check "$f" 2>&1); then pass "$f"; else bad "$f — $(printf '%s' "$err" | head -1)"; fi
done

# --- 2. Secrets ------------------------------------------------------------
# The Gemini key lives in Vercel env vars only. A key in the tree, or a
# tracked .env/.vercel, is a hard failure — it survives in git history.
echo "[2/5] secrets"
if grep -rIlE 'AIza[0-9A-Za-z_-]{30,}' --exclude-dir=.git --exclude-dir=node_modules . 2>/dev/null | grep -q .; then
  bad "Google API key literal found in the working tree"
else
  pass "no API key literals"
fi
if git ls-files 2>/dev/null | grep -qE '^\.env|^\.vercel/'; then
  bad ".env / .vercel is tracked by git"
else
  pass ".env / .vercel untracked"
fi

# --- 3. Local asset references resolve -------------------------------------
# A 404 on a hero image is invisible in a build step and obvious to a visitor.
echo "[3/5] asset references"
missing=0
refs=$(grep -oE '(src|href)="[^"#]+"' index.html \
       | sed -E 's/^(src|href)="//; s/"$//' \
       | grep -vE '^(https?:|//|data:|mailto:|tel:|#)' \
       | sort -u)
for r in $refs; do
  [ -e "${r#/}" ] || { bad "missing: $r"; missing=1; }
done
[ "$missing" -eq 0 ] && pass "$(printf '%s\n' "$refs" | grep -c .) local refs resolve"

# --- 4. Wiring that has silently broken before -----------------------------
echo "[4/5] wiring"
grep -q 'id="chatWidget"' index.html && pass "chat widget mounted" || bad "chat widget missing from index.html"
grep -q "ENDPOINT = '/api/chat'" js/chat.js \
  && pass "chat endpoint is same-origin relative" \
  || bad "js/chat.js must call the relative '/api/chat' (an absolute host breaks on preview deploys)"
grep -q 'REPLACE_ME' index.html css/style.css js/*.js 2>/dev/null \
  && bad "REPLACE_ME placeholder left in shipped files" \
  || pass "no leftover placeholders"

# --- 5. Page actually serves -----------------------------------------------
echo "[5/6] serves"
port=8231
python3 -m http.server "$port" --bind 127.0.0.1 >/dev/null 2>&1 &
srv=$!
for _ in 1 2 3 4 5 6 7 8 9 10; do
  curl -sf -o /dev/null "http://127.0.0.1:$port/index.html" && break
  perl -e 'select(undef,undef,undef,0.2)'
done
code=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$port/index.html")
kill "$srv" 2>/dev/null; wait "$srv" 2>/dev/null
[ "$code" = "200" ] && pass "index.html -> 200" || bad "index.html -> $code"

# --- 6. Appearance ---------------------------------------------------------
# Everything above answers "is it broken". None of it answers "does it look
# right", which is the only question the owner ever actually asks. The brand
# lockup shipped visibly wrong twice while checks 1-5 were green, so appearance
# is now a gate, not a matter of opinion.
#
# Blank baselines are treated as sabotage, not as a pass: a snapshot of nothing
# would match any future render forever. (That happened on the first run here.)
echo "[6/6] appearance"
if [ ! -d node_modules/@playwright ]; then
  bad "@playwright/test is not installed — run: npm install. Appearance is UNVERIFIED (this is a failure, not a skip)"
else
  blank=0
  while IFS= read -r png; do
    std=$(python3 -c "
from PIL import Image; import numpy as np, sys
print(int(np.array(Image.open(sys.argv[1]).convert('L')).astype(float).std()))" "$png" 2>/dev/null)
    if [ -z "$std" ]; then continue; fi
    if [ "$std" -lt 8 ]; then bad "blank baseline: $png (std=$std) — it captured nothing and would pass forever"; blank=1; fi
  done < <(find tests/__screenshots__ -name '*.png' 2>/dev/null)
  [ "$blank" -eq 0 ] && pass "no blank baselines"

  if npx playwright test >/tmp/pw-verify.log 2>&1; then
    pass "$(grep -oE '[0-9]+ passed' /tmp/pw-verify.log | tail -1) — lockup shape + pixel baselines"
  else
    bad "visual tests failed — see /tmp/pw-verify.log"
    grep -E '✘|Error:|Expected|Received' /tmp/pw-verify.log | head -12 | sed 's/^/        /'
  fi
fi

echo
if [ "$fail" -eq 0 ]; then echo "verify: PASS"; else echo "verify: FAIL"; fi
exit "$fail"
