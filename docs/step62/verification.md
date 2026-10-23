# Verification and reproduction

Research/check date: **2026-10-23**. No production code, shader, runtime geographic data, lighting inventory, vegetation generation or vehicle routes changed. New tests/tools are development-only.

## Results

| Check | Result / boundary |
|---|---|
| Backend targeted Gradle run, JDK25, offline dependencies | **14 tests passed**, zero failures: RoadRoutingTest6, Step62RoutingAuditTest1, TransitRegressionTest5, TransitDestinationTest2. Production filter tested unchanged. |
| Existing UI lighting + coordinate tests | **54 passed**, four files. Includes independent geographic reference controls and pilot light-grid/occlusion/lifecycle behavior. |
| Added current-grid stress audit | **3 passed**: capacity/overflow detection, insertion-order-dependent tie result, dense far-apart allocation/byte formula. Tests document current shortcomings, not a new scalable implementation. |
| JSON Schema draft07 | Schema meta-validation and **eight sample records** pass using `jsonschema`; formats checked. |
| All retained JSON | Parsed, finite numbers checked, duplicate IDs checked in each asset dataset; parent references, explicit-unlit exclusions, expected extracted counts and hash parity checked. [Machine report](evidence/validation.json). |
| Repeat local generation | **Twelve generated files byte-identical** from the same pinned local inputs/code, including schema examples, extracts, fuel table and inspector. [Hashes](evidence/reproducibility.json). This is not reproducibility of a future live OSM query. |
| Independent coordinate check | **25 OSM lamp positions** converted independently with PROJ EPSG4326→3006. Worst difference **0.000625m** from retained three-decimal E/N; this validates conversion, **not source positional accuracy** or a geodetic epoch transformation. |
| Shared runtime resources | UI/backend terrain, bridge profiles and transport network SHA256 match. Initial repository worktrees were clean; runtime files still unchanged. |
| Source controls | URLs/edition/date/licence status recorded; twelve actual local source-copy hashes in [manifest](evidence/source-manifest.json). OSM query/base/version metadata retained; brochure age read from page/footer/PDF metadata. |
| Inspector | Headless local Edge at1400×1000 and600×900: layer filter, zoom, marker E/N/provenance selection, no page exceptions; screenshots visually inspected. [Report](evidence/inspector-check.json). This validates the **research map UI only**. |
| Git hygiene | `git diff --check` in both repos. Only new audit test and UI research/docs/scripts/progress/targeted scratch-ignore change. No commit/push/reset/stash. Initial remote `main` verified by read-only `ls-remote`. |

Performance is **extracted from preserved Step6.1** reports/raw measurements, not freshly benchmarked. Complete simulator build, whole frontend/backend suite, live traffic SSE and simulator screenshots were not repeated because no runtime changes occurred. No unimplemented lighting category was visually validated; no lower-end GPU was tested.

## Findings exposed by failed attempts

- Initial backend extra assertion that every genuine mapped end survives **failed**. The seven bus, one compact and one truck end losses are real audit results; the test was changed to report them explicitly and verify the narrower retained-edge invariant. Passing final tests does **not** mean the backend is transit-ready. Skvallertorget loss and service21 dependency remain open.
- First Gradle invocation could not access the sandboxed existing cache; automatic JDK selection initially chose11, which cannot run this Gradle version. Explicit local `ms-25.0.4.1` and normal reviewed access succeeded; no build configuration changed.
- First new Vitest run hit a Windows sandbox temporary-file rename `EPERM` before tests loaded. Direct local Vitest with reviewed process access ran successfully. This is not counted as a test failure/pass on application behavior.
- Overpass POST returned502; bounded GET succeeded. LFV encoded HTML was unavailable via web reader; direct official HTTPS succeeded. Municipal trail vector/fixture licensing and exact2026 alignment remain unresolved despite accessible viewer/brochure. These gaps were not filled with invented geometry/schedules.

## Reproduce without a full simulator build

From backend checkout, PowerShell (JDK path may differ on another computer):

```powershell
$env:JAVA_HOME = "$env:USERPROFILE\.jdks\ms-25.0.4.1"
.\gradlew.bat test --tests '*Step62RoutingAuditTest' --tests '*RoadRoutingTest' --tests '*TransitRegressionTest' --tests '*TransitDestinationTest' --offline
```

From UI checkout, retaining the pinned local OSM input under `work/step62/`:

```powershell
node scripts/step62/local-audit.mjs
node scripts/step62/routing-causes.mjs
node scripts/step62/package-inventory.mjs
node scripts/step62/build-inspector.mjs
node scripts/step62/source-manifest.mjs
node scripts/step62/verify-reproducibility.mjs
.\node_modules\.bin\vitest.cmd run -c scripts/step62/vitest.config.ts
.\node_modules\.bin\vitest.cmd run src/lib/lighting src/lib/coordinateSystem.test.ts
node scripts/step62/verify-inspector.mjs
```

Run `scripts/step62/validate.py` with Python and `jsonschema`; it automatically searches ignored `work/step62/python` for a local dependency installation and `work/geodata/python` for existing PROJ bindings. If PROJ is unavailable in that Python ABI it records that limitation; the separate coordinate reference tests still run. Python invocation used here:

```powershell
& 'C:\Users\amarg\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' -X utf8 scripts/step62/validate.py
```

Run the validator twice when first creating its report so the JSON file count includes its own report. The source manifest requires the actual local referenced files; do not fabricate missing raw copies/hashes. Another machine can validate checked-in JSON/schema without source scratch, but reproducing the entire extract requires pinned inputs/versions. A later `fetch-osm.mjs` is a **fresh snapshot**, not the2026-10-23 snapshot magically reproduced; review all counts/dates/source changes before replacing curated evidence.

All new raw HTML/PDF/Overpass files, rendered reference pages, browser screenshots and optional Python validator packages live under specifically ignored `/work/step62/`. No raw survey dataset, downloaded photo, PDF art or package dependency was added to the Git diff.
