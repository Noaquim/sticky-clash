// Waar je speelt. Drie manieren:
//   muur    een webcam en een beamer: de ballen vallen over je muur (de gewone opstelling)
//   scherm  geen beamer: de camera kijkt naar een tafel, muur of bord, en het spel staat
//           op dit scherm, over het camerabeeld heen
//   demo    geen camera: meteen spelen met de muis of je vinger, met briefjes op het scherm
// Hier staat alleen wat los te testen is (test/speelplek.mjs): de keuze bij het opstarten,
// de beginopstelling van de demo, de briefjes zelf, en het speelveld op een scherm. Het
// welkomstkaartje, het paneel en het speelscherm staan in js/main.js.

import { normalizePoly } from './game.js';

export const SPEELPLEKKEN = ['muur', 'scherm', 'demo'];

// Kleuren van de briefjes in de demo. Gewone briefjes krijgen een van deze kleuren;
// rood, groen en blauw zijn voor de speciale (zie KIND_STYLE in js/game.js).
export const DEMO_KLEUREN = ['#ffd84d', '#ff9f43', '#ff7eb9', '#c9a0ff', '#f1eee4'];
export const DEMO_SPECIAAL = { trampoline: '#ff4d4d', booster: '#3ddc84', breek: '#3aa0ff' };
// Meer briefjes tegelijk in de demo is alleen maar rommel.
export const DEMO_MAX = 20;
// Kleiner dan dit (in wereldeenheden, het beeld is 1000 hoog) is een tik, geen briefje.
const DEMO_MIN = 26;
// Een briefje van een streep is minstens zo dik.
const DEMO_DIK = 44;
// De beginopstelling is ontworpen op een veld van zo breed (en 1000 hoog). Een breder
// veld krijgt hem in het midden, zodat de baan op elk scherm precies zo loopt.
const DEMO_BREED = 1200;

// Hier staat het spel online: voor "Open het spel in een eigen tabblad" als de pagina
// zelf geen gewoon adres heeft.
export const SPEL_ADRES = 'https://noaquim.github.io/sticky-clash/';

/**
 * Welke speelplek bij het opstarten, en of het welkomstkaartje moet komen.
 * opgeslagen: de bewaarde instellingen (stickyclash.v5), of null. oud: is er nog een
 * oudere opslag (v4, v2)?
 *   - bewaard met een keuze: die keuze, zonder kaartje
 *   - bewaard, maar nog niets gekozen (speelplek: null): het kaartje weer
 *   - bewaard van vóór de speelplekken (geen veld speelplek), of alleen een oude opslag:
 *     wie toen al speelde, speelde met een beamer. Muur, zonder kaartje.
 *   - niets bewaard: een nieuwe speler, dus het kaartje
 * Let op: de oude versie bewaarde bij elk bezoek, ook als je meteen weer wegging. Wie
 * nooit een camera startte, niets kalibreerde en nooit scoorde, speelde dus nog niet:
 * die krijgt het kaartje ook (zie alGespeeld).
 * Geeft { plek, welkom }; plek is null zolang er gekozen moet worden.
 */
export function bepaalSpeelplek(opgeslagen, oud) {
  const s = opgeslagen && typeof opgeslagen === 'object' ? opgeslagen : null;
  if (s && 'speelplek' in s) {
    return SPEELPLEKKEN.includes(s.speelplek) ? { plek: s.speelplek, welkom: false } : { plek: null, welkom: true };
  }
  if (alGespeeld(s) || oud) return { plek: 'muur', welkom: false };
  return { plek: null, welkom: true };
}

/** Speelde iemand al met de oude versie? Een kalibratie, een camera, of een score. */
function alGespeeld(s) {
  if (!s) return false;
  const b = s.best && typeof s.best === 'object' ? s.best : {};
  return !!(s.H || s.camId || s.calCam || b.object > 0 || b.color > 0);
}

/**
 * Wat er bewaard wordt (het veld speelplek in stickyclash.v5): de keuze, of null zolang er
 * niets gekozen is. Zo komt het welkomstkaartje terug bij wie de pagina sloot zonder te
 * kiezen, en niet bij wie al koos.
 */
export function bewaarSpeelplek(plek, gekozen) {
  return gekozen && SPEELPLEKKEN.includes(plek) ? plek : null;
}

// ---------------------------------------------------------------- spelen op een scherm

/**
 * Van camerabeeld naar speelveld op een scherm. Het hele camerabeeld is het speelveld,
 * dus er valt niets te kalibreren: (0..1, 0..1) blijft (0..1, 0..1). Gespiegeld (een
 * camera die naar jou kijkt) gaan links en rechts om. Een 3×3-matrix, net als de
 * kalibratie van de beamer (zie js/homography.js).
 */
export function schermHomografie(spiegel) {
  return spiegel ? [-1, 0, 1, 0, 1, 0, 0, 0, 1] : [1, 0, 0, 0, 1, 0, 0, 0, 1];
}

/** Waar kolom u (0..1) van het camerabeeld op het scherm komt te staan. */
export function schermBeeldX(u, spiegel) {
  return spiegel ? 1 - u : u;
}

/**
 * Hoe groot het speelveld op het scherm wordt: zo groot mogelijk binnen b × h pixels.
 * Met ar de vaste verhouding (breed gedeeld door hoog, zoals die van het camerabeeld);
 * zonder (0) volgt het de ruimte, maar nooit smaller dan min of breder dan max. Op een
 * telefoon die rechtop staat wordt het dus een liggend veld: in een smal veld passen
 * de teksten op de muur niet.
 */
export function pasVeld(b, h, ar = 0, min = 1.2, max = 2.4) {
  const want = ar > 0 ? ar : Math.max(min, Math.min(max, b / Math.max(1, h)));
  let w = Math.max(2, b), hh = w / want;
  if (hh > h) { hh = Math.max(2, h); w = hh * want; }
  return { w: Math.max(2, Math.floor(w)), h: Math.max(2, Math.floor(hh)) };
}

// ---------------------------------------------------------------- de briefjes van de demo

/**
 * Een briefje: een rechthoek van w bij h rond (cx, cy), hoek graden gedraaid (met de klok
 * mee). kind is 'trampoline', 'booster', 'breek' of niets; kleur de kleur van het papier.
 * Het is meteen een obstakel voor het spel (poly, vx, vy, team).
 */
export function maakBriefje(cx, cy, w, h, hoek = 0, kind, kleur) {
  const a = hoek * Math.PI / 180, c = Math.cos(a), s = Math.sin(a), hw = w / 2, hh = h / 2;
  const hoeken = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]];
  const poly = hoeken.map(([x, y]) => [cx + x * c - y * s, cy + x * s + y * c]);
  return { team: 'object', kind: kind || undefined, kleur: kleur || (kind ? DEMO_SPECIAAL[kind] : DEMO_KLEUREN[0]),
    vx: 0, vy: 0, poly: normalizePoly(poly) };
}

/**
 * De beginopstelling van de demo, voor een veld van W breed en H hoog: waar de ballen
 * vandaan komen, waar de bak staat, en zes briefjes. Een baan die al half werkt: een
 * deel van de ballen haalt de bak, de rest mag je zelf de goede kant op sturen. Met één
 * trampoline (rood), één turbo (groen) en één blauwe muur die na vijf tikken breekt.
 * Uitgeprobeerd met test/speelplek.mjs: zo'n derde van de ballen haalt de bak.
 */
export function demoOpstelling(W, H = 1000) {
  // (smaller dan DEMO_BREED: alles iets kleiner, dan past het nog)
  const k = Math.min(1, W / DEMO_BREED);
  const x = (v) => demoMee(v, DEMO_BREED, W), y = (v) => v * H / 1000;
  const briefje = (cx, cy, w, h, hoek, kind, kleur) => maakBriefje(x(cx), y(cy), w * k, h * k, hoek, kind, kleur);
  return {
    bron: { x: x(170), y: y(70) },
    doel: { x: x(940), y: y(800), r: 110 },
    briefjes: [
      briefje(150, 330, 120, 120, 20, undefined, DEMO_KLEUREN[0]),  // geel, vlak onder de bron
      briefje(330, 430, 220, 56, 10, 'booster'),                    // turbo: schiet ze naar rechts
      briefje(690, 420, 56, 220, 0, 'breek'),                       // blauwe muur: vijf tikken
      briefje(370, 880, 200, 56, 25, 'trampoline'),                 // trampoline: omhoog, naar de bak
      briefje(110, 700, 110, 110, 25, undefined, DEMO_KLEUREN[1]),  // oranje: vangt wat links valt
      briefje(1115, 640, 110, 110, -30, undefined, DEMO_KLEUREN[2]), // roze, tegen de rechterkant
    ],
  };
}

/** Een nieuw briefje uit een sleep van a naar b (wereldcoördinaten), of null bij een tik. */
export function briefjeUitSleep(a, b, kind, kleur) {
  let x0 = Math.min(a[0], b[0]), x1 = Math.max(a[0], b[0]);
  let y0 = Math.min(a[1], b[1]), y1 = Math.max(a[1], b[1]);
  if (x1 - x0 < DEMO_MIN && y1 - y0 < DEMO_MIN) return null;
  // een streep wordt een smal briefje, geen onzichtbaar lijntje
  if (x1 - x0 < DEMO_DIK) { const m = (x0 + x1) / 2; x0 = m - DEMO_DIK / 2; x1 = m + DEMO_DIK / 2; }
  if (y1 - y0 < DEMO_DIK) { const m = (y0 + y1) / 2; y0 = m - DEMO_DIK / 2; y1 = m + DEMO_DIK / 2; }
  return maakBriefje((x0 + x1) / 2, (y0 + y1) / 2, x1 - x0, y1 - y0, 0, kind, kleur);
}

/** Omhullende rechthoek [x0, y0, x1, y1] van een veelhoek. */
export function briefjeVak(poly) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of poly) {
    if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0];
    if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1];
  }
  return [x0, y0, x1, y1];
}

/** Afstand van (x, y) tot een bolle veelhoek; 0 als het punt erin ligt. */
export function afstandTotBriefje(poly, x, y) {
  const n = poly.length;
  let binnen = true, best = Infinity;
  for (let i = 0; i < n; i++) {
    const a = poly[i], b = poly[(i + 1) % n];
    const ex = b[0] - a[0], ey = b[1] - a[1], len2 = ex * ex + ey * ey || 1e-9;
    // normalizePoly: de binnenkant ligt links van elke rand (zie collide in js/game.js)
    if (ex * (y - a[1]) - ey * (x - a[0]) < 0) binnen = false;
    let t = ((x - a[0]) * ex + (y - a[1]) * ey) / len2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const d = Math.hypot(x - (a[0] + ex * t), y - (a[1] + ey * t));
    if (d < best) best = d;
  }
  return binnen ? 0 : best;
}

/** Welk briefje ligt op (x, y), met marge speling? Het bovenste (het laatst getekende), of -1. */
export function briefjeOp(briefjes, x, y, marge = 0) {
  for (let i = briefjes.length - 1; i >= 0; i--) {
    if (afstandTotBriefje(briefjes[i].poly, x, y) <= marge) return i;
  }
  return -1;
}

/** Waar het kruisje om een briefje weg te halen staat: rechtsboven. */
export function kruisjeVan(poly) {
  const v = briefjeVak(poly);
  return [v[2], v[1]];
}

/**
 * Een briefje dx, dy verschuiven, maar nooit buiten het veld van W bij H. Geeft de
 * verschuiving die het echt werd.
 */
export function schuifBriefje(briefje, dx, dy, W, H) {
  const v = briefjeVak(briefje.poly);
  dx = Math.max(-v[0], Math.min(W - v[2], dx));
  dy = Math.max(-v[1], Math.min(H - v[3], dy));
  if (dx || dy) briefje.poly = briefje.poly.map(p => [p[0] + dx, p[1] + dy]);
  return [dx, dy];
}

/**
 * Waar x in een demoveld van oudW breed terechtkomt in een veld van nieuwW breed. Het
 * midden van de opstelling blijft in het midden, en de afstanden blijven gelijk: dan
 * loopt de baan nog precies zo. Alleen een veld smaller dan DEMO_BREED (de kleine
 * weergave rechts op een smal scherm) knijpt hem wat samen.
 */
export function demoMee(x, oudW, nieuwW) {
  const k0 = Math.min(1, oudW / DEMO_BREED), o0 = Math.max(0, (oudW - DEMO_BREED) / 2);
  const k1 = Math.min(1, nieuwW / DEMO_BREED), o1 = Math.max(0, (nieuwW - DEMO_BREED) / 2);
  return o1 + (x - o0) * k1 / k0;
}

/**
 * Het veld werd breder of smaller (speelscherm open of dicht, telefoon gedraaid): de
 * briefjes schuiven mee zoals demoMee zegt, zonder van vorm te veranderen, en blijven
 * binnen het veld.
 */
export function briefjesMee(briefjes, oudW, nieuwW, H) {
  if (!(oudW > 0) || !(nieuwW > 0)) return;
  for (const b of briefjes) {
    const v = briefjeVak(b.poly), mx = (v[0] + v[2]) / 2;
    schuifBriefje(b, demoMee(mx, oudW, nieuwW) - mx, 0, nieuwW, H);
  }
}

/**
 * Een dubbeltik op hetzelfde briefje: binnen een halve seconde (zo lang als een dubbelklik
 * in Windows), en niet ver van de eerste tik. vorig = { t, x, y, doel } van de eerste tik
 * (of null).
 */
export function dubbeltik(vorig, t, x, y, doel) {
  return !!vorig && vorig.doel === doel && t - vorig.t < 500 && Math.hypot(x - vorig.x, y - vorig.y) < 40;
}

// ---------------------------------------------------------------- kan de camera hier?

/**
 * Waarom de camera hier niet kan, of null als hij (waarschijnlijk) wel kan. Zonder iets
 * te vragen: de browser laat nog geen venster zien. env:
 *   api        bestaat navigator.mediaDevices.getUserMedia?
 *   veilig     window.isSecureContext
 *   ingesloten staat de pagina in een iframe (zoals op itch.io)?
 *   beleid     mag de camera volgens de iframe-regels (allow="camera")? true, false, of null (onbekend)
 *   geweigerd  werd de camera al eens geweigerd?
 * Antwoord: 'ingesloten' (een eigen tabblad helpt), 'onveilig' (geen https: de site
 * helpt), 'geen-api' (deze browser kan het niet) of 'geweigerd' (zelf weer toestaan).
 */
export function cameraReden(env) {
  if (env.ingesloten && (env.beleid === false || env.geweigerd)) return 'ingesloten';
  if (!env.api) return env.veilig ? 'geen-api' : 'onveilig';
  if (env.geweigerd) return 'geweigerd';
  return null;
}

/**
 * Het adres voor "Open het spel in een eigen tabblad": deze pagina zelf (zonder # erachter),
 * of de site als deze pagina geen gewoon adres heeft (about:srcdoc, blob:).
 */
export function eigenTabblad(href) {
  try {
    const u = new URL(href);
    if (u.protocol === 'http:' || u.protocol === 'https:' || u.protocol === 'file:') { u.hash = ''; return u.href; }
  } catch { /* geen geldig adres */ }
  return SPEL_ADRES;
}
