#!/usr/bin/env node
/* Black-flash capture in real WebKit (Playwright WebKit, the engine iOS
 * Safari / WKWebView share). Records a video of tab switches, chat open/back
 * and long-press, then splits it into frames for flicker.py.
 *   PLAYWRIGHT_CORE=<playwright-core with webkit> node e2e/perf/flicker.webkit.cjs --dist=dist-perf --out=/tmp/flk [--devices=iphone,ipad]
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const mock = require('./mockBackend.cjs');
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
const pw = require(process.env.PLAYWRIGHT_CORE || 'playwright-core');
const DIST = path.resolve(args.dist || 'dist-perf');
const OUT = path.resolve(args.out || '/tmp/descall-flicker');
const PORT = Number(args.port || 5371);
const DEVICES = String(args.devices || 'iphone').split(',');
const ROUNDS = Number(args.rounds || 5);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log('[flk]', ...a);
const UA = { iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1', ipad: 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' };
const VP = { iphone: { width: 390, height: 844 }, ipad: { width: 820, height: 1180 } };

async function clickText(page, sel, text) {
  const ok = await page.evaluate(([sel, text]) => { const e = [...document.querySelectorAll(sel)].find((x) => x.getBoundingClientRect().width > 0 && `${x.getAttribute('aria-label') || ''} ${x.textContent}`.includes(text)); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, [sel, text]);
  if (!ok) throw new Error(`no ${sel} ${text}`);
  await page.touchscreen.tap(ok.x, ok.y);
}

async function run(browser, base, dev) {
  const dir = path.join(OUT, dev);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const ctx = await browser.newContext({ viewport: VP[dev], deviceScaleFactor: 1, isMobile: true, hasTouch: true, userAgent: UA[dev], locale: 'tr-TR', timezoneId: 'Europe/Istanbul', colorScheme: 'dark', recordVideo: { dir, size: VP[dev] } });
  await ctx.route('**/*', (r) => (/^(data|blob):/.test(r.request().url()) || r.request().url().startsWith(base) ? r.continue() : r.abort()));
  await ctx.addInitScript(([api, me]) => {
    window.__DESCALL_API_URL__ = api; window.__DESCALL_SOCKET_URL__ = api;
    localStorage.setItem('descall_language', 'tr');
    localStorage.setItem('descall:ios-pwa-install-dismissed', '1');
    localStorage.setItem('descall:cookie_consent_v1', JSON.stringify({ choice: 'rejected', at: new Date().toISOString() }));
    localStorage.setItem('descall_token', 'e2e.fake.token');
    localStorage.setItem('descall_user', JSON.stringify(me));
  }, [base, mock.ME]);
  const page = await ctx.newPage();
  const t0 = Date.now();
  const marks = [];
  const mark = (m) => marks.push([m, (Date.now() - t0) / 1000]);
  mark('goto');
  await page.goto(base + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  for (let i = 0; i < 300; i++) { if (await page.evaluate(() => document.querySelectorAll('.dm-item').length > 5 && !document.getElementById('boot-splash'))) break; await sleep(100); }
  mark('booted'); await sleep(1500);
  const tab = dev === 'iphone' ? '.g-tab' : '.rail-btn, .g-tab';
  for (let r = 0; r < ROUNDS; r++) for (const t of ['Gruplar', 'Arkadaşlar', 'Sunucular', 'Sohbetler']) { mark(`tab:${t}`); await clickText(page, tab, t).catch((e) => log(e.message)); await sleep(900); }
  for (let r = 0; r < ROUNDS; r++) {
    mark('open'); await clickText(page, '.dm-item', r % 2 ? 'Mert' : 'Ayşe').catch((e) => log(e.message)); await sleep(1500);
    if (dev === 'iphone') { mark('back'); await clickText(page, '[data-mobile-back="1"]', '').catch((e) => log(e.message)); await sleep(1300); }
  }
  await clickText(page, '.dm-item', 'Ayşe').catch(() => {}); await sleep(1500);
  for (let r = 0; r < ROUNDS; r++) {
    const b = await page.evaluate((i) => { const bs = [...document.querySelectorAll('.message-bubble[data-message-id]')]; const e = bs[bs.length - 2 - (i % 3)]; if (!e) return null; const q = e.getBoundingClientRect(); return { x: q.left + 30, y: q.top + q.height / 2 }; }, r);
    if (!b) break;
    mark('press');
    await page.mouse.move(b.x, b.y); await page.mouse.down();
    await sleep(700);
    await page.mouse.up();
    await sleep(1000);
    mark('close'); await page.keyboard.press('Escape'); await page.evaluate(() => { const s = document.querySelector('.g-msg-scrim'); s && s.dispatchEvent(new MouseEvent('click', { bubbles: true })); }); await sleep(1000);
  }
  mark('end');
  const video = page.video();
  await ctx.close();
  const vp = await video.path();
  const fdir = path.join(OUT, 'frames', dev, 'all');
  fs.rmSync(fdir, { recursive: true, force: true }); fs.mkdirSync(fdir, { recursive: true });
  execFileSync(process.env.FFMPEG || 'ffmpeg', ['-loglevel', 'error', '-i', vp, '-vsync', '0', path.join(fdir, 'f%05d.png')]);
  fs.writeFileSync(path.join(OUT, `${dev}-marks.json`), JSON.stringify(marks));
  log(dev, 'video', vp, 'frames', fs.readdirSync(fdir).length);
}

(async () => {
  const srv = await mock.start({ dist: DIST, port: PORT });
  const base = `http://127.0.0.1:${srv.port}`;
  const browser = await pw.webkit.launch({ headless: true });
  try { for (const d of DEVICES) { try { await run(browser, base, d); } catch (e) { log(d, 'FAIL', e.stack); } } } finally { await browser.close(); srv.close(); }
  process.exit(0);
})();
