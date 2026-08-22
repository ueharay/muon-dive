#!/usr/bin/env bash
# Reports whether production is actually serving the local working tree's
# front-end files. Answers ONLY "is prod in sync with local" — it does not
# judge whether the local code is correct (that's scripts/verify.sh's job).
#
# Exists because verify.sh passing was mistaken for "the user can see the
# fix": a CSS fix was committed locally but never `vercel --prod` deployed,
# so the production URL kept serving the old, broken file while local
# checks all reported green. See Learning.md "失敗ログ" (2026-08-22).
#
# Usage: ./scripts/check-live.sh [prod-url]

set -uo pipefail
cd "$(dirname "$0")/.." || exit 1
PROD_URL="${1:-https://zen-dive-manila.vercel.app}"

drift=0
for f in css/style.css js/main.js js/chat.js js/menu.js index.html; do
  [ -f "$f" ] || continue
  remote=$(curl -s --max-time 8 "$PROD_URL/$f") || { echo "  ERROR    $f (could not fetch $PROD_URL)"; drift=1; continue; }
  local_content=$(cat "$f")
  if [ "$remote" = "$local_content" ]; then
    echo "  in sync   $f"
  else
    echo "  DRIFT     $f  (prod differs from the local working tree)"
    drift=1
  fi
done

echo
if [ "$drift" -eq 0 ]; then
  echo "prod ($PROD_URL) is in sync with local. Safe to tell the user it's visible."
else
  echo "prod ($PROD_URL) is NOT in sync. Do not tell the user the fix is visible yet —"
  echo "push + deploy (vercel --prod, needs human approval) first, then re-run this."
fi
exit "$drift"
