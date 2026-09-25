// Alle geluiden worden gesynthetiseerd, dus er zijn geen audiobestanden nodig.

export class Sfx {
  constructor() {
    this.ctx = null;
    this.on = true;
    this.last = 0;
  }

  resume() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.28;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  tone(freq, dur, type, gain, slideTo) {
    if (!this.on || !this.ctx) return;
    const t = this.ctx.currentTime;
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

  noise(dur, gain) {
    if (!this.on || !this.ctx) return;
    const t = this.ctx.currentTime;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const g = this.ctx.createGain();
    g.gain.value = gain || 0.2;
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = 900;
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t);
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

  score(combo) {
    const root = 523.25 * Math.pow(1.0595, Math.min(12, combo * 2));
    [0, 4, 7, 12].forEach((s, i) => {
      setTimeout(() => this.tone(root * Math.pow(2, s / 12), 0.18, 'square', 0.13), i * 55);
    });
    this.noise(0.14, 0.08);
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
    [392, 523.25, 784].forEach((f, i) => setTimeout(() => this.tone(f, 0.16, 'square', 0.14), i * 110));
  }

  end() {
    [784, 659, 523, 392].forEach((f, i) => setTimeout(() => this.tone(f, 0.3, 'square', 0.15), i * 160));
  }
}
