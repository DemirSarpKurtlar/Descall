'use strict';
/**
 * Electron e2e for the mini call card (2.13.6): real overlay window from
 * overlayWindow.cjs, real input events (sendInputEvent) on mute / deafen /
 * hang-up, actions must reach the main window over IPC and the buttons must
 * flip state instantly.
 *   xvfb-run -a npx electron electron/e2e/overlayButtons.e2e.cjs --no-sandbox
 * Env: DESCALL_E2E_SHOTS=<dir>. Prints "[e2e-overlay] OK" or "... FAIL <reason>".
 */
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const SHOTS = process.env.DESCALL_E2E_SHOTS || '';
const fail = (r) => { console.log(`[e2e-overlay] FAIL ${r}`); app.exit(1); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

app.whenReady().then(async () => {
  try {
    const ov = require('../overlayWindow.cjs');
    const mainPre = path.join(os.tmpdir(), `ov-e2e-pre-${Date.now()}.cjs`);
    fs.writeFileSync(mainPre, "const { ipcRenderer } = require('electron'); ipcRenderer.on('descall:overlay:action', (_e, a) => ipcRenderer.send('e2e:got', a));");
    const main = new BrowserWindow({ show: false, webPreferences: { preload: mainPre, sandbox: false, contextIsolation: true } });
    await main.loadURL('data:text/html,<p>main</p>');
    const got = [];
    ipcMain.on('e2e:got', (_e, a) => got.push(a));
    ov.registerOverlayIPC(() => main);
    ov.showOverlayWindow({ title: 'kettle01', kind: 'dm', since: Date.now() - 50_000, lang: 'tr' });
    await wait(1500);
    const win = BrowserWindow.getAllWindows().find((w) => w !== main);
    if (!win) return fail('no overlay window');
    const wc = win.webContents;
    const rect = (id) => wc.executeJavaScript(`(() => { const r = document.getElementById('${id}').getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()`);
    const click = async (id) => {
      const { x, y } = await rect(id);
      wc.sendInputEvent({ type: 'mouseMove', x, y });
      wc.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount: 1 });
      await wait(60);
      const pressed = await wc.executeJavaScript(`document.getElementById('${id}').classList.contains('is-pressed')`);
      wc.sendInputEvent({ type: 'mouseUp', x, y, button: 'left', clickCount: 1 });
      await wait(150);
      return pressed;
    };
    const drag = await wc.executeJavaScript(`[...document.querySelectorAll('.btn')].map((b) => { for (let e = b; e; e = e.parentElement) { if (getComputedStyle(e).webkitAppRegion === 'drag' || getComputedStyle(e).getPropertyValue('-webkit-app-region') === 'drag') return true; } return false; })`);
    if (drag.some(Boolean)) return fail('a button sits inside a drag region');
    if (!(await click('muteBtn'))) return fail('no press feedback on mute');
    if ((await wc.executeJavaScript(`document.getElementById('muteBtn').getAttribute('aria-pressed')`)) !== 'true') return fail('mute state not shown');
    if (SHOTS) fs.writeFileSync(path.join(SHOTS, 'overlay-after-muted.png'), (await win.capturePage()).toPNG());
    await click('deafenBtn');
    if ((await wc.executeJavaScript(`document.getElementById('deafenBtn').getAttribute('aria-pressed')`)) !== 'true') return fail('deafen state not shown');
    await click('leaveBtn');
    await wait(200);
    if (got.join(',') !== 'mute,deafen,leave') return fail(`main got ${JSON.stringify(got)}`);
    console.log('[e2e-overlay] OK');
    app.exit(0);
  } catch (e) { fail(e && e.message); }
});
