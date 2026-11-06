// Klaarzetten, stap voor stap (js/stappen.js): het oordeel bij "Camera richten", en dat het
// kaartje aan het spel vastzit (Muur + beamer, de knop in het paneel, de service worker).
// Het hele kaartje met een nep-webcam staat in de browsercontrole; hier wat zonder pagina kan.
// node test/stappen.mjs
import { readFileSync } from 'node:fs';

const lees = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
let fouten = 0;
function check(naam, ok, extra = '') {
  console.log((ok ? 'ok   ' : 'FOUT ') + naam.padEnd(60) + extra);
  if (!ok) fouten++;
}

const { witVlakOordeel, KLAAR_STAPPEN } = await import('../js/stappen.js');
const main = lees('js/main.js');

// otsuDrempel en grootsteVlak uit main.js: dezelfde vlakherkenning als het kalibreren
const haal = (naam) => {
  const m = new RegExp('\\nfunction ' + naam + '\\([\\s\\S]*?\\n\\}\\n').exec(main);
  return m ? new Function(m[0] + '\nreturn ' + naam + ';')() : null;
};
const otsu = haal('otsuDrempel'), grootste = haal('grootsteVlak');
check('otsuDrempel en grootsteVlak gevonden in main.js', typeof otsu === 'function' && typeof grootste === 'function');

// Een camerabeeld van 80 x 60 cellen: donkere muur (20) met een wit beamervlak (200) erin.
const COLS = 80, ROWS = 60;
function beeld(x0, y0, x1, y1, extra) {
  const l = new Float32Array(COLS * ROWS);
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
    const binnen = x >= x0 * COLS && x < x1 * COLS && y >= y0 * ROWS && y < y1 * ROWS;
    l[y * COLS + x] = (binnen ? 200 : 20) + ((x * 7 + y * 13) % 5);
  }
  if (extra) extra(l);
  return l;
}
const oordeel = (l) => witVlakOordeel(l, COLS, ROWS, otsu, grootste).code;

check('goed: het hele vlak in beeld, met een rand', oordeel(beeld(0.15, 0.12, 0.85, 0.88)) === 'goed', oordeel(beeld(0.15, 0.12, 0.85, 0.88)));
check('valt links buiten beeld', oordeel(beeld(0, 0.12, 0.7, 0.88)) === 'links');
check('valt rechts buiten beeld', oordeel(beeld(0.3, 0.12, 1, 0.88)) === 'rechts');
check('valt boven buiten beeld', oordeel(beeld(0.15, 0, 0.85, 0.7)) === 'boven');
check('valt onder buiten beeld', oordeel(beeld(0.15, 0.3, 0.85, 1)) === 'onder');
check('te groot: links én rechts eraf', oordeel(beeld(0, 0.1, 1, 0.9)) === 'groot');
check('te klein', oordeel(beeld(0.42, 0.42, 0.58, 0.58)) === 'klein');
check('niets: geen wit vlak (alleen muur)', oordeel(beeld(0, 0, 0, 0)) === 'niets');
check('niets: geen camerabeeld', witVlakOordeel(null, COLS, ROWS, otsu, grootste).code === 'geenbeeld');
// een felle lamp of discobalvlek naast het beamervlak telt niet mee (alleen het grootste vlak)
const metLamp = beeld(0.2, 0.15, 0.8, 0.85, (l) => { for (let y = 2; y < 6; y++) for (let x = 0; x < 3; x++) l[y * COLS + x] = 255; });
check('een lamp aan de rand van het beeld: nog steeds goed', oordeel(metLamp) === 'goed', oordeel(metLamp));
const o = witVlakOordeel(beeld(0.15, 0.12, 0.85, 0.88), COLS, ROWS, otsu, grootste);
check('de hoeken van het vlak, 0..1', o.hoeken && Math.abs(o.hoeken[0][0] - 0.15) < 0.03 && Math.abs(o.hoeken[2][1] - 0.88) < 0.03, JSON.stringify(o.hoeken && o.hoeken.map(p => p.map(v => +v.toFixed(2)))));

// ---- vast aan het spel
check('zeven stappen, in volgorde', KLAAR_STAPPEN.join() === 'beamer,venster,camera,kalibreren,muur,bak,klaar');
check('Muur + beamer opent het kaartje (muurStart)', /function muurStart\(\) \{[\s\S]*?stappen\.openen\(0\);[\s\S]*?\n\}/.test(main));
check('"Alles automatisch" blijft: autoSetup gaat mee als haakje', /new StapVoorStap\(\{[\s\S]*?autoSetup[\s\S]*?\}\);/.test(main));
const index = lees('index.html');
check('index.html: het kaartje en de knop in het paneel', /id="stappen"/.test(index) && /id="btnStappen"/.test(index) && /modulepreload" href="js\/stappen\.js"/.test(index));
check('sw.js bewaart js/stappen.js', /'js\/stappen\.js'/.test(lees('sw.js')));
check('niet opnieuw kalibreren zolang het kaartje open is (naResize)', /if \(stappen\.open\) return;/.test(main));

console.log(fouten ? '\n' + fouten + ' test(s) mislukt' : '\nalles goed');
process.exitCode = fouten ? 1 : 0;
