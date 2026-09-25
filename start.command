#!/bin/sh
# Sticky Clash starten op een Mac.
#
# Makkelijkst: open sticky-clash.html met Chrome (rechtermuisknop > Open met > Google
# Chrome). Dit script doet hetzelfde, of start de server als Node.js erop staat.
# Is het net gekopieerd, maak het dan eerst uitvoerbaar:  chmod +x start.command
cd "$(dirname "$0")" || exit 1
if command -v node >/dev/null 2>&1; then exec node serve.mjs; fi
for app in "Google Chrome" "Microsoft Edge" "Chromium" "Brave Browser"; do
  if [ -d "/Applications/$app.app" ]; then exec open -a "$app" sticky-clash.html; fi
done
echo "Chrome of Edge niet gevonden. Safari kan de camera hier niet goed aan."
open sticky-clash.html
