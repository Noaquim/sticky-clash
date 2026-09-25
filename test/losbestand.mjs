// Het losse bestand sticky-clash.html moet precies bij de broncode passen: anders deel
// je een andere versie uit dan je test. En het moet echt op zichzelf staan.
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { check, klaar } from './hulp.mjs';

const { bouw } = await import('../bouw-los-bestand.mjs');
const pad = fileURLToPath(new URL('../sticky-clash.html', import.meta.url));

let bestand = '';
try { bestand = readFileSync(pad, 'utf8'); } catch { /* ontbreekt */ }
const { html } = bouw();

check('sticky-clash.html bestaat', bestand.length > 0);
check('sticky-clash.html is bijgewerkt (node bouw-los-bestand.mjs)', bestand === html,
  bestand === html ? '' : '(verschilt van een verse bouw — draai het bouwscript)');
check('geen doorverwijzing naar zichzelf', !/location\.replace\(['"]sticky-clash\.html/.test(html));
check('geen losse module-scripts (die laden niet vanaf file://)', !/<script[^>]+type=["']module["'][^>]+src=/.test(html));
check('geen import-regels meer', !/^\s*import\s.+from\s/m.test(html));
check('geen verwijzing naar losse css of js', !/href=["']css\//.test(html) && !/src=["']js\//.test(html));
check('pictogram ingebakken', /data:image\/x-icon;base64,/.test(html));

// de ingebakken code moet ook echt te ontleden zijn: node controleert hem als module
const m = html.match(/<script type="module">\n([\s\S]*)\n<\/script>/);
let ontleedbaar = false, fout = '';
if (m) {
  const tmp = join(mkdtempSync(join(tmpdir(), 'sc-los-')), 'ingebakken.mjs');
  writeFileSync(tmp, m[1]);
  const r = spawnSync(process.execPath, ['--check', tmp], { encoding: 'utf8' });
  ontleedbaar = r.status === 0;
  fout = (r.stderr || '').split('\n').find(l => /Error/.test(l)) || '';
}
check('ingebakken code is geldig JavaScript', ontleedbaar, fout ? '(' + fout.trim() + ')' : '');

klaar();
