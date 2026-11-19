# Air routes and aircraft types — remaining gaps

1. **The routes are invented.** Three per direction, through hand-picked points. They are not the
   approach or departure procedures of Norrköping, and Bråvalla has none.
2. **Every type flies alike.** A Boeing 737 or an Airbus A321 taxis, rolls, climbs and cruises exactly as
   the turboprop: 960 m of take-off roll, 230–297 km/h in the air. Real jets need more runway and fly
   faster. The type changes the picture only.
3. **Speed depends on the route, not the aircraft.** A longer route is flown faster so that all flights
   take the same time (up to 297 km/h on the southern route from Bråvalla, against 230 km/h on the direct
   one). The speed changes in a step where the cruise begins and ends.
4. **Bråvalla is tight for the jets.** The loop's taxiways are 18 m wide and the jets 36 m. Beside two
   buildings the path bends up to 8 m off the mapped centre line, so the outer wheels run about 3 m outside
   the mapped pavement there, and a wing tip still passes 1.8 m from a building. The near U-turn where the
   loop's two taxiways meet is made by a 44 m aircraft as well.
5. **Wings overlap pavement edges and each other's taxiways everywhere**, since the loops were not built
   for aircraft of this size. On the ground aircraft are never nearer than 50 m centre to centre (the two
   arms of a loop at the runway); two of the widest side by side need 36 m.
6. **The A320neo is there because it was asked for.** No source read shows one at Norrköping; the 737 MAX 8
   and the A321neo have sources. Wheel track, wheelbase and fuselage width are remembered figures.
7. **The jets are sketches of their types.** Proportions of the family, not drawings: no flaps, no cabin
   doors, a window band instead of windows, the same nose and tail cone for Airbus and Boeing. The only
   differences between the three are length, span, tail height, fuselage width, wheel positions, tip device
   and colour.
8. **Liveries are invented and one per type.** Two A321neo look the same. No airline is shown.
9. **Types are drawn with equal chance,** so a fleet can be all turboprops or all of one jet, and a reset
   draws again. The type is not in the settings; it cannot be chosen.
10. **Nearest two cruising aircraft: 178 m** (three aircraft, six simulated hours), against 370 m before
    the routes. The two directions are 100 m apart in height where their routes cross, as before.
11. **The single legacy shuttle** (a settings command without `planes`) has neither type nor route and
    still flies its old curve, part of which lies outside the map west of Bråvalla. The interface never
    asks for it; tests that send `flights: true` alone do.
12. **The turboprop keeps its 55 separate parts** (about 55 draw calls each); a jet is 10.
13. **Not looked at:** the jets' lights from every side at night (the sector rules are the turboprop's,
    tested there; a jet's light positions are tested, their look only in one night picture), a phone, the
    light theme, the published build.
