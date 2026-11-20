'use strict';
/**
 * Electron e2e for the tray panel (draft B): the real window from trayMenuWindow.cjs, its
 * sandboxed preload and the page from public/tray-menu, driven with real input events.
 *   xvfb-run -a npx electron electron/e2e/trayMenuPanel.e2e.cjs --no-sandbox
 * Checks: the window shows only after the page acknowledged its state; keyboard opens the
 * status flyout and picks a status (forwarded as an app action, panel closes); a toggle
 * keeps the panel open and flips at once; a live state push updates an open panel; Esc
 * closes; a refused action never reaches main; a page that cannot load pops the native
 * menu (onFail) and right click stays native.
 * Env: DESCALL_E2E_SHOTS=<dir> saves 06-electron-live.png. Prints "[e2e-tray] OK" or FAIL.
 */
const { app } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');

const SHOTS = process.env.DESCALL_E2E_SHOTS || '';
const fail = (r) => { console.log(`[e2e-tray] FAIL ${r}`); app.exit(1); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 6000, step = 50) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await fn()) return true;
    await wait(step);
  }
  return false;
}

const strings = {
  ...JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'i18n', 'en.json'), 'utf8')).tray,
  ...JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'i18n', 'tr.json'), 'utf8')).tray,
};

app.whenReady().then(async () => {
  try {
    const { createTrayPanel } = require('../trayMenuWindow.cjs');
    const { normalizeAppState } = require('../trayMenuModel.cjs');
    const pageUrl = pathToFileURL(path.join(__dirname, '..', '..', 'public', 'tray-menu', 'tray-menu.html')).href;
    const actions = [];
    let failed = 0;
    let premiumClicked = 0;
    let appState = normalizeAppState({ signedIn: true, name: 'Demir', status: 'online', unreadMessages: 3, friendRequests: 1, hints: { mute: 'Ctrl+Shift+M' } });
    let autostart = false;
    const quiet = { info() {}, warn() {}, error() {} };
    const panel = createTrayPanel({
      url: pageUrl,
      isDev: false,
      log: quiet,
      shellState: () => ({ lang: 'tr', strings, app: appState, shell: { version: '4.0.1', updateVersion: '', autostart, autostartKey: 'startWithWindows', snoozeUntil: 0 } }),
      premiumTemplate: () => [{ label: 'Odak modu', submenu: [{ label: '30 dakika', click: () => { premiumClicked += 1; } }] }],
      onAction: (v) => {
        actions.push(v);
        if (v.action === 'autostart') { autostart = !autostart; panel.refresh(); }
      },
      onFail: () => { failed += 1; },
    });
    const tray = { x: 1200, y: 1000, width: 24, height: 24 };
    const { BrowserWindow } = require('electron');
    const panelWin = () => BrowserWindow.getAllWindows().find((w) => /tray-menu\.html$/.test(w.webContents.getURL()));

    // 1. Open: shown only after the page answered.
    if (!panel.open(tray)) return fail('open refused');
    if (!(await until(() => panel.isVisible()))) return fail('panel never became visible (no ack?)');
    const win = panelWin();
    if (!win) return fail('no panel window');
    const wc = win.webContents;
    const js = (code) => wc.executeJavaScript(code);
    if (!(await until(async () => (await js("document.querySelectorAll('.row').length")) > 6))) return fail('rows not rendered');
    const head = await js("document.querySelector('.head .name').textContent");
    if (head !== 'Demir') return fail(`header name ${head}`);
    const badge = await js("document.querySelector('[data-id=\"messages\"] .badge').textContent");
    if (badge !== '3') return fail(`messages badge ${badge}`);
    const hasPremium = await js("Boolean(document.querySelector('.group'))");
    if (!hasPremium) return fail('Descall+ group missing');

    const key = async (keyCode) => {
      wc.sendInputEvent({ type: 'keyDown', keyCode });
      if (keyCode.length === 1) wc.sendInputEvent({ type: 'char', keyCode });
      wc.sendInputEvent({ type: 'keyUp', keyCode });
      await wait(60);
    };
    // 2. Keyboard: Down to "Durum", Right opens the flyout on the current status.
    await key('Down');
    await key('Down');
    const focused = await js("document.activeElement && document.activeElement.dataset.id");
    if (focused !== 'status') return fail(`focus on ${focused}, expected status`);
    await key('Right');
    const flyOpen = await js("!document.getElementById('flyout').hidden && document.activeElement.dataset.id");
    if (flyOpen !== 'status:online') return fail(`flyout focus ${flyOpen}`);
    const expanded = await js("document.querySelector('[data-id=\"status\"]').getAttribute('aria-expanded')");
    if (expanded !== 'true') return fail('aria-expanded not set');
    if (SHOTS) {
      // Best effort: some headless GPU setups cannot capture a transparent window.
      try {
        fs.mkdirSync(SHOTS, { recursive: true });
        const img = await win.webContents.capturePage();
        fs.writeFileSync(path.join(SHOTS, '06-electron-live.png'), img.toPNG());
      } catch (err) {
        console.log(`[e2e-tray] screenshot skipped: ${err?.message || err}`);
      }
    }
    await key('Down');
    await key('Down'); // dnd
    await key('Return');
    if (!(await until(() => actions.some((a) => a.action === 'status')))) return fail('status not forwarded');
    const st = actions.find((a) => a.action === 'status');
    if (st.arg !== 'dnd' || st.kind !== 'app') return fail(`status action ${JSON.stringify(st)}`);
    if (!(await until(() => !panel.isVisible()))) return fail('panel did not close after picking a status');

    // 3. Reopen: a toggle keeps it open and flips at once; a live push updates it.
    await wait(400); // past the reopen guard
    if (!panel.open(tray) || !(await until(() => panel.isVisible()))) return fail('reopen failed');
    await js("document.querySelector('[data-id=\"autostart\"]').click()");
    if (!(await until(async () => (await js("document.querySelector('[data-id=\"autostart\"]').getAttribute('aria-checked')")) === 'true'))) return fail('switch did not flip');
    if (!panel.isVisible()) return fail('toggle closed the panel');
    appState = normalizeAppState({ ...appState, unreadMessages: 12, inCall: true, micMuted: true });
    panel.refresh();
    if (!(await until(async () => (await js("document.querySelector('[data-id=\"messages\"] .badge').textContent")) === '12'))) return fail('live update not shown');
    const micLabel = await js("document.querySelector('[data-id=\"mute\"] .label').textContent");
    if (micLabel !== strings.micOn) return fail(`mic label ${micLabel}`);

    // 4. A forged action is refused in main.
    const before = actions.length;
    await js("window.trayMenuAPI.act('eval', 'x'); window.trayMenuAPI.act('status', 'busy'); window.trayMenuAPI.act('premium', 'p.99')");
    await wait(200);
    if (actions.length !== before) return fail('forged action reached main');

    // 5. Descall+ entry runs its own click; Esc closes.
    const pid = await js("(() => { const r = document.querySelector('[data-id^=\"premium:\"]'); return r && r.dataset.id; })()");
    if (!pid) return fail('no Descall+ row');
    await js(`document.querySelector('[data-id="${pid}"]').dispatchEvent(new MouseEvent('pointermove', { bubbles: true }))`);
    if (!(await until(async () => (await js("document.querySelectorAll('#flyout .row').length")) === 1, 2000))) return fail('Descall+ flyout did not open on hover');
    await js("document.querySelector('#flyout .row').click()");
    if (!(await until(() => premiumClicked === 1))) return fail('Descall+ click not run');
    await wait(400);
    panel.open(tray);
    if (!(await until(() => panel.isVisible()))) return fail('third open failed');
    await key('Escape');
    if (!(await until(() => !panel.isVisible()))) return fail('Esc did not close');

    // 6. A page that cannot load: native menu now, and right click stays native.
    const broken = createTrayPanel({
      url: pathToFileURL(path.join(__dirname, 'does-not-exist', 'tray-menu.html')).href,
      log: quiet,
      shellState: () => ({ lang: 'en', strings, app: appState, shell: {} }),
      premiumTemplate: () => [],
      onAction: () => {},
      onFail: () => { failed += 1; },
    });
    if (!broken.open(tray)) return fail('broken panel refused the first open');
    if (!(await until(() => failed === 1, 8000))) return fail('native fallback not called');
    if (broken.open(tray) !== false) return fail('broken panel did not stay native');

    panel.destroy();
    console.log('[e2e-tray] OK');
    app.exit(0);
  } catch (err) {
    fail(err && err.stack ? err.stack : String(err));
  }
});
