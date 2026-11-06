import { Vision, DEFAULT_CLASSES, inConvex } from './vision.js';
import { computeHomography, applyH, invertH } from './homography.js';
import { kalNaarBeamer, kalNaarCamera, kalZetLens, kalLensVan, kalRaster } from './kalibratie.js';
import { Game, normalizePoly } from './game.js';
import { Sfx } from './audio.js';
import { startApp } from './app.js';
import { Telefoon } from './telefoon.js';
import { t, tAantal, tHerkomst, huidigeTaal, zetTaal, opTaal, vertaalPagina, TaalTeller } from './taal.js';
import { SPEELPLEKKEN, DEMO_KLEUREN, DEMO_SPECIAAL, DEMO_MAX, SPEL_ADRES, bepaalSpeelplek, bewaarSpeelplek, schermHomografie, pasVeld, demoOpstelling,
  briefjeUitSleep, briefjeOp, kruisjeVan, schuifBriefje, briefjesMee, demoMee, dubbeltik, cameraReden, eigenTabblad } from './speelplek.js';
import { vsElement, vsKan, vsAan, vsUit, isIOS, apartVensterKan, besturing } from './apparaat.js';
import { Kwaliteit, kwaliteitBijStart, inStapjes } from './kwaliteit.js';
import { OMGEVING, Omgevingswacht, versnelOmgeving, mensachtig, telAlsVoorwerp, nieuweKleurstand, kleurStap, kleurOordeel, samenOmtrekken } from './omgeving.js';

const $ = (id) => document.getElementById(id);
// Wat deze computer kan (zie js/apparaat.js). Niet de naam van de browser: Firefox en Safari
// spelen alles, ze kunnen alleen het beamerscherm niet zelf vinden.
const SCHERMEN_HERKENNEN = 'getScreenDetails' in window;   // Chrome en Edge
const OP_IOS = isIOS(navigator);                           // iPhone of iPad, in welke browser ook
const APART_VENSTER = apartVensterKan(window);              // geen tablet: het beamervenster kan apart
const BESTURING = besturing(navigator);                     // alleen voor de juiste tip
const CAL_TARGETS = [[0.08, 0.10], [0.92, 0.10], [0.92, 0.90], [0.08, 0.90]];
const STORE = 'stickyclash.v5';
const STORE_OLD = 'stickyclash.v4';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const vision = new Vision();
const sfx = new Sfx();
const game = new Game(sfx);

const app = {
  H: null,
  Hinv: null,
  calPts: [],
  calibrating: false,
  calPattern: null,
  learning: -1,
  pickGoal: false,
  debugView: 'video',
  proj: null,
  projCtx: null,
  testMode: false,
  testNotes: [],
  drag: null,
  dragGoal: false,
  dragSource: false,
  wiz: null,
  busy: false,
  abort: false,
  goalTrack: null,
  noPeople: true,
  special: true,          // rood/groen/blauw briefje = trampoline/turbo/breekbaar
  gold: true,             // gouden ballen
  bonus: true,            // kleine bonusbak
  levels: false,          // spelvorm Uitdaging
  autoRecal: true,        // camera of beamer verschoven: vanzelf opnieuw instellen
  lastName: '',
  pendingScore: null,
  reasonById: new Map(),  // per spoor waarom het (niet) meetelt, voor de diagnosefoto
  resident: true,         // wat al aan de muur hing toen hij geleerd werd, telt mee
  useRoi: true,           // werkbeeld bijsnijden tot het beamervlak
  maxFrac: 0.35,          // ruim vangnet; geen speelvoorwerp is een derde van de muur
  stableNeed: 0,          // frames stilstaan voordat het meetelt (0 = meteen)
  rejected: 0,
  active: 0,
  rejectIds: new Set(),
  reasons: {},
  projCells: 0,
  projCellsFor: null,
  best: { object: 0, color: 0, demo: 0 },
  steps: { proj: 0, cam: 0, cal: 0, bg: 0, goal: 0 },
  lastVideoTime: -1,
  videoStill: 0,
  stillWarned: false,
  camId: '',
  camChosen: false,       // zelf een camera gekozen? Dan niet meer automatisch wisselen
  calCam: '',
  syncTip: null,
  projFull: false,        // staat het beamervenster op volledig scherm?
  fill: 0.25,             // muurverlichting door de beamer, 0..1
  fillAuto: true,         // bij instellen zelf afstellen
  lockExposure: false,    // camerabelichting vastzetten (standaard uit, zie vision.js)
  ingesteld: false,       // al eens alles automatisch ingesteld (de knop heet dan anders)
  camLuma: -1,            // hoe helder de camera het beamervlak ziet
  // Waar je speelt (zie js/speelplek.js): 'muur' (webcam en beamer), 'scherm' (de camera
  // kijkt naar een tafel, het spel staat op dit scherm) of 'demo' (zonder camera).
  speelplek: 'muur',
  plekGekozen: false,     // zelf gekozen? Anders staat het welkomstkaartje er
  muurH: null,            // de kalibratie van de beamer, bewaard zolang je op een scherm speelt
  schermSpiegel: null,    // op een scherm: links en rechts om (null = nog nooit gekozen)
  svOpen: false,          // het speelscherm over het hele venster
  demoBriefjes: [],       // de briefjes van de demo, in wereldcoördinaten
  demoW: 0,               // hoe breed het veld was toen ze neergelegd werden (0 = nog niet)
  demoKleur: 'los',       // wat je in de demo tekent: 'los' (gewone kleur) of een soort
  sleep: null,            // wat je in het speelveld vasthoudt met de muis of je vinger
  tik: null,              // de vorige tik op een briefje, voor een dubbeltik
  camReden: null,         // waarom de camera hier niet kan (zie cameraReden), of null
  camGeweigerd: false,    // de browser weigerde de camera al eens
  popupNiet: false,       // het beamervenster mocht hier niet open (ingesloten venster)
  beeldNr: 0,             // zoveel echte camerabeelden kwamen binnen (zie volgCamerabeelden)
  beeldT: 0,              // wanneer het laatste (performance.now), 0 = dat kan deze browser niet
  verwerktNr: -1,         // het camerabeeld dat de herkenning het laatst zag
  calVoor: null,          // { w, h } van het beamervenster bij de laatste kalibratie
  halfIngesteld: false,   // de wizard bleef steken na de camera (beamervenster niet op de beamer?)
  wachtBeamer: false,     // de wizard wacht tot het beamervenster op de beamer staat
  verder: false,          // daarop geklikt: niet langer wachten
  kanVastzetten: true,    // kan deze camera (en browser) de belichting vastzetten?
  elkeMinuut: true,       // elke minuut controleren of het licht of de muur veranderd is
  kleurFill: 0,           // zoveel muurverlichting hadden de kleuren nodig (zie kleurLicht)
  kleurOpgegeven: false,  // feller ging niet, en de kleuren bleven onbetrouwbaar
  autoPauze: false,       // de ronde ging vanzelf op pauze om bij te stellen
  melding: null,          // korte melding op de muur: { nl, vars, tot } (zie muurMelding)
  onderhoud: [],          // wat er vanzelf bijgesteld werd: { reden, ok, t } (voor de tests)
};

const debug = $('debug');
const dctx = debug.getContext('2d');
const world = $('world');
const wctx = world.getContext('2d');

// klein doek waarop we onze eigen projectie naspelen, zodat de herkenning
// ons eigen licht niet voor een voorwerp aanziet
const projBuf = document.createElement('canvas');
const pbctx = projBuf.getContext('2d', { willReadFrequently: true });
let projLumaArr = null;
let projSignedArr = null;     // hoeveel feller dan de muurverlichting, 0..1
const PRED_H = 144;   // resolutie van de lichtvoorspelling; te laag mist dunne lijnen

// ---------------------------------------------------------------- opslag

function save() {
  try {
    localStorage.setItem(STORE, JSON.stringify({
      // op een scherm is app.H het camerabeeld zelf; de kalibratie van de beamer is muurH
      H: app.speelplek === 'scherm' ? app.muurH : app.H,
      lens: kalLensVan(app.speelplek === 'scherm' ? app.muurH : app.H),
      speelplek: bewaarSpeelplek(app.speelplek, app.plekGekozen),
      schermSpiegel: app.schermSpiegel,
      classes: vision.classes,
      mirror: vision.mirror,
      mode: vision.mode,
      noPeople: app.noPeople,
      special: app.special, gold: app.gold, bonus: app.bonus, levels: app.levels,
      autoRecal: app.autoRecal, elkeMinuut: app.elkeMinuut, lastName: app.lastName,
      resident: app.resident,
      skin: vision.skinFilter,
      maxSize: +$('maxSize').value,
      stable: +$('stable').value,
      sens: +$('sens').value,
      roundLen: +$('roundLen').value,
      gravity: +$('gravity').value,
      bounce: +$('bounce').value,
      rate: +$('rate').value,
      minSize: +$('minSize').value,
      endless: game.endless,
      moveSource: $('moveSource').checked,
      moveGoal: $('moveGoal').checked,
      srcSpeed: +$('srcSpeed').value,
      goalSpeed: +$('goalSpeed').value,
      wind: +$('wind').value,
      outline: $('outline').checked,
      sound: $('sound').checked, muziek: $('muziek').checked, effecten: $('effecten').checked,
      muziekStijl: $('muziekStijl').value,
      strict: +$('strict').value,
      camId: app.camId || '',
      camChosen: app.camChosen,
      fill: app.fill,
      fillAuto: app.fillAuto,
      lockExposure: app.lockExposure,
      calCam: app.calCam || '',
      best: app.best,
    }));
  } catch { /* opslag kan geblokkeerd zijn */ }
}

function load() {
  try {
    // Het celraster is fijner geworden, dus oude grootte-instellingen kloppen niet
    // meer. Uit een oude opslag nemen we alleen mee wat nog wel geldig is: de
    // kalibratie en de aangeleerde kleuren.
    let s = JSON.parse(localStorage.getItem(STORE) || 'null');
    if (!s) {
      const old = JSON.parse(localStorage.getItem(STORE_OLD) || 'null')
        || JSON.parse(localStorage.getItem('stickyclash.v2') || 'null');
      // H bewust NIET overnemen: die was in andere eenheden gedefinieerd.
      if (old) s = { classes: old.classes, mirror: old.mirror, mode: old.mode, best: old.best };
    }
    if (!s) return;
    if (s.H) { app.H = s.H; kalZetLens(app.H, s.lens); app.Hinv = invertH(s.H); app.steps.cal = 1; }
    if (s.classes) {
      vision.classes = DEFAULT_CLASSES.map(d => {
        const f = s.classes.find(c => c.id === d.id);
        return f ? { ...d, ...f } : { ...d };
      });
    }
    vision.mirror = !!s.mirror;
    if (s.mode) vision.mode = s.mode;
    for (const k of ['sens', 'roundLen', 'gravity', 'bounce', 'rate', 'minSize', 'maxSize', 'stable', 'srcSpeed', 'goalSpeed', 'wind', 'strict']) {
      if (s[k] != null) $(k).value = s[k];
    }
    if (s.noPeople != null) { app.noPeople = s.noPeople; $('noPeople').checked = s.noPeople; }
    if (s.skin != null) { vision.skinFilter = s.skin; $('skin').checked = s.skin; }
    if (s.resident != null) { app.resident = s.resident; $('resident').checked = s.resident; }
    for (const k of ['special', 'gold', 'bonus', 'autoRecal', 'elkeMinuut']) {
      if (s[k] != null) { app[k] = !!s[k]; $(k).checked = app[k]; }
    }
    if (s.levels != null) { app.levels = !!s.levels; $('spelvorm').value = app.levels ? 'levels' : 'vrij'; }
    if (typeof s.lastName === 'string') app.lastName = s.lastName;
    if (s.endless != null) { game.endless = s.endless; $('endless').checked = s.endless; }
    if (s.moveSource != null) $('moveSource').checked = s.moveSource;
    if (s.moveGoal != null) $('moveGoal').checked = s.moveGoal;
    if (s.outline != null) $('outline').checked = s.outline;
    for (const k of ['sound', 'muziek', 'effecten']) if (s[k] != null) $(k).checked = !!s[k];
    if ([...$('muziekStijl').options].some(o => o.value === s.muziekStijl)) $('muziekStijl').value = s.muziekStijl;
    if (s.best) app.best = { object: s.best.object | 0, color: s.best.color | 0, demo: s.best.demo | 0 };
    if (typeof s.schermSpiegel === 'boolean') app.schermSpiegel = s.schermSpiegel;
    if (s.camId) app.camId = s.camId;
    if (s.camChosen != null) app.camChosen = !!s.camChosen;
    if (typeof s.fill === 'number') app.fill = s.fill;
    if (s.fillAuto != null) app.fillAuto = s.fillAuto;
    if (s.lockExposure != null) app.lockExposure = s.lockExposure;
    if (s.calCam) app.calCam = s.calCam;
  } catch { /* stille val-terug op standaardwaarden */ }
}

/**
 * Welke speelplek, nog vóór load(): wie niets bewaard heeft krijgt het welkomstkaartje, wie
 * al met een beamer speelde niet (zie bepaalSpeelplek in js/speelplek.js).
 */
function laadSpeelplek() {
  let s = null, oud = false;
  try {
    s = JSON.parse(localStorage.getItem(STORE) || 'null');
    oud = !!(localStorage.getItem(STORE_OLD) || localStorage.getItem('stickyclash.v2'));
  } catch { /* opslag geblokkeerd of kapot: dan als een nieuwe speler */ }
  const k = bepaalSpeelplek(s, oud);
  app.speelplek = k.plek || 'muur';
  app.plekGekozen = !k.welkom;
}

// De laatste melding in de statusregel: uit welke zin, om hem na het wisselen van taal
// opnieuw te vertalen (zie nieuweTaal).
let statusBron = null;

/** Melding bovenin. msg is een vertaalde tekst: status(t('Doel gezet'), 'ok'). */
function status(msg, kind) {
  const el = $('status');
  el.textContent = msg;
  el.className = 'status' + (kind ? ' ' + kind : '');
  // ook bovenin het speelscherm, dat het paneel afdekt
  const sv = $('svStatus');
  sv.textContent = msg;
  sv.className = 'sv-status' + (kind ? ' ' + kind : '');
  const h = tHerkomst(msg);
  statusBron = h ? { nl: h.nl, vars: h.vars, kind } : null;
}

function step(k, v) {
  app.steps[k] = v;
  // Camera en geleerd staan ook in het lijstje van spelen op een scherm.
  document.querySelectorAll('.steps li[data-k="' + k + '"]').forEach(li => {
    li.classList.toggle('on', v === 1);
    li.classList.toggle('busy', v === 2);
  });
}

function refreshSteps() { for (const k in app.steps) step(k, app.steps[k]); }

const projOk = () => !!(app.proj && !app.proj.closed && app.projCtx);

/**
 * Kalibreren, muur leren en de wizard mogen nooit door elkaar lopen: een dubbelklik
 * of een venster dat van formaat verandert startte anders twee kalibraties die
 * elkaars beamerbeeld overschreven. En een fout mag de knoppen niet voor altijd op
 * "bezig" laten staan.
 */
async function runExclusive(fn) {
  if (app.busy) return false;
  app.busy = true; app.abort = false;
  setBusyUi(true);
  try {
    return await fn();
  } catch (e) {
    status(t('Er ging iets mis: {fout}', { fout: e && e.message ? e.message : e }), 'err');
    return false;
  } finally {
    app.wiz = null;
    app.calPattern = null;
    app.busy = false;
    setBusyUi(false);
    syncStepsFromState();
  }
}

function setBusyUi(on) {
  for (const id of ['btnAuto', 'btnCalAuto', 'btnCal', 'btnBg', 'btnGoal', 'btnCam', 'btnScreens', 'btnScherm', 'btnSchermLeer', 'svLeer']) {
    const el = $(id);
    if (el) el.disabled = on;
  }
  // niet van speelplek wisselen midden in het instellen
  document.querySelectorAll('#plekSeg button').forEach(b => { b.disabled = on; });
  $('btnAbort').classList.toggle('hidden', !on);
}

/** Stappenlijst gelijktrekken met de werkelijkheid, ook na afbreken of een fout. */
function syncStepsFromState() {
  step('proj', projOk() ? 1 : 0);
  step('cam', vision.ready ? 1 : 0);
  step('cal', app.H ? 1 : 0);
  step('bg', vision.hasBackground ? 1 : 0);
  if (app.steps.goal === 2) step('goal', 0);
  toonSchermKnop();
}

/**
 * Camerapixel (in het bijgesneden werkbeeld) naar beamervlak. De homografie is
 * gedefinieerd op het VOLLEDIGE camerabeeld, genormaliseerd naar 0..1, zodat een
 * andere uitsnede hem niet ongeldig maakt.
 */
function toProj(x, y) {
  const c = vision.camNorm(x, y);
  return kalNaarBeamer(app.H, c[0], c[1]);
}

/** En terug: plek op het beamervlak naar camerapixel in het werkbeeld. */
function fromProj(u, v) {
  const c = kalNaarCamera(app.H, app.Hinv, u, v);
  return vision.camPx(c[0], c[1]);
}


// ---------------------------------------------------------------- camera

// Ingebouwde laptopcamera's kijken naar jou, niet naar de muur. Een losse webcam heeft
// daarom voorrang, en een virtuele camera (OBS e.d.) komt als laatste.
const INGEBOUWD = /integrated|built-?in|facetime|internal|ingebouwd|front|user[ -]?facing|truevision|ir camera/i;
const VIRTUEEL = /virtual|obs|xsplit|snap camera|manycam/i;
let bekendeCams = null;       // deviceIds die we al eens zagen, om een nieuwe webcam te merken

function camRang(d) {
  const l = d.label || '';
  return VIRTUEEL.test(l) ? 2 : (INGEBOUWD.test(l) ? 1 : 0);
}

/** Welke camera zouden we kiezen als niemand iets gekozen heeft? */
function besteCamera(devs) {
  if (!devs.length) return '';
  return devs.slice().sort((a, b) => camRang(a) - camRang(b))[0].deviceId;
}

async function fillDevices() {
  const devs = await vision.devices();
  const sel = $('camSelect');
  const cur = sel.value;
  sel.innerHTML = '';
  const auto = document.createElement('option');
  auto.value = '';
  auto.textContent = t('Automatisch — losse webcam als die er is');
  sel.appendChild(auto);
  devs.forEach((d, i) => {
    const o = document.createElement('option');
    o.value = d.deviceId;
    const naam = d.label || t('Camera {n}', { n: i + 1 });
    o.textContent = camRang(d) === 1 ? t('{naam} (ingebouwd)', { naam }) : naam;
    sel.appendChild(o);
  });
  const ids = devs.map(d => d.deviceId);
  sel.value = app.camChosen && ids.includes(app.camId) ? app.camId : (ids.includes(cur) ? cur : '');
  return devs;
}

/** De camera die we nu moeten gebruiken: wat je zelf koos, anders de beste. */
async function gewensteCamera() {
  const devs = await vision.devices();
  const ids = devs.map(d => d.deviceId);
  const gekozen = $('camSelect').value;
  if (gekozen && ids.includes(gekozen)) return gekozen;
  if (app.camChosen && ids.includes(app.camId)) return app.camId;
  return besteCamera(devs) || app.camId || undefined;
}

/** De hele melding als de camera niet wil starten. */
function cameraFout(e) {
  const n = e && e.name;
  if ((n === 'NotAllowedError' || n === 'SecurityError') && ingesloten()) {
    return t('Camera mislukt: in een ingesloten venster mag het spel de camera niet gebruiken — open het spel in een eigen tabblad');
  }
  // Houdt de computer zelf de camera tegen (de privacy-instellingen van Windows of macOS),
  // dan helpt het camera-icoon in de browser niet. Chrome en Edge zeggen dat erbij.
  if (n === 'NotAllowedError' && /system/i.test((e && e.message) || '')) return systeemCameraTekst();
  if (n === 'NotAllowedError' || n === 'SecurityError') return t('Camera mislukt: de camera mag niet — klik in de adresbalk op het camera-icoon, zet de camera op Toestaan (in Firefox: haal de blokkade weg met ×) en probeer opnieuw');
  if (n === 'NotReadableError' || n === 'AbortError') {
    if (BESTURING === 'windows') return t('Camera mislukt: de camera is bezet of staat uit — sluit Teams, Zoom, OBS of de Camera-app. Helpt dat niet: Instellingen > Privacy en beveiliging > Camera, en zet de toegang voor bureaublad-apps aan');
    if (BESTURING === 'mac') return t('Camera mislukt: de camera is bezet of staat uit — sluit Teams, Zoom, OBS of FaceTime. Helpt dat niet: Systeeminstellingen > Privacy en beveiliging > Camera, en zet je browser aan');
    return t('Camera mislukt: de camera is bezet — sluit Teams, Zoom, OBS of de Camera-app en probeer opnieuw');
  }
  if (n === 'NotFoundError' || n === 'OverconstrainedError') return t('Camera mislukt: geen camera gevonden — sluit je webcam aan');
  if (e && e.message) return t('Camera mislukt: {fout}', { fout: e.message });
  return t('Camera mislukt: onbekende fout');
}

/** De computer zelf houdt de camera tegen: waar je dat op dit besturingssysteem verandert. */
function systeemCameraTekst() {
  if (BESTURING === 'mac') return t('Camera mislukt: je Mac houdt de camera tegen — Systeeminstellingen > Privacy en beveiliging > Camera, zet je browser aan en start de browser opnieuw');
  if (BESTURING === 'windows') return t('Camera mislukt: Windows houdt de camera tegen — Instellingen > Privacy en beveiliging > Camera, en zet de toegang voor apps en bureaublad-apps aan');
  return t('Camera mislukt: je computer houdt de camera tegen — kijk in de privacy-instellingen of de browser de camera mag gebruiken');
}

/**
 * Hoe groot de camera moet starten. Een trage computer (stand 2 of hoger, zie
 * js/kwaliteit.js) vraagt een kleiner beeld: de herkenning werkt toch op 426×240, en zo hoeft
 * er per beeld veel minder verkleind te worden. Op de muur iets ruimer, omdat het beeld daar
 * nog tot het beamervlak bijgesneden wordt. Anders null: 1280×720, zoals altijd.
 */
function cameraMaat() {
  if (kw.niveau < 2) return null;
  return app.speelplek === 'scherm' ? { w: 640, h: 360 } : { w: 960, h: 540 };
}

/**
 * Nieuwe camerabeelden tellen. video.currentTime loopt in Chrome en Firefox elk beeldje
 * door, ook als de camera geen nieuw beeld gaf: dan werd hetzelfde beeld twee keer
 * herkend, en merkte niemand dat de camera stil stond. requestVideoFrameCallback zegt het
 * wél precies. Browsers zonder (oudere Safari) gebruiken gewoon currentTime, zie frame().
 */
function volgCamerabeelden() {
  app.beeldNr = 0; app.beeldT = 0; app.verwerktNr = -1;
  const v = vision.video, stroom = vision.stream;
  if (!stroom || typeof v.requestVideoFrameCallback !== 'function') return;
  const opBeeld = () => {
    if (vision.stream !== stroom) return;          // een andere camera telt zelf
    app.beeldNr++; app.beeldT = performance.now();
    v.requestVideoFrameCallback(opBeeld);
  };
  v.requestVideoFrameCallback(opBeeld);
}

async function startCamera() {
  // De demo vraagt nooit om de camera: daar is hij juist voor.
  if (app.speelplek === 'demo') return false;
  if (!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)) {
    bekijkCamera();
    status(camRedenTekst(app.camReden || 'geen-api'), 'err');
    return false;
  }
  step('cam', 2);
  try {
    const wil = await gewensteCamera();
    const label = await vision.start(wil, cameraMaat());
    debug.width = vision.vw; debug.height = vision.vh;
    applySliders();
    await fillDevices();
    const track = vision.stream && vision.stream.getVideoTracks()[0];
    const id = track && track.getSettings ? track.getSettings().deviceId : '';
    if (app.camChosen && id && !(wil && wil !== id)) $('camSelect').value = id;
    // Pas na toestemming kent de browser de namen van de camera's. Nu pas is te zien of
    // er een losse webcam is naast de ingebouwde; staat de ingebouwde aan, dan wisselen.
    if (!app.camChosen && !startCamera.nogmaals) {
      const beste = besteCamera(await vision.devices());
      if (beste && id && beste !== id) {
        startCamera.nogmaals = true;
        try { return await startCamera(); } finally { startCamera.nogmaals = false; }
      }
    }
    if (wil && id && wil !== id) {
      status(t('De gekozen camera deed het niet (bezet?) — nu: {naam}', { naam: label }), 'err');
    }
    // Na een camerawissel of herstart hoort de uitsnede weer bij de kalibratie. (Op een
    // scherm is er geen kalibratie en geen uitsnede: het hele beeld is het speelveld.)
    if (app.H && app.speelplek === 'muur') {
      applyRoi();
      if (app.calCam && id && app.calCam !== id) {
        status(t('Andere camera dan bij de kalibratie — klik "Alles automatisch instellen"'), 'err');
      }
    }
    if (track) {
      // Uitgetrokken of door een ander programma overgenomen: dat moet je zien.
      track.addEventListener('ended', () => {
        vision.ready = false;
        step('cam', 0);
        status(t('De camera is weggevallen — controleer de kabel en klik "Camera starten"'), 'err');
      });
    }
    // Een camera kan een handmatige belichting uit een vorige sessie onthouden. Altijd
    // eerst terug naar automatisch, anders blijft het beeld misschien te donker.
    if (!app.lockExposure) {
      await vision.unlockCamera();
      // Controleren of het gelukt is. Een camera die nog op handmatige belichting of
      // witbalans staat, geeft een te donker of verkleurd beeld.
      const st = track && track.getSettings ? track.getSettings() : {};
      if (st.exposureMode === 'manual' || st.whiteBalanceMode === 'manual') {
        status(t('De camera staat nog op vaste belichting — trek de camera er even uit en weer in'), 'err');
      }
    }
    // Kan deze camera de belichting vastzetten? Firefox en Safari bieden dat niet aan, en
    // veel camera's ook niet: dan geen vinkje dat stil niets doet.
    const kan = track && track.getCapabilities ? track.getCapabilities() : null;
    app.kanVastzetten = !!(kan && ((kan.exposureMode && kan.exposureMode.includes('manual')) ||
      (kan.whiteBalanceMode && kan.whiteBalanceMode.includes('manual'))));
    toonVastzetHint();
    if (!(app.camChosen && wil && id && wil !== id)) app.camId = id || app.camId;
    app.lastVideoTime = -1; app.videoStill = 0;
    volgCamerabeelden();
    step('cam', 1);
    save();
    if (!(wil && id && wil !== id) && !(app.speelplek === 'muur' && app.H && app.calCam && id && app.calCam !== id)) status(t('Camera actief: {naam}', { naam: label }), 'ok');
    bekendeCams = new Set((await vision.devices()).map(d => d.deviceId));
    if (app.camGeweigerd) { app.camGeweigerd = false; bekijkCamera(); }
    return true;
  } catch (e) {
    step('cam', 0);
    if (e && (e.name === 'NotAllowedError' || e.name === 'SecurityError')) { app.camGeweigerd = true; bekijkCamera(); }
    status(cameraFout(e), 'err');
    return false;
  }
}

// Webcam in- of uitgeplugd terwijl het spel openstaat.
async function cameraGewisseld() {
  const devs = await fillDevices();
  const nu = new Set(devs.map(d => d.deviceId));
  const vorige = bekendeCams;
  bekendeCams = nu;
  if (!vorige) return;
  const nieuw = devs.filter(d => !vorige.has(d.deviceId) && camRang(d) < 2);
  if (nieuw.length) {
    const d = nieuw[0];
    // zonder naam: pas bij het tonen vertalen, dan wisselt het mee met de taal
    const naam = d.label || (() => t('nieuwe camera'));
    // Een losse webcam die je nu insteekt wil je gebruiken — tenzij je bewust een
    // andere hebt gekozen, of we midden in het instellen zitten.
    if (app.busy || (app.camChosen && nu.has(app.camId))) {
      status(t('Webcam gevonden: {naam} — kies hem bovenaan bij Camera', { naam }), 'ok');
      return;
    }
    app.camChosen = true; app.camId = d.deviceId;
    $('camSelect').value = d.deviceId;
    save();
    const scherm = app.speelplek === 'scherm';
    if (!vision.ready) {
      status(scherm ? t('Webcam gevonden en gekozen: {naam} — klik op "Start op dit scherm"', { naam })
        : t('Webcam gevonden en gekozen: {naam} — klik op "Alles automatisch instellen"', { naam }), 'ok');
      return;
    }
    await runExclusive(startCamera);
    const tr = vision.stream && vision.stream.getVideoTracks()[0];
    if (tr && tr.getSettings && tr.getSettings().deviceId === d.deviceId) {
      // (een andere camera ziet de tafel anders: opnieuw leren)
      status(scherm ? t('Webcam gevonden en gekozen: {naam} — klik op Opnieuw leren', { naam })
        : t('Webcam gevonden en gekozen: {naam} — klik op "Alles automatisch instellen" om hem af te stellen', { naam }), 'ok');
    }
    return;
  }
  const actief = vision.stream && vision.stream.getVideoTracks()[0];
  const actiefId = actief && actief.getSettings ? actief.getSettings().deviceId : '';
  if (actiefId && !nu.has(actiefId)) {
    status(t('De webcam is losgekoppeld — steek hem er weer in, of kies bovenaan een andere camera'), 'err');
  }
}
if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) {
  let wacht = 0;
  navigator.mediaDevices.addEventListener('devicechange', () => {
    clearTimeout(wacht);
    wacht = setTimeout(cameraGewisseld, 600);   // Windows meldt een webcam vaak in stapjes
  });
}

/** De geleerde muur weggooien. Zonder dat de camera ooit aan stond is er niets te vergeten. */
function vergeetMuur() {
  if (vision.mask) vision.clearBackground();
  step('bg', 0);
  omgWacht.nieuw(null);
}

$('btnCam').onclick = () => runExclusive(startCamera);
$('btnFlip').onclick = () => { vision.mirror = !vision.mirror; vergeetMuur(); save(); };
$('camSelect').onchange = () => {
  const v = $('camSelect').value;
  app.camChosen = !!v;
  if (v) app.camId = v;
  save();
  if (vision.ready) runExclusive(startCamera);
  else if (!v) status(t('Camera: automatisch'), 'ok');
  else status(app.speelplek === 'scherm' ? t('Camera gekozen — klik op "Start op dit scherm"') : t('Camera gekozen — klik op "Alles automatisch instellen"'), 'ok');
};

// ---------------------------------------------------------------- beamer

async function openProjector(auto) {
  if (projOk()) { app.proj.focus(); return true; }
  step('proj', 2);

  // Het venster moet meteen open, nog binnen de klik — anders blokkeert Chrome de
  // pop-up. Pas daarna zoeken we uit of er een tweede scherm is.
  // Weet de browser al waar de beamer hangt, dan openen we het venster meteen daar.
  const scr = projectorScreen();
  const feat = scr
    ? 'left=' + scr.availLeft + ',top=' + scr.availTop + ',width=' + scr.availWidth + ',height=' + scr.availHeight
    : 'width=1280,height=720';
  let w = null;
  try { w = window.open('', 'stickyclash_projector', feat); } catch { w = null; }
  // In een ingesloten venster (zoals op itch.io) mag een pop-up vaak niet, of kunnen we
  // er niet in tekenen. Dan zeggen we waarom, in plaats van stil niets te doen.
  const mislukt = () => {
    step('proj', 0);
    if (ingesloten()) {
      status(t('Het beamervenster kan hier niet open: dit is een ingesloten venster — open het spel in een eigen tabblad'), 'err');
      app.popupNiet = true;
      toonCamReden();
    } else status(t('Pop-up geblokkeerd — sta pop-ups toe voor deze pagina en probeer opnieuw'), 'err');
    return false;
  };
  if (!w) return mislukt();
  try { w.document.open(); } catch { try { w.close(); } catch { /* dan niet */ } return mislukt(); }
  w.document.write(
    '<!doctype html><html><head><meta charset="utf-8"><title>' + t('Sticky Clash — beamer') + '</title>' +
    '<style>html,body{margin:0;height:100%;background:#000;overflow:hidden}' +
    'canvas{display:block;width:100%;height:100%}' +
    'html.fs,html.fs body{cursor:none}</style>' +
    // Geen los label over het beeld: dat zat niet in de lichtvoorspelling, dus de
    // camera zag het als voorwerp. De aanwijzing staat in het bedieningspaneel, en
    // zolang er niet gespeeld wordt klein onderin het beeld zelf (die wordt wél
    // voorspeld).
    '</head><body><canvas id="c"></canvas></body></html>'
  );
  w.document.close();

  const c = w.document.getElementById('c');
  app.proj = w;
  app.projCtx = c.getContext('2d');

  // Volledig scherm met de hulpjes uit js/apparaat.js: Safari vóór 16.4 kent alleen de
  // webkit-namen. Altijd het document van het beamervenster zelf meegeven.
  const goFull = () => {
    if (!vsElement(w.document)) vsAan(w.document.documentElement).catch(() => {});
  };
  const syncTip = () => {
    const full = !!vsElement(w.document);
    if (full !== app.projFull) {
      app.projFull = full;
      if (!full) status(t('Klik één keer in het beamervenster voor volledig scherm'));
    }
    w.document.documentElement.classList.toggle('fs', full);
  };
  app.syncTip = syncTip;
  w.document.addEventListener('click', goFull);
  w.document.addEventListener('fullscreenchange', syncTip);
  w.document.addEventListener('webkitfullscreenchange', syncTip);

  // Het beamervlak is veranderd — bijvoorbeeld doordat het venster nu volledig scherm is,
  // of naar de beamer gesleept. De oude kalibratie klopt dan niet meer, en de geleerde muur
  // hoort bij het oude beeld: allebei opnieuw (zie stelOpnieuwIn).
  let resizeTimer = 0;
  const naResize = async () => {
    if (!vision.ready || !projOk()) return;
    // Midden in het instellen? Dan straks nog eens kijken.
    if (app.busy) { resizeTimer = setTimeout(naResize, 1000); return; }
    // Net op precies dit formaat gekalibreerd (de wizard wachtte erop): niets te doen.
    if (app.calVoor && app.calVoor.w === c.width && app.calVoor.h === c.height) return;
    // De wizard bleef steken omdat de camera het beamerbeeld niet zag. Nu het venster
    // verplaatst of volledig scherm is, gaat hij vanzelf verder.
    if (app.halfIngesteld) { runExclusive(instellenNaCamera); return; }
    if (!app.H) return;
    const wasPlaying = game.state === 'play';
    if (wasPlaying) { game.togglePause(); toonPlayKnop(); }
    const ok = await runExclusive(stelOpnieuwIn);
    if (ok) status(t('Opnieuw ingesteld'), 'ok');
    else if (!app.abort) status(t('Opnieuw instellen lukte niet — klik op "Alles automatisch instellen"'), 'err');
    if (wasPlaying && game.state === 'paused') { game.togglePause(); toonPlayKnop(); }
  };
  const resize = () => {
    if (c.width === w.innerWidth && c.height === w.innerHeight) return;
    c.width = w.innerWidth; c.height = w.innerHeight;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(naResize, 900);
  };
  resize();
  w.addEventListener('resize', resize);
  w.addEventListener('pagehide', () => { app.proj = null; app.projCtx = null; app.syncTip = null; step('proj', 0); lusAan(); });
  w.document.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if (k === 'f') { if (vsElement(w.document)) vsUit(w.document); else goFull(); }
    if (k === ' ') {
      e.preventDefault();
      if (game.state === 'over' || game.state === 'idle') $('btnPlay').click();
      else game.togglePause();
    }
  });

  syncTip();
  step('proj', 1);
  return true;
}

$('btnProj').onclick = () => openProjector(true);

// ---------------------------------------------------------------- tweede scherm
//
// De browser vertelt pas waar de beamer hangt na toestemming, en die vraag moet uit
// een eigen klik komen: window.open verbruikt de klik al, dus in één handeling kon
// het nooit. Eén keer toestaan is genoeg; daarna opent het beamervenster vanzelf op
// het goede scherm.

let screenInfo = null;

async function loadScreens(ask) {
  if (!('getScreenDetails' in window)) return null;
  try {
    if (!ask && navigator.permissions) {
      // Chrome 100 tot 110 (zoals op oudere Chromebooks) noemde het nog 'window-placement'.
      let st;
      try { st = await navigator.permissions.query({ name: 'window-management' }); }
      catch { st = await navigator.permissions.query({ name: 'window-placement' }); }
      if (st.state !== 'granted') return null;
    }
    screenInfo = await window.getScreenDetails();
    return screenInfo;
  } catch { return null; }
}

/** Het scherm waar het bedieningsvenster níét op staat. Werkt ook als de beamer het hoofdscherm is. */
function projectorScreen() {
  if (!screenInfo || screenInfo.screens.length < 2) return null;
  const here = screenInfo.currentScreen;
  return screenInfo.screens.find(s => s !== here) || null;
}

/**
 * Hoe je het beamervenster zelf naar de beamer krijgt, met de sneltoets van dit
 * besturingssysteem. Klein begonnen: het komt achter een dubbele punt of streepje.
 */
function sleepTip() {
  if (BESTURING === 'windows') return t('sleep het beamervenster naar de beamer (of Win+Shift+→) en klik erin of druk op F voor volledig scherm');
  if (BESTURING === 'chromeos') return t('sleep het beamervenster naar de beamer (of Zoeken+Alt+M) en klik erin of druk op F voor volledig scherm');
  if (BESTURING === 'linux') return t('sleep het beamervenster naar de beamer (of Super+Shift+→) en klik erin of druk op F voor volledig scherm');
  return t('sleep het beamervenster naar de beamer en klik erin of druk op F voor volledig scherm');
}

/**
 * Zonder schermen herkennen (Firefox, Safari) geen knop die alleen "kan niet" zegt, maar
 * hoe het daar wél gaat. Opnieuw na het wisselen van taal.
 */
function toonSchermenHint() {
  if (SCHERMEN_HERKENNEN) return;
  $('btnScreens').classList.add('hidden');
  $('schermenHint').textContent = t('Deze browser zet het beamervenster niet zelf op de beamer: {tip}.', { tip: sleepTip });
}

/**
 * De browser laten zoeken waar de beamer hangt (Chrome en Edge, na toestemming), en het
 * beamervenster daarheen zetten. Uit "Meer instellingen → Beamer", en uit het kader dat
 * wacht tot het beamervenster op de beamer staat (zie wachtOpBeamer).
 */
async function zoekBeamer() {
  if (!SCHERMEN_HERKENNEN) {
    status(t('Deze browser kan geen schermen herkennen — {tip}', { tip: sleepTip }), 'err');
    return;
  }
  const det = await loadScreens(true);
  if (!det) { status(t('Geen toestemming gekregen — {tip}', { tip: sleepTip }), 'err'); return; }
  const scr = projectorScreen();
  if (!scr) { status(t('Maar één scherm gevonden — sluit de beamer aan en probeer opnieuw'), 'err'); return; }
  status(t('Beamer gevonden ({b}×{h}) — het beamervenster opent daar voortaan vanzelf', { b: scr.width, h: scr.height }), 'ok');
  if (projOk()) {
    app.proj.moveTo(scr.availLeft, scr.availTop);
    app.proj.resizeTo(scr.availWidth, scr.availHeight);
    // Wachtte het instellen tot het venster op de beamer stond? Dan kan het nu verder.
    if (app.wachtBeamer) app.verder = true;
  }
}
$('btnScreens').onclick = zoekBeamer;
$('btnProjClose').onclick = () => {
  if (projOk()) app.proj.close();
  app.proj = null; app.projCtx = null; step('proj', 0);
};

// ---------------------------------------------------------------- kalibratie

function quadOk(p) {
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = p[i], b = p[(i + 1) % 4], c = p[(i + 2) % 4];
    const cr = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    if (Math.abs(cr) < 1) return false;
    const s = cr > 0 ? 1 : -1;
    if (sign === 0) sign = s; else if (s !== sign) return false;
  }
  let area = 0;
  for (let i = 0; i < 4; i++) {
    const q = p[(i + 1) % 4];
    area += p[i][0] * q[1] - q[0] * p[i][1];
  }
  return Math.abs(area) / 2 > vision.vw * vision.vh * 0.02;
}

/** Verschil met het zwarte referentiebeeld, per cel. */
async function diffAgainst(pattern, ref, settle) {
  app.calPattern = pattern;
  await sleep(settle);
  vision.grab();
  const cur = vision.cl;
  const d = new Float32Array(cur.length);
  let max = 0;
  for (let k = 0; k < cur.length; k++) {
    d[k] = cur[k] - ref[k];
    if (d[k] > max) max = d[k];
  }
  return { d, max };
}

/**
 * Stap 1 is een volledig wit beeld. Dat is veruit het sterkste signaal en werkt
 * ook in een verlichte kamer; de vier hoekpunten van het heldere vlak geven al
 * een bruikbare homografie. Stap 2 verfijnt die met een raster van stippen en de
 * kromming van de lens (js/kalibratie.js); lukt dat niet, dan met vier losse stippen,
 * maar alleen als die goed genoeg te zien zijn.
 */
async function autoCalibrate(silent) {
  if (!vision.ready) { if (!silent) status(t('Start eerst de camera'), 'err'); return false; }
  if (!projOk()) { if (!silent) status(t('Open eerst het beamervenster'), 'err'); return false; }
  step('cal', 2);
  const wasWiz = app.wiz;
  // title en sub zijn Nederlandse zinnen; drawWizard vertaalt ze bij het tekenen
  app.wiz = { title: 'Kalibreren', sub: 'even niet voor de beamer gaan staan' };
  // Op het volledige beeld kalibreren: na een verschoven beamer kan het vlak best
  // buiten de vorige uitsnede liggen. En met een camera die zich weer aanpast.
  if (vision.roi) setRoi(null);
  await vision.unlockCamera();
  await sleep(500);

  const fail = (msg) => {
    app.calPattern = null; app.wiz = wasWiz;
    step('cal', app.H ? 1 : 0);
    if (!silent) status(msg, 'err');
    return false;
  };

  app.calPattern = { kind: 'black' };
  await sleep(900);                                  // camera laten wennen aan zwart
  vision.grab();
  const ref = vision.lumaSnapshot();

  // ---- stap 1: het hele vlak wit ----
  const white = await diffAgainst({ kind: 'white' }, ref, 900);
  app.calDiag = { wit: Math.round(white.max) };
  if (white.max < 9) {
    return fail(t('De camera ziet het beamerbeeld niet (contrast {n}). Staat het beamervenster op de beamer, en kijkt de camera naar dat vlak?',
      { n: Math.round(white.max) }));
  }
  const thr = Math.max(7, white.max * 0.45);
  const cols = vision.cols;
  let n = 0;
  let tl = null, tr = null, br = null, bl = null;
  let tlV = Infinity, trV = -Infinity, brV = -Infinity, blV = Infinity;
  for (let k = 0; k < white.d.length; k++) {
    if (white.d[k] < thr) continue;
    const cx = k % cols, cy = (k - cx) / cols;
    n++;
    const s = cx + cy, t = cx - cy;
    if (s < tlV) { tlV = s; tl = [cx, cy]; }
    if (s > brV) { brV = s; br = [cx, cy]; }
    if (t > trV) { trV = t; tr = [cx, cy]; }
    if (t < blV) { blV = t; bl = [cx, cy]; }
  }
  if (n < white.d.length * 0.02 || !tl || !tr || !br || !bl) {
    return fail(t('Het beamervlak is te klein in beeld. Richt de camera op de muur.'));
  }
  const toPx = (p) => [(p[0] + 0.5) * vision.cell, (p[1] + 0.5) * vision.cell];
  const rough = [tl, tr, br, bl].map(toPx);
  if (!quadOk(rough)) return fail(t('Het beamervlak ligt niet volledig in beeld.'));
  let H = computeHomography(rough.map(p => vision.camNorm(p[0], p[1])), [[0, 0], [1, 0], [1, 1], [0, 1]]);
  if (!H) return fail(t('Kalibratie mislukt.'));

  // ---- stap 2: raster van stippen, met lensvertekening (js/kalibratie.js) ----
  // Werkt het niet (te donker, te weinig stippen in beeld), dan de oude meting met vier stippen.
  let refined = false;
  let rasterFout = null;
  for (let poging = 0; poging < 2 && !app.abort; poging++) {
    const pc = app.projCtx.canvas;
    const v = vision.video;
    const res = await kalRaster({
      vision, sleep, poging, Hruw: H, ar: (v.videoWidth / v.videoHeight) || 4 / 3, bw: pc.width, bh: pc.height,
      toon: (p) => { app.calPattern = p; },
      voortgang: (n, m) => { if (!silent) status(t('Kalibreren… stip {n} van {m}', { n, m })); },
      afbreken: () => app.abort || !projOk(),
    });
    app.calDiag.raster = res.fout || res.mislukt;
    if (!res.H) continue;
    if (res.fout.max <= Math.max(6, pc.width * 0.006) || (poging === 1 && res.fout.max <= pc.width * 0.02)) {
      H = res.H; kalZetLens(H, res.lens); refined = true; rasterFout = res.fout;
      break;
    }
  }

  // ---- anders: verfijnen met vier stippen ----
  const pts = [];
  let ok = !rasterFout;
  for (let i = 0; i < 4 && ok; i++) {
    const m = await diffAgainst({ kind: 'marker', i }, ref, 520);
    if (m.max < 8) { ok = false; break; }
    const mt = m.max * 0.6;
    let sx = 0, sy = 0, sw = 0;
    for (let k = 0; k < m.d.length; k++) {
      if (m.d[k] < mt) continue;
      const cx = k % cols, cy = (k - cx) / cols;
      sx += cx * m.d[k]; sy += cy * m.d[k]; sw += m.d[k];
    }
    if (!sw) { ok = false; break; }
    pts.push([(sx / sw + 0.5) * vision.cell, (sy / sw + 0.5) * vision.cell]);
  }
  if (ok && pts.length === 4 && quadOk(pts)) {
    const H2 = computeHomography(pts.map(p => vision.camNorm(p[0], p[1])), CAL_TARGETS);
    if (H2) { H = H2; refined = true; }
  }

  app.calPattern = null;
  app.wiz = wasWiz;
  app.H = H; app.Hinv = invertH(H);
  app.calPts = [];
  app.calCam = app.camId || '';
  app.calVoor = projOk() ? { w: app.projCtx.canvas.width, h: app.projCtx.canvas.height } : null;
  step('cal', 1);
  updateCal();
  save();

  applyRoi();

  // ---- controle: rand projecteren zodat je ziet of het klopt ----
  app.calPattern = { kind: 'verify' };
  await sleep(1600);
  app.calPattern = null;

  if (!silent) {
    status(rasterFout
      ? t('Kalibratie gelukt — nauwkeurig tot ongeveer {px} beamerpixels', { px: Math.max(1, Math.round(rasterFout.max)) })
      : refined
      ? t('Kalibratie gelukt — controleer of de gestreepte lijn om het beamerbeeld ligt')
      : t('Kalibratie gelukt (grove meting; stippen waren niet goed zichtbaar)'), 'ok');
  }
  return true;
}

// Opnieuw kalibreren snijdt het camerabeeld opnieuw bij, en dan hoort de geleerde muur bij het
// oude beeld. Was de muur al geleerd, dan leren we hem meteen opnieuw.
$('btnCalAuto').onclick = () => runExclusive(async () => {
  const hadMuur = vision.hasBackground;
  if (!(await autoCalibrate(false))) return false;
  if (hadMuur && !vision.hasBackground && vision.mode === 'object') {
    app.goalTrack = null;
    return learnWall(true);
  }
  return true;
});

$('btnCal').onclick = () => {
  if (!projOk()) { status(t('Open eerst het beamervenster'), 'err'); return; }
  if (!vision.ready) { status(t('Start eerst de camera'), 'err'); return; }
  app.calibrating = true;
  app.calPts = [];
  updateCal();
};

$('btnCalReset').onclick = () => {
  app.H = null; app.Hinv = null; app.calPts = []; app.calibrating = false; app.calVoor = null;
  setRoi(null);
  step('cal', 0); save(); updateCal();
};

function updateCal() {
  const st = $('calState');
  if (app.calibrating) {
    st.textContent = t('Klik punt {n} van 4 in het camerabeeld', { n: app.calPts.length + 1 });
    st.className = 'badge';
  } else if (app.H) {
    st.textContent = t('Gekalibreerd'); st.className = 'badge ok';
  } else {
    st.textContent = t('Niet gekalibreerd'); st.className = 'badge';
  }
}

// ---------------------------------------------------------------- muur leren

/**
 * De lege muur leren. opt (bij het vanzelf bijstellen, zie onderhoud):
 *   houd   omtrekken (werkpixels) van wat als voorwerp telde: dat blijft meetellen, met zijn
 *          eigen kleur, ook als het licht intussen veranderde (zie vision.houdVast)
 *   stil   beweegt er iets terwijl de beelden binnenkomen (iemand loopt erdoor), dan niet
 *          leren: de oude muur blijft, en het wordt later opnieuw geprobeerd
 */
async function learnWall(withCountdown, opt = {}) {
  if (!vision.ready) return false;
  // Op een scherm is er geen beamer: geen wit beeld, geen muurverlichting, niets vast te
  // zetten. Het spel leert gewoon hoe de lege tafel (of muur, of bord) eruitziet.
  const scherm = app.speelplek === 'scherm';
  step('bg', 2);
  if (withCountdown) {
    for (let n = 3; n > 0; n--) {
      if (app.abort) return false;
      app.wiz = scherm ? { title: 'Handen uit beeld', sub: 'ik leer hoe de lege ondergrond eruitziet', count: n }
        : { title: 'Ga even uit beeld', sub: 'ik leer hoe de lege muur eruitziet', count: n };
      await sleep(900);
    }
  }
  app.wiz = { title: 'Momentje', sub: '' };
  if (!scherm && typeof vision.beginResponse === 'function' && projOk()) {
    // Eerst heel even vol wit: zo leert het spel hoe fel elk stukje muur oplicht onder
    // de beamer, en kan het zijn eigen ballen en letters voorspellen in plaats van er
    // alleen omheen te kijken. Snel meten, voordat de camera zijn belichting aanpast.
    app.calPattern = { kind: 'white' };
    await sleep(260);
    vision.beginResponse();
    for (let i = 0; i < 4; i++) { vision.grab(); vision.addResponseFrame(); await sleep(35); }
    vision.endResponse();
  }
  // Leren onder dezelfde verlichting als waarmee gespeeld wordt.
  if (!scherm) app.calPattern = { kind: 'fill' };
  // Lang genoeg wachten tot de camera gewend is: anders leert hij een muur die net
  // iets te donker of te licht is. Zonder beamer verandert er niets aan het licht.
  await sleep(scherm ? 400 : 1200);
  let vast = [];
  if (app.lockExposure && !scherm) {
    // Alleen op verzoek, en gecontroleerd: wordt het beeld er merkbaar donkerder van,
    // dan meteen terug naar automatisch.
    vision.grab();
    const voor = vision.meanLuma(inProjection);
    vast = await vision.lockCamera();
    await sleep(500);
    vision.grab();
    const na = vision.meanLuma(inProjection);
    if (vast.length && na < voor * 0.8) {
      await vision.unlockCamera();
      await sleep(600);
      vast = [];
      status(t('Vastzetten maakte het camerabeeld donkerder — belichting blijft automatisch'), 'err');
    }
  }
  // De oude muur, om wat als voorwerp telde straks terug te zetten (zie vision.houdVast).
  const oud = opt.houd && opt.houd.length && vision.bg ? Float32Array.from(vision.bg) : null;
  // Een seconde aan beelden: met maar acht werd de ruis naast scherpe randen
  // onderschat, en dat gaf valse vlekken.
  vision.beginBackground();
  if (opt.stil) { vision.grab(); vision.bewegingSindsVorig(true); }
  let onrust = 0;
  for (let i = 0; i < 30; i++) {
    if (app.abort) { app.calPattern = null; return false; }
    vision.grab();
    // Loopt er iemand door het beeld? Dan niet leren: die zou in de muur terechtkomen. De
    // oude muur blijft gewoon staan (endBackground komt er niet). Drie keer achter elkaar,
    // of één keer heel duidelijk: een uitschieter in de korrel van een donkere camera is
    // nog geen voorbijganger.
    const bew = opt.stil ? vision.bewegingSindsVorig() : 0;
    onrust = bew > OMG.beweging * 2 ? onrust + 1 : 0;
    if (onrust >= 3 || bew > OMG.beweging * 8) {
      vision.bgAcc = null; vision.bgSq = null;
      app.calPattern = null; app.wiz = null;
      step('bg', vision.hasBackground ? 1 : 0);
      app.leerOnrustig = true;
      return false;
    }
    vision.addBackgroundFrame();
    await sleep(33);
  }
  vision.endBackground();
  // Hing er al iets? Dat zit nu in de geleerde muur en zou onzichtbaar blijven.
  const al = app.resident ? vision.findResident(inProjection) : 0;
  // Wat net nog als voorwerp telde, blijft meetellen (vanzelf bijstellen).
  const gehouden = oud ? vision.houdVast(opt.houd, oud) : 0;
  // (wat vastgehouden werd, telde al als voorwerp; findResident vindt die meestal ook)
  app.laatstGehouden = gehouden || al;
  app.calPattern = null;
  app.wiz = null;
  step('bg', 1);
  // De controle van elke minuut begint opnieuw, met deze muur als maatstaf.
  omgWacht.nieuw(vision.omgevingBasis(app.H));
  // vision.lockCamera noemt wat hij vastzette: 'belichting', 'witbalans'
  const wat = () => vast.map(w => t(w)).join(', ');
  if (scherm) {
    status(al ? tAantal(al, 'Geleerd — {n} voorwerp lag er al, dat telt gewoon mee. Handen tellen niet mee.',
      'Geleerd — {n} voorwerpen lagen er al, die tellen gewoon mee. Handen tellen niet mee.')
      : t('Geleerd — alles wat je nu neerlegt, kaatst de ballen. Handen tellen niet mee.'), 'ok');
  } else if (!vast.length) {
    status(al ? tAantal(al, 'Muur geleerd — {n} voorwerp hing er al, dat telt gewoon mee',
      'Muur geleerd — {n} voorwerpen hingen er al, die tellen gewoon mee')
      : t('Muur geleerd — alles wat je er nu voor zet, kaatst de ballen'), 'ok');
  } else {
    status(al ? tAantal(al, 'Muur geleerd en camera vastgezet ({wat}) — {n} voorwerp hing er al, dat telt gewoon mee',
      'Muur geleerd en camera vastgezet ({wat}) — {n} voorwerpen hingen er al, die tellen gewoon mee', { wat })
      : t('Muur geleerd en camera vastgezet ({wat}) — alles wat je er nu voor zet, kaatst de ballen', { wat }), 'ok');
  }
  return true;
}

$('btnBg').onclick = () => runExclusive(async () => {
  await learnWall(true);
});

// ---------------------------------------------------------------- doel zoeken

async function findBin() {
  if (!vision.ready || !vision.hasBackground || !app.H) return false;
  step('goal', 2);
  app.wiz = { title: 'Zet nu de bak neer', sub: 'en ga daarna zelf uit beeld' };
  await sleep(2600);
  for (let n = 3; n > 0; n--) {
    if (app.abort) return false;
    app.wiz = { title: 'Zet nu de bak neer', sub: 'en ga daarna zelf uit beeld', count: n };
    await sleep(1000);
  }
  app.wiz = { title: 'Zoeken…', sub: '' };
  app.calPattern = { kind: 'fill' };
  await sleep(500);

  let best = null, bestRes = null;
  for (let i = 0; i < 6; i++) {
    vision.grab();
    vision.classifyObject();
    for (const b of vision.blobs()) {
      if (b.touchEdge) continue;                     // loopt het beeld uit: geen bak
      const c = toProj(b.cx, b.cy);
      if (c[0] < 0 || c[0] > 1 || c[1] < 0 || c[1] > 1) continue;
      // Hing er al: meestal een briefje, geen bak. Alleen als er verder niets is en het
      // groot is, is het waarschijnlijk de bak die al hing.
      if (b.residentFrac > 0.3) { if (!bestRes || b.cells > bestRes.cells) bestRes = b; continue; }
      if (!best || b.cells > best.cells) best = b;
    }
    await sleep(70);
  }
  if (!best && bestRes) {
    const g = toProj(bestRes.cx, bestRes.cy);
    const opDoel = Math.hypot(g[0] * game.W - game.goal.x, g[1] * game.H - game.goal.y) < game.goal.r;
    if (opDoel || bestRes.cells >= 150) best = bestRes;
  }
  app.calPattern = null;
  app.wiz = null;

  if (!best) {
    step('goal', 0);
    status(t('Geen bak gevonden — probeer "Doel aanwijzen" en klik erop in het camerabeeld'), 'err');
    return false;
  }
  setGoalFromBlob(best);
  step('goal', 1);
  status(t('Doel gevonden — verplaats de bak gerust tijdens het spel'), 'ok');
  return true;
}

function setGoalFromBlob(b) {
  const p = toProj(b.cx, b.cy);
  // Een bak buiten het beamervlak kun je niet raken. Dan liever niets doen dan
  // het doel onzichtbaar buiten beeld schuiven.
  if (p[0] < 0 || p[0] > 1 || p[1] < 0 || p[1] > 1) return false;
  game.goal.x = p[0] * game.W;
  game.goal.y = p[1] * game.H;
  game.goal.auto = true;
  let x0 = Infinity, x1 = -Infinity;
  for (const c of b.corners) {
    const q = toProj(c[0], c[1]);
    x0 = Math.min(x0, q[0] * game.W); x1 = Math.max(x1, q[0] * game.W);
  }
  game.goal.r = Math.max(55, Math.min(170, (x1 - x0) * 0.62));
  game.clampGoal();
  app.goalTrack = { cx: b.cx, cy: b.cy, cells: b.cells };
  return true;
}

$('btnGoal').onclick = () => {
  app.pickGoal = true;
  status(t('Klik op de bak in het camerabeeld links'));
};

// ---------------------------------------------------------------- de wizard

function autoSetup() {
  sfx.resume();
  // Wie terugkomt met een bewaarde kalibratie: eerst kijken of die nog klopt (zie
  // kalibratieKlopt). Na het instellen is het "Opnieuw instellen": dan alles opnieuw.
  const snel = !app.ingesteld && !!app.H && app.speelplek === 'muur';
  // Kan de camera hier helemaal niet (ingesloten venster, geen https)? Dan zeggen we dat
  // meteen, zonder eerst een beamervenster te openen dat toch niets kan.
  if (app.camReden && app.camReden !== 'geweigerd') { status(camRedenTekst(app.camReden), 'err'); return false; }
  // Een iPad, iPhone of tablet opent het beamervenster als tabblad: dan zijn het paneel en de
  // camera weg zodra je het beamerbeeld ziet. Dan niet beginnen, maar zeggen wat wel kan.
  if (!APART_VENSTER) { toonMuurStart(); return false; }
  // Het venster moet binnen de klik open, vóór alles wat wacht.
  const nieuw = !projOk();
  const opened = projOk() || openProjector(true);
  return runExclusive(async () => {
    if (!(await opened)) return false;
    if (app.abort || !projOk()) return;
    // Weet de browser niet waar de beamer hangt (Firefox, Safari, of Chrome zonder
    // toestemming), dan staat het nieuwe venster op hetzelfde scherm als het paneel. Eerst
    // wachten tot het op de beamer staat: anders ziet de camera niets om te kalibreren.
    if (nieuw && !projectorScreen() && !(await wachtOpBeamer())) {
      // Het beamervenster ging dicht tijdens het wachten: dan niet blijven zeggen dat je het
      // moet slepen (bij Afbreken staat er al "Afgebroken").
      if (!app.abort) status(t('Het beamervenster ging dicht — klik op "Alles automatisch instellen" om opnieuw te beginnen'));
      return;
    }
    await sleep(500);

    if (!vision.ready && !(await startCamera())) return;
    if (app.abort) return;
    await sleep(600);
    app.kleurOpgegeven = false;
    return instellenNaCamera(snel);
  });
}

/**
 * De rest van de wizard, met de camera aan: kalibreren, licht afstellen, de muur leren en
 * de bak zoeken. Lukt kalibreren niet (het beamervenster stond nog niet op de beamer), dan
 * gaat het vanzelf verder zodra het beamervenster verplaatst of volledig scherm wordt (zie
 * openProjector).
 */
async function instellenNaCamera(snel = false) {
  app.halfIngesteld = true;
  const klopt = snel && await kalibratieKlopt();
  if (app.abort) return false;
  if (klopt) status(t('De kalibratie van de vorige keer klopt nog — die hoeft niet opnieuw'), 'ok');
  else if (!(await autoCalibrate(false))) return false;
  if (app.abort) return false;

  if (app.fillAuto) {
    await autoLight();
    if (app.abort) return false;
  }

  let bak = true;
  if (vision.mode === 'object') {
    if (!(await learnWall(true))) return false;
    if (app.abort) return false;
    bak = await findBin();
  }
  if (app.abort) return false;
  app.halfIngesteld = false;

  app.wiz = { title: 'Klaar', sub: 'veel plezier' };
  await sleep(1200);
  app.wiz = null;
  app.ingesteld = true;
  toonAutoKnop();
  if (bak) status(t('Alles staat klaar — klik op "Start ronde"'), 'ok');
  else status(t('Klaar, maar geen bak gevonden — sleep het doel in de rechter weergave naar je bak'), 'err');
  return true;
}

/**
 * Klopt de bewaarde kalibratie nog? Wie terugkomt heeft de beamer en de camera meestal nog
 * precies zo staan. Vier stippen projecteren en kijken of ze vallen waar de kalibratie zegt,
 * op hooguit anderhalve cel na. Dat gaat sneller dan opnieuw kalibreren (geen wit beeld en geen
 * controlerand), en een goede kalibratie blijft goed. Een andere camera: altijd opnieuw.
 */
async function kalibratieKlopt() {
  if (!app.H || !vision.ready || !projOk()) return false;
  if (app.calCam && app.camId && app.calCam !== app.camId) return false;
  step('cal', 2);
  const wasWiz = app.wiz;
  app.wiz = { title: 'Kalibratie controleren', sub: 'even niet voor de beamer gaan staan' };
  // Op het volledige beeld, zoals bij het kalibreren zelf (zie autoCalibrate).
  if (vision.roi) setRoi(null);
  await vision.unlockCamera();
  await sleep(500);
  app.calPattern = { kind: 'black' };
  await sleep(900);
  vision.grab();
  const ref = vision.lumaSnapshot();
  const cols = vision.cols;
  let ok = true, slechtst = 0;
  for (let i = 0; i < 4 && ok; i++) {
    if (app.abort) { ok = false; break; }
    const m = await diffAgainst({ kind: 'marker', i }, ref, 520);
    if (m.max < 8) { ok = false; break; }
    const mt = m.max * 0.6;
    let sx = 0, sy = 0, sw = 0;
    for (let k = 0; k < m.d.length; k++) {
      if (m.d[k] < mt) continue;
      const cx = k % cols, cy = (k - cx) / cols;
      sx += cx * m.d[k]; sy += cy * m.d[k]; sw += m.d[k];
    }
    if (!sw) { ok = false; break; }
    const waar = fromProj(CAL_TARGETS[i][0], CAL_TARGETS[i][1]);
    const d = Math.hypot((sx / sw + 0.5) * vision.cell - waar[0], (sy / sw + 0.5) * vision.cell - waar[1]) / vision.cell;
    slechtst = Math.max(slechtst, d);
    if (!(d <= 1.5)) ok = false;
  }
  app.calPattern = null;
  app.wiz = wasWiz;
  app.calControle = { klopt: ok, afwijking: +slechtst.toFixed(2) };   // (voor de diagnose en de tests)
  step('cal', 1);
  if (!ok) return false;
  app.calCam = app.camId || '';
  app.calVoor = projOk() ? { w: app.projCtx.canvas.width, h: app.projCtx.canvas.height } : null;
  updateCal();
  save();
  applyRoi();
  return true;
}

/**
 * Het nieuwe beamervenster staat nog op het scherm van het paneel: wachten tot het op de
 * beamer staat. Verder zodra het volledig scherm is (de klik erin), of als je op Verder
 * klikt. Op de muur staat intussen in het venster zelf wat je moet doen, en in het paneel
 * stap voor stap (#beamerHulp). In Chrome en Edge kan de browser de beamer ook zelf zoeken.
 * (Niet raden aan de plek van het venster: Firefox verbergt de maten van de schermen tegen
 * vingerafdrukken.) Geeft false bij Afbreken of als het venster dicht ging.
 */
async function wachtOpBeamer() {
  app.wiz = { title: 'Sleep dit venster naar de beamer', sub: 'en klik erin voor volledig scherm' };
  app.wachtBeamer = true; app.verder = false;
  toonBeamerHulp();
  $('beamerHulp').classList.remove('hidden');
  $('btnVerder').classList.remove('hidden');
  status(t('Sleep het beamervenster naar de beamer en klik erin voor volledig scherm — of klik op Verder'));
  try {
    while (!app.abort && projOk() && !app.projFull && !app.verder) await sleep(200);
  } finally {
    app.wachtBeamer = false;
    $('btnVerder').classList.add('hidden');
    $('beamerHulp').classList.add('hidden');
    app.wiz = null;
  }
  return !app.abort && projOk();
}

/** De stappen in #beamerHulp, met de sneltoets van dit besturingssysteem (opnieuw na het wisselen van taal). */
function toonBeamerHulp() {
  $('beamerSleep').textContent = BESTURING === 'windows' ? t('Sleep het beamervenster naar de beamer (of druk op Win+Shift+→).')
    : BESTURING === 'chromeos' ? t('Sleep het beamervenster naar de beamer (of druk op Zoeken+Alt+M).')
      : BESTURING === 'linux' ? t('Sleep het beamervenster naar de beamer (of druk op Super+Shift+→).')
        : t('Sleep het beamervenster naar de beamer.');
  $('btnZoekBeamer').classList.toggle('hidden', !SCHERMEN_HERKENNEN);
}

/**
 * Opnieuw kalibreren, en daarna ook de muur opnieuw leren. Kalibreren snijdt het
 * camerabeeld opnieuw bij, en de geleerde muur hoort bij het oude beeld: zonder die tweede
 * stap telde daarna geen enkel voorwerp meer. Voor een verschoven camera of beamer, en een
 * beamervenster dat van formaat veranderde (volledig scherm, naar de beamer gesleept).
 */
async function stelOpnieuwIn() {
  if (!(await autoCalibrate(true))) return false;
  app.goalTrack = null;                          // in camerapunten; die kloppen niet meer
  if (vision.mode === 'object' && !(await learnWall(true))) return false;
  return true;
}

/**
 * De grote knop bovenaan. Nog nooit gekalibreerd: "Alles automatisch instellen". Wie terugkomt
 * met een bewaarde kalibratie: "Start: alles klaarzetten" (de browser laat het beamervenster
 * alleen na een klik open, dus één klik is nodig; zie kalibratieKlopt). Na het instellen:
 * "Opnieuw instellen", dan gaat alles opnieuw.
 */
function toonAutoKnop() {
  const terug = !app.ingesteld && !!app.H;
  $('btnAuto').textContent = app.ingesteld ? t('Opnieuw instellen') : terug ? t('Start: alles klaarzetten') : t('Alles automatisch instellen');
  $('btnAuto').classList.toggle('klaarzetten', terug);
  // (het losse bestand zegt hier iets anders, zie toonLosHint)
  if (location.protocol !== 'file:') $('wizHint').textContent = terug ? t('Opent de beamer en de camera, kijkt of de kalibratie nog klopt en leert de muur — in één keer.')
    : t('Doet de beamer, de camera, de kalibratie en de muur in één keer. Volg de aanwijzingen op de muur.');
}

$('btnAuto').onclick = autoSetup;
// (niet via btnScreens: die staat uit zolang het instellen bezig is)
$('btnZoekBeamer').onclick = zoekBeamer;
$('btnAbort').onclick = () => { app.abort = true; app.halfIngesteld = false; status(t('Afgebroken')); };
$('btnVerder').onclick = () => { app.verder = true; };

// ---------------------------------------------------------------- speelmodus

function setMode(m) {
  vision.mode = m;
  pasSpeelplekToe();              // duel, zuinig met licht en het record hangen ook af van de speelplek
  document.querySelectorAll('#modeSeg button').forEach(b => b.classList.toggle('on', b.dataset.mode === m));
  toonModeHint();
  document.querySelectorAll('.steps li[data-k="bg"], .steps li[data-k="goal"]')
    .forEach(li => li.classList.toggle('hidden', m !== 'object'));
  vision.tracks.length = 0;
  save();
}

function toonModeHint() {
  // op een scherm ligt het op een tafel, en daar tellen handen juist niet
  const muur = app.speelplek !== 'scherm';
  $('modeHint').textContent = vision.mode !== 'object'
    ? t('Oranje post-its sturen de ballen naar de bak, blauwe blokkeren. Leer de twee kleuren onder "Meer instellingen".')
    : muur ? t('Alles wat je voor de muur houdt kaatst de ballen — boek, doos, hand, wat je maar pakt. Leer eerst de lege muur.')
      : t('Alles wat je neerlegt kaatst de ballen — briefje, boek, doos. Handen tellen niet mee. Leer eerst de lege ondergrond.');
}

document.querySelectorAll('#modeSeg button').forEach(b => {
  b.onclick = () => setMode(b.dataset.mode);
});

// ---------------------------------------------------------------- kleuren

function renderClasses() {
  const box = $('classList');
  box.innerHTML = '';
  vision.classes.forEach((c, i) => {
    const row = document.createElement('div');
    row.className = 'cls';
    row.innerHTML =
      '<span class="dot" style="background:' + c.css + '"></span>' +
      '<span class="nm">' + t(c.label) + '</span>' +
      '<span class="cnt" data-cnt="' + c.id + '">0</span>';
    const b = document.createElement('button');
    b.textContent = app.learning === i ? t('Klik…') : t('Leren');
    if (app.learning === i) b.className = 'learning';
    b.onclick = () => { app.learning = app.learning === i ? -1 : i; renderClasses(); };
    row.appendChild(b);
    box.appendChild(row);
  });
}

// ---------------------------------------------------------------- klikken in het camerabeeld

debug.addEventListener('click', (e) => {
  const r = debug.getBoundingClientRect();
  const sc = Math.min(r.width / debug.width, r.height / debug.height);
  const x = (e.clientX - r.left - (r.width - debug.width * sc) / 2) / sc;
  const y = (e.clientY - r.top - (r.height - debug.height * sc) / 2) / sc;
  if (x < 0 || y < 0 || x > debug.width || y > debug.height) return;

  if (app.pickGoal) {
    app.pickGoal = false;
    if (!app.H) { status(t('Eerst kalibreren'), 'err'); return; }
    const near = vision.tracks.filter(t => Math.hypot(t.cx - x, t.cy - y) < 40)
      .sort((a, b) => b.cells - a.cells)[0];
    if (near && setGoalFromBlob(near)) { /* bak gevonden */ }
    else {
      const p = toProj(x, y);
      game.goal.x = p[0] * game.W; game.goal.y = p[1] * game.H;
      game.goal.auto = false; app.goalTrack = null;
    }
    step('goal', 1);
    status(t('Doel gezet'), 'ok');
    return;
  }

  if (app.learning >= 0) {
    const hsv = vision.sampleHsv(x, y);
    if (hsv) {
      const C = vision.classes[app.learning];
      C.hue = hsv[0];
      C.sMin = Math.max(0.15, hsv[1] * 0.55);
      C.vMin = Math.max(0.12, hsv[2] * 0.45);
      status(t('{kleur} geleerd: tint {tint}°', { kleur: () => t(C.label), tint: Math.round(hsv[0]) }), 'ok');
      save();
    }
    app.learning = -1;
    renderClasses();
    return;
  }

  if (app.calibrating) {
    app.calPts.push([x, y]);
    if (app.calPts.length === 4) {
      const H = computeHomography(app.calPts.map(p => vision.camNorm(p[0], p[1])), CAL_TARGETS);
      if (H && quadOk(app.calPts)) {
        const hadMuur = vision.hasBackground;
        app.H = H; app.Hinv = invertH(H);
        app.calibrating = false;
        app.calVoor = projOk() ? { w: app.projCtx.canvas.width, h: app.projCtx.canvas.height } : null;
        app.goalTrack = null;
        step('cal', 1); save();
        applyRoi();
        // het beeld is opnieuw bijgesneden: de geleerde muur hoort bij het oude
        if (hadMuur && !vision.hasBackground) { step('bg', 0); status(t('Kalibratie gelukt — klik nu op "Muur opnieuw leren"'), 'ok'); }
        else status(t('Kalibratie gelukt'), 'ok');
      } else {
        app.calPts = [];
        status(t('Kalibratie mislukt — klik de punten in de juiste volgorde'), 'err');
      }
    }
    updateCal();
  }
});

// ---------------------------------------------------------------- schuifregelaars

// per regelaar het getal ernaast, om na het wisselen van taal opnieuw te schrijven ("uit")
const schuifTeksten = [];

function bindSlider(id, fmt, apply) {
  const el = $(id), out = $(id + 'Out');
  schuifTeksten.push(() => { out.textContent = fmt(+el.value); });
  const upd = () => { out.textContent = fmt(+el.value); apply(+el.value); };
  el.oninput = () => { upd(); save(); };
  upd();
}

function applySliders() {
  vision.minCells = +$('minSize').value;
  // De regelaar loopt van ongevoelig naar gevoelig; intern is het een drempel,
  // dus hoe hoger de regelaar, hoe lager die drempel.
  vision.objThresh = 70 - (+$('sens').value) * 0.56;
  for (const c of vision.classes) {
    c.minCells = (c.id === 'goal' || c.id === 'source')
      ? Math.max(4, Math.round(+$('minSize').value * 0.6))
      : +$('minSize').value;
  }
}

bindSlider('sens', v => String(v), () => applySliders());
bindSlider('strict', v => String(v), v => {
  // 0 = alles telt mee, 100 = alleen echt starre vormen
  vision.wobbleMax = 0.19 - (v / 100) * 0.15;
});
bindSlider('minSize', v => String(v), () => applySliders());
bindSlider('maxSize', v => v + '%', v => { app.maxFrac = v / 100; });
bindSlider('stable', v => (v / 30).toFixed(1) + 's', v => { app.stableNeed = v; });
const mmss = (v) => Math.floor(v / 60) + ':' + String(v % 60).padStart(2, '0');
bindSlider('roundLen', mmss, v => {
  game.roundLen = v;
  if (game.state === 'idle' && !game.endless) game.time = v;
});
bindSlider('srcSpeed', v => (v / 10).toFixed(1), v => {
  game.sourceSweep = $('moveSource').checked ? v / 10 : 0;
});
bindSlider('goalSpeed', v => (v / 10).toFixed(1), v => {
  game.goalSweep = $('moveGoal').checked ? v / 10 : 0;
});
bindSlider('wind', v => (v ? String(v) : t('uit')), v => { game.wind = v; });

function syncSweeps() {
  game.sourceSweep = $('moveSource').checked ? +$('srcSpeed').value / 10 : 0;
  game.goalSweep = $('moveGoal').checked ? +$('goalSpeed').value / 10 : 0;
  $('srcSpeed').closest('.slider').classList.toggle('off', !$('moveSource').checked);
  $('goalSpeed').closest('.slider').classList.toggle('off', !$('moveGoal').checked);
}
$('moveSource').onchange = () => { syncSweeps(); save(); };
$('moveGoal').onchange = () => { syncSweeps(); save(); };
$('endless').onchange = e => {
  game.endless = e.target.checked;
  if (game.state === 'idle') game.time = e.target.checked ? 0 : +$('roundLen').value;
  save();
};
bindSlider('gravity', v => String(v), v => { game.gravity = v; });
bindSlider('bounce', v => (v / 100).toFixed(2), v => { game.rest = v / 100; });
bindSlider('rate', v => (v / 10).toFixed(1) + '/s', v => { game.rate = v / 10; });

$('noPeople').onchange = e => { app.noPeople = e.target.checked; save(); };
$('fill').oninput = () => {
  app.fill = +$('fill').value / 100;
  $('fillOut').textContent = $('fill').value + '%';
  game.fill = app.fill;
  save();
  if (vision.hasBackground) status(t('Muurverlichting veranderd — klik "Muur opnieuw leren" voor de beste herkenning'));
};
$('fillAuto').onchange = e => { app.fillAuto = e.target.checked; save(); };
$('lockExp').onchange = e => {
  app.lockExposure = e.target.checked;
  save();
  if (!app.lockExposure && vision.ready) vision.unlockCamera();
  status(app.lockExposure ? t('Belichting wordt vastgezet bij het leren van de muur') : t('Belichting weer automatisch'), 'ok');
};
$('skin').onchange = e => { vision.skinFilter = e.target.checked; save(); };
$('resident').onchange = e => {
  app.resident = e.target.checked;
  save();
  if (!vision.hasBackground) return;
  if (!app.resident) { vision.dropResident(); status(t('Wat er al hing telt niet meer mee'), 'ok'); return; }
  const al = vision.findResident(inProjection);
  status(al ? tAantal(al, '{n} voorwerp hing er al, dat telt nu mee', '{n} voorwerpen hingen er al, die tellen nu mee')
            : t('Er hing niets op de muur toen hij geleerd werd'), 'ok');
};
$('sound').onchange = e => { sfx.on = e.target.checked; if (e.target.checked) sfx.resume(); save(); };
$('muziek').onchange = e => { sfx.muziek.aan = e.target.checked; save(); };
$('muziekStijl').onchange = e => { sfx.muziek.kies(e.target.value); save(); };
$('effecten').onchange = e => { game.effects = e.target.checked; save(); };
$('outline').onchange = () => { pasSpeelplekToe(); save(); };
$('testMode').onchange = () => {
  pasSpeelplekToe();
  status(app.testMode ? t('Testmodus: sleep met de muis in de rechter weergave') : t('Testmodus uit'));
};

// ---------------------------------------------------------------- spelvorm en extra's

/** Korte tips die op de muur rouleren zolang er niet gespeeld wordt. */
function updateTips() {
  const p = app.speelplek;
  const eerste = p === 'demo' ? t('Sleep de briefjes of teken nieuwe: de ballen kaatsen ertegen')
    : p === 'scherm' ? t('Leg briefjes of voorwerpen neer: de ballen kaatsen ertegen')
      : t('Plak briefjes of houd voorwerpen tegen de muur: de ballen kaatsen ertegen');
  const tips = [eerste, t('Bouw een baan naar de groene bak')];
  if (app.special) tips.push(t('Rood briefje = trampoline · groen = turbo · blauw = breekt na 5 tikken'));
  if (app.gold) tips.push(t('Een gouden bal in de bak is 3 punten waard'));
  if (app.bonus) tips.push(t('De kleine gouden bak geeft 3 punten, en verspringt steeds'));
  if (app.levels) tips.push(t('Uitdaging: haal elk level op tijd — het wordt steeds moeilijker'));
  tips.push(t('Druk op spatie om te beginnen'));
  game.tips = tips;
}

function applySpel() {
  game.special = app.special;
  game.goldEvery = app.gold ? 8 : 0;
  game.bonusOn = app.bonus;
  game.levelMode = app.levels;
  $('roundLen').closest('.slider').classList.toggle('off', app.levels);
  updateTips();
  toonRang();
}
for (const k of ['special', 'gold', 'bonus']) {
  $(k).onchange = e => {
    app[k] = e.target.checked; applySpel(); save();
    if (k === 'special' && app.special && !kleurStand.ok) status(t('Te donker voor kleuren: speciale briefjes tellen nu als gewone briefjes — meer licht helpt'), 'err');
  };
}
$('spelvorm').onchange = e => {
  app.levels = e.target.value === 'levels';
  if (game.state === 'play' || game.state === 'paused' || game.state === 'count') {
    game.reset(); toonPlayKnop();
  }
  applySpel(); save();
};
$('autoRecal').onchange = e => { app.autoRecal = e.target.checked; save(); };
$('elkeMinuut').onchange = e => {
  app.elkeMinuut = e.target.checked;
  omgWacht.nieuw(vision.hasBackground ? vision.omgevingBasis(app.H) : null);
  save();
  status(app.elkeMinuut ? t('Het spel kijkt elke minuut of het licht of de muur veranderd is') : t('Niet meer elke minuut controleren'), 'ok');
};

// Ranglijst: per spelvorm de beste tien, alleen op deze computer.
const RANG = 'stickyclash.ranglijst';
// Mag de browser niets bewaren (cookies en opslag geblokkeerd, zoals op sommige school-
// computers, of de privémodus van een oude Safari), dan houden we de ranglijst hier vast,
// zolang de pagina openstaat. Na de eerste score is dit altijd de nieuwste.
let rangGeheugen = null;
function leesRang() {
  if (rangGeheugen) return rangGeheugen;
  try { const r = JSON.parse(localStorage.getItem(RANG) || '{}'); return r && typeof r === 'object' ? r : {}; }
  catch { return {}; }
}
/** De ranglijst bewaren. Geeft false als de browser niets mag bewaren. */
function bewaarRang(r) {
  rangGeheugen = r;
  try { localStorage.setItem(RANG, JSON.stringify(r)); return true; } catch { return false; }
}
// De demo heeft een eigen ranglijst: met de muis is het een ander spel.
function rangSoort() {
  if (app.speelplek === 'demo') return game.levelMode ? 'demo-levels' : 'demo';
  return game.levelMode ? 'levels' : vision.mode;
}
/** Onder welke naam het record van deze speelmodus bewaard wordt (app.best). */
function bestSleutel() { return app.speelplek === 'demo' ? 'demo' : vision.mode; }
function rangLijst(soort = rangSoort()) {
  const l = leesRang()[soort];
  return Array.isArray(l) ? l.filter(e => e && typeof e.name === 'string' && Number.isFinite(e.score)) : [];
}
function toonRang() {
  const l = rangLijst(), ol = $('scoreLijst');
  ol.innerHTML = '';
  if (!l.length) {
    const li = document.createElement('li');
    li.className = 'leeg'; li.textContent = t('Nog geen scores — speel een ronde');
    ol.appendChild(li);
  }
  for (const e of l.slice(0, 10)) {
    const li = document.createElement('li'), b = document.createElement('b');
    b.textContent = e.name;                           // textContent: een naam kan nooit code worden
    li.appendChild(b);
    li.append(' — ' + (game.levelMode ? t('level {n}', { n: e.score }) : tAantal(e.score, '{n} punt', '{n} punten')));
    ol.appendChild(li);
  }
  game.highscores = l.slice(0, 5).map(e => ({ name: e.name, score: e.score }));
}
/** Na een ronde: haalt de score de ranglijst? Dan om een naam vragen. */
function rondeVoorbij() {
  if (game.duel) return;
  const score = game.levelMode ? (game.levelReached || 0) : game.score.attack;
  if (!(score > 0)) return;
  const l = rangLijst();
  if (l.length >= 10 && score <= l[l.length - 1].score) return;
  app.pendingScore = { soort: rangSoort(), score, levels: game.levelMode };
  toonNaamVraag();
  $('naam').value = app.lastName || '';
  $('naamInvoer').classList.remove('hidden');
  $('naam').focus(); $('naam').select();
}
/** De vraag boven het naamvak (de telefoon krijgt hem ook, zie vraagTekst hieronder). */
function toonNaamVraag() {
  const p = app.pendingScore;
  $('naamVraag').textContent = p.levels ? t('Level {n} — dat haalt de ranglijst! Hoe heet je?', { n: p.score })
    : tAantal(p.score, '{n} punt — dat haalt de ranglijst! Hoe heet je?', '{n} punten — dat haalt de ranglijst! Hoe heet je?');
}
function bewaarNaam() {
  if (!app.pendingScore) return;
  const naam = ($('naam').value || '').replace(/\s+/g, ' ').trim().slice(0, 16) || t('Anoniem');
  app.lastName = naam;
  const r = leesRang(), soort = app.pendingScore.soort;
  const l = rangLijst(soort);
  l.push({ name: naam, score: app.pendingScore.score, t: Date.now() });
  l.sort((a, b) => b.score - a.score || a.t - b.t);
  r[soort] = l.slice(0, 10);
  const bewaard = bewaarRang(r);
  app.pendingScore = null;
  $('naamInvoer').classList.add('hidden');
  save();
  toonRang();
  status(bewaard ? t('Opgeslagen in de ranglijst: {naam}', { naam })
    : t('Opgeslagen in de ranglijst: {naam} — alleen zolang deze pagina openstaat (deze browser bewaart niets)', { naam }), 'ok');
}
$('btnNaam').onclick = bewaarNaam;
$('naam').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); bewaarNaam(); } });
$('btnScoresWis').onclick = () => {
  if (!confirm(t('De ranglijst van deze spelvorm wissen?'))) return;
  const r = leesRang();
  delete r[rangSoort()];
  bewaarRang(r);
  toonRang();
};

// Bedienen met je telefoon (zie js/telefoon.js): zijn knoppen lopen via dezelfde knoppen
// als in het paneel, en een naam voor de ranglijst via bewaarNaam.
const telefoon = new Telefoon(game, {
  bezig: () => app.busy,
  vraag: () => app.pendingScore,
  vraagTekst: () => $('naamVraag').textContent,
  knop: (id) => $(id).click(),
  bewaarNaam: (naam) => { $('naam').value = naam; bewaarNaam(); },
  status,
  gebaar: () => sfx.resume(),
  // de waarschuwingsbalk onderin de muur (zie drawScene), als deel van de hoogte
  onderbalk: () => { const s = onderbalkSoort(); return s === 'kalibratie' ? 0.13 : s === 'leren' ? 0.11 : meldingOnderin() ? 0.08 : 0; },
});
telefoon.koppelPaneel(document);

/**
 * Diagnosefoto: camerabeeld met omlijningen, wat het spel als voorgrond ziet, wat de
 * beamer laat zien, en de getallen erbij. Wie hulp vraagt, stuurt dit plaatje op.
 */
function diagnoseFoto() {
  const c = document.createElement('canvas');
  c.width = 1400; c.height = 960;
  const g = c.getContext('2d');
  g.fillStyle = '#0c0d10'; g.fillRect(0, 0, c.width, c.height);
  const fit = (src, x, y, w, h, scherp) => {
    if (!src || !src.width || !src.height) return;
    const k = Math.min(w / src.width, h / src.height), dw = src.width * k, dh = src.height * k;
    g.imageSmoothingEnabled = !scherp;
    g.drawImage(src, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  };
  const kop = (tekst, x, y) => { g.fillStyle = '#8b93a5'; g.font = '600 15px system-ui, sans-serif'; g.fillText(tekst, x, y); };
  // camera met omlijningen: even het gewone beeld tekenen, ook als het tabblad op masker staat
  const view = app.debugView;
  app.debugView = 'video'; drawDebug(tracks);
  fit(debug, 10, 34, 680, 400);
  app.debugView = view; drawDebug(tracks);
  kop(t('Camera, met wat het spel herkent'), 12, 24);
  fit(world, 710, 34, 680, 400);
  // op een scherm is er geen beamer, geen kalibratie en geen muurverlichting
  const scherm = app.speelplek === 'scherm';
  kop(scherm ? t('Het speelveld, over het camerabeeld') : t('Wat de beamer laat zien'), 712, 24);
  if (vision.maskImage && vision.cols) {
    const m = document.createElement('canvas');
    m.width = vision.cols; m.height = vision.rows;
    m.getContext('2d').putImageData(vision.maskImage, 0, 0);
    fit(m, 10, 470, 680, 400, true);
  }
  kop(t('Wat het spel als voorwerp ziet (licht = voorgrond)'), 12, 460);
  const st = vision.stream && vision.stream.getVideoTracks()[0];
  const ja = (v) => (v ? t('ja') : t('nee'));
  const aan = (v) => (v ? t('aan') : t('uit'));
  // het oordeel per spoor en de soort briefje zijn korte codes uit main.js en vision.js
  const code = (c) => (c ? t(c) : '—');
  const regels = [
    'Sticky Clash — ' + new Date().toLocaleString(huidigeTaal() === 'en' ? 'en-US' : 'nl-NL'),
    t('Camera: {naam}  {b}x{h}', { naam: (st && st.label) || '—', b: vision.video.videoWidth || 0, h: vision.video.videoHeight || 0 }) +
      (vision.roi ? '  ' + t('(uitsnede)') : ''),
    scherm ? t('Speelplek: scherm   Spiegelen: {spiegel}   Ondergrond geleerd: {muur}   Modus: {modus}', { spiegel: ja(app.schermSpiegel),
      muur: ja(vision.hasBackground), modus: vision.mode + (app.levels ? ' / ' + t('uitdaging') : '') })
      : t('Kalibratie: {kal}   Muur geleerd: {muur}   Modus: {modus}', { kal: ja(app.H), muur: ja(vision.hasBackground),
        modus: vision.mode + (app.levels ? ' / ' + t('uitdaging') : '') }),
    scherm ? t('Gevoeligheid {sens}   Huid negeren {huid}   Mensen negeren {mensen}', { sens: $('sens').value,
      huid: aan(vision.skinFilter), mensen: aan(app.noPeople) })
      : t('Gevoeligheid {sens}   Muurverlichting {licht}%   Huid negeren {huid}   Mensen negeren {mensen}', { sens: $('sens').value,
        licht: Math.round(app.fill * 100), huid: aan(vision.skinFilter), mensen: aan(app.noPeople) }),
    t('Camera ziet helderheid {l}/255   voorgrond {fg}%   lichtcorrectie {gain}   {fps}', { l: Math.round(app.camLuma),
      fg: (vision.fgFraction * 100).toFixed(1), gain: (vision.gain || 1).toFixed(2), fps: $('fps').textContent }),
    t('Teller: {teller}', { teller: $('live').textContent }),
    '',
    t('Sporen (id · cellen · oordeel · huid · schaduw · vertrouwd · stil · trilling · soort):'),
  ];
  for (const sp of tracks.slice(0, 18)) {
    regels.push('#' + sp.id + ' · ' + sp.cells + ' · ' + code(app.reasonById.get(sp.id)) + ' · ' +
      (sp.skinFrac || 0).toFixed(2) + ' · ' + (sp.shadowFrac || 0).toFixed(2) + ' · ' + ja(sp.trusted) + ' · ' +
      (sp.stillT || 0).toFixed(1) + 's · ' + (Number.isFinite(sp.jitter) ? sp.jitter.toFixed(2) : '—') + ' · ' + code(sp.kind));
  }
  if (tracks.length > 18) regels.push(t('… en nog {n}', { n: tracks.length - 18 }));
  g.fillStyle = '#e8eaf0'; g.font = '13px ui-monospace, Consolas, monospace';
  regels.forEach((r, i) => g.fillText(r, 712, 480 + i * 18, 670));
  const a = document.createElement('a');
  const nu = new Date(), z = (n) => String(n).padStart(2, '0');
  a.download = t('sticky-clash-foto') + '-' + nu.getFullYear() + z(nu.getMonth() + 1) + z(nu.getDate()) + '-' + z(nu.getHours()) + z(nu.getMinutes()) + '.png';
  a.href = c.toDataURL('image/png');
  document.body.appendChild(a); a.click(); a.remove();
  status(t('Foto opgeslagen in je map Downloads ({bestand})', { bestand: a.download }), 'ok');
}
$('btnDiag').onclick = diagnoseFoto;

// Camera of beamer verschoven? Dan klopt de kalibratie niet meer. Eens per seconde
// kijken; twee keer achter elkaar verschoven is echt verschoven (en geen voorbijganger).
let schuifAcc = 0;
function checkVerschuiving(dt) {
  if (!app.autoRecal || typeof vision.cameraShift !== 'function' || app.busy || app.testMode ||
      !app.H || !vision.ready || !vision.hasBackground) { app.shiftCount = 0; return; }
  schuifAcc += dt;
  if (schuifAcc < 1) return;
  schuifAcc = 0;
  if (performance.now() < (app.recalRust || 0)) return;
  const sh = vision.cameraShift();
  app.shiftCount = sh && sh.moved ? (app.shiftCount || 0) + 1 : 0;
  if (app.shiftCount < 2) return;
  app.shiftCount = 0;
  app.recalRust = performance.now() + 30000;
  herstelNaVerschuiving();
}
async function herstelNaVerschuiving() {
  if (app.speelplek === 'scherm') {
    status(t('De camera is verschoven — klik op Opnieuw leren'), 'err');
    return;
  }
  if (!projOk()) {
    status(t('De camera of beamer is verschoven — klik op "Alles automatisch instellen"'), 'err');
    return;
  }
  const speelde = game.state === 'play';
  if (speelde) { game.togglePause(); toonPlayKnop(); }
  status(t('De camera of beamer is verschoven — ik stel alles opnieuw in'), 'err');
  await runExclusive(async () => {
    if (!(await stelOpnieuwIn())) {
      if (!app.abort) status(t('Opnieuw instellen lukte niet — klik op "Alles automatisch instellen"'), 'err');
      return false;
    }
    status(speelde ? t('Opnieuw ingesteld — klik op "Pauze opheffen" om verder te spelen') : t('Opnieuw ingesteld'), 'ok');
    return true;
  });
}

// ---------------------------------------------------------------- elke minuut controleren
//
// Het licht en de muur veranderen terwijl het spel openstaat: iemand doet een lamp aan, de zon
// komt door het gordijn, er komt iets nieuws aan de muur. Eens per halve seconde meten (zie
// vision.omgevingMeting: een steekproef, dat kost bijna niets), en js/omgeving.js beslist. Dan
// stelt het spel zelf bij: buiten een ronde zodra er niemand voor de muur staat, tijdens een
// ronde pas na afloop. Alleen als de herkenning echt stuk is (bijna alles voorgrond, of een
// overbelicht beeld) gaat de ronde even op pauze. Verschuiven van de camera of de beamer
// controleert checkVerschuiving al elke seconde.
//
// Voor de tests in een echte browser kan het sneller: ?snel=6 in het adres maakt van de minuut
// tien seconden (zie versnelOmgeving). Niet in het paneel.

const OMG = (() => {
  let n = 1;
  try { n = +new URLSearchParams(location.search).get('snel') || 1; } catch { /* geen adres */ }
  return versnelOmgeving(OMGEVING, Math.min(60, n));
})();
const omgWacht = new Omgevingswacht(OMG);
const kleurStand = nieuweKleurstand();
let omgAcc = 0;
// Wat het laatst als voorwerp telde, toen het beeld nog klopte: bij een stuk beeld zegt wat er
// nú telt niets meer (zie onderhoud).
let goedeOmtrekken = { H: null, lijst: [] };
// ... en van de laatste vier seconden (midden in het spel kan net een bal over een briefje gaan).
let recenteOmtrekken = [];

/**
 * Telt dit spoor als voorwerp op de muur (een briefje, de bak)? Wat over het doel heen ligt
 * heet de bak (zie buildObstacles); een enorme vlek daar (een schaduw en iemand die ervoor
 * staat) is dat niet.
 */
function isVoorwerp(sp) {
  const r = app.reasonById.get(sp.id);
  if (r === 'bak' && (sp.cells > projCells() * app.maxFrac || (app.goalTrack && sp.cells > app.goalTrack.cells * 3))) return false;
  return telAlsVoorwerp(r);
}

/** Omtrekken (werkpixels) van wat nu als voorwerp telt: de briefjes en de bak, geen lichtvlek. */
function houdOmtrekken() {
  const uit = [];
  for (const sp of tracks) {
    if (!isVoorwerp(sp) || vision.egaalAnders(sp)) continue;
    const k = (!sp.trusted && sp.fallback) ? sp.fallback : sp.corners;
    uit.push(k.map(c => [c[0], c[1]]));
  }
  return uit;
}

function controleerOmgeving(dt) {
  // De spelers gingen zelf verder na een automatische pauze: dan niet opnieuw pauzeren.
  if (app.autoPauze && game.state === 'play') { app.autoPauze = false; app.melding = null; omgWacht.nietDringend(); }
  if (!vision.ready || app.speelplek === 'demo' || app.testMode || app.busy) { omgAcc = 0; return; }
  // Op de muur alleen met het beamervenster open en een kalibratie: anders valt er niets bij te stellen.
  if (app.speelplek === 'muur' && (!projOk() || !app.H)) { omgAcc = 0; return; }
  omgAcc += dt;
  if (omgAcc < OMG.monster) return;
  const stap = Math.min(2, omgAcc);
  omgAcc = 0;
  const m = vision.omgevingMeting(stap, isVoorwerp, app.H, OMG.tau, OMG.blijvend);
  app.omgMeting = m;
  // De kleuren: altijd, ook in het duel en zonder "Elke minuut controleren".
  kleurStap(kleurStand, m.kleur, stap);
  if (kleurStand.wissel) { kleurStand.wissel = false; kleurenGewisseld(); }
  if (!app.elkeMinuut || !vision.hasBackground || vision.mode !== 'object') return;

  let mensen = false, nieuw = false;
  for (const sp of tracks) {
    const r = app.reasonById.get(sp.id);
    if (r === 'wacht') nieuw = true;
    if (mensachtig(sp, r)) mensen = true;
  }
  if (m.bedekt < OMG.kapotDeel / 2 && !nieuw) {
    goedeOmtrekken = { H: app.H, lijst: houdOmtrekken() };
    recenteOmtrekken = recenteOmtrekken.filter(r => r.H === app.H).slice(-7);
    recenteOmtrekken.push(goedeOmtrekken);
  }
  const lang = game.state === 'play' && ((game.endless && !game.ownSettings) || game.time > OMG.langeRonde);
  const u = omgWacht.stap({ ...m, mensen }, {
    ronde: game.state === 'play' || game.state === 'count',
    lang, rustig: lang && !balBijBak(),
    magLicht: app.fillAuto && app.speelplek === 'muur',
    fill: app.fill, fillMax: 0.55,
    kleur: !kleurStand.ok && kleurTelt() && app.fillAuto && app.speelplek === 'muur' && app.fill < 0.54 && !app.kleurOpgegeven,
  }, stap);
  app.omgActie = u.actie;
  if (u.actie === 'herstel') { onderhoud(u.open); return; }
  if (u.actie === 'speelpauze' && game.state === 'play') {
    // Een rustig moment in een lange ronde: even pauzeren, bijstellen en vanzelf verder (zie
    // onderhoud). Score en tijd blijven staan; de klok telt de pauze niet mee.
    game.togglePause(); toonPlayKnop();
    app.autoPauze = 'even';
    muurMelding(t('Even bijstellen…'), 0);
    onderhoud(u.open);
    return;
  }
  if (u.actie === 'pauze' && game.state === 'play') {
    game.togglePause(); toonPlayKnop();
    app.autoPauze = true;
    status(t('De herkenning werkt even niet (het licht is veranderd) — de ronde staat op pauze tot het bijgesteld is'), 'err');
    muurMelding(t('Even pauze: het licht is veranderd. Ga even opzij, dan stel ik het bij'), 0);
    return;
  }
  // Eén keer zeggen wat er gaat gebeuren, niet elke halve seconde.
  const sleutel = u.open ? u.actie + ':' + u.open.reden : u.actie === 'opgegeven' ? u.actie : '';
  if (sleutel === app.omgGemeld) return;
  app.omgGemeld = sleutel;
  if (u.actie === 'na-ronde' && lang) status(t('Het licht of de muur is veranderd — ik stel het zo even bij, op een rustig moment'));
  else if (u.actie === 'na-ronde') status(t('Het licht of de muur is veranderd — na deze ronde stel ik het vanzelf bij'));
  else if (u.actie === 'wacht' && !app.autoPauze) status(t('Het licht of de muur is veranderd — ik stel het bij zodra er niemand voor de muur staat'));
  else if (u.actie === 'opgegeven') status(t('Het licht of de muur is veranderd, maar vanzelf bijstellen lukte niet — klik op "Opnieuw instellen"'), 'err');
}

/** Gaat er net een bal in de bak? Dan niet midden in het spel pauzeren (zie controleerOmgeving). */
function balBijBak() {
  const g = game.goal;
  if (!g) return false;
  for (const b of game.balls) if (Math.hypot(b.x - g.x, b.y - g.y) < g.r * 3) return true;
  return false;
}

/**
 * Vanzelf bijstellen (zie controleerOmgeving): eventueel de muurverlichting, en dan de muur
 * opnieuw leren. Alles wat als voorwerp telde, blijft meetellen (vision.houdVast). Beweegt er
 * iets tijdens het leren, dan blijft de oude muur en probeert de wacht het later opnieuw.
 */
async function onderhoud(open) {
  const muur = app.speelplek === 'muur';
  const houd = open.reden === 'kapot' ? (goedeOmtrekken.H === app.H ? goedeOmtrekken.lijst : [])
    : app.autoPauze === 'even' ? samenOmtrekken([houdOmtrekken(), ...recenteOmtrekken.filter(r => r.H === app.H).map(r => r.lijst)])
      : houdOmtrekken();
  let gelukt = false;
  app.leerOnrustig = false;
  await runExclusive(async () => {
    // Even zeggen wat er gebeurt; de woorden staan zo in de code, zodat test/taal.mjs ze vindt.
    if (open.reden === 'kleur') app.wiz = { title: 'Even bijstellen', sub: 'meer licht, zodat de camera de kleuren ziet' };
    else if (open.reden === 'muur') app.wiz = { title: 'Even bijstellen', sub: 'de muur is veranderd — even niet voor de muur' };
    else app.wiz = { title: 'Even bijstellen', sub: 'het licht is veranderd — even niet voor de muur' };
    await sleep(1200);
    if (app.abort) return false;
    if (muur && open.licht && app.fillAuto) {
      app.kleurOpgegeven = false;
      await autoLight(kleurTelt() ? app.kleurFill : 0);
      if (app.abort) return false;
    }
    if (muur && open.kleur) {
      await kleurLicht();
      if (app.abort) return false;
    }
    gelukt = await learnWall(false, { houd, stil: true });
    return gelukt;
  });
  app.wiz = null;
  omgWacht.klaar(gelukt);
  app.onderhoud.push({ reden: open.reden, ok: gelukt, t: Math.round(performance.now()) });
  app.omgGemeld = '';
  const n = app.laatstGehouden || 0;
  if (gelukt) {
    const tekst = open.reden === 'kleur' ? t('Muurverlichting hoger gezet, zodat de camera de kleuren ziet')
      : n ? tAantal(n, 'Vanzelf bijgesteld — {n} voorwerp telt nog mee', 'Vanzelf bijgesteld — {n} voorwerpen tellen nog mee')
        : t('Vanzelf bijgesteld');
    status(tekst, 'ok');
  } else if (app.leerOnrustig) status(t('Er bewoog iets voor de muur — ik probeer het zo nog eens'));
  else if (!app.abort) status(t('Vanzelf bijstellen lukte niet — ik probeer het zo nog eens'), 'err');
  if (app.autoPauze === 'even') {
    // Even bijgesteld midden in het spel: altijd vanzelf verder, ook als het niet lukte (dan
    // probeert de wacht het later nog eens, zie Omgevingswacht.klaar).
    app.autoPauze = false;
    app.melding = null;
    if (game.state === 'paused') { game.togglePause(); toonPlayKnop(); game.toonBanner(t('GO'), 0.9); }
    if (gelukt) status(t('Bijgesteld — het spel gaat verder'), 'ok');
  } else if (app.autoPauze) {
    if (gelukt && game.state === 'paused') {
      app.autoPauze = false;
      app.melding = null;
      game.togglePause(); toonPlayKnop();
      game.toonBanner(t('GO'), 0.9);
      status(t('Bijgesteld — de ronde gaat verder'), 'ok');
    } else if (!gelukt) muurMelding(t('Even pauze: het licht is veranderd. Ga even opzij, dan stel ik het bij'), 0);
  } else if (gelukt) muurMelding(open.reden === 'kleur' ? t('Meer licht: de camera ziet de kleuren weer') : t('Licht en muur bijgesteld'), 3);
}

/** De kleuren werden net (on)betrouwbaar (zie kleurStap): de briefjes en de melding. */
function kleurenGewisseld() {
  vision.zetKleurOk(kleurStand.ok);
  if (kleurStand.ok) app.kleurOpgegeven = false;
  if (!kleurTelt()) return;
  if (!kleurStand.ok) {
    const tekst = vision.mode === 'color' ? t('Te donker voor de kleuren van het duel — de kleuren kunnen verkeerd gelezen worden. Meer licht helpt')
      : t('Te donker voor kleuren: speciale briefjes tellen nu als gewone briefjes — meer licht helpt');
    status(tekst, 'err');
    muurMelding(vision.mode === 'color' ? t('Te donker voor de kleuren — meer licht helpt') : t('Te donker voor kleuren: speciale briefjes zijn nu gewoon'), 8);
  } else {
    status(t('Weer genoeg licht: de kleuren tellen weer'), 'ok');
    muurMelding(t('Weer genoeg licht: de kleuren tellen weer'), 4);
  }
}

/**
 * Een korte melding op de muur, sec seconden lang (0 = tot hij weggehaald wordt). tekst komt
 * uit t(): bij het tekenen wordt hij opnieuw vertaald, zodat hij meewisselt met de taal.
 */
function muurMelding(tekst, sec) {
  const h = tHerkomst(tekst);
  app.melding = { nl: h ? h.nl : tekst, vars: h ? h.vars : null, tot: sec ? performance.now() + sec * 1000 : Infinity };
}

/** Staat er nu een melding onderin de muur (buiten een ronde)? Dan houdt de QR-code er afstand van. */
function meldingOnderin() {
  const m = app.melding;
  return !!m && performance.now() < m.tot && game.state !== 'play' && game.state !== 'count';
}

/**
 * De melding tekenen: buiten een ronde als balk onderin, tijdens een ronde klein bovenin onder
 * de score (onderin staat dan meestal de bak). Hier getekend, zodat hij ook in de
 * lichtvoorspelling zit en de camera hem niet voor een voorwerp aanziet. In het duel staat de
 * waarschuwing voor de kleuren buiten een ronde vast in beeld.
 */
function tekenMuurMelding(ctx, w, h) {
  let m = app.melding;
  if (m && performance.now() >= m.tot) { app.melding = m = null; }
  const spelen = game.state === 'play' || game.state === 'count';
  let tekst = m ? t(m.nl, m.vars) : null;
  if (!tekst && vision.mode === 'color' && !kleurStand.ok && !spelen && app.speelplek !== 'demo') tekst = t('Te donker voor de kleuren — meer licht helpt');
  if (!tekst) return;
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const bh = h * 0.08, y = spelen ? h * 0.17 : h - bh;
  let px = Math.round(bh * 0.36);
  ctx.font = '700 ' + px + 'px ui-sans-serif, system-ui, sans-serif';
  const b = ctx.measureText ? ctx.measureText(tekst).width : 0;
  if (b > w * 0.9) { px = Math.max(8, Math.floor(px * w * 0.9 / b)); ctx.font = '700 ' + px + 'px ui-sans-serif, system-ui, sans-serif'; }
  if (!spelen) { ctx.fillStyle = 'rgba(20,24,32,.88)'; ctx.fillRect(0, y, w, bh); }
  ctx.fillStyle = spelen ? '#ffd479' : '#fff';
  ctx.fillText(tekst, w / 2, y + bh / 2);
  ctx.restore();
}

/** Tekst van de startknop, bij de stand van het spel. */
function toonPlayKnop() {
  const s = game.state;
  $('btnPlay').textContent = s === 'paused' ? t('Pauze opheffen') : (s === 'play' || s === 'count') ? t('Pauze') : t('Start ronde');
  $('svStart').textContent = $('btnPlay').textContent;
}

$('btnPlay').onclick = () => {
  sfx.resume();
  if (game.state === 'count') return;                     // aftellen loopt al
  if (game.state === 'play' || game.state === 'paused') { game.togglePause(); toonPlayKnop(); return; }
  game.start(+$('roundLen').value);
  toonPlayKnop();
};

$('btnReset').onclick = () => { game.reset(); toonPlayKnop(); };

document.querySelectorAll('.tabs button').forEach(b => {
  b.onclick = () => {
    document.querySelectorAll('.tabs button').forEach(x => x.classList.remove('on'));
    b.classList.add('on');
    app.debugView = b.dataset.view;
  };
});

// ---------------------------------------------------------------- testmodus met de muis

function worldFromEvent(e) {
  const r = world.getBoundingClientRect();
  const sc = Math.min(r.width / world.width, r.height / world.height);
  const cx = (e.clientX - r.left - (r.width - world.width * sc) / 2) / sc;
  const cy = (e.clientY - r.top - (r.height - world.height * sc) / 2) / sc;
  const s = world.height / game.H;
  return [(cx - (world.width - game.W * s) / 2) / s, cy / s];
}

function noteFromDrag(a, b, team) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len, th = 26;
  return {
    team, vx: 0, vy: 0,
    poly: normalizePoly([
      [a[0] - uy * th, a[1] + ux * th], [b[0] - uy * th, b[1] + ux * th],
      [b[0] + uy * th, b[1] - ux * th], [a[0] + uy * th, a[1] - ux * th],
    ]),
  };
}

world.addEventListener('pointerdown', (e) => {
  if (e.button === 2) return;
  // Demo en scherm: briefjes, bak en bron zoals in het speelscherm (zie wijzerNeer).
  if (app.speelplek !== 'muur') { wijzerNeer(e, world); return; }
  const p = worldFromEvent(e);

  // Doel en bron mag je altijd verslepen, ook zonder testmodus — dat is veel
  // handiger dan de pijltjestoetsen.
  if (e.ctrlKey) {
    game.setSource(p[0], p[1]);
    world.setPointerCapture(e.pointerId); app.dragSource = true; return;
  }
  if (e.altKey || Math.hypot(p[0] - game.goal.x, p[1] - game.goal.y) < game.goal.r) {
    game.setGoal(p[0], p[1]); app.goalTrack = null;
    step('goal', 1);
    world.setPointerCapture(e.pointerId); app.dragGoal = true; return;
  }

  if (!app.testMode) return;
  app.drag = { a: p, b: p, team: e.shiftKey ? 'block' : 'attack' };
  world.setPointerCapture(e.pointerId);
});
world.addEventListener('pointermove', (e) => {
  if (app.sleep) { wijzerBeweeg(e, world); return; }
  const p = worldFromEvent(e);
  if (app.dragGoal) { game.setGoal(p[0], p[1]); return; }
  if (app.dragSource) { game.setSource(p[0], p[1]); return; }
  if (app.drag) app.drag.b = p;
});
const stopDrag = () => { app.dragGoal = false; app.dragSource = false; app.drag = null; app.sleep = null; };
world.addEventListener('pointercancel', stopDrag);
world.addEventListener('lostpointercapture', () => { app.dragGoal = false; app.dragSource = false; });
world.addEventListener('pointerup', () => {
  if (app.sleep) { wijzerLos(); return; }
  app.dragGoal = false; app.dragSource = false;
  if (!app.drag) return;
  const d = app.drag; app.drag = null;
  if (Math.hypot(d.b[0] - d.a[0], d.b[1] - d.a[1]) < 12) return;
  app.testNotes.push(noteFromDrag(d.a, d.b, d.team));
});
world.addEventListener('contextmenu', (e) => { e.preventDefault(); app.testNotes.length = 0; });

window.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;          // sneltoetsen van de browser met rust laten
  const tag = e.target.tagName;
  if (tag === 'INPUT' || tag === 'SELECT' || tag === 'BUTTON') return;
  const stp = e.shiftKey ? 40 : 12;
  let used = true;
  switch (e.key) {
    case 'ArrowLeft': game.setGoal(game.goal.x - stp, game.goal.y); app.goalTrack = null; break;
    case 'ArrowRight': game.setGoal(game.goal.x + stp, game.goal.y); app.goalTrack = null; break;
    case 'ArrowUp': game.setGoal(game.goal.x, game.goal.y - stp); app.goalTrack = null; break;
    case 'ArrowDown': game.setGoal(game.goal.x, game.goal.y + stp); app.goalTrack = null; break;
    case 'a': case 'A': game.setSource(game.source.x - stp, game.source.y); break;
    case 'd': case 'D': game.setSource(game.source.x + stp, game.source.y); break;
    case 'w': case 'W': game.setSource(game.source.x, game.source.y - stp); break;
    case 's': case 'S': game.setSource(game.source.x, game.source.y + stp); break;
    case ' ':
      if (game.state === 'over' || game.state === 'idle') $('btnPlay').click();
      else game.togglePause();
      break;
    default: used = false;
  }
  if (used) e.preventDefault();
});

// ---------------------------------------------------------------- obstakels

/**
 * Hoeveel cellen van het camerabeeld op het beamervlak vallen. De maximale
 * grootte van een voorwerp meten we daartegen af, niet tegen het hele beeld —
 * anders hangt de grens af van hoe ver de camera weg staat.
 */
/**
 * Zoomt het werkbeeld in op het beamervlak. Alles daarbuiten — plafond, zijmuur,
 * bureau — kost alleen resolutie. Na het bijsnijden is een post-it twee tot drie
 * keer zo groot in cellen, en daar hing elke drempel vanaf.
 */
function applyRoi() {
  if (!app.Hinv || !vision.ready || !app.useRoi) return false;
  let u0 = Infinity, v0 = Infinity, u1 = -Infinity, v1 = -Infinity;
  for (const corner of [[0, 0], [1, 0], [1, 1], [0, 1]]) {
    const c = kalNaarCamera(app.H, app.Hinv, corner[0], corner[1]);   // genormaliseerd camerabeeld
    u0 = Math.min(u0, c[0]); u1 = Math.max(u1, c[0]);
    v0 = Math.min(v0, c[1]); v1 = Math.max(v1, c[1]);
  }
  const padU = (u1 - u0) * 0.12, padV = (v1 - v0) * 0.12;
  u0 = Math.max(0, u0 - padU); u1 = Math.min(1, u1 + padU);
  v0 = Math.max(0, v0 - padV); v1 = Math.min(1, v1 + padV);
  if (!(u1 - u0 > 0.05 && v1 - v0 > 0.05)) return false;

  const W = vision.video.videoWidth || vision.vw, H = vision.video.videoHeight || vision.vh;
  const roi = { sx: u0 * W, sy: v0 * H, sw: (u1 - u0) * W, sh: (v1 - v0) * H };
  // Niet de moeite als het beamervlak toch al bijna het hele beeld vult.
  if (roi.sw * roi.sh > W * H * 0.80) { setRoi(null); return false; }
  setRoi(roi);
  const zoom = Math.sqrt((W * H) / (roi.sw * roi.sh));
  status(t('Beeld bijgesneden tot het beamervlak — {zoom}× meer detail', { zoom: zoom.toFixed(1) }), 'ok');
  return true;
}

function setRoi(roi) {
  vision.setRoi(roi);
  debug.width = vision.vw; debug.height = vision.vh;
  app.projCellsFor = null;
  applySliders();
}

function projCells() {
  if (app.projCells && app.projCellsFor === app.H) return app.projCells;
  let n = 0;
  for (let cy = 0; cy < vision.rows; cy++) {
    for (let cx = 0; cx < vision.cols; cx++) {
      const p = toProj((cx + 0.5) * vision.cell, (cy + 0.5) * vision.cell);
      if (p[0] >= 0 && p[0] <= 1 && p[1] >= 0 && p[1] <= 1) n++;
    }
  }
  // Ondergrens: bij een scheve kalibratie mag de groottegrens niet zo klein
  // worden dat ineens alles "te groot" heet.
  app.projCells = Math.max(vision.cols * vision.rows * 0.05, n);
  app.projCellsFor = app.H;
  return app.projCells;
}

/** Een verkeerde koppeling mag nooit een bal wegschieten. */
function clampSpeed(vx, vy) {
  const sp = Math.hypot(vx, vy), max = 1500;
  if (!Number.isFinite(sp)) return [0, 0];
  return sp > max ? [vx * max / sp, vy * max / sp] : [vx, vy];
}

/** Obstakel voor het spel uit een spoor, met een omtrek in camerapixels. */
function obstacleFrom(t, corners, pending = false) {
  const poly = corners.map(c => { const p = toProj(c[0], c[1]); return [p[0] * game.W, p[1] * game.H]; });
  const p0 = toProj(t.cx, t.cy);
  const p1 = toProj(t.cx + t.vx * 0.05, t.cy + t.vy * 0.05);
  const v = clampSpeed((p1[0] - p0[0]) * game.W / 0.05, (p1[1] - p0[1]) * game.H / 0.05);
  const kind = app.special && vision.mode === 'object' && t.kind ? t.kind : undefined;
  app.reasonById.set(t.id, pending ? 'wacht' : 'telt');
  return { poly: normalizePoly(poly), id: t.id, team: t.cls, pending, vx: v[0], vy: v[1], kind };
}

/** Raakt dit spoor de bak (binnen twee cellen)? Zonder bekende bak: ligt het op het doel? */
function tegenDeBak(t, binTrack) {
  if (binTrack) {
    const gap = 2 * vision.cell;
    for (const p of t.corners) {
      if (inConvex(binTrack.corners, p[0], p[1])) return true;
      for (const q of binTrack.corners) if (Math.hypot(p[0] - q[0], p[1] - q[1]) < gap) return true;
    }
    return false;
  }
  const q = toProj(t.cx, t.cy);
  return Math.hypot(q[0] * game.W - game.goal.x, q[1] * game.H - game.goal.y) < game.goal.r;
}

function buildObstacles(tracks) {
  const out = [];
  if (!app.H) { app.active = 0; app.rejected = 0; app.rejectIds.clear(); return out; }
  const counts = { attack: 0, block: 0, goal: 0, source: 0, object: 0 };

  // In voorwerpmodus is de bak zelf ook een vlek. Die mag geen obstakel zijn:
  // pak elke keer de vlek die het dichtst bij het vorige doel ligt.
  let binTrack = null;
  if (vision.mode === 'object' && app.goalTrack) {
    let bestD = 70 * 70;
    for (const t of tracks) {
      const d = (t.cx - app.goalTrack.cx) ** 2 + (t.cy - app.goalTrack.cy) ** 2;
      const ratio = t.cells / app.goalTrack.cells;
      if (d < bestD && ratio > 0.35 && ratio < 3) { bestD = d; binTrack = t; }
    }
    if (binTrack && !setGoalFromBlob(binTrack)) { app.goalTrack = null; binTrack = null; }
  }
  // Ligt er iets precies op het doel, dan is dát de bak — ook als hij er al hing toen
  // de muur geleerd werd, of als je het doel met de muis op je bak hebt gesleept. Een
  // obstakel over de ingang van de bak maakt scoren onmogelijk.
  if (vision.mode === 'object' && !binTrack && !(game.goalSweep && !game.goal.auto)) {
    for (const t of tracks) {
      const poly = t.corners.map(c => { const q = toProj(c[0], c[1]); return [q[0] * game.W, q[1] * game.H]; });
      if (inConvex(poly, game.goal.x, game.goal.y)) { binTrack = t; break; }
    }
  }

  const objectMode = vision.mode === 'object';
  let rejected = 0;
  const reasons = {};
  app.rejectIds.clear();
  app.reasonById.clear();
  if (binTrack) app.reasonById.set(binTrack.id, 'bak');

  let bestGoal = null, bestSrc = null;
  for (const t of tracks) {
    if (t === binTrack) continue;
    counts[t.cls] = (counts[t.cls] || 0) + 1;
    if (vision.mode === 'color' && t.cls === 'goal') { if (!bestGoal) bestGoal = t; continue; }
    if (vision.mode === 'color' && t.cls === 'source') { if (!bestSrc) bestSrc = t; continue; }

    const uv = t.corners.map(c => toProj(c[0], c[1]));

    // Mensen eruit filteren. Een neergezet of vastgehouden voorwerp ligt hélemaal
    // binnen het beamervlak, raakt de rand van het camerabeeld niet en is niet
    // groot. Een mens faalt altijd op minstens een van die drie: wie ervoor gaat
    // staan steekt over de rand van het beamervlak of het camerabeeld heen.
    let pending = false;
    const drop = (why) => { rejected++; reasons[why] = (reasons[why] || 0) + 1; app.rejectIds.add(t.id); app.reasonById.set(t.id, why); };

    if (objectMode) {
      // Huid- of schaduwkleurig is verdacht, maar een bruin of zwart briefje heeft die
      // kleur ook — zeker onder warm lamplicht. Zulke vlekken tellen pas mee als ze
      // vertrouwen verdiend hebben: stil hangen, niet trillen, en geen afgekeurd
      // lichaamsdeel ernaast (zie vision.earnTrust). De mensenregels hieronder gelden
      // daarna gewoon nog.
      // Een vertrouwd briefje waar net iets tegenaan kwam: telt met zijn oude vorm,
      // zonder wat erbij kwam — ook als het geheel niet meer verdacht oogt.
      if (!t.trusted && t.fallback) { out.push(obstacleFrom(t, t.fallback)); continue; }
      const vermomd = vision.disguise(t);
      if (vermomd && !t.trusted) { drop(vermomd); continue; }
      // Een schaduw die vast zit aan de bak is de schaduw van de bak zelf; die mag de
      // ingang niet dichtzetten. Een donker briefje náást de bak telt wel.
      if (vermomd === 'schaduw' && tegenDeBak(t, binTrack)) { drop('bak'); continue; }
    }

    if (objectMode && app.noPeople) {
      if (t.touchEdge) { drop('rand'); continue; }
      if (t.cells > projCells() * app.maxFrac) { drop('groot'); continue; }
      let outside = false;
      for (const p of uv) {
        if (p[0] < -0.005 || p[0] > 1.005 || p[1] < -0.005 || p[1] > 1.005) { outside = true; break; }
      }
      if (outside) { drop('buiten'); continue; }
      // Massiefheid is goedkoper en sterker dan de grootte- en hoogteregels die hier
      // stonden: die keurden ook gewone voorwerpen af. Een post-it, boek of doos vult
      // zijn omhullende bijna helemaal; een arm of gespreide hand niet.
      if (t.solidity < 0.72) { drop('vorm'); continue; }
      if (t.age < 12) pending = true;                 // nog onbekend is geen obstakel
      else if (!t.rigid) { drop('mens'); continue; }
      if (t.stable < app.stableNeed) pending = true;
    }
    out.push(obstacleFrom(t, t.corners, pending));
  }
  app.rejected = rejected;
  app.reasons = reasons;
  app.active = out.filter(o => !o.pending).length;
  if (bestGoal) {
    const p = toProj(bestGoal.cx, bestGoal.cy);
    game.goal.x = p[0] * game.W; game.goal.y = p[1] * game.H; game.goal.auto = true;
  }
  if (bestSrc) {
    const p = toProj(bestSrc.cx, bestSrc.cy);
    game.source.x = p[0] * game.W; game.source.y = p[1] * game.H; game.source.auto = true;
  }
  for (const id in counts) {
    const el = document.querySelector('[data-cnt="' + id + '"]');
    if (el) el.textContent = counts[id];
  }
  return out;
}

// ---------------------------------------------------------------- tekenen

/** Ligt deze camerapixel (in het werkbeeld) op het beamervlak? */
function inProjection(x, y) {
  if (!app.H) return true;
  const p = toProj(x, y);
  return p[0] >= 0 && p[0] <= 1 && p[1] >= 0 && p[1] <= 1;
}

/**
 * De muurverlichting afstellen: van zacht naar helderder, tot de camera het
 * beamervlak goed genoeg ziet. In een lichte kamer blijft het bij een zweem grijs;
 * in een donkere kamer is dit het enige licht waarmee de camera je voorwerpen ziet.
 * Tellen de kleuren mee (speciale briefjes, het duel), dan ook zo hoog dat de camera
 * de kleuren kan zien (zie kleurenGoed). vanaf: niet zachter dan dit.
 */
async function autoLight(vanaf = 0) {
  // Eerst zonder verlichting: in een gewone, verlichte kamer ziet de camera de muur
  // prima en is een grijze waas op het spelbeeld alleen maar minder mooi.
  const niveaus = [0, 0.12, 0.25, 0.4, 0.55].filter((lv, i, a) => lv >= vanaf - 0.01 || i === a.length - 1);
  const hoogste = niveaus[niveaus.length - 1];
  let gekozen = hoogste, gemeten = 0;
  app.wiz = { title: 'Licht afstellen', sub: 'even niet voor de beamer gaan staan' };
  await sleep(700);
  app.wiz = null;
  for (const lv of niveaus) {
    if (app.abort) break;
    app.fill = lv; game.fill = lv;
    app.calPattern = { kind: 'fill' };
    await sleep(800);                                   // camera laten wennen
    vision.grab();
    gemeten = vision.meanLuma(inProjection);
    if (gemeten >= 80 && (lv >= hoogste || !kleurTelt() || await kleurenGoed())) { gekozen = lv; break; }
  }
  app.calPattern = null;
  zetFill(gekozen);
  app.camLuma = gemeten;
  if (gemeten < 45) {
    status(t('Het is erg donker — de camera ziet weinig, ook met de muurverlichting. Doe een lamp aan'), 'err');
  }
  return true;
}

/** De muurverlichting op lv (0..1), met de regelaar erbij, en bewaren. */
function zetFill(lv) {
  app.fill = lv; game.fill = lv;
  $('fill').value = Math.round(lv * 100);
  $('fillOut').textContent = Math.round(lv * 100) + '%';
  save();
}

/** Tellen de kleuren mee: de speciale briefjes, of het duel van de post-its? */
function kleurTelt() {
  return vision.mode === 'color' || (vision.mode === 'object' && app.special);
}

/**
 * Kan de camera nu de kleuren zien? Zes beelden, een vijfde seconde uit elkaar: de
 * kleurkorrel is het verschil tussen twee beelden (zie vision.omgevingMeting). Tijdens het
 * instellen, terwijl de beamer de muurverlichting projecteert.
 */
async function kleurenGoed() {
  vision.grab();
  vision.omgevingMeting(0, null, app.H);
  let goed = 0;
  for (let i = 0; i < 5; i++) {
    await sleep(200);
    vision.grab();
    if (kleurOordeel(vision.omgevingMeting(0, null, app.H).kleur) !== false) goed++;
  }
  return goed >= 4;
}

/**
 * De kleuren waren in het donker niet te vertrouwen: de muurverlichting stap voor stap hoger
 * (hooguit 55%), tot de camera ze wel ziet. Lukt dat niet, dan blijft het zo, en tellen de
 * speciale briefjes als gewone briefjes (zie kleurenGewisseld). Daarna moet de muur opnieuw
 * geleerd worden: de verlichting hoort bij de lege muur.
 */
async function kleurLicht() {
  const niveaus = [0.25, 0.4, 0.55].filter(lv => lv > app.fill + 0.01);
  app.wiz = null;
  for (const lv of niveaus) {
    if (app.abort) return false;
    app.fill = lv; game.fill = lv;
    app.calPattern = { kind: 'fill' };
    await sleep(1000);
    if (await kleurenGoed()) { app.calPattern = null; app.kleurFill = lv; zetFill(lv); return true; }
  }
  app.calPattern = null;
  if (niveaus.length) zetFill(niveaus[niveaus.length - 1]);
  app.kleurOpgegeven = true;
  return false;
}

function drawPattern(ctx, w, h) {
  const k = app.calPattern.kind;
  if (k === 'white') { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); return; }
  if (k === 'fill') {
    const f = Math.round(Math.max(0, Math.min(1, app.fill)) * 255);
    ctx.fillStyle = 'rgb(' + f + ',' + f + ',' + f + ')';
    ctx.fillRect(0, 0, w, h);
    return;
  }
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, w, h);
  if (k === 'marker') {
    const t = CAL_TARGETS[app.calPattern.i];
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(t[0] * w, t[1] * h, Math.min(w, h) * 0.075, 0, 7);
    ctx.fill();
  } else if (k === 'stip') {
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(app.calPattern.u * w, app.calPattern.v * h, Math.min(w, h) * app.calPattern.r, 0, 7);
    ctx.fill();
  } else if (k === 'verify') {
    const m = Math.min(w, h) * 0.02;
    ctx.strokeStyle = '#3ddc84';
    ctx.lineWidth = Math.max(4, m * 0.6);
    ctx.strokeRect(m, m, w - m * 2, h - m * 2);
    ctx.fillStyle = '#3ddc84';
    ctx.font = '700 ' + Math.round(h * 0.055) + 'px ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(t('Gekalibreerd'), w / 2, h * 0.5);
  }
}

function drawWizard(ctx, w, h) {
  if (app.speelplek === 'scherm') {
    // op een scherm: over het camerabeeld heen, dan zie je meteen wat de camera ziet
    tekenCameraBeeld(ctx, w, h);
    ctx.fillStyle = 'rgba(5,7,10,.55)';
  } else ctx.fillStyle = '#05070a';
  ctx.fillRect(0, 0, w, h);
  const s = h / 1000;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#fff';
  // Te breed voor het venster (een lange Engelse zin, of een smal beamervenster)? Dan kleiner:
  // anders viel "Drag this window to the projector" aan beide kanten van het beeld af.
  const letter = (tekst, gewicht, px) => {
    ctx.font = gewicht + ' ' + px + 'px ui-sans-serif, system-ui, sans-serif';
    const b = ctx.measureText ? ctx.measureText(tekst).width : 0;
    if (b > w * 0.92) ctx.font = gewicht + ' ' + Math.max(8, Math.floor(px * w * 0.92 / b)) + 'px ui-sans-serif, system-ui, sans-serif';
  };
  // Nederlandse zinnen, hier pas vertaald: zo wisselt de aanwijzing op de muur meteen mee
  const titel = t(app.wiz.title);
  letter(titel, '800', Math.round(110 * s));
  ctx.fillText(titel, w / 2, h * 0.40);
  if (app.wiz.sub) {
    ctx.fillStyle = '#8b93a5';
    const sub = t(app.wiz.sub);
    letter(sub, '500', Math.round(46 * s));
    ctx.fillText(sub, w / 2, h * 0.52);
  }
  if (app.wiz.count) {
    ctx.fillStyle = '#ff8a1e';
    ctx.font = '800 ' + Math.round(200 * s) + 'px ui-sans-serif, system-ui, sans-serif';
    ctx.fillText(String(app.wiz.count), w / 2, h * 0.72);
  }
  ctx.textBaseline = 'top';
}

const KRUIS_TEKST = new TaalTeller('Klik kruis {n} aan in het camerabeeld op de laptop');

function drawCalibration(ctx, w, h) {
  ctx.fillStyle = '#0a0a0a';
  ctx.fillRect(0, 0, w, h);
  CAL_TARGETS.forEach((t, i) => {
    const x = t[0] * w, y = t[1] * h;
    const done = i < app.calPts.length, active = i === app.calPts.length;
    const col = done ? '#3ddc84' : active ? '#ff8a1e' : '#555';
    ctx.strokeStyle = col; ctx.fillStyle = col;
    ctx.lineWidth = active ? 6 : 4;
    const R = active ? 54 : 40;
    ctx.beginPath();
    ctx.moveTo(x - R, y); ctx.lineTo(x + R, y);
    ctx.moveTo(x, y - R); ctx.lineTo(x, y + R);
    ctx.stroke();
    ctx.beginPath(); ctx.arc(x, y, R * 0.45, 0, 7); ctx.stroke();
    ctx.beginPath(); ctx.arc(x, y, 6, 0, 7); ctx.fill();
    ctx.font = '700 34px ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(i + 1), x, y - R - 26 < 20 ? y + R + 26 : y - R - 26);
  });
  ctx.fillStyle = '#999';
  ctx.font = '600 26px ui-sans-serif, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(KRUIS_TEKST.tekst(Math.min(4, app.calPts.length + 1)), w / 2, h * 0.5);
  ctx.textBaseline = 'top';
}

/**
 * Welke waarschuwingsbalk er onderin de muur staat: 'kalibratie' (niet gekalibreerd),
 * 'leren' (muur nog niet geleerd) of null. Niet zolang het welkomstkaartje er staat: dan
 * is er nog niets gekozen om in te stellen.
 */
function onderbalkSoort() {
  if (!app.plekGekozen) return null;
  if (!app.H && !app.testMode) return 'kalibratie';
  if (vision.mode === 'object' && !vision.hasBackground && !app.testMode && vision.ready) return 'leren';
  return null;
}

function drawScene(ctx, w, h) {
  if (app.calPattern) { drawPattern(ctx, w, h); return; }
  if (app.wiz) { drawWizard(ctx, w, h); return; }
  if (app.calibrating) { drawCalibration(ctx, w, h); return; }
  game.render(ctx, w, h);
  if (app.speelplek === 'demo') tekenKruisjes(ctx, w, h);

  if (app.projHint) {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = 'rgba(200,205,215,.8)';
    ctx.font = '600 ' + Math.max(12, Math.round(h * 0.026)) + 'px ui-sans-serif, system-ui, sans-serif';
    ctx.fillText(t('Klik één keer in dit venster voor volledig scherm'), w / 2, h * 0.975);
    ctx.restore();
  }

  // Zonder kalibratie weet het spel niet waar de voorwerpen liggen, en raken de
  // ballen dus niets. Dat mag je nooit per ongeluk over het hoofd zien.
  const balk = onderbalkSoort();
  if (balk === 'kalibratie') {
    const bh = h * 0.13;
    ctx.fillStyle = '#b3261e';
    ctx.fillRect(0, h - bh, w, bh);
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '800 ' + Math.round(bh * 0.34) + 'px ui-sans-serif, system-ui, sans-serif';
    ctx.fillText(t('NIET GEKALIBREERD'), w / 2, h - bh * 0.62);
    ctx.font = '500 ' + Math.round(bh * 0.2) + 'px ui-sans-serif, system-ui, sans-serif';
    ctx.fillText(t('voorwerpen raken de ballen niet — klik op "Alles automatisch instellen"'), w / 2, h - bh * 0.25);
    ctx.textBaseline = 'top';
  } else if (balk === 'leren') {
    const bh = h * 0.11;
    ctx.fillStyle = '#7a4a10';
    ctx.fillRect(0, h - bh, w, bh);
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '700 ' + Math.round(bh * 0.3) + 'px ui-sans-serif, system-ui, sans-serif';
    ctx.fillText(app.speelplek === 'scherm' ? t('Nog niet geleerd — klik op Opnieuw leren') : t('Muur nog niet geleerd'), w / 2, h - bh * 0.5);
    ctx.textBaseline = 'top';
  }

  // Een korte melding (vanzelf bijgesteld, te donker voor kleuren), alleen zonder balk.
  if (!balk) tekenMuurMelding(ctx, w, h);

  // De QR-code voor de telefoon, alleen buiten een ronde. Hier getekend, zodat hij ook in
  // de lichtvoorspelling zit en de camera hem niet voor een voorwerp aanziet.
  telefoon.tekenMuur(ctx, w, h);
}

const maskTmp = document.createElement('canvas');
const mtctx = maskTmp.getContext('2d');

function drawDebug(tracks) {
  const c = dctx;
  c.save();
  c.clearRect(0, 0, debug.width, debug.height);
  if (app.debugView === 'mask' && vision.ready && vision.maskImage) {
    maskTmp.width = vision.cols; maskTmp.height = vision.rows;
    mtctx.putImageData(vision.maskImage, 0, 0);
    c.imageSmoothingEnabled = false;
    c.drawImage(maskTmp, 0, 0, debug.width, debug.height);
    if (vision.mode === 'object' && !vision.hasBackground) {
      c.fillStyle = '#ffab8f'; c.font = '13px system-ui, sans-serif'; c.textAlign = 'center';
      c.fillText(app.speelplek === 'scherm' ? t('Nog niet geleerd — klik op Opnieuw leren') : t('Muur nog niet geleerd'), debug.width / 2, debug.height / 2);
    }
  } else if (vision.ready) {
    c.drawImage(vision.cv, 0, 0);
  } else {
    c.fillStyle = '#111'; c.fillRect(0, 0, debug.width, debug.height);
    c.fillStyle = '#666'; c.font = '13px system-ui, sans-serif'; c.textAlign = 'center';
    c.fillText(t('Camera nog niet gestart'), debug.width / 2, debug.height / 2);
  }

  for (const t of tracks) {
    const dropped = app.rejectIds.has(t.id);
    const C = vision.classes.find(x => x.id === t.cls);
    c.strokeStyle = dropped ? 'rgba(255,90,90,.6)' : (C ? C.css : '#7ae7ff');
    c.lineWidth = dropped ? 1 : 2;
    if (dropped) c.setLineDash([4, 4]);
    // Telt een briefje even met zijn oude vorm, laat dan ook die zien.
    const k = (!t.trusted && t.fallback) ? t.fallback : t.corners;
    c.beginPath();
    c.moveTo(k[0][0], k[0][1]);
    for (let i = 1; i < k.length; i++) c.lineTo(k[i][0], k[i][1]);
    c.closePath(); c.stroke();
    c.setLineDash([]);
  }

  if (app.goalTrack) {
    c.strokeStyle = '#3ddc84'; c.lineWidth = 2;
    c.beginPath(); c.arc(app.goalTrack.cx, app.goalTrack.cy, 14, 0, 7); c.stroke();
  }

  if (app.Hinv) {
    c.strokeStyle = 'rgba(255,255,255,.5)';
    c.setLineDash([5, 4]); c.lineWidth = 1.5;
    c.beginPath();
    [[0, 0], [1, 0], [1, 1], [0, 1]].forEach((p, i) => {
      const q = fromProj(p[0], p[1]);
      i ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1]);
    });
    c.closePath(); c.stroke();
    c.setLineDash([]);
  }

  app.calPts.forEach((p, i) => {
    c.strokeStyle = '#3ddc84'; c.lineWidth = 2;
    c.beginPath(); c.arc(p[0], p[1], 9, 0, 7); c.stroke();
    c.fillStyle = '#3ddc84'; c.font = '700 12px system-ui, sans-serif'; c.textAlign = 'center';
    c.fillText(String(i + 1), p[0], p[1] - 12);
  });
  c.restore();
}

function updateProjectionMask() {
  // Op een scherm valt er geen licht van ons op de tafel: niets te voorspellen.
  if (vision.mode !== 'object' || !vision.hasBackground || !app.H || !vision.ready || app.speelplek !== 'muur') {
    if (vision.ready) vision.setProjection(null, 0, 0, null);
    return;
  }
  const pw = Math.max(8, Math.round(PRED_H * game.W / game.H));
  if (projBuf.width !== pw) {
    projBuf.width = pw; projBuf.height = PRED_H;
    projLumaArr = new Float32Array(pw * PRED_H);
  }
  drawScene(pbctx, pw, PRED_H);
  const d = pbctx.getImageData(0, 0, pw, PRED_H).data;
  // De muurverlichting zit al in de geleerde muur. Alleen wat daarvan afwijkt — een
  // bal, de score, het doel — is extra licht (of minder licht) waar de camera op moet
  // letten.
  const fl = Math.round(Math.max(0, Math.min(1, app.fill)) * 255);
  if (!projSignedArr || projSignedArr.length !== projLumaArr.length) projSignedArr = new Float32Array(projLumaArr.length);
  const span = Math.max(1, 255 - fl);
  for (let i = 0; i < projLumaArr.length; i++) {
    const l = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
    projLumaArr[i] = Math.abs(l - fl);
    projSignedArr[i] = Math.max(0, l - fl) / span;
  }
  // Waar elke cel in deze voorspelling valt, verandert alleen met de kalibratie, de uitsnede,
  // het spiegelen of het camerabeeld: vision.js onthoudt het zolang deze sleutel gelijk blijft.
  const v = vision.video;
  projSleutel[0] = app.H; projSleutel[1] = vision.roi; projSleutel[2] = vision.mirror;
  projSleutel[3] = vision.cols; projSleutel[4] = vision.rows; projSleutel[5] = v.videoWidth; projSleutel[6] = v.videoHeight;
  vision.setProjection(projLumaArr, pw, PRED_H, toProj, projSignedArr, projSleutel);
}
const projSleutel = [null, null, false, 0, 0, 0, 0];

// ---------------------------------------------------------------- hoofdlus

/**
 * De weergave rechts zo groot als zijn vak, maar nooit smaller dan het speelveld (verhouding
 * ar): op een staand scherm (een iPad rechtop) wordt het doek dan lager, en zet object-fit:
 * contain het in het midden. Anders vielen de teksten op de muur over elkaar of buiten beeld.
 */
function fitWereld(ar) {
  const r = world.getBoundingClientRect();
  const w = Math.max(2, Math.round(r.width));
  let h = Math.max(2, Math.round(r.height));
  if (ar > 0 && w / h < ar) h = Math.max(2, Math.round(w / ar));
  if (world.width !== w || world.height !== h) { world.width = w; world.height = h; }
}

// Waarom een vlek niet meetelt, voor de teller onder "Doel aanwijzen" (zie buildObstacles).
const REDENEN = { rand: 'loopt beeld uit', groot: 'te groot', buiten: 'buiten beamervlak',
                  hoog: 'te hoog', mens: 'mens', vorm: 'geen voorwerpvorm',
                  schaduw: 'donker of schaduw (telt als het stil hangt)',
                  huid: 'huidkleur (telt als het stil hangt)', bak: 'schaduw van de bak' };

let last = performance.now();
let visionAcc = 0;
let tracks = [];
let fpsAcc = 0, fpsN = 0;
let liveAcc = 0;
let staleBg = 0;
let beeldjeNr = 0;               // telt de beeldjes, om iets maar eens per zoveel te doen
let nieuwVoorDebug = true;       // kwam er een nieuw herkend camerabeeld sinds drawDebug?

// Hoe vlot het loopt, voor de wacht op trage computers (zie js/kwaliteit.js) en om zelf te
// zien: sc.prestatie in de console, en rechtsboven naast de fps.
const prestatie = { fps: 0, beeldMs: 0, herkenningMs: 0, niveau: 0 };
const ema = (oud, nu) => (oud ? oud + (nu - oud) * 0.1 : nu);

// De wacht voor trage computers begint altijd op alles, behalve als hij vastgezet is: met
// ?kwaliteit=vol in het adres (de tests), of stickyclash.kwaliteit = 'vol' in de opslag.
// Zie js/kwaliteit.js.
const kw = (() => {
  let bewaard = null;
  try { bewaard = localStorage.getItem('stickyclash.kwaliteit'); } catch { /* opslag geblokkeerd */ }
  const b = kwaliteitBijStart(location.search, bewaard);
  const k = new Kwaliteit(b.niveau);
  if (b.vast) k.vast(b.niveau);
  return k;
})();
const VOL_DEELTJES = game.maxDeeltjes;
let kwGemeld = false;
const spelStap = (h) => game.update(h);

/** De stand van de wacht doorvoeren (zie js/kwaliteit.js). gewisseld: hij veranderde net. */
function pasKwaliteitToe(gewisseld) {
  const n = kw.niveau;
  prestatie.niveau = n;
  game.gloed = n < 1;
  game.maxDeeltjes = n < 1 ? VOL_DEELTJES : 80;
  svVak.b = -1;                                  // het speelscherm opnieuw op maat (scherpte)
  if (!gewisseld) return;
  if (n > 0 && !kwGemeld && !app.busy) {
    kwGemeld = true;
    status(t('Deze computer heeft het zwaar — het spel tekent nu wat eenvoudiger, zodat het vlot blijft'));
  }
  toonFps();
}

/** Rechtsboven: beeldjes per seconde, hoe lang het herkennen duurt, en of het spel zuinig tekent. */
function toonFps() {
  let s = Math.round(prestatie.fps) + ' fps';
  if (vision.ready && prestatie.herkenningMs) s += ' · ' + t('herkenning {n} ms', { n: Math.round(prestatie.herkenningMs) });
  if (kw.niveau) s += ' · ' + t('zuinig {n}', { n: kw.niveau });
  $('fps').textContent = s;
}

function frame() {
  // De tijd van dit venster, niet die van rAF: soms tekent het beamervenster de lus (zie
  // volgendBeeld), en dat heeft zijn eigen klok.
  const now = performance.now();
  const ruw = Math.max(0, (now - last) / 1000);
  const dt = Math.min(0.05, ruw);
  last = now;
  // Echte beeldjes per seconde, ook onder de 20 (met dt bleef dat steken op 20).
  fpsAcc += ruw; fpsN++;
  if (fpsAcc > 0.5) { prestatie.fps = fpsN / fpsAcc; toonFps(); fpsAcc = 0; fpsN = 0; }
  // De wacht voor trage computers: niet tijdens het instellen, en niet als niemand het ziet.
  const gewisseld = kw.meet(ruw * 1000, document.visibilityState === 'visible' && !app.busy && !app.calPattern);
  if (gewisseld || prestatie.niveau !== kw.niveau) pasKwaliteitToe(gewisseld);
  beeldjeNr++;

  if (app.svOpen) svMaat();
  if (app.proj && app.proj.closed) { app.proj = null; app.projCtx = null; step('proj', 0); }
  const ar = veldVerhouding();
  fitWereld(ar);
  if (app.speelplek === 'demo') demoVeld(ar);
  game.setAspect(ar);

  // Alleen verwerken als de camera echt een nieuw beeld heeft. Dubbele beelden gaven
  // schokkerige snelheden; en blijft het beeld staan, dan zeggen we dat. De echte beelden
  // telt volgCamerabeelden; kan deze browser dat niet, of is het paneel verborgen (dan
  // telt hij niet), dan kijken we of video.currentTime veranderde.
  visionAcc += dt;
  if (vision.ready && !app.busy) {
    const echt = app.beeldT > 0 && document.visibilityState === 'visible';
    let nieuw;
    if (echt) {
      nieuw = app.beeldNr !== app.verwerktNr;
      app.videoStill = Math.max(0, (now - app.beeldT) / 1000);
    } else {
      const vt = vision.video.currentTime;
      nieuw = vt !== app.lastVideoTime;
      if (nieuw) { app.lastVideoTime = vt; app.videoStill = 0; } else app.videoStill += dt;
    }
    // Op een heel trage computer (stand 3) hooguit 15 keer per seconde herkennen, zodat er
    // tijd overblijft om te tekenen.
    if (nieuw && visionAcc >= (kw.niveau >= 3 ? 1 / 15 : 1 / 40)) {
      app.verwerktNr = app.beeldNr;
      const t0 = performance.now();
      tracks = vision.detect(Math.min(0.1, visionAcc)); visionAcc = 0;
      prestatie.herkenningMs = ema(prestatie.herkenningMs, performance.now() - t0);
      nieuwVoorDebug = true;
    }
    if (app.videoStill > 2 && !app.stillWarned) {
      app.stillWarned = true;
      status(t('Het camerabeeld staat stil — sluit programma\'s die de camera gebruiken, of kies een andere camera'), 'err');
    }
    if (app.videoStill < 0.5 && app.stillWarned) { app.stillWarned = false; status(t('Camerabeeld is terug'), 'ok'); }
  }
  checkVerschuiving(dt);
  controleerOmgeving(dt);
  if (app.syncTip) app.syncTip();
  app.projHint = projOk() && !app.projFull && !app.busy && game.state !== 'play' && game.state !== 'count';
  game.fill = app.speelplek === 'muur' ? app.fill : 0;

  if (app.speelplek === 'demo') {
    game.setObstacles(demoObstakels());
  } else if (app.testMode) {
    const obs = app.testNotes.slice();
    if (app.drag) obs.push(noteFromDrag(app.drag.a, app.drag.b, app.drag.team));
    game.setObstacles(obs);
  } else if (!app.busy) {
    game.setObstacles(buildObstacles(tracks));
  } else {
    game.setObstacles([]);
  }

  const before = game.state;
  // Eén stap is hooguit 0,05 s, anders vliegt een bal door een briefje heen. Een traag
  // beeldje (minder dan 20 per seconde) krijgt daarom meer stapjes: zonder die stapjes liep
  // op een oude computer alles in slow motion, ook de klok van de ronde. Op een gewone
  // computer is het altijd één stap, precies zoals het was.
  inStapjes(ruw, spelStap);
  // Een versleept briefje beweegt alleen in het beeldje waarin je het verschoof (zie wijzerBeweeg).
  if (app.speelplek === 'demo') {
    for (let i = 0; i < app.demoBriefjes.length; i++) { app.demoBriefjes[i].vx = 0; app.demoBriefjes[i].vy = 0; }
  }
  // Muziek alleen tijdens het spelen; sneller in de laatste tien seconden en per level.
  sfx.muziek.volg(game.state, game.laatsteTien(), game.level);
  if (before !== game.state) {
    if (game.state === 'over') {
      app.best[bestSleutel()] = Math.max(app.best[bestSleutel()] || 0, game.best);
      save();
      toonPlayKnop();
      status(game.levelMode ? t('Uitdaging voorbij: je haalde level {n}', { n: game.levelReached || 1 })
        : (game.newRecord ? tAantal(game.best, 'Nieuw record: {n} doelpunt', 'Nieuw record: {n} doelpunten') : t('Ronde afgelopen')), 'ok');
      rondeVoorbij();
    } else if (game.state === 'play' && before === 'count') {
      toonPlayKnop();
    }
  }
  telefoon.bijwerken(now);

  // Als bijna het hele beeld ineens voorgrond is, klopt de geleerde muur niet
  // meer — meestal omdat iemand het licht aan of uit deed.
  // Ook schaduwcellen meetellen: als het licht uitgaat wordt het hele beeld
  // 'schaduw' en zou de waarschuwing anders nooit afgaan terwijl de herkenning
  // in stilte dood is.
  const bedekt = vision.fgFraction + (vision.shadowFraction || 0);
  if (vision.mode === 'object' && vision.hasBackground && bedekt > 0.45) staleBg += dt;
  else staleBg = 0;

  liveAcc += dt;
  if (liveAcc > 0.25) {
    liveAcc = 0;
    const el = $('live');
    // op een scherm heet het anders: geen muur en geen muurverlichting
    const scherm = app.speelplek === 'scherm';
    if (app.testMode) el.textContent = tAantal(game.obstacles.length, '{n} obstakel (testmodus)', '{n} obstakels (testmodus)');
    else if (!app.H) el.textContent = t('Niet gekalibreerd — voorwerpen raken de ballen niet');
    else if (vision.mode === 'object' && !vision.hasBackground) el.textContent = scherm ? t('Nog niet geleerd — klik op Opnieuw leren') : t('Muur nog niet geleerd');
    else if (staleBg > 2) el.textContent = app.elkeMinuut ? t('Bijna alles wordt als voorwerp gezien — het licht is veranderd. Ik stel het zo vanzelf bij')
      : scherm ? t('Bijna alles wordt als voorwerp gezien — licht veranderd? Klik op Opnieuw leren')
        : t('Bijna alles wordt als voorwerp gezien — licht veranderd? Leer de muur opnieuw');
    else if (vision.floodGuard && vision.mode === 'object') el.textContent = scherm ? t('Het licht is flink veranderd — herkenning werkt beperkt. Klik op Opnieuw leren')
      : t('Het licht is flink veranderd — herkenning werkt beperkt. Leer de muur opnieuw');
    else if (app.camLuma >= 0 && app.camLuma < 40) el.textContent = scherm ? t('De camera ziet te weinig licht ({n}/255) — doe een lamp aan', { n: Math.round(app.camLuma) })
      : t('De camera ziet te weinig licht ({n}/255) — zet Muurverlichting hoger of doe een lamp aan', { n: Math.round(app.camLuma) });
    else {
      const uitleg = Object.keys(app.reasons || {})
        .map(k => app.reasons[k] + '× ' + (REDENEN[k] ? t(REDENEN[k]) : k)).join(', ');
      let txt = tAantal(app.active, '{n} voorwerp actief', '{n} voorwerpen actief')
        + (app.rejected ? ' · ' + t('genegeerd: {lijst}', { lijst: uitleg }) : '')
        + (!kleurStand.ok && kleurTelt() ? ' · ' + t('te donker voor kleuren') : '');
      // Het lastigste geval om zelf te zien: er wordt wél iets opgemerkt, maar het
      // valt onder de minimale grootte. Dan zwijgt de teller normaal helemaal.
      if (!app.active && vision.tooSmall > 0) {
        const klein = tAantal(vision.tooSmall, '{n} vlek te klein — zet Min. grootte lager, of Gevoeligheid hoger',
          '{n} vlekken te klein — zet Min. grootte lager, of Gevoeligheid hoger');
        txt = app.rejected ? txt + ' · ' + klein : klein;
      }
      el.textContent = txt;
    }
    if (vision.ready && vision.data) app.camLuma = vision.meanLuma(inProjection);
    el.className = 'live' + ((!app.active && vision.tooSmall > 0) || !app.H || staleBg > 2 || (vision.floodGuard && vision.mode === 'object') ||
      (!kleurStand.ok && kleurTelt()) ||
      (app.camLuma >= 0 && app.camLuma < 40) || (vision.mode === 'object' && !vision.hasBackground) ? ' warn' : '');
    houdWakker();
  }

  if (projOk()) drawScene(app.projCtx, app.projCtx.canvas.width, app.projCtx.canvas.height);
  // Het speelscherm dekt het paneel af: dan hoeft de weergave rechts niet getekend. Op een
  // trage computer (stand 1 en hoger) met de beamer open is die weergave alleen een
  // voorbeeld: dan eens per vier beeldjes.
  if (app.svOpen) { koppelSvVideo(); drawScene(svCtx, svCanvas.width, svCanvas.height); }
  else if (!kw.niveau || !projOk() || beeldjeNr % 4 === 0) drawScene(wctx, world.width, world.height);
  updateProjectionMask();
  // Het camerabeeld in het paneel: op een trage computer alleen als het te zien is en er
  // een nieuw herkend beeld is.
  if (!kw.niveau || (nieuwVoorDebug && !app.svOpen && document.visibilityState === 'visible')) {
    drawDebug(tracks);
    nieuwVoorDebug = false;
  }
  prestatie.beeldMs = ema(prestatie.beeldMs, performance.now() - now);
  volgendBeeld();
}

// ---- de lus aan de gang houden
//
// Normaal tekent requestAnimationFrame van dit venster de lus. Maar een verborgen venster
// krijgt geen beeldjes meer: minimaliseer je het paneel (of staat het achter een ander
// venster), dan bevroor de muur. Is het paneel verborgen en het beamervenster open, dan
// tekent daarom dat venster de lus.
let lusVenster = null, lusId = 0;
function volgendBeeld() {
  const w = projOk() && document.visibilityState === 'hidden' ? app.proj : window;
  try { lusId = w.requestAnimationFrame(frame); lusVenster = w; }
  catch { lusId = requestAnimationFrame(frame); lusVenster = window; }
}
/** Het juiste venster tekent niet (meer) de lus: daar opnieuw beginnen. */
function lusAan() {
  const wil = projOk() && document.visibilityState === 'hidden' ? app.proj : window;
  if (lusVenster === wil) return;
  if (lusVenster) { try { lusVenster.cancelAnimationFrame(lusId); } catch { /* venster al dicht */ } }
  volgendBeeld();
}
document.addEventListener('visibilitychange', () => {
  // Weer in beeld (na een ander tabblad, of een geminimaliseerd paneel): zolang het venster
  // verborgen was, telde volgCamerabeelden geen beelden. Dan niet meteen "het camerabeeld
  // staat stil" zeggen; staat hij echt stil, dan komt die melding twee seconden later alsnog.
  if (document.visibilityState === 'visible' && app.beeldT) app.beeldT = performance.now();
  lusAan(); houdWakker();
});

// ---- het scherm wakker houden
//
// Tijdens het spelen raakt niemand de laptop aan: dan zette de computer na een paar minuten
// het scherm uit, en de beamer ook. Zolang het beamervenster of het speelscherm open is, of
// er een ronde loopt, vragen we de browser het scherm aan te laten (waar dat kan).
let wakker = null, wakkerVenster = null, wakkerBezig = false, wakkerNiet = 0;
function houdWakker() {
  const wil = projOk() || app.svOpen || game.state === 'play' || game.state === 'count' || game.state === 'paused';
  // ging het venster dicht dat hem vroeg (het beamervenster), dan is hij ook weg
  if (wakker && wakkerVenster && wakkerVenster.closed) wakker = null;
  if (wakkerBezig || wil === !!wakker) return;
  if (!wil) { const w = wakker; wakker = null; try { w.release().catch(() => {}); } catch { /* al los */ } return; }
  // Vragen mag alleen vanuit een zichtbaar venster: het paneel, of anders het beamervenster.
  // Een verborgen paneel (geminimaliseerd, zie volgendBeeld) raakt hem kwijt, en dan ging
  // midden in het spel toch de beamer uit. Mislukt het, dan een halve minuut niet.
  const venster = document.visibilityState === 'visible' ? window
    : projOk() && app.proj.document.visibilityState === 'visible' ? app.proj : null;
  const nav = venster && venster.navigator;
  if (!nav || !nav.wakeLock || performance.now() < wakkerNiet) return;
  wakkerBezig = true;
  nav.wakeLock.request('screen').then((w) => {
    wakker = w; wakkerVenster = venster;
    w.addEventListener('release', () => { if (wakker === w) wakker = null; });
  }, () => { wakkerNiet = performance.now() + 30000; }).then(() => { wakkerBezig = false; });
}

// ---------------------------------------------------------------- speelplek: muur, scherm of demo
//
// Drie manieren van spelen (zie js/speelplek.js). Muur + beamer is alles hierboven. Op een
// scherm is het hele camerabeeld het speelveld: geen beamer, niets te kalibreren, en het
// spel staat over het camerabeeld heen. De demo heeft geen camera nodig: de briefjes zijn
// obstakels die je met de muis of je vinger sleept en tekent. Scherm en demo spelen in het
// speelscherm, over het hele venster; de weergave rechts laat hetzelfde zien.

const svCanvas = $('svCanvas');
const svCtx = svCanvas.getContext('2d');
const svVideo = $('svVideo');   // de camera onder het speelveld, op een scherm (zie koppelSvVideo)
let svVideoNiet = null;         // deze camerastroom wilde de <video> niet: dan niet elk beeldje opnieuw
const demoLijst = [];           // de obstakels van de demo, elk beeldje opnieuw gevuld
const svVak = { b: -1, h: -1, ar: -1 };   // waarvoor het speelscherm zijn maat het laatst kreeg

/** Staat de pagina in een ingesloten venster (een iframe, zoals op itch.io)? */
function ingesloten() {
  try { return window.top !== window.self; } catch { return true; }
}

/** Kan de camera hier? Zonder iets te vragen: de browser laat niets zien. */
function bekijkCamera() {
  let beleid = null;
  const fp = document.permissionsPolicy || document.featurePolicy;
  try { if (fp && fp.allowsFeature) beleid = fp.allowsFeature('camera'); } catch { /* onbekend */ }
  app.camReden = cameraReden({
    api: !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia),
    veilig: !!window.isSecureContext, ingesloten: ingesloten(), beleid, geweigerd: app.camGeweigerd,
  });
  toonCamReden();
}

/** Staat de camera voor deze pagina op geblokkeerd? Ook dat vragen kost geen venster. */
async function vraagCameraStand() {
  try {
    if (!navigator.permissions) return;
    const st = await navigator.permissions.query({ name: 'camera' });
    const volg = () => { app.camGeweigerd = st.state === 'denied'; bekijkCamera(); };
    volg();
    st.onchange = volg;
  } catch { /* deze browser kent dat niet */ }
}

/** Waarom de camera hier niet kan, in gewone woorden. */
function camRedenTekst(r) {
  if (r === 'ingesloten') return t('In dit ingesloten venster mag het spel de camera niet gebruiken. De demo werkt hier wel.');
  if (r === 'onveilig') return t('Via dit adres geeft de browser de camera niet vrij (geen https). De demo werkt hier wel.');
  if (r === 'geen-api') {
    // Op een iPhone of iPad is elke browser vanbinnen Safari: een andere kiezen helpt niet.
    // Wel als de pagina in een app opende (een link in een chat): dan in Safari zelf.
    return OP_IOS ? t('Deze browser kan de camera niet gebruiken: open deze pagina in Safari. De demo werkt hier wel.')
      : t('Deze browser kan de camera niet gebruiken: probeer een recente Chrome, Edge, Firefox of Safari. De demo werkt hier wel.');
  }
  if (r === 'popup') return t('Het beamervenster kan hier niet open: dit is een ingesloten venster.');
  return t('De camera is geblokkeerd voor deze pagina — klik in de adresbalk op het camera-icoon, zet de camera op Toestaan (in Firefox: haal de blokkade weg met ×) en herlaad de pagina.');
}

/** De uitleg bij de camerakeuzes, met een link naar een eigen tabblad als dat helpt. */
function toonCamReden() {
  // (dat het beamervenster niet open mag, doet er alleen bij muur + beamer toe)
  const r = app.camReden || (app.popupNiet && app.speelplek === 'muur' ? 'popup' : null);
  for (const p of document.querySelectorAll('.camniet')) {
    p.textContent = '';
    p.classList.toggle('hidden', !r);
    if (!r) continue;
    p.append(camRedenTekst(r));
    if (r === 'ingesloten' || r === 'onveilig' || r === 'popup') {
      const a = document.createElement('a');
      a.href = r === 'onveilig' ? SPEL_ADRES : eigenTabblad(location.href);
      a.target = '_blank';
      a.rel = 'noopener';
      a.textContent = t('Open het spel in een eigen tabblad');
      p.append(' ', a);
    }
  }
}

/**
 * Naar een andere speelplek. Muur en scherm delen de camera, maar niet wat ze geleerd
 * hebben: een muur onder beamerlicht is iets anders dan een tafel zonder. De kalibratie
 * van de beamer blijft bewaard (app.muurH) zolang je op een scherm speelt.
 */
function zetSpeelplek(plek) {
  if (!SPEELPLEKKEN.includes(plek)) return;
  const was = app.speelplek;
  app.plekGekozen = true;
  if (plek !== was) {
    if (was === 'scherm') {
      app.H = app.muurH; app.Hinv = app.H ? invertH(app.H) : null; app.muurH = null;
      vergeetMuur();
      if (vision.ready && app.H) applyRoi();
    }
    if (plek === 'scherm') {
      app.muurH = app.H;
      // Een open beamervenster gooit licht op de tafel dat het spel hier niet voorspelt.
      if (projOk()) app.proj.close();
      app.proj = null; app.projCtx = null; step('proj', 0);
      if (vision.ready) setRoi(null);
      vergeetMuur();
      zetSchermVeld();
    }
    if (plek === 'demo') {
      // De demo gebruikt geen camera: uit, dan brandt ook het lampje niet.
      vision.stop(); tracks = []; step('cam', 0); step('bg', 0);
    }
    app.goalTrack = null;
    app.speelplek = plek;
    game.reset();
  }
  pasSpeelplekToe();
  toonPlayKnop();
  save();
}

/** Op een scherm: het hele camerabeeld is het speelveld, eventueel gespiegeld. */
function zetSchermVeld() {
  app.H = schermHomografie(!!app.schermSpiegel);
  app.Hinv = invertH(app.H);
  app.projCellsFor = null;
  $('schermSpiegel').checked = !!app.schermSpiegel;
}

function zetSchermSpiegel(aan) {
  app.schermSpiegel = !!aan;
  if (app.speelplek === 'scherm') zetSchermVeld();
  save();
  status(app.schermSpiegel ? t('Gespiegeld: links en rechts zijn om') : t('Niet gespiegeld'), 'ok');
}

/** Alles wat van de speelplek afhangt: wat het paneel laat zien, en hoe het spel tekent. */
function pasSpeelplekToe() {
  const p = app.speelplek, b = document.body.classList;
  b.toggle('plek-muur', p === 'muur');
  b.toggle('plek-scherm', p === 'scherm');
  b.toggle('plek-demo', p === 'demo');
  b.toggle('welkom-open', !app.plekGekozen);
  $('welkom').classList.toggle('hidden', app.plekGekozen);
  document.querySelectorAll('#plekSeg button').forEach(k => k.classList.toggle('on', k.dataset.plek === p));
  game.duel = vision.mode === 'color' && p !== 'demo';
  // Zuinig met licht alleen waar de camera naar ons eigen beeld kijkt: op de muur.
  game.lowLight = vision.mode === 'object' && p === 'muur';
  game.papier = p === 'demo';
  game.showOutlines = p === 'scherm' || (p === 'muur' && $('outline').checked);
  game.onderlaag = p === 'scherm' ? tekenCameraBeeld : null;
  app.testMode = p === 'demo' || (p === 'muur' && $('testMode').checked);
  game.best = app.best[bestSleutel()] || 0;
  updateTips();
  toonRang();
  toonSchermKnop();
  toonModeHint();
  toonCamReden();
}

/** Staat alles klaar om op een scherm te spelen: camera aan en de lege ondergrond geleerd? */
function schermKlaar() {
  return app.speelplek === 'scherm' && vision.ready && (vision.hasBackground || vision.mode !== 'object');
}

/** De grote knop bij Scherm: eerst instellen, daarna terug naar het speelscherm. */
function toonSchermKnop() {
  $('btnScherm').textContent = schermKlaar() ? t('Naar het speelscherm') : t('Start op dit scherm');
}

/** Wat de statusregel zegt bij het opstarten. */
function toonStartStatus() {
  if (!app.plekGekozen) { status(t('Welkom! Kies hieronder hoe je wilt spelen')); return; }
  if (app.speelplek === 'demo') { status(t('Klik op "Speel de demo"')); return; }
  if (!window.isSecureContext) {
    status(BESTURING === 'windows' ? t('Open sticky-clash.html of start.bat — zo geeft de browser geen camera vrij')
      : t('Open sticky-clash.html, of speel online — zo geeft de browser geen camera vrij'), 'err');
  } else if (app.speelplek === 'scherm') status(t('Klik op "Start op dit scherm"'));
  else toonMuurStart();
}

/**
 * Bij muur + beamer: wat je moet doen, en wat deze computer anders doet. Geen waarschuwing
 * op de naam van de browser: Firefox en Safari spelen alles. Alleen weten ze niet waar de
 * beamer hangt; dan sleep je het beamervenster er zelf heen. En een tablet of telefoon kan
 * het beamervenster niet apart openen.
 */
function toonMuurStart() {
  if (!APART_VENSTER) status(t('Muur + beamer kan alleen met een laptop of computer — speel hier op een scherm of de demo'), 'err');
  else if (!app.ingesteld && app.H) status(t('Klik op "Start: alles klaarzetten" — de rest gaat vanzelf'));
  else if (!SCHERMEN_HERKENNEN) status(t('Klik op "Alles automatisch instellen" — en sleep daarna het beamervenster naar de beamer'));
  else status(t('Klik op "Alles automatisch instellen"'));
}

/**
 * De achtergrond op een scherm: het camerabeeld, iets donkerder, zodat de ballen en de
 * teksten erop opvallen. Precies op het speelveld; gespiegeld als dat aan staat.
 *
 * In het speelscherm staat de camera als <video> onder het doek (zie koppelSvVideo): dan
 * tekent de browser dat beeld zelf, zonder rekenwerk voor het spel, en maken we het doek
 * hier alleen leeg en iets donkerder. Elk beeldje het camerabeeld in het doek tekenen
 * kostte op een trage computer een flink deel van de tijd.
 */
function tekenCameraBeeld(ctx, cw, ch) {
  const sc = ch / game.H, w = game.W * sc, x0 = (cw - w) / 2;
  if (ctx === svCtx && svCanvas.classList.contains('op-video')) {
    ctx.clearRect(0, 0, cw, ch);
    ctx.fillStyle = '#000';
    if (x0 > 0) { ctx.fillRect(0, 0, x0, ch); ctx.fillRect(x0 + w, 0, cw - x0 - w, ch); }
    ctx.fillStyle = 'rgba(6,8,12,.36)';
    ctx.fillRect(x0, 0, w, ch);
    return;
  }
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, cw, ch);
  const v = vision.video;
  if (!vision.ready || v.readyState < 2) return;
  ctx.save();
  if (app.schermSpiegel) { ctx.translate(x0 + w, 0); ctx.scale(-1, 1); ctx.drawImage(v, 0, 0, w, ch); }
  else ctx.drawImage(v, x0, 0, w, ch);
  ctx.restore();
  ctx.fillStyle = 'rgba(6,8,12,.36)';
  ctx.fillRect(x0, 0, w, ch);
}

/**
 * Op een scherm: de camera als <video> onder het speelveld. Pas als die echt beeld heeft,
 * wordt het doek erboven doorzichtig; tot dan (of als het hier niet lukt) tekent
 * tekenCameraBeeld het camerabeeld gewoon zelf.
 */
function koppelSvVideo() {
  const s = app.svOpen && app.speelplek === 'scherm' && vision.ready ? vision.stream : null;
  if (svVideo.srcObject !== s && s !== svVideoNiet) {
    try {
      svVideo.srcObject = s;
      if (s) { const p = svVideo.play(); if (p && p.catch) p.catch(() => {}); }
    } catch { svVideoNiet = s; /* dan tekent het spel het camerabeeld zelf */ }
  }
  // !paused: weigert de browser het afspelen (iOS in energiebesparing), dan tekent het spel
  // het camerabeeld zelf, anders bleef er een stilstaand beeld onder het speelveld
  const aan = !!s && svVideo.srcObject === s && svVideo.readyState >= 2 && svVideo.videoWidth > 0 && !svVideo.paused;
  if (aan === svVideo.classList.contains('hidden')) {
    svVideo.classList.toggle('hidden', !aan);
    svCanvas.classList.toggle('op-video', aan);
  }
  svVideo.classList.toggle('spiegel', !!app.schermSpiegel);
}

/** Hoe breed het speelveld is (breedte gedeeld door hoogte). */
function veldVerhouding() {
  const v = vision.video;
  // op een scherm is het camerabeeld het speelveld
  if (app.speelplek === 'scherm' && vision.ready && v.videoWidth) return v.videoWidth / v.videoHeight;
  if (app.svOpen) return svCanvas.width / svCanvas.height;
  if (projOk()) return app.projCtx.canvas.width / app.projCtx.canvas.height;
  // Anders de vorm van het vak rechts, maar niet smaller dan 1,2 : 1 (zie fitWereld).
  const r = world.getBoundingClientRect();
  const w = Math.max(2, Math.round(r.width)), h = Math.max(2, Math.round(r.height));
  return Math.max(1.2, w / h);
}

// ---- het speelscherm

function openSpeelvenster() {
  if (app.svOpen) return;
  app.svOpen = true;
  $('speelvenster').classList.remove('hidden');
  document.body.classList.add('sv-open');
  // Volledig scherm kan niet overal (een ingesloten venster zonder toestemming, een iPhone):
  // dan geen knop die alleen maar "kan niet" zegt. (Oudere Safari: alleen de webkit-naam.)
  $('svVol').classList.toggle('hidden', !vsKan(document));
  // Haal je een plek op de ranglijst, dan typ je je naam hier: het paneel zit eronder.
  $('svNaam').appendChild($('naamInvoer'));
  svVak.b = -1;
  svMaat();
}

function sluitSpeelvenster() {
  if (!app.svOpen) return;
  app.svOpen = false;
  if (vsElement(document)) vsUit(document);
  koppelSvVideo();                               // de camera onder het speelveld los
  $('speelvenster').classList.add('hidden');
  document.body.classList.remove('sv-open');
  $('ranglijst').insertBefore($('naamInvoer'), $('scoreLijst'));
  app.sleep = null;
}

/**
 * Het speelveld zo groot als past: in de verhouding van het camerabeeld (scherm), of
 * vrij maar niet te smal (demo, zie pasVeld). Alleen opnieuw als er iets veranderde.
 */
function svMaat() {
  const vak = $('svVeld'), bw = vak.clientWidth - 16, bh = vak.clientHeight - 16;
  const v = vision.video;
  const ar = app.speelplek === 'scherm' && vision.ready && v.videoWidth ? v.videoWidth / v.videoHeight : 0;
  if (bw === svVak.b && bh === svVak.h && ar === svVak.ar) return;
  svVak.b = bw; svVak.h = bh; svVak.ar = ar;
  const m = pasVeld(bw, bh, ar);
  // Scherp op een telefoon, maar niet meer dan dubbel: dat kost alleen maar rekenwerk. Op
  // een trage computer (zie js/kwaliteit.js) niet extra scherp, en vanaf stand 2 met 70% van
  // de pixels: dat is wat zachter, maar het blijft vlot.
  const k = (kw.niveau >= 1 ? 1 : Math.min(2, window.devicePixelRatio || 1)) * (kw.niveau >= 2 ? 0.7 : 1);
  svCanvas.width = Math.max(2, Math.round(m.w * k)); svCanvas.height = Math.max(2, Math.round(m.h * k));
  svCanvas.style.width = m.w + 'px'; svCanvas.style.height = m.h + 'px';
  // de camera eronder precies even groot (zie koppelSvVideo)
  svVideo.style.width = m.w + 'px'; svVideo.style.height = m.h + 'px';
}

function volledigScherm() {
  if (vsElement(document)) { vsUit(document); return; }
  const niet = () => status(t('Volledig scherm kan hier niet — in een ingesloten venster mag dat soms niet'), 'err');
  vsAan($('speelvenster')).catch(niet);
}

// ---- de demo

/** De beginopstelling neerleggen: bak, bron en zes briefjes (zie demoOpstelling). */
function legDemoNeer() {
  const o = demoOpstelling(game.W, game.H);
  app.demoBriefjes = o.briefjes;
  game.goal.r = o.doel.r;
  game.setGoal(o.doel.x, o.doel.y);
  game.setSource(o.bron.x, o.bron.y);
  game.breakables.clear();
  app.demoW = game.W;
  app.sleep = null;
}

/**
 * Het veld wordt breder of smaller (speelscherm open of dicht, telefoon gedraaid): bak, bron
 * en briefjes schuiven mee als één geheel, zodat de baan blijft werken (zie demoMee).
 */
function demoVeld(ar) {
  if (!app.demoW) { game.setAspect(ar); legDemoNeer(); return; }
  const W = game.H * ar;
  if (Math.abs(W - game.W) >= 0.5) {
    const gx = demoMee(game.goal.x, game.W, W), bx = demoMee(game.source.x, game.W, W);
    game.setAspect(ar);
    game.setGoal(gx, game.goal.y);
    game.setSource(bx, game.source.y);
  }
  // De briefjes horen bij het veld van app.demoW: dat kan ook van vóór een uitstapje
  // naar de muur of het scherm zijn.
  if (Math.abs(game.W - app.demoW) >= 0.5) {
    briefjesMee(app.demoBriefjes, app.demoW, game.W, game.H);
    app.demoW = game.W;
  }
}

/** De demo spelen: speelscherm open, en de ballen vallen meteen (na 3, 2, 1). */
function demoStart() {
  sfx.resume();
  if (app.speelplek !== 'demo') zetSpeelplek('demo');
  openSpeelvenster();
  if (game.state === 'idle' || game.state === 'over') {
    $('btnPlay').click();
    game.spawnAcc = 1;          // de eerste bal valt meteen bij GO, niet pas een tel later
  }
  status(t('Demo: sleep de briefjes zo dat de ballen in de groene bak vallen'), 'ok');
}

/** De obstakels van de demo: de briefjes, en het briefje dat je nu tekent (dat raakt nog niets). */
function demoObstakels() {
  demoLijst.length = 0;
  for (let i = 0; i < app.demoBriefjes.length; i++) demoLijst.push(app.demoBriefjes[i]);
  const s = app.sleep;
  if (s && s.soort === 'nieuw' && s.briefje) demoLijst.push(s.briefje);
  return demoLijst;
}

/**
 * Canvaspixels per CSS-pixel op canvas cv. Met object-fit: contain kan het beeld kleiner zijn
 * dan het vak (zie fitWereld): dan telt de kant die vol is.
 */
function doekSchaal(cv) {
  const r = cv.getBoundingClientRect();
  return Math.max(cv.width / Math.max(1, r.width), cv.height / Math.max(1, r.height));
}

/** Hoeveel CSS-pixels één wereldeenheid is op canvas cv. */
function pixPerEenheid(cv) {
  return Math.max(0.05, cv.height / doekSchaal(cv) / game.H);
}

/** Plek in het speelveld (wereldcoördinaten) onder de muis of vinger, op canvas cv. */
function veldVan(e, cv) {
  const r = cv.getBoundingClientRect();
  const k = doekSchaal(cv);                            // canvaspixels per CSS-pixel
  // een rand boven en onder (of links en rechts) als het beeld niet het hele vak vult
  const ox = (r.width * k - cv.width) / 2, oy = (r.height * k - cv.height) / 2;
  const sc = cv.height / game.H;
  return [((e.clientX - r.left) * k - ox - (cv.width - game.W * sc) / 2) / sc, ((e.clientY - r.top) * k - oy) / sc];
}

/** Het kruisje van een briefje, binnen het veld gehouden (zo tekent tekenKruisjes het ook). */
function kruisjeIn(poly, r) {
  const k = kruisjeVan(poly);
  return [Math.min(k[0], game.W - r), Math.max(k[1], r)];
}
const kruisStraal = (ppe) => Math.max(15, 11 / ppe);   // hoe groot het kruisje getekend wordt

/**
 * Muis of vinger omlaag in het speelveld (demo en scherm). In de demo eerst: het kruisje
 * van een briefje (weghalen), een briefje (verslepen, of bij een dubbeltik weghalen). Dan
 * overal: de bak en de balbron verslepen. En op een lege plek in de demo: een nieuw
 * briefje tekenen. Geeft true als er iets gepakt werd.
 */
function wijzerNeer(e, cv) {
  if (e.button === 2) return false;
  const p = veldVan(e, cv), ppe = pixPerEenheid(cv);
  const demo = app.speelplek === 'demo', lijst = app.demoBriefjes;
  if (demo) {
    const r = kruisStraal(ppe), raak = Math.max(r * 1.4, 18 / ppe);
    for (let i = lijst.length - 1; i >= 0; i--) {
      const k = kruisjeIn(lijst[i].poly, r);
      if (Math.hypot(p[0] - k[0], p[1] - k[1]) < raak) { lijst.splice(i, 1); app.tik = null; return true; }
    }
    const i = briefjeOp(lijst, p[0], p[1], Math.max(4, 8 / ppe));
    if (i >= 0) {
      const b = lijst[i], nu = performance.now();
      if (dubbeltik(app.tik, nu, p[0], p[1], b)) { lijst.splice(i, 1); app.tik = null; return true; }
      app.tik = { t: nu, x: p[0], y: p[1], doel: b };
      lijst.splice(i, 1); lijst.push(b);               // bovenop: als laatste getekend
      app.sleep = { soort: 'briefje', briefje: b, x: p[0], y: p[1], t: nu };
      cv.setPointerCapture(e.pointerId);
      return true;
    }
  }
  const g = game.goal, s = game.source;
  if (Math.hypot(p[0] - g.x, p[1] - g.y) < g.r) {
    app.sleep = { soort: 'doel', dx: p[0] - g.x, dy: p[1] - g.y };
    app.goalTrack = null;
    cv.setPointerCapture(e.pointerId);
    return true;
  }
  if (Math.hypot(p[0] - s.x, p[1] - s.y) < Math.max(50, 22 / ppe)) {
    app.sleep = { soort: 'bron', dx: p[0] - s.x, dy: p[1] - s.y };
    cv.setPointerCapture(e.pointerId);
    return true;
  }
  if (!demo) return false;
  const soort = app.demoKleur, kind = soort === 'los' ? undefined : soort;
  const kleur = kind ? DEMO_SPECIAAL[kind] : DEMO_KLEUREN[Math.floor(Math.random() * DEMO_KLEUREN.length) % DEMO_KLEUREN.length];
  app.sleep = { soort: 'nieuw', a: p, kind, kleur, briefje: null };
  cv.setPointerCapture(e.pointerId);
  return true;
}

function wijzerBeweeg(e, cv) {
  const s = app.sleep;
  if (!s) return;
  const p = veldVan(e, cv);
  if (s.soort === 'doel') { game.setGoal(p[0] - s.dx, p[1] - s.dy); step('goal', 1); return; }
  if (s.soort === 'bron') { game.setSource(p[0] - s.dx, p[1] - s.dy); return; }
  if (s.soort === 'nieuw') {
    s.briefje = briefjeUitSleep(s.a, p, s.kind, s.kleur);
    if (s.briefje) s.briefje.pending = true;          // pas als je loslaat raakt het de ballen
    return;
  }
  if (s.soort === 'briefje') {
    const nu = performance.now(), dt = Math.max(1 / 120, (nu - s.t) / 1000);
    const d = schuifBriefje(s.briefje, p[0] - s.x, p[1] - s.y, game.W, game.H);
    // Zo snel beweeg je het: dan geeft een geschoven briefje een bal ook echt een klap.
    const v = clampSpeed(d[0] / dt, d[1] / dt);
    s.briefje.vx = v[0]; s.briefje.vy = v[1];
    s.x += d[0]; s.y += d[1]; s.t = nu;
  }
}

function wijzerLos() {
  const s = app.sleep;
  app.sleep = null;
  if (!s || s.soort !== 'nieuw' || !s.briefje) return;
  if (app.demoBriefjes.length >= DEMO_MAX) {
    status(t('Genoeg briefjes — haal er eerst een weg (dubbeltik of ×)'), 'err');
    return;
  }
  s.briefje.pending = false;
  app.demoBriefjes.push(s.briefje);
}

svCanvas.addEventListener('pointerdown', (e) => { if (wijzerNeer(e, svCanvas)) e.preventDefault(); });
svCanvas.addEventListener('pointermove', (e) => wijzerBeweeg(e, svCanvas));
svCanvas.addEventListener('pointerup', wijzerLos);
svCanvas.addEventListener('pointercancel', () => { app.sleep = null; });
svCanvas.addEventListener('contextmenu', (e) => e.preventDefault());

/** In de demo: een klein kruisje rechtsboven elk briefje, om het weg te halen. */
function tekenKruisjes(ctx, w, h) {
  const sc = h / game.H, ox = (w - game.W * sc) / 2;
  // zo hoog als het beeld op het scherm staat (met object-fit: contain soms lager dan het vak)
  const cv = ctx.canvas, hoog = cv.clientHeight ? Math.min(cv.clientHeight, cv.clientWidth * cv.height / cv.width) : h;
  const r = kruisStraal(hoog / game.H) * sc, d = r * 0.42;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineWidth = Math.max(1.5, r * 0.2);
  for (let i = 0; i < app.demoBriefjes.length; i++) {
    const poly = app.demoBriefjes[i].poly;
    let x1 = -Infinity, y0 = Infinity;
    for (let j = 0; j < poly.length; j++) { if (poly[j][0] > x1) x1 = poly[j][0]; if (poly[j][1] < y0) y0 = poly[j][1]; }
    const x = ox + Math.min(x1 * sc, game.W * sc - r), y = Math.max(y0 * sc, r);
    ctx.fillStyle = 'rgba(12,14,19,.8)';
    ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
    ctx.strokeStyle = '#e8eaf0';
    ctx.beginPath();
    ctx.moveTo(x - d, y - d); ctx.lineTo(x + d, y + d);
    ctx.moveTo(x + d, y - d); ctx.lineTo(x - d, y + d);
    ctx.stroke();
  }
  ctx.restore();
}

// ---- spelen op een scherm

/**
 * Spelen op een scherm: camera aan, het hele beeld wordt het speelveld, en het spel leert
 * hoe de lege ondergrond eruitziet. Geen beamer, dus geen kalibratie en geen wit licht.
 */
function schermStart() {
  sfx.resume();
  if (app.speelplek !== 'scherm') zetSpeelplek('scherm');
  // Kan de camera hier niet? Dan zeggen we waarom, in het paneel: daar staat de demo naast.
  if (app.camReden && app.camReden !== 'geweigerd') { sluitSpeelvenster(); status(camRedenTekst(app.camReden), 'err'); return false; }
  openSpeelvenster();
  return runExclusive(async () => {
    if (!vision.ready) {
      status(t('Camera starten — klik op Toestaan als de browser erom vraagt'));
      app.wiz = { title: 'Momentje', sub: 'klik op Toestaan als de browser om de camera vraagt' };
      // Geen camera (geweigerd, bezet, niet gevonden)? Terug naar het paneel, met de melding:
      // een zwart speelscherm zegt niemand iets.
      if (!(await startCamera())) { sluitSpeelvenster(); return false; }
    }
    if (app.abort) return false;
    if (app.schermSpiegel === null) {
      // Een ingebouwde camera kijkt naar jou: dan is gespiegeld wat je verwacht.
      const tr = vision.stream && vision.stream.getVideoTracks()[0];
      app.schermSpiegel = !!(tr && INGEBOUWD.test(tr.label || ''));
    }
    zetSchermVeld();
    setRoi(null);
    toonSchermKnop();
    if (vision.mode === 'object' && !(await learnWall(true))) return false;
    if (app.abort) return false;
    app.wiz = { title: 'Klaar', sub: 'leg je briefjes neer en start de ronde' };
    await sleep(1100);
    app.wiz = null;
    save();
    return true;
  });
}

/** Opnieuw leren hoe de lege ondergrond eruitziet (op een scherm). */
function schermLeer() {
  if (!vision.ready) { schermStart(); return; }
  if (app.busy) return;
  // Tijdens het leren telt geen enkel voorwerp: een lopende ronde gaat eerst op pauze.
  if (game.state === 'play') { game.togglePause(); toonPlayKnop(); }
  runExclusive(() => learnWall(true));
}

// ---- knoppen

// Muur + beamer kiezen is een klik: daarin mag het beamervenster open, dus begint meteen het
// hele instellen (camera, beamervenster, kalibratie, licht, de muur en de bak).
document.querySelectorAll('#welkom .plekknop').forEach(k => {
  k.onclick = () => {
    const plek = k.dataset.plek;
    if (plek === 'demo') { demoStart(); return; }
    zetSpeelplek(plek);
    if (plek === 'scherm') schermStart();
    else muurStart();
  };
});
/** Muur + beamer gekozen: meteen alles automatisch instellen (zie autoSetup). */
function muurStart() {
  toonAutoKnop();
  if (!APART_VENSTER || app.busy) { toonMuurStart(); return; }
  autoSetup();
}
document.querySelectorAll('#plekSeg button').forEach(k => {
  k.onclick = () => {
    k.blur();
    const plek = k.dataset.plek;
    if (app.busy || plek === app.speelplek) return;
    zetSpeelplek(plek);
    if (plek === 'muur') toonMuurStart();
    else status(plek === 'demo' ? t('Klik op "Speel de demo"') : t('Klik op "Start op dit scherm"'));
  };
});
// Vanuit de demo meteen echt spelen: op een scherm blijft het speelscherm open.
document.querySelectorAll('.sv-cta button').forEach(k => {
  k.onclick = () => {
    if (k.dataset.plek === 'scherm') { schermStart(); return; }
    sluitSpeelvenster();
    zetSpeelplek('muur');
    muurStart();
  };
});
$('btnDemo').onclick = demoStart;
$('btnScherm').onclick = () => {
  if (schermKlaar()) { openSpeelvenster(); return; }
  schermStart();
};
$('btnSchermLeer').onclick = schermLeer;
$('schermSpiegel').onchange = (e) => zetSchermSpiegel(e.target.checked);

// Na een klik de knop weer loslaten: anders drukt spatie hem nog eens in.
const svKnop = (id, f) => { $(id).onclick = () => { $(id).blur(); f(); }; };
svKnop('svStart', () => $('btnPlay').click());
svKnop('svLeer', schermLeer);
svKnop('svSpiegel', () => zetSchermSpiegel(!app.schermSpiegel));
svKnop('svBegin', () => { legDemoNeer(); status(t('De briefjes liggen weer zoals in het begin'), 'ok'); });
svKnop('svVol', volledigScherm);
svKnop('svSluit', sluitSpeelvenster);
document.querySelectorAll('#svPalet button').forEach(k => {
  k.onclick = () => {
    k.blur();
    app.demoKleur = k.dataset.soort;
    document.querySelectorAll('#svPalet button').forEach(x => x.classList.toggle('on', x === k));
  };
});
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && app.svOpen && !vsElement(document)) sluitSpeelvenster();
});

// ---------------------------------------------------------------- taal (NL | EN)

/** De knoppen NL en EN bovenin: de gekozen taal licht op. */
function toonTaalKnoppen() {
  document.querySelectorAll('#taalKeuze button').forEach(b => {
    const aan = b.dataset.taal === huidigeTaal();
    b.classList.toggle('on', aan);
    b.setAttribute('aria-pressed', aan ? 'true' : 'false');
  });
}

/** Het losse bestand (file://) vraagt bij elke start om de camera: dat zegt de hint bovenaan. */
function toonLosHint() {
  if (location.protocol !== 'file:') return;
  // start.bat bestaat alleen op Windows; elders onthoudt de online versie het
  $('wizHint').textContent = BESTURING === 'windows'
    ? t('Losse versie: de browser vraagt bij elke start om de camera — klik dan op Toestaan. Wil je dat hij het onthoudt, start dan via start.bat.')
    : t('Losse versie: de browser vraagt bij elke start om de camera — klik dan op Toestaan. Wil je dat hij het onthoudt, speel dan online (noaquim.github.io/sticky-clash) of start via start.command of start.sh.');
}

/** Bij "Belichting vastzetten": kan deze camera dat niet, dan zeggen we dat (zie startCamera). */
function toonVastzetHint() {
  $('lockExp').disabled = !app.kanVastzetten;
  $('lockExpHint').textContent = app.kanVastzetten
    ? t('Op sommige camera\'s wordt het beeld dan donkerder. Het spel controleert dat en zet hem dan terug.')
    : t('Deze camera of browser kan de belichting niet vastzetten.');
}

/**
 * Na het wisselen van taal alles opnieuw: de vaste teksten van de pagina, en wat main.js
 * en telefoon.js zelf schrijven. De muur vertaalt al bij het tekenen, en de teller onder
 * "Doel aanwijzen" schrijft zichzelf vier keer per seconde opnieuw.
 */
function nieuweTaal() {
  vertaalPagina(document.body);
  document.title = t('Sticky Clash — projection mapping game');
  toonTaalKnoppen();
  if (statusBron) status(t(statusBron.nl, statusBron.vars), statusBron.kind);
  toonAutoKnop();
  toonPlayKnop();
  toonSchermKnop();
  toonCamReden();
  toonModeHint();
  toonLosHint();
  toonSchermenHint();
  toonVastzetHint();
  toonBeamerHulp();
  toonFps();
  renderClasses();
  updateCal();
  updateTips();
  toonRang();
  if (app.pendingScore) toonNaamVraag();
  for (const f of schuifTeksten) f();
  fillDevices();
  telefoon.toonStatus();
  if (projOk()) app.proj.document.title = t('Sticky Clash — beamer');
  liveAcc = 1;                                     // de teller meteen, niet pas over een kwart seconde
}

// ---------------------------------------------------------------- start

// De vaste teksten van index.html in de gekozen taal (in het Nederlands verandert er niets).
vertaalPagina(document.body);
document.title = t('Sticky Clash — projection mapping game');
toonTaalKnoppen();
laadSpeelplek();
load();
if (app.speelplek === 'scherm') { app.muurH = app.H; zetSchermVeld(); }
renderClasses();
applySliders();
setMode(vision.mode);
updateCal();
refreshSteps();
syncSweeps();
game.endless = $('endless').checked;
$('fill').value = Math.round(app.fill * 100);
$('fillOut').textContent = Math.round(app.fill * 100) + '%';
$('fillAuto').checked = app.fillAuto;
$('lockExp').checked = app.lockExposure;
$('elkeMinuut').checked = app.elkeMinuut;
game.fill = app.fill;
pasSpeelplekToe();
sfx.on = $('sound').checked;
sfx.muziek.aan = $('muziek').checked;
sfx.muziek.kies($('muziekStijl').value);
game.effects = $('effecten').checked;
applySpel();
game.reset();
game.time = +$('roundLen').value;
fillDevices();
toonAutoKnop();
toonStartStatus();
bekijkCamera();
vraagCameraStand();
toonLosHint();
toonSchermenHint();
loadScreens(false);
startApp();
vision.insideFn = inProjection;
vision.onFormatChange = () => {
  debug.width = vision.vw; debug.height = vision.vh;
  applySliders();
  step('bg', 0);
  status(app.speelplek === 'scherm' ? t('De camera wisselde van beeldformaat — klik op Opnieuw leren')
    : t('De camera wisselde van beeldformaat — leer de muur opnieuw'), 'err');
};
opTaal(nieuweTaal);
// Na het kiezen de knop weer loslaten: anders drukt spatie daarna die knop in, in plaats
// van de ronde te starten.
document.querySelectorAll('#taalKeuze button').forEach(b => { b.onclick = () => { zetTaal(b.dataset.taal); b.blur(); }; });
pasKwaliteitToe(false);
volgendBeeld();

// handig bij het afstellen: in de console beschikbaar als window.sc. sc.prestatie: hoe vlot
// het loopt; sc.kwaliteit.vast(0) zet de wacht voor trage computers vast op alles.
// sc.omgeving: de controle van elke minuut (wacht, js/omgeving.js) en of de kleuren te vertrouwen zijn.
window.sc = { app, game, vision, sfx, autoLight, learnWall, diagnoseFoto, rondeVoorbij, bewaarNaam, telefoon,
  zetSpeelplek, demoStart, schermStart, legDemoNeer, openSpeelvenster, sluitSpeelvenster,
  kwaliteit: kw, prestatie, omgeving: { wacht: omgWacht, kleur: kleurStand, OMG } };

// Helemaal opgestart. Het kleine script bovenin index.html kijkt hiernaar: staat dit er na
// het laden niet, dan kon deze browser het spel niet draaien, en zegt het dat (in plaats van
// een pagina waarop niets werkt). Moet de allerlaatste regel blijven.
window.scGestart = true;
