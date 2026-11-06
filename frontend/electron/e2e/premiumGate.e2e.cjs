'use strict';

/**
 * Electron end-to-end check for main's Descall+ server check failing at launch.
 *
 * Boots the real main process against the built dist/ with an in-process mock API. Main's
 * own GET /api/premium/me answers 503 (a cold API host) until the test flips it, then:
 *   1. the gate stays locked and reports the reason (snapshot.lastError);
 *   2. Ayarlar > Descall+ shows the "desktop features are locked" notice with the code;
 *   3. a desktop action fails as locked;
 *   4. main retries on its own within seconds, all modules start and the notice goes away.
 *
 * Run from frontend/ after an Electron build (ELECTRON_BUILD=1 npm run build:prod):
 *   xvfb-run -a npx electron electron/e2e/premiumGate.e2e.cjs --no-sandbox
 * Env: DESCALL_E2E_SHOTS=<dir> saves screenshots.
 */

const { app, protocol, safeStorage, BrowserWindow } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');

const SHOTS = process.env.DESCALL_E2E_SHOTS || '';
const TOTAL_TIMEOUT_MS = 240000;

const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'descall-e2e-premium-gate-'));
app.setPath('userData', userData);
app.commandLine.appendSwitch('host-resolver-rules', 'MAP * ~NOTFOUND');

const log = (...a) => console.log('[e2e-premium]', ...a);
let failed = false;
function fail(reason) {
  if (failed) return;
  failed = true;
  console.error(`[e2e-premium] FAIL ${reason}`);
  setTimeout(() => app.exit(1), 200);
}
setTimeout(() => fail(`timed out after ${TOTAL_TIMEOUT_MS}ms`), TOTAL_TIMEOUT_MS).unref();

const USER = {
  id: 'u-e2e', username: 'e2e', displayName: 'E2E Tester', display_name: 'E2E Tester', avatarUrl: null,
  isAdmin: false, language: 'tr', createdAt: '2025-01-01T00:00:00Z', emailVerified: true, birthDate: '2000-01-01',
  blockedUsers: [], premium_plan: 'ultra', descoinBalance: 5000,
};
const FRIEND = { id: 'u-friend', username: 'deniz', displayName: 'Deniz', display_name: 'Deniz', avatarUrl: null, premium_plan: 'ultra' };
const S = { plan: 'ultra', meCalls: 0, mainFail: true, mainCalls: 0 };

function premiumMe() {
  if (!S.plan) return { plan: null, status: 'none', ends_at: null, unlimited: false, features: [], monthly_descoin: 0, next_coin_at: null };
  return {
    plan: S.plan, status: 'active', ends_at: '2026-12-02T00:00:00Z', unlimited: false,
    features: null, monthly_descoin: 5000, next_coin_at: '2026-12-02T00:00:00Z',
  };
}

function route(method, pathname) {
  if (pathname === '/auth/me') return [200, { user: USER }];
  if (pathname === '/api/premium/me') { S.meCalls += 1; return [200, premiumMe()]; }
  if (pathname === '/api/premium/plans') return [200, { plans: [] }];
  if (pathname === '/api/friends/list') return [200, { friends: [FRIEND] }];
  if (pathname.startsWith('/api/promo/')) return [200, { popup: null, items: [], count: 0, unseen: 0 }];
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
  const [status, out] = route(request.method, url.pathname);
  return new Response(JSON.stringify(out), { status, headers });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const TOKEN = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ id: USER.id, userId: USER.id, username: USER.username, exp: 4102444800 })}.e2e`;

app.whenReady().then(() => {
  // Electron 45: async safeStorage, like main.cjs (tokenCrypto.cjs). Written long before the renderer asks for it.
  safeStorage.isAsyncEncryptionAvailable().then((ok) => (ok ? safeStorage.encryptStringAsync(TOKEN) : Buffer.from(TOKEN, 'utf8'))).then((buf) => fs.writeFileSync(path.join(userData, 'auth-token.bin'), buf));
  protocol.handle('https', async (request) => {
    try { return await mockResponse(request); } catch (err) { return new Response(String(err), { status: 500 }); }
  });
});

let attached = false;
app.on('browser-window-created', (_e, win) => {
  // Main's own server check: 503 (cold start) until the probe flips S.mainFail.
  require('../premium/index.cjs').gate.configure({ fetchMe: async () => {
    S.mainCalls += 1;
    if (S.mainFail) throw Object.assign(new Error('HTTP 503'), { status: 503 });
    return premiumMe();
  } });
  const wc = win.webContents;
  wc.once('did-finish-load', () => {
    if (attached || !/^descall:\/\/app\//.test(wc.getURL()) || /popout=1/.test(wc.getURL())) return;
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
async function until(label, fn, timeoutMs = 15000) {
  const started = Date.now();
  let last;
  while (Date.now() - started < timeoutMs) {
    try { last = await fn(); } catch (err) { last = `ERR ${err.message}`; }
    if (last && (last === true || last.ok)) return last;
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


const CONSOLE = [];
async function run(win) {
  const premium = require('../premium/index.cjs');
  win.webContents.on('console-message', (e, level, message) => { if (level >= 2) CONSOLE.push(String(message).slice(0, 240)); });
  await until('app painted', () => js(win, PAINTED), 40000);
  await sleep(2500);
  expect(!premium.gate.has('mini_mode'), 'gate should be locked while main gets 503');
  log('gate snapshot while failing', JSON.stringify(premium.gate.snapshot()).slice(0, 200));
  for (let i = 0; i < 3; i++) {
    const had = await js(win, `(() => { const s = document.querySelector('.g-alert-scrim'); if (!s) return false; const b = [...s.querySelectorAll('button')].find((x) => /^(Sonra|Later|Kapat|Close)$/i.test((x.textContent || '').trim())) || s.querySelector('button'); b && b.click(); return true; })()`);
    if (!had) break;
    await sleep(500);
  }
  await js(win, `(() => { history.pushState({}, '', '/settings/premium'); dispatchEvent(new PopStateEvent('popstate')); return true; })()`);
  await until('tiles', () => js(win, `(() => { const nav = document.querySelector('[data-nav="premium"]'); if (nav && !document.querySelector('[data-category]')) nav.click(); return { ok: document.querySelectorAll('[data-category]').length === 8 }; })()`), 20000);
  const notice = await until('gate notice', () => js(win, `(() => { const n = document.querySelector('[data-testid="premium-gate-notice"]'); return n ? { ok: true, code: n.getAttribute('data-gate-code'), text: n.innerText.replace(/\\s+/g, ' ') } : { ok: false }; })()`), 15000);
  log('NOTICE', JSON.stringify(notice));
  await shot(win, 'gate-locked.png');
  const locked = await js(win, `window.descallPremium.invoke('premium:custom_layouts:save', { name: 'x', widgets: [] }).then((r) => r, (e) => ({ ok: false, error: String(e && e.message || e) }))`);
  log('save while locked', JSON.stringify(locked));
  expect(locked && /locked|No handler registered/.test(locked.error), 'save while locked should fail as locked');
  const callsBefore = S.mainCalls;
  S.mainFail = false;
  await until('gate verified after automatic retry', () => premium.gate.has('mini_mode'), 25000);
  log('main /me calls', callsBefore, '->', S.mainCalls);
  await until('notice gone', () => js(win, `!document.querySelector('[data-testid="premium-gate-notice"]')`), 10000);
  await shot(win, 'gate-unlocked.png');
  log('snapshot after', JSON.stringify(premium.gate.snapshot()).slice(0, 160));
  console.log('[e2e-premium] OK');
  setTimeout(() => app.exit(0), 200);
}

require('../main.cjs');
