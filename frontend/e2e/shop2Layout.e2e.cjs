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
const CLASSIC_CATS = ['banner', 'avatar_effect', 'profile_color', 'theme', 'countries', 'name_effect', 'chat_bubble', 'presence_flare', 'profile_aura', 'typing_flare', 'reaction_burst', 'call_overlay'];

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
      // Classic catalogue ("Tum urunler"): two items in every category, so the chip strip overflows.
      if (/^\/api\/shop\/catalog$/.test(url.pathname)) return res.json({ items: CLASSIC_CATS.flatMap((c, i) => [0, 1].map((k) => ({ id: `c-${c}-${k}`, name: `${c} ${k + 1}`, category: c, price_descoin: 300 + i * 50 + k * 10, rarity: 'common' }))) });
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

    // Featured set banner: prev / next, the "Siradaki" chip, dots, swipe (touch), arrow keys.
    {
      await waitFor(page, `${r.name} banner`, () => !!document.querySelector('.s2-banner .s2-banner-nav'));
      const title = () => page.evaluate(() => document.querySelector('.s2-banner h2')?.textContent || '');
      const t0 = await title();
      await page.click('.s2-banner .s2-banner-step.is-next');
      await sleep(300);
      const t1 = await title();
      check(t1 && t1 !== t0, `banner next button switches the set (${t0} -> ${t1})`);
      await page.click('.s2-banner .s2-banner-step.is-prev');
      await sleep(300);
      check((await title()) === t0, 'banner prev button goes back');
      await page.click('.s2-banner .s2-banner-next');
      await sleep(300);
      check((await title()) === t1, '"Siradaki" chip opens the next set');
      await page.evaluate(() => document.querySelector('.s2-banner-nav').scrollIntoView({ block: 'center' }));
      await sleep(200);
      const dots = await page.evaluate(() => [...document.querySelectorAll('.s2-banner-nav .s2-dots button')].map((b) => {
        const r0 = b.getBoundingClientRect();
        const cx = r0.left + r0.width / 2; const cy = r0.top + r0.height / 2;
        const miss = [[cx, cy - 10], [cx - 7, cy], [cx + 7, cy]].map(([x, y]) => document.elementFromPoint(x, y)).filter((h) => !b.contains(h));
        return miss.length ? `miss:${miss.map((h) => h?.className).join('/')}` : true;
      }));
      check(dots.length >= 2 && dots.every((d) => d === true), `banner dots have a large tap area (${dots.join(',')})`);
      const steps = await page.evaluate(() => [...document.querySelectorAll('.s2-banner-step')].map((b) => Math.round(b.getBoundingClientRect().width)));
      check(steps.every((w) => w >= (phone ? 36 : 30)), `banner prev / next are big enough (${steps.join(',')})`);
      if (phone) {
        const swiped = await page.evaluate(async () => {
          const el = document.querySelector('.s2-banner');
          const b = el.getBoundingClientRect();
          const before = el.querySelector('h2').textContent;
          const ev = (type, x) => el.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 7, pointerType: 'touch', isPrimary: true, clientX: x, clientY: b.top + 40 }));
          ev('pointerdown', b.left + b.width * 0.8); ev('pointermove', b.left + b.width * 0.5); ev('pointerup', b.left + b.width * 0.2);
          await new Promise((res) => setTimeout(res, 300));
          return { before, after: document.querySelector('.s2-banner h2').textContent, ta: getComputedStyle(el).touchAction };
        });
        check(swiped.after !== swiped.before && /pan-y/.test(swiped.ta), `swipe left on the banner shows the next set (${swiped.before} -> ${swiped.after}, ${swiped.ta})`);
        const navFits = await page.evaluate(() => { const n = document.querySelector('.s2-banner-nav').getBoundingClientRect(); const b = document.querySelector('.s2-banner').getBoundingClientRect(); return n.left >= b.left && n.right <= b.right + 0.5; });
        check(navFits, 'banner set switcher stays inside the banner');
      } else {
        await page.focus('.s2-banner .s2-banner-step.is-next');
        const k0 = await title();
        await page.keyboard.press('ArrowRight');
        await sleep(300);
        check((await title()) !== k0, 'ArrowRight in the banner shows the next set');
        await page.evaluate(() => document.activeElement?.blur?.());
      }
      await shot(page, `${r.name}-banner`);
    }

    // Top tabs (Vitrin ... Tumu) reach the last tab.
    {
      const tabs = await page.evaluate(() => {
        const bar = [...document.querySelectorAll('.s2-tabs, .s2-ptabs')].find((n) => n.getBoundingClientRect().width > 0);
        const all = bar.querySelectorAll('[role="tab"]');
        const last = all[all.length - 1];
        const cs = getComputedStyle(bar);
        return { scrolls: bar.scrollWidth <= bar.clientWidth + 1 || /auto|scroll/.test(cs.overflowX), lastW: last.getBoundingClientRect().width };
      });
      check(tabs.scrolls && tabs.lastW > 0, 'top tabs fit or scroll sideways');
    }

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

    // Tumu: the classic catalogue category chips (mount only on this tab) drag, wheel and page.
    {
      await clickTab(page, 6);
      await waitFor(page, `${r.name} chips`, () => document.querySelectorAll('.shop-chip-track .shop-category-tab').length > 2);
      await sleep(600);
      const chip = () => page.evaluate(() => {
        const vp = document.querySelector('.shop-chip-viewport');
        const tr = vp.querySelector('.shop-chip-track');
        const m = /translate3d\((-?[\d.]+)px/.exec(tr.style.transform || '');
        const next = document.querySelector('.shop-chip-arrow.is-next');
        return { x: m ? -Number(m[1]) : 0, max: tr.scrollWidth - vp.clientWidth, next: !!next && !next.hidden, fadeR: vp.classList.contains('is-fade-right'), w: vp.clientWidth };
      });
      const c0 = await chip();
      if (c0.max > 4) {
        check(c0.fadeR, `chip strip shows the right fade when more chips are hidden (${c0.max}px more)`);
        if (phone) {
          const moved = await page.evaluate(async () => {
            const vp = document.querySelector('.shop-chip-viewport');
            const b = vp.getBoundingClientRect();
            const y = b.top + b.height / 2;
            const fire = (target, type, x) => target.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 9, pointerType: 'touch', isPrimary: true, button: 0, clientX: x, clientY: y }));
            fire(vp, 'pointerdown', b.right - 20);
            for (let i = 1; i <= 8; i += 1) { fire(window, 'pointermove', b.right - 20 - i * 30); await new Promise((r0) => setTimeout(r0, 16)); }
            fire(window, 'pointerup', b.right - 260);
            await new Promise((r0) => setTimeout(r0, 900));
            return true;
          });
          const c1 = await chip();
          check(moved && c1.x > 60, `touch drag scrolls the category chips (${Math.round(c1.x)}px)`);
        } else {
          check(c0.next, 'chip strip next arrow shows on desktop');
          const box = await (await page.$('.shop-chip-viewport')).boundingBox();
          await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
          for (let i = 0; i < 3; i += 1) { await page.mouse.wheel(0, 120); await sleep(50); }
          await sleep(300);
          check((await chip()).x > 60, 'mouse wheel scrolls the category chips');
        }
        await page.evaluate(() => { const b = [...document.querySelectorAll('.shop-chip-track .shop-category-tab')]; b[b.length - 1].click(); });
        await sleep(1200);
        const c2 = await chip();
        check(c2.max - c2.x < 2, `picking the last category brings it into view (${Math.round(c2.x)} / ${Math.round(c2.max)})`);
        const picked = await page.evaluate(() => { const b = [...document.querySelectorAll('.shop-chip-track .shop-category-tab')]; return b[b.length - 1].getAttribute('aria-selected'); });
        check(picked === 'true', `the first tap after a drag picks the category (aria-selected ${picked})`);
        if (phone) {
          const arrows = await page.evaluate(() => [...document.querySelectorAll('.shop-chip-arrow')].filter((a) => a.getBoundingClientRect().width > 0).length);
          check(arrows === 0, `no chip arrows cover the chips on a touch screen (${arrows})`);
        }
      } else {
        log(`${r.name}: chips fit (${c0.max}px)`);
      }
      await shot(page, `${r.name}-chips`);
      check((await overflow()) <= 0, 'no horizontal page overflow (Tumu)');
      await clickTab(page, 1);
      await sleep(400);
    }

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
