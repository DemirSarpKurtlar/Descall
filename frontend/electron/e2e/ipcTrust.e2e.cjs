'use strict';

/**
 * Electron end-to-end check of the main-process trust boundary (appTrust.cjs, Nov 2026).
 *
 * Boots the real main process (electron/main.cjs) against the built dist/ with every host
 * failing DNS, then:
 *   1. the main window (descall://app) reads and writes the session token through
 *      electronAPI.secureToken (trusted sender);
 *   2. a stray window that loads preload.cjs on a data: page gets null / false from the
 *      token channels and a rejected getScreenSources (unknown window);
 *   3. the main window cannot navigate to https://evil.example/?localhost or file://
 *      (the old substring guard let the first one through); the https link goes to the
 *      OS (shell.openExternal, stubbed here), the file:// one does not;
 *   4. window.open('/admin/panel') opens the admin window with adminPreload.cjs: token
 *      still readable, screen sources / process list / clipboard answer empty locally;
 *   5. the main window loaded on a foreign page by main itself (data:) gets null from
 *      secureToken.get (frame origin check).
 *
 * Run from frontend/ after an Electron build (ELECTRON_BUILD=1 npm run build):
 *   xvfb-run -a npx electron electron/e2e/ipcTrust.e2e.cjs --no-sandbox
 * Prints "[e2e-ipc-trust] OK" and exits 0, or "[e2e-ipc-trust] FAIL <reason>" and exits 1.
 */

const electron = require('electron');
const { app, BrowserWindow } = electron;
const fs = require('fs');
const os = require('os');
const path = require('path');

const TOTAL_TIMEOUT_MS = 120000;
const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'descall-e2e-ipc-trust-'));
app.setPath('userData', userData);
app.commandLine.appendSwitch('host-resolver-rules', 'MAP * ~NOTFOUND');

const log = (...a) => console.log('[e2e-ipc-trust]', ...a);
let failed = false;
function fail(reason) {
  if (failed) return;
  failed = true;
  console.error(`[e2e-ipc-trust] FAIL ${reason}`);
  setTimeout(() => app.exit(1), 200);
}
setTimeout(() => fail(`timed out after ${TOTAL_TIMEOUT_MS}ms`), TOTAL_TIMEOUT_MS).unref();

// Nothing leaves the test: record what main would hand to the OS.
const opened = [];
electron.shell.openExternal = async (url) => { opened.push(String(url)); };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const js = (win, code) => win.webContents.executeJavaScript(code, true);
async function waitFor(label, fn, timeoutMs = 30000) {
  const started = Date.now();
  let last;
  while (Date.now() - started < timeoutMs) {
    try { last = await fn(); } catch (err) { last = `ERR ${err.message}`; }
    if (last && last.ok) return last;
    await sleep(200);
  }
  throw new Error(`${label}: not reached in ${timeoutMs}ms (last ${JSON.stringify(last)})`);
}
function expect(cond, what, detail) {
  if (!cond) throw new Error(`${what}${detail === undefined ? '' : ` (got ${JSON.stringify(detail)})`}`);
  log('ok', what);
}

let mainWin = null;
app.on('browser-window-created', (_e, win) => {
  win.webContents.once('did-finish-load', () => {
    if (mainWin || !/^descall:\/\/app\//.test(win.webContents.getURL())) return;
    mainWin = win;
    run(win).catch((err) => fail(err && err.stack ? err.stack : String(err)));
  });
});

async function run(win) {
  await waitFor('main window bridge', async () => ({ ok: await js(win, `Boolean(window.electronAPI && window.electronAPI.secureToken)`) }));

  // 1. Trusted: the app page in the main window.
  const set = await js(win, `window.electronAPI.secureToken.set('e2e-probe-token')`);
  const got = await js(win, `window.electronAPI.secureToken.get()`);
  expect(set === true && got === 'e2e-probe-token', 'main window reads and writes the token', { set, got });

  // 2. Untrusted: a window main does not know, even with the full preload.
  const stray = new BrowserWindow({
    show: false,
    webPreferences: { preload: path.join(__dirname, '..', 'preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false },
  });
  await stray.loadURL('data:text/html,<p>stray</p>');
  await waitFor('stray bridge', async () => ({ ok: await js(stray, `Boolean(window.electronAPI)`) }));
  const strayGet = await js(stray, `window.electronAPI.secureToken.get()`);
  const straySet = await js(stray, `window.electronAPI.secureToken.set('evil')`);
  const strayClear = await js(stray, `window.electronAPI.secureToken.clear()`);
  const straySources = await js(stray, `window.electronAPI.getScreenSources().then(() => 'resolved', (e) => 'rejected')`);
  const strayScan = await js(stray, `window.electronAPI.scanProcesses().then(() => 'resolved', (e) => 'rejected')`);
  expect(strayGet === null && straySet === false && strayClear === false, 'unknown window gets no token', { strayGet, straySet, strayClear });
  expect(straySources === 'rejected' && strayScan === 'rejected', 'unknown window cannot list screens or processes', { straySources, strayScan });
  expect((await js(win, `window.electronAPI.secureToken.get()`)) === 'e2e-probe-token', 'token unchanged after the stray attempts');
  stray.destroy();

  // 3. Navigation: exact origins only.
  const before = win.webContents.getURL();
  await js(win, `location.href = 'https://evil.example/?localhost'; true`).catch(() => {});
  await sleep(800);
  expect(/^descall:\/\/app\//.test(win.webContents.getURL()), 'substring "localhost" no longer passes will-navigate', win.webContents.getURL());
  expect(opened.includes('https://evil.example/?localhost'), 'the https link went to the OS browser', opened);
  await js(win, `location.href = 'file:///etc/passwd'; true`).catch(() => {});
  await sleep(800);
  expect(/^descall:\/\/app\//.test(win.webContents.getURL()), 'file:// navigation is cancelled', win.webContents.getURL());
  expect(!opened.some((u) => u.startsWith('file:')), 'file:// is never handed to the OS', opened);
  log('main window stayed on', before);

  // 4. Admin window: reduced preload, still trusted for the token.
  const created = new Promise((resolve) => app.once('browser-window-created', (_e, w) => resolve(w)));
  await js(win, `window.open('/admin/panel', 'descall-admin-panel'); true`);
  const adminWin = await Promise.race([created, sleep(10000).then(() => null)]);
  expect(Boolean(adminWin), 'window.open(/admin/panel) opens the admin window');
  await waitFor('admin bridge', async () => ({ ok: await js(adminWin, `Boolean(window.electronAPI && window.electronAPI.secureToken)`) }), 20000);
  const admin = await js(adminWin, `(async () => {
    const api = window.electronAPI;
    return {
      url: location.href,
      token: api.secureToken.get(),
      sources: JSON.stringify(await api.getScreenSources()),
      procs: JSON.stringify(await api.scanProcesses()),
      clip: await api.readClipboardImage(),
      keys: Object.keys(api).length,
    };
  })()`);
  expect(/^descall:\/\/app\/admin\/panel/.test(admin.url), 'admin window is on /admin/panel', admin.url);
  expect(admin.token === 'e2e-probe-token', 'admin window reads the token', admin.token);
  expect(admin.sources === '[]' && admin.procs === '[]' && admin.clip === null, 'admin window has no screen, process or clipboard access', admin);
  const mainKeys = await js(win, `Object.keys(window.electronAPI).length`);
  expect(admin.keys === mainKeys, 'admin bridge has the same keys as the main bridge', { admin: admin.keys, main: mainKeys });
  adminWin.destroy();

  // 5. Our window on a foreign page (main-initiated load skips will-navigate).
  await win.loadURL('data:text/html,<p>foreign</p>');
  await waitFor('foreign page bridge', async () => ({ ok: await js(win, `Boolean(window.electronAPI)`) }));
  const foreignGet = await js(win, `window.electronAPI.secureToken.get()`);
  expect(foreignGet === null, 'main window on a foreign origin gets no token', foreignGet);

  console.log('[e2e-ipc-trust] OK');
  setTimeout(() => app.exit(0), 200);
}

require('../main.cjs');
