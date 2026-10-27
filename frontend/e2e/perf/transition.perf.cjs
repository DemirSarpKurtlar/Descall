'use strict';

/**
 * Page-transition benchmark (DM list → chat and back, server → channel and
 * back, settings sheet and a settings sub-page). Not a CI test: a measuring
 * tool, same mock backend and dist setup as jank.perf.cjs.
 *
 * For every transition it records a Chrome trace and reports, per tap:
 *   - startMs: tap → first compositor frame that shows the page moving
 *     (transitionstart / animationstart of the sliding surface),
 *   - frames inside the motion window [start, start + duration]: compositor
 *     frames drawn (viz DrawFrame), longest gap, gaps > 1.5 vsync,
 *   - main thread: long tasks, script / style / layout / paint ms in the window,
 *   - rAF deltas (main-thread frame clock) over [tap, end of motion].
 *
 * iPhone runs as the Capacitor app by default (a stub window.Capacitor so the
 * page takes the html.native-app path, like the TestFlight build); --web runs
 * the Safari path. CPU throttling 4× (phone / iPad), 2× desktop.
 *
 *   VITE_API_BASE_URL=http://127.0.0.1:5371 VITE_SOCKET_URL=http://127.0.0.1:5371 npx vite build --outDir /tmp/dist-perf
 *   node e2e/perf/transition.perf.cjs --dist=/tmp/dist-perf --out=/tmp/tr-run [--devices=iphone,ipad,desktop] [--web] [--reps=4] [--frames]
 */

const fs = require('fs');
const path = require('path');
const mock = require('./mockBackend.cjs');

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
const pw = require(process.env.PLAYWRIGHT_CORE || 'playwright-core');
const DIST = path.resolve(args.dist || path.join(__dirname, '../../dist-perf'));
const OUT = path.resolve(args.out || '/tmp/descall-transition');
const DEVICES = String(args.devices || 'iphone').split(',').filter(Boolean);
const ONLY = args.only ? String(args.only).split(',') : null;
const REPS = Number(args.reps || 4);
const NATIVE = !args.web;
const FRAMES = Boolean(args.frames);
const CHROME = process.env.CHROME_PATH || '/usr/bin/google-chrome';
const PORT = Number(args.port || 5371);
const log = (...a) => console.log('[tr]', ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148';
const IPAD_UA = 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148';
const DEV = {
  iphone: { ctx: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: IPHONE_UA }, touch: true, cpu: 4 },
  ipad: { ctx: { viewport: { width: 1024, height: 1366 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: IPAD_UA }, touch: true, cpu: 4 },
  desktop: { ctx: { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false }, touch: false, cpu: 2 },
};

// In-page probe: rAF clock + transition / animation lifecycle of anything big.
const PROBE = () => {
  const J = { on: false, frames: [], ev: [] };
  window.__tr = J;
  const tick = (t) => { if (!J.on) return; J.frames.push(t); requestAnimationFrame(tick); };
  const big = (el) => { try { const r = el.getBoundingClientRect(); return r.width * r.height > 0.25 * innerWidth * innerHeight; } catch { return false; } };
  const name = (el) => `${el.tagName.toLowerCase()}.${String(el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className).trim().split(/\s+/).slice(0, 3).join('.')}`;
  // No layout reads in the listeners (they would force a layout mid-transition
  // and pollute the numbers); size and duration are read once, after settle.
  for (const type of ['transitionrun', 'transitionstart', 'transitionend', 'transitioncancel', 'animationstart', 'animationend']) {
    document.addEventListener(type, (e) => { if (!J.on) return; J.raw.push({ type, t: performance.now(), prop: e.propertyName || e.animationName, target: e.target }); }, true);
  }
  document.addEventListener('touchend', () => { if (J.on) { J.tap = J.tap ?? performance.now(); performance.mark('tr-tap'); } }, true);
  document.addEventListener('mouseup', () => { if (J.on) { J.tap = J.tap ?? performance.now(); performance.mark('tr-tap'); } }, true);
  J.begin = () => { J.frames = []; J.ev = []; J.raw = []; J.tap = null; J.on = true; requestAnimationFrame(tick); };
  J.end = () => { J.on = false; const cache = new Map(); J.ev = J.raw.filter((r) => { if (!cache.has(r.target)) cache.set(r.target, big(r.target)); return cache.get(r.target); }).map((r) => ({ type: r.type, t: r.t, prop: r.prop, el: name(r.target), dur: (() => { try { const cs = getComputedStyle(r.target); return r.type.startsWith('animation') ? parseFloat(cs.animationDuration) * 1000 || 0 : parseFloat(cs.transitionDuration) * 1000 || 0; } catch { return 0; } })() })); J.raw = []; return { frames: J.frames.slice(), ev: J.ev.slice(), tap: J.tap, now: performance.now() }; };
};

const NATIVE_STUB = () => {
  // What the Capacitor iOS bridge injects before page scripts. No plugins: every
  // plugin call rejects as "not implemented", the app's web fallbacks run.
  window.webkit = { messageHandlers: { bridge: { postMessage() {} } } };
  window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'ios', isPluginAvailable: () => false, Plugins: {}, PluginHeaders: [] };
};

const CATS = process.env.TR_EXTRA_CATS ? ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'disabled-by-default-devtools.timeline.frame', 'viz', 'cc', 'blink.user_timing', 'benchmark', 'toplevel'].join(',') + ',' + process.env.TR_EXTRA_CATS : ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'disabled-by-default-devtools.timeline.frame', 'viz', 'cc', 'blink.user_timing', 'benchmark', 'toplevel'].join(',');
async function traceStart(cdp) { await cdp.send('Tracing.start', { categories: CATS, transferMode: 'ReturnAsStream', options: 'sampling-frequency=10000' }); }
async function traceStop(cdp) {
  const done = new Promise((r) => cdp.once('Tracing.tracingComplete', r));
  await cdp.send('Tracing.end');
  const { stream } = await done;
  let data = '';
  for (;;) { const c = await cdp.send('IO.read', { handle: stream }); data += c.base64Encoded ? Buffer.from(c.data, 'base64').toString() : c.data; if (c.eof) break; }
  await cdp.send('IO.close', { handle: stream });
  const j = JSON.parse(data);
  return Array.isArray(j) ? j : j.traceEvents;
}

// Analyse one tap. Times: page performance.now() ms; the trace mark 'tr-tap'
// ties both clocks together.
function analyse(events, probe) {
  const tapMark = events.filter((e) => e.name === 'tr-tap').sort((a, b) => a.ts - b.ts)[0];
  const rendererPid = tapMark ? tapMark.pid : null;
  const off = tapMark && probe.tap != null ? tapMark.ts / 1000 - probe.tap : null; // trace ms = page ms + off
  const tap = probe.tap;
  const motion = probe.ev.filter((e) => /start/.test(e.type) && e.t >= tap - 5);
  const run = probe.ev.filter((e) => e.type === 'transitionrun' && e.t >= tap - 5);
  const start = motion.length ? Math.min(...motion.map((e) => e.t)) : null;
  const dur = motion.length ? Math.max(...motion.map((e) => e.dur || 0)) || 380 : 380;
  const winA = start ?? tap; const winB = winA + dur;
  const toTrace = (t) => (t + off) * 1000;
  // Compositor frames presented: viz "Graphics.Pipeline" or DrawFrame on the GPU/viz side.
  const draws = events.filter((e) => (e.name === 'DrawFrame' || e.name === 'Display::DrawAndSwap') && (e.ph === 'X' || e.ph === 'B' || e.ph === 'I' || e.ph === 'i' || e.ph === 'n'));
  const drawName = draws.some((e) => e.name === 'Display::DrawAndSwap') ? 'Display::DrawAndSwap' : 'DrawFrame';
  const dts = draws.filter((e) => e.name === drawName).map((e) => e.ts / 1000 - off).sort((a, b) => a - b);
  const inWin = dts.filter((t) => t >= winA && t <= winB + 2);
  const gapsAll = [];
  const seq = [winA, ...inWin, winB];
  for (let i = 1; i < seq.length; i++) gapsAll.push(seq[i] - seq[i - 1]);
  const firstDrawAfterTap = dts.find((t) => t > tap);
  const mainEv = events.filter((e) => e.pid === rendererPid && e.ph === 'X' && e.dur);
  const main = mainEv.filter((e) => e.name === 'RunTask' && e.cat.includes('devtools.timeline'));
  const mainTid = (() => { const c = {}; mainEv.filter((e) => e.name === 'UpdateLayoutTree' || e.name === 'Layout').forEach((e) => { c[e.tid] = (c[e.tid] || 0) + 1; }); return Object.entries(c).sort((a, b) => b[1] - a[1])[0]?.[0]; })();
  const within = (e, a, b) => { const s = e.ts / 1000 - off; const f = s + e.dur / 1000; return Math.max(0, Math.min(f, b) - Math.max(s, a)); };
  const sum = (names, a, b) => Math.round(mainEv.filter((e) => String(e.tid) === mainTid && names.includes(e.name)).reduce((x, e) => x + within(e, a, b), 0));
  const A = tap, B = winB;
  const tasks = main.filter((e) => String(e.tid) === mainTid && e.dur / 1000 > 50 && within(e, A, B) > 0).map((e) => Math.round(e.dur / 1000));
  const raster = Math.round(mainEv.filter((e) => /RasterTask|RasterizerTaskImpl/.test(e.name)).reduce((x, e) => x + within(e, A, B), 0));
  const viz = Math.round(events.filter((e) => e.ph === 'X' && e.dur && (e.name === 'Display::DrawAndSwap' || e.name === 'SkiaOutputSurfaceImplOnGpu::FinishPaintCurrentFrame' || e.name === 'DirectRenderer::DrawFrame')).reduce((x, e) => x + within(e, A, B), 0));
  // Tap response: the main-thread task(s) that handle the tap (start within
  // 60 ms of it), then the first compositor frame after they finish.
  const tapTasks = main.filter((e) => String(e.tid) === mainTid).map((e) => ({ s: e.ts / 1000 - off, f: e.ts / 1000 - off + e.dur / 1000 })).filter((e) => e.s >= tap - 5 && e.s <= tap + 60 && e.f - e.s > 4);
  const tapEnd = tapTasks.length ? Math.max(...tapTasks.map((e) => e.f)) : tap;
  const respDraw = dts.find((t) => t > tapEnd);
  const tapTaskMs = tapTasks.length ? Math.round(Math.max(...tapTasks.map((e) => e.f - e.s))) : 0;
  const rafs = probe.frames.filter((t) => t >= A && t <= B + 20);
  const rd = []; for (let i = 1; i < rafs.length; i++) rd.push(rafs[i] - rafs[i - 1]);
  return {
    startMs: start != null ? Math.round(start - tap) : null,
    respMs: respDraw != null ? Math.round(respDraw - tap) : null, tapTaskMs,
    firstFrameMs: firstDrawAfterTap != null ? Math.round(firstDrawAfterTap - tap) : null,
    motion: motion.map((e) => `${e.type}:${e.prop}@${e.el}`).slice(0, 4), runs: run.length,
    durMs: Math.round(dur),
    frames: inWin.length, expected: Math.round(dur / 16.667),
    fps: +(1000 * inWin.length / dur).toFixed(1),
    maxGap: +Math.max(...gapsAll).toFixed(1),
    gapsOver25: gapsAll.filter((g) => g > 25).length,
    longTasks: tasks, longTaskMs: tasks.reduce((a, b) => a + b, 0),
    scriptMs: sum(['FunctionCall', 'EvaluateScript', 'TimerFire', 'FireAnimationFrame', 'EventDispatch', 'v8.callFunction', 'RunMicrotasks'], A, B),
    styleMs: sum(['UpdateLayoutTree', 'RecalculateStyles'], A, B), layoutMs: sum(['Layout'], A, B),
    paintMs: sum(['Paint', 'PrePaint', 'Layerize', 'UpdateLayer', 'PaintImage'], A, B), commitMs: sum(['Commit'], A, B),
    rasterMs: raster, vizMs: viz,
    rafMax: rd.length ? +Math.max(...rd).toFixed(1) : null, rafFrames: rafs.length,
    drawName,
  };
}

async function openContext(browser, base, dev) {
  const ctx = await browser.newContext({ ...DEV[dev].ctx, locale: 'tr-TR', timezoneId: 'Europe/Istanbul', colorScheme: 'dark', reducedMotion: args.reduced ? 'reduce' : 'no-preference' });
  await ctx.route('**/*', (r) => (/^(data|blob):/.test(r.request().url()) || r.request().url().startsWith(base) ? r.continue() : r.abort()));
  if (NATIVE && dev !== 'desktop') await ctx.addInitScript(NATIVE_STUB);
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

async function boxOf(page, sel, text, index = 0) {
  return page.evaluate(([sel, text, index]) => {
    const els = [...document.querySelectorAll(sel)].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.top >= 0 && r.bottom <= innerHeight && (!text || `${e.getAttribute('aria-label') || ''} ${e.getAttribute('title') || ''} ${e.textContent.trim()}`.includes(text)); });
    const hit = (e) => { const r = e.getBoundingClientRect(); for (const [fx, fy] of [[0.5, 0.5], [0.2, 0.5], [0.8, 0.5]]) { const x = r.left + r.width * fx, y = r.top + r.height * fy; const t = document.elementFromPoint(x, y); if (t && (t === e || e.contains(t))) return { x, y }; } return null; };
    const hits = els.map(hit).filter(Boolean);
    return hits[index] || null;
  }, [sel, text || null, index]);
}
async function tap(page, cdp, dev, sel, text, index = 0) {
  const box = await boxOf(page, sel, text, index);
  if (!box) throw new Error(`tap: no hittable ${sel} ${text || ''}`);
  if (DEV[dev].touch) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x, y: box.y, id: 1 }] });
    await sleep(40);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } else await page.mouse.click(box.x, box.y);
}
async function waitFor(page, label, fn, arg, ms = 15000) {
  const t0 = Date.now(); let last;
  while (Date.now() - t0 < ms) { try { last = await page.evaluate(fn, arg); } catch (e) { last = { err: e.message }; } if (last && last.ok) return last; await sleep(100); }
  throw new Error(`${label}: timeout ${JSON.stringify(last)}`);
}

const results = [];
async function measured(page, cdp, dev, name, rep, act, settle = 1500) {
  if (ONLY && !ONLY.includes(name)) { await act(); await sleep(settle); return null; }
  await traceStart(cdp);
  const stopFrames = FRAMES && rep === 0 ? await startFrames(cdp, path.join(OUT, 'frames', dev, name)) : null;
  const prof = args.profile && rep === 0;
  if (prof) { await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 200 }); await cdp.send('Profiler.start'); }
  await page.evaluate(() => window.__tr.begin());
  let err = null;
  try { await act(); } catch (e) { err = e.message; }
  await sleep(settle);
  const probe = await page.evaluate(() => window.__tr.end());
  if (prof) { const { profile } = await cdp.send('Profiler.stop'); fs.writeFileSync(path.join(OUT, `prof-${dev}-${name}.cpuprofile`), JSON.stringify(profile)); }
  if (stopFrames) await stopFrames(probe);
  const events = await traceStop(cdp);
  let r;
  if (err || probe.tap == null) r = { error: err || 'no tap seen' };
  else { try { r = analyse(events, probe); } catch (e) { r = { error: 'analyse: ' + e.message }; } }
  r.dev = dev; r.name = name; r.rep = rep;
  if (rep === 0 && args.keepTrace) fs.writeFileSync(path.join(OUT, `trace-${dev}-${name}.json`), JSON.stringify({ traceEvents: events }));
  results.push(r);
  log(`${dev.padEnd(7)} ${name.padEnd(12)} #${rep} resp=${r.respMs}ms tapTask=${r.tapTaskMs}ms start=${r.startMs}ms first=${r.firstFrameMs}ms frames=${r.frames}/${r.expected} fps=${r.fps} maxGap=${r.maxGap} >25=${r.gapsOver25} LT=${r.longTaskMs}ms [${(r.longTasks || []).join(',')}] js=${r.scriptMs} style=${r.styleMs} layout=${r.layoutMs} paint=${r.paintMs} raster=${r.rasterMs} viz=${r.vizMs}${r.error ? ' ERR ' + r.error : ''}`);
  return r;
}

async function startFrames(cdp, dir) {
  fs.mkdirSync(dir, { recursive: true });
  const list = [];
  const onFrame = (ev) => {
    const file = path.join(dir, `f${String(list.length).padStart(4, '0')}.jpg`);
    list.push({ file: path.basename(file), ts: ev.metadata.timestamp });
    fs.writeFileSync(file, Buffer.from(ev.data, 'base64'));
    cdp.send('Page.screencastFrameAck', { sessionId: ev.sessionId }).catch(() => {});
  };
  cdp.on('Page.screencastFrame', onFrame);
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 60, everyNthFrame: 1, maxWidth: 390, maxHeight: 844 });
  return async (probe) => { await cdp.send('Page.stopScreencast').catch(() => {}); cdp.off('Page.screencastFrame', onFrame); fs.writeFileSync(path.join(dir, 'frames.json'), JSON.stringify({ frames: list, probe: { tap: probe.tap, ev: probe.ev } }, null, 1)); };
}

const backSel = '[data-mobile-back="1"]';
async function toTab(page, cdp, dev, label) {
  const sel = dev === 'iphone' ? '.g-tab' : '.rail-btn';
  await tap(page, cdp, dev, sel, label).catch(async () => { await page.evaluate(([sel, label]) => { const b = [...document.querySelectorAll(sel)].find((e) => `${e.getAttribute('aria-label') || ''} ${e.textContent}`.includes(label)); b && b.click(); }, [sel, label]); });
  await sleep(1000);
}

async function runDevice(browser, base, dev) {
  const { ctx, page, cdp } = await openContext(browser, base, dev);
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
  await page.goto(base + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await waitFor(page, 'chat list', () => ({ ok: document.querySelectorAll('.dm-item').length > 10 && !document.getElementById('boot-splash') }), null, 60000);
  await sleep(2500);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: Number(args.cpu || DEV[dev].cpu) });
  const html = await page.evaluate(() => document.documentElement.className);
  log(dev, 'html:', html);
  const phone = dev === 'iphone';

  // 1. DM list → chat (the 1000-message mock DM, Ayşe) and back.
  for (let rep = 0; rep < REPS; rep++) {
    await page.evaluate(() => { const s = document.scrollingElement; if (s) s.scrollTop = 0; document.querySelectorAll('.sidebar-content').forEach((e) => { e.scrollTop = 0; }); });
    const target = phone || rep % 2 === 0 ? 'Ayşe' : 'Mert 1';
    await measured(page, cdp, dev, 'chatOpen', rep, () => tap(page, cdp, dev, '.dm-item', target), 1800);
    if (phone) await measured(page, cdp, dev, 'chatBack', rep, () => tap(page, cdp, dev, backSel), 1400);
  }
  if (phone) await page.evaluate(() => document.querySelector('[data-mobile-back="1"]') && null);

  // 2. Servers → a server → a channel, and back.
  await toTab(page, cdp, dev, 'Sunucular');
  for (let rep = 0; rep < Math.min(REPS, 3); rep++) {
    await measured(page, cdp, dev, 'serverOpen', rep, () => tap(page, cdp, dev, '.server-list-item, .g-server-rail-btn', 'Sunucu 3'), 1500);
    await measured(page, cdp, dev, 'channelOpen', rep, () => tap(page, cdp, dev, '.server-channel-row', 'kanal-1'), 1500);
    if (phone) {
      await measured(page, cdp, dev, 'channelBack', rep, () => tap(page, cdp, dev, backSel), 1400);
      await measured(page, cdp, dev, 'serverBack', rep, () => tap(page, cdp, dev, '.server-back-btn'), 1400);
    }
  }

  // 3. Settings sheet.
  await toTab(page, cdp, dev, 'Sohbetler');
  for (let rep = 0; rep < Math.min(REPS, 3); rep++) {
    if (phone) {
      await tap(page, cdp, dev, '.g-me-btn').catch(() => {}); await sleep(700);
      await measured(page, cdp, dev, 'settingsOpen', rep, () => tap(page, cdp, dev, '.status-picker-item', 'Kullanıcı Ayarları'), 1600);
    } else {
      await measured(page, cdp, dev, 'settingsOpen', rep, () => tap(page, cdp, dev, '.rail-btn, [aria-label="Kullanıcı Ayarları"]', 'Kullanıcı Ayarları'), 1600);
    }
    if (phone) {
      const sub = await page.evaluate(() => { const e = [...document.querySelectorAll('.us-nav-item')].find((b) => /^Görünüm/.test(b.textContent.trim()) && b.getBoundingClientRect().height > 30); return e ? 'Görünüm' : null; });
      if (sub) {
        await measured(page, cdp, dev, 'settingsSub', rep, () => tap(page, cdp, dev, '.us-nav-item', sub), 1400);
        await measured(page, cdp, dev, 'settingsSubBack', rep, () => tap(page, cdp, dev, '.s3-back'), 1400);
      }
    }
    await page.keyboard.press('Escape'); await sleep(1200);
  }
  await page.screenshot({ path: path.join(OUT, `${dev}-end.png`) }).catch(() => {});
  await ctx.close();
  return errors;
}

(async () => {
  if (!fs.existsSync(path.join(DIST, 'index.html'))) { console.error(`[tr] no ${DIST}/index.html`); process.exit(1); }
  fs.mkdirSync(OUT, { recursive: true });
  const srv = await mock.start({ dist: DIST, port: PORT });
  const base = `http://127.0.0.1:${srv.port}`;
  const browser = await pw.chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--lang=tr-TR', '--font-render-hinting=none'] });
  const all = { dist: DIST, native: NATIVE, at: new Date().toISOString(), errors: {} };
  try {
    for (const dev of DEVICES) { try { all.errors[dev] = await runDevice(browser, base, dev); } catch (e) { all.errors[dev] = [e.stack]; log(dev, 'FAIL', e.message); } }
  } finally { await browser.close().catch(() => {}); srv.close(); }
  all.results = results;
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(all, null, 1));
  log('wrote', path.join(OUT, 'results.json'));
  process.exit(0);
})();
