// De uitleg voor wie zelf wil sleutelen, ZELF AANPASSEN.txt en CUSTOMIZE.txt, noemt
// stukjes code om met Ctrl+F naar te zoeken. Verandert de code, dan vindt niemand ze
// meer, en de uitleg zegt dat niet vanzelf. Deze test wel:
//   1. elk stukje staat precies zo, en precies één keer, in het genoemde bestand
//   2. de Nederlandse en de Engelse uitleg noemen dezelfde stukjes, in dezelfde volgorde
//   3. elk bestand onder WAT STAAT WAAR bestaat, en elk js/*.js staat erin
//   4. elke test in test/ staat in README.md en README.nl.md
//   5. beide uitleggen zijn UTF-8 met BOM en Windows-regeleinden (dan toont Kladblok ze goed)
//
// Zo herkent de test een stukje, onder MAKKELIJKE AANPASSINGEN / EASY CHANGES:
//   - een regel met twee spaties ervoor die op een dubbele punt eindigt en een bestand
//     noemt (js/…, css/…, …html) zegt in welk bestand de stukjes eronder staan
//   - een regel met precies vier spaties ervoor is: uitleg, minstens twee spaties, het
//     stukje code, en eventueel nog twee spaties en (uitleg tussen haakjes)
//   - wat verder inspringt is uitleg die doorloopt, en telt niet mee
// node test/gids.mjs
import { readFileSync, readdirSync, existsSync } from 'node:fs';

const pad = (f) => new URL('../' + f, import.meta.url);
const leesBytes = (f) => readFileSync(pad(f));
const lees = (f) => readFileSync(pad(f), 'utf8').replace(/^﻿/, '').replace(/\r\n/g, '\n');

let fouten = 0;
function check(naam, ok, extra = '') {
  console.log((ok ? 'ok   ' : 'FOUT ') + naam.padEnd(66) + extra);
  if (!ok) fouten++;
}

const GIDSEN = [
  { bestand: 'ZELF AANPASSEN.txt', kort: 'NL', stukjes: 'MAKKELIJKE AANPASSINGEN', waar: 'WAT STAAT WAAR' },
  { bestand: 'CUSTOMIZE.txt', kort: 'EN', stukjes: 'EASY CHANGES', waar: 'WHAT IS WHERE' },
];
// Een kop is een regel zonder inspringen, in hoofdletters: EDITOR, WAT STAAT WAAR, …
const IS_KOP = /^[A-Z][A-Z .?'-]*$/;
const BESTAND = /(?:js\/[\w.-]+\.js|css\/[\w.-]+\.css|[\w.-]+\.html)/g;
const STUKJE = /^ {4}(\S(?:(?! {2}).)*?) {2,}(\S(?:(?! {2}).)*?)(?: {2,}\(.*\))?$/;

/** De regels onder kop `naam`, tot de volgende kop, met hun regelnummer in de uitleg. */
function sectie(tekst, naam) {
  const regels = tekst.split('\n');
  const begin = regels.findIndex(r => r === naam);
  if (begin < 0) return [];
  const uit = [];
  for (let i = begin + 1; i < regels.length && !IS_KOP.test(regels[i]); i++) uit.push({ nr: i + 1, r: regels[i].trimEnd() });
  return uit;
}

/** De stukjes code: [{ bestand, stukje, nr }], en de regels die niet te lezen waren. */
function stukjes(tekst, kop) {
  const lijst = [], kapot = [];
  let bestand = null;
  for (const { nr, r } of sectie(tekst, kop)) {
    if (/^ {2}\S/.test(r) && r.endsWith(':')) {
      const b = r.match(BESTAND);
      bestand = b ? b[b.length - 1] : null;
    } else if (/^ {4}\S/.test(r)) {
      const m = r.match(STUKJE);
      if (!m || !bestand) kapot.push(nr + ': ' + r.trim() + (m ? '  (geen bestand erboven)' : ''));
      else lijst.push({ bestand, stukje: m[2], nr });
    }
  }
  return { lijst, kapot };
}

const telKeer = (tekst, stukje) => tekst.split(stukje).length - 1;
const bronnen = new Map();
function bron(f) {
  if (!bronnen.has(f)) bronnen.set(f, existsSync(pad(f)) ? readFileSync(pad(f), 'utf8') : null);
  return bronnen.get(f);
}

// ---------------------------------------------------------------- zelftest

// Eerst de test zelf: een fout stukje moet opvallen, en een regel zonder stukje ook.
{
  const nep = 'MAKKELIJKE AANPASSINGEN\n  In js/game.js:\n    Grootte van de ballen       r: 12345,         (fout)\n' +
    '    Grootte van de bak          r: 110, auto: false\n    alleen uitleg, geen stukje\nVOLGENDE KOP\n    r: 11,\n';
  const s = stukjes(nep, 'MAKKELIJKE AANPASSINGEN');
  check('zelftest: stukjes gelezen, tot de volgende kop', s.lijst.length === 2 && s.lijst[1].stukje === 'r: 110, auto: false', s.lijst.map(x => x.stukje).join(' | '));
  check('zelftest: een fout stukje wordt gezien', telKeer(bron(s.lijst[0].bestand), s.lijst[0].stukje) === 0 &&
    telKeer(bron(s.lijst[1].bestand), s.lijst[1].stukje) === 1);
  check('zelftest: een regel zonder stukje wordt gezien', s.kapot.length === 1);
}

// ---------------------------------------------------------------- de stukjes code

const gelezen = {};
for (const g of GIDSEN) {
  const bytes = leesBytes(g.bestand);
  const ruw = bytes.toString('utf8');
  check(g.bestand + ': UTF-8 met BOM', bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf);
  check(g.bestand + ': Windows-regeleinden (CRLF)', !/(^|[^\r])\n/.test(ruw) && ruw.endsWith('\r\n'));

  const tekst = lees(g.bestand);
  const { lijst, kapot } = stukjes(tekst, g.stukjes);
  gelezen[g.kort] = { tekst, lijst };
  check(g.bestand + ': stukjes code onder ' + g.stukjes, lijst.length >= 25, lijst.length + (lijst.length >= 25 ? '' : ', minstens 25 verwacht'));
  check(g.bestand + ': elke regel te lezen', kapot.length === 0, kapot.join(' / '));
  for (const s of lijst) {
    const code = bron(s.bestand);
    const n = code === null ? -1 : telKeer(code, s.stukje);
    check(g.kort + ' ' + s.bestand + '  ' + s.stukje, n === 1,
      n === 1 ? '' : n < 0 ? '(bestand bestaat niet; regel ' + s.nr + ')' : '(' + n + ' keer gevonden, moet 1 zijn; regel ' + s.nr + ')');
  }
}

{
  const nl = gelezen.NL.lijst.map(s => s.bestand + '  ' + s.stukje);
  const en = gelezen.EN.lijst.map(s => s.bestand + '  ' + s.stukje);
  const i = nl.findIndex((x, k) => x !== en[k]);
  check('Nederlands en Engels: dezelfde stukjes, zelfde volgorde', nl.length === en.length && i < 0,
    nl.length !== en.length ? nl.length + ' tegen ' + en.length : i >= 0 ? 'eerste verschil: ' + nl[i] + '  /  ' + en[i] : '');
}

// ---------------------------------------------------------------- wat staat waar

const jsBestanden = readdirSync(pad('js')).filter(f => f.endsWith('.js')).map(f => 'js/' + f);
for (const g of GIDSEN) {
  const genoemd = sectie(gelezen[g.kort].tekst, g.waar).filter(x => /^ {2}\S/.test(x.r)).map(x => x.r.trim().split(/\s+/)[0]);
  const weg = genoemd.filter(f => !existsSync(pad(f)));
  const mist = jsBestanden.filter(f => !genoemd.includes(f));
  check(g.bestand + ': ' + g.waar + ' noemt alleen bestaande bestanden', genoemd.length > 0 && weg.length === 0, weg.join(', '));
  check(g.bestand + ': ' + g.waar + ' noemt elk js/*.js', mist.length === 0, mist.join(', '));
}

// ---------------------------------------------------------------- README

// Alleen het lijstje onder "## Tests" telt, niet een test die ergens anders genoemd wordt.
const tests = readdirSync(pad('test')).filter(f => f.endsWith('.mjs') && f !== 'hulp.mjs');
for (const f of ['README.md', 'README.nl.md']) {
  const deel = (lees(f).split(/^## Tests$/m)[1] || '').split(/^## /m)[0];
  const lijstje = new Set([...deel.matchAll(/^node test\/(\S+\.mjs)/gm)].map(m => m[1]));
  const mist = tests.filter(t => !lijstje.has(t));
  check(f + ': elke test staat onder "## Tests"', lijstje.size > 0 && mist.length === 0, mist.join(', '));
}

console.log('');
console.log(fouten ? fouten + ' test(s) mislukt' : 'alles goed');
process.exitCode = fouten ? 1 : 0;
