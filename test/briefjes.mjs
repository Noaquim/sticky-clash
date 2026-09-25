// Briefjes die niet gelezen werden (screenshot van 24 september): een donker en een
// bruin briefje op een grijsbruine muur, warm lamplicht van links, een wazige camera.
// Nagebouwd met de gemeten kleuren uit dat camerabeeld.
//
//  1. onder warm licht leek álles huid, dus beide briefjes werden weggegooid
//  2. wat er al hing toen de muur geleerd werd, bleef onzichtbaar
//  3. twee briefjes vlak naast elkaar groeiden langzaam aan elkaar vast, waarna
//     de tracker ze even als mens las
//
// Plus de keerzijde: een bewegende hand blijft eruit, en een poster of de rand van
// het beamerbeeld wordt niet ineens een voorwerp.
import { makeVision, rng, oordeel, check, klaar } from './hulp.mjs';

const VW = 420, VH = 240;
const P = { x0: 40, y0: 30, x1: 400, y1: 215 };            // beamervlak in werkpixels
const inP = (x, y) => x >= P.x0 && x < P.x1 && y >= P.y0 && y < P.y1;

function muur(x, y) {
  if (!inP(x, y)) return [224, 156, 99];                     // lamplicht naast het beamervlak
  const t = (x - P.x0) / (P.x1 - P.x0), k = Math.max(0, 1 - t * 2.5);
  return [132 + 35 * k, 135 + 11 * k, 132 - 4 * k];         // links warmer, zoals gemeten
}
const DONKER = { x: 100, y: 85, w: 26, h: 18, c: [69, 64, 50] };
const BRUIN = { x: 98, y: 106, w: 26, h: 18, c: [104, 78, 57] };
const GEEL = { x: 250, y: 120, w: 24, h: 24, c: [214, 196, 90] };
const binnen = (o, x, y) => x >= o.x && x < o.x + o.w && y >= o.y && y < o.y + o.h;

/** Beeld met voorwerpen (vast of met een eigen kleurfunctie), wazig en met ruis. */
function beeld(v, dingen, r, extra) {
  const raw = new Float32Array(VW * VH * 3);
  for (let y = 0; y < VH; y++) {
    for (let x = 0; x < VW; x++) {
      let c = muur(x, y);
      for (const o of dingen) if (binnen(o, x, y)) c = o.f ? o.f(x, y, c) : o.c;
      if (extra) c = extra(x, y, c) || c;
      const i = (y * VW + x) * 3;
      raw[i] = c[0]; raw[i + 1] = c[1]; raw[i + 2] = c[2];
    }
  }
  const px = new Uint8ClampedArray(VW * VH * 4), B = 2;
  for (let y = 0; y < VH; y++) {
    for (let x = 0; x < VW; x++) {
      let s0 = 0, s1 = 0, s2 = 0, m = 0;
      for (let dy = -B; dy <= B; dy++) {
        for (let dx = -B; dx <= B; dx++) {
          const xx = Math.min(VW - 1, Math.max(0, x + dx)), yy = Math.min(VH - 1, Math.max(0, y + dy));
          const j = (yy * VW + xx) * 3;
          s0 += raw[j]; s1 += raw[j + 1]; s2 += raw[j + 2]; m++;
        }
      }
      const n = (r() - 0.5) * 8, o = (y * VW + x) * 4;
      px[o] = s0 / m + n; px[o + 1] = s1 / m + n; px[o + 2] = s2 / m + n; px[o + 3] = 255;
    }
  }
  v.data = px; v.sampleCells();
}

function leer(v, dingen, r, extra) {
  v.beginBackground();
  for (let i = 0; i < 30; i++) { beeld(v, typeof dingen === 'function' ? dingen(i) : dingen, r, extra); v.addBackgroundFrame(); }
  v.endBackground();
}

/** Speelt een aantal beelden af en geeft de sporen van het laatste terug. */
function speelMet(v, dingen, r, frames = 60) {
  let tr = [];
  for (let f = 0; f < frames; f++) {
    beeld(v, typeof dingen === 'function' ? dingen(f) : dingen, r);
    tr = v.detect(1 / 30);
  }
  return tr;
}
const bij = (tr, o) => tr.find(t => binnen({ x: o.x - 4, y: o.y - 4, w: o.w + 8, h: o.h + 8 }, t.cx, t.cy));
const telt = (v, t) => !!t && oordeel(v, t) === 'ok';
const uitleg = (v, t) => t ? '(' + oordeel(v, t) + ', huid ' + t.skinFrac.toFixed(2) + ', schaduw ' + t.shadowFrac.toFixed(2) + ')' : '(niet gezien)';

// ---- 1. warm licht: donker en bruin briefje tellen mee ---------------------
{
  const r = rng(3), v = makeVision(VW, VH);
  leer(v, [], r);
  const tr = speelMet(v, [DONKER, BRUIN], r, 60);
  const a = bij(tr, DONKER), b = bij(tr, BRUIN);
  check('warm licht: donker briefje telt mee', telt(v, a), uitleg(v, a));
  check('warm licht: donker briefje is geen huid meer', !!a && a.skinFrac < 0.3, uitleg(v, a));
  check('warm licht: bruin briefje telt mee zodra het stilhangt', telt(v, b), uitleg(v, b));
}

// ---- 2. wat er al hing wordt gevonden ---------------------------------------
{
  const r = rng(4), v = makeVision(VW, VH);
  leer(v, [DONKER, BRUIN, GEEL], r);
  const n = v.findResident(inP);
  check('al opgehangen: drie voorwerpen gevonden bij het leren', n === 3, '(' + n + ')');
  const tr = speelMet(v, [DONKER, BRUIN, GEEL], r, 60);
  const ok = [DONKER, BRUIN, GEEL].filter(o => telt(v, bij(tr, o))).length;
  check('al opgehangen: alle drie tellen mee in het spel', ok === 3, '(' + ok + ' van 3)');
  const weg = speelMet(v, [BRUIN, GEEL], r, 30);
  check('al opgehangen: donker briefje eraf -> weg uit het spel', !bij(weg, DONKER) && !!bij(weg, GEEL));
  check('al opgehangen: en er blijft geen spookvlek achter', weg.length === 2, '(' + weg.length + ' sporen)');
}
{
  const r = rng(4), v = makeVision(VW, VH);
  leer(v, [DONKER, BRUIN, GEEL], r);
  v.findResident(inP);
  v.dropResident();
  const uit = speelMet(v, [DONKER, BRUIN, GEEL], r, 30);
  check('instelling uit: wat er al hing telt niet meer', uit.length === 0, '(' + uit.length + ' sporen)');
}

// ---- 3. twee briefjes vlak naast elkaar blijven twee voorwerpen -------------
{
  // Vijf keer, met andere ruis: het vastgroeien gebeurde op een willekeurig moment.
  let samen = 0, vast = 0, mens = 0;
  for (const seed of [5, 7, 21, 33, 48]) {
    const r = rng(seed), v = makeVision(VW, VH, { skinFilter: false });
    leer(v, [], r);
    for (let f = 0; f < 150; f++) {
      beeld(v, [DONKER, BRUIN], r);
      const tr = v.detect(1 / 30);
      if (f < 20) continue;
      const a = bij(tr, DONKER), b = bij(tr, BRUIN);
      if (!a || !b || a === b) samen++;
      else if (a.held || b.held) vast++;              // één beeld ruis: even vasthouden mag
      if ((a && oordeel(v, a) === 'mens') || (b && oordeel(v, b) === 'mens')) mens++;
    }
  }
  check('naast elkaar: nooit samen of kwijt', samen === 0, '(' + samen + ' van 650 beelden)');
  check('naast elkaar: hooguit heel af en toe even vastgehouden', vast <= 13, '(' + vast + ' van 650 beelden)');
  check('naast elkaar: nooit als mens gelezen', mens === 0, '(' + mens + ' beelden)');
}

// ---- 3b. tijdens het spel: ballen vallen over het briefje heen ---------------
// Een donker briefje onder een felle bal lijkt voor de camera op kale muur. Het spel
// weet waar het zijn eigen licht projecteert (setProjection) en laat zich daardoor
// niet van de wijs brengen: het briefje telt net zo snel als zonder ballen.
{
  const PW = 256, PH = 144;
  const toUV = (x, y) => [(x - P.x0) / (P.x1 - P.x0), (y - P.y0) / (P.y1 - P.y0)];
  for (const [naam, note] of [['donker', DONKER], ['bruin', BRUIN]]) {
    const r = rng(2), v = makeVision(VW, VH);
    leer(v, [], r);
    const luma = new Float32Array(PW * PH);
    let eerst = -1, uit = 0;
    for (let f = 0; f < 120; f++) {
      const balls = [0, 1, 2].map(k => [95 + ((k * 37) % 40), ((f * 5 + k * 47) % 260) - 20]);
      beeld(v, [note], r, (x, y, c) => {
        for (const [bx, by] of balls) if ((x - bx) ** 2 + (y - by) ** 2 < 36) return c.map(q => Math.min(255, q + 90));
        return null;
      });
      luma.fill(0);
      for (const [bx, by] of balls) {
        const [u, w] = toUV(bx, by), px = u * PW, py = w * PH, rr = 6 * PW / (P.x1 - P.x0);
        for (let yy = Math.floor(py - rr); yy <= py + rr; yy++) {
          for (let xx = Math.floor(px - rr); xx <= px + rr; xx++) {
            if (xx >= 0 && yy >= 0 && xx < PW && yy < PH && (xx - px) ** 2 + (yy - py) ** 2 < rr * rr) luma[yy * PW + xx] = 200;
          }
        }
      }
      v.setProjection(luma, PW, PH, toUV);
      const t = bij(v.detect(1 / 30), note);
      const ok = telt(v, t);
      if (ok && eerst < 0) eerst = f;
      if (eerst >= 0 && !ok) uit++;
    }
    check('ballen erover: ' + naam + ' briefje telt binnen 2 s en blijft', eerst >= 0 && eerst < 60 && uit === 0,
      '(vanaf ' + (eerst < 0 ? 'nooit' : (eerst / 30).toFixed(2) + ' s') + ', daarna ' + uit + ' beelden uit)');
  }
}

// ---- 4. keerzijde: handen en gezichten tellen nooit ------------------------
// Huidskleur waarbij de hand echt voorgrond is (een lichte hand verdwijnt op deze
// muur gewoon in de muur, en dan test je niets).
const HUID = [150, 100, 75];
const ovaal = (cx, cy, rx, ry) => ({ x: cx - rx, y: cy - ry, w: 2 * rx, h: 2 * ry,
  f: (x, y, c) => (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1 ? HUID : c) });
function handProef(naam, dingenOp, frames = 120) {
  const r = rng(6), v = makeVision(VW, VH);
  leer(v, [], r);
  let gezien = 0, geteld = 0;
  for (let f = 0; f < frames; f++) {
    beeld(v, dingenOp(f), r);
    const tr = v.detect(1 / 30);
    if (tr.length) gezien++;
    if (tr.some(t => telt(v, t))) geteld++;
  }
  check(naam + ' telt nooit mee', gezien > frames / 2 && geteld === 0, '(gezien ' + gezien + ', geteld ' + geteld + ' van ' + frames + ')');
}
// een losse hand (mouw even licht als de muur) die heen en weer zwaait
handProef('zwaaiende hand', (f) => [{ x: (180 + Math.sin(f * 0.25) * 40) | 0, y: (110 + Math.cos(f * 0.19) * 12) | 0, w: 22, h: 26, c: HUID }]);
// dezelfde hand 'stil' in de lucht: trilt een halve pixel (ongeveer 3 mm op de muur)
const tril = (a, f) => [a * Math.sin(2 * Math.PI * 9 * f / 30), a * Math.cos(2 * Math.PI * 8 * f / 30)];
for (const a of [0.3, 0.5, 1]) {
  handProef('hand stil in de lucht (' + a + ' px trilling)', (f) => { const [dx, dy] = tril(a, f); return [ovaal(200 + dx, 120 + dy, 10, 11)]; });
}
// iemand staat stil voor de muur: donker shirt tot onderaan het beeld, hoofd erboven
handProef('gezicht van iemand die stilstaat', (f) => {
  const [dx, dy] = tril(1, f);
  return [{ x: (170 + dx) | 0, y: (95 + dy) | 0, w: 60, h: 150, c: [40, 48, 80] },
          { x: (150 + dx) | 0, y: (100 + dy) | 0, w: 100, h: 70, c: [40, 48, 80] },
          ovaal(200 + dx, 75 + dy, 14, 18)];
});

// ---- 5. keerzijde: bij het leren niets verzinnen ----------------------------
{
  const r = rng(7), v = makeVision(VW, VH);
  leer(v, [], r);
  check('lege muur met verloop: niets gevonden', v.findResident(inP) === 0);
}
{
  // poster: groot vlak vol kleurige blokjes
  const r = rng(8), v = makeVision(VW, VH);
  const vlek = rng(99), kleuren = [];
  for (let i = 0; i < 64; i++) kleuren.push([40 + vlek() * 200, 40 + vlek() * 200, 40 + vlek() * 200]);
  const POSTER = { x: 230, y: 60, w: 120, h: 120, f: (x, y) => kleuren[(((y - 60) / 15) | 0) * 8 + (((x - 230) / 15) | 0)] };
  leer(v, [POSTER], r);
  const n = v.findResident(inP);
  check('poster aan de muur: geen losse voorwerpen', n === 0, '(' + n + ')');
}
{
  // groot vel papier: te groot om een speelvoorwerp te zijn
  const r = rng(9), v = makeVision(VW, VH);
  leer(v, [{ x: 150, y: 60, w: 140, h: 110, c: [236, 236, 230] }], r);
  const n = v.findResident(inP);
  check('groot vel papier: niet als voorwerp', n === 0, '(' + n + ')');
}
{
  // iemand die tijdens het leren door het beeld liep (binnen het beamervlak)
  const r = rng(10), v = makeVision(VW, VH);
  leer(v, (i) => [{ x: 150 + i * 4, y: 90, w: 24, h: 30, c: [60, 70, 110] }], r);
  const n = v.findResident(inP);
  check('iemand liep door het beeld tijdens het leren: niets', n === 0, '(' + n + ')');
}
for (const d of [4, 10]) {
  // kalibratie iets te ruim: langs de rand ligt dan een strook lamplicht 'op het
  // beamervlak'. Dat is een lichtrand, geen voorwerp.
  const r = rng(11 + d), v = makeVision(VW, VH);
  const inRuim = (x, y) => x >= P.x0 - d && x < P.x1 + d && y >= P.y0 - d && y < P.y1 + d;
  leer(v, [], r);
  const n = v.findResident(inRuim);
  check('kalibratie ' + d + ' px te ruim: rand is geen voorwerp', n === 0, '(' + n + ')');
}

klaar();
