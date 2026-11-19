/**
 * Air routes: the drawn model of a twin-engined narrow-body jet (Airbus A320neo, A321neo, Boeing 737
 * MAX 8), built from the measures in aircraftTypes.ts. A procedural model in the proportions of the type,
 * not a copy of its drawings; the livery is invented.
 *
 * Metres, +z forward, +y up (wheels at y = 0), +x the aircraft's left. Parts with the same material are
 * merged, so a jet is about ten draw calls. The gear is a child named `gear`, the beacon lens a mesh named
 * `beacon`, as on the turboprop (transportModels.ts hides the one and flashes the other).
 */
import {
  BufferGeometry,
  CylinderGeometry,
  Float32BufferAttribute,
  Group,
  LatheGeometry,
  Mesh,
  SphereGeometry,
  Vector2,
  type Material,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { jetLayout, jetLights, type JetSpec, type Vec3 } from './aircraftTypes';

export interface JetMaterials {
  body: Material;
  livery: Material;
  glass: Material;
  dark: Material;
  metal: Material;
  rubber: Material;
  navRed: Material;
  navGreen: Material;
  beacon: Material;
  whiteLens: Material;
}

/** A closed box between two quads `a` (four corners) and `b`, e.g. a wing from root to tip section. */
function slab(a: Vec3[], b: Vec3[]) {
  const v = [...a, ...b].flat();
  const quads = [
    [0, 1, 2, 3],
    [7, 6, 5, 4],
    [0, 4, 5, 1],
    [1, 5, 6, 2],
    [2, 6, 7, 3],
    [3, 7, 4, 0],
  ];
  const positions: number[] = [];
  const at = (i: number) => [v[i * 3], v[i * 3 + 1], v[i * 3 + 2]];
  const centre = [0, 1, 2].map(
    (k) => v.reduce((sum, value, i) => (i % 3 === k ? sum + value : sum), 0) / 8,
  );
  for (const [p, q, r, s] of quads)
    for (const [i, j, k] of [
      [p, q, r],
      [p, r, s],
    ]) {
      // Whatever order the corners came in, the face points away from the middle of the box.
      const [a, b, c] = [at(i), at(j), at(k)];
      const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]],
        w = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
      const out = n[0] * (a[0] - centre[0]) + n[1] * (a[1] - centre[1]) + n[2] * (a[2] - centre[2]);
      positions.push(...a, ...(out >= 0 ? [...b, ...c] : [...c, ...b]));
    }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(positions, 3));
  g.computeVertexNormals();
  return g;
}

/**
 * A lifting surface on one side: sections at the root and the tip, each given by the leading edge
 * point, the chord and the thickness. `side` 1 is the left (+x).
 */
function surface(
  side: number,
  root: { x: number; y: number; z: number; chord: number; thick: number },
  tip: { x: number; y: number; z: number; chord: number; thick: number },
) {
  const section = (s: typeof root): Vec3[] => [
    [side * s.x, s.y - s.thick / 2, s.z],
    [side * s.x, s.y + s.thick / 2, s.z],
    [side * s.x, s.y + s.thick / 2, s.z - s.chord],
    [side * s.x, s.y - s.thick / 2, s.z - s.chord],
  ];
  return slab(section(root), section(tip));
}

/** Plain triangles without uv, so that every part of a material can be merged into one geometry. */
function plain(g: BufferGeometry) {
  const out = g.index ? g.toNonIndexed() : g;
  out.deleteAttribute('uv');
  if (!out.getAttribute('normal')) out.computeVertexNormals();
  return out;
}

export function buildJet(
  spec: JetSpec,
  m: JetMaterials,
  own: <T extends { dispose(): void }>(resource: T) => T,
) {
  const l = jetLayout(spec);
  const lights = jetLights(spec);
  const r = spec.radius;
  const jet = new Group();
  const add = (parts: BufferGeometry[], material: Material, name = '') => {
    const mesh = new Mesh(own(mergeGeometries(parts.map(plain))!), material);
    mesh.name = name;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    jet.add(mesh);
    return mesh;
  };

  // Fuselage: a body of revolution about the z axis, nose at +half.
  const profile = [
    [-l.half, 0.02],
    [-l.half + 0.6, 0.3 * r],
    [-l.half + 4, 0.68 * r],
    [-l.half + 8.5, r],
    [l.half - 5.2, r],
    [l.half - 2.6, 0.84 * r],
    [l.half - 1, 0.52 * r],
    [l.half - 0.25, 0.24 * r],
    [l.half, 0.02],
  ].map(([z, radius]) => new Vector2(radius, z));
  const fuselage = new LatheGeometry(profile, 28).rotateX(Math.PI / 2).translate(0, l.centreY, 0);

  // Wings, tailplane, wing tips.
  const white: BufferGeometry[] = [fuselage];
  const livery: BufferGeometry[] = [];
  for (const side of [1, -1]) {
    white.push(
      surface(
        side,
        { x: r * 0.6, y: l.wingRootY, z: l.wingRootZ, chord: l.rootChord, thick: 0.62 },
        { x: l.tipX, y: l.tipY, z: l.tipZ, chord: l.tipChord, thick: 0.18 },
      ),
      surface(
        side,
        { x: r * 0.3, y: l.centreY + 0.45, z: l.tailplaneZ, chord: 3.7, thick: 0.3 },
        {
          x: l.tailplaneSpan / 2,
          y: l.centreY + 0.95,
          z: l.tailplaneZ - 3.3,
          chord: 1.35,
          thick: 0.12,
        },
      ),
    );
    // The tip device stands on the wing tip: up and back, and on the split tip also down.
    const stand = (dy: number, back: number, chord: number) =>
      surface(
        side,
        { x: l.tipX - 0.08, y: l.tipY, z: l.tipZ, chord: l.tipChord, thick: 0.16 },
        { x: l.tipX + 0.25, y: l.tipY + dy, z: l.tipZ - back, chord, thick: 0.1 },
      );
    livery.push(stand(2.4, 1.6, 0.75));
    if (spec.tip === 'split') livery.push(stand(-1.1, 1.1, 0.55));
  }
  // Fin: a slab in the plane of symmetry.
  const finTop = spec.tailHeight;
  livery.push(
    slab(
      [
        [0.16, l.centreY + r * 0.7, l.finRootZ],
        [0.16, finTop, l.finRootZ - 4.9],
        [0.16, finTop, l.finRootZ - 7.1],
        [0.16, l.centreY + r * 0.55, l.finRootZ - 6.6],
      ],
      [
        [-0.16, l.centreY + r * 0.7, l.finRootZ],
        [-0.16, finTop, l.finRootZ - 4.9],
        [-0.16, finTop, l.finRootZ - 7.1],
        [-0.16, l.centreY + r * 0.55, l.finRootZ - 6.6],
      ],
    ),
  );

  // Engines under the wings: nacelle in the livery colour, a dark intake disc and exhaust.
  const dark: BufferGeometry[] = [];
  const engineY = l.engineRadius + 0.62;
  for (const side of [1, -1]) {
    const x = side * l.engineX;
    livery.push(
      new CylinderGeometry(l.engineRadius * 0.82, l.engineRadius, l.engineLength, 20)
        .rotateX(-Math.PI / 2)
        .translate(x, engineY, l.engineZ),
    );
    dark.push(
      new CylinderGeometry(l.engineRadius * 0.86, l.engineRadius * 0.86, 0.12, 20)
        .rotateX(Math.PI / 2)
        .translate(x, engineY, l.engineZ + l.engineLength / 2 + 0.02),
      new CylinderGeometry(l.engineRadius * 0.5, l.engineRadius * 0.62, 0.9, 16)
        .rotateX(-Math.PI / 2)
        .translate(x, engineY, l.engineZ - l.engineLength / 2 - 0.4),
    );
    // Pylon between nacelle and wing.
    white.push(
      slab(
        [
          [x - 0.14, engineY + l.engineRadius * 0.7, l.engineZ + 1.4],
          [x - 0.14, l.wingRootY + 0.25, l.engineZ + 0.2],
          [x - 0.14, l.wingRootY + 0.25, l.engineZ - 2.6],
          [x - 0.14, engineY + l.engineRadius * 0.7, l.engineZ - 1.8],
        ],
        [
          [x + 0.14, engineY + l.engineRadius * 0.7, l.engineZ + 1.4],
          [x + 0.14, l.wingRootY + 0.25, l.engineZ + 0.2],
          [x + 0.14, l.wingRootY + 0.25, l.engineZ - 2.6],
          [x + 0.14, engineY + l.engineRadius * 0.7, l.engineZ - 1.8],
        ],
      ),
    );
  }
  add(white, m.body);
  add(livery, m.livery);
  add(dark, m.dark);

  // Glass: one window band per side, flush with the fuselage, and the cockpit.
  const bandY = l.centreY + 0.42;
  const bandX = Math.sqrt(r * r - 0.42 * 0.42) + 0.01;
  const bandFrom = -l.half + 7.5,
    bandTo = l.half - 6.2;
  const glass: BufferGeometry[] = [
    new SphereGeometry(r * 0.62, 16, 10)
      .scale(1.12, 0.5, 1.55)
      .translate(0, l.centreY + r * 0.34, l.half - 2.75),
  ];
  for (const side of [1, -1])
    glass.push(
      slab(
        [
          [side * bandX, bandY - 0.17, bandTo],
          [side * bandX, bandY + 0.17, bandTo],
          [side * bandX, bandY + 0.17, bandFrom],
          [side * bandX, bandY - 0.17, bandFrom],
        ],
        [
          [side * (bandX - 0.06), bandY - 0.17, bandTo],
          [side * (bandX - 0.06), bandY + 0.17, bandTo],
          [side * (bandX - 0.06), bandY + 0.17, bandFrom],
          [side * (bandX - 0.06), bandY - 0.17, bandFrom],
        ],
      ),
    );
  add(glass, m.glass);

  // Lenses at the light positions (lighting/aircraftLights.ts draws the glow at the same points).
  const ball = (at: Vec3, radius: number) =>
    new SphereGeometry(radius, 8, 6).translate(at[0], at[1], at[2]);
  add([ball(lights.navLeft, 0.14)], m.navRed);
  add([ball(lights.navRight, 0.14)], m.navGreen);
  add([ball(lights.beaconTop, 0.2), ball(lights.beaconBottom, 0.2)], m.beacon, 'beacon');
  add(
    [
      ball(lights.navTail, 0.12),
      ball(lights.strobeLeft, 0.1),
      ball(lights.strobeRight, 0.1),
      ball(lights.landingLeft, 0.2),
      ball(lights.landingRight, 0.2),
      ball(lights.taxi, 0.13),
    ],
    m.whiteLens,
  );

  // Landing gear: nose leg and two main legs, two wheels each.
  const gear = new Group();
  gear.name = 'gear';
  jet.add(gear);
  const struts: BufferGeometry[] = [],
    wheels: BufferGeometry[] = [];
  const leg = (x: number, z: number, top: number, wheel: number) => {
    struts.push(
      new CylinderGeometry(0.11, 0.11, top - wheel, 8).translate(x, (top + wheel) / 2, z),
    );
    for (const side of [-1, 1])
      wheels.push(
        new CylinderGeometry(wheel, wheel, 0.32, 14)
          .rotateZ(Math.PI / 2)
          .translate(x + side * 0.34, wheel, z),
      );
  };
  leg(0, l.noseGearZ, l.centreY - r * 0.8, 0.4);
  for (const side of [-1, 1]) leg((side * spec.wheelTrack) / 2, l.mainGearZ, l.wingRootY, 0.58);
  const strutMesh = new Mesh(own(mergeGeometries(struts.map(plain))!), m.metal);
  const wheelMesh = new Mesh(own(mergeGeometries(wheels.map(plain))!), m.rubber);
  for (const mesh of [strutMesh, wheelMesh]) {
    mesh.castShadow = true;
    gear.add(mesh);
  }
  return jet;
}
