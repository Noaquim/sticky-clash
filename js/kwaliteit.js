// Trage computers: het spel past zich vanzelf aan.
//
// main.js meet elk beeldje hoe lang het duurde sinds het vorige. In de eerste twee seconden
// leert deze wacht hoe vaak het scherm zelf ververst (60 keer per seconde, of 30 bij een
// oude beamer). Blijft het daarna twee seconden lang veel trager — anderhalf keer zo traag
// als het scherm én trager dan 40 ms per beeldje (minder dan 25 per seconde) — dan gaat het
// spel één stand zuiniger tekenen. Gaat het tien seconden lang weer vlot, dan een stand terug.
// Blijkt die stand terug meteen weer te zwaar, dan wacht hij de volgende keer twee keer zo
// lang: anders ging het om de paar seconden heen en weer, met elke keer een hapering.
//
//   stand 0  alles: zo start elke computer, en een gewone computer blijft hier altijd
//   stand 1  geen gloed om de ballen en de bak, geen sporen, minder confetti tegelijk, het
//            speelscherm niet extra scherp, het voorbeeld in het paneel minder vaak
//   stand 2  het speelscherm op 70% van de pixels; een camera die daarna start, start
//            kleiner (minder omrekenwerk per beeld)
//   stand 3  de herkenning hooguit 15 keer per seconde
//
// Wat de ballen doen en hoe de herkenning beslist, verandert nooit: alleen hoe mooi het
// getekend wordt en hoe vaak er gekeken wordt. Er wordt niet gemeten tijdens het instellen
// (de wizard), en niet als het venster verborgen is.
//
// Vastzetten (voor tests, of als je het zelf wilt): ?kwaliteit=vol in het adres, of in de
// console sc.kwaliteit.vast(0). sc.kwaliteit.vast(null) laat hem weer vrij.

export const KW_MAX = 3;
export const KW_LEER_MS = 2000;      // zo lang (ms) meten hoe snel het scherm ververst
export const KW_TRAAG_S = 2;         // zo lang (s) te traag: een stand zuiniger
export const KW_VLOT_S = 10;         // zo lang (s) vlot: een stand terug

export class Kwaliteit {
  constructor(niveau = 0) {
    this.niveau = Math.max(0, Math.min(KW_MAX, niveau | 0));
    this.vastNiveau = null;          // vastgezet: dan stuurt de wacht niet bij
    this.basis = 0;                  // ms per beeldje van het scherm zelf (0 = nog aan het leren)
    this.ema = 0;                    // gemiddelde tijd per beeldje (ms), langzaam bijgewerkt
    this.leer = [];                  // de eerste metingen, om basis uit te halen
    this.leerMs = 0;
    this.traag = 0;                  // zo lang (s) al te traag
    this.vlot = 0;                   // zo lang (s) al vlot
    this.vlotNodig = KW_VLOT_S;      // zo lang (s) vlot voor een stand terug (wordt langer, zie meet)
    this.sindsTerug = Infinity;      // zo lang (s) geleden de laatste stand terug
  }

  /** Een stand vastzetten (0..3), of null om hem weer vrij te laten. */
  vast(n) {
    if (n === null || n === undefined) { this.vastNiveau = null; return this.niveau; }
    this.vastNiveau = Math.max(0, Math.min(KW_MAX, n | 0));
    this.niveau = this.vastNiveau;
    this.traag = 0; this.vlot = 0;
    return this.niveau;
  }

  /** Boven deze tijd per beeldje (ms) is het te traag. */
  grens() { return Math.max(40, this.basis * 1.5); }

  /**
   * Onder deze tijd per beeldje (ms) is het weer vlot: bijna zo snel als het scherm, of in elk
   * geval 50 per seconde. Een scherm van 120 of 144 Hz haalt het spel niet altijd bij te
   * houden, en dan kwam hij anders nooit meer terug.
   */
  vlotGrens() { return Math.max(20, this.basis * 1.15); }

  /**
   * Eén beeldje: ms sinds het vorige. mag: false als er nu niet gemeten mag worden (het spel
   * stelt zich in, of het venster is verborgen). Geeft true als de stand veranderde.
   */
  meet(ms, mag) {
    if (!mag || !(ms > 0) || ms > 1000) {
      // Even niet meten. Een gat van meer dan een seconde is geen traagheid maar een pauze
      // (een ander tabblad, de computer sliep).
      this.traag = 0; this.vlot = 0;
      return false;
    }
    if (!this.basis) {
      this.leer.push(ms);
      this.leerMs += ms;
      if (this.leerMs < KW_LEER_MS) return false;
      // De middelste meting: zo vaak ververst het scherm. Niet de snelste: de klok trilt wat
      // (de camera en de rest komen soms eerst), dan leek een scherm van 60 Hz er een van
      // 70 tot 75, en kwam de wacht na een trage periode nooit meer terug. Hooguit 34 ms (30 per
      // seconde), anders zou een computer die vanaf het begin traag is zichzelf als maatstaf nemen.
      const s = this.leer.slice().sort((a, b) => a - b);
      this.basis = Math.max(4, Math.min(34, s[Math.floor(s.length / 2)]));
      this.ema = s[Math.floor(s.length / 2)];
      this.leer = null;
      return false;
    }
    this.ema += (ms - this.ema) * 0.05;
    if (this.vastNiveau !== null) return false;
    const sec = ms / 1000;
    this.sindsTerug += sec;
    this.traag = this.ema > this.grens() ? this.traag + sec : 0;
    this.vlot = this.ema < this.vlotGrens() ? this.vlot + sec : 0;
    if (this.traag >= KW_TRAAG_S && this.niveau < KW_MAX) {
      // Net een stand terug en nu alweer te traag: die stand is te zwaar voor deze computer.
      // De volgende keer twee keer zo lang wachten (hooguit een paar minuten).
      if (this.sindsTerug < KW_VLOT_S) this.vlotNodig = Math.min(this.vlotNodig * 2, 160);
      this.niveau++;
      this.traag = 0; this.vlot = 0;
      return true;
    }
    if (this.vlot >= this.vlotNodig && this.niveau > 0) {
      this.niveau--;
      this.traag = 0; this.vlot = 0; this.sindsTerug = 0;
      return true;
    }
    return false;
  }
}

/**
 * De tijd van één beeldje (ruw, in seconden) in stapjes voor het spel: elk hooguit 0,05 s,
 * anders vliegt een bal door een briefje heen, en samen hooguit 0,25 s (na een pauze). Een
 * gewoon beeldje is één stap, precies zo lang als het duurde; een traag beeldje krijgt er
 * meer, zodat het spel op een oude computer niet in slow motion loopt. stap(h) doet één stap.
 */
export function inStapjes(ruw, stap) {
  let rest = Math.min(0.25, Math.max(0, ruw));
  do { const h = Math.min(0.05, rest); stap(h); rest -= h; } while (rest > 1e-6);
}

/**
 * De stand bij het opstarten. Altijd 0 (alles), tenzij hij vastgezet is: met ?kwaliteit=vol
 * of ?kwaliteit=2 in het adres, of 'vol' in de opslag (stickyclash.kwaliteit). Bewust niet
 * de stand van de vorige keer: een computer die toen even traag was (op batterij, een
 * update op de achtergrond), begint zo gewoon weer met alles. zoek: location.search;
 * bewaard: wat in de opslag stond.
 */
export function kwaliteitBijStart(zoek, bewaard) {
  const m = /[?&]kwaliteit=([^&#]*)/.exec(zoek || '');
  const w = m ? decodeURIComponent(m[1]) : (bewaard === 'vol' ? 'vol' : '');
  if (w === 'vol') return { niveau: 0, vast: true };
  const n = parseInt(w, 10);
  return n >= 0 && n <= KW_MAX ? { niveau: n, vast: true } : { niveau: 0, vast: false };
}
