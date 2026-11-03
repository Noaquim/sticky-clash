// Wat deze computer en deze browser kunnen.
//
// Sticky Clash moet op elke computer werken: Windows, Mac, Linux, een Chromebook, een iPad,
// oud of nieuw, in Chrome, Edge, Firefox of Safari. Het spel raadt daarom niet aan de hand
// van de naam van de browser ("Chrome? dan werkt het"), maar vraagt hier wat er écht kan:
// volledig scherm (ook op de oude Safari-manier), een apart venster voor de beamer, en op
// welk besturingssysteem we draaien (alleen voor de goede tip in een melding).
//
// Alles krijgt mee wat het nodig heeft (een document, een navigator), zodat
// test/apparaat.mjs het in node kan nalopen.

// ---- volledig scherm. Safari vóór versie 16.4 (macOS Catalina, oudere iPads) kent alleen
// de namen met webkit ervoor; zonder deze hulpjes ging het beamervenster daar nooit op
// volledig scherm. Geef het document of element mee van het venster waar het om gaat: voor
// het beamervenster is dat app.proj.document.

/** Het element dat nu volledig scherm is in document d, of null. */
export function vsElement(d) {
  return (d && (d.fullscreenElement || d.webkitFullscreenElement)) || null;
}

/** Kan dit document volledig scherm? Een iPhone niet, een ingesloten venster soms niet. */
export function vsKan(d) {
  return !!(d && (d.fullscreenEnabled || d.webkitFullscreenEnabled));
}

/** Element el volledig scherm maken. Geeft altijd een belofte; lukt het niet, een afgewezen. */
export function vsAan(el) {
  const f = el && (el.requestFullscreen || el.webkitRequestFullscreen);
  if (!f) return Promise.reject(new Error('volledig scherm kan hier niet'));
  // de oude Safari-manier geeft niets terug; een fout kan ook meteen komen
  try { return Promise.resolve(f.call(el)); } catch (e) { return Promise.reject(e); }
}

/** Volledig scherm uit, zonder gedoe als het al uit was. */
export function vsUit(d) {
  const f = d && (d.exitFullscreen || d.webkitExitFullscreen);
  try {
    const p = f && f.call(d);
    if (p && p.catch) p.catch(() => {});
  } catch { /* stond al uit */ }
}

// ---- het apparaat

/**
 * Een iPhone, iPad of iPod, in welke browser ook: Chrome, Edge en Firefox zijn daar
 * vanbinnen allemaal Safari. Een iPad doet zich vaak voor als Mac, maar een Mac heeft
 * geen aanraakscherm. nav: navigator.
 */
export function isIOS(nav) {
  if (!nav) return false;
  const ua = nav.userAgent || '';
  return /iPhone|iPad|iPod|CriOS|FxiOS|EdgiOS/.test(ua) || (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1);
}

/**
 * Kan het spel hier een apart venster voor de beamer openen, naast het paneel? Een iPad,
 * iPhone of Android-tablet opent het als tabblad, en dan is het paneel weg zodra je het
 * beamerbeeld ziet. win: window (navigator en matchMedia).
 */
export function apartVensterKan(win) {
  if (!win) return true;
  if (isIOS(win.navigator)) return false;
  if (typeof win.matchMedia !== 'function') return true;
  const mm = (q) => { try { return win.matchMedia(q).matches; } catch { return false; } };
  // Alleen een vinger, geen muis of touchpad, op Android: een tablet of telefoon. Een
  // Windows-tablet of een Chromebook in tabletstand opent wel een echt apart venster.
  return !(besturing(win.navigator) === 'android' && mm('(pointer: coarse)') && !mm('(any-pointer: fine)'));
}

/**
 * Het besturingssysteem, alleen om de juiste tip te geven (start.bat bestaat alleen op
 * Windows, Win+P alleen daar): 'windows', 'mac', 'linux', 'chromeos', 'android', 'ios' of
 * '' als het onbekend is.
 */
export function besturing(nav) {
  if (!nav) return '';
  if (isIOS(nav)) return 'ios';
  const p = ((nav.userAgentData && nav.userAgentData.platform) || nav.platform || '') + ' ' + (nav.userAgent || '');
  if (/CrOS|Chrome OS/i.test(p)) return 'chromeos';
  if (/Android/i.test(p)) return 'android';
  if (/Win/i.test(p)) return 'windows';
  if (/Mac/i.test(p)) return 'mac';
  if (/Linux|X11|BSD/i.test(p)) return 'linux';
  return '';
}
