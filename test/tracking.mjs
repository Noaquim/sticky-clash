// Glitches in het volgen van voorwerpen, gemeten zoals je ze ziet:
//   aan/uit   — een obstakel dat even verdwijnt en terugkomt
//   ID-wissel — twee voorwerpen die van identiteit ruilen (de omlijning springt over)
//   spook     — een weggehaald voorwerp dat nog blijft kaatsen
//
// Draai met: node test/tracking.mjs   (TRACE=1 toont per frame wat er gebeurt)

import { makeVision, paint, learnWall, rect, layer, rng, oordeel, check, klaar, WALL } from './hulp.mjs';

const VH = 240;

function scenario(naam, frames, sceneAt, truth, seed = 7) {
  const v = makeVision(), r = rng(seed);
  learnWall(v, r);
  const stat = {};
  for (let f = 0; f < frames; f++) {
    paint(v, sceneAt(f), r);
    const out = v.detect(1 / 30);
    for (const T of truth(f)) {
      const s = stat[T.name] || (stat[T.name] = { frames: 0, on: 0, ids: new Set(), flick: 0, wasOn: null, trace: '' });
      if (!T.judge) continue;
      s.frames++;
      const cx = T.x + T.w / 2, cy = T.y + T.h / 2;
      let best = null, bd = 1e9;
      for (const t of out) { const d = Math.hypot(t.cx - cx, t.cy - cy); if (d < bd) { bd = d; best = t; } }
      if (!best || bd > Math.max(T.w, T.h)) {
        if (s.wasOn) s.flick++;
        s.wasOn = false; s.trace += '.';
        continue;
      }
      s.ids.add(best.id);
      const w = oordeel(v, best), on = w === 'ok';
      if (on) s.on++;
      if (s.wasOn && !on) s.flick++;
      s.wasOn = on;
      s.trace += on ? String(best.id % 10) : w[0];
    }
  }
  if (process.env.TRACE) for (const k in stat) console.log('   ' + naam + ' ' + k + ': ' + stat[k].trace);
  return stat;
}

const ORANGE = [235, 140, 40], BLUE = [50, 120, 210], YEL = [230, 215, 70];
const SKIN = [200, 150, 120], SLEEVE = [60, 66, 96];
const PA = { name: 'A', x: 150, y: 110, w: 24, h: 24 };

// 1. stilstaande post-it die af en toe één frame niet gezien wordt
{
  const s = scenario('dropout', 200,
    f => (f % 20 === 19) ? () => null : rect(PA.x, PA.y, PA.w, PA.h, ORANGE),
    f => [{ ...PA, judge: f > 30 }]).A;
  check('los frame gemist: obstakel blijft staan', s.flick === 0 && s.ids.size === 1,
    `(${s.on}/${s.frames} aan, ${s.flick}× aan/uit, ${s.ids.size} id)`);
}

// 2. twee bewegende post-its die elkaar kruisen
{
  const st = scenario('kruisen', 120,
    f => layer(rect(60 + f * 1.6, 100, 24, 24, ORANGE), rect(252 - f * 1.6, 104, 24, 24, BLUE)),
    f => {
      const a = 60 + f * 1.6, b = 252 - f * 1.6, ov = Math.abs(a - b) < 36;
      return [{ name: 'A', x: a, y: 100, w: 24, h: 24, judge: f > 20 && !ov },
              { name: 'B', x: b, y: 104, w: 24, h: 24, judge: f > 20 && !ov }];
    });
  check('twee kruisende post-its: geen ID-wissel', st.A.ids.size === 1 && st.B.ids.size === 1,
    `(A ${st.A.ids.size} id, B ${st.B.ids.size} id)`);
  check('twee kruisende post-its: geen aan/uit', st.A.flick === 0 && st.B.flick === 0,
    `(A ${st.A.flick}×, B ${st.B.flick}×)`);
}

// 3. een mouw die over een post-it heen zwaait
for (const [label, col] of [['mouw', SLEEVE], ['blote arm', SKIN]]) {
  const s = scenario('arm', 160,
    f => {
      const tip = f < 40 ? VH : f < 70 ? VH - (f - 40) * 5 : f < 90 ? VH - 150 : f < 120 ? VH - 150 + (f - 90) * 5 : VH;
      return layer(rect(154, tip, 18, VH - tip, col), rect(PA.x, PA.y, PA.w, PA.h, ORANGE));
    },
    f => [{ ...PA, judge: f > 25 }]).A;
  check(label + ' zwaait over post-it: blijft één obstakel', s.ids.size === 1 && s.flick === 0,
    `(${s.on}/${s.frames} aan, ${s.flick}× aan/uit, ${s.ids.size} id)`);
}

// 4. post-it die even gesplitst wordt door een donkere streep
{
  const s = scenario('split', 200,
    f => layer((f % 15 === 14) ? rect(PA.x - 2, PA.y + 11, PA.w + 4, 4, WALL) : null, rect(PA.x, PA.y, PA.w, PA.h, YEL)),
    f => [{ ...PA, judge: f > 25 }]).A;
  check('even in tweeën gesplitst: blijft één obstakel', s.ids.size === 1 && s.flick === 0,
    `(${s.flick}× aan/uit, ${s.ids.size} id)`);
}

// 5. boek dat heen en weer bewogen wordt op handsnelheid
const tri = (f, sp) => { const L = 200, u = (f * sp) % (2 * L); return 20 + (u < L ? u : 2 * L - u); };
for (const sp of [2.2, 6]) {
  const s = scenario('boek', 150,
    f => rect(tri(f, sp), 100, 50, 36, BLUE),
    f => [{ name: 'boek', x: tri(f, sp), y: 100, w: 50, h: 36, judge: f > 20 }]).boek;
  check(`boek bewogen met ${sp} px/frame: gevolgd zonder haperen`, s.ids.size === 1 && s.flick === 0 && s.on === s.frames,
    `(${s.on}/${s.frames} aan)`);
}

// 6. muurkleurige arm dekt de post-it 20 frames helemaal af
{
  const s = scenario('afdekken', 140,
    f => (f >= 50 && f < 70)
      ? layer(rect(146, 0, 32, VH, [186, 170, 158]), rect(PA.x, PA.y, PA.w, PA.h, ORANGE))
      : rect(PA.x, PA.y, PA.w, PA.h, ORANGE),
    f => [{ ...PA, judge: f > 25 && (f < 50 || f >= 70) }]).A;
  check('20 frames afgedekt: zelfde voorwerp komt terug', s.ids.size === 1 && s.flick === 0,
    `(${s.ids.size} id, ${s.flick}× aan/uit)`);
}

// 7. weggehaalde post-it: hoe lang kaatst hij nog na?
{
  const v = makeVision(), r = rng(3);
  learnWall(v, r);
  let spook = 0;
  for (let f = 0; f < 90; f++) {
    paint(v, f < 60 ? rect(PA.x, PA.y, PA.w, PA.h, ORANGE) : () => null, r);
    const out = v.detect(1 / 30);
    if (f >= 60 && out.some(t => oordeel(v, t) === 'ok')) spook++;
  }
  check('weggehaalde post-it verdwijnt binnen 0,25 s', spook <= 7, `(${spook} frames na)`);
}

// 8. wapperend doek: nooit een obstakel
{
  const v = makeVision(), r = rng(5), rr = rng(11);
  learnWall(v, r);
  let vals = 0;
  for (let f = 0; f < 200; f++) {
    const w = 30 + Math.round(18 * Math.sin(f * 0.5) + rr() * 8), h = 40 + Math.round(14 * Math.cos(f * 0.37) + rr() * 8);
    const x = 80 + Math.round(20 * Math.sin(f * 0.11)), y = 60 + Math.round(10 * Math.cos(f * 0.13));
    paint(v, layer(rect(x, y, w, h, SLEEVE), rect(x + w - 8, y - 10 - (f % 7), 10, 12, SLEEVE)), r);
    if (v.detect(1 / 30).some(t => oordeel(v, t) === 'ok')) vals++;
  }
  check('wapperend doek wordt nooit een obstakel', vals === 0, `(${vals}/200 frames)`);
}

klaar();
