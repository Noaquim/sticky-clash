// Uitbreidingen van de herkenning, nagemeten op de nagebouwde muur uit briefjes.mjs
// (grijsbruine muur, warm lamplicht van links, een wazige camera):
//
//  1. rode, groene en blauwe briefjes krijgen een soort (trampoline, booster, breek),
//     alle andere kleuren nooit — ook niet onder een warme of koele lamp
//  2. cameraShift(): is de camera verschoven sinds de muur geleerd is?
//  3. het lichtmodel van de beamer: een donker briefje onder een regen van ballen
//     telt snel mee, en de ballen zelf worden nooit een voorwerp
//  4. een stille camera ziet ook kraftbruine en middengrijze briefjes
import { makeVision, rng, oordeel, check, klaar } from './hulp.mjs';

const VW = 420, VH = 240;
const P = { x0: 40, y0: 30, x1: 400, y1: 215 };            // beamervlak in werkpixels
const inP = (x, y) => x >= P.x0 && x < P.x1 && y >= P.y0 && y < P.y1;

function muur(x, y) {
  if (!inP(x, y)) return [224, 156, 99];                     // lamplicht naast het beamervlak
  const t = (x - P.x0) / (P.x1 - P.x0), k = Math.max(0, 1 - t * 2.5);
  return [132 + 35 * k, 135 + 11 * k, 132 - 4 * k];         // links warmer, zoals gemeten
}
// Wat vol wit van de beamer bovenop de muurverlichting doet, op de kale muur.
const WIT = [92, 92, 88];
const DONKER = { x: 100, y: 85, w: 26, h: 18, c: [69, 64, 50] };
const BRUIN = { x: 98, y: 106, w: 26, h: 18, c: [104, 78, 57] };
const GEEL = { x: 250, y: 120, w: 24, h: 24, c: [214, 196, 90] };
const binnen = (o, x, y) => x >= o.x && x < o.x + o.w && y >= o.y && y < o.y + o.h;

/** Kleur van een briefje onder neutraal licht -> zoals de camera hem ziet onder de lamp van links. */
function onderLamp(c, x, y) {
  const w = muur(x, y), n = muur(P.x1 - 1, y);
  return [c[0] * w[0] / n[0], c[1] * w[1] / n[1], c[2] * w[2] / n[2]];
}

/**
 * Beeld zoals in briefjes.mjs (wazig, met ruis), plus:
 *   licht(x, y)  extra beamerlicht, 0..1 (1 = vol wit). Een voorwerp kaatst daar
 *                evenveel van terug als van de muurverlichting: een donker briefje weinig.
 *   shift        [dx, dy]: de camera is verschoven, alles schuift mee
 *   gain         belichting van de camera, lamp: [r, g, b] kleur van een lamp over alles
 */
function beeld(v, dingen, r, opt = {}) {
  const sx = opt.shift ? opt.shift[0] : 0, sy = opt.shift ? opt.shift[1] : 0;
  const gain = opt.gain || 1, lamp = opt.lamp || [1, 1, 1];
  const raw = new Float32Array(VW * VH * 3);
  for (let y = 0; y < VH; y++) {
    for (let x = 0; x < VW; x++) {
      const xs = x - sx, ys = y - sy, w = muur(xs, ys);
      let c = w;
      for (const o of dingen) if (binnen(o, xs, ys)) c = o.f ? o.f(xs, ys, c) : o.lamp ? onderLamp(o.c, xs, ys) : o.c;
      const I = opt.licht && inP(xs, ys) ? opt.licht(xs, ys) : 0;
      if (I) c = [c[0] * (1 + WIT[0] * I / w[0]), c[1] * (1 + WIT[1] * I / w[1]), c[2] * (1 + WIT[2] * I / w[2])];
      const i = (y * VW + x) * 3;
      raw[i] = c[0] * gain * lamp[0]; raw[i + 1] = c[1] * gain * lamp[1]; raw[i + 2] = c[2] * gain * lamp[2];
    }
  }
  const px = new Uint8ClampedArray(VW * VH * 4), B = 2, ruis = opt.ruis == null ? 8 : opt.ruis;
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
      const n = (r() - 0.5) * ruis, o = (y * VW + x) * 4;
      px[o] = s0 / m + n; px[o + 1] = s1 / m + n; px[o + 2] = s2 / m + n; px[o + 3] = 255;
    }
  }
  v.data = px; v.sampleCells();
}

/** Muur leren zoals main.js dat doet: eerst (met opt.wit) de beamer even vol wit, dan de muurverlichting. */
function leer(v, dingen, r, opt = {}) {
  if (opt.wit) {
    v.beginResponse();
    for (let i = 0; i < 10; i++) { beeld(v, dingen, r, { ...opt, licht: () => 1 }); v.addResponseFrame(); }
    v.endResponse();
  }
  v.beginBackground();
  for (let i = 0; i < 30; i++) { beeld(v, dingen, r, opt); v.addBackgroundFrame(); }
  v.endBackground();
}

const bij = (tr, o) => tr.find(t => binnen({ x: o.x - 4, y: o.y - 4, w: o.w + 8, h: o.h + 8 }, t.cx, t.cy));
const telt = (v, t) => !!t && oordeel(v, t) === 'ok';
const sec = (f) => (f / 30).toFixed(2) + ' s';

// ---- 1. soort briefje uit de kleur ------------------------------------------
// Kleuren onder neutraal licht; de lamp van links kleurt ze mee (net als de muur).
// De twee briefjes van de gebruiker zijn gemeten onder die lamp en blijven zoals ze zijn.
{
  const KLEUREN = [
    ['rood', [200, 50, 60], 'trampoline'], ['donkerrood', [165, 35, 45], 'trampoline'],
    ['groen', [95, 165, 85], 'booster'], ['neongroen', [140, 210, 80], 'booster'],
    ['blauw', [60, 120, 200], 'breek'], ['lichtblauw', [110, 170, 225], 'breek'],
    ['geel', [214, 196, 90], null], ['oranje', [235, 140, 40], null], ['roze', [240, 120, 170], null],
    ['wit', [236, 236, 230], null], ['bruin', [120, 85, 60], null], ['zwart', [40, 40, 42], null],
    ['grijs', [112, 112, 112], null], ['kraft', [165, 125, 85], null], ['zalm', [240, 150, 130], null],
    ['donker (gebruiker)', [69, 64, 50], null, true], ['bruin (gebruiker)', [104, 78, 57], null, true],
  ];
  const plekken = [];
  for (const y of [45, 100, 155]) for (const x of [55, 115, 175, 235, 295, 350]) plekken.push([x, y]);
  const LAMPEN = [['muurlamp', null], ['plus warme lamp', [1.08, 1, 0.88]], ['plus koele lamp', [0.9, 1, 1.12]]];
  // Twee opstellingen, zodat elke kleur zowel links (warm) als rechts (neutraal) hangt.
  const traag = [], mis = [], vals = [];
  for (const [lnaam, lamp] of LAMPEN) {
    for (const draai of [0, 9]) {
      const notes = KLEUREN.map(([naam, c, soort, eigen], k) => {
        const [x, y] = plekken[(k + draai) % plekken.length];
        return { naam, x, y, w: 24, h: 24, c, soort, lamp: !eigen, eerst: -1, fout: 0 };
      });
      const r = rng(21 + draai), v = makeVision(VW, VH);
      const opt = lamp ? { lamp } : {};
      leer(v, [], r, opt);
      for (let f = 0; f < 30; f++) {
        beeld(v, notes, r, opt);
        const tr = v.detect(1 / 30);
        for (const o of notes) {
          const t = bij(tr, o);
          if (!t) continue;
          if (o.soort && t.kind === o.soort && o.eerst < 0) o.eerst = f;
          if (t.kind && t.kind !== o.soort) o.fout++;
        }
      }
      for (const o of notes) {
        const waar = lnaam + ', ' + (o.x < 200 ? 'links' : 'rechts');
        if (o.soort && o.eerst < 0) mis.push(o.naam + ' (' + waar + ')');
        else if (o.soort && o.eerst > 15) traag.push(o.naam + ' ' + sec(o.eerst) + ' (' + waar + ')');
        if (o.fout) vals.push(o.naam + ' ' + o.fout + '× (' + waar + ')');
      }
    }
  }
  check('rood, groen en blauw krijgen hun soort', mis.length === 0, mis.length ? '(nooit: ' + mis.join(', ') + ')' : '(36 van 36)');
  check('... binnen een halve seconde', traag.length === 0, traag.length ? '(' + traag.join(', ') + ')' : '');
  check('geel, oranje, roze, wit, bruin, zwart, grijs: nooit een soort', vals.length === 0,
    vals.length ? '(' + vals.join(', ') + ')' : '(66 briefjes, onder drie soorten licht)');
}
{
  // Hysterese: een bal die over een rood briefje valt, maakt het niet even gewoon.
  const r = rng(22), v = makeVision(VW, VH);
  const ROOD = { x: 200, y: 100, w: 24, h: 24, c: [200, 50, 60], lamp: true };
  leer(v, [], r, { wit: true });
  const PW = 256, PH = 144, toUV = (x, y) => [(x - P.x0) / (P.x1 - P.x0), (y - P.y0) / (P.y1 - P.y0)];
  const luma = new Float32Array(PW * PH), signed = new Float32Array(PW * PH);
  let soort = null, wissel = 0, eerst = -1;
  for (let f = 0; f < 90; f++) {
    const balls = f < 20 ? [] : [[206, ((f * 5) % 120) + 50], [218, ((f * 5 + 60) % 120) + 50]];
    beeld(v, [ROOD], r, { licht: (x, y) => balls.some(([bx, by]) => (x - bx) ** 2 + (y - by) ** 2 < 36) ? 1 : 0 });
    tekenBallen(balls, luma, signed, PW, PH, toUV);
    v.setProjection(luma, PW, PH, toUV, signed);
    const t = bij(v.detect(1 / 30), ROOD), k = t ? t.kind : null;
    if (eerst >= 0 && k !== soort) wissel++;
    if (k === 'trampoline' && eerst < 0) eerst = f;
    soort = k;
  }
  check('rood briefje met ballen erover blijft trampoline', eerst >= 0 && eerst < 15 && wissel === 0,
    '(vanaf ' + (eerst < 0 ? 'nooit' : sec(eerst)) + ', ' + wissel + '× gewisseld)');
}

// ---- 2. is de camera verschoven? --------------------------------------------
{
  const r = rng(12), v = makeVision(VW, VH);
  check('zonder geleerde muur: cameraShift geeft null', v.cameraShift() === null);
  leer(v, [DONKER, BRUIN, GEEL], r);
  const meet = (opt, extra) => { beeld(v, extra ? [DONKER, BRUIN, GEEL, extra] : [DONKER, BRUIN, GEEL], r, opt); return v.cameraShift(); };
  const uitleg = (s) => '(' + s.dx + ', ' + s.dy + ' cellen, verhouding ' + s.ratio.toFixed(2) + ', ' + s.n + ' meetcellen)';
  const stil = meet({});
  check('stilstaande camera: niet verschoven', !stil.moved && stil.dx === 0 && stil.dy === 0, uitleg(stil));
  for (const [dx, dy] of [[6, 0], [-9, 0], [12, 0], [0, 6], [0, -9], [0, 12], [-9, 6], [12, -12]]) {
    const s = meet({ shift: [dx, dy] });
    const goed = s.moved && Math.sign(s.dx) === Math.sign(dx) && Math.sign(s.dy) === Math.sign(dy) &&
      Math.abs(s.dx * v.cell - dx) <= v.cell && Math.abs(s.dy * v.cell - dy) <= v.cell;
    check('camera ' + dx + ', ' + dy + ' px verschoven: gezien, goede kant op', goed, uitleg(s));
  }
  for (const g of [1.2, 0.8]) {
    const s = meet({ gain: g });
    check('licht ' + (g > 1 ? '+' : '-') + '20%: niet verschoven', !s.moved, uitleg(s));
  }
  const mens = meet({}, { x: 120, y: 0, w: 170, h: 240, c: [40, 48, 80] });
  check('mens voor 40% van het beeld: niet verschoven', !mens.moved, uitleg(mens));
  const shirt = meet({}, { x: 150, y: 20, w: 170, h: 220, c: [230, 230, 235] });
  check('mens met wit shirt voor 40%: niet verschoven', !shirt.moved, uitleg(shirt));
  const klein = meet({ shift: [3, 0] });
  check('één cel verschoven: nog niet (dat vangt de muur zelf op)', !klein.moved, uitleg(klein));
}

// ---- 3. het lichtmodel van de beamer ----------------------------------------
// Acht ballen vallen onafgebroken over het briefje. In het camerabeeld is een bal
// extra beamerlicht (een donker briefje kaatst er weinig van terug); het spel geeft
// door wat het tekent: projLuma zoals main.js nu, en 'signed' (1 = vol wit).
function tekenBallen(balls, luma, signed, PW, PH, toUV, RB = 6, FL = 64) {
  luma.fill(0); signed.fill(0);
  for (const [bx, by] of balls) {
    const [u, w] = toUV(bx, by), px = u * PW, py = w * PH, rr = RB * PW / (P.x1 - P.x0);
    for (let yy = Math.floor(py - rr); yy <= py + rr; yy++) {
      for (let xx = Math.floor(px - rr); xx <= px + rr; xx++) {
        if (xx >= 0 && yy >= 0 && xx < PW && yy < PH && (xx - px) ** 2 + (yy - py) ** 2 < rr * rr) {
          luma[yy * PW + xx] = 255 - FL; signed[yy * PW + xx] = 1;
        }
      }
    }
  }
}
function ballenRegen(note, { model = true, lag = 0, off = 0, frames = 120, seed = 2 } = {}) {
  const PW = 256, PH = 144, RB = 6;
  const toUV = (x, y) => [(x - P.x0) / (P.x1 - P.x0), (y - P.y0) / (P.y1 - P.y0)];
  const ballen = (f) => [0, 1, 2, 3, 4, 5, 6, 7].map(k => [96 + ((k * 13) % 34), ((f * 5 + k * 11) % 80) + 55]);
  const r = rng(seed), v = makeVision(VW, VH);
  leer(v, [], r, { wit: model });
  const luma = new Float32Array(PW * PH), signed = new Float32Array(PW * PH);
  let eerst = -1, uit = 0, sporen = 0;
  for (let f = 0; f < frames; f++) {
    // wat de camera ziet, loopt lag beelden achter en ligt off px naast wat we tekenen
    const cam = ballen(f - lag).map(([x, y]) => [x + off, y + off / 2]);
    beeld(v, note ? [note] : [], r, { licht: (x, y) => cam.some(([bx, by]) => (x - bx) ** 2 + (y - by) ** 2 < RB * RB) ? 1 : 0 });
    tekenBallen(ballen(f), luma, signed, PW, PH, toUV, RB);
    v.setProjection(luma, PW, PH, toUV, model ? signed : undefined);
    const tr = v.detect(1 / 30);
    if (note) {
      const ok = telt(v, bij(tr, note));
      if (ok && eerst < 0) eerst = f;
      if (eerst >= 0 && !ok) uit++;
    } else if (f >= 30 && tr.length) sporen++;
  }
  return { eerst, uit, sporen, v };
}
{
  const oud = ballenRegen(DONKER, { model: false, frames: 90 });
  const nu = ballenRegen(DONKER);
  check('8 ballen over het donkere briefje: telt binnen 2 s en blijft', nu.v.hasResponse && nu.eerst >= 0 && nu.eerst < 60 && nu.uit === 0,
    '(vanaf ' + (nu.eerst < 0 ? 'nooit' : sec(nu.eerst)) + ', daarna ' + nu.uit + ' beelden uit; zonder lichtmodel: ' +
    (oud.eerst < 0 ? 'niet binnen 3 s' : sec(oud.eerst)) + ')');
  const laat = ballenRegen(DONKER, { lag: 1, off: 1.5 });
  check('... ook als de camera een beeld achterloopt en 1,5 px naast zit', laat.eerst >= 0 && laat.eerst < 60 && laat.uit === 0,
    '(vanaf ' + (laat.eerst < 0 ? 'nooit' : sec(laat.eerst)) + ', daarna ' + laat.uit + ' beelden uit)');
  const bruin = ballenRegen(BRUIN);
  check('8 ballen over het bruine briefje: telt binnen 2 s en blijft', bruin.eerst >= 0 && bruin.eerst < 60 && bruin.uit === 0,
    '(vanaf ' + (bruin.eerst < 0 ? 'nooit' : sec(bruin.eerst)) + ', daarna ' + bruin.uit + ' beelden uit)');
  for (const [lag, off] of [[0, 0], [1, 1.5], [2, 3]]) {
    const leeg = ballenRegen(null, { lag, off, frames: 90 });
    check('lege muur, 8 ballen' + (lag ? ' (' + lag + ' beeld(en) achter, ' + off + ' px ernaast)' : '') + ': nooit een voorwerp',
      leeg.sporen === 0, '(' + leeg.sporen + ' beelden met een spoor na de eerste seconde)');
  }
}
{
  // Zonder 'signed' doet het lichtmodel niets: precies hetzelfde als zonder wit te leren.
  // Beide krijgen dezelfde beelden; b ziet eerst ook nog de beamer vol wit.
  const PW = 256, PH = 144, toUV = (x, y) => [(x - P.x0) / (P.x1 - P.x0), (y - P.y0) / (P.y1 - P.y0)];
  const a = makeVision(VW, VH), b = makeVision(VW, VH), r = rng(31);
  const beide = (dingen, opt) => { beeld(a, dingen, r, opt); b.data = a.data; b.sampleCells(); };
  b.beginResponse();
  for (let i = 0; i < 10; i++) { beeld(b, [], r, { licht: () => 1 }); b.addResponseFrame(); }
  b.endResponse();
  a.beginBackground(); b.beginBackground();
  for (let i = 0; i < 30; i++) { beide([], {}); a.addBackgroundFrame(); b.addBackgroundFrame(); }
  a.endBackground(); b.endBackground();
  const luma = new Float32Array(PW * PH), signed = new Float32Array(PW * PH);
  let anders = 0;
  for (let f = 0; f < 30; f++) {
    const balls = [[110, (f * 5) % 150 + 40], [200, (f * 7) % 150 + 40]];
    beide([DONKER, GEEL], { licht: (x, y) => balls.some(([bx, by]) => (x - bx) ** 2 + (y - by) ** 2 < 36) ? 1 : 0 });
    tekenBallen(balls, luma, signed, PW, PH, toUV);
    a.setProjection(luma, PW, PH, toUV); b.setProjection(luma, PW, PH, toUV);
    const ta = a.detect(1 / 30), tb = b.detect(1 / 30);
    if (ta.length !== tb.length || a.mask.some((m, i) => m !== b.mask[i]) || ta.some((t, k) => t.cx !== tb[k].cx || t.cy !== tb[k].cy)) anders++;
  }
  check('wit geleerd maar geen signed: precies als zonder lichtmodel', b.hasResponse && anders === 0, '(' + anders + ' beelden anders)');
  b.clearBackground();
  check('muur wissen gooit het lichtmodel weg', !b.hasResponse && !b.resp);
  const c = makeVision(VW, VH), rc = rng(33);
  leer(c, [], rc, { wit: true });
  leer(c, [], rc);
  check('muur opnieuw geleerd zonder wit: geen oud lichtmodel', !c.hasResponse);
  // wit gemeten, maar het leren van de muur afgebroken: de volgende poging is te laat
  c.beginResponse();
  for (let i = 0; i < 5; i++) { beeld(c, [], rc, { licht: () => 1 }); c.addResponseFrame(); }
  c.endResponse();
  c.beginBackground();
  leer(c, [], rc);
  check('leren afgebroken na het wit: geen oud lichtmodel', !c.hasResponse);
  leer(c, [], rc, { wit: true });
  c.allocate();
  check('nieuw raster: geen lichtmodel', !c.hasResponse && !c.resp);
}

// ---- 4. stille camera -------------------------------------------------------
// Kraftbruin op het neutrale deel en middengrijs op het warme deel van de muur zaten
// net onder de gewone drempel. Met de camerakorrel van deze tests (een stille camera)
// mag die drempel een kwart omlaag.
{
  const KRAFT = { x: 300, y: 150, w: 26, h: 18, c: [165, 125, 85] };
  const GRIJS = { x: 70, y: 60, w: 26, h: 18, c: [112, 112, 112] };
  for (const [naam, note] of [['kraftbruin', KRAFT], ['middengrijs', GRIJS]]) {
    const proef = (stil) => {
      const r = rng(5), v = makeVision(VW, VH);
      leer(v, [], r);
      const qf = v.quietFactor;
      if (!stil) v.quietFactor = 1;
      let eerst = -1, uit = 0;
      for (let f = 0; f < 75; f++) {
        beeld(v, [note], r);
        const ok = telt(v, bij(v.detect(1 / 30), note));
        if (ok && eerst < 0) eerst = f;
        if (eerst >= 0 && !ok) uit++;
      }
      return { eerst, uit, qf };
    };
    const a = proef(true), b = proef(false);
    check(naam + ' briefje telt mee bij een stille camera', a.eerst >= 0 && a.eerst < 60 && a.uit === 0 && b.eerst < 0,
      '(quietFactor ' + a.qf.toFixed(2) + ': vanaf ' + (a.eerst < 0 ? 'nooit' : sec(a.eerst)) + ', ' + a.uit + ' beelden uit; zonder: ' +
      (b.eerst < 0 ? 'nooit' : sec(b.eerst)) + ')');
  }
  const r = rng(6), v = makeVision(VW, VH);
  v.beginBackground();
  for (let i = 0; i < 30; i++) { beeld(v, [], r, { ruis: 60 }); v.addBackgroundFrame(); }
  v.endBackground();
  check('korrelige camera: gewone drempel', v.quietFactor > 0.95, '(quietFactor ' + v.quietFactor.toFixed(2) + ')');
}

klaar();
