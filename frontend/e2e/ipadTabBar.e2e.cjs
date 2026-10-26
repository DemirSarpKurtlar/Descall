'use strict';

/**
 * iPad navigation regression (A3 follow-up). At tablet widths the app uses the
 * desktop rail + list + main layout; the phone bottom tab bar must not render
 * there. Before the fix an iPad UA (isMobile) rendered `.mobile-tab-bar`, and
 * outside the phone media query it was an unpositioned grid item laid over the
 * app root, eating taps on the chat list.
 *
 * Serves a built dist/ with the synthetic account from perf/mockBackend.cjs on
 * 127.0.0.1 (every other URL aborted) and checks, per device profile:
 *   - tablet (Safari iPad UA, Mac-UA iPadOS, Capacitor iOS iPad, landscape):
 *     no visible bottom tab bar, rail + chat rows are hit-testable;
 *   - phone (iPhone, iPad split view <=768px): exactly one bottom tab bar,
 *     position:fixed, docked to the bottom edge.
 *
 *   VITE_API_BASE_URL=http://127.0.0.1:5371 VITE_SOCKET_URL=http://127.0.0.1:5371 npx vite build --outDir /tmp/dist-perf
 *   node e2e/ipadTabBar.e2e.cjs --dist=/tmp/dist-perf [--out=/tmp/ipad-tabbar] [--engine=chromium|webkit]
 * Exit code 1 on any failed check.
 */

const fs = require('fs');
const path = require('path');
const mock = require('./perf/mockBackend.cjs');

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
const pw = require(process.env.PLAYWRIGHT_CORE || 'playwright-core');
const DIST = path.resolve(args.dist || path.join(__dirname, '../dist-perf'));
const OUT = path.resolve(args.out || '/tmp/descall-ipad-tabbar');
const ENGINE = String(args.engine || 'chromium');
const PORT = Number(args.port || 5371);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const IPAD_UA = 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
// iPadOS 13+ Safari ("Request desktop website", the default) and WKWebView.
const MAC_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
const tablet = (w, h, ua, extra = {}) => ({ ctx: { viewport: { width: w, height: h }, screen: { width: Math.min(w, h) === w ? w : h, height: Math.max(w, h) === h ? h : w }, deviceScaleFactor: 2, isMobile: ua !== MAC_UA, hasTouch: true, userAgent: ua }, ...extra });

const CASES = [
  { name: 'iphone', expect: 'phone', ctx: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: IPHONE_UA } },
  { name: 'ipad-safari-portrait', expect: 'tablet', ...tablet(1024, 1366, IPAD_UA) },
  { name: 'ipad-safari-landscape', expect: 'tablet', ...tablet(1366, 1024, IPAD_UA) },
  { name: 'ipad-mac-ua', expect: 'tablet', ...tablet(1024, 1366, MAC_UA) },
  { name: 'ipad-capacitor-ipad-ua', expect: 'tablet', capacitor: true, ...tablet(1024, 1366, IPAD_UA) },
  { name: 'ipad-capacitor-mac-ua', expect: 'tablet', capacitor: true, ...tablet(1024, 1366, MAC_UA) },
  // Split View / Slide Over: the phone layout (and its bar) is intended there.
  { name: 'ipad-splitview-507', expect: 'phone', ...tablet(507, 1366, IPAD_UA) },
];

async function runCase(browser, base, c) {
  const ctxOpts = { ...c.ctx, locale: 'tr-TR', timezoneId: 'Europe/Istanbul', colorScheme: 'dark' };
  if (ENGINE !== 'chromium') delete ctxOpts.isMobile;
  if (c.ctx.screen) ctxOpts.screen = c.ctx.screen;
  const ctx = await browser.newContext(ctxOpts);
  await ctx.route('**/*', (r) => (/^(data|blob):/.test(r.request().url()) || r.request().url().startsWith(base) ? r.continue() : r.abort()));
  await ctx.addInitScript(([api, me, cap]) => {
    window.__DESCALL_API_URL__ = api; window.__DESCALL_SOCKET_URL__ = api;
    try { Object.defineProperty(Navigator.prototype, 'hardwareConcurrency', { get: () => 8 }); } catch { /* ignore */ }
    // iPadOS reports touch points even with a Mac UA.
    try { Object.defineProperty(Navigator.prototype, 'maxTouchPoints', { get: () => 5 }); } catch { /* ignore */ }
    if (cap) window.Capacitor = { getPlatform: () => 'ios', isNativePlatform: () => true, isPluginAvailable: () => false, Plugins: {} };
    localStorage.setItem('descall_language', 'tr');
    localStorage.setItem('descall:ios-pwa-install-dismissed', '1');
    localStorage.setItem('descall:cookie_consent_v1', JSON.stringify({ choice: 'rejected', at: new Date().toISOString() }));
    localStorage.setItem('descall_token', 'e2e.fake.token');
    localStorage.setItem('descall_user', JSON.stringify(me));
  }, [base, mock.ME, Boolean(c.capacitor)]);
  fs.mkdirSync(OUT, { recursive: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message || e)));
  await page.goto(base + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  const t0 = Date.now();
  while (Date.now() - t0 < 45000) {
    const ok = await page.evaluate(() => document.querySelectorAll('.dm-item').length > 5 && !document.getElementById('boot-splash')).catch(() => false);
    if (ok) break;
    await sleep(300);
  }
  await sleep(1500);
  const r = await page.evaluate(() => {
    const vis = (e) => { const b = e.getBoundingClientRect(); const s = getComputedStyle(e); return b.width > 0 && b.height > 0 && s.display !== 'none' && s.visibility !== 'hidden' && Number(s.opacity) > 0.01; };
    const bars = [...document.querySelectorAll('.mobile-tab-bar, .g-tabbar')].filter(vis).map((e) => { const b = e.getBoundingClientRect(); return { cls: e.className, pos: getComputedStyle(e).position, top: b.top, bottom: b.bottom, h: b.height }; });
    const hit = (e) => { if (!e || !vis(e)) return null; const b = e.getBoundingClientRect(); const pts = [[0.5, 0.5], [0.25, 0.5], [0.75, 0.5]]; return pts.every(([fx, fy]) => { const x = b.left + b.width * fx; const y = b.top + b.height * fy; if (y < 0 || y > innerHeight) return true; const t = document.elementFromPoint(x, y); return t && (t === e || e.contains(t)); }); };
    const rows = [...document.querySelectorAll('.dm-item')].filter(vis).filter((e) => { const b = e.getBoundingClientRect(); return b.top >= 0 && b.bottom <= innerHeight - 160; });
    const rails = [...document.querySelectorAll('.rail-btn')].filter(vis);
    return {
      vw: innerWidth, vh: innerHeight, bars,
      rows: rows.length, rowsHit: rows.filter((e) => hit(e)).length,
      rails: rails.length, railsHit: rails.filter((e) => hit(e)).length,
      navBtn: [...document.querySelectorAll('.mobile-nav-btn')].filter(vis).length,
      root: document.querySelector('.app-root')?.className || '', html: document.documentElement.className,
    };
  });
  // Open a chat with a real tap (hit-tested) and check the tablet keeps its
  // navigation (rail + list) next to the thread, as in the mockups.
  let conv = null;
  if (c.expect === 'tablet' && r.rowsHit) {
    const b = await page.evaluate(() => { const e = [...document.querySelectorAll('.dm-item')].find((x) => x.textContent.includes('Ayşe')); const q = e.getBoundingClientRect(); return { x: q.left + q.width / 2, y: q.top + q.height / 2 }; });
    await page.touchscreen.tap(b.x, b.y);
    await sleep(2500);
    conv = await page.evaluate(() => {
      const vis = (e) => { const q = e.getBoundingClientRect(); return q.width > 0 && q.height > 0 && q.right > 0 && q.left < innerWidth && getComputedStyle(e).visibility !== 'hidden'; };
      return {
        bubbles: document.querySelectorAll('.message-bubble').length,
        rows: [...document.querySelectorAll('.dm-item')].filter(vis).length,
        rails: [...document.querySelectorAll('.rail-btn')].filter(vis).length,
        bars: [...document.querySelectorAll('.mobile-tab-bar, .g-tabbar')].filter(vis).length,
        navBtn: [...document.querySelectorAll('.mobile-nav-btn')].filter(vis).length,
      };
    });
    await page.screenshot({ path: path.join(OUT, `${c.name}-chat.png`) });
  }
  const shot = path.join(OUT, `${c.name}.png`);
  await page.screenshot({ path: shot });
  await ctx.close();
  const fails = [];
  if (c.expect === 'tablet') {
    if (r.bars.length) fails.push(`tab bar visible on tablet: ${JSON.stringify(r.bars)}`);
    if (!r.rails) fails.push('no rail buttons');
    if (r.navBtn) fails.push('phone drawer menu button shown on tablet');
    if (r.railsHit !== r.rails) fails.push(`rail buttons covered ${r.railsHit}/${r.rails}`);
  } else {
    if (r.bars.length !== 1) fails.push(`expected one tab bar, got ${r.bars.length}`);
    for (const b of r.bars) {
      if (b.pos !== 'fixed') fails.push(`tab bar not fixed (${b.pos})`);
      if (r.vh - b.bottom > 40 || b.top < r.vh - 180) fails.push(`tab bar not docked to bottom (${Math.round(b.top)}-${Math.round(b.bottom)} / ${r.vh})`);
    }
  }
  if (conv) {
    if (conv.bubbles < 10) fails.push(`chat did not open on tap (${conv.bubbles} messages)`);
    if (conv.bars) fails.push('tab bar visible in chat');
    if (conv.navBtn) fails.push('phone back chevron shown in the tablet chat header');
  }
  if (!r.rows) fails.push('no chat rows');
  if (r.rowsHit !== r.rows) fails.push(`chat rows covered ${r.rowsHit}/${r.rows}`);
  if (errors.length) fails.push(`page errors: ${errors.slice(0, 2).join(' | ')}`);
  console.log(`[ipad-tabbar] ${fails.length ? 'FAIL' : 'ok  '} ${c.name.padEnd(24)} bars=${r.bars.length} rows=${r.rowsHit}/${r.rows} rail=${r.railsHit}/${r.rails}${conv ? ` chat=${conv.bubbles}msg list=${conv.rows} rail=${conv.rails}` : ''}${fails.length ? `\n    - ${fails.join('\n    - ')}` : ''}`);
  return { name: c.name, ok: !fails.length, fails, r, shot };
}

(async () => {
  if (!fs.existsSync(path.join(DIST, 'index.html'))) { console.error(`[ipad-tabbar] no ${DIST}/index.html`); process.exit(2); }
  const srv = await mock.start({ dist: DIST, port: PORT });
  const base = `http://127.0.0.1:${srv.port}`;
  const browser = ENGINE === 'webkit'
    ? await pw.webkit.launch({ headless: true })
    : await pw.chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--lang=tr-TR'] });
  const out = [];
  try {
    for (const c of CASES) {
      if (args.only && !String(args.only).split(',').includes(c.name)) continue;
      try { out.push(await runCase(browser, base, c)); } catch (e) { out.push({ name: c.name, ok: false, fails: [e.message] }); console.log(`[ipad-tabbar] FAIL ${c.name} ${e.message}`); }
    }
  } finally { await browser.close().catch(() => {}); srv.close(); }
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(out, null, 1));
  const bad = out.filter((x) => !x.ok).length;
  console.log(`[ipad-tabbar] ${out.length - bad}/${out.length} passed`);
  process.exit(bad ? 1 : 0);
})();
