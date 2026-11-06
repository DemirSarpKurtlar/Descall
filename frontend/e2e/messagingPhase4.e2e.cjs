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
  return { ayse, mert, group, events: [], scheduled: [], previewHits: [], groupReads: [] };
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
  if (/\/api\/groups\/[^/]+\/read-state$/.test(p)) return { reads: state.groupReads };
  if (/\/api\/link-preview$/.test(p)) {
    state.previewHits.push(query.get('url'));
    return { ok: true, preview: { url: query.get('url'), siteName: 'example.com', title: 'Descall Turnuvası 2026', description: 'Kayıtlar açık: takımını kur, haritanı seç, cumartesi 20:00 başlıyoruz.', image: null } };
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

// Opens a conversation from the sidebar list by its visible name.
async function openChat(page, name, minBubbles = 5) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
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
