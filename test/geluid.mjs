// Geluid, muziek en effecten, zonder browser. De muziek draait op een nep-geluidskaart
// met een nep-klok, zodat precies te zien is wanneer elke noot klinkt.
import { Game, normalizePoly, rng, check, klaar } from './hulp.mjs';
const { Sfx } = await import('../js/audio.js');
const { MUZIEK_VOLUME, MUZIEK_TEMPO, MUZIEK_SPURT, MUZIEK_VOORUIT, MUZIEK_LUIDST } = await import('../js/muziek.js');

Math.random = rng(20250926);

// ---- hulpjes ------------------------------------------------------------------------

function spel(opt = {}) {
  const g = new Game(opt.sfx || null);
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
function eenBal(g, x, y, vx, vy, gold = false) {
  g.spawn();
  const b = g.balls[g.balls.length - 1];
  b.x = x; b.y = y; b.vx = vx; b.vy = vy; b.gold = gold;
  return b;
}
/** Nepgeluid dat elke aanroep onthoudt: tel.boing = [[args], ...]. */
function nepSfx() {
  const tel = {};
  const s = new Proxy({}, { get: (o, k) => (...a) => { (tel[k] = tel[k] || []).push(a); } });
  return { s, tel };
}
/** Nep-tekenvlak: slikt alles, telt gloed, schalen en ongeldige getallen. */
function nepCtx() {
  const log = { blur: 0, fout: [], scale: 0, tekst: [] };
  const ctx = new Proxy({}, {
    get(o, k) {
      if (k in o) return o[k];
      if (k === 'createRadialGradient' || k === 'createLinearGradient') return () => ({ addColorStop() {} });
      return (...a) => {
        if (a.some(v => typeof v === 'number' && !Number.isFinite(v))) log.fout.push(String(k));
        if (k === 'scale') log.scale++;
        if (k === 'fillText') log.tekst.push(String(a[0]));
      };
    },
    set(o, k, v) {
      o[k] = v;
      if (typeof v === 'number' && !Number.isFinite(v)) log.fout.push(String(k));
      if (k === 'shadowBlur') log.blur = Math.max(log.blur, v);
      return true;
    },
  });
  return { ctx, log };
}
const teken = (g) => { const n = nepCtx(); g.render(n.ctx, 1600, 900); return n.log; };

// ---- nep-geluidskaart -----------------------------------------------------------------

const timers = new Map();
let timerNr = 0;
const echt = { setInterval, clearInterval, setTimeout };
globalThis.setInterval = (fn) => { timers.set(++timerNr, fn); return timerNr; };
globalThis.clearInterval = (id) => { timers.delete(id); };
globalThis.setTimeout = () => 0;              // loskoppelen van een uitgefade bus: niet nodig hier

function nepKaart() {
  const k = { currentTime: 0, sampleRate: 8000, destination: {}, osc: 0, bron: 0, gains: [], fout: [] };
  const param = (v) => {
    const p = { value: v, ev: [] };
    for (const naam of ['setValueAtTime', 'linearRampToValueAtTime', 'exponentialRampToValueAtTime',
      'setTargetAtTime', 'cancelScheduledValues', 'cancelAndHoldAtTime']) {
      p[naam] = (...a) => {
        if (a.some(x => !Number.isFinite(x))) k.fout.push(naam + ' met ' + a.join(','));
        // een echte browser gooit een fout bij een exponentiële helling naar 0
        if (naam === 'exponentialRampToValueAtTime' && !(a[0] > 0)) k.fout.push('exponentieel naar ' + a[0]);
        if (naam === 'setTargetAtTime' && !(a[2] > 0)) k.fout.push('setTarget zonder tijd');
        p.ev.push([naam, ...a]);
      };
    }
    return p;
  };
  const node = (x) => Object.assign({ connect() {}, disconnect() { this.los = true; } }, x);
  const start = (t) => { if (!(t >= k.currentTime - 1e-9)) k.fout.push('start in het verleden (' + t + ' < ' + k.currentTime + ')'); };
  k.createGain = () => { const g = node({ gain: param(1) }); k.gains.push(g); return g; };
  k.createOscillator = () => { k.osc++; return node({ type: 'sine', frequency: param(440), start, stop() {} }); };
  k.createBiquadFilter = () => node({ type: 'lowpass', frequency: param(350), Q: param(1) });
  k.createBufferSource = () => { k.bron++; return node({ buffer: null, loop: false, start, stop() {} }); };
  k.createBuffer = (ch, n) => { const d = new Float32Array(n); return { getChannelData: () => d }; };
  return k;
}
function nepGeluid() {
  timers.clear();                              // de planners van vorige proeven zijn weg
  const sfx = new Sfx(), kaart = nepKaart();
  sfx.ctx = kaart;
  sfx.master = kaart.createGain();
  const noten = [];
  sfx.muziek.opNoot = (soort, t) => noten.push({ soort, t, nu: kaart.currentTime });
  return { sfx, kaart, m: sfx.muziek, noten };
}
/**
 * Laat de nep-klok `sec` seconden lopen in stapjes van 5 ms: elke 25 ms de planner (de
 * setInterval), elk 1/60 s een beeldje met volg(). In `gat` hangt de pc: niets van beide.
 */
function draai(k, m, sec, { state = 'play', spurt = false, level = 0, gat = null, beelden = true } = {}) {
  const t0 = k.currentTime, n = Math.round(sec / 0.005);
  let beeld = -1, tik = -1;
  for (let i = 1; i <= n; i++) {
    k.currentTime = t0 + i * 0.005;
    const nu = k.currentTime;
    if (gat && nu >= t0 + gat[0] && nu < t0 + gat[1]) continue;
    if (beelden && nu - beeld >= 1 / 60 - 1e-9) { beeld = nu; m.volg(state, spurt, level); }
    if (nu - tik >= 0.025 - 1e-9) { tik = nu; for (const fn of [...timers.values()]) fn(); }
  }
}
const vanSoort = (noten, s, na = -1) => noten.filter(n => n.soort === s && n.nu > na);
/** Liggen alle tijden op een raster van `d` vanaf de eerste? En de grootste afwijking. */
function opRaster(ts, d) {
  let slechtst = 0;
  for (const t of ts) { const k = (t - ts[0]) / d; slechtst = Math.max(slechtst, Math.abs(k - Math.round(k)) * d); }
  return slechtst;
}
const gaten = (ts) => ts.slice(1).map((t, i) => t - ts[i]);

// ---- 1. muziek: ritme en planner ------------------------------------------------------
{
  const { kaart, m, noten } = nepGeluid();
  draai(kaart, m, 1, { state: 'idle' });
  check('muziek: stil op het startscherm', noten.length === 0 && timers.size === 0);
  draai(kaart, m, 4);
  const kicks = vanSoort(noten, 'kick').map(n => n.t), beat = 60 / MUZIEK_TEMPO;
  check('muziek: speelt tijdens de ronde', kicks.length >= 7 && vanSoort(noten, 'arp').length >= 28,
    `(${kicks.length} bassdrums, ${vanSoort(noten, 'arp').length} arpeggionoten in 4 s)`);
  check('muziek: bassdrum precies op de tel', opRaster(kicks, beat) < 1e-6 && gaten(kicks).every(x => Math.abs(x - beat) < 1e-6),
    `(afwijking ${opRaster(kicks, beat).toExponential(1)} s)`);
  const vooruit = Math.max(...noten.map(n => n.t - n.nu));
  check('muziek: plant hooguit 0,12 s + een zestiende vooruit', vooruit <= MUZIEK_VOORUIT + 15 / MUZIEK_TEMPO + 1e-9 &&
    noten.every(n => n.t >= n.nu - 1e-9), `(${vooruit.toFixed(3)} s)`);
  check('muziek: snare op 2 en 4', vanSoort(noten, 'snare').length >= 3 &&
    opRaster(vanSoort(noten, 'snare').map(n => n.t), beat * 2) < 1e-6);

  // Een hapering van 90 ms (een traag beeldje): de noten stonden al klaar, er mist niets.
  const voor = noten.length, t0 = kaart.currentTime;
  draai(kaart, m, 2, { gat: [0.3, 0.39] });
  const arp = noten.slice(voor).filter(n => n.soort === 'arp').map(n => n.t), d = 15 / MUZIEK_TEMPO;
  check('hapering van 90 ms: geen noot gemist of te laat', gaten(arp).every(x => Math.abs(x - d) < 1e-6) &&
    kaart.fout.length === 0, `(${arp.length} zestienden, ${kaart.fout.slice(0, 2).join('; ')})`);

  // 300 ms: de gemiste zestienden worden overgeslagen, niet allemaal tegelijk ingehaald.
  const voor2 = noten.length;
  draai(kaart, m, 2, { gat: [0.3, 0.6] });
  const na = noten.slice(voor2), arp2 = na.filter(n => n.soort === 'arp').map(n => n.t);
  const perMoment = {};
  for (const n of na) if (n.soort === 'arp') perMoment[n.nu] = (perMoment[n.nu] || 0) + 1;
  check('hapering van 300 ms: ritme blijft op de maat', opRaster(arp2, d) < 1e-6 && gaten(arp2).every(x => x > d - 1e-6),
    `(${arp2.length} zestienden)`);
  check('...en haalt niet alles tegelijk in', Math.max(...Object.values(perMoment)) <= 2 && kaart.fout.length === 0,
    `(hooguit ${Math.max(...Object.values(perMoment))} arpeggionoten per plan-ronde)`);
  // Een seconde niets (de pc hangt): daarna gewoon verder, zonder inhaalsalvo.
  const voor3 = noten.length, t3 = kaart.currentTime;
  draai(kaart, m, 2.5, { gat: [0.2, 1.2] });
  const na3 = noten.slice(voor3).filter(n => n.nu >= t3 + 1.2 && n.soort === 'arp');
  const salvo = {};
  for (const n of na3) salvo[n.nu] = (salvo[n.nu] || 0) + 1;
  check('pc hangt 1 s: daarna verder, zonder salvo', na3.length > 8 && Math.max(...Object.values(salvo)) <= 2 &&
    kaart.fout.length === 0, `(${na3.length} zestienden erna)`);
  // Wel de planner, geen beeldjes meer (tabblad op de achtergrond): na een halve seconde stil.
  const voor4 = noten.length, t4 = kaart.currentTime;
  draai(kaart, m, 1.5, { beelden: false });
  check('geen beeldjes meer: muziek pauzeert vanzelf', m.stand === 'pauze' && timers.size === 0 &&
    !noten.slice(voor4).some(n => n.nu > t4 + 0.55));
  draai(kaart, m, 0.5);
  check('...en speelt verder als ze terug zijn', m.stand === 'speelt' && noten.length > voor4 + 3);
}

// ---- 2. muziek: sneller op het eind en per level ---------------------------------------
{
  const { kaart, m, noten } = nepGeluid();
  draai(kaart, m, 4);
  const normaal = vanSoort(noten, 'hihat').length;
  const kick1 = gaten(vanSoort(noten, 'kick').map(n => n.t));
  const voor = kaart.currentTime;
  draai(kaart, m, 4, { spurt: true });
  const spurtKick = gaten(vanSoort(noten, 'kick', voor + 0.2).map(n => n.t));
  const spurtHats = vanSoort(noten, 'hihat', voor).length;
  const snel = 60 / (MUZIEK_TEMPO * MUZIEK_SPURT);
  check('laatste 10 s: tempo 20-30% hoger', MUZIEK_SPURT >= 1.2 && MUZIEK_SPURT <= 1.3 &&
    spurtKick.every(x => Math.abs(x - snel) < 1e-6), `(tel ${kick1[0].toFixed(3)} -> ${spurtKick[0].toFixed(3)} s)`);
  check('laatste 10 s: extra hihats', spurtHats > normaal * 2.5, `(${normaal} -> ${spurtHats} in 4 s)`);

  const lv = (level) => {
    const x = nepGeluid();
    draai(x.kaart, x.m, 3, { level });
    return gaten(vanSoort(x.noten, 'kick').map(n => n.t))[0];
  };
  const l1 = lv(1), l3 = lv(3), l9 = lv(9);
  check('Uitdaging: tempo iets hoger per level, begrensd', l3 < l1 - 0.01 && l9 < l3 && l9 >= 60 / (MUZIEK_TEMPO * 1.2) - 1e-6,
    `(tel ${l1.toFixed(3)} / ${l3.toFixed(3)} / ${l9.toFixed(3)} s)`);
}

// ---- 3. muziek: pauze, einde, geluid uit ------------------------------------------------
{
  const { sfx, kaart, m, noten } = nepGeluid();
  draai(kaart, m, 3);
  const stapBijPauze = m.stap, tPauze = kaart.currentTime;
  const bus = m.bus;
  draai(kaart, m, 1, { state: 'paused' });
  const fade = bus.gain.ev.find(e => e[0] === 'setTargetAtTime');
  check('pauze: niets nieuws ingepland, zacht uitgefaded', !noten.some(n => n.nu > tPauze + 0.02) && timers.size === 0 &&
    !!fade && fade[1] === 0 && fade[3] <= 0.15 && m.stand === 'pauze');
  kaart.currentTime += 0.01;
  m.volg('play', false, 0);
  const verder = (m.stap - stapBijPauze + 64) % 64;
  draai(kaart, m, 1);
  const na = noten.filter(n => n.nu > tPauze + 1);
  const inval = m.bus && m.bus.gain.ev.find(e => e[0] === 'exponentialRampToValueAtTime');
  check('pauze opgeheven: gaat verder waar hij was, zacht aanzwellend', na.length > 0 && !!inval && stapBijPauze > 0 &&
    verder <= 2, `(${verder} zestienden verder)`);
  draai(kaart, m, 0.5, { state: 'over' });
  check('ronde voorbij: muziek stopt en begint straks bij maat 1', m.stand === 'stil' && m.stap === 0 && timers.size === 0 && !m.bus);

  draai(kaart, m, 1);
  sfx.on = false;
  const tUit = kaart.currentTime, laatsteBus = m.bus;
  draai(kaart, m, 1);
  const f = laatsteBus.gain.ev.find(e => e[0] === 'setTargetAtTime');
  check('vinkje Geluid uit: muziek meteen stil', !noten.some(n => n.nu > tUit + 0.02) && !!f && f[3] <= 0.02);
  const osc = kaart.osc, bron = kaart.bron;
  for (const k of ['boing', 'whoosh', 'goud', 'bonus', 'levelGehaald', 'record', 'gameOver', 'krak', 'tick', 'start', 'end', 'miss']) sfx[k]();
  sfx.score(3); sfx.combo(5); sfx.bounce(900, 'attack');
  check('vinkje Geluid uit: ook geen enkel effect', kaart.osc === osc && kaart.bron === bron);
  // Wat al vooruit klaarstond (de rest van een fanfare) moet ook stil: de hoofdknop dicht.
  const dicht = sfx.master.gain.ev.filter(e => e[0] === 'setTargetAtTime').pop();
  check('vinkje Geluid uit: ook wat al klaarstond meteen stil', !!dicht && dicht[1] === 0 && dicht[3] <= 0.02);

  sfx.on = true; m.aan = false;
  const open = sfx.master.gain.ev.filter(e => e[0] === 'setTargetAtTime').pop();
  check('vinkje Geluid weer aan: hoofdknop weer open', !!open && open[1] > 0.2);
  const n0 = noten.length;
  draai(kaart, m, 1);
  kaart.currentTime += 1;
  const o0 = kaart.osc;
  sfx.boing();
  check('vinkje Muziek uit: geen muziek, wel effecten', noten.length === n0 && kaart.osc > o0);
  check('muziek zachter dan de effecten', MUZIEK_VOLUME * MUZIEK_LUIDST < 0.1,
    `(hardste muzieknoot ${(MUZIEK_VOLUME * MUZIEK_LUIDST).toFixed(3)}, tik 0.1, doelpunt 0.13)`);
  check('muziek: geen ongeldige waarden naar de geluidskaart', kaart.fout.length === 0, kaart.fout.slice(0, 2).join('; '));
}

// ---- 4. effectgeluiden: niet te vaak, allemaal geldig ------------------------------------
{
  const { sfx, kaart } = nepGeluid();
  kaart.currentTime = 5;
  let o = kaart.osc;
  for (let i = 0; i < 40; i++) sfx.boing();
  const boing = kaart.osc - o;
  o = kaart.osc;
  let b = kaart.bron;
  for (let i = 0; i < 40; i++) sfx.whoosh();
  const whoosh = kaart.bron - b;
  for (let i = 0; i < 30; i++) sfx.score(i % 9);
  const score = kaart.osc - o;
  check('40 trampolines tegelijk: één boing', boing === 2, `(${boing} oscillatoren)`);
  check('40 turbo\'s tegelijk: één whoosh', whoosh === 1, `(${whoosh})`);
  check('30 doelpunten tegelijk: één loopje', score === 4, `(${score} tonen)`);
  kaart.currentTime += 0.1;
  o = kaart.osc;
  sfx.boing();
  check('iets later mag de boing weer', kaart.osc - o === 2);

  const lengte = (n) => { kaart.currentTime += 1; const x = kaart.osc; sfx.combo(n); return kaart.osc - x; };
  const c3 = lengte(3), c5 = lengte(5), c10 = lengte(10);
  check('combo-deuntjes bij 3, 5 en 10 verschillen', c3 < c5 && c5 < c10, `(${c3} / ${c5} / ${c10} tonen)`);
  for (const k of ['goud', 'bonus', 'levelGehaald', 'record', 'gameOver', 'krak', 'tick', 'start', 'end', 'miss']) {
    kaart.currentTime += 1; sfx[k]();
  }
  check('alle geluiden geldig voor de geluidskaart', kaart.fout.length === 0, kaart.fout.slice(0, 2).join('; '));
}

// ---- 5. spel roept de juiste geluiden ------------------------------------------------------
{
  const { s, tel } = nepSfx();
  const g = spel({ rate: 0, sfx: s, bonusOn: true });
  g.start(60); naAftellen(g);
  g.scored({ gold: false });
  g.scored({ gold: true });
  g.scored({ gold: false }, g.bonus);
  check('doelpunt, gouden bal, bonusbak: elk een eigen geluid', tel.score.length === 1 && tel.goud.length === 1 && tel.bonus.length === 1);
  check('combo-deuntje bij 3 op rij', tel.combo && tel.combo.length === 1 && tel.combo[0][0] === 3);
  g.scored({ gold: false }); g.scored({ gold: false });
  for (let i = 0; i < 5; i++) g.scored({ gold: false });
  check('...en bij 5 en 10', tel.combo.map(a => a[0]).join(',') === '3,5,10', `(${tel.combo.map(a => a[0]).join(',')})`);
  check('combo telt door na 9, de bonus niet', g.combo === 10 && g.score.attack === 1 + 3 + 3 + 2 + 2 + 3 + 3 + 3 + 4 + 4,
    `(combo ${g.combo}, score ${g.score.attack})`);

  const tr = spel({ rate: 0, sfx: s });
  tr.start(60); naAftellen(tr);
  tr.goal.x = -999; tr.goal.y = -999;
  tr.setObstacles([box(800, 500, 1000, 540, { id: 1, kind: 'trampoline' })]);
  eenBal(tr, 900, 470, 0, 60);
  const klap0 = (tel.bounce || []).length;
  for (let i = 0; i < 30; i++) tr.update(1 / 60);
  check('trampoline: boing (geen gewone tik)', (tel.boing || []).length >= 1 && (tel.bounce || []).length === klap0);
  const tu = spel({ rate: 0, sfx: s });
  tu.start(60); naAftellen(tu);
  tu.goal.x = -999; tu.goal.y = -999;
  tu.setObstacles([box(300, 500, 1500, 540, { id: 2, kind: 'booster' })]);
  eenBal(tu, 500, 489, 200, 0);
  for (let i = 0; i < 60; i++) tu.update(1 / 60);
  check('turbo: whoosh', (tel.whoosh || []).length >= 1);

  const lv = spel({ rate: 0, sfx: s, levelMode: true });
  lv.setGoal(900, 800);
  lv.start(120); naAftellen(lv);
  lv.levelGoals = lv.levelTarget; lv.update(1 / 60);
  check('level gehaald: fanfare en feest', (tel.levelGehaald || []).length === 1 && lv.feestN > 0);
  naAftellen(lv);
  for (let i = 0; i < 60 * 46 && lv.state === 'play'; i++) lv.update(1 / 60);
  check('game over op level 2 is een record: recordfanfare', lv.newRecord && (tel.record || []).length === 1);
  lv.start(120); naAftellen(lv);
  for (let i = 0; i < 60 * 46 && lv.state === 'play'; i++) lv.update(1 / 60);
  check('game over zonder record: game-over-geluid', !lv.newRecord && (tel.gameOver || []).length === 1);

  const r = spel({ rate: 0, sfx: s });
  r.start(30); naAftellen(r);
  r.score.attack = 5;
  const end0 = (tel.end || []).length;
  for (let i = 0; i < 60 * 31 && r.state === 'play'; i++) r.update(1 / 60);
  check('ronde voorbij met record: fanfare en feest', r.newRecord && tel.record.length === 2 && (tel.end || []).length === end0 && r.feestN > 0);
}

// ---- 6. effecten op de muur ------------------------------------------------------------
{
  // Een flinke regen: bron boven de bak, veel ballen, om de twee een gouden.
  const g = spel({ rate: 12, goldEvery: 2 });
  g.setGoal(900, 800); g.setSource(900, 70);
  g.start(60); naAftellen(g);
  const gezien = new Set(), teksten = new Set(), soorten = new Set(), woorden = new Set();
  let meest = 0, nan = 0;
  for (let i = 0; i < 60 * 20; i++) {
    g.update(1 / 60);
    meest = Math.max(meest, g.parts.length);
    for (const p of g.parts) { gezien.add(p); soorten.add(p.kind); if (!Number.isFinite(p.x + p.y + p.vx + p.vy)) nan++; }
    for (const p of g.pops) { teksten.add(p); woorden.add(p.text); }
  }
  check('deeltjes: nooit meer dan 250', meest <= 250 && g.parts.length + g.partPool.length === 250, `(hoogste ${meest})`);
  check('deeltjes komen uit de voorraad (niets nieuws per beeldje)', gezien.size <= 250 && nan === 0, `(${gezien.size} verschillende)`);
  check('zwevende teksten: hooguit 24, hergebruikt', g.pops.length <= 24 && teksten.size <= 24, `(${teksten.size} verschillende)`);
  check('confetti en sterretjes gezien', soorten.has(1) && soorten.has(2));
  check('COMBO-tekst bij 3, 5, 10 en daarna elke 5', g.score.attack > 20 && ['COMBO ×3', 'COMBO ×5', 'COMBO ×10', 'COMBO ×15'].every(w => woorden.has(w)) &&
    !woorden.has('COMBO ×4') && !woorden.has('COMBO ×11'));
  g.rate = 0;
  g.goal.x = -999;
  for (let i = 0; i < 60 * 4; i++) g.update(1 / 60);
  check('teksten en deeltjes verlopen', g.pops.length === 0 && g.parts.length === 0 && g.popPool.length > 0,
    `(${g.pops.length} teksten, ${g.parts.length} deeltjes over)`);
  g.reset();
  check('reset(): alles terug in de voorraad', g.partPool.length === 250 && g.parts.length === 0);
}
{
  // gouden bal: sterretjes erachter en gouden confetti in de bak; gewone bal niet
  const mk = (gold) => {
    const g = spel({ rate: 0 });
    g.setGoal(900, 800);
    g.start(60); naAftellen(g);
    g.setObstacles([]);
    eenBal(g, 900, 300, 0, 0, gold);
    let sterren = 0;
    for (let i = 0; i < 20; i++) { g.update(1 / 60); sterren = Math.max(sterren, g.parts.filter(p => p.kind === 2).length); }
    for (let i = 0; i < 100 && g.balls.length; i++) g.update(1 / 60);
    return { sterren, confetti: g.parts.filter(p => p.kind === 1).map(p => p.col), score: g.score.attack };
  };
  const goud = mk(true), gewoon = mk(false);
  check('gouden bal: spoor van sterretjes', goud.sterren >= 3 && gewoon.sterren === 0, `(${goud.sterren} / ${gewoon.sterren})`);
  const GOUD = ['#ffd479', '#ffe9a8', '#ffb347', '#fff3c4'];
  check('confetti in de bak, goud bij een gouden bal', goud.score === 3 && goud.confetti.length > 0 &&
    goud.confetti.every(c => GOUD.includes(c)) && gewoon.confetti.some(c => !GOUD.includes(c)));
}
{
  // Effecten uit: precies het oude beeld. En aan of uit verandert niets aan het spel.
  const speel = (effects) => {
    Math.random = rng(777);
    const g = spel({ rate: 6, goldEvery: 2, effects, bonusOn: true, wind: 300, sourceSweep: 0.6 });
    g.setGoal(900, 800); g.setSource(880, 70);
    g.setObstacles([box(250, 450, 550, 480, { id: 1, kind: 'trampoline' }), box(1100, 500, 1400, 530, { id: 2, kind: 'booster' })]);
    g.start(40); naAftellen(g);
    let soorten = new Set(), groei = 0;
    for (let i = 0; i < 60 * 41; i++) {
      g.update(1 / 60);
      for (const p of g.parts) soorten.add(p.kind);
      for (const p of g.pops) if (p.grow || /COMBO/.test(p.text)) groei++;
    }
    return { g, soorten, groei, stand: g.score.attack + '/' + g.misses + '/' + g.spawned };
  };
  const aan = speel(true), uit = speel(false);
  check('effecten uit: alleen de oude vonken en +1', [...uit.soorten].join() === '0' && uit.groei === 0 && uit.g.feestN === 0,
    `(soorten ${[...uit.soorten].join()})`);
  check('effecten aan of uit: hetzelfde spel', aan.stand === uit.stand && aan.soorten.size === 3 && aan.g.score.attack > 5,
    `(punten/mis/ballen ${aan.stand} en ${uit.stand})`);
}
{
  // Feest: vuurwerk nooit op een briefje, en niets als alles vol hangt.
  const g = spel({ rate: 0 });
  g.setObstacles([box(200, 100, 500, 250, { id: 1 }), box(1000, 150, 1200, 300, { id: 2 })]);
  const doos = g.obstacles.map(o => { const xs = o.poly.map(p => p[0]), ys = o.poly.map(p => p[1]); return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]; });
  let slechtst = Infinity, knallen = 0;
  for (let k = 0; k < 30; k++) {
    const voor = g.parts.length;
    g.knal();
    if (g.parts.length > voor) knallen++;
    const p = g.parts[g.parts.length - 1];
    if (p) for (const b of doos) slechtst = Math.min(slechtst, Math.hypot(p.x - Math.max(b[0], Math.min(b[2], p.x)), p.y - Math.max(b[1], Math.min(b[3], p.y))));
    while (g.parts.length) g.partPool.push(g.parts.pop());
  }
  check('vuurwerk begint nooit op een briefje', knallen > 20 && slechtst >= 110, `(${knallen} knallen, dichtstbij ${slechtst.toFixed(0)})`);
  g.setObstacles([box(0, 0, g.W, g.H * 0.6, { id: 3 })]);
  g.knal();
  check('muur vol: geen vuurwerk', g.parts.length === 0);
  g.feest(4);
  g.setObstacles([]);
  for (let i = 0; i < 90; i++) g.update(1 / 60);
  check('feest: een paar vuurwerkjes na elkaar', g.feestN === 0 && g.parts.length > 60 && g.parts.length <= 250, `(${g.parts.length} deeltjes)`);
  // Effecten uitgezet midden in het feest: de rest van het vuurwerk komt niet meer.
  while (g.parts.length) g.partPool.push(g.parts.pop());
  g.feest(4);
  g.update(1 / 60);
  const eerste = g.parts.length;
  g.effects = false;
  let nieuw = 0;
  g.part = function () { nieuw++; return Game.prototype.part.call(this); };
  for (let i = 0; i < 90; i++) g.update(1 / 60);
  delete g.part;
  check('effecten uit midden in het feest: geen vuurwerk meer', eerste > 0 && nieuw === 0 && g.feestN === 0,
    `(${nieuw} nieuwe deeltjes)`);
}
{
  // Klok: laatste tien seconden springt hij op; voorwerpmodus: nergens gloed of NaN.
  const g = spel({ rate: 3, goldEvery: 2, lowLight: true, fill: 0.3 });
  g.setGoal(900, 800); g.setSource(900, 70);
  g.start(30); naAftellen(g);
  const zonderTeksten = () => { while (g.pops.length) g.popPool.push(g.pops.pop()); };
  for (let i = 0; i < 60 * 15; i++) g.update(1 / 60);
  zonderTeksten();
  const voor = teken(g).scale;               // het beeld zelf en de ademende bak worden ook geschaald
  check('klok: nog geen laatste tien seconden', !g.laatsteTien(), `(${g.time.toFixed(1)} s)`);
  for (let i = 0; i < 60 * 6; i++) g.update(1 / 60);
  const log = teken(g);
  zonderTeksten();
  const na = teken(g).scale;
  check('klok: laatste tien seconden springt hij op', g.laatsteTien() && g.time <= 10 && g.time > 0 && na === voor + 1,
    `(${g.time.toFixed(1)} s, ${voor} -> ${na} keer geschaald)`);
  check('voorwerpmodus: effecten zonder gloed en zonder NaN', log.blur === 0 && log.fout.length === 0 && g.parts.length > 0,
    `(gloed ${log.blur}, ${log.fout.slice(0, 2).join(',')})`);
  const e = spel({ endless: true });
  e.start(30); naAftellen(e);
  check('eindeloos: klok springt nooit op', !e.laatsteTien());
}

globalThis.setInterval = echt.setInterval;
globalThis.clearInterval = echt.clearInterval;
globalThis.setTimeout = echt.setTimeout;
klaar();
