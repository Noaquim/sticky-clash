# Bouwt sticky-clash.html: het hele spel in één bestand. Doet precies hetzelfde als
# bouw-los-bestand.mjs, maar dan zonder Node.js — PowerShell zit in elke Windows.
# Start het via "Los bestand maken.bat", of:  powershell -ExecutionPolicy Bypass -File bouw-los-bestand.ps1
param([string]$Uit = '')
$ErrorActionPreference = 'Stop'
$Root = $PSScriptRoot
if (-not $Uit) { $Uit = Join-Path $Root 'sticky-clash.html' }
$M = [Text.RegularExpressions.RegexOptions]::Multiline

function Lees([string]$rel) {
  $t = [IO.File]::ReadAllText((Join-Path $Root $rel), [Text.Encoding]::UTF8)
  return $t.Replace("`r`n", "`n")
}
function Normaliseer([string]$pad) {
  $uit = New-Object System.Collections.Generic.List[string]
  foreach ($deel in $pad.Split('/')) {
    if ($deel -eq '.' -or $deel -eq '') { continue }
    if ($deel -eq '..') { if ($uit.Count) { $uit.RemoveAt($uit.Count - 1) }; continue }
    $uit.Add($deel)
  }
  return ($uit -join '/')
}

# 1. volgorde van de modules: afhankelijkheden eerst
$importRe = New-Object Text.RegularExpressions.Regex('^\s*import\s+[^''"]*from\s+[''"](\.{1,2}/[^''"]+)[''"];?\s*$', $M)
$volgorde = New-Object System.Collections.Generic.List[string]
$gezien = @{}
function Bezoek([string]$rel) {
  if ($gezien.ContainsKey($rel)) { return }
  $gezien[$rel] = $true
  $map = if ($rel.Contains('/')) { $rel.Substring(0, $rel.LastIndexOf('/')) } else { '' }
  foreach ($m in $importRe.Matches((Lees $rel))) {
    Bezoek (Normaliseer ($map + '/' + $m.Groups[1].Value))
  }
  $volgorde.Add($rel)
}
Bezoek 'js/main.js'

# 2. import-regels en export-woorden weg; dubbele namen weigeren, want alles komt in
#    één gezamenlijke scope te staan
$declRe = New-Object Text.RegularExpressions.Regex('^(?:export\s+)?(?:async\s+)?(?:const|let|var|function\*?|class)\s+([A-Za-z_$][\w$]*)', $M)
$exportRe = New-Object Text.RegularExpressions.Regex('^\s*export\s+(default|\{|\*)', $M)
$importWeg = New-Object Text.RegularExpressions.Regex('^\s*import\s+[^;]*?from\s+[''"][^''"]+[''"];?\s*$', $M)
$exportWeg = New-Object Text.RegularExpressions.Regex('^export\s+', $M)
$eigenaar = New-Object 'System.Collections.Generic.Dictionary[string,string]'   # hoofdlettergevoelig, zoals JavaScript
$delen = New-Object System.Collections.Generic.List[string]
foreach ($rel in $volgorde) {
  [string]$src = Lees $rel
  foreach ($m in $declRe.Matches($src)) {
    $naam = $m.Groups[1].Value
    if ($eigenaar.ContainsKey($naam)) { throw "naam `"$naam`" staat zowel in $rel als in $($eigenaar[$naam])" }
    $eigenaar[$naam] = $rel
  }
  if ($exportRe.IsMatch($src)) { throw "${rel}: deze vorm van export kan dit bouwscript niet aan" }
  $src = $importWeg.Replace($src, '')
  $src = $exportWeg.Replace($src, '')
  $delen.Add("// ---- $rel`n$src")
}
# de ingevoegde code mag het <script>-blok nooit vroegtijdig afsluiten
$js = $delen -join "`n"
$js = [Text.RegularExpressions.Regex]::Replace($js, '</script', '<\/script', 'IgnoreCase')
$js = $js.Replace('<!--', '<\!--')

# 3. alles in de pagina zetten
$html = Lees 'index.html'
$html = [Text.RegularExpressions.Regex]::Replace($html, '[ \t]*<!-- los:weg -->[\s\S]*?<!-- /los:weg -->\n?', '')
$html = (New-Object Text.RegularExpressions.Regex('[ \t]*<link rel="icon" href="sticky-clash\.ico">\n?')).Replace($html, '', 1)
$css = [Text.RegularExpressions.Regex]::Replace((Lees 'css/style.css'), '</style', '<\/style', 'IgnoreCase')
$cssTag = New-Object Text.RegularExpressions.Regex('<link[^>]+href=["'']css/style\.css["''][^>]*>')
$jsTag = New-Object Text.RegularExpressions.Regex('<script\s+type=["'']module["''][^>]*src=["'']js/main\.js["''][^>]*></script>')
if (-not $cssTag.IsMatch($html) -or -not $jsTag.IsMatch($html)) { throw 'index.html: stylesheet- of scriptregel niet gevonden' }
$icoon = ''
$icoPad = Join-Path $Root 'sticky-clash.ico'
if (Test-Path $icoPad) { $icoon = '<link rel="icon" href="data:image/x-icon;base64,' + [Convert]::ToBase64String([IO.File]::ReadAllBytes($icoPad)) + '">' }
$k = $html.IndexOf('<head>')
if ($k -ge 0) { $html = $html.Substring(0, $k) + "<head>`n<!-- Gegenereerd door bouw-los-bestand.mjs uit index.html, css/ en js/. Niet met de hand bewerken. -->" + $html.Substring($k + 6) }
$html = $cssTag.Replace($html, [Text.RegularExpressions.MatchEvaluator] { param($x) "<style>`n$css`n</style>`n$icoon" }, 1)
$html = $jsTag.Replace($html, [Text.RegularExpressions.MatchEvaluator] { param($x) "<script type=`"module`">`n$js`n</script>" }, 1)
[IO.File]::WriteAllText($Uit, $html, (New-Object Text.UTF8Encoding $false))
Write-Host ("sticky-clash.html geschreven: {0} KB ({1})" -f [math]::Round($html.Length / 1024), ($volgorde -join ' -> '))
