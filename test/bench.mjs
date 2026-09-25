// Meetlat voor de voorwerpherkenning.
//
// Bouwt een camerabeeld na dat lijkt op de echte opstelling: een gestuukte muur op
// 3-4 meter, kleine post-its, beamerlicht dat over de muur valt, cameraruis, en een
// automatische belichting die meebeweegt. Daar meten we op:
//
//   - hoeveel van de post-its gevonden worden (recall)
//   - hoeveel valse voorwerpen erbij komen (precisie)
//   - hoe strak de omlijning om een post-it valt
//   - of een passerend mens wordt opgepikt
//
// Draai met: node bench.mjs

globalThis.document = {
  createElement: () => ({
    getContext: () => ({ createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }) }),
  }),
};
const { Vision } = await import('../js/vision.js');

const VW = 320, VH = 240;

// ---- deterministische ruis -------------------------------------------------
function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

// ---- het tafereel ----------------------------------------------------------
// Beamervlak beslaat het middenstuk van het beeld, net als in de echte opstelling.
const PROJ = { x0: 96, y0: 70, x1: 286, y1: 196 };

function wallColour(x, y, r) {
  // lichte muur met wat structuur en een donkere voeg
  let v = 168 + Math.sin(x * 0.07) * 4 + Math.cos(y * 0.11) * 3;
  if (Math.abs((y % 41) - 20) < 1) v -= 26;          // horizontale voeg
  if (Math.abs((x % 63) - 31) < 1) v -= 20;          // verticale voeg
  return [v + r() * 2, v + r() * 2, v * 0.99 + r() * 2];
}

/**
 * @param {object} o  scene-opties
 * @returns {Uint8ClampedArray} RGBA-beeld
 */
function renderScene(o, roi) {
  const r = rng(o.seed || 1);
  const px = new Uint8ClampedArray(VW * VH * 4);
  // Met uitsnede kijkt hetzelfde aantal werkpixels naar een kleiner stuk muur.
  const sx = roi ? roi.sx : 0, sy = roi ? roi.sy : 0;
  const kx = roi ? roi.sw / VW : 1, ky = roi ? roi.sh / VH : 1;
  const gain = o.exposure == null ? 1 : o.exposure;
  const noise = o.noise == null ? 3.5 : o.noise;

  for (let yy = 0; yy < VH; yy++) {
    for (let xx = 0; xx < VW; xx++) {
      const x = sx + xx * kx, y = sy + yy * ky;
      let c = wallColour(x, y, r);

      // buiten het beamervlak is het donkerder (kamerlicht valt weg)
      const inProj = x >= PROJ.x0 && x <= PROJ.x1 && y >= PROJ.y0 && y <= PROJ.y1;
      if (!inProj) c = c.map(v => v * 0.55);

      // beamerlicht: donkere achtergrond, maar de HUD en de bak lichten op
      if (inProj && o.projector) {
        const py = (y - PROJ.y0) / (PROJ.y1 - PROJ.y0);
        const pxn = (x - PROJ.x0) / (PROJ.x1 - PROJ.x0);
        let add = 6;                                        // zwart is nooit helemaal zwart
        if (py < 0.10) add += 40;                           // scorebalk bovenin
        const dg = Math.hypot(pxn - 0.55, py - 0.80);
        if (dg < 0.10) add += 70 * (1 - dg / 0.10);         // groene bak
        c = [c[0] + add * 0.8, c[1] + add, c[2] + add * 0.7];
      }

      // voorwerpen
      for (const ob of o.objects || []) {
        if (x >= ob.x && x < ob.x + ob.w && y >= ob.y && y < ob.y + ob.h) {
          c = [ob.c[0] + r() * 3, ob.c[1] + r() * 3, ob.c[2] + r() * 3];
        }
      }

      // mens: een verticale vorm die deels het beeld uit loopt
      if (o.person) {
        const p = o.person;
        const w = p.w + Math.sin(y * 0.2 + p.phase) * 2;    // golvende omtrek
        if (Math.abs(x - p.x) < w && y > p.top) {
          c = y < p.top + 26 ? [196, 150, 122] : [238, 238, 242];   // hoofd, dan shirt
        }
      }

      // slagschaduw naast een voorwerp
      for (const sh of o.shadows || []) {
        if (x >= sh.x && x < sh.x + sh.w && y >= sh.y && y < sh.y + sh.h) {
          c = c.map(v => v * 0.62);
        }
      }

      const i = (yy * VW + xx) * 4;
      px[i] = c[0] * gain + (r() - 0.5) * noise;
      px[i + 1] = c[1] * gain + (r() - 0.5) * noise;
      px[i + 2] = c[2] * gain + (r() - 0.5) * noise;
      px[i + 3] = 255;
    }
  }
  return px;
}

// ---- Vision aansturen zonder camera ----------------------------------------
function makeVision(tune) {
  const v = new Vision();
  v.vw = VW; v.vh = VH;
  v.allocate();
  const n = v.cols * v.rows;
  v.maskImage = { data: new Uint8ClampedArray(n * 4) };
  v.mode = 'object'; v.ready = true;
  v.minCells = 8;
  v.objThresh = 70 - 60 * 0.56;                    // regelaar op 60, zoals standaard
  Object.assign(v, tune || {});
  // detect() roept grab() aan; dat wil hier een canvas. We voeren het beeld zelf aan.
  v.grab = () => true;
  v.feed = (scene) => { v.data = renderScene(scene, v.benchRoi); v.sampleCells(); };
  return v;
}

// werkpixel -> plek op de echte muur
const toWall = (v, x, y) => {
  const r = v.benchRoi;
  return r ? [r.sx + x * r.sw / VW, r.sy + y * r.sh / VH] : [x, y];
};
const inProjCell = (v, cx, cy) => {
  const w = toWall(v, (cx + 0.5) * v.cell, (cy + 0.5) * v.cell);
  return w[0] >= PROJ.x0 && w[0] <= PROJ.x1 && w[1] >= PROJ.y0 && w[1] <= PROJ.y1;
};

/** Past de afkeurregels uit main.js toe, zodat we meten wat het spel écht gebruikt. */
function accepted(v, tracks, opt) {
  const projCells = (() => {
    let n = 0;
    for (let cy = 0; cy < v.rows; cy++) for (let cx = 0; cx < v.cols; cx++) if (inProjCell(v, cx, cy)) n++;
    return n;
  })();
  const out = [];
  const why = {};
  for (const t of tracks) {
    const drop = (k) => { why[k] = (why[k] || 0) + 1; };
    const vermomd = v.disguise(t);
    if (vermomd && !t.trusted) { drop(vermomd); continue; }
    if (t.touchEdge) { drop('rand'); continue; }
    let outside = false;
    for (const c of t.corners) {
      const w = toWall(v, c[0], c[1]);
      if (w[0] < PROJ.x0 || w[0] > PROJ.x1 || w[1] < PROJ.y0 || w[1] > PROJ.y1) { outside = true; break; }
    }
    if (outside) { drop('buiten'); continue; }
    if (t.solidity < 0.72) { drop('vorm'); continue; }
    if (t.age >= 12 && !t.rigid) { drop('mens'); continue; }
    out.push(t);
  }
  return { out, why };
}

// ---- de proeven ------------------------------------------------------------
// Post-its op een echte muur: 76mm breed. Camera op 3,5 m met een 60-graden lens
// ziet ~3,8 m breed in 320 pixels -> ~6 px per post-it. Daarom ook 4 en 9 px erbij
// als ondergrens en als "camera dichterbij".
const NOTES = [
  { id: 'postit-ver (8px)',    x: 118, y: 100, w: 8,  h: 8,  c: [95, 165, 85] },
  { id: 'postit-normaal (15px)', x: 150, y: 96,  w: 15, h: 15, c: [95, 165, 85] },
  { id: 'postit-dichtbij (24px)', x: 196, y: 108, w: 24, h: 24, c: [95, 165, 85] },
  { id: 'wit-kaartje (20px)',  x: 116, y: 150, w: 20, h: 14, c: [222, 220, 214] },
  { id: 'boek-donker (34px)',  x: 172, y: 150, w: 34, h: 24, c: [58, 64, 96] },
];

function learn(v, scene) {
  v.beginBackground();
  for (let i = 0; i < 8; i++) { v.feed({ ...scene, seed: 100 + i }); v.addBackgroundFrame(); }
  v.endBackground();
}

function settle(v, scene, frames = 20) {
  let tr = [];
  for (let i = 0; i < frames; i++) { v.feed({ ...scene, seed: 500 + i }); tr = v.detect(1 / 30); }
  return tr;
}

function hit(v, tracks, note) {
  const cx = note.x + note.w / 2, cy = note.y + note.h / 2;
  return tracks.find(t => {
    const w = toWall(v, t.cx, t.cy);
    return Math.hypot(w[0] - cx, w[1] - cy) < Math.max(10, note.w);
  });
}

function areaOf(poly) {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const q = poly[(i + 1) % poly.length];
    a += poly[i][0] * q[1] - q[0] * poly[i][1];
  }
  return Math.abs(a) / 2;
}

function proef(naam, sceneExtra, opt = {}) {
  const v = makeVision(opt.tune);
  if (opt.roi) {
    const pad = 0.12;
    const w = PROJ.x1 - PROJ.x0, h = PROJ.y1 - PROJ.y0;
    v.benchRoi = { sx: PROJ.x0 - w * pad, sy: PROJ.y0 - h * pad, sw: w * (1 + 2 * pad), sh: h * (1 + 2 * pad) };
  }
  // opt.dim: de hele kamer is donker, ook tijdens het leren van de muur
  const base = { projector: sceneExtra.projector !== false, objects: [],
    exposure: opt.dim ? sceneExtra.exposure : 1, noise: opt.dim ? sceneExtra.noise : undefined };
  learn(v, base);
  const scene = { ...base, objects: NOTES, ...sceneExtra };
  const tracks = settle(v, scene, 30);
  const { out, why } = accepted(v, tracks, opt);

  const gevonden = NOTES.filter(nt => hit(v, out, nt));
  const gemist = NOTES.filter(nt => !hit(v, out, nt));
  const vals = out.length - gevonden.length;

  let strak = '-';
  const grootste = hit(v, out, NOTES[1]);   // de maat die bij zijn opstelling hoort
  if (grootste) {
    const k = v.benchRoi ? (v.benchRoi.sw / VW) * (v.benchRoi.sh / VH) : 1;
    strak = ((areaOf(grootste.corners) * k / (NOTES[1].w * NOTES[1].h) - 1) * 100).toFixed(0) + '%';
  }

  console.log(
    naam.padEnd(30),
    `gevonden ${gevonden.length}/${NOTES.length}`.padEnd(14),
    `vals ${vals}`.padEnd(8),
    `omlijning ${strak.startsWith("-") ? "" : "+"}${strak}`.padEnd(18),
    gemist.length ? 'mist: ' + gemist.map(g => g.id.split(' ')[0]).join(',') : '',
    Object.keys(why).length ? '| afgekeurd: ' + Object.entries(why).map(([k, n]) => n + '× ' + k).join(', ') : ''
  );
  return { gevonden: gevonden.length, vals, why };
}

console.log('=== meetlat voorwerpherkenning ===');
console.log('beamervlak:', PROJ.x1 - PROJ.x0, 'x', PROJ.y1 - PROJ.y0, 'px van', VW, 'x', VH);
console.log('');

proef('rustige kamer', {});
proef('beamer uit', { projector: false });
proef('meer cameraruis', { noise: 9 });
proef('belichting 15% omhoog', { exposure: 1.15 });
proef('belichting 15% omlaag', { exposure: 0.85 });
proef('met slagschaduwen', { shadows: [{ x: 172, y: 105, w: 12, h: 8 }, { x: 212, y: 128, w: 14, h: 10 }] });
proef('mens loopt door beeld', { person: { x: 250, top: 40, w: 26, phase: 0 } });
proef('mens + schaduw', {
  person: { x: 250, top: 40, w: 26, phase: 0 },
  shadows: [{ x: 172, y: 105, w: 12, h: 8 }],
});

console.log('');
console.log('--- met beeld bijgesneden tot het beamervlak (P5) ---');
proef('rustige kamer', {}, { roi: true });
proef('meer cameraruis', { noise: 9 }, { roi: true });
proef('belichting 15% omlaag', { exposure: 0.85 }, { roi: true });
proef('met slagschaduwen', { shadows: [{ x: 172, y: 105, w: 12, h: 8 }, { x: 212, y: 128, w: 14, h: 10 }] }, { roi: true });
proef('mens loopt door beeld', { person: { x: 250, top: 40, w: 26, phase: 0 } }, { roi: true });

console.log('');
console.log('--- donkere kamer: alleen de muurverlichting, met camerakorrel ---');
proef('schemerig (50% licht)', { exposure: 0.5, noise: 6 }, { roi: true, dim: true });
proef('donker (35% licht)', { exposure: 0.35, noise: 7 }, { roi: true, dim: true });
proef('heel donker (22% licht)', { exposure: 0.22, noise: 8 }, { roi: true, dim: true });
proef('heel donker + mens', { exposure: 0.22, noise: 8, person: { x: 250, top: 40, w: 26, phase: 0 } }, { roi: true, dim: true });
