// Gedeelde hulp voor de tests: een Vision zonder camera, en een simpele weergave
// van een muur met voorwerpen erop.

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
