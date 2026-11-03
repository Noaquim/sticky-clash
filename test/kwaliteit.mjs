// Trage computers (js/kwaliteit.js): de wacht die het spel zuiniger laat tekenen, en de
// stapjes die slow motion voorkomen.
//   1. een gewone computer (60, 30 of 120 beeldjes per seconde, met een hapering hier en
//      daar, of traag opstarten) blijft altijd op stand 0: daar verandert niets
//   2. een trage computer gaat na 2 s een stand zuiniger, tot stand 3; en na 10 s vlot terug,
//      ook met een trillende klok of een scherm van 144 Hz, en zonder heen en weer te gaan
//   3. niet meten tijdens het instellen of als het venster verborgen is; pauzes tellen niet
//   4. vastzetten (?kwaliteit=vol, sc.kwaliteit.vast); elke start begint op alles
//   5. de stapjes: een gewoon beeldje is precies één stap; een traag beeldje loopt niet
//      meer in slow motion (de klok van de ronde loopt even snel als met 60 beeldjes)
//   6. minder opruimwerk in vision.js (setProjection met een sleutel): precies dezelfde
//      uitkomst als zonder, ook na het wisselen van kalibratie
// node test/kwaliteit.mjs
import { Kwaliteit, kwaliteitBijStart, inStapjes, KW_MAX } from '../js/kwaliteit.js';
import { Game, check, klaar, rng, makeVision } from './hulp.mjs';

/** Laat de wacht `s` seconden lopen met beeldjes van ms() milliseconden. Geeft de standen. */
function loop(k, s, ms, mag = () => true) {
  const standen = new Set([k.niveau]);
  let t = 0;
  while (t < s * 1000) {
    const d = ms(t);
    k.meet(d, mag(t));
    standen.add(k.niveau);
    t += d;
  }
  return standen;
}
const r = rng(7);
const rond = (gem, spreiding) => () => gem + (r() - 0.5) * spreiding;

// ---------------------------------------------------------------- 1. gewone computers

{
  const k = new Kwaliteit();
  // 60 Hz, wat trillen, en elke 2 s een hapering van 120 ms (de vuilnisman, een melding)
  const st = loop(k, 120, (t) => (Math.floor(t / 2000) !== Math.floor((t + 17) / 2000) ? 120 : 16.7 + (r() - 0.5) * 4));
  check('60 Hz met haperingen: altijd stand 0', st.size === 1 && k.niveau === 0, 'basis ' + k.basis.toFixed(1) + ' ms');
}
{
  const k = new Kwaliteit();
  const st = loop(k, 60, rond(33.4, 3));
  check('30 Hz (oude beamer, tv): stand 0', st.size === 1 && k.niveau === 0, 'basis ' + k.basis.toFixed(1) + ' ms');
}
{
  const k = new Kwaliteit();
  const st = loop(k, 60, rond(8.3, 1));
  check('120 Hz: stand 0', st.size === 1 && k.niveau === 0);
}
{
  // 30 beeldjes per seconde op een 60 Hz-scherm: speelbaar, dus niets veranderen
  const k = new Kwaliteit();
  const st = loop(k, 60, (t) => (t < 2000 ? 16.7 : 33.4));
  check('30 per seconde op 60 Hz: nog geen reden', st.size === 1 && k.niveau === 0);
}
{
  // Opstarten is altijd wat traag (laden, eerste keer tekenen): telt niet
  const k = new Kwaliteit();
  const st = loop(k, 30, (t) => (t < 1500 ? 70 : 16.7));
  check('traag opstarten, daarna vlot: stand 0', st.size === 1 && k.niveau === 0);
}

// ---------------------------------------------------------------- 2. trage computers

{
  const k = new Kwaliteit();
  let wanneer = -1, t = 0;
  while (t < 30000) { if (k.meet(60, true) && wanneer < 0) wanneer = t; t += 60; }
  check('60 ms per beeldje: zuiniger na leren (2 s) + 2 s', wanneer >= 3500 && wanneer <= 5500, (wanneer / 1000).toFixed(1) + ' s');
  check('  en verder, tot hooguit stand ' + KW_MAX, k.niveau === KW_MAX);
  // weer vlot: om de 10 s een stand terug
  const terug = [];
  let s = 0;
  while (s < 45000) { if (k.meet(16.7, true)) terug.push(Math.round(s / 1000)); s += 16.7; }
  check('  weer vlot: elke 10 s een stand terug', k.niveau === 0 && terug.length === 3 && terug[0] >= 9 && terug[0] <= 12, terug.join(', ') + ' s');
}
{
  // 45 ms op een 60 Hz-scherm (22 per seconde): net te traag
  const k = new Kwaliteit();
  loop(k, 8, (t) => (t < 2000 ? 16.7 : 45));
  check('22 per seconde: een stand zuiniger', k.niveau >= 1);
}
{
  // Gemeten met performance.now() trilt de klok: de ene keer 13 ms, de volgende 20. Na een
  // trage periode moet hij dan toch terugkomen (vroeger leerde hij het snelste beeldje als
  // maat, en bleef hij zo voor altijd op stand 3).
  const k = new Kwaliteit();
  let fase = 0;
  const tril = () => { const n = (r() - 0.5) * 8; const ms = 16.7 + n - fase; fase = n; return ms; };
  loop(k, 3, tril);
  loop(k, 10, () => 60);
  const traag = k.niveau;
  loop(k, 45, tril);
  check('trillende klok: na een trage periode weer terug op 0', traag === KW_MAX && k.niveau === 0, 'basis ' + k.basis.toFixed(1) + ' ms');
}
{
  // Een scherm van 144 Hz: leren op het welkomstscherm, dan even traag, daarna speelt hij
  // op 100 per seconde. Dat is vlot genoeg, ook al haalt hij de 144 niet.
  const k = new Kwaliteit();
  loop(k, 3, () => 1000 / 144);
  loop(k, 10, () => 60);
  loop(k, 45, () => 10);
  check('144 Hz, daarna 100 per seconde: weer terug op 0', k.niveau === 0, 'basis ' + k.basis.toFixed(1) + ' ms');
}
{
  // Op stand 0 haalt deze computer 20 per seconde, met minder gloed 60. Niet om de paar
  // seconden heen en weer: elke mislukte stap terug wacht de volgende keer twee keer zo lang.
  const k = new Kwaliteit();
  loop(k, 3, () => 16.7);
  let wissels = 0, op0 = 0, t = 0;
  while (t < 180000) {
    const ms = k.niveau === 0 ? 50 : 16.7;
    if (k.meet(ms, true)) wissels++;
    if (k.niveau === 0) op0 += ms;
    t += ms;
  }
  check('stand 0 te zwaar, stand 1 vlot: geen heen en weer', wissels <= 9 && op0 < 20000 && k.vlotNodig >= 80,
    wissels + ' wissels in 3 minuten, ' + (op0 / 1000).toFixed(1) + ' s op stand 0');
}

// ---------------------------------------------------------------- 3. niet meten

{
  const k = new Kwaliteit();
  loop(k, 3, () => 16.7);
  const st = loop(k, 30, () => 80, () => false);
  check('tijdens instellen of verborgen: niets', st.size === 1 && k.niveau === 0);
  const st2 = loop(k, 30, () => 1500);
  check('pauzes van meer dan een seconde: niets', st2.size === 1 && k.niveau === 0);
}

// ---------------------------------------------------------------- 4. vastzetten en onthouden

{
  const k = new Kwaliteit();
  k.vast(0);
  const st = loop(k, 30, () => 90);
  check('vastgezet op alles: blijft 0, ook als het traag gaat', st.size === 1 && k.niveau === 0);
  k.vast(null);
  loop(k, 10, () => 90);
  check('  weer vrij: dan wel zuiniger', k.niveau >= 1);
  check('  vast(7) wordt hooguit ' + KW_MAX, new Kwaliteit().vast(7) === KW_MAX);
}
{
  const a = kwaliteitBijStart('?kwaliteit=vol', '2');
  const b = kwaliteitBijStart('', '2');
  const c = kwaliteitBijStart('?x=1&kwaliteit=1', null);
  const d = kwaliteitBijStart('?kwaliteit=onzin', 'onzin');
  const e = kwaliteitBijStart('', 'vol');
  check('?kwaliteit=vol: vast op alles', a.niveau === 0 && a.vast === true);
  check('elke start begint op alles (niet de stand van toen)', b.niveau === 0 && b.vast === false);
  check('?kwaliteit=1: vast op 1', c.niveau === 1 && c.vast === true);
  check('onzin of niets: 0, vrij', d.niveau === 0 && !d.vast && kwaliteitBijStart('', null).niveau === 0);
  check('"vol" in de opslag: vast op alles', e.niveau === 0 && e.vast === true);
  const k = new Kwaliteit(2);
  check('beginnen op een stand', k.niveau === 2 && new Kwaliteit(9).niveau === KW_MAX);
}

// ---------------------------------------------------------------- 5. stapjes

{
  const stappen = (ruw) => { const s = []; inStapjes(ruw, (h) => s.push(h)); return s; };
  const a = stappen(1 / 60), b = stappen(0.05), c = stappen(0.12), d = stappen(9), e = stappen(0);
  check('gewoon beeldje: precies één stap van die lengte', a.length === 1 && a[0] === 1 / 60 && b.length === 1 && b[0] === 0.05);
  check('traag beeldje (0,12 s): 0,05 + 0,05 + 0,02', c.length === 3 && Math.abs(c[2] - 0.02) < 1e-9 && c.every(h => h <= 0.05));
  check('na een pauze: samen hooguit 0,25 s', Math.abs(d.reduce((x, y) => x + y, 0) - 0.25) < 1e-9);
  check('geen tijd: één stap van 0 (zoals altijd)', e.length === 1 && e[0] === 0);
}
{
  // Een ronde van 60 s, 6 s lang: met 60 beeldjes per seconde, en met 7 (een oude laptop).
  // Vroeger liep de klok bij 7 per seconde maar op 35% van de echte snelheid.
  const ronde = (fps) => {
    const g = new Game(null); g.bonusOn = false; g.rate = 0;
    g.setAspect(16 / 9); g.start(60);
    for (let i = 0; i < 6 * fps; i++) inStapjes(1 / fps, (h) => g.update(h));
    return g;
  };
  const vlot = ronde(60), traag = ronde(7);
  check('ronde-klok op 7 per seconde even snel als op 60', vlot.state === 'play' && traag.state === 'play' &&
    Math.abs(vlot.time - traag.time) < 0.2, 'nog ' + vlot.time.toFixed(2) + ' s / ' + traag.time.toFixed(2) + ' s (begon op 60, 3 s aftellen)');
  const oud = new Game(null); oud.bonusOn = false; oud.rate = 0; oud.setAspect(16 / 9); oud.start(60);
  for (let i = 0; i < 6 * 7; i++) oud.update(Math.min(0.05, 1 / 7));
  check('  (zonder stapjes liep hij achter)', oud.state !== 'play' || oud.time > traag.time + 2, 'nog ' + oud.time.toFixed(2) + ' s');
}

// ---------------------------------------------------------------- 6. setProjection met sleutel

{
  // Een schuine koppeling camerapixel -> beamervlak, zoals een kalibratie die geeft.
  const koppeling = (schuin) => (x, y) => [(x - 30 + y * schuin) / 260, (y - 20 - x * schuin * 0.5) / 200];
  const lw = 256, lh = 144, rr = rng(11);
  const luma = new Float32Array(lw * lh).map(() => rr() * 200);
  const signed = new Float32Array(lw * lh).map(() => rr() * 1.2 - 0.1);
  const velden = ['projLuma', 'projI', 'projHi', 'projLo', 'projBand', 'projPrev'];
  const gelijk = (a, b) => velden.every(f => a[f].length === b[f].length && a[f].every((x, i) => Object.is(x, b[f][i])));
  const zonder = makeVision(), met = makeVision();
  let ok = true, keer = 0;
  for (const schuin of [0.05, 0.05, 0.05, 0.12, 0.12]) {   // twee keer dezelfde kalibratie, dan een andere
    const f = koppeling(schuin);
    zonder.setProjection(luma, lw, lh, f, signed);
    met.setProjection(luma, lw, lh, f, signed, [schuin, null, false, met.cols, met.rows]);
    ok = ok && gelijk(zonder, met);
    keer++;
  }
  check('setProjection met sleutel: precies hetzelfde als zonder', ok && keer === 5);
  check('  en de koppeling wordt echt bewaard', !!met.projKaart && met.projKaartSleutel[2] === 0.12);
}

klaar();
