#!/bin/sh
# Sticky Clash starten op Linux.
# Makkelijkst: open sticky-clash.html met Chrome of Chromium.
cd "$(dirname "$0")" || exit 1
if command -v node >/dev/null 2>&1; then exec node serve.mjs; fi
for b in google-chrome google-chrome-stable chromium chromium-browser microsoft-edge brave-browser; do
  if command -v "$b" >/dev/null 2>&1; then exec "$b" "$(pwd)/sticky-clash.html"; fi
done
if command -v python3 >/dev/null 2>&1; then
  (sleep 1; xdg-open http://localhost:8123/ >/dev/null 2>&1) &
  exec python3 -m http.server 8123 --bind 127.0.0.1
fi
exec xdg-open sticky-clash.html
