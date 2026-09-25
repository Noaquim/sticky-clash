// Bedienen met je telefoon. De laptop maakt een geheime kamercode en laat die als
// QR-code zien, in het paneel en (buiten een ronde) op de muur. De telefoon scant hem,
// opent telefoon.html en stuurt zijn knoppen naar de laptop.
//
// Laptop en telefoon kunnen elkaar niet rechtstreeks bereiken, dus gaan de berichten
// via ntfy.sh: gratis, zonder account, en met ?cache=no&firebase=no achter het adres
// bewaart die niets. Twee onderwerpen per kamer: sc-<kamer>-l (naar de laptop) en
// sc-<kamer>-t (naar de telefoon). ntfy.sh laat zonder account maar weinig berichten
// door (zo'n 60 achter elkaar, daarna één per 5 seconden, en 250 per dag), dus:
//   - de telefoon stuurt alleen iets als je op een knop drukt;
//   - de laptop alleen als de stand van het spel verandert (starten, pauze, afgelopen,
//     naam gevraagd, en als antwoord op "hallo"), hooguit één keer per seconde, en dan
//     altijd de nieuwste stand. De resterende tijd gaat mee; die telt de telefoon zelf af.
// Wat binnenkomt wordt streng gecontroleerd: alleen bekende knoppen, korte berichten, en
// een naam komt nooit als code op het scherm.

import { qrMaak, qrTeken } from './qr.js';

// Het doorgeefluik. Eén adres: heb je een eigen ntfy-server, zet die dan hier. (De tests
// zetten hier via sc.telefoon.relay hun eigen nep-server neer.)
export const TELEFOON_RELAY = 'https://ntfy.sh';
// De bedieningspagina. Draait het spel zelf op https (GitHub Pages), dan nemen we
// telefoon.html die daarnaast staat; vanaf localhost of het losse bestand deze.
export const TELEFOON_PAGINA = 'https://noaquim.github.io/sticky-clash/telefoon.html';

const TEL_VERSIE = 1;                  // moet gelijk zijn aan VERSIE in telefoon.html
const TEL_KNOPPEN = ['hallo', 'start', 'pauze', 'verder', 'nieuw', 'naam'];
const TEL_FASEN = ['idle', 'count', 'play', 'paused', 'over'];
const TEL_TUSSEN = 1000;               // ms: hooguit één bericht per seconde naar de telefoon
const TEL_TEGOED = 15;                 // zoveel mogen er vlak na elkaar ...
const TEL_BIJVUL = 5000;               // ... daarna één per 5 s, net als ntfy.sh zelf
const TEL_QR_MUUR = 0.3;               // QR-code op de muur: 30% van de hoogte

/** Nieuwe kamercode: 15 willekeurige bytes (120 bits), als 20 tekens die in een adres passen. */
export function telefoonKamer() {
  const b = new Uint8Array(15);
  crypto.getRandomValues(b);
  let s = '';
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_');
}

/** Het adres in de QR-code. */
export function telefoonLink(kamer, adres) {
  let basis = TELEFOON_PAGINA;
  try {
    if (/^https:/i.test(adres || '')) basis = new URL('telefoon.html', adres).href;
  } catch { /* dan de vaste */ }
  return basis + '#' + kamer;
}

/**
 * Een naam van de telefoon netjes maken: geen onzichtbare of stuurtekens (die kunnen de
 * leesrichting omdraaien), spaties samenvoegen, hooguit 16 tekens. null = geen tekst.
 */
export function telefoonNaam(ruw) {
  if (typeof ruw !== 'string' || ruw.length > 64) return null;
  const schoon = ruw.replace(/[\p{Cc}\p{Cf}\p{Co}\p{Cn}\p{Cs}]/gu, '').replace(/\s+/g, ' ').trim();
  let uit = '';
  for (const t of schoon) {                        // per teken, zodat een emoji heel blijft
    if (uit.length + t.length > 16) break;
    uit += t;
  }
  return uit;
}

/** Een ntfy-gebeurtenis uitpakken. Alleen gewone berichten; 'open' en 'keepalive' niet. */
export function telefoonLeesNtfy(data) {
  if (typeof data !== 'string' || data.length > 4000) return null;
  let e;
  try { e = JSON.parse(data); } catch { return null; }
  if (!e || typeof e !== 'object' || e.event !== 'message' || typeof e.message !== 'string') return null;
  return e.message;
}

/** Een knop van de telefoon controleren. Geeft { wat, van, naam, vraag } of null. */
export function telefoonLeesKnop(tekst) {
  if (typeof tekst !== 'string' || tekst.length > 300) return null;
  let m;
  try { m = JSON.parse(tekst); } catch { return null; }
  if (!m || typeof m !== 'object' || Array.isArray(m)) return null;
  if (m.v !== TEL_VERSIE || m.soort !== 'knop' || !TEL_KNOPPEN.includes(m.wat)) return null;
  const uit = { wat: m.wat, van: '', naam: '', vraag: 0 };
  if (m.van !== undefined) {
    if (typeof m.van !== 'string' || !/^[A-Za-z0-9_-]{4,24}$/.test(m.van)) return null;
    uit.van = m.van;
  }
  if (m.wat === 'naam') {
    const naam = telefoonNaam(m.naam);
    if (naam === null || !Number.isInteger(m.vraag) || m.vraag < 1 || m.vraag > 1e9) return null;
    uit.naam = naam; uit.vraag = m.vraag;
  }
  return uit;
}

/** De stand van het spel zoals de telefoon hem krijgt. */
export function telefoonStand(game, bezig, vraag, vraagTekst, melding) {
  const fase = TEL_FASEN.includes(game.state) ? game.state : 'idle';
  const tiende = (x) => Math.round(Math.max(0, Number(x) || 0) * 10) / 10;
  return {
    v: TEL_VERSIE, soort: 'stand', fase, bezig: !!bezig,
    tijd: tiende(game.time),
    telOp: !!game.endless && !game.ownSettings,     // een level telt altijd af
    aftel: fase === 'count' ? tiende(game.countdown) : 0,
    score: game.score.attack | 0,
    tegen: game.duel ? game.score.block | 0 : 0,
    duel: !!game.duel,
    level: game.level | 0,
    vraag: vraag | 0,
    vraagTekst: vraag ? String(vraagTekst || '').slice(0, 120) : '',
    melding: String(melding || '').slice(0, 120),
  };
}

/**
 * Versturen via ntfy.sh. Geeft de HTTP-status, of 0 als er geen verbinding was.
 *
 * De opties staan in het adres en niet in kopjes: dan is het een eenvoudig verzoek,
 * zonder vooraf-vraag (die telt bij ntfy.sh ook mee), en kan het afscheid als baken.
 */
export function telefoonPost(relay, onderwerp, tekst, keepalive = false) {
  const adres = relay + '/' + onderwerp + '?cache=no&firebase=no';   // niet bewaren, niet doorsturen
  try {
    // Afscheid als de pagina dichtgaat: een baken komt ook aan als de app met een
    // service worker draait; een fetch met keepalive bleef dan hangen.
    if (keepalive && typeof navigator !== 'undefined' && navigator.sendBeacon) {
      return Promise.resolve(navigator.sendBeacon(adres, tekst) ? 200 : 0);
    }
    return fetch(adres, {
      method: 'POST', body: tekst, keepalive,
      cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer',
    }).then(r => r.status, () => 0);
  } catch { return Promise.resolve(0); }
}

/**
 * Stuurt berichten naar de telefoon, zuinig: hooguit één per seconde, een emmertje van
 * 15 dat met één per 5 s bijvult, en na een fout steeds wat langer wachten. Het bericht
 * wordt pas op het moment van versturen gemaakt: wat tussendoor veranderde gaat in één
 * keer mee (de laatste wint).
 */
export class TelefoonZender {
  constructor(post, klok) {
    this.post = post;                   // (tekst) => Promise<status>
    this.klok = klok;
    this.maak = null;                   // () => tekst
    this.vuil = false;
    this.onderweg = false;
    this.volgende = 0;                  // niet eerder versturen dan dit
    this.tegoed = TEL_TEGOED;
    this.bijgevuld = klok();
    this.fouten = 0;
    this.status = 'ok';                 // ok | druk (429) | fout (geen verbinding)
    this.verstuurd = 0;
  }

  vraag() { this.vuil = true; }

  tik(nu) {
    if (this.tegoed >= TEL_TEGOED) this.bijgevuld = nu;
    else if (nu - this.bijgevuld >= TEL_BIJVUL) {
      const erbij = Math.floor((nu - this.bijgevuld) / TEL_BIJVUL);
      this.tegoed = Math.min(TEL_TEGOED, this.tegoed + erbij);
      this.bijgevuld += erbij * TEL_BIJVUL;
    }
    if (!this.vuil || this.onderweg || nu < this.volgende || this.tegoed < 1 || !this.maak) return false;
    this.vuil = false; this.onderweg = true; this.tegoed--;
    this.volgende = nu + TEL_TUSSEN;
    this.verstuurd++;
    let p;
    try { p = Promise.resolve(this.post(this.maak())); } catch { p = Promise.resolve(0); }
    p.then(st => this.klaar(st), () => this.klaar(0));
    return true;
  }

  klaar(st) {
    this.onderweg = false;
    if (st >= 200 && st < 300) { this.fouten = 0; this.status = 'ok'; return; }
    // Opnieuw, straks, met wat dan de nieuwste stand is. Bij "te veel" (429) langer wachten.
    this.fouten++;
    this.vuil = true;
    const druk = st === 429;
    const wacht = Math.min(60000, (druk ? 10000 : 2000) * 2 ** Math.min(5, this.fouten - 1));
    this.volgende = Math.max(this.volgende, this.klok() + wacht);
    this.status = druk ? 'druk' : 'fout';
  }
}

/**
 * De koppeling zelf. `bron` is wat main.js ervoor openzet: bezig(), vraag() (de score die
 * op een naam wacht), vraagTekst(), knop(id), bewaarNaam(naam), status(tekst, soort),
 * gebaar() en onderbalk().
 */
export class Telefoon {
  constructor(game, bron, opt = {}) {
    this.game = game;
    this.bron = bron;
    this.relay = TELEFOON_RELAY;
    this.maakBron = opt.maakBron || ((url) => new EventSource(url));
    this.post = opt.post || ((onderwerp, tekst, keepalive) => telefoonPost(this.relay, onderwerp, tekst, keepalive));
    this.klok = opt.klok || (() => performance.now());
    this.actief = false;
    this.kamer = '';
    this.link = '';
    this.qr = null;
    this.es = null;
    this.relais = 'uit';                // uit | verbinden | open | weg
    this.herFouten = 0;
    this.herTimer = 0;
    this.herOver = 0;
    this.telefoons = new Map();         // id -> laatst gehoord
    this.zender = null;
    this.melding = '';
    this.vraagObj = null;
    this.vraagNr = 0;
    // laatst doorgegeven stand: per beeld vergelijken zonder iets aan te maken
    this.lFase = ''; this.lBezig = false; this.lVraag = 0; this.lLevel = 0; this.lDuel = false;
    this.lEind = false; this.lRust = 0;
    this.lZend = 'ok'; this.lToon = 0; this.lNu = 0;
    // op de muur
    this.opMuur = true;
    this.zichtbaar = false;
    this.plek = undefined;              // { x, y, s } in spelcoördinaten; null = geen hoek vrij
    this.plekW = 0;
    this.gekozen = 0;                   // wanneer de plek gekozen is
    this.bots = 0;                      // hoe lang er al een voorwerp op de code ligt
    this.plaatje = null;
    this.el = null;
  }

  // ---- kamer openen en sluiten

  koppel() {
    this.stop(true);
    this.kamer = telefoonKamer();
    this.link = telefoonLink(this.kamer, typeof location !== 'undefined' ? location.href : '');
    this.qr = qrMaak(this.link);
    this.plaatje = null;
    this.actief = true;
    this.telefoons.clear();
    this.melding = '';
    this.vraagObj = null; this.vraagNr = 0; this.lFase = '';
    this.zender = new TelefoonZender((t) => this.post('sc-' + this.kamer + '-t', t), this.klok);
    this.zender.maak = () => this.bericht();
    this.herFouten = 0;
    this.luister();
    this.toonPaneel();
  }

  /** Stoppen. Wist de kamer; een telefoon die nog luistert hoort dat het voorbij is. */
  stop(stil = false) {
    if (this.actief && this.telefoons.size) this.post('sc-' + this.kamer + '-t', this.wegBericht());
    this.actief = false;
    this.sluitBron();
    clearTimeout(this.herTimer);
    this.relais = 'uit';
    this.kamer = ''; this.link = ''; this.qr = null; this.plaatje = null;
    this.telefoons.clear();
    this.zender = null;
    this.zichtbaar = false; this.plek = undefined;
    if (!stil) this.toonPaneel();
  }

  /** Pagina gaat dicht: de telefoon zo mogelijk nog even laten weten dat het voorbij is. */
  afscheid() {
    if (!this.actief || !this.telefoons.size || this.gezegd === this.kamer) return;
    this.gezegd = this.kamer;                        // één keer per kamer, niet bij beide gebeurtenissen
    this.post('sc-' + this.kamer + '-t', this.wegBericht(), true);
  }

  wegBericht() {
    return JSON.stringify({ v: TEL_VERSIE, soort: 'stand', fase: 'weg' });
  }

  // ---- luisteren naar de telefoon

  luister() {
    if (!this.actief) return;
    this.sluitBron();
    this.relais = 'verbinden';
    this.toonStatus();
    let es;
    try { es = this.maakBron(this.relay + '/sc-' + this.kamer + '-l/sse'); }
    catch { this.herverbind(); return; }
    this.es = es;
    // ntfy stuurt zelf ook een 'open'; beide mogen, het is hetzelfde nieuws
    es.onopen = () => {
      if (this.es !== es) return;
      const was = this.relais;
      this.relais = 'open'; this.herFouten = 0;
      // Na een onderbreking kan de telefoon iets gemist hebben: stand opnieuw sturen.
      if (was === 'weg' && this.telefoons.size && this.zender) this.zender.vraag();
      this.toonStatus();
    };
    es.onmessage = (e) => { if (this.es === es) this.ontvang(e.data); };
    es.onerror = () => {
      if (this.es !== es) return;
      if (es.readyState === 2) { es.close(); this.es = null; this.herverbind(); }   // gesloten: zelf opnieuw
      else { this.relais = 'weg'; this.toonStatus(); }                             // de browser probeert het zelf
    };
  }

  sluitBron() {
    if (this.es) { try { this.es.close(); } catch { /* al dicht */ } }
    this.es = null;
  }

  /** Verbinding kwijt en de browser geeft op (bijvoorbeeld bij "te veel"): zelf opnieuw, steeds later. */
  herverbind() {
    this.herFouten++;
    const wacht = Math.min(60000, 5000 * 2 ** Math.min(4, this.herFouten - 1));
    this.relais = 'weg';
    this.herOver = this.klok() + wacht;
    clearTimeout(this.herTimer);
    this.herTimer = setTimeout(() => this.luister(), wacht);
    this.toonStatus();
  }

  ontvang(data) {
    const tekst = telefoonLeesNtfy(data);
    if (tekst === null) return;
    const k = telefoonLeesKnop(tekst);
    if (k) this.voerUit(k);
  }

  /** Een knop van de telefoon: via dezelfde weg als de knoppen in het paneel. */
  voerUit(k) {
    if (!this.actief) return;
    const g = this.game, s = g.state, bezig = !!this.bron.bezig();
    const eerder = this.telefoons.size, id = k.van || '?';
    if (eerder < 8 || this.telefoons.has(id)) this.telefoons.set(id, this.klok());
    if (!eerder) this.bron.status('Telefoon verbonden', 'ok');
    if (this.telefoons.size !== eerder) this.toonStatus();   // ook bij een tweede telefoon
    const nee = (reden) => { this.melding = reden; };
    switch (k.wat) {
      case 'hallo': break;
      case 'start':
        if (bezig) nee('Even wachten: het spel is nog aan het instellen');
        else if (s === 'idle' || s === 'over') this.bron.knop('btnPlay');
        else nee(s === 'count' ? 'De ronde begint al' : 'Er loopt al een ronde');
        break;
      case 'pauze':
        if (s === 'play') this.bron.knop('btnPlay');
        else nee(s === 'paused' ? 'Staat al op pauze' : 'Er loopt geen ronde');
        break;
      case 'verder':
        if (s !== 'paused') nee(s === 'play' ? 'Het spel loopt al' : 'Er is geen pauze');
        else if (bezig) nee('Even wachten: het spel stelt zich opnieuw in');
        else this.bron.knop('btnPlay');
        break;
      case 'nieuw':
        if (bezig) nee('Even wachten: het spel is nog aan het instellen');
        else if (s === 'play' || s === 'count') nee('Zet de ronde eerst op pauze');
        else { this.bron.knop('btnReset'); this.bron.knop('btnPlay'); }
        break;
      case 'naam':
        if (!this.bron.vraag() || k.vraag !== this.vraagNr) nee('Er wordt nu geen naam gevraagd');
        else { this.bron.bewaarNaam(k.naam); this.melding = 'Opgeslagen in de ranglijst'; }
        break;
    }
    // Altijd antwoorden: met de nieuwe stand, of met de reden waarom niet.
    if (this.zender) this.zender.vraag();
  }

  bericht() {
    const m = this.melding;
    this.melding = '';
    const p = this.bron.vraag();
    return JSON.stringify(telefoonStand(this.game, this.bron.bezig(), p ? this.vraagNr : 0, p ? this.bron.vraagTekst() : '', m));
  }

  // ---- elk beeld (uit de hoofdlus van main.js)

  bijwerken(nu) {
    const dt = Math.min(0.1, Math.max(0, (nu - this.lNu) / 1000));
    this.lNu = nu;
    if (!this.actief) return;
    const g = this.game, p = this.bron.vraag();
    if (p !== this.vraagObj) { this.vraagObj = p; if (p) this.vraagNr++; }
    const fase = g.state, bezig = !!this.bron.bezig(), vraag = p ? this.vraagNr : 0;
    // ook bij "geen tijdslimiet" of een andere rondeduur voor de ronde, anders toont de telefoon de oude tijd
    const eind = !!g.endless, rust = fase === 'idle' ? Math.round(g.time) : -1;
    if (fase !== this.lFase || bezig !== this.lBezig || vraag !== this.lVraag || g.level !== this.lLevel || g.duel !== this.lDuel ||
        eind !== this.lEind || rust !== this.lRust) {
      this.lFase = fase; this.lBezig = bezig; this.lVraag = vraag; this.lLevel = g.level; this.lDuel = g.duel;
      this.lEind = eind; this.lRust = rust;
      if (this.telefoons.size) this.zender.vraag();
    }
    this.zender.tik(nu);
    // paneel bijwerken als er iets misgaat of weer goed gaat, en eens per seconde voor de aftelling
    if (this.zender.status !== this.lZend || (this.zender.status !== 'ok' && nu - this.lToon > 1000) ||
        (this.relais === 'weg' && nu - this.lToon > 1000)) {
      this.lZend = this.zender.status; this.lToon = nu;
      this.toonStatus();
    }

    // Op de muur alleen buiten een ronde: nooit tussen de ballen of tijdens het aftellen.
    const zien = this.opMuur && !!this.qr && !bezig && (fase === 'idle' || fase === 'over' || fase === 'paused');
    if (zien !== this.zichtbaar) { this.zichtbaar = zien; this.plek = undefined; this.bots = 0; }
    // Komt er een voorwerp op de code te liggen, dan na anderhalve seconde een andere hoek:
    // licht op een voorwerp maakt het onzichtbaar voor de camera.
    if (this.zichtbaar && this.plek) {
      this.bots = this.opVoorwerp(this.plek.x - 10, this.plek.y - 10, this.plek.x + this.plek.s + 10, this.plek.y + this.plek.s + 10, true)
        ? this.bots + dt : 0;
      if (this.bots > 1.5) { this.plek = undefined; this.bots = 0; }
    }
    // Was er geen hoek vrij, dan eens per seconde opnieuw kijken.
    if (this.zichtbaar && this.plek === null && nu - this.gekozen > 1000) this.plek = undefined;
  }

  // ---- de code op de muur

  /** Tekent de code in dezelfde tekenronde als het spel, dus ook in de lichtvoorspelling. */
  tekenMuur(ctx, w, h) {
    if (!this.zichtbaar || !this.qr) return;
    const g = this.game;
    if (this.plek === undefined || this.plekW !== g.W || this.opRanglijst()) this.kiesPlek();
    if (!this.plek) return;                        // elke hoek bezet: dan alleen in het paneel
    if (!this.plaatje) {
      const n = this.qr.grootte + 8;
      this.plaatje = document.createElement('canvas');
      this.plaatje.width = n; this.plaatje.height = n;
      qrTeken(this.plaatje.getContext('2d'), this.qr, 0, 0, n);
    }
    const sc = h / g.H, S = this.plek.s * sc, n = this.plaatje.width;
    // Hele pixels per blokje: scherp, dat leest een telefoon het best. Maar niet als de
    // code daar veel kleiner van wordt (een kleine beamer): vanaf 4 pixels per blokje
    // mag het ongelijk, liever groot. (0 pixels: de kleine lichtvoorspelling.)
    const k = Math.floor(S / n);
    const maat = k === 0 || (k * n < S * 0.85 && S / n >= 4) ? S : k * n;
    const x = Math.round((w - g.W * sc) / 2 + this.plek.x * sc + (S - maat) / 2);
    const y = Math.round(this.plek.y * sc + (S - maat) / 2);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.plaatje, x, y, maat, maat);
    ctx.restore();
  }

  /** Een hoek kiezen: niet op een voorwerp of de ranglijst, liefst niet op bak, bron of tekst. */
  kiesPlek() {
    const g = this.game, H = g.H, W = g.W, s = Math.round(H * TEL_QR_MUUR), pad = 44;
    const balk = H * (1 - (this.bron.onderbalk ? this.bron.onderbalk() : 0));
    const plekken = [[pad, H - pad - s], [W - pad - s, H - pad - s], [pad, pad + 130], [W - pad - s, pad + 130]];
    const naar = (x, y, cx, cy) => Math.hypot(cx - Math.max(x, Math.min(x + s, cx)), cy - Math.max(y, Math.min(y + s, cy)));
    let beste = null, besteSlecht = Infinity;
    for (const [x, y] of plekken) {
      if (this.opRanglijst(x, y, s)) continue;
      if (this.opVoorwerp(x - 10, y - 10, x + s + 10, y + s + 10, false)) continue;
      let slecht = 0;
      if (naar(x, y, g.goal.x, g.goal.y) < g.goal.r + 30) slecht += 3;
      if (naar(x, y, g.source.x, g.source.y) < 60) slecht += 2;
      if (g.bonusOn && g.state === 'paused' && naar(x, y, g.bonus.x, g.bonus.y) < g.bonus.r + 20) slecht += 2;
      if (y < H / 2 + 110 && y + s > H / 2 - 110) slecht += 2;          // de grote tekst in het midden
      if (y + s > balk) slecht += 3;                                    // waarschuwingsbalk onderin
      if (slecht < besteSlecht) { besteSlecht = slecht; beste = [x, y]; }
      if (!slecht) break;
    }
    this.plek = beste ? { x: beste[0], y: beste[1], s } : null;
    this.plekW = W;
    this.gekozen = this.lNu;
    this.bots = 0;
  }

  /** Overlapt (x, y, s) — of de huidige plek — de ranglijst op de muur? */
  opRanglijst(x, y, s) {
    const r = this.game.rangVak;
    if (!r) return false;
    if (x === undefined) { if (!this.plek) return false; x = this.plek.x; y = this.plek.y; s = this.plek.s; }
    return x < r[0] + r[2] && x + s > r[0] && y < r[1] + r[3] && y + s > r[1];
  }

  /** Ligt er een voorwerp in dit vak? Met alleenEcht tellen twijfelgevallen niet mee. */
  opVoorwerp(x0, y0, x1, y1, alleenEcht) {
    for (const ob of this.game.obstacles) {
      if (alleenEcht && ob.pending) continue;
      const p = ob.poly;
      let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
      for (let i = 0; i < p.length; i++) {
        const q = p[i];
        if (q[0] < a) a = q[0];
        if (q[0] > c) c = q[0];
        if (q[1] < b) b = q[1];
        if (q[1] > d) d = q[1];
      }
      if (a < x1 && c > x0 && b < y1 && d > y0) return true;
    }
    return false;
  }

  // ---- het paneel

  koppelPaneel(doc) {
    const $ = (id) => doc.getElementById(id);
    this.el = {
      knop: $('btnTelefoon'), vak: $('telefoonVak'), qr: $('telefoonQr'), status: $('telefoonStatus'),
      link: $('telefoonLink'), nieuw: $('btnTelefoonNieuw'), stop: $('btnTelefoonStop'), muur: $('telefoonMuur'),
    };
    this.el.knop.onclick = () => { if (this.bron.gebaar) this.bron.gebaar(); this.koppel(); };
    this.el.nieuw.onclick = () => this.koppel();
    this.el.stop.onclick = () => this.stop();
    this.opMuur = this.el.muur.checked;              // de browser zet een vinkje soms terug na verversen
    this.el.muur.onchange = (e) => { this.opMuur = e.target.checked; };
    // Afscheid al bij beforeunload, als de pagina nog helemaal leeft: vanaf pagehide kwam
    // het bericht in Chrome niet altijd aan. pagehide blijft als vangnet (telefoon, tablet).
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => this.afscheid());
      window.addEventListener('pagehide', () => this.afscheid());
    }
    this.toonPaneel();
  }

  toonPaneel() {
    const el = this.el;
    if (!el) return;
    el.knop.classList.toggle('hidden', this.actief);
    el.vak.classList.toggle('hidden', !this.actief);
    if (this.actief && this.qr) {
      // ongeveer 180 pixels breed, met hele pixels per blokje
      const n = this.qr.grootte + 8, k = Math.max(3, Math.round(180 / n));
      el.qr.width = n * k; el.qr.height = n * k;
      el.qr.style.width = el.qr.style.height = n * k + 'px';
      qrTeken(el.qr.getContext('2d'), this.qr, 0, 0, n * k);
      el.link.href = this.link;
      el.link.textContent = this.link;
    }
    this.toonStatus();
  }

  toonStatus() {
    const el = this.el;
    if (!el) return;
    let t = '', goed = false;
    const over = (tot) => Math.max(1, Math.ceil((tot - this.klok()) / 1000)) + ' s';
    if (!this.actief) t = '';
    else if (this.relais === 'verbinden') t = 'Verbinden met ntfy.sh…';
    else if (this.relais === 'weg') {
      t = this.es ? 'Verbinding met ntfy.sh weg — opnieuw verbinden…'
        : 'Geen verbinding met ntfy.sh — opnieuw over ' + over(this.herOver) + '. Heeft de laptop internet?';
    } else if (this.zender && this.zender.status === 'druk') {
      t = 'ntfy.sh vraagt om rustiger aan te doen — volgende poging over ' + over(this.zender.volgende);
    } else if (this.zender && this.zender.status === 'fout') {
      t = 'Bericht naar de telefoon mislukt — opnieuw over ' + over(this.zender.volgende);
    } else if (this.telefoons.size) {
      t = this.telefoons.size === 1 ? 'Telefoon verbonden' : this.telefoons.size + ' telefoons verbonden';
      goed = true;
    } else t = 'Klaar — wacht op je telefoon';
    el.status.textContent = t;
    el.status.className = 'badge' + (goed ? ' ok' : '');
  }
}
