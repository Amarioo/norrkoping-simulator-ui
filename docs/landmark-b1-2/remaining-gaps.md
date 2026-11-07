# Landmark B1 part 2 — remaining gaps

## 1. The fixtures are estimates

The photographs show **that** the tower is floodlit and **what** is lit. They do not show where the
fixtures stand, how they are aimed, what their beams and intensities are, or the exact colour. The
eight fixtures reproduce the 2017 photograph with plausible mounting places:
- one on Tyska torget;
- three on the roofs around the tower;
- four on brackets at the cornice.

**What would settle it:** a close evening photograph of the tower base and the cornice, which would
show the fixtures, or the municipality's lighting documentation for the town hall.

## 2. Simplifications of the lighting

- **No shadows.** The cornice does not shade the roof's lowest metre, and the floods on the roofs
  also reach the parts of the shaft that the roof hides from them in reality. The shader has no
  occlusion for façade floodlights (the same as for Hedvigs kyrka).
- **The north flood** stands on the square 25 m in front of the tower. If the real one is mounted on
  the building, the pool on the shaft's lower part would look different.
- **The clock dials** are lit by the floods like the façade. Whether they are also lit from inside is
  not known.
- **Gull-Olle** is lit by the cornice floods. Whether it has its own spotlight is not known.

## 3. The façade budget is full

Hedvigs kyrka (8) and Rådhuset's tower (8) use all 16 façade emitters (`FACADE_MAX`). The next
floodlit landmark, for example Sankt Olai if its lighting survives the rebuilt Olaiparken, needs one
of the following:
- a larger array. This costs fragment uniforms: the array now takes 48 of the 224 vec4s that WebGL 2
  guarantees, and the stadium and vehicle arrays take more;
- fewer fixtures per landmark;
- a second zone.

A 17th emitter is refused with an error, never dropped silently (test in `hedvig.test.ts`).

## 4. Not in scope

- The town hall's façades, the clock's time, and the windows at night: the photograph shows them dark.
- The other churches of B2 (Olai, Matteus, S:t Johannes).
