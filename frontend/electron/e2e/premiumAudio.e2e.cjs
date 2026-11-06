'use strict';

/**
 * Electron smoke test for the Descall+ hotkey / PTT / launcher / quick reply
 * modules (electron/premium/features). Boots the real main process against
 * the built dist/ with every host failing DNS and a mocked /api/premium/me
 * that answers Descall+ (the gate's fetchMe), then:
 *   1. the renderer claims plus over premium:entitlements, the gate opens;
 *   2. the user switches the hotkey features on: their global shortcuts are
 *      registered (and nothing is before that);
 *   3. a live call: media keys are registered, hold-to-talk loads uiohook-napi
 *      and starts the hook; the hotkey conflict check reports a duplicate;
 *   4. the quick launcher opens, searches through the renderer and is
 *      captured to .shots/premium/audio/quick-launcher.png;
 *   5. a DM toast is marked replyable by quick_reply;
 *   6. losing the membership stops everything and releases the shortcuts.
 *
 * Run from frontend/ after an Electron build (ELECTRON_BUILD=1 npm run build:prod):
 *   xvfb-run -a npx electron electron/e2e/premiumAudio.e2e.cjs --no-sandbox
 * Prints "[e2e-premium-audio] OK" and exits 0, or "... FAIL <reason>" and exits 1.
 */

const electron = require('electron');
const { app, globalShortcut } = electron;
const fs = require('fs');
const os = require('os');
const path = require('path');

const TOTAL_TIMEOUT_MS = 150000;
const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'descall-e2e-premium-audio-'));
app.setPath('userData', userData);
app.commandLine.appendSwitch('host-resolver-rules', 'MAP * ~NOTFOUND');
process.env.DESCALL_LAUNCHER_KEEP_OPEN = '1'; // xvfb has no real focus: keep it open for the capture
const shotsDir = process.env.DESCALL_SHOTS_DIR || path.join(__dirname, '..', '..', '..', '.shots', 'premium', 'audio');

const log = (...a) => console.log('[e2e-premium-audio]', ...a);
let failed = false;
function fail(reason) {
  if (failed) return;
  failed = true;
  console.error(`[e2e-premium-audio] FAIL ${reason}`);
  setTimeout(() => app.exit(1), 200);
}
setTimeout(() => fail(`timed out after ${TOTAL_TIMEOUT_MS}ms`), TOTAL_TIMEOUT_MS).unref();
electron.shell.openExternal = async () => {};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const js = (win, code) => win.webContents.executeJavaScript(code, true);
async function waitFor(label, fn, timeoutMs = 20000) {
  const started = Date.now();
  let last;
  while (Date.now() - started < timeoutMs) {
    try { last = await fn(); } catch (err) { last = `ERR ${err.message}`; }
    if (last && last.ok) return last;
    await sleep(200);
  }
  throw new Error(`${label}: not reached in ${timeoutMs}ms (last ${JSON.stringify(last)})`);
}
function expect(cond, what, detail) {
  if (!cond) throw new Error(`${what}${detail === undefined ? '' : ` (got ${JSON.stringify(detail)})`}`);
  log('ok', what);
}

const PLUS_KEYS = [
  'global_mute', 'global_ptt', 'custom_hotkeys', 'media_keys', 'quick_launcher', 'quick_reply',
  'focus_mode', 'audio_device_profiles', 'notification_history', 'notification_profiles',
  'mic_presets', 'noise_gate', 'mic_monitor', 'voice_activity_monitor', 'auto_device_switch', 'audio_routing',
  'smart_game_notifications',
];

let mainWin = null;
app.on('browser-window-created', (_e, win) => {
  win.webContents.once('did-finish-load', () => {
    if (mainWin || !/^descall:\/\/app\//.test(win.webContents.getURL())) return;
    mainWin = win;
    run(win).catch((err) => fail(err && err.stack ? err.stack : String(err)));
  });
});

async function run(win) {
  const premium = require('../premium/index.cjs');
  const notifyHooks = require('../premium/notifyHooks.cjs');
  // Mocked API: main's own /api/premium/me check answers Descall+.
  premium.gate.configure({ fetchMe: async () => ({ plan: 'plus', status: 'active', features: PLUS_KEYS }) });

  await waitFor('premium bridge', async () => ({ ok: await js(win, `Boolean(window.descallPremium && window.descallPremium.invoke)`) }));
  await sleep(2500); // let the app's own (free, offline) premium read settle first

  const accels = ['CommandOrControl+Alt+M', 'CommandOrControl+Alt+D', 'CommandOrControl+Shift+K'];
  expect(accels.every((a) => !globalShortcut.isRegistered(a)), 'no Descall+ shortcut before the membership');

  // 1. Entitlements.
  const claim = JSON.stringify({ keys: PLUS_KEYS, plan: 'plus' });
  const ent = await js(win, `window.descallPremium.invoke('premium:entitlements', ${claim})`);
  await waitFor('gate open', async () => ({ ok: premium.gate.has('global_mute') && premium.gate.plan() === 'plus' }));
  expect(ent && ent.ok, 'renderer claim accepted', ent);
  const running0 = premium.runningKeys();
  expect(running0.includes('custom_hotkeys') && running0.includes('quick_reply') && !running0.includes('global_mute'), 'default-on modules run, hotkey modules wait for the user', running0);
  expect(accels.every((a) => !globalShortcut.isRegistered(a)), 'still no shortcut until the user switches one on');

  // 2. The user switches the hotkey features on (Settings > Descall+).
  for (const key of ['global_mute', 'global_ptt', 'quick_launcher', 'media_keys']) {
    const r = await js(win, `window.descallPremium.invoke('premium:settings:set', '${key}', { enabled: true })`);
    expect(r && r.ok, `${key} enabled`, r);
  }
  await waitFor('modules started', async () => ({ ok: ['global_mute', 'global_ptt', 'quick_launcher', 'media_keys'].every((k) => premium.runningKeys().includes(k)) }));
  expect(accels.every((a) => globalShortcut.isRegistered(a)), 'mute, deafen and launcher shortcuts registered', accels.map((a) => globalShortcut.isRegistered(a)));
  expect(!globalShortcut.isRegistered('MediaPlayPause'), 'media keys left alone outside calls');

  // 3. A live call.
  await js(win, `window.descallPremium.invoke('premium:call-state', { active: true, muted: false, kind: 'server', title: 'Lounge' })`);
  await sleep(500);
  expect(globalShortcut.isRegistered('MediaPlayPause'), 'play/pause registered during the call');
  const ptt = await js(win, `window.descallPremium.invoke('premium:global_ptt:status')`);
  log('ptt status', JSON.stringify(ptt));
  expect(ptt && ptt.mode === 'hold' && ptt.nativeAvailable === true && ptt.hookRunning === true, 'hold-to-talk: uiohook-napi loaded and the hook runs only in the call', ptt);
  const check = await js(win, `window.descallPremium.invoke('premium:hotkeys:check', { volume_up: 'Ctrl+Alt+M' })`);
  expect(check && check.issues && check.issues.some((i) => i.reason === 'duplicate' && i.other === 'toggle_mute'), 'conflict check flags a duplicate binding', check);
  const reserved = await js(win, `window.descallPremium.invoke('premium:hotkeys:check', { quick_launcher: 'F12' })`);
  expect(reserved.issues.some((i) => i.reason === 'reserved'), "conflict check flags Descall's own F12", reserved);
  await js(win, `window.descallPremium.invoke('premium:call-state', { active: false })`);
  await sleep(400);
  const pttIdle = await js(win, `window.descallPremium.invoke('premium:global_ptt:status')`);
  expect(!globalShortcut.isRegistered('MediaPlayPause') && pttIdle.hookRunning === false, 'call ended: media keys released, input hook stopped', pttIdle);

  // 4. Quick launcher: the app's own renderer bridge answers searches.
  const open = await js(win, `window.descallPremium.invoke('premium:launcher:open')`);
  expect(open && open.ok, 'launcher opens', open);
  const launcher = await waitFor('launcher window', async () => {
    const w = electron.BrowserWindow.getAllWindows().find((x) => /launcher\.html$/.test(x.webContents.getURL()) && x.isVisible());
    return { ok: Boolean(w), w };
  });
  const lw = launcher.w;
  await waitFor('launcher bridge', async () => ({ ok: await js(lw, `Boolean(window.launcherAPI)`) }));
  const all = await js(lw, `window.launcherAPI.query('')`);
  const ids = (all.results || []).map((r) => r.id);
  expect(ids.includes('action:status:dnd') && ids.includes('action:settings'), 'launcher search goes through the app renderer (actions listed)', ids);
  const dnd = await js(lw, `window.launcherAPI.query('not dist')`);
  expect(dnd.results[0] && dnd.results[0].id === 'action:status:dnd', 'fuzzy search finds Do not disturb', dnd.results.map((r) => r.id));
  await sleep(600);
  const rows = await js(lw, `document.querySelectorAll('.item').length`);
  expect(rows >= 4, 'launcher window lists the results', rows);
  fs.mkdirSync(shotsDir, { recursive: true });
  const img = await lw.webContents.capturePage();
  fs.writeFileSync(path.join(shotsDir, 'quick-launcher.png'), img.toPNG());
  log('saved', path.join(shotsDir, 'quick-launcher.png'));
  await js(lw, `(() => { const i = document.getElementById('q'); i.value = 'not dist'; i.dispatchEvent(new Event('input')); return true; })()`);
  await sleep(700);
  const img2 = await lw.webContents.capturePage();
  fs.writeFileSync(path.join(shotsDir, 'quick-launcher-search.png'), img2.toPNG());
  await js(lw, `document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' })); true`);
  const status = await waitFor('status set from the launcher', async () => {
    const v = await js(win, `localStorage.getItem('descall:myStatus')`);
    return { ok: v === 'dnd', v };
  }, 5000);
  expect(status.v === 'dnd' && !lw.isVisible(), 'Enter runs the action in the app (status: dnd) and hides the launcher', status.v);

  // 5. Quick reply decoration of a DM toast.
  const decorated = notifyHooks.run({ title: 'Ayşe', options: { body: 'hi', data: { type: 'dm', fromId: 'u1', from: 'Ayşe' } } });
  expect(decorated && decorated.quickReply && decorated.quickReply.conv === 'dm:u1', 'DM toast is replyable', decorated && decorated.quickReply);
  const group = notifyHooks.run({ title: 'x', options: { data: { type: 'server-message', serverId: 's1' } } });
  expect(!group.quickReply, 'server messages are not replyable');
  const qr = await js(win, `window.descallPremium.invoke('premium:quick_reply:status')`);
  log('quick reply status', JSON.stringify(qr));
  expect(qr && (qr.mode === 'native' || qr.mode === 'unavailable'), 'quick reply reports its mode', qr);

  // 6. Membership gone: everything stops, shortcuts released.
  premium.gate.configure({ fetchMe: async () => ({ plan: null, status: 'expired' }) });
  await js(win, `window.descallPremium.invoke('premium:entitlements', { keys: [], plan: null })`);
  await waitFor('modules stopped', async () => ({ ok: premium.runningKeys().length === 0 }));
  expect(accels.every((a) => !globalShortcut.isRegistered(a)), 'shortcuts released without the membership');
  expect(globalShortcut.isRegistered('F12'), 'Descall\'s own F12 stays registered');

  console.log('[e2e-premium-audio] OK');
  setTimeout(() => app.exit(0), 200);
}

require('../main.cjs');
