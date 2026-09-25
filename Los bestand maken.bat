@echo off
title Sticky Clash - los bestand maken
rem Maakt sticky-clash.html opnieuw uit js/, css/ en index.html, zodat je eigen
rem aanpassingen er ook in zitten. Met Node.js als dat er is, anders met PowerShell.
cd /d "%~dp0"
where node >nul 2>&1
if %errorlevel%==0 (
  node bouw-los-bestand.mjs
) else (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0bouw-los-bestand.ps1"
)
if errorlevel 1 (
  echo.
  echo Dat lukte niet - zie de melding hierboven.
) else (
  echo.
  echo Klaar! sticky-clash.html bevat nu jouw versie. Dat bestand kun je delen.
)
echo.
pause
