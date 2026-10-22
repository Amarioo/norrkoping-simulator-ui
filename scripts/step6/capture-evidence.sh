#!/usr/bin/env bash
# Step 6 evidence captures (Git Bash). Needs the baseline dev server and the Step 6 dev server:
#   BEFORE=http://127.0.0.1:5182/ AFTER=http://127.0.0.1:5183/ bash scripts/step6/capture-evidence.sh work/step6/ev
# Viewport 1400 × 1000 (map panel 1064 × 660), device scale 1, canvas DPR 1, labels off, Edge headless.
set -euo pipefail
OUT=${1:-work/step6/ev}
POSES=docs/step6/poses.json
STADIUM=stadium-elevated-se,stadium-elevated-nw,stadium-exterior-west,stadium-exterior-ne,stadium-exterior-se,stadium-pitch-north,stadium-pitch-west
cap() { BASE=$1 QUERY=$2 ONLY=${3:-} node scripts/step6/capture.mjs "$POSES" "$4"; }
# Baseline (its own fixed sun) and the Step 6 build with the same sun (sun=legacy).
cap "$BEFORE" "" "" "$OUT/before"
cap "$AFTER" "sun=legacy" "" "$OUT/legacy"
# Time series on the verification date (CEST), floodlights off.
for t in 07:15 07:43 08:15 12:39 17:36 17:52 21:30; do
  cap "$AFTER" "date=2026-10-21&time=$t&stadium=off" "" "$OUT/t${t/:/}"
done
# Floodlights at night, same cameras.
cap "$AFTER" "date=2026-10-21&time=21:30&stadium=event" "$STADIUM" "$OUT/t2130-event"
cap "$AFTER" "date=2026-10-21&time=21:30&stadium=training" "$STADIUM" "$OUT/t2130-training"
echo "captured into $OUT"
