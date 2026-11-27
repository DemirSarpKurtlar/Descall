'use strict';

/**
 * iPhone app (iOS 26): with the keyboard up the composer sits right on the
 * keyboard, the message list fills header..composer and shows the newest
 * message; after the keyboard closes the shell is full height again.
 *
 * The owner's screenshot (DM "Xest", keyboard open): the composer floated in
 * the middle of the screen over an empty keyboard-sized band, and the list was
 * pushed up behind the glass header. iOS 26 WebKit shrinks the layout viewport
 * itself for the keyboard (index.html has interactive-widget=resizes-content),
 * while DescallBridgeViewController still reported the full UIKit overlap
 * against the unchanged WKWebView frame, so the keyboard was taken off twice.
 *
 * Simulated keyboard (headless WebKit has none): the page viewport shrinks by
 * the keyboard height (what resizes-content does: innerHeight, the visual
 * viewport and fixed boxes end at the keyboard top) and the Swift bridge call
 * window.__descallNativeKeyboard(overlap, webViewHeight) fires like
 * keyboardWillChangeFrame. Mode "overlay" keeps the viewport (older iOS: the
 * keyboard covers a full-height layout) to make sure that still lifts.
 *
 *   VITE_API_BASE_URL=http://127.0.0.1:5361 VITE_SOCKET_URL=http://127.0.0.1:5361 npx vite build --outDir dist-e2e
 *   node e2e/iosKeyboardLayout.e2e.cjs --dist=dist-e2e [--port=5361] [--out=/tmp/ios-kb] [--engine=chromium|webkit]
 * Exit 1 when any geometry check fails.
 */

const fs = require('fs');
const path = require('path');
const mock = require('./perf/mockBackend.cjs');

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
const pw = require(process.env.PLAYWRIGHT_CORE || 'playwright-core');
const DIST = path.resolve(args.dist || path.join(__dirname, '../dist-perf'));
const OUT = path.resolve(args.out || process.env.DESCALL_E2E_SHOTS || '/tmp/descall-ios-kb');
const PORT = Number(args.port || 5361);
// Geometry only, so Chromium mobile emulation is enough where WebKit is not installed.
const ENGINE = String(args.engine || 'chromium');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148';
const IPAD_UA = 'Mozilla/5.0 (iPad; CPU OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148';
const DEVICES = [
  // iPhone 15/16 Pro Max (the owner's phone: 1290x2796 @3x) and its keyboard
  // with the suggestion row: top edge at 585pt.
  { name: 'iphone', W: 430, H: 932, KB: 347, UA: IPHONE_UA, landscape: { w: 932, h: 430, kb: 209 }, extras: true },
  // iPad split view (half width, phone layout) and a wide iPad window; the
  // keyboard spans the screen, the web view is only part of it.
  { name: 'ipad-split', W: 507, H: 1180, KB: 398, UA: IPAD_UA },
  { name: 'ipad-wide', W: 820, H: 1180, KB: 398, UA: IPAD_UA },
];

function installNativeShell() {
  window.CapacitorCustomPlatform = { name: 'ios' };
  window.Capacitor = {
    getPlatform: () => 'ios',
    isNativePlatform: () => true,
    PluginHeaders: [],
    nativePromise() { return Promise.reject(new Error('not implemented')); },
    nativeCallback() { return String(Math.random()); },
  };
}

/* Geometry of the open chat, in CSS px. */
function measure() {
  const vis = (e) => { if (!e) return null; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 ? r : null; };
  const comp = vis(document.querySelector('.composer-container'));
  const capsule = vis(document.querySelector('.composer-container .composer-input')?.closest('form, .composer-bar, .message-composer') || document.querySelector('.composer-input'));
  const sc = document.querySelector('.messages-container');
  const scr = vis(sc);
  const header = [...document.querySelectorAll('.chat-header, .g-chat-header, .chat-panel-header, header')].map(vis).filter(Boolean).filter((r) => r.top < 200).sort((a, b) => b.bottom - a.bottom)[0] || null;
  const bubbles = [...document.querySelectorAll('.message-bubble[data-message-id]')];
  const last = vis(bubbles[bubbles.length - 1]);
  let hit = false;
  if (last) {
    const y = Math.max(last.top + 4, Math.min(last.bottom - 4, last.top + last.height / 2));
    const el = document.elementFromPoint(last.left + last.width / 2, y);
    hit = Boolean(el && bubbles[bubbles.length - 1].contains(el));
  }
  const reply = vis(document.querySelector('.composer-reply-bar'));
  const cs = getComputedStyle(document.documentElement);
  return {
    inner: innerHeight,
    composerBottom: comp ? Math.round(comp.bottom) : null,
    composerTop: capsule ? Math.round(capsule.top) : (comp ? Math.round(comp.top) : null),
    containerTop: comp ? Math.round(comp.top) : null,
    listTop: scr ? Math.round(scr.top) : null,
    listBottom: scr ? Math.round(scr.bottom) : null,
    distFromBottom: sc ? Math.round(sc.scrollHeight - sc.scrollTop - sc.clientHeight) : null,
    headerBottom: header ? Math.round(header.bottom) : null,
    lastTop: last ? Math.round(last.top) : null,
    lastBottom: last ? Math.round(last.bottom) : null,
    lastHit: hit,
    replyTop: reply ? Math.round(reply.top) : null,
    kbOpen: document.documentElement.classList.contains('kb-open'),
    vvHeight: cs.getPropertyValue('--vv-height').trim(),
    kbGap: cs.getPropertyValue('--kb-gap').trim(),
    app: (() => { const r = vis(document.querySelector('.app-root')); return r ? Math.round(r.bottom) : null; })(),
  };
}

async function tapText(page, sel, re) {
  const pt = await page.evaluate(([sel, re]) => {
    const e = [...document.querySelectorAll(sel)].find((x) => new RegExp(re).test(`${x.getAttribute('aria-label') || ''} ${x.textContent}`) && x.getBoundingClientRect().width > 0);
    if (!e) return null; const b = e.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
  }, [sel, re]);
  if (pt) await page.touchscreen.tap(pt.x, pt.y);
  return Boolean(pt);
}

async function runDevice(browser, base, dev, check) {
  const { name, W, H, KB, UA } = dev;
  const ctxOpts = { viewport: { width: W, height: H }, screen: { width: W, height: H }, deviceScaleFactor: 1, hasTouch: true, userAgent: UA, locale: 'tr-TR', timezoneId: 'Europe/Istanbul', colorScheme: 'dark' };
  if (ENGINE !== 'webkit') ctxOpts.isMobile = true;
  const ctx = await browser.newContext(ctxOpts);
  await ctx.route('**/*', (r) => (/^(data|blob):/.test(r.request().url()) || r.request().url().startsWith(base) ? r.continue() : r.abort()));
  await ctx.addInitScript(installNativeShell);
  await ctx.addInitScript(([api, me]) => {
    window.__DESCALL_API_URL__ = api; window.__DESCALL_SOCKET_URL__ = api;
    localStorage.setItem('descall_language', 'tr');
    localStorage.setItem('descall:ios-pwa-install-dismissed', '1');
    localStorage.setItem('descall:cookie_consent_v1', JSON.stringify({ choice: 'rejected', at: new Date().toISOString() }));
    localStorage.setItem('descall_token', 'e2e.fake.token');
    localStorage.setItem('descall_user', JSON.stringify(me));
  }, [base, mock.ME]);
  const page = await ctx.newPage();
  const shot = (f) => page.screenshot({ path: path.join(OUT, `${name}-${f}.png`) });
  const openKeyboard = async (mode, w, h, kb) => {
    await page.focus('.composer-input');
    // Swift's keyboardWillChangeFrame comes first, then WebKit resizes.
    await page.evaluate(([kb, h]) => window.__descallNativeKeyboard(kb, h), [kb, h]);
    await sleep(60);
    if (mode === 'resize') await page.setViewportSize({ width: w, height: h - kb });
    await page.evaluate(([kb, h]) => window.__descallNativeKeyboard(kb, h), [kb, h]);
    await sleep(700);
  };
  const closeKeyboard = async (w, h) => {
    await page.evaluate(() => document.activeElement?.blur());
    await page.evaluate((h) => window.__descallNativeKeyboard(0, h), h);
    await page.setViewportSize({ width: w, height: h });
    await sleep(900);
  };
  const expectOpen = (label, m, kbTop, { list = true } = {}) => {
    label = `${name} ${label}`;
    check(m.kbOpen, `${label}: html.kb-open`);
    check(m.composerBottom != null && m.composerBottom <= kbTop + 1 && m.composerBottom >= kbTop - 24, `${label}: composer sits on the keyboard (bottom ${m.composerBottom}, keyboard top ${kbTop})`);
    check(m.app != null && m.app >= kbTop - 2 && m.app <= kbTop + 2, `${label}: shell ends at the keyboard top, no empty band (${m.app} vs ${kbTop}, --vv-height ${m.vvHeight}, --kb-gap ${m.kbGap})`);
    check(m.listBottom != null && m.listBottom >= Math.min(m.composerTop, m.containerTop) - 2, `${label}: the list reaches the composer (list bottom ${m.listBottom}, composer top ${m.containerTop})`);
    if (!list) return;
    check(m.lastHit && m.lastBottom <= m.composerTop + 1 && (m.headerBottom == null || m.lastTop >= m.headerBottom - 1), `${label}: newest message visible between header and composer (${m.lastTop}..${m.lastBottom}, header ${m.headerBottom}, composer ${m.composerTop})`);
    check(m.distFromBottom != null && m.distFromBottom <= 2, `${label}: list stays scrolled to the newest message (distance ${m.distFromBottom})`);
  };
  const log = (k, m) => console.log(`[ios-kb] ${name} ${k}`, JSON.stringify(m));
  try {
    await page.goto(base + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    for (let i = 0; i < 300; i++) { if (await page.evaluate(() => document.querySelectorAll('.dm-item').length > 0 && !document.getElementById('boot-splash')).catch(() => false)) break; await sleep(150); }
    for (let attempt = 0; attempt < 6; attempt++) {
      await page.evaluate(() => { const el = [...document.querySelectorAll('.dm-item')].find((e) => e.getBoundingClientRect().width > 0); el?.click(); });
      let ok = false;
      for (let i = 0; i < 40 && !ok; i++) { await sleep(150); ok = await page.evaluate(() => { const r = document.querySelector('.composer-input')?.getBoundingClientRect(); return document.querySelectorAll('.message-bubble[data-message-id]').length > 10 && r && r.width > 0 && r.bottom <= innerHeight; }); }
      if (ok) break;
    }
    await sleep(1200);
    const rest = await page.evaluate(measure);
    log('rest', rest);
    await shot('0-rest');
    check(rest.composerBottom != null && rest.composerBottom > H - 140, `${name} at rest the composer is at the bottom (${rest.composerBottom})`);

    // iOS 26: layout viewport shrinks (resizes-content) + native overlap.
    await openKeyboard('resize', W, H, KB);
    const a = await page.evaluate(measure);
    log('resize', a);
    await shot('1-keyboard-resize');
    expectOpen('iOS 26 resized layout', a, H - KB);

    await closeKeyboard(W, H);
    const c = await page.evaluate(measure);
    log('closed', c);
    await shot('2-closed');
    check(!c.kbOpen, `${name} closed: kb-open cleared`);
    check(Math.abs((c.composerBottom || 0) - (rest.composerBottom || 0)) <= 2, `${name} closed: composer back where it was (${c.composerBottom} vs ${rest.composerBottom})`);
    check(c.app === rest.app, `${name} closed: shell full height again (${c.app} vs ${rest.app})`);

    // Keyboard over a full-height layout (no resize): still lifted once.
    await openKeyboard('overlay', W, H, KB);
    const b = await page.evaluate(measure);
    log('overlay', b);
    await shot('3-keyboard-overlay');
    expectOpen('overlay keyboard', b, H - KB);
    await closeKeyboard(W, H);

    if (dev.landscape) {
      // Rotate to landscape with the keyboard up, then back to portrait.
      const L = dev.landscape;
      await page.setViewportSize({ width: L.w, height: L.h });
      await sleep(900);
      await openKeyboard('resize', L.w, L.h, L.kb);
      const l = await page.evaluate(measure);
      log('landscape', l);
      await shot('4-landscape');
      check(l.composerBottom != null && l.composerBottom <= L.h - L.kb + 1 && l.composerBottom >= L.h - L.kb - 24, `${name} landscape: composer on the keyboard (${l.composerBottom}, keyboard top ${L.h - L.kb})`);
      await closeKeyboard(L.w, L.h);
      await page.setViewportSize({ width: W, height: H });
      await sleep(900);
      await openKeyboard('resize', W, H, KB);
      const p = await page.evaluate(measure);
      log('portrait again', p);
      expectOpen('after rotation', p, H - KB);
      await closeKeyboard(W, H);
    }

    if (dev.extras) {
      // Reply bar: long-press the newest bubble, "Yanıtla", then type.
      const box = await page.evaluate(() => { const bs = [...document.querySelectorAll('.message-bubble[data-message-id]')]; const r = bs[bs.length - 1].getBoundingClientRect(); return { x: r.left + 20, y: r.top + r.height / 2 }; });
      await page.mouse.move(box.x, box.y);
      if (ENGINE !== 'webkit') {
        const cdp = await ctx.newCDPSession(page);
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [box] }); await sleep(650);
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      } else { await page.mouse.down(); await sleep(650); await page.mouse.up(); }
      await sleep(600);
      const replied = await tapText(page, 'button, [role="menuitem"]', '^\\s*Yanıtla\\s*$');
      await sleep(700);
      check(replied, `${name} reply: "Yanıtla" in the message menu`);
      if (replied) {
        await openKeyboard('resize', W, H, KB);
        const r = await page.evaluate(measure);
        log('reply', r);
        await shot('5-reply-keyboard');
        expectOpen('reply bar', r, H - KB);
        check(r.replyTop != null && r.lastBottom <= r.replyTop + 1, `${name} reply bar: newest message ends above the reply strip (${r.lastBottom} vs ${r.replyTop})`);
        await closeKeyboard(W, H);
      }
      // Forward sheet: typing the note, the field and the sheet end on the keyboard.
      const fbox = await page.evaluate(() => { const bs = [...document.querySelectorAll('.message-bubble[data-message-id]')]; const r = bs[bs.length - 1].getBoundingClientRect(); return { x: r.left + 20, y: r.top + r.height / 2 }; });
      if (ENGINE !== 'webkit') {
        const cdp = await ctx.newCDPSession(page);
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [fbox] }); await sleep(650);
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      } else { await page.mouse.move(fbox.x, fbox.y); await page.mouse.down(); await sleep(650); await page.mouse.up(); }
      await sleep(600);
      const fwd = await tapText(page, 'button, [role="menuitem"]', '^\\s*İlet\\s*$');
      await sleep(900);
      const note = fwd && await page.evaluate(() => { const e = [...document.querySelectorAll('.gs-sheet input, .gs-sheet textarea')].filter((x) => x.getBoundingClientRect().height > 0).pop(); e?.focus(); return Boolean(e); });
      check(Boolean(note), `${name} forward sheet opened`);
      if (note) {
        for (const mode of ['overlay', 'resize']) {
          await page.evaluate(([kb, h]) => window.__descallNativeKeyboard(kb, h), [KB, H]);
          if (mode === 'resize') await page.setViewportSize({ width: W, height: H - KB });
          await page.evaluate(([kb, h]) => window.__descallNativeKeyboard(kb, h), [KB, H]);
          await sleep(700);
          const fm = await page.evaluate(() => { const r = document.querySelector('.gs-sheet').getBoundingClientRect(); const a = document.activeElement.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), field: Math.round(a.bottom) }; });
          log(`forward ${mode}`, fm);
          await shot(`6-forward-${mode}`);
          check(fm.bottom <= H - KB + 1 && fm.bottom >= H - KB - 2 && fm.top >= 0 && fm.field <= H - KB, `${name} forward sheet (${mode}): note field and sheet end on the keyboard (${fm.top}..${fm.bottom}, field ${fm.field}, keyboard top ${H - KB})`);
          await page.evaluate((h) => window.__descallNativeKeyboard(0, h), H);
          await page.setViewportSize({ width: W, height: H });
          await sleep(500);
        }
        await page.evaluate(() => document.activeElement?.blur());
        await page.keyboard.press('Escape');
        await sleep(600);
        if (await page.$('.gs-scrim')) { await tapText(page, '.gs-sheet button[aria-label]', 'Kapat|Close'); await sleep(600); }
      }

      // GIF search: the sheet ends on the keyboard, search field on screen.
      const plus = await tapText(page, '.composer-container button', 'Ekle|Dosya|Attach');
      await sleep(600);
      const gif = plus && await tapText(page, '.attachment-item', 'GIF');
      await sleep(900);
      check(Boolean(gif && await page.$('.giphy-search input')), `${name} GIF picker opened`);
      if (gif) {
        for (const mode of ['overlay', 'resize']) {
          const at = await page.evaluate(() => { const r = document.querySelector('.giphy-search input').getBoundingClientRect(); return { x: r.left + 20, y: r.top + r.height / 2 }; });
          await page.touchscreen.tap(at.x, at.y);
          await page.focus('.giphy-search input');
          await page.evaluate(([kb, h]) => window.__descallNativeKeyboard(kb, h), [KB, H]);
          if (mode === 'resize') await page.setViewportSize({ width: W, height: H - KB });
          await page.evaluate(([kb, h]) => window.__descallNativeKeyboard(kb, h), [KB, H]);
          await sleep(700);
          const gm = await page.evaluate(() => { const p = document.querySelector('.giphy-panel').getBoundingClientRect(); const i = document.querySelector('.giphy-search input').getBoundingClientRect(); return { top: Math.round(p.top), bottom: Math.round(p.bottom), search: Math.round(i.bottom) }; });
          log(`gif ${mode}`, gm);
          await shot(`7-gif-${mode}`);
          check(gm.bottom <= H - KB + 1 && gm.bottom >= H - KB - 24 && gm.top >= 0 && gm.search <= H - KB, `${name} GIF search (${mode}): sheet ends on the keyboard (${gm.top}..${gm.bottom}, keyboard top ${H - KB})`);
          await page.evaluate(() => document.activeElement?.blur());
          await page.evaluate((h) => window.__descallNativeKeyboard(0, h), H);
          await page.setViewportSize({ width: W, height: H });
          await sleep(600);
        }
        await page.keyboard.press('Escape');
        await tapText(page, '.giphy-close', '.');
        await sleep(500);
      }

      // Server text channel (same shell, other composer owner). Back to the
      // list first: the tab bar is hidden inside a conversation.
      await tapText(page, '.mobile-nav-btn', '.');
      await sleep(900);
      const tab = await tapText(page, '.g-tab, .g-tabbar button', 'Sunucu');
      await sleep(1200);
      const srvRow = tab && await tapText(page, '.server-list-item', 'Büyük Sunucu');
      await sleep(1500);
      const ch = srvRow && await tapText(page, '.channel-item, [data-channel-id], button, [role="button"]', '^\\s*#?\\s*kanal-1\\b');
      await sleep(1500);
      check(Boolean(ch && await page.$('.composer-input')), `${name} server channel opened`);
      if (ch) {
        await openKeyboard('resize', W, H, KB);
        const sv = await page.evaluate(measure);
        log('server channel', sv);
        await shot('6-server-keyboard');
        expectOpen('server channel', sv, H - KB, { list: false });
        await closeKeyboard(W, H);
      }
      // Create-group sheet: typing the name, the sheet (list + button) ends
      // on the keyboard instead of running on behind it.
      await page.goto(base + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
      for (let i = 0; i < 200; i++) { if (await page.evaluate(() => Boolean(document.querySelector('.g-tabbar')) && !document.getElementById('boot-splash')).catch(() => false)) break; await sleep(150); }
      await sleep(800);
      await tapText(page, '.g-tab, .g-tabbar button', 'Grup');
      await sleep(1000);
      const sheet = await tapText(page, 'button', 'Grup oluştur');
      await sleep(1000);
      const focused = sheet && await page.evaluate(() => { const e = [...document.querySelectorAll('.nc-sheet input')].find((x) => x.getBoundingClientRect().height > 0); e?.focus(); return Boolean(e); });
      check(Boolean(focused), `${name} create-group sheet opened`);
      if (focused) {
        for (const mode of ['overlay', 'resize']) {
          await page.evaluate(([kb, h]) => window.__descallNativeKeyboard(kb, h), [KB, H]);
          if (mode === 'resize') await page.setViewportSize({ width: W, height: H - KB });
          await page.evaluate(([kb, h]) => window.__descallNativeKeyboard(kb, h), [KB, H]);
          await sleep(700);
          const sm = await page.evaluate(() => { const r = document.querySelector('.nc-sheet').getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom) }; });
          log(`sheet ${mode}`, sm);
          await shot(`8-sheet-${mode}`);
          check(sm.bottom <= H - KB + 1 && sm.bottom >= H - KB - 2 && sm.top >= 0, `${name} create-group sheet (${mode}): ends on the keyboard (${sm.top}..${sm.bottom}, keyboard top ${H - KB})`);
          await page.evaluate((h) => window.__descallNativeKeyboard(0, h), H);
          await page.setViewportSize({ width: W, height: H });
          await sleep(500);
        }
      }
    }
  } catch (e) {
    check(false, `${name}: ${String(e && e.stack || e)}`);
  }
  await ctx.close();
}

async function main() {
  if (!fs.existsSync(path.join(DIST, 'index.html'))) { console.error(`[ios-kb] no ${DIST}/index.html`); process.exit(2); }
  fs.mkdirSync(OUT, { recursive: true });
  const srv = await mock.start({ dist: DIST, port: PORT });
  const base = `http://127.0.0.1:${srv.port}`;
  const browser = ENGINE === 'webkit'
    ? await pw.webkit.launch({ headless: true })
    : await pw.chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || undefined, args: ['--no-sandbox'] });
  const fails = [];
  const check = (ok, msg) => { console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${msg}`); if (!ok) fails.push(msg); };
  for (const dev of DEVICES) await runDevice(browser, base, dev, check);
  await browser.close(); srv.close();
  console.log(`[ios-kb] ${fails.length ? 'FAIL' : 'ok'}${fails.length ? `\n    - ${fails.join('\n    - ')}` : ''}`);
  process.exit(fails.length ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
