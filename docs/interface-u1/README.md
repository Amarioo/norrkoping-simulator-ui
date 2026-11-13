# Interface Phase U1 — the new interface after the mockup (2026-11-13)

Worked directly on local `main` (= `origin/main` `50a625d`). Backend unchanged. **Committed
(`4f83f95`) and pushed to `origin/main`** on the user's request of 2026-11-13, before the frame-time
measurement and a clean full test run (see Risks; both follow with U2). Board: U1 in *Done*, new
epic "Gränssnitt" (U).

Started on the user's decision of 2026-11-13: the look of the React mockup
(<https://claude.ai/artifact/YJYx8rb8z2RZ7mEvcbX6Pn>), built in the existing Svelte app with the
Svelte counterparts of the five libraries, after the session with Vrinneviskogen had finished.

## Verdict

The page has the mockup's look: a light theme, the settings in three tabs (Trafik, Tid och ljus,
Flyg), two charts under the map, big numbers that roll to their new value, toasts (small message
boxes) for the simulator's answers, and on a phone the settings in a drawer pulled up from the
bottom edge. The 3D map itself is untouched and is exactly as large on screen as before.
Recommendation: **approve the look, but wait with the commit** until the performance measurement and
one clean run of the browser tests have been made on a quiet machine. A game was running on the
computer during the checks (about 70 % of the processor), so those two could not be trusted yet.

## Decisions needed

1. **Native lists, sliders and switches, restyled, instead of the library's own.** Only the tabs come
   from Bits UI. *Recommended:* keep. 15 of the 21 test files and 47 scripts operate the native
   controls, and they already work with keyboard and screen readers.
2. **Side panel 280 px wide (as before) instead of the mockup's 360 px.** *Recommended:* keep, so
   the map keeps its size and old measurements stay comparable.
3. **The clock does not roll.** Only the four big numbers do. *Recommended:* keep; the clock changes
   several times a second.
4. **`vaul-svelte` is a pre-release** (no stable version for Svelte 5 exists). It is only fetched on
   screens narrower than 760 px. *Recommended:* accept for now; replace with a drawer built on Bits
   UI's dialog if it causes trouble.
5. **Older measurement scripts of finished phases** that choose the stadium lights through the list
   need the "Tid och ljus" tab opened first (listed in [remaining-gaps.md](remaining-gaps.md)).
   *Recommended:* leave them; fix one when it is needed again.

## Risks / not verified

- **Performance is not measured yet.** The paired measurement (the same harness as the earlier
  phases) waits for a quiet machine. What could cost: the charts read the snapshot every 2 s and
  redraw, also while the map is fullscreen.
- **No clean full run of the browser tests yet.** Three full runs under load gave 31/33, 30/33 and
  30/33. Every failure was a page that was not up within a 5 s limit; the same tests failed 8 of 8
  against the app *before* the change under the same load. See "Checks".
- **Seven unit tests timed out** for the same reason (they pass in 6–9 s where the limit is 5 s).
- **Only looked at in the test browser** (Edge) and the app's browser pane. Not on a real phone, not
  in Firefox or Safari, not with a screen reader.
- **The first screenshots have a styling fault** (the big numbers drawn small). The fault is fixed;
  the correct pictures are in `evidence/final/`. The faulty first set lies directly in `evidence/`
  on this computer only (it could not be removed, evidence folders are write-protected) and is not
  committed.
- One unit test fails as before this phase: `police.test.ts`.

## What changed

| Part | Where | What |
|---|---|---|
| Page | [`src/App.svelte`](../../src/App.svelte) | Header with brand, connection status, clock, pause and reset. Side panel with three tabs (Bits UI `Tabs`). Metric cards with rolling numbers. The map panel and its tools as before (same ids and classes). Under the map: two charts and the event list with the vehicle picker. The old text row under the map is replaced by toasts. |
| Look | [`src/style.css`](../../src/style.css) | Light theme. The rules that decide the map's size (`.sim-layout` columns, `.sim-main` padding, `.map-panel` height) are unchanged. |
| Charts | [`src/lib/ui/TrafficCharts.svelte`](../../src/lib/ui/TrafficCharts.svelte), [`trafficStats.ts`](../../src/lib/ui/trafficStats.ts) | LayerChart area chart "Fordon i rörelse" (last 5 min, one value every 2 s) and bar chart "Fordon per typ". Read from the simulator's snapshot; paused while the browser tab is hidden. Fetched after the page is up. |
| Numbers | [`src/lib/ui/AnimatedNumber.svelte`](../../src/lib/ui/AnimatedNumber.svelte) | NumberFlow for the four big numbers, with the value also as plain text for screen readers and tests. |
| Toasts | `App.svelte` | svelte-sonner: the simulator's answer to a command, errors (stay until the next command), and each new landing. Lower right; top centre on a phone; inside the map in fullscreen. |
| Drawer | [`src/lib/ui/SettingsDrawer.svelte`](../../src/lib/ui/SettingsDrawer.svelte) | vaul-svelte. Below 760 px the side panel is replaced by a button "Inställningar" that opens the same three tabs in a drawer. Fetched only on narrow screens. |
| Tests | `tests/interface-u1.spec.ts` (new), `src/lib/ui/trafficStats.test.ts` (new) | Tabs with arrow keys, values kept between tabs, charts follow the simulator, numbers, toast; the drawer on a phone and the side panel back on a wide screen. |
| Adapted tests | `tests/{simulation,transit,lighting,airport-lights,aircraft-lights}.spec.ts` | Open the right tab before using a control that now sits in a tab (7 places); read the simulator's answer from the toast instead of the old text row (3 places). **No assertion or expected value was changed or removed.** |

Deliberate differences from the mockup are listed in [remaining-gaps.md](remaining-gaps.md);
libraries, versions and licences in [data-provenance.md](data-provenance.md). No dataset changed.

## Measured

**The map's size on screen is unchanged** (`evidence/final/canvas-sizes.json`; drawing buffer in
pixels, before = `50a625d`):

| Window | Before | New |
|---|---|---|
| 1440 × 1040 | 1102 × 684 | 1102 × 684 |
| 1920 × 1080 | 1546 × 710 | 1546 × 710 |
| 1100 × 800 | 812 × 568 | 812 × 568 |
| 390 × 844 | 364 × 546 | 364 × 546 |

**Size of the code the browser fetches** (production build):

| File | Before | New |
|---|---|---|
| Main file (`App`) | 1 068 kB (gzip 290 kB) | 1 119 kB (gzip 306 kB) |
| Charts, fetched after the page is up | – | 171 kB (gzip 48 kB) |
| Drawer, fetched only on narrow screens | – | 69 kB (gzip 21 kB) |

gzip = the compressed size that is actually sent.

**Time until the page is up in the development server** (`scripts/interface-u1/mount-time.mjs`, 6
runs each, alternating, machine under load): before 5.9 s, new 5.9 s (medians); 238 and 276 files
fetched. No difference.

**Frame times: not measured** (see Risks). Command, when the machine is quiet:

```bash
# hook builds (VITE_LIGHTING_HOOK=1) of 50a625d and of the working tree; preview u1-before 5372, u1-new 5373 (+ phase0-backend)
MAX_BUSY=18 node scripts/interface-u1/paired.mjs <new.json> 5 main=http://127.0.0.1:5372 u1=http://127.0.0.1:5373
node scripts/interface-u1/summarize.mjs <run.json> > <summary.md>
```

## Checks

| Check | Result |
|---|---|
| `npm run check` (type check) | 0 errors, 0 warnings |
| `npm run build` | OK; rebuilt twice, byte-identical (file hashes equal) |
| `npm test` (Vitest) | 617 of 626 under load. Failing: `police.test.ts` (known, as before); 7 time-outs at the 5 s limit in `step5`, `idrottsparken`, `corridor`, `corridorL2bc`, `siteLighting` (×3), none of which this phase touches; and the board's link check, which failed only because this report was not written yet. New `trafficStats.test.ts` 4/4. |
| `npm run test:e2e` (Playwright), full runs under load | 31/33, 30/33, 30/33. Failing: `sse-debug` (2 tests) and `simulation` (a second page), each "page not up within 5 s"; once `airport-lights`, when a file copy of mine made the development server reload the page. |
| The same `sse-debug` tests against the app before the change, same load | 0 of 8 pass, and 0 of 8 against the new app: the failure is the load, not the change. |
| The new and the adapted test files alone | `interface-u1` 2/2; `transit`, `lighting`, `airport-lights`, `aircraft-lights`, `fullscreen-fps` all pass; `simulation` passed before the load began and later failed only at the 5 s second-page limit. |
| In the running app | Looked at in the browser pane and in Edge at 1440 × 1040 and at phone width: tabs, sliders, toast, charts, drawer. Screenshots in `evidence/final/`. No console errors. |
| Not run | The paired frame-time measurement; a full browser-test run and a unit-test run on a quiet machine. |

## Evidence

In [`evidence/final/`](evidence/final/): `before-desktop.png`, `before-mobile.png`,
`new-desktop-trafik.png`, `new-desktop-tid-och-ljus.png`, `new-desktop-toast.png`,
`new-desktop-charts.png`, `new-mobile.png`, `new-mobile-drawer.png`, `canvas-sizes.json`.
Made with `scripts/interface-u1/shots.mjs`.

## Files

- New: `src/lib/ui/{TrafficCharts,AnimatedNumber,SettingsDrawer}.svelte`,
  `src/lib/ui/trafficStats.ts`, `src/lib/ui/trafficStats.test.ts`, `tests/interface-u1.spec.ts`,
  `scripts/interface-u1/{shots,mount-time,paired,summarize}.mjs`, `docs/interface-u1/`.
- Changed: `src/App.svelte`, `src/style.css`, `package.json`, `package-lock.json`, `.gitignore`,
  five test files (above), `docs/board/board.json`, `docs/claude-progress.md`.
- Local only: `.claude/launch.json` (`u1-dev` 5371, `u1-before` 5372, `u1-new` 5373,
  `u1-before-dev` 5374) and `work/ui-u1/` (copy of the app before the change, hook builds, logs).
