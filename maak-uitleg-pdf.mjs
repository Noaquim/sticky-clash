// Maakt de uitleg om af te drukken, docs/opzetten-nl.pdf en docs/setup-en.pdf, uit uitleg.html.
//
// Draai na elke wijziging aan uitleg.html:   node maak-uitleg-pdf.mjs
//
// Nodig: Node.js 22 of nieuwer (dat kent WebSocket) en Chrome, Edge of Chromium op deze
// computer. Een andere plek? Zet het pad in CHROME:  CHROME=/pad/naar/chrome node maak-uitleg-pdf.mjs
// De browser draait onzichtbaar (headless), met een eigen tijdelijk profiel dat daarna weer
// weg is: je eigen browser, tabbladen en wachtwoorden komen er niet aan te pas. De pagina
// wordt als bestand geopend (file://), dus er is geen server nodig.
// test/uitleg.mjs controleert dat de pdf's er zijn en 1 tot 3 bladzijden hebben.

import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
export const UITLEG_PDFS = [
  { taal: 'nl', bestand: 'docs/opzetten-nl.pdf', voet: 'Sticky Clash · zo zet je het op' },
  { taal: 'en', bestand: 'docs/setup-en.pdf', voet: 'Sticky Clash · how to set it up' },
];

const pauze = (ms) => new Promise((r) => setTimeout(r, ms));

/** Chrome, Edge of Chromium: de eerste die er is. */
function zoekBrowser() {
  if (process.env.CHROME) return process.env.CHROME;
  const pf = [process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)'], process.env.LOCALAPPDATA].filter(Boolean);
  const kandidaten = [
    ...pf.map((p) => join(p, 'Google/Chrome/Application/chrome.exe')),
    ...pf.map((p) => join(p, 'Microsoft/Edge/Application/msedge.exe')),
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser',
    '/usr/bin/microsoft-edge', '/snap/bin/chromium',
  ];
  const gevonden = kandidaten.find((k) => existsSync(k));
  if (!gevonden) throw new Error('Geen Chrome, Edge of Chromium gevonden. Zet het pad in CHROME.');
  return gevonden;
}

/**
 * Start de browser onzichtbaar en geeft een verbinding (DevTools-protocol). Poort 0: de
 * browser kiest zelf een vrije poort en schrijft die in DevToolsActivePort in het profiel.
 */
async function startBrowser() {
  if (typeof WebSocket === 'undefined') throw new Error('Node.js 22 of nieuwer is nodig (WebSocket)');
  const profiel = mkdtempSync(join(tmpdir(), 'sc-uitleg-pdf-'));
  const proces = spawn(zoekBrowser(), ['--headless=new', '--remote-debugging-port=0', '--user-data-dir=' + profiel,
    '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });
  const poortBestand = join(profiel, 'DevToolsActivePort');
  let regels = null;
  for (let i = 0; i < 120 && !regels; i++) {
    await pauze(100);
    try {
      const r = readFileSync(poortBestand, 'utf8').split('\n');
      if (r[1]) regels = r;
    } catch { /* nog niet */ }
  }
  if (!regels) { proces.kill(); throw new Error('de browser startte niet'); }
  const ws = new WebSocket('ws://127.0.0.1:' + regels[0].trim() + regels[1].trim());
  await new Promise((goed, fout) => { ws.onopen = goed; ws.onerror = () => fout(new Error('geen verbinding met de browser')); });
  let id = 0;
  const wacht = new Map(), luister = [];
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && wacht.has(m.id)) { wacht.get(m.id)(m); wacht.delete(m.id); }
    else if (m.method) for (const f of luister) f(m);
  };
  const stuur = (method, params = {}, sessionId) => new Promise((goed, fout) => {
    const i = ++id;
    wacht.set(i, (m) => (m.error ? fout(new Error(method + ': ' + m.error.message)) : goed(m.result)));
    ws.send(JSON.stringify({ id: i, method, params, sessionId }));
  });
  const opBericht = (method, sessionId) => new Promise((goed) => {
    const f = (m) => { if (m.method === method && m.sessionId === sessionId) { luister.splice(luister.indexOf(f), 1); goed(m.params); } };
    luister.push(f);
  });
  async function dicht() {
    try { await stuur('Browser.close'); } catch { /* al dicht */ }
    ws.close();
    for (let i = 0; i < 20 && proces.exitCode === null; i++) await pauze(100);
    try { proces.kill(); } catch { /* al weg */ }
    // het profiel kan nog heel even bezet zijn
    for (let i = 0; i < 10; i++) {
      try { rmSync(profiel, { recursive: true, force: true }); break; } catch { await pauze(200); }
    }
  }
  return { stuur, opBericht, dicht };
}

/** Eén pdf: de pagina in de gevraagde taal laden en afdrukken zoals de printknop dat doet. */
async function maakPdf(b, sessionId, { taal, bestand, voet }) {
  const url = pathToFileURL(join(ROOT, 'uitleg.html')).href + '?taal=' + taal;
  const geladen = b.opBericht('Page.loadEventFired', sessionId);
  await b.stuur('Page.navigate', { url }, sessionId);
  await geladen;
  // wachten op de lettertypen, en controleren dat de pagina echt in die taal staat
  const r = await b.stuur('Runtime.evaluate', { expression: 'document.fonts.ready.then(() => document.documentElement.lang)', awaitPromise: true, returnByValue: true }, sessionId);
  if (r.result.value !== taal) throw new Error(bestand + ': de pagina staat in "' + r.result.value + '", niet in "' + taal + '"');
  const klein = 'font-family:Segoe UI,system-ui,sans-serif;font-size:7.5pt;color:#555';
  const pdf = await b.stuur('Page.printToPDF', {
    preferCSSPageSize: true,                       // A4 en de marges uit @page in uitleg.html
    printBackground: false,                        // zoals je het zelf afdrukt: zonder achtergronden
    displayHeaderFooter: true,
    headerTemplate: '<span></span>',
    footerTemplate: `<div style="width:100%;padding:0 12mm;display:flex;justify-content:space-between;${klein}">` +
      `<span>${voet} · noaquim.github.io/sticky-clash/uitleg.html</span>` +
      '<span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>',
  }, sessionId);
  const data = Buffer.from(pdf.data, 'base64');
  writeFileSync(join(ROOT, bestand), data);
  const bladen = (data.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
  console.log(`${bestand} geschreven: ${(data.length / 1024).toFixed(0)} KB, ${bladen} bladzijde${bladen === 1 ? '' : 'n'}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const b = await startBrowser();
  try {
    const { targetId } = await b.stuur('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await b.stuur('Target.attachToTarget', { targetId, flatten: true });
    await b.stuur('Page.enable', {}, sessionId);
    for (const p of UITLEG_PDFS) await maakPdf(b, sessionId, p);
  } finally {
    await b.dicht();
  }
}
