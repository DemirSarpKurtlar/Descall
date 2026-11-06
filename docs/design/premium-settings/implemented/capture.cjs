const path = require('path');
const FRONT = process.cwd();
const mock = require(path.join(FRONT, 'e2e/perf/mockBackend.cjs'));
const pw = require(process.env.PLAYWRIGHT_CORE);
const feats = require(path.join(FRONT, 'backend/lib/premium/features.js'));
const OUT = process.argv[2];
const runs = [
  { id: 'ultra-home', plan: 'ultra', theme: 'dark' },
  { id: 'ultra-audio', plan: 'ultra', theme: 'dark', act: async (p) => { await p.click('[data-category="audio"]'); } },
  { id: 'ultra-search', plan: 'ultra', theme: 'dark', act: async (p) => { await p.fill('[data-testid="premium-search"]', 'kısayol'); } },
  { id: 'ultra-plans', plan: 'ultra', theme: 'dark', act: async (p) => { await p.click('[data-testid="premium-open-plans"]'); } },
  { id: 'plus-home', plan: 'plus', theme: 'dark' },
  { id: 'plus-desktoptools', plan: 'plus', theme: 'dark', act: async (p) => { await p.click('[data-category="desktop_tools"]'); } },
  { id: 'free-home', plan: null, theme: 'dark' },
  { id: 'ultra-light', plan: 'ultra', theme: 'light' },
  { id: 'ultra-phone', plan: 'ultra', theme: 'dark', vp: { width: 393, height: 852 } },
];
(async () => {
  const srv = await mock.start({ dist: path.join(FRONT, 'dist-e2e'), port: 5361 });
  const base = `http://127.0.0.1:${srv.port}`;
  const b = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  for (const r of runs) {
    Object.assign(mock.ME, { username: 'admin', displayName: 'Demirr', display_name: 'Demirr', isAdmin: true, is_admin: true, status: 'online', premium_plan: r.plan });
    const ctx = await b.newContext({ viewport: r.vp || { width: 1280, height: 800 }, deviceScaleFactor: 2, locale: 'tr-TR', timezoneId: 'Europe/Istanbul', colorScheme: r.theme });
    await ctx.route('**/*', async (rt) => {
      const url = rt.request().url();
      if (/^(data|blob):/.test(url)) return rt.continue();
      if (!url.startsWith(base)) return rt.abort();
      if (new URL(url).pathname === '/api/premium/me') {
        const list = r.plan ? (feats.featuresFor || feats.default.featuresFor)(r.plan).map((f) => f.key || f) : [];
        return rt.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ plan: r.plan, status: r.plan ? 'active' : null, ends_at: r.plan === 'plus' ? '2027-01-06T05:00:00Z' : null, unlimited: r.plan === 'ultra', features: list, monthly_descoin: r.plan === 'plus' ? 5000 : r.plan ? 15000 : 0, next_coin_at: r.plan ? '2026-12-06T05:00:00Z' : null }) });
      }
      return rt.continue();
    });
    await ctx.addInitScript(([api, me]) => {
      window.__DESCALL_API_URL__ = api; window.__DESCALL_SOCKET_URL__ = api;
      localStorage.setItem('descall_language', 'tr');
      localStorage.setItem('descall:cookie_consent_v1', JSON.stringify({ choice: 'rejected', at: new Date().toISOString() }));
      localStorage.setItem('descall_token', 'e2e.fake.token');
      localStorage.setItem('descall_user', JSON.stringify(me));
      // a few features switched on (web build: localStorage)
      for (const k of ['mini_mode', 'always_on_top', 'global_ptt', 'noise_gate', 'mic_presets', 'focus_mode', 'game_status', 'gaming_hud']) localStorage.setItem('descall:premium:' + k, JSON.stringify({ enabled: true }));
      for (const k of ['mic_monitor', 'audio_routing', 'clipboard_history', 'quick_file_drop', 'app_lock', 'widgets', 'desktop_sidebar']) localStorage.setItem('descall:premium:' + k, JSON.stringify({ enabled: false }));
    }, [base, mock.ME]);
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', (e) => errs.push(String(e.message || e)));
    await page.goto(`${base}/settings/premium`, { waitUntil: 'load' });
    await page.waitForSelector('[data-testid="premium-tab"]', { timeout: 15000 });
    await page.waitForTimeout(2500);
    await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), r.theme);
    if (r.act) { await r.act(page); await page.waitForTimeout(600); }
    await page.screenshot({ path: path.join(OUT, `${r.id}.png`) });
    const info = await page.evaluate(() => ({ tiles: document.querySelectorAll('[data-category]').length, rows: document.querySelectorAll('[data-feature]').length, total: document.querySelector('[data-testid="premium-tab"]')?.getAttribute('data-feature-total') }));
    console.log(r.id, JSON.stringify(info), errs.length ? 'ERR ' + errs.join(' | ').slice(0, 300) : '');
    await ctx.close();
  }
  await b.close(); process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
