// Nauwkeurige kalibratie: een raster van stippen, één voor één geprojecteerd, en daar
// een lensvertekening (k1 en k2, rond het midden van het camerabeeld) plus homografie
// doorheen gepast. Een groothoekwebcam buigt rechte lijnen krom; met alleen vier
// punten zat het beamervlak daardoor aan de randen en in de hoeken ernaast.
//
// Dit draait bovenop de meting met vier stippen uit main.js (autoCalibrate), en nooit
// in plaats ervan. Elke stip wordt gemeten zoals daar: alleen binnen het witte vlak,
// met de mediaan van een paar camerabeelden (een flitsende lamp of discobal verandert
// één beeld, niet de meeste), en pas als twee metingen na elkaar hetzelfde zeggen (een
// camera die zelf bijregelt is dan uitgeregeld). Klopt het raster niet duidelijk beter
// op stippen die niet meededen, dan blijft de meting met vier stippen staan.
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

/** Fout per punt in beamerpixels (bw × bh), van camera (0..1) via lens en H naar het vlak. */
function kalFouten(H, L, cam, proj, bw, bh) {
  return cam.map((c, i) => {
    const p = kalOntvorm(L, c[0], c[1]);
    const q = applyH(H, p[0], p[1]);
    return Math.hypot((q[0] - proj[i][0]) * bw, (q[1] - proj[i][1]) * bh);
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

function kalPasK(cam, proj, ar, metK2, bw, bh) {
  const kost = (k1, k2) => {
    const L = { k1, k2, ar };
    const H = kalHomografieLS(cam.map(c => kalOntvorm(L, c[0], c[1])), proj);
    if (!H) return { e: Infinity, H: null, k1, k2 };
    const f = kalFouten(H, L, cam, proj, bw, bh);
    return { e: f.reduce((s, v) => s + v * v, 0), H, k1, k2 };
  };
  const binnen = (k2) => { const r = kalMinimum(x => ({ ...kost(x, k2), x }), -0.6, 0.6, 0.1, 22); r.x = k2; return r; };
  // k2 alleen met genoeg stippen: anders past hij ruis in plaats van de lens
  return metK2 ? kalMinimum(binnen, -0.4, 0.4, 0.1, 16) : binnen(0);
}

/**
 * Robuust passen: lens (k1) + homografie door alle gemeten stippen. Een stip die er ver
 * naast ligt (iemand liep erdoor, een flits precies op dat moment) gaat eruit, één voor
 * één, de slechtste eerst. cam in 0..1 camerabeeld, proj in 0..1 beamervlak, ar =
 * breedte/hoogte van het camerabeeld, bw × bh het beamerbeeld in pixels.
 * Geeft { H, lens, fouten (beamerpixels), gebruikt } of null.
 */
export function kalPas(cam, proj, ar, opts = {}) {
  const minPunten = opts.minPunten || 8;
  const bw = opts.bw || 1280, bh = opts.bh || 720;
  const grens = opts.grens || 4;               // beamerpixels
  let idx = cam.map((_, i) => i);
  for (;;) {
    if (idx.length < minPunten) return null;
    const c = idx.map(i => cam[i]), p = idx.map(i => proj[i]);
    const r = kalPasK(c, p, ar, idx.length >= 12, bw, bh);
    if (!r.H) return null;
    const L = { k1: r.k1, k2: r.k2, ar };
    const f = kalFouten(r.H, L, c, p, bw, bh);
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
/** Controlestippen die niet meedoen met passen: vlak bij de hoeken en in het midden. */
export const KAL_CONTROLE = [[0.12, 0.13], [0.88, 0.13], [0.88, 0.87], [0.12, 0.87], [0.5, 0.5]];

/**
 * Het camerabeeld op zijn eigen resolutie (niet het kleine werkbeeld van de herkenning):
 * een stip is daar een paar keer zo groot, en dan is het zwaartepunt een stuk preciezer.
 * Spiegelen en uitsnede spelen hier geen rol; alles in videopixels.
 */
function kalBeeld(o) {
  const v = o.vision.video, W = v.videoWidth, H = v.videoHeight;
  if (!W || !H || v.readyState < 2) return null;
  if (!o.cv) {
    o.cv = document.createElement('canvas');
    o.cx = o.cv.getContext('2d', { willReadFrequently: true });
  }
  if (o.cv.width !== W || o.cv.height !== H) { o.cv.width = W; o.cv.height = H; }
  o.cx.drawImage(v, 0, 0, W, H);
  return { W, H };
}

/** Helderheid van één venster uit het laatst getekende camerabeeld. */
function kalVensterLuma(o, w) {
  const d = o.cx.getImageData(w.x0, w.y0, w.w, w.h).data, n = w.w * w.h, out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
  return out;
}

/** De mediaan per pixel van een paar camerabeelden, voor een paar vensters tegelijk. */
async function kalMediaan(o, vensters, aantal) {
  const lagen = vensters.map(() => []);
  for (let i = 0; i < aantal; i++) {
    if (i) await o.sleep(60);
    if (!kalBeeld(o)) return null;
    vensters.forEach((w, j) => lagen[j].push(kalVensterLuma(o, w)));
  }
  const rij = new Float32Array(aantal);
  return lagen.map(l => {
    const n = l[0].length, uit = new Float32Array(n);
    for (let k = 0; k < n; k++) {
      for (let i = 0; i < aantal; i++) rij[i] = l[i][k];
      rij.sort();
      uit[k] = rij[aantal >> 1];
    }
    return uit;
  });
}

/** De mediaan per pixel van het hele camerabeeld (de zwarte referentie). */
async function kalMediaanHeel(o, aantal) {
  const lagen = [];
  let W = 0, H = 0;
  for (let i = 0; i < aantal; i++) {
    if (i) await o.sleep(60);
    const b = kalBeeld(o);
    if (!b) return null;
    W = b.W; H = b.H;
    const d = o.cx.getImageData(0, 0, W, H).data, n = W * H, l = new Uint8Array(n);
    for (let k = 0; k < n; k++) l[k] = 0.299 * d[k * 4] + 0.587 * d[k * 4 + 1] + 0.114 * d[k * 4 + 2];
    lagen.push(l);
  }
  const n = W * H, uit = new Float32Array(n), rij = new Float32Array(aantal);
  for (let k = 0; k < n; k++) {
    for (let i = 0; i < aantal; i++) rij[i] = lagen[i][k];
    rij.sort();
    uit[k] = rij[aantal >> 1];
  }
  return { W, H, l: uit };
}

/** Een venster uit de zwarte referentie. */
function kalRefVenster(ref, w) {
  const out = new Float32Array(w.w * w.h);
  for (let y = 0; y < w.h; y++) for (let x = 0; x < w.w; x++) out[y * w.w + x] = ref.l[(w.y0 + y) * ref.W + w.x0 + x];
  return out;
}

function kalMediaanVan(a) {
  const s = Float32Array.from(a).sort();
  return s.length ? s[s.length >> 1] : 0;
}

/**
 * Zwaartepunt van de stip in een venster: verschil met de zwarte referentie, min wat de
 * rand van het venster gemiddeld (mediaan) feller werd (een camera die bijregelt, licht
 * dat terugkaatst). Van alle heldere vlekjes in het venster telt het vlekje met het meeste
 * licht dicht bij de verwachte plek (het midden van het venster): een los fel puntje van
 * een discobal of lamp aan de rand is nooit de stip.
 */
export function kalZwaartepunt(lum, ref, w) {
  const n = w.w * w.h, d = new Float32Array(n), randW = [];
  for (let k = 0; k < n; k++) {
    d[k] = lum[k] - ref[k];
    const x = k % w.w, y = (k - x) / w.w;
    if (x === 0 || y === 0 || x === w.w - 1 || y === w.h - 1) randW.push(d[k]);
  }
  const basis = kalMediaanVan(randW);
  const afw = kalMediaanVan(randW.map(v => Math.abs(v - basis))) * 1.48;
  let max = 0;
  for (let k = 0; k < n; k++) { d[k] -= basis; if (d[k] > max) max = d[k]; }
  if (!(max > 0)) return null;
  // 1. vlekjes boven een lage drempel; het beste: veel licht, dicht bij het midden
  const laag = Math.max(afw * 4, max * 0.2);
  const label = new Int32Array(n), stapel = [];
  const mx = (w.cx != null ? w.cx - w.x0 : w.w / 2), my = (w.cy != null ? w.cy - w.y0 : w.h / 2);
  const schaal = Math.max(3, Math.min(w.w, w.h) * 0.25);
  let nr = 0, beste = null;
  for (let s = 0; s < n; s++) {
    if (label[s] || d[s] <= laag) continue;
    nr++;
    label[s] = nr; stapel.push(s);
    let massa = 0, sx = 0, sy = 0, piek = 0, pk = s;
    while (stapel.length) {
      const k = stapel.pop(), x = k % w.w, y = (k - x) / w.w;
      massa += d[k]; sx += x * d[k]; sy += y * d[k];
      if (d[k] > piek) { piek = d[k]; pk = k; }
      if (x > 0 && !label[k - 1] && d[k - 1] > laag) { label[k - 1] = nr; stapel.push(k - 1); }
      if (x < w.w - 1 && !label[k + 1] && d[k + 1] > laag) { label[k + 1] = nr; stapel.push(k + 1); }
      if (y > 0 && !label[k - w.w] && d[k - w.w] > laag) { label[k - w.w] = nr; stapel.push(k - w.w); }
      if (y < w.h - 1 && !label[k + w.w] && d[k + w.w] > laag) { label[k + w.w] = nr; stapel.push(k + w.w); }
    }
    const afst = Math.hypot(sx / massa - mx, sy / massa - my) / schaal;
    const score = massa / (1 + afst * afst);
    if (!beste || score > beste.score) beste = { score, piek, pk };
  }
  if (!beste) return null;
  // 2. binnen dat vlekje: zwaartepunt boven de helft van zijn eigen piek
  const thr = beste.piek * 0.5;
  const mee = new Uint8Array(n);
  mee[beste.pk] = 1; stapel.push(beste.pk);
  let sx = 0, sy = 0, sw = 0, rand = 0, aantal = 0;
  while (stapel.length) {
    const k = stapel.pop();
    const x = k % w.w, y = (k - x) / w.w, g = d[k] - thr;
    sx += x * g; sy += y * g; sw += g; aantal++;
    if (x === 0 || y === 0 || x === w.w - 1 || y === w.h - 1) rand += g;
    if (x > 0 && !mee[k - 1] && d[k - 1] > thr) { mee[k - 1] = 1; stapel.push(k - 1); }
    if (x < w.w - 1 && !mee[k + 1] && d[k + 1] > thr) { mee[k + 1] = 1; stapel.push(k + 1); }
    if (y > 0 && !mee[k - w.w] && d[k - w.w] > thr) { mee[k - w.w] = 1; stapel.push(k - w.w); }
    if (y < w.h - 1 && !mee[k + w.w] && d[k + w.w] > thr) { mee[k + w.w] = 1; stapel.push(k + w.w); }
  }
  if (!sw) return null;
  return { x: w.x0 + sx / sw + 0.5, y: w.y0 + sy / sw + 0.5, max: beste.piek, ruis: afw, n: aantal, rand: rand / sw };
}

function kalMaakVenster(cx, cy, half, W, H) {
  const x0 = Math.max(0, Math.floor(cx - half)), x1 = Math.min(W - 1, Math.ceil(cx + half));
  const y0 = Math.max(0, Math.floor(cy - half)), y1 = Math.min(H - 1, Math.ceil(cy + half));
  if (x1 - x0 < 6 || y1 - y0 < 6) return null;
  return { x0, y0, w: x1 - x0 + 1, h: y1 - y0 + 1, cx, cy };
}

/**
 * Meet één stip. Steeds de mediaan van vijf camerabeelden; pas als twee van die metingen
 * na elkaar op dezelfde plek uitkomen, telt hij. Zo wacht het vanzelf tot de camera de
 * stip echt laat zien (vertraging van 50–300 ms is normaal) en tot een camera die zijn
 * helderheid zelf regelt weer stil staat.
 */
async function kalMeetStip(o, w, refHeel, settle) {
  const eind = Date.now() + settle;
  const tol = 0.35 * Math.max(1, o.W / 320);       // ongeveer 1/3 werkpixel
  let vorige = null, verschoven = 0;
  let ref = kalRefVenster(refHeel, w);
  await o.sleep(o.eerst || 200);
  while (Date.now() < eind) {
    if (o.afbreken && o.afbreken()) return null;
    const m = await kalMediaan(o, [w], 5);
    if (!m) { await o.sleep(30); continue; }
    const z = kalZwaartepunt(m[0], ref, w);
    if (z && z.rand > 0.08 && z.max >= o.minContrast && verschoven < 2) {
      // stip ligt tegen de rand van het venster: het venster op de stip zetten
      const nw = kalMaakVenster(z.x, z.y, o.half, refHeel.W, refHeel.H);
      if (nw && Math.hypot(z.x - w.cx, z.y - w.cy) < o.half * 1.2) { w = nw; ref = kalRefVenster(refHeel, w); verschoven++; vorige = null; continue; }
    }
    if (!z || z.max < Math.max(o.minContrast, z.ruis * 6) || z.rand > 0.08) { vorige = null; continue; }
    if (vorige && Math.hypot(z.x - vorige.x, z.y - vorige.y) < tol && Math.abs(z.max - vorige.max) < vorige.max * 0.15) {
      return { x: (z.x + vorige.x) / 2, y: (z.y + vorige.y) / 2, max: z.max };
    }
    vorige = z;
  }
  return null;
}

/** Gemiddelde en grootste fout (beamerpixels) van een afbeelding op losse stippen. */
function kalControleFout(naar, cam, proj, bw, bh) {
  const f = cam.map((c, i) => { const q = naar(c[0], c[1]); return Math.hypot((q[0] - proj[i][0]) * bw, (q[1] - proj[i][1]) * bh); });
  return { gem: f.reduce((s, x) => s + x, 0) / Math.max(1, f.length), max: f.length ? Math.max(...f) : Infinity };
}

/**
 * Het hele raster meten en passen. o: { vision, sleep, toon(patroon), H4 (de meting met
 * vier stippen, camera 0..1 -> beamer 0..1), binnenVlak(u, v) (camera 0..1: ligt dit in
 * het witte vlak?), wachtTotStil(ms), ar, bw, bh, voortgang(n, m), afbreken() }.
 * Geeft { H, lens, fout } als het raster duidelijk klopt en minstens zo goed is als de
 * vier stippen, en anders { mislukt: reden, ... }: dan blijft H4 staan.
 */
export async function kalRaster(o) {
  const vid = o.vision.video, W = vid.videoWidth, Hh = vid.videoHeight;
  if (!W || !Hh) return { mislukt: 'camera' };
  o.W = W;
  const Hinv = invertH(o.H4);
  if (!Hinv) return { mislukt: 'homografie' };
  const bw = o.bw || 1280, bh = o.bh || 720;
  const alle = [...KAL_RASTER, ...KAL_CONTROLE];
  const naarPx = (u, v) => { const c = applyH(Hinv, u, v); return [c[0] * W, c[1] * Hh]; };
  // Venster = ruim 40% van de kleinste afstand tussen twee rasterstippen in het
  // camerabeeld. De stippen komen één voor één, dus vensters mogen elkaar overlappen.
  let minAfst = Infinity;
  for (let i = 0; i < KAL_RASTER.length; i++) for (let j = i + 1; j < KAL_RASTER.length; j++) {
    const a = naarPx(...KAL_RASTER[i]), b = naarPx(...KAL_RASTER[j]);
    minAfst = Math.min(minAfst, Math.hypot(a[0] - b[0], a[1] - b[1]));
  }
  const half = Math.min(90, Math.max(6, minAfst * 0.42));
  o.half = half;
  // stip: zo groot dat hij in de camera minstens een paar pixels beslaat
  const pxPerBeamer = minAfst / Math.min(bw * 0.23, bh * 0.29);
  const r = Math.min(0.05, Math.max(0.028, 2.5 / Math.max(1e-6, pxPerBeamer) / Math.min(bw, bh)));
  const vensters = alle.map(([u, v]) => {
    const p = naarPx(u, v);
    // alleen binnen het witte vlak zoeken
    if (o.binnenVlak && !o.binnenVlak(p[0] / W, p[1] / Hh)) return null;
    return kalMaakVenster(p[0], p[1], half, W, Hh);
  });
  const bruikbaar = vensters.filter(Boolean);
  if (bruikbaar.length < 12) return { mislukt: 'te weinig stippen in beeld', gezien: bruikbaar.length };

  // zwarte referentie per venster, pas als het beeld stil staat
  o.toon({ kind: 'black' });
  await o.sleep(300);
  if (o.wachtTotStil) await o.wachtTotStil(1500);
  const refHeel = await kalMediaanHeel(o, 5);
  if (!refHeel || refHeel.W !== W || refHeel.H !== Hh) return { mislukt: 'camera' };

  const cam = [], proj = [], ctrlCam = [], ctrlProj = [];
  const t0 = Date.now();
  let geprobeerd = 0;
  for (let i = 0; i < alle.length; i++) {
    if (o.afbreken && o.afbreken()) return { mislukt: 'afgebroken' };
    // Zijn de stippen niet te zien (te donker, te veel licht), dan niet een minuut lang
    // blijven proberen: na acht stippen, of na 50 s, terug naar de vier stippen.
    if ((geprobeerd >= 8 && cam.length < geprobeerd / 2) || Date.now() - t0 > 50000) {
      o.toon({ kind: 'black' });
      return { mislukt: 'stippen niet goed te zien', stippen: cam.length, geprobeerd };
    }
    o.voortgang && o.voortgang(i + 1, alle.length);
    const w = vensters[i];
    if (!w) continue;
    const [u, v] = alle[i];
    o.toon({ kind: 'stip', u, v, r });
    geprobeerd++;
    const z = await kalMeetStip({ ...o, minContrast: o.minContrast || 10 }, w, refHeel, o.settle || 2600);
    if (!z) continue;
    const c = [z.x / W, z.y / Hh];
    if (o.binnenVlak && !o.binnenVlak(c[0], c[1])) continue;
    if (i < KAL_RASTER.length) { cam.push(c); proj.push([u, v]); }
    else { ctrlCam.push(c); ctrlProj.push([u, v]); }
  }
  o.toon({ kind: 'black' });
  const pas = kalPas(cam, proj, o.ar, { bw, bh });
  const fit = pas ? pas.gebruikt.map((_, j) => pas.fouten[j]) : [];
  const rms = fit.length ? Math.sqrt(fit.reduce((s, x) => s + x * x, 0) / fit.length) : Infinity;
  const diag = { stippen: cam.length, gebruikt: pas ? pas.gebruikt.length : 0, rms: +rms.toFixed(2), controle: ctrlCam.length };
  // ---- zelfcontrole ----
  if (!pas || pas.gebruikt.length < 12) return { mislukt: 'te weinig stippen', ...diag };
  if (rms > Math.max(2.5, bw * 0.002)) return { mislukt: 'past niet', ...diag };
  if (ctrlCam.length < 3) return { mislukt: 'controle', ...diag };
  const L = pas.lens;
  const raster = kalControleFout((x, y) => { const p = kalOntvorm(L, x, y); return applyH(pas.H, p[0], p[1]); }, ctrlCam, ctrlProj, bw, bh);
  const vier = kalControleFout((x, y) => applyH(o.H4, x, y), ctrlCam, ctrlProj, bw, bh);
  diag.gem = +raster.gem.toFixed(2); diag.max = +raster.max.toFixed(2);
  diag.vier = { gem: +vier.gem.toFixed(2), max: +vier.max.toFixed(2) };
  // Nooit slechter dan de vier stippen: anders blijven die staan.
  if (raster.gem > vier.gem + 0.25 || raster.max > vier.max + 1) return { mislukt: 'niet beter', ...diag };
  return { H: pas.H, lens: L, fout: diag };
}
