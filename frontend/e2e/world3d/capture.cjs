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
  await page.waitForFunction((min) => window.__descallWorld && window.__descallWorld.avatars && window.__descallWorld.avatars.size >= min, Number(process.env.MIN_AVATARS || 2), { timeout: 240000 });
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
  // step cheaply, then render the final frames with the high preset (bloom, SSAO, DOF, mirror floor)
  const finalCfg = { id: 'high', pixelRatio: 1.0, bloom: true, ssao: false, dof: true, fxaa: true, msaa: 4, mirror: true, maxAvatarsAnimated: 16, shadowBlob: true, ...JSON.parse(process.env.FINALCFG || '{}') };
  const upgrade = () => process.env.FINAL === 'high' && ev((cfg) => {
    const w = window.__descallWorld;
    w.lockQuality = true;
    w.setQuality(cfg);
  }, finalCfg);
  if (MODE === 'dbg') {
    for (let k = 0; k < 4; k += 1) {
      await step(15, 40);
      const d = await ev(() => {
        const w = window.__descallWorld;
        const out = {};
        for (const [id, a] of w.avatars) {
          const r = w.remote.get(id);
          out[id] = { st: a.state, em: a.emote && a.emote.clip, until: a.emoteUntil && Math.round(a.emoteUntil - w.nowMs() / 1000), seq: r && r.lastEmoteSeq, last: r && r.last && [r.last.state, r.last.emote, r.last.emoteSeq], w: Object.entries(a.groups).filter(([, g]) => g.w > 0.05).map(([n, g]) => n + ':' + g.w.toFixed(2)).join(' ') };
        }
        return out;
      });
      console.log(JSON.stringify(d));
    }
    await shot('dbg.png');
  } else if (MODE === 'info') {
    const info = await ev(() => {
      const w = window.__descallWorld;
      const r = (v) => Math.round(v * 100) / 100;
      return { bounds: w.bounds, seats: w.seats.map((s) => [s.name, r(s.pos.x), r(s.pos.z), r(s.yaw)]), spawns: w.spawns.map((p) => [r(p.x), r(p.z)]), hero: w.hero && [r(w.hero.pos.x), r(w.hero.pos.y), r(w.hero.pos.z)] };
    });
    console.log(JSON.stringify(info));
  } else if (MODE === 'exposures') {
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
    await ev(() => window.__descallWorld.sitOn(1));
    await step(75, 40);
    if (MODE === 'hero') {
      await page.addStyleTag({ content: '.w3d-rooms,.w3d-who,.w3d-chat,.w3d-dock,.w3d-tags,.w3d-net{display:none!important}' });
      await upgrade();
      await step(2);
      await shot('hero-1600x900.png');
    } else {
      await upgrade();
      await page.keyboard.press('g');
      await step(3, 100);
      await shot('overlay-1600x900.png');
    }
  } else if (MODE === 'lineup') {
    await ev(() => {
      const w = window.__descallWorld;
      w.local.pos.set(-4.85 + 2 * 0.68, 0, -3.3);
      w.local.yaw = 0;
      w.cameraLocked = true;
      w.camera.setTarget(new w.local.pos.constructor(-3.15, 0.95, -3.3));
      w.camera.alpha = Math.PI / 2;
      w.camera.beta = 1.48;
      w.camera.radius = 4.1;
    });
    await page.addStyleTag({ content: '.w3d-rooms,.w3d-who,.w3d-chat,.w3d-dock,.w3d-net{display:none!important}' });
    await step(45, 40);
    await shot('lineup.png');
    await ev(() => { const w = window.__descallWorld; w.camera.setTarget(new w.local.pos.constructor(-3.49, 1.25, -3.3)); w.camera.radius = 1.7; });
    await step(2);
    await shot('closeup.png');
  } else if (MODE === 'walk') {
    // click-to-move to the front of the sofa, then E (sit). Same code path as a floor click.
    await page.addStyleTag({ content: '.w3d-chat,.w3d-net{display:none!important}' });
    await ev(() => {
      const w = window.__descallWorld;
      w.camera.radius = 3.9;
      w.camFollow = 1;
      w.moveTarget = new w.local.pos.constructor(-1.75, 0, -5.05);
    });
    let n = 0;
    for (let i = 0; i < 46; i += 1) { await step(2); await shot(`walk-${String(n++).padStart(3, '0')}.png`); }
    await ev(() => window.__descallWorld.toggleSit());
    for (let i = 0; i < 26; i += 1) { await step(2); await shot(`walk-${String(n++).padStart(3, '0')}.png`); }
  }
  const stats = await ev(() => {
    const w = window.__descallWorld;
    return { ...w.stats(), avatars: w.avatars.size, quality: w.quality.id, totalVertices: w.scene.getTotalVertices() };
  });
  console.log('stats', JSON.stringify(stats));
  fs.writeFileSync(path.join(OUT, `log-${MODE}.txt`), logs.join('\n') + `\nstats ${JSON.stringify(stats)}\n`);
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
