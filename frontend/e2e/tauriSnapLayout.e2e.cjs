'use strict';

/**
 * Tauri (WebView2) emulation e2e for Windows 11 Snap layouts (src-tauri/src/snap.rs): the
 * Electron/Tauri build served at https://tauri.localhost with the shell's shims after fake
 * Tauri globals that record every invoke. Every other host is aborted (signed out, no API).
 *
 * Checks:
 *   - the title bar's maximize button carries data-snap-layout and the shim reports its
 *     rectangle (CSS px + devicePixelRatio) to window_snap_button, so the shell can lay its
 *     native input sink over exactly that button;
 *   - a window resize reports the moved button again;
 *   - the sink's hover / press (window:snap-state) light the page's button like :hover, and
 *     "none" clears it.
 *
 * Run from frontend/:
 *   ELECTRON_BUILD=1 npx vite build --outDir dist-tauri-e2e
 *   node e2e/tauriSnapLayout.e2e.cjs
 * Env: DESCALL_E2E_DIST (dist-tauri-e2e), CHROME_PATH (bundled Chromium when unset).
 * Prints "[e2e-tauri-snap] OK" and exits 0, or "[e2e-tauri-snap] FAIL <reasons>" and exits 1.
 */

const fs = require('fs');
const path = require('path');

const FE = path.join(__dirname, '..');
const DESKTOP = path.join(FE, '..', 'desktop');
const DIST = path.resolve(process.env.DESCALL_E2E_DIST || path.join(FE, 'dist-tauri-e2e'));
const CHROME = process.env.CHROME_PATH || '';
const ORIGIN = 'https://tauri.localhost';
const log = (...a) => console.log('[e2e-tauri-snap]', ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ico': 'image/x-icon' };

function fakeTauri() {
  window.__tauriCalls = [];
  window.__DESCALL_BOOT__ = Object.freeze({ version: '4.1.0', platform: 'win32', mode: 'main', token: null, reducedTransparency: false });
  const listeners = new Map();
  let cbId = 1;
  const answers = { app_version: '4.1.0', updates_status: { status: 'idle' }, window_content_box: { top: 0, right: 0, bottom: 0, left: 0 }, window_is_focused: true };
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
  const pw = require(process.env.PLAYWRIGHT_CORE || 'playwright');
  const browser = await pw.chromium.launch({ ...(CHROME && fs.existsSync(CHROME) ? { executablePath: CHROME } : {}), headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const problems = [];
  const check = (cond, msg) => { if (!cond) problems.push(msg); else log(`ok - ${msg}`); };
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, colorScheme: 'dark' });
  const exists = (k) => { const f = path.join(DIST, k); return f.startsWith(DIST) && fs.existsSync(f) && fs.statSync(f).isFile(); };
  await ctx.route('**/*', async (rt) => {
    const url = rt.request().url();
    if (/^(data|blob):/.test(url)) return rt.continue();
    const u = new URL(url);
    if (u.origin !== ORIGIN) return rt.abort();
    let key = decodeURIComponent(u.pathname).replace(/^\/+/, '');
    if (!exists(key)) {
      const segs = key.split('/').filter(Boolean);
      let found = null;
      for (let i = 1; i < segs.length && !found; i++) if (exists(segs.slice(i).join('/'))) found = segs.slice(i).join('/');
      key = found || 'index.html';
    }
    const file = path.join(DIST, key);
    return rt.fulfill({ status: 200, headers: { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' }, body: fs.readFileSync(file) });
  });
  await ctx.routeWebSocket(/^wss?:\/\//, (ws) => ws.close());
  await ctx.addInitScript(fakeTauri);
  for (const s of ['premium-shim.js', 'electron-api-shim.js']) {
    await ctx.addInitScript({ content: fs.readFileSync(path.join(DESKTOP, 'app/shim', s), 'utf8') });
  }
  const page = await ctx.newPage();
  try {
    await page.goto(`${ORIGIN}/`, { waitUntil: 'domcontentloaded' });
    const btn = page.locator('.titlebar .win-btn.maximize');
    await btn.waitFor({ state: 'visible', timeout: 30000 });
    check(await btn.getAttribute('data-snap-layout') !== null, 'maximize button is marked for the snap sink');
    const reported = async () => page.evaluate(() => window.__tauriCalls.filter(([c]) => c === 'window_snap_button').map(([, a]) => a.rect));
    const near = (a, b) => a && b && Math.abs(a.x - b.x) <= 1 && Math.abs(a.y - b.y) <= 1 && Math.abs(a.width - b.width) <= 1 && Math.abs(a.height - b.height) <= 1;
    let box = null;
    for (let i = 0; i < 30; i++) {
      box = await btn.boundingBox();
      const r = (await reported()).at(-1);
      if (near(r, box)) break;
      await sleep(200);
    }
    const last = (await reported()).at(-1);
    check(near(last, box) && last.dpr === 1, `the button's rectangle reaches the shell (${JSON.stringify(last)} vs ${JSON.stringify(box)})`);

    await page.setViewportSize({ width: 1500, height: 820 });
    let moved = null;
    for (let i = 0; i < 30; i++) {
      await sleep(150);
      const b2 = await btn.boundingBox();
      const r = (await reported()).at(-1);
      if (near(r, b2) && Math.abs(b2.x - box.x) > 100) { moved = r; break; }
    }
    check(Boolean(moved), 'a resize reports the moved button');

    const bg = () => btn.evaluate((el) => getComputedStyle(el).backgroundColor);
    const idle = await bg();
    await page.evaluate(() => window.__TAURI__.event.emit('window:snap-state', 'hover'));
    await sleep(250);
    const hover = await bg();
    check((await btn.getAttribute('data-snap-state')) === 'hover' && hover !== idle, `sink hover lights the button (${idle} -> ${hover})`);
    await page.evaluate(() => window.__TAURI__.event.emit('window:snap-state', 'press'));
    await sleep(250);
    check((await bg()) !== hover, 'sink press looks pressed');
    await page.evaluate(() => window.__TAURI__.event.emit('window:snap-state', 'none'));
    await sleep(250);
    check((await btn.getAttribute('data-snap-state')) === null, '"none" clears the state');
  } catch (e) {
    problems.push(`error: ${String(e && e.message || e).slice(0, 300)}`);
  }
  await browser.close();
  if (problems.length) {
    log(`FAIL ${problems.join(' | ')}`);
    process.exit(1);
  }
  log('OK');
}

main();
