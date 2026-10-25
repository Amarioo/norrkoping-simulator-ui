# Vehicle Lights Phase F1 — remaining gaps

| Gap | Effect | Possible next step |
|---|---|---|
| No shadows for the beams | a beam lights a façade AND whatever stands behind it within 60 m (other buildings, cars); most visible when a car faces a building at close range | per-vehicle occlusion sectors (like the street lamps' 16 sectors) computed on the CPU from building footprints |
| One emitter per vehicle, symmetric beam | no separate left/right lamps, no kerb-side step of a real dipped beam | two emitters for the nearest 2–4 vehicles if the budget allows |
| Only the 16 nearest vehicles cast light | farther cars show glowing lenses but no light pool; at most 16 pools on screen | raise VEHICLE_MAX after measuring weaker hardware |
| No glow/halo around distant lenses | lenses are a few pixels; beyond ≈ 300 m a car's lights are hard to see | small halo quads (like the street-lamp halos) for vehicles in view |
| Tail lights cast no light; no brake or indicator lights | rear of a car looks the same moving or stopped | brake lights from the simulation's `stopped` / speed changes |
| Day state has no lights | real vehicles drive with dipped beams or daytime running lights | optional daytime running lights (lens only) if wanted |
| Trams and trains | unchanged (as specified) | Phase F2 |
| Aircraft | unchanged | Phase E2 |
| All values are estimates | intensity, shape, reach, colour | no open vehicle photometry is planned; values can be tuned on review |
| Weaker hardware | not measured | measure before claiming support |
