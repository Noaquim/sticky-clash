// Zet een snelkoppeling naar het spel op het bureaublad.
// Draai met: node maak-snelkoppeling.mjs
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const proj = fileURLToPath(new URL('.', import.meta.url)).replace(/[\/]$/, '');
const ps = `
$proj = '${proj.replace(/'/g, "''")}'
$desktop = [Environment]::GetFolderPath('Desktop')
$ws = New-Object -ComObject WScript.Shell
$lnk = $ws.CreateShortcut((Join-Path $desktop 'Sticky Clash.lnk'))
$lnk.TargetPath = Join-Path $proj 'start.bat'
$lnk.WorkingDirectory = $proj
$lnk.IconLocation = (Join-Path $proj 'sticky-clash.ico') + ',0'
$lnk.Description = 'Start Sticky Clash - projection mapping spel'
$lnk.Save()
Write-Output (Join-Path $desktop 'Sticky Clash.lnk')
`;

if (process.platform !== 'win32') {
  console.log('Dit script maakt een Windows-snelkoppeling; op dit systeem is dat niet nodig.');
  process.exit(0);
}
const out = execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps], { encoding: 'utf8' });
console.log('Snelkoppeling gemaakt: ' + out.trim());
