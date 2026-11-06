// Achtergrondmuziek in drie stijlen (Rustig, Vrolijk, Arcade; zie js/muziek-stijlen.js),
// gesynthetiseerd zoals de geluidjes in audio.js. Er zijn geen muziekbestanden.
//
// De muziek speelt alleen tijdens een ronde. Een planner kijkt elke 25 ms vooruit en
// zet de noten van de komende 0,12 s alvast klaar op de klok van de geluidskaart
// (AudioContext.currentTime), niet op de klok van de beeldjes. Hapert het spel even,
// dan loopt het ritme gewoon door: die noten stonden al klaar.
import { MUZIEK_STIJL_RUSTIG, MUZIEK_STIJL_VROLIJK, MUZIEK_STIJL_ARCADE } from './muziek-stijlen.js';

// Zelf aanpassen: het volume (hoger = harder, 0 = geen muziek), de stijl waarmee het spel
// begint en het tempo per stijl in tellen per minuut.
export const MUZIEK_VOLUME = 0.18;
export const MUZIEK_STANDAARD = 'arcade';
export const MUZIEK_TEMPO = { rustig: 88, vrolijk: 116, arcade: 124 };
// Laatste tien seconden: zoveel keer sneller, met extra hihats.
export const MUZIEK_SPURT = 1.25;
// Uitdaging: per level 4% sneller, hooguit 20%.
const MUZIEK_PER_LEVEL = 0.04;
const MUZIEK_LEVEL_MAX = 0.2;
export const MUZIEK_VOORUIT = 0.12;   // zo ver vooruit worden noten ingepland (s)
const MUZIEK_TIK = 25;                // zo vaak kijkt de planner (ms)
export const MUZIEK_STIJLEN = { rustig: MUZIEK_STIJL_RUSTIG, vrolijk: MUZIEK_STIJL_VROLIJK, arcade: MUZIEK_STIJL_ARCADE };
// De hoogste uitslag van de hardste stijl (gemeten), voor de test: muziek blijft zachter
// dan de geluidjes.
export const MUZIEK_LUIDST = Math.max(...Object.values(MUZIEK_STIJLEN).map(s => s.piek || s.luidst));

export class Muziek {
  constructor(sfx) {
    this.sfx = sfx;              // de Sfx uit audio.js: klok, hoofdknop, aan/uit, ruis
    this.aan = true;             // het vinkje Muziek
    this.stand = 'stil';         // 'stil' | 'speelt' | 'pauze'
    this.bus = null;             // eigen volumeknop, vóór de hoofdknop van de geluidjes
    this.vast = null;            // de vaste knopen van de stijl op deze bus (galm, compressor, ...)
    this.naam = MUZIEK_STANDAARD; // de stijl die nu klinkt
    this.wil = MUZIEK_STANDAARD;  // de gekozen stijl: wisselt bij de volgende maat
    this.timer = 0;
    this.stap = 0;               // de volgende zestiende van het lied
    this.volgende = 0;           // wanneer die klinkt, op de klok van de geluidskaart
    this.tempo = MUZIEK_TEMPO[this.naam];
    this.spurt = false;
    this.level = 1;
    this.gezien = 0;             // wanneer volg() voor het laatst langskwam
    this.opNoot = null;          // voor de test: (soort, tijd) bij elke ingeplande noot
  }

  get stijl() { return MUZIEK_STIJLEN[this.naam]; }

  /** Een andere stijl kiezen: speelt de muziek, dan bij de volgende maat, anders meteen. */
  kies(naam) {
    this.wil = MUZIEK_STIJLEN[naam] ? naam : MUZIEK_STANDAARD;
    if (!this.bus && this.wil !== this.naam) { this.naam = this.wil; this.stap = 0; }
  }

  /**
   * Elk beeldje vanuit main.js. Speelt alleen in 'play', fadet uit bij pauze en stopt
   * na de ronde. Verandert er niets, dan doet dit niets.
   */
  volg(state, spurt, level) {
    const ctx = this.sfx.ctx;
    if (!ctx) return;                          // nog geen klik geweest: nog geen geluid
    this.gezien = ctx.currentTime;
    this.spurt = !!spurt;
    this.level = level || 1;
    const lv = Math.min(MUZIEK_LEVEL_MAX, MUZIEK_PER_LEVEL * Math.max(0, (level || 1) - 1));
    this.tempo = MUZIEK_TEMPO[this.naam] * (1 + lv) * (spurt ? MUZIEK_SPURT : 1);
    const mag = this.aan && this.sfx.on;
    const wil = !mag ? 'stil' : state === 'play' ? 'speelt' : state === 'paused' ? 'pauze' : 'stil';
    if (wil === this.stand) return;
    if (wil === 'speelt') this.begin(ctx);
    else this.stop(ctx, !mag ? 0.05 : wil === 'pauze' ? 0.3 : 0.4);
    if (wil === 'stil') this.stap = 0;         // de volgende ronde begint bij de eerste maat
    this.stand = wil;
  }

  /** Beginnen, of na een pauze verder waar hij was (dan zachtjes aanzwellen). */
  begin(ctx) {
    const t = ctx.currentTime, verder = this.stand === 'pauze';
    if (this.bus) this.stop(ctx, 0.05);
    if (this.wil !== this.naam) { this.naam = this.wil; this.stap = 0; }
    this.nieuweBus(ctx, t, verder);
    // Een nieuwe ronde: eerst het startsignaal laten klinken.
    this.volgende = t + (verder ? 0.05 : 0.4);
    if (!this.timer) this.timer = setInterval(() => this.plan(), MUZIEK_TIK);
    this.plan();
  }

  /** Een eigen bus voor de stijl, met zijn vaste knopen; `zacht` = aanzwellen vanaf t. */
  nieuweBus(ctx, t, zacht) {
    const bus = ctx.createGain(), nu = ctx.currentTime;
    bus.gain.setValueAtTime(zacht ? 0.0001 : MUZIEK_VOLUME, nu);
    if (zacht) {
      if (t > nu) bus.gain.setValueAtTime(0.0001, t);
      bus.gain.exponentialRampToValueAtTime(MUZIEK_VOLUME, Math.max(t, nu) + 0.35);
    }
    bus.connect(this.sfx.master);
    this.bus = bus;
    this.vast = this.stijl.setup(ctx, bus);
  }

  /** Uitfaden in `fade` seconden en niets meer inplannen. */
  stop(ctx, fade) {
    if (this.timer) { clearInterval(this.timer); this.timer = 0; }
    this.laatGaan(ctx, ctx.currentTime, fade);
  }

  /** De bus van nu vanaf tijd t uitfaden; na de staart ruimt de stijl zijn knopen op. */
  laatGaan(ctx, t, fade) {
    const bus = this.bus, vast = this.vast, stijl = this.stijl;
    this.bus = null; this.vast = null;
    if (!bus) return;
    const g = bus.gain;
    if (g.cancelAndHoldAtTime) g.cancelAndHoldAtTime(t); else g.cancelScheduledValues(t);
    g.setTargetAtTime(0, t, fade / 3);
    // Na de staart (en de noten die al klaarstonden) de bus loskoppelen.
    const wacht = Math.max(0, t - ctx.currentTime) + fade + MUZIEK_VOORUIT;
    setTimeout(() => { stijl.dispose(vast || bus); bus.disconnect(); }, wacht * 1000 + 300);
  }

  /** De planner: alle zestienden van nu tot MUZIEK_VOORUIT vooruit inplannen. */
  plan() {
    const ctx = this.sfx.ctx;
    if (!ctx || !this.bus) return;
    const nu = ctx.currentTime;
    // Komen er geen beeldjes meer (tabblad weg, pc hangt), dan zwijgen tot ze terug zijn.
    if (nu - this.gezien > 0.5) { this.stop(ctx, 0.3); this.stand = 'pauze'; return; }
    // Liep de planner achter? Dan de gemiste zestienden overslaan in plaats van ze
    // allemaal tegelijk te spelen. De maat loopt gewoon door.
    let d = 15 / this.tempo;                   // een zestiende, in seconden
    if (this.volgende < nu) {
      const gemist = Math.ceil((nu - this.volgende) / d);
      this.stap = (this.stap + gemist) % this.lengte();
      this.volgende += gemist * d;
    }
    while (this.volgende < nu + MUZIEK_VOORUIT) {
      // Andere stijl gekozen: op de eerste tel van een maat de oude uitfaden en de nieuwe
      // vanaf zijn begin laten aanzwellen, meteen op zijn eigen tempo.
      if (this.wil !== this.naam && this.stap % this.stijl.stappenPerMaat === 0) {
        this.laatGaan(ctx, this.volgende, 0.4);
        this.tempo *= MUZIEK_TEMPO[this.wil] / MUZIEK_TEMPO[this.naam];
        d = 15 / this.tempo;
        this.naam = this.wil;
        this.stap = 0;
        this.nieuweBus(ctx, this.volgende, true);
      }
      const s = this.stijl;
      (s.speel || s.stap)(ctx, this.bus, this.stap, this.volgende, d,
        { spurt: this.spurt, level: this.level, opNoot: this.opNoot }, this.vast);
      this.stap = (this.stap + 1) % this.lengte();
      this.volgende += d;
    }
  }

  /** Zoveel zestienden duurt het lied van de stijl, daarna begint het weer bij het begin. */
  lengte() { return this.stijl.lengte || this.stijl.stappen; }
}
