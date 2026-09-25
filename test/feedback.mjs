// De vondst die alles verklaarde: het spel projecteert zijn eigen omlijning op het
// voorwerp dat het meet, en maakt dat voorwerp daarmee onzichtbaar. Detecteren ->
// omlijnen -> kwijtraken -> omlijning weg -> detecteren, een paar keer per seconde.
//
// Deze test zet die omlijning er expliciet op en controleert dat het voorwerp blijft.

globalThis.document = {
  createElement: () => ({
    getContext: () => ({ createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }) }),
  }),
};
const { Vision } = await import('../js/vision.js');

const VW = 240, VH = 180;
function mk() {
  const v = new Vision();
  v.vw = VW; v.vh = VH; v.allocate();
  v.maskImage = { data: new Uint8ClampedArray(v.cols * v.rows * 4) };
  v.mode = 'object'; v.ready = true; v.minCells = 8;
  v.objThresh = 70 - 60 * 0.56;
  v.grab = () => true;
  return v;
}

const WALL = [170, 170, 170];
const NOTE = { x: 100, y: 80, w: 15, h: 15, c: [95, 165, 85] };

/** @param outline breedte van de geprojecteerde lijn op de rand van het briefje, in px */
function frame(v, outline, glow, offset, withNote = true) {
  const px = new Uint8ClampedArray(VW * VH * 4);
  for (let y = 0; y < VH; y++) for (let x = 0; x < VW; x++) {
    let c = WALL.slice();
    const on = withNote && x >= NOTE.x && x < NOTE.x + NOTE.w && y >= NOTE.y && y < NOTE.y + NOTE.h;
    if (on) c = NOTE.c.slice();
    if (outline) {
      const d = ringDist(x, y);
      if (d >= offset && d < offset + outline) c = [120, 235, 255];   // cyaan lijn
      else if (glow && d < offset + outline + glow && d >= offset) {
        const k = 1 - (d - offset) / (outline + glow);
        c = [c[0] + 110 * k, c[1] + 150 * k, c[2] + 160 * k];
      }
    }
    const i = (y * VW + x) * 4;
    px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2]; px[i + 3] = 255;
  }
  return px;
}

/**
 * Getekende afstand tot de rand van het briefje. Binnen het briefje negatief-achtig
 * (0), erbuiten het aantal pixels tot de rand.
 */
function ringDist(x, y) {
  const dx = Math.max(NOTE.x - x, x - (NOTE.x + NOTE.w - 1), 0);
  const dy = Math.max(NOTE.y - y, y - (NOTE.y + NOTE.h - 1), 0);
  return Math.max(dx, dy);
}

/** Wat het spel denkt te projecteren, op celniveau. */
function predict(v, outline, glow, offset) {
  const lw = 120, lh = 90;
  const luma = new Float32Array(lw * lh);
  for (let y = 0; y < lh; y++) for (let x = 0; x < lw; x++) {
    if (!outline) continue;
    const d = ringDist(x * VW / lw, y * VH / lh);
    if (d >= offset && d < offset + outline) luma[y * lw + x] = 201;
    else if (glow && d >= offset && d < offset + outline + glow) {
      luma[y * lw + x] = 201 * (1 - (d - offset) / (outline + glow)) * 0.7;
    }
  }
  v.setProjection(luma, lw, lh, (x, y) => [x / VW, y / VH]);
}

function proef(naam, outline, glow, offset = 0) {
  const v = mk();
  v.beginBackground();
  // lege muur leren: zonder het briefje
  for (let i = 0; i < 8; i++) { v.data = frame(v, 0, 0, 0, false); v.sampleCells(); v.addBackgroundFrame(); }
  v.endBackground();

  let tr = [];
  for (let i = 0; i < 12; i++) {
    predict(v, outline, glow, offset);
    v.data = frame(v, outline, glow, offset);
    v.sampleCells();
    tr = v.detect(1 / 30);
  }
  const t = tr.find(x => Math.hypot(x.cx - (NOTE.x + 7), x.cy - (NOTE.y + 7)) < 14);
  let cells = 0;
  for (let i = 0; i < v.mask.length; i++) if (v.mask[i]) cells++;
  console.log(naam.padEnd(38), t ? 'GEZIEN' : 'KWIJT ', '| voorgrondcellen', String(cells).padStart(3));
  return !!t;
}

console.log('post-it van 15x15 px, muur 170 grijs\n');
const a = proef('geen projectie erop', 0, 0);
const b = proef('OUD: lijn op de rand', 4, 0, 0);
const c = proef('OUD: lijn + gloed op de rand', 4, 7, 0);
const d = proef('NIEUW: lijn ernaast, geen gloed', 3, 0, 4);
console.log('');
if (a && d && !b) console.log('GOED: de lijn ernaast laat het voorwerp intact, de lijn erop niet');
else if (a && d) console.log('GOED: overleeft beide');
else console.log('FOUT: raakt zichzelf nog steeds kwijt');
