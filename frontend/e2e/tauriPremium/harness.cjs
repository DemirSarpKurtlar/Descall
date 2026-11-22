'use strict';
// The built web app at https://tauri.localhost with the Tauri shims injected in the real order
// (fake __TAURI_INTERNALS__ + mockHost.js, premium-shim.js, then __TAURI__ and
// electron-api-shim.js). Every request is answered locally; nothing leaves the machine.
const fs = require('fs');
const path = require('path');

const args = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
const pw = require(process.env.PLAYWRIGHT || 'playwright');
const DIST = path.resolve(args.dist || path.join(__dirname, '../../dist'));
const WT = path.resolve(__dirname, '../../..');
const SHOTS = Boolean(args.shots);
const OUT = path.resolve(args.out || '/dev/shm/descall-tauri-premium-e2e');
const SHIM = (f) => fs.readFileSync(path.join(WT, 'desktop/app/shim', f), 'utf8');
const MOCK = fs.readFileSync(path.join(__dirname, 'mockHost.js'), 'utf8');
const API = 'https://api.e2e.invalid';
const ME = { id: 'u-e2e-1', username: 'e2e', displayName: 'E2E', display_name: 'E2E', email: 'e2e@example.invalid', status: 'online' };
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.webp': 'image/webp', '.mp3': 'audio/mpeg' };

function apiBody(p) {
  if (/\/auth\/me$/.test(p)) return { user: ME };
  if (/\/premium\/me$/.test(p)) return { status: 'active', plan: 'ultra', unlimited: true };
  if (/\/promo\/popup$/.test(p)) return { popup: null };
  const last = p.split('/').filter(Boolean).pop() || 'items';
  const out = { items: [], friends: [], requests: [], servers: [], groups: [], conversations: [], messages: [], notifications: [], prefs: {} };
  out[last] = Array.isArray(out[last]) ? out[last] : [];
  return out;
}

async function open(browser, cfg) {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 1, locale: 'tr-TR', colorScheme: 'dark' });
  await ctx.route('**/*', async (r) => {
    const url = new URL(r.request().url());
    if (/^(data|blob):/.test(url.protocol)) return r.continue();
    if (url.origin === 'https://tauri.localhost') {
      let file = path.join(DIST, decodeURIComponent(url.pathname));
      // base "./" (ELECTRON_BUILD): /settings/assets/x.js -> /assets/x.js
      const segs = decodeURIComponent(url.pathname).split('/').filter(Boolean);
      for (let i = 0; i < segs.length && !(fs.existsSync(file) && fs.statSync(file).isFile()); i++) file = path.join(DIST, ...segs.slice(i));
      if (!file.startsWith(DIST) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, 'index.html');
      return r.fulfill({ status: 200, contentType: MIME[path.extname(file)] || 'application/octet-stream', body: fs.readFileSync(file) });
    }
    if (url.origin === API || url.origin === 'https://des-call.onrender.com') {
      if (r.request().method() === 'OPTIONS') return r.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
      return r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(apiBody(url.pathname)) });
    }
    return r.abort();
  });
  await ctx.addInitScript(([api, me, cfg]) => {
    window.__E2E_CFG = cfg;
    window.__DESCALL_API_URL__ = api; window.__DESCALL_SOCKET_URL__ = api;
    localStorage.setItem('descall_language', 'tr');
    localStorage.setItem('descall:cookie_consent_v1', JSON.stringify({ choice: 'rejected', at: new Date().toISOString() }));
    localStorage.setItem('descall_token', 'e2e.fake.token');
    localStorage.setItem('descall_user', JSON.stringify(me));
  }, [API, ME, cfg]);
  await ctx.addInitScript(MOCK);
  if (!cfg.noBridge) await ctx.addInitScript(SHIM('premium-shim.js'));
  await ctx.addInitScript(`if (window.__defineTauriGlobal) window.__defineTauriGlobal(); window.__DESCALL_BOOT__ = Object.freeze({ mode: "main", version: "4.1.0", platform: "win32", token: "e2e.fake.token", locale: "tr" });`);
  if (!cfg.noTauri) await ctx.addInitScript(SHIM('electron-api-shim.js'));
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(String(e.stack || e.message || e).slice(0, 600)));
  await page.goto('https://tauri.localhost/settings/premium', { waitUntil: 'load' });
  page.on('console', (m) => { if (m.type() === 'error' && process.env.DBG) console.log('[console]', m.text().slice(0, 300)); });
  try { await page.waitForSelector('[data-testid="premium-tab"]', { timeout: 20000 }); } catch (e) {
    await page.screenshot({ path: path.join(OUT, 'fail-open.png') });
    console.log('url', page.url(), 'errors', page.errors, (await page.evaluate(() => document.body.innerText.slice(0, 400))));
    throw e;
  }
  await page.waitForFunction(() => document.querySelector('.pp-hero2.is-ultra'), null, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(800);
  return { ctx, page };
}

const premiumCalls = (page) => page.evaluate(() => window.__calls.filter((c) => c[0] === 'premium_invoke').map((c) => [c[1].channel, c[1].args, c[2]]));

module.exports = { open, premiumCalls, OUT, SHOTS, pw };
