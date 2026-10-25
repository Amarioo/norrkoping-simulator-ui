import {
  Group,
  InstancedMesh,
  BoxGeometry,
  CylinderGeometry,
  PlaneGeometry,
  MeshStandardMaterial,
  CanvasTexture,
  SRGBColorSpace,
  Matrix4,
  Quaternion,
  Vector3,
  BufferGeometry,
} from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Vehicle } from './city.svelte';
import { TRACK_GAUGE_METRES, VEHICLE_GEOMETRY } from './trackProfile';
import { HEADLAMP_NIGHT_GAIN, TAILLAMP_NIGHT_GAIN, type VehiclePose } from './lighting/vehicleLights';

type Prototype = {
  meshes: InstancedMesh[];
  kind: string;
  section: number;
  count: number;
  route?: string;
  destination?: string;
};
/** Metre-sized articulated vehicles, placed section by section on the mapped track. */
export function createPublicTransport() {
  const group = new Group(),
    owned: { dispose(): void }[] = [],
    prototypes: Prototype[] = [];
  const own = <T extends { dispose(): void }>(r: T) => {
    owned.push(r);
    return r;
  };
  const material = (color: string, metalness = 0.15) =>
    own(new MeshStandardMaterial({ color, metalness, roughness: 0.55 }));
  const glass = material('#21383e', 0.4),
    rubber = material('#20282b'),
    steel = material('#828d90', 0.7),
    dark = material('#3e494b'),
    yellow = material('#efb919'),
    green = material('#08786d'),
    white = material('#e6e8e5'),
    orange = material('#e87522');
  const headlamp = own(
    new MeshStandardMaterial({ color: '#fff6dc', emissive: '#fff0c6', emissiveIntensity: 0.5 }),
  );
  const tail = own(
    new MeshStandardMaterial({ color: '#ac2f29', emissive: '#a62b23', emissiveIntensity: 0.3 }),
  );
  // Vehicle Lights Phase F1: buses get their own lens materials (same parameters, so the same shader
  // program), which glow at night; tram and train lenses stay as they are (Phase F2).
  const busHeadlamp = own(headlamp.clone()),
    busTail = own(tail.clone());
  function texture(kind: string, section = 0) {
    const c = document.createElement('canvas');
    c.width = 2048;
    c.height = 512;
    const g = c.getContext('2d')!;
    g.fillStyle = kind === 'tram' ? '#efb919' : '#e8e9e4';
    g.fillRect(0, 0, 2048, 512);
    if (kind === 'tram') {
      g.fillStyle = '#08786d';
      g.fillRect(0, 0, 2048, 47);
      g.fillRect(0, 474, 2048, 38);
      g.fillStyle = '#e9e9d9';
      g.fillRect(0, 47, 2048, 10);
      g.fillRect(0, 461, 2048, 13);
      g.fillStyle = '#242c2b';
      g.fillRect(0, 130, 2048, 235);
      g.fillStyle = '#243d34';
      g.font = 'bold 24px sans-serif';
      g.fillText('Östgötatrafiken', 80, 425);
      g.fillStyle = '#eeeede';
      g.font = 'bold 32px sans-serif';
      g.fillText('46', 1880, 504);
    } else if (kind === 'train') {
      // One continuous full-height X61 livery across the four cars, rather than small door decals.
      g.save();
      g.translate(-section * 2048, 0);
      g.fillStyle = '#cb3e56';
      g.fillRect(750, 0, 5150, 512);
      g.beginPath();
      g.ellipse(3300, 310, 1460, 430, 0, 0, Math.PI * 2);
      g.fillStyle = '#ec881e';
      g.fill();
      g.strokeStyle = '#f6eee1';
      g.lineWidth = 145;
      g.stroke();
      g.restore();
      g.fillStyle = '#414c50';
      g.font = '26px sans-serif';
      g.fillText('Östgötapendeln   61207', 200, 480);
    } else {
      g.strokeStyle = '#eb7928';
      g.lineWidth = 65;
      g.beginPath();
      g.arc(1700, 430, 320, 0, Math.PI * 2);
      g.stroke();
      g.strokeStyle = '#d73830';
      g.lineWidth = 34;
      g.beginPath();
      g.arc(1700, 430, 390, 0, Math.PI * 2);
      g.stroke();
      g.fillStyle = '#38444a';
      g.font = 'bold 50px sans-serif';
      g.fillText('Östgötatrafiken', 500, 440);
    }
    const t = own(new CanvasTexture(c));
    t.colorSpace = SRGBColorSpace;
    t.anisotropy = 8;
    return own(new MeshStandardMaterial({ map: t, roughness: 0.46 }));
  }
  const liveries = {
    bus: [texture('bus')],
    tram: [texture('tram')],
    train: Array.from({ length: 4 }, (_, i) => texture('train', i)),
  };
  function destination(line: string, name: string) {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 96;
    const g = c.getContext('2d')!;
    g.fillStyle = '#171e1b';
    g.fillRect(0, 0, 512, 96);
    g.fillStyle = line === '3' ? '#2b9364' : '#d2323e';
    g.fillRect(8, 8, 65, 80);
    g.fillStyle = '#ffedbe';
    g.font = 'bold 64px monospace';
    g.fillText(line, 18, 72);
    g.fillStyle = '#ffbe35';
    g.font = '52px monospace';
    g.fillText(name, 84, 68, 418);
    const t = own(new CanvasTexture(c));
    t.colorSpace = SRGBColorSpace;
    return own(
      new MeshStandardMaterial({
        map: t,
        emissiveMap: t,
        emissive: '#ffffff',
        emissiveIntensity: 0.25,
      }),
    );
  }
  const destinations: Record<string, string> = {
    tram2Kvarnberget: 'Kvarnberget',
    tram2Fridvalla: 'Fridvalla',
    tram3Vidablick: 'Vidablick',
    tram3Klockaretorpet: 'Klockaretorpet',
  };
  const models = ['bus', ...Object.keys(destinations), 'train'];
  for (const model of models) {
    const kind = model.startsWith('tram') ? 'tram' : model;
    const route = kind === 'tram' ? model[4] : undefined;
    const destinationName = destinations[model];
    const signMaterial = kind === 'tram' ? destination(route!, destinationName) : undefined;
    for (let section = 0; section < (kind === 'train' ? 4 : kind === 'tram' ? 5 : 1); section++) {
      const isTrain = kind === 'train',
        isTram = kind === 'tram',
        front = section === 0,
        last = section === (isTrain ? 3 : isTram ? 4 : 0),
        width = isTrain ? 2.9 : isTram ? 2.4 : 2.55,
        length = isTrain ? 19.5 : isTram ? 6.12 : 12,
        height = isTrain ? 3.75 : isTram ? 3.1 : 2.95;
      const batches = new Map<MeshStandardMaterial, BufferGeometry[]>();
      function add(
        geo: BufferGeometry,
        mat: MeshStandardMaterial,
        x = 0,
        y = 0,
        z = 0,
        rx = 0,
        ry = 0,
        rz = 0,
      ) {
        if (geo.index) {
          const old = geo;
          geo = geo.toNonIndexed();
          old.dispose();
        }
        geo.rotateX(rx);
        geo.rotateY(ry);
        geo.rotateZ(rz);
        geo.translate(x, y, z);
        if (!batches.has(mat)) batches.set(mat, []);
        batches.get(mat)!.push(geo);
      }
      const box = (
        w: number,
        h: number,
        d: number,
        x: number,
        y: number,
        z: number,
        mat: MeshStandardMaterial,
      ) => add(new BoxGeometry(w, h, d), mat, x, y, z);
      const paint = isTram ? yellow : white;
      const body = new RoundedBoxGeometry(
        width,
        height,
        length,
        5,
        isTrain ? 0.38 : isTram ? 0.22 : 0.14,
      );
      const cabLength = isTrain ? 2.6 : isTram ? 0.9 : 0;
      const slope = isTrain ? 0.46 : isTram ? 0.18 : 0;
      if (cabLength > 0) {
        const vertices = body.getAttribute('position');
        for (let i = 0; i < vertices.count; i++) {
          const x = vertices.getX(i),
            y = vertices.getY(i),
            z = vertices.getZ(i);
          const end = front && z > 0 ? 1 : last && z < 0 ? -1 : 0;
          if (!end) continue;
          const t = Math.max(0, (Math.abs(z) - (length / 2 - cabLength)) / cabLength);
          vertices.setXYZ(
            i,
            x * (1 - (isTrain ? 0.22 : 0.08) * t),
            y,
            z - end * t * Math.max(0, y + height / 2 + 0.45 - 1.05) * slope,
          );
        }
        body.computeVertexNormals();
      }
      add(body, paint, 0, height / 2 + 0.45, 0);
      box(width * 0.89, 0.35, length - 0.5, 0, 0.42, 0, dark);
      if (isTram)
        add(new RoundedBoxGeometry(width, 0.28, length - 0.08, 3, 0.11), green, 0, height + 0.4, 0);
      box(width - 0.5, 0.15, isTram ? 2.1 : length * 0.55, 0, height + 0.52, -0.2, steel);
      for (const side of [-1, 1]) {
        const sideGeometry = new PlaneGeometry(
          length - 0.15 - (front || last ? cabLength : 0),
          height,
        );
        if (side < 0) {
          const uv = sideGeometry.getAttribute('uv');
          for (let i = 0; i < uv.count; i++) uv.setX(i, 1 - uv.getX(i));
        }
        add(
          sideGeometry,
          liveries[kind as keyof typeof liveries][isTrain ? section : 0],
          side * (width / 2 + 0.008),
          height / 2 + 0.45,
          front ? -cabLength / 2 : last ? cabLength / 2 : 0,
          0,
          (side * Math.PI) / 2,
        );
        for (let z = -length / 2 + 1.2; z < length / 2 - 0.8; z += 1.35) {
          if (
            (front && z > length / 2 - cabLength - 0.6) ||
            (last && z < -length / 2 + cabLength + 0.6)
          )
            continue;
          box(
            0.04,
            isTram ? 1.52 : 1.02,
            1.12,
            side * (width / 2 + 0.012),
            isTram ? 2.12 : height - 0.3,
            z,
            glass,
          );
          box(0.045, 0.08, 1.24, side * (width / 2 + 0.03), height + 0.4, z, paint);
        }
        const doors = isTrain
          ? [-length * 0.28, length * 0.28]
          : isTram
            ? [0.65]
            : [-4.2, 1.8, 4.7];
        for (const z of doors) {
          box(
            0.055,
            2.1,
            1.15,
            side * (width / 2 + 0.03),
            1.65,
            z,
            isTram ? yellow : isTrain ? white : orange,
          );
          box(
            0.065,
            isTram ? 1.85 : 1.1,
            0.48,
            side * (width / 2 + 0.04),
            isTram ? 1.8 : 2.02,
            z - 0.27,
            glass,
          );
          box(0.065, 1.1, 0.48, side * (width / 2 + 0.04), 2.02, z + 0.27, glass);
        }
      }
      for (const end of kind === 'bus' ? [1, -1] : front ? [1] : last ? [-1] : []) {
        const glassY = isTram ? 2.23 : 2.55;
        const inset = cabLength > 0 ? (glassY - 1.05) * slope : 0;
        add(
          new RoundedBoxGeometry(
            width * (isTrain ? 0.7 : 0.88),
            isTram ? 2.04 : 2.15,
            0.045,
            4,
            0.12,
          ),
          glass,
          0,
          glassY,
          end * (length / 2 - inset + 0.05),
          -end * Math.atan(slope),
        );
        // Dark destination box and visible amber lettering, above the large curved windshield.
        if (isTram) {
          add(
            new PlaneGeometry(width * 0.77, 0.29),
            signMaterial!,
            0,
            3.12,
            end * (length / 2 - (3.12 - 1.05) * slope + 0.08),
            -end * Math.atan(slope),
            end < 0 ? Math.PI : 0,
          );
          add(
            new BoxGeometry(0.025, 1.23, 0.025),
            dark,
            -0.22,
            1.94,
            end * (length / 2 - (1.94 - 1.05) * slope + 0.09),
            -end * Math.atan(slope),
            0,
            -0.32,
          );
        }
        if (isTrain) {
          box(0.38, 0.18, 0.28, 0, 0.52, end * (length / 2 + 0.15), dark);
          box(width * 0.72, 0.1, 0.12, 0, 1.03, end * (length / 2 + 0.025), white);
        }
        box(width * 0.88, 0.16, 0.12, 0, 0.65, end * (length / 2 + 0.04), isTram ? green : dark);
        for (const side of [-1, 1])
          box(
            0.36,
            0.16,
            0.06,
            side * width * 0.32,
            0.84,
            end * (length / 2 + 0.055),
            kind === 'bus' ? (end > 0 ? busHeadlamp : busTail) : end > 0 ? headlamp : tail,
          );
      }
      if (!last) {
        box(width * 0.85, height * 0.83, 0.24, 0, height / 2 + 0.4, -length / 2 - 0.12, dark);
        for (let z = -0.08; z <= 0.08; z += 0.04)
          box(
            width * 0.88,
            height * 0.85,
            0.014,
            0,
            height / 2 + 0.4,
            -length / 2 - 0.12 + z,
            steel,
          );
      }
      // Bogie centres are the rail vehicle contract (trackProfile.ts VEHICLE_GEOMETRY): the backend puts
      // exactly these two points on the rail top. Rail wheels run at standard gauge on the drawn rails.
      const bogie = isTrain
        ? VEHICLE_GEOMETRY.train.bogieHalf
        : isTram
          ? VEHICLE_GEOMETRY.tram.bogieHalf
          : 0;
      const wheelX = isTrain || isTram ? TRACK_GAUGE_METRES / 2 + 0.035 : width / 2 - 0.12;
      for (const z of isTrain || isTram ? [-bogie, bogie] : [-3.6, 3.7]) {
        if (isTrain || isTram) box(width * 0.75, 0.4, 1.7, 0, 0.48, z, dark);
        for (const axle of isTrain ? [-0.65, 0.65] : [0])
          for (const side of [-1, 1]) {
            const r = isTram ? 0.32 : 0.46;
            add(
              new CylinderGeometry(r, r, isTrain || isTram ? 0.135 : 0.2, 12),
              rubber,
              side * wheelX,
              r,
              z + axle,
              0,
              0,
              Math.PI / 2,
            );
            add(
              new CylinderGeometry(r * 0.58, r * 0.58, 0.025, 10),
              steel,
              side * (isTrain || isTram ? wheelX + 0.075 : width / 2 - 0.005),
              r,
              z + axle,
              0,
              0,
              Math.PI / 2,
            );
          }
      }
      if ((isTram && section === 2) || (isTrain && section === 1)) {
        box(1.2, 0.2, 1.6, 0, height + 0.68, 0, steel);
        for (const side of [-1, 1]) {
          add(new BoxGeometry(0.055, 0.055, 1.2), dark, side * 0.45, height + 1.08, -0.1, -0.65);
          add(new BoxGeometry(0.055, 0.055, 1.2), dark, side * 0.45, height + 1.65, -0.1, 0.65);
        }
        box(1.45, 0.07, 0.14, 0, height + 1.98, 0.3, dark);
      }
      if (kind === 'bus') {
        box(width * 0.7, 0.2, 4, 0, height + 0.65, -1.5, white);
        for (const side of [-1, 1]) box(0.18, 0.3, 0.3, side * (width / 2 + 0.14), 2.5, 5.2, dark);
      }
      const meshes: InstancedMesh[] = [];
      for (const [mat, geometries] of batches) {
        const merged = own(mergeGeometries(geometries, false)!);
        geometries.forEach((g) => g.dispose());
        const mesh = own(
          new InstancedMesh(merged, mat, kind === 'bus' ? 80 : kind === 'tram' ? 40 : 12),
        );
        mesh.count = 0;
        mesh.castShadow = mesh.receiveShadow = true;
        mesh.frustumCulled = false;
        group.add(mesh);
        meshes.push(mesh);
      }
      prototypes.push({ meshes, kind, section, count: 0, route, destination: destinationName });
    }
  }
  const matrix = new Matrix4(),
    q = new Quaternion(),
    tilt = new Quaternion(),
    axis = new Vector3(0, 1, 0),
    across = new Vector3(1, 0, 0),
    scale = new Vector3(0.04, 0.04, 0.04);
  const states = new Map<string, { pos: Vector3; heading: number; pitch: number }>();
  // Smoothed render poses of this frame's buses (reused objects), for the vehicle beams.
  const poses: VehiclePose[] = [];
  let poseCount = 0;
  return {
    group,
    update(vehicles: Vehicle[], dt: number) {
      const live = new Set<string>();
      poseCount = 0;
      for (const prototype of prototypes) {
        const list = vehicles.filter(
            (v) =>
              v.kind === prototype.kind &&
              (!prototype.route ||
                (v.road.endsWith(prototype.route) &&
                  (v.destination ?? (prototype.route === '2' ? 'Kvarnberget' : 'Vidablick')) ===
                    prototype.destination)),
          ),
          ids = list.map((v) => v.id);
        for (const mesh of prototype.meshes) {
          mesh.count = list.length;
          mesh.userData.ids = ids;
        }
        list.forEach((vehicle, i) => {
          const pose = vehicle.sections?.[prototype.section] ?? vehicle,
            key = vehicle.id + ':' + prototype.section;
          live.add(key);
          let state = states.get(key);
          const pitch = ('pitch' in pose ? pose.pitch : undefined) ?? 0;
          if (!state) {
            state = { pos: new Vector3(...pose.pos), heading: pose.heading, pitch };
            states.set(key, state);
          }
          const target = new Vector3(...pose.pos);
          if (state.pos.distanceTo(target) > 5) state.pos.copy(target);
          else state.pos.lerp(target, 1 - Math.exp(-dt * 16));
          state.heading +=
            Math.atan2(
              Math.sin(pose.heading - state.heading),
              Math.cos(pose.heading - state.heading),
            ) *
            (1 - Math.exp(-dt * 14));
          state.pitch += (pitch - state.pitch) * (1 - Math.exp(-dt * 14));
          // Model origin = wheel contact at the section centre; +z is forward, so nose-up is −x rotation.
          q.setFromAxisAngle(axis, state.heading).multiply(tilt.setFromAxisAngle(across, -state.pitch));
          matrix.compose(state.pos, q, scale);
          if (prototype.kind === 'bus') {
            const pose = (poses[poseCount++] ??= { id: 0, kind: 'bus', x: 0, y: 0, z: 0, heading: 0 });
            pose.id = vehicle.id;
            pose.x = state.pos.x;
            pose.y = state.pos.y;
            pose.z = state.pos.z;
            pose.heading = state.heading;
          }
          for (const mesh of prototype.meshes) mesh.setMatrixAt(i, matrix);
        });
        for (const mesh of prototype.meshes) {
          mesh.instanceMatrix.needsUpdate = true;
          mesh.boundingSphere = null;
        }
      }
      for (const key of states.keys()) if (!live.has(key)) states.delete(key);
    },
    /** Smoothed poses of this frame's buses (valid until the next update). */
    poses(): readonly VehiclePose[] {
      poses.length = poseCount;
      return poses;
    },
    /** Night level 0…1 (env.artificial): bus headlamp and tail-lamp lens glow. */
    setNightLevel(level: number) {
      busHeadlamp.emissiveIntensity = 0.5 + HEADLAMP_NIGHT_GAIN * level;
      busTail.emissiveIntensity = 0.3 + TAILLAMP_NIGHT_GAIN * level;
    },
    dispose() {
      owned.forEach((r) => r.dispose());
      group.clear();
    },
  };
}
