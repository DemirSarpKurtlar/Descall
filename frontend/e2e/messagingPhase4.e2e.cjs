'use strict';

/**
 * Messaging phase 4 e2e (desktop web and the iPhone glass layout).
 *
 * Same harness as messaging.e2e.cjs: the built dist/ plus an in-process mock
 * API + Socket.IO server on 127.0.0.1; every other URL is aborted, nothing
 * reaches production. A mock user with two friends (Ayşe, Mert) and a group.
 * Checks, per device:
 *   - drafts: text typed in one chat stays there after switching chats and a
 *     reload, the list shows "Taslak:", sending clears it;
 *   - jump to first unread (pill, Shift+PageUp);
 *   - forwarding (menu "İlet", target sheet, the server gets a forwarded send);
 *   - link previews (card from the server, never a client fetch of the site);
 *   - "Görüldü" under my last read message;
 *   - keyboard shortcuts (Ctrl+/ help sheet, Alt+Arrow chat switch);
 *   - notification options sheet;
 *   - scheduled sending (sheet, server list, cancel);
 *   - Descall stickers and logo emoji.
 * With DESCALL_E2E_SHOTS set it saves the screenshots (1280x800 @2x dark on
 * desktop) used in docs/design/messaging-phase4/.
 *
 * Run from frontend/ against a build that points at the mock:
 *   VITE_API_BASE_URL=http://127.0.0.1:5361 VITE_SOCKET_URL=http://127.0.0.1:5361 \
 *     npx vite build --outDir dist-e2e
 *   node e2e/messagingPhase4.e2e.cjs
 * Env: PLAYWRIGHT_CORE, CHROME_PATH, DESCALL_E2E_SHOTS, DESCALL_E2E_DEVICES=desktop,iphone,
 *      DESCALL_E2E_PORT (must match the build's API URL).
 * Prints "[e2e-p4] OK" and exits 0, or "[e2e-p4] FAIL <reason>" and exits 1.
 */

const fs = require('fs');
const path = require('path');
const http = require('http');

const pw = require(process.env.PLAYWRIGHT_CORE || 'playwright-core');
const { Server } = require(require.resolve('socket.io', { paths: [path.join(__dirname, '../backend/node_modules'), __dirname] }));

const DIST = process.env.DESCALL_E2E_DIST || path.join(__dirname, '../dist-e2e');
const PORT = Number(process.env.DESCALL_E2E_PORT || 5361);
const SHOTS = process.env.DESCALL_E2E_SHOTS || '';
const DEVICES = (process.env.DESCALL_E2E_DEVICES || 'desktop,iphone').split(',').map((s) => s.trim()).filter(Boolean);
const CHROME = process.env.CHROME_PATH || '/usr/bin/google-chrome';
const ONLY = (process.env.DESCALL_E2E_ONLY || '').split(',').map((s) => s.trim()).filter(Boolean);
const log = (...a) => console.log('[e2e-p4]', ...a);
// 152px gradient PNG standing in for a site's og:image (the server returns images as data: URIs).
const PREVIEW_IMAGE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAJgAAACYCAIAAACXoLd2AAAD0klEQVR42u3RZ1YVQRSF0R4mKjk9cpZoAEQUEUEFRJ0giIiI/pfbVV1d9WZw7vrW2jPYVc/mv56Nv8mj0uMH69GTUm+wZvrMfdKfrN4PlAYzQ08Lw+ZPMPJgpTWaGQuWo/FMJ7rrLJmJzGRu8W4qM12aWQh+P5gtzT2Yj+ZLC8GcWSzcLiWzt8ullczTmcJqZm3m19p0az2z0ahYdLC4MZVFsqi72EayKL24GSJZVF+0SBYdLHZHsii6WESyqLu4lSJZlF6MkSyqL1okiw4W60gW9Re3JptIFqUXn03eVCw6WLRIFh0sdkeyKLpYRLKou/g8RbIovRgjWVRftEgWHSw2kSyKL9aRLOovvpioI1lUX7RIFh0shkgW5ReLSBZ1F1+mSBalF2Mki+qLFsmig8UskkXlxSaSRfHFbYtkUX9xu3NTsehgsTuSRdHFIpJF3cWdFMmi9OJO52fFooNFi2TRwWIRyaLuYhvJovTibohkUX3RIll0sLg7XkayKLpYRLKou/gqRbIovRgjWVRftEgWHSyGSBblF9tIFqUX90Iki+qLFsmig8U6kkX9xb2xLJJF3cXXKZJF6cUYyaL6okWy6GCxiGRRd7GNZFF6cT9Esqi+aJEsOljcH7uuWHSwWEeyqL/4ZrSJZFF6MUayqL5okSw6WCwiWdRdbCNZlF58GyJZVF+0SBYdLKZIFrUXQySL8osHFsmi/uLBSB3JovqiRbLoYLGIZFF3sY1kUXrxXYhkUX3RIll0sFhGsii7mEWyqLx4GCNZFF+sI1nUXzwcvq5YdLB4OPyjYtHBYhvJovTi+xDJovqiRbLoYLE7kkXRxSKSRd3FoxTJovRijGRRfdEiWXSweDQUI1nUXgyRLMovfgiRLKovWiSLDha7I1kUXSwiWdRdPE6RLEovxkgW1RctkkUHi3Uki/qLx4NNJIvSiychkkX1RYtk0cFidySLoosng1cViw4WP6ZIFqUXYySL6osWyaKDxSaSRfHFOpJF/cVPA3Uki+qLFsmig8WuSBZVF/NIFoUXPzeRLGovhkgW5RctkkUHi1kki8qLTSSL4ounFsmi/uJp/1XFooPF7kgWRReLSBZ1F89SJIvSizGSRfVFi2TRwWIRyaLu4ln/ZcWig8XzEMmi+qJFsuhg8byvjGRRdLGIZFF38UuKZFF6MUayqL5okSw6WCwiWdRdbCNZlF68CJEsqi9aJIsOFutIFvUXL3qzSBZ1F7+mSBalF2Mki+qLFsmig8UikkXdxTaSRenFbyGSRfVFi2TRwWIWyaLyYhPJovji997L/9V5JUzlRZauAAAAAElFTkSuQmCC';

const ME = { id: '00000000-0000-4000-8000-0000000000e1', username: 'demir', displayName: 'Demir', display_name: 'Demir', birthDate: '2000-05-05', emailVerified: true, language: 'tr', blockedUsers: [], status: 'online' };
const AYSE = { id: '00000000-0000-4000-8000-0000000000e2', username: 'ayse', displayName: 'Ayşe', display_name: 'Ayşe', status: 'online', avatarUrl: null, createdAt: '2025-02-22T10:00:00.000Z' };
const MERT = { id: '00000000-0000-4000-8000-0000000000e3', username: 'mert', displayName: 'Mert', display_name: 'Mert', status: 'online', avatarUrl: null, createdAt: '2025-03-01T10:00:00.000Z' };
const GROUP_ID = '00000000-0000-4000-8000-0000000000a1';
const sender = (u) => ({ id: u.id, username: u.username, displayName: u.displayName, display_name: u.displayName, avatarUrl: null });
const iso = (minAgo) => new Date(Date.now() - minAgo * 60000).toISOString();

let seq = 0;
const dm = (from, to, text, minAgo, extra = {}) => ({ id: `p4-m-${String(++seq).padStart(3, '0')}`, from: sender(from), to: { id: to.id }, text, mediaUrl: null, mediaType: null, timestamp: iso(minAgo), deliveredAt: iso(minAgo), readAt: null, editHistory: [], reactions: [], ...extra });
const AYSE_LINES = ['Bu akşam oyun gecesine geliyor musun?', 'Tabii, saat kaçta?', "21:00'de, önce sesli kanalda toplanırız.", 'Tamam', 'Mert ve Zeynep de gelecek.', 'Süper!'];
const MERT_LINES = ['Turnuva kayıtları açıldı', 'Takım adı ne olsun?', 'Bence "Gece Kuşları"', 'Olur, yazıyorum', 'Saat 20:00 gibi başlarız', 'Kurallara bir bak', 'Tamam baktım', 'Harita seçimi sende', 'Kuzey vadisi olsun', 'Anlaştık'];
function freshState() {
  seq = 0;
  const ayse = [];
  for (let i = 0; i < 24; i += 1) {
    const mine = i % 3 === 1;
    ayse.push(dm(mine ? ME : AYSE, mine ? AYSE : ME, AYSE_LINES[i % AYSE_LINES.length], 200 - i * 6));
  }
  // My last two messages were read by Ayşe (Görüldü).
  ayse.push(dm(ME, AYSE, 'Linki atıyorum: https://example.com/turnuva', 12, { readAt: iso(10) }));
  ayse.push(dm(ME, AYSE, 'Bir bakar mısın?', 11, { readAt: iso(10) }));
  const mert = [];
  for (let i = 0; i < 40; i += 1) mert.push(dm(i % 4 === 0 ? ME : MERT, i % 4 === 0 ? MERT : ME, MERT_LINES[i % MERT_LINES.length], 400 - i * 8));
  const group = [];
  for (let i = 0; i < 12; i += 1) {
    const who = [AYSE, MERT, ME][i % 3];
    group.push({ id: `p4-g-${String(i + 1).padStart(3, '0')}`, group_id: GROUP_ID, sender_id: who.id, sender: sender(who), content: ['Cumartesi pikniğe kim geliyor?', 'Ben varım', 'Ben de', 'Yanımda mangal var', 'Harika', 'Saat 11 uygun mu?'][i % 6], created_at: iso(300 - i * 10), reactions: [] });
  }
  return { ayse, mert, group, events: [], scheduled: [], previewHits: [], groupReads: [{ userId: AYSE.id, at: iso(5) }, { userId: MERT.id, at: iso(250) }] };
}
let state = freshState();
const GROUP = () => ({ id: GROUP_ID, name: 'Hafta Sonu Ekibi', ownerId: ME.id, owner_id: ME.id, memberCount: 3, members: [sender(ME), sender(AYSE), sender(MERT)].map((u) => ({ ...u, role: u.id === ME.id ? 'owner' : 'member' })), memberIds: [ME.id, AYSE.id, MERT.id], lastMessage: 'Ayşe: Saat 11 uygun mu?', lastActivity: iso(190) });

// ---- mock server ------------------------------------------------------------------------
function api(p, method, body, query) {
  if (/\/auth\/me$/.test(p)) return { user: ME };
  if (/\/friends\/mutual\//.test(p)) return { mutualFriends: [], mutualServers: [] };
  if (/\/promo\/popup$/.test(p)) return { popup: null };
  if (/\/dm\/[^/]+\/messages$/.test(p)) {
    const peer = p.split('/').slice(-2)[0];
    return { withUserId: peer, messages: peer === MERT.id ? state.mert : state.ayse, hasMore: false };
  }
  if (/\/dm\/previews$/.test(p)) return { dmPreviewsByPeer: { [AYSE.id]: 'Bir bakar mısın?', [MERT.id]: 'Anlaştık' }, dmLastActivityByPeer: { [AYSE.id]: iso(11), [MERT.id]: iso(88) }, previews: {} };
  if (/\/groups\/my$/.test(p)) return { groups: [GROUP()] };
  if (/\/groups\/[^/]+\/messages$/.test(p)) return { messages: state.group, hasMore: false };
  if (/\/api\/read-receipts\/groups\/[^/]+$/.test(p)) return { reads: state.groupReads };
  if (/\/api\/read-receipts$/.test(p)) { if (method === 'PUT') state.events.push({ kind: 'receipts', ...body }); return { enabled: method === 'PUT' ? body.enabled : true, ok: true }; }
  if (/\/api\/link-preview$/.test(p)) {
    state.previewHits.push(query.get('url'));
    return { ok: true, preview: { url: query.get('url'), siteName: 'example.com', title: 'Descall Turnuvası 2026', description: 'Kayıtlar açık: takımını kur, haritanı seç, cumartesi 20:00 başlıyoruz.', image: PREVIEW_IMAGE } };
  }
  if (/\/api\/scheduled-messages(\/[^/]+)?$/.test(p)) {
    const id = p.split('/').pop();
    if (method === 'GET') return { items: state.scheduled };
    if (method === 'POST') {
      const row = { id: `sch-${state.scheduled.length + 1}`, status: 'pending', ...body, createdAt: new Date().toISOString() };
      state.scheduled.push(row);
      state.events.push({ kind: 'schedule', ...body });
      return { ok: true, item: row };
    }
    if (method === 'PATCH') {
      const row = state.scheduled.find((r) => r.id === id);
      if (row) Object.assign(row, body);
      state.events.push({ kind: 'schedule-edit', id, ...body });
      return { ok: true, item: row };
    }
    if (method === 'DELETE') {
      state.scheduled = state.scheduled.filter((r) => r.id !== id);
      state.events.push({ kind: 'schedule-cancel', id });
      return { ok: true };
    }
  }
  if (/\/api\/notify-prefs/.test(p)) {
    if (method !== 'GET') state.events.push({ kind: 'notify-pref', ...body });
    return { ok: true, prefs: [] };
  }
  if (/\/friends(\/list)?$/.test(p)) return { friends: [AYSE, MERT] };
  if (/\/users\/[^/]+$/.test(p) || /profile/.test(p)) return { user: AYSE, ...AYSE };
  const last = p.split('/').filter(Boolean).pop() || 'items';
  const out = { items: [], friends: [], requests: [], servers: [], groups: [], conversations: [], messages: [], notifications: [], prefs: {} };
  out[last] = Array.isArray(out[last]) ? out[last] : [];
  return out;
}
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain', '.mp3': 'audio/mpeg', '.wav': 'audio/wav' };
const API_RE = /^\/(api|auth|friends|groups|servers|calls|media|dm|reports|reactions|admin|health|maintenance|users|notifications|activity|analytics|store|shop|push|me|settings|blocks|presence)(\/|$)/;
function serve(req, res) {
  const url = new URL(req.url, 'http://127.0.0.1');
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('access-control-allow-headers', '*');
  res.setHeader('access-control-allow-methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  const file = path.join(DIST, decodeURIComponent(url.pathname));
  const accept = String(req.headers.accept || '');
  if (url.pathname !== '/' && file.startsWith(DIST) && fs.existsSync(file) && fs.statSync(file).isFile()) {
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
    return fs.createReadStream(file).pipe(res);
  }
  if (API_RE.test(url.pathname) && !accept.startsWith('text/html')) {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      let body = {};
      try { body = raw ? JSON.parse(raw) : {}; } catch { body = {}; }
      if (process.env.DESCALL_E2E_DEBUG) log('api', req.method, url.pathname);
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(api(url.pathname, req.method, body, url.searchParams)));
    });
    return undefined;
  }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  return fs.createReadStream(path.join(DIST, 'index.html')).pipe(res);
}
const sockets = new Set();
function startServer() {
  const server = http.createServer(serve);
  const io = new Server(server, { cors: { origin: '*' } });
  io.on('connection', (socket) => {
    sockets.add(socket);
    socket.on('disconnect', () => sockets.delete(socket));
    if (process.env.DESCALL_E2E_DEBUG) socket.onAny((ev, p) => log('sock<-', ev, JSON.stringify(p || {}).slice(0, 160)));
    socket.emit('connected', { user: ME, message: 'ok' });
    socket.emit('friend:list', [
      { ...AYSE, lastMessage: 'Bir bakar mısın?', lastActivity: iso(11) },
      { ...MERT, lastMessage: 'Anlaştık', lastActivity: iso(88) },
    ]);
    socket.emit('friend:requests', []);
    socket.emit('users:update', [sender(ME), sender(AYSE), sender(MERT)].map((u) => ({ ...u, status: 'online' })));
    // Mert has 12 unread messages (jump to first unread).
    setTimeout(() => socket.emit('dm:unread:sync', { peerId: MERT.id, count: 12 }), 400);
    socket.on('app:ping', (ack) => { if (typeof ack === 'function') ack(Date.now()); });
    socket.onAny((ev, p) => { if (/^(dm:send|group:message|server:channel:message|group:mark_read|dm:mark_read)$/.test(ev)) state.events.push({ kind: ev, ...(p || {}) }); });
    socket.on('dm:send', (p = {}) => {
      const peer = p.toUserId === MERT.id ? MERT : AYSE;
      const m = { ...dm(ME, peer, p.text || '', 0), tempId: p.tempId, convWith: peer.id, replyTo: p.forwarded ? { forwarded: true } : p.replyTo || null };
      (peer === MERT ? state.mert : state.ayse).push(m);
      socket.emit('dm:message', m);
    });
    socket.on('group:message', (p = {}) => {
      const row = { id: `p4-g-${Date.now()}`, group_id: GROUP_ID, sender_id: ME.id, sender: sender(ME), content: p.content || '', created_at: new Date().toISOString(), reply_to: p.forwarded ? { forwarded: true } : p.replyTo || null };
      state.group.push(row);
      socket.emit('group:message', { groupId: GROUP_ID, tempId: p.tempId, message: row });
    });
  });
  return new Promise((resolve) => server.listen(PORT, '127.0.0.1', () => resolve({ server, io, port: server.address().port })));
}

// ---- devices ----------------------------------------------------------------------------
const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const DEV = {
  // The owner's screenshot size: 1280x800 @2x, dark.
  desktop: { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2, isMobile: false, hasTouch: false, touch: false },
  iphone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: IPHONE_UA, touch: true },
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(page, label, fn, arg, timeoutMs = 15000) {
  const t0 = Date.now();
  let last;
  while (Date.now() - t0 < timeoutMs) {
    try { last = await page.evaluate(fn, arg); } catch (err) { last = `ERR ${err.message}`; }
    if (last && last.ok) return last;
    await sleep(120);
  }
  throw new Error(`${label}: not reached (last ${JSON.stringify(last)})`);
}
async function shot(page, name) {
  if (!SHOTS) return;
  fs.mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`) });
}
const want = (name) => !ONLY.length || ONLY.includes(name);
// The browser-notification banner is not part of what is tested: close it (its X) for clean shots.
async function dismissBanner(page) {
  await page.evaluate(() => { const b = document.querySelector('.app-notif-banner'); const btns = b ? b.querySelectorAll('button') : []; if (btns.length) btns[btns.length - 1].click(); });
  await sleep(300);
}

// Opens a conversation from the sidebar list by its visible name.
async function openChat(page, name, minBubbles = 5) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    // Groups live in their own list: switch lists through the nav (rail / tab bar).
    await page.evaluate((name) => {
      const inList = [...document.querySelectorAll('.dm-name, .group-name')].some((e) => e.textContent.trim() === name && e.getBoundingClientRect().width > 0);
      if (inList) return;
      const want = name === 'Hafta Sonu Ekibi' ? 'Gruplar' : 'Sohbetler';
      const nav = [...document.querySelectorAll('button, a, [role="tab"]')].find((b) => (b.getAttribute('aria-label') || b.textContent || '').trim() === want && b.getBoundingClientRect().width > 0);
      if (nav) nav.click();
      else {
        const back = document.querySelector('[data-mobile-back="1"]');
        if (back) back.click();
      }
    }, name);
    await sleep(500);
    const clicked = await page.evaluate((name) => {
      const el = [...document.querySelectorAll('.dm-name, .group-name')].find((e) => e.textContent.trim() === name && e.getBoundingClientRect().width > 0);
      if (!el) return false;
      (el.closest('button, [role="button"], .dm-item, .group-item') || el).click();
      return true;
    }, name);
    if (clicked) {
      const ok = await waitFor(page, `open ${name}`, ([n, min]) => {
        const title = document.querySelector('.panel-header h1, .panel-header .header-title, .panel-header');
        const bs = document.querySelectorAll('.message-bubble[data-message-id]');
        return { ok: bs.length >= min && !!title && title.textContent.includes(n) };
      }, [name, minBubbles], 5000).then(() => true, () => false);
      if (ok) { await sleep(500); return; }
    }
    await sleep(600);
  }
  throw new Error(`could not open ${name}`);
}
const composerValue = (page) => page.evaluate(() => (document.querySelector('.composer-container textarea') || {}).value || '');
async function typeInComposer(page, text) {
  await page.click('.composer-container textarea');
  await page.keyboard.type(text, { delay: 5 });
}
const rowPreview = (page, name) => page.evaluate((name) => {
  const el = [...document.querySelectorAll('.dm-name, .group-name')].find((e) => e.textContent.trim() === name);
  const row = el && el.closest('.conv-row-body, .dm-info, .group-info');
  const p = row && row.querySelector('.dm-preview');
  return p ? p.textContent.trim() : null;
}, name);

// ---- checks -----------------------------------------------------------------------------
async function runDevice(browser, base, dev) {
  state = freshState();
  const d = DEV[dev];
  const ctx = await browser.newContext({ viewport: d.viewport, deviceScaleFactor: d.deviceScaleFactor, isMobile: d.isMobile, hasTouch: d.hasTouch, ...(d.userAgent ? { userAgent: d.userAgent } : {}), locale: 'tr-TR', timezoneId: 'Europe/Istanbul', colorScheme: 'dark', reducedMotion: 'reduce' });
  const outside = [];
  await ctx.route('**/*', (r) => {
    const u = r.request().url();
    if (/^(data|blob):/.test(u) || u.startsWith(base)) return r.continue();
    outside.push(u);
    return r.abort();
  });
  await ctx.addInitScript(([api, me]) => {
    window.__DESCALL_API_URL__ = api; window.__DESCALL_SOCKET_URL__ = api;
    try { Object.defineProperty(Navigator.prototype, 'hardwareConcurrency', { get: () => 8 }); } catch { /* ignore */ }
    if (!sessionStorage.getItem('p4-init')) {
      sessionStorage.setItem('p4-init', '1');
      localStorage.setItem('descall_language', 'tr');
      localStorage.setItem('descall:ios-pwa-install-dismissed', '1');
      localStorage.setItem('descall:cookie_consent_v1', JSON.stringify({ choice: 'rejected', at: new Date().toISOString() }));
      localStorage.setItem('descall_token', 'e2e.fake.token');
      localStorage.setItem('descall_user', JSON.stringify(me));
    }
  }, [base, ME]);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 300)));
  const problems = [];
  const check = (cond, msg) => { if (!cond) problems.push(`${dev}: ${msg}`); else log(`${dev}: ok - ${msg}`); };
  const P = `${dev === 'desktop' ? '' : `${dev}-`}`;

  try {
    await page.goto(base + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await waitFor(page, `${dev} chat list`, () => ({ ok: [...document.querySelectorAll('.dm-name')].some((e) => e.textContent.trim() === 'Ayşe' && e.getBoundingClientRect().width > 0) }), null, 30000);
    await dismissBanner(page);

    // --- jump to the first unread ---
    if (want('unread')) {
      // Mert has 12 unread (dm:unread:sync on connect); the chat opens at the newest message.
      await waitFor(page, 'Mert unread badge', () => {
        const el = [...document.querySelectorAll('.dm-name')].find((e) => e.textContent.trim() === 'Mert');
        const row = el && el.closest('.conv-row-body, .dm-info');
        return { ok: !!row && /12/.test(row.textContent) };
      }, null, 8000).catch(() => null);
      await openChat(page, 'Mert');
      const pill = await waitFor(page, 'unread pill', () => {
        const p = document.querySelector('.msg-unread-pill');
        const r = p && p.getBoundingClientRect();
        const hit = r && document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        const hb = (document.querySelector('.panel-header') || { getBoundingClientRect: () => ({ bottom: 0 }) }).getBoundingClientRect().bottom;
        return { ok: !!p && r.width > 0 && !!hit && p.contains(hit) && r.top >= hb - 1 && r.top <= hb + 40, text: p && p.textContent, top: r && Math.round(r.top), hb: Math.round(hb), op: p && (() => { const o = [...document.querySelectorAll('.g-edge-top, .chat-top-chrome, .chat-scroll-edge')].map((x) => `${x.className}:${Math.round(x.getBoundingClientRect().top)}-${Math.round(x.getBoundingClientRect().bottom)} z${getComputedStyle(x).zIndex}`); for (let e = p; e && o.length < 6; e = e.parentElement) { const cs = getComputedStyle(e); o.push(`${e.className.toString().slice(0, 20)}:${cs.opacity}:${cs.visibility}:${cs.transform.slice(0, 20)}`); } return o.join(' | '); })() };
      }, null, 6000).catch((e) => ({ ok: false, why: e.message }));
      check(pill.ok && /12 yeni mesaj/.test(pill.text || ''), `the "12 yeni mesaj" pill shows just under the header, not covered (${pill.text || pill.why} top ${pill.top} header ${pill.hb}) ${process.env.DESCALL_E2E_DEBUG ? pill.op : ''}`);
      await shot(page, `${P}02-unread-pill`);
      if (pill.ok) {
        if (dev === 'desktop') await page.click('.msg-unread-jump');
        else await page.tap('.msg-unread-jump');
        const at = await waitFor(page, 'separator in view', () => {
          const sep = document.querySelector('.message-unread-sep');
          const head = document.querySelector('.panel-header');
          if (!sep) return { ok: false };
          const r = sep.getBoundingClientRect();
          const hb = head ? head.getBoundingClientRect().bottom : 0;
          return { ok: r.top >= hb - 2 && r.bottom < innerHeight * 0.6, top: Math.round(r.top), hb: Math.round(hb) };
        }, null, 4000).catch((e) => ({ ok: false, why: e.message }));
        check(at.ok, `the pill scrolls the "Yeni mesajlar" separator under the header (${JSON.stringify(at)})`);
        await sleep(400);
        check(await page.evaluate(() => !document.querySelector('.msg-unread-pill')), 'the pill goes away after the jump');
        await shot(page, `${P}03-unread-jumped`);
      }
    }
    // --- drafts ---
    if (want('drafts') && dev === 'desktop') {
      await openChat(page, 'Ayşe');
      await typeInComposer(page, 'Yarın 9da buluşalım mı?');
      await openChat(page, 'Mert');
      check((await composerValue(page)) === '', 'another chat starts with its own (empty) composer');
      const pv = await rowPreview(page, 'Ayşe');
      check(/^Taslak:\s*Yarın 9da buluşalım mı\?/.test(pv || ''), `the list shows the draft (${pv})`);
      await shot(page, `${P}01-draft-list`);
      await openChat(page, 'Ayşe');
      check((await composerValue(page)) === 'Yarın 9da buluşalım mı?', 'coming back restores the draft');
      await page.reload({ waitUntil: 'domcontentloaded' });
      await waitFor(page, 'list after reload', () => ({ ok: [...document.querySelectorAll('.dm-name')].some((e) => e.textContent.trim() === 'Ayşe') }), null, 30000);
      await dismissBanner(page);
      await openChat(page, 'Ayşe');
      check((await composerValue(page)) === 'Yarın 9da buluşalım mı?', 'the draft survives a reload');
      await page.click('.composer-container textarea');
      await page.keyboard.press('Enter');
      await sleep(600);
      check(state.events.some((e) => e.kind === 'dm:send' && e.text === 'Yarın 9da buluşalım mı?'), 'Enter sends the draft');
      await openChat(page, 'Mert');
      const after = await rowPreview(page, 'Ayşe');
      check(!/Taslak/.test(after || ''), `sending clears the draft (${after})`);
    }
    // --- forwarding ---
    if (want('forward')) {
      await openChat(page, 'Ayşe');
      const target = [...state.ayse].reverse().find((m) => m.from.id === AYSE.id && m.text === 'Mert ve Zeynep de gelecek.') || [...state.ayse].reverse().find((m) => m.from.id === AYSE.id);
      const box = await page.evaluate((id) => {
        const b = [...document.querySelectorAll('.message-bubble[data-message-id]')].reverse().find((n) => n.getAttribute('data-message-id') === id);
        if (!b) return null;
        b.scrollIntoView({ block: 'center' });
        const r = b.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      }, target.id);
      if (!box) throw new Error('forward: bubble not found');
      await sleep(300);
      if (dev === 'desktop') {
        await page.mouse.move(box.x, box.y);
        await sleep(350);
        await page.click('.message-hover-bar [aria-label="Diğer"], .message-hover-bar [aria-haspopup="menu"]');
        await sleep(250);
      } else {
        const cdp = await ctx.newCDPSession(page);
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x, y: box.y, id: 1 }] });
        await sleep(650);
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await sleep(600);
      }
      const item = await waitFor(page, 'İlet item', () => {
        const b = document.querySelector('[data-testid="menu-forward"]');
        return { ok: !!b && b.getBoundingClientRect().width > 0, text: b && b.textContent };
      }, null, 4000).catch(() => ({ ok: false }));
      check(item.ok && /İlet/.test(item.text || ''), `the message menu offers "İlet" (${item.text})`);
      await shot(page, `${P}04-forward-menu`);
      await page.click('[data-testid="menu-forward"]');
      await waitFor(page, 'forward sheet', () => ({ ok: !!document.querySelector('[data-testid="forward-sheet"] [data-testid="forward-row"]') }), null, 5000);
      await sleep(500);
      const pick = (name) => page.evaluate((name) => {
        const r = [...document.querySelectorAll('[data-testid="forward-row"]')].find((x) => x.textContent.includes(name));
        if (r) r.click();
        return !!r;
      }, name);
      check(await pick('Mert'), 'Mert is a target');
      check(await pick('Hafta Sonu Ekibi'), 'the group is a target');
      await page.fill('[data-testid="forward-sheet"] .gs-field input', 'Buna bak');
      await sleep(250);
      await shot(page, `${P}05-forward-sheet`);
      const label = await page.evaluate(() => document.querySelector('[data-testid="forward-send"]').textContent.trim());
      check(/2 sohbete gönder/.test(label), `send button counts the targets (${label})`);
      const before = state.events.length;
      await page.click('[data-testid="forward-send"]');
      await sleep(1600);
      const sent = state.events.slice(before);
      const dmFwd = sent.find((e) => e.kind === 'dm:send' && e.toUserId === MERT.id && e.forwarded === true);
      const grFwd = sent.find((e) => e.kind === 'group:message' && e.groupId === GROUP_ID && e.forwarded === true);
      check(dmFwd && dmFwd.text === target.text && !dmFwd.replyTo, 'Mert gets dm:send { forwarded: true } with the original text, no quote');
      check(grFwd && grFwd.content === target.text, 'the group gets group:message { forwarded: true }');
      check(sent.some((e) => e.kind === 'dm:send' && e.toUserId === MERT.id && e.text === 'Buna bak' && !e.forwarded), 'the note follows as a normal message');
      check(await page.evaluate(() => !document.querySelector('[data-testid="forward-sheet"]')), 'the sheet closes after sending');
      await openChat(page, 'Mert');
      const fl = await waitFor(page, 'İletildi label', () => {
        const el = document.querySelector('[data-testid="message-forwarded"]');
        const b = el && el.closest('.message-bubble');
        return { ok: !!el, text: el && el.textContent, quote: !!(b && b.querySelector('.message-reply-quote')) };
      }, null, 5000).catch(() => ({ ok: false }));
      check(fl.ok && /İletildi/.test(fl.text) && !fl.quote, `the forwarded copy shows "İletildi" and no quote (${fl.text})`);
      await shot(page, `${P}06-forwarded`);
    }
    // --- link previews ---
    if (want('preview')) {
      await openChat(page, 'Ayşe');
      const card = await waitFor(page, 'link preview card', () => {
        const c = document.querySelector('[data-testid="link-preview"]');
        if (!c) return { ok: false };
        c.scrollIntoView({ block: 'center' });
        const img = c.querySelector('img');
        return { ok: true, text: c.textContent, href: c.getAttribute('href'), img: img ? img.getAttribute('src').slice(0, 22) : null, target: c.getAttribute('target'), rel: c.getAttribute('rel') };
      }, null, 8000).catch(() => ({ ok: false }));
      check(card.ok && /Descall Turnuvası 2026/.test(card.text) && /Kayıtlar açık/.test(card.text), `the message shows a preview card (${card.text})`);
      check(card.href === 'https://example.com/turnuva' && card.target === '_blank' && /noopener/.test(card.rel || ''), 'the card opens the link in a new tab (noopener)');
      check(card.img === 'data:image/png;base64,', `the picture is an inline data: URI (${card.img})`);
      check(state.previewHits.includes('https://example.com/turnuva'), 'the preview came from our API');
      await sleep(300);
      await shot(page, `${P}07-link-preview`);
    }
    // --- "Görüldü" ---
    if (want('seen')) {
      // Earlier sections sent messages: Ayşe reads them now (live dm:peer_read), and both
      // group members' positions are set relative to my newest group message.
      state.groupReads = [{ userId: AYSE.id, at: new Date(Date.now() + 60e3).toISOString() }, { userId: MERT.id, at: iso(250) }];
      await openChat(page, 'Ayşe');
      for (const s of sockets) s.emit('dm:peer_read', { peerId: AYSE.id, at: new Date().toISOString() });
      const dmSeen = await waitFor(page, 'DM Görüldü', () => {
        const all = document.querySelectorAll('[data-testid="msg-seen"]');
        const el = all[all.length - 1];
        const bubbles = [...document.querySelectorAll('.message-bubble[data-message-id]')];
        const last = bubbles[bubbles.length - 1];
        const prev = el && el.previousElementSibling;
        const dx = el && last ? Math.round(el.getBoundingClientRect().left - last.getBoundingClientRect().left) : null;
        return { ok: all.length === 1 && !!el, text: el && el.textContent, title: el && el.getAttribute('title'), underLast: !!prev && (prev === last || prev.contains(last)), dx };
      }, null, 6000).catch(() => ({ ok: false }));
      check(dmSeen.ok && dmSeen.text === 'Görüldü' && /^Görüldü \d{2}:\d{2}$/.test(dmSeen.title || ''), `DM: one "Görüldü" with the time on hover (${dmSeen.text} / ${dmSeen.title})`);
      check(dmSeen.underLast && Math.abs(dmSeen.dx) <= 4, `it sits under my newest message, aligned with the bubble (dx ${dmSeen.dx})`);
      await shot(page, `${P}08-seen-dm`);
      const before = state.events.length;
      await openChat(page, 'Hafta Sonu Ekibi', 5);
      const gSeen = await waitFor(page, 'group Görüldü', () => {
        const el = document.querySelector('[data-testid="msg-seen"]');
        return { ok: !!el, text: el && el.textContent };
      }, null, 6000).catch(() => ({ ok: false }));
      check(gSeen.ok && gSeen.text === 'Görüldü: Ayşe', `group: only members who read after my message (${gSeen.text})`);
      await sleep(600);
      check(state.events.slice(before).some((e) => e.kind === 'group:mark_read' && e.groupId === GROUP_ID), 'opening the group reports my read (group:mark_read)');
      // Mert reads it live.
      for (const s of sockets) s.emit('group:read', { groupId: GROUP_ID, userId: MERT.id, at: new Date(Date.now() + 60e3).toISOString() });
      const live = await waitFor(page, 'everyone', () => {
        const el = document.querySelector('[data-testid="msg-seen"]');
        return { ok: !!el && el.textContent === 'Herkes gördü', text: el && el.textContent };
      }, null, 4000).catch((e) => ({ ok: false, why: e.message }));
      check(live.ok, `a live group:read updates it ("${live.text}")`);
      await shot(page, `${P}09-seen-group`);

      // Render count (perf): typing (this chat and others), a presence change and a read
      // receipt must not re-render the bubbles already on screen; a new message renders.
      await page.evaluate(() => { window.__descallBubbleRenders = { n: 0 }; });
      await sleep(400);
      await page.evaluate(() => { window.__descallBubbleRenders.n = 0; });
      const typist = sender(AYSE);
      for (const s of sockets) {
        s.emit('typing:update', { context: 'group', groupId: 'p4-other-group', fromUser: typist, typing: true });
        s.emit('typing:update', { context: 'server', channelId: 'p4-other-channel', fromUser: typist, typing: true });
        s.emit('typing:update', { context: 'dm', fromUser: sender(MERT), typing: false });
        s.emit('typing:update', { context: 'group', groupId: GROUP_ID, fromUser: typist, typing: true });
        s.emit('presence:delta', { up: [{ ...sender(MERT), status: 'idle' }] });
        s.emit('group:read', { groupId: GROUP_ID, userId: AYSE.id, at: new Date(Date.now() + 120e3).toISOString() });
      }
      await sleep(900);
      const quiet = await page.evaluate(() => window.__descallBubbleRenders.n);
      check(quiet === 0, `typing, presence and read events re-render no existing bubble (${quiet} renders)`);
      for (const s of sockets) s.emit('typing:update', { context: 'group', groupId: GROUP_ID, fromUser: typist, typing: false });
      const row = { id: `p4-g-rc-${Date.now()}`, group_id: GROUP_ID, sender_id: MERT.id, sender: sender(MERT), content: 'Yoldayım', created_at: new Date().toISOString(), reactions: [] };
      state.group.push(row);
      for (const s of sockets) s.emit('group:message', { groupId: GROUP_ID, message: row });
      const grew = await waitFor(page, 'new bubble renders', () => ({ ok: window.__descallBubbleRenders.n > 0, n: window.__descallBubbleRenders.n }), null, 4000).catch(() => ({ ok: false, n: 0 }));
      check(grew.ok && grew.n <= 3, `a new message renders only its own bubble (${grew.n} renders)`);
      await page.evaluate(() => { window.__descallBubbleRenders = null; });
    }
    // --- keyboard shortcuts (desktop: a hardware keyboard) ---
    if (want('keys') && dev === 'desktop') {
      await openChat(page, 'Ayşe');
      await page.click('.composer-container textarea');
      await page.keyboard.press('Control+/');
      const sheet = await waitFor(page, 'shortcuts sheet', () => {
        const s = document.querySelector('[data-testid="shortcuts-sheet"]');
        return { ok: !!s && s.querySelectorAll('[data-shortcut]').length >= 10, rows: s && s.querySelectorAll('[data-shortcut]').length, text: s && s.textContent.slice(0, 80) };
      }, null, 5000).catch(() => ({ ok: false }));
      check(sheet.ok && /Klavye kısayolları/.test(sheet.text || ''), `Ctrl+/ opens the shortcuts sheet (${sheet.rows} rows)`);
      await sleep(400);
      await shot(page, `${P}10-shortcuts`);
      await page.keyboard.press('Escape');
      await sleep(500);
      check(await page.evaluate(() => !document.querySelector('[data-testid="shortcuts-sheet"]') || getComputedStyle(document.querySelector('[data-testid="shortcuts-sheet"]')).opacity === '0'), 'Esc closes it');
      const title = () => page.evaluate(() => (document.querySelector('.panel-header') || {}).textContent || '');
      await page.click('.composer-container textarea');
      // The list is sorted by activity: step towards Mert from wherever Ayşe is.
      const order = await page.evaluate(() => [...document.querySelectorAll('.dm-item.conv-row .dm-name')].map((e) => e.textContent.trim()));
      const down = order.indexOf('Mert') > order.indexOf('Ayşe');
      await page.keyboard.press(down ? 'Alt+ArrowDown' : 'Alt+ArrowUp');
      await sleep(900);
      check(/Mert/.test(await title()), `${down ? 'Alt+↓' : 'Alt+↑'} opens the next chat in the list (Mert)`);
      await page.keyboard.press(down ? 'Alt+ArrowUp' : 'Alt+ArrowDown');
      await sleep(900);
      check(/Ayşe/.test(await title()), 'the other way goes back (Ayşe)');
      await page.keyboard.press('Control+Shift+F');
      await sleep(400);
      check(await page.evaluate(() => !!document.querySelector('.chat-search-bar input')), 'Ctrl+Shift+F opens chat search');
      await page.keyboard.press('Escape');
    }
    // --- notification options ---
    if (want('notify')) {
      await openChat(page, 'Ayşe');
      if (dev === 'desktop') {
        // Right-click the Mert row: its menu has "Bildirimler".
        await page.evaluate(() => {
          const el = [...document.querySelectorAll('.dm-name')].find((e) => e.textContent.trim() === 'Mert');
          const row = el && el.closest('.dm-item');
          const r = row.getBoundingClientRect();
          row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + 40, clientY: r.top + 20 }));
        });
        await waitFor(page, 'dm menu', () => ({ ok: !!document.querySelector('[data-testid="dm-menu-notify"]') }), null, 4000);
        await page.click('[data-testid="dm-menu-notify"]');
      } else {
        await page.tap('.header-title-block.is-dm');
        await waitFor(page, 'profile notify row', () => ({ ok: !!document.querySelector('[data-testid="profile-notify-options"]') }), null, 6000);
        await sleep(500);
        await page.evaluate(() => { const b = document.querySelector('[data-testid="profile-notify-options"]'); b.scrollIntoView({ block: 'center' }); b.click(); });
      }
      await waitFor(page, 'notify sheet', () => ({ ok: !!document.querySelector('[data-testid="notify-sheet"] [data-testid="notify-level-mentions"]') }), null, 5000);
      await sleep(400);
      const before = state.events.length;
      await page.click('[data-testid="notify-level-mentions"]');
      await sleep(400);
      const conv = dev === 'desktop' ? MERT.id : AYSE.id;
      check(state.events.slice(before).some((e) => e.kind === 'notify-pref' && e.convType === 'dm' && e.convId === conv && e.level === 'mentions'), 'choosing "Yalnızca @bahsetmeler" saves it on the server');
      check(await page.evaluate(() => document.querySelector('[data-testid="notify-level-mentions"]').getAttribute('aria-checked') === 'true'), 'the choice is ticked');
      await page.click('[data-testid="notify-mute-8h"]');
      await sleep(400);
      const muted = await page.evaluate(() => (document.querySelector('[data-testid="notify-muted"]') || {}).textContent || '');
      check(/kadar sessizde/.test(muted), `"8 saat" shows the muted-until banner (${muted})`);
      const saved = state.events.filter((e) => e.kind === 'notify-pref').pop();
      check(saved && saved.mutedUntil && Math.abs(Date.parse(saved.mutedUntil) - Date.now() - 8 * 3600e3) < 120e3, 'the mute ends in 8 hours');
      await shot(page, `${P}11-notify-options`);
      await page.keyboard.press('Escape');
      await sleep(500);
      if (dev === 'desktop') {
        const bell = await page.evaluate(() => {
          const el = [...document.querySelectorAll('.dm-name')].find((e) => e.textContent.trim() === 'Mert');
          const row = el && el.closest('.conv-row-body, .dm-info');
          return !!(row && row.querySelector('.conv-row-flags svg'));
        });
        check(bell, 'the muted chat shows the bell-off mark in the list');
      }
    }
    // --- scheduled sending ---
    if (want('schedule')) {
      await openChat(page, 'Ayşe');
      await typeInComposer(page, 'Yarın sabah toplantıyı unutma!');
      if (dev === 'desktop') {
        // Right click on Send: send later.
        await page.click('.composer-send-btn', { button: 'right' });
      } else {
        await page.tap('.composer-left .composer-action-btn');
        await waitFor(page, 'attachment menu', () => ({ ok: !!document.querySelector('[data-testid="attach-schedule"]') }), null, 4000);
        await page.tap('[data-testid="attach-schedule"]');
      }
      await waitFor(page, 'schedule sheet', () => ({ ok: !!document.querySelector('[data-testid="schedule-sheet"] [data-testid="schedule-submit"]') }), null, 5000);
      await sleep(400);
      check(await page.evaluate(() => document.querySelector('[data-testid="schedule-text"]').value) === 'Yarın sabah toplantıyı unutma!', 'the sheet takes the composer text');
      await page.click('[data-testid="schedule-preset-tomorrow"]');
      await sleep(250);
      await shot(page, `${P}12-schedule-new`);
      const before = state.events.length;
      await page.click('[data-testid="schedule-submit"]');
      await sleep(700);
      const ev = state.events.slice(before).find((e) => e.kind === 'schedule');
      const at = ev && new Date(ev.sendAt);
      const local = at && at.toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul', hour: '2-digit', minute: '2-digit' });
      check(ev && ev.convType === 'dm' && ev.convId === AYSE.id && ev.content === 'Yarın sabah toplantıyı unutma!', 'the server gets the schedule (text, chat)');
      check(local === '09:00' && at.getTime() > Date.now() + 3600e3, `"Yarın sabah" is tomorrow 09:00 local (${local})`);
      check(await page.evaluate(() => !!document.querySelector('[data-testid="schedule-item"]')), 'the sheet then lists it');
      await page.keyboard.press('Escape');
      await sleep(500);
      check((await composerValue(page)) === '', 'the composer is cleared');
      const pill = await page.evaluate(() => (document.querySelector('[data-testid="composer-scheduled"]') || {}).textContent || '');
      check(/1 zamanlanmış mesaj/.test(pill), `the composer shows "1 zamanlanmış mesaj" (${pill})`);
      await shot(page, `${P}13-schedule-pill`);
      await page.click('[data-testid="composer-scheduled"]');
      await waitFor(page, 'list', () => ({ ok: !!document.querySelector('[data-testid="schedule-item"]') }), null, 4000);
      await sleep(400);
      await shot(page, `${P}14-schedule-list`);
      const b2 = state.events.length;
      await page.click('[data-testid="schedule-cancel"]');
      await sleep(600);
      check(state.events.slice(b2).some((e) => e.kind === 'schedule-cancel'), 'cancel reaches the server');
      check(await page.evaluate(() => !document.querySelector('[data-testid="schedule-item"]')), 'the item leaves the list');
      await page.keyboard.press('Escape');
      await sleep(500);
      check(await page.evaluate(() => !document.querySelector('[data-testid="composer-scheduled"]')), 'the composer pill goes away');
    }
    // --- Descall logo emoji and stickers ---
    if (want('stickers')) {
      await openChat(page, 'Ayşe');
      const openPicker = () => page.evaluate(() => {
        const b = [...document.querySelectorAll('.message-composer button')].find((x) => /moji/i.test(x.getAttribute('aria-label') || ''));
        if (b) b.click();
        return !!b;
      });
      check(await openPicker(), 'the composer has the emoji button');
      await waitFor(page, 'Descall picker', () => ({ ok: !!document.querySelector('[data-testid="ds-picker"] [data-testid="ds-sticker-party"]') }), null, 4000);
      await sleep(300);
      await shot(page, `${P}15-stickers-picker`);
      const before = state.events.length;
      await page.click('[data-testid="ds-sticker-party"]');
      await sleep(700);
      check(state.events.slice(before).some((e) => e.kind === 'dm:send' && e.text === ':ds-sticker-party:'), 'a sticker goes out at once as one token');
      const st = await waitFor(page, 'sticker bubble', () => {
        const img = [...document.querySelectorAll('[data-testid="msg-sticker"]')].pop();
        const b = img && img.closest('.message-bubble');
        return { ok: !!img && img.complete && img.naturalWidth > 0, bg: b && getComputedStyle(b).backgroundColor, w: img && Math.round(img.getBoundingClientRect().width) };
      }, null, 5000).catch(() => ({ ok: false }));
      check(st.ok && /rgba\(0, 0, 0, 0\)|transparent/.test(st.bg || ''), `the sticker shows large without a bubble (${st.w}px, ${st.bg})`);
      await openPicker();
      await waitFor(page, 'picker again', () => ({ ok: !!document.querySelector('[data-testid="ds-emoji-ds-love"]') }), null, 4000);
      await page.click('[data-testid="ds-emoji-ds-love"]');
      await sleep(200);
      check(/:ds-love: $/.test(await composerValue(page)), 'a logo emoji is inserted as text');
      await page.click('.composer-container textarea');
      await page.keyboard.press('End');
      await page.keyboard.type('Harika oldu', { delay: 5 });
      await page.keyboard.press('Enter');
      const inline = await waitFor(page, 'inline emoji', () => {
        const img = [...document.querySelectorAll('.message-text .msg-logo-emoji')].pop();
        return { ok: !!img && img.complete && img.naturalWidth > 0, h: img && Math.round(img.getBoundingClientRect().height) };
      }, null, 5000).catch(() => ({ ok: false }));
      check(inline.ok, `the emoji is drawn inline in the bubble (${inline.h}px)`);
      await sleep(400);
      await shot(page, `${P}16-stickers-chat`);
    }
    // --- settings: "Görüldü bilgisi" and the new notification switches ---
    if (want('settings')) {
      const openSettingsTab = async (id) => {
        if (!(await page.evaluate(() => !!document.querySelector('.user-settings')))) {
          await page.evaluate(() => {
            // The gear is the last button of the rail's last group.
            const groups = document.querySelectorAll('.nav-rail .nav-rail-group');
            const btns = groups.length ? groups[groups.length - 1].querySelectorAll('button') : [];
            if (btns.length) btns[btns.length - 1].click();
          });
          await waitFor(page, 'settings', () => ({ ok: !!document.querySelector('.user-settings') }), null, 6000);
        }
        await page.evaluate((id) => { const n = document.querySelector(`[data-nav="${id}"]`); if (n) n.click(); }, id);
        await sleep(700);
      };
      await openSettingsTab('privacy');
      const rr = await waitFor(page, 'read receipts row', () => {
        const r = document.querySelector('[data-testid="read-receipts-row"]');
        return { ok: !!r, text: r && r.textContent, on: r && r.querySelector('[role="switch"]').getAttribute('aria-checked') };
      }, null, 6000).catch(() => ({ ok: false }));
      check(rr.ok && /Görüldü bilgisi/.test(rr.text) && rr.on === 'true', `Gizlilik shows "Görüldü bilgisi", on by default (${rr.on})`);
      await shot(page, `${P}17-settings-privacy`);
      const before = state.events.length;
      await page.click('[data-testid="read-receipts-row"] [role="switch"]');
      await sleep(500);
      check(state.events.slice(before).some((e) => e.kind === 'receipts' && e.enabled === false), 'turning it off saves on the server');
      await page.click('[data-testid="read-receipts-row"] [role="switch"]');
      await sleep(300);
      await openSettingsTab('notifications');
      const rows = await page.evaluate(() => [...document.querySelectorAll('.us-row-title')].map((e) => e.textContent.trim()));
      check(rows.includes('Bahsetme bildirimleri') && rows.includes('Mesaj önizlemesi'), `Bildirimler has the mention and preview switches (${rows.join(', ')})`);
      await shot(page, `${P}18-settings-notifications`);
      await page.keyboard.press('Escape');
      await sleep(400);
    }
  } catch (err) {
    await shot(page, `${P}fail`).catch(() => {});
    problems.push(`${dev}: ${err && err.message ? err.message : err}`);
  }
  if (errors.length) problems.push(`${dev}: page errors: ${errors.join(' | ')}`);
  const leaked = outside.filter((u) => !/fonts\.|gstatic|googleapis|sentry|giphy|tenor/.test(u));
  check(!leaked.some((u) => /example\.com/.test(u)), `the client never fetches the linked site (${leaked.filter((u) => /example\.com/.test(u)).length})`);
  await ctx.close();
  return problems;
}

(async () => {
  if (!fs.existsSync(path.join(DIST, 'index.html'))) { console.error(`[e2e-p4] FAIL no ${DIST}/index.html (build it first, see the header)`); process.exit(1); }
  const { server, io, port } = await startServer();
  const base = `http://127.0.0.1:${port}`;
  const browser = await pw.chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--lang=tr-TR', '--font-render-hinting=none'] });
  const problems = [];
  try {
    for (const dev of DEVICES) {
      try { problems.push(...await runDevice(browser, base, dev)); } catch (err) { problems.push(`${dev}: ${err && err.stack ? err.stack.split('\n').slice(0, 3).join(' ') : err}`); }
    }
  } finally {
    await browser.close().catch(() => {});
    io.close(); server.close();
  }
  if (problems.length) { console.error(`[e2e-p4] FAIL ${problems.length} problem(s):\n  - ${problems.join('\n  - ')}`); process.exit(1); }
  log('OK');
  process.exit(0);
})().catch((err) => { console.error('[e2e-p4] FAIL', err && err.stack ? err.stack : err); process.exit(1); });
