'use strict';

/**
 * Public server page "Vitrin" + "Google'da göster" desk (UI-BRIEF draft A), real browser,
 * no network: every request is answered here (Playwright routes), synthetic data only.
 *
 *   Public page (the HTML the Pages worker serves, public/server-page.js):
 *     desktop + iPhone, dark + light: hero, counts, channels (never the hidden one), events,
 *     rules, QR on desktop only, sticky join on the phone, canonical / robots / JSON-LD,
 *     the view beacon, and the smart join (signed out: pending invite kept, /register;
 *     iPhone without the app: falls back to the web flow).
 *   Desk (src/components/servers/publicPage/PublicPageDesk.jsx, built with Vite):
 *     window 1440x940 dark + light, embedded iPhone: eye toggles change the live page
 *     preview, the title meter and Google preview follow typing, Save sends only the
 *     changes, turning off needs a reason, then the 10-minute undo brings it back.
 *
 *   node e2e/publicPage/capture.cjs [--out=dir] [--dist=/tmp/ui-public/pp-dist] [--no-build]
 * Screenshots (deviceScaleFactor 2, JPEG) go to --out.
 */

const fs = require('fs');
const path = require('path');
const assert = require('node:assert/strict');

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
const FRONT = path.resolve(__dirname, '../..');
const OUT = path.resolve(args.out || process.env.DESCALL_E2E_SHOTS || '/tmp/descall-public-page-e2e');
const DIST = path.resolve(args.dist || '/tmp/descall-public-page-dist');
const pw = require(process.env.PLAYWRIGHT_CORE || 'playwright-core');
const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const BANNER = fs.readFileSync(path.join(__dirname, 'fixtures/banner.svg'));
const ICON = fs.readFileSync(path.join(__dirname, 'fixtures/icon.svg'));
const IMG = 'https://abc.supabase.co/storage/v1/object/public/';
const soon = (days, h) => { const d = new Date(Date.now() + days * 86400000); d.setUTCHours(h, 0, 0, 0); return d.toISOString(); };

const PAGE = {
  slug: 'anadolucraft',
  url: 'https://descall.com/s/anadolucraft',
  name: 'Anadolu Craft',
  iconUrl: `${IMG}icon.png`,
  bannerUrl: `${IMG}banner.png`,
  description: "Türkiye'nin en sakin survival sunucusu. Sezon 7 başlıyor: köy ticareti, oyuncu ekonomisi, haftalık yapı yarışmaları ve gece etkinlikleri. Küfürsüz, kurallı ve her yaştan oyuncuya açık.",
  category: 'gaming-minecraft',
  language: 'tr',
  tags: ['survival', 'sezon-7', 'yapı-yarışması', 'ekonomi', 'türkçe'],
  counts: { members: 4812, online: 637, voice: 41 },
  channels: {
    text: ['duyurular', 'kurallar', 'genel-sohbet', 'yapı-paylaşımı', 'ticaret-pazarı', 'etkinlikler', 'yardım'].map((n, i) => ({ id: `t${i}`, name: n })),
    voice: [['Lobi', 12], ['Maden Ekibi', 6], ['Gece Nöbeti', 4], ['Müzik Odası', 9]].map(([n, c], i) => ({ id: `v${i}`, name: n, count: c })),
    total: 11,
  },
  events: [
    { id: 'e1', title: 'Sezon 7 açılışı', startsAt: soon(5, 18), endsAt: null, place: null },
    { id: 'e2', title: 'Yapı yarışması: Kış Köyü', startsAt: soon(12, 17), endsAt: null, place: null },
  ],
  rules: ['Küfür, hakaret ve spam yok.', 'Başkasının yapısına izinsiz dokunmak (grief) yasak.', 'Hile, x-ray ve otomatik tıklayıcı kalıcı yasak sebebidir.'],
  pin: 'Sunucu adresi ve kayıt adımları #duyurular kanalında. Yeni gelenler #yardım kanalına yazabilir.',
  seo: { title: 'Anadolu Craft · Türkçe Minecraft survival sunucusu', description: 'Sakin survival, köy ticareti ve haftalık yapı yarışmaları. Sezon 7 başlıyor; Türkçe topluluğa ücretsiz katıl.' },
  version: 'AbCd123456',
  qrSvg: null,
};

function series(days) {
  const base = [60, 72, 68, 80, 95, 88, 92, 110, 104, 98, 120, 140, 132, 128, 150, 210, 260, 240, 190, 170, 160, 155, 168, 172, 180, 175, 190, 205, 198, 214];
  const out = [];
  for (let i = 0; i < days; i += 1) {
    const v = base[(i * base.length) / days | 0] || 100;
    const d = new Date(Date.now() - (days - 1 - i) * 86400000).toISOString().slice(0, 10);
    out.push({ day: d, views: v, google: Math.round(v * 0.33), joins: Math.round(v * 0.07), joinClicks: Math.round(v * 0.1) });
  }
  return out;
}

function deskState(state) {
  const s = series(state.days);
  return {
    available: true,
    settings: { enabled: state.enabled, title: state.title, description: state.description, hidden: state.hidden, hiddenChannels: state.hiddenChannels, pin: state.pin, events: PAGE.events, enabledAt: null, updatedAt: null, disabledAt: null, disabledReason: null },
    state: { shown: state.enabled, reason: state.enabled ? null : 'off', memberCount: 4812, onlineCount: 637, minMembers: 3, slug: 'anadolucraft', url: PAGE.url, lastCrawlAt: new Date(Date.now() - 2 * 86400000).toISOString(), indexed: state.enabled ? 'indexed' : 'off', undo: state.undo },
    preview: { ...PAGE, channels: { ...PAGE.channels, text: [...PAGE.channels.text, { id: 'staff', name: 'yetkili-odası' }], total: 12 } },
    channels: { text: [...PAGE.channels.text, { id: 'staff', name: 'yetkili-odası' }].map((c) => ({ ...c, hidden: state.hiddenChannels.includes(c.id) })), voice: PAGE.channels.voice.map((c) => ({ ...c, hidden: false })), lockedCount: 3 },
    stats: { days: state.days, series: s, totals: { views: 3214, googleVisits: 1061, joins: 214, joinClicks: 320, joinsLast7: 61, conversion: 6.7 }, deltas: { views: 38, joins: 22, google: 30 }, sources: [{ source: 'google', views: 1480, joins: 98 }, { source: 'whatsapp', views: 700, joins: 47 }, { source: 'x', views: 390, joins: 26 }, { source: 'direct', views: 644, joins: 43 }], available: true },
    search: { clicks: 1087, impressions: 25880, position: 4.2, terms: [{ query: 'anadolu craft', clicks: 412 }, { query: 'türkçe minecraft sunucusu', clicks: 236 }, { query: 'minecraft survival sunucu', clicks: 188 }, { query: 'sezon 7 minecraft', clicks: 97 }, { query: 'kış köyü yapı yarışması', clicks: 41 }] },
    searchConsole: true,
    audit: state.audit,
    limits: { titleMax: 70, titleShown: 60, descriptionMax: 170, descriptionShown: 155, pinMax: 280, eventsMax: 5 },
    sections: ['banner', 'desc', 'tags', 'count', 'chan', 'ev', 'rules', 'pin'],
    reasons: ['season_break', 'too_many_joins', 'raid', 'other'],
    undoMs: 600000,
  };
}

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

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  await build();
  const sp = await import(path.join(FRONT, 'public/server-page.js'));
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
  const shot = async (page, name, opts = {}) => page.screenshot({ path: path.join(OUT, `${name}.jpg`), type: 'jpeg', quality: 88, ...opts });

  const routeCommon = async (ctx, beacons) => {
    await ctx.route('**/*', async (r) => {
      const url = new URL(r.request().url());
      if (/^(data|blob):/.test(url.protocol)) return r.continue();
      if (url.origin === 'https://abc.supabase.co') return r.fulfill({ status: 200, contentType: 'image/svg+xml', body: url.pathname.endsWith('banner.png') ? BANNER : ICON });
      if (url.origin === 'https://des-call.onrender.com' && url.pathname.endsWith('/hit')) {
        beacons.push(JSON.parse(r.request().postData() || '{}'));
        return r.fulfill({ status: 204 });
      }
      if (url.origin === 'https://descall.com') {
        if (url.pathname === '/s/anadolucraft') {
          const qr = await (async () => {
            const QR = require(path.join(FRONT, 'backend/node_modules/qrcode'));
            return (await QR.toString(`${PAGE.url}?src=qr`, { type: 'svg', margin: 1 })).replace(/<\?xml[^>]*>/, '');
          })();
          return r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: sp.renderServerPage({ ...PAGE, qrSvg: qr }, { lang: 'tr' }) });
        }
        if (url.pathname === '/server-page-client.js') return r.fulfill({ status: 200, contentType: 'text/javascript', body: fs.readFileSync(path.join(FRONT, 'public/server-page-client.js')) });
        if (url.pathname.startsWith('/brand/')) return r.fulfill({ status: 200, contentType: 'image/svg+xml', body: fs.readFileSync(path.join(FRONT, 'public', url.pathname)) });
        return r.fulfill({ status: 200, contentType: 'text/html', body: `<!doctype html><title>${url.pathname}</title><p id="landed">${url.pathname}${url.search}</p>` });
      }
      return r.abort();
    });
  };

  // ---------------- Public page ----------------
  for (const vp of [
    { name: 'page-desktop-dark', opts: { viewport: { width: 1280, height: 900 }, colorScheme: 'dark' } },
    { name: 'page-desktop-light', opts: { viewport: { width: 1280, height: 900 }, colorScheme: 'light' } },
    { name: 'page-iphone-dark', opts: { viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true, userAgent: IPHONE_UA, colorScheme: 'dark' } },
  ]) {
    const beacons = [];
    const ctx = await browser.newContext({ ...vp.opts, deviceScaleFactor: 2, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
    await routeCommon(ctx, beacons);
    const page = await ctx.newPage();
    await page.goto('https://descall.com/s/anadolucraft', { waitUntil: 'load' });
    await page.waitForTimeout(300);
    const phone = vp.name.includes('iphone');
    await check(`${vp.name}: content`, async () => {
      assert.equal(await page.locator('h1').innerText(), 'Anadolu Craft');
      const body = await page.locator('body').innerText();
      for (const s of ['637', '4.812', 'Lobi', 'Sezon 7 açılışı', 'Kurallar özeti']) assert.ok(body.includes(s), s);
      assert.ok(!body.includes('yetkili-odası'), 'hidden channel never on the page');
      assert.equal(await page.locator('link[rel=canonical]').getAttribute('href'), PAGE.url);
      assert.match(await page.locator('meta[name=robots]').getAttribute('content'), /^index/);
      const ld = JSON.parse(await page.locator('script[type="application/ld+json"]').innerText());
      assert.deepEqual(ld['@graph'].map((n) => n['@type']), ['Organization', 'BreadcrumbList', 'Event', 'Event']);
      assert.equal(await page.locator('.qrbox').isVisible(), !phone, 'QR only on desktop');
      assert.equal(await page.locator('.stick').isVisible(), phone, 'sticky join only on the phone');
      assert.ok(beacons.some((b) => b.type === 'view'), 'view beacon sent');
    });
    await shot(page, `ui-public-${vp.name}`, { fullPage: !phone });
    if (vp.name === 'page-desktop-dark') {
      await check('desktop join (signed out): invite kept, sign-up', async () => {
        await page.locator('.cta [data-join]').click();
        await page.waitForURL('**/register', { timeout: 4000 });
        const pending = await page.evaluate(() => JSON.parse(localStorage.getItem('descall:pendingServerVanity') || '{}'));
        assert.equal(pending.value, 'anadolucraft');
        const visit = await page.evaluate(() => JSON.parse(localStorage.getItem('descall:publicPageVisit') || '{}'));
        assert.equal(visit.slug, 'anadolucraft');
        assert.ok(beacons.some((b) => b.type === 'join_click'), 'join click counted');
      });
      await check('desktop join (signed in): web vanity landing', async () => {
        await page.goto('https://descall.com/s/anadolucraft');
        await page.evaluate(() => localStorage.setItem('descall_token', 'x'));
        await page.locator('.cta [data-join]').click();
        await page.waitForURL('**/app?sv=anadolucraft', { timeout: 4000 });
      });
    }
    if (phone) {
      await check('iPhone join without the app: web flow after the app attempt', async () => {
        await page.locator('.stick [data-join]').click();
        await page.waitForURL('**/register', { timeout: 6000 });
      });
    }
    await ctx.close();
  }

  // ---------------- Desk ----------------
  const state = { enabled: true, title: PAGE.seo.title, description: PAGE.seo.description, hidden: ['pin'], hiddenChannels: ['staff'], pin: PAGE.pin, days: 30, undo: null,
    audit: [
      { id: 'a1', action: 'PUBLIC_PAGE_UPDATE', changes: { title: { from: 'Anadolu Craft', to: 'Anadolu Craft · Türkçe Minecraft...' } }, createdAt: new Date(Date.now() - 86400000).toISOString(), actor: { name: 'Ece' } },
      { id: 'a2', action: 'PUBLIC_PAGE_UPDATE', changes: { hidden_channels: {} }, createdAt: new Date(Date.now() - 3 * 86400000).toISOString(), actor: { name: 'Demir' } },
      { id: 'a3', action: 'PUBLIC_PAGE_ENABLE', changes: null, createdAt: new Date(Date.now() - 12 * 86400000).toISOString(), actor: { name: 'Demir' } },
    ] };
  const puts = [];
  const deskRoutes = async (ctx) => {
    await ctx.route('**/*', async (r) => {
      const req = r.request();
      const url = new URL(req.url());
      if (/^(data|blob):/.test(url.protocol)) return r.continue();
      if (url.origin === 'https://harness.local') {
        const file = path.join(DIST, url.pathname === '/' ? 'index.html' : url.pathname);
        if (!fs.existsSync(file)) return r.fulfill({ status: 404, body: '' });
        const type = file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.html') ? 'text/html' : 'application/octet-stream';
        return r.fulfill({ status: 200, contentType: type, body: fs.readFileSync(file) });
      }
      if (url.origin === 'https://abc.supabase.co') return r.fulfill({ status: 200, contentType: 'image/svg+xml', body: url.pathname.endsWith('banner.png') ? BANNER : ICON });
      if (url.origin === 'https://harness.test' && url.pathname.startsWith('/api/public-pages/manage/srv-1')) {
        const days = Number(url.searchParams.get('days')) || 30;
        state.days = days;
        if (req.method() === 'PUT') {
          const body = JSON.parse(req.postData() || '{}');
          puts.push(body);
          Object.assign(state, body.enabled === true ? { enabled: true, undo: null } : {}, Object.fromEntries(Object.entries(body).filter(([k]) => ['title', 'description', 'hidden', 'hiddenChannels', 'pin'].includes(k))));
        } else if (url.pathname.endsWith('/disable')) {
          const body = JSON.parse(req.postData() || '{}');
          state.enabled = false;
          state.undo = { until: new Date(Date.now() + 581000).toISOString(), msLeft: 581000 };
          state.audit = [{ id: `a${Date.now()}`, action: 'PUBLIC_PAGE_DISABLE', changes: { reason: body.reason }, reason: body.reason, createdAt: new Date().toISOString(), actor: { name: 'Demir' } }, ...state.audit];
        } else if (url.pathname.endsWith('/undo')) {
          state.enabled = true;
          state.undo = null;
        }
        return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(deskState(state)) });
      }
      return r.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    });
  };

  for (const theme of ['dark', 'light']) {
    const ctx = await browser.newContext({ viewport: { width: 1480, height: 960 }, deviceScaleFactor: 2, locale: 'tr-TR', timezoneId: 'Europe/Istanbul', colorScheme: theme });
    await deskRoutes(ctx);
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`https://harness.local/?theme=${theme}`);
    await page.waitForSelector('[data-testid=ppd-results]', { timeout: 15000 });
    await page.waitForTimeout(700);
    await check(`desk ${theme}: three columns, live chip, results`, async () => {
      assert.equal(errors.length, 0, errors.join('; '));
      assert.equal(await page.getByTestId('ppd-chip').innerText(), 'Yayında');
      const body = await page.locator('[data-testid=ppd]').innerText();
      for (const s of ['Sayfada görünenler', "Google'da böyle görünür", 'Sayfa önizlemesi', 'Sonuçlar', 'En çok aranan', 'Katılım nereden', '3.214', '1.087', '214', 'Denetim kaydı']) assert.ok(body.includes(s), s);
    });
    await shot(page, `ui-public-desk-${theme}`);
    if (theme === 'dark') {
      await check('desk: eye toggles change the live page preview', async () => {
        const frame = page.frameLocator('[data-testid=ppd-preview-desktop]');
        assert.equal(await frame.locator('[data-s=pin]').count(), 0, 'pin hidden at start');
        await page.getByTestId('ppd-eye-pin').click();
        await page.waitForTimeout(250);
        assert.equal(await page.frameLocator('[data-testid=ppd-preview-desktop]').locator('[data-s=pin]').count(), 1, 'pin shown after the eye');
        await page.getByTestId('ppd-eye-count').click();
        await page.waitForTimeout(250);
        assert.equal(await page.frameLocator('[data-testid=ppd-preview-desktop]').locator('[data-s=count]').count(), 0, 'counts hidden');
        assert.equal(await page.frameLocator('[data-testid=ppd-preview-desktop]').getByText('yetkili-odası').count(), 0, 'owner-hidden channel not in preview');
      });
      await check('desk: title meter and Google preview follow typing', async () => {
        await page.getByTestId('ppd-title').fill('Anadolu Craft · Türkçe Minecraft survival sunucusu, sakin ve kurallı topluluk');
        assert.equal(await page.getByTestId('ppd-title-count').getAttribute('class'), 'warn');
        assert.match(await page.getByTestId('ppd-serp-title').innerText(), /…$/);
      });
      await check('desk: Save sends only the changes', async () => {
        await page.getByTestId('ppd-save').click();
        await page.waitForTimeout(400);
        const last = puts.at(-1);
        assert.deepEqual(Object.keys(last).sort(), ['hidden', 'title']);
        assert.deepEqual(last.hidden, ['count']);
      });
      await check('desk: turning off asks a reason, then undo', async () => {
        await page.getByTestId('ppd-disable').click();
        await page.getByTestId('ppd-disable-dialog').waitFor();
        await shot(page, 'ui-public-desk-disable-dialog');
        await page.getByRole('radio', { name: 'İstenmeyen ziyaretçi / baskın' }).click();
        await page.getByTestId('ppd-disable-confirm').click();
        await page.getByTestId('ppd-undo-toast').waitFor();
        assert.match(await page.getByTestId('ppd-chip').innerText(), /Kapalı/);
        assert.match(await page.getByTestId('ppd-undo').innerText(), /Geri al · 9:\d\d/);
        assert.ok((await page.locator('.ppd-audit').innerText()).includes('Sebep: İstenmeyen ziyaretçi / baskın'));
        await shot(page, 'ui-public-desk-undo');
        await page.getByTestId('ppd-undo').click();
        await page.waitForTimeout(400);
        assert.equal(await page.getByTestId('ppd-chip').innerText(), 'Yayında');
      });
      await check('desk: phone preview', async () => {
        await page.getByRole('radio', { name: 'Telefon' }).click();
        await page.getByTestId('ppd-preview-phone').waitFor();
      });
    }
    await ctx.close();
  }

  // Embedded (iPhone hub page).
  {
    const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'tr-TR', timezoneId: 'Europe/Istanbul', colorScheme: 'dark' });
    await deskRoutes(ctx);
    const page = await ctx.newPage();
    await page.goto('https://harness.local/?mode=embedded&w=393');
    await page.waitForSelector('[data-testid=ppd-results]', { timeout: 15000 });
    await page.waitForTimeout(600);
    await check('desk embedded iPhone: one column', async () => {
      const cols = await page.locator('.ppd-cols').getAttribute('class');
      assert.match(cols, /narrow/);
    });
    await shot(page, 'ui-public-desk-iphone', { fullPage: true });
    await ctx.close();
  }

  await browser.close();
  if (fails.length) {
    console.log(`\n${fails.length} failed`);
    process.exit(1);
  }
  console.log(`\npublic page e2e ok, shots in ${OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
