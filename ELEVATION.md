# Gemensamt höjdsystem – 2026-10-17

## Koordinatsystem (2026-10-18)

Horisontellt: SWEREF 99 TM (EPSG:3006), lokal scen med origo E 569 030, N 6 494 989 och
skalfaktor 0.9996584126 (en enhet = 25 m på marken). Terrängdataset version 2; version 1 avvisas.
Höjdrastret samplas nu direkt i SWEREF 99 TM från 1 m-leveranserna, utan omväg via WGS84.
Se README (Koordinatsystem) och `docs/claude-progress.md`.

## Riktade geometrikorrigeringar (steg 5.1, 2026-10-19)

Rapport: `docs/claude-progress.md` och `docs/step51/refinement-report.md`.

- **Urval efter evidens** (`scripts/geo/refinement_targets.py` → `scripts/data/geometry-refinement-targets.json`):
  varje vridet tvärsnitt, lutningsfel, del under terrängen och spårlutningstopp prövas mot den ursprungliga
  1 m-DTM:en (och LiDAR för spåret). Endast vertikala fel som vår egen geometri skapar korrigeras.
  Horisontella fel (OSM-mittlinjen bredvid körbanan, t.ex. innerkurvan i en hårnål, eller en bredd som täcker
  vägren/mur) och uppmätt relief rapporteras men ändras inte.
- **Riktade brytlinjelappar** (`scripts/geo/road_patches.py`): prioritet A (fordonsrelevant eller tydligt
  synligt: spårtoppar, delar under terrängen, lutningsfel > 1,5 × gränsen, vridningar där nätet lägger till
  > 0,5 m) lappas; övriga (B) rapporteras. Grupper slås ihop när deras blad delar kant; konturen glest
  (10 m, ingen mittlinje). Terrängdetaljpunkter läggs bara där lappen själv gjort terrängen sämre än RTIN.
- **Korsningsfläktar** med en linjär och en draperad kant: planet plus terrängens avvikelse från sitt
  hörnplan, viktat 0 → 1 mot den draperade kanten; exakt lika båda remsorna (`cityMesh.ts fanWedge`).
- **Brofästets glipa för spår**: djupgräns 0,3 m för räls/spårväg (vägar 1 m); kort dipp vid däckänden på
  långa spåranslutningar överbryggas (`prepare-bridge-profiles.py` 1c, 2b).
- Spårlutningen mäts nu var 1 m (tidigare 5 m missade den brantaste kordan).
- **Kostnadsoptimering (steg 5.1, 2026-10-20)**: lappens egna asfalttrianglar ritas som vägyta
  (`classesBase64`/`members`; vägremsan för en lappmedlem ritas inte, kantstenen bara som sina synliga
  marginaler), Steinerpunkter från den konforma trianguleringen tas bort där det kan göras utan T-korsningar
  eller trianglar smalare än 2 cm (`scripts/geo/cdt.py`), lappade vägar fasas in i RTIN över 8 m vid
  gruppgränsen, och vägar utanför gruppen behåller RTIN under sig (spökkonturer) men minst 0,5 m från
  lappens asfalt (annars vertikala mikroväggar upp till 2,5 m). +1,8 % trianglar mot steg 5 (steg 5.1: +3,6 %).

## Vägyta, kvarhållna brodäck och spårlutning (steg 5, 2026-10-19)

Rapport: `docs/claude-progress.md` (steg 5).

- **Kvarhållna brodäck i DTM** (`scripts/geo/retained_decks.py`, `scripts/geo/dtm_corrections.py`,
  `scripts/data/dtm-retained-decks.json`): där Lantmäteriets klassning lagt ett brodäck som mark (LiDAR
  klass 2, ingen klass 17) tas däcket bort så som DTM gör vid andra broar: platå-pixlarna ersätts av marken
  bortom väggarna, linjärt tvärs bron (öppen undergång). Två broar: E4 över Järngatan (E 567 340
  N 6 498 034) och en gångbro vid E 571 216 N 6 491 462. Leveranserna är oförändrade; 5 m-rutnätet
  omsamplas där korrigerade pixlar bidrar och får en ny rutnätsrevision.
- **Ytnätets felklasser** hashas mot kartan (tidigare fast cachenamn: 112 spårsegment som inte längre var
  påhittade broar saknade spårkorridorklass). Ny klass **spårbädd** (±2,5 m kring järnväg på mark,
  tolerans 0,25 m).
- **Brofästets glipa** (`prepare-bridge-profiles.py` 1c): en nod på mark högst 25 m från ett brodäck vars
  mark ligger ≥ 1 m under både däcket och gatan bortom (DTM:s borttagna brospringa) får övre höljets nivå
  som profilpunkt. Två noder i hela kartan: Saltängsbrons södra fäste vid Hamngatan × Drottninggatan.
- **Korsningsfläktar** möter remsorna de förbinder: hörn från remsornas egen yta, nod på nodens nivå;
  mellan två linjära delar ett plan, annars draperat med interpolerade förskjutningar
  (`cityMesh.ts fanWedge`). Tidigare plana fläktar på nodnivån gav steg upp till 1,7 m.
- **Vägkanter som brytlinjer (prototyp)** (`scripts/geo/road_patches.py`, `terrain.json mesh.patches`,
  `surfaceMesh.ts`, `TerrainService.kt`): i fyra rutor trianguleras de RTIN-blad som asfalten berör om så
  att asfaltens kontur är nätkanter. Asfalten får den uppmätta vägytan (robust lokalt plan av 1 m-DTM),
  terrängens noder behåller sina höjder, inget utanför de berörda bladen ändras, spårvägskorridorer är plana
  tvärs spårvidden, och markbundna linjära vägdelar (fäste, anslutningar) ingår med sin profil och
  draperas därefter på ytan (`patches.integrated`, samma regel i klient och backend).

## Spår, fordon och profilregler v5 (geometripass, 2026-10-18 kväll)

Rapport: `docs/claude-progress.md` (Batch A–D).

- **Ett spår för räls och fordon** (`src/lib/trackProfile.ts`, speglad i `RailTraffic.kt`): linjepunkter
  är spårets noder med nodens egen referensnivå (ingen inbakad +0.018), så fordon får samma däck, spann
  och anslutningar som den ritade rälsen. Rälsöverkant över körytan: 0.18 m (ballast), 0 m
  (inbäddad spårvägsräls). Spårvidd 1 435 mm. Varje vagnsdel vilar på två boggier och lutar (pitch).
- **Inga påhittade järnvägsbroar**: räls/spårväg som inte är bro i OSM har inga ramplyft från den platta
  scenen (`scripts/geo/rail-legacy-ramps.mjs`); undergångar bärs av spann.
- **Spann** följer sammanhängande linjer över OSM-vägskarvar ("strokes"), kanter ("rims") letas inåt på
  jämn lutning, vägar som ansluter inne i ett spann möter spannets nivå, och en nod har en nivå.
- **Anslutningar till broar** följer terrängen, fästs vid däckshöjden och tar övre höljet (inga puckel
  av den borttagna bron i DTM).
- **Uppmätta brodäck**: väg- och gångbrodäck tar LiDAR klass 17 där den finns; spår-/spårvägsbroar
  ansluts till spåret på banvallen (klass 17 domineras där av räcken och tråg).
- Byggnaders gesims följer takkanten (draperades tidigare på terrängen).

## Vatten, broprofiler och spann (steg 3.5, 2026-10-18)

Rapport: `docs/claude-progress.md` (steg 3.5).

* **Vatten** draperas inte längre på terrängen. Varje vattenyta är plan på sin sträckas nivå
  (`src/lib/data/water-reaches.json`, `scripts/prepare-water-reaches.py` + `.mjs`). Sträckornas utbredning
  kommer från Lantmäteriets hydroplanade 1 m-DTM (plana vattenytor med trappsteg vid dammar och fall),
  nivån från LiDAR klass 9 (flygning 2020, median). Havet och strömmen nedanför sista fallet ritas på
  SMHI:s medelvattenstånd 2021–2025, +0,14 m RH2000 (skanningsdagens nivå sparas). Motala ström har
  flera nivåer: ca 22,0 / 19,1 / 18,7 / 15,7 / 12,1 / 3,9 m och havsnivå. Smala, sluttande bäckar utan
  plan DTM-yta följer fortfarande terrängen och är märkta `unmeasured`/`draped`; torra slänter inom
  OSM-polygoner ritas som mark. Strandkanter får lodräta kaj-/slänt-ytor, fall får fallytor.
* **Broprofiler (regler v4)**: brobanornas ändar ligger på högsta renderade mark inom 10 m utåt, utan
  den platta förlagans lager-lyft; banan lyfts vid behov för att inte ligga under marken, under mätt
  vatten (+0,5 m) eller för nära korsande vägar (generiska broar). Linjär profil endast mellan två
  profilerade ändar; tillfarter följer terrängen med avsmalnande offset. Fortfarande uppskattningar
  (LiDAR-brobanor: steg 4), men mot LiDAR klass 17 sjunker RMSE för de detaljerade broarna till
  0,2–0,3 m (Gamlebro 0,93 m).
* **Spann**: där en marknivåväg korsar en tunnel/undergång, en kulvert eller ett DTM-dike med
  bortfiltrerad bro (≥ 2 m djupt, ≤ 30 m brett, väggar ≥ 20 %) ersätts profilen av en linjär bro
  mellan dikets kanter (`bridge-profiles.json` `spans`, samma i `TerrainService.kt`).
* **Diagnostik**: `src/lib/infraDiagnostics.ts`, `npx vitest run -c scripts/geo/vitest.infra.config.ts`,
  utvecklingsläge `?inspect=infra` i dev-servern.

## Höjdlager på DTM (steg 2, 2026-10-18)

Den platta förlagan staplade lager över ett markplan på −0,02 enheter: markbeläggning 0,003–0,04,
byggnadsbas 0,045, väg 0,071 och asfalt +0,006. På DTM blev det 0,6–2,4 m konstgjord höjd
(granskning: `docs/elevation-audit-2026-10-18.md`). Nu gäller (`terrain.ts`, `TerrainService.kt`):

* Vägar, gångvägar, banvall och vägmarkeringar ritas på den renderade DTM-ytan. `roadHeight` drar av
  den gamla gatuytan (0,097 enheter = 2,43 m) från alla nätverkshöjder, även de uppskattade
  broprofilerna, så att broar fortsätter att möta sina tillfarter utan trappsteg. Upphöjningar över
  vägnivån (lager-lyft för landbroar, rampade spår vid undergångar) behålls tills steg 4.
* Markbeläggning och strandkanter ligger på markytan. Ordningen mellan överlappande ytor ges av
  djup-rang (`groundLayers.ts`), inte av meter. Kamerans närplan växer med höjden över marken.
* OSM-byggnader står på lägsta markhöjd inom fotavtrycket (Simple 3D Buildings: höjd från lägsta
  markkontakt). Väggarna fortsätter under mark i uppförsbacke.
* Handbyggda modeller placeras på den yta de modellerades på (`placeLegacy`): perronger och arenor
  på gatan, byggnadsdetaljer på byggnadens fotavtryck, träd på marken. Plan, rinkar och
  flygplatsens beläggning läggs på samma terrängnät som markytorna.
* Fordon behåller sitt avstånd till körytan: bilar 5 cm över asfalten, spårvagnar och tåg 5 cm över
  rälsen. Rälsen ligger kvar 0,016 enheter över referensen (0,25 m över gatan) tills steg 5.

Mätt mot inbyggd 1 m-DTM (`scripts/geo/measure-elevation.test.ts`): vanliga vägar +2,46 → +0,01 m
(RMSE 2,52 → 0,56 m, lika med terrängnätets eget fel). Brobanor mot LiDAR klass 17 har lägre RMSE på
alla sex uppmätta broar men är fortfarande uppskattade linjära profiler. Regressionstester:
`src/lib/elevation.test.ts`.

## Aktiv data och renderingsyta

Markhöjdmodell Nedladdning ©Lantmäteriet, bearbetad, CC BY 4.0.
Fyra SHA-256-verifierade 1 m-leveranser i SWEREF 99 TM + RH2000 täcker hela kartan.
Originalen behålls under work/geodata/lantmateriet/dtm/ och ingår inte i Git.

Det delade höjdrastret har 5 m provavstånd och 2713 × 2165 punkter (rutnätsaxlar i SWEREF 99 TM).
sample returnerar bilinjär höjd från detta raster. Markbundna objekt använder groundHeight:
samma triangulerade yta som ritas (terrain.json `mesh`, src/lib/surfaceMesh.ts, TerrainService.kt).

Sedan steg 3 (2026-10-18) är ytan ett adaptivt RTIN-nät (rätvinkliga trianglar, halvering längs
hypotenusan) över 5 m-rastrets noder: från 320 m-celler i plan terräng ned till 5 m där det behövs.
Hörnhöjderna är rastervärdena själva, så inga nya höjder skapas. Var nätet förfinas avgörs mot varje
pixelcentrum i den inbyggda 1 m-DTM:en: en triangel delas så länge någon pixel avviker mer än sin
klass tolerans från triangelns plan (väg-, gång-, spårvägs- och järnvägsstråk, byggnadsfotavtryck och
10 m på båda sidor om strandlinjer 0,75 m; bebyggd markbeläggning 1,125 m; övrig mark och öppet
vatten 2,25 m). Delningsfelen fortplantas från fint till grovt, så att nätet saknar sprickor och
T-korsningar (scripts/prepare-terrain-mesh.py, scripts/geo/rtin.py; studie: docs/terrain-step3.md).
Mätt mot inbyggd 1 m-DTM: vanliga vägar RMSE 0,56 → 0,20 m, maxfel 26 → 2,3 m; mark 1,17 → 0,34 m.
Källa, insamlingsintervall och bearbetning följer metadata.
Vertikal och horisontell skala är båda 1:25; inga konstgjorda kullar eller förstärkta höjder.

Mark, markbeläggningar, vattenmask och vanliga vägstråk klipps mot nätets trianglar (terrain.drape)
och får planet för triangeln under sig. Därmed kan långa ursprungstrianglar inte skära igenom vägbanor
eller skapa glipor mellan ytor.
No-data är inte nollhöjd. Den aktiva DTM-leveransen täcker 100 % av rutnätet,
82 688 vägändpunkter och 12 499 byggnadsankare.

## Broar och trafik

Broprofiler är separata från markmodellen. prepare-bridge-profiles.py använder DTM-höjder
vid landanslutningarna för uppskattade linjära profiler. Körfält på samma detaljerade bro delar profil.
Marken/vattnet under spannet bestämmer inte brobanans mellanliggande höjder.
Dessa profiler är inte inmätta brohöjder och kan ersättas med uppmätt geometri.

bridge-profiles.json delas mellan klient och backend. roadHeight/profileHeight används för vägbanor
och trafik. Ändrad terräng- eller broprofil ändrar revisionen; klienten avvisar gamla serverhöjder.
Äldre illustrativa sänkningar för järnväg och gångvägar läggs inte ovanpå DTM.
Detaljerade broar och generiska brostöd har separat ägarskap. Absolut höjd över havet är aldrig
ett kriterium för att skapa en viadukt. Ingelstabron följer samma profil som dess vägbana.

Vattenytan är fortfarande en visuell approximation utifrån DTM när separat vattenunderlag saknas.
Ingen hydrologisk vattenståndsmodell eller verifiering av dammnivåer ingår.

## Data som ännu inte finns i modellen

35 lokala Laserdata Nedladdning, skog-filer finns som kompletterande underlag.
De används inte som markyta när DTM finns. Copernicus DEM är inte aktiverad.
Ingen faktisk LOD2/CityGML-leverans är inläst och ingen LiDAR-takextraktion är genomförd.
Takformer, stora specialbyggnader och vissa konstruktionsdetaljer är fortfarande uppskattade.

## Reproducera

Installera scripts/geodata-requirements.txt i en Pythonmiljö, eller work/geodata/python/ som stöds av skripten.

    pwsh -File scripts/download-lantmateriet.ps1 -Product Terrain
    python scripts/prepare-dtm.py --activate

Aktivering kör även förberedelsen av broprofiler, skriver identisk terräng och brodata till båda projekten
och uppdaterar byggnadsrevisionen. Utan --activate skrivs endast arbetsfiler.

Steg 5, i denna ordning (geodata-Python):

    python scripts/geo/retained_decks.py                # kvarhållna brodäck (bevis per korsning)
    python scripts/geo/dtm_corrections.py --apply       # korrigerat 5 m-rutnät, ny rutnätsrevision
    python scripts/prepare-terrain-mesh.py --activate --recompute
    python scripts/prepare-bridge-profiles.py
    python scripts/geo/road_patches.py --apply          # brytlinjeprototyp (efter broprofilerna)
    npx vitest run -c scripts/geo/vitest.infra.config.ts scripts/geo/infra-profile-control.test.ts scripts/geo/infra-mesh-control.test.ts

Steg 5.1 (målen är en fil i repot; regenerera bara när diagnostiken ska göras om, på steg 5-ytan):

    INFRA_OUT=work/step51/diagnose-before.json npx vitest run -c scripts/geo/vitest.infra.config.ts scripts/geo/infra-diagnose.test.ts
    npx vitest run -c scripts/geo/vitest.infra.config.ts scripts/geo/infra-step51-railprofile.test.ts
    python scripts/geo/rail_grade_evidence.py && python scripts/geo/refinement_targets.py
    python scripts/prepare-bridge-profiles.py && python scripts/geo/road_patches.py --apply
    python scripts/geo/refinement_report.py             # efter infra-step51-measure.test.ts (före/efter)
Starta om backend och ladda om klienten efter aktivering.
Uppmätta byggnadsmesh måste valideras före ändring av terrängreferens.

## Prestanda och verifiering

Statiska ytor och träd delas i rumsliga grupper. Temporära geometrier frigörs vid sammanslagning.
Trädkronor har färre trianglar, realtidsskuggor är avstängda och pixelkvoten är 1.
Geometri byggs i begränsade bufferter för att minska högsta minnesåtgången.
Det gemensamma rutnätet har större initial byggkostnad än det felaktiga glesa nätet.
I lokal kontroll cirka 15 sekunder till UI och 5,3 miljoner trianglar i stadsvyn,
jämfört med cirka 22 sekunder och 46 miljoner före rättningen av viaduktfelet.
Detta garanterar inte viss bildfrekvens på andra datorer.

Första paketet är fortfarande stort, cirka 51 MB okomprimerad JS inklusive kart- och höjddata.
Binära och strömmade kart-/höjdrutor återstår som laddningsoptimering.
Regressionstester kontrollerar bland annat sammanhängande nät, yttäckning, broägarskap,
dubbla höjdförskjutningar och gemensamt datakontrakt, samt (steg 2) väg-, mark- och
byggnadshöjder mot inbyggda DTM-kontrollpunkter i `src/lib/geo/elevation-control.json`.
