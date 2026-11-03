#!/bin/sh
# Sticky Clash starten op een Mac.
#
# Makkelijkst: dubbelklik sticky-clash.html, of rechtermuisknop > Open met > Chrome,
# Firefox of Safari. Dit script start liever de kleine server als Node.js erop staat: dan
# onthoudt de browser de camera.
# Weigert macOS dit script ("Apple kan niet controleren..."): Systeeminstellingen >
# Privacy en beveiliging > Open toch. Of typ in Terminal:  sh start.command
cd "$(dirname "$0")" || exit 1
# Node.js 16 of nieuwer: een oudere kan serve.mjs niet draaien
if node -e 'process.exit(+process.versions.node.split(".")[0]>=16?0:1)' >/dev/null 2>&1; then
  exec node serve.mjs
fi
# Anders het losse bestand, in de eerste browser die er is. "open -a" vindt ze ook in je
# eigen map Programma's. (Geen python3: zonder de ontwikkelaarstools van Apple is dat op een
# Mac alleen een knop om iets te installeren.)
for app in "Google Chrome" "Microsoft Edge" "Firefox" "Brave Browser" "Chromium"; do
  if open -a "$app" sticky-clash.html >/dev/null 2>&1; then exit 0; fi
done
open sticky-clash.html
