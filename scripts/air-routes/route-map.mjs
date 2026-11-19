// Air routes: a drawing of every route against the outline of the mapped area.
//   node scripts/air-routes/route-map.mjs <out.svg> [out.png]
// Reads docs/air-routes/data/geometry.json (written by the backend's TestWriteAirTrafficGeometry): the map
// outline, both runways, the routes of each direction, the approach fixes and the holding circles, all in
// scene units (X east, Z south, 1 unit = 25 m). North is up in the drawing. The PNG is rendered from the
// SVG with the installed browser.
import fs from 'node:fs';

const [out, png] = process.argv.slice(2);
if (!out) throw new Error('usage: <out.svg> [out.png]');
for (const file of [out, png])
  if (file && fs.existsSync(file))
    throw new Error(`${file} exists (evidence is never overwritten)`);
const g = JSON.parse(fs.readFileSync('docs/air-routes/data/geometry.json', 'utf8'));

const xs = g.mapOutline.map((p) => p[0]),
  zs = g.mapOutline.map((p) => p[1]);
const pad = 14,
  scale = 2.2;
const x0 = Math.min(...xs) - pad,
  z0 = Math.min(...zs) - pad;
const W = (Math.max(...xs) - x0 + pad) * scale,
  H = (Math.max(...zs) - z0 + pad) * scale;
const P = ([x, z]) => `${((x - x0) * scale).toFixed(1)},${((z - z0) * scale).toFixed(1)}`;
const line = (points, attrs) =>
  `<polyline points="${points.map(P).join(' ')}" fill="none" ${attrs}/>`;
const text = ([x, z], label, attrs = '') =>
  `<text x="${((x - x0) * scale).toFixed(1)}" y="${((z - z0) * scale).toFixed(1)}" font-family="sans-serif" font-size="13" ${attrs}>${label}</text>`;

// One colour per direction, one dash pattern per route.
const COLOUR = { ESSP: '#b3261e', F13: '#1a5fb4' };
const DASH = ['', '9 5', '2 5'];
let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${W.toFixed(0)}" height="${H.toFixed(0)}" viewBox="0 0 ${W.toFixed(0)} ${H.toFixed(0)}">`;
s += `<rect width="100%" height="100%" fill="#ffffff"/>`;
s += `<polygon points="${g.mapOutline.map(P).join(' ')}" fill="#eef3ea" stroke="#5b6b57" stroke-width="2"/>`;
s += text(
  [Math.min(...xs) + 4, Math.min(...zs) + 9],
  'Kartans gräns (det kartlagda området)',
  'fill="#5b6b57"',
);
for (const strip of g.strips) {
  const end = [
    strip.Start[0] + strip.Direction[0] * strip.Length,
    strip.Start[1] + strip.Direction[1] * strip.Length,
  ];
  for (const [n, route] of strip.Routes.entries())
    s += line(
      route.Track,
      `stroke="${COLOUR[strip.ID]}" stroke-width="2.2" stroke-dasharray="${DASH[n % DASH.length]}" opacity="0.9"`,
    );
  // Climb: from the lift-off point to where the routes begin.
  const liftOff = [
    strip.Start[0] + strip.Direction[0] * strip.LiftOff,
    strip.Start[1] + strip.Direction[1] * strip.LiftOff,
  ];
  s += line([liftOff, strip.ClimbEnd], `stroke="${COLOUR[strip.ID]}" stroke-width="1.2"`);
  s += line([strip.Start, end], 'stroke="#222" stroke-width="5"');
  s += text(
    [strip.Start[0] - 6, strip.Start[1] + 12],
    strip.Name,
    'font-weight="bold" fill="#222"',
  );
}
for (const [n, strip] of g.strips.entries()) {
  // The flights from this strip end at the other strip's fix.
  const other = g.strips[1 - n];
  const touch = [
    other.Start[0] + other.Direction[0] * other.Touchdown,
    other.Start[1] + other.Direction[1] * other.Touchdown,
  ];
  s += line([strip.Fix, touch], `stroke="${COLOUR[strip.ID]}" stroke-width="1.2"`);
  const [cx, cz] = P(strip.HoldCentre).split(',');
  s += `<circle cx="${cx}" cy="${cz}" r="${(g.holdRadius * scale).toFixed(1)}" fill="none" stroke="${COLOUR[strip.ID]}" stroke-width="1" stroke-dasharray="3 3" opacity="0.6"/>`;
}
// Legend.
let y = H - 150;
const row = (colour, dash, label) => {
  s += `<line x1="20" y1="${y}" x2="70" y2="${y}" stroke="${colour}" stroke-width="2.2" stroke-dasharray="${dash}"/>`;
  s += `<text x="80" y="${y + 4}" font-family="sans-serif" font-size="13" fill="#222">${label}</text>`;
  y += 18;
};
for (const strip of g.strips)
  for (const [n, route] of strip.Routes.entries())
    row(
      COLOUR[strip.ID],
      DASH[n % DASH.length],
      `Från ${strip.Name}, ${route.Name}: ${((route.Units * g.unitMetres) / 1000).toFixed(1)} km i ${(route.Speed * g.unitMetres * 3.6).toFixed(0)} km/h`,
    );
s += `<text x="${W - 20}" y="${H - 14}" text-anchor="end" font-family="sans-serif" font-size="12" fill="#555">Norr uppåt · streckade cirklar: väntvarv (flygs normalt inte) · © OpenStreetMap contributors (banor, kartgräns)</text>`;
s += '</svg>\n';
fs.mkdirSync(out.replace(/[\\/][^\\/]*$/, ''), { recursive: true });
fs.writeFileSync(out, s);
if (png) {
  const { chromium } = await import('@playwright/test');
  const browser = await chromium.launch({ channel: 'msedge' });
  const page = await browser.newPage({ viewport: { width: Math.ceil(W), height: Math.ceil(H) } });
  await page.setContent(`<body style="margin:0">${s}</body>`);
  await page.screenshot({ path: png });
  await browser.close();
}
console.log(`${out}: ${W.toFixed(0)} × ${H.toFixed(0)}`);
