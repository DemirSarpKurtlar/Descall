'use strict';

/**
 * Tauri (WebView2) emulation e2e: the Electron/Tauri build (ELECTRON_BUILD=1) served at the
 * Tauri origin https://tauri.localhost with the CSP of desktop/app/src-tauri/tauri.conf.json
 * as a header (plus the inline-script hashes Tauri adds), nested asset keys resolved like
 * descall_shell::dist_path::nested_asset_key, the shell's init scripts (desktop/app/shim/*.js)
 * after fake __TAURI_INTERNALS__ / __TAURI__, and the API (https://des-call.onrender.com)
 * answered by the REAL routes/shop2.js on a fake Supabase. Every other host is aborted.
 *
 * Checks (owner report, Tauri 4.0.1: Settings > Mağaza showed its header and tabs over an
 * empty body):
 *   - Settings > Mağaza opened by clicks shows the storefront: tiles and cards painted
 *     (opacity 1), no securitypolicyviolation;
 *   - a stale "backgrounded" from the shell (html.app-backgrounded) is cleared by the first
 *     click, so the market's fade-in tiles and cards are not stuck at opacity 0;
 *   - a sweep over the rail, every Settings page and every market tab raises no CSP
 *     violation and no page error.
 *
 * Run from frontend/:
 *   ELECTRON_BUILD=1 npx vite build --outDir dist-tauri-e2e
 *   node e2e/tauriShop.e2e.cjs
 * Env: DESCALL_E2E_DIST (dist-tauri-e2e), DESCALL_E2E_PORT (5371), DESCALL_E2E_SHOTS=<dir>,
 *      CHROME_PATH (bundled Chromium when unset or missing).
 * Prints "[e2e-tauri-shop] OK" and exits 0, or "[e2e-tauri-shop] FAIL <reasons>" and exits 1.
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');

const FE = path.join(__dirname, '..');
const BK = path.join(FE, 'backend');
const DESKTOP = path.join(FE, '..', 'desktop');
const DIST = path.resolve(process.env.DESCALL_E2E_DIST || path.join(FE, 'dist-tauri-e2e'));
const PORT = Number(process.env.DESCALL_E2E_PORT || 5371);
const SHOTS = process.env.DESCALL_E2E_SHOTS || '';
const CHROME = process.env.CHROME_PATH || '';
const ORIGIN = 'https://tauri.localhost';
const API = 'https://des-call.onrender.com';
const log = (...a) => console.log('[e2e-tauri-shop]', ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-do-not-use-in-prod';
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://placeholder.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'placeholder-key';
process.env.NODE_ENV = 'test';

const DAY = 86400000;
const U = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const iso = (t) => new Date(t).toISOString();

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
    res.setHeader('access-control-allow-origin', ORIGIN);
    res.setHeader('access-control-allow-headers', '*');
    res.setHeader('access-control-allow-methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    return next();
  });
  app.use(express.json());
  app.set('io', { emit() {}, to: () => ({ emit() {} }), sockets: { adapter: { rooms: new Map() }, sockets: new Map() } });
  app.use('/api/shop2', require(path.join(BK, 'routes/shop2')));
  app.use((req, res) => {
    const p = req.path;
    if (/\/auth\/me$/.test(p)) return res.json({ user: me });
    if (/\/friends(\/list)?$/.test(p)) return res.json({ friends });
    if (/\/promo\//.test(p)) return res.json({ popup: null, codes: [], items: [], unseen: 0, count: 0 });
    const last = p.split('/').filter(Boolean).pop() || 'items';
    const out = { items: [], friends: [], requests: [], servers: [], groups: [], conversations: [], messages: [], notifications: [], prefs: {}, inventory: [] };
    out[last] = Array.isArray(out[last]) ? out[last] : [];
    return res.json(out);
  });
  const server = http.createServer(app);
  const { Server } = require(require.resolve('socket.io', { paths: [BK] }));
  new Server(server, { cors: { origin: ORIGIN }, transports: ['polling'] }).on('connection', (s) => {
    s.emit('connected', { user: me, message: 'ok' });
    s.emit('friend:list', friends);
    s.on('app:ping', (ack) => typeof ack === 'function' && ack(Date.now()));
  });
  return new Promise((resolve) => server.listen(PORT, '127.0.0.1', () => resolve({ server, token, me })));
}

/** tauri.conf.json CSP plus the sha256 of every inline script, as Tauri serves index.html. */
function cspHeader(html) {
  const conf = JSON.parse(fs.readFileSync(path.join(DESKTOP, 'app/src-tauri/tauri.conf.json'), 'utf8'));
  const csp = { ...conf.app.security.csp };
  const hashes = [];
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (/\bsrc\s*=/.test(m[1]) || /application\/ld\+json/i.test(m[1])) continue;
    hashes.push(`'sha256-${crypto.createHash('sha256').update(m[2].replace(/\r\n?/g, '\n')).digest('base64')}'`);
  }
  csp['script-src'] = `${csp['script-src']} ${hashes.join(' ')}`;
  return Object.entries(csp).map(([k, v]) => `${k} ${v}`).join('; ');
}

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.gif': 'image/gif', '.woff2': 'font/woff2', '.woff': 'font/woff', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.webm': 'video/webm', '.mp4': 'video/mp4', '.wasm': 'application/wasm', '.ico': 'image/x-icon', '.txt': 'text/plain' };

/** Init script: the Tauri globals the shims expect, recording every invoke. */
function fakeTauri(token) {
  window.__tauriCalls = [];
  window.__DESCALL_BOOT__ = Object.freeze({ version: '4.1.0', platform: 'win32', mode: 'main', token, reducedTransparency: false });
  const listeners = new Map();
  let cbId = 1;
  const answers = { app_version: '4.1.0', updates_status: { status: 'idle' }, window_content_box: { top: 0, right: 0, bottom: 0, left: 0 }, window_is_focused: true, screen_sources: [], processes_scan: [] };
  const invoke = async (cmd, args) => {
    window.__tauriCalls.push([cmd, args]);
    if (cmd === 'plugin:event|listen') return cbId++;
    return Object.prototype.hasOwnProperty.call(answers, cmd) ? answers[cmd] : null;
  };
  window.__TAURI_INTERNALS__ = {
    invoke,
    transformCallback: (cb) => { const id = cbId++; window[`_${id}`] = cb; return id; },
    metadata: { currentWindow: { label: 'main' }, currentWebview: { label: 'main', windowLabel: 'main' } },
    ipc: () => {},
    plugins: {},
  };
  window.__TAURI__ = {
    core: { invoke },
    event: {
      listen: async (ev, cb) => { if (!listeners.has(ev)) listeners.set(ev, new Set()); listeners.get(ev).add(cb); return () => listeners.get(ev).delete(cb); },
      emit: async (ev, payload) => { for (const cb of listeners.get(ev) || []) cb({ event: ev, payload }); },
    },
  };
}

async function main() {
  if (!fs.existsSync(path.join(DIST, 'index.html'))) {
    log(`FAIL no build at ${DIST} (ELECTRON_BUILD=1 npx vite build --outDir dist-tauri-e2e)`);
    process.exit(1);
  }
  const b = await boot();
  const pw = require(process.env.PLAYWRIGHT_CORE || 'playwright');
  const browser = await pw.chromium.launch({ ...(CHROME && fs.existsSync(CHROME) ? { executablePath: CHROME } : {}), headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage', '--lang=tr-TR'] });
  const problems = [];
  const check = (cond, msg) => { if (!cond) problems.push(msg); else log(`ok - ${msg}`); };
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, locale: 'tr-TR', timezoneId: 'Europe/Istanbul', colorScheme: 'dark' });
  const exists = (k) => { const f = path.join(DIST, k); return f.startsWith(DIST) && fs.existsSync(f) && fs.statSync(f).isFile(); };
  await ctx.route('**/*', async (rt) => {
    const url = rt.request().url();
    if (/^(data|blob):/.test(url)) return rt.continue();
    const u = new URL(url);
    if (u.origin === ORIGIN) {
      let key = decodeURIComponent(u.pathname).replace(/^\/+/, '');
      if (!exists(key)) {
        const segs = key.split('/').filter(Boolean);
        const ext = (segs[segs.length - 1] || '').split('.').slice(1).pop();
        let found = null;
        if (ext && !/^html?$/i.test(ext)) for (let i = 1; i < segs.length && !found; i++) if (exists(segs.slice(i).join('/'))) found = segs.slice(i).join('/');
        key = found || 'index.html'; // Tauri's SPA fallback
      }
      const file = path.join(DIST, key);
      const ext = path.extname(file);
      const body = fs.readFileSync(file);
      const headers = { 'content-type': MIME[ext] || 'application/octet-stream' };
      if (ext === '.html') headers['content-security-policy'] = cspHeader(body.toString('utf8'));
      return rt.fulfill({ status: 200, headers, body });
    }
    if (u.origin === API) {
      try {
        const res = await rt.fetch({ url: `http://127.0.0.1:${PORT}${u.pathname}${u.search}`, headers: { ...rt.request().headers(), origin: ORIGIN, host: 'des-call.onrender.com', 'x-forwarded-proto': 'https' } });
        return rt.fulfill({ response: res });
      } catch {
        return rt.abort();
      }
    }
    return rt.abort();
  });
  await ctx.routeWebSocket(/^wss?:\/\//, (ws) => ws.close());
  await ctx.addInitScript(fakeTauri, b.token);
  for (const s of ['premium-shim.js', 'electron-api-shim.js', 'premium-hud-shim.js', 'premium-launcher-shim.js', 'shell-notif.js', 'shell-overlay.js', 'tray-menu-shim.js', 'native-screen-share.js']) {
    await ctx.addInitScript({ content: fs.readFileSync(path.join(DESKTOP, 'app/shim', s), 'utf8') });
  }
  await ctx.addInitScript(([me, token]) => {
    window.__cspViolations = [];
    document.addEventListener('securitypolicyviolation', (e) => window.__cspViolations.push(`${e.violatedDirective} ${e.blockedURI}`));
    try {
      if (sessionStorage.getItem('__e2e')) return;
      sessionStorage.setItem('__e2e', '1');
    } catch { return; }
    localStorage.setItem('descall_language', 'tr');
    localStorage.setItem('descall:cookie_consent_v1', JSON.stringify({ choice: 'rejected', at: new Date().toISOString() }));
    localStorage.setItem('descall_token', token);
    localStorage.setItem('descall_user', JSON.stringify(me));
    localStorage.setItem('descall_user_settings', JSON.stringify({ darkMode: true, language: 'tr' }));
  }, [b.me, b.token]);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 300)));
  const shot = async (name) => {
    if (!SHOTS) return;
    fs.mkdirSync(SHOTS, { recursive: true });
    await page.screenshot({ path: path.join(SHOTS, `${name}.jpg`), type: 'jpeg', quality: 60 });
  };
  const waitFor = async (label, fn, ms = 30000) => {
    const t0 = Date.now();
    let last;
    while (Date.now() - t0 < ms) {
      try { last = await page.evaluate(fn); } catch (err) { last = `ERR ${err.message}`; }
      if (last === true) return true;
      await sleep(150);
    }
    throw new Error(`${label}: not reached (last ${JSON.stringify(last)})`);
  };
  // Real pointer clicks: the page's input listeners (idle, stale backgrounded) see them.
  const clickEl = async (sel) => {
    const el = page.locator(sel).first();
    await el.click({ timeout: 10000 });
  };
  const painted = () => page.evaluate(() => {
    const els = [...document.querySelectorAll('.s2-body .s2-card, .s2-tiles .s2-tile')];
    return { n: els.length, visible: els.filter((n) => Number(getComputedStyle(n).opacity) > 0.9).length };
  });
  try {
    await page.goto(`${ORIGIN}/index.html`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await waitFor('app shell', () => !!document.querySelector('.rail-btn') && !document.getElementById('boot-splash'));
    check(await page.evaluate(() => document.documentElement.classList.contains('tauri-app') && !!window.electronAPI?.isTauri), 'shims ran (html.tauri-app, electronAPI.isTauri)');

    // 1. Settings > Mağaza by clicks: the storefront is painted.
    await clickEl('.rail-btn[aria-label="Kullanıcı Ayarları"]');
    await clickEl('.s3-row[data-nav="shop"]');
    await waitFor('market', () => document.querySelectorAll('.s2-body .s2-card').length > 0);
    await sleep(1200);
    let p = await painted();
    check(p.n > 0 && p.visible === p.n, `Mağaza body painted (${p.visible}/${p.n} tiles and cards visible)`);
    await shot('market');

    // 2. Stale "backgrounded" from the shell (window restored without activation): the
    //    first click on the page clears it and the fade-in cards are painted again.
    await page.evaluate(() => window.__TAURI__.event.emit('app:visibility', { backgrounded: true }));
    await sleep(100);
    check(await page.evaluate(() => document.documentElement.classList.contains('app-backgrounded')), 'shell event sets html.app-backgrounded');
    await clickEl('.s2-tabs [role=tab] >> nth=1');
    await clickEl('.s2-tabs [role=tab] >> nth=0');
    await waitFor('market again', () => document.querySelectorAll('.s2-body .s2-card').length > 0);
    await sleep(1200);
    check(await page.evaluate(() => !document.documentElement.classList.contains('app-backgrounded')), 'a click on the page clears a stale app-backgrounded');
    p = await painted();
    check(p.n > 0 && p.visible === p.n, `cards painted after the stale state (${p.visible}/${p.n})`);
    await shot('market-after-stale');

    // 3. CSP sweep: every market tab, every Settings page, the rail.
    for (let i = 0; i < 7; i++) { await clickEl(`.s2-tabs [role=tab] >> nth=${i}`); await sleep(900); }
    const rows = await page.locator('.s3-row[data-nav]').count();
    for (let i = 0; i < rows; i++) { await clickEl(`.s3-row[data-nav] >> nth=${i}`); await sleep(700); }
    await page.keyboard.press('Escape');
    await sleep(500);
    const rail = await page.locator('.rail-btn').count();
    for (let i = 0; i < rail; i++) {
      const label = await page.locator('.rail-btn').nth(i).getAttribute('aria-label');
      if (/Ayarlar|Ekle/i.test(label || '')) continue;
      await page.locator('.rail-btn').nth(i).click({ timeout: 5000 }).catch(() => {});
      await sleep(700);
    }
    const csp = await page.evaluate(() => window.__cspViolations);
    check(csp.length === 0, `no CSP violation across the sweep${csp.length ? `: ${csp.slice(0, 5).join(', ')}` : ''}`);
    check(errors.length === 0, `no page error${errors.length ? `: ${errors.slice(0, 3).join(' | ')}` : ''}`);
  } catch (err) {
    problems.push(String(err && err.message || err));
    await shot('failure').catch(() => {});
  }
  await browser.close();
  b.server.close();
  if (problems.length) {
    log(`FAIL ${problems.join('; ')}`);
    process.exit(1);
  }
  log('OK');
  process.exit(0);
}

main().catch((err) => {
  log(`FAIL ${err && err.stack || err}`);
  process.exit(1);
});
