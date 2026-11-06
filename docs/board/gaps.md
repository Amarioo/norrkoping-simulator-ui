# Projekttavla – kända brister

| Brist | Följd | Möjlig åtgärd |
|---|---|---|
| Dra och släpp fungerar inte med finger på mobil/surfplatta (HTML5-dragning) | På pekskärm flyttar du kort med fältet **Status** i kortets panel i stället | Lägg till pekstöd om du vill använda tavlan på surfplatta |
| Servern lyssnar bara på 127.0.0.1 | Tavlan går inte att öppna från mobilen | Medvetet val; kan öppnas mot det lokala nätet om du vill, men då kan alla där ändra filen |
| Rapportvisningen är en enkel markdown-tolk | Rubriker, listor, tabeller, kod, länkar och bilder visas; ovanligare markdown (nästlade tabeller, HTML i markdown) visas som text | "Öppna i VS Code" visar alltid filen fullt ut |
| Länkar till mappar (t.ex. `evidence/`) i rapporterna | Ger "Hittades inte" | Lista mappens innehåll om det behövs |
| Äldre faser som progress-filen kallar "för granskning" ligger i Klart | Kan se ut som godkända | Varje sådant kort har en notering; flytta dem till Test om du vill granska dem |
| Inga epics kan skapas från sidan | Nya epics läggs till av Claude i `board.json` | Lägg till om behovet uppstår |
| Ingen historik per kort | Vem som flyttade vad syns bara i git | `git log -p docs/board/board.json` |
