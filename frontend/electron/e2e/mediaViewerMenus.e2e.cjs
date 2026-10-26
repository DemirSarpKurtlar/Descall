'use strict';

/**
 * Electron fixture for the chat image viewer and the composer menus (2.13.x bug fixes).
 *
 * Boots the real main process (electron/main.cjs) against the built dist/, signed in
 * against an in-process mock API (nothing leaves the machine), opens a DM with a tall
 * (phone screenshot) and a wide image and checks, at several window sizes:
 *
 *   Image viewer (MessageMediaLightbox)
 *     - the top glass bar (sender + İndir / Kopyala / Orijinali aç / Kapat) sits fully
 *       below the custom title bar and inside the window, and every button is the
 *       topmost element at its centre (nothing covers it, the title bar included);
 *     - the image frame is contained: inside the stage, between the top bar and the
 *       zoom pill, never touching either; the zoom pill and the hint row are inside the
 *       window; the image keeps its aspect ratio (object-fit contain).
 *
 *   Composer menus (+ attachment menu, emoji picker)
 *     - an online status dot of a chat avatar under the menu never paints above it:
 *       every sampled point of the menu hits the menu (status dots are made hit-testable
 *       for the probe);
 *     - the menu is heavy frosted glass: opaque base (alpha >= 0.9) or a backdrop blur
 *       of at least 20px on a base of alpha >= 0.8.
 *     - the menu stays inside the window, below the title bar (a short window used to
 *       push the 420px emoji picker off the top).
 *
 *   Web: the viewer again at 1280x800 with the electron-app classes removed and the
 *   title bar hidden (the layout the browser build gets).
 *
 * Presence arrives over Socket.IO, which the mock does not serve, so the probe adds the
 * exact markup <StatusBadge status="online"> renders (span.status-badge.status-online)
 * to each message avatar.
 *
 * Run from frontend/ after an Electron build (ELECTRON_BUILD=1 npx vite build):
 *   xvfb-run -a -s "-screen 0 1920x1200x24" npx electron electron/e2e/mediaViewerMenus.e2e.cjs --no-sandbox
 * Env: DESCALL_E2E_SHOTS=<dir> saves screenshots; DESCALL_E2E_SIZES="1024x688,640x480".
 * Prints "[e2e-media] OK" and exits 0, or "[e2e-media] FAIL <reason>" and exits 1.
 */

const { app, protocol, safeStorage } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');

const SHOTS = process.env.DESCALL_E2E_SHOTS || '';
const SIZES = (process.env.DESCALL_E2E_SIZES || '1024x688,1280x800,1920x1080,800x600,640x480').split(',').map((s) => s.split('x').map(Number));
const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'descall-e2e-media-'));
app.setPath('userData', userData);
app.commandLine.appendSwitch('host-resolver-rules', 'MAP * ~NOTFOUND');
app.commandLine.appendSwitch('force-device-scale-factor', '1');

const log = (...a) => console.log('[e2e-media]', ...a);
let failed = false;
function fail(reason) {
  if (failed) return;
  failed = true;
  console.error(`[e2e-media] FAIL ${reason}`);
  setTimeout(() => app.exit(1), 200);
}
setTimeout(() => fail('timed out'), 300000).unref();

const ME = { id: 'u-e2e', username: 'Demirr', displayName: 'Demir', display_name: 'Demir', isAdmin: true, is_admin: true, role: 'admin', country: 'TR', countryCode: 'TR', language: 'tr', createdAt: '2025-01-01T00:00:00Z', emailVerified: true, birthDate: '2000-01-01', blockedUsers: [] };
const PEER = { id: 'u-peer', username: 'sn1pez53', displayName: 'sn1pez53', display_name: 'sn1pez53', country: 'TR', countryCode: 'TR' };

// Fixture images: SVG served from an allowed image host (img-src *.githubusercontent.com).
const MEDIA = 'https://e2e.githubusercontent.com/media';
function phoneSvg() {
  const rows = [];
  for (let i = 0; i < 8; i++) {
    const y = 520 + i * 250;
    rows.push(`<rect x="60" y="${y}" width="500" height="210" rx="36" fill="#2a2c36"/><rect x="610" y="${y}" width="500" height="210" rx="36" fill="#2a2c36"/>`,
      `<text x="100" y="${y + 70}" font-size="34" fill="#9a9cab" font-family="sans-serif">METRİK ${i * 2 + 1}</text><text x="100" y="${y + 160}" font-size="76" fill="#fff" font-family="sans-serif" font-weight="700">${(i + 1) * 27}</text>`,
      `<text x="650" y="${y + 70}" font-size="34" fill="#9a9cab" font-family="sans-serif">METRİK ${i * 2 + 2}</text><text x="650" y="${y + 160}" font-size="76" fill="#fff" font-family="sans-serif" font-weight="700">${(i + 3) * 19}</text>`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1170" height="2532" viewBox="0 0 1170 2532"><rect width="1170" height="2532" fill="#16171d"/><rect x="0" y="0" width="1170" height="160" fill="#1d1e26"/><text x="80" y="110" font-size="48" fill="#fff" font-family="sans-serif">14:14</text><text x="80" y="300" font-size="72" fill="#fff" font-family="sans-serif" font-weight="700">Yönetici Paneli</text><text x="80" y="380" font-size="38" fill="#9a9cab" font-family="sans-serif">Kayıt ve kullanıcı analitiği (mock)</text>${rows.join('')}<rect x="8" y="8" width="1154" height="2516" fill="none" stroke="#5865f2" stroke-width="16"/></svg>`;
}
function wideSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3b2a7a"/><stop offset="1" stop-color="#0f6b7a"/></linearGradient></defs><rect width="1920" height="1080" fill="url(#g)"/><circle cx="1420" cy="320" r="180" fill="#ffd36a"/><path d="M0 820 L520 460 L900 760 L1300 520 L1920 900 L1920 1080 L0 1080Z" fill="#1b1f3a"/><text x="90" y="160" font-size="96" fill="#fff" font-family="sans-serif" font-weight="700">Kapadokya (mock)</text><rect x="12" y="12" width="1896" height="1056" fill="none" stroke="#fff" stroke-width="20"/></svg>`;
}

const now = Date.now();
const MSGS = [
  { id: 'm0', from: PEER, sender_id: PEER.id, text: 'Selam, panelin son hâli:', timestamp: new Date(now - 9 * 60000).toISOString() },
  { id: 'm1', from: PEER, sender_id: PEER.id, text: '', mediaUrl: `${MEDIA}/phone.png`, mediaType: 'image', mimeType: 'image/png', originalName: 'phone.png', timestamp: new Date(now - 8 * 60000).toISOString() },
  { id: 'm2', from: ME, sender_id: ME.id, text: 'Güzel olmuş, yatay olan da şu', timestamp: new Date(now - 6 * 60000).toISOString() },
  { id: 'm3', from: ME, sender_id: ME.id, text: '', mediaUrl: `${MEDIA}/wide.png`, mediaType: 'image', mimeType: 'image/png', originalName: 'wide.png', timestamp: new Date(now - 5 * 60000).toISOString() },
  { id: 'm4', from: PEER, sender_id: PEER.id, text: 'Tamam, akşam bakarım', timestamp: new Date(now - 2 * 60000).toISOString() },
];

function body(url) {
  const p = url.pathname;
  if (p === '/auth/me') return { user: ME };
  if (p.includes('/dm/') && p.endsWith('/messages')) return { withUserId: PEER.id, hasMore: false, messages: MSGS };
  if (p.includes('/friends/list')) return { friends: [PEER] };
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
  if (url.hostname === 'e2e.githubusercontent.com') {
    const svg = url.pathname.endsWith('/phone.png') ? phoneSvg() : wideSvg();
    return new Response(svg, { status: 200, headers: { ...headers, 'content-type': 'image/svg+xml' } });
  }
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

// ---- image viewer ---------------------------------------------------------------------
const VIEWER = `(() => {
  const r = (e) => { if (!e) return null; const b = e.getBoundingClientRect(); return { l: Math.round(b.left), t: Math.round(b.top), r: Math.round(b.right), b: Math.round(b.bottom), w: Math.round(b.width), h: Math.round(b.height) }; };
  const root = document.querySelector('.mv-root');
  const img = document.querySelector('.mv-img');
  if (!root || !img || !img.complete || !img.naturalWidth) return { ok: false, why: 'viewer/img not ready' };
  const tb = document.querySelector('.titlebar');
  const tbBottom = tb && getComputedStyle(tb).display !== 'none' ? tb.getBoundingClientRect().bottom : 0;
  const top = document.querySelector('.mv-top'), frame = document.querySelector('.mv-frame'), stage = document.querySelector('.mv-stage');
  const bottom = document.querySelector('.mv-bottom'), hint = document.querySelector('.mv-hint');
  const btns = [...top.querySelectorAll('button')].map((b) => {
    const bb = b.getBoundingClientRect(); const hit = document.elementFromPoint(bb.left + bb.width / 2, bb.top + bb.height / 2);
    return { label: b.getAttribute('aria-label'), covered: !(hit && b.contains(hit)), by: hit && !b.contains(hit) ? String(hit.className || hit.tagName).slice(0, 40) : '' };
  });
  const ib = img.getBoundingClientRect();
  return { ok: true, vw: innerWidth, vh: innerHeight, tbBottom: Math.round(tbBottom), top: r(top), frame: r(frame), stage: r(stage), img: r(img),
    bottom: r(bottom), hint: hint && getComputedStyle(hint).display !== 'none' ? r(hint) : null, btns,
    ratio: +(ib.width / ib.height).toFixed(3), natural: +(img.naturalWidth / img.naturalHeight).toFixed(3) };
})()`;

function checkViewer(m, tag) {
  const p = [];
  const inWin = (b, name) => { if (b && (b.l < 0 || b.t < 0 || b.r > m.vw || b.b > m.vh)) p.push(`${tag}: ${name} outside the window ${JSON.stringify(b)} (${m.vw}x${m.vh})`); };
  if (m.top.t < m.tbBottom + 4) p.push(`${tag}: top bar starts at ${m.top.t}, title bar ends at ${m.tbBottom}`);
  inWin(m.top, 'top bar'); inWin(m.frame, 'frame'); inWin(m.bottom, 'zoom pill'); inWin(m.hint, 'hint');
  const cov = m.btns.filter((b) => b.covered);
  if (cov.length) p.push(`${tag}: top bar buttons covered: ${cov.map((b) => `${b.label} by ${b.by}`).join(', ')}`);
  if (m.frame.t < m.top.b + 4) p.push(`${tag}: frame (${m.frame.t}) touches the top bar (${m.top.b})`);
  if (m.frame.b > m.bottom.t - 4) p.push(`${tag}: frame (${m.frame.b}) touches the zoom pill (${m.bottom.t})`);
  if (m.img.t < m.frame.t - 1 || m.img.b > m.frame.b + 1 || m.img.l < m.frame.l - 1 || m.img.r > m.frame.r + 1) p.push(`${tag}: image ${JSON.stringify(m.img)} spills out of its frame ${JSON.stringify(m.frame)}`);
  if (m.frame.t < m.stage.t - 1 || m.frame.b > m.stage.b + 1) p.push(`${tag}: frame ${JSON.stringify(m.frame)} taller than the stage ${JSON.stringify(m.stage)}`);
  if (m.hint && m.hint.t < m.bottom.b) p.push(`${tag}: hint overlaps the zoom pill`);
  if (Math.abs(m.ratio - m.natural) / m.natural > 0.03) p.push(`${tag}: image aspect ${m.ratio} != natural ${m.natural} (not contained)`);
  if (m.img.h < 120) p.push(`${tag}: image only ${m.img.h}px tall`);
  return p;
}

async function viewerAt(win, tag, which) {
  const problems = [];
  const opened = await js(win, `(() => { const t = [...document.querySelectorAll('.message-media-trigger')][${which}]; if (!t) return false; t.scrollIntoView({ block: 'center' }); t.click(); return true; })()`);
  if (!opened) return [`${tag}: image ${which} not found`];
  let m;
  try { m = await waitFor(win, `${tag} viewer`, VIEWER, 10000); } catch (e) { return [e.message]; }
  await sleep(600);
  m = await js(win, VIEWER);
  problems.push(...checkViewer(m, tag));
  log(tag, `${m.vw}x${m.vh}`, `titlebar ${m.tbBottom}`, `top ${m.top.t}-${m.top.b}`, `frame ${m.frame.t}-${m.frame.b} (${m.frame.w}x${m.frame.h})`, `img ${m.img.w}x${m.img.h}`, `pill ${m.bottom.t}-${m.bottom.b}`, m.hint ? `hint ${m.hint.t}-${m.hint.b}` : 'no hint');
  await shot(win, `viewer-${tag}.png`);
  await js(win, `document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); true`);
  await waitFor(win, `${tag} viewer closed`, `({ ok: !document.querySelector('.mv-root') })`, 5000).catch((e) => problems.push(e.message));
  await sleep(300);
  return problems;
}

// ---- composer menus -------------------------------------------------------------------
const ADD_DOTS = `(() => {
  for (const a of document.querySelectorAll('.message-avatar')) {
    if (a.querySelector('.status-badge')) continue;
    const s = document.createElement('span'); s.className = 'status-badge status-online'; s.title = 'Çevrimiçi'; s.setAttribute('aria-label', 'Çevrimiçi'); a.appendChild(s);
  }
  return document.querySelectorAll('.message-avatar .status-badge').length;
})()`;
// Moves the last message row's avatar dot under the menu (scrolls the list so the row's
// avatar sits behind the menu's first row), then samples the menu.
const PROBE_MENU = (sel) => `(() => {
  const menu = document.querySelector(${JSON.stringify(sel)});
  if (!menu) return { ok: false, why: 'no menu' };
  const mr = menu.getBoundingClientRect();
  if (mr.width < 20 || getComputedStyle(menu).opacity < 0.99) return { ok: false, why: 'menu not settled' };
  const dots = [...document.querySelectorAll('.status-badge')];
  dots.forEach((d) => { d.dataset.pe = d.style.pointerEvents; d.style.pointerEvents = 'auto'; });
  const under = dots.filter((d) => { const b = d.getBoundingClientRect(); return b.width && b.left < mr.right && b.right > mr.left && b.top < mr.bottom && b.bottom > mr.top; }).length;
  const bad = [];
  for (let ix = 1; ix < 12; ix++) for (let iy = 1; iy < 12; iy++) {
    const x = mr.left + (mr.width * ix) / 12, y = mr.top + (mr.height * iy) / 12;
    const hit = document.elementFromPoint(x, y);
    if (!hit || !menu.contains(hit)) bad.push({ x: Math.round(x), y: Math.round(y), by: hit ? String(hit.className || hit.tagName).slice(0, 40) : 'none', chain: window.__e2eChain ? window.__e2eChain(hit) : undefined });
  }
  for (const d of dots) { const b = d.getBoundingClientRect(); const cx = b.left + b.width / 2, cy = b.top + b.height / 2;
    if (cx > mr.left && cx < mr.right && cy > mr.top && cy < mr.bottom) { const hit = document.elementFromPoint(cx, cy); if (!hit || !menu.contains(hit)) bad.push({ x: Math.round(cx), y: Math.round(cy), by: 'status dot ' + String(hit && hit.className).slice(0, 30) }); } }
  dots.forEach((d) => { d.style.pointerEvents = d.dataset.pe || ''; delete d.dataset.pe; });
  const cs = getComputedStyle(menu);
  const alpha = (c) => { const m = String(c).match(/rgba?\\(([^)]+)\\)/); if (!m) return 0; const p = m[1].split(/[ ,\\/]+/).filter(Boolean); return p.length > 3 ? parseFloat(p[3]) : 1; };
  const blur = (() => { const m = String(cs.backdropFilter || cs.webkitBackdropFilter || '').match(/blur\\(([\\d.]+)px\\)/); return m ? parseFloat(m[1]) : 0; })();
  const z = []; for (let n = menu; n && n !== document.documentElement; n = n.parentElement) { const s = getComputedStyle(n); if (s.zIndex !== 'auto' || s.isolation === 'isolate' || s.transform !== 'none' || s.backdropFilter !== 'none' || s.filter !== 'none' || s.contain.includes('paint')) z.push(String(n.className).split(' ')[0] + ':' + s.zIndex); }
  const tb = document.querySelector('.titlebar'); const tbBottom = tb ? Math.round(tb.getBoundingClientRect().bottom) : 0;
  return { ok: true, tbBottom, vw: innerWidth, vh: innerHeight, rect: { l: Math.round(mr.left), t: Math.round(mr.top), w: Math.round(mr.width), h: Math.round(mr.height) }, under, bad, alpha: alpha(cs.backgroundColor), blur, parent: menu.parentElement === document.body ? 'body' : String(menu.parentElement.className).slice(0, 40), chain: z.slice(0, 8) };
})()`;

function checkMenu(m, tag) {
  const p = [];
  if (m.bad.length) p.push(`${tag}: ${m.bad.length} point(s) of the menu are covered, e.g. ${JSON.stringify(m.bad.slice(0, 3))}`);
  const heavy = m.alpha >= 0.9 || (m.blur >= 20 && m.alpha >= 0.8);
  if (!heavy) p.push(`${tag}: menu glass too thin (base alpha ${m.alpha}, blur ${m.blur}px)`);
  const r = m.rect;
  if (r.t < m.tbBottom || r.l < 0 || r.l + r.w > m.vw || r.t + r.h > m.vh) p.push(`${tag}: menu ${JSON.stringify(r)} leaves the window below the title bar (titlebar ${m.tbBottom}, window ${m.vw}x${m.vh})`);
  return p;
}

async function placeAvatarUnder(win, sel) {
  // Scroll the message list so a message avatar (with its dot) sits right under the menu.
  return js(win, `(() => {
    const menu = document.querySelector(${JSON.stringify(sel)}); if (!menu) return false;
    const mr = menu.getBoundingClientRect();
    const av = [...document.querySelectorAll('.message-avatar')].pop(); if (!av) return false;
    let list = av.closest('.message-list');
    for (let n = list; n && n !== document.body; n = n.parentElement) { if (/(auto|scroll)/.test(getComputedStyle(n).overflowY) && n.scrollHeight > n.clientHeight) { list = n; break; } }
    const want = mr.top + Math.min(40, mr.height / 3);
    list.scrollTop += av.getBoundingClientRect().top - want;
    return true;
  })()`);
}

async function menuAt(win, tag, kind) {
  const problems = [];
  const open = kind === 'attach'
    ? `(() => { const b = document.querySelector('.composer-left .composer-action-btn'); if (!b) return false; b.click(); return true; })()`
    : `(() => { const b = [...document.querySelectorAll('.message-composer button')].find((x) => /emoji/i.test(x.getAttribute('aria-label') || x.title || '')); if (!b) return false; b.click(); return true; })()`;
  const sel = kind === 'attach' ? '.attachment-menu' : '.emoji-picker';
  if (!(await js(win, open))) return [`${tag}: ${kind} button not found`];
  try { await waitFor(win, `${tag} ${kind} menu`, PROBE_MENU(sel), 5000); } catch (e) { return [e.message]; }
  await placeAvatarUnder(win, sel);
  await sleep(500);
  const m = await js(win, PROBE_MENU(sel));
  problems.push(...checkMenu(m, `${tag} ${kind}`));
  if (kind === 'attach' && !m.under) problems.push(`${tag} attach: probe could not place a status dot under the menu`);
  log(tag, kind, `menu ${JSON.stringify(m.rect)}`, `dots under ${m.under}`, `covered ${m.bad.length}`, `alpha ${m.alpha} blur ${m.blur}px`, `parent ${m.parent}`, m.chain.join(' > '));
  await shot(win, `${kind}-${tag}.png`);
  await js(win, open); // toggle closed
  await sleep(400);
  await js(win, `document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); true`);
  await sleep(200);
  return problems;
}

// A promo "Sana bir kod var" alert can open over the app from the generic mock replies.
async function dismissAlerts(win) {
  for (let i = 0; i < 3; i++) {
    const had = await js(win, `(() => { const s = document.querySelector('.g-alert-scrim'); if (!s) return false; const b = [...s.querySelectorAll('button')].find((x) => /^(Sonra|Later|Kapat|Close)$/i.test((x.textContent || x.getAttribute('aria-label') || '').trim())) || s.querySelector('button'); b && b.click(); return true; })()`);
    if (!had) return;
    await sleep(500);
  }
}

async function run(win) {
  await waitFor(win, 'boot', `(() => ({ ok: !document.querySelector('#boot-splash') && (document.getElementById('root')?.innerText || '').length > 0 }))()`);
  await sleep(4000);
  await js(win, `(() => { localStorage.setItem('descall:cookie_consent_v1', JSON.stringify({ choice: 'rejected', at: new Date().toISOString() })); return true; })()`);
  win.webContents.reload();
  await sleep(1500);
  await waitFor(win, 'boot after consent', `(() => ({ ok: !document.querySelector('#boot-splash') && (document.getElementById('root')?.innerText || '').length > 0 }))()`);
  await sleep(3000);
  // Stacking-context chain of an element (logged for covered points).
  await js(win, `window.__e2eChain = (el) => { const out = []; for (let n = el; n && n !== document.documentElement; n = n.parentElement) { const s = getComputedStyle(n); const why = [s.zIndex !== 'auto' && s.position !== 'static' ? 'z' + s.zIndex : '', s.isolation === 'isolate' ? 'iso' : '', s.transform !== 'none' ? 'tf' : '', s.backdropFilter !== 'none' ? 'bf' : '', s.filter !== 'none' ? 'f' : '', s.willChange && s.willChange !== 'auto' ? 'wc:' + s.willChange : '', s.contain && s.contain !== 'none' ? 'ct' : '', +s.opacity < 1 ? 'op' : ''].filter(Boolean); if (why.length) out.push(String(n.className || n.tagName).split(' ')[0] + '[' + why.join(',') + ']'); } return out.join(' < '); }; true`);
  await dismissAlerts(win);
  const problems = [];
  win.setMinimumSize(640, 480);
  for (const [w, h] of SIZES) {
    win.setContentSize(w, h);
    await sleep(600);
    const tag = `${w}x${h}`;
    await js(win, `history.pushState({}, '', '/direct/${PEER.username}'); dispatchEvent(new PopStateEvent('popstate')); true`);
    await waitFor(win, 'messages', `(() => ({ ok: document.querySelectorAll('.message-media-trigger img').length >= 2 && [...document.querySelectorAll('.message-media-trigger img')].every((i) => i.complete && i.naturalWidth) }))()`);
    await sleep(800);
    await dismissAlerts(win);
    problems.push(...await viewerAt(win, `${tag}-tall`, 0));
    problems.push(...await viewerAt(win, `${tag}-wide`, 1));
    await js(win, ADD_DOTS);
    problems.push(...await menuAt(win, tag, 'attach'));
    problems.push(...await menuAt(win, tag, 'emoji'));
  }
  // Web layout: same viewer with no custom title bar (--electron-titlebar-h is 0 there).
  win.setContentSize(1280, 800);
  await sleep(600);
  await js(win, `(() => { for (const n of [document.documentElement, document.body]) n.classList.remove('electron-app'); const tb = document.querySelector('.titlebar'); if (tb) tb.style.display = 'none'; return true; })()`);
  await sleep(400);
  problems.push(...await viewerAt(win, 'web-1280x800-tall', 0));
  problems.push(...await viewerAt(win, 'web-1280x800-wide', 1));
  if (problems.length) return fail(`${problems.length} problem(s):\n  ${problems.join('\n  ')}`);
  console.log('[e2e-media] OK');
  setTimeout(() => app.exit(0), 200);
}

require('../main.cjs');
