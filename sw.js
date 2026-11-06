// Service worker: laat Sticky Clash ook zonder internet starten, bijvoorbeeld als
// geïnstalleerde app. js/app.js meldt hem aan (alleen via https of localhost, nooit
// vanuit het losse bestand sticky-clash.html).
//
// Altijd eerst het netwerk. Wie een bestand aanpast en op F5 drukt, of een nieuwe versie
// op GitHub zet, ziet die dus meteen. Pas als het netwerk (of de server op deze computer)
// niet antwoordt, komt het bestand uit de opgeslagen kopie. Elke verse versie die wél
// binnenkomt, vervangt die kopie. Ook op een heel trage verbinding (school-wifi, 3G) wachten
// we op het netwerk: de kopie pakken zodra één bestand traag is, gaf net na een nieuwe versie
// een mengsel van oude en nieuwe bestanden, en dan startte het spel niet.
//
// Heeft het spel een nieuw bestand nodig? Zet het in NODIG en verhoog VERSIE.
// test/app.mjs controleert dat alles in de lijst ook echt bestaat.

const VERSIE = 'sticky-clash-v7';
const NODIG = [
  './',
  'index.html',
  'css/style.css',
  'js/main.js',
  'js/app.js',
  'js/apparaat.js',
  'js/audio.js',
  'js/game.js',
  'js/homography.js',
  'js/kwaliteit.js',
  'js/muziek.js',
  'js/muziek-stijlen.js',
  'js/omgeving.js',
  'js/qr.js',
  'js/speelplek.js',
  'js/taal.js',
  'js/taal-en.js',
  'js/telefoon.js',
  'js/vision.js',
  'manifest.webmanifest',
  'sticky-clash.ico',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  // de uitleg om het op te zetten (de pdf's in docs/ niet: die zijn groot, en de uitleg
  // heeft zelf een knop Afdrukken)
  'uitleg.html',
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
      // 'no-cache': de server bevestigt dat wat de browser net voor de pagina ophaalde nog
      // klopt, of stuurt het nieuwe. Zo komt niets twee keer helemaal binnen.
      const res = await fetch(new Request(f, { cache: 'no-cache' }));
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
    return await haalVers(e, req, sleutel);
  } catch (fout) {
    // Geen netwerk: de opgeslagen kopie.
    const oud = await (await caches.open(VERSIE)).match(sleutel);
    if (oud) return oud;
    throw fout;
  }
}

/** Het verse antwoord van de server; een gewoon, geslaagd antwoord wordt de nieuwe kopie. */
async function haalVers(e, req, sleutel) {
  // 'no-cache': altijd bij de server navragen, ook als de browser nog een kopie heeft
  const res = await fetch(req, { cache: 'no-cache' });
  // alleen een gewoon, geslaagd antwoord bewaren (geen 404, geen doorverwijzing)
  if (res.status !== 200 || res.type !== 'basic') return res;
  const vers = altijdNavragen(res);
  const kopie = vers.clone();
  e.waitUntil(caches.open(VERSIE).then((c) => c.put(sleutel, kopie)).catch(() => {}));
  return vers;
}
