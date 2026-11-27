'use strict';

/**
 * Growth 3B "Önce insanlar" end to end: the real built app against the local mock backend
 * (e2e/perf/mockBackend.cjs) with the growth 3B API answered from fixtures.cjs. Every
 * non-local URL is aborted; synthetic data only.
 *
 *   - Settings › Bildirimler (desktop, dark + light): five type cards, important people 3/8,
 *     the person drawer with the live preview; "Sessiz katıl" as the main button is saved
 *     and the preview follows; the quiet-hours footnote; a server level change
 *   - iPhone: important faces, types, limits; tapping a face opens the same drawer as a sheet
 *   - Settings › Seri ve görevler: personal streak, shared streaks, three tasks about people
 *   - Home: the day-7 call card; "Çağır" sends the (edited) message, the card confirms
 *   - Admin › Yeniden kazanma: campaign list, workspace, RU open rate flagged, preview;
 *     "Sıradaki dalgayı şimdi gönder" -> the live window; recall needs a reason; friend-call panel
 *
 *   VITE_API_BASE_URL=http://127.0.0.1:5361 VITE_SOCKET_URL=http://127.0.0.1:5361 npx vite build --outDir dist-e2e
 *   node e2e/reengage/reengage.e2e.cjs [--dist=dist-e2e] [--out=DIR] [--shots=DIR]
 */

const fs = require('fs');
const path = require('path');
const mock = require('../perf/mockBackend.cjs');
const { fixtures, uid } = require('./fixtures.cjs');

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
const pw = require(process.env.PLAYWRIGHT_CORE || 'playwright-core');
const DIST = path.resolve(args.dist || path.join(__dirname, '../../dist-e2e'));
const OUT = path.resolve(args.out || '/tmp/descall-reengage-e2e');
const SHOTS = args.shots ? path.resolve(args.shots) : null;
const PORT = Number(args.port || 5361);
const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const COLORS = { ece: '#f05a5a', kaan: '#4b7bff', zeynep: '#e0559b', mert: '#2fbf71', elif: '#9b5de5', can: '#13a8c4', selin: '#f5a524', arda: '#f08a24', demir: '#d4a017' };
const avatarSvg = (name) => `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128"><rect width="128" height="128" fill="${COLORS[name] || '#587af5'}"/><text x="64" y="84" font-family="Arial" font-size="60" font-weight="700" fill="#fff" text-anchor="middle">${(name[0] || '?').toUpperCase()}</text></svg>`;

function check(cond, msg, fails) {
  if (!cond) fails.push(msg);
}

async function main() {
  if (!fs.existsSync(path.join(DIST, 'index.html'))) throw new Error(`no build at ${DIST}`);
  fs.mkdirSync(OUT, { recursive: true });
  if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
  Object.assign(mock.ME, { username: 'admin', displayName: 'Demir', display_name: 'Demir', isAdmin: true, is_admin: true });
  const srv = await mock.start({ dist: DIST, port: PORT });
  const base = `http://127.0.0.1:${srv.port}`;
  const browser = await pw.chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ['--no-sandbox'] });
  const fails = [];
  const calls = [];

  async function context({ phone = false, theme = 'dark' } = {}) {
    const F = fixtures(base);
    const ctx = await browser.newContext({
      viewport: phone ? { width: 393, height: 852 } : { width: 1440, height: 960 },
      deviceScaleFactor: 2,
      ...(phone ? { isMobile: true, hasTouch: true, userAgent: IPHONE_UA } : {}),
      locale: 'tr-TR',
      timezoneId: 'Europe/Istanbul',
      colorScheme: theme,
    });
    await ctx.route('**/*', async (r) => {
      const req = r.request();
      const raw = req.url();
      if (/^(data|blob):/.test(raw)) return r.continue();
      const url = new URL(raw);
      if (url.origin !== base) return r.abort();
      const p = url.pathname;
      const json = (body, status = 200) => r.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
      if (p.startsWith('/e2e-assets/av-')) return r.fulfill({ status: 200, contentType: 'image/svg+xml', body: avatarSvg(p.slice(15)) });
      if (req.resourceType() === 'document') return r.continue();
      let body = {};
      try { body = req.postDataJSON() || {}; } catch { body = {}; }
      const method = req.method();
      const log = () => calls.push({ method, path: p, body });
      if (/^(\/api)?\/admin\/step-up$/.test(p) && method === 'POST') return json({ token: 'e2e-step-up', expiresInSec: 900 });
      if (p === '/api/notify-center') return json(F.center);
      if (/^\/api\/notify-center\/people\/[^/]+\/next$/.test(p)) return json(F.next);
      let m = p.match(/^\/api\/notify-center\/people\/([^/]+)$/);
      if (m) {
        log();
        const person = F.center.people.find((x) => x.id === m[1]);
        const next = { ...person.prefs, ...body };
        if (body.mute) next.mutedUntil = body.mute === 'off' ? null : new Date(Date.now() + 8 * 3600e3).toISOString();
        person.prefs = next;
        return json({ ok: true, person: next, badge: next.important ? 'always' : 'default', dmPref: null });
      }
      if (p === '/api/notify-center/settings') { log(); Object.assign(F.center.settings, body); return json({ ok: true, settings: F.center.settings }); }
      if (/^\/api\/servers\/[^/]+\/me\/settings$/.test(p)) { log(); return json({ notificationLevel: body.notificationLevel }); }
      if (p === '/api/streaks') return json(F.streaks);
      if (/^\/api\/streaks\//.test(p)) { log(); return json({ ok: true }); }
      if (p === '/api/winback/suggestion') return json(F.suggestion);
      if (/^\/api\/winback\/[^/]+\/(call|dismiss)$/.test(p)) { log(); return json({ ok: true, sent: true, mode: 'live' }); }
      if (p === '/api/reengage/t/open') { log(); return json({ ok: true }); }
      m = p.match(/^(?:\/api)?\/admin\/growth\/reengage(\/.*)?$/);
      if (m) {
        const sub = m[1] || '';
        if (method !== 'GET') log();
        if (!sub) return json(F.overview);
        if (sub === '/outcomes') return json(F.outcomes);
        if (sub === '/friend-call') return json(F.friendCall);
        if (sub === '/settings') return json({ ok: true, console: F.overview.console, mode: F.overview.mode });
        if (/\/preview$/.test(sub)) return json(F.preview);
        if (/\/send$/.test(sub)) return json({ ok: true, wave: { ...F.live.wave, status: 'running' }, undoMs: 30000 });
        if (/\/test$/.test(sub)) return json({ ok: true, push: true, email: true });
        if (/\/recall$/.test(sub)) return json(body.reason ? { ok: true, recalled: 42, opened: 19 } : { error: 'reason_required', code: 'reason_required' }, body.reason ? 200 : 400);
        if (/^\/waves\//.test(sub)) return json(F.live);
        if (/^\/campaigns\/[^/]+$/.test(sub)) {
          if (method === 'PATCH') return json({ ok: true, campaign: F.workspace.campaign });
          const id = sub.split('/')[2];
          const c = F.overview.campaigns.find((x) => x.id === id) || F.overview.campaigns[1];
          return json({ ...F.workspace, campaign: { ...F.workspace.campaign, ...c, templates: F.workspace.campaign.templates, log: [] } });
        }
      }
      if (/\/admin\/growth\/retention$/.test(p)) return json({ days: 30, cohorts: [], funnel: {}, kpis: {}, series: [] });
      return r.continue();
    });
    await ctx.addInitScript(([api, me, t]) => {
      window.__DESCALL_API_URL__ = api; window.__DESCALL_SOCKET_URL__ = api;
      localStorage.setItem('descall_language', 'tr');
      localStorage.setItem('descall:ios-pwa-install-dismissed', '1');
      localStorage.setItem('descall:cookie_consent_v1', JSON.stringify({ choice: 'rejected', at: new Date().toISOString() }));
      localStorage.setItem('descall_token', 'e2e.fake.token');
      localStorage.setItem('descall_user', JSON.stringify(me));
      localStorage.setItem('descall_theme', t);
    }, [base, mock.ME, theme]);
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e.message || e)));
    return { ctx, page, errors, F };
  }

  const settle = async (page, theme) => {
    await page.waitForFunction(() => !document.querySelector('#boot-splash, .boot-splash, [data-boot-splash]'), null, { timeout: 15000 }).catch(() => {});
    await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
    await page.addStyleTag({ content: '.app-notif-banner{display:none!important} *{animation-play-state:paused!important;transition:none!important}' }).catch(() => {});
    await page.waitForTimeout(900);
  };
  const shot = async (page, name, opts = {}) => {
    const file = path.join(OUT, `${name}.png`);
    await page.screenshot({ path: file, ...opts });
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `growth-reengage-${name}.jpg`), type: 'jpeg', quality: 88, ...opts });
  };

  try {
    // ---- 1. Settings › Bildirimler, desktop dark + light ----------------------------
    for (const theme of ['dark', 'light']) {
      const { ctx, page, errors } = await context({ theme });
      await page.goto(`${base}/settings/notifications`, { waitUntil: 'load' });
      await settle(page, theme);
      await page.locator('.rg-center .rg-types').waitFor({ timeout: 20000 });
      check((await page.locator('.rg-type').count()) === 5, `${theme}: five type cards`, fails);
      check((await page.locator('.rg-grp').first().innerText()).includes('3 / 8'), `${theme}: important 3 / 8`, fails);
      await page.locator('.rg-prow', { hasText: 'Ece' }).first().click();
      await page.locator('.rg-drawer .rg-dname', { hasText: 'Ece' }).waitFor({ timeout: 8000 });
      const live = await page.locator('.rg-live-h b').innerText();
      check(live.includes("Ece'nin bildirimi"), `${theme}: live preview title (${live})`, fails);
      await page.waitForTimeout(500);
      const foot = await page.locator('.rg-dcol.rg-live .rg-foot').innerText();
      check(/yarın 09:00 sonrası/.test(foot), `${theme}: quiet-hours footnote (${foot})`, fails);
      if (theme === 'dark') {
        await page.locator('.rg-drawer .rg-seg button', { hasText: 'Sessiz katıl' }).first().click();
        await page.waitForTimeout(400);
        const put = calls.filter((c) => c.method === 'PUT' && /people/.test(c.path)).pop();
        check(put && put.body.primaryAction === 'quiet_join', 'main button saved as quiet join', fails);
        check((await page.locator('.rg-notif-cta').first().innerText()).includes('Sessiz katıl'), 'preview follows the main button', fails);
      }
      await page.locator('.rg-drawer .rg-dname').scrollIntoViewIfNeeded();
      await shot(page, `1-merkez-${theme}`, { fullPage: false });
      if (theme === 'dark') {
        await page.locator('.rg-prow', { hasText: 'Kodlama Kulübü' }).first().click();
        await page.locator('.rg-drawer.srv').waitFor({ timeout: 5000 });
        await page.locator('.rg-drawer.srv .rg-seg button', { hasText: 'Tümü' }).click();
        await page.waitForTimeout(300);
        check(calls.some((c) => /\/me\/settings$/.test(c.path) && c.body.notificationLevel === 'all'), 'server level saved', fails);
        await page.locator('.rg-pill').first().click();
        await page.locator('.rg-pop').waitFor({ timeout: 4000 });
        await shot(page, '2-sessiz-saat', { fullPage: false });
        await page.keyboard.press('Escape');
      }
      if (errors.length) fails.push(`${theme} settings page errors: ${errors.join(' | ')}`);
      await ctx.close();
    }

    // ---- 2. Seri ve görevler (desktop) ------------------------------------------------
    {
      const { ctx, page, errors } = await context({});
      await page.goto(`${base}/settings/streaks`, { waitUntil: 'load' });
      await settle(page, 'dark');
      await page.locator('.rg-streaks .rg-mine').waitFor({ timeout: 20000 });
      check((await page.locator('.rg-task').count()) === 3, 'three tasks', fails);
      const t2 = await page.locator('.rg-task').nth(1).innerText();
      check(t2.includes("Kaan'a yaz, seriyi kurtar"), `task about a person (${t2})`, fails);
      check((await page.locator('.rg-duo').count()) === 3, 'three shared streaks', fails);
      await page.locator('.rg-duo', { hasText: 'Zeynep' }).locator('button', { hasText: 'Dürt' }).click();
      await page.waitForTimeout(300);
      check(calls.some((c) => /\/api\/streaks\/.+\/nudge$/.test(c.path)), 'nudge sent', fails);
      await shot(page, '3-seriler', { fullPage: false });
      if (errors.length) fails.push(`streaks errors: ${errors.join(' | ')}`);
      await ctx.close();
    }

    // ---- 3. iPhone: center + sheet, home call card ---------------------------------------
    {
      const { ctx, page, errors } = await context({ phone: true });
      await page.goto(`${base}/settings/notifications`, { waitUntil: 'load' });
      await settle(page, 'dark');
      await page.locator('.rg-center.phone .rg-faces').waitFor({ timeout: 20000 });
      check((await page.locator('.rg-faces button').count()) === 4, 'three faces + Ekle', fails);
      await shot(page, '4-telefon-merkez', { fullPage: false });
      await page.locator('.rg-faces button', { hasText: 'Ece' }).click();
      await page.locator('.rg-sheet .rg-drawer').waitFor({ timeout: 5000 });
      await shot(page, '5-telefon-cekmece', { fullPage: false });
      await page.goto(`${base}/direct`, { waitUntil: 'load' });
      await settle(page, 'dark');
      await page.locator('.rg-wb').waitFor({ timeout: 20000 });
      const title = await page.locator('.rg-wb-h b').first().innerText();
      check(title.includes('Arda 7 gündür yok'), `call card title (${title})`, fails);
      await shot(page, '6-telefon-cagri', { fullPage: false });
      await page.locator('.rg-wb-msg').click();
      await page.locator('textarea.rg-wb-msg').fill('Arda, Gece Kuşları açık, gel.');
      await page.locator('.rg-wb .rg-btn.primary').click();
      await page.locator('.rg-wb.done').waitFor({ timeout: 5000 });
      const callReq = calls.find((c) => /\/api\/winback\/.+\/call$/.test(c.path));
      check(callReq && callReq.body.message === 'Arda, Gece Kuşları açık, gel.', 'the edited message is sent', fails);
      if (errors.length) fails.push(`phone errors: ${errors.join(' | ')}`);
      await ctx.close();
    }

    // ---- 4. Admin › Yeniden kazanma ---------------------------------------------------------
    {
      const { ctx, page, errors } = await context({});
      await page.goto(`${base}/admin/panel?tab=reengage`, { waitUntil: 'load' });
      await settle(page, 'dark');
      await page.locator('.rg-console .rg-crow').first().waitFor({ timeout: 30000 });
      check((await page.locator('.rg-crow').count()) === 6, 'six campaigns', fails);
      await page.locator('.rg-lrow', { hasText: 'Русский' }).waitFor({ timeout: 10000 });
      check((await page.locator('.rg-lrow .rt.rg-tone-bad').count()) === 1, 'RU open rate stands out', fails);
      await page.locator('.rg-userprev .rg-notif').waitFor({ timeout: 8000 });
      const head = await page.locator('.rg-console-h p').innerText();
      check(head.includes('412 gönderim') && head.includes('net +9'), `header line (${head})`, fails);
      await shot(page, '7-admin-konsol', { fullPage: false });
      await page.locator('.rg-btn.primary', { hasText: 'Sıradaki dalgayı' }).click();
      await page.locator('.rg-modal .rg-btn.primary').click();
      await page.locator('.rg-live-win').waitFor({ timeout: 8000 });
      await page.waitForTimeout(600);
      await page.locator('.rg-reasons button', { hasText: 'Yanlış içerik' }).click();
      await page.locator('.rg-recall input').fill('RU metninde sunucu adı çevrilmemiş');
      await shot(page, '8-canli-takip', { fullPage: false });
      await page.locator('.rg-recall .rg-btn.danger').click();
      await page.waitForTimeout(500);
      const recall = calls.find((c) => /\/recall$/.test(c.path));
      check(recall && recall.body.reason === 'content' && /RU metninde/.test(recall.body.note), 'recall with a reason', fails);
      await page.locator('.rg-live-win .rg-icon-btn').last().click();
      await page.locator('.rg-crow', { hasText: 'Arkadaştan çağrı' }).click();
      await page.locator('.rg-fc').waitFor({ timeout: 8000 });
      await shot(page, '9-arkadastan-cagri', { fullPage: false });
      if (errors.length) fails.push(`admin errors: ${errors.join(' | ')}`);
      await ctx.close();
    }
  } finally {
    await browser.close();
    srv.close();
  }
  if (fails.length) {
    console.error(`reengage e2e: ${fails.length} failure(s)\n - ${fails.join('\n - ')}`);
    process.exit(1);
  }
  console.log(`reengage e2e: ok (shots in ${OUT})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
