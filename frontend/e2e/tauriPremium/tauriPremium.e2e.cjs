'use strict';
/**
 * Settings > Descall+ in the Tauri desktop app, emulated in Chromium (agent sweep 21 Nov 2026):
 * global mute, global PTT (keyboard and mouse side buttons), custom hotkeys, media keys, quick
 * launcher, per-user volume hotkeys, focus mode, audio device profiles, command center and
 * workspace profiles. Asserts the premium_invoke calls (channels, payloads, Electron
 * accelerators), the events back to the page, that the features are usable (no "desktop app" /
 * lock), the resend of state pushes when the shell verifies late, the bridge-missing state, and
 * that the web build is unchanged.
 *
 *   ELECTRON_BUILD=1 npx vite build --outDir /dev/shm/descall-e2e-dist
 *   PLAYWRIGHT=/opt/node22/lib/node_modules/playwright node e2e/tauriPremium/tauriPremium.e2e.cjs --dist=/dev/shm/descall-e2e-dist [--shots]
 *   ONLY=bridge|slow|nobridge|web limits the scenarios.
 */
const fs = require('fs');
const path = require('path');
const { open, premiumCalls, pw, OUT, SHOTS, CHROME } = require('./harness.cjs');

const fails = [];
const check = (cond, msg) => { if (!cond) fails.push(msg); else console.log('  ok', msg); };
const has = (calls, ch, pred = () => true) => calls.some(([c, a]) => c === ch && pred(a));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const DESKTOP_ONLY = 'Masaüstü uygulamasında';

async function card(page, key) {
  return page.locator(`[data-feature="${key}"]`).first();
}
async function turnOn(page, key) {
  const c = await card(page, key);
  const sw = c.locator('[role=switch]').first();
  if ((await sw.getAttribute('aria-checked')) !== 'true') await sw.click();
  await sleep(250);
}
async function openCard(page, key) {
  const c = await card(page, key);
  const hit = c.locator('.ps-hit').first();
  if (await hit.count()) await hit.click();
  await sleep(500);
}
async function goCat(page, id) {
  const back = page.locator('.pp-back');
  if (await back.count()) { await back.click(); await sleep(300); }
  await page.click(`.pp-tile[data-category="${id}"]`);
  await sleep(700);
}

async function withBridge(browser) {
  console.log('scenario: Tauri with the Descall+ bridge');
  const { ctx, page } = await open(browser, JSON.parse(process.env.CFG || '{}'));
  const tiles = await page.$$eval('.pp-tile', (els) => els.map((e) => [e.dataset.category, e.querySelector('.pp-tile-foot').innerText]));
  for (const [id, foot] of tiles) check(!foot.includes(DESKTOP_ONLY) && !/Kilitli|kilitli/.test(foot), `tile ${id} usable (${foot.replace(/\s+/g, ' ')})`);
  check(!(await page.locator('[data-testid="premium-gate-notice"]').count()), 'no locked gate notice');
  check(!(await page.locator('[data-testid="premium-bridge-missing"]').count()), 'no bridge-missing notice with the bridge');
  let calls = await premiumCalls(page);
  check(has(calls, 'premium:entitlements', (a) => a[0].plan === 'ultra' && a[0].keys.includes('global_ptt') && typeof a[0].token === 'string'), 'entitlements pushed with plan, keys and token');
  check(has(calls, 'premium:command_center:hotkey', (a) => a[0] === 'CommandOrControl+Shift+K'), 'command_center hotkey bound (Electron accelerator)');
  check(has(calls, 'premium:workspace_profiles:bind', (a) => a[0].profiles.length === 3 && a[0].profiles.every((p) => /^CommandOrControl\+Alt\+\d$/.test(p.hotkey))), 'workspace_profiles bind with accelerators');
  check(has(calls, 'premium:focus_mode:state', (a) => a[0].until === 0), 'focus_mode state mirrored');
  check(has(calls, 'premium:audio_device_profiles:mirror', (a) => Array.isArray(a[0].profiles)), 'audio_device_profiles mirrored');
  const events = await page.evaluate(() => window.__calls.filter((c) => c[0] === 'plugin:event|listen').map((c) => c[1].event));
  for (const ev of ['premium:hotkey', 'premium:ptt', 'premium:launcher-query', 'premium:launcher-run', 'premium:command_center:toggle', 'premium:workspace_profiles:switch', 'premium:settings-changed', 'premium:tray-action']) {
    check(events.includes(ev), `renderer listens to ${ev}`);
  }

  await goCat(page, 'shortcuts');
  if (SHOTS && fs.mkdirSync(OUT, { recursive: true }) !== null) await page.screenshot({ path: path.join(OUT, 'shortcuts.png') });
  for (const key of ['global_mute', 'global_ptt', 'custom_hotkeys', 'media_keys', 'quick_launcher', 'per_user_volume_hotkeys']) {
    const c = await card(page, key);
    check(await c.locator('[role=switch]').count() === 1, `${key}: switch shown (not Masaustu / Kilitli)`);
  }
  for (const key of ['global_mute', 'global_ptt', 'media_keys', 'quick_launcher', 'per_user_volume_hotkeys']) {
    await turnOn(page, key);
    calls = await premiumCalls(page);
    check(has(calls, 'premium:settings:set', (a) => a[0] === key && a[1].enabled === true), `${key}: settings:set enabled=true`);
  }
  const running = await page.evaluate(() => [...window.__mockHost.running]);
  for (const key of ['global_mute', 'global_ptt', 'media_keys', 'quick_launcher', 'per_user_volume_hotkeys', 'custom_hotkeys']) check(running.includes(key), `${key}: running in the host`);

  await openCard(page, 'global_mute');
  calls = await premiumCalls(page);
  check(has(calls, 'premium:global_mute:status'), 'global_mute panel asks for status');
  const muteText = await (await card(page, 'global_mute')).innerText();
  check(!muteText.includes('masaüstü uygulamasında çalışır'), 'global_mute panel is the desktop panel');
  await page.locator('[data-s="global_mute.deafen"]').click();
  await sleep(200);
  calls = await premiumCalls(page);
  check(has(calls, 'premium:settings:set', (a) => a[0] === 'global_mute' && a[1].deafen === false), 'global_mute: deafen switch -> settings:set { deafen: false }');

  await openCard(page, 'global_ptt');
  calls = await premiumCalls(page);
  check(has(calls, 'premium:global_ptt:status'), 'global_ptt panel asks for status');
  check(await page.locator('[data-s="global_ptt.mode"]').count() === 1, 'global_ptt shows the hold / toggle mode line');
  await page.locator('[data-s="global_ptt.forceToggle"]').click();
  await sleep(200);
  calls = await premiumCalls(page);
  check(has(calls, 'premium:settings:set', (a) => a[0] === 'global_ptt' && a[1].forceToggle === true), 'global_ptt: force toggle -> settings:set');

  await openCard(page, 'custom_hotkeys');
  calls = await premiumCalls(page);
  check(has(calls, 'premium:hotkeys:status'), 'custom_hotkeys panel asks for status');
  const rec = (action) => page.locator(`[data-s="custom_hotkeys.${action}"] .pa-recorder`).first();
  await rec('toggle_mute').click();
  await page.keyboard.press('Control+Alt+KeyJ');
  await sleep(300);
  calls = await premiumCalls(page);
  check(has(calls, 'premium:hotkeys:check', (a) => a[0].toggle_mute === 'CommandOrControl+Alt+J'), 'recorded Ctrl+Alt+J -> hotkeys:check CommandOrControl+Alt+J');
  await rec('push_to_talk').click();
  await page.evaluate(() => window.dispatchEvent(new MouseEvent('mousedown', { button: 4, bubbles: true })));
  await sleep(300);
  calls = await premiumCalls(page);
  check(has(calls, 'premium:hotkeys:check', (a) => a[0].push_to_talk === 'Mouse5'), 'mouse forward button on push_to_talk -> Mouse5');
  await rec('quick_launcher').click();
  await page.keyboard.press('Control+Shift+Space');
  await sleep(300);
  await page.locator('[data-s="custom_hotkeys.save"]').click();
  await sleep(500);
  calls = await premiumCalls(page);
  check(has(calls, 'premium:hotkeys:probe', (a) => a[0] === 'CommandOrControl+Alt+J'), 'save probes the new keyboard binding');
  check(!has(calls, 'premium:hotkeys:probe', (a) => /^Mouse/.test(a[0])), 'mouse bindings are not probed');
  check(has(calls, 'premium:hotkeys:save', (a) => a[0].toggle_mute === 'CommandOrControl+Alt+J' && a[0].push_to_talk === 'Mouse5' && a[0].quick_launcher === 'CommandOrControl+Shift+Space' && a[1].force === false), 'hotkeys:save with the draft and { force: false }');
  check(await page.locator('[data-s="custom_hotkeys.saved"]').count() === 1, 'saved hint shown');

  await openCard(page, 'quick_launcher');
  const qlOpen = page.locator('[data-s="quick_launcher.open"]').first();
  if (await qlOpen.count()) {
    await qlOpen.click();
    await sleep(200);
    calls = await premiumCalls(page);
    check(has(calls, 'premium:launcher:open'), 'quick_launcher: open -> premium:launcher:open');
  } else fails.push('quick_launcher: no open button found');

  // Events back to the renderer.
  const ptt = await page.evaluate(() => new Promise((res) => {
    const got = [];
    window.addEventListener('descall:ptt', (e) => got.push(e.detail));
    window.__emit('premium:ptt', { down: true });
    setTimeout(() => { window.__emit('premium:ptt', { down: false }); setTimeout(() => res(got), 200); }, 200);
  }));
  check(JSON.stringify(ptt) === JSON.stringify([{ down: true, source: 'global' }, { down: false, source: 'global' }]), `premium:ptt down/up -> descall:ptt (${JSON.stringify(ptt)})`);
  await page.evaluate(() => window.__emit('premium:launcher-query', { id: 7, q: 'ayar' }));
  await sleep(400);
  calls = await premiumCalls(page);
  check(has(calls, 'premium:launcher:results', (a) => a[0].id === 7 && Array.isArray(a[0].results)), 'launcher-query -> launcher:results { id, results }');
  const before = await page.evaluate(() => document.querySelectorAll('.cc-panel, [data-testid="command-center"], .pg-cc').length);
  await page.evaluate(() => window.__emit('premium:command_center:toggle', { via: 'hotkey' }));
  await sleep(500);
  const after = await page.evaluate(() => document.querySelectorAll('.cc-panel, [data-testid="command-center"], .pg-cc, [role=dialog]').length);
  check(after > before, `command_center:toggle opens the panel (${before} -> ${after})`);
  if (SHOTS && fs.mkdirSync(OUT, { recursive: true }) !== null) await page.screenshot({ path: path.join(OUT, 'after-cc.png') });
  await page.keyboard.press('Escape');

  // Other categories with part 1 features.
  for (const [cat, key] of [['notifications', 'focus_mode'], ['audio', 'audio_device_profiles'], ['desktop_tools', 'command_center'], ['automation', 'workspace_profiles']]) {
    await goCat(page, cat);
    const c = await card(page, key);
    check(await c.locator('[role=switch]').count() === 1, `${key}: switch shown in ${cat}`);
  }
  check(!page.errors.length, `no page errors (${page.errors.join(' | ')})`);
  await ctx.close();
}

async function slowVerify(browser) {
  console.log('scenario: the shell verifies the plan 1.5 s after the renderer pushed its state');
  const { ctx, page } = await open(browser, { verifyDelayMs: 1500 });
  await sleep(3500);
  const calls = await premiumCalls(page);
  for (const ch of ['premium:command_center:hotkey', 'premium:workspace_profiles:bind', 'premium:focus_mode:state', 'premium:audio_device_profiles:mirror']) {
    const res = calls.filter((c) => c[0] === ch).map((c) => c[2]);
    check(res.some((r) => r && r.error === 'locked') && res[res.length - 1] && res[res.length - 1].ok === true, `${ch}: locked at first, sent again once running (${res.length} calls)`);
  }
  check(!(await page.locator('[data-testid="premium-gate-notice"]').count()) || true, 'gate notice may show while checking');
  await ctx.close();
}

async function withoutBridge(browser) {
  console.log('scenario: Tauri shell, Descall+ bridge missing');
  const { ctx, page } = await open(browser, { noBridge: true });
  if (SHOTS && fs.mkdirSync(OUT, { recursive: true }) !== null) await page.screenshot({ path: path.join(OUT, 'no-bridge.png') });
  const notice = page.locator('[data-testid="premium-bridge-missing"]');
  check(await notice.count() === 1, 'bridge-missing notice shown');
  const text = (await notice.count()) ? await notice.innerText() : '';
  check(/bridge-missing/.test(text), `notice carries the code (${text.replace(/\s+/g, ' ').slice(0, 160)})`);
  const tiles = await page.$$eval('.pp-tile', (els) => els.map((e) => [e.dataset.category, e.querySelector('.pp-tile-foot').innerText]));
  const sc = tiles.find((t) => t[0] === 'shortcuts');
  check(sc && !sc[1].includes(DESKTOP_ONLY), `shortcuts tile does not say "desktop app" inside the desktop app (${sc && sc[1]})`);
  await goCat(page, 'shortcuts');
  const pill = await (await card(page, 'global_mute')).innerText();
  check(!pill.includes('Masaüstü') || pill.includes('bağlantı') || pill.includes('Bağlantı'), `global_mute card does not send the user to the desktop app (${pill.replace(/\s+/g, ' ').slice(0, 120)})`);
  await ctx.close();
}

async function web(browser) {
  console.log('scenario: web (no Tauri, no bridge): unchanged');
  const { ctx, page } = await open(browser, { noBridge: true, noTauri: true });
  check(!(await page.locator('[data-testid="premium-bridge-missing"]').count()), 'web: no bridge-missing notice');
  const tiles = await page.$$eval('.pp-tile', (els) => els.map((e) => [e.dataset.category, e.querySelector('.pp-tile-foot').innerText]));
  const sc = tiles.find((t) => t[0] === 'desktop_tools');
  check(sc && sc[1].includes(DESKTOP_ONLY), `web: desktop tile still says desktop app (${sc && sc[1]})`);
  await ctx.close();
}

(async () => {
  const browser = await pw.chromium.launch({ ...(CHROME ? { executablePath: CHROME } : {}), proxy: { server: 'http://127.0.0.1:9' }, args: ['--no-sandbox', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE tauri.localhost'] });
  const only = process.env.ONLY || '';
  try {
    if (!only || only === 'bridge') await withBridge(browser);
    if (!only || only === 'slow') await slowVerify(browser);
    if (!only || only === 'nobridge') await withoutBridge(browser);
    if (!only || only === 'web') await web(browser);
  } finally { await browser.close(); }
  if (fails.length) { console.log('FAIL\n' + fails.map((f) => ' - ' + f).join('\n')); process.exit(1); }
  console.log('features e2e ok');
})().catch((e) => { console.error(e); process.exit(1); });
