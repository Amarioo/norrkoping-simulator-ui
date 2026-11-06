# Projekttavla – epics och stories som Kanban (2026-11-06)

En lokal tavla, ungefär som Jira, som visar vad vi håller på med. Spåren i [färdplanen](../roadmap.md)
är **epics**, faserna (E1, E2, P2c …) är **stories**. Du drar korten mellan kolumnerna och Claude
flyttar dem när arbetet går framåt. Båda läser och skriver samma fil.

## Starta

```bash
npm run board
```

Öppna sedan <http://127.0.0.1:5330/>. Annan port: `npm run board -- 5331`. Servern lyssnar bara
på den egna datorn (127.0.0.1) och påverkar inte simulatorn.

## Kolumner

| Kolumn | Betyder |
|---|---|
| Backlog | Planerat men inte prioriterat |
| Nästa | Det vi tar härnäst |
| Pågår | Claude jobbar med det |
| Test (du testar) | Claude är klar, rapporten är skriven, du testar lokalt |
| Klart | Du har godkänt och ändringen är committad och pushad |

## Vad du kan göra

- **Dra** ett kort till en annan kolumn eller till en annan plats i samma kolumn.
- **Klicka** på ett kort för att se och ändra titel, epic, status, storlek, beskrivning, deluppgifter
  (kryssa av) och kommentarer.
- **Kommentarer** är ett sätt att lämna besked till Claude. Säg "titta på tavlan" så läser jag dem.
- **Öppna rapporten** visar fasens README direkt på sidan, med fungerande länkar mellan rapporterna.
  "Öppna i VS Code" öppnar filen i editorn.
- **Filtrera** på en epic genom att klicka på den överst, eller sök på id eller text.
- **+ Ny story** lägger ett nytt kort (id U1, U2 …) överst i Backlog.

Tavlan hämtar filen varannan sekund. Ändrar Claude något syns det inom två sekunder. Om ni ändrar
samtidigt vinner den som sparade först, och den andra får beskedet "Tavlan ändrades samtidigt".

## Hur det fungerar

| Del | Fil |
|---|---|
| Data (sanningen, ligger i git) | `docs/board/board.json` |
| Gemensam logik: kontroll, flytt, filformat | `scripts/board/board-lib.mjs` |
| Server (sida, läs/skriv, visar `docs/` skrivskyddat) | `scripts/board/server-core.mjs`, `scripts/board/server.mjs` |
| Sidan | `scripts/board/index.html` (vanlig HTML/JS, inga nya beroenden) |
| Tester | `scripts/board/board.test.mjs` (körs med `npm test`) |

- **Filformat:** JSON med två blankstegs indrag och radbrytning sist. Servern skriver alltid exakt
  den formen, så git-diffarna blir små och läsbara. Ordningen i en kolumn är ordningen i `stories`.
  Filen är undantagen från Prettier (`.prettierignore`) så att formatet inte ändras av `npm run format`.
- **Kontroll:** `npm run board:check` kontrollerar filen (kända epics och kolumner, unika id:n, inga
  okända fält, datum som ÅÅÅÅ-MM-DD, rapportlänkar bara under `docs/`). Servern vägrar spara en
  ogiltig tavla.
- **Krockar:** varje svar har en version (hash av filens innehåll). Ett sparande som bygger på en
  gammal version nekas (HTTP 409) och sidan laddar om.
- **Fält per story:** `id`, `epic`, `title`, `status`, och frivilligt `size` (S, S/M, M, M/L, L),
  `date`, `summary`, `outcome`, `note`, `report`, `section` (text att hoppa till i rapporten),
  `tasks` (`text`, `done`) och `comments` (`author` du/claude, `date`, `text`).

## Startinnehåll och källor

Tavlan fylldes från [`docs/claude-progress.md`](../claude-progress.md) (rubrikerna och deras
statusrader) och [`docs/roadmap.md`](../roadmap.md) avsnitt 4–5. Inget är uppfunnet:

- **Klart (38):** varje avslutad fas i progress-filen, med datum och utfall som där. Faser som
  progress-filen fortfarande kallar "för granskning" (Steg 6, 6.1, Belysning fas 0, A1–A3, L2a,
  L2bc) ligger i Klart eftersom de finns i `main` och senare faser byggde vidare på dem; de har en
  **notering** som säger att inget uttryckligt godkännande finns noterat.
- **Nästa (1):** B2, enligt färdplanens rekommenderade ordning (efter E2 kommer B2).
- **Backlog (9):** resten av färdplanen (D2, F2, C1, C2, B1 del 2, P2d, P2e, P3) och den valfria
  kommunbegäran om belysningsregistret. Deluppgifterna är färdplanens egna punkter.
- **Epics (9):** de sju spåren L, F, B, D, E, C, P, plus **S** (simulatorkoppling och trafik: SSE,
  ström, bussarnas vägval) och **G** (grundstegen 1–5.1) för arbete som inte hör till ett spår.
  S och G är min indelning, inte färdplanens.

## Verifiering

Se [evidence/checks.md](evidence/checks.md). Skärmbilder:
[tavlan, mörkt läge](evidence/01-board-dark.jpg),
[filter på epic E och ett öppet kort, ljust läge](evidence/02-epic-filter-and-card-light.jpg),
[rapportvisning](evidence/03-report-viewer.jpg).

Kända brister: [gaps.md](gaps.md).
