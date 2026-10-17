# Gemensamt höjdsystem – 2026-10-17

## Aktiv data och renderingsyta

Markhöjdmodell Nedladdning ©Lantmäteriet, bearbetad, CC BY 4.0.
Fyra SHA-256-verifierade 1 m-leveranser i SWEREF 99 TM + RH2000 täcker hela kartan.
Originalen behålls under work/geodata/lantmateriet/dtm/ och ingår inte i Git.

Det delade höjdrastret har 5 m provavstånd och 2670 × 2113 punkter.
sample returnerar bilinjär höjd från detta raster. Markbundna objekt använder groundHeight:
samma triangulerade yta som ritas, med 10 m celler i den centrala 3,2 × 3,2 km-rutan
och 40 m celler i ytterområdet. Detta är en prestandaanpassad rendering, inte full 1 m-geometri.
Fin- och grovnät har gemensamma kanthöjder. Källa, insamlingsintervall och bearbetning följer metadata.
Vertikal och horisontell skala är båda 1:25; inga konstgjorda kullar eller förstärkta höjder.

Mark, markbeläggningar, vattenmask och vanliga vägstråk klipps mot samma rutnät och diagonal.
Därmed kan långa ursprungstrianglar inte skära igenom vägbanor eller skapa glipor mellan ytor.
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
dubbla höjdförskjutningar och gemensamt datakontrakt.
