// Package completed captures, raw measurements and a reproducible code-state manifest for review.
// Run after capture-evidence.sh, montage.py and the measurements: node scripts/step6/package-evidence.mjs
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const out = 'docs/step6';
const poses = JSON.parse(fs.readFileSync(`${out}/poses.json`, 'utf8'));
const sets = [
  'before',
  'legacy',
  't0715',
  't0743',
  't0815',
  't1239',
  't1736',
  't1752',
  't2130',
  't2130-event',
  't2130-training',
];
const captures = {};
for (const set of sets) {
  const dir = `work/step6/ev/${set}`;
  const names = Object.keys(poses).filter(
    (name) => !set.startsWith('t2130-') || name.startsWith('stadium-'),
  );
  for (const name of names) {
    if (!fs.existsSync(`${dir}/${name}.png`)) throw new Error(`Missing capture: ${set}/${name}`);
  }
  captures[set] = {
    ...JSON.parse(fs.readFileSync(`${dir}/capture-meta.json`, 'utf8')),
    poses: names,
  };
}
fs.mkdirSync(`${out}/evidence`, { recursive: true });
fs.writeFileSync(`${out}/evidence/capture-settings.json`, JSON.stringify(captures, null, 2) + '\n');

const measurements = `${out}/measurements`;
fs.mkdirSync(measurements, { recursive: true });
const files = fs
  .readdirSync('work/step6/perf')
  .filter((f) =>
    /^(r-(before|after)-light-\d|summary-.*-light|before-dev-2|after-dev-day|after-dev-night-event|worker-geometry-after|resources)\.json$/.test(
      f,
    ),
  );
for (const file of files) fs.copyFileSync(`work/step6/perf/${file}`, `${measurements}/${file}`);
fs.copyFileSync(
  'work/perf/worker-geometry-before.json',
  `${measurements}/worker-geometry-before.json`,
);
for (const phase of ['final', 'resume']) {
  const from = `work/step6/perf/${phase}`;
  if (!fs.existsSync(from)) continue;
  fs.mkdirSync(`${measurements}/${phase}`, { recursive: true });
  for (const file of fs.readdirSync(from).filter((f) => f.endsWith('.json')))
    fs.copyFileSync(`${from}/${file}`, `${measurements}/${phase}/${file}`);
}
const git = (...args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 20e6 }).trim();
const paths = git(
  'ls-files',
  '--cached',
  '--others',
  '--exclude-standard',
  '--',
  'src',
  'scripts/step6',
  'scripts/data/norrkoping-lighting-source.json',
  'scripts/geo/stadium_lidar.py',
  'tests',
  'package.json',
  'package-lock.json',
  'vite.config.ts',
  'svelte.config.js',
).split('\n');
const sha = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const baselineMismatches = [];
for (const line of git(
  'ls-tree',
  '-r',
  '994b881',
  '--',
  'src',
  'package.json',
  'package-lock.json',
  'vite.config.ts',
  'svelte.config.js',
).split('\n')) {
  const [, hash, file] = line.match(/^\d+ blob (\w+)\t(.+)$/) ?? [];
  if (!file) continue;
  const snapshot = `work/step6/before-app/${file}`;
  if (!fs.existsSync(snapshot) || git('hash-object', `--path=${file}`, snapshot) !== hash)
    baselineMismatches.push(file);
}
const shared = ['terrain.json', 'bridge-profiles.json', 'transport-network.json'].map((file) => {
  const frontend = sha(`src/lib/data/${file}`);
  const backend = sha(`../norrkoping-simulator-backend/src/main/resources/${file}`);
  return { file, frontend, backend, identical: frontend === backend };
});
const state = {
  captured: new Date().toISOString(),
  frontendHead: git('rev-parse', 'HEAD'),
  branch: git('branch', '--show-current'),
  backendHead: git('-C', '../norrkoping-simulator-backend', 'rev-parse', 'HEAD'),
  backendStatus: git('-C', '../norrkoping-simulator-backend', 'status', '--porcelain'),
  baselineMismatches,
  shared,
  note: 'Current full Step 6 working tree; no commit. Previous frame timing predates memory-only fixes; see performance.md.',
  files: Object.fromEntries(paths.sort().map((p) => [p, sha(path.join(root, p))])),
};
fs.writeFileSync(`${measurements}/source-state.json`, JSON.stringify(state, null, 2) + '\n');
const changed = new Set([
  ...git('diff', '--name-only').split('\n'),
  ...git('ls-files', '--others', '--exclude-standard').split('\n'),
  'docs/step6/files.md',
]);
const amended = new Set([
  'README.md',
  'src/lib/stadium/idrottsparken.ts',
  'tests/lighting.spec.ts',
  'docs/step6/lighting-architecture.md',
  'docs/step6/stadium-references.md',
]);
const recovery = new Set([
  'docs/claude-progress.md',
  'docs/step6/README.md',
  'docs/step6/performance.md',
  'docs/step6/files.md',
  'scripts/step6/resources.test.ts',
  'scripts/step6/package-evidence.mjs',
]);
const inventory = [...changed]
  .filter((p) => p && !p.startsWith('.vscode/'))
  .sort()
  .map((p) => {
    const origin = amended.has(p)
      ? 'Carried Step 6 work; amended during recovery'
      : recovery.has(p) ||
          p.startsWith('docs/step6/evidence/') ||
          p.startsWith('docs/step6/measurements/')
        ? 'Completed/added during recovery'
        : 'Carried Step 6 work; preserved';
    return `| \`${p}\` | ${origin} |`;
  });
fs.writeFileSync(
  `${out}/files.md`,
  [
    '# Step 6 file inventory — 2026-10-21',
    '',
    'Paths are relative to the UI repository. Comparison base: `994b881`; no changes are committed.',
    'The earlier session implemented the feature; recovery retained it and completed verification/evidence.',
    'The only runtime change during recovery is retaining arena typed arrays for WebGL context restoration.',
    'The corresponding browser regression test was added. Documentation was completed and sources cross-checked.',
    '',
    '**Pre-existing unrelated work:** `.vscode/extensions.json` was already untracked when recovery began and was left untouched.',
    '**Backend:** no files changed; HEAD `e143535`, clean `main`. Shared geographic JSON files are unchanged.',
    '',
    '| File | Origin |',
    '|---|---|',
    ...inventory,
    '',
    'Ignored local files: `work/step6/` holds the original baseline app, all 113 full PNG captures,',
    'intermediate benchmarks, downloaded references and LiDAR scratch. Curated evidence and raw final',
    'measurements are copied into `docs/step6/`; source photos and raw LiDAR are not redistributed.',
    '',
  ].join('\n'),
);
console.log(
  JSON.stringify({
    sets: sets.length,
    pngs: Object.values(captures).reduce((n, c) => n + c.poses.length, 0),
    baselineMismatches,
    sharedMatch: shared.every((s) => s.identical),
    sourceFiles: paths.length,
  }),
);
if (baselineMismatches.length || shared.some((s) => !s.identical)) process.exitCode = 1;
