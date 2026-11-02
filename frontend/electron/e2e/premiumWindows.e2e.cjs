'use strict';

/**
 * Electron end-to-end smoke for the Descall+ desktop windows.
 *
 * Boots the real main process (electron/main.cjs) against the built dist/, signed in
 * against an in-process mock API (https is intercepted, nothing leaves the machine) that
 * grants Descall+ ("plus") from /api/premium/me, then:
 *   1. waits for main's own gate check (renderer claim ∩ server answer) to unlock plus keys;
 *   2. a tampered renderer claim for Ultra keys does not unlock them;
 *   3. opens mini mode, the call (PiP) window and a DM pop-out, and checks each window
 *      (always on top, portal content rendered, pop-out chrome);
 *   4. opens Ayarlar > Descall+ and checks the status card and feature list;
 *   5. the server revokes the plan: main closes the windows.
 *
 * Run from frontend/ after an Electron build (ELECTRON_BUILD=1 npm run build:prod):
 *   xvfb-run -a npx electron electron/e2e/premiumWindows.e2e.cjs --no-sandbox
 * Env: DESCALL_E2E_SHOTS=<dir> saves screenshots.
 * Prints "[e2e-premium] OK" and exits 0, or "[e2e-premium] FAIL <reason>" and exits 1.
 */

const { app, protocol, safeStorage, BrowserWindow } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');

const SHOTS = process.env.DESCALL_E2E_SHOTS || '';
const TOTAL_TIMEOUT_MS = 150000;

const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'descall-e2e-premium-'));
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
  blockedUsers: [], premium_plan: 'plus', descoinBalance: 5000,
};
const FRIEND = { id: 'u-friend', username: 'deniz', displayName: 'Deniz', display_name: 'Deniz', avatarUrl: null, premium_plan: 'ultra' };
const S = { plan: 'plus', meCalls: 0 };

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
  fs.writeFileSync(path.join(userData, 'auth-token.bin'), safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(TOKEN) : Buffer.from(TOKEN, 'utf8'));
  protocol.handle('https', async (request) => {
    try { return await mockResponse(request); } catch (err) { return new Response(String(err), { status: 500 }); }
  });
});

let attached = false;
app.on('browser-window-created', (_e, win) => {
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

async function run(win) {
  const premium = require('../premium/index.cjs');
  await until('app painted', () => js(win, PAINTED), 40000);
  log('app painted');

  // 1. Main's own check unlocks the plus keys.
  await until('gate verified (plus)', () => premium.gate.has('mini_mode') && premium.gate.has('pip_call') && premium.gate.has('multi_window'), 20000);
  expect(premium.gate.plan() === 'plus', `gate plan ${premium.gate.plan()}`);
  expect(S.meCalls >= 2, `main and renderer should both read /api/premium/me (calls ${S.meCalls})`);
  await until('modules running', () => ['mini_mode', 'pip_call', 'multi_window', 'tray_controls_plus'].every((k) => premium.runningKeys().includes(k)), 5000);
  log('gate ok', JSON.stringify(premium.gate.snapshot().keys.length), 'running', premium.runningKeys().join(','));

  // 2. A tampered renderer claim cannot unlock Ultra keys.
  const claimed = await js(win, `window.descallPremium.invoke('premium:entitlements', { keys: ['desktop_sidebar', 'window_layouts', 'mini_mode', 'pip_call', 'multi_window', 'tray_controls_plus', 'taskbar_plus', 'always_on_top', 'window_opacity', 'session_restore'], plan: 'ultra' })`);
  await sleep(600);
  expect(!premium.gate.has('desktop_sidebar') && !premium.gate.has('window_layouts'), `tampered claim unlocked ultra keys ${JSON.stringify(claimed)}`);
  expect(premium.gate.has('mini_mode'), 'plus keys lost after the tampered claim');
  const blocked = await js(win, `window.descallPremium.invoke('premium:sidebar:toggle').then((r) => r, (e) => ({ error: String(e && e.message || e) }))`);
  expect(!blocked || blocked.ok !== true, `ultra channel answered: ${JSON.stringify(blocked)}`);
  const badChannel = await js(win, `window.descallPremium.invoke('secure-token:get').then(() => 'answered', (e) => 'rejected')`);
  expect(badChannel === 'rejected', 'bridge must refuse non-premium channels');
  log('tamper check ok');

  // 3a. Mini mode.
  win.webContents.send('premium:open', { kind: 'mini' });
  const mini = await until('mini window', () => {
    const e = premium.windows.list('mini')[0];
    return e ? { ok: true, e } : null;
  }, 10000);
  const miniWin = mini.e.win;
  await sleep(700);
  expect(miniWin.isAlwaysOnTop(), 'mini window is not on top');
  const miniText = await js(win, `(() => { const w = window.open('', 'descall-premium-mini'); const el = w && w.document.querySelector('[data-testid="premium-mini"]'); return el ? el.innerText : ''; })()`);
  expect(/Mini/i.test(miniText), `mini content not rendered: ${JSON.stringify(miniText)}`);
  await shot(miniWin, 'mini-mode.png');
  log('mini ok', JSON.stringify(miniWin.getBounds()));

  // 3b. Call (PiP) window.
  win.webContents.send('premium:open', { kind: 'call' });
  const pip = await until('call window', () => {
    const e = premium.windows.list('call')[0];
    return e ? { ok: true, e } : null;
  }, 10000);
  const pipWin = pip.e.win;
  await sleep(700);
  expect(pipWin.isAlwaysOnTop() && pipWin.isResizable(), 'call window must be on top and resizable');
  const pipText = await js(win, `(() => { const w = window.open('', 'descall-premium-call'); const el = w && w.document.querySelector('[data-testid="premium-call"]'); return el ? el.innerText : ''; })()`);
  expect(pipText.length > 0, 'call window content not rendered');
  await shot(pipWin, 'pip-call.png');
  log('pip ok', JSON.stringify(pipWin.getBounds()));

  // 3c. DM pop-out (route window of the same app document).
  const opened = await js(win, `window.descallPremium.invoke('premium:popout:open', '/direct/deniz')`);
  expect(opened && opened.ok, `pop-out refused: ${JSON.stringify(opened)}`);
  const again = await js(win, `window.descallPremium.invoke('premium:popout:open', '/direct/deniz')`);
  expect(again && again.reused, `same route should be reused: ${JSON.stringify(again)}`);
  const pop = await until('pop-out window', () => {
    const e = premium.windows.list('popout')[0];
    return e ? { ok: true, e } : null;
  }, 10000);
  const popWin = pop.e.win;
  await until('pop-out painted', () => js(popWin, PAINTED), 40000);
  const popChrome = await js(popWin, `({ ok: document.documentElement.classList.contains('descall-popout'), path: location.pathname, sidebar: !!document.querySelector('.app-sidebar-shell') && getComputedStyle(document.querySelector('.app-sidebar-shell')).display })`);
  expect(popChrome.ok, `pop-out chrome missing: ${JSON.stringify(popChrome)}`);
  await sleep(800);
  await shot(popWin, 'popout-dm.png');
  log('pop-out ok', JSON.stringify(popChrome));
  const bad = await js(win, `window.descallPremium.invoke('premium:popout:open', 'https://evil.example/x')`);
  expect(bad && bad.error === 'bad-route', `bad route accepted: ${JSON.stringify(bad)}`);

  // 4. Settings > Descall+.
  await js(win, `(() => { history.pushState({}, '', '/settings/premium'); dispatchEvent(new PopStateEvent('popstate')); return true; })()`);
  const tab = await until('settings tab', () => js(win, `(() => {
    const nav = document.querySelector('[data-nav="premium"]');
    if (nav && !document.querySelector('[data-testid="premium-tab"]')) nav.click();
    const tab = document.querySelector('[data-testid="premium-tab"]');
    return tab ? { ok: true, feats: tab.querySelectorAll('[data-feature]').length, ends: (tab.querySelector('[data-testid="premium-ends"]') || {}).textContent || '', status: (tab.querySelector('[data-testid="premium-status"]') || {}).innerText || '' } : { ok: false, nav: !!nav };
  })()`), 15000);
  expect(tab.feats >= 40, `feature list too short: ${tab.feats}`);
  await sleep(600);
  await shot(win, 'settings-premium.png');
  await js(win, `(() => { const el = document.querySelector('[data-testid="premium-compare"]'); if (el) el.scrollIntoView({ block: 'center' }); return true; })()`);
  await sleep(400);
  await shot(win, 'settings-premium-compare.png');
  log('settings ok', JSON.stringify({ feats: tab.feats, ends: tab.ends }));

  // 5. Plan revoked on the server: main's next check closes the windows.
  S.plan = null;
  await premium.gate.verify({ force: true });
  await until('windows closed after revoke', () => premium.windows.list().length === 0 && !premium.gate.has('mini_mode'), 8000);
  log('revoke ok');

  log(`OK ${JSON.stringify({ meCalls: S.meCalls })}`);
  console.log('[e2e-premium] OK');
  setTimeout(() => app.exit(0), 200);
}

require('../main.cjs');
