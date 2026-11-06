'use strict';
/* Screenshots and checks of the Descall+ category pages as built (approved draft E).
 * Same approach as ../category-drafts/capture.cjs: serve frontend/dist-e2e with the e2e mock
 * backend on 5361, answer /api/premium/me as Ultra, open Ayarlar > Descall+ and a category.
 * In desktop mode (default) a mock window.descallPremium bridge is installed, so the desktop
 * features are usable as in the desktop app (feature settings kept in memory, sample lists).
 *
 * From frontend/ (dist-e2e built against the mock):
 *   VITE_API_BASE_URL=http://127.0.0.1:5361 npx vite build --outDir dist-e2e
 *   node ../docs/design/premium-settings/implemented-e/capture-e.cjs [out-dir]
 * Env:
 *   ONLY=windows,audio   limit the categories
 *   CHECK=1              open every card of every category, compare data-s with settingsChecklist.js
 *   SLIDERS=1            drag every slider of the opened cards to both ends, check value and fill
 *   NOSHOTS=1            checks only
 * Writes <category>-dark.png (1280x800 @2x), windows-light.png, audio-phone-390.png. */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const FRONT = process.cwd();
const mock = require(path.join(FRONT, 'e2e/perf/mockBackend.cjs'));
const pw = require(process.env.PLAYWRIGHT_CORE || '/opt/node22/lib/node_modules/playwright');
const OUT = path.resolve(process.argv[2] || __dirname);
const feats = require(path.join(FRONT, 'backend/lib/premium/features.js'));

const CATS = ['windows', 'shortcuts', 'notifications', 'audio', 'gaming', 'productivity', 'desktop_tools', 'automation'];
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : CATS;
/* The card opened in each screenshot (first of chapter 1, so the hero stays in view). */
const OPEN = {
  windows: 'mini_mode', shortcuts: 'global_mute', notifications: 'focus_mode', audio: 'noise_gate',
  gaming: 'voice_hud', productivity: 'quick_actions', desktop_tools: 'desktop_sidebar', automation: 'workspace_profiles',
};

/* ---------------------------------------------------------------- tiny PNG reader (RGB/RGBA, 8 bit) */
function readPng(buf) {
  let p = 8; let w = 0; let h = 0; let ct = 0; const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p); const type = buf.toString('ascii', p + 4, p + 8); const data = buf.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); ct = data[9]; }
    if (type === 'IDAT') idat.push(data);
    p += 12 + len;
  }
  const bpp = ct === 6 ? 4 : 3; const raw = zlib.inflateSync(Buffer.concat(idat)); const stride = w * bpp;
  const out = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)]; const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? out[y * stride + x - bpp] : 0; const b = y ? out[(y - 1) * stride + x] : 0; const c = x >= bpp && y ? out[(y - 1) * stride + x - bpp] : 0;
      let v = line[x];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const pp = a + b - c; const pa = Math.abs(pp - a); const pb = Math.abs(pp - b); const pc = Math.abs(pp - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      out[y * stride + x] = v & 255;
    }
  }
  return { w, h, px: (x, y) => { const i = y * stride + x * bpp; return [out[i], out[i + 1], out[i + 2]]; } };
}

/* ---------------------------------------------------------------- mock desktop bridge */
function bridgeScript(keys) {
  return `(() => {
    const keys = ${JSON.stringify(keys)};
    const store = {
      mini_mode: { enabled: true }, always_on_top: { enabled: true }, window_opacity: { enabled: true, call: 0.9, sidebar: 0.7, popout: 0.85 },
      noise_gate: { enabled: true, thresholdDb: -52, hysteresisDb: 10, holdMs: 120 }, mic_monitor: { enabled: true, volume: 80 },
      global_mute: { enabled: true, deafen: true }, global_ptt: { enabled: true }, media_keys: { enabled: true }, quick_launcher: { enabled: true },
      per_user_volume_hotkeys: { enabled: true, step: 10 }, auto_device_switch: { enabled: true }, audio_routing: { enabled: true },
      screen_edge_actions: { enabled: true, edge: 'right', delay: 250 }, desktop_sidebar: { enabled: true, edge: 'right' },
      voice_hud: { enabled: true, on: true, corner: 'tl', scale: 1, opacity: 0.92, margin: 16 },
      gaming_hud: { enabled: true, on: true, corner: 'tr' }, instant_clip: { enabled: true, sourceId: 'screen:0', sourceName: 'Ekran 1', windowSec: 30 },
      clipboard_history: { enabled: true, on: true }, quick_file_drop: { enabled: true, on: true },
      quick_actions: { enabled: true, items: [] }, widgets: { enabled: true, on: true, widgets: [
        { id: 'w1', kind: 'friends', x: 60, y: 120, width: 240, height: 220, opacity: 0.95 },
        { id: 'w2', kind: 'calls', x: 1180, y: 140, width: 260, height: 160, opacity: 0.95 } ] },
      workspace_profiles: { enabled: true, active: 'game' }, desktop_automations: { enabled: true, on: true, rules: [
        { id: 'r1', enabled: true, trigger: { type: 'game_started' }, actions: [{ type: 'switch_profile', profileId: 'game' }] },
        { id: 'r2', enabled: true, trigger: { type: 'time_window', from: '09:00', to: '18:00' }, actions: [{ type: 'focus', on: true }] } ] },
      focus_mode: { enabled: true, lastMinutes: 60 }, notification_profiles: { enabled: true, mode: 'auto', scheduleOn: true },
    };
    const listeners = {};
    const now = new Date().toISOString();
    const reply = (channel, args) => {
      if (channel === 'premium:settings:get') return { ok: true, settings: store[args[0]] || {} };
      if (channel === 'premium:settings:set') {
        const [k, patch] = args; const next = { ...(store[k] || {}) };
        for (const [a, b] of Object.entries(patch || {})) { if (b == null) delete next[a]; else next[a] = b; }
        store[k] = next; setTimeout(() => (listeners['premium:settings-changed'] || []).forEach((fn) => fn({ key: k, settings: next })), 0);
        return { ok: true, settings: next };
      }
      if (channel === 'premium:status' || channel === 'premium:verify') return { keys, verifiedAt: now };
      if (channel === 'premium:popout:list') return { ok: true, windows: [{ route: '/channels/s1/genel' }, { route: '/dm/ayse' }] };
      if (channel === 'premium:layouts:list') return { ok: true, layouts: [{ id: 'l1', name: 'Oyun', windows: 3, createdAt: '2026-11-02T10:00:00Z' }, { id: 'l2', name: 'Çalışma', windows: 2, createdAt: '2026-10-28T10:00:00Z' }] };
      if (channel === 'premium:custom_layouts:list') return { ok: true, active: 'c1', layouts: [{ id: 'c1', name: 'Oyun', widgets: [{}, {}, {}] }, { id: 'c2', name: 'Çalışma', widgets: [{}, {}] }] };
      if (channel === 'premium:app_lock:status') return { ok: true, hasPin: true, config: { enabled: true, idleMinutes: 10, onMinimize: true, onSystemLock: true } };
      if (channel === 'premium:app_lock:config') return { ok: true, hasPin: true, config: args[0] };
      if (channel === 'premium:multi_account:list') return { ok: true, max: 3, accounts: [{ id: 'a1', label: 'Demirr (iş)', signedIn: true }] };
      if (channel === 'premium:hotkeys:status') return { failures: [] };
      if (channel === 'premium:global_mute:status') return { ok: true, hotkeys: { bindings: { toggle_mute: 'CommandOrControl+Alt+M', toggle_deafen: 'CommandOrControl+Alt+D' }, failures: [] } };
      if (channel === 'premium:global_ptt:status') return { ok: true, mode: 'hold', binding: 'Mouse4' };
      if (channel === 'premium:quick_reply:status') return { ok: true, mode: 'native' };
      if (channel === 'premium:media_keys:status') return { ok: true, failed: [] };
      if (channel === 'premium:instant_clip:sources') return { ok: true, sources: [{ id: 'screen:0', name: 'Ekran 1', kind: 'screen' }, { id: 'window:1', name: 'Oyun', kind: 'window' }] };
      return { ok: false, error: 'mock' };
    };
    window.descallPremium = {
      invoke: (channel, ...args) => Promise.resolve(reply(channel, args)),
      on: (channel, fn) => { (listeners[channel] = listeners[channel] || []).push(fn); return () => {}; },
    };
  })();`;
}

async function openPage(b, base, { cat, width = 1280, height = 800, scheme = 'dark', desktop = true, theme }) {
  const ctx = await b.newContext({ viewport: { width, height }, deviceScaleFactor: 2, locale: 'tr-TR', timezoneId: 'Europe/Istanbul', colorScheme: scheme, isMobile: width < 500, hasTouch: width < 500 });
  const plan = 'ultra';
  const list = (feats.featuresFor || feats.default.featuresFor)(plan).map((f) => f.key || f);
  await ctx.route('**/*', async (r) => {
    const url = r.request().url();
    if (/^(data|blob):/.test(url)) return r.continue();
    if (!url.startsWith(base)) return r.abort();
    if (new URL(url).pathname === '/api/premium/me') {
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ plan, status: 'active', ends_at: null, unlimited: true, features: list, monthly_descoin: 15000, next_coin_at: '2026-12-06T05:00:00Z' }) });
    }
    return r.continue();
  });
  await ctx.addInitScript(([api, me, th]) => {
    window.__DESCALL_API_URL__ = api; window.__DESCALL_SOCKET_URL__ = api;
    localStorage.setItem('descall_language', 'tr');
    localStorage.setItem('descall:cookie_consent_v1', JSON.stringify({ choice: 'rejected', at: new Date().toISOString() }));
    localStorage.setItem('descall_token', 'e2e.fake.token');
    localStorage.setItem('descall_user', JSON.stringify(me));
    if (th) { localStorage.setItem('descall_theme', th); localStorage.setItem('theme', th); }
  }, [base, mock.ME, theme || null]);
  if (desktop) await ctx.addInitScript(bridgeScript(list));
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.warn(`[${cat}] pageerror: ${e.message}`));
  await page.goto(`${base}/settings/premium`, { waitUntil: 'load' });
  await page.waitForSelector(`[data-category="${cat}"]`, { timeout: 20000 });
  await page.waitForTimeout(1200);
  if (theme) await page.evaluate((th) => document.documentElement.setAttribute('data-theme', th), theme);
  await page.addStyleTag({ content: '.app-notif-banner{display:none!important}' }).catch(() => {});
  await page.click(`[data-category="${cat}"]`);
  await page.waitForSelector('.ps-root', { timeout: 10000 });
  await page.waitForTimeout(500);
  return { ctx, page };
}

async function openCard(page, key) {
  const already = await page.$(`[data-feature="${key}"].is-open`);
  if (!already) {
    const hit = await page.$(`[data-feature="${key}"] .ps-hit`);
    if (!hit) return false;
    await hit.click();
  }
  await page.waitForSelector(`[data-feature="${key}"].is-open`, { timeout: 5000 });
  await page.waitForTimeout(350);
  return true;
}

/* Scroll so the open card is in view with as much of the page above it as fits. */
async function frame(page) {
  await page.evaluate(() => {
    const sc = document.querySelector('.us-main-scroll');
    const card = document.querySelector('.ps-card.is-open');
    if (!sc || !card) return;
    sc.scrollTop = 0;
    const sr = sc.getBoundingClientRect(); const cr = card.getBoundingClientRect();
    const top = cr.top - sr.top; const bottom = cr.bottom - sr.top;
    let want = 0;
    // First card of the page: keep the hero in view, as in the approved draft.
    if (card.closest('.ps-ch') === document.querySelector('.ps-ch') && card === card.parentElement.firstElementChild) want = 0;
    else if (bottom > sc.clientHeight - 16) want = cr.height + 32 > sc.clientHeight ? top - 16 : bottom - sc.clientHeight + 24;
    sc.scrollTop = Math.max(0, want);
    const nav = document.querySelector('.s3-row[data-nav="premium"]');
    if (nav) nav.scrollIntoView({ block: 'center' });
  });
  await page.waitForTimeout(300);
}

/* Drag each slider of the open card past both ends; check the value and that the fill meets the thumb. */
async function checkSliders(page, key) {
  const probs = [];
  const handles = await page.$$(`[data-feature="${key}"] .ps-slider input[type="range"]`);
  for (const h of handles) {
    await h.scrollIntoViewIfNeeded();
    const info = await h.evaluate((el) => {
      const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
      return { x: r.left, y: r.top, w: r.width, hgt: r.height, min: Number(el.min), max: Number(el.max), step: Number(el.step), ds: el.closest('[data-s]')?.getAttribute('data-s'), pad: [cs.paddingLeft, cs.paddingRight, cs.borderLeftWidth, cs.borderRightWidth].join(' ') };
    });
    const cy = info.y + info.hgt / 2;
    const ends = {};
    for (const [end, target] of [['max', info.x + info.w + 40], ['min', info.x - 40]]) {
      await page.mouse.move(info.x + info.w / 2, cy);
      await page.mouse.down();
      await page.mouse.move(target, cy, { steps: 12 });
      await page.mouse.up();
      await page.waitForTimeout(120);
      const v = await h.evaluate((el) => Number(el.value));
      // Re-measure: the value pill next to the slider may have changed width.
      Object.assign(info, await h.evaluate((el) => { const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, hgt: r.height }; }));
      const shot = readPng(await page.screenshot({ clip: { x: info.x - 2, y: info.y, width: info.w + 4, height: info.hgt } }));
      const sy = Math.round((info.hgt / 2) * 2); // device pixels
      const dpr = 2; const thumb = 18;
      const thumbC = end === 'max' ? info.w - thumb / 2 : thumb / 2;
      const px = (cssX) => shot.px(Math.round((cssX + 2) * dpr), sy);
      const lum = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const isThumb = (c) => lum(c) > 200;
      // The thumb reaches the very end of the control.
      const edgeX = end === 'max' ? info.w - 2 : 1;
      const reachesEdge = isThumb(px(edgeX));
      // Just outside the thumb: filled (accent) at max, rail at min.
      const beside = end === 'max' ? px(thumbC - thumb / 2 - 3) : px(thumbC + thumb / 2 + 3);
      const blueish = beside[2] > beside[0] + 40;
      ends[end] = { v, reachesEdge, beside, blueish };
      if (v !== (end === 'max' ? info.max : info.min)) probs.push(`${info.ds}: ${end} value ${v}, expected ${end === 'max' ? info.max : info.min}`);
      if (!reachesEdge) probs.push(`${info.ds}: thumb does not reach the ${end} edge`);
      if (end === 'max' && !blueish) probs.push(`${info.ds}: fill does not meet the thumb at max (${beside})`);
      if (end === 'min' && blueish) probs.push(`${info.ds}: fill shows before the thumb at min (${beside})`);
    }
    console.log(`  slider ${info.ds}: min ${ends.min.v} / max ${ends.max.v}, edge ${ends.min.reachesEdge}/${ends.max.reachesEdge}, padding/border ${info.pad}`);
  }
  return { count: handles.length, probs };
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const { SETTINGS_CHECKLIST } = await import(path.join(FRONT, 'src/premium/settingsChecklist.js'));
  const srv = await mock.start({ dist: path.join(FRONT, 'dist-e2e'), port: 5361 });
  const base = `http://127.0.0.1:${srv.port}`;
  const b = await pw.chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  Object.assign(mock.ME, { username: 'admin', displayName: 'Demirr', display_name: 'Demirr', isAdmin: true, is_admin: true, status: 'online', premium_plan: 'ultra' });
  let problems = 0;
  for (const cat of ONLY) {
    const { ctx, page } = await openPage(b, base, { cat });
    const shell = await page.evaluate(() => ({
      back: Boolean(document.querySelector('.pp-back')),
      total: document.querySelector('[data-feature-total]')?.getAttribute('data-feature-total'),
      cards: document.querySelectorAll('.ps-card[data-feature]').length,
      error: /Bir şeyler ters gitti|Something went wrong/.test(document.querySelector('.us-main-scroll')?.innerText.slice(0, 400) || ''),
    }));
    if (!shell.back || shell.error || shell.total !== '47') { problems++; console.warn(`[${cat}] shell check failed`, shell); }
    if (!process.env.NOSHOTS) {
      await openCard(page, OPEN[cat]);
      await frame(page);
      await page.screenshot({ path: path.join(OUT, `${cat}-dark.png`) });
    }
    if (process.env.EXTRA) {
      // One screenshot per card of the category: <key>.png.
      const keys = await page.$$eval('.ps-card[data-feature]', (els) => els.map((e) => e.getAttribute('data-feature')));
      for (const k of keys) {
        if (!(await openCard(page, k))) continue;
        await page.evaluate((key) => document.querySelector(`[data-feature="${key}"]`)?.scrollIntoView({ block: 'start' }), k);
        await page.waitForTimeout(250);
        await page.screenshot({ path: path.join(OUT, `${k}.png`) });
      }
    }
    if (process.env.CHECK || process.env.SLIDERS) {
      const keys = await page.$$eval('.ps-card[data-feature]', (els) => els.map((e) => e.getAttribute('data-feature')));
      for (const k of keys) {
        if (!(await openCard(page, k))) { problems++; console.warn(`[${cat}] ${k}: card cannot open`); continue; }
        if (process.env.CHECK) {
          const got = await page.$$eval(`[data-feature="${k}"] [data-s]`, (els) => els.map((e) => e.getAttribute('data-s')));
          const missing = []; const optional = [];
          for (const raw of SETTINGS_CHECKLIST[k]) {
            const it = `${k}.${raw.replace(/^\?/, '')}`;
            if (got.includes(it)) continue;
            (raw.startsWith('?') ? optional : missing).push(it);
          }
          const unknown = [...new Set(got.filter((g) => g.startsWith(`${k}.`) && !SETTINGS_CHECKLIST[k].some((r) => `${k}.${r.replace(/^\?/, '')}` === g)))];
          if (missing.length) { problems++; console.warn(`[${cat}] ${k}: MISSING ${missing.join(', ')}`); }
          console.log(`[${cat}] ${k}: ${SETTINGS_CHECKLIST[k].length - missing.length - optional.length}/${SETTINGS_CHECKLIST[k].length}${optional.length ? ` (not shown now: ${optional.join(', ')})` : ''}${unknown.length ? ` (not in checklist: ${unknown.join(', ')})` : ''}`);
        }
        if (process.env.SLIDERS) {
          const r = await checkSliders(page, k);
          if (r.probs.length) { problems++; console.warn(`[${cat}] ${k}: ${r.probs.join('; ')}`); }
        }
      }
    }
    await ctx.close();
  }
  if (!process.env.NOSHOTS && !process.env.ONLY) {
    // Light theme.
    {
      const { ctx, page } = await openPage(b, base, { cat: 'windows', scheme: 'light', theme: 'light' });
      await openCard(page, 'window_opacity');
      await frame(page);
      await page.screenshot({ path: path.join(OUT, 'windows-light.png') });
      await ctx.close();
    }
    // Phone web (390 wide, no desktop bridge: desktop-only features show their lock).
    {
      const { ctx, page } = await openPage(b, base, { cat: 'audio', width: 390, height: 844, desktop: false });
      await openCard(page, 'mic_monitor');
      const sw = await page.$('[data-feature="mic_monitor"] [data-s="mic_monitor.enabled"][aria-checked="false"]');
      if (sw) { await sw.click(); await page.waitForTimeout(300); }
      await page.evaluate(() => document.querySelector('[data-feature="mic_monitor"]')?.scrollIntoView({ block: 'start' }));
      await page.waitForTimeout(300);
      await page.screenshot({ path: path.join(OUT, 'audio-phone-390.png') });
      await page.evaluate(() => { const s = document.querySelector('.us-main-scroll') || document.scrollingElement; s.scrollTop = 0; window.scrollTo(0, 0); });
      await page.waitForTimeout(200);
      await page.screenshot({ path: path.join(OUT, 'audio-phone-390-top.png') });
      await ctx.close();
    }
  }
  await b.close();
  console.log(problems ? `capture-e: ${problems} problem(s)` : 'capture-e: ok');
  process.exit(problems ? 2 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
