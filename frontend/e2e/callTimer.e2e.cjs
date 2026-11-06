'use strict';

/**
 * Call timer e2e: during a call the timer on the call screen counts up once a
 * second, and App itself does not re-render on those ticks (only the small
 * timer components do).
 *
 * Runs the Vite dev server (the dev glass-QA bridge is how a live DM call is
 * put on screen without a second client) against the in-process mock API +
 * Socket.IO from e2e/perf/mockBackend.cjs on 127.0.0.1; every other URL is
 * aborted. App re-renders are counted through a React DevTools global hook
 * installed before the page loads: a commit in which App's hook state object
 * changed is an App render. The old per-hook 1 s counter shows up here as
 * about one App render per second; the shared call clock as none.
 *
 * Run from frontend/:
 *   node e2e/callTimer.e2e.cjs
 * Env: PLAYWRIGHT_CORE=<path to playwright-core or playwright> (else require('playwright-core')),
 *      CHROME_PATH (default /usr/bin/google-chrome), DESCALL_E2E_PORT (mock API, default 5391).
 * Prints "[e2e-call-timer] OK ..." and exits 0, or "[e2e-call-timer] FAIL <reason>" and exits 1.
 */

const os = require('os');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const pw = require(process.env.PLAYWRIGHT_CORE || 'playwright-core');
const mock = require('./perf/mockBackend.cjs');

const ROOT = path.join(__dirname, '..');
const API_PORT = Number(process.env.DESCALL_E2E_PORT || 5391);
const CHROME = process.env.CHROME_PATH || '/usr/bin/google-chrome';
const log = (...a) => console.log('[e2e-call-timer]', ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Installed before React loads. React (and react-refresh, which wraps it)
// report every commit here.
function installCommitProbe() {
  const probe = { commits: 0, appRenders: 0, lastAppState: undefined };
  window.__callTimerProbe = probe;
  const findApp = (fiber) => {
    const stack = [fiber];
    while (stack.length) {
      const f = stack.pop();
      if (!f) continue;
      if (typeof f.type === 'function' && f.type.name === 'App') return f;
      if (f.sibling) stack.push(f.sibling);
      if (f.child) stack.push(f.child);
    }
    return null;
  };
  const renderers = new Map();
  let nextId = 1;
  window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
    renderers,
    supportsFiber: true,
    isDisabled: false,
    inject(renderer) { const id = nextId++; renderers.set(id, renderer); return id; },
    checkDCE() {},
    onScheduleFiberRoot() {},
    onCommitFiberUnmount() {},
    onPostCommitFiberRoot() {},
    onCommitFiberRoot(_id, root) {
      probe.commits += 1;
      const app = findApp(root && root.current);
      if (!app) return;
      if (app.memoizedState !== probe.lastAppState) {
        probe.lastAppState = app.memoizedState;
        probe.appRenders += 1;
        // Which App hook slots changed (debug output names them by index and value).
        const values = [];
        for (let h = app.memoizedState; h; h = h.next) values.push(h.memoizedState);
        const prev = probe.lastValues || [];
        const changed = [];
        values.forEach((v, i) => {
          if (i < prev.length && !Object.is(v, prev[i]) && !(v && typeof v === 'object' && ('deps' in v || 'current' in v))) {
            let s;
            try { s = typeof v === 'object' ? JSON.stringify(v).slice(0, 80) : String(v).slice(0, 80); } catch { s = typeof v; }
            changed.push(`${i}=${s}`);
          }
        });
        probe.lastValues = values;
        probe.changes = (probe.changes || []).concat([changed.slice(0, 6).join(' ')]).slice(-12);
      }
    },
  };
}

function readTimer() {
  const sels = ['.g-call-sub', '.call-top-bar', '.mcc-sub-text', '.call-return-time'];
  for (const sel of sels) {
    for (const el of document.querySelectorAll(sel)) {
      const m = /(\d+):(\d\d)/.exec(el.textContent || '');
      if (m && el.getBoundingClientRect().width > 0) return { ok: true, sel, text: m[0], secs: Number(m[1]) * 60 + Number(m[2]) };
    }
  }
  return { ok: false };
}

async function waitFor(page, label, fn, arg, timeoutMs = 60000) {
  const t0 = Date.now();
  let last;
  while (Date.now() - t0 < timeoutMs) {
    try { last = await page.evaluate(fn, arg); } catch (err) { last = `ERR ${err.message}`; }
    if (last && last.ok) return last;
    await sleep(150);
  }
  throw new Error(`${label}: not reached (last ${JSON.stringify(last)})`);
}

async function main() {
  const api = await mock.start({ dist: path.join(ROOT, 'public'), port: API_PORT });
  const apiBase = `http://127.0.0.1:${api.port}`;
  // On 127.0.0.1 the app ignores window.__DESCALL_API_URL__ and reads these.
  process.env.VITE_API_BASE_URL = apiBase;
  process.env.VITE_SOCKET_URL = apiBase;
  const { createServer } = await import(pathToFileURL(require.resolve('vite', { paths: [ROOT] })).href);
  const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'descall-vite-'));
  const vite = await createServer({
    root: ROOT,
    configFile: path.join(ROOT, 'vite.config.js'),
    cacheDir,
    logLevel: 'error',
    server: { host: '127.0.0.1', port: Number(process.env.DESCALL_E2E_VITE_PORT || 5392), strictPort: false, hmr: false, fs: { strict: false } },
  });
  await vite.listen();
  const base = `http://127.0.0.1:${vite.httpServer.address().port}`;
  const browser = await pw.chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--lang=en-US', '--autoplay-policy=no-user-gesture-required'] });
  const problems = [];
  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'en-US', timezoneId: 'Europe/Istanbul', colorScheme: 'dark', reducedMotion: 'reduce' });
    await ctx.route('**/*', (r) => {
      const url = r.request().url();
      return /^(data|blob):/.test(url) || url.startsWith(base) || url.startsWith(apiBase) || url.startsWith(apiBase.replace('http', 'ws')) ? r.continue() : r.abort();
    });
    await ctx.addInitScript(installCommitProbe);
    await ctx.addInitScript(([apiUrl, me]) => {
      window.__DESCALL_API_URL__ = apiUrl; window.__DESCALL_SOCKET_URL__ = apiUrl;
      localStorage.setItem('descall_language', 'en'); // tr sends '/' to the /tr marketing page
      localStorage.setItem('descall:ios-pwa-install-dismissed', '1');
      localStorage.setItem('descall:cookie_consent_v1', JSON.stringify({ choice: 'rejected', at: new Date().toISOString() }));
      localStorage.setItem('descall_token', 'e2e.fake.token');
      localStorage.setItem('descall_user', JSON.stringify(me));
    }, [apiBase, mock.ME]);
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e).slice(0, 300)));
    await page.goto(base + '/', { waitUntil: 'domcontentloaded', timeout: 120000 });
    await waitFor(page, 'app shell', () => ({ ok: !!window.__callTimerProbe && window.__callTimerProbe.appRenders > 0 && document.querySelectorAll('button').length > 5 }), null, 120000);
    await sleep(1500);

    // A live 1:1 voice call that has run 5 s, through the dev glass-QA bridge.
    await page.evaluate((peer) => {
      window.dispatchEvent(new CustomEvent('descall:glass-qa', { detail: { scene: 'dm-call', peer, callType: 'voice', durationSeconds: 5, cameraOn: false, remoteCameraOn: false } }));
    }, { id: mock.PEER.id, username: mock.PEER.username, displayName: mock.PEER.displayName });
    const first = await waitFor(page, 'call timer on screen', readTimer, null, 30000);
    // Let the call screen and the DM it opened settle: wait for 1.5 s without an App render.
    for (let i = 0, last = -1, quietSince = Date.now(); i < 200; i++) {
      const n = await page.evaluate(() => window.__callTimerProbe.appRenders);
      if (n !== last) { last = n; quietSince = Date.now(); }
      if (Date.now() - quietSince >= 1500) break;
      await sleep(100);
    }

    const t0 = await page.evaluate(readTimer);
    const before = await page.evaluate(() => ({ ...window.__callTimerProbe, lastAppState: undefined, lastValues: undefined }));
    await sleep(3200);
    const t1 = await page.evaluate(readTimer);
    const after = await page.evaluate(() => ({ ...window.__callTimerProbe, lastAppState: undefined, lastValues: undefined }));
    const appRenders = after.appRenders - before.appRenders;
    const commits = after.commits - before.commits;
    if (process.env.DESCALL_E2E_DEBUG) log('App state changes:', JSON.stringify(after.changes));
    log(`timer ${first.text} (${first.sel}) -> ${t0.text} -> ${t1.text} over 3.2 s; App renders ${appRenders}, React commits ${commits}`);

    if (!t0.ok || !t1.ok) problems.push('timer not readable');
    else {
      const gained = t1.secs - t0.secs;
      if (gained < 3 || gained > 4) problems.push(`timer gained ${gained} s in 3.2 s (expected 3-4)`);
      if (t0.secs < 5) problems.push(`timer started below the scene's 5 s (${t0.text})`);
    }
    if (appRenders > 0) problems.push(`App re-rendered ${appRenders}x while only the call timer ticked`);
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
