// Herkenning van voorwerpen voor de muur, op twee manieren:
//
//   mode 'object' — achtergrondsubtractie. Leer eenmalig de lege muur; daarna telt
//                   alles wat erbij komt als obstakel. Werkt met elk voorwerp.
//   mode 'color'  — kleurherkenning op post-its, voor het duel oranje tegen blauw.
//
// Alles draait op een grof raster van cellen, dus het blijft snel op een laptop.

export const DEFAULT_CLASSES = [
  { id: 'attack', label: 'Aanvaller',  hue: 26,  hTol: 20, sMin: 0.42, vMin: 0.28, css: '#ff8a1e', minCells: 16 },
  { id: 'block',  label: 'Verdediger', hue: 205, hTol: 26, sMin: 0.38, vMin: 0.20, css: '#3aa0ff', minCells: 16 },
  { id: 'goal',   label: 'Doel',       hue: 125, hTol: 26, sMin: 0.36, vMin: 0.20, css: '#3ddc84', minCells: 8  },
  { id: 'source', label: 'Balbron',    hue: 320, hTol: 22, sMin: 0.34, vMin: 0.22, css: '#ff4fa3', minCells: 8  },
];

function rgb2hsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d > 1e-6) {
    if (mx === r) h = 60 * (((g - b) / d) % 6);
    else if (mx === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
    if (h < 0) h += 360;
  }
  return [h, mx < 1e-6 ? 0 : d / mx, mx];
}

function hueDist(a, b) {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

/**
 * Een lichtzweem wegwerken, gemeten tegen de kleur van de muur op die plek (wr, wg,
 * wb) — zoals de witbalans van een camera. Begrensd: rood mag omlaag en blauw omhoog,
 * niet andersom. Op een koele muur maakte volledig wegdelen een wit kaartje of gele
 * post-it juist oranje (en dus 'huid'); op kurk, hout of karton — zelf huidkleurig —
 * viel een echte hand weg. Een duidelijk gekleurde muur krijgt daarom helemaal geen
 * correctie. Schrijft de kleur in uit en geeft die terug.
 *
 * zacht: niet ineens stoppen bij een gekleurde muur, maar de correctie tussen 0,35 en
 * 0,55 verzadiging geleidelijk laten aflopen. Voor de soort van een briefje (zie
 * noteKindOf): onder een felle gloeilamp op een al warm verlichte muur viel de
 * correctie anders ineens helemaal weg, en werd roze rood en turkoois groen. Kurk
 * (rond 0,55) krijgt nog steeds niets.
 */
function balanceToWall(r, g, b, wr, wg, wb, uit, zacht = false) {
  if (wr > 0 && wg > 0 && wb > 0) {
    const wmax = Math.max(wr, wg, wb), wmin = Math.min(wr, wg, wb), sat = (wmax - wmin) / wmax;
    const k = sat <= 0.35 ? 1 : zacht ? Math.max(0, (0.55 - sat) / 0.2) : 0;
    if (k > 0) {
      const m = (wr + wg + wb) / 3;
      let fr = Math.min(1, Math.max(0.75, m / wr));
      let fg = Math.min(1.1, Math.max(0.9, m / wg));
      let fb = Math.min(1.33, Math.max(1, m / wb));
      if (k < 1) { fr = 1 + k * (fr - 1); fg = 1 + k * (fg - 1); fb = 1 + k * (fb - 1); }
      r *= fr; g *= fg; b *= fb;
    }
  }
  uit[0] = r; uit[1] = g; uit[2] = b;
  return uit;
}

/** Tussen 0 en 255, zoals een camera meet. */
function clampByte(v) {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

/** Tussen -1 en 1, en NaN wordt 0: een kapotte voorspelling mag nooit een cel aanzetten. */
function unitClamp(v) {
  return v > 1 ? 1 : v < -1 ? -1 : v === v ? v : 0;
}

/**
 * Speciale briefjes: rood, groen en blauw krijgen een eigen rol in het spel. Gemeten
 * op de kleur ná de witbalans hierboven, dus tegen de muur en niet tegen de lamp.
 * Alles daartussen — geel, oranje, roze, wit, grijs, zwart, bruin — is een gewoon
 * voorwerp.
 *
 * De eigen kleur moet ook echt licht zijn: kr, kg, kb is hoeveel van die kleur het
 * voorwerp terugkaatst tegen de muur ernaast (1 = even veel), en dat verandert niet
 * met de kleur van de lamp. Bruin is donkeroranje-rood en lag anders precies op de
 * grens met rood; een donkerblauwe trui, spijkerbroek of boekomslag werd anders een
 * blauw briefje.
 */
function noteKindOf(r, g, b, kr, kg, kb) {
  const hsv = rgb2hsv(r, g, b), h = hsv[0], s = hsv[1];
  if ((h >= 340 || h < 15) && s > 0.45 && kr > 0.7) return 'trampoline';
  if (h >= 75 && h <= 165 && s > 0.35 && kg > 0.7) return 'booster';
  if (h >= 190 && h <= 250 && s > 0.35 && kb > 0.7) return 'breek';
  return null;
}

// Andrew's monotone chain.
function convexHull(pts) {
  if (pts.length < 4) return pts.slice();
  const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
    lower.push(q);
  }
  const upper = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
    upper.push(q);
  }
  lower.pop(); upper.pop();
  return lower.concat(upper);
}

// Een vorm wordt beschreven als steunafstanden: voor elke vaste richting de verste
// cel in die richting. Dat zijn altijd precies evenveel getallen, ongeacht hoe grillig
// de vlek is — en daardoor kun je ze van frame tot frame middelen zonder dat de vorm
// springt. Een omhullende met wisselend aantal hoekpunten kan dat niet.
//
// Met 16 richtingen ligt de veelhoek er hooguit 2% naast (1/cos(11,25°) - 1), dus de
// lijn valt strak om het voorwerp.
const NDIR = 16;
const JITTER_N = 24;           // metingen waarover de trilling van een spoor gemeten wordt
const DIRS = [];
for (let k = 0; k < NDIR; k++) {
  const a = (k / NDIR) * Math.PI * 2;
  DIRS.push([Math.cos(a), Math.sin(a)]);
}

/**
 * Steunafstanden van een omhullende, gemeten in een assenstelsel dat met het
 * voorwerp meedraait. Dat meedraaien is cruciaal: bij vaste richtingen snijden de
 * raaklijnen de hoeken van een schuine, langwerpige vorm er veel te ruim omheen.
 */
function supportOf(hull, mx, my, ang, out) {
  const ca = Math.cos(ang), sa = Math.sin(ang);
  for (let k = 0; k < NDIR; k++) out[k] = -Infinity;
  for (let i = 0; i < hull.length; i++) {
    const dx = hull[i][0] - mx, dy = hull[i][1] - my;
    const u = dx * ca + dy * sa, v = -dx * sa + dy * ca;
    for (let k = 0; k < NDIR; k++) {
      const p = u * DIRS[k][0] + v * DIRS[k][1];
      if (p > out[k]) out[k] = p;
    }
  }
  // Van celmiddelpunten naar de rand. Een cel is een vierkantje, geen rondje: in de
  // schuine richting steekt zijn hoek √2 keer zo ver uit als recht opzij, dus de marge
  // volgt de vorm van een vierkant: f·(|cos φ| + |sin φ|). Met dezelfde marge in alle
  // richtingen werden de hoeken van elk voorwerp afgesneden.
  //
  // f = 0,4 en niet 0,5 (een hele halve cel): randcellen die een voorwerp maar half
  // bedekt tellen door de hysterese nu mee, dus de gemeten vlek is al iets ruimer.
  // Gemeten over 45 gevallen (5 maten, 3 hoeken, 3 uitlijningen): gemiddeld +5%.
  for (let k = 0; k < NDIR; k++) {
    const wx = DIRS[k][0] * ca - DIRS[k][1] * sa;        // richting in het beeld
    const wy = DIRS[k][0] * sa + DIRS[k][1] * ca;
    out[k] += 0.4 * (Math.abs(wx) + Math.abs(wy));
  }
  return out;
}

/** Zet de steunafstanden terug om in een convexe veelhoek in camerapixels. */
function polyFromSupport(mx, my, sup, ang, cell) {
  const ca = Math.cos(ang), sa = Math.sin(ang);
  const pts = [];
  for (let k = 0; k < NDIR; k++) {
    const k2 = (k + 1) % NDIR;
    const a = DIRS[k], b = DIRS[k2];
    const det = a[0] * b[1] - a[1] * b[0];
    if (Math.abs(det) < 1e-6) continue;
    const x = (sup[k] * b[1] - a[1] * sup[k2]) / det;
    const y = (a[0] * sup[k2] - sup[k] * b[0]) / det;
    pts.push([(mx + x * ca - y * sa + 0.5) * cell, (my + x * sa + y * ca + 0.5) * cell]);
  }
  return convexHull(pts);
}

/** Ligt (x, y) binnen een convexe veelhoek, ongeacht de draairichting? */
export function inConvex(poly, x, y) {
  let sign = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const c = (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]);
    if (c === 0) continue;
    if (sign === 0) sign = Math.sign(c); else if (Math.sign(c) !== sign) return false;
  }
  return poly.length > 2;
}

function polyArea(h) {
  let a = 0;
  for (let i = 0; i < h.length; i++) {
    const q = h[(i + 1) % h.length];
    a += h[i][0] * q[1] - q[0] * h[i][1];
  }
  return Math.abs(a) / 2;
}

/** Hoek van de langste as, en hoe langwerpig de vorm is (0 = rond, 1 = lijn). */
function principalAxis(pts, mx, my) {
  let xx = 0, yy = 0, xy = 0;
  for (let i = 0; i < pts.length; i++) {
    const dx = pts[i][0] - mx, dy = pts[i][1] - my;
    xx += dx * dx; yy += dy * dy; xy += dx * dy;
  }
  const n = pts.length || 1;
  xx /= n; yy /= n; xy /= n;
  const tr = xx + yy;
  const ecc = tr > 1e-6 ? Math.sqrt((xx - yy) * (xx - yy) + 4 * xy * xy) / tr : 0;
  return [0.5 * Math.atan2(2 * xy, xx - yy), ecc];
}

export class Vision {
  constructor() {
    this.video = document.createElement('video');
    this.video.autoplay = true; this.video.playsInline = true; this.video.muted = true;
    this.cv = document.createElement('canvas');
    this.ctx = this.cv.getContext('2d', { willReadFrequently: true });
    this.vw = 320; this.vh = 240;
    this.cell = 3;
    this.classes = DEFAULT_CLASSES.map(c => ({ ...c }));
    this.mode = 'object';
    this.ready = false;
    this.mirror = false;
    this.tracks = [];
    this.nextId = 1;
    this.maskImage = null;
    this.minCells = 16;
    this.objThresh = 30;
    this.bg = null;
    this.bgAcc = null;
    this.bgN = 0;
    this.projLuma = null;
    this.skinFilter = true;
    this.supTmp = new Float32Array(NDIR);
    this.balTmp = [0, 0, 0];
    this.wobbleMax = 0.115;      // hoeveel de omtrek mag ademen voor het een mens is
    this.fgFraction = 0;         // aandeel voorgrond, om een verlopen muur te merken
    this.tooSmall = 0;           // vlekken die net onder de minimale grootte vielen
    this.roi = null;             // uitsnede van het camerabeeld, in videopixels
    // Een huid- of schaduwkleurige vlek moet vertrouwen verdienen voordat hij meetelt:
    // zo lang (s) stil hangen, hooguit zoveel trillen (px, spreiding van het midden),
    // en geen afgekeurd lichaamsdeel in de buurt (cellen). Zie earnTrust().
    this.stillFor = 1.0;
    this.jitterMax = 0.15;
    this.calmFor = 0.4;          // zo lang (s) achter elkaar onder jitterMax
    this.jitterWindow = 0.8;     // over zo'n stuk tijd (s) wordt de trilling gemeten
    this.personGap = 8;
    this.insideFn = null;        // (x, y) => op het beamervlak? Gezet door main.js.
    // Zoveel metingen achter elkaar moet een nieuwe briefjessoort winnen voordat een
    // spoor van soort wisselt (zie kindVote). Eén bal erover of een half beeld mag
    // een rood briefje niet even 'geen soort' maken.
    this.kindFrames = 8;
    // Hoe de muur oplicht onder vol wit van de beamer (zie endBackground en
    // classifyObject). Alleen geldig voor de muur die erbij geleerd is.
    this.resp = null;
    this.hasResponse = false;
    this.respAcc = null;
    this.respN = 0;
    this.white = null;
    this.whiteFresh = false;
    this.respGain = 1;
    this.respPad = 0.35;         // marge boven de voorspelde band, keer projLuma
    this.respPadDark = 0.1;      // en eronder
    this.quietFactor = 1;        // < 1 bij een stille camera, zie endBackground
    this.quietGap = 4;           // zoveel cellen vrij van al gezien voorwerp, zie acceptQuiet
  }

  /**
   * Huidtint. Handen en armen vallen zo weg, terwijl het voorwerp dat je
   * vasthoudt blijft staan — dat is wat je wil vastpakken en voor de muur houden.
   * Post-its zijn te verzadigd om hieronder te vallen.
   *
   * Gemeten tegen de kleur van de muur op die plek (wr, wg, wb), zoals de witbalans
   * van een camera. Onder warm lamplicht is álles oranjebruin: een zwart of grijs
   * briefje had precies de tint van huid en werd weggegooid. Na het wegdelen van de
   * muurkleur blijft alleen over wat écht roder is dan de muur.
   */
  isSkin(i, wr, wg, wb) {
    if (!(this.cvv[i] > 0.20)) return false;
    const c = balanceToWall(this.cr[i], this.cg[i], this.cb[i], wr, wg, wb, this.balTmp);
    const r = c[0], g = c[1], b = c[2];
    if (!(r > g && g > b)) return false;
    const hsv = rgb2hsv(r, g, b), h = hsv[0], s = hsv[1];
    return s > 0.10 && s < 0.68 && (h < 48 || h > 342);
  }

  async devices() {
    try {
      const list = await navigator.mediaDevices.enumerateDevices();
      return list.filter(d => d.kind === 'videoinput');
    } catch { return []; }
  }

  stop() {
    if (this.stream) this.stream.getTracks().forEach(t => t.stop());
    this.stream = null; this.ready = false;
  }

  async start(deviceId) {
    this.stop();
    // Nieuwe camera: de oude uitsnede en sporen horen bij een ander beeld.
    this.roi = null;
    this.tracks.length = 0; this.lostTracks = [];
    this.lostTracks = [];
    // 'ideal' en niet 'exact': op een andere computer bestaat de opgeslagen camera
    // niet, en dan moet hij gewoon de standaardcamera nemen in plaats van te weigeren.
    const video = deviceId
      ? { deviceId: { ideal: deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }
      : { width: { ideal: 1280 }, height: { ideal: 720 } };
    // Bewust géén vaste beeldsnelheid vragen: in een donkere kamer mag de camera
    // langer belichten (en dus minder beelden per seconde maken). Met 30 beelden per
    // seconde als eis blijft er in het donker een bijna zwart beeld over.
    this.stream = await navigator.mediaDevices.getUserMedia({ video, audio: false });
    this.video.srcObject = this.stream;
    await this.video.play();
    if (!this.video.videoWidth) {
      await new Promise(r => this.video.addEventListener('loadedmetadata', r, { once: true }));
    }
    // Sommige camera's melden eerst een voorlopig formaat en schakelen dan om (gezien:
    // 240×240, daarna 1280×720). Wachten tot het twee keer achter elkaar gelijk is.
    let lastW = -1, lastH = -1;
    for (let i = 0; i < 30; i++) {
      const w = this.video.videoWidth, h = this.video.videoHeight;
      if (w > 0 && w === lastW && h === lastH) break;
      lastW = w; lastH = h;
      await new Promise(r => setTimeout(r, 60));
    }
    // En schakelt hij later alsnog om, dan het raster opnieuw indelen.
    this.video.onresize = () => {
      const ar = this.video.videoWidth / this.video.videoHeight;
      if (!this.ready || !(ar > 0) || this.roi) return;
      if (Math.abs(ar - this.vw / this.vh) > 0.05) {
        this.setRoi(null);
        if (this.onFormatChange) this.onFormatChange();
      }
    };
    const ar = this.video.videoWidth / this.video.videoHeight || 4 / 3;
    this.vh = 240;
    this.vw = Math.round(240 * ar / 4) * 4;
    this.cv.width = this.vw; this.cv.height = this.vh;
    this.allocate();
    this.maskImage = this.ctx.createImageData(this.cols, this.rows);
    this.ready = true;
    const track = this.stream.getVideoTracks()[0];
    return (track && track.label) || 'camera';
  }

  /** Alle werkbuffers voor het huidige celraster. */
  allocate() {
    this.cols = Math.floor(this.vw / this.cell);
    this.rows = Math.floor(this.vh / this.cell);
    const n = this.cols * this.rows;
    this.mask = new Int8Array(n);
    this.seen = new Int32Array(n);
    this.stack = new Int32Array(n);
    this.cr = new Float32Array(n); this.cg = new Float32Array(n); this.cb = new Float32Array(n);
    this.cl = new Float32Array(n); this.ch = new Float32Array(n); this.cs = new Float32Array(n);
    this.cvv = new Float32Array(n);
    this.projLuma = new Float32Array(n);
    this.projPrev = new Float32Array(n);
    this.shadowCell = new Uint8Array(n);
    this.skinCell = new Uint8Array(n);
    this.noise = new Float32Array(n);            // ruis per cel, uit het leren van de muur
    this.gainSample = new Float32Array(Math.ceil(n / 7) + 4);
    this.stepBuf = new Float32Array(2048);
    this.softW = new Float32Array(n);            // zacht gewicht per cel, zie softCentre
    this.prevMask = new Int8Array(n);
    this.lightKept = new Uint8Array(n);
    this.lightKeptAge = new Uint16Array(n);
    this.keptSeen = new Uint8Array(n);
    this.candCell = new Uint8Array(n);           // half duidelijk: mag meegroeien
    this.hystCell = new Uint8Array(n);           // alleen aan door de hysterese
    this.owner = new Int32Array(n);              // welk spoor ligt hier (vorig beeld)
    this.ownersReady = false;
    this.resident = new Uint8Array(n);           // hing er al toen de muur geleerd werd
    this.residentCount = 0;
    this.growLab = new Int32Array(n);
    this.grownCell = new Uint8Array(n);
    this.grayFraction = 0;
    this.floodGuard = false;
    this.bg = null; this.bgAcc = null; this.bgSq = null; this.bgN = 0; this.bgLearned = null;
    this.pass = 0;
    this.gain = 1;
    this.shadowFraction = 0;
    // Eigen licht als voorspelling (zie setProjection): per cel en per kleur de
    // geprojecteerde sterkte, en een band eromheen in plaats en tijd.
    this.projI = new Float32Array(n * 3);
    this.projHi = new Float32Array(n * 3);
    this.projLo = new Float32Array(n * 3);
    this.projBand = new Uint8Array(n);           // valt hier nu (of net) ons licht? zie spreadSigned
    this.projStride = 1;                         // 1 = grijs licht, 3 = r, g, b om en om
    this.projSigned = false;
    // Verwachte muurkleur per cel in dit beeld, en of die meting te vertrouwen is
    // (niet half onder ons eigen licht). Voor de kleur van een briefje, zie blobs().
    this.expR = new Float32Array(n); this.expG = new Float32Array(n); this.expB = new Float32Array(n);
    this.colOk = new Uint8Array(n);
    this.quietList = new Int32Array(n);          // net onder de drempel, zie acceptQuiet
    this.quietOn = new Uint8Array(n);            // aan dankzij de stille camera
    this.quietPrev = new Uint8Array(n);
    this.strongCell = new Uint8Array(n);
    this.clearResponse();
    this.quietFactor = 1;
  }

  /**
   * Hoeveel lager het vaste deel van de drempel mag bij een stille camera (zie
   * endBackground), op een plek met deze lichtfactor (0,3 tot 1, zie classifyObject).
   * Niet in het donker: zit de drempel al op zijn bodem, dan is het beeld zo
   * samengedrukt dat een nog lagere drempel vooral halve randen oppikt. Gemeten: een
   * post-it in een heel donkere kamer viel daar in stukken uiteen. Tussen lichtfactor
   * 0,3 en 0,6 loopt het geleidelijk op tot de volle quietFactor.
   */
  quietAt(licht) {
    const qf = this.quietFactor;
    return qf >= 1 ? 1 : 1 - (1 - qf) * Math.max(0, Math.min(1, (licht - 0.3) / 0.3));
  }

  /** Het lichtmodel van de beamer weggooien: het hoort bij een ander raster of een andere muur. */
  clearResponse() {
    this.resp = null; this.hasResponse = false;
    this.respAcc = null; this.respN = 0; this.white = null; this.whiteFresh = false; this.respGain = 1;
  }

  get hasBackground() { return !!this.bg; }

  /**
   * Belichting en witbalans vastzetten. Staat standaard UIT: op Windows kent de
   * driver alleen belichtingstijden in machten van twee (1/32 s, 1/64 s …), en bij
   * handmatige belichting vervalt ook de automatische versterking. In een donkere
   * kamer gaf dat een bijna zwart beeld. De lichtcorrectie van fitGain() vangt
   * gewone lichtsprongen ook op. Alleen aanzetten als het beeld echt flikkert.
   */
  async lockCamera() {
    const t = this.stream && this.stream.getVideoTracks()[0];
    if (!t || !t.getCapabilities) return [];
    const cap = t.getCapabilities(), set = t.getSettings ? t.getSettings() : {};
    const adv = {};
    if (cap.exposureMode && cap.exposureMode.includes('manual')) {
      adv.exposureMode = 'manual';
      if (set.exposureTime) adv.exposureTime = set.exposureTime;
    }
    if (cap.whiteBalanceMode && cap.whiteBalanceMode.includes('manual')) {
      adv.whiteBalanceMode = 'manual';
      if (set.colorTemperature) adv.colorTemperature = set.colorTemperature;
    }
    if (!Object.keys(adv).length) return [];
    try { await t.applyConstraints({ advanced: [adv] }); } catch { return []; }
    const na = t.getSettings ? t.getSettings() : {};
    const out = [];
    if (na.exposureMode === 'manual') out.push('belichting');
    if (na.whiteBalanceMode === 'manual') out.push('witbalans');
    return out;
  }

  /** Weer automatisch, zodat de camera zich aan een nieuwe situatie kan aanpassen. */
  async unlockCamera() {
    const t = this.stream && this.stream.getVideoTracks()[0];
    if (!t || !t.getCapabilities) return;
    const cap = t.getCapabilities(), adv = {};
    if (cap.exposureMode && cap.exposureMode.includes('continuous')) adv.exposureMode = 'continuous';
    if (cap.whiteBalanceMode && cap.whiteBalanceMode.includes('continuous')) adv.whiteBalanceMode = 'continuous';
    if (!Object.keys(adv).length) return;
    try { await t.applyConstraints({ advanced: [adv] }); } catch { /* dan niet */ }
  }

  /**
   * Snijdt het werkbeeld bij tot het beamervlak. De camera ziet meestal ook plafond,
   * zijmuur en bureau; daar ligt nooit een voorwerp. Door alleen het speelvlak op te
   * meten wordt een post-it twee tot drie keer zo groot in cellen, en dat is precies
   * waar alle drempels op stuk liepen.
   */
  setRoi(roi) {
    this.roi = roi;
    const vidAr = (this.video.videoWidth / this.video.videoHeight) || 4 / 3;
    const ar = roi ? (roi.sw / roi.sh) : vidAr;
    this.vh = 240;
    this.vw = Math.max(this.cell * 60, Math.round(240 * ar / this.cell) * this.cell);
    this.cv.width = this.vw; this.cv.height = this.vh;
    this.allocate();
    if (this.ctx.createImageData) this.maskImage = this.ctx.createImageData(this.cols, this.rows);
    this.tracks.length = 0; this.lostTracks = [];
  }

  /** Werkpixel naar genormaliseerde plek in het volledige camerabeeld. */
  camNorm(x, y) {
    const xe = this.mirror ? this.vw - x : x;
    const r = this.roi;
    if (!r) return [xe / this.vw, y / this.vh];
    const W = this.video.videoWidth || this.vw, H = this.video.videoHeight || this.vh;
    return [(r.sx + xe * r.sw / this.vw) / W, (r.sy + y * r.sh / this.vh) / H];
  }

  /** En terug. */
  camPx(u, v) {
    const r = this.roi;
    let x, y;
    if (!r) { x = u * this.vw; y = v * this.vh; }
    else {
      const W = this.video.videoWidth || this.vw, H = this.video.videoHeight || this.vh;
      x = (u * W - r.sx) * this.vw / r.sw;
      y = (v * H - r.sy) * this.vh / r.sh;
    }
    return [this.mirror ? this.vw - x : x, y];
  }

  grab() {
    if (!this.ready || this.video.readyState < 2) return false;
    const c = this.ctx;
    c.save();
    if (this.mirror) { c.translate(this.vw, 0); c.scale(-1, 1); }
    const r = this.roi;
    if (r) c.drawImage(this.video, r.sx, r.sy, r.sw, r.sh, 0, 0, this.vw, this.vh);
    else c.drawImage(this.video, 0, 0, this.vw, this.vh);
    c.restore();
    this.data = c.getImageData(0, 0, this.vw, this.vh).data;
    this.sampleCells();
    return true;
  }

  sampleCells() {
    const cols = this.cols, rows = this.rows, cell = this.cell, vw = this.vw, data = this.data;
    const o1 = cell >> 2, o2 = cell - 1 - o1;      // twee meetpunten per as, binnen de cel
    for (let cy = 0; cy < rows; cy++) {
      for (let cx = 0; cx < cols; cx++) {
        const idx = cy * cols + cx;
        const x0 = cx * cell, y0 = cy * cell;
        let r = 0, g = 0, b = 0;
        for (let k = 0; k < 4; k++) {
          const sx = x0 + ((k & 1) ? o2 : o1), sy = y0 + ((k >> 1) ? o2 : o1);
          const p = (sy * vw + sx) * 4;
          r += data[p]; g += data[p + 1]; b += data[p + 2];
        }
        r /= 4; g /= 4; b /= 4;
        this.cr[idx] = r; this.cg[idx] = g; this.cb[idx] = b;
        this.cl[idx] = 0.299 * r + 0.587 * g + 0.114 * b;
        const hsv = rgb2hsv(r, g, b);
        this.ch[idx] = hsv[0]; this.cs[idx] = hsv[1]; this.cvv[idx] = hsv[2];
      }
    }
  }

  sampleHsv(x, y) {
    if (!this.data) return null;
    const px = Math.max(0, Math.min(this.vw - 1, Math.round(x)));
    const py = Math.max(0, Math.min(this.vh - 1, Math.round(y)));
    let r = 0, g = 0, b = 0, n = 0;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const sx = px + dx, sy = py + dy;
      if (sx < 0 || sy < 0 || sx >= this.vw || sy >= this.vh) continue;
      const i = (sy * this.vw + sx) * 4;
      r += this.data[i]; g += this.data[i + 1]; b += this.data[i + 2]; n++;
    }
    return rgb2hsv(r / n, g / n, b / n);
  }

  // ---- achtergrond leren ---------------------------------------------------

  beginBackground() {
    const n = this.cols * this.rows;
    // Het witte beeld hoort alleen bij de muur die direct erna geleerd wordt. Werd die
    // afgebroken, dan is het bij de volgende poging oud (zie learnResponse).
    if (!this.whiteFresh) this.white = null;
    this.whiteFresh = false;
    this.bgAcc = new Float32Array(n * 3);
    this.bgSq = new Float32Array(n);
    this.bgN = 0;
  }

  addBackgroundFrame() {
    if (!this.bgAcc) return 0;
    for (let i = 0; i < this.cr.length; i++) {
      this.bgAcc[i * 3] += this.cr[i];
      this.bgAcc[i * 3 + 1] += this.cg[i];
      this.bgAcc[i * 3 + 2] += this.cb[i];
      this.bgSq[i] += this.cl[i] * this.cl[i];
    }
    return ++this.bgN;
  }

  endBackground() {
    if (!this.bgAcc || !this.bgN) return false;
    const n = this.bgN;
    const bg = new Float32Array(this.bgAcc.length);
    for (let i = 0; i < bg.length; i++) bg[i] = this.bgAcc[i] / n;
    // Ruis per cel: een cel op een gladde muur is stil, een cel op een voeg of op
    // een glimmend plekje ruist. Door de drempel daarop mee te laten bewegen hoef
    // je de gevoeligheid niet op het rumoerigste plekje van de hele muur te zetten.
    const raw = new Float32Array(this.noise.length);
    for (let i = 0; i < raw.length; i++) {
      const m = 0.299 * bg[i * 3] + 0.587 * bg[i * 3 + 1] + 0.114 * bg[i * 3 + 2];
      // n-1: met een handvol beelden onderschat je de ruis anders stelselmatig
      const varr = Math.max(0, (this.bgSq[i] - n * m * m) / Math.max(1, n - 1));
      raw[i] = Math.min(24, Math.sqrt(varr));
    }
    // Het grootste van de buren: een cel naast een scherpe rand (stopcontact, lijst)
    // ruist bij het kleinste trillen van de camera, ook als hij tijdens het leren
    // toevallig stil stond. Gemeten: dit haalde alle valse vlekken daar weg.
    const cols = this.cols, rows = this.rows;
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        let m = 0;
        for (let dy = -1; dy <= 1; dy++) {
          const yy = y + dy;
          if (yy < 0 || yy >= rows) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx;
            if (xx < 0 || xx >= cols) continue;
            const v = raw[yy * cols + xx];
            if (v > m) m = v;
          }
        }
        this.noise[y * cols + x] = m;
      }
    }
    // Een stille camera mag gevoeliger: de drempel is er vooral om korrel buiten te
    // houden, en waar weinig korrel is bleven lichtgrijze en kraftbruine briefjes net
    // onder de drempel. Mediaan over het hele beeld, dus een paar rumoerige plekjes
    // (een voeg, iemand die langsliep) trekken hem niet mee.
    const nz = Float32Array.from(this.noise).sort();
    const q = nz.length ? nz[nz.length >> 1] : 6;
    this.quietFactor = 1 - 0.25 * Math.max(0, Math.min(1, (6 - q) / 4));
    this.bg = bg; this.bgLearned = null;
    this.bgAcc = null; this.bgSq = null;
    this.tracks.length = 0; this.lostTracks = [];
    this.resident.fill(0); this.residentCount = 0;
    this.learnResponse();
    return true;
  }

  // ---- hoe de muur oplicht onder de beamer ----------------------------------
  //
  // Zonder dit weet de herkenning alleen wáár we licht projecteren, en zet ze daar de
  // drempel omhoog. Dan verdwijnt juist een donker briefje onder een bal: dat kaatst
  // weinig van ons licht terug en lijkt voor de camera op kale muur. Met dit model
  // voorspellen we per cel hoe de muur er onder ons licht uit hoort te zien (zie
  // classifyObject), en valt een donker briefje daar juist extra op.
  //
  // Volgorde in main.js: beamer vol wit -> beginResponse, een reeks addResponseFrame,
  // endResponse -> beamer terug naar de muurverlichting -> beginBackground ...
  // endBackground. Dat laatste rekent het model uit: wit min muur, per cel en kleur.

  beginResponse() {
    this.respAcc = new Float32Array(this.cols * this.rows * 3);
    this.respN = 0;
    this.white = null;
  }

  addResponseFrame() {
    if (!this.respAcc || this.respAcc.length !== this.cr.length * 3) return 0;
    const a = this.respAcc;
    for (let i = 0; i < this.cr.length; i++) {
      a[i * 3] += this.cr[i]; a[i * 3 + 1] += this.cg[i]; a[i * 3 + 2] += this.cb[i];
    }
    return ++this.respN;
  }

  endResponse() {
    if (!this.respAcc || !this.respN) { this.respAcc = null; return false; }
    const w = this.respAcc, n = this.respN;
    for (let i = 0; i < w.length; i++) w[i] /= n;
    this.white = w; this.whiteFresh = true;
    this.respAcc = null;
    return true;
  }

  /**
   * Wit min muur. Alleen met een wit beeld dat vlak vóór deze muur geleerd is: een
   * oud wit beeld hoort bij ander licht, en dan voorspellen we onzin.
   *
   * De camera past zijn belichting aan als het beeld ineens veel lichter wordt, en
   * dan lijkt het wit minder fel dan het is. Zien we een stuk muur buiten het
   * beamervlak (daar verandert ons licht niets), dan rekenen we dat verschil weg.
   */
  learnResponse() {
    const white = this.white, bg = this.bg;
    this.white = null; this.resp = null; this.hasResponse = false; this.respGain = 1;
    if (!white || !bg || white.length !== bg.length) return false;
    const cols = this.cols, rows = this.rows, cell = this.cell, n = cols * rows;
    if (this.insideFn) {
      const ratios = [];
      const inside = (cx, cy) => this.insideFn((cx + 0.5) * cell, (cy + 0.5) * cell);
      for (let cy = 0; cy < rows; cy += 2) {
        for (let cx = 0; cx < cols; cx += 2) {
          // minstens twee cellen van het beamervlak af: daar valt geen strooilicht
          if (inside(cx, cy) || inside(cx - 2, cy) || inside(cx + 2, cy) || inside(cx, cy - 2) || inside(cx, cy + 2)) continue;
          const i = cy * cols + cx;
          const bl = 0.299 * bg[i * 3] + 0.587 * bg[i * 3 + 1] + 0.114 * bg[i * 3 + 2];
          const wl = 0.299 * white[i * 3] + 0.587 * white[i * 3 + 1] + 0.114 * white[i * 3 + 2];
          if (bl < 16 || wl < 16 || bl > 240 || wl > 240) continue;
          ratios.push(bl / wl);
        }
      }
      if (ratios.length >= 40) {
        ratios.sort((a, b) => a - b);
        this.respGain = Math.max(0.5, Math.min(2, ratios[ratios.length >> 1]));
      }
    }
    const resp = new Float32Array(bg.length), k = this.respGain;
    let lit = 0;
    for (let i = 0; i < n; i++) {
      let l = 0;
      for (let c = 0; c < 3; c++) {
        const d = Math.max(0, white[i * 3 + c] * k - bg[i * 3 + c]);
        resp[i * 3 + c] = d; l += d;
      }
      if (l > 24) lit++;                                  // gemiddeld meer dan 8 per kleur
    }
    // Maakt wit nergens verschil (muurverlichting al op vol, of de beamer stond uit),
    // dan is er niets te voorspellen: dan blijft alles zoals zonder model.
    if (lit < n * 0.05) return false;
    this.resp = resp; this.hasResponse = true;
    return true;
  }

  /**
   * Achtergrond heel langzaam laten meelopen met de kamer, maar nooit onder een
   * herkend voorwerp — anders wordt een post-it die een minuut blijft hangen
   * opgeslokt door de achtergrond en verdwijnt hij uit het spel.
   */
  driftBackground(rate) {
    if (!this.bg) return;
    const bg = this.bg, mask = this.mask;
    for (let i = 0; i < mask.length; i++) {
      if (mask[i]) continue;
      bg[i * 3] += (this.cr[i] - bg[i * 3]) * rate;
      bg[i * 3 + 1] += (this.cg[i] - bg[i * 3 + 1]) * rate;
      bg[i * 3 + 2] += (this.cb[i] - bg[i * 3 + 2]) * rate;
    }
  }

  clearBackground() {
    this.bg = null; this.bgAcc = null; this.bgLearned = null; this.tracks.length = 0; this.lostTracks = [];
    this.resident.fill(0); this.residentCount = 0;
    this.clearResponse();
    this.quietFactor = 1;
  }

  /** Wat er al hing weer gewoon als muur behandelen. */
  dropResident() {
    if (this.bg && this.bgLearned && this.bgLearned.length === this.bg.length) this.bg.set(this.bgLearned);
    this.resident.fill(0); this.residentCount = 0;
    this.tracks.length = 0; this.lostTracks = [];
  }

  /**
   * Voorwerpen die er al hingen toen de muur geleerd werd. Die zitten in de geleerde
   * muur en bleven daardoor onzichtbaar — en iedereen vergeet weleens een briefje
   * eraf te halen voordat hij de muur laat leren.
   *
   * We vergelijken de geleerde muur met een gladde schatting van de kale muur: per
   * blokje van 4×4 cellen de mediaan, en daarvan weer de mediaan over 7×7 blokjes.
   * Een mediaan trekt zich niets aan van een briefje dat een paar blokjes beslaat,
   * maar volgt wel een lamp die de muur links lichter maakt dan rechts. Wat daar
   * duidelijk van afwijkt, klein en massief is en rondom egale muur heeft, is een
   * voorwerp. Op die plek vullen we de geleerde muur in met de schatting; vanaf dan
   * ziet de gewone herkenning het als voorwerp, en haal je het weg, dan is het weg.
   *
   * Posters, lijsten en de rand van het beamerbeeld vallen af: te groot, hol, of
   * zonder egale muur eromheen.
   *
   * @param {(x: number, y: number) => boolean} inside  ligt deze werkpixel op het beamervlak?
   * @returns {number} aantal gevonden voorwerpen
   */
  findResident(inside) {
    const bg = this.bg, res = this.resident;
    res.fill(0); this.residentCount = 0;
    if (!bg) return 0;
    // Altijd uitgaan van de muur zoals hij geleerd is, ook na een eerdere zoekronde.
    if (this.bgLearned && this.bgLearned.length === bg.length) bg.set(this.bgLearned);
    else this.bgLearned = Float32Array.from(bg);
    const cols = this.cols, rows = this.rows, n = cols * rows, cell = this.cell;

    // Op het beamervlak; de kern ligt minstens 2 cellen van de rand ervan af.
    const inn = new Uint8Array(n);
    let nIn = 0;
    for (let cy = 0; cy < rows; cy++) {
      for (let cx = 0; cx < cols; cx++) {
        if (inside((cx + 0.5) * cell, (cy + 0.5) * cell)) { inn[cy * cols + cx] = 1; nIn++; }
      }
    }
    if (nIn < 200) return 0;
    const core = new Uint8Array(n);
    for (let cy = 2; cy < rows - 2; cy++) {
      for (let cx = 2; cx < cols - 2; cx++) {
        let ok = 1;
        for (let dy = -2; dy <= 2 && ok; dy++) {
          for (let dx = -2; dx <= 2; dx++) if (!inn[(cy + dy) * cols + cx + dx]) { ok = 0; break; }
        }
        core[cy * cols + cx] = ok;
      }
    }

    // Gladde muur: mediaan per blok, dan de mediaan over de blokken eromheen.
    const B = 4, R = 3, bc = Math.ceil(cols / B), br = Math.ceil(rows / B);
    const med = (a) => { a.sort((p, q) => p - q); return a[a.length >> 1]; };
    const t0 = [], t1 = [], t2 = [];
    const blk = new Float32Array(bc * br * 3).fill(NaN);
    for (let by = 0; by < br; by++) {
      for (let bx = 0; bx < bc; bx++) {
        t0.length = t1.length = t2.length = 0;
        for (let cy = by * B; cy < Math.min(rows, by * B + B); cy++) {
          for (let cx = bx * B; cx < Math.min(cols, bx * B + B); cx++) {
            const i = cy * cols + cx;
            if (!inn[i]) continue;
            t0.push(bg[i * 3]); t1.push(bg[i * 3 + 1]); t2.push(bg[i * 3 + 2]);
          }
        }
        if (t0.length < 6) continue;
        const o = (by * bc + bx) * 3;
        blk[o] = med(t0); blk[o + 1] = med(t1); blk[o + 2] = med(t2);
      }
    }
    const smooth = new Float32Array(bc * br * 3).fill(NaN);
    for (let by = 0; by < br; by++) {
      for (let bx = 0; bx < bc; bx++) {
        t0.length = t1.length = t2.length = 0;
        for (let y = Math.max(0, by - R); y <= Math.min(br - 1, by + R); y++) {
          for (let x = Math.max(0, bx - R); x <= Math.min(bc - 1, bx + R); x++) {
            const o = (y * bc + x) * 3;
            if (Number.isNaN(blk[o])) continue;
            t0.push(blk[o]); t1.push(blk[o + 1]); t2.push(blk[o + 2]);
          }
        }
        if (t0.length < 5) continue;
        const o = (by * bc + bx) * 3;
        smooth[o] = med(t0); smooth[o + 1] = med(t1); smooth[o + 2] = med(t2);
      }
    }
    // Terug naar cellen, tussen de blokmiddens in (anders trapjes in een verloop).
    const wall = new Float32Array(n * 3).fill(NaN);
    const ratio = new Float32Array(n);                    // afwijking / drempel
    const thrA = new Float32Array(n);
    const qf = this.quietFactor, thrQ = qf < 1 ? new Float32Array(n) : null;
    for (let cy = 0; cy < rows; cy++) {
      const fy = (cy - (B - 1) / 2) / B, y0 = Math.floor(fy), ty = fy - y0;
      for (let cx = 0; cx < cols; cx++) {
        const i = cy * cols + cx;
        if (!inn[i]) continue;
        const fx = (cx - (B - 1) / 2) / B, x0 = Math.floor(fx), tx = fx - x0;
        let w = 0, s0 = 0, s1 = 0, s2 = 0;
        for (let k = 0; k < 4; k++) {
          const xx = Math.min(bc - 1, Math.max(0, x0 + (k & 1)));
          const yy = Math.min(br - 1, Math.max(0, y0 + (k >> 1)));
          const o = (yy * bc + xx) * 3;
          if (Number.isNaN(smooth[o])) continue;
          const wk = Math.max(1e-3, ((k & 1) ? tx : 1 - tx) * ((k >> 1) ? ty : 1 - ty));
          w += wk; s0 += smooth[o] * wk; s1 += smooth[o + 1] * wk; s2 += smooth[o + 2] * wk;
        }
        if (!w) continue;
        const wr = s0 / w, wg = s1 / w, wb = s2 / w;
        wall[i * 3] = wr; wall[i * 3 + 1] = wg; wall[i * 3 + 2] = wb;
        // Dezelfde drempel als de gewone herkenning: wat die niet zou zien, zoeken we hier ook niet.
        const wl = 0.299 * wr + 0.587 * wg + 0.114 * wb;
        const licht = Math.max(0.3, Math.min(1, wl / 140));
        const thr = this.objThresh * licht + this.noise[i] * 2.2;
        const d = (Math.abs(bg[i * 3] - wr) + Math.abs(bg[i * 3 + 1] - wg) + Math.abs(bg[i * 3 + 2] - wb)) / 3;
        ratio[i] = d / thr; thrA[i] = thr;
        if (qf < 1) thrQ[i] = this.objThresh * licht * this.quietAt(licht) + this.noise[i] * 2.2;
      }
    }
    // Stille camera: net als bij de gewone herkenning (zie acceptQuiet) telt de lagere
    // drempel alleen voor een voorwerp op zichzelf: minstens quietGap cellen vrij van
    // alles wat de gewone drempel haalt. Zo'n vlekje wordt verder gekeurd met die
    // lagere drempel.
    if (qf < 1) {
      const acc = [], R = this.quietGap, on = new Uint8Array(n), strong = new Uint8Array(n);
      for (let i = 0; i < n; i++) on[i] = inn[i] && ratio[i] > 1 ? 1 : 0;
      this.markStrong(on, strong, 5);
      for (let i = 0; i < n; i++) {
        if (!inn[i] || ratio[i] > 1 || !(ratio[i] * thrA[i] > thrQ[i])) continue;
        const x = i % cols, y = (i - x) / cols;
        let near = false;
        for (let yy = Math.max(0, y - R); yy <= Math.min(rows - 1, y + R) && !near; yy++) {
          for (let xx = Math.max(0, x - R); xx <= Math.min(cols - 1, x + R); xx++) {
            if (strong[yy * cols + xx] === 1) { near = true; break; }
          }
        }
        if (!near) acc.push(i);
      }
      for (const i of acc) { ratio[i] = ratio[i] * thrA[i] / thrQ[i]; thrA[i] = thrQ[i]; }
    }

    // Vlekjes zoeken en keuren.
    const lab = new Int32Array(n), q = this.stack;
    let L = 0;
    for (let s0 = 0; s0 < n; s0++) {
      if (!core[s0] || ratio[s0] <= 1 || lab[s0]) continue;
      L++;
      let h = 0, t = 0;
      q[t++] = s0; lab[s0] = L;
      while (h < t) {
        const i = q[h++], x = i % cols;
        for (const j of [x > 0 ? i - 1 : -1, x < cols - 1 ? i + 1 : -1, i - cols, i + cols]) {
          if (j >= 0 && j < n && !lab[j] && core[j] && ratio[j] > 1) { lab[j] = L; q[t++] = j; }
        }
      }
    }
    const maxCells = Math.max(40, nIn * 0.05);
    const minCells = Math.max(6, this.minCells);
    const members = new Map();
    for (let i = 0; i < n; i++) if (lab[i]) { let a = members.get(lab[i]); if (!a) members.set(lab[i], a = []); a.push(i); }

    let found = 0;
    for (const [l, cells] of members) {
      const m = cells.length;
      if (m < minCells || m > maxCells) continue;
      let rsum = 0, x0 = cols, y0 = rows, x1 = 0, y1 = 0;
      const pts = [], nz = [];
      for (const i of cells) {
        const x = i % cols, y = (i - x) / cols;
        rsum += ratio[i]; pts.push([x, y]); nz.push(this.noise[i]);
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
      // Hoeveel boven de drempel moet het zijn? Een vlek die alleen lichter of donkerder
      // is dan de muur (een lichtvlek, schaduw, grijze print) is hier niet van een
      // voorwerp te onderscheiden: die moet ruim boven de drempel zitten. Een vlek met
      // een eigen kleur (pigment) is dat wel: daar volstaat wat de gewone herkenning
      // ook vraagt. Anders bleven gele, oranje, roze en blauwe briefjes onzichtbaar.
      // Maar extra licht maakt alle drie de kanalen lichter, ook als het getint is:
      // zo'n vlek is geen pigment.
      const ce = [], up = [];
      for (const i of cells) {
        const wr = wall[i * 3], wg = wall[i * 3 + 1], wb = wall[i * 3 + 2];
        const k = (0.299 * bg[i * 3] + 0.587 * bg[i * 3 + 1] + 0.114 * bg[i * 3 + 2]) /
          Math.max(1, 0.299 * wr + 0.587 * wg + 0.114 * wb);
        ce.push((Math.abs(bg[i * 3] - wr * k) + Math.abs(bg[i * 3 + 1] - wg * k) + Math.abs(bg[i * 3 + 2] - wb * k)) / 3);
        up.push(Math.min(bg[i * 3] / Math.max(1, wr), bg[i * 3 + 1] / Math.max(1, wg), bg[i * 3 + 2] / Math.max(1, wb)));
      }
      const pigment = med(ce) > 12 && med(up) <= 1.03;
      const needR = pigment ? 1.0 : 1.4, needC = pigment ? 1.0 : 1.3;
      if (rsum / m < needR) continue;                    // net boven de drempel: twijfel
      // Raakt de rand van de kern: loopt waarschijnlijk door tot de rand van het
      // beamerbeeld (een lichtrand bij een iets te ruime kalibratie), of valt er half af.
      let atEdge = false;
      for (const i of cells) {
        const x = i % cols;
        if (!core[i - 1] || !core[i + 1] || !core[i - cols] || !core[i + cols] || x === 0 || x === cols - 1) { atEdge = true; break; }
      }
      if (atEdge) continue;
      const hull = convexHull(pts), ha = polyArea(hull);
      if (ha > 1 && m / ha < 0.75) continue;             // hol of grillig: geen voorwerp

      // Afstand (in cellen, schaakbord) tot het vlekje, in een kader eromheen.
      const X0 = x0 - 3, Y0 = y0 - 3, W = x1 - x0 + 7, H = y1 - y0 + 7;
      const dist = new Uint8Array(W * H).fill(9);
      for (const [x, y] of pts) {
        for (let dy = -3; dy <= 3; dy++) {
          for (let dx = -3; dx <= 3; dx++) {
            const k = (y + dy - Y0) * W + (x + dx - X0), d = Math.max(Math.abs(dx), Math.abs(dy));
            if (d < dist[k]) dist[k] = d;
          }
        }
      }
      // Rondom moet egale muur liggen. Cellen vlak bij een ánder vlekje tellen niet
      // mee: twee briefjes naast elkaar mogen allebei gevonden worden.
      // Wat buiten het beamervlak valt, telt niet mee (een briefje vlak bij de rand
      // heeft daar geen muur om zich heen), maar dan moet er wel aan minstens drie
      // kanten muur te zien zijn.
      let ring = 0;
      const rn = [], rc = [], kant = [0, 0, 0, 0];
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const dd = dist[y * W + x];
          if (dd < 2 || dd > 3) continue;
          const cx = X0 + x, cy = Y0 + y;
          if (cx < 0 || cy < 0 || cx >= cols || cy >= rows) continue;
          const i = cy * cols + cx;
          if (!inn[i] || Number.isNaN(wall[i * 3])) continue;
          ring++;
          let other = false;
          for (let ny = Math.max(0, cy - 1); ny <= Math.min(rows - 1, cy + 1) && !other; ny++) {
            for (let nx = Math.max(0, cx - 1); nx <= Math.min(cols - 1, cx + 1); nx++) {
              const lj = lab[ny * cols + nx];
              if (lj && lj !== l) { other = true; break; }
            }
          }
          if (other) continue;
          rc.push(i); rn.push(this.noise[i]);
          if (cx < x0) kant[0]++; if (cx > x1) kant[1]++; if (cy < y0) kant[2]++; if (cy > y1) kant[3]++;
        }
      }
      if (!ring || rc.length < ring * 0.4 || rc.length < 12) continue;
      if (kant.filter(k => k >= 2).length < 3) continue;

      // De muur rondom beschrijven met een plat vlak per kleur (a + b·x + c·y): een
      // lamp mag er een verloop overheen leggen, maar een rand van een groot vel,
      // een lijst of een poster past niet in een plat vlak. Door deze ring te meten
      // en niet de gladde schatting, laat een groot vel zich hier niet voor de gek
      // houden — die schatting volgt zo'n vel namelijk gewoon.
      const mxc = (x0 + x1) / 2, myc = (y0 + y1) / 2;
      let s00 = 0, s01 = 0, s02 = 0, s11 = 0, s12 = 0, s22 = 0;
      const rhs = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
      for (const i of rc) {
        const x = i % cols - mxc, y = (i - (i % cols)) / cols - myc;
        s00++; s01 += x; s02 += y; s11 += x * x; s12 += x * y; s22 += y * y;
        for (let c = 0; c < 3; c++) {
          const v = bg[i * 3 + c];
          rhs[c][0] += v; rhs[c][1] += v * x; rhs[c][2] += v * y;
        }
      }
      s11 += 1e-3; s22 += 1e-3;                           // nooit een ontaarde oplossing
      const M = [[s00, s01, s02], [s01, s11, s12], [s02, s12, s22]];
      const det3 = (m) => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1])
        - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
      const D = det3(M);
      if (!(Math.abs(D) > 1e-9)) continue;
      const vlak = [];
      for (let c = 0; c < 3; c++) {
        const coef = [];
        for (let k = 0; k < 3; k++) {
          const Mk = M.map((row, ri) => row.map((val, ci) => (ci === k ? rhs[c][ri] : val)));
          coef.push(det3(Mk) / D);
        }
        vlak.push(coef);
      }
      const plane = (i, c) => {
        const x = i % cols - mxc, y = (i - (i % cols)) / cols - myc;
        return vlak[c][0] + vlak[c][1] * x + vlak[c][2] * y;
      };
      const afw = (i) => (Math.abs(bg[i * 3] - plane(i, 0)) + Math.abs(bg[i * 3 + 1] - plane(i, 1))
        + Math.abs(bg[i * 3 + 2] - plane(i, 2))) / 3;
      const ringAfw = rc.map(afw).sort((p, q) => p - q);
      const thrMed = med(cells.map(i => thrA[i]));
      if (ringAfw[Math.floor(ringAfw.length * 0.8)] > Math.max(5, 0.3 * thrMed)) continue;
      // En het vlekje moet duidelijk afwijken van die muur eromheen.
      let sc = 0;
      for (const i of cells) sc += afw(i) / thrA[i];
      if (sc / m < needC) continue;
      // Stilgestaan tijdens het leren: iemand die voorbijliep ruist veel meer dan de muur.
      if (med(nz) > Math.max(6, 2 * med(rn))) continue;

      // Aangenomen: de muur hier invullen met dat vlak, inclusief de wazige rand eromheen.
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          if (dist[y * W + x] > 1) continue;
          const cx = X0 + x, cy = Y0 + y;
          if (cx < 0 || cy < 0 || cx >= cols || cy >= rows) continue;
          const i = cy * cols + cx;
          if (!inn[i]) continue;
          for (let c = 0; c < 3; c++) bg[i * 3 + c] = plane(i, c);
          res[i] = 1;
        }
      }
      found++;
    }
    this.residentCount = found;
    if (found) this.tracks.length = 0; this.lostTracks = [];
    return found;
  }

  /**
   * Verwachte helderheid van onze eigen projectie per cel. Zonder dit zou het
   * spel zijn eigen licht op de muur als voorwerp zien.
   *
   * signed (mag weg): hetzelfde beeld als sterkte tegen de muurverlichting, in
   * lineair licht: 0 = de muurverlichting zelf, 1 = vol wit, negatief = donkerder dan
   * de muurverlichting. Even lang als luma (grijs licht), of drie keer zo lang (r, g,
   * b om en om) voor gekleurd licht. Met het lichtmodel (hasResponse) voorspelt
   * classifyObject daaruit hoe de muur er onder ons licht uit hoort te zien.
   */
  setProjection(luma, lw, lh, toUV, signed) {
    const p = this.projLuma, pI = this.projI;
    if (!luma || !toUV) { p.fill(0); this.projPrev.fill(0); this.resetSigned(); return; }
    // k: 1 = grijs licht (één sterkte per cel), 3 = gekleurd (r, g, b om en om)
    const k = !signed ? 0 : signed.length === lw * lh * 3 ? 3 : signed.length === lw * lh ? 1 : 0;
    if (k && k !== this.projStride) { this.resetSigned(); this.projStride = k; }
    const cols = this.cols, rows = this.rows, cell = this.cell;
    for (let cy = 0; cy < rows; cy++) {
      for (let cx = 0; cx < cols; cx++) {
        const idx = cy * cols + cx;
        const uv = toUV((cx + 0.5) * cell, (cy + 0.5) * cell);
        const u = uv[0], v = uv[1];
        if (u < 0 || v < 0 || u > 1 || v > 1) {
          p[idx] = 0;
          if (k === 1) pI[idx] = 0;
          else if (k) pI[idx * 3] = pI[idx * 3 + 1] = pI[idx * 3 + 2] = 0;
          continue;
        }
        const sx = Math.min(lw - 1, (u * lw) | 0), sy = Math.min(lh - 1, (v * lh) | 0);
        p[idx] = luma[sy * lw + sx];
        if (!k) continue;
        // Niet uitgesmeerd: dit is wat er precies op deze cel valt.
        const s = sy * lw + sx;
        if (k === 1) pI[idx] = unitClamp(signed[s]);
        else {
          const o = idx * 3;
          pI[o] = unitClamp(signed[s * 3]); pI[o + 1] = unitClamp(signed[s * 3 + 1]); pI[o + 2] = unitClamp(signed[s * 3 + 2]);
        }
      }
    }
    this.spreadProjection();
    if (k) { this.spreadSigned(k); this.projSigned = true; } else if (this.projSigned) this.resetSigned();
  }

  resetSigned() {
    this.projI.fill(0); this.projHi.fill(0); this.projLo.fill(0); this.projBand.fill(0);
    this.projSigned = false;
  }

  /**
   * Een band om de voorspelling: het minste en het meeste licht dat hier nu kan
   * vallen. Eén cel opzij (de kalibratie zit nooit precies op de cel) en even terug
   * in de tijd (de camera loopt achter op wat we tekenen): de bovengrens zakt maar
   * langzaam als het licht weggaat, de ondergrens stijgt maar langzaam als het komt —
   * even snel als bij spreadProjection. Wat de camera binnen die band ziet, is gewoon
   * onze bal op de muur. projBand zegt per cel of er überhaupt licht in de band zit;
   * waar niet, rekent classifyObject gewoon zoals zonder lichtmodel.
   */
  spreadSigned(k) {
    const pI = this.projI, hi = this.projHi, lo = this.projLo, band = this.projBand;
    const cols = this.cols, rows = this.rows, rk = cols * k;
    let th = this.sigTmpHi, tl = this.sigTmpLo;
    if (!th || th.length !== pI.length) { th = this.sigTmpHi = new Float32Array(pI.length); tl = this.sigTmpLo = new Float32Array(pI.length); }
    for (let y = 0; y < rows; y++) {                       // horizontaal
      const o0 = y * rk, o1 = o0 + rk;
      for (let o = o0; o < o1; o++) {
        let a = pI[o], z = a;
        if (o - k >= o0) { const q = pI[o - k]; if (q > a) a = q; if (q < z) z = q; }
        if (o + k < o1) { const q = pI[o + k]; if (q > a) a = q; if (q < z) z = q; }
        th[o] = a; tl[o] = z;
      }
    }
    for (let y = 0; y < rows; y++) {                       // verticaal, en de tijd
      const o0 = y * rk, o1 = o0 + rk, boven = y > 0, onder = y < rows - 1;
      for (let o = o0; o < o1; o++) {
        let a = th[o], z = tl[o];
        if (boven) { if (th[o - rk] > a) a = th[o - rk]; if (tl[o - rk] < z) z = tl[o - rk]; }
        if (onder) { if (th[o + rk] > a) a = th[o + rk]; if (tl[o + rk] < z) z = tl[o + rk]; }
        let h = hi[o] * 0.75 + a * 0.25, l = lo[o] * 0.75 + z * 0.25;
        if (a > h) h = a;
        if (z < l) l = z;
        // Uitgedoofd is uit (3% van vol wit: hooguit een paar grijswaarden), anders
        // sleept elke bal een lange staart van cellen 'in de band' achter zich aan.
        if (h < 0.03 && h > -0.03) h = 0;
        if (l < 0.03 && l > -0.03) l = 0;
        hi[o] = h; lo[o] = l;
      }
    }
    for (let i = 0, o = 0; i < band.length; i++, o += k) {
      let on = hi[o] !== 0 || lo[o] !== 0;
      if (k === 3) on = on || hi[o + 1] !== 0 || lo[o + 1] !== 0 || hi[o + 2] !== 0 || lo[o + 2] !== 0;
      band[i] = on ? 1 : 0;
    }
  }

  /**
   * De voorspelling één cel uitsmeren en laten nagloeien. De kalibratie zit nooit
   * precies op de cel en de camera loopt een frame achter. Breder uitsmeren is
   * verleidelijk maar verblindt een ring rondom elk lichtje — en die ring is al
   * gauw breder dan een post-it.
   */
  spreadProjection() {
    const p = this.projLuma, prev = this.projPrev, cols = this.cols, rows = this.rows;
    // Na een andere uitsnede is het raster anders groot; een te korte buffer gaf
    // NaN's en daarmee een balk onderin die altijd als voorwerp gold.
    let tmp = this.supTmpGrid;
    if (!tmp || tmp.length !== p.length) tmp = this.supTmpGrid = new Float32Array(p.length);
    for (let y = 0; y < rows; y++) {                       // horizontaal maximum
      const o = y * cols;
      for (let x = 0; x < cols; x++) {
        let m = p[o + x];
        if (x > 0 && p[o + x - 1] > m) m = p[o + x - 1];
        if (x < cols - 1 && p[o + x + 1] > m) m = p[o + x + 1];
        tmp[o + x] = m;
      }
    }
    for (let x = 0; x < cols; x++) {                       // verticaal maximum
      for (let y = 0; y < rows; y++) {
        const i = y * cols + x;
        let m = tmp[i];
        if (y > 0 && tmp[i - cols] > m) m = tmp[i - cols];
        if (y < rows - 1 && tmp[i + cols] > m) m = tmp[i + cols];
        const held = Math.max(m, prev[i] * 0.75);
        prev[i] = held;
        p[i] = held;
      }
    }
  }

  // ---- indeling in voor- en achtergrond ------------------------------------

  paintMask(idx, r, g, b, on) {
    const mi = this.maskImage.data, o = idx * 4;
    if (on) { mi[o] = r; mi[o + 1] = g; mi[o + 2] = b; }
    else { const v = this.cl[idx] * 0.3; mi[o] = mi[o + 1] = mi[o + 2] = v; }
    mi[o + 3] = 255;
  }

  classifyColor() {
    const classes = this.classes, mask = this.mask;
    for (let i = 0; i < mask.length; i++) {
      const h = this.ch[i], s = this.cs[i], v = this.cvv[i];
      let best = -1, bestD = Infinity;
      for (let ci = 0; ci < classes.length; ci++) {
        const C = classes[ci];
        if (s < C.sMin || v < C.vMin) continue;
        const d = hueDist(h, C.hue);
        if (d <= C.hTol && d < bestD) { bestD = d; best = ci; }
      }
      mask[i] = best + 1;
      if (best >= 0) {
        const col = classes[best].css;
        this.paintMask(i, parseInt(col.slice(1, 3), 16), parseInt(col.slice(3, 5), 16), parseInt(col.slice(5, 7), 16), true);
      } else this.paintMask(i, 0, 0, 0, false);
    }
  }

  classifyObject() {
    const mask = this.mask, bg = this.bg, proj = this.projLuma, n = mask.length;
    if (!bg) {
      mask.fill(0);
      for (let i = 0; i < n; i++) this.paintMask(i, 0, 0, 0, false);
      this.fgFraction = 0;
      return;
    }
    // Globale lichtsprong opvangen. Gaat er een lamp aan of stelt de camera zijn
    // belichting bij, dan schuift het hele beeld mee. Die factor schatten we uit de
    // mediaan en rekenen we weg, anders wordt de hele muur ineens voorgrond — of,
    // erger, valt alle herkenning stil zonder dat iemand het merkt.
    //
    // Met het lichtmodel (zie learnResponse) voorspellen we ons eigen licht in plaats
    // van er alleen de drempel voor op te hogen: verwacht = (muur + wit·sterkte) keer
    // de lichtfactor. Niet één getal maar een band (zie spreadSigned), want de
    // kalibratie en de camera lopen altijd iets achter of naast wat we tekenen. Een
    // donker briefje onder een bal kaatst weinig van ons licht terug en valt daardoor
    // ver onder die band — waar het zonder model juist in het muurlicht verdween.
    const model = this.hasResponse && this.projSigned && !!this.resp && this.resp.length === bg.length;
    const resp = this.resp, pI = this.projI, hiA = this.projHi, loA = this.projLo, band = this.projBand;
    // grijs licht: één sterkte per cel voor alle drie de kleuren (zie setProjection)
    const ks = this.projStride, c1 = ks === 3 ? 1 : 0, c2 = c1 * 2;
    const gain = model ? this.fitGain(true) : this.fitGain();
    const qf = this.quietFactor;
    const expR = this.expR, expG = this.expG, expB = this.expB, colOk = this.colOk;
    // Welke cellen er vorige keer alleen dankzij de stille camera bij kwamen (zie
    // acceptQuiet): die houden zich ook dit beeld aan die regels.
    const quietPrev = this.quietOn;
    this.quietOn = this.quietPrev; this.quietPrev = quietPrev;
    this.quietOn.fill(0);
    const quiet = this.quietList;
    let nq = 0;

    const shadow = this.shadowCell, skin = this.skinCell, cand = this.candCell;
    // Vorige uitkomst bewaren, voor twee dingen: een cel die net nog voorwerp was
    // mag iets makkelijker aan blijven (dat haalt geflikker weg zonder vertraging),
    // en ons eigen licht mag hem niet wegvagen.
    const prev = this.prevMask, keep = this.lightKept, keepAge = this.lightKeptAge;
    const hyst = this.hystCell;
    prev.set(mask);
    let gray = 0, nHyst = 0;

    for (let i = 0; i < n; i++) {
      const r = this.cr[i], g = this.cg[i], b = this.cb[i];
      let br = bg[i * 3] * gain, bg2 = bg[i * 3 + 1] * gain, bb = bg[i * 3 + 2] * gain;
      const pj = proj[i] > 0 ? proj[i] : 0;             // NaN mag nooit een cel aanzetten
      // Valt ons licht hier niet: dan zegt deze cel iets over het zachte midden en de
      // kleur van een voorwerp (zie hieronder en blobs).
      const fresh = pj < 6;
      let diff = 0, pad, below = 0, above = 0, padDark = 0;
      const inBand = model && band[i] === 1;
      if (inBand) {
        const o = i * 3, q = i * ks, ar = resp[o], ag = resp[o + 1], ab = resp[o + 2];
        const w0 = bg[o], w1 = bg[o + 1], w2 = bg[o + 2];
        // De camera loopt vol bij 255: meer licht dan dat ziet hij niet.
        br = clampByte((w0 + ar * pI[q]) * gain);
        bg2 = clampByte((w1 + ag * pI[q + c1]) * gain);
        bb = clampByte((w2 + ab * pI[q + c2]) * gain);
        const lr = clampByte((w0 + ar * loA[q]) * gain), hr = clampByte((w0 + ar * hiA[q]) * gain);
        const lg = clampByte((w1 + ag * loA[q + c1]) * gain), hg = clampByte((w1 + ag * hiA[q + c1]) * gain);
        const lb = clampByte((w2 + ab * loA[q + c2]) * gain), hb = clampByte((w2 + ab * hiA[q + c2]) * gain);
        below = (r < lr ? lr - r : 0) + (g < lg ? lg - g : 0) + (b < lb ? lb - b : 0);
        above = (r > hr ? r - hr : 0) + (g > hg ? g - hg : 0) + (b > hb ? b - hb : 0);
        // Wat overblijft is een kleine marge voor wat het model mist: vooral een camera
        // die nog een bal ziet die we al verder getekend hebben (lichter dan de band).
        // Donkerder dan de band kan ons licht een cel bijna niet maken — de ondergrens
        // stijgt maar langzaam als er licht komt — dus daar een veel kleinere marge.
        // Precies daar zit een donker briefje onder een regen van ballen.
        pad = pj * this.respPad;
        padDark = pj * this.respPadDark;
        // (Het zachte midden en de kleur ook binnen een smalle band laten meten, waar we
        // precies weten welk licht er valt, maakte het midden juist onrustiger: een
        // donker briefje onder drie ballen telde pas na 1,5 s in plaats van 1,2 s.)
      } else {
        diff = (Math.abs(r - br) + Math.abs(g - bg2) + Math.abs(b - bb)) / 3;
        pad = pj * 0.85;
      }
      const bl = 0.299 * br + 0.587 * bg2 + 0.114 * bb;
      const cl = this.cl[i];
      shadow[i] = 0; skin[i] = 0; cand[i] = 0; keep[i] = 0;

      // Beamerlicht verhoogt de drempel, maar zet een cel nooit hard uit: juist op
      // de rand van een voorwerp tekenen we zelf licht, en die cellen hebben we nodig.
      // De drempel schaalt mee met hoe licht de muur daar is. Een post-it kaatst een
      // vast deel van het licht anders terug dan de muur: op een felle muur is dat
      // een groot verschil in getallen, op een schemerige muur een klein verschil —
      // maar het is hetzelfde contrast. Met een vaste drempel verdween alles zodra
      // het donker werd. De ruisterm blijft, die beschermt tegen camerakorrel.
      const licht = Math.max(0.3, Math.min(1, bl / 140));
      const base = this.objThresh * licht + this.noise[i] * 2.2;
      const thr = base + pad;
      // Te donker telt zwaarder, zodat het bij de kleine marge al de drempel haalt.
      if (inBand) diff = (above + below * (thr / (base + padDark))) / 3;
      const s = diff / thr;                             // 1 = precies op de drempel
      // Hoe zeker is dit voorwerp, als getal tussen 0 en 1 (zie softCentre). Onder ons
      // eigen licht (een bal, de score) blijft de laatste waarde staan: een bal die over
      // een briefje valt, verschuift anders het midden en lijkt dan op trillen.
      if (fresh) this.softW[i] = Math.max(0, Math.min(1, (s - 0.35) / 0.65));

      // Hysterese in de tijd: was hij aan, dan blijft hij aan zolang hij boven 70%
      // van de drempel zit. Kost geen enkel frame vertraging, anders dan middelen.
      const seed = s > 1, wasQuiet = quietPrev[i];
      let on = seed || (prev[i] && !wasQuiet && s > 0.7);
      if (!on && prev[i] && !wasQuiet && diff > base && keepAge[i] < 90) {
        // Alleen verstopt door ons eigen licht: vasthouden, met een plafond, zodat
        // het nooit een eeuwig spook wordt.
        on = true; keep[i] = 1; keepAge[i]++;
      } else if (!keep[i]) keepAge[i] = 0;
      // Stille camera: het vaste deel van de drempel mag omlaag (quietFactor), maar
      // alleen voor een voorwerp op zichzelf. Zie acceptQuiet. Met dezelfde
      // hysterese als hierboven, op die lagere drempel.
      // (Onder 0,5 van de gewone drempel komt geen cel ooit boven de lagere uit.)
      if (!on && qf < 1 && s > 0.5 && licht > 0.3) {
        const sq = diff / (this.objThresh * licht * this.quietAt(licht) + this.noise[i] * 2.2 + pad);
        if (sq > 1 || (wasQuiet && prev[i] && sq > 0.7)) quiet[nq++] = i;
      }
      // Verwachte muurkleur, voor de kleur van het voorwerp (zie blobs). Alleen waar
      // de cel voorgrond is of nog kan worden: alles wat later aangaat zit boven 0,5.
      if (on || s > 0.5) { expR[i] = br; expG[i] = bg2; expB[i] = bb; colOk[i] = fresh ? 1 : 0; }

      if (!on && s > 0.6) { cand[i] = 1; gray++; }       // mag later meegroeien
      // Alleen aan door de hysterese: mag een voorwerp aan houden, maar geen brug
      // slaan naar een ander voorwerp (zie growMarked).
      hyst[i] = on && !seed && !keep[i] ? 1 : 0;
      if (hyst[i]) nHyst++;
      mask[i] = on ? 1 : 0;
      if (!on && !cand[i]) continue;

      // Schaduw: donkerder met dezelfde kleurverhouding. Alleen merken, niet wissen —
      // een grijs boek ziet er per cel precies zo uit als een schaduw, en dat verschil
      // is pas op vlekniveau te zien (aan de scherpte van de rand).
      if (cl < bl - 4) {
        const k = cl / (bl + 0.001);
        if (k > 0.45) {
          const err = Math.abs(r - br * k) + Math.abs(g - bg2 * k) + Math.abs(b - bb * k);
          if (err < 18) shadow[i] = 1;
        }
      }
      if (this.skinFilter && this.isSkin(i, br, bg2, bb)) skin[i] = 1;
    }

    // Hysterese in de ruimte: vanuit duidelijke cellen mag een voorwerp uitgroeien
    // in cellen die maar half zo duidelijk zijn. Dat zijn precies de randcellen die
    // een voorwerp half bedekt, en die vielen weg — waardoor kleine voorwerpen te
    // klein werden of helemaal verdwenen. Gemeten in onderzoek: 9 van 13 voorwerpen
    // betrouwbaar gevolgd tegen 6 van 13, bij hetzelfde aantal valse vlekken.
    //
    // Vangnet: bij een lichtverandering kan de hele muur 'half duidelijk' worden, en
    // dan zou één zaadje over alles heen groeien. Is meer dan 8% van het beeld zo,
    // dan groeien we niet en zeggen we het.
    if (nHyst && this.ownersReady) this.cutBridges();
    this.grayFraction = gray / n;
    this.floodGuard = this.grayFraction > 0.08;
    if (!this.floodGuard && gray > 0) this.growMarked();
    // Stille camera: zwakke voorwerpen mogen er ook bij — een lichtgrijs of kraftbruin
    // briefje zat net onder de drempel. Maar alleen een voorwerp op zichzelf (zie
    // acceptQuiet), en pas ná het groeien hierboven: wat daar al aan een gewoon
    // voorwerp vastgroeide, hoort daarbij. Daarna mag zo'n zwak voorwerp zelf groeien
    // (in wat dan nog over is, dus nooit tot tegen een ander voorwerp aan). En niet
    // als er ineens overal zulke cellen zijn: dat is een lichtverandering, geen briefje.
    if (nq && !this.floodGuard && nq < n * 0.03 && this.acceptQuiet(nq)) this.growMarked();

    let fg = 0, shade = 0;
    for (let i = 0; i < n; i++) {
      if (!mask[i]) { this.paintMask(i, 0, 0, 0, false); continue; }
      fg++;
      if (shadow[i]) shade++;
      this.paintMask(i, shadow[i] ? 70 : (skin[i] ? 120 : 90), shadow[i] ? 70 : (skin[i] ? 45 : 230),
        shadow[i] ? 95 : (skin[i] ? 45 : 255), true);
    }
    fg -= this.dropOrphanKept();
    this.fgFraction = fg / n;
    this.shadowFraction = shade / n;
    this.gain = gain;
  }

  /**
   * Cellen die alleen de lagere drempel van een stille camera halen, tellen alleen
   * als er binnen quietGap cellen geen stuk voorgrond ligt dat de gewone drempel
   * haalt. Dichterbij blijven ze bij de gewone regels (meegroeien, zie growMarked).
   * Met 2 cellen groeide de wazige strook tussen twee briefjes die vlak naast elkaar
   * hangen dicht, en werd de rand van een mens één vlek met het briefje ernaast; met
   * 3 werd een vale strook midden in een mens (een wit shirt onder de lichte
   * scorebalk) een los voorwerp. Een los ruiscelletje dat toevallig de gewone drempel
   * haalt telt niet als 'stuk voorgrond': in een schemerige kamer zit zo'n zwak
   * briefje daar vol mee, en dan viel het in stukken uiteen.
   */
  acceptQuiet(nq) {
    const q = this.quietList, mask = this.mask, cols = this.cols, rows = this.rows;
    const R = this.quietGap, strong = this.strongCell;
    this.markStrong(mask, strong, 5);
    let k = 0;
    for (let j = 0; j < nq; j++) {
      const i = q[j], x = i % cols, y = (i - x) / cols;
      if (mask[i]) continue;                            // al meegegroeid met een voorwerp
      let near = false;
      for (let yy = Math.max(0, y - R); yy <= Math.min(rows - 1, y + R) && !near; yy++) {
        for (let xx = Math.max(0, x - R); xx <= Math.min(cols - 1, x + R); xx++) {
          if (strong[yy * cols + xx] === 1) { near = true; break; }
        }
      }
      if (!near) q[k++] = i;
    }
    // Pas na het kijken aanzetten: de volgorde mag niet uitmaken.
    for (let j = 0; j < k; j++) { mask[q[j]] = 1; this.quietOn[q[j]] = 1; }
    return k;
  }

  /**
   * Welke cellen van on horen bij een aaneengesloten stuk van minstens minSize
   * cellen? Die krijgen 1 in out (de rest 0 of 2).
   */
  markStrong(on, out, minSize) {
    const cols = this.cols, n = on.length, q = this.stack;
    out.fill(0);
    for (let s0 = 0; s0 < n; s0++) {
      if (!on[s0] || out[s0]) continue;
      let h = 0, t = 0;
      q[t++] = s0; out[s0] = 2;
      while (h < t) {
        const i = q[h++], x = i % cols;
        if (x > 0 && on[i - 1] && !out[i - 1]) { out[i - 1] = 2; q[t++] = i - 1; }
        if (x < cols - 1 && on[i + 1] && !out[i + 1]) { out[i + 1] = 2; q[t++] = i + 1; }
        if (i >= cols && on[i - cols] && !out[i - cols]) { out[i - cols] = 2; q[t++] = i - cols; }
        if (i + cols < n && on[i + cols] && !out[i + cols]) { out[i + cols] = 2; q[t++] = i + cols; }
      }
      if (t >= minSize) for (let k = 0; k < t; k++) out[q[k]] = 1;
    }
  }

  /**
   * Groeien vanuit zaadjes, maar zo dat twee groeiende voorwerpen elkaar nooit
   * raken. Gewone hysterese liet een post-it vastgroeien aan een persoon die er vlak
   * naast stond (en dan werd de post-it mee afgekeurd). Daarom eerst elk zaadje een
   * eigen nummer, samen tegelijk laten groeien, en een gegroeide cel die aan een
   * ander nummer grenst weer uitzetten.
   */
  growMarked() {
    const mask = this.mask, cand = this.candCell, lab = this.growLab, grown = this.grownCell;
    const q = this.stack, cols = this.cols, n = mask.length, quietOn = this.quietOn, quietPrev = this.quietPrev;
    lab.fill(0); grown.fill(0);

    // 1. zaadjes nummeren
    let L = 0;
    for (let s0 = 0; s0 < n; s0++) {
      if (!mask[s0] || lab[s0]) continue;
      L++;
      let h = 0, t = 0;
      q[t++] = s0; lab[s0] = L;
      while (h < t) {
        const i = q[h++], x = i % cols;
        if (x > 0 && mask[i - 1] && !lab[i - 1]) { lab[i - 1] = L; q[t++] = i - 1; }
        if (x < cols - 1 && mask[i + 1] && !lab[i + 1]) { lab[i + 1] = L; q[t++] = i + 1; }
        if (i >= cols && mask[i - cols] && !lab[i - cols]) { lab[i - cols] = L; q[t++] = i - cols; }
        if (i + cols < n && mask[i + cols] && !lab[i + cols]) { lab[i + cols] = L; q[t++] = i + cols; }
      }
    }
    if (L) {
      // 2. alle zaadjes tegelijk laten groeien
      let h = 0, t = 0;
      for (let i = 0; i < n; i++) if (mask[i]) q[t++] = i;
      while (h < t) {
        const i = q[h++], x = i % cols, l = lab[i];
        const nb0 = x > 0 ? i - 1 : -1, nb1 = x < cols - 1 ? i + 1 : -1;
        const nb2 = i >= cols ? i - cols : -1, nb3 = i + cols < n ? i + cols : -1;
        for (const j of [nb0, nb1, nb2, nb3]) {
          if (j < 0 || lab[j] || !cand[j]) continue;
          lab[j] = l; mask[j] = 1; grown[j] = 1; q[t++] = j;
          // Gegroeid uit een zwak voorwerp, of was dit al een zwak voorwerp (een arm die
          // tegen een briefje aan komt): blijft zwak. Anders pakte de gewone hysterese
          // het volgende beeld over, en knipte cutBridges de arm los van het briefje —
          // waarna het briefje de huid eronder als zijn eigen kleur ging meten.
          if (quietOn[i] || quietPrev[j]) quietOn[j] = 1;
        }
      }

      // 3. gegroeide cellen die een ander voorwerp raken weer uit
      for (let i = 0; i < n; i++) {
        if (!grown[i]) continue;
        const x = i % cols, l = lab[i];
        if ((x > 0 && lab[i - 1] && lab[i - 1] !== l) ||
            (x < cols - 1 && lab[i + 1] && lab[i + 1] !== l) ||
            (i >= cols && lab[i - cols] && lab[i - cols] !== l) ||
            (i + cols < n && lab[i + cols] && lab[i + cols] !== l)) {
          grown[i] = 2;                                 // markeren, pas na de lus uitzetten
        }
      }
      for (let i = 0; i < n; i++) if (grown[i] === 2) { mask[i] = 0; lab[i] = 0; quietOn[i] = 0; }
    }
  }

  /**
   * Welk spoor ligt waar? Per cel het nummer van het spoor waarvan de omlijning erover
   * valt (0 = geen), oudste sporen eerst. Uit het vorige beeld, voor cutBridges() en
   * softCentre().
   */
  buildOwners() {
    const own = this.owner, cols = this.cols, rows = this.rows, cell = this.cell;
    own.fill(0);
    let k = 0;
    for (const t of this.tracks) {
      k++;
      t.ownK = k;
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      for (const c of t.corners) {
        x0 = Math.min(x0, c[0]); y0 = Math.min(y0, c[1]);
        x1 = Math.max(x1, c[0]); y1 = Math.max(y1, c[1]);
      }
      const cx0 = Math.max(0, (x0 / cell) | 0), cx1 = Math.min(cols - 1, (x1 / cell) | 0);
      const cy0 = Math.max(0, (y0 / cell) | 0), cy1 = Math.min(rows - 1, (y1 / cell) | 0);
      for (let cy = cy0; cy <= cy1; cy++) {
        for (let cx = cx0; cx <= cx1; cx++) {
          const i = cy * cols + cx;
          if (!own[i] && inConvex(t.corners, (cx + 0.5) * cell, (cy + 0.5) * cell)) own[i] = k;
        }
      }
    }
    this.ownersReady = true;
  }

  /**
   * Hysterese mag een voorwerp aan houden, maar geen brug slaan tussen twee
   * voorwerpen die we al kennen. Anders kroop de smalle strook tussen twee briefjes
   * die vlak naast elkaar hangen dicht: één keer ruis erboven, de hysterese hield
   * hem vast, en voortaan waren ze samen één vlek. Een cel die alleen door de
   * hysterese aan staat en binnen twee cellen van twee verschillende sporen ligt,
   * gaat uit. Echte voorgrond (boven de drempel) blijft altijd staan: wat elkaar
   * echt raakt, is ook echt één vlek.
   */
  cutBridges() {
    const own = this.owner, hyst = this.hystCell, mask = this.mask, cand = this.candCell;
    const cols = this.cols, rows = this.rows;
    for (let i = 0; i < mask.length; i++) {
      if (!hyst[i]) continue;
      const x = i % cols, y = (i - x) / cols;
      let a = 0, two = false;
      for (let yy = Math.max(0, y - 2); yy <= Math.min(rows - 1, y + 2) && !two; yy++) {
        for (let xx = Math.max(0, x - 2); xx <= Math.min(cols - 1, x + 2); xx++) {
          const o = own[yy * cols + xx];
          if (!o || !(this.tracks[o - 1] && this.tracks[o - 1].age >= 12)) continue;
          if (!a) a = o; else if (o !== a) { two = true; break; }
        }
      }
      if (two) { mask[i] = 0; hyst[i] = 0; cand[i] = 1; }
    }
  }

  /**
   * Een vlek die (bijna) alleen uit vastgehouden cellen bestaat is geen voorwerp
   * meer: het voorwerp is weg en alleen ons licht staat er nog. Die cellen wissen,
   * zodat een weggehaalde post-it ook echt verdwijnt.
   */
  dropOrphanKept() {
    const mask = this.mask, keep = this.lightKept, cols = this.cols, n = mask.length;
    const q = this.stack, seen = this.keptSeen;
    seen.fill(0);
    let removed = 0;
    for (let s0 = 0; s0 < n; s0++) {
      if (!keep[s0] || seen[s0]) continue;
      let h = 0, t = 0, plain = 0;
      q[t++] = s0; seen[s0] = 1;
      while (h < t) {
        const i = q[h++];
        if (!keep[i]) plain++;
        const x = i % cols;
        const nb0 = x > 0 ? i - 1 : -1, nb1 = x < cols - 1 ? i + 1 : -1;
        for (const j of [nb0, nb1, i - cols, i + cols]) {
          if (j >= 0 && j < n && mask[j] && !seen[j]) { seen[j] = 1; q[t++] = j; }
        }
      }
      if (plain >= 2) continue;
      for (let k = 0; k < t; k++) {
        const i = q[k];
        if (keep[i]) { mask[i] = 0; keep[i] = 0; this.lightKeptAge[i] = 0; removed++; this.paintMask(i, 0, 0, 0, false); }
      }
    }
    return removed;
  }

  /**
   * Verhouding tussen nu en de geleerde muur, geschat op de mediaan van een
   * steekproef. De mediaan en niet het gemiddelde, want voorwerpen voor de muur
   * mogen de schatting niet meetrekken.
   */
  fitGain(model = false) {
    const bg = this.bg;
    if (!bg) return 1;
    const s = this.gainSample, resp = this.resp, pI = this.projI, band = this.projBand;
    const ks = this.projStride, c1 = ks === 3 ? 1 : 0, c2 = c1 * 2;
    let n = 0;
    for (let i = 0; i < this.cl.length; i += 7) {
      let bl = 0.299 * bg[i * 3] + 0.587 * bg[i * 3 + 1] + 0.114 * bg[i * 3 + 2];
      // Met het lichtmodel tegen de muur mét ons voorspelde licht: anders telt een
      // groot verlicht vlak (de score, een flits) dubbel mee.
      if (model && band[i]) {
        const q = i * ks;
        bl += 0.299 * resp[i * 3] * pI[q] + 0.587 * resp[i * 3 + 1] * pI[q + c1] + 0.114 * resp[i * 3 + 2] * pI[q + c2];
      }
      if (bl < 12) continue;                       // te donker om een verhouding uit te halen
      s[n++] = this.cl[i] / bl;
      if (n === s.length) break;
    }
    if (n < 20) return 1;
    const a = s.subarray(0, n);
    a.sort();
    const med = a[n >> 1];
    return Math.max(0.6, Math.min(1.6, med));
  }

  /**
   * Is de camera verschoven sinds de muur geleerd is? Iemand stoot tegen het statief
   * en ineens klopt de hele geleerde muur een paar pixels niet meer: overal langs
   * randen, voegen en briefjes duiken dan valse vlekken op, en de kalibratie zit ernaast.
   *
   * We leggen het huidige beeld op de geleerde muur, verschoven met hele cellen (tot 4
   * opzij en 4 omhoog of omlaag), en kijken welke verschuiving het best past. Alleen op
   * cellen met structuur (een rand in de geleerde muur): op egale muur past alles even
   * goed. Elk verschil wordt begrensd, zodat een mens die voor de muur staat of een
   * nieuw briefje overal even zwaar weegt en de uitslag niet kan kantelen. De
   * lichtfactor gaat er eerst af, dus een lamp die aangaat is geen verschuiving.
   *
   * Goedkoop (een steekproef van hooguit ~1200 cellen); bedoeld voor ongeveer één keer
   * per seconde.
   *
   * @returns {null | {dx: number, dy: number, ratio: number, moved: boolean, n: number}}
   *   null zonder geleerde muur. dx, dy: hoeveel cellen het beeld verschoven is (+ is
   *   naar rechts of omlaag in het werkbeeld; × this.cell voor werkpixels). ratio: fout
   *   bij de beste verschuiving gedeeld door de fout zonder verschuiving. moved: echt
   *   verschoven (minstens 2 cellen, duidelijk beter passend, genoeg structuur). n: het
   *   aantal meetcellen.
   */
  cameraShift() {
    const bg = this.bg;
    if (!bg) return null;
    const cols = this.cols, rows = this.rows, n = cols * rows, cl = this.cl, M = 4, CAP = 30;
    let bl = this.shiftL, idx = this.shiftIdx;
    if (!bl || bl.length !== n) { bl = this.shiftL = new Float32Array(n); idx = this.shiftIdx = new Int32Array(n); }
    for (let i = 0; i < n; i++) bl[i] = 0.299 * bg[i * 3] + 0.587 * bg[i * 3 + 1] + 0.114 * bg[i * 3 + 2];
    // Meetcellen: een dambord met om de cel een meting, alleen waar de muur een rand heeft.
    let m = 0;
    for (let y = M + 1; y < rows - M - 1; y += 2) {
      for (let x = M + 1 + ((y >> 1) & 1); x < cols - M - 1; x += 2) {
        const i = y * cols + x;
        if (Math.abs(bl[i + 1] - bl[i - 1]) + Math.abs(bl[i + cols] - bl[i - cols]) > 12) idx[m++] = i;
      }
    }
    const step = Math.max(1, Math.ceil(m / 1200));
    const inv = 1 / this.fitGain();
    let best = Infinity, bestE = 0, bdx = 0, bdy = 0, e0 = 0, k = 0;
    for (let dy = -M; dy <= M; dy++) {
      for (let dx = -M; dx <= M; dx++) {
        const off = dy * cols + dx;
        let e = 0;
        k = 0;
        for (let j = 0; j < m; j += step) {
          const i = idx[j], d = Math.abs(cl[i + off] * inv - bl[i]);
          e += d < CAP ? d : CAP; k++;
        }
        e /= Math.max(1, k);
        if (!dx && !dy) e0 = e;
        // Bij twijfel de kleinste verschuiving: een rand die maar één kant op loopt
        // zegt niets over de andere richting.
        const score = e * (1 + 0.02 * Math.max(Math.abs(dx), Math.abs(dy)));
        if (score < best) { best = score; bestE = e; bdx = dx; bdy = dy; }
      }
    }
    const ratio = e0 > 1e-6 ? bestE / e0 : 1;
    const moved = k >= 30 && Math.max(Math.abs(bdx), Math.abs(bdy)) >= 2 && ratio < 0.6;
    return { dx: bdx, dy: bdy, ratio, moved, n: k };
  }

  // ---- vlekken -------------------------------------------------------------

  blobs() {
    const cols = this.cols, rows = this.rows, cell = this.cell;
    const mask = this.mask, seen = this.seen, stack = this.stack;
    const objectMode = this.mode === 'object';
    const maxCells = Math.round(cols * rows * 0.35);
    this.pass++;
    this.tooSmall = 0;
    const pass = this.pass;
    const out = [];
    const pts = [];
    for (let start = 0; start < mask.length; start++) {
      const cls = mask[start];
      if (!cls || seen[start] === pass) continue;
      let sp = 0, n = 0, sumH = 0, sumS = 0, sumW = 0, touchEdge = false;
      let nShadow = 0, nSkin = 0, nRes = 0;
      let kw = 0, kr = 0, kg = 0, kb = 0, kwr = 0, kwg = 0, kwb = 0;
      const steps = this.stepBuf;
      let nSteps = 0;
      stack[sp++] = start; seen[start] = pass;
      pts.length = 0;
      while (sp > 0) {
        const idx = stack[--sp];
        const cx = idx % cols, cy = (idx - cx) / cols;
        if (cx === 0 || cy === 0 || cx === cols - 1 || cy === rows - 1) touchEdge = true;
        pts.push([cx, cy]); n++;
        const s = this.cs[idx];
        sumH += this.ch[idx] * s; sumS += s; sumW += 1;
        if (this.shadowCell[idx]) nShadow++;
        if (this.skinCell[idx]) nSkin++;
        if (this.resident[idx]) nRes++;
        // Kleur van het voorwerp, alleen waar we de muur eronder kennen (niet half
        // onder ons eigen licht), en gewogen naar hoe zeker de cel bij het voorwerp
        // hoort: randcellen zijn half muur en maken elke kleur grauwer.
        if (objectMode && this.colOk[idx]) {
          const w = this.softW[idx];
          if (w > 0) {
            kw += w; kr += w * this.cr[idx]; kg += w * this.cg[idx]; kb += w * this.cb[idx];
            kwr += w * this.expR[idx]; kwg += w * this.expG[idx]; kwb += w * this.expB[idx];
          }
        }
        // Randsprong: hoeveel donkerder/lichter is deze cel dan de achtergrondcel
        // ernaast? Een voorwerp heeft een harde rand, een schaduw loopt uit.
        const nb = [cx > 0 ? idx - 1 : -1, cx < cols - 1 ? idx + 1 : -1,
                    cy > 0 ? idx - cols : -1, cy < rows - 1 ? idx + cols : -1];
        for (let k = 0; k < 4; k++) {
          const j = nb[k];
          if (j < 0) continue;
          if (mask[j] === cls && seen[j] !== pass) { seen[j] = pass; stack[sp++] = j; }
          else if (!mask[j] && nSteps < steps.length) steps[nSteps++] = Math.abs(this.cl[idx] - this.cl[j]);
        }
      }
      const minCells = objectMode ? this.minCells : this.classes[cls - 1].minCells;
      if (n < minCells) { if (n > 3) this.tooSmall++; continue; }
      if (n > maxCells) continue;

      let sx = 0, sy = 0;
      for (let i = 0; i < n; i++) { sx += pts[i][0]; sy += pts[i][1]; }
      const mx = sx / n, my = sy / n;

      const hull = convexHull(pts.map(p => [p[0], p[1]]));
      const axis = principalAxis(pts, mx, my);
      // Alleen bij een duidelijk langwerpige vorm zegt de hoofdas iets. Bij een
      // bijna-vierkante vlek klapt hij van frame tot frame om, en dan is een vaste
      // stand rustiger — en even strak, want een vierkant past in elk assenstelsel.
      const ang = axis[1] > 0.25 ? axis[0] : 0;
      const sup = supportOf(hull, mx, my, ang, new Float32Array(NDIR));

      // Soort briefje (zie noteKindOf). undefined = nu niet te meten: te veel van ons
      // eigen licht erop. Dan telt deze meting niet mee (zie kindVote).
      let kind;
      if (objectMode && kw >= 3 && kw >= n * 0.3) {
        const c = balanceToWall(kr / kw, kg / kw, kb / kw, kwr / kw, kwg / kw, kwb / kw, this.balTmp, true);
        kind = noteKindOf(c[0], c[1], c[2], kr / Math.max(kw, kwr), kg / Math.max(kw, kwg), kb / Math.max(kw, kwb));
      }

      let team;
      if (objectMode) {
        const meanS = sumS / sumW;
        const meanH = sumS > 0.01 ? sumH / sumS : 0;
        team = 'object';
        if (meanS > 0.40) {
          if (hueDist(meanH, this.classes[0].hue) < 26) team = 'attack';
          else if (hueDist(meanH, this.classes[1].hue) < 30) team = 'block';
        }
      } else {
        team = this.classes[cls - 1].id;
      }

      // Massiefheid: hoeveel van de omhullende is echt gevuld. Een boek of post-it
      // vult zijn omhullende bijna helemaal; een arm, een gespreide hand of twee
      // vlekken die per ongeluk aan elkaar plakken niet.
      let hullArea = 0;
      for (let i = 0; i < hull.length; i++) {
        const q = hull[(i + 1) % hull.length];
        hullArea += hull[i][0] * q[1] - q[0] * hull[i][1];
      }
      hullArea = Math.abs(hullArea) / 2;
      const solidity = hullArea > 1 ? Math.min(1, n / hullArea) : 1;

      let medStep = 999;
      if (nSteps > 0) {
        const a = steps.subarray(0, nSteps).slice();
        a.sort();
        medStep = a[nSteps >> 1];
      }

      out.push({
        cls: team, kind, mx, my, sup, hull, ang, ecc: axis[1], cells: n, touchEdge,
        shadowFrac: nShadow / n, skinFrac: nSkin / n, residentFrac: nRes / n, solidity, medStep,
        cx: (mx + 0.5) * cell, cy: (my + 0.5) * cell,
        corners: polyFromSupport(mx, my, sup, ang, cell),
      });
    }
    return out;
  }

  /**
   * Is deze vlek verdacht? Huidkleurig, of grotendeels schaduwkleurig (donkerder met
   * de tint van de muur). Een bruin of zwart briefje is dat ook, dus verdacht is geen
   * afgekeurd: het moet eerst vertrouwen verdienen.
   */
  disguise(t) {
    if (t.shadowFrac > 0.4) return 'schaduw';
    if (this.skinFilter && t.skinFrac > 0.6) return 'huid';
    return null;
  }

  /** Lijkt dit spoor op (een deel van) een mens, los van huidskleur? */
  personLike(t) {
    if (t.touchEdge || t.solidity < 0.72) return true;
    if (t.age >= 12 && !t.rigid) return true;
    if (t.cells > this.cols * this.rows * 0.35) return true;
    if (this.insideFn) for (const c of t.corners) if (!this.insideFn(c[0], c[1])) return true;
    return false;
  }

  /**
   * Vertrouwen voor verdachte vlekken. Een briefje hangt doodstil; een hand of
   * gezicht dat 'stil' gehouden wordt trilt en deint, en zit vast aan een arm of
   * lijf dat zelf wordt afgekeurd. Pas als alle drie kloppen (stil, niet trillen,
   * geen lichaamsdeel ernaast) telt hij mee — en dat blijft zo zolang hij op zijn
   * plek blijft, ook als er later iemand naast komt staan. Verschuift hij, of komt er
   * ineens huid bij (een hand eroverheen), dan begint het opnieuw.
   *
   * De trilling wordt gemeten op het zachte midden (zie blobs): daar flikkeren
   * randcellen niet in door. Gemeten over 72 briefjes (4 kleuren, 2 maten, 3 standen,
   * 3 soorten licht) en 48 handen, vuisten, gezichten en onderarmen die 0,2–1 px
   * trillen: met 0,15 px twaalf metingen achter elkaar telt elk briefje na 1,2 s mee,
   * en lekt geen enkel lichaamsdeel. Briefjes zitten op 0,03–0,17 px, ook bij veel
   * cameraruis. Een vuist die roerloos tegen de muur rust terwijl de arm onzichtbaar
   * is, blijft niet van een briefje te onderscheiden.
   */
  earnTrust() {
    const gap = this.personGap * this.cell;
    const people = this.tracks.filter(t => !t.held && this.personLike(t));
    for (const t of this.tracks) {
      if (t.trusted || !this.disguise(t)) continue;
      if (!(t.stillT >= this.stillFor) || !(t.calmT >= this.calmFor)) continue;
      let near = false;
      for (const u of people) {
        if (u === t) continue;
        for (const p of t.corners) {
          for (const q of u.corners) if (Math.abs(p[0] - q[0]) < gap && Math.abs(p[1] - q[1]) < gap) { near = true; break; }
          if (near) break;
        }
        if (near) break;
      }
      if (!near) {
        t.trusted = true; t.trustSkin = t.skinFrac; t.trustShadow = t.shadowFrac; t.trustCells = t.cells;
        // Het anker op het rustige midden van de afgelopen tijd, niet op waar het stond
        // toen de hand nog in beeld was.
        if (Number.isFinite(t.jmx)) { t.ax = t.jmx; t.ay = t.jmy; }
        t.rax = t.rx; t.ray = t.ry;
        t.trustCorners = t.corners.map(c => [c[0], c[1]]);
      }
    }
  }

  // ---- volgen ---------------------------------------------------------------
  //
  // Ideeën uit SORT/ByteTrack/Norfair, teruggebracht tot wat hier echt glitches
  // wegnam (gemeten in test/tracking.mjs):
  //  - globale koppeling op afstand in plaats van spoor-voor-spoor, zodat een spoor
  //    nooit de vlek van zijn buurman steelt;
  //  - een voorspelde positie en een poort die met de grootte meeschaalt;
  //  - vasthouden in plaats van opslokken als twee voorwerpen even samensmelten;
  //  - een afgedekt voorwerp (hand ervoor) blijft staan, een weggehaald voorwerp
  //    verdwijnt snel;
  //  - een net verloren voorwerp dat op dezelfde plek terugkomt krijgt zijn oude
  //    identiteit terug.

  radiusPx(t) {
    let r = 0;
    for (let i = 0; i < NDIR; i++) r += t.sup[i];
    return Math.max(2, r / NDIR) * this.cell;
  }

  /** Welk deel van de cellen onder de laatste vorm is nog voorgrond? */
  coverage(t) { return this.coverageOf(t.corners); }

  /** Welk deel van (het kader om) deze omtrek krijgt nu ons eigen licht? */
  litFraction(corners) {
    const cell = this.cell, cols = this.cols, rows = this.rows, p = this.projLuma;
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const c of corners) {
      x0 = Math.min(x0, c[0]); y0 = Math.min(y0, c[1]);
      x1 = Math.max(x1, c[0]); y1 = Math.max(y1, c[1]);
    }
    const cx0 = Math.max(0, ((x0 / cell) | 0) - 1), cx1 = Math.min(cols - 1, ((x1 / cell) | 0) + 1);
    const cy0 = Math.max(0, ((y0 / cell) | 0) - 1), cy1 = Math.min(rows - 1, ((y1 / cell) | 0) + 1);
    let n = 0, lit = 0;
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) { n++; if (p[cy * cols + cx] > 20) lit++; }
    }
    return n ? lit / n : 0;
  }

  /**
   * Zacht midden: elke cel in een vast kader rond de vorige omtrek weegt mee naar hoe
   * zeker hij bij een voorwerp hoort (softW). Een randcel die aan en uit flikkert laat
   * het gewone midden verspringen, en een bal die over het briefje valt haalt er een
   * hap uit; hier schuift het maar een fractie. Zo is te zien of iets écht stilhangt.
   */
  softCentre(corners, fallback, selfK = 0) {
    const cell = this.cell, cols = this.cols, rows = this.rows, w = this.softW, own = this.owner;
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const c of corners) {
      x0 = Math.min(x0, c[0]); y0 = Math.min(y0, c[1]);
      x1 = Math.max(x1, c[0]); y1 = Math.max(y1, c[1]);
    }
    const cx0 = Math.max(0, ((x0 / cell) | 0) - 2), cx1 = Math.min(cols - 1, ((x1 / cell) | 0) + 2);
    const cy0 = Math.max(0, ((y0 / cell) | 0) - 2), cy1 = Math.min(rows - 1, ((y1 / cell) | 0) + 2);
    let sw = 0, sx = 0, sy = 0;
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const i = cy * cols + cx;
        // Een buurman (die er al een paar beelden is) die in het kader valt telt niet mee:
        // anders springt het midden zodra het kader net een rij van dat briefje meepakt.
        // Wat binnen de eigen omtrek ligt telt altijd: een grote vlek van iemand die
        // ernaast staat mag het briefje niet 'wegnemen'.
        if (selfK && own[i] && own[i] !== selfK && this.tracks[own[i] - 1] && this.tracks[own[i] - 1].age >= 3 &&
            !inConvex(corners, (cx + 0.5) * cell, (cy + 0.5) * cell)) continue;
        const k = w[i];
        sw += k; sx += k * cx; sy += k * cy;
      }
    }
    if (!(sw > 0)) return [fallback.cx, fallback.cy];
    return [(sx / sw + 0.5) * cell, (sy / sw + 0.5) * cell];
  }

  coverageOf(corners) {
    const cell = this.cell;
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const c of corners) {
      x0 = Math.min(x0, c[0]); y0 = Math.min(y0, c[1]);
      x1 = Math.max(x1, c[0]); y1 = Math.max(y1, c[1]);
    }
    let n = 0, on = 0;
    const cy0 = Math.max(0, (y0 / cell) | 0), cy1 = Math.min(this.rows - 1, (y1 / cell) | 0);
    const cx0 = Math.max(0, (x0 / cell) | 0), cx1 = Math.min(this.cols - 1, (x1 / cell) | 0);
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        if (!inConvex(corners, (cx + 0.5) * cell, (cy + 0.5) * cell)) continue;
        n++;
        if (this.mask[cy * this.cols + cx]) on++;
      }
    }
    return n ? on / n : 0;
  }

  /** Laatste goede vorm vasthouden; een bewegend voorwerp glijdt door op zijn snelheid. */
  holdTrack(t, dt = 0) {
    // Half verstopt door ons eigen licht (een regen van ballen)? Dan houden we de vorm
    // vast, maar het zachte midden ziet door dat licht heen: stilstand en trilling
    // blijven gewoon meetellen.
    if (t.lit && dt > 0) this.stillEvidence(t, this.softCentre(t.corners, t, t.ownK), dt, false, false);
    t.hold++; t.lost++; t.held = true;
    t.kvx *= 0.97; t.kvy *= 0.97;
    if (t.stillT >= this.stillFor) { t.kvx = 0; t.kvy = 0; }   // wat stilhangt, glijdt niet weg
    if (Math.hypot(t.kvx, t.kvy) > 0.4) {
      t.mx += t.kvx / this.cell; t.my += t.kvy / this.cell;
      t.cx = (t.mx + 0.5) * this.cell; t.cy = (t.my + 0.5) * this.cell;
      t.corners = polyFromSupport(t.mx, t.my, t.sup, t.ang, this.cell);
    }
    t.vx = t.kvx * 30; t.vy = t.kvy * 30;
  }

  /**
   * Hangt het stil, en trilt het niet? Gemeten op het zachte midden (zie softCentre),
   * met een anker: pas als het ruim een cel van zijn plek raakt begint de klok opnieuw.
   * Trilling is de spreiding van dat midden over de laatste metingen: een briefje ligt
   * op een paar honderdste pixel stil, een hand of hoofd dat 'stil' gehouden wordt
   * trilt en deint altijd iets.
   */
  stillEvidence(t, sc, dt, sprong, keepStill, raw = null) {
    const lim = 1.2 * this.cell;
    let moved = Math.hypot(sc[0] - t.ax, sc[1] - t.ay) > lim;
    // Een vertrouwd briefje verliest zijn vertrouwen niet omdat er iemand langsloopt of
    // een bal overheen valt: dan verschuift alleen het zachte midden. Pas als ook de
    // vlek zelf verschoven is (of er is geen eigen vlek), is het echt verplaatst.
    if (moved && t.trusted && !sprong) {
      if (!raw) return;                                  // vastgehouden: geen oordeel
      if (Math.hypot(raw[0] - t.rax, raw[1] - t.ray) <= lim) moved = false;
    }
    if (keepStill) {
      t.ax = sc[0]; t.ay = sc[1]; t.stillT += dt;
      if (raw) { t.rax = raw[0]; t.ray = raw[1]; }
    } else if (sprong || moved) {
      // Was het vertrouwd en kwam er alleen iets bij (het staat nog op zijn plek)? Dan
      // blijft het oude briefje zolang gewoon meetellen met zijn eigen, oude vorm —
      // zonder wat erbij kwam. Zo verdwijnt een briefje niet even als je er een
      // tweede tegenaan plakt, en wordt een hand erop nooit een obstakel.
      if (t.trusted && sprong && !t.fallback) t.fallback = (t.trustCorners || t.corners).map(c => [c[0], c[1]]);
      t.ax = sc[0]; t.ay = sc[1]; t.stillT = 0; t.trusted = false;
      if (raw) { t.rax = raw[0]; t.ray = raw[1]; }
    } else t.stillT += dt;
    // Venster en rust in tijd, niet in beelden: in een donkere kamer levert de camera
    // soms maar 15 beelden per seconde, en dan duurde alles twee keer zo lang.
    const hk = t.hn % JITTER_N;
    t.hx[hk] = sc[0]; t.hy[hk] = sc[1]; t.hn++;
    const W = Math.max(10, Math.min(JITTER_N, Math.round(this.jitterWindow / Math.max(dt, 1 / 60))));
    if (t.hn >= W) {
      let sx = 0, sy = 0, sxx = 0, syy = 0;
      for (let q = 0; q < W; q++) {
        const k = (t.hn - 1 - q) % JITTER_N;
        sx += t.hx[k]; sy += t.hy[k]; sxx += t.hx[k] * t.hx[k]; syy += t.hy[k] * t.hy[k];
      }
      const mx = sx / W, my = sy / W;
      t.jitter = Math.sqrt(Math.max(0, Math.max(sxx / W - mx * mx, syy / W - my * my)));
      t.jmx = mx; t.jmy = my;
    }
    // Aaneengesloten rustig: één toevallig kalm moment is niet genoeg.
    t.calmT = t.jitter <= this.jitterMax ? (t.calmT || 0) + dt : 0;
  }

  measureTrack(t, best, dt) {
    // Komt er ineens huid of schaduw bij (een hand die eroverheen gaat), dan is het
    // niet meer hetzelfde ding: stilstand en vertrouwen opnieuw verdienen.
    // Alleen een echte sprong omhoog telt, geen geruis rond een grens. En vergeleken
    // met hoe het eruitzag toen het vertrouwen verdiend werd: een hand die er
    // langzaam overheen schuift, groeit er per beeld maar een klein beetje bij.
    // Valt ons eigen licht erop (een bal, de score), dan zegt de vorm van de vlek
    // weinig: een donker briefje onder een felle bal lijkt voor de camera op kale muur
    // en valt deels weg. 'Ademen' en 'er komt huid bij' pauzeren dan even. Stilstand
    // en trilling niet: die meten we op het zachte midden, waar ons licht niet in
    // doorwerkt (zie softCentre).
    const lit = !!t.lit;
    const sc = this.softCentre(t.corners, best, t.ownK);
    let sprong = !lit && (best.skinFrac > 0.5 && best.skinFrac - t.skinFrac > 0.25)
      || (!lit && best.shadowFrac > 0.4 && best.shadowFrac - t.shadowFrac > 0.25)
      || (!lit && t.trusted && ((best.skinFrac > 0.5 && best.skinFrac - t.trustSkin > 0.25)
        || (best.shadowFrac > 0.4 && best.shadowFrac - t.trustShadow > 0.25)));
    // Flink gegroeid sinds het vertrouwen: wat is erbij gekomen? Een gewoon briefje
    // ertegenaan mag; iets huid- of schaduwkleurigs (een hand die erop ligt, ook als
    // het briefje zelf al bruin was) moet zijn eigen vertrouwen verdienen.
    if (t.trusted && !lit && !sprong && best.cells > t.trustCells * 1.35) {
      const n0 = t.trustCells, n1 = best.cells;
      const bijHuid = (best.skinFrac * n1 - t.trustSkin * n0) / (n1 - n0);
      const bijSchaduw = (best.shadowFrac * n1 - t.trustShadow * n0) / (n1 - n0);
      if (bijSchaduw > 0.4 || (this.skinFilter && bijHuid > 0.6)) sprong = true;
      else {
        t.trustCells = n1; t.trustSkin = best.skinFrac; t.trustShadow = best.shadowFrac;
        t.trustCorners = null;                          // de nieuwe vorm wordt straks de terugval
      }
    }
    let keepStill = false;
    if (t.adopt) {
      // Twee voorwerpen die blijvend tegen elkaar aan zitten zijn vanaf nu één
      // voorwerp. Dat is een bekende sprong in vorm en grootte, geen ademende omtrek:
      // opnieuw beginnen in plaats van het als mens te lezen. Wel een korte proeftijd,
      // zodat iets wat écht beweegt dat meteen weer laat zien.
      t.adopt = false;
      // Groeien is geen bewegen: ligt het oude anker binnen de nieuwe vorm, dan hangt
      // het oude briefje er gewoon nog — dan houdt het zijn stilstand.
      keepStill = !sprong && inConvex(best.hull, t.ax / this.cell - 0.5, t.ay / this.cell - 0.5);
      // (het midden van de nieuwe vorm wordt het nieuwe anker, zie hieronder)
      t.ang = best.ang; t.sup = Float32Array.from(best.sup);
      t.mx = best.mx; t.my = best.my;
      t.areaAvg = best.cells; t.hullAvg = polyArea(best.hull);
      t.wobble = 0; t.areaWobble = 0;
      t.personHold = Math.max(t.personHold, 12);
    }
    this.stillEvidence(t, sc, dt, sprong, keepStill, [best.cx, best.cy]);
    const pcx = t.cx, pcy = t.cy;
    // snelheid op het ruwe midden, alleen voor de voorspelling
    const steps = t.lost + 1;
    if (t.rx != null && !lit) {                         // onder ons licht is het midden vertekend
      t.kvx += ((best.cx - t.rx) / steps - t.kvx) * 0.35;
      t.kvy += ((best.cy - t.ry) / steps - t.kvy) * 0.35;
    }
    t.rx = best.cx; t.ry = best.cy; t.lost = 0; t.hold = 0; t.held = false;

    const moved = Math.hypot(best.cx - t.cx, best.cy - t.cy);
    const grew = Math.abs(best.cells - t.cells) / Math.max(1, t.cells);
    // Stilstaan telt: een neergezet voorwerp beweegt niet, een mens wel.
    t.stable = (moved < 2.6 && grew < 0.16) ? t.stable + 1 : 0;
    t.cells = best.cells; t.touchEdge = best.touchEdge;
    if (!lit) { t.shadowFrac = best.shadowFrac; t.skinFrac = best.skinFrac; }
    t.residentFrac = best.residentFrac;
    t.solidity = best.solidity; t.medStep = best.medStep;
    t.cls = best.cls;
    this.kindVote(t, best.kind);

    // Dode zone: kleine verschillen zijn ruis, grote zijn echte beweging.
    const k = moved < 1.6 ? 0.10 : moved < 5 ? 0.30 : 0.55;
    t.mx += (best.mx - t.mx) * k;
    t.my += (best.my - t.my) * k;

    // De hoek hoort bij het spoor. Hooguit een paar graden per frame, zodat een
    // omklappende as bij een bijna-vierkante vorm er nooit in sijpelt.
    if (best.ecc > 0.25) {
      let d = best.ang - t.ang;
      while (d > Math.PI / 2) d -= Math.PI;
      while (d < -Math.PI / 2) d += Math.PI;
      t.ang += Math.max(-0.12, Math.min(0.12, d * 0.25));
    }

    // Opnieuw opmeten in het assenstelsel van het spoor, zodat de steunafstanden
    // onderling vergelijkbaar blijven en je ze mag middelen.
    // Rond het eigen middelpunt van de vlek, niet rond de (naijlende) positie van het
    // spoor: anders lijkt een snel bewogen boek van vorm te veranderen, en dat leest
    // de mensentest als "ademen".
    const s = supportOf(best.hull, best.mx, best.my, t.ang, this.supTmp);

    // Vormvastheid: een voorwerp houdt zijn omtrek, een mens niet. De +6 houdt
    // kleine voorwerpen buiten schot, anders telt één cel ruis te zwaar.
    let rad = 0, dsum = 0;
    for (let i = 0; i < NDIR; i++) { rad += t.sup[i]; dsum += Math.abs(s[i] - t.sup[i]); }
    rad = Math.max(2, rad / NDIR);
    if (!lit) {
      t.wobble += ((dsum / NDIR) / (rad + 6) - t.wobble) * 0.14;
      t.areaWobble += (Math.abs(best.cells - t.areaAvg) / Math.max(1, t.areaAvg) - t.areaWobble) * 0.14;
      t.areaAvg += (best.cells - t.areaAvg) * 0.2;
      t.hullAvg += (polyArea(best.hull) - t.hullAvg) * 0.2;
    }

    for (let i = 0; i < NDIR; i++) {
      const d = s[i] - t.sup[i];
      t.sup[i] += d * (Math.abs(d) < 1.2 ? 0.12 : 0.36);
    }
    t.cx = (t.mx + 0.5) * this.cell;
    t.cy = (t.my + 0.5) * this.cell;
    t.corners = polyFromSupport(t.mx, t.my, t.sup, t.ang, this.cell);
    t.vx = dt > 0 ? (t.cx - pcx) / dt : 0;
    t.vy = dt > 0 ? (t.cy - pcy) / dt : 0;
    t.miss = 0; t.age++;
    // Vertrouwd en gegroeid met iets gewoons: de nieuwe vorm is voortaan de terugval.
    if (t.trusted && !t.trustCorners) t.trustCorners = t.corners.map(c => [c[0], c[1]]);
  }

  newTrack(b) {
    const t = {
      id: this.nextId++, cls: b.cls, cx: b.cx, cy: b.cy,
      mx: b.mx, my: b.my, ang: b.ang, sup: Float32Array.from(b.sup),
      corners: b.corners,
      vx: 0, vy: 0, miss: 0, age: 0, stable: 0,
      cells: b.cells, touchEdge: b.touchEdge,
      shadowFrac: b.shadowFrac, skinFrac: b.skinFrac,
      solidity: b.solidity, medStep: b.medStep,
      wobble: 0, areaWobble: 0, areaAvg: b.cells, rigid: false, personHold: 0,
      hullAvg: polyArea(b.hull), rx: b.cx, ry: b.cy, kvx: 0, kvy: 0,
      lost: 0, hold: 0, held: false,
      ax: b.cx, ay: b.cy, stillT: 0, adopt: false, residentFrac: b.residentFrac, trusted: false, fallback: null,
      hx: new Float32Array(JITTER_N), hy: new Float32Array(JITTER_N), hn: 0, jitter: Infinity,
      kind: null, kindCand: null, kindN: 0,
    };
    this.kindVote(t, b.kind);
    return t;
  }

  /**
   * Soort briefje met hysterese: een nieuwe soort (of 'geen soort') moet
   * kindFrames metingen achter elkaar winnen voordat t.kind wisselt. Een bal die
   * over een rood briefje valt, of een hand die er even voor zit, verandert het dus
   * niet. Metingen zonder oordeel (undefined) tellen niet en breken ook niets af.
   */
  kindVote(t, k) {
    if (k === undefined) return;
    if (k === t.kind) { t.kindCand = null; t.kindN = 0; return; }
    if (k === t.kindCand) t.kindN++;
    else { t.kindCand = k; t.kindN = 1; }
    if (t.kindN >= this.kindFrames) { t.kind = k; t.kindCand = null; t.kindN = 0; }
  }

  /** Voorspelde plek van een spoor: laatste meting plus snelheid keer gemiste frames. */
  predicted(t) {
    const n = t.lost + 1;
    const rx = t.rx == null ? t.cx : t.rx;
    const ry = t.ry == null ? t.cy : t.ry;
    return [rx + t.kvx * n, ry + t.kvy * n];
  }

  detect(dt) {
    if (!this.grab()) return [];
    if (this.mode === 'object') { this.buildOwners(); this.classifyObject(); } else this.classifyColor();
    const found = this.blobs(), cell = this.cell;
    for (const t of this.tracks) t.lit = this.litFraction(t.corners) > 0.15;
    const established = (t) => t.age >= 12 && t.rigid;

    // 1. alle kandidaatparen, met een poort die meeschaalt met grootte en snelheid
    const pairs = [];
    for (const t of this.tracks) {
      const n = t.lost + 1;
      const p = this.predicted(t);
      const gate = 0.8 * this.radiusPx(t) + 6 + 2 * Math.hypot(t.kvx, t.kvy) * n;
      const pcx = p[0] / cell - 0.5, pcy = p[1] / cell - 0.5;
      for (const b of found) {
        if (this.mode === 'color' && b.cls !== t.cls) continue;
        const d = Math.hypot(b.cx - p[0], b.cy - p[1]);
        // opgeslokt door een grotere vlek: het midden ligt erbinnen, maar ver van zijn zwaartepunt
        const viaHull = d >= gate && inConvex(b.hull, pcx, pcy);
        if (d < gate || viaHull) pairs.push({ d: d + (t.age < 3 ? 1e4 : 0), t, b, viaHull });
      }
    }
    // globaal: kortste afstanden eerst, zodat een spoor nooit de vlek van een buur steelt
    pairs.sort((a, b) => a.d - b.d);

    // een vlek die de middens van twee gevestigde voorwerpen bedekt is een samensmelting
    const shared = new Map();
    for (const { t, b } of pairs) {
      if (!established(t)) continue;
      const p = this.predicted(t);
      if (inConvex(b.hull, p[0] / cell - 0.5, p[1] / cell - 0.5)) shared.set(b, (shared.get(b) || 0) + 1);
    }

    const tDone = new Set(), bUse = new Map(), meas = new Map();
    for (const { t, b, viaHull } of pairs) {
      if (tDone.has(t)) continue;
      const ratio = b.cells / Math.max(1, t.areaAvg);
      // Samensmelting (de vlek is ineens veel groter) of gedeeltelijk afgedekt (veel
      // kleiner, er zit een hand of arm voor): in beide gevallen klopt de gemeten vorm
      // niet, dus houden we de laatste goede vast. Een star voorwerp verandert niet
      // zomaar van grootte.
      // Met hysterese: pas loslaten als het voorwerp weer (bijna) heel is. Anders gaat
      // de tracker meten terwijl het nog tevoorschijn komt, en dat groeien leest hij
      // als een vorm die ademt — oftewel een mens.
      const merged = viaHull || ratio > (t.held ? 1.25 : 1.6) || (shared.get(b) || 0) >= 2;
      const covered = ratio < (t.held ? 0.85 : 0.6);
      // Kleiner geworden: staat er een hand voor (dan is de rest van de oude vorm nog
      // voorgrond) of is er een stuk weggehaald (dan is het daar weer muur)? Bij het
      // tweede niet 90 beelden een spookvorm vasthouden.
      if (covered && established(t)) t.bare = (!t.lit && this.coverage(t) < 0.75) ? (t.bare || 0) + 1 : 0;
      else t.bare = 0;
      if (established(t) && ((merged && t.hold < 45) || (covered && t.hold < 90 && t.bare < 6))) {
        if (bUse.get(b) === 'meas') continue;
        tDone.add(t); bUse.set(b, 'hold'); this.holdTrack(t, dt);
        continue;
      }
      if (bUse.has(b)) continue;
      tDone.add(t); bUse.set(b, 'meas'); meas.set(t, b);
      // Vasthouden is op, maar de vlek is nog steeds veel groter of kleiner: dat is
      // blijvend. De nieuwe vorm is vanaf nu de vorm.
      if (t.held && (merged || covered)) t.adopt = true;
    }
    for (const [t, b] of meas) this.measureTrack(t, b, dt);

    // 2. sporen zonder vlek: afgedekt (nog voorgrond) of weggehaald (weer muur)?
    for (const t of this.tracks) {
      if (tDone.has(t)) continue;
      if (established(t) && t.hold < 90 && this.coverage(t) > 0.5) this.holdTrack(t, dt);
      else { t.miss++; t.lost++; t.held = false; t.vx = 0; t.vy = 0; }
    }

    // 3. net verdwenen voorwerpen even onthouden, zodat ze hun identiteit terugkrijgen
    this.lostTracks = (this.lostTracks || []).filter(t => ++t.gone < 90);
    this.tracks = this.tracks.filter(t => {
      if (t.miss < (t.age < 3 ? 1 : 6)) return true;     // nieuwe sporen sterven bij hun eerste misser
      if (established(t)) { t.gone = 0; this.lostTracks.push(t); }
      return false;
    });

    // 4. nieuwe sporen — maar niet op een vastgehouden voorwerp (dat is het zichtbare deel ervan)
    for (const b of found) {
      if (bUse.has(b)) continue;
      if (this.tracks.some(t => t.age >= 12 && t.held && inConvex(t.corners, b.cx, b.cy))) continue;
      const li = this.lostTracks.findIndex(t => inConvex(t.corners, b.cx, b.cy) &&
        b.cells > 0.6 * t.areaAvg && b.cells < 1.6 * t.areaAvg);
      if (li >= 0) {
        const t = this.lostTracks.splice(li, 1)[0];
        t.miss = 0; t.lost = 0; t.hold = 0; t.held = false;
        t.rx = b.cx; t.ry = b.cy; t.kvx = t.kvy = 0;
        t.wobble = 0; t.areaWobble = 0; t.personHold = 0;   // het is het oude voorwerp: vertrouwen
        // ... maar of het huid- of schaduwkleurige ding er nog hetzelfde is, weten we niet
        // (een hand die een bruin briefje eraf trekt): dat opnieuw laten verdienen.
        t.trusted = false; t.fallback = null; t.trustCorners = null; t.stillT = 0; t.calmT = 0;
        t.hn = 0; t.jitter = Infinity; t.ax = b.cx; t.ay = b.cy;
        this.tracks.push(t);
        this.measureTrack(t, b, dt);
        continue;
      }
      this.tracks.push(this.newTrack(b));
    }

    // 5. mens of voorwerp — alleen op echte metingen, niet op vastgehouden frames
    for (const t of this.tracks) {
      if (t.held) continue;
      if (t.age < 12) { t.rigid = false; continue; }
      const soft = t.wobble < this.wobbleMax && t.areaWobble < this.wobbleMax * 1.3;
      // Sneller herstellen dan bestempelen: als je een voorwerp neerzet en je hand
      // weghaalt, moet het binnen een kwart seconde weer meedoen.
      t.personHold = soft ? Math.max(0, t.personHold - 3) : 24;
      t.rigid = t.personHold === 0;
    }
    if (this.mode === 'object') {
      this.earnTrust();
      // De oude vorm geldt alleen zolang daar echt nog iets hangt.
      for (const t of this.tracks) {
        if (t.fallback && (t.trusted || this.coverageOf(t.fallback) < 0.75)) t.fallback = null;
      }
    }
    // Een paar frames gezien zijn voordat iets meetelt, anders flikkert ruis erin.
    return this.tracks.filter(t => t.age >= 2);
  }

  /**
   * Gemiddelde helderheid (0-255) van de cellen waarvoor inside(x, y) waar is — of van
   * het hele beeld. Om te meten of de camera genoeg ziet.
   */
  meanLuma(inside) {
    let sum = 0, n = 0;
    for (let cy = 0; cy < this.rows; cy++) {
      for (let cx = 0; cx < this.cols; cx++) {
        if (inside && !inside((cx + 0.5) * this.cell, (cy + 0.5) * this.cell)) continue;
        sum += this.cl[cy * this.cols + cx]; n++;
      }
    }
    return n ? sum / n : 0;
  }

  /** Helderheid per cel, voor de automatische kalibratie. */
  lumaSnapshot() {
    return Float32Array.from(this.cl);
  }
}
