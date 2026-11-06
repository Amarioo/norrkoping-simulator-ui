# Airport Lighting Phase E1 — remaining gaps

1. **Layout details are estimates.** The AIP gives types, lengths, spacing, colours and the PAPI
   angle; the number of lights per row, the Calvert crossbar widths (sized by the SKYbrary rule; the
   actual widths at ESSP are not published), the PAPI distance (345 m, derived from MEHT 56 ft) and unit offsets, the caution-zone
   length (600 m) and all mounting heights are ICAO-based estimates. An aerodrome chart or the
   operator's lighting plan would replace them.
2. **Runway in use is a manual choice** (default 27). The simulator does not report which runway its
   flights use; following them would need a backend field.
3. **'Auto' is a simulator rule** (lit when the street lights are), not the airport's operating
   practice (hours, low visibility, pilot-controlled lighting).
4. **Not modelled:** runway guard lights, the lit windsock and anemometer, apron and terminal
   floodlights, obstacle lights (positions not published or acquired).
5. **Approach light plane and masts are estimates.** RWY 09 rises 1:66 (masts at Söderleden as tall as
   the street lights in the user's photos); RWY 27 is level for lack of evidence. Mast positions, the
   bars and the grey footbridges over the creek (from the map) are not matched to the real structures.
6. **Colours and intensities are display approximations** (linear RGB, one glow size); ICAO
   chromaticity and the intensity settings (LIH steps) are not modelled.
7. **Marker boxes on RWY 11/29 and at Bråvalla are kept** (unlit), as before; whether to remove them
   is open.
8. **AIP currency:** read in AMDT 6/2026 (effective 2026-10-29). AMDT 7/2026 takes effect
   2026-11-26 and was not checked; NOTAMs were not reconciled.
9. **One machine, headless, uncapped**, as in the P phases; the real 164 Hz screen was not measured.
10. **Obstacle lights on tall city structures are not modelled** (no lighting in the ESSP obstacle
   list; the national digital obstacle data was not acquired). They warn; they do not guide to the
   runway.
