// Lighting Phase L0: the self-contained 2D lighting map (docs/lighting-city-l0/lighting-map.html).
// One HTML file, data embedded as JSON, no external requests. Deterministic: no timestamps.

const LABELS: Record<string, [string, string]> = {
  'osm-lit-yes': ['OSM: lit=yes (kartlagt)', '#3ddc84'],
  'gap-fill': ['Lucka ifylld mellan upplysta delar', '#22d3ee'],
  'rule-street-in-tatort': ['Regel: gata inom tätort', '#ffb020'],
  'rule-path-in-tatort': ['Regel: gång-/cykelväg inom tätort', '#ffe066'],
  'rule-roundabout': ['Regel: rondell', '#ff6a1a'],
  'rule-junction': ['Regel: korsning, signal, övergångsställe ±50 m', '#ff8c42'],
  'rule-sidewalk': ['Regel: trottoar, övergångsställe', '#c9b26e'],
  'rule-path-along-street': ['Regel: gång/cykel längs upplyst gata', '#c9b26e'],
  covered: ['Belyst av gatans lyktor (trottoar m.m.)', '#c9b26e'],
  'osm-lit-no': ['OSM: lit=no (kartlagt mörker)', '#ff4d5e'],
  'dark-outside-tatort': ['Mörk: utanför tätort', '#58606e'],
  'dark-motorway-untagged': ['Mörk: motorväg utan lit-tagg', '#9b7be0'],
  'dark-private-service': ['Mörk: serviceväg, parkering, uppfart', '#8a6b4c'],
  'dark-forest-path': ['Mörk: stig i skog', '#3d7a52'],
  'dark-unpaved-path': ['Mörk: grus- eller naturstig', '#5f7189'],
  'dark-minor-path': ['Mörk: enkel stig', '#4b5a6e'],
  'dark-track': ['Mörk: traktorväg', '#454b55'],
  excluded: ['Ej väg i bruk (byggs, inomhus m.m.)', '#2e333b'],
};
const LIT = [
  'osm-lit-yes',
  'gap-fill',
  'rule-street-in-tatort',
  'rule-path-in-tatort',
  'rule-roundabout',
  'rule-junction',
  'covered',
];
const DARK = [
  'osm-lit-no',
  'dark-outside-tatort',
  'dark-motorway-untagged',
  'dark-private-service',
  'dark-forest-path',
  'dark-unpaved-path',
  'dark-minor-path',
  'dark-track',
  'excluded',
];

export function renderMap(data: unknown): string {
  const json = JSON.stringify({ data, LABELS, LIT, DARK }).replace(/</g, '\\u003c');
  return `<!doctype html>
<html lang="sv">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Belysningskarta L0</title>
<style>
:root {
  --bg: #0b1018; --panel: #121a26; --panel-2: #182233; --line: #243247; --text: #e6edf6;
  --muted: #93a3b8; --accent: #ffb020; --focus: #6cb6ff;
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
}
* { box-sizing: border-box; }
html, body { margin: 0; height: 100%; background: var(--bg); color: var(--text); }
body { display: grid; grid-template-columns: 360px 1fr; overflow: hidden; }
aside { background: var(--panel); border-right: 1px solid var(--line); overflow-y: auto; padding: 16px 16px 32px; }
main { position: relative; overflow: hidden; }
canvas { display: block; width: 100%; height: 100%; cursor: grab; touch-action: none; }
canvas.dragging { cursor: grabbing; }
h1 { font-size: 18px; margin: 0 0 2px; letter-spacing: .01em; }
h2 { font-size: 12px; text-transform: uppercase; letter-spacing: .08em; color: var(--muted); margin: 20px 0 8px; font-weight: 600; }
.sub { color: var(--muted); font-size: 12px; line-height: 1.45; }
.kpis { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 12px; }
.kpi { background: var(--panel-2); border: 1px solid var(--line); border-radius: 8px; padding: 8px 10px; }
.kpi b { display: block; font-size: 18px; font-variant-numeric: tabular-nums; }
.kpi span { color: var(--muted); font-size: 11px; }
.legend label { display: grid; grid-template-columns: 18px 22px 1fr auto; align-items: center; gap: 6px; font-size: 12.5px; padding: 3px 2px; border-radius: 5px; cursor: pointer; }
.legend label:hover { background: var(--panel-2); }
.sw { width: 22px; height: 4px; border-radius: 2px; }
.km { color: var(--muted); font-variant-numeric: tabular-nums; font-size: 12px; }
.layers label { display: flex; align-items: center; gap: 8px; font-size: 12.5px; padding: 3px 0; cursor: pointer; }
input[type=range] { width: 100%; accent-color: var(--accent); }
input[type=checkbox] { accent-color: var(--accent); margin: 0; }
.search { display: flex; gap: 6px; }
.search input { flex: 1; background: var(--panel-2); border: 1px solid var(--line); color: var(--text); border-radius: 6px; padding: 7px 9px; font: inherit; font-size: 13px; }
button { background: var(--panel-2); border: 1px solid var(--line); color: var(--text); border-radius: 6px; padding: 6px 10px; font: inherit; font-size: 12.5px; cursor: pointer; }
button:hover { border-color: var(--muted); }
:focus-visible { outline: 2px solid var(--focus); outline-offset: 1px; }
#info { background: var(--panel-2); border: 1px solid var(--line); border-radius: 8px; padding: 10px 12px; font-size: 12.5px; line-height: 1.55; min-height: 44px; }
#info .k { color: var(--muted); }
#info a { color: var(--focus); }
table { width: 100%; border-collapse: collapse; font-size: 12px; font-variant-numeric: tabular-nums; }
th, td { text-align: right; padding: 4px 4px; border-bottom: 1px solid var(--line); }
th:first-child, td:first-child { text-align: left; }
th { color: var(--muted); font-weight: 600; cursor: pointer; user-select: none; position: sticky; top: 0; background: var(--panel); }
tbody tr { cursor: pointer; }
tbody tr:hover { background: var(--panel-2); }
.bar { height: 6px; background: var(--line); border-radius: 3px; overflow: hidden; min-width: 40px; }
.bar i { display: block; height: 100%; background: var(--accent); }
.hud { position: absolute; left: 12px; bottom: 12px; background: rgba(18,26,38,.88); border: 1px solid var(--line); border-radius: 8px; padding: 6px 10px; font-size: 11.5px; color: var(--muted); pointer-events: none; }
.zoom { position: absolute; right: 12px; top: 12px; display: flex; flex-direction: column; gap: 6px; }
.zoom button { width: 34px; height: 34px; font-size: 18px; padding: 0; background: rgba(18,26,38,.9); }
.note { font-size: 11.5px; color: var(--muted); line-height: 1.5; margin-top: 8px; }
.toggle-panel { display: none; }
@media (max-width: 760px) {
  body { grid-template-columns: 1fr; grid-template-rows: auto 1fr; }
  aside { max-height: 46vh; border-right: 0; border-bottom: 1px solid var(--line); padding: 12px 16px 20px; }
  aside.collapsed { max-height: 56px; overflow: hidden; }
  .toggle-panel { display: inline-block; float: right; }
}
</style>
</head>
<body>
<aside id="panel">
  <button class="toggle-panel" id="togglePanel" aria-expanded="true">Dölj</button>
  <h1>Belysningskarta L0</h1>
  <div class="sub" id="sub"></div>
  <div class="kpis" id="kpis"></div>
  <h2>Upplyst</h2>
  <div class="legend" id="legendLit"></div>
  <h2>Mörk</h2>
  <div class="legend" id="legendDark"></div>
  <h2>Lager</h2>
  <div class="layers">
    <label><input type="checkbox" id="glow"> Nattvy: lyktor som ljussken</label>
    <label><input type="checkbox" id="stations" checked> Preliminära lyktpositioner (zooma in)</label>
    <label><input type="checkbox" id="existing" checked> Befintliga armaturer (pilot, A1–A3)</label>
    <label><input type="checkbox" id="lamps" checked> Kartlagda OSM-lyktor</label>
    <label><input type="checkbox" id="pending" checked> Tänt men utan lykta i A1–A3-zon (till L2)</label>
    <label><input type="checkbox" id="tatort" checked> Tätortsgräns (SCB 2023)</label>
    <label><input type="checkbox" id="zones" checked> Befintliga belysningszoner</label>
    <label><input type="checkbox" id="names" checked> Stadsdelsnamn</label>
    <label><input type="checkbox" id="sat"> Satellit: nattljus 2016</label>
    <input type="range" id="satAlpha" min="0" max="100" value="55" aria-label="Satellitens opacitet">
  </div>
  <h2>Sök</h2>
  <div class="search"><input id="q" placeholder="Gatunamn eller OSM way-id" aria-label="Sök gata"><button id="go">Visa</button></div>
  <h2>Vald väg</h2>
  <div id="info">Klicka på en väg i kartan.</div>
  <h2>Stadsdelar (ungefärliga)</h2>
  <table><thead><tr><th data-k="name">Område</th><th data-k="litShare">Upplyst</th><th data-k="litKm">km</th><th data-k="stations">Lyktor</th></tr></thead><tbody id="districts"></tbody></table>
  <p class="note">Område = närmaste stadsdelsnamn i OSM, inte officiella gränser. Längder är mittlinjer (dubbla körbanor räknas två gånger). Lyktpositioner är preliminära uppskattningar på mittlinjen; slutlig placering görs i L2.</p>
  <p class="note">Data: © OpenStreetMap-bidragsgivare (ODbL) · Källa: SCB, Statistiska tätorter 2023 (bearbetad) · NASA Black Marble 2016.</p>
</aside>
<main>
  <canvas id="c" aria-label="Karta över belysning i Norrköping"></canvas>
  <div class="zoom"><button id="zin" aria-label="Zooma in">+</button><button id="zout" aria-label="Zooma ut">−</button><button id="zfit" aria-label="Visa hela kartan">⤢</button></div>
  <div class="hud" id="hud"></div>
</main>
<script id="payload" type="application/json">${json}</script>
<script>
(() => {
const { data: D, LABELS, LIT, DARK } = JSON.parse(document.getElementById('payload').textContent);
const R = D.reasons;
const $ = (id) => document.getElementById(id);
const fmt = (v, d = 0) => v.toLocaleString('sv-SE', { maximumFractionDigits: d, minimumFractionDigits: d });
const S = D.summary;
const hidden = new Set();

// --- side panel ---
$('sub').innerHTML = 'Regel <b>' + S.rule + '</b> · OSM ' + S.osmBase.slice(0, 10) + '<br>Hela kartan klassad gata för gata: tagg i OSM, ifylld lucka eller kommunens riktlinje (2023).';
const litTotal = S.byEvidenceLitKm.tag + S.byEvidenceLitKm.gap + S.byEvidenceLitKm.rule;
$('kpis').innerHTML = [
  [fmt(S.stations), 'nya lyktor (prel.)'],
  [fmt(S.existing), 'befintliga armaturer'],
  [fmt(litTotal, 0) + ' km', 'upplyst av ' + fmt(S.totalKm, 0) + ' km'],
  [fmt(S.byEvidenceLitKm.rule, 0) + ' km', 'upplyst enligt regel'],
].map(([b, s]) => '<div class="kpi"><b>' + b + '</b><span>' + s + '</span></div>').join('');
function legend(el, keys) {
  el.innerHTML = keys.map((k) => {
    const km = k === 'covered' ? S.coveredKm : (S.byReason[k] ? (S.byReason[k].litKm || S.byReason[k].km) : 0);
    const shownKm = k === 'rule-sidewalk' || k === 'rule-path-along-street' ? null : km;
    return '<label><input type="checkbox" data-r="' + k + '" checked><span class="sw" style="background:' + LABELS[k][1] + '"></span><span>' + LABELS[k][0] + '</span><span class="km">' + (shownKm == null ? '' : fmt(shownKm, 0) + ' km') + '</span></label>';
  }).join('');
}
legend($('legendLit'), LIT);
legend($('legendDark'), DARK);
document.querySelectorAll('.legend input').forEach((cb) => cb.addEventListener('change', () => {
  cb.checked ? hidden.delete(cb.dataset.r) : hidden.add(cb.dataset.r);
  draw();
}));
// Sidewalk / along-street ways are drawn as "covered".
const keyOf = (ri) => (ri === R.length - 1 ? 'covered' : (R[ri] === 'rule-sidewalk' || R[ri] === 'rule-path-along-street') ? 'covered' : R[ri]);

// --- geometry ---
const widthOf = (hw) => /^(motorway|trunk|primary|secondary)/.test(hw) ? 2.4 : /^(tertiary|residential|unclassified|living_street|road|busway|pedestrian)/.test(hw) ? 1.5 : hw === 'service' ? 1.0 : 0.85;
const paths = new Map();
for (const [ri, wi, c] of D.pieces) {
  if (c.length < 4) continue;
  const k = keyOf(ri), w = widthOf(D.ways[wi][2]);
  const id = k + '|' + w;
  let p = paths.get(id);
  if (!p) paths.set(id, (p = { k, w, path: new Path2D() }));
  p.path.moveTo(c[0], c[1]);
  for (let i = 2; i < c.length; i += 2) p.path.lineTo(c[i], c[i + 1]);
}
const order = [...DARK].reverse().concat([...LIT].reverse());
const layers = [...paths.values()].sort((a, b) => order.indexOf(b.k) - order.indexOf(a.k) || a.w - b.w);
const ringPath = (rings) => { const p = new Path2D(); for (const r of rings) { p.moveTo(r[0], r[1]); for (let i = 2; i < r.length; i += 2) p.lineTo(r[i], r[i + 1]); p.closePath(); } return p; };
const tatortPath = ringPath(D.tatorter.flatMap((t) => t.rings));
const zonePath = ringPath(D.zones.map((z) => z.ring));
const clipPath = ringPath([D.clip]);
const satCells = D.nightLights.map(([q, lum]) => ({ p: ringPath([q]), lum }));
const evColor = ['#3ddc84', '#22d3ee', '#ffb020'];

// --- view ---
const cv = $('c'), ctx = cv.getContext('2d');
let W = 0, H = 0, dpr = 1, view = { cx: 6800, cy: 5400, s: 0.08 };
const ext = (() => { let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (let i = 0; i < D.clip.length; i += 2) { x0 = Math.min(x0, D.clip[i]); x1 = Math.max(x1, D.clip[i]); y0 = Math.min(y0, D.clip[i + 1]); y1 = Math.max(y1, D.clip[i + 1]); } return { x0, y0, x1, y1 }; })();
function fit() { view.cx = (ext.x0 + ext.x1) / 2; view.cy = (ext.y0 + ext.y1) / 2; view.s = Math.min(W / (ext.x1 - ext.x0), H / (ext.y1 - ext.y0)) * 0.95; }
function resize() { const r = cv.getBoundingClientRect(); dpr = window.devicePixelRatio || 1; W = r.width; H = r.height; cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
const sx = (x) => (x - view.cx) * view.s + W / 2, sy = (y) => H / 2 - (y - view.cy) * view.s;
const wx = (px) => (px - W / 2) / view.s + view.cx, wy = (py) => view.cy - (py - H / 2) / view.s;
let selected = -1;
let raf = 0;
function draw() { cancelAnimationFrame(raf); raf = requestAnimationFrame(render); }
function render() {
  if (!(W > 0 && H > 0 && view.s > 0)) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#0b1018'; ctx.fillRect(0, 0, W, H);
  const world = () => ctx.setTransform(dpr * view.s, 0, 0, -dpr * view.s, dpr * (W / 2 - view.cx * view.s), dpr * (H / 2 + view.cy * view.s));
  world();
  ctx.fillStyle = '#0f1622'; ctx.fill(clipPath);
  if ($('sat').checked) {
    const a = $('satAlpha').value / 100;
    for (const c of satCells) { const l = c.lum / 255; ctx.fillStyle = 'rgba(255,' + Math.round(150 + 80 * l) + ',' + Math.round(60 + 60 * l) + ',' + (a * l).toFixed(3) + ')'; ctx.fill(c.p); }
  }
  if ($('tatort').checked) { ctx.fillStyle = 'rgba(108,182,255,0.05)'; ctx.fill(tatortPath, 'evenodd'); }
  const px = 1 / view.s, zoomW = Math.max(0.6, Math.min(2.2, Math.sqrt(view.s / 0.08)));
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const glow = $('glow').checked;
  for (const l of layers) {
    if (hidden.has(l.k)) continue;
    const lit = LIT.includes(l.k);
    ctx.strokeStyle = glow && lit ? 'rgba(255,190,90,0.35)' : LABELS[l.k][1];
    ctx.lineWidth = l.w * zoomW * px;
    ctx.globalAlpha = glow && !lit ? 0.5 : 1;
    ctx.stroke(l.path);
  }
  ctx.globalAlpha = 1;
  if ($('tatort').checked) { ctx.strokeStyle = 'rgba(108,182,255,0.75)'; ctx.setLineDash([6 * px, 4 * px]); ctx.lineWidth = 1.2 * px; ctx.stroke(tatortPath); ctx.setLineDash([]); }
  if ($('zones').checked) { ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.4 * px; ctx.stroke(zonePath); }
  ctx.strokeStyle = 'rgba(147,163,184,0.5)'; ctx.lineWidth = 1 * px; ctx.stroke(clipPath);
  if (selected >= 0) {
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 5 * px;
    for (const [, wi, c] of D.pieces) if (wi === selected) { ctx.beginPath(); ctx.moveTo(c[0], c[1]); for (let i = 2; i < c.length; i += 2) ctx.lineTo(c[i], c[i + 1]); ctx.stroke(); }
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (glow) {
    ctx.globalCompositeOperation = 'lighter';
    const rad = [30, 24, 16];
    for (const [x, y, t] of D.stations.concat(D.existing.map(([x, y]) => [x, y, 0]))) {
      const X = sx(x), Y = sy(y); if (X < -40 || Y < -40 || X > W + 40 || Y > H + 40) continue;
      const r = Math.max(1.2, rad[t] * view.s);
      ctx.fillStyle = 'rgba(255,176,70,' + (view.s < 0.3 ? 0.22 : 0.14) + ')';
      ctx.beginPath(); ctx.arc(X, Y, r, 0, 6.283); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  } else if ($('stations').checked && view.s > 0.35) {
    const r = Math.min(3, 0.8 + view.s * 1.2);
    for (const [x, y, , e] of D.stations) {
      const X = sx(x), Y = sy(y); if (X < -5 || Y < -5 || X > W + 5 || Y > H + 5) continue;
      ctx.fillStyle = evColor[e]; ctx.fillRect(X - r / 2, Y - r / 2, r, r);
    }
  }
  if ($('existing').checked && view.s > 0.2) {
    ctx.fillStyle = '#ffffff';
    for (const [x, y] of D.existing) { const X = sx(x), Y = sy(y); ctx.beginPath(); ctx.arc(X, Y, 2.2, 0, 6.283); ctx.fill(); }
  }
  if ($('pending').checked) {
    ctx.strokeStyle = '#ff5cf0'; ctx.lineWidth = 2;
    for (const [x, y] of D.pending) { const X = sx(x), Y = sy(y); ctx.beginPath(); ctx.arc(X, Y, view.s > 0.3 ? 6 : 4, 0, 6.283); ctx.stroke(); }
  }
  if ($('lamps').checked) {
    ctx.strokeStyle = '#3ddc84'; ctx.lineWidth = 1.5;
    for (const [x, y] of D.lamps) { const X = sx(x), Y = sy(y); ctx.beginPath(); ctx.arc(X, Y, 4, 0, 6.283); ctx.stroke(); }
  }
  if ($('names').checked) {
    ctx.font = '600 11.5px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const d of D.districts) {
      const X = sx(d.x), Y = sy(d.y); if (X < 0 || Y < 0 || X > W || Y > H) continue;
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(11,16,24,0.85)'; ctx.strokeText(d.name, X, Y);
      ctx.fillStyle = '#dbe6f3'; ctx.fillText(d.name, X, Y);
    }
  }
  $('hud').textContent = 'Skala: 100 px ≈ ' + fmt(100 / view.s, 0) + ' m · E ' + fmt(wx(W / 2) + D.origin[0], 0) + ' N ' + fmt(wy(H / 2) + D.origin[1], 0) + ' (EPSG:3006)';
}

// --- interaction ---
let drag = null, moved = false;
cv.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, cx: view.cx, cy: view.cy }; moved = false; cv.setPointerCapture(e.pointerId); cv.classList.add('dragging'); });
cv.addEventListener('pointermove', (e) => { if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; if (Math.abs(dx) + Math.abs(dy) > 3) moved = true; view.cx = drag.cx - dx / view.s; view.cy = drag.cy + dy / view.s; draw(); });
cv.addEventListener('pointerup', (e) => { cv.classList.remove('dragging'); const r = cv.getBoundingClientRect(); if (drag && !moved) pick(e.clientX - r.left, e.clientY - r.top); drag = null; });
cv.addEventListener('wheel', (e) => { e.preventDefault(); const r = cv.getBoundingClientRect(); zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.0015)); }, { passive: false });
function zoomAt(px, py, f) { const x = wx(px), y = wy(py); view.s = Math.min(20, Math.max(0.02, view.s * f)); view.cx = x - (px - W / 2) / view.s; view.cy = y + (py - H / 2) / view.s; draw(); }
$('zin').onclick = () => zoomAt(W / 2, H / 2, 1.6);
$('zout').onclick = () => zoomAt(W / 2, H / 2, 1 / 1.6);
$('zfit').onclick = () => { fit(); draw(); };
document.querySelectorAll('.layers input').forEach((el) => el.addEventListener('input', draw));
$('togglePanel').onclick = () => { const p = $('panel'); const c = p.classList.toggle('collapsed'); $('togglePanel').textContent = c ? 'Visa' : 'Dölj'; $('togglePanel').setAttribute('aria-expanded', String(!c)); resize(); draw(); };

function pick(px, py) {
  const x = wx(px), y = wy(py), tol = 8 / view.s;
  let best = -1, bd = tol;
  for (const [ri, wi, c] of D.pieces) {
    if (hidden.has(keyOf(ri))) continue;
    for (let i = 2; i < c.length; i += 2) {
      const ax = c[i - 2], ay = c[i - 1], bx = c[i], by = c[i + 1];
      const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
      const t = l2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2)) : 0;
      const d = Math.hypot(x - ax - t * dx, y - ay - t * dy);
      if (d < bd) { bd = d; best = wi; }
    }
  }
  select(best);
}
const evText = { tag: 'kartlagt i OSM', gap: 'härlett från grannarna', rule: 'uppskattat enligt regel' };
function select(wi) {
  selected = wi;
  if (wi < 0) { $('info').textContent = 'Ingen väg här.'; draw(); return; }
  const [id, name, hw, lit, ri, ev, cov, inT, len, dist] = D.ways[wi];
  const k = cov ? 'covered' : keyOf(ri);
  $('info').innerHTML = '<b>' + (name || '(namnlös)') + '</b> <span class="k">· ' + hw + '</span><br>' +
    '<span class="sw" style="display:inline-block;vertical-align:middle;background:' + LABELS[k][1] + '"></span> ' + LABELS[R[ri]] [0] + (cov ? ' · ' + LABELS.covered[0].toLowerCase() : '') + '<br>' +
    '<span class="k">Underlag:</span> ' + evText[ev] + '<br>' +
    '<span class="k">lit-tagg:</span> ' + (lit || '—') + ' · <span class="k">tätort:</span> ' + (inT ? 'ja' : 'nej') + ' · <span class="k">längd:</span> ' + len + ' m<br>' +
    '<span class="k">Område:</span> ' + dist + ' · <a href="https://www.openstreetmap.org/way/' + id + '" target="_blank" rel="noopener">way ' + id + '</a>';
  draw();
}
function centreOn(wi) {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const [, w, c] of D.pieces) if (w === wi) for (let i = 0; i < c.length; i += 2) { x0 = Math.min(x0, c[i]); x1 = Math.max(x1, c[i]); y0 = Math.min(y0, c[i + 1]); y1 = Math.max(y1, c[i + 1]); }
  if (x0 > x1) return;
  view.cx = (x0 + x1) / 2; view.cy = (y0 + y1) / 2; view.s = Math.min(4, Math.max(0.6, Math.min(W, H) / Math.max(150, (x1 - x0) * 3, (y1 - y0) * 3)));
  select(wi);
}
function search() {
  const q = $('q').value.trim().toLowerCase(); if (!q) return;
  let wi = D.ways.findIndex((w) => String(w[0]) === q);
  if (wi < 0) wi = D.ways.findIndex((w) => w[1].toLowerCase() === q);
  if (wi < 0) wi = D.ways.findIndex((w) => w[1].toLowerCase().includes(q));
  if (wi < 0) { $('info').textContent = 'Hittade ingen väg för "' + $('q').value + '".'; return; }
  centreOn(wi);
}
$('go').onclick = search;
$('q').addEventListener('keydown', (e) => { if (e.key === 'Enter') search(); });

// --- district table ---
let sortKey = 'litShare', sortDir = -1;
function table() {
  const rows = [...D.districts].sort((a, b) => (a[sortKey] < b[sortKey] ? -1 : a[sortKey] > b[sortKey] ? 1 : 0) * sortDir);
  $('districts').innerHTML = rows.map((d) => '<tr data-x="' + d.x + '" data-y="' + d.y + '"><td>' + d.name + '</td><td><div class="bar" title="' + fmt(d.litShare * 100, 0) + ' %"><i style="width:' + (d.litShare * 100).toFixed(0) + '%"></i></div></td><td>' + fmt(d.litKm, 1) + '</td><td>' + fmt(d.stations) + '</td></tr>').join('');
  document.querySelectorAll('#districts tr').forEach((tr) => tr.onclick = () => { view.cx = +tr.dataset.x; view.cy = +tr.dataset.y; view.s = 0.5; draw(); });
}
document.querySelectorAll('th').forEach((th) => th.onclick = () => { const k = th.dataset.k; sortDir = sortKey === k ? -sortDir : (k === 'name' ? 1 : -1); sortKey = k; table(); });
table();

// Fit once the canvas has a real size (it can be 0 × 0 while the page loads in a hidden tab).
let fitted = false;
function ensureFit() { if (!fitted && W > 0 && H > 0) { fit(); fitted = true; applyHash(); } }
window.addEventListener('resize', () => { resize(); ensureFit(); draw(); });
new ResizeObserver(() => { resize(); ensureFit(); draw(); }).observe(cv);
resize(); ensureFit();
window.addEventListener('hashchange', () => { applyHash(); draw(); });
function applyHash() {
  // Options from ?query or #hash, e.g. ?way=286445696&glow
  const h = new URLSearchParams(location.search.slice(1) + '&' + location.hash.slice(1));
  $('glow').checked = h.has('glow');
  $('sat').checked = h.has('sat');
  if (h.has('way')) { const wi = D.ways.findIndex((w) => String(w[0]) === h.get('way')); if (wi >= 0) centreOn(wi); }
}
draw();
})();
</script>
</body>
</html>
`;
}
