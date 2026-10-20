'use strict';

/**
 * Electron fixture for the chat hover toolbar (2.13.2).
 *
 * Boots the real main process (electron/main.cjs) against the built dist/, signed in
 * against an in-process mock API (nothing leaves the machine). It opens a DM, hovers
 * the first and last message of each group at several window widths (and with the
 * conversation's side panel open when there is one), and checks that the hover pill:
 *   - sits on the message card's top-right corner (top -16px, ~12px in), also for grouped follow-ups,
 *   - sits inside the chat column with an inset (never clipped),
 *   - never overlaps the row's avatar, name, badges or time,
 *   - never overlaps the floating conversation header.
 *
 * Run from frontend/ after an Electron build (ELECTRON_BUILD=1 npx vite build):
 *   xvfb-run -a npx electron electron/e2e/hoverToolbar.e2e.cjs --no-sandbox
 * Env: DESCALL_E2E_SHOTS=<dir> saves screenshots; DESCALL_E2E_WIDTHS="1024x670,800x600".
 * Prints "[e2e-hover] OK" and exits 0, or "[e2e-hover] FAIL <reason>" and exits 1.
 */

const { app, protocol, safeStorage } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');

const SHOTS = process.env.DESCALL_E2E_SHOTS || '';
const WIDTHS = (process.env.DESCALL_E2E_WIDTHS || '1024x670,1280x800,1100x700,960x640,860x620,720x560').split(',').map((s) => s.split('x').map(Number));
const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'descall-e2e-hover-'));
app.setPath('userData', userData);
app.commandLine.appendSwitch('host-resolver-rules', 'MAP * ~NOTFOUND');
app.commandLine.appendSwitch('force-device-scale-factor', '1');

const log = (...a) => console.log('[e2e-hover]', ...a);
let failed = false;
function fail(reason) {
  if (failed) return;
  failed = true;
  console.error(`[e2e-hover] FAIL ${reason}`);
  setTimeout(() => app.exit(1), 200);
}
setTimeout(() => fail('timed out'), 240000).unref();

const ME = { id: 'u-e2e', username: 'Demirr', displayName: 'Demirr', display_name: 'Demirr', isAdmin: true, is_admin: true, role: 'admin', country: 'TR', countryCode: 'TR', language: 'tr', createdAt: '2025-01-01T00:00:00Z', emailVerified: true, birthDate: '2000-01-01', blockedUsers: [] };
const PEER = { id: 'u-peer', username: 'sn1pez53', displayName: 'sn1pez53 the longest name', display_name: 'sn1pez53 the longest name', isAdmin: true, is_admin: true, role: 'admin', country: 'TR', countryCode: 'TR' };
const now = Date.now();
const MSGS = [
  ['u-e2e', 'Selam'], ['u-e2e', 'Naber'], ['u-peer', 'İyi, sen?'], ['u-e2e', 'Ben de iyiyim'],
  ['u-peer', '/daily,'], ['u-peer', 'noldu'], ['u-e2e', 'Tamam'], ['u-e2e', 'Görüşürüz, akşam sesli kanala gelirim'], ['u-peer', 'ok'],
].map(([from, text], i) => ({ id: `m${i}`, text, from: from === 'u-e2e' ? ME : PEER, sender_id: from, timestamp: new Date(now - (10 - i) * 60000).toISOString() }));

function body(url) {
  const p = url.pathname;
  if (p === '/auth/me') return { user: ME };
  if (p.includes('/dm/') && p.endsWith('/messages')) return { withUserId: PEER.id, hasMore: false, messages: MSGS };
  if (p.includes('/friends/list')) return { friends: [PEER] };
  if (p.endsWith('/groups/my')) return { groups: [{ id: 'g1', name: 'Ekip', owner_id: ME.id, members: [ME, PEER], member_count: 2 }] };
  if (p.endsWith('/groups/g1/messages')) return { messages: MSGS.map((m) => ({ ...m, group_id: 'g1', content: m.text, user_id: m.sender_id, username: m.from.username, user: m.from, created_at: m.timestamp })), reactionsIncluded: true };
  if (p.endsWith('/groups/g1/members')) return { members: [ME, PEER] };
  if (p.includes('/users/') || p.includes('/profile')) return { user: PEER, ...PEER };
  const last = p.split('/').filter(Boolean).pop() || 'items';
  const out = { items: [], friends: [], requests: [], servers: [], groups: [], conversations: [], messages: [], notifications: [] };
  out[last] = [];
  return out;
}
function mockResponse(request) {
  const url = new URL(request.url);
  const headers = {
    'content-type': 'application/json',
    'access-control-allow-origin': request.headers.get('origin') || '*',
    'access-control-allow-credentials': 'true',
    'access-control-allow-headers': request.headers.get('access-control-request-headers') || '*',
    'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
  };
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (url.pathname.startsWith('/socket.io')) return new Response('{}', { status: 404, headers });
  return new Response(JSON.stringify(body(url)), { status: 200, headers });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const TOKEN = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ id: ME.id, userId: ME.id, username: ME.username, exp: 4102444800 })}.e2e`;

app.whenReady().then(() => {
  const tokenFile = path.join(userData, 'auth-token.bin');
  fs.writeFileSync(tokenFile, safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(TOKEN) : Buffer.from(TOKEN, 'utf8'));
  protocol.handle('https', (request) => {
    try { return mockResponse(request); } catch (err) { return new Response(String(err), { status: 500 }); }
  });
});

let attached = false;
app.on('browser-window-created', (_e, win) => {
  const wc = win.webContents;
  wc.once('did-finish-load', () => {
    if (attached || !/^descall:\/\/app\//.test(wc.getURL())) return;
    attached = true;
    run(win).catch((err) => fail(err && err.stack ? err.stack : String(err)));
  });
});

const js = (win, code) => win.webContents.executeJavaScript(code, true);
async function shot(win, name) {
  if (!SHOTS) return;
  fs.mkdirSync(SHOTS, { recursive: true });
  const img = await win.webContents.capturePage();
  fs.writeFileSync(path.join(SHOTS, name), img.toPNG());
}
async function waitFor(win, label, code, timeoutMs = 45000) {
  const t0 = Date.now();
  let last;
  while (Date.now() - t0 < timeoutMs) {
    try { last = await js(win, code); } catch (err) { last = `ERR ${err.message}`; }
    if (last && last.ok) return last;
    await sleep(250);
  }
  throw new Error(`${label}: not reached (last ${JSON.stringify(last)})`);
}

const MEASURE = `(() => {
  const r = (e) => { const b = e.getBoundingClientRect(); return { left: b.left, top: b.top, right: b.right, bottom: b.bottom, w: b.width, h: b.height }; };
  const bar = [...document.querySelectorAll('.message-hover-bar')].find((e) => getComputedStyle(e).opacity > 0.3);
  if (!bar) return { ok: false, why: 'no bar' };
  const bubble = bar.closest('.message-bubble');
  const row = bubble.closest('.message-group');
  let list = bubble.closest('.message-list');
  for (let n = list; n && n !== document.body; n = n.parentElement) { if (/(auto|scroll)/.test(getComputedStyle(n).overflowY) && n.scrollHeight > n.clientHeight) { list = n; break; } }
  const lr = r(list);
  const col = { left: lr.left, right: lr.left + list.clientWidth, top: lr.top, bottom: lr.bottom };
  const rowR = r(row);
  const b = r(bar);
  const hits = [...row.querySelectorAll(':scope > .message-header .message-avatar, :scope > .message-header .message-meta > *'), ...document.querySelectorAll('.chat-top-chrome .header-left, .chat-top-chrome .header-right')]
    .map((e) => ({ cls: String(e.className).slice(0, 40), ...r(e) }))
    .concat([{ cls: 'hovered-message', ...r(bubble) }])
    .filter((o) => o.w > 0 && o.left < b.right && o.right > b.left && o.top < b.bottom && o.bottom > b.top);
  return { ok: true, bar: b, col, place: bar.dataset.place || '', compact: bar.classList.contains('is-compact'),
    cardTopOff: Math.round(b.top - rowR.top), cardRightOff: Math.round(rowR.right - b.right), clipped: b.left < col.left + 4 || b.right > col.right - 4 || b.top < col.top, insetRight: Math.round(Math.min(col.right, rowR.right) - b.right), hits };
})()`;

async function hoverAll(win, tag) {
  const n = await js(win, `(window.__hoverTargets = [...document.querySelectorAll('.message-group')].flatMap((g) => { const bs = [...g.querySelectorAll('.message-bubble')]; return [...new Set([bs[0], bs[bs.length - 1]])].filter(Boolean); })).length`);
  const problems = [];
  for (let i = 0; i < n; i++) {
    win.webContents.sendInputEvent({ type: 'mouseMove', x: 5, y: 5 });
    await sleep(350);
    // Bring the row below the floating header first (the user scrolls there too).
    const [x, y, reachable] = await js(win, `(() => { const b = window.__hoverTargets[${i}]; const row = b.closest('.message-group'); let list = b.closest('.message-list'); for (let n = list; n && n !== document.body; n = n.parentElement) { if (/(auto|scroll)/.test(getComputedStyle(n).overflowY) && n.scrollHeight > n.clientHeight) { list = n; break; } } const head = document.querySelector('.chat-top-chrome .header-left'); const want = Math.max(head ? head.getBoundingClientRect().bottom : 0, list.getBoundingClientRect().top) + 70; const rt = row.getBoundingClientRect().top; list.scrollTop += (rt - want); const r = b.getBoundingClientRect(); const x = Math.round(r.left + 12), y = Math.round(r.top + r.height / 2); const hit = document.elementFromPoint(x, y); return [x, y, !!(hit && b.contains(hit))]; })()`);
    if (!reachable) { log(tag, `#${i}`, 'covered by the floating header, not hoverable (skipped)'); continue; }
    await sleep(250);
    win.webContents.sendInputEvent({ type: 'mouseMove', x, y });
    await sleep(500);
    const m = await js(win, MEASURE);
    if (!m.ok) { problems.push(`${tag} #${i}: ${m.why}`); continue; }
    if (m.clipped) problems.push(`${tag} #${i}: clipped ${JSON.stringify(m.bar)} col ${JSON.stringify(m.col)}`);
    if (m.place === 'edge' && (m.cardTopOff !== -16 || m.cardRightOff < 8 || m.cardRightOff > 16)) problems.push(`${tag} #${i}: not at the card's top-right (top ${m.cardTopOff}, right ${m.cardRightOff})`);
    if (m.hits.length) problems.push(`${tag} #${i}: overlaps ${m.hits.map((h) => h.cls).join(', ')}`);
    log(tag, await js(win, '`${innerWidth}x${innerHeight}`'), `#${i}`, `bar ${Math.round(m.bar.left)}-${Math.round(m.bar.right)} @${Math.round(m.bar.top)}`, `inset ${m.insetRight}`, m.compact ? 'compact' : 'full', m.place, m.hits.length ? 'OVERLAP' : '', m.clipped ? 'CLIPPED' : '');
    await shot(win, `${tag}-msg${i}.png`);
  }
  return problems;
}

async function run(win) {
  await waitFor(win, 'boot', `(() => ({ ok: !document.querySelector('#boot-splash') && (document.getElementById('root')?.innerText || '').length > 0 }))()`);
  await sleep(4000);
  // Dismiss the cookie banner (it sits over the composer).
  await js(win, `(() => { localStorage.setItem('descall:cookie_consent_v1', JSON.stringify({ choice: 'rejected', at: new Date().toISOString() })); return true; })()`);
  win.webContents.reload();
  await sleep(1500);
  await waitFor(win, 'boot after consent', `(() => ({ ok: !document.querySelector('#boot-splash') && (document.getElementById('root')?.innerText || '').length > 0 }))()`);
  await sleep(3000);
  const problems = [];
  // Smaller displays lower the window minimum (fitBoundsToWorkArea); allow it here.
  win.setMinimumSize(640, 480);
  for (const [w, h] of WIDTHS) {
    win.setContentSize(w, h);
    await sleep(500);
    await js(win, `history.pushState({}, '', '/direct/${PEER.username}'); dispatchEvent(new PopStateEvent('popstate')); true`);
    await waitFor(win, 'messages', `(() => ({ ok: document.querySelectorAll('.message-bubble').length >= ${MSGS.length} }))()`);
    await sleep(1200);
    problems.push(...await hoverAll(win, `${w}x${h}`));
    // Group chat with the members panel docked → narrow chat column.
    await js(win, `history.pushState({}, '', '/groups/g1'); dispatchEvent(new PopStateEvent('popstate')); true`);
    const g = await waitFor(win, 'group messages', `(() => ({ ok: document.querySelectorAll('.message-bubble').length >= ${MSGS.length}, n: document.querySelectorAll('.message-bubble').length, path: location.pathname }))()`, 15000).catch((e) => ({ ok: false, why: e.message }));
    if (!g.ok) { problems.push(`${w}x${h} group: ${g.why}`); continue; }
    const opened = await js(win, `(() => { const b = [...document.querySelectorAll('button[aria-label]')].find((x) => /^(Üyeler|Members)$/.test(x.getAttribute('aria-label')) && x.offsetParent); if (b && !b.classList.contains('active')) b.click(); return !!b; })()`);
    await sleep(900);
    if (!opened) problems.push(`${w}x${h}: members button not found`);
    log(`${w}x${h} members panel`, await js(win, `(() => { const m = document.querySelector('.members-panel'); const l = document.querySelector('.message-list'); return m ? 'panel ' + Math.round(m.getBoundingClientRect().width) + 'px, column ' + Math.round(l.clientWidth) + 'px' : 'none'; })()`));
    problems.push(...await hoverAll(win, `${w}x${h}-members`));
  }
  if (problems.length) return fail(`${problems.length} problem(s):\n  ${problems.join('\n  ')}`);
  console.log('[e2e-hover] OK');
  setTimeout(() => app.exit(0), 200);
}

require('../main.cjs');
