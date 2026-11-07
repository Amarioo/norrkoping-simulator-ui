# Landmark B1 part 2 — data provenance (Rådhuset's tower floodlighting)

Values in the model: `FLOODLIGHTS` and `FLOOD_COLOR_WARM` in
[`src/lib/landmarks/radhuset/spec.ts`](../../src/lib/landmarks/radhuset/spec.ts) (tagged `[NIGHT]` /
`[EST]`); conversion to scene units in
[`src/lib/landmarks/floodlights.ts`](../../src/lib/landmarks/floodlights.ts). Machine-readable:
[radhuset-lights-provenance.json](radhuset-lights-provenance.json).

## Coordinates

The fixtures are given in Rådhuset's building frame from part 1 ([B1 data provenance](../landmark-b1/data-provenance.md)):
- **Origin:** the measured tower centre, scene (−1.1325, −10.6945), which is SWEREF E 569 001.70,
  N 6 495 256.27.
- **Axes:** +u along the north façade towards the north-east corner; +v out of the north façade.
- **Units:** ground metres.
- **Heights:** RH2000 metres. A fixture on a roof or on the cornice has an absolute height `z`; the
  flood on the square has a height above the rendered ground (`height`).

`toFacadeEmitters()` converts them to scene units: scene = (SWEREF 99 TM − (569 030, 6 494 989)) /
(25 · 0.9996584126), with x east and z south, and y = RH2000 / 25.

## Sources

| Id | Source | Date | Licence / use | Used for |
|---|---|---|---|---|
| NIGHT | Commons [Norrköping och Motala ström i mörker.jpg](https://commons.wikimedia.org/wiki/File:Norrk%C3%B6ping_och_Motala_str%C3%B6m_i_m%C3%B6rker.jpg) (DivadH), taken from the north bank (GPS 58.594334, 16.186333) | 2017-11-30 20:18 (EXIF) | CC BY 4.0, reference only, nothing copied | That the tower is floodlit: the shaft above the main roof, with its bands, clock and belfry, the cornice and the pyramid roof up to Gull-Olle, in a warm golden light. That the façades below are dark, lit only by the street lamps |
| NIGHT | Commons [Norrköpings rådhus.jpg](https://commons.wikimedia.org/wiki/File:Norrk%C3%B6pings_r%C3%A5dhus.jpg) (Ola.j.hedin), from the quay | 2019-01-15 08:08 (dawn) | CC BY-SA 4.0, reference only | The spire is still lit at dawn |
| B1 | Rådhuset's measured geometry (part 1): shaft u −5.3 … 5.25, v −5.6 … 5.0; cornice 57.3–58.3 m; roof 58.3 → 68.65 m; Gull-Olle to 73.15 m; north-wing roof profile; the tall courtyard block's ridge at 36.1 m | LiDAR 2020-02-03 | CC BY 4.0 ©Lantmäteriet (processed) | Where the fixtures can stand (the roofs, the cornice, the square) and which faces they light |
| SEARCH | Searches of the municipality (incl. the 2012 *Belysningsplan*), Svenska kyrkan, the local press and lighting firms | 2026-11-06 | — | Negative result: no document describes the fixtures |

## Measured, documented, estimated

| Value | Kind | Source |
|---|---|---|
| The tower above the main roof is floodlit at night (shaft, clock, belfry, cornice, roof, statue); the façades below are not | **documented** (photograph) | NIGHT 2017 |
| Light colour: a warm golden white, modelled as ≈ 2200 K (linear RGB 1.0 / 0.6 / 0.27) | **estimate** from the photograph's tone | NIGHT, EST |
| South and east faces lit like the north and west faces | **estimate** (only the north and west faces are seen in the photographs) | EST |
| 8 fixtures: north face from Tyska torget (25 m in front, 300 000 cd, 9°/15°); south face from the courtyard block's ridge (40 000 cd); east and west faces from the north wing's roof (60 000 cd); roof and statue from four floods on brackets 1.2 m beyond the cornice (25 000 cd, 30°/52°) | **estimate** | EST, placed on surfaces from B1 |
| Resulting illuminance on the surfaces (facadeIlluminance × cos of incidence): north face 54 lx, south 205 lx, east and west 97 lx at 45 m; each roof face 374 lx at 62 m; the north façade below < 1 lx | derived from the estimates | test `floodlights.test.ts` |
| Switching: with the street lighting (env.artificial) | **estimate** (simulator rule) | EST |

Nothing was invented as fact: the existence of the lighting and what it lights come from the
photographs; everything about the fixtures is marked as an estimate.
