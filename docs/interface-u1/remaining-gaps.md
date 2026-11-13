# Interface U1 — remaining gaps (2026-11-13)

## Deliberate differences from the mockup

| Mockup | Built | Why |
|---|---|---|
| Side panel about 360 px wide | 280 px, as before | The 3D canvas keeps exactly its earlier size at every window width, so earlier performance numbers and pictures stay comparable. A wider panel is a one-line change if wanted. |
| Drop-down lists drawn by the library (Base UI / Bits UI Select) | The browser's own `<select>`, restyled | 15 of the 21 test files and 47 scripts operate the native lists, sliders and checkboxes; the native lists also work with keyboard and screen readers already, and the vehicle list has about 200 rows, which a native list handles better on a phone. |
| Sliders drawn by the library | The browser's own range sliders, coloured | Same reason (the tests set them by value). The mockup itself drew native sliders. |
| On/off switches from the library | Native checkboxes drawn as switches | Same reason. Behaviour for keyboard and screen readers is the browser's own. |
| Clock with rolling digits | Plain digits | The clock changes several times a second; rolling digits would animate without pause. Only the four big numbers roll, and they change seldom. |
| Line chart "last 10 min" | Last 5 minutes, one value every 2 s | 150 points are enough to read the trend; fewer redraws. |
| Web fonts (Inter, Space Grotesk) | The computer's own fonts | No request to an outside font service at run time. |
| Toasts inside the map's lower right corner | Lower right corner of the window (top centre on a phone) | They must be readable above the drawer on a phone. In fullscreen they are drawn inside the map. |

So of Bits UI only the tabs are used. The other four libraries are used as planned.

## Not done

- **Older measurement scripts that choose the stadium lights through the list** (`#stadium-lights`,
  `#light-play`) now need the "Tid och ljus" tab opened first, because a hidden control cannot be
  operated by a script: `scripts/step6/measure-lighting.mjs`, `scripts/step61/{measure,capture}.mjs`,
  `scripts/lighting-phase0/{capture,measure,view-calls}.mjs`,
  `scripts/lighting-l1/{capture,measure-scale}.mjs`, `scripts/lighting-l2d/capture.mjs`,
  `scripts/fullscreen-fps/counter-cost.mjs`, `scripts/vehicle-lights-f1/measure.mjs`. Also
  `scripts/check-simulator.mjs` and `scripts/stream-early-start/diag/simulation-diag.spec.ts`, which
  read the old text row under the map. They belong to finished phases and were left untouched. The
  scripts of the later phases (P1 and on: `scripts/perf-p1/lib.mjs` and its copies) set the time
  through `#light-time` and the URL and work unchanged; that was used for this phase's measurement.
- **The tabs "Tid och ljus" and "Flyg" keep their old content**, only restyled. No control was added
  or removed.
- **The roadmap (`docs/roadmap.md`) has no section for the interface track.** The board has a new
  epic "Gränssnitt" (U).
- **Dark theme.** The page is light only. The fps counter and the SSE debug panel keep their dark
  look (they are instruments laid over the map).
- **Bundle size** grows with the five libraries; see the README for the numbers. Loading the charts
  separately, after the map, would take most of it back.
- **`vaul-svelte` is a pre-release** (1.0.0-next.7). It is only loaded into use on screens narrower
  than 760 px. If it is not wanted, the drawer can be rebuilt on Bits UI's dialog in a small step.
- **Only looked at in the test browser** (Edge on this machine) and in the app's browser pane; not
  on a real phone, not in Firefox or Safari, not with a screen reader.
