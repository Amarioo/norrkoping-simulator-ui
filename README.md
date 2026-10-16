# Norrköping Simulator

En lokal 3D-simulator för Norrköping med vägtrafik och en fiktiv flygpendel mellan Norrköpings flygplats (Kungsängen) och Bråvalla F13. Svelte 5, TypeScript, Threlte och Three.js visar kartan; Kotlin/Ktor beräknar trafiken och skickar kompletta lägesbilder med SSE.

## Starta från VS Code

Backend, i en egen terminal:

```powershell
cd C:\Users\amarg\dev\drone-swarm-backend
.\dev.ps1
```

Frontend, i en annan terminal:

```powershell
cd C:\Users\amarg\dev\drone-swarm-ui
npm run dev
```

Öppna http://127.0.0.1:5173. Ktor använder port 8080. Starta om båda processerna efter uppdateringen. Projektnamnen är nu `norrkoping-simulator-ui` och `norrkoping-simulator-backend`; de befintliga mappnamnen behålls för dina startkommandon och editorinställningar.

Kräver Node 22.12+ (testat med Node 24), npm 11.10.1+, JDK 21/25 och WebGL 2. Vid en ny installation: `npm ci`. Om global npm 11.1.0 ger `edgesOut`-fel, använd `npx --yes npm@11.10.1 ci`. Inga externa konton eller kartanrop behövs under körning.

## Använd simulatorn

- Välj antal små bilar, kombibilar och lastbilar. Tryck **Uppdatera trafiken**. Högst 1 000 fordon totalt, högst 150 lastbilar.
- Bilar följer ett riktat vägnät med verkliga OSM-noder, enkelriktningar och körbara anslutningar. Drottninggatan, gångvägar och privata/förbjudna vägar är undantagna. Lastbilar använder större vägklasser, inklusive E4 och Söderleden.
- Tidsfaktorn 1–20× påverkar både vägtrafik och flyg. Paus fryser rörelsen. Återställ börjar om med valda trafikinställningar.
- Flyget taxar ut, startar, stiger, flyger mellan flygplatserna, gör inflygning, landar och taxar till uppställning. Därefter återvänder det. F13-trafiken är fiktiv.
- Klicka i kartan: **WASD/piltangenter** flyttar kameran, **Q/E** sänker/höjer, **Shift** ökar hastigheten. Dra för att rotera, högerdra för att förflytta och scrolla för att zooma.
- **Utforska** hoppar till centrum, flygplatserna, Polishuset, Kungsgatan, Söderleden, Parken och andra stadsdelar. Kameran kan sedan flyttas fritt.
- Klicka på ett fordon eller välj det i listan och välj **Följ fordonet**. Flyget har en separat följknapp. Manuell kamerarörelse avbryter följningen.

## Kartan och modellerna

Snapshot från OpenStreetMap, geografisk ruta 58.555–58.650 N / 16.065–16.295 E, cirka 13,3 × 10,6 km. Den innehåller 12 499 byggnadsformer, 2 881 mark-/vattenytor, 84 539 linjesegment och 116 kartlagda signalpunkter. Vägnätet innehåller 38 294 noder och 73 315 riktade länkar. En scenenhet motsvarar 25 meter.

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
npm run map:import -- C:\path\norrkoping-region.json ..\drone-swarm-backend\src\main\resources\transport-network.json
```

Importören skriver kartan och transportnätet under `src/lib/data/`. Det andra argumentet kopierar samma transportnät till backend. Starta om Ktor efter byte av data. Fråga, tid, ursprung och gränser finns i JSON-filernas `meta`. Se DATA-LICENSE.md för ODbL och attribution.

## Verifiering

```powershell
npm run check
npm test
npm run build
# Med frontend och backend igång:
npm run test:e2e
```

E2E kontrollerar kommandon, två SSE-klienter, antal fordon, fri kamera, följning, paus, återanslutning, flygavstängning, återställning och mobilbredd. Backendtester kontrollerar bland annat rött ljus, vägbegränsningar och en full flygresa åt båda hållen.

För egna testportar: starta Ktor med `PORT=8081` och `ALLOWED_ORIGIN=http://127.0.0.1:5174`; starta Vite med `API_TARGET=http://127.0.0.1:8081` och `npm run dev -- --port 5174`; kör E2E med `E2E_BASE_URL=http://127.0.0.1:5174`.
