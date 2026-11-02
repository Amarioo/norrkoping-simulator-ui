// Phase P2c: hook builds (VITE_LIGHTING_HOOK=1, source maps) of main and of the working tree, for
// paired measurement. P2c differs from main in src/lib/mapLandmarks.ts only, so 'main' is built in
// this checkout with that one file swapped for BASE_REF's version (default origin/main) and restored
// afterwards (hash checked); 'p2c' is the working tree as it is.
//   node scripts/perf-p2c/build-variants.mjs [outRoot=work/perf-p2c] [variants=main,p2c]
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';

const [outRoot = 'work/perf-p2c', list = 'main,p2c'] = process.argv.slice(2);
const FILE = 'src/lib/mapLandmarks.ts';
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const branch = fs.readFileSync(FILE, 'utf8');
const before = sha(branch);
const source = (variant) => {
  if (variant === 'main')
    return execFileSync('git', ['show', `${process.env.BASE_REF ?? 'origin/main'}:${FILE}`], {
      encoding: 'utf8',
    });
  if (variant === 'p2c') return branch;
  throw new Error(`unknown variant ${variant}`);
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
