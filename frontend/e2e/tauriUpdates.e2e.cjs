'use strict';

/**
 * Tauri (WebView2) emulation e2e for the desktop update card (ElectronUpdateToast) and
 * Settings > Desktop app, with the same harness as tauriShop.e2e.cjs (build at the Tauri origin,
 * tauri.conf.json CSP, shims as init scripts after fake __TAURI_INTERNALS__ / __TAURI__, every
 * other host aborted). Shell events are emitted the way commands/updates.rs sends them.
 *
 * Checks:
 *   - update:downloading / update:progress / update:ready drive the card (downloading, ready chip);
 *   - "Install now" invokes updates_restart {confirmed:false};
 *   - update:error phase "install" (the staged installer did not start) keeps a card on screen
 *     with the install-failure copy and Retry (it used to vanish with the Install now chip);
 *   - Retry asks the shell again and the staged update comes back as the ready chip;
 *   - the download page opens the desktop-vX.Y.Z prerelease, not releases/latest (Electron);
 *   - Settings > Desktop app: Check during a download shows the download, not "up to date".
 *
 * Run from frontend/:
 *   ELECTRON_BUILD=1 npx vite build --outDir dist-tauri-e2e
 *   node e2e/tauriUpdates.e2e.cjs
 * Prints "[e2e-tauri-updates] OK" and exits 0, or "[e2e-tauri-updates] FAIL <reasons>" and exits 1.
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');

const FE = path.join(__dirname, '..');
const BK = path.join(FE, 'backend');
const DESKTOP = path.join(FE, '..', 'desktop');
const DIST = path.resolve(process.env.DESCALL_E2E_DIST || path.join(FE, 'dist-tauri-e2e'));
const PORT = Number(process.env.DESCALL_E2E_PORT || 5373);
const SHOTS = process.env.DESCALL_E2E_SHOTS || '';
const CHROME = process.env.CHROME_PATH || '';
const ORIGIN = 'https://tauri.localhost';
const API = 'https://des-call.onrender.com';
const log = (...a) => console.log('[e2e-tauri-updates]', ...a);
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
  // The CI build (dist-e2e) bakes a local mock API (VITE_API_BASE_URL=http://127.0.0.1:5361)
  // in place of the production API origin, which the shipped CSP already allows. Allow only
  // that loopback stand-in here so the sweep still catches every other connect-src gap.
  csp['connect-src'] = `${csp['connect-src']} http://127.0.0.1:* ws://127.0.0.1:*`;
  return Object.entries(csp).map(([k, v]) => `${k} ${v}`).join('; ');
}

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.gif': 'image/gif', '.woff2': 'font/woff2', '.woff': 'font/woff', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.webm': 'video/webm', '.mp4': 'video/mp4', '.wasm': 'application/wasm', '.ico': 'image/x-icon', '.txt': 'text/plain' };

/** Init script: the Tauri globals the shims expect, recording every invoke. */
function fakeTauri(token) {
  window.__tauriCalls = [];
  window.__DESCALL_BOOT__ = Object.freeze({ version: '4.1.0', platform: 'win32', mode: 'main', token, reducedTransparency: false });
  const listeners = new Map();
  let cbId = 1;
  const answers = window.__answers = { app_version: '4.1.0', updates_status: { updateReady: false, updateVersion: null }, updates_check: { success: true, available: true, updateInfo: { version: '4.2.0' }, updateReady: false, updateVersion: null }, updates_restart: { installing: false, needsConfirm: false }, window_content_box: { top: 0, right: 0, bottom: 0, left: 0 }, window_is_focused: true, screen_sources: [], processes_scan: [] };
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
    const emit = (ev, payload) => page.evaluate(([e, p]) => window.__TAURI__.event.emit(e, p), [ev, payload]);
    const card = () => page.evaluate(() => {
      const el = document.querySelector('.electron-update-toast');
      return el ? { cls: el.className, text: el.innerText.replace(/\s+/g, ' ').trim() } : null;
    });
    const calls = (cmd) => page.evaluate((c) => window.__tauriCalls.filter(([k]) => k === c), cmd);

    await emit('update:downloading', { version: '4.2.0' });
    await emit('update:progress', { percent: 40, version: '4.2.0', transferred: 4, total: 10 });
    await waitFor('downloading card', () => /is-downloading/.test(document.querySelector('.electron-update-toast')?.className || ''));
    check(/40/.test((await card()).text), `downloading card shows progress (${(await card()).text})`);

    // Settings > Desktop app while the download runs: Check reports it (commands/updates.rs
    // in_flight_result), not "up to date".
    await clickEl('.rail-btn[aria-label="Kullanıcı Ayarları"]');
    const desktopRow = page.locator('.s3-row[data-nav="desktop"]');
    // Settings opens with an animation; on a slow runner count() ran before it rendered.
    await desktopRow.first().waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});
    if (await desktopRow.count()) {
      await desktopRow.first().click({ timeout: 10000 });
      await page.evaluate(() => { window.__answers.updates_check = { success: true, available: true, updateInfo: { version: '4.2.0' }, updateReady: false, updateVersion: null }; });
      await waitFor('desktop pane', () => !!document.querySelector('.s3-desktop-update'));
      await page.locator('.s3-desktop-update .s3-row').nth(1).click({ timeout: 10000 });
      await sleep(400);
      const paneText = await page.evaluate(() => document.querySelector('.s3-desktop-update').innerText);
      check(!/güncel/i.test(paneText.split('\n').slice(0, 4).join(' ')) || /indiriliyor/i.test(paneText), `Check during a download does not read up to date (${paneText.replace(/\s+/g, ' ').slice(0, 120)})`);
      await page.keyboard.press('Escape');
      // Settings closes with an animation over the update card: wait until it is gone.
      await page.waitForFunction(() => !document.querySelector('.s3-row[data-nav="desktop"]'), null, { timeout: 10000 }).catch(() => {});
      await sleep(300);
    } else {
      problems.push('Settings has no Desktop app row (data-nav="desktop")');
    }

    await emit('update:ready', { version: '4.2.0', deferred: false });
    await waitFor('ready chip', () => /is-ready/.test(document.querySelector('.electron-update-toast')?.className || ''));
    await clickEl('.electron-update-toast .eut-btn');
    await sleep(200);
    const restart = await calls('updates_restart');
    check(restart.length === 1 && restart[0][1] && restart[0][1].confirmed === false, `Install now invokes updates_restart {confirmed:false} (${JSON.stringify(restart)})`);

    // The shell tried to install, the installer did not start: it keeps the update staged.
    await emit('update:installing', { version: '4.2.0' });
    await emit('update:error', { message: 'os error 5', phase: 'install' });
    await sleep(200);
    let c = await card();
    check(!!c && /is-error/.test(c.cls) && /kurulamad/i.test(c.text), `install failure keeps a card with its own copy (${c && c.text})`);

    // Download page: the desktop prerelease of this version (Electron: releases/latest).
    await page.evaluate(() => { window.__opened = []; window.open = (u) => { window.__opened.push(String(u)); return null; }; });
    await page.locator('.electron-update-toast .eut-btn.is-ghost').click({ timeout: 5000 });
    const opened = await page.evaluate(() => window.__opened);
    check(opened.length === 1 && /releases\/tag\/desktop-v4\.2\.0$/.test(opened[0]), `download page is the desktop release (${opened.join(', ')})`);

    // Retry: the shell answers the staged update -> ready chip again.
    await page.evaluate(() => { window.__answers.updates_check = { success: true, available: true, updateInfo: null, updateReady: true, updateVersion: '4.2.0' }; });
    await page.locator('.electron-update-toast .eut-btn:not(.is-ghost)').click({ timeout: 5000 });
    await waitFor('ready chip after retry', () => /is-ready/.test(document.querySelector('.electron-update-toast')?.className || ''));
    check(true, 'Retry brings the staged update back as the ready chip');

    // A quiet background check failure never replaces the chip.
    await emit('update:error', { message: 'x', phase: 'check' });
    await sleep(150);
    c = await card();
    check(!!c && /is-ready/.test(c.cls), 'a background check failure keeps the ready chip');
    await shot('ready');
    check(errors.length === 0, `no page error${errors.length ? `: ${errors.slice(0, 3).join(' | ')}` : ''}`);
    const csp = await page.evaluate(() => window.__cspViolations);
    check(csp.length === 0, `no CSP violation${csp.length ? `: ${csp.slice(0, 5).join(', ')}` : ''}`);
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
