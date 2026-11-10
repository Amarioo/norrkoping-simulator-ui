# Phase D2 — remaining gaps

## Stations not built (11 of 32)

None of these has a canopy outline in OSM that the 2020 LiDAR confirms. The LiDAR column is the
nearest flat, roofed patch that lies outside every OSM building. It is recorded in
`src/lib/data/fuel-canopies.json` but not built.

| OSM feature | Name | Why not built | LiDAR candidate |
|---|---|---|---|
| node/247135227 | TRB (Alltransport) | No canopy outline; the point lies in a 15-vertex building (`way/146811372`) | 34 m² at 13.5 m, 4.1 m high |
| node/247135234 | Preem – Norrköping, Trb | No canopy outline; the point lies in `way/146811376` | 46 m² at 38.6 m |
| node/247135416 | Preem – Norrköping, Händelö | No canopy outline, no building | none |
| node/247135502 | St1 Norrköping Stockholmsvägen (34) | The point lies in a building=yes outline (`way/93353420`) about 4–5 m high in the LiDAR, which could be the canopy or a kiosk | none outside buildings |
| node/1376659170 | Gasolfyllarna (LPG depot) | Not a forecourt | none |
| node/2912562712 | CNG Norrköping syd (E.ON) | No outline | none |
| node/6518761186 | E85 AgroEtanol | No outline | none |
| node/10159592470, node/13625640176, node/13625640177 | unnamed (fleet / truck pumps?) | No outline | none nearby |
| way/287685611 | OKQ8 Moa Martinssons gata | The outline exists, but only 24 % of it was roofed in the 2020 LiDAR. The canopy may be newer than 2020, or the outline may be off | 27 m² at 6.2 m |

## Built by decision (2026-11-10), from the LiDAR

After the first report the user asked for these two stations to be built from the laser data. Both are
interpretations, recorded as such in `src/lib/data/fuel-canopies.json` (`outline`) and checked by the
same acceptance rule as the other canopies.

| OSM feature | Name | Outline | Measured |
|---|---|---|---|
| node/247135512 | Ingo Norrköping, Lindövägen | OSM `way/96575513` (`building=yes`, no other tags), read as the canopy | 136.5 m², top 4.27 m above ground, 81 % of the outline roofed, inside the forecourt loop |
| node/1107696684 | OKQ8 Hagebygatan (automatic station) | Measured: the minimum-area rectangle of the flat roofed patch beside the station, outside every OSM building (`lidar:node/1107696684`, `ringSweref`) | 445 m² (28.6 × 15.6 m), the patch fills 85 %, top 3.97 m above ground |

Open points:
- At Hagebygatan the adjoining OSM building `way/95526635` (1 240 m²) is about 4.9 m high in the
  LiDAR. It is drawn 13 m tall, the default for any `building=yes` without a height. It was left
  as it is.
- Both canopies are low, so their fascia is estimated shallower (see below).

The Step 6.2 review also lists five operator stations that have no OSM feature (truck stations,
INGO Ingelsta and others). They are not in the map and were not added.

## Estimates in the model

- **Fascia depth (0.9 m).** The LiDAR measures the top of the canopy, not its underside. On the
  two low canopies (tops 3.97 and 4.27 m) the fascia is limited so that the underside stays 3.5 m above
  the ground: 0.47 and 0.77 m.
- **Islands, dispensers, columns.** One island per 7.5 m of canopy length, running across the canopy,
  with one dispenser and one column each. No source gives the real layout, and from the air the LiDAR
  cannot see under a canopy.
- **Downlights.** A 5 m grid, 1 200 cd and 4 000 K each, giving 73–180 lx (median 106) on the ground
  under the lamps. These figures are this project's choice. They are not luminaire data and were not
  checked against a standard.
- **Sign band and displays.** A neutral white band in the fascia and white dispenser displays, both
  lit at night. Logos and brand colours are left out because they are not licensed.
- **Switching.** Everything is lit whenever the street lighting is on, all night. Real schedules,
  which may differ between staffed and unmanned stations, are unknown.

## Not done

- **Price pylons** (the tall price signs at the road) are left out, because their positions are not
  mapped. The LiDAR might show them as tall thin objects, but this was not tried.
- **Station buildings.** They keep the city mesh's default height of 13 m, used for any
  `building=yes` without a height tag. This looks too tall beside a 5 m canopy. Their real height
  could be measured from the LiDAR like the canopies, but that is a change to the generic buildings
  and outside D2.
- **Forecourt paving.** It is not modelled; the ground shows the map's land use underneath.
- **Not compared with a photograph.** No canopy was checked against a day or night photograph.
