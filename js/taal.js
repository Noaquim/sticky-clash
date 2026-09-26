// Taal van het spel: Nederlands of Engels.
//
// De Nederlandse zin is zelf de sleutel. In de code staat t('Start ronde'); in het Engels
// wordt dat 'Start round', zoals het woordenboek in js/taal-en.js zegt. Zo blijft de code
// leesbaar, en een zin die (nog) niet in taal-en.js staat blijft gewoon Nederlands.
// Iets invullen gaat met {naam}: t('Camera actief: {naam}', { naam: label }).
//
// Welke taal: wat je bovenin koos (NL | EN, bewaard in deze browser), en anders de taal
// van de browser: begint die met "nl", dan Nederlands, anders Engels. Zonder echte pagina
// (de tests in node) altijd Nederlands: node kent ook een navigator, met de taal van de
// computer, en daar mogen de tests niet van afhangen.
//
// Wisselen gaat meteen, zonder herladen. vertaalPagina() zet de vaste teksten van
// index.html om; wie zelf teksten maakt, meldt zich met opTaal() en maakt ze opnieuw.
// Wat op de muur staat, vertaalt het spel bij het tekenen: dat wisselt vanzelf mee.

import { TAAL_EN } from './taal-en.js';

export const TAAL_OPSLAG = 'stickyclash.taal';

// Opzoeken gebeurt ook elk beeldje (de teksten op de muur): een Map is daar het snelst.
const TAAL_KAART = new Map(Object.entries(TAAL_EN));
const TAAL_ATTR = ['placeholder', 'title', 'aria-label'];
const taalVolgers = [];
// Wat t() het laatst teruggaf, en waaruit (zie tHerkomst).
const taalLaatst = { uit: '', nl: '', vars: null };
// Vaste teksten van de pagina: per tekstknoop en per attribuut het Nederlandse origineel,
// zodat heen en weer wisselen nooit iets kwijtraakt.
const taalKnopen = new WeakMap();
const taalAttrs = new WeakMap();

let taalNu = kiesTaal(taalBewaard(), taalBrowser(), taalHeeftPagina());
if (taalHeeftPagina()) document.documentElement.lang = taalNu;

function taalHeeftPagina() {
  return typeof window !== 'undefined' && typeof document !== 'undefined' && !!document.documentElement;
}

function taalBewaard() {
  try { return localStorage.getItem(TAAL_OPSLAG); } catch { return null; }   // geblokkeerd, of node
}

function taalBrowser() {
  if (typeof navigator === 'undefined' || !navigator) return '';
  return (navigator.languages && navigator.languages[0]) || navigator.language || '';
}

/** De taal bij het opstarten: de bewaarde keuze, anders die van de browser. Zonder pagina: Nederlands. */
export function kiesTaal(bewaard, browser, pagina) {
  if (!pagina) return 'nl';
  if (bewaard === 'nl' || bewaard === 'en') return bewaard;
  return /^nl/i.test(browser || '') ? 'nl' : 'en';
}

/** 'nl' of 'en'. */
export function huidigeTaal() { return taalNu; }

/**
 * De vertaling van een Nederlandse zin, met {naam} ingevuld uit vars. Staat de zin niet in
 * taal-en.js, dan blijft hij Nederlands. Een waarde in vars mag ook een functie zijn: die
 * wordt pas bij het invullen aangeroepen, zodat een vertaling ín de zin later meewisselt.
 */
export function t(nl, vars) {
  let uit = nl;
  if (taalNu === 'en') {
    const en = TAAL_KAART.get(nl);
    if (en !== undefined) uit = en;
  }
  if (vars) uit = taalVul(uit, vars);
  taalLaatst.uit = uit; taalLaatst.nl = nl; taalLaatst.vars = vars || null;
  return uit;
}

/**
 * Voor aantallen: tAantal(3, '{n} voorwerp', '{n} voorwerpen') geeft '3 voorwerpen', en in
 * het Engels '3 objects'. De eerste zin is voor precies één, de tweede voor de rest.
 */
export function tAantal(n, een, meer, vars) {
  return t(n === 1 ? een : meer, vars ? Object.assign({}, vars, { n }) : { n });
}

/** Alleen invullen, niet vertalen: {naam} wordt vars.naam. Onbekende {…} blijven staan. */
export function taalVul(tekst, vars) {
  return tekst.replace(/\{(\w+)\}/g, (heel, naam) => {
    if (!(naam in vars)) return heel;
    const v = vars[naam];
    return String(typeof v === 'function' ? v() : v);
  });
}

/**
 * Kwam `tekst` net uit t()? Dan staan in het antwoord de Nederlandse zin (nl) en de
 * waarden (vars), om hem na het wisselen van taal opnieuw te vertalen: t(h.nl, h.vars).
 * Anders null. Het is steeds hetzelfde object, dus meteen overnemen. Zo onthouden de
 * statusregel en de grote teksten op de muur waar ze vandaan kwamen, zonder dat elke
 * aanroep daar iets voor hoeft te doen.
 */
export function tHerkomst(tekst) {
  return taalLaatst.nl && tekst === taalLaatst.uit ? taalLaatst : null;
}

/**
 * Een tekst met een getal erin die elk beeldje op de muur staat, zoals 'LEVEL {n}'. Hij
 * wordt alleen opnieuw gemaakt als het getal of de taal verandert: tekenen maakt dan
 * niets nieuws aan.
 */
export class TaalTeller {
  constructor(nl) {
    this.nl = nl;
    this.n = NaN;
    this.taal = '';
    this.uit = '';
  }

  tekst(n) {
    if (n !== this.n || this.taal !== taalNu) {
      this.n = n; this.taal = taalNu;
      this.uit = t(this.nl, { n });
    }
    return this.uit;
  }
}

/** Een andere taal kiezen en onthouden. Wie zich met opTaal() meldde, maakt zijn teksten opnieuw. */
export function zetTaal(nieuw) {
  if (nieuw !== 'nl' && nieuw !== 'en') return;
  try { localStorage.setItem(TAAL_OPSLAG, nieuw); } catch { /* opslag geblokkeerd: dan alleen voor nu */ }
  if (nieuw === taalNu) return;
  taalNu = nieuw;
  if (taalHeeftPagina()) document.documentElement.lang = nieuw;
  for (const f of taalVolgers) f(nieuw);
}

/** f(taal) wordt aangeroepen na elke wissel van taal. */
export function opTaal(f) {
  taalVolgers.push(f);
}

/**
 * De vaste teksten onder `wortel` in de huidige taal zetten: tekstknopen, en de attributen
 * placeholder, title en aria-label. Alleen wat (zonder de spaties eromheen) precies in
 * taal-en.js staat; die spaties blijven. Overgeslagen: script, style, en alles met
 * translate="no", zoals de knoppen NL en EN zelf.
 */
export function vertaalPagina(wortel) {
  for (let n = wortel.firstChild; n; n = n.nextSibling) {
    if (n.nodeType === 3) taalKnoop(n);
    else if (n.nodeType === 1) {
      if (n.nodeName === 'SCRIPT' || n.nodeName === 'STYLE' || n.getAttribute('translate') === 'no') continue;
      for (const a of TAAL_ATTR) if (n.hasAttribute(a)) taalAttr(n, a);
      vertaalPagina(n);
    }
  }
}

/** Een tekst met eventueel spaties eromheen: alleen het midden vertalen. */
function taalZin(nl) {
  if (taalNu !== 'en') return nl;
  const kern = nl.trim();
  const en = kern ? TAAL_KAART.get(kern) : undefined;
  if (en === undefined) return nl;
  const voor = nl.length - nl.trimStart().length;
  return nl.slice(0, voor) + en + nl.slice(voor + kern.length);
}

// Heeft iemand de tekst intussen zelf veranderd (hij is niet meer wat wij er neerzetten),
// dan is die nieuwe tekst voortaan het origineel.
function taalKnoop(n) {
  const oud = taalKnopen.get(n);
  const nl = oud && n.data === oud.getoond ? oud.nl : n.data;
  const uit = taalZin(nl);
  if (uit !== n.data) n.data = uit;
  if (oud || uit !== nl) taalKnopen.set(n, { nl, getoond: uit });
}

function taalAttr(el, a) {
  let m = taalAttrs.get(el);
  const oud = m && m[a], nu = el.getAttribute(a);
  const nl = oud && nu === oud.getoond ? oud.nl : nu;
  const uit = taalZin(nl);
  if (uit !== nu) el.setAttribute(a, uit);
  if (oud || uit !== nl) {
    if (!m) taalAttrs.set(el, m = {});
    m[a] = { nl, getoond: uit };
  }
}
