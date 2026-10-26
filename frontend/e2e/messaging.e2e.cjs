'use strict';

/**
 * Messaging e2e (Master Update A2) on iPhone, iPad and desktop viewports.
 *
 * Serves the built dist/ and an in-process mock API + Socket.IO server on
 * 127.0.0.1 (every other URL is aborted, nothing leaves the machine), signs in
 * a mock user and opens a long DM. Checks, per device:
 *   - double tap (touch) / double click on the bubble padding toggles ❤️, the
 *     server receives reaction:add then reaction:remove; double click on the
 *     text selects the word and adds no heart (desktop);
 *   - a rejected reaction rolls back and shows "Tepki gönderilemedi";
 *   - long press → emoji closes the menu at once and the chip shows (iPhone);
 *   - jump to bottom: opening lands at the newest message; scrolled up, a new
 *     message or a reaction never moves the list, the jump button shows with
 *     the unseen count and brings you down; pinned at the bottom, new
 *     messages keep you there.
 *
 * Run from frontend/ against a build that points at the mock (never production):
 *   VITE_API_BASE_URL=http://127.0.0.1:5361 VITE_SOCKET_URL=http://127.0.0.1:5361 \
 *     npx vite build --outDir dist-e2e
 *   node e2e/messaging.e2e.cjs
 * Env: PLAYWRIGHT_CORE=<path to playwright-core> (else require('playwright-core')),
 *      CHROME_PATH (default /usr/bin/google-chrome), DESCALL_E2E_SHOTS=<dir>,
 *      DESCALL_E2E_DEVICES=iphone,ipad,desktop.
 * Prints "[e2e-msg] OK" and exits 0, or "[e2e-msg] FAIL <reason>" and exits 1.
 */

const fs = require('fs');
const path = require('path');
const http = require('http');

const pw = require(process.env.PLAYWRIGHT_CORE || 'playwright-core');
const { Server } = require(require.resolve('socket.io', { paths: [path.join(__dirname, '../backend/node_modules'), __dirname] }));

const DIST = process.env.DESCALL_E2E_DIST || path.join(__dirname, '../dist-e2e');
const PORT = Number(process.env.DESCALL_E2E_PORT || 5361);
const SHOTS = process.env.DESCALL_E2E_SHOTS || '';
const DEVICES = (process.env.DESCALL_E2E_DEVICES || 'iphone,ipad,desktop').split(',').map((s) => s.trim()).filter(Boolean);
const CHROME = process.env.CHROME_PATH || '/usr/bin/google-chrome';
const log = (...a) => console.log('[e2e-msg]', ...a);

const ME = { id: '00000000-0000-4000-8000-0000000000e1', username: 'demir', displayName: 'Demir', display_name: 'Demir', birthDate: '2000-05-05', emailVerified: true, language: 'tr', blockedUsers: [], status: 'online' };
const PEER = { id: '00000000-0000-4000-8000-0000000000e2', username: 'ayse', displayName: 'Ayşe', display_name: 'Ayşe', status: 'online', avatarUrl: null };
const sender = (u) => ({ id: u.id, username: u.username, displayName: u.displayName, display_name: u.displayName, avatarUrl: null });
const LINES = ['Bu akşam oyun gecesine geliyor musun?', 'Tabii, saat kaçta?', "21:00'de, önce sesli kanalda toplanırız.", 'Tamam 👍', 'Mert ve Zeynep de gelecek.', 'Süper!', 'Geçen haftaki klibi gördün mü?', 'Gördüm, efsaneydi 😂', 'Bu sefer takımları ben kurayım mı?', 'Olur, sen kur.'];
let seq = 0;
const dm = (from, text, minAgo) => ({ id: `e2e-m-${String(++seq).padStart(3, '0')}`, from: sender(from), to: { id: (from === ME ? PEER : ME).id }, text, mediaUrl: null, mediaType: null, timestamp: new Date(Date.now() - minAgo * 60000).toISOString(), deliveredAt: new Date(Date.now() - minAgo * 60000).toISOString(), readAt: new Date(Date.now() - minAgo * 60000).toISOString(), editHistory: [], reactions: [] });
function freshMessages() {
  seq = 0;
  const out = [];
  for (let i = 0; i < 40; i++) out.push(dm(i % 3 === 1 ? ME : PEER, LINES[i % LINES.length], 120 - i * 2));
  return out;
}

// ---- mock server ------------------------------------------------------------------------
const state = { failReactions: false, events: [], sockets: new Set() };
function api(p) {
  if (/\/auth\/me$/.test(p)) return { user: ME };
  if (/\/promo\/popup$/.test(p)) return { popup: null };
  if (/\/dm\/[^/]+\/messages$/.test(p)) return { withUserId: PEER.id, messages: state.messages, hasMore: false };
  if (/\/dm\/previews$/.test(p)) return { dmPreviewsByPeer: { [PEER.id]: 'Olur, sen kur.' }, dmLastActivityByPeer: { [PEER.id]: new Date().toISOString() }, previews: {} };
  if (/\/friends(\/list)?$/.test(p)) return { friends: [PEER] };
  if (/\/users\/[^/]+$/.test(p) || /profile/.test(p)) return { user: PEER, ...PEER };
  const last = p.split('/').filter(Boolean).pop() || 'items';
  const out = { items: [], friends: [], requests: [], servers: [], groups: [], conversations: [], messages: [], notifications: [], prefs: {} };
  out[last] = Array.isArray(out[last]) ? out[last] : [];
  return out;
}
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain', '.mp3': 'audio/mpeg', '.wav': 'audio/wav' };
const API_RE = /^\/(api|auth|friends|groups|servers|calls|media|dm|reports|reactions|admin|health|maintenance|users|notifications|activity|analytics|store|shop|push|me|settings|blocks|presence)(\/|$)/;
function serve(req, res) {
  const url = new URL(req.url, 'http://127.0.0.1');
  if (process.env.DESCALL_E2E_DEBUG && !/\.(js|css|png|svg|woff2|webp|jpg)$/.test(url.pathname)) log('req', req.method, url.pathname);
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
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify(api(url.pathname)));
  }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  fs.createReadStream(path.join(DIST, 'index.html')).pipe(res);
}
function startServer() {
  const server = http.createServer(serve);
  const io = new Server(server, { cors: { origin: '*' } });
  io.on('connection', (socket) => {
    if (process.env.DESCALL_E2E_DEBUG) { log('socket connect'); socket.onAny((ev) => log('sock<-', ev)); }
    state.sockets.add(socket);
    socket.on('disconnect', () => state.sockets.delete(socket));
    socket.emit('connected', { user: ME, message: 'ok' });
    socket.emit('friend:list', [{ ...PEER, lastMessage: 'Olur, sen kur.', lastActivity: new Date().toISOString() }]);
    socket.emit('friend:requests', []);
    socket.emit('users:update', [sender(ME), sender(PEER)].map((u) => ({ ...u, status: 'online' })));
    socket.on('app:ping', (ack) => { if (typeof ack === 'function') ack(Date.now()); });
    const react = (kind) => (p = {}, ack) => {
      state.events.push({ kind, ...p });
      if (state.failReactions) { if (typeof ack === 'function') setTimeout(() => ack({ ok: false, error: 'failed' }), 120); return; }
      setTimeout(() => {
        socket.emit('reaction:update', { messageId: p.messageId, emoji: p.emoji, userId: ME.id, username: ME.username, conversationType: p.conversationType, conversationId: p.conversationId, removed: kind === 'remove', clientReqId: p.clientReqId });
        if (typeof ack === 'function') ack({ ok: true });
      }, 60);
    };
    socket.on('reaction:add', react('add'));
    socket.on('reaction:remove', react('remove'));
    socket.on('dm:send', (p = {}) => {
      state.events.push({ kind: 'send', ...p });
      const m = { ...dm(ME, p.text || '', 0), tempId: p.tempId, convWith: PEER.id };
      socket.emit('dm:message', m);
    });
  });
  return new Promise((resolve) => server.listen(PORT, '127.0.0.1', () => resolve({ server, io, port: server.address().port })));
}
function peerSays(text) {
  const m = { ...dm(PEER, text, 0), convWith: PEER.id };
  for (const s of state.sockets) s.emit('dm:message', m);
  return m;
}
function peerReacts(messageId, emoji) {
  for (const s of state.sockets) s.emit('reaction:update', { messageId, emoji, userId: PEER.id, username: PEER.username, conversationType: 'dm', conversationId: PEER.id, removed: false });
}

// ---- devices ----------------------------------------------------------------------------
const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const IPAD_UA = 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const DEV = {
  iphone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: IPHONE_UA, touch: true },
  ipad: { viewport: { width: 1024, height: 1366 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: IPAD_UA, touch: true },
  desktop: { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false, touch: false },
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(page, label, fn, arg, timeoutMs = 20000) {
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

// In-page probes.
const SCROLLER = `(() => { const l = document.querySelector('.message-list'); let el = l && l.parentElement; while (el && el !== document.body) { const s = getComputedStyle(el); if (/(auto|scroll)/.test(s.overflowY) && el.scrollHeight > el.clientHeight + 1) return el; el = el.parentElement; } return document.querySelector('.messages-container'); })()`;
const metrics = new Function(`const sc = ${SCROLLER}; if (!sc) return { ok: false, why: 'no scroller' };
  const btn = document.querySelector('.msg-jump-btn'); const cnt = document.querySelector('.msg-jump-count');
  return { ok: true, top: Math.round(sc.scrollTop), dist: Math.round(sc.scrollHeight - sc.clientHeight - sc.scrollTop), h: sc.clientHeight,
    jump: !!btn && getComputedStyle(btn).opacity !== '0', count: cnt ? cnt.textContent.trim() : '',
    rows: document.querySelectorAll('.message-bubble').length };`);

async function bubbleBox(page, id) {
  return page.evaluate((id) => {
    const b = [...document.querySelectorAll('.message-bubble[data-message-id]')].find((n) => n.getAttribute('data-message-id') === id);
    if (!b) return null;
    b.scrollIntoView({ block: 'center' });
    const r = b.getBoundingClientRect();
    const t = b.querySelector('.message-text');
    const tr = t ? t.getBoundingClientRect() : null;
    return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height, text: tr && { l: tr.left, t: tr.top, r: tr.right, b: tr.bottom } };
  }, id);
}
async function reactionsOf(page, id) {
  return page.evaluate((id) => {
    const root = [...document.querySelectorAll('.message-bubble[data-message-id]')].find((n) => n.getAttribute('data-message-id') === id);
    if (!root) return null;
    return [...root.querySelectorAll('.reaction-chip')].map((c) => `${c.querySelector('.reaction-emoji')?.textContent || ''}${c.querySelector('.reaction-count')?.textContent || ''}${c.classList.contains('reaction-mine') ? '*' : ''}`);
  }, id);
}

async function touchTap(cdp, x, y) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
  await sleep(40);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}
async function touchDoubleTap(cdp, x, y) { await touchTap(cdp, x, y); await sleep(110); await touchTap(cdp, x + 2, y + 1); }
async function longPress(cdp, x, y, ms = 650) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
  await sleep(ms);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}
async function userScroll(page, cdp, dev, dy) {
  const vp = DEV[dev].viewport;
  const x = Math.round(vp.width / 2), y = Math.round(vp.height / 2); // eslint-disable-line no-unused-vars
  if (DEV[dev].touch) {
    // A real finger drag: down, 24 moves, a short hold (no fling), up.
    const y0 = Math.round(vp.height * 0.25), steps = 24;
    for (let done = 0; done < dy;) {
      const span = Math.min(dy - done, Math.round(vp.height * 0.5));
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: y0, id: 1 }] });
      for (let i = 1; i <= steps; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y0 + Math.round((span * i) / steps), id: 1 }] }); await sleep(16); }
      await sleep(120);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      done += span;
      await sleep(150);
    }
  }
  else { await page.mouse.move(x, y); for (let left = -dy; Math.abs(left) > 0;) { const step = Math.sign(left) * Math.min(Math.abs(left), 120); await page.mouse.wheel(0, step); left -= step; await sleep(16); } }
  await sleep(700);
  if (process.env.DESCALL_E2E_DEBUG) log('after scroll', JSON.stringify(await page.evaluate(metrics)), JSON.stringify(await page.evaluate(() => { const sc = document.querySelector('.messages-container'); const e = document.elementFromPoint(innerWidth / 2, innerHeight / 2); return { sc: sc && sc.className.slice(0, 60), ov: sc && getComputedStyle(sc).overflowY, ta: sc && getComputedStyle(sc).touchAction, hit: e && String(e.className).slice(0, 60) }; })));
}

// ---- checks -----------------------------------------------------------------------------
async function runDevice(browser, base, dev) {
  state.messages = freshMessages();
  state.events = [];
  state.failReactions = false;
  const d = DEV[dev];
  const ctx = await browser.newContext({ viewport: d.viewport, deviceScaleFactor: d.deviceScaleFactor, isMobile: d.isMobile, hasTouch: d.hasTouch, ...(d.userAgent ? { userAgent: d.userAgent } : {}), locale: 'tr-TR', timezoneId: 'Europe/Istanbul', colorScheme: 'dark', reducedMotion: 'reduce' });
  await ctx.route('**/*', (r) => (/^(data|blob):/.test(r.request().url()) || r.request().url().startsWith(base) ? r.continue() : r.abort()));
  await ctx.addInitScript(([api, me]) => {
    window.__DESCALL_API_URL__ = api; window.__DESCALL_SOCKET_URL__ = api;
    localStorage.setItem('descall_language', 'tr');
    localStorage.setItem('descall:ios-pwa-install-dismissed', '1');
    localStorage.setItem('descall:cookie_consent_v1', JSON.stringify({ choice: 'rejected', at: new Date().toISOString() }));
    localStorage.setItem('descall_token', 'e2e.fake.token');
    localStorage.setItem('descall_user', JSON.stringify(me));
  }, [base, ME]);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 300)));
  const cdp = await ctx.newCDPSession(page);
  const problems = [];
  const check = (cond, msg) => { if (!cond) problems.push(`${dev}: ${msg}`); else log(`${dev}: ok - ${msg}`); };

  try {
  await page.goto(base + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  // Open the DM. A tap that lands before the list hydrates does nothing (slow
  // CI runners), so tap again until the conversation shows.
  const tapDmRow = () => page.evaluate(() => {
    const el = [...document.querySelectorAll('.dm-name, .dm-item, button, [role="button"]')].find((e) => e.textContent.trim().startsWith('Ayşe') && e.getBoundingClientRect().width > 0);
    if (!el) return false;
    (el.closest('button, [role="button"], .dm-item') || el).click();
    return true;
  });
  await waitFor(page, `${dev} DM row`, () => ({ ok: [...document.querySelectorAll('.dm-name, .dm-item, button, [role="button"]')].some((e) => e.textContent.trim().startsWith('Ayşe') && e.getBoundingClientRect().width > 0) }), null, 30000);
  let opened = false;
  for (let attempt = 0; attempt < 5 && !opened; attempt += 1) {
    await tapDmRow();
    opened = await waitFor(page, `${dev} messages`, () => ({ ok: document.querySelectorAll('.message-bubble').length >= 30 }), null, 6000).then(() => true, () => false);
  }
  if (!opened) await waitFor(page, `${dev} messages`, () => ({ ok: document.querySelectorAll('.message-bubble').length >= 30 }), null, 2000);
  await sleep(900);
  let m = await page.evaluate(metrics);
  check(m.dist <= 4, `opens at the newest message (distance ${m.dist})`);
  check(!m.jump, 'no jump button at the bottom');
  await shot(page, `${dev}-01-open`);

  // --- heart ---
  const ids = state.messages.map((x) => x.id);
  const peerId = state.messages[state.messages.length - 2].from.id === PEER.id ? ids[ids.length - 2] : ids[ids.length - 3];
  let box = await bubbleBox(page, peerId);
  if (!box) { problems.push(`${dev}: bubble ${peerId} not found`); }
  else {
    await sleep(300);
    box = await bubbleBox(page, peerId);
    const px = box.r - 5, py = box.t + box.h / 2;
    const before = state.events.length;
    if (d.touch) await touchDoubleTap(cdp, px, py);
    else await page.mouse.dblclick(px, py);
    await sleep(150);
    let r = await reactionsOf(page, peerId);
    check(r && r.includes('❤️1*'), `double ${d.touch ? 'tap' : 'click'} on padding adds ❤️ at once (${JSON.stringify(r)})`);
    await sleep(400);
    check(state.events.slice(before).some((e) => e.kind === 'add' && e.emoji === '❤️' && e.messageId === peerId), 'server got reaction:add ❤️');
    await shot(page, `${dev}-02-heart`);
    await sleep(500);
    if (d.touch) await touchDoubleTap(cdp, px, py);
    else await page.mouse.dblclick(px, py);
    await sleep(500);
    r = await reactionsOf(page, peerId);
    check(r && !r.some((x) => x.startsWith('❤️')), `second double ${d.touch ? 'tap' : 'click'} removes my ❤️ (${JSON.stringify(r)})`);
    check(state.events.slice(before).some((e) => e.kind === 'remove' && e.emoji === '❤️'), 'server got reaction:remove ❤️');

    if (!d.touch && box.text) {
      // Double click on the word selects it and adds no heart.
      await page.evaluate(() => getSelection().removeAllRanges());
      const n0 = state.events.length;
      box = await bubbleBox(page, peerId);
      await page.mouse.dblclick(box.text.l + 12, (box.text.t + box.text.b) / 2);
      await sleep(500);
      const sel = await page.evaluate(() => String(getSelection()));
      if (process.env.DESCALL_E2E_DEBUG) log('text probe', JSON.stringify(await page.evaluate(([x, y]) => { const e = document.elementFromPoint(x, y); return { tag: e && e.className, us: e && getComputedStyle(e).userSelect, wus: e && getComputedStyle(e).webkitUserSelect }; }, [box.text.l + 12, (box.text.t + box.text.b) / 2])));
      r = await reactionsOf(page, peerId);
      check(sel.trim().length > 0, `double click on text selects a word ("${sel.trim()}")`);
      check(state.events.length === n0 && !(r || []).some((x) => x.startsWith('❤️')), 'double click on text adds no heart');
      await page.evaluate(() => getSelection().removeAllRanges());
    }

    // Rollback + toast.
    state.failReactions = true;
    await sleep(500);
    box = await bubbleBox(page, peerId);
    if (d.touch) await touchDoubleTap(cdp, box.r - 5, box.t + box.h / 2);
    else await page.mouse.dblclick(box.r - 5, box.t + box.h / 2);
    await sleep(60);
    const optimistic = await reactionsOf(page, peerId);
    const t = await waitFor(page, `${dev} toast`, () => {
      const el = [...document.querySelectorAll('[role="status"], [role="alert"], .toast, [class*="toast"]')].find((e) => /Tepki gönderilemedi/.test(e.textContent));
      return { ok: !!el };
    }, null, 7000).catch((e) => ({ ok: false, err: e.message }));
    await sleep(200);
    r = await reactionsOf(page, peerId);
    check(optimistic && optimistic.includes('❤️1*'), `optimistic chip shows before the ack (${JSON.stringify(optimistic)})`);
    check(t.ok, 'rejected reaction shows "Tepki gönderilemedi"');
    check(r && !r.some((x) => x.startsWith('❤️')), `rejected reaction rolls back (${JSON.stringify(r)})`);
    await shot(page, `${dev}-03-rollback`);
    state.failReactions = false;
    await sleep(2800);
  }

  // Long press → emoji: the menu closes at once (glass phone menu).
  if (dev === 'iphone' && box) {
    box = await bubbleBox(page, peerId);
    await longPress(cdp, box.l + 20, box.t + box.h / 2);
    const menu = await waitFor(page, 'glass menu', () => ({ ok: !!document.querySelector('.g-react-bar') }), null, 4000).catch(() => ({ ok: false }));
    check(menu.ok, 'long press opens the glass menu');
    if (menu.ok) {
      await sleep(500);
      const chip = await page.evaluate(() => { const c = [...document.querySelectorAll('.g-react-bar .emoji-chip')].find((x) => x.textContent.includes('😂')) || document.querySelectorAll('.g-react-bar .emoji-chip')[1]; if (!c) return null; const r = c.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, e: c.textContent.trim() }; });
      if (chip) {
        await touchTap(cdp, chip.x, chip.y);
        await sleep(60);
        const r = await reactionsOf(page, peerId);
        check(r && r.some((x) => x.startsWith(chip.e)), `picked ${chip.e} shows at once (${JSON.stringify(r)})`);
        const closed = await waitFor(page, 'menu closed', () => ({ ok: !document.querySelector('.g-react-bar') }), null, 1500).catch(() => ({ ok: false }));
        check(closed.ok, 'the menu closes right after the pick');
      } else problems.push(`${dev}: no emoji chip in the glass menu`);
    }
    await sleep(600);
  }

  // --- jump to bottom ---
  await page.evaluate(() => { const b = document.querySelector('.msg-jump-btn'); if (b) b.click(); });
  await sleep(600);
  await userScroll(page, cdp, dev, 900);
  m = await page.evaluate(metrics);
  const upTop = m.top;
  check(m.dist > 300, `user scrolled up (${m.dist}px from the bottom)`);
  check(m.jump, 'jump button shows when scrolled up');
  peerSays('Yeni mesaj: hazır mısın?');
  await sleep(900);
  m = await page.evaluate(metrics);
  check(Math.abs(m.top - upTop) <= 2, `a new message does not move a reader (scrollTop ${upTop} → ${m.top})`);
  check(m.count === '1', `jump button counts 1 unseen (${JSON.stringify(m.count)})`);
  const visibleId = await page.evaluate((sel) => {
    const sc = eval(sel); const top = sc.getBoundingClientRect().top + sc.clientHeight / 2;
    let best = null, bestD = Infinity;
    for (const x of document.querySelectorAll('.message-bubble[data-message-id]')) { const r = x.getBoundingClientRect(); const dd = Math.abs((r.top + r.bottom) / 2 - top); if (dd < bestD) { bestD = dd; best = x; } }
    return best ? best.getAttribute('data-message-id') : null;
  }, SCROLLER);
  if (visibleId) {
    peerReacts(visibleId, '🔥');
    await sleep(700);
    const m2 = await page.evaluate(metrics);
    check(Math.abs(m2.top - m.top) <= 2, `a reaction does not move the list (scrollTop ${m.top} → ${m2.top})`);
  }
  await shot(page, `${dev}-04-jump`);
  if (process.env.DESCALL_E2E_DEBUG) log('dock', JSON.stringify(await page.evaluate(() => { const d = document.querySelector('.msg-jump-dock'); const b = document.querySelector('.msg-jump-btn'); const l = document.querySelector('.message-list'); const r = (e) => e && JSON.stringify(e.getBoundingClientRect()); const cs = b && getComputedStyle(b); return { dock: r(d), btn: r(b), list: r(l), right: cs && cs.right, left: cs && cs.left, pos: cs && cs.position, tr: cs && cs.transform, ldisp: l && getComputedStyle(l).display }; })));
  const jb = await page.evaluate(() => { const b = document.querySelector('.msg-jump-btn'); if (!b) return null; const r = b.getBoundingClientRect(); const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, top: hit && b.contains(hit), inView: r.bottom <= innerHeight && r.top >= 0 }; });
  check(jb && jb.w >= 44, `jump button is a 44pt target (${jb && jb.w})`);
  check(jb && jb.top && jb.inView, 'jump button is visible and not covered');
  if (jb) {
    if (d.touch) await touchTap(cdp, jb.x, jb.y); else await page.mouse.click(jb.x, jb.y);
    await sleep(1200);
    m = await page.evaluate(metrics);
    check(m.dist <= 4, `jump button brings you to the newest message (distance ${m.dist})`);
    check(!m.jump, 'jump button hides at the bottom');
  }
  peerSays('Bir tane daha 🙂');
  await sleep(900);
  m = await page.evaluate(metrics);
  check(m.dist <= 4, `pinned at the bottom, a new message keeps you there (distance ${m.dist})`);

  } catch (err) {
    await shot(page, `${dev}-fail`).catch(() => {});
    problems.push(`${dev}: ${err && err.message ? err.message : err}`);
  }
  if (errors.length) problems.push(`${dev}: page errors: ${errors.join(' | ')}`);
  await ctx.close();
  return problems;
}

(async () => {
  if (!fs.existsSync(path.join(DIST, 'index.html'))) { console.error(`[e2e-msg] FAIL no ${DIST}/index.html (build it first, see the header)`); process.exit(1); }
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
  if (problems.length) { console.error(`[e2e-msg] FAIL ${problems.length} problem(s):\n  - ${problems.join('\n  - ')}`); process.exit(1); }
  log('OK');
  process.exit(0);
})().catch((err) => { console.error('[e2e-msg] FAIL', err && err.stack ? err.stack : err); process.exit(1); });
