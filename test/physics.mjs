// Physics- en spelglitches die bij de audit gereproduceerd zijn.
import { Game, normalizePoly, check, klaar } from './hulp.mjs';

function spel(opt = {}) {
  const g = new Game(opt.sfx || null);
  g.bonusOn = false;           // willekeurig geplaatste bonusbak zou ballen wegvangen
  g.setAspect(16 / 9);
  Object.assign(g, opt);
  return g;
}
const naAftellen = (g) => { for (let i = 0; i < 200; i++) g.update(1 / 60); };
const box = (x0, y0, x1, y1, extra = {}) => ({
  team: 'object', vx: 0, vy: 0, ...extra,
  poly: normalizePoly([[x0, y0], [x1, y0], [x1, y1], [x0, y1]]),
});

// ---- 1. ballen stapelen zich niet op tot er niets meer valt --------------------
{
  const g = spel({ rate: 2 });
  g.start(180); naAftellen(g);
  g.goal.x = -999; g.goal.y = -999;
  // een vlakke plank recht onder de bron: hier bleven ballen vroeger liggen
  g.setObstacles([box(g.source.x - 120, 500, g.source.x + 120, 530)]);
  let laatsteGeboorte = 0, piek = 0, vorige = g.nextBall;
  for (let i = 0; i < 60 * 170; i++) {
    g.update(1 / 60);
    if (g.nextBall !== vorige) { laatsteGeboorte = i / 60; vorige = g.nextBall; }
    piek = Math.max(piek, g.balls.length);
  }
  check('plank onder de bron: na 3 minuten vallen er nog ballen', laatsteGeboorte > 165,
    `(laatste nieuwe bal op ${laatsteGeboorte.toFixed(0)} s, piek ${piek} ballen)`);
}

// ---- 2. een bal die zichtbaar in de trechter valt, telt ----------------------
{
  let raak = 0;
  for (const f of [-0.85, -0.7, 0, 0.7, 0.85]) {         // ook vlak binnen de rand
    const g = spel({ rate: 0 });
    g.start(60); naAftellen(g);
    g.setObstacles([]);
    g.goal.x = 900; g.goal.y = 800;
    g.source.x = 900 + f * g.goal.r; g.source.y = 60;
    g.spawn();
    g.balls[0].x = g.source.x; g.balls[0].vx = 0;
    for (let i = 0; i < 600 && g.balls.length; i++) g.update(1 / 120);
    raak += g.score.attack;
  }
  check('bal in de trechteropening telt als doelpunt', raak === 5, `(${raak}/5)`);
}

// ---- 3. duel: alleen een blauw briefje levert een blok op ----------------------
{
  const mk = (team) => {
    const g = spel({ rate: 0, duel: true });
    g.start(60); naAftellen(g);
    g.setObstacles([{ team, vx: 0, vy: 0, poly: normalizePoly([
      [g.W * 0.5 - 160, 400], [g.W * 0.5 + 160, 460], [g.W * 0.5 + 160, 496], [g.W * 0.5 - 160, 436]]) }]);
    g.goal.x = -999; g.goal.y = -999; g.source.x = g.W * 0.5; g.source.y = 60;
    g.spawn();
    for (let i = 0; i < 1200 && g.balls.length; i++) g.update(1 / 120);
    return g.score.block;
  };
  check('duel: mis via oranje briefje is geen blok', mk('attack') === 0);
  check('duel: mis via blauw briefje is wel een blok', mk('block') === 1);
}

// ---- 4. slingerende bak: geen sprongen ----------------------------------------
{
  const g = spel({ rate: 0, goalSweep: 0.4 });
  g.setGoal(900, 800);
  const thuis = g.goal.x;
  g.start(60);
  let sprong = 0, vorige = g.goal.x;
  for (let i = 0; i < 400; i++) {                        // door het aftellen en GO heen
    g.update(1 / 60);
    sprong = Math.max(sprong, Math.abs(g.goal.x - vorige)); vorige = g.goal.x;
  }
  check('slingerende bak springt niet bij GO', sprong < 10, `(grootste stap ${sprong.toFixed(1)})`);
  g.goalSweep = 1.8;                                      // tempo halverwege omhoog
  sprong = 0;
  for (let i = 0; i < 60; i++) { g.update(1 / 60); sprong = Math.max(sprong, Math.abs(g.goal.x - vorige)); vorige = g.goal.x; }
  check('ander tempo halverwege: geen sprong', sprong < 25, `(grootste stap ${sprong.toFixed(1)})`);
  for (let r = 0; r < 3; r++) { g.start(5); for (let i = 0; i < 60 * 9; i++) g.update(1 / 60); }
  g.start(5);
  check('thuispositie schuift niet op over rondes', Math.abs(g.goal.x - thuis) < 1, `(${(g.goal.x - thuis).toFixed(1)} verschoven)`);
}

// ---- 5. klok en einde ---------------------------------------------------------
{
  const g = spel({ rate: 3 });
  g.start(30); naAftellen(g);
  // de allerlaatste frames voor het einde
  while (g.state === 'play' && g.time > 0.5) g.update(1 / 60);
  // wat de klok écht tekent, via een nep-tekenvlak dat de teksten opvangt
  const teksten = [];
  const ctx = new Proxy({}, { get: (o, k) => k === 'fillText' ? (t) => teksten.push(String(t))
    : (k in o ? o[k] : () => {}), set: (o, k, v) => { o[k] = v; return true; } });
  g.drawHud(ctx);
  const klok = teksten.find(t => /^\d+:\d\d$/.test(t));
  check('laatste seconde toont 0:01, niet 0:00', g.state === 'play' && klok === '0:01', `(klok toont ${klok})`);
  while (g.state === 'play') g.update(1 / 60);
  const ys = g.balls.map(b => b.y);
  for (let i = 0; i < 30; i++) g.update(1 / 60);
  const bewogen = ys.length === 0 || g.balls.length < ys.length || g.balls.some((b, i) => Math.abs(b.y - ys[i]) > 1);
  check('na afloop blijven ballen niet in de lucht hangen', bewogen, `(${ys.length} ballen onderweg)`);
}
{
  const g = spel({ rate: 0, endless: true });
  g.start(120); naAftellen(g);
  for (let i = 0; i < 60 * 45; i++) g.update(1 / 60);
  g.endless = false;                                     // eindeloos halverwege uit
  g.update(1 / 60);
  check('eindeloos uitzetten: resterende tijd = rondetijd min gespeeld', Math.abs(g.time - 75) < 0.5, `(${g.time.toFixed(1)} s over)`);
}

// ---- 6. een kapot obstakel vangt niet alle ballen ------------------------------
{
  const g = spel({ rate: 0 });
  g.start(60); naAftellen(g);
  // kapotte meting: alle hoekpunten ongeldig. In de oude code gold elke bal dan als
  // 'binnen' en kreeg hij een NaN-positie, waarna hij nooit meer viel.
  g.setObstacles([{ team: 'object', vx: 0, vy: 0, poly: [[NaN, NaN], [NaN, NaN], [NaN, NaN], [NaN, NaN]] }]);
  g.goal.x = -999; g.goal.y = -999;
  for (let k = 0; k < 10; k++) g.spawn();
  for (let i = 0; i < 60 * 5; i++) g.update(1 / 60);
  check('obstakel met NaN-hoekpunt wordt genegeerd', g.misses === 10, `(${g.misses}/10 gevallen)`);
}

// ---- 7. obstakel verschijnt óp een bal: geen wegschieten ------------------------
{
  const g = spel({ rate: 0 });
  g.start(60); naAftellen(g);
  g.setObstacles([]); g.goal.x = -999; g.goal.y = -999;
  g.spawn();
  const b = g.balls[0];
  b.x = 900; b.y = 500; b.vx = 0; b.vy = 0;
  g.gravity = 0;
  g.setObstacles([box(820, 440, 980, 560)]);            // bal zit er ineens midden in
  let maxStap = 0, px = b.x, py = b.y, maxV = 0;
  for (let i = 0; i < 60; i++) {
    g.update(1 / 60);
    maxStap = Math.max(maxStap, Math.hypot(b.x - px, b.y - py)); px = b.x; py = b.y;
    maxV = Math.max(maxV, Math.hypot(b.vx, b.vy));
  }
  check('bal in nieuw obstakel glijdt eruit, schiet niet weg', maxStap < 40 && maxV < 400,
    `(grootste stap ${maxStap.toFixed(0)}, snelheid ${maxV.toFixed(0)})`);
}

// ---- 8. bal op een trillend boek: geen gestuiter en geen geluidsregen ------------
{
  let geluid = 0;
  const g = spel({ rate: 0, sfx: { bounce: () => geluid++, score() {}, miss() {}, tick() {}, start() {}, end() {} } });
  g.start(60); naAftellen(g);
  g.goal.x = -999; g.goal.y = -999;
  g.spawn();
  const b = g.balls[0];
  b.x = 900; b.y = 480; b.vx = 0; b.vy = 0;
  let maxHop = 0;
  for (let i = 0; i < 60 * 7; i++) {
    const tril = Math.sin(i * 1.7) * 1.2;              // handtrilling, ~1 eenheid
    g.setObstacles([box(800, 500 + tril, 1000, 540 + tril, { id: 1, vx: 0, vy: Math.cos(i * 1.7) * 120 })]);
    g.update(1 / 60);
    if (i > 60) maxHop = Math.max(maxHop, 500 - b.r - b.y);
  }
  check('bal op trillend boek huppelt niet', maxHop < 6, `(hoogste sprong ${maxHop.toFixed(1)})`);
  check('en maakt geen regen aan stuitergeluiden', geluid <= 2, `(${geluid} geluiden in 7 s)`);
}

// ---- 9. snel geveegd voorwerp gaat niet door een bal heen ------------------------
{
  let doorheen = 0;
  for (let k = 0; k < 20; k++) {
    const g = spel({ rate: 0 });
    g.start(60); naAftellen(g);
    g.goal.x = -999; g.goal.y = -999; g.gravity = 0;
    g.spawn();
    const b = g.balls[0];
    b.x = 900; b.y = 500 + k; b.vx = 0; b.vy = 0;
    // een stok van 30 breed die met 1200 eenheden/s voorbij veegt, 30 Hz metingen
    let x = 700;
    for (let i = 0; i < 40; i++) {
      if (i % 2 === 0) x += 1200 / 30;
      g.setObstacles([box(x - 15, 420, x + 15, 580, { id: 7 })]);
      g.update(1 / 60);
    }
    if (b.x < 930) doorheen++;                           // achtergebleven of achter de stok
  }
  check('snel geveegde stok neemt de bal mee', doorheen <= 2, `(${doorheen}/20 erdoorheen)`);
}

klaar();
