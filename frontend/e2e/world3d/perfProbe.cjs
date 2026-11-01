'use strict';

/**
 * 3D world performance probe (measuring tool, not a CI test).
 *
 * Opens the dev harness against e2e/world3d/worldMockServer.cjs (scenario "perf":
 * 8 avatars, walkers, a runner, emotes, guitar, one member leaving and joining again,
 * chat every 3 s) with synthetic microphones (harness ?fakeVoice=1), then measures:
 *   - JS ms per engine frame (beginFrame -> endFrame) and frame intervals (fps, 1% low, p95, p99)
 *   - draw calls (Babylon counter and raw gl draw calls incl. post-processing),
 *     framebuffer switches (render passes) and active meshes per frame
 *   - main-thread script / layout / style time per second (CDP Performance metrics)
 *   - React commits per second (DevTools-hook stub, counts every commit on the page)
 *   - shader programs linked after load (gl.linkProgram wrapper)
 *   - bytes allocated per frame (sampling heap profiler incl. collected objects) and GC count
 *   - the worst frame around scripted events: local emote, sit, chat, emote wheel
 *     (joins / leaves / speaking come from the mock server and the fake voices)
 *
 * There is no GPU in the container: Chromium renders with SwiftShader (CPU). Two passes:
 *   full: real resolution, SwiftShader time is a rough proxy for GPU fill cost
 *   cpu:  render target scaled to 1/8, so the frame is CPU-bound (JS, scene traversal,
 *         animation, command submission) and SwiftShader fill is negligible
 * The WebGL renderer string can be faked so "auto" quality picks what a real machine gets:
 *   --gpu=iris     ANGLE (Intel, Intel(R) Iris(R) Xe Graphics ...) , 8 threads
 *   --gpu=discrete ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 ...), 12 threads
 *
 * Needs the Vite dev server (npx vite --port 5199) and the mock server:
 *   node e2e/world3d/worldMockServer.cjs 4791 perf demir
 *   node e2e/world3d/perfProbe.cjs --out=/tmp/w3d-perf --label=before --gpu=iris [--quality=auto] [--seconds=12]
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
const OUT = path.resolve(args.out || '/tmp/w3d-perf');
const LABEL = String(args.label || 'run');
const GPU = String(args.gpu || 'iris');
const QUALITY = String(args.quality || 'auto');
const SECONDS = Number(args.seconds || 12);
const WIDTH = Number(args.width || 1920);
const HEIGHT = Number(args.height || 1080);
const PASSES = String(args.passes || 'cpu,full').split(',');
const BASE = process.env.HARNESS_URL || 'http://127.0.0.1:5199/world3d-harness.html';
const MOCK_PORT = Number(process.env.WORLD_MOCK_PORT || 4791);
fs.mkdirSync(OUT, { recursive: true });

const GPUS = {
  iris: { renderer: 'ANGLE (Intel, Intel(R) Iris(R) Xe Graphics (0x00009A49) Direct3D11 vs_5_0 ps_5_0, D3D11)', vendor: 'Google Inc. (Intel)', cores: 8 },
  discrete: { renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 (0x00002504) Direct3D11 vs_5_0 ps_5_0, D3D11)', vendor: 'Google Inc. (NVIDIA)', cores: 12 },
  swiftshader: null,
};

// Runs before any page script.
function instrument(fake) {
  const P = (window.__w3dPerf = { commits: 0, gl: { draws: 0, fb: 0, link: 0, compile: 0, tex: 0 } });
  // React DevTools hook stub: React calls onCommitFiberRoot once per commit.
  const renderers = new Map();
  window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
    renderers,
    supportsFiber: true,
    isDisabled: false,
    inject(r) { const id = renderers.size + 1; renderers.set(id, r); return id; },
    onScheduleFiberRoot() {},
    onCommitFiberRoot() { P.commits += 1; },
    onCommitFiberUnmount() {},
    onPostCommitFiberRoot() {},
    checkDCE() {},
  };
  const wrap = (proto, name, fn) => {
    const orig = proto[name];
    if (typeof orig !== 'function') return;
    proto[name] = function wrapped(...a) { fn.apply(this, a); return orig.apply(this, a); };
  };
  for (const C of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) {
    if (!C) continue;
    const p = C.prototype;
    for (const n of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced']) wrap(p, n, () => { P.gl.draws += 1; });
    wrap(p, 'bindFramebuffer', function bf(target, fb) { if (this.__lastFb !== fb) { this.__lastFb = fb; P.gl.fb += 1; } });
    wrap(p, 'linkProgram', () => { P.gl.link += 1; });
    wrap(p, 'compileShader', () => { P.gl.compile += 1; });
    wrap(p, 'texImage2D', () => { P.gl.tex += 1; });
    if (fake) {
      const gp = p.getParameter;
      p.getParameter = function getParameter(pname) {
        if (pname === 0x9246) return fake.renderer; // UNMASKED_RENDERER_WEBGL
        if (pname === 0x9245) return fake.vendor; // UNMASKED_VENDOR_WEBGL
        return gp.call(this, pname);
      };
    }
  }
  if (fake) Object.defineProperty(Navigator.prototype, 'hardwareConcurrency', { get: () => fake.cores });
}

const pct = (arr, p) => {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
};
const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);
const r2 = (v) => (v == null ? null : Math.round(v * 100) / 100);

async function run(pass) {
  const browser = await chromium.launch({
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required',
      '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows', '--enable-precise-memory-info'],
  });
  const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(instrument, GPUS[GPU] || null);
  const url = `${BASE}?port=${MOCK_PORT}&me=demir&name=Demir&quality=${QUALITY}&lang=tr&fakeVoice=1`;
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__descallWorld && window.__descallWorld.avatars && window.__descallWorld.avatars.size >= 7, null, { timeout: 300000 });
  // the churn bot (selin) is in the room 6 s out of every 9 s
  await page.waitForFunction(() => window.__descallWorld.avatars.size >= 8, null, { timeout: 30000 }).catch(() => {});
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Performance.enable');

  const setup = await page.evaluate((mode) => {
    const w = window.__descallWorld;
    if (mode === 'cpu') {
      if (w.perfLockScale) w.perfLockScale(8);
      else {
        w.lockQuality = true;
        w.engine.setHardwareScalingLevel(8);
      }
    }
    const P = window.__w3dPerf;
    P.frames = [];
    let begin = 0;
    let lastEnd = 0;
    let gl0 = { ...P.gl };
    w.engine.onBeginFrameObservable.add(() => { begin = performance.now(); });
    w.engine.onEndFrameObservable.add(() => {
      const now = performance.now();
      if (!P.recording) { lastEnd = now; gl0 = { ...P.gl }; return; }
      const inst = w.instrumentation;
      P.frames.push({
        t: now,
        js: now - begin,
        interval: lastEnd ? now - lastEnd : null,
        bjsDraws: inst?.drawCallsCounter?.current ?? null,
        glDraws: P.gl.draws - gl0.draws,
        fb: P.gl.fb - gl0.fb,
        active: w.scene.getActiveMeshes().length,
      });
      lastEnd = now;
      gl0 = { ...P.gl };
    });
    return { quality: w.quality?.id, scale: w.engine.getHardwareScalingLevel(), renderW: w.engine.getRenderWidth(), renderH: w.engine.getRenderHeight() };
  }, pass);
  // settle (warm-up after load)
  await page.waitForTimeout(3000);

  const before = await page.evaluate(() => ({ gl: { ...window.__w3dPerf.gl }, commits: window.__w3dPerf.commits, t: performance.now() }));
  const m0 = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));
  await page.evaluate(() => { window.__w3dPerf.recording = true; window.__w3dPerf.events = []; });
  const mark = (name) => page.evaluate((n) => window.__w3dPerf.events.push({ name: n, t: performance.now() }), name);
  const t0 = Date.now();
  const at = async (sec, fn) => {
    const wait = t0 + sec * 1000 - Date.now();
    if (wait > 0) await page.waitForTimeout(wait);
    await fn();
  };
  const S = SECONDS / 12;
  await at(1.5 * S, async () => { await mark('emote'); await page.evaluate(() => window.__descallWorld.emote('dance')); });
  await at(3.5 * S, async () => { await mark('sit'); await page.evaluate(() => window.__descallWorld.sitOn(0)); });
  await at(6 * S, async () => {
    await mark('chat');
    await page.fill('.w3d-input', 'merhaba');
    await page.press('.w3d-input', 'Enter');
    await page.evaluate(() => document.activeElement && document.activeElement.blur());
  });
  await at(8 * S, async () => { await mark('wheel'); await page.keyboard.press('g'); });
  await at(9.5 * S, async () => { await mark('wheelClose'); await page.keyboard.press('g'); });
  await at(SECONDS, async () => {});
  await page.evaluate(() => { window.__w3dPerf.recording = false; });
  const m1 = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));
  const data = await page.evaluate((b) => {
    const P = window.__w3dPerf;
    const w = window.__descallWorld;
    const scene = w.scene;
    const pp = scene.postProcesses ? scene.postProcesses.filter((p) => p && p.isEnabled !== false).length : null;
    const camPP = w.camera?._postProcesses ? w.camera._postProcesses.filter(Boolean).length : null;
    return {
      frames: P.frames,
      events: P.events,
      commits: P.commits - b.commits,
      glAfterLoad: { link: P.gl.link - b.gl.link, compile: P.gl.compile - b.gl.compile, tex: P.gl.tex - b.gl.tex },
      elapsed: performance.now() - b.t,
      quality: w.quality?.id,
      scale: w.engine.getHardwareScalingLevel(),
      renderW: w.engine.getRenderWidth(),
      renderH: w.engine.getRenderHeight(),
      avatars: w.avatars.size,
      meshes: scene.meshes.length,
      materials: scene.materials.length,
      textures: scene.textures.length,
      renderTargets: (scene.customRenderTargets || []).length,
      postProcesses: pp,
      cameraPostProcesses: camPP,
      triangles: Math.round((scene.getActiveIndices?.() || 0) / 3),
      engines: (window.BABYLON?.EngineStore?.Instances || []).length || null,
      backdropFilters: [...document.querySelectorAll('*')].filter((el) => { const cs = getComputedStyle(el); return (cs.backdropFilter && cs.backdropFilter !== 'none') || (cs.webkitBackdropFilter && cs.webkitBackdropFilter !== 'none'); }).length,
    };
  }, before);

  // allocations + GC (separate window, profilers on)
  await page.evaluate(() => { window.__w3dPerf.allocFrames = 0; window.__descallWorld.engine.onEndFrameObservable.add(() => { if (window.__w3dPerf.allocOn) window.__w3dPerf.allocFrames += 1; }); });
  await cdp.send('HeapProfiler.enable');
  await browser.startTracing(page, { categories: ['devtools.timeline', 'v8', 'disabled-by-default-v8.gc'] });
  await cdp.send('HeapProfiler.startSampling', { samplingInterval: 4096, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true });
  await page.evaluate(() => { window.__w3dPerf.allocOn = true; });
  await page.waitForTimeout(6000);
  await page.evaluate(() => { window.__w3dPerf.allocOn = false; });
  const { profile } = await cdp.send('HeapProfiler.stopSampling');
  const trace = JSON.parse((await browser.stopTracing()).toString('utf8'));
  const allocFrames = await page.evaluate(() => window.__w3dPerf.allocFrames);
  let allocBytes = 0;
  const top = new Map();
  const walk = (n, stack) => {
    allocBytes += n.selfSize;
    const fn = n.callFrame.functionName || '(anon)';
    const file = (n.callFrame.url || '').split('/').pop().split('?')[0];
    if (n.selfSize) top.set(`${fn} ${file}:${n.callFrame.lineNumber + 1}`, (top.get(`${fn} ${file}:${n.callFrame.lineNumber + 1}`) || 0) + n.selfSize);
    for (const c of n.children || []) walk(c, stack);
  };
  walk(profile.head, []);
  const gcEvents = (trace.traceEvents || []).filter((e) => e.name === 'MinorGC' || e.name === 'MajorGC' || e.name === 'MinorMS');
  const gc = { minor: gcEvents.filter((e) => e.name !== 'MajorGC').length, major: gcEvents.filter((e) => e.name === 'MajorGC').length, ms: r2(gcEvents.reduce((a, e) => a + (e.dur || 0), 0) / 1000) };
  await browser.close();

  const frames = data.frames;
  const js = frames.map((f) => f.js);
  const iv = frames.map((f) => f.interval).filter((v) => v != null);
  const sec = data.elapsed / 1000;
  const fpsAll = iv.length / (iv.reduce((a, b) => a + b, 0) / 1000);
  const sortedIv = [...iv].sort((a, b) => b - a);
  const worst1 = sortedIv.slice(0, Math.max(1, Math.floor(iv.length / 100)));
  const medJs = pct(js, 50);
  const eventHitch = {};
  for (const ev of data.events) {
    const win = frames.filter((f) => f.t >= ev.t - 50 && f.t <= ev.t + 600);
    eventHitch[ev.name] = win.length ? r2(Math.max(...win.map((f) => f.js))) : null;
  }
  const metric = (k) => (m1[k] || 0) - (m0[k] || 0);
  const summary = {
    label: LABEL,
    pass,
    gpu: GPU,
    qualityChoice: QUALITY,
    viewport: `${WIDTH}x${HEIGHT}`,
    qualityStart: setup.quality,
    qualityEnd: data.quality,
    render: `${data.renderW}x${data.renderH} (scale ${r2(data.scale)})`,
    frames: frames.length,
    fps: r2(fpsAll),
    low1Fps: r2(1000 / avg(worst1)),
    frameMsP50: r2(pct(iv, 50)),
    frameMsP95: r2(pct(iv, 95)),
    frameMsP99: r2(pct(iv, 99)),
    jsMsP50: r2(medJs),
    jsMsP95: r2(pct(js, 95)),
    jsMsMax: r2(Math.max(...js)),
    framesJsOver2xMedian: js.filter((v) => v > medJs * 2).length,
    babylonDrawCalls: r2(avg(frames.map((f) => f.bjsDraws || 0))),
    glDrawCalls: r2(avg(frames.map((f) => f.glDraws))),
    framebufferSwitches: r2(avg(frames.map((f) => f.fb))),
    activeMeshes: r2(avg(frames.map((f) => f.active))),
    triangles: data.triangles,
    postProcesses: data.postProcesses,
    cameraPostProcesses: data.cameraPostProcesses,
    renderTargets: data.renderTargets,
    meshes: data.meshes,
    materials: data.materials,
    avatars: data.avatars,
    reactCommitsPerSec: r2(data.commits / sec),
    mainThreadScriptMsPerSec: r2((metric('ScriptDuration') * 1000) / sec),
    layoutMsPerSec: r2((metric('LayoutDuration') * 1000) / sec),
    styleMsPerSec: r2((metric('RecalcStyleDuration') * 1000) / sec),
    layoutsPerSec: r2(metric('LayoutCount') / sec),
    styleRecalcsPerSec: r2(metric('RecalcStyleCount') / sec),
    shaderProgramsLinkedAfterLoad: data.glAfterLoad.link,
    shadersCompiledAfterLoad: data.glAfterLoad.compile,
    texUploadsAfterLoad: data.glAfterLoad.tex,
    allocKBPerFrame: r2(allocBytes / 1024 / Math.max(1, allocFrames)),
    allocFrames,
    gcMinor: gc.minor,
    gcMajor: gc.major,
    gcMs: gc.ms,
    backdropFilterElements: data.backdropFilters,
    worstFrameJsMsAroundEvent: eventHitch,
    topAllocSites: [...top.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, v]) => `${(v / 1024 / Math.max(1, allocFrames)).toFixed(2)} KB/frame ${k}`),
    errors: errors.slice(0, 5),
  };
  return summary;
}

(async () => {
  const results = [];
  for (const pass of PASSES) {
    const s = await run(pass);
    console.log(JSON.stringify(s, null, 2));
    results.push(s);
  }
  const file = path.join(OUT, `${LABEL}-${GPU}-${QUALITY}.json`);
  fs.writeFileSync(file, JSON.stringify(results, null, 2));
  console.log('wrote', file);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
