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

/**
 * Room preview modes (no mock server needed): ROOM=cinema|game-room|camp|living-room
 *   room    -> room-<id>.png from the draft's hero angle with the cast seated
 *              (SCREEN=demo|off for the cinema screen; FRAMES = frames stepped first)
 *   layout  -> prints the room's phase 1 GLB layout as JSON (living room migration)
 */
async function roomMode(browser) {
  const room = process.env.ROOM || 'cinema';
  const page = await browser.newPage({ viewport: { width: Number(process.env.W || 1600), height: Number(process.env.H || 900) }, deviceScaleFactor: 1 });
  const logs = [];
  page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
  const quality = process.env.Q || 'high';
  const extra = (process.env.DRESSING ? `&dressing=${process.env.DRESSING}` : '') + (process.env.ROBOT ? `&robot=${process.env.ROBOT}` : '');
  await page.goto(`${BASE}?room=${room}&quality=${quality}&screen=${process.env.SCREEN || 'demo'}${extra}`, { waitUntil: 'load' });
  const t0 = Date.now();
  try {
    await page.waitForFunction(() => window.__roomPreview && window.__descallWorld && window.__descallWorld.avatars.size > 0, null, { timeout: 300000 });
  } catch (e) {
    console.log(logs.join('\n'));
    throw e;
  }
  console.log('room ready in', Date.now() - t0, 'ms');
  const ev = (fn, arg) => page.evaluate(fn, arg);
  if (MODE === 'layout') {
    const L = await ev(() => window.__roomPreview.layoutFromGlb());
    const file = path.join(OUT, `${room}.layout.json`);
    fs.writeFileSync(file, JSON.stringify(L, null, 1));
    console.log('saved', file);
  } else {
    if (process.env.LOOK) {
      // grade iteration: {tints:{name:[r,g,b]}, exposure, contrast, curves:{...}, emissive:{EMIT_x:level}, beam, fog}
      await ev((v) => {
        const w = window.__descallWorld;
        for (const m of w.scene.meshes) {
          const mat = m.material;
          if (!mat || !mat.albedoColor) continue;
          const t = (v.tints || {})[m.name] || (v.tints || {})[mat.name];
          if (t) mat.albedoColor.set(t[0], t[1], t[2]);
          if (v.emissive && v.emissive[mat.name] != null) mat.emissiveIntensity = v.emissive[mat.name];
        }
        const ip = w.pipeline.imageProcessing;
        if (v.exposure) ip.exposure = v.exposure;
        if (v.contrast) ip.contrast = v.contrast;
        if (v.curves) Object.assign(ip.colorCurves, v.curves);
        if (v.lights) for (const l of w.lights) if (v.lights[l.name] != null) l.intensity = v.lights[l.name];
      }, JSON.parse(process.env.LOOK));
    }
    const frames = Number(process.env.FRAMES || 60);
    for (let i = 0; i < frames; i += 10) await ev((n) => window.__roomPreview.step(n), Math.min(10, frames - i));
    await ev(() => window.__descallWorld.resetCamera());
    await ev(() => window.__roomPreview.step(2));
    const name = process.env.SHOT || `room-${room}.png`;
    await page.screenshot({ path: path.join(OUT, name), timeout: 300000 });
    console.log('saved', path.join(OUT, name));
    const stats = await ev(() => ({ ...window.__descallWorld.stats(), totalVertices: window.__descallWorld.scene.getTotalVertices(), seats: window.__descallWorld.seats.length }));
    console.log('stats', JSON.stringify(stats));
  }
  fs.writeFileSync(path.join(OUT, `log-room-${room}.txt`), logs.join('\n'));
  await browser.close();
}

async function main() {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  if (MODE === 'room' || MODE === 'layout') return roomMode(browser);
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
  const logs = [];
  page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
  const quality = process.env.Q || 'high';
  const looks = MODE === 'lineup' ? '&looks=elif:0,can:1,zeynep:2,demir:3,mert:4,ayse:5' : '&looks=ayse:3,mert:5,zeynep:2,can:6,elif:7,demir:0';
  const me = process.env.ME || 'demir';
  const meName = me[0].toUpperCase() + me.slice(1);
  await page.goto(`${BASE}?port=4791&me=${me}&name=${meName}&speakers=ayse,zeynep&quality=${quality}&lang=tr${looks}`, { waitUntil: 'load' });
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
  if (MODE === 'grade') {
    await ev((k) => { const w = window.__descallWorld; const s = w.seats[k]; w.local.pos.set(s.pos.x + Math.sin(s.yaw) * 0.64, 0, s.pos.z + Math.cos(s.yaw) * 0.64); w.sitOn(k); }, 1);
    await step(40, 30);
    await page.addStyleTag({ content: '.w3d-rooms,.w3d-who,.w3d-chat,.w3d-dock,.w3d-tags,.w3d-net{display:none!important}' });
    const variants = JSON.parse(process.env.GRADES);
    for (let i = 0; i < variants.length; i += 1) {
      await ev((v) => {
        const w = window.__descallWorld;
        for (const m of w.scene.meshes) {
          const mat = m.material; if (!mat || !mat.albedoColor) continue;
          const key = m.name === 'FLOOR' ? 'FLOOR' : mat.name;
          if (v.tints[key]) mat.albedoColor.set(...v.tints[key]);
        }
        const ip = w.pipeline.imageProcessing; ip.exposure = v.exposure; ip.contrast = v.contrast || 1.12;
        const c = ip.colorCurves; c.globalHue = v.gh; c.globalDensity = v.gd; c.shadowsHue = v.sh; c.shadowsDensity = v.sd; c.globalSaturation = v.gs || 0;
      }, variants[i]);
      await step(1);
      await shot(`grade-${i}.png`);
    }
  } else if (MODE === 'dbg') {
    for (let k = 0; k < 4; k += 1) {
      await step(15, 40);
      const d = await ev(() => {
        const w = window.__descallWorld;
        const out = {};
        for (const [id, a] of w.avatars) {
          const r = w.remote.get(id);
          out[id] = { p: [Math.round(a.position.x * 10) / 10, Math.round(a.position.z * 10) / 10], look: a.look.index, st: a.state, em: a.emote && a.emote.clip, until: a.emoteUntil && Math.round(a.emoteUntil - w.nowMs() / 1000), seq: r && r.lastEmoteSeq, last: r && r.last && [r.last.state, r.last.emote, r.last.emoteSeq], w: Object.entries(a.groups).filter(([, g]) => g.w > 0.05).map(([n, g]) => n + ':' + g.w.toFixed(2)).join(' ') };
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
    // local player sits on the second sofa (seat 1 = the draft's guitar seat; SEAT env overrides)
    await ev((k) => { const w = window.__descallWorld; const s = w.seats[k]; w.local.pos.set(s.pos.x + Math.sin(s.yaw) * 0.64, 0, s.pos.z + Math.cos(s.yaw) * 0.64); w.sitOn(k); }, Number(process.env.SEAT || 1));
    await step(45, 40);
    if (process.env.GUITAR === '1') await ev(() => window.__descallWorld.toggleGuitar());
    await step(30, 40);
    if (MODE === 'hero') {
      await page.addStyleTag({ content: '.w3d-rooms,.w3d-who,.w3d-chat,.w3d-dock,.w3d-tags,.w3d-net{display:none!important}' });
      await upgrade();
      await step(2);
      await shot('hero-1600x900.png');
    } else {
      if (process.env.ME === 'can') {
        // the draft's second chat line, typed into the real chat box
        await page.fill('.w3d-input', 'bir şarkı daha?');
        await page.press('.w3d-input', 'Enter');
        await page.waitForTimeout(600);
        await page.evaluate(() => document.activeElement && document.activeElement.blur());
      }
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
