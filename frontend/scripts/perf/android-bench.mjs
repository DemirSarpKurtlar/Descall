#!/usr/bin/env node
/**
 * Android performance bench (native Capacitor shell emulation vs iPhone reference).
 *
 * Not a CI test: a measuring tool that writes results.json + report.md so two
 * builds (or two platforms) can be compared under the same conditions.
 *
 * It serves a built dist/ with the synthetic heavy account from
 * e2e/perf/mockBackend.cjs (1000-message DM, 300 friends, 40 groups, 60
 * servers) on 127.0.0.1; every other URL is aborted. Per device profile it
 * fakes the native shell (window.Capacitor, platform "android" or "ios")
 * before any app script runs, throttles the CPU through CDP and records:
 *
 *   boot      first paint / first contentful paint, app shell (tab bar up,
 *             boot splash gone), chat list rendered, first interactive (first
 *             1 s window without a long task after the chat list), long tasks
 *             and long animation frames during boot (with script attribution)
 *   scroll    rAF frame times while scrolling the chat (DM) list, the friends
 *             tab list and the 1000-message chat (touch scroll gestures)
 *   latency   input -> first frame with the result painted for: open a chat,
 *             open a sheet (message long-press menu), switch tabs
 *   memory    JS heap (CDP Performance.getMetrics) after boot and at the end
 *   layers    composited layer count + biggest layers (CDP LayerTree), number
 *             of elements with backdrop-filter, running CSS animations,
 *             will-change elements, DOM node count
 *   cost      per-scenario CDP metric deltas: script, style recalc, layout
 *             (count + ms), so a hotspot shows up as "who pays".
 *
 * Build once with the mock API baked in (or rely on the window override the
 * bench sets), then run:
 *
 *   cd frontend
 *   VITE_WORLD3D=0 VITE_API_BASE_URL=http://127.0.0.1:5391 VITE_SOCKET_URL=http://127.0.0.1:5391 \
 *     npx vite build --outDir /tmp/dist-perf
 *   node scripts/perf/android-bench.mjs --dist=/tmp/dist-perf --out=/tmp/android-bench \
 *     [--devices=android,iphone] [--cpu=4] [--rounds=3] [--runs=3] [--port=5391] [--shots] [--profile=0]
 *     [--glass=full|lite|auto]
 *
 *   --rounds  repeats inside one run (scroll gestures, taps per interaction)
 *   --runs    whole runs per device in a fresh context; numbers are medians
 *   --profile CPU sampling profile per scenario (default on, 0 disables);
 *             report lists the top self-time functions as chunk:function:line
 *
 * Caveat: headless Chromium rasterises on the CPU (SwiftShader), so absolute
 * paint / composite cost of backdrop-filter is higher than on a phone GPU and
 * the "iphone" profile runs Blink, not WebKit. Use it to compare code paths and
 * builds, and the layer / backdrop counts as the GPU-side evidence.
 */

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const mock = require(path.join(HERE, "../../e2e/perf/mockBackend.cjs"));

function loadPlaywright() {
  const tries = [process.env.PLAYWRIGHT_PATH, "playwright", "playwright-core", "/opt/node-tools/node_modules/playwright"].filter(Boolean);
  for (const t of tries) {
    try {
      return require(t);
    } catch {
      /* next */
    }
  }
  throw new Error("playwright not found (set PLAYWRIGHT_PATH)");
}
const pw = loadPlaywright();

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? true];
  })
);
const DIST = path.resolve(args.dist || path.join(HERE, "../../dist-perf"));
const OUT = path.resolve(args.out || "/tmp/android-bench");
const DEVICES = String(args.devices || "android,iphone").split(",").filter(Boolean);
const PORT = Number(args.port || 5391);
const ROUNDS = Math.max(1, Number(args.rounds || 3));
const SHOTS = Boolean(args.shots);
// Whole-device repeats in fresh contexts; the table shows the median of each number.
const RUNS = Math.max(1, Number(args.runs || 1));
// CPU sampling profile per scenario -> top self-time functions (chunk:function:line).
const PROFILE = args.profile !== "0" && args.profile !== false;
// Android has no native display plugin: a slow frame sample flips it to
// html.glass-lite at runtime, which on a loaded bench machine happens at
// random. full (default) pins the full material so runs compare; lite pins
// the cheap one; auto keeps the app's own decision.
const GLASS = String(args.glass || "full");
const log = (...a) => console.log("[android-bench]", ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const PIXEL = pw.devices["Pixel 7"] || { viewport: { width: 412, height: 839 }, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true, userAgent: "" };
const IPHONE = pw.devices["iPhone 15"] || pw.devices["iPhone 14"];
// Capacitor Android runs in the system WebView: Chrome UA + "; wv".
const ANDROID_WV_UA = String(PIXEL.userAgent || "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36")
  .replace(/\(Linux; Android ([^;)]+); ([^)]+)\)/, "(Linux; Android $1; $2; wv)")
  .replace(/Chrome\//, "Version/4.0 Chrome/");
const PROFILES = {
  android: {
    platform: "android",
    ctx: { viewport: PIXEL.viewport, screen: PIXEL.screen || PIXEL.viewport, deviceScaleFactor: PIXEL.deviceScaleFactor, isMobile: true, hasTouch: true, userAgent: ANDROID_WV_UA },
    cpu: Number(args.cpu || args.cpuAndroid || 4),
    memoryGb: 8,
  },
  iphone: {
    platform: "ios",
    ctx: { viewport: IPHONE.viewport, screen: IPHONE.screen || IPHONE.viewport, deviceScaleFactor: IPHONE.deviceScaleFactor, isMobile: true, hasTouch: true, userAgent: IPHONE.userAgent },
    cpu: Number(args.cpu || args.cpuIphone || 4),
    memoryGb: 0,
  },
};

/* ---------------- in-page probes (run before any app script) ---------------- */

function installNativeShell([platform, memoryGb]) {
  window.CapacitorCustomPlatform = undefined;
  const calls = [];
  window.__benchNativeCalls = calls;
  window.Capacitor = {
    getPlatform: () => platform,
    isNativePlatform: () => true,
    isPluginAvailable: () => false,
    PluginHeaders: [],
    nativePromise(plugin, method) {
      calls.push(`${plugin}.${method}`);
      return Promise.reject(new Error("bench: no native plugin"));
    },
    nativeCallback(plugin, method) {
      calls.push(`${plugin}.${method}`);
      return String(Math.random());
    },
  };
  try {
    Object.defineProperty(Navigator.prototype, "hardwareConcurrency", { get: () => 8 });
    if (memoryGb) Object.defineProperty(Navigator.prototype, "deviceMemory", { get: () => memoryGb });
  } catch {
    /* ignore */
  }
}

function installProbe() {
  const B = { lt: [], loaf: [], ev: [], frames: [], on: false, lastInput: 0, marks: {} };
  window.__bench = B;
  const obs = (type, fn, extra) => {
    try {
      new PerformanceObserver((l) => l.getEntries().forEach(fn)).observe({ type, buffered: true, ...extra });
    } catch {
      /* unsupported */
    }
  };
  obs("longtask", (e) => B.lt.push([e.startTime, e.duration]));
  obs("long-animation-frame", (e) =>
    B.loaf.push({
      s: e.startTime,
      d: e.duration,
      block: e.blockingDuration || 0,
      style: e.styleAndLayoutStart ? e.startTime + e.duration - e.styleAndLayoutStart : 0,
      scripts: (e.scripts || []).slice(0, 4).map((s) => ({
        inv: String(s.invoker || "").slice(0, 80),
        d: Math.round(s.duration),
        src: String(s.sourceURL || "").split("/").pop(),
        fn: String(s.sourceFunctionName || ""),
        pos: s.sourceCharPosition ?? -1,
      })),
    })
  );
  obs("event", (e) => B.ev.push({ name: e.name, s: e.startTime, d: e.duration, proc: e.processingEnd - e.processingStart, delay: e.processingStart - e.startTime }), { durationThreshold: 16 });
  const onInput = (e) => {
    B.lastInput = e.timeStamp || performance.now();
  };
  window.addEventListener("pointerdown", onInput, true);
  window.addEventListener("touchstart", onInput, { capture: true, passive: true });
  // Boot milestones, checked every frame from the first frame on.
  const ms = B.marks;
  const check = (t) => {
    const splash = document.getElementById("boot-splash");
    if (!ms.appShell && !splash && document.querySelector(".g-tabbar, .mobile-tab-bar, .g-tab")) ms.appShell = t;
    if (!ms.chatList && document.querySelectorAll(".dm-item").length > 10) ms.chatList = t;
    if (!(ms.appShell && ms.chatList)) requestAnimationFrame(check);
  };
  requestAnimationFrame(check);
  const tick = (t) => {
    if (!B.on) return;
    B.frames.push(t);
    requestAnimationFrame(tick);
  };
  B.begin = () => {
    B.frames = [];
    B.t0 = performance.now();
    B.on = true;
    requestAnimationFrame(tick);
  };
  B.end = () => {
    B.on = false;
    const t0 = B.t0;
    return {
      t0,
      t1: performance.now(),
      frames: B.frames.slice(),
      lt: B.lt.filter(([s]) => s >= t0),
      loaf: B.loaf.filter((x) => x.s >= t0),
    };
  };
  // Resolve with the timestamp of the first frame where `pred` holds.
  B.waitFrame = (src, timeout = 15000) =>
    new Promise((resolve) => {
      // eslint-disable-next-line no-new-func
      const pred = new Function(`return (${src})`)();
      const start = performance.now();
      const step = (t) => {
        let ok = false;
        try {
          ok = Boolean(pred());
        } catch {
          ok = false;
        }
        if (ok) return resolve({ ok: true, t });
        if (performance.now() - start > timeout) return resolve({ ok: false, t });
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
}

/* ---------------- helpers ---------------- */

function pct(sorted, p) {
  return sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))] : 0;
}
const median = (xs) => {
  const s = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!s.length) return null;
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const r1 = (x) => (x == null ? null : Math.round(x * 10) / 10);

function frameStats(raw) {
  const f = raw.frames;
  const d = [];
  for (let i = 1; i < f.length; i++) d.push(f[i] - f[i - 1]);
  const sorted = d.slice().sort((a, b) => a - b);
  const span = f.length > 1 ? f[f.length - 1] - f[0] : 0;
  const expected = span / 16.667;
  return {
    frames: f.length,
    spanMs: Math.round(span),
    fps: span ? r1((1000 * (f.length - 1)) / span) : 0,
    p50: r1(pct(sorted, 0.5)),
    p95: r1(pct(sorted, 0.95)),
    max: r1(sorted[sorted.length - 1] || 0),
    dropped: d.filter((x) => x > 25).length,
    droppedPct: expected ? r1((100 * Math.max(0, expected - (f.length - 1))) / expected) : 0,
    longTasks: raw.lt.length,
    longTaskMs: Math.round(raw.lt.reduce((a, [, x]) => a + x, 0)),
    loafBlockMs: Math.round(raw.loaf.reduce((a, x) => a + (x.block || 0), 0)),
  };
}

const METRIC_KEYS = ["ScriptDuration", "RecalcStyleDuration", "LayoutDuration", "TaskDuration", "RecalcStyleCount", "LayoutCount", "JSHeapUsedSize", "Nodes", "JSEventListeners"];
async function metrics(cdp) {
  const { metrics: list } = await cdp.send("Performance.getMetrics");
  const out = {};
  for (const m of list) if (METRIC_KEYS.includes(m.name)) out[m.name] = m.value;
  return out;
}
function metricDelta(a, b) {
  const sec = (k) => Math.round(((b[k] || 0) - (a[k] || 0)) * 1000);
  return {
    scriptMs: sec("ScriptDuration"),
    styleMs: sec("RecalcStyleDuration"),
    layoutMs: sec("LayoutDuration"),
    taskMs: sec("TaskDuration"),
    styleCount: Math.round((b.RecalcStyleCount || 0) - (a.RecalcStyleCount || 0)),
    layoutCount: Math.round((b.LayoutCount || 0) - (a.LayoutCount || 0)),
  };
}

async function tapPoint(cdp, x, y, hold = 40) {
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y, id: 1 }] });
  await sleep(hold);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}

/** Centre of the first visible element matching sel (optionally containing text) that is really on top. */
async function hitPoint(page, sel, { text = null, index = 0 } = {}) {
  return page.evaluate(
    ([sel, text, index]) => {
      const els = [...document.querySelectorAll(sel)].filter((e) => {
        const r = e.getBoundingClientRect();
        if (!(r.width > 0 && r.height > 0)) return false;
        if (!text) return true;
        return `${e.getAttribute("aria-label") || ""} ${e.getAttribute("title") || ""} ${e.textContent.trim()}`.includes(text);
      });
      const hit = (e) => {
        const r = e.getBoundingClientRect();
        for (const [fx, fy] of [[0.5, 0.5], [0.2, 0.5], [0.5, 0.3], [0.8, 0.5]]) {
          const x = r.left + r.width * fx;
          const y = r.top + r.height * fy;
          if (y < 0 || y > innerHeight) continue;
          const t = document.elementFromPoint(x, y);
          if (t && (t === e || e.contains(t))) return { x, y };
        }
        return null;
      };
      const hits = els.map(hit).filter(Boolean);
      return hits[index] || null;
    },
    [sel, text, index]
  );
}

async function scrollGesture(cdp, x, y, dy, speed = 2000) {
  await cdp.send("Input.synthesizeScrollGesture", {
    x: Math.round(x),
    y: Math.round(y),
    yDistance: -dy,
    speed,
    gestureSourceType: "touch",
    repeatCount: 1,
  });
}

/* CPU sampling profile: start/stop around a scenario, aggregate self time. */
async function profStart(cdp) {
  if (!PROFILE) return;
  await cdp.send("Profiler.enable").catch(() => {});
  await cdp.send("Profiler.setSamplingInterval", { interval: 500 }).catch(() => {});
  await cdp.send("Profiler.start").catch(() => {});
}
async function profStop(cdp) {
  if (!PROFILE) return null;
  const r = await cdp.send("Profiler.stop").catch(() => null);
  if (!r || !r.profile) return null;
  const { nodes, samples = [], timeDeltas = [] } = r.profile;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const self = new Map();
  for (let i = 0; i < samples.length; i++) self.set(samples[i], (self.get(samples[i]) || 0) + (timeDeltas[i] || 0));
  const agg = {};
  let total = 0;
  for (const [id, us] of self) {
    const n = byId.get(id);
    if (!n) continue;
    const cf = n.callFrame;
    total += us;
    if (cf.functionName === "(idle)" || cf.functionName === "(program)") continue;
    const file = String(cf.url || "").split("/").pop().replace(/-[A-Za-z0-9_-]{8}\.js$/, ".js");
    const k = cf.url ? `${file}:${cf.functionName || "(anon)"}:${cf.lineNumber + 1}:${cf.columnNumber + 1}` : cf.functionName;
    agg[k] = (agg[k] || 0) + us;
  }
  const byChunk = {};
  for (const [k, us] of Object.entries(agg)) {
    const c = k.includes(":") && k.split(":")[0].endsWith(".js") ? k.split(":")[0] : k;
    byChunk[c] = (byChunk[c] || 0) + us;
  }
  const top = (o, n) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, us]) => [k, Math.round(us / 1000)]);
  return { totalMs: Math.round(total / 1000), topFns: top(agg, 10), topChunks: top(byChunk, 8) };
}

async function measureFrames(page, cdp, fn) {
  const m0 = await metrics(cdp);
  await profStart(cdp);
  await page.evaluate(() => window.__bench.begin());
  let error = null;
  try {
    await fn();
  } catch (e) {
    error = e.message;
  }
  await sleep(200);
  const raw = await page.evaluate(() => window.__bench.end());
  const prof = await profStop(cdp);
  const m1 = await metrics(cdp);
  const s = frameStats(raw);
  if (prof) s.profile = prof;
  s.cost = metricDelta(m0, m1);
  s.loafTop = raw.loaf.sort((a, b) => b.d - a.d).slice(0, 4);
  if (error) s.error = error;
  return s;
}

/**
 * One interaction: dispatch the input, then wait for the first frame where
 * `readySrc` (a function source evaluated in the page) holds.
 * Latency = that frame's timestamp - the input event's timestamp.
 */
async function interaction(page, cdp, act, readySrc) {
  const m0 = await metrics(cdp);
  await page.evaluate(() => {
    window.__bench.lastInput = 0;
    window.__bench.ev = [];
  });
  const tStart = await page.evaluate(() => performance.now());
  await profStart(cdp);
  const wait = page.evaluate(([src]) => window.__bench.waitFrame(src), [readySrc]);
  await act();
  const res = await wait;
  const prof = await profStop(cdp);
  const info = await page.evaluate(() => ({ input: window.__bench.lastInput, ev: window.__bench.ev.slice() }));
  const m1 = await metrics(cdp);
  const input = info.input || tStart;
  const evMax = info.ev.reduce((a, e) => Math.max(a, e.d), 0);
  return { ok: res.ok, latencyMs: Math.round(res.t - input), inpMs: Math.round(evMax), cost: metricDelta(m0, m1), profile: prof };
}

/* ---------------- layers / material ---------------- */

async function layerSnapshot(page, cdp) {
  await cdp.send("DOM.enable").catch(() => {});
  await cdp.send("LayerTree.enable").catch(() => {});
  let layers = null;
  const onChange = (e) => {
    if (e.layers) layers = e.layers;
  };
  cdp.on("LayerTree.layerTreeDidChange", onChange);
  // Force a new frame so the event fires with the current tree.
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  for (let i = 0; i < 20 && !layers; i++) await sleep(100);
  cdp.off("LayerTree.layerTreeDidChange", onChange);
  await cdp.send("LayerTree.disable").catch(() => {});
  const list = (layers || []).filter((l) => l.drawsContent);
  const big = list
    .map((l) => ({ id: l.layerId, node: l.backendNodeId, area: Math.round(l.width * l.height), w: Math.round(l.width), h: Math.round(l.height) }))
    .sort((a, b) => b.area - a.area)
    .slice(0, 8);
  for (const b of big) {
    if (!b.node) continue;
    try {
      const { node } = await cdp.send("DOM.describeNode", { backendNodeId: b.node });
      const attrs = node.attributes || [];
      const cls = attrs[attrs.indexOf("class") + 1];
      b.el = `${String(node.localName || node.nodeName).toLowerCase()}${attrs.includes("class") && cls ? "." + String(cls).trim().split(/\s+/).slice(0, 3).join(".") : ""}`;
    } catch {
      b.el = "?";
    }
    delete b.node;
    delete b.id;
  }
  const viewportArea = await page.evaluate(() => innerWidth * innerHeight * devicePixelRatio * devicePixelRatio);
  const totalArea = list.reduce((a, l) => a + l.width * l.height, 0);
  return {
    layers: (layers || []).length,
    drawingLayers: list.length,
    layerAreaScreens: r1(totalArea / Math.max(1, viewportArea / 1)),
    biggest: big,
  };
}

async function materialSnapshot(page) {
  return page.evaluate(() => {
    const all = [...document.querySelectorAll("*")];
    const label = (e) => {
      const c = typeof e.className === "string" ? e.className.trim().split(/\s+/).filter(Boolean).slice(0, 2).join(".") : "";
      return `${e.tagName.toLowerCase()}${c ? "." + c : ""}`;
    };
    const backdrop = [];
    const willChange = [];
    // background-attachment: fixed on a scroller (or its content) makes Blink
    // repaint on every scroll frame (main-thread scrolling on Android WebView).
    const fixedBg = [];
    let visibleBackdrop = 0;
    for (const e of all) {
      const s = getComputedStyle(e);
      const bf = s.backdropFilter || s.webkitBackdropFilter;
      const r = e.getBoundingClientRect();
      const visible = r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight && s.visibility !== "hidden";
      if (bf && bf !== "none") {
        backdrop.push({ el: label(e), bf: bf.slice(0, 40), area: Math.round(r.width * r.height), visible });
        if (visible) visibleBackdrop++;
      }
      if (s.willChange && s.willChange !== "auto") willChange.push(label(e));
      if (s.backgroundAttachment && s.backgroundAttachment.includes("fixed") && r.width > 0) {
        const scroller = /(auto|scroll)/.test(s.overflowY) && e.scrollHeight > e.clientHeight + 1;
        fixedBg.push(`${label(e)}${scroller ? " (scroller)" : ""}`);
      }
    }
    const anims = document.getAnimations ? document.getAnimations() : [];
    const running = anims.filter((a) => a.playState === "running");
    const infinite = running.filter((a) => {
      try {
        return a.effect && a.effect.getComputedTiming().iterations === Infinity;
      } catch {
        return false;
      }
    });
    const animLabel = (a) => `${a.animationName || a.transitionProperty || a.constructor.name}@${a.effect && a.effect.target ? label(a.effect.target) : "?"}`;
    const group = (xs) => {
      const m = {};
      for (const x of xs) m[x] = (m[x] || 0) + 1;
      return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 10);
    };
    return {
      htmlClass: document.documentElement.className,
      nodes: all.length,
      backdrop: backdrop.length,
      visibleBackdrop,
      backdropTop: group(backdrop.filter((b) => b.visible).map((b) => `${b.el} [${b.bf}]`)),
      fixedBackground: fixedBg.length,
      fixedBackgroundTop: group(fixedBg),
      willChange: willChange.length,
      willChangeTop: group(willChange),
      runningAnimations: running.length,
      infiniteAnimations: infinite.length,
      animationsTop: group(running.map(animLabel)),
      infiniteTop: group(infinite.map(animLabel)),
    };
  });
}

/* ---------------- one device ---------------- */

const READY = {
  chatOpen: "() => document.querySelectorAll('.message-bubble').length > 20",
  chatClosed: "() => [...document.querySelectorAll('.dm-item')].some((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.left >= 0 && r.left < innerWidth / 2; }) && !document.querySelector('.message-bubble')",
  sheetOpen: "() => { const e = document.querySelector('.g-msg-pop, .g-msg-menu, .message-context-menu, [role=menu]'); if (!e) return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; }",
};

async function runDevice(browser, base, name) {
  const prof = PROFILES[name];
  const res = { device: name, platform: prof.platform, cpu: prof.cpu, viewport: prof.ctx.viewport, dpr: prof.ctx.deviceScaleFactor };
  const ctx = await browser.newContext({ ...prof.ctx, locale: "tr-TR", timezoneId: "Europe/Istanbul", colorScheme: "dark" });
  // Everything but the local mock is unreachable (resolver rule at launch).
  // No ctx.route(): intercepting ~450 lazy chunks made Chromium fail with
  // net::ERR_INSUFFICIENT_RESOURCES and crash the renderer.
  await ctx.addInitScript(installNativeShell, [prof.platform, prof.memoryGb]);
  await ctx.addInitScript(
    ([api, me, glass]) => {
      window.__DESCALL_API_URL__ = api;
      window.__DESCALL_SOCKET_URL__ = api;
      localStorage.setItem("descall_language", "tr");
      localStorage.setItem("descall:ios-pwa-install-dismissed", "1");
      localStorage.setItem("descall:cookie_consent_v1", JSON.stringify({ choice: "rejected", at: new Date().toISOString() }));
      localStorage.setItem("descall_token", "e2e.fake.token");
      localStorage.setItem("descall_user", JSON.stringify(me));
      if (glass === "full") localStorage.setItem("descall:glass-desktop-lite", "0");
      else if (glass === "lite") localStorage.setItem("descall:glass-desktop-lite", "1");
      else localStorage.removeItem("descall:glass-desktop-lite");
    },
    [base, mock.ME, GLASS]
  );
  await ctx.addInitScript(installProbe);
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
  await cdp.send("Performance.enable", { timeDomain: "timeTicks" });
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: prof.cpu });

  /* boot */
  await page.goto(base + "/", { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForFunction(() => window.__bench && window.__bench.marks.chatList, null, { timeout: 90000 });
  // first interactive: first 1 s quiet window (no long task) after the chat list.
  await sleep(4000);
  const boot = await page.evaluate(() => {
    const B = window.__bench;
    const paints = Object.fromEntries(performance.getEntriesByType("paint").map((p) => [p.name, p.startTime]));
    const nav = performance.getEntriesByType("navigation")[0] || {};
    const from = B.marks.chatList;
    const lts = B.lt.slice().sort((a, b) => a[0] - b[0]);
    let tti = from;
    for (const [s, d] of lts) {
      if (s + d < tti) continue;
      if (s - tti >= 1000) break;
      tti = s + d;
    }
    const until = tti;
    const bootLt = lts.filter(([s]) => s <= until);
    const loaf = B.loaf.filter((x) => x.s <= until);
    const bySrc = {};
    for (const l of loaf)
      for (const s of l.scripts) {
        const k = `${s.src || "(inline)"} ${s.fn || s.inv}`.trim();
        bySrc[k] = (bySrc[k] || 0) + s.d;
      }
    return {
      domContentLoaded: Math.round(nav.domContentLoadedEventEnd || 0),
      firstPaint: Math.round(paints["first-paint"] || 0),
      fcp: Math.round(paints["first-contentful-paint"] || 0),
      appShell: Math.round(B.marks.appShell || 0),
      chatList: Math.round(B.marks.chatList || 0),
      firstInteractive: Math.round(tti),
      longTasks: bootLt.length,
      longTaskMs: Math.round(bootLt.reduce((a, [, d]) => a + d, 0)),
      longestTask: Math.round(bootLt.reduce((a, [, d]) => Math.max(a, d), 0)),
      totalBlockingMs: Math.round(bootLt.reduce((a, [, d]) => a + Math.max(0, d - 50), 0)),
      topScripts: Object.entries(bySrc).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => [k, Math.round(v)]),
    };
  });
  res.boot = boot;
  const mBoot = await metrics(cdp);
  res.heapAfterBootMb = r1(mBoot.JSHeapUsedSize / 1048576);
  res.listenersAfterBoot = mBoot.JSEventListeners;
  res.materialBoot = await materialSnapshot(page);
  res.layersBoot = await layerSnapshot(page, cdp);
  if (SHOTS) await page.screenshot({ path: path.join(OUT, `${name}-boot.png`) }).catch(() => {});
  log(`${name} boot fcp=${boot.fcp} shell=${boot.appShell} list=${boot.chatList} tti=${boot.firstInteractive} LT=${boot.longTasks}/${boot.longTaskMs}ms heap=${res.heapAfterBootMb}MB layers=${res.layersBoot.layers} backdrop=${res.materialBoot.visibleBackdrop}/${res.materialBoot.backdrop} anim=${res.materialBoot.runningAnimations}`);

  /* chat (DM) list scroll */
  const listPt = await hitPoint(page, ".dm-item", { index: 2 });
  res.chatListScroll = await measureFrames(page, cdp, async () => {
    for (let i = 0; i < ROUNDS; i++) {
      await scrollGesture(cdp, listPt.x, Math.min(listPt.y + 200, prof.ctx.viewport.height - 160), 2500);
      await scrollGesture(cdp, listPt.x, Math.min(listPt.y + 100, prof.ctx.viewport.height - 160), -2500);
    }
  });
  log(`${name} chatListScroll fps=${res.chatListScroll.fps} p95=${res.chatListScroll.p95} dropped=${res.chatListScroll.dropped} LT=${res.chatListScroll.longTaskMs}ms`);

  /* open chat / back (latency) */
  const opens = [];
  const backs = [];
  for (let i = 0; i < ROUNDS; i++) {
    await page.evaluate(() => {
      const s = document.querySelector(".dm-item");
      let el = s && s.parentElement;
      while (el && el !== document.body) {
        if (el.scrollHeight > el.clientHeight + 1 && /(auto|scroll)/.test(getComputedStyle(el).overflowY)) {
          el.scrollTop = 0;
          break;
        }
        el = el.parentElement;
      }
    });
    await sleep(500);
    const pt = await hitPoint(page, ".dm-item", { text: "Ayşe" });
    if (!pt) {
      opens.push({ ok: false, error: "no dm-item" });
      break;
    }
    opens.push(await interaction(page, cdp, () => tapPoint(cdp, pt.x, pt.y), READY.chatOpen));
    await sleep(1500);
    if (i < ROUNDS - 1) {
      const back = await hitPoint(page, '[data-mobile-back="1"]');
      if (back) backs.push(await interaction(page, cdp, () => tapPoint(cdp, back.x, back.y), READY.chatClosed));
      else await page.goBack().catch(() => {});
      await sleep(1200);
    }
  }
  res.openChat = summarizeInteractions(opens);
  res.closeChat = summarizeInteractions(backs);
  log(`${name} openChat median=${res.openChat.latencyMs}ms inp=${res.openChat.inpMs} | back=${res.closeChat.latencyMs}ms`);
  res.renderedBubbles = await page.evaluate(() => document.querySelectorAll(".message-bubble").length);
  res.materialChat = await materialSnapshot(page);
  res.layersChat = await layerSnapshot(page, cdp);

  /* message list scroll */
  const sc = await page.evaluate(() => {
    const l = document.querySelector(".message-list");
    let el = l && l.parentElement;
    while (el && el !== document.body) {
      const s = getComputedStyle(el);
      if (/(auto|scroll)/.test(s.overflowY) && el.scrollHeight > el.clientHeight + 1) break;
      el = el.parentElement;
    }
    const r = (el || document.body).getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  res.msgScroll = await measureFrames(page, cdp, async () => {
    for (let i = 0; i < ROUNDS; i++) {
      await scrollGesture(cdp, sc.x, sc.y, -4000, 2400);
      await scrollGesture(cdp, sc.x, sc.y, 4000, 2400);
    }
  });
  log(`${name} msgScroll fps=${res.msgScroll.fps} p95=${res.msgScroll.p95} dropped=${res.msgScroll.dropped} LT=${res.msgScroll.longTaskMs}ms bubbles=${res.renderedBubbles}`);

  /* sheet: message long-press menu */
  const sheets = [];
  for (let i = 0; i < ROUNDS; i++) {
    const b = await page.evaluate((i) => {
      const bs = [...document.querySelectorAll(".message-bubble[data-message-id]")].filter((e) => {
        const r = e.getBoundingClientRect();
        return r.top > 120 && r.bottom < innerHeight - 160;
      });
      const e = bs[bs.length - 1 - i] || bs[0];
      if (!e) return null;
      const r = e.getBoundingClientRect();
      return { x: r.left + Math.min(40, r.width / 2), y: r.top + r.height / 2 };
    }, i);
    if (!b) {
      sheets.push({ ok: false, error: "no bubble" });
      break;
    }
    sheets.push(await interaction(page, cdp, () => tapPoint(cdp, b.x, b.y, 650), READY.sheetOpen));
    await sleep(900);
    await page.keyboard.press("Escape");
    await page.evaluate(() => {
      const s = document.querySelector(".g-msg-scrim, .g-msg-pop");
      if (s) s.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await sleep(900);
  }
  res.openSheet = summarizeInteractions(sheets);
  log(`${name} openSheet (long-press menu, 650 ms hold included) median=${res.openSheet.latencyMs}ms ok=${res.openSheet.okCount}/${sheets.length}`);

  /* back to the list, then tab switches */
  const back = await hitPoint(page, '[data-mobile-back="1"]');
  if (back) await tapPoint(cdp, back.x, back.y);
  else await page.goBack().catch(() => {});
  await sleep(1500);

  const TABS = ["Arkadaşlar", "Sunucular", "Gruplar", "Sohbetler"];
  const tabRuns = {};
  for (let i = 0; i < ROUNDS; i++) {
    for (const t of TABS) {
      const pt = await hitPoint(page, ".g-tab, .mobile-tab-bar button", { text: t });
      if (!pt) {
        (tabRuns[t] ||= []).push({ ok: false, error: "no tab" });
        continue;
      }
      const ready = `() => { const b = [...document.querySelectorAll('.g-tab, .mobile-tab-bar button')].find((e) => (e.getAttribute('aria-label') || e.textContent || '').includes(${JSON.stringify(t)})); return !!b && (b.getAttribute('aria-selected') === 'true' || b.getAttribute('aria-current') === 'page' || /active|selected|is-on/.test(b.className)); }`;
      (tabRuns[t] ||= []).push(await interaction(page, cdp, () => tapPoint(cdp, pt.x, pt.y), ready));
      await sleep(900);
    }
  }
  res.tabSwitch = Object.fromEntries(Object.entries(tabRuns).map(([k, v]) => [k, summarizeInteractions(v)]));
  log(`${name} tabs ` + Object.entries(res.tabSwitch).map(([k, v]) => `${k}=${v.latencyMs}ms`).join(" "));

  /* friends tab list scroll */
  const fpt = await hitPoint(page, ".g-tab, .mobile-tab-bar button", { text: "Arkadaşlar" });
  if (fpt) await tapPoint(cdp, fpt.x, fpt.y);
  await sleep(1500);
  res.materialFriends = await materialSnapshot(page);
  const fr = await page.evaluate(() => {
    const cand = [...document.querySelectorAll("*")].filter((el) => {
      const s = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return /(auto|scroll)/.test(s.overflowY) && el.scrollHeight > el.clientHeight + 200 && r.width > 200 && r.height > 300;
    });
    const el = cand.sort((a, b) => b.scrollHeight - a.scrollHeight)[0];
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, cls: String(el.className).slice(0, 60), h: el.scrollHeight };
  });
  if (fr) {
    res.friendsScrollTarget = fr.cls;
    res.friendsScroll = await measureFrames(page, cdp, async () => {
      for (let i = 0; i < ROUNDS; i++) {
        await scrollGesture(cdp, fr.x, fr.y, 2500);
        await scrollGesture(cdp, fr.x, fr.y, -2500);
      }
    });
    log(`${name} friendsScroll fps=${res.friendsScroll.fps} p95=${res.friendsScroll.p95} dropped=${res.friendsScroll.dropped} LT=${res.friendsScroll.longTaskMs}ms (${fr.cls})`);
  }

  /* idle cost: 3 s doing nothing on the chat list */
  const sohbet = await hitPoint(page, ".g-tab, .mobile-tab-bar button", { text: "Sohbetler" });
  if (sohbet) await tapPoint(cdp, sohbet.x, sohbet.y);
  await sleep(1500);
  res.idle = await measureFrames(page, cdp, () => sleep(3000));
  log(`${name} idle 3s script=${res.idle.cost.scriptMs}ms style=${res.idle.cost.styleMs}ms (${res.idle.cost.styleCount}x) layout=${res.idle.cost.layoutMs}ms (${res.idle.cost.layoutCount}x)`);

  const mEnd = await metrics(cdp);
  res.heapEndMb = r1(mEnd.JSHeapUsedSize / 1048576);
  res.nodesEnd = mEnd.Nodes;
  res.nativeCalls = await page.evaluate(() => {
    const m = {};
    for (const c of window.__benchNativeCalls || []) m[c] = (m[c] || 0) + 1;
    return m;
  });
  res.pageErrors = errors;
  if (SHOTS) await page.screenshot({ path: path.join(OUT, `${name}-end.png`) }).catch(() => {});
  await ctx.close();
  return res;
}

function summarizeInteractions(list) {
  const ok = list.filter((x) => x.ok);
  const sum = (k) => median(ok.map((x) => x.cost[k]));
  return {
    n: list.length,
    okCount: ok.length,
    latencyMs: median(ok.map((x) => x.latencyMs)),
    latencyMax: ok.length ? Math.max(...ok.map((x) => x.latencyMs)) : null,
    inpMs: median(ok.map((x) => x.inpMs)),
    scriptMs: sum("scriptMs"),
    styleMs: sum("styleMs"),
    layoutMs: sum("layoutMs"),
    runs: list.map((x) => (x.ok ? x.latencyMs : x.error || "timeout")),
    profile: mergeProfiles(ok.map((x) => x.profile).filter(Boolean)),
  };
}

/** Sum several profiles (interaction repeats, or whole runs) into one top list. */
function mergeProfiles(list) {
  if (!list.length) return null;
  const sum = (key) => {
    const m = {};
    for (const p of list) for (const [k, v] of p[key] || []) m[k] = (m[k] || 0) + v;
    return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, key === "topFns" ? 10 : 8);
  };
  return { totalMs: list.reduce((a, p) => a + (p.totalMs || 0), 0), topFns: sum("topFns"), topChunks: sum("topChunks"), merged: list.length };
}

/**
 * Median across whole runs: numbers -> median, objects -> per key, profiles ->
 * summed, anything else (strings, lists) -> taken from the first run.
 */
function mergeRuns(runs) {
  const ok = runs.filter((r) => r && !r.error);
  if (!ok.length) return runs[0];
  const merge = (vals, key) => {
    const v0 = vals[0];
    if (key === "profile") return mergeProfiles(vals.filter(Boolean));
    if (vals.every((v) => typeof v === "number")) return r1(median(vals));
    if (v0 && typeof v0 === "object" && !Array.isArray(v0)) {
      const out = {};
      for (const k of Object.keys(v0)) out[k] = merge(vals.map((v) => (v ? v[k] : undefined)), k);
      return out;
    }
    return v0;
  };
  const out = merge(ok, "");
  out.runCount = ok.length;
  out.perRun = ok.map((r) => ({
    fcp: r.boot.fcp,
    appShell: r.boot.appShell,
    firstInteractive: r.boot.firstInteractive,
    bootLongTaskMs: r.boot.longTaskMs,
    openChat: r.openChat.latencyMs,
    chatListDropped: r.chatListScroll.dropped,
    msgDropped: r.msgScroll.dropped,
    friendsDropped: r.friendsScroll ? r.friendsScroll.dropped : null,
    htmlClass: r.materialBoot.htmlClass,
  }));
  return out;
}

/* ---------------- report ---------------- */

function report(all) {
  const devs = Object.keys(all.results);
  const row = (label, f) => `| ${label} | ${devs.map((d) => { try { const v = f(all.results[d]); return v == null ? "-" : v; } catch { return "-"; } }).join(" | ")} |`;
  const lines = [];
  lines.push(`# Android bench ${all.at}`, "", `dist: ${all.dist}  rounds: ${all.rounds}  runs: ${all.runs}  glass: ${all.glass} (numbers are medians across runs)`, "");
  lines.push(`| metric | ${devs.join(" | ")} |`, `|---|${devs.map(() => "---").join("|")}|`);
  lines.push(row("CPU throttle", (r) => `${r.cpu}x`));
  lines.push(row("html class", (r) => r.materialBoot.htmlClass.split(" ").filter((c) => /glass|native|lite|solid|android|ios/.test(c)).join(" ")));
  lines.push(row("first paint ms", (r) => r.boot.firstPaint));
  lines.push(row("FCP ms", (r) => r.boot.fcp));
  lines.push(row("app shell ms", (r) => r.boot.appShell));
  lines.push(row("chat list ms", (r) => r.boot.chatList));
  lines.push(row("first interactive ms", (r) => r.boot.firstInteractive));
  lines.push(row("boot long tasks (n / ms)", (r) => `${r.boot.longTasks} / ${r.boot.longTaskMs}`));
  lines.push(row("boot TBT ms", (r) => r.boot.totalBlockingMs));
  lines.push(row("longest boot task ms", (r) => r.boot.longestTask));
  for (const [k, label] of [["chatListScroll", "DM list scroll"], ["friendsScroll", "friends list scroll"], ["msgScroll", "1000-msg chat scroll"]]) {
    lines.push(row(`${label}: fps / p95 ms`, (r) => `${r[k].fps} / ${r[k].p95}`));
    lines.push(row(`${label}: dropped frames / %`, (r) => `${r[k].dropped} / ${r[k].droppedPct}%`));
    lines.push(row(`${label}: script / style / layout ms`, (r) => `${r[k].cost.scriptMs} / ${r[k].cost.styleMs} / ${r[k].cost.layoutMs}`));
  }
  lines.push(row("open chat latency ms (median / max)", (r) => `${r.openChat.latencyMs} / ${r.openChat.latencyMax}`));
  lines.push(row("open chat INP ms", (r) => r.openChat.inpMs));
  lines.push(row("open chat script / style / layout ms", (r) => `${r.openChat.scriptMs} / ${r.openChat.styleMs} / ${r.openChat.layoutMs}`));
  lines.push(row("back to list latency ms", (r) => r.closeChat.latencyMs));
  lines.push(row("long-press sheet latency ms (incl. 650 hold)", (r) => r.openSheet.latencyMs));
  for (const t of ["Arkadaşlar", "Sunucular", "Gruplar", "Sohbetler"]) lines.push(row(`tab -> ${t} ms (median / max)`, (r) => `${r.tabSwitch[t].latencyMs} / ${r.tabSwitch[t].latencyMax}`));
  lines.push(row("idle 3 s script / style ms", (r) => `${r.idle.cost.scriptMs} / ${r.idle.cost.styleMs}`));
  lines.push(row("idle 3 s style recalcs / layouts", (r) => `${r.idle.cost.styleCount} / ${r.idle.cost.layoutCount}`));
  lines.push(row("JS heap after boot / end MB", (r) => `${r.heapAfterBootMb} / ${r.heapEndMb}`));
  lines.push(row("DOM nodes boot / chat", (r) => `${r.materialBoot.nodes} / ${r.materialChat.nodes}`));
  lines.push(row("layers boot / chat (drawing)", (r) => `${r.layersBoot.layers} (${r.layersBoot.drawingLayers}) / ${r.layersChat.layers} (${r.layersChat.drawingLayers})`));
  lines.push(row("layer area (screens) boot / chat", (r) => `${r.layersBoot.layerAreaScreens} / ${r.layersChat.layerAreaScreens}`));
  lines.push(row("backdrop-filter visible / total boot", (r) => `${r.materialBoot.visibleBackdrop} / ${r.materialBoot.backdrop}`));
  lines.push(row("backdrop-filter visible / total chat", (r) => `${r.materialChat.visibleBackdrop} / ${r.materialChat.backdrop}`));
  lines.push(row("running / infinite animations boot", (r) => `${r.materialBoot.runningAnimations} / ${r.materialBoot.infiniteAnimations}`));
  lines.push(row("fixed-background elements boot / chat", (r) => `${r.materialBoot.fixedBackground} / ${r.materialChat.fixedBackground}`));
  lines.push(row("will-change elements boot / chat", (r) => `${r.materialBoot.willChange} / ${r.materialChat.willChange}`));
  lines.push("");
  for (const d of devs) {
    const r = all.results[d];
    if (r.error) {
      lines.push(`## ${d}: ERROR`, "```", r.error, "```");
      continue;
    }
    lines.push(`## ${d} evidence`, "");
    lines.push("Boot script time by source (LoAF attribution):", ...r.boot.topScripts.map(([k, v]) => `- ${v} ms ${k}`), "");
    lines.push("Visible backdrop-filter elements (chat):", ...r.materialChat.backdropTop.map(([k, v]) => `- ${v}x ${k}`), "");
    lines.push("background-attachment: fixed (chat):", ...(r.materialChat.fixedBackgroundTop || []).map(([k, v]) => `- ${v}x ${k}`), "");
    lines.push("Running animations (boot):", ...r.materialBoot.animationsTop.map(([k, v]) => `- ${v}x ${k}`), "");
    lines.push("Biggest layers (chat):", ...r.layersChat.biggest.map((b) => `- ${b.w}x${b.h} ${b.el}`), "");
    lines.push("Longest frames in message scroll:", ...r.msgScroll.loafTop.map((l) => `- ${Math.round(l.d)} ms (style+layout ${Math.round(l.style)} ms) ${l.scripts.map((s) => `${s.d}ms ${s.src} ${s.fn || s.inv}`).join("; ")}`), "");
    const profLines = (label, p) => (p ? [`${label} (CPU self time, ${p.totalMs} ms sampled):`, ...p.topFns.slice(0, 8).map(([k, v]) => `- ${v} ms ${k}`), `  by chunk: ${p.topChunks.map(([k, v]) => `${k} ${v}`).join(", ")}`, ""] : []);
    lines.push(...profLines("Hot functions, DM list scroll", r.chatListScroll.profile));
    lines.push(...profLines("Hot functions, friends list scroll", r.friendsScroll && r.friendsScroll.profile));
    lines.push(...profLines("Hot functions, 1000-msg chat scroll", r.msgScroll.profile));
    lines.push(...profLines("Hot functions, open chat", r.openChat.profile));
    lines.push(...profLines("Hot functions, tab switch -> Arkadaşlar", r.tabSwitch && r.tabSwitch["Arkadaşlar"] && r.tabSwitch["Arkadaşlar"].profile));
    lines.push(...profLines("Hot functions, idle 3 s", r.idle.profile));
    if (r.perRun) lines.push("Per run:", ...r.perRun.map((x, i) => `- run ${i + 1}: ${JSON.stringify(x)}`), "");
    if (r.pageErrors && r.pageErrors.length) lines.push("Page errors:", ...r.pageErrors.map((e) => `- ${e}`), "");
  }
  return lines.join("\n");
}

/* ---------------- main ---------------- */

(async () => {
  if (!fs.existsSync(path.join(DIST, "index.html"))) {
    console.error(`[android-bench] no ${DIST}/index.html (build first, see header)`);
    process.exit(1);
  }
  // The app ignores window.__DESCALL_API_URL__ on 127.0.0.1 when the build
  // carries VITE_API_BASE_URL (e.g. from .env): the mock must be baked in.
  const assets = path.join(DIST, "assets");
  const baked = fs.existsSync(assets) && fs.readdirSync(assets).some((f) => f.endsWith(".js") && fs.readFileSync(path.join(assets, f), "utf8").includes(`127.0.0.1:${PORT}`));
  if (!baked) {
    console.error(`[android-bench] ${DIST} was not built against the mock (http://127.0.0.1:${PORT}); rebuild with VITE_API_BASE_URL / VITE_SOCKET_URL, see header`);
    process.exit(1);
  }
  fs.mkdirSync(OUT, { recursive: true });
  const srv = await mock.start({ dist: DIST, port: PORT });
  const base = `http://127.0.0.1:${srv.port}`;
  // --no-proxy-server: Chromium on Linux honours HTTPS_PROXY from the
  // environment, which would bypass the resolver rule and reach the real API.
  const browser = await pw.chromium.launch({ args: ["--lang=tr-TR", "--no-proxy-server", "--enable-features=LongAnimationFrameTiming", "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1"] });
  const all = { dist: DIST, at: new Date().toISOString(), rounds: ROUNDS, runs: RUNS, glass: GLASS, results: {} };
  try {
    for (const d of DEVICES) {
      if (!PROFILES[d]) {
        log("unknown device", d);
        continue;
      }
      const runs = [];
      for (let i = 0; i < RUNS; i++) {
        try {
          log(`${d} run ${i + 1}/${RUNS}`);
          runs.push(await runDevice(browser, base, d));
        } catch (e) {
          runs.push({ error: e.stack });
          log(d, "FAIL", e.message);
        }
      }
      all.results[d] = RUNS > 1 ? mergeRuns(runs) : runs[0];
      if (RUNS > 1) all.raw = { ...(all.raw || {}), [d]: runs };
    }
  } finally {
    await browser.close().catch(() => {});
    srv.close();
  }
  fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify(all, null, 1));
  const ok = Object.values(all.results).every((r) => !r.error);
  if (ok) fs.writeFileSync(path.join(OUT, "report.md"), report(all));
  log("wrote", path.join(OUT, "results.json"), ok ? "+ report.md" : "(errors, no report)");
  process.exit(ok ? 0 : 1);
})();
