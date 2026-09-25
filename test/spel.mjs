// Physics en spelverloop.
import { Game, normalizePoly } from '../js/game.js';
// De bonusbak staat op een willekeurige plek en zou hier ballen wegvangen; deze tests
// gaan over de gewone bak, dus hij staat uit (zie test/modi.mjs).
let fouten = 0;
const check = (naam, ok, extra = '') => {
  console.log((ok ? 'ok   ' : 'FOUT ') + naam.padEnd(46) + extra);
  if (!ok) fouten++;
};
const play = (g) => { for (let i = 0; i < 200; i++) g.update(1 / 60); };   // aftellen voorbij

// ballen schieten niet door een obstakel heen
{
  const g = new Game(null); g.bonusOn = false;
  g.setAspect(16 / 9); g.rate = 0; g.start(60); g.gravity = 2600; play(g);
  const poly = [];
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * Math.PI * 2;
    poly.push([900 + Math.cos(a) * 130, 480 + Math.sin(a) * 90]);
  }
  g.setObstacles([{ team: 'object', vx: 0, vy: 0, poly: normalizePoly(poly) }]);
  g.goal.x = -999; g.goal.y = -999; g.source.x = 900; g.source.y = 60;
  for (let k = 0; k < 30; k++) g.spawn();
  let binnen = 0;
  for (let i = 0; i < 1200; i++) {
    g.update(1 / 120);
    for (const b of g.balls) {
      const dx = (b.x - 900) / 130, dy = (b.y - 480) / 90;
      if (dx * dx + dy * dy < 0.55) binnen++;
    }
  }
  check('30 ballen, geen enkele door een 8-hoek heen', binnen === 0);
}

// doelpunt en record
{
  const g = new Game(null); g.bonusOn = false;
  g.setAspect(16 / 9); g.rate = 0; g.start(60); play(g);
  g.setObstacles([]); g.goal.x = g.source.x; g.goal.y = 800;
  g.spawn();
  for (let i = 0; i < 900 && g.balls.length; i++) g.update(1 / 120);
  check('bal in de bak telt als doelpunt', g.score.attack === 1);
}

// duel telt een blok, solo telt een misser
{
  const mk = (duel) => {
    const g = new Game(null); g.bonusOn = false;
    g.setAspect(16 / 9); g.rate = 0; g.duel = duel; g.start(60); play(g);
    g.setObstacles([{ team: 'block', vx: 0, vy: 0, poly: normalizePoly([
      [g.W * 0.5 - 160, 400], [g.W * 0.5 + 160, 460], [g.W * 0.5 + 160, 496], [g.W * 0.5 - 160, 436]]) }]);
    g.goal.x = -999; g.goal.y = -999; g.source.x = g.W * 0.5; g.source.y = 60;
    g.spawn();
    for (let i = 0; i < 1200 && g.balls.length; i++) g.update(1 / 120);
    return g;
  };
  check('duel: geblokkeerde bal is een punt voor de verdediger', mk(true).score.block === 1);
  check('solo: diezelfde bal telt als gemist', mk(false).misses === 1);
}

// obstakels die nog "pending" zijn raken niets
{
  const g = new Game(null); g.bonusOn = false;
  g.setAspect(16 / 9); g.rate = 0; g.start(60); play(g);
  g.setObstacles([{ team: 'object', pending: true, vx: 0, vy: 0, poly: normalizePoly([
    [g.W * 0.5 - 200, 400], [g.W * 0.5 + 200, 400], [g.W * 0.5 + 200, 440], [g.W * 0.5 - 200, 440]]) }]);
  g.goal.x = -999; g.goal.y = -999; g.source.x = g.W * 0.5; g.source.y = 60;
  g.spawn();
  for (let i = 0; i < 1200 && g.balls.length; i++) g.update(1 / 120);
  check('nog niet bevestigd obstakel laat ballen door', g.misses === 1 && g.score.attack === 0);
}

// ronde: aftellen, spelen, einde, record blijft
{
  const g = new Game(null); g.bonusOn = false;
  g.setAspect(16 / 9); g.rate = 2; g.start(12);
  check('ronde begint met aftellen', g.state === 'count');
  play(g);
  check('daarna spelen', g.state === 'play');
  g.setObstacles([]); g.goal.x = g.source.x;
  for (let i = 0; i < 60 * 13; i++) g.update(1 / 60);
  const score = g.score.attack;
  check('ronde eindigt met een record', g.state === 'over' && g.best === score && score > 0);
  g.start(12);
  check('nieuwe ronde reset de score, niet het record', g.score.attack === 0 && g.best === score);
}

// doel blijft binnen het speelveld
{
  const g = new Game(null); g.bonusOn = false;
  g.setAspect(16 / 9);
  g.setGoal(99999, 99999);
  const a = g.goal.x < g.W && g.goal.y < g.H;
  g.setGoal(-9999, -9999);
  const b = g.goal.x > 0 && g.goal.y > 0;
  check('doel kan het speelveld niet uit', a && b);
}

console.log('');
console.log(fouten ? fouten + ' test(s) mislukt' : 'alles goed');
process.exitCode = fouten ? 1 : 0;
