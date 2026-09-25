// Achtergrondmuziek: een kort, vrolijk loopje van vier maten (drums, bas, arpeggio),
// gesynthetiseerd zoals de geluidjes in audio.js. Er zijn geen muziekbestanden.
//
// De muziek speelt alleen tijdens een ronde. Een planner kijkt elke 25 ms vooruit en
// zet de noten van de komende 0,12 s alvast klaar op de klok van de geluidskaart
// (AudioContext.currentTime), niet op de klok van de beeldjes. Hapert het spel even,
// dan loopt het ritme gewoon door: die noten stonden al klaar.

// Zelf aanpassen: het volume (hoger = harder, 0 = geen muziek) en het tempo in tellen
// per minuut.
export const MUZIEK_VOLUME = 0.18;
export const MUZIEK_TEMPO = 120;
// Laatste tien seconden: zoveel keer sneller, met extra hihats.
export const MUZIEK_SPURT = 1.25;
// Uitdaging: per level 4% sneller, hooguit 20%.
const MUZIEK_PER_LEVEL = 0.04;
const MUZIEK_LEVEL_MAX = 0.2;
export const MUZIEK_VOORUIT = 0.12;   // zo ver vooruit worden noten ingepland (s)
const MUZIEK_TIK = 25;                // zo vaak kijkt de planner (ms)
const MUZIEK_STAPPEN = 64;            // vier maten van zestien zestienden
// Het hardste instrument (de bassdrum), voor de test: muziek blijft zachter dan de geluidjes.
export const MUZIEK_LUIDST = 0.5;

// Am - F - C - G. Per maat de basnoot en vier noten voor het arpeggio, als MIDI-nummer
// (69 = de A van 440 Hz, 12 hoger = een octaaf hoger).
const MUZIEK_AKKOORDEN = [
  [45, 69, 72, 76, 81],
  [41, 65, 69, 72, 77],
  [48, 67, 72, 76, 79],
  [43, 67, 71, 74, 79],
];
// Per zestiende: welke noot van het akkoord het arpeggio speelt (1..4).
const MUZIEK_ARP = [1, 2, 3, 4, 3, 2, 3, 4, 1, 2, 3, 4, 3, 2, 4, 3];
// Per zestiende: de bas speelt de grondtoon (0), een octaaf hoger (12) of niets (-1).
const MUZIEK_BAS = [0, -1, -1, 0, -1, -1, 12, -1, 0, -1, -1, 0, -1, -1, 12, -1];

const muziekHz = (m) => 440 * Math.pow(2, (m - 69) / 12);

export class Muziek {
  constructor(sfx) {
    this.sfx = sfx;              // de Sfx uit audio.js: klok, hoofdknop, aan/uit, ruis
    this.aan = true;             // het vinkje Muziek
    this.stand = 'stil';         // 'stil' | 'speelt' | 'pauze'
    this.bus = null;             // eigen volumeknop, vóór de hoofdknop van de geluidjes
    this.timer = 0;
    this.stap = 0;               // de volgende zestiende (0..63)
    this.volgende = 0;           // wanneer die klinkt, op de klok van de geluidskaart
    this.tempo = MUZIEK_TEMPO;
    this.spurt = false;
    this.gezien = 0;             // wanneer volg() voor het laatst langskwam
    this.opNoot = null;          // voor de test: (soort, tijd) bij elke ingeplande noot
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
    const lv = Math.min(MUZIEK_LEVEL_MAX, MUZIEK_PER_LEVEL * Math.max(0, (level || 1) - 1));
    this.tempo = MUZIEK_TEMPO * (1 + lv) * (spurt ? MUZIEK_SPURT : 1);
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
    const bus = ctx.createGain();
    bus.gain.setValueAtTime(verder ? 0.0001 : MUZIEK_VOLUME, t);
    if (verder) bus.gain.exponentialRampToValueAtTime(MUZIEK_VOLUME, t + 0.35);
    bus.connect(this.sfx.master);
    this.bus = bus;
    // Een nieuwe ronde: eerst het startsignaal laten klinken.
    this.volgende = t + (verder ? 0.05 : 0.4);
    if (!this.timer) this.timer = setInterval(() => this.plan(), MUZIEK_TIK);
    this.plan();
  }

  /** Uitfaden in `fade` seconden en niets meer inplannen. */
  stop(ctx, fade) {
    if (this.timer) { clearInterval(this.timer); this.timer = 0; }
    const bus = this.bus;
    this.bus = null;
    if (!bus) return;
    const t = ctx.currentTime, g = bus.gain;
    if (g.cancelAndHoldAtTime) g.cancelAndHoldAtTime(t); else g.cancelScheduledValues(t);
    g.setTargetAtTime(0, t, fade / 3);
    // Na de staart (en de noten die al klaarstonden) de bus loskoppelen.
    setTimeout(() => bus.disconnect(), (fade + MUZIEK_VOORUIT) * 1000 + 300);
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
    const d = 15 / this.tempo;                 // een zestiende, in seconden
    if (this.volgende < nu) {
      const gemist = Math.ceil((nu - this.volgende) / d);
      this.stap = (this.stap + gemist) % MUZIEK_STAPPEN;
      this.volgende += gemist * d;
    }
    while (this.volgende < nu + MUZIEK_VOORUIT) {
      this.speel(this.stap, this.volgende, d);
      this.stap = (this.stap + 1) % MUZIEK_STAPPEN;
      this.volgende += d;
    }
  }

  /** Eén zestiende: drums, bas en arpeggio op tijd t (d = lengte van een zestiende). */
  speel(s, t, d) {
    const q = s & 15, akk = MUZIEK_AKKOORDEN[s >> 4];
    if (q % 4 === 0) this.kick(t);
    if (q === 4 || q === 12) this.snare(t);
    if (q % 4 === 2) this.hihat(t, 1);
    else if (this.spurt && q % 2 === 1) this.hihat(t, 0.6);   // de spurt: dubbel zo druk
    if (MUZIEK_BAS[q] >= 0) this.bas(muziekHz(akk[0] + MUZIEK_BAS[q]), t, d * 1.8);
    this.arp(muziekHz(akk[MUZIEK_ARP[q]]), t, d * 0.9);
  }

  // ---- de instrumenten; elk zet zijn noot direct op de muziekbus -------------------

  kick(t) {
    const ctx = this.sfx.ctx, o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    g.gain.setValueAtTime(MUZIEK_LUIDST, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    o.connect(g); g.connect(this.bus);
    o.start(t); o.stop(t + 0.2);
    if (this.opNoot) this.opNoot('kick', t);
  }

  snare(t) {
    this.ruisNoot(t, 0.13, 0.3, 1400);
    this.toon(t, 190, 0.07, 'triangle', 0.18);
    if (this.opNoot) this.opNoot('snare', t);
  }

  hihat(t, k) {
    this.ruisNoot(t, 0.04, 0.12 * k, 7000);
    if (this.opNoot) this.opNoot('hihat', t);
  }

  bas(f, t, dur) {
    this.toon(t, f, dur, 'triangle', 0.3);
    if (this.opNoot) this.opNoot('bas', t);
  }

  arp(f, t, dur) {
    this.toon(t, f, dur, 'square', 0.1, 2600);
    if (this.opNoot) this.opNoot('arp', t);
  }

  /** Ruis door een hoogdoorlaatfilter: snare en hihat. */
  ruisNoot(t, dur, gain, hp) {
    const ctx = this.sfx.ctx, src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = this.sfx.ruis(); src.loop = true;
    f.type = 'highpass'; f.frequency.value = hp;
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.bus);
    src.start(t, Math.random() * 0.4); src.stop(t + dur + 0.01);
  }

  /** Een toon met een korte aanzet; `lp` = laagdoorlaatfilter, voor een zachtere klank. */
  toon(t, f, dur, type, gain, lp) {
    const ctx = this.sfx.ctx, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    if (lp) {
      const fl = ctx.createBiquadFilter();
      fl.type = 'lowpass'; fl.frequency.value = lp;
      o.connect(fl); fl.connect(g);
    } else o.connect(g);
    g.connect(this.bus);
    o.start(t); o.stop(t + dur + 0.02);
  }
}
