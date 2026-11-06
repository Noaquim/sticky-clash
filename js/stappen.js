// Klaarzetten, stap voor stap (Muur + beamer). Een groot kaartje met één stap per keer: wat je
// moet doen, een tekeningetje, en een controle die vanzelf groen wordt als het gelukt is. Zo weet
// je bij elke stap dat het werkte, in plaats van één lange automatische rit waarin je pas aan het
// eind hoort wat er misging.
//
// Het echte werk (beamervenster, camera, kalibreren, muur leren, bak zoeken) blijft in main.js;
// die geeft zijn functies mee als haakjes (zie "stap voor stap" in main.js). Wie het gewoon
// gedaan wil hebben: de knop "Alles automatisch" onderin doet alles in één keer, zoals vroeger.
import { t } from './taal.js';

/** De stappen, in volgorde. */
export const KLAAR_STAPPEN = ['beamer', 'venster', 'camera', 'kalibreren', 'muur', 'bak', 'klaar'];

const stSlaap = (ms) => new Promise(r => setTimeout(r, ms));
const stEsc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Staat het hele witte vlak in het camerabeeld, groot genoeg en met een randje eromheen? Uit de
 * helderheid per cel terwijl de beamer wit geeft (geen zwart beeld ertussen: dat zou knipperen
 * terwijl je de camera richt). Dezelfde vlakherkenning als het kalibreren: de drempel van Otsu
 * en alleen het grootste aaneengesloten vlak, zodat een lamp of discobal niet meetelt.
 * otsu en grootste zijn otsuDrempel en grootsteVlak uit main.js.
 * Geeft { code, frac, hoeken } met code: geenbeeld, niets, groot, links, rechts, boven, onder,
 * klein of goed. hoeken: de vier hoeken van het vlak, 0..1 in het camerabeeld.
 */
export function witVlakOordeel(l, cols, rows, otsu, grootste) {
  const n = cols * rows;
  if (!l || !(n >= 16) || l.length < n) return { code: 'geenbeeld' };
  let max = -Infinity, min = Infinity;
  for (let k = 0; k < n; k++) { if (l[k] > max) max = l[k]; if (l[k] < min) min = l[k]; }
  const top = max - min;
  if (!(top >= 30)) return { code: 'niets' };
  const d = new Float32Array(n);
  for (let k = 0; k < n; k++) d[k] = l[k] - min;
  const thr = Math.max(top * 0.35, otsu(d, top));
  const vlak = grootste(d, thr, cols, rows);
  let som = 0, alles = 0;
  for (let k = 0; k < n; k++) alles += d[k];
  let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
  let tl = null, tr = null, br = null, bl = null, tlV = Infinity, trV = -Infinity, brV = -Infinity, blV = Infinity;
  for (const k of vlak) {
    const x = k % cols, y = (k - x) / cols;
    som += d[k];
    if (x < bx0) bx0 = x; if (x > bx1) bx1 = x;
    if (y < by0) by0 = y; if (y > by1) by1 = y;
    const s = x + y, v = x - y;
    if (s < tlV) { tlV = s; tl = [x, y]; }
    if (s > brV) { brV = s; br = [x, y]; }
    if (v > trV) { trV = v; tr = [x, y]; }
    if (v < blV) { blV = v; bl = [x, y]; }
  }
  const frac = vlak.length / n;
  const binnen = vlak.length ? som / vlak.length : 0;
  const buiten = n > vlak.length ? (alles - som) / (n - vlak.length) : 0;
  // Te weinig verschil tussen het vlak en de rest: dan is het geen beamerbeeld maar ruis of een lamp.
  if (vlak.length < n * 0.01 || binnen - buiten < 25) return { code: 'niets', frac };
  const hoeken = [tl, tr, br, bl].map(p => [(p[0] + 0.5) / cols, (p[1] + 0.5) / rows]);
  const uit = { frac, hoeken };
  // Raakt het vlak de rand van het camerabeeld, dan valt er (waarschijnlijk) een stuk buiten.
  const links = bx0 < 1, rechts = bx1 > cols - 2, boven = by0 < 1, onder = by1 > rows - 2;
  if ((links && rechts) || (boven && onder) || frac > 0.85) uit.code = 'groot';
  else if (links) uit.code = 'links';
  else if (rechts) uit.code = 'rechts';
  else if (boven) uit.code = 'boven';
  else if (onder) uit.code = 'onder';
  else if (frac < 0.12) uit.code = 'klein';
  else uit.code = 'goed';
  return uit;
}

// ---------------------------------------------------------------- tekeningetjes
//
// Dezelfde tekeningen als in uitleg.html (de kleuren staan in css/style.css onder .st-tek).
// Woorden erin gaan door t(), dus na het wisselen van taal opnieuw opgebouwd.

function stTekening(id, besturing) {
  if (id === 'beamer') {
    const kabel = '<svg viewBox="0 0 220 140" aria-hidden="true">' +
      '<rect class="vak" x="14" y="18" width="78" height="54" rx="4"/><rect class="scherm" x="20" y="24" width="66" height="42" rx="2"/>' +
      '<path class="vak" d="M10 74 H104 L112 86 H2 Z"/>' +
      '<path class="kabel" d="M110 80 C 128 80, 124 112, 140 108 S 146 90, 150 88"/><text class="midden" x="112" y="130">HDMI</text>' +
      '<rect class="vak" x="150" y="64" width="64" height="36" rx="6"/><circle class="lens" cx="198" cy="82" r="9"/>' +
      '<line class="l dun" x1="204" y1="60" x2="214" y2="48"/><line class="l dun" x1="190" y1="58" x2="194" y2="44"/><line class="l dun" x1="176" y1="58" x2="174" y2="44"/></svg>';
    if (besturing !== 'windows') return kabel;
    return kabel + '<svg viewBox="0 0 180 136" aria-hidden="true">' +
      '<rect class="toets" x="30" y="4" width="58" height="26" rx="5"/>' +
      '<rect class="lens" x="38" y="10" width="6" height="6"/><rect class="lens" x="45" y="10" width="6" height="6"/>' +
      '<rect class="lens" x="38" y="17" width="6" height="6"/><rect class="lens" x="45" y="17" width="6" height="6"/>' +
      '<text x="56" y="23">Win</text><text class="midden" x="99" y="23">+</text>' +
      '<rect class="toets" x="110" y="4" width="30" height="26" rx="5"/><text class="midden vet" x="125" y="23">P</text>' +
      '<rect class="menu" x="2" y="38" width="176" height="96" rx="7"/><rect class="keus" x="6" y="88" width="168" height="22" rx="4"/>' +
      '<text class="menutekst" x="13" y="58">' + stEsc(t('Alleen pc-scherm')) + '</text>' +
      '<text class="menutekst" x="13" y="81">' + stEsc(t('Dupliceren')) + '</text>' +
      '<text class="menutekst vet" x="13" y="104">' + stEsc(t('Uitbreiden')) + '</text>' +
      '<text class="menutekst" x="13" y="127">' + stEsc(t('Alleen tweede scherm')) + '</text>' +
      '<path class="l" d="M148 99 l5 5 l11 -12"/></svg>';
  }
  if (id === 'venster') {
    // het venster gaat van de laptop naar de muur, en wordt daar volledig scherm
    return '<svg viewBox="0 0 300 140" aria-hidden="true">' +
      '<rect class="vak" x="8" y="40" width="96" height="64" rx="4"/><rect class="scherm" x="14" y="46" width="84" height="52" rx="2"/>' +
      '<path class="vak" d="M2 106 H110 L118 118 H-6 Z" transform="translate(4 0)"/>' +
      '<rect class="beeld" x="54" y="54" width="38" height="24" rx="2"/>' +
      '<rect class="muur" x="150" y="6" width="144" height="122" rx="6"/>' +
      '<rect class="beeld" x="160" y="16" width="124" height="86" rx="2"/>' +
      '<path class="baan" d="M96 58 C 120 30, 140 30, 170 40"/><path class="l" d="M162 34 L171 40 L162 46"/>' +
      '<rect class="toets" x="206" y="104" width="30" height="22" rx="5"/><text class="midden vet" x="221" y="120">F</text></svg>';
  }
  if (id === 'camera') {
    return '<svg viewBox="0 0 220 160" aria-hidden="true">' +
      '<rect class="muur" x="4" y="4" width="212" height="152" rx="10"/><rect class="wit" x="34" y="26" width="152" height="100" rx="2"/>' +
      '<rect class="gids" x="16" y="14" width="188" height="132" rx="4"/>' +
      '<path class="vink" d="M88 76 L104 92 L134 60"/><rect class="kader" x="4" y="4" width="212" height="152" rx="10"/></svg>';
  }
  if (id === 'kalibreren') {
    return '<svg viewBox="0 0 120 80" aria-hidden="true"><rect class="muur" width="120" height="80" rx="5"/>' +
      '<rect class="wit" x="9" y="7" width="102" height="66" rx="1"/>' +
      '<circle class="stip" cx="28" cy="21" r="5"/><circle class="stip" cx="92" cy="21" r="5"/>' +
      '<circle class="stip" cx="28" cy="59" r="5"/><circle class="stip" cx="92" cy="59" r="5"/></svg>';
  }
  if (id === 'muur') {
    return '<svg viewBox="0 0 120 80" aria-hidden="true"><rect class="muur" width="120" height="80" rx="5"/>' +
      '<rect class="beeld" x="9" y="7" width="102" height="66" rx="1"/>' +
      '<rect class="briefje geel" x="24" y="20" width="14" height="14" transform="rotate(-12 31 27)"/>' +
      '<circle class="l" cx="88" cy="28" r="5"/>' +
      '<path class="l" d="M88 33 V50 M88 50 L82 63 M88 50 L95 62 M88 39 L80 45 M88 39 L97 43"/>' +
      '<path class="l" d="M98 22 H110 M105 17 L110 22 L105 27"/></svg>';
  }
  if (id === 'bak') {
    return '<svg viewBox="0 0 120 80" aria-hidden="true"><rect class="muur" width="120" height="80" rx="5"/>' +
      '<rect class="beeld" x="9" y="7" width="102" height="66" rx="1"/>' +
      '<path class="l" d="M60 14 V36 M52 29 L60 37 L68 29"/>' +
      '<path class="vak" d="M45 46 H75 L71 78 H49 Z"/><ellipse class="vak" cx="60" cy="46" rx="15" ry="3"/></svg>';
  }
  return '<svg viewBox="0 0 120 80" aria-hidden="true"><rect class="muur" width="120" height="80" rx="5"/>' +
    '<rect class="beeld" x="9" y="7" width="102" height="66" rx="1"/>' +
    '<path class="vink" d="M40 41 L54 55 L82 25"/></svg>';
}

// ---------------------------------------------------------------- het kaartje

export class StapVoorStap {
  /**
   * h: de haakjes uit main.js. vak: het lege <div id="stappen">. De rest: app, vision, status,
   * laatsteStatus, projOk, openProjector, projectorScreen, zoekBeamer, startCamera, runExclusive,
   * volBeeld, mediaanBeeld, otsuDrempel, grootsteVlak, kalibratieKlopt, autoCalibrate,
   * autoLight, learnWall, findBin, autoSetup, sleepTip, naKlaar, startRonde, schermenHerkennen
   * en besturing.
   */
  constructor(h) {
    this.h = h;
    this.vak = h.vak;
    this.open = false;
    this.i = 0;
    this.stand = {};          // per stap: '' (nog niet), 'bezig', 'goed' of 'fout'
    this.melding = {};        // per stap: { nl, vars } van de melding na afloop (opnieuw te vertalen)
    this.handmatig = {};      // per stap: zelf bevestigd ("staat al op de beamer")
    this.oordeel = null;      // camera richten: het laatste oordeel van witVlakOordeel
    this.goedAchter = 0;      // zoveel goede oordelen achter elkaar
    this.voortgang = 0;       // kalibreren, 0..1
    this.lus = null;          // de lus van camera richten (een belofte), of null
    this.lusAan = false;
    this.wissel = false;
    this.mijnWiz = null;      // de aanwijzing op de muur die dit kaartje zelf zette
    this.tekSleutel = '';
    this.camCv = document.createElement('canvas');
    this.camCv.width = 480; this.camCv.height = 360;
    this.camCv.className = 'st-cam';
    this.bouw();
    this.klok = 0;
    document.addEventListener('keydown', (e) => this.toets(e));
  }

  /** Het kaartje zelf, één keer. Daarna verandert render() alleen teksten en standen. */
  bouw() {
    const v = this.vak;
    v.innerHTML = '';
    const maak = (tag, cls, ouder) => { const e = document.createElement(tag); if (cls) e.className = cls; (ouder || kaart).appendChild(e); return e; };
    const kaart = document.createElement('div');
    kaart.className = 'st-kaart';
    v.appendChild(kaart);
    const kop = maak('div', 'st-kop');
    this.elTeller = maak('span', 'st-teller', kop);
    this.elSluit = maak('button', 'st-sluit', kop);
    this.elSluit.type = 'button';
    this.elSluit.textContent = '×';
    this.elSluit.onclick = () => this.sluit();
    this.elStippen = maak('ol', 'st-stippen');
    this.stippen = KLAAR_STAPPEN.map((id, i) => {
      const li = maak('li', '', this.elStippen);
      const b = maak('button', '', li);
      b.type = 'button';
      b.onclick = () => { if (this.magNaar(i)) this.gaNaar(i); };
      return b;
    });
    this.elTitel = maak('h2', 'st-titel');
    this.elTitel.id = 'stTitel';
    v.setAttribute('aria-labelledby', 'stTitel');
    this.elDoe = maak('p', 'st-doe');
    this.elTek = maak('div', 'st-tek');
    this.elBalk = maak('div', 'st-balk');
    this.elBalkVul = maak('i', '', this.elBalk);
    this.elHints = maak('ul', 'st-hints');
    this.elCheck = maak('div', 'st-check');
    this.elCheck.setAttribute('role', 'status');
    this.elCheck.setAttribute('aria-live', 'polite');
    this.elCheckIcoon = maak('i', '', this.elCheck);
    this.elCheckIcoon.setAttribute('aria-hidden', 'true');
    this.elCheckTekst = maak('span', '', this.elCheck);
    const knoppen = maak('div', 'st-knoppen');
    this.elTerug = maak('button', 'st-terug', knoppen);
    this.elTweede = maak('button', 'st-tweede', knoppen);
    this.elHoofd = maak('button', 'primary big st-hoofd', knoppen);
    for (const b of [this.elTerug, this.elTweede, this.elHoofd]) b.type = 'button';
    this.elTerug.onclick = () => { if (this.model().terug) this.gaNaar(this.i - 1); };
    this.elTweede.onclick = () => { const m = this.model(); if (m.tweede) m.tweede.fn(); };
    this.elHoofd.onclick = () => { const m = this.model(); if (m.hoofd && !m.hoofd.uit) m.hoofd.fn(); };
    const voet = maak('div', 'st-voet');
    this.elAuto = maak('button', 'st-auto', voet);
    this.elAuto.type = 'button';
    this.elAuto.onclick = () => this.allesAutomatisch();
    this.elAutoHint = maak('span', 'hint', voet);
  }

  // ---- openen, sluiten, wisselen

  /** Openen bij stap 1 (of een andere). Wat al klaar is, staat meteen op groen. */
  async openen(i = 0) {
    if (this.open) { this.gaNaar(i); return; }
    this.open = true;
    this.vak.classList.remove('hidden');
    document.body.classList.add('stappen-open');
    this.stand = {}; this.melding = {}; this.handmatig = {};
    this.oordeel = null; this.goedAchter = 0;
    this.i = Math.max(0, Math.min(KLAAR_STAPPEN.length - 1, i));
    clearInterval(this.klok);
    this.klok = setInterval(() => this.tik(), 250);
    this.betreed();
    this.render();
    this.elHoofd.focus();
  }

  async sluit() {
    if (!this.open) return;
    // Iets bezig (kalibreren, de muur leren)? Dan dat netjes afbreken.
    if (this.h.app.busy && !this.lusAan) this.h.app.abort = true;
    this.open = false;
    clearInterval(this.klok);
    this.vak.classList.add('hidden');
    document.body.classList.remove('stappen-open');
    await this.stopLus();
    this.wisWiz();
  }

  /** Mag je met een stipje naar die stap springen? Terug altijd, vooruit alleen naar wat al gedaan is. */
  magNaar(i) {
    if (this.bezig() || i === this.i) return false;
    if (i < this.i) return true;
    for (let k = this.i; k < i; k++) if (this.stand[KLAAR_STAPPEN[k]] !== 'goed' && !this.klaarVoorVolgende(k)) return false;
    return true;
  }

  async gaNaar(i) {
    if (this.wissel || i < 0 || i >= KLAAR_STAPPEN.length) return;
    this.wissel = true;
    try {
      await this.stopLus();
      this.wisWiz();
      this.i = i;
      this.betreed();
    } finally {
      this.wissel = false;
      this.render();
      if (this.open) this.elHoofd.focus();
    }
  }

  /** Wat er vanzelf begint als je bij een stap komt. */
  betreed() {
    const id = KLAAR_STAPPEN[this.i], h = this.h;
    if (id === 'camera') this.startLus();
    else if (id === 'kalibreren' && this.stand.kalibreren !== 'goed' && h.projOk()) this.kalibreer();
    else if (id === 'muur' && h.vision.mode === 'object' && this.stand.muur !== 'goed' && h.app.H) this.leerMuur();
    else if (id === 'klaar') h.naKlaar();
  }

  /** "Alles automatisch": het kaartje dicht en alles in één keer (zie autoSetup in main.js). */
  async allesAutomatisch() {
    const h = this.h;
    // Het beamervenster moet binnen deze klik open: dan niet eerst wachten.
    if (!h.projOk()) { this.sluit(); h.autoSetup(); return; }
    await this.sluit();
    h.autoSetup();
  }

  bezig() { return this.h.app.busy && !this.lusAan; }

  wisWiz() {
    if (this.mijnWiz && this.h.app.wiz === this.mijnWiz) this.h.app.wiz = null;
    this.mijnWiz = null;
  }

  zetWiz(title, sub) {
    const app = this.h.app;
    if (app.busy) return;
    if (this.mijnWiz && this.mijnWiz.title === title) return;
    this.mijnWiz = { title, sub };
    app.wiz = this.mijnWiz;
  }

  toets(e) {
    if (!this.open) return;
    if (e.key === 'Escape') { e.preventDefault(); this.sluit(); return; }
    if (e.key !== 'Enter' || e.isComposing) return;
    const doel = e.target;
    // Staat de focus op een andere knop of een keuzelijst, dan doet Enter die.
    if (doel && doel !== this.elHoofd && doel.closest && doel.closest('button, select, input, a, textarea')) return;
    e.preventDefault();
    const m = this.model();
    if (m.hoofd && !m.hoofd.uit) m.hoofd.fn();
  }

  // ---- de taken

  /** Een taak via runExclusive van main.js, met de uitkomst als groen vinkje of een foutmelding. */
  async taak(id, fn) {
    const h = this.h;
    this.stand[id] = 'bezig'; this.melding[id] = null;
    this.render();
    const ok = await h.runExclusive(fn);
    const m = h.laatsteStatus();
    if (!this.melding[id]) this.melding[id] = m ? { nl: m.nl, vars: m.vars } : null;
    this.stand[id] = ok === true ? 'goed' : 'fout';
    this.render();
    return ok === true;
  }

  /**
   * Het beamervenster openen, nog binnen de klik: anders blokkeert de browser de pop-up. Weet de
   * browser al waar de beamer hangt (Chrome en Edge, na toestemming), dan opent het daar meteen.
   */
  openVenster() {
    Promise.resolve(this.h.openProjector(true)).then(() => this.render());
  }

  kalibreer() {
    const h = this.h;
    this.voortgang = 0;
    return this.taak('kalibreren', async () => {
      h.app.kleurOpgegeven = false;
      let ok;
      if (h.app.H && await h.kalibratieKlopt()) {
        ok = true;
        h.status(t('De kalibratie van de vorige keer klopt nog — die hoeft niet opnieuw'), 'ok');
      } else ok = await h.autoCalibrate(false);
      // de melding van het kalibreren zelf, niet die van het muurlicht hierna
      const m = h.laatsteStatus();
      this.melding.kalibreren = m ? { nl: m.nl, vars: m.vars } : null;
      if (!ok || h.app.abort) return false;
      if (h.app.fillAuto) await h.autoLight();
      this.voortgang = 1;
      return !h.app.abort;
    });
  }

  leerMuur() {
    const h = this.h;
    h.app.leerOnrustig = false;
    return this.taak('muur', async () => {
      h.app.goalTrack = null;
      return (await h.learnWall(true)) === true;
    });
  }

  zoekBak() {
    return this.taak('bak', async () => (await this.h.findBin()) === true);
  }

  /** Camera richten: de camera aan, de beamer wit, en steeds opnieuw kijken of het vlak goed in beeld is. */
  startLus() {
    const h = this.h;
    this.oordeel = null; this.goedAchter = 0;
    this.lusAan = true;
    this.lus = h.runExclusive(async () => {
      if (!h.vision.ready) {
        this.stand.camera = 'bezig';
        this.render();
        if (!(await h.startCamera())) {
          this.stand.camera = 'fout';
          const m = h.laatsteStatus();
          this.melding.camera = m ? { nl: m.nl, vars: m.vars } : null;
          return false;
        }
        this.stand.camera = '';
      }
      h.volBeeld();
      while (this.lusAan && this.open && !h.app.abort) {
        if (!h.projOk()) {
          h.app.calPattern = null;
          this.oordeel = { code: 'geenvenster' }; this.goedAchter = 0;
          this.tekenCamera();
          this.render();
          await stSlaap(300);
          continue;
        }
        h.app.calPattern = { kind: 'white' };
        const luma = await h.mediaanBeeld(3);
        if (!this.lusAan) break;
        const o = witVlakOordeel(luma, h.vision.cols, h.vision.rows, h.otsuDrempel, h.grootsteVlak);
        this.goedAchter = o.code === 'goed' ? this.goedAchter + 1 : 0;
        this.oordeel = o;
        this.tekenCamera();
        this.render();
        await stSlaap(200);
      }
      h.app.calPattern = null;
      return true;
    });
  }

  async stopLus() {
    this.lusAan = false;
    if (this.lus) { const l = this.lus; this.lus = null; await l; }
  }

  /** Het camerabeeld in het kaartje, met het gevonden witte vlak en een kader waar het binnen moet blijven. */
  tekenCamera() {
    const cv = this.camCv, c = cv.getContext('2d'), v = this.h.vision.video;
    const W = cv.width, H = cv.height;
    c.fillStyle = '#05070a';
    c.fillRect(0, 0, W, H);
    if (v && v.readyState >= 2 && v.videoWidth) c.drawImage(v, 0, 0, W, H);
    // het kader: hier moet het witte vlak binnen blijven
    c.setLineDash([10, 8]);
    c.strokeStyle = 'rgba(255,255,255,.55)';
    c.lineWidth = 2;
    c.strokeRect(W * 0.04, H * 0.04, W * 0.92, H * 0.92);
    c.setLineDash([]);
    const o = this.oordeel;
    if (o && o.hoeken) {
      c.strokeStyle = o.code === 'goed' ? '#3ddc84' : '#ff8a1e';
      c.lineWidth = 4;
      c.beginPath();
      o.hoeken.forEach((p, k) => { if (k) c.lineTo(p[0] * W, p[1] * H); else c.moveTo(p[0] * W, p[1] * H); });
      c.closePath();
      c.stroke();
    }
  }

  // ---- wat er nu te zien is

  /** Is de stap klaar om door te gaan (ook zonder dat een taak liep)? */
  klaarVoorVolgende(k) {
    const id = KLAAR_STAPPEN[k], h = this.h;
    if (id === 'beamer') return true;
    if (id === 'venster') return h.projOk() && (this.handmatig.venster || this.opBeamer());
    if (id === 'camera') return this.goedAchter >= 2 || this.handmatig.camera;
    if (id === 'muur' || id === 'bak') return h.vision.mode !== 'object' || this.stand[id] === 'goed' || this.handmatig[id];
    return this.stand[id] === 'goed';
  }

  /** Staat het beamervenster op de beamer? Volledig scherm telt ook (dat kan alleen met een klik erin). */
  opBeamer() {
    const h = this.h, w = h.app.proj;
    if (!h.projOk()) return false;
    if (h.app.projFull) return true;
    const scr = h.projectorScreen();
    if (!scr || !w) return false;
    try {
      const x = w.screenX + w.outerWidth / 2, y = w.screenY + w.outerHeight / 2;
      return x >= scr.left && x < scr.left + scr.width && y >= scr.top && y < scr.top + scr.height;
    } catch { return false; }
  }

  /** Alles wat het kaartje nu laat zien, al vertaald. */
  model() {
    const h = this.h, app = h.app, id = KLAAR_STAPPEN[this.i];
    const volgende = { tekst: t('Volgende'), fn: () => this.gaNaar(this.i + 1) };
    const m = { titel: '', doe: '', hints: [], check: null, hoofd: volgende, tweede: null, terug: this.i > 0 && !this.bezig(), balk: null, tek: id };
    const meld = (k) => this.melding[k] ? t(this.melding[k].nl, this.melding[k].vars) : '';
    const bezig = this.stand[id] === 'bezig';

    if (id === 'beamer') {
      m.titel = t('Beamer aansluiten');
      m.doe = t('Sluit de beamer met de HDMI-kabel aan op de laptop en zet hem aan. Zet het tweede scherm op Uitbreiden, niet op Dupliceren.');
      const b = h.besturing;
      if (b === 'windows') m.hints.push(t('Windows: druk op Win+P en kies Uitbreiden.'));
      else if (b === 'mac') m.hints.push(t('Mac: Systeeminstellingen → Beeldschermen → gebruik als uitgebreid beeldscherm.'));
      else if (b === 'chromeos') m.hints.push(t('Chromebook: Instellingen → Beeldschermen → vink Ingebouwd scherm spiegelen uit.'));
      else if (b === 'linux') m.hints.push(t('Linux: Instellingen → Beeldschermen → Samenvoegen.'));
      else m.hints.push(t('Windows: druk op Win+P en kies Uitbreiden.'), t('Mac: Systeeminstellingen → Beeldschermen → gebruik als uitgebreid beeldscherm.'));
      const ext = typeof screen !== 'undefined' && 'isExtended' in screen ? !!screen.isExtended : null;
      if (ext === true) m.check = { soort: 'goed', tekst: t('Tweede scherm gevonden') };
      else if (ext === false) {
        m.check = { soort: 'wacht', tekst: t('Nog maar één scherm gevonden — staat het tweede scherm op Uitbreiden?') };
        m.hoofd = { tekst: t('Toch verder'), fn: volgende.fn };
      } else {
        m.check = { soort: 'vraag', tekst: t('Deze browser kan niet zien of de beamer aangesloten is. Zie je het bureaublad op de muur? Dan is het goed.') };
        m.hoofd = { tekst: t('Ja, de beamer is aangesloten'), fn: volgende.fn };
      }
    } else if (id === 'venster') {
      m.titel = t('Beamervenster op de beamer');
      const open = h.projOk(), goed = open && (this.opBeamer() || this.handmatig.venster);
      if (!open) {
        m.doe = t('Het spel opent een tweede venster: het beamervenster. Dat hoort op de beamer, op volledig scherm.');
        m.check = { soort: '', tekst: t('Het beamervenster is nog niet open') };
        m.hoofd = { tekst: t('Open het beamervenster'), fn: () => this.openVenster() };
      } else if (goed) {
        m.doe = t('Het beamervenster staat op de beamer. Op de muur staat nu: Dit is de beamer.');
        m.check = { soort: 'goed', tekst: app.projFull ? t('Het beamervenster staat op volledig scherm') : t('Het beamervenster staat op de beamer') };
        this.zetWiz('Dit is de beamer', 'kijk op de laptop voor de volgende stap');
      } else {
        m.doe = h.schermenHerkennen
          ? t('Klik op de knop: dan zet de browser het venster zelf op de beamer. Of {tip}.', { tip: h.sleepTip })
          : t('Deze browser zet het venster niet zelf op de beamer: {tip}.', { tip: h.sleepTip });
        m.check = { soort: 'wacht', tekst: t('Het beamervenster is open — zet het nog op de beamer') };
        m.hoofd = h.schermenHerkennen ? { tekst: t('Laat de browser de beamer zoeken'), fn: () => h.zoekBeamer() } : { tekst: t('Volgende'), fn: volgende.fn, uit: true };
        m.tweede = { tekst: t('Hij staat al op de beamer'), fn: () => { this.handmatig.venster = true; this.render(); } };
        this.zetWiz('Sleep dit venster naar de beamer', 'en klik erin voor volledig scherm');
      }
    } else if (id === 'camera') {
      m.titel = t('Camera richten');
      m.doe = t('De beamer geeft nu een wit vlak. Richt de camera zo dat het hele witte vlak in beeld is, met een randje muur eromheen.');
      const o = this.oordeel, st = this.stand.camera;
      m.tek = h.vision.ready ? 'live' : 'camera';
      if (st === 'fout') {
        m.check = { soort: 'fout', tekst: meld('camera') || t('De camera wil niet starten') };
        m.hoofd = { tekst: t('Opnieuw proberen'), fn: () => this.gaNaar(this.i) };
      } else if (st === 'bezig' || !o) {
        m.check = { soort: 'bezig', tekst: h.vision.ready ? t('Wachten op het camerabeeld…') : t('De camera starten… Vraagt de browser het? Klik op Toestaan.') };
        m.hoofd = { tekst: t('Volgende'), fn: volgende.fn, uit: true };
      } else {
        const goed = this.goedAchter >= 2;
        m.check = { soort: goed ? 'goed' : o.code === 'goed' ? 'bezig' : 'wacht', tekst: this.oordeelTekst(o.code) };
        if (!goed) {
          m.hoofd = { tekst: t('Volgende'), fn: volgende.fn, uit: !this.handmatig.camera };
          m.tweede = { tekst: t('Toch verder'), fn: () => { this.handmatig.camera = true; this.gaNaar(this.i + 1); } };
        }
      }
      m.hints.push(t('De camera mag naast de beamer staan, of eronder. Zet hem stevig neer: hij mag straks niet meer bewegen.'));
    } else if (id === 'kalibreren') {
      m.titel = t('Kalibreren');
      m.doe = t('Ga niet voor de beamer staan. Het spel laat een wit vlak en vier stippen zien en meet waar ze in het camerabeeld vallen.');
      const st = this.stand.kalibreren;
      if (!h.projOk() || !h.vision.ready) {
        m.check = { soort: 'fout', tekst: !h.projOk() ? t('Het beamervenster is dicht — ga terug naar stap 2') : t('De camera staat uit — ga terug naar stap 3') };
        m.hoofd = { tekst: t('Terug'), fn: () => this.gaNaar(!h.projOk() ? 1 : 2) };
      } else if (st === 'bezig') {
        m.balk = this.voortgang;
        m.check = { soort: 'bezig', tekst: this.fase() };
        m.hoofd = { tekst: t('Bezig…'), fn: () => {}, uit: true };
        m.tweede = { tekst: t('Stoppen'), fn: () => { app.abort = true; } };
      } else if (st === 'goed') {
        m.balk = 1;
        m.check = { soort: 'goed', tekst: meld('kalibreren') || t('Gekalibreerd') };
      } else if (st === 'fout') {
        m.check = { soort: 'fout', tekst: meld('kalibreren') || t('Kalibratie mislukt.') };
        m.hints.push(t('Doe felle lampen, lichteffecten en de discobal even uit, of draai ze van de muur weg.'),
          t('Zet de camera stil: op een statief, of vastgeplakt.'),
          t('Staat het beamervenster op volledig scherm op de beamer? Anders: terug naar stap 2.'));
        m.hoofd = { tekst: t('Opnieuw proberen'), fn: () => this.kalibreer() };
      } else {
        m.check = { soort: '', tekst: t('Klik op Nu kalibreren als niemand voor de beamer staat') };
        m.hoofd = { tekst: t('Nu kalibreren'), fn: () => this.kalibreer() };
      }
    } else if (id === 'muur') {
      m.titel = t('Muur leren');
      m.doe = t('Ga even uit beeld, met alles wat je vasthoudt. Het spel telt af en leert hoe de lege muur eruitziet.');
      m.hints.push(t('Hangen er al briefjes? Laat maar hangen: die tellen gewoon mee.'));
      const st = this.stand.muur;
      if (h.vision.mode !== 'object') {
        m.check = { soort: 'goed', tekst: t('Niet nodig in de speelmodus Post-its · duel') };
      } else if (st === 'bezig') {
        const n = app.wiz && app.wiz.count;
        m.check = { soort: 'bezig', tekst: n ? t('Ga uit beeld… {n}', { n }) : t('Even stil blijven…') };
        m.hoofd = { tekst: t('Bezig…'), fn: () => {}, uit: true };
        m.tweede = { tekst: t('Stoppen'), fn: () => { app.abort = true; } };
      } else if (st === 'goed') {
        m.check = { soort: 'goed', tekst: meld('muur') || t('Muur geleerd') };
      } else {
        if (st === 'fout') {
          m.check = { soort: 'fout', tekst: app.leerOnrustig ? t('Er bewoog iets in beeld — ga helemaal uit beeld en probeer opnieuw') : meld('muur') || t('De muur leren lukte niet') };
        } else m.check = { soort: '', tekst: t('Klik op Leer de muur als je uit beeld bent') };
        m.hoofd = { tekst: st === 'fout' ? t('Opnieuw proberen') : t('Leer de muur'), fn: () => this.leerMuur() };
      }
    } else if (id === 'bak') {
      m.titel = t('Bak neerzetten');
      m.doe = t('Zet de bak onder het beeld, met de opening in het beeld. Klik dan op Zoek de bak en ga zelf uit beeld.');
      m.hints.push(t('Geen bak? Dan speel je met de getekende bak op de muur. Die kun je in het speelveld rechts verslepen.'));
      const st = this.stand.bak;
      if (h.vision.mode !== 'object') {
        m.check = { soort: 'goed', tekst: t('Niet nodig in de speelmodus Post-its · duel') };
      } else if (st === 'bezig') {
        const n = app.wiz && app.wiz.count;
        m.check = { soort: 'bezig', tekst: n ? t('Zet de bak neer en ga uit beeld… {n}', { n }) : t('Zoeken…') };
        m.hoofd = { tekst: t('Bezig…'), fn: () => {}, uit: true };
        m.tweede = { tekst: t('Stoppen'), fn: () => { app.abort = true; } };
      } else if (st === 'goed' || this.handmatig.bak) {
        m.check = { soort: 'goed', tekst: st === 'goed' ? meld('bak') || t('Doel gevonden — verplaats de bak gerust tijdens het spel')
          : t('Je speelt met de getekende bak — sleep hem in het speelveld rechts naar een fijne plek') };
      } else {
        m.check = st === 'fout' ? { soort: 'fout', tekst: t('Geen bak gevonden — zet hem iets anders neer en probeer opnieuw, of speel zonder bak') }
          : { soort: '', tekst: t('Klik op Zoek de bak als hij staat') };
        m.hoofd = { tekst: st === 'fout' ? t('Opnieuw zoeken') : t('Zoek de bak'), fn: () => this.zoekBak() };
        m.tweede = { tekst: t('Zonder bak spelen'), fn: () => { this.handmatig.bak = true; this.render(); } };
      }
    } else {
      m.titel = t('Klaar!');
      m.doe = t('Alles staat klaar. Plak briefjes op de muur en start de ronde.');
      if (app.elkeMinuut) m.hints.push(t('Het spel controleert zichzelf elke minuut: verandert het licht of de muur, dan stelt het zich vanzelf bij.'));
      m.check = { soort: 'goed', tekst: t('Alles staat klaar') };
      m.hoofd = { tekst: t('Start ronde'), fn: () => { this.sluit(); h.startRonde(); } };
      m.tweede = { tekst: t('Sluiten'), fn: () => this.sluit() };
    }
    // Volgende alleen als de stap klaar is (of je hem zelf bevestigde).
    if (m.hoofd === volgende && !this.klaarVoorVolgende(this.i)) m.hoofd = { tekst: volgende.tekst, fn: volgende.fn, uit: true };
    if (bezig && m.hoofd === volgende) m.hoofd = { tekst: volgende.tekst, fn: volgende.fn, uit: true };
    return m;
  }

  oordeelTekst(code) {
    if (code === 'geenvenster') return t('Het beamervenster is dicht — ga terug naar stap 2');
    if (code === 'geenbeeld') return t('Wachten op het camerabeeld…');
    if (code === 'niets') return t('De camera ziet het witte vlak niet — richt hem op de muur, of doe het licht wat zachter');
    if (code === 'groot') return t('Te groot: zet de camera verder weg of zoom uit, zodat er een randje muur omheen zit');
    if (code === 'links') return t('Valt links buiten beeld: draai de camera iets naar links');
    if (code === 'rechts') return t('Valt rechts buiten beeld: draai de camera iets naar rechts');
    if (code === 'boven') return t('Valt boven buiten beeld: kantel de camera iets omhoog');
    if (code === 'onder') return t('Valt onder buiten beeld: kantel de camera iets omlaag');
    if (code === 'klein') return t('Te klein: zet de camera dichterbij of zoom in');
    return t('Alles goed: het hele witte vlak is in beeld, met een randje eromheen');
  }

  /** Waar het kalibreren is, uit wat de beamer laat zien. */
  fase() {
    const app = this.h.app, p = app.calPattern;
    let f = this.voortgang, tekst = t('Kalibreren…');
    if (p && p.kind === 'black') { f = Math.max(f, 0.1); tekst = t('Zwart beeld: de camera went eraan'); }
    else if (p && p.kind === 'white') { f = Math.max(f, 0.3); tekst = t('Het witte vlak meten'); }
    else if (p && p.kind === 'marker') { f = Math.max(f, 0.45 + p.i * 0.11); tekst = t('Stip {n} van 4', { n: p.i + 1 }); }
    else if (p && p.kind === 'verify') { f = Math.max(f, 0.9); tekst = t('Controle: een groene rand om het beeld'); }
    else if (p && p.kind === 'fill') { f = Math.max(f, 0.95); tekst = t('Het muurlicht afstellen'); }
    this.voortgang = f;
    return tekst;
  }

  /** Vier keer per seconde: wat vanzelf kan veranderen (een tweede scherm, het beamervenster, het aftellen). */
  tik() {
    if (!this.open) return;
    this.render();
  }

  render() {
    if (!this.open) return;
    const m = this.model(), n = KLAAR_STAPPEN.length;
    this.elTeller.textContent = t('Stap {n} van {m}', { n: this.i + 1, m: n });
    this.elSluit.title = t('Sluiten');
    this.elSluit.setAttribute('aria-label', t('Sluiten'));
    this.stippen.forEach((b, k) => {
      const id = KLAAR_STAPPEN[k];
      const gedaan = k < this.i ? this.stand[id] !== 'fout' : this.stand[id] === 'goed';
      b.className = 'st-stip' + (k === this.i ? ' nu' : gedaan ? ' gedaan' : '');
      b.disabled = !this.magNaar(k) && k !== this.i;
      b.setAttribute('aria-label', t('Stap {n} van {m}', { n: k + 1, m: n }));
      if (k === this.i) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
    });
    if (this.elTitel.textContent !== m.titel) this.elTitel.textContent = m.titel;
    if (this.elDoe.textContent !== m.doe) this.elDoe.textContent = m.doe;
    // het tekeningetje (of het camerabeeld) alleen opnieuw als de stap of de taal verandert
    const sleutel = m.tek + '|' + t('Uitbreiden');
    if (sleutel !== this.tekSleutel) {
      this.tekSleutel = sleutel;
      this.elTek.innerHTML = '';
      if (m.tek === 'live') { this.tekenCamera(); this.elTek.appendChild(this.camCv); }
      else this.elTek.innerHTML = stTekening(m.tek, this.h.besturing);
      this.elTek.className = 'st-tek' + (m.tek === 'live' ? ' live' : '') + (m.tek === 'beamer' && this.h.besturing === 'windows' ? ' twee' : '');
    }
    this.elBalk.classList.toggle('hidden', m.balk == null);
    if (m.balk != null) this.elBalkVul.style.width = Math.round(m.balk * 100) + '%';
    const hints = m.hints.join('\n');
    if (this.elHints.dataset.tekst !== hints) {
      this.elHints.dataset.tekst = hints;
      this.elHints.innerHTML = '';
      for (const s of m.hints) { const li = document.createElement('li'); li.textContent = s; this.elHints.appendChild(li); }
    }
    this.elHints.classList.toggle('hidden', !m.hints.length);
    const c = m.check || { soort: '', tekst: '' };
    this.elCheck.className = 'st-check' + (c.soort ? ' ' + c.soort : '');
    this.elCheckIcoon.textContent = c.soort === 'goed' ? '✓' : c.soort === 'fout' ? '!' : c.soort === 'vraag' ? '?' : '';
    if (this.elCheckTekst.textContent !== c.tekst) this.elCheckTekst.textContent = c.tekst;
    this.elTerug.textContent = t('Terug');
    this.elTerug.disabled = !m.terug;
    this.elTweede.classList.toggle('hidden', !m.tweede);
    if (m.tweede) this.elTweede.textContent = m.tweede.tekst;
    this.elHoofd.textContent = m.hoofd.tekst;
    this.elHoofd.disabled = !!m.hoofd.uit;
    this.elHoofd.classList.toggle('klaar', !m.hoofd.uit && c.soort === 'goed');
    this.elAuto.textContent = t('Alles automatisch');
    this.elAuto.disabled = this.bezig();
    this.elAutoHint.textContent = t('Doet alle stappen in één keer; volg dan de aanwijzingen op de muur.');
  }
}
