/**
 * Phase P1 (measurement only): `globalThis.__perfP1`, the measurement hook behind
 * scripts/perf-p1/. Installed by Scene.svelte only behind `hookEnabled` (development and
 * VITE_LIGHTING_HOOK=1 builds); normal production builds never call it, so the bundler drops it.
 *
 * What it offers (nothing runs until a script asks for it):
 * - parts(): the scene tree split into parts (buildings, terrain, roads, lights, traffic, ...).
 * - capture(): one frame's draw calls attributed to parts (wraps renderer.renderBufferDirect for
 *   that frame only and reads renderer.info before and after every call), plus per part the number
 *   of objects, visible / drawn objects, materials, programs and matrix-updated nodes.
 * - setPartVisible(): hide one part (or all) to measure what it costs; restores the earlier state.
 * - flags: skip one per-frame CPU job (traffic update, lighting update, vehicle beams).
 * - frames: a per-frame log (frame interval, CPU time of tasks and of renderer.render(), GPU time,
 *   whether a traffic snapshot arrived) for the frames between start() and stop().
 * - gpu: GPU time of each renderer.render() with EXT_disjoint_timer_query_webgl2 where the browser
 *   offers it; off by default, switched on by the script only while it measures.
 * - setPixelRatio(): resolution scaling (fill-rate check); restore with setPixelRatio(1).
 */
import { useStage, useTask, useThrelte } from '@threlte/core';
import type { BufferGeometry, Camera, Material, Object3D, Scene, WebGLRenderer } from 'three';
import { perfFlags } from './perfFlags';

/** Parts in report order. Several parts make up one category of the roadmap (see PART_CATEGORY). */
export const PERF_PARTS = [
  'buildings',
  'buildingDetails',
  'terrain',
  'roads',
  'bridges',
  'water',
  'trees',
  'lights',
  'sky',
  'vehicles',
  'transit',
  'signals',
  'aircraft',
  'labels',
  'radhuset',
  'police',
  'stadium',
  'mapDetails',
  'other',
] as const;
export type PerfPart = (typeof PERF_PARTS)[number];

interface Owner {
  group: Object3D;
}
export interface PerfProbeInput {
  view: { group: Object3D; labels: Object3D };
  transport: { group: Object3D; airplane: Object3D };
  transit: Owner;
  signals: Owner;
  /** The lighting controller's group (it is replaced when the controller is recreated). */
  lightingGroup: () => Object3D;
  /** The traffic snapshot object (a new object arrives with every server message). */
  snapshot: () => unknown;
}

const LAYER_PART: Record<string, PerfPart> = {
  'city-walls': 'buildings',
  'city-roofs': 'buildings',
  'city-cornices': 'buildings',
  'city-surveyed': 'buildings',
  'city-land': 'terrain',
  'city-banks': 'terrain',
  'city-water': 'water',
  'city-roads': 'roads',
  'city-markings': 'roads',
};

interface FrameRecord {
  /** Frame start, ms (performance.now). */
  t: number;
  /** Start-to-start interval to the previous frame, ms (null for the first frame of a log). */
  interval: number | null;
  /** Threlte tasks before the render stage (Scene task, camera, ...), ms. */
  tasksMs: number;
  /** renderer.render() and the render stage, ms (command submission on the CPU). */
  renderMs: number;
  /** tasksMs + renderMs. */
  cpuMs: number;
  /** GPU time of renderer.render() (null without the timer or before the result arrives). */
  gpuMs: number | null;
  /** A new traffic snapshot was seen at the start of this frame. */
  snapshot: boolean;
  calls: number;
  triangles: number;
}

type RenderBufferDirect = WebGLRenderer['renderBufferDirect'];

export function installPerfProbe(input: PerfProbeInput) {
  const { renderer, scene, camera, mainStage, renderStage } = useThrelte();
  const gl = renderer.getContext() as WebGL2RenderingContext;

  // --- parts -------------------------------------------------------------------------------
  const notes: string[] = [];
  const classify = () => {
    const owner = new Map<Object3D, PerfPart>();
    notes.length = 0;
    const view = input.view.group;
    // Unnamed groups of createMappedCity, in the order it adds them: riverfront details, bridges,
    // detailed places; the landmark-details group is the one holding the labels.
    const unnamed: Object3D[] = [];
    let details: Object3D | null = null;
    for (const child of view.children) {
      if (LAYER_PART[child.name]) owner.set(child, LAYER_PART[child.name]);
      else if (child.name === 'idrottsparken' || child.name === 'idrottsparken-turf')
        owner.set(child, 'stadium');
      else if (child.name === 'radhuset') owner.set(child, 'radhuset');
      else if ((child as { isInstancedMesh?: boolean }).isInstancedMesh && !child.name)
        owner.set(child, 'trees');
      else if (child.children.includes(input.view.labels)) details = child;
      else if (!child.name && child.type === 'Group') unnamed.push(child);
      else notes.push(`unclassified view child: ${child.type} "${child.name}"`);
    }
    if (unnamed.length === 3) {
      owner.set(unnamed[0], 'buildingDetails'); // riverfront details (surveyed façades)
      owner.set(unnamed[1], 'bridges');
      owner.set(unnamed[2], 'buildingDetails'); // detailed places (station, halls, roofs)
    } else {
      notes.push(
        `expected 3 unnamed groups (riverfront, bridges, places), found ${unnamed.length}`,
      );
      for (const g of unnamed) owner.set(g, 'other');
    }
    if (details) {
      owner.set(details, 'mapDetails');
      owner.set(input.view.labels, 'labels');
      const police = details.getObjectByName('police-tower');
      if (police) owner.set(police, 'police');
      else notes.push('police-tower not found');
    } else notes.push('landmark details group not found');
    const lighting = input.lightingGroup();
    for (const child of lighting.children)
      owner.set(child, child.name === 'sky' ? 'sky' : 'lights');
    owner.set(input.transport.group, 'vehicles');
    owner.set(input.transport.airplane, 'aircraft');
    owner.set(input.transit.group, 'transit');
    owner.set(input.signals.group, 'signals');
    return owner;
  };
  let owners = classify();
  const partOf = (object: Object3D): PerfPart => {
    for (let o: Object3D | null = object; o; o = o.parent) {
      const p = owners.get(o);
      if (p) return p;
    }
    return 'other';
  };
  const roots = (part: PerfPart | 'all') =>
    [...owners].filter(([, p]) => part === 'all' || p === part).map(([o]) => o);

  // --- hiding parts ------------------------------------------------------------------------
  const hidden = new Map<Object3D, boolean>();
  const hide = (o: Object3D, part: PerfPart | 'all') => {
    // Hide the whole subtree unless it holds another part's root (e.g. the aircraft inside the
    // vehicle group, the labels inside the landmark details); then descend.
    let foreign = false;
    if (part !== 'all')
      o.traverse((d) => {
        if (d !== o && owners.has(d) && owners.get(d) !== part) foreign = true;
      });
    if (!foreign) {
      if (!hidden.has(o)) hidden.set(o, o.visible);
      o.visible = false;
      return;
    }
    for (const child of o.children)
      if (!owners.has(child) || owners.get(child) === part) hide(child, part);
  };
  const restore = () => {
    for (const [o, v] of hidden) o.visible = v;
    hidden.clear();
  };

  // --- capture: one frame's draw calls by part -------------------------------------------------
  interface Call {
    part: PerfPart;
    object: Object3D;
    material: Material;
    calls: number;
    triangles: number;
    instances: number;
  }
  let recording: Call[] | null = null;
  let pendingCapture: ((calls: Call[]) => void) | null = null;
  const original: RenderBufferDirect = renderer.renderBufferDirect;
  const recordingRenderBufferDirect: RenderBufferDirect = function (
    this: WebGLRenderer,
    cam: Camera,
    sc: Scene | null,
    geometry: BufferGeometry,
    material: Material,
    object: Object3D,
    group: unknown,
  ) {
    const info = renderer.info.render;
    const c0 = info.calls,
      t0 = info.triangles;
    original.call(this, cam, sc as Scene, geometry, material, object, group as never);
    recording?.push({
      part: partOf(object),
      object,
      material,
      calls: info.calls - c0,
      triangles: info.triangles - t0,
      instances: (object as { isInstancedMesh?: boolean; count?: number }).isInstancedMesh
        ? ((object as { count?: number }).count ?? 0)
        : 1,
    });
  } as RenderBufferDirect;

  const isVisible = (o: Object3D) => {
    for (let p: Object3D | null = o; p; p = p.parent) if (!p.visible) return false;
    return true;
  };
  const summarize = (calls: Call[]) => {
    const rows = new Map<
      PerfPart,
      {
        drawCalls: number;
        triangles: number;
        instances: number;
        drawnObjects: Set<Object3D>;
        materials: Set<Material>;
        programs: Set<unknown>;
        materialTypes: Map<string, number>;
        transparentCalls: number;
        materialSwitches: number;
        programSwitches: number;
      }
    >();
    const row = (p: PerfPart) => {
      let r = rows.get(p);
      if (!r)
        rows.set(
          p,
          (r = {
            drawCalls: 0,
            triangles: 0,
            instances: 0,
            drawnObjects: new Set(),
            materials: new Set(),
            programs: new Set(),
            materialTypes: new Map(),
            transparentCalls: 0,
            materialSwitches: 0,
            programSwitches: 0,
          }),
        );
      return r;
    };
    // three.js re-uploads a material's uniforms (setProgram, refreshMaterial) whenever the material or
    // program differs from the previous draw: count those switches, in draw order.
    let lastMaterial: Material | null = null,
      lastProgram: unknown = null;
    for (const c of calls) {
      const r = row(c.part);
      r.drawCalls += c.calls;
      r.triangles += c.triangles;
      r.instances += c.instances;
      r.drawnObjects.add(c.object);
      r.materials.add(c.material);
      const props = renderer.properties.get(c.material) as { currentProgram?: unknown };
      if (props.currentProgram) r.programs.add(props.currentProgram);
      r.materialTypes.set(c.material.type, (r.materialTypes.get(c.material.type) ?? 0) + 1);
      if (c.material.transparent) r.transparentCalls += c.calls;
      if (c.material !== lastMaterial) r.materialSwitches++;
      if (props.currentProgram !== lastProgram) r.programSwitches++;
      lastMaterial = c.material;
      lastProgram = props.currentProgram;
    }
    // Scene-side counts: every node under the part's roots (the matrix update walks all of them,
    // visible or not), renderable objects, and those visible.
    const tree = new Map<
      PerfPart,
      { nodes: number; autoMatrix: number; renderables: number; visible: number }
    >();
    scene.traverse((o) => {
      const p = partOf(o);
      let t = tree.get(p);
      if (!t) tree.set(p, (t = { nodes: 0, autoMatrix: 0, renderables: 0, visible: 0 }));
      t.nodes++;
      if (o.matrixAutoUpdate) t.autoMatrix++;
      const r = o as { isMesh?: boolean; isPoints?: boolean; isLine?: boolean; isSprite?: boolean };
      if (r.isMesh || r.isPoints || r.isLine || r.isSprite) {
        t.renderables++;
        if (isVisible(o)) t.visible++;
      }
    });
    return PERF_PARTS.filter((p) => rows.has(p) || tree.has(p)).map((part) => {
      const r = rows.get(part);
      const t = tree.get(part) ?? { nodes: 0, autoMatrix: 0, renderables: 0, visible: 0 };
      return {
        part,
        drawCalls: r?.drawCalls ?? 0,
        triangles: r?.triangles ?? 0,
        instances: r?.instances ?? 0,
        drawnObjects: r?.drawnObjects.size ?? 0,
        materials: r?.materials.size ?? 0,
        programs: r?.programs.size ?? 0,
        transparentCalls: r?.transparentCalls ?? 0,
        materialSwitches: r?.materialSwitches ?? 0,
        programSwitches: r?.programSwitches ?? 0,
        materialTypes: Object.fromEntries(r?.materialTypes ?? []),
        sceneNodes: t.nodes,
        autoMatrixNodes: t.autoMatrix,
        renderables: t.renderables,
        visibleRenderables: t.visible,
      };
    });
  };

  // --- per-frame log, GPU timer --------------------------------------------------------------
  const log: FrameRecord[] = [];
  let logging = false;
  let begun = 0,
    preRender = 0,
    lastStart = 0,
    lastSnapshot: unknown = null;
  let current: FrameRecord | null = null;

  const timerExt = gl.getExtension('EXT_disjoint_timer_query_webgl2') as {
    TIME_ELAPSED_EXT: number;
    GPU_DISJOINT_EXT: number;
  } | null;
  let gpuOn = false;
  const gpuPending: { query: WebGLQuery; frame: FrameRecord | null }[] = [];
  const gpuWindow: number[] = [];
  let gpuDisjoint = 0;
  const pollGpu = () => {
    while (gpuPending.length) {
      const { query, frame } = gpuPending[0];
      if (!gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE)) break;
      gpuPending.shift();
      const disjoint = gl.getParameter(timerExt!.GPU_DISJOINT_EXT);
      const ns = gl.getQueryParameter(query, gl.QUERY_RESULT) as number;
      gl.deleteQuery(query);
      if (disjoint) {
        gpuDisjoint++;
        continue;
      }
      const ms = ns / 1e6;
      gpuWindow.push(ms);
      if (gpuWindow.length > 4000) gpuWindow.shift();
      if (frame) frame.gpuMs = ms;
    }
  };
  const originalRender = renderer.render;
  const timedRender = function (this: WebGLRenderer, s: Object3D, c: Camera) {
    pollGpu();
    const query = gl.createQuery();
    if (!query) return originalRender.call(this, s, c);
    gl.beginQuery(timerExt!.TIME_ELAPSED_EXT, query);
    originalRender.call(this, s, c);
    gl.endQuery(timerExt!.TIME_ELAPSED_EXT);
    gpuPending.push({ query, frame: current });
  } as WebGLRenderer['render'];

  const begin = useStage(Symbol('p1-perf-begin'), { before: mainStage });
  const pre = useStage(Symbol('p1-perf-prerender'), { after: mainStage, before: renderStage });
  const end = useStage(Symbol('p1-perf-end'), { after: renderStage });
  useTask(
    () => {
      begun = performance.now();
      const snap = input.snapshot();
      const changed = snap !== lastSnapshot;
      lastSnapshot = snap;
      if (logging) {
        current = {
          t: begun,
          interval: lastStart ? begun - lastStart : null,
          tasksMs: 0,
          renderMs: 0,
          cpuMs: 0,
          gpuMs: null,
          snapshot: changed,
          calls: 0,
          triangles: 0,
        };
        log.push(current);
        if (log.length > 20000) log.shift();
      } else current = null;
      lastStart = begun;
      if (pendingCapture) {
        recording = [];
        renderer.renderBufferDirect = recordingRenderBufferDirect;
      }
    },
    { stage: begin, autoInvalidate: false },
  );
  useTask(
    () => {
      preRender = performance.now();
    },
    { stage: pre, autoInvalidate: false },
  );
  useTask(
    () => {
      const now = performance.now();
      if (current) {
        current.tasksMs = preRender - begun;
        current.renderMs = now - preRender;
        current.cpuMs = now - begun;
        current.calls = renderer.info.render.calls;
        current.triangles = renderer.info.render.triangles;
      }
      if (recording && pendingCapture) {
        renderer.renderBufferDirect = original;
        const done = pendingCapture,
          calls = recording;
        pendingCapture = null;
        recording = null;
        done(calls);
      }
      if (gpuOn) pollGpu();
    },
    { stage: end, autoInvalidate: false },
  );

  const api = {
    parts: PERF_PARTS,
    /** Re-read the scene tree (after the worker layers or the lighting set arrived). */
    reclassify() {
      owners = classify();
      return [...notes];
    },
    notes: () => [...notes],
    /** One frame's draw calls by part; resolves after that frame was rendered. */
    capture(): Promise<{
      totals: {
        drawCalls: number;
        triangles: number;
        programs: number;
        geometries: number;
        textures: number;
      };
      parts: ReturnType<typeof summarize>;
      notes: string[];
    }> {
      owners = classify();
      return new Promise((resolve) => {
        pendingCapture = (calls) =>
          resolve({
            totals: {
              drawCalls: renderer.info.render.calls,
              triangles: renderer.info.render.triangles,
              programs: renderer.info.programs?.length ?? 0,
              geometries: renderer.info.memory.geometries,
              textures: renderer.info.memory.textures,
            },
            parts: summarize(calls),
            notes: [...notes],
          });
      });
    },
    /** Hide (false) or show again (true) one part or every part; true restores the earlier state. */
    setPartVisible(part: PerfPart | 'all', visible: boolean) {
      if (visible) return restore();
      owners = classify();
      for (const root of roots(part)) hide(root, part);
    },
    restoreParts: restore,
    flags: perfFlags,
    resetFlags() {
      perfFlags.trafficUpdate = perfFlags.lightingUpdate = perfFlags.vehicleLights = true;
    },
    frames: {
      start() {
        log.length = 0;
        lastStart = 0;
        logging = true;
      },
      stop(): FrameRecord[] {
        logging = false;
        return log.map((f) => ({ ...f }));
      },
      /** Collect GPU results that arrived after stop(). */
      collect(): FrameRecord[] {
        if (gpuOn) pollGpu();
        return log.map((f) => ({ ...f }));
      },
    },
    gpu: {
      available: !!timerExt,
      get on() {
        return gpuOn;
      },
      enable() {
        if (!timerExt || gpuOn) return !!timerExt;
        gpuOn = true;
        gpuWindow.length = 0;
        gpuDisjoint = 0;
        renderer.render = timedRender;
        return true;
      },
      disable() {
        if (!gpuOn) return;
        gpuOn = false;
        renderer.render = originalRender;
      },
      poll: () => (timerExt ? pollGpu() : undefined),
      reset() {
        gpuWindow.length = 0;
        gpuDisjoint = 0;
      },
      read() {
        const s = [...gpuWindow].sort((a, b) => a - b);
        const mean = s.length ? s.reduce((a, b) => a + b, 0) / s.length : null;
        return {
          samples: s.length,
          disjoint: gpuDisjoint,
          meanMs: mean,
          medianMs: s.length ? s[Math.floor(s.length / 2)] : null,
          p95Ms: s.length ? s[Math.ceil(s.length * 0.95) - 1] : null,
        };
      },
    },
    /** Resolution scaling: drawing buffer = CSS size × ratio (1 = the app's normal dpr). */
    setPixelRatio(ratio: number) {
      const canvas = renderer.domElement;
      renderer.setPixelRatio(ratio);
      renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
      return { width: canvas.width, height: canvas.height };
    },
    get camera() {
      return camera.current;
    },
    renderer,
    scene,
  };
  (globalThis as unknown as { __perfP1: typeof api }).__perfP1 = api;
  return api;
}
