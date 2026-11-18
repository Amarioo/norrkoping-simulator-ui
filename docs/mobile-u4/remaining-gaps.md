# Interface U4 — remaining gaps after step 3, camera buttons (2026-11-18)

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
