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
 *   VITE_API_BASE_URL=http://127.0.0.1:5371 VITE_SOCKET_URL=http://127.0.0.1:5371 npx vite build --outDir /tmp/dist-perf
 *   node e2e/iosKeyboardLayout.e2e.cjs --dist=/tmp/dist-perf [--out=/tmp/ios-kb] [--engine=chromium|webkit]
 * Exit 1 when any geometry check fails.
 */

const fs = require('fs');
const path = require('path');
const mock = require('./perf/mockBackend.cjs');

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
const pw = require(process.env.PLAYWRIGHT_CORE || 'playwright-core');
const DIST = path.resolve(args.dist || path.join(__dirname, '../dist-perf'));
const OUT = path.resolve(args.out || '/tmp/descall-ios-kb');
const PORT = Number(args.port || 5371);
// Geometry only, so Chromium mobile emulation is enough where WebKit is not installed.
const ENGINE = String(args.engine || 'chromium');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148';
// iPhone 15/16 Pro Max (the owner's phone: 1290x2796 @3x) and its keyboard
// with the suggestion row: top edge at 585pt.
const W = 430;
const H = 932;
const KB = 347;
const LANDSCAPE = { w: 932, h: 430, kb: 209 };

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
  const cs = getComputedStyle(document.documentElement);
  return {
    inner: innerHeight,
    composerBottom: comp ? Math.round(comp.bottom) : null,
    composerTop: capsule ? Math.round(capsule.top) : (comp ? Math.round(comp.top) : null),
    listTop: scr ? Math.round(scr.top) : null,
    listBottom: scr ? Math.round(scr.bottom) : null,
    distFromBottom: sc ? Math.round(sc.scrollHeight - sc.scrollTop - sc.clientHeight) : null,
    headerBottom: header ? Math.round(header.bottom) : null,
    lastTop: last ? Math.round(last.top) : null,
    lastBottom: last ? Math.round(last.bottom) : null,
    lastHit: hit,
    kbOpen: document.documentElement.classList.contains('kb-open'),
    vvHeight: cs.getPropertyValue('--vv-height').trim(),
    kbGap: cs.getPropertyValue('--kb-gap').trim(),
    app: (() => { const r = vis(document.querySelector('.app-root')); return r ? Math.round(r.bottom) : null; })(),
  };
}

async function main() {
  if (!fs.existsSync(path.join(DIST, 'index.html'))) { console.error(`[ios-kb] no ${DIST}/index.html`); process.exit(2); }
  fs.mkdirSync(OUT, { recursive: true });
  const srv = await mock.start({ dist: DIST, port: PORT });
  const base = `http://127.0.0.1:${srv.port}`;
  const browser = ENGINE === 'webkit'
    ? await pw.webkit.launch({ headless: true })
    : await pw.chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const ctxOpts = { viewport: { width: W, height: H }, screen: { width: W, height: H }, deviceScaleFactor: 1, hasTouch: true, userAgent: IPHONE_UA, locale: 'tr-TR', timezoneId: 'Europe/Istanbul', colorScheme: 'dark' };
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
  const fails = [];
  const check = (ok, msg) => { console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${msg}`); if (!ok) fails.push(msg); };
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
    console.log('[ios-kb] rest', JSON.stringify(rest));
    await page.screenshot({ path: path.join(OUT, '0-rest.png') });
    check(rest.composerBottom != null && rest.composerBottom > H - 140, `at rest the composer is at the bottom (${rest.composerBottom})`);

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
    const expectOpen = (label, m, kbTop) => {
      check(m.kbOpen, `${label}: html.kb-open`);
      check(m.composerBottom != null && m.composerBottom <= kbTop + 1 && m.composerBottom >= kbTop - 24, `${label}: composer sits on the keyboard (bottom ${m.composerBottom}, keyboard top ${kbTop})`);
      check(m.app != null && m.app >= kbTop - 2 && m.app <= kbTop + 2, `${label}: shell ends at the keyboard top, no empty band (${m.app} vs ${kbTop}, --vv-height ${m.vvHeight}, --kb-gap ${m.kbGap})`);
      check(m.listBottom != null && m.listBottom >= m.composerTop - 2, `${label}: the list reaches the composer (list bottom ${m.listBottom}, composer top ${m.composerTop})`);
      check(m.lastHit && m.lastBottom <= m.composerTop + 1 && (m.headerBottom == null || m.lastTop >= m.headerBottom - 1), `${label}: newest message visible between header and composer (${m.lastTop}..${m.lastBottom}, header ${m.headerBottom}, composer ${m.composerTop})`);
      check(m.distFromBottom != null && m.distFromBottom <= 2, `${label}: list stays scrolled to the newest message (distance ${m.distFromBottom})`);
    };

    // iOS 26: layout viewport shrinks (resizes-content) + native overlap.
    await openKeyboard('resize', W, H, KB);
    const a = await page.evaluate(measure);
    console.log('[ios-kb] resize', JSON.stringify(a));
    await page.screenshot({ path: path.join(OUT, '1-keyboard-resize.png') });
    expectOpen('iOS 26 resized layout', a, H - KB);

    await closeKeyboard(W, H);
    const c = await page.evaluate(measure);
    console.log('[ios-kb] closed', JSON.stringify(c));
    await page.screenshot({ path: path.join(OUT, '2-closed.png') });
    check(!c.kbOpen, 'closed: kb-open cleared');
    check(Math.abs((c.composerBottom || 0) - (rest.composerBottom || 0)) <= 2, `closed: composer back where it was (${c.composerBottom} vs ${rest.composerBottom})`);
    check(c.app === rest.app, `closed: shell full height again (${c.app} vs ${rest.app})`);

    // Keyboard over a full-height layout (no resize): still lifted once.
    await openKeyboard('overlay', W, H, KB);
    const b = await page.evaluate(measure);
    console.log('[ios-kb] overlay', JSON.stringify(b));
    await page.screenshot({ path: path.join(OUT, '3-keyboard-overlay.png') });
    expectOpen('overlay keyboard', b, H - KB);
    await closeKeyboard(W, H);

    // Rotate to landscape with the keyboard up, then back to portrait.
    await page.setViewportSize({ width: LANDSCAPE.w, height: LANDSCAPE.h });
    await sleep(900);
    await openKeyboard('resize', LANDSCAPE.w, LANDSCAPE.h, LANDSCAPE.kb);
    const l = await page.evaluate(measure);
    console.log('[ios-kb] landscape', JSON.stringify(l));
    await page.screenshot({ path: path.join(OUT, '4-landscape.png') });
    check(l.composerBottom != null && l.composerBottom <= LANDSCAPE.h - LANDSCAPE.kb + 1 && l.composerBottom >= LANDSCAPE.h - LANDSCAPE.kb - 24, `landscape: composer on the keyboard (${l.composerBottom}, keyboard top ${LANDSCAPE.h - LANDSCAPE.kb})`);
    await closeKeyboard(LANDSCAPE.w, LANDSCAPE.h);
    await page.setViewportSize({ width: W, height: H });
    await sleep(900);
    await openKeyboard('resize', W, H, KB);
    const p = await page.evaluate(measure);
    console.log('[ios-kb] portrait again', JSON.stringify(p));
    expectOpen('after rotation', p, H - KB);
    await closeKeyboard(W, H);
  } catch (e) {
    fails.push(String(e && e.stack || e));
  }
  await ctx.close(); await browser.close(); srv.close();
  console.log(`[ios-kb] ${fails.length ? 'FAIL' : 'ok'}${fails.length ? `\n    - ${fails.join('\n    - ')}` : ''}`);
  process.exit(fails.length ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
