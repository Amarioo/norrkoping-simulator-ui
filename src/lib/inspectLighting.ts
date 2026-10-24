/**
 * Development-only street-lighting inspection overlay (Lighting Phase A1): open the dev server with
 * `?inspect=lighting`. Production builds never load this module (Scene.svelte imports it behind
 * import.meta.env.DEV), and nothing here changes the lighting itself.
 *
 * RUNTIME lights (what the shader renders; controller.inspect()) — solid pins on their support:
 *   blue   pilot, mapped OSM lamp            green   pilot, estimate
 *   cyan   A1, mapped OSM lamp               orange  A1 estimate, 8 m street bracket
 *   yellow A1 estimate, 6 m street bracket   purple  A1 estimate, 4 m park lantern
 *   (a white disc under a pin: bridge-deck support)
 * RESEARCH-ONLY inventory (never rendered as lights) — translucent grey stubs / lines:
 *   grey stubs  rejected or suppressed A1 candidates (reason in __lightingInspection.rejected)
 *   red lines   ways mapped lit=no (explicitly unlit)     grey lines  rendered ways without lit tag
 * Also: the A1 zone boundaries (green lines) and the light-grid occupancy of every non-empty 25 m
 * cell (flat tiles, blue = 1 lamp … red = 16, the shader capacity).
 * `globalThis.__lightingInspection` holds counts, status/overflow, near-capacity cells with their
 * contributing IDs, rejected candidates and the missing-evidence ways.
 */
import {
  BufferGeometry,
  Color,
  CylinderGeometry,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  LineBasicMaterial,
  LineSegments,
  Matrix4,
  MeshBasicMaterial,
  PlaneGeometry,
  Quaternion,
  Vector3,
} from 'three';
import { swerefToScene } from './geo/sweref99tm.js';
import { A1_ZONES } from './lighting/corridorA1';
import type { CityLighting } from './lighting/controller';
import { EMPTY_PAGE } from './lighting/lightIndex';
import { MAX_PER_CELL, SLOT_TEXELS } from './lighting/cityLights';
import { terrain } from './terrain';
import { cityJson } from './cityData';

const M = terrain.data.reference.metresPerUnit;
const PIN: Record<string, string> = {
  'pilot:mapped': '#1e6bff',
  'pilot:estimated': '#22c55e',
  'a1:mapped': '#00e5ff',
  'a1:street-bracket-8m': '#ff7a00',
  'a1:street-bracket-6m': '#ffd400',
  'a1:park-lantern-4m': '#b04dff',
};

export async function createLightingInspector(lighting: CityLighting) {
  const provenance = (await import('./data/streetlights-a1-provenance.json'))
    .default as unknown as {
    rejected: { candidate: string; reason: string; detail: string; en: [number, number] }[];
    ways: { way: number; name: string; lit: string; status: string }[];
    unknownWays: { way: number; name: string; class: string; lengthInsideM: number }[];
  };
  const group = new Group();
  group.name = 'lighting-inspector';
  const owned: { dispose(): void }[] = [];
  const own = <T extends { dispose(): void }>(r: T) => (owned.push(r), r);
  const matrix = new Matrix4(),
    position = new Vector3(),
    scale = new Vector3(),
    rotation = new Quaternion();
  const pin = own(new CylinderGeometry(1, 1, 1, 6));
  const mesh = (color: string, count: number, opacity = 0.9, order = 10) => {
    const m = new InstancedMesh(
      pin,
      own(
        new MeshBasicMaterial({
          color: new Color(color),
          depthTest: false,
          transparent: true,
          opacity,
        }),
      ),
      count,
    );
    m.renderOrder = order;
    m.frustumCulled = false;
    group.add(m);
    return m;
  };

  // Runtime fixtures, on their real support (lamp baseY, same canonical order as inspect()).
  const records = lighting.inspect();
  const lamps = lighting.lamps;
  const byClass = new Map<string, number[]>();
  records.forEach((r, i) => {
    const pilot = r.rollout === 'step6-pilot-v1';
    const key = pilot
      ? `pilot:${r.placement}`
      : r.placement === 'mapped'
        ? 'a1:mapped'
        : `a1:${r.type}`;
    byClass.set(key, [...(byClass.get(key) ?? []), i]);
  });
  for (const [key, list] of byClass) {
    const m = mesh(PIN[key] ?? '#ffffff', list.length);
    m.name = `lighting-inspect-${key}`;
    list.forEach((i, n) => {
      const r = records[i];
      position.set(r.x, lamps[i].baseY + 6 / M, r.z);
      scale.set(0.45 / M, 12 / M, 0.45 / M);
      m.setMatrixAt(n, matrix.compose(position, rotation, scale));
    });
  }
  const decks = records.flatMap((r, i) => (r.support === 'bridge-deck' ? [i] : []));
  if (decks.length) {
    const m = mesh('#ffffff', decks.length, 0.8, 9);
    decks.forEach((i, n) => {
      position.set(records[i].x, lamps[i].baseY + 0.2 / M, records[i].z);
      scale.set(1.6 / M, 0.2 / M, 1.6 / M);
      m.setMatrixAt(n, matrix.compose(position, rotation, scale));
    });
  }

  // Research-only: rejected/suppressed candidates (grey stubs).
  const ref = terrain.data.reference as never;
  const rejected = provenance.rejected.map((r) => {
    const [x, z] = swerefToScene(ref, r.en[0], r.en[1]);
    return { ...r, x, z };
  });
  if (rejected.length) {
    const m = mesh('#9aa0a6', rejected.length, 0.45, 8);
    m.name = 'lighting-inspect-rejected';
    rejected.forEach((r, n) => {
      position.set(r.x, terrain.groundHeight(r.x, r.z) + 2 / M, r.z);
      scale.set(0.8 / M, 4 / M, 0.8 / M);
      m.setMatrixAt(n, matrix.compose(position, rotation, scale));
    });
  }

  // Lines: zone boundaries, lit=no ways, rendered ways without a lit tag.
  const lines = (color: string, segments: number[][][], name: string) => {
    const pos: number[] = [];
    for (const [a, b] of segments)
      pos.push(
        a[0],
        terrain.groundHeight(a[0], a[1]) + 1 / M,
        a[1],
        b[0],
        terrain.groundHeight(b[0], b[1]) + 1 / M,
        b[1],
      );
    const g = own(new BufferGeometry());
    g.setAttribute('position', new Float32BufferAttribute(pos, 3));
    const l = new LineSegments(
      g,
      own(new LineBasicMaterial({ color, depthTest: false, transparent: true, opacity: 0.9 })),
    );
    l.renderOrder = 11;
    l.frustumCulled = false;
    l.name = name;
    group.add(l);
  };
  const zoneSegments: number[][][] = [];
  for (const z of Object.values(A1_ZONES)) {
    const ring = z.ring.map(([e, n]) => swerefToScene(ref, e, n));
    ring.forEach((p, i) => zoneSegments.push([p, ring[(i + 1) % ring.length]]));
  }
  lines('#00c853', zoneSegments, 'lighting-inspect-zones');
  const litNo = new Set(provenance.ways.filter((w) => w.lit === 'no').map((w) => w.way));
  const unknown = new Set(provenance.unknownWays.map((w) => w.way));
  const { roads } = await cityJson<{ roads: { a: number[]; b: number[]; way: number }[] }>('map');
  lines(
    '#ff1744',
    roads.filter((r) => litNo.has(r.way)).map((r) => [r.a, r.b]),
    'lighting-inspect-lit-no',
  );
  lines(
    '#b0b0b0',
    roads.filter((r) => unknown.has(r.way)).map((r) => [r.a, r.b]),
    'lighting-inspect-unknown',
  );

  // Light-grid occupancy of every non-empty cell (from the uploaded index arrays).
  const index = lighting.index;
  const cells: { x: number; z: number; ids: number[] }[] = [];
  if (index) {
    const { columns, rows } = index.stats.directory;
    const C = index.chunkCells,
      ppr = index.stats.payload.pagesPerRow,
      width = index.stats.payload.width;
    for (let cz = 0; cz < rows; cz++)
      for (let cx = 0; cx < columns; cx++) {
        const page = index.directory[cz * columns + cx];
        if (page === EMPTY_PAGE) continue;
        for (let lz = 0; lz < C; lz++)
          for (let lx = 0; lx < C; lx++) {
            const col = ((page % ppr) * C + lx) * SLOT_TEXELS,
              row = Math.floor(page / ppr) * C + lz;
            const ids: number[] = [];
            for (let s = 0; s < index.capacity; s++) {
              const id = index.payload[(row * width + col) * 4 + s];
              if (id < 0) break;
              ids.push(id);
            }
            if (ids.length)
              cells.push({
                x: index.originX + (cx * C + lx) * index.cell,
                z: index.originZ + (cz * C + lz) * index.cell,
                ids,
              });
          }
      }
    const tile = own(new PlaneGeometry(1, 1).rotateX(-Math.PI / 2));
    const heat = new InstancedMesh(
      tile,
      own(
        new MeshBasicMaterial({
          depthTest: false,
          transparent: true,
          opacity: 0.32,
          vertexColors: false,
        }),
      ),
      cells.length,
    );
    heat.renderOrder = 7;
    heat.frustumCulled = false;
    heat.name = 'lighting-inspect-occupancy';
    const color = new Color();
    cells.forEach((c, n) => {
      const x = c.x + 0.5,
        z = c.z + 0.5;
      position.set(x, terrain.groundHeight(x, z) + 0.4 / M, z);
      scale.set(0.96, 1, 0.96);
      heat.setMatrixAt(n, matrix.compose(position, rotation, scale));
      heat.setColorAt(
        n,
        color.setHSL((1 - (c.ids.length - 1) / (MAX_PER_CELL - 1)) * 0.66, 1, 0.5),
      );
    });
    group.add(heat);
  }

  const d = lighting.describe().streetLighting;
  const order = lighting.index?.order ?? [];
  const summary = {
    status: d.status,
    rollouts: d.rollouts,
    registry: d.registry,
    occupancy: {
      max: d.index?.maxRawOccupancy,
      histogram: d.index?.histogram,
      overflowCells: d.index?.overflowCells,
    },
    lastRejection: d.lastRejection,
    nearCapacity: cells
      .filter((c) => c.ids.length >= MAX_PER_CELL - 2)
      .map((c) => ({ cell: [c.x, c.z], count: c.ids.length, ids: c.ids.map((i) => order[i]) })),
    rejected: rejected.map(({ candidate, reason, detail, en }) => ({
      candidate,
      reason,
      detail,
      en,
    })),
    missingEvidence: {
      litNo: provenance.ways.filter((w) => w.lit === 'no'),
      unknown: provenance.unknownWays,
    },
  };
  (globalThis as unknown as { __lightingInspection: unknown }).__lightingInspection = summary;
  console.info(
    `[lighting] inspection: ${records.length} runtime fixtures, ${rejected.length} research-only candidates, ${cells.length} cells`,
  );
  return {
    group,
    summary,
    dispose() {
      for (const r of owned) r.dispose();
      group.clear();
    },
  };
}
