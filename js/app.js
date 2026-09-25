// Installeren als app, en daarna ook zonder internet spelen.
//
// Chrome en Edge kunnen Sticky Clash installeren als los programma: een eigen venster
// en een pictogram in het startmenu. De service worker (sw.js) bewaart een kopie van
// alle bestanden, zodat het spel daarna ook zonder internet start. Dat kan alleen via
// een echt webadres — https, of de eigen server op deze computer (start.bat) — en niet
// vanuit het losse bestand sticky-clash.html: file:// kent geen service workers.

/** Mag hier een service worker draaien? Alleen via https, of via http op deze computer zelf. */
export function magOffline(loc, nav) {
  if (!nav || !('serviceWorker' in nav)) return false;
  if (loc.protocol === 'https:') return true;
  return loc.protocol === 'http:' &&
    (loc.hostname === 'localhost' || loc.hostname === '127.0.0.1' || loc.hostname === '[::1]');
}

/** Draait het spel al als geïnstalleerde app, in een eigen venster? */
export function draaitAlsApp() {
  return (typeof matchMedia === 'function' && matchMedia('(display-mode: standalone)').matches) ||
    navigator.standalone === true;   // iPhone en iPad
}

export function startApp() {
  if (magOffline(location, navigator)) {
    // pas na het laden, zodat het bewaren van de kopie het opstarten niet ophoudt
    const aanmelden = () => navigator.serviceWorker.register('sw.js')
      .catch((e) => console.warn('Zonder internet spelen lukt hier niet:', e && e.message));
    if (document.readyState === 'complete') aanmelden();
    else window.addEventListener('load', aanmelden, { once: true });
  }

  // De knop verschijnt pas als de browser meldt dat installeren kan. Dat doet hij niet
  // als het spel al geïnstalleerd is, en nooit vanuit het losse bestand.
  const vak = document.getElementById('appInstall');
  const knop = document.getElementById('btnInstall');
  if (!vak || !knop) return;
  let verzoek = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();          // geen eigen balk van de browser: wij hebben de knop
    if (draaitAlsApp()) return;
    verzoek = e;
    vak.classList.remove('hidden');
  });
  knop.onclick = async () => {
    const v = verzoek;
    verzoek = null;              // de browser vraagt het maar één keer per melding
    vak.classList.add('hidden');
    if (!v) return;
    try { await v.prompt(); } catch { /* al gevraagd, of het venster ging niet open */ }
  };
  window.addEventListener('appinstalled', () => { verzoek = null; vak.classList.add('hidden'); });
}
