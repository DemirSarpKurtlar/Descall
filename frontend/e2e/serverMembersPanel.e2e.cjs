'use strict';

/**
 * Server member list panel stays as the user left it (owner, 28 Nov 2026:
 * "serverlarda bu bar açıkken başka sekmeye geçince, sohbet kanalına geçince ...
 * gene kalsın ve bu açık mı kapalı mı hatırlanılsın"). Real built app against the
 * local mock backend (perf/mockBackend.cjs); every other URL is aborted, so nothing
 * leaves the machine. Synthetic data only.
 *
 * Desktop web 1280x800:
 *   1. open a text channel, press the header Members button: panel docks, the button is pressed
 *   2. switch to another text channel (channel list click): panel still open
 *   3. Chats tab and back (in-app navigation, ChatPanel remounts): still open
 *   4. reload: still open
 *   5. another server (server shell, no channel): still open
 *   6. close with the panel's X, reload: stays closed, button not pressed
 * Phone layout (393 px, same saved choice "open"): the panel is not forced over the chat.
 *
 *   VITE_API_BASE_URL=http://127.0.0.1:5361 VITE_SOCKET_URL=http://127.0.0.1:5361 npx vite build --outDir dist-e2e
 *   node e2e/serverMembersPanel.e2e.cjs [--dist=dist-e2e] [--out=/tmp/server-members-panel-e2e]
 */

const fs = require('fs');
const path = require('path');
const mock = require('./perf/mockBackend.cjs');

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
const pw = require(process.env.PLAYWRIGHT_CORE || 'playwright-core');
const DIST = path.resolve(args.dist || path.join(__dirname, '../dist-e2e'));
const OUT = path.resolve(args.out || process.env.DESCALL_E2E_SHOTS || '/tmp/descall-server-members-panel-e2e');
const PORT = Number(args.port || 5361);
const KEY = 'descall.serverMembersPanel.v1';
const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

const S0 = mock.SERVERS[0];
const S1 = mock.SERVERS[1];
const textChannels = (s) => s.channels.filter((c) => c.type === 'text');

async function main() {
  if (!fs.existsSync(path.join(DIST, 'index.html'))) throw new Error(`no build at ${DIST}`);
  fs.mkdirSync(OUT, { recursive: true });
  const srv = await mock.start({ dist: DIST, port: PORT });
  const base = `http://127.0.0.1:${srv.port}`;
  const browser = await pw.chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ['--no-sandbox'] });
  const fails = [];
  const errors = [];

  const newCtx = async (opts, storageState) => {
    const ctx = await browser.newContext({ ...opts, locale: 'tr-TR', timezoneId: 'Europe/Istanbul', colorScheme: 'dark', storageState });
    await ctx.route('**/*', (r) => {
      const url = r.request().url();
      if (/^(data|blob):/.test(url) || url.startsWith(base)) return r.continue();
      return r.abort();
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
    page.on('pageerror', (e) => errors.push(String(e.message || e)));
    return { ctx, page };
  };

  const membersBtn = (page) => page.locator('.header-right button[aria-label="Üyeler"]').first();
  const panel = (page) => page.locator('aside.members-panel.server-members-panel');
  const settle = (page) => page.waitForTimeout(900);
  // The animated boot splash (3.7.29+) covers the first seconds.
  const noSplash = (page) => page.waitForFunction(() => !document.querySelector('#boot-splash, .boot-splash, [data-boot-splash]'), null, { timeout: 12000 }).catch(() => {});
  const shot = (page, name) => page.screenshot({ path: path.join(OUT, `${name}.png`) }).catch(() => {});

  const expectState = async (page, open, label) => {
    await settle(page);
    const visible = await panel(page).isVisible().catch(() => false);
    const pressed = await membersBtn(page).getAttribute('aria-pressed').catch(() => null);
    const saved = await page.evaluate((k) => localStorage.getItem(k), KEY);
    if (visible !== open) fails.push(`${label}: panel ${visible ? 'open' : 'closed'}, expected ${open ? 'open' : 'closed'} (url ${page.url()})`);
    if (pressed !== String(open)) fails.push(`${label}: members button aria-pressed=${pressed}, expected ${open}`);
    if (saved !== (open ? '1' : '0')) fails.push(`${label}: saved choice ${saved}, expected ${open ? '1' : '0'}`);
  };

  const waitApp = async (page, label) => {
    const ok = await membersBtn(page).waitFor({ timeout: 20000 }).then(() => true, () => false);
    if (!ok) fails.push(`${label}: no members button in the channel header (url ${page.url()})`);
    else await noSplash(page);
    return ok;
  };

  let saved;
  try {
    // Desktop journey
    {
      const { ctx, page } = await newCtx({ viewport: { width: 1280, height: 800 } });
      const [chA, chB] = textChannels(S0);
      await page.goto(`${base}/servers/${S0.id}/${chA.id}`, { waitUntil: 'load' });
      if (await waitApp(page, '1 open channel')) {
        if (await panel(page).isVisible().catch(() => false)) fails.push('1: panel open before the user asked (default must stay closed)');
        await membersBtn(page).click();
        await expectState(page, true, '1 after pressing Members');
        await shot(page, 'desktop-1-open');

        // 2. another text channel from the channel list
        await page.locator('.app-sidebar, aside, nav').getByText(chB.name, { exact: true }).first().click();
        await page.waitForURL((u) => u.pathname.includes(chB.id), { timeout: 10000 }).catch(() => fails.push(`2: channel ${chB.name} did not open (url ${page.url()})`));
        await expectState(page, true, '2 after switching text channel');
        await shot(page, 'desktop-2-other-channel');

        // 3. another app tab and back, in-app (ChatPanel remounts per view)
        await page.evaluate(() => { history.pushState({}, '', '/'); dispatchEvent(new PopStateEvent('popstate')); });
        // The server view fades out first (AnimatePresence exit), then the Chats tab is alone.
        const gone = await panel(page).waitFor({ state: 'hidden', timeout: 5000 }).then(() => true, () => false);
        await shot(page, 'desktop-3-chats-tab');
        if (!gone) fails.push(`3: server member list shown on the Chats tab (url ${page.url()})`);
        await page.goBack();
        await waitApp(page, '3 back from Chats');
        await expectState(page, true, '3 back from the Chats tab');

        // 4. reload
        await page.reload({ waitUntil: 'load' });
        await waitApp(page, '4 reload');
        await expectState(page, true, '4 after reload');
        await shot(page, 'desktop-4-reload');

        // 5. another server, shell with no channel picked
        await page.goto(`${base}/servers/${S1.id}`, { waitUntil: 'load' });
        await waitApp(page, '5 other server');
        await expectState(page, true, '5 another server');
        await shot(page, 'desktop-5-other-server');

        saved = await ctx.storageState();

        // 6. close with X, reload: stays closed
        await page.goto(`${base}/servers/${S0.id}/${chA.id}`, { waitUntil: 'load' });
        await waitApp(page, '6 channel');
        await settle(page);
        await panel(page).locator('button[aria-label="Kapat"]').first().click().catch(() => fails.push('6: no close button in the panel'));
        await expectState(page, false, '6 after X');
        await page.reload({ waitUntil: 'load' });
        await waitApp(page, '6 reload');
        await expectState(page, false, '6 closed stays closed after reload');
        await shot(page, 'desktop-6-closed');
      }
      await ctx.close();
    }

    // Phone layout with the choice saved as open: not forced over the chat.
    if (saved) {
      const { ctx, page } = await newCtx({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: IPHONE_UA }, saved);
      const [chA] = textChannels(S0);
      await page.goto(`${base}/servers/${S0.id}/${chA.id}`, { waitUntil: 'load' });
      await waitApp(page, 'phone channel');
      await settle(page);
      const stored = await page.evaluate((k) => localStorage.getItem(k), KEY);
      if (stored !== '1') fails.push(`phone: saved choice not carried over (${stored})`);
      if (await panel(page).isVisible().catch(() => false)) fails.push('phone: member list forced open in the phone layout');
      if (await page.locator('.chat-panel-shell.is-members-docked').count()) fails.push('phone: shell docked for members');
      // The phone sheet still opens on demand and closes again, without touching the saved choice.
      await membersBtn(page).click().catch(() => fails.push('phone: members button not clickable'));
      await settle(page);
      if (!(await panel(page).isVisible().catch(() => false))) fails.push('phone: members sheet does not open on demand');
      if ((await membersBtn(page).getAttribute('aria-pressed').catch(() => null)) !== 'true') fails.push('phone: members button not pressed while the sheet is open');
      await shot(page, 'phone-sheet-open');
      await page.locator('.members-panel-backdrop').click({ position: { x: 20, y: 300 } }).catch(() => fails.push('phone: no sheet backdrop'));
      await settle(page);
      if (await panel(page).isVisible().catch(() => false)) fails.push('phone: members sheet did not close');
      if ((await page.evaluate((k) => localStorage.getItem(k), KEY)) !== '1') fails.push('phone: the sheet changed the saved desktop choice');
      await shot(page, 'phone-not-forced');
      await ctx.close();
    }
  } finally {
    await browser.close();
    srv.close();
  }
  if (errors.length) fails.push(`page errors: ${errors.slice(0, 5).join(' | ')}`);
  if (fails.length) {
    console.error(`[e2e-server-members-panel] FAIL\n - ${fails.join('\n - ')}`);
    process.exit(1);
  }
  console.log(`[e2e-server-members-panel] OK; shots in ${OUT}`);
  process.exit(0);
}

main().catch((err) => {
  console.error('[e2e-server-members-panel] crashed:', err);
  process.exit(1);
});
