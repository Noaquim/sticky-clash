// De nauwkeurige kalibratie uit js/kalibratie.js: lensvertekening heen en terug, de
// homografie door veel punten, en het robuuste passen op een nagemaakte groothoekwebcam
// met ruis en een paar stippen die er ver naast liggen. Plus: een oude opgeslagen
// kalibratie (zonder lens) werkt precies als vroeger.
import { check, klaar, rng } from './hulp.mjs';
import { applyH, invertH, computeHomography } from '../js/homography.js';
import { kalOntvorm, kalVervorm, kalNaarBeamer, kalNaarCamera, kalZetLens, kalLensVan, kalHomografieLS, kalPas,
  KAL_RASTER, KAL_CONTROLE } from '../js/kalibratie.js';

// ---- lens heen en terug
let ergst = 0;
for (const k1 of [-0.3, -0.15, 0.1, 0.25, 0.4]) {
  const L = { k1, ar: 16 / 9 };
  for (let y = 0; y <= 1.0001; y += 0.1) for (let x = 0; x <= 1.0001; x += 0.1) {
    const p = kalOntvorm(L, x, y), q = kalVervorm(L, p[0], p[1]);
    ergst = Math.max(ergst, Math.hypot(q[0] - x, q[1] - y));
  }
}
check('lens: vervormen na ontvormen geeft hetzelfde punt (k1 -0.3..0.4)', ergst < 1e-9, ergst.toExponential(1));
{
  const L = { k1: 0.18, k2: 0.2, ar: 4 / 3 };
  let f = 0;
  for (let y = 0; y <= 1.0001; y += 0.1) for (let x = 0; x <= 1.0001; x += 0.1) {
    const p = kalOntvorm(L, x, y), q = kalVervorm(L, p[0], p[1]);
    f = Math.max(f, Math.hypot(q[0] - x, q[1] - y));
  }
  check('lens met k2: ook heen en terug', f < 1e-9, f.toExponential(1));
}
check('lens: zonder lens verandert er niets', kalOntvorm(null, 0.3, 0.7)[0] === 0.3 && kalVervorm({ k1: 0 }, 0.3, 0.7)[1] === 0.7);

// ---- homografie door veel punten = de echte als er geen ruis is
const Hecht = computeHomography([[0.1, 0.12], [0.9, 0.05], [0.85, 0.92], [0.12, 0.85]], [[0, 0], [1, 0], [1, 1], [0, 1]]);
const src = [], dst = [];
for (const [u, v] of KAL_RASTER) { const c = applyH(invertH(Hecht), u, v); src.push(c); dst.push([u, v]); }
const Hls = kalHomografieLS(src, dst);
check('homografie door 20 punten = de echte', Hls.every((h, i) => Math.abs(h - Hecht[i]) < 1e-7));

// ---- robuust passen: groothoek (tonvorm), trapezium, ruis en twee uitschieters
function nagemaakt(k1, ruis, uitschieters, seed) {
  const r = rng(seed);
  const L = { k1, ar: 4 / 3 };
  const Hinv = invertH(Hecht);
  const cam = [], proj = [];
  KAL_RASTER.forEach(([u, v], i) => {
    const c = kalVervorm(L, ...applyH(Hinv, u, v));
    let x = c[0] + (r() - 0.5) * 2 * ruis, y = c[1] + (r() - 0.5) * 2 * ruis;
    if (i < uitschieters) { x += 0.04; y -= 0.03; }     // iemand liep door het beeld
    cam.push([x, y]); proj.push([u, v]);
  });
  return { L, cam, proj };
}
for (const k1 of [0.25, 0.12, 0, -0.1]) {
  const { L, cam, proj } = nagemaakt(k1, 0.0006, 2, 7 + Math.round(k1 * 100));
  const pas = kalPas(cam, proj, 4 / 3);
  const kGevonden = pas.lens ? pas.lens.k1 : 0;
  // fout over het hele vlak, ook in de hoeken, tegen de echte afbeelding
  let max = 0;
  for (let v = 0; v <= 1.0001; v += 0.1) for (let u = 0; u <= 1.0001; u += 0.1) {
    const c = kalVervorm(L, ...applyH(invertH(Hecht), u, v));
    const p = kalOntvorm(pas.lens, c[0], c[1]), q = applyH(pas.H, p[0], p[1]);
    max = Math.max(max, Math.hypot((q[0] - u) * 1280, (q[1] - v) * 720));
  }
  // ruis van ±0.0006 is al ongeveer ±1 beamerpixel per stip
  check(`passen k1 ${k1}: k1 teruggevonden, uitschieters eruit, overal < 2 px`,
    Math.abs(kGevonden - k1) < 0.04 && !pas.gebruikt.includes(0) && !pas.gebruikt.includes(1) && max < 2,
    `k1 ${kGevonden.toFixed(3)}, max ${max.toFixed(2)} px, ${pas.gebruikt.length}/20 stippen`);
}
// met alleen een homografie (zoals vroeger) zit je bij een groothoek ver naast
{
  const { cam, proj } = nagemaakt(0.25, 0, 0, 3);
  const H4 = computeHomography([0, 4, 19, 15].map(i => cam[i]), [[0.04, 0.06], [0.96, 0.06], [0.96, 0.94], [0.04, 0.94]]);
  let max = 0;
  cam.forEach((c, i) => { const q = applyH(H4, c[0], c[1]); max = Math.max(max, Math.hypot((q[0] - proj[i][0]) * 1280, (q[1] - proj[i][1]) * 720)); });
  check('ter vergelijking: vier hoekpunten zonder lens zitten er > 10 px naast', max > 10, max.toFixed(1) + ' px');
}
check('te weinig stippen: geen kalibratie', kalPas(nagemaakt(0.1, 0, 0, 1).cam.slice(0, 6), KAL_RASTER.slice(0, 6), 4 / 3) === null);
check('controlestippen doen niet mee met passen', KAL_CONTROLE.every(([u, v]) => !KAL_RASTER.some(([a, b]) => a === u && b === v)));

// ---- de ene afbeelding camera <-> beamer, heen en terug, mét lens
{
  const H = Hecht.slice(), Hinv = invertH(H);
  kalZetLens(H, { k1: 0.2, ar: 16 / 9 });
  let f = 0;
  for (let v = 0.05; v < 1; v += 0.15) for (let u = 0.05; u < 1; u += 0.15) {
    const c = kalNaarCamera(H, Hinv, u, v), q = kalNaarBeamer(H, c[0], c[1]);
    f = Math.max(f, Math.hypot(q[0] - u, q[1] - v));
  }
  check('afbeelding beamer -> camera -> beamer is rond', f < 1e-9, f.toExponential(1));
  // opslaan en terugladen zoals main.js dat doet (JSON)
  const opgeslagen = JSON.parse(JSON.stringify({ H, lens: kalLensVan(H) }));
  kalZetLens(opgeslagen.H, opgeslagen.lens);
  const a = kalNaarBeamer(H, 0.2, 0.3), b = kalNaarBeamer(opgeslagen.H, 0.2, 0.3);
  check('lens gaat mee in de opslag en komt terug', a[0] === b[0] && a[1] === b[1] && kalLensVan(opgeslagen.H).k1 === 0.2);
}
// ---- oude opslag: alleen H, geen lens
{
  const oud = JSON.parse(JSON.stringify({ H: Hecht }));
  kalZetLens(oud.H, oud.lens);
  const Hinv = invertH(oud.H);
  const p = kalNaarBeamer(oud.H, 0.4, 0.6), q = applyH(oud.H, 0.4, 0.6);
  const c = kalNaarCamera(oud.H, Hinv, 0.3, 0.3), d = applyH(Hinv, 0.3, 0.3);
  check('oude kalibratie zonder lens: precies de oude homografie', kalLensVan(oud.H) === null &&
    p[0] === q[0] && p[1] === q[1] && c[0] === d[0] && c[1] === d[1]);
  check('lege of kapotte lens telt als geen lens', (kalZetLens(oud.H, { k1: NaN }), kalLensVan(oud.H)) === null &&
    (kalZetLens(oud.H, { k1: 0 }), kalLensVan(oud.H)) === null && kalLensVan(null) === null);
}

klaar();
