// Installeren als app: het manifest, de pictogrammen, de service worker (sw.js) en
// js/app.js. En het losse bestand mag er niets van merken: file:// kan geen manifest en
// geen service worker, dus daar mag het niet eens geprobeerd worden.
import { readFileSync, existsSync } from 'node:fs';
import vm from 'node:vm';
import { check, klaar } from './hulp.mjs';

const pad = (f) => new URL('../' + f, import.meta.url);
const lees = (f) => readFileSync(pad(f), 'utf8');
const bestaat = (f) => existsSync(pad(f));
const { bouw } = await import('../bouw-los-bestand.mjs');
const { html: los, order } = bouw();

// ---------------------------------------------------------------- manifest

let man = {};
try { man = JSON.parse(lees('manifest.webmanifest')); } catch { /* hieronder fout */ }
const css = lees('css/style.css');
const bg = (css.match(/--bg:(#[0-9a-f]{6})/i) || [])[1];
const kop = (css.match(/header\{[^}]*background:(#[0-9a-f]{6})/i) || [])[1];
const index = lees('index.html');

check('manifest is geldige JSON', !!man.name);
check('naam en korte naam', man.name === 'Sticky Clash' && !!man.short_name && man.short_name.length <= 12);
check('Nederlandse beschrijving', /spel/.test(man.description || ''));
check('start_url en scope ./', man.start_url === './' && man.scope === './');
check('display standalone', man.display === 'standalone');
check('achtergrondkleur = --bg uit style.css', !!bg && man.background_color === bg, man.background_color + ' / ' + bg);
check('themakleur = kopbalk uit style.css', !!kop && man.theme_color === kop, man.theme_color + ' / ' + kop);
check('index.html: manifest en themakleur', index.includes('<link rel="manifest" href="manifest.webmanifest">') &&
  index.includes('<meta name="theme-color" content="' + man.theme_color + '">'));

/** Breedte, hoogte en of er doorzichtige pixels in kunnen zitten, uit de PNG-kop. */
function png(f) {
  const b = readFileSync(pad(f));
  if (b.toString('latin1', 1, 4) !== 'PNG') return null;
  const uit = { w: b.readUInt32BE(16), h: b.readUInt32BE(20), kleur: b[25], doorzichtig: false, bytes: b.length };
  for (let i = 8; i + 8 <= b.length;) {
    const len = b.readUInt32BE(i), type = b.toString('latin1', i + 4, i + 8);
    if (type === 'tRNS') uit.doorzichtig = true;
    i += 12 + len;
  }
  if (uit.kleur === 4 || uit.kleur === 6) uit.doorzichtig = true;
  return uit;
}

const icons = man.icons || [];
for (const ic of icons) {
  const p = bestaat(ic.src) ? png(ic.src) : null;
  const [w, h] = (ic.sizes || '').split('x').map(Number);
  check('pictogram ' + ic.src, !!p && p.w === w && p.h === h && ic.type === 'image/png',
    p ? p.w + 'x' + p.h + ', ' + (p.bytes / 1024).toFixed(1) + ' KB' : '(ontbreekt of geen PNG)');
  check('  en klein gehouden', !!p && p.bytes < 30 * 1024);
}
const gewoon = icons.filter(i => !i.purpose || i.purpose.split(' ').includes('any'));
const maskable = icons.find(i => (i.purpose || '').split(' ').includes('maskable'));
check('pictogrammen 192 en 512', gewoon.some(i => i.sizes === '192x192') && gewoon.some(i => i.sizes === '512x512'));
check('maskable pictogram, zonder doorzichtige randen', !!maskable && bestaat(maskable.src) && png(maskable.src).doorzichtig === false);

// ---------------------------------------------------------------- service worker

const swBron = lees('sw.js');
/** Draait sw.js in een nagebootste browser: eigen netwerk, eigen opslag. */
function maakSw(bestanden) {
  const BASIS = 'https://voorbeeld.nl/sticky-clash/';
  const net = { offline: false, bestanden, gevraagd: [] };
  // een antwoord van de eigen site, met de caching van GitHub Pages
  class Antwoord extends Response {
    constructor(tekst, status = 200) { super(tekst, { status, headers: { 'Cache-Control': 'max-age=600' } }); }
    get type() { return 'basic'; }
  }
  class Verzoek {
    constructor(u, o = {}) { this.url = new URL(u, BASIS).href; this.cache = o.cache || 'default'; this.method = 'GET'; this.mode = 'cors'; }
  }
  const fetch = async (req, init = {}) => {
    net.gevraagd.push({ url: req.url, cache: init.cache || req.cache });
    if (net.offline) throw new TypeError('Failed to fetch');
    const rel = req.url.slice(BASIS.length).split('?')[0] || './';
    return net.bestanden.has(rel) ? new Antwoord(net.bestanden.get(rel)) : new Antwoord('niet gevonden', 404);
  };
  const opslag = new Map();   // naam -> Map(url -> antwoord)
  const sleutel = (req, zonderVraag) => {
    const u = new URL(typeof req === 'string' ? new URL(req, BASIS) : req.url);
    if (zonderVraag) u.search = '';
    return u.href;
  };
  const cacheVan = (m) => ({
    async put(req, res) { m.set(sleutel(req), res.clone()); },
    async match(req, o = {}) {
      for (const [k, v] of m) if (sleutel(k, o.ignoreSearch) === sleutel(req, o.ignoreSearch)) return v.clone();
      return undefined;
    },
    urls: () => [...m.keys()],
  });
  const caches = {
    async open(n) { if (!opslag.has(n)) opslag.set(n, new Map()); return cacheVan(opslag.get(n)); },
    async keys() { return [...opslag.keys()]; },
    async delete(n) { return opslag.delete(n); },
    opslag,
  };
  const luisteraars = {};
  const self = {
    location: new URL('sw.js', BASIS),
    addEventListener: (t, f) => { luisteraars[t] = f; },
    skipWaiting: async () => { self.overgeslagen = true; },
    clients: { claim: async () => { self.geclaimd = true; } },
  };
  const ctx = vm.createContext({ self, caches, fetch, Request: Verzoek, Response, Headers, URL, console });
  const vars = vm.runInContext(swBron + '\n;({ VERSIE, NODIG, MISSCHIEN })', ctx);
  /** Een gebeurtenis afvuren zoals de browser dat doet; wacht op alles wat hij belooft. */
  async function vuur(type, extra = {}) {
    const wacht = [];
    let antwoord;
    const e = { ...extra, waitUntil: (p) => wacht.push(p), respondWith: (p) => { antwoord = p; } };
    luisteraars[type](e);
    let res, fout = null;
    try { res = await antwoord; } catch (f) { fout = f; }
    try { await Promise.all(wacht); } catch (f) { fout = fout || f; }
    const tekst = res ? await res.text() : undefined;
    return { beantwoord: antwoord !== undefined, res, tekst, fout };
  }
  const opvraag = (rel, o = {}) => ({ request: { url: new URL(rel, BASIS).href, method: 'GET', mode: 'cors', ...o } });
  return { ...vars, net, caches, self, vuur, opvraag, BASIS };
}

// eerst de lijst zelf: alles wat het spel nodig heeft, en niets wat er niet is
const { VERSIE, NODIG, MISSCHIEN } = maakSw(new Map());
check('versie in de cachenaam', /^sticky-clash-v\d+$/.test(VERSIE), VERSIE);
const weg = NODIG.filter(f => f !== './' && !bestaat(f));
check('alles in de lijst bestaat', weg.length === 0, weg.join(', '));
const nodig = [...order, 'index.html', './', 'css/style.css', 'manifest.webmanifest', 'sticky-clash.ico', ...icons.map(i => i.src)];
const mist = nodig.filter(f => !NODIG.includes(f));
check('alle modules, css, pictogrammen en manifest in de lijst', mist.length === 0, mist.length ? mist.join(', ') + ' (zet in NODIG in sw.js)' : '');
check('telefoon.html alleen als optioneel', MISSCHIEN.includes('telefoon.html') && !NODIG.includes('telefoon.html'));

// installeren, ook als een optioneel bestand ontbreekt
const bestanden = new Map(NODIG.map(f => [f, 'versie 1 van ' + f]));
const sw = maakSw(bestanden);
const inst = await sw.vuur('install');
const c = await sw.caches.open(sw.VERSIE);
check('installeren lukt zonder telefoon.html', !inst.fout && sw.self.overgeslagen === true);
check('alles opgeslagen', NODIG.every(f => c.urls().includes(new URL(f, sw.BASIS).href)), c.urls().length + ' bestanden');
check('rechtstreeks van de server (cache: reload)', sw.net.gevraagd.every(g => g.cache === 'reload'));
const opgeslagen = await c.match('js/game.js');
check('opgeslagen met "altijd navragen"', opgeslagen && opgeslagen.headers.get('Cache-Control') === 'no-cache' &&
  (await opgeslagen.text()) === 'versie 1 van js/game.js');
// staat telefoon.html er wél, dan gaat die ook mee
const metTel = maakSw(new Map([...NODIG, ...MISSCHIEN].map(f => [f, 'x'])));
const instTel = await metTel.vuur('install');
check('telefoon.html bewaard als hij er is', !instTel.fout &&
  (await metTel.caches.open(VERSIE)).urls().some(u => u.endsWith('/telefoon.html')));

// oude versies weg, andermans opslag blijft
await sw.caches.open('sticky-clash-v0');
await sw.caches.open('andere-site-op-github-io');
await sw.vuur('activate');
const namen = await sw.caches.keys();
check('oude versie gewist, andere site niet', !namen.includes('sticky-clash-v0') && namen.includes('andere-site-op-github-io') && namen.includes(sw.VERSIE));
check('neemt de open pagina meteen over', sw.self.geclaimd === true);

// netwerk eerst: een aangepast bestand is meteen te zien, en wordt de nieuwe kopie
bestanden.set('js/game.js', 'versie 2');
sw.net.gevraagd.length = 0;
let r = await sw.vuur('fetch', sw.opvraag('js/game.js'));
check('online: verse versie van de server', r.tekst === 'versie 2');
check('  die de browser niet zelf mag hergebruiken', r.res.headers.get('Cache-Control') === 'no-cache');
check('  altijd navragen (cache: no-cache)', sw.net.gevraagd.length === 1 && sw.net.gevraagd[0].cache === 'no-cache');
sw.net.offline = true;
r = await sw.vuur('fetch', sw.opvraag('js/game.js'));
check('offline: de laatst opgehaalde versie', r.tekst === 'versie 2');
r = await sw.vuur('fetch', sw.opvraag('./?x=1', { mode: 'navigate' }));
check('offline: de pagina, ook met ?… erachter', r.tekst === 'versie 1 van ./');
r = await sw.vuur('fetch', sw.opvraag('onbekend.js'));
check('offline en nooit gezien: gewoon een fout', !!r.fout);
sw.net.offline = false;
r = await sw.vuur('fetch', sw.opvraag('bestaat-niet.js'));
check('een 404 wordt niet bewaard', r.res && r.res.status === 404 && !c.urls().some(u => u.endsWith('bestaat-niet.js')));

// een gedeelde link heeft vaak ?fbclid=… erachter: die pagina wordt de kopie van ./ zelf,
// anders krijg je offline de oude pagina bij de nieuwe code
bestanden.set('./', 'versie 2 van ./');
await sw.vuur('fetch', sw.opvraag('./?fbclid=abc', { mode: 'navigate' }));
sw.net.offline = true;
r = await sw.vuur('fetch', sw.opvraag('./', { mode: 'navigate' }));
check('offline: de nieuwste pagina, ook na een link met ?…', r.tekst === 'versie 2 van ./');
check('  geen losse kopie per ?…', !c.urls().some(u => u.includes('?')));
sw.net.offline = false;
bestanden.set('index.html', 'versie 3 van index.html');
await sw.vuur('fetch', sw.opvraag('index.html', { mode: 'navigate' }));
sw.net.offline = true;
r = await sw.vuur('fetch', sw.opvraag('./', { mode: 'navigate' }));
check('  ook na openen via index.html', r.tekst === 'versie 3 van index.html');
r = await sw.vuur('fetch', sw.opvraag('index.html?x=1', { mode: 'navigate' }));
check('  en andersom', r.tekst === 'versie 3 van index.html');
sw.net.offline = false;

// andere sites (ntfy.sh) en versturen: daar blijft hij af
sw.net.gevraagd.length = 0;
r = await sw.vuur('fetch', { request: { url: 'https://ntfy.sh/iets', method: 'GET', mode: 'cors' } });
check('andere site: niet aangeraakt', !r.beantwoord && sw.net.gevraagd.length === 0);
r = await sw.vuur('fetch', sw.opvraag('js/game.js', { method: 'POST' }));
check('versturen (POST): niet aangeraakt', !r.beantwoord);

// ---------------------------------------------------------------- js/app.js

/** Draait de app.js-code in een nagebootste pagina op adres `adres`. */
function pagina(code, adres, { standalone = false, geladen = true, sw = true } = {}) {
  const aangemeld = [];
  const vak = { hidden: true };
  const klasse = (el) => ({
    add: (k) => { if (k === 'hidden') el.hidden = true; },
    remove: (k) => { if (k === 'hidden') el.hidden = false; },
  });
  vak.classList = klasse(vak);
  const knop = { onclick: null };
  const win = new EventTarget();
  const nav = sw ? { serviceWorker: { register: (u) => { aangemeld.push(u); return Promise.resolve(); } } } : {};
  const ctx = vm.createContext({
    window: win, navigator: nav, location: new URL(adres), console,
    document: { readyState: geladen ? 'complete' : 'interactive', getElementById: (id) => ({ appInstall: vak, btnInstall: knop })[id] || null },
    matchMedia: (q) => ({ matches: standalone && q.includes('standalone') }),
  });
  const f = vm.runInContext(code + '\n;({ magOffline, startApp })', ctx);
  return { ...f, aangemeld, vak, knop, win };
}

const appBron = lees('js/app.js');
check('app.js importeert niets (staat los van de rest)', !/^\s*import\s/m.test(appBron));
const deel = (los.match(/\/\/ ---- js\/app\.js\n([\s\S]*?)\n\/\/ ---- /) || [])[1];
check('app.js zit in het losse bestand', !!deel);

for (const [naam, code] of [['bron', appBron.replace(/^export\s+/gm, '')], ['los bestand', deel || '']]) {
  const t = pagina(code, 'http://localhost:8123/');
  const mag = (a, sw = true) => t.magOffline(new URL(a), sw ? { serviceWorker: {} } : {});
  check(naam + ': alleen https of deze computer', mag('https://noaquim.github.io/sticky-clash/') && mag('http://localhost:8123/') &&
    mag('http://127.0.0.1:8123/') && !mag('http://192.168.1.20:8123/') && !mag('file:///C:/spel/sticky-clash.html') &&
    !mag('https://noaquim.github.io/', false));

  const f = pagina(code, 'file:///C:/Users/iemand/sticky-clash.html');
  f.startApp();
  f.win.dispatchEvent(new Event('load'));
  check(naam + ': file:// meldt geen service worker aan', f.aangemeld.length === 0);

  const h = pagina(code, 'http://localhost:8123/', { geladen: false });
  h.startApp();
  const voor = h.aangemeld.length;
  h.win.dispatchEvent(new Event('load'));
  check(naam + ': localhost meldt sw.js aan, na het laden', voor === 0 && h.aangemeld.join() === 'sw.js');
}

// de installeerknop
const k = pagina(appBron.replace(/^export\s+/gm, ''), 'https://noaquim.github.io/sticky-clash/');
k.startApp();
check('knop eerst verborgen', k.vak.hidden === true);
let gevraagd = 0;
const bip = new Event('beforeinstallprompt', { cancelable: true });
bip.prompt = async () => { gevraagd++; return { outcome: 'accepted' }; };
k.win.dispatchEvent(bip);
check('knop zichtbaar zodra installeren kan', k.vak.hidden === false && bip.defaultPrevented);
await k.knop.onclick();
check('klik: browser vraagt het, knop weg', gevraagd === 1 && k.vak.hidden === true);
await k.knop.onclick();
check('tweede klik vraagt niet nog eens', gevraagd === 1);
k.win.dispatchEvent(bip);
k.win.dispatchEvent(new Event('appinstalled'));
check('na installeren weg', k.vak.hidden === true);
const a = pagina(appBron.replace(/^export\s+/gm, ''), 'https://noaquim.github.io/sticky-clash/', { standalone: true });
a.startApp();
a.win.dispatchEvent(Object.assign(new Event('beforeinstallprompt', { cancelable: true }), { prompt: async () => {} }));
check('als app geopend: geen knop', a.vak.hidden === true);

// ---------------------------------------------------------------- het losse bestand

check('los bestand: geen manifest', !/rel=["']manifest["']/.test(los) && !los.includes('manifest.webmanifest'));
const aanmeldingen = los.match(/serviceWorker\.register\(/g) || [];
check('los bestand: alleen de bewaakte aanmelding uit app.js', aanmeldingen.length === 1 && (deel || '').includes('serviceWorker.register('));
check('los bestand is bijgewerkt', lees('sticky-clash.html') === los);

klaar();
