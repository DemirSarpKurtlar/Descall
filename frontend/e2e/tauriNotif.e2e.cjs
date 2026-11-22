'use strict';

/**
 * Tauri (WebView2) emulation e2e for notifications, tray and taskbar, the page's side: the
 * Electron/Tauri build (ELECTRON_BUILD=1) served at https://tauri.localhost with the shell's
 * init scripts (desktop/app/shim/*.js) after fake __TAURI_INTERNALS__ / __TAURI__ that record
 * every invoke() and can emit shell events. The API host is a local express + socket.io
 * stand-in (polling); every other host is aborted.
 *
 * Checks:
 *   - boot: the page tells the shell its language (app_set_locale) and its tray state
 *     (tray_set_state: signed in, name);
 *   - a DM while Descall is not focused reaches notification_show with the payload the Rust
 *     side reads (title, body, tag dm-<id>, data.type / conversationId / fromId) and the tray
 *     state counts it (unreadMessages, the tray dot and the taskbar badge read this);
 *   - the same DM with Descall focused and that chat open shows no notification;
 *   - that chat open with Descall hidden to the tray: the DM counts as unread and is marked
 *     read only once Descall is back on screen (WebView2 keeps the page "visible"); the same
 *     for an open group;
 *   - notification:click with only the routing ids (what a toast clicked after a cold start
 *     sends, premium/features/quick_reply.rs) opens that DM;
 *   - the Electron envelope { title, body, tag, data } for a group opens the group;
 *   - tray:action openDms / status dnd run the app's own handlers (route, status:set);
 *   - an incoming call rings as a call capsule, Decline on it declines the call and the
 *     ring capsule is closed by its tag;
 *   - no page error.
 *
 * Run from frontend/:
 *   ELECTRON_BUILD=1 npx vite build --outDir dist-tauri-e2e
 *   node e2e/tauriNotif.e2e.cjs
 * Env: DESCALL_E2E_DIST (dist-tauri-e2e), DESCALL_E2E_PORT (a free port), DESCALL_E2E_SHOTS=<dir>.
 * Prints "[e2e-tauri-notif] OK" and exits 0, or "[e2e-tauri-notif] FAIL <reasons>" and exits 1.
 */

const fs = require('fs');
const path = require('path');
const http = require('http');

const FE = path.join(__dirname, '..');
const BK = path.join(FE, 'backend');
const DESKTOP = path.join(FE, '..', 'desktop');
const DIST = path.resolve(process.env.DESCALL_E2E_DIST || path.join(FE, 'dist-tauri-e2e'));
// Port 0: any free port (other e2e runs on this machine may hold the fixed ones).
let PORT = Number(process.env.DESCALL_E2E_PORT || 0);
const SHOTS = process.env.DESCALL_E2E_SHOTS || '';
const ORIGIN = 'https://tauri.localhost';
const API = 'https://des-call.onrender.com';
const log = (...a) => console.log('[e2e-tauri-notif]', ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-do-not-use-in-prod';
process.env.NODE_ENV = 'test';

const U = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const GROUP = '30000000-0000-4000-8000-000000000001';

function boot() {
  const express = require(require.resolve('express', { paths: [BK] }));
  const { signToken } = require(path.join(BK, 'config/jwt'));
  const token = signToken({ id: U(1), username: 'demir', sid: 's1' });
  const me = { id: U(1), username: 'demir', displayName: 'Demir', display_name: 'Demir', birthDate: '2000-05-05', emailVerified: true, language: 'tr', blockedUsers: [], status: 'online' };
  const friends = [2, 3].map((n) => ({ id: U(n), username: `arkadas${n}`, displayName: `Arkadas ${n}`, status: 'online', avatarUrl: null }));
  const groups = [{ id: GROUP, name: 'Hafta Sonu', members: [{ id: U(1), username: 'demir' }, { id: U(2), username: 'arkadas2' }], ownerId: U(1) }];
  const app = express();
  app.use((req, res, next) => {
    res.setHeader('access-control-allow-origin', ORIGIN);
    res.setHeader('access-control-allow-headers', '*');
    res.setHeader('access-control-allow-methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    return next();
  });
  app.use(express.json());
  app.use((req, res) => {
    const p = req.path;
    if (/\/auth\/me$/.test(p)) return res.json({ user: me });
    if (/\/friends(\/list)?$/.test(p)) return res.json({ friends });
    if (/\/groups(\/my)?$/.test(p)) return res.json(groups);
    if (/\/promo\//.test(p)) return res.json({ popup: null, codes: [], items: [], unseen: 0, count: 0 });
    const last = p.split('/').filter(Boolean).pop() || 'items';
    const out = { items: [], friends: [], requests: [], servers: [], groups: [], conversations: [], messages: [], notifications: [], prefs: {}, inventory: [] };
    out[last] = Array.isArray(out[last]) ? out[last] : [];
    return res.json(out);
  });
  const server = http.createServer(app);
  const { Server } = require(require.resolve('socket.io', { paths: [BK] }));
  const received = [];
  const sockets = new Set();
  new Server(server, { cors: { origin: ORIGIN }, transports: ['polling'] }).on('connection', (s) => {
    sockets.add(s);
    s.on('disconnect', () => sockets.delete(s));
    s.onAny((ev, ...args) => received.push([ev, args[0]]));
    s.emit('connected', { user: me, message: 'ok' });
    s.emit('friend:list', friends);
    s.on('app:ping', (ack) => typeof ack === 'function' && ack(Date.now()));
  });
  const emit = (ev, payload) => { for (const s of sockets) s.emit(ev, payload); return sockets.size; };
  return new Promise((resolve) => server.listen(PORT, '127.0.0.1', () => { PORT = server.address().port; resolve({ server, token, me, emit, received, sockets }); }));
}

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.gif': 'image/gif', '.woff2': 'font/woff2', '.woff': 'font/woff', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.webm': 'video/webm', '.mp4': 'video/mp4', '.wasm': 'application/wasm', '.ico': 'image/x-icon', '.txt': 'text/plain' };

/** Init script: the Tauri globals the shims expect, recording every invoke. */
function fakeTauri(token) {
  window.__tauriCalls = [];
  window.__focused = false;
  window.__DESCALL_BOOT__ = Object.freeze({ version: '4.1.0', platform: 'win32', mode: 'main', token, reducedTransparency: false });
  const listeners = new Map();
  let cbId = 1;
  const answers = { app_version: '4.1.0', updates_status: { status: 'idle' }, window_content_box: { top: 0, right: 0, bottom: 0, left: 0 }, screen_sources: [], processes_scan: [] };
  const invoke = async (cmd, args) => {
    window.__tauriCalls.push([cmd, JSON.parse(JSON.stringify(args ?? null))]);
    if (cmd === 'plugin:event|listen') return cbId++;
    if (cmd === 'window_is_focused') return window.__focused;
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
  const b = await boot();
  const pw = require(process.env.PLAYWRIGHT_CORE || 'playwright');
  const browser = await pw.chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage', '--lang=tr-TR'] });
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
        key = found || 'index.html'; // Tauri's SPA fallback
      }
      const file = path.join(DIST, key);
      return rt.fulfill({ status: 200, headers: { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' }, body: fs.readFileSync(file) });
    }
    // The CI build (dist-e2e) bakes a loopback API (VITE_API_BASE_URL=http://127.0.0.1:5361):
    // it goes to the same stand-in.
    if (u.origin === API || (u.hostname === '127.0.0.1' && String(u.port) !== String(PORT))) {
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
  const shot = async (name) => {
    if (!SHOTS) return;
    fs.mkdirSync(SHOTS, { recursive: true });
    await page.screenshot({ path: path.join(SHOTS, `${name}.jpg`), type: 'jpeg', quality: 60 });
  };
  const waitFor = async (label, fn, arg, ms = 20000) => {
    const t0 = Date.now();
    let last;
    while (Date.now() - t0 < ms) {
      try { last = await page.evaluate(fn, arg); } catch (err) { last = `ERR ${err.message}`; }
      if (last === true) return true;
      await sleep(150);
    }
    throw new Error(`${label}: not reached (last ${JSON.stringify(last)})`);
  };
  const calls = (cmd) => page.evaluate((c) => window.__tauriCalls.filter(([n]) => n === c).map(([, a]) => a), cmd);
  const shellEmit = (ev, payload) => page.evaluate(([e, p]) => window.__TAURI__.event.emit(e, p), [ev, payload]);
  const lastTray = async () => { const t = await calls('tray_set_state'); return t.length ? t[t.length - 1].state : null; };
  let msgN = 0;
  const dm = (from, text) => ({ id: `m-${++msgN}`, convWith: U(from), from: { id: U(from), username: `arkadas${from}` }, to: { id: U(1) }, text, timestamp: new Date().toISOString() });
  try {
    await page.goto(`${ORIGIN}/index.html`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await waitFor('app shell', () => !!document.querySelector('.rail-btn') && !document.getElementById('boot-splash'), null, 45000);
    await waitFor('socket connected', () => true);
    const t0 = Date.now();
    while (b.sockets.size === 0 && Date.now() - t0 < 20000) await sleep(150);
    check(b.sockets.size > 0, 'socket connected to the stand-in API');
    await sleep(800);

    // 1. Boot: language and tray state reach the shell.
    const locales = await calls('app_set_locale');
    check(locales.some((a) => a && a.locale === 'tr'), `app_set_locale tr (${JSON.stringify(locales.slice(-1))})`);
    const tray0 = await lastTray();
    check(tray0 && tray0.signedIn === true && tray0.name === 'Demir' && tray0.unreadMessages === 0, `tray_set_state signed in as Demir, 0 unread (${JSON.stringify(tray0 && { signedIn: tray0.signedIn, name: tray0.name, unread: tray0.unreadMessages })})`);

    // 2. A DM while Descall is not focused: notification_show with the payload notify.rs reads.
    const before = (await calls('notification_show')).length;
    b.emit('dm:message', dm(2, 'selam, akşam oyun?'));
    // The server's unread count for a chat that is not open (socket dm:unread:sync).
    b.emit('dm:unread:sync', { peerId: U(2), count: 1 });
    await waitFor('notification_show', (n) => window.__tauriCalls.filter(([c]) => c === 'notification_show').length > n, before);
    const shown = (await calls('notification_show')).slice(before);
    const p = shown[0] && shown[0].payload;
    check(p && p.title === 'arkadas2' && /selam/.test(p.options.body) && p.options.tag === `dm-${U(2)}`, `capsule title / body / tag (${JSON.stringify(p && { t: p.title, b: p.options.body, tag: p.options.tag })})`);
    check(p && p.options.data && p.options.data.type === 'dm' && p.options.data.conversationId === U(2) && p.options.data.fromId === U(2), 'data carries type, conversationId and fromId (click routing, cold-start toast arguments)');
    check(p && p.options.requireInteraction === false, 'a message does not require interaction');
    check(shown.length === 1, `one notification per message (${shown.length})`);
    await waitFor('tray unread', async () => { const t = window.__tauriCalls.filter(([c]) => c === 'tray_set_state').pop(); return Boolean(t && t[1].state.unreadMessages === 1); }, null, 5000).catch((e) => problems.push(e.message));
    log('ok - tray state counts the unread DM (tray dot and taskbar badge source)');

    // 3. notification:click with only the routing ids (cold-start toast) opens that DM.
    await shellEmit('notification:click', { data: { type: 'dm', conversationId: U(2), fromId: U(2) } });
    await waitFor('dm route', (id) => location.pathname.includes(id) || location.pathname.startsWith('/direct/'), U(2), 8000).catch((e) => problems.push(e.message));
    const path1 = await page.evaluate(() => location.pathname);
    check(/^\/direct\//.test(path1), `cold-start click opened the DM (${path1})`);
    await shot('dm-open');

    // 4. The same chat open and Descall focused: no notification for what is on screen.
    await page.evaluate(() => { window.__focused = true; });
    await page.bringToFront();
    const before2 = (await calls('notification_show')).length;
    b.emit('dm:message', dm(2, 'buradasın zaten'));
    await sleep(1500);
    const after2 = (await calls('notification_show')).length;
    check(after2 === before2, `no notification for the open chat while focused (${after2 - before2})`);
    await page.evaluate(() => { window.__focused = false; });

    // 4b. The same chat open but Descall hidden to the tray (app:visibility backgrounded; the
    //     page stays "visible" in WebView2): the DM counts as unread (tray dot, taskbar badge),
    //     a capsule shows, and the read receipt waits until Descall is back on screen.
    await shellEmit('app:visibility', { backgrounded: true });
    await sleep(200);
    const mr = b.received.length;
    const n4 = (await calls('notification_show')).length;
    b.emit('dm:message', dm(2, 'tepside misin'));
    await waitFor('tray capsule', (n) => window.__tauriCalls.filter(([c]) => c === 'notification_show').length > n, n4, 5000).catch((e) => problems.push(e.message));
    await sleep(800);
    const tray4 = await lastTray();
    check(tray4 && tray4.unreadMessages === 1, `open chat in the tray: counted as unread (${tray4 && tray4.unreadMessages})`);
    check(!b.received.slice(mr).some(([ev]) => ev === 'dm:mark_read'), 'open chat in the tray: not marked read while away');
    await shellEmit('app:visibility', { backgrounded: false });
    await page.mouse.click(640, 400);
    const t4 = Date.now();
    while (!b.received.slice(mr).some(([ev, a]) => ev === 'dm:mark_read' && a && a.withUserId === U(2)) && Date.now() - t4 < 5000) await sleep(150);
    check(b.received.slice(mr).some(([ev, a]) => ev === 'dm:mark_read' && a && a.withUserId === U(2)), 'back on screen: the DM is marked read');
    await sleep(500);
    const tray5 = await lastTray();
    check(tray5 && tray5.unreadMessages === 0, `back on screen: unread cleared (${tray5 && tray5.unreadMessages})`);

    // 5. The Electron envelope for a group click opens the group.
    await shellEmit('notification:click', { title: 'Hafta Sonu', body: 'arkadas2: selam', tag: `group-${GROUP}`, data: { type: 'group', groupId: GROUP, groupName: 'Hafta Sonu', from: 'arkadas2' } });
    await waitFor('group route', (id) => location.pathname.includes(id) || /\/groups?\//.test(location.pathname), GROUP, 8000).catch((e) => problems.push(e.message));
    check(/group/.test(await page.evaluate(() => location.pathname)), `group click opened the group (${await page.evaluate(() => location.pathname)})`);

    // 5b. That group open and Descall in the tray: its messages count as unread until seen.
    await shellEmit('app:visibility', { backgrounded: true });
    await sleep(200);
    const n5 = (await calls('notification_show')).length;
    b.emit('group:message', { groupId: GROUP, message: { id: 'g-1', content: 'hafta sonu?', created_at: new Date().toISOString(), sender: { id: U(2), username: 'arkadas2' } } });
    await waitFor('group capsule', (n) => window.__tauriCalls.filter(([c]) => c === 'notification_show').length > n, n5, 5000).catch((e) => problems.push(e.message));
    await sleep(800);
    const tray6 = await lastTray();
    check(tray6 && tray6.unreadMessages === 1, `open group in the tray: counted as unread (${tray6 && tray6.unreadMessages})`);
    await shellEmit('app:visibility', { backgrounded: false });
    await page.mouse.click(640, 400);
    await sleep(800);
    const tray7 = await lastTray();
    check(tray7 && tray7.unreadMessages === 0, `back on screen: group unread cleared (${tray7 && tray7.unreadMessages})`);

    // 6. Tray panel actions run the app's own handlers.
    await shellEmit('tray:action', { action: 'openDms', arg: null });
    await waitFor('direct route', () => location.pathname === '/direct' || location.pathname.startsWith('/direct'), null, 8000).catch((e) => problems.push(e.message));
    check((await page.evaluate(() => location.pathname)).startsWith('/direct'), 'tray openDms opens the DM list');
    const sb = b.received.length;
    await shellEmit('tray:action', { action: 'status', arg: 'dnd' });
    const t1 = Date.now();
    while (!b.received.slice(sb).some(([ev, a]) => ev === 'status:set' && a && a.status === 'dnd') && Date.now() - t1 < 8000) await sleep(150);
    check(b.received.slice(sb).some(([ev, a]) => ev === 'status:set' && a && a.status === 'dnd'), 'tray status dnd reaches the server (status:set)');
    await sleep(500);
    const tray2 = await lastTray();
    check(tray2 && tray2.status === 'dnd', `tray state follows the new status (${tray2 && tray2.status})`);

    // 7. Incoming call while Descall is not focused: a ring capsule (call, requireInteraction),
    //    Decline on the capsule (notification:call-decline) declines through the app, and a
    //    ring that ends closes the capsule by tag (notification_close).
    const n3 = (await calls('notification_show')).length;
    b.emit('call:offer', { fromUser: { id: U(3), username: 'arkadas3', displayName: 'Arkadas 3' }, offer: { type: 'offer', sdp: 'v=0' }, callType: 'video', callUuid: 'ring-1' });
    await waitFor('ring capsule', (n) => window.__tauriCalls.filter(([c]) => c === 'notification_show').length > n, n3, 8000).catch((e) => problems.push(e.message));
    const ring = (await calls('notification_show')).slice(n3).map((a) => a.payload).find((x) => x.options.data && x.options.data.type === 'call');
    check(ring && ring.options.requireInteraction === true && ring.options.data.fromId === U(3) && ring.options.data.callType === 'video', `ring capsule: call, requires interaction, caller id, video (${JSON.stringify(ring && { tag: ring.options.tag, ri: ring.options.requireInteraction, d: ring.options.data.type })})`);
    const rs = b.received.length;
    const c3 = (await calls('notification_close')).length;
    await shellEmit('notification:call-decline', ring ? ring.options.data : {});
    const t2 = Date.now();
    while (!b.received.slice(rs).some(([ev, a]) => ev === 'call:decline' && a && a.toUserId === U(3)) && Date.now() - t2 < 8000) await sleep(150);
    check(b.received.slice(rs).some(([ev, a]) => ev === 'call:decline' && a && a.toUserId === U(3)), 'Decline on the capsule declines the call (call:decline to the server)');
    await waitFor('ring closed', (n) => window.__tauriCalls.filter(([c]) => c === 'notification_close').length > n, c3, 5000).catch((e) => problems.push(e.message));
    const closes = (await calls('notification_close')).slice(c3).map((a) => a.payload);
    const closedTags = closes.flatMap((x) => (x && (x.tags || [x.tag])) || []);
    check(ring && closedTags.includes(ring.options.tag), `the ring capsule is closed by its tag (${JSON.stringify(closedTags)})`);

    check(errors.length === 0, `no page error${errors.length ? `: ${errors.slice(0, 3).join(' | ')}` : ''}`);
  } catch (err) {
    problems.push(String(err && err.message || err));
    await shot('failure').catch(() => {});
  }
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
