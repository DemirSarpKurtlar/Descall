'use strict';

/**
 * "Başla panosu" (growth phase 2A, draft A) in a real browser, no network: every /api
 * request is answered here (Playwright routes) with synthetic data, the socket is the
 * harness echo (e2e/onboarding/harness/main.jsx).
 *
 *   Desktop 1440x900, dark + light: dashboard (live counts, interest chips, three live
 *   servers, community + Rehber, find friends with the inviter's corner), the 5-day
 *   checklist in the list column, preview side panel (live messages, busy hours, voice room,
 *   ready first sentence), "Katıl ve gönder" (join request, socket message, follow-up card,
 *   reward), undo (message delete, leave, /undo), interests saved, hide + reopen.
 *   Phone 390x844: Başla page, preview sheet, send -> channel with the joined banner,
 *   friends page. Admin card: funnel, interests, server cards, settings save.
 *
 *   node e2e/onboarding/capture.cjs [--out=dir] [--dist=/tmp/growth-onboarding/e2e-dist] [--no-build]
 * Screenshots (deviceScaleFactor 2, JPEG) go to --out.
 */

const fs = require('fs');
const path = require('path');
const assert = require('node:assert/strict');

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
const FRONT = path.resolve(__dirname, '../..');
const OUT = path.resolve(args.out || process.env.DESCALL_E2E_SHOTS || '/tmp/descall-onboarding-e2e');
const DIST = path.resolve(args.dist || '/tmp/descall-onboarding-dist');
let pw;
try {
  pw = require(process.env.PLAYWRIGHT_CORE || 'playwright-core');
} catch {
  pw = require('playwright');
}

const has = (text, s) => String(text).toLocaleUpperCase('tr').includes(String(s).toLocaleUpperCase('tr'));
const U = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const DK = U(101);
const MC = U(102);
const LS = U(103);
const COMM = U(100);
const CH = { genel: U(201), soru: U(202), tanisma: U(203) };
const now = Date.now();
const ago = (min) => new Date(now - min * 60000).toISOString();
const spark = (s) => s.split(',').map(Number);

function stateFixture(st) {
  const interests = st.interests;
  const done = { interests: interests.length > 0, join: st.joined, first_message: st.hello, voice: false, friend: false };
  const claimed = { ...(done.interests ? { interests: 10 } : {}), ...(st.joined ? { join: 20 } : {}), ...(st.hello ? { first_message: 50 } : {}) };
  const items = [['interests', 10], ['join', 20], ['first_message', 50], ['voice', 30], ['friend', 50]].map(([id, reward]) => ({ id, reward, done: Boolean(done[id]), paid: claimed[id] != null, paidAmount: claimed[id] || 0 }));
  const doneCount = items.filter((i) => i.done).length;
  return {
    active: !st.hidden,
    inWindow: true,
    hidden: st.hidden,
    enabled: true,
    schema: true,
    day: 1,
    windowDays: 5,
    me: { id: U(1), username: 'ece.yildiz', displayName: 'Ece' },
    balance: 10,
    interests,
    interestCatalog: [
      ['study', 7], ['gaming-minecraft', 9], ['music', 5], ['gaming-cs2', 11], ['gaming-lol', 6], ['anime', 4], ['tech', 3], ['art', 2], ['gaming-fps', 0], ['sports', 0], ['chat-friends', 3], ['gaming-other', 0],
    ].map(([id, online]) => ({ id, servers: online ? 1 : 0, online })),
    online: { now: 38, spark: spark('12,10,9,8,7,9,12,16,19,22,24,27,30,29,31,33,35,36,38') },
    interestLive: { servers: 6, online: 21, lastHour: 142 },
    suggestions: [
      { id: DK, name: 'Ders Kampı YKS 2027', iconUrl: null, category: 'study', members: 118, online: 7, lastHour: 46, today: 46, spark: spark('2,1,1,0,0,1,2,4,6,5,7,9,8,11,10,12,14,13,15'), replyMinutes: 2, inVoice: 2, voice: { id: U(301), name: 'Pomodoro odası', count: 2, people: [{ id: U(5), name: 'Zeynep' }, { id: U(6), name: 'Kaan', speaking: true }] }, rank: 1, matched: true },
      { id: MC, name: 'Minecraft Türkiye SMP', iconUrl: null, category: 'gaming-minecraft', members: 164, online: 9, lastHour: 38, today: 80, spark: spark('3,2,2,1,1,2,3,3,5,6,6,7,9,8,10,11,12,13,12'), replyMinutes: 4, inVoice: 3, voice: { id: U(302), name: 'Survival', count: 3, people: [{ id: U(7), name: 'Defne' }, { id: U(8), name: 'Furkan' }, { id: U(9), name: 'Arda' }] }, rank: 2, matched: true },
      { id: LS, name: 'Lofi ve Sohbet', iconUrl: null, category: 'music', members: 86, online: 5, lastHour: 21, today: 33, spark: spark('1,1,0,0,0,1,1,2,2,3,3,4,4,5,4,6,5,6,6'), replyMinutes: 6, inVoice: 1, voice: { id: U(303), name: 'Müzik odası', count: 1, people: [{ id: U(10), name: 'İrem' }] }, rank: 3, matched: true },
      { id: U(104), name: 'Kod Kahvesi', iconUrl: null, category: 'tech', members: 61, online: 3, lastHour: 12, today: 20, spark: spark('1,0,0,0,0,0,1,1,2,2,2,3,3,3,4,4,4,5,4'), replyMinutes: 9, inVoice: 1, voice: { id: U(304), name: 'Eşli kodlama', count: 1, people: [{ id: U(12), name: 'Yiğit' }] }, rank: 4, matched: false },
    ].filter((s) => !st.joinedIds.includes(s.id)).slice(0, 3),
    community: { id: COMM, name: 'Descall Topluluk', iconUrl: null, members: 712, online: 23, joined: true, autoJoined: true, joinedNow: false, left: false, introChannel: { id: U(401), name: 'tanışma' } },
    rehber: { joinedToday: 15, greeted: true },
    inviter: { id: U(5), username: 'zeynep', displayName: 'Zeynep', avatarUrl: null, online: true, friend: 'friend', server: { id: DK, name: 'Ders Kampı YKS 2027' } },
    viaServer: { id: DK, name: 'Ders Kampı YKS 2027' },
    sameInvite: [
      { id: U(6), username: 'kaan', displayName: 'Kaan', avatarUrl: null, friend: null, online: true },
      { id: U(11), username: 'mert', displayName: 'Mert', avatarUrl: null, friend: null, online: false },
    ],
    sameInviteCount: 2,
    myServers: [{ id: COMM, name: 'Descall Topluluk', iconUrl: null, official: true }, ...st.joinedIds.map((id) => ({ id, name: 'Ders Kampı YKS 2027', iconUrl: null, official: false }))],
    checklist: { items, doneCount, total: 5, next: items.find((i) => !i.done)?.id || null, earned: Object.values(claimed).reduce((a, b) => a + b, 0), rewardTotal: 160, complete: doneCount === 5 },
    newlyPaid: [],
    firstHello: { at: st.hello ? new Date().toISOString() : null, pending: false, reward: 50, badge: 'ilkselam' },
  };
}

const PREVIEW = {
  [DK]: {
    server: { id: DK, name: 'Ders Kampı YKS 2027', iconUrl: null, members: 118, online: 7, official: false },
    channels: [{ id: CH.genel, name: 'genel', canSend: true, intro: false }, { id: CH.soru, name: 'soru-cevap', canSend: true, intro: false }, { id: CH.tanisma, name: 'tanışma', canSend: true, intro: true }],
    channelId: CH.genel,
    introChannel: { id: CH.tanisma, name: 'tanışma' },
    messages: [
      ['Zeynep', 9, 'Türev bitti, kim limit tekrarı yapacak?'],
      ['Kaan', 8, "20:00'de pomodoro odasındayım, gelen olursa"],
      ['Defne', 7, "Paragraf denemesini #kaynaklar'a attım"],
      ['Arda', 6, 'Hoş geldin Mert! Hangi alandasın?'],
      ['Mert', 5, 'Sayısal, 12. sınıf'],
    ].map(([name, m, text], i) => ({ id: U(500 + i), author: { name, initial: name[0], avatarUrl: null, me: false }, text, media: null, at: ago(m) })),
    voice: { id: U(301), name: 'Pomodoro odası', count: 2, people: [{ id: U(6), name: 'Kaan', speaking: true }, { id: U(5), name: 'Zeynep' }] },
    crowd: [20, 15, 25, 35, 45, 40, 60, 90, 100, 85, 50, 25].map((v, i) => ({ v, peak: [7, 8, 9].includes(i) })),
    today: 46,
    replyMinutes: 2,
    rules: ['Saygılı ol, kimseyi küçümseme.', 'Spam ve reklam yok.', "Konu dışı sohbet #genel'e."],
    rulesCount: 3,
  },
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
  const shot = async (page, name, opts = {}) => page.screenshot({ path: path.join(OUT, `${name}.jpg`), type: 'jpeg', quality: 90, ...opts });

  const open = async ({ theme = 'dark', mode = 'desk', viewport = { width: 1440, height: 932 }, phone = false, st = {} } = {}) => {
    const state = { interests: ['study', 'gaming-minecraft', 'music'], hidden: false, joined: false, hello: false, joinedIds: [], ...st };
    const log = { puts: [], events: [], joins: [], undo: [], hide: [], friend: [], adminPuts: [], qr: 0 };
    const ctx = await browser.newContext({
      viewport,
      deviceScaleFactor: 2,
      locale: 'tr-TR',
      timezoneId: 'Europe/Istanbul',
      colorScheme: theme,
      ...(phone ? { isMobile: true, hasTouch: true } : {}),
    });
    await ctx.route('**/*', async (r) => {
      const req = r.request();
      const url = new URL(req.url());
      if (/^(data|blob):/.test(url.protocol)) return r.continue();
      if (url.origin === 'https://harness.local') {
        const pub = url.pathname.startsWith('/brand/') ? path.join(FRONT, 'public', url.pathname) : null;
        const file = pub || path.join(DIST, url.pathname === '/' ? 'index.html' : url.pathname);
        if (!fs.existsSync(file)) return r.fulfill({ status: 404, body: '' });
        return r.fulfill({ status: 200, contentType: mime(file), body: fs.readFileSync(file) });
      }
      if (url.origin !== 'https://harness.test') return r.abort();
      const p = url.pathname;
      const json = (body, status = 200) => r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
      const body = () => JSON.parse(req.postData() || '{}');
      if (p.endsWith('/onboarding/state')) return json(stateFixture(state));
      if (p.endsWith('/onboarding/interests')) {
        const b = body();
        log.puts.push(b);
        state.interests = b.interests;
        return json({ interests: b.interests, paid: null });
      }
      const pv = p.match(/\/onboarding\/servers\/([^/]+)\/preview$/);
      if (pv) return PREVIEW[pv[1]] ? json(PREVIEW[pv[1]]) : json({ error: 'Preview not available.' }, 404);
      if (p.endsWith('/onboarding/track')) state.hello = true;
      if (p.endsWith('/onboarding/track')) return json({ exists: true, replies: 2, reactions: 4, repliers: [{ id: U(5), username: 'zeynep', displayName: 'Zeynep' }], activeAfter: 2 });
      if (p.endsWith('/onboarding/event')) {
        log.events.push(body());
        return r.fulfill({ status: 204, body: '' });
      }
      if (p.endsWith('/onboarding/undo')) {
        log.undo.push(body());
        state.joined = false;
        state.joinedIds = [];
        return json({ cancelled: true });
      }
      if (p.endsWith('/onboarding/hide')) {
        const b = body();
        log.hide.push(b);
        state.hidden = b.hidden;
        return json({ hidden: b.hidden });
      }
      if (p.endsWith('/onboarding/invite-qr')) {
        log.qr += 1;
        let svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 7 7"><path d="M0 0h7v7H0z"/></svg>';
        try {
          const QR = require(path.join(FRONT, 'backend/node_modules/qrcode'));
          svg = (await QR.toString('https://descall.com/register?ref=ece.yildiz&src=qr', { type: 'svg', margin: 1 })).replace(/<\?xml[^>]*>/, '');
        } catch {
          /* stand-in */
        }
        return json({ url: 'https://descall.com/register?ref=ece.yildiz', svg });
      }
      const jn = p.match(/\/servers\/discover\/([^/]+)\/join$/);
      if (jn) {
        log.joins.push(jn[1]);
        state.joined = true;
        state.joinedIds = [jn[1]];
        return json({ alreadyMember: false, server: { id: jn[1], name: 'Ders Kampı YKS 2027', channels: [] } }, 201);
      }
      if (p.endsWith('/friends/request')) {
        log.friend.push(body());
        return json({ ok: true });
      }
      if (p.endsWith('/admin/growth/onboarding/config')) {
        log.adminPuts.push(body());
        return json({ settings: body() });
      }
      if (p.endsWith('/admin/growth/onboarding')) {
        return json({
          funnel: { opened: 212, previewed: 171, joined: 133, firstHello: 118, undone: 6, hidden: 9 },
          firstDay: { signups: 231, firstMessage: 139, firstDayMessage: 128, pct: 55.4 },
          byInterest: [['study', 61, 44], ['gaming-minecraft', 48, 31], ['music', 40, 22], ['gaming-cs2', 37, 19], ['anime', 21, 9]].map(([id, picked, h]) => ({ id, picked, firstHello: h, pct: Math.round((h / picked) * 1000) / 10 })),
          byServer: [['Ders Kampı YKS 2027', 64, 51, 44], ['Minecraft Türkiye SMP', 52, 39, 31], ['Lofi ve Sohbet', 31, 22, 17], ['Descall Topluluk', 40, 21, 18]].map(([name, a, b, c], i) => ({ serverId: U(700 + i), name, previewed: a, joined: b, firstHello: c })),
          bySlot: { card: 71, community: 18, panel: 12, dm: 11, invite: 6 },
          cohort: { opened: { eligible: 190, kept: 93, pct: 48.9 }, others: { eligible: 31, kept: 9, pct: 29 } },
          settings: { enabled: true, communityServerId: COMM, autoJoin: true, rehberEnabled: true, rewardsEnabled: true, community: { id: COMM, name: 'Descall Topluluk' } },
          days: 30,
        });
      }
      return json({});
    });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errors.push(m.text()); });
    await page.goto(`https://harness.local/?theme=${theme}&mode=${mode}`);
    return { ctx, page, log, errors, state };
  };

  // ---------------- Desktop dark: dashboard, preview, send, reward ----------------
  {
    const { ctx, page, log, errors } = await open({ theme: 'dark' });
    await page.waitForSelector('[data-testid=onb-dashboard] .onb-card', { timeout: 20000 });
    await page.waitForSelector('[data-testid=onb-sidebar]');
    await page.waitForTimeout(400);
    await check('desk dark: dashboard content', async () => {
      const text = await page.locator('[data-testid=onb-dashboard]').innerText();
      for (const s of ['Hoş geldin, Ece', '38 kişi', 'Şu an çevrimiçi', 'İlgi alanlarında', 'Seni bekleyen', 'İlk mesaj ödülü', '+50', 'Senin için şu an canlı', 'Canlılık sırası', 'Descall Topluluk', 'Resmi', 'Rehber', 'Arkadaşlarını bul', 'Zeynep seni davet etti', 'Aynı davetle gelen 2 kişi', 'descall.com/register?ref=ece.yildiz']) assert.ok(has(text, s), s);
      assert.equal(await page.locator('.onb-card').count(), 3);
      assert.match(await page.locator('.onb-card').first().innerText(), /Ders Kampı YKS 2027[\s\S]*en canlı[\s\S]*118[\s\S]*46[\s\S]*Pomodoro odası[\s\S]*~2 dk/);
      assert.ok(text.includes('Bugün 14 kişi daha katıldı'), 'Rehber counts the others who joined today');
      assert.equal(errors.length, 0, errors.join('; '));
    });
    await check('desk dark: checklist in the list column', async () => {
      const side = await page.locator('[data-testid=onb-sidebar]').innerText();
      for (const s of ['Başla', 'Gün 1 / 5', '1/5', '10 / 160 DesCoin', 'İlgi alanlarını seç', '3 seçili', 'Bir sunucuya katıl', 'İlk mesajını gönder', 'Sesli odada 1 dakika', 'Bir arkadaş ekle', 'Sunucuların', 'Önerilen']) assert.ok(has(side, s), s);
      assert.equal(await page.locator('.onb-ci.is-done').count(), 1);
      assert.equal(await page.locator('.onb-ci.is-now').count(), 1);
    });
    await shot(page, 'growth-onboarding-0-desk-empty-panel');
    await page.locator('.onb-card').first().click();
    await page.waitForSelector('.onb-panel .onb-m');
    await page.waitForTimeout(500);
    await check('desk dark: preview panel', async () => {
      const pv = await page.locator('.onb-panel').innerText();
      for (const s of ['Önizleme', 'Katılmadın', 'Ders Kampı YKS 2027', '7 çevrimiçi', '118 üye', 'genel', 'soru-cevap', 'tanışma', 'Kalabalık saatler', 'Türev bitti', 'Pomodoro odası', '2 kişi içeride', 'Katıl ve selam ver', '#tanışma', 'İlgi alanından hazırlandı', '+70', 'Katıl ve gönder', 'Sadece katıl', 'Önizlemede kimse seni görmez.', 'Kurallar: 3 madde']) assert.ok(has(pv, s), s);
      assert.equal(await page.locator('.onb-ta').inputValue(), 'Selam, ben Ece. Ders çalışıyorum, birlikte çalışacak arkadaş arıyorum.');
      assert.ok(await page.locator('.onb-card.is-hl').count() === 1, 'the previewed card is highlighted');
      assert.ok(await page.locator('.onb-sv.is-ghost.is-on').count() === 1, 'and its row in Önerilen');
      assert.equal(await page.locator('.onb-hb i').count(), 12);
      assert.ok((await page.locator('.onb-ci.is-now').innerText()).includes('Ders Kampı YKS 2027 önizleniyor'));
    });
    await shot(page, 'growth-onboarding-1-desk-dark');
    // edit the sentence, rules toggle
    await page.locator('.onb-join .note button').click();
    await check('desk dark: rules shown on demand', async () => assert.equal(await page.locator('.onb-join .rules li').count(), 3));
    await page.locator('.onb-ta').fill('Selam, ben Ece. 12. sınıftayım, sayısal çalışıyorum. Akşam pomodoroya katılabilirim.');
    await check('desk dark: edited sentence is marked as yours', async () => assert.ok((await page.locator('.onb-join').innerText()).includes('Senin cümlen')));
    await page.locator('.onb-join .onb-btn.pri').click();
    await page.waitForSelector('.onb-sent');
    await check('desk dark: Katıl ve gönder', async () => {
      assert.deepEqual(log.joins, [DK], 'joined the previewed server');
      const sent = await page.evaluate(() => window.__onbSent.find((s) => s.ev === 'server:channel:message')?.p);
      assert.equal(sent.serverId, DK);
      assert.equal(sent.channelId, CH.tanisma, 'goes to #tanışma');
      assert.equal(sent.content, 'Selam, ben Ece. 12. sınıftayım, sayısal çalışıyorum. Akşam pomodoroya katılabilirim.');
      assert.ok(log.events.some((e) => e.event === 'onboarding_joined' && e.props.server === DK && e.props.slot === 'card'), 'join intent with the card slot');
      assert.match(await page.locator('.onb-sent').innerText(), /Geri al \d+/);
    });
    await page.waitForTimeout(3200);
    await check('desk dark: reward and live counters after sending', async () => {
      const txt = await page.locator('.onb-sent').innerText();
      assert.ok(txt.includes('İlk Selam rozeti ve +70 DesCoin'), txt);
      assert.ok(txt.includes('4 tepki') && txt.includes('2 yanıt'), txt);
      assert.ok((await page.locator('.onb-toast').innerText()).includes('İlk Selam rozeti kazandın'));
    });
    await shot(page, 'growth-onboarding-2-desk-sent');
    await ctx.close();
  }

  // ---------------- Desktop light: preview, undo, interests, hide + reopen ----------------
  {
    const { ctx, page, log, errors } = await open({ theme: 'light' });
    await page.waitForSelector('[data-testid=onb-dashboard] .onb-card', { timeout: 20000 });
    await page.locator('.onb-card').first().click();
    await page.waitForSelector('.onb-panel .onb-m');
    await page.waitForTimeout(400);
    await shot(page, 'growth-onboarding-3-desk-light');
    await page.locator('.onb-chip', { hasText: 'Anime' }).first().click();
    await page.waitForTimeout(900);
    await check('desk light: interests saved', async () => assert.deepEqual(log.puts.at(-1), { interests: ['study', 'gaming-minecraft', 'music', 'anime'] }));
    await page.locator('.onb-join .onb-btn.pri').click();
    await page.waitForSelector('.onb-sent button.u');
    await page.locator('.onb-sent button.u').click();
    await page.waitForTimeout(500);
    await check('desk light: undo deletes, leaves and cancels the reward', async () => {
      const del = await page.evaluate(() => window.__onbSent.find((s) => s.ev === 'server:channel:message:delete')?.p);
      assert.equal(del.serverId, DK);
      assert.equal(del.messageId, '00000000-0000-4000-8000-00000000abcd');
      assert.equal(await page.evaluate(() => window.__onbLeft), DK);
      assert.equal(log.undo.length, 1);
      assert.ok((await page.locator('.onb-join').innerText()).includes('Geri alındı'));
    });
    await page.locator('.onb-hd .onb-btn').click();
    await page.locator('.onb-hd .onb-btn.pri').click();
    await page.waitForSelector('[data-testid=onb-reopen]');
    await check('desk light: hide, then reopen from the list', async () => {
      assert.deepEqual(log.hide, [{ hidden: true }]);
      assert.ok(await page.locator('[data-testid=h-empty]').isVisible(), 'the normal empty state is back');
    });
    await page.locator('[data-testid=onb-reopen]').click();
    await page.waitForSelector('[data-testid=onb-dashboard]');
    await check('desk light: reopened', async () => {
      assert.deepEqual(log.hide.at(-1), { hidden: false });
      assert.equal(errors.length, 0, errors.join('; '));
    });
    await ctx.close();
  }

  // ---------------- Phone ----------------
  for (const theme of ['dark', 'light']) {
    const { ctx, page, errors } = await open({ theme, mode: 'phone', viewport: { width: 390, height: 844 }, phone: true });
    await page.waitForSelector('[data-testid=onb-phone] .onb-pcard', { timeout: 20000 });
    await page.waitForTimeout(400);
    await check(`phone ${theme}: Başla page`, async () => {
      const txt = await page.locator('[data-testid=onb-phone]').innerText();
      for (const s of ['Sıradaki: Bir sunucuya katıl', '+20 DesCoin', 'İlgi alanların', 'Düzenle', 'Ders çalışma', 'Şu an canlı', 'Ders Kampı YKS 2027', 'Önizle', 'Katıl', 'Rehber', 'Zeynep seni davet etti']) assert.ok(has(txt, s), s);
      assert.equal(errors.length, 0, errors.join('; '));
    });
    await shot(page, `growth-onboarding-4-phone-${theme}`);
    if (theme === 'light') {
      await ctx.close();
      continue;
    }
    await page.locator('.onb-pcard .onb-btn.gh').first().click();
    await page.waitForSelector('.onb-sheet .onb-m');
    await page.waitForTimeout(500);
    await check('phone: preview sheet', async () => {
      const txt = await page.locator('.onb-sheet').innerText();
      for (const s of ['Ders Kampı YKS 2027', 'genel', 'Türev bitti', 'Pomodoro odası', 'KATIL VE SELAM VER', 'Katıl ve gönder', '+70', 'Sadece katıl', 'Önizlemede kimse seni görmez.']) assert.ok(has(txt, s), s);
    });
    await shot(page, 'growth-onboarding-5-phone-sheet');
    await page.locator('.onb-sheet .onb-join .onb-btn.pri').click();
    await page.waitForSelector('[data-testid=onb-joined]', { timeout: 8000 });
    await page.waitForTimeout(2600);
    await check('phone: in the channel with the badge and undo', async () => {
      const txt = await page.locator('[data-testid=onb-joined]').innerText();
      assert.ok(txt.includes('İlk Selam rozeti kazandın'), txt);
      assert.ok(txt.includes('+50 DesCoin'), txt);
      assert.match(txt, /Katıldın: Ders Kampı YKS 2027[\s\S]*Geri al \d/);
      assert.deepEqual(await page.evaluate(() => window.__onbOpened), { serverId: DK, channelId: CH.tanisma });
    });
    await shot(page, 'growth-onboarding-6-phone-joined');
    await ctx.close();
  }
  {
    const { ctx, page, log } = await open({ theme: 'dark', mode: 'friends', viewport: { width: 390, height: 844 }, phone: true });
    await page.waitForSelector('[data-testid=onb-friends]', { timeout: 20000 });
    await page.waitForTimeout(300);
    await check('phone: friends (inviter, same invite, link, preview)', async () => {
      const txt = await page.locator('[data-testid=onb-friends]').innerText();
      for (const s of ['Zeynep seni davet etti', 'Selam', 'Kaan', 'Mert', 'Ekle', 'descall.com/register?ref=ece.yildiz', 'Kopyala', 'QR', 'Ece seni Descall\'a çağırıyor', 'Ders Kampı YKS 2027 ile başla']) assert.ok(has(txt, s), s);
    });
    await page.locator('.onb-prow .onb-btn').first().click();
    await page.waitForTimeout(300);
    await check('phone: Ekle sends a friend request', async () => {
      assert.deepEqual(log.friend, [{ username: 'kaan' }]);
      assert.ok((await page.locator('.onb-prow').first().innerText()).includes('İstek gitti'));
    });
    await page.locator('.onb-inv-hero .onb-btn').click();
    await check('phone: Selam ver opens a ready, editable greeting', async () => assert.equal(await page.locator('.onb-friends .onb-ta').inputValue(), 'Selam Zeynep! Davetin için teşekkürler, ben de buradayım.'));
    await page.locator('.onb-friends .onb-btn.pri', { hasText: 'Gönder' }).click();
    await check('phone: greeting goes as a DM', async () => {
      const dm = await page.evaluate(() => window.__onbSent.find((s) => s.ev === 'dm:send')?.p);
      assert.deepEqual(dm, { toUserId: U(5), text: 'Selam Zeynep! Davetin için teşekkürler, ben de buradayım.' });
    });
    await shot(page, 'growth-onboarding-7-phone-friends');
    await page.locator('.onb-share button', { hasText: 'QR' }).click();
    await page.waitForSelector('.onb-qr-card .code svg');
    await check('phone: QR from the server', async () => assert.equal(log.qr, 1));
    await ctx.close();
  }

  // ---------------- Admin card ----------------
  for (const theme of ['dark']) {
    const { ctx, page, log } = await open({ theme, mode: 'admin', viewport: { width: 1200, height: 900 } });
    await page.waitForSelector('[data-testid=admin-onb] .agr-kpi', { timeout: 20000 });
    await check('admin: numbers', async () => {
      const txt = await page.locator('[data-testid=admin-onb]').innerText();
      for (const s of ['İlk beş dakika', 'İlk gün ilk mesaj', '128 / 231', 'Pano açıldı', 'Önizledi', 'İlk mesaj', 'Ders çalışma', 'Ders Kampı YKS 2027', 'D1 · panoyu açanlar', 'Resmi topluluk sunucusu', 'Şu an: Descall Topluluk']) assert.ok(has(txt, s), s);
    });
    await page.locator('.agr-onb-check input').nth(2).uncheck();
    await page.locator('.agr-save').click();
    await page.waitForTimeout(400);
    await check('admin: settings save', async () => assert.deepEqual(log.adminPuts[0], { communityServerId: COMM, enabled: true, autoJoin: true, rehberEnabled: false, rewardsEnabled: true }));
    await shot(page, 'growth-onboarding-8-admin', { fullPage: true });
    await ctx.close();
  }

  await browser.close();
  console.log(fails.length ? `\n${fails.length} failed` : '\nall checks passed');
  process.exit(fails.length ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
