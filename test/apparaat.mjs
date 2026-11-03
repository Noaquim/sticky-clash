// Elke computer (js/apparaat.js, en de noodmeldingen in index.html en telefoon.html):
//   1. volledig scherm, ook op de oude Safari-manier (alleen webkit-namen), en waar het niet kan
//   2. iPhone en iPad herkennen (ook als iPad zich als Mac voordoet), en of het beamervenster
//      apart kan (niet op een tablet)
//   3. het besturingssysteem, voor de juiste tip
//   4. te oude browser: de melding bovenin index.html (en dus sticky-clash.html) en telefoon.html,
//      in het Nederlands en het Engels; niets bij een gewone start
// node test/apparaat.mjs
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { vsElement, vsKan, vsAan, vsUit, isIOS, apartVensterKan, besturing } from '../js/apparaat.js';
import { check, klaar } from './hulp.mjs';

const lees = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

// ---------------------------------------------------------------- 1. volledig scherm

{
  const nieuw = { fullscreenEnabled: true, fullscreenElement: null, uit: 0, exitFullscreen() { this.uit++; return Promise.resolve(); } };
  const oud = { webkitFullscreenEnabled: true, webkitFullscreenElement: null, uit: 0, webkitExitFullscreen() { this.uit++; } };   // Safari vóór 16.4
  const iphone = {};
  check('kan het: nieuw, oude Safari, iPhone niet', vsKan(nieuw) && vsKan(oud) && !vsKan(iphone) && !vsKan(null));
  oud.webkitFullscreenElement = 'html';
  check('wat er volledig scherm is, ook met de webkit-naam', vsElement(nieuw) === null && vsElement(oud) === 'html' && vsElement(null) === null);
  vsUit(nieuw); vsUit(oud); vsUit(iphone);
  check('uitzetten, ook de oude manier, en zonder fout als het niet kan', nieuw.uit === 1 && oud.uit === 1);
  let aanNieuw = 0, aanOud = 0;
  const elNieuw = { requestFullscreen() { aanNieuw++; return Promise.resolve(); } };
  const elOud = { webkitRequestFullscreen() { aanOud++; return undefined; } };
  const elFout = { requestFullscreen() { throw new TypeError('niet toegestaan'); } };
  const uitkomst = (p) => p.then(() => 'ja', () => 'nee');
  const u = await Promise.all([uitkomst(vsAan(elNieuw)), uitkomst(vsAan(elOud)), uitkomst(vsAan({})), uitkomst(vsAan(elFout))]);
  check('aanzetten: nieuw en oud lukt, zonder of met fout een afgewezen belofte', u.join() === 'ja,ja,nee,nee' && aanNieuw === 1 && aanOud === 1, u.join());
}

// ---------------------------------------------------------------- 2. iPad, iPhone, tablet

const UA = {
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
  ipadMac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  chromeIos: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/124.0.6367.88 Mobile/15E148 Safari/604.1',
  mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  win: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  winFf: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:130.0) Gecko/20100101 Firefox/130.0',
  linux: 'Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0',
  cros: 'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  android: 'Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
};
{
  check('iPhone, iPad als Mac, Chrome op iPhone: iOS', isIOS({ userAgent: UA.iphone }) &&
    isIOS({ userAgent: UA.ipadMac, platform: 'MacIntel', maxTouchPoints: 5 }) && isIOS({ userAgent: UA.chromeIos }));
  check('een echte Mac, Windows, Linux: geen iOS', !isIOS({ userAgent: UA.mac, platform: 'MacIntel', maxTouchPoints: 0 }) &&
    !isIOS({ userAgent: UA.win, platform: 'Win32' }) && !isIOS({ userAgent: UA.linux }) && !isIOS(null));
  /** Een nep-venster: welke media-vragen kloppen. */
  const venster = (ua, klopt, extra = {}) => ({
    navigator: { userAgent: ua, platform: '', maxTouchPoints: 0, ...extra },
    matchMedia: (q) => ({ matches: klopt.includes(q) }),
  });
  check('laptop met muis of touchpad: beamervenster kan apart', apartVensterKan(venster(UA.win, ['(any-pointer: fine)'])));
  check('laptop met aanraakscherm (ook een touchpad): kan', apartVensterKan(venster(UA.win, ['(pointer: coarse)', '(any-pointer: fine)'])));
  check('Android-tablet (alleen een vinger): kan niet', !apartVensterKan(venster(UA.android, ['(pointer: coarse)'])));
  check('iPad, ook met een toetsenbord met touchpad: kan niet', !apartVensterKan(venster(UA.ipadMac, ['(any-pointer: fine)'], { platform: 'MacIntel', maxTouchPoints: 5 })));
  check('Windows-tablet zonder toetsenbord: kan wel (echt apart venster)', apartVensterKan(venster(UA.win, ['(pointer: coarse)'])));
  check('oude browser zonder matchMedia: gewoon proberen', apartVensterKan({ navigator: { userAgent: UA.win } }) && apartVensterKan(null));
}

// ---------------------------------------------------------------- 3. besturingssysteem

{
  const b = (ua, extra = {}) => besturing({ userAgent: ua, ...extra });
  const uit = [b(UA.win, { platform: 'Win32' }), b(UA.mac, { platform: 'MacIntel' }), b(UA.linux, { platform: 'Linux x86_64' }),
    b(UA.cros), b(UA.android, { platform: 'Linux armv8l' }), b(UA.iphone, { platform: 'iPhone' }),
    b('', { userAgentData: { platform: 'Chrome OS' } }), b('Mozilla/5.0'), besturing(null)];
  check('Windows, Mac, Linux, Chromebook, Android, iPhone', uit.join() === 'windows,mac,linux,chromeos,android,ios,chromeos,,', uit.join());
}

// ---------------------------------------------------------------- 4. te oude browser

/**
 * Draait het noodscript uit `html` in een nagebootste pagina en geeft wat het toont.
 * o: { taal, gestart, module, fouten: [melding], netFout, protocol, pointer, moduleSrc }
 */
function noodmelding(html, o = {}) {
  const code = (html.match(/<script>\n(\/\*[^]*?scGestart[^]*?)<\/script>/) || [])[1];
  if (!code) return { gevonden: false };
  const luister = {};
  const status = { textContent: 'Klik op "Alles automatisch instellen"', className: 'status' };
  const body = { eerste: null, insertBefore(el) { this.eerste = el; } };
  const w = {
    addEventListener: (t, f) => { luister[t] = f; },
    PointerEvent: o.pointer === false ? undefined : function () {}, Promise, Map, fetch() {},
  };
  const d = {
    getElementById: (id) => (id === 'status' ? status : null),
    createElement: (tag) => (tag === 'script' ? (o.module === false ? {} : { noModule: false })
      : { style: {}, kids: [], setAttribute(k, v) { this[k] = v; }, appendChild(n) { this.kids.push(n); } }),
    createTextNode: (s) => ({ tekst: s }),
    querySelector: (q) => (o.moduleSrc && q === 'script[type="module"][src]' ? {} : null),
    body,
  };
  const ctx = vm.createContext({
    window: w, document: d, navigator: { language: o.taal || 'nl-NL', languages: [o.taal || 'nl-NL'] },
    location: { protocol: o.protocol || 'http:' }, localStorage: { getItem: () => null }, String, RegExp,
  });
  w.window = w;
  vm.runInContext(code, ctx);
  for (const m of o.fouten || []) luister.error({ message: m });
  if (o.gestart) w.scGestart = true;
  if (o.netFout) w.scNetFout = 1;
  luister.load();
  const vak = body.eerste;
  return { gevonden: true, status: status.textContent, klasse: status.className, vak: vak ? vak.kids[0].tekst : null, rol: vak && vak.role };
}

for (const [naam, bestand] of [['index.html', 'index.html'], ['sticky-clash.html', 'sticky-clash.html']]) {
  const html = lees(bestand);
  const gewoon = noodmelding(html, { gestart: true });
  check(naam + ': noodscript gevonden, zegt niets bij een gewone start', gewoon.gevonden && gewoon.vak === null && gewoon.klasse === 'status');
  const geenModule = noodmelding(html, { module: false });
  check(naam + ': geen modules: "te oud", in een melding bovenaan', /te oud/.test(geenModule.status) && geenModule.vak === geenModule.status &&
    geenModule.rol === 'alert' && geenModule.klasse === 'status err');
  const leesFout = noodmelding(html, { fouten: ["SyntaxError: Unexpected token '.'"], taal: 'en-US' });
  check(naam + ': kan de code niet lezen: "too old" (Engels)', /too old/.test(leesFout.status), leesFout.status.slice(0, 40));
  const geenPointer = noodmelding(html, { pointer: false });
  check(naam + ': geen PointerEvent (iOS 12): te oud', /te oud/.test(geenPointer.status));
  const loopVast = noodmelding(html, { fouten: ["TypeError: Cannot read properties of undefined (reading 'x')"] });
  check(naam + ': vastgelopen: "kon niet starten", met de fout', /kon niet starten \(TypeError/.test(loopVast.status), loopVast.status.slice(0, 50));
  const net = noodmelding(html, { netFout: true, taal: 'en-GB' });
  check(naam + ': niet geladen: open het losse bestand of speel online', /Couldn't load the game/.test(net.status) && /sticky-clash\.html/.test(net.status));
}
{
  const html = lees('index.html');
  const bestand = noodmelding(html, { protocol: 'file:', moduleSrc: true, netFout: true });
  check('index.html als bestand (stuurt door naar sticky-clash.html): geen melding', bestand.vak === null);
  check('de module meldt een laadfout aan het noodscript', /<script type="module" src="js\/main\.js" onerror="window\.scNetFout=1"><\/script>/.test(html));
  check('js/main.js zet scGestart als allerlaatste regel', /\nwindow\.scGestart = true;\n$/.test(lees('js/main.js')));
  check('het noodscript zit ook in sticky-clash.html (buiten los:weg)', lees('sticky-clash.html').includes('scGestart'));
}
{
  // telefoon.html: het noodscript onderaan, na het gewone script
  const html = lees('telefoon.html');
  const code = (html.match(/<script>\n(\/\*[^]*?scTelGestart[^]*?)<\/script>/) || [])[1];
  const draai = (gestart, taal) => {
    const el = {};
    for (const id of ['fase', 'sub', 'verbinding']) el[id] = { textContent: '', className: 'pil' };
    const ctx = vm.createContext({ window: { scTelGestart: gestart }, document: { getElementById: (id) => el[id] || null },
      navigator: { language: taal, languages: [taal] } });
    vm.runInContext(code || '', ctx);
    return el;
  };
  const oud = draai(false, 'nl-NL'), oudEn = draai(false, 'en-US'), goed = draai(true, 'nl-NL');
  check('telefoon.html: te oud: dat zeggen, niet eeuwig "verbinden"', !!code && oud.fase.textContent === 'Deze browser is te oud' &&
    oud.verbinding.className === 'pil fout' && oudEn.fase.textContent === 'This browser is too old');
  check('telefoon.html: gewone start: noodscript doet niets', goed.fase.textContent === '');
  check('telefoon.html: het gewone script zegt dat het opstartte', /window\.scTelGestart = true;/.test(html));
}

klaar();
