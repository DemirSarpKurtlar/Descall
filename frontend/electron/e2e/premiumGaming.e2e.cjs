'use strict';

/**
 * Descall Ultra gaming / productivity smoke. Boots the real main process (electron/main.cjs)
 * against the built dist/ and an in-process mock API that grants "ultra" (renderer and the
 * main-process gate both read /api/premium/me). Then, through the real premium bridge:
 *   - opens the voice HUD and the gaming HUD (click-through overlay windows),
 *   - opens a desktop widget,
 *   - opens the command center and the gaming hub,
 *   - starts the instant clip ring buffer on a desktopCapturer source, saves a clip,
 *     muxes it (mediabunny) and opens the editor,
 *   - measures CPU / RAM idle (premium on, features off) and with the clip buffer running.
 * Run from frontend/ after an Electron build (ELECTRON_BUILD=1 npm run build:prod):
 *   xvfb-run -a npx electron electron/e2e/premiumGaming.e2e.cjs --no-sandbox
 * Env: DESCALL_E2E_SHOTS=<dir>, PERF_JSON=<file>. Prints "[pg] OK" or "[pg] FAIL <reason>".
 */

const { app, protocol, safeStorage, BrowserWindow } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');

const SHOTS = process.env.DESCALL_E2E_SHOTS || '';
// PG_FREE=1: same boot as a free user, only the idle measurement (baseline for the Ultra numbers).
const FREE = process.env.PG_FREE === '1';
const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'descall-e2e-pg-'));
app.setPath('userData', userData);
app.commandLine.appendSwitch('host-resolver-rules', 'MAP * ~NOTFOUND');
app.commandLine.appendSwitch('force-device-scale-factor', '1');

const log = (...a) => console.log('[pg]', ...a);
let failed = false;
function fail(reason) {
  if (failed) return;
  failed = true;
  console.error(`[pg] FAIL ${reason}`);
  setTimeout(() => app.exit(1), 200);
}
setTimeout(() => fail('timed out'), 300000).unref();

const ME = { id: 'u-e2e', username: 'Demirr', displayName: 'Demirr', display_name: 'Demirr', isAdmin: false, country: 'TR', countryCode: 'TR', language: 'en', createdAt: '2025-01-01T00:00:00Z', emailVerified: true, birthDate: '2000-01-01', blockedUsers: [] };
const PEER = { id: 'u-peer', username: 'sn1pez53', displayName: 'Sniper', display_name: 'Sniper', country: 'TR', countryCode: 'TR' };
const PEER2 = { id: 'u-peer2', username: 'ayse', displayName: 'Ayse', display_name: 'Ayse', country: 'TR', countryCode: 'TR' };
const ULTRA_FEATURES = ['game_status', 'game_session_history', 'clipboard_history', 'quick_file_drop', 'app_lock', 'quick_actions', 'voice_hud', 'gaming_hud', 'instant_clip', 'workspace_profiles', 'desktop_automations', 'activity_timeline', 'command_center', 'widgets', 'custom_layouts', 'multi_account', 'focus_mode', 'mini_mode'];
const now = Date.now();
const iso = (msAgo) => new Date(now - msAgo).toISOString();

function body(url) {
  const p = url.pathname;
  if (p === '/auth/me' || p === '/api/auth/me') return { user: ME };
  if (p === '/api/premium/me' && FREE) return { plan: null, status: 'none', features: [] };
  if (p === '/api/premium/me') return { plan: 'ultra', status: 'active', ends_at: null, unlimited: true, features: ULTRA_FEATURES, monthly_descoin: 15000, next_coin_at: iso(-86400000) };
  if (p === '/api/premium/gaming/sessions') return { sessions: [{ id: 1, game: 'Rocket League', started_at: iso(5 * 3600e3), ended_at: iso(3.5 * 3600e3), duration_sec: 5400 }, { id: 2, game: 'Minecraft', started_at: iso(2 * 3600e3), ended_at: iso(1.5 * 3600e3), duration_sec: 1800 }], stats: null };
  if (p.startsWith('/api/premium/gaming/status/')) return { status: { game: 'Rocket League', started_at: iso(40 * 60e3) } };
  if (p === '/api/premium/gaming/prefs') return { game_card: 'friends' };
  if (p === '/api/calls' || p === '/calls') return { calls: [{ id: 'c1', kind: 'dm', callType: 'voice', startedAt: iso(3 * 3600e3), endedAt: iso(2.6 * 3600e3), durationSeconds: 1440, peer: PEER }] };
  if (p.includes('/friends/list')) return { friends: [PEER, PEER2] };
  if (p.includes('/users/') || p.includes('/profile')) return { user: PEER, ...PEER };
  if (p.endsWith('/health')) return { ok: true };
  if (/promo|gift|announce|broadcast/.test(p)) return { items: [], promos: [], codes: [], popup: null };
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
const TOKEN = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ id: ME.id, userId: ME.id, sub: ME.id, username: ME.username, exp: 4102444800 })}.e2e`;

app.whenReady().then(() => {
  fs.writeFileSync(path.join(userData, 'auth-token.bin'), safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(TOKEN) : Buffer.from(TOKEN, 'utf8'));
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
async function shot(wc, name) {
  if (!SHOTS) return;
  fs.mkdirSync(SHOTS, { recursive: true });
  const img = await wc.capturePage();
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
  throw new Error(`${label}: not reached (last ${JSON.stringify(last).slice(0, 400)})`);
}
const inv = (win, ...args) => js(win, `window.descallPremium.invoke(...${JSON.stringify(args)})`);
const overlays = () => BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed() && /^data:text\/html/.test(w.webContents.getURL()));

/** CPU % per process over `seconds` (Electron reports usage since the previous call). */
async function metrics(seconds) {
  app.getAppMetrics();
  await sleep(seconds * 1000);
  const m = app.getAppMetrics();
  const sum = (k) => Math.round(m.reduce((n, x) => n + k(x), 0) * 10) / 10;
  return {
    processes: m.length,
    cpuPercent: sum((x) => x.cpu.percentCPUUsage),
    workingSetMB: Math.round(sum((x) => x.memory.workingSetSize) / 1024),
    privateMB: Math.round(sum((x) => (x.memory.privateBytes || 0)) / 1024),
    byType: m.map((x) => ({ type: x.type, cpu: Math.round(x.cpu.percentCPUUsage * 10) / 10, mb: Math.round(x.memory.workingSetSize / 1024) })),
  };
}

async function run(win) {
  const result = {};
  await waitFor(win, 'boot', `(() => ({ ok: !document.querySelector('#boot-splash') && (document.getElementById('root')?.innerText || '').length > 0 }))()`);
  await js(win, `(() => { localStorage.setItem('descall:cookie_consent_v1', JSON.stringify({ choice: 'rejected', at: new Date().toISOString() })); return true; })()`);
  win.setContentSize(1280, 800);
  // Dismiss start-up popups (gift code, what's new) the generic mock answers trigger.
  for (let k = 0; k < 4; k++) {
    await sleep(700);
    await js(win, `(() => { const b = [...document.querySelectorAll('button')].find((x) => /^(Later|Sonra|Daha sonra|Close|Kapat|Reject|Reddet)$/.test(x.textContent.trim()) && x.offsetParent); if (b) b.click(); return !!b; })()`);
  }
  if (FREE) {
    await sleep(8000);
    result.idleFree = await metrics(10);
    const host = await js(win, `!!document.querySelector('[data-testid^="pg-"]')`);
    log('idle free', JSON.stringify({ cpu: result.idleFree.cpuPercent, mb: result.idleFree.workingSetMB, procs: result.idleFree.processes, premiumUi: host }));
    if (process.env.PERF_JSON) fs.writeFileSync(process.env.PERF_JSON, JSON.stringify(result, null, 2));
    console.log('[pg] OK (free baseline)');
    app.exit(0);
    return;
  }
  const gate = await waitFor(win, 'premium gate (main verified ultra)', `window.descallPremium.invoke('premium:status').then((s) => ({ ok: s && s.plan === 'ultra' && s.running.includes('voice_hud') && s.running.includes('instant_clip'), s }))`, 60000);
  log('gate', JSON.stringify({ plan: gate.s.plan, running: gate.s.running }));
  await sleep(8000);
  result.idlePremium = await metrics(10);
  log('idle with Ultra, every feature off', JSON.stringify({ cpu: result.idlePremium.cpuPercent, mb: result.idlePremium.workingSetMB, procs: result.idlePremium.processes }));

  // Voice HUD + gaming HUD
  await inv(win, 'premium:settings:set', 'voice_hud', { on: true });
  await inv(win, 'premium:settings:set', 'gaming_hud', { on: true, corner: 'tr' });
  await sleep(2500);
  let ovs = overlays();
  if (ovs.length < 2) throw new Error(`expected 2 HUD windows, got ${ovs.length}`);
  for (const w of ovs) {
    if (!w.isAlwaysOnTop()) throw new Error('HUD not always on top');
  }
  const hudText = await Promise.all(ovs.map((w) => w.webContents.executeJavaScript('document.body.innerText')));
  log('huds', JSON.stringify(hudText.map((t) => t.replace(/\s+/g, ' ').slice(0, 120))));
  if (!hudText.some((t) => /Descall ping/i.test(t) && /\d+ ms/.test(t))) throw new Error('gaming HUD content missing');
  if (!hudText.some((t) => !/Descall ping/i.test(t) && t.trim().length > 3)) throw new Error('voice HUD content missing');
  let n = 0;
  for (const w of ovs) await shot(w.webContents, `hud-${++n}.png`);

  // Widget
  await inv(win, 'premium:settings:set', 'widgets', { on: true, widgets: [{ id: 'friends1', kind: 'friends', x: 60, y: 300, width: 240, height: 200, opacity: 0.95 }] });
  await sleep(2000);
  ovs = overlays();
  if (ovs.length < 3) throw new Error(`widget window missing (${ovs.length} overlays)`);
  const widget = ovs.find((w) => w.getBounds().width === 240 && w.getBounds().height === 200);
  if (!widget) throw new Error('widget bounds not applied');
  await shot(widget.webContents, 'widget-friends.png');

  // Command center
  await js(win, `window.dispatchEvent(new CustomEvent('descall:premium:command-center', { detail: { open: true } })); true`);
  await waitFor(win, 'command center', `({ ok: !!document.querySelector('[data-testid="pg-command-center"]') })`);
  await sleep(600);
  await shot(win.webContents, 'command-center.png');
  await js(win, `document.querySelector('[data-testid="pg-cc-hub"]').click(); true`);
  await waitFor(win, 'hub', `({ ok: !!document.querySelector('[data-testid="pg-hub"]') && !document.querySelector('[data-testid="pg-command-center"]') })`);
  for (const key of ['gaming_hud', 'activity_timeline', 'game_session_history', 'desktop_automations', 'workspace_profiles']) {
    await js(win, `document.querySelector('[data-testid="pg-hub-${key}"]').click(); true`);
    await waitFor(win, `panel ${key}`, `({ ok: !!document.querySelector('[data-testid="pg-panel-${key}"]') })`);
    await sleep(700);
    await shot(win.webContents, `hub-${key}.png`);
  }

  // Instant clip: pick a capture source, start the ring, save, mux, editor.
  const src = await inv(win, 'premium:instant_clip:sources');
  if (!src || !src.ok || !src.sources.length) throw new Error(`no capture sources: ${JSON.stringify(src).slice(0, 200)}`);
  const screen = src.sources.find((s) => s.kind === 'screen') || src.sources[0];
  log('clip source', screen.id, screen.name);
  await js(win, `document.querySelector('[data-testid="pg-hub-instant_clip"]').click(); true`);
  await inv(win, 'premium:settings:set', 'instant_clip', { on: true, sourceId: screen.id, sourceName: screen.name, windowSec: 30 });
  const st = await waitFor(win, 'clip buffer running', `(() => { const el = document.querySelector('[data-testid="pg-clip-status"]'); return { ok: !!el && /[1-9]\\d* (s|sn) /.test(el.innerText), text: el && el.innerText, err: (document.querySelector('[data-testid="pg-panel-instant_clip"] .pg-error') || {}).innerText }; })()`, 40000);
  log('clip status', st.text.replace(/\s+/g, ' '));
  await sleep(8000);
  result.clipRunning = await metrics(10);
  await js(win, `document.querySelector('[data-testid="pg-clip-measure"]').click(); true`);
  const cost = await waitFor(win, 'clip cost', `(() => { const el = document.querySelector('[data-testid="pg-clip-cost"]'); const s = document.querySelector('[data-testid="pg-clip-status"]'); return { ok: !!el, text: el && el.innerText, status: s && s.innerText }; })()`);
  result.clipPanel = { cost: cost.text, status: cost.status };
  log('clip running', JSON.stringify({ cpu: result.clipRunning.cpuPercent, mb: result.clipRunning.workingSetMB, panel: cost.text, status: cost.status.replace(/\s+/g, ' ') }));
  await shot(win.webContents, 'hub-instant_clip.png');
  await js(win, `document.querySelector('[data-testid="pg-clip-save"]').click(); true`);
  await waitFor(win, 'clip editor', `({ ok: !!document.querySelector('[data-testid="pg-clip-editor"]') })`);
  const mux = await waitFor(win, 'clip muxed', `(() => { const v = document.querySelector('[data-testid="pg-clip-editor"] video'); const e = document.querySelector('[data-testid="pg-clip-editor"] .pg-error'); return { ok: !!v || !!e, video: !!v, err: e && e.innerText }; })()`, 30000);
  if (!mux.video) throw new Error(`clip mux failed: ${mux.err}`);
  const meta = await waitFor(win, 'clip playable', `(() => { const v = document.querySelector('[data-testid="pg-clip-editor"] video'); return { ok: v.readyState >= 1 && v.duration > 0, duration: v.duration, w: v.videoWidth, h: v.videoHeight }; })()`, 20000);
  result.clip = meta;
  log('clip', JSON.stringify(meta));
  await sleep(800);
  await shot(win.webContents, 'clip-editor.png');

  // Turn everything off again: windows close, buffer freed.
  await js(win, `document.querySelector('[data-testid="pg-clip-editor"] .pg-modal-head button').click(); true`);
  for (const k of ['instant_clip', 'voice_hud', 'gaming_hud', 'widgets']) await inv(win, 'premium:settings:set', k, { on: false });
  await sleep(2500);
  result.overlaysAfterOff = overlays().length;
  if (result.overlaysAfterOff !== 0) throw new Error(`${result.overlaysAfterOff} overlay windows left open after turning features off`);
  result.afterOff = await metrics(8);
  log('after off', JSON.stringify({ cpu: result.afterOff.cpuPercent, mb: result.afterOff.workingSetMB, procs: result.afterOff.processes }));
  if (process.env.PERF_JSON) fs.writeFileSync(process.env.PERF_JSON, JSON.stringify(result, null, 2));
  console.log('[pg] OK');
  app.exit(0);
}

require('../main.cjs');
