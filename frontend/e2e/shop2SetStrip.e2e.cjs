'use strict';

/**
 * Market 2.0 featured set hero ("Öne çıkan set · 1/3", "Sıradaki: ...") e2e: the piece strip
 * of EVERY set in the catalog (16+), at every width the web UI ships in (desktop / Electron /
 * Tauri, iPad landscape and portrait in the tablet layout and in the desktop-style shell,
 * iPhone), dark and light theme. Owner report 27 Nov: on the iPad the tiles were empty,
 * cropped, pushed half out, uneven, and the strip overflowed the hero.
 *
 * For each set (the storefront's featured sets are rotated through the catalog by the test):
 *   - 9 tiles, each a square of the SAME size, in rows that line up;
 *   - each tile holds its art (never empty): the art box fills the tile, and every painted
 *     child of the art stays inside the tile (contain, nothing cropped or pushed out);
 *   - a piece with no visual (join sound) shows its icon tile; a piece whose art is missing
 *     shows its type icon + name (checked with a set whose banner art is broken on purpose);
 *   - the strip stays inside the hero: it fits, or it scrolls sideways with snap.
 * And: switching sets (prev / next arrows, the "Sıradaki" chip, ArrowRight) never moves the
 * page's scroll position and keeps keyboard focus on the control that was pressed; changing
 * set in the Setler tab (switcher, phone hero arrows) does not scroll the pane either.
 *
 * Run from frontend/ against a build that points at the mock (never production):
 *   VITE_API_BASE_URL=http://127.0.0.1:5361 VITE_SOCKET_URL=http://127.0.0.1:5361 \
 *     npx vite build --outDir dist-e2e
 *   node e2e/shop2SetStrip.e2e.cjs
 * Env: PLAYWRIGHT_CORE, CHROME_PATH, DESCALL_E2E_ENGINE=webkit (Safari engine; Chromium default), DESCALL_E2E_DIST, DESCALL_E2E_PORT (5361),
 *      DESCALL_E2E_SHOTS=<dir> (per run banner shots + a contact sheet of all sets),
 *      DESCALL_E2E_RUNS=<name,name>, DESCALL_E2E_DSF=2, DESCALL_E2E_NOFAIL=1 (report only).
 * Prints "[e2e-sets] OK" and exits 0, or "[e2e-sets] FAIL <reasons>" and exits 1.
 */

const fs = require('fs');
const path = require('path');
const { boot } = require('./shop2Layout.e2e.cjs');

const DIST = process.env.DESCALL_E2E_DIST || path.join(__dirname, '../dist-e2e');
const PORT = Number(process.env.DESCALL_E2E_PORT || 5361);
const SHOTS = process.env.DESCALL_E2E_SHOTS || '';
const CHROME = process.env.CHROME_PATH || '/usr/bin/google-chrome';
const DSF = Number(process.env.DESCALL_E2E_DSF) || 1;
const ENGINE = process.env.DESCALL_E2E_ENGINE === 'webkit' ? 'webkit' : 'chromium';
const log = (...a) => console.log('[e2e-sets]', ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const IPAD_UA = 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const MAC_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
const ipad = (w, h, ua = IPAD_UA) => ({ viewport: { width: w, height: h }, isMobile: ua === IPAD_UA, hasTouch: true, userAgent: ua });
const ALL_RUNS = [
  { name: 'desktop', ctx: { viewport: { width: 1280, height: 800 } }, theme: 'dark', sweep: true },
  { name: 'desktop-1440', ctx: { viewport: { width: 1440, height: 900 } }, theme: 'dark' },
  { name: 'desktop-wide', ctx: { viewport: { width: 1920, height: 1080 } }, theme: 'dark', wide: true, sweep: true },
  { name: 'desktop-light', ctx: { viewport: { width: 1280, height: 800 } }, theme: 'light', sweep: true },
  // The owner's iPad (photo 27 Nov): the current tablet shell, landscape and portrait.
  { name: 'ipad-landscape', ctx: ipad(1366, 1024), theme: 'dark', sweep: true },
  { name: 'ipad-portrait', ctx: ipad(1024, 1366), theme: 'dark', sweep: true },
  { name: 'ipad11-landscape', ctx: ipad(1180, 820), theme: 'dark' },
  { name: 'ipad11-portrait', ctx: ipad(820, 1180), theme: 'light', sweep: true },
  { name: 'ipad-mini-portrait', ctx: ipad(744, 1133), theme: 'dark' },
  // iPadOS "desktop website" (Mac UA + touch): the desktop-style shell at iPad sizes.
  { name: 'ipad-desktop-landscape', ctx: ipad(1180, 820, MAC_UA), theme: 'dark', sweep: true },
  { name: 'ipad-desktop-portrait', ctx: ipad(820, 1180, MAC_UA), theme: 'dark' },
  // The market at the widths its own container queries switch at (Settings window, Electron).
  { name: 'window-900', ctx: { viewport: { width: 900, height: 760 } }, theme: 'dark' },
  { name: 'iphone', ctx: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, userAgent: IPHONE_UA }, theme: 'dark', sweep: true },
  { name: 'iphone-se-light', ctx: { viewport: { width: 375, height: 667 }, isMobile: true, hasTouch: true, userAgent: IPHONE_UA }, theme: 'light' },
];
const RUNS = process.env.DESCALL_E2E_RUNS ? ALL_RUNS.filter((r) => process.env.DESCALL_E2E_RUNS.split(',').includes(r.name)) : ALL_RUNS;

async function waitFor(page, label, fn, arg, ms = 30000) {
  const t0 = Date.now();
  let last;
  while (Date.now() - t0 < ms) {
    try { last = await page.evaluate(fn, arg); } catch (err) { last = `ERR ${err.message}`; }
    if (last === true || (last && last.ok)) return last;
    await sleep(150);
  }
  throw new Error(`${label}: not reached (last ${JSON.stringify(last)})`);
}

/**
 * Geometry of the hero's piece strip, read in the page. Returns problems (strings) and facts.
 * A tile is "empty" when no painted descendant of its art covers a real part of it; a preview
 * "overflows" when a painted descendant reaches outside the tile (it would be cropped or sit
 * half outside). Painted = an img / svg / canvas, a box with a background image or colour, a
 * border, or text.
 */
function stripGeometry() {
  const out = { problems: [], tiles: [], strip: null, set: '' };
  const banner = document.querySelector('.s2-banner');
  const strip = banner?.querySelector('.s2-banner-slots');
  if (!banner || !strip) { out.problems.push('no hero strip'); return out; }
  out.set = banner.querySelector('h2')?.textContent || '';
  const br = banner.getBoundingClientRect();
  const sr = strip.getBoundingClientRect();
  const cs = getComputedStyle(strip);
  out.strip = { w: Math.round(sr.width), h: Math.round(sr.height), sw: strip.scrollWidth, cw: strip.clientWidth, ox: cs.overflowX, snap: cs.scrollSnapType };
  if (sr.left < br.left - 0.5 || sr.right > br.right + 0.5) out.problems.push(`strip outside the hero (${Math.round(sr.left - br.left)} / ${Math.round(br.right - sr.right)})`);
  if (strip.scrollWidth > strip.clientWidth + 1 && (!/auto|scroll/.test(cs.overflowX) || !/x|both|inline/.test(cs.scrollSnapType))) out.problems.push(`strip overflows without a snapping scroller (${strip.scrollWidth} > ${strip.clientWidth}, ${cs.overflowX}, ${cs.scrollSnapType})`);
  const tiles = [...strip.querySelectorAll(':scope > .s2-slot')];
  if (tiles.length !== 9) out.problems.push(`${tiles.length} tiles, not 9`);
  const view = { l: sr.left, r: sr.right };
  const painted = (el) => {
    const s = getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0) return false;
    if (/^(IMG|SVG|CANVAS|svg|path|circle|rect|polygon|ellipse|g)$/.test(el.tagName)) return el.tagName !== 'g' && el.tagName !== 'path' ? true : false;
    if (s.backgroundImage && s.backgroundImage !== 'none') return true;
    if (s.backgroundColor && !/rgba\(.*,\s*0\)$|transparent/.test(s.backgroundColor)) return true;
    if (parseFloat(s.borderTopWidth) > 0 && !/rgba\(.*,\s*0\)$|transparent/.test(s.borderTopColor)) return true;
    if ([...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) return true;
    return false;
  };
  const sizes = [];
  tiles.forEach((tile, i) => {
    const tr = tile.getBoundingClientRect();
    const cat = tile.dataset.cat || '?';
    const name = tile.getAttribute('aria-label') || tile.title || '';
    const t = { i, cat, w: +tr.width.toFixed(1), h: +tr.height.toFixed(1), top: Math.round(tr.top), art: false, cover: 0, out: [] };
    sizes.push(tr);
    if (tr.width < 24 || tr.height < 24) out.problems.push(`tile ${i} (${cat}) too small ${t.w}x${t.h}`);
    if (Math.abs(tr.width - tr.height) > 1.5) out.problems.push(`tile ${i} (${cat}) not square ${t.w}x${t.h}`);
    const art = tile.querySelector(':scope > .s2-art');
    if (!art) { out.problems.push(`tile ${i} (${cat}) has no art`); out.tiles.push(t); return; }
    t.art = true;
    t.fallback = art.classList.contains('is-missing');
    const ar = art.getBoundingClientRect();
    if (ar.width < tr.width * 0.6 || ar.height < tr.height * 0.6) out.problems.push(`tile ${i} (${cat}) art box ${Math.round(ar.width)}x${Math.round(ar.height)} in a ${Math.round(tr.width)} tile`);
    if (ar.left < tr.left - 0.5 || ar.right > tr.right + 0.5 || ar.top < tr.top - 0.5 || ar.bottom > tr.bottom + 0.5) out.problems.push(`tile ${i} (${cat}) art box outside the tile`);
    // Painted coverage on a 12 x 12 grid of the tile; children reaching outside the tile.
    const N = 12;
    const hit = new Set();
    for (const el of [art, ...art.querySelectorAll('*')]) {
      if (el !== art && !painted(el)) continue;
      if (el === art && el.children.length) continue; // the art's own plate does not count
      // What is actually painted: the box clipped by every overflow-hidden ancestor inside
      // the art (a card's own clip is fine; only what still reaches outside the tile counts).
      const b0 = el.getBoundingClientRect();
      const r = { left: b0.left, top: b0.top, right: b0.right, bottom: b0.bottom };
      for (let a = el.parentElement; a && a !== art && a !== tile; a = a.parentElement) {
        const ac = getComputedStyle(a);
        if (ac.overflowX === 'visible' && ac.overflowY === 'visible') continue;
        const ab = a.getBoundingClientRect();
        r.left = Math.max(r.left, ab.left); r.top = Math.max(r.top, ab.top);
        r.right = Math.min(r.right, ab.right); r.bottom = Math.min(r.bottom, ab.bottom);
      }
      r.width = r.right - r.left;
      r.height = r.bottom - r.top;
      if (r.width < 0.5 || r.height < 0.5) continue;
      // A full-bleed backdrop larger than the tile (voice tile glow, blurred banner cover) is
      // clipped by design; anything smaller that crosses the tile edge is a cropped preview.
      const backdrop = r.left <= tr.left + 0.5 && r.right >= tr.right - 0.5 && r.top <= tr.top + 0.5 && r.bottom >= tr.bottom - 0.5;
      if (!backdrop && (r.left < tr.left - 1.5 || r.right > tr.right + 1.5 || r.top < tr.top - 1.5 || r.bottom > tr.bottom + 1.5)) {
        t.out.push(`${String(el.className?.baseVal ?? el.className).split(' ')[0] || el.tagName}:${Math.round(r.left - tr.left)},${Math.round(r.top - tr.top)},${Math.round(r.width)}x${Math.round(r.height)}`);
      }
      for (let y = 0; y < N; y += 1) for (let x = 0; x < N; x += 1) {
        const px = tr.left + ((x + 0.5) * tr.width) / N;
        const py = tr.top + ((y + 0.5) * tr.height) / N;
        if (px >= r.left && px <= r.right && py >= r.top && py <= r.bottom) hit.add(y * N + x);
      }
    }
    t.cover = +(hit.size / (N * N)).toFixed(2);
    if (t.cover < 0.08) out.problems.push(`tile ${i} (${cat}${name ? ` ${name}` : ''}) is empty (${Math.round(t.cover * 100)}% painted)`);
    if (t.out.length) out.problems.push(`tile ${i} (${cat}) preview overflows its box: ${t.out.slice(0, 3).join(' ')}`);
    // Tiles scrolled out of the strip's view are fine; tiles cut by the strip edge are not.
    if (strip.scrollWidth <= strip.clientWidth + 1 && (tr.left < view.l - 0.5 || tr.right > view.r + 0.5)) out.problems.push(`tile ${i} (${cat}) cut by the strip edge`);
    out.tiles.push(t);
  });
  if (sizes.length) {
    const w0 = sizes[0].width;
    const h0 = sizes[0].height;
    if (sizes.some((r) => Math.abs(r.width - w0) > 1 || Math.abs(r.height - h0) > 1)) out.problems.push(`tiles differ in size (${[...new Set(sizes.map((r) => `${Math.round(r.width)}x${Math.round(r.height)}`))].join(', ')})`);
    // Rows line up: every tile top is one of the row tops, every row starts at the same x.
    const tops = [...new Set(sizes.map((r) => Math.round(r.top)))];
    for (const top of tops) {
      const row = sizes.filter((r) => Math.abs(Math.round(r.top) - top) <= 1);
      if (row.some((r) => Math.abs(r.bottom - row[0].bottom) > 1)) out.problems.push('tiles in a row have uneven bottoms');
    }
    if (tops.some((a) => tops.some((b) => a !== b && Math.abs(a - b) < h0 - 1))) out.problems.push(`tiles are offset vertically (${tops.join(', ')})`);
  }
  return out;
}

async function run(browser, base, boot0, r, problems, sheet, allSets) {
  const check = (cond, msg) => { if (!cond) problems.push(`${r.name}: ${msg}`); else log(`${r.name}: ok - ${msg}`); };
  const ctx = await browser.newContext({ ...r.ctx, deviceScaleFactor: DSF, locale: 'tr-TR', timezoneId: 'Europe/Istanbul', colorScheme: r.theme });
  // Featured sets for this page load (the test walks the whole catalog 3 at a time).
  let featured = null;
  let breakArt = false;
  await ctx.route('**/api/shop2/storefront*', async (rt) => {
    const res = await rt.fetch();
    let body = await res.json().catch(() => null);
    if (body && featured) {
      const pool = [...(body.featuredSets || []), ...(body.sets || [])];
      const byKey = new Map(pool.map((s) => [s.key, s]));
      for (const s of allSets) if (!byKey.has(s.key)) byKey.set(s.key, s);
      body = { ...body, featuredSets: featured.map((k) => byKey.get(k)).filter(Boolean) };
    }
    return rt.fulfill({ response: res, body: JSON.stringify(body), headers: { ...res.headers(), 'content-type': 'application/json' } });
  });
  await ctx.route('**/api/shop2/sets/*', async (rt) => {
    const res = await rt.fetch();
    let body = await res.json().catch(() => null);
    // A missing art (bad URL) on the first set's banner, to check the type icon + name fallback.
    const fix = (set) => ({ ...set, pieces: set.pieces.map((p) => ((p.item || p).category === 'banner' ? (p.item ? { ...p, item: { ...p.item, preview_url: '/missing/banner-art.svg', asset_url: '/missing/banner-art.svg' } } : { ...p, preview_url: '/missing/banner-art.svg', asset_url: '/missing/banner-art.svg' }) : p)) });
    if (breakArt && body?.set?.pieces) body = { ...body, set: fix(body.set) };
    else if (breakArt && body?.pieces) body = fix(body);
    return rt.fulfill({ response: res, body: JSON.stringify(body), headers: { ...res.headers(), 'content-type': 'application/json' } });
  });
  await ctx.route('**/*', (rt) => (/^(data|blob):/.test(rt.request().url()) || rt.request().url().startsWith(base) ? rt.fallback() : rt.abort()));
  await ctx.addInitScript(([api, me, token, theme]) => {
    window.__DESCALL_API_URL__ = api; window.__DESCALL_SOCKET_URL__ = api;
    try { Object.defineProperty(Navigator.prototype, 'hardwareConcurrency', { get: () => 8 }); } catch { /* ignore */ }
    try {
      if (sessionStorage.getItem('__e2e')) return;
      sessionStorage.setItem('__e2e', '1');
    } catch { return; }
    localStorage.setItem('descall_language', 'tr');
    localStorage.setItem('descall:ios-pwa-install-dismissed', '1');
    localStorage.setItem('descall:cookie_consent_v1', JSON.stringify({ choice: 'rejected', at: new Date().toISOString() }));
    localStorage.setItem('descall_token', token);
    localStorage.setItem('descall_user', JSON.stringify({ ...me, language: 'tr' }));
    localStorage.setItem('descall_user_settings', JSON.stringify({ darkMode: theme !== 'light', language: 'tr' }));
  }, [base, boot0.me, boot0.token, r.theme]);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
  const wide = () => (r.wide ? page.addStyleTag({ content: 'html.glass-desktop .user-settings.is-desktop.s3-shell { width: calc(100vw - 40px) !important; max-width: none !important; height: calc(100vh - 40px) !important; }' }) : null);
  const open = async () => {
    await page.goto(`${base}/settings/shop`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await wide();
    await waitFor(page, `${r.name} hero`, () => !!document.querySelector('.s2-banner .s2-banner-slots') && !document.getElementById('boot-splash'));
    // The pointer over the hero pauses its 8 s auto-advance while the test reads it.
    await page.hover('.s2-banner h2').catch(() => {});
  };
  const settle = async () => {
    // Pieces loaded (not the 9 placeholders), images decoded, entry animation finished.
    await waitFor(page, 'pieces', () => document.querySelectorAll('.s2-banner .s2-banner-slots > .s2-slot > .s2-art:not(.is-empty)').length === 9, null, 15000).catch(() => {});
    await page.evaluate(() => Promise.all([...document.querySelectorAll('.s2-banner img')].map((i) => (i.complete ? null : new Promise((res) => { i.onload = res; i.onerror = res; })))));
    // The tiles' staggered entry (translateY) must be over before their rows are compared.
    await page.evaluate(() => Promise.race([
      Promise.all(document.getAnimations().filter((a) => a.effect?.target?.closest?.('.s2-banner-slots') && a.effect.getTiming().iterations !== Infinity).map((a) => a.finished.catch(() => null))),
      new Promise((res) => setTimeout(res, 3000)),
    ]));
    await sleep(250);
  };
  const heroShot = async (file) => {
    if (!SHOTS) return null;
    fs.mkdirSync(SHOTS, { recursive: true });
    const el = await page.$('.s2-banner');
    await el.scrollIntoViewIfNeeded();
    await sleep(150);
    const p = path.join(SHOTS, `${file}${ENGINE === 'webkit' ? '-webkit' : ''}.jpg`);
    // A clip of the page (WebKit's element screenshots drop composited layers).
    const bb = await el.boundingBox();
    await page.screenshot({ path: p, type: 'jpeg', quality: 88, clip: bb });
    return p;
  };
  try {
    // 1. Every set of the catalog in the hero, 3 per page load (the hero shows 3).
    const groups = [];
    const keys = (r.sweep ? allSets : allSets.slice(0, 3)).map((s) => s.key);
    for (let k = 0; k < keys.length; k += 3) groups.push(keys.slice(k, k + 3));
    for (let g = 0; g < groups.length; g += 1) {
      featured = groups[g];
      await open();
      for (let k = 0; k < groups[g].length; k += 1) {
        if (k) {
          await page.evaluate(() => document.querySelector('.s2-banner .s2-banner-step.is-next, .s2-banner .s2-banner-next')?.click());
        }
        await settle();
        const geo = await page.evaluate(stripGeometry);
        const setKey = groups[g][k];
        check(!geo.problems.length, `${setKey} (${geo.set}) strip: ${geo.problems.length ? geo.problems.join('; ') : `9 tiles ${geo.tiles[0]?.w}px, strip ${geo.strip.w}px${geo.strip.sw > geo.strip.cw + 1 ? ' scrolls' : ''}`}`);
        if (g === 0 && k === 0) await page.evaluate(() => window.scrollTo(0, 0));
        const p = await heroShot(`shop-sets-${r.name}-${setKey}`);
        if (p) sheet.push({ run: `${r.name}${ENGINE === 'webkit' ? ' (webkit)' : ''}`, set: setKey, name: geo.set, file: p });
      }
      if (g === 0) {
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        check(overflow <= 0, `no horizontal page overflow (${overflow})`);
      }
    }

    // 2. A broken banner art: the tile shows the type icon + name, never an empty box.
    featured = keys.slice(0, 3);
    breakArt = true;
    await open();
    await settle();
    const broken = await page.evaluate(() => {
      const tile = document.querySelector('.s2-banner .s2-slot[data-cat="banner"]');
      const art = tile?.querySelector('.s2-art');
      return { missing: !!art?.classList.contains('is-missing'), icon: !!art?.querySelector('svg'), name: art?.querySelector('.s2-art-miss-name')?.textContent || '' };
    });
    const geo = await page.evaluate(stripGeometry);
    check(broken.missing && broken.icon && broken.name && !geo.problems.length, `missing banner art shows the type icon + name (${JSON.stringify(broken)}${geo.problems.length ? ` ${geo.problems.join('; ')}` : ''})`);
    breakArt = false;

    // 2b. The owner's iPad Safari: a % height inside the aspect-ratio tile stayed unresolved
    // (auto) and the tile's row did not stretch, so absolute-only art (banner, name colour)
    // was 0 px tall and the rest sat at the top, cropped. Forcing that behaviour here must not
    // break the strip any more (the tiles no longer depend on it).
    {
      const tag = await page.addStyleTag({ content: '.s2-art.is-slot { height: auto !important; } .s2-slot { align-content: start !important; place-items: start center !important; }' });
      await sleep(300);
      const g = await page.evaluate(stripGeometry);
      check(!g.problems.length, `with the iPad Safari % height behaviour forced: ${g.problems.length ? g.problems.join('; ') : 'tiles still full and centred'}`);
      await tag.evaluate((n) => n.remove());
    }

    // 3. Switching sets never moves the page; focus stays on the pressed control.
    const scroller = () => page.evaluate(() => {
      const banner = document.querySelector('.s2-banner');
      let box = banner?.parentElement;
      while (box && box !== document.body && !(/(auto|scroll)/.test(getComputedStyle(box).overflowY) && box.scrollHeight > box.clientHeight + 1)) box = box.parentElement;
      return box && box !== document.body ? (box.id ? `#${box.id}` : `.${[...box.classList].join('.')}`) : 'document';
    });
    const sel = await scroller();
    const getTop = () => page.evaluate((sel) => (sel === 'document' ? document.scrollingElement.scrollTop : document.querySelector(sel).scrollTop), sel);
    // Scroll so the hero sits mid-screen with content above it (the owner's case).
    await page.evaluate((sel) => {
      const box = sel === 'document' ? document.scrollingElement : document.querySelector(sel);
      const b = document.querySelector('.s2-banner').getBoundingClientRect();
      const top = sel === 'document' ? 0 : box.getBoundingClientRect().top;
      box.scrollTop += b.top - top - 60;
    }, sel);
    await sleep(300);
    const t0 = await getTop();
    const title = () => page.evaluate(() => document.querySelector('.s2-banner h2')?.textContent || '');
    const steps = [
      ['next arrow', '.s2-banner .s2-banner-step.is-next'],
      ['prev arrow', '.s2-banner .s2-banner-step.is-prev'],
      ['Sıradaki chip', '.s2-banner .s2-banner-next'],
      ['dot', '.s2-banner .s2-dots button:not(.is-on)'],
    ];
    for (const [label, s] of steps) {
      const h0 = await title();
      const box = await page.evaluate((s) => { const b = document.querySelector(s)?.getBoundingClientRect(); return b ? `${Math.round(b.left)},${Math.round(b.top)} ${Math.round(b.width)}x${Math.round(b.height)}` : 'none'; }, s);
      // A real pointer press at the control (page.click would scroll it into view itself
      // when something overlaps it, which is not what a user's tap does).
      const pt = await page.evaluate((s) => {
        const el = document.querySelector(s);
        const b = el.getBoundingClientRect();
        const x = b.left + b.width / 2;
        const y = b.top + b.height / 2;
        const hit = document.elementFromPoint(x, y);
        return { x, y, ok: !!hit && el.contains(hit) };
      }, s);
      if (pt.ok) await page.mouse.click(pt.x, pt.y);
      else await page.evaluate((s) => { const el = document.querySelector(s); el.focus({ preventScroll: true }); el.click(); }, s);
      await sleep(80);
      const mid = await getTop();
      await sleep(600);
      const after = await getTop();
      const h1 = await title();
      const focus = await page.evaluate((s) => {
        const a = document.activeElement;
        return { inHero: !!a?.closest?.('.s2-banner'), cls: a?.className || a?.tagName, same: !!a?.matches?.(s.replace(':not(.is-on)', '')) };
      }, s);
      check(h1 !== h0, `${label} switches the set (${h0} -> ${h1})`);
      check(Math.abs(mid - t0) < 1 && Math.abs(after - t0) < 1, `${label}: page scroll unchanged (${t0} -> ${mid} -> ${after}, control at ${box})`);
      if (!r.ctx.isMobile) check(focus.inHero && (focus.same || label === 'dot'), `${label}: focus stays on the pressed control (${focus.cls})`);
    }
    if (!r.ctx.isMobile) {
      await page.focus('.s2-banner .s2-banner-step.is-next');
      const h0 = await title();
      await page.keyboard.press('ArrowRight');
      await sleep(500);
      await page.keyboard.press('Enter');
      await sleep(600);
      const focus = await page.evaluate(() => (document.activeElement?.matches?.('.s2-banner .s2-banner-step.is-next') ? true : String(document.activeElement?.className || document.activeElement?.tagName)));
      const h1 = await title();
      const top1 = await getTop();
      check(h1 !== h0 && Math.abs(top1 - t0) < 1 && focus === true, `ArrowRight + Enter on the next arrow: set changes, page stays, focus stays (${h0} -> ${h1}, ${t0} -> ${top1}, ${focus})`);
    }
    if (SHOTS) {
      fs.mkdirSync(SHOTS, { recursive: true });
      await page.screenshot({ path: path.join(SHOTS, `shop-sets-${r.name}-page${ENGINE === 'webkit' ? '-webkit' : ''}.jpg`), type: 'jpeg', quality: 85 });
    }

    // 4. Setler tab: picking another set keeps the pane where it is.
    await page.evaluate(() => {
      const bar = [...document.querySelectorAll('.s2-tabs, .s2-ptabs')].find((n) => n.getBoundingClientRect().width > 0);
      bar?.querySelectorAll('[role="tab"]')[1]?.click();
    });
    await waitFor(page, 'sets tab', () => !!document.querySelector('.s2-switch > button, .s2-pset-nav'));
    await sleep(800);
    const setsBox = await page.evaluate(() => {
      const root = document.querySelector('.s2-root');
      let box = root?.parentElement;
      while (box && box !== document.body && !(/(auto|scroll)/.test(getComputedStyle(box).overflowY) && box.scrollHeight > box.clientHeight + 1)) box = box.parentElement;
      return box && box !== document.body ? (box.id ? `#${box.id}` : `.${[...box.classList].join('.')}`) : 'document';
    });
    const sTop = () => page.evaluate((sel) => (sel === 'document' ? document.scrollingElement.scrollTop : document.querySelector(sel).scrollTop), setsBox);
    await page.evaluate((sel) => { const box = sel === 'document' ? document.scrollingElement : document.querySelector(sel); box.scrollTop = 160; }, setsBox);
    await sleep(300);
    const s0 = await sTop();
    const pick = await page.evaluate(() => {
      const nav = document.querySelector('.s2-pset-nav.is-next');
      if (nav && nav.getBoundingClientRect().width) { nav.click(); return 'phone hero arrow'; }
      const b = document.querySelector('.s2-switch > button:not(.is-on)');
      b?.click();
      return 'set switcher';
    });
    await sleep(700);
    const s1 = await sTop();
    check(s0 > 0 && Math.abs(s1 - s0) < 1, `Setler: ${pick} keeps the pane scroll (${s0} -> ${s1})`);
  } catch (err) {
    problems.push(`${r.name}: ${err.message}`);
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `shop-sets-${r.name}-error.jpg`), type: 'jpeg', quality: 70 }).catch(() => {});
  }
  if (errors.length) problems.push(`${r.name}: page errors ${errors.join(' | ')}`);
  await ctx.close();
}

/** One page with every hero shot of the sweep runs: rows = sets, columns = runs. */
async function contactSheet(browser, sheet) {
  if (!SHOTS || !sheet.length) return;
  const runs = [...new Set(sheet.map((s) => s.run))];
  const sets = [...new Set(sheet.map((s) => s.set))];
  const cell = (run, set) => sheet.find((s) => s.run === run && s.set === set);
  const img = (p) => `data:image/jpeg;base64,${fs.readFileSync(p).toString('base64')}`;
  const html = `<!doctype html><meta charset="utf-8"><style>
    body{margin:0;padding:16px;background:#0b0c12;color:#e7e9f5;font:13px Inter,system-ui,sans-serif}
    table{border-collapse:separate;border-spacing:10px}th{font-weight:700;text-align:left;color:#9aa3c7}
    td{vertical-align:top}td img{display:block;width:360px;height:auto;border-radius:10px}
    td.n{white-space:nowrap;font-weight:700;color:#fff}</style>
    <h2 style="margin:0 0 8px">Market: featured set hero, every set x every width</h2>
    <table><tr><th>set</th>${runs.map((r) => `<th>${r}</th>`).join('')}</tr>
    ${sets.map((s) => `<tr><td class="n">${(sheet.find((x) => x.set === s) || {}).name || s}</td>${runs.map((r) => { const c = cell(r, s); return `<td>${c ? `<img src="${img(c.file)}">` : ''}</td>`; }).join('')}</tr>`).join('')}
    </table>`;
  const ctx = await browser.newContext({ viewport: { width: 400 + runs.length * 380, height: 800 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.setContent(html, { waitUntil: 'load' });
  await page.screenshot({ path: path.join(SHOTS, `shop-sets-contact-sheet${ENGINE === 'webkit' ? '-webkit' : ''}.jpg`), type: 'jpeg', quality: 82, fullPage: true });
  await ctx.close();
  log(`contact sheet: ${path.join(SHOTS, `shop-sets-contact-sheet${ENGINE === 'webkit' ? '-webkit' : ''}.jpg`)}`);
}

(async () => {
  if (!fs.existsSync(path.join(DIST, 'index.html'))) {
    log(`FAIL no build at ${DIST}`);
    process.exit(1);
  }
  const b = await boot();
  const base = `http://127.0.0.1:${PORT}`;
  const res = await fetch(`${base}/api/shop2/sets`, { headers: { authorization: `Bearer ${b.token}` } });
  const allSets = (await res.json()).sets || [];
  if (allSets.length < 16) {
    log(`FAIL the catalog lists ${allSets.length} sets, expected 16+`);
    process.exit(1);
  }
  const pw = require(process.env.PLAYWRIGHT_CORE || 'playwright-core');
  // DESCALL_E2E_ENGINE=webkit: the iPad / iPhone engine (Safari, WKWebView). The owner's
  // broken strip was a WebKit-only layout (a % height inside an aspect-ratio grid item).
  const browser = ENGINE === 'webkit'
    ? await pw.webkit.launch({ headless: true })
    : await pw.chromium.launch({ ...(fs.existsSync(CHROME) ? { executablePath: CHROME } : {}), headless: true, args: ['--no-sandbox', '--lang=tr-TR'] });
  const problems = [];
  const sheet = [];
  for (const r of RUNS) await run(browser, base, b, r, problems, sheet, allSets);
  await contactSheet(browser, sheet.filter((s) => ['desktop', 'desktop-wide', 'desktop-light', 'ipad-landscape', 'ipad-portrait', 'ipad11-portrait', 'ipad-desktop-landscape', 'iphone'].includes(s.run.replace(' (webkit)', ''))));
  await browser.close();
  b.server.close();
  if (problems.length) {
    log(`FAIL ${problems.length} problem(s)\n  ${problems.join('\n  ')}`);
    process.exit(process.env.DESCALL_E2E_NOFAIL ? 0 : 1);
  }
  log('OK');
  process.exit(0);
})();
