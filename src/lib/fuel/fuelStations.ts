/**
 * Phase D2 — fuel-station canopies with pump islands, dispensers, columns and a generic lit sign band
 * (docs/fuel-d2/README.md). Replaces the OSM extrusions of the canopy outlines (FUEL_CANOPY_IDS in
 * cityPlaces DETAILED_BUILDING_IDS), which the city mesh drew as 13 m hipped blocks.
 *
 * One group at the scene origin with scale 1/metresPerUnit; local coordinates are ground metres
 * (x east, z south) and RH2000 metres (y), see layout.ts. Three merged, vertex-coloured meshes for all
 * stations: the structure, the soffits (canopy undersides) and the lit parts (sign bands, dispenser
 * displays). Plain MeshStandardMaterials in the configuration the landmarks already use, so the
 * lighting patch adds no shader program; the night glow is the materials' emissive intensity
 * (× the street lighting's night level), 0 by day. The downlights are not meshes here: they are
 * street-lighting fixtures (fuelLighting.ts) with their lenses drawn by the fixture visuals.
 */
import { Group, Mesh, MeshStandardMaterial, ShapeUtils, Vector2, type Color } from 'three';
import type { TerrainService } from '../terrain';
import { Builder, C, type P } from '../landmarks/builder';
import { canopyLayouts, inside, type CanopyLayout, type OrientedBox, type XZ } from './layout';
import { COLOURS, DISPENSER, ISLAND, NIGHT_GAIN, SIGN_BAND_M } from './spec';

/** Ground of the rendered terrain (RH2000 metres) at ground-metre point p. */
export const renderedGround = (terrain: TerrainService, metres: number, p: XZ) =>
  terrain.groundHeight(p[0] / metres, p[1] / metres) * metres;

/** A box with its sides along the canopy axes (u, v), from y0 to y1. */
function orientedBox(
  b: Builder,
  c: Pick<CanopyLayout, 'u' | 'v'>,
  box: OrientedBox,
  y0: number,
  y1: number,
  color: Color,
) {
  const corner = (su: number, sv: number, y: number): P => [
    box.centre[0] + c.u[0] * su * box.halfU + c.v[0] * sv * box.halfV,
    y,
    box.centre[1] + c.u[1] * su * box.halfU + c.v[1] * sv * box.halfV,
  ];
  const dir = (su: number, sv: number): P => [
    c.u[0] * su + c.v[0] * sv,
    0,
    c.u[1] * su + c.v[1] * sv,
  ];
  b.quad(
    corner(-1, -1, y1),
    corner(1, -1, y1),
    corner(1, 1, y1),
    corner(-1, 1, y1),
    color,
    [0, 1, 0],
  );
  b.quad(
    corner(-1, -1, y0),
    corner(1, -1, y0),
    corner(1, 1, y0),
    corner(-1, 1, y0),
    color,
    [0, -1, 0],
  );
  for (const [a, d, n] of [
    [[-1, -1], [1, -1], dir(0, -1)],
    [[1, -1], [1, 1], dir(1, 0)],
    [[1, 1], [-1, 1], dir(0, 1)],
    [[-1, 1], [-1, -1], dir(-1, 0)],
  ] as [number[], number[], P][])
    b.quad(
      corner(a[0], a[1], y0),
      corner(d[0], d[1], y0),
      corner(d[0], d[1], y1),
      corner(a[0], a[1], y1),
      color,
      n,
    );
}

export function createFuelStations(terrain: TerrainService) {
  const metres = terrain.data.reference.metresPerUnit;
  const layouts = canopyLayouts(metres);
  const group = new Group();
  group.name = 'fuel-stations';
  group.userData.placed = true;
  group.scale.setScalar(1 / metres);

  const structure = new Builder(),
    soffits = new Builder(),
    lit = new Builder();
  const deck = C(COLOURS.deck),
    fascia = C(COLOURS.fascia),
    soffit = C(COLOURS.soffit),
    band = C(COLOURS.band),
    columnColour = C(COLOURS.column),
    islandColour = C(COLOURS.island),
    dispenserColour = C(COLOURS.dispenser),
    display = C(COLOURS.display);
  const report: {
    id: string;
    station: string;
    islands: number;
    lamps: number;
    groundY: number;
    clearanceM: number;
  }[] = [];

  for (const c of layouts) {
    const { ring, topY, undersideY } = c;
    // Deck (top) and soffit (underside): the outline triangulated.
    const contour = ring.map(([x, z]) => new Vector2(x, z));
    for (const [i, j, k] of ShapeUtils.triangulateShape(contour, [])) {
      const t = (y: number) => [i, j, k].map((n): P => [ring[n][0], y, ring[n][1]]);
      const [a, b, d] = t(topY);
      structure.tri(a, b, d, deck, [0, 1, 0]);
      const [e, f, g] = t(undersideY);
      soffits.tri(e, f, g, soffit, [0, -1, 0]);
    }
    // Fascia on every edge, with the generic sign band just outside it.
    const bandY0 = undersideY + (topY - undersideY - SIGN_BAND_M) / 2,
      bandY1 = bandY0 + SIGN_BAND_M;
    for (let n = 0; n < ring.length; n++) {
      const a = ring[n],
        b = ring[(n + 1) % ring.length];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (len < 1e-3) continue;
      let nx = (b[1] - a[1]) / len,
        nz = -(b[0] - a[0]) / len;
      const mid: XZ = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      if (inside(ring, [mid[0] + nx * 0.05, mid[1] + nz * 0.05])) [nx, nz] = [-nx, -nz];
      const out: P = [nx, 0, nz];
      structure.quad(
        [a[0], undersideY, a[1]],
        [b[0], undersideY, b[1]],
        [b[0], topY, b[1]],
        [a[0], topY, a[1]],
        fascia,
        out,
      );
      const o = 0.015;
      lit.quad(
        [a[0] + nx * o, bandY0, a[1] + nz * o],
        [b[0] + nx * o, bandY0, b[1] + nz * o],
        [b[0] + nx * o, bandY1, b[1] + nz * o],
        [a[0] + nx * o, bandY1, a[1] + nz * o],
        band,
        out,
      );
    }
    // Islands on the rendered ground, a dispenser on each, a column from the island to the soffit.
    let groundSum = 0;
    c.islands.forEach((island, k) => {
      const g = renderedGround(terrain, metres, island.centre);
      groundSum += g;
      const top = g + ISLAND.heightM;
      orientedBox(structure, c, island, g - 0.3, top, islandColour);
      const disp = c.dispensers[k];
      orientedBox(structure, c, disp, top, top + DISPENSER.heightM, dispenserColour);
      // Displays on both lane faces (±u), self-lit at night.
      const [w, h] = DISPENSER.displayM;
      for (const s of [-1, 1]) {
        const off = disp.halfU + 0.01;
        const cx = disp.centre[0] + c.u[0] * s * off,
          cz = disp.centre[1] + c.u[1] * s * off;
        const y0 = top + DISPENSER.heightM - 0.55,
          y1 = y0 + h;
        const p = (sv: number, y: number): P => [
          cx + c.v[0] * sv * (w / 2),
          y,
          cz + c.v[1] * sv * (w / 2),
        ];
        lit.quad(p(-1, y0), p(1, y0), p(1, y1), p(-1, y1), display, [c.u[0] * s, 0, c.u[1] * s]);
      }
      orientedBox(structure, c, c.columns[k], top, undersideY, columnColour);
    });
    const groundY = c.islands.length
      ? groundSum / c.islands.length
      : renderedGround(terrain, metres, c.centre);
    report.push({
      id: c.id,
      station: c.station,
      islands: c.islands.length,
      lamps: c.lamps.length,
      groundY,
      clearanceM: undersideY - groundY,
    });
  }

  const owned: { dispose(): void }[] = [];
  const own = <T extends { dispose(): void }>(r: T) => (owned.push(r), r);
  const standard = (emissive = false) =>
    own(
      new MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.72,
        metalness: 0.05,
        ...(emissive ? { emissive: '#ffffff', emissiveIntensity: 0 } : {}),
      }),
    );
  const structureMaterial = standard(),
    soffitMaterial = standard(true),
    litMaterial = standard(true);
  const meshes: Mesh[] = [];
  for (const [name, builder, material] of [
    ['fuel-structure', structure, structureMaterial],
    ['fuel-soffits', soffits, soffitMaterial],
    ['fuel-lit', lit, litMaterial],
  ] as const) {
    const mesh = new Mesh(own(builder.geometry()), material);
    mesh.name = name;
    mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh);
    meshes.push(mesh);
  }
  let nightLevel = 0;

  return {
    group,
    layouts,
    report,
    meshes,
    /** Street lighting's night level 0…1 (env.artificial): soffit glow and the lit sign bands/displays. */
    setNightLevel(level: number) {
      nightLevel = Math.min(1, Math.max(0, level));
      soffitMaterial.emissiveIntensity = nightLevel * NIGHT_GAIN.soffit;
      litMaterial.emissiveIntensity = nightLevel * NIGHT_GAIN.band;
    },
    get nightLevel() {
      return nightLevel;
    },
    dispose() {
      owned.forEach((r) => r.dispose());
    },
  };
}
export type FuelStations = ReturnType<typeof createFuelStations>;
