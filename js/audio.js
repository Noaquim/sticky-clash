// Alle geluiden worden gesynthetiseerd, dus er zijn geen audiobestanden nodig.
// De achtergrondmuziek staat in muziek.js. Die loopt via dezelfde hoofdknop (master),
// dus het vinkje Geluid zet alles tegelijk stil.

import { Muziek } from './muziek.js';

export class Sfx {
  constructor() {
    this.ctx = null;
    this.geluidAan = true;       // het vinkje Geluid, zie on
    this.last = 0;
    this.ruisBuf = null;         // een halve seconde ruis, één keer gemaakt en steeds hergebruikt
    // Per soort geluid: wanneer het laatst klonk (zie vrij). Een stapel ballen op een
    // trampoline of een regen doelpunten wordt zo geen herrie.
    this.rust = { score: -1, boing: -1, whoosh: -1, goud: -1, bonus: -1, combo: -1 };
    this.muziek = new Muziek(this);
  }

  /**
   * Het vinkje Geluid. Uit zet ook meteen stil wat al vooruit klaarstond op de klok van
   * de geluidskaart, zoals de rest van een fanfare.
   */
  get on() { return this.geluidAan; }
  set on(v) {
    this.geluidAan = !!v;
    if (this.master) this.master.gain.setTargetAtTime(this.geluidAan ? 0.28 : 0, this.ctx.currentTime, 0.01);
  }

  resume() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.geluidAan ? 0.28 : 0;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  /** Eén toon. `delay` = zoveel seconden later, op de klok van de geluidskaart. */
  tone(freq, dur, type, gain, slideTo, delay) {
    if (!this.on || !this.ctx) return;
    const t = this.ctx.currentTime + (delay || 0);
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(30, slideTo), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain || 0.25, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  /** Witte ruis voor klappen, de whoosh en de hihat van de muziek. */
  ruis() {
    if (!this.ruisBuf && this.ctx) {
      const n = Math.floor(this.ctx.sampleRate * 0.5);
      this.ruisBuf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
      const d = this.ruisBuf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    }
    return this.ruisBuf;
  }

  noise(dur, gain) {
    if (!this.on || !this.ctx) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.ruis();
    src.loop = true;
    const g = this.ctx.createGain();
    // wegsterven van vol naar niets, zoals voorheen in de ruis zelf zat
    g.gain.setValueAtTime(gain || 0.2, t);
    g.gain.linearRampToValueAtTime(0, t + dur);
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = 900;
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t, Math.random() * 0.4);
    src.stop(t + dur + 0.02);
  }

  /** Mag dit geluid al weer? Hooguit eens per `gap` seconden per soort. */
  vrij(naam, gap) {
    if (!this.on || !this.ctx) return false;
    const nu = this.ctx.currentTime;
    if (nu - this.rust[naam] < gap) return false;
    this.rust[naam] = nu;
    return true;
  }

  bounce(impact, team) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    if (now - this.last < 0.022) return;           // niet meer dan ~45 tikken per seconde
    this.last = now;
    const v = Math.min(1, impact / 900);
    const base = team === 'block' ? 420 : 620;
    this.tone(base + v * 320, 0.07, 'triangle', 0.05 + v * 0.16, base * 0.6);
  }

  /** Doelpunt: een loopje dat hoger klinkt naarmate de combo oploopt. */
  score(combo) {
    if (!this.vrij('score', 0.05)) return;
    const root = 523.25 * Math.pow(1.0595, Math.min(12, combo * 2));
    [0, 4, 7, 12].forEach((s, i) => this.tone(root * Math.pow(2, s / 12), 0.18, 'square', 0.13, 0, i * 0.055));
    this.noise(0.14, 0.08);
  }

  /**
   * Deuntje bij 3, 5 en 10 op rij (en elke 5 daarna): steeds langer, en hoger naarmate
   * de reeks langer is. Komt net na het doelpuntgeluid.
   */
  combo(n) {
    if (!this.vrij('combo', 0.3)) return;
    const root = 659.25 * Math.pow(2, Math.min(12, n) / 24);
    const loopje = n >= 10 ? [0, 4, 7, 12, 16, 19, 24] : n >= 5 ? [0, 4, 7, 11, 14] : [0, 7, 12];
    loopje.forEach((s, i) => this.tone(root * Math.pow(2, s / 12), 0.13, 'triangle', 0.16, 0, 0.22 + i * 0.055));
    if (n >= 10) this.tone(root * 4, 0.6, 'sine', 0.08, 0, 0.22 + loopje.length * 0.055);
  }

  /** Trampoline: een veer die omhoog schiet en natrilt. */
  boing() {
    if (!this.vrij('boing', 0.08)) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    const lfo = this.ctx.createOscillator(), lg = this.ctx.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(520, t + 0.07);
    o.frequency.exponentialRampToValueAtTime(230, t + 0.28);
    lfo.frequency.value = 22; lg.gain.value = 35;          // het natrillen
    lfo.connect(lg); lg.connect(o.frequency);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.22, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + 0.32);
    lfo.start(t); lfo.stop(t + 0.32);
  }

  /** Turbo: een zucht ruis die snel omhoog schuift. */
  whoosh() {
    if (!this.vrij('whoosh', 0.12)) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.ruis(); src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass'; f.Q.value = 2.5;
    f.frequency.setValueAtTime(350, t);
    f.frequency.exponentialRampToValueAtTime(3200, t + 0.22);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.3, t + 0.06);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t, Math.random() * 0.2); src.stop(t + 0.3);
  }

  /** Gouden bal in de bak: een klokje, drie heldere tonen met een lange galm. */
  goud() {
    if (!this.vrij('goud', 0.06)) return;
    [1318.5, 1975.5, 2637].forEach((f, i) => {
      this.tone(f, 0.9, 'sine', 0.16, 0, i * 0.07);
      this.tone(f * 2.76, 0.35, 'sine', 0.04, 0, i * 0.07);    // de boventoon van een klokje
    });
  }

  /** Bonusbak: een muntje, kort-lang omhoog. */
  bonus() {
    if (!this.vrij('bonus', 0.06)) return;
    this.tone(987.8, 0.08, 'square', 0.12);
    this.tone(1318.5, 0.35, 'square', 0.12, 0, 0.075);
  }

  /** Level gehaald: een kort trompetje, korter dan een tel (daarna tikt het aftellen). */
  levelGehaald() {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => this.tone(f, i === 3 ? 0.42 : 0.12, 'square', 0.13, 0, i * 0.1));
    this.tone(261.6, 0.5, 'triangle', 0.14, 0, 0.3);
  }

  /** Nieuw record: een langere fanfare met een slotakkoord. */
  record() {
    const n = [[392, 0], [523.25, 0.12], [659.25, 0.24], [783.99, 0.36], [659.25, 0.6], [783.99, 0.72]];
    n.forEach(([f, d]) => this.tone(f, 0.14, 'square', 0.13, 0, d));
    [1046.5, 1318.5, 1568].forEach(f => this.tone(f, 0.8, 'square', 0.08, 0, 0.86));
    this.tone(261.6, 0.9, 'triangle', 0.16, 0, 0.86);
  }

  /** Game over (Uitdaging): drie keer omlaag, en een lange zucht. */
  gameOver() {
    [392, 370, 349.2].forEach((f, i) => this.tone(f, 0.28, 'sawtooth', 0.11, f * 0.97, i * 0.32));
    this.tone(329.6, 0.9, 'sawtooth', 0.12, 196, 0.96);
  }

  miss() {
    this.tone(150, 0.22, 'sawtooth', 0.12, 70);
  }

  /** Een breekbare muur gaat kapot: een krak en een lage plof. */
  krak() {
    this.noise(0.22, 0.24);
    this.tone(120, 0.26, 'sawtooth', 0.12, 50);
  }

  /** Korte tik: laag tijdens het aftellen, hoog in de laatste tien seconden. */
  tick(urgent) {
    this.tone(urgent ? 1180 : 680, 0.06, 'square', 0.1);
  }

  start() {
    [392, 523.25, 784].forEach((f, i) => this.tone(f, 0.16, 'square', 0.14, 0, i * 0.11));
  }

  end() {
    [784, 659, 523, 392].forEach((f, i) => this.tone(f, 0.3, 'square', 0.15, 0, i * 0.16));
  }
}
