'use strict';

/**
 * Electron end-to-end regression for the 2.13.0 "Ülkeler" bug (2.13.1).
 *
 * Boots the real main process (electron/main.cjs) against the built dist/, signed in
 * against an in-process mock API (https is intercepted, nothing leaves the machine),
 * then:
 *   1. opens Ayarlar → Mağaza → Ülkeler and waits for all 245 flags;
 *   2. checks the bundled Twemoji flag font loads under the Electron CSP;
 *   3. stays on the tab past the paint watchdog's reload point (22 s) and requires
 *      that main never reloads the page (2.13.0 did: did-start-loading fires for
 *      pushState, the watchdog re-armed and "clean reloaded" the app);
 *   4. breaks the Ülkeler render on purpose and requires an inline pane error with
 *      the rest of Settings still up (error boundary), then recovers;
 *   5. reloads on the nested route /settings/shop and requires every descall://
 *      request to succeed, both boot-splash logos to load, and the app to boot again
 *      (2.13.0: ./assets and ./brand resolved under /settings/ → splash hung on
 *      "Sunucuya bağlanılıyor…" with two broken logo images).
 *
 * Run from frontend/ after an Electron build (ELECTRON_BUILD=1 npm run build):
 *   xvfb-run -a npx electron electron/e2e/countriesTab.e2e.cjs --no-sandbox
 * Env: DESCALL_E2E_SHOTS=<dir> saves screenshots; DESCALL_E2E_HOLD_MS overrides step 3.
 * Prints "[e2e-countries] OK" and exits 0, or "[e2e-countries] FAIL <reason>" and exits 1.
 */

const { app, protocol, safeStorage } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');

const FRONTEND = path.join(__dirname, '..', '..');
const SHOTS = process.env.DESCALL_E2E_SHOTS || '';
const { PAINT_RELOAD_MS } = require('../bootWatchdog.cjs');
const HOLD_MS = Number(process.env.DESCALL_E2E_HOLD_MS) || PAINT_RELOAD_MS + 6000;
const TOTAL_TIMEOUT_MS = 150000;

const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'descall-e2e-countries-'));
app.setPath('userData', userData);
// Hermetic: every host fails DNS (sockets, analytics); https requests are answered by
// the mock below before DNS is needed.
app.commandLine.appendSwitch('host-resolver-rules', 'MAP * ~NOTFOUND');

const log = (...a) => console.log('[e2e-countries]', ...a);
let failed = false;
function fail(reason) {
  if (failed) return;
  failed = true;
  console.error(`[e2e-countries] FAIL ${reason}`);
  setTimeout(() => app.exit(1), 200);
}
setTimeout(() => fail(`timed out after ${TOTAL_TIMEOUT_MS}ms`), TOTAL_TIMEOUT_MS).unref();

// ---- mock API -------------------------------------------------------------------------
function loadCountries() {
  const sql = fs.readFileSync(path.join(FRONTEND, '..', 'docs', 'ops', '2026-10-19-country-badges', '01-countries-additive.sql'), 'utf8');
  const re = /\('country-([a-z]+)', '([^']+)', '([^']*)', 'countries', 'data:,', 'data:,', 0, 250, '([^']+)', '([A-Z]{2})', '([a-z_]+)', '([a-z]+)', 'common', (\d+)/g;
  const out = [];
  let m;
  while ((m = re.exec(sql))) {
    out.push({
      id: `00000000-0000-4000-8000-${String(out.length).padStart(12, '0')}`,
      sku: `country-${m[1]}`, name: m[2], description: m[3], category: 'countries',
      asset_url: 'data:,', preview_url: 'data:,', price_descoin: 250, badge_icon: m[4],
      country_code: m[5], country_region: m[6], country_kind: m[7], rarity: 'common',
      sort_order: Number(m[8]), active: true,
    });
  }
  return out;
}
const COUNTRIES = loadCountries();
const USER = {
  id: 'u-e2e', username: 'e2e', displayName: 'E2E', display_name: 'E2E', avatarUrl: null,
  isAdmin: false, descoinBalance: 1200, language: 'tr', createdAt: '2025-01-01T00:00:00Z',
  emailVerified: true, birthDate: '2000-01-01', blockedUsers: [],
};
const ROUTES = {
  '/auth/me': { user: USER },
  '/api/shop/catalog': {
    items: [...COUNTRIES, { id: 'banner-1', sku: 'banner-e2e', name: 'Banner', category: 'banner', asset_url: 'data:,', preview_url: 'data:,', price_descoin: 100, active: true, rarity: 'common', sort_order: 1 }],
    retiredCategories: ['profile_title'],
  },
  '/api/shop/inventory': { inventory: [], retiredTitles: 0 },
  '/api/shop/vouchers': { vouchers: {} },
  '/api/shop/wallet': { balance: 1200 },
  '/api/shop/daily': { streak: 1, claimedToday: true, claimAmount: 40, goals: { voice: { earned: 0, cap: 50 }, message: { earned: 0, cap: 50 }, screenshare: { earned: 0, cap: 50 } } },
  '/api/shop/ledger': { entries: [] },
};
function emptyFor(pathname) {
  const last = pathname.split('/').filter(Boolean).pop() || 'items';
  const body = { items: [], friends: [], requests: [], servers: [], groups: [], conversations: [], messages: [], notifications: [] };
  body[last] = [];
  return body;
}
const API_HOSTS = new Set(['des-call.onrender.com', 'api.descall.com', 'descall.com']);
function mockResponse(request) {
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
  const body = ROUTES[url.pathname] || emptyFor(url.pathname);
  return new Response(JSON.stringify(body), { status: 200, headers });
}

// ---- harness --------------------------------------------------------------------------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const TOKEN = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ id: USER.id, userId: USER.id, username: USER.username, exp: 4102444800 })}.e2e`;

const events = { fullNavigations: [], gone: [], failedAppRequests: [], cspViolations: [], console: [] };

app.whenReady().then(() => {
  const tokenFile = path.join(userData, 'auth-token.bin');
  fs.writeFileSync(tokenFile, safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(TOKEN) : Buffer.from(TOKEN, 'utf8'));
  protocol.handle('https', (request) => {
    try { return mockResponse(request); } catch (err) { return new Response(String(err), { status: 500 }); }
  });
  if (COUNTRIES.length !== 245) fail(`expected 245 countries in the catalog fixture, got ${COUNTRIES.length}`);
});

let attached = false;
app.on('browser-window-created', (_e, win) => {
  const wc = win.webContents;
  wc.once('did-finish-load', () => {
    if (attached || !/^descall:\/\/app\//.test(wc.getURL())) return;
    attached = true;
    watch(win);
    run(win).catch((err) => fail(err && err.stack ? err.stack : String(err)));
  });
});

function watch(win) {
  const wc = win.webContents;
  wc.on('did-start-navigation', (details) => {
    if (details && details.isMainFrame && !details.isSameDocument) events.fullNavigations.push({ at: Date.now(), url: details.url });
  });
  wc.on('render-process-gone', (_e, d) => events.gone.push(d && d.reason));
  wc.session.webRequest.onCompleted({ urls: ['descall://*/*'] }, (d) => {
    if (d.statusCode >= 400) events.failedAppRequests.push(`${d.statusCode} ${d.url}`);
  });
  wc.session.webRequest.onErrorOccurred({ urls: ['descall://*/*'] }, (d) => events.failedAppRequests.push(`${d.error} ${d.url}`));
  wc.on('console-message', (e) => {
    const msg = String(e && e.message);
    if (/Content Security Policy/i.test(msg) && /(font-src|img-src|script-src)/i.test(msg) && /descall:|fonts|brand|assets/i.test(msg)) events.cspViolations.push(msg.slice(0, 300));
    if (e && (e.level === 'error' || e.level === 3)) events.console.push(msg.slice(0, 300));
  });
}

async function js(win, code) { return win.webContents.executeJavaScript(code, true); }
async function shot(win, name) {
  if (!SHOTS) return;
  fs.mkdirSync(SHOTS, { recursive: true });
  const img = await win.webContents.capturePage();
  fs.writeFileSync(path.join(SHOTS, name), img.toPNG());
  log('screenshot', path.join(SHOTS, name));
}
async function waitFor(win, label, code, timeoutMs = 30000) {
  const started = Date.now();
  let last;
  while (Date.now() - started < timeoutMs) {
    try { last = await js(win, code); } catch (err) { last = `ERR ${err.message}`; }
    if (last && last.ok) return last;
    await sleep(250);
  }
  throw new Error(`${label}: not reached in ${timeoutMs}ms (last ${JSON.stringify(last)})`);
}

const PAINTED = `(() => {
  const r = document.getElementById('root');
  const text = r ? (r.innerText || '').replace(/\\s+/g, ' ').trim() : '';
  return { ok: !document.querySelector('#boot-splash') && !!r && r.getBoundingClientRect().height >= 80 && text.length > 0 && !document.querySelector('.crash-screen:not(.crash-pane)'), path: location.pathname, text: text.slice(0, 60) };
})()`;
const clickTab = (re) => `(() => {
  const b = [...document.querySelectorAll('button,[role=tab]')].find((x) => ${re}.test((x.innerText || '').trim()));
  if (!b) return { ok: false, why: 'no tab' };
  b.click();
  return { ok: true, label: b.innerText.trim() };
})()`;
const COUNTRY_CARDS = `(() => ({ ok: document.querySelectorAll('.country-shop .cs-card').length >= 245, cards: document.querySelectorAll('.country-shop .cs-card').length, path: location.pathname }))()`;

async function run(win) {
  // 1. Boot, then Ayarlar → Mağaza → Ülkeler (router navigation, like a click on Mağaza).
  await waitFor(win, 'boot', PAINTED, 45000);
  // Let the boot settle (index.html reports 'painted' more than once in the first ~3 s),
  // so the navigation below is a normal in-app navigation, like a user opening Mağaza.
  await sleep(6000);
  await js(win, `history.pushState({}, '', '/settings/shop'); dispatchEvent(new PopStateEvent('popstate')); true`);
  await waitFor(win, 'shop tabs', `(() => ({ ok: [...document.querySelectorAll('button')].some((b) => /^(Ülkeler|Countries)/.test((b.innerText || '').trim())) }))()`);
  const navsBefore = events.fullNavigations.length;
  const tab = await js(win, clickTab('/^(Ülkeler|Countries)/'));
  if (!tab.ok) throw new Error('Ülkeler tab not found');
  const cards = await waitFor(win, '245 flags', COUNTRY_CARDS);
  log(`Ülkeler open: ${cards.cards} cards`);
  await shot(win, 'after-1-countries-tab.png');

  // 2. Twemoji flag font (Windows path) under the Electron CSP.
  const font = await js(win, `(async () => {
    document.documentElement.classList.add('flag-font');
    const faces = await document.fonts.load('34px "Twemoji Country Flags"', '\\u{1F1F9}\\u{1F1F7}');
    return { ok: faces.length > 0, faces: faces.length, status: faces.map((f) => f.status).join(',') };
  })()`);
  if (!font.ok) throw new Error(`Twemoji flag font did not load: ${JSON.stringify(font)}`);
  log('flag font loaded', JSON.stringify(font));

  // 3. Stay past the paint watchdog's reload point: no page reload, tab still up.
  log(`holding on Ülkeler for ${HOLD_MS}ms`);
  await sleep(HOLD_MS);
  if (events.fullNavigations.length !== navsBefore) throw new Error(`page reloaded while on Ülkeler: ${JSON.stringify(events.fullNavigations.slice(navsBefore))}`);
  const still = await js(win, COUNTRY_CARDS);
  if (!still.ok) throw new Error(`Ülkeler no longer rendered after ${HOLD_MS}ms: ${JSON.stringify(still)}`);
  if (events.gone.length) throw new Error(`renderer gone: ${events.gone.join(',')}`);
  await shot(win, 'after-2-countries-tab-30s-later.png');

  // 4. A render error in the tab stays inside the tab (pane error boundary).
  await js(win, `(() => {
    const orig = String.prototype.toLocaleUpperCase;
    window.__e2eRestoreUpper = () => { String.prototype.toLocaleUpperCase = orig; };
    String.prototype.toLocaleUpperCase = function (...args) {
      if (args[0] === 'tr' && this.length <= 2) throw new Error('e2e: forced Ülkeler render error');
      return orig.apply(this, args);
    };
    return true;
  })()`);
  await js(win, clickTab('/^(Bannerlar|Banners)/'));
  await sleep(400);
  await js(win, clickTab('/^(Ülkeler|Countries)/'));
  const pane = await waitFor(win, 'pane error', `(() => ({
    ok: !!document.querySelector('.shop-catalog .crash-pane') && !document.querySelector('.crash-screen:not(.crash-pane)') && [...document.querySelectorAll('button')].some((b) => /^(Mağaza|Shop)$/.test((b.innerText || '').trim())),
    pane: !!document.querySelector('.crash-pane'), full: !!document.querySelector('.crash-screen:not(.crash-pane)'), splash: !!document.querySelector('#boot-splash'),
  }))()`, 10000);
  log('render error contained in the tab', JSON.stringify(pane));
  await sleep(800);
  await shot(win, 'after-3-countries-error-contained.png');
  await js(win, `window.__e2eRestoreUpper(); true`);
  await js(win, clickTab('/^(Bannerlar|Banners)/'));
  await sleep(400);
  await js(win, clickTab('/^(Ülkeler|Countries)/'));
  await waitFor(win, 'recovered after tab switch', COUNTRY_CARDS, 10000);
  if (events.fullNavigations.length !== navsBefore) throw new Error('the error boundary reloaded the page');

  // 5. Reload on the nested route: assets, splash logos, boot.
  events.failedAppRequests.length = 0;
  const loaded = new Promise((resolve) => win.webContents.once('did-finish-load', resolve));
  win.webContents.reload();
  await loaded;
  const logos = await js(win, `(() => {
    const imgs = [...document.querySelectorAll('#boot-splash img')];
    return { count: imgs.length, broken: imgs.filter((i) => !(i.complete && i.naturalWidth > 0)).map((i) => i.getAttribute('src') + ' → ' + i.src), path: location.pathname };
  })()`);
  log('splash logos after reload', JSON.stringify(logos));
  if (logos.count) await shot(win, 'after-4a-splash-logos-on-reload.png');
  if (logos.path !== '/settings/shop') throw new Error(`reload landed on ${logos.path}`);
  if (logos.broken.length) throw new Error(`broken splash logo(s): ${logos.broken.join(', ')}`);
  await waitFor(win, 'boot after reload on /settings/shop', PAINTED, 45000);
  if (events.failedAppRequests.length) throw new Error(`descall:// requests failed: ${events.failedAppRequests.slice(0, 5).join(' | ')}`);
  if (events.cspViolations.length) throw new Error(`CSP blocked app assets: ${events.cspViolations[0]}`);
  await shot(win, 'after-4-reload-on-settings-shop.png');

  log(`OK ${JSON.stringify({ cards: cards.cards, holdMs: HOLD_MS, font: font.faces, logos: logos.count })}`);
  console.log('[e2e-countries] OK');
  setTimeout(() => app.exit(0), 200);
}

require('../main.cjs');
