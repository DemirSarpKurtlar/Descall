'use strict';

/**
 * Bug Avcısı (27 Nov 2026) in a real browser, no network: every /api request is answered here
 * (Playwright routes) with synthetic data; the harness (e2e/bugHunter/harness) mounts the real
 * components.
 *   Admin > Geri Bildirim (1440x900): pick a bug report, "Gerçek bug olarak doğrula" side panel
 *   (severity with bonus, visual / UI, live desktop + phone preview), confirm (POST body checked),
 *   the confirmed banner + Bug Avcıları card + filter, reason-required undo, past candidates.
 *   Profile card: the existing Bug Hunter art with level II pips and the tooltip.
 *   Sender: the feedback window with the "gerçek bir bugmış" card and the live toast
 *   (desktop dark + light, phone).
 *
 *   node e2e/bugHunter/capture.cjs [--out=dir] [--dist=/tmp/growth-bughunter/e2e-dist] [--no-build]
 * Screenshots (deviceScaleFactor 2, JPEG) go to --out.
 */

const fs = require('fs');
const path = require('path');
const assert = require('node:assert/strict');

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
const FRONT = path.resolve(__dirname, '../..');
const OUT = path.resolve(args.out || process.env.DESCALL_E2E_SHOTS || '/tmp/descall-bughunter-e2e');
const DIST = path.resolve(args.dist || '/tmp/descall-bughunter-dist');
let pw;
try {
  pw = require(process.env.PLAYWRIGHT_CORE || 'playwright-core');
} catch {
  pw = require('playwright');
}

const U = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const F = (n) => U(500 + n);
const now = Date.parse('2026-11-27T15:00:00.000Z');
const ago = (min) => new Date(now - min * 60000).toISOString();
const person = (n, username, display) => ({ id: U(n), username, displayName: display, avatarUrl: null, createdAt: '2026-03-03T10:00:00.000Z', feedbackCount: 3 });
const fbRow = (n, user, extra) => ({
  id: F(n), user, category: 'bug', priority: 'medium', status: 'new', viewed: true, subject: null, message: '', attachments: [],
  created_at: ago(60 * n), updated_at: ago(30), replies: [], kind: 'bug', rating: null, details: { area: 'voice', frequency: 'always', likes: [] },
  meta: { platform: 'iOS 18.6', version: '3.8.0', device: 'iPhone' }, ...extra,
});
const AYSE = person(10, 'ayse.k', 'Ayşe');
const MERT = person(11, 'mert', 'Mert');
const DENIZ = person(12, 'deniz', 'Deniz');
const BARAN = person(13, 'baran', 'Baran');

function adminState() {
  const feedbacks = [
    fbRow(1, AYSE, { subject: 'Ekran paylaşımında ses kesiliyor', message: 'Ekran paylaşımı açıkken arkadaşımın sesi 10 saniyede bir kesiliyor. iPhone ve Windows uygulamasında aynı.', viewed: false }),
    fbRow(2, MERT, { subject: 'Paylaşımda ses gidiyor', message: 'Yayın açınca ses gidiyor, kapatınca geri geliyor.', created_at: ago(30) }),
    fbRow(3, DENIZ, { subject: 'Mağazada kartlar üst üste biniyor', message: 'Dar pencerede ürün kartları birbirinin üstüne çıkıyor.', details: { area: 'shop', frequency: 'sometimes', likes: [] } }),
    fbRow(4, DENIZ, { subject: 'Giriş kodu iki kez gönderiliyor', message: 'E-posta kodu iki kere geliyor ve ilki geçersiz oluyor.', status: 'resolved', priority: 'high' }),
    fbRow(5, BARAN, { subject: 'Mesaj taslağı kayboluyor', message: 'Kanal değiştirince yazdığım taslak siliniyor.', status: 'in_progress' }),
    fbRow(6, MERT, { category: 'feature', kind: 'suggestion', subject: 'Koyu tema için daha koyu mod', message: 'OLED için tam siyah tema olsa.' }),
  ];
  const confirmations = [
    { feedbackId: F(4), userId: DENIZ.id, severity: 'critical', credit: 'first', duplicateOf: null, note: 'Giriş akışı', visual: false, round: 1, reward: 250, rewardState: 'paid', levelAfter: 2, confirmedAt: ago(3000), live: true, fixedAt: ago(2000) },
    { feedbackId: F(5), userId: BARAN.id, severity: 'high', credit: 'first', duplicateOf: null, note: null, visual: false, round: 1, reward: 100, rewardState: 'paid', levelAfter: 1, confirmedAt: ago(800), live: true, fixedAt: null },
  ];
  return {
    feedbacks,
    ws: {
      installed: true,
      confirmations,
      leaderboard: [
        { userId: DENIZ.id, username: 'deniz', displayName: 'Deniz', avatarUrl: null, first: 6, legacy: 1, bugs: 7, also: 2, critical: 2, visual: 1, bySeverity: { critical: 2, high: 2, medium: 1, low: 1 }, level: 2, since: '2026-06-01T00:00:00Z' },
        { userId: BARAN.id, username: 'baran', displayName: 'Baran', avatarUrl: null, first: 3, legacy: 0, bugs: 3, also: 0, critical: 0, visual: 0, bySeverity: { critical: 0, high: 2, medium: 1, low: 0 }, level: 1, since: '2026-11-02T00:00:00Z' },
        { userId: AYSE.id, username: 'ayse.k', displayName: 'Ayşe', avatarUrl: null, first: 4, legacy: 0, bugs: 4, also: 1, critical: 0, visual: 1, bySeverity: { critical: 0, high: 1, medium: 2, low: 1 }, level: 1, since: '2026-11-03T00:00:00Z' },
      ],
      people: { [AYSE.id]: { level: 1, bugs: 4, also: 1 }, [DENIZ.id]: { level: 2, bugs: 7 }, [BARAN.id]: { level: 1, bugs: 3 } },
      totals: { first: 13, also: 3, critical: 2, paid: 1450, fixed: 6, people: 3 },
      rules: { tiers: [{ level: 1, min: 1 }, { level: 2, min: 5 }, { level: 3, min: 15 }], rewards: { first: { low: 25, medium: 50, high: 100, critical: 250 }, also: { low: 10, medium: 20, high: 40, critical: 100 } }, alsoLevels: false },
    },
    candidates: {
      scanned: 214,
      counts: { items: 3, people: 3, high: 2, holders: 1 },
      items: [
        { feedbackId: F(40), userId: U(20), username: 'selin', subject: 'Bildirim sesi iki kez çalıyor', status: 'resolved', createdAt: '2026-07-12T10:00:00Z', signals: ['fix_link', 'resolved'], confidence: 'high', holdsBadge: true },
        { feedbackId: F(41), userId: U(21), username: 'kaan', subject: 'Android klavye mesajı kapatıyor', status: 'resolved', createdAt: '2026-08-02T10:00:00Z', signals: ['resolved', 'fix_reply'], confidence: 'high', holdsBadge: false },
        { feedbackId: F(42), userId: U(22), username: 'irem', subject: 'Sunucu simgesi bulanık', status: 'closed', createdAt: '2026-09-21T10:00:00Z', signals: ['resolved'], confidence: 'medium', holdsBadge: false },
      ],
    },
  };
}

const userItem = {
  id: F(1), kind: 'bug', status: 'resolved', subject: 'Ekran paylaşımında ses kesiliyor', message: 'Ekran paylaşımı açıkken arkadaşımın sesi 10 saniyede bir kesiliyor. iPhone ve Windows uygulamasında aynı.',
  rating: null, details: { area: 'voice', frequency: 'always', likes: [] }, attachments: [], device: 'iPhone · 3.8.0', created_at: ago(300), updated_at: ago(5), unread: 2, canReply: true,
  last: null,
  thread: [
    { id: 't1', type: 'message', fromTeam: true, text: 'Teşekkürler, kayıtları inceliyoruz.', attachments: [], created_at: ago(240) },
    { id: 't2', type: 'bughunt', event: 'confirmed', severity: 'high', level: 2, badge: 'up', count: 5, reward: 100, badgeId: 'bughunter',
      text: 'The bug you reported was real. Our team is fixing it.', badgeLine: 'x', rewardLine: '+100 DesCoin',
      i18n: { text: { key: 'bot.bughunt.confirmed' }, badgeLine: { key: 'bot.bughunt.badgeUp', vars: { level: 'II', count: 5 } }, rewardLine: { key: 'bot.bughunt.reward', vars: { amount: 100 } } }, created_at: ago(60) },
    { id: 't3', type: 'status', status: 'resolved', created_at: ago(6) },
    { id: 't4', type: 'bughunt', event: 'fixed', severity: 'high', level: 0, badge: 'none', count: 0, reward: 0, badgeId: null, text: 'Fixed', i18n: { text: { key: 'bot.bughunt.fixed' } }, created_at: ago(5) },
  ],
};

async function build() {
  if (args['no-build'] && fs.existsSync(path.join(DIST, 'index.html'))) return;
  const vite = await import(path.join(FRONT, 'node_modules/vite/dist/node/index.js'));
  const react = (await import(path.join(FRONT, 'node_modules/@vitejs/plugin-react/dist/index.js'))).default;
  await vite.build({
    root: path.join(__dirname, 'harness'),
    base: '/',
    configFile: false,
    publicDir: false,
    plugins: [react()],
    logLevel: 'warn',
    define: { 'import.meta.env.VITE_API_BASE_URL': JSON.stringify('https://harness.test'), 'import.meta.env.VITE_SOCKET_URL': JSON.stringify('https://harness.test') },
    build: { outDir: DIST, emptyOutDir: true, sourcemap: false, reportCompressedSize: false, chunkSizeWarningLimit: 99999 },
  });
}

function mime(file) {
  if (file.endsWith('.js')) return 'text/javascript';
  if (file.endsWith('.css')) return 'text/css';
  if (file.endsWith('.html')) return 'text/html';
  if (file.endsWith('.svg')) return 'image/svg+xml';
  if (file.endsWith('.png')) return 'image/png';
  if (file.endsWith('.woff2')) return 'font/woff2';
  return 'application/octet-stream';
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  await build();
  const fails = [];
  const check = async (label, fn) => {
    try {
      await fn();
      console.log(`ok   ${label}`);
    } catch (err) {
      fails.push(label);
      console.log(`FAIL ${label}: ${err.message}`);
    }
  };
  const browser = await pw.chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ['--no-sandbox'] });
  const shot = (page, name, opts = {}) => page.screenshot({ path: path.join(OUT, `${name}.jpg`), type: 'jpeg', quality: 90, ...opts });

  const open = async ({ view = 'admin', theme = 'dark', viewport = { width: 1440, height: 900 }, phone = false } = {}) => {
    const st = adminState();
    const log = { confirm: [], undo: [], errors: [] };
    const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2, locale: 'tr-TR', timezoneId: 'Europe/Istanbul', colorScheme: theme, ...(phone ? { isMobile: true, hasTouch: true } : {}) });
    await ctx.route('**/*', async (r) => {
      const req = r.request();
      const url = new URL(req.url());
      if (/^(data|blob):/.test(url.protocol)) return r.continue();
      if (url.origin === 'https://harness.local') {
        const file = path.join(DIST, url.pathname === '/' ? 'index.html' : url.pathname);
        if (!fs.existsSync(file)) return r.fulfill({ status: 404, body: '' });
        return r.fulfill({ status: 200, contentType: mime(file), body: fs.readFileSync(file) });
      }
      if (url.origin !== 'https://harness.test') return r.abort();
      const p = url.pathname;
      const json = (body, status = 200) => r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
      const body = () => JSON.parse(req.postData() || '{}');
      if (/\/admin\/feedback\/bug-hunter\/candidates$/.test(p)) return json(st.candidates);
      if (/\/admin\/feedback\/bug-hunter$/.test(p)) return json(st.ws);
      let m = p.match(/\/admin\/feedback\/([^/]+)\/bug-confirm$/);
      if (m) {
        const b = body();
        log.confirm.push(b);
        const f = st.feedbacks.find((x) => x.id === m[1]);
        const c = { feedbackId: f.id, userId: f.user.id, severity: b.severity, credit: 'first', duplicateOf: null, note: b.note || null, visual: Boolean(b.visual), round: 1, reward: 100, rewardState: 'paid', levelAfter: 2, confirmedAt: new Date(now).toISOString(), live: true, fixedAt: null };
        st.ws.confirmations.unshift(c);
        st.ws.totals.first += 1;
        st.ws.totals.paid += 100;
        st.ws.leaderboard[2] = { ...st.ws.leaderboard[2], first: 5, bugs: 5, level: 2, bySeverity: { ...st.ws.leaderboard[2].bySeverity, high: 2 } };
        st.ws.people[f.user.id] = { level: 2, bugs: 5, also: 1 };
        f.status = 'in_progress';
        f.replies = [...f.replies, { id: 'bh1', type: 'bughunt', event: 'confirmed', severity: b.severity, level: 2, badge: 'up', count: 5, reward: 100, badgeId: 'bughunter', glitch: Boolean(b.visual),
          text: 'The bug you reported was real. Our team is fixing it.', badgeLine: 'x', rewardLine: '+100 DesCoin', glitchLine: b.visual ? 'x' : null, adminUsername: 'admin', void: false,
          i18n: { text: { key: 'bot.bughunt.confirmed' }, badgeLine: { key: 'bot.bughunt.badgeUp', vars: { level: 'II', count: 5 } }, rewardLine: { key: 'bot.bughunt.reward', vars: { amount: 100 } }, ...(b.visual ? { glitchLine: { key: 'bot.bughunt.badgeGlitch' } } : {}) },
          created_at: new Date(now).toISOString() }];
        return json({ ok: true, already: false, credit: 'first', severity: b.severity, round: 1, level: 2, badge: 'up', glitch: Boolean(b.visual), reward: { amount: 100, state: 'paid' }, confirmation: c, feedback: f }, 201);
      }
      m = p.match(/\/admin\/feedback\/([^/]+)\/bug-undo$/);
      if (m) {
        const b = body();
        log.undo.push(b);
        const c = st.ws.confirmations.find((x) => x.feedbackId === m[1]);
        Object.assign(c, { live: false, undoReason: b.reason, rewardState: 'reversed' });
        const f = st.feedbacks.find((x) => x.id === m[1]);
        f.replies = f.replies.map((x) => (x.type === 'bughunt' ? { ...x, void: true } : x));
        return json({ ok: true, reward: { amount: 100, state: 'reversed' }, confirmation: c, feedback: f });
      }
      if (/\/admin\/feedback$/.test(p)) return json({ feedbacks: st.feedbacks, total: st.feedbacks.length, stats: {} });
      if (/\/admin\/feedback\/[^/]+\/view$/.test(p)) return json({ success: true });
      if (/\/special-badges\/catalog$/.test(p)) return json({ badges: [{ id: 'bughunter', no: 11, name: 'Bug Hunter', tier: 'epik', description: '', holders: 14, maxHolders: null }, { id: 'glitch', no: 32, name: 'Glitch', tier: 'nadir', description: '', holders: 3, maxHolders: null }] });
      if (/\/special-badges\/users\//.test(p)) return json({ userId: AYSE.id, equipped: 'bughunter', badges: [{ id: 'bughunter', serial: 2, grantedAt: '2026-11-03T10:00:00Z', via: 'admin', grantedBy: null, equipped: true, level: 2, bugs: 12, also: 1, severity: { critical: 2, high: 4, medium: 5, low: 1 }, since: '2026-11-03T10:00:00.000Z' }, { id: 'glitch', serial: 1, grantedAt: '2026-11-20T10:00:00Z', via: 'admin', grantedBy: null, equipped: false }] });
      if (/\/me\/feedback\/unread$/.test(p)) return json({ unread: 2 });
      if (/\/me\/feedback\/[^/]+\/read$/.test(p)) return json({ ok: true });
      if (/\/me\/feedback\/[^/]+$/.test(p)) return json({ item: userItem });
      if (/\/me\/feedback$/.test(p)) return json({ items: [{ ...userItem, thread: undefined }], unread: 2 });
      return json({});
    });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => log.errors.push(String(e?.message || e)));
    await page.goto(`https://harness.local/?view=${view}&theme=${theme}${phone ? '&layout=phone' : ''}`);
    return { ctx, page, st, log };
  };

  /* ---- admin ---- */
  {
    const { ctx, page, log } = await open();
    await check('admin: workspace with the Bug Avcıları card and the filter', async () => {
      await page.waitForSelector('.fb3-row', { timeout: 20000 });
      await page.waitForSelector('[data-bh=leader] .bh-rank li');
      assert.match(await page.textContent('[data-bh=leader]'), /Bug Avcıları/);
      assert.match(await page.textContent('[data-bh=filter]'), /Doğrulanmış buglar 2/);
      assert.equal(await page.locator('.fb3-row .bh-rowmark').count(), 2, 'confirmed rows are marked');
    });
    await check('admin: confirm panel (severity, visual, outcome, live preview)', async () => {
      await page.locator('.fb3-row', { hasText: 'ayse.k' }).first().click();
      await page.click('[data-bh=confirm-open]');
      await page.waitForSelector('[data-bh=sheet]');
      assert.equal(await page.isDisabled('[data-bh=confirm-send]'), true, 'needs a severity first');
      await page.click('[data-sev=high]');
      await page.click('.bh-toggle');
      await page.fill('.bh-input', 'iOS 18 ve Windows, ekran paylaşımı açıkken');
      const sheet = await page.textContent('[data-bh=sheet]');
      assert.match(sheet, /Rozet yükselir: Bug Hunter I → II/);
      assert.match(sheet, /Ödül: 100 DesCoin/);
      assert.match(sheet, /Bildirdiğin hata gerçek bir bugmış, ekibimiz düzeltiyor\./);
      assert.match(sheet, /Rozetin Bug Hunter II seviyesine yükseldi\./);
      assert.match(sheet, /Glitch rozetini de kazandın\./);
      await page.waitForTimeout(350);
      await shot(page, 'bughunter-admin-confirm');
    });
    await check('admin: confirm sends severity + visual + note, banner appears', async () => {
      await page.click('[data-bh=confirm-send]');
      await page.waitForSelector('[data-bh=banner]');
      assert.deepEqual(log.confirm[0], { severity: 'high', visual: true, note: 'iOS 18 ve Windows, ekran paylaşımı açıkken' });
      const banner = await page.textContent('[data-bh=banner]');
      assert.match(banner, /Yüksek/); assert.match(banner, /İlk bildiren/); assert.match(banner, /100 DesCoin ödendi/); assert.match(banner, /Bug Hunter II/);
      assert.match(await page.textContent('[data-bh=filter]'), /Doğrulanmış buglar 3/);
      await page.waitForSelector('[data-bh=thread-card]');
      await page.waitForTimeout(500);
      await shot(page, 'bughunter-admin-confirmed');
    });
    await check('admin: undo needs a reason', async () => {
      await page.click('[data-bh=undo-open]');
      await page.waitForSelector('[data-bh=undo]');
      assert.equal(await page.isDisabled('[data-bh=undo-send]'), true, 'no reason yet');
      await page.fill('[data-bh=undo] input', 'Ağ sorunu çıktı, bug değil');
      await shot(page, 'bughunter-admin-undo');
      await page.click('[data-bh=undo-send]');
      await page.waitForSelector('.bh-banner.is-undone');
      assert.deepEqual(log.undo[0], { reason: 'Ağ sorunu çıktı, bug değil' });
    });
    await check('admin: past candidates (read-only, holders marked)', async () => {
      await page.click('[data-bh=candidates-open]');
      await page.waitForSelector('[data-bh=candidates] .bh-cands li');
      const txt = await page.textContent('[data-bh=candidates]');
      assert.match(txt, /Rozeti var/); assert.match(txt, /Yüksek güven/); assert.match(txt, /selin/);
      await page.waitForTimeout(300);
      await shot(page, 'bughunter-admin-candidates');
    });
    await check('admin: no page errors', async () => assert.deepEqual(log.errors, []));
    await ctx.close();
  }

  /* ---- profile card ---- */
  for (const theme of ['dark', 'light']) {
    const { ctx, page, log } = await open({ view: 'profile', theme, viewport: { width: 760, height: 640 } });
    await check(`profile (${theme}): Bug Hunter II chip with level pips and tooltip`, async () => {
      await page.waitForSelector('.sb-chip-bh');
      await page.hover('.sb-chip-bh');
      await page.waitForTimeout(300);
      const tip = await page.textContent('.sb-bh-tip');
      assert.match(tip, /Bug Hunter II/);
      assert.match(tip, /12 gerçek bug buldu · Kasım 2026'dan beri/);
      assert.match(tip, /2 kritik · 4 yüksek · 5 orta · 1 düşük/);
      assert.equal(await page.locator('.sb-chip-bh > svg[data-level="2"] .sb-pips circle').count(), 2, 'two pips on the existing art');
      await shot(page, theme === 'dark' ? 'bughunter-profile' : 'bughunter-profile-light');
      assert.deepEqual(log.errors, []);
    });
    await ctx.close();
  }

  /* ---- sender ---- */
  for (const [theme, vp, name, phone] of [['dark', { width: 1180, height: 860 }, 'bughunter-user', false], ['light', { width: 1180, height: 860 }, 'bughunter-user-light', false], ['dark', { width: 390, height: 844 }, 'bughunter-user-phone', true]]) {
    const { ctx, page, log } = await open({ view: 'user', theme, viewport: vp, phone });
    await check(`sender (${name}): thread card, Düzeltildi follow-up, live toast`, async () => {
      await page.waitForSelector('.bhc.is-confirmed', { timeout: 20000 });
      const card = await page.textContent('.bhc.is-confirmed');
      assert.match(card, /Bildirdiğin hata gerçek bir bugmış, ekibimiz düzeltiyor\./);
      assert.match(card, /Rozetin Bug Hunter II seviyesine yükseldi\./);
      assert.match(card, /\+100 DesCoin/);
      assert.match(await page.textContent('.bhc.is-fixed'), /Düzeltildi: bildirdiğin hata son sürümde giderildi\./);
      await page.waitForSelector('.bp-toast', { timeout: 5000 });
      assert.match(await page.textContent('.bp-toast'), /Gerçek bir bug buldun · Bug Hunter II · \+100 DesCoin/);
      await page.evaluate(() => document.querySelector('.bhc.is-confirmed')?.scrollIntoView({ block: 'center' }));
      await page.waitForTimeout(400);
      await shot(page, name);
      assert.deepEqual(log.errors, []);
    });
    await ctx.close();
  }

  await browser.close();
  if (fails.length) {
    console.log(`\n${fails.length} check(s) failed`);
    process.exit(1);
  }
  console.log(`\nall checks passed; screenshots in ${OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
