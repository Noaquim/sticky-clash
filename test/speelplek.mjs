// Drie manieren van spelen (js/speelplek.js): muur + beamer, scherm, of de demo.
//   1. de keuze bij het opstarten: welkomstkaartje voor een nieuwe speler, niet voor wie
//      al met een beamer speelde; en wat er bewaard wordt komt zo weer terug
//   2. de beginopstelling van de demo: binnen het veld, niet op de bak of de bron, niet op
//      elkaar, met één trampoline, één turbo en één blauwe muur — en hij speelt ook echt
//   3. de briefjes van de demo: tekenen, raken, verslepen, weghalen met een dubbeltik
//   4. spelen op een scherm: het camerabeeld is het speelveld, ook gespiegeld
//   5. kan de camera hier, en waar "Open het spel in een eigen tabblad" heen gaat
//   6. het spel tekent briefjes als papier, en op een scherm het camerabeeld eronder
// node test/speelplek.mjs
import { check, klaar, makeVision, Game, rng } from './hulp.mjs';
const sp = await import('../js/speelplek.js');
const { applyH, invertH } = await import('../js/homography.js');
const {
  SPEELPLEKKEN, DEMO_KLEUREN, DEMO_SPECIAAL, bepaalSpeelplek, bewaarSpeelplek, schermHomografie, schermBeeldX, pasVeld,
  maakBriefje, demoOpstelling, briefjeUitSleep, briefjeVak, afstandTotBriefje, briefjeOp, kruisjeVan, schuifBriefje,
  briefjesMee, demoMee, dubbeltik, cameraReden, eigenTabblad, SPEL_ADRES,
} = sp;

// ---------------------------------------------------------------- 1. de keuze bij het opstarten

{
  const b = bepaalSpeelplek;
  const is = (r, plek, welkom) => r.plek === plek && r.welkom === welkom;
  check('nieuwe speler (niets bewaard): welkomstkaartje', is(b(null, false), null, true));
  check('bewaarde keuze komt terug, zonder kaartje', SPEELPLEKKEN.every(p => is(b({ speelplek: p }, false), p, false)));
  check('bewaard maar nog niets gekozen: weer het kaartje', is(b({ speelplek: null, sens: 60 }, false), null, true));
  check('onzin als keuze: het kaartje', is(b({ speelplek: 'zolder' }, false), null, true) && is(b({ speelplek: 7 }, true), null, true));
  check('instellingen van vóór de speelplekken: muur, geen kaartje', is(b({ H: [1, 0, 0, 0, 1, 0, 0, 0, 1], sens: 60, best: {} }, false), 'muur', false));
  check('  ook met alleen een camera of een score van vroeger', is(b({ sens: 60, camId: 'abc', H: null }, false), 'muur', false) &&
    is(b({ calCam: 'abc' }, false), 'muur', false) && is(b({ best: { object: 3, color: 0 } }, false), 'muur', false) &&
    is(b({ best: { object: 0, color: 2 } }, false), 'muur', false));
  // De oude versie bewaarde bij elk bezoek. Wie toen alleen even keek, speelde nog niet.
  check('oude bezoeker die nooit speelde (standaardwaarden bewaard): het kaartje', is(b({ H: null, sens: 60, camId: '', calCam: '',
    best: { object: 0, color: 0 }, mode: 'object', mirror: false }, false), null, true) && is(b({ sens: 60, best: 'kapot' }, false), null, true));
  check('alleen een oude opslag (v4, v2): muur, geen kaartje', is(b(null, true), 'muur', false));
  check('kapotte opslag (geen object): als nieuw', is(b('tekst', false), null, true) && is(b(42, false), null, true));
  // wat main.js bewaart en bij de volgende keer weer inleest
  const heen = (plek, gekozen) => b(JSON.parse(JSON.stringify({ speelplek: bewaarSpeelplek(plek, gekozen), sens: 60 })), false);
  check('bewaren en weer inlezen: gekozen blijft gekozen', SPEELPLEKKEN.every(p => is(heen(p, true), p, false)));
  check('  niet gekozen (pagina dicht bij het kaartje): kaartje weer', is(heen('muur', false), null, true));
  const bestaand = { sens: 60, camId: 'abc' };
  check('  een bestaande speler bewaart voortaan "muur"', is(heen(b(bestaand, false).plek, !b(bestaand, false).welkom), 'muur', false));
}

// ---------------------------------------------------------------- 2. de beginopstelling van de demo

const binnen = (poly, W, H) => poly.every(p => p[0] >= -1e-6 && p[0] <= W + 1e-6 && p[1] >= -1e-6 && p[1] <= H + 1e-6);
/** Kortste afstand tussen twee bolle veelhoeken (0 als ze elkaar raken). */
function tussen(a, b) {
  if (a.some(p => afstandTotBriefje(b, p[0], p[1]) === 0) || b.some(p => afstandTotBriefje(a, p[0], p[1]) === 0)) return 0;
  let d = Infinity;
  for (const p of a) d = Math.min(d, afstandTotBriefje(b, p[0], p[1]));
  for (const p of b) d = Math.min(d, afstandTotBriefje(a, p[0], p[1]));
  return d;
}
for (const W of [1200, 1500, 1000 * 16 / 9, 2000, 2400, 900]) {
  const o = demoOpstelling(W, 1000), br = o.briefjes, naam = 'demo, veld ' + Math.round(W) + ' breed: ';
  check(naam + '5 tot 7 briefjes, allemaal binnen het veld', br.length >= 5 && br.length <= 7 && br.every(b => binnen(b.poly, W, 1000)));
  const soorten = br.map(b => b.kind).filter(Boolean).sort().join(',');
  check(naam + 'precies één trampoline, turbo en blauwe muur', soorten === 'booster,breek,trampoline', soorten);
  const gewoon = br.filter(b => !b.kind);
  check(naam + 'gewone briefjes in gewone kleuren', gewoon.length >= 2 && gewoon.every(b => DEMO_KLEUREN.includes(b.kleur)) &&
    br.filter(b => b.kind).every(b => b.kleur === DEMO_SPECIAAL[b.kind]));
  const g = o.doel, s = o.bron;
  const bak = Math.min(...br.map(b => afstandTotBriefje(b.poly, g.x, g.y)));
  const bron = Math.min(...br.map(b => afstandTotBriefje(b.poly, s.x, s.y)));
  check(naam + 'bak en bron vrij', bak > g.r + 20 && bron > 60 && g.x - g.r >= 0 && g.x + g.r <= W && s.x > 0 && s.x < W,
    'bak ' + Math.round(bak) + ', bron ' + Math.round(bron));
  let raak = 0;
  for (let i = 0; i < br.length; i++) for (let j = i + 1; j < br.length; j++) if (tussen(br[i].poly, br[j].poly) < 20) raak++;
  check(naam + 'briefjes niet op of tegen elkaar', raak === 0);
}
{
  // Speelt hij ook? Een minuut spelen op een scherm van 16:9: een deel haalt de bak, niet
  // alles, en elk speciaal briefje doet mee.
  const tel = { boing: 0, whoosh: 0, krak: 0 };
  const stil = { bounce() {}, boing() { tel.boing++; }, whoosh() { tel.whoosh++; }, krak() { tel.krak++; }, score() {}, goud() {}, bonus() {},
    miss() {}, tick() {}, start() {}, end() {}, record() {}, combo() {} };
  let raak = 0, ballen = 0;
  for (const seed of [11, 12, 13]) {
    const oud = Math.random;
    Math.random = rng(seed * 7919);
    const g = new Game(stil);
    g.setAspect(16 / 9);
    g.bonusOn = false;
    const o = demoOpstelling(g.W, g.H);
    g.goal.r = o.doel.r; g.setGoal(o.doel.x, o.doel.y); g.setSource(o.bron.x, o.bron.y);
    g.setObstacles(o.briefjes);
    const was = g.scored.bind(g);
    g.scored = (b, bin) => { raak++; was(b, bin); };
    g.start(60);
    for (let i = 0; i < 64 * 60; i++) g.update(1 / 60);
    ballen += g.spawned;
    Math.random = oud;
  }
  check('demo speelt: een deel van de ballen haalt de bak', raak >= 0.12 * ballen && raak <= 0.8 * ballen, raak + ' van ' + ballen);
  check('  trampoline, turbo en blauwe muur doen alle drie mee', tel.boing > 5 && tel.whoosh > 5 && tel.krak >= 1, JSON.stringify(tel));
}

// ---------------------------------------------------------------- 3. de briefjes

{
  check('tik (geen sleep): geen briefje', briefjeUitSleep([100, 100], [110, 115]) === null);
  const r = briefjeUitSleep([300, 200], [100, 320], undefined, '#ffd84d');
  const v = briefjeVak(r.poly);
  check('slepen: rechthoek van hoek tot hoek', Math.abs(v[0] - 100) < 1e-9 && Math.abs(v[2] - 300) < 1e-9 && Math.abs(v[1] - 200) < 1e-9 &&
    Math.abs(v[3] - 320) < 1e-9 && r.kleur === '#ffd84d' && r.kind === undefined && r.vx === 0);
  const streep = briefjeUitSleep([100, 500], [400, 503], 'booster');
  const sv = briefjeVak(streep.poly);
  check('een streep wordt een smal briefje, geen lijntje', sv[3] - sv[1] >= 40 && sv[2] - sv[0] === 300 && streep.kind === 'booster' &&
    streep.kleur === DEMO_SPECIAAL.booster);
  const a = maakBriefje(200, 200, 100, 100, 0), b = maakBriefje(240, 200, 100, 100, 0);
  check('raken: erin is afstand 0, ernaast de afstand tot de rand', afstandTotBriefje(a.poly, 200, 200) === 0 &&
    Math.abs(afstandTotBriefje(a.poly, 270, 200) - 20) < 1e-9);
  check('  het bovenste briefje (laatst getekend) eerst', briefjeOp([a, b], 230, 200) === 1 && briefjeOp([a, b], 160, 200) === 0 &&
    briefjeOp([a, b], 600, 600) === -1);
  check('  met speling voor een vinger', briefjeOp([a], 258, 200) === -1 && briefjeOp([a], 258, 200, 10) === 0);
  const gedraaid = maakBriefje(500, 500, 120, 120, 30);
  check('gedraaid briefje: vier hoeken, zelfde oppervlak', gedraaid.poly.length === 4 &&
    Math.abs(Math.abs(gedraaid.poly.reduce((s, p, i, q) => s + p[0] * q[(i + 1) % 4][1] - q[(i + 1) % 4][0] * p[1], 0)) / 2 - 14400) < 1e-6);
  const k = kruisjeVan(a.poly);
  check('kruisje rechtsboven', k[0] === 250 && k[1] === 150);
  const c = maakBriefje(100, 100, 100, 100, 0);
  const d = schuifBriefje(c, -500, 30, 1600, 1000);
  const cv = briefjeVak(c.poly);
  check('verslepen: nooit buiten het veld', d[0] === -50 && d[1] === 30 && cv[0] === 0 && cv[1] === 80);
  const e = maakBriefje(1550, 900, 100, 100, 0);
  schuifBriefje(e, 500, 500, 1600, 1000);
  const ev = briefjeVak(e.poly);
  check('  ook niet rechts of onder', ev[2] === 1600 && ev[3] === 1000);
  const tik = { t: 1000, x: 100, y: 100, doel: a };
  check('dubbeltik: zelfde briefje, snel, dichtbij', dubbeltik(tik, 1300, 110, 105, a) && dubbeltik(tik, 1450, 100, 100, a) && !dubbeltik(tik, 1500, 100, 100, a) &&
    !dubbeltik(tik, 1300, 100, 100, b) && !dubbeltik(tik, 1300, 200, 100, a) && !dubbeltik(null, 1300, 100, 100, a));
}
{
  // het veld wordt breder of smaller: de opstelling schuift als één geheel mee
  const W1 = 1000 * 16 / 9, W2 = 2400;
  const o = demoOpstelling(W1), br = o.briefjes;
  const midden = (b) => { const v = briefjeVak(b.poly); return [(v[0] + v[2]) / 2, (v[1] + v[3]) / 2]; };
  const voor = br.map(midden);
  briefjesMee(br, W1, W2, 1000);
  const na = br.map(midden), nieuw = demoOpstelling(W2).briefjes.map(midden);
  check('breder veld: briefjes liggen waar de opstelling ze daar zou leggen', na.every((p, i) => Math.hypot(p[0] - nieuw[i][0], p[1] - nieuw[i][1]) < 1e-6));
  check('  bak en bron schuiven net zo mee', Math.abs(demoMee(o.doel.x, W1, W2) - demoOpstelling(W2).doel.x) < 1e-6 &&
    Math.abs(demoMee(o.bron.x, W1, W2) - demoOpstelling(W2).bron.x) < 1e-6);
  briefjesMee(br, W2, W1, 1000);
  check('  en terug: precies waar ze waren', br.map(midden).every((p, i) => Math.hypot(p[0] - voor[i][0], p[1] - voor[i][1]) < 1e-6));
  check('  de vorm blijft', br.every((b, i) => Math.abs(briefjeVak(b.poly)[2] - briefjeVak(b.poly)[0] - (briefjeVak(demoOpstelling(W1).briefjes[i].poly)[2] -
    briefjeVak(demoOpstelling(W1).briefjes[i].poly)[0])) < 1e-6));
}

// ---------------------------------------------------------------- 4. spelen op een scherm

{
  const I = schermHomografie(false), M = schermHomografie(true);
  const pts = [[0, 0], [1, 0], [1, 1], [0, 1], [0.25, 0.7], [0.9, 0.1]];
  check('scherm: het camerabeeld is het speelveld (0..1 blijft 0..1)', pts.every(([u, v]) => { const q = applyH(I, u, v); return q[0] === u && q[1] === v; }));
  check('scherm gespiegeld: links en rechts om, boven en onder niet', pts.every(([u, v]) => { const q = applyH(M, u, v); return Math.abs(q[0] - (1 - u)) < 1e-12 && q[1] === v; }));
  check('  terugrekenen kan (voor de uitsnede en de omlijning)', pts.every(([u, v]) => {
    const q = applyH(invertH(M), ...applyH(M, u, v)); return Math.abs(q[0] - u) < 1e-12 && Math.abs(q[1] - v) < 1e-12;
  }));
  // Wat de herkenning op werkpixel (x, y) ziet, moet in het spel precies liggen waar het
  // camerabeeld op het scherm getekend wordt — ook als de herkenning zelf gespiegeld kijkt.
  let fout = 0;
  for (const visieSpiegel of [false, true]) {
    for (const schermSpiegel of [false, true]) {
      const v = makeVision(320, 240);
      v.mirror = visieSpiegel;
      const H = schermHomografie(schermSpiegel);
      for (const [x, y] of [[10, 20], [160, 120], [300, 230], [47, 199]]) {
        const u = (visieSpiegel ? v.vw - x : x) / v.vw;          // kolom in het echte camerabeeld
        const q = applyH(H, ...v.camNorm(x, y));
        if (Math.abs(q[0] - schermBeeldX(u, schermSpiegel)) > 1e-9 || Math.abs(q[1] - y / v.vh) > 1e-9) fout++;
      }
    }
  }
  check('  voorwerp en camerabeeld vallen samen, gespiegeld of niet', fout === 0, fout + ' fout');
  const g = pasVeld(1000, 600, 16 / 9);
  check('speelveld in de verhouding van de camera, zo groot als past', Math.abs(g.w / g.h - 16 / 9) < 0.01 && g.w <= 1000 && g.h <= 600 && (g.w === 1000 || g.h === 600));
  const tel = pasVeld(360, 640);
  check('demo op een telefoon rechtop: liggend veld, niet smaller dan 1,2', Math.abs(tel.w / tel.h - 1.2) < 0.01 && tel.w <= 360);
  const breed = pasVeld(3000, 600);
  check('  en op een heel breed scherm niet breder dan 2,4', Math.abs(breed.w / breed.h - 2.4) < 0.01 && breed.h === 600);
  const vrij = pasVeld(1600, 900);
  check('  daartussen: de hele ruimte', vrij.w === 1600 && vrij.h === 900);
}

// ---------------------------------------------------------------- 5. kan de camera hier?

{
  const env = (o) => ({ api: true, veilig: true, ingesloten: false, beleid: null, geweigerd: false, ...o });
  check('gewoon tabblad: camera kan', cameraReden(env()) === null && cameraReden(env({ beleid: true })) === null);
  check('ingesloten zonder allow="camera" (itch.io): ingesloten', cameraReden(env({ ingesloten: true, beleid: false })) === 'ingesloten');
  check('  ingesloten en geweigerd: ook ingesloten', cameraReden(env({ ingesloten: true, geweigerd: true })) === 'ingesloten');
  check('  ingesloten maar toegestaan: camera kan', cameraReden(env({ ingesloten: true, beleid: true })) === null);
  check('geen https: onveilig; oude browser: geen-api', cameraReden(env({ api: false, veilig: false })) === 'onveilig' &&
    cameraReden(env({ api: false })) === 'geen-api');
  check('zelf geweigerd in een gewoon tabblad', cameraReden(env({ geweigerd: true })) === 'geweigerd');
  check('eigen tabblad: dit adres, zonder #', eigenTabblad('https://iemand.itch.zone/html/123/index.html?v=2#x') === 'https://iemand.itch.zone/html/123/index.html?v=2' &&
    eigenTabblad('file:///C:/spel/sticky-clash.html') === 'file:///C:/spel/sticky-clash.html');
  check('  geen gewoon adres: de site', eigenTabblad('about:srcdoc') === SPEL_ADRES && eigenTabblad('blob:https://x/1') === SPEL_ADRES &&
    eigenTabblad('') === SPEL_ADRES && /^https:\/\/noaquim\.github\.io\/sticky-clash\/$/.test(SPEL_ADRES));
}

// ---------------------------------------------------------------- 6. tekenen

{
  const oproepen = [];
  const ctx = new Proxy({}, {
    get: (o, k) => (k in o ? o[k] : k === 'createRadialGradient' ? () => ({ addColorStop() {} })
      : typeof k === 'string' ? (...a) => { oproepen.push([k, o.fillStyle, o.strokeStyle, a]); } : undefined),
    set: (o, k, v) => { o[k] = v; return true; },
  });
  const stil = { bounce() {}, krak() {}, score() {}, miss() {}, tick() {}, start() {}, end() {} };
  const g = new Game(stil);
  g.papier = true; g.showOutlines = false;
  const o = demoOpstelling(g.W, g.H);
  g.setObstacles(o.briefjes);
  g.render(ctx, 1600, 900);
  const gevuld = new Set(oproepen.filter(c => c[0] === 'fill').map(c => c[1]));
  check('papier: elk briefje gevuld in zijn eigen kleur', o.briefjes.every(b => gevuld.has(b.kleur)));
  const br = o.briefjes.find(b => b.kind === 'breek');
  const st = g.breakState(br); st.hits = 5; st.left = 3;
  oproepen.length = 0;
  g.render(ctx, 1600, 900);
  const lijnen = oproepen.filter(c => c[0] === 'setLineDash' && c[3][0] && c[3][0].length);
  check('  een kapotte blauwe muur is even een stippellijn', lijnen.length >= 1 && !oproepen.some(c => c[0] === 'fill' && c[1] === DEMO_SPECIAAL.breek));
  // op een scherm: onderlaag in plaats van de muurverlichting
  let onder = 0;
  const h = new Game(stil);
  h.onderlaag = (c, w, hh) => { onder++; if (w !== 1280 || hh !== 720) onder = -99; };
  oproepen.length = 0;
  h.render(ctx, 1280, 720);
  check('scherm: camerabeeld onder het spel, geen muurverlichting', onder === 1 && !oproepen.some(c => c[0] === 'fillRect' && /^rgb\(/.test(c[1])));
  const m = new Game(stil);
  oproepen.length = 0;
  m.render(ctx, 1280, 720);
  check('  de muur (beamer) blijft zoals hij was', oproepen.some(c => c[0] === 'fillRect' && /^rgb\(/.test(c[1])) && !m.papier && m.onderlaag === null);
}

klaar();
