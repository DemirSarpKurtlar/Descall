'use strict';

/**
 * iPhone app (iOS 26): long-pressing a server must not flash the web tab bar.
 *
 * The app's tab bar is a native UITabBar (DescallGlassTabBar plugin) over the
 * WebView; the web `.g-tabbar` stays in the DOM under it at opacity 0
 * (`.is-native`). The native bar hides while a sheet / menu covers the web
 * bar. Before the fix that hide also dropped `.is-native`, so the old web bar
 * painted under the long-press menu's scrim and again after the menu closed,
 * until `show()` came back ("eski nav bar geliyo gidiyo").
 *
 * Runs the built dist/ with perf/mockBackend.cjs and a mocked Capacitor iOS
 * shell: `DescallGlassTabBar` answers isAvailable/show/hide/update like the
 * Swift plugin (async, a few ms late) and paints a stand-in native bar
 * (`#fake-native-bar`, pointer-events none, so hit tests see the web bar).
 * Every animation frame it records whether the web bar is painted
 * (opacity > 0.01, display, size) and whether the native bar is up.
 *
 *   VITE_API_BASE_URL=http://127.0.0.1:5371 VITE_SOCKET_URL=http://127.0.0.1:5371 npx vite build --outDir /tmp/dist-perf
 *   node e2e/nativeTabBarLongPress.e2e.cjs --dist=/tmp/dist-perf [--out=/tmp/navfix] [--engine=webkit|chromium] [--rounds=6]
 * Exit 1 when the web bar paints on any sampled frame while the native bar is in use.
 */

const fs = require('fs');
const path = require('path');
const mock = require('./perf/mockBackend.cjs');

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
const pw = require(process.env.PLAYWRIGHT_CORE || 'playwright-core');
const DIST = path.resolve(args.dist || path.join(__dirname, '../dist-perf'));
const OUT = path.resolve(args.out || '/tmp/descall-native-tabbar');
const ENGINE = String(args.engine || 'webkit');
const PORT = Number(args.port || 5371);
const ROUNDS = Number(args.rounds || 6);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148';

/* Runs in the page before any app script. */
function installNativeShell() {
  const bar = { shown: false, el: null };
  const paint = (on) => {
    if (on && !bar.el) {
      const el = document.createElement('div');
      el.id = 'fake-native-bar';
      el.textContent = 'native UITabBar';
      el.style.cssText = 'position:fixed;left:16px;right:16px;bottom:22px;height:62px;border-radius:31px;z-index:2147483647;pointer-events:none;'
        + 'background:rgba(40,44,60,.97);color:#9fb3ff;font:600 13px -apple-system,system-ui;display:flex;align-items:center;justify-content:center;box-shadow:0 0 0 1px rgba(255,255,255,.14)';
      (document.body || document.documentElement).appendChild(el);
      bar.el = el;
    } else if (!on && bar.el) { bar.el.remove(); bar.el = null; }
  };
  window.__nativeBar = bar;
  window.__nativeCalls = [];
  window.CapacitorCustomPlatform = { name: 'ios' };
  window.Capacitor = {
    getPlatform: () => 'ios',
    isNativePlatform: () => true,
    PluginHeaders: [{ name: 'DescallGlassTabBar', methods: ['isAvailable', 'show', 'hide', 'update', 'removeListener'].map((name) => ({ name, rtype: 'promise' })).concat([{ name: 'addListener', rtype: 'callback' }]) }],
    nativePromise(plugin, method, opts) {
      window.__nativeCalls.push([method, performance.now()]);
      if (plugin !== 'DescallGlassTabBar') return Promise.reject(new Error('not implemented'));
      // Swift answers on the next main-queue turn.
      return new Promise((resolve) => setTimeout(() => {
        if (method === 'isAvailable') return resolve({ available: true });
        if (method === 'show') { bar.shown = true; paint(true); return resolve({ shown: true, height: 83 }); }
        if (method === 'hide') { bar.shown = false; paint(false); return resolve({}); }
        return resolve({});
      }, 16));
    },
    nativeCallback(plugin, method, opts, cb) { return String(Math.random()); },
  };
}

/* Per-frame sampler: is the web bar painted? is the native bar up? */
function startSampler() {
  const s = { frames: [], on: true };
  window.__sampler = s;
  const tick = () => {
    if (!s.on) return;
    const web = document.querySelector('.g-tabbar');
    let painted = false;
    if (web) {
      const cs = getComputedStyle(web); const r = web.getBoundingClientRect();
      painted = cs.display !== 'none' && cs.visibility !== 'hidden' && Number(cs.opacity) > 0.01 && r.width > 0 && r.height > 0 && r.top < innerHeight;
    }
    s.frames.push({ t: performance.now(), web: painted, native: Boolean(window.__nativeBar?.shown), menu: Boolean(document.querySelector('.svh-lift')), cls: document.documentElement.classList.contains('native-tabbar') });
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

async function center(page, sel, nth = 0) {
  return page.evaluate(([sel, nth]) => {
    const els = [...document.querySelectorAll(sel)].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.top >= 0 && r.bottom <= innerHeight - 120; });
    const e = els[nth % Math.max(1, els.length)]; if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, n: els.length };
  }, [sel, nth]);
}

async function touchLongPress(page, cdp, p, holdMs) {
  if (ENGINE === 'chromium' && cdp) {
    const pt = [{ x: p.x, y: p.y }];
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt });
    await sleep(holdMs);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    return;
  }
  // WebKit: pointer events from a touch-like mouse press (pointerType mouse, button 0) drive the same long-press code.
  await page.mouse.move(p.x, p.y); await page.mouse.down(); await sleep(holdMs); await page.mouse.up();
}

async function main() {
  if (!fs.existsSync(path.join(DIST, 'index.html'))) { console.error(`[native-tabbar] no ${DIST}/index.html`); process.exit(2); }
  fs.mkdirSync(OUT, { recursive: true });
  const srv = await mock.start({ dist: DIST, port: PORT });
  const base = `http://127.0.0.1:${srv.port}`;
  const browser = ENGINE === 'chromium'
    ? await pw.chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] })
    : await pw.webkit.launch({ headless: true });
  const ctxOpts = { viewport: { width: 393, height: 852 }, screen: { width: 393, height: 852 }, deviceScaleFactor: 2, hasTouch: true, userAgent: IPHONE_UA, locale: 'tr-TR', timezoneId: 'Europe/Istanbul', colorScheme: 'dark' };
  if (ENGINE === 'chromium') ctxOpts.isMobile = true;
  const ctx = await browser.newContext(ctxOpts);
  await ctx.route('**/*', (r) => (/^(data|blob):/.test(r.request().url()) || r.request().url().startsWith(base) ? r.continue() : r.abort()));
  await ctx.addInitScript(installNativeShell);
  await ctx.addInitScript(([api, me]) => {
    window.__DESCALL_API_URL__ = api; window.__DESCALL_SOCKET_URL__ = api;
    localStorage.setItem('descall_language', 'tr');
    localStorage.setItem('descall:ios-pwa-install-dismissed', '1');
    localStorage.setItem('descall:cookie_consent_v1', JSON.stringify({ choice: 'rejected', at: new Date().toISOString() }));
    localStorage.setItem('descall_token', 'e2e.fake.token');
    localStorage.setItem('descall_user', JSON.stringify(me));
  }, [base, mock.ME]);
  const page = await ctx.newPage();
  const errors = [];
  // Other native plugins (push, keychain…) are not mocked; their "not implemented" is expected here.
  page.on('pageerror', (e) => { const m = String(e.message || e); if (!/plugin is not implemented on ios/.test(m)) errors.push(m); });
  const cdp = ENGINE === 'chromium' ? await ctx.newCDPSession(page) : null;
  await page.goto(base + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  for (let i = 0; i < 300; i++) { if (await page.evaluate(() => document.querySelectorAll('.dm-item').length > 3 && !document.getElementById('boot-splash')).catch(() => false)) break; await sleep(150); }
  await sleep(1500);
  const fails = [];
  const env = await page.evaluate(() => ({ html: document.documentElement.className, native: window.__nativeBar.shown, tab: !!document.querySelector('.g-tabbar') }));
  if (!env.html.includes('glass-ui')) fails.push('no html.glass-ui (iPhone glass shell did not start)');
  // Servers tab → open the first server so the rail is on screen.
  const tab = await page.evaluate(() => { const e = [...document.querySelectorAll('.g-tab, .g-tabbar button')].find((x) => /Sunucu/.test(`${x.getAttribute('aria-label') || ''} ${x.textContent}`)); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  if (tab) await page.touchscreen.tap(tab.x, tab.y); else fails.push('no Sunucular tab');
  await sleep(1200);
  let rail = await center(page, '.g-server-rail-btn');
  if (!rail) {
    const row = await center(page, '.server-list-item, .svh-row, [data-server-id]');
    if (row) { await page.touchscreen.tap(row.x, row.y); await sleep(1500); }
    rail = await center(page, '.g-server-rail-btn');
  }
  const before = await page.evaluate(() => ({ native: window.__nativeBar.shown, web: (() => { const w = document.querySelector('.g-tabbar'); return w ? getComputedStyle(w).opacity : null; })(), view: document.querySelector('.app-root')?.dataset.view }));
  console.log('[native-tabbar] start', JSON.stringify({ ...env, html: undefined, rail: rail?.n || 0, ...before }));
  await page.screenshot({ path: path.join(OUT, 'start.png') });
  if (!rail) fails.push('no server rail button on screen');
  if (!before.native) fails.push('native bar not shown on the servers screen');
  await page.evaluate(startSampler);
  const shots = [];
  for (let r = 0; rail && r < ROUNDS; r++) {
    const p = await center(page, '.g-server-rail-btn', r);
    const hold = r % 3 === 2 ? 380 : 650; // every third press is too short to open the menu
    await touchLongPress(page, cdp, p, hold);
    await sleep(120);
    const open = await page.evaluate(() => Boolean(document.querySelector('.svh-lift')));
    if (r < 2) { const f = path.join(OUT, `press-${r}-open.png`); await page.screenshot({ path: f }); shots.push(f); }
    await sleep(500);
    if (open) {
      // Close by tapping the scrim, top of the screen (away from the menu).
      await page.touchscreen.tap(200, 40);
      for (let k = 0; k < 6; k++) { await sleep(40); if (r < 2 && k === 1) { const f = path.join(OUT, `press-${r}-closing.png`); await page.screenshot({ path: f }); shots.push(f); } }
    }
    await sleep(700);
  }
  const res = await page.evaluate(() => { window.__sampler.on = false; return { frames: window.__sampler.frames, calls: window.__nativeCalls }; });
  const leaked = res.frames.filter((f) => f.web);
  const menuFrames = res.frames.filter((f) => f.menu).length;
  const end = res.frames[res.frames.length - 1] || {};
  if (!menuFrames) fails.push('long-press never opened the server menu');
  if (leaked.length) fails.push(`web tab bar painted on ${leaked.length}/${res.frames.length} frames (native in use)`);
  if (!end.native) fails.push('native bar not back after the menu closed');
  if (errors.length) fails.push(`page errors: ${errors.slice(0, 2).join(' | ')}`);
  // First leaked frame, for the before/after image.
  fs.writeFileSync(path.join(OUT, 'frames.json'), JSON.stringify({ frames: res.frames, calls: res.calls }, null, 0));
  await page.screenshot({ path: path.join(OUT, 'end.png') });
  await ctx.close(); await browser.close(); srv.close();
  console.log(`[native-tabbar] ${fails.length ? 'FAIL' : 'ok'} frames=${res.frames.length} menuFrames=${menuFrames} webPainted=${leaked.length} hide/show=${res.calls.filter((c) => c[0] === 'hide').length}/${res.calls.filter((c) => c[0] === 'show').length}${fails.length ? `\n    - ${fails.join('\n    - ')}` : ''}`);
  process.exit(fails.length ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
