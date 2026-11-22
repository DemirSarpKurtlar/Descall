'use strict';

/**
 * Sunucu Ağı evidence + smoke run (dev / e2e only). Serves a build against the local mock
 * backend (e2e/perf/mockBackend.cjs) and answers /admin/nodes/* from the in-memory contract
 * mock (nodesMock.cjs); every other origin is aborted, nothing reaches a real server. Walks
 * the tab on a desktop (1440x900) and a phone viewport: control centre, capacity preview
 * while dragging, schedule grid, failover drill result, emergency dialog, node key reveal,
 * revoke, and the empty states (single-node, Key Value down, PC never registered).
 *
 *   VITE_API_BASE_URL=http://127.0.0.1:5361 VITE_SOCKET_URL=http://127.0.0.1:5361 npx vite build --outDir /dev/shm/anx-dist
 *   PLAYWRIGHT_CORE=/path/to/playwright-core node e2e/nodesAdmin/capture.cjs --dist=/dev/shm/anx-dist --out=<dir> [--lang=tr]
 */

const fs = require('fs');
const path = require('path');
const mockBackend = require('../perf/mockBackend.cjs');
const { createNodesMock } = require('./nodesMock.cjs');

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
const pw = require(process.env.PLAYWRIGHT_CORE || 'playwright-core');
const DIST = path.resolve(args.dist || path.join(__dirname, '../../dist-e2e'));
const OUT = path.resolve(args.out || path.join(__dirname, '../../../.shots/nodes'));
const PORT = Number(args.port || 5361);
const LANG = String(args.lang || 'tr');

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
  let mock = createNodesMock();
  try {
    for (const vp of [
      { name: 'desktop', viewport: { width: 1440, height: 900 }, scale: 1, mobile: false },
      { name: 'phone', viewport: { width: 390, height: 844 }, scale: 2, mobile: true },
    ]) {
      mock = createNodesMock();
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
        const m = url.pathname.match(/^(?:\/api)?\/admin\/nodes(\/.*)?$/);
        if (m && req.resourceType() !== 'document') {
          let body = {};
          try { body = req.postDataJSON() || {}; } catch { body = {}; }
          const out = mock.handle(req.method(), m[1] || '', Object.fromEntries(url.searchParams), body);
          await new Promise((res) => setTimeout(res, 40));
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

      const shot = async (name, { full = false } = {}) => {
        await page.waitForTimeout(400);
        const file = path.join(OUT, `${name}-${vp.name}.png`);
        if (full) {
          const need = await page.evaluate(() => {
            const m = document.querySelector('.adm-main');
            return m ? Math.ceil(m.scrollHeight - m.clientHeight) : 0;
          });
          if (need > 0) await page.setViewportSize({ width: vp.viewport.width, height: Math.min(7000, vp.viewport.height + need + 8) });
          await page.waitForTimeout(300);
          await page.screenshot({ path: file });
          if (need > 0) await page.setViewportSize(vp.viewport);
        } else {
          await page.screenshot({ path: file });
        }
        shots.push(file);
      };
      const stepUp = async () => {
        const code = page.locator('input.tfa-code');
        if (await code.waitFor({ state: 'visible', timeout: 2500 }).then(() => true, () => false)) {
          await code.fill('123456');
          await page.keyboard.press('Enter');
          await code.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
        }
      };
      const open = async () => {
        await page.goto(`${base}/admin/panel`, { waitUntil: 'load' });
        await page.locator('.adm').first().waitFor({ timeout: 30000 });
        const menuBtn = page.locator('.adm-topbar .adm-icon-btn').first();
        if (await menuBtn.isVisible().catch(() => false)) await menuBtn.click();
        await page.locator('.adm-nav-item[data-tab="nodes"]:visible').first().click({ timeout: 10000 });
        await page.locator('[data-testid="admin-nodes"]').waitFor({ timeout: 15000 });
        await page.locator('[data-testid="anx-capacity"]').first().waitFor({ timeout: 10000 }).catch(() => {});
        await page.waitForTimeout(900);
      };
      const step = async (label, fn) => {
        try {
          await fn();
        } catch (err) {
          fails.push(`${vp.name} ${label}: ${String(err.message || err).split('\n')[0]}`);
          await page.screenshot({ path: path.join(OUT, `fail-${label}-${vp.name}.png`) }).catch(() => {});
          await page.keyboard.press('Escape').catch(() => {});
        }
      };

      await step('open', open);
      await step('overview', async () => {
        await page.locator('[data-testid="anx-mem-plot"]').waitFor({ timeout: 8000 });
        await shot('01-kontrol-merkezi');
        await shot('01-kontrol-merkezi-tam', { full: true });
      });
      if (!vp.mobile) {
        await step('hover', async () => {
          const plot = page.locator('[data-testid="anx-mem-plot"] .anx-chart-plot');
          const box = await plot.boundingBox();
          await page.mouse.move(box.x + box.width * 0.72, box.y + box.height * 0.5);
          await page.locator('.anx-tip').waitFor({ timeout: 3000 });
          await page.locator('[data-testid="anx-mem-chart"]').scrollIntoViewIfNeeded();
          await shot('02-grafik-ipucu');
          await page.mouse.move(5, 5);
        });
      }
      await step('slider', async () => {
        const ram = page.locator('[data-testid="anx-ram"]');
        await ram.scrollIntoViewIfNeeded();
        await ram.fill('5120');
        await page.locator('[data-testid="anx-preview-btn"]').click();
        await page.locator('[data-testid="anx-preview"]').waitFor();
        await page.locator('[data-testid="anx-share"]').scrollIntoViewIfNeeded();
        await shot('03-pay-onizleme');
        await page.locator('[data-testid="anx-apply"]').click();
        await stepUp();
        await page.locator('[data-testid="atk-toast"]').waitFor({ timeout: 5000 });
        await shot('03b-pay-uygulandi');
      });
      await step('plan', async () => {
        await page.locator('[data-testid="anx-plan-edit"]').click();
        await page.locator('[data-testid="anx-heat"]').waitFor();
        // Paint Saturday morning 09-11 by dragging.
        const a = page.locator('[data-testid="anx-cell-6-9"]');
        const b = page.locator('[data-testid="anx-cell-6-11"]');
        const ba = await a.boundingBox();
        const bb = await b.boundingBox();
        await page.mouse.move(ba.x + ba.width / 2, ba.y + ba.height / 2);
        await page.mouse.down();
        await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2, { steps: 6 });
        await page.mouse.up();
        await shot('04-zaman-plani');
        await page.locator('[data-testid="anx-plan-save"]').click();
        await stepUp();
        await page.locator('[data-testid="anx-plan-dlg"]').waitFor({ state: 'hidden', timeout: 5000 });
      });
      await step('drill', async () => {
        await page.locator('[data-testid="anx-drill"]').scrollIntoViewIfNeeded();
        await page.locator('[data-testid="anx-drill"]').click();
        await page.locator('[data-testid="anx-drill-dlg"]').waitFor();
        if (!vp.mobile) await shot('05-devir-provasi-giris');
        await page.locator('[data-testid="anx-drill-go"]').click();
        await stepUp();
        await page.locator('[data-testid="anx-drill-result"]').waitFor({ timeout: 8000 });
        await shot('05-devir-provasi-sonuc');
        await page.locator('[data-testid="anx-drill-close"]').click();
      });
      await step('emergency', async () => {
        await page.locator('[data-testid="anx-emergency"]').click();
        await page.locator('[data-testid="anx-emg-dlg"]').waitFor();
        await page.locator('[data-testid="anx-emg-reason"]').fill(LANG === 'tr' ? 'Ev interneti gidip geliyor' : 'Home internet keeps dropping');
        await page.locator('[data-testid="anx-emg-sure"]').check({ force: true });
        await shot('06-acil-herkes-render');
        await page.locator('[data-testid="anx-emg-go"]').click();
        await stepUp();
        await page.locator('[data-testid="anx-emg-banner"]').waitFor({ timeout: 8000 });
        await page.locator('[data-testid="admin-nodes"]').evaluate((el) => el.scrollIntoView({ block: 'start' }));
        await shot('06b-acil-durum-afisi');
        await page.locator('[data-testid="anx-emg-resume"]').click();
        await stepUp();
        await page.locator('[data-testid="anx-emg-banner"]').waitFor({ state: 'hidden', timeout: 8000 });
      });
      await step('keys', async () => {
        await page.locator('[data-testid="anx-keys-btn"]').click();
        await page.locator('[data-testid="anx-keylist"] [data-testid="anx-key-row"]').first().waitFor();
        await shot('07-dugum-anahtarlari');
        await page.locator('[data-testid="anx-key-name"]').fill(LANG === 'tr' ? 'Masaüstü (oyun)' : 'Desktop (gaming)');
        await page.locator('[data-testid="anx-key-create"]').click();
        await stepUp();
        await page.locator('[data-testid="anx-reveal"]').waitFor({ timeout: 5000 });
        await shot('08-anahtar-bir-kez');
        await page.locator('[data-testid="anx-saved-chk"]').check({ force: true });
        await page.locator('[data-testid="anx-reveal-done"]').click();
        await page.locator('[data-testid="anx-key-revoke"]').first().click();
        await page.locator('[data-testid="anx-revoke-dlg"]').waitFor();
        await page.locator('.anx-chips button').first().click();
        const name = await page.locator('[data-testid="anx-revoke-dlg"] .atk-mh-t p').innerText();
        await page.locator('[data-testid="anx-revoke-typed"]').fill(name.split(' · ')[0]);
        await shot('09-anahtar-iptal');
        await page.keyboard.press('Escape');
        await page.keyboard.press('Escape');
      });
      for (const [scenario, label] of [['single', '10-tek-sunucu'], ['kvDown', '11-ortak-bellek-yok'], ['noPc', '12-pc-kurulum']]) {
        if (vp.mobile && scenario === 'kvDown') continue;
        await step(scenario, async () => {
          mock = createNodesMock({ scenario });
          await open();
          await shot(label, { full: !vp.mobile });
        });
      }
      if (errors.length) fails.push(`${vp.name}: page errors: ${errors.slice(0, 3).join(' | ')}`);
      await ctx.close();
    }
  } finally {
    await browser.close();
    await srv.close?.();
  }
  console.log(`[nodes-capture] ${shots.length} shots in ${OUT}`);
  if (fails.length) {
    console.log(`[nodes-capture] FAIL\n  ${fails.join('\n  ')}`);
    process.exitCode = 1;
  } else console.log('[nodes-capture] OK');
}

main().catch((err) => {
  console.error('[nodes-capture] FAIL', err);
  process.exit(1);
});
