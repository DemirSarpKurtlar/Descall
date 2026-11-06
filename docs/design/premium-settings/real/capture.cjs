'use strict';
/* Renders the Descall+ settings drafts inside the real app (dark, desktop 1280x800).
 * From frontend/:
 *   VITE_API_BASE_URL=http://127.0.0.1:5361 VITE_SOCKET_URL=http://127.0.0.1:5361 npx vite build --outDir dist-e2e
 *   PLAYWRIGHT_CORE=<playwright> node ../docs/design/premium-settings/real/capture.cjs [out-dir] [ids...]
 * Also writes current-premium.png (the page as it is today). */
const fs = require('fs');
const path = require('path');
const FRONT = process.cwd();
const mock = require(path.join(FRONT, 'e2e/perf/mockBackend.cjs'));
const pw = require(process.env.PLAYWRIGHT_CORE || 'playwright-core');
const OUT = path.resolve(process.argv[2] || path.join(__dirname));
const IDS = process.argv.slice(3).length ? process.argv.slice(3) : ['current', 'a1', 'a2', 'b1', 'b2', 'c1', 'c2'];
const INJECT = fs.readFileSync(path.join(__dirname, 'drafts-inject.js'), 'utf8');
const feats = require(path.join(FRONT, 'backend/lib/premium/features.js'));

(async () => {
  const srv = await mock.start({ dist: path.join(FRONT, 'dist-e2e'), port: 5361 });
  const base = `http://127.0.0.1:${srv.port}`;
  const b = await pw.chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  for (const id of IDS) {
    const plan = id === 'b1' ? 'plus' : 'ultra';
    Object.assign(mock.ME, { username: 'admin', displayName: 'Demirr', display_name: 'Demirr', isAdmin: true, is_admin: true, status: 'online', premium_plan: plan });
    const ctx = await b.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2, locale: 'tr-TR', timezoneId: 'Europe/Istanbul', colorScheme: 'dark' });
    await ctx.route('**/*', async (r) => {
      const url = r.request().url();
      if (/^(data|blob):/.test(url)) return r.continue();
      if (!url.startsWith(base)) return r.abort();
      if (new URL(url).pathname === '/api/premium/me') {
        const list = (feats.featuresFor || feats.default.featuresFor)(plan).map((f) => f.key || f);
        return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ plan, status: 'active', ends_at: plan === 'plus' ? '2027-01-06T05:00:00Z' : null, unlimited: plan === 'ultra', features: list, monthly_descoin: plan === 'plus' ? 5000 : 15000, next_coin_at: '2026-12-06T05:00:00Z' }) });
      }
      return r.continue();
    });
    await ctx.addInitScript(([api, me]) => {
      window.__DESCALL_API_URL__ = api; window.__DESCALL_SOCKET_URL__ = api;
      localStorage.setItem('descall_language', 'tr');
      localStorage.setItem('descall:cookie_consent_v1', JSON.stringify({ choice: 'rejected', at: new Date().toISOString() }));
      localStorage.setItem('descall_token', 'e2e.fake.token');
      localStorage.setItem('descall_user', JSON.stringify(me));
    }, [base, mock.ME]);
    const page = await ctx.newPage();
    await page.goto(`${base}/settings/premium`, { waitUntil: 'load' });
    await page.waitForSelector('.us-tab .pp-hero, .us-tab', { timeout: 15000 });
    await page.waitForTimeout(3000);
    await page.addStyleTag({ content: '.app-notif-banner{display:none!important}' }).catch(() => {});
    if (id !== 'current') {
      await page.addScriptTag({ content: INJECT });
      await page.evaluate((d) => window.__dpxDraft(d), id);
      await page.waitForTimeout(400);
    }
    await page.screenshot({ path: path.join(OUT, id === 'current' ? 'current-premium.png' : `real-${id}.png`) });
    await ctx.close();
  }
  await b.close();
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
