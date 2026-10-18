# Norrköping Simulator

En lokal 3D-simulator för Norrköping med vägtrafik och en fiktiv flygpendel mellan Norrköpings flygplats (Kungsängen) och Bråvalla F13. Svelte 5, TypeScript, Threlte och Three.js visar kartan; Kotlin/Ktor beräknar trafiken och skickar kompletta lägesbilder med SSE.

## Starta från VS Code

Backend, i en egen terminal:

```powershell
cd C:\Users\amarg\dev\norrkoping-simulator-backend
.\dev.ps1
```

Frontend, i en annan terminal:

```powershell
cd C:\Users\amarg\dev\norrkoping-simulator-ui
npm run dev
```

Öppna http://127.0.0.1:5173. Ktor använder port 8080. Starta om båda processerna efter uppdateringen. Projektnamnen är nu `norrkoping-simulator-ui` och `norrkoping-simulator-backend`; Båda repomapparna heter nu `norrkoping-simulator-ui` respektive `norrkoping-simulator-backend`.

Kräver Node 22.12+ (testat med Node 24), npm 11.10.1+, JDK 21/25 och WebGL 2. Vid en ny installation: `npm ci`. Om global npm 11.1.0 ger `edgesOut`-fel, använd `npx --yes npm@11.10.1 ci`. Inga externa konton eller kartanrop behövs under körning.

## Använd simulatorn

- Välj antal små bilar, kombibilar och lastbilar. Tryck **Uppdatera trafiken**. Högst 1 000 fordon totalt, högst 150 lastbilar.
- Bilar följer ett riktat vägnät med verkliga OSM-noder, enkelriktningar och körbara anslutningar. Drottninggatan, gångvägar och privata/förbjudna vägar är undantagna. Lastbilar använder större vägklasser, inklusive E4 och Söderleden.
- Tidsfaktorn 1–20× påverkar både vägtrafik och flyg. Paus fryser rörelsen. Återställ börjar om med valda trafikinställningar.
- Flyget taxar ut, startar, stiger, flyger mellan flygplatserna, gör inflygning, landar och taxar till uppställning. Därefter återvänder det. F13-trafiken är fiktiv.
- Klicka i kartan: **WASD/piltangenter** flyttar kameran, **Q/E** sänker/höjer, **Shift** ökar hastigheten. Dra för att rotera, högerdra för att förflytta och scrolla för att zooma.
- **Utforska** hoppar till centrum, flygplatserna, Polishuset, Kungsgatan, Söderleden, Parken och andra stadsdelar. Kameran kan sedan flyttas fritt.
- Klicka på ett fordon eller välj det i listan och välj **Följ fordonet**. Flyget har en separat följknapp. Manuell kamerarörelse avbryter följningen.

## Kollektivtrafik och trafikflöde

- Välj 0–80 bussar, 0–40 spårvagnar och 0–12 tåg. Bussar ingår i gränsen på 1 000 vägfordon. Samtliga går att markera och följa.
- Gula/gröna femdelade spårvagnar följer kartlagda spår för linje 2 och 3, med ledade sektioner, takutrustning, strömavtagare och hållplatsuppehåll.
- Fyrdelade vita tåg med orange/röd dekor inspirerad av Östgötapendeln följer järnvägen västerut från centralstationen och återvänder via kartlagda spårförbindelser. Bussarna har vit kaross och orange/röd dekor, och delar bilarnas trafik- och kömodell.
- Underfarter behålls nu i vägimporten. Ståthögavägens järnvägspassage har sammanhängande väg och höjdseparerad järnväg. Kortare vägloopar kan inte längre skapa falska köer bakåt; korsningsreservationer löper ut och rörelsen återupptas efter grönt.
- Linjegeometri och hållplatslägen kommer från OSM, men bussrutter, avgångar, uppehåll och tågens vändslinga är simulerade. Detta är ingen verklig tidtabell. Samma spårrutt har avståndshållning; fullständig samordning mellan olika linjer, vägtrafik och järnvägssignaler ingår ännu inte.

Färgreferenser: [Norrköpings spårväg](https://norrkoping.se/boende-trafik-och-miljo/resa-och-parkera/sparvagen) och [Östgötapendeln, fordonsbilder](https://www.jarnvag.net/ostgotapendeln). Dekoren och 3D-modellerna är egna procedurmodeller, inga kopierade fototexturer.

## Kartan och modellerna

Snapshot från OpenStreetMap, geografisk ruta 58.555–58.650 N / 16.065–16.295 E, cirka 13,3 × 10,6 km. Den innehåller 12 499 byggnadsformer, 2 881 ursprungliga mark-/vattenytor (delas och sammanfogas vid terrängimport), 84 622 linjesegment och 116 kartlagda signalpunkter. Vägnätet innehåller 38 294 noder och 73 332 riktade länkar. En scenenhet motsvarar 25 meter på marken. Scenen är ett lokalt SWEREF 99 TM-system (EPSG:3006); se avsnittet Koordinatsystem.

Byggnadsformer, gator, grönområden, vatten, banor och taxibanor kommer från kartdata. Parken har plan och läktare. Polishuset på Stockholmsvägen har låga flyglar, gårdar, högdel och solpaneler baserade på referensen. Träden längs den utpekade delen av Kungsgatan är borttagna. Markfärger skiljer gräs, skog, åker, bostäder, verksamhetsmark och vatten.

Bilarna har kaross, glas, speglar, hjul och lyktor; lastbilen har hytt, lastskåp och flera axlar. Turbopropplanet har kropp, vingar, stjärt, motorer, roterande propellrar och infällbart landställ. Dimensionerna följer samma skala som kartan. Modellerna är procedurbyggda och byggnadsdetaljer/höjder är delvis uppskattade. Detta är en kartbaserad 3D-modell, inte fotogrammetri eller en exakt digital tvilling.

Trafiken har avståndshållning, signalstopp och förenklade korsningsreservationer. Signalernas platser är kartlagda men deras program är simulerade. Fullständiga svängförbud, körfältsbyten, terränghöjder, fordonsfysik och flygdynamik ingår inte. Kartdata kan sakna lokala trafikregler. Flyget följer geometriska banor och taxibanor, inte verkliga flygprocedurer.

## Arkitektur

`POST /api/simulator/*` → validerat kommando → låst skrivmodell → oföränderlig lägesbild → `StateFlow` → SSE-event `city` → instansierade 3D-fordon.

Frontend interpolerar positioner mellan lägesbilder. Ktor är auktoritativ för antal, rörelse, paus, flygfaser och trafiksignaler. SSE återansluter med senaste kompletta lägesbilden; ingen historisk replay. Tillståndet är lokalt i minnet. De äldre drönarfilerna och API-rutterna finns kvar för kompatibilitet men används inte av det nya gränssnittet.

## Importera kartdata igen

```powershell
npm run map:import
# Eller från ett sparat komplett Overpass-svar:
npm run map:import -- C:\path\norrkoping-region.json
# Ange också backendens resource-fil om den ska uppdateras:
npm run map:import -- C:\path\norrkoping-region.json ..\norrkoping-simulator-backend\src\main\resources\transport-network.json
```

Importören läser också `scripts/data/norrkoping-transit-source.json`, en OSM-snapshot med spårvägsrelationer och hållplatser.

Importören skriver kartan och transportnätet under `src/lib/data/`. Det andra argumentet kopierar samma transportnät till backend. Starta om Ktor efter byte av data. Fråga, tid, ursprung och gränser finns i JSON-filernas `meta`. Se DATA-LICENSE.md för ODbL och attribution.

## Verifiering

```powershell
npm run check
npm test
npm run build
# Med frontend och backend igång:
npm run test:e2e
```

E2E kontrollerar kommandon, två SSE-klienter, antal fordon, fri kamera, följning, paus, återanslutning, flygavstängning, återställning och mobilbredd. E2E kontrollerar även kollektivtrafikreglagen, SSE, ledade fordon och följning. Backendtester kontrollerar köstart vid grönt, underfartens anslutningar, tio minuters regionalt trafikflöde, hållplatsuppehåll/återstart och en full flygresa åt båda hållen.

För egna testportar: starta Ktor med `PORT=8081` och `ALLOWED_ORIGIN=http://127.0.0.1:5174`; starta Vite med `API_TARGET=http://127.0.0.1:8081` och `node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5174`; kör E2E med `E2E_BASE_URL=http://127.0.0.1:5174`.

## Detaljer från platsreferenserna

Pendeltåget har fyra vagnsdelar, avsmalnande vit förarhytt, stor vindruta och sammanhängande röd/orange dekor med vita bågar. M06-inspirerade spårvagnar har gul kaross, grönt tak/nederkant, mörkt fönsterband, ledövergångar och linjenummer 2/3.

88 spårvagnsplattformar och 9 järnvägsplattformar får kartlagda konturer, kantmarkeringar och skyltning. Väderskydd utelämnas där OSM uttryckligen anger shelter=no; saknad uppgift kompletteras med ett uppskattat skydd. detaljformen är modellerad efter Ljura-referensen, inte individuellt uppmätt vid varje hållplats. Inga liveavgångar visas.

Resecentrum har en särskild stationsmodell med fönsterbågar, skiffertak, mittpaviljong/klocka och kartlagda perrongtak. Flygplatsen har en blåglasad låg terminal, entrétak, driftstorn, parkeringsrader och markeringar på plattan. Bollspelaren har två fotbollsplaner från kartan, en mindre träningsplan passad mellan dem från bildreferensen, isbana, mål, stängsel, belysning och en läktare längs norra långsidan, mot Malmbergs/Linnégatan, med sittplatserna vända mot planen. Läktarens detaljmått och träningsplanen är uppskattade från referensen.

Polisemblemet är Polisens egen vektorgrafik, beskuren till vapnet och placerad på byggnaden. Källor finns i DATA-LICENSE.md.

Välj Resecentrum, Hållplats Ljura centrum, Bollspelaren, Flygplatsterminalen eller Polishusets emblem i kartans Utforska-lista. Byggnader och fordon är procedurmodeller i kartans skala; detaljerna är referensbaserade approximationer.

Platsunderlaget finns i `scripts/data/norrkoping-places-source.json`. Återskapa platsfilen med `node scripts/import-city-places.mjs`. `src/lib/data/training-pitch.json` innehåller den handjusterade träningsplanen. `scripts/preview-vehicles.html` visar fordonsmodellerna separat under Vite, med `?kind=tram` eller `?kind=train`.

## Promenader och broar

Promenadernas träd har 4,6–5,7 meter breda kronor, smala stammar och fri sikt under kronorna. Trädpositionerna kommer fortsatt från kartan; den kompletterande parkplanteringen och trädformerna är illustrativa. Träden instansieras, och broarnas statiska geometri slås samman per material.

Bergsbron har tre stenvalv, fogad sten, smidesräcken och dubbla lyktor. Laxholmsbron har ljusa räcken med kryss och cirklar. Saltängsbron och Hamnbron använder kartlagda brokonturer med stöd, kantbalkar och räcken; Saltängsbron har även flaggstänger och kontaktledningar. Spången och tre små gångbroar kring laxtrappan i Strömparken har trädetaljer. Gamlebro/Järnbron är också kompletterad. Brodetaljer, stödlägen och höjder är uppskattade efter fotoreferenser, inte konstruktionsritningar. Broar över vatten möter anslutande gator och gångvägar på samma nivå. Vattenytan har sänkts sex meter i modellens koordinatsystem; utskurna markytor, strandkanter och landfästen ersätter de tidigare upphöjda ramperna. Nivåerna är visuella approximationer i `src/lib/data/terrain-levels.json`. Importören synkroniserar väg- och spårtrafikens höjder med brobanorna; broar över land och järnvägens underfarter behåller sin höjdseparation. Starta om både UI och Ktor efter uppdateringen.

Utforska-listan har egna vyer för broarna samt Norra och Södra Promenaden i gatuperspektiv. Brokonturerna ligger i `scripts/data/norrkoping-bridges-source.json`, gånglinjerna i `scripts/data/norrkoping-bridge-paths-source.json`; kör `node scripts/import-city-bridges.mjs` för att återskapa `src/lib/data/city-bridges.json` utan nätåtkomst.

## Ingelstagatan, fasader och destinationsskyltar

Ingelstagatans bro vid polishuset har brodäck, räcken och landfästen. Gatan ansluter i marknivå och järnvägen går i en utskuren skärning. Importör och rendering använder samma höjdprofil i `src/lib/ingelstaTerrain.js`; profilen är uppskattad, inte inmätt terräng. Grand Hotel och Holmens kontorshus har egna referensbaserade fasader och återskapade ordskyltar. Välj de tre nya vyerna i Utforska-menyn.

Spårvagnarnas destinationsskyltar följer den aktiva sträckan i OSM-rutten: 2 Kvarnberget/Fridvalla och 3 Vidablick/Klockaretorpet. Backend skickar destination i SSE och byter den när nästa riktning börjar. Det är simulerad trafik, inte aktuella tidtabellsavgångar. Starta om Ktor när transportnätet uppdaterats.

## Koordinatsystem

Kanonisk horisontell referens är SWEREF 99 TM (EPSG:3006). Scenen är ett lokalt system med fast origo i
E 569 030, N 6 494 989:

    x = (E − 569030)  / (25 · 0.9996584126)   öster
    z = (6494989 − N) / (25 · 0.9996584126)   söder

0.9996584126 är SWEREF 99 TM:s skalfaktor i origo, så en enhet är 25 meter på marken (±2·10⁻⁵ över kartan).
Scenens axlar följer SWEREF-rutnätet; sann nord ligger 1,0135° väster om rutnätsnord (`terrain.trueNorth`).
RH2000-höjder är oförändrade. Gauss–Krüger-implementationen finns i `src/lib/geo/sweref99tm.js` (klient,
workers, importörer) och `Sweref99Tm.kt` (backend) och är verifierad mot Lantmäteriets publicerade punkter
(`scripts/geo/verify_projection.py`). Data migrerades 2026-10-18 från den tidigare ekvirektangulära ramen med
`scripts/geo/migrate-to-sweref.mjs`; se `docs/claude-progress.md`.

## Terräng och 3D-data

Se [ELEVATION.md](ELEVATION.md) för källjämförelse, gemensamt RH2000-kontrakt, import och återstående datakrav. Inga uppmätta höjdrutor eller LOD2-byggnader är ännu inlästa.
