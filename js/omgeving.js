// Elke minuut controleren of het licht of de muur veranderd is, en of de camera de kleuren
// van de briefjes nog kan zien. Hier staat alleen het rekenwerk op metingen, zonder pagina
// en zonder camera: vision.js meet (omgevingMeting), main.js voert uit (licht afstellen, de
// muur opnieuw leren), en dit bestand beslist. Zo is elke beslissing in node na te rekenen,
// zie test/omgeving.mjs en test/muurwacht.mjs.
//
// Wat er bewust níét gebeurt:
//   - midden in een ronde iets bijstellen voor een kleine verandering: dat wacht tot de ronde
//     voorbij is. Alleen als de herkenning echt stuk is (bijna alles voorgrond, of een
//     overbelicht beeld) gaat de ronde even op pauze;
//   - de muur leren terwijl er iemand voor staat, of er een hand in beeld is: dan wachten we
//     tot het een paar seconden stil en leeg is.

/** Alle drempels op één plek. Bewust ruim: in een rustige kamer mag er nooit iets gebeuren. */
export const OMGEVING = {
  periode: 60,          // s tussen twee gewone controles
  monster: 0.5,         // s tussen twee metingen (vision.omgevingMeting)
  tau: 20,              // s: zo snel wordt een cel 'blijvend veranderd' (glijdend gemiddelde)
  blijvend: 0.85,       // ... en zo hoog moet dat gemiddelde dan zijn
  muurDeel: 0.02,       // zoveel van het beamervlak blijvend veranderd: de muur is anders
  lichtMarge: 1.3,      // de lege muur zoveel keer lichter of donkerder dan bij het leren
  lichtTau: 8,          // s: glijdend gemiddelde van de lichtfactor (vision.gain)
  flikker: 0.06,        // springt het licht gemiddeld meer dan zoveel per meting (flitsende lampen): niet op licht bijstellen
  donker: 45,           // de lege muur donkerder dan dit (0-255): meer muurverlichting
  kapotDeel: 0.45,      // zoveel van het beeld voorgrond of schaduw: de herkenning is stuk
  kapotClip: 0.12,      // zoveel meer overbelicht dan bij het leren: ook stuk
  kapotGain: 1.55,      // de lichtfactor zit tegen zijn grens (0,6 of 1,6, zie vision.fitGain): ook stuk
  kapotNa: 4,           // s achter elkaar stuk voordat er iets gebeurt
  beweging: 0.004,      // hooguit zo'n aandeel bewegende cellen heet nog 'stil'
  vrijNa: 2.5,          // s niemand in beeld en niets bewogen voordat we de muur leren
  rust: 20,             // s na bijstellen niets nieuws, behalve als het stuk is
  pogingen: 3,          // zo vaak achter elkaar mislukt: dan stoppen en het zeggen
  langeRonde: 180,      // s: duurt de ronde nog langer (of is hij zonder tijdslimiet), dan niet tot het eind wachten
  speelPauze: 240,      // s: hooguit eens per zoveel even pauzeren om midden in het spel bij te stellen
};

/**
 * Sneller, alleen voor de tests in een echte browser (?snel=6 in het adres): de minuut en het
 * 'blijvend' worden korter. Wat met mensen te maken heeft (stil en leeg, stuk) blijft gewoon.
 */
export function versnelOmgeving(o, n) {
  if (!(n > 1)) return o;
  return { ...o, periode: o.periode / n, tau: o.tau / n, lichtTau: o.lichtTau / n, rust: o.rust / n,
    speelPauze: o.speelPauze / n };
}

/**
 * Staat er iemand voor de muur, of is er een hand in beeld? Per spoor uit de herkenning, met
 * het oordeel van main.js (buildObstacles): 'telt', 'wacht', 'bak', of waarom het niet
 * meetelt ('rand', 'mens', 'huid', 'groot', …).
 *
 * Een voorwerp dat net bewogen is (een briefje dat je net ophangt) betekent dat er een hand
 * bij is. Wat afgekeurd is maar stil, star en zonder huid in beeld staat (een lichtvlek, een
 * schaduw, een groot vel) is geen mens: anders zou zo'n blijvende verandering het opnieuw
 * leren voor altijd tegenhouden. Een mens die stokstijf stilstaat lijkt daar op; die vangt
 * de bewegingsmeting (zie Omgevingswacht).
 */
export function mensachtig(t, reden) {
  if (reden === 'mens' || reden === 'huid') return true;
  if ((t.skinFrac || 0) > 0.3) return true;
  // Een flinter van een paar cellen (de zachte rand van een lichtvlek, ruis) is geen hand.
  if (!(t.cells >= 16)) return false;
  if (reden === 'wacht') return true;                       // net verschenen: nog onbekend
  if (t.age >= 12 && !t.rigid) return true;                 // ademt: een mens
  if (!(t.stillT >= 1.5)) return true;                      // beweegt nog, of net bewogen
  return false;
}

/** Telt dit spoor als voorwerp op de muur (een briefje, de bak)? Dan is het geen veranderde muur. */
export function telAlsVoorwerp(reden) {
  return reden === 'telt' || reden === 'bak';
}

/**
 * Wat er moet gebeuren, eens per halve seconde. Puur: alleen uit de metingen en de stand van
 * het spel, met dt als klok.
 *
 * meting (zie vision.omgevingMeting): gain (lichtfactor tegen de geleerde muur), deel
 * (blijvend veranderd deel van het beamervlak), bedekt (voorgrond plus schaduw), clip
 * (overbelicht deel), L (helderheid van de lege muur), beweging (aandeel bewegende cellen),
 * mensen (staat er iemand in beeld, zie mensachtig).
 * spel: ronde (er wordt gespeeld of afgeteld), lang (zonder tijdslimiet, of nog meer dan
 * langeRonde over: het eind van de ronde komt niet of pas laat), rustig (er gaat net geen bal
 * in de bak, zie main.js), magLicht (muurverlichting mag vanzelf), fill
 * en fillMax (de muurverlichting nu en hoe hoog hij kan), kleur (de kleuren hebben meer licht
 * nodig, zie kleurStap).
 *
 * Geeft { actie, open }: actie is 'niets', 'na-ronde' (onthouden, na de ronde bijstellen),
 * 'pauze' (stuk midden in een ronde: pauzeren en wachten), 'speelpauze' (een lange ronde of
 * zonder tijdslimiet: op een rustig moment even pauzeren, bijstellen en vanzelf verder;
 * hooguit eens per speelPauze seconden), 'wacht' (er staat iemand in
 * beeld), 'herstel' (nu bijstellen) of 'opgegeven' (het lukte steeds niet). open zegt wat er
 * moet: { licht, leren, kleur, reden, dringend }; reden is 'kapot', 'licht', 'muur' of 'kleur'.
 */
export class Omgevingswacht {
  constructor(o = OMGEVING) {
    this.o = o;
    this.mislukt = 0;
    this.sindsPauze = o.speelPauze;   // s sinds de laatste pauze midden in het spel (blijft over nieuw() heen)
    this.nieuw(null);
  }

  /** Net (opnieuw) geleerd: alles begint opnieuw. basis: { L, clip } van de lege muur, of null. */
  nieuw(basis) {
    this.basis = basis;
    this.klok = 0;              // s sinds de laatste gewone controle
    this.gain = 1;              // glijdend gemiddelde van de lichtfactor
    this.kapotT = 0;            // s achter elkaar stuk
    this.vrijT = 0;             // s achter elkaar niemand in beeld en niets bewogen
    this.rust = this.o.rust;
    this.open = null;
    this.gestopt = false;
    this.geenPauze = false;     // de spelers gingen zelf verder: deze ronde niet meer pauzeren
  }

  /** main.js heeft bijgesteld (ok) of het lukte niet. */
  klaar(ok) {
    if (ok) { this.mislukt = 0; return; }
    this.mislukt++;
    this.vrijT = 0;
    this.rust = this.o.rust * (1 + this.mislukt);
    if (this.mislukt >= this.o.pogingen) { this.open = null; this.gestopt = true; }
  }

  /** De spelers gingen zelf verder na een automatische pauze: dan wachten tot na de ronde. */
  nietDringend() {
    if (this.open) this.open.dringend = false;
    this.geenPauze = true;
  }

  /** Is er (nog) iets te doen? Voor de gewone controle; een stuk beeld gaat via kapotT. */
  oordeel(m, s) {
    const o = this.o, marge = Math.log(o.lichtMarge);
    const b = this.basis;
    const L = m.L;
    let licht = Math.abs(Math.log(Math.max(0.05, this.gain))) > marge;
    if (b && b.L > 8 && L > 0) licht = licht || Math.abs(Math.log(L / b.L)) > marge;
    // Te donker voor de herkenning, en de muurverlichting kan nog hoger.
    let donker = L > 0 && L < o.donker && s.magLicht && s.fill < s.fillMax - 0.01;
    // Flitsende lampen (een podium, een discobal): dan zegt het licht niets over de muur.
    // Alleen wat blijvend anders is (muur) of echt stuk is, telt dan nog.
    if ((this.flikker || 0) > o.flikker) { licht = false; donker = false; }
    const muur = m.deel > o.muurDeel;
    if (!licht && !donker && !muur) return null;
    return { licht: !!((licht || donker) && s.magLicht), leren: true, kleur: false,
      reden: licht || donker ? 'licht' : 'muur', dringend: false };
  }

  stap(m, s, dt) {
    const o = this.o;
    this.klok += dt;
    this.sindsPauze += dt;
    this.rust = Math.max(0, this.rust - dt);
    if (Number.isFinite(m.gain) && m.gain > 0) this.gain += (m.gain - this.gain) * (1 - Math.exp(-dt / o.lichtTau));
    if (m.L > 0) {
      // Hoe hard het licht van meting tot meting springt, glijdend over ~10 s. Ten opzichte
      // van de vorige meting: een lamp die aangaat is één sprong, een flitslamp steeds weer.
      // Hooguit 0,3 per meting: één lamp die aangaat telt dan als één klein sprongetje.
      // Alleen bij een redelijk lichte muur: in het donker is elke meting korrelig.
      const sprong = this.Lvorig > 0 && Math.max(m.L, this.Lvorig) > 35
        ? Math.min(0.3, Math.abs(m.L - this.Lvorig) / Math.max(35, this.Lvorig)) : 0;
      this.Lvorig = m.L;
      this.flikker = (this.flikker || 0) + (sprong - (this.flikker || 0)) * (1 - Math.exp(-dt / 10));
    }
    // Een groot vlak voorgrond telt alleen als stuk als er niemand in beeld is: staat er
    // iemand voor de muur, dan is dat gewoon iemand, en niet het licht.
    const kapot = (m.bedekt > o.kapotDeel && !m.mensen) || !!m.vloed || !(m.gain < o.kapotGain && m.gain > 1 / o.kapotGain) ||
      (!!this.basis && m.clip > this.basis.clip + o.kapotClip);
    this.kapotT = kapot ? this.kapotT + dt : 0;
    // Stil en leeg? Is het beeld stuk of het licht flink anders, dan zeggen de sporen niets meer
    // (alles is één grote vlek, of vol losse vlekjes): dan alleen op beweging.
    const anders = kapot || Math.abs(Math.log(Math.max(0.05, m.gain || 1))) > Math.log(o.lichtMarge);
    const stil = m.beweging < o.beweging && (anders || !m.mensen);
    this.vrijT = stil ? this.vrijT + dt : 0;
    if (!s.ronde) this.geenPauze = false;
    if (this.gestopt) return { actie: 'opgegeven', open: null };

    let open = this.open;
    if (this.klok >= o.periode) {
      this.klok = 0;
      const nodig = this.oordeel(m, s);
      if (nodig) open = samenOpen(open, nodig);
    }
    if (this.kapotT >= o.kapotNa) {
      // Nooit meteen midden in het spel pauzeren (iemand voor de muur, flitsende lampen):
      // alleen op een rustig moment, zoals bij de andere controles.
      open = samenOpen(open, { licht: !!s.magLicht, leren: true, kleur: false, reden: 'kapot', dringend: !s.ronde });
    }
    if (s.kleur && !(open && open.kleur)) {
      open = samenOpen(open, { licht: false, leren: true, kleur: true, reden: 'kleur', dringend: false });
    }
    this.open = open;
    if (!open) return { actie: 'niets', open: null };
    if (this.rust > 0 && !open.dringend) return { actie: 'niets', open };
    const nodigStil = o.vrijNa + (anders ? 1 : 0);
    if (s.ronde) {
      // Zonder tijdslimiet komt het eind van de ronde nooit: dan op een rustig moment (niemand
      // in beeld, geen bal vlak bij de bak) even pauzeren. Zelden: hooguit eens per speelPauze.
      if (!s.lang || !s.rustig || this.sindsPauze < o.speelPauze || this.vrijT < nodigStil) return { actie: 'na-ronde', open };
      this.open = null;
      this.rust = o.rust;
      this.sindsPauze = 0;
      return { actie: 'speelpauze', open };
    }
    if (this.vrijT < nodigStil) return { actie: 'wacht', open };
    this.open = null;
    this.rust = o.rust;
    return { actie: 'herstel', open };
  }
}

/** Twee verzoeken samen: alles wat een van beide wil, en de zwaarste reden. */
function samenOpen(a, b) {
  if (!a) return { ...b };
  const zwaar = ['kapot', 'licht', 'muur', 'kleur'];
  return {
    licht: a.licht || b.licht, leren: a.leren || b.leren, kleur: a.kleur || b.kleur,
    reden: zwaar.indexOf(a.reden) <= zwaar.indexOf(b.reden) ? a.reden : b.reden,
    dringend: a.dringend || b.dringend,
  };
}

// ---------------------------------------------------------------- kleuren in het donker
//
// In het donker ziet een camera de kleuren slecht: hij versterkt het beeld, en daarmee de
// korrel, ook in de kleur; zijn ruisfilter maakt kleuren grauwer; en het licht van de beamer
// flakkert soms van kleur. Dan wordt een oranje briefje rood (een trampoline die er geen is)
// en een grijs briefje blauw. Kunnen we de kleuren niet vertrouwen, dan tellen de speciale
// briefjes als gewone briefjes, en zegt het spel dat. Gemeten op de lege muur (zie
// vision.omgevingMeting): hoe licht (L), hoeveel de kleur van beeld tot beeld verspringt
// (ruis, in grijswaarden), hoeveel de kleur van het hele beeld meeschuift (drift), en hoeveel
// de muur van kleur verschoven is sinds hij geleerd werd (zweem: in het donker stelt de camera
// zijn witbalans bij op het gekleurde licht van de beamer).

/** Drempels voor de kleuren. Terug naar 'betrouwbaar' vraagt ruimer licht (hysterese). */
export const KLEURWACHT = {
  minL: 40,             // donkerder dan dit: geen kleuren
  terugL: 50,           // pas vanaf hier weer
  ruis: 0.075,          // kleurkorrel als deel van L: daarboven geen kleuren
  terugRuis: 0.055,
  ruisMin: 2.5,         // (onder deze kleurkorrel is het nooit te veel)
  drift: 0.12,          // de kleur van het hele beeld verspringt zoveel per meting (deel van L)
  terugDrift: 0.09,     // (het licht van een beamer flakkert altijd een beetje: ruim)
  zweem: 0.08,          // de muur zoveel van kleur verschoven sinds het leren (deel van L)
  terugZweem: 0.05,
  slechtNa: 1,          // s slecht: geen kleuren (twee keer zo slecht: meteen)
  goedNa: 4,            // s goed: weer kleuren
};

/** Een nieuwe stand: kleuren betrouwbaar tot het tegendeel gemeten is. */
export function nieuweKleurstand() {
  return { ok: true, slechtT: 0, goedT: 0, wissel: false };
}

/**
 * Is deze ene meting goed genoeg voor kleuren (true), duidelijk te slecht (false), of zit
 * hij er tussenin (null)? m: { n, L, ruis, drift, zweem } uit vision.omgevingMeting (m.kleur).
 */
export function kleurOordeel(m, k = KLEURWACHT) {
  if (!m || !(m.n > 0)) return null;
  const L = Math.max(1, m.L);
  const ruis = Math.max(0, m.ruis - k.ruisMin);
  const zweem = m.zweem || 0;
  const slecht = m.L < k.minL || ruis > k.ruis * L || m.drift > k.drift * L || zweem > k.zweem * L;
  if (slecht) return false;
  const goed = m.L >= k.terugL && ruis < k.terugRuis * L && m.drift < k.terugDrift * L && zweem < k.terugZweem * L;
  return goed ? true : null;
}

/**
 * Is deze meting zo slecht dat de kleuren meteen niet meer tellen? Twee keer over een drempel:
 * dan zou een oranje briefje binnen een paar beelden een trampoline kunnen worden. (Niet op één
 * keer verspringen: dat doet een camera ook als hij één keer zijn witbalans bijstelt.)
 */
export function kleurHeelSlecht(m, k = KLEURWACHT) {
  if (!m || !(m.n > 0)) return false;
  const L = Math.max(1, m.L), ruis = Math.max(0, m.ruis - k.ruisMin);
  return m.L < k.minL * 0.75 || ruis > 2 * k.ruis * L || (m.zweem || 0) > 2 * k.zweem * L;
}

/**
 * Eén stap van de kleurwacht, met hysterese in tijd en in drempel. Verandert st; st.wissel
 * wordt true als ok net omsloeg (main.js zet hem terug). Een meting ertussenin (null) laat de
 * klok staan: die telt niet als goed en niet als slecht.
 */
export function kleurStap(st, m, dt, k = KLEURWACHT) {
  const oordeel = kleurOordeel(m, k);
  if (oordeel === null && !(m && m.n > 0)) return st;      // niets gemeten: niets veranderen
  if (st.ok) {
    st.goedT = 0;
    if (oordeel === false) st.slechtT += dt;
    else if (oordeel === true) st.slechtT = 0;
    if (st.slechtT >= k.slechtNa || (oordeel === false && kleurHeelSlecht(m, k))) { st.ok = false; st.slechtT = 0; st.wissel = true; }
  } else {
    st.slechtT = 0;
    if (oordeel === true) st.goedT += dt;
    else if (oordeel === false) st.goedT = 0;
    if (st.goedT >= k.goedNa) { st.ok = true; st.goedT = 0; st.wissel = true; }
  }
  return st;
}

/**
 * De omtrekken van de laatste paar metingen samen, elk voorwerp één keer (zelfde midden: zelfde
 * voorwerp). Midden in het spel kan er net een bal over een briefje vliegen; dan telt dat
 * briefje even niet, maar vasthouden moet het wel (zie onderhoud in main.js).
 */
export function samenOmtrekken(lijsten) {
  const uit = [], midden = [];
  for (const lijst of lijsten) {
    for (const k of lijst) {
      let x = 0, y = 0;
      for (const c of k) { x += c[0]; y += c[1]; }
      x /= k.length; y /= k.length;
      if (midden.some(m => Math.abs(m[0] - x) < 6 && Math.abs(m[1] - y) < 6)) continue;
      midden.push([x, y]);
      uit.push(k);
    }
  }
  return uit;
}
