# Interface U3 — a tram on the start screen, plain connection texts (2026-11-18)

Requested by the user: something fitting to look at while the simulator starts (a tram like the one in the
simulator), and no technical wording ("Ktor", "starta om backend") in what visitors read.

## What changed

- **Start screen** (`index.html`): the spinner is replaced by a tram on a short piece of track above
  "Startar simulatorn…". It rolls in braking, stands with its nose at a weather shelter under a sign reading
  "Söder Tull" and drives on (changed twice on the user's request the same day: first the stop, then more
  detail: a door per section, bogies with rimmed wheels, a contact wire, and the shelter with bench and
  timetable board). The shelter is a generic drawing, not a copy of the real one at Söder Tull. Söder Tull is a
  stop on the simulator's tram lines. It is an inline SVG side view of the simulator's own tram
  (`src/lib/publicTransport.ts`): five sections, the same livery colours (yellow `#efb919`, green `#08786d`,
  cream `#e9e9d9`, dark window band `#242c2b`), pantograph on the middle section. It is a drawing, not the 3D
  model: the 3D scene does not exist yet while this screen shows.
  - Movement is one CSS transform animation, which the browser keeps running while the main thread builds
    the scene. One round is 7 s: in view at the first paint (negative delay), at the stop after 1.9 s, standing
    1.7 s, gone 2.5 s later. Measured by stepping the animation clock: on the 520 px track the tram
    stands at 62–362 px and the shelter is at 372–422 px.
  - Size follows the screen: the tram is `min(300px, 47vw)` wide and the track 1.73 times that; the stop is
    placed in per cent of the track.
  - With "reduce motion" set in the operating system the tram stands still at the stop.
- **Texts:**
  - Banner over the map when the connection is down: "Försöker ansluta till servern…"
    (was "Ansluter till Ktor… Starta om backend om du nyss uppdaterade projektet.").
  - Answer to a command the server does not know (404): "Servern svarade inte som väntat. Försök igen om en
    stund." (was "Starta om Ktor för att läsa in Norrköping Simulator.").
  - The line "Kotlin / Ktor · CQRS · SSE · Three.js" under the sidebar is removed (technical, and wrong since
    the backend became Go).
  - Developer panel for the stream (`SseDebugPanel.svelte`): "Ktor" removed from the empty-list hint.

## Checks (2026-11-18)

| Check | Result |
| --- | --- |
| `npm run check` | 0 errors, 0 warnings (run again after the last change) |
| `npm run build` | OK (run again after the last change) |
| `npm test` | 640 / 641; the one failure is the known `police.test.ts` (source hash), failing before this change |
| Playwright `simulation`, `sse-reconnect`, `interface-u1` | 5 / 5, against a backend built from `norrkoping-simulator-backend` `main` on port 8095 |
| Running app | start screen and banner seen in the browser, see `evidence/` |

Vitest and Playwright were run on the first version (the tram passing without a stop), not again after the
stop and the details; those changes are markup and CSS in `index.html` only. Not run: the other Playwright files (lighting, landmarks, and so on); they do not touch these texts or the
start screen.

## Gaps

- Light theme and "reduce motion" were not looked at in the browser, only written.
- The tram was looked at in one browser (the app's built-in Chromium), not on a phone.
- The header still says "LOKAL SIMULERING"; left as is, not asked for.

## Evidence

- `evidence/start-screen-shelter.jpg` — the tram standing at the shelter (animation clock held at the stop).
- `evidence/start-screen-soder-tull.jpg` — the second version: the stop as a sign only.
- `evidence/start-screen-tram.jpg` — the first version, without the stop.
- `evidence/connection-banner.jpg` — the banner with the backend stopped.
