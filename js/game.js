// Spel: balletjes vallen, ketsen af op de gedetecteerde briefjes, moeten in de bak.
// Wereldcoordinaten: hoogte altijd 1000, breedte = 1000 * beeldverhouding.
// Teksten op de muur gaan door t() (js/taal.js), zodat ze meewisselen met NL | EN.

import { t, tAantal, tHerkomst, huidigeTaal, TaalTeller } from './taal.js';

export const WORLD_H = 1000;

function shoelace(p) {
  let a = 0;
  for (let i = 0; i < p.length; i++) {
    const q = p[(i + 1) % p.length];
    a += p[i][0] * q[1] - q[0] * p[i][1];
  }
  return a;
}

/**
 * Veelhoek een eindje naar buiten schuiven: elke rand evenwijdig naar buiten, en de
 * nieuwe hoekpunten waar de verschoven randen elkaar snijden. Vanuit het midden
 * schuiven werkt niet voor lange smalle vormen: de lange zijden bewegen dan nauwelijks.
 */
function outset(poly, d) {
  const p = normalizePoly(poly), n = p.length;
  if (n < 3) return poly;
  const lines = [];
  for (let i = 0; i < n; i++) {
    const a = p[i], b = p[(i + 1) % n];
    const ex = b[0] - a[0], ey = b[1] - a[1], L = Math.hypot(ex, ey) || 1;
    lines.push([a[0] + (ey / L) * d, a[1] + (-ex / L) * d, ex, ey]);   // (ey, -ex) wijst naar buiten
  }
  const out = [];
  for (let i = 0; i < n; i++) {
    const [px, py, ux, uy] = lines[(i - 1 + n) % n], [qx, qy, vx, vy] = lines[i];
    const den = ux * vy - uy * vx;
    let x = qx, y = qy;
    if (Math.abs(den) > 1e-9) {
      const t = ((qx - px) * vy - (qy - py) * vx) / den;
      x = px + ux * t; y = py + uy * t;
    }
    // scherpe hoeken niet eindeloos laten uitpunten
    const ox = x - p[i][0], oy = y - p[i][1], L = Math.hypot(ox, oy);
    if (L > d * 3) { x = p[i][0] + ox / L * d * 3; y = p[i][1] + oy / L * d * 3; }
    out.push([x, y]);
  }
  return out;
}

// Zorgt dat elke veelhoek dezelfde draairichting heeft (binnenkant = kruisproduct > 0).
export function normalizePoly(p) {
  return shoelace(p) < 0 ? p.slice().reverse() : p;
}

// ---- tegen glitches (wereldeenheden: het beeld is 1000 hoog) ---------------
// Dezelfde vangnetten die Box2D en Rapier gebruiken.
// Een bal die in een obstakel zit wordt er met begrensde snelheid uit geduwd, niet
// in één keer weggeteleporteerd (b2WorldDef.contactSpeed).
const MAX_PUSH_SPEED = 1500;
// Trage botsingen stuiteren niet, anders blijft een bal op een boek huppelen
// (restitutionThreshold).
const REST_THRESH = 160;
// Trillen van een hand is geen klap: daaronder duwt een obstakel alleen.
const OB_TREMOR = 200;
// Harde grens, zodat één rare frame nooit een bal door de muur schiet.
const MAX_BALL_SPEED = 2600;
// Obstakels bewegen nooit sneller dan dit (een zwaaiend boek haalt ~1300).
const MAX_OB_SPEED = 1800;
// Een sprong groter dan dit is een nieuwe meting, geen beweging: niet overvegen.
const SNAP_DIST = 160;
// Een bal die zo lang (bijna) stilligt zit vast en wordt opgeruimd.
const STUCK_AFTER = 2.5;

// ---- speciale briefjes (alleen als game.special aan staat) --------------------
// Rood = trampoline: elke aanraking schiet de bal minstens zo hard weg langs de normaal.
const TRAMPOLINE_SPEED = 950;
const TRAMPOLINE_REST = 1.1;
// Met een veerkracht boven 1 wint een bal bij elke sprong snelheid. Zonder plafond
// stuitert hij binnen tien sprongen tegen MAX_BALL_SPEED. Iets boven een val over het
// hele beeld (~1600).
const TRAMPOLINE_MAX = 1600;
// Groen = turbo: een zet langs de rolrichting, hooguit eens per BOOST_COOLDOWN per bal.
const BOOST_KICK = 550;
const BOOST_COOLDOWN = 0.3;
// Blauw = breekbare muur: na BREAK_HITS echte klappen is hij BREAK_TIME s weg. Een id
// die BREAK_FORGET s niet meer langskwam, vergeten we.
const BREAK_HITS = 5;
const BREAK_TIME = 5;
const BREAK_FORGET = 10;
const KIND_STYLE = {
  trampoline: { col: '#ff4d4d', label: 'BOING' },
  booster: { col: '#3ddc84', label: 'TURBO' },
  breek: { col: '#3aa0ff', label: '' },          // het label is het aantal klappen dat nog over is
};
// Plekken voor de bak vanaf level 2 (fractie van breedte en hoogte).
const LEVEL_SPOTS = [[0.25, 0.80], [0.78, 0.80], [0.50, 0.72], [0.82, 0.64], [0.18, 0.66], [0.62, 0.84]];
// Zo vaak verhuist de bonusbak tijdens het spelen.
const BONUS_MOVE = 20;
// Een bal die een trampoline of turbo steeds opnieuw wegschiet maar die binnen
// JAM_DIST van zijn plek blijft (klem onder een briefje, in een V van turbo's), ligt
// nooit stil. Na JAM_AFTER s ruimen we hem op zoals een vastgelopen bal.
const JAM_DIST = 80;
const JAM_AFTER = 3;
// Zwevende teksten (+1, BLOK, KRAK): lettergrootte, en hoeveel ze opstijgen tot ze weg zijn.
const POP_PX = 46;
const POP_RISE = 70;

// ---- effecten (vinkje Effecten; uit = alleen de vonken en de +1 van vroeger) ------
// Harde grens op het aantal deeltjes. Ze komen uit een vaste voorraad, dus tijdens het
// spelen wordt er niets nieuws aangemaakt. Vol? Dan wordt een levend deeltje hergebruikt.
const FX_MAX_PARTS = 250;
const FX_MAX_POPS = 24;
const FX_CONFETTI = ['#ff4fa3', '#3ddc84', '#3aa0ff', '#ffd479', '#ff8a1e', '#b58cff'];
const FX_GOUD = ['#ffd479', '#ffe9a8', '#ffb347', '#fff3c4'];
// Lettertypes van de zwevende teksten, één keer samengesteld (niet elk beeldje opnieuw).
const FX_POP_FONT = '700 ' + POP_PX + 'px ui-sans-serif, system-ui, sans-serif';
const FX_POP_GROOT = '800 60px ui-sans-serif, system-ui, sans-serif';
const FX_COMBO_FONT = '800 56px ui-sans-serif, system-ui, sans-serif';
// Teksten met een getal die elk beeldje getekend worden: alleen opnieuw opgebouwd als het
// getal of de taal verandert.
const HUD_LEVEL = new TaalTeller('LEVEL {n}');
const HUD_COMBO = new TaalTeller('COMBO x{n}');
const HUD_BEST = new TaalTeller('hoogste score tot nu toe: {n}');

// Eén deeltje. Soort 0 = vonk (rondje), 1 = confetti (draaiend papiertje), 2 = sterretje.
function fxDeeltje() {
  return { x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, col: '#fff', r: 2, kind: 0, rot: 0, vr: 0, drag: 0, grav: 0.45 };
}

// Legt de normaal van het contact op de bal vast (ball.nx, ball.ny, naar buiten), zodat
// speciale briefjes weten welke kant op ze moeten duwen. `thresh` is de stuiterdrempel;
// een trampoline geeft 0 mee, zodat ook een trage bal wegveert.
function collide(ball, ob, rest, friction, h = 1 / 240, thresh = REST_THRESH) {
  const poly = ob.poly;
  const n = poly.length;
  let inside = true;
  let minDepth = Infinity, inx = 0, iny = 0;
  let bestD2 = Infinity, bqx = 0, bqy = 0;

  for (let i = 0; i < n; i++) {
    const ax = poly[i][0], ay = poly[i][1];
    const bx = poly[(i + 1) % n][0], by = poly[(i + 1) % n][1];
    const ex = bx - ax, ey = by - ay;
    const len2 = ex * ex + ey * ey || 1e-6;
    const invLen = 1 / Math.sqrt(len2);
    const sd = (ex * (ball.y - ay) - ey * (ball.x - ax)) * invLen;
    if (sd < 0) inside = false;
    else if (sd < minDepth) { minDepth = sd; inx = ey * invLen; iny = -ex * invLen; }

    let t = ((ball.x - ax) * ex + (ball.y - ay) * ey) / len2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const qx = ax + ex * t, qy = ay + ey * t;
    const dx = ball.x - qx, dy = ball.y - qy;
    const d2 = dx * dx + dy * dy;
    if (d2 < bestD2) { bestD2 = d2; bqx = qx; bqy = qy; }
  }

  let nx, ny, push;
  if (inside) {
    nx = inx; ny = iny; push = minDepth + ball.r;
  } else {
    const dist = Math.sqrt(bestD2);
    if (dist >= ball.r) return -1;                 // geen contact
    if (dist < 1e-6) return -1;
    nx = (ball.x - bqx) / dist; ny = (ball.y - bqy) / dist;
    push = ball.r - dist;
  }
  ball.nx = nx; ball.ny = ny;

  // Begrensd uitduwen. Een gewone botsing dringt minder dan één substap in en wordt
  // meteen opgelost; een bal die ineens ín een nieuw obstakel zit glijdt er in een
  // paar frames uit in plaats van honderd eenheden weg te schieten.
  const deep = inside || push > ball.r * 0.75;
  const maxPush = MAX_PUSH_SPEED * h;
  if (push > maxPush) push = maxPush;
  ball.x += nx * push;
  ball.y += ny * push;

  // Onder trilniveau duwt een obstakel alleen, het geeft geen klap.
  let obvx = ob.vx || 0, obvy = ob.vy || 0;
  if (obvx * obvx + obvy * obvy < OB_TREMOR * OB_TREMOR) { obvx = 0; obvy = 0; }
  const rvx = ball.vx - obvx;
  const rvy = ball.vy - obvy;
  const vn = rvx * nx + rvy * ny;
  if (vn >= 0) return 0;
  const tx = -ny, ty = nx;
  const vt = rvx * tx + rvy * ty;
  // Drempel voor stuiteren, en niet stuiteren terwijl hij uit een overlap geduwd wordt.
  const e = (deep || -vn < thresh) ? 0 : rest;
  const newN = -vn * e;
  // Wrijving per seconde, niet per substap: met meer substappen zou een bal anders
  // steeds stroever worden en op elke helling blijven liggen.
  const newT = vt * Math.pow(1 - friction, h * 60);
  ball.vx = obvx + nx * newN + tx * newT;
  ball.vy = obvy + ny * newN + ty * newT;
  return e > 0 ? -vn : 0;          // wel contact; rusten en uitduwen maken geen geluid
}

function centroidOf(poly) {
  let cx = 0, cy = 0;
  for (const p of poly) { cx += p[0]; cy += p[1]; }
  return [cx / poly.length, cy / poly.length];
}

// Omhullende rechthoek [x0, y0, x1, y1] van een veelhoek.
function polyBox(poly) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of poly) {
    if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0];
    if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1];
  }
  return [x0, y0, x1, y1];
}

// Afstand van (x, y) tot rechthoek b; 0 als het punt erin ligt.
function boxDist(b, x, y) {
  return Math.hypot(x - Math.max(b[0], Math.min(b[2], x)), y - Math.max(b[1], Math.min(b[3], y)));
}

// Overlappen rechthoeken a en b, met `m` speling eromheen?
function boxHit(a, b, m = 0) {
  return a[0] < b[2] + m && a[2] > b[0] - m && a[1] < b[3] + m && a[3] > b[1] - m;
}

export class Game {
  constructor(sfx) {
    this.sfx = sfx;
    this.W = WORLD_H * 16 / 9;
    this.H = WORLD_H;
    this.balls = [];
    this.parts = [];
    this.pops = [];
    this.obstacles = [];
    this.gravity = 1300;
    this.rest = 0.58;
    this.friction = 0.12;
    this.rate = 1.0;
    this.spawnAcc = 0;
    this.nextBall = 1;
    // Bron en doel staan niet recht boven elkaar: anders vallen de ballen er
    // zonder obstakels al in en heeft spelen geen zin.
    this.goal = { x: this.W * 0.55, y: this.H * 0.80, r: 110, auto: false };
    this.source = { x: this.W * 0.22, y: 70, auto: false };
    this.goalHome = this.goal.x;
    this.sourceHome = this.source.x;
    this.windNow = 0;
    // In voorwerpmodus houden we de projectie zuinig met licht: elke gloed die
    // op een voorwerp valt maakt dat voorwerp onzichtbaar voor de camera.
    this.lowLight = false;
    this.fill = 0;             // muurverlichting, 0 = zwart, 1 = wit
    this.score = { attack: 0, block: 0 };
    this.misses = 0;
    this.duel = false;          // false = samen scoren, true = aanvaller tegen verdediger
    this.combo = 0;
    this.comboT = 0;
    this.state = 'idle';       // idle | play | paused | over
    this.time = 0;
    this.roundLen = 180;
    this.endless = false;
    this.sourceSweep = 0;      // 0 = stil, anders slingert de bron heen en weer
    this.goalSweep = 0;        // idem voor de bak
    this.wind = 0;             // zijwaartse kracht, wisselt langzaam van richting
    this.sweepT = 0;
    this.srcPhase = 0;         // fase van de slingerende bron; opgeteld, zodat een ander
    this.goalPhase = 0;        // tempo halverwege geen sprong geeft
    this.elapsed = 0;          // gespeelde tijd; de klok is daarvan afgeleid
    this.countdown = 0;
    this.best = 0;
    this.newRecord = false;
    this.lastTick = -1;
    this.flash = 0;
    this.flashCol = '#fff';
    this.banner = null;
    this.t = 0;
    this.kin = new Map();       // FIX 2: per-track kinematic follow state

    // Speciale briefjes: obstakels met kind 'trampoline' | 'booster' | 'breek'.
    // Uit = kind wordt genegeerd en elk briefje is een gewoon obstakel.
    this.special = true;
    this.breakables = new Map(); // id (of het obstakel zelf) -> { hits, left, seen }
    // Gouden ballen: elke goldEvery-de bal telt drie keer (0 = uit).
    this.goldEvery = 8;
    this.spawned = 0;
    // Bonusbak: een kleinere gouden bak midden op de muur die af en toe verhuist.
    this.bonusOn = true;
    this.bonus = { x: this.W * 0.75, y: this.H * 0.45, r: 62, pts: 3 };
    this.bonusClock = BONUS_MOVE; // seconden tot de volgende verhuizing
    this.bonusFade = 0;           // 0..1, even infaden na een verhuizing
    this.bonusWait = 0;           // na een mislukte plaatsing even niet opnieuw proberen
    // Uitdaging: levels met een doel en een eigen klok. level 0 = geen levelreeks.
    this.levelMode = false;
    this.levelTime = 45;
    this.level = 0;
    this.levelGoals = 0;          // punten in dit level (goud, combo en bonus tellen mee)
    this.levelTarget = 0;
    this.levelReached = 0;        // op welk level de laatste reeks strandde
    this.bestLevel = 0;
    this.ownSettings = null;      // de instellingen van de speler, bewaard tijdens een levelreeks
    this.hint = { level: -1, taal: '', auto: false, doel: 0, tijd: 0, tekst: '' };   // levelHint, onthouden
    // Tekst op de muur buiten een ronde.
    this.tips = [];               // wisselen elke 4,5 s onder het startscherm
    this.highscores = [];         // [{ name, score }], al gesorteerd; top 5 in een hoek
    // Effecten: confetti bij een doelpunt, sterretjes achter gouden ballen, COMBO-tekst,
    // feest bij een record of een gehaald level, en een kloppende klok op het eind.
    this.effects = true;
    this.partPool = [];           // vrije deeltjes; this.parts zijn de levende
    for (let i = 0; i < FX_MAX_PARTS; i++) this.partPool.push(fxDeeltje());
    this.partSteal = 0;           // welk levend deeltje als eerste hergebruikt wordt als het vol is
    this.popPool = [];            // vrije zwevende teksten
    this.feestN = 0;              // hoeveel vuurwerkjes er nog komen
    this.feestT = 0;              // seconden tot het volgende
    // Eigen toeval voor de effecten, los van Math.random: zo verandert confetti niets aan
    // het spelverloop, en niets aan de tests die Math.random vastzetten.
    this.fxSeed = 0x2545f491;
    // Spelen zonder beamer (zie js/speelplek.js). onderlaag(ctx, cw, ch) tekent de
    // achtergrond in plaats van de muurverlichting: op een scherm het camerabeeld. papier:
    // de obstakels als gekleurde briefjes tekenen (de demo, zonder camera): ob.kleur, of
    // de kleur van de soort.
    this.onderlaag = null;
    this.papier = false;
  }

  setAspect(ar) {
    if (!isFinite(ar) || ar <= 0) return;
    const w = WORLD_H * ar;
    if (Math.abs(w - this.W) < 0.5) return;
    const sx = w / this.W;
    this.W = w;
    if (!this.goal.auto) this.goal.x *= sx;
    if (!this.source.auto) this.source.x *= sx;
    this.goalHome *= sx;
    this.sourceHome *= sx;
    this.bonus.x *= sx;
    const o = this.ownSettings;
    if (o) { o.gx *= sx; o.goalHome *= sx; o.sx *= sx; o.sourceHome *= sx; }
    for (const b of this.balls) { b.x *= sx; b.trail.length = 0; }
  }

  reset() {
    this.restoreSettings();
    this.balls.length = 0;
    // deeltjes en teksten terug in de voorraad, niet weggooien
    while (this.parts.length) this.partPool.push(this.parts.pop());
    while (this.pops.length) this.popPool.push(this.pops.pop());
    this.feestN = 0;
    this.score.attack = 0; this.score.block = 0; this.misses = 0;
    this.combo = 0; this.comboT = 0;
    this.elapsed = 0;
    this.time = this.endless ? 0 : this.roundLen;
    this.state = 'idle';
    this.banner = null;
    this.spawned = 0;
    this.breakables.clear();       // nieuwe ronde: alle muren weer heel
    this.level = 0; this.levelGoals = 0; this.levelTarget = 0; this.levelReached = 0;
  }

  /** Het hele doel binnen beeld houden: trechter bovenaan, kom onderaan. */
  clampGoal() {
    const r = this.goal.r;
    this.goal.x = Math.max(r, Math.min(this.W - r, this.goal.x));
    this.goal.y = Math.max(r * 0.6, Math.min(this.H - r * 0.7, this.goal.y));
  }

  setGoal(x, y) {
    this.goal.x = x; this.goal.y = y; this.goal.auto = false;
    this.clampGoal();
    this.goalHome = this.goal.x;
  }

  setSource(x, y) {
    this.source.x = Math.max(30, Math.min(this.W - 30, x));
    this.source.y = Math.max(20, Math.min(this.H * 0.7, y));
    this.source.auto = false;
    this.sourceHome = this.source.x;
  }

  start(seconds) {
    // Een levelreeks die nog liep eerst netjes afsluiten, anders zou reset() hieronder
    // de oude rondetijd en bak terugzetten over wat we nu kiezen.
    this.restoreSettings();
    this.roundLen = seconds;
    // De thuispositie komt uit setGoal/setSource. Hier overnemen zou hem laten
    // opschuiven naar waar de slinger aan het eind van de vorige ronde toevallig stond.
    this.sweepT = 0; this.srcPhase = 0; this.goalPhase = 0;
    if (this.sourceSweep && !this.source.auto) this.source.x = this.sourceHome;
    if (this.goalSweep && !this.goal.auto) this.goal.x = this.goalHome;
    this.reset();
    this.time = this.endless ? 0 : seconds;
    if (this.levelMode) this.beginLevels();
    this.placeBonus();
    this.countdown = 3;
    this.elapsed = 0;
    if (this.sfx) this.sfx.tick(false);        // de "3" hoort ook een tik te krijgen
    this.lastTick = -1;
    this.newRecord = false;
    this.state = 'count';
  }

  // ---- uitdaging: levels -----------------------------------------------------
  // Een levelreeks zet tijdelijk strengere instellingen. Wat de speler zelf had
  // ingesteld bewaren we, en bij game over of reset() komt dat terug.

  beginLevels() {
    const g = this.goal, s = this.source;
    this.ownSettings = {
      goalSweep: this.goalSweep, sourceSweep: this.sourceSweep, wind: this.wind, rate: this.rate,
      gx: g.x, gy: g.y, goalHome: this.goalHome, sx: s.x, sy: s.y, sourceHome: this.sourceHome,
    };
    this.level = 1;
    this.levelReached = 0;
    this.applyLevel();
    this.time = this.levelTime;
  }

  restoreSettings() {
    const o = this.ownSettings;
    if (!o) return;
    this.ownSettings = null;
    this.goalSweep = o.goalSweep; this.sourceSweep = o.sourceSweep;
    this.wind = o.wind; this.rate = o.rate;
    // Een bak of bron die de camera volgt laten we waar hij is.
    if (!this.goal.auto) { this.goal.x = o.gx; this.goal.y = o.gy; this.goalHome = o.goalHome; }
    if (!this.source.auto) { this.source.x = o.sx; this.source.y = o.sy; this.sourceHome = o.sourceHome; }
  }

  /** Instellingen voor this.level; alles wat een eerder level erbij deed blijft. */
  applyLevel() {
    const n = this.level, o = this.ownSettings;
    this.levelTarget = 3 + 2 * n;
    this.levelGoals = 0;
    this.goalSweep = n >= 3 ? Math.max(o.goalSweep, 0.4) : o.goalSweep;
    this.wind = n >= 4 ? Math.max(o.wind, 250) : o.wind;
    this.sourceSweep = n >= 5 ? Math.max(o.sourceSweep, 0.5) : o.sourceSweep;
    this.rate = n >= 5 ? o.rate * Math.pow(1.1, n - 4) : o.rate;
    // Elk level vanaf 2 een andere plek voor de bak, niet recht onder de bron. Nooit op
    // een briefje: licht erop verstopt het voor de camera, en main.js neemt een voorwerp
    // dat precies op het doel ligt aan als de echte bak. Geen vrije plek: bak blijft staan.
    if (n >= 2 && !this.goal.auto) {
      const g = this.goal;
      const boxes = this.obstacles.map(ob => polyBox(ob.poly));
      const vrij = ([fx, fy]) => boxes.every(b => boxDist(b, fx * this.W, fy * this.H) > g.r + 10);
      const ok = LEVEL_SPOTS.filter(([fx, fy]) => vrij([fx, fy]) &&
        Math.hypot(fx * this.W - g.x, fy * this.H - g.y) > 250 &&
        (this.sourceSweep || Math.abs(fx * this.W - this.source.x) > g.r + 60));
      const list = ok.length ? ok : LEVEL_SPOTS.filter(vrij);
      if (list.length) {
        const [fx, fy] = list[Math.floor(Math.random() * list.length) % list.length];
        this.setGoal(fx * this.W, fy * this.H);
      }
    }
    // Slingers beginnen in het midden, anders springen bron en bak bij GO.
    this.sweepT = 0; this.srcPhase = 0; this.goalPhase = 0;
    if (this.sourceSweep && !this.source.auto) this.source.x = this.sourceHome;
    if (this.goalSweep && !this.goal.auto) this.goal.x = this.goalHome;
  }

  /** Doel gehaald: banner, drie tellen aftellen, en door naar het volgende level. */
  nextLevel() {
    this.toonBanner(t('LEVEL {n} GEHAALD', { n: this.level }), 3.1);
    this.level++;
    this.applyLevel();
    this.placeBonus();
    this.elapsed = 0;
    this.time = this.levelTime;
    this.lastTick = -1;
    this.countdown = 3;
    this.state = 'count';
    this.flash = 0.75; this.flashCol = '#ffd479';
    this.feest(3);
    // Het fanfaretje is korter dan een tel: daarna tikt het aftellen gewoon door.
    if (this.sfx) {
      if (this.sfx.levelGehaald) this.sfx.levelGehaald();
      else this.sfx.tick(false);
    }
  }

  /** Tijd op: de reeks strandt op dit level. */
  levelOver() {
    const n = this.level;
    this.time = 0;
    this.state = 'over';
    this.levelReached = n;
    // Level 1 niet halen is geen record, ook niet de allereerste keer.
    this.newRecord = n > 1 && n > this.bestLevel;
    this.bestLevel = Math.max(this.bestLevel, n);
    this.toonBanner(t('LEVEL {n} — GAME OVER', { n }), 9999);
    this.restoreSettings();
    if (this.newRecord) this.feest(6);
    if (this.sfx) {
      const s = this.sfx;
      if (this.newRecord && s.record) s.record();
      else if (s.gameOver) s.gameOver();
      else s.end();
    }
  }

  /** Wat er in dit level nieuw is, en het doel. Tijdens het aftellen elk beeldje: dus onthouden. */
  levelHint() {
    const n = this.level, h = this.hint, auto = this.goal.auto;
    if (h.level === n && h.taal === huidigeTaal() && h.auto === auto && h.doel === this.levelTarget && h.tijd === this.levelTime) return h.tekst;
    const w = { level: n, n: this.levelTarget, s: this.levelTime };
    h.tekst = n <= 1 ? t('LEVEL 1: {n} punten in {s} s', w)
      : n >= 5 ? t('LEVEL {level}: de bron beweegt en er komen meer ballen — {n} punten in {s} s', w)
      : n === 4 ? t('LEVEL {level}: er staat wind — {n} punten in {s} s', w)
      : auto ? t('LEVEL {level}: meer punten — {n} punten in {s} s', w)
      : n === 3 ? t('LEVEL {level}: de bak beweegt — {n} punten in {s} s', w)
      : t('LEVEL {level}: de bak verhuist — {n} punten in {s} s', w);
    h.level = n; h.taal = huidigeTaal(); h.auto = auto; h.doel = this.levelTarget; h.tijd = this.levelTime;
    return h.tekst;
  }

  /**
   * De grote tekst in het midden (LEVEL 2 GEHAALD, GO, de eindstand). Onthoudt uit welke
   * zin hij kwam, zodat hij na het wisselen van taal meteen meevertaalt (zie drawHud).
   */
  toonBanner(text, tijd) {
    const h = tHerkomst(text);
    this.banner = { text, t: tijd, nl: h ? h.nl : '', vars: h ? h.vars : null, taal: huidigeTaal() };
  }

  // ---- bonusbak ---------------------------------------------------------------

  /** Telt de bonusbak nu mee (vangt en scoort ballen)? */
  bonusLive() {
    return this.bonusOn && (this.state === 'play' || this.state === 'count');
  }

  /**
   * Hoeveel ruimte heeft de bonusbak op (x, y)? Negatief = te dicht bij de bak, de bron
   * of de plek waar de ballen recht naar beneden vallen. Een slingerende bak of bron
   * telt over zijn hele baan.
   */
  bonusRoom(x, y) {
    const bn = this.bonus, g = this.goal, s = this.source;
    const along = (x0, x1, cy) => Math.hypot(x - Math.max(x0, Math.min(x1, x)), y - cy);
    let dg;
    if (this.goalSweep && !g.auto) {
      const amp = this.W * 0.22;
      dg = along(Math.max(g.r, this.goalHome - amp), Math.min(this.W - g.r, this.goalHome + amp), g.y);
    } else dg = Math.hypot(x - g.x, y - g.y);
    let ds, under = Infinity;
    if (this.sourceSweep && !s.auto) {
      const amp = this.W * 0.30;
      ds = along(Math.max(50, this.sourceHome - amp), Math.min(this.W - 50, this.sourceHome + amp), s.y);
    } else {
      ds = Math.hypot(x - s.x, y - s.y);
      // recht onder de bron zou elke bal er vanzelf in vallen
      if (s.y < y) under = Math.abs(x - s.x) - (bn.r + 130);
    }
    return Math.min(dg - (g.r + bn.r + 40), ds - (bn.r + 80), under);
  }

  /** Nieuwe plek voor de bonusbak: middenband, binnen de marges, vrij van bak, bron en briefjes. */
  placeBonus() {
    const bn = this.bonus, m = bn.r + 80;
    const boxes = this.obstacles.map(ob => polyBox(ob.poly));
    let bx = bn.x, by = bn.y, best = -Infinity;
    for (let i = 0; i < 40; i++) {
      const x = m + Math.random() * Math.max(1, this.W - 2 * m);
      const y = this.H * (0.35 + Math.random() * 0.25);
      let room = this.bonusRoom(x, y);
      // Licht op een voorwerp maakt het onzichtbaar voor de camera: niet op een briefje.
      // (r + 30 dekt ook het +3 erboven, zie bonusCovered.)
      for (const b of boxes) room = Math.min(room, boxDist(b, x, y) - (bn.r + 30));
      // en niet op dezelfde plek blijven staan
      if (i < 30) room = Math.min(room, Math.hypot(x - bn.x, y - bn.y) - 150);
      if (room > best) { best = room; bx = x; by = y; }
      if (room > 0) break;
    }
    bn.x = bx; bn.y = by;
    this.bonusClock = BONUS_MOVE;
    this.bonusFade = 0;
    // Geen enkele vrije plek (bak en bron staan overal in de weg): niet elke frame
    // opnieuw laten springen.
    this.bonusWait = best > 0 ? 0 : 1;
  }

  /**
   * Hangt er een briefje in de bonusbak of in zijn '+3'? Dan valt zijn licht erop en
   * raakt de camera het kwijt. Iets dat nog vastgezet wordt telt niet mee: een vlek die
   * even opduikt mag de bak niet laten springen. Iets krapper dan placeBonus (r + 30),
   * zodat een net gekozen plek nooit meteen weer bezet heet.
   */
  bonusCovered() {
    const bn = this.bonus;
    for (const ob of this.obstacles) {
      if (!ob.pending && boxDist(polyBox(ob.poly), bn.x, bn.y) < bn.r + 26) return true;
    }
    return false;
  }

  /** Klok van de bonusbak; verhuist ook als de bak, de bron of een briefje er ineens bovenop staat. */
  tickBonus(dt) {
    this.bonusClock -= dt;
    if (this.bonusWait > 0) this.bonusWait -= dt;
    if (this.bonusClock <= 0 || (this.bonusWait <= 0 &&
      (this.bonusRoom(this.bonus.x, this.bonus.y) < 0 || this.bonusCovered()))) this.placeBonus();
  }

  togglePause() {
    if (this.state === 'play') this.state = 'paused';
    else if (this.state === 'paused') this.state = 'play';
  }

  setObstacles(list) {
    // Eén obstakel met een NaN-hoekpunt zou elke bal op het scherm vangen.
    this.obstacles = list.filter(ob => ob.poly && ob.poly.length >= 3 &&
      ob.poly.every(q => Number.isFinite(q[0]) && Number.isFinite(q[1])));
  }

  // FIX 2: kinematic follow (Box2D b2Body_SetTargetTransform / Rapier
  // setNextKinematicTranslation idea). Each camera update is a TARGET; the collision
  // shape travels there over one camera interval, and the velocity balls feel is the
  // velocity the shape really moves at. Noisy ob.vx/ob.vy from the tracker are ignored
  // for tracked obstacles (those that carry an id).
  prepKinematic() {
    const out = [], seen = new Set();
    for (const ob of this.obstacles) {
      const kind = this.kindOf(ob), brk = kind === 'breek' ? this.breakState(ob) : null;
      if (ob.id == null) { out.push({ team: ob.team, pending: ob.pending, kind, brk, base: ob.poly, poly: ob.poly, vx: ob.vx || 0, vy: ob.vy || 0, st: null }); continue; }
      seen.add(ob.id);
      const c = centroidOf(ob.poly);
      let st = this.kin.get(ob.id);
      if (!st) { st = { tx: c[0], ty: c[1], ox: 0, oy: 0, vx: 0, vy: 0, tChange: this.t }; this.kin.set(ob.id, st); }
      else if (c[0] !== st.tx || c[1] !== st.ty) {
        st.ox += st.tx - c[0]; st.oy += st.ty - c[1];
        st.tx = c[0]; st.ty = c[1];
        const off = Math.hypot(st.ox, st.oy);
        if (off > SNAP_DIST) { st.ox = st.oy = st.vx = st.vy = 0; }
        else {
          const T = Math.min(0.1, Math.max(1 / 60, this.t - st.tChange));
          const sp = Math.min(MAX_OB_SPEED, off / T);
          st.vx = off > 1e-9 ? -st.ox / off * sp : 0;
          st.vy = off > 1e-9 ? -st.oy / off * sp : 0;
        }
        st.tChange = this.t;
      }
      out.push({ team: ob.team, pending: ob.pending, kind, brk, base: ob.poly, poly: ob.poly, vx: st.vx, vy: st.vy, st });
    }
    for (const id of this.kin.keys()) if (!seen.has(id)) this.kin.delete(id);
    return out;
  }

  /** 'trampoline' | 'booster' | 'breek', of null voor een gewoon obstakel. */
  kindOf(ob) {
    if (!this.special) return null;
    const k = ob.kind;
    return k === 'trampoline' || k === 'booster' || k === 'breek' ? k : null;
  }

  /** Staat van een breekbare muur. Zonder id (testbriefjes) is het obstakel zelf de sleutel. */
  breakState(ob, make = true) {
    const key = ob.id != null ? ob.id : ob;
    let st = this.breakables.get(key);
    if (!st && make) { st = { hits: 0, left: 0, seen: this.t }; this.breakables.set(key, st); }
    if (st && make) st.seen = this.t;
    return st || null;
  }

  /** Kapotte muren weer heel maken, en vergeten wat al een tijd niet meer hing. */
  tickBreakables(dt) {
    for (const [key, st] of this.breakables) {
      if (st.left > 0) {
        st.left -= dt;
        if (st.left <= 0) { st.left = 0; st.hits = 0; }
      }
      if (this.t - st.seen > BREAK_FORGET) this.breakables.delete(key);
    }
  }

  stepKinematic(list, h) {
    for (const k of list) {
      const st = k.st;
      if (!st) continue;
      const off = Math.hypot(st.ox, st.oy);
      let dx = st.vx * h, dy = st.vy * h;
      if (Math.hypot(dx, dy) >= off) { dx = -st.ox; dy = -st.oy; st.vx = st.vy = 0; }   // arrived
      st.ox += dx; st.oy += dy;
      k.vx = dx / h; k.vy = dy / h;
      k.poly = (st.ox === 0 && st.oy === 0) ? k.base : k.base.map(p => [p[0] + st.ox, p[1] + st.oy]);
    }
  }

  spawn() {
    if (this.balls.length > 70) return;
    this.spawned++;
    const every = Math.round(this.goldEvery || 0);
    this.balls.push({
      id: this.nextBall++,
      x: this.source.x + (Math.random() - 0.5) * 26,
      y: this.source.y + 14,
      vx: (Math.random() - 0.5) * 90,
      vy: 40,
      r: 11,
      trail: [],
      hits: 0,
      blockHits: 0,
      still: 0,
      fade: null,
      life: 0,
      gold: every > 0 && this.spawned % every === 0,
      boostAt: -1,               // b.life bij de laatste turbo-zet
      nx: 0, ny: 0,              // normaal van het laatste contact (zie collide)
      jamT: null, jamX: 0, jamY: 0, // sinds wanneer en waar een speciaal briefje hem wegschiet
      spark: 0,                  // seconden tot het volgende sterretje (gouden bal)
    });
  }

  // Met (nx, ny) alleen die kant op, een halve cirkel: dan vliegen de vonken van een
  // speciaal briefje eraf en niet eroverheen. Zonder: alle kanten op.
  burst(x, y, col, n, spread, nx = 0, ny = 0) {
    const half = nx !== 0 || ny !== 0, a0 = half ? Math.atan2(ny, nx) : 0;
    for (let i = 0; i < n; i++) {
      const a = half ? a0 + (Math.random() - 0.5) * Math.PI : Math.random() * Math.PI * 2;
      const s = spread * (0.35 + Math.random() * 0.9);
      const p = this.part();
      p.x = x; p.y = y; p.vx = Math.cos(a) * s; p.vy = Math.sin(a) * s - spread * 0.25;
      p.life = 0.45 + Math.random() * 0.5; p.max = 0.95; p.col = col; p.r = 2 + Math.random() * 3.5;
      p.kind = 0; p.rot = 0; p.vr = 0; p.drag = 0; p.grav = 0.45;
    }
  }

  // ---- effecten ---------------------------------------------------------------

  /** Toevalsgetal 0..1 voor de effecten (xorshift, los van Math.random). */
  fx() {
    let s = this.fxSeed | 0;
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
    this.fxSeed = s;
    return (s >>> 0) / 4294967296;
  }

  /**
   * Een deeltje uit de voorraad; de aanroeper zet alle velden. Is de voorraad op, dan
   * wordt steeds een ander levend deeltje hergebruikt: nooit meer dan FX_MAX_PARTS.
   */
  part() {
    let p = this.partPool.pop();
    if (!p) {
      if (this.parts.length >= FX_MAX_PARTS) {
        this.partSteal = (this.partSteal + 1) % this.parts.length;
        return this.parts[this.partSteal];
      }
      p = fxDeeltje();
    }
    this.parts.push(p);
    return p;
  }

  /** Zwevende tekst (+1, BLOK, KRAK, COMBO ×3). Ook uit een voorraad, met een grens. */
  pop(x, y, text, col, font = FX_POP_FONT, rise = POP_RISE, life = 1.1, grow = false) {
    let p = this.pops.length >= FX_MAX_POPS ? this.pops.shift() : this.popPool.pop();
    if (!p) p = { x: 0, y: 0, t: 0, text: '', col: '', font: '', rise: 0, life: 0, grow: false, nl: '', vars: null, taal: '' };
    p.x = x; p.y = y; p.t = 0; p.text = text; p.col = col;
    p.font = font; p.rise = rise; p.life = life; p.grow = grow;
    // uit welke zin (KRAK, COMBO ×3), zodat hij bij een andere taal meevertaalt (drawParts)
    const h = tHerkomst(text);
    p.nl = h ? h.nl : ''; p.vars = h ? h.vars : null; p.taal = huidigeTaal();
    this.pops.push(p);
    return p;
  }

  /** Confetti: papiertjes in de kleuren `cols`, schuin omhoog uit (x, y). */
  confetti(x, y, n, cols, spread) {
    for (let i = 0; i < n; i++) {
      const p = this.part();
      const a = -Math.PI / 2 + (this.fx() - 0.5) * 2.2, s = spread * (0.45 + this.fx() * 0.75);
      p.x = x; p.y = y; p.vx = Math.cos(a) * s; p.vy = Math.sin(a) * s;
      p.life = 0.8 + this.fx() * 0.6; p.max = 1.4; p.col = cols[i % cols.length]; p.r = 5 + this.fx() * 4;
      p.kind = 1; p.rot = this.fx() * 6.283; p.vr = (this.fx() - 0.5) * 18; p.drag = 2.4; p.grav = 0.3;
    }
  }

  /** Feest: n vuurwerkjes confetti na elkaar, elk op een vrije plek (zie knal). */
  feest(n) {
    if (!this.effects) return;
    this.feestN = n;
    this.feestT = 0;
  }

  /**
   * Eén vuurwerkje in de bovenste helft, boven de banner. Nooit bovenop een briefje:
   * licht op een voorwerp maakt het onzichtbaar voor de camera. Nergens plek? Dan niet.
   */
  knal() {
    if (!this.effects) return;                 // vinkje Effecten net uitgezet: rest van het feest ook niet
    const boxes = this.obstacles.map(ob => polyBox(ob.poly));
    let bx = 0, by = 0, best = -1;
    for (let i = 0; i < 10; i++) {
      const x = this.W * (0.15 + this.fx() * 0.7), y = this.H * (0.16 + this.fx() * 0.18);
      let room = 400;
      for (const b of boxes) room = Math.min(room, boxDist(b, x, y));
      if (room > best) { best = room; bx = x; by = y; }
      if (room >= 260) break;
    }
    if (best < 110) return;
    // In voorwerpmodus minder en zachter (zie drawParts), zodat de camera rustig blijft.
    const n = this.lowLight ? 22 : 40, cols = this.fx() < 0.5 ? FX_CONFETTI : FX_GOUD;
    for (let i = 0; i < n; i++) {
      const p = this.part(), a = this.fx() * 6.283, s = 180 + this.fx() * 300;
      p.x = bx; p.y = by; p.vx = Math.cos(a) * s; p.vy = Math.sin(a) * s - 60;
      p.life = 0.9 + this.fx() * 0.7; p.max = 1.6; p.col = cols[i % cols.length];
      if (i % 3 === 0) { p.kind = 2; p.r = 6 + this.fx() * 4; p.vr = 12; }
      else { p.kind = 1; p.r = 5 + this.fx() * 4; p.vr = (this.fx() - 0.5) * 18; }
      p.rot = this.fx() * 6.283; p.drag = 2.2; p.grav = 0.3;
    }
  }

  /** Sterretjes achter een gouden bal. De laagste voorrang: niet als het al druk is. */
  sparkle(b, dt) {
    b.spark -= dt;
    if (b.spark > 0) return;
    b.spark = this.lowLight ? 0.09 : 0.04;
    if (this.parts.length > FX_MAX_PARTS * 0.8) return;
    const p = this.part();
    p.x = b.x + (this.fx() - 0.5) * b.r; p.y = b.y + (this.fx() - 0.5) * b.r;
    p.vx = (this.fx() - 0.5) * 70 - b.vx * 0.06; p.vy = (this.fx() - 0.5) * 70 - b.vy * 0.06;
    p.life = 0.3 + this.fx() * 0.25; p.max = 0.55; p.col = this.fx() < 0.5 ? '#fff3c4' : '#ffd479';
    p.r = 4 + this.fx() * 3; p.kind = 2; p.rot = this.fx() * 6.283; p.vr = 14; p.drag = 3; p.grav = 0.05;
  }

  /**
   * COMBO ×n boven de bak, of anders onder de score bovenaan; nooit op een briefje.
   * Past het nergens, dan staat de combo toch al in de HUD.
   */
  comboPop(bin) {
    const text = t('COMBO ×{n}', { n: this.combo }), w = text.length * 56 * 0.74 + 8, h = 56 + 40 + 4;
    const boxes = this.obstacles.map(ob => polyBox(ob.poly));
    const spots = [[bin.x, bin.y - bin.r - 150], [this.W / 2, 250]];
    for (const [cx, cy] of spots) {
      const x = Math.max(w / 2, Math.min(this.W - w / 2, cx));
      const r = [x - w / 2, cy - 40, x + w / 2, cy + 56];
      if (r[1] < 0 || boxes.some(b => boxHit(r, b, 14))) continue;
      this.pop(x, cy, text, '#ff8a1e', FX_COMBO_FONT, 40, 1.3, true);
      return;
    }
  }

  update(dt) {
    this.t += dt;
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 3.2);
    if (this.banner) { this.banner.t -= dt; if (this.banner.t <= 0) this.banner = null; }
    if (this.comboT > 0) {
      this.comboT -= dt;
      if (this.comboT <= 0) this.combo = 0;
    }

    // Verlopen teksten en deeltjes terug naar de voorraad. Aanschuiven in plaats van
    // splice: dat maakt bij elke aanroep een nieuwe lijst, en dit gebeurt elk beeldje.
    // (Een tekst of deeltje dat ergens nog op de oude manier met push() wordt
    // toegevoegd, zonder life, rise of grav, werkt ook: dan gelden de oude waarden.)
    let n = 0;
    for (let i = 0; i < this.pops.length; i++) {
      const p = this.pops[i];
      p.t += dt;
      if (p.t > (p.life || 1.1)) this.popPool.push(p); else this.pops[n++] = p;
    }
    this.pops.length = n;
    n = 0;
    for (let i = 0; i < this.parts.length; i++) {
      const p = this.parts[i];
      p.life -= dt;
      if (p.life <= 0) { this.partPool.push(p); continue; }
      p.vy += this.gravity * (p.grav === undefined ? 0.45 : p.grav) * dt;
      // confetti en sterretjes remmen af in de lucht en dwarrelen dan omlaag
      if (p.drag) { const k = Math.max(0, 1 - p.drag * dt); p.vx *= k; p.vy *= k; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.rot += p.vr * dt;
      this.parts[n++] = p;
    }
    this.parts.length = n;
    if (this.feestN > 0 && (this.feestT -= dt) <= 0) {
      this.feestN--;
      this.feestT = 0.3;
      this.knal();
    }

    if (this.bonusFade < 1) this.bonusFade = Math.min(1, this.bonusFade + dt * 2.5);

    // Aftellen, zodat wie bij de muur staat weet wanneer het begint.
    if (this.state === 'count') {
      const was = Math.ceil(this.countdown);
      this.countdown -= dt;
      const now = Math.ceil(this.countdown);
      if (now !== was && now > 0 && this.sfx) this.sfx.tick(false);
      if (this.countdown <= 0) {
        this.state = 'play';
        this.toonBanner(t('GO'), 0.9);
        if (this.sfx) this.sfx.start();
      }
      // Tussen twee levels vliegen er nog ballen: die vallen gewoon uit, zonder te
      // scoren. Stilhangen in de lucht zou eruitzien als een vastloper.
      else if (this.balls.length) this.stepBalls(dt, false);
      return;
    }

    // Na afloop vallen de ballen die nog onderweg zijn gewoon uit, zonder te scoren.
    // Stilstaan midden in de lucht achter de eindstand zag eruit als een vastloper.
    const playing = this.state === 'play';
    if (!playing && this.state !== 'over') return;

    if (playing) this.tickRound(dt);
    if (playing && this.state === 'play') {
      this.windNow = this.wind ? Math.sin(this.sweepT * 0.42) * this.wind : 0;
      this.spawnAcc += dt * this.rate;
      while (this.spawnAcc >= 1) { this.spawnAcc -= 1; this.spawn(); }
    }
    this.stepBalls(dt, this.state === 'play');
    if (this.ownSettings && this.state === 'play' && this.levelGoals >= this.levelTarget) this.nextLevel();
  }

  /** Klok, slingerende bron en bak, en het einde van de ronde. */
  tickRound(dt) {
    // Bewegende bron en bak: geen enkele ronde is hetzelfde, en je kunt niet
    // één keer goed mikken en daarna achteroverleunen.
    this.sweepT += dt;
    if (this.sourceSweep && !this.source.auto) {
      this.srcPhase += dt * this.sourceSweep;
      const amp = this.W * 0.30;
      this.source.x = this.sourceHome + Math.sin(this.srcPhase) * amp;
      this.source.x = Math.max(50, Math.min(this.W - 50, this.source.x));
    }
    if (this.goalSweep && !this.goal.auto) {
      this.goalPhase += dt * this.goalSweep * 0.8;
      const amp = this.W * 0.22;
      this.goal.x = this.goalHome + Math.sin(this.goalPhase) * amp;
      this.goal.x = Math.max(this.goal.r, Math.min(this.W - this.goal.r, this.goal.x));
    }

    if (this.bonusOn) this.tickBonus(dt);

    this.elapsed += dt;
    // Een level heeft altijd zijn eigen klok, ook als "eindeloos" aan staat.
    const endless = this.endless && !this.ownSettings;
    const len = this.ownSettings ? this.levelTime : this.roundLen;
    // Uit de gespeelde tijd afgeleid, zodat je "eindeloos" halverwege kunt omzetten
    // zonder dat de verstreken tijd ineens als resterende tijd telt.
    this.time = endless ? this.elapsed : Math.max(0, len - this.elapsed);
    if (!endless) {
      const sec = Math.ceil(this.time);
      if (sec !== this.lastTick && sec <= 10 && sec > 0) {
        this.lastTick = sec;
        if (this.sfx) this.sfx.tick(true);
      }
    }
    if (!endless && this.elapsed >= len && this.ownSettings) { this.levelOver(); return; }
    if (!endless && this.elapsed >= len) {
      this.time = 0;
      this.state = 'over';
      const a = this.score.attack, b = this.score.block;
      this.newRecord = !this.duel && a > this.best;
      if (this.newRecord) this.best = a;
      this.toonBanner(this.duel
        ? (a === b ? t('GELIJKSPEL') : (a > b ? t('AANVALLER WINT') : t('VERDEDIGER WINT')))
        : tAantal(a, '{n} DOELPUNT', '{n} DOELPUNTEN'), 9999);
      if (this.newRecord) this.feest(6);
      if (this.sfx) {
        if (this.newRecord && this.sfx.record) this.sfx.record();
        else this.sfx.end();
      }
    }
  }

  /**
   * Loopt de klok in zijn laatste tien seconden? Dan tikt hij (tickRound), wordt hij op
   * de muur bij elke tik even groter (drawHud) en gaat de muziek sneller (main.js →
   * muziek.js).
   */
  laatsteTien() {
    const endless = this.endless && !this.ownSettings;      // een level telt altijd af
    return this.state === 'play' && !endless && this.time <= 10;
  }

  stepBalls(dt, scoring) {
    // FIX 5: substeps sized so nothing travels more than half a ball radius per substep.
    let vmax = 0;
    for (const b of this.balls) vmax = Math.max(vmax, Math.hypot(b.vx, b.vy));
    const kin = this.prepKinematic();
    let obMax = 0;
    for (const k of kin) obMax = Math.max(obMax, Math.hypot(k.vx, k.vy));
    const steps = Math.min(16, Math.max(1, Math.ceil(dt / 0.005), Math.ceil((vmax + obMax) * dt / 5.5)));
    const h = dt / steps;
    const rim = this.rimWalls();
    const bonus = this.bonusLive() ? this.bonus : null;
    const brim = bonus ? this.rimWalls(bonus) : null;
    // Voorbij deze afstand kan een bal de trechter van de bonusbak niet raken.
    const bReach = bonus ? (bonus.r * 1.25 + 30) ** 2 : 0;
    if (this.breakables.size) this.tickBreakables(dt);

    for (let s = 0; s < steps; s++) {
      this.stepKinematic(kin, h);
      for (let i = this.balls.length - 1; i >= 0; i--) {
        const b = this.balls[i];
        b.life += h;
        b.vy += this.gravity * h;
        if (this.wind) b.vx += this.windNow * h;
        b.vx *= 1 - 0.25 * h;
        b.x += b.vx * h;
        b.y += b.vy * h;

        if (b.x < b.r) { b.x = b.r; b.vx = Math.abs(b.vx) * this.rest; }
        if (b.x > this.W - b.r) { b.x = this.W - b.r; b.vx = -Math.abs(b.vx) * this.rest; }
        if (b.y < b.r) { b.y = b.r; b.vy = Math.abs(b.vy) * this.rest; }

        for (const ob of kin) {
          if (ob.pending) continue;               // nog aan het vastzetten
          if (ob.brk && ob.brk.left > 0) continue; // kapotte muur: even weg
          const imp = ob.kind === 'trampoline'
            ? collide(b, ob, TRAMPOLINE_REST, this.friction, h, 0)
            : collide(b, ob, this.rest, this.friction, h);
          if (imp < 0) continue;
          // Alleen een briefje van de verdediger levert hem een blok op.
          if (ob.team === 'block') b.blockHits++;
          if (ob.kind) { this.touchSpecial(b, ob, imp); continue; }
          if (imp > 40) {
            b.hits++;
            this.burst(b.x, b.y, ob.team === 'block' ? '#6ec1ff' : '#ffb765', 3, Math.min(320, imp * 0.55));
            if (this.sfx) this.sfx.bounce(imp, ob.team);
          }
        }
        for (const ob of rim) collide(b, ob, 0.4, 0.3, h);
        if (bonus) {
          const ex = b.x - bonus.x, ey = b.y - bonus.y;
          if (ex * ex + ey * ey < bReach) for (const ob of brim) collide(b, ob, 0.4, 0.3, h);
        }
        const sp = Math.hypot(b.vx, b.vy);
        if (sp > MAX_BALL_SPEED) { b.vx *= MAX_BALL_SPEED / sp; b.vy *= MAX_BALL_SPEED / sp; }

        const dx = b.x - this.goal.x, dy = b.y - this.goal.y;
        if (dx * dx + dy * dy < (this.goal.r * 0.68) ** 2 && b.vy > -20) {
          if (scoring) this.scored(b);
          this.balls.splice(i, 1);
          continue;
        }
        if (bonus) {
          const ex = b.x - bonus.x, ey = b.y - bonus.y;
          if (ex * ex + ey * ey < (bonus.r * 0.68) ** 2 && b.vy > -20) {
            if (scoring) this.scored(b, bonus);
            this.balls.splice(i, 1);
            continue;
          }
        }
        if (b.y > this.H + 60) {
          if (scoring) this.missed(b);
          this.balls.splice(i, 1);
          continue;
        }

        // Vastgelopen: een bal die ligt te wachten op een plank of in een hoek. Die
        // zouden zich opstapelen tot de limiet, en dan vallen er geen ballen meer.
        if (Math.hypot(b.vx, b.vy) < 35) b.still += h; else b.still = 0;
        if (b.fade == null && (b.still > STUCK_AFTER || b.life > 40)) b.fade = 0.35;
        if (b.fade != null) {
          b.fade -= h;
          if (b.fade <= 0) {
            if (scoring) this.missed(b, true);
            this.balls.splice(i, 1);
          }
        }
      }
    }

    for (const b of this.balls) {
      b.trail.push(b.x, b.y);
      if (b.trail.length > 14) b.trail.splice(0, 2);
      if (b.gold && this.effects) this.sparkle(b, dt);
      // Klem: weggeschoten, maar niet van zijn plek gekomen (zie JAM_DIST).
      if (b.jamT != null) {
        if (Math.abs(b.x - b.jamX) + Math.abs(b.y - b.jamY) > JAM_DIST) b.jamT = null;
        else if (b.fade == null && b.life - b.jamT > JAM_AFTER) b.fade = 0.35;
      }
    }
  }

  /** Een speciaal briefje schoot de bal weg: begin hier te kijken of hij klem zit. */
  kicked(b) {
    if (b.jamT == null) { b.jamT = b.life; b.jamX = b.x; b.jamY = b.y; }
  }

  /**
   * Wat een speciaal briefje met een bal doet die het raakt. De normaal staat op de bal
   * (collide); imp is wat collide teruggaf (0 = contact zonder stuiter).
   */
  touchSpecial(b, ob, imp) {
    if (ob.kind === 'trampoline') {
      // Weg langs de normaal, minstens TRAMPOLINE_SPEED, hoe traag de bal ook aankwam.
      const vn = b.vx * b.nx + b.vy * b.ny;
      if (vn < TRAMPOLINE_SPEED) {
        b.vx += b.nx * (TRAMPOLINE_SPEED - vn);
        b.vy += b.ny * (TRAMPOLINE_SPEED - vn);
      } else if (imp > 0 && vn > TRAMPOLINE_MAX) {
        b.vx -= b.nx * (vn - TRAMPOLINE_MAX);
        b.vy -= b.ny * (vn - TRAMPOLINE_MAX);
      }
      if (imp > 0 || vn < TRAMPOLINE_SPEED) {
        b.hits++;
        this.kicked(b);
        this.burst(b.x, b.y, KIND_STYLE.trampoline.col, 8, 360, b.nx, b.ny);
        if (this.sfx) {
          if (this.sfx.boing) this.sfx.boing();          // heeft zijn eigen rem, zie audio.js
          else this.sfx.bounce(Math.max(900, imp), ob.team);
        }
      }
      return;
    }
    if (imp > 40) {
      b.hits++;
      this.burst(b.x, b.y, KIND_STYLE[ob.kind].col, 3, Math.min(320, imp * 0.55), b.nx, b.ny);
      if (this.sfx) this.sfx.bounce(imp, ob.team);
    }
    if (ob.kind === 'booster') {
      if (b.boostAt != null && b.life - b.boostAt < BOOST_COOLDOWN) return;
      b.boostAt = b.life;
      // Langs het oppervlak, in de richting waarin de bal al rolde. Valt hij er
      // recht op, dan de kant van de bak op.
      const tx = -b.ny, ty = b.nx;
      const vt = b.vx * tx + b.vy * ty;
      const dir = vt > 5 ? 1 : vt < -5 ? -1
        : ((this.goal.x - b.x) * tx + (this.goal.y - b.y) * ty >= 0 ? 1 : -1);
      b.vx += tx * dir * BOOST_KICK;
      b.vy += ty * dir * BOOST_KICK;
      this.kicked(b);
      this.burst(b.x, b.y, KIND_STYLE.booster.col, 7, 280, b.nx, b.ny);
      if (this.sfx && this.sfx.whoosh) this.sfx.whoosh();
      return;
    }
    // breekbare muur: tel de echte klappen
    const st = ob.brk;
    if (st && imp > 40 && ++st.hits >= BREAK_HITS) {
      st.hits = BREAK_HITS;
      st.left = BREAK_TIME;
      this.shatter(ob.poly);
    }
  }

  /**
   * Een breekbare muur gaat kapot. De scherven vliegen omhoog en KRAK staat naast het
   * briefje, niet erop en ook niet op een briefje erboven (zie labelSpot).
   */
  shatter(poly) {
    const own = polyBox(poly), [x0, y0, x1] = own;
    const col = KIND_STYLE.breek.col;
    for (let k = 0; k <= 4; k++) this.burst(x0 + (x1 - x0) * k / 4, y0 - 8, col, 8, 380, 0, -1);
    // Een tekst stijgt nog POP_RISE op terwijl hij vervaagt: dat hele stuk moet vrij zijn.
    // Een 700-letter is ongeveer 0,74 keer zo breed als hoog. Nergens plek: alleen scherven.
    const text = t('KRAK'), h = POP_PX + POP_RISE + 2;
    const boxes = this.obstacles.map(o => polyBox(o.poly));
    boxes.push(own);
    const spot = this.labelSpot(boxes, boxes.length - 1, text.length * POP_PX * 0.74 + 8, h);
    if (spot) this.pop(spot[0], spot[1] - h / 2 + POP_RISE, text, col);
    if (this.sfx) {
      if (this.sfx.krak) this.sfx.krak();
      else this.sfx.bounce(900, 'block');
    }
  }

  // De trechterwanden, precies waar ze getekend worden: van de bovenrand schuin naar
  // binnen tot de kom. Wat je ziet is wat de bal raakt — voorheen stonden de wanden
  // ergens anders dan de lijnen, en telde een bal die zichtbaar in de bak viel als mis.
  // Werkt voor elke bak: de gewone (standaard) en de bonusbak.
  rimWalls(g = this.goal) {
    const r = g.r, th = 7;
    const wall = (x0, y0, x1, y1) => {
      const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1;
      const nx = (-dy / L) * th, ny = (dx / L) * th;
      return normalizePoly([[x0 + nx, y0 + ny], [x1 + nx, y1 + ny], [x1 - nx, y1 - ny], [x0 - nx, y0 - ny]]);
    };
    const top = g.y - r * 0.55, bot = g.y + r * 0.1;
    return [
      { poly: wall(g.x - r, top, g.x - r * 0.62, bot), vx: 0, vy: 0 },
      { poly: wall(g.x + r, top, g.x + r * 0.62, bot), vx: 0, vy: 0 },
    ];
  }

  scored(b, bin = this.goal) {
    // De reeks telt door (voor COMBO ×10), de bonus stopt bij 9 op rij.
    this.combo = Math.min(99, this.combo + 1);
    this.comboT = 3.2;
    // De bonusbak geeft zijn vaste punten; een gouden bal telt overal drie keer.
    const base = bin === this.bonus ? bin.pts : 1 + Math.floor(Math.min(9, this.combo) / 3);
    const pts = base * (b.gold ? 3 : 1);
    this.score.attack += pts;
    if (this.ownSettings) this.levelGoals += pts;
    const extra = b.gold || bin !== this.goal;
    this.burst(bin.x, bin.y - 20, '#ffd479', extra ? 48 : 34, extra ? 480 : 420);
    const eff = this.effects;
    // Met effecten springt de +1 even op, en is een +3 groter.
    this.pop(bin.x, bin.y - 40, '+' + pts, '#ffd479', eff && pts >= 3 ? FX_POP_GROOT : FX_POP_FONT, POP_RISE, 1.1, eff);
    // 3, 5, 10 op rij, en daarna elke 5: een eigen tekst en een eigen deuntje.
    const mijlpaal = this.combo === 3 || this.combo === 5 || (this.combo >= 10 && this.combo % 5 === 0);
    if (eff) {
      // Confetti uit de bak; goud voor een gouden bal en de bonusbak. In voorwerpmodus minder.
      const n = (extra ? 26 : 18) >> (this.lowLight ? 1 : 0);
      this.confetti(bin.x, bin.y - bin.r * 0.4, n, extra ? FX_GOUD : FX_CONFETTI, extra ? 560 : 480);
      if (mijlpaal) this.comboPop(bin);
    }
    this.flash = 0.75; this.flashCol = b.gold ? '#ffd479' : '#ff8a1e';
    if (this.sfx) {
      const s = this.sfx;
      if (bin === this.bonus && s.bonus) s.bonus();
      else if (b.gold && s.goud) s.goud();
      else s.score(this.combo);
      if (mijlpaal && s.combo) s.combo(this.combo);
    }
  }

  missed(b, quiet) {
    this.combo = 0;
    if (this.duel) {
      // Alleen een blok als een briefje van de verdediger hem raakte. Een bal die de
      // aanvaller zelf mis kaatste is niemands verdienste.
      if (!b.blockHits) return;
      this.score.block += 1;
      this.pop(b.x, this.H - 60, t('BLOK'), '#6ec1ff');
      this.burst(b.x, this.H - 20, '#3aa0ff', 10, 200);
    } else {
      this.misses += 1;
    }
    if (this.sfx && !quiet) this.sfx.miss();
  }

  // ---- tekenen -------------------------------------------------------------

  render(ctx, cw, ch) {
    const sc = ch / this.H;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    // Achtergrond is de muurverlichting. In een donkere kamer is de beamer de enige
    // lichtbron op de muur: bij zwart ziet de camera de voorwerpen niet. Op een scherm
    // (zonder beamer) tekent onderlaag hier het camerabeeld.
    if (this.onderlaag) this.onderlaag(ctx, cw, ch);
    else {
      const f = Math.round(Math.max(0, Math.min(1, this.fill || 0)) * 255);
      ctx.fillStyle = 'rgb(' + f + ',' + f + ',' + f + ')';
      ctx.fillRect(0, 0, cw, ch);
    }
    ctx.translate((cw - this.W * sc) / 2, 0);
    ctx.scale(sc, sc);

    // De schermvullende flits bij een doelpunt komt bij de camera aan nadat de
    // compensatie hem alweer vergeten is, dus in voorwerpmodus slaan we hem over.
    if (this.flash > 0 && !this.lowLight) {
      ctx.fillStyle = this.flashCol;
      ctx.globalAlpha = this.flash * 0.16;
      ctx.fillRect(0, 0, this.W, this.H);
      ctx.globalAlpha = 1;
    }

    this.drawGoal(ctx);
    if (this.bonusOn && (this.bonusLive() || this.state === 'paused')) this.drawBonus(ctx);
    this.drawSource(ctx);
    if (this.wind) this.drawWind(ctx);
    if (this.papier) this.drawPapier(ctx);
    if (this.showOutlines !== false) this.drawObstacles(ctx);
    if (this.special) this.drawSpecials(ctx);
    this.drawBalls(ctx);
    this.drawParts(ctx);
    this.drawHud(ctx);
    this.rangVak = null;           // waar de ranglijst staat; de QR-code van de telefoon wijkt uit
    if (this.highscores.length && (this.state === 'idle' || this.state === 'over')) this.drawHighscores(ctx);
    ctx.restore();
  }

  drawObstacles(ctx) {
    for (const ob of this.obstacles) {
      const kind = this.kindOf(ob);
      const st = kind === 'breek' ? this.breakState(ob, false) : null;
      const broken = !!(st && st.left > 0);
      const col = kind ? KIND_STYLE[kind].col
        : ob.team === 'block' ? '#3aa0ff' : ob.team === 'attack' ? '#ff8a1e' : '#7ae7ff';
      ctx.strokeStyle = col;
      if (ob.pending || broken) {
        // Een kapotte muur is er even niet: alleen een stippellijn ernaast.
        ctx.globalAlpha = broken ? 0.55 : 0.35;
        ctx.lineWidth = broken ? 3 : 2;
        ctx.setLineDash([10, 9]);
      } else if (this.lowLight) {
        ctx.lineWidth = 3;                 // geen gloed: die valt op het voorwerp zelf
      } else {
        ctx.lineWidth = 4;
        ctx.shadowColor = col; ctx.shadowBlur = 22;
      }
      // Een stukje naar buiten, zodat het licht naast het voorwerp valt en niet
      // erop. De vorm die de ballen raken blijft precies de gemeten vorm.
      const p = this.lowLight || broken ? outset(ob.poly, 14) : ob.poly;
      ctx.beginPath();
      ctx.moveTo(p[0][0], p[0][1]);
      for (let i = 1; i < p.length; i++) ctx.lineTo(p[i][0], p[i][1]);
      ctx.closePath();
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
      ctx.setLineDash([]);
    }
  }

  /**
   * De briefjes zelf, als gekleurd papier met een schaduwtje eronder (de demo: daar is
   * geen echte muur met echte briefjes). Een kapotte blauwe muur is even een vage
   * stippellijn. Nooit op een beamer met camera: licht op een voorwerp verstopt het.
   */
  drawPapier(ctx) {
    ctx.save();
    ctx.lineJoin = 'round';
    for (const ob of this.obstacles) {
      const kind = this.kindOf(ob), p = ob.poly;
      const st = kind === 'breek' ? this.breakState(ob, false) : null;
      const broken = !!(st && st.left > 0);
      const col = ob.kleur || (kind ? KIND_STYLE[kind].col : '#ffd84d');
      if (broken) {
        this.papierPad(ctx, p, 0, 0);
        ctx.globalAlpha = 0.5;
        ctx.strokeStyle = col; ctx.lineWidth = 3;
        ctx.setLineDash([10, 9]);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
        continue;
      }
      ctx.globalAlpha = ob.pending ? 0.45 : 1;
      // Schaduw: dezelfde vorm iets lager, donker. (Een wazige schaduw is op een telefoon
      // elk beeldje veel rekenwerk.)
      this.papierPad(ctx, p, 3, 7);
      ctx.fillStyle = 'rgba(0,0,0,.4)';
      ctx.fill();
      this.papierPad(ctx, p, 0, 0);
      ctx.fillStyle = col;
      ctx.fill();
      // een donkerder randje, zodat twee briefjes van dezelfde kleur los blijven
      ctx.strokeStyle = 'rgba(0,0,0,.28)'; ctx.lineWidth = 2;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  /** De omtrek van een briefje als pad, dx, dy verschoven. */
  papierPad(ctx, p, dx, dy) {
    ctx.beginPath();
    ctx.moveTo(p[0][0] + dx, p[0][1] + dy);
    for (let i = 1; i < p.length; i++) ctx.lineTo(p[i][0] + dx, p[i][1] + dy);
    ctx.closePath();
  }

  /**
   * Labels bij de speciale briefjes: BOING, TURBO, of hoeveel klappen een breekbare
   * muur nog kan hebben. Altijd boven het briefje, nooit erop: licht op een voorwerp
   * maakt het onzichtbaar voor de camera. Een kapotte muur toont de seconden tot hij
   * terugkomt.
   */
  drawSpecials(ctx) {
    let boxes = null;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '800 30px ui-sans-serif, system-ui, sans-serif';
    for (let i = 0; i < this.obstacles.length; i++) {
      const ob = this.obstacles[i], kind = this.kindOf(ob);
      if (!kind || ob.pending) continue;
      if (!boxes) boxes = this.obstacles.map(o => polyBox(o.poly));
      const sty = KIND_STYLE[kind];
      let text = t(sty.label);
      ctx.globalAlpha = 1;
      if (kind === 'breek') {
        const st = this.breakState(ob, false);
        if (st && st.left > 0) { text = Math.ceil(st.left) + 's'; ctx.globalAlpha = 0.6; }
        else text = String(BREAK_HITS - (st ? st.hits : 0));
      }
      // Een 800-letter van 30 px is ongeveer 22 breed; measureText is er niet altijd.
      const spot = this.labelSpot(boxes, i, text.length * 22 + 8, 34);
      if (!spot) continue;                 // nergens plek: liever geen label dan licht op een briefje
      ctx.fillStyle = sty.col;
      if (!this.lowLight) { ctx.shadowColor = sty.col; ctx.shadowBlur = 12; }
      ctx.fillText(text, spot[0], spot[1]);
      ctx.shadowBlur = 0;
    }
    ctx.restore();
  }

  /**
   * Midden van een label van w bij h naast briefje i: boven, onder, rechts of links,
   * de eerste plek binnen beeld die geen enkel briefje raakt. Ruimer dan de omlijning
   * in voorwerpmodus (14). Staan briefjes op elkaar gestapeld, dan viel het label
   * erboven anders precies op het volgende briefje.
   */
  labelSpot(boxes, i, w, h) {
    const [x0, y0, x1, y1] = boxes[i], mx = (x0 + x1) / 2, my = (y0 + y1) / 2, gap = 22;
    const spots = [[mx, y0 - gap - h / 2], [mx, y1 + gap + h / 2], [x1 + gap + w / 2, my], [x0 - gap - w / 2, my]];
    for (const [cx, cy] of spots) {
      const r = [cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2];
      if (r[0] < 0 || r[1] < 0 || r[2] > this.W || r[3] > this.H) continue;
      if (!boxes.some(b => boxHit(r, b, 10))) return [cx, cy];
    }
    return null;
  }

  drawGoal(ctx) {
    this.drawBin(ctx, this.goal, '#3ddc84', '61,220,132', 6);
  }

  /** De bonusbak: net als de bak, maar kleiner en goud, met zijn punten erboven. */
  drawBonus(ctx) {
    const bn = this.bonus;
    // even uitfaden vlak voor hij verhuist, en infaden op de nieuwe plek
    const a = Math.min(this.bonusFade, this.state === 'play' ? Math.min(1, this.bonusClock / 0.4) : 1);
    if (a <= 0) return;
    ctx.save();
    ctx.globalAlpha = a;
    this.drawBin(ctx, bn, '#ffd479', '255,212,121', 5);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = '#ffd479';
    ctx.font = '800 36px ui-sans-serif, system-ui, sans-serif';
    if (!this.lowLight) { ctx.shadowColor = '#ffd479'; ctx.shadowBlur = 14; }
    ctx.fillText('+' + bn.pts, bn.x, bn.y - bn.r * 0.55 - 14);
    ctx.shadowBlur = 0;
    ctx.restore();
  }

  /** Een bak tekenen: kom en trechter, precies waar rimWalls() ze neerzet. */
  drawBin(ctx, g, col, rgb, lw) {
    const pulse = 1 + Math.sin(this.t * 3) * 0.035;
    ctx.save();
    ctx.translate(g.x, g.y);
    ctx.scale(pulse, pulse);
    if (!this.lowLight) {
      // De zachte gloed is mooi, maar hij verblindt de camera over een groot vlak.
      // Een voorwerp dat daarin hangt zou onzichtbaar worden.
      const grd = ctx.createRadialGradient(0, 0, 4, 0, 0, g.r);
      grd.addColorStop(0, 'rgba(' + rgb + ',.45)');
      grd.addColorStop(1, 'rgba(' + rgb + ',0)');
      ctx.fillStyle = grd;
      ctx.beginPath(); ctx.arc(0, 0, g.r, 0, 7); ctx.fill();
    }
    ctx.strokeStyle = col;
    if (!this.lowLight) { ctx.shadowColor = col; ctx.shadowBlur = 26; }
    ctx.lineWidth = lw;
    // De kom: de onderste boog. Met "true" werd de bovenste boog getekend, een koepel.
    ctx.beginPath(); ctx.arc(0, 0, g.r * 0.62, Math.PI * 0.08, Math.PI * 0.92, false); ctx.stroke();
    ctx.lineWidth = lw - 2;
    ctx.beginPath();
    ctx.moveTo(-g.r, -g.r * 0.55); ctx.lineTo(-g.r * 0.62, g.r * 0.1);
    ctx.moveTo(g.r, -g.r * 0.55); ctx.lineTo(g.r * 0.62, g.r * 0.1);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.restore();
  }

  drawWind(ctx) {
    const v = this.windNow / Math.max(1, this.wind);       // -1 .. 1
    // in een level staat er een regel meer onder de klok
    const cx = this.W / 2, cy = this.H * 0.16 + (this.level > 0 ? 60 : 0), L = 150 * v;
    ctx.save();
    ctx.globalAlpha = 0.3 + Math.abs(v) * 0.45;
    ctx.strokeStyle = '#9fd0ff';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    for (let i = -1; i <= 1; i++) {
      const y = cy + i * 26;
      ctx.beginPath();
      ctx.moveTo(cx - L * 0.7, y);
      ctx.lineTo(cx + L * 0.7, y);
      ctx.stroke();
      if (Math.abs(L) > 24) {
        const dir = Math.sign(L);
        ctx.beginPath();
        ctx.moveTo(cx + L * 0.7 - dir * 16, y - 10);
        ctx.lineTo(cx + L * 0.7, y);
        ctx.lineTo(cx + L * 0.7 - dir * 16, y + 10);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  drawSource(ctx) {
    const s = this.source;
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.strokeStyle = '#ff4fa3';
    if (!this.lowLight) { ctx.shadowColor = '#ff4fa3'; ctx.shadowBlur = 20; }
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(-34, -14); ctx.lineTo(-16, 16); ctx.lineTo(16, 16); ctx.lineTo(34, -14);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.restore();
  }

  drawBalls(ctx) {
    for (const b of this.balls) {
      if (b.trail.length > 3) {
        ctx.strokeStyle = b.gold ? 'rgba(255,212,121,.22)' : 'rgba(255,255,255,.16)';
        ctx.lineWidth = b.r * 1.1;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(b.trail[0], b.trail[1]);
        for (let i = 2; i < b.trail.length; i += 2) ctx.lineTo(b.trail[i], b.trail[i + 1]);
        ctx.stroke();
      }
      ctx.fillStyle = b.gold ? '#ffd479' : '#fff';
      if (!this.lowLight) { ctx.shadowColor = b.gold ? '#ffd479' : '#cfe6ff'; ctx.shadowBlur = b.gold ? 24 : 18; }
      ctx.globalAlpha = b.fade == null ? 1 : Math.max(0, b.fade / 0.35);
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, 7); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
    }
  }

  drawParts(ctx) {
    // Confetti en sterretjes zijn in voorwerpmodus zachter: ze vliegen soms even over
    // een voorwerp heen. Nooit gloed (shadowBlur), die valt op een voorwerp.
    const dim = this.lowLight ? 0.55 : 1;
    for (let i = 0; i < this.parts.length; i++) {
      const p = this.parts[i], a = Math.max(0, p.life / p.max);
      ctx.fillStyle = p.col;
      if (p.kind === 1) {
        // confetti: een draaiend papiertje dat omslaat (de breedte wiebelt)
        ctx.globalAlpha = Math.min(1, a * 1.8) * dim;
        const c = Math.cos(p.rot), s = Math.sin(p.rot);
        const hw = p.r * Math.abs(Math.cos(p.rot * 1.7)) + 0.8, hh = p.r * 0.55;
        ctx.beginPath();
        ctx.moveTo(p.x + c * hw - s * hh, p.y + s * hw + c * hh);
        ctx.lineTo(p.x - c * hw - s * hh, p.y - s * hw + c * hh);
        ctx.lineTo(p.x - c * hw + s * hh, p.y - s * hw - c * hh);
        ctx.lineTo(p.x + c * hw + s * hh, p.y + s * hw - c * hh);
        ctx.fill();
      } else if (p.kind === 2) {
        // sterretje: vier punten, twinkelt
        ctx.globalAlpha = Math.min(1, a * 1.5) * (0.6 + 0.4 * Math.sin(p.rot)) * dim;
        const r = p.r, q = p.r * 0.28;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y - r); ctx.lineTo(p.x + q, p.y - q); ctx.lineTo(p.x + r, p.y);
        ctx.lineTo(p.x + q, p.y + q); ctx.lineTo(p.x, p.y + r); ctx.lineTo(p.x - q, p.y + q);
        ctx.lineTo(p.x - r, p.y); ctx.lineTo(p.x - q, p.y - q);
        ctx.fill();
      } else {
        ctx.globalAlpha = a;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    // Altijd vanaf de bovenkant. Voorheen hing dat af van wat main.js het laatst had
    // ingesteld, en dan weet shatter() niet waar KRAK precies komt te staan.
    ctx.textBaseline = 'top';
    ctx.textAlign = 'center';
    for (let i = 0; i < this.pops.length; i++) {
      const p = this.pops[i], k = p.t / (p.life || 1.1), y = p.y - k * (p.rise == null ? POP_RISE : p.rise);
      if (p.nl && p.taal !== huidigeTaal()) { p.text = t(p.nl, p.vars); p.taal = huidigeTaal(); }   // taal gewisseld
      ctx.globalAlpha = 1 - k;
      ctx.fillStyle = p.col;
      ctx.font = p.font || FX_POP_FONT;
      if (p.grow) {
        // even opspringen: klein, iets te groot, dan gewoon
        const g = p.t < 0.15 ? 0.55 + p.t / 0.15 * 0.6 : Math.max(1, 1.15 - (p.t - 0.15) * 1.5);
        ctx.save();
        ctx.translate(p.x, y);
        ctx.scale(g, g);
        ctx.fillText(p.text, 0, 0);
        ctx.restore();
      } else ctx.fillText(p.text, p.x, y);
    }
    ctx.globalAlpha = 1;
  }

  drawHud(ctx) {
    const pad = 44;
    // Taal gewisseld terwijl er een grote tekst staat: meteen in de nieuwe taal.
    const bn = this.banner;
    if (bn && bn.nl && bn.taal !== huidigeTaal()) { bn.text = t(bn.nl, bn.vars); bn.taal = huidigeTaal(); }
    ctx.textBaseline = 'top';
    ctx.font = '700 22px ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ff8a1e';
    ctx.fillText(this.duel ? t('AANVALLER') : t('DOELPUNTEN'), pad, pad);
    ctx.textAlign = 'right';
    ctx.fillStyle = this.duel ? '#3aa0ff' : '#7a8296';
    ctx.fillText(this.duel ? t('VERDEDIGER') : t('GEMIST'), this.W - pad, pad);

    ctx.font = '800 84px ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffb765';
    ctx.fillText(String(this.score.attack), pad, pad + 26);
    ctx.textAlign = 'right';
    ctx.fillStyle = this.duel ? '#6ec1ff' : '#5b6376';
    ctx.fillText(String(this.duel ? this.score.block : this.misses), this.W - pad, pad + 26);

    // Aftellen naar boven afronden: anders staat er de hele laatste seconde al 0:00
    // terwijl er nog gespeeld wordt.
    const endless = this.endless && !this.ownSettings;      // een level telt altijd af
    const shown = endless ? Math.floor(this.time) : Math.ceil(this.time - 1e-6);
    const m = Math.floor(shown / 60), s = shown % 60;
    ctx.textAlign = 'center';
    ctx.fillStyle = !endless && this.time < 11 && this.state === 'play' ? '#ff5b5b' : '#e8eaf0';
    ctx.font = '700 52px ui-sans-serif, system-ui, sans-serif';
    if (this.effects && this.laatsteTien()) {
      // Laatste tien seconden: de klok springt bij elke tik even groter en krimpt dan
      // terug. Alleen groter, niet feller en zonder gloed.
      const f = this.time - Math.floor(this.time), g = 1 + 0.25 * f * f * f;
      ctx.save();
      ctx.translate(this.W / 2, pad + 32);
      ctx.scale(g, g);
      ctx.fillText(m + ':' + String(s).padStart(2, '0'), 0, -26);
      ctx.restore();
    } else ctx.fillText(m + ':' + String(s).padStart(2, '0'), this.W / 2, pad + 6);

    // Uitdaging: welk level, en hoeveel punten er al zijn van wat er nodig is.
    let comboY = pad + 74;
    if (this.level > 0) {
      ctx.font = '800 28px ui-sans-serif, system-ui, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillStyle = '#ff8a1e';
      ctx.fillText(HUD_LEVEL.tekst(this.level), this.W / 2 - 14, pad + 64);
      ctx.textAlign = 'left';
      ctx.fillStyle = this.levelGoals >= this.levelTarget ? '#3ddc84' : '#e8eaf0';
      ctx.fillText(this.levelGoals + ' / ' + this.levelTarget, this.W / 2 + 14, pad + 64);
      ctx.textAlign = 'center';
      comboY = pad + 100;
    }

    if (this.combo > 1) {
      ctx.fillStyle = '#ffd479';
      ctx.font = '700 30px ui-sans-serif, system-ui, sans-serif';
      ctx.fillText(HUD_COMBO.tekst(this.combo), this.W / 2, comboY);
    }

    if (this.state === 'count') {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const n = Math.ceil(this.countdown);
      const k = 1 - (this.countdown - Math.floor(this.countdown));
      ctx.globalAlpha = Math.max(0, 1 - k * 0.45);
      ctx.fillStyle = '#ff8a1e';
      ctx.font = '800 ' + Math.round(280 * (1 + k * 0.12)) + 'px ui-sans-serif, system-ui, sans-serif';
      ctx.fillText(String(n), this.W / 2, this.H / 2);
      ctx.globalAlpha = 1;
      // tussen twee levels: LEVEL n GEHAALD boven het aftellen (en onder de windpijlen)
      if (this.banner) {
        ctx.fillStyle = '#ffd479';
        ctx.font = '800 72px ui-sans-serif, system-ui, sans-serif';
        ctx.fillText(this.banner.text, this.W / 2, this.H / 2 - 195);
      }
      ctx.fillStyle = '#e8eaf0';
      ctx.font = '600 40px ui-sans-serif, system-ui, sans-serif';
      ctx.fillText(this.level > 0 ? this.levelHint() : t('zet je voorwerpen klaar'), this.W / 2, this.H / 2 + 200);
      ctx.textBaseline = 'top';
      return;
    }

    if (this.state === 'idle' || this.state === 'paused' || this.state === 'over' || this.banner) {
      const txt = this.banner ? this.banner.text : (this.state === 'paused' ? t('PAUZE') : t('KLAAR OM TE STARTEN'));
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(0,0,0,.5)';
      ctx.fillRect(0, this.H / 2 - 110, this.W, 220);
      ctx.fillStyle = '#fff';
      ctx.font = '800 96px ui-sans-serif, system-ui, sans-serif';
      ctx.fillText(txt, this.W / 2, this.H / 2 - 16);

      let sub = '', subCol = '#8b93a5', subA = 1;
      if (this.state === 'over') sub = this.levelReached ? t('druk op spatie voor een nieuwe poging') : t('druk op spatie voor een nieuwe ronde');
      else if (this.state === 'idle' && this.tips.length) {
        // Eén tip tegelijk, elke 4,5 s de volgende, met een korte overvloei.
        const k = this.t / 4.5, into = (k - Math.floor(k)) * 4.5;
        sub = String(this.tips[Math.floor(k) % this.tips.length]);
        subA = Math.max(0, Math.min(1, into / 0.35, (4.5 - into) / 0.35));
        subCol = '#c9cfdb';
      }
      else if (this.state === 'idle' && this.best) sub = HUD_BEST.tekst(this.best);
      else if (this.state === 'idle') sub = t('zet iets voor de muur en start de ronde');
      if (this.newRecord && this.state === 'over') {
        ctx.fillStyle = '#ffd479';
        ctx.font = '800 46px ui-sans-serif, system-ui, sans-serif';
        ctx.fillText(t('NIEUW RECORD'), this.W / 2, this.H / 2 + 52);
      } else if (sub) {
        ctx.fillStyle = subCol;
        ctx.globalAlpha = subA;
        ctx.font = (sub.length > 60 ? '500 28px ' : '500 34px ') + 'ui-sans-serif, system-ui, sans-serif';
        ctx.fillText(sub, this.W / 2, this.H / 2 + 52);
        ctx.globalAlpha = 1;
      }
      ctx.textBaseline = 'top';
    }
  }

  /**
   * Top 5 op de muur, klein, in een hoek waar hij niets in de weg zit: niet op de bak,
   * de bron, de banner of een briefje (tekst op een voorwerp verstopt het voor de camera).
   */
  drawHighscores(ctx) {
    const list = this.highscores.slice(0, 5);
    const pad = 44, w = 340, rowH = 34, h = 44 + list.length * rowH;
    const g = this.goal, s = this.source;
    const spots = [
      [this.W - pad - w, this.H - pad - h],        // rechtsonder
      [pad, this.H - pad - h],                     // linksonder
      [this.W - pad - w, pad + 130],               // rechts, onder de score
      [pad, pad + 130],                            // links, onder de score
    ];
    const near = (x, y, cx, cy, r) => boxDist([x, y, x + w, y + h], cx, cy) < r;
    // Heel het briefje telt, niet alleen zijn midden: een groot boek steekt ver uit.
    const boxes = this.obstacles.map(ob => polyBox(ob.poly));
    let best = null, bestBad = Infinity;
    for (const sp of spots) {
      const [x, y] = sp;
      // op een briefje: daar kan de lijst nooit staan
      if (boxes.some(b => boxHit([x - 14, y - 12, x + w + 14, y + h + 6], b, 10))) continue;
      const bad = (near(x, y, g.x, g.y, g.r + 30) ? 3 : 0) + (near(x, y, s.x, s.y, 60) ? 2 : 0)
        + (y < this.H / 2 + 110 && y + h > this.H / 2 - 110 ? 2 : 0);
      if (bad < bestBad) { bestBad = bad; best = sp; }
      if (!bad) break;
    }
    if (!best) return;                     // elke hoek hangt vol: dan maar geen ranglijst
    const [x, y] = best;
    this.rangVak = [x - 14, y - 12, w + 28, h + 18];
    ctx.save();
    // Op een lichte muur is lichtgrijze tekst niet te lezen. In voorwerpmodus geen
    // donker vlak: dat haalt het licht weg van wat daar hangt.
    if (this.fill > 0.3 && !this.lowLight) {
      ctx.fillStyle = 'rgba(0,0,0,.45)';
      ctx.fillRect(x - 14, y - 12, w + 28, h + 18);
    }
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffd479';
    ctx.font = '800 24px ui-sans-serif, system-ui, sans-serif';
    ctx.fillText(t('RANGLIJST'), x, y);
    ctx.font = '600 24px ui-sans-serif, system-ui, sans-serif';
    for (let i = 0; i < list.length; i++) {
      const e = list[i] || {}, ry = y + 42 + i * rowH;
      const naam = (e.name == null ? '' : String(e.name)).slice(0, 16) || '—';
      ctx.fillStyle = i === 0 ? '#ffd479' : '#e8eaf0';
      ctx.textAlign = 'left';
      ctx.fillText((i + 1) + '. ' + naam, x, ry);
      ctx.textAlign = 'right';
      ctx.fillText(String(Number(e.score) || 0), x + w, ry);
    }
    ctx.restore();
  }
}
