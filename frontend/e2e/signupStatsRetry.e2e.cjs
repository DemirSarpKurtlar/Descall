'use strict';

/**
 * Regression check for Yönetici Paneli › Kayıt İstatistikleri on iPhone (3.0.0 bug:
 * the sheet stayed on "İstatistikler yüklenemedi." because production never got
 * GET /admin/signup-stats, and "Tekrar dene" gave no feedback while retrying).
 *
 * Opens the admin panel from the glass "me" menu on an iPhone-sized viewport
 * against the local mock backend (perf/mockBackend.cjs). The stats endpoint
 * answers 404 at first (like the stale production backend), then 200 with an
 * example payload computed by the real backend aggregator (backend/lib/signupStats.js,
 * synthetic users only). Checks: the error state shows with "Tekrar dene", the
 * retry re-requests and the sheet then renders the KPIs, no page errors.
 *
 *   VITE_API_BASE_URL=http://127.0.0.1:5361 VITE_SOCKET_URL=http://127.0.0.1:5361 npx vite build --outDir dist-e2e
 *   node e2e/signupStatsRetry.e2e.cjs [--dist=dist-e2e] [--out=/tmp/signup-stats-e2e] [--engine=chromium|webkit]
 */

const fs = require('fs');
const path = require('path');
const mock = require('./perf/mockBackend.cjs');
// The aggregator module also holds the request hooks, which import the Supabase client:
// stub it so this test never needs (or reaches) a database.
const supabasePath = require.resolve('../backend/db/supabase');
require.cache[supabasePath] = { id: supabasePath, filename: supabasePath, loaded: true, exports: {} };
const ss = require('../backend/lib/signupStats');

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
const pw = require(process.env.PLAYWRIGHT_CORE || 'playwright-core');
const DIST = path.resolve(args.dist || path.join(__dirname, '../dist-e2e'));
const OUT = path.resolve(args.out || process.env.DESCALL_E2E_SHOTS || '/tmp/descall-signup-stats-e2e');
const ENGINE = String(args.engine || 'chromium');
const PORT = Number(args.port || 5361);
const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

/** Example payload from the real aggregator: synthetic users, no production data. */
function exampleStats() {
  const now = new Date();
  const range = ss.resolveRange({ granularity: 'day' }, now);
  const users = [];
  const methods = ['email', 'google', 'apple'];
  const sources = ['direct', 'discord', 'google', 'tiktok'];
  const countries = ['TR', 'TR', 'TR', 'DE', 'AZ', 'NL'];
  let n = 0;
  for (let d = 0; d < 60; d++) {
    const per = 2 + ((d * 7) % 5);
    for (let i = 0; i < per; i++) {
      const at = new Date(now.getTime() - d * 86400000 - i * 3600000).toISOString();
      users.push({ id: `u-${++n}`, created_at: at, signup_at: at, auth_method: methods[n % 3], first_touch_source: sources[n % 4], signup_country: countries[n % 6], first_app_opened_at: n % 4 ? at : null, deleted_at: null });
    }
  }
  const startedDays = users.flatMap((u, i) => (i % 2 ? [ss.istDay(u.created_at), ss.istDay(u.created_at)] : [ss.istDay(u.created_at)]));
  return ss.computeSignupStats({ users, startedDays, attempts: [], activeDays: [], range, now });
}

async function main() {
  if (!fs.existsSync(path.join(DIST, 'index.html'))) throw new Error(`no build at ${DIST}`);
  fs.mkdirSync(OUT, { recursive: true });
  mock.ME.is_admin = true;
  const srv = await mock.start({ dist: DIST, port: PORT });
  const base = `http://127.0.0.1:${srv.port}`;
  const payload = exampleStats();
  let statsCalls = 0;
  let failFirst = true;
  const launch = ENGINE === 'webkit' ? pw.webkit.launch() : pw.chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ['--no-sandbox'] });
  const browser = await launch;
  const fails = [];
  try {
    const ctxOpts = { viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: IPHONE_UA, locale: 'tr-TR', timezoneId: 'Europe/Istanbul', colorScheme: 'dark' };
    if (ENGINE === 'webkit') delete ctxOpts.isMobile;
    const ctx = await browser.newContext(ctxOpts);
    await ctx.route('**/*', async (r) => {
      const url = r.request().url();
      if (/^(data|blob):/.test(url)) return r.continue();
      if (!url.startsWith(base)) return r.abort();
      const p = new URL(url).pathname;
      if (/^(\/api)?\/admin\/signup-stats\/?$/.test(p) && r.request().resourceType() !== 'document') {
        statsCalls++;
        const headers = { 'access-control-allow-origin': '*' };
        if (failFirst) return r.fulfill({ status: 404, contentType: 'application/json', headers, body: '{"error":"Not found"}' });
        // Slow enough to see the retry button's busy state.
        await new Promise((res) => setTimeout(res, 1200));
        return r.fulfill({ status: 200, contentType: 'application/json', headers, body: JSON.stringify(payload) });
      }
      return r.continue();
    });
    await ctx.addInitScript(([api, me]) => {
      window.__DESCALL_API_URL__ = api; window.__DESCALL_SOCKET_URL__ = api;
      localStorage.setItem('descall_language', 'tr');
      localStorage.setItem('descall:ios-pwa-install-dismissed', '1');
      localStorage.setItem('descall:cookie_consent_v1', JSON.stringify({ choice: 'rejected', at: new Date().toISOString() }));
      localStorage.setItem('descall_token', 'e2e.fake.token');
      localStorage.setItem('descall_user', JSON.stringify(me));
    }, [base, mock.ME]);
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e.message || e)));
    await page.goto(base + '/', { waitUntil: 'load' });
    // CI's Chrome shows the "turn on notifications" banner over the toolbar; it is not under test.
    await page.addStyleTag({ content: '.app-notif-banner{display:none!important}' });
    await page.locator('.g-me-btn').first().click({ timeout: 20000 });
    await page.getByRole('menuitem', { name: /Yönetici|Admin/ }).first().click({ timeout: 10000 });
    // 3.1: the phone admin panel lists every section in a full-screen menu
    // (AdminShell drawer); desktop/iPad keep the side menu open.
    const menuBtn = page.locator('.adm-topbar .adm-icon-btn').first();
    await page.locator('.adm').first().waitFor({ timeout: 20000 });
    if (await menuBtn.isVisible().catch(() => false)) await menuBtn.click();
    await page.locator('.adm-nav-item[data-tab="signupStats"]:visible').first().click({ timeout: 10000 });

    await page.getByText('İstatistikler yüklenemedi.').waitFor({ timeout: 20000 });
    const retry = page.getByRole('button', { name: 'Tekrar dene' });
    await retry.waitFor({ timeout: 5000 });
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(OUT, 'iphone-error.png') });
    const callsBefore = statsCalls;

    failFirst = false;
    await retry.click();
    // Feedback while the retry runs (before: the button looked dead and nothing changed).
    const busy = page.getByRole('button', { name: 'Yükleniyor…' });
    await busy.waitFor({ timeout: 1000 }).catch(() => fails.push('retry button shows no busy state'));
    if (!(await busy.isDisabled().catch(() => false))) fails.push('retry button not disabled while retrying');
    await page.locator('.st3 .st-state').waitFor({ state: 'detached', timeout: 15000 }).catch(() => fails.push('error state still shown after retry'));
    if (statsCalls <= callsBefore) fails.push('retry did not request the stats again');
    const text = await page.locator('.st3').first().innerText().catch(() => '');
    if (/yüklenemedi/.test(text)) fails.push('still shows the load error');
    if (!text.trim()) fails.push('stats sheet empty');
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(OUT, 'iphone-loaded.png') });
    if (errors.length) fails.push(`page errors: ${errors.join(' | ')}`);
  } finally {
    await browser.close();
    srv.close();
  }
  if (fails.length) {
    console.error(`[e2e-signup-stats] FAIL\n - ${fails.join('\n - ')}`);
    process.exit(1);
  }
  console.log(`[e2e-signup-stats] OK (${ENGINE}, ${statsCalls} stats requests; shots in ${OUT})`);
  process.exit(0);
}

main().catch((e) => { console.error('[e2e-signup-stats] FAIL', e); process.exit(1); });
