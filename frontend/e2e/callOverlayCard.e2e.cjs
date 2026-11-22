'use strict';

/**
 * Desktop call card e2e (feedback 2026-11-22, DemirBey, Windows 4.1.0: "neden ekranımda
 * kocaman arama işareti çıkıyor?", every DM call).
 *
 * The always-on-top call card (electron/overlayWindow.cjs, card from overlayHtml.cjs) was
 * shown for every call even while Descall was in front. It sits in the top-right corner of
 * the screen, so over a maximized Descall window it covered the app's own window buttons
 * and the call screen's top-right controls.
 *
 * Runs the Vite dev server against the in-process mock API (e2e/perf/mockBackend.cjs) with a
 * desktop bridge stub (window.electronAPI, Windows) that records overlayShow / overlayHide.
 * A live 1:1 voice call is put on screen through the dev glass-QA bridge. Checks:
 *   1. Descall in front (focused, visible): the card is not shown.
 *   2. Descall in the background (blur): the card is shown.
 *   3. Back in front (focus): the card is hidden again.
 * With DESCALL_E2E_SHOTS=<dir> it saves the "screen" (the window at 1366x728, a maximized
 * window on a 1366x768 laptop) with the card composited where Electron puts it.
 *
 * Run from frontend/:
 *   node e2e/callOverlayCard.e2e.cjs
 * Env: PLAYWRIGHT_CORE (else require('playwright-core') / 'playwright'), CHROME_PATH,
 *      DESCALL_E2E_PORT (mock API, default 5393), DESCALL_E2E_SHOTS=<dir>, DESCALL_E2E_TAG.
 * Prints "[e2e-call-card] OK" and exits 0, or "[e2e-call-card] FAIL <reason>" and exits 1.
 */

const os = require('os');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

function loadPlaywright() {
  for (const name of [process.env.PLAYWRIGHT_CORE, 'playwright-core', 'playwright'].filter(Boolean)) {
    try { return require(name); } catch { /* next */ }
  }
  throw new Error('playwright not found (set PLAYWRIGHT_CORE)');
}
const pw = loadPlaywright();
const mock = require('./perf/mockBackend.cjs');
const { buildOverlayHtml, OVERLAY_WIDTH, OVERLAY_HEIGHT } = require('../electron/overlayHtml.cjs');

const ROOT = path.join(__dirname, '..');
const API_PORT = Number(process.env.DESCALL_E2E_PORT || 5393);
const SHOTS = process.env.DESCALL_E2E_SHOTS || '';
const TAG = process.env.DESCALL_E2E_TAG || 'after';
const W = 1366;
const H = 728;
const log = (...a) => console.log('[e2e-call-card]', ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** window.electronAPI stand-in (Windows): every member answers, overlay calls are recorded. */
function installBridge() {
  const calls = [];
  window.__overlayCalls = calls;
  // Focus is driven by the test (document.hasFocus / focus / blur), like a real window.
  let focused = true;
  window.__setAppFocus = (on) => {
    focused = Boolean(on);
    window.dispatchEvent(new Event(focused ? 'focus' : 'blur'));
  };
  Document.prototype.hasFocus = function hasFocus() { return focused; };
  const base = {
    isElectron: true,
    platform: 'win32',
    zoom: { get: () => 1, set() {} },
    overlayShow: (p) => calls.push({ op: 'show', at: Date.now(), p }),
    overlayHide: () => calls.push({ op: 'hide', at: Date.now() }),
    overlayUpdate: (p) => calls.push({ op: 'update', at: Date.now(), p }),
    getPrefersReducedTransparency: () => false,
    scanProcesses: () => Promise.resolve([]),
  };
  window.electronAPI = new Proxy(base, {
    get(t, k) {
      if (k in t) return t[k];
      if (typeof k !== 'string') return undefined;
      if (/^on[A-Z]/.test(k)) return () => () => {};
      return () => Promise.resolve(null);
    },
  });
}

async function cardShown(page) {
  return page.evaluate(() => {
    const last = [...(window.__overlayCalls || [])].reverse().find((c) => c.op === 'show' || c.op === 'hide');
    return Boolean(last && last.op === 'show');
  });
}

async function screen(page, name) {
  if (!SHOTS) return;
  fs.mkdirSync(SHOTS, { recursive: true });
  const shown = await cardShown(page);
  // Composite the card where Electron puts it (overlayWindow.cjs getDefaultPosition).
  await page.evaluate(([html, show, x, w, h]) => {
    let f = document.getElementById('__e2e_card');
    if (!show) { if (f) f.remove(); return; }
    if (!f) {
      f = document.createElement('iframe');
      f.id = '__e2e_card';
      f.style.cssText = `position:fixed;z-index:2147483647;top:2px;left:${x}px;width:${w}px;height:${h}px;border:0;background:transparent;color-scheme:light`;
      f.setAttribute('allowtransparency', 'true');
      document.body.appendChild(f);
    }
    f.srcdoc = html;
  }, [buildOverlayHtml({ lang: 'tr' }), shown, W - OVERLAY_WIDTH - 16 + 14, OVERLAY_WIDTH, OVERLAY_HEIGHT]);
  if (shown) {
    await sleep(400);
    await page.evaluate(() => {
      const f = document.getElementById('__e2e_card');
      const last = [...(window.__overlayCalls || [])].reverse().find((c) => c.op === 'show');
      f?.contentWindow?.__overlayUpdate?.({ ...(last?.p || {}), connected: true, lang: 'tr' });
    });
    await sleep(300);
  }
  await page.screenshot({ path: path.join(SHOTS, `${TAG}-${name}.png`) });
  await page.evaluate(() => document.getElementById('__e2e_card')?.remove());
}

async function waitFor(page, label, fn, timeoutMs = 60000) {
  const t0 = Date.now();
  let last;
  while (Date.now() - t0 < timeoutMs) {
    try { last = await page.evaluate(fn); } catch (err) { last = `ERR ${err.message}`; }
    if (last && last.ok) return last;
    await sleep(150);
  }
  throw new Error(`${label}: not reached (last ${JSON.stringify(last)})`);
}

async function main() {
  const api = await mock.start({ dist: path.join(ROOT, 'public'), port: API_PORT });
  const apiBase = `http://127.0.0.1:${api.port}`;
  process.env.VITE_API_BASE_URL = apiBase;
  process.env.VITE_SOCKET_URL = apiBase;
  const { createServer } = await import(pathToFileURL(require.resolve('vite', { paths: [ROOT] })).href);
  const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'descall-vite-'));
  const vite = await createServer({
    root: ROOT,
    configFile: path.join(ROOT, 'vite.config.js'),
    cacheDir,
    logLevel: 'error',
    server: { host: '127.0.0.1', port: Number(process.env.DESCALL_E2E_VITE_PORT || 5394), strictPort: false, hmr: false, fs: { strict: false } },
  });
  await vite.listen();
  const base = `http://127.0.0.1:${vite.httpServer.address().port}`;
  const launch = { headless: true, args: ['--no-sandbox', '--lang=en-US', '--autoplay-policy=no-user-gesture-required'] };
  if (process.env.CHROME_PATH) launch.executablePath = process.env.CHROME_PATH;
  const browser = await pw.chromium.launch(launch);
  const problems = [];
  try {
    const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, locale: 'en-US', timezoneId: 'Europe/Istanbul', colorScheme: 'dark', reducedMotion: 'reduce' });
    // The desktop app talks to the production API (src/config/api.js): answer it from the mock.
    const PROD = /^https:\/\/(des-call\.onrender\.com|api\.descall\.com|descall\.com)(\/.*)?$/;
    await ctx.route('**/*', async (r) => {
      const url = r.request().url();
      const prod = PROD.exec(url);
      if (prod) {
        try {
          const res = await r.fetch({ url: apiBase + (prod[2] || '/') });
          return r.fulfill({ response: res, headers: { ...res.headers(), 'access-control-allow-origin': base, 'access-control-allow-credentials': 'true' } });
        } catch {
          return r.abort();
        }
      }
      return /^(data|blob|about):/.test(url) || url.startsWith(base) || url.startsWith(apiBase) || url.startsWith(apiBase.replace('http', 'ws')) ? r.continue() : r.abort();
    });
    await ctx.addInitScript(installBridge);
    await ctx.addInitScript(([apiUrl, me]) => {
      window.__DESCALL_API_URL__ = apiUrl; window.__DESCALL_SOCKET_URL__ = apiUrl;
      localStorage.setItem('descall_language', 'en');
      localStorage.setItem('descall:ios-pwa-install-dismissed', '1');
      localStorage.setItem('descall:cookie_consent_v1', JSON.stringify({ choice: 'rejected', at: new Date().toISOString() }));
      localStorage.setItem('descall_token', 'e2e.fake.token');
      localStorage.setItem('descall_user', JSON.stringify(me));
    }, [apiBase, mock.ME]);
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e).slice(0, 300)));
    await page.goto(base + '/', { waitUntil: 'domcontentloaded', timeout: 120000 });
    await waitFor(page, 'app shell', () => ({ ok: document.querySelectorAll('button').length > 5 }), 120000);
    await sleep(2500);

    await page.evaluate((peer) => {
      window.dispatchEvent(new CustomEvent('descall:glass-qa', { detail: { scene: 'dm-call', peer, callType: 'voice', durationSeconds: 65, cameraOn: false, remoteCameraOn: false } }));
    }, { id: mock.PEER.id, username: mock.PEER.username, displayName: mock.PEER.displayName });
    await waitFor(page, 'call on screen', () => ({ ok: document.querySelectorAll('.call-overlay-root').length > 0 && (window.__overlayCalls || []).length > 0, roots: document.querySelectorAll('.call-overlay-root').length, calls: (window.__overlayCalls || []).length, path: location.pathname, text: document.body.innerText.slice(0, 160) }), 30000);
    await sleep(1200);

    // 1. Descall in front.
    const front = await cardShown(page);
    log('Descall in front: card', front ? 'SHOWN' : 'hidden');
    if (front) problems.push('the call card is on screen while Descall is in front');
    await screen(page, '1-descall-in-front');

    // 2. Another app in front.
    await page.evaluate(() => window.__setAppFocus(false));
    await sleep(900);
    const back = await cardShown(page);
    log('Descall in the background: card', back ? 'shown' : 'HIDDEN');
    if (!back) problems.push('the call card is not shown while Descall is in the background');
    await screen(page, '2-descall-in-background');

    // 3. Back to Descall.
    await page.evaluate(() => window.__setAppFocus(true));
    await sleep(300);
    const again = await cardShown(page);
    log('Descall in front again: card', again ? 'SHOWN' : 'hidden');
    if (again) problems.push('the call card stays on screen after Descall came back to the front');

    const payload = await page.evaluate(() => (window.__overlayCalls || []).filter((c) => c.op === 'show').map((c) => c.p).pop() || null);
    if (payload && (payload.kind !== 'dm' || !payload.title)) problems.push(`card payload ${JSON.stringify(payload)}`);
    if (errors.length) problems.push(`page errors: ${errors.slice(0, 3).join(' | ')}`);
    await ctx.close();
  } finally {
    await browser.close().catch(() => {});
    await vite.close().catch(() => {});
    api.close();
    fs.rmSync(cacheDir, { recursive: true, force: true });
  }
  if (problems.length) {
    for (const p of problems) log('FAIL', p);
    process.exit(1);
  }
  log('OK');
  process.exit(0);
}

main().catch((err) => { log('FAIL', err && err.stack ? err.stack : err); process.exit(1); });
