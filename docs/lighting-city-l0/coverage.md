# Phase L0 — coverage by reason, road group and district

Generated from [data/stats.json](data/stats.json) (inside the map clip; centreline km, dual carriageways count twice).

## By reason

| Reason | Ways | km | lit km |
|---|---:|---:|---:|
| `osm-lit-yes` | 2040 | 255.9 | 255.9 |
| `osm-lit-no` | 175 | 33.2 | 0.0 |
| `gap-fill` | 34 | 0.8 | 0.8 |
| `rule-street-in-tatort` | 1822 | 278.2 | 278.2 |
| `rule-sidewalk` | 172 | 13.4 | 13.4 |
| `rule-path-along-street` | 700 | 83.1 | 83.1 |
| `rule-path-in-tatort` | 1720 | 150.2 | 150.2 |
| `rule-roundabout` | 34 | 1.2 | 1.2 |
| `rule-junction` | 74 | 20.0 | 3.3 |
| `dark-outside-tatort` | 1226 | 308.0 | 0.0 |
| `dark-motorway-untagged` | 84 | 13.5 | 0.0 |
| `dark-private-service` | 3273 | 313.1 | 0.0 |
| `dark-forest-path` | 134 | 17.2 | 0.0 |
| `dark-unpaved-path` | 118 | 11.0 | 0.0 |
| `dark-minor-path` | 221 | 24.1 | 0.0 |
| `dark-track` | 390 | 91.2 | 0.0 |
| `excluded` | 29 | 8.9 | 0.0 |

## By road group

| Group | km | lit km | of which tag | gap | rule |
|---|---:|---:|---:|---:|---:|
| excluded | 8.9 | 0.0 | 0.0 | 0.0 | 0.0 |
| major | 180.3 | 121.6 | 76.6 | 0.4 | 44.6 |
| minor | 439.0 | 327.7 | 89.9 | 0.1 | 237.7 |
| motorway | 43.9 | 14.5 | 14.1 | 0.2 | 0.2 |
| path | 541.0 | 317.2 | 70.4 | 0.1 | 246.7 |
| service | 316.4 | 2.8 | 2.6 | 0.0 | 0.3 |
| track | 93.5 | 2.3 | 2.3 | 0.0 | 0.0 |

## By district (nearest OSM place name — approximate, not official boundaries)

| District | km | lit km | lit share | tag km | rule km | in tätort km | new stations | existing fixtures |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Gamla Staden | 16.3 | 14.2 | 87 % | 8.8 | 5.4 | 16.3 | 420 | 22 |
| Söderstaden | 25.9 | 21.5 | 83 % | 4.9 | 16.6 | 25.9 | 636 | 0 |
| Nordantill | 24.5 | 20.2 | 82 % | 13.3 | 6.6 | 24.5 | 427 | 200 |
| Såpkullen | 20.9 | 17.2 | 82 % | 2.6 | 14.5 | 20.9 | 407 | 16 |
| Taborsberg | 12.0 | 9.8 | 81 % | 2.1 | 7.6 | 12.0 | 273 | 0 |
| Marielund | 30.3 | 23.9 | 79 % | 5.6 | 18.4 | 30.3 | 786 | 0 |
| Oxelbergen | 21.6 | 17.0 | 79 % | 3.1 | 13.8 | 21.6 | 524 | 0 |
| Östantill | 25.7 | 20.1 | 78 % | 9.9 | 10.3 | 25.7 | 578 | 0 |
| Kneippen | 47.3 | 36.0 | 76 % | 17.8 | 18.2 | 47.2 | 965 | 0 |
| Berget | 18.1 | 13.8 | 76 % | 7.6 | 6.2 | 18.1 | 417 | 25 |
| Enebymo | 12.7 | 9.6 | 76 % | 7.2 | 2.4 | 12.7 | 299 | 0 |
| Saltängen | 16.8 | 12.6 | 75 % | 2.0 | 10.6 | 16.8 | 435 | 0 |
| Lagerlunda | 19.1 | 14.2 | 75 % | 4.9 | 9.3 | 19.1 | 448 | 0 |
| Ektorp | 23.9 | 17.6 | 74 % | 2.7 | 14.9 | 23.9 | 650 | 0 |
| Skarphagen | 28.2 | 20.7 | 73 % | 2.3 | 18.4 | 27.8 | 627 | 0 |
| Butängen | 25.1 | 17.8 | 71 % | 11.2 | 6.5 | 25.1 | 501 | 10 |
| Karlshov | 9.6 | 6.7 | 70 % | 3.2 | 3.5 | 9.6 | 221 | 0 |
| Haga | 21.1 | 14.6 | 69 % | 5.2 | 9.4 | 21.1 | 446 | 0 |
| Ljura | 36.2 | 24.0 | 66 % | 8.4 | 15.6 | 36.2 | 691 | 0 |
| Klingsberg | 21.2 | 13.9 | 66 % | 5.7 | 8.1 | 18.9 | 422 | 0 |
| Vilbergen | 30.5 | 19.4 | 63 % | 8.8 | 10.5 | 30.5 | 720 | 0 |
| Kärrhagen | 9.0 | 5.7 | 63 % | 2.2 | 3.5 | 7.7 | 219 | 0 |
| Sylten | 15.8 | 9.9 | 62 % | 3.5 | 6.4 | 14.3 | 294 | 0 |
| Marbystrand | 53.3 | 31.0 | 58 % | 9.6 | 21.4 | 39.4 | 1145 | 0 |
| Grönhög | 16.1 | 9.0 | 56 % | 5.7 | 3.3 | 13.8 | 305 | 0 |
| Hageby | 51.0 | 28.4 | 56 % | 5.1 | 23.3 | 46.8 | 1060 | 0 |
| Vidablick | 34.3 | 19.2 | 56 % | 8.4 | 10.7 | 34.3 | 632 | 0 |
| Brånnestad | 16.2 | 9.0 | 55 % | 2.9 | 6.1 | 10.1 | 323 | 0 |
| Navestad | 40.5 | 22.3 | 55 % | 3.1 | 19.2 | 29.8 | 833 | 0 |
| Björkalund | 23.4 | 12.9 | 55 % | 6.2 | 6.6 | 14.7 | 284 | 0 |
| Hallberga | 12.1 | 6.5 | 54 % | 5.1 | 1.3 | 9.3 | 220 | 0 |
| Smedby | 52.2 | 26.4 | 51 % | 3.7 | 22.7 | 42.3 | 837 | 0 |
| Pryssgården | 52.4 | 25.3 | 48 % | 12.0 | 13.3 | 29.8 | 711 | 0 |
| Fyrby | 15.0 | 7.1 | 47 % | 0.1 | 6.9 | 9.4 | 203 | 0 |
| Rambodal | 52.4 | 23.7 | 45 % | 2.3 | 21.4 | 30.9 | 828 | 0 |
| Risängen | 57.4 | 23.5 | 41 % | 5.7 | 17.9 | 34.3 | 763 | 0 |
| Slottshagen | 65.3 | 25.6 | 39 % | 1.5 | 24.1 | 44.3 | 932 | 0 |
| Klockaretorpet | 174.4 | 51.8 | 30 % | 12.1 | 39.6 | 61.5 | 1815 | 0 |
| Himmelstalund | 30.1 | 8.0 | 27 % | 2.2 | 5.9 | 18.7 | 346 | 0 |
| Ingelsta | 159.9 | 42.5 | 27 % | 20.9 | 21.3 | 64.8 | 1186 | 0 |
| Marby | 32.2 | 6.5 | 20 % | 1.2 | 5.3 | 8.6 | 199 | 0 |
| Kättsätter | 29.4 | 5.1 | 17 % | 2.6 | 2.5 | 9.4 | 219 | 0 |
| Tråbrunna | 55.9 | 9.2 | 17 % | 0.0 | 9.2 | 10.7 | 327 | 0 |
| Hagsätter | 57.9 | 9.3 | 16 % | 0.0 | 9.3 | 13.6 | 332 | 0 |
| Vrinnevi | 30.2 | 3.6 | 12 % | 2.2 | 1.4 | 2.1 | 135 | 0 |

Districts with a low lit share (Vrinnevi, Hagsätter, Tråbrunna, Kättsätter, Marby, Ingelsta) are mostly forest, farmland, outskirts or private industrial roads, which the rule leaves dark.
