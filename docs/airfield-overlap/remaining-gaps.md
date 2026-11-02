# Airfield overlap fix — remaining gaps

1. **Taxiway centre lines cross the runway** (yellow lines over the threshold bars), as mapped in
   OSM. Kept on purpose (user, 2026-11-02); real airfields often paint lead-in lines, but usually not
   across the threshold bars. Could be clipped to the runway edge later.
2. **Only the airfields were checked close up** (8 runway ends, 16 views, plus 7 fullscreen views).
   Other places where `layeredSurface` pavements of equal rank overlap were not searched.
3. **No runway lighting** (edge, threshold, approach lights): roadmap E1, not part of this fix.
4. **"Before" close-ups** were taken on `main` before P2c; P2c proved those views pixel-identical, so
   they stand for `origin/main` too.
