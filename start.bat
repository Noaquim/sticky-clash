@echo off
title Sticky Clash
cd /d "%~dp0"

rem 1. Node.js staat erop: de snelste server, en de browser onthoudt de camera.
where node >nul 2>&1
if %errorlevel%==0 (
  node serve.mjs
  goto :eof
)

rem 2. Geen Node.js: PowerShell zit op elke Windows-computer. Zelfde server,
rem    niets te installeren, geen beheerdersrechten nodig.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0serve.ps1"
if %errorlevel%==0 goto :eof

rem 3. Mag ook dat niet (bijvoorbeeld op een beheerde schoolcomputer): het losse
rem    bestand. Dat werkt altijd; de browser vraagt dan alleen elke keer om de camera.
start "" "%~dp0sticky-clash.html"
