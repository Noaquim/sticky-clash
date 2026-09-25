// Speciale briefjes, gouden ballen, bonusbak, levels, tips en ranglijst.
import { Game, normalizePoly, rng, check, klaar } from './hulp.mjs';

// Vaste toevalsgetallen: elke run precies hetzelfde spel.
Math.random = rng(20250925);

// Standaard zonder bonusbak en goud; elke test zet aan wat hij nodig heeft.
function spel(opt = {}) {
  const g = new Game(null);
  g.setAspect(16 / 9);
  g.bonusOn = false;
  g.goldEvery = 0;
  Object.assign(g, opt);
  return g;
}
const naAftellen = (g) => { for (let i = 0; i < 200; i++) g.update(1 / 60); };
const box = (x0, y0, x1, y1, extra = {}) => ({
  team: 'object', vx: 0, vy: 0, ...extra,
  poly: normalizePoly([[x0, y0], [x1, y0], [x1, y1], [x0, y1]]),
});
function eenBal(g, x, y, vx, vy) {
  g.spawn();
  const b = g.balls[g.balls.length - 1];
  b.x = x; b.y = y; b.vx = vx; b.vy = vy;
  return b;
}
function stil(teller) {
  return { bounce: () => teller.klap++, krak: () => teller.krak++, score() {}, miss() {}, tick() {}, start() {}, end() {} };
}

/** Nep-tekenvlak: slikt elke aanroep, onthoudt teksten, gloed en ongeldige getallen. */
function nepCtx() {
  const log = { tekst: [], blur: 0, fout: [] };
  const ctx = new Proxy({}, {
    get(o, k) {
      if (k in o) return o[k];
      if (k === 'createRadialGradient' || k === 'createLinearGradient') return () => ({ addColorStop() {} });
      return (...a) => {
        if (a.some(v => typeof v === 'number' && !Number.isFinite(v))) log.fout.push(String(k));
        if (k === 'fillText') {
          if (/NaN|undefined|Infinity/.test(String(a[0]))) log.fout.push('tekst ' + a[0]);
          log.tekst.push({ t: String(a[0]), x: a[1], y: a[2], base: o.textBaseline, align: o.textAlign, font: o.font });
        }
      };
    },
    set(o, k, v) {
      o[k] = v;
      if (typeof v === 'number' && !Number.isFinite(v)) log.fout.push(String(k));
      if (typeof v === 'string' && /NaN|undefined/.test(v)) log.fout.push(k + '=' + v);
      if (k === 'shadowBlur') log.blur = Math.max(log.blur, v);
      return true;
    },
  });
  return { ctx, log };
}
const teken = (g) => { const n = nepCtx(); g.render(n.ctx, 1600, 900); return n.log; };
// Rechthoek [x0, y0, x1, y1] die een getekende tekst ongeveer beslaat (22 px per letter bij 30 px).
function tekstVlak(t) {
  const px = +(/(\d+)px/.exec(t.font || '') || [0, 30])[1], w = t.t.length * px * 0.73;
  const x0 = t.align === 'center' ? t.x - w / 2 : t.align === 'right' ? t.x - w : t.x;
  const y0 = t.base === 'bottom' ? t.y - px : t.base === 'middle' ? t.y - px / 2 : t.base === 'top' ? t.y : t.y - px * 0.8;
  return [x0, y0, x0 + w, y0 + px];
}
const doosVan = (ob) => {
  const xs = ob.poly.map(p => p[0]), ys = ob.poly.map(p => p[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
};
const raakt = (a, b, m = 0) => a[0] < b[2] + m && a[2] > b[0] - m && a[1] < b[3] + m && a[3] > b[1] - m;
const isLabel = (t) => /^800 30px/.test(t.font || '');

// ---- 1. trampoline --------------------------------------------------------------
{
  const mk = (kind, special = true) => {
    const g = spel({ rate: 0, special });
    g.start(60); naAftellen(g);
    g.goal.x = -999; g.goal.y = -999;
    g.setObstacles([box(800, 500, 1000, 540, { id: 1, kind })]);
    const b = eenBal(g, 900, 470, 0, 60);                 // traag, vlak boven het briefje
    let omhoog = 0, opzij = 0;
    for (let i = 0; i < 30; i++) {
      g.update(1 / 60);
      if (-b.vy > omhoog) { omhoog = -b.vy; opzij = Math.abs(b.vx); }
    }
    return { omhoog, opzij };
  };
  const t = mk('trampoline'), gewoon = mk(undefined), uit = mk('trampoline', false);
  check('trampoline: trage bal schiet hard omhoog', t.omhoog >= 900 && t.opzij < 50,
    `(${t.omhoog.toFixed(0)} omhoog, ${t.opzij.toFixed(0)} opzij)`);
  check('gewoon briefje: dezelfde bal blijft liggen', gewoon.omhoog < 200, `(${gewoon.omhoog.toFixed(0)})`);
  check('special uit: trampoline is een gewoon briefje', uit.omhoog < 200, `(${uit.omhoog.toFixed(0)})`);

  // een snelle bal kaatst iets harder terug (veerkracht ~1,1), maar niet eindeloos
  const g = spel({ rate: 0, gravity: 0 });
  g.start(60); naAftellen(g);
  g.goal.x = -999; g.goal.y = -999;
  g.setObstacles([box(800, 500, 1000, 540, { id: 1, kind: 'trampoline' })]);
  const snel = (v) => {
    g.balls.length = 0;
    const b = eenBal(g, 900, 440, 0, v);
    for (let i = 0; i < 20 && b.vy > 0; i++) g.update(1 / 60);
    return -b.vy;
  };
  const uit1 = snel(1000), uit2 = snel(2400);
  check('trampoline: veerkracht ~1,1, begrensd op 1600', uit1 > 1050 && uit1 < 1150 && uit2 <= 1600 + 1e-6,
    `(1000 -> ${uit1.toFixed(0)}, 2400 -> ${uit2.toFixed(0)})`);
}

// ---- 2. turbo -------------------------------------------------------------------
{
  const mk = (kind) => {
    const g = spel({ rate: 0 });
    g.start(60); naAftellen(g);
    g.goal.x = -999; g.goal.y = -999;
    g.setObstacles([box(300, 500, 1500, 540, { id: 2, kind })]);
    const b = eenBal(g, 500, 489, 200, 0);               // rolt naar rechts over een plank
    let zetten = 0, vorige = b.boostAt, snelst = 0;
    for (let i = 0; i < 60; i++) {
      g.update(1 / 60);
      if (b.boostAt !== vorige) { zetten++; vorige = b.boostAt; }
      snelst = Math.max(snelst, Math.hypot(b.vx, b.vy));
    }
    return { weg: b.x - 500, zetten, snelst };
  };
  const turbo = mk('booster'), gewoon = mk(undefined);
  check('turbo: rollende bal gaat sneller en verder', turbo.snelst > 500 && turbo.weg > gewoon.weg + 150,
    `(${turbo.weg.toFixed(0)} ver, max ${turbo.snelst.toFixed(0)}; gewoon ${gewoon.weg.toFixed(0)} ver)`);
  check('turbo: in de rolrichting', turbo.weg > 0);
  check('turbo: hooguit eens per 0,3 s', turbo.zetten >= 2 && turbo.zetten <= 4, `(${turbo.zetten} zetten in 1 s)`);
  check('turbo: nooit boven de snelheidsgrens', turbo.snelst <= 2600 + 1e-6);
}

// ---- 3. breekbare muur ----------------------------------------------------------
{
  const tel = { klap: 0, krak: 0 };
  const g = spel({ rate: 0, sfx: stil(tel) });
  g.start(60); naAftellen(g);
  g.goal.x = -999; g.goal.y = -999;
  g.setObstacles([box(700, 500, 1100, 540, { id: 7, kind: 'breek' })]);
  const st = () => g.breakables.get(7);
  const kapot = () => !!(st() && st().left > 0);
  let ballen = 0, klappenBijBreuk = -1;
  while (!kapot() && ballen < 30) {
    g.balls.length = 0;
    eenBal(g, 900, 300, 0, 700);                           // hard naar beneden
    ballen++;
    for (let i = 0; i < 90 && !kapot(); i++) g.update(1 / 60);
    if (kapot()) klappenBijBreuk = tel.klap;
  }
  check('breekbare muur breekt na precies 5 klappen', klappenBijBreuk === 5, `(${klappenBijBreuk} klappen, ${ballen} ballen)`);
  check('met KRAK en een scherpe klank', tel.krak === 1 && g.pops.some(p => p.text === 'KRAK'));

  g.balls.length = 0;
  const b = eenBal(g, 900, 300, 0, 300);
  let diepst = 0;
  for (let i = 0; i < 40; i++) { g.update(1 / 60); if (g.balls.includes(b)) diepst = Math.max(diepst, b.y); }
  check('kapotte muur laat ballen door', diepst > 580, `(bal tot y=${diepst.toFixed(0)})`);
  const brokenLeft = st().left;
  for (let i = 0; i < 60 * 5; i++) g.update(1 / 60);
  check('na 5 s is de muur terug, weer met 5 klappen', !kapot() && st().hits === 0, `(was nog ${brokenLeft.toFixed(1)} s weg)`);
  g.balls.length = 0;
  const c = eenBal(g, 900, 300, 0, 300);
  let diepst2 = 0;
  for (let i = 0; i < 60; i++) { g.update(1 / 60); if (g.balls.includes(c)) diepst2 = Math.max(diepst2, c.y); }
  check('en houdt ballen weer tegen', diepst2 < 500, `(bal tot y=${diepst2.toFixed(0)})`);

  g.setObstacles([]);
  for (let i = 0; i < 60 * 11; i++) g.update(1 / 60);
  check('verdwenen muur wordt na 10 s vergeten', !g.breakables.has(7));
}

// ---- 4. gouden ballen -----------------------------------------------------------
{
  const g = spel({ rate: 0, goldEvery: 8 });
  g.start(60); naAftellen(g);
  for (let k = 0; k < 16; k++) g.spawn();
  const goud = g.balls.map(b => b.gold);
  check('elke 8e bal is goud', goud.filter(Boolean).length === 2 && goud[7] && goud[15] && !goud[0]);

  const mk = (gold) => {
    const h = spel({ rate: 0, goldEvery: gold ? 1 : 0 });
    h.start(60); naAftellen(h);
    h.setObstacles([]);
    h.setGoal(900, 800);
    eenBal(h, 900, 500, 0, 0);
    for (let i = 0; i < 120 && h.balls.length; i++) h.update(1 / 60);
    return h;
  };
  const gh = mk(true), gewoon = mk(false);
  check('gouden bal in de bak telt 3', gh.score.attack === 3 && gh.pops.some(p => p.text === '+3' && p.col === '#ffd479'),
    `(${gh.score.attack})`);
  check('gewone bal telt 1', gewoon.score.attack === 1);
}

// ---- 5. bonusbak ----------------------------------------------------------------
{
  let over = 0, bron = 0, band = 0;
  for (let k = 0; k < 300; k++) {
    const g = spel({ bonusOn: true, goalSweep: k % 4 === 0 ? 0.5 : 0 });
    g.setGoal(200 + (k * 137) % (g.W - 400), 620 + (k * 53) % 300);
    g.setSource(100 + (k * 71) % (g.W - 200), 50 + (k % 4) * 60);
    g.placeBonus();
    const bn = g.bonus;
    if (Math.hypot(bn.x - g.goal.x, bn.y - g.goal.y) <= g.goal.r + bn.r + 40) over++;
    if (Math.hypot(bn.x - g.source.x, bn.y - g.source.y) <= bn.r + 80) bron++;
    if (bn.y < g.H * 0.35 || bn.y > g.H * 0.6 || bn.x < bn.r || bn.x > g.W - bn.r) band++;
  }
  check('bonusbak nooit over de bak', over === 0, `(${over}/300)`);
  check('bonusbak nooit op de bron', bron === 0, `(${bron}/300)`);
  check('bonusbak in de middenband, binnen beeld', band === 0, `(${band}/300)`);

  const g = spel({ rate: 0, bonusOn: true });
  g.start(60);
  check('bonusbak doet mee tijdens het aftellen', g.bonusLive());
  naAftellen(g);
  g.setObstacles([]); g.goal.x = -999; g.goal.y = -999;
  g.bonus.x = 1300; g.bonus.y = 500;                        // ver van de bron (x 391)
  eenBal(g, 1300, 330, 0, 0);
  for (let i = 0; i < 120 && g.balls.length; i++) g.update(1 / 60);
  check('bal in de bonusbak telt 3', g.score.attack === 3, `(${g.score.attack})`);
  g.goldEvery = 1;
  eenBal(g, 1300, 330, 0, 0);
  for (let i = 0; i < 120 && g.balls.length; i++) g.update(1 / 60);
  check('gouden bal in de bonusbak telt 9', g.score.attack === 12, `(${g.score.attack - 3})`);
  // trechter: een bal die op de rand valt, ketst af en telt niet
  eenBal(g, 1300 + 62, 330, 0, 0);
  const voor = g.score.attack;
  for (let i = 0; i < 120 && g.balls.length; i++) g.update(1 / 60);
  check('bal op de rand van de bonusbak telt niet', g.score.attack === voor);

  const oud = { x: g.bonus.x, y: g.bonus.y };
  for (let i = 0; i < 60 * 21; i++) g.update(1 / 60);
  check('bonusbak verhuist na 20 s', Math.hypot(g.bonus.x - oud.x, g.bonus.y - oud.y) > 100);
  // bak er bovenop gesleept: bonusbak gaat opzij
  g.setGoal(g.bonus.x, g.bonus.y + 60);
  g.update(1 / 60);
  check('bak erop gezet: bonusbak gaat opzij',
    Math.hypot(g.bonus.x - g.goal.x, g.bonus.y - g.goal.y) > g.goal.r + g.bonus.r + 40);
  g.reset();
  check('bonusbak weg op het startscherm', !g.bonusLive() && !teken(g).tekst.some(t => t.t === '+3'));
}

// ---- 6. levels ------------------------------------------------------------------
{
  const g = spel({ rate: 0.5, levelMode: true, wind: 0, goalSweep: 0, sourceSweep: 0 });
  g.setGoal(900, 800); g.setSource(300, 70);
  const eigen = { gx: g.goal.x, gy: g.goal.y, sx: g.source.x, wind: 0, rate: 0.5, gs: 0, ss: 0 };
  g.start(120);
  check('level 1: aftellen, doel 5, klok 45 s', g.state === 'count' && g.level === 1 && g.levelTarget === 5 && g.time === 45);
  naAftellen(g);
  let ballen = 0;
  while (g.level === 1 && ballen < 10) {                    // echte doelpunten: recht boven de bak
    eenBal(g, g.goal.x, 500, 0, 0); ballen++;
    for (let i = 0; i < 120 && g.level === 1 && g.balls.some(b => b.y < 800); i++) g.update(1 / 60);
  }
  const score1 = g.score.attack;
  check('doel gehaald: LEVEL 1 GEHAALD en aftellen', g.level === 2 && g.state === 'count' &&
    g.banner && g.banner.text === 'LEVEL 1 GEHAALD', `(${ballen} ballen, ${score1} punten)`);
  check('level 2: bak verhuist naar een vaste plek', Math.hypot(g.goal.x - 900, g.goal.y - 800) > 200 && !g.goal.auto &&
    g.levelTarget === 7 && g.levelGoals === 0);
  naAftellen(g);
  check('level 2 begint met een volle klok', g.state === 'play' && g.time > 41 && g.score.attack === score1);
  const naar = (n) => { while (g.level < n) { g.levelGoals = g.levelTarget; g.update(1 / 60); naAftellen(g); } };
  naar(3);
  check('level 3: de bak slingert', g.goalSweep >= 0.4 && g.wind === 0);
  naar(4);
  check('level 4: wind', g.wind >= 250 && g.goalSweep >= 0.4);
  naar(5);
  check('level 5: bron slingert, 10% meer ballen', g.sourceSweep >= 0.5 && Math.abs(g.rate - 0.55) < 1e-9);
  naar(6);
  check('level 6: nog eens 10% erbij', Math.abs(g.rate - 0.5 * 1.21) < 1e-9);
  check('HUD toont LEVEL en de stand', (() => { const t = teken(g).tekst.map(x => x.t); return t.includes('LEVEL 6') && t.includes(g.levelGoals + ' / 15'); })());
  g.reset();
  check('reset(): eigen instellingen terug', g.goal.x === eigen.gx && g.goal.y === eigen.gy && g.source.x === eigen.sx &&
    g.wind === eigen.wind && g.rate === eigen.rate && g.goalSweep === eigen.gs && g.sourceSweep === eigen.ss && g.level === 0);
}
{
  // tijd op, ook met "eindeloos" aan: een level heeft altijd een klok
  const g = spel({ rate: 0, levelMode: true, endless: true, wind: 40 });
  g.setGoal(900, 800);
  g.start(120); naAftellen(g);
  g.levelGoals = g.levelTarget; g.update(1 / 60); naAftellen(g);         // naar level 2
  for (let i = 0; i < 60 * 46 && g.state === 'play'; i++) g.update(1 / 60);
  check('tijd op: game over op level 2', g.state === 'over' && g.levelReached === 2 && g.bestLevel === 2 &&
    g.newRecord && /GAME OVER/.test(g.banner.text), `(${g.state}, level ${g.levelReached})`);
  check('game over: eigen bak en wind terug', g.goal.x === 900 && g.goal.y === 800 && g.wind === 40 && !g.ownSettings);
  check('na game over tekent het spel zonder fouten', teken(g).fout.length === 0);
  g.start(120); naAftellen(g);
  for (let i = 0; i < 60 * 46 && g.state === 'play'; i++) g.update(1 / 60);
  check('level 1 niet halen is geen record', g.levelReached === 1 && !g.newRecord && g.bestLevel === 2);
  g.levelMode = false;
  g.start(120);
  check('levels uit: gewone ronde, eindeloos werkt weer', g.level === 0 && g.time === 0 && g.endless);
  naAftellen(g);
  for (let i = 0; i < 60 * 50; i++) g.update(1 / 60);
  check('levels uit: geen game over na 45 s', g.state === 'play' && g.time > 49);
}

// ---- 7. tips en ranglijst ------------------------------------------------------
{
  const g = spel();
  g.best = 7;
  const sub = () => teken(g).tekst.map(t => t.t);
  check('zonder tips: hoogste score onder de banner', sub().includes('hoogste score tot nu toe: 7'));
  g.tips = ['tip een', 'tip twee', 'tip drie'];
  g.t = 1; const a = sub();
  g.t = 5.6; const b = sub();
  g.t = 10; const c = sub();
  check('tips wisselen elke 4,5 s', a.includes('tip een') && b.includes('tip twee') && c.includes('tip drie') &&
    !a.includes('hoogste score tot nu toe: 7'));

  g.tips = [];
  g.highscores = ['Anna', 'Bram', 'Cem', 'Dewi', 'Eva', 'Fleur'].map((name, i) => ({ name, score: 30 - i * 4 }));
  let log = teken(g);
  const rij = (s) => log.tekst.find(t => t.t === s);
  check('ranglijst: kop en top 5', !!rij('RANGLIJST') && !!rij('1. Anna') && !!rij('5. Eva') && !rij('6. Fleur'));
  const ys = log.tekst.filter(t => /^(RANGLIJST|\d\. )/.test(t.t)).map(t => t.y);
  check('ranglijst niet in de banner', ys.every(y => y > g.H / 2 + 110 || y + 34 < g.H / 2 - 110));
  g.setGoal(g.W - 200, 850);                                // bak rechtsonder: lijst gaat naar links
  log = teken(g);
  const kop = rij('RANGLIJST');
  check('ranglijst ontwijkt de bak', kop && Math.hypot(kop.x + 170 - g.goal.x, kop.y + 100 - g.goal.y) > g.goal.r + 200,
    `(kop op ${kop && kop.x.toFixed(0)},${kop && kop.y.toFixed(0)})`);
  g.start(60); naAftellen(g);
  check('ranglijst niet tijdens het spelen', !teken(g).tekst.some(t => t.t === 'RANGLIJST'));
}

// ---- 8. alles tegelijk tekenen --------------------------------------------------
{
  let fouten = [], gloedInVoorwerpmodus = 0, labelOp = 0, labels = 0;
  for (const lowLight of [false, true]) {
    for (const showOutlines of [true, false]) {
      const g = spel({ rate: 3, bonusOn: true, goldEvery: 2, levelMode: true, lowLight, showOutlines, fill: 0.5 });
      g.tips = ['zet een rood briefje neer voor een trampoline'];
      g.highscores = [{ name: 'Anna', score: 12 }, { name: null, score: 'x' }];
      const obs = [
        box(300, 400, 460, 440, { id: 1, kind: 'trampoline' }),
        box(700, 450, 900, 480, { id: 2, kind: 'booster' }),
        box(1100, 380, 1300, 420, { id: 3, kind: 'breek' }),
        box(1400, 10, 1500, 60, { id: 4, kind: 'breek' }),  // tegen de bovenrand: label eronder
        box(500, 600, 600, 640, { id: 5, kind: 'breek', pending: true }),
        box(200, 700, 300, 740, { id: 6, team: 'block' }),
      ];
      g.setObstacles(obs);
      const staten = [];
      staten.push(teken(g));                                 // startscherm
      g.start(60);
      staten.push(teken(g));                                 // aftellen
      naAftellen(g);
      for (let i = 0; i < 120; i++) g.update(1 / 60);
      g.breakables.get(3).left = 3.2;                        // één muur kapot
      staten.push(teken(g));                                 // spelen
      g.togglePause(); staten.push(teken(g)); g.togglePause();
      g.levelGoals = g.levelTarget; g.update(1 / 60);
      staten.push(teken(g));                                 // LEVEL n GEHAALD
      // Ballen scoren hier echt (goud, bonusbak), dus het level kan al verder zijn.
      // Voor de game over: bak buiten beeld (auto, dan verhuist hij niet) en geen bonusbak.
      g.goal.auto = true; g.goal.x = -999; g.bonusOn = false;
      naAftellen(g);
      for (let i = 0; i < 60 * 46 && g.state === 'play'; i++) g.update(1 / 60);
      staten.push(teken(g));                                 // game over
      for (const s of staten) {
        fouten.push(...s.fout);
        if (lowLight && s.blur > 0) gloedInVoorwerpmodus++;
        for (const t of s.tekst) {
          if (!isLabel(t)) continue;                         // alleen de labels, niet het aftellen
          labels++;
          // hele tekst, niet alleen het ankerpunt; 14 = de omlijning in voorwerpmodus
          for (const ob of obs) if (raakt(tekstVlak(t), doosVan(ob), 14)) labelOp++;
        }
      }
      const alle = staten.flatMap(s => s.tekst.map(t => t.t));
      if (!alle.includes('BOING') || !alle.includes('TURBO') || !alle.includes('5') || !alle.some(t => /^\ds$/.test(t))) {
        fouten.push('label ontbreekt (' + lowLight + ',' + showOutlines + ')');
      }
      if (!alle.some(t => /^LEVEL \d+ GEHAALD$/.test(t)) || !alle.some(t => /^LEVEL \d+ — GAME OVER$/.test(t))) {
        fouten.push('levelteksten ontbreken');
      }
      if (!alle.includes('+3')) fouten.push('bonusbak zonder +3');
      if (!alle.includes('zet een rood briefje neer voor een trampoline')) fouten.push('tip ontbreekt');
      if (!alle.includes('RANGLIJST')) fouten.push('ranglijst ontbreekt');
    }
  }
  check('render() met alles erop gooit niets en tekent geen NaN', fouten.length === 0, fouten.slice(0, 3).join(', '));
  check('voorwerpmodus: nergens gloed', gloedInVoorwerpmodus === 0, `(${gloedInVoorwerpmodus} keer)`);
  check('labels nooit op een briefje', labels > 0 && labelOp === 0, `(${labelOp}/${labels})`);
}

// ---- 9. licht nooit op een briefje, en ballen die klem zitten ---------------------
{
  // gestapeld: het label boven de trampoline viel precies op het briefje erboven
  const g = spel();
  const stapel = [box(700, 500, 900, 530, { id: 1, kind: 'trampoline' }), box(700, 440, 900, 470, { id: 2 })];
  g.setObstacles(stapel);
  const boing = teken(g).tekst.find(t => t.t === 'BOING');
  check('gestapelde briefjes: label ernaast, niet op het volgende', !!boing && stapel.every(o => !raakt(tekstVlak(boing), doosVan(o), 10)),
    boing ? `(label op ${boing.x.toFixed(0)},${boing.y.toFixed(0)})` : '(geen label)');
  // aan alle kanten ingebouwd: dan geen label
  g.setObstacles([box(700, 500, 900, 530, { id: 1, kind: 'booster' }), box(600, 380, 1000, 470, { id: 2 }),
    box(600, 560, 1000, 650, { id: 3 }), box(930, 480, 1100, 550, { id: 4 }), box(500, 480, 670, 550, { id: 5 })]);
  check('ingebouwd briefje krijgt geen label', !teken(g).tekst.some(t => t.t === 'TURBO'));

  // ranglijst: een groot boek rechtsonder waarvan het midden buiten de lijst ligt
  const r = spel();
  r.highscores = [1, 2, 3, 4, 5].map(i => ({ name: 'speler' + i, score: 10 - i }));
  const boek = box(r.W - 600, r.H - 300, r.W - 250, r.H - 40, { id: 1 });
  r.setObstacles([boek]);
  let regels = teken(r).tekst.filter(t => /^(RANGLIJST|\d\. )/.test(t.t));
  check('ranglijst nooit op een groot boek', regels.length === 6 && regels.every(t => !raakt(tekstVlak(t), doosVan(boek))),
    `(${regels.filter(t => raakt(tekstVlak(t), doosVan(boek))).length} regels erop)`);
  r.setObstacles([boek, box(40, r.H - 300, 420, r.H - 30), box(r.W - 420, 150, r.W - 30, 420), box(30, 150, 420, 420)]);
  check('alle hoeken bezet: geen ranglijst', !teken(r).tekst.some(t => t.t === 'RANGLIJST'));

  // level 2 verhuist de bak nooit op een briefje (main.js zou dat voorwerp als bak nemen)
  let opBriefje = 0, verhuisd = 0;
  for (let k = 0; k < 40; k++) {
    const h = spel({ rate: 0, levelMode: true });
    h.setGoal(900, 800); h.setSource(300 + k, 70);
    const W = h.W, H = h.H;
    h.setObstacles([[0.25, 0.80], [0.78, 0.80], [0.82, 0.64]].map(([fx, fy], i) =>
      box(fx * W - 60, fy * H - 30, fx * W + 60, fy * H + 30, { id: i + 1 })));
    h.start(60); naAftellen(h);
    h.levelGoals = h.levelTarget; h.update(1 / 60);
    if (h.goal.x !== 900 || h.goal.y !== 800) verhuisd++;
    if (h.obstacles.some(o => { const d = doosVan(o); return raakt(d, [h.goal.x - h.goal.r, h.goal.y - h.goal.r, h.goal.x + h.goal.r, h.goal.y + h.goal.r]); })) opBriefje++;
  }
  check('level 2: bak nooit op een briefje', opBriefje === 0 && verhuisd > 0, `(${opBriefje}/40 erop, ${verhuisd}/40 verhuisd)`);

  // briefje op de bonusbak gezet: bonusbak gaat opzij; een vlek die nog vastgezet wordt niet
  const b = spel({ rate: 0, bonusOn: true });
  b.start(60); naAftellen(b);
  let oud = [b.bonus.x, b.bonus.y];
  b.setObstacles([box(oud[0] - 50, oud[1] - 20, oud[0] + 50, oud[1] + 20, { id: 1, pending: true })]);
  b.update(1 / 60);
  const blijft = Math.hypot(b.bonus.x - oud[0], b.bonus.y - oud[1]) < 1;
  b.setObstacles([box(oud[0] - 50, oud[1] - 20, oud[0] + 50, oud[1] + 20, { id: 1 })]);
  b.update(1 / 60);
  check('briefje op de bonusbak: bonusbak gaat opzij', blijft && Math.hypot(b.bonus.x - oud[0], b.bonus.y - oud[1]) > 100 &&
    !b.bonusCovered());

  // klem: trampoline met een briefje er vlak boven. Zonder opruimen ratelt de bal 40 s.
  const k = spel({ rate: 0 });
  k.start(60); naAftellen(k);
  k.goal.x = -999; k.goal.y = -999; k.goal.auto = true;
  k.setObstacles([box(600, 600, 1000, 640, { id: 1, kind: 'trampoline' }), box(600, 548, 1000, 574, { id: 2 })]);
  const klem = eenBal(k, 800, 586, 0, 0);
  let weg = -1;
  for (let i = 0; i < 60 * 6 && weg < 0; i++) { k.update(1 / 60); if (!k.balls.includes(klem)) weg = i / 60; }
  check('bal klem boven een trampoline wordt opgeruimd', weg > 0 && weg < 4, `(na ${weg.toFixed(1)} s)`);
  // maar een bal die gewoon op een trampoline stuitert blijft
  const s = spel({ rate: 0 });
  s.start(60); naAftellen(s);
  s.goal.x = -999; s.goal.y = -999; s.goal.auto = true;
  s.setObstacles([box(250, 700, 550, 740, { id: 1, kind: 'trampoline' })]);
  const stuiter = eenBal(s, 400, 300, 0, 0);
  for (let i = 0; i < 60 * 6; i++) s.update(1 / 60);
  check('bal die op een trampoline stuitert blijft in het spel', s.balls.includes(stuiter) && stuiter.fade == null);
}

// ---- 10. KRAK en scherven ook niet op een briefje ------------------------------------
{
  // Het hele stuk dat KRAK beslaat terwijl hij 70 opstijgt (tekst vanaf de bovenkant).
  const krakVlak = (p) => [p.x - 4 * 46 * 0.73 / 2, p.y - 70, p.x + 4 * 46 * 0.73 / 2, p.y + 46];
  const breek = (obs, muur) => {
    const g = spel();
    g.setObstacles(obs);
    g.shatter(muur.poly);
    return g;
  };
  // gestapeld: een gewoon briefje 30 boven de breekbare muur
  const muur = box(700, 500, 900, 530, { id: 1, kind: 'breek' }), erboven = box(700, 420, 900, 470, { id: 2 });
  const g = breek([muur, erboven], muur);
  const p = g.pops.find(q => q.text === 'KRAK');
  check('KRAK niet op het briefje erboven', !!p && [muur, erboven].every(o => !raakt(krakVlak(p), doosVan(o))),
    p ? `(KRAK op ${p.x.toFixed(0)},${p.y.toFixed(0)})` : '(geen KRAK)');
  const t = teken(g).tekst.find(q => q.t === 'KRAK');
  check('KRAK wordt vanaf de bovenkant getekend', !!t && t.base === 'top');
  check('scherven vliegen alleen omhoog', g.parts.length > 0 && g.parts.every(q => q.vy < 0),
    `(${g.parts.filter(q => q.vy >= 0).length}/${g.parts.length} omlaag)`);
  // tegen de bovenrand: dan eronder of ernaast, nooit erop
  const boven = box(800, 10, 1000, 50, { id: 3, kind: 'breek' });
  const h = breek([boven], boven);
  const q = h.pops.find(r => r.text === 'KRAK');
  check('KRAK bij een briefje aan de bovenrand', !q || !raakt(krakVlak(q), doosVan(boven)),
    q ? `(KRAK op ${q.x.toFixed(0)},${q.y.toFixed(0)})` : '(geen KRAK)');

  // vonken van een trampoline of turbo vliegen van de bovenkant af, niet over het briefje
  const vonken = (kind, col, bal) => {
    const s = spel({ rate: 0 });
    s.start(60); naAftellen(s);
    s.goal.x = -999; s.goal.y = -999; s.goal.auto = true;
    s.setObstacles([box(600, 600, 1000, 640, { id: 1, kind })]);
    eenBal(s, ...bal);
    let nieuw = 0, omlaag = 0;
    for (let i = 0; i < 40; i++) {
      const al = new Set(s.parts);
      s.update(1 / 60);
      for (const p of s.parts) if (!al.has(p) && p.col === col) { nieuw++; if (p.vy >= 0) omlaag++; }
    }
    return { nieuw, omlaag };
  };
  const tv = vonken('trampoline', '#ff4d4d', [800, 500, 60, 400]), bv = vonken('booster', '#3ddc84', [700, 589, 200, 0]);
  check('vonken van trampoline en turbo vliegen eraf', tv.nieuw > 0 && bv.nieuw > 0 && !tv.omlaag && !bv.omlaag,
    `(trampoline ${tv.omlaag}/${tv.nieuw}, turbo ${bv.omlaag}/${bv.nieuw} omlaag)`);
}

klaar();
