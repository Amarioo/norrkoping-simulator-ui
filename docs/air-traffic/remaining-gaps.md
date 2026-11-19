# Air traffic — remaining gaps

1. **The terminal at Kungsängen is not used.** The aircraft wait on the taxiway loop north of the
   threshold of runway 09, not on the terminal apron south of it. The mapped apron has one link to the
   runway, used in both directions: an arrival leaving the runway would meet the queue waiting to enter it.
   Using the terminal needs stands (none are mapped, so their places would be estimates), a rule for the
   shared link, and aircraft that turn round on a stand. A possible next phase.
2. **No parking.** An aircraft's 45 s on the ground before it may leave stands in for a turnaround. With
   five or six aircraft the wait for a departure slot is longer than that anyway (up to about 7 min).
3. **Queues are short in steady running.** With six aircraft there are, at each airport, mostly one waiting
   and one moving; the three-aircraft queue is seen at the start only. The two runways cannot take more
   flights than one per 176 s each way, so more aircraft would mean longer queues, not more flights; the
   loops hold six.
4. **One direction per runway, no wind.** Take-off and landing always in the mapped direction of the
   runway line (09 at ESSP). An arrival therefore rolls out, turns on the runway and taxis 700–800 m back
   to the loop, which is what limits the runways.
5. **A wing tip passes 1.7 m from a building at Bråvalla** (way 104336425; the next nearest are 7 m and
   9 m away). The path follows the mapped taxiway centre line there. No path runs through a building
   ([data/clearance.json](data/clearance.json)). Trees, masts, fences and lights are not checked.
6. **A near U-turn on the ground at Bråvalla.** The two taxiways of its loop meet at an acute angle, and
   the aircraft turns about 150° within some 20 m there. The mapped way that would avoid it runs through
   two buildings.
7. **Flight tracks are geometry, not procedures.** Turn, straight, turn at constant speed and radius; a
   5° approach from 150 m; speed changes in steps between the phases (2.2, 2.55, 2.5 units/s). The drawn
   bank follows the single shuttle's rule (at most 20°). No wake or radar separation rules: the runway is
   simply free 20 s before a touchdown.
8. **Levels are above the vertical origin, not above the ground.** Flights from Bråvalla cruise 200 m and
   approach from 150 m; whether every mapped building and mast on the way is lower was not checked (the
   single shuttle flew 200 m both ways).
9. **Holding is untested in the app.** The circle at the approach fix is covered by a backend test that
   blocks a runway by hand. It does not occur in normal running (six simulated hours per fleet size without
   one), so it has not been seen in the browser.
10. **Changing the number mid-flight.** Aircraft with the highest numbers disappear at once, also in the
    air; new ones appear at the back of a queue. No fade or fly-away.
11. **The single legacy shuttle remains.** A settings command without `planes` still flies it, with its
    own older ground route (which crosses grass at both airports). Tests that send `flights: true` alone
    therefore still see that shuttle. The interface always sends a number.
12. **Clicking an aircraft does nothing.** Vehicles can be picked on the map; aircraft are chosen in the
    list of the Flyg tab.
13. **Not measured:** frame rate on the published build, a phone, and the stream's size with six aircraft
    over the network (the snapshot grows by 229 bytes per aircraft before compression). The frame time
    measurement sat at the screen's refresh interval for every fleet size, so it shows no slowdown but not
    the headroom.
14. **The aircraft model is 55 separate parts**, so each aircraft in view costs about 55 draw calls. Merging
    the parts would cut that to a handful; a candidate for the performance track.
