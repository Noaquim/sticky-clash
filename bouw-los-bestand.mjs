// Bouwt sticky-clash.html: het hele spel in één bestand, zonder server te openen.
//
// Waarom: losse module-scripts (<script type="module" src="...">) laadt een browser
// niet vanaf een dubbelgeklikt bestand (file://) — dat blokkeert hij uit veiligheid.
// Een module die ín de pagina staat werkt wél, en de camera ook. Dus zetten we alle
// code en de opmaak in één bestand. Dat kun je op een USB-stick zetten of mailen, en
// het werkt op elke computer met Chrome of Edge, zonder iets te installeren.
//
// Draai na elke wijziging aan js/, css/ of index.html:   node bouw-los-bestand.mjs
// test/losbestand.mjs controleert dat sticky-clash.html bij de broncode past.

import { readFileSync, writeFileSync } from 'node:fs';
import { join, posix } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const read = (f) => readFileSync(join(ROOT, f), 'utf8').replace(/\r\n/g, '\n');

export function bouw() {
  // 1. volgorde van de modules: afhankelijkheden eerst
  const order = [], seen = new Set();
  const IMPORT_RE = /^\s*import\s+[^'"]*from\s+['"](\.{1,2}\/[^'"]+)['"];?\s*$/gm;
  const visit = (rel) => {
    if (seen.has(rel)) return;
    seen.add(rel);
    for (const m of read(rel).matchAll(IMPORT_RE)) {
      visit(posix.normalize(posix.join(posix.dirname(rel), m[1])));
    }
    order.push(rel);
  };
  visit('js/main.js');

  // 2. import-regels en export-woorden weg; dubbele namen weigeren, want alles komt
  //    in één gezamenlijke scope te staan
  const DECL_RE = /^(?:export\s+)?(?:async\s+)?(?:const|let|var|function\*?|class)\s+([A-Za-z_$][\w$]*)/gm;
  const owner = new Map(), parts = [];
  for (const rel of order) {
    let src = read(rel);
    for (const m of src.matchAll(DECL_RE)) {
      if (owner.has(m[1])) throw new Error(`naam "${m[1]}" staat zowel in ${rel} als in ${owner.get(m[1])}`);
      owner.set(m[1], rel);
    }
    if (/^\s*export\s+(default|\{|\*)/m.test(src)) throw new Error(`${rel}: deze vorm van export kan dit bouwscript niet aan`);
    src = src.replace(/^\s*import\s+[^;]*?from\s+['"][^'"]+['"];?\s*$/gm, '').replace(/^export\s+/gm, '');
    parts.push(`// ---- ${rel}\n${src}`);
  }
  // de ingevoegde code mag het <script>-blok nooit vroegtijdig afsluiten
  const js = parts.join('\n').replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--');

  // 3. alles in de pagina zetten
  let html = read('index.html');
  // het doorverwijsblok hoort alleen in index.html; hier zou het zichzelf eindeloos herladen
  html = html.replace(/[ \t]*<!-- los:weg -->[\s\S]*?<!-- \/los:weg -->\n?/g, '');
  // het pictogram komt er ingebakken in; een verwijzing naar het losse bestand zou
  // falen als iemand alleen sticky-clash.html doorstuurt
  html = html.replace(/[ \t]*<link rel="icon" href="sticky-clash\.ico">\n?/, '');
  // installeren als app kan niet vanaf file://; de browser zou het manifest vergeefs zoeken
  html = html.replace(/[ \t]*<link rel="manifest" href="manifest\.webmanifest">\n?/, '');
  const css = read('css/style.css').replace(/<\/style/gi, '<\\/style');
  const cssTag = /<link[^>]+href=["']css\/style\.css["'][^>]*>/;
  const jsTag = /<script\s+type=["']module["'][^>]*src=["']js\/main\.js["'][^>]*><\/script>/;
  if (!cssTag.test(html) || !jsTag.test(html)) throw new Error('index.html: stylesheet- of scriptregel niet gevonden');
  let icon = '';
  try {
    icon = `<link rel="icon" href="data:image/x-icon;base64,${readFileSync(join(ROOT, 'sticky-clash.ico')).toString('base64')}">`;
  } catch { /* zonder pictogram gaat het ook */ }
  html = html
    .replace('<head>', '<head>\n<!-- Gegenereerd door bouw-los-bestand.mjs uit index.html, css/ en js/. Niet met de hand bewerken. -->')
    .replace(cssTag, () => `<style>\n${css}\n</style>\n${icon}`)
    .replace(jsTag, () => `<script type="module">\n${js}\n</script>`);
  return { html, order };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { html, order } = bouw();
  writeFileSync(join(ROOT, 'sticky-clash.html'), html);
  console.log(`sticky-clash.html geschreven: ${(html.length / 1024).toFixed(0)} KB (${order.join(' -> ')})`);
}
