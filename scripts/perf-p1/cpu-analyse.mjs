// Phase P1: analysis of a CDP CPU profile (shared by cpu-profile.mjs and cpu-reanalyse.mjs). Maps every
// sampled function back to its source file, name and enclosing top-level function/class through the
// hook build's source maps, and sorts the samples into categories:
// each sample goes to the deepest frame of its stack that matches a SPECIFIC rule (a uniform upload
// inside setProgram counts as "program and uniforms", a matrix multiply inside updateMatrixWorld as
// "matrix update"); only stacks with no specific match fall back to the broad rules.
import fs from 'node:fs';
import path from 'node:path';
import { SourceMap } from 'node:module';

export function createAnalyser(dist) {
  const maps = new Map();
  const mapFor = (url) => {
    if (maps.has(url)) return maps.get(url);
    let result = null;
    try {
      const file = path.join(dist, new URL(url).pathname);
      const payload = JSON.parse(fs.readFileSync(file + '.map', 'utf8'));
      result = { map: new SourceMap(payload), payload, lines: new Map() };
    } catch {
      result = null;
    }
    maps.set(url, result);
    return result;
  };
  const cleanSource = (s) =>
    s
      .replace(/\\/g, '/')
      .replace(/^.*?node_modules\//, 'node_modules/')
      .replace(/^(\.\.\/)+/, '')
      .replace(/^.*?\/src\//, 'src/');
  const linesOf = (m, source) => {
    const index = m.payload.sources.indexOf(source);
    const text = m.payload.sourcesContent?.[index];
    if (!text) return null;
    let lines = m.lines.get(index);
    if (!lines) m.lines.set(index, (lines = text.split('\n')));
    return lines;
  };
  const nameAt = (m, source, line, column) => {
    const lines = linesOf(m, source);
    if (!lines) return null;
    // The profiler reports a function's start; look at that line (and the one before) for its name.
    for (const l of [line, line - 1]) {
      const s = (lines[l] ?? '').slice(0, l === line ? column + 60 : undefined);
      const m1 =
        s
          .match(/function\s*\*?\s*([A-Za-z_$][\w$]*)\s*\(/g)
          ?.at(-1)
          ?.match(/function\s*\*?\s*([A-Za-z_$][\w$]*)/) ??
        s.match(
          /([A-Za-z_$][\w$]*)\s*[:=]\s*(?:async\s*)?(?:function\b|\([^)]*\)\s*=>|[A-Za-z_$][\w$]*\s*=>)/,
        ) ??
        s.match(/^\s*(?:static\s+|async\s+|get\s+|set\s+)*([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{/);
      if (m1) return m1[1];
    }
    return null;
  };
  /** The top-level function or class enclosing a line (three.js: WebGLRenderer, WebGLBindingStates, ...). */
  const ownerAt = (m, source, line) => {
    const lines = linesOf(m, source);
    if (!lines) return null;
    for (let l = line; l >= 0; l--) {
      const o = lines[l].match(/^(?:export\s+)?(?:function|class)\s+([A-Za-z_$][\w$]*)/);
      if (o) return o[1];
    }
    return null;
  };
  const resolved = new Map();
  const resolve = (cf) => {
    const key = `${cf.url}:${cf.lineNumber}:${cf.columnNumber}:${cf.functionName}`;
    if (resolved.has(key)) return resolved.get(key);
    let r = { source: '', name: cf.functionName || '(anonymous)', owner: null };
    const m = cf.url?.startsWith('http') ? mapFor(cf.url) : null;
    if (cf.url && !m) r.source = 'browser/' + (cf.url.split('/').pop() || cf.url);
    if (m && cf.lineNumber >= 0) {
      const e = m.map.findEntry(cf.lineNumber, cf.columnNumber);
      if (e?.originalSource) {
        r = {
          source: cleanSource(e.originalSource),
          name:
            e.name ||
            nameAt(m, e.originalSource, e.originalLine, e.originalColumn) ||
            cf.functionName ||
            '(anonymous)',
          line: e.originalLine + 1,
          owner: ownerAt(m, e.originalSource, e.originalLine),
        };
      }
    }
    resolved.set(key, r);
    return r;
  };

  const THREE = /node_modules\/three\//;
  const three = (f, owners, names) =>
    THREE.test(f.source) && (!!owners?.test(f.owner ?? '') || !!names?.test(f.name));
  const SPECIFIC = [
    [
      'three: matrisuppdatering (updateMatrixWorld)',
      (f) => three(f, null, /^(updateMatrixWorld|updateWorldMatrix|updateMatrix)$/),
    ],
    [
      'three: sortering av renderlistan',
      (f) =>
        three(
          f,
          /^(WebGLRenderList|WebGLRenderLists)$/,
          /^(painterSortStable|reversePainterSortStable)$/,
        ),
    ],
    [
      'three: program och uniforms (setProgram)',
      (f) =>
        three(
          f,
          /^(WebGLUniforms|WebGLMaterials|WebGLPrograms|WebGLProgram|WebGLUniformsGroups|StructuredUniform|SingleUniform|PureArrayUniform|flatten|arraysEqual|copyArray|setValue\w*)$/,
          /^(setProgram|getProgram|refreshUniforms\w*|refreshMaterialUniforms|refreshFogUniforms|refreshTransformUniform|upload|seqWithValue|setValue\w*|flatten|arraysEqual|copyArray|updateCommonMaterialProperties|materialNeedsLights|getProgramCacheKey|useProgram|getUniforms|markUniformsLightsNeedsUpdate)$/,
        ),
    ],
    [
      'three: geometri, buffertar och VAO-bindning',
      (f) =>
        three(
          f,
          /^(WebGLBindingStates|WebGLAttributes|WebGLGeometries|WebGLObjects|WebGLMorphtargets)$/,
          null,
        ),
    ],
    [
      'three: frustum-gallring (synlighetstest)',
      (f) =>
        three(
          f,
          /^(Frustum)$/,
          /^(intersectsObject|intersectsSprite|intersectsSphere|intersectsBox)$/,
        ),
    ],
    ['three: renderlista (projectObject)', (f) => three(f, null, /^(projectObject)$/)],
    [
      'three: per objekt (renderObject, modelView/normalMatrix)',
      (f) => three(f, null, /^(renderObject|renderObjects|renderScene)$/),
    ],
    [
      'three: ritanrop (renderBufferDirect, draw*)',
      (f) =>
        three(f, /^(WebGLBufferRenderer|WebGLIndexedBufferRenderer)$/, /^(renderBufferDirect)$/),
    ],
    [
      'trafik: uppdatering (fordon, kollektivtrafik, signaler, flyg)',
      (f) => /src\/lib\/(transportModels|publicTransport|trafficSignals|motion)\.ts/.test(f.source),
    ],
    [
      'trafik: snapshot från servern (SSE, JSON)',
      (f) => /src\/lib\/city\.svelte\.ts/.test(f.source),
    ],
    [
      'belysning: updateVehicles (fordonsljus)',
      (f) =>
        /src\/lib\/lighting\/vehicleLights\.ts/.test(f.source) ||
        (/src\/lib\/lighting\/controller\.ts/.test(f.source) && f.name === 'updateVehicles'),
    ],
    [
      'belysning: update (sol, himmel, armatur-LOD, uniforms)',
      (f) => /src\/lib\/lighting\//.test(f.source),
    ],
    ['mätkrokar (P0-räknare, P1-krok)', (f) => /src\/lib\/perf\//.test(f.source)],
    ['kamera (FreeCamera)', (f) => /FreeCamera\.svelte/.test(f.source)],
    ['scen-task övrigt (Scene.svelte)', (f) => /src\/lib\/Scene\.svelte/.test(f.source)],
    ['UI (App.svelte m.fl.)', (f) => /src\/(App\.svelte|lib\/[\w/]+\.svelte)/.test(f.source)],
  ];
  const FALLBACK = [
    ['three: render övrigt', (f) => three(f, /^(WebGLRenderer|WebGLState|WebGLTextures)$/, null)],
    ['three: övrigt', (f) => THREE.test(f.source)],
    ['Threlte (schemaläggare, tasks)', (f) => /node_modules\/@threlte\//.test(f.source)],
    ['Svelte-reaktivitet', (f) => /node_modules\/svelte\//.test(f.source)],
    ['skräpsamling (GC)', (f) => f.name === '(garbage collector)'],
    ['webbläsaren utanför JS ((program))', (f) => f.name === '(program)'],
    ['inaktiv ((idle))', (f) => f.name === '(idle)'],
    ['övrig app-kod', (f) => /^src\//.test(f.source)],
  ];
  const categorize = (stack) => {
    for (const rules of [SPECIFIC, FALLBACK])
      for (const f of stack) for (const [name, test] of rules) if (test(f)) return name;
    return 'övrigt (native/okänt)';
  };

  return function analyse(profile, frames) {
    const byId = new Map(profile.nodes.map((n) => [n.id, n]));
    const parent = new Map();
    for (const n of profile.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
    const stackCache = new Map();
    const stackOf = (id) => {
      if (stackCache.has(id)) return stackCache.get(id);
      const s = [];
      for (let i = id; i != null; i = parent.get(i)) {
        const n = byId.get(i);
        if (n.callFrame.functionName === '(root)') break;
        s.push(resolve(n.callFrame));
      }
      stackCache.set(id, s);
      return s;
    };
    const cats = new Map(),
      self = new Map();
    let total = 0;
    const deltas = profile.timeDeltas;
    for (let i = 0; i < profile.samples.length; i++) {
      const us = deltas[i + 1] ?? deltas[i] ?? 0;
      const stack = stackOf(profile.samples[i]);
      const cat = categorize(stack);
      cats.set(cat, (cats.get(cat) ?? 0) + us);
      const leaf = stack[0] ?? { source: '', name: '(root)' };
      const owner = leaf.owner && leaf.owner !== leaf.name ? leaf.owner + '.' : '';
      const key = `${owner}${leaf.name} — ${leaf.source || '(native)'}`;
      self.set(key, (self.get(key) ?? 0) + us);
      total += us;
    }
    const perFrame = (us) => us / 1000 / frames;
    const busy = total - (cats.get('inaktiv ((idle))') ?? 0);
    return {
      durationMs: total / 1000,
      frames,
      busyMsPerFrame: perFrame(busy),
      categories: [...cats]
        .map(([category, us]) => ({
          category,
          msPerFrame: perFrame(us),
          shareOfBusy: category.startsWith('inaktiv') ? null : us / busy,
        }))
        .sort((a, b) => b.msPerFrame - a.msPerFrame),
      topSelf: [...self]
        .map(([fn, us]) => ({ fn, msPerFrame: perFrame(us) }))
        .sort((a, b) => b.msPerFrame - a.msPerFrame)
        .slice(0, 40),
    };
  };
}
