'use strict';

/**
 * Tablet layout parity (27 Nov 2026, the owner's iPad photo: "tablette hâlâ
 * daha mobil, Electron ve Rust gibi değil"). The iPad / Android tablet app
 * must be either the desktop layout Electron and Tauri render (wide windows)
 * or the iPhone layout (narrow windows: iPad mini portrait, Split View, Slide
 * Over), never a hybrid of the two (lib/deviceLayout.js).
 *
 * Serves a built dist/ with the synthetic account from perf/mockBackend.cjs on
 * 127.0.0.1 (every other URL aborted). Per case, the native shell is emulated
 * like the Capacitor iOS / Android app (window.Capacitor, touch, the device's
 * screen size, its WebView user agent) and checked:
 *   - exactly one Liquid Glass layer: html.glass-desktop (desktop layout) or
 *     html.glass-ui + .g-shell (phone layout);
 *   - desktop layout: the rail, list column and main pane sit where desktop web
 *     (Electron's renderer) puts them at the same viewport (same x and width),
 *     the user + voice panel is there, no bottom tab bar;
 *   - phone layout: no rail, one bottom tab bar, no glass-desktop;
 *   - one visible title per pane (the empty main pane does not repeat
 *     "Sohbetler" next to the list);
 *   - no control clipped by the screen edge;
 *   - touch: no permanent per-row "..." in the conversation list, holding a
 *     row opens its menu at the finger and does not open the chat;
 *   - rotation / Split View resize keeps the open chat and the typed draft.
 * Screenshots (deviceScaleFactor 2, JPEG): <out>/tablet-after-<case>.jpg and
 * the desktop reference <out>/tablet-desktop-<case>.jpg.
 *
 *   VITE_API_BASE_URL=http://127.0.0.1:5371 VITE_SOCKET_URL=http://127.0.0.1:5371 npx vite build --outDir /tmp/dist-perf
 *   node e2e/tabletLayout.e2e.cjs --dist=/tmp/dist-perf [--out=/tmp/tablet-layout] [--only=pro11-land,...]
 * Exit code 1 on any failed check.
 */

const fs = require('fs');
const path = require('path');
const mock = require('./perf/mockBackend.cjs');

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
const pw = require(process.env.PLAYWRIGHT_CORE || 'playwright-core');
const DIST = path.resolve(args.dist || path.join(__dirname, '../dist-perf'));
const OUT = path.resolve(args.out || '/tmp/descall-tablet-layout');
const PORT = Number(args.port || 5371);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// WKWebView "recommended" content mode: desktop-class Mac UA on a full-screen
// iPad, the iPad UA on iPad mini and in narrow Split View windows.
const MAC_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko)';
const IPAD_UA = 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148';
const ANDROID_TAB_UA = 'Mozilla/5.0 (Linux; Android 14; SM-X710 Build/UP1A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0 Safari/537.36';
const DESK_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

// [name, viewport w, h, screen short, screen long, expected layout, platform, ua]
const CASES = [
  ['pro13-land', 1366, 1024, 1024, 1366, 'desktop', 'ios', MAC_UA],
  ['pro13-port', 1024, 1366, 1024, 1366, 'desktop', 'ios', MAC_UA],
  ['pro11-land', 1194, 834, 834, 1194, 'desktop', 'ios', MAC_UA],
  ['pro11-port', 834, 1194, 834, 1194, 'desktop', 'ios', MAC_UA],
  ['pro11-land-ipadua', 1194, 834, 834, 1194, 'desktop', 'ios', IPAD_UA],
  ['mini-land', 1133, 744, 744, 1133, 'desktop', 'ios', IPAD_UA],
  ['mini-port', 744, 1133, 744, 1133, 'phone', 'ios', IPAD_UA],
  ['split-twothirds', 981, 1024, 1024, 1366, 'desktop', 'ios', MAC_UA],
  ['split-half', 678, 1024, 1024, 1366, 'phone', 'ios', IPAD_UA],
  ['split-third', 320, 1024, 1024, 1366, 'phone', 'ios', IPAD_UA],
  ['android-tab-land', 1280, 800, 800, 1280, 'desktop', 'android', ANDROID_TAB_UA],
  ['android-tab-port', 800, 1280, 800, 1280, 'desktop', 'android', ANDROID_TAB_UA],
  ['android-tab-split', 640, 800, 800, 1280, 'phone', 'android', ANDROID_TAB_UA],
].map(([name, w, h, ss, sl, expect, platform, ua]) => ({
  name, w, h, expect, platform, ua,
  screen: w > h ? { width: sl, height: ss } : { width: ss, height: sl },
}));

async function newPage(browser, base, { w, h, screen, ua, platform, touch, dpr = 2 }) {
  const ctx = await browser.newContext({
    viewport: { width: w, height: h }, screen, deviceScaleFactor: dpr,
    // isMobile stays off: Chromium's mobile emulation resizes window.screen with the
    // viewport, a real iPad screen does not change in Split View.
    isMobile: false, hasTouch: Boolean(touch), userAgent: ua,
    locale: 'tr-TR', timezoneId: 'Europe/Istanbul', colorScheme: 'dark',
  });
  await ctx.route('**/*', (r) => (/^(data|blob):/.test(r.request().url()) || r.request().url().startsWith(base) ? r.continue() : r.abort()));
  await ctx.addInitScript(([api, me, platform, touch]) => {
    window.__DESCALL_API_URL__ = api; window.__DESCALL_SOCKET_URL__ = api;
    try { Object.defineProperty(Navigator.prototype, 'hardwareConcurrency', { get: () => 8 }); } catch { /* ignore */ }
    if (touch) { try { Object.defineProperty(Navigator.prototype, 'maxTouchPoints', { get: () => 5 }); } catch { /* ignore */ } }
    if (platform) {
      window.CapacitorCustomPlatform = { name: platform };
      window.Capacitor = {
        getPlatform: () => platform, isNativePlatform: () => true, isPluginAvailable: () => false, Plugins: {}, PluginHeaders: [],
        nativePromise() { return Promise.reject(new Error('not implemented')); }, nativeCallback() { return String(Math.random()); },
      };
    }
    localStorage.setItem('descall_language', 'tr');
    localStorage.setItem('descall:ios-pwa-install-dismissed', '1');
    localStorage.setItem('descall:cookie_consent_v1', JSON.stringify({ choice: 'rejected', at: new Date().toISOString() }));
    localStorage.setItem('descall_token', 'e2e.fake.token');
    localStorage.setItem('descall_user', JSON.stringify(me));
  }, [base, mock.ME, platform || null, Boolean(touch)]);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => { const m = String(e.message || e); if (!/plugin is not implemented/.test(m)) errors.push(m); });
  await page.goto(base + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  const t0 = Date.now();
  while (Date.now() - t0 < 45000) {
    const ok = await page.evaluate(() => document.querySelectorAll('.dm-item').length > 5 && !document.getElementById('boot-splash')).catch(() => false);
    if (ok) break;
    await sleep(300);
  }
  await sleep(1500);
  // The permission card is a separate row; close it so it does not decide the geometry.
  await page.evaluate(() => { document.querySelector('.app-notif-banner .app-notif-banner-dismiss')?.click(); });
  await sleep(500);
  return { ctx, page, errors };
}

/* Layout facts in CSS px. */
function measure() {
  const vis = (e) => { if (!e) return false; const b = e.getBoundingClientRect(); const s = getComputedStyle(e); return b.width > 0 && b.height > 0 && s.display !== 'none' && s.visibility !== 'hidden' && Number(s.opacity) > 0.01; };
  const rect = (sel) => { const e = [...document.querySelectorAll(sel)].find(vis); if (!e) return null; const b = e.getBoundingClientRect(); return { x: Math.round(b.left), y: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height) }; };
  // Visible box after every clipping ancestor (swipe actions parked off-row are not "clipped by the screen").
  const clipBox = (e) => {
    const b = e.getBoundingClientRect(); let r = { l: b.left, t: b.top, r: b.right, b: b.bottom };
    for (let p = e.parentElement; p && p !== document.documentElement; p = p.parentElement) {
      const s = getComputedStyle(p);
      if (/(hidden|clip|auto|scroll)/.test(s.overflowX + s.overflowY)) { const q = p.getBoundingClientRect(); r = { l: Math.max(r.l, q.left), t: Math.max(r.t, q.top), r: Math.min(r.r, q.right), b: Math.min(r.b, q.bottom) }; }
    }
    return r;
  };
  const clipped = [...document.querySelectorAll('button, a[href], input, textarea, [role=button]')].filter(vis).filter((e) => {
    const r = clipBox(e); if (r.r - r.l < 2 || r.b - r.t < 2) return false;
    return r.r > innerWidth + 1 || r.l < -1;
  }).map((e) => `${(e.getAttribute('aria-label') || e.className || e.tagName).toString().slice(0, 40)}@${Math.round(e.getBoundingClientRect().left)}`);
  // Titles a person actually sees: visible and on top at their centre.
  const onTop = (e) => { const b = e.getBoundingClientRect(); const x = b.left + Math.min(b.width / 2, 20); const y = b.top + b.height / 2; if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) return false; const t = document.elementFromPoint(x, y); return Boolean(t && (t === e || e.contains(t) || t.contains(e))); };
  const titlesIn = (sel) => { const root = [...document.querySelectorAll(sel)].find(vis); if (!root) return []; return [...root.querySelectorAll('h1, h2')].filter(vis).filter((e) => { const b = e.getBoundingClientRect(); return b.width > 2 && b.height > 2; }).filter(onTop).filter((e) => e.getBoundingClientRect().top < 200).map((e) => e.textContent.trim()); };
  const html = document.documentElement.classList;
  return {
    vw: innerWidth, vh: innerHeight,
    glassDesktop: html.contains('glass-desktop'), glassUi: html.contains('glass-ui'),
    root: document.querySelector('.app-root')?.className || '',
    rail: rect('.nav-rail'), list: rect('.app-sidebar-shell .sidebar-secondary') || rect('.sidebar-secondary'), main: rect('.main-panel'),
    uvp: Boolean(rect('section.uvp')),
    tabbars: [...document.querySelectorAll('.mobile-tab-bar, .g-tabbar')].filter(vis).length,
    listTitles: titlesIn('.sidebar-secondary'), mainTitles: titlesIn('.main-panel, .chat-panel-shell'),
    moreBtns: [...document.querySelectorAll('.conv-more-btn')].filter(vis).filter((e) => { const r = clipBox(e); return r.r - r.l > 2; }).length,
    clipped,
  };
}

async function openChat(page, name = 'Ayşe') {
  await page.evaluate((n) => [...document.querySelectorAll('.dm-item')].find((x) => x.textContent.includes(n))?.click(), name);
  const t0 = Date.now();
  while (Date.now() - t0 < 10000) {
    if (await page.evaluate(() => document.querySelectorAll('.message-bubble').length > 5)) return true;
    await sleep(200);
  }
  return false;
}

/* Touch hold on a point (Chromium turns CDP touch events into pointer events). */
async function touchHold(page, x, y, ms = 700) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
  await sleep(ms);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach().catch(() => {});
}

async function runCase(browser, base, c) {
  const fails = [];
  fs.mkdirSync(OUT, { recursive: true });
  const { ctx, page, errors } = await newPage(browser, base, { ...c, touch: true });
  const r = await page.evaluate(measure);
  await page.screenshot({ path: path.join(OUT, `tablet-after-${c.name}.jpg`), type: 'jpeg', quality: 78 });

  // One layer, one layout.
  if (r.glassDesktop && r.glassUi) fails.push('both glass-desktop and glass-ui (hybrid)');
  if (c.expect === 'desktop') {
    if (!r.glassDesktop) fails.push(`expected html.glass-desktop (${r.glassUi ? 'got glass-ui' : 'none'})`);
    if (/\bis-mobile\b/.test(r.root)) fails.push('desktop layout marked .is-mobile');
    if (!r.rail) fails.push('no nav rail');
    if (r.tabbars) fails.push('bottom tab bar in the desktop layout');
    if (!r.uvp) fails.push('user + voice panel missing (Electron has it)');
  } else {
    if (!r.glassUi || !/\bg-shell\b/.test(r.root)) fails.push(`expected the iPhone glass shell (glass-ui=${r.glassUi}, root=${r.root})`);
    if (r.glassDesktop) fails.push('glass-desktop on the phone layout');
    if (r.rail) fails.push('nav rail drawn in the phone layout');
    if (r.tabbars !== 1) fails.push(`expected one tab bar, got ${r.tabbars}`);
  }
  if (r.listTitles.length > 1) fails.push(`list column shows ${r.listTitles.length} titles: ${r.listTitles.join(' | ')}`);
  if (c.expect === 'desktop' && r.mainTitles.length) fails.push(`empty main pane repeats a title: ${r.mainTitles.join(' | ')}`);
  if (r.clipped.length) fails.push(`clipped by the screen edge: ${r.clipped.slice(0, 4).join(', ')}`);
  if (r.moreBtns) fails.push(`${r.moreBtns} permanent row "..." buttons on touch`);

  // Desktop reference at the same viewport: same rail / list / main geometry.
  let ref = null;
  if (c.expect === 'desktop') {
    const d = await newPage(browser, base, { w: c.w, h: c.h, screen: { width: 1920, height: 1080 }, ua: DESK_UA, platform: null, touch: false });
    ref = await d.page.evaluate(measure);
    await d.page.screenshot({ path: path.join(OUT, `tablet-desktop-${c.name}.jpg`), type: 'jpeg', quality: 78 });
    await d.ctx.close();
    for (const k of ['rail', 'list', 'main']) {
      const a = r[k]; const b = ref[k];
      if (!a || !b) { fails.push(`${k}: tablet ${JSON.stringify(a)} vs desktop ${JSON.stringify(b)}`); continue; }
      if (Math.abs(a.x - b.x) > 2 || Math.abs(a.w - b.w) > 2) fails.push(`${k} x/width ${a.x}/${a.w} vs desktop ${b.x}/${b.w}`);
    }
  }

  // Touch: hold a row -> its menu at the finger, the chat stays closed; a tap opens it.
  let hold = null;
  if (c.expect === 'desktop') {
    const pt = await page.evaluate(() => { const e = [...document.querySelectorAll('.dm-item')].find((x) => x.textContent.includes('Mert')); const b = e.getBoundingClientRect(); return { x: b.left + b.width / 3, y: b.top + b.height / 2 }; });
    await touchHold(page, pt.x, pt.y);
    await sleep(500);
    hold = await page.evaluate(() => ({
      menu: [...document.querySelectorAll('[role="menu"]')].filter((m) => m.getBoundingClientRect().height > 0).length,
      bubbles: document.querySelectorAll('.message-bubble').length,
    }));
    if (!hold.menu) fails.push('holding a conversation row did not open its menu');
    if (hold.bubbles) fails.push('holding a row also opened the chat');
    await page.keyboard.press('Escape');
    await page.mouse.click(Math.round(c.w * 0.7), Math.round(c.h * 0.5)).catch(() => {});
    await sleep(300);
  }

  // Open a chat, type a draft, rotate / resize across the breakpoint and back.
  let rot = null;
  if (await openChat(page)) {
    const conv = await page.evaluate(measure);
    if (c.expect === 'desktop' && conv.moreBtns > 1) fails.push(`${conv.moreBtns} row "..." with a chat open (only the selected row keeps one)`);
    if (conv.clipped.length) fails.push(`chat: clipped ${conv.clipped.slice(0, 3).join(', ')}`);
    await page.screenshot({ path: path.join(OUT, `tablet-after-${c.name}-chat.jpg`), type: 'jpeg', quality: 78 });
    const box = await page.$('textarea.composer-input');
    if (box) await box.fill('taslak mesaj');
    // Rotation (swap sides) and a Split View resize to the other layout.
    const steps = c.expect === 'desktop' ? [[c.h, c.w], [Math.min(678, c.w), c.h], [c.w, c.h]] : [[c.h, c.w], [Math.max(1024, c.h), c.w], [c.w, c.h]];
    rot = [];
    // The screen keeps the device's size (rotated with the window); only the
    // window changes, like iPadOS Split View. setViewportSize would also make
    // the emulated screen the window size.
    const cdp = await page.context().newCDPSession(page);
    const ss = Math.min(c.screen.width, c.screen.height); const sl = Math.max(c.screen.width, c.screen.height);
    for (const [w, h] of steps) {
      await cdp.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 2, mobile: false, screenWidth: w > h ? sl : ss, screenHeight: w > h ? ss : sl });
      await sleep(1200);
      const s = await page.evaluate(() => ({
        w: innerWidth, desktop: document.documentElement.classList.contains('glass-desktop'), ui: document.documentElement.classList.contains('glass-ui'),
        bubbles: document.querySelectorAll('.message-bubble').length,
        title: [...document.querySelectorAll('.panel-header .header-title-text')].map((e) => e.textContent.trim()).find(Boolean) || '',
        draft: document.querySelector('textarea.composer-input')?.value || '',
      }));
      rot.push(s);
      const wantDesktop = w > 768;
      if (s.desktop !== wantDesktop || s.ui === wantDesktop) fails.push(`after resize to ${w}x${h}: glass-desktop=${s.desktop} glass-ui=${s.ui}`);
      if (s.bubbles < 5) fails.push(`after resize to ${w}x${h}: the open chat was lost (${s.bubbles} messages)`);
      if (!/Ayşe/.test(s.title)) fails.push(`after resize to ${w}x${h}: header shows "${s.title}"`);
      if (s.draft !== 'taslak mesaj') fails.push(`after resize to ${w}x${h}: draft "${s.draft}"`);
    }
  } else {
    fails.push('chat did not open');
  }

  if (errors.length) fails.push(`page errors: ${errors.slice(0, 2).join(' | ')}`);
  await ctx.close();
  const geo = (g) => (g ? `${g.x}+${g.w}` : '-');
  console.log(`[tablet] ${fails.length ? 'FAIL' : 'ok  '} ${c.name.padEnd(18)} ${c.expect.padEnd(7)} rail=${geo(r.rail)} list=${geo(r.list)} main=${geo(r.main)}${ref ? ` | desktop rail=${geo(ref.rail)} list=${geo(ref.list)} main=${geo(ref.main)}` : ''}${fails.length ? `\n    - ${fails.join('\n    - ')}` : ''}`);
  return { name: c.name, ok: !fails.length, fails, r, ref, hold, rot };
}

(async () => {
  if (!fs.existsSync(path.join(DIST, 'index.html'))) { console.error(`[tablet] no ${DIST}/index.html`); process.exit(2); }
  const srv = await mock.start({ dist: DIST, port: PORT });
  const base = `http://127.0.0.1:${srv.port}`;
  const browser = await pw.chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, headless: true, args: ['--no-sandbox', '--lang=tr-TR'] });
  const out = [];
  try {
    for (const c of CASES) {
      if (args.only && !String(args.only).split(',').includes(c.name)) continue;
      try { out.push(await runCase(browser, base, c)); } catch (e) { out.push({ name: c.name, ok: false, fails: [e.message] }); console.log(`[tablet] FAIL ${c.name} ${e.message}`); }
    }
  } finally { await browser.close().catch(() => {}); srv.close(); }
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(out, null, 1));
  const bad = out.filter((x) => !x.ok).length;
  console.log(`[tablet] ${out.length - bad}/${out.length} passed`);
  process.exit(bad ? 1 : 0);
})();
