// "Alleen wat op de muur zit" (vision.opDeMuur, main.js buildObstacles): in een zaal met
// flitsende podiumlampen en een discobal mag alleen wat echt aan de muur hangt een obstakel
// worden. Nagebouwd met dezelfde muur en hetzelfde beamervlak als test/omgeving.mjs:
//
//  1. flitsende vlakken en rondschietende lichtvlekken: nooit een obstakel
//  2. een hand die een boek tegen de muur houdt: telt niet, pas als het boek hangt en de
//     hand weg is (en dan binnen 1,5 s)
//  3. briefjes die op de muur geplakt worden: tellen binnen 1,5 s (met flitsen erbij binnen
//     2 s: dan wacht de mensenregel zelf al langer)
//  4. ballen die eroverheen vliegen: het briefje blijft tellen
//  5. weggehaald is weg
//
// Ter vergelijking ook wat er zonder de instelling zou tellen.
import { kamerVision, paint, rng, voorspel, kamerReden, check, klaar, WALL } from './hulp.mjs';

const VW = 320, VH = 240;

function leer(v, r) {
  v.beginBackground();
  for (let i = 0; i < 30; i++) { paint(v, () => null, r); v.addBackgroundFrame(); }
  v.endBackground();
}

/** Zoals buildObstacles in main.js: hoeveel tellen er mee, met en zonder de instelling. */
function tel(v, tr) {
  const mensen = v.muurMensen();
  let met = 0, zonder = 0;
  const ids = [], alle = [];
  for (const t of tr) {
    const r = kamerReden(v, t);
    if (r !== 'telt' && r !== 'wacht') continue;
    const m = v.opDeMuur(t, v.muurStil, mensen);
    if (r === 'telt') { zonder++; alle.push(t); }
    if (r === 'telt' && m === '') { met++; ids.push(t); }
  }
  return { met, zonder, ids, alle };
}

const HUID = [150, 100, 75];
const fel = (c, k) => c.map((q, i) => Math.min(255, q + k * (i === 0 ? 1 : 0.55)));

/** Flitsende lampen: grote felle vlakken (1–3 beelden) en een draaiende discobal. */
function maakFlitsen(r, aantalVlekken = 14) {
  let flits = null;
  const vlekken = [];
  for (let i = 0; i < aantalVlekken; i++) {
    vlekken.push({ x: r() * VW, y: r() * VH, vx: (r() - 0.5) * 6, vy: (r() - 0.5) * 4, rr: 3 + r() * 3 });
  }
  return {
    stap() {
      if (flits && --flits.n <= 0) flits = null;
      if (!flits && r() < 0.25) {
        const w = 40 + r() * 140, h = 30 + r() * 100;
        flits = { x: r() * (VW - w), y: r() * (VH - h), w, h, k: 50 + r() * 100, n: 1 + ((r() * 3) | 0) };
      }
      // discobal: alle vlekken draaien mee, een paar pixels per beeld
      for (const s of vlekken) {
        s.x += s.vx + 2.5; s.y += s.vy;
        if (s.x > VW + 10) s.x -= VW + 20;
        if (s.y < -10) s.y += VH + 20; else if (s.y > VH + 10) s.y -= VH + 20;
      }
    },
    kleur(x, y, c) {
      for (const s of vlekken) if ((x - s.x) ** 2 + (y - s.y) ** 2 < s.rr * s.rr) return [255, 255, 250];
      if (flits && x >= flits.x && x < flits.x + flits.w && y >= flits.y && y < flits.y + flits.h) return fel(c, flits.k);
      return c;
    },
  };
}

const BRIEFJES = [
  { x: 70, y: 60, w: 22, h: 20, c: [214, 196, 70] },
  { x: 180, y: 90, w: 24, h: 22, c: [70, 150, 210] },
  { x: 120, y: 150, w: 20, h: 20, c: [220, 90, 120] },
];
const binnen = (o, x, y) => x >= o.x && x < o.x + o.w && y >= o.y && y < o.y + o.h;
const scene = (dingen, licht) => (x, y) => {
  let c = null;
  for (const o of dingen) if (binnen(o, x, y)) { c = o.f ? o.f(x, y) : o.c; if (c) break; }
  if (!licht) return c;
  return licht(x, y, c || WALL);
};

// ---- 1. flitsen en lichtvlekken ---------------------------------------------
{
  const r = rng(11), v = kamerVision();
  leer(v, r);
  const fl = maakFlitsen(rng(12));
  let met = 0, zonder = 0, gezien = 0;
  for (let f = 0; f < 240; f++) {
    fl.stap();
    paint(v, scene([], fl.kleur.bind(fl)), r);
    const tr = v.detect(1 / 30);
    if (tr.length) gezien++;
    const n = tel(v, tr);
    met += n.met; zonder += n.zonder;
  }
  check('flitsen en discobal: nooit een obstakel', gezien > 30 && met === 0,
    '(vlekken gezien in ' + gezien + ' beelden; met de instelling ' + met + ', zonder ' + zonder + ' obstakel-beelden)');
}
{
  // één langzame lichtvlek (een draaiende spot, 20 px per seconde)
  const r = rng(13), v = kamerVision();
  leer(v, r);
  let met = 0, zonder = 0;
  for (let f = 0; f < 240; f++) {
    const sx = 60 + f * 0.66, sy = 120;
    paint(v, scene([], (x, y, c) => ((x - sx) ** 2 + (y - sy) ** 2 < 100 ? fel(c, 80) : c)), r);
    const n = tel(v, v.detect(1 / 30));
    met += n.met; zonder += n.zonder;
  }
  check('langzaam schuivende lichtvlek: nooit een obstakel', met === 0, '(met ' + met + ', zonder ' + zonder + ' obstakel-beelden)');
}

// ---- 2. een hand houdt een boek tegen de muur -------------------------------
{
  const r = rng(14), v = kamerVision();
  leer(v, r);
  const BOEK = { x: 140, y: 95, w: 44, h: 34, c: [40, 60, 120] };
  let tijdensHand = 0, zonderHand = 0, eerst = -1;
  const HAND = 90, LOS = 150;
  for (let f = 0; f < HAND + LOS; f++) {
    const a = f < HAND ? 0.8 : 0;
    const dx = a * Math.sin(2 * Math.PI * 3 * f / 30) + (f < HAND ? f * 0.02 : HAND * 0.02);
    const dy = a * Math.cos(2 * Math.PI * 2 * f / 30);
    const boek = { x: BOEK.x + dx, y: BOEK.y + dy, w: BOEK.w, h: BOEK.h, c: BOEK.c };
    const dingen = f < HAND ? [{ x: boek.x + 36 + dx, y: boek.y + 8, w: 18, h: 18, c: HUID }, boek] : [boek];
    paint(v, scene(dingen.map(o => ({ ...o, x: o.x | 0, y: o.y | 0 }))), r);
    const n = tel(v, v.detect(1 / 30));
    if (f < HAND) { tijdensHand += n.met; zonderHand += n.zonder; }
    else if (n.met && eerst < 0) eerst = f - HAND;
  }
  check('boek in de hand: telt niet', tijdensHand === 0, '(' + tijdensHand + ' beelden; zonder de instelling ' + zonderHand + ')');
  check('boek hangt, hand weg: telt binnen 1,5 s', eerst >= 0 && eerst <= 45, '(na ' + (eerst < 0 ? 'nooit' : (eerst / 30).toFixed(2) + ' s') + ')');
}

// ---- 3 en 4 en 5. briefjes plakken, ballen erover, weghalen -------------------
for (const [naam, metFlits] of [['rustige zaal', false], ['met flitsen en discobal', true]]) {
  const r = rng(15), v = kamerVision();
  leer(v, r);
  const fl = metFlits ? maakFlitsen(rng(16), 6) : null;
  const eerst = BRIEFJES.map(() => -1), eerstZonder = BRIEFJES.map(() => -1);
  let kwijt = 0, naWeg = 0;
  const PLAK = 10, BAL = 70, WEG = 160;
  for (let f = 0; f < 200; f++) {
    if (fl) fl.stap();
    const dingen = f < PLAK ? [] : f < WEG ? BRIEFJES : BRIEFJES.slice(1);
    // ballen vallen over het eerste briefje heen
    const ballen = f >= BAL && f < WEG ? [0, 1, 2].map(k => [75 + k * 6, ((f * 5 + k * 37) % 200) + 20]) : [];
    paint(v, scene(dingen, (x, y, c) => {
      for (const [bx, by] of ballen) if ((x - bx) ** 2 + (y - by) ** 2 < 36) return c.map(q => Math.min(255, q + 90));
      return fl ? fl.kleur(x, y, c) : c;
    }), r);
    voorspel(v, ballen);
    const n = tel(v, v.detect(1 / 30));
    BRIEFJES.forEach((b, i) => {
      const geteld = n.ids.some(t => binnen({ x: b.x - 4, y: b.y - 4, w: b.w + 8, h: b.h + 8 }, t.cx, t.cy));
      if (geteld && eerst[i] < 0) eerst[i] = f - PLAK;
      if (eerstZonder[i] < 0 && n.alle.some(t => binnen({ x: b.x - 4, y: b.y - 4, w: b.w + 8, h: b.h + 8 }, t.cx, t.cy))) eerstZonder[i] = f - PLAK;
      if (i === 0 && f >= BAL && f < WEG && eerst[0] >= 0 && !geteld) kwijt++;
      if (i === 0 && f >= WEG + 10 && geteld) naWeg++;
    });
  }
  const traagst = Math.max(...eerst.map(e => (e < 0 ? Infinity : e)));
  const s = (a) => a.map(e => (e < 0 ? 'nooit' : (e / 30).toFixed(2) + ' s')).join(', ');
  // Met flitsen wacht de mensenregel (een omtrek die 'ademt') zelf al langer; daar
  // komt hooguit een halve seconde bij.
  const grens = metFlits ? 60 : 45;
  const erbij = Math.max(...eerst.map((e, i) => (e < 0 ? Infinity : e - eerstZonder[i])));
  check(naam + ': geplakte briefjes tellen binnen ' + (grens / 30) + ' s', traagst <= grens && (!metFlits || erbij <= 21),
    '(' + s(eerst) + '; zonder de instelling ' + s(eerstZonder) + ')');
  check(naam + ': ballen erover, het briefje blijft tellen', kwijt <= 2, '(' + kwijt + ' beelden kwijt)');
  check(naam + ': weggehaald briefje telt niet meer', naWeg === 0, '(' + naWeg + ' beelden)');
}

// ---- 6. de standaardinstellingen van de herkenning zelf veranderen niet ------
{
  const v = kamerVision();
  check('herkenning zelf ongewijzigd (stillFor, jitterMax)', v.stillFor === 1 && v.jitterMax === 0.15);
}

klaar();
