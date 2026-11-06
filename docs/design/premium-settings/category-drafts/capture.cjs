'use strict';
/* Renders the Descall+ category-view drafts (A-E) inside the real app (dark, 1280x800, @2x).
 * Same approach as ../real/capture.cjs: serve frontend/dist-e2e with the e2e mock backend,
 * answer /api/premium/me as Ultra, open Ayarlar > Descall+, click a category tile and swap
 * the category view body (everything after the real back link) for the draft.
 *
 * From frontend/ (dist-e2e must be built against the mock):
 *   VITE_API_BASE_URL=http://127.0.0.1:5361 npx vite build --outDir dist-e2e
 *   node ../docs/design/premium-settings/category-drafts/capture.cjs [out-dir] [ids...]
 * ids: current, a, b, c, d, e (default: all). Writes <id>-windows.png and <id>-audio.png.
 * Env CHECK=1 also expands every card of every draft in turn and prints which required
 * settings (data-s="feature.setting") are missing, compared with checklist.json. */
const fs = require('fs');
const path = require('path');
const FRONT = process.cwd();
const mock = require(path.join(FRONT, 'e2e/perf/mockBackend.cjs'));
const pw = require(process.env.PLAYWRIGHT_CORE || '/opt/node22/lib/node_modules/playwright');
const OUT = path.resolve(process.argv[2] || __dirname);
const ALL = ['current', 'a', 'b', 'c', 'd', 'e'];
const IDS = process.argv.slice(3).length ? process.argv.slice(3) : ALL;
const INJECT = fs.readFileSync(path.join(__dirname, 'drafts-inject.js'), 'utf8');
const CHECK = JSON.parse(fs.readFileSync(path.join(__dirname, 'checklist.json'), 'utf8'));
const feats = require(path.join(FRONT, 'backend/lib/premium/features.js'));
const CATS = ['windows', 'audio'];

(async () => {
  const srv = await mock.start({ dist: path.join(FRONT, 'dist-e2e'), port: 5361 });
  const base = `http://127.0.0.1:${srv.port}`;
  const b = await pw.chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const plan = 'ultra';
  Object.assign(mock.ME, { username: 'admin', displayName: 'Demirr', display_name: 'Demirr', isAdmin: true, is_admin: true, status: 'online', premium_plan: plan });
  let problems = 0;
  for (const id of IDS) {
    for (const cat of CATS) {
      const ctx = await b.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2, locale: 'tr-TR', timezoneId: 'Europe/Istanbul', colorScheme: 'dark' });
      await ctx.route('**/*', async (r) => {
        const url = r.request().url();
        if (/^(data|blob):/.test(url)) return r.continue();
        if (!url.startsWith(base)) return r.abort();
        if (new URL(url).pathname === '/api/premium/me') {
          const list = (feats.featuresFor || feats.default.featuresFor)(plan).map((f) => f.key || f);
          return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ plan, status: 'active', ends_at: null, unlimited: true, features: list, monthly_descoin: 15000, next_coin_at: '2026-12-06T05:00:00Z' }) });
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
      page.on('pageerror', (e) => console.warn(`[${id}/${cat}] pageerror: ${e.message}`));
      await page.goto(`${base}/settings/premium`, { waitUntil: 'load' });
      await page.waitForSelector(`[data-category="${cat}"]`, { timeout: 20000 });
      await page.waitForTimeout(1500);
      await page.addStyleTag({ content: '.app-notif-banner{display:none!important}' }).catch(() => {});
      await page.click(`[data-category="${cat}"]`);
      await page.waitForSelector('.pp-back', { timeout: 10000 });
      await page.waitForTimeout(600);
      if (id !== 'current') {
        await page.addScriptTag({ content: INJECT });
        await page.evaluate(([d, c]) => window.__dpcDraft(d, c), [id, cat]);
        await page.waitForTimeout(500);
      }
      const shell = await page.evaluate(() => ({
        sidebar: Boolean(document.querySelector('.s3-row[data-nav="premium"]')),
        back: Boolean(document.querySelector('.pp-back')),
        error: /Bir şeyler ters gitti|Something went wrong|404/.test(document.querySelector('.us-main-scroll')?.innerText.slice(0, 400) || ''),
      }));
      if (!shell.sidebar || !shell.back || shell.error) { problems++; console.warn(`[${id}/${cat}] shell check failed`, shell); }
      await page.screenshot({ path: path.join(OUT, `${id}-${cat}.png`) });
      if (process.env.CHECK && id !== 'current') {
        const found = await page.evaluate(() => [...document.querySelectorAll('[data-s]')].map((n) => n.getAttribute('data-s')));
        const feats2 = await page.evaluate(() => [...document.querySelectorAll('[data-f]')].map((n) => n.getAttribute('data-f')));
        const want = CHECK[cat];
        const missF = Object.keys(want).filter((f) => !feats2.includes(f));
        const missS = Object.entries(want).flatMap(([f, ss]) => ss.map((s) => `${f}.${s}`)).filter((k) => !found.includes(k));
        if (missF.length || missS.length) { problems++; console.warn(`[${id}/${cat}] missing features: ${missF.join(', ') || '-'} | settings: ${missS.join(', ') || '-'}`); }
        else console.log(`[${id}/${cat}] ok: ${Object.keys(want).length} features, ${Object.values(want).flat().length} settings`);
      }
      await ctx.close();
    }
  }
  await b.close();
  process.exit(problems ? 2 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
