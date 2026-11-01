'use strict';

/**
 * Evidence for phase 5 ("Karakterini oluştur", approved-ui-5.png) in headless Chromium.
 * Needs the vite dev server and e2e/world3d/worldMockServer.cjs (scenario lineup, self
 * demir): the mock runs the real routes/world3d.js + cosmeticsService on an in-memory
 * store, so the purchase confirmation and Satın al ve kaydet go through the real flow.
 *   node e2e/world3d/customizeCapture.cjs <outDir> [panel|lineup]
 * env: HARNESS_URL, MOCK_PORT, FINALCFG (JSON quality preset for the final frames)
 */
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const OUT = process.argv[2] || '/tmp/w5shots/customize';
const MODE = process.argv[3] || 'panel';
const BASE = process.env.HARNESS_URL || 'http://127.0.0.1:5199/world3d-harness.html';
const PORT = process.env.MOCK_PORT || 4791;
fs.mkdirSync(OUT, { recursive: true });

async function main() {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
  const logs = [];
  page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
  const looks = MODE === 'lineup' ? '&looks=elif:0,can:1,zeynep:2,demir:3,mert:4,ayse:5' : '&looks=elif:0,can:1,zeynep:2,mert:4,ayse:5';
  await page.goto(`${BASE}?port=${PORT}&me=demir&name=Demir&quality=low&lang=tr${looks}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__descallWorld && window.__descallWorld.avatars && window.__descallWorld.avatars.size >= 6, null, { timeout: 300000 });
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const step = async (frames, waitMs = 0) => {
    for (let i = 0; i < frames; i += 1) {
      await ev(() => window.__descallWorld.manualStep(1));
      if (waitMs) await page.waitForTimeout(waitMs);
    }
  };
  const shot = async (name) => {
    const p = path.join(OUT, name);
    await page.evaluate(() => document.activeElement && document.activeElement.blur && document.activeElement.blur());
    await page.screenshot({ path: p, timeout: 600000 });
    console.log('saved', p);
  };
  const finalCfg = { id: 'high', pixelRatio: 1.0, bloom: true, ssao: false, dof: false, fxaa: true, msaa: 2, mirror: false, maxAvatarsAnimated: 16, shadowBlob: true, ...JSON.parse(process.env.FINALCFG || '{}') };
  await step(1);
  // local player in the row, facing the camera (same spot as capture.cjs lineup)
  await ev(() => {
    const w = window.__descallWorld;
    w.local.pos.set(-4.85 + 2 * 0.68, 0, -3.3);
    w.local.yaw = 0;
  });
  await page.addStyleTag({ content: '.w3d-net{display:none!important}' });
  await step(20, 20);
  await ev((cfg) => { const w = window.__descallWorld; w.lockQuality = true; w.setQuality(cfg); }, finalCfg);

  if (MODE === 'lineup') {
    // the six outfits in a row, framed like scene-5.jpg (no overlay)
    await page.addStyleTag({ content: '.w3d-rooms,.w3d-who,.w3d-chat,.w3d-dock,.w3d-tags{display:none!important}' });
    await ev(() => {
      const w = window.__descallWorld;
      w.cameraLocked = true;
      w.camera.setTarget(new w.local.pos.constructor(-3.15, 1.02, -3.3));
      w.camera.alpha = Math.PI / 2;
      w.camera.beta = 1.5;
      w.camera.radius = 3.55;
    });
    await step(30, 20);
    await shot('lineup-6-outfits.png');
  } else {
    // open with the C key, like a person would
    await page.keyboard.press('c');
    await page.waitForSelector('.w3d-cust-item', { timeout: 60000 });
    await page.waitForFunction(() => !document.querySelector('.w3d-cust-price.is-dim'), null, { timeout: 60000 });
    await step(4, 30);
    await ev(() => window.__descallWorld && document.querySelector('.w3d-cust') && window.__descallCustomizer?.settleCamera());
    // Kıyafet as in the draft: Kapüşonlu (white) selected, no colour picked
    await page.click('[data-item="top_hoodie"]');
    if (await page.$('.w3d-cust-colors button.is-on')) await page.click('.w3d-cust-colors button.is-on');
    await step(6, 30);
    await shot('panel-kiyafet.png');
    // a paid jacket: Kaydet -> purchase confirmation -> Satın al ve kaydet
    await page.click('[data-item="top_varsity"]');
    await step(4, 30);
    await page.click('.w3d-cust-actions .w3d-cust-btn:not(.is-ghost)');
    await page.waitForSelector('.w3d-cust-buy', { timeout: 10000 });
    await step(2, 30);
    await shot('purchase-confirm.png');
    await page.click('.w3d-cust-buy .w3d-cust-btn:not(.is-ghost)');
    await page.waitForSelector('.w3d-cust-note.is-ok', { timeout: 20000 });
    await step(4, 30);
    await shot('purchase-saved.png');
    const after = await ev(async () => {
      const res = await fetch(`${location.protocol}//127.0.0.1:${new URLSearchParams(location.search).get('port')}/api/world3d/cosmetics`, { headers: { authorization: 'Bearer demir' } });
      return res.json();
    });
    console.log('after purchase', JSON.stringify({ owned: after.owned, balance: after.balance, look: after.look }));
    // the other tabs (live preview, not saved)
    for (const [tab, name, item, color] of [['hair', 'panel-sac.png', 'hair_ponytail', 3], ['acc', 'panel-aksesuar.png', 'acc_headphones', 3], ['face', 'panel-yuz.png', 'face_freckles', 2]]) {
      await page.click(`.w3d-cust-tabs button:nth-child(${['hair', 'top', 'acc', 'face'].indexOf(tab) + 1})`);
      await page.click(`[data-item="${item}"]`);
      await page.click(`.w3d-cust-colors button:nth-child(${color})`);
      await step(4, 30);
      await shot(name);
    }
    // Rastgele (owned + free only)
    await page.click('.w3d-cust-actions .w3d-cust-btn.is-ghost');
    await step(4, 30);
    await shot('panel-rastgele.png');
  }
  const stats = await ev(() => {
    const w = window.__descallWorld;
    const self = w.avatars.get(w.selfId);
    return { ...w.stats(), avatars: w.avatars.size, quality: w.quality.id, selfGroups: self && self.look.groups, selfMeshesEnabled: self && self.meshes.filter((m) => m.isEnabled()).map((m) => m.name) };
  });
  console.log('stats', JSON.stringify(stats));
  fs.writeFileSync(path.join(OUT, `log-${MODE}.txt`), logs.join('\n') + `\nstats ${JSON.stringify(stats)}\n`);
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
