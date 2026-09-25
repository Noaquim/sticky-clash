# Server voor Sticky Clash zonder iets te installeren. PowerShell zit op elke
# Windows-computer, dus dit werkt ook waar geen Node.js of Python op staat.
# Geen beheerdersrechten nodig: luisteren op localhost mag elke gebruiker.
#
# Gebruik: powershell -NoProfile -ExecutionPolicy Bypass -File serve.ps1
# (start.bat doet dat vanzelf als Node.js ontbreekt)

param([string]$Root = $PSScriptRoot, [int]$Port = 8123, [switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
$Root = [System.IO.Path]::GetFullPath($Root).TrimEnd('\') + '\'
$url = "http://localhost:$Port/"
$los = Join-Path $Root 'sticky-clash.html'
$types = @{
  '.html' = 'text/html; charset=utf-8'; '.js' = 'text/javascript; charset=utf-8'
  '.mjs' = 'text/javascript; charset=utf-8'; '.css' = 'text/css; charset=utf-8'
  '.json' = 'application/json; charset=utf-8'; '.ico' = 'image/x-icon'; '.png' = 'image/png'
  '.jpg' = 'image/jpeg'; '.svg' = 'image/svg+xml'; '.wasm' = 'application/wasm'
  '.md' = 'text/plain; charset=utf-8'
  '.gif' = 'image/gif'; '.webmanifest' = 'application/manifest+json'
}

$l = New-Object System.Net.HttpListener
$l.Prefixes.Add($url)
try { $l.Start() } catch {
  # Poort bezet. Draait het spel er al, dan alleen de pagina openen; zit er iets
  # anders, dan de losse versie. Nooit een andere poort: dan is de opgeslagen
  # kalibratie en cameratoestemming weg.
  # Beide adressen proberen: 'localhost' gaat in .NET eerst naar IPv6, terwijl de
  # Node-server alleen op IPv4 (127.0.0.1) luistert.
  $onsSpel = $false
  foreach ($probe in @("http://127.0.0.1:$Port/", $url)) {
    try {
      $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 $probe
      if ($r.Content -match '<title>Sticky Clash') { $onsSpel = $true; break }
    } catch {}
  }
  if ($onsSpel) {
    Write-Host 'Sticky Clash draait al - ik open alleen de pagina.'
    if (-not $NoBrowser) { Start-Process $url }
  } else {
    Write-Host "Poort $Port is bezet door een ander programma - ik open de losse versie."
    if (-not $NoBrowser) { Start-Process $los }
  }
  exit 0
}

Write-Host ''
Write-Host "  Sticky Clash draait op $url"
Write-Host ''
Write-Host '  Laat dit venster open zolang je speelt.'
Write-Host '  Sluiten stopt de server.'
Write-Host ''
if (-not $NoBrowser) { Start-Process $url }

while ($l.IsListening) {
  $ctx = $l.GetContext()
  $req = $ctx.Request
  $res = $ctx.Response
  try {
    $rel = [Uri]::UnescapeDataString($req.Url.AbsolutePath).TrimStart('/')
    if ($rel -eq '' -or $rel.EndsWith('/')) { $rel += 'index.html' }
    $full = [System.IO.Path]::GetFullPath((Join-Path $Root $rel))
    # buiten de projectmap serveren we niets
    if (-not $full.StartsWith($Root, [StringComparison]::OrdinalIgnoreCase) -or -not [System.IO.File]::Exists($full)) {
      $res.StatusCode = 404
      $b = [Text.Encoding]::UTF8.GetBytes('niet gevonden')
    } else {
      $ext = [System.IO.Path]::GetExtension($full).ToLowerInvariant()
      $res.ContentType = if ($types.ContainsKey($ext)) { $types[$ext] } else { 'application/octet-stream' }
      # altijd vers: anders zie je na een wijziging nog de oude versie
      $res.Headers.Add('Cache-Control', 'no-store')
      $b = [System.IO.File]::ReadAllBytes($full)
    }
    $res.ContentLength64 = $b.Length
    if ($req.HttpMethod -ne 'HEAD') { $res.OutputStream.Write($b, 0, $b.Length) }
  } catch {
    try { $res.StatusCode = 500 } catch {}
  } finally {
    try { $res.OutputStream.Close() } catch {}
  }
}
