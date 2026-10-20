'use strict';
/**
 * Electron e2e (2.13.6): the page fills the client after maximize, restore,
 * resize and fullscreen; a 16:9 share stays centered with its aspect ratio
 * and the control bar stays bottom-centered.
 *   xvfb-run -a npx electron electron/e2e/windowResize.e2e.cjs --no-sandbox
 */
const { app, BrowserWindow } = require('electron');
const fs = require('fs'); const path = require('path');
const { attachViewportSync } = require('../viewportSync.cjs');
const SHOTS = process.env.DESCALL_E2E_SHOTS || '';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const fail = (r) => { console.log(`[e2e-resize] FAIL ${r}`); app.exit(1); };
const PAGE = `<!doctype html><style>html,body{margin:0;height:100%;background:#15161d}
.stage{position:fixed;inset:0;display:flex;flex-direction:column}
.title{height:32px;background:#232533}.view{flex:1;min-height:0;display:grid;place-items:center;padding:12px}
.share{max-width:100%;max-height:100%;aspect-ratio:16/9;width:100%;background:#3a4;}
.bar{position:fixed;left:50%;bottom:16px;translate:-50% 0;width:240px;height:48px;border-radius:24px;background:#444}</style>
<div class=stage><div class=title></div><div class=view><div class=share></div></div></div><div class=bar></div>`;
app.whenReady().then(async () => {
  try {
    const win = new BrowserWindow({ width: 745, height: 480, frame: false, show: true });
    attachViewportSync(win);
    await win.loadURL('data:text/html;base64,' + Buffer.from(PAGE).toString('base64'));
    const probe = () => win.webContents.executeJavaScript(`(() => { const r = (s) => document.querySelector(s).getBoundingClientRect();
      const t = r('.title'), sh = r('.share'), b = r('.bar'); return { iw: innerWidth, ih: innerHeight, tw: t.width, ratio: sh.width / sh.height,
      shareCx: sh.left + sh.width / 2, barCx: b.left + b.width / 2, barBottom: innerHeight - b.bottom }; })()`);
    const steps = [['maximize', () => win.maximize()], ['restore', () => win.unmaximize()], ['resize', () => win.setContentSize(1024, 549)], ['fullscreen', () => win.setFullScreen(true)], ['leave-fullscreen', () => win.setFullScreen(false)]];
    for (const [name, act] of steps) {
      act(); await wait(900);
      const c = win.getContentBounds(); const p = await probe();
      if (Math.abs(p.iw - c.width) > 4 || Math.abs(p.ih - c.height) > 4) return fail(`${name}: page ${p.iw}x${p.ih} vs client ${c.width}x${c.height}`);
      if (Math.abs(p.tw - p.iw) > 1) return fail(`${name}: title bar stops early`);
      if (Math.abs(p.ratio - 16 / 9) > 0.02) return fail(`${name}: share aspect ${p.ratio}`);
      if (Math.abs(p.shareCx - p.iw / 2) > 2 || Math.abs(p.barCx - p.iw / 2) > 2) return fail(`${name}: not centered`);
      console.log(`[e2e-resize] ${name}: ${p.iw}x${p.ih} ok`);
      if (SHOTS) fs.writeFileSync(path.join(SHOTS, `after-${name}.png`), (await win.capturePage()).toPNG());
    }
    console.log('[e2e-resize] OK'); app.exit(0);
  } catch (e) { fail(e && e.message); }
});
