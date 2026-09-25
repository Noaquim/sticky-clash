// QR-code maken, zonder bibliotheek. Precies genoeg voor een internetadres: bytes
// (UTF-8), foutcorrectie M (ongeveer 15% van de code mag onleesbaar zijn, handig op een
// muur met een bult of een schaduw), versie 1 t/m 10: 21 tot 57 blokjes breed.
// Volgens de norm ISO/IEC 18004. test/qr.mjs leest elke code terug met een eigen
// decoder, en controleert zoekers, formaat, foutcorrectie en inhoud.

// Per versie (index = versie) bij foutcorrectie M: codewoorden foutcorrectie per blok,
// en in hoeveel blokken de code verdeeld wordt.
const QR_ECC_PER_BLOK = [0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26];
const QR_BLOKKEN = [0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5];
export const QR_MAX_VERSIE = 10;

// Rekenen in GF(256), het getallenstelsel van de foutcorrectie (Reed–Solomon):
// optellen is xor, vermenigvuldigen gaat via logaritmen. Grondpolynoom 0x11d.
const QR_EXP = new Uint8Array(512);
const QR_LOG = new Uint8Array(256);
for (let i = 0, x = 1; i < 255; i++) {
  QR_EXP[i] = x; QR_LOG[x] = i;
  x <<= 1;
  if (x & 0x100) x ^= 0x11d;
}
for (let i = 255; i < 512; i++) QR_EXP[i] = QR_EXP[i - 255];

function qrMaal(a, b) {
  return a && b ? QR_EXP[QR_LOG[a] + QR_LOG[b]] : 0;
}

/** Hoeveel codewoorden (van 8 bits) er in totaal in een code van deze versie passen. */
function qrCodewoorden(v) {
  let n = (16 * v + 128) * v + 64;              // alle blokjes min zoekers, tijdlijnen en formaat
  if (v >= 2) {
    const a = Math.floor(v / 7) + 2;            // uitlijnpatronen per rij
    n -= (25 * a - 10) * a - 55;
  }
  if (v >= 7) n -= 36;                          // versie-informatie
  return n >> 3;                                // de rest (0 tot 7 bits) blijft leeg
}

/** Hoeveel bytes tekst er in een code van deze versie passen (bytemodus, M). */
export function qrCapaciteit(v) {
  const bits = (qrCodewoorden(v) - QR_ECC_PER_BLOK[v] * QR_BLOKKEN[v]) * 8;
  return Math.floor((bits - 4 - (v < 10 ? 8 : 16)) / 8);
}

/** Middens van de uitlijnpatronen (zowel x als y), leeg voor versie 1. */
function qrUitlijnPlekken(v) {
  if (v === 1) return [];
  const aantal = Math.floor(v / 7) + 2, maat = v * 4 + 17;
  const stap = Math.ceil((v * 4 + 4) / (aantal * 2 - 2)) * 2;
  const uit = [6];
  for (let p = maat - 7; uit.length < aantal; p -= stap) uit.splice(1, 0, p);
  return uit;
}

/** De vaste deler van de foutcorrectie: (x - a^0)(x - a^1)...(x - a^(n-1)), zonder de hoogste 1. */
function qrDeler(n) {
  const g = new Uint8Array(n);
  g[n - 1] = 1;
  let wortel = 1;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      g[j] = qrMaal(g[j], wortel);
      if (j + 1 < n) g[j] ^= g[j + 1];
    }
    wortel = qrMaal(wortel, 2);
  }
  return g;
}

/** Foutcorrectie bij een blok: de rest na delen door de deler. */
function qrRest(data, deler) {
  const rest = new Uint8Array(deler.length);
  for (const b of data) {
    const f = b ^ rest[0];
    rest.copyWithin(0, 1);
    rest[rest.length - 1] = 0;
    for (let i = 0; i < rest.length; i++) rest[i] ^= qrMaal(deler[i], f);
  }
  return rest;
}

/** Valt de module op (x, y) donker uit onder masker m? (x = kolom, y = rij) */
function qrMasker(m, x, y) {
  switch (m) {
    case 0: return (x + y) % 2 === 0;
    case 1: return y % 2 === 0;
    case 2: return x % 3 === 0;
    case 3: return (x + y) % 3 === 0;
    case 4: return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;
    case 5: return (x * y) % 2 + (x * y) % 3 === 0;
    case 6: return ((x * y) % 2 + (x * y) % 3) % 2 === 0;
    default: return ((x + y) % 2 + (x * y) % 3) % 2 === 0;
  }
}

/**
 * Strafpunten voor een masker, de vier regels uit de norm: lange rijen van één kleur,
 * blokken van 2×2, iets wat op een zoeker lijkt (1:1:3:1:1 met licht ernaast; de rand
 * buiten de code telt als licht), en te veel of te weinig donker.
 */
function qrStraf(d, n) {
  let straf = 0;
  const reeks = [0, 0, 0, 0, 0, 0, 0];           // lengtes van de laatste zeven stukken, nieuwste eerst
  const lijnen = (horizontaal) => {
    for (let a = 0; a < n; a++) {
      let kleur = 0, lengte = 0;
      reeks.fill(0);
      for (let b = 0; b < n; b++) {
        const c = horizontaal ? d[a * n + b] : d[b * n + a];
        if (c === kleur) {
          lengte++;
          if (lengte === 5) straf += 3;
          else if (lengte > 5) straf++;
        } else {
          qrReeks(reeks, lengte, n);
          if (!kleur) straf += qrZoekerTel(reeks) * 40;
          kleur = c; lengte = 1;
        }
      }
      // afsluiten: een donker stuk eerst afmaken, dan de lichte rand erachter
      if (kleur) { qrReeks(reeks, lengte, n); lengte = 0; }
      qrReeks(reeks, lengte + n, n);
      straf += qrZoekerTel(reeks) * 40;
    }
  };
  lijnen(true);
  lijnen(false);
  for (let y = 0; y < n - 1; y++) {
    for (let x = 0; x < n - 1; x++) {
      const c = d[y * n + x];
      if (c === d[y * n + x + 1] && c === d[(y + 1) * n + x] && c === d[(y + 1) * n + x + 1]) straf += 3;
    }
  }
  // elke 5% verder van half donker, half licht: 10 punten
  let donker = 0;
  for (let i = 0; i < d.length; i++) donker += d[i];
  const totaal = n * n;
  straf += Math.floor(Math.abs(donker * 20 - totaal * 10) / totaal) * 10;
  return straf;
}

function qrReeks(reeks, lengte, n) {
  if (reeks[0] === 0) lengte += n;              // het allereerste stuk grenst aan de lichte rand
  reeks.pop();
  reeks.unshift(lengte);
}

/** Hoe vaak het net afgesloten stuk een zoeker-vorm afmaakt (0, 1 of 2 kanten). */
function qrZoekerTel(r) {
  const n = r[1];
  const kern = n > 0 && r[2] === n && r[3] === n * 3 && r[4] === n && r[5] === n;
  return (kern && r[0] >= n * 4 && r[6] >= n ? 1 : 0) + (kern && r[6] >= n * 4 && r[0] >= n ? 1 : 0);
}

/**
 * Maakt de QR-code voor een tekst. De kleinste versie waar hij in past, en van de acht
 * maskers het masker met de minste strafpunten.
 * Geeft { versie, grootte, masker, donker } — donker[y * grootte + x] is 1 voor zwart.
 */
export function qrMaak(tekst) {
  const bytes = new TextEncoder().encode(String(tekst));
  let v = 1;
  while (v <= QR_MAX_VERSIE && qrCapaciteit(v) < bytes.length) v++;
  if (v > QR_MAX_VERSIE) throw new Error('te lang voor een QR-code: ' + bytes.length + ' bytes, er passen er ' + qrCapaciteit(QR_MAX_VERSIE));
  const totaal = qrCodewoorden(v), eccN = QR_ECC_PER_BLOK[v], blokken = QR_BLOKKEN[v];
  const dataN = totaal - eccN * blokken;

  // ---- de bits: modus 0100 (bytes), de lengte, de bytes, een afsluiter en opvulling
  const bits = [];
  const zet = (waarde, lengte) => { for (let i = lengte - 1; i >= 0; i--) bits.push((waarde >>> i) & 1); };
  zet(4, 4);
  zet(bytes.length, v < 10 ? 8 : 16);
  for (const b of bytes) zet(b, 8);
  zet(0, Math.min(4, dataN * 8 - bits.length));
  zet(0, (8 - bits.length % 8) % 8);
  const data = new Uint8Array(dataN);
  let k = 0;
  for (; k < bits.length / 8; k++) {
    let b = 0;
    for (let i = 0; i < 8; i++) b = (b << 1) | bits[k * 8 + i];
    data[k] = b;
  }
  for (let p = 0; k < dataN; k++, p++) data[k] = p % 2 ? 0x11 : 0xec;

  // ---- in blokken, elk met eigen foutcorrectie; daarna om en om verweven
  const kort = blokken - totaal % blokken;       // zoveel blokken zijn één codewoord korter
  const kortData = Math.floor(totaal / blokken) - eccN;
  const deler = qrDeler(eccN);
  const blokData = [], blokEcc = [];
  for (let i = 0, o = 0; i < blokken; i++) {
    const len = kortData + (i < kort ? 0 : 1);
    const stuk = data.subarray(o, o + len);
    o += len;
    blokData.push(stuk);
    blokEcc.push(qrRest(stuk, deler));
  }
  const woorden = [];
  for (let i = 0; i <= kortData; i++) {
    for (const b of blokData) if (i < b.length) woorden.push(b[i]);
  }
  for (let i = 0; i < eccN; i++) {
    for (const e of blokEcc) woorden.push(e[i]);
  }

  // ---- de vaste patronen
  const n = v * 4 + 17;
  const donker = new Uint8Array(n * n), vast = new Uint8Array(n * n);
  const zetMod = (x, y, c) => { donker[y * n + x] = c ? 1 : 0; vast[y * n + x] = 1; };
  for (let i = 0; i < n; i++) { zetMod(6, i, i % 2 === 0); zetMod(i, 6, i % 2 === 0); }   // tijdlijnen
  for (const [cx, cy] of [[3, 3], [n - 4, 3], [3, n - 4]]) {                                // zoekers
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const x = cx + dx, y = cy + dy, r = Math.max(Math.abs(dx), Math.abs(dy));
        if (x >= 0 && x < n && y >= 0 && y < n) zetMod(x, y, r !== 2 && r !== 4);
      }
    }
  }
  const plekken = qrUitlijnPlekken(v), laatste = plekken.length - 1;
  for (let i = 0; i <= laatste; i++) {
    for (let j = 0; j <= laatste; j++) {
      // niet op de drie zoekers
      if ((i === 0 && j === 0) || (i === 0 && j === laatste) || (i === laatste && j === 0)) continue;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) zetMod(plekken[i] + dx, plekken[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
      }
    }
  }
  qrFormaat(zetMod, n, 0);                       // plek vrijhouden; de echte bits komen na het masker
  if (v >= 7) {
    let rest = v;
    for (let i = 0; i < 12; i++) rest = (rest << 1) ^ ((rest >>> 11) * 0x1f25);
    const vb = (v << 12) | rest;
    for (let i = 0; i < 18; i++) {
      const c = (vb >>> i) & 1, a = n - 11 + i % 3, b = Math.floor(i / 3);
      zetMod(a, b, c); zetMod(b, a, c);
    }
  }

  // ---- de codewoorden zigzaggend in twee kolommen tegelijk, van rechtsonder naar boven
  let i = 0;
  for (let rechts = n - 1; rechts >= 1; rechts -= 2) {
    if (rechts === 6) rechts = 5;                  // de verticale tijdlijn overslaan
    const omhoog = ((rechts + 1) & 2) === 0;
    for (let s = 0; s < n; s++) {
      const y = omhoog ? n - 1 - s : s;
      for (let j = 0; j < 2; j++) {
        const x = rechts - j, p = y * n + x;
        if (vast[p]) continue;
        if (i < woorden.length * 8) { donker[p] = (woorden[i >>> 3] >>> (7 - (i & 7))) & 1; i++; }
      }
    }
  }

  // ---- alle acht maskers proberen, het beste houden
  const proef = new Uint8Array(n * n);
  const zetProef = (x, y, c) => { proef[y * n + x] = c ? 1 : 0; };
  let beste = 0, besteStraf = Infinity;
  for (let m = 0; m < 8; m++) {
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const p = y * n + x;
        proef[p] = !vast[p] && qrMasker(m, x, y) ? donker[p] ^ 1 : donker[p];
      }
    }
    qrFormaat(zetProef, n, m);
    const s = qrStraf(proef, n);
    if (s < besteStraf) { besteStraf = s; beste = m; }
  }
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const p = y * n + x;
      if (!vast[p] && qrMasker(beste, x, y)) donker[p] ^= 1;
    }
  }
  qrFormaat(zetMod, n, beste);
  return { versie: v, grootte: n, masker: beste, donker };
}

/** Formaatinformatie: foutcorrectie M (00) en het masker, beschermd met BCH, twee keer. */
function qrFormaat(zet, n, masker) {
  const data = masker;                           // M = 00, dus alleen het masker
  let rest = data;
  for (let i = 0; i < 10; i++) rest = (rest << 1) ^ ((rest >>> 9) * 0x537);
  const b = ((data << 10) | rest) ^ 0x5412;
  const bit = (i) => (b >>> i) & 1;
  for (let i = 0; i <= 5; i++) zet(8, i, bit(i));
  zet(8, 7, bit(6));
  zet(8, 8, bit(7));
  zet(7, 8, bit(8));
  for (let i = 9; i < 15; i++) zet(14 - i, 8, bit(i));
  for (let i = 0; i < 8; i++) zet(n - 1 - i, 8, bit(i));
  for (let i = 8; i < 15; i++) zet(8, n - 15 + i, bit(i));
  zet(8, n - 8, 1);                              // altijd donker
}

/**
 * Tekent de code: wit vlak met een stille rand van `rand` blokjes (de norm wil er vier),
 * zwarte blokjes erop. (x, y) is de linkerbovenhoek, `maat` de breedte inclusief rand.
 */
export function qrTeken(ctx, qr, x, y, maat, rand = 4) {
  const n = qr.grootte, m = maat / (n + rand * 2);
  ctx.fillStyle = '#fff';
  ctx.fillRect(x, y, maat, maat);
  ctx.fillStyle = '#000';
  for (let r = 0; r < n; r++) {
    const y0 = Math.round(y + (r + rand) * m), y1 = Math.round(y + (r + rand + 1) * m);
    for (let c = 0; c < n; c++) {
      if (!qr.donker[r * n + c]) continue;
      let e = c;                                 // een hele reeks donkere blokjes in één keer
      while (e + 1 < n && qr.donker[r * n + e + 1]) e++;
      const x0 = Math.round(x + (c + rand) * m), x1 = Math.round(x + (e + 1 + rand) * m);
      ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
      c = e;
    }
  }
}
