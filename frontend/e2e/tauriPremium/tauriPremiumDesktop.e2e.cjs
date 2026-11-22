'use strict';
/**
 * Settings > Descall+ in the Tauri desktop app, all 31 desktop features (round 2 sweep,
 * 22 Nov 2026), emulated in Chromium with the same harness as tauriPremium.e2e.cjs:
 *  - every desktop feature card shows its switch (never "Masaustu" / "Kilitli"), a click sends
 *    premium:settings:set { enabled } and the state survives a reload (settings:get);
 *  - quick launcher vs command center: both default to Ctrl+Shift+K. With both on, only one
 *    can hold the global shortcut; both panels now say so (data-s="<key>.clash") instead of one
 *    silently losing it, and the command center panel says when its shortcut could not be
 *    registered for another reason. The defaults themselves are unchanged;
 *  - voice / gaming HUD, quick drop and sidebar ask the shell for their windows.
 *
 *   ELECTRON_BUILD=1 npx vite build --outDir /tmp/descall-e2e-dist
 *   node e2e/tauriPremium/tauriPremiumDesktop.e2e.cjs --dist=/tmp/descall-e2e-dist
 *   ONLY=features|clash|taken|overlays limits the scenarios.
 */
const { open, premiumCalls, pw } = require('./harness.cjs');

const fails = [];
const check = (cond, msg) => { if (!cond) fails.push(msg); else console.log('  ok', msg); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// The 31 desktop features of the technical plan (section 5), by settings category.
const DESKTOP = {
  windows: ['always_on_top', 'pip_call', 'multi_window', 'window_opacity', 'session_restore', 'tray_controls_plus', 'taskbar_plus', 'window_layouts', 'advanced_window_mgmt', 'screen_edge_actions', 'custom_layouts'],
  shortcuts: ['global_mute', 'global_ptt', 'custom_hotkeys', 'media_keys', 'quick_launcher', 'quick_reply', 'per_user_volume_hotkeys'],
  notifications: ['focus_mode'],
  audio: ['audio_device_profiles'],
  gaming: ['voice_hud', 'gaming_hud', 'instant_clip'],
  productivity: ['quick_file_drop', 'app_lock'],
  desktop_tools: ['desktop_sidebar', 'widgets', 'command_center'],
  automation: ['workspace_profiles', 'desktop_automations', 'multi_account'],
};

async function goCat(page, id) {
  const back = page.locator('.pp-back');
  if (await back.count()) { await back.click(); await sleep(300); }
  await page.click(`.pp-tile[data-category="${id}"]`);
  await sleep(600);
}
const card = (page, key) => page.locator(`[data-feature="${key}"]`).first();
const switchOf = (page, key) => card(page, key).locator('[role=switch]').first();
async function openCard(page, key) {
  const hit = card(page, key).locator('.ps-hit').first();
  if (await hit.count()) await hit.click();
  await sleep(500);
}
async function setSwitch(page, key, on) {
  const sw = switchOf(page, key);
  if ((await sw.getAttribute('aria-checked')) !== String(on)) await sw.click();
  await sleep(250);
}

async function features(browser) {
  console.log('scenario: every desktop feature card is usable and its switch persists');
  const { ctx, page } = await open(browser, { persist: true });
  const keys = Object.values(DESKTOP).flat();
  check(keys.length === 31, `31 desktop features listed (${keys.length})`);
  const want = {};
  for (const [cat, list] of Object.entries(DESKTOP)) {
    await goCat(page, cat);
    for (const key of list) {
      const c = card(page, key);
      if (!(await c.count())) { fails.push(`${key}: no card in ${cat}`); continue; }
      const text = (await c.innerText()).replace(/\s+/g, ' ');
      check(!/Masaüstü uygulamasında|Kilitli/.test(text), `${key}: not "desktop app" / locked`);
      const sw = switchOf(page, key);
      if (!(await sw.count())) { fails.push(`${key}: no switch`); continue; }
      const before = (await sw.getAttribute('aria-checked')) === 'true';
      const n0 = (await premiumCalls(page)).length;
      await sw.click();
      await sleep(300);
      const after = (await sw.getAttribute('aria-checked')) === 'true';
      const calls = (await premiumCalls(page)).slice(n0);
      check(after === !before, `${key}: switch flips (${before} -> ${after})`);
      check(calls.some(([ch, a]) => ch === 'premium:settings:set' && a[0] === key && a[1].enabled === !before), `${key}: settings:set { enabled: ${!before} }`);
      want[key] = after;
    }
  }
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('[data-testid="premium-tab"]', { timeout: 20000 });
  await sleep(1200);
  for (const [cat, list] of Object.entries(DESKTOP)) {
    await goCat(page, cat);
    for (const key of list) {
      if (!(key in want)) continue;
      const got = (await switchOf(page, key).getAttribute('aria-checked')) === 'true';
      check(got === want[key], `${key}: switch state kept after reload (${got})`);
    }
  }
  check(!page.errors.length, `no page errors (${page.errors.join(' | ')})`);
  await ctx.close();
}

async function clash(browser) {
  console.log('scenario: quick launcher and command center on the same Ctrl+Shift+K');
  const { ctx, page } = await open(browser, {});
  await goCat(page, 'desktop_tools');
  await openCard(page, 'command_center');
  check(!(await page.locator('[data-s="command_center.clash"]').count()), 'no clash while the quick launcher is off (default)');
  await goCat(page, 'shortcuts');
  await setSwitch(page, 'quick_launcher', true);
  await openCard(page, 'quick_launcher');
  const ql = page.locator('[data-s="quick_launcher.clash"]');
  check(await ql.count() === 1, 'quick launcher panel shows the clash');
  const qlText = (await ql.count()) ? await ql.innerText() : '';
  check(/Ctrl\+Shift\+K/.test(qlText) && /komuta merkezi/i.test(qlText), `clash names the keys and the command center (${qlText.slice(0, 140)})`);
  await openCard(page, 'custom_hotkeys');
  check(await page.locator('[data-s="custom_hotkeys.clash"]').count() === 1, 'custom hotkeys panel shows the clash');
  await goCat(page, 'desktop_tools');
  await openCard(page, 'command_center');
  check(await page.locator('[data-s="command_center.clash"]').count() === 1, 'command center panel shows the clash too');
  // A different launcher binding ends the clash.
  await page.evaluate(() => window.descallPremium.invoke('premium:settings:set', 'custom_hotkeys', { bindings: { quick_launcher: 'CommandOrControl+Shift+Space' } }));
  await sleep(600);
  check(!(await page.locator('[data-s="command_center.clash"]').count()), 'clash gone once the launcher uses Ctrl+Shift+Space');
  // Same keys written another way (Control vs CommandOrControl) still clash.
  await page.evaluate(() => window.descallPremium.invoke('premium:settings:set', 'custom_hotkeys', { bindings: { quick_launcher: 'Shift+Control+K' } }));
  await sleep(600);
  check(await page.locator('[data-s="command_center.clash"]').count() === 1, 'Shift+Control+K is the same shortcut as CommandOrControl+Shift+K');
  check(!page.errors.length, `no page errors (${page.errors.join(' | ')})`);
  await ctx.close();
}

async function overlays(browser) {
  console.log('scenario: HUDs, quick drop and sidebar ask the shell to open their windows');
  const { ctx, page } = await open(browser, {});
  const press = async (key, item) => {
    await openCard(page, key);
    const el = page.locator(`[data-s="${key}.${item}"]`).first();
    if (!(await el.count())) { fails.push(`${key}.${item}: control not found`); return []; }
    const n0 = (await premiumCalls(page)).length;
    const b = el.locator('[role=switch], button').first();
    await ((await b.count()) ? b : el).click();
    await sleep(1200);
    return (await premiumCalls(page)).slice(n0);
  };
  await goCat(page, 'gaming');
  for (const hud of ['voice_hud', 'gaming_hud']) {
    const calls = await press(hud, 'on');
    check(calls.some(([ch, a]) => ch === 'premium:settings:set' && a[0] === hud && a[1].on === true), `${hud}: show -> settings:set { on: true }`);
    check(calls.some(([ch, a]) => ch === `premium:${hud}:config` && typeof a[0].corner === 'string'), `${hud}: config pushed`);
    check(calls.some(([ch, a]) => ch === `premium:${hud}:state` && a[0] && typeof a[0].labels === 'object'), `${hud}: state with labels pushed`);
    check(calls.some(([ch]) => ch === `premium:${hud}:open`), `${hud}: open asked`);
  }
  await goCat(page, 'productivity');
  let calls = await press('quick_file_drop', 'on');
  check(calls.some(([ch]) => ch === 'premium:quick_file_drop:open'), 'quick_file_drop: show -> premium:quick_file_drop:open');
  await goCat(page, 'desktop_tools');
  calls = await press('desktop_sidebar', 'open');
  check(calls.some(([ch]) => ch === 'premium:sidebar:toggle'), 'desktop_sidebar: open -> premium:sidebar:toggle');
  check(!page.errors.length, `no page errors (${page.errors.join(' | ')})`);
  await ctx.close();
}

async function taken(browser) {
  console.log('scenario: the shell could not register the command center shortcut');
  const { ctx, page } = await open(browser, { ccTaken: true });
  const calls = await premiumCalls(page);
  check(calls.some(([ch, , r]) => ch === 'premium:command_center:hotkey' && r && r.ok === false), 'command_center:hotkey answered { ok: false }');
  await goCat(page, 'desktop_tools');
  await openCard(page, 'command_center');
  const hint = page.locator('[data-s="command_center.clash"]');
  check(await hint.count() === 1, 'command center panel says the shortcut is not registered');
  const text = (await hint.count()) ? await hint.innerText() : '';
  check(/Ctrl\+Shift\+K/.test(text) && /kaydedilemedi/.test(text), `hint text (${text.slice(0, 140)})`);
  await ctx.close();
}

(async () => {
  const browser = await pw.chromium.launch({ proxy: { server: 'http://127.0.0.1:9' }, args: ['--no-sandbox', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE tauri.localhost'] });
  const only = process.env.ONLY || '';
  try {
    if (!only || only === 'features') await features(browser);
    if (!only || only === 'clash') await clash(browser);
    if (!only || only === 'taken') await taken(browser);
    if (!only || only === 'overlays') await overlays(browser);
  } finally { await browser.close(); }
  if (fails.length) { console.log('FAIL\n' + fails.map((f) => ' - ' + f).join('\n')); process.exit(1); }
  console.log('desktop features e2e ok');
})().catch((e) => { console.error(e); process.exit(1); });
