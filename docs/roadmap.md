# Färdplan: Norrköping by night

Checklista för visionen. Bocka av `[x]` när en etapp är godkänd. Varje etapp får som tidigare
`docs/<etapp>/README.md` och en rad överst i `docs/claude-progress.md`, men med den lättare
granskningen nedan (avsnitt 3).

Skapad 2026-10-24, efter Lighting Phase A3 (commit `53468b0`).

---

## 1. Varför vi byter arbetssätt

Hittills har varje etapp (pilot, A1, A2, A3) ritat in en korridor för hand, gata för gata. Det
blir rätt men går långsamt, och luckor som Norrtull faller mellan stolarna. Idag finns
**273 lyktor**; hela staden behöver grovt räknat **17 000–29 000** (se 2.4). I samma takt tar det
hundratals etapper.

**Nytt arbetssätt:** en enda regelbaserad generator för hela staden, som bestämmer *för varje
gata* om den är upplyst och var lyktorna står, utifrån källorna i 2.1 i prioritetsordning. Vi
granskar resultatet på en **belysningskarta** (2D-karta över hela staden, färgad efter "upplyst /
mörk / varför") innan något ritas i 3D. Inga handritade korridorer längre.

## 2. Underlag: vad vet vi om var det är upplyst?

### 2.1 Källor, i prioritetsordning (högre vinner)

| # | Källa | Täckning | Status |
|---|---|---|---|
| 1 | Kommunens register över belysningspunkter (positioner, typ, höjd) | Hela staden, exakt | **Finns inte öppet.** Begäran är färdigskriven i `docs/step62/data-sources.md`, ej skickad. Skulle ersätta uppskattningar senare, utan att arbetssättet ändras. |
| 2 | OSM `highway=street_lamp` (kartlagda lyktor) | 25 st i hela kartan | Används redan. |
| 3 | OSM `lit=yes` / `lit=no` på vägar | ca 15 % av väg- och gångnätet (se 2.2) | Används redan, men räcker inte ensam. |
| 4 | **Kommunens Riktlinje för belysning (2023)** som regel för otaggade vägar | Hela staden | Ny. Se 2.3. Resultatet märks som *uppskattning enligt regel*. |
| 5 | Satellitbild av nattljus, för **kontroll** (inte placering) | Hela staden, ca 240 × 460 m rutor | Ny. NASA Black Marble VNP46A4 (årsmosaik, fri användning). Visar om en stadsdel lyser i verkligheten men vi har den mörk, eller tvärtom. Skarpare alternativ: SDGSAT-1 (10 m), gratis efter registrering, villkor ej kontrollerade. |

Satellitbilder kan alltså ge den "övergripande bilden" som en **kontroll per stadsdel**, men de är för
grova för att visa enskilda gator. Det som faktiskt avgör gata för gata är 3 + 4.

### 2.2 Hur mycket säger OSM idag? (mätt 2026-10-24)

Andel av längden i kartan som har `lit`-tagg, från den låsta ögonblicksbilden 2026-10-23
(`work/step62/osm-research.json`) mot vägarna i `src/lib/data/norrkoping-map.json`:

| Vägklass | Längd i kartan | `lit=yes` | `lit=no` | Ingen tagg |
|---|---:|---:|---:|---:|
| Bostadsgata (residential) | 245 km | 31 % | 1 % | 68 % |
| Huvudgata (secondary) | 63 km | 55 % | 0 % | 45 % |
| Lokalgata (tertiary) | 62 km | 23 % | 0 % | 77 % |
| Infart/led (trunk) | 19 km | 82 % | 0 % | 18 % |
| Motorväg (E4) | 33 km | 39 % | 46 % | 15 % |
| Gång-/cykelväg (footway, cycleway, path) | 529 km | 12–14 % | 2–3 % | ca 85 % |
| Servicevägar, oklassade, traktorvägar | 575 km | 1–4 % | 0 % | 96–99 % |
| **Totalt** | **ca 1 800 km** | **14 %** | **2 %** | **84 %** |

Slutsats: OSM ensam lämnar större delen av staden mörk. Därför behövs regeln i 2.3.

### 2.3 Regeln (förslag `lighting-city-v1`)

Bygger på kommunens [Riktlinje för belysning, 2023-06-07](https://tekniskhandbok.norrkoping.se/download/18.50e8c760188b9ef82db411/1686808653219/Riktlinje%20f%C3%B6r%20belysning%20230608.pdf),
avsnitt 2.4.1 (s. 25–26) och 2.5 (s. 33–39). Kort sammanfattat säger riktlinjen: gatubelysning
främst inom tätbebyggt område; vägar utanför behöver i regel ingen; cirkulationsplatser,
övergångsställen och signalreglerade korsningar alltid belysta; stråk genom park kan lämnas
obelysta; i stora naturområden utan bebyggelse är belysning i grunden onödig; gatubelysning högst
8 m i centralorten, parklyktor högst 4,5 m, separat gång-/cykelbelysning 4–5 m; 3000 K, 4000 K vid
korsningar; nattsänkning 22–05 möjlig.

Förslag till regel för en väg **utan** `lit`-tagg:

| Var | Vägtyp | Resultat |
|---|---|---|
| Inom tätort | Bil- och bussgator (residential … trunk, living_street, pedestrian) | Upplyst (uppskattning) |
| Inom tätort | Gång-/cykelväg längs gata eller i bostadsområde | Upplyst (uppskattning) |
| Inom tätort | Stigar i park/skog, `track`, uppfarter, parkeringsgångar | Mörk |
| Utanför tätort | Alla | Mörk, utom rondeller, signalkorsningar och övergångsställen (± ca 50 m) |
| Överallt | Kort otaggad bit (< ca 60 m) mellan två upplysta grannar på samma gata | Upplyst (lucka fylls, t.ex. **Norrtull**) |
| Överallt | `lit=no` | Alltid mörk (taggen vinner) |

Tätortsgräns: SCB:s statistiska tätorter (GeoPackage, fri nedladdning; licensen ska kontrolleras
och dokumenteras). Reserv om licensen inte passar: närhet till byggnader + OSM `landuse`.

Lyktornas position, avstånd (ca 30–40 m gata, 25–30 m gång/cykel), höjd och sida är
**uppskattningar** och märks så, precis som i A1–A3. Inga kommunala ID:n, ingen påhittad fotometri.

### 2.4 Hur många lyktor? (grov uppskattning)

Räknat på kartans vägar, "inom tätort" approximerat som "inom ca 100 m från en byggnad", och
antagna avstånd 30–40 m:

| Del | Längd | Lyktor (grovt) |
|---|---:|---:|
| Vägar med `lit=yes` | 246 km | ca 7 200 |
| Otaggade bilgator inom tätort (regel) | 358 km | ca 9 800 |
| Otaggade gång-/cykelvägar inom tätort (regel) | 352 km | ca 11 800 |
| **Summa** | | **ca 17 000 (bara gator) – 29 000 (med gång/cykel)** |

Siffran är en storleksordning för att dimensionera renderaren, inte ett facit.

## 3. Lättare granskning per etapp

För att det ska gå snabbare föreslås att varje stadsbelysningsetapp granskas med:

1. Belysningskartan (2D, hela staden) med statistik per stadsdel och färg per orsak.
2. Jämförelse mot satellitens nattljus per ruta (lista över största avvikelser).
3. 6–8 fasta 3D-vyer (dag + natt) och en prestandamätning.
4. Tester: `npm run check`, `npm run build`, `npm test`, `npm run test:e2e`.

I stället för per-gata-tabeller, sömanalyser och belysningsprofiler för varje korridor. Pilot och
A1–A3 behålls exakt som de är (deras lyktor vinner där de finns; regeln lägger inget inom deras
zoner).

---

## 4. Etapper

Storlek: **S** = en session, **M** = 2–3 sessioner, **L** = fler. Väntan på data räknas inte.

### Spår L: hela staden upplyst

- [x] **L0 Belysningskarta (ingen 3D-ändring)** — M — *genomförd och godkänd 2026-10-24:
  [docs/lighting-city-l0/README.md](lighting-city-l0/README.md). Beslut i §6 tagna enligt
  rekommendation. Resultat: 802 av 1 623 km upplyst, ca 25 000 preliminära lyktor, Norrtull tänd.*
  - Ny låst OSM-ögonblicksbild för hela kartan: `lit`, `street_lamp`, `traffic_signals`,
    övergångsställen, rondeller.
  - Tätortsgräns (SCB eller reserv) med källa och licens.
  - Generatorn `lighting-city-v1` enligt 2.3: per väg "upplyst/mörk + orsak", sedan lyktpositioner.
  - Satellitkontroll (Black Marble) per ruta.
  - Leverans: interaktiv 2D-karta + statistik. **Här godkänner du regeln för hela staden på en gång.**
- [ ] **L1 Skalbar rendering** — M — *genomförd 2026-10-24, väntar på granskning:
  [docs/lighting-city-l1/README.md](lighting-city-l1/README.md). 25 314 lyktor utan mätbar bildtid;
  minnet (+25 MB) klarar inte målet, åtgärdas med kompakt dataformat i L2.*
  - Renderaren klarar idag max 16 lyktor per 25 m-ruta och ritar varje stolpe. Med ca 30 000
    lyktor behövs: regel för överfulla rutor i korsningar (aldrig tyst bortfall), stolpar bara nära
    kameran, långt bort bara ljuspunkter/glöd.
  - Testas med den riktiga L0-mängden, mot prestandagränserna i `docs/step62/rollout-plan.md`.
- [ ] **L2a Gator i hela tätorten** — M (inkl. Norrtull och resten av innerstaden)
- [ ] **L2b Gång- och cykelvägar, torg och parker** — S/M
- [ ] **L2c Leder utanför tätort**: E4-trafikplatser, rondeller, signalkorsningar — S

### Spår F: fordon (stor effekt på natten, återanvänder L1)

- [ ] **F1 Strålkastare och baklyktor på bilar, bussar, lastbilar** — M
  - Lyktglas som lyser + en ljuskägla på vägen framför. Riktiga ljuskällor bara för de närmaste
    fordonen, av prestandaskäl.
- [ ] **F2 Spårvagnar och tåg** — S

### Spår B: landmärken

- [ ] **B1 Rådhuset och Gull-Olle** — L
  - Först geometrin (tornet 68 m, förgylld skulptur 4,5 m enligt kommunen), dagsljus. Sedan
    fasadbelysning, märkt som uppskattning om ingen dokumentation finns.
- [ ] **B2 Kyrkornas fasadbelysning** — M
  - En kyrka i taget (t.ex. Hedvig, Olai, Matteus, S:t Johannes). Bekräfta att kyrkan faktiskt är
    fasadbelyst innan vi tänder den.

### Spår D: verksamheter

- [ ] **D1 Polisens skyltar** vid polishuset (Stinsen 1, flytt 2026-01-26) — S
  - Befintlig `public/assets/polisen.svg`; licensvillkor i `DATA-LICENSE.md`.
- [ ] **D2 Bensinstationer** — M
  - 32 OSM-objekt (`docs/step62/fuel-stations.md`). Tak, pumpar, belysning under taket, generiska
    skyltar (operatörernas logotyper är inte licensierade).

### Spår E: flygplatsen (ESSP Kungsängen)

- [ ] **E1 Banljus** — M
  - Bana 09/27: kantljus, tröskel-/slutljus, inflygningsljus, PAPI enligt AIP
    (`docs/step62/airport-lighting-plan.md`). Bana 11/29 obelyst. Egen strömbrytare, oberoende av stadens.
- [ ] **E2 Flygplansljus** — S/M
  - Positionsljus röd/grön/vit, anti-kollisionsljus, strobe, landningsljus (EASA SERA/CS-25-konvention;
    exakt blinkmönster per flygplanstyp är okänt och märks så).

### Spår C: Vrinneviskogen

- [ ] **C1 Vegetation** — L
  - Trädhöjd från Skogsstyrelsen/Lantmäteriet laserdata (CC0), en 250 m-ruta först.
  - OBS: kartans södra gräns skär av reservatet; kan kräva att kartan utökas söderut.
- [ ] **C2 Elljusspåret** (ca 2,4–2,5 km) — M
  - Kräver C1. Ca 80–120 uppskattade stolpar om inget register finns. Släckt sent på natten.

## 5. Rekommenderad ordning

**L0 → L1 → L2a → L2b → F1 → L2c → B1 → D1 → E1 → E2 → B2 → D2 → F2 → C1 → C2**

Motivering: L0–L2 ger störst synlig skillnad och tar bort gata-för-gata-arbetet. F1 bygger på
samma teknik som L1. Polis och banljus är små och avgränsade. Vrinneviskogen sist, eftersom den
kräver ny data och troligen en större karta.

Parallellt (valfritt, din sak): skicka kommunbegäran om belysningsregistret
(`docs/step62/data-sources.md`, "Acquisition requests"). Kommer den, byts uppskattningar ut mot
riktiga lyktor utan att etapperna ändras.

## 6. Beslut

Beslutade 2026-10-24 (användaren valde rekommendationerna):

| Beslut | Rekommendation |
|---|---|
| Otaggade gator inom tätort tänds enligt kommunens riktlinje? | Ja |
| Gång-/cykelvägar: tänd längs gata/i bostadsområde, mörk i park/skog utan tagg? | Ja |
| Fyll korta luckor mellan upplysta grannar (tänder Norrtull, ändrar A2-beslutet)? | Ja |
| Lättare granskning enligt avsnitt 3? | Ja |
| Tätortsgräns från SCB (licens kontrolleras) eller närhet till byggnader? | SCB, med reserv |
