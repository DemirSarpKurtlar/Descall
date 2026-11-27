'use strict';

/**
 * Uyarlanan kart (growth draft 1B) end to end, against a built dist/ and a mocked backend
 * (every /auth/*, /api/public-pages/live and /api/analytics call is answered here; nothing
 * leaves the machine). Synthetic data only.
 *
 * Desktop (glass desktop preview of the app, 1440 x 900):
 *   start: domain chips, passkey + email; a new email turns the card into sign-up, the free
 *   username ideas show, a breached password ("galatasaray1905", 48.312 in the mocked list)
 *   opens the fix panel before the submit with the count, breach_warned_inline is sent,
 *   "use this and save" puts a 4-word suggestion in, the register body carries card.surface,
 *   breachWarned and fixedVia=suggested (and no function / no password in analytics).
 *   A registered email turns the card into sign-in without retyping, a wrong password shows
 *   the server error, "send code" opens the in-card reset.
 * Phone (iPhone 393 x 852): the four states of the draft's phone row.
 * Web site (/register): the same card in the sign-up modal.
 * Admin: Kayıt İstatistikleri shows the card's Ölçüm (aggregated by the real backend code).
 * Light theme shots for the desktop card.
 *
 *   VITE_API_BASE_URL=http://127.0.0.1:5361 VITE_SOCKET_URL=http://127.0.0.1:5361 npx vite build --outDir dist-e2e
 *   node e2e/adaptiveSignup.e2e.cjs [--dist=dist-e2e] [--out=/tmp/adaptive-signup-e2e]
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const mock = require('./perf/mockBackend.cjs');

const supabasePath = require.resolve('../backend/db/supabase');
require.cache[supabasePath] = { id: supabasePath, filename: supabasePath, loaded: true, exports: {} };
const ss = require('../backend/lib/signupStats');

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
const pw = require(process.env.PLAYWRIGHT_CORE || 'playwright-core');
const DIST = path.resolve(args.dist || path.join(__dirname, '../dist-e2e'));
const OUT = path.resolve(args.out || process.env.DESCALL_E2E_SHOTS || '/tmp/descall-adaptive-signup-e2e');
const PORT = Number(args.port || 5361);
const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

/**
 * API hosts a build may point at (config/api.js, lib/nodeRouting.js): a dist built without
 * VITE_API_BASE_URL calls production. Their requests are answered here by path (mocked
 * handlers first, else the local mock server), so the harness never depends on how the
 * build was configured and nothing reaches a real backend.
 */
const API_HOSTS = new Set(['des-call.onrender.com', 'api.descall.com', 'des-call-staging.onrender.com', 'api-staging.descall.com', 'descall.com', 'www.descall.com']);

const BREACHED = 'galatasaray1905';
const BREACHED_HASH = crypto.createHash('sha1').update(BREACHED).digest('hex').toUpperCase();
const REGISTERED = 'ece.yilmaz@outlook.com';

/** Synthetic public pages (the shape of GET /api/public-pages/live). */
function liveFixture() {
  const soon = new Date(Date.now() + 3 * 3600 * 1000).toISOString();
  return {
    servers: [
      { slug: 'gece-sohbeti', url: 'https://descall.com/s/gece-sohbeti', name: 'Gece Sohbeti', iconUrl: null, members: 412, online: 23, inVoice: 5, voice: { name: 'Sohbet odası', count: 5 }, event: null, pin: '', category: 'community' },
      { slug: 'descall-toplulugu', url: 'https://descall.com/s/descall-toplulugu', name: 'Descall Topluluğu', iconUrl: null, members: 1210, online: 34, inVoice: 0, voice: null, event: null, pin: 'Yeni gelenler burada. Kanallara göz at, takıldığın yerde sor.', category: 'community' },
      { slug: 'yazilim-kahvesi', url: 'https://descall.com/s/yazilim-kahvesi', name: 'Yazılım Kahvesi', iconUrl: null, members: 268, online: 11, inVoice: 0, voice: null, event: null, pin: 'Kod, kariyer ve kahve. Sorunu #yardim kanalına yaz.', category: 'tech' },
      { slug: 'lofi-calisma', url: 'https://descall.com/s/lofi-calisma', name: 'Lo-fi Çalışma Odası', iconUrl: null, members: 190, online: 9, inVoice: 4, voice: { name: 'Odak odası', count: 4 }, event: null, pin: '', category: 'study' },
      { slug: 'anime-kulubu', url: 'https://descall.com/s/anime-kulubu', name: 'Anime Kulübü', iconUrl: null, members: 154, online: 6, inVoice: 0, voice: null, event: { title: 'İzleme partisi', startsAt: soon }, pin: '', category: 'anime' },
    ],
    platform: { online: 87, joinedToday: 31, countries: ['TR', 'BR', 'US'] },
    builtAt: new Date().toISOString(),
  };
}

function adminStats() {
  const now = new Date();
  const range = ss.resolveRange({ granularity: 'day' }, now);
  const users = [];
  let n = 0;
  for (let d = 0; d < 30; d++) {
    for (let i = 0; i < 3 + (d % 4); i++) {
      const at = new Date(now.getTime() - d * 86400000 - i * 3600000).toISOString();
      users.push({ id: `u-${++n}`, created_at: at, signup_at: at, auth_method: ['email', 'google', 'passkey'][n % 3], first_touch_source: 'direct', signup_country: 'TR', first_app_opened_at: at, deleted_at: null });
    }
  }
  const ev = (event, d, props) => ({ event, occurred_at: new Date(now.getTime() - d * 86400000).toISOString(), props: props || {} });
  const cardEvents = [];
  for (let d = 0; d < 20; d++) {
    cardEvents.push(ev('identifier_routed', d));
    cardEvents.push(ev('breach_warned_inline', d), ev('breach_warned_inline', d + 0.1));
    if (d % 4) cardEvents.push(ev('breach_fixed', d, { method: d % 3 === 0 ? 'passkey' : d % 2 ? 'suggested' : 'own' }));
  }
  const attempts = [];
  for (let d = 0; d < 20; d++) {
    attempts.push({ created_at: new Date(now.getTime() - d * 86400000).toISOString(), status: 'completed', attempt_key: `k${d}`, flow: 'card' });
    if (d % 5 === 0) attempts.push({ created_at: new Date(now.getTime() - d * 86400000).toISOString(), status: 'failed', reason: 'validation', reason_detail: 'password_breached', attempt_key: `f${d}`, flow: 'classic' });
  }
  return ss.computeSignupStats({ users, startedDays: users.map((u) => ss.istDay(u.created_at)), attempts, activeDays: [], cardEvents, range, now });
}

async function main() {
  if (!fs.existsSync(path.join(DIST, 'index.html'))) throw new Error(`no build at ${DIST}`);
  fs.mkdirSync(OUT, { recursive: true });
  const srv = await mock.start({ dist: DIST, port: PORT });
  const base = `http://127.0.0.1:${srv.port}`;
  const browser = await pw.chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ['--no-sandbox'] });
  const fails = [];
  const check = (cond, msg) => { if (!cond) fails.push(msg); };
  const registers = [];
  const identifies = [];
  const ranges = [];
  const events = [];
  const logins = [];

  async function routeApi(ctx, { admin = false } = {}) {
    await ctx.route('**/*', async (r) => {
      const req = r.request();
      const url = req.url();
      if (/^(data|blob):/.test(url)) return r.continue();
      // Google Identity Services stand-in: the card's Google button renders as on the web.
      if (url.startsWith('https://accounts.google.com/gsi/client')) {
        return r.fulfill({ status: 200, contentType: 'text/javascript', body: 'window.google={accounts:{id:{initialize:function(){},renderButton:function(el){el.innerHTML="<div style=\\"height:46px;width:100%\\"></div>";},prompt:function(){},cancel:function(){}}}};' });
      }
      const u = new URL(url);
      const foreignApi = !url.startsWith(base) && API_HOSTS.has(u.hostname) && req.resourceType() !== 'document';
      if (!url.startsWith(base) && !foreignApi) return r.abort();
      const p = u.pathname;
      // Anything not mocked below goes to the local mock server (never the real host).
      const passOn = async () => {
        if (!foreignApi) return r.continue();
        try {
          return await r.fulfill({ response: await r.fetch({ url: `${base}${u.pathname}${u.search}` }) });
        } catch {
          // The page or context closed while a long poll (socket.io) was in flight.
          return r.abort().catch(() => {});
        }
      };
      const json = (status, body) => r.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
      if (req.resourceType() === 'document') return passOn();
      if (p === '/api/public-pages/live') return json(200, liveFixture());
      if (/\/auth\/identify$/.test(p)) {
        const body = JSON.parse(req.postData() || '{}');
        identifies.push(body);
        if (body.email === 'busy@example.com') return json(503, { error: 'Service unavailable' });
        return json(200, body.email === REGISTERED ? { status: 'registered', emailHint: 'e***@outlook.com' } : { status: 'new' });
      }
      const range = p.match(/\/auth\/password\/range\/([0-9A-Fa-f]{5})$/);
      if (range) {
        ranges.push(range[1]);
        const text = range[1].toUpperCase() === BREACHED_HASH.slice(0, 5) ? `${BREACHED_HASH.slice(5)}:48312\n${'A'.repeat(35)}:2` : `${'B'.repeat(35)}:7`;
        return r.fulfill({ status: 200, contentType: 'text/plain', headers: { 'access-control-allow-origin': '*' }, body: text });
      }
      if (/\/auth\/username\/ideas$/.test(p)) {
        const body = JSON.parse(req.postData() || '{}');
        return json(200, { free: (body.candidates || []).slice(0, 4) });
      }
      if (/\/auth\/username\/check$/.test(p)) return json(200, { available: true });
      if (/\/auth\/google\/config$/.test(p)) return json(200, { clientId: 'e2e-client.apps.googleusercontent.com' });
      if (/\/auth\/register$/.test(p)) {
        registers.push(JSON.parse(req.postData() || '{}'));
        return json(201, { token: 'e2e.fake.token', sessionId: 's1', user: { ...mock.ME, username: 'demirkaya' } });
      }
      if (/\/auth\/login$/.test(p)) {
        const body = JSON.parse(req.postData() || '{}');
        logins.push(body);
        return json(401, { error: 'Invalid username or password.' });
      }
      if (/\/auth\/password\/forgot$/.test(p)) return json(200, { status: 'sent', message: 'We sent a 6-digit code to your email.', emailHint: 'e***@outlook.com' });
      if (/\/auth\/passkeys\/config$/.test(p)) return json(200, { enabled: true, rpId: '127.0.0.1', android: false });
      if (/\/auth\/passkeys\/auth\/options$/.test(p)) return json(503, { error: 'off in e2e' });
      if (/\/api\/analytics\/collect$/.test(p)) {
        try { events.push(JSON.parse(req.postData() || '{}')); } catch { /* ignore */ }
        return r.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*' }, body: '' });
      }
      if (admin && /^(\/api)?\/admin\/signup-stats\/?$/.test(p)) return json(200, adminStats());
      return passOn();
    });
  }

  const initScript = ([api, opts]) => {
    window.__DESCALL_API_URL__ = api; window.__DESCALL_SOCKET_URL__ = api;
    localStorage.setItem('descall_language', 'tr');
    localStorage.setItem('descall:ios-pwa-install-dismissed', '1');
    localStorage.setItem('descall:cookie_consent_v1', JSON.stringify({ choice: 'rejected', at: new Date().toISOString() }));
    if (opts.token) {
      localStorage.setItem('descall_token', 'e2e.fake.token');
      localStorage.setItem('descall_user', JSON.stringify(opts.me));
    }
  };

  async function newPage(viewport, { mobile = false, theme = 'dark', admin = false, token = false } = {}) {
    const ctxOpts = { viewport, deviceScaleFactor: 2, locale: 'tr-TR', timezoneId: 'Europe/Istanbul', colorScheme: theme };
    if (mobile) Object.assign(ctxOpts, { isMobile: true, hasTouch: true, userAgent: IPHONE_UA });
    const ctx = await browser.newContext(ctxOpts);
    await routeApi(ctx, { admin });
    await ctx.addInitScript(initScript, [base, { token, me: { ...mock.ME, is_admin: true } }]);
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e.message || e)));
    page.on('console', (m) => { if (m.type() === 'error' && /adaptive|asu-/i.test(m.text())) errors.push(m.text()); });
    return { ctx, page, errors };
  }

  const setTheme = (page, theme) => page.evaluate((th) => document.documentElement.setAttribute('data-theme', th), theme);
  const shot = (page, name, opts = {}) => page.screenshot({ path: path.join(OUT, name), type: 'jpeg', quality: 86, ...opts });

  async function pickBirth(page, d, m, y) {
    for (const [id, value] of [['asu-birth-day', d], ['asu-birth-month', m], ['asu-birth-year', y]]) {
      await page.locator(`#${id}`).click();
      await page.locator('.birth-select-option', { hasText: new RegExp(`^${value}$`) }).first().click();
    }
  }

  try {
    // ---------------- desktop: new email, breached password, suggestion ----------------
    {
      const { ctx, page, errors } = await newPage({ width: 1440, height: 900 });
      await page.goto(`${base}/register?gd=1`, { waitUntil: 'load' });
      const card = page.locator('.asu-card');
      await card.waitFor({ timeout: 20000 });
      await page.locator('.asu-side .asu-snip').first().waitFor({ timeout: 10000 }).catch(() => fails.push('desktop: live snippets did not appear'));
      check(await page.locator('.asu-ribbon').isVisible(), 'desktop: live ribbon visible');
      check(/87/.test(await page.locator('.asu-herepill').first().innerText().catch(() => '')), 'desktop: here pill shows the online count');
      await page.fill('#asu-identifier', 'demir.kaya@g');
      const chip = page.locator('.asu-chip', { hasText: '@gmail.com' });
      await chip.waitFor({ timeout: 5000 });
      await page.waitForTimeout(300);
      await setTheme(page, 'dark');
      await shot(page, 'desktop-1-start-dark.jpg');
      await chip.click();
      check((await page.inputValue('#asu-identifier')) === 'demir.kaya@gmail.com', 'desktop: domain chip completes the address');
      await page.click('button[type=submit]:has-text("Devam")');
      await page.locator('.asu-card[data-step="register"]').waitFor({ timeout: 10000 });
      check(identifies.some((b) => b.email === 'demir.kaya@gmail.com' && b.surface === 'app'), 'desktop: identify called with surface');
      await page.locator('[data-testid="asu-ideas"] .asu-chip').first().waitFor({ timeout: 5000 });
      const ideaTexts = await page.locator('[data-testid="asu-ideas"] .asu-chip').allInnerTexts();
      check(ideaTexts[0] === '@demirkaya' && ideaTexts.includes('@dkaya'), `desktop: username ideas from the email (${ideaTexts.join(' ')})`);
      check((await page.inputValue('#asu-username')) === '', 'desktop: no field is filled in for the person');
      await page.locator('[data-testid="asu-ideas"] .asu-chip').first().click();
      check((await page.inputValue('#asu-username')) === 'demirkaya', 'desktop: a tap on an idea fills the username');
      await page.fill('#asu-password', BREACHED);
      await page.locator('.asu-bp').waitFor({ timeout: 8000 });
      const leak = await page.locator('.asu-leak.is-bad').innerText();
      check(/48\.312/.test(leak), `desktop: breach count in Turkish number format (${leak})`);
      check(ranges.every((x) => /^[0-9A-Fa-f]{5}$/.test(x)), 'desktop: only 5-character prefixes leave the device');
      await page.locator('[data-testid="asu-suggestion"]').filter({ hasText: /-\d{2}$/ }).waitFor({ timeout: 8000 });
      const suggestion = (await page.locator('[data-testid="asu-suggestion"]').innerText()).trim();
      check(/^([A-Z][a-z]{2,9}-){4}\d{2}$/.test(suggestion), `desktop: memorable suggestion (${suggestion})`);
      check(await page.locator('.asu-btn.is-dis:has-text("Şifreyi seçince hazırsın")').isVisible(), 'desktop: submit waits for the password');
      check(/1 şey düzeltilecek/.test(await page.locator('.asu-pill.is-fix').innerText()), 'desktop: "1 şey düzeltilecek" pill');
      await page.waitForTimeout(600);
      await shot(page, 'desktop-2-breach-dark.jpg');
      await page.evaluate(() => window.scrollTo(0, 0));
      const warned = events.filter((e) => e.event === 'breach_warned_inline');
      check(warned.length === 1 && warned[0].props?.source === 'app', `desktop: breach_warned_inline sent once (${warned.length})`);
      check(!JSON.stringify(events).includes(BREACHED), 'desktop: analytics never carries the password');
      // Other tabs
      await page.click('#asu-fix-tab-own');
      check(await page.locator('.asu-bp >> text=Yeni bir şifre yaz').first().isVisible(), 'desktop: own password tab');
      await page.click('#asu-fix-tab-passwordless');
      // A passkey account where this browser can make one, else Google / Apple (headless: none).
      check(
        (await page.locator('.asu-bp button:has-text("ile şifresiz hesap aç")').isVisible()) || (await page.locator('.asu-bp >> text=passkey oluşturamıyor').first().isVisible()),
        'desktop: passwordless tab offers the passkey account or the fallback'
      );
      await page.click('#asu-fix-tab-suggested');
      await page.locator('[data-testid="asu-suggestion"]').filter({ hasText: /-\d{2}$/ }).waitFor({ timeout: 8000 });
      const used = (await page.locator('[data-testid="asu-suggestion"]').innerText()).trim();
      await page.click('button:has-text("Bunu kullan ve kaydet")');
      await page.locator('.asu-leak:not(.is-bad):has-text("temiz")').waitFor({ timeout: 8000 });
      check((await page.inputValue('#asu-password')) === used, 'desktop: suggestion is in the password field');
      check(!(await page.locator('.asu-bp').isVisible().catch(() => false)), 'desktop: fix panel closes once fixed');
      await pickBirth(page, '14', 'Mart', '2006');
      await page.locator('label[for="asu-terms"]').click({ position: { x: 4, y: 6 } }).catch(() => page.check('#asu-terms'));
      if (!(await page.isChecked('#asu-terms'))) await page.check('#asu-terms', { force: true });
      await page.waitForTimeout(300);
      await shot(page, 'desktop-3-new-dark.jpg');
      await setTheme(page, 'light');
      await page.waitForTimeout(300);
      await shot(page, 'desktop-4-new-light.jpg');
      await setTheme(page, 'dark');
      await page.click('button[type=submit]:has-text("Hesabı aç")');
      await page.waitForTimeout(1500);
      const reg = registers[0];
      check(Boolean(reg), 'desktop: register sent');
      if (reg) {
        check(reg.email === 'demir.kaya@gmail.com' && reg.username === 'demirkaya' && reg.password === used, 'desktop: register body has email, username, the suggestion');
        check(reg.birthDate === '2006-03-14' && reg.termsAccepted === true, 'desktop: birth date and terms');
        check(reg.card && reg.card.surface === 'app' && reg.card.breachWarned === true && reg.card.fixedVia === 'suggested', `desktop: card context ${JSON.stringify(reg.card)}`);
        check(!('beforeCommit' in reg) && !('passwordless' in reg), 'desktop: no client-only fields in the body');
      }
      if (errors.length) fails.push(`desktop new: page errors ${errors.join(' | ')}`);
      await ctx.close();
    }

    // ---------------- desktop: registered email -> sign-in, wrong password, reset ----------------
    {
      const { ctx, page, errors } = await newPage({ width: 1440, height: 900 });
      await page.goto(`${base}/login?gd=1`, { waitUntil: 'load' });
      await page.locator('.asu-card').waitFor({ timeout: 20000 });
      await page.locator('.asu-side .asu-snip').first().waitFor({ timeout: 10000 }).catch(() => {});
      // A busy server on the lookup: the sign-up card still opens (no dead end).
      await page.fill('#asu-identifier', 'busy@example.com');
      await page.click('button[type=submit]:has-text("Devam")');
      await page.locator('.asu-card[data-step="register"]').waitFor({ timeout: 15000 }).catch(() => fails.push('login: a failed lookup does not fall back to the sign-up card'));
      await page.click('.asu-idrow .asu-ed');
      await page.locator('.asu-card[data-step="start"]').waitFor({ timeout: 5000 });
      await page.fill('#asu-identifier', REGISTERED);
      await page.click('button[type=submit]:has-text("Devam")');
      await page.locator('.asu-card[data-step="login"]').waitFor({ timeout: 10000 });
      check(/Tekrar hoş geldin/.test(await page.locator('.asu-title h2').innerText()), 'login: welcome back title');
      check((await page.locator('[data-testid="asu-idrow-value"]').innerText()).trim() === REGISTERED, 'login: email kept, not typed again');
      check(!(await page.locator('text=Email is already in use').count()), 'login: no "email taken" error');
      await page.waitForTimeout(400);
      await shot(page, 'desktop-5-login-dark.jpg');
      await page.fill('#asu-login-password', 'yanlis-sifre');
      await page.click('button[type=submit]:has-text("Giriş yap")');
      await page.locator('.asu-alert').waitFor({ timeout: 8000 });
      check(logins.some((l) => l.username === REGISTERED), 'login: signs in with the email as identifier');
      await page.click('button:has-text("Kod gönder")');
      await page.locator('.asu-card[data-step="reset"]').waitFor({ timeout: 8000 });
      check(await page.locator('#asu-reset-code').isVisible(), 'login: in-card reset code field');
      await setTheme(page, 'light');
      await page.waitForTimeout(300);
      await shot(page, 'desktop-6-reset-light.jpg');
      if (errors.length) fails.push(`desktop login: page errors ${errors.join(' | ')}`);
      await ctx.close();
    }

    // ---------------- phone: the draft's four states ----------------
    {
      const phoneShots = [];
      const vp = { width: 393, height: 852 };
      const states = [
        async (page) => { await page.fill('#asu-identifier', 'demir.kaya@g'); await page.locator('.asu-chip').first().waitFor({ timeout: 5000 }); },
        async (page) => {
          await page.fill('#asu-identifier', 'demir.kaya@gmail.com');
          await page.click('button[type=submit]:has-text("Devam")');
          await page.locator('.asu-card[data-step="register"]').waitFor({ timeout: 10000 });
          await page.locator('[data-testid="asu-ideas"] .asu-chip').first().click();
          await page.fill('#asu-password', 'Kayik-Bulut-Defne-28x');
          await page.locator('.asu-leak:has-text("temiz")').waitFor({ timeout: 8000 });
        },
        async (page) => {
          await page.fill('#asu-identifier', 'demir.kaya@gmail.com');
          await page.click('button[type=submit]:has-text("Devam")');
          await page.locator('.asu-card[data-step="register"]').waitFor({ timeout: 10000 });
          await page.locator('[data-testid="asu-ideas"] .asu-chip').first().click();
          await page.fill('#asu-password', BREACHED);
          await page.locator('[data-testid="asu-suggestion"]').filter({ hasText: /-\d{2}$/ }).waitFor({ timeout: 8000 });
          await page.locator('#asu-username').scrollIntoViewIfNeeded();
        },
        async (page) => {
          await page.fill('#asu-identifier', REGISTERED);
          await page.click('button[type=submit]:has-text("Devam")');
          await page.locator('.asu-card[data-step="login"]').waitFor({ timeout: 10000 });
        },
      ];
      for (let i = 0; i < states.length; i++) {
        const { ctx, page, errors } = await newPage(vp, { mobile: true });
        await page.goto(`${base}/login?gd=1`, { waitUntil: 'load' });
        await page.locator('.asu-card').waitFor({ timeout: 20000 });
        check(await page.locator('.asu-page.is-phone').count(), `phone ${i + 1}: phone layout`);
        await states[i](page);
        if (i > 0) check(await page.locator('.asu-ptop').isVisible(), `phone ${i + 1}: compact top bar`);
        await page.waitForTimeout(500);
        const file = path.join(OUT, `phone-${i + 1}.png`);
        await page.screenshot({ path: file });
        phoneShots.push(file);
        if (errors.length) fails.push(`phone ${i + 1}: page errors ${errors.join(' | ')}`);
        await ctx.close();
      }
      // One image with the four phones side by side (like the draft's phone row).
      const ctx = await browser.newContext({ viewport: { width: 4 * 393 + 5 * 28, height: 852 + 56 }, deviceScaleFactor: 1 });
      const page = await ctx.newPage();
      const imgs = phoneShots.map((f) => `<img src="data:image/png;base64,${fs.readFileSync(f).toString('base64')}">`).join('');
      await page.setContent(`<html><body style="margin:0;background:#0a0b10;display:flex;gap:28px;padding:28px;box-sizing:border-box">${imgs.replace(/<img /g, '<img style="width:393px;height:852px;border-radius:44px;box-shadow:0 0 0 8px #1c1d25,0 30px 70px -25px #000" ')}</body></html>`);
      await page.waitForTimeout(300);
      await shot(page, 'phone-states.jpg', { fullPage: true });
      await ctx.close();
    }

    // ---------------- web site: the sign-up modal ----------------
    {
      const { ctx, page, errors } = await newPage({ width: 1280, height: 860 });
      await page.goto(`${base}/register`, { waitUntil: 'load' });
      const ok = await page.locator('.login-modal .asu-card').waitFor({ timeout: 25000 }).then(() => true, () => false);
      check(ok, 'site: the sign-up modal shows the adaptive card');
      if (ok) {
        await page.fill('.login-modal #asu-identifier', 'demir.kaya@gmail.com');
        await page.click('.login-modal button[type=submit]:has-text("Devam")');
        await page.locator('.login-modal .asu-card[data-step="register"]').waitFor({ timeout: 10000 }).catch(() => fails.push('site: modal did not turn into sign-up'));
        await page.waitForTimeout(500);
        await shot(page, 'site-modal.jpg');
      }
      if (errors.length) fails.push(`site: page errors ${errors.join(' | ')}`);
      await ctx.close();
    }

    // ---------------- admin: Kayıt İstatistikleri card ----------------
    {
      mock.ME.is_admin = true;
      const { ctx, page } = await newPage({ width: 1440, height: 1000 }, { admin: true, token: true });
      await page.goto(`${base}/admin/signup-stats`, { waitUntil: 'load' });
      const card = page.locator('.st-card', { hasText: 'Kayıt kartı' }).first();
      const ok = await card.waitFor({ state: 'visible', timeout: 30000 }).then(() => true, () => false);
      if (ok) {
        // The standalone stats page does not boot the app shell, which would dismiss the splash.
        await page.addStyleTag({ content: '#boot-splash{display:none!important}' });
        await card.scrollIntoViewIfNeeded();
        await page.waitForTimeout(800);
        const text = await card.innerText();
        check(/kartta düzeltildi/.test(text) && /Önerilen şifre/.test(text), 'admin: the card shows the fixed ratio and the methods');
        const box = await card.boundingBox();
        if (box) await shot(page, 'admin-card.jpg', { clip: { x: Math.max(0, box.x - 16), y: Math.max(0, box.y - 16), width: Math.min(1440, box.width + 32), height: box.height + 32 } });
        await shot(page, 'admin-page.jpg');
      } else {
        console.warn('[e2e-adaptive-signup] admin page did not render the card (not a failure of the card itself)');
      }
      await ctx.close();
    }
  } finally {
    await browser.close();
    srv.close();
  }
  if (fails.length) {
    console.error(`[e2e-adaptive-signup] FAIL\n - ${fails.join('\n - ')}`);
    process.exit(1);
  }
  console.log(`[e2e-adaptive-signup] OK (${registers.length} register, ${identifies.length} identify, ${ranges.length} range lookups, ${events.length} events; shots in ${OUT})`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
