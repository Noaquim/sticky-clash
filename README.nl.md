# Sticky Clash

English? Read [README.md](README.md).

Het spel zelf spreekt Nederlands en Engels: wissel met de knoppen **NL | EN** rechtsboven.

Projection-mapping spel, geïnspireerd op de reel van @tejusn. Balletjes vallen over de
muur; jij stuurt ze met echte voorwerpen de bak in.

Draait volledig in de browser. Geen installatie, geen libraries.

**Speel meteen online: https://noaquim.github.io/sticky-clash/** — open de link in Chrome of
Edge, sta de camera toe, klaar. Niets downloaden of installeren. Geen beamer, of zelfs geen
camera? Dan kan het ook, zie hieronder. Liever zonder internet? Download `sticky-clash.html`
(het hele spel in één bestand) of de hele map via *Code → Download ZIP*.

![Ballen stuiteren over briefjes op een muur naar de bak](docs/demo.gif)

*Simulatie, geen echte opname: de echte spelcode speelde deze baan; muur, briefjes en camerabeeld kwamen er later bij.*

Iedereen mag het spel gebruiken, aanpassen en delen (MIT-licentie, zie `LICENSE`). Zelf
sleutelen: lees **ZELF AANPASSEN.txt**.

## Drie manieren om te spelen

Bij je eerste bezoek vraagt het spel hoe je wilt spelen. Later wissel je bovenaan het paneel,
bij **Speelplek** (Beamer · Scherm · Demo). Het spel onthoudt je keuze.

- **Muur + beamer** — de echte ervaring. Je hebt een beamer, een webcam en een effen muur
  nodig. De ballen vallen over je muur, en briefjes en voorwerpen die je ertegen houdt
  kaatsen ze terug.
- **Scherm, zonder beamer** — je hebt alleen een webcam nodig, of je telefoon als webcam.
  De camera kijkt naar een tafel, een muur of een bord; het spel staat op je scherm, over
  het camerabeeld heen. Leg briefjes of voorwerpen neer: dat zijn de obstakels. Handen
  tellen niet mee. Zet de camera het liefst recht boven de tafel. Kijkt hij naar jou (de
  camera in je laptop), dan spiegelt het spel het beeld vanzelf; zijn links en rechts toch
  om, klik dan op **Spiegelen**.
- **Probeer zonder camera** — je hebt niets nodig. Meteen spelen met je muis of je vinger:
  sleep de briefjes, teken nieuwe (rood = trampoline, groen = turbo, blauw = breekt),
  dubbeltik of tik op het × om er een weg te halen. Werkt ook op een telefoon of tablet,
  en op een andere site ingesloten (zoals op itch.io): de demo vraagt nooit om de camera.

Staat het spel ingesloten op een andere site, dan mag de camera daar vaak niet, en een
beamervenster ook niet. Het spel zegt dat dan, met een link om het in een eigen tabblad te
openen.

## In het kort

1. Dubbelklik **`sticky-clash.html`** (of op Windows de snelkoppeling / `start.bat`), of
   open de link hierboven
2. Kies hoe je speelt. De demo begint meteen.
3. Met een beamer: klik op **Alles automatisch instellen**, sta de camera toe en volg de
   aanwijzingen op de muur. Op een scherm: sta de camera toe en haal je handen even uit
   beeld terwijl het spel de lege tafel leert.
4. **Start ronde**

Dat is alles. Met een beamer gaat de kalibratie vanzelf: het spel projecteert een wit vlak
en vier stippen en zoekt ze zelf terug in het camerabeeld. Op een scherm is er niets te
kalibreren: het camerabeeld is het speelveld.

## Nederlands of Engels

Rechtsboven in de kopbalk staan twee kleine knoppen: **NL | EN**. Wisselen gaat meteen,
zonder herladen, en alles gaat mee: het paneel, de statusregel en de teller, de ranglijst
en de naamvraag, het telefoonvak, alle teksten op de muur, de titel van het beamervenster
en de **Foto van wat de camera ziet**.

- **Bij het starten** kiest het spel de taal die je het laatst met die knoppen koos (die
  onthoudt deze browser). Nog nooit gekozen? Dan volgt het de browser: staat die op
  Nederlands, dan Nederlands, en anders Engels.
- **De telefoon** volgt zijn eigen taal, zonder knoppen: Nederlands op een telefoon die op
  Nederlands staat, anders Engels. Ook wat de laptop stuurt, zoals de vraag om je naam,
  verschijnt in de taal van de telefoon.
- **Blijft Nederlands:** de beschrijving in het venster waarmee je het spel als app
  installeert. Die komt uit een vast bestand (`manifest.webmanifest`) dat niet mee kan
  wisselen.

Zelf teksten veranderen, in een van beide talen: zie
[Teksten en de twee talen](#teksten-en-de-twee-talen).

## Twee speelmodi

### Elk voorwerp (standaard)

Het spel leert één keer hoe de lege muur eruitziet. **Alles wat je er daarna voor zet is
een obstakel** — een boek, een dienblad, een pizzadoos, een liniaal, je hand. Kleur maakt
niet uit. Je bouwt er een knikkerbaan mee en probeert zo veel mogelijk ballen in de bak
te krijgen.

De bak zelf wordt ook herkend en blijft het doel, óók als je hem verschuift tijdens het
spel.

**Vergeten om de briefjes eraf te halen voordat je de muur liet leren?** Geeft niet. Bij
het leren zoekt het spel ook naar wat er al hing: kleine, massieve dingen met rondom
egale muur. Die tellen gewoon mee, en haal je ze eraf, dan zijn ze weg — zonder
spookvlek. Het paneel zegt na het leren hoeveel het er vond. Een groot vel papier, een
holle lijst of de rand van het beamerbeeld telt niet. Een gekleurd briefje wordt net zo
makkelijk gevonden als wanneer je het er later ophangt; iets wat alleen lichter of
donkerder is dan de muur (een lichtvlek, grijze print) moet duidelijker afwijken.

> Kleine dingen die écht aan de muur zitten — een stopcontact, stickers, een tekening —
> tellen dan ook mee. Wil je dat niet, zet dan *Wat al aan de muur hangt telt ook mee* uit
> (onder Speelmodus). Hing de bak er al, dan vindt de wizard hem ook zo.

### Post-its · duel

Twee spelers. Oranje post-its zijn van de aanvaller en sturen ballen naar de bak, blauwe
zijn van de verdediger en houden ze tegen. Doelpunt = punt voor de aanvaller; een bal die
een briefje raakte maar er toch naast valt = punt voor de verdediger. Drie doelpunten op
rij geeft combobonus.

Leer de twee kleuren even aan onder "Meer instellingen" → Kleuren, onder de verlichting
waarin je speelt.

## Wat je nodig hebt

- **Met een beamer:** een beamer op een effen muur, een webcam die het hele beamervlak ziet,
  en een emmer, prullenbak of doos als doel
- **Op een scherm:** alleen een webcam (of je telefoon als webcam) die de tafel, muur of het
  bord ziet. De bak staat op het scherm.
- **Zonder camera (de demo):** niets. Met `sticky-clash.html` zelfs geen internet.
- Voor de voorwerpmodus: spullen die je bij de hand hebt
- Voor de duelmodus: post-its in twee duidelijk verschillende kleuren

## Starten — op elke computer

**Het hele spel zit in één bestand: `sticky-clash.html`.** Dubbelklik het en het opent in
je browser. Niets installeren, geen internet nodig. Je kunt alleen dat bestand op een
USB-stick zetten of mailen; het werkt op zichzelf.

| computer | zo start je |
|---|---|
| **Windows** | dubbelklik `sticky-clash.html`, of de snelkoppeling **Sticky Clash** op het bureaublad |
| **Mac** | open `sticky-clash.html` met Chrome (rechtermuisknop → Open met → Google Chrome) |
| **Linux** | open `sticky-clash.html` met Chrome of Chromium, of draai `./start.sh` |
| **Chromebook** | open `sticky-clash.html` vanuit de app Bestanden |

Gebruik **Chrome of Edge**. In Safari en Firefox is het niet getest; het spel meldt het
als je een andere browser gebruikt.

**Eén verschil**: vanuit het losse bestand vraagt de browser bij élke start opnieuw om de
camera — klik dan gewoon op Toestaan. Wil je dat hij het onthoudt, start dan via een kleine
lokale server. Daarvoor is er op Windows `start.bat` (en de snelkoppeling), die zelf de
beste manier kiest:

1. staat **Node.js** erop → `node serve.mjs`
2. anders **PowerShell** (zit op elke Windows-computer) → `serve.ps1`, zonder installatie
   en zonder beheerdersrechten
3. mag ook dat niet, zoals op sommige schoolcomputers → gewoon het losse bestand

Beide servers gebruiken altijd poort 8123. Een andere poort is voor de browser een ander
adres, en dan zou je kalibratie en cameratoestemming kwijt zijn. Draait het spel al, dan
openen ze alleen de pagina; zit er een ander programma op 8123, dan openen ze het losse
bestand.

Op een Mac of Linux doet `start.command` / `start.sh` hetzelfde (met Node.js als dat er
is). Na het kopiëren eerst uitvoerbaar maken: `chmod +x start.command`.

De snelkoppeling op het bureaublad opnieuw maken (bijvoorbeeld na het verplaatsen van de
map, of op een andere Windows-computer):

```bash
node maak-snelkoppeling.mjs
```

### Een losse webcam gebruiken

De camera van je laptop kijkt naar jou, niet naar de muur. Steek daarom een losse webcam
in en zet hem naast of op de beamer, gericht op de muur.

- **Automatisch:** staat *Camera* (bovenaan, onder "Alles automatisch instellen") op
  *Automatisch*, dan pakt het spel een losse webcam als die er is, en de ingebouwde alleen
  als er niets anders is. Een virtuele camera (OBS e.d.) komt als laatste.
- **Insteken terwijl het spel openstaat:** het spel merkt de nieuwe webcam binnen een
  seconde op en schakelt erop over. Klik daarna op **Alles automatisch instellen**: een
  andere camera kijkt anders naar de muur, dus kalibratie en muur moeten opnieuw.
- **Zelf kiezen:** kies de webcam in de lijst. Die keuze wordt onthouden; het spel wisselt
  dan niet meer vanzelf.
- **Werkt hij niet?** Het spel zegt waarom: bezet door een ander programma (sluit Teams,
  Zoom, OBS of de Camera-app), geen toestemming (camera-icoon in de adresbalk), of
  losgekoppeld.
- **Geen webcam?** Je telefoon kan het ook, met een gratis app als DroidCam of Camo. Op een
  Mac kan een iPhone meteen als camera. Leg de telefoon stil neer, gericht op de muur.

### Beamer op het tweede scherm

Klik één keer op **Meer instellingen → Beamer → Beamerscherm herkennen** en sta het toe.
Daarna opent het beamervenster voortaan vanzelf op de beamer — ook als de beamer je
hoofdscherm is. Dan nog één klik in dat venster voor volledig scherm; zonder klik mag geen
enkele website volledig scherm openen. Zolang dat nog niet gebeurd is staat er klein onderin
het beamerbeeld "Klik één keer in dit venster voor volledig scherm" — maar alleen als er
niet gespeeld wordt, en als deel van het beeld zelf, zodat de camera het niet voor een
voorwerp aanziet. Het spel merkt dat het beamervlak veranderd is en kalibreert zichzelf dan
opnieuw.

### Als app installeren

Via de online versie of via `start.bat` (niet vanuit het losse bestand) kun je Sticky Clash
installeren als los programma, met een eigen venster en een pictogram in het startmenu.

- **Installeren:** klik in Chrome of Edge op het installeer-pictogram rechts in de
  adresbalk, of op de knop **Installeer als app** bovenaan het paneel. Die knop verschijnt
  alleen als de browser zegt dat het kan.
- **Zonder internet:** daarna start het spel ook offline — de browser bewaart een kopie
  van alle bestanden. Ben je online, dan haalt hij altijd eerst de nieuwste versie: een
  update op GitHub, of je eigen wijziging na F5, zie je dus meteen. Geïnstalleerd via
  `start.bat`? Dan start de app ook als de server niet draait (maar wil je je eigen
  aanpassingen zien, start dan eerst `start.bat`).
- **Camera en beamer:** de camera blijft gewoon nodig. De app deelt toestemming,
  kalibratie en instellingen met de browser op hetzelfde adres, en het beamervenster gaat
  net zo open als in de browser.
- **Verwijderen:** in het app-venster via het menu (⋮ of …) → *Sticky Clash
  verwijderen*, of in Windows via Instellingen → Apps.

### Na een wijziging aan de code

`sticky-clash.html` wordt gemaakt uit `index.html`, `css/` en `js/`. Na een wijziging:
dubbelklik **Los bestand maken** (Windows; gebruikt Node.js als dat er is, anders
PowerShell — beide geven precies hetzelfde bestand), of:

```bash
node bouw-los-bestand.mjs
```

`test/losbestand.mjs` faalt als je dat vergeten bent. Wie zelf wil sleutelen: zie
**ZELF AANPASSEN.txt** — waar wat staat en de makkelijkste aanpassingen.

### Teksten en de twee talen

De Nederlandse tekst is de sleutel. Hij staat in de code, op dezelfde plek als altijd:

| waar | welke teksten |
|---|---|
| `index.html` | de vaste teksten in het paneel |
| `js/main.js` | de meldingen in de statusregel, de teller onder *Doel aanwijzen*, de aanwijzingen op de muur tijdens het instellen, de tips op de muur en de foto van wat de camera ziet |
| `js/game.js` | de teksten op de muur tijdens het spel: banners, de uitleg per level, BOING en TURBO, COMBO, RANGLIJST |
| `js/telefoon.js` | de regel over de telefoon in het paneel, en de meldingen die naar de telefoon gaan |
| `js/vision.js` | de namen van de kleuren: Aanvaller, Verdediger, Doel, Balbron |
| `telefoon.html` | de pagina op de telefoon, met een eigen Engels woordenboek: `const EN = {…}` |

Het Engels staat in `js/taal-en.js`, in `TAAL_EN`: links de Nederlandse zin precies zoals
hij in de code staat, rechts het Engels. Hoe het werkt staat in `js/taal.js`:

- `t('Nederlandse zin', { naam: … })` vertaalt en vult `{naam}` en dergelijke in
- `tAantal(n, '{n} voorwerp', '{n} voorwerpen')` kiest tussen één en meer
- `TaalTeller` is voor een tekst met een getal die elk beeldje op de muur staat; die maakt
  alleen iets nieuws als het getal of de taal verandert
- `vertaalPagina(document.body)` zet de vaste teksten van `index.html` om
- `zetTaal('en')`, `huidigeTaal()` en `opTaal(f)` zetten, lezen en volgen de taal

Een tekst veranderen:

- **Alleen het Engels:** pas de rechterkant aan in `js/taal-en.js`.
- **Een Nederlandse tekst:** pas hem aan in de code of in `index.html`, **én** links in
  `js/taal-en.js`. Vergeet je dat, dan blijft die tekst in het Engels gewoon Nederlands;
  `node test/taal.mjs` zegt welke.
- Laat `{naam}`, `{n}` en dergelijke staan: daar vult het spel een naam of getal in.
- Houd de grote titels op de muur kort, anders passen ze niet op een beamer van 4:3.
- Meldingen die de laptop naar de telefoon stuurt, staan in beide woordenboeken
  (`js/taal-en.js` en `const EN` in `telefoon.html`), met hetzelfde Engels. Ook dat
  controleert `test/taal.mjs`.
- De melding "Kon het spel niet laden" heeft zijn Engels in `index.html` zelf, in de
  `onerror` van de scripttag: die moet ook werken als de code van het spel niet laadde.
- Blijft Nederlands: `manifest.webmanifest` (het venster bij het installeren) en één
  melding voor ontwikkelaars in de console, in `js/app.js`.

Daarna, zoals bij elke wijziging: `sticky-clash.html` opnieuw maken.

## Donkere kamer: de beamer verlicht de muur

In een donkere kamer is de beamer de enige lichtbron op de muur. Projecteert het spel
zwart, dan valt er niets op je post-its en ziet de camera ze niet — hoe goed de herkenning
verder ook is. Daarom verlicht de beamer de muur zacht grijs: de **muurverlichting**.

Bij **Alles automatisch instellen** meet het spel hoe helder de camera het beamervlak ziet
en zet de verlichting precies hoog genoeg. In een gewone, verlichte kamer blijft hij uit (0%);
alleen als het donker is gaat hij naar 12%, 25%, 40% of 55%. Je kunt hem ook zelf schuiven onder
Speelmodus. Leer daarna de muur opnieuw, want de verlichting hoort bij de lege muur.

Daarnaast schaalt de drempel mee met hoe licht de muur is. Een post-it kaatst een vast deel
van het licht anders terug dan de muur; op een schemerige muur is dat in getallen een klein
verschil, maar het is hetzelfde contrast. Gemeten in de meetlat:

| kamer | vaste drempel | meeschalende drempel |
|---|---|---|
| schemerig (50% licht) | 1/5 gevonden | 5/5 |
| donker (35%) | 1/5 | 5/5 |
| heel donker (22%) | 0/5 | 4/5 |

Nul valse voorwerpen in alle donkere situaties. Ziet de camera te weinig, dan zegt de teller
onder de speelmodus dat: "De camera ziet te weinig licht".

**Belichting vastzetten staat uit.** Op Windows kent de cameradriver alleen belichtingstijden
in machten van twee, en bij handmatige belichting vervalt ook de automatische versterking —
in een donkere kamer gaf dat een bijna zwart beeld. Aanzetten kan onder Meer instellingen →
Camera, als het beeld echt flikkert; het spel controleert dan of het beeld er niet donkerder
van wordt en zet hem anders terug. Bij het starten van de camera zet het spel een eventueel
nog vastgezette belichting van een vorige keer terug op automatisch.

## Testen zonder opstelling

Vink **Testmodus** aan. Sleep met de muis in de rechter weergave om een obstakel te maken
(`Shift` = blauw), `Alt` + klik zet het doel, `Ctrl` + klik de balbron, rechtermuisknop
wist alles.

Of kies bij **Speelplek** de **Demo**: dan speel je zonder camera, met gekleurde briefjes
die je sleept en tekent, ook met je vinger op een telefoon.

## Mensen tellen niet mee, het voorwerp in je hand wel

Een mens is geen obstakel, maar wat je vasthoudt moet dat juist wél zijn. Elke vlek gaat
langs deze regels, in deze volgorde:

| regel | wat | waarom |
|---|---|---|
| **schaduw** | vlek is grotendeels schaduwkleurig en heeft nog geen vertrouwen verdiend | een schaduw beweegt met wie hem werpt; een zwart briefje hangt doodstil |
| **huid** | vlek is voor meer dan 60% huidtint en heeft nog geen vertrouwen verdiend | een hand trilt en zit aan een arm; een bruin briefje niet |
| **rand** | vlek raakt de rand van het camerabeeld | mensen lopen van buiten het beeld naar binnen |
| **groot** | groter dan 35% van het beamervlak | ruim vangnet; geen speelvoorwerp is een derde van de muur |
| **buiten** | een hoekpunt ligt buiten het beamervlak | wie ervoor staat steekt er altijd overheen |
| **vorm** | vult minder dan 72% van zijn omhullende | een post-it of boek zit boven 0,9; een geknikte arm rond 0,66 |
| **mens** | de omtrek "ademt" | een voorwerp is star, een mens beweegt armen en hoofd |

Een nieuwe vlek moet eerst ~0,4 s gezien zijn voordat hij meedoet (dunne stippellijn tot
dan); pas dan is er genoeg gemeten om te weten of hij star is.

**Vormvastheid is het beslissende verschil.** Een voorwerp is star: of je het nu neerzet
of ronddraagt, zijn omtrek en oppervlak blijven gelijk. Een mens niet. Dat is betrouwbaarder
dan kijken naar grootte of stilstand, want een boek in je hand beweegt óók en moet juist
wél meetellen. De vorm wordt gemeten rond het eigen middelpunt van de vlek, zodat een snel
bewogen boek niet ten onrechte als mens telt.

Je mag tijdens het spelen gerust nieuwe dingen ophangen: zodra je je hand weghaalt telt
het voorwerp binnen een kwart seconde mee.

Wat afgekeurd wordt zie je in het camerabeeld als een **dunne rode stippellijn**, en de
teller onder de speelmodus zegt hoeveel er genegeerd zijn en om welke reden.

Eerlijk over de grens: iemand die zich muisstil houdt, helemaal binnen het beamervlak en
kleiner dan een derde van de muur, is geometrisch niet van een plank te onderscheiden.

**Huidkleur en schaduwkleur zijn alleen verdacht, geen vonnis.** Onder warm lamplicht is
alles oranjebruin; een zwart of grijs briefje had precies de tint van huid, en een bruin
briefje ís gewoon huidkleurig. Daarom:

- huid wordt gemeten **ten opzichte van de muur eromheen**, zoals de witbalans van een
  camera — maar alleen om een lichtzweem weg te halen, begrensd, en niet op een muur die
  zelf duidelijk gekleurd is (kurk, hout). Dan valt een zwart of grijs briefje er onder een
  gele lamp vanzelf buiten, zonder dat een wit kaartje op een koele muur ineens huid wordt;
- wat daarna nog huid- of schaduwkleurig is, moet **vertrouwen verdienen**: ruim een
  seconde op zijn plek hangen, daarbij **niet trillen** (minder dan 0,15 pixel, 0,4 seconde
  achter elkaar — in tijd gemeten, zodat een camera die in het donker maar 15 beelden per
  seconde geeft niet twee keer zo traag is) en **geen afgekeurd lichaamsdeel ernaast** hebben (een lijf of
  arm binnen acht cellen). Een briefje haalt dat na 1,2 s; een hand die je "stil" in de
  lucht houdt trilt altijd, en een gezicht zit vast aan een lijf;
- verdiend vertrouwen **blijft** zolang het ding op zijn plek hangt, ook als er daarna
  iemand langsloopt of ballen overheen vallen (ons eigen licht wordt weggerekend). Verschuift het, of komt er iets huid- of schaduwkleurigs bij
  (een hand die erop drukt), dan begint het opnieuw — en telt het briefje intussen gewoon
  mee met zijn **oude vorm**, zonder die hand. Plak je er een gewoon briefje tegenaan, dan
  groeit de vorm gewoon mee.

Gemeten (72 briefjes in 4 kleuren, 2 maten, 3 standen en 3 soorten licht, tegen 48
handen, vuisten, gezichten en onderarmen die 0,2 tot 1 pixel trillen): elk briefje telt
binnen 1,2 s, geen enkel lichaamsdeel lekt. Om dat te kunnen meten wordt het midden van
een vlek "zacht" bepaald: elke cel weegt mee naar hoe duidelijk hij van de muur afwijkt,
zodat randcellen die aan en uit flikkeren het midden niet laten verspringen. Een stil
briefje staat daarmee op 0,03–0,17 pixel, ook met veel cameraruis.

> **Grens:** een vuist die roerloos tegen de muur rust terwijl de arm onzichtbaar is (mouw
> in precies de kleur van de muur) is niet van een bruin briefje te onderscheiden. En een
> bruine doos die je in je hand rondbeweegt telt pas als je hem even stilhoudt.

Een stilstaande schaduw die vast zit aan **de bak** is de schaduw van de bak zelf en telt
nooit mee; een donker briefje náást de bak wel. En wat precies op het doel ligt, ís de bak:
dat wordt nooit een obstakel over zijn eigen ingang, ook niet als je het doel met de muis
op je bak sleept.

Onder "Meer instellingen" staan twee knoppen om dit bij te stellen: **Mensenfilter**
(hoger = strenger op vormvastheid) en **Stilstaan** (op bijvoorbeeld 0,5 s tellen alleen
neergezette voorwerpen mee).

## Spelregels

Onder **Spelregels** in het paneel:

Elke ronde begint met een aftelling van drie op de muur, zodat wie daar staat zijn
voorwerpen kan klaarzetten. De laatste tien seconden tikken mee: de klok op de muur
springt bij elke tik even op en de muziek gaat sneller. Aan het eind blijft de
eindstand staan met **druk op spatie voor een nieuwe ronde** — je hoeft niet terug naar de
laptop. De hoogste score blijft bewaard per speelmodus en staat op het startscherm; haal
je hem, dan verschijnt NIEUW RECORD.

- **Rondetijd** — van 30 seconden tot een kwartier, standaard 3 minuten
- **Geen tijdslimiet** — de klok telt op in plaats van af, handig als het spel gewoon moet
  blijven draaien op een feest
- **Balbron beweegt heen en weer** — de plek waar de ballen vandaan komen slingert, met
  instelbaar tempo. Je kunt dus niet één keer goed mikken en daarna achteroverleunen
- **Bak beweegt heen en weer** — hetzelfde voor het doel
- **Wind** — duwt de ballen langzaam naar links en rechts. De richting zie je boven in beeld

Doel en balbron kun je ook gewoon met de muis verslepen in de rechter weergave: het doel
pak je door erin te klikken, de bron met Ctrl+klik. Dat werkt ook midden in een ronde.

### Extra's

Ook onder **Spelregels**, allemaal los aan of uit te zetten:

- **Speciale briefjes** — de kleur geeft een briefje een rol. **Rood** is een trampoline:
  ballen stuiteren er hard vanaf. **Groen** is een turbo: ballen krijgen een flinke zet in de
  richting waarin ze rollen. **Blauw** is een breekbare muur: na 5 tikken is hij 5 seconden weg. Boven elk
  speciaal briefje staat wat het doet. Alle andere kleuren zijn gewone obstakels.
- **Gouden ballen** — af en toe valt er een gouden bal. Die is 3 punten waard.
- **Bonusbak** — een tweede, kleinere bak die elke 20 seconden ergens anders staat. Ook
  3 punten.
- **Spelvorm: Uitdaging** — in plaats van vrij spel speel je levels. Haal je het doel
  van een level op tijd, dan wordt het volgende moeilijker: de bak verhuist, gaat bewegen,
  er komt wind, en daarna beweegt de balbron en komen er meer ballen.

Voor wie het voor het eerst speelt, staan er op het startscherm korte tips op de muur:
hoe je een baan bouwt en wat de speciale briefjes doen.

**Geluid, muziek en effecten** staan onder *Meer instellingen* → Spel, elk los aan of uit.
Tijdens een ronde speelt zachte muziek (drums, bas en een loopje, zonder muziekbestanden).
Bij pauze wordt hij stil en daarna speelt hij verder; na de ronde stopt hij. In de
Uitdaging gaat hij per level iets sneller. De trampoline zegt *boing*, de turbo *whoosh*,
een gouden bal in de bak klinkt als een klokje en de bonusbak als een muntje. Bij 3, 5 en
10 op rij klinkt een deuntje, bij een gehaald level of een nieuw record een fanfare. Op de
muur: confetti uit de bak (goud bij een gouden bal), sterretjes achter gouden ballen,
COMBO ×3 en vuurwerk bij een record of een gehaald level. Het blijft bescheiden — nooit
een flits over de hele muur, en nooit lang licht op een voorwerp, want dan raakt de camera
het kwijt.

### Ranglijst

Haal je de ranglijst, dan vraagt het paneel na de ronde je naam. De tien beste scores staan
onder **Ranglijst**, per speelmodus; bij Uitdaging telt het hoogste level. Ze blijven bewaard in deze browser op deze computer; met
*Ranglijst wissen* begin je opnieuw.

## Bedienen met je telefoon

Sta je bij de muur, dan hoef je niet steeds naar de laptop te lopen. Klik in het paneel op
**Telefoon koppelen**. Er verschijnt een QR-code: in het paneel, en zolang er niet gespeeld
wordt ook in een hoek op de muur. Scan hem met de camera van je telefoon en je hebt een
afstandsbediening met grote knoppen:

- **Start ronde**, **Pauze**, **Verder** en **Nieuwe ronde**
- de resterende tijd (die telt de telefoon zelf mee af), en de stand bij pauze en na afloop
- haal je de ranglijst, dan typ je je naam op de telefoon

Het paneel zegt **Telefoon verbonden** zodra hij er is. Meer telefoons mogen ook: iedereen die
de code scant. Met **Nieuwe code** of **Stoppen** werkt een oude code niet meer.

Goed om te weten:

- **Laptop én telefoon hebben internet nodig.** Ze kunnen elkaar niet rechtstreeks bereiken,
  dus gaan de berichten via [ntfy.sh](https://ntfy.sh), een gratis doorgeefluik zonder
  account. Via ntfy.sh gaan alleen je knoppen, de stand (score en tijd) en de naam die je
  typt. Met `?cache=no&firebase=no` achter het adres bewaart ntfy.sh niets en stuurt het niets
  door. De kamercode in de QR-code is 120 bits toeval en geldt alleen zolang het spel
  openstaat; wie hem niet heeft, kan niet meedoen.
- **Zuinig met berichten.** ntfy.sh laat zonder account maar weinig berichten door: na een
  stuk of zestig één per vijf seconden, en 250 per dag per internetaansluiting (laptop en
  telefoon op dezelfde wifi delen die). De telefoon stuurt alleen iets als je op een knop
  drukt; de laptop alleen als het spel van stand verandert, hooguit één keer per seconde.
  Daarom staan de doelpunten tijdens een ronde niet op de telefoon maar op de muur. Een ronde
  kost zo'n vijf tot tien berichten: je kunt dus tientallen rondes per dag spelen. Wordt het
  ntfy.sh toch te druk, dan zeggen het paneel en de telefoon dat en proberen ze het vanzelf wat
  later opnieuw.
- **De code op de muur** staat er alleen buiten een ronde, nooit tijdens het aftellen of
  spelen. Hij zoekt een hoek zonder voorwerp, bak of ranglijst (hangt er later iets op, dan
  schuift hij op), en hij zit in wat het spel van zijn eigen licht verwacht: de camera ziet
  hem niet als voorwerp. `test/telefoon.mjs` bouwt dat na. Liever niet op de muur? Zet
  *Code ook op de muur* uit.
- **Werkt het niet?** Kijk wat het paneel en de telefoon over de verbinding zeggen. Zegt de
  telefoon "Het spel antwoordt niet" of "Geen antwoord": staat *Telefoon koppelen* nog aan, en
  heeft de laptop internet? Laat het spelvenster op de laptop open en zichtbaar; een
  weggeklikt tabblad draait niet door.
- Speel je online (GitHub Pages), dan wijst de code naar de `telefoon.html` die naast het spel
  staat. Vanaf `start.bat` of het losse bestand wijst hij naar
  https://noaquim.github.io/sticky-clash/telefoon.html — die hoort dus online te staan.
- Een eigen ntfy-server? Zet het adres in `TELEFOON_RELAY` bovenin `js/telefoon.js` én in
  `RELAY` in `telefoon.html`.

De QR-code maakt het spel zelf, zonder bibliotheek (`js/qr.js`, volgens de norm ISO/IEC
18004). `test/qr.mjs` leest elke code terug met een los geschreven decoder. Daarnaast is hij
nagemeten met OpenCV: van 300 codes leest de Aruco-detector er 300, en waar OpenCV's eigen
encoder hetzelfde masker kiest, is de code blokje voor blokje gelijk (op de restbits na, die
elke lezer overslaat).

## Kalibratie is niet optioneel

Zonder kalibratie weet het spel niet welke camerapixel bij welke beamerpixel hoort. Je
ziet je voorwerpen dan wél omlijnd in het camerabeeld, maar de ballen gaan er dwars
doorheen. Daarom staat er in dat geval een rode balk op de muur en in het paneel.

De automatische kalibratie werkt in twee stappen: eerst een volledig wit beeld, waarvan de
vier hoeken van het heldere vlak al een bruikbare meting geven — dat signaal is zo sterk
dat het ook in een verlichte kamer werkt. Daarna verfijnt hij met vier losse stippen, maar
alleen als die goed genoeg te zien zijn. Daarna projecteert hij twee seconden een groene
rand: die moet precies om het beamerbeeld vallen.

Lukt het niet, dan zegt hij erbij waaróm — te weinig contrast, of het beamervlak ligt niet
volledig in het camerabeeld.

## Als de herkenning tegenvalt

Zet het tabblad **"Wat het spel ziet"** aan boven het camerabeeld. Daar zie je precies wat
er als voorwerp geldt.

- **Te veel ruis** (de hele muur licht op) → schuif *Gevoeligheid* omláág, of leer de muur
  opnieuw. Gaat het licht aan of uit, dan zegt de teller dat vanzelf: "bijna alles wordt
  als voorwerp gezien".
- **Er wordt nog steeds een mens gezien** → schuif *Mensenfilter* omhoog, of *Max. grootte*
  omlaag. In het camerabeeld zie je met een rode stippellijn wat er al weggegooid wordt.
- **Een voorwerp wordt gezien maar doet niets** → de teller onder de speelmodus zegt er nu
  bij waaróm het genegeerd is: "loopt beeld uit", "te groot", "buiten beamervlak", "te
  hoog" of "mens". Staat er "mens" bij iets wat duidelijk een voorwerp is, zet dan
  *Mensenfilter* lager.
- **Voorwerpen worden niet gezien** → *Gevoeligheid* omhóóg, of *Min. grootte* omlaag. De
  teller zegt het er ook bij: staat er "3 vlekken te klein", dan ziet hij ze wel maar
  vallen ze onder de minimale grootte. Hangt de camera ver van de muur, dan worden post-its
  nu eenmaal klein in beeld.
- **Een briefje heeft een rode stippellijn met "huidkleur" of "donker of schaduw"** → het
  verdient nog vertrouwen. Laat het los en stap een stukje opzij; binnen anderhalve
  seconde telt het mee.
- **Er verschijnen vlekken waar de beamer iets projecteert** → hoort niet te gebeuren, het
  spel rekent zijn eigen licht eruit. Gebeurt het toch, zet dan "Voorwerpen omlijnen op de
  muur" uit.
- **Alles schuift na een tijdje** → camera of beamer verplaatst. Het spel merkt dat zelf
  en stelt alles opnieuw in (een ronde gaat dan even op pauze). Staat *Vanzelf opnieuw
  instellen* uit, klik dan *Meer instellingen → Kalibratie → Automatisch*.
- **Snap je niet wat er misgaat?** Klik op **Foto van wat de camera ziet** (onder de
  teller). Dat bewaart één plaatje met het camerabeeld en wat het spel als voorwerp ziet. Stuur die foto op: dan is precies te zien wat er gebeurt.
- **Veel doelpunten zonder dat je iets doet** → kijk naar de teller onder de speelmodus.
  Staat daar "0 voorwerpen actief", dan raakt er niets.
- **Niets komt in de bak** → sleep het doel dichter naar de baan van de ballen. In de
  rechter weergave pak je het doel door erin te klikken en te slepen; de balbron met
  <kbd>Ctrl</kbd>+klik. Dat werkt ook tijdens het spelen.
- **Zet witbalans en belichting van je camera vast** als dat kan. Automatische witbalans is
  de grootste oorzaak van wegvallende herkenning.
- Schaduwen worden automatisch genegeerd, maar bij zeer harde schaduwen helpt het om de
  ruimte gelijkmatiger te verlichten.

## Tests

```bash
node test/bench.mjs         # meetlat: nagebouwde opstelling, hoeveel wordt gevonden
node test/tracking.mjs      # volgen zonder glitches: kruisen, afdekken, arm ervoor
node test/regressie.mjs     # bugs uit de audit die nooit meer terug mogen komen
node test/physics.mjs       # ballen die vastlopen, wegschieten, door iets heen gaan
node test/herkenning.mjs    # schaduw, huid, vorm, lichtsprongen
node test/feedback.mjs      # het spel mag zichzelf niet verblinden
node test/spel.mjs          # scoren en ronde-verloop
node test/modi.mjs          # speciale briefjes, gouden ballen, bonusbak, levels, tips, ranglijst
node test/losbestand.mjs    # sticky-clash.html past bij de broncode
node test/briefjes.mjs      # zwart/bruin briefje onder warm licht, wat er al hing, twee naast elkaar
node test/extra.mjs         # soort briefje uit de kleur, camera verschoven, lichtmodel beamer, stille camera
node test/geluid.mjs        # muziek op de maat (nep-geluidskaart), geluiden niet te vaak, effecten met een grens
node test/app.mjs           # installeren als app: manifest, pictogrammen, offline, niet in het losse bestand
node test/qr.mjs            # QR-codes, teruggelezen met een eigen decoder
node test/telefoon.mjs      # bedienen met je telefoon: berichten, zuinig versturen, QR op de muur
node test/taal.mjs          # Engelse versie: alles vertaald, geen Nederlands buiten t(), telefoon.html
node test/gids.mjs          # ZELF AANPASSEN.txt en CUSTOMIZE.txt: elk stukje code staat echt in dat bestand
node test/speelplek.mjs     # drie speelplekken: welkomstkeuze, demo-opstelling (en speelt hij?), briefjes, scherm, camera ingesloten
```

Elke test in `tracking`, `regressie` en `physics` is een glitch die op de oude code
aantoonbaar optrad: gedraaid tegen de oude versie falen er 9 van tracking/regressie en 14
van physics.

`briefjes.mjs` is nagebouwd met de gemeten kleuren uit een echt camerabeeld waarop twee
briefjes niet gelezen werden, plus de keerzijde: handen die je stil in de lucht houdt en
het gezicht van iemand die stilstaat mogen nooit meetellen. Tegen de oude code falen 10
controles; met alleen "stil hangen" als regel (zonder trilling en lijf-ernaast) lekken de
hand en het gezicht (4 controles).

`bench.mjs` bouwt een camerabeeld na dat lijkt op een echte opstelling — muur met
structuur, beamerlicht, cameraruis, slagschaduwen, een passerend mens — met voorwerpen
van 8 tot 34 px. Dat is de maatstaf waartegen elke verandering aan de herkenning is
afgewogen.

## Hoe het werkt

| bestand | rol |
|---|---|
| [js/homography.js](js/homography.js) | 4-punts homografie camera → beamer |
| [js/vision.js](js/vision.js) | achtergrondsubtractie met schaduwonderdrukking, kleurherkenning, convexe omhullende per voorwerp |
| [js/game.js](js/game.js) | physics: cirkel tegen convexe veelhoek, scoren, tekenen |
| [js/audio.js](js/audio.js) | gesynthetiseerd geluid, geen audiobestanden |
| [js/muziek.js](js/muziek.js) | achtergrondmuziek, vooruit ingepland op de klok van de geluidskaart |
| [js/main.js](js/main.js) | wizard, automatische kalibratie, beamervenster, testmodus, welkomstkaartje en speelscherm |
| [js/speelplek.js](js/speelplek.js) | muur, scherm of demo: de keuze bij het opstarten, de briefjes van de demo, het speelveld op een scherm |
| [js/app.js](js/app.js) | installeren als app; meldt de service worker aan (nooit vanaf file://) |
| [sw.js](sw.js) | zonder internet spelen: altijd eerst het netwerk, anders de bewaarde kopie |
| [js/qr.js](js/qr.js) | QR-codes maken, zonder bibliotheek |
| [js/telefoon.js](js/telefoon.js) | bedienen met je telefoon: kamercode, berichten via ntfy.sh, QR-code op de muur |
| [telefoon.html](telefoon.html) | de pagina op de telefoon, alles in één bestand |
| [js/taal.js](js/taal.js) | de taalkeuze NL \| EN, en `t()` dat een Nederlandse zin vertaalt |
| [js/taal-en.js](js/taal-en.js) | het Engelse woordenboek: links Nederlands, rechts Engels |

### Zonder beamer: op een scherm en de demo

Op een scherm is het hele camerabeeld het speelveld. Er valt dus niets te kalibreren: de
omrekening van camera naar spel laat alles zoals het is (gespiegeld: links en rechts om),
en het spelveld krijgt de verhouding van het camerabeeld. Het camerabeeld wordt, iets
donkerder, onder het spel getekend. Omdat er geen beamer is, valt er ook geen licht van het
spel op de tafel: geen wit vlak bij het leren, geen muurverlichting, geen lichtvoorspelling.
Voor de herkenning is dat het makkelijke geval. Het mensenfilter werkt precies als op de
muur: een hand die van de rand van het beeld komt, telt nooit.

De demo gebruikt geen camera. De briefjes zijn gewone obstakels die je met de muis of je
vinger sleept en tekent; het spel tekent ze als gekleurd papier. De beginopstelling
(`demoOpstelling` in `js/speelplek.js`) is een baan die al half werkt: test/speelplek.mjs
laat hem een minuut spelen en kijkt of een deel van de ballen de bak haalt, en of de
trampoline, de turbo en de blauwe muur allemaal meedoen.

### Het spel verblindde zichzelf

De grootste vondst bij het doormeten: het spel projecteerde een oplichtende lijn **bovenop**
het voorwerp dat het aan het meten was, en zette die cellen vervolgens hard uit. Een post-it
van 5×5 cellen hield er nog 9 van de 25 over — onder de minimale grootte. Detecteren →
omlijnen → kwijtraken → omlijning weg → detecteren, een paar keer per seconde.

Op dit detailniveau kun je geen licht náást een post-it tekenen zonder hem te raken: de
veiligheidsmarge rond de lichtvoorspelling is al breder dan het briefje. Daarom staat
"Voorwerpen omlijnen op de muur" in voorwerpmodus standaard uit, is de gloed eromheen weg
en valt het licht dat er nog is naast het voorwerp. Op je laptop zie je de omlijningen
altijd. `test/feedback.mjs` legt het verschil vast: 16 voorgrondcellen zonder projectie
erop, 0 met.

### Door de ballen heen kijken

Tijdens het leren van de muur flitst het spel één keer kort wit. Zo meet het per plek op de
muur hoeveel licht de beamer daar geeft. Vallen er daarna ballen over een briefje, dan weet
het spel hoeveel lichter dat stukje daardoor wordt en rekent het dat eraf: het briefje
blijft een briefje.

Een camera die weinig ruist (een goede webcam, een rustige kamer) krijgt vanzelf een lagere
drempel, zodat ook bleke briefjes gevonden worden. Die lagere drempel geldt alleen voor een
los voorwerp en niet in het donker, zodat camerakorrel geen vlekken geeft.

### Beeld bijsnijden tot het beamervlak

De camera ziet ook plafond, zijmuur en bureau; daar ligt nooit een voorwerp. Zodra de
kalibratie klaar is wordt het werkbeeld bijgesneden tot het beamervlak plus 12% marge. Een
post-it groeit daarmee van ongeveer 5×5 naar 10×15 cellen — en daar hing elke drempel vanaf.
In de meetlat is dit het verschil tussen 4 van de 5 en **5 van de 5** gevonden voorwerpen.

De homografie is daarom gedefinieerd op het volledige camerabeeld, genormaliseerd naar 0..1,
zodat een andere uitsnede hem niet ongeldig maakt.

### Schaduw en huid: merken in plaats van wissen

Eerst werden schaduwcellen en huidcellen meteen weggegooid. Dat sloopte twee dingen: een
grijs boek ziet er per cel precies zo uit als een schaduw en verdween dus volledig, en bij
een mens werden hoofd en handen weggeponst zodat er een compacte romp overbleef die er
juist als een voorwerp uitzag. Nu worden ze alleen gemárkeerd; de beslissing valt op
vlekniveau:

- **schaduw** — verdacht als meer dan 40% van de vlek schaduwkleurig is (donkerder, met de
  tint van de muur).
- **huid** — verdacht als de vlek zelf grotendeels huid is, gemeten tegen de kleur van de
  muur op die plek (anders is onder warm licht alles huid).
- verdacht is nog geen afgekeurd: wat vertrouwen verdient (stil, niet trillen, geen lijf
  ernaast) telt mee. Gevonden op een echte opstelling met een zwart en een bruin briefje
  onder een gele lamp: beide werden als "huid" weggegooid.
- **vorm** — massiefheid: hoeveel van de omhullende echt gevuld is. Een post-it, boek of
  doos zit boven 0,9; een geknikte arm rond 0,66.

### Meebewegen met het licht

Een globale lichtsprong (lamp aan, of de camera stelt zijn belichting bij) wordt geschat op
de mediaan van een steekproef en weggerekend. Getest van 25% donkerder tot 25% lichter:
geen spookvlekken, en een voorwerp blijft zichtbaar. Voorheen viel bij donkerder licht álle
herkenning stil zónder waarschuwing, omdat het hele beeld als schaduw werd weggegooid.

### Volgen zonder glitches

Het koppelen van vlekken aan voorwerpen gebruikt ideeën uit SORT, ByteTrack en Norfair,
teruggebracht tot wat hier meetbaar hielp:

- **globaal koppelen** op afstand, in plaats van spoor voor spoor — anders pakte een
  voorwerp dat even wegviel de vlek van zijn buurman, en gleden obstakels over elkaar
- **voorspellen** waar een bewegend voorwerp nu is, met een zoekgebied dat meeschaalt
- **vasthouden** bij samensmelten (twee post-its tegen elkaar) of gedeeltelijk afdekken
  (arm ervoor), met hysterese zodat hij pas loslaat als het voorwerp weer heel is
- een **afgedekt** voorwerp blijft staan, een **weggehaald** voorwerp verdwijnt binnen een
  kwart seconde — het verschil is of er nog voorgrond op zijn plek staat
- een net verdwenen voorwerp dat op dezelfde plek terugkomt krijgt **zijn oude identiteit**
  terug

En in het masker: **hysterese**. Een cel die duidelijk anders is dan de muur is een zaadje;
vanuit zaadjes mag een voorwerp uitgroeien in cellen die maar half zo duidelijk zijn —
precies de randcellen die een voorwerp half bedekt. Markergestuurd, zodat een post-it niet
vastgroeit aan iemand die ernaast staat, en met een vangnet dat groeien uitzet als het licht
zo verandert dat de halve muur "half duidelijk" wordt.

Hysterese in de tijd (een cel die aan was blijft aan zolang hij boven 70% van de drempel
zit) mag een voorwerp heel houden, maar **geen brug slaan tussen twee voorwerpen die we al
kennen**. Anders kroop het smalle strookje tussen twee briefjes die vlak onder elkaar
hangen langzaam dicht: één keer ruis erboven en de hysterese hield het vast. Dan werden
ze één vlek, hield de tracker ze allebei vast, en las hij de samengesmolten vorm daarna
even als mens. Gemeten over vijf keer vijf seconden: eerst 433 van de 650 beelden mis,
nu 2 (één beeld ruis, netjes overbrugd).

Blijft een samensmelting wél (je plakt een briefje recht tegen een ander aan), dan neemt
het spoor na anderhalve seconde de nieuwe vorm over als een bekende sprong, in plaats van
die als ademende omtrek — oftewel een mens — te lezen.

### Physics die niet hapert

Dezelfde vangnetten als Box2D en Rapier: een bal die in een net verschenen obstakel zit
wordt er met begrensde snelheid uitgeduwd in plaats van weggeteleporteerd; trage botsingen
stuiteren niet (anders huppelt een bal eindeloos op een trillend boek); obstakels volgen
de camera **kinematisch**, zodat ze tussen twee camerabeelden vloeiend bewegen en een
geveegd voorwerp de bal echt meeneemt; en het aantal substappen groeit mee met de snelheid.
Ballen die ergens vastliggen worden na 2,5 seconde opgeruimd — voorheen stapelden ze zich
op tot er halverwege de ronde geen nieuwe meer vielen.

### Wat er bewust níét in zit

Een onderzoek langs MediaPipe, TensorFlow.js, OpenCV.js, ArUco en een stapel
projector-camerasystemen leverde één duidelijke conclusie: **OpenCV.js is 10,9 MB** voor
dingen die hier veertig regels JavaScript zijn, en zijn adaptieve achtergrondmodellen zijn
precies verkeerd — die zouden een post-it die blijft hangen binnen seconden opslokken.
MediaPipe's persoonssegmentatie (244 KB model, 3,4 MB runtime) is het enige dat
handgeschreven code echt niet kan, maar de metingen spreken elkaar tegen over of het model
post-its ten onrechte voor mensen aanziet. Dat staat daarom als mogelijkheid genoteerd, niet
als afhankelijkheid: alles hierboven werkt zonder één externe bibliotheek.

Drie dingen die het bijzonder maken:

- **Automatische kalibratie** — eerst een volledig wit vlak (sterk signaal, werkt ook in een
  verlichte kamer), daarna om beurten vier witte stippen ter verfijning. Per beeld wordt
  vergeleken met een zwart referentiebeeld; het zwaartepunt van het verschil is de stip.
- **De omlijning staat stil en valt toch strak om het voorwerp** — een voorwerp wordt niet
  als lijst hoekpunten bijgehouden maar als zestien steunafstanden: voor elk van zestien
  richtingen de verste cel. Dat zijn altijd precies zestien getallen, ook als de vlek per
  frame anders rafelt, en die kun je dus wél middelen. De richtingen draaien mee met de
  langste as van het voorwerp. De marge van celmiddelpunt naar rand volgt de vorm van een
  vierkantje (een cel steekt schuin √2 keer zo ver uit als recht opzij). Gemeten over 45
  gevallen — vijf maten, drie hoeken, drie uitlijningen op het raster — zit de omlijning
  gemiddeld 5% ruimer dan het voorwerp; de meetlat met uitsnede meet +1%.
- **Het spel rekent zijn eigen projectie weg** — zonder dat zou het spel zijn eigen licht
  op de muur voor een voorwerp aanzien en zichzelf in een lus praten. Elke frame wordt de
  geprojecteerde afbeelding op klein formaat nagespeeld en via de homografie op de
  cameracellen gelegd, zodat de drempel daar meebeweegt.

In de console is alles bereikbaar via `window.sc` (`sc.game`, `sc.vision`, `sc.app`).
