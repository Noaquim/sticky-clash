// Installeren als app, en daarna ook zonder internet spelen.
//
// Chrome en Edge kunnen Sticky Clash installeren als los programma: een eigen venster
// en een pictogram in het startmenu. Safari zet het op het beginscherm of in het Dock.
// De service worker (sw.js) bewaart een kopie van alle bestanden, zodat het spel daarna
// ook zonder internet start (ook in Firefox, dat niet installeert). Dat kan alleen via
// een echt webadres — https, of de eigen server op deze computer (start.bat) — en niet
// vanuit het losse bestand sticky-clash.html: file:// kent geen service workers.

/** Mag hier een service worker draaien? Alleen via https, of via http op deze computer zelf. */
export function magOffline(loc, nav) {
  if (!nav || !('serviceWorker' in nav)) return false;
  if (loc.protocol === 'https:') return true;
  return loc.protocol === 'http:' &&
    (loc.hostname === 'localhost' || loc.hostname === '127.0.0.1' || loc.hostname === '[::1]');
}

/**
 * Safari (op een Mac, iPad of iPhone): die meldt nooit dat installeren kan, maar zet het spel
 * wel op het beginscherm of in het Dock. Chrome, Edge, Opera en Firefox noemen zich niet zo.
 */
export function safariAchtig(nav) {
  const ua = (nav && nav.userAgent) || '';
  return /Safari\//.test(ua) && !/Chrome\/|Chromium|Edg\/|OPR\//.test(ua);
}

/** Mag deze pagina iets bewaren? Met geblokkeerde cookies of opslag lukt een service worker ook niet. */
function opslagMag() {
  try { return navigator.cookieEnabled !== false && !!localStorage && localStorage.length >= 0; } catch { return false; }
}

/** Draait het spel al als geïnstalleerde app, in een eigen venster? */
export function draaitAlsApp() {
  return (typeof matchMedia === 'function' && matchMedia('(display-mode: standalone)').matches) ||
    navigator.standalone === true;   // iPhone en iPad
}

export function startApp() {
  // Het losse bestand sticky-clash.html heeft geen manifest (zie bouw-los-bestand.mjs). Dat
  // werkt al helemaal zonder internet, en hoeft niet ook nog alle losse bestanden op te halen.
  const losBestand = !document.querySelector('link[rel="manifest"]');
  // Zijn cookies en opslag geblokkeerd (streng ingestelde browser, school), dan lukt het niet
  // en geeft de browser zelf een foutmelding: dan niet eens proberen.
  if (magOffline(location, navigator) && !losBestand && opslagMag()) {
    // pas na het laden, zodat het bewaren van de kopie het opstarten niet ophoudt
    const aanmelden = () => navigator.serviceWorker.register('sw.js')
      .catch((e) => console.info('Zonder internet spelen lukt hier niet:', e && e.message));
    if (document.readyState === 'complete') aanmelden();
    else window.addEventListener('load', aanmelden, { once: true });
  }

  // De knop verschijnt pas als de browser meldt dat installeren kan. Dat doet hij niet
  // als het spel al geïnstalleerd is, en nooit vanuit het losse bestand.
  // Safari kent de installeerknop niet: dan een tip hoe het daar wél kan.
  const tip = document.getElementById('appSafari');
  if (tip && !losBestand && !('onbeforeinstallprompt' in window) && magOffline(location, navigator) &&
      !draaitAlsApp() && safariAchtig(navigator)) tip.classList.remove('hidden');
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
