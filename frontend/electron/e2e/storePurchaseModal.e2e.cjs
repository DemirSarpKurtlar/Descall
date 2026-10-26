'use strict';

/**
 * Electron end-to-end check for the store purchase modal (12 non-country categories).
 *
 * Boots the real main process (electron/main.cjs) against the built dist/, signed in
 * against an in-process, stateful mock API (https is intercepted, nothing leaves the
 * machine), opens Ayarlar → Mağaza and:
 *   1. opens the modal for one item of every category from its Buy button and checks
 *      the buy state, the category, the Turkish (i18n map) name, that it is portalled
 *      into <body>, centred and inside the window; closes it with Escape / ✕;
 *   2. opens a too-expensive item: insufficient state, no purchase call, and the
 *      "daily reward" chip closes the modal and highlights the daily reward card;
 *   3. buys an item with "wear it" on: one purchase call, success state, the item is
 *      worn; "Geri al" puts the previous item back on (equip call) and does NOT refund
 *      or undo the purchase (balance and inventory unchanged);
 *   4. shrinks the window to the smallest size main allows (1200×700) and requires the
 *      modal to fit the viewport.
 *
 * Run from frontend/ after an Electron build (ELECTRON_BUILD=1 npm run build):
 *   xvfb-run -a npx electron electron/e2e/storePurchaseModal.e2e.cjs --no-sandbox
 * Env: DESCALL_E2E_SHOTS=<dir> saves screenshots.
 * Prints "[e2e-purchase] OK" and exits 0, or "[e2e-purchase] FAIL <reason>" and exits 1.
 */

const { app, protocol, safeStorage } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');

const SHOTS = process.env.DESCALL_E2E_SHOTS || '';
const TOTAL_TIMEOUT_MS = 150000;

const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'descall-e2e-purchase-'));
app.setPath('userData', userData);
app.commandLine.appendSwitch('host-resolver-rules', 'MAP * ~NOTFOUND');

const log = (...a) => console.log('[e2e-purchase]', ...a);
let failed = false;
function fail(reason) {
  if (failed) return;
  failed = true;
  console.error(`[e2e-purchase] FAIL ${reason}`);
  setTimeout(() => app.exit(1), 200);
}
setTimeout(() => fail(`timed out after ${TOTAL_TIMEOUT_MS}ms`), TOTAL_TIMEOUT_MS).unref();

// ---- fixture: one item per category (real seed skus, so the i18n map applies) ----------
const row = (sku, category, name, price, rarity, extra = {}) => ({
  id: `it-${sku}`, sku, name, category, price_descoin: price, rarity, active: true, sort_order: 1,
  description: `${name} description.`, asset_url: 'data:,', preview_url: 'data:,', ...extra,
});
// [category, item to buy, Turkish name expected in the modal]
const PICKS = [
  [row('banner-emerald-forest', 'banner', 'Emerald Forest', 280, 'rare'), 'Zümrüt Orman'],
  [row('avatar-effect-aurora', 'avatar_effect', 'Aurora Ring', 400, 'epic', { effect_key: 'aurora' }), 'Aurora Halkası'],
  [row('background-ocean-depths', 'profile_background', 'Ocean Depths', 350, 'epic'), null],
  [row('theme-borealis', 'theme', 'Borealis', 580, 'legendary', { theme_key: 'borealis' }), 'Borealis'],
  [row('name-effect-sigil-aurora', 'name_effect', 'Aurora Curtain', 580, 'legendary', { effect_key: 'sigil-aurora', animated: true }), 'Aurora Perdesi'],
  [row('chat-bubble-atelier-moonstone', 'chat_bubble', 'Moonstone Rim', 420, 'epic', { effect_key: 'atelier-moonstone' }), 'Aytaşı Çerçeve'],
  [row('presence-flare-halo-royal', 'presence_flare', 'Royal Halo', 520, 'legendary', { effect_key: 'halo-royal' }), 'Kraliyet Halesi'],
  [row('profile-aura-solar-bloom', 'profile_aura', 'Solar Bloom', 390, 'epic', { effect_key: 'solar-bloom' }), 'Güneş Çiçeği'],
  [row('typing-aurora-wave', 'typing_flare', 'Aurora Wave', 440, 'epic', { effect_key: 'aurora-wave' }), 'Aurora Dalgası'],
  [row('reaction-prism-split', 'reaction_burst', 'Prism Split', 570, 'legendary', { effect_key: 'prism-split' }), 'Prizma Ayrımı'],
  [row('call-aurora-dome', 'call_overlay', 'Aurora Dome', 540, 'epic', { effect_key: 'aurora-dome' }), 'Aurora Kubbesi'],
];
const WORN = row('avatar-effect-pulse', 'avatar_effect', 'Pulse Glow', 300, 'rare', { effect_key: 'pulse' });
// Not in the i18n map on purpose: English fallback, and priced above the balance.
const PRICEY = row('banner-e2e-vault', 'banner', 'Vault Banner', 99999, 'mythic');
const ITEMS = [...PICKS.map((p) => p[0]), WORN, PRICEY];
const byId = new Map(ITEMS.map((i) => [i.id, i]));
const COL = { banner: 'equippedBanner', profile_background: 'equippedBackground', theme: 'equippedTheme',
  name_effect: 'equippedNameEffect', avatar_effect: 'equippedAvatarEffect', chat_bubble: 'equippedChatBubble',
  presence_flare: 'equippedPresenceFlare', profile_aura: 'equippedProfileAura', typing_flare: 'equippedTypingFlare',
  reaction_burst: 'equippedReactionBurst', call_overlay: 'equippedCallOverlay' };

const START_BALANCE = 2918;
const S = { balance: START_BALANCE, inventory: [{ itemId: WORN.id, acquiredAt: '2026-09-20T09:00:00Z', acquiredVia: 'purchase' }], equipped: { avatar_effect: WORN.id }, calls: [] };
const USER = {
  id: 'u-e2e', username: 'e2e', displayName: 'E2E', display_name: 'E2E', avatarUrl: null,
  isAdmin: false, language: 'tr', createdAt: '2025-01-01T00:00:00Z',
  emailVerified: true, birthDate: '2000-01-01', blockedUsers: [],
};
const me = () => {
  const out = { ...USER, descoinBalance: S.balance };
  for (const [cat, col] of Object.entries(COL)) out[col] = S.equipped[cat] ? byId.get(S.equipped[cat]) : null;
  return out;
};

function route(method, pathname, body) {
  if (pathname === '/auth/me') return [200, { user: me() }];
  if (pathname === '/api/shop/catalog') return [200, { items: ITEMS, retiredCategories: [] }];
  if (pathname === '/api/shop/inventory') return [200, { inventory: S.inventory.map((r) => ({ ...r, item: byId.get(r.itemId) })), retiredTitles: 0 }];
  if (pathname === '/api/shop/vouchers') return [200, { vouchers: {} }];
  if (pathname === '/api/shop/wallet') return [200, { balance: S.balance }];
  if (pathname === '/api/shop/daily') return [200, { streak: 2, claimedToday: false, claimAmount: 40, goals: { voice: { earned: 0, cap: 50 }, message: { earned: 0, cap: 50 }, screenshare: { earned: 0, cap: 50 } } }];
  if (pathname === '/api/shop/ledger') return [200, { entries: [] }];
  if (pathname === '/api/shop/purchase' && method === 'POST') {
    const it = byId.get(body.itemId);
    S.calls.push(['purchase', body.itemId]);
    if (!it) return [404, { error: 'Item not found.' }];
    if (S.inventory.some((r) => r.itemId === it.id)) return [409, { error: 'You already own this item.', balance: S.balance }];
    if (S.balance < it.price_descoin) return [402, { error: 'Not enough DesCoin for this item.' }];
    S.balance -= it.price_descoin;
    S.inventory.unshift({ itemId: it.id, acquiredAt: new Date().toISOString(), acquiredVia: 'purchase' });
    return [200, { ok: true, balance: S.balance, item: it }];
  }
  if (pathname === '/api/shop/equip' && method === 'POST') {
    S.calls.push(['equip', body.category, body.itemId || null]);
    if (body.itemId) S.equipped[body.category] = body.itemId; else delete S.equipped[body.category];
    return [200, { ok: true }];
  }
  if (/^\/api\/shop\/(refund|unpurchase|sell)/.test(pathname)) S.calls.push(['refund', pathname]);
  const last = pathname.split('/').filter(Boolean).pop() || 'items';
  const empty = { items: [], friends: [], requests: [], servers: [], groups: [], conversations: [], messages: [], notifications: [] };
  empty[last] = [];
  return [200, empty];
}

const API_HOSTS = new Set(['des-call.onrender.com', 'api.descall.com', 'descall.com']);
async function mockResponse(request) {
  const url = new URL(request.url);
  const origin = request.headers.get('origin') || '*';
  const headers = {
    'content-type': 'application/json',
    'access-control-allow-origin': origin,
    'access-control-allow-credentials': 'true',
    'access-control-allow-headers': request.headers.get('access-control-request-headers') || '*',
    'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
  };
  if (!API_HOSTS.has(url.hostname)) return new Response('', { status: 404, headers });
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (url.pathname.startsWith('/socket.io')) return new Response('{}', { status: 404, headers });
  let body = {};
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    try { body = JSON.parse((await request.text()) || '{}'); } catch { body = {}; }
  }
  const [status, out] = route(request.method, url.pathname, body);
  return new Response(JSON.stringify(out), { status, headers });
}

// ---- harness --------------------------------------------------------------------------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const TOKEN = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ id: USER.id, userId: USER.id, username: USER.username, exp: 4102444800 })}.e2e`;

app.whenReady().then(() => {
  const tokenFile = path.join(userData, 'auth-token.bin');
  fs.writeFileSync(tokenFile, safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(TOKEN) : Buffer.from(TOKEN, 'utf8'));
  protocol.handle('https', async (request) => {
    try { return await mockResponse(request); } catch (err) { return new Response(String(err), { status: 500 }); }
  });
});

let attached = false;
app.on('browser-window-created', (_e, win) => {
  const wc = win.webContents;
  wc.once('did-finish-load', () => {
    if (attached || !/^descall:\/\/app\//.test(wc.getURL())) return;
    attached = true;
    run(win).catch((err) => fail(err && err.stack ? err.stack : String(err)));
  });
});

async function js(win, code) { return win.webContents.executeJavaScript(code, true); }
async function shot(win, name) {
  if (!SHOTS) return;
  fs.mkdirSync(SHOTS, { recursive: true });
  const img = await win.webContents.capturePage();
  fs.writeFileSync(path.join(SHOTS, name), img.toPNG());
  log('screenshot', path.join(SHOTS, name));
}
async function waitFor(win, label, code, timeoutMs = 15000) {
  const started = Date.now();
  let last;
  while (Date.now() - started < timeoutMs) {
    try { last = await js(win, code); } catch (err) { last = `ERR ${err.message}`; }
    if (last && last.ok) return last;
    await sleep(200);
  }
  throw new Error(`${label}: not reached in ${timeoutMs}ms (last ${JSON.stringify(last)})`);
}
const expect = (cond, msg) => { if (!cond) throw new Error(msg); };

const PAINTED = `(() => {
  const r = document.getElementById('root');
  const text = r ? (r.innerText || '').replace(/\\s+/g, ' ').trim() : '';
  return { ok: !document.querySelector('#boot-splash') && !!r && r.getBoundingClientRect().height >= 80 && text.length > 0 };
})()`;
const MODAL = `(() => {
  const root = document.querySelector('[data-testid="store-purchase-modal"]');
  const d = root && root.querySelector('[role="dialog"]');
  if (!d) return { ok: false, open: false };
  const b = d.getBoundingClientRect();
  const scrim = root.querySelector('.spm-scrim');
  const sb = scrim ? scrim.getBoundingClientRect() : null;
  const cs = getComputedStyle(d);
  return {
    ok: true, open: true, state: d.dataset.state, category: d.dataset.category,
    title: (d.querySelector('.spm-h-name') || {}).textContent || '',
    inBody: root.parentElement === document.body,
    top: b.top, bottom: b.bottom, left: b.left, right: b.right, vw: innerWidth, vh: innerHeight,
    scrimFull: !!sb && sb.left <= 0 && sb.top <= 0 && sb.right >= innerWidth && sb.bottom >= innerHeight,
    blur: scrim ? (getComputedStyle(scrim).backdropFilter || getComputedStyle(scrim).webkitBackdropFilter || '') : '',
    bg: cs.backgroundColor,
  };
})()`;
const CLOSED = `(() => ({ ok: !document.querySelector('[data-testid="store-purchase-modal"] [role="dialog"]') }))()`;
const openFromCard = (cat, sku) => `(() => {
  const tab = document.querySelector('[data-tab-id="${cat}"]');
  if (!tab) return { ok: false, why: 'no tab ${cat}' };
  tab.click();
  return { ok: true };
})()`;
const clickBuy = (sku) => `(() => {
  const card = document.querySelector('.shop-item-card[data-sku="${sku}"]');
  const btn = card && card.querySelector('[data-action="open-purchase"]');
  if (!btn) return { ok: false, why: card ? 'no buy button' : 'no card' };
  card.scrollIntoView({ block: 'center' });
  btn.click();
  return { ok: true };
})()`;
const clickIn = (sel) => `(() => { const el = document.querySelector('[data-testid="store-purchase-modal"] ${sel}'); if (!el) return { ok: false, why: 'missing ${sel}' }; el.click(); return { ok: true }; })()`;
const ESC = `(() => { document.activeElement && document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); return { ok: true }; })()`;

async function openModal(win, item) {
  await js(win, openFromCard(item.category, item.sku));
  await waitFor(win, `card ${item.sku}`, `(() => ({ ok: !!document.querySelector('.shop-item-card[data-sku="${item.sku}"] [data-action="open-purchase"]') }))()`);
  const r = await js(win, clickBuy(item.sku));
  expect(r.ok, `open ${item.sku}: ${r.why}`);
  const m = await waitFor(win, `modal ${item.sku}`, MODAL);
  await sleep(450); // let the open spring settle before measuring
  return { ...m, ...(await js(win, MODAL)) };
}
function checkPlacement(m, label) {
  expect(m.inBody, `${label}: modal is not portalled into <body>`);
  expect(m.scrimFull, `${label}: backdrop does not cover the full window`);
  expect(/blur\(/.test(m.blur), `${label}: backdrop has no blur (${m.blur})`);
  expect(m.top >= 0 && m.bottom <= m.vh + 0.5 && m.left >= 0 && m.right <= m.vw + 0.5, `${label}: modal outside the window ${JSON.stringify(m)}`);
  const cx = (m.left + m.right) / 2;
  expect(Math.abs(cx - m.vw / 2) <= 2, `${label}: modal not centred (${cx} vs ${m.vw / 2})`);
}

async function run(win) {
  win.setContentSize(1280, 900);
  await waitFor(win, 'boot', PAINTED, 45000);
  // Turkish UI regardless of the runner's locale/timezone (CI is en-US + UTC, so the app
  // boots in English and stores that choice): store "tr" like the language picker does,
  // then reload, so the modal shows the i18n-map names.
  if ((await js(win, 'document.documentElement.lang')) !== 'tr') {
    await js(win, `(() => {
      localStorage.setItem('descall_language', 'tr');
      for (const k of ['descall_user_settings', 'descall_settings']) {
        let s = {};
        try { s = JSON.parse(localStorage.getItem(k) || '{}') || {}; } catch { s = {}; }
        s.language = 'tr';
        localStorage.setItem(k, JSON.stringify(s));
      }
      return true;
    })()`);
    const reloaded = new Promise((resolve) => win.webContents.once('did-finish-load', resolve));
    win.webContents.reload();
    await reloaded;
    await waitFor(win, 'boot after language switch', PAINTED, 45000);
  }
  const lang = await js(win, 'document.documentElement.lang');
  expect(lang === 'tr', `UI language is ${lang}, expected tr`);
  await sleep(5000);
  await js(win, `history.pushState({}, '', '/settings/shop'); dispatchEvent(new PopStateEvent('popstate')); true`);
  await waitFor(win, 'shop cards', `(() => ({ ok: [...document.querySelectorAll('.shop-item-card')].some((c) => c.getBoundingClientRect().width > 0) }))()`, 30000);
  await sleep(600);

  // 1. Every category opens its modal in the buy state.
  for (const [i, [item, trName]] of PICKS.entries()) {
    const m = await openModal(win, item);
    const label = item.category;
    expect(m.state === 'buy', `${label}: expected buy state, got ${m.state}`);
    expect(m.category === item.category, `${label}: data-category ${m.category}`);
    if (trName) expect(m.title.trim() === trName, `${label}: title "${m.title}" (want "${trName}")`);
    checkPlacement(m, label);
    if (i === 0) await shot(win, 'purchase-1-buy-banner.png');
    if (i % 2) await js(win, ESC); else await js(win, clickIn('.spm-x'));
    await waitFor(win, `${label} closed`, CLOSED, 5000);
    await sleep(250);
  }
  expect(!S.calls.length, `opening and closing modals made API calls: ${JSON.stringify(S.calls)}`);
  log(`all ${PICKS.length} categories open`);

  // 2. Insufficient balance: no purchase, earn chips link into the page.
  const pm = await openModal(win, PRICEY);
  expect(pm.state === 'insufficient', `pricey item: expected insufficient, got ${pm.state}`);
  expect(pm.title.trim() === PRICEY.name, `English fallback title "${pm.title}"`);
  const chips = await js(win, `[...document.querySelectorAll('[data-testid="store-purchase-modal"] [data-earn]')].map((b) => b.dataset.earn)`);
  expect(chips.includes('daily') && chips.includes('invite'), `earn chips ${JSON.stringify(chips)}`);
  await shot(win, 'purchase-2-insufficient.png');
  await js(win, clickIn('[data-earn="daily"]'));
  await waitFor(win, 'insufficient closed', CLOSED, 5000);
  await waitFor(win, 'daily card highlighted', `(() => ({ ok: !!document.querySelector('.descoin-daily-card.shop-earn-focus') }))()`, 4000);
  expect(!S.calls.some((c) => c[0] === 'purchase'), 'insufficient state sent a purchase');
  log('insufficient state + daily link ok');
  await sleep(2200);

  // 3. Buy with auto-wear → success → Geri al (re-wears the previous item, keeps the purchase).
  const target = PICKS[1][0]; // avatar-effect-aurora; Pulse Glow is worn before
  const bm = await openModal(win, target);
  expect(bm.state === 'buy', `buy flow: state ${bm.state}`);
  const toggle = await js(win, `(() => { const s = document.querySelector('[data-testid="store-purchase-modal"] [role="switch"]'); return s ? s.getAttribute('aria-checked') : null; })()`);
  expect(toggle === 'true', `auto-wear switch should default on (got ${toggle})`);
  await js(win, clickIn('[data-action="buy"]'));
  await waitFor(win, 'success state', `(() => { const d = document.querySelector('[data-testid="store-purchase-modal"] [role="dialog"]'); return { ok: !!d && d.dataset.state === 'success', state: d && d.dataset.state }; })()`, 8000);
  await sleep(500);
  expect(S.calls.filter((c) => c[0] === 'purchase').length === 1, `purchase calls ${JSON.stringify(S.calls)}`);
  expect(S.equipped.avatar_effect === target.id, `not worn after buy: ${S.equipped.avatar_effect}`);
  expect(S.balance === START_BALANCE - target.price_descoin, `balance after buy ${S.balance}`);
  await shot(win, 'purchase-3-success.png');
  const equipsBefore = S.calls.filter((c) => c[0] === 'equip').length;
  await waitFor(win, 'undo ready', `(() => { const b = document.querySelector('[data-testid="store-purchase-modal"] [data-action="undo"]'); return { ok: !!b && !b.disabled }; })()`, 6000);
  await js(win, clickIn('[data-action="undo"]'));
  // Wait on the observable result (the re-wear request), not only on the button going away.
  const t0 = Date.now();
  while (S.calls.filter((c) => c[0] === 'equip').length === equipsBefore && Date.now() - t0 < 6000) await sleep(50);
  await waitFor(win, 'undo applied', `(() => ({ ok: !document.querySelector('[data-testid="store-purchase-modal"] [data-action="undo"]') }))()`, 6000);
  await sleep(400);
  expect(S.equipped.avatar_effect === WORN.id, `Geri al did not re-wear the previous item: ${S.equipped.avatar_effect}`);
  expect(S.balance === START_BALANCE - target.price_descoin, `Geri al changed the balance: ${S.balance}`);
  expect(S.inventory.some((r) => r.itemId === target.id), 'Geri al removed the purchased item');
  expect(!S.calls.some((c) => c[0] === 'refund'), 'Geri al called a refund endpoint');
  const equips = S.calls.filter((c) => c[0] === 'equip');
  expect(equips.length === 2 && equips[0][2] === target.id && equips[1][2] === WORN.id, `equip calls ${JSON.stringify(equips)}`);
  const after = await js(win, MODAL);
  expect(after.state === 'success', `after undo the modal should stay on success, got ${after.state}`);
  await shot(win, 'purchase-4-undone.png');
  await js(win, clickIn('[data-action="done"]'));
  await waitFor(win, 'success closed', CLOSED, 5000);
  log('buy → success → undo ok', JSON.stringify(S.calls));

  // 4. Short Electron window: modal fits the viewport.
  win.setContentSize(1200, 700); // main.cjs minimum window size
  await sleep(600);
  const sm = await openModal(win, PICKS[11][0]);
  checkPlacement(sm, 'short window');
  await shot(win, 'purchase-5-short-window.png');
  await js(win, ESC);
  await waitFor(win, 'short closed', CLOSED, 5000);

  log(`OK ${JSON.stringify({ categories: PICKS.length, calls: S.calls.length, balance: S.balance })}`);
  console.log('[e2e-purchase] OK');
  setTimeout(() => app.exit(0), 200);
}

require('../main.cjs');
