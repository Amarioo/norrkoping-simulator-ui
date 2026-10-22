# Step 6 file inventory — 2026-10-21

Paths are relative to the UI repository. Comparison base: `994b881`; no changes are committed.
The earlier session implemented the feature; recovery retained it and completed verification/evidence.
The only runtime change during recovery is retaining arena typed arrays for WebGL context restoration.
The corresponding browser regression test was added. Documentation was completed and sources cross-checked.

**Pre-existing unrelated work:** `.vscode/extensions.json` was already untracked when recovery began and was left untouched.
**Backend:** no files changed; HEAD `e143535`, clean `main`. Shared geographic JSON files are unchanged.

| File | Origin |
|---|---|
| `.gitignore` | Carried Step 6 work; preserved |
| `DATA-LICENSE.md` | Carried Step 6 work; preserved |
| `README.md` | Carried Step 6 work; amended during recovery |
| `docs/claude-progress.md` | Completed/added during recovery |
| `docs/step6/README.md` | Completed/added during recovery |
| `docs/step6/evidence/before-after/stadium-elevated-nw.jpg` | Completed/added during recovery |
| `docs/step6/evidence/before-after/stadium-elevated-se.jpg` | Completed/added during recovery |
| `docs/step6/evidence/before-after/stadium-exterior-ne.jpg` | Completed/added during recovery |
| `docs/step6/evidence/before-after/stadium-exterior-se.jpg` | Completed/added during recovery |
| `docs/step6/evidence/before-after/stadium-exterior-west.jpg` | Completed/added during recovery |
| `docs/step6/evidence/before-after/stadium-pitch-north.jpg` | Completed/added during recovery |
| `docs/step6/evidence/before-after/stadium-pitch-west.jpg` | Completed/added during recovery |
| `docs/step6/evidence/capture-settings.json` | Completed/added during recovery |
| `docs/step6/evidence/floodlights/stadium-elevated-se.jpg` | Completed/added during recovery |
| `docs/step6/evidence/floodlights/stadium-exterior-ne.jpg` | Completed/added during recovery |
| `docs/step6/evidence/floodlights/stadium-exterior-west.jpg` | Completed/added during recovery |
| `docs/step6/evidence/floodlights/stadium-pitch-north.jpg` | Completed/added during recovery |
| `docs/step6/evidence/floodlights/stadium-pitch-west.jpg` | Completed/added during recovery |
| `docs/step6/evidence/kungsgatan-baseline.png` | Completed/added during recovery |
| `docs/step6/evidence/kungsgatan-legacy.png` | Completed/added during recovery |
| `docs/step6/evidence/sunrise/kungsgatan-elevated.jpg` | Completed/added during recovery |
| `docs/step6/evidence/sunrise/kungsgatan-street.jpg` | Completed/added during recovery |
| `docs/step6/evidence/sunrise/stadium-elevated-se.jpg` | Completed/added during recovery |
| `docs/step6/evidence/sunrise/stadium-pitch-north.jpg` | Completed/added during recovery |
| `docs/step6/evidence/sunrise/stromparken-elevated.jpg` | Completed/added during recovery |
| `docs/step6/evidence/sunrise/stromparken-path.jpg` | Completed/added during recovery |
| `docs/step6/evidence/time-of-day/kungsgatan-elevated.jpg` | Completed/added during recovery |
| `docs/step6/evidence/time-of-day/kungsgatan-street.jpg` | Completed/added during recovery |
| `docs/step6/evidence/time-of-day/stadium-elevated-se.jpg` | Completed/added during recovery |
| `docs/step6/evidence/time-of-day/stadium-pitch-north.jpg` | Completed/added during recovery |
| `docs/step6/evidence/time-of-day/stromparken-elevated.jpg` | Completed/added during recovery |
| `docs/step6/evidence/time-of-day/stromparken-path.jpg` | Completed/added during recovery |
| `docs/step6/files.md` | Completed/added during recovery |
| `docs/step6/lighting-architecture.md` | Carried Step 6 work; amended during recovery |
| `docs/step6/lighting-data.md` | Carried Step 6 work; preserved |
| `docs/step6/measurements/after-dev-day.json` | Completed/added during recovery |
| `docs/step6/measurements/after-dev-night-event.json` | Completed/added during recovery |
| `docs/step6/measurements/before-dev-2.json` | Completed/added during recovery |
| `docs/step6/measurements/final/after-startup-1.json` | Completed/added during recovery |
| `docs/step6/measurements/final/after-startup-2.json` | Completed/added during recovery |
| `docs/step6/measurements/final/after-startup-3.json` | Completed/added during recovery |
| `docs/step6/measurements/final/before-startup-1.json` | Completed/added during recovery |
| `docs/step6/measurements/final/before-startup-2.json` | Completed/added during recovery |
| `docs/step6/measurements/final/before-startup-3.json` | Completed/added during recovery |
| `docs/step6/measurements/final/heap-1.json` | Completed/added during recovery |
| `docs/step6/measurements/final/heap-2.json` | Completed/added during recovery |
| `docs/step6/measurements/final/heap-3.json` | Completed/added during recovery |
| `docs/step6/measurements/r-after-light-1.json` | Completed/added during recovery |
| `docs/step6/measurements/r-after-light-2.json` | Completed/added during recovery |
| `docs/step6/measurements/r-after-light-3.json` | Completed/added during recovery |
| `docs/step6/measurements/r-before-light-1.json` | Completed/added during recovery |
| `docs/step6/measurements/r-before-light-2.json` | Completed/added during recovery |
| `docs/step6/measurements/r-before-light-3.json` | Completed/added during recovery |
| `docs/step6/measurements/resources.json` | Completed/added during recovery |
| `docs/step6/measurements/resume/after-startup-1.json` | Completed/added during recovery |
| `docs/step6/measurements/resume/after-startup-2.json` | Completed/added during recovery |
| `docs/step6/measurements/resume/after-startup-3.json` | Completed/added during recovery |
| `docs/step6/measurements/resume/before-startup-1.json` | Completed/added during recovery |
| `docs/step6/measurements/resume/before-startup-2.json` | Completed/added during recovery |
| `docs/step6/measurements/resume/before-startup-3.json` | Completed/added during recovery |
| `docs/step6/measurements/resume/heap-1.json` | Completed/added during recovery |
| `docs/step6/measurements/resume/heap-2.json` | Completed/added during recovery |
| `docs/step6/measurements/resume/heap-3.json` | Completed/added during recovery |
| `docs/step6/measurements/resume/summary-after.json` | Completed/added during recovery |
| `docs/step6/measurements/resume/summary-before.json` | Completed/added during recovery |
| `docs/step6/measurements/source-state.json` | Completed/added during recovery |
| `docs/step6/measurements/summary-after-light.json` | Completed/added during recovery |
| `docs/step6/measurements/summary-before-light.json` | Completed/added during recovery |
| `docs/step6/measurements/worker-geometry-after.json` | Completed/added during recovery |
| `docs/step6/measurements/worker-geometry-before.json` | Completed/added during recovery |
| `docs/step6/performance.md` | Completed/added during recovery |
| `docs/step6/poses.json` | Carried Step 6 work; preserved |
| `docs/step6/stadium-references.md` | Carried Step 6 work; amended during recovery |
| `scripts/data/norrkoping-lighting-source.json` | Carried Step 6 work; preserved |
| `scripts/geo/stadium_lidar.py` | Carried Step 6 work; preserved |
| `scripts/step6/capture-evidence.sh` | Carried Step 6 work; preserved |
| `scripts/step6/capture.mjs` | Carried Step 6 work; preserved |
| `scripts/step6/fetch-lighting-sources.mjs` | Carried Step 6 work; preserved |
| `scripts/step6/heap-classes.mjs` | Carried Step 6 work; preserved |
| `scripts/step6/import-streetlights.mjs` | Carried Step 6 work; preserved |
| `scripts/step6/measure-heap.mjs` | Carried Step 6 work; preserved |
| `scripts/step6/measure-lighting.mjs` | Carried Step 6 work; preserved |
| `scripts/step6/montage.py` | Carried Step 6 work; preserved |
| `scripts/step6/package-evidence.mjs` | Completed/added during recovery |
| `scripts/step6/pilots.mjs` | Carried Step 6 work; preserved |
| `scripts/step6/poses.test.ts` | Carried Step 6 work; preserved |
| `scripts/step6/profile-startup.mjs` | Carried Step 6 work; preserved |
| `scripts/step6/resources.test.ts` | Completed/added during recovery |
| `scripts/step6/summarize-lighting.mjs` | Carried Step 6 work; preserved |
| `scripts/step6/summarize-perf.mjs` | Carried Step 6 work; preserved |
| `scripts/step6/vitest.config.ts` | Carried Step 6 work; preserved |
| `src/App.svelte` | Carried Step 6 work; preserved |
| `src/lib/Scene.svelte` | Carried Step 6 work; preserved |
| `src/lib/data/streetlights-provenance.json` | Carried Step 6 work; preserved |
| `src/lib/data/streetlights.json` | Carried Step 6 work; preserved |
| `src/lib/lighting/cityLights.ts` | Carried Step 6 work; preserved |
| `src/lib/lighting/controller.ts` | Carried Step 6 work; preserved |
| `src/lib/lighting/environment.ts` | Carried Step 6 work; preserved |
| `src/lib/lighting/fixtures.ts` | Carried Step 6 work; preserved |
| `src/lib/lighting/lighting.test.ts` | Carried Step 6 work; preserved |
| `src/lib/lighting/reference.ts` | Carried Step 6 work; preserved |
| `src/lib/lighting/sky.ts` | Carried Step 6 work; preserved |
| `src/lib/lighting/solar.test.ts` | Carried Step 6 work; preserved |
| `src/lib/lighting/solar.ts` | Carried Step 6 work; preserved |
| `src/lib/lighting/state.svelte.ts` | Carried Step 6 work; preserved |
| `src/lib/lighting/streetlights.test.ts` | Carried Step 6 work; preserved |
| `src/lib/mapLandmarks.ts` | Carried Step 6 work; preserved |
| `src/lib/mapModel.ts` | Carried Step 6 work; preserved |
| `src/lib/mapView.ts` | Carried Step 6 work; preserved |
| `src/lib/stadium/idrottsparken.test.ts` | Carried Step 6 work; preserved |
| `src/lib/stadium/idrottsparken.ts` | Carried Step 6 work; amended during recovery |
| `src/lib/stadium/spec.ts` | Carried Step 6 work; preserved |
| `src/style.css` | Carried Step 6 work; preserved |
| `tests/lighting.spec.ts` | Carried Step 6 work; amended during recovery |

Ignored local files: `work/step6/` holds the original baseline app, all 113 full PNG captures,
intermediate benchmarks, downloaded references and LiDAR scratch. Curated evidence and raw final
measurements are copied into `docs/step6/`; source photos and raw LiDAR are not redistributed.
