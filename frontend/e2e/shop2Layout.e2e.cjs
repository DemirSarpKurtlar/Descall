'use strict';

/**
 * Market 2.0 layout e2e: the REAL app build against the REAL routes/shop2.js (fake in-memory
 * Supabase seeded with the real catalog/shop2 items, 16 sets), inside the Settings window.
 * Checks, desktop 1280x800 (glass) and iPhone 390x844, plus desktop in the light theme:
 *   - no reload loop: the storefront is fetched once, not again every render;
 *   - Setler: the set switcher is a horizontal scroller inside the pane (wheel moves it,
 *     the next arrow shows on desktop, picking the last set brings it into view);
 *   - iPhone: the set dots scroll and the "1 / 16" counter stays on one line;
 *   - a drawer: Escape closes only the drawer (never Settings), Tab stays inside it;
 *   - a toast raised from the celebration window is painted above that window;
 *   - a tab opened from the middle of Vitrin starts at the top;
 *   - no horizontal page overflow;
 *   - light theme: the market's headings stay light on its dark panel.
 *
 * Run from frontend/ against a build that points at the mock (never production):
 *   VITE_API_BASE_URL=http://127.0.0.1:5361 VITE_SOCKET_URL=http://127.0.0.1:5361 \
 *     npx vite build --outDir dist-e2e
 *   node e2e/shop2Layout.e2e.cjs
 * Env: PLAYWRIGHT_CORE, CHROME_PATH (default /usr/bin/google-chrome; unset path = bundled),
 *      DESCALL_E2E_DIST, DESCALL_E2E_PORT (5361), DESCALL_E2E_SHOTS=<dir>.
 * Prints "[e2e-shop2] OK" and exits 0, or "[e2e-shop2] FAIL <reasons>" and exits 1.
 */

const fs = require('fs');
const path = require('path');
const http = require('http');

const BK = path.join(__dirname, '../backend');
const DIST = process.env.DESCALL_E2E_DIST || path.join(__dirname, '../dist-e2e');
const PORT = Number(process.env.DESCALL_E2E_PORT || 5361);
const SHOTS = process.env.DESCALL_E2E_SHOTS || '';
const CHROME = process.env.CHROME_PATH || '/usr/bin/google-chrome';
const log = (...a) => console.log('[e2e-shop2]', ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-do-not-use-in-prod';
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://placeholder.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'placeholder-key';
process.env.NODE_ENV = 'test';

// ---- mock backend: real shop2 routes on a fake Supabase ------------------------------------
const DAY = 86400000;
const U = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const iso = (t) => new Date(t).toISOString();
let requests = [];

function boot() {
  const now = Date.now();
  const { catalogRows } = require(path.join(BK, 'lib/shop2/catalogSeed'));
  const rows = catalogRows().map((r, i) => ({ id: `20000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`, created_at: iso(now - 20 * DAY), ...r }));
  const users = [1, 2, 3, 4].map((n) => ({ id: U(n), username: n === 1 ? 'demir' : `arkadas${n}`, display_name: n === 1 ? 'Demir' : `Arkadaş ${n}`, active_sessions: [{ id: `s${n}` }], descoin_balance: n === 1 ? 42000 : 5000, created_at: iso(now - 90 * DAY) }));
  const { createFakeSupabase } = require(path.join(BK, 'test/fakeSupabase.cjs'));
  const fake = createFakeSupabase({
    users,
    friendships: [2, 3, 4].map((n) => ({ id: `f${n}`, user_id: U(1), friend_id: U(n), status: 'accepted' })),
    shop_items: rows,
    user_inventory: rows.filter((r) => r.set_key).slice(0, 3).map((r, i) => ({ id: `inv-${i}`, user_id: U(1), item_id: r.id, acquired_via: 'purchase', acquired_at: iso(now - 5 * DAY) })),
    shop_purchases: [],
    descoin_ledger: [],
  }, {});
  const sbPath = require.resolve(path.join(BK, 'db/supabase'));
  require.cache[sbPath] = { id: sbPath, filename: sbPath, loaded: true, exports: fake };
  const express = require(require.resolve('express', { paths: [BK] }));
  const { signToken } = require(path.join(BK, 'config/jwt'));
  const token = signToken({ id: U(1), username: 'demir', sid: 's1' });
  const me = { id: U(1), username: 'demir', displayName: 'Demir', display_name: 'Demir', birthDate: '2000-05-05', emailVerified: true, language: 'tr', blockedUsers: [], status: 'online', descoinBalance: 42000 };
  const friends = users.slice(1).map((u) => ({ id: u.id, username: u.username, displayName: u.display_name, status: 'online', avatarUrl: null }));
  const app = express();
  app.use((req, res, next) => {
    res.setHeader('access-control-allow-origin', '*');
    res.setHeader('access-control-allow-headers', '*');
    res.setHeader('access-control-allow-methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    if (req.path.startsWith('/api/')) requests.push(req.path);
    return next();
  });
  app.use(express.json());
  app.set('io', { emit() {}, to: () => ({ emit() {} }), sockets: { adapter: { rooms: new Map() }, sockets: new Map() } });
  app.use('/api/shop2', require(path.join(BK, 'routes/shop2')));
  const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav' };
  const API_RE = /^\/(api|auth|friends|groups|servers|calls|media|dm|reports|admin|health|maintenance|users|notifications|activity|store|shop|push|me|settings|presence|descoin|promo|premium|badges|games)(\/|$)/;
  app.use((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    const file = path.join(DIST, decodeURIComponent(url.pathname));
    if (url.pathname !== '/' && file.startsWith(DIST) && fs.existsSync(file) && fs.statSync(file).isFile()) {
      res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
      return fs.createReadStream(file).pipe(res);
    }
    if (API_RE.test(url.pathname) && !String(req.headers.accept || '').startsWith('text/html')) {
      if (/\/auth\/me$/.test(url.pathname)) return res.json({ user: me });
      if (/\/friends(\/list)?$/.test(url.pathname)) return res.json({ friends });
      if (/\/promo\//.test(url.pathname)) return res.json({ popup: null, codes: [], items: [], unseen: 0, count: 0 });
      const last = url.pathname.split('/').filter(Boolean).pop() || 'items';
      const out = { items: [], friends: [], requests: [], servers: [], groups: [], conversations: [], messages: [], notifications: [], prefs: {}, inventory: [] };
      out[last] = Array.isArray(out[last]) ? out[last] : [];
      return res.json(out);
    }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    return fs.createReadStream(path.join(DIST, 'index.html')).pipe(res);
  });
  const server = http.createServer(app);
  const { Server } = require(require.resolve('socket.io', { paths: [BK] }));
  new Server(server, { cors: { origin: '*' } }).on('connection', (s) => {
    s.emit('connected', { user: me, message: 'ok' });
    s.emit('friend:list', friends);
    s.on('app:ping', (ack) => typeof ack === 'function' && ack(Date.now()));
  });
  return new Promise((resolve) => server.listen(PORT, '127.0.0.1', () => resolve({ server, token, me })));
}

// ---- browser ------------------------------------------------------------------------------
const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const RUNS = [
  { name: 'desktop', ctx: { viewport: { width: 1280, height: 800 } }, theme: 'dark' },
  { name: 'iphone', ctx: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, userAgent: IPHONE_UA }, theme: 'dark' },
  { name: 'desktop-light', ctx: { viewport: { width: 1280, height: 800 } }, theme: 'light' },
];

async function waitFor(page, label, fn, arg, ms = 30000) {
  const t0 = Date.now();
  let last;
  while (Date.now() - t0 < ms) {
    try { last = await page.evaluate(fn, arg); } catch (err) { last = `ERR ${err.message}`; }
    if (last === true || (last && last.ok)) return last;
    await sleep(150);
  }
  throw new Error(`${label}: not reached (last ${JSON.stringify(last)})`);
}
async function shot(page, name) {
  if (!SHOTS) return;
  fs.mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: path.join(SHOTS, `${name}.jpg`), type: 'jpeg', quality: 60 });
}
const clickTab = (page, i) => page.evaluate((i) => {
  const bar = [...document.querySelectorAll('.s2-tabs, .s2-ptabs')].find((n) => n.getBoundingClientRect().width > 0);
  bar?.querySelectorAll('[role="tab"]')[i]?.click();
}, i);

async function run(browser, base, boot0, r, problems) {
  const check = (cond, msg) => { if (!cond) problems.push(`${r.name}: ${msg}`); else log(`${r.name}: ok - ${msg}`); };
  const ctx = await browser.newContext({ ...r.ctx, deviceScaleFactor: 1, locale: 'tr-TR', timezoneId: 'Europe/Istanbul', colorScheme: r.theme });
  await ctx.route('**/*', (rt) => (/^(data|blob):/.test(rt.request().url()) || rt.request().url().startsWith(base) ? rt.continue() : rt.abort()));
  await ctx.addInitScript(([api, me, token, theme]) => {
    window.__DESCALL_API_URL__ = api; window.__DESCALL_SOCKET_URL__ = api;
    try { Object.defineProperty(Navigator.prototype, 'hardwareConcurrency', { get: () => 8 }); } catch { /* ignore */ }
    try {
      if (sessionStorage.getItem('__e2e')) return;
      sessionStorage.setItem('__e2e', '1');
    } catch { return; }
    localStorage.setItem('descall_language', 'tr');
    localStorage.setItem('descall:ios-pwa-install-dismissed', '1');
    localStorage.setItem('descall:cookie_consent_v1', JSON.stringify({ choice: 'rejected', at: new Date().toISOString() }));
    localStorage.setItem('descall_token', token);
    localStorage.setItem('descall_user', JSON.stringify(me));
    localStorage.setItem('descall_user_settings', JSON.stringify({ darkMode: theme !== 'light', language: 'tr' }));
  }, [base, boot0.me, boot0.token, r.theme]);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
  const phone = r.name === 'iphone';
  // iPhone: a 47 px status bar and a 34 px home indicator, as env(safe-area-inset-*).
  let insets = false;
  if (phone) {
    const cdp = await ctx.newCDPSession(page);
    insets = await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 47, bottom: 34, left: 0, right: 0 } }).then(() => true, () => false);
  }
  try {
    await page.goto(`${base}/settings/shop`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await waitFor(page, `${r.name} market`, () => !!document.querySelector('.s2-root .s2-body .s2-card') && !document.getElementById('boot-splash'));
    await sleep(800);

    // No reload loop (Settings passes a fresh onBalanceChange on every render).
    requests = [];
    await sleep(2500);
    const sf = requests.filter((p) => p === '/api/shop2/storefront').length;
    check(sf <= 1, `storefront not re-fetched in a loop (${sf} in 2.5 s)`);

    const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check((await overflow()) <= 0, 'no horizontal page overflow (Vitrin)');

    // A tab opened from the middle of Vitrin starts at its top.
    await page.evaluate(() => {
      for (const el of document.querySelectorAll('.us-main-scroll, .shop-panel.is-shop2')) if (el.scrollHeight > el.clientHeight + 1) el.scrollTop = el.scrollHeight;
    });
    await sleep(300);
    await clickTab(page, 1);
    await waitFor(page, `${r.name} sets`, () => !!document.querySelector('.s2-switch > button, .s2-pdots-vp > button'));
    await sleep(600);
    const top = await page.evaluate(() => {
      const root = document.querySelector('.s2-root').getBoundingClientRect().top;
      const box = [...document.querySelectorAll('.us-main-scroll, .shop-panel.is-shop2')].find((el) => el.scrollHeight > el.clientHeight + 1);
      return { root, boxTop: box ? box.getBoundingClientRect().top : 0, scrolled: box ? box.scrollTop : 0 };
    });
    check(top.scrolled === 0 || top.root >= top.boxTop, `Setler opens at its top (pane scrollTop ${top.scrolled})`);
    await shot(page, `${r.name}-sets`);

    if (!phone) {
      const strip = () => page.evaluate(() => {
        const vp = document.querySelector('.s2-switch');
        const hs = vp.closest('.s2-hs');
        const pane = document.querySelector('.s2-body').getBoundingClientRect();
        const next = hs.querySelector('.s2-hs-arrow.is-next');
        return { sl: vp.scrollLeft, max: vp.scrollWidth - vp.clientWidth, right: hs.getBoundingClientRect().right, pane: pane.right, next: !!next && !next.hidden && getComputedStyle(next).display !== 'none', overflowX: getComputedStyle(vp).overflowX };
      });
      const s0 = await strip();
      check(s0.max > 0 && /auto|scroll/.test(s0.overflowX), `set switcher is a horizontal scroller (${s0.max}px more)`);
      check(s0.right <= s0.pane + 1, `set switcher stays inside the pane (${Math.round(s0.right)} <= ${Math.round(s0.pane)})`);
      check(s0.next, 'next arrow shows on desktop');
      const box = await (await page.$('.s2-switch')).boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      for (let i = 0; i < 3; i += 1) { await page.mouse.wheel(0, 120); await sleep(50); }
      await sleep(400);
      check((await strip()).sl > 100, 'mouse wheel scrolls the switcher sideways');
      await page.click('.s2-switch-hs .s2-hs-arrow.is-next');
      const before = (await strip()).sl;
      await sleep(700);
      check((await strip()).sl > before + 50, 'next arrow pages the switcher');
      await page.evaluate(() => { const b = [...document.querySelectorAll('.s2-switch > button')]; b[b.length - 1].click(); });
      await sleep(1500);
      const s1 = await strip();
      check(s1.max - s1.sl < 2, 'picking the last set brings it into view');
    } else {
      const dots = await page.evaluate(() => {
        const small = document.querySelector('.s2-pdots small');
        const vp = document.querySelector('.s2-pdots-vp');
        return { lines: Math.round(small.getBoundingClientRect().height / parseFloat(getComputedStyle(small).lineHeight || '16')), fits: vp.getBoundingClientRect().right <= document.querySelector('.s2-pset-top').getBoundingClientRect().right, scroll: vp.scrollWidth > vp.clientWidth };
      });
      check(dots.lines <= 1, 'set counter "1 / 16" stays on one line');
      check(dots.fits, 'set dots stay inside the header');
    }
    check((await overflow()) <= 0, 'no horizontal page overflow (Setler)');

    if (r.theme === 'light') {
      const lum = await page.evaluate(() => {
        const h = document.querySelector('.s2-hero h1, .s2-pset-title b');
        const c = getComputedStyle(h).color.match(/\d+(\.\d+)?/g).map(Number);
        return 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
      });
      check(lum > 180, `set title readable on the dark market panel (luminance ${Math.round(lum)})`);
      await ctx.close();
      return;
    }

    // Hediyeler: the phone preview is a real phone shape with nothing clipped; on iPhone the
    // full screen scrolls below the status bar (rows never draw over the clock).
    await clickTab(page, 4);
    await waitFor(page, `${r.name} gifts`, () => !!document.querySelector('.s2-gphone-screen .s2-gopen') && !!document.querySelector('.s2-friend'));
    await sleep(900);
    await shot(page, `${r.name}-gifts`);
    if (SHOTS) await (await page.$('.s2-gprev'))?.screenshot({ path: path.join(SHOTS, `${r.name}-gifts-preview.jpg`), type: 'jpeg', quality: 70 });
    const gp = await page.evaluate(() => [...document.querySelectorAll('.s2-gphone-screen')].filter((el) => el.getBoundingClientRect().width > 0).map((el) => {
      const b = el.getBoundingClientRect();
      const inner = [...el.querySelectorAll('.s2-gopen, .s2-gopened, .s2-gphone-home, .s2-gphone-time b')].map((n) => n.getBoundingClientRect());
      return { ratio: b.height / b.width, w: b.width, inside: inner.every((x) => x.top >= b.top - 0.5 && x.bottom <= b.bottom + 0.5 && x.left >= b.left - 0.5 && x.right <= b.right + 0.5) };
    }));
    check(gp.length > 0 && gp.every((x) => Math.abs(x.ratio - 19.5 / 9) < 0.08), `gift phone preview has a phone aspect ratio (${gp.map((x) => x.ratio.toFixed(2)).join(', ')})`);
    check(gp.every((x) => x.inside), 'gift card, clock and home indicator stay inside the phone screen');
    if (phone) {
      const sb = await page.evaluate(() => {
        const panel = document.querySelector('.s2-layer.is-full .s2-layer-panel');
        panel.scrollTop = 220;
        const top = panel.getBoundingClientRect().top;
        const hit = document.elementFromPoint(120, 20);
        // Just under the status bar: the sticky title's own background, not a scrolled row.
        const below = document.elementFromPoint(120, top + 4);
        return { top, overClock: !!hit && !!hit.closest('.s2-layer-panel'), gap: !!below && !below.closest('.s2-fullhead') };
      });
      await sleep(200);
      await shot(page, `${r.name}-gifts-scrolled`);
      check(!insets || sb.top >= 47, `gifts scroll box starts below the status bar (top ${Math.round(sb.top)}, insets ${insets})`);
      check(!insets || !sb.overClock, 'scrolled gift rows do not draw over the status bar');
      check(!sb.gap, 'no strip of scrolled rows between the status bar and the title');
      const hd = await page.evaluate(() => {
        const h = document.querySelector('.s2-layer.is-full .s2-fullhead');
        const x = h.querySelector('.s2-x').getBoundingClientRect();
        const hit = document.elementFromPoint(x.left + x.width / 2, x.top + x.height / 2);
        return { top: h.getBoundingClientRect().top, xOk: !!hit && !!hit.closest('.s2-x') };
      });
      check(hd.xOk && (!insets || hd.top >= 47), `"Hediyeler" title and close stay on top while scrolled (top ${Math.round(hd.top)})`);
      const note = await page.evaluate(() => document.querySelector('.s2-gifts .s2-gfoot-note')?.textContent || '');
      check(/arkadaş seç/.test(note), `"Gonder" off without a friend says why (${note})`);
      await page.evaluate(() => document.querySelector('.s2-layer.is-full .s2-fullhead .s2-x').click());
      await sleep(700);
    }
    check((await overflow()) <= 0, 'no horizontal page overflow (Hediyeler)');

    // Drawer / sheet from a Vitrin card.
    await clickTab(page, 0);
    await waitFor(page, `${r.name} vitrin`, () => !!document.querySelector('.s2-card .s2-card-art'));
    await page.click('.s2-card .s2-card-art');
    await waitFor(page, `${r.name} layer`, () => !!document.querySelector('.s2-layer .s2-layer-panel button'));
    await sleep(500);
    if (!phone) {
      let out = 0;
      for (let i = 0; i < 25; i += 1) {
        await page.keyboard.press('Tab');
        if (!(await page.evaluate(() => document.querySelector('.s2-layer').contains(document.activeElement)))) out += 1;
      }
      check(out === 0, `Tab stays inside the drawer (${out} escapes)`);
    }
    await page.evaluate(() => document.activeElement?.blur?.());
    await page.keyboard.press('Escape');
    await sleep(900);
    const after = await page.evaluate(() => ({ layer: !!document.querySelector('.s2-layer'), settings: !!document.querySelector('.user-settings .s2-root') }));
    check(!after.layer && after.settings, `Escape closes only the layer (layer ${after.layer}, settings ${after.settings})`);

    if (phone) {
      // Gift composer from the detail sheet (full screen on iPhone): its head sits below the
      // status bar, only its body scrolls, the "Gonder" foot clears the home indicator.
      await page.click('.s2-card .s2-card-art');
      await waitFor(page, 'detail gift button', () => !!document.querySelector('.s2-layer button[aria-label="Hediye et"]'));
      await sleep(500);
      await page.evaluate(() => document.querySelector('.s2-layer button[aria-label="Hediye et"]').click());
      await waitFor(page, 'gift composer', () => !!document.querySelector('.s2-layer.is-full .s2-gdrawer .s2-friend'));
      await sleep(700);
      const gd = await page.evaluate(() => {
        const body = document.querySelector('.s2-gdrawer-body');
        body.scrollTop = 300;
        const head = document.querySelector('.s2-gdrawer-head').getBoundingClientRect();
        const foot = document.querySelector('.s2-gdrawer .s2-gfoot');
        const fb = foot.getBoundingClientRect();
        const hit = document.elementFromPoint(120, 20);
        return { head: head.top, footBottom: fb.bottom, footPad: parseFloat(getComputedStyle(foot).paddingBottom), h: innerHeight, overClock: !!hit && !!hit.closest('.s2-layer-panel'), scrolls: body.scrollTop > 0 };
      });
      await sleep(200);
      await shot(page, `${r.name}-gift-drawer`);
      check(!insets || gd.head >= 47, `gift composer head below the status bar (top ${Math.round(gd.head)})`);
      check(!insets || !gd.overClock, 'gift composer rows never draw over the status bar');
      check(gd.footBottom <= gd.h + 0.5 && (!insets || gd.footPad >= 34), `"Gonder" foot inside the screen, clear of the home indicator (pad ${gd.footPad})`);
      check(gd.scrolls, 'gift composer body scrolls');
      if (SHOTS) await (await page.$('.s2-gdrawer .s2-gprev'))?.screenshot({ path: path.join(SHOTS, `${r.name}-gift-drawer-preview.jpg`), type: 'jpeg', quality: 70 });
      await page.keyboard.press('Escape');
      await sleep(800);
    }

    if (!phone) {
      // Buy (hold), then "Görünüm kaydet" in the celebration: the toast is above it.
      await page.click('.s2-card .s2-card-art');
      await page.waitForSelector('.s2-layer .s2-hold');
      await sleep(800); // the drawer slides in
      const hold = await (await page.$('.s2-layer .s2-hold')).boundingBox();
      await page.mouse.move(hold.x + hold.width / 2, hold.y + hold.height / 2);
      await page.mouse.down(); await sleep(1700); await page.mouse.up();
      await waitFor(page, 'celebration', () => [...document.querySelectorAll('.s2-layer button')].some((b) => /Görünüm kaydet/.test(b.textContent)));
      await page.evaluate(() => [...document.querySelectorAll('.s2-layer button')].find((b) => /Görünüm kaydet/.test(b.textContent)).click());
      const toast = await waitFor(page, 'toast', () => {
        const t = document.querySelector('.s2-toast');
        if (!t) return false;
        const b = t.getBoundingClientRect();
        const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
        return { ok: true, onTop: !!hit && t.contains(hit), inView: b.right <= innerWidth && b.bottom <= innerHeight };
      });
      check(toast.onTop && toast.inView, 'toast is painted above the celebration window, inside the viewport');
      await shot(page, `${r.name}-toast`);
    }
  } catch (err) {
    problems.push(`${r.name}: ${err.message}`);
    await shot(page, `${r.name}-error`).catch(() => {});
  }
  if (errors.length) problems.push(`${r.name}: page errors ${errors.join(' | ')}`);
  await ctx.close();
}

(async () => {
  if (!fs.existsSync(path.join(DIST, 'index.html'))) {
    log(`FAIL no build at ${DIST}`);
    process.exit(1);
  }
  const b = await boot();
  const pw = require(process.env.PLAYWRIGHT_CORE || 'playwright-core');
  const browser = await pw.chromium.launch({ ...(fs.existsSync(CHROME) ? { executablePath: CHROME } : {}), headless: true, args: ['--no-sandbox', '--lang=tr-TR'] });
  const base = `http://127.0.0.1:${PORT}`;
  const problems = [];
  for (const r of RUNS) await run(browser, base, b, r, problems);
  await browser.close();
  b.server.close();
  if (problems.length) {
    log(`FAIL ${problems.join('\n  ')}`);
    process.exit(1);
  }
  log('OK');
  process.exit(0);
})();
