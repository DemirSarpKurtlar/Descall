'use strict';

/**
 * Settings profile header "01 · Banner Kart" (3.7.x). Real built app against the
 * local mock backend (perf/mockBackend.cjs); every non-local URL is aborted.
 * Synthetic data only.
 *
 * Desktop web (sidebar) and iPhone mobile web (menu), dark and light:
 *   - the card shows the banner, avatar, status dot, name, "@admin · Descall ekibi"
 *   - an equipped avatar effect ring is never clipped (the old stray blue arc)
 *   - "Profili düzenle" opens the profile editor
 *
 *   VITE_API_BASE_URL=http://127.0.0.1:5361 VITE_SOCKET_URL=http://127.0.0.1:5361 npx vite build --outDir dist-e2e
 *   node e2e/settingsProfileCard.e2e.cjs [--dist=dist-e2e] [--out=DIR] [--avatar=png] [--banner=png] [--shots-only]
 */

const fs = require('fs');
const path = require('path');
const mock = require('./perf/mockBackend.cjs');

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
const pw = require(process.env.PLAYWRIGHT_CORE || 'playwright-core');
const DIST = path.resolve(args.dist || path.join(__dirname, '../dist-e2e'));
const OUT = path.resolve(args.out || process.env.DESCALL_E2E_SHOTS || '/tmp/descall-settings-card-e2e');
const SHOTS_ONLY = Boolean(args['shots-only']);
const PORT = Number(args.port || 5361);
const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

const AVATAR_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#111"/><circle cx="128" cy="140" r="70" fill="#fff"/><circle cx="104" cy="140" r="12" fill="#e11"/><circle cx="152" cy="140" r="12" fill="#e11"/></svg>';
const BANNER_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="960" height="320"><defs><linearGradient id="g" x2="1" y2="1"><stop offset="0" stop-color="#8FB0FF"/><stop offset=".5" stop-color="#4F7CFF"/><stop offset="1" stop-color="#A77BFF"/></linearGradient></defs><rect width="960" height="320" fill="url(#g)"/></svg>';
const asset = (file, svg) => (file ? { body: fs.readFileSync(file), contentType: 'image/png' } : { body: svg, contentType: 'image/svg+xml' });

async function main() {
  if (!fs.existsSync(path.join(DIST, 'index.html'))) throw new Error(`no build at ${DIST}`);
  fs.mkdirSync(OUT, { recursive: true });
  const srv = await mock.start({ dist: DIST, port: PORT });
  const base = `http://127.0.0.1:${srv.port}`;
  Object.assign(mock.ME, {
    username: 'admin', displayName: 'Demirr', display_name: 'Demirr', isAdmin: true, is_admin: true,
    avatarUrl: `${base}/e2e-assets/avatar`, bannerUrl: `${base}/e2e-assets/banner`,
    equippedAvatarEffect: { effect_key: 'holoring' }, equippedCountry: 'TR', status: 'online',
  });
  const AV = asset(args.avatar, AVATAR_SVG);
  const BN = asset(args.banner, BANNER_SVG);
  const browser = await pw.chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ['--no-sandbox'] });
  const fails = [];
  const viewports = [
    { name: 'desktop', path: '/settings/account', opts: { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 } },
    { name: 'iphone', path: '/settings', opts: { viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: IPHONE_UA } },
  ];
  try {
    for (const vp of viewports) {
      for (const theme of ['dark', 'light']) {
        const ctx = await browser.newContext({ ...vp.opts, locale: 'tr-TR', timezoneId: 'Europe/Istanbul', colorScheme: theme });
        await ctx.route('**/*', async (r) => {
          const url = r.request().url();
          if (/^(data|blob):/.test(url)) return r.continue();
          if (!url.startsWith(base)) return r.abort();
          const p = new URL(url).pathname;
          if (p.startsWith('/e2e-assets/')) { const a = p.endsWith('avatar') ? AV : BN; return r.fulfill({ status: 200, contentType: a.contentType, body: a.body }); }
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
        await page.goto(`${base}${vp.path}`, { waitUntil: 'load' });
        await page.waitForFunction(() => !document.querySelector('#boot-splash, .boot-splash, [data-boot-splash]'), null, { timeout: 15000 }).catch(() => {});
        await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
        await page.addStyleTag({ content: '.app-notif-banner{display:none!important} *{animation-play-state:paused!important}' }).catch(() => {});
        await page.waitForTimeout(1800);
        await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
        await page.waitForTimeout(300);
        const tag = `${vp.name}-${theme}`;
        await page.screenshot({ path: path.join(OUT, `${tag}.png`) });
        if (!SHOTS_ONLY) {
          const card = page.locator('.spc').first();
          if (!(await card.isVisible().catch(() => false))) { fails.push(`${tag}: no profile card`); }
          else {
            const text = (await card.innerText()).replace(/\s+/g, ' ');
            for (const want of ['Demirr', '@admin · Descall ekibi', 'Profili düzenle']) if (!text.includes(want)) fails.push(`${tag}: missing "${want}" in "${text}"`);
            if (!(await card.locator('.spc-banner').evaluate((el) => getComputedStyle(el).backgroundImage).catch(() => '')).includes('e2e-assets/banner')) fails.push(`${tag}: banner not the user's banner`);
            if (!(await card.locator('.status-badge.status-online').count())) fails.push(`${tag}: no online dot`);
            // Stray-arc regression: the effect ring must sit fully inside every clipping ancestor.
            const clipped = await page.evaluate(() => {
              const fx = document.querySelector('.spc .cosmetic-avatar-effect');
              if (!fx) return 'no effect element';
              const r = fx.getBoundingClientRect();
              for (let el = fx.parentElement; el && el !== document.body; el = el.parentElement) {
                const cs = getComputedStyle(el);
                if (/(hidden|auto|scroll|clip)/.test(cs.overflow + cs.overflowX + cs.overflowY)) {
                  const c = el.getBoundingClientRect();
                  if (r.top < c.top - 0.5 || r.left < c.left - 0.5 || r.right > c.right + 0.5 || r.bottom > c.bottom + 0.5) return `clipped by ${el.className}`;
                }
              }
              return '';
            });
            if (clipped) fails.push(`${tag}: avatar effect ${clipped}`);
            await card.screenshot({ path: path.join(OUT, `${tag}-card.png`) });
            await card.getByRole('button', { name: 'Profili düzenle' }).click();
            await page.waitForURL((u) => u.pathname === '/settings/profile', { timeout: 8000 }).catch(() => fails.push(`${tag}: edit did not open /settings/profile (url ${page.url()})`));
          }
        }
        if (errors.length) fails.push(`${tag} page errors: ${errors.join(' | ')}`);
        await ctx.close();
      }
    }
  } finally {
    await browser.close();
    await srv.close?.();
  }
  if (fails.length) { console.error('FAIL\n' + fails.map((f) => ' - ' + f).join('\n')); process.exit(1); }
  console.log(`settings profile card e2e ok (shots in ${OUT})`);
}

main().catch((e) => { console.error(e); process.exit(1); });
