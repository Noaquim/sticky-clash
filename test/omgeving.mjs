// Elke minuut controleren, en de kleuren in het donker (js/omgeving.js):
//   1. de beslissingen van de wacht, op nagemaakte metingen: niets in een rustige kamer, wel
//      bij ander licht, een andere muur of een stuk beeld; nooit met iemand in beeld; tijdens
//      een ronde pas na afloop, behalve als het beeld stuk is (dan pauze); ophouden als het
//      steeds niet lukt
//   2. de kleurwacht: hysterese in tijd en in drempel, geen geflapper rond de grens
//   3. kleuren in een nagebouwde kamer, met de echte herkenning: in het licht krijgen rood,
//      groen en blauw hun soort; in het donker krijgt geen enkel briefje een verkeerde soort;
//      meer muurverlichting maakt de kleuren weer betrouwbaar
//   4. de donkere kamers van test/bench.mjs: wat de kleurwacht daar zegt
// node test/omgeving.mjs
import { check, klaar, Kamer, kamerVision, leerMuur, KLEUREN, SOORT, rng, makeVision } from './hulp.mjs';
const { OMGEVING, Omgevingswacht, versnelOmgeving, mensachtig, telAlsVoorwerp, KLEURWACHT, nieuweKleurstand, kleurStap,
  kleurOordeel, kleurHeelSlecht } = await import('../js/omgeving.js');

// ---------------------------------------------------------------- 1. de wacht

/**
 * Laat de wacht sec seconden lopen op nagemaakte metingen; herstel = meteen geslaagd.
 * meting(t, leer): leer is wanneer de muur het laatst opnieuw geleerd werd (een verandering van
 * daarvoor zit dan in de geleerde muur, en meet niet meer als verandering).
 */
function draai(w, sec, meting = () => ({}), spel = () => ({}), dt = 0.5, t0 = 0) {
  const uit = [];
  let leer = -Infinity;
  for (let t = t0; t < t0 + sec - 1e-9; t += dt) {
    const m = { gain: 1, deel: 0, bedekt: 0.02, vloed: false, clip: 0, L: 110, beweging: 0, mensen: false, ...meting(t, leer) };
    const s = { ronde: false, magLicht: true, fill: 0.12, fillMax: 0.55, kleur: false, ...spel(t) };
    const u = w.stap(m, s, dt);
    uit.push({ t, actie: u.actie, open: u.open && { ...u.open } });
    if (u.actie === 'herstel' || u.actie === 'speelpauze') { w.klaar(true); leer = t; w.nieuw({ L: m.L, clip: m.clip }); }
  }
  return uit;
}
/** Een verandering vanaf t0 die met opnieuw leren verdwijnt (na: wat er dan nog anders is). */
const vanaf = (t0, tijdens, na = {}) => (t, leer) => (t >= t0 ? (leer < t0 ? tijdens : na) : {});
const nieuweWacht = () => { const w = new Omgevingswacht(OMGEVING); w.nieuw({ L: 110, clip: 0 }); return w; };
const herstel = (uit) => uit.filter(u => u.actie === 'herstel');
const tel = (uit, a) => uit.filter(u => u.actie === a).length;

{
  // Tien minuten rustig, met wat de camera altijd doet: de lichtfactor wiebelt, een paar
  // cellen zijn even anders, en om de 40 s loopt er iemand door het beeld.
  const r = rng(1), w = nieuweWacht();
  const uit = draai(w, 600, (t) => {
    const mens = t % 40 < 6;
    return { gain: 1 + 0.03 * Math.sin(t / 37) + (r() - 0.5) * 0.04, deel: r() * 0.01, L: 110 + (r() - 0.5) * 4,
      bedekt: mens ? 0.15 : 0.02 + r() * 0.01, beweging: mens ? 0.15 : r() * 0.002, mensen: mens };
  }, (t) => ({ ronde: t % 120 > 30 && t % 120 < 95 }));
  check('rustige kamer, 10 min: nooit iets te doen', uit.every(u => u.actie === 'niets'), '(' + (uit.length - tel(uit, 'niets')) + ' keer iets)');
}
{
  const w = nieuweWacht();
  const uit = draai(w, 130, vanaf(30, { gain: 1.45, L: 160 }, { L: 160 }));
  const h = herstel(uit);
  check('licht 45% feller: bij de volgende controle bijstellen, met de muurverlichting', h.length === 1 && h[0].t <= 60 && h[0].open.licht && h[0].open.reden === 'licht',
    '(' + h.map(x => x.t + ' s ' + x.open.reden).join(', ') + ')');
  const w2 = nieuweWacht();
  const h2 = herstel(draai(w2, 130, vanaf(30, { gain: 1.45, L: 160 }, { L: 160 }), () => ({ magLicht: false })));
  check('  ... muurverlichting niet automatisch: alleen de muur opnieuw leren', h2.length === 1 && !h2[0].open.licht && h2[0].open.leren);
}
{
  const w = nieuweWacht();
  const h = herstel(draai(w, 130, vanaf(30, { deel: 0.05 })));
  check('muur blijvend anders (5%): bij de volgende controle opnieuw leren, zonder licht', h.length === 1 && h[0].t <= 60.5 && h[0].open.reden === 'muur' && !h[0].open.licht,
    '(' + h.map(x => x.t + ' s ' + x.open.reden).join(', ') + ')');
  const w2 = nieuweWacht();
  check('  ... 1,5% blijvend anders: niets', herstel(draai(w2, 200, () => ({ deel: 0.015 }))).length === 0);
}
{
  const w = nieuweWacht();
  w.nieuw({ L: 38, clip: 0 });                         // (de muur werd zo donker geleerd)
  const h = herstel(draai(w, 70, () => ({ L: 38 }), () => ({ fill: 0.12 })));
  check('te donker voor de herkenning: muurverlichting hoger', h.length === 1 && h[0].open.licht && h[0].open.reden === 'licht');
  const w2 = nieuweWacht();
  w2.nieuw({ L: 38, clip: 0 });
  check('  ... maar niet als hij al zo hoog staat als hij kan', herstel(draai(w2, 200, () => ({ L: 38 }), () => ({ fill: 0.55 }))).length === 0);
}
{
  const w = nieuweWacht();
  const uit = draai(w, 30, vanaf(10, { bedekt: 0.7, gain: 0.6 }));
  const h = herstel(uit);
  check('beeld stuk (bijna alles voorgrond): na 4 s bijstellen, niet pas na een minuut', h.length === 1 && h[0].open.reden === 'kapot' && h[0].t >= 13.5 && h[0].t <= 15,
    '(' + h.map(x => x.t + ' s').join(', ') + ')');
  for (const [naam, m] of [['de lichtfactor tegen zijn grens', { gain: 1.6 }], ['vol half-duidelijke cellen (floodGuard)', { vloed: true }],
    ['overbelicht beeld', { clip: 0.2 }]]) {
    const wx = nieuweWacht();
    const hx = herstel(draai(wx, 20, vanaf(5, m)));
    check('  ... ook bij ' + naam, hx.length === 1 && hx[0].open.reden === 'kapot' && hx[0].t <= 10, '(' + hx.map(x => x.t + ' s').join(', ') + ')');
  }
}
{
  // Stuk midden in een ronde: pauze. Dan wachten tot het stil is (iemand beweegt nog), en bijstellen.
  // (de pauze zet main.js; hier: zodra de wacht 'pauze' zegt, is de ronde gepauzeerd)
  let gepauzeerd = -1;
  const w2 = nieuweWacht();
  const uit2 = [];
  for (let t = 0; t < 40; t += 0.5) {
    const u = w2.stap({ gain: 1, deel: 0, bedekt: t >= 10 ? 0.7 : 0.02, vloed: false, clip: 0, L: 110, beweging: t >= 10 && t < 20 ? 0.05 : 0, mensen: false },
      { ronde: gepauzeerd < 0, magLicht: true, fill: 0.12, fillMax: 0.55, kleur: false }, 0.5);
    if (u.actie === 'pauze' && gepauzeerd < 0) gepauzeerd = t;
    uit2.push({ t, actie: u.actie });
    if (u.actie === 'herstel') break;
  }
  const h = uit2.find(u => u.actie === 'herstel');
  check('stuk tijdens een ronde: na 4 s pauze', gepauzeerd >= 13.5 && gepauzeerd <= 14.5, '(pauze op ' + gepauzeerd + ' s)');
  check('  ... dan wachten zolang er iets beweegt, en bijstellen zodra het 3,5 s stil is', !!h && h.t >= 23 && h.t <= 24 && uit2.some(u => u.actie === 'wacht'),
    '(bijgesteld op ' + (h ? h.t + ' s' : 'nooit') + ')');
}
{
  // De spelers gaan zelf verder na de automatische pauze: deze ronde niet nog eens pauzeren.
  const w = nieuweWacht();
  let pauzes = 0, ronde = true, h = null;
  for (let t = 0; t < 120; t += 0.5) {
    if (t === 60) ronde = false;
    const u = w.stap({ gain: 1, deel: 0, bedekt: t >= 5 ? 0.7 : 0.02, vloed: false, clip: 0, L: 110, beweging: 0, mensen: false },
      { ronde, magLicht: true, fill: 0.12, fillMax: 0.55, kleur: false }, 0.5);
    if (u.actie === 'pauze') { pauzes++; w.nietDringend(); }
    if (u.actie === 'herstel') { h = t; break; }
  }
  check('spelers gaan zelf verder: geen tweede pauze, na de ronde bijstellen', pauzes === 1 && h >= 60 && h <= 64, '(' + pauzes + ' pauze(s), bijgesteld op ' + h + ' s)');
}
{
  // Iemand staat voor de muur (geen stuk beeld): wachten. Pas 2,5 s nadat hij weg is.
  const w = nieuweWacht();
  const muur = vanaf(10, { deel: 0.05 });
  const uit = draai(w, 200, (t, leer) => ({ ...muur(t, leer), mensen: t < 150, beweging: t < 150 ? 0.01 : 0 }));
  const h = herstel(uit);
  check('iemand in beeld: niet leren zolang hij er staat', h.length === 1 && h[0].t >= 152 && h[0].t <= 153 && tel(uit, 'wacht') > 100,
    '(bijgesteld op ' + h.map(x => x.t + ' s').join(', ') + ', ' + tel(uit, 'wacht') + '× gewacht)');
  // Hij staat stil en wordt af en toe even niet als mens gezien, maar nooit 2,5 s achter elkaar.
  const w2 = nieuweWacht();
  const h2 = herstel(draai(w2, 200, (t, leer) => ({ ...muur(t, leer), mensen: t < 150 && t % 4 < 2 })));
  check('  ... ook niet als hij af en toe even niet als mens gezien wordt (korter dan 2,5 s)', h2.length === 1 && h2[0].t >= 150, '(' + h2.map(x => x.t + ' s').join(', ') + ')');
}
{
  // Kleine verandering tijdens een ronde: na de ronde.
  const w = nieuweWacht();
  const uit = draai(w, 300, vanaf(30, { deel: 0.05 }), (t) => ({ ronde: t < 200 }));
  const h = herstel(uit);
  check('muur anders tijdens een ronde: na de ronde, zonder pauze', h.length === 1 && h[0].t >= 200 && h[0].t <= 201 && tel(uit, 'pauze') === 0 && tel(uit, 'na-ronde') > 50,
    '(' + h.map(x => x.t + ' s').join(', ') + ', na-ronde ' + tel(uit, 'na-ronde') + '×)');
}
{
  // Zonder tijdslimiet (lang): het eind van de ronde komt nooit. Op een rustig moment even
  // pauzeren en bijstellen; zelden, nooit met iemand in beeld, niet als er net een bal in de bak gaat.
  const eind = (o = {}) => (t) => ({ ronde: true, lang: true, rustig: true, ...o });
  const pauzes = (uit) => uit.filter(u => u.actie === 'speelpauze');
  const loop = (t) => t % 40 < 6;                 // elke 40 s loopt er 6 s iemand langs
  const w0 = nieuweWacht();
  const u0 = draai(w0, 900, (t) => ({ mensen: loop(t), beweging: loop(t) ? 0.03 : 0, bedekt: loop(t) ? 0.2 : 0.02 }), eind());
  check('zonder tijdslimiet, rustige kamer (15 min, mensen lopen langs): nooit pauzeren', pauzes(u0).length === 0 && herstel(u0).length === 0 && tel(u0, 'pauze') === 0);
  const w1 = nieuweWacht();
  const u1 = draai(w1, 600, (t, leer) => ({ ...vanaf(30, { deel: 0.05 })(t, leer), mensen: loop(t), beweging: loop(t) ? 0.03 : 0 }), eind());
  const p1 = pauzes(u1);
  check('  ... muur anders: één keer even pauzeren, op een rustig moment', p1.length === 1 && p1[0].t >= 59 && p1[0].t <= 90 && !loop(p1[0].t) &&
    !loop(p1[0].t - 2.5) && herstel(u1).length === 0 && tel(u1, 'pauze') === 0, '(' + p1.map(x => x.t + ' s').join(', ') + ')');
  const w2 = nieuweWacht();
  const p2 = pauzes(draai(w2, 400, vanaf(30, { deel: 0.05 }), eind()));
  const w3 = nieuweWacht();
  const p3 = pauzes(draai(w3, 400, (t, leer) => ({ ...vanaf(30, { deel: 0.05 })(t, leer), mensen: t < 150 }), eind()));
  check('  ... met een hand in beeld wachten tot hij weg is', p3.length === 1 && p3[0].t >= 152, '(' + p3.map(x => x.t + ' s').join(', ') + ')');
  const w4 = nieuweWacht();
  const p4 = pauzes(draai(w4, 400, vanaf(30, { deel: 0.05 }), (t) => eind({ rustig: t >= 130 })(t)));
  check('  ... niet terwijl er net een bal in de bak gaat', p4.length === 1 && p4[0].t >= 130, '(' + p4.map(x => x.t + ' s').join(', ') + ')');
  // Twee veranderingen kort na elkaar: de tweede wacht tot speelPauze voorbij is.
  const w5 = nieuweWacht();
  const p5 = pauzes(draai(w5, 700, (t, leer) => (t >= 150 ? (leer < 150 ? { deel: 0.05 } : {}) : vanaf(30, { deel: 0.05 })(t, leer)), eind()));
  check('  ... hooguit eens per ' + OMGEVING.speelPauze + ' s', p5.length === 2 && p5[1].t - p5[0].t >= OMGEVING.speelPauze && p2.length === 1,
    '(' + p5.map(x => x.t + ' s').join(', ') + ')');
  // Een gewone ronde (niet lang): gewoon na de ronde, zoals hierboven.
  const w6 = nieuweWacht();
  const u6 = draai(w6, 300, vanaf(30, { deel: 0.05 }), (t) => ({ ronde: true, lang: false, rustig: true }));
  check('  ... een gewone ronde: niet pauzeren, na de ronde', pauzes(u6).length === 0 && tel(u6, 'na-ronde') > 50);
}
{
  // Na bijstellen even rust; lukt het drie keer niet, dan ophouden en het zeggen.
  const w = nieuweWacht();
  let n = 0, op = -1;
  for (let t = 0; t < 600; t += 0.5) {
    const u = w.stap({ gain: 1, deel: 0.05, bedekt: 0.02, vloed: false, clip: 0, L: 110, beweging: 0, mensen: false },
      { ronde: false, magLicht: true, fill: 0.12, fillMax: 0.55, kleur: false }, 0.5);
    if (u.actie === 'herstel') { n++; w.klaar(false); }
    if (u.actie === 'opgegeven' && op < 0) op = t;
  }
  check('lukt bijstellen steeds niet: na drie pogingen ophouden', n === 3 && op > 0, '(' + n + ' pogingen, opgegeven op ' + op + ' s)');
  w.nieuw({ L: 110, clip: 0 });
  check('  ... en na opnieuw leren weer gewoon', !w.gestopt);
}
{
  const w = nieuweWacht();
  const h = herstel(draai(w, 30, () => ({}), () => ({ kleur: true })));
  check('de kleuren hebben meer licht nodig: bijstellen (na de rust na het leren)', h.length >= 1 && h[0].open.kleur && h[0].open.reden === 'kleur' && h[0].t >= 19.5,
    '(' + h.map(x => x.t + ' s').join(', ') + ')');
}
{
  const o = versnelOmgeving(OMGEVING, 6);
  check('?snel=6 (alleen voor tests): de minuut wordt 10 s, mensen blijven gewoon', o.periode === 10 && o.vrijNa === OMGEVING.vrijNa && o.kapotNa === OMGEVING.kapotNa);
  check('  ... zonder snel: alles zoals het is', versnelOmgeving(OMGEVING, 1) === OMGEVING && versnelOmgeving(OMGEVING, NaN) === OMGEVING);
}
{
  const sp = (o) => ({ cells: 40, age: 30, rigid: true, stillT: 10, skinFrac: 0, ...o });
  check('mensachtig: een hand (huid) of een ademend lijf wel', mensachtig(sp({ skinFrac: 0.5 }), 'huid') && mensachtig(sp({ rigid: false }), 'mens'));
  check('  ... iets wat net beweegt of net verschijnt ook', mensachtig(sp({ stillT: 0.3 }), 'telt') && mensachtig(sp({ age: 4 }), 'wacht'));
  check('  ... een stil briefje, een lichtvlek of een flintertje niet', !mensachtig(sp(), 'telt') && !mensachtig(sp(), 'groot') &&
    !mensachtig(sp({ cells: 9, stillT: 0 }), 'wacht'));
  check('telAlsVoorwerp: alleen wat meetelt en de bak', telAlsVoorwerp('telt') && telAlsVoorwerp('bak') && !telAlsVoorwerp('groot') && !telAlsVoorwerp('wacht'));
}

// ---------------------------------------------------------------- 2. de kleurwacht

const K = KLEURWACHT;
const meet = (L, ruis = 1, drift = 0, zweem = 0) => ({ n: 500, L, ruis, drift, zweem });
{
  const st = nieuweKleurstand();
  for (let i = 0; i < 100; i++) kleurStap(st, meet(110, 1), 0.5);
  check('kleurwacht: gewoon licht, blijft betrouwbaar', st.ok && !st.wissel);
  kleurStap(st, meet(35), 0.5);
  check('  ... één slechte meting: nog niet', st.ok);
  kleurStap(st, meet(35), 0.5);
  check('  ... een seconde slecht: kleuren tellen niet meer', !st.ok && st.wissel);
  st.wissel = false;
  for (let i = 0; i < 7; i++) kleurStap(st, meet(60), 0.5);
  check('  ... 3,5 s weer goed: nog niet terug', !st.ok);
  kleurStap(st, meet(60), 0.5);
  check('  ... 4 s goed: weer betrouwbaar', st.ok && st.wissel);
  st.wissel = false;
  kleurStap(st, meet(110, 1, 0, 30), 0.5);
  check('  ... de muur ineens flink van kleur verschoven: meteen niet meer', !st.ok && kleurHeelSlecht(meet(110, 1, 0, 30)));
  const st2 = nieuweKleurstand();
  kleurStap(st2, { n: 0, L: 0, ruis: 0, drift: 0, zweem: 0 }, 0.5);
  kleurStap(st2, null, 0.5);
  check('  ... zonder meting verandert er niets', st2.ok && !st2.wissel);
}
{
  check('kleurOordeel: drempels', kleurOordeel(meet(110, 2)) === true && kleurOordeel(meet(39)) === false && kleurOordeel(meet(45)) === null &&
    kleurOordeel(meet(110, 2.5 + 110 * K.ruis + 1)) === false && kleurOordeel(meet(110, 1, 110 * K.drift + 1)) === false &&
    kleurOordeel(meet(110, 1, 0, 110 * K.zweem + 1)) === false);
}
{
  // Tien minuten precies rond de grens (helderheid 40 ± 4, per meting anders): een gewone
  // drempel zou honderden keren wisselen, de kleurwacht hooguit een paar keer.
  const r = rng(9), st = nieuweKleurstand();
  let wissels = 0, naief = 0, vorig = true;
  for (let i = 0; i < 1200; i++) {
    const L = 40 + (r() + r() + r() - 1.5) * 2 * 4;
    kleurStap(st, meet(L), 0.5);
    if (st.wissel) { wissels++; st.wissel = false; }
    const nu = L >= 40;
    if (nu !== vorig) naief++;
    vorig = nu;
  }
  check('kleurwacht rond de grens, 10 min: geen geflapper', wissels <= 2, '(' + wissels + ' keer gewisseld, een gewone drempel ' + naief + ' keer)');
}

// ---------------------------------------------------------------- 3. kleuren in een nagebouwde kamer

const NAMEN = Object.keys(KLEUREN);
const opgehangen = () => NAMEN.map((n, i) => ({ naam: n, x: 50 + (i % 6) * 40, y: 50 + Math.floor(i / 6) * 70, w: 18, h: 18, c: KLEUREN[n] }));

/**
 * Een kamer (licht, muurverlichting), de muur geleerd, de kleurwacht aan (poort) zoals in
 * main.js: eens per halve seconde meten, en bij een wissel vision.zetKleurOk. Na `na` s komen
 * de briefjes; vanaf `wbNa` s schuift de witbalans van de camera naar wb.
 */
function kleurKamer({ licht, fill, wb = null, wbNa = 0, poort = true, sec = 8, na = 2, seed = 5 }) {
  const k = new Kamer(seed);
  k.licht = licht; k.fill = fill;
  const v = kamerVision();
  k.wen(v, 50);
  leerMuur(v, k);
  const st = nieuweKleurstand();
  const uit = { vals: 0, valsT: [], goed: 0, soorten: 0, dicht: -1, open: -1, valsNaDicht: 0, wat: {} };
  for (let f = 0; f < sec * 10; f++) {
    const t = f / 10;
    if (t >= na && !k.briefjes.length) k.briefjes = opgehangen();
    if (wb && t >= wbNa) k.wb = wb;
    k.film(v);
    const tr = v.detect(0.1);
    if (f % 5 === 0) {
      const m = v.omgevingMeting(0.5, null, 'k');
      uit.laatste = m.kleur;
      if (poort) {
        kleurStap(st, m.kleur, 0.5);
        if (st.wissel) {
          st.wissel = false;
          v.zetKleurOk(st.ok);
          if (!st.ok && uit.dicht < 0) uit.dicht = t;
          if (st.ok && uit.dicht >= 0) uit.open = t;
        }
      }
    }
    for (const b of k.briefjes) {
      const sp = tr.find(s => Math.abs(s.cx - (b.x + 9)) < 8 && Math.abs(s.cy - (b.y + 9)) < 8);
      if (!sp || !sp.kind) continue;
      uit.soorten++;
      const verwacht = SOORT[b.naam] || null;
      if (sp.kind === verwacht) uit.goed++;
      else {
        uit.vals++; uit.wat[b.naam] = sp.kind;
        if (!st.ok) uit.valsNaDicht++;
      }
    }
  }
  uit.ok = st.ok;
  return uit;
}
const vw = (u) => Object.entries(u.wat).map(([a, b]) => a + '→' + b).join(', ');
{
  const u = kleurKamer({ licht: 1, fill: 0 });
  check('kamer in het licht: kleuren betrouwbaar, rood/groen/blauw krijgen hun soort', u.ok && u.dicht < 0 && u.goed > 100 && u.vals === 0,
    '(' + u.goed + ' goed, ' + u.vals + ' fout)');
}
{
  // Donker, en de camera stelt zijn witbalans warm bij (in het donker is het licht van de
  // beamer bijna al het licht). Zonder kleurwacht worden roze en zalm trampolines.
  const zonder = kleurKamer({ licht: 0.01, fill: 0.12, wb: [1.3, 1, 0.85], poort: false });
  check('donker met warme witbalans, zonder kleurwacht: een paar verkeerde soorten', zonder.vals > 20, '(' + zonder.vals + ' keer fout: ' + vw(zonder) + ')');
  const met = kleurKamer({ licht: 0.01, fill: 0.12, wb: [1.3, 1, 0.85] });
  check('  ... met de kleurwacht: dicht voordat de briefjes er zijn, en geen enkele soort', !met.ok && met.dicht >= 0 && met.dicht < 2 && met.soorten === 0,
    '(dicht na ' + met.dicht + ' s, ' + met.soorten + ' soorten)');
  const ruis = kleurKamer({ licht: 0.01, fill: 0.12 });
  check('donker met veel kleurkorrel (camera versterkt zesvoudig): kleuren tellen niet', !ruis.ok && ruis.soorten === 0,
    '(korrel ' + ruis.laatste.ruis.toFixed(1) + ' bij helderheid ' + ruis.laatste.L.toFixed(0) + ')');
}
{
  // Muurverlichting op 25% in dezelfde donkere kamer: genoeg licht, de kleuren tellen gewoon.
  const u = kleurKamer({ licht: 0.01, fill: 0.25 });
  check('donker, muurverlichting 25%: kleuren betrouwbaar, rood/groen/blauw werken', u.ok && u.dicht < 0 && u.goed > 100 && u.vals === 0,
    '(' + u.goed + ' goed, ' + u.vals + ' fout, korrel ' + u.laatste.ruis.toFixed(1) + ')');
  // Zoals kleurLicht in main.js: stap voor stap feller tot de meting goed is.
  const k = new Kamer(6);
  k.licht = 0.01;
  const v = kamerVision();
  const oordeel = {};
  for (const lv of [0.12, 0.25, 0.4]) {
    k.fill = lv; k.wen(v, 30);
    let goed = 0;
    v.omgevingMeting(0, null, 'k');
    for (let i = 0; i < 5; i++) { k.wen(v, 2); if (kleurOordeel(v.omgevingMeting(0, null, 'k').kleur) !== false) goed++; }
    oordeel[lv] = goed >= 4;
  }
  check('meer muurverlichting maakt de kleuren weer betrouwbaar (12% nee, 25% ja)', !oordeel[0.12] && oordeel[0.25] && oordeel[0.4], JSON.stringify(oordeel));
}
{
  // De briefjes hangen al, en ineens schuift de witbalans: dicht binnen een halve seconde, en
  // daarna nooit een verkeerde soort. Gaat de witbalans terug, dan tellen de kleuren weer.
  const u = kleurKamer({ licht: 0.01, fill: 0.25, wb: [1.3, 1, 0.85], wbNa: 5, sec: 10 });
  check('witbalans schuift terwijl de briefjes hangen: meteen dicht, daarna geen verkeerde soort', u.dicht >= 5 && u.dicht <= 5.5 && u.valsNaDicht === 0,
    '(dicht op ' + u.dicht + ' s, ' + u.vals + ' fout daarvoor, ' + u.valsNaDicht + ' daarna)');
  const k = new Kamer(7);
  k.licht = 0.01; k.fill = 0.25;
  const v = kamerVision();
  k.wen(v, 50); leerMuur(v, k);
  k.briefjes = opgehangen();
  const st = nieuweKleurstand();
  let dicht = -1, open = -1, soortNaOpen = -1;
  for (let f = 0; f < 200; f++) {
    const t = f / 10;
    k.wb = t >= 4 && t < 9 ? [1.3, 1, 0.85] : [1, 1, 1];
    k.film(v);
    const tr = v.detect(0.1);
    if (f % 5 === 0) {
      kleurStap(st, v.omgevingMeting(0.5, null, 'k').kleur, 0.5);
      if (st.wissel) { st.wissel = false; v.zetKleurOk(st.ok); if (!st.ok) dicht = t; else open = t; }
    }
    if (open >= 0 && soortNaOpen < 0 && tr.filter(s => s.kind).length >= 3) soortNaOpen = t;
  }
  check('  ... witbalans terug: kleuren weer betrouwbaar (na 4 s), en rood/groen/blauw krijgen hun soort terug', dicht > 0 && open >= 13 && open <= 15 && soortNaOpen >= open && soortNaOpen - open < 2,
    '(dicht ' + dicht + ' s, weer open ' + open + ' s, soorten terug ' + soortNaOpen + ' s)');
}

// ---------------------------------------------------------------- 4. de donkere kamers van de meetlat

// Zoals renderScene in test/bench.mjs (muur met voegen, beamervlak, camerakorrel per kleur),
// zonder voorwerpen: wat meet de kleurwacht daar?
function benchBeeld(v, opt, seed) {
  const r = rng(seed), px = new Uint8ClampedArray(320 * 240 * 4);
  const PR = { x0: 96, y0: 70, x1: 286, y1: 196 };
  const roi = { sx: PR.x0 - 190 * 0.12, sy: PR.y0 - 126 * 0.12, sw: 190 * 1.24, sh: 126 * 1.24 };
  for (let yy = 0; yy < 240; yy++) {
    for (let xx = 0; xx < 320; xx++) {
      const x = roi.sx + xx * roi.sw / 320, y = roi.sy + yy * roi.sh / 240;
      let v0 = 168 + Math.sin(x * 0.07) * 4 + Math.cos(y * 0.11) * 3;
      if (Math.abs((y % 41) - 20) < 1) v0 -= 26;
      if (Math.abs((x % 63) - 31) < 1) v0 -= 20;
      let c = [v0 + r() * 2, v0 + r() * 2, v0 * 0.99 + r() * 2];
      const inP = x >= PR.x0 && x <= PR.x1 && y >= PR.y0 && y <= PR.y1;
      if (!inP) c = c.map(q => q * 0.55);
      else c = [c[0] + 6 * 0.8, c[1] + 6, c[2] + 6 * 0.7];
      const i = (yy * 320 + xx) * 4;
      for (let k = 0; k < 3; k++) px[i + k] = c[k] * opt.exposure + (r() - 0.5) * opt.noise;
      px[i + 3] = 255;
    }
  }
  v.data = px; v.sampleCells();
}
{
  const PR = { x0: 96, y0: 70, x1: 286, y1: 196 };
  const roi = { sx: PR.x0 - 190 * 0.12, sy: PR.y0 - 126 * 0.12, sw: 190 * 1.24, sh: 126 * 1.24 };
  const binnen = (x, y) => { const wx = roi.sx + x * roi.sw / 320, wy = roi.sy + y * roi.sh / 240; return wx >= PR.x0 && wx <= PR.x1 && wy >= PR.y0 && wy <= PR.y1; };
  const uit = {};
  for (const [naam, exposure, noise] of [['rustige kamer', 1, 3.5], ['schemerig (50% licht)', 0.5, 6], ['donker (35% licht)', 0.35, 7], ['heel donker (22% licht)', 0.22, 8]]) {
    const v = makeVision(320, 240);
    v.insideFn = binnen;
    const st = nieuweKleurstand();
    let m = null;
    for (let i = 0; i < 12; i++) { benchBeeld(v, { exposure, noise }, 100 + i); m = v.omgevingMeting(0.5, null, 'b').kleur; kleurStap(st, m, 0.5); }
    uit[naam] = st.ok;
    console.log('     ' + naam.padEnd(26) + 'helderheid ' + m.L.toFixed(0).padStart(3) + ', kleurkorrel ' + m.ruis.toFixed(1) + ' -> kleuren ' + (st.ok ? 'betrouwbaar' : 'te donker'));
  }
  check('meetlat: rustige kamer, schemerig en donker houden hun kleuren', uit['rustige kamer'] && uit['schemerig (50% licht)'] && uit['donker (35% licht)']);
  check('meetlat: heel donker (22% licht) is te donker voor kleuren', !uit['heel donker (22% licht)']);
}

klaar();
