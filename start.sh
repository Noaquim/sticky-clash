#!/bin/sh
# Sticky Clash starten op Linux (ook op een Chromebook met Linux aan).
#
# Makkelijkst: open sticky-clash.html in je browser (Chrome, Chromium, Firefox of Edge).
# Dit script start liever een kleine server (Node.js 16 of nieuwer, anders Python 3): dan
# onthoudt de browser de camera. Opent dubbelklikken dit bestand in een teksteditor, typ
# dan in een terminal:  sh start.sh
cd "$(dirname "$0")" || exit 1
ADRES=http://localhost:8123/
# Node.js 16 of nieuwer: een oudere kan serve.mjs niet draaien
if node -e 'process.exit(+process.versions.node.split(".")[0]>=16?0:1)' >/dev/null 2>&1; then
  exec node serve.mjs
fi
if command -v python3 >/dev/null 2>&1; then
  # Zelf het adres noemen: Python noemt 127.0.0.1, en dat is voor de browser een ander adres
  # (dan is de kalibratie en de cameratoestemming weg).
  echo "Sticky Clash: open $ADRES in je browser (Ctrl+C stopt de server)"
  echo "Sticky Clash: open $ADRES in your browser (Ctrl+C stops the server)"
  (sleep 1; xdg-open "$ADRES" >/dev/null 2>&1) &
  exec python3 -m http.server 8123 --bind 127.0.0.1
fi
# Geen server: het losse bestand, los van deze terminal (sluit je hem, dan blijft het spel open)
for b in google-chrome google-chrome-stable chromium chromium-browser microsoft-edge brave-browser firefox; do
  if command -v "$b" >/dev/null 2>&1; then nohup "$b" "$(pwd)/sticky-clash.html" >/dev/null 2>&1 & exit 0; fi
done
echo "Open sticky-clash.html in je browser / Open sticky-clash.html in your browser"
exec xdg-open sticky-clash.html
