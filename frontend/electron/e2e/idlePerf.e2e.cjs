'use strict';

/**
 * Idle CPU / RAM probe (3.7.15). Boots the real app against the mock API, opens a DM,
 * then measures while idle: per-process CPU + memory (app.getAppMetrics), running
 * animations, rAF / timer rates with their call sites, backdrop-filter surfaces and a
 * renderer CPU profile. Same again with the window minimized and hidden (tray).
 * Run: ELECTRON_BUILD=1 npx vite build && xvfb-run -a npx electron electron/e2e/idlePerf.e2e.cjs --no-sandbox
 * Env PERF_JSON=<file> writes the full result. Exit 0 always (it is a probe), unless it crashes.
 *
 * (Old header kept below for the fixture.)
 * Checks, in a DM with enough messages to scroll: the composer has no band of its
 * own (the message list runs to the bottom of the panel and scrolls under it),
 * the last message still clears the composer when scrolled to the bottom, the
 * field blurs what is behind it, and the send button is centred in the field
 * with the same inset on the right as top / bottom.
 * Run from frontend/ after an Electron build (ELECTRON_BUILD=1 npx vite build):
 *   xvfb-run -a npx electron electron/e2e/composerFloat.e2e.cjs --no-sandbox
 * Env: DESCALL_E2E_SHOTS=<dir>. Prints "[perf] OK" or "[perf] FAIL ...".
 *
 * (Fixture derived from hoverToolbar.e2e.cjs.)
 *
 * Boots the real main process (electron/main.cjs) against the built dist/, signed in
 * against an in-process mock API (nothing leaves the machine). It opens a DM, hovers
 * the first and last message of each group at several window widths (and with the
 * conversation's side panel open when there is one), and checks that the hover pill:
 *   - sits directly above the hovered bubble (6px gap, aligned to its left or right edge),
 *     or straddles its top edge under the header when there is no room above,
 *   - 3.1: beside the bubble on its first line (or on its own top-right corner)
 *     when the pill above would cover another message; never over another message,
 *   - sits inside the chat column with an inset (never clipped),
 *   - never overlaps the row's avatar, name, badges or time,
 *   - never overlaps the floating conversation header.
 *
 * Run from frontend/ after an Electron build (ELECTRON_BUILD=1 npx vite build):
 *   xvfb-run -a npx electron electron/e2e/hoverToolbar.e2e.cjs --no-sandbox
 * Env: DESCALL_E2E_SHOTS=<dir> saves screenshots; DESCALL_E2E_WIDTHS="1024x670,800x600".
 * Prints "[perf] OK" and exits 0, or "[perf] FAIL <reason>" and exits 1.
 */

const { app, protocol, safeStorage } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');

const SHOTS = process.env.DESCALL_E2E_SHOTS || '';
const WIDTHS = (process.env.DESCALL_E2E_WIDTHS || '1024x670,1280x800,1100x700,960x640,860x620,720x560').split(',').map((s) => s.split('x').map(Number));
const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'descall-e2e-perf-'));
app.setPath('userData', userData);
app.commandLine.appendSwitch('host-resolver-rules', 'MAP * ~NOTFOUND');
app.commandLine.appendSwitch('force-device-scale-factor', '1');

const log = (...a) => console.log('[perf]', ...a);
let failed = false;
function fail(reason) {
  if (failed) return;
  failed = true;
  console.error(`[perf] FAIL ${reason}`);
  setTimeout(() => app.exit(1), 200);
}
setTimeout(() => fail('timed out'), 240000).unref();

const ME = { id: 'u-e2e', username: 'Demirr', displayName: 'Demirr', display_name: 'Demirr', isAdmin: true, is_admin: true, role: 'admin', country: 'TR', countryCode: 'TR', language: 'tr', createdAt: '2025-01-01T00:00:00Z', emailVerified: true, birthDate: '2000-01-01', blockedUsers: [] };
const PEER = { id: 'u-peer', username: 'sn1pez53', displayName: 'sn1pez53 the longest name', display_name: 'sn1pez53 the longest name', isAdmin: true, is_admin: true, role: 'admin', country: 'TR', countryCode: 'TR' };
const now = Date.now();
const MSGS = [
  ['u-e2e', 'Selam'], ['u-e2e', 'Naber'], ['u-peer', 'İyi, sen?'], ['u-e2e', 'Ben de iyiyim'],
  ['u-peer', '/daily,'], ['u-peer', 'noldu'], ['u-e2e', 'Tamam'], ['u-e2e', 'Görüşürüz, akşam sesli kanala gelirim'], ['u-peer', 'ok'],
].concat(Array.from({ length: 24 }, (_, i) => [i % 3 ? 'u-peer' : 'u-e2e', `Mesaj ${i + 1}: biraz daha uzun bir satır, liste kaydırılabilsin diye`]))
  .map(([from, text], i) => ({ id: `m${i}`, text, from: from === 'u-e2e' ? ME : PEER, sender_id: from, timestamp: new Date(now - (40 - i) * 60000).toISOString() }));

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



// In-page code lives in real functions, injected with fn.toString(), so nothing is escaped twice.
function pageInstrument() {
  if (window.__perfProbe) return true;
  const site = () => {
    const lines = String(new Error().stack || '').split('\n').slice(2);
    const l = lines.find((x) => !/pageInstrument|__perfProbe/.test(x)) || '';
    return l.trim().replace(/\?[^:)]*/, '').slice(0, 160);
  };
  const p = window.__perfProbe = { raf: 0, rafSites: {}, timers: 0, timerSites: {}, intervals: {} };
  const oRaf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb) => { const s = site(); return oRaf((t) => { p.raf++; p.rafSites[s] = (p.rafSites[s] || 0) + 1; cb(t); }); };
  const oST = window.setTimeout.bind(window);
  window.setTimeout = (fn, ms, ...a) => { const s = site(); return oST((...b) => { p.timers++; const k = s + ' @' + ms; p.timerSites[k] = (p.timerSites[k] || 0) + 1; if (typeof fn === 'function') fn(...b); }, ms, ...a); };
  const oSI = window.setInterval.bind(window);
  window.setInterval = (fn, ms, ...a) => { const s = site(); return oSI((...b) => { p.timers++; const k = s + ' @' + ms; p.intervals[k] = (p.intervals[k] || 0) + 1; if (typeof fn === 'function') fn(...b); }, ms, ...a); };
  return true;
}

function pageSnapshot() {
  const p = window.__perfProbe || {};
  const desc = (el) => {
    if (!el || !el.tagName) return '?';
    const raw = el.className && el.className.baseVal !== undefined ? el.className.baseVal : (el.className || '');
    const c = String(raw).trim().split(/\s+/).filter(Boolean).slice(0, 3).join('.');
    return el.tagName.toLowerCase() + (c ? '.' + c : '');
  };
  const anims = (document.getAnimations ? document.getAnimations() : []).filter((a) => a.playState === 'running');
  const animList = {};
  for (const a of anims) {
    const t = a.effect && a.effect.getTiming ? a.effect.getTiming() : {};
    const k = (a.animationName || a.transitionProperty || a.constructor.name) + ' on ' + desc(a.effect && a.effect.target) + (t.iterations === Infinity ? ' (infinite)' : '');
    animList[k] = (animList[k] || 0) + 1;
  }
  const vw = innerWidth * innerHeight;
  let bf = 0; let bfArea = 0; const bfList = {}; let willChange = 0; let filters = 0;
  for (const el of document.querySelectorAll('*')) {
    const base = getComputedStyle(el);
    if (base.willChange && base.willChange !== 'auto') willChange++;
    if (base.filter && base.filter !== 'none') filters++;
    for (const pseudo of [null, '::before', '::after']) {
      const cs = pseudo ? getComputedStyle(el, pseudo) : base;
      const f = cs.backdropFilter || cs.webkitBackdropFilter;
      if (!f || f === 'none') continue;
      const r = el.getBoundingClientRect();
      if (r.width * r.height < 4) continue;
      bf++; bfArea += r.width * r.height;
      bfList[desc(el) + (pseudo || '') + ' ' + f] = Math.round((r.width * r.height) / vw * 100);
    }
  }
  return {
    raf: p.raf || 0, rafSites: p.rafSites || {}, timers: p.timers || 0, timerSites: p.timerSites || {}, intervals: p.intervals || {},
    animations: animList, backdrop: { count: bf, screens: Math.round(bfArea / vw * 100) / 100, list: bfList },
    willChange, filters, nodes: document.getElementsByTagName('*').length,
    heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null,
    hidden: document.hidden, vis: document.visibilityState, htmlClass: document.documentElement.className,
  };
}

function pageReset() {
  const p = window.__perfProbe;
  if (p) { p.raf = 0; p.rafSites = {}; p.timers = 0; p.timerSites = {}; p.intervals = {}; }
  return true;
}

function pageInjectCss(css) {
  const s = document.createElement('style');
  s.setAttribute('data-perf', '1');
  s.textContent = css;
  document.head.appendChild(s);
  return true;
}

const call = (fn, ...args) => `(${fn.toString()})(${args.map((a) => JSON.stringify(a)).join(',')})`;
const INSTRUMENT = call(pageInstrument);
const SNAPSHOT = call(pageSnapshot);
const RESET = call(pageReset);

function metrics() {
  const rows = app.getAppMetrics().map((m) => ({ type: m.type, name: m.name || m.serviceName || '', pid: m.pid, cpu: Math.round(m.cpu.percentCPUUsage * 10) / 10, wakeups: m.cpu.idleWakeupsPerSecond, memMB: Math.round((m.memory.workingSetSize || 0) / 1024) }));
  return { rows, cpu: Math.round(rows.reduce((s, r) => s + r.cpu, 0) * 10) / 10, memMB: rows.reduce((s, r) => s + r.memMB, 0) };
}

async function phase(win, label, seconds) {
  await js(win, RESET);
  metrics(); // prime the CPU counters (percentCPUUsage is since the last call)
  const samples = [];
  for (let i = 0; i < seconds; i++) { await sleep(1000); samples.push(metrics()); }
  const snap = await js(win, SNAPSHOT).catch((e) => ({ error: e.message }));
  const avg = (k) => Math.round(samples.reduce((s, x) => s + x[k], 0) / samples.length * 10) / 10;
  const byType = {};
  for (const s of samples) for (const r of s.rows) { const k = `${r.type}${r.name ? ':' + r.name : ''}`; byType[k] = byType[k] || { cpu: 0, mem: 0, n: 0, wakeups: 0 }; byType[k].cpu += r.cpu; byType[k].mem = Math.max(byType[k].mem, r.memMB); byType[k].wakeups += r.wakeups; byType[k].n++; }
  for (const k of Object.keys(byType)) { byType[k].cpu = Math.round(byType[k].cpu / samples.length * 10) / 10; byType[k].wakeups = Math.round(byType[k].wakeups / samples.length); delete byType[k].n; }
  const out = { label, seconds, cpuAvg: avg('cpu'), memMB: samples.at(-1).memMB, processes: samples.at(-1).rows.length, byType, rafPerSec: Math.round((snap.raf || 0) / seconds), timersPerSec: Math.round((snap.timers || 0) / seconds), snap };
  log(label, JSON.stringify({ cpuAvg: out.cpuAvg, memMB: out.memMB, processes: out.processes, rafPerSec: out.rafPerSec, timersPerSec: out.timersPerSec, byType }));
  return out;
}

async function profile(win, seconds) {
  const dbg = win.webContents.debugger;
  try { dbg.attach('1.3'); } catch (_) {}
  await dbg.sendCommand('Profiler.enable');
  await dbg.sendCommand('Profiler.setSamplingInterval', { interval: 200 });
  await dbg.sendCommand('Profiler.start');
  await sleep(seconds * 1000);
  const { profile: prof } = await dbg.sendCommand('Profiler.stop');
  const self = {};
  const total = prof.samples.length || 1;
  const byId = new Map(prof.nodes.map((n) => [n.id, n]));
  const counts = {};
  for (const s of prof.samples) counts[s] = (counts[s] || 0) + 1;
  for (const [id, c] of Object.entries(counts)) {
    const n = byId.get(Number(id)); const f = n.callFrame;
    const k = `${f.functionName || '(anon)'} ${String(f.url).split('/').pop()}:${f.lineNumber + 1}:${f.columnNumber + 1}`;
    self[k] = (self[k] || 0) + c;
  }
  const top = Object.entries(self).sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, c]) => [k, Math.round(c / total * 1000) / 10]);
  try { dbg.detach(); } catch (_) {}
  return { samples: total, top };
}

async function run(win) {
  await waitFor(win, 'boot', `(() => ({ ok: !document.querySelector('#boot-splash') && (document.getElementById('root')?.innerText || '').length > 0 }))()`);
  await sleep(3000);
  await js(win, `(() => { localStorage.setItem('descall:cookie_consent_v1', JSON.stringify({ choice: 'rejected', at: new Date().toISOString() })); return true; })()`);
  win.webContents.reload();
  await sleep(1500);
  await waitFor(win, 'boot after consent', `(() => ({ ok: !document.querySelector('#boot-splash') && (document.getElementById('root')?.innerText || '').length > 0 }))()`);
  log('instrument', await js(win, INSTRUMENT));
  if (process.env.PERF_THEME) log('theme', await js(win, `(() => { document.documentElement.setAttribute('data-theme', ${JSON.stringify(process.env.PERF_THEME)}); return document.documentElement.getAttribute('data-theme'); })()`));
  if (process.env.PERF_EVAL) log('eval', await js(win, process.env.PERF_EVAL));
  if (process.env.PERF_NO_BACKDROP) log('no-backdrop', await js(win, call(pageInjectCss, '*,*::before,*::after{backdrop-filter:none!important;-webkit-backdrop-filter:none!important}')));
  if (process.env.PERF_NO_ANIM) log('no-anim', await js(win, call(pageInjectCss, '*,*::before,*::after{animation:none!important;transition:none!important}')));
  win.setContentSize(1280, 800);
  await js(win, `history.pushState({}, '', '/direct/${PEER.username}'); dispatchEvent(new PopStateEvent('popstate')); true`);
  await waitFor(win, 'messages', `(() => ({ ok: document.querySelectorAll('.message-bubble').length >= 5 }))()`);
  for (let k = 0; k < 3; k++) {
    await js(win, `(() => { const b = [...document.querySelectorAll('button')].find((x) => /^(Later|Sonra|Daha sonra)$/.test(x.textContent.trim()) && x.offsetParent); if (b) b.click(); return !!b; })()`);
    await sleep(400);
  }
  win.webContents.sendInputEvent({ type: 'mouseMove', x: 5, y: 5 });
  await sleep(8000);
  const result = { classes: await js(win, 'document.documentElement.className') };
  result.visible = await phase(win, 'visible-idle', Number(process.env.PERF_SECONDS || 15));
  result.profileVisible = await profile(win, 8);
  if (process.env.PERF_THROTTLE) { win.webContents.setBackgroundThrottling(true); log('throttle', 'backgroundThrottling on'); }
  win.minimize();
  await sleep(3000);
  result.minimized = await phase(win, 'minimized', 10);
  win.restore();
  await sleep(1500);
  win.hide();
  await sleep(3000);
  result.hidden = await phase(win, 'hidden-tray', 10);
  result.profileHidden = await profile(win, 6);
  win.show();
  if (process.env.PERF_JSON) fs.writeFileSync(process.env.PERF_JSON, JSON.stringify(result, null, 2));
  log('DONE');
  setTimeout(() => app.exit(0), 200);
}

require('../main.cjs');
