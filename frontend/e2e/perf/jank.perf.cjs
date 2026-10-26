'use strict';

/**
 * Jank + black-flicker benchmark (Master Update A3). Not a CI test: a
 * measuring tool that writes JSON (and optional screencast frames) so two
 * builds can be compared under the same conditions.
 *
 * Serves a built dist/ with the synthetic heavy account from mockBackend.cjs
 * (1000-message DM, 300 chats, 60 servers, a 300-channel server) on 127.0.0.1;
 * every other URL is aborted. Per device (iPhone / iPad / desktop viewport,
 * CPU throttled) it runs: boot, tab switches, chat list / message list /
 * server list / channel list scroll, opening a chat, the slash menu, the
 * long-press menu and the settings sheet, and records per scenario:
 *   - rAF frame times (fps, p95, frames over 1.5 vsync = dropped),
 *   - long tasks and long animation frames (style/layout share),
 *   - event timing (input → next paint) for the slash menu keystrokes,
 *   - with --frames: every compositor frame (CDP screencast) to <out>/frames,
 *     analysed for dark flashes by e2e/perf/flicker.py.
 *
 *   VITE_API_BASE_URL=http://127.0.0.1:5371 VITE_SOCKET_URL=http://127.0.0.1:5371 npx vite build --outDir /tmp/dist-perf
 *   node e2e/perf/jank.perf.cjs --dist=/tmp/dist-perf --out=/tmp/perf-run [--devices=iphone,ipad,desktop] [--frames] [--cpu=4]
 */

const fs = require('fs');
const path = require('path');
const mock = require('./mockBackend.cjs');

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
const pw = require(process.env.PLAYWRIGHT_CORE || 'playwright-core');
const DIST = path.resolve(args.dist || path.join(__dirname, '../../dist-perf'));
const OUT = path.resolve(args.out || '/tmp/descall-perf');
const DEVICES = String(args.devices || 'iphone,ipad,desktop').split(',').filter(Boolean);
const ONLY = args.only ? String(args.only).split(',') : null;
const FRAMES = Boolean(args.frames);
const CHROME = process.env.CHROME_PATH || '/usr/bin/google-chrome';
const PORT = Number(args.port || 5371);
const log = (...a) => console.log('[jank]', ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const IPAD_UA = 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const DEV = {
  iphone: { ctx: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: IPHONE_UA }, touch: true, cpu: 4 },
  ipad: { ctx: { viewport: { width: 1024, height: 1366 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: IPAD_UA }, touch: true, cpu: 4 },
  desktop: { ctx: { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false }, touch: false, cpu: 2 },
};

// In-page recorder: rAF deltas, long tasks, LoAF, event timing.
const PROBE = () => {
  const J = { on: false, frames: [], lt: [], loaf: [], ev: [], marks: [] };
  window.__jank = J;
  const tick = (t) => { if (!J.on) return; J.frames.push(t); requestAnimationFrame(tick); };
  const last = new WeakMap();
  document.addEventListener('scroll', (e) => { if (!J.on) return; const el = e.target === document ? document.scrollingElement : e.target; const prev = last.has(el) ? last.get(el) : el.scrollTop; J.scrolled += Math.abs(el.scrollTop - prev); last.set(el, el.scrollTop); }, true);
  J.begin = () => { J.frames = []; J.lt = []; J.loaf = []; J.ev = []; J.marks = []; J.scrolled = 0; J.t0 = performance.now(); J.on = true; requestAnimationFrame(tick); };
  J.mark = (m) => J.marks.push([m, performance.now() - (J.t0 || 0)]);
  J.end = () => { J.on = false; return { scrolled: Math.round(J.scrolled), t0: J.t0, t1: performance.now(), frames: J.frames.slice(), lt: J.lt.slice(), loaf: J.loaf.slice(), ev: J.ev.slice(), marks: J.marks.slice() }; };
  const obs = (type, fn, extra) => { try { new PerformanceObserver((l) => { if (J.on) l.getEntries().forEach(fn); }).observe({ type, ...extra }); } catch { /* unsupported */ } };
  obs('longtask', (e) => J.lt.push([e.startTime - J.t0, e.duration]));
  obs('long-animation-frame', (e) => J.loaf.push({ s: e.startTime - J.t0, d: e.duration, block: e.blockingDuration, render: e.renderStart ? e.startTime + e.duration - e.renderStart : 0, style: e.styleAndLayoutStart ? e.startTime + e.duration - e.styleAndLayoutStart : 0, scripts: (e.scripts || []).slice(0, 3).map((s) => `${s.invoker || ''} ${Math.round(s.duration)}ms ${String(s.sourceURL || '').split('/').pop()}:${s.sourceCharPosition ?? ''}`) }));
  obs('event', (e) => J.ev.push({ name: e.name, s: e.startTime - J.t0, d: e.duration, proc: e.processingEnd - e.processingStart }), { durationThreshold: 16 });
};

function summarize(raw) {
  const f = raw.frames;
  const d = [];
  for (let i = 1; i < f.length; i++) d.push(f[i] - f[i - 1]);
  const sorted = d.slice().sort((a, b) => a - b);
  const pct = (p) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))] : 0);
  const span = f.length > 1 ? f[f.length - 1] - f[0] : 0;
  const expected = span / 16.667;
  return {
    frames: f.length, spanMs: Math.round(span),
    fps: span ? +(1000 * (f.length - 1) / span).toFixed(1) : 0,
    p50: +pct(0.5).toFixed(1), p95: +pct(0.95).toFixed(1), max: +(sorted[sorted.length - 1] || 0).toFixed(1),
    dropped: d.filter((x) => x > 25).length,
    droppedPct: expected ? +(100 * Math.max(0, expected - (f.length - 1)) / expected).toFixed(1) : 0,
    longTasks: raw.lt.length, longTaskMs: Math.round(raw.lt.reduce((a, [, x]) => a + x, 0)),
    loaf: raw.loaf.length, loafBlockMs: Math.round(raw.loaf.reduce((a, x) => a + (x.block || 0), 0)),
    loafStyleMs: Math.round(raw.loaf.reduce((a, x) => a + (x.style || 0), 0)),
    scrolled: raw.scrolled,
    events: raw.ev.length, evMax: Math.round(Math.max(0, ...raw.ev.map((e) => e.d))),
    deltas: d.map((x) => +x.toFixed(1)),
  };
}

async function startFrames(cdp, dir) {
  fs.mkdirSync(dir, { recursive: true });
  const list = [];
  const onFrame = async (ev) => {
    const n = list.length;
    const file = path.join(dir, `f${String(n).padStart(4, '0')}.jpg`);
    list.push({ file: path.basename(file), ts: ev.metadata.timestamp });
    fs.writeFileSync(file, Buffer.from(ev.data, 'base64'));
    cdp.send('Page.screencastFrameAck', { sessionId: ev.sessionId }).catch(() => {});
  };
  cdp.on('Page.screencastFrame', onFrame);
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 70, everyNthFrame: 1 });
  return async (marks) => {
    await cdp.send('Page.stopScreencast').catch(() => {});
    cdp.off('Page.screencastFrame', onFrame);
    fs.writeFileSync(path.join(dir, 'frames.json'), JSON.stringify({ frames: list, marks }, null, 1));
    return list.length;
  };
}

async function scrollGesture(cdp, dev, x, y, dy, speed = 1800) {
  await cdp.send('Input.synthesizeScrollGesture', { x: Math.round(x), y: Math.round(y), yDistance: -dy, speed, gestureSourceType: 'mouse', repeatCount: 1 });
}
const SYNTHETIC = new Set();
async function tap(page, cdp, dev, sel, { text, index = 0 } = {}) {
  const box = await page.evaluate(([sel, text, index]) => {
    const els = [...document.querySelectorAll(sel)].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && (!text || `${e.getAttribute('aria-label') || ''} ${e.getAttribute('title') || ''} ${e.textContent.trim()}`.includes(text)); });
    // Only points where the element is really on top: on the iPad viewport an
    // unpositioned .mobile-tab-bar sits over the list and would eat a centre tap.
    const hit = (e) => { const r = e.getBoundingClientRect(); for (const [fx, fy] of [[0.5, 0.5], [0.15, 0.5], [0.5, 0.25], [0.5, 0.8], [0.85, 0.5]]) { const x = r.left + r.width * fx, y = r.top + r.height * fy; const t = document.elementFromPoint(x, y); if (t && (t === e || e.contains(t))) return { x, y }; } return null; };
    const hits = els.map(hit).filter(Boolean);
    return hits[index] || null;
  }, [sel, text || null, index]);
  if (!box) {
    // Nothing hittable (iPad 1024px: a stretched in-flow .mobile-tab-bar covers the
    // app, see jank-index.md). Fall back to a programmatic click and flag the run.
    const clicked = await page.evaluate(([sel, text, index]) => { const els = [...document.querySelectorAll(sel)].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && (!text || `${e.getAttribute('aria-label') || ''} ${e.getAttribute('title') || ''} ${e.textContent.trim()}`.includes(text)); }); const e = els[index]; if (!e) return false; e.click(); return true; }, [sel, text || null, index]);
    if (!clicked) throw new Error(`tap: no ${sel} ${text || ''}`);
    SYNTHETIC.add(dev);
    return null;
  }
  if (DEV[dev].touch) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x, y: box.y, id: 1 }] });
    await sleep(50);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } else await page.mouse.click(box.x, box.y);
  return box;
}
async function rectOf(page, sel) {
  return page.evaluate((sel) => { const e = document.querySelector(sel); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height, top: r.top }; }, sel);
}
async function waitFor(page, label, fn, arg, ms = 15000) {
  const t0 = Date.now();
  let last;
  while (Date.now() - t0 < ms) { try { last = await page.evaluate(fn, arg); } catch (e) { last = { err: e.message }; } if (last && last.ok) return last; await sleep(100); }
  throw new Error(`${label}: timeout ${JSON.stringify(last)}`);
}
const CHAT_SCROLLER = () => { const l = document.querySelector('.message-list'); let el = l && l.parentElement; while (el && el !== document.body) { const s = getComputedStyle(el); if (/(auto|scroll)/.test(s.overflowY) && el.scrollHeight > el.clientHeight + 1) return el; el = el.parentElement; } return document.querySelector('.messages-container'); };

async function measure(page, cdp, name, dev, fn, { frames = false } = {}) {
  if (ONLY && !ONLY.includes(name)) return null;
  const stop = frames ? await startFrames(cdp, path.join(OUT, 'frames', dev, name)) : null;
  await page.evaluate(() => window.__jank.begin());
  const mark = (m) => page.evaluate((m) => window.__jank.mark(m), m);
  let err = null;
  try { await fn(mark); } catch (e) { err = e.message; }
  await sleep(250);
  const raw = await page.evaluate(() => window.__jank.end());
  if (stop) await stop(raw.marks);
  const s = summarize(raw);
  s.marks = raw.marks; s.loafTop = raw.loaf.sort((a, b) => b.d - a.d).slice(0, 5); s.evTop = raw.ev.sort((a, b) => b.d - a.d).slice(0, 6);
  if (err) s.error = err;
  log(`${dev.padEnd(7)} ${name.padEnd(14)} fps=${s.fps} p95=${s.p95} max=${s.max} dropped=${s.dropped} LT=${s.longTasks}/${s.longTaskMs}ms LoAF=${s.loaf} evMax=${s.evMax} scrolled=${s.scrolled}${err ? ` ERR ${err}` : ''}`);
  return s;
}

async function openContext(browser, base, dev, { reducedMotion = 'no-preference' } = {}) {
  const ctx = await browser.newContext({ ...DEV[dev].ctx, locale: 'tr-TR', timezoneId: 'Europe/Istanbul', colorScheme: 'dark', reducedMotion });
  await ctx.route('**/*', (r) => (/^(data|blob):/.test(r.request().url()) || r.request().url().startsWith(base) ? r.continue() : r.abort()));
  await ctx.addInitScript(([api, me]) => {
    window.__DESCALL_API_URL__ = api; window.__DESCALL_SOCKET_URL__ = api;
    try { Object.defineProperty(Navigator.prototype, 'hardwareConcurrency', { get: () => 8 }); } catch { /* ignore */ }
    localStorage.setItem('descall_language', 'tr');
    localStorage.setItem('descall:ios-pwa-install-dismissed', '1');
    localStorage.setItem('descall:cookie_consent_v1', JSON.stringify({ choice: 'rejected', at: new Date().toISOString() }));
    localStorage.setItem('descall_token', 'e2e.fake.token');
    localStorage.setItem('descall_user', JSON.stringify(me));
  }, [base, mock.ME]);
  await ctx.addInitScript(PROBE);
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  return { ctx, page, cdp };
}

const TABS = { iphone: '.g-tab', ipad: '.rail-btn', desktop: '.rail-btn' };
const TAB_NAMES = ['Gruplar', 'Sunucular', 'Arkadaşlar', 'Aktivite', 'Aramalar', 'Sohbetler'];

async function runDevice(browser, base, dev, res) {
  const cpu = Number(args.cpu || DEV[dev].cpu);
  const { ctx, page, cdp } = await openContext(browser, base, dev);
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });
  const touch = DEV[dev].touch;

  // 1. Boot (frames from navigation until settled).
  const bootStop = (FRAMES && (!ONLY || ONLY.includes('boot'))) ? await startFrames(cdp, path.join(OUT, 'frames', dev, 'boot')) : null;
  const tBoot = Date.now();
  await page.goto(base + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await waitFor(page, 'chat list', () => ({ ok: document.querySelectorAll('.dm-item').length > 10 && !document.getElementById('boot-splash') }), null, 45000);
  res.bootMs = Date.now() - tBoot;
  await sleep(2500);
  if (bootStop) await bootStop([]);
  log(`${dev} boot ${res.bootMs}ms (cpu x${cpu})`);
  await page.screenshot({ path: path.join(OUT, `${dev}-boot.png`) }).catch(() => {});
  if (args.shotOnly) return;
  await page.evaluate(() => window.__jank || null);

  const tabSel = TABS[dev];
  res.tabs = await measure(page, cdp, 'tabs', dev, async (mark) => {
    for (let round = 0; round < 2; round++) {
      for (const name of TAB_NAMES) { await mark(`tab:${name}`); await tap(page, cdp, dev, tabSel, { text: name }); await sleep(700); }
    }
  }, { frames: FRAMES });

  // Back on the chat list (an overlay from Aktivite/Aramalar can eat the tap).
  for (let i = 0; i < 3; i++) {
    const ok = await page.evaluate(() => [...document.querySelectorAll('.dm-item')].some((e) => e.getBoundingClientRect().width > 0));
    if (ok) break;
    await page.keyboard.press('Escape');
    await page.evaluate((sel) => { const b = [...document.querySelectorAll(sel)].find((e) => `${e.getAttribute('aria-label') || ''} ${e.textContent}`.includes('Sohbetler')); b && b.click(); }, tabSel);
    await sleep(800);
  }
  const listRect = await rectOf(page, '.dm-item');
  res.chatListScroll = await measure(page, cdp, 'chatListScroll', dev, async () => {
    const r = await rectOf(page, '.sidebar-secondary, .dm-list, .g-list, aside');
    const x = listRect ? listRect.x : (r ? r.x : 200);
    for (let i = 0; i < 3; i++) { await scrollGesture(cdp, dev, x, 500, 3000); await scrollGesture(cdp, dev, x, 400, -3000); }
  });

  // Open the 1000-message chat.
  res.openChat = await measure(page, cdp, 'openChat', dev, async (mark) => {
    for (let i = 0; i < (touch && dev === 'iphone' ? 3 : 4); i++) {
      await mark('open');
      await page.evaluate(() => { const s = document.querySelector('.dm-item')?.closest('[class*=scroll], .sidebar-content, .dm-list'); if (s) s.scrollTop = 0; });
      await tap(page, cdp, dev, '.dm-item', { index: dev === 'iphone' ? 0 : i % 2 });
      await sleep(1600);
      if (dev === 'iphone') { await mark('back'); await tap(page, cdp, dev, '[data-mobile-back="1"]').catch(() => page.goBack()); await sleep(1200); }
    }
  }, { frames: FRAMES });
  // Make sure the big chat (Ayşe) is open now.
  await tap(page, cdp, dev, '.dm-item', { text: 'Ayşe' });
  await waitFor(page, 'messages', () => ({ ok: document.querySelectorAll('.message-bubble').length > 20 }), null, 20000);
  await sleep(1500);
  res.renderedBubbles = await page.evaluate(() => document.querySelectorAll('.message-bubble').length);

  res.msgScroll = await measure(page, cdp, 'msgScroll', dev, async () => {
    const sc = await page.evaluate(() => { const l = document.querySelector('.message-list'); let el = l && l.parentElement; while (el && el !== document.body) { const s = getComputedStyle(el); if (/(auto|scroll)/.test(s.overflowY) && el.scrollHeight > el.clientHeight + 1) break; el = el.parentElement; } const r = (el || document.body).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    for (let i = 0; i < 3; i++) { await scrollGesture(cdp, dev, sc.x, sc.y, -4000, 2400); await scrollGesture(cdp, dev, sc.x, sc.y, 4000, 2400); }
  });

  res.slash = await measure(page, cdp, 'slash', dev, async (mark) => {
    const ta = '.message-composer textarea, textarea';
    await page.focus(ta);
    for (let i = 0; i < 3; i++) {
      await mark('slash');
      await page.keyboard.type('/');
      await sleep(600);
      await page.keyboard.type('ba', { delay: 120 });
      await sleep(300);
      await page.keyboard.press('Backspace'); await page.keyboard.press('Backspace');
      await sleep(300);
      await page.keyboard.press('Backspace');
      await sleep(600);
    }
  }, { frames: FRAMES });
  await page.evaluate(() => document.activeElement && document.activeElement.blur());

  if (dev === 'iphone') {
    res.longPress = await measure(page, cdp, 'longPress', dev, async (mark) => {
      for (let i = 0; i < 3; i++) {
        const b = await page.evaluate((i) => { const bs = [...document.querySelectorAll('.message-bubble[data-message-id]')]; const e = bs[bs.length - 2 - i]; const r = e.getBoundingClientRect(); return { x: r.left + 30, y: r.top + r.height / 2 }; }, i);
        await mark('press');
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: b.x, y: b.y, id: 1 }] });
        await sleep(650);
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await sleep(900);
        await mark('close');
        await page.keyboard.press('Escape');
        await page.evaluate(() => { const s = document.querySelector('.g-msg-scrim, .g-msg-pop'); if (s) s.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
        await sleep(900);
      }
    }, { frames: FRAMES });
  } else {
    res.contextMenu = await measure(page, cdp, 'contextMenu', dev, async (mark) => {
      for (let i = 0; i < 3; i++) {
        const b = await page.evaluate((i) => { const bs = [...document.querySelectorAll('.message-bubble[data-message-id]')]; const e = bs[bs.length - 2 - i]; const r = e.getBoundingClientRect(); return { x: r.left + 30, y: r.top + r.height / 2 }; }, i);
        await mark('open');
        await page.mouse.click(b.x, b.y, { button: 'right' });
        await sleep(700);
        await mark('close');
        await page.keyboard.press('Escape');
        await sleep(600);
      }
    }, { frames: FRAMES });
  }

  // Settings sheet (lazy UserPanel).
  res.settings = await measure(page, cdp, 'settings', dev, async (mark) => {
    for (let i = 0; i < 2; i++) {
      await mark('open');
      if (dev === 'iphone') { await tap(page, cdp, dev, '.g-tab', { text: 'Sohbetler' }).catch(() => {}); await sleep(400); await page.evaluate(() => window.dispatchEvent(new CustomEvent('descall:open-settings'))); await tap(page, cdp, dev, '.g-me-btn, .g-toolbar .g-me, [aria-label*="Profil"], [aria-label*="durum"]').catch(() => {}); await sleep(500); await tap(page, cdp, dev, '.g-menu button, [role=menuitem]', { text: 'Kullanıcı Ayarları' }).catch(() => {}); }
      else await tap(page, cdp, dev, '.rail-btn', { text: 'Kullanıcı Ayarları' }).catch(async () => tap(page, cdp, dev, '[aria-label="Kullanıcı Ayarları"]'));
      await sleep(1300);
      await mark('close');
      await page.keyboard.press('Escape');
      await sleep(1000);
    }
  }, { frames: FRAMES });

  // Servers: server list, then the 300-channel server.
  if (dev === 'iphone') { await tap(page, cdp, dev, '[data-mobile-back="1"]').catch(() => {}); await sleep(1200); }
  await tap(page, cdp, dev, tabSel, { text: 'Sunucular' });
  await sleep(1200);
  res.serverListScroll = await measure(page, cdp, 'serverListScroll', dev, async () => {
    const r = await page.evaluate(() => { const e = [...document.querySelectorAll('[class*=server]')].find((x) => /Sunucu 3\b/.test(x.textContent) && x.getBoundingClientRect().height < 120); const r = e ? e.getBoundingClientRect() : { left: 100, top: 400, width: 0, height: 0 }; return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    for (let i = 0; i < 3; i++) { await scrollGesture(cdp, dev, r.x, Math.max(200, r.y), 2500); await scrollGesture(cdp, dev, r.x, Math.max(200, r.y), -2500); }
  });
  res.openServer = await measure(page, cdp, 'openServer', dev, async () => {
    await page.evaluate(() => { const e = [...document.querySelectorAll('button, [role=button], li, a, div')].filter((x) => x.textContent.trim().startsWith('Büyük Sunucu') && x.getBoundingClientRect().width > 0).pop(); if (e) e.click(); });
    await sleep(2000);
  });
  res.channelListScroll = await measure(page, cdp, 'channelListScroll', dev, async () => {
    const r = await page.evaluate(() => { const e = [...document.querySelectorAll('[class*=channel]')].find((x) => /kanal-1\b/.test(x.textContent) && x.getBoundingClientRect().height < 80 && x.getBoundingClientRect().width > 0); const r = e ? e.getBoundingClientRect() : { left: 150, top: 400, width: 0, height: 0 }; return { x: r.left + r.width / 2, y: r.top + r.height / 2, found: !!e }; });
    res.channelRowFound = r.found;
    for (let i = 0; i < 3; i++) { await scrollGesture(cdp, dev, r.x, Math.max(250, r.y), 5000, 2400); await scrollGesture(cdp, dev, r.x, Math.max(250, r.y), -5000, 2400); }
  });
  res.dom = await page.evaluate(() => ({ nodes: document.getElementsByTagName('*').length, backdrop: [...document.querySelectorAll('*')].filter((e) => { const s = getComputedStyle(e); return s.backdropFilter && s.backdropFilter !== 'none'; }).length, html: document.documentElement.className }));
  res.pageErrors = errors;
  await ctx.close();
  return res;
}

(async () => {
  if (!fs.existsSync(path.join(DIST, 'index.html'))) { console.error(`[jank] no ${DIST}/index.html`); process.exit(1); }
  fs.mkdirSync(OUT, { recursive: true });
  const srv = await mock.start({ dist: DIST, port: PORT });
  const base = `http://127.0.0.1:${srv.port}`;
  const browser = await pw.chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--lang=tr-TR', '--font-render-hinting=none', '--enable-features=LongAnimationFrameTiming'] });
  const all = { dist: DIST, at: new Date().toISOString(), results: {} };
  try {
    for (const dev of DEVICES) {
      all.results[dev] = {}; try { await runDevice(browser, base, dev, all.results[dev]); } catch (e) { all.results[dev].error = e.stack; log(dev, 'FAIL', e.message); }
      if (SYNTHETIC.has(dev)) { all.results[dev].syntheticClicks = true; log(dev, 'NOTE: some taps fell back to element.click() (nothing hittable at the target)'); }
    }
  } finally { await browser.close().catch(() => {}); srv.close(); }
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(all, null, 1));
  log('wrote', path.join(OUT, 'results.json'));
  process.exit(0);
})();
