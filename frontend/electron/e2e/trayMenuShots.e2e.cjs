'use strict';

/**
 * Tray panel screenshots (draft B "Gelismis menu") with a fake shell bridge.
 * Renders frontend/public/tray-menu/tray-menu.html in Playwright Chromium, the way both
 * shells load it, and saves docs/desktop/tray-menu/*.png:
 *   01-normal.png, 02-update-badges-call.png, 03-status-submenu.png, 04-light.png,
 *   05-keyboard-snooze.png
 * Run from frontend/: node electron/e2e/trayMenuShots.e2e.cjs [--out=<dir>]
 * Needs the playwright package (devDependency of the e2e scripts); skips when missing.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

let playwright;
try {
  playwright = require('playwright');
} catch (_) {
  console.log('trayMenuShots: playwright not installed, skipped');
  process.exit(0);
}

const { PANEL, placePanel } = require('../trayMenuModel.cjs');

const root = path.join(__dirname, '..', '..', 'public');
const outArg = process.argv.find((a) => a.startsWith('--out='));
const outDir = outArg ? path.resolve(outArg.slice(6)) : path.join(__dirname, '..', '..', '..', 'docs', 'desktop', 'tray-menu');
const tr = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'i18n', 'tr.json'), 'utf8')).tray;
const en = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'i18n', 'en.json'), 'utf8')).tray;

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };

function serve() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const u = new URL(req.url, 'http://x');
      const file = path.join(root, path.normalize(u.pathname).replace(/^([/\\])+/, ''));
      if (!file.startsWith(root) || !fs.existsSync(file)) {
        res.writeHead(404);
        res.end();
        return;
      }
      res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
    });
    srv.listen(0, '127.0.0.1', () => resolve(srv));
  });
}

// A 1920x1080 screen with the taskbar at the bottom and the tray icon near the right end.
const work = { x: 0, y: 0, width: 1920, height: 1032 };
const tray = { x: 1780, y: 1040, width: 24, height: 32 };
const place = placePanel({ tray, work });
const placement = { ...place, pad: PANEL.pad, gap: PANEL.gap, card: PANEL.card, flyoutWidth: PANEL.flyout };

const AVATAR = 'data:image/svg+xml;base64,'; // replaced below by a generated PNG data URL

function baseState(over = {}) {
  return {
    seq: 1,
    openSeq: 1,
    lang: 'tr',
    strings: { ...en, ...tr },
    placement,
    premium: [],
    shell: { version: '4.0.1', updateVersion: '', autostart: true, autostartKey: 'startWithWindows', snoozeUntil: 0 },
    app: {
      signedIn: true,
      name: 'Demir',
      avatarUrl: '',
      status: 'online',
      statusText: '',
      unreadMessages: 0,
      friendRequests: 0,
      micMuted: false,
      deafened: false,
      inCall: false,
      clipAvailable: false,
      hints: { open: '', mute: 'Ctrl+Shift+M', deafen: 'Ctrl+Shift+D', clip: '' },
      theme: 'dark',
      accent: '',
      locale: 'tr',
    },
    ...over,
  };
}

const PREMIUM = [
  { type: 'item', id: 'premium|noop', label: 'Aramada: Ekip Odası', enabled: false },
  { type: 'item', id: 'premium|action|leave', label: 'Aramadan ayrıl', enabled: true },
  { type: 'separator' },
  {
    type: 'submenu', id: 'p.focus', label: 'Odak modu', enabled: true, items: [
      { type: 'item', id: 'premium|focus|30', label: '30 dakika', enabled: true },
      { type: 'item', id: 'premium|focus|60', label: '1 saat', enabled: true },
      { type: 'item', id: 'premium|focus|120', label: '2 saat', enabled: true },
      { type: 'separator' },
      { type: 'item', id: 'premium|focus|0', label: 'Odak modunu bitir', enabled: false },
    ],
  },
];

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  const srv = await serve();
  const base = `http://127.0.0.1:${srv.address().port}/tray-menu/tray-menu.html`;
  const browser = await playwright.chromium.launch();
  const avatarPng = await (async () => {
    const p = await browser.newPage({ viewport: { width: 96, height: 96 } });
    await p.setContent('<div style="width:96px;height:96px;background:radial-gradient(circle at 35% 30%,#ffd8a8,#f59f5a 45%,#b94e7c 100%);display:grid;place-items:center;font:700 44px system-ui;color:#fff">D</div>');
    const buf = await p.screenshot();
    await p.close();
    return `data:image/png;base64,${buf.toString('base64')}`;
  })();
  void AVATAR;

  async function shot(name, state, { before, wallpaper = 'dark' } = {}) {
    const ctx = await browser.newContext({ viewport: { width: place.width, height: place.height }, deviceScaleFactor: 2 });
    await ctx.addInitScript((s) => {
      window.__acts = [];
      window.trayMenuAPI = {
        getState: () => Promise.resolve(s),
        onState: (cb) => { window.__push = cb; return () => {}; },
        act: (a, arg) => window.__acts.push([a, arg]),
      };
    }, state);
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(base);
    // Harness only: a desktop wallpaper behind the transparent window (CSSOM, so the page's
    // own CSP stays on and would catch inline styles or scripts).
    await page.evaluate((bg) => { document.documentElement.style.background = bg; }, wallpaper === 'light'
      ? 'linear-gradient(135deg,#dfe7f7 0%,#f3e9f1 55%,#e6efe9 100%)'
      : 'radial-gradient(90% 70% at 20% 10%,#2f3c7a 0%,rgba(47,60,122,0) 60%),radial-gradient(80% 60% at 90% 80%,#5b2a5e 0%,rgba(91,42,94,0) 60%),#121522');
    await page.waitForSelector('.row');
    if (before) await before(page);
    await page.waitForTimeout(250);
    const file = path.join(outDir, name);
    // The card (and an open flyout) with some wallpaper around it, not the whole window.
    const clip = await page.evaluate(() => {
      const rects = [document.getElementById('card'), document.getElementById('flyout')]
        .filter((el) => el && !el.hidden)
        .map((el) => el.getBoundingClientRect());
      const m = 28;
      const x = Math.max(0, Math.min(...rects.map((r) => r.left)) - m);
      const y = Math.max(0, Math.min(...rects.map((r) => r.top)) - m);
      const right = Math.min(window.innerWidth, Math.max(...rects.map((r) => r.right)) + m);
      const bottom = Math.min(window.innerHeight, Math.max(...rects.map((r) => r.bottom)) + m);
      return { x, y, width: right - x, height: bottom - y };
    });
    await page.screenshot({ path: file, clip });
    const acts = await page.evaluate(() => window.__acts);
    await ctx.close();
    if (errors.length) throw new Error(`${name}: page errors: ${errors.join(' | ')}`);
    console.log(`saved ${path.relative(process.cwd(), file)} (acts: ${JSON.stringify(acts)})`);
    return acts;
  }

  await shot('01-normal.png', baseState({ app: { ...baseState().app, avatarUrl: avatarPng, unreadMessages: 3 } }));

  await shot('02-update-badges-call.png', baseState({
    premium: PREMIUM,
    shell: { ...baseState().shell, updateVersion: '4.0.2', snoozeUntil: Date.now() + 25 * 60 * 1000 },
    app: {
      ...baseState().app,
      avatarUrl: avatarPng,
      status: 'dnd',
      statusText: 'Kod yazıyorum',
      unreadMessages: 12,
      friendRequests: 2,
      inCall: true,
      micMuted: true,
      clipAvailable: true,
      hints: { open: '', mute: 'Ctrl+Alt+M', deafen: 'Ctrl+Alt+D', clip: 'Alt+F10' },
    },
  }));

  await shot('03-status-submenu.png', baseState({ app: { ...baseState().app, avatarUrl: avatarPng, status: 'idle', unreadMessages: 3, friendRequests: 1 } }), {
    before: async (page) => {
      await page.hover('[data-id="status"]');
      await page.waitForSelector('#flyout:not([hidden]) .row');
      await page.hover('#flyout [data-id="status:dnd"]');
    },
  });

  await shot('04-light.png', baseState({
    premium: PREMIUM.slice(3),
    shell: { ...baseState().shell, updateVersion: '4.0.2' },
    app: { ...baseState().app, theme: 'light', avatarUrl: '', name: 'Ayşe Yılmaz', status: 'idle', unreadMessages: 128, friendRequests: 4, clipAvailable: true, hints: { open: '', mute: 'Ctrl+Shift+M', deafen: 'Ctrl+Shift+D', clip: 'Alt+F10' } },
  }), { wallpaper: 'light' });

  await shot('05-keyboard-snooze.png', baseState({
    shell: { ...baseState().shell, snoozeUntil: Date.now() + (7 * 60 + 59) * 60 * 1000 },
    app: { ...baseState().app, avatarUrl: avatarPng, unreadMessages: 0, friendRequests: 0 },
  }), {
    before: async (page) => {
      for (const k of ['ArrowDown', 'ArrowDown', 'ArrowDown', 'ArrowRight']) await page.keyboard.press(k);
    },
  });

  await browser.close();
  srv.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
