'use strict';

/**
 * Tauri (WebView2) idle probe: what the desktop page keeps doing while nobody uses it, in the
 * window and in the tray. The Electron/Tauri build (ELECTRON_BUILD=1) is served at
 * https://tauri.localhost with the shell's init scripts (desktop/app/shim/*.js) after fake
 * __TAURI_INTERNALS__ / __TAURI__ that record every invoke; the API is a small local mock and
 * every other host is aborted.
 *
 * WebView2 keeps a hidden window "visible" to the page (like Electron with backgroundThrottling
 * off): nothing slows down by itself in the tray, the page relies on the shell's
 * app:visibility { backgrounded } (html.app-backgrounded). Measured per phase (visible idle,
 * backgrounded idle): shell IPC calls by command, requestAnimationFrame callbacks, timers
 * fired by call site, running CSS / Web animations.
 *
 * Checks:
 *   - idle in the window: no shell command is polled (at most a couple of calls in the
 *     window, none faster than every 5 s);
 *   - backgrounded: no requestAnimationFrame loop keeps running (under 2 frames per second),
 *     no CSS / Web animation is running, no shell command is polled;
 *   - the shims themselves start no repeating timer while idle;
 *   - start-up: the shim reports the boot splash (app_boot_state "splash") once, before
 *     app-mounted, so the shell can show the window before the main bundle ran.
 *
 * Run from frontend/:
 *   ELECTRON_BUILD=1 npx vite build --outDir dist-tauri-e2e
 *   node e2e/tauriIdle.e2e.cjs
 * Env: DESCALL_E2E_DIST (dist-tauri-e2e), DESCALL_E2E_PORT (free port), IDLE_MS (10000),
 *      PERF_JSON=<file> writes the measurements, CHROME_PATH.
 * Prints "[e2e-tauri-idle] OK" and exits 0, or "[e2e-tauri-idle] FAIL <reasons>" and exits 1.
 */

const fs = require('fs');
const path = require('path');
const http = require('http');

const FE = path.join(__dirname, '..');
const BK = path.join(FE, 'backend');
const DESKTOP = path.join(FE, '..', 'desktop');
const DIST = path.resolve(process.env.DESCALL_E2E_DIST || path.join(FE, 'dist-tauri-e2e'));
// Port 0: a free port (several harnesses run on the same machine).
let PORT = Number(process.env.DESCALL_E2E_PORT || 0);
const IDLE_MS = Number(process.env.IDLE_MS || 10000);
const CHROME = process.env.CHROME_PATH || '';
const ORIGIN = 'https://tauri.localhost';
const API = 'https://des-call.onrender.com';
const log = (...a) => console.log('[e2e-tauri-idle]', ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-do-not-use-in-prod';
process.env.NODE_ENV = 'test';

const U = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

function boot() {
  const express = require(require.resolve('express', { paths: [BK] }));
  const { signToken } = require(path.join(BK, 'config/jwt'));
  const token = signToken({ id: U(1), username: 'demir', sid: 's1' });
  const me = { id: U(1), username: 'demir', displayName: 'Demir', display_name: 'Demir', birthDate: '2000-05-05', emailVerified: true, language: 'tr', blockedUsers: [], status: 'online', descoinBalance: 100 };
  const friends = [2, 3].map((n) => ({ id: U(n), username: `arkadas${n}`, displayName: `Arkadaş ${n}`, status: 'online', avatarUrl: null }));
  const app = express();
  app.use((req, res, next) => {
    res.setHeader('access-control-allow-origin', ORIGIN);
    res.setHeader('access-control-allow-headers', '*');
    res.setHeader('access-control-allow-methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    return next();
  });
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
  return new Promise((resolve) => server.listen(PORT, '127.0.0.1', () => { PORT = server.address().port; resolve({ server, token, me }); }));
}

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.gif': 'image/gif', '.woff2': 'font/woff2', '.woff': 'font/woff', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.webm': 'video/webm', '.mp4': 'video/mp4', '.wasm': 'application/wasm', '.ico': 'image/x-icon', '.txt': 'text/plain' };

/** Init script: the Tauri globals the shims expect, recording every invoke with its time. */
function fakeTauri(token) {
  window.__tauriCalls = [];
  window.__DESCALL_BOOT__ = Object.freeze({ version: '4.1.0', platform: 'win32', mode: 'main', token, reducedTransparency: false });
  const listeners = new Map();
  let cbId = 1;
  const answers = { app_version: '4.1.0', updates_status: { status: 'idle' }, window_content_box: { top: 0, right: 0, bottom: 0, left: 0 }, window_is_focused: true, screen_sources: [], processes_scan: [] };
  const invoke = async (cmd, args) => {
    const ch = cmd === 'premium_invoke' && args && args.channel ? `premium_invoke ${args.channel}` : cmd === 'app_boot_state' && args ? `app_boot_state ${args.phase}` : cmd;
    window.__tauriCalls.push([ch, performance.now()]);
    if (cmd === 'plugin:event|listen') return cbId++;
    if (cmd === 'premium_invoke') return { ok: false, error: 'locked' };
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

/**
 * Init script, first of all: count rAF callbacks and timer firings by call site (file:line of
 * the caller, from the stack), so a loop can be traced to its source.
 */
function instrument() {
  const p = { raf: 0, fired: {}, shimIntervals: [] };
  window.__idle = p;
  const site = () => {
    const lines = String(new Error().stack || '').split('\n').slice(3);
    const l = lines.find((s) => !/instrument|__idle/.test(s)) || '';
    const m = /(https?:\/\/[^)\s]+|<anonymous>|[\w.-]+\.js[^)\s]*)/.exec(l);
    return m ? m[1].replace(/^https:\/\/tauri\.localhost\//, '').replace(/\?[^:]*/, '') : 'unknown';
  };
  const oRaf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb) => oRaf((t) => { p.raf += 1; return cb(t); });
  const wrap = (name) => {
    const orig = window[name].bind(window);
    window[name] = (fn, ms, ...a) => {
      const s = `${name} ${site()} @${Math.round(Number(ms) || 0)}`;
      if (name === 'setInterval' && document.currentScript === null && /electron-api-shim|premium-shim|native-screen-share|shell-|tray-menu|premium-hud|premium-launcher/.test(s)) p.shimIntervals.push(s);
      return orig((...b) => { p.fired[s] = (p.fired[s] || 0) + 1; if (typeof fn === 'function') return fn(...b); return undefined; }, ms, ...a);
    };
  };
  wrap('setInterval');
  wrap('setTimeout');
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
        key = found || 'index.html';
      }
      const file = path.join(DIST, key);
      return rt.fulfill({ status: 200, headers: { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' }, body: fs.readFileSync(file) });
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
  await ctx.addInitScript(instrument);
  await ctx.addInitScript(fakeTauri, b.token);
  for (const s of ['premium-shim.js', 'electron-api-shim.js', 'premium-hud-shim.js', 'premium-launcher-shim.js', 'shell-notif.js', 'shell-overlay.js', 'tray-menu-shim.js', 'native-screen-share.js']) {
    await ctx.addInitScript({ content: fs.readFileSync(path.join(DESKTOP, 'app/shim', s), 'utf8') });
  }
  await ctx.addInitScript(([me, token]) => {
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
  const result = {};
  const snapshot = () => page.evaluate(() => ({
    raf: window.__idle.raf,
    fired: { ...window.__idle.fired },
    calls: window.__tauriCalls.length,
    shimIntervals: [...window.__idle.shimIntervals],
    animations: document.getAnimations().filter((a) => a.playState === 'running').map((a) => `${a.animationName || a.constructor.name} on ${a.effect && a.effect.target ? (a.effect.target.className || a.effect.target.tagName || '') : ''}`.slice(0, 120)),
  }));
  const measure = async (name) => {
    const a = await snapshot();
    await sleep(IDLE_MS);
    const z = await snapshot();
    const calls = await page.evaluate((from) => {
      const by = {};
      for (const [c] of window.__tauriCalls.slice(from)) by[c] = (by[c] || 0) + 1;
      return by;
    }, a.calls);
    const fired = {};
    for (const [k, v] of Object.entries(z.fired)) { const d = v - (a.fired[k] || 0); if (d > 0) fired[k] = d; }
    const r = { rafPerSec: Math.round(((z.raf - a.raf) / (IDLE_MS / 1000)) * 10) / 10, calls, fired, animations: z.animations, shimIntervals: z.shimIntervals };
    result[name] = r;
    log(`${name}: rAF ${r.rafPerSec}/s, ipc ${JSON.stringify(calls)}, animations ${r.animations.length}`);
    const top = Object.entries(fired).sort((x, y) => y[1] - x[1]).slice(0, 8);
    for (const [k, v] of top) log(`  ${v}x ${k}`);
    return r;
  };
  try {
    await page.goto(`${ORIGIN}/index.html`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    const t0 = Date.now();
    while (Date.now() - t0 < 60000) {
      if (await page.evaluate(() => !!document.querySelector('.rail-btn') && !document.getElementById('boot-splash')).catch(() => false)) break;
      await sleep(200);
    }
    check(await page.evaluate(() => document.documentElement.classList.contains('tauri-app')), 'shims ran (html.tauri-app)');
    // Start-up: the shim tells the shell when the boot splash is up (the window shows then).
    const boot = await page.evaluate(() => window.__tauriCalls.filter(([c]) => /^app_boot_state /.test(c)).map(([c, t]) => `${c.slice(15)}@${Math.round(t)}`));
    const nav = await page.evaluate(() => { const n = performance.getEntriesByType('navigation')[0]; return n ? { domContentLoaded: Math.round(n.domContentLoadedEventEnd), load: Math.round(n.loadEventEnd) } : null; });
    log(`boot reports: ${boot.join(', ')}; page load (PageLoadEvent::Finished) ${JSON.stringify(nav)}`);
    check(boot.filter((b) => b.startsWith('splash@')).length === 1, 'the boot splash is reported to the shell once, before the app mounted');
    check(boot.findIndex((b) => b.startsWith('splash@')) < boot.findIndex((b) => b.startsWith('app-mounted@')) || !boot.some((b) => b.startsWith('app-mounted@')), 'splash report comes first');
    await sleep(6000); // let start-up work (chunk prefetch, first fetches) finish
    const shown = await measure('visible');
    const polled = (r) => Object.entries(r.calls).filter(([c, n]) => !/^plugin:event\|(un)?listen$/.test(c) && n > Math.max(2, IDLE_MS / 5000));
    check(polled(shown).length === 0, `idle in the window polls no shell command${polled(shown).length ? `: ${JSON.stringify(polled(shown))}` : ''}`);

    // Hidden to the tray: the shell sends this on hide / minimize (boot.rs visibility).
    await page.evaluate(() => window.__TAURI__.event.emit('app:visibility', { backgrounded: true }));
    await sleep(1500);
    check(await page.evaluate(() => document.documentElement.classList.contains('app-backgrounded')), 'shell event sets html.app-backgrounded');
    const hidden = await measure('backgrounded');
    check(hidden.rafPerSec < 2, `no requestAnimationFrame loop in the tray (${hidden.rafPerSec}/s)`);
    check(hidden.animations.length === 0, `no running animation in the tray${hidden.animations.length ? `: ${hidden.animations.slice(0, 5).join(' | ')}` : ''}`);
    check(polled(hidden).length === 0, `the tray polls no shell command${polled(hidden).length ? `: ${JSON.stringify(polled(hidden))}` : ''}`);
    check(hidden.shimIntervals.length === 0, `the shims start no repeating timer while idle${hidden.shimIntervals.length ? `: ${hidden.shimIntervals.join(', ')}` : ''}`);
    check(errors.length === 0, `no page error${errors.length ? `: ${errors.slice(0, 3).join(' | ')}` : ''}`);
  } catch (err) {
    problems.push(String(err && err.message || err));
  }
  if (process.env.PERF_JSON) fs.writeFileSync(process.env.PERF_JSON, JSON.stringify(result, null, 2));
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
