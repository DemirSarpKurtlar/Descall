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
 *   - light theme: the market's headings stay light on its dark panel;
 *   - Envanter "Stüdyo" (every run, plus 1440x900, a stretched wide card, de and ru on iPhone):
 *     slots and 1-9 keys, "/" search, opaque sort menu, sort by name, palette score and
 *     "Uyumluya çevir", one automatic look, trying is local (pending bar, Geri al, x), Uygula
 *     sends one /look request, the equip history's Geri dön, saved look rename / pin / delete,
 *     random combo with a locked slot, the phone's sticky collapsing preview and the pending
 *     bar above the home indicator, nothing clipped or overflowing in long locales.
 *
 * Run from frontend/ against a build that points at the mock (never production):
 *   VITE_API_BASE_URL=http://127.0.0.1:5361 VITE_SOCKET_URL=http://127.0.0.1:5361 \
 *     npx vite build --outDir dist-e2e
 *   node e2e/shop2Layout.e2e.cjs
 * Env: PLAYWRIGHT_CORE, CHROME_PATH (default /usr/bin/google-chrome; unset path = bundled),
 *      DESCALL_E2E_DIST, DESCALL_E2E_PORT (5361), DESCALL_E2E_SHOTS=<dir>,
 *      DESCALL_E2E_RUNS=<name,name> (only those runs), DESCALL_E2E_DSF=2 (sharp screenshots).
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

// Inventory "Stüdyo": the whole Gece Mercanı set, part of Mor Sis and Zümrüt Orman, three single
// frames, a flag and a retired banner; one piece arrived as a gift yesterday, two are new.
const INV = { full: 'gece-mercani', part: 'mor-sis', few: 'zumrut-orman' };
function invSeed(rows, now) {
  const pick = (key, cats) => rows.filter((r) => r.set_key === key && (!cats || cats.includes(r.category)));
  const singles = rows.filter((r) => !r.set_key && r.category === 'avatar_frame').slice(0, 3);
  const list = [
    ...pick(INV.full).map((r) => [r, 14]),
    ...pick(INV.part, ['avatar_frame', 'banner', 'profile_aura', 'profile_color', 'chat_bubble']).map((r) => [r, 9]),
    ...pick(INV.few, ['avatar_frame', 'avatar_effect', 'banner']).map((r, i) => [r, i === 0 ? 1 : 0.2, i === 0 ? 'gift' : 'purchase']),
    ...singles.map((r, i) => [r, 20 + i * 10]),
    [{ id: 'flag-tr' }, 40],
    [{ id: 'old-banner' }, 200],
  ];
  return list.map(([r, days, via = 'purchase'], i) => ({ id: `inv-${i}`, user_id: U(1), item_id: r.id, acquired_via: via, gifted_by: via === 'gift' ? U(2) : null, acquired_at: iso(now - days * DAY) }));
}
const EXTRA_ITEMS = (now) => [
  { id: 'flag-tr', sku: 'country-tr', name: 'Türkiye', category: 'countries', price_descoin: 0, rarity: 'common', active: true, created_at: iso(now - 300 * DAY) },
  { id: 'old-banner', sku: 'banner-aurora', name: 'Aurora', category: 'banner', price_descoin: 300, rarity: 'rare', active: false, created_at: iso(now - 300 * DAY) },
];

function boot() {
  const now = Date.now();
  const { catalogRows } = require(path.join(BK, 'lib/shop2/catalogSeed'));
  const rows = [...catalogRows().map((r, i) => ({ id: `20000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`, created_at: iso(now - 20 * DAY), ...r })), ...EXTRA_ITEMS(now)];
  const users = [1, 2, 3, 4].map((n) => ({ id: U(n), username: n === 1 ? 'demir' : `arkadas${n}`, display_name: n === 1 ? 'Demir' : `Arkadaş ${n}`, active_sessions: [{ id: `s${n}` }], descoin_balance: n === 1 ? 42000 : 5000, created_at: iso(now - 90 * DAY) }));
  const { createFakeSupabase } = require(path.join(BK, 'test/fakeSupabase.cjs'));
  const fake = createFakeSupabase({
    users,
    friendships: [2, 3, 4].map((n) => ({ id: `f${n}`, user_id: U(1), friend_id: U(n), status: 'accepted' })),
    shop_items: rows,
    user_inventory: invSeed(rows, now),
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
  const shopRouter = require(path.join(BK, 'routes/shop'));
  app.use('/api/shop', (req, res, next) => (req.path === '/inventory' || req.path === '/equip' || req.path.startsWith('/assets/') ? shopRouter(req, res, next) : next()));
  const shopLib = require(path.join(BK, 'lib/shop'));
  const meNow = async () => {
    const e = await shopLib.getEquippedCosmeticsForUser(U(1)).catch(() => ({}));
    const map = { avatarFrame: 'equippedAvatarFrame', banner: 'equippedBanner', badge: 'equippedBadge', country: 'equippedCountry', nameEffect: 'equippedNameEffect', avatarEffect: 'equippedAvatarEffect', chatBubble: 'equippedChatBubble', profileAura: 'equippedProfileAura', profileColor: 'equippedProfileColor', voiceTile: 'equippedVoiceTile', joinSound: 'equippedJoinSound', theme: 'equippedTheme' };
    const out = { ...me };
    for (const [k, f] of Object.entries(map)) out[f] = e[k] || null;
    return out;
  };
  app.get('/auth/me', async (req, res) => res.json({ user: await meNow() }));
  app.get('/api/auth/me', async (req, res) => res.json({ user: await meNow() }));
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
  return new Promise((resolve) => server.listen(PORT, '127.0.0.1', () => resolve({ server, token, me, rows, fake })));
}

// ---- browser ------------------------------------------------------------------------------
const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const ALL_RUNS = [
  { name: 'desktop', ctx: { viewport: { width: 1280, height: 800 } }, theme: 'dark' },
  { name: 'iphone', ctx: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, userAgent: IPHONE_UA }, theme: 'dark' },
  { name: 'desktop-light', ctx: { viewport: { width: 1280, height: 800 } }, theme: 'light' },
  // Inventory "Stüdyo" only: the owner's 1440x900 desktop and the long locales.
  { name: 'inv-1440', ctx: { viewport: { width: 1440, height: 900 } }, theme: 'dark', only: 'inventory' },
  { name: 'inv-de', ctx: { viewport: { width: 1280, height: 800 } }, theme: 'dark', only: 'inventory', lang: 'de' },
  // The full draft layout (preview column + rail + 4-column grid) needs a wider shop than the
  // Settings card gives; checked here with the card stretched.
  { name: 'inv-wide', ctx: { viewport: { width: 1920, height: 1080 } }, theme: 'dark', only: 'inventory', wide: true },
  { name: 'inv-ru-iphone', ctx: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, userAgent: IPHONE_UA }, theme: 'dark', only: 'inventory', lang: 'ru' },
];
// DESCALL_E2E_RUNS=desktop,inv-1440 runs only those; DESCALL_E2E_DSF=2 for final screenshots.
const RUNS = process.env.DESCALL_E2E_RUNS ? ALL_RUNS.filter((r) => process.env.DESCALL_E2E_RUNS.split(',').includes(r.name)) : ALL_RUNS;
const DSF = Number(process.env.DESCALL_E2E_DSF) || 1;

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

// ---- inventory "Stüdyo" ----------------------------------------------------------------------
async function api(base, token, pathName, method = 'GET', body) {
  const res = await fetch(base + pathName, { method, headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

/** Same starting look, saved looks and history for every run (runs share the mock server). */
async function resetInventory(base, boot0) {
  const { rows, token } = boot0;
  const of = (key, cat) => rows.find((x) => x.set_key === key && x.category === cat)?.id || null;
  const SLOTS = ['avatar_frame', 'banner', 'profile_aura', 'profile_color', 'profile_badge', 'avatar_effect', 'chat_bubble', 'voice_tile', 'join_sound'];
  const full = Object.fromEntries(SLOTS.map((c) => [c, of(INV.full, c)]));
  const mor = { avatar_frame: of(INV.part, 'avatar_frame'), banner: of(INV.part, 'banner'), profile_aura: of(INV.part, 'profile_aura'), profile_color: of(INV.part, 'profile_color'), chat_bubble: of(INV.part, 'chat_bubble') };
  for (const o of (await api(base, token, '/api/shop2/outfits')).body.outfits || []) await api(base, token, `/api/shop2/outfits/${o.id}`, 'DELETE');
  // History: the Mor Sis look, the banner back, then the worn look (frame from Mor Sis, the
  // galaxy effect that is off the palette).
  await api(base, token, '/api/shop2/look', 'POST', { look: mor });
  await api(base, token, '/api/shop2/look', 'POST', { look: { banner: full.banner } });
  await api(base, token, '/api/shop2/look', 'POST', { look: { ...full, avatar_frame: mor.avatar_frame, avatar_effect: of(INV.few, 'avatar_effect') } });
  const a = (await api(base, token, '/api/shop2/outfits', 'POST', { name: 'Gece Resifi', look: { ...full, avatar_frame: mor.avatar_frame, avatar_effect: of(INV.few, 'avatar_effect') } })).body.outfit;
  await api(base, token, '/api/shop2/outfits', 'POST', { name: 'Mor Sis gecesi', look: { ...full, ...mor } });
  await api(base, token, '/api/shop2/outfits', 'POST', { name: 'Galaksi turnuvası', look: { avatar_frame: of(INV.few, 'avatar_frame'), banner: of(INV.few, 'banner'), avatar_effect: of(INV.few, 'avatar_effect') } });
  if (a) await api(base, token, `/api/shop2/outfits/${a.id}`, 'PATCH', { pinned: true });
  return { full, mor };
}

async function inventoryChecks(page, r, check, base, boot0) {
  const phone = !!r.ctx.isMobile;
  await resetInventory(base, boot0);
  // Re-read me (equips changed on the server) by reopening the shop.
  await page.reload({ waitUntil: 'domcontentloaded' });
  if (r.wide) await page.addStyleTag({ content: 'html.glass-desktop .user-settings.is-desktop.s3-shell { width: calc(100vw - 40px) !important; max-width: none !important; height: calc(100vh - 40px) !important; }' });
  await waitFor(page, `${r.name} market again`, () => !!document.querySelector('.s2-root .s2-body .s2-card') && !document.getElementById('boot-splash'));
  await clickTab(page, 5);
  await waitFor(page, `${r.name} inventory`, () => !!document.querySelector('.s2-iv') && document.querySelectorAll('.s2-iv-card').length > 0);
  await sleep(900);
  const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check((await overflow()) <= 0, 'inventory: no horizontal page overflow');
  // Texts that do not fit their box (long locales): buttons, chips, menus.
  const clipped = () => page.evaluate(() => [...document.querySelectorAll('.s2-iv button, .s2-iv .s2-chip, .s2-iv-pbar *')]
    .filter((el) => el.offsetParent && !el.closest('.s2-iv-slot, .s2-iv-pslot, .s2-iv-lt, .s2-iv-hi-b, .s2-iv-df, .s2-iv-diff, .s2-iv-dd, .s2-iv-card-art, .s2-iv-row-art, .s2-iv-lt-art, .s2-iv-pp-grab, .s2-iv-setchip, .s2-iv-pslots, .s2-iv-pchips, .s2-iv-legacy-h, .s2-iv-sp') && el.scrollWidth > el.clientWidth + 2 && getComputedStyle(el).overflow !== 'visible')
    .map((el) => `${el.className}:${(el.textContent || '').trim().slice(0, 30)}`).slice(0, 6));
  const clip0 = await clipped();
  check(!clip0.length, `inventory: no clipped buttons or chips (${clip0.join(' | ')})`);
  const head = await page.evaluate(() => (phone => ({
    slots: document.querySelectorAll(phone ? '.s2-iv-pslot' : '.s2-iv-slot').length,
    chips: [...document.querySelectorAll('.s2-iv-title .s2-chip')].map((c) => c.textContent),
    ring: document.querySelector('.s2-iv-ring b')?.textContent || null,
    fix: !!document.querySelector('.s2-iv-fix'),
    looks: [...document.querySelectorAll('.s2-iv-lt')].map((l) => l.querySelector('.s2-iv-lt-t b')?.textContent),
    eq: document.querySelectorAll('.s2-iv-card.is-eq').length,
    autos: document.querySelectorAll('.s2-iv-lt.is-auto').length,
  }))(!!document.querySelector('.s2-iv.is-phone')));
  check(head.slots >= 10, `inventory: 9 slots + the flag slot (${head.slots})`);
  if (!phone) check(head.chips.length >= 3 && /\d/.test(head.chips[0]), `inventory: header chips (${head.chips.join(' / ')})`);
  check(head.ring && Number(head.ring) > 0 && Number(head.ring) < 100, `inventory: palette score with an off piece (${head.ring})`);
  check(head.fix, 'inventory: "Uyumluya çevir" offered');
  check(head.eq === 1, `inventory: the worn frame glows (${head.eq})`);
  check(head.autos === 1, `inventory: one automatic look only (${head.looks.join(', ')})`);
  if (r.lang && r.lang !== 'tr') {
    await shot(page, `${r.name}-inventory`);
    if (phone) {
      await page.evaluate(() => document.querySelector('.s2-iv-card .s2-iv-try')?.click());
      await sleep(400);
      const bar = await page.evaluate(() => { const b = document.querySelector('.s2-iv-pbar')?.getBoundingClientRect(); return b ? { bottom: b.bottom, h: innerHeight, right: b.right, w: innerWidth } : null; });
      check(bar && bar.right <= bar.w + 0.5, 'inventory: pending bar fits the phone width');
      await shot(page, `${r.name}-inventory-pending`);
      check(!(await clipped()).length, `inventory: nothing clipped with a change pending (${(await clipped()).join(' | ')})`);
    }
    return;
  }

  // 1-9 switch slots (desktop keyboard), "/" focuses the search, Escape clears it.
  if (!phone) {
    await page.evaluate(() => document.activeElement?.blur?.());
    await page.keyboard.press('2');
    await sleep(200);
    const s2 = await page.evaluate(() => document.querySelector('.s2-iv-slot.is-on')?.dataset.slot);
    check(s2 === 'banner', `inventory: key 2 opens the banner slot (${s2})`);
    await page.keyboard.press('1');
    await sleep(200);
    await page.keyboard.press('/');
    const focused = await page.evaluate(() => document.activeElement?.closest?.('.s2-iv-input') != null);
    check(focused, 'inventory: "/" focuses the slot search');
    const before = await page.evaluate(() => document.querySelectorAll('.s2-iv-card').length);
    await page.keyboard.type('zzzz-nothing');
    await sleep(250);
    const none = await page.evaluate(() => document.querySelectorAll('.s2-iv-grid .s2-iv-card').length);
    check(before > 1 && none === 0, `inventory: search filters the slot (${before} -> ${none})`);
    await page.keyboard.press('Escape');
    await sleep(200);
    check((await page.evaluate(() => document.querySelectorAll('.s2-iv-grid .s2-iv-card').length)) === before, 'inventory: Escape clears the search');
    await page.evaluate(() => document.activeElement?.blur?.());
    // Sort by name.
    await page.evaluate(() => document.querySelector('.s2-iv-fbar .s2-iv-dd')?.click());
    await sleep(150);
    const opaque = await page.evaluate(() => { const m = document.querySelector('.s2-iv-pop'); return m ? getComputedStyle(m).backgroundColor : null; });
    check(opaque && !/rgba\(.*, 0(\.\d+)?\)/.test(opaque), `inventory: sort menu is opaque (${opaque})`);
    await page.evaluate(() => [...document.querySelectorAll('.s2-iv-pop .s2-iv-mi')][2]?.click());
    await sleep(250);
    const names = await page.evaluate(() => [...document.querySelectorAll('.s2-iv-grid .s2-iv-card-body > b')].map((b) => b.textContent));
    const sorted = [...names].sort((a, b) => a.localeCompare(b, 'tr'));
    check(JSON.stringify(names) === JSON.stringify(sorted), `inventory: sort by name (${names.slice(0, 3).join(', ')})`);
    await shot(page, `${r.name}-inventory`);
    if (SHOTS) {
      await page.evaluate(() => { const b = document.querySelector('.shop-panel.is-shop2'); if (b) b.scrollTop = b.scrollHeight; });
      await sleep(300);
      await shot(page, `${r.name}-inventory-bottom`);
      await page.evaluate(() => { const b = document.querySelector('.shop-panel.is-shop2'); if (b) b.scrollTop = 0; });
    }
  } else {
    await shot(page, `${r.name}-inventory`);
  }

  // Try two items: the pending bar counts them, the preview shows them, nothing is sent yet.
  requests = [];
  await page.evaluate(() => document.querySelector('.s2-iv-card:not(.is-eq) .s2-iv-try')?.click());
  await sleep(250);
  const slot2 = phone ? '.s2-iv-pslot[data-slot="banner"]' : '.s2-iv-slot[data-slot="banner"]';
  await page.click(slot2);
  await sleep(250);
  await page.evaluate(() => document.querySelector('.s2-iv-card:not(.is-eq) .s2-iv-try')?.click());
  await sleep(300);
  let pend = await page.evaluate(() => ({ n: document.querySelector('.s2-iv-pbar-n')?.textContent, diff: document.querySelectorAll('.s2-iv-diff-chip').length, trying: document.querySelectorAll('.s2-iv-card.is-try').length }));
  check(pend.n === '2', `inventory: two changes pending (${pend.n})`);
  if (!phone) check(pend.diff === 2, `inventory: before / after chips in the preview (${pend.diff})`);
  check(!requests.some((p) => p === '/api/shop2/look'), 'inventory: trying sends nothing');
  if (phone) {
    const bar = await page.evaluate(() => { const b = document.querySelector('.s2-iv-pbar').getBoundingClientRect(); return { bottom: b.bottom, h: innerHeight, right: b.right, w: innerWidth }; });
    check(bar.bottom <= bar.h - 34 + 0.5 && bar.right <= bar.w, `inventory: pending bar above the home indicator (${Math.round(bar.bottom)} / ${bar.h})`);
  }
  await shot(page, `${r.name}-inventory-pending`);
  // Geri al steps back one change; the x removes one.
  await page.evaluate((phone) => (phone ? document.querySelector('.s2-iv-pbar-r .s2-ibtn') : [...document.querySelectorAll('.s2-iv-pbar-r .s2-btn')][0])?.click(), phone);
  await sleep(200);
  pend = await page.evaluate(() => document.querySelector('.s2-iv-pbar-n')?.textContent || '0');
  check(pend === '1', `inventory: Geri al undoes the last try (${pend})`);
  if (!phone) {
    await page.evaluate(() => document.querySelector('.s2-iv-df button')?.click());
    await sleep(200);
    check(!(await page.evaluate(() => !!document.querySelector('.s2-iv-pbar'))), 'inventory: removing the last change hides the bar');
  }
  await page.evaluate(() => document.querySelector('.s2-iv-card:not(.is-eq) .s2-iv-try')?.click());
  await sleep(200);
  // Uygula: one request with the changed slots.
  requests = [];
  const eqBefore = await page.evaluate(() => document.querySelector('.s2-iv-card.is-eq')?.dataset.item || null);
  await page.evaluate(() => document.querySelector('.s2-iv-pbar .s2-btn.is-primary')?.click());
  await waitFor(page, 'apply', () => !document.querySelector('.s2-iv-pbar'));
  await sleep(900);
  const looks = requests.filter((p) => p === '/api/shop2/look').length;
  check(looks === 1, `inventory: Uygula sends one request (${looks})`);
  const eqAfter = await page.evaluate(() => document.querySelector('.s2-iv-card.is-eq')?.dataset.item || null);
  check(eqAfter && eqAfter !== eqBefore, 'inventory: the applied item is worn now');
  const toast = await page.evaluate(() => document.querySelector('.s2-toast')?.textContent || '');
  check(/uygulandı|kuşanıldı/i.test(toast), `inventory: toast after applying (${toast.slice(0, 40)})`);
  // Equip history: the newest row is this change; "Geri dön" puts the old item back.
  await waitFor(page, 'history row', () => document.querySelectorAll('.s2-iv-hi:not(.is-live)').length > 0);
  requests = [];
  await page.evaluate(() => document.querySelector('.s2-iv-hi:not(.is-live) .s2-iv-hi-go:not(:disabled)')?.click());
  await sleep(1200);
  check(requests.includes('/api/shop2/look'), 'inventory: Geri dön sends the old items back');
  const eqBack = await page.evaluate(() => document.querySelector('.s2-iv-card.is-eq')?.dataset.item || null);
  check(eqBack === eqBefore, `inventory: Geri dön restores the worn item (${eqBack === eqBefore})`);

  if (!phone) {
    // Saved looks: rename, pin, delete (opaque menu and dialogs).
    const lookMenu = async (i) => {
      await page.evaluate((i) => document.querySelectorAll('.s2-iv-lt .s2-iv-lt-more')[i]?.click(), i);
      await sleep(150);
    };
    const titles = () => page.evaluate(() => [...document.querySelectorAll('.s2-iv-lt')].map((l) => l.querySelector('.s2-iv-lt-t b')?.textContent));
    const t0 = await titles();
    const idx = t0.indexOf('Galaksi turnuvası');
    await lookMenu(idx);
    await page.evaluate(() => document.querySelectorAll('.s2-iv-pop .s2-iv-mi')[0]?.click());
    await page.waitForSelector('.s2-layer input');
    await page.fill('.s2-layer input', 'Turnuva gecesi');
    await page.keyboard.press('Enter');
    await sleep(700);
    const t1 = await titles();
    check(t1.includes('Turnuva gecesi') && !t1.includes('Galaksi turnuvası'), 'inventory: a saved look can be renamed');
    const pinIdx = t1.indexOf('Turnuva gecesi');
    await lookMenu(pinIdx);
    await page.evaluate(() => document.querySelectorAll('.s2-iv-pop .s2-iv-mi')[1]?.click());
    await sleep(700);
    const pinned = await page.evaluate(() => [...document.querySelectorAll('.s2-iv-lt')].filter((l) => l.querySelector('.s2-iv-lt-pin')).map((l) => l.querySelector('.s2-iv-lt-t b').textContent));
    check(pinned.includes('Turnuva gecesi'), `inventory: a saved look can be pinned (${pinned.join(', ')})`);
    const t2 = await titles();
    await lookMenu(t2.indexOf('Mor Sis gecesi'));
    await page.evaluate(() => [...document.querySelectorAll('.s2-iv-pop .s2-iv-mi')].pop()?.click());
    await page.waitForSelector('.s2-layer .s2-iv-danger');
    await page.click('.s2-layer .s2-iv-danger');
    await sleep(700);
    check(!(await titles()).includes('Mor Sis gecesi'), 'inventory: a saved look can be deleted');
    // Random combo keeps a locked slot.
    await page.evaluate(() => document.querySelector('.s2-iv-shuf .s2-iv-lock.is-add')?.click());
    await sleep(150);
    await page.evaluate(() => [...document.querySelectorAll('.s2-iv-pop .s2-iv-mi')][1]?.click()); // Afiş
    await page.keyboard.press('Escape');
    await sleep(150);
    for (let k = 0; k < 3; k += 1) {
      await page.evaluate(() => document.querySelector('.s2-iv-shuf > .s2-btn')?.click());
      await sleep(150);
    }
    const shuf = await page.evaluate(() => ({ n: Number(document.querySelector('.s2-iv-pbar-n')?.textContent || 0), banner: [...document.querySelectorAll('.s2-iv-df em')].some((e) => /Afiş/.test(e.textContent)) }));
    check(shuf.n > 0 && !shuf.banner, `inventory: random combo changes slots but not the locked banner (${shuf.n})`);
    // Palette fix puts the matching effect in the preview.
    await page.evaluate(() => document.querySelector('.s2-iv-pbar-r .s2-btn')?.click());
    await sleep(150);
    await page.evaluate(() => { let i = 0; while (document.querySelector('.s2-iv-pbar') && i < 12) { document.querySelector('.s2-iv-pbar-r .s2-btn')?.click(); i += 1; } });
    await sleep(200);
    await page.evaluate(() => document.querySelector('.s2-iv-fix')?.click());
    await sleep(300);
    const fixed = await page.evaluate(() => ({ ring: document.querySelector('.s2-iv-ring b')?.textContent, good: !!document.querySelector('.s2-iv-harm.is-good') }));
    check(fixed.good && Number(fixed.ring) > Number(head.ring), `inventory: Uyumluya çevir raises the score (${head.ring} -> ${fixed.ring})`);
    await shot(page, `${r.name}-inventory-fixed`);
    await page.evaluate(() => document.querySelector('.s2-iv-pbar-r .s2-btn')?.click());
    await sleep(200);
    check((await overflow()) <= 0, 'inventory: no horizontal page overflow after the checks');
  } else {
    // Phone: the sticky preview collapses while scrolling the grid.
    await page.evaluate(() => {
      let el = document.querySelector('.s2-iv-pgrid');
      let box = el?.parentElement;
      while (box && box !== document.body && !(/(auto|scroll)/.test(getComputedStyle(box).overflowY) && box.scrollHeight > box.clientHeight)) box = box.parentElement;
      (box && box !== document.body ? box : document.scrollingElement).scrollBy(0, 700);
    });
    await sleep(600);
    const small = await page.evaluate(() => { const p = document.querySelector('.s2-iv-pp'); const b = p?.getBoundingClientRect(); return { small: p?.classList.contains('is-small'), top: b?.top }; });
    check(small.small && small.top >= 0, `inventory: the preview collapses and stays on top while scrolling (${small.small}, top ${Math.round(small.top)})`);
    await shot(page, `${r.name}-inventory-scrolled`);
    check((await overflow()) <= 0, 'inventory: no horizontal page overflow after scrolling');
  }
}

async function run(browser, base, boot0, r, problems) {
  const check = (cond, msg) => { if (!cond) problems.push(`${r.name}: ${msg}`); else log(`${r.name}: ok - ${msg}`); };
  const lang = r.lang || 'tr';
  const ctx = await browser.newContext({ ...r.ctx, deviceScaleFactor: DSF, locale: lang === 'tr' ? 'tr-TR' : lang, timezoneId: 'Europe/Istanbul', colorScheme: r.theme });
  await ctx.route('**/*', (rt) => (/^(data|blob):/.test(rt.request().url()) || rt.request().url().startsWith(base) ? rt.continue() : rt.abort()));
  await ctx.addInitScript(([api, me, token, theme, lang]) => {
    window.__DESCALL_API_URL__ = api; window.__DESCALL_SOCKET_URL__ = api;
    try { Object.defineProperty(Navigator.prototype, 'hardwareConcurrency', { get: () => 8 }); } catch { /* ignore */ }
    try {
      if (sessionStorage.getItem('__e2e')) return;
      sessionStorage.setItem('__e2e', '1');
    } catch { return; }
    localStorage.setItem('descall_language', lang);
    localStorage.setItem('descall:ios-pwa-install-dismissed', '1');
    localStorage.setItem('descall:cookie_consent_v1', JSON.stringify({ choice: 'rejected', at: new Date().toISOString() }));
    localStorage.setItem('descall_token', token);
    localStorage.setItem('descall_user', JSON.stringify({ ...me, language: lang }));
    localStorage.setItem('descall_user_settings', JSON.stringify({ darkMode: theme !== 'light', language: lang }));
  }, [base, boot0.me, boot0.token, r.theme, lang]);
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
    if (r.wide) await page.addStyleTag({ content: 'html.glass-desktop .user-settings.is-desktop.s3-shell { width: calc(100vw - 40px) !important; max-width: none !important; height: calc(100vh - 40px) !important; }' });
    await waitFor(page, `${r.name} market`, () => !!document.querySelector('.s2-root .s2-body .s2-card') && !document.getElementById('boot-splash'));
    await sleep(800);

    await inventoryChecks(page, r, check, base, boot0);
    if (r.only === 'inventory') {
      if (errors.length) problems.push(`${r.name}: page errors ${errors.join(' | ')}`);
      await ctx.close();
      return;
    }
    await clickTab(page, 0);
    await sleep(600);

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
      await page.focus('.s2-switch > button.is-on');
      await page.keyboard.press('Home');
      await sleep(900);
      const first = await page.evaluate(() => { const b = document.querySelectorAll('.s2-switch > button'); return { on: b[0].classList.contains('is-on'), focus: document.activeElement === b[0] }; });
      check(first.on && first.focus, `Home in the set switcher picks and focuses the first set (${JSON.stringify(first)})`);
      await page.keyboard.press('ArrowRight');
      await sleep(600);
      check(await page.evaluate(() => document.querySelectorAll('.s2-switch > button')[1].classList.contains('is-on')), 'ArrowRight in the set switcher picks the next set');
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
      await page.evaluate(() => { const p = document.querySelector('.s2-layer.is-full .s2-layer-panel'); p.scrollTop = p.scrollHeight; });
      await sleep(300);
      await shot(page, `${r.name}-gifts-bottom`);
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
    if (phone) {
      // Item sheet on the iPhone: head row and buy row inside the screen, nothing clipped.
      const sheet = await page.evaluate(() => {
        const p = document.querySelector('.s2-layer-panel');
        const x = p.querySelector('.s2-x').getBoundingClientRect();
        p.scrollTop = p.scrollHeight;
        const buy = p.querySelector('.s2-detail-actions').getBoundingClientRect();
        const pr = p.getBoundingClientRect();
        return { top: pr.top, x: x.right <= innerWidth && x.top >= pr.top, buy: buy.bottom <= innerHeight && buy.top >= pr.top && buy.right <= innerWidth, w: pr.width };
      });
      check(sheet.top >= 0 && sheet.x, `item sheet head row inside the screen (top ${Math.round(sheet.top)})`);
      check(sheet.buy, 'item sheet buy row reachable inside the screen');
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
      const row = await page.evaluate(() => {
        const a = document.querySelector('.s2-gdrawer .s2-gfoot-draft').getBoundingClientRect();
        const b = document.querySelector('.s2-gdrawer .s2-gfoot-send').getBoundingClientRect();
        return Math.abs(a.top - b.top) < 2 && b.right <= innerWidth;
      });
      check(row, '"Taslaga kaydet" and "Gonder" share one row on iPhone');
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
