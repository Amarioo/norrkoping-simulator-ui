# Interface Phase U2 — dark theme as the default, light as the choice (2026-11-13)

Worked directly on local `main` (= `origin/main` `4395127`, which holds U1). Backend unchanged.
**Nothing of U2 is committed.** For the user's test. Board: U2 in *Test*.

Asked for by the user on 2026-11-13, together with the commit of U1: "implement dark mode and make
it the default; light mode is the feature".

## Verdict

The page now opens dark. A button in the header (a sun) switches to the light look of U1, and the
choice is remembered in the browser; a moon switches back. Tabs, sliders, charts, toasts, the map's
tools and the drawer on a phone all follow the theme. The 3D map is untouched and has the same size
in both themes. Recommendation: **approve the look; commit after the measurement** that is still
waiting for a quiet machine (the same one that was open for U1).

## Decisions needed

1. **Dark for everyone who has not chosen**, also when the computer itself is set to light.
   *Recommended:* keep, it is what you asked for. The alternative is to follow the computer's
   setting until the visitor chooses.
2. **The toggle is one button in the header.** *Recommended:* keep. A three-way choice (dark, light,
   follow the computer) is a small step later if wanted.

## Risks / not verified

- **Frame times are still not measured**, for U1 or U2. One round was measured for U1 while the
  machine was about 20 % busy and is not usable: it showed the new page 1.2 to 5.7 ms slower per
  frame, but also slower in the 3D drawing itself, which U1 does not touch, so the round was
  disturbed. The full five rounds are queued and start when the machine is quiet.
- **No clean full run of all tests yet** (queued behind the measurement). The new and the touched
  tests pass on their own.
- **Contrast is checked by a test for four text pairs** (body text, muted notes, the main button,
  an unselected tab) in both themes, at least 4.5:1. Other pairs were looked at, not computed.
- **Only looked at in the test browser** (Edge) and the app's browser pane.
- A toast in the dark theme is black (the toast library's own dark surface), a little darker than
  the cards.

## What changed

| Part | Where | What |
|---|---|---|
| Palettes | [`src/style.css`](../../src/style.css) | All colours of the page are variables. `:root` holds the dark palette (default); `:root[data-theme='light']` holds U1's light one. The fps counter keeps its own dark look. No size rule changed. |
| Start | [`src/lib/ui/themeName.ts`](../../src/lib/ui/themeName.ts), [`themeDom.ts`](../../src/lib/ui/themeDom.ts), [`src/main.ts`](../../src/main.ts) | The theme is set before the app is loaded: `?theme=light|dark` in the address (not remembered), else the remembered choice (`localStorage` key `norrkoping.theme`), else dark. Also sets the browser's own bar colour (`theme-color`). |
| Toggle | [`src/lib/ui/theme.svelte.ts`](../../src/lib/ui/theme.svelte.ts), [`src/App.svelte`](../../src/App.svelte) | A button in the header, named "Byt till ljust läge" / "Byt till mörkt läge" for screen readers. The toasts get the same theme. |
| Tests | `tests/interface-u2.spec.ts`, `src/lib/ui/themeName.test.ts` (new) | Dark by default and nothing stored; the button switches, the map keeps its size, the choice survives a reload; the address wins and is not stored; unknown values mean dark; contrast in both themes. |

No dataset, no library and no existing test changed.

## Measured

- Canvas at 1440 × 1040: 1102 × 684 in the dark and in the light theme (`evidence/themes.json`),
  the same as before U1.
- Code size: main file 1 119 → 1 120 kB (gzip 306.3 → 306.6 kB); stylesheet 15.5 → 16.8 kB.
- Frame times: not measured (see Risks).

## Checks

| Check | Result |
|---|---|
| `npm run check` | 0 errors, 0 warnings |
| `npm run build` | OK; rebuilt twice, byte-identical |
| Vitest, `src/lib/ui` | 9/9 (`themeName` 5, `trafficStats` 4) |
| Playwright, `interface-u2.spec.ts` | 2/2 |
| Playwright, `interface-u1.spec.ts` after the change | 2/2 |
| In the running app | Both themes at 1440 × 1040 and at phone width, with the drawer and a toast: `evidence/`. No console errors. |
| Not run yet | The whole Vitest and Playwright suites and the paired frame-time measurement, queued for a quiet machine. |

## Evidence

In [`evidence/`](evidence/), for `dark` and `light`: `*-desktop.png`, `*-desktop-toast.png`,
`*-tid-och-ljus.png`, `*-mobile.png`, `*-mobile-drawer.png`, and `themes.json`. Made with
`scripts/interface-u2/shots.mjs`.

## Remaining gaps

- No "follow the computer's setting" choice.
- The 3D map does not change with the theme (its day and night are set by the time of day, under
  "Tid och ljus").
- The SSE debug panel and the fps counter keep their own dark look in both themes.
- The project board (`npm run board`) is a separate page and has its own look.

## Files

- New: `src/lib/ui/{themeName,themeDom}.ts`, `src/lib/ui/theme.svelte.ts`,
  `src/lib/ui/themeName.test.ts`, `tests/interface-u2.spec.ts`, `scripts/interface-u2/shots.mjs`,
  `docs/interface-u2/`.
- Changed: `src/style.css`, `src/App.svelte`, `src/main.ts`, `docs/board/board.json`,
  `docs/claude-progress.md`.
