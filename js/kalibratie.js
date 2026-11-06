// Nauwkeurige kalibratie: een raster van stippen, één voor één geprojecteerd, en daar
// een lensvertekening (k1 en k2, rond het midden van het camerabeeld) plus homografie
// doorheen gepast. Een groothoekwebcam buigt rechte lijnen krom; met alleen vier
// punten zat het beamervlak daardoor aan de randen en in de hoeken ernaast.
import { applyH, invertH } from './homography.js';

// De lens hoort bij een homografie: wie app.H verwisselt (muur/scherm), neemt de
// lens vanzelf mee. Oude opgeslagen kalibraties hebben geen lens en blijven werken.
const KAL_LENZEN = new WeakMap();

export function kalZetLens(H, lens) {
  if (!H) return;
  const k1 = lens && Number.isFinite(lens.k1) ? lens.k1 : 0, k2 = lens && Number.isFinite(lens.k2) ? lens.k2 : 0;
  if (k1 || k2) KAL_LENZEN.set(H, { k1, k2, ar: (lens && lens.ar) || 4 / 3 });
  else KAL_LENZEN.delete(H);
}

export function kalLensVan(H) {
  return (H && KAL_LENZEN.get(H)) || null;
}

/** Camerabeeld (0..1, met lensvertekening) naar het rechte, onvertekende beeld. */
export function kalOntvorm(L, x, y) {
  if (!L || !(L.k1 || L.k2)) return [x, y];
  const ar = L.ar || 4 / 3, k2 = L.k2 || 0;
  const dx = (x - 0.5) * ar, dy = y - 0.5, r2 = dx * dx + dy * dy;
  const f = 1 + L.k1 * r2 + k2 * r2 * r2;
  return [0.5 + dx * f / ar, 0.5 + dy * f];
}

/** En terug: de straal r zo zoeken dat r(1 + k1·r² + k2·r⁴) de gewenste straal geeft. */
export function kalVervorm(L, x, y) {
  if (!L || !(L.k1 || L.k2)) return [x, y];
  const ar = L.ar || 4 / 3, k2 = L.k2 || 0;
  const ux = (x - 0.5) * ar, uy = y - 0.5;
  const ru = Math.hypot(ux, uy);
  if (ru < 1e-9) return [x, y];
  let r = ru;
  for (let i = 0; i < 12; i++) {
    const r2 = r * r;
    const f = r * (1 + L.k1 * r2 + k2 * r2 * r2) - ru, df = 1 + 3 * L.k1 * r2 + 5 * k2 * r2 * r2;
    if (Math.abs(df) < 1e-6) break;
    const nr = r - f / df;
    if (!(nr > 0)) break;
    if (Math.abs(nr - r) < 1e-10) { r = nr; break; }
    r = nr;
  }
  const s = r / ru;
  return [0.5 + ux * s / ar, 0.5 + uy * s];
}

/** De ene afbeelding camera -> beamervlak (beide 0..1), mét lens als die er is. */
export function kalNaarBeamer(H, x, y) {
  const p = kalOntvorm(kalLensVan(H), x, y);
  return applyH(H, p[0], p[1]);
}

/** En beamervlak -> camera. Hinv is invertH(H). */
export function kalNaarCamera(H, Hinv, u, v) {
  const p = applyH(Hinv, u, v);
  return kalVervorm(kalLensVan(H), p[0], p[1]);
}

// ---------------------------------------------------------------- passen

function kalLos(A, b) {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-14) return null;
    [M[c], M[p]] = [M[p], M[c]];
    const piv = M[c][c];
    for (let k = c; k <= n; k++) M[c][k] /= piv;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c];
      if (!f) continue;
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  return M.map(r => r[n]);
}

/**
 * Homografie door N >= 4 punten, kleinste kwadraten. Twee keer herwogen met de noemer,
 * zodat de fout in beamerpixels telt en niet een algebraïsche bijfout.
 */
export function kalHomografieLS(src, dst) {
  if (src.length < 4) return null;
  let H = null;
  for (let it = 0; it < 3; it++) {
    const AtA = Array.from({ length: 8 }, () => new Array(8).fill(0)), Atb = new Array(8).fill(0);
    for (let i = 0; i < src.length; i++) {
      const [x, y] = src[i], [u, v] = dst[i];
      let w = 1;
      if (H) { const d = H[6] * x + H[7] * y + 1; w = Math.abs(d) > 1e-6 ? 1 / d : 1; }
      const rows = [[x, y, 1, 0, 0, 0, -u * x, -u * y, u], [0, 0, 0, x, y, 1, -v * x, -v * y, v]];
      for (const r of rows) {
        for (let a = 0; a < 8; a++) {
          const ra = r[a] * w;
          if (!ra) continue;
          Atb[a] += ra * r[8] * w;
          for (let b = 0; b < 8; b++) AtA[a][b] += ra * r[b] * w;
        }
      }
    }
    const h = kalLos(AtA, Atb);
    if (!h) return H;
    H = [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
  }
  return H;
}

function kalFouten(H, L, cam, proj) {
  return cam.map((c, i) => {
    const p = kalOntvorm(L, c[0], c[1]);
    const q = applyH(H, p[0], p[1]);
    return Math.hypot(q[0] - proj[i][0], q[1] - proj[i][1]);
  });
}

/** Kleinste waarde van kost(x) tussen lo en hi: eerst grof, dan gulden snede. */
function kalMinimum(kost, lo, hi, stap, rondes) {
  let best = null;
  for (let x = lo; x <= hi + 1e-9; x += stap) { const r = kost(x); if (!best || r.e < best.e) best = r; }
  let a = best.x - stap, b = best.x + stap;
  const g = (Math.sqrt(5) - 1) / 2;
  let c = b - g * (b - a), d = a + g * (b - a), fc = kost(c), fd = kost(d);
  for (let i = 0; i < rondes; i++) {
    if (fc.e < fd.e) { b = d; d = c; fd = fc; c = b - g * (b - a); fc = kost(c); }
    else { a = c; c = d; fc = fd; d = a + g * (b - a); fd = kost(d); }
  }
  for (const r of [fc, fd]) if (r.e < best.e) best = r;
  return best;
}

function kalPasK(cam, proj, ar, metK2) {
  const kost = (k1, k2) => {
    const L = { k1, k2, ar };
    const H = kalHomografieLS(cam.map(c => kalOntvorm(L, c[0], c[1])), proj);
    if (!H) return { e: Infinity, H: null, k1, k2 };
    const f = kalFouten(H, L, cam, proj);
    return { e: f.reduce((s, v) => s + v * v, 0), H, k1, k2 };
  };
  const binnen = (k2) => { const r = kalMinimum(x => ({ ...kost(x, k2), x }), -0.6, 0.6, 0.1, 22); r.x = k2; return r; };
  // k2 alleen met genoeg stippen: anders past hij ruis in plaats van de lens
  return metK2 ? kalMinimum(binnen, -0.4, 0.4, 0.1, 16) : binnen(0);
}

/**
 * Robuust passen: lens (k1) + homografie door alle gemeten stippen. Een stip die er ver
 * naast ligt (iemand liep erdoor, een weerspiegeling) gaat eruit, één voor één, de
 * slechtste eerst. cam in 0..1 camerabeeld, proj in 0..1 beamervlak, ar = breedte/hoogte
 * van het camerabeeld. Geeft { H, lens, fouten, gebruikt } of null.
 */
export function kalPas(cam, proj, ar, opts = {}) {
  const minPunten = opts.minPunten || 8;
  const grens = opts.grens || 0.003;          // ~4 px op 1280 breed
  let idx = cam.map((_, i) => i);
  for (;;) {
    if (idx.length < minPunten) return null;
    const c = idx.map(i => cam[i]), p = idx.map(i => proj[i]);
    const r = kalPasK(c, p, ar, idx.length >= 12);
    if (!r.H) return null;
    const L = { k1: r.k1, k2: r.k2, ar };
    const f = kalFouten(r.H, L, c, p);
    const med = [...f].sort((x, y) => x - y)[f.length >> 1];
    let slechtst = 0;
    for (let i = 1; i < f.length; i++) if (f[i] > f[slechtst]) slechtst = i;
    if (f[slechtst] > Math.max(grens, med * 4) && idx.length > minPunten) { idx.splice(slechtst, 1); continue; }
    return { H: r.H, lens: Math.abs(r.k1) > 1e-4 || Math.abs(r.k2) > 1e-4 ? L : null, fouten: f, gebruikt: idx };
  }
}

// ---------------------------------------------------------------- meten

/** Waar de stippen komen: 5×4 over het hele vlak, tot vlak bij de randen. */
export const KAL_RASTER = (() => {
  const us = [0.04, 0.27, 0.5, 0.73, 0.96], vs = [0.06, 0.35, 0.65, 0.94], out = [];
  for (const v of vs) for (const u of us) out.push([u, v]);
  return out;
})();
/** Vier controlestippen die niet meedoen met passen: vlak bij de hoeken. */
export const KAL_CONTROLE = [[0.12, 0.13], [0.88, 0.13], [0.88, 0.87], [0.12, 0.87], [0.5, 0.5]];

function kalLuma(data, n) {
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
  return out;
}

/** Zwaartepunt van wat er feller is dan de zwarte referentie, binnen een venster (werkpixels). */
function kalZwaartepunt(lum, ref, vw, vh, cx, cy, half) {
  const x0 = Math.max(0, Math.floor(cx - half)), x1 = Math.min(vw - 1, Math.ceil(cx + half));
  const y0 = Math.max(0, Math.floor(cy - half)), y1 = Math.min(vh - 1, Math.ceil(cy + half));
  if (x1 - x0 < 4 || y1 - y0 < 4) return null;
  let max = 0, som = 0;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const d = lum[y * vw + x] - ref[y * vw + x];
    if (d > max) max = d;
    som += d;
  }
  const thr = max * 0.5;
  let sx = 0, sy = 0, sw = 0, rand = 0, n = 0;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const d = lum[y * vw + x] - ref[y * vw + x] - thr;
    if (d <= 0) continue;
    sx += x * d; sy += y * d; sw += d; n++;
    if (x === x0 || x === x1 || y === y0 || y === y1) rand += d;
  }
  if (!sw) return null;
  return { x: sx / sw + 0.5, y: sy / sw + 0.5, max, som, n, rand: rand / sw };
}

/**
 * Meet één stip: wacht tot de camera hem echt laat zien (vertraging van 50–300 ms is
 * normaal) en tot twee opeenvolgende, verschillende camerabeelden hetzelfde zeggen.
 */
async function kalMeetStip(o, ref, verwacht, half, settle) {
  const { vision, sleep } = o;
  const vw = vision.vw, vh = vision.vh, n = vw * vh;
  let vorige = null, gelijk = 0, laatsteSom = NaN;
  const eind = Date.now() + settle;
  let cx = verwacht[0], cy = verwacht[1];
  while (Date.now() < eind) {
    if (o.afbreken && o.afbreken()) return null;
    await sleep(30);
    if (!vision.grab()) continue;
    const lum = kalLuma(vision.data, n);
    const z = kalZwaartepunt(lum, ref, vw, vh, cx, cy, half);
    if (!z || z.som === laatsteSom) continue;            // nog hetzelfde camerabeeld
    laatsteSom = z.som;
    if (z.max < o.minContrast) { vorige = null; gelijk = 0; continue; }
    if (z.rand > 0.08) {
      // stip ligt tegen de rand van het venster: venster één keer op de stip zetten
      if (Math.hypot(z.x - cx, z.y - cy) > 1) { cx = z.x; cy = z.y; vorige = null; gelijk = 0; continue; }
      return null;
    }
    if (vorige && Math.hypot(z.x - vorige.x, z.y - vorige.y) < 0.35 && Math.abs(z.max - vorige.max) < vorige.max * 0.12) {
      if (++gelijk >= 1) return z;
    } else gelijk = 0;
    vorige = z;
  }
  return null;
}

/**
 * Het hele raster meten en passen. o: { vision, sleep, toon(patroon), Hruw, ar, bw, bh,
 * voortgang(n, m), afbreken(), poging }. Hruw is de grove homografie (camera -> beamer)
 * uit het witte vlak; die zegt waar we elke stip moeten zoeken.
 * Geeft { H, lens, fout: { gem, max } in beamerpixels } of { mislukt: reden }.
 */
export async function kalRaster(o) {
  const { vision, sleep } = o;
  const poging = o.poging || 0;
  const r = 0.028 + poging * 0.01;                 // stipstraal, deel van de korte zijde
  const settle = 1400 + poging * 900;
  const vw = vision.vw, vh = vision.vh, n = vw * vh;
  const Hinv = invertH(o.Hruw);
  if (!Hinv) return { mislukt: 'homografie' };
  // zwarte referentie op pixelniveau, pas als het beeld niet meer verandert
  o.toon({ kind: 'black' });
  let ref = null, vorigGem = -1;
  const eindRef = Date.now() + 2500;
  while (Date.now() < eindRef) {
    await sleep(60);
    if (!vision.grab()) continue;
    const l = kalLuma(vision.data, n);
    let s = 0;
    for (let i = 0; i < n; i += 7) s += l[i];
    const gem = s / Math.ceil(n / 7);
    if (vorigGem >= 0 && Math.abs(gem - vorigGem) < 0.4) { ref = l; break; }
    vorigGem = gem;
    ref = l;
  }
  if (!ref) return { mislukt: 'camera' };

  // stippen ongeveer even ver uit elkaar als in de camera: venster = 40% van de kleinste afstand
  const naarPx = (u, v) => { const c = applyH(Hinv, u, v); return vision.camPx(c[0], c[1]); };
  const alle = [...KAL_RASTER, ...KAL_CONTROLE];
  let minAfst = Infinity;
  for (let i = 0; i < KAL_RASTER.length; i++) for (let j = i + 1; j < KAL_RASTER.length; j++) {
    const a = naarPx(...KAL_RASTER[i]), b = naarPx(...KAL_RASTER[j]);
    minAfst = Math.min(minAfst, Math.hypot(a[0] - b[0], a[1] - b[1]));
  }
  const half = Math.max(4, minAfst * 0.42);
  const cam = [], proj = [], ctrlCam = [], ctrlProj = [];
  for (let i = 0; i < alle.length; i++) {
    if (o.afbreken && o.afbreken()) return { mislukt: 'afgebroken' };
    o.voortgang && o.voortgang(i + 1, alle.length);
    const [u, v] = alle[i];
    const verwacht = naarPx(u, v);
    if (verwacht[0] < -half || verwacht[1] < -half || verwacht[0] > vw + half || verwacht[1] > vh + half) continue;
    o.toon({ kind: 'stip', u, v, r });
    const z = await kalMeetStip({ ...o, minContrast: o.minContrast || 10 }, ref, verwacht, half, settle);
    if (!z) continue;
    const c = vision.camNorm(z.x, z.y);
    if (i < KAL_RASTER.length) { cam.push(c); proj.push([u, v]); }
    else { ctrlCam.push(c); ctrlProj.push([u, v]); }
  }
  o.toon({ kind: 'black' });
  const pas = kalPas(cam, proj, o.ar);
  if (!pas) return { mislukt: 'te weinig stippen', gezien: cam.length };
  if (ctrlCam.length < 2) return { mislukt: 'controle', gezien: cam.length };
  // controle op stippen die niet meededen
  const bw = o.bw || 1280, bh = o.bh || 720;
  const L = pas.lens;
  const f = ctrlCam.map((c, i) => {
    const p = kalOntvorm(L, c[0], c[1]), q = applyH(pas.H, p[0], p[1]);
    return Math.hypot((q[0] - ctrlProj[i][0]) * bw, (q[1] - ctrlProj[i][1]) * bh);
  });
  const fout = { gem: f.reduce((s, x) => s + x, 0) / f.length, max: Math.max(...f), stippen: cam.length, weg: cam.length - pas.gebruikt.length };
  return { H: pas.H, lens: L, fout };
}
