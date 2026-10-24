# Norrköping simulator UI

Svelte 5 + Threlte/three.js simulator of Norrköping, built from open geodata (OSM, DTM/LiDAR).
`docs/claude-progress.md` is the recovery checkpoint: read it first, newest status on top.

## How to report back (important)
The reader is not a developer and decides whether to approve or revise. Start every final report with:
1. **Verdict** (2-3 sentences, plain language): what now works, and your recommendation, *approve* or *revise*, and why.
2. **Decisions needed from the user**, as a short list with your recommended option each. If none, say "none".
3. **Risks / not verified**, as a short list.

Then the details (tables, numbers, file list). Explain jargon (lux, p95, occlusion) in a few words on first use.

## Geodata and coordinates
- Data and generators use EPSG:3006 (SWEREF 99 TM). Document every conversion to scene coordinates: origin, axis directions, units, elevation reference system.
- For each dataset record source, license, acquisition date and known accuracy, in the phase's `*-provenance.json` and `docs/<phase>/data-provenance.md`.
- Keep source data, derived data and estimates distinct, and label estimates as estimates. Never invent data (municipal IDs, photometry, schedules).

## Existing work
- Check `git status` before editing. Preserve unrelated and uncommitted changes; never reset, discard or overwrite them to make checks pass.
- Never commit, push or merge unless asked, and say plainly that nothing is committed.
- Don't touch earlier phases' output (e.g. the pilot fixtures) unless the task says so; prove they are unchanged.
- Files in `docs/**/evidence` are history. Re-running harnesses must not overwrite them.

## Verification
- Commands: `npm run check`, `npm run build`, `npm test` (vitest), `npm run test:e2e` (Playwright).
- Done means: type check clean, build OK, vitest and Playwright pass, and the change is verified in the running app (screenshots for visual changes, measured numbers for performance).
- If a check fails, determine whether it failed before the change. Never weaken tests, remove assertions or change expected results just to pass.
- Report the exact checks run, their results, and any checks not run.

## Reproducibility
- Generation is deterministic: same inputs, tool versions and seed. Record these, and verify rebuilds are byte-identical by comparing file hashes.
- Keep timestamps and machine-specific paths out of generated data files.

## Documentation
Each phase/feature gets `docs/<phase>/README.md` plus gap and evidence files, and a new entry at the top of `docs/claude-progress.md`.

## Windows quirks
- Run vitest from PowerShell with an uppercase `C:\` path, or every test file fails.
- Python for DTM/LiDAR scripts: use the codex-runtimes Python 3.12 (bare `python3` hangs).
- PowerShell's Swedish locale gives decimal commas with `-f`. Build coordinate strings in Node/Python.
