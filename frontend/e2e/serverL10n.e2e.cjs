'use strict';

/**
 * Localized server content (draft C) in the real built app, desktop and iPhone.
 *
 * The API side is the real backend: routes/servers.js (with the localization
 * middleware) and routes/adminServerTranslations.js on an in-memory fake database seeded
 * with the live rows of the official server (backend/test/fixtures/descallCommunityLive.cjs)
 * and the real seed (backend/content/descallCommunityL10n.js). The browser only talks to
 * 127.0.0.1; every other URL is aborted. Synthetic users, public server content only.
 *
 * Desktop 1280x800:
 *   1. app language pt-BR: the channel list shows "# regras", "Comece aqui", "Lobby",
 *      the header "#regras", the pinned rules in Portuguese with the PT marker and
 *      "#ajuda" resolved by channel id
 *   2. "Ver original" shows the Turkish original, survives a reload (session), back
 *   3. app language English: "# rules", the rules in English; channel search finds
 *      "kurallar" and "rules" (hub search on the phone, see 5)
 *   4. Turkish: originals only, no marker
 *   5. admin editor (Topluluk çevirileri): coverage per language, live preview desktop +
 *      phone in pt-BR shows "regras" and the Portuguese pinned message, an inline edit
 *      updates the preview and the coverage before saving, "Taslak çevir" explains the
 *      missing key
 * iPhone 390x844: pt-BR channel list "regras", open #regras, Portuguese rules, toggle.
 * Screenshots (desktop + phone, tr and pt-BR) go to --out.
 *
 *   VITE_API_BASE_URL=http://127.0.0.1:5361 VITE_SOCKET_URL=http://127.0.0.1:5361 npx vite build --outDir dist-e2e
 *   node e2e/serverL10n.e2e.cjs [--dist=dist-e2e] [--out=/tmp/descall-server-l10n-e2e]
 */

process.env.JWT_SECRET = process.env.JWT_SECRET || 'e2e-secret-do-not-use-in-prod';
process.env.SUPABASE_URL = 'https://placeholder.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'placeholder-key';
process.env.NODE_ENV = 'test';
delete process.env.ANTHROPIC_API_KEY;

const fs = require('fs');
const path = require('path');
const http = require('http');

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
const pw = require(process.env.PLAYWRIGHT_CORE || 'playwright-core');
const DIST = path.resolve(args.dist || path.join(__dirname, '../dist-e2e'));
const OUT = path.resolve(args.out || process.env.DESCALL_E2E_SHOTS || '/tmp/descall-server-l10n-e2e');
const PORT = Number(args.port || 5361);
const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

const backend = path.join(__dirname, '../backend');
const { createFakeSupabase } = require(path.join(backend, 'test/fakeSupabase.cjs'));
const live = require(path.join(backend, 'test/fixtures/descallCommunityLive.cjs'));
const content = require(path.join(backend, 'content/descallCommunityL10n.js'));
const pushPath = require.resolve(path.join(backend, 'lib/webPush'));
require.cache[pushPath] = { id: pushPath, filename: pushPath, loaded: true, exports: new Proxy({}, { get: () => async () => ({ ok: true }) }) };
const P = require(path.join(backend, 'lib/serverPermissions'));
const big = (b) => P.toPgBigint(b);

const SID = live.SERVER.id;
const CH = content.CHANNELS;
const READER = { id: '00000000-0000-4000-8000-000000000201', username: 'joana', display_name: 'Joana' };
const ADMIN = { id: '00000000-0000-4000-8000-000000000208', username: 'admin', display_name: 'Admin' };
const NOW = '2026-11-28T17:00:00.000Z';
const EVERYONE = `${SID}-everyone`;
const originalOf = (kind, ref) => {
  if (kind === 'server_name') return live.SERVER.name;
  if (kind === 'server_description') return live.SERVER.description;
  if (kind === 'message') return live.MESSAGES.find((m) => m.id === ref)?.content ?? null;
  const ch = live.CHANNELS.find((c) => c.id === ref);
  return kind === 'channel_name' ? ch?.name ?? null : ch?.topic ?? null;
};

const fake = createFakeSupabase({
  users: [
    { id: live.SERVER.owner_id, username: 'demir', display_name: 'Demir', active_sessions: [{ id: 's-owner' }] },
    { ...READER, active_sessions: [{ id: 's-reader' }] },
    { ...ADMIN, is_admin: true, is_super_admin: true, active_sessions: [{ id: 's-admin' }] },
  ],
  servers: [{ ...live.SERVER, icon_url: null, community_enabled: false, verification_level: 'none', created_at: NOW, updated_at: NOW }],
  server_members: [live.SERVER.owner_id, READER.id, ADMIN.id].map((u, i) => ({ server_id: SID, user_id: u, joined_at: NOW, list_position: i })),
  server_roles: [{ id: EVERYONE, server_id: SID, is_everyone: true, position: 0, permissions: big(P.EVERYONE_DEFAULT) }],
  server_member_roles: [],
  server_channels: live.CHANNELS.map((c) => ({ ...c, slowmode_seconds: 0, nsfw: false, created_at: NOW })),
  server_channel_overrides: [CH['ekip-sohbet'], CH['mod-kayitlari'], CH['ekip-odasi']].map((id, i) => ({ id: `o${i}`, channel_id: id, target_type: 'role', target_id: EVERYONE, allow_permissions: '0', deny_permissions: big(P.Permissions.VIEW_CHANNEL) })),
  server_messages: live.MESSAGES.map((m) => ({ ...m, reply_to: null, pinned_by: m.pinned_at ? live.SERVER.owner_id : null, system_kind: null, system_meta: null })),
  server_message_reactions: [],
  server_invites: [],
  server_bans: [],
  server_audit_logs: [],
  server_content_l10n: [{ server_id: SID, enabled: true, source_locale: 'tr', updated_at: NOW, updated_by_username: 'seed' }],
  server_content_translations: content.seedRows().map((r, i) => ({ id: i + 1, server_id: SID, kind: r.kind, ref_id: r.refId, locale: r.locale, text: r.text, source_text: originalOf(r.kind, r.refId), updated_at: NOW, updated_by_username: 'seed' })),
  admin_audit: [],
});
const supabasePath = require.resolve(path.join(backend, 'db/supabase'));
require.cache[supabasePath] = { id: supabasePath, filename: supabasePath, loaded: true, exports: fake };

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain', '.mp3': 'audio/mpeg', '.wav': 'audio/wav' };
const API_RE = /^\/(api|auth|friends|groups|servers|calls|media|dm|reports|reactions|admin|health|maintenance|users|notifications|activity|analytics|store|shop|push|me|settings|blocks|presence)(\/|$)/;

function meOf(u) {
  return { id: u.id, username: u.username, displayName: u.display_name, display_name: u.display_name, birthDate: '2000-05-05', emailVerified: true, language: 'en', blockedUsers: [], status: 'online', ...(u === ADMIN ? { is_admin: true, isAdmin: true } : {}) };
}

async function startServer() {
  const express = require(require.resolve('express', { paths: [backend] }));
  const { Server } = require(require.resolve('socket.io', { paths: [backend] }));
  const { signToken, verifyToken } = require(path.join(backend, 'config/jwt'));
  const { requireAuth } = require(path.join(backend, 'middleware/auth'));
  const app = express();
  app.use((req, res, next) => {
    res.setHeader('access-control-allow-origin', '*');
    res.setHeader('access-control-allow-headers', '*');
    res.setHeader('access-control-allow-methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    if (req.method === 'OPTIONS') return res.status(204).end();
    return next();
  });
  app.use(express.json());
  const io = { to: () => ({ emit() {} }), in: () => ({ emit() {}, fetchSockets: async () => [], socketsJoin() {}, socketsLeave() {} }), emit() {}, of() { return io; }, fetchSockets: async () => [], sockets: { adapter: { rooms: new Map() }, sockets: new Map() } };
  app.set('io', io);
  const who = (req) => {
    try {
      const d = verifyToken(String(req.headers.authorization || '').replace(/^Bearer\s+/i, ''));
      return d?.sub === ADMIN.id ? ADMIN : READER;
    } catch {
      return READER;
    }
  };
  app.get(['/auth/me', '/api/auth/me'], (req, res) => res.json({ user: meOf(who(req)) }));
  app.get('/admin/me/permissions', (req, res) => {
    const { GRANTABLE_SECTIONS } = require(path.join(backend, 'lib/adminPermissions'));
    res.json({ owner: true, sections: ['overview', ...GRANTABLE_SECTIONS, 'staff'], grantable: GRANTABLE_SECTIONS });
  });
  app.post('/admin/step-up', (_req, res) => res.json({ token: 'e2e-step-up', expiresInSec: 900 }));
  app.use('/api/servers', require(path.join(backend, 'routes/servers')));
  const admin = express.Router();
  admin.use(requireAuth);
  admin.use(require(path.join(backend, 'routes/adminServerTranslations')));
  // /admin/panel itself is a page of the app, the rest of /admin the API.
  app.use('/admin', (req, res, next) => (String(req.headers.accept || '').startsWith('text/html') ? next() : admin(req, res, next)));
  // Everything else the app asks for at boot: empty but well-formed.
  app.use((req, res, next) => {
    const accept = String(req.headers.accept || '');
    if (!API_RE.test(req.path) || accept.startsWith('text/html')) return next();
    const last = req.path.split('/').filter(Boolean).pop() || 'items';
    const out = { items: [], friends: [], requests: [], servers: [], groups: [], conversations: [], messages: [], notifications: [], prefs: {}, popup: null };
    if (!(last in out)) out[last] = [];
    res.json(out);
  });
  app.use((req, res) => {
    const file = path.join(DIST, decodeURIComponent(req.path));
    if (req.path !== '/' && file.startsWith(DIST) && fs.existsSync(file) && fs.statSync(file).isFile()) {
      res.setHeader('content-type', MIME[path.extname(file)] || 'application/octet-stream');
      return fs.createReadStream(file).pipe(res);
    }
    res.setHeader('content-type', 'text/html; charset=utf-8');
    return fs.createReadStream(path.join(DIST, 'index.html')).pipe(res);
  });
  const server = http.createServer(app);
  const sio = new Server(server, { cors: { origin: '*' } });
  sio.on('connection', (socket) => {
    socket.emit('connected', { user: meOf(READER), message: 'ok' });
    socket.emit('friend:list', []);
    socket.emit('friend:requests', []);
    socket.on('app:ping', (ack) => { if (typeof ack === 'function') ack(Date.now()); });
  });
  await new Promise((r) => server.listen(PORT, '127.0.0.1', r));
  return {
    port: server.address().port,
    tokens: {
      reader: signToken({ id: READER.id, username: READER.username, sid: 's-reader' }),
      admin: signToken({ id: ADMIN.id, username: ADMIN.username, sid: 's-admin' }),
    },
    close: () => { sio.close(); server.close(); },
  };
}

async function main() {
  if (!fs.existsSync(path.join(DIST, 'index.html'))) throw new Error(`no build at ${DIST}`);
  fs.mkdirSync(OUT, { recursive: true });
  const srv = await startServer();
  const base = `http://127.0.0.1:${srv.port}`;
  const browser = await pw.chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ['--no-sandbox'] });
  const fails = [];
  const errors = [];
  const shots = [];

  const newCtx = async (opts, { lang, as = 'reader' } = {}) => {
    const ctx = await browser.newContext({ ...opts, locale: lang === 'tr' ? 'tr-TR' : lang === 'pt-BR' ? 'pt-BR' : 'en-US', timezoneId: 'Europe/Istanbul', colorScheme: 'dark' });
    await ctx.route('**/*', (r) => {
      const url = r.request().url();
      if (/^(data|blob):/.test(url) || url.startsWith(base)) return r.continue();
      return r.abort();
    });
    const user = as === 'admin' ? meOf(ADMIN) : meOf(READER);
    await ctx.addInitScript(([api, me, token, l]) => {
      window.__DESCALL_API_URL__ = api; window.__DESCALL_SOCKET_URL__ = api;
      if (!sessionStorage.getItem('e2e-lang-set')) {
        localStorage.setItem('descall_language', l);
        sessionStorage.setItem('e2e-lang-set', '1');
      }
      localStorage.setItem('descall:ios-pwa-install-dismissed', '1');
      localStorage.setItem('descall:cookie_consent_v1', JSON.stringify({ choice: 'rejected', at: new Date().toISOString() }));
      localStorage.setItem('descall_token', token);
      localStorage.setItem('descall_user', JSON.stringify(me));
    }, [base, user, as === 'admin' ? srv.tokens.admin : srv.tokens.reader, lang]);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(String(e.message || e)));
    return { ctx, page };
  };
  const setLang = (page, l) => page.evaluate((x) => localStorage.setItem('descall_language', x), l);
  const noSplash = (page) => page.waitForFunction(() => !document.querySelector('#boot-splash, .boot-splash, [data-boot-splash]'), null, { timeout: 12000 }).catch(() => {});
  const settle = (page, ms = 900) => page.waitForTimeout(ms);
  const shot = async (page, name) => {
    const p = path.join(OUT, `${name}.png`);
    await page.screenshot({ path: p }).catch(() => {});
    shots.push(p);
  };
  const row = (page, id) => page.locator(`button.server-channel-row[data-channel-id="${id}"]`).first();
  const rowText = async (page, id) => (await row(page, id).innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
  const expect = (cond, msg) => { if (!cond) fails.push(msg); };
  const waitRow = async (page, id, text, label) => {
    const ok = await page.waitForFunction(([sel, want]) => {
      const el = document.querySelector(sel);
      return el && el.textContent.replace(/\s+/g, ' ').includes(want);
    }, [`button.server-channel-row[data-channel-id="${id}"]`, text], { timeout: 20000 }).then(() => true, () => false);
    if (!ok) fails.push(`${label}: channel row shows "${await rowText(page, id)}", expected "${text}" (url ${page.url()})`);
    return ok;
  };
  const RULES_MSG = '81d1ae52-594a-479a-a2b1-2a9a3fff5d2f';
  const msgBody = (page) => page.locator('[data-testid="sl10n-message"]').first();

  try {
    // ---------------- desktop, pt-BR ----------------
    {
      const { ctx, page } = await newCtx({ viewport: { width: 1280, height: 800 } }, { lang: 'pt-BR' });
      await page.goto(`${base}/servers/${SID}/${CH.kurallar}`, { waitUntil: 'load' });
      await noSplash(page);
      if (await waitRow(page, CH.kurallar, 'regras', 'desktop pt-BR')) {
        expect((await rowText(page, CH.genel)).includes('geral'), `desktop pt-BR: #genel shows "${await rowText(page, CH.genel)}"`);
        expect((await rowText(page, CH.lobi)).includes('Lobby'), `desktop pt-BR: Lobi shows "${await rowText(page, CH.lobi)}"`);
        const cats = await page.locator('.server-channel-cat-btn').allInnerTexts();
        expect(cats.some((x) => /Comece aqui/i.test(x)), `desktop pt-BR: categories ${JSON.stringify(cats)}`);
        const title = await page.locator('.header-title-text').first().innerText().catch(() => '');
        expect(/regras/.test(title), `desktop pt-BR: header title "${title}"`);
        const ok = await msgBody(page).waitFor({ timeout: 15000 }).then(() => true, () => false);
        expect(ok, 'desktop pt-BR: no translated official message in #regras');
        if (ok) {
          const text = await msgBody(page).innerText();
          expect(/Regras do servidor/.test(text), `desktop pt-BR: rules not in Portuguese: ${text.slice(0, 120)}`);
          expect(/#ajuda/.test(text) && /#reportar-bugs/.test(text), 'desktop pt-BR: mentions not resolved to the Portuguese channel names');
          const marker = await page.locator('[data-testid="sl10n-message"] [data-testid="sl10n-marker"]').first().getAttribute('data-locale').catch(() => null);
          expect(marker === 'pt-BR', `desktop pt-BR: marker locale ${marker}`);
          await shot(page, 'desktop-pt-BR-regras');
          // Show original, survives a reload in the same session, then back.
          await page.locator('[data-testid="sl10n-message"] [data-testid="sl10n-toggle"]').first().click();
          await settle(page, 400);
          const orig = await msgBody(page).innerText();
          expect(/Sunucu kuralları/.test(orig), 'desktop: "Ver original" did not show the Turkish original');
          expect(/Ver tradução/.test(orig), 'desktop: toggle label did not switch to "Ver tradução"');
          await page.reload({ waitUntil: 'load' });
          await noSplash(page);
          await waitRow(page, CH.kurallar, 'regras', 'desktop reload');
          await msgBody(page).waitFor({ timeout: 15000 }).catch(() => {});
          expect(/Sunucu kuralları/.test(await msgBody(page).innerText().catch(() => '')), 'desktop: the show-original choice was not remembered for the session');
          await page.locator('[data-testid="sl10n-message"] [data-testid="sl10n-toggle"]').first().click().catch(() => fails.push('desktop: toggle missing after reload'));
          await settle(page, 400);
          expect(/Regras do servidor/.test(await msgBody(page).innerText().catch(() => '')), 'desktop: toggle did not go back to the translation');
        }
        // Welcome channel topic in the header.
        await row(page, CH['hos-geldin']).click();
        await settle(page);
        const sub = await page.locator('.header-subtitle').first().innerText().catch(() => '');
        expect(/se apresente em #apresentacoes/.test(sub), `desktop pt-BR: topic "${sub}"`);
        expect(await page.locator('[data-testid="sl10n-topic-toggle"]').count() > 0, 'desktop pt-BR: no marker on the translated topic');
        await shot(page, 'desktop-pt-BR-boas-vindas');
      }

      // ---------------- desktop, English ----------------
      await setLang(page, 'en');
      await page.goto(`${base}/servers/${SID}/${CH.kurallar}`, { waitUntil: 'load' });
      await noSplash(page);
      if (await waitRow(page, CH.kurallar, 'rules', 'desktop en')) {
        await msgBody(page).waitFor({ timeout: 15000 }).catch(() => {});
        const text = await msgBody(page).innerText().catch(() => '');
        expect(/Server rules/.test(text) && /#help/.test(text), `desktop en: rules not in English: ${text.slice(0, 100)}`);
        expect((await rowText(page, CH['hos-geldin'])).includes('welcome'), 'desktop en: #hos-geldin not "welcome"');
        await shot(page, 'desktop-en-rules');
      }

      // ---------------- desktop, Turkish ----------------
      await setLang(page, 'tr');
      await page.goto(`${base}/servers/${SID}/${CH.kurallar}`, { waitUntil: 'load' });
      await noSplash(page);
      if (await waitRow(page, CH.kurallar, 'kurallar', 'desktop tr')) {
        await settle(page, 1500);
        expect(await page.locator('[data-testid="sl10n-marker"]').count() === 0, 'desktop tr: a language marker on original content');
        const body = await page.locator('.message-list').first().innerText().catch(() => '');
        expect(/Sunucu kuralları/.test(body), 'desktop tr: Turkish rules missing');
        await shot(page, 'desktop-tr-kurallar');
      }
      await ctx.close();
    }

    // ---------------- iPhone, pt-BR and tr ----------------
    for (const lang of ['pt-BR', 'tr']) {
      const { ctx, page } = await newCtx({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: IPHONE_UA }, { lang });
      const want = lang === 'tr' ? 'kurallar' : 'regras';
      await page.goto(`${base}/servers/${SID}`, { waitUntil: 'load' });
      await noSplash(page);
      if (await waitRow(page, CH.kurallar, want, `phone ${lang}`)) {
        await shot(page, `phone-${lang}-channels`);
        await row(page, CH.kurallar).click();
        await settle(page);
        if (lang === 'pt-BR') {
          const ok = await msgBody(page).waitFor({ timeout: 15000 }).then(() => true, () => false);
          expect(ok, 'phone pt-BR: no translated message');
          if (ok) {
            expect(/Regras do servidor/.test(await msgBody(page).innerText()), 'phone pt-BR: rules not in Portuguese');
            await shot(page, 'phone-pt-BR-regras');
            await page.locator('[data-testid="sl10n-message"] [data-testid="sl10n-toggle"]').first().tap();
            await settle(page, 400);
            expect(/Sunucu kuralları/.test(await msgBody(page).innerText()), 'phone: "Ver original" did not show the original');
          }
        } else {
          await page.waitForFunction(() => /Sunucu kuralları/.test(document.body.innerText), null, { timeout: 15000 }).catch(() => fails.push('phone tr: Turkish rules missing'));
          await shot(page, 'phone-tr-kurallar');
        }
      }
      await ctx.close();
    }

    // ---------------- admin editor ----------------
    for (const vp of [{ name: 'desktop', viewport: { width: 1440, height: 900 } }, { name: 'phone', viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: IPHONE_UA }]) {
      const { ctx, page } = await newCtx({ ...vp, name: undefined }, { lang: 'tr', as: 'admin' });
      await page.goto(`${base}/admin/panel?tab=serverTranslations`, { waitUntil: 'load' });
      await noSplash(page);
      const ok = await page.locator('[data-testid="slx-coverage"]').waitFor({ timeout: 25000 }).then(() => true, () => false);
      expect(ok, `admin ${vp.name}: editor did not open (url ${page.url()})`);
      if (!ok) await shot(page, `admin-${vp.name}-not-open`);
      if (ok) {
        const pcts = await page.locator('[data-testid^="slx-cov-"]').evaluateAll((els) => els.map((e) => [e.getAttribute('data-testid'), e.getAttribute('data-pct')]));
        expect(pcts.length === 7, `admin ${vp.name}: ${pcts.length} coverage cards`);
        expect(pcts.every(([, p]) => p === '100'), `admin ${vp.name}: coverage ${JSON.stringify(pcts)}`);
        await page.locator('[data-testid="slx-pv-lang-pt-BR"]').click();
        await settle(page, 300);
        const pvList = await page.locator('[data-testid="slx-preview-desktop"] [data-testid="slx-preview-channel"]').allInnerTexts();
        expect(pvList.some((x) => /regras/.test(x)), `admin ${vp.name}: desktop preview channels ${JSON.stringify(pvList.slice(0, 6))}`);
        expect(await page.locator('[data-testid="slx-preview-phone"] [data-testid="slx-preview-channel"]').count() > 0, `admin ${vp.name}: no phone preview`);
        await page.locator(`[data-testid="slx-preview-desktop"] [data-channel-id="${CH.kurallar}"]`).click();
        await settle(page, 300);
        const pin = await page.locator('[data-testid="slx-preview-desktop"] [data-testid="slx-preview-pinned"]').innerText().catch(() => '');
        expect(/Regras do servidor/.test(pin), `admin ${vp.name}: preview pinned message "${pin.slice(0, 80)}"`);
        expect(await page.locator('[data-testid="slx-draft-off"]').count() === 1, `admin ${vp.name}: "Taslak çevir" does not explain the missing key`);
        if (vp.name === 'desktop') {
          await shot(page, 'admin-desktop-editor');
          // Inline edit: clear the pt-BR name of #kurallar -> coverage drops, preview falls back to English.
          const cell = page.locator(`tr[data-kind="channel_name"][data-ref="${CH.kurallar}"] td[data-locale="pt-BR"] [data-testid="slx-cell"]`);
          await cell.click();
          await page.locator('[data-testid="slx-input"]').fill('regras-da-casa');
          await page.locator('[data-testid="slx-commit"]').click();
          await settle(page, 300);
          const pv2 = await page.locator('[data-testid="slx-preview-desktop"] [data-testid="slx-preview-channel"]').allInnerTexts();
          expect(pv2.some((x) => /regras-da-casa/.test(x)), 'admin: the live preview did not follow the unsaved edit');
          expect(/\(1\)/.test(await page.locator('[data-testid="slx-save"]').innerText()), 'admin: save button does not count the unsaved edit');
          await shot(page, 'admin-desktop-edit');
          await page.locator('[data-testid="slx-discard"]').click();
        } else {
          await shot(page, 'admin-phone-editor');
        }
      }
      await ctx.close();
    }
  } finally {
    await browser.close();
    srv.close();
  }
  const relevant = errors.filter((e) => !/ResizeObserver|Failed to fetch|NetworkError|Load failed/i.test(e));
  if (relevant.length) fails.push(`page errors: ${relevant.slice(0, 5).join(' | ')}`);
  if (fails.length) {
    console.error(`[e2e-server-l10n] FAIL\n - ${fails.join('\n - ')}`);
    process.exit(1);
  }
  console.log(`[e2e-server-l10n] OK; ${shots.length} shots in ${OUT}`);
  process.exit(0);
}

main().catch((err) => {
  console.error('[e2e-server-l10n] crashed:', err);
  process.exit(1);
});
