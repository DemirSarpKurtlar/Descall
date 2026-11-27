'use strict';

/**
 * Davet Merkezi (growth phase 4, 4A) in a real browser with a mocked backend: every /api
 * request is answered here (Playwright routes) with the draft's synthetic sample data.
 *
 *   Desktop 1440x932 dark + light: Davet Merkezi (funnel, link + QR, share buttons with
 *   channel tags, milestones, live table + segment filter, wallet popover, "Neden?",
 *   Dürt -> ready message in the DM draft + navigation, landing preview).
 *   Phone 390x844: Davet et (ring, five share tiles, mini funnel, live list).
 *   Landing /r/ece (desktop + phone): anonymous open with channel, email check, hand-off.
 *   Invited friend's first entry (phone): say hi, gift steps, server join, add friend.
 *   Admin board: six numbers, alert, funnel + measurement, top inviters -> right panel,
 *   revoke dialog (reason, the user's text = draft text, POST body), rules dialog, undo.
 *
 *   node e2e/invites/capture.cjs [--out=dir] [--dist=/tmp/growth-invites/e2e-dist] [--no-build]
 */

const fs = require('fs');
const path = require('path');
const assert = require('node:assert/strict');

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
const FRONT = path.resolve(__dirname, '../..');
const OUT = path.resolve(args.out || process.env.DESCALL_E2E_SHOTS || '/tmp/descall-invites-e2e');
const DIST = path.resolve(args.dist || '/tmp/descall-invites-dist');
let pw;
try {
  pw = require(process.env.PLAYWRIGHT_CORE || 'playwright-core');
} catch {
  pw = require('playwright');
}

const U = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const now = Date.now();
const H = 3600000;
const ago = (h) => new Date(now - h * H).toISOString();
const QR = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 29 29" shape-rendering="crispEdges"><path fill="#fff" d="M0 0h29v29H0z"/><path stroke="#0b0c12" d="M1 1.5h7m2 0h1m1 0h2m3 0h1m2 0h7M1 2.5h1m5 0h1m1 0h3m2 0h1m3 0h1m1 0h1m5 0h1M1 3.5h1m1 0h3m1 0h1m2 0h2m1 0h3m3 0h1m1 0h3m1 0h1M1 4.5h1m1 0h3m1 0h1m1 0h1m2 0h1m2 0h3m1 0h1m1 0h3m1 0h1M1 5.5h1m1 0h3m1 0h1m1 0h2m1 0h2m3 0h1m1 0h1m1 0h3m1 0h1M1 6.5h1m5 0h1m2 0h3m1 0h1m1 0h2m1 0h1m5 0h1M1 7.5h7m1 0h1m1 0h1m1 0h1m1 0h1m1 0h1m1 0h7M9 8.5h1m1 0h4m1 0h2M1 9.5h1m1 0h5m2 0h1m4 0h2m1 0h5m1 0h2M2 10.5h2m1 0h1m3 0h4m1 0h1m2 0h2m3 0h1m2 0h1M1 11.5h3m2 0h3m1 0h1m2 0h3m2 0h2m1 0h4M3 12.5h1m1 0h1m3 0h2m3 0h1m1 0h2m1 0h3m3 0h1M1 13.5h2m3 0h3m3 0h2m3 0h1m2 0h3m1 0h1M2 14.5h3m2 0h2m3 0h1m2 0h2m2 0h1m1 0h2m1 0h2M1 15.5h1m2 0h4m1 0h1m1 0h1m1 0h3m2 0h1m1 0h1m1 0h3M2 16.5h1m3 0h1m2 0h1m2 0h2m1 0h2m3 0h2m2 0h2M1 17.5h2m2 0h3m2 0h3m2 0h1m1 0h2m1 0h4M2 18.5h1m1 0h1m2 0h3m2 0h1m2 0h1m3 0h1m1 0h1m1 0h2M1 19.5h1m1 0h4m1 0h2m1 0h2m1 0h7m2 0h2M9 20.5h1m2 0h1m3 0h1m3 0h1m1 0h3M1 21.5h7m1 0h2m1 0h1m2 0h2m1 0h1m1 0h1m1 0h1m1 0h2M1 22.5h1m5 0h1m2 0h1m2 0h3m2 0h1m3 0h2M1 23.5h1m1 0h3m1 0h1m1 0h3m1 0h1m1 0h6m1 0h3M1 24.5h1m1 0h3m1 0h1m2 0h2m3 0h3m1 0h2m1 0h1M1 25.5h1m1 0h3m1 0h1m1 0h1m1 0h1m2 0h1m1 0h1m1 0h4m1 0h1M1 26.5h1m5 0h1m1 0h1m1 0h2m2 0h1m1 0h2m2 0h2M1 27.5h7m1 0h2m2 0h3m1 0h1m2 0h1m1 0h2"/></svg>';

const user = (n, username, displayName) => ({ id: U(n), username, displayName, avatarUrl: null });
const friend = (o) => ({ canNudge: false, nudgedAt: null, legacy: false, inviterSkip: null, rewardPaid: false, reward: 100, waiting: false, why: null, unlockAt: null, countdownMs: null, online: null, ...o });

function dashboard() {
  return {
    username: 'ece',
    displayName: 'Ece',
    link: 'https://descall.com/r/ece',
    qrSvg: QR,
    paused: false,
    totals: { earned: 600, pending: 200 },
    funnel: {
      opened: 41, openedToday: 6, signedUp: 12, firstMessage: 8, active: 6,
      rates: { signup: 29, firstMessage: 67, active: 75 },
      series: {
        opened: [1, 2, 1, 3, 2, 4, 3, 2, 5, 4, 6, 6], signedUp: [0, 1, 0, 1, 1, 2, 1, 1, 2, 1, 1, 1],
        firstMessage: [0, 0, 1, 1, 0, 1, 1, 1, 1, 0, 1, 1], active: [0, 0, 0, 1, 0, 1, 0, 1, 1, 0, 1, 1],
      },
    },
    channels: [{ channel: 'wa', signups: 7, pct: 58 }, { channel: 'ig', signups: 3, pct: 25 }, { channel: 'tt', signups: 2, pct: 17 }],
    milestones: { count: 6, next: 10, list: [{ at: 3, amount: 250, kind: 'badge', reached: true, claimed: true, left: 0 }, { at: 10, amount: 750, kind: 'frame', reached: false, claimed: false, left: 4 }, { at: 25, amount: 2000, kind: 'banner', reached: false, claimed: false, left: 19 }] },
    friends: [
      friend({ id: U(301), user: user(11, 'kaan', 'Kaan Yılmaz'), online: 'online', channel: 'wa', signupAt: ago(18), stage: 3, waiting: true, status: 'waiting_return', why: 'next_day', countdownMs: 14 * H - 60000 }),
      friend({ id: U(302), user: user(12, 'zeynep', 'Zeynep Arslan'), online: 'online', channel: 'ig', signupAt: ago(72), stage: 4, status: 'paid', rewardPaid: true }),
      friend({ id: U(303), user: user(13, 'mert', 'Mert Doğan'), online: 'idle', channel: 'tt', signupAt: ago(5), stage: 2, status: 'waiting_message', why: 'first_message', canNudge: true }),
      friend({ id: U(304), user: user(14, 'selin', 'Selin Kaya'), channel: 'wa', signupAt: ago(144), stage: 4, status: 'paid', rewardPaid: true }),
      friend({ id: U(305), user: user(15, 'nisa_2207', 'nisa_2207'), channel: 'link', signupAt: ago(2), stage: 3, status: 'reviewing', why: 'same_device' }),
      friend({ id: U(306), user: user(16, 'arda', 'Arda Çelik'), channel: 'wa', signupAt: ago(200), stage: 4, status: 'paid', rewardPaid: true }),
      friend({ id: U(307), user: user(17, 'yusuf', 'Yusuf Bulut'), channel: 'ig', signupAt: ago(260), stage: 4, status: 'paid', rewardPaid: true }),
      friend({ id: U(308), user: user(18, 'defne', 'Defne Kurt'), channel: 'wa', signupAt: ago(300), stage: 4, status: 'paid', rewardPaid: true }),
      friend({ id: U(309), user: user(19, 'naz', 'Naz Tekin'), channel: 'wa', signupAt: ago(320), stage: 4, status: 'paid', rewardPaid: true }),
      friend({ id: U(310), user: user(20, 'onur', 'Onur Aksoy'), channel: 'tt', signupAt: ago(30), stage: 2, status: 'waiting_message', why: 'first_message', nudgedAt: ago(3) }),
      friend({ id: U(311), user: user(21, 'irem', 'İrem Güneş'), channel: 'wa', signupAt: ago(400), stage: 2, status: 'expired' }),
      friend({ id: U(312), user: user(22, 'emre', 'Emre Çelik'), channel: 'ig', signupAt: ago(420), stage: 2, status: 'expired' }),
    ],
    anonymous: { opens: 3, byChannel: { wa: 2, tt: 1 } },
    wallet: [
      { id: U(301), user: user(11, 'kaan', 'Kaan Yılmaz'), amount: 100, status: 'waiting_return', why: 'next_day', countdownMs: 14 * H - 60000 },
      { id: U(303), user: user(13, 'mert', 'Mert Doğan'), amount: 100, status: 'waiting_message', why: 'first_message', countdownMs: 67 * H },
      { id: U(305), user: user(15, 'nisa_2207', 'nisa_2207'), amount: 100, status: 'reviewing', why: 'same_device', countdownMs: null },
    ],
    month: { paid: 6, cap: 20 },
    rules: { version: 12, inviterReward: 100, inviteeReward: 50, returnAfterHours: 24, returnWindowHours: 72, monthlyCap: 20, requireFirstMessage: true },
    notices: [],
  };
}

function landing() {
  return {
    inviter: { username: 'ece', displayName: 'Ece', avatarUrl: null, online: 'online', activity: { kind: 'voice', count: 3, serverName: 'Gece Kuşları', people: [{ name: 'Kaan' }, { name: 'Zeynep' }, { name: 'Selin' }] } },
    paused: false,
    gifts: { inviteeReward: 50, inviterReward: 100, badge: true, friendship: true },
    rules: { returnAfterHours: 24, requireFirstMessage: true },
  };
}

function welcome() {
  const signup = new Date(now - 3 * 60000);
  return {
    invited: true,
    me: { username: 'can', displayName: 'Can' },
    inviter: { ...user(10, 'ece', 'Ece'), online: 'online', inVoice: true, friend: 'friend' },
    gift: {
      amount: 50, status: 'waiting_message', why: 'first_message', unlockAt: new Date(signup.getTime() + 24 * H).toISOString(), expiresAt: null,
      steps: [{ key: 'account', done: true, at: signup.toISOString() }, { key: 'first_message', done: false, at: null }, { key: 'return', done: false, at: new Date(signup.getTime() + 24 * H).toISOString() }],
    },
    server: { id: U(900), name: 'Gece Kuşları', iconUrl: null, online: 18, inviterInVoice: true, voiceCount: 3, joined: false },
    friends: [
      { ...user(11, 'kaan', 'Kaan Yılmaz'), online: 'online', place: { kind: 'voice', serverName: 'Gece Kuşları' }, friend: null, mutualServers: 1 },
      { ...user(12, 'zeynep', 'Zeynep Arslan'), online: 'online', place: null, friend: null, mutualServers: 2 },
    ],
    friendsTotal: 4,
  };
}

const ADMIN_USERS = [
  [31, 'kaan.yilmaz', 'Kaan Yılmaz', 214, 22, 14, 64, 8, 'low'],
  [32, 'zeynep.arslan', 'Zeynep Arslan', 160, 15, 11, 73, 5, 'low'],
  [33, 'bora.aksoy', 'Bora Aksoy', 96, 19, 2, 11, 82, 'high'],
  [34, 'elif.sahin', 'Elif Şahin', 88, 9, 7, 78, 4, 'low'],
  [35, 'mert.dogan', 'Mert Doğan', 73, 7, 5, 71, 31, 'medium'],
  [36, 'selin.kaya', 'Selin Kaya', 51, 6, 4, 67, 6, 'low'],
];

function overview(state) {
  return {
    range: '30d',
    kpis: {
      opens: { value: 1284, delta: 18 },
      signups: { value: 96, rate: 7.5, delta: 12 },
      firstMessage: { value: 58, rate: 60, baseline: 42 },
      active: { value: 41, rate: 71 },
      paid: { value: 5700, count: 38, inviterReward: 100, inviteeReward: 50 },
      held: { value: 9, inviters: 3, protected: 1200 },
    },
    alert: state.alertGone ? null : { id: U(700), at: ago(1), inviter: user(33, 'bora.aksoy', 'Bora Aksoy'), signups: 9, factor: 6, sameDevice: 7, windowMinutes: 60, held: 9 },
    openAlerts: state.alertGone ? 0 : 1,
    funnel: { opened: 1284, signups: 96, firstMessage: 58, returned: 41, paid: 38, held: 3, rates: { signup: 7.5, firstMessage: 60, returned: 71, paid: 40 } },
    top: ADMIN_USERS.map(([n, username, displayName, opens, signups, active, ret, risk, band]) => ({ inviterId: U(n), user: user(n, username, displayName), opens, signups, firstMessage: active + 2, active, held: band === 'high' ? 9 : 0, returnRate: ret, risk, band })),
    channels: [{ channel: 'wa', opens: 612, signups: 54, active: 26 }, { channel: 'ig', opens: 388, signups: 23, active: 9 }, { channel: 'tt', opens: 201, signups: 14, active: 4 }, { channel: 'qr', opens: 83, signups: 5, active: 2 }],
    shield: [
      { code: 'same_device', count: 7, action: 'hold' }, { code: 'same_subnet', count: 12, action: 'warn' }, { code: 'disposable_email', count: 5, action: 'deny' },
      { code: 'fast_first_message', count: 2, action: 'hold' }, { code: 'inviter_only', count: 4, action: 'warn' },
    ],
    rules: { version: state.rulesVersion, createdAt: ago(30), inviterReward: 100, inviteeReward: 50, requireFirstMessage: true, returnAfterHours: 24, returnWindowHours: 72, monthlyCap: 20, minInviterAgeDays: 7, fastMessageSeconds: 10, highRiskHold: 70, milestones: [{ at: 3, amount: 250, kind: 'badge', itemId: null }, { at: 10, amount: 750, kind: 'frame', itemId: null }, { at: 25, amount: 2000, kind: 'banner', itemId: null }], inviteeItemId: null, signals: { same_device: 'hold', inviter_device: 'hold', same_subnet: 'warn', disposable_email: 'deny', fast_first_message: 'hold', inviter_only: 'warn' }, anomaly: { windowMinutes: 60, minSignups: 5, multiplier: 6 } },
    log: [
      { id: 'a:1', at: new Date(now - 20 * 60000).toISOString(), kind: 'auto_hold', actor: 'system', system: true, inviter: 'bora.aksoy', count: 9, amount: 0, actionId: U(801), undoable: false },
      { id: 'a:2', at: new Date(now - 52 * 60000).toISOString(), kind: 'rules', actor: 'demir', system: false, diff: [{ key: 'monthlyCap', from: 25, to: 20 }], version: 12, actionId: U(802), undoable: true },
      { id: 'p:3', at: new Date(now - 67 * 60000).toISOString(), kind: 'paid', actor: null, system: true, inviter: 'kaanyz', invitee: 'can.ozturk', amount: 150 },
      { id: 'a:4', at: new Date(now - 162 * 60000).toISOString(), kind: 'release', actor: 'ayse', system: false, inviter: 'mert.dgn', count: 1, actionId: U(804), undoable: false },
    ],
    measurement: { signups: 640, invitedSignups: 120, inviteShare: { value: 18.8, start: 15, target: 25 }, invitedFirstMessage: { value: 60, start: 42, target: 65 }, notInvitedFirstMessage: 42 },
    paused: 0,
  };
}

function inviterPanel() {
  const inv = (n, username, chips, status = 'held', paidAmount = 0) => ({ id: U(600 + n), user: user(400 + n, username, username), status, signupAt: ago(3), chips, clean: !chips.length && status === 'paid', risk: chips.length * 30, amount: 100, paidAmount, legacy: false, holdReason: 'same_device' });
  return {
    user: { ...user(33, 'bora.aksoy', 'Bora Aksoy'), createdAt: ago(32 * 24), country: 'Türkiye', online: null },
    risk: { score: 82, band: 'high', cluster: { label: 'a3f9', size: 7 }, disposable: 3, fast: 2, fastestSeconds: 4 },
    counts: { opens: 96, signups: 19, firstMessage: 11, active: 2, held: 9, pending: 4 },
    invitees: [
      inv(1, 'nisa_2207', [{ kind: 'device', label: 'a3f9' }, { kind: 'fast', seconds: 4 }], 'paid', 100),
      inv(2, 'kral.oyuncu41', [{ kind: 'device', label: 'a3f9' }, { kind: 'tempmail' }], 'paid', 100),
      inv(3, 'efe.yy', [{ kind: 'device', label: 'a3f9' }, { kind: 'subnet' }], 'paid', 100),
      inv(4, 'deniz.k', [], 'paid', 100),
      ...Array.from({ length: 15 }, (_, i) => inv(10 + i, `hesap${i + 1}`, i < 4 ? [{ kind: 'device', label: 'a3f9' }] : [], i < 4 ? 'paid' : 'held', i < 4 ? 100 : 0)),
    ],
    suggested: { ids: [U(601), U(602), U(603), U(610), U(611), U(612), U(613)], amount: 700 },
    paused: false,
    milestones: [],
    actions: [],
    language: 'tr',
    rulesVersion: 12,
    monthlyCap: 20,
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
  const shot = async (page, name, opts = {}) => (await page.waitForTimeout(450), page.screenshot({ path: path.join(OUT, `${name}.jpg`), type: 'jpeg', quality: 90, ...opts }));

  const open = async ({ view = 'center', theme = 'dark', phone = false, query = '' } = {}) => {
    const log = { nudges: [], opens: [], attach: [], posts: [], reads: [], joins: [], friendReqs: [] };
    const state = { alertGone: false, rulesVersion: 12 };
    const ctx = await browser.newContext({
      viewport: phone ? { width: 390, height: 844 } : view === 'admin' ? { width: 1600, height: 1250 } : { width: 1440, height: 932 },
      deviceScaleFactor: 2,
      locale: 'tr-TR',
      timezoneId: 'Europe/Istanbul',
      colorScheme: theme,
      ...(phone ? { isMobile: true, hasTouch: true } : {}),
    });
    await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'https://harness.local' }).catch(() => {});
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
      // adminFetch calls `${apiBase()}/admin/...`, the rest `/api/...`.
      const p = url.pathname.replace(/^\/admin\//, '/api/admin/');
      const method = req.method();
      const json = (body, status = 200) => r.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
      const body = () => JSON.parse(req.postData() || '{}');
      if (method === 'OPTIONS') return r.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' }, body: '' });
      if (p === '/api/invites/me') return json(dashboard());
      if (p === '/api/invites/landing/ece') return json(landing());
      if (p.startsWith('/api/invites/landing/')) return json({ error: 'This invite link is not valid.', code: 'INVITE_NOT_FOUND' }, 404);
      if (p === '/api/invites/open') {
        log.opens.push(body());
        return json({ ok: true, openId: U(990), channel: body().channel });
      }
      if (p === '/api/invites/welcome') return json(welcome());
      if (p.startsWith('/api/invites/nudge/')) {
        log.nudges.push(p.split('/').pop());
        return json({ text: 'Selam Mert Doğan! Descall\'a hoş geldin. Bir merhaba yaz, sohbet hazır.', friend: { id: U(13), username: 'mert', displayName: 'Mert Doğan' } });
      }
      if (p === '/api/invites/notices/read') return json({ ok: true });
      if (p.startsWith('/api/servers/discover/')) {
        log.joins.push(p);
        return json({ server: { id: U(900), name: 'Gece Kuşları' } });
      }
      if (p.startsWith('/api/friends/')) {
        log.friendReqs.push(body());
        return json({ ok: true });
      }
      if (p === '/api/admin/invites/overview') return json(overview(state));
      if (p.startsWith('/api/admin/invites/inviter/') && method === 'GET') return json(inviterPanel());
      if (p === '/api/admin/invites/preview') {
        const sp = url.searchParams;
        const n = Number(sp.get('count'));
        const suffix = { 7: "7'si", 4: "4'ü", 3: "3'ü" }[n] || `${n}'i`;
        return json({ lang: 'tr', text: `Davetlerinden ${suffix} incelendi ve ödül şartlarını karşılamadı (aynı cihazdan açılmış hesaplar). ${sp.get('amount')} D geri alındı. Hata olduğunu düşünüyorsan Destek'e yazabilirsin.` });
      }
      if (p.startsWith('/api/admin/invites/') && method === 'POST') {
        log.posts.push({ p, b: body() });
        if (p.includes('/alerts/')) state.alertGone = true;
        if (p.includes('/undo')) return json({ undone: true, restored: 7, refunded: 700 });
        return json({ actionId: U(880), count: 7, amount: 700, undoUntil: new Date(now + 600000).toISOString() });
      }
      if (p === '/api/admin/invites/rules' && method === 'GET') return json({ current: { version: state.rulesVersion }, versions: [{ version: 12, at: ago(30), note: 'aylık sınır' }, { version: 11, at: ago(200), note: null }], reasons: ['same_device'] });
      if (p === '/api/admin/invites/rules' && method === 'PUT') {
        log.posts.push({ p, b: body() });
        state.rulesVersion += 1;
        return json({ version: state.rulesVersion, diff: [{ key: 'monthlyCap', from: 20, to: 25 }], actionId: U(881) });
      }
      if (p === '/api/admin/invites/log') return json({ items: overview(state).log.map((l) => ({ ...l, id: l.actionId || l.id })) });
      return json({});
    });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => console.log('pageerror', e.message));
    await page.goto(`https://harness.local/?view=${view}&theme=${theme}&mode=${phone ? 'phone' : 'desk'}${query}`);
    return { ctx, page, log };
  };

  // ---------------- Davet Merkezi, desktop dark
  await check('desktop: dashboard numbers, link, milestones, live table', async () => {
    const { ctx, page, log } = await open({});
    await page.waitForSelector('[data-testid="dvt-center"]');
    const text = await page.textContent('[data-testid="dvt-center"]');
    for (const s of ['Davet Merkezi', 'Bağlantı açıldı', '41', '+6 bugün', '%29 açılıştan', 'descall.com/r/ece', 'kanal etiketli', 'WhatsApp %58', 'Instagram %25', 'TikTok %17', 'Kilometre taşları', '3 · Bağlantı rozeti', '4 kaldı', '2. gün dönüşü · 14 sa', 'İlk mesajı bekleniyor', 'İnceleniyor · aynı cihaz', '3 açılış, kayıt yok', 'WhatsApp 2 · TikTok 1', 'ayda en çok 20']) {
      assert.ok(text.includes(s), `missing "${s}"`);
    }
    await shot(page, 'growth-invites-center-desktop-dark');
    // Segment filter.
    await page.getByRole('tab', { name: /İnceleniyor/ }).click();
    assert.equal(await page.locator('[data-testid="dvt-friend"]').count(), 1);
    await page.getByRole('tab', { name: /Hepsi/ }).click();
    // Wallet popover.
    await page.click('[data-testid="dvt-wallet-chip"]');
    await page.waitForSelector('[data-testid="dvt-wallet"]');
    const w = await page.textContent('[data-testid="dvt-wallet"]');
    assert.ok(w.includes('14 sa sonra açılır') && w.includes('İlk mesajını bekliyor') && w.includes('Bu ay 6/20'), w);
    await shot(page, 'growth-invites-wallet');
    await page.keyboard.press('Escape');
    // Neden?
    await page.click('[data-testid="dvt-why"]');
    assert.ok((await page.textContent('.dvt-why')).includes('cihazdan açıldı'));
    await page.getByRole('button', { name: 'Kapat' }).last().click();
    // Landing preview.
    await page.click('[data-testid="dvt-preview"]');
    await page.waitForSelector('[data-testid="dvt-preview-win"] [data-testid="dvt-landing"]');
    await shot(page, 'growth-invites-preview');
    await page.keyboard.press('Escape');
    // Dürt: ready message in the DM draft + navigation to the DM.
    await page.click('[data-testid="dvt-nudge"]');
    await page.waitForFunction(() => (window.__nav || []).length > 0);
    assert.deepEqual(log.nudges, ['00000000-0000-4000-8000-000000000303']);
    const nav = await page.evaluate(() => window.__nav);
    assert.equal(nav[0], '/direct/mert');
    const draft = await page.evaluate(() => JSON.stringify(localStorage));
    assert.ok(draft.includes('Bir merhaba yaz'), 'ready message saved as the DM draft');
    await ctx.close();
  });

  await check('desktop: light theme', async () => {
    const { ctx, page } = await open({ theme: 'light' });
    await page.waitForSelector('[data-testid="dvt-center"]');
    await shot(page, 'growth-invites-center-desktop-light');
    await ctx.close();
  });

  await check('phone: Davet et (ring, share tiles, mini funnel, live list)', async () => {
    const { ctx, page } = await open({ phone: true });
    await page.waitForSelector('[data-testid="dvt-center"]');
    const text = await page.textContent('[data-testid="dvt-center"]');
    for (const s of ['Davet et', 'Köprü çerçevesine 4 arkadaş', '+750 D ve destansı avatar çerçevesi', 'Açıldı', 'Kayıt', 'İlk mesaj', 'Aktif', 'Canlı takip', 'Tümü 12', 'Kayıt oldu, henüz yazmadı', 'Dürt']) {
      assert.ok(text.includes(s), `missing "${s}"`);
    }
    assert.equal(await page.locator('.dvt-shr.big .dvt-sh').count(), 5);
    await shot(page, 'growth-invites-center-phone');
    await ctx.close();
  });

  await check('phone light', async () => {
    const { ctx, page } = await open({ phone: true, theme: 'light' });
    await page.waitForSelector('[data-testid="dvt-center"]');
    await shot(page, 'growth-invites-center-phone-light');
    await ctx.close();
  });

  // ---------------- Landing
  await check('landing: desktop, open counted with channel, email check, hand-off', async () => {
    const { ctx, page, log } = await open({ view: 'landing', query: '&k=wa' });
    await page.waitForSelector('[data-testid="dvt-landing"]');
    const text = await page.textContent('[data-testid="dvt-landing"]');
    for (const s of ["Ece seni Descall'a", 'davet etti', 'Ece şu an çevrimiçi', 'Gece Kuşları sunucusunda sesli sohbette · 3 kişi', '50 D hoş geldin hediyesi', "Ece'nin davetiyle", 'Ece ile hazır arkadaşlık', 'Ücretsiz hesap oluştur', 'Google ile devam et', 'Apple ile devam et', 'E-postayla kayıt ol', '@ece', 'Ece de o zaman 100 D kazanır']) {
      assert.ok(text.includes(s), `missing "${s}"`);
    }
    await page.waitForFunction(() => true);
    await page.waitForTimeout(300);
    assert.equal(log.opens.length, 1);
    assert.equal(log.opens[0].channel, 'wa');
    await shot(page, 'growth-invites-landing-desktop');
    await page.click('button[type="submit"]');
    assert.ok((await page.textContent('[data-testid="dvt-landing"]')).includes('Geçerli bir e-posta'));
    await page.fill('input[type="email"]', 'can@example.com');
    await page.click('button[type="submit"]');
    const s = await page.evaluate(() => ({ signup: window.__signup, ref: sessionStorage.getItem('descall:inviteRef'), open: localStorage.getItem('descall:inviteOpen') }));
    assert.equal(s.signup.method, 'email');
    assert.equal(s.ref, 'ece');
    assert.ok(s.open.includes('"channel":"wa"') && s.open.includes('990'), s.open);
    await ctx.close();
  });

  await check('landing: phone + invalid link', async () => {
    const { ctx, page } = await open({ view: 'landing', phone: true });
    await page.waitForSelector('[data-testid="dvt-landing"]');
    await shot(page, 'growth-invites-landing-phone', { fullPage: true });
    await ctx.close();
    const b = await open({ view: 'landing', query: '&u=nobody' });
    await b.page.waitForFunction(() => (document.querySelector('[role="alert"]')?.textContent || '').includes('geçerli'));
    const alertText = await b.page.textContent('[role="alert"]');
    assert.ok(alertText.includes('geçerli değil'), alertText);
    await b.ctx.close();
  });

  // ---------------- Invited friend's first entry
  await check('welcome: phone (say hi, gift steps, server, friends)', async () => {
    const { ctx, page, log } = await open({ view: 'welcome', phone: true });
    await page.waitForSelector('[data-testid="dvt-welcome"]');
    const text = await page.textContent('[data-testid="dvt-welcome"]');
    for (const s of ['Hoş geldin, Can', 'Ece ile arkadaşsınız', "Ece'ye merhaba de", 'Selam Ece, geldim!', 'Hangi sunucudasın?', 'Hediyen', 'Hesabını açtın', 'İlk mesajını gönder', 'şimdi', 'Yarın tekrar uğra', 'Gece Kuşları', '18 çevrimiçi', 'Ece ve 2 kişi seslide', "Ece'nin arkadaşları burada", '4 kişi', 'Kaan Yılmaz', '2 ortak sunucu']) {
      assert.ok(text.includes(s), `missing "${s}"`);
    }
    await shot(page, 'growth-invites-welcome-phone');
    await page.getByRole('button', { name: 'Ekle' }).first().click();
    await page.waitForTimeout(200);
    assert.equal(log.friendReqs.length, 1);
    await page.click('text=Selam Ece, geldim!');
    const nav = await page.evaluate(() => window.__nav);
    assert.equal(nav[0], '/direct/ece');
    await ctx.close();
  });

  await check('welcome: desktop light', async () => {
    const { ctx, page } = await open({ view: 'welcome', theme: 'light' });
    await page.waitForSelector('[data-testid="dvt-welcome"]');
    await shot(page, 'growth-invites-welcome-desktop-light');
    await ctx.close();
  });

  // ---------------- Admin
  await check('admin: board, panel, revoke with the user text, undo, rules', async () => {
    const { ctx, page, log } = await open({ view: 'admin' });
    await page.waitForSelector('[data-testid="dvt-panel"]');
    const text = await page.textContent('[data-testid="dvt-admin"]');
    for (const s of ['Davet ödülleri', 'Açılış', '1.284', '+%18 · 30 gün', 'Davetle kayıt', '%7,5 açılıştan', '%60 · genel %42', '5.700', '38 ödül · 100 + 50', '1.200 D korundu', 'Olağan dışı:', "son 1 saatte 9 kayıt getirdi (normalin 6 katı); 7'si aynı cihaz parmak izinden", 'Davet hunisi', 'davetsiz kayıtta ilk mesaj %42', '2. gün döndü', '3 bekletildi', 'Ölçüm', 'hedef %25', 'hedef %65', 'En çok davet edenler', 'Yüksek 82', 'Kanal karnesi', '612 → 54 → 26', 'Kötüye kullanım kalkanı', 'Aynı cihaz parmak izi', 'Kayıt → mesaj < 10 sn', 'Ödül yok', 'v12 · yayında', 'İlk mesaj + 2. gün', '≥ 7 gün', '3 · 10 · 25', 'İşlem kaydı', '9 ödülü bekletti · @bora.aksoy', 'aylık sınır 25 → 20', '@kaanyz → @can.ozturk · 150 D', 'Bora Aksoy', 'Yüksek risk', '7 hesap tek cihaz kümesi (a3f9)', 'Davet ettikleri · 19', 'cihaz a3f9', 'tempmail', 'aynı /24', 'aktif · temiz', '+15 hesap daha', 'Beklet (4)', 'Geri al…', 'Bağlantıyı durdur', 'Kullanıcı dosyası', 'Yasakla']) {
      assert.ok(text.replace(/ /g, ' ').includes(s), `missing "${s}"`);
    }
    await shot(page, 'growth-invites-admin', { fullPage: true });
    await page.click('[data-testid="dvt-revoke-open"]');
    await page.waitForSelector('[data-testid="dvt-action-dialog"]');
    await page.waitForFunction(() => (document.querySelector('[data-testid="dvt-user-preview"]')?.textContent || '').includes('incelendi'));
    const pv = await page.textContent('[data-testid="dvt-user-preview"]');
    assert.equal(pv, "Davetlerinden 7'si incelendi ve ödül şartlarını karşılamadı (aynı cihazdan açılmış hesaplar). 700 D geri alındı. Hata olduğunu düşünüyorsan Destek'e yazabilirsin.");
    const dlg = await page.textContent('[data-testid="dvt-action-dialog"]');
    assert.ok(dlg.includes('Ödülleri geri al · 7 davet') && dlg.includes("Bora Aksoy'un göreceği") && dlg.includes("Bora Aksoy'a bildir") && dlg.includes('Geri al: 700 D'), dlg);
    await shot(page, 'growth-invites-admin-revoke');
    await page.getByRole('radio', { name: 'Diğer' }).click();
    assert.ok(await page.locator('[data-testid="dvt-action-confirm"]').isDisabled(), 'Diğer needs a note');
    await page.getByRole('radio', { name: 'Aynı cihaz kümesi' }).click();
    await page.click('[data-testid="dvt-action-confirm"]');
    await page.waitForFunction(() => !document.querySelector('[data-testid="dvt-action-dialog"]'));
    const rev = log.posts.find((x) => x.p.endsWith('/revoke'));
    assert.equal(rev.b.reason, 'same_device');
    assert.equal(rev.b.ids.length, 7);
    assert.equal(rev.b.notifyInviter, true);
    assert.ok(rev.b.message.includes("7'si incelendi"));
    await page.getByRole('button', { name: 'Geri al' }).last().click();
    await page.waitForTimeout(300);
    assert.ok(log.posts.some((x) => x.p.includes('/undo')), 'undo from the toast');
    await page.click('[data-testid="dvt-rules-btn"]');
    await page.waitForSelector('[data-testid="dvt-rules-dialog"]');
    await shot(page, 'growth-invites-admin-rules');
    await page.locator('[data-testid="dvt-rules-dialog"] input[type="number"]').nth(2).fill('25');
    await page.getByRole('button', { name: /Yayınla \(v13\)/ }).click();
    await page.waitForTimeout(300);
    const put = log.posts.find((x) => x.p.endsWith('/rules'));
    assert.equal(put.b.rules.monthlyCap, 25);
    await ctx.close();
  });

  await check('admin: light theme', async () => {
    const { ctx, page } = await open({ view: 'admin', theme: 'light' });
    await page.waitForSelector('[data-testid="dvt-panel"]');
    await shot(page, 'growth-invites-admin-light');
    await ctx.close();
  });

  await browser.close();
  console.log(fails.length ? `\n${fails.length} failed` : '\nall invites e2e checks passed');
  process.exit(fails.length ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
