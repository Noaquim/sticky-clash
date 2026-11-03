@echo off
title Sticky Clash
cd /d "%~dp0"

rem 0. Vanuit de zip gestart, of alleen dit bestand gekopieerd? Dan ontbreekt de rest.
if not exist "%~dp0sticky-clash.html" (
  echo Pak eerst de hele zip uit ^(rechtermuisknop ^> Alles uitpakken^) en start dan opnieuw.
  echo Unzip the whole zip first ^(right-click ^> Extract All^), then start again.
  echo.
  pause
  exit /b 1
)

rem 1. Node.js 16 of nieuwer staat erop: de snelste server, en de browser onthoudt de camera.
rem    Een oudere Node kan serve.mjs niet draaien: dan gewoon door naar 2.
node -e "process.exit(+process.versions.node.split('.')[0]>=16?0:1)" >nul 2>&1
if not errorlevel 1 (
  node serve.mjs
  goto :eof
)

rem 2. Geen (nieuwe) Node.js: PowerShell zit op elke Windows-computer. Zelfde server,
rem    niets te installeren, geen beheerdersrechten nodig.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0serve.ps1"
if %errorlevel%==0 goto :eof

rem 3. Mag ook dat niet (bijvoorbeeld op een beheerde schoolcomputer): het losse
rem    bestand. Dat werkt altijd; de browser vraagt dan alleen elke keer om de camera.
start "" "%~dp0sticky-clash.html"
if errorlevel 1 pause
