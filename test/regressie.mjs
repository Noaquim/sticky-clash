// Bugs die bij de audit gevonden en bevestigd zijn. Elke test hier faalde op de
// oude code; ze moeten blijven slagen.

import { makeVision, paint, learnWall, rect, layer, rng, oordeel, check, klaar } from './hulp.mjs';

// ---- 1. na een andere uitsnede: geen NaN, geen balk die altijd voorwerp is --------
// Oorzaak: een hulpbuffer die bij een groter raster niet opnieuw werd aangemaakt.
{
  const r = rng(1);
  const v = makeVision(384, 240);                     // raster 128x80
  learnWall(v, r);
  const lw = 64, lh = 36, luma = new Float32Array(lw * lh).fill(3);
  v.setProjection(luma, lw, lh, (x, y) => [x / v.vw, y / v.vh]);

  v.vw = 426; v.vh = 240;                             // camera herstart: raster 142x80
  v.allocate();
  v.maskImage = { data: new Uint8ClampedArray(v.cols * v.rows * 4) };
  learnWall(v, r);
  v.setProjection(luma, lw, lh, (x, y) => [x / v.vw, y / v.vh]);
  let nan = 0;
  for (const x of v.projLuma) if (Number.isNaN(x)) nan++;
  paint(v, () => null, r);
  v.classifyObject();
  let fg = 0;
  for (const m of v.mask) fg += m ? 1 : 0;
  check('ander raster: geen NaN in de lichtvoorspelling', nan === 0, `(${nan} NaN)`);
  check('ander raster: lege muur geeft geen voorgrond', fg === 0, `(${fg} cellen)`);
}

// ---- 2. een spoor steelt de vlek van zijn buurman niet --------------------------
// Oorzaak: sporen kozen om de beurt de dichtstbijzijnde vlek. Viel A even weg, dan
// pakte A de vlek van B, en de obstakels gleden over elkaar heen.
{
  const r = rng(2);
  const v = makeVision();
  learnWall(v, r);
  const G = [95, 165, 85];
  const A = rect(128, 110, 15, 15, G), B = rect(163, 110, 15, 15, G);   // 35 px uit elkaar
  for (let i = 0; i < 30; i++) { paint(v, layer(A, B), r); v.detect(1 / 30); }
  const idA = v.tracks.find(t => t.cx < 150).id, idB = v.tracks.find(t => t.cx > 150).id;
  let maxSpeedB = 0;
  for (let i = 0; i < 6; i++) {                        // A zes frames weg (hand ervoor)
    paint(v, B, r);
    v.detect(1 / 30);
    const tb = v.tracks.find(t => t.id === idB);
    if (tb) maxSpeedB = Math.max(maxSpeedB, Math.hypot(tb.vx, tb.vy));
  }
  for (let i = 0; i < 20; i++) { paint(v, layer(A, B), r); v.detect(1 / 30); }
  const nuA = v.tracks.find(t => t.cx < 150), nuB = v.tracks.find(t => t.cx > 150);
  check('buurman wegvallen: B houdt zijn eigen id', nuB && nuB.id === idB, `(was ${idB}, nu ${nuB && nuB.id})`);
  check('buurman wegvallen: A krijgt zijn oude id terug', nuA && nuA.id === idA, `(was ${idA}, nu ${nuA && nuA.id})`);
  check('buurman wegvallen: B schiet niet weg', maxSpeedB < 60, `(${maxSpeedB.toFixed(0)} px/s)`);
}

// ---- 3. spoken onder ons eigen licht ------------------------------------------
// Cellen die al voorwerp waren houden we vast als alleen ons licht ze verstopt. Dat
// mag nooit een eeuwig spook opleveren als het voorwerp écht weg is.
const VW = 426, VH = 240, K = 0.6;
function cam(v, light, note, r) {
  const px = new Uint8ClampedArray(VW * VH * 4);
  for (let y = 0; y < VH; y++) for (let x = 0; x < VW; x++) {
    let c = [168, 168, 166];
    if (note && x >= note.x0 && x < note.x1 && y >= note.y0 && y < note.y1) c = [95, 165, 85];
    const L = light(x, y), i = (y * VW + x) * 4;
    for (let k = 0; k < 3; k++) px[i + k] = Math.min(255, c[k] + K * L) + (r() - 0.5) * 3.5;
    px[i + 3] = 255;
  }
  v.data = px;
  v.sampleCells();
}
function predict(v, light) {
  for (let y = 0; y < v.rows; y++) for (let x = 0; x < v.cols; x++) {
    v.projLuma[y * v.cols + x] = light((x + 0.5) * v.cell, (y + 0.5) * v.cell);
  }
  v.spreadProjection();
}
function leeg(v, r) {
  v.beginBackground();
  for (let i = 0; i < 8; i++) { cam(v, () => 0, null, r); v.addBackgroundFrame(); }
  v.endBackground();
}

{ // A: bal rust op de post-it, post-it wordt weggehaald, het licht van de bal blijft
  const r = rng(3), v = makeVision(VW, VH);
  leeg(v, r);
  const note = { x0: 200, x1: 230, y0: 120, y1: 150 };
  let aan = false;
  const bal = (x, y) => (aan && Math.hypot(x - 215, y - 114) < 8 ? 255 : 0);
  let na = 0;
  for (let f = 0; f < 120; f++) {
    aan = f >= 15;
    predict(v, bal);
    cam(v, bal, f < 40 ? note : null, r);
    const tr = v.detect(1 / 30);
    if (f >= 48 && tr.some(t => oordeel(v, t) === 'ok')) na++;
  }
  check('bal op weggehaalde post-it: geen spook', na === 0, `(${na} frames)`);
}

{ // C: tekst geprojecteerd over een post-it, post-it weggehaald
  const r = rng(4), v = makeVision(VW, VH);
  leeg(v, r);
  const note = { x0: 200, x1: 245, y0: 120, y1: 165 };
  let aan = false;
  const tekst = (x, y) => (aan && x >= 190 && x < 260 && y >= 130 && y < 150 ? 220 : 0);
  let laatste = -1;
  for (let f = 0; f < 120; f++) {
    aan = f >= 20;
    predict(v, tekst);
    cam(v, tekst, f < 40 ? note : null, r);
    const tr = v.detect(1 / 30);
    if (f >= 40 && tr.length) laatste = f;
  }
  const naloop = laatste < 0 ? 0 : laatste - 39;
  check('tekst over weggehaalde post-it: weg binnen 8 frames', naloop <= 8, `(${naloop} frames)`);
}

{ // Eigen licht op de rand van een post-it mag hem niet opvreten
  const r = rng(5), v = makeVision(VW, VH);
  leeg(v, r);
  const note = { x0: 200, x1: 236, y0: 120, y1: 156 };
  let aan = false;
  const bal = (x, y) => (aan && Math.hypot(x - 218, y - 116) < 9 ? 255 : 0);   // bal rust op de bovenrand
  let voor = 0, na = 0, n = 0;
  for (let f = 0; f < 150; f++) {
    aan = f >= 40;
    predict(v, bal);
    cam(v, bal, note, r);
    const tr = v.detect(1 / 30);
    const t = tr.find(t => Math.hypot(t.cx - 218, t.cy - 138) < 20);
    if (f === 39 && t) voor = t.cells;
    if (f >= 120 && t) { na += t.cells; n++; }
  }
  const gem = n ? na / n : 0;
  check('bal op de rand: post-it blijft heel', voor > 0 && gem > voor * 0.8,
    `(${voor} cellen voor, ${gem.toFixed(0)} erna)`);
}

klaar();
