// Gedeelde hulp voor de tests: een Vision zonder camera, en een simpele weergave
// van een muur met voorwerpen erop. Onderaan: een nagebouwde kamer met licht en een
// camera die zijn belichting bijstelt (voor omgeving.mjs en muurwacht.mjs).

globalThis.document = {
  createElement: () => ({
    getContext: () => ({ createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }) }),
  }),
};
export const { Vision, inConvex } = await import('../js/vision.js');
export const { Game, normalizePoly } = await import('../js/game.js');

export function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

export const WALL = [176, 174, 170];

/** Een Vision die zijn beeld niet van een camera haalt maar van `feed(pixels)`. */
export function makeVision(vw = 320, vh = 240, tune = {}) {
  const v = new Vision();
  v.vw = vw; v.vh = vh;
  v.allocate();
  v.maskImage = { data: new Uint8ClampedArray(v.cols * v.rows * 4) };
  v.mode = 'object'; v.ready = true;
  v.minCells = 8;
  v.objThresh = 70 - 60 * 0.56;              // regelaar op 60, zoals standaard
  v.skinFilter = true;
  v.wobbleMax = 0.19 - 0.5 * 0.15;           // mensenfilter op 50, zoals standaard
  Object.assign(v, tune);
  v.grab = () => true;
  return v;
}

/** scene(x, y) geeft een kleur, of null voor de kale muur. */
export function paint(v, scene, r, noise = 8) {
  const px = new Uint8ClampedArray(v.vw * v.vh * 4);
  for (let y = 0; y < v.vh; y++) {
    for (let x = 0; x < v.vw; x++) {
      const c = scene(x, y) || WALL, i = (y * v.vw + x) * 4, n = (r() - 0.5) * noise;
      px[i] = c[0] + n; px[i + 1] = c[1] + n; px[i + 2] = c[2] + n; px[i + 3] = 255;
    }
  }
  v.data = px;
  v.sampleCells();
}

export function learnWall(v, r) {
  v.beginBackground();
  for (let i = 0; i < 10; i++) { paint(v, () => null, r); v.addBackgroundFrame(); }
  v.endBackground();
}

export const rect = (x0, y0, w, h, col) => (x, y) =>
  (x >= x0 && x < x0 + w && y >= y0 && y < y0 + h) ? col : null;

export const layer = (...fs) => (x, y) => {
  for (const f of fs) { const c = f && f(x, y); if (c) return c; }
  return null;
};

export function area(p) {
  let a = 0;
  for (let i = 0; i < p.length; i++) {
    const q = p[(i + 1) % p.length];
    a += p[i][0] * q[1] - q[0] * p[i][1];
  }
  return Math.abs(a) / 2;
}

/** De afkeurregels uit main.js buildObstacles, zonder de beamer-afbeelding. */
export function oordeel(v, t) {
  if (!t.trusted && t.fallback) return 'ok';
  const vermomd = v.disguise(t);
  if (vermomd && !t.trusted) return vermomd;
  if (t.touchEdge) return 'rand';
  if (t.cells > v.cols * v.rows * 0.35) return 'groot';
  if (t.solidity < 0.72) return 'vorm';
  if (t.age < 12) return 'wacht';
  if (!t.rigid) return 'mens';
  return 'ok';
}

let fouten = 0;
export function check(naam, ok, extra = '') {
  console.log((ok ? 'ok   ' : 'FOUT ') + naam.padEnd(52) + extra);
  if (!ok) fouten++;
}
export function klaar() {
  console.log('');
  console.log(fouten ? fouten + ' test(s) mislukt' : 'alles goed');
  process.exitCode = fouten ? 1 : 0;
}

// ---------------------------------------------------------------- een nagebouwde kamer
//
// Voor test/omgeving.mjs en test/muurwacht.mjs. Wat de camera ziet = hoe sterk iets
// terugkaatst × hoeveel licht erop valt × de belichting van de camera. Het licht komt van de
// kamer (een lamp aan het plafond, een raam met een gordijn), een lamp die op de muur gericht
// is, en de beamer (de muurverlichting en zijn ballen). De camera stelt zijn belichting vanzelf
// bij, zoals een webcam: in het donker versterkt hij, en dan krijg je meer korrel (ook
// vlekkerige kleurkorrel) en grauwere kleuren. Precies daardoor ziet een camera in het donker
// de kleuren slecht.

export const KVW = 320, KVH = 240;
export const KP = { x0: 30, y0: 22, x1: 290, y1: 218 };      // beamervlak in werkpixels
export const inKP = (x, y) => x >= KP.x0 && x < KP.x1 && y >= KP.y0 && y < KP.y1;
export const kamerUV = (x, y) => [(x - KP.x0) / (KP.x1 - KP.x0), (y - KP.y0) / (KP.y1 - KP.y0)];

// Hoe sterk een briefje elke kleur terugkaatst (0..1). De muur kaatst 0,72.
export const KLEUREN = {
  rood: [0.80, 0.16, 0.20], groen: [0.30, 0.64, 0.28], blauw: [0.20, 0.42, 0.80],
  geel: [0.86, 0.78, 0.30], oranje: [0.92, 0.50, 0.14], roze: [0.94, 0.46, 0.66],
  wit: [0.92, 0.91, 0.88], bruin: [0.46, 0.32, 0.22], grijs: [0.44, 0.44, 0.44],
  zwart: [0.10, 0.10, 0.11], kraft: [0.64, 0.49, 0.32], zalm: [0.94, 0.58, 0.50],
};
export const SOORT = { rood: 'trampoline', groen: 'booster', blauw: 'breek' };
const HUID_K = [0.62, 0.44, 0.34], SHIRT_K = [0.20, 0.22, 0.30];
// Een vaste voorraad normaal verdeelde ruis (gemiddeld 0, spreiding 1), steeds vanaf een andere plek gelezen.
const NORMAAL = (() => {
  const r = rng(77), a = new Float32Array(1 << 18);
  for (let i = 0; i < a.length; i++) a[i] = (r() + r() + r() - 1.5) * 2;
  return a;
})();

export class Kamer {
  constructor(seed = 1) {
    this.r = rng(seed);
    this.licht = 1;          // het kamerlicht (1 = een gewone verlichte kamer, 0,01 = donker)
    this.fill = 0;           // muurverlichting van de beamer, 0..1
    this.beamer = 0.9;       // vol wit van de beamer, in dezelfde eenheid als het kamerlicht
    this.lamp = null;        // een lamp op de muur: { x, y, rx, ry, sterk }
    this.gordijn = 0;        // 0 = dicht; 1 = open: daglicht van links, aflopend naar rechts
    this.briefjes = [];      // { x, y, w, h, c: [r, g, b] } (terugkaatsing, zie KLEUREN)
    this.mensen = [];        // { x, top, w, huid: bool }: een lijf tot onderaan het beeld
    this.ballen = [];        // [x, y]: een bal van de beamer (vol wit, straal 5 px)
    this.schaduw = null;     // { x, y, w, h, k }: een vaste slagschaduw (k = hoeveel licht er overblijft)
    this.E = 0.62;           // belichting van de camera
    this.Emax = 6;           // verder kan hij niet versterken
    this.doel = 110;         // de automatische belichting mikt op deze helderheid
    this.ruis0 = 1.2;        // korrel bij gewone belichting (grijswaarden)
    this.vast = false;       // belichting vastgezet
    // Het licht van de beamer flakkert een klein beetje van kleur, per beeld anders. In een
    // verlichte kamer valt dat weg, in het donker is het al het licht.
    this.flakker = 0.02;
    this.tint = [1, 1, 1];
    // De witbalans van de camera, per kleur. In het donker is het licht van de beamer bijna
    // al het licht, en stelt de camera zijn witbalans bij op wat er geprojecteerd wordt (het
    // oranje van de score, de groene bak): dan verschuiven alle kleuren tegen de geleerde muur.
    this.wb = [1, 1, 1];
    // De muur: licht grijs, iets warm, met een zachte structuur en een voeg.
    const w = this.muur = new Float32Array(KVW * KVH * 3);
    for (let y = 0; y < KVH; y++) {
      for (let x = 0; x < KVW; x++) {
        let v = 0.72 + Math.sin(x * 0.07) * 0.012 + Math.cos(y * 0.11) * 0.009;
        if (Math.abs((y % 61) - 30) < 1) v -= 0.06;
        const i = (y * KVW + x) * 3;
        w[i] = v * 1.01; w[i + 1] = v; w[i + 2] = v * 0.97;
      }
    }
    this.px = new Uint8ClampedArray(KVW * KVH * 4);
  }

  /** Hoeveel licht er op (x, y) valt, zonder de beamer. */
  kamerlicht(x, y) {
    let a = this.licht * (1 + this.gordijn * 2.2 * Math.max(0, 1 - x / (KVW * 0.8)));
    if (this.lamp) {
      const l = this.lamp, dx = (x - l.x) / l.rx, dy = (y - l.y) / l.ry;
      a += l.sterk * Math.exp(-(dx * dx + dy * dy));
    }
    if (this.schaduw) {
      const s = this.schaduw;
      if (x >= s.x && x < s.x + s.w && y >= s.y && y < s.y + s.h) a *= s.k;
    }
    return a;
  }

  /** Hoe sterk elke pixel terugkaatst: de muur met de briefjes erop (bewaard tot die veranderen). */
  reflectie() {
    const sleutel = JSON.stringify(this.briefjes);
    if (this.reflSleutel === sleutel) return this.refl;
    const W = this.muur, refl = this.refl || (this.refl = new Float32Array(KVW * KVH * 3));
    refl.set(W);
    for (const b of this.briefjes) {
      if (!b) continue;
      for (let y = Math.max(0, b.y); y < Math.min(KVH, b.y + b.h); y++) {
        for (let x = Math.max(0, b.x); x < Math.min(KVW, b.x + b.w); x++) {
          const i = (y * KVW + x) * 3;
          refl[i] = b.c[0]; refl[i + 1] = b.c[1]; refl[i + 2] = b.c[2];
        }
      }
    }
    this.reflSleutel = sleutel;
    return refl;
  }

  /** Het licht van de kamer op elke pixel (zie kamerlicht), bewaard tot het verandert. */
  lichtveld() {
    const sleutel = JSON.stringify([this.licht, this.gordijn, this.lamp, this.schaduw]);
    if (this.veldSleutel === sleutel) return this.veld;
    const veld = this.veld || (this.veld = new Float32Array(KVW * KVH));
    for (let y = 0; y < KVH; y++) for (let x = 0; x < KVW; x++) veld[y * KVW + x] = this.kamerlicht(x, y);
    this.veldSleutel = sleutel;
    return veld;
  }

  /**
   * Een nieuw camerabeeld in v (een Vision zonder camera, zie makeVision). Alleen de pixels die
   * de herkenning leest (vier per cel, zie vision.sampleCells): dat scheelt een hoop rekenwerk.
   */
  film(v) {
    const r = this.r, px = this.px, cell = v.cell, cols = v.cols, rows = v.rows;
    const o1 = cell >> 2, o2 = cell - 1 - o1;
    const refl = this.reflectie(), veld = this.lichtveld();
    const tint = this.tint, fl = this.flakker;
    for (let c = 0; c < 3; c++) tint[c] = 1 + (r() * 2 - 1) * fl;
    // Versterken in het donker: meer korrel, vlekkerige kleurkorrel (de ruisfilter van een
    // webcam smeert die uit tot vlekjes) en grauwere kleuren.
    const E = this.E, sig = this.ruis0 * Math.pow(Math.max(1, E), 0.8);
    const vlekSig = sig * 0.9 * Math.max(0, E - 1.5);
    const grauw = 1 / (1 + 0.1 * Math.max(0, E - 1.5));
    const B4 = 4, bc = Math.ceil(KVW / B4), br = Math.ceil(KVH / B4);
    if (!this.vlek || this.vlek.length !== bc * br * 2) this.vlek = new Float32Array(bc * br * 2);
    const vlek = this.vlek, N = NORMAAL, M = NORMAAL.length - 1;
    let o = (r() * NORMAAL.length) | 0;
    for (let k = 0; k < bc * br; k++) { vlek[k * 2] = N[o++ & M] * vlekSig; vlek[k * 2 + 1] = N[o++ & M] * vlekSig; }
    const k255 = 255 * E, wb = this.wb, bm = this.beamer;
    const mensen = this.mensen, ballen = this.ballen;
    let som = 0, nSom = 0;
    for (let cy = 0; cy < rows; cy++) {
      for (let cx = 0; cx < cols; cx++) {
        for (let q = 0; q < 4; q++) {
          const x = cx * cell + ((q & 1) ? o2 : o1), y = cy * cell + ((q >> 1) ? o2 : o1);
          const p = y * KVW + x, i = p * 3;
          let c0 = refl[i], c1 = refl[i + 1], c2 = refl[i + 2];
          for (let j = 0; j < mensen.length; j++) {
            const m = mensen[j];
            if (y >= m.top && Math.abs(x - m.x) < m.w + Math.sin(y * 0.2 + m.x * 0.1) * 2) {
              const c = y < m.top + 24 ? HUID_K : (m.shirt || SHIRT_K);
              c0 = c[0]; c1 = c[1]; c2 = c[2];
            }
          }
          const I = veld[p];
          let Bl = 0;
          if (inKP(x, y)) {
            let f = this.fill;
            for (let j = 0; j < ballen.length; j++) {
              const dx = x - ballen[j][0], dy = y - ballen[j][1];
              if (dx * dx + dy * dy < 25) { f = 1; break; }
            }
            Bl = f * bm;
          }
          // (een voorwerp vóór de muur krijgt hetzelfde licht als de muur erachter)
          const r0 = c0 * (I + Bl * tint[0]) * k255 * wb[0];
          const r1 = c1 * (I + Bl * tint[1]) * k255 * wb[1];
          const r2 = c2 * (I + Bl * tint[2]) * k255 * wb[2];
          const l = 0.299 * r0 + 0.587 * r1 + 0.114 * r2;
          if ((cx & 3) === 0 && (cy & 3) === 0 && q === 0) { som += l; nSom++; }
          const kb = ((y >> 2) * bc + (x >> 2)) * 2, n = N[o++ & M] * sig, a = sig * 0.4, u = p * 4;
          px[u] = l + (r0 - l) * grauw + vlek[kb] + n + N[o++ & M] * a;
          px[u + 1] = l + (r1 - l) * grauw + n + N[o++ & M] * a;
          px[u + 2] = l + (r2 - l) * grauw + vlek[kb + 1] + n + N[o++ & M] * a;
          px[u + 3] = 255;
        }
      }
    }
    // Automatische belichting, voor het volgende beeld (zoals een echte webcam: iets traag).
    if (!this.vast && nSom) {
      const gem = som / nSom;
      const wil = Math.min(this.Emax, Math.max(0.2, this.E * this.doel / Math.max(1, gem)));
      this.E += (wil - this.E) * 0.25;
    }
    v.data = px;
    v.sampleCells();
  }

  /** Zo lang beelden maken dat de automatische belichting gewend is (zonder herkenning). */
  wen(v, n = 40) { for (let i = 0; i < n; i++) this.film(v); }
}

/** Een Vision voor deze kamer: het beamervlak is bekend, net als in main.js. */
export function kamerVision(tune = {}) {
  const v = makeVision(KVW, KVH, tune);
  v.insideFn = inKP;
  return v;
}

/** De muur leren zoals main.js: dertig beelden (de camera is al gewend). */
export function leerMuur(v, kamer) {
  v.beginBackground();
  for (let i = 0; i < 30; i++) { kamer.film(v); v.addBackgroundFrame(); }
  v.endBackground();
}

/** De lichtvoorspelling voor de ballen (zoals updateProjectionMask in main.js, zonder lichtmodel). */
const PW = 192, PH = 144;
const projBuf = new Float32Array(PW * PH);
export function voorspel(v, ballen) {
  projBuf.fill(0);
  for (const [bx, by] of ballen) {
    const [u, w] = kamerUV(bx, by), px = u * PW, py = w * PH, rr = 6 * PW / (KP.x1 - KP.x0);
    for (let yy = Math.floor(py - rr); yy <= py + rr; yy++) {
      for (let xx = Math.floor(px - rr); xx <= px + rr; xx++) {
        if (xx >= 0 && yy >= 0 && xx < PW && yy < PH && (xx - px) ** 2 + (yy - py) ** 2 < rr * rr) projBuf[yy * PW + xx] = 200;
      }
    }
  }
  v.setProjection(projBuf, PW, PH, kamerUV);
}

/** Zoveel cellen liggen op het beamervlak (zie projCells in main.js). */
export function projCellen(v) {
  if (v.kamerProjCellen) return v.kamerProjCellen;
  let n = 0;
  for (let cy = 0; cy < v.rows; cy++) for (let cx = 0; cx < v.cols; cx++) if (inKP((cx + 0.5) * v.cell, (cy + 0.5) * v.cell)) n++;
  return (v.kamerProjCellen = n);
}

/** Het oordeel van main.js (buildObstacles) over een spoor, als code: 'telt', 'wacht', of waarom niet. */
export function kamerReden(v, t) {
  if (!t.trusted && t.fallback) return 'telt';
  const vermomd = v.disguise(t);
  if (vermomd && !t.trusted) return vermomd;
  if (t.touchEdge) return 'rand';
  if (t.cells > projCellen(v) * 0.35) return 'groot';
  for (const c of t.corners) if (!inKP(c[0], c[1])) return 'buiten';
  if (t.solidity < 0.72) return 'vorm';
  if (t.age < 12) return 'wacht';
  if (!t.rigid) return 'mens';
  return 'telt';
}
