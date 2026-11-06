// Elke minuut controleren (js/omgeving.js), nagespeeld in een nagebouwde kamer (Kamer in
// hulp.mjs) met de echte herkenning (js/vision.js) en dezelfde stappen als main.js
// (controleerOmgeving en onderhoud):
//
//   1. tien minuten een rustige kamer, met ballen tijdens rondes en mensen die langslopen of
//      even blijven staan: nooit vanzelf opnieuw leren
//   2. het licht gaat uit, en het licht gaat aan: meteen bijgesteld (het beeld is stuk)
//   3. een lamp op de muur, een gordijn dat langzaam of ineens opengaat, een nieuwe schaduw,
//      een nieuw ding aan de muur dat geen briefje is: binnen twee minuten bijgesteld
//   4. de briefjes die er hingen tellen daarna nog steeds mee, ook rood, groen en blauw
//   5. nooit leren terwijl er iemand voor de muur staat; tijdens een ronde wachten tot hij
//      voorbij is, behalve als het beeld stuk is (dan pauze)
//   6. zonder tijdslimiet (de ronde houdt nooit op): tien minuten rustig nooit pauzeren; een
//      lamp aan: één keer even pauzeren op een rustig moment, en de briefjes tellen nog mee
//
// Elk stuk draait in een eigen thread (worker_threads), zodat het geheel in een minuut klaar is.
//
// node test/muurwacht.mjs
import { Worker, isMainThread, workerData } from 'node:worker_threads';
import { check, klaar, Kamer, kamerVision, leerMuur, KLEUREN, SOORT, kamerReden, voorspel, inKP } from './hulp.mjs';
const { Omgevingswacht, OMGEVING, telAlsVoorwerp, mensachtig, samenOmtrekken } = await import('../js/omgeving.js');

const FPS = 10, DT = 1 / FPS;
const BRIEFJES = [
  { naam: 'rood', x: 60, y: 60, w: 18, h: 18 }, { naam: 'groen', x: 120, y: 92, w: 18, h: 18 },
  { naam: 'blauw', x: 214, y: 64, w: 18, h: 18 }, { naam: 'geel', x: 246, y: 150, w: 20, h: 16 },
  { naam: 'wit', x: 86, y: 160, w: 24, h: 18 },
].map(b => ({ ...b, c: KLEUREN[b.naam] }));

/**
 * Een opstelling zoals na "Alles automatisch instellen": de muur geleerd onder het licht van
 * nu (met de muurverlichting die autoLight zou kiezen), en daarna de briefjes opgehangen.
 */
function opstelling(seed, kamerOpt = {}) {
  const k = new Kamer(seed);
  Object.assign(k, kamerOpt);
  const v = kamerVision();
  k.wen(v, 40);
  autoLicht(v, k);
  leerMuur(v, k);
  const w = new Omgevingswacht(OMGEVING);
  w.nieuw(v.omgevingBasis('k'));
  k.briefjes = BRIEFJES.map(b => ({ ...b }));
  return { k, v, w, t: 0, f: 0, tracks: [], reden: new Map(), herstel: [], acties: {}, goede: [], log: [] };
}

/** Zoals autoLight in main.js: de zachtste muurverlichting waarbij de camera de muur goed ziet. */
function autoLicht(v, k) {
  for (const lv of [0, 0.12, 0.25, 0.4, 0.55]) {
    k.fill = lv;
    k.wen(v, 12);
    if (v.meanLuma(inKP) >= 80 && k.E < 4.5) return lv;
  }
  return k.fill;
}

/** Wat als voorwerp telt, als omtrekken (zie houdOmtrekken in main.js). */
function omtrekken(s) {
  return s.tracks.filter(t => telAlsVoorwerp(s.reden.get(t.id)) && !s.v.egaalAnders(t)).map(t => t.corners.map(c => [c[0], c[1]]));
}

/**
 * Speelt `sec` seconden, met per beeld scene(s, t) om de kamer te veranderen. ronde(t): wordt er
 * gespeeld (dan vallen er ballen)? Precies zoals main.js: eens per halve seconde meten, de wacht
 * laten beslissen, en bij 'herstel' bijstellen (licht, opnieuw leren, vasthouden wat telde).
 */
function speel(s, sec, scene = () => {}, ronde = () => false, lang = false) {
  const { k, v, w } = s;
  for (let n = 0; n < sec * FPS; n++, s.f++) {
    s.t = s.f * DT;
    scene(s, s.t);
    const speelt = ronde(s.t);
    k.ballen = speelt ? [0, 1, 2, 3].map(i => [50 + ((i * 97 + s.f * 7) % 230), 26 + ((s.f * 11 + i * 53) % 190)]) : [];
    k.film(v);
    voorspel(v, k.ballen);
    s.tracks = v.detect(DT);
    s.reden = new Map(s.tracks.map(t => [t.id, kamerReden(v, t)]));
    if (s.f % 5) continue;
    const m = v.omgevingMeting(0.5, t => telAlsVoorwerp(s.reden.get(t.id)), 'k', OMGEVING.tau, OMGEVING.blijvend);
    let mensen = false, nieuw = false;
    for (const t of s.tracks) {
      const r = s.reden.get(t.id);
      if (r === 'wacht') nieuw = true;
      if (mensachtig(t, r)) mensen = true;
    }
    if (m.bedekt < OMGEVING.kapotDeel / 2 && !nieuw) { s.goede = omtrekken(s); s.recent = [...(s.recent || []).slice(-7), s.goede]; }
    const u = w.stap({ ...m, mensen }, { ronde: speelt, lang: lang && speelt, rustig: true, magLicht: true, fill: k.fill, fillMax: 0.55, kleur: false }, 0.5);
    s.acties[u.actie] = (s.acties[u.actie] || 0) + 1;
    s.mensNu = mensen || k.mensen.length > 0;
    if (u.actie !== 'herstel' && u.actie !== 'speelpauze') continue;
    k.ballen = [];                    // even pauze: tijdens het leren geen ballen
    // ---- bijstellen, zoals onderhoud() in main.js
    const houd = u.open.reden === 'kapot' ? s.goede : u.actie === 'speelpauze' ? samenOmtrekken([omtrekken(s), ...(s.recent || [])]) : omtrekken(s);
    if (u.open.licht) autoLicht(v, k);
    const oud = Float32Array.from(v.bg);
    leerMuur(v, k);
    const al = v.findResident(inKP);
    const vast = v.houdVast(houd, oud);
    w.klaar(true);
    w.nieuw(v.omgevingBasis('k'));
    s.recent = [];
    s.herstel.push({ t: s.t, reden: u.open.reden, licht: u.open.licht, mens: k.mensen.length > 0, al, vast, fill: k.fill });
  }
}

/** Tellen de briefjes nog mee (oordeel 'telt'), en hebben rood, groen en blauw hun soort? */
function briefjesTellen(s) {
  let telt = 0, soort = 0;
  for (const b of s.k.briefjes.filter(b => b.naam)) {
    const t = s.tracks.find(t => Math.abs(t.cx - (b.x + b.w / 2)) < 9 && Math.abs(t.cy - (b.y + b.h / 2)) < 9);
    if (!t || s.reden.get(t.id) !== 'telt') continue;
    telt++;
    if (!SOORT[b.naam] || t.kind === SOORT[b.naam]) soort++;
  }
  return { telt, soort, n: s.k.briefjes.filter(b => b.naam).length };
}
const sec = (x) => x.toFixed(1) + ' s';
const DELEN = [];
/** Een stuk van de test, dat in een eigen thread draait. */
const deel = (f) => DELEN.push(f);
const lijst = (s) => s.herstel.map(h => sec(h.t) + ' ' + h.reden).join(', ') || 'geen';

// ---- 1. tien minuten een rustige kamer ----------------------------------------
// Afwisselend rondes van een minuut (ballen) en pauzes. Om de 40 s loopt er iemand door het
// beeld, en af en toe blijft iemand tien seconden voor de muur staan.
deel(() => {
  const s = opstelling(11);
  const mens = (s2, t) => {
    const c = t % 40;
    if (c < 6) s2.k.mensen = [{ x: 20 + c / 6 * 280, top: 30, w: 22 }];
    else if (t % 200 > 120 && t % 200 < 132) s2.k.mensen = [{ x: 150 + Math.sin(t * 2) * 2, top: 50, w: 26, shirt: [0.55, 0.2, 0.2] }];
    else s2.k.mensen = [];
  };
  speel(s, 620, mens, (t) => t % 120 > 30 && t % 120 < 95);
  check('rustige kamer, 10 min, ballen en mensen: nooit vanzelf opnieuw geleerd', s.herstel.length === 0,
    '(' + lijst(s) + '; ' + Object.entries(s.acties).map(([a, n]) => a + ' ' + n).join(', ') + ')');
  const b = briefjesTellen(s);
  check('... en de briefjes tellen nog allemaal mee', b.telt === b.n && b.soort === b.n, '(' + b.telt + ' van ' + b.n + ', soort ' + b.soort + ')');
});

// ---- 2. het licht uit, het licht aan --------------------------------------------
// Uit: het beeld is stuk (bijna zwart, vol korrel), dus meteen. Aan: de camera past zich aan
// en de herkenning werkt nog, dus bij de volgende controle (binnen een minuut).
for (const [naam, begin, na, binnen, uitleg] of [
  ['het licht gaat uit', { licht: 1 }, (k) => { k.licht = 0.03; }, 10, 'meteen (beeld stuk)'],
  ['het licht gaat aan', { licht: 0.02 }, (k) => { k.licht = 1; }, 65, 'binnen een minuut'],
]) deel(() => {
  const s = opstelling(21, begin);
  speel(s, 25);
  const voor = briefjesTellen(s);
  speel(s, 70, (s2, t) => { if (t > 30) na(s2.k); });
  const h = s.herstel[0];
  check(naam + ': ' + uitleg + ' bijgesteld, met de muurverlichting', s.herstel.length === 1 && h.licht && h.t > 30 && h.t - 30 < binnen,
    '(' + lijst(s) + (h ? ', muurverlichting nu ' + Math.round(h.fill * 100) + '%' : '') + ')');
  speel(s, 15);
  const b = briefjesTellen(s);
  check(naam + ': de briefjes tellen daarna nog mee, met hun soort', voor.telt === voor.n && b.telt === b.n && b.soort === b.n,
    '(voor ' + voor.telt + ', na ' + b.telt + ' van ' + b.n + ', soort ' + b.soort + ')');
});

// ---- 3. wat langzamer verandert: binnen twee minuten -------------------------------
// (de gewone controle is eens per minuut, en een cel moet eerst een halve minuut anders zijn)
const SCENES = [
  ['een lamp gaat aan, op de muur gericht', (k) => { k.lamp = { x: 170, y: 120, rx: 55, ry: 42, sterk: 0.9 }; }],
  ['het gordijn gaat langzaam open (anderhalve minuut)', (k, t) => { k.gordijn = Math.min(1, t / 90); }],
  ['het gordijn gaat ineens open', (k) => { k.gordijn = 0.8; }],
  ['een nieuwe vaste schaduw op de muur', (k) => { k.schaduw = { x: 150, y: 50, w: 100, h: 110, k: 0.62 }; }],
  ['een ding aan de muur dat geen briefje is (een haak met kabel)', (k) => {
    k.briefjes[5] = { x: 150, y: 110, w: 70, h: 12, c: [0.25, 0.25, 0.28] };
    k.briefjes[6] = { x: 150, y: 110, w: 12, h: 80, c: [0.25, 0.25, 0.28] };
  }],
  ['een vel papier hangt half buiten het beamervlak', (k) => { k.briefjes[5] = { x: 220, y: 4, w: 60, h: 60, c: [0.88, 0.88, 0.85] }; }],
];
for (const [naam, verander] of SCENES) deel(() => {
  const s = opstelling(31);
  speel(s, 20);
  const voor = briefjesTellen(s);
  speel(s, 150, (s2, t) => { if (t >= 20) verander(s2.k, t - 20); });
  const h = s.herstel[0];
  check(naam + ': bijgesteld', !!h && h.t - 20 < 125, '(' + lijst(s) + ')');
  // nog even later: geen tweede keer, en de briefjes zijn er nog
  speel(s, 20);
  const b = briefjesTellen(s);
  check('  ... en daarna tellen de briefjes nog mee, met hun soort', voor.telt === voor.n && b.telt === b.n && b.soort === b.n,
    '(voor ' + voor.telt + ', na ' + b.telt + ' van ' + b.n + ', soort ' + b.soort + (h ? ', vastgehouden ' + h.vast + ', al gevonden ' + h.al : '') + ')');
  // de verandering zelf telt na het bijstellen niet als voorwerp
  const extra = s.tracks.filter(t => s.reden.get(t.id) === 'telt').length - b.telt;
  check('  ... en de verandering zelf is geen voorwerp meer', extra === 0, '(' + extra + ' voorwerp(en) extra)');
});

// ---- 4. nooit leren terwijl er iemand voor de muur staat -------------------------
deel(() => {
  const s = opstelling(41);
  speel(s, 20);
  // De lamp gaat aan, en iemand gaat ervoor staan (beweegt een beetje) tot t = 200.
  const scene = (s2, t) => {
    s2.k.lamp = { x: 170, y: 120, rx: 55, ry: 42, sterk: 0.9 };
    s2.k.mensen = t < 200 ? [{ x: 120 + Math.sin(t * 1.3) * 3, top: 35, w: 28, shirt: [0.2, 0.25, 0.4] }] : [];
  };
  speel(s, 230, scene);
  const tijdens = s.herstel.filter(h => h.t < 200 || h.mens);
  check('iemand voor de muur: niet opnieuw geleerd zolang hij er staat', tijdens.length === 0, '(' + lijst(s) + ')');
  check('  ... en meteen erna wel (binnen 10 s)', s.herstel.length === 1 && s.herstel[0].t >= 200 && s.herstel[0].t < 210, '(' + lijst(s) + ')');
});

// ---- 5. tijdens een ronde ---------------------------------------------------------
deel(() => {
  // Een lamp gaat aan midden in een ronde: pas na de ronde bijstellen.
  const s = opstelling(51);
  speel(s, 10);
  speel(s, 200, (s2, t) => { if (t > 20) s2.k.lamp = { x: 170, y: 120, rx: 55, ry: 42, sterk: 0.9 }; }, (t) => t < 180);
  const h = s.herstel[0];
  check('lamp aan tijdens een ronde: pas na de ronde bijgesteld', !!h && h.t >= 180 && !s.acties.pauze && s.acties['na-ronde'] > 0,
    '(' + lijst(s) + ', na-ronde ' + (s.acties['na-ronde'] || 0) + '×, pauze ' + (s.acties.pauze || 0) + '×)');
});
deel(() => {
  // Het licht gaat uit midden in een ronde: dan is het beeld stuk, en gaat de ronde op pauze.
  const s = opstelling(52);
  speel(s, 10);
  let pauze = -1;
  const ronde = (t) => pauze < 0 && t < 120;
  const oud = s.w.stap.bind(s.w);
  s.w.stap = (m, sp, dt) => { const u = oud(m, sp, dt); if (u.actie === 'pauze' && pauze < 0) pauze = s.t; return u; };
  speel(s, 60, (s2, t) => { if (t > 30) s2.k.licht = 0.03; }, ronde);
  const h = s.herstel[0];
  check('licht uit tijdens een ronde: pauze, dan meteen bijgesteld', pauze > 30 && pauze < 36 && !!h && h.reden === 'kapot' && h.t - pauze < 6,
    '(pauze op ' + (pauze < 0 ? 'nooit' : sec(pauze)) + ', ' + lijst(s) + ')');
});

// ---- 6. zonder tijdslimiet ------------------------------------------------------
deel(() => {
  // Tien minuten één ronde die nooit ophoudt, met mensen die langslopen of even blijven staan.
  const s = opstelling(61);
  const mens = (s2, t) => {
    const c = t % 40;
    if (c < 6) s2.k.mensen = [{ x: 20 + c / 6 * 280, top: 30, w: 22 }];
    else if (t % 200 > 120 && t % 200 < 132) s2.k.mensen = [{ x: 150 + Math.sin(t * 2) * 2, top: 50, w: 26, shirt: [0.55, 0.2, 0.2] }];
    else s2.k.mensen = [];
  };
  speel(s, 620, mens, () => true, true);
  check('zonder tijdslimiet, rustige kamer, 10 min: nooit gepauzeerd of opnieuw geleerd', s.herstel.length === 0 && !s.acties.pauze && !s.acties.speelpauze,
    '(' + lijst(s) + '; ' + Object.entries(s.acties).map(([a, n]) => a + ' ' + n).join(', ') + ')');
});
deel(() => {
  // Een lamp gaat aan in een ronde zonder tijdslimiet, er lopen mensen langs.
  const s = opstelling(62);
  speel(s, 20);                     // (de briefjes tellen zonder ballen ervoor)
  const voor = briefjesTellen(s);
  const scene = (s2, t) => {
    s2.k.lamp = { x: 170, y: 120, rx: 55, ry: 42, sterk: 0.9 };
    s2.k.mensen = t % 40 < 6 ? [{ x: 20 + (t % 40) / 6 * 280, top: 30, w: 22 }] : [];
  };
  speel(s, 200, scene, () => true, true);
  const h = s.herstel[0];
  check('zonder tijdslimiet, lamp aan: één keer even gepauzeerd en bijgesteld', s.herstel.length === 1 && !!h && !h.mens && h.t - 20 < 125 && !s.acties.pauze,
    '(' + lijst(s) + ', speelpauze ' + (s.acties.speelpauze || 0) + '×)');
  speel(s, 20, (s2, t) => { scene(s2, t); s2.k.mensen = []; });
  const b = briefjesTellen(s);
  check('  ... en daarna tellen de briefjes nog mee, met hun soort', voor.telt === voor.n && b.telt === b.n && b.soort === b.n,
    '(voor ' + voor.telt + ', na ' + b.telt + ' van ' + b.n + ', soort ' + b.soort + ')');
});

if (isMainThread) {
  // Alle stukken tegelijk, en de uitvoer daarna in de gewone volgorde.
  const uit = await Promise.all(DELEN.map((_, i) => new Promise((klaarMet) => {
    const wk = new Worker(new URL(import.meta.url), { workerData: i, stdout: true });
    let tekst = '';
    wk.stdout.on('data', (d) => { tekst += d; });
    wk.on('error', (e) => { tekst += 'FOUT stuk ' + i + ': ' + e.message + '\n'; });
    wk.on('exit', () => klaarMet(tekst));
  })));
  let fout = 0;
  for (const tekst of uit) {
    const regels = tekst.split('\n').filter(r => r.startsWith('ok ') || r.startsWith('FOUT'));
    for (const r of regels) { console.log(r); if (r.startsWith('FOUT')) fout++; }
    if (!regels.length) { console.log('FOUT een stuk gaf niets terug'); fout++; }
  }
  console.log('');
  console.log(fout ? fout + ' test(s) mislukt' : 'alles goed');
  process.exitCode = fout ? 1 : 0;
} else {
  DELEN[workerData]();
  klaar();
}
