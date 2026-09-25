// De QR-codes uit js/qr.js, teruggelezen met een eigen, los geschreven decoder:
// zoekers, tijdlijnen, uitlijning, formaat- en versie-informatie (BCH), de foutcorrectie
// van elk blok (alle syndromen nul) en de inhoud zelf. Plus: de kleinste versie die past,
// en het masker met de minste strafpunten. Dat een telefoon ze echt leest is los
// nagemeten met OpenCV (zie README, "Bedienen met je telefoon").
import { check, klaar, rng } from './hulp.mjs';
import { qrMaak, qrCapaciteit, QR_MAX_VERSIE } from '../js/qr.js';

// ---- de norm, overgeschreven (tabel 9 en bijlage E van ISO/IEC 18004), alleen M
// per versie: [foutcorrectie per blok, [aantal blokken, codewoorden per blok, data per blok]...]
const BLOKKEN = [null,
  [10, [1, 26, 16]], [16, [1, 44, 28]], [26, [1, 70, 44]], [18, [2, 50, 32]], [24, [2, 67, 43]],
  [16, [4, 43, 27]], [18, [4, 49, 31]], [22, [2, 60, 38], [2, 61, 39]], [22, [3, 58, 36], [2, 59, 37]],
  [26, [4, 69, 43], [1, 70, 44]]];
const UITLIJN = [null, [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]];
// maskers met i = rij, j = kolom, precies zoals in de norm
const MASKERS = [
  (i, j) => (i + j) % 2 === 0,
  (i) => i % 2 === 0,
  (i, j) => j % 3 === 0,
  (i, j) => (i + j) % 3 === 0,
  (i, j) => (Math.floor(i / 2) + Math.floor(j / 3)) % 2 === 0,
  (i, j) => ((i * j) % 2) + ((i * j) % 3) === 0,
  (i, j) => (((i * j) % 2) + ((i * j) % 3)) % 2 === 0,
  (i, j) => (((i + j) % 2) + ((i * j) % 3)) % 2 === 0,
];

// GF(256) zonder tabellen: schuiven en terugbrengen met 0x11d
function gfMaal(a, b) {
  let r = 0;
  while (b) {
    if (b & 1) r ^= a;
    a <<= 1; if (a & 0x100) a ^= 0x11d;
    b >>= 1;
  }
  return r;
}
function gfMacht(a, e) { let r = 1; for (let i = 0; i < e; i++) r = gfMaal(r, a); return r; }

/** Rest van een getal (als veelterm over GF(2)) na delen door g. */
function bchRest(w, g) {
  const gl = 31 - Math.clz32(g);
  for (let b = 31 - Math.clz32(w); b >= gl; b--) if (w & (1 << b)) w ^= g << (b - gl);
  return w;
}

/** Welke modules vaste patronen zijn, los opgebouwd uit de norm. */
function vasteKaart(v) {
  const n = 17 + 4 * v, k = new Uint8Array(n * n);
  const zet = (r, c) => { if (r >= 0 && c >= 0 && r < n && c < n) k[r * n + c] = 1; };
  // zoekers met scheiding en formaatbits (en de donkere module linksonder)
  for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) zet(r, c);
  for (let r = 0; r < 9; r++) for (let c = 0; c < 8; c++) zet(r, n - 1 - c);
  for (let r = 0; r < 8; r++) for (let c = 0; c < 9; c++) zet(n - 1 - r, c);
  for (let i = 0; i < n; i++) { zet(6, i); zet(i, 6); }
  const u = UITLIJN[v];
  for (const r of u) for (const c of u) {
    if ((r === 6 && c === 6) || (r === 6 && c === u[u.length - 1]) || (r === u[u.length - 1] && c === 6)) continue;
    for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) zet(r + dr, c + dc);
  }
  if (v >= 7) for (let a = 0; a < 6; a++) for (let b = 0; b < 3; b++) { zet(a, n - 11 + b); zet(n - 11 + b, a); }
  return k;
}

/** Posities van de formaatbits, bit 14 (hoogste) eerst: [rij, kolom] voor beide kopieën. */
function formaatPlekken(n) {
  const een = [], twee = [];
  // kopie 1: rij 8 van links (kolom 0..5, 7, 8), dan kolom 8 omhoog (rij 7, 5..0)
  for (const c of [0, 1, 2, 3, 4, 5, 7, 8]) een.push([8, c]);
  for (const r of [7, 5, 4, 3, 2, 1, 0]) een.push([r, 8]);
  // kopie 2: kolom 8 van onder naar boven (7 bits), dan rij 8 rechts (8 bits)
  for (let r = n - 1; r >= n - 7; r--) twee.push([r, 8]);
  for (let c = n - 8; c < n; c++) twee.push([8, c]);
  return [een, twee];
}

/** Leest een code volledig terug. Geeft { fouten: [...], tekst, masker }. */
function lees(qr) {
  const f = [], n = qr.grootte, d = qr.donker, v = (n - 17) / 4;
  const M = (r, c) => d[r * n + c];
  if (!Number.isInteger(v) || v < 1 || v > 10 || d.length !== n * n) return { fouten: ['maat ' + n] };
  if (qr.versie !== v) f.push('versie klopt niet bij maat');
  // zoekers met scheidingsrand
  for (const [r0, c0] of [[0, 0], [0, n - 7], [n - 7, 0]]) {
    for (let r = -1; r <= 7; r++) for (let c = -1; c <= 7; c++) {
      const rr = r0 + r, cc = c0 + c;
      if (rr < 0 || cc < 0 || rr >= n || cc >= n) continue;
      const ring = Math.max(Math.abs(r - 3), Math.abs(c - 3));
      const moet = ring === 4 ? 0 : (ring === 2 ? 0 : 1);
      if (M(rr, cc) !== moet) { f.push('zoeker bij ' + r0 + ',' + c0); r = 99; break; }
    }
  }
  for (let i = 8; i < n - 8; i++) {
    if (M(6, i) !== (i % 2 ? 0 : 1) || M(i, 6) !== (i % 2 ? 0 : 1)) { f.push('tijdlijn'); break; }
  }
  if (M(n - 8, 8) !== 1) f.push('donkere module');
  const u = UITLIJN[v];
  for (const r of u) for (const c of u) {
    if ((r === 6 && c === 6) || (r === 6 && c === u[u.length - 1]) || (r === u[u.length - 1] && c === 6)) continue;
    for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) {
      if (M(r + dr, c + dc) !== (Math.max(Math.abs(dr), Math.abs(dc)) === 1 ? 0 : 1)) { f.push('uitlijning ' + r + ',' + c); dr = 9; break; }
    }
  }
  // formaatinformatie: twee gelijke kopieën, geldig BCH-woord, niveau M
  const [p1, p2] = formaatPlekken(n);
  const woord = (pl) => pl.reduce((w, [r, c]) => (w << 1) | M(r, c), 0);
  const f1 = woord(p1), f2 = woord(p2);
  if (f1 !== f2) f.push('formaat: kopieën verschillen');
  const fo = f1 ^ 0x5412;
  if (bchRest(fo, 0x537) !== 0) f.push('formaat: BCH klopt niet');
  if ((fo >> 13) !== 0) f.push('formaat: niet niveau M');
  const masker = (fo >> 10) & 7;
  if (masker !== qr.masker) f.push('formaat: ander masker dan opgegeven');
  if (v >= 7) {
    let a = 0, b = 0;
    for (let i = 17; i >= 0; i--) {
      a = (a << 1) | M(Math.floor(i / 3), n - 11 + i % 3);
      b = (b << 1) | M(n - 11 + i % 3, Math.floor(i / 3));
    }
    if (a !== b) f.push('versie-informatie: kopieën verschillen');
    if (bchRest(a, 0x1f25) !== 0) f.push('versie-informatie: BCH klopt niet');
    if ((a >> 12) !== v) f.push('versie-informatie: verkeerde versie');
  }
  // de bits zigzaggend uitlezen en het masker eraf halen
  const vast = vasteKaart(v), bits = [];
  let omhoog = true;
  for (let c = n - 1; c > 0; c -= 2) {
    if (c === 6) c--;
    for (let s = 0; s < n; s++) {
      const r = omhoog ? n - 1 - s : s;
      for (const cc of [c, c - 1]) {
        if (vast[r * n + cc]) continue;
        bits.push(M(r, cc) ^ (MASKERS[masker](r, cc) ? 1 : 0));
      }
    }
    omhoog = !omhoog;
  }
  const [ecc, ...groepen] = BLOKKEN[v];
  const totaal = groepen.reduce((s, [k, t]) => s + k * t, 0);
  if (Math.floor(bits.length / 8) !== totaal) f.push('aantal codewoorden ' + Math.floor(bits.length / 8) + ' i.p.v. ' + totaal);
  for (let i = totaal * 8; i < bits.length; i++) if (bits[i]) { f.push('restbits niet leeg'); break; }
  const cw = [];
  for (let i = 0; i < totaal; i++) {
    let b = 0;
    for (let k = 0; k < 8; k++) b = (b << 1) | bits[i * 8 + k];
    cw.push(b);
  }
  // ontvlechten: eerst de data om en om, dan de foutcorrectie om en om
  const blokken = [];
  for (const [k, t, dn] of groepen) for (let i = 0; i < k; i++) blokken.push({ dn, t, data: [], ecc: [] });
  let p = 0;
  const maxD = Math.max(...blokken.map(b => b.dn));
  for (let i = 0; i < maxD; i++) for (const b of blokken) if (i < b.dn) b.data.push(cw[p++]);
  for (let i = 0; i < ecc; i++) for (const b of blokken) b.ecc.push(cw[p++]);
  // syndromen: het hele blok als veelterm, ingevuld in a^0 .. a^(ecc-1), moet overal 0 zijn
  let syndroomFout = 0;
  for (const b of blokken) {
    const alles = b.data.concat(b.ecc);
    for (let k = 0; k < ecc; k++) {
      const a = gfMacht(2, k);
      let s = 0;
      for (const c of alles) s = gfMaal(s, a) ^ c;
      if (s !== 0) { syndroomFout++; break; }
    }
  }
  if (syndroomFout) f.push(syndroomFout + ' blok(ken) met foute foutcorrectie');
  // de inhoud: modus 0100, lengte, bytes, afsluiter, opvulling EC 11 EC 11 ...
  const data = blokken.flatMap(b => b.data);
  const db = [];
  for (const b of data) for (let k = 7; k >= 0; k--) db.push((b >> k) & 1);
  let q = 0;
  const neem = (len) => { let x = 0; for (let i = 0; i < len; i++) x = (x << 1) | (db[q++] | 0); return x; };
  if (neem(4) !== 4) f.push('geen bytemodus');
  const len = neem(v < 10 ? 8 : 16);
  const bytes = [];
  for (let i = 0; i < len; i++) bytes.push(neem(8));
  const afsluiter = Math.min(4, db.length - q);
  if (neem(afsluiter) !== 0) f.push('afsluiter niet leeg');
  while (q % 8) if (neem(1)) { f.push('opvulbits niet leeg'); break; }
  for (let i = 0; q < db.length; i++) {
    if (neem(8) !== (i % 2 ? 0x11 : 0xec)) { f.push('opvulbytes'); break; }
  }
  let tekst = null;
  try { tekst = new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array(bytes)); } catch { f.push('geen geldige UTF-8'); }
  return { fouten: f, tekst, masker };
}

/** Strafpunten volgens de norm, los geschreven (lopen, 2×2, zoekervorm, verhouding). */
function straf(g, n) {
  let s = 0;
  const lijn = (get) => {
    const lopen = [];
    for (let k = 0; k < n; k++) {
      const c = get(k);
      if (lopen.length && lopen[lopen.length - 1][0] === c) lopen[lopen.length - 1][1]++;
      else lopen.push([c, 1]);
    }
    for (const [, l] of lopen) if (l >= 5) s += 3 + l - 5;
    // lichte rand eromheen (net zo breed als de code), aan lichte lopen vast
    if (lopen[0][0] === 0) lopen[0][1] += n; else lopen.unshift([0, n]);
    if (lopen[lopen.length - 1][0] === 0) lopen[lopen.length - 1][1] += n; else lopen.push([0, n]);
    for (let i = 0; i + 6 < lopen.length; i++) {
      if (lopen[i][0] !== 0 || lopen[i + 1][0] !== 1) continue;
      const m = lopen[i + 1][1];
      const kern = lopen[i + 2][1] === m && lopen[i + 3][1] === 3 * m && lopen[i + 4][1] === m && lopen[i + 5][1] === m;
      if (!kern) continue;
      const voor = lopen[i][1], na = lopen[i + 6][1];
      if (na >= 4 * m && voor >= m) s += 40;
      if (voor >= 4 * m && na >= m) s += 40;
    }
  };
  for (let r = 0; r < n; r++) lijn((k) => g[r * n + k]);
  for (let c = 0; c < n; c++) lijn((k) => g[k * n + c]);
  for (let r = 0; r + 1 < n; r++) for (let c = 0; c + 1 < n; c++) {
    const a = g[r * n + c];
    if (a === g[r * n + c + 1] && a === g[(r + 1) * n + c] && a === g[(r + 1) * n + c + 1]) s += 3;
  }
  const donker = g.reduce((a, b) => a + b, 0);
  s += Math.floor(Math.abs(donker * 100 / (n * n) - 50) / 5) * 10;
  return s;
}

/** De code zoals hij met masker m zou zijn: ander masker op de data, andere formaatbits. */
function metMasker(qr, m) {
  const n = qr.grootte, v = qr.versie, vast = vasteKaart(v), g = Uint8Array.from(qr.donker);
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    if (vast[r * n + c]) continue;
    g[r * n + c] ^= (MASKERS[qr.masker](r, c) ? 1 : 0) ^ (MASKERS[m](r, c) ? 1 : 0);
  }
  const data = m;                                // niveau M = 00
  const fo = ((data << 10) | bchRest(data << 10, 0x537)) ^ 0x5412;
  const [p1, p2] = formaatPlekken(n);
  for (const pl of [p1, p2]) pl.forEach(([r, c], i) => { g[r * n + c] = (fo >> (14 - i)) & 1; });
  return g;
}

// ---- proefteksten: alle lengtes rond elke grens, adressen, Nederlands, emoji, willekeur
const r = rng(4242);
const teksten = ['', 'a', 'Sticky Clash', 'HELLO WORLD', 'https://noaquim.github.io/sticky-clash/telefoon.html#AbCdEfGhIjKlMnOpQrSt',
  'http://localhost:8123/', 'Crème brûlée — één ijsje', '🎯🟠🔵 bal in de bak', 'naïeve café-eigenaar', '\u0000\u0001\u007f', 'ÿ'];
const tekens = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_.~/:#?&=%';
const willekeurig = (len) => { let s = ''; for (let i = 0; i < len; i++) s += tekens[Math.floor(r() * tekens.length)]; return s; };
for (let v = 1; v <= QR_MAX_VERSIE; v++) {
  const cap = qrCapaciteit(v);
  for (const len of [cap - 1, cap, cap + 1]) if (len >= 0 && len <= qrCapaciteit(QR_MAX_VERSIE)) teksten.push(willekeurig(len));
}
for (let len = 0; len <= 213; len += 3) teksten.push(willekeurig(len));
for (let i = 0; i < 40; i++) {
  // willekeurige bytes die toch geldige UTF-8 zijn: letters uit het hele unicodebereik
  let s = '';
  const len = 1 + Math.floor(r() * 50);
  for (let k = 0; k < len; k++) {
    const cp = r() < 0.6 ? 32 + Math.floor(r() * 95) : r() < 0.8 ? 0xa0 + Math.floor(r() * 0x700) : 0x1f300 + Math.floor(r() * 0x300);
    s += String.fromCodePoint(cp);
  }
  if (new TextEncoder().encode(s).length <= qrCapaciteit(QR_MAX_VERSIE)) teksten.push(s);
}
// een echte kamer-link: 20 tekens base64url
for (let i = 0; i < 20; i++) {
  const b = new Uint8Array(15);
  for (let k = 0; k < 15; k++) b[k] = Math.floor(r() * 256);
  const kamer = Buffer.from(b).toString('base64url');
  teksten.push('https://noaquim.github.io/sticky-clash/telefoon.html#' + kamer);
}

// ---- de norm-tabel en de capaciteit uit qr.js moeten overeenkomen
let capOk = true;
for (let v = 1; v <= 10; v++) {
  const [, ...groepen] = BLOKKEN[v];
  const dataCw = groepen.reduce((s, [k, , dn]) => s + k * dn, 0);
  if (qrCapaciteit(v) !== Math.floor((dataCw * 8 - 4 - (v < 10 ? 8 : 16)) / 8)) capOk = false;
}
check('capaciteit per versie volgens de norm', capOk, '(v1 ' + qrCapaciteit(1) + ' … v10 ' + qrCapaciteit(10) + ' bytes)');

let gelezen = 0, fout = [], kleinste = 0, besteMasker = 0;
const versies = new Set(), maskers = new Set();
for (const t of teksten) {
  const qr = qrMaak(t);
  const uit = lees(qr);
  versies.add(qr.versie); maskers.add(qr.masker);
  if (!uit.fouten.length && uit.tekst === t) gelezen++;
  else if (fout.length < 5) fout.push(JSON.stringify(t.slice(0, 20)) + ': ' + (uit.fouten.join(', ') || 'andere tekst'));
  const bytes = new TextEncoder().encode(t).length;
  if (qrCapaciteit(qr.versie) >= bytes && (qr.versie === 1 || qrCapaciteit(qr.versie - 1) < bytes)) kleinste++;
  // het gekozen masker heeft de minste strafpunten (bij gelijkspel het eerste)
  const s = [0, 1, 2, 3, 4, 5, 6, 7].map(m => straf(metMasker(qr, m), qr.grootte));
  if (s.indexOf(Math.min(...s)) === qr.masker) besteMasker++;
}
check('elke code leest terug (patronen, BCH, RS, inhoud)', gelezen === teksten.length,
  gelezen + '/' + teksten.length + (fout.length ? '  ' + fout.join(' | ') : ''));
check('steeds de kleinste versie die past', kleinste === teksten.length, kleinste + '/' + teksten.length);
check('steeds het masker met de minste strafpunten', besteMasker === teksten.length, besteMasker + '/' + teksten.length);
check('alle versies 1 t/m 10 gezien', versies.size === 10, [...versies].sort((a, b) => a - b).join(','));
check('alle acht maskers gezien', maskers.size === 8, [...maskers].sort().join(','));

// de kamer-link moet een kleine code blijven: groot genoeg blokjes op de muur
const link = qrMaak('https://noaquim.github.io/sticky-clash/telefoon.html#AbCdEfGhIjKlMnOpQrSt');
check('telefoonlink past in versie 5 (37 blokjes)', link.versie <= 5, 'versie ' + link.versie);

let teLang = false;
try { qrMaak('x'.repeat(qrCapaciteit(QR_MAX_VERSIE) + 1)); } catch { teLang = true; }
check('te lange tekst geeft een nette fout', teLang);

// een kapotte code moet de decoder ook echt afkeuren (anders test hij niets)
const stuk = qrMaak('controle');
stuk.donker[(stuk.grootte - 1) * stuk.grootte + stuk.grootte - 1] ^= 1;
check('decoder merkt één omgeklapt blokje op', lees(stuk).fouten.length > 0);
const stuk2 = qrMaak('controle');
stuk2.donker[8 * stuk2.grootte + 2] ^= 1;
check('decoder merkt een fout in de formaatbits op', lees(stuk2).fouten.length > 0);

klaar();
