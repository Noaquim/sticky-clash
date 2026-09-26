// De Engelse versie: js/taal.js, het woordenboek js/taal-en.js en telefoon.html.
//   1. elke zichtbare tekst in index.html staat in het woordenboek
//   2. elke t('…') en tAantal(n, '…', '…') in js/*.js ook
//   3. de {plekken} in een zin en in zijn vertaling zijn dezelfde
//   4. geen Nederlandse tekst gaat buiten t() om naar het scherm (main.js, game.js,
//      telefoon.js, app.js): status(…), .textContent = …, fillText(…) en dergelijke
//   5. telefoon.html heeft alles in zijn eigen woordenboek, ook wat de laptop hem stuurt
//   6. en het werkt: zonder pagina (hier in node) Nederlands, wisselen, invullen, de muur
// node test/taal.mjs
import { readFileSync, readdirSync } from 'node:fs';
import vm from 'node:vm';

// Node heeft zelf een navigator, met de taal van de computer. Doe alsof die Engels is: het
// spel moet hier toch Nederlands blijven, anders kloppen de andere tests niet meer.
Object.defineProperty(globalThis, 'navigator', { value: { language: 'en-US', languages: ['en-US'] }, configurable: true, writable: true });

const taal = await import('../js/taal.js');
const { TAAL_EN } = await import('../js/taal-en.js');
const { Game } = await import('../js/game.js');
const { t, tAantal, zetTaal, huidigeTaal, opTaal, tHerkomst, vertaalPagina, kiesTaal, TaalTeller } = taal;

const lees = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
let fouten = 0;
function check(naam, ok, extra = '') {
  console.log((ok ? 'ok   ' : 'FOUT ') + naam.padEnd(60) + extra);
  if (!ok) fouten++;
}
// een lijst van wat mis is, de eerste 12 (met TAAL_MAX=1000 ervoor: alles)
const lijst = (a, max = +process.env.TAAL_MAX || 12) => a.length ? '\n       ' + a.slice(0, max).join('\n       ') + (a.length > max ? '\n       … en nog ' + (a.length - max) : '') : '';
const EN = new Map(Object.entries(TAAL_EN));

// ---------------------------------------------------------------- JavaScript in stukjes

// Namen, teksten ('…', "…", `…`), getallen en leestekens, met het regelnummer. Commentaar
// en reguliere expressies vallen weg. Genoeg voor deze controles; geen volledige parser.
const NAAMTEKEN = /[A-Za-z0-9_$À-ɏ]/;
const VOOR_REGEX = new Set(['return', 'typeof', 'case', 'do', 'else', 'in', 'of', 'new', 'delete', 'void', 'throw', 'instanceof', 'yield', 'await']);
const TEKENS = ['>>>=', '...', '===', '!==', '**=', '<<=', '>>=', '>>>', '&&=', '||=', '??=', '=>', '==', '!=', '<=', '>=', '&&', '||', '??', '?.',
  '++', '--', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '**', '<<', '>>'];

function stukjes(bron) {
  const uit = [];
  let i = 0, regel = 1;
  const n = bron.length;
  const regexMag = () => {
    const v = uit[uit.length - 1];
    if (!v) return true;
    if (v.soort === 'tekst' || v.soort === 'getal' || v.soort === 'regex') return false;
    if (v.soort === 'naam') return VOOR_REGEX.has(v.v);
    return !(v.v === ')' || v.v === ']' || v.v === '}');
  };
  while (i < n) {
    const c = bron[i];
    if (c === '\n') { regel++; i++; continue; }
    if (c === ' ' || c === '\t' || c === '\r') { i++; continue; }
    if (c === '/' && bron[i + 1] === '/') { while (i < n && bron[i] !== '\n') i++; continue; }
    if (c === '/' && bron[i + 1] === '*') {
      const e = bron.indexOf('*/', i + 2), eind = e < 0 ? n : e + 2;
      regel += (bron.slice(i, eind).match(/\n/g) || []).length;
      i = eind; continue;
    }
    if (c === "'" || c === '"') {
      let j = i + 1;
      while (j < n && bron[j] !== c && bron[j] !== '\n') { if (bron[j] === '\\') j++; j++; }
      uit.push({ soort: 'tekst', v: vm.runInNewContext(bron.slice(i, j + 1)), regel });
      i = j + 1; continue;
    }
    if (c === '`') {
      // sjabloon: de vaste stukken tellen als tekst, wat tussen ${ } staat wordt {}
      let j = i + 1, vast = '';
      while (j < n && bron[j] !== '`') {
        if (bron[j] === '\\') { vast += bron[j + 1]; j += 2; continue; }
        if (bron[j] === '$' && bron[j + 1] === '{') {
          let diep = 1; j += 2;
          while (j < n && diep) { if (bron[j] === '{') diep++; else if (bron[j] === '}') diep--; j++; }
          vast += '{}'; continue;
        }
        if (bron[j] === '\n') regel++;
        vast += bron[j++];
      }
      uit.push({ soort: 'tekst', v: vast, regel });
      i = j + 1; continue;
    }
    if (c === '/' && regexMag()) {
      let j = i + 1, klas = false;
      while (j < n && bron[j] !== '\n') {
        const d = bron[j];
        if (d === '\\') { j += 2; continue; }
        if (d === '[') klas = true;
        else if (d === ']') klas = false;
        else if (d === '/' && !klas) break;
        j++;
      }
      j++;
      while (j < n && /[a-z]/i.test(bron[j])) j++;
      uit.push({ soort: 'regex', v: bron.slice(i, j), regel });
      i = j; continue;
    }
    if (NAAMTEKEN.test(c)) {
      let j = i;
      while (j < n && NAAMTEKEN.test(bron[j])) j++;
      const w = bron.slice(i, j);
      uit.push({ soort: /^\d/.test(w) ? 'getal' : 'naam', v: w, regel });
      i = j; continue;
    }
    const teken = TEKENS.find(o => bron.startsWith(o, i)) || c;
    uit.push({ soort: 'teken', v: teken, regel });
    i += teken.length;
  }
  return uit;
}

// Wat geen aanroep is, ook al staat er een ( achter.
const GEEN_AANROEP = new Set(['if', 'for', 'while', 'switch', 'catch', 'function', 'return', 'typeof', 'await', 'else', 'do', 'in', 'of', 'with']);
const VERGELIJK = new Set(['===', '!==', '==', '!=']);

/**
 * Loopt een bron door. Geeft de sleutels (t('…'), tAantal(n, '…', '…'), new TaalTeller('…'))
 * en de verdachte teksten: een tekst met letters die naar een van de `putten` gaat
 * (status(…), fillText(…), .textContent = … enzovoort) zonder dat er t() omheen staat.
 * putten: { naam: argument } (-1 = elk argument); toewijzing: namen als 'textContent';
 * lokaal: gewone variabelen die later op het scherm komen (zoals fase en sub in telefoon.html).
 */
function ontleed(bron, bestand, putten = {}, toewijzing = new Set(), lokaal = new Set()) {
  const tk = stukjes(bron);
  const sleutels = [], verdacht = [];
  const stapel = [];                     // open haakjes: { haak, naam, lid, arg, begin, lit }
  const toew = [];                       // open toewijzingen aan .textContent enz.: { diepte, naam }
  const wikkel = (f) => f.haak === '(' && !f.lid && (f.naam === 't' || f.naam === 'tAantal' || f.naam === 'TaalTeller');
  for (let k = 0; k < tk.length; k++) {
    const s = tk[k];
    if (s.soort === 'teken') {
      if (s.v === '(' || s.v === '[' || s.v === '{') {
        let naam = '', lid = false;
        const v = tk[k - 1];
        if (s.v === '(' && v && v.soort === 'naam' && !GEEN_AANROEP.has(v.v)) {
          naam = v.v;
          lid = !!tk[k - 2] && (tk[k - 2].v === '.' || tk[k - 2].v === '?.');
        }
        stapel.push({ haak: s.v, naam, lid, arg: 0, begin: k + 1, lit: [], regel: s.regel });
      } else if (s.v === ')' || s.v === ']' || s.v === '}') {
        const f = stapel.pop();
        while (toew.length && toew[toew.length - 1].diepte > stapel.length) toew.pop();
        if (f && f.haak === '(' && !f.lid) {
          // welke argumenten waren precies één tekst?
          const waar = bestand + ':' + f.regel;
          if (f.naam === 't') {
            // telefoon.html: t(tekst, getal, sleutel) zoekt met de sleutel
            const sl = f.lit[2] !== undefined ? f.lit[2] : f.lit[0];
            if (sl !== undefined) sleutels.push({ nl: sl, waar });
          } else if (f.naam === 'tAantal') {
            for (const a of [1, 2]) if (f.lit[a] !== undefined) sleutels.push({ nl: f.lit[a], waar });
          } else if (f.naam === 'TaalTeller' && f.lit[0] !== undefined) sleutels.push({ nl: f.lit[0], waar });
        }
      } else if (s.v === ',' && stapel.length) {
        const f = stapel[stapel.length - 1];
        f.arg++; f.begin = k + 1;
        while (toew.length && toew[toew.length - 1].diepte >= stapel.length) toew.pop();
      } else if (s.v === ';') {
        while (toew.length && toew[toew.length - 1].diepte >= stapel.length) toew.pop();
      } else if (s.v === '=') {
        const v = tk[k - 1], vv = tk[k - 2];
        if (v && v.soort === 'naam' && vv && vv.v === '.' && toewijzing.has(v.v)) toew.push({ diepte: stapel.length, naam: v.v });
        else if (v && v.soort === 'naam' && !(vv && vv.v === '.') && lokaal.has(v.v)) toew.push({ diepte: stapel.length, naam: v.v });
      }
      continue;
    }
    if (s.soort !== 'tekst') continue;
    const f = stapel[stapel.length - 1];
    if (f && f.haak === '(' && f.begin === k && tk[k + 1] && (tk[k + 1].v === ',' || tk[k + 1].v === ')')) f.lit[f.arg] = s.v;

    // ---- verdacht?
    if (!/[A-Za-z]/.test(s.v)) continue;                             // alleen tekens en getallen
    const voor = tk[k - 1], na = tk[k + 1];
    if ((voor && VERGELIJK.has(voor.v)) || (na && VERGELIJK.has(na.v))) continue;   // een vergelijking
    if (na && na.v === ':' && voor && (voor.v === '{' || voor.v === ',')) continue;  // sleutel in een object
    // De eerste aanroep eromheen beslist: t() is goed, een put is fout, en iets anders
    // ($('id'), toFixed(…)) geeft de tekst niet zelf door naar het scherm.
    const tw = toew.length ? toew[toew.length - 1] : null;
    let oordeel = null;
    for (let d = stapel.length - 1; d >= 0 && !oordeel; d--) {
      if (tw && d < tw.diepte) break;
      const g = stapel[d];
      if (g.haak !== '(') continue;
      if (wikkel(g)) oordeel = 'ok';
      else if (g.naam in putten && (putten[g.naam] === -1 || putten[g.naam] === g.arg)) oordeel = g.naam + '(…)';
      else if (g.naam !== 'String') oordeel = 'ok';
    }
    if (!oordeel && tw) oordeel = '.' + tw.naam + ' = …';
    if (oordeel && oordeel !== 'ok') verdacht.push({ tekst: s.v, waar: bestand + ':' + s.regel + ' ' + oordeel });
  }
  return { sleutels, verdacht };
}

// ---------------------------------------------------------------- HTML in stukjes

const LEEG = new Set(['meta', 'link', 'input', 'br', 'img', 'hr', 'source', 'area', 'base', 'col', 'embed', 'param', 'track', 'wbr']);
const ontsnap = (s) => s.replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  .replace(/&#39;/g, "'").replace(/&amp;/g, '&');

/**
 * Zichtbare teksten van een HTML-pagina: tekst tussen de tags (ook de <title>) en de
 * attributen placeholder, title en aria-label. Niet: script, style, en wat onder
 * translate="no" staat. Geeft ook de <script>-blokken terug.
 */
function htmlTeksten(html) {
  const teksten = [], scripts = [], stapel = [];
  let i = 0;
  while (i < html.length) {
    if (html.startsWith('<!--', i)) { i = html.indexOf('-->', i) + 3; continue; }
    if (html.startsWith('<!', i)) { i = html.indexOf('>', i) + 1; continue; }
    if (html[i] === '<') {
      const m = /^<(\/?)([a-zA-Z][\w-]*)((?:\s+[^\s=>/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*(\/?)>/.exec(html.slice(i));
      if (!m) { i++; continue; }
      const tag = m[2].toLowerCase();
      i += m[0].length;
      if (m[1]) {
        const k = stapel.map(s => s.tag).lastIndexOf(tag);
        if (k >= 0) stapel.length = k;
        continue;
      }
      const attr = {};
      for (const a of m[3].matchAll(/([^\s=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) attr[a[1].toLowerCase()] = ontsnap(a[2] ?? a[3] ?? a[4] ?? '');
      const weg = attr.translate === 'no' || stapel.some(s => s.weg);
      if (!weg) for (const a of ['placeholder', 'title', 'aria-label']) if (a in attr) teksten.push({ v: attr[a], waar: '<' + tag + ' ' + a + '>' });
      if (tag === 'script' || tag === 'style') {
        const e = html.indexOf('</' + tag, i);
        if (tag === 'script') scripts.push({ attr, code: html.slice(i, e) });
        i = html.indexOf('>', e) + 1;
        continue;
      }
      if (!LEEG.has(tag) && !m[4]) stapel.push({ tag, weg });
      continue;
    }
    const j = html.indexOf('<', i), eind = j < 0 ? html.length : j;
    if (!stapel.some(s => s.weg)) teksten.push({ v: ontsnap(html.slice(i, eind)), waar: '<' + (stapel.length ? stapel[stapel.length - 1].tag : '') + '>' });
    i = eind;
  }
  return { teksten, scripts };
}

// Geen woorden om te vertalen: de naam van het spel, een toets, en getallen met een
// eenheid ('0.0s', '1.0/s', één letter per toets).
const GEEN_WOORD = new Set(['Sticky', 'Clash', 'Ctrl']);
const vertaalbaar = (s) => /[A-Za-zÀ-ÿ]{2,}/.test(s) && !GEEN_WOORD.has(s);

// ---------------------------------------------------------------- 1. index.html

const index = lees('index.html');
check('index.html: knoppen NL en EN bovenin', /id="taalKeuze"/.test(index) && /data-taal="nl"/.test(index) && /data-taal="en"/.test(index));
{
  const { teksten } = htmlTeksten(index);
  const zinnen = teksten.map(x => ({ ...x, v: x.v.trim() })).filter(x => vertaalbaar(x.v));
  const mist = zinnen.filter(x => !EN.has(x.v)).map(x => JSON.stringify(x.v) + '  ' + x.waar);
  check('index.html: elke zichtbare tekst heeft een vertaling', zinnen.length > 100 && mist.length === 0, zinnen.length + ' teksten' + lijst(mist));
  // de melding als het spel niet laadt, staat in de pagina zelf (zonder js/taal.js)
  const fout = (/onerror="([^"]*)"/.exec(index) || [])[1] || '';
  const [nl, en] = [...fout.matchAll(/'((?:[^'\\]|\\.)*)'/g)].map(m => vm.runInNewContext("'" + m[1] + "'")).filter(s => /spel|game/.test(s));
  check('index.html: melding als het spel niet laadt, in beide talen', !!nl && !!en && EN.get(nl) === en, en || '(niet gevonden)');
}

// ---------------------------------------------------------------- 2. sleutels in js/*.js

const bestanden = readdirSync(new URL('../js/', import.meta.url)).filter(f => f.endsWith('.js')).sort();
const bronnen = Object.fromEntries(bestanden.map(f => [f, lees('js/' + f)]));
const alleSleutels = [];
for (const f of bestanden) alleSleutels.push(...ontleed(bronnen[f], f).sleutels);
{
  // Sleutels die niet letterlijk in t('…') staan, maar in een lijst of object:
  const extra = [];
  const main = bronnen['main.js'], game = bronnen['game.js'], vision = bronnen['vision.js'];
  // de aanwijzingen op de muur tijdens het instellen: app.wiz = { title: '…', sub: '…' }
  for (const m of main.matchAll(/\b(?:title|sub):\s*'([^']+)'/g)) extra.push({ nl: m[1], waar: 'main.js app.wiz' });
  // waarom een vlek niet meetelt (de teller), en de codes op de diagnosefoto
  const redenen = (/const REDENEN = \{([\s\S]*?)\};/.exec(main) || [])[1] || '';
  for (const m of redenen.matchAll(/'([^']+)'/g)) extra.push({ nl: m[1], waar: 'main.js REDENEN' });
  for (const m of main.matchAll(/drop\('(\w+)'\)/g)) extra.push({ nl: m[1], waar: 'main.js drop()' });
  for (const m of main.matchAll(/reasonById\.set\([^;]*?\);/g)) for (const w of m[0].matchAll(/'(\w+)'/g)) extra.push({ nl: w[1], waar: 'main.js reasonById' });
  // labels van de speciale briefjes en de kleuren
  for (const m of game.matchAll(/label:\s*'([^']+)'/g)) extra.push({ nl: m[1], waar: 'game.js KIND_STYLE' });
  for (const m of vision.matchAll(/label:\s*'([^']+)'/g)) extra.push({ nl: m[1], waar: 'vision.js DEFAULT_CLASSES' });
  // codes uit vision.js die op het scherm komen: schaduw/huid (oordeel), soort briefje, wat vastgezet werd
  for (const w of ['schaduw', 'huid', 'trampoline', 'booster', 'breek', 'belichting', 'witbalans']) {
    extra.push({ nl: w, waar: 'vision.js' + (vision.includes("'" + w + "'") ? '' : ' (staat er niet meer in?)') });
  }
  alleSleutels.push(...extra);
  const mist = [...new Set(alleSleutels.filter(s => !EN.has(s.nl)).map(s => JSON.stringify(s.nl) + '  ' + s.waar))];
  check('js/*.js: elke t(\'…\')-zin heeft een vertaling', alleSleutels.length > 200 && mist.length === 0, alleSleutels.length + ' aanroepen' + lijst(mist));
  const nietDaar = extra.filter(s => s.waar.includes('niet meer'));
  check('  de codes uit vision.js bestaan nog', nietDaar.length === 0, nietDaar.map(s => s.nl).join(', '));
}

// ---------------------------------------------------------------- 3. {plekken}

const plekken = (s) => [...s.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort().join(',');
{
  const mis = [...EN].filter(([nl, en]) => plekken(nl) !== plekken(en)).map(([nl, en]) => nl + '  =>  ' + en);
  check('taal-en.js: dezelfde {plekken} in zin en vertaling', mis.length === 0, lijst(mis));
  const leeg = [...EN].filter(([nl, en]) => typeof en !== 'string' || !en.trim() || nl !== nl.trim()).map(([nl]) => JSON.stringify(nl));
  check('taal-en.js: geen lege vertalingen, geen spaties om een zin', leeg.length === 0, lijst(leeg));
}

// ---------------------------------------------------------------- 4. geen tekst buiten t() om

// Bewuste uitzonderingen: geen woorden om te vertalen.
const TOEGESTAAN = new Set([
  ' fps',                                  // beeldjes per seconde, rechtsboven
  's',                                     // seconden tot een kapotte blauwe muur terug is (game.js)
]);
const PUTTEN = { status: 0, fillText: 0, pop: 2, toonBanner: 0, confirm: 0, alert: 0, append: -1, kop: 0, fail: 0, nee: 0 };
// (melding: wat telefoon.js naar de telefoon stuurt, zoals 'Opgeslagen in de ranglijst')
const TOEWIJZING = new Set(['textContent', 'innerText', 'title', 'placeholder', 'banner', 'melding']);
// variabelen waarin een tekst eerst klaargezet wordt (toonStatus, de teller, drawHud)
const LOKAAL = new Set(['tekst', 'txt', 'klein', 'sub', 'text']);
{
  const verdacht = [];
  for (const f of ['main.js', 'game.js', 'telefoon.js', 'app.js']) {
    verdacht.push(...ontleed(bronnen[f], f, PUTTEN, TOEWIJZING, LOKAAL).verdacht.filter(v => !TOEGESTAAN.has(v.tekst)));
  }
  check('geen Nederlandse tekst buiten t() naar het scherm', verdacht.length === 0, lijst(verdacht.map(v => JSON.stringify(v.tekst) + '  ' + v.waar)));
  // en de controle zelf vangt wel iets
  const proef = ontleed(`status('Doel gezet', 'ok'); el.textContent = 'Hallo ' + naam; ctx.fillText(x ? t('Ja') : 'Nee', 1, 2);
    this.pop(1, 2, 'KRAK', '#fff'); status(t('Goed {n}', { n: 'drie' }), 'ok'); if (a === 'object') b.title = t('Titel');`, 'proef', PUTTEN, TOEWIJZING);
  check('  (de controle vangt status, textContent, fillText en pop)', proef.verdacht.map(v => v.tekst).join('|') === 'Doel gezet|Hallo |Nee|KRAK',
    proef.verdacht.map(v => v.tekst).join('|'));
}

// ---------------------------------------------------------------- 5. telefoon.html

const telHtml = lees('telefoon.html');
const TEL_EN = new Map();
{
  const { teksten, scripts } = htmlTeksten(telHtml);
  const code = scripts.map(s => s.code).join('\n');
  const obj = (/const EN = (\{[\s\S]*?\n {2}\});/.exec(code) || [])[1];
  let en = {};
  try { en = vm.runInNewContext('(' + obj + ')') || {}; } catch { /* hieronder fout */ }
  for (const [k, v] of Object.entries(en)) TEL_EN.set(k, v);
  check('telefoon.html: eigen woordenboek gevonden', TEL_EN.size > 30, TEL_EN.size + ' zinnen');
  const zinnen = teksten.map(x => x.v.trim()).filter(vertaalbaar);
  const { sleutels, verdacht } = ontleed(code, 'telefoon.html', { verbinding: 0, melding: 0 }, TOEWIJZING, new Set(['fase', 'sub']));
  const mist = [...new Set([...zinnen, ...sleutels.map(s => s.nl)].filter(z => !TEL_EN.has(z)))].map(z => JSON.stringify(z));
  check('telefoon.html: elke zichtbare tekst heeft een vertaling', zinnen.length > 10 && sleutels.length > 30 && mist.length === 0,
    zinnen.length + ' vaste teksten, ' + sleutels.length + ' t()' + lijst(mist));
  check('telefoon.html: geen tekst buiten t() naar het scherm', verdacht.length === 0, lijst(verdacht.map(v => JSON.stringify(v.tekst) + '  ' + v.waar)));
  const mis = [...TEL_EN].filter(([nl, e]) => plekken(nl) !== plekken(e) || !e.trim()).map(([nl, e]) => nl + '  =>  ' + e);
  check('telefoon.html: dezelfde {plekken} in zin en vertaling', mis.length === 0, lijst(mis));
  // Wat de laptop de telefoon stuurt (meldingen en de naamvraag), komt in de taal van de
  // laptop aan; de telefoon vertaalt het naar zijn eigen taal. Dan moet het er wel in staan,
  // met precies dezelfde vertaling als op de laptop.
  const naarTel = [];
  const tel = stukjes(bronnen['telefoon.js']);
  for (let k = 0; k < tel.length; k++) {
    const s = tel[k];
    if (s.soort === 'naam' && (s.v === 'nee' || s.v === 'melding') && tel[k + 1] && (tel[k + 1].v === '(' || tel[k + 1].v === '=')) {
      // tot het einde van de regel: elke t('…')
      for (let j = k + 1; j < tel.length && tel[j].regel === s.regel; j++) {
        if (tel[j].v === 't' && tel[j + 1] && tel[j + 1].v === '(' && tel[j + 2] && tel[j + 2].soort === 'tekst') naarTel.push(tel[j + 2].v);
      }
    }
  }
  for (const s of alleSleutels) if (/dat haalt de ranglijst/.test(s.nl)) naarTel.push(s.nl);
  const uniek = [...new Set(naarTel)];
  const anders = uniek.filter(z => TEL_EN.get(z) !== EN.get(z)).map(z => JSON.stringify(z) + '  telefoon: ' + JSON.stringify(TEL_EN.get(z)) + '  laptop: ' + JSON.stringify(EN.get(z)));
  check('telefoon.html: meldingen van de laptop, zelfde vertaling', uniek.length >= 13 && anders.length === 0, uniek.length + ' zinnen' + lijst(anders));
}

// ---------------------------------------------------------------- 6. het werkt

check('zonder pagina Nederlands, ook als node Engels zegt', huidigeTaal() === 'nl' && navigator.language === 'en-US');
check('keuze: bewaard > browser; nl* = Nederlands, de rest Engels',
  kiesTaal(null, 'en-US', true) === 'en' && kiesTaal(null, 'nl-BE', true) === 'nl' && kiesTaal(null, 'NL', true) === 'nl' &&
  kiesTaal(null, 'de-DE', true) === 'en' && kiesTaal(null, '', true) === 'en' && kiesTaal('nl', 'en-US', true) === 'nl' &&
  kiesTaal('en', 'nl-NL', true) === 'en' && kiesTaal('xx', 'nl-NL', true) === 'nl' && kiesTaal('en', 'en-US', false) === 'nl');
check('Nederlands: t() geeft de zin zelf, ingevuld', t('Start ronde') === 'Start ronde' && t('Camera actief: {naam}', { naam: 'C920' }) === 'Camera actief: C920');
let gemeld = [];
opTaal((x) => gemeld.push(x));
zetTaal('en');
check('wisselen naar Engels: volgers horen het één keer', huidigeTaal() === 'en' && gemeld.join() === 'en');
zetTaal('en'); zetTaal('xx');
check('  nog eens Engels, of onzin: niets', gemeld.join() === 'en' && huidigeTaal() === 'en');
check('Engels: vertaald en ingevuld', t('Start ronde') === 'Start round' && t('Camera actief: {naam}', { naam: 'C920' }) === 'Camera active: C920');
check('  onbekende zin blijft zoals hij is', t('Dit staat nergens') === 'Dit staat nergens' && t('{x} en {y}', { x: 1 }) === '1 en {y}');
check('aantallen: één en meer', tAantal(1, '{n} voorwerp actief', '{n} voorwerpen actief') === '1 object active' &&
  tAantal(3, '{n} voorwerp actief', '{n} voorwerpen actief') === '3 objects active' &&
  tAantal(0, '{n} voorwerp actief', '{n} voorwerpen actief') === '0 objects active');
const geleerd = t('{kleur} geleerd: tint {tint}°', { kleur: () => t('Aanvaller'), tint: 30 });
const h = tHerkomst(geleerd);
check('een functie als waarde: pas bij het invullen vertaald', geleerd === 'Attacker learned: hue 30°' && !!h && h.nl === '{kleur} geleerd: tint {tint}°');
zetTaal('nl');
check('  en zo opnieuw te vertalen na een wissel', t(h.nl, h.vars) === 'Aanvaller geleerd: tint 30°', t(h.nl, h.vars));
check('herkomst alleen van de laatste t()', tHerkomst('iets anders') === null);
{
  const tt = new TaalTeller('hoogste score tot nu toe: {n}');
  const a = tt.tekst(7), b = tt.tekst(7);
  zetTaal('en');
  const c = tt.tekst(7);
  zetTaal('nl');
  check('TaalTeller: onthoudt, en volgt getal en taal', a === 'hoogste score tot nu toe: 7' && b === a && c === 'high score so far: 7' && tt.tekst(8) === 'hoogste score tot nu toe: 8');
}

// ---- vaste teksten van een pagina: heen en weer zonder verlies
{
  const el = (naam, kinderen = [], attr = {}) => {
    const e = { nodeType: 1, nodeName: naam.toUpperCase(), attr: { ...attr }, firstChild: null, nextSibling: null,
      getAttribute(a) { return a in this.attr ? this.attr[a] : null; }, hasAttribute(a) { return a in this.attr; },
      setAttribute(a, v) { this.attr[a] = String(v); } };
    kinderen.forEach((k, i) => { if (i) kinderen[i - 1].nextSibling = k; });
    e.firstChild = kinderen[0] || null;
    return e;
  };
  const tekst = (data) => ({ nodeType: 3, data, nextSibling: null });
  const knop = tekst('Start ronde'), vrij = tekst('\n  Muur opnieuw leren  '), eigen = tekst('Start ronde'), code = tekst('Start ronde');
  const invoer = el('input', [], { placeholder: 'Naam' }), groep = el('div', [], { 'aria-label': 'Taal' });
  const dyn = tekst('Nog geen scores — speel een ronde');
  const body = el('body', [vrij, el('button', [knop], { title: 'Leer opnieuw hoe de lege muur eruitziet' }),
    el('span', [eigen], { translate: 'no' }), el('script', [code]), invoer, groep, el('ol', [dyn])]);
  const knopEl = body.firstChild.nextSibling;
  const stand = () => [vrij.data, knop.data, knopEl.attr.title, eigen.data, code.data, invoer.attr.placeholder, groep.attr['aria-label'], dyn.data];
  const voor = stand();
  zetTaal('en'); vertaalPagina(body);
  const en = stand();
  check('pagina in het Engels: tekst en attributen', en[0] === '\n  Relearn wall  ' && en[1] === 'Start round' && en[5] === 'Name' &&
    en[2] !== voor[2] && en[6] !== 'Taal', JSON.stringify(en.slice(0, 3)));
  check('  translate="no" en script blijven', en[3] === 'Start ronde' && en[4] === 'Start ronde');
  zetTaal('nl'); vertaalPagina(body);
  check('  terug naar Nederlands: precies als eerst', JSON.stringify(stand()) === JSON.stringify(voor));
  zetTaal('en'); vertaalPagina(body); zetTaal('nl'); vertaalPagina(body); zetTaal('en'); vertaalPagina(body);
  check('  vaker heen en weer: zelfde Engels', JSON.stringify(stand()) === JSON.stringify(en));
  // de pagina schrijft zelf iets nieuws in een knoop: dat is voortaan het origineel
  knop.data = 'Pauze';
  zetTaal('nl'); vertaalPagina(body);
  const na = knop.data;
  zetTaal('en'); vertaalPagina(body);
  check('  zelf veranderde tekst wordt niet teruggezet', na === 'Pauze' && knop.data === 'Pause', na + ' / ' + knop.data);
  zetTaal('nl'); vertaalPagina(body);
}

// ---- de muur in het Engels: alles wat getekend wordt, komt uit het woordenboek
{
  // Elke Engelse zin als patroon ({plek} = wat dan ook).
  const patronen = [...EN.values()].map(v => new RegExp('^' + v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\{\w+\\\}/g, '.+?') + '$'));
  // (zonder letters, of seconden tot een kapotte muur terugkomt: '3s')
  const engels = (s) => !/[A-Za-z]/.test(s) || /^\d+s$/.test(s) || patronen.some(p => p.test(s));
  const teksten = [];
  const ctx = new Proxy({}, {
    get: (o, k) => (k in o ? o[k] : k === 'createRadialGradient' ? () => ({ addColorStop() {} })
      : k === 'fillText' ? (s) => teksten.push(String(s)) : () => {}),
    set: (o, k, v) => { o[k] = v; return true; },
  });
  const teken = (g) => g.render(ctx, 1600, 900);
  const stil = { bounce() {}, krak() {}, score() {}, miss() {}, tick() {}, start() {}, end() {} };
  const blok = (x, y, kind, id) => ({ id, team: 'object', kind, vx: 0, vy: 0, poly: [[x, y], [x + 160, y], [x + 160, y + 40], [x, y + 40]] });
  zetTaal('en');
  const g = new Game(stil);
  g.highscores = [{ name: 'Anna', score: 12 }];
  g.best = 7;
  teken(g);                                                     // startscherm met hoogste score
  g.setObstacles([blok(300, 420, 'trampoline', 1), blok(800, 500, 'booster', 2), blok(1200, 420, 'breek', 3)]);
  g.start(30); teken(g);                                        // aftellen
  for (let i = 0; i < 260; i++) g.update(1 / 60);               // (en GO is weer weg)
  g.combo = 4; teken(g);                                        // spelen, met combo
  g.shatter(g.obstacles[2].poly); g.comboPop(g.goal);           // KRAK en COMBO ×4
  teken(g);
  g.togglePause(); teken(g); g.togglePause();                   // pauze
  g.score.attack = 9; g.elapsed = 1e6; g.update(1 / 60); teken(g);   // afgelopen, met record
  const d = new Game(stil);
  d.duel = true; d.start(30); for (let i = 0; i < 200; i++) d.update(1 / 60);
  d.missed({ x: 500, blockHits: 1 }); teken(d);                 // BLOK
  d.elapsed = 1e6; d.update(1 / 60); teken(d);                  // verdediger wint
  const e = new Game(stil);
  e.duel = true; e.start(30); e.countdown = 0; e.update(1 / 60); e.elapsed = 1e6; e.update(1 / 60); teken(e);   // gelijkspel
  const l = new Game(stil);
  l.levelMode = true; l.bonusOn = false; l.start(30); teken(l); // LEVEL 1: …
  for (let i = 0; i < 200; i++) l.update(1 / 60);
  l.levelGoals = l.levelTarget; l.update(1 / 60); teken(l);    // LEVEL 1 GEHAALD, LEVEL 2: …
  for (let i = 0; i < 60 * 50 && l.state !== 'over'; i++) l.update(1 / 60);
  teken(l);                                                     // LEVEL 2 — GAME OVER
  const nietEngels = [...new Set(teksten.filter(s => !engels(s) && s !== '1. Anna'))];
  check('muur in het Engels: elke tekst uit het woordenboek', teksten.length > 60 && nietEngels.length === 0, teksten.length + ' teksten' + lijst(nietEngels));
  const moet = ['GOALS', 'MISSED', 'READY TO START', 'high score so far: 7', 'get your objects ready', 'PAUSED', 'NEW RECORD', 'LEADERBOARD',
    'CRACK', 'COMBO ×4', 'COMBO x4', 'BOING', 'TURBO', 'BLOCK', 'ATTACKER', 'DEFENDER', 'DEFENDER WINS', 'DRAW', 'LEVEL 1 CLEARED',
    'LEVEL 2 — GAME OVER', '9 GOALS'];
  const weg = moet.filter(m => !teksten.includes(m));
  check('  alle soorten teksten kwamen langs', weg.length === 0, weg.join(', '));
  check('  levelhint in het Engels', teksten.some(s => /^LEVEL 1: \d+ points in \d+ s$/.test(s)) && teksten.some(s => /^LEVEL 2: /.test(s)));
  // terug naar Nederlands terwijl de eindstand er staat: meteen Nederlands
  teksten.length = 0;
  zetTaal('nl'); teken(l); teken(d); teken(e);
  check('wisselen tijdens een grote tekst: meteen de nieuwe taal', teksten.includes('LEVEL 2 — GAME OVER') && teksten.includes('VERDEDIGER WINT') &&
    teksten.includes('GELIJKSPEL') && l.banner.text === 'LEVEL 2 — GAME OVER', teksten.filter(s => /LEVEL|WIN|GELIJK|DRAW/.test(s)).join(' | '));
  const p = g.pops.find(q => q.text === 'CRACK' || q.text === 'KRAK');
  teksten.length = 0; teken(g);
  check('  ook de zwevende teksten (KRAK)', !p || (p.text === 'KRAK' && teksten.includes('KRAK')), p ? p.text : '(al weg)');
}

// ---------------------------------------------------------------- ter info

{
  const gebruikt = new Set([...alleSleutels.map(s => s.nl)]);
  for (const x of htmlTeksten(index).teksten) gebruikt.add(x.v.trim());
  gebruikt.add('Kon het spel niet laden — open sticky-clash.html, of start via start.bat');   // index.html, onerror
  const ongebruikt = [...EN.keys()].filter(k => !gebruikt.has(k));
  console.log('\n     (' + EN.size + ' zinnen in taal-en.js' + (ongebruikt.length ? '; niet (meer) gebruikt: ' + ongebruikt.map(k => JSON.stringify(k)).join(', ') : '') + ')');
}

console.log('');
console.log(fouten ? fouten + ' test(s) mislukt' : 'alles goed');
process.exitCode = fouten ? 1 : 0;
