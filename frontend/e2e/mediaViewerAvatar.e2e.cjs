'use strict';

/**
 * Regression check for the full-screen image viewer header (3.0.0 bug: the
 * top-left sender avatar showed only the letter although the sender has a
 * photo, and the date used the device's US format in a Turkish app).
 *
 * Opens an image in a DM and in a server channel on iPhone, iPad and desktop
 * against the local mock backend (perf/mockBackend.cjs), with the sender's
 * photo known only from the friends list (the message payload has none, as in
 * production). Checks: the viewer shows the photo, a broken avatar URL falls
 * back to the letter, and the date reads "20.10.2026 23:09" in Turkish even
 * on an en-US device (--locale to change the browser locale).
 *
 *   VITE_API_BASE_URL=http://127.0.0.1:5371 VITE_SOCKET_URL=http://127.0.0.1:5371 npx vite build --outDir /tmp/dist-perf
 *   node e2e/mediaViewerAvatar.e2e.cjs --dist=/tmp/dist-perf [--out=/tmp/viewer-avatar] [--engine=webkit|chromium]
 */

const fs = require('fs');
const path = require('path');
const mock = require('./perf/mockBackend.cjs');

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
const pw = require(process.env.PLAYWRIGHT_CORE || 'playwright-core');
const DIST = path.resolve(args.dist || path.join(__dirname, '../dist-perf'));
const OUT = path.resolve(args.out || '/tmp/descall-viewer-avatar');
const ENGINE = String(args.engine || 'webkit');
const PORT = Number(args.port || 5371);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const IPAD_UA = 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const DESKTOP_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
const DEVICES = [
  { name: 'iphone', ctx: { viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: IPHONE_UA } },
  { name: 'ipad', ctx: { viewport: { width: 1024, height: 1366 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: IPAD_UA } },
  { name: 'desktop', ctx: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, userAgent: DESKTOP_UA } },
];

// 2026-10-20 23:09 Europe/Istanbul, as in the bug screenshot.
const AT = '2026-10-20T20:09:00.000Z';
const WANT_DATE = '20.10.2026 23:09';
const AVATAR = '/e2e-media/avatar-peer.svg';
const STRANGER_AVATAR = '/e2e-media/avatar-stranger.svg';
const BROKEN = '/e2e-media/avatar-broken.png';
const PHOTO = '/e2e-media/photo.svg';
// A GIF opens the viewer on its own (no gallery), like the bug screenshot.
const GIF = '/e2e-media/good-night.gif';
const svgAvatar = (a, b) => `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="128" height="128" fill="url(#g)"/><circle cx="64" cy="50" r="24" fill="#fff" opacity=".9"/><ellipse cx="64" cy="118" rx="44" ry="34" fill="#fff" opacity=".9"/></svg>`;
const SVG = {
  [GIF]: '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="640"><rect width="480" height="640" fill="#141a3a"/><circle cx="380" cy="110" r="44" fill="#f4f1d0"/><text x="240" y="330" font-size="64" font-family="sans-serif" fill="#e8e2ff" text-anchor="middle">GIF</text></svg>',
  [AVATAR]: svgAvatar('#ff8a3d', '#d6249f'),
  [STRANGER_AVATAR]: svgAvatar('#1fd1a5', '#2b6cff'),
  [PHOTO]: '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800"><defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffb46b"/><stop offset="1" stop-color="#6b4cff"/></linearGradient></defs><rect width="1200" height="800" fill="url(#s)"/><circle cx="860" cy="300" r="110" fill="#fff4c2"/><path d="M0 620 L260 400 L460 560 L700 330 L1200 640 L1200 800 L0 800Z" fill="#2a1f5c"/></svg>',
};

const PEER = mock.PEER;
const STRANGER = { id: '00000000-0000-4000-8000-000000009999', username: 'sn1pez53', display_name: 'sn1pez53' };

function seedMock(base) {
  // The friend has a photo; message payloads carry none (like production DMs).
  PEER.avatarUrl = base + AVATAR;
  mock.ME.avatarUrl = base + BROKEN; // my own photo is broken → letter fallback
  // The perf mock's '8' permission string has no flags, which keeps the
  // phone channel list on its skeleton; give the owner real flags here.
  mock.SERVERS[0].myPermissions = { isOwner: true, flags: { ADMINISTRATOR: true, VIEW_CHANNEL: true, SEND_MESSAGES: true } };
  const keep = mock.state.messages.slice(-12);
  const img = (id, from, minutes, media = PHOTO) => ({
    id, from: { id: from.id, username: from.username, displayName: from.displayName, display_name: from.displayName, avatarUrl: null },
    to: { id: (from === mock.ME ? PEER : mock.ME).id }, text: '', mediaUrl: base + media, mediaType: 'image',
    timestamp: new Date(Date.parse(AT) + minutes * 60000).toISOString(), editHistory: [], reactions: [],
  });
  mock.state.messages = [img('e2e-img-peer', PEER, 0), img('e2e-img-me', mock.ME, 1), img('e2e-gif-peer', PEER, 2, GIF), ...keep];
}

function channelMessages(base) {
  const row = (id, sender, minutes, media = PHOTO) => ({
    id, sender, sender_id: sender.id, content: '', media_url: base + media, media_type: 'image',
    created_at: new Date(Date.parse(AT) + minutes * 60000).toISOString(), reactions: [],
  });
  return { messages: [
    // A friend: photo known only from the friends list.
    row('e2e-ch-peer', { id: PEER.id, username: PEER.username, display_name: PEER.displayName }, 0),
    // Not a friend: photo comes with the message.
    row('e2e-ch-stranger', { ...STRANGER, avatar_url: base + STRANGER_AVATAR }, 1),
    row('e2e-ch-gif', { ...STRANGER, avatar_url: base + STRANGER_AVATAR }, 2, GIF),
  ], hasMore: false };
}

async function readHeader(page) {
  return page.evaluate(() => {
    const who = document.querySelector('.mv-who');
    if (!who) return null;
    const img = who.querySelector('img.mv-avatar');
    const letter = who.querySelector('.mv-avatar-fallback');
    return {
      img: img ? { src: img.getAttribute('src'), loaded: img.complete && img.naturalWidth > 0 } : null,
      letter: letter ? letter.textContent : null,
      text: (who.querySelector('.mv-who-text')?.innerText || '').replace(/\s+/g, ' ').trim(),
    };
  });
}

async function findImage(page, msgId) {
  return page.evaluate((s) => {
    const imgs = [...document.querySelectorAll('.message-image')];
    const el = document.querySelector(s);
    if (!el) return { n: imgs.length };
    const b = el.getBoundingClientRect();
    if (b.top < 80 || b.bottom > innerHeight - 120) {
      // Scroll only the vertical message list: scrollIntoView would also
      // slide the iPhone's horizontal chat/list panes back to the list.
      let sc = el.parentElement;
      while (sc && !(sc.scrollHeight > sc.clientHeight + 4 && /(auto|scroll)/.test(getComputedStyle(sc).overflowY))) sc = sc.parentElement;
      if (sc) sc.scrollTop += b.top + b.height / 2 - innerHeight / 2;
      return { n: imgs.length, scrolling: true };
    }
    const x = b.left + b.width / 2; const y = b.top + b.height / 2;
    // Wait out the loading skeleton: the image itself must be what a tap hits.
    const hit = document.elementFromPoint(x, y);
    if (hit !== el && !el.contains(hit)) return { n: imgs.length, covered: hit ? `${hit.tagName}.${hit.className}` : null };
    return { x, y, n: imgs.length };
  }, `[data-message-id="${msgId}"] .message-image`);
}

async function openImage(page, msgId, device) {
  let last = null;
  const t0 = Date.now();
  while (Date.now() - t0 < 30000) {
    // Two equal reads 300 ms apart: the list may still be settling / auto-scrolling.
    const a = await findImage(page, msgId);
    await sleep(300);
    const box = await findImage(page, msgId);
    last = box;
    if (!a.x || !box.x || Math.abs(a.y - box.y) > 1) { await sleep(300); continue; }
    if (device.ctx.hasTouch) await page.touchscreen.tap(box.x, box.y);
    else await page.mouse.click(box.x, box.y);
    try {
      await page.waitForSelector('.mv-who', { timeout: 2500 });
      await sleep(900);
      return;
    } catch { console.log(`[viewer-avatar]   (${device.name}) tap on ${msgId} did not open the viewer, retrying`); }
  }
  throw new Error(`image ${msgId} could not be opened: ${JSON.stringify(last)}`);
}

async function nextImage(page) {
  const before = await readHeader(page);
  await page.keyboard.press('ArrowRight');
  const t0 = Date.now();
  while (Date.now() - t0 < 4000) {
    const h = await readHeader(page);
    if (h && h.text !== before?.text) break;
    await sleep(150);
  }
  await sleep(700);
}

async function runDevice(browser, base, device) {
  const ctxOpts = { ...device.ctx, locale: String(args.locale || 'en-US'), timezoneId: 'Europe/Istanbul', colorScheme: 'dark' };
  if (ENGINE !== 'chromium') delete ctxOpts.isMobile;
  const ctx = await browser.newContext(ctxOpts);
  await ctx.route('**/*', (r) => {
    const url = r.request().url();
    if (/^(data|blob):/.test(url)) return r.continue();
    if (!url.startsWith(base)) return r.abort();
    const p = new URL(url).pathname;
    if (SVG[p]) return r.fulfill({ status: 200, contentType: 'image/svg+xml', body: SVG[p] });
    if (p === BROKEN) return r.fulfill({ status: 404, contentType: 'text/plain', body: 'nope' });
    if (/^\/api\/servers\/s-perf-0\/channels\/[^/]+\/messages$/.test(p)) return r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(channelMessages(base)) });
    return r.continue();
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
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message || e)));
  const results = [];
  const check = async (label, expect) => {
    const want = expect.date || WANT_DATE;
    const h = await readHeader(page);
    const fails = [];
    if (!h) fails.push('viewer header missing');
    else {
      if (expect.avatar) {
        if (!h.img) fails.push(`no avatar photo (letter "${h.letter}")`);
        else if (!h.img.src.endsWith(expect.avatar)) fails.push(`avatar src ${h.img.src}`);
        else if (!h.img.loaded) fails.push('avatar photo not loaded');
      } else if (!h.letter || h.img) fails.push(`expected letter fallback, got ${JSON.stringify(h)}`);
      if (expect.letter && h.letter !== expect.letter) fails.push(`letter ${h.letter} != ${expect.letter}`);
      if (!h.text.includes(want)) fails.push(`date "${h.text}" lacks ${want}`);
      if (expect.name && !h.text.startsWith(expect.name)) fails.push(`name "${h.text}" != ${expect.name}`);
    }
    const shot = path.join(OUT, `${device.name}-${label}.png`);
    await page.screenshot({ path: shot });
    results.push({ device: device.name, label, ok: !fails.length, fails, header: h, shot });
    console.log(`[viewer-avatar] ${fails.length ? 'FAIL' : 'ok  '} ${device.name.padEnd(8)} ${label.padEnd(20)} ${h ? (h.img ? 'photo' : `letter=${h.letter}`) : '-'} | ${h?.text || ''}${fails.length ? `\n    - ${fails.join('\n    - ')}` : ''}`);
  };
  const boot = async (route, enterText = null) => {
    await page.goto(base + route, { waitUntil: 'domcontentloaded', timeout: 60000 });
    const t0 = Date.now();
    while (Date.now() - t0 < 45000) {
      if (await page.evaluate(() => !document.getElementById('boot-splash') && document.querySelectorAll('.message-image').length > 0).catch(() => false)) break;
      await sleep(300);
    }
    await sleep(1200);
    // iPhone opens on the list pane; tap into the conversation like a user.
    if (enterText) {
      const hidden = await page.evaluate(() => { const im = document.querySelector('.message-image'); if (!im) return true; const b = im.getBoundingClientRect(); if (b.right <= 0 || b.left >= innerWidth || b.width === 0) return true; const hit = document.elementFromPoint(Math.min(innerWidth - 2, Math.max(2, b.left + b.width / 2)), Math.min(innerHeight - 2, Math.max(2, b.top + b.height / 2))); return Boolean(hit && hit.closest('.dm-item, .dm-preview, .server-channel-list, [class*="channel-row"]')) || !hit?.closest('.message-list, [class*="message"]'); });
      if (hidden) {
        let b = null;
        for (let i = 0; i < 30 && !b; i++) { if (i) await sleep(500); b = await page.evaluate((txt) => {
          const vis = (e) => { const q = e.getBoundingClientRect(); return q.width > 0 && q.height > 0 && q.left >= 0 && q.right <= innerWidth && q.top >= 0 && q.bottom <= innerHeight; };
          const top = (e) => { const q = e.getBoundingClientRect(); const h = document.elementFromPoint(q.left + q.width / 2, q.top + q.height / 2); return h && (h === e || e.contains(h)); };
          const cands = [...document.querySelectorAll('.dm-item, button, a, [role="button"], li')].filter((e) => vis(e) && top(e) && e.textContent.trim().startsWith(txt));
          const e = cands.sort((x, y) => x.textContent.length - y.textContent.length)[0];
          if (!e) return null; const q = e.getBoundingClientRect(); return { x: q.left + q.width / 2, y: q.top + q.height / 2 };
        }, enterText); }
        if (!b) throw new Error(`no "${enterText}" row to tap`);
        await page.touchscreen.tap(b.x, b.y);
        await sleep(2000);
      }
    }
    if (args.debug) await page.screenshot({ path: path.join(OUT, `${device.name}-boot-${route.replace(/\W+/g, '_')}.png`) });
  };
  try {
    await boot(`/direct/${PEER.username}`, device.name === 'iphone' ? PEER.displayName : null);
    await openImage(page, 'e2e-img-peer', device);
    await check('dm-friend', { avatar: AVATAR, name: PEER.displayName });
    await nextImage(page);
    await check('dm-own-broken', { avatar: null, letter: 'D', name: 'Demir', date: '20.10.2026 23:10' });
    // Each scenario starts from a fresh load so it does not depend on closing
    // the viewer (headless WebKit can keep a mouse-opened viewer open after
    // Esc / X; same on the pre-fix build, tracked separately).
    await boot(`/direct/${PEER.username}`, device.name === 'iphone' ? PEER.displayName : null);
    await openImage(page, 'e2e-img-me', device);
    await check('dm-own-direct', { avatar: null, letter: 'D', name: 'Demir', date: '20.10.2026 23:10' });
    await boot(`/direct/${PEER.username}`, device.name === 'iphone' ? PEER.displayName : null);
    await openImage(page, 'e2e-gif-peer', device);
    await check('dm-friend-gif', { avatar: AVATAR, name: PEER.displayName, date: '20.10.2026 23:11' });
    await boot('/servers/s-perf-0/s-perf-0-ch-1', device.name === 'iphone' ? 'kanal-1' : null);
    await openImage(page, 'e2e-ch-peer', device);
    await check('server-friend', { avatar: AVATAR, name: PEER.displayName });
    await nextImage(page);
    await check('server-stranger', { avatar: STRANGER_AVATAR, name: 'sn1pez53', date: '20.10.2026 23:10' });
    await boot('/servers/s-perf-0/s-perf-0-ch-1', device.name === 'iphone' ? 'kanal-1' : null);
    await openImage(page, 'e2e-ch-gif', device);
    await check('server-stranger-gif', { avatar: STRANGER_AVATAR, name: 'sn1pez53', date: '20.10.2026 23:11' });
  } catch (e) {
    const shot = path.join(OUT, `${device.name}-error.png`);
    await page.screenshot({ path: shot }).catch(() => {});
    results.push({ device: device.name, label: 'run', ok: false, fails: [String(e.message || e)], shot });
    console.log(`[viewer-avatar] FAIL ${device.name} ${e.message || e}`);
  }
  // WebKit reports fetches cancelled by our own page.goto between scenarios as
  // "access control checks"; those are harness reloads, not app errors.
  const errs = errors.filter((m) => !/plugin is not implemented|due to access control checks/.test(m));
  if (errs.length) { results.push({ device: device.name, label: 'pageerror', ok: false, fails: errs.slice(0, 3) }); console.log(`[viewer-avatar] FAIL ${device.name} page errors: ${errs.slice(0, 2).join(' | ')}`); }
  await ctx.close();
  return results;
}

(async () => {
  if (!fs.existsSync(path.join(DIST, 'index.html'))) throw new Error(`no build at ${DIST}`);
  fs.mkdirSync(OUT, { recursive: true });
  const base = `http://127.0.0.1:${PORT}`;
  seedMock(base);
  const srv = await mock.start({ dist: DIST, port: PORT });
  const browser = await pw[ENGINE].launch(ENGINE === 'chromium' ? { executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--lang=tr-TR'] } : { headless: true });
  const all = [];
  try {
    const only = args.device ? String(args.device).split(',') : null;
    for (const d of DEVICES) if (!only || only.includes(d.name)) all.push(...await runDevice(browser, base, d));
  } finally {
    await browser.close();
    srv.close();
  }
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(all, null, 2));
  const bad = all.filter((r) => !r.ok);
  console.log(`[viewer-avatar] ${all.length - bad.length}/${all.length} passed (${ENGINE})`);
  process.exit(bad.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
