'use strict';

/**
 * Tauri (WebView2) screen sweep: every main screen of the desktop app in the Tauri emulation
 * (the ELECTRON_BUILD served at https://tauri.localhost with the shipped CSP, fake
 * __TAURI_INTERNALS__ / __TAURI__, the shell's init scripts from desktop/app/shim and the
 * Tauri drag-region script), the API answered by the REAL shop2 / servers / groups routes on a
 * fake Supabase plus small mocks. Every other host is aborted; no real account or token.
 *
 * For each screen it opens the thing by clicks, then runs the same generic audit:
 *   - frozen entrance: an element painted at opacity ~0 whose own CSS animation (or an
 *     ancestor's) is paused, i.e. an entrance frozen at its first frame by html.app-idle /
 *     app-backgrounded / app-hidden (the "opens and is invisible / vanishes" class);
 *   - dead click under a drag region: a clickable-looking element (cursor: pointer) inside
 *     a data-tauri-drag-region subtree that Tauri's drag script would turn into a window drag
 *     (mousedown preventDefault + stopImmediatePropagation, click never arrives);
 *   - under the title bar: a clickable element of the page whose centre is covered by the
 *     window title bar (always-on-top layer, its mousedown starts a window drag in Tauri).
 * Each screen is opened twice more while the window is "minimized and restored without
 * activation" (html.app-backgrounded from the shell, no input yet) and while "idle"
 * (html.app-idle) using script clicks (no pointerdown, so the stale class stays like a
 * tray / hotkey / socket triggered open), and the audit must stay clean.
 *
 * Run from frontend/:
 *   ELECTRON_BUILD=1 npx vite build --outDir dist-tauri-e2e
 *   node e2e/tauriScreens.e2e.cjs
 * Env: DESCALL_E2E_DIST (dist-tauri-e2e), DESCALL_E2E_PORT (5372), DESCALL_E2E_SHOTS=<dir>,
 *      DESCALL_E2E_ONLY=<screen,...>, DESCALL_E2E_DEBUG=1, CHROME_PATH.
 * Prints "[e2e-tauri-screens] OK" and exits 0, or "[e2e-tauri-screens] FAIL <reasons>" (1).
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');

const FE = path.join(__dirname, '..');
const BK = path.join(FE, 'backend');
const DESKTOP = path.join(FE, '..', 'desktop');
const DIST = path.resolve(process.env.DESCALL_E2E_DIST || path.join(FE, 'dist-tauri-e2e'));
const PORT = Number(process.env.DESCALL_E2E_PORT || 5372);
const SHOTS = process.env.DESCALL_E2E_SHOTS || '';
const CHROME = process.env.CHROME_PATH || '';
const ONLY = (process.env.DESCALL_E2E_ONLY || '').split(',').map((s) => s.trim()).filter(Boolean);
const DEBUG = !!process.env.DESCALL_E2E_DEBUG;
const ORIGIN = 'https://tauri.localhost';
const API = 'https://des-call.onrender.com';
const log = (...a) => console.log('[e2e-tauri-screens]', ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-do-not-use-in-prod';
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://placeholder.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'placeholder-key';
process.env.NODE_ENV = 'test';

const DAY = 86400000;
const U = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const iso = (t) => new Date(t).toISOString();
const SERVER = '30000000-0000-4000-8000-000000000001';
const GROUP = '40000000-0000-4000-8000-000000000001';
const CH_TEXT = '31000000-0000-4000-8000-000000000001';
const CH_VOICE = '31000000-0000-4000-8000-000000000002';
// 1x1 PNG served for every image URL of the fake data (no external host).
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

function boot() {
  const now = Date.now();
  const { catalogRows } = require(path.join(BK, 'lib/shop2/catalogSeed'));
  const rows = catalogRows().map((r, i) => ({ id: `20000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`, created_at: iso(now - 20 * DAY), ...r }));
  const users = [1, 2, 3, 4].map((n) => ({ id: U(n), username: n === 1 ? 'demir' : `arkadas${n}`, display_name: n === 1 ? 'Demir' : `Arkadaş ${n}`, active_sessions: [{ id: `s${n}` }], descoin_balance: n === 1 ? 42000 : 5000, created_at: iso(now - 90 * DAY), status: 'online' }));
  const { createFakeSupabase } = require(path.join(BK, 'test/fakeSupabase.cjs'));
  const fake = createFakeSupabase({
    users,
    friendships: [2, 3, 4].map((n) => ({ id: `f${n}`, user_id: U(1), friend_id: U(n), status: 'accepted' })),
    shop_items: rows,
    user_inventory: rows.filter((r) => r.set_key).slice(0, 3).map((r, i) => ({ id: `inv-${i}`, user_id: U(1), item_id: r.id, acquired_via: 'purchase', acquired_at: iso(now - 5 * DAY) })),
    shop_purchases: [],
    descoin_ledger: [],
    servers: [{ id: SERVER, name: 'Oyun Gecesi', owner_id: U(1), icon_url: null, description: 'Test sunucusu', created_at: iso(now - 30 * DAY), verification_level: 0 }],
    server_members: [1, 2, 3].map((n, i) => ({ server_id: SERVER, user_id: U(n), list_position: 0, joined_at: iso(now - (30 - i) * DAY), nickname: null, notification_level: 'all', rules_accepted_at: null, timeout_until: null, folder_id: null })),
    server_channels: [
      { id: CH_TEXT, server_id: SERVER, name: 'genel', type: 'text', position: 0, created_at: iso(now - 30 * DAY) },
      { id: CH_VOICE, server_id: SERVER, name: 'Sesli Sohbet', type: 'voice', position: 1, created_at: iso(now - 30 * DAY) },
    ],
    server_roles: [{ id: '32000000-0000-4000-8000-000000000001', server_id: SERVER, name: 'Moderatör', color: '#587af5', permissions: 0, position: 1, created_at: iso(now - 30 * DAY) }],
    server_member_roles: [],
    server_invites: [],
    server_bans: [],
    server_channel_messages: [],
    groups: [{ id: GROUP, name: 'Hafta sonu', owner_id: U(1), created_at: iso(now - 10 * DAY), avatar_url: null }],
    group_members: [1, 2, 3].map((n) => ({ id: `gm${n}`, group_id: GROUP, user_id: U(n), role: n === 1 ? 'owner' : 'member', joined_at: iso(now - 10 * DAY) })),
    group_messages: [],
  }, {});
  const sbPath = require.resolve(path.join(BK, 'db/supabase'));
  require.cache[sbPath] = { id: sbPath, filename: sbPath, loaded: true, exports: fake };
  const express = require(require.resolve('express', { paths: [BK] }));
  const { signToken } = require(path.join(BK, 'config/jwt'));
  const token = signToken({ id: U(1), username: 'demir', sid: 's1' });
  const me = { id: U(1), username: 'demir', displayName: 'Demir', display_name: 'Demir', birthDate: '2000-05-05', emailVerified: true, language: 'tr', blockedUsers: [], status: 'online', descoinBalance: 42000 };
  const friends = users.slice(1).map((u) => ({ id: u.id, username: u.username, displayName: u.display_name, status: 'online', avatarUrl: null }));
  const peer = friends[0];
  let seq = 0;
  const sender = (u) => ({ id: u.id, username: u.username, displayName: u.displayName, display_name: u.displayName, avatarUrl: null });
  const dm = (from, text, minAgo, extra = {}) => ({ id: `m-${String(++seq).padStart(4, '0')}`, from: sender(from), to: { id: (from === me ? peer : me).id }, text, mediaUrl: null, mediaType: null, timestamp: iso(now - minAgo * 60000), deliveredAt: iso(now - minAgo * 60000), readAt: iso(now - minAgo * 60000), editHistory: [], reactions: [], ...extra });
  const LINES = ['Bu akşam oyun gecesine geliyor musun?', 'Tabii, saat kaçta?', "21:00'de, önce sesli kanalda toplanırız.", 'Tamam', 'Süper!', 'Geçen haftaki klibi gördün mü?'];
  const messages = [];
  for (let i = 0; i < 24; i++) messages.push(dm(i % 2 ? me : peer, LINES[i % LINES.length], (40 - i) * 3, i === 6 ? { reactions: [{ emoji: '👍', users: [peer.id], count: 1 }] } : {}));
  messages.push(dm(peer, 'Resim', 8, { mediaUrl: `${API}/e2e-media/photo.png`, mediaType: 'image', text: '' }));
  messages.push(dm(peer, 'https://example.org/haber', 5));
  messages.push(dm(peer, 'Son mesaj', 2));
  const app = express();
  app.use((req, res, next) => {
    res.setHeader('access-control-allow-origin', ORIGIN);
    res.setHeader('access-control-allow-headers', '*');
    res.setHeader('access-control-allow-methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    if (DEBUG && !/\.(png|js|css)$/.test(req.path)) log('api', req.method, req.path);
    return next();
  });
  app.use(express.json({ limit: '2mb' }));
  app.set('io', { emit() {}, to: () => ({ emit() {} }), in: () => ({ emit() {}, fetchSockets: async () => [] }), sockets: { adapter: { rooms: new Map() }, sockets: new Map() } });
  app.get('/e2e-media/:f', (req, res) => res.type('png').send(PNG));
  app.use('/api/shop2', require(path.join(BK, 'routes/shop2')));
  app.use('/api/servers', require(path.join(BK, 'routes/servers')));
  const groupsRouter = require(path.join(BK, 'routes/groups'));
  app.use('/api/groups', groupsRouter);
  app.use('/groups', groupsRouter);
  app.use((req, res) => {
    const p = req.path;
    if (/\/auth\/me$/.test(p)) return res.json({ user: me });
    if (/\/friends\/mutual\//.test(p)) return res.json({ mutualFriends: friends.slice(1), mutualServers: [] });
    if (/\/friends(\/list)?$/.test(p)) return res.json({ friends });
    if (/\/promo\//.test(p)) return res.json({ popup: null, codes: [], items: [], unseen: 0, count: 0 });
    if (/\/dm\/[^/]+\/messages$/.test(p)) return res.json({ withUserId: peer.id, messages, hasMore: false });
    if (/\/dm\/previews$/.test(p)) return res.json({ dmPreviewsByPeer: { [peer.id]: 'Son mesaj' }, dmLastActivityByPeer: { [peer.id]: iso(now) }, previews: {} });
    if (/link-?preview/.test(p)) return res.json({ url: 'https://example.org/haber', title: 'Örnek haber', description: 'Açıklama', siteName: 'example.org', image: null });
    if (/\/users\/[^/]+(\/profile)?$/.test(p) || /\/profile\//.test(p)) return res.json({ user: { ...peer, createdAt: iso(now - 60 * DAY) }, ...peer });
    const last = p.split('/').filter(Boolean).pop() || 'items';
    const out = { items: [], friends: [], requests: [], servers: [], groups: [], conversations: [], messages: [], notifications: [], prefs: {}, inventory: [], announcements: [] };
    out[last] = Array.isArray(out[last]) ? out[last] : [];
    return res.json(out);
  });
  const server = http.createServer(app);
  const { Server } = require(require.resolve('socket.io', { paths: [BK] }));
  const sockets = new Set();
  new Server(server, { cors: { origin: ORIGIN }, transports: ['polling'] }).on('connection', (s) => {
    sockets.add(s);
    s.on('disconnect', () => sockets.delete(s));
    s.emit('connected', { user: me, message: 'ok' });
    s.emit('friend:list', friends.map((f) => (f.id === peer.id ? { ...f, lastMessage: 'Son mesaj', lastActivity: iso(now) } : f)));
    s.emit('friend:requests', []);
    s.emit('users:update', [sender(me), ...friends].map((u) => ({ ...u, status: 'online' })));
    s.on('app:ping', (ack) => typeof ack === 'function' && ack(Date.now()));
    s.on('dm:send', (p = {}) => s.emit('dm:message', { ...dm(me, p.text || '', 0), tempId: p.tempId, convWith: peer.id }));
    s.onAny((ev, ...args) => { const ack = args[args.length - 1]; if (DEBUG) log('sock<-', ev); if (typeof ack === 'function' && ev !== 'app:ping') ack({ ok: true }); });
  });
  const peerSays = (text) => { for (const s of sockets) s.emit('dm:message', { ...dm(peer, text, 0), convWith: peer.id }); };
  return new Promise((resolve) => server.listen(PORT, '127.0.0.1', () => resolve({ server, token, me, peer, peerSays })));
}

/** tauri.conf.json CSP plus the sha256 of every inline script, as Tauri serves index.html. */
function cspHeader(html) {
  const conf = JSON.parse(fs.readFileSync(path.join(DESKTOP, 'app/src-tauri/tauri.conf.json'), 'utf8'));
  const csp = { ...conf.app.security.csp };
  const hashes = [];
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (/\bsrc\s*=/.test(m[1]) || /application\/ld\+json/i.test(m[1])) continue;
    hashes.push(`'sha256-${crypto.createHash('sha256').update(m[2].replace(/\r\n?/g, '\n')).digest('base64')}'`);
  }
  csp['script-src'] = `${csp['script-src']} ${hashes.join(' ')}`;
  return Object.entries(csp).map(([k, v]) => `${k} ${v}`).join('; ');
}

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.gif': 'image/gif', '.woff2': 'font/woff2', '.woff': 'font/woff', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.webm': 'video/webm', '.mp4': 'video/mp4', '.wasm': 'application/wasm', '.ico': 'image/x-icon', '.txt': 'text/plain' };

/** Init script: the Tauri globals the shims expect, recording every invoke. */
function fakeTauri(token) {
  window.__tauriCalls = [];
  window.__DESCALL_BOOT__ = Object.freeze({ version: '4.1.0', platform: 'win32', mode: 'main', token, reducedTransparency: false });
  const listeners = new Map();
  let cbId = 1;
  const answers = { app_version: '4.1.0', updates_status: { status: 'idle' }, window_content_box: { top: 0, right: 0, bottom: 0, left: 0 }, window_is_focused: true, screen_sources: [], processes_scan: [] };
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

/**
 * Tauri 2.12 window/scripts/drag.js (what the shell injects into every window): a left
 * mousedown on a drag region calls preventDefault + stopImmediatePropagation and starts a
 * native window drag, so the element never gets its click. Same decision function.
 */
function tauriDragScript() {
  const CLICKABLE_TAGS = new Set(['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'LABEL', 'SUMMARY']);
  const ROLES = new Set(['button', 'link', 'menuitem', 'tab', 'checkbox', 'radio', 'switch', 'option']);
  const clickable = (el) => CLICKABLE_TAGS.has(el.tagName)
    || (el.hasAttribute('contenteditable') && el.getAttribute('contenteditable') !== 'false')
    || (el.hasAttribute('tabindex') && el.getAttribute('tabindex') !== '-1')
    || ROLES.has(el.getAttribute('role'));
  const isDragRegion = (composedPath) => {
    for (const el of composedPath) {
      if (!(el instanceof HTMLElement)) continue;
      const attr = el.getAttribute('data-tauri-drag-region');
      if (clickable(el) && attr === null) return false;
      if (attr === null) continue;
      if (attr === 'false') return false;
      if (attr === 'deep') return true;
      if (attr === '' || attr === 'true') return el === composedPath[0];
    }
    return false;
  };
  window.__tauriIsDragRegion = isDragRegion;
  document.addEventListener('mousedown', (e) => {
    if (e.button === 0 && (e.detail === 1 || e.detail === 2) && isDragRegion(e.composedPath())) {
      e.preventDefault();
      e.stopImmediatePropagation();
      window.__TAURI_INTERNALS__.invoke(`plugin:window|${e.detail === 2 ? 'internal_toggle_maximize' : 'start_dragging'}`);
    }
  });
}

/** In-page generic audit. Returns a list of problem strings for the current screen. */
function audit() {
  const out = [];
  const desc = (el) => {
    const cls = typeof el.className === 'string' ? el.className.trim().split(/\s+/).slice(0, 3).join('.') : '';
    const label = el.getAttribute('aria-label') || (el.textContent || '').trim().slice(0, 24);
    return `${el.tagName.toLowerCase()}${cls ? `.${cls}` : ''}${label ? ` "${label}"` : ''}`;
  };
  const vw = innerWidth;
  const vh = innerHeight;
  const onScreen = (r) => r.width > 2 && r.height > 2 && r.right > 0 && r.bottom > 0 && r.left < vw && r.top < vh;
  // 1. Frozen entrances: a paused one-shot CSS animation whose element is painted at opacity
  //    ~0 on screen (document.getAnimations: cheap, no full DOM walk).
  const seen = new Set();
  for (const a of document.getAnimations()) {
    if (a.playState !== 'paused' || typeof a.animationName !== 'string') continue;
    const it = a.effect && a.effect.getComputedTiming ? a.effect.getComputedTiming().iterations : 1;
    if (it === Infinity) continue;
    const el = a.effect && a.effect.target;
    if (!el || el.nodeType !== 1 || seen.has(el) || seen.size > 40) continue;
    const cs = getComputedStyle(el);
    if (Number(cs.opacity) > 0.05 || cs.visibility === 'hidden' || cs.display === 'none') continue;
    if (el.closest('[aria-hidden="true"], [inert]')) continue;
    const r = el.getBoundingClientRect();
    if (!onScreen(r) || r.width * r.height < 64) continue;
    seen.add(el);
    out.push(`frozen entrance (${a.animationName} paused at opacity ${cs.opacity}) ${desc(el)}`);
  }
  // Centre of an element as painted: inside the viewport and every clipping scroller.
  const visibleCentre = (el) => {
    const r = el.getBoundingClientRect();
    let l = r.left; let t = r.top; let rr = r.right; let b = r.bottom;
    for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) {
      const o = getComputedStyle(n);
      if (!/(auto|scroll|hidden|clip)/.test(`${o.overflowX}${o.overflowY}`)) continue;
      const pr = n.getBoundingClientRect();
      l = Math.max(l, pr.left); t = Math.max(t, pr.top); rr = Math.min(rr, pr.right); b = Math.min(b, pr.bottom);
    }
    l = Math.max(l, 0); t = Math.max(t, 0); rr = Math.min(rr, vw); b = Math.min(b, vh);
    if (rr - l < 2 || b - t < 2) return null;
    return { x: (l + rr) / 2, y: (t + b) / 2, top: t };
  };
  // 2 and 3. Clickables: under a drag region (dead in Tauri) or covered by the title bar.
  const bar = document.querySelector('.titlebar');
  const barH = bar ? bar.getBoundingClientRect().bottom : 0;
  // Focus traps: a modal's inert / aria-hidden siblings must not include the title bar (its
  // window buttons would be dead while the modal is open).
  if (bar && bar.closest('[inert], [aria-hidden="true"]')) out.push('title bar inert or aria-hidden (window buttons dead under this screen)');
  if (bar) {
    for (const btn of bar.querySelectorAll('.win-btn')) {
      const r = btn.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      if (!hit || !btn.contains(hit)) out.push(`window button covered ${desc(btn)} by ${hit ? desc(hit) : 'nothing'}`);
    }
  }
  const isDrag = window.__tauriIsDragRegion;
  for (const el of document.body.querySelectorAll('button, a[href], [role="button"], [role="menuitem"], [role="tab"], [role="option"], input, textarea, select, [onclick], [tabindex]:not([tabindex="-1"])')) {
    const r = el.getBoundingClientRect();
    if (!onScreen(r)) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.pointerEvents === 'none' || Number(cs.opacity) < 0.05) continue;
    if (el.closest('[aria-hidden="true"], [inert]')) continue;
    // Elements inside a drag region: the element itself and every child with cursor:pointer.
    if (isDrag && el.closest('[data-tauri-drag-region]')) {
      const kids = [el, ...el.querySelectorAll('*')].filter((k) => getComputedStyle(k).cursor === 'pointer');
      for (const k of kids) {
        const pathUp = [];
        for (let n = k; n; n = n.parentElement) pathUp.push(n);
        if (isDrag(pathUp)) { out.push(`dead click under drag region ${desc(k)}`); break; }
      }
      continue;
    }
    if (bar && !bar.contains(el) && r.top < barH) {
      const c = visibleCentre(el);
      if (!c || c.y >= barH) continue;
      const hit = document.elementFromPoint(c.x, c.y);
      if (hit && bar.contains(hit) && !el.contains(hit)) out.push(`under the title bar ${desc(el)} at y=${Math.round(c.top)}`);
    }
  }
  // Clickables inside a drag region that are not buttons (div onClick etc.) are found through
  // cursor: pointer on any element of the region.
  if (isDrag) {
    for (const region of document.querySelectorAll('[data-tauri-drag-region]')) {
      for (const k of region.querySelectorAll('*')) {
        if (getComputedStyle(k).cursor !== 'pointer') continue;
        const r = k.getBoundingClientRect();
        if (!onScreen(r)) continue;
        const pathUp = [];
        for (let n = k; n; n = n.parentElement) pathUp.push(n);
        if (isDrag(pathUp)) out.push(`dead click under drag region ${desc(k)}`);
      }
    }
  }
  return [...new Set(out)];
}

async function main() {
  if (!fs.existsSync(path.join(DIST, 'index.html'))) {
    log(`FAIL no build at ${DIST} (ELECTRON_BUILD=1 npx vite build --outDir dist-tauri-e2e)`);
    process.exit(1);
  }
  const b = await boot();
  const pw = require(process.env.PLAYWRIGHT_CORE || 'playwright');
  const browser = await pw.chromium.launch({ ...(CHROME && fs.existsSync(CHROME) ? { executablePath: CHROME } : {}), headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage', '--lang=tr-TR', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
  const problems = [];
  const covered = [];
  const makeContext = async (signedIn) => {
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
        const ext = path.extname(file);
        const body = fs.readFileSync(file);
        const headers = { 'content-type': MIME[ext] || 'application/octet-stream' };
        if (ext === '.html') headers['content-security-policy'] = cspHeader(body.toString('utf8'));
        return rt.fulfill({ status: 200, headers, body });
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
    await ctx.addInitScript(fakeTauri, signedIn ? b.token : null);
    for (const s of ['premium-shim.js', 'electron-api-shim.js', 'premium-hud-shim.js', 'premium-launcher-shim.js', 'shell-notif.js', 'shell-overlay.js', 'tray-menu-shim.js', 'native-screen-share.js']) {
      await ctx.addInitScript({ content: fs.readFileSync(path.join(DESKTOP, 'app/shim', s), 'utf8') });
    }
    await ctx.addInitScript(tauriDragScript);
    await ctx.addInitScript(([me, token]) => {
      window.__cspViolations = [];
      document.addEventListener('securitypolicyviolation', (e) => window.__cspViolations.push(`${e.violatedDirective} ${e.blockedURI}`));
      try {
        if (sessionStorage.getItem('__e2e')) return;
        sessionStorage.setItem('__e2e', '1');
      } catch { return; }
      localStorage.setItem('descall_language', 'tr');
      localStorage.setItem('descall:cookie_consent_v1', JSON.stringify({ choice: 'rejected', at: new Date().toISOString() }));
      if (token) {
        localStorage.setItem('descall_token', token);
        localStorage.setItem('descall_user', JSON.stringify(me));
      }
      localStorage.setItem('descall_user_settings', JSON.stringify({ darkMode: true, language: 'tr' }));
    }, [b.me, signedIn ? b.token : null]);
    return ctx;
  };
  let ctx = await makeContext(true);
  let page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 300)));
  const shot = async (name) => {
    if (!SHOTS) return;
    fs.mkdirSync(SHOTS, { recursive: true });
    await page.screenshot({ path: path.join(SHOTS, `${name}.jpg`), type: 'jpeg', quality: 55 });
  };
  const waitFor = async (label, fn, arg, ms = 15000) => {
    const t0 = Date.now();
    let last;
    while (Date.now() - t0 < ms) {
      try { last = await page.evaluate(fn, arg); } catch (err) { last = `ERR ${err.message}`; }
      if (last === true) return true;
      await sleep(120);
    }
    throw new Error(`${label}: not reached (last ${JSON.stringify(last)})`);
  };
  const has = (sel) => page.evaluate((s) => !!document.querySelector(s), sel);
  const setPause = (mode) => page.evaluate((m) => {
    const root = document.documentElement;
    for (const c of ['app-backgrounded', 'app-idle', 'app-hidden']) root.classList.remove(c);
    if (m === 'backgrounded') window.__TAURI__.event.emit('app:visibility', { backgrounded: true });
    else if (m) root.classList.add(`app-${m}`);
  }, mode).then(async () => {
    if (mode !== 'backgrounded') return;
    await sleep(60);
    if (!(await page.evaluate(() => document.documentElement.classList.contains('app-backgrounded')))) problems.push('shell app:visibility {backgrounded:true} did not set html.app-backgrounded');
  });
  // Script click: no pointerdown / keydown, so a stale pause class stays on (tray, hotkey or
  // socket triggered open). Real click: Playwright mouse (pointer events, drag script).
  const scriptClick = async (sel) => {
    const ok = await page.evaluate((s) => {
      const el = s.startsWith('xpath=')
        ? document.evaluate(s.slice(6), document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue
        : document.querySelector(s);
      if (!el) return false;
      el.click();
      return true;
    }, sel);
    if (!ok) throw new Error(`script click: no ${sel}`);
  };
  const realClick = async (sel) => { await page.locator(sel).first().click({ timeout: 8000 }); };
  const escape = async () => { await page.keyboard.press('Escape'); await sleep(250); };
  const pauseModes = [null, 'backgrounded', 'idle', 'hidden'];

  /**
   * One screen: `open(click)` opens it with the given click function and resolves when the
   * screen's marker is there; `close()` returns to the base state. Run once per pause mode.
   */
  const screen = async (name, { open, marker, close = escape, modes = pauseModes }) => {
    if (ONLY.length && !ONLY.includes(name)) return;
    for (const mode of modes) {
      const tag = `${name}${mode ? `[${mode}]` : ''}`;
      try {
        await setPause(mode);
        await sleep(80);
        await open(mode ? scriptClick : realClick, mode);
        await waitFor(`${tag} marker`, (s) => {
          if (!s.startsWith('text:')) return !!document.querySelector(s);
          const want = s.slice(5);
          return [...document.querySelectorAll('body *')].some((n) => n.childElementCount === 0 && n.textContent.trim() === want && n.getBoundingClientRect().width > 0);
        }, marker, 10000);
        await sleep(mode ? 700 : 500);
        const found = await page.evaluate(audit);
        // Opens and vanishes: the screen is still there a moment later.
        await sleep(400);
        const still = await page.evaluate((s) => {
          if (!s.startsWith('text:')) return !!document.querySelector(s);
          return [...document.querySelectorAll('body *')].some((n) => n.childElementCount === 0 && n.textContent.trim() === s.slice(5) && n.getBoundingClientRect().width > 0);
        }, marker);
        if (!still) found.push('opened, then vanished');
        await shot(tag.replace(/[^\w-]+/g, '_'));
        if (found.length) problems.push(`${tag}: ${found.slice(0, 6).join(' | ')}`);
        else log(`ok - ${tag}`);
      } catch (err) {
        problems.push(`${tag}: ${String(err && err.message || err).split('\n')[0]}`);
        await shot(`${tag.replace(/[^\w-]+/g, '_')}-error`).catch(() => {});
      }
      await setPause(null);
      try { await close(); } catch { /* next mode re-opens */ }
      await sleep(250);
    }
    covered.push(name);
  };

  try {
    await page.goto(`${ORIGIN}/index.html`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await waitFor('app shell', () => !!document.querySelector('.rail-btn') && !document.getElementById('boot-splash'), undefined, 40000);
    const base = await page.evaluate(audit);
    if (base.length) problems.push(`home: ${base.join(' | ')}`);
    else log('ok - home');
    await shot('home');
    if (DEBUG) log('rail', JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('.rail-btn')].map((n) => n.getAttribute('aria-label')))));

    if (process.env.DESCALL_E2E_EXPLORE) {
      for (const step of process.env.DESCALL_E2E_EXPLORE.split(';;')) {
        if (step.startsWith('click:')) await realClick(step.slice(6)).catch((e) => log('click fail', e.message.split('\n')[0]));
        else if (step.startsWith('rclick:')) await page.locator(step.slice(7)).first().click({ button: 'right' }).catch((e) => log('rclick fail', e.message.split('\n')[0]));
        else if (step.startsWith('hover:')) await page.locator(step.slice(6)).first().hover().catch(() => {});
        else if (step === 'esc') await escape();
        else if (step.startsWith('shot:')) await shot(step.slice(5));
        else if (step.startsWith('dump:')) log('dump', JSON.stringify(await page.evaluate((root) => [...document.querySelectorAll(`${root} button, ${root} [role=button], ${root} [role=menuitem], ${root} [role=tab]`)].filter((n) => n.getBoundingClientRect().width > 0).map((n) => `${n.className && String(n.className).slice(0, 40)}|${n.getAttribute('aria-label') || n.textContent.trim().slice(0, 20)}`), step.slice(5) || 'body')));
        else if (step.startsWith('eval:')) log('eval', JSON.stringify(await page.evaluate(step.slice(5)).catch((e) => e.message)));
        else if (step.startsWith('html:')) log('html', await page.evaluate((s) => (document.querySelector(s)?.outerHTML || 'none').slice(0, 3000), step.slice(5)));
        await sleep(700);
      }
    }

    // ---- chats: DM, composer pickers, message actions, viewer, profile ----
    const railTo = async (label) => { await page.locator(`.rail-btn[aria-label="${label}"]`).first().click({ timeout: 8000 }); await sleep(500); };
    const openDm = async () => { await railTo('Sohbetler'); await realClick('.dm-item >> text=Arkadaş 2'); await waitFor('dm', () => document.querySelectorAll('.message-bubble').length > 3); };
    const textEl = (t) => `xpath=//*[normalize-space(text())="${t}"]`;
    await openDm();
    await screen('dm', { open: async (click) => { await click('.dm-item.active'); }, marker: '.message-bubble', close: async () => {} });
    await screen('emoji-picker', { open: (click) => click('.composer-action-btn[aria-label="Emoji"]'), marker: 'text:Emojiler' });
    await screen('attach-menu', { open: (click) => click('.composer-action-btn[aria-label="Ek Ekle"]'), marker: '.attachment-item' });
    await screen('gif-picker', {
      open: async (click) => { await click('.composer-action-btn[aria-label="Ek Ekle"]'); await sleep(300); await click('.attachment-item:nth-child(3)'); },
      marker: 'input[placeholder*="GIF"], .gif-picker, [class*="gif-"]',
    });
    const hoverBubble = async () => { const b = page.locator('.message-bubble').nth(-3); await b.scrollIntoViewIfNeeded(); await b.hover(); await sleep(250); };
    await screen('reaction-picker', { open: async (click) => { await hoverBubble(); await click('.message-bubble .hover-bar-btn[aria-label="Tepki ver"]'); }, marker: '.reaction-picker, .message-inline-picker' });
    await screen('message-more-menu', { open: async (click) => { await hoverBubble(); await click('.message-bubble .hover-bar-btn[aria-label="Daha fazla"]'); }, marker: '.mhb-more [role="menuitem"]' });
    await screen('image-viewer', {
      open: async (click) => { const t = page.locator('.message-media-trigger').first(); await t.scrollIntoViewIfNeeded(); await t.hover(); await click('.message-media-trigger'); },
      marker: '.mv-close',
      close: async () => {
        await escape();
        // Escape closes the viewer even when the message's hover bar was up (the bubble's own
        // Escape handler swallowed the key that React bubbles out of the viewer's portal).
        for (let i = 0; i < 10 && await has('.mv-close'); i++) await sleep(150); // exit animation
        if (await has('.mv-close')) { problems.push('image-viewer: Escape did not close the viewer'); await realClick('.mv-close').catch(() => {}); }
      },
    });
    await screen('pinned', { open: (click) => click('.icon-btn[aria-label="Sabitlenmiş mesajlar"]'), marker: 'text:Sabitlenmiş mesajlar' });
    await screen('profile-card', { open: (click) => click('.header-avatar'), marker: '[role="dialog"]' });
    await screen('conv-more-menu', { open: async (click) => { await page.locator('.conv-group-wrap.is-active-row').first().hover(); await sleep(200); await click('.conv-group-wrap.is-active-row .conv-more-btn'); }, marker: '[role="menu"], [role="menuitem"]' });
    // Right-click menus (the shell's own contextmenu listener must not eat the app's menus).
    const rightClick = (sel) => async () => { await page.locator(sel).first().click({ button: 'right', timeout: 8000 }); };
    await screen('dm-row-context-menu', { open: rightClick('.conv-group-wrap.is-active-row .dm-item'), marker: '[role="menu"], [role="menuitem"]', modes: [null] });
    await screen('status-menu', { open: (click) => click('.uvp-avatar'), marker: '.status-picker-item' });
    await screen('announcements', { open: (click) => click('.icon-btn[aria-label="Duyurular"]'), marker: '[role="dialog"], [class*="ann-"]' });
    await screen('feedback', { open: (click) => click('.icon-btn[aria-label="Geri Bildirim Gönder"]'), marker: '[role="dialog"]' });
    await screen('new-chat', { open: (click) => click('.icon-btn[aria-label="Ekle"]'), marker: '[role="dialog"], [role="menu"]' });

    // Files: picked in the native dialog (the window loses focus to it: idle / blurred, and the
    // focus may not come back), pasted, or dragged in from Explorer.
    const PICK_MARK = '.composer-attach-preview, [data-testid="composer-upload"], .composer-upload-error, [class*="upload-error"]';
    await screen('upload-file', {
      open: async () => { await page.locator('input[type="file"][accept^="image/"]').first().setInputFiles({ name: 'foto.png', mimeType: 'image/png', buffer: PNG }); },
      marker: PICK_MARK,
      modes: [null, 'idle', 'backgrounded'],
    });
    await screen('paste-image', {
      open: async () => {
        await page.evaluate((b64) => {
          const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
          const dt = new DataTransfer();
          dt.items.add(new File([bin], 'yapistir.png', { type: 'image/png' }));
          const ta = document.querySelector('.chat-composer textarea, textarea');
          ta.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
        }, PNG.toString('base64'));
      },
      marker: PICK_MARK,
      modes: [null, 'idle'],
    });
    await screen('drag-drop-file', {
      open: async () => {
        await page.evaluate((b64) => {
          const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
          const dt = new DataTransfer();
          dt.items.add(new File([bin], 'surukle.png', { type: 'image/png' }));
          const target = document.querySelector('.message-bubble') || document.body;
          const r = target.getBoundingClientRect();
          const at = { clientX: r.left + 20, clientY: r.top + 10, bubbles: true, cancelable: true, dataTransfer: dt };
          target.dispatchEvent(new DragEvent('dragenter', at));
          target.dispatchEvent(new DragEvent('dragover', at));
          window.__dropLater = () => target.dispatchEvent(new DragEvent('drop', at));
        }, PNG.toString('base64'));
        await sleep(60);
        const overlay = await page.evaluate(() => { const o = document.querySelector('.chat-drop-overlay'); return o ? Number(getComputedStyle(o).opacity) : -1; });
        if (overlay < 0) problems.push('drag-drop-file: no drop overlay while dragging a file over the chat');
        await page.evaluate(() => window.__dropLater && window.__dropLater());
      },
      marker: PICK_MARK,
      modes: [null, 'idle'],
    });

    // Incoming message while the window is idle / restored without activation: the new row is painted.
    for (const mode of ['idle', 'backgrounded']) {
      await setPause(mode);
      b.peerSays(`Yeni mesaj ${mode}`);
      try {
        await waitFor('incoming', (t) => [...document.querySelectorAll('.message-bubble')].some((n) => n.textContent.includes(t)), `Yeni mesaj ${mode}`);
        await sleep(700);
        const vis = await page.evaluate((t) => { const n = [...document.querySelectorAll('.message-bubble')].reverse().find((x) => x.textContent.includes(t)); let o = 1; for (let e = n; e; e = e.parentElement) o *= Number(getComputedStyle(e).opacity); return o; }, `Yeni mesaj ${mode}`);
        const found = await page.evaluate(audit);
        if (vis < 0.9 || found.length) problems.push(`incoming-message[${mode}]: opacity ${vis.toFixed(2)} ${found.slice(0, 4).join(' | ')}`);
        else log(`ok - incoming-message[${mode}]`);
      } catch (err) { problems.push(`incoming-message[${mode}]: ${err.message}`); }
      await setPause(null);
    }
    covered.push('incoming-message');

    // Update toast from the shell while the window is idle or restored without activation
    // (no input): it must be painted, not frozen at the first frame of its entrance.
    if (!ONLY.length || ONLY.includes('update-toast')) {
      for (const mode of ['idle', 'backgrounded']) {
        try {
          await setPause(mode);
          await page.evaluate(() => window.__TAURI__.event.emit('update:ready', { version: '4.1.1', deferred: false }));
          await waitFor('update toast', () => !!document.querySelector('.eut-card'));
          await sleep(900);
          const found = await page.evaluate(audit);
          const op = await page.evaluate(() => { let o = 1; for (let e = document.querySelector('.eut-card'); e; e = e.parentElement) o *= Number(getComputedStyle(e).opacity); return o; });
          await shot(`update-toast_${mode}`);
          if (op < 0.9 || found.length) problems.push(`update-toast[${mode}]: opacity ${op.toFixed(2)} ${found.slice(0, 4).join(' | ')}`);
          else log(`ok - update-toast[${mode}]`);
        } catch (err) { problems.push(`update-toast[${mode}]: ${String(err.message).split('\n')[0]}`); }
        await setPause(null);
        await page.evaluate(() => window.__TAURI__.event.emit('update:error', { phase: 'download' }));
        await sleep(300);
        await realClick('.eut-x').catch(() => {});
        await sleep(400);
      }
      covered.push('update-toast');
    }

    // ---- rail pages ----
    for (const [name, label] of [['groups', 'Gruplar'], ['servers', 'Sunucular'], ['friends', 'Arkadaşlar'], ['activity', 'Aktivite'], ['calls', 'Aramalar']]) {
      await screen(name, { open: async (click) => { await click('.rail-btn[aria-label="Sohbetler"]'); await sleep(300); await click(`.rail-btn[aria-label="${label}"]`); }, marker: `.rail-btn.active[aria-label="${label}"]`, close: async () => {} });
    }
    await screen('add-menu', { open: (click) => click('.rail-btn[aria-label="Yeni Ekle"]'), marker: '[role="dialog"], [role="menu"]' });
    await railTo('Gruplar');
    await screen('group-chat', { open: (click) => click('.dm-item, .conv-row'), marker: '.chat-composer textarea, .chat-composer [contenteditable], textarea', close: async () => {} });
    await railTo('Sunucular');
    await screen('server', { open: (click) => click('.server-list-item'), marker: 'text:genel', close: async () => {}, modes: [null] });
    await screen('server-channel', { open: (click) => click(textEl('genel')), marker: 'text:#genel kanalına hoş geldin', close: async () => {} });
    await screen('server-menu', { open: (click) => click('.g-server-menu-btn'), marker: '[role="menu"], [role="dialog"], .g-server-sheet-id' });
    for (const [name, item] of [['server-settings', 'Sunucu Ayarları'], ['server-invite', 'Kişi davet et'], ['server-roles', 'Roller']]) {
      await screen(name, {
        open: async (click) => { await click('.g-server-menu-btn'); await sleep(400); await click(textEl(item)); },
        marker: '[role="dialog"]',
        close: async () => { await escape(); await escape(); },
        modes: [null, 'backgrounded'],
      });
    }
    await screen('channel-context-menu', { open: rightClick(textEl('genel')), marker: '[role="menu"], [role="menuitem"]', modes: [null] });
    await screen('members', { open: (click) => click('.icon-btn[aria-label="Üyeler"]'), marker: 'text:Arkadaş 3', close: async () => { await realClick('.icon-btn[aria-label="Üyeler"]').catch(() => {}); } , modes: [null] });
    await screen('voice-channel', { open: (click) => click(textEl('Sesli Sohbet')), marker: 'text:Sesli Sohbet', close: async () => {}, modes: [null, 'backgrounded'] });
    await screen('voice-join', {
      open: (click) => click(textEl('Sese Katıl')),
      marker: '.uvp-hang',
      close: async () => { await realClick('.uvp-hang').catch(() => {}); await sleep(600); },
      modes: [null, 'backgrounded'],
    });

    await screen('settings', {
      open: (click) => click('.rail-btn[aria-label="Kullanıcı Ayarları"]'),
      marker: '.s3-row[data-nav]',
    });
    // Every Settings page (shop, inventory, Descall+, desktop app ... included): opened by a
    // real click, then again by a script click under a stale app-backgrounded.
    await realClick('.rail-btn[aria-label="Kullanıcı Ayarları"]');
    await waitFor('settings rows', () => document.querySelectorAll('.s3-row[data-nav]').length > 5);
    const navs = await page.evaluate(() => [...document.querySelectorAll('.s3-row[data-nav]')].map((n) => n.getAttribute('data-nav')));
    for (const nav of navs) {
      if (ONLY.length && !ONLY.includes(`settings:${nav}`) && !ONLY.includes('settings-pages')) continue;
      for (const mode of [null, 'backgrounded']) {
        const tag = `settings:${nav}${mode ? `[${mode}]` : ''}`;
        try {
          if (mode) { await realClick(`.s3-row[data-nav="${navs[0] === nav ? navs[1] : navs[0]}"]`); await sleep(300); }
          await setPause(mode);
          await (mode ? scriptClick : realClick)(`.s3-row[data-nav="${nav}"]`);
          await sleep(1300);
          const found = await page.evaluate(audit);
          await shot(tag.replace(/[^\w-]+/g, '_'));
          if (found.length) problems.push(`${tag}: ${found.slice(0, 6).join(' | ')}`);
          else log(`ok - ${tag}`);
        } catch (err) { problems.push(`${tag}: ${String(err.message).split('\n')[0]}`); }
        await setPause(null);
      }
      covered.push(`settings:${nav}`);
    }
    // Market tabs switched while the window is backgrounded (tray / hotkey open, no input):
    // the fade-in cards of the new tab are painted.
    if (!ONLY.length || ONLY.includes('shop-tabs')) {
      await realClick('.s3-row[data-nav="shop"]');
      await waitFor('market', () => document.querySelectorAll('.s2-body .s2-card').length > 0);
      for (const mode of ['backgrounded', 'idle']) {
        try {
          await setPause(mode);
          await scriptClick('.s2-tabs [role=tab]:nth-child(2)');
          await sleep(500);
          await scriptClick('.s2-tabs [role=tab]:nth-child(1)');
          await waitFor('market cards', () => document.querySelectorAll('.s2-body .s2-card').length > 0);
          await sleep(1200);
          const p = await page.evaluate(() => { const els = [...document.querySelectorAll('.s2-body .s2-card, .s2-tiles .s2-tile')]; return { n: els.length, v: els.filter((n) => Number(getComputedStyle(n).opacity) > 0.9).length }; });
          const found = await page.evaluate(audit);
          await shot(`shop-tabs_${mode}`);
          if (p.v !== p.n || found.length) problems.push(`shop-tabs[${mode}]: ${p.v}/${p.n} cards painted ${found.slice(0, 4).join(' | ')}`);
          else log(`ok - shop-tabs[${mode}] (${p.v}/${p.n})`);
        } catch (err) { problems.push(`shop-tabs[${mode}]: ${String(err.message).split('\n')[0]}`); }
        await setPause(null);
      }
      covered.push('shop-tabs');
    }
    await escape();
    await escape();

    // ---- signed out: login and signup ----
    if (!ONLY.length || ONLY.includes('auth')) {
      await ctx.close();
      ctx = await makeContext(false);
      page = await ctx.newPage();
      page.on('pageerror', (e) => errors.push(String(e).slice(0, 300)));
      await page.goto(`${ORIGIN}/index.html`, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch((e) => problems.push(`auth goto: ${e.message}`));
      for (const [name, prep] of [['login', null], ['signup', async (click) => click('xpath=(//*[self::button or @role="tab" or self::a][normalize-space(.)="Kayıt ol" or normalize-space(.)="Kayıt Ol"])[1]')]]) {
        for (const mode of [null, 'backgrounded', 'idle']) {
          const tag = `${name}${mode ? `[${mode}]` : ''}`;
          try {
            await waitFor('auth form', () => !!document.querySelector('input[type="password"], input[type="text"]'), undefined, 20000);
            await setPause(mode);
            if (prep) await prep(mode ? scriptClick : realClick).catch((e) => { throw new Error(`open ${name}: ${e.message}`); });
            await sleep(900);
            const found = await page.evaluate(audit);
            await shot(tag.replace(/[^\w-]+/g, '_'));
            if (found.length) problems.push(`${tag}: ${found.slice(0, 6).join(' | ')}`);
            else log(`ok - ${tag}`);
          } catch (err) { problems.push(`${tag}: ${String(err.message).split('\n')[0]}`); }
          await setPause(null);
        }
        covered.push(name);
      }
    }
  } catch (err) {
    problems.push(String(err && err.message || err));
    await shot('failure').catch(() => {});
  }
  const csp = await page.evaluate(() => window.__cspViolations).catch(() => []);
  if (csp.length) problems.push(`CSP violations: ${csp.slice(0, 5).join(', ')}`);
  if (errors.length) problems.push(`page errors: ${errors.slice(0, 3).join(' | ')}`);
  await browser.close();
  b.server.close();
  log(`screens covered: ${covered.join(', ')}`);
  if (problems.length) {
    log(`FAIL\n  - ${problems.join('\n  - ')}`);
    process.exit(1);
  }
  log('OK');
  process.exit(0);
}

main().catch((err) => {
  log(`FAIL ${err && err.stack || err}`);
  process.exit(1);
});
