# Vehicle Lights Phase F2 — remaining gaps

| Gap | Effect | Possible next step |
|---|---|---|
| The beam is F1's road-vehicle dipped beam | a train's light pool is as short (60 m) and as wide as a car's; real trains carry a far-reaching main beam | a rail beam of its own (narrower, longer) if wanted; needs a source for the values |
| The real lamp arrangement was not researched | two white lenses in front and two red behind, as the generic models were drawn; no third, upper headlamp | look up the front signal of the tram type and the X61 and redraw the lenses (changes the day picture too) |
| No lit windows or interior light | at night a tram or train is a dark body with lit lamps and (trams) a lit destination sign | emissive windows at night, for buses as well |
| Lights do not turn with the direction of travel | section 0 always carries the white lenses. The simulation drives it first, so this is right today; a vehicle reversing at a terminus would show white lights at the back | swap the lens materials by direction if the backend ever reverses a vehicle |
| Trams and trains share the 16-beam budget with road traffic | in dense traffic a tram farther away than 16 other vehicles shows lit lenses but no light pool | raise `VEHICLE_MAX` after measuring weaker hardware |
| No shadows for the beams (as F1) | a beam lights whatever lies within 60 m in front, also behind a wall or another vehicle | per-vehicle occlusion sectors (F1's gap list) |
| By day nothing is lit (as F1) | real trams and trains run with headlamps on by day | optional daytime lens glow |
| All values are estimates | intensity, shape, reach, colour | none planned; values can be tuned on review |
| Weaker hardware | not measured | measure before claiming support |
