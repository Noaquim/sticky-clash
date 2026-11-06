// De uitleg om het spel op te zetten: uitleg.html, de pdf's in docs/, en de knoppen in het spel.
//   1. Nederlands en Engels: evenveel stappen, en per stap evenveel regels, knoppen en links
//   2. geen lege teksten, en geen tekst die maar in één taal staat
//   3. elke #link in de pagina heeft een doel, en elk bestand waarnaar gelinkt wordt bestaat
//   4. de namen van knoppen (<b class="ui">) en de teksten op de muur (<b class="op-muur">)
//      staan precies zo in het spel, in beide talen (js/taal-en.js)
//   5. de taalkeuze bovenin: ?taal=, dan wat je in het spel koos, dan de browser
//   6. de pdf's: er zijn er twee, met 1 tot 3 bladzijden
//   7. het spel linkt ernaar: op het welkomstkaartje en onderaan het paneel, ook in
//      sticky-clash.html, en het losse bestand zonder map ernaast valt terug op de online uitleg
// node test/uitleg.mjs
import { readFileSync, existsSync } from 'node:fs';
import vm from 'node:vm';

const pad = (f) => new URL('../' + f, import.meta.url);
const lees = (f) => readFileSync(pad(f), 'utf8').replace(/\r\n/g, '\n');
const { TAAL_EN } = await import('../js/taal-en.js');
const { UITLEG_PDFS } = await import('../maak-uitleg-pdf.mjs');

let fouten = 0;
function check(naam, ok, extra = '') {
  console.log((ok ? 'ok   ' : 'FOUT ') + naam.padEnd(68) + extra);
  if (!ok) fouten++;
}
const lijst = (a, max = 10) => a.length ? '\n       ' + a.slice(0, max).join('\n       ') + (a.length > max ? '\n       … en nog ' + (a.length - max) : '') : '';

// Namen van knoppen uit de automatische versie die (in deze versie van het spel) nog niet in
// js/taal-en.js staan (Engels zoals op de tak "auto"). Staat zo'n knop er wel, dan geldt de
// gewone controle; na het samenvoegen kan deze lijst leeg.
const NOG_NIET_IN_HET_SPEL = {
  'Elke minuut controleren': 'Check every minute',
  'Start: alles klaarzetten': 'Start: set everything up',
  'Licht en muur bijgesteld': 'Light and wall adjusted',
  'Te donker voor kleuren: speciale briefjes zijn nu gewoon': 'Too dark for colours: special notes are ordinary now',
};
// Tekst die in beide talen hetzelfde is (in de tekeningen)
const ZELFDE = new Set(['webcam', 'laptop', 'HDMI', 'Win']);

// ---------------------------------------------------------------- HTML als boom

const LEEG = new Set(['meta', 'link', 'input', 'br', 'img', 'hr', 'source', 'area', 'base', 'col', 'embed', 'param', 'track', 'wbr']);
const ontsnap = (s) => s.replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  .replace(/&#39;/g, "'").replace(/&amp;/g, '&');

/** Een eenvoudige boom: { tag, attr, kids, parent }, tekst als { tag: '#tekst', tekst }. Genoeg voor deze pagina's. */
function boom(html) {
  const wortel = { tag: '#wortel', attr: {}, kids: [], parent: null };
  let cur = wortel, i = 0;
  while (i < html.length) {
    if (html.startsWith('<!--', i)) { i = html.indexOf('-->', i) + 3; continue; }
    if (html.startsWith('<!', i)) { i = html.indexOf('>', i) + 1; continue; }
    if (html[i] === '<') {
      const m = /^<(\/?)([a-zA-Z][\w-]*)((?:\s+[^\s=>/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*(\/?)>/.exec(html.slice(i, i + 3000));
      if (!m) { cur.kids.push({ tag: '#tekst', tekst: '<', parent: cur }); i++; continue; }
      i += m[0].length;
      const tag = m[2].toLowerCase();
      if (m[1]) {
        let k = cur;
        while (k && k.tag !== tag) k = k.parent;
        if (k && k.parent) cur = k.parent;
        continue;
      }
      const attr = {};
      for (const a of m[3].matchAll(/([^\s=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) attr[a[1].toLowerCase()] = ontsnap(a[2] ?? a[3] ?? a[4] ?? '');
      const el = { tag, attr, kids: [], parent: cur };
      cur.kids.push(el);
      if (tag === 'script' || tag === 'style') {
        const e = html.indexOf('</' + tag, i);
        el.code = html.slice(i, e);
        i = html.indexOf('>', e) + 1;
        continue;
      }
      if (!LEEG.has(tag) && !m[4]) cur = el;
      continue;
    }
    const j = html.indexOf('<', i), eind = j < 0 ? html.length : j;
    cur.kids.push({ tag: '#tekst', tekst: ontsnap(html.slice(i, eind)), parent: cur });
    i = eind;
  }
  return wortel;
}
function alle(el, f, uit = []) {
  for (const k of el.kids || []) { if (k.tag !== '#tekst' && f(k)) uit.push(k); alle(k, f, uit); }
  return uit;
}
const klasse = (el, c) => (' ' + (el.attr.class || '') + ' ').includes(' ' + c + ' ');
const tekstVan = (el) => el.tag === '#tekst' ? el.tekst : (el.kids || []).map(tekstVan).join('');
const schoon = (s) => s.replace(/\s+/g, ' ').trim();
function binnen(el, f) { for (let k = el.parent; k; k = k.parent) if (f(k)) return k; return null; }
const taalVan = (el) => { const k = binnen(el, (x) => x.attr && (x.attr.lang === 'nl' || x.attr.lang === 'en') && x.tag !== 'html'); return k ? k.attr.lang : ''; };

const html = lees('uitleg.html');
const doc = boom(html);
const isTaal = (t) => (el) => el.attr.lang === t && el.tag !== 'html';
const NL = alle(doc, isTaal('nl')), EN = alle(doc, isTaal('en'));

// ---------------------------------------------------------------- 1. evenveel in beide talen

check('uitleg.html: blokken in het Nederlands en in het Engels', NL.length > 50 && NL.length === EN.length, NL.length + ' tegen ' + EN.length);
{
  // per ouder: de Nederlandse en Engelse kinderen in dezelfde volgorde, van hetzelfde soort
  const mis = [], paren = [];
  for (const ouder of [doc, ...alle(doc, () => true)]) {
    const nl = ouder.kids.filter((k) => k.attr && isTaal('nl')(k)), en = ouder.kids.filter((k) => k.attr && isTaal('en')(k));
    if (!nl.length && !en.length) continue;
    const waar = '<' + ouder.tag + (ouder.attr.id ? '#' + ouder.attr.id : '') + '> ' + schoon(tekstVan(nl[0] || en[0])).slice(0, 40);
    if (nl.length !== en.length || nl.some((k, i) => k.tag !== en[i].tag)) mis.push(waar + ' (' + nl.length + ' nl, ' + en.length + ' en)');
    else nl.forEach((k, i) => paren.push([k, en[i]]));
  }
  check('  elk Nederlands blok heeft zijn Engelse tegenhanger', mis.length === 0, lijst(mis));
  // binnen elk paar: evenveel stappen, regels, knoppen, links en toetsen
  const tel = (el, f) => alle(el, f).length;
  const SOORTEN = { h3: (e) => e.tag === 'h3', p: (e) => e.tag === 'p', li: (e) => e.tag === 'li', dt: (e) => e.tag === 'dt', dd: (e) => e.tag === 'dd', 'a': (e) => e.tag === 'a',
    kbd: (e) => e.tag === 'kbd', knop: (e) => klasse(e, 'ui'), muur: (e) => klasse(e, 'op-muur'), tip: (e) => klasse(e, 'tip') };
  const anders = [];
  for (const [nl, en] of paren) {
    for (const [soort, f] of Object.entries(SOORTEN)) {
      const a = tel(nl, f), b = tel(en, f);
      if (a !== b) anders.push(soort + ': ' + a + ' tegen ' + b + ' in "' + schoon(tekstVan(nl)).slice(0, 50) + '"');
    }
    const nrNl = alle(nl, (e) => klasse(e, 'nr')).map((e) => schoon(tekstVan(e))).join(), nrEn = alle(en, (e) => klasse(e, 'nr')).map((e) => schoon(tekstVan(e))).join();
    if (nrNl !== nrEn) anders.push('stapnummer ' + nrNl + ' tegen ' + nrEn);
  }
  check('  per stap evenveel regels, knoppen, links en toetsen', paren.length > 50 && anders.length === 0, paren.length + ' paren' + lijst(anders));
  const genest = [...NL, ...EN].filter((el) => taalVan(el) && taalVan(el) !== el.attr.lang).map((el) => schoon(tekstVan(el)).slice(0, 50));
  check('  geen Engels binnen Nederlands (of andersom): dat zou nooit te zien zijn', genest.length === 0, lijst(genest));
}
{
  const stappen = (t) => alle(doc, (e) => e.tag === 'h3' && taalVan(e) === t).map((e) => schoon(tekstVan(alle(e, (x) => klasse(x, 'nr'))[0] || { kids: [] })));
  const nl = stappen('nl'), en = stappen('en');
  const verwacht = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '+', '+'];
  check('stappen 0 tot en met 10 en de twee vakjes, in beide talen', nl.join() === verwacht.join() && en.join() === verwacht.join(), nl.join(' ') + ' / ' + en.join(' '));
  const secties = alle(doc, (e) => e.tag === 'section' && klasse(e, 'stap'));
  const inhoud = alle(doc, (e) => e.tag === 'a' && binnen(e, (x) => x.attr && klasse(x, 'inhoud'))).map((a) => a.attr.href);
  const stapIds = secties.map((s) => s.attr.id).filter((id) => /^stap-\d+$/.test(id));
  check('  de inhoud bovenaan linkt naar elke stap', stapIds.length === 11 && stapIds.every((id) => inhoud.includes('#' + id)), inhoud.join(' '));
  const h1 = (t) => schoon(tekstVan(alle(doc, (e) => e.tag === 'h1' && e.attr.lang === t)[0] || { kids: [] }));
  const slot = alle(doc, (e) => e.tag === 'script').map((s) => s.code).find((c) => c.includes('TITEL')) || '';
  let titel = {};
  try { titel = vm.runInNewContext('(' + (/TITEL = (\{[^}]*\})/.exec(slot) || [])[1] + ')'); } catch { /* hieronder fout */ }
  check('  de titel van het tabblad is de kop, in beide talen', titel.nl === h1('nl') && titel.en === h1('en') && !!titel.nl, JSON.stringify(titel));
  check('  drie bladzijden: twee delen beginnen op een nieuwe', alle(doc, (e) => klasse(e, 'deel') && klasse(e, 'blad')).length === 2 &&
    /@page\s*\{\s*size:\s*A4/.test(html) && /\.deel\.blad\{break-before:page\}/.test(html));
}

// ---------------------------------------------------------------- 2. geen lege teksten, niets in maar één taal

{
  const leeg = [...NL, ...EN].filter((el) => !schoon(tekstVan(el))).map((el) => '<' + el.tag + ' lang=' + el.attr.lang + '> in <' + el.parent.tag + (el.parent.attr.id ? '#' + el.parent.attr.id : '') + '>');
  const leegItem = alle(doc, (e) => ['li', 'dt', 'dd', 'h1', 'h2', 'h3', 'p', 'figcaption', 'b', 'a', 'button'].includes(e.tag) && !schoon(tekstVan(e)) && !alle(e, (x) => x.tag === 'svg').length)
    .map((e) => '<' + e.tag + '>');
  check('geen lege teksten', leeg.length === 0 && leegItem.length === 0, lijst([...leeg, ...leegItem]));
  // tekst buiten een taalblok: alleen wat in beide talen hetzelfde is
  const los = [];
  for (const t of alle(doc, () => true).flatMap((e) => e.kids.filter((k) => k.tag === '#tekst').map((k) => ({ k, e })))) {
    const s = schoon(t.k.tekst);
    if (!/[A-Za-zÀ-ÿ]{2,}/.test(s) || ZELFDE.has(s)) continue;
    if (taalVan(t.k) || t.e.attr.lang === 'nl' || t.e.attr.lang === 'en') continue;
    if (binnen(t.k, (x) => x.tag === 'title' || (x.attr && x.attr.translate === 'no')) || t.e.tag === 'title' || t.e.attr.translate === 'no') continue;
    los.push(JSON.stringify(s) + ' in <' + t.e.tag + '>');
  }
  check('geen tekst die maar in één taal staat', los.length === 0, lijst(los));
}

// ---------------------------------------------------------------- 3. links

const elementen = alle(doc, () => true);
{
  const ids = elementen.map((e) => e.attr.id).filter(Boolean);
  const dubbel = ids.filter((id, i) => ids.indexOf(id) !== i);
  check('elke id maar één keer', dubbel.length === 0, dubbel.join(', '));
  const doelen = [];
  for (const e of elementen) {
    for (const [a, v] of Object.entries(e.attr)) {
      if (a === 'href' && v.startsWith('#')) doelen.push(v.slice(1));
      for (const m of v.matchAll(/url\(#([^)]+)\)/g)) doelen.push(m[1]);
    }
  }
  const weg = doelen.filter((d) => !ids.includes(d));
  check('elke #link en url(#…) in de pagina heeft een doel', doelen.length >= 20 && weg.length === 0, doelen.length + ' links' + lijst(weg));
  const bestanden = [], extern = [];
  for (const e of elementen) {
    for (const a of ['href', 'src']) {
      const v = e.attr[a];
      if (!v || v.startsWith('#')) continue;
      if (/^https?:/.test(v)) extern.push(v);
      else bestanden.push(v.split(/[?#]/)[0]);
    }
  }
  const mist = bestanden.filter((f) => !existsSync(pad(f)));
  check('elk bestand waarnaar gelinkt wordt bestaat', bestanden.length >= 5 && mist.length === 0, [...new Set(bestanden)].join(' ') + lijst(mist));
  const vreemd = extern.filter((u) => !u.startsWith('https://noaquim.github.io/sticky-clash/'));
  check('  links naar buiten: alleen naar het spel online', vreemd.length === 0, lijst(vreemd));
}

// ---------------------------------------------------------------- 4. namen van knoppen zoals in het spel

{
  const EN_KAART = new Map(Object.entries(TAAL_EN));
  const nlNamen = [], fout = [], nogNiet = [];
  for (const soort of ['ui', 'op-muur']) {
    const nl = alle(doc, (e) => klasse(e, soort) && taalVan(e) === 'nl').map((e) => schoon(tekstVan(e)));
    const en = alle(doc, (e) => klasse(e, soort) && taalVan(e) === 'en').map((e) => schoon(tekstVan(e)));
    nl.forEach((n, i) => {
      nlNamen.push(n);
      const verwacht = EN_KAART.has(n) ? EN_KAART.get(n) : NOG_NIET_IN_HET_SPEL[n];
      if (verwacht === undefined) fout.push(JSON.stringify(n) + ' staat niet in het spel (js/taal-en.js)');
      else if (en[i] !== verwacht) fout.push(JSON.stringify(n) + ': Engels ' + JSON.stringify(en[i]) + ', in het spel ' + JSON.stringify(verwacht));
      if (!EN_KAART.has(n)) nogNiet.push(n);
    });
  }
  check('knoppen en teksten op de muur heten zoals in het spel, in beide talen', nlNamen.length >= 15 && fout.length === 0,
    nlNamen.length + ' namen' + lijst(fout));
  const uniek = [...new Set(nogNiet)];
  console.log('     (nog niet in deze versie van het spel: ' + (uniek.length ? uniek.join(', ') : 'geen') + ')');
}

// ---------------------------------------------------------------- 5. de taalkeuze

{
  const kop = alle(doc, (e) => e.tag === 'script' && binnen(e, (x) => x.tag === 'head')).map((s) => s.code).find((c) => c.includes('stickyclash.taal')) || '';
  const kies = (search, bewaard, browser) => {
    const d = { documentElement: { lang: '', className: '' } };
    const opslag = bewaard === 'kapot' ? { getItem() { throw new Error('geblokkeerd'); } } : { getItem: (k) => (k === 'stickyclash.taal' ? bewaard : null) };
    vm.runInNewContext(kop, { document: d, location: { search }, localStorage: opslag, navigator: { language: browser, languages: [browser] } });
    return d.documentElement.lang + (d.documentElement.className === 'toon-' + d.documentElement.lang ? '' : '?');
  };
  const gevallen = [
    ['?taal=en', 'nl', 'nl-NL', 'en'], ['?taal=nl', 'en', 'en-US', 'nl'], ['', 'nl', 'en-US', 'nl'], ['', 'en', 'nl-NL', 'en'],
    ['', null, 'nl-BE', 'nl'], ['', null, 'de-DE', 'en'], ['', null, '', 'en'], ['?taal=xx', 'en', 'nl', 'en'], ['', 'kapot', 'nl-NL', 'nl'],
    ['?x=1&taal=en', null, 'nl', 'en'],
  ];
  const mis = [];
  for (const [s, b, br, verwacht] of gevallen) {
    let uit;
    try { uit = kies(s, b, br); } catch (f) { uit = 'fout: ' + f.message; }
    if (uit !== verwacht) mis.push(`${s || '(leeg)'} bewaard=${b} browser=${br}: ${uit}, verwacht ${verwacht}`);
  }
  check('taal: ?taal=, dan de keuze uit het spel, dan de browser', kop.length > 0 && mis.length === 0, lijst(mis));
  check('  de knoppen NL en EN hebben zelf geen lang (dan was er één onzichtbaar)',
    alle(doc, (e) => e.tag === 'button' && e.attr['data-taal']).every((b) => !b.attr.lang && !taalVan(b)));
}

// ---------------------------------------------------------------- 6. de pdf's

{
  check("twee pdf's: Nederlands en Engels", UITLEG_PDFS.length === 2 && UITLEG_PDFS.map((p) => p.taal).join() === 'nl,en');
  for (const p of UITLEG_PDFS) {
    const er = existsSync(pad(p.bestand));
    const data = er ? readFileSync(pad(p.bestand)) : Buffer.alloc(0);
    const bladen = (data.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
    check('  ' + p.bestand + ': een pdf van 1 tot 3 bladzijden', er && data.subarray(0, 5).toString() === '%PDF-' && bladen >= 1 && bladen <= 3,
      er ? bladen + ' bladzijden, ' + Math.round(data.length / 1024) + ' KB' : '(ontbreekt: node maak-uitleg-pdf.mjs)');
    const link = elementen.find((e) => e.tag === 'a' && e.attr.href === p.bestand);
    check('  uitleg.html linkt ernaar in die taal', !!link && (link.attr.lang === p.taal || taalVan(link) === p.taal));
  }
}

// ---------------------------------------------------------------- 7. het spel linkt ernaar

{
  const index = lees('index.html');
  const spel = boom(index);
  const links = alle(spel, (e) => e.tag === 'a' && klasse(e, 'naar-uitleg'));
  const goed = links.every((a) => a.attr.href === 'uitleg.html' && a.attr.target === '_blank' && /noopener/.test(a.attr.rel || ''));
  const welkom = links.filter((a) => binnen(a, (x) => x.attr && x.attr.id === 'welkom'));
  check('index.html: "Hoe zet ik het op?" op het welkomstkaartje en in het paneel', links.length === 2 && welkom.length === 1 && goed,
    links.length + ' links');
  // (zonder het vraagteken-pictogram ervoor)
  const zin = (a) => schoon(a.kids.filter((k) => k.tag === '#tekst').map((k) => k.tekst).join(''));
  check('  de tekst staat in het woordenboek', links.every((a) => TAAL_EN[zin(a)] === 'How do I set it up?'), links.map(zin).join(' | '));
  // het losse bestand: de links staan er ook in (niet tussen los:weg)
  const los = boom(lees('sticky-clash.html'));
  check('  ook in sticky-clash.html, met het scriptje dat de link kiest', alle(los, (e) => e.tag === 'a' && klasse(e, 'naar-uitleg')).length === 2 &&
    alle(los, (e) => e.tag === 'script').some((s) => s.code.includes('naar-uitleg')));
  // het scriptje zelf, in een nagebootste pagina
  const code = alle(spel, (e) => e.tag === 'script' && !e.attr.type).map((s) => s.code).find((c) => c.includes('naar-uitleg')) || '';
  const ankers = [{ href: '' }, { href: '' }];
  const d = { documentElement: { lang: 'nl' }, querySelectorAll: (q) => (q === 'a.naar-uitleg' ? ankers : []) };
  let proef = null, volger = null;
  function Image() { proef = this; }
  function MutationObserver(f) { volger = f; this.observe = (doel, o) => { this.doel = doel; this.o = o; }; }
  let fout = '';
  try { vm.runInNewContext(code, { document: d, Image, MutationObserver, window: { MutationObserver } }); } catch (f) { fout = f.message; }
  const a1 = ankers.map((a) => a.href).join();
  d.documentElement.lang = 'en'; if (volger) volger();
  const a2 = ankers.map((a) => a.href).join();
  if (proef && proef.onerror) proef.onerror();
  const a3 = ankers[0].href;
  check('  de link volgt de taal van het spel', !fout && a1 === 'uitleg.html?taal=nl,uitleg.html?taal=nl' && a2 === 'uitleg.html?taal=en,uitleg.html?taal=en', fout || a1 + ' → ' + a2);
  check('  zonder de map ernaast (alleen het losse bestand): de online uitleg', a3 === 'https://noaquim.github.io/sticky-clash/uitleg.html?taal=en', a3);
  check('  de proef kijkt naar een bestand dat naast het spel staat', !!proef && proef.src === 'sticky-clash.ico' && existsSync(pad(proef.src)));
  // offline: de service worker bewaart de uitleg
  let NODIG = [];
  try { NODIG = vm.runInNewContext(lees('sw.js') + '\n;NODIG', { self: { addEventListener() {} } }); } catch { /* hieronder fout */ }
  check('sw.js bewaart uitleg.html (ook zonder internet)', NODIG.includes('uitleg.html'));
  for (const f of ['README.md', 'README.nl.md']) {
    const r = lees(f);
    check(f + ' wijst naar de uitleg en de pdf', r.includes('uitleg.html') && r.includes(UITLEG_PDFS[f === 'README.md' ? 1 : 0].bestand));
  }
}

console.log('');
console.log(fouten ? fouten + ' test(s) mislukt' : 'alles goed');
process.exitCode = fouten ? 1 : 0;
