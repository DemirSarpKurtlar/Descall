'use strict';

/**
 * 3.7.31 regression: a server invite link (descall.com/servers/join/:code)
 * landed on the home page. Real built app against the local mock backend
 * (perf/mockBackend.cjs) with the invite endpoints answered here; the browser
 * aborts every other URL, so nothing reaches production. Synthetic data only.
 *
 * Per viewport (desktop web, iPhone mobile web):
 *   1. logged in  → invite preview (name, member count) → "Daveti kabul et" → the server opens
 *   2. logged out → preview → one "Ücretsiz hesapla katıl" button (→ /register) and
 *      "Zaten hesabım var" → /login, the code kept either way
 *   3. after login (token present, back on "/") → the invite is redeemed by itself and the server opens
 *   4. expired code → "Davet geçersiz veya süresi dolmuş."
 *
 *   VITE_API_BASE_URL=http://127.0.0.1:5361 VITE_SOCKET_URL=http://127.0.0.1:5361 npx vite build --outDir dist-e2e
 *   node e2e/serverInvite.e2e.cjs [--dist=dist-e2e] [--out=/tmp/server-invite-e2e] [--shots-only]
 */

const fs = require('fs');
const path = require('path');
const mock = require('./perf/mockBackend.cjs');

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
const pw = require(process.env.PLAYWRIGHT_CORE || 'playwright-core');
const DIST = path.resolve(args.dist || path.join(__dirname, '../dist-e2e'));
const OUT = path.resolve(args.out || process.env.DESCALL_E2E_SHOTS || '/tmp/descall-server-invite-e2e');
const SHOTS_ONLY = Boolean(args['shots-only']);
const PORT = Number(args.port || 5361);
const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

const SERVER = mock.SERVERS[0];
const PREVIEW = {
  invite: { code: 'GOODCODE', url: 'https://descall.com/servers/join/GOODCODE', inviter: { id: 'u-x', username: 'ece', displayName: 'Ece' } },
  server: { id: SERVER.id, name: 'Oyun Gecesi', iconUrl: null, description: 'Cuma akşamı oyun ve sohbet.', memberCount: 128, onlineCount: 17, isMember: false },
};

async function main() {
  if (!fs.existsSync(path.join(DIST, 'index.html'))) throw new Error(`no build at ${DIST}`);
  fs.mkdirSync(OUT, { recursive: true });
  const srv = await mock.start({ dist: DIST, port: PORT });
  const base = `http://127.0.0.1:${srv.port}`;
  const browser = await pw.chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ['--no-sandbox'] });
  const fails = [];
  const viewports = [
    { name: 'desktop', opts: { viewport: { width: 1280, height: 800 } } },
    { name: 'iphone', opts: { viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: IPHONE_UA } },
  ];
  const joins = [];
  try {
    for (const vp of viewports) {
      const newCtx = async (loggedIn) => {
        const ctx = await browser.newContext({ ...vp.opts, locale: 'tr-TR', timezoneId: 'Europe/Istanbul', colorScheme: 'dark' });
        await ctx.route('**/*', async (r) => {
          const url = r.request().url();
          if (/^(data|blob):/.test(url)) return r.continue();
          if (!url.startsWith(base)) return r.abort();
          const p = new URL(url).pathname;
          const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' };
          const json = (status, body) => r.fulfill({ status, contentType: 'application/json', headers, body: JSON.stringify(body) });
          if (r.request().resourceType() === 'document') return r.continue();
          if (r.request().method() === 'OPTIONS') return r.fulfill({ status: 204, headers });
          let m = p.match(/\/api\/servers\/invites\/([^/]+)(\/join)?$/);
          if (m) {
            const authed = Boolean(r.request().headers().authorization);
            if (m[1] !== 'GOODCODE') return json(410, { error: 'Invite invalid or expired.', code: 'INVITE_EXPIRED' });
            if (m[2]) {
              if (!authed) return json(401, { error: 'Missing or malformed Authorization header.' });
              joins.push(vp.name);
              return json(201, { server: { ...SERVER } });
            }
            // Before the fix the preview required a login (401 for visitors).
            return json(200, PREVIEW);
          }
          return r.continue();
        });
        await ctx.addInitScript(([api, me, li]) => {
          window.__DESCALL_API_URL__ = api; window.__DESCALL_SOCKET_URL__ = api;
          localStorage.setItem('descall_language', 'tr');
          localStorage.setItem('descall:ios-pwa-install-dismissed', '1');
          localStorage.setItem('descall:cookie_consent_v1', JSON.stringify({ choice: 'rejected', at: new Date().toISOString() }));
          if (li && !sessionStorage.getItem('e2e:keep-logged-out')) {
            localStorage.setItem('descall_token', 'e2e.fake.token');
            localStorage.setItem('descall_user', JSON.stringify(me));
          }
        }, [base, mock.ME, loggedIn]);
        const page = await ctx.newPage();
        const errors = [];
        // URL history of this page, printed when a step fails (CI-only timing failures).
        const navs = [];
        page.on('framenavigated', (f) => { if (f === page.mainFrame()) navs.push(new URL(f.url()).pathname); });
        page.navs = navs;
        page.on('pageerror', (e) => errors.push(String(e.message || e)));
        return { ctx, page, errors };
      };
      const shot = async (page, name) => {
        await page.addStyleTag({ content: '.app-notif-banner{display:none!important}' }).catch(() => {});
        // The animated boot splash (3.7.29+) covers the first seconds.
        await page.waitForFunction(() => !document.querySelector('#boot-splash, .boot-splash, [data-boot-splash]'), null, { timeout: 12000 }).catch(() => {});
        await page.waitForTimeout(900);
        await page.screenshot({ path: path.join(OUT, `${vp.name}-${name}.png`) });
      };
      const expectLanding = async (page, label) => {
        const ok = await page.getByTestId('server-invite-name').filter({ hasText: 'Oyun Gecesi' }).first().waitFor({ timeout: 15000 }).then(() => true, () => false);
        if (!ok) fails.push(`${vp.name}: ${label}: no invite preview (url ${page.url()})`);
        return ok;
      };

      // 1. logged in
      {
        const { ctx, page, errors } = await newCtx(true);
        await page.goto(`${base}/servers/join/GOODCODE`, { waitUntil: 'load' });
        await page.waitForTimeout(2500);
        await shot(page, '1-logged-in');
        if (!SHOTS_ONLY && (await expectLanding(page, 'logged in'))) {
          const text = await page.locator('[data-testid="server-invite-landing"]').innerText();
          if (!/128 üye/.test(text)) fails.push(`${vp.name}: member count missing (${text.replace(/\s+/g, ' ').slice(0, 120)})`);
          await page.getByRole('button', { name: 'Daveti kabul et' }).click();
          await page.waitForURL((u) => u.pathname.startsWith(`/servers/${SERVER.id}`), { timeout: 15000 }).catch(() => fails.push(`${vp.name}: did not open the server after join (url ${page.url()})`));
          await shot(page, '1b-joined');
        }
        if (errors.length) fails.push(`${vp.name} page errors: ${errors.join(' | ')}`);
        await ctx.close();
      }

      // 2 + 3. logged out → login keeps the code
      {
        const { ctx, page, errors } = await newCtx(false);
        await page.goto(`${base}/servers/join/GOODCODE`, { waitUntil: 'load' });
        await page.waitForTimeout(2500);
        await shot(page, '2-logged-out');
        if (!SHOTS_ONLY && (await expectLanding(page, 'logged out'))) {
          const joinFree = page.locator('[data-testid="server-invite-join-free"]');
          if ((await joinFree.innerText().catch(() => '')).trim() !== 'Ücretsiz hesapla katıl') fails.push(`${vp.name}: no "Ücretsiz hesapla katıl" button`);
          await joinFree.click();
          await page.waitForURL((u) => u.pathname === '/register', { timeout: 10000 }).catch(() => fails.push(`${vp.name}: "Ücretsiz hesapla katıl" did not open /register (url ${page.url()})`));
          const pendingRegister = await page.evaluate(() => localStorage.getItem('descall:pendingServerInvite'));
          if (!pendingRegister || !pendingRegister.includes('GOODCODE')) fails.push(`${vp.name}: invite code not kept for sign-up`);
          await page.goto(`${base}/servers/join/GOODCODE`, { waitUntil: 'load' });
          await page.waitForTimeout(2000);
          await page.getByRole('button', { name: 'Zaten hesabım var' }).first().click();
          await page.waitForURL((u) => u.pathname === '/login', { timeout: 10000 }).catch(() => fails.push(`${vp.name}: "Zaten hesabım var" did not open /login (url ${page.url()})`));
          const pending = await page.evaluate(() => localStorage.getItem('descall:pendingServerInvite'));
          if (!pending || !pending.includes('GOODCODE')) fails.push(`${vp.name}: invite code not kept for login`);
          await shot(page, '2b-login');
          // Login completes (token stored, e.g. after Google/Apple or a new tab) and the app reloads at "/".
          await page.evaluate((me) => { localStorage.setItem('descall_token', 'e2e.fake.token'); localStorage.setItem('descall_user', JSON.stringify(me)); }, mock.ME);
          await page.goto(`${base}/`, { waitUntil: 'load' });
          await page.waitForTimeout(2000);
          {
            // Back signed in from the landing's own flow: joined without a second click.
            await page.waitForURL((u) => u.pathname.startsWith(`/servers/${SERVER.id}`), { timeout: 15000 }).catch(() => fails.push(`${vp.name}: after login the invite was not redeemed by itself (url ${page.url()}; path history ${page.navs.slice(-8).join(' > ')})`));
            await shot(page, '3-after-login');
            const left = await page.evaluate(() => localStorage.getItem('descall:pendingServerInvite'));
            if (left) fails.push(`${vp.name}: pending invite not cleared after join`);
          }
        }
        if (errors.length) fails.push(`${vp.name} page errors: ${errors.join(' | ')}`);
        await ctx.close();
      }

      // 4. expired
      {
        const { ctx, page, errors } = await newCtx(true);
        await page.goto(`${base}/servers/join/OLDCODE1`, { waitUntil: 'load' });
        await page.waitForTimeout(2500);
        await shot(page, '4-expired');
        if (!SHOTS_ONLY) {
          const ok = await page.getByText('Davet geçersiz veya süresi dolmuş.').first().waitFor({ timeout: 10000 }).then(() => true, () => false);
          if (!ok) fails.push(`${vp.name}: expired invite shows no Turkish error`);
        }
        if (errors.length) fails.push(`${vp.name} page errors: ${errors.join(' | ')}`);
        await ctx.close();
      }
    }
  } finally {
    await browser.close();
    srv.close();
  }
  if (!SHOTS_ONLY && joins.length < 4) fails.push(`expected 4 joins, got ${joins.length}`);
  if (fails.length && !SHOTS_ONLY) {
    console.error(`[e2e-server-invite] FAIL\n - ${fails.join('\n - ')}`);
    process.exit(1);
  }
  console.log(`[e2e-server-invite] OK${SHOTS_ONLY ? ' (shots only)' : ''}; shots in ${OUT}`);
  process.exit(0);
}

main().catch((err) => {
  console.error('[e2e-server-invite] crashed:', err);
  process.exit(1);
});
