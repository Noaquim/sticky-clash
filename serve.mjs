// Kleine statische server voor Sticky Clash.
//
// Start hem met `node serve.mjs` of via de snelkoppeling. Hij opent de browser pas
// als hij echt luistert. Voordeel boven het losse bestand sticky-clash.html: de
// browser onthoudt hier de toestemming voor de camera.
//
// Altijd poort 8123. Een andere poort is een ander adres voor de browser, en dan is
// de opgeslagen kalibratie en de cameratoestemming weg. Is 8123 bezet, dan kijken we
// wie daar zit: draait het spel er al, dan openen we alleen de pagina; is het iets
// anders, dan openen we het losse bestand.

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const PORT = Number(process.env.PORT) || 8123;
const URL_HIER = 'http://localhost:' + PORT + '/';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.wasm': 'application/wasm',
};

function openBrowser(target) {
  if (process.env.NO_BROWSER) return;
  // per besturingssysteem de gewone manier om iets met de standaardbrowser te openen
  const [cmd, args] =
    process.platform === 'win32' ? ['cmd', ['/c', 'start', '', target]] :
    process.platform === 'darwin' ? ['open', [target]] :
    ['xdg-open', [target]];
  try {
    spawn(cmd, args, { detached: true, stdio: 'ignore' }).unref();
  } catch {
    console.log('  Open zelf: ' + target);
  }
}

const server = createServer(async (req, res) => {
  try {
    let rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (rel.endsWith('/')) rel += 'index.html';
    const path = normalize(join(ROOT, rel));
    // buiten de projectmap serveren we niets
    if (!path.startsWith(ROOT.endsWith(sep) ? ROOT : ROOT + sep)) {
      res.writeHead(403).end('verboden');
      return;
    }
    const info = await stat(path);
    if (info.isDirectory()) { res.writeHead(404).end('niet gevonden'); return; }
    const body = await readFile(path);
    res.writeHead(200, {
      'Content-Type': TYPES[extname(path).toLowerCase()] || 'application/octet-stream',
      'Content-Length': body.length,
      // altijd vers: anders zie je na een wijziging nog de oude versie
      'Cache-Control': 'no-store',
    });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch {
    res.writeHead(404).end('niet gevonden');
  }
});

server.on('error', async (e) => {
  // EACCES krijg je op Windows als een andere server (bijvoorbeeld serve.ps1) de
  // poort via het systeem heeft gereserveerd: ook dat betekent "bezet".
  if (e.code !== 'EADDRINUSE' && e.code !== 'EACCES') {
    console.error('Kon de server niet starten:', e.message);
    openBrowser(pathToFileURL(join(ROOT, 'sticky-clash.html')).href);
    process.exit(1);
  }
  // Beide adressen proberen: "localhost" kan eerst naar IPv6 gaan terwijl de andere
  // server alleen op IPv4 luistert, en serve.ps1 antwoordt juist alleen op "localhost".
  let onsSpel = false;
  for (const probe of ['http://127.0.0.1:' + PORT + '/', URL_HIER]) {
    try {
      const html = await (await fetch(probe, { signal: AbortSignal.timeout(1500) })).text();
      if (/<title>Sticky Clash/.test(html)) { onsSpel = true; break; }
    } catch { /* geen antwoord op dit adres */ }
  }
  if (onsSpel) {
    console.log('Sticky Clash draait al — ik open alleen de pagina.');
    openBrowser(URL_HIER);
  } else {
    console.log('Poort ' + PORT + ' is bezet door een ander programma — ik open de losse versie.');
    openBrowser(pathToFileURL(join(ROOT, 'sticky-clash.html')).href);
  }
  setTimeout(() => process.exit(0), 800);
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('');
  console.log('  Sticky Clash draait op ' + URL_HIER);
  console.log('');
  console.log('  Laat dit venster open zolang je speelt.');
  console.log('  Sluiten of Ctrl+C stopt de server.');
  console.log('');
  openBrowser(URL_HIER);
});
