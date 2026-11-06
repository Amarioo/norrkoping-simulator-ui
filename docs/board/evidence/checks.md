# Projekttavla – kontroller (2026-11-06)

Körda på lokal `main` (= `origin/main` `bed5d5d`) plus tavlans ändringar, ingenting committat.

| Kontroll | Resultat |
|---|---|
| `npm run check` (typkontroll) | 0 fel, 0 varningar (1 211 filer) |
| `npm run build` | OK |
| `npm test` (Vitest, PowerShell med `C:\`-sökväg) | 573 / 574. Tavlans nya `scripts/board/board.test.mjs`: 29 / 29. Det enda felet är det kända `police.test.ts` (CRLF-radslut i `public/assets/polis-emblem.svg` i den här utcheckningen; samma fel finns i E2-rapporten, orört här) |
| `npm run test:e2e` (Playwright, dev-server `phase0-e2e` + backend `phase0-backend`) | 26 / 26 |
| `npm run board:check` | `board.json OK` |

## Tavlan testad i webbläsaren (`npm run board`, port 5330)

- Dra B2 från Nästa till Pågår: sparades i filen (`"status": "doing"`).
- Claude ändrar filen direkt (B2 till Test och en kommentar): syns på sidan inom 2 s.
- Kortets panel: ny deluppgift via Enter, kryssa av en deluppgift, kommentar från Claude visas.
- "Öppna rapporten": färdplanen öppnas vid "Spår B"; i E2-rapporten fungerar länken vidare till
  `data-provenance.md`.
- "+ Ny story" skapar U1 överst i Backlog med fokus på titeln; ändrad titel sparas.
- Epic-filter (E) och ljust/mörkt läge.
- Efter testet återställdes `board.json` till startinnehållet (byte-identisk kopia från före testet)
  och sidan följde med.

Krock (409), ogiltig tavla (400) och försök att läsa utanför `docs/` täcks av de automatiska
servertesterna i `board.test.mjs`.

Skärmbilder: `01-board-dark.jpg`, `02-epic-filter-and-card-light.jpg`, `03-report-viewer.jpg`
(den sista togs innan rubriken fick marginal mot fönstrets list; nu syns rubriken "Spår B" överst).
