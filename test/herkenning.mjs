// Losse eigenschappen van de herkenning, elk met een verwachte uitkomst.
globalThis.document = {
  createElement: () => ({
    getContext: () => ({ createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }) }),
  }),
};
const { Vision } = await import('../js/vision.js');

const VW = 240, VH = 180;
function mk(opt = {}) {
  const v = new Vision();
  v.vw = VW; v.vh = VH; v.allocate();
  v.maskImage = { data: new Uint8ClampedArray(v.cols * v.rows * 4) };
  v.mode = 'object'; v.ready = true; v.minCells = 8;
  v.objThresh = 70 - 60 * 0.56;
  v.skinFilter = false;
  v.grab = () => true;
  Object.assign(v, opt);
  return v;
}
let fouten = 0;
const check = (naam, ok, extra = '') => {
  console.log((ok ? 'ok   ' : 'FOUT ') + naam.padEnd(46) + extra);
  if (!ok) fouten++;
};

function paint(v, draw) {
  const px = new Uint8ClampedArray(VW * VH * 4);
  for (let y = 0; y < VH; y++) for (let x = 0; x < VW; x++) {
    const c = draw(x, y);
    const i = (y * VW + x) * 4;
    px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2]; px[i + 3] = 255;
  }
  v.data = px; v.sampleCells();
}
const WALL = [178, 176, 172];
function learn(v, draw) {
  v.beginBackground();
  for (let i = 0; i < 8; i++) { paint(v, draw); v.addBackgroundFrame(); }
  v.endBackground();
}
function run(v, draw, frames = 16) {
  let tr = [];
  for (let i = 0; i < frames; i++) { paint(v, draw); tr = v.detect(1 / 30); }
  return tr;
}
const box = (x0, y0, w, h) => (x, y) => x >= x0 && x < x0 + w && y >= y0 && y < y0 + h;

// ---- 1. grijs voorwerp is geen schaduw --------------------------------------
{
  const v = mk();
  learn(v, () => WALL);
  const inBook = box(90, 70, 40, 30);
  const tr = run(v, (x, y) => inBook(x, y) ? [105, 104, 102] : WALL);
  const t = tr[0];
  check('grijs boek wordt gezien, niet als schaduw', !!t && t.medStep > 35,
    t ? '(randsprong ' + t.medStep.toFixed(0) + ')' : '(niet gezien)');
}

// ---- 2. zachte schaduw wordt wel herkend ------------------------------------
{
  const v = mk();
  learn(v, () => WALL);
  const tr = run(v, (x, y) => {
    const dx = Math.abs(x - 110), dy = Math.abs(y - 85);
    const d = Math.max(dx - 20, dy - 15, 0);
    if (d > 12) return WALL;
    const k = 0.62 + 0.38 * (d / 12);               // zachte overgang, 12 px penumbra
    return WALL.map(c => c * k);
  });
  const t = tr[0];
  check('zachte slagschaduw valt af op randsprong',
    !t || (t.shadowFrac > 0.6 && t.medStep < 35),
    t ? '(schaduwdeel ' + t.shadowFrac.toFixed(2) + ', randsprong ' + t.medStep.toFixed(0) + ')' : '(geen vlek)');
}

// ---- 3. huid scheidt de arm van het voorwerp --------------------------------
{
  const v = mk({ skinFilter: true });
  learn(v, () => WALL);
  const arm = box(150, 80, 90, 26), book = box(96, 74, 46, 36);
  const tr = run(v, (x, y) => arm(x, y) ? [198, 150, 120] : (book(x, y) ? [40, 90, 190] : WALL));
  const boek = tr.find(t => t.skinFrac < 0.5 && !t.touchEdge);
  check('boek in de hand blijft over, arm valt af', !!boek,
    boek ? '(huiddeel ' + boek.skinFrac.toFixed(2) + ')' : '');
}

// ---- 4. massiefheid scheidt voorwerp van arm --------------------------------
{
  const v = mk();
  learn(v, () => WALL);
  const t1 = run(v, (x, y) => box(95, 70, 40, 30)(x, y) ? [60, 70, 110] : WALL)[0];
  const v2 = mk();
  learn(v2, () => WALL);
  const t2 = run(v2, (x, y) => {                      // geknikte arm
    const a = Math.abs(y - (60 + (x - 80) * 0.5)) < 9 && x > 80 && x < 150;
    const b = Math.abs(x - 150) < 9 && y > 55 && y < 130;
    return (a || b) ? [120, 96, 78] : WALL;
  })[0];
  check('massief voorwerp haalt de vormtest', !!t1 && t1.solidity >= 0.72,
    t1 ? '(massiefheid ' + t1.solidity.toFixed(2) + ')' : '');
  check('geknikte arm zakt voor de vormtest', !!t2 && t2.solidity < 0.72,
    t2 ? '(massiefheid ' + t2.solidity.toFixed(2) + ')' : '');
}

// ---- 5. globale lichtsprong wordt weggerekend -------------------------------
for (const f of [0.75, 0.9, 1.1, 1.25]) {
  const v = mk();
  learn(v, () => WALL);
  const tr = run(v, () => WALL.map(c => c * f));
  check('licht ' + Math.round((f - 1) * 100) + '% -> geen spookvlekken', tr.length === 0,
    '(schatting ' + v.gain.toFixed(2) + ', voorgrond ' + (v.fgFraction * 100).toFixed(0) + '%)');
}

// ---- 6. voorwerp blijft zichtbaar ná een lichtsprong ------------------------
{
  const v = mk();
  learn(v, () => WALL);
  const inBook = box(90, 70, 40, 30);
  const tr = run(v, (x, y) => (inBook(x, y) ? [105, 104, 102] : WALL).map(c => c * 0.85));
  check('voorwerp overleeft 15% minder licht', tr.length === 1);
}

// ---- 7. donkere kamer: de muurverlichting maakt het verschil ------------------
// Wat de camera ziet = hoe sterk iets terugkaatst × hoeveel licht erop valt. In een
// donkere kamer met een zwart beamerbeeld valt er bijna niets op; dan zijn muur en
// post-it allebei bijna zwart en verdrinkt het verschil in de ruis van de camera.
{
  const MUUR = 0.72, POSTIT = [0.38, 0.62, 0.30];      // hoeveel licht ze terugkaatsen
  const kamer = 8;                                      // restlicht in een donkere kamer
  const inNote = box(100, 80, 24, 24);
  let seed = 11;
  const ruis = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return (seed / 0x7fffffff - 0.5) * 10; };
  function kijk(muurlicht, metNote) {
    const licht = kamer + muurlicht * 255;
    return (x, y) => (metNote && inNote(x, y)
      ? POSTIT.map(k => k * licht + ruis())
      : [MUUR * licht + ruis(), MUUR * licht + ruis(), MUUR * licht + ruis()]);
  }
  for (const [naam, lv] of [['zwart beamerbeeld', 0], ['muurverlichting 25%', 0.25]]) {
    const v = mk();
    learn(v, kijk(lv, false));
    const tr = run(v, kijk(lv, true));
    check('donkere kamer, ' + naam + ': post-it ' + (lv ? 'gezien' : 'onzichtbaar'),
      lv ? tr.length === 1 : tr.length === 0, '(' + tr.length + ' vlek(ken))');
  }
}

console.log('');
console.log(fouten ? fouten + ' test(s) mislukt' : 'alles goed');
process.exitCode = fouten ? 1 : 0;
