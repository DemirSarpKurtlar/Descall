'use strict';

/**
 * Premium Yönetimi evidence + smoke run (dev / e2e only). Serves a build
 * against the local mock backend (e2e/perf/mockBackend.cjs) and answers
 * /admin/premium/* from the in-memory contract mock (premiumMock.cjs), then
 * walks the nine pages on a desktop and a phone viewport: search a member,
 * review a change (before/after dialog), pass the step-up code, run a bulk
 * batch to its results, open coupon stats, etc. Screenshots go to --out.
 *
 *   VITE_API_BASE_URL=http://127.0.0.1:5361 VITE_SOCKET_URL=http://127.0.0.1:5361 npx vite build --outDir dist-e2e
 *   PLAYWRIGHT_CORE=/path/to/playwright-core node e2e/premiumAdmin/capture.cjs [--dist=dist-e2e] [--out=../.shots/premium/admin] [--lang=tr]
 */

const fs = require('fs');
const path = require('path');
const mockBackend = require('../perf/mockBackend.cjs');
const { createPremiumMock } = require('./premiumMock.cjs');

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
const pw = require(process.env.PLAYWRIGHT_CORE || 'playwright-core');
const DIST = path.resolve(args.dist || path.join(__dirname, '../../dist-e2e'));
const OUT = path.resolve(args.out || path.join(__dirname, '../../../.shots/premium/admin'));
const PORT = Number(args.port || 5361);
const LANG = String(args.lang || 'tr');
const ONLY = args.only ? String(args.only).split(',') : null;

const PAGES = [
  ['premiumDashboard', '01-dashboard'],
  ['premiumUsers', '02-users'],
  ['premiumBulk', '03-bulk'],
  ['premiumHistory', '04-history'],
  ['premiumAnalytics', '05-analytics'],
  ['premiumFinance', '06-finance'],
  ['premiumCampaigns', '07-campaigns'],
  ['premiumAudit', '08-audit'],
  ['premiumPlans', '09-plans'],
];

async function main() {
  if (!fs.existsSync(path.join(DIST, 'index.html'))) throw new Error(`no build at ${DIST}`);
  fs.mkdirSync(OUT, { recursive: true });
  mockBackend.ME.is_admin = true;
  mockBackend.ME.username = 'admin';
  const srv = await mockBackend.start({ dist: DIST, port: PORT });
  const base = `http://127.0.0.1:${srv.port}`;
  const browser = await pw.chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ['--no-sandbox'] });
  const fails = [];
  const shots = [];
  try {
    for (const vp of [
      { name: 'desktop', viewport: { width: 1440, height: 960 }, scale: 1, mobile: false },
      { name: 'mobile', viewport: { width: 390, height: 844 }, scale: 2, mobile: true },
    ]) {
      const mock = createPremiumMock({ now: Date.now() });
      const ctx = await browser.newContext({
        viewport: vp.viewport, deviceScaleFactor: vp.scale, isMobile: vp.mobile, hasTouch: vp.mobile,
        locale: LANG === 'tr' ? 'tr-TR' : 'en-US', timezoneId: 'Europe/Istanbul', colorScheme: 'dark',
      });
      await ctx.route('**/*', async (r) => {
        const req = r.request();
        const url = new URL(req.url());
        if (/^(data|blob):/.test(req.url())) return r.continue();
        if (url.origin !== base) return r.abort();
        const headers = { 'access-control-allow-origin': '*' };
        if (/^(\/api)?\/admin\/step-up$/.test(url.pathname) && req.method() === 'POST') {
          return r.fulfill({ status: 200, contentType: 'application/json', headers, body: JSON.stringify({ token: 'e2e-step-up', expiresInSec: 900 }) });
        }
        const m = url.pathname.match(/^(?:\/api)?\/admin\/premium(\/.*)$/);
        if (m && req.resourceType() !== 'document') {
          let body = {};
          try { body = req.postDataJSON() || {}; } catch { body = {}; }
          const out = mock.handle(req.method(), m[1], Object.fromEntries(url.searchParams), body, req.headers());
          await new Promise((res) => setTimeout(res, 60));
          return r.fulfill({ status: out.status, contentType: 'application/json', headers, body: JSON.stringify(out.body) });
        }
        return r.continue();
      });
      await ctx.addInitScript(([api, me, lang]) => {
        window.__DESCALL_API_URL__ = api; window.__DESCALL_SOCKET_URL__ = api;
        localStorage.setItem('descall_language', lang);
        localStorage.setItem('descall:ios-pwa-install-dismissed', '1');
        localStorage.setItem('descall:cookie_consent_v1', JSON.stringify({ choice: 'rejected', at: new Date().toISOString() }));
        localStorage.setItem('descall_token', 'e2e.fake.token');
        localStorage.setItem('descall_user', JSON.stringify(me));
      }, [base, mockBackend.ME, LANG]);
      const page = await ctx.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(String(e.message || e)));
      await page.goto(`${base}/admin/panel`, { waitUntil: 'load' });
      try {
        await page.locator('.adm').first().waitFor({ timeout: 30000 });
        await page.locator('.adm-nav-item[data-tab="premiumDashboard"], .adm-topbar').first().waitFor({ timeout: 20000 });
      } catch (err) {
        await page.screenshot({ path: path.join(OUT, `fail-boot-${vp.name}.png`) }).catch(() => {});
        throw new Error(`${vp.name}: admin panel did not open (${errors.join(' | ') || err.message.split('\n')[0]})`);
      }

      const shot = async (name, { full = true } = {}) => {
        await page.waitForTimeout(350);
        const file = path.join(OUT, `${name}-${vp.name}.png`);
        if (full) {
          // The panel scrolls inside .adm-main: grow the window to the page height for one image.
          const need = await page.evaluate(() => {
            const m = document.querySelector('.adm-main');
            return m ? Math.ceil(m.scrollHeight - m.clientHeight) : 0;
          });
          if (need > 0) await page.setViewportSize({ width: vp.viewport.width, height: Math.min(6000, vp.viewport.height + need + 8) });
          await page.waitForTimeout(250);
          await page.screenshot({ path: file });
          if (need > 0) await page.setViewportSize(vp.viewport);
        } else {
          await page.screenshot({ path: file });
        }
        shots.push(file);
      };
      const open = async (id) => {
        const menuBtn = page.locator('.adm-topbar .adm-icon-btn').first();
        if (await menuBtn.isVisible().catch(() => false)) await menuBtn.click();
        await page.locator(`.adm-nav-item[data-tab="${id}"]:visible`).first().click({ timeout: 10000 });
        await page.locator(`.pa-root[data-page="${id}"]`).waitFor({ timeout: 15000 });
        await page.waitForTimeout(500);
      };
      const stepUp = async () => {
        const code = page.locator('input.tfa-code');
        if (await code.waitFor({ state: 'visible', timeout: 4000 }).then(() => true, () => false)) {
          if (!stepUpShot) {
            stepUpShot = true;
            await shot('02-users-stepup', { full: false });
          }
          await code.fill('123456');
          await page.keyboard.press('Enter');
          await code.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
        }
      };
      const want = (id) => !ONLY || ONLY.includes(id);
      let stepUpShot = false;

      for (const [id, label] of PAGES) {
        if (!want(id)) continue;
        try {
          await open(id);
          if (id === 'premiumDashboard') {
            await page.locator('.pa-kpi strong').first().waitFor();
            await shot(label);
          } else if (id === 'premiumUsers') {
            await shot(`${label}-empty`, { full: false });
            await page.locator('.pa-search input').fill('a');
            await page.locator('.pa-hits button').first().waitFor({ timeout: 8000 });
            if (!vp.mobile) await shot(`${label}-search`, { full: false });
            // A member with an active, time-limited membership.
            const target = mock.users.find((u) => { const s = mock.subs.get(u.id); return s && s.status === 'active' && !s.unlimited; });
            await page.locator('.pa-search input').fill(target.username);
            await page.locator('.pa-hits button').first().click();
            await page.locator('.pa-detail').waitFor({ timeout: 8000 });
            await shot(`${label}-detail`);
            await page.locator('.pa-ops button', { hasText: LANG === 'tr' ? 'Uzat' : 'Extend' }).first().click();
            await page.locator('.pa-presets button').nth(2).click();
            await page.locator('.pa-action input[aria-required="true"]').fill(LANG === 'tr' ? 'Etkinlik ödülü, 30 gün ek süre' : 'Event reward, 30 extra days');
            await page.locator('.pa-action .mt-btn.primary').click();
            await page.locator('.pa-modal .pa-diff').waitFor({ timeout: 5000 });
            await shot(`${label}-confirm`, { full: false });
            await page.locator('.pa-modal .mt-modal-acts .mt-btn').last().click();
            await stepUp();
            await page.locator('.pa-action .pc-hint.is-ok').waitFor({ timeout: 8000 }).catch(() => fails.push(`${vp.name}: apply did not confirm`));
            await shot(`${label}-applied`);
          } else if (id === 'premiumBulk') {
            const input = page.locator('.pc-chips input');
            for (const q of ['ayse', 'mert', 'lena', 'duru']) {
              await input.fill(q);
              await page.locator('.pc-suggest li').first().waitFor({ timeout: 8000 });
              await input.press('Enter');
            }
            await page.locator('.pa-ops button').first().click();
            const seg = page.locator('.pa-fields .pa-seg').first();
            await seg.locator('button').nth(1).click();
            await page.locator('.pa-presets button').nth(1).click();
            await page.locator('.pa-fields input[aria-required="true"]').fill(LANG === 'tr' ? 'Ultra beta test grubu' : 'Ultra beta test group');
            await page.locator('.pa-fields input[aria-required="true"]').blur();
            await shot(`${label}-form`);
            await page.locator('.pa-page .mt-form-foot .mt-btn.primary').click();
            await page.locator('.pa-confirm').waitFor();
            await shot(`${label}-confirm`);
            await page.locator('.pa-confirm .mt-btn.primary').click();
            await stepUp();
            await page.locator('.pa-batch').waitFor({ timeout: 8000 });
            await shot(`${label}-result`);
          } else if (id === 'premiumHistory') {
            await page.locator('.pa-table tbody tr').first().waitFor({ timeout: 8000 });
            await page.locator('.pa-expand').first().click();
            await shot(label);
          } else if (id === 'premiumAnalytics') {
            await page.locator('.pa-metric').first().waitFor({ timeout: 8000 });
            await page.locator('.agr-range button').nth(2).click();
            await page.waitForTimeout(600);
            await shot(label);
          } else if (id === 'premiumFinance') {
            await page.locator('.pa-banner').waitFor({ timeout: 8000 });
            await shot(label);
          } else if (id === 'premiumCampaigns') {
            await page.locator('.pa-camps li').first().waitFor({ timeout: 8000 });
            await page.locator('.pa-camp-main').first().click();
            await page.locator('.pa-recent, .pa-page .agr-card h3:has(.pa-mono)').first().waitFor({ timeout: 8000 }).catch(() => {});
            await shot(label);
            await page.locator('.pa-camp-form .pa-seg').first().locator('button').nth(1).click();
            await page.locator('.pa-callout').waitFor();
            await shot(`${label}-percent`, { full: false });
          } else if (id === 'premiumAudit') {
            await page.locator('.pa-table tbody tr').first().waitFor({ timeout: 8000 });
            await shot(label);
          } else if (id === 'premiumPlans') {
            await page.locator('.pa-plan').first().waitFor({ timeout: 8000 });
            await shot(label);
          }
        } catch (err) {
          fails.push(`${vp.name} ${id}: ${err.message.split('\n')[0]}`);
          await page.screenshot({ path: path.join(OUT, `fail-${label}-${vp.name}.png`) }).catch(() => {});
        }
      }
      // No horizontal page scroll on the phone.
      if (vp.mobile) {
        const wide = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        if (wide > 1) fails.push(`mobile: page scrolls sideways by ${wide}px`);
      }
      if (errors.length) fails.push(`${vp.name} page errors: ${errors.join(' | ')}`);
      await ctx.close();
    }
  } finally {
    await browser.close();
    srv.close();
  }
  console.log(shots.map((s) => path.relative(process.cwd(), s)).join('\n'));
  if (fails.length) {
    console.error(`[premium-admin-e2e] FAIL\n - ${fails.join('\n - ')}`);
    process.exit(1);
  }
  console.log(`[premium-admin-e2e] OK (${shots.length} shots in ${OUT})`);
  process.exit(0);
}

main().catch((e) => { console.error('[premium-admin-e2e] FAIL', e); process.exit(1); });
