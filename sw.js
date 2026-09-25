// Service worker: laat Sticky Clash ook zonder internet starten, bijvoorbeeld als
// geïnstalleerde app. js/app.js meldt hem aan (alleen via https of localhost, nooit
// vanuit het losse bestand sticky-clash.html).
//
// Altijd eerst het netwerk. Wie een bestand aanpast en op F5 drukt, of een nieuwe versie
// op GitHub zet, ziet die dus meteen. Pas als het netwerk (of de server op deze computer)
// niet antwoordt, komt het bestand uit de opgeslagen kopie. Elke verse versie die wél
// binnenkomt, vervangt die kopie.
//
// Heeft het spel een nieuw bestand nodig? Zet het in NODIG en verhoog VERSIE.
// test/app.mjs controleert dat alles in de lijst ook echt bestaat.

const VERSIE = 'sticky-clash-v1';
const NODIG = [
  './',
  'index.html',
  'css/style.css',
  'js/main.js',
  'js/app.js',
  'js/audio.js',
  'js/game.js',
  'js/homography.js',
  'js/muziek.js',
  'js/qr.js',
  'js/telefoon.js',
  'js/vision.js',
  'manifest.webmanifest',
  'sticky-clash.ico',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
];
// mag ontbreken; dan installeert de rest gewoon
const MISSCHIEN = ['telefoon.html'];

/**
 * Een eigen kopie van het antwoord, met "Cache-Control: no-cache" erop. Anders mag de
 * browser het in dezelfde tab nog een poos zelf hergebruiken (GitHub Pages zegt "tien
 * minuten vers") en zie je na F5 toch nog de oude versie.
 */
function altijdNavragen(res) {
  const kop = new Headers(res.headers);
  kop.set('Cache-Control', 'no-cache');
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: kop });
}

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(VERSIE);
    const bewaar = async (f) => {
      // 'reload': rechtstreeks van de server, niet uit de gewone browsercache
      const res = await fetch(new Request(f, { cache: 'reload' }));
      if (res.status !== 200) throw new Error(f + ': ' + res.status);
      await cache.put(f, altijdNavragen(res));
    };
    await Promise.all(NODIG.map(bewaar));
    await Promise.all(MISSCHIEN.map((f) => bewaar(f).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    // Oude versies weg. Alleen die van ons: op github.io delen meer sites dezelfde opslag.
    for (const naam of await caches.keys()) {
      if (naam.startsWith('sticky-clash-') && naam !== VERSIE) await caches.delete(naam);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  // Alleen gewone opvragingen van onze eigen site. Al het andere (andere sites zoals
  // ntfy.sh, of iets versturen) gaat er buitenom en wordt nooit bewaard.
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(netwerkEerst(e));
});

async function netwerkEerst(e) {
  const req = e.request;
  // Een pagina bewaren we zonder wat na het ? komt (een gedeelde link krijgt vaak iets
  // als ?fbclid=… mee), en index.html onder ./ (dat is dezelfde pagina). Zo is er maar
  // één kopie van, altijd de nieuwste: anders kon je offline een oude pagina bij nieuwe
  // code krijgen.
  const sleutel = req.mode === 'navigate' ? req.url.split('?')[0].replace(/\/index\.html$/, '/') : req;
  try {
    // 'no-cache': altijd bij de server navragen, ook als de browser nog een kopie heeft
    const res = await fetch(req, { cache: 'no-cache' });
    // alleen een gewoon, geslaagd antwoord bewaren (geen 404, geen doorverwijzing)
    if (res.status !== 200 || res.type !== 'basic') return res;
    const vers = altijdNavragen(res);
    const kopie = vers.clone();
    e.waitUntil(caches.open(VERSIE).then((c) => c.put(sleutel, kopie)).catch(() => {}));
    return vers;
  } catch (fout) {
    // Geen netwerk: de opgeslagen kopie.
    const oud = await (await caches.open(VERSIE)).match(sleutel);
    if (oud) return oud;
    throw fout;
  }
}
