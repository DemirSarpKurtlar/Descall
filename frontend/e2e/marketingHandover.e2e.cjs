'use strict';

/**
 * Hand-over check for the marketing site (SEO rounds 2 and 3, Nov 2026). The prerendered page is
 * the first paint and React takes over with a 180 ms cross-fade; the two must have the
 * same layout, or visitors see the page jump (CLS does not count it: React's page is new
 * DOM, not a moved node).
 *
 * For each page and width:
 *   1. the prerendered page with scripts blocked: every element with its own text in the
 *      first viewport, with its box;
 *   2. the full page after the hand-over: the same list from React's DOM, plus the
 *      layout-shift CLS of the whole load (PerformanceObserver, buffered).
 * Blocks are matched by text. A block that moves more than 4 px fails, as does CLS above
 * 0.01 or a hand-over score (impact x distance, like CLS) above 0.005.
 *
 *   npm run build:prod
 *   CHROME_PATH=/path/to/chrome node e2e/marketingHandover.e2e.cjs [--dist=dist] [--json=out.json] [--pages=/a,/b] [--widths=1280]
 */

const fs = require('fs');
const http = require('http');
const path = require('path');

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
const pw = require(process.env.PLAYWRIGHT_CORE || 'playwright-core');
const DIST = path.resolve(args.dist || path.join(__dirname, '../dist'));
const CHROME = process.env.CHROME_PATH || '/usr/bin/google-chrome';
const MAX_MOVE_PX = 4;
const MAX_CLS = 0.01;
const MAX_HANDOVER = 0.005;

/** Twins of the SEO rounds: home and landings, the core pages, the info and SeoLandingShell pages, contact. */
const PAGES = [
  '/', '/features', '/faq', '/download', '/status', '/privacy', '/terms', '/copyright',
  '/de/faq', '/es/download', '/fr/status', '/pt-br/features', '/ru/privacy',
  '/tr', '/tr/features', '/gizlilik', '/discord-alternative-for-friends', '/tr/discord-alternatifi',
  '/blog/discord-competitors', '/de/blog/leave-nitro-keep-voice-chat', '/tr/blog/discord-competitors',
  // Round 3 (Nov 2026): seo/landingTwins.js and seo/infoTwins.js.
  '/compare/discord', '/alternatives', '/discord-alternative', '/best-discord-alternative-for-gamers', '/blog',
  '/about', '/security', '/who-owns-descall',
  '/de/compare/discord', '/es/alternatives', '/fr/about', '/pt-br/security', '/ru/who-owns-descall',
  '/de/blog', '/ru/best-discord-alternative-for-gamers',
  '/tr/compare/discord', '/tr/about', '/descall-sahibi', '/tr/blog',
  // The contact page and its form (seo/infoTwins.js contactTwin).
  '/contact', '/de/contact', '/ru/contact', '/iletisim',
];
const WIDTHS = [1280, 390];
// Local runs: --pages=/a,/b and --widths=1280 measure a subset.
const RUN_PAGES = args.pages ? String(args.pages).split(',') : PAGES;
const RUN_WIDTHS = args.widths ? String(args.widths).split(',').map(Number) : WIDTHS;

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.json': 'application/json', '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.webm': 'video/webm', '.mp4': 'video/mp4', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain', '.xml': 'application/xml' };

/** Cloudflare Pages style: /x serves x.html. */
function serve(req, res) {
  let p = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
  if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);
  let file = path.join(DIST, p === '/' ? 'index.html' : p);
  if (!file.startsWith(DIST)) { res.writeHead(400); return res.end(); }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = `${file}.html`;
  if (!fs.existsSync(file)) { res.writeHead(404, { 'content-type': 'text/html' }); return res.end('404'); }
  res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}

/** Runs in the page: text blocks of the first viewport under `rootSel`. */
function textBlocks([rootSel, H]) {
  const root = document.querySelector(rootSel);
  if (!root) return [];
  const out = [];
  const seen = new Map();
  for (const el of root.querySelectorAll('*')) {
    if (el.closest('footer, .seo-footer, .mkt-footer, #mkt-consent-static, [class*="cookie"], [role="dialog"], noscript, script, style, template')) continue;
    const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').replace(/\s+/g, ' ').trim();
    if (own.length < 2) continue;
    const b = el.getBoundingClientRect();
    if (!b.width || !b.height) continue;
    const y = b.y + window.scrollY;
    if (y > H || y + b.height < 0) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || Number(cs.opacity) === 0) continue;
    const key = own.slice(0, 48);
    const n = (seen.get(key) || 0) + 1;
    seen.set(key, n);
    out.push({ key: `${key}#${n}`, x: Math.round(b.x), y: Math.round(y), w: Math.round(b.width), h: Math.round(b.height) });
  }
  return out;
}

async function stubNetwork(page) {
  // Deterministic: the status probe answers OK, GitHub release lookups fail fast.
  await page.route('**/api/status', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"status":"ok"}' }));
  await page.route('https://api.github.com/**', (r) => r.abort());
  await page.route(/googletagmanager|posthog|clarity|cloudflareinsights/, (r) => r.abort());
}

async function measure(browser, base, pagePath, width) {
  const H = width < 600 ? 844 : 800;
  const opts = { viewport: { width, height: H }, locale: 'en-US', deviceScaleFactor: 1, isMobile: width < 600, hasTouch: width < 600 };
  let ctx = await browser.newContext(opts);
  let page = await ctx.newPage();
  await stubNetwork(page);
  await page.route('**/assets/**', (r) => (r.request().resourceType() === 'script' ? r.abort() : r.continue()));
  await page.goto(base + pagePath, { waitUntil: 'load' });
  await page.waitForTimeout(250);
  const shell = await page.evaluate(textBlocks, ['#seo-static', H]);
  await ctx.close();

  ctx = await browser.newContext(opts);
  page = await ctx.newPage();
  await stubNetwork(page);
  await page.addInitScript(() => {
    window.__cls = 0;
    window.__shifts = [];
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        if (e.hadRecentInput) continue;
        window.__cls += e.value;
        window.__shifts.push(`${e.value.toFixed(4)} ${(e.sources || []).map((s) => s.node && s.node.nodeName + (s.node.id ? '#' + s.node.id : '') + (typeof s.node.className === 'string' && s.node.className ? '.' + s.node.className.split(' ')[0] : '')).join(',')}`);
      }
    }).observe({ type: 'layout-shift', buffered: true });
  });
  await page.goto(base + pagePath, { waitUntil: 'load' });
  await page.waitForFunction(() => !document.getElementById('seo-static'), null, { timeout: 20000 });
  await page.waitForTimeout(900);
  const react = await page.evaluate(textBlocks, ['#root', H]);
  const { cls, shifts } = await page.evaluate(() => ({ cls: window.__cls, shifts: window.__shifts }));
  await ctx.close();

  const byKey = new Map(react.map((r) => [r.key, r]));
  let score = 0;
  const moved = [];
  for (const a of shell) {
    const b = byKey.get(a.key);
    if (!b) continue;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dh = b.h - a.h;
    const d = Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dh));
    if (d <= 1) continue;
    const top = Math.max(0, Math.min(a.y, b.y));
    const bottom = Math.min(H, Math.max(a.y + a.h, b.y + b.h));
    const left = Math.max(0, Math.min(a.x, b.x));
    const right = Math.min(width, Math.max(a.x + a.w, b.x + b.w));
    score += ((Math.max(0, bottom - top) * Math.max(0, right - left)) / (width * H)) * Math.min(1, Math.max(Math.abs(dx), Math.abs(dy)) / Math.max(width, H));
    if (d > MAX_MOVE_PX) moved.push(`"${a.key.replace(/#\d+$/, '').slice(0, 32)}" dx ${dx} dy ${dy} dh ${dh}`);
  }
  const matched = shell.filter((a) => byKey.has(a.key)).length;
  return { page: pagePath, width, cls: Number(cls.toFixed(4)), handover: Number(score.toFixed(4)), matched, blocks: shell.length, moved, shifts };
}

(async () => {
  if (!fs.existsSync(path.join(DIST, 'features.html'))) {
    console.error(`marketingHandover: ${DIST}/features.html missing, run npm run build:prod first`);
    process.exit(2);
  }
  const server = http.createServer(serve);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await pw.chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--font-render-hinting=none'] });
  const rows = [];
  const problems = [];
  try {
    for (const width of RUN_WIDTHS) {
      for (const p of RUN_PAGES) {
        const r = await measure(browser, base, p, width);
        rows.push(r);
        console.log(`${p.padEnd(34)} ${String(width).padStart(4)}px  CLS ${r.cls.toFixed(4)}  hand-over ${r.handover.toFixed(4)}  text blocks matched ${r.matched}/${r.blocks}${r.moved.length ? `  moved: ${r.moved.join('; ')}` : ''}`);
        if (r.cls > MAX_CLS) problems.push(`${p} @${width}: CLS ${r.cls} > ${MAX_CLS} (${r.shifts.join(' | ')})`);
        if (r.handover > MAX_HANDOVER) problems.push(`${p} @${width}: hand-over shift ${r.handover} > ${MAX_HANDOVER}`);
        if (r.moved.length) problems.push(`${p} @${width}: ${r.moved.length} text block(s) move more than ${MAX_MOVE_PX}px at the hand-over: ${r.moved.slice(0, 4).join('; ')}`);
        if (r.blocks && r.matched / r.blocks < 0.75) problems.push(`${p} @${width}: only ${r.matched}/${r.blocks} prerendered text blocks are on the React page (different copy?)`);
      }
    }
  } finally {
    await browser.close();
    server.close();
  }
  if (args.json) fs.writeFileSync(String(args.json), JSON.stringify(rows, null, 2));
  if (problems.length) {
    console.error(`\nmarketingHandover: ${problems.length} problem(s)\n  ${problems.join('\n  ')}`);
    process.exit(1);
  }
  console.log(`\nmarketingHandover: ok (${rows.length} page loads)`);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
