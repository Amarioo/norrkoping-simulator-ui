# Airport Lighting Phase E1 — remaining gaps

1. **Layout details are estimates.** The AIP gives types, lengths, spacing, colours and the PAPI
   angle; the number of lights per row, the Calvert crossbar layout (one ICAO CAT I crossbar at 300 m
   is drawn), the PAPI distance (345 m, derived from MEHT 56 ft) and unit offsets, the caution-zone
   length (600 m) and all mounting heights are ICAO-based estimates. An aerodrome chart or the
   operator's lighting plan would replace them.
2. **Runway in use is a manual choice** (default 27). The simulator does not report which runway its
   flights use; following them would need a backend field.
3. **'Auto' is a simulator rule** (lit when the street lights are), not the airport's operating
   practice (hours, low visibility, pilot-controlled lighting).
4. **Not modelled:** runway guard lights, the lit windsock and anemometer, apron and terminal
   floodlights, obstacle lights (positions not published or acquired).
5. **Approach lights cross roads and terrain as stands on the ground** (0.8 m, estimate); real
   installations use masts of varying height and frangible structures; terrain under the 900 m
   RWY 27 system was not checked against the light plane.
6. **Colours and intensities are display approximations** (linear RGB, one glow size); ICAO
   chromaticity and the intensity settings (LIH steps) are not modelled.
7. **Marker boxes on RWY 11/29 and at Bråvalla are kept** (unlit), as before; whether to remove them
   is open.
8. **AIP currency:** read in AMDT 6/2026 (effective 2026-10-29). AMDT 7/2026 takes effect
   2026-11-26 and was not checked; NOTAMs were not reconciled.
9. **One machine, headless, uncapped**, as in the P phases; the real 164 Hz screen was not measured.
