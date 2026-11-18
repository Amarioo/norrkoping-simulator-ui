# Interface U4 — tablet and phone (2026-11-18)

Requested by the user: "how do we make this iPad and phone adapted?", then "yes, measure first".
Step 1 changed no code in the app. It measured how the page behaves at four screen sizes, so the
following steps start from numbers instead of guesses.

Numbers: [evidence/measurements.json](evidence/measurements.json). Open points: [remaining-gaps.md](remaining-gaps.md).

## Step 3: camera buttons for touch (2026-11-18) — waiting for the user's test

Done after the user's "yes, the camera". Six buttons on the map, at the right edge, half-way up:

| Row | Buttons |
|---|---|
| Top | raise the camera · move forward · lower the camera |
| Bottom | move left · move back · move right |

- Hold a button to move, let go to stop. Each button is 44 × 44 px; the whole pad is 150 × 102 px.
- The buttons do exactly what the keys W A S D and Q/E already do (same speed, same lowest height above the
  street), and like the keys they end "follow vehicle".
- Shown only where a finger is a pointer (`any-pointer: coarse`): phones, tablets, and laptops with a touch
  screen. Hidden with a mouse only. Shown once the map is built.
- Rotating and zooming are unchanged (one finger rotates, two fingers zoom and pan, by three.js OrbitControls).
- Space or Enter on a focused button also moves while held.

Changed: new `src/lib/ui/CameraPad.svelte` and `src/lib/cameraPad.ts`; `src/lib/FreeCamera.svelte` (reads the
held buttons each frame), `src/App.svelte` (the pad in the map panel), `src/style.css` (block "Interface U4:
camera buttons"), `tests/interface-u4.spec.ts` (one new test, one new assertion). Nothing is committed.

Not included: a faster mode (Shift on the keyboard), and a touch text in the "Fri kamera" help, which still
describes the keyboard and is not shown in the drawer layout.

### Checks (step 3)

| Check | Result |
|---|---|
| `npm run check` | 0 errors, 0 warnings |
| `npm run build` | OK |
| Vitest | 640 of 641; the failure is `police.test.ts` ("outline belongs to the current artwork"), known from earlier phases, not touched here |
| Playwright `interface-u4` | 3 of 3: holding "forward", "raise", "lower" and "right" moves the camera the right way and it stands still after release; the pad is hidden with a mouse |
| Playwright `interface-u1`, `interface-u2`, `simulation`, `fullscreen-fps` | 8 of 8 |
| Other Playwright files | not run |
| Running app | the pad seen at phone size ([screenshot](evidence/21-camera-pad-phone.jpg)); the movement itself was confirmed by the Playwright test, because the browser pane was hidden and draws no frames then |

Not verified: a real finger on a real iPhone or iPad (the test holds the button with an emulated pointer),
Safari, two fingers at once (a button plus rotating the map), the pad together with the opened FPS details,
light theme.

## Step 2: layout (2026-11-18) — waiting for the user's test

Done after the user's "yes, the layout". Changed: `src/style.css` (one block, "Interface U4", added before the
fullscreen rules), `src/App.svelte` (the screen query, 1 line plus a comment), new test
`tests/interface-u4.spec.ts`. Nothing is committed.

| Screen | Before | After |
|---|---|---|
| Phone on its side 812 × 375 | desktop layout, side panel 250 px, map 509 × 568 (1.5 screens tall) | drawer layout, map 761 × 275; map + settings bar = 342 px of the 375 |
| iPad upright 820 × 1180 | desktop layout, side panel 250 px, map 517 × 777 | drawer layout, map 769 × 779 |
| Phone upright 375 × 812 | 11 of 12 controls under 44 px; lists 13–14 px text | all buttons, sliders, tabs and lists 44 px or more; lists 16 px; map 351 × 528 as before |
| iPad on its side 1180 × 820 | side panel 280 px, map 829 × 570 | unchanged |
| Desktop | | unchanged (no rule applies to a mouse on a screen wider than 900 px and taller than 500 px) |

What the rules do:

- **Drawer layout** when the screen is at most 900 px wide **or** at most 500 px tall (before: 760 px wide only).
  900 covers every iPad held upright (744–834 px); an iPad on its side (1024 px and up) keeps the side panel.
- **Map height** on a phone on its side: the screen height minus 100 px, at least 220 px. On a phone upright
  still 65 % of the screen, now counted on the height with the browser's bars showing (`svh`), so the map
  does not change size when the address bar slides away.
- **Finger size** only where the main pointer is a finger (`pointer: coarse`): sliders, tabs, header buttons,
  map toolbar buttons and lists 44 px; lists and date fields 16 px text. Switches keep their look (40 × 24);
  each sits in a label that is 44 px tall and is the finger target.

Left as it was: the view list in the map toolbar is cut off on a 375 px wide phone ("Innersta…") now that
its text is 16 px; the full names show when the list is opened. Not changed: margins for notch and home bar,
the 3D picture, the camera. See [remaining-gaps.md](remaining-gaps.md).

### Checks (step 2)

| Check | Result |
|---|---|
| `npm run check` | 0 errors, 0 warnings |
| `npm run build` | OK |
| Vitest | 640 of 641; the one failure is the source-checksum test reported as known (`police.test.ts`) in earlier phases, not touched here |
| Playwright `interface-u4` (new) | 2 of 2 |
| Playwright `interface-u1`, `interface-u2`, `simulation`, `fullscreen-fps` | 8 of 8 |
| Other Playwright files | not run |
| Running app, four sizes | checked in the browser pane, no console errors |

Not verified: a real iPhone or iPad, Safari, light theme. The finger-size rules were seen only in emulation
(the phone size in the pane and Playwright's touch mode); the iPad sizes in the pane ran with a mouse pointer,
so there the 44 px rules were not active. `src/App.svelte` also holds a change that is not part of this work
(`labels` starts as `false`); it was left as found.

Screenshots after: [phone upright](evidence/11-after-phone-portrait.jpg) (taken while the map was still building) ·
[drawer](evidence/12-after-phone-drawer.jpg) · [phone on its side](evidence/13-after-phone-landscape.jpg) ·
[iPad upright](evidence/14-after-ipad-portrait.jpg) · [iPad on its side](evidence/15-after-ipad-landscape.jpg).

# Step 1: measuring the state before any change

## Result in short

| Finding | Number | How serious |
|---|---|---|
| The scene is as heavy on a phone as on a desktop | 4.6 million triangles and 911 draw calls per frame at phone size (6.4 million / 1 140 at iPad landscape) | **Largest risk.** Nothing is reduced for a small screen. |
| Phone on its side gets the desktop layout | map 568 px tall on a 375 px tall screen (1.5 screens) | **Broken.** The map never fits, and it swallows the finger, so scrolling past it is hard. |
| The camera cannot be moved or raised by touch | 0 on-screen controls; only W A S D, Q, E, Shift | **Missing function** on every touch device. |
| iPad upright gets the desktop layout | side panel 250 px, map 517 px = 63 % of the width | Works, but cramped. |
| Controls are smaller than a finger | 11 of 12 on the phone, 23 of 24 on the other sizes are under 44 px | Mostly close (36–42 px). Sliders (20 px tall) and switches (24 px) are the real ones. |
| iPhone will zoom the page on the drop-down lists | 2–3 lists with 13–14 px text (iPhone zooms below 16 px) | Annoying, easy to fix. |
| Small text | 26 of 56 text elements on the phone are under 12 px | Readability. |
| Sharper image is cheap on this computer | double resolution: +0 % on the phone size, +55 % graphics time on iPad upright | Promising, but must be confirmed on a real device. |

What already works: no sideways scrolling at any size, the phone layout with the pull-up settings drawer
(375 × 698 px when open), and the page at iPad landscape (side panel 280 px, map 827 × 568 px).

## Words used

- **Triangle / draw call:** the city is drawn from triangles; a draw call is one order to the graphics chip.
  Both count the work per picture, and a phone's chip manages far less of it than a desktop card.
- **Pixel ratio:** how many screen dots are drawn per layout point. The app draws 1; a modern phone has 2–3,
  so the 3D picture is stretched and looks soft.
- **Graphics time (GPU time):** how long the graphics chip needs for one picture. 16.7 ms is the budget for
  60 pictures per second.

## Method

- Commit `fa0df58`, dev server (`u1-dev`, port 5371) against the local Go backend (`start-backend`, port 8095),
  start traffic, the view "Innerstaden".
- The desktop app's browser pane emulated 375 × 812 (phone upright), 812 × 375 (phone on its side),
  820 × 1180 (iPad upright) and 1180 × 820 (iPad landscape).
- Layout: element boxes and computed styles read from the page.
- Scene load and cost per frame: the existing measurement hook `__perfP1`
  (`src/lib/perf/perfProbe.ts`), 4–8 s per setting.

## Measurements

### Layout

| Screen | Layout used | Side panel | Map (layout px) | Map height / screen height | Page height |
|---|---|---|---|---|---|
| Phone upright 375 × 812 | phone, drawer | none | 349 × 526 | 0.65 | 1 685 |
| Phone on its side 812 × 375 | desktop | 250 | 509 × 568 | **1.51** | 1 388 |
| iPad upright 820 × 1180 | desktop | 250 | 517 × 777 | 0.66 | 1 596 |
| iPad landscape 1180 × 820 | desktop | 280 | 827 × 568 | 0.69 | 1 078 |

The switch to the phone layout happens at 760 px width only (`src/style.css`, `src/App.svelte`). The phone on
its side is 812 px wide and so counts as a desktop. The map has a minimum height (480–570 px) that does not
look at the screen's height.

The map canvas has `touch-action: none` at every size: a finger that lands on the map never scrolls the page.
On the phone the map is 65 % of the screen height, so little is left to scroll with.

### Controls (the same at every size)

| Control | Size (px) | Note |
|---|---|---|
| Sliders | full width × 20 | the hit area is 20 px tall |
| Switches | 40 × 24 | |
| Map toolbar buttons (FPS, fullscreen) | 36–40 × 36 | |
| Map view list | 106–204 × 36, text 13 px | iPhone zooms the page |
| Header buttons (theme, pause, reset) | 40–42 | |
| Tabs | 70–108 × 40 | |
| Other lists | height 41, text 14 px | iPhone zooms the page |
| "Inställningar" bar on the phone | ≥ 44 | the only one at finger size |

### Scene load and cost per frame (desktop graphics card, see limits)

| Screen | Triangles | Draw calls | Pixel ratio | Picture (megapixels) | Graphics time, median / p95 (ms) | Processor time, median (ms) |
|---|---|---|---|---|---|---|
| Phone upright | 4 620 898 | 911 | 1 | 0.18 | 5.1 / 7.1 | 4.2 |
| | | | 2 | 0.73 | 4.6 / 6.8 | 3.6 |
| | | | 3 | 1.65 | 5.6 / 8.5 | 5.6 |
| iPad upright | 4 620 898 | 911 | 1 | 0.40 | 6.0 / 11.7 | 6.3 |
| | | | 2 | 1.61 | 9.3 / 10.7 | 7.7 |
| iPad landscape | 6 408 405 | 1 140 | 1 | 0.47 | 6.7 / 11.5 | 8.4 |
| | | | 2 | 1.88 | 8.6 / 11.5 | 8.3 |
| Phone on its side | 5 197 181 | 984 | 1 | 0.29 | 6.8 / 10.3 | 5.8 |

p95 = the value that 95 % of the pictures stay under.

Reading: on this graphics card the time barely follows the number of screen dots (9 times more dots on the
phone size cost nothing measurable), so the work is in the triangles, not in the dots. That is why a sharper
picture looks affordable and why the triangle count is the thing to watch on a phone.

## Limits of this measurement

- **No real device.** Everything ran on a desktop with an NVIDIA RTX 5070 Ti. The graphics times say what the
  scene costs here, not on an iPhone or iPad. Nothing in this report predicts the frame rate on a phone.
- **Frame rate not measured.** The browser pane was hidden, so the browser slowed the frame loop. The cost per
  picture is unaffected; pictures per second are left out. The runs are short (10–317 pictures).
- **Only the phone size emulated a touch device** (Android Chrome, pixel ratio 2). The other three show the
  layout at that size with a desktop browser. Safari on iPhone/iPad was not used at all.
- **Touch gestures not tested.** The camera uses three.js OrbitControls, which by its documentation rotates
  with one finger and zooms/pans with two. The emulation sends mouse clicks, so this is unconfirmed here.
- One view ("Innerstaden"), daytime, start traffic. Night lighting and heavy traffic cost more
  (see the performance phases P1–P2).
- Notch and home-bar margins, the address bar that slides in and out on iPhone, and memory use were not looked at.

## Recommended order from here

1. **Layout** (small, safe): phone layout also for a phone on its side and iPad upright; map height that
   follows the screen; finger-sized sliders, switches and toolbar buttons; 16 px text in the lists; margins
   for notch and home bar.
2. **Camera by touch:** on-screen buttons for moving and for height.
3. **A real device before the performance work:** open the live address on the user's iPhone and iPad with
   the built-in FPS counter. That number decides how much step 4 has to do.
4. **Sharpness and performance:** pixel ratio by device, and a lighter scene for phones if step 3 shows it is needed.

## Checks

No app code changed, so type check, build, Vitest and Playwright were **not run** for this step. Files added:
this report, `remaining-gaps.md`, `evidence/` (numbers and four screenshots). Changed: `docs/board/board.json`
(story U4), `docs/claude-progress.md`. `npm run board:check`: OK. Nothing is committed.

## Screenshots

[Phone upright](evidence/01-phone-portrait-375x812.jpg) ·
[iPad upright](evidence/02-ipad-portrait-820x1180.jpg) ·
[iPad landscape](evidence/03-ipad-landscape-1180x820.jpg) ·
[phone on its side](evidence/04-phone-landscape-812x375.jpg) (the top of the page only; the map starts at the lower edge).
