// Bedienen met je telefoon (js/telefoon.js), zonder internet: een nep-doorgeefluik, een
// nep-klok en het echte spel. Controleert:
//   1. wat binnenkomt: alleen bekende knoppen, korte berichten, nette namen
//   2. de stand die naar de telefoon gaat, per fase van het spel
//   3. zuinig versturen: hooguit één per seconde, de laatste wint, een emmertje, en na
//      "te veel" (429) of geen verbinding steeds langer wachten
//   4. knoppen lopen via dezelfde weg als het paneel, en onzin wordt netjes geweigerd
//   5. de QR-code op de muur: nooit op een voorwerp of de ranglijst, en de camera ziet
//      hem niet als voorwerp (het spel voorspelt zijn eigen licht)
import { Game, makeVision, rng, check, klaar } from './hulp.mjs';
import {
  Telefoon, TelefoonZender, telefoonKamer, telefoonLink, telefoonNaam, telefoonLeesKnop,
  telefoonLeesNtfy, telefoonStand, TELEFOON_PAGINA, TELEFOON_RELAY,
} from '../js/telefoon.js';
import { qrMaak } from '../js/qr.js';

const stil = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };
const knopTekst = (wat, extra = {}) => JSON.stringify({ v: 1, soort: 'knop', wat, van: 'tel1', ...extra });

// ---- 1. wat binnenkomt ---------------------------------------------------------
{
  const goed = ['hallo', 'start', 'pauze', 'verder', 'nieuw'].every(w => telefoonLeesKnop(knopTekst(w))?.wat === w);
  check('bekende knoppen komen door', goed);
  const naam = telefoonLeesKnop(knopTekst('naam', { naam: '  Noor  ', vraag: 3 }));
  check('naam met vraagnummer komt door, netjes', naam && naam.naam === 'Noor' && naam.vraag === 3);
  const slecht = [
    'geen json', '[]', 'null', '42', '"start"',
    JSON.stringify({ v: 1, soort: 'knop', wat: 'reset' }),                    // onbekende knop
    JSON.stringify({ v: 1, soort: 'knop', wat: 'constructor' }),
    JSON.stringify({ v: 1, soort: 'knop', wat: ['start'] }),
    JSON.stringify({ v: 2, soort: 'knop', wat: 'start' }),                    // andere versie
    JSON.stringify({ v: 1, soort: 'stand', wat: 'start' }),
    JSON.stringify({ v: 1, soort: 'knop', wat: 'start', van: '<img src=x>' }),
    JSON.stringify({ v: 1, soort: 'knop', wat: 'start', van: 12 }),
    JSON.stringify({ v: 1, soort: 'knop', wat: 'naam', naam: 'Noor' }),        // geen vraagnummer
    JSON.stringify({ v: 1, soort: 'knop', wat: 'naam', naam: 'Noor', vraag: 1.5 }),
    JSON.stringify({ v: 1, soort: 'knop', wat: 'naam', naam: { x: 1 }, vraag: 1 }),
    JSON.stringify({ v: 1, soort: 'knop', wat: 'naam', naam: 'x'.repeat(65), vraag: 1 }),
    knopTekst('start', { opvulling: 'x'.repeat(400) }),                         // te lang bericht
    '{"__proto__":{"v":1,"soort":"knop","wat":"start"}}',
  ];
  const door = slecht.filter(t => telefoonLeesKnop(t) !== null);
  check('onzin, vreemde knoppen en te lange berichten geweigerd', door.length === 0, door.length ? door[0].slice(0, 40) : '(' + slecht.length + ' gevallen)');
  check('namen: stuurtekens en omkeer-tekens eruit', telefoonNaam('No\u202eor\u0000\u200b') === 'Noor');
  check('namen: hooguit 16 tekens, emoji blijven heel', telefoonNaam('😀'.repeat(10)) === '😀'.repeat(8) &&
    telefoonNaam('abcdefghijklmnopqrstuvwxyz') === 'abcdefghijklmnop');
  check('namen: spaties samengevoegd', telefoonNaam(' Anna \n  de   Vries ') === 'Anna de Vries');
  const env = (o) => JSON.stringify(o);
  check('ntfy: alleen gewone berichten, geen open of keepalive',
    telefoonLeesNtfy(env({ event: 'message', message: 'hoi' })) === 'hoi' &&
    telefoonLeesNtfy(env({ event: 'open' })) === null && telefoonLeesNtfy(env({ event: 'keepalive' })) === null &&
    telefoonLeesNtfy(env({ event: 'message', message: 5 })) === null && telefoonLeesNtfy('kapot') === null);
}

// ---- kamercode en adres ---------------------------------------------------------
{
  const codes = new Set();
  let vorm = true;
  for (let i = 0; i < 200; i++) {
    const k = telefoonKamer();
    codes.add(k);
    if (!/^[A-Za-z0-9_-]{20}$/.test(k)) vorm = false;
  }
  check('kamercode: 20 tekens (120 bits), steeds anders', vorm && codes.size === 200);
  check('QR-adres op GitHub Pages: telefoon.html ernaast',
    telefoonLink('abc', 'https://iemand.github.io/sticky-clash/index.html?x=1#y') === 'https://iemand.github.io/sticky-clash/telefoon.html#abc');
  check('QR-adres vanaf localhost of het losse bestand: de vaste pagina',
    telefoonLink('abc', 'http://localhost:8123/') === TELEFOON_PAGINA + '#abc' &&
    telefoonLink('abc', 'file:///C:/spel/sticky-clash.html') === TELEFOON_PAGINA + '#abc');
  check('doorgeefluik is ntfy.sh', TELEFOON_RELAY === 'https://ntfy.sh');
}

// ---- 2. de stand per fase --------------------------------------------------------
{
  const g = new Game(null);
  g.setAspect(16 / 9);
  g.reset(); g.time = 180;
  let s = telefoonStand(g, false, 0, '', '');
  check('stand: klaar om te starten', s.fase === 'idle' && s.tijd === 180 && !s.telOp && s.score === 0);
  g.start(120);
  s = telefoonStand(g, false, 0, '', '');
  check('stand: aftellen, met de aftel- en rondetijd', s.fase === 'count' && s.aftel === 3 && s.tijd === 120);
  for (let i = 0; i < 200; i++) g.update(1 / 60);
  g.score.attack = 4;
  s = telefoonStand(g, false, 0, '', '');
  check('stand: spelen, resterende tijd loopt', s.fase === 'play' && s.tijd > 115 && s.tijd < 120 && s.score === 4);
  g.togglePause();
  check('stand: pauze', telefoonStand(g, false, 0, '', '').fase === 'paused');
  g.endless = true;
  check('stand: geen tijdslimiet telt op', telefoonStand(g, false, 0, '', '').telOp === true);
  g.endless = false;
  g.togglePause();
  for (let i = 0; i < 130 * 60; i++) g.update(1 / 60);
  s = telefoonStand(g, false, 2, '4 punten — dat haalt de ranglijst! Hoe heet je?', 'Opgeslagen');
  check('stand: afgelopen, met naamvraag en melding', s.fase === 'over' && s.tijd === 0 && s.vraag === 2 &&
    s.vraagTekst.startsWith('4 punten') && s.melding === 'Opgeslagen');
  g.duel = true; g.score.block = 3;
  s = telefoonStand(g, true, 0, 'x', '');
  check('stand: duel en bezig', s.duel && s.tegen === 3 && s.bezig && s.vraagTekst === '');
  check('stand: klein bericht (ntfy.sh laat 4 KB toe)', JSON.stringify(s).length < 400, JSON.stringify(s).length + ' tekens');
}

// ---- 3. zuinig versturen ---------------------------------------------------------
{
  let nu = 0;
  const verstuurd = [];
  let antwoord = 200;
  const z = new TelefoonZender((t) => { verstuurd.push({ t, nu }); return Promise.resolve(antwoord); }, () => nu);
  let stand = 'a';
  z.maak = () => stand;
  z.vraag(); z.tik(nu);
  check('eerste bericht meteen', verstuurd.length === 1 && verstuurd[0].t === 'a');
  await stil();
  // drie veranderingen binnen een seconde: één bericht, met de laatste stand
  nu = 100; stand = 'b'; z.vraag(); z.tik(nu);
  nu = 400; stand = 'c'; z.vraag(); z.tik(nu);
  nu = 900; stand = 'd'; z.vraag(); z.tik(nu);
  check('binnen een seconde niets meer', verstuurd.length === 1);
  nu = 1000; z.tik(nu);
  await stil();
  check('daarna één bericht met de laatste stand', verstuurd.length === 2 && verstuurd[1].t === 'd');
  nu = 5000; z.tik(nu);
  check('niets nieuws: niets versturen', verstuurd.length === 2);
  // emmertje: 15 vlak na elkaar (er zijn er al 2), daarna één per 5 s
  for (let i = 0; i < 40; i++) { nu += 1000; z.vraag(); z.tik(nu); await stil(); }
  const inEenMinuut = verstuurd.filter(v => v.nu > 5000 && v.nu <= 45000).length;
  check('emmertje: na de eerste 15 één per 5 s', inEenMinuut <= 13 + 8 + 1 && inEenMinuut >= 13 + 6, inEenMinuut + ' berichten in 40 s');
  // 429: wachten, steeds langer, en dan de nieuwste stand
  const z2 = new TelefoonZender((t) => { verstuurd.push({ t, nu }); return Promise.resolve(antwoord); }, () => nu);
  z2.maak = () => stand;
  nu = 100000; antwoord = 429; stand = 'e'; z2.vraag(); z2.tik(nu); await stil();
  check('te veel (429): status druk', z2.status === 'druk');
  const n0 = verstuurd.length;
  for (let t = 0; t < 9000; t += 250) { nu = 100000 + t; z2.tik(nu); await stil(); }
  check('... en 10 s niet opnieuw proberen', verstuurd.length === n0);
  stand = 'f';
  nu = 110100; z2.tik(nu); await stil();
  check('... daarna wel, met de nieuwste stand', verstuurd.length === n0 + 1 && verstuurd[verstuurd.length - 1].t === 'f');
  const tweede = nu;
  for (let t = 0; t < 25000; t += 250) { nu = tweede + t; z2.tik(nu); await stil(); }
  const pogingen = verstuurd.slice(n0).map(v => v.nu - 100000);
  check('... de pauze verdubbelt (10, 20 s)', pogingen.length === 2, pogingen.join(', ') + ' ms');
  antwoord = 0;                                                 // geen verbinding
  for (let t = 0; t < 60000; t += 250) { nu = tweede + 25000 + t; z2.tik(nu); await stil(); }
  check('geen verbinding: status fout', z2.status === 'fout');
  antwoord = 200;
  for (let t = 0; t < 70000 && z2.status !== 'ok'; t += 250) { nu += 250; z2.tik(nu); await stil(); }
  check('... en na herstel weer goed', z2.status === 'ok' && z2.fouten === 0);
  // een bericht dat nog onderweg is: niet dubbel versturen
  let los;
  const z3 = new TelefoonZender(() => new Promise(r => { los = r; }), () => nu);
  let n3 = 0;
  z3.maak = () => String(++n3);
  z3.vraag(); z3.tik(nu); nu += 5000; z3.vraag(); z3.tik(nu);
  check('onderweg: niet nog een keer tegelijk', n3 === 1);
  los(200); await stil(); nu += 1; z3.tik(nu);
  check('... wel direct daarna', n3 === 2);
}

// ---- 4. de koppeling met nep-doorgeefluik ----------------------------------------
class NepBron {
  constructor(url) { this.url = url; this.readyState = 0; NepBron.alle.push(this); }
  close() { this.readyState = 2; }
  open() { this.readyState = 1; if (this.onopen) this.onopen({}); }
  bericht(message) { if (this.onmessage) this.onmessage({ data: JSON.stringify({ id: 'x', time: 1, event: 'message', topic: 't', message }) }); }
  fout(st) { this.readyState = st; if (this.onerror) this.onerror({}); }
}
NepBron.alle = [];
{
  let nu = 0;
  const posts = [];
  const g = new Game(null);
  g.setAspect(16 / 9);
  g.reset();
  const app = { busy: false, pendingScore: null };
  const knoppen = [];
  const bron = {
    bezig: () => app.busy,
    vraag: () => app.pendingScore,
    vraagTekst: () => '7 punten — dat haalt de ranglijst! Hoe heet je?',
    // zoals btnPlay en btnReset in main.js
    knop: (id) => {
      knoppen.push(id);
      if (id === 'btnReset') g.reset();
      else if (g.state === 'count') { /* aftellen loopt al */ }
      else if (g.state === 'play' || g.state === 'paused') g.togglePause();
      else g.start(90);
    },
    bewaarNaam: (naam) => { knoppen.push('naam:' + naam); app.pendingScore = null; },
    status: () => {},
    onderbalk: () => 0,
  };
  const t = new Telefoon(g, bron, {
    maakBron: (url) => new NepBron(url),
    post: (onderwerp, tekst, keepalive) => { posts.push({ onderwerp, tekst, keepalive, nu }); return Promise.resolve(200); },
    klok: () => nu,
  });
  const naarTelefoon = () => posts.filter(p => p.onderwerp.endsWith('-t')).map(p => JSON.parse(p.tekst));
  const laatste = () => naarTelefoon().at(-1);
  // tijd laten lopen zoals de hoofdlus: het spel en de koppeling elke 50 ms
  const stap = async (ms = 1100) => {
    for (let k = 0; k < ms; k += 50) { nu += 50; g.update(0.05); t.bijwerken(nu); await stil(); }
  };

  t.koppel();
  const es = NepBron.alle.at(-1);
  check('koppelen: luistert op sc-<kamer>-l', es.url === 'https://ntfy.sh/sc-' + t.kamer + '-l/sse' && t.qr && t.qr.versie <= 5,
    'QR versie ' + (t.qr && t.qr.versie));
  es.open();
  await stap(); await stap();
  check('zonder telefoon: niets versturen', posts.length === 0);
  es.bericht(knopTekst('hallo'));
  await stap();
  check('hallo: telefoon verbonden, stand als antwoord', t.telefoons.size === 1 && laatste()?.fase === 'idle' &&
    posts[0].onderwerp === 'sc-' + t.kamer + '-t');
  // voor de ronde het schuifje Rondeduur of "geen tijdslimiet" veranderd (zoals main.js dat doet)
  const nVoor = naarTelefoon().length;
  g.roundLen = 150; g.time = 150;
  await stap();
  check('andere rondeduur voor de ronde: de telefoon krijgt de nieuwe tijd', naarTelefoon().length === nVoor + 1 && laatste().tijd === 150);
  g.endless = true; g.time = 0;
  await stap();
  check('"geen tijdslimiet" aan: de telefoon telt op', naarTelefoon().length === nVoor + 2 && laatste().telOp === true);
  g.endless = false; g.time = 150;
  await stap(); await stap();
  check('... en weer uit, daarna geen berichten meer', naarTelefoon().length === nVoor + 3 && laatste().telOp === false);
  es.bericht(knopTekst('start'));
  await stap();
  check('start: via de startknop, stand wordt aftellen', knoppen.at(-1) === 'btnPlay' && laatste()?.fase === 'count');
  for (let i = 0; i < 4; i++) await stap(1000);
  check('na het aftellen: spelen', laatste()?.fase === 'play' && laatste().tijd <= 90);
  const voor = naarTelefoon().length;
  for (let i = 0; i < 20; i++) { g.score.attack++; await stap(250); }
  check('doelpunten tijdens het spel: geen berichten', naarTelefoon().length === voor);
  es.bericht(knopTekst('start'));
  await stap();
  check('start tijdens het spel: geweigerd met reden', knoppen.at(-1) === 'btnPlay' && g.state === 'play' &&
    laatste()?.melding === 'Er loopt al een ronde');
  es.bericht(knopTekst('pauze'));
  await stap();
  check('pauze', g.state === 'paused' && laatste()?.fase === 'paused' && laatste().score === g.score.attack);
  es.bericht(knopTekst('pauze'));
  await stap();
  check('pauze op pauze: reden', g.state === 'paused' && laatste()?.melding === 'Staat al op pauze');
  app.busy = true;
  es.bericht(knopTekst('verder'));
  await stap();
  check('verder terwijl het spel zich instelt: geweigerd', g.state === 'paused' && /stelt zich/.test(laatste()?.melding) && laatste().bezig);
  app.busy = false;
  await stap();
  es.bericht(knopTekst('verder'));
  await stap();
  check('verder', g.state === 'play' && laatste()?.fase === 'play');
  es.bericht(knopTekst('nieuw'));
  await stap();
  check('nieuwe ronde tijdens het spel: eerst pauze', g.state === 'play' && /pauze/.test(laatste()?.melding));
  // ronde uitspelen: naam gevraagd
  for (let i = 0; i < 100 && g.state !== 'over'; i++) await stap(1000);
  app.pendingScore = { soort: 'object', score: 7 };
  await stap();
  const vr = laatste();
  check('afgelopen: naam gevraagd, met nummer', g.state === 'over' && vr?.fase === 'over' && vr.vraag === 1 && vr.vraagTekst.startsWith('7 punten'));
  es.bericht(knopTekst('naam', { naam: 'Oud', vraag: 99 }));
  await stap();
  check('naam bij een oude vraag: geweigerd', app.pendingScore && !knoppen.some(k => k.startsWith('naam:')) && /geen naam/.test(laatste()?.melding));
  es.bericht(knopTekst('naam', { naam: 'Noor\u202e', vraag: 1 }));
  await stap();
  check('naam: via bewaarNaam, netjes', knoppen.at(-1) === 'naam:Noor' && laatste()?.vraag === 0 && /Opgeslagen/.test(laatste().melding));
  es.bericht(knopTekst('nieuw'));
  await stap();
  check('nieuwe ronde na afloop: reset en start', knoppen.slice(-2).join() === 'btnReset,btnPlay' && g.state === 'count');
  app.busy = true;
  g.reset();
  await stap();
  es.bericht(knopTekst('start'));
  await stap();
  check('start terwijl het spel zich instelt: geweigerd', g.state === 'idle' && /instellen/.test(laatste()?.melding));
  app.busy = false;
  // rommel mag niets doen
  const k0 = knoppen.length;
  es.bericht('{"v":1,"soort":"knop","wat":"reset"}');
  if (es.onmessage) es.onmessage({ data: JSON.stringify({ event: 'open' }) });
  if (es.onmessage) es.onmessage({ data: '{kapot' });
  await stap();
  check('rommel en ntfy-gebeurtenissen: geen knoppen', knoppen.length === k0);
  // verbinding weg en terug: de stand opnieuw sturen
  const n1 = naarTelefoon().length;
  es.fout(0);
  check('verbinding weg: status', t.relais === 'weg');
  es.open();
  await stap();
  check('verbinding terug: stand opnieuw gestuurd', naarTelefoon().length === n1 + 1);
  es.fout(2);
  check('browser geeft op: zelf opnieuw, na 5 s', t.relais === 'weg' && t.es === null && t.herOver - nu === 5000);
  clearTimeout(t.herTimer);
  t.luister();
  const es2 = NepBron.alle.at(-1);
  check('... nieuwe verbinding op hetzelfde onderwerp', es2 !== es && es2.url === es.url);
  es2.open();
  await stap();
  // stoppen: telefoon hoort dat het voorbij is
  const kamer = t.kamer;
  t.stop();
  check('stoppen: "weg" naar de telefoon, verbinding dicht', posts.at(-1).onderwerp === 'sc-' + kamer + '-t' &&
    JSON.parse(posts.at(-1).tekst).fase === 'weg' && es2.readyState === 2 && !t.actief);
  const n2 = posts.length;
  es2.bericht(knopTekst('start'));
  await stap();
  check('na stoppen: niets meer', posts.length === n2);
  t.koppel();
  check('nieuwe code: andere kamer', t.kamer !== kamer && NepBron.alle.at(-1).url.includes(t.kamer));
  t.stop(true);
}

// ---- 5. de QR-code op de muur ----------------------------------------------------
{
  const g = new Game(null);
  g.setAspect(16 / 9);
  g.reset();
  const bron = { bezig: () => false, vraag: () => null, vraagTekst: () => '', knop() {}, bewaarNaam() {}, status() {}, onderbalk: () => 0 };
  const t = new Telefoon(g, bron, { maakBron: (u) => new NepBron(u), post: () => Promise.resolve(200), klok: () => 0 });
  t.koppel();
  let nu = 0;
  t.bijwerken(nu += 16);
  check('muur: zichtbaar buiten een ronde', t.zichtbaar);
  const vak = (x, y, w, h) => ({ poly: [[x, y], [x + w, y], [x + w, y + h], [x, y + h]], pending: false });
  const raakt = (p, o) => {
    const xs = o.poly.map(q => q[0]), ys = o.poly.map(q => q[1]);
    return p.x < Math.max(...xs) && p.x + p.s > Math.min(...xs) && p.y < Math.max(...ys) && p.y + p.s > Math.min(...ys);
  };
  t.kiesPlek();
  const eerst = t.plek;
  check('muur: een hoek, groot genoeg (30% van de hoogte)', eerst && eerst.s === 300);
  g.obstacles = [vak(eerst.x + 50, eerst.y + 50, 60, 40)];
  t.kiesPlek();
  check('muur: niet op een voorwerp', t.plek && !raakt(t.plek, g.obstacles[0]));
  g.rangVak = [t.plek.x - 20, t.plek.y, 380, 230];
  check('muur: wijkt voor de ranglijst', t.opRanglijst());
  t.kiesPlek();
  check('... naar een andere hoek', t.plek && !t.opRanglijst());
  g.rangVak = null;
  // voorwerp komt op de code te liggen: na 1,5 s een andere hoek
  t.kiesPlek();
  const hier = t.plek;
  g.obstacles = [vak(hier.x + 100, hier.y + 100, 50, 50)];
  for (let i = 0; i < 60; i++) t.bijwerken(nu += 16);
  check('voorwerp op de code: eerst nog even blijven', t.plek === hier);
  for (let i = 0; i < 60; i++) t.bijwerken(nu += 16);
  check('... na 1,5 s weg (andere hoek bij het tekenen)', t.plek === undefined);
  t.kiesPlek();
  check('... en die hoek is vrij', t.plek && !raakt(t.plek, g.obstacles[0]));
  // elke hoek bezet: geen code op de muur
  g.obstacles = [vak(0, 0, g.W, 480), vak(0, 520, g.W, 480)];
  t.kiesPlek();
  check('elke hoek bezet: niet op de muur', t.plek === null);
  g.obstacles = [];
  g.start(60);
  t.bijwerken(nu += 16);
  check('aftellen: nooit op de muur', !t.zichtbaar);
  for (let i = 0; i < 200; i++) g.update(1 / 60);
  t.bijwerken(nu += 16);
  check('spelen: nooit op de muur', !t.zichtbaar && g.state === 'play');
  g.togglePause();
  t.bijwerken(nu += 16);
  check('pauze: wel', t.zichtbaar);
  t.opMuur = false;
  t.bijwerken(nu += 16);
  check('"Code ook op de muur" uit: niet', !t.zichtbaar);
  t.stop(true);
}

// ---- de camera ziet de QR-code niet als voorwerp ---------------------------------
// Nagebouwd zoals test/extra.mjs: een wazige camera met ruis, een beamer die bovenop de
// muurverlichting licht geeft, en het spel dat zijn eigen beeld voorspelt zoals main.js
// dat doet (klein nagetekend, de code met harde blokjes). Links onderin de muur de code,
// rechts ernaast een briefje dat wél gezien moet worden.
{
  const VW = 420, VH = 240, P = { x0: 40, y0: 30, x1: 400, y1: 215 };
  const W = 1000 * 16 / 9, H = 1000;
  const qr = qrMaak('https://noaquim.github.io/sticky-clash/telefoon.html#' + 'AbCdEfGhIjKlMnOpQrSt');
  const n = qr.grootte + 8, plek = { x: 44, y: H - 44 - 300, s: 300 };
  const toUV = (x, y) => [(x - P.x0) / (P.x1 - P.x0), (y - P.y0) / (P.y1 - P.y0)];
  // licht van de code op spelcoördinaat (wx, wy): 1 wit, 0 zwart, null = geen code
  const codeLicht = (wx, wy) => {
    const i = Math.floor((wx - plek.x) / plek.s * n), j = Math.floor((wy - plek.y) / plek.s * n);
    if (i < 0 || j < 0 || i >= n || j >= n) return null;
    const a = i - 4, b = j - 4;
    return a >= 0 && b >= 0 && a < qr.grootte && b < qr.grootte && qr.donker[b * qr.grootte + a] ? 0 : 1;
  };
  const MUUR = [150, 147, 140], WIT = [92, 92, 88];
  const BRIEFJE = { x: 150, y: 150, w: 24, h: 22, c: [214, 196, 90] };
  function beeld(v, r, fill, metCode, metBriefje) {
    const raw = new Float32Array(VW * VH * 3);
    for (let y = 0; y < VH; y++) for (let x = 0; x < VW; x++) {
      let c = MUUR;
      if (metBriefje && x >= BRIEFJE.x && x < BRIEFJE.x + BRIEFJE.w && y >= BRIEFJE.y && y < BRIEFJE.y + BRIEFJE.h) c = BRIEFJE.c;
      // beamerlicht t.o.v. de muurverlichting: +1 = vol wit erbij, zwart haalt de verlichting weg
      let I = 0;
      if (metCode) {
        const [u, w] = toUV(x, y);
        const l = u >= 0 && w >= 0 && u <= 1 && w <= 1 ? codeLicht(u * W, w * H) : null;
        if (l !== null) I = l ? 1 : -fill / (1 - fill);
      }
      const i = (y * VW + x) * 3;
      for (let k = 0; k < 3; k++) raw[i + k] = c[k] * (1 + WIT[k] * I / MUUR[k]);
    }
    const px = new Uint8ClampedArray(VW * VH * 4), B = 2;
    for (let y = 0; y < VH; y++) for (let x = 0; x < VW; x++) {
      let s0 = 0, s1 = 0, s2 = 0, m = 0;
      for (let dy = -B; dy <= B; dy++) for (let dx = -B; dx <= B; dx++) {
        const j = (Math.min(VH - 1, Math.max(0, y + dy)) * VW + Math.min(VW - 1, Math.max(0, x + dx))) * 3;
        s0 += raw[j]; s1 += raw[j + 1]; s2 += raw[j + 2]; m++;
      }
      const ruis = (r() - 0.5) * 8, o = (y * VW + x) * 4;
      px[o] = s0 / m + ruis; px[o + 1] = s1 / m + ruis; px[o + 2] = s2 / m + ruis; px[o + 3] = 255;
    }
    v.data = px; v.sampleCells();
  }
  // de lichtvoorspelling zoals updateProjectionMask in main.js, 144 hoog, harde blokjes
  const PW = Math.round(144 * W / H), PH = 144;
  function voorspel(v, fill) {
    const luma = new Float32Array(PW * PH), signed = new Float32Array(PW * PH);
    const fl = Math.round(fill * 255), span = Math.max(1, 255 - fl);
    const sc = PH / H, S = plek.s * sc, x0 = Math.round(plek.x * sc), y0 = Math.round(plek.y * sc);
    for (let y = 0; y < PH; y++) for (let x = 0; x < PW; x++) {
      const i = Math.floor((x + 0.5 - x0) / S * n), j = Math.floor((y + 0.5 - y0) / S * n);
      let l = fl;
      if (i >= 0 && j >= 0 && i < n && j < n) {
        const a = i - 4, b = j - 4;
        l = a >= 0 && b >= 0 && a < qr.grootte && b < qr.grootte && qr.donker[b * qr.grootte + a] ? 0 : 255;
      }
      luma[y * PW + x] = Math.abs(l - fl); signed[y * PW + x] = Math.max(0, l - fl) / span;
    }
    v.setProjection(luma, PW, PH, toUV, signed);
  }
  // waar de code in het camerabeeld valt
  const cx0 = P.x0 + plek.x / W * (P.x1 - P.x0), cx1 = P.x0 + (plek.x + plek.s) / W * (P.x1 - P.x0);
  const cy0 = P.y0 + plek.y / H * (P.y1 - P.y0), cy1 = P.y0 + (plek.y + plek.s) / H * (P.y1 - P.y0);
  function proef(fill, metVoorspelling) {
    const r = rng(7), v = makeVision(VW, VH);
    v.insideFn = (x, y) => { const [u, w] = toUV(x, y); return u >= 0 && w >= 0 && u <= 1 && w <= 1; };
    // muur leren zoals main.js: eerst even vol wit (lichtmodel), dan onder de muurverlichting
    v.beginResponse();
    for (let i = 0; i < 6; i++) {
      beeld(v, r, fill, false, false);
      // vol wit over het hele beamervlak
      for (let k = 0; k < v.data.length; k += 4) {
        const x = (k / 4) % VW, y = Math.floor(k / 4 / VW);
        if (x >= P.x0 && x < P.x1 && y >= P.y0 && y < P.y1) for (let c = 0; c < 3; c++) v.data[k + c] += WIT[c];
      }
      v.sampleCells(); v.addResponseFrame();
    }
    v.endResponse();
    v.beginBackground();
    for (let i = 0; i < 30; i++) { beeld(v, r, fill, false, false); v.addBackgroundFrame(); }
    v.endBackground();
    let spook = 0, cellen = 0, briefje = 0;
    for (let f = 0; f < 40; f++) {
      if (metVoorspelling) voorspel(v, fill); else v.setProjection(null, 0, 0, null);
      beeld(v, r, fill, true, true);
      const tr = v.detect(1 / 30);
      if (f < 20) continue;
      if (tr.some(q => q.cx > cx0 - 6 && q.cx < cx1 + 6 && q.cy > cy0 - 6 && q.cy < cy1 + 6)) spook++;
      if (tr.some(q => Math.abs(q.cx - (BRIEFJE.x + 12)) < 8 && Math.abs(q.cy - (BRIEFJE.y + 11)) < 8)) briefje++;
      for (let cy = 0; cy < v.rows; cy++) for (let cx = 0; cx < v.cols; cx++) {
        const x = (cx + 0.5) * v.cell, y = (cy + 0.5) * v.cell;
        if (v.mask[cy * v.cols + cx] && x > cx0 && x < cx1 && y > cy0 && y < cy1) cellen++;
      }
    }
    return { spook, cellen, briefje };
  }
  for (const fill of [0, 0.25]) {
    const a = proef(fill, true);
    check('QR op de muur, muurverlichting ' + Math.round(fill * 100) + '%: geen spookvoorwerp', a.spook === 0,
      '(' + a.spook + '/20 beelden, ' + a.cellen + ' voorgrondcellen)');
    check('... en het briefje ernaast blijft gezien', a.briefje === 20, '(' + a.briefje + '/20)');
  }
  const zonder = proef(0, false);
  check('controle: zonder voorspelling zou de code wel opvallen', zonder.spook > 0 || zonder.cellen > 20,
    '(' + zonder.spook + '/20 beelden, ' + zonder.cellen + ' voorgrondcellen)');
}

klaar();
