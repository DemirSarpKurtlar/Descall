'use strict';

/**
 * Renders the 3D world harness in headless Chromium (SwiftShader) and saves evidence.
 * Needs: vite dev server on :5199 and e2e/world3d/worldMockServer.cjs on :4791.
 *   node e2e/world3d/capture.cjs <outDir> [mode]
 * mode: hero | overlay | walk | probe
 */
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const OUT = process.argv[2] || '/tmp/w3d/shots';
const MODE = process.argv[3] || 'hero';
const BASE = process.env.HARNESS_URL || 'http://127.0.0.1:5199/world3d-harness.html';
fs.mkdirSync(OUT, { recursive: true });

async function main() {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
  const logs = [];
  page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
  const quality = process.env.Q || 'high';
  await page.goto(`${BASE}?port=4791&me=demir&name=Demir&speakers=ayse,zeynep&quality=${quality}&lang=tr`, { waitUntil: 'load' });
  const t0 = Date.now();
  const dump = setInterval(() => { while (logs.length) console.log(logs.shift().slice(0, 400)); }, 3000);
  await page.waitForFunction(() => window.__descallWorld && window.__descallWorld.avatars && window.__descallWorld.avatars.size >= 2, null, { timeout: 240000 });
  console.log('world ready in', Date.now() - t0, 'ms');
  clearInterval(dump);
  const shot = async (name) => {
    const p = path.join(OUT, name);
    const ts = Date.now();
    await page.screenshot({ path: p, timeout: 300000 });
    console.log('shot ms', Date.now() - ts);
    console.log('saved', p);
  };
  const ev = (fn, arg) => page.evaluate(fn, arg);

  // SwiftShader is far too slow for a live loop at 1600x900: stop it and step frames by hand.
  const step = async (frames, waitMs = 0) => {
    for (let i = 0; i < frames; i += 1) {
      await ev(() => window.__descallWorld.manualStep(1));
      if (waitMs) await page.waitForTimeout(waitMs);
    }
  };
  await step(1);
  if (MODE === 'exposures') {
    await ev(() => window.__descallWorld.sitOn(2));
    await step(40, 30);
    await page.addStyleTag({ content: '.w3d-rooms,.w3d-who,.w3d-chat,.w3d-dock,.w3d-tags,.w3d-net{display:none!important}' });
    for (const e of [1.3, 1.7, 2.1]) {
      await ev((x) => { const w = window.__descallWorld; w.pipeline.imageProcessing.exposure = x; }, e);
      await step(1);
      await shot(`exp-${e}.png`);
    }
  } else if (MODE === 'probe') {
    await step(20, 50);
    await shot('probe.png');
  } else if (MODE === 'hero' || MODE === 'overlay') {
    // local player takes the draft's guitar seat (second sofa, back to the camera)
    await ev(() => window.__descallWorld.sitOn(2));
    await step(75, 40);
    if (MODE === 'hero') {
      await page.addStyleTag({ content: '.w3d-rooms,.w3d-who,.w3d-chat,.w3d-dock,.w3d-tags,.w3d-net{display:none!important}' });
      await step(1);
      await shot('hero-1600x900.png');
    } else {
      await page.keyboard.press('g');
      await step(3, 100);
      await shot('overlay-1600x900.png');
    }
  } else if (MODE === 'walk') {
    await ev(() => { const w = window.__descallWorld; w.camera.radius = 4.2; w.camFollow = 1; });
    let n = 0;
    await page.keyboard.down('w');
    for (let i = 0; i < 36; i += 1) { await step(2); await shot(`walk-${String(n++).padStart(3, '0')}.png`); }
    await page.keyboard.up('w');
    await step(10);
    await ev(() => window.__descallWorld.toggleSit());
    for (let i = 0; i < 28; i += 1) { await step(2); await shot(`walk-${String(n++).padStart(3, '0')}.png`); }
  }
  const stats = await ev(() => {
    const w = window.__descallWorld;
    return { fps: w.engine.getFps(), avatars: w.avatars.size, quality: w.quality.id, drawCalls: w.engine._drawCalls?.current, activeMeshes: w.scene.getActiveMeshes().length, totalVertices: w.scene.getTotalVertices(), activeIndices: w.scene.getActiveIndices() };
  });
  console.log('stats', JSON.stringify(stats));
  fs.writeFileSync(path.join(OUT, `log-${MODE}.txt`), logs.join('\n') + `\nstats ${JSON.stringify(stats)}\n`);
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
