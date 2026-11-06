// De drie muziekstijlen voor de achtergrondmuziek (js/muziek.js kiest er een):
//   Rustig  - lo-fi / chillhop in F groot, 88 tellen per minuut, 40 maten
//   Vrolijk - opgewekt deuntje in C groot met marimba, 116 tellen per minuut, 32 maten
//   Arcade  - warme synthwave in a-klein, 124 tellen per minuut, 32 maten
// Elke stijl is één object met dezelfde onderdelen: setup(ctx, bus) maakt de vaste knopen
// (galm, compressor, doorlopende stemmen) één keer per muziekbus, speel/stap(...) plant één
// zestiende in, dispose(...) ruimt alles op als de bus na het uitfaden los gaat.
// Alles wordt gesynthetiseerd; er zijn geen muziekbestanden.

// Muziekstijl "Rustig" (Engels: "Chill") voor Sticky Clash: lo-fi / chillhop.
//
// Warm en ontspannen: zachte elektrische piano (Rhodes-achtig) met 7- en 9-akkoorden,
// een ronde subbas, swingende zachte drums (een kwastjes-snare, een gedempte bassdrum),
// een rustige melodie die komt en gaat, en een "bandrecorder"-gloed (laagdoorlaat,
// licht zwevende toonhoogte). F majeur, 88 tellen per minuut.
//
// Het lied (40 maten, 640 zestienden, ±1:50 op 88 BPM, daarna begint het weer bij het
// intro):
//   Intro  4 maten  Dm9 | Bbmaj9 | Gm9 | C9sus4            alleen piano, filter gaat open,
//                                                           drums vanaf maat 3
//   A      8 maten  (Fmaj9 | Dm9 | Gm9 | C13) x2           I-vi-ii-V, melodie: het thema
//   B      8 maten  Bbmaj9 | Am7 | Dm9 | Cm9 F13 |         IV-iii-vi en ii-V naar IV;
//                   Bbmaj9 | Am7 | Gm9 | C9sus4            melodie 4 maten, dan zweeft de pad
//   A'     8 maten  als A, de melodie klimt in maat 5-8, extra shaker
//   Break  4 maten  Bbmaj9 | Bbm6 | Am7 | Gm9 C9sus4        drums bijna weg, filter dicht en
//                                                           weer open, kwastroffel naar B'
//   B'     8 maten  als B, melodie gaat door, pad erbij
// Laatste tien seconden (spurt): de gastheer speelt sneller; deze stijl verdubbelt de
// drums (zestiende hihats, shaker, extra bassdrums), de bas speelt achtsten, de piano
// speelt kortere aanslagen, en er zwelt een zachte ruis-"riser" aan.
//
// Koppeling (in muziek.js):
//   const st = MUZIEK_STIJL_RUSTIG;
//   const gedeeld = st.setup(ctx, bus);       // één keer per bus (bij begin())
//   st.speel(ctx, bus, stap, t, d, { spurt, level }, gedeeld);   // elke zestiende
//   st.dispose(gedeeld);                      // als de bus na het uitfaden los gaat
//   - stap: 0 .. st.lengte-1 (de gastheer telt rond), t: tijd van de zestiende op de
//     klok van de geluidskaart, d: lengte van een zestiende in s (15 / tempo).
//   - Swing, de net-te-late snare en het strummen zitten hierbinnen: alles klinkt op of
//     ná t, nooit ervoor. Het verst na t: 0,17*d + 0,03 s.
//   - Zonder `gedeeld` zoekt speel() zelf de gedeelde knopen bij die bus (of maakt ze).
//   - dispose() is nodig: bas, melodie, piano en pad zijn doorlopende oscillators (zo
//     maakt een noot geen nieuwe knopen); dispose() stopt ze en koppelt alles los.
//   - intensiteit.opNoot(soort, t) (optioneel): voor tests, bij elke noot die klinkt,
//     met de tijd van de zestiende (zonder swing). Soorten: kick, snare, hihat, shaker,
//     crash, riser, bas, akkoord, pad, melodie.
//   - setup(ctx, bus, { zonder: [...] }) (optioneel, alleen voor metingen): groepen
//     weglaten, bv. 'drums', 'keys', 'pad', 'bas', 'mel', 'fx', 'galm', 'comp', 'chorus'.
//   - Alles is vast: zelfde stap = zelfde noten en klanken (geen Math.random).
//   - Uitgang: ±-20 LUFS, piekt rond 0,4 (zie `piek`), zoals de oude muziek; met een
//     zachte compressor aan het eind. Het volume (MUZIEK_VOLUME) en het vinkje Geluid
//     regelt de gastheer.
//   - Rekenwerk: ±47 vaste knopen per bus, per drumslag 2 nieuwe (een buffer en zijn
//     sterkte), verder niets per noot. De drumklanken worden één keer per geluidskaart
//     uitgerekend, één per zestiende tijdens het intro (elk hooguit een paar ms).

export const MUZIEK_STIJL_RUSTIG = (() => {
  const TEMPO = 88;
  const SWING = 0.17;          // oneven zestienden zoveel zestiende later (± 58 % swing)
  const SNARE_LAAT = 0.012;    // de snare net achter de tel: lui, laid back
  const UIT = 0.61;            // eindvolume ná de compressor: even luid als de oude muziek (±-20 LUFS)

  const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
  // Vast "toeval": dezelfde (a, b) geeft altijd hetzelfde getal tussen 0 en 1.
  const hasj = (a, b) => {
    let h = Math.imul((a | 0) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(((b | 0) + 0x632be5ab) | 0, 0xc2b2ae35);
    h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12; h = Math.imul(h, 0x297a2d39); h ^= h >>> 15;
    return (h >>> 0) / 4294967296;
  };
  const zaad = (s) => () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  // ---- harmonie: per akkoord de basnoot en vier pianonoten (MIDI, 60 = middelste C) --
  // De pianonoten liggen tussen F3 en A4 en schuiven zo weinig mogelijk (stemvoering).
  const AKK = {
    Fmaj9:  [41, [57, 60, 64, 67]],   // F  | A C E G
    Dm9:    [38, [53, 57, 60, 64]],   // D  | F A C E
    Gm9:    [43, [58, 62, 65, 69]],   // G  | Bb D F A
    C13:    [36, [58, 62, 64, 69]],   // C  | Bb D E A
    C9sus:  [36, [58, 62, 65, 67]],   // C  | Bb D F G
    Bbmaj9: [46, [57, 60, 62, 65]],   // Bb | A C D F
    Am7:    [45, [55, 60, 64, 69]],   // A  | G C E A
    Cm9:    [36, [51, 55, 58, 62]],   // C  | Eb G Bb D
    F13:    [41, [51, 57, 62, 67]],   // F  | Eb A D G
    Bbm6:   [46, [55, 58, 61, 65]],   // Bb | G Bb Db F   (de geleende mineur-vier)
  };

  // ---- melodie: per maat [zestiende, MIDI, lengte in zestienden] ---------------------
  const THEMA = [                                   // A: over Fmaj9 | Dm9 | Gm9 | C13 (x2)
    [[2, 69, 2], [4, 72, 2], [6, 76, 6], [12, 74, 2], [14, 72, 2]],
    [[0, 74, 4], [4, 69, 8]],
    [[2, 70, 2], [4, 74, 2], [6, 77, 6], [12, 76, 2], [14, 74, 2]],
    [[0, 76, 4], [4, 72, 4], [8, 69, 6]],
    [[2, 69, 2], [4, 72, 2], [6, 76, 6], [12, 74, 2], [14, 72, 2]],
    [[0, 74, 4], [4, 69, 8]],
    [[2, 70, 2], [4, 74, 2], [6, 77, 4], [10, 79, 2], [12, 77, 2], [14, 76, 2]],
    [[0, 76, 6], [6, 74, 2], [8, 72, 8]],
  ];
  const KLIM = [                                    // A' maat 5-8: hoger, de top van het lied
    [[2, 72, 2], [4, 76, 2], [6, 79, 6], [12, 77, 2], [14, 76, 2]],
    [[0, 77, 4], [4, 74, 8]],
    [[2, 74, 2], [4, 77, 2], [6, 81, 6], [12, 79, 2], [14, 77, 2]],
    [[0, 76, 4], [4, 74, 2], [6, 72, 10]],
  ];
  const MEL_B = [                                   // B: lange noten, dan rust (de pad zweeft)
    [[2, 74, 2], [4, 77, 8], [12, 72, 4]],
    [[0, 76, 6], [6, 74, 2], [8, 72, 8]],
    [[2, 69, 2], [4, 72, 2], [6, 76, 10]],
    [[0, 75, 4], [4, 74, 4], [8, 72, 4], [12, 69, 4]],
    [], [], [],
    [[8, 65, 2], [10, 67, 2], [12, 70, 2], [14, 72, 2]],
  ];
  const MEL_B2 = [                                  // B' maat 5-8: de melodie gaat door
    [[2, 74, 2], [4, 77, 2], [6, 81, 6], [12, 79, 4]],
    [[0, 79, 6], [6, 76, 2], [8, 72, 8]],
    [[2, 70, 2], [4, 74, 2], [6, 77, 6], [12, 76, 4]],
    [[0, 74, 4], [4, 72, 12]],
  ];
  const MEL_BREAK = [
    [[2, 69, 2], [4, 72, 2], [6, 74, 10]],
    [[2, 70, 2], [4, 73, 2], [6, 77, 10]],
    [[2, 72, 2], [4, 76, 10]],
    [],
  ];

  // ---- ritmes ----------------------------------------------------------------------
  // Piano: [zestiende, lengte, aanslag]. In een maat met twee akkoorden telt vanaf
  // zestiende 8 het tweede akkoord.
  const KEYS = {
    lang:     [[0, 16, 0.78]],
    halfLang: [[0, 8, 0.74], [8, 8, 0.7]],
    comp1:    [[0, 7, 0.82], [7, 3, 0.42], [10, 6, 0.66]],
    comp2:    [[0, 6, 0.78], [6, 4, 0.5], [12, 4, 0.6]],
    compB:    [[0, 10, 0.78], [10, 6, 0.55]],
    half:     [[0, 6, 0.78], [6, 2, 0.42], [8, 6, 0.74], [14, 2, 0.42]],
    spurt:    [[0, 3, 0.78], [3, 3, 0.45], [6, 4, 0.6], [10, 3, 0.68], [13, 3, 0.45]],
  };
  // Bas: [zestiende, interval boven de grondtoon ('N' = aanloop naar het volgende
  // akkoord), lengte, aanslag].
  const BAS = {
    geen:     [],
    lang:     [[0, 0, 15, 0.9]],
    halfLang: [[0, 0, 8, 0.9], [8, 0, 8, 0.85]],
    groove:   [[0, 0, 6, 1], [7, 0, 2, 0.5], [10, 0, 4, 0.85], [14, 'N', 2, 0.6]],
    groove2:  [[0, 0, 7, 1], [10, 0, 3, 0.8], [13, 7, 1, 0.45], [14, 'N', 2, 0.62]],
    half:     [[0, 0, 6, 1], [6, 12, 2, 0.5], [8, 0, 6, 0.9], [14, 'N', 2, 0.6]],
    spurt:    [[0, 0, 3, 1], [4, 12, 2, 0.55], [6, 0, 2, 0.75], [10, 0, 2, 0.85], [12, 12, 2, 0.55], [14, 'N', 2, 0.7]],
  };
  // Drums per maat: per zestiende de sterkte (0 = niets) van bassdrum, snare, hihat,
  // shaker, en of de hihat open is.
  function drums(soort, oneven, slot) {
    const n = () => new Array(16).fill(0);
    const k = n(), s = n(), h = n(), sh = n(), open = n();
    const achtsten = (a) => { for (let q = 0; q < 16; q += 2) h[q] = a * [1, 0.62, 0.9, 0.62][(q / 2) % 4]; };
    if (soort === 'vol' || soort === 'vol2' || soort === 'vol3' || soort === 'spurt') {
      achtsten(0.5);
      k[0] = 1; k[10] = 0.8;
      s[4] = 1; s[12] = 1;
      if (oneven) { s[9] = 0.13; s[15] = 0.2; } else s[7] = 0.12;
      if (soort === 'vol' || soort === 'vol3') { if (oneven) { k[7] = 0.5; h[15] = 0.16; } }
      if (soort === 'vol2') { k[3] = 0.4; open[14] = 1; for (let q = 1; q < 16; q += 2) sh[q] = 0.2; }
      if (soort === 'vol3') for (let q = 1; q < 16; q += 2) sh[q] = 0.17;
      if (soort === 'spurt') {
        k[7] = 0.5; k[14] = 0.42; s[9] = 0.14; s[15] = 0.22;
        for (let q = 1; q < 16; q += 2) { h[q] = 0.26; sh[q] = 0.18; }
      }
      if (slot && soort !== 'spurt') { s[13] = 0.16; s[14] = 0.26; s[15] = 0.34; }
    } else if (soort === 'licht' || soort === 'licht2') {
      k[0] = 0.7; achtsten(0.26);
      if (soort === 'licht2') { k[10] = 0.5; s[12] = 0.45; s[14] = 0.18; s[15] = 0.26; }
    } else if (soort === 'break1') {
      for (let q = 1; q < 16; q += 2) sh[q] = 0.1;
    } else if (soort === 'break2') {
      k[0] = 0.55; achtsten(0.2);
      for (let q = 1; q < 16; q += 2) sh[q] = 0.11;
    } else if (soort === 'roffel') {
      k[0] = 0.6; achtsten(0.2);
      for (let q = 8; q < 16; q++) { h[q] = 0; s[q] = 0.07 + (q - 8) * 0.045; }
    }
    return { k, s, h, sh, open };
  }

  // ---- het lied: 40 maten ----------------------------------------------------------
  const VORM = [];
  const SECTIES = [];
  const maat = (sectie, akk, o) => {
    const m = Object.assign({ sectie, akk: akk.split(' ').map(n => AKK[n]), drum: 'stil', keys: 'lang',
      bas: 'lang', pad: 0, mel: [], filter: 5200, crash: 0 }, o);
    if (m.akk.length > 1 && m.keys === 'lang') m.keys = 'halfLang';
    else if (m.akk.length > 1) m.keys = 'half';
    if (m.akk.length > 1) m.bas = m.bas === 'lang' ? 'halfLang' : 'half';
    VORM.push(m);
  };
  const sectie = (naam, f) => { const van = VORM.length; f(); SECTIES.push({ naam, van: van * 16, tot: VORM.length * 16 }); };
  const A = ['Fmaj9', 'Dm9', 'Gm9', 'C13'];
  const B = ['Bbmaj9', 'Am7', 'Dm9', 'Cm9 F13', 'Bbmaj9', 'Am7', 'Gm9', 'C9sus'];
  sectie('intro', () => {
    maat('intro', 'Dm9', { bas: 'geen', pad: 0.6, filter: 1100 });
    maat('intro', 'Bbmaj9', { pad: 0.6, filter: 1900 });
    maat('intro', 'Gm9', { drum: 'licht', keys: 'comp2', bas: 'groove', pad: 0.35, filter: 3000 });
    maat('intro', 'C9sus', { drum: 'licht2', pad: 0.35, filter: 4200 });
  });
  sectie('A', () => {
    for (let i = 0; i < 8; i++) maat('A', A[i % 4], { drum: 'vol', keys: i % 2 ? 'comp2' : 'comp1', bas: 'groove',
      mel: THEMA[i], crash: i === 0 ? 0.6 : 0, slot: i === 7 });
  });
  sectie('B', () => {
    for (let i = 0; i < 8; i++) maat('B', B[i], { drum: 'vol2', keys: 'compB', bas: 'groove2',
      pad: i < 4 ? 0.35 : 0.9, mel: MEL_B[i], filter: 4600, slot: i === 7 });
  });
  sectie('A2', () => {
    for (let i = 0; i < 8; i++) maat('A2', A[i % 4], { drum: 'vol3', keys: i % 2 ? 'comp2' : 'comp1', bas: 'groove',
      mel: i < 4 ? THEMA[i] : KLIM[i - 4], crash: i === 0 ? 1 : 0, slot: i === 7 });
  });
  sectie('break', () => {
    const BR = ['Bbmaj9', 'Bbm6', 'Am7', 'Gm9 C9sus'];
    const DR = ['break1', 'break1', 'break2', 'roffel'];
    const FI = [900, 1000, 1700, 4400];
    for (let i = 0; i < 4; i++) maat('break', BR[i], { drum: DR[i], pad: 1, mel: MEL_BREAK[i], filter: FI[i] });
  });
  sectie('B2', () => {
    for (let i = 0; i < 8; i++) maat('B2', B[i], { drum: 'vol2', keys: 'compB', bas: 'groove2', pad: 0.6,
      mel: i < 4 ? MEL_B[i] : MEL_B2[i - 4], filter: 4600, crash: i === 0 ? 0.8 : 0, slot: i === 7 });
  });
  const LENGTE = VORM.length * 16;
  // Per maat de melodie per zestiende, en het drumritme (gewoon en in de spurt).
  for (let i = 0; i < VORM.length; i++) {
    const m = VORM[i];
    m.melOp = new Array(16).fill(null);
    for (const n of m.mel) m.melOp[n[0]] = n;
    m.dr = drums(m.drum, i % 2 === 1, !!m.slot);
    m.drSpurt = drums('spurt', i % 2 === 1, false);
    m.vol = m.drum === 'vol' || m.drum === 'vol2' || m.drum === 'vol3';
  }

  // ---- buffers en golfvormen: één keer per geluidskaart ------------------------------
  const perKaart = new WeakMap();
  function kaartSpul(ctx) {
    let c = perKaart.get(ctx);
    if (c) return c;
    const sr = ctx.sampleRate, r = zaad(20251106);
    // een seconde witte ruis voor de riser in de spurt
    const ruis = ctx.createBuffer(1, Math.floor(sr), sr);
    const rd = ruis.getChannelData(0);
    for (let i = 0; i < rd.length; i++) rd[i] = r() * 2 - 1;
    // galm: ruis die in ±1,1 s uitsterft en steeds doffer wordt (een kleine kamer). Mono,
    // want dat is half zoveel rekenwerk; de breedte komt van een kleine vertraging rechts.
    const n = Math.floor(sr * 1.0), pre = Math.floor(sr * 0.014);
    const galm = ctx.createBuffer(1, n, sr);
    {
      const x = galm.getChannelData(0);
      let y = 0;
      for (let i = pre; i < n; i++) {
        const tt = (i - pre) / sr;
        const a = 0.5 * Math.exp(-tt / 0.5) + 0.05;          // laagdoorlaat die dichtgaat
        y += a * ((r() * 2 - 1) - y);
        x[i] = y * Math.exp(-tt / 0.16) * Math.min(1, tt / 0.006);
      }
    }
    const golf = (boven) => {
      const re = new Float32Array(boven.length + 1), im = new Float32Array(boven.length + 1);
      for (let i = 0; i < boven.length; i++) im[i + 1] = boven[i];
      return ctx.createPeriodicWave(re, im);
    };
    c = {
      ruis, galm, drums: drumKlanken(ctx),
      rhodes: golf([1, 0.42, 0.16, 0.1, 0.05, 0.025, 0.012]),
      sub:    golf([1, 0.27, 0.045, 0.01]),          // het laagdoorlaatfilter zit er al in
      fluit:  golf([1, 0.15, 0.04, 0.01]),
    };
    perKaart.set(ctx, c);
    return c;
  }

  /**
   * De drums, één keer uitgerekend als korte geluidjes (geen bestanden): daarna is elke slag
   * alleen een buffer afspelen, en dat kost bijna niets. Ruis met vaste zaden, filters en
   * omhullenden zoals in een drumcomputer, met een zachte bandrecorder-verzadiging (tanh).
   */
  function drumKlanken(ctx) {
    let r = Math.random;                                             // per klank opnieuw gezaaid
    const sr = ctx.sampleRate, TAN = Math.tanh(1.6);
    // drumbus 0,85 en dan tanh (als snelle breuk: zelfde klank, veel minder rekenwerk)
    const zacht = (x) => { const y = 1.36 * x, y2 = y * y; return (y2 > 9 ? Math.sign(y) : y * (27 + y2) / (27 + 9 * y2)) / TAN; };
    // biquad zoals Web Audio hem rekent (bij laag- en hoogdoorlaat is Q in dB)
    const filt = (type, f0, q) => {
      const w = 2 * Math.PI * f0 / sr, cs = Math.cos(w);
      const al = Math.sin(w) / (2 * (type === 'band' ? q : Math.pow(10, q / 20)));
      let b0, b1, b2;
      if (type === 'laag') { b0 = (1 - cs) / 2; b1 = 1 - cs; b2 = b0; }
      else if (type === 'hoog') { b0 = (1 + cs) / 2; b1 = -(1 + cs); b2 = b0; }
      else { b0 = al; b1 = 0; b2 = -al; }
      const a0 = 1 + al, a1 = -2 * cs / a0, a2 = (1 - al) / a0;
      b0 /= a0; b1 /= a0; b2 /= a0;
      let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
      return (x) => { const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = x; y2 = y1; y1 = y; return y; };
    };
    const maak = (sec, vul) => {
      const n = Math.ceil(sec * sr), b = ctx.createBuffer(1, n, sr), d = b.getChannelData(0);
      vul(d, n);
      const f = Math.floor(0.005 * sr);                               // laatste 5 ms uitfaden
      for (let i = 0; i < f; i++) d[n - 1 - i] *= i / f;
      return b;
    };
    const daal = (tau) => Math.exp(-1 / (tau * sr));                 // per sample vermenigvuldigen
    // toon die van f0 naar f1 zakt in `glij` s (exponentieel), lineair aan in 4 ms, dan uitsterven
    const toon = (sec, f0, f1, glij, piek, tau) => maak(sec, (d, n) => {
      const aan = Math.round(0.004 * sr), ng = Math.round(glij * sr), k = daal(tau), kf = Math.pow(f1 / f0, 1 / ng);
      let fase = 0, f = f0, e = 1;
      for (let i = 0; i < n; i++) {
        fase += 2 * Math.PI * f / sr;
        if (i < ng) f *= kf;
        const a = i < aan ? i / aan : (e *= k);
        d[i] = zacht(piek * a * Math.sin(fase));
      }
    });
    // Elke klank wordt pas gemaakt als hij nodig is, of eerder: speel() maakt er telkens
    // één (het intro begint zonder drums), zodat er nooit een merkbare hapering is.
    const recept = {
      kick: () => toon(0.7, 150, 52, 0.09, 0.22, 0.085),
      vel: () => toon(0.35, 190, 140, 0.08, 0.07, 0.035),             // de vel van de snare
      // kwastjes-snare: zacht aan, kort pakje, dan een ruisige staart
      snare: () => maak(0.6, (d, n) => {
        const bp = filt('band', 1250, 0.5), lp = filt('laag', 3000, 0.5);
        const aan = Math.round(0.005 * sr), knik = Math.round(0.05 * sr), k1 = daal(0.02), k2 = daal(0.075);
        let e1 = 1, e2 = 0.35 + 0.65 * Math.exp(-0.045 / 0.02);
        for (let i = 0; i < n; i++) {
          const e = i < aan ? i / aan : i < knik ? 0.35 + 0.65 * (e1 *= k1) : (e2 *= k2);
          d[i] = zacht(0.31 * lp(bp((r() * 2 - 1) * e)));
        }
      }),
      // hihat, shaker, bekken: ruis door een hoogdoorlaat
      hihat: () => ruisSlag(0.17, 0.0015, 0.018, 0.2),
      open: () => ruisSlag(0.65, 0.0015, 0.07, 0.2),
      shaker: () => ruisSlag(0.33, 0.012, 0.028, 0.15),
      crash: () => ruisSlag(2.6, 0.004, 0.45, 0.07),
    };
    const ruisSlag = (sec, aanS, tau, piek) => maak(sec, (d, n) => {
      const hp = filt('hoog', 6500, 0.5), aan = Math.max(1, Math.round(aanS * sr)), k = daal(tau);
      let e = 1;
      for (let i = 0; i < n; i++) d[i] = zacht(piek * hp((r() * 2 - 1) * (i < aan ? i / aan : (e *= k))));
    });
    // [naam, variant]: de volgorde waarin ze klaargezet worden
    const lijst = [['kick', 0], ['hihat', 0], ['hihat', 1], ['snare', 0], ['vel', 0], ['hihat', 2], ['hihat', 3],
      ['snare', 1], ['snare', 2], ['shaker', 0], ['shaker', 1], ['open', 0], ['open', 1], ['crash', 0]];
    const klaar = new Map();
    const maakNu = (naam, v) => {
      const sleutel = naam + v;
      let b = klaar.get(sleutel);
      if (!b) {
        r = zaad(1000 + lijst.findIndex(x => x[0] === naam && x[1] === v));
        b = recept[naam]();
        klaar.set(sleutel, b);
      }
      return b;
    };
    let volgende = 0;
    return {
      /** De buffer van een drumklank (variant v); zo nodig nu meteen gemaakt. */
      klank: maakNu,
      /** Eén klank die nog niet klaar is alvast maken. */
      bijmaken() {
        while (volgende < lijst.length && klaar.has(lijst[volgende][0] + lijst[volgende][1])) volgende++;
        if (volgende < lijst.length) maakNu(lijst[volgende][0], lijst[volgende][1]);
      },
    };
  }

  // ---- de gedeelde knopen: één set per muziekbus ---------------------------------
  const perDoel = new WeakMap();
  function setup(ctx, doel, opties) {
    const c = kaartSpul(ctx), t0 = ctx.currentTime;
    const knopen = [], bronnen = [];
    const gain = (v) => { const g = ctx.createGain(); g.gain.value = v; knopen.push(g); return g; };
    const filter = (type, f, q) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; knopen.push(b); return b; };
    const lfo = (f, diepte, doelParam) => {
      const o = ctx.createOscillator(), g = gain(diepte);
      o.frequency.value = f; o.connect(g); g.connect(doelParam); o.start(t0);
      bronnen.push(o); knopen.push(o);
      return g;
    };

    // eindtrap: bandrecorder-laagdoorlaat en een zachte compressor
    const mix = gain(1);
    const tape = filter('lowpass', 8500, 0.5);
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18; comp.knee.value = 10; comp.ratio.value = 3;
    comp.attack.value = 0.008; comp.release.value = 0.25;
    knopen.push(comp);
    const uit = gain(UIT);
    const zonder = new Set((opties && opties.zonder) || []);   // alleen voor metingen
    mix.connect(tape);
    if (zonder.has('comp')) tape.connect(uit); else { tape.connect(comp); comp.connect(uit); }
    uit.connect(doel);

    // galm (gegenereerde kamer) en een echo op de melodie (gepunteerde achtste)
    const galmIn = filter('highpass', 280, 0.5);                    // alle sends komen hier samen
    const galmUit = gain(0.34);
    if (!zonder.has('galm')) {
      const conv = ctx.createConvolver(); conv.buffer = c.galm;
      const galmR = ctx.createDelay(0.05), galmLR = ctx.createChannelMerger(2);
      galmR.delayTime.value = 0.012;
      knopen.push(conv, galmR, galmLR);
      galmIn.connect(conv);
      conv.connect(galmLR, 0, 0); conv.connect(galmR); galmR.connect(galmLR, 0, 1);
      galmLR.connect(galmUit); galmUit.connect(mix);
    }
    const echo = ctx.createDelay(2); knopen.push(echo);
    echo.delayTime.value = 3 * 15 / TEMPO;
    const echoLp = filter('lowpass', 2000, 0.5), terug = gain(0.3), echoUit = gain(0.24);
    if (!zonder.has('echo')) {
      echo.connect(echoLp); echoLp.connect(terug); terug.connect(echo);
      echoLp.connect(echoUit); echoUit.connect(mix); echoUit.connect(galmIn);
    }

    // piano en pad: samen in een EQ-filter (minder "modder" rond 300 Hz), dan een filter
    // (dicht in het intro en de break), duiken op de bassdrum, en een chorus (bandrecorder)
    const keysIn = filter('peaking', 320, 0.9), keysLp = filter('lowpass', 5200, 0.6), duik = gain(1);
    keysIn.gain.value = -3;
    keysIn.connect(keysLp); keysLp.connect(duik); duik.connect(mix);
    const links = ctx.createDelay(0.05), rechts = ctx.createDelay(0.05), samen = ctx.createChannelMerger(2);
    knopen.push(links, rechts, samen);
    links.delayTime.value = 0.011; rechts.delayTime.value = 0.017;
    if (!zonder.has('chorus')) {
      const zweef = lfo(0.37, 0.0017, links.delayTime), tegen = gain(-1);   // rechts in tegenfase
      zweef.connect(tegen); tegen.connect(rechts.delayTime);
      const chorus = gain(0.525);
      duik.connect(links); duik.connect(rechts); links.connect(samen, 0, 0); rechts.connect(samen, 0, 1);
      samen.connect(chorus); chorus.connect(mix);
    }
    const keysGalm = gain(0.25); duik.connect(keysGalm); keysGalm.connect(galmIn);

    // drums: de klanken zijn al klaar (drumKlanken); hier alleen de bus en wat galm op de snare
    const drumIn = gain(1), snareGalm = gain(0.26);
    drumIn.connect(mix); snareGalm.connect(galmIn);

    // bas: één doorlopende oscillator, de noten zijn alleen omhullende en toonhoogte
    const basOsc = ctx.createOscillator(); basOsc.setPeriodicWave(c.sub); basOsc.frequency.value = hz(41);
    const basEnv = gain(0);
    basOsc.connect(basEnv); basEnv.connect(mix);
    basOsc.start(t0); bronnen.push(basOsc); knopen.push(basOsc);

    // melodie: ook één doorlopende oscillator, met vertraagd vibrato en glijden
    const melOsc = ctx.createOscillator(); melOsc.setPeriodicWave(c.fluit); melOsc.frequency.value = hz(72);
    const vib = lfo(5.1, 0, melOsc.detune);
    const melEnv = gain(0);
    melOsc.connect(melEnv);
    melEnv.connect(mix); melEnv.connect(echo);
    const melGalm = gain(0.3); melEnv.connect(melGalm); melGalm.connect(galmIn);
    melOsc.start(t0); bronnen.push(melOsc); knopen.push(melOsc);

    // piano: vier doorlopende stemmen, elk met een eigen omhullende, en één filter dat bij
    // elke aanslag even opengaat (de "tik" van de toets). Geen nieuwe knopen per akkoord.
    const pianoLp = filter('lowpass', 900, 0.4);
    try { pianoLp.frequency.automationRate = 'k-rate'; } catch (e) { /* oudere browser */ }
    pianoLp.connect(keysIn);
    const pianoStem = [];
    for (let i = 0; i < 4; i++) {
      const o = ctx.createOscillator(), env = gain(0);
      o.setPeriodicWave(c.rhodes); o.frequency.value = hz(60);
      o.connect(env); env.connect(pianoLp);
      o.start(t0); bronnen.push(o); knopen.push(o);
      pianoStem.push({ osc: o, env });
    }
    // pad: drie doorlopende zaagtanden die naar de volgende akkoordtoon glijden
    const padLp = filter('lowpass', 760, 0.3), padEnv = gain(0);
    padLp.connect(padEnv); padEnv.connect(keysIn);
    const padStem = [];
    for (let i = 0; i < 3; i++) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth'; o.frequency.value = hz(60); o.detune.value = i % 2 ? -7 : 7;
      o.connect(padLp); o.start(t0); bronnen.push(o); knopen.push(o);
      padStem.push(o);
    }

    const gd = {
      ctx, doel, c, knopen, bronnen, zonder,
      mix, galmIn, keysIn, keysLp, duik, drumIn, snareGalm, echo,
      basOsc, basEnv, melOsc, melEnv, vib, pianoLp, pianoStem, padEnv, padStem,
      d: 15 / TEMPO, eerste: true, filterNu: 0, keysEind: -1, padUit: true,
      basEind: -1, melEind: -1, riser: null, weg: false, ronde: 0, vorigeStap: -1,
    };
    perDoel.set(doel, gd);
    return gd;
  }

  function dispose(gd) {
    if (!gd || gd.weg) return;
    gd.weg = true;
    const t = gd.ctx.currentTime;
    for (const b of gd.bronnen) { try { b.stop(t); } catch (e) { /* al gestopt */ } }
    if (gd.riser) { try { gd.riser.bron.stop(t); } catch (e) { /* al gestopt */ } }
    for (const k of gd.knopen) { try { k.disconnect(); } catch (e) { /* al los */ } }
    if (perDoel.get(gd.doel) === gd) perDoel.delete(gd.doel);
  }

  // ---- de instrumenten -------------------------------------------------------------

  /**
   * Elektrische piano: een aanslag op de vier doorlopende stemmen. Elke stem dempt eerst
   * heel kort de vorige toon (zoals een toets die opnieuw wordt ingedrukt), springt dan naar
   * zijn nieuwe noot en slaat aan; van laag naar hoog, een paar ms na elkaar (gestrumd).
   */
  function piano(gd, akk, t, dur, vel, s) {
    const eind = t + dur, piek = 0.0686 * vel, v = akk[1];
    // Werd het tempo net hoger, dan kan de vorige aanslag nog een uit-moment ná t hebben.
    if (t < gd.keysEind) for (const st of gd.pianoStem) st.env.gain.cancelScheduledValues(t);
    const f = gd.pianoLp.frequency;
    f.setValueAtTime(1300 + 1500 * vel, t + 0.008);
    f.setTargetAtTime(600 + 300 * vel, t + 0.02, 0.25);
    for (let i = 0; i < 4; i++) {
      const st = gd.pianoStem[i], g = st.env.gain, ts = t + 0.008 + i * 0.006;
      g.setTargetAtTime(0, t, 0.0025);
      st.osc.frequency.setValueAtTime(hz(v[i]), t + 0.008);
      st.osc.detune.setValueAtTime((hasj(s, i) - 0.5) * 8, t + 0.008);   // een tikje vals: warm
      g.setTargetAtTime(piek, ts, 0.002);
      g.setTargetAtTime(piek * 0.45, ts + 0.008, 0.6);
      g.setTargetAtTime(0, Math.max(eind, ts + 0.03), 0.08);
    }
    gd.keysEind = eind;
  }

  /** Pad: de stemmen glijden naar het nieuwe akkoord en zwellen even aan. */
  function pad(gd, akk, t, niveau) {
    const v = akk[1], g = gd.padEnv.gain, piek = 0.044 * niveau;
    for (let i = 0; i < 3; i++) {
      const fr = gd.padStem[i].frequency;
      if (gd.padUit) fr.setValueAtTime(hz(v[i + 1]), t);       // was stil: meteen de goede toon
      else fr.setTargetAtTime(hz(v[i + 1]), t, 0.05);           // glijden: zachte stemvoering
    }
    g.setTargetAtTime(piek * 0.8, t, 0.06);
    g.setTargetAtTime(piek, t + 0.12, 0.45);
    gd.padUit = false;
  }

  function padUit(gd, t) {
    if (gd.padUit) return;
    gd.padEnv.gain.setTargetAtTime(0, t, 0.35);
    gd.padUit = true;
  }

  /** Bas: noot op de doorlopende oscillator. */
  function bas(gd, midi, t, eind, vel) {
    const g = gd.basEnv.gain, piek = 0.12 * vel;
    eind = Math.max(eind, t + 0.05);
    // Werd het tempo net hoger, dan kan de vorige noot nog een uit-moment ná t hebben.
    if (t < gd.basEind) g.cancelScheduledValues(t);
    gd.basOsc.frequency.setTargetAtTime(hz(midi), t, 0.005);
    g.setTargetAtTime(piek, t, 0.005);
    g.setTargetAtTime(piek * 0.72, t + 0.04, 0.3);
    g.setTargetAtTime(0, eind, 0.035);
    gd.basEind = eind;
  }

  /** Melodie: noot op de doorlopende oscillator; glijdt als de vorige nog klinkt. */
  function melodie(gd, midi, t, eind) {
    const g = gd.melEnv.gain, f = gd.melOsc.frequency, piek = 0.064;
    eind = Math.max(eind, t + 0.08);
    if (t < gd.melEind) { g.cancelScheduledValues(t); gd.vib.gain.cancelScheduledValues(t); }
    if (gd.melEind > t - 0.04) f.setTargetAtTime(hz(midi), t, 0.022);   // legato: glijden
    else f.setValueAtTime(hz(midi), t);
    g.setTargetAtTime(piek, t, 0.012);
    g.setTargetAtTime(piek * 0.7, t + 0.07, 0.5);
    g.setTargetAtTime(0, eind, 0.07);
    const v = gd.vib.gain;
    v.setTargetAtTime(0, t, 0.02);
    if (eind - t > 0.4) v.setTargetAtTime(11, t + 0.25, 0.18);          // vibrato op lange noten
    gd.melEind = eind;
  }

  /** Een drumslag: de klaar-gemaakte buffer met een vaste sterkte. */
  function slag(gd, buf, t, v, naar, galm) {
    const ctx = gd.ctx, src = ctx.createBufferSource(), g = ctx.createGain();
    src.buffer = buf; g.gain.value = v;
    src.connect(g); g.connect(naar);
    if (galm) g.connect(galm);
    src.start(t);
  }

  function kick(gd, t, v) {
    slag(gd, gd.c.drums.klank('kick', 0), t, v, gd.drumIn);
    // de piano en de pad duiken even weg (sidechain)
    const p = gd.duik.gain;
    p.setTargetAtTime(1 - 0.35 * v, t, 0.008);
    p.setTargetAtTime(1, t + 0.06, 0.14);
  }

  function snare(gd, t, v, s) {
    const k = gd.c.drums;
    slag(gd, k.klank('snare', (hasj(s, 7) * 3) | 0), t, v, gd.drumIn, gd.snareGalm);
    if (v > 0.5) slag(gd, k.klank('vel', 0), t, v, gd.drumIn);
  }

  /** Spurt: zachte ruis die in ±9,5 s aanzwelt en omhoog schuift. */
  function riser(gd, t) {
    const ctx = gd.ctx, src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = gd.c.ruis; src.loop = true;
    f.type = 'bandpass'; f.Q.value = 1.4;
    f.frequency.setValueAtTime(300, t);
    f.frequency.exponentialRampToValueAtTime(1900, t + 9.5);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.055, t + 9.2);
    g.gain.setTargetAtTime(0, t + 9.5, 0.2);
    src.connect(f); f.connect(g); g.connect(gd.mix); g.connect(gd.galmIn);
    src.start(t); src.stop(t + 12);
    return { bron: src, g };
  }

  // ---- één zestiende -----------------------------------------------------------
  const stijl = {
    key: 'rustig',
    naam: { nl: 'Rustig', en: 'Chill' },
    tempo: TEMPO,                 // tellen per minuut, level 1, zonder spurt
    stappenPerTel: 4,
    stappenPerMaat: 16,
    lengte: LENGTE,               // 640 zestienden = 40 maten
    secties: SECTIES,             // [{ naam, van, tot }] in zestienden
    piek: 0.4,                    // gemeten hoogste uitslag van de uitgang (true peak -7,9 dBFS)
    setup,
    dispose,

    speel(ctx, doel, stap, t, d, intensiteit, gd) {
      gd = gd || perDoel.get(doel) || setup(ctx, doel);
      if (gd.weg) return;
      const inten = intensiteit || {};
      const spurt = !!inten.spurt;
      const energie = Math.max(0, Math.min(1, ((inten.level || 1) - 1) / 4));
      const meld = typeof inten.opNoot === 'function' ? inten.opNoot : null;
      const s = ((stap % LENGTE) + LENGTE) % LENGTE;
      if (s < gd.vorigeStap) gd.ronde++;                 // het lied begint opnieuw
      gd.vorigeStap = s;
      const mi = s >> 4, q = s & 15, m = VORM[mi], volgende = VORM[(mi + 1) % VORM.length];
      const zw = (q & 1) ? SWING * d : 0, tq = t + zw;
      // eind van zoveel zestienden vanaf q, met swing (de volgende noot begint nooit eerder)
      const eindNa = (len) => t + len * d + (((q + len) & 1) ? SWING * d : 0);
      const akkOp = (qq) => m.akk[m.akk.length > 1 && qq >= 8 ? 1 : 0];
      const z = gd.zonder;

      // tempo veranderd (level, spurt): de echo schuift mee
      if (Math.abs(gd.d - d) > 1e-6) {
        gd.d = d;
        if (gd.eerste) gd.echo.delayTime.setValueAtTime(Math.min(1.9, 3 * d), t);
        else gd.echo.delayTime.setTargetAtTime(Math.min(1.9, 3 * d), t, 0.1);
      }
      // piano-filter per maat: dicht in het intro en de break, open in de spurt
      if (q === 0 || gd.eerste) {
        let f = m.filter * (1 + 0.06 * energie);
        if (spurt) f = Math.max(f, 4000) * 1.15;
        if (gd.eerste) gd.keysLp.frequency.setValueAtTime(f, t);
        else if (f !== gd.filterNu) gd.keysLp.frequency.setTargetAtTime(f, t, f > gd.filterNu ? 0.9 : 0.35);
        gd.filterNu = f;
      }
      // spurt: de riser
      if (spurt && !gd.riser && !z.has('fx')) { gd.riser = riser(gd, t); if (meld) meld('riser', t); }
      if (!spurt && gd.riser) {
        const r = gd.riser; gd.riser = null;
        r.g.gain.setTargetAtTime(0, t, 0.15);
        try { r.bron.stop(t + 1.5); } catch (e) { /* al gestopt */ }
      }

      // ---- drums
      if (!z.has('drums')) {
        const e = spurt ? m.drSpurt : m.dr;
        // hogere levels: een shaker erbij in de volle delen
        const shaker = Math.max(e.sh[q], !spurt && m.vol && (q & 1) ? 0.16 * energie : 0);
        if (e.k[q] && !z.has('kick')) { kick(gd, tq, e.k[q]); if (meld) meld('kick', t); }
        if (e.s[q] && !z.has('snare')) { snare(gd, tq + SNARE_LAAT, e.s[q], s); if (meld) meld('snare', t); }
        const hats = !z.has('hats');
        if (e.h[q] && hats) {
          const v = e.h[q] * (1 + 0.15 * energie) * (0.92 + 0.16 * hasj(s, 3));
          const k = gd.c.drums, buf = e.open[q] ? k.klank('open', (hasj(s, 11) * 2) | 0) : k.klank('hihat', (hasj(s, 11) * 4) | 0);
          slag(gd, buf, tq + 0.003 * hasj(s, 4), v, gd.drumIn);
          if (meld) meld('hihat', t);
        }
        if (shaker && hats) { slag(gd, gd.c.drums.klank('shaker', (hasj(s, 12) * 2) | 0), tq, shaker, gd.drumIn); if (meld) meld('shaker', t); }
        if (hats && q === 0 && (m.crash || (spurt && mi % 2 === 0))) {
          slag(gd, gd.c.drums.klank('crash', 0), t, m.crash || 0.6, gd.drumIn, gd.galmIn); if (meld) meld('crash', t);
        }
      }

      // ---- bas
      if (!z.has('bas')) {
        const patroon = BAS[spurt ? (m.akk.length > 1 ? 'half' : 'spurt') : m.bas];
        for (const [pq, iv, len, vel] of patroon) {
          if (pq !== q) continue;
          const akk = akkOp(q);
          let noot = akk[0];
          if (iv === 'N') {
            const doel2 = volgende.akk[0][0], verschil = doel2 - noot;
            noot = Math.abs(verschil) <= 2 ? noot + 7 : doel2 + (verschil > 0 ? -1 : 1);
          } else noot += iv;
          const eind = tq + 0.9 * (eindNa(len) - tq);
          bas(gd, noot, tq, eind, vel);
          if (meld) meld('bas', t);
        }
      }

      // ---- piano (en bij de eerste stap midden in een maat: meteen het akkoord)
      if (!z.has('keys')) {
        const patroon = KEYS[spurt ? (m.akk.length > 1 ? 'half' : 'spurt') : m.keys];
        let gespeeld = false;
        for (const [pq, len, vel] of patroon) {
          if (pq !== q) continue;
          const tt = tq + 0.004 * hasj(s, 9);
          piano(gd, akkOp(q), tt, Math.max(0.1, eindNa(len) - tt - 0.02), vel * (0.94 + 0.12 * hasj(s, 10)), s);
          gespeeld = true;
          if (meld) meld('akkoord', t);
        }
        if (gd.eerste && !gespeeld && q !== 0) {
          piano(gd, akkOp(q), t, Math.max(0.15, (16 - q) * d - 0.02), 0.55, s);
          if (meld) meld('akkoord', t);
        }
      }

      // ---- pad
      if (!z.has('pad') && m.pad > 0 && (q === 0 || (q === 8 && m.akk.length > 1) || gd.eerste)) {
        pad(gd, akkOp(q), t, m.pad);
        if (meld) meld('pad', t);
      } else if (m.pad === 0 && q === 0) padUit(gd, t);

      // ---- melodie
      // Elke tweede keer door het lied zwijgt de melodie in de eerste helft van A: even
      // alleen de groove, dan komt het thema terug.
      const melRust = gd.ronde % 2 === 1 && m.sectie === 'A' && mi < 8;
      if (!z.has('mel') && !melRust) {
        const n = m.melOp[q];
        if (n) {
          melodie(gd, n[1], tq, tq + 0.9 * (eindNa(n[2]) - tq));
          if (meld) meld('melodie', t);
        }
      }
      gd.eerste = false;
      gd.c.drums.bijmaken();
    },
  };
  return stijl;
})();


// Muziekstijl "Vrolijk" (Cheerful): een opgewekt deuntje in C groot, zoals bij een
// vriendelijk puzzelspel. Marimba met een vast motiefje, een huppelende bas, korte
// gitaarachtige akkoordjes op de tegentel, een zachte pad eronder en lichte klap/shaker.
//
// Vorm (32 maten van 16 zestienden, 512 stappen, ruim een minuut op 116 tellen per minuut):
//   A  (maat 1-8)   thema:   C  G/B  Am7  F G  C  E7  F Fm  C G7
//   B  (maat 9-16)  brug:    F  G  Em7  Am  Dm7  G7  Ab  Bb      (Ab Bb C = de verrassing)
//   A2 (maat 17-24) thema met een tweede stem erbij, eindigt op G7 -> Am
//   C  (maat 25-32) rustig:  Am  F  C  G  Am  F  Dm7  G7sus G7  (kalimba-arpeggio, opbouw naar A)
// Laatste tien seconden (spurt): bassdrum op elke tel, open hihats, bas in achtsten, een
// klappenroffel en elke twee maten een aanzwellende ruis die steeds hoger en harder wordt.
//
// Gebruik (alles op de klok van de geluidskaart; geen Math.random, alles herhaalbaar):
//   const st = MUZIEK_STIJL_VROLIJK.setup(ctx, bus);   // gedeelde knopen (galm, echo, compressor)
//   MUZIEK_STIJL_VROLIJK.speel(ctx, bus, stap, t, d, { spurt, level, opNoot }, st);
//       stap = 0..stappen-1, t = starttijd van die zestiende, d = lengte van een zestiende (s).
//       opNoot(soort, tijd) is optioneel (voor de test).
//   MUZIEK_STIJL_VROLIJK.dispose(st);                   // na het uitfaden: alles loskoppelen (st of bus)
// Zonder st maakt speel() zelf één keer de gedeelde knopen per bus aan. Na dispose plant
// speel() niets meer op die st. Ook beschikbaar als stap(), lengte, key en piek.
// opNoot-soorten: lead, kalimba, pad, akkoord, bas, kick, clap, shaker, hihat (alleen in de
// spurt), bekken, blok, riser.
// Rekenwerk: elke noot maakt een paar korte knopen; zodra de laatste bron van een noot stopt
// (onended) worden ze meteen losgekoppeld, zodat er geen duizenden stille knopen aan de
// groepen blijven hangen tot de browser opruimt (dat maakte deze stijl eerst ±15x zwaarder).

export const MUZIEK_STIJL_VROLIJK = (() => {
  const TEMPO = 116;
  const PER_MAAT = 16;
  const MATEN = 32;
  const STAPPEN = PER_MAAT * MATEN;
  const SWING = 0.12;       // de oneven zestienden komen zoveel stap later: huppelend
  const UIT = 0.52;         // volume na de compressor
  const ECHO_TERUG = 0.55;  // volume van de echo (punt-achtste)

  const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const klem = (x, a, b) => Math.max(a, Math.min(b, x));
  // Vast 'toeval' per getal (0..1): kleine verschillen in hardheid, elke keer hetzelfde.
  const hash = (n) => {
    let x = Math.imul((n | 0) ^ 0x9e3779b9, 0x85ebca6b);
    x ^= x >>> 13; x = Math.imul(x, 0xc2b2ae35); x ^= x >>> 16;
    return (x >>> 0) / 4294967296;
  };
  const rng = (seed) => () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let x = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };

  // ---- harmonie ----------------------------------------------------------------------
  // r = grondtoon van de bas, k = kwint voor de bas, v = ligging van de akkoorden (MIDI,
  // 60 = middelste C). De liggingen schuiven zo weinig mogelijk van akkoord naar akkoord.
  const AKK = {
    C:   { r: 48, k: 55, v: [64, 67, 72] },
    GB:  { r: 47, k: 50, v: [62, 67, 71] },        // G met B in de bas
    Am7: { r: 45, k: 52, v: [64, 67, 69, 72] },
    F:   { r: 41, k: 48, v: [65, 69, 72] },
    G:   { r: 43, k: 50, v: [62, 67, 71] },
    E7:  { r: 40, k: 47, v: [64, 68, 71, 74] },
    Fm:  { r: 41, k: 48, v: [65, 68, 72] },
    G7:  { r: 43, k: 50, v: [62, 65, 67, 71] },
    Em7: { r: 40, k: 47, v: [64, 67, 71, 74] },
    Am:  { r: 45, k: 52, v: [64, 69, 72] },
    Dm7: { r: 38, k: 45, v: [62, 65, 69, 72] },
    Ab:  { r: 44, k: 51, v: [63, 68, 72] },
    Bb:  { r: 46, k: 53, v: [62, 65, 70] },
    G7s: { r: 43, k: 50, v: [62, 67, 72] },        // G7sus4
  };
  for (const a of Object.values(AKK)) {
    a.pc = [...new Set([a.r % 12, ...a.v.map(m => m % 12)])];
    a.arp = a.v.length >= 4 ? a.v.slice(0, 4) : [a.v[0], a.v[1], a.v[2], a.v[0] + 12];
  }
  // Per maat het akkoord van de eerste en de tweede helft.
  const A_AKK = [['C', 'C'], ['GB', 'GB'], ['Am7', 'Am7'], ['F', 'G'], ['C', 'C'], ['E7', 'E7'], ['F', 'Fm'], ['C', 'G7']];
  const B_AKK = [['F', 'F'], ['G', 'G'], ['Em7', 'Em7'], ['Am', 'Am'], ['Dm7', 'Dm7'], ['G7', 'G7'], ['Ab', 'Ab'], ['Bb', 'Bb']];
  const C_AKK = [['Am', 'Am'], ['F', 'F'], ['C', 'C'], ['G', 'G'], ['Am', 'Am'], ['F', 'F'], ['Dm7', 'Dm7'], ['G7s', 'G7']];
  const HELFT = [...A_AKK, ...B_AKK, ...A_AKK, ...C_AKK].flat().map(n => AKK[n]);   // 64 halve maten

  // ---- melodie: per maat [zestiende, MIDI, lengte in zestienden] ------------------------
  // Het motief (do-mi-sol-la-sol, ritme 3-3-2-2) komt terug in maat 1, 3 en 5.
  const MEL_A = [
    [[0, 72, 3], [3, 76, 3], [6, 79, 2], [8, 81, 2], [10, 79, 4], [14, 76, 2]],
    [[0, 74, 3], [3, 71, 3], [6, 67, 2], [8, 71, 2], [10, 74, 6]],
    [[0, 72, 3], [3, 76, 3], [6, 81, 2], [8, 83, 2], [10, 81, 4], [14, 76, 2]],
    [[0, 77, 3], [3, 81, 3], [6, 77, 2], [8, 79, 6], [14, 74, 2]],
    [[0, 72, 3], [3, 76, 3], [6, 79, 2], [8, 81, 2], [10, 79, 4], [14, 76, 2]],
    [[0, 71, 3], [3, 74, 3], [6, 76, 2], [8, 80, 2], [10, 76, 4], [14, 74, 2]],
    [[0, 72, 3], [3, 77, 3], [6, 81, 2], [8, 80, 6], [14, 79, 2]],
    [[0, 76, 6], [6, 72, 2], [8, 74, 4], [12, 71, 4]],
  ];
  const MEL_A2 = MEL_A.slice();
  MEL_A2[1] = [[0, 74, 3], [3, 71, 3], [6, 67, 2], [8, 71, 2], [10, 74, 2], [12, 79, 4]];
  MEL_A2[7] = [[0, 76, 6], [6, 79, 2], [8, 77, 4], [12, 74, 4]];
  const MEL_B = [
    [[0, 69, 4], [4, 72, 2], [6, 77, 6], [12, 76, 2], [14, 77, 2]],
    [[0, 79, 6], [6, 74, 2], [8, 71, 6], [14, 74, 2]],
    [[0, 76, 4], [4, 79, 2], [6, 83, 6], [12, 81, 2], [14, 79, 2]],
    [[0, 76, 8], [8, 72, 2], [10, 74, 2], [12, 76, 4]],
    [[0, 77, 4], [4, 76, 2], [6, 74, 6], [12, 72, 2], [14, 74, 2]],
    [[0, 79, 6], [6, 77, 2], [8, 74, 4], [12, 71, 4]],
    [[0, 72, 3], [3, 75, 3], [6, 80, 4], [10, 79, 2], [12, 75, 4]],
    [[0, 74, 3], [3, 77, 3], [6, 82, 4], [10, 81, 2], [12, 77, 2], [14, 74, 2]],
  ];
  const MEL_C = [
    null, null, null, null,
    [[0, 72, 3], [3, 76, 3], [6, 81, 6], [12, 79, 4]],
    [[0, 77, 6], [6, 76, 2], [8, 72, 8]],
    [[0, 74, 3], [3, 77, 3], [6, 81, 6], [12, 79, 4]],
    [[0, 77, 6], [6, 79, 2], [8, 74, 4], [12, 71, 4]],
  ];
  const NOTEN = [];
  [MEL_A, MEL_B, MEL_A2, MEL_C].forEach(sectie => sectie.forEach(maat => {
    const rij = new Array(PER_MAAT).fill(null);
    if (maat) for (const [q, m, l] of maat) rij[q] = [m, l];
    NOTEN.push(rij);
  }));
  // Wandelende bas in de brug (kwartnoten, in stapjes naar het volgende akkoord).
  const BAS_B = [
    [41, 45, 48, 45], [43, 47, 50, 41], [40, 43, 45, 47], [45, 48, 52, 48],
    [50, 48, 45, 41], [43, 47, 50, 45], [44, 48, 51, 48], [46, 50, 53, 50],
  ];
  // Kalimba in deel C: per achtste welke toon van het akkoord (laag-hoog-midden-top...).
  const KAL_ARP = [0, 2, 1, 3, 2, 1, 3, 2];
  // Pad: een akkoord begint bij elke akkoordwissel; PAD_REST = halve maten tot de volgende.
  const PAD_BEGIN = HELFT.map((a, h) => h === 0 || a !== HELFT[h - 1]);
  const PAD_REST = new Array(64);
  for (let h = 63; h >= 0; h--) PAD_REST[h] = PAD_BEGIN[(h + 1) % 64] ? 1 : 1 + PAD_REST[h + 1];
  // Per deel: [volume pad, filter pad (Hz), echo op de marimba]. 4 = de spurt.
  const MODI = [[0.6, 1000, 0.16], [0.95, 1300, 0.26], [0.72, 1100, 0.18], [1.1, 1500, 0.3], [0.75, 1700, 0.1]];

  const pc = (m) => ((m % 12) + 12) % 12;
  /**
   * Een loopnoot naar `doel` toe: liefst een halve of hele toon eronder, anders erboven,
   * maar nooit een halve toon naast een toon van het akkoord dat nog klinkt (`ak`).
   */
  function aanloop(doel, ak) {
    const botst = (m) => !ak.pc.includes(pc(m)) && ak.pc.some(c => (pc(m) - c + 12) % 12 === 1 || (c - pc(m) + 12) % 12 === 1);
    const kand = [11, 4, 7, 9].includes(pc(doel - 1)) ? [doel - 1] : [];
    kand.push(doel - 2, doel + 2, ak.k, ak.r + 12);
    for (const m of kand) if (m !== ak.r && !botst(m)) return m;
    return ak.k;
  }
  /** De tweede stem: de dichtstbijzijnde akkoordtoon minstens een kleine terts lager. */
  function tweede(m, ak) {
    for (let p = m - 3; p > m - 12; p--) if (ak.pc.includes(pc(p))) return p;
    return m - 12;
  }

  // ---- klankjes die maar één keer per geluidskaart gemaakt worden -----------------------
  const BUFFERS = new WeakMap();
  function filter(d, soort, f, q, sr) {
    const w = 2 * Math.PI * f / sr, cs = Math.cos(w), al = Math.sin(w) / (2 * q);
    let b0, b1, b2;
    if (soort === 'hp') { b0 = (1 + cs) / 2; b1 = -(1 + cs); b2 = b0; }
    else if (soort === 'lp') { b0 = (1 - cs) / 2; b1 = 1 - cs; b2 = b0; }
    else { b0 = al; b1 = 0; b2 = -al; }
    const a0 = 1 + al, a1 = -2 * cs, a2 = 1 - al;
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < d.length; i++) {
      const x = d[i], y = (b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
      x2 = x1; x1 = x; y2 = y1; y1 = y; d[i] = y;
    }
  }
  function piek1(d) {
    let p = 0;
    for (let i = 0; i < d.length; i++) p = Math.max(p, Math.abs(d[i]));
    if (p > 0) for (let i = 0; i < d.length; i++) d[i] /= p;
  }
  function buffers(ctx) {
    let b = BUFFERS.get(ctx);
    if (b) return b;
    const sr = ctx.sampleRate, r = rng(0x5717c1a5);
    const maak = (sec, ch, vul) => {
      const buf = ctx.createBuffer(ch, Math.max(2, Math.round(sec * sr)), sr);
      for (let c = 0; c < ch; c++) vul(buf.getChannelData(c), c);
      return buf;
    };
    const ruis = (d, env) => { for (let i = 0; i < d.length; i++) d[i] = (r() * 2 - 1) * env(i / sr); };
    const staart = (d, sec) => { const n = Math.round(sec * sr); for (let i = 0; i < n; i++) d[d.length - 1 - i] *= i / n; };
    b = {
      // Handklap: drie snelle tikjes en een korte staart, rond 1,1 kHz (niet scherp).
      klap: maak(0.32, 1, (d) => {
        ruis(d, (t) => [0, 0.011, 0.023].reduce((s, b0, i) => s + (t >= b0 ? (i === 2 ? 1 : 0.8) * Math.exp(-(t - b0) / (i === 2 ? 0.05 : 0.0035)) : 0), 0));
        filter(d, 'bp', 1150, 0.9, sr); filter(d, 'lp', 3500, 0.7, sr); piek1(d); staart(d, 0.02);
      }),
      // Shaker: zwelt 7 ms aan, sterft snel weg; alleen het hoge ruisen.
      shaker: maak(0.11, 1, (d) => {
        ruis(d, (t) => t < 0.007 ? t / 0.007 : Math.exp(-(t - 0.007) / 0.02));
        filter(d, 'hp', 5000, 0.7, sr); filter(d, 'hp', 5000, 0.7, sr); filter(d, 'lp', 11000, 0.7, sr);
        piek1(d); staart(d, 0.01);
      }),
      // Open hihat (en langzamer afgespeeld: een zacht bekken).
      hihat: maak(0.45, 1, (d) => {
        ruis(d, (t) => Math.min(1, t / 0.001) * Math.exp(-t / 0.09));
        filter(d, 'hp', 7000, 0.7, sr); filter(d, 'lp', 12000, 0.7, sr); piek1(d); staart(d, 0.03);
      }),
      ruis: maak(1, 1, (d) => ruis(d, () => 1)),
      // Galm: stereo ruis die in 1,5 s wegsterft en daarbij steeds doffer wordt.
      galm: maak(2.0, 2, (d, c) => {
        const voor = c ? 0.014 : 0.011;
        let y = 0, e = 0;
        for (let i = 0; i < d.length; i++) {
          const t = i / sr - voor;
          if (t < 0) { d[i] = 0; continue; }
          y += (0.5 * Math.exp(-t / 0.45) + 0.06) * ((r() * 2 - 1) - y);
          d[i] = y * Math.exp(-6.9 * t / 1.5);
          e += d[i] * d[i];
        }
        const s = 1 / Math.sqrt(e || 1);
        for (let i = 0; i < d.length; i++) d[i] *= s;
        staart(d, 0.05);
      }),
    };
    BUFFERS.set(ctx, b);
    return b;
  }

  // ---- gedeelde knopen ---------------------------------------------------------------
  const AUTO = new WeakMap();
  function setup(ctx, dest) {
    const b = buffers(ctx), knopen = [];
    const G = (v) => { const g = ctx.createGain(); g.gain.value = v; knopen.push(g); return g; };
    const F = (type, f, q, gain) => {
      const x = ctx.createBiquadFilter();
      x.type = type; x.frequency.value = f;
      if (q != null) x.Q.value = q;
      if (gain != null) x.gain.value = gain;
      knopen.push(x); return x;
    };
    const P = (pan) => {
      if (!ctx.createStereoPanner) return G(1);
      const p = ctx.createStereoPanner(); p.pan.value = pan; knopen.push(p); return p;
    };
    // Eindstuk: laag gerommel weg, een dal rond 3 kHz (daar zitten de effectgeluiden),
    // de hoogste hoogte iets zachter, en een zachte compressor.
    const mix = G(1);
    const hp = F('highpass', 32, 0.7), dal = F('peaking', 3100, 0.8, -4.5), plank = F('highshelf', 9000, null, -3);
    const comp = ctx.createDynamicsCompressor(); knopen.push(comp);
    comp.threshold.value = -16; comp.knee.value = 12; comp.ratio.value = 2.5;
    comp.attack.value = 0.01; comp.release.value = 0.25;
    const uit = G(UIT);
    mix.connect(hp); hp.connect(dal); dal.connect(plank); plank.connect(comp); comp.connect(uit); uit.connect(dest);
    // Galm
    const galmIn = G(1), galm = ctx.createConvolver(); knopen.push(galm);
    galm.normalize = false; galm.buffer = b.galm;
    const galmHp = F('highpass', 280, 0.7);
    galmIn.connect(galm); galm.connect(galmHp); galmHp.connect(mix);
    // Echo op een punt-achtste, steeds doffer
    const echo = ctx.createDelay(1); knopen.push(echo);
    echo.delayTime.value = 45 / TEMPO;
    const echoIn = G(1), echoTerug = G(0.33), echoLp = F('lowpass', 2300, 0.5), echoUit = G(ECHO_TERUG), echoGalm = G(0.3);
    echoIn.connect(echo); echo.connect(echoLp); echoLp.connect(echoTerug); echoTerug.connect(echo);
    echoLp.connect(echoUit); echoUit.connect(mix); echoUit.connect(echoGalm); echoGalm.connect(galmIn);
    // Een groep per instrument: plek links/rechts, hoeveel galm, hoeveel echo.
    const groep = (pan, galmDeel, echoDeel) => {
      const ing = G(1), p = P(pan);
      ing.connect(p); p.connect(mix);
      if (galmDeel) { const s = G(galmDeel); p.connect(s); s.connect(galmIn); }
      let e = null;
      if (echoDeel != null) { e = G(echoDeel); p.connect(e); e.connect(echoIn); }
      return { in: ing, echo: e };
    };
    const st = {
      ctx, b, knopen, d: 0, modus: -1, padAan: false,
      lead: groep(-0.08, 0.22, MODI[0][2]),
      kal: groep(0.32, 0.3, 0.42),
      akk: groep(-0.3, 0.14, null),
      klap: groep(0.04, 0.3, null),
      shaker: groep(0.28, 0.08, null),
      blok: groep(-0.22, 0.2, null),
      fx: groep(0, 0.25, null),
      bas: G(1), kick: G(1), echo, echoUit,
    };
    const basLp = F('lowpass', 1000, 0.5);
    st.bas.connect(basLp); basLp.connect(mix); st.kick.connect(mix);
    // Pad: drie stemmen links/midden/rechts -> filter -> duikt weg bij de bassdrum -> volume
    st.padPan = [P(-0.45), P(0), P(0.45)];
    st.padFlt = F('lowpass', MODI[0][1], 0.6);
    st.duik = G(1); st.padVol = G(MODI[0][0]);
    const padGalm = G(0.35);
    for (const p of st.padPan) p.connect(st.padFlt);
    st.padFlt.connect(st.duik); st.duik.connect(st.padVol); st.padVol.connect(mix);
    st.padVol.connect(padGalm); padGalm.connect(galmIn);
    st.dest = dest;
    if (dest) AUTO.set(dest, st);
    return st;
  }

  /** Na het uitfaden: alles loskoppelen. Mag de st van setup() of de bus zelf krijgen. */
  function dispose(st) {
    if (st && !st.knopen) st = AUTO.get(st);
    if (!st || st.weg) return;
    st.weg = true;
    for (const k of st.knopen) { try { k.disconnect(); } catch (e) { /* al los */ } }
    st.knopen.length = 0;
    if (st.dest && AUTO.get(st.dest) === st) AUTO.delete(st.dest);
  }

  /**
   * Als `bron` (de bron van een noot die het laatst stopt) klaar is: alle knopen van die noot
   * meteen loskoppelen. Anders blijven ze tot de volgende opruimbeurt van de browser aan de
   * groepen hangen, en dan rekent de browser ze elke 128 samples allemaal mee (stilte, maar
   * duizenden knopen na een minuut). Pas na het einde, dus de klank verandert niet.
   */
  function opruimen(bron, knopen) {
    bron.onended = () => {
      bron.onended = null;
      for (const k of knopen) { try { k.disconnect(); } catch (e) { /* al los */ } }
    };
  }

  // ---- instrumenten (elke noot: een paar knopen die zichzelf opruimen) -------------------

  /** Marimba: zuivere grondtoon met een kort houtig tikje op 4x de toonhoogte. */
  function marimba(st, t, m, len, d, vel) {
    const ctx = st.ctx, f = hz(m), A = 0.31 * vel;
    const tau = klem(len * d * 0.42, 0.1, 0.32), eind = t + 0.004 + tau * 3.6;
    const o = ctx.createOscillator(), g = ctx.createGain(), o2 = ctx.createOscillator(), g2 = ctx.createGain();
    o.frequency.value = f; o2.frequency.value = f * 4;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(A, t + 0.004);
    g.gain.setTargetAtTime(0, t + 0.004, tau); g.gain.setTargetAtTime(0, eind - 0.04, 0.008);
    g2.gain.setValueAtTime(0, t); g2.gain.linearRampToValueAtTime(A * 0.13, t + 0.002);
    g2.gain.setTargetAtTime(0, t + 0.002, 0.016);
    o.connect(g); o2.connect(g2); g.connect(st.lead.in); g2.connect(st.lead.in);
    o.start(t); o.stop(eind); o2.start(t); o2.stop(t + 0.14);
    opruimen(o, [o, g, o2, g2]);                      // o stopt het laatst (eind > t + 0,36)
  }

  /** Kalimba: een tokkel die even zakt naar de juiste toon en lang natrilt, met echo. */
  function kalimba(st, t, m, vel) {
    const ctx = st.ctx, f = hz(m), A = 0.11 * vel, eind = t + 0.8;
    const o = ctx.createOscillator(), g = ctx.createGain(), o2 = ctx.createOscillator(), g2 = ctx.createGain();
    o.frequency.setValueAtTime(f * 1.006, t); o.frequency.setTargetAtTime(f, t, 0.015);
    o2.frequency.value = f * 5.95;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(A, t + 0.002);
    g.gain.setTargetAtTime(0, t + 0.002, 0.2); g.gain.setTargetAtTime(0, eind - 0.04, 0.008);
    g2.gain.setValueAtTime(0, t); g2.gain.linearRampToValueAtTime(A * 0.07, t + 0.001);
    g2.gain.setTargetAtTime(0, t + 0.001, 0.009);
    o.connect(g); o2.connect(g2); g.connect(st.kal.in); g2.connect(st.kal.in);
    o.start(t); o.stop(eind); o2.start(t); o2.stop(t + 0.08);
    opruimen(o, [o, g, o2, g2]);
  }

  /** Akkoordje op de tegentel: drie zaagtanden, snel dichtgedraaid filter, licht getokkeld. */
  function akkoordje(st, t, v, vel) {
    const ctx = st.ctx, fl = ctx.createBiquadFilter(), g = ctx.createGain(), A = 0.11 * vel, eind = t + 0.42;
    fl.type = 'lowpass'; fl.Q.value = 0.9;
    fl.frequency.setValueAtTime(2200, t); fl.frequency.setTargetAtTime(700, t, 0.07);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(A, t + 0.004);
    g.gain.setTargetAtTime(0, t + 0.004, 0.09); g.gain.setTargetAtTime(0, eind - 0.05, 0.009);
    fl.connect(g); g.connect(st.akk.in);
    const knopen = [fl, g];
    let o = null;
    v.slice(-3).forEach((m, i) => {
      o = ctx.createOscillator();
      o.type = 'sawtooth'; o.frequency.value = hz(m); o.detune.value = (i - 1) * 4;
      o.connect(fl); o.start(t + i * 0.005); o.stop(eind);
      knopen.push(o);
    });
    opruimen(o, knopen);                              // alle drie stoppen op eind
  }

  /** Pad: per stem twee iets verstemde zaagtanden, zacht aanzwellend en uitklinkend. */
  function pad(st, t, v, dur) {
    const ctx = st.ctx, A = 0.03, eind = t + dur + 0.65, knopen = [];
    let o = null;
    v.forEach((m, i) => {
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(A, t + 0.18);
      g.gain.setTargetAtTime(0, t + dur, 0.15); g.gain.setTargetAtTime(0, eind - 0.05, 0.01);
      g.connect(st.padPan[i % 3]);
      knopen.push(g);
      for (const det of [-7, 7]) {
        o = ctx.createOscillator();
        o.type = 'sawtooth'; o.frequency.value = hz(m); o.detune.value = det + (i - 1) * 2;
        o.connect(g); o.start(t); o.stop(eind);
        knopen.push(o);
      }
    });
    opruimen(o, knopen);                              // alle stemmen stoppen op eind
  }

  /** Bas: driehoek met een zachte octaaf erboven, eerst een tokkel, dan zachter aanhouden. */
  function bas(st, t, m, len, d, vel) {
    const ctx = st.ctx, f = hz(m), A = 0.19 * vel, los = t + Math.max(0.06, len * d), eind = los + 0.2;
    const o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain(), g2 = ctx.createGain();
    o.type = 'triangle'; o.frequency.value = f; o2.frequency.value = f * 2; g2.gain.value = 0.2;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(A, t + 0.005);
    g.gain.setTargetAtTime(A * 0.55, t + 0.005, 0.09); g.gain.setTargetAtTime(0, los, 0.025);
    o.connect(g); o2.connect(g2); g2.connect(g); g.connect(st.bas);
    o.start(t); o.stop(eind); o2.start(t); o2.stop(eind);
    opruimen(o2, [o, o2, g, g2]);
  }

  /** Zachte, ronde bassdrum. De pad duikt er even voor weg. */
  function kick(st, t, vel) {
    const ctx = st.ctx, o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(55, t + 0.07);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.45 * vel, t + 0.002);
    g.gain.setTargetAtTime(0, t + 0.002, 0.07); g.gain.setTargetAtTime(0, t + 0.3, 0.008);
    o.connect(g); g.connect(st.kick);
    o.start(t); o.stop(t + 0.38);
    opruimen(o, [o, g]);
    st.duik.gain.setTargetAtTime(0.5, t, 0.006);
    st.duik.gain.setTargetAtTime(1, t + 0.05, 0.11);
  }

  /** Een kant-en-klaar klankje (klap, shaker, hihat) op een groep. */
  function sample(st, t, buf, gain, naar, snelheid) {
    const ctx = st.ctx, src = ctx.createBufferSource(), g = ctx.createGain();
    src.buffer = buf; g.gain.value = gain;
    if (snelheid) src.playbackRate.value = snelheid;
    src.connect(g); g.connect(naar);
    src.start(t);
    opruimen(src, [src, g]);
  }

  /** Houtblokje: een heel korte toon die even van boven komt. */
  function blok(st, t, f, vel) {
    const ctx = st.ctx, o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(f * 1.6, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.006);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.25 * vel, t + 0.001);
    g.gain.setTargetAtTime(0, t + 0.001, 0.022);
    o.connect(g); g.connect(st.blok.in);
    o.start(t); o.stop(t + 0.18);
    opruimen(o, [o, g]);
  }

  /** Aanzwellende ruis tot de volgende twee maten; p (0..1) = hoe ver in de spurt. */
  function riser(st, t, dur, p, opsteek) {
    const ctx = st.ctx, src = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = st.b.ruis; src.loop = true;
    bp.type = 'bandpass'; bp.Q.value = 1.3;
    bp.frequency.setValueAtTime(350 + 300 * p, t);
    bp.frequency.exponentialRampToValueAtTime(1300 + 900 * p, t + dur);
    const piek = 0.4 * (0.5 + 0.5 * p), top = t + dur * 0.97;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(piek, top);
    g.gain.setTargetAtTime(0, top, 0.015);
    src.connect(bp); bp.connect(g); g.connect(st.fx.in);
    src.start(t, opsteek % 0.9); src.stop(t + dur + 0.12);
    opruimen(src, [src, bp, g]);
  }

  // ---- de partituur ------------------------------------------------------------------
  let spurtTel = 0;         // hoeveel zestienden de spurt al duurt

  /** Andere maat in de tijd (level, spurt): de echo even stil, nieuwe lengte, weer open. */
  function tempo(st, t, d) {
    if (Math.abs(st.d - d) < 1e-9) return;
    const e = st.echo.delayTime;
    if (!st.d) e.setValueAtTime(3 * d, t);
    else {
      st.echoUit.gain.setTargetAtTime(0, t, 0.012);
      e.setValueAtTime(3 * d, t + 0.07);
      st.echoUit.gain.setTargetAtTime(ECHO_TERUG, t + 0.08, 0.06);
    }
    st.d = d;
  }

  function speel(ctx, dest, stap, t, d, intens, st) {
    st = st || AUTO.get(dest) || setup(ctx, dest);
    if (st.weg) return;                              // al opgeruimd: niets meer inplannen
    const spurt = !!(intens && intens.spurt), level = (intens && intens.level) || 1;
    const meld = (intens && intens.opNoot) || null;
    const s = ((stap % STAPPEN) + STAPPEN) % STAPPEN;
    const maat = s >> 4, q = s & 15, deel = maat >> 3, mb = maat & 7, h = s >> 3;
    const ts = t + (q & 1 ? SWING * d : 0);          // met swing
    const ak = HELFT[h], volgend = HELFT[(h + 1) % 64];
    spurtTel = spurt ? spurtTel + 1 : 0;
    tempo(st, t, d);
    const modus = spurt ? 4 : deel;
    if (modus !== st.modus) {
      const [pv, pf, ev] = MODI[modus];
      st.padVol.gain.setTargetAtTime(pv, t, 0.3);
      st.padFlt.frequency.setTargetAtTime(pf, t, 0.3);
      st.lead.echo.gain.setTargetAtTime(ev, t, 0.2);
      st.modus = modus;
    }
    const n = (soort, tijd) => { if (meld) meld(soort, tijd); };

    // Melodie (marimba), met een tweede stem in A2 (en in A vanaf level 4).
    const noot = NOTEN[maat][q];
    if (noot) {
      const vel = (q === 0 ? 1 : 0.86) * (0.95 + 0.1 * hash(s * 7 + 3));
      marimba(st, ts, noot[0], noot[1], d, vel); n('lead', ts);
      if (deel === 2 || (deel === 0 && level >= 4 && mb >= 4)) { kalimba(st, ts, tweede(noot[0], ak), 0.5); n('kalimba', ts); }
    }
    // Kalimba-arpeggio in het rustige deel.
    if (deel === 3 && !(q & 1)) {
      kalimba(st, t, ak.arp[KAL_ARP[q >> 1]], (q % 4 === 0 ? 0.8 : 0.62) * (mb >= 4 ? 0.8 : 1));
      n('kalimba', t);
    }
    // Pad bij elke akkoordwissel (of meteen, na een pauze).
    if ((q === 0 || q === 8) && (PAD_BEGIN[h] || !st.padAan)) {
      pad(st, t, ak.v, PAD_REST[h] * 8 * d); st.padAan = true; n('pad', t);
    }
    // Akkoordjes op de tegentel.
    const tegen = q === 2 || q === 6 || q === 10 || q === 14;
    if (tegen && (spurt || deel === 0 || deel === 2)) { akkoordje(st, t, ak.v, q === 6 || q === 14 ? 1 : 0.75); n('akkoord', t); }
    else if (!spurt && deel === 1 && (q === 6 || q === 14)) { akkoordje(st, t, ak.v, 0.8); n('akkoord', t); }

    // Bas
    let bn = null;                                   // [MIDI, lengte in zestienden, hardheid]
    if (spurt) { if (!(q & 1)) bn = [q % 4 === 0 ? ak.r : ak.r + 12, 1.6, q % 4 === 0 ? 1 : 0.72]; }
    else if (deel === 1) { if (q % 4 === 0) bn = [BAS_B[mb][q >> 2], 3.6, q === 0 ? 1 : 0.82]; }
    else if (deel === 3) {
      if (mb < 4) { if (q === 0) bn = [ak.r, 15, 0.72]; }
      else if (mb < 7) {
        if (q === 0) bn = [ak.r, 6, 0.95];
        else if (q === 6) bn = [ak.r, 2, 0.65];
        else if (q === 8) bn = [ak.k, 4, 0.8];
        else if (q === 12) bn = [ak.r + 12, 2, 0.6];
        else if (q === 14) bn = [aanloop(volgend.r, ak), 2, 0.7];
      } else if (!(q & 1)) bn = [q % 4 === 0 ? ak.r : ak.r + 12, 1.6, 0.6 + 0.4 * q / 15];
    } else {
      const qq = q & 7;
      if (qq === 0) bn = [ak.r, 2.6, 1];
      else if (qq === 3) bn = [ak.r + 12, 1.2, 0.58];
      else if (qq === 6) bn = [volgend.r !== ak.r ? aanloop(volgend.r, ak) : ak.k, 1.5, 0.75];
    }
    if (bn) { const tb = q & 1 ? ts : t; bas(st, tb, bn[0], bn[1], d, bn[2]); n('bas', tb); }

    // Drums
    let kv = 0;
    if (spurt) kv = q % 4 === 0 ? 0.9 : 0;
    else if (deel === 3) kv = mb === 7 ? (q % 4 === 0 ? 0.85 : 0) : mb >= 4 && (q === 0 || q === 8) ? 0.75 : 0;
    else kv = q === 0 || q === 8 ? 1 : 0;
    if (kv) { kick(st, t, kv); n('kick', t); }

    let kl = 0;
    if (spurt) kl = q === 4 || q === 12 ? 1 : (maat & 1) && q >= 13 ? 0.3 + 0.12 * (q - 12) : 0;
    else if (deel === 3) kl = mb === 7 ? (q === 8 || q === 10 ? 0.4 : q >= 12 ? 0.45 + 0.1 * (q - 12) : 0) : 0;
    else if (deel === 1 && mb === 7 && q >= 13) kl = 0.35 + 0.1 * (q - 13);
    else kl = q === 4 || q === 12 ? (deel === 1 ? 0.8 : 0.9) : 0;
    if (kl) { sample(st, ts, st.b.klap, 0.45 * kl, st.klap.in); n('clap', ts); }

    let sv = 0;
    if (spurt) sv = q % 4 === 2 ? 1.25 : 0.7;
    else if (deel === 1) sv = !(q & 1) ? (q % 4 === 2 ? 1 : 0.6) : level >= 5 ? 0.35 : 0;
    else if (deel === 3 && mb < 4) sv = !(q & 1) ? (q % 4 === 2 ? 0.7 : 0.4) : 0;
    else sv = (q % 4 === 2 ? 1 : q & 1 ? 0.45 : 0.65) * (deel === 3 ? 0.85 : level >= 3 ? 1.1 : 1);
    if (sv) { sample(st, ts, st.b.shaker, 0.14 * sv * (0.9 + 0.2 * hash(s * 13 + 1)), st.shaker.in); n('shaker', ts); }
    if (spurt && q % 4 === 2) { sample(st, t, st.b.hihat, 0.05, st.shaker.in); n('hihat', t); }
    // Zacht bekken aan het begin van A en A2.
    if ((deel === 0 || deel === 2) && mb === 0 && q === 0) { sample(st, t, st.b.hihat, 0.07, st.fx.in, 0.55); n('bekken', t); }
    // Houtblokje: kleine tikjes aan het eind van de even maten, en de tel in het rustige deel.
    if (!spurt && (deel === 0 || deel === 2) && (mb & 1)) {
      if (q === 14) { blok(st, t, 784, 0.7); n('blok', t); }
      if (q === 15 && (mb & 3) === 3) { blok(st, ts, 659, 0.55); n('blok', ts); }
    } else if (!spurt && deel === 3 && mb < 7 && (q === 4 || q === 12)) { blok(st, t, 659, 0.6); n('blok', t); }

    // Opbouw: aan het eind van het rustige deel, en in de spurt elke twee maten.
    if (!spurt && deel === 3 && mb === 7 && q === 0) { riser(st, t, 16 * d, 0.2, s * 0.37); n('riser', t); }
    if (spurt && ((s & 31) === 0 || spurtTel === 1)) {
      const rest = 32 - (s & 31);
      if (rest >= 6) { riser(st, t, rest * d, klem(spurtTel / 100, 0, 1), s * 0.37); n('riser', t); }
    }
  }

  return {
    sleutel: 'vrolijk',
    naam: { nl: 'Vrolijk', en: 'Cheerful' },
    tempo: TEMPO,                 // tellen per minuut; een stap is een zestiende (15 / tempo s)
    stappenPerMaat: PER_MAAT,
    stappen: STAPPEN,             // de hele vorm; daarna weer vanaf stap 0
    secties: [
      { naam: 'A', van: 0 }, { naam: 'B', van: 128 }, { naam: 'A2', van: 256 }, { naam: 'C', van: 384 },
    ],
    luidst: 0.45,                 // hoogste piek die uit de stijl komt (gemeten -7 dBFS, vóór MUZIEK_VOLUME)
    setup,
    speel,
    dispose,
    // Dezelfde dingen onder de namen die de andere stijlen gebruiken.
    key: 'vrolijk', lengte: STAPPEN, piek: 0.45,
    stap: (ctx, dest, i, t, d, intens, st) => speel(ctx, dest, i, t, d, intens, st),
  };
})();


// Muziekstijl "Arcade": energieke synthwave met een knipoog naar chiptune, maar warm en
// gefilterd, zodat hij onder de geluidjes van het spel blijft liggen. Geen bestanden:
// alles wordt hier gesynthetiseerd, net als in audio.js.
//
// a-klein, 124 tellen per minuut, een vorm van 32 maten (ongeveer een minuut):
//   intro  4 maten  Am F C G                  drums, pad, een arpeggio dat langzaam opengaat
//   A      8 maten  Am F C G | Am F Dm7 E     de bas rolt in zestienden, het melodietje begint
//   B      8 maten  Fmaj7 G Em7 Am | Dm7 G Cmaj7 E7   refrein: hoger, voller, meer hihat
//   break  4 maten  Fmaj7 G Am7 E             geen bassdrum, zwevende pad, opbouw met roffel
//   B2     8 maten  als B, de melodie ook een octaaf lager, nog drukkere hihats
// Daarna weer de intro. Laatste tien seconden (spurt): hihats in zestienden met roffels,
// de filters gaan open, een ruis-riser die tot het eind blijft stijgen, bassdrum en bas
// spelen altijd (ook als de spurt in de intro of de break valt).
//
// Klank: pad = zes zachte zaagtanden (drie stemmen, elk twee iets ontstemd, links en
// rechts), bas = zachte zaagtand + sinus met een filter dat per noot "plukt", arpeggio =
// gedempte puls door een laagdoorlaatfilter, melodie = driehoek + wat zaagtand met vibrato
// en glijden. Pad en arpeggio duiken weg voor elke bassdrum (sidechain). Galm (een zelf
// gemaakte impulsrespons) en een ping-pong-echo op de maat. Aan het eind een laagfilter
// tegen gedreun, een dipje rond 3 kHz (daar zitten de geluidjes van het spel) en een
// compressor die de pieken afvangt.
//
// Zuinig: de pad, bas, arpeggio, melodie en riser zijn vaste oscillatoren die bij setup()
// één keer starten (53 nodes in totaal, waarvan 13 oscillatoren, 1 ruisbron en 1 convolver); per
// zestiende komen er alleen een paar korte drumslagen bij (2 nodes per slag, gemiddeld 2,2
// per zestiende, die na hooguit 0,6 s vanzelf weg zijn). Geen Math.random: elke keer
// dezelfde muziek.
//
// Gebruik (in muziek.js):
//   S.setup(ctx, bus)                                één keer per bus (in begin())
//   S.stap(ctx, bus, i, t, d, { spurt, level, opNoot })   zestiende i op tijd t, d = lengte
//   S.dispose(bus)                                   als de bus is uitgefade (in stop())
// opNoot(soort, tijd) is optioneel, voor de test: 'kick', 'snare' (de klap), 'hihat',
// 'bas', 'arp', 'lead', 'pad', 'crash', 'riser'.

export const MUZIEK_STIJL_ARCADE = (() => {
  const TEMPO = 124;
  const MAAT = 16;                     // zestienden per maat

  const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
  // Vast "toeval": een getal 0..1 per stap, zodat de muziek elke keer hetzelfde is.
  const hash = (n) => {
    let x = Math.imul((n | 0) ^ 0x5bd1e995, 0x27d4eb2d);
    x ^= x >>> 15; x = Math.imul(x, 0x85ebca6b); x ^= x >>> 13;
    return (x >>> 0) / 4294967296;
  };

  // ---- akkoorden: grondtoon van de bas, drie padstemmen, vier arpeggiotonen (MIDI) ----
  // De padstemmen bewegen zo min mogelijk van akkoord naar akkoord (stemvoering).
  const AKK = {
    Am:    { bas: 45, pad: [60, 64, 69], arp: [57, 60, 64, 69] },
    F:     { bas: 41, pad: [60, 65, 69], arp: [57, 60, 65, 69] },
    C:     { bas: 36, pad: [60, 64, 67], arp: [55, 60, 64, 67] },
    G:     { bas: 43, pad: [59, 62, 67], arp: [55, 59, 62, 67] },
    Dm7:   { bas: 38, pad: [60, 65, 69], arp: [57, 60, 62, 65] },
    E:     { bas: 40, pad: [59, 64, 68], arp: [56, 59, 64, 68] },
    Fmaj7: { bas: 41, pad: [60, 64, 69], arp: [53, 57, 60, 64] },
    Em7:   { bas: 40, pad: [59, 64, 67], arp: [55, 59, 62, 64] },
    Cmaj7: { bas: 36, pad: [59, 64, 67], arp: [55, 59, 64, 67] },
    E7:    { bas: 40, pad: [59, 62, 68], arp: [56, 59, 62, 64] },
    Am7:   { bas: 45, pad: [60, 64, 67], arp: [55, 60, 64, 69] },
  };

  // ---- de vorm: per maat het akkoord en het stuk -----------------------------------
  const VORM = [
    ['Am', 'intro'], ['F', 'intro'], ['C', 'intro'], ['G', 'intro'],
    ['Am', 'a'], ['F', 'a'], ['C', 'a'], ['G', 'a'], ['Am', 'a'], ['F', 'a'], ['Dm7', 'a'], ['E', 'a'],
    ['Fmaj7', 'b'], ['G', 'b'], ['Em7', 'b'], ['Am', 'b'], ['Dm7', 'b'], ['G', 'b'], ['Cmaj7', 'b'], ['E7', 'b'],
    ['Fmaj7', 'brk'], ['G', 'brk'], ['Am7', 'brk'], ['E', 'brk'],
    ['Fmaj7', 'b2'], ['G', 'b2'], ['Em7', 'b2'], ['Am', 'b2'], ['Dm7', 'b2'], ['G', 'b2'], ['Cmaj7', 'b2'], ['E7', 'b2'],
  ];
  const STAPPEN = VORM.length * MAAT;

  // ---- de melodie: per maat [zestiende, noot, lengte in zestienden] -----------------
  // Het haakje: drie keer een gepunteerde achtste en dan een kwart (3-3-2-4), omhoog
  // door het akkoord en weer terug. Het refrein zingt hoger met een lange eerste noot.
  const MELODIE = {
    a: [
      [[0, 69, 3], [3, 72, 3], [6, 76, 2], [8, 81, 4], [12, 79, 2], [14, 76, 2]],   // Am  A C E A G E
      [[0, 77, 6], [6, 76, 2], [8, 72, 8]],                                         // F   F E C
      [[0, 67, 3], [3, 72, 3], [6, 76, 2], [8, 79, 4], [12, 77, 2], [14, 76, 2]],   // C   G C E G F E
      [[0, 74, 6], [6, 72, 2], [8, 71, 8]],                                         // G   D C B
      [[0, 69, 3], [3, 72, 3], [6, 76, 2], [8, 81, 4], [12, 79, 2], [14, 76, 2]],   // Am
      [[0, 77, 6], [6, 81, 2], [8, 79, 6], [14, 77, 2]],                            // F   F A G F
      [[0, 76, 6], [6, 74, 2], [8, 77, 4], [12, 76, 2], [14, 74, 2]],               // Dm7 E D F E D
      [[0, 76, 6], [6, 74, 2], [8, 71, 4], [12, 80, 4]],                            // E   E D B G#
    ],
    b: [
      [[0, 81, 6], [6, 79, 2], [8, 81, 4], [12, 84, 4]],     // Fmaj7 A G A C
      [[0, 83, 6], [6, 81, 2], [8, 79, 4], [12, 74, 4]],     // G     B A G D
      [[0, 79, 6], [6, 76, 2], [8, 79, 4], [12, 83, 4]],     // Em7   G E G B
      [[0, 81, 12], [12, 76, 2], [14, 79, 2]],               // Am    A . . E G
      [[0, 81, 6], [6, 79, 2], [8, 77, 4], [12, 81, 4]],     // Dm7   A G F A
      [[0, 79, 6], [6, 77, 2], [8, 74, 4], [12, 71, 4]],     // G     G F D B
      [[0, 72, 3], [3, 76, 3], [6, 79, 2], [8, 83, 8]],      // Cmaj7 C E G B
      [[0, 80, 6], [6, 76, 2], [8, 74, 4], [12, 71, 4]],     // E7    G# E D B
    ],
    brk: [
      [[0, 69, 3], [3, 72, 3], [6, 76, 2], [8, 81, 8]],      // Fmaj7 het begin van het haakje
      [[0, 79, 8], [8, 74, 8]],                              // G
      [[0, 76, 3], [3, 79, 3], [6, 81, 2], [8, 84, 8]],      // Am7
      [[0, 83, 8], [8, 80, 8]],                              // E     B G# ... en dan het refrein
    ],
  };
  MELODIE.b2 = MELODIE.b;

  // ---- arpeggio's: index in de vier tonen van het akkoord, 4..7 = een octaaf hoger, -1 = rust
  const ARP_A = [0, 1, 2, 3, 4, 3, 2, 1, 0, 1, 2, 3, 4, 3, 2, 1];
  const ARP_B = [0, 2, 1, 3, 2, 4, 3, 5, 4, 6, 5, 7, 6, 4, 5, 3];
  const ARP_B2 = [4, 3, 2, 0, 4, 3, 1, 0, 5, 4, 2, 1, 6, 5, 3, 2];
  const ARP_BRK = [0, -1, 2, -1, 4, -1, 3, -1, 1, -1, 2, -1, 4, -1, 6, -1];

  // ---- per stuk: welke lagen, hoe hard, hoe open de filters (begin..eind van het stuk)
  const SECTIES = {
    intro: { kick: 'vier', clap: 'ja', hat: 'intro', bas: 'intro', arp: ARP_A, arpVel: 1, arpLp: [420, 1500],
      pad: 0.9, padLp: [650, 1250], leadVel: 0, zaag: 0.26, oct: 0, pomp: 0.5, crash: false, basTop: 520, basBodem: 150 },
    a: { kick: 'vier', clap: 'ja', hat: 'a', bas: 'a', arp: ARP_A, arpVel: 0.72, arpLp: [1450, 1650],
      pad: 0.75, padLp: [1250, 1400], leadVel: 0.9, zaag: 0.26, oct: 0, pomp: 0.45, crash: true, basTop: 850, basBodem: 190 },
    b: { kick: 'vier', clap: 'ja', hat: 'b', bas: 'b', arp: ARP_B, arpVel: 0.66, arpLp: [1800, 2000],
      pad: 1, padLp: [1600, 1800], leadVel: 1, zaag: 0.32, oct: 0, pomp: 0.4, crash: true, basTop: 1000, basBodem: 210 },
    brk: { kick: 'brk', clap: 'roffel', hat: 'brk', bas: 'brk', arp: ARP_BRK, arpVel: 0.85, arpLp: [1000, 2300],
      pad: 1.2, padLp: [900, 2400], leadVel: 0.72, zaag: 0.2, oct: 0, pomp: 1, crash: false, basTop: 420, basBodem: 140 },
    b2: { kick: 'vier', clap: 'ja', hat: 'b2', bas: 'b', arp: ARP_B2, arpVel: 0.62, arpLp: [1900, 2200],
      pad: 1, padLp: [1700, 1900], leadVel: 1, zaag: 0.34, oct: 0.45, pomp: 0.38, crash: true, basTop: 1100, basBodem: 220 },
  };

  // Volumes van de instrumenten (vóór de compressor aan het eind).
  const KICK = 0.5, KLAP = 1, HAT = 0.24, CRASH = 0.08, BAS = 0.21, ARP = 0.28, LEAD = 0.155, PAD = 0.063, RISER = 0.16;
  const UIT = 0.35;                    // eindniveau na de compressor (ongeveer -21 LUFS)

  // ---- vooraf uitgerekend: per maat en per stap ---------------------------------------
  const MATEN = VORM.map(([akk, sec], m) => {
    let begin = m, eind = m;
    while (begin > 0 && VORM[begin - 1][1] === sec) begin--;
    while (eind < VORM.length - 1 && VORM[eind + 1][1] === sec) eind++;
    const volgende = VORM[(m + 1) % VORM.length];
    // Een "uplifter" (zwellende ruis) vlak voor een stuk dat met een crash begint.
    const naarCrash = volgende[1] !== sec && SECTIES[volgende[1]].crash;
    return {
      akk: AKK[akk], sec, inSec: m - begin, lengte: eind - begin + 1,
      volgende: AKK[volgende[0]], op: sec === 'brk' && m === eind ? 0 : naarCrash ? 8 : -1,
    };
  });
  // De melodie per stap: { m, len, glij }. Een noot duurt hooguit tot de volgende; aan
  // elkaar gebonden kleine stapjes (hooguit een kwart) glijden, grote sprongen niet.
  const NOTEN = new Array(STAPPEN).fill(null);
  MATEN.forEach((M, m) => {
    const mel = MELODIE[M.sec];
    if (mel) for (const [q, noot, len] of mel[M.inSec]) NOTEN[m * MAAT + q] = { m: noot, len, glij: false };
  });
  for (let s = 0, vorige = -1; s < STAPPEN; s++) {
    if (!NOTEN[s]) continue;
    if (vorige >= 0) {
      const v = NOTEN[vorige];
      if (vorige + v.len >= s) { v.len = s - vorige; NOTEN[s].glij = Math.abs(NOTEN[s].m - v.m) <= 5; }
    }
    vorige = s;
  }

  // ---- gedeelde bronnen per geluidskaart: ruis, galm, golfvormen (één keer gemaakt) ----
  const perKaart = new WeakMap();
  function bronnen(ctx) {
    let b = perKaart.get(ctx);
    if (b) return b;
    b = {};
    const sr = ctx.sampleRate;
    // Een seconde ruis (vast zaadje), voor hihats, klap, crash en riser.
    b.ruis = ctx.createBuffer(1, Math.floor(sr), sr);
    const r = b.ruis.getChannelData(0);
    let z = 0x2545f491;
    for (let i = 0; i < r.length; i++) {
      z ^= z << 13; z ^= z >>> 17; z ^= z << 5;
      r[i] = ((z >>> 0) / 4294967296) * 2 - 1;
    }
    // Galm: twee seconden wegstervende ruis, links en rechts anders, steeds donkerder.
    if (ctx.createConvolver) {
      const n = Math.floor(sr * 2), pre = Math.floor(sr * 0.012);
      b.galm = ctx.createBuffer(2, n, sr);
      for (let c = 0; c < 2; c++) {
        const d = b.galm.getChannelData(c);
        let w = 0x9e3779b9 ^ (c * 0x7f4a7c15), lp = 0;
        for (let i = pre; i < n; i++) {
          w ^= w << 13; w ^= w >>> 17; w ^= w << 5;
          const x = ((w >>> 0) / 4294967296) * 2 - 1, tt = (i - pre) / sr;
          const k = 0.35 + 0.6 * Math.min(1, tt / 1.6);        // later in de staart: donkerder
          lp += (x - lp) * (1 - k);
          d[i] = lp * Math.exp(-tt / 0.34) * Math.min(1, tt / 0.006);
        }
      }
    }
    // Golfvormen zonder scherpe boventonen: een zachte zaagtand en een gedempte puls.
    if (ctx.createPeriodicWave) {
      const golf = (n, f) => {
        const re = new Float32Array(n + 1), im = new Float32Array(n + 1);
        for (let k = 1; k <= n; k++) { const [a, c] = f(k); re[k] = a; im[k] = c; }
        return ctx.createPeriodicWave(re, im);
      };
      b.zaag = golf(48, (k) => [0, ((k & 1) ? 1 : -1) / k * Math.exp(-(k - 1) / 16)]);
      b.puls = golf(24, (k) => [Math.sin(Math.PI * k * 0.3) / k * Math.exp(-(k - 1) / 6), 0]);
    }
    perKaart.set(ctx, b);
    return b;
  }

  // ---- de vaste klanken en effecten, per bus -------------------------------------------
  const gedeeld = new WeakMap();
  const levend = new Set();            // bussen waarvan de vaste klanken nog lopen

  function setup(ctx, dest) {
    const oud = gedeeld.get(dest);
    if (oud) return oud;
    const bron = bronnen(ctx), t0 = ctx.currentTime;
    // Vangnet: er speelt maar één muziekbus tegelijk. Is dispose() voor de vorige bus
    // vergeten, dan stoppen zijn vaste oscillatoren over een seconde (na het uitfaden).
    for (const x of levend) {
      if (x.ctx !== ctx) continue;
      for (const o of x.bronnen) { try { o.stop(t0 + 1); } catch (e) { /* al gestopt */ } }
      levend.delete(x);
    }
    const g = { ctx, ruis: bron.ruis, nodes: [], bronnen: [], maat: -1, akk: null, spurt: false, d: 0,
      spurtTel: 0, slag: 0, pompDiep: 0.5, basTop: 600, basBodem: 160, leadTop: 2600, leadBodem: 1900, arcade: true };
    const gain = (v, naar) => { const x = ctx.createGain(); x.gain.value = v; g.nodes.push(x); if (naar) x.connect(naar); return x; };
    const filter = (type, f, q, naar) => {
      const x = ctx.createBiquadFilter(); x.type = type; x.frequency.value = f;
      if (x.Q) x.Q.value = q;
      g.nodes.push(x); if (naar) x.connect(naar); return x;
    };
    const pan = (p, naar) => {
      if (!ctx.createStereoPanner) return gain(1, naar);
      const x = ctx.createStereoPanner(); x.pan.value = p; g.nodes.push(x); x.connect(naar); return x;
    };
    const osc = (golf, type, naar) => {
      const o = ctx.createOscillator();
      if (golf && o.setPeriodicWave) o.setPeriodicWave(golf); else o.type = type;
      g.nodes.push(o); g.bronnen.push(o); o.connect(naar); o.start(t0); return o;
    };

    // Uitgang: mix -> laag weg (onder 32 Hz) -> dipje bij 3 kHz -> compressor -> bus.
    // (Een DynamicsCompressor geeft er in alle browsers zelf wat versterking bij; UIT
    // zet het eindniveau daarna weer goed.)
    let eind = gain(UIT, dest);
    if (ctx.createDynamicsCompressor) {
      const c = ctx.createDynamicsCompressor();
      c.threshold.value = -12; c.knee.value = 8; c.ratio.value = 3; c.attack.value = 0.004; c.release.value = 0.18;
      g.nodes.push(c); c.connect(eind); eind = c;
    }
    const dip = filter('peaking', 3100, 0.8, eind);
    if (dip.gain) dip.gain.value = -3;
    g.mix = gain(1, filter('highpass', 32, 0.7, dip));

    // Galm: zendingen -> hoogdoorlaat (geen modder) -> convolver -> mix. De hoeveelheid
    // zit in de zendknoppen (minder nodes dan een aparte terugknop).
    if (ctx.createConvolver && bron.galm) {
      const conv = ctx.createConvolver();
      conv.buffer = bron.galm;
      g.nodes.push(conv);
      conv.connect(g.mix);
      g.galm = filter('highpass', 300, 0.7, conv);
    } else g.galm = gain(0);

    // Ping-pong-echo op een gepunteerde achtste (de tijd volgt het tempo, zie maatBegin):
    // links, dan rechts, dan via de terugkoppeling weer links, steeds zachter.
    g.echo = filter('lowpass', 2400, 0.5);
    if (ctx.createDelay) {
      const dl = ctx.createDelay(2), dr = ctx.createDelay(2);
      g.nodes.push(dl, dr);
      dl.delayTime.value = dr.delayTime.value = 0.36;
      g.dl = dl; g.dr = dr;
      g.echo.connect(dl);
      dl.connect(pan(-0.7, g.mix)); dl.connect(dr);
      dr.connect(pan(0.7, g.mix)); dr.connect(gain(0.36, dl));
    }

    // Pomp: pad en arpeggio duiken samen weg voor de bassdrum.
    g.pomp = gain(1, g.mix);
    g.pomp.connect(gain(0.22, g.galm));

    // Pad: drie stemmen, elk twee zachte zaagtanden (links iets lager, rechts iets hoger;
    // dat zweven geeft de breedte).
    g.padNiveau = gain(0, g.pomp);
    g.padLp = filter('lowpass', 900, 0.5, g.padNiveau);
    const padL = pan(-0.75, g.padLp), padR = pan(0.75, g.padLp);
    g.padO = [0, 1, 2].map((v) => {
      const a = osc(bron.zaag, 'sawtooth', padL), b = osc(bron.zaag, 'sawtooth', padR);
      if (a.detune) { a.detune.value = -9 + 2 * v; b.detune.value = 8 - 2 * v; }
      return [a, b];
    });

    // Bas: zachte zaagtand door een filter dat per noot opengaat, plus een sinus eronder.
    g.basAmp = gain(0, g.mix);
    g.basLp = filter('lowpass', 200, 2.2, g.basAmp);
    g.basZ = osc(bron.zaag, 'sawtooth', g.basLp);
    g.basS = osc(null, 'sine', gain(0.35, g.basAmp));

    // Arpeggio: gedempte puls -> filter -> iets naar rechts -> pomp, plus de echo.
    g.arpLp = filter('lowpass', 420, 2, pan(0.25, g.pomp));
    g.arpLp.connect(gain(0.17, g.echo));
    g.arpAmp = gain(0, g.arpLp);
    g.arpO = osc(bron.puls, 'square', g.arpAmp);

    // Melodie: driehoek + een beetje zaagtand (+ in B2 een octaaf lager), met vibrato.
    g.leadAmp = gain(0, g.mix);
    g.leadAmp.connect(gain(0.12, g.echo));
    g.leadAmp.connect(gain(0.11, g.galm));
    g.leadLp = filter('lowpass', 1900, 0.6, g.leadAmp);
    g.leadT = osc(null, 'triangle', g.leadLp);
    g.leadZG = gain(0.26, g.leadLp);
    g.leadZ = osc(bron.zaag, 'sawtooth', g.leadZG);
    g.leadOG = gain(0, g.leadLp);
    g.leadO = osc(bron.zaag, 'sawtooth', g.leadOG);
    if (g.leadZ.detune) { g.leadZ.detune.value = 7; g.leadO.detune.value = -6; }
    const vib = gain(7);
    for (const o of [g.leadT, g.leadZ, g.leadO]) if (o.detune) vib.connect(o.detune);
    osc(null, 'sine', vib).frequency.value = 5.2;

    // Klap, crash en riser delen één zending naar de galm.
    const drumGalm = gain(0.22, g.galm);

    // Riser: ruis door een bandfilter dat omhoog schuift (spurt en vlak voor een refrein).
    g.rAmp = gain(0, g.mix);
    g.rAmp.connect(drumGalm);
    g.rBp = filter('bandpass', 400, 1.4, g.rAmp);
    const rb = ctx.createBufferSource();
    rb.buffer = bron.ruis; rb.loop = true;
    rb.connect(g.rBp); rb.start(t0);
    g.nodes.push(rb); g.bronnen.push(rb);

    // Vaste filters voor de drumslagen.
    g.hatHp = filter('highpass', 6500, 0.6, g.mix);
    g.klapBp = filter('bandpass', 1200, 0.7, g.mix);
    g.klapBp.connect(drumGalm);
    g.crashHp = filter('highpass', 5000, 0.5, g.mix);
    g.crashHp.connect(drumGalm);

    gedeeld.set(dest, g);
    levend.add(g);
    return g;
  }

  function dispose(dest) {
    const g = dest && dest.arcade ? dest : gedeeld.get(dest);
    if (!g) return;
    gedeeld.delete(dest);
    levend.delete(g);
    const t = g.ctx.currentTime;
    for (const o of g.bronnen) { try { o.stop(t + 0.01); } catch (e) { /* al gestopt */ } }
    for (const n of g.nodes) { try { n.disconnect(); } catch (e) { /* al los */ } }
    g.nodes.length = 0; g.bronnen.length = 0;
  }

  // ---- hulpjes voor de automatisering ----------------------------------------------------
  const naar = (p, v, t, tau, direct) => { if (direct) p.setValueAtTime(v, t); else p.setTargetAtTime(v, t, tau); };
  const tussen = ([a, b], f) => a * Math.pow(b / a, f);      // geometrisch: klinkt gelijkmatig

  /** Begin van een maat (of na een pauze, een tempowissel of de spurt): akkoord, filters, volumes. */
  function maatBegin(g, mi, t, d, spurt, level) {
    const M = MATEN[mi], S = SECTIES[M.sec];
    const f = M.lengte > 1 ? M.inSec / (M.lengte - 1) : 1;
    const eerste = g.maat < 0, tau = d * MAAT * 0.3;
    // Pad: naar het nieuwe akkoord glijden (of er meteen op beginnen).
    if (g.akk !== M.akk) {
      M.akk.pad.forEach((n, v) => {
        for (const o of g.padO[v]) naar(o.frequency, hz(n), t, 0.01, eerste);
      });
      g.akk = M.akk;
    }
    // in de spurt gaan de filters per maat een stukje verder open
    const open = spurt ? 1.2 + 0.6 * Math.min(1, g.spurtTel / 20) : 1, lv = 1 + 0.04 * Math.min(5, level - 1);
    naar(g.padLp.frequency, Math.min(3800, tussen(S.padLp, f) * open), t, tau, eerste);
    naar(g.arpLp.frequency, Math.min(3400, tussen(S.arpLp, f) * open * lv), t, tau, eerste);
    naar(g.padNiveau.gain, PAD * S.pad, t, eerste ? 0.25 : tau, false);
    naar(g.leadZG.gain, S.zaag, t, 0.05, eerste);
    naar(g.leadOG.gain, S.oct, t, 0.05, eerste);
    g.basTop = (spurt ? 1.35 : 1) * S.basTop;
    g.basBodem = (spurt ? 1.2 : 1) * S.basBodem;
    g.leadTop = M.sec === 'brk' ? 2600 : 3200;
    g.leadBodem = M.sec === 'brk' ? 1800 : 2300;
    g.pompDiep = spurt ? 0.35 : S.pomp;
    // De echo blijft op een gepunteerde achtste, ook als het tempo verandert.
    if (g.dl && Math.abs(d - g.d) > 1e-9) {
      for (const x of [g.dl, g.dr]) naar(x.delayTime, 3 * d, t, 0.04, g.d === 0);
    }
    g.maat = mi; g.spurt = spurt; g.d = d;
  }

  // ---- de instrumenten -------------------------------------------------------------------

  /** Een ruisslag (hihat, klap, crash): bron + volumeknop, daarna vanzelf weg. */
  function ruisSlag(g, t, naarNode, vel, aanzet, tau, klap) {
    const ctx = g.ctx, src = ctx.createBufferSource(), a = ctx.createGain(), p = a.gain;
    src.buffer = g.ruis; src.loop = true;
    // Meteen op 0: een bron begint op het beeldje waar t in valt, de automatisering pas op
    // het volgende. Met de standaardwaarde 1 glipt er anders één sample vol door (een tik).
    p.value = 0;
    p.setValueAtTime(0, t);
    let t1 = t + aanzet;
    if (klap) {
      // drie snelle tikjes vlak na elkaar: zo klinkt een handklap
      p.linearRampToValueAtTime(vel * 0.8, t + 0.001);
      p.linearRampToValueAtTime(vel * 0.15, t + 0.008);
      p.linearRampToValueAtTime(vel * 0.9, t + 0.0095);
      p.linearRampToValueAtTime(vel * 0.15, t + 0.017);
      t1 = t + 0.0185;
    }
    p.linearRampToValueAtTime(vel, t1);
    p.setTargetAtTime(0, t1, tau);
    src.connect(a); a.connect(naarNode);
    src.start(t, hash(g.slag++) * 0.8);
    src.stop(t1 + tau * 8);
  }

  function kick(g, t, vel, d) {
    const ctx = g.ctx, o = ctx.createOscillator(), a = ctx.createGain();
    a.gain.value = 0;
    // Eerst de beginwaarde zelf: anders speelt Chrome de eerste ~1 ms op 440 Hz (een tik).
    o.frequency.value = 165;
    o.frequency.setValueAtTime(165, t);
    o.frequency.exponentialRampToValueAtTime(64, t + 0.035);
    o.frequency.exponentialRampToValueAtTime(52, t + 0.2);
    a.gain.setValueAtTime(0, t);
    a.gain.setTargetAtTime(vel, t, 0.0012);           // geen knik in de aanzet: geen tik
    a.gain.setTargetAtTime(0, t + 0.007, 0.065);
    o.connect(a); a.connect(g.mix);
    o.start(t); o.stop(t + 0.6);
    // pad en arpeggio duiken even weg en komen in de loop van de tel terug (sidechain)
    const p = g.pomp.gain;
    p.setTargetAtTime(g.pompDiep, t, 0.008);
    p.setTargetAtTime(1, t + 0.05, d * 1.3);
  }

  function bas(g, t, m, vel, gate) {
    const f = hz(m);
    g.basZ.frequency.setValueAtTime(f, t);
    g.basS.frequency.setValueAtTime(f, t);
    const a = g.basAmp.gain, lp = g.basLp.frequency;
    a.setTargetAtTime(vel * BAS, t, 0.002);
    a.setTargetAtTime(vel * BAS * 0.55, t + 0.012, 0.06);
    a.setTargetAtTime(0, t + gate, 0.012);
    lp.setTargetAtTime(g.basTop * (0.6 + 0.4 * vel), t, 0.002);
    lp.setTargetAtTime(g.basBodem, t + 0.008, 0.045);
  }

  function arp(g, t, m, vel, tau) {
    g.arpO.frequency.setValueAtTime(hz(m), t);
    const a = g.arpAmp.gain;
    a.setTargetAtTime(vel * ARP, t, 0.0015);
    a.setTargetAtTime(0, t + 0.006, tau);
  }

  function lead(g, t, L, d, vel) {
    const f = hz(L.m);
    for (const [o, x] of [[g.leadT, 1], [g.leadZ, 1], [g.leadO, 0.5]]) {
      if (L.glij) o.frequency.setTargetAtTime(f * x, t, 0.012);     // glijden
      else o.frequency.setValueAtTime(f * x, t);
    }
    const gate = L.len * d - Math.min(0.035, d * 0.3);
    const a = g.leadAmp.gain, lp = g.leadLp.frequency;
    a.setTargetAtTime(vel * LEAD, t, 0.006);
    a.setTargetAtTime(vel * LEAD * 0.72, t + 0.03, 0.18);
    a.setTargetAtTime(0, t + gate, 0.05);
    lp.setTargetAtTime(g.leadTop, t, 0.004);
    lp.setTargetAtTime(g.leadBodem, t + 0.02, 0.2);
  }

  // ---- één zestiende ---------------------------------------------------------------------

  function stap(ctx, dest, i, t, d, intens) {
    const g = gedeeld.get(dest) || setup(ctx, dest);
    const spurt = !!(intens && intens.spurt);
    const level = Math.max(1, (intens && intens.level) || 1);
    const meld = intens && typeof intens.opNoot === 'function' ? intens.opNoot : null;
    const s = ((i % STAPPEN) + STAPPEN) % STAPPEN, q = s % MAAT, mi = (s / MAAT) | 0, tel = q % 4;
    const M = MATEN[mi], S = SECTIES[M.sec], laatste = M.inSec === M.lengte - 1;
    if (mi !== g.maat || spurt !== g.spurt || Math.abs(d - g.d) > 1e-9 || (spurt && q === 8)) maatBegin(g, mi, t, d, spurt, level);
    if (meld && q === 0) meld('pad', t);

    // -- bassdrum: vier op de vloer; in de break alleen de eerste tel en de laatste maat
    const kickNu = spurt || S.kick === 'vier' ? tel === 0 : (M.inSec === 0 && q === 0) || (laatste && tel === 0);
    if (kickNu) { kick(g, t, KICK, d); if (meld) meld('kick', t); }

    // -- klap op 2 en 4; in de laatste maat van de break een roffel die aanzwelt
    let klap = 0;
    if (S.clap === 'roffel' && !spurt) {
      if (laatste) { if (q >= 8 || q % 2 === 0) klap = 0.22 + 0.6 * q / 15; }
      else if (M.inSec === M.lengte - 2 && q === 12) klap = 0.35;
    } else if (q === 4 || q === 12) klap = 1;
    // in de tweede helft van de spurt zachte klappen op elke achtste, steeds iets harder
    else if (spurt && g.spurtTel >= 14 && q % 2 === 0) klap = Math.min(0.55, 0.22 + 0.025 * (g.spurtTel - 14));
    if (klap) { ruisSlag(g, t, g.klapBp, KLAP * klap, 0, klap < 1 ? 0.03 : 0.06, true); if (meld) meld('snare', t); }

    // -- hihats
    let hat = 0, open = false;
    if (spurt) {
      // dubbel zo druk, en om de maat een roffel in tweeëndertigsten naar de volgende maat
      hat = tel === 2 ? 0.95 : tel === 0 ? 0.55 : 0.42; open = tel === 2;
      if (mi % 2 === 1 && q >= 12) {
        const v = 0.3 + 0.12 * (q - 12);
        ruisSlag(g, t + d / 2, g.hatHp, HAT * v, 0.001, 0.012);
        if (meld) meld('hihat', t + d / 2);
      }
    } else {
      const shaker = level >= 3 ? 0.22 : 0;
      switch (S.hat) {
        case 'intro': if (tel === 2) { hat = 0.6; open = true; } else if (shaker && q % 2) hat = shaker; break;
        case 'a': if (tel === 2) { hat = 0.75; open = true; } else if (q % 2) hat = 0.26 + 0.08 * hash(s); break;
        case 'b': if (tel === 2) { hat = 0.85; open = true; } else if (q % 2) hat = 0.3 + 0.1 * hash(s); break;
        case 'b2': if (tel === 2) { hat = 0.9; open = true; } else hat = (tel === 0 ? 0.24 : 0.34) + 0.1 * hash(s); break;
        case 'brk': if (laatste) hat = 0.2 + 0.5 * q / 15; else if (q % 4 === 2) hat = 0.25; break;
      }
    }
    if (hat) { ruisSlag(g, t, g.hatHp, HAT * hat, 0.0015, open ? 0.055 : 0.016); if (meld) meld('hihat', t); }

    // -- bas
    const basSoort = spurt && (S.bas === 'intro' || S.bas === 'brk') ? 'b' : S.bas;
    let bOff = null, bVel = 0, bGate = 0.7 * d, bRoot = M.akk.bas;
    if (basSoort === 'intro') {
      // eerst alleen een zachte bas op de tegentijd, de tweede helft er een tikje bij
      if (tel === 2) { bOff = 0; bVel = M.inSec < 2 ? 0.5 : 0.75; bGate = 1.5 * d; }
      else if (M.inSec >= 2 && tel === 3) { bOff = 12; bVel = 0.45; }
    } else if (basSoort === 'brk') {
      if (laatste) { bOff = 0; bVel = 0.3 + 0.6 * q / 15; }
      else if (q === 0) { bOff = 0; bVel = 0.75; bGate = 15.5 * d; }
    } else {
      bOff = basSoort === 'b' ? (tel === 2 ? 12 : 0) : (q === 6 || q === 14 ? 12 : 0);
      bVel = [0.42, 0.68, 0.95, 0.68][tel];
      // de laatste zestiende van de maat speelt alvast de grondtoon van de volgende
      if (q === 15 && M.volgende.bas !== M.akk.bas) { bRoot = M.volgende.bas; bOff = 0; bVel = 0.75; }
    }
    if (bOff !== null) { bas(g, t, bRoot + bOff, bVel, bGate); if (meld) meld('bas', t); }

    // -- arpeggio
    const patroon = spurt && S.arp === ARP_BRK ? ARP_B : S.arp, idx = patroon[q];
    if (idx >= 0) {
      const v = S.arpVel * (tel === 0 ? 1 : 0.8) * (0.94 + 0.12 * hash(s + 1009));
      arp(g, t, M.akk.arp[idx & 3] + 12 * (idx >> 2), v, patroon === ARP_BRK ? d * 0.9 : d * 0.6);
      if (meld) meld('arp', t);
    }

    // -- melodie
    const L = NOTEN[s];
    if (L && S.leadVel) { lead(g, t, L, d, S.leadVel); if (meld) meld('lead', t); }

    // -- crash aan het begin van een stuk (en in de spurt om de vier maten)
    if (q === 0 && ((M.inSec === 0 && S.crash) || (spurt && mi % 4 === 0))) {
      ruisSlag(g, t, g.crashHp, CRASH, 0.003, 0.4);
      if (meld) meld('crash', t);
    }

    // -- riser: in de spurt elke tel een stukje hoger en harder; anders een korte
    //    uplifter vlak voor een refrein
    if (spurt) {
      if (tel === 0) {
        const k = g.spurtTel++, tau = 4 * d * 0.6;
        g.rBp.frequency.setTargetAtTime(Math.min(5000, 380 * Math.pow(2, k * 0.15)), t, tau);
        g.rAmp.gain.setTargetAtTime(RISER * Math.min(1, 0.12 + k * 0.04), t, tau);
        if (meld) meld('riser', t);
      }
    } else {
      if (g.spurtTel) { g.spurtTel = 0; g.rAmp.gain.setTargetAtTime(0, t, 0.08); }
      if (q === M.op) {
        const dur = (MAAT - q) * d;
        g.rBp.frequency.setTargetAtTime(350, t, 0.005);
        g.rBp.frequency.setTargetAtTime(4200, t + 0.02, dur * 0.45);
        g.rAmp.gain.setTargetAtTime(RISER * 0.55, t, dur * 0.5);
        g.rAmp.gain.setTargetAtTime(0, t + dur, 0.025);
        if (meld) meld('riser', t);
      }
    }
  }

  return {
    sleutel: 'arcade',
    naam: { nl: 'Arcade', en: 'Arcade' },
    tempo: TEMPO,                 // tellen per minuut
    stappenPerMaat: MAAT,
    stappen: STAPPEN,             // de hele vorm, daarna begint hij weer bij de intro
    // De hoogste piek die de stijl zelf afgeeft (vóór MUZIEK_VOLUME), gemeten in Chrome
    // over de hele vorm plus spurt: 0,33 (-9,7 dBFS). Voor de test "muziek zachter dan
    // de effecten". Luidheid ongeveer -21 LUFS, net iets zachter dan de oude muziek.
    luidst: 0.33,
    // Waar elk stuk begint (in zestienden), voor tests en uitleg.
    secties: MATEN.map((M, m) => [m * MAAT, M.sec]).filter((x, m) => m === 0 || MATEN[m - 1].sec !== MATEN[m].sec),
    setup,
    stap,
    dispose,
  };
})();
