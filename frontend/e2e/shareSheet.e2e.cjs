'use strict';
/**
 * "Paylaş > Descall" share sheet e2e (draft A): serves a build pointed at the mock API on
 * 127.0.0.1:5377, opens /share with a shared payload (3 photos / video, a link, a PDF) and
 * walks compose (recents, tabs, server tree, quality menu, duplicate warning + Çıkar),
 * sending, sent + 10 s undo, partial + retry of only the missing item, offline queue that
 * sends when back online, the Android variant and the light theme. Never leaves the machine.
 *
 * Run from frontend/:
 *   VITE_API_BASE_URL=http://127.0.0.1:5377 VITE_SOCKET_URL=http://127.0.0.1:5377 \
 *     npx vite build --outDir dist-e2e
 *   node e2e/shareSheet.e2e.cjs
 * Env: DESCALL_E2E_DIST (default dist-e2e), PLAYWRIGHT_CORE, CHROME_PATH, DESCALL_E2E_SHOTS.
 * Prints "[share-harness] OK" and exits 0, or FAIL and exits 1.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT_CORE || 'playwright-core');

const DIST = path.resolve(process.env.DESCALL_E2E_DIST || path.join(__dirname, '..', 'dist-e2e'));
const OUT = process.env.DESCALL_E2E_SHOTS || null;
if (OUT) fs.mkdirSync(OUT, { recursive: true });
const SCENES = ['#5b3fc4,#ff8a6b,#ffc58a', '#7cc7ff,#cfeeff,#1f62b0', '#ffb989,#ffe0bd,#c07650', '#0e1433,#3a347e,#141a3d', '', '', '', '#12091f,#587af5,#e8457a'].map((c) => {
  const [a, b, d] = (c || '#587af5,#9b5de5,#2b1d47').split(',');
  return `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="100" height="100" fill="url(#g)"/><path d="M0 70 Q25 55 50 68 T100 62 V100 H0Z" fill="${d}"/>`;
});
const svg = (i) => 'data:image/svg+xml;utf8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice">${SCENES[i]}</svg>`);
const day = 86400000;
const NOW = Date.now();

const TARGETS = {
  recents: ['dm:ece', 'group:og', 'dm:kaan', 'dm:zeynep', 'dm:mert'],
  friends: [
    { conv: 'dm:ece', kind: 'dm', id: 'ece', name: 'Ece Yılmaz', username: 'ece', initials: 'E', presence: 'online', canSend: true, canAttach: true, lastShared: { at: new Date(NOW - day).toISOString(), mediaCount: 3 } },
    { conv: 'dm:kaan', kind: 'dm', id: 'kaan2', name: 'Kaan Demir', username: 'kaan', initials: 'K', presence: 'idle', canSend: true, canAttach: true },
    { conv: 'dm:zeynep', kind: 'dm', id: 'zeynep9', name: 'Zeynep Arslan', username: 'zeynep', initials: 'Z', presence: 'online', canSend: true, canAttach: true },
    { conv: 'dm:mert', kind: 'dm', id: 'mert', name: 'Mert Aydın', username: 'mert', initials: 'M', presence: 'online', canSend: true, canAttach: true },
    { conv: 'dm:demir', kind: 'dm', id: 'demir', name: 'Demir Kaya', username: 'demir', initials: 'D', presence: 'dnd', canSend: true, canAttach: true },
  ],
  groups: [{ conv: 'group:og', kind: 'group', id: 'og', name: 'Oyun Gecesi', initials: 'OG', memberCount: 6, onlineCount: 3, canSend: true, canAttach: true }],
  servers: [
    { id: 'pk', name: 'Pixel Kulübü', initials: 'PK', sendableCount: 3, channels: [
      { conv: 'channel:genel', kind: 'channel', id: 'genel', name: 'genel', serverId: 'pk', serverName: 'Pixel Kulübü', canSend: true, canAttach: true, slowModeSec: 0 },
      { conv: 'channel:foto', kind: 'channel', id: 'foto', name: 'fotoğraflar', serverId: 'pk', serverName: 'Pixel Kulübü', canSend: true, canAttach: true, slowModeSec: 0, lastShared: { at: new Date(NOW - day).toISOString(), mediaCount: 2 } },
      { conv: 'channel:duyuru', kind: 'channel', id: 'duyuru', name: 'duyurular', serverId: 'pk', serverName: 'Pixel Kulübü', canSend: false, canAttach: false, reason: 'announcement' },
      { conv: 'channel:oylama', kind: 'channel', id: 'oylama', name: 'oylama', serverId: 'pk', serverName: 'Pixel Kulübü', canSend: true, canAttach: true, slowModeSec: 30 },
    ] },
    { id: 'ls', name: 'Lo-fi Stüdyo', initials: 'LS', sendableCount: 5, channels: [
      { conv: 'channel:lofi', kind: 'channel', id: 'lofi', name: 'paylaşımlar', serverId: 'ls', serverName: 'Lo-fi Stüdyo', canSend: true, canAttach: true, slowModeSec: 0 },
    ] },
  ],
  limits: { maxItems: 10, maxBytes: 104857600, maxText: 2000, mimes: ['image/jpeg', 'image/png', 'video/mp4', 'application/pdf'] },
};

const state = { mode: 'ok', uploadDelay: 0, hold: null, sends: [], undos: 0 };
const MB = 1024 * 1024;

function json(res, code, body) {
  res.writeHead(code, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' });
  res.end(JSON.stringify(body));
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (req.method === 'OPTIONS') return json(res, 204, {});
  let body = '';
  req.on('data', (d) => { body += d.length < 1e6 ? d : ''; });
  req.on('end', async () => {
    const p = url.pathname;
    if (p === '/api/native/share/targets') return json(res, 200, TARGETS);
    if (p === '/api/native/share/precheck') {
      const b = JSON.parse(body || '{}');
      const results = {};
      for (const c of b.convs || []) results[c] = { canSend: true, canAttach: true, reason: null, slowModeSec: 0, duplicate: c === 'dm:ece' && (b.links || []).length ? { kind: 'link', at: new Date(NOW - day).toISOString() } : null };
      return json(res, 200, { results });
    }
    if (p === '/api/media/upload') {
      if (state.hold) await state.hold;
      if (state.uploadDelay) await new Promise((r) => setTimeout(r, state.uploadDelay));
      return json(res, 200, { url: `https://mock/f/${Math.random().toString(36).slice(2)}`, mediaType: 'image', mimeType: 'image/jpeg', size: 1.2 * MB, originalName: 'x.jpg' });
    }
    if (p === '/api/native/share/send') {
      const b = JSON.parse(body || '{}');
      state.sends.push(b);
      const n = Math.max(1, (b.items || []).length);
      const results = (b.items || []).length ? b.items.map((_, i) => ({ index: i, status: b.sendAt ? 'scheduled' : 'sent', messageId: `m${i}` })) : [{ index: -1, status: 'sent', messageId: 'm' }];
      if (state.mode === 'partial' && b.conv === 'channel:foto') results[Math.min(2, n - 1)] = { index: Math.min(2, n - 1), status: 'failed', reason: 'upload_failed' };
      return json(res, 200, { ok: true, conv: b.conv, results });
    }
    if (p === '/api/native/share/undo') { state.undos += 1; return json(res, 200, { ok: true, removed: 1, failed: 0 }); }
    if (p === '/api/link-preview') return json(res, 200, { ok: true, preview: { siteName: 'rotarehberi.com.tr', title: "Kapadokya'da balon sezonu başladı", image: null } });
    if (p.startsWith('/api/')) return json(res, 404, { error: 'not_found' });
    let f = path.join(DIST, p);
    if (!f.startsWith(DIST) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(DIST, 'index.html');
    const ext = path.extname(f);
    const type = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json', '.png': 'image/png', '.wasm': 'application/wasm' }[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type });
    fs.createReadStream(f).pipe(res);
  });
});

const ITEMS = [
  { id: 'p1', mime: 'image/heic', name: 'IMG_4471.HEIC', size: 4.1 * MB, thumb: svg(2), estimates: { original: 4.1 * MB, high: 1.3 * MB, saver: 0.4 * MB } },
  { id: 'p2', mime: 'image/jpeg', name: 'IMG_4472.JPG', size: 3.6 * MB, thumb: svg(0), estimates: { original: 3.6 * MB, high: 1.2 * MB, saver: 0.4 * MB } },
  { id: 'v1', mime: 'video/quicktime', name: 'IMG_4475.MOV', size: 4.7 * MB, durationMs: 14000, thumb: svg(7), estimates: { original: 4.7 * MB, high: 1.6 * MB, saver: 0.5 * MB } },
  { id: 'l1', kind: 'link', url: 'https://rotarehberi.com.tr/kapadokya-balon', title: "Kapadokya'da balon sezonu başladı", image: svg(2) },
  { id: 'f1', mime: 'application/pdf', name: 'Proje-sunumu.pdf', size: 2.4 * MB, pages: '18 sayfa' },
];

async function open(browser, { variant = 'ios', theme = 'dark', select = [] } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await ctx.addInitScript(({ items, theme }) => {
    localStorage.setItem('descall_token', 'mock-token');
    localStorage.setItem('descall_language', 'tr');
    localStorage.setItem('descall_user_settings', JSON.stringify({ darkMode: theme !== 'light' }));
    window.__descallSharePayload = {
      sourceLabel: 'Fotoğraflar',
      items: items.map((it) => (it.kind === 'link' ? it : { ...it, file: new Blob([new Uint8Array(2048)], { type: 'image/jpeg' }) })),
    };
  }, { items: ITEMS, theme });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await page.goto(`http://127.0.0.1:5377/share?variant=${variant}`);
  await page.waitForSelector('.shs-row', { timeout: 20000 });
  await page.waitForTimeout(400);
  for (const name of select) {
    await page.locator('.shs-row', { hasText: name }).first().click();
  }
  await page.waitForTimeout(500);
  return { ctx, page };
}

const shot = async (page, name) => { if (!OUT) return null; await page.evaluate(() => document.querySelectorAll('.shs-body').forEach((el) => { el.scrollTop = 0; })); await page.waitForTimeout(150); return page.screenshot({ path: path.join(OUT, `ui-share-${name}.jpg`), type: 'jpeg', quality: 88 }); };

(async () => {
  await new Promise((r) => server.listen(5377, '127.0.0.1', r));
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const fails = [];
  const check = (cond, msg) => { if (!cond) { fails.push(msg); console.log('FAIL', msg); } };
  try {
    // 1) Compose (A2)
    let { ctx, page } = await open(browser, { select: ['Ece Yılmaz', 'Oyun Gecesi', 'fotoğraflar'] });
    check(await page.locator('.shs-cta').innerText() === '3 sohbete gönder', 'cta counts 3');
    check((await page.locator('.shs-ameta').innerText()).includes('→'), 'sizes shown');
    check(await page.locator('.shs-bnr.w').count() === 1, 'duplicate warning for Ece');
    await shot(page, '1-compose');
    // 2) Servers tab + quality menu (A3)
    await page.locator('.shs-seg button', { hasText: 'Sunucular' }).click();
    await page.locator('.shs-opt', { hasText: 'Yüksek' }).click();
    await page.waitForTimeout(300);
    check(await page.locator('.shs-row.dis', { hasText: 'duyurular' }).count() === 1, 'announcement channel locked');
    await shot(page, '2-servers-quality');
    await page.locator('.shs-scrim').click();
    // duplicate: remove Ece
    await page.locator('.shs-bnr.w .shs-mini').click();
    check(await page.locator('.shs-cta').innerText() === '2 sohbete gönder', 'Çıkar removes Ece');
    await ctx.close();

    // 3) Sending (A4) then sent with undo
    ({ ctx, page } = await open(browser, { select: ['Ece Yılmaz', 'Oyun Gecesi', 'fotoğraflar'] }));
    let release;
    state.hold = new Promise((r) => { release = r; });
    await page.locator('.shs-cta').click();
    await page.waitForSelector('.shs-ringwrap');
    await page.waitForTimeout(500);
    check((await page.locator('.shs-title').innerText()).includes('Gönderiliyor'), 'sending title');
    await shot(page, '3-sending');
    state.hold = null; release();
    await page.waitForSelector('.shs-undo', { timeout: 15000 });
    check(state.sends.length === 3, `3 sends (got ${state.sends.length})`);
    check(state.sends[0].text.includes('rotarehberi'), 'link goes in the text');
    await shot(page, '4-sent-undo');
    await page.locator('.shs-undo .shs-mini').click();
    await page.waitForSelector('text=Gönderim geri alındı');
    check(state.undos === 3, 'undo per chat');
    await ctx.close();

    // 4) Partial
    state.mode = 'partial'; state.sends = [];
    ({ ctx, page } = await open(browser, { select: ['Ece Yılmaz', 'Oyun Gecesi', 'fotoğraflar'] }));
    await page.locator('.shs-cta').click();
    await page.waitForSelector('text=Kısmen gönderildi', { timeout: 15000 });
    await shot(page, '5-partial');
    state.mode = 'ok';
    await page.locator('.shs-cta', { hasText: 'Başarısızı tekrar dene' }).click();
    await page.waitForSelector('.shs-undo', { timeout: 15000 });
    check(state.sends.at(-1).conv === 'channel:foto' && state.sends.at(-1).items.length === 1, 'retry sends only the missing item');
    await ctx.close();

    // 5) Offline queue
    state.sends = [];
    ({ ctx, page } = await open(browser, { select: ['Ece Yılmaz', 'Oyun Gecesi'] }));
    await ctx.setOffline(true);
    await page.locator('.shs-cta').click();
    await page.waitForSelector('text=İnternet bağlantısı yok', { timeout: 15000 });
    await shot(page, '6-offline');
    await ctx.setOffline(false);
    await page.waitForSelector('.shs-undo', { timeout: 20000 });
    check(state.sends.length === 2, 'queue sends when back online');
    await ctx.close();

    // 6) Android variant + light theme
    ({ ctx, page } = await open(browser, { variant: 'android', select: ['Ece Yılmaz', 'Oyun Gecesi', 'fotoğraflar'] }));
    await shot(page, '7-android');
    await ctx.close();
    ({ ctx, page } = await open(browser, { theme: 'light', select: ['Ece Yılmaz', 'Oyun Gecesi'] }));
    await shot(page, '8-light');
    await ctx.close();
  } catch (e) {
    fails.push(String(e && e.stack || e));
    console.log(e);
  } finally {
    await browser.close();
    server.close();
  }
  console.log(fails.length ? `[share-harness] FAIL ${fails.length}` : '[share-harness] OK');
  process.exit(fails.length ? 1 : 0);
})();
