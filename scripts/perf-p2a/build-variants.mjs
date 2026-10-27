// Phase P2a: hook builds (VITE_LIGHTING_HOOK=1, source maps) of main and of the tree-cell variants,
// for paired measurement. The branch differs from main only in src/lib/mapView.ts, so every variant is
// built in this checkout with that one file swapped (main's version, or the branch version with
// TREE_DRAW_CELL set to 20 / 40 / 80 scene units = 500 m / 1 km / 2 km); the branch file is restored
// afterwards and its hash checked.
//   node scripts/perf-p2a/build-variants.mjs [outRoot=work/perf-p2a] [variants=main,c20,c40,c80]
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';

const [outRoot = 'work/perf-p2a', list = 'main,c20,c40,c80'] = process.argv.slice(2);
const FILE = 'src/lib/mapView.ts';
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const branch = fs.readFileSync(FILE, 'utf8');
const before = sha(branch);
const source = (variant) => {
  if (variant === 'main')
    return execFileSync('git', ['show', `${process.env.BASE_REF ?? 'main'}:${FILE}`], {
      encoding: 'utf8',
    });
  const cell = Number(variant.slice(1));
  const out = branch.replace(
    /export const TREE_DRAW_CELL = \d+;/,
    `export const TREE_DRAW_CELL = ${cell};`,
  );
  if (!out.includes(`TREE_DRAW_CELL = ${cell};`)) throw new Error(`cannot set cell ${cell}`);
  return out;
};
try {
  for (const variant of list.split(',')) {
    fs.writeFileSync(FILE, source(variant));
    const outDir = path.join(outRoot, `dist-${variant}`);
    const r = spawnSync(
      process.execPath,
      [
        'node_modules/vite/bin/vite.js',
        'build',
        '--sourcemap',
        '--outDir',
        outDir,
        '--emptyOutDir',
      ],
      { stdio: 'inherit', env: { ...process.env, VITE_LIGHTING_HOOK: '1' } },
    );
    if (r.status !== 0) throw new Error(`build ${variant} failed`);
    console.log(`built ${variant} -> ${outDir}`);
  }
} finally {
  fs.writeFileSync(FILE, branch);
  if (sha(fs.readFileSync(FILE, 'utf8')) !== before) throw new Error(`${FILE} not restored`);
}
