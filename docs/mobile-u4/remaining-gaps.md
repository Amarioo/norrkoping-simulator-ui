# Interface U4 — remaining gaps after step 4b, memory second round (2026-11-20)

## Fixed in step 4b

- The city's geometry is indexed: about 90 MB instead of about 520 (1 130 before step 4a).
- On phones the page and the worker read the data in turn, and painted pictures are emptied after upload.
- Peak memory of the page process 2 977 → 922 MB (desktop browser at phone size).

## New in step 4b

- Whether the page now fits on the user's iPhone is unknown until the user tries it.
- The start is slower on phones (5 → 11 s in emulation on this computer; not measured on a phone).
- If it still crashes, what is left: the two data files are parsed in the page (about 60 MB of JSON, several
  times that while parsing; a binary format would avoid it), about 190 MB of script heap, textures at full
  size in graphics memory (signs are 1024 × 160 each), and the frame itself (4.6 million triangles).
- A few single pixels on triangle edges differ by up to 16 steps of 255 from before (flat shading).
- `terrain.ts` and `mapModel.ts` keep the parsed files in module variables (the terrain file's base64
  strings, about 30 MB, and the unmapped road list); not changed.

## Fixed in step 4a

- Memory while starting and standing still is about a third lower (3.5 → 2.2 GB peak, 2.7 → 1.6 GB still,
  measured in a desktop browser at phone size).

## New in step 4a

- Whether the page now fits on the user's iPhone is unknown until the user tries it.
- The city is still 26 million vertices (about 520 MB). Next steps if it still crashes: store shared corner
  points once (an index), then a simpler city for phones.
- About 270 textures, an estimated 275 MB in graphics memory, plus their source pictures in the page.
- On a phone a lost graphics context now reloads the page; untested on a device.
- One geometry worker on phones makes the start slower; not measured on a phone.
- Colours and surface directions of the city are stored in 256 steps: pictures differ from before by at
  most 3 steps of 255.

## Fixed in step 3

- The camera can be moved and raised or lowered by touch (six hold-to-move buttons on the map).

## New in step 3

- No fast mode on the pad (Shift on the keyboard).
- The "Fri kamera" help text still describes only the keyboard.
- The pad is confirmed with an emulated pointer only; a button held while another finger rotates the map is untested.
- The pad may overlap the FPS counter's opened details on a small map.

## Fixed in step 2

- Phone on its side and iPad upright now get the drawer layout; the map fits the screen.
- Sliders, tabs, buttons and lists are 44 px where the pointer is a finger; lists have 16 px text.

## New in step 2

- The view list in the map toolbar is cut off on a 375 px wide phone ("Innersta…").
- The finger-size rules are confirmed only in emulation, not on a device.
- Margins for notch and home bar (`viewport-fit=cover`) were left alone: they cannot be checked without an iPhone.

Everything below is still open unless listed as fixed above.

## Not measured

- Frame rate and memory on a real iPhone and iPad (needs the user's devices).
- Safari on iOS/iPadOS: zoom on the lists, the sliding address bar, notch and home-bar margins, fullscreen fallback.
- Touch gestures on the map (rotate, pinch, two-finger pan).
- Night lighting, heavy traffic and other views than "Innerstaden" at these sizes.
- Mobile data use: the stream was measured at 1.1 Mbit/s compressed in the publishing phase (about 0.5 GB per
  hour); whether it stops when the tab is hidden was not checked.
- Light theme and "reduce motion" at these sizes.

## Found, not fixed

- Phone on its side (812 × 375) gets the desktop layout; the map is 1.5 screens tall.
- No way to move the camera or change its height by touch.
- iPad upright: side panel 250 px next to a 517 px map.
- Sliders 20 px and switches 24 px tall; most other controls 36–42 px (44 px recommended).
- Lists with 13–14 px text (iPhone zooms the page below 16 px).
- 26 of 56 text elements under 12 px on the phone.
- The 3D picture is drawn at pixel ratio 1 on every device.
- The scene has the same 4.6–6.4 million triangles per frame whatever the screen.
