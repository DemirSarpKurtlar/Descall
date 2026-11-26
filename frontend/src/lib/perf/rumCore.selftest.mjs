// node src/lib/perf/rumCore.selftest.mjs
// Real-user collection core: sampling, platform / device / connection / browser,
// routes, the view timeline (INP goes to the view of its interaction), web-vitals
// attribution mapping, batching (size, idle, final flush, age of queued events).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  DEFAULT_SAMPLE_RATE,
  browserOf,
  connectionOf,
  createBatcher,
  createViewTimeline,
  deviceClassOf,
  eventFromVital,
  newSessionId,
  platformOf,
  routeOf,
  shouldSample,
} from "./rumCore.js";

// sampling
assert.equal(DEFAULT_SAMPLE_RATE, 0.25);
assert.equal(shouldSample(0.25, () => 0.1), true);
assert.equal(shouldSample(0.25, () => 0.3), false);
assert.equal(shouldSample(0), false);
assert.equal(shouldSample(1, () => 0.999), true);

// session ids: 16 chars of the beacon's allowed alphabet, different each time
const a = newSessionId();
assert.match(a, /^[A-Za-z0-9]{16}$/);
assert.notEqual(a, newSessionId());
assert.match(newSessionId(() => 0.5), /^[A-Za-z0-9]{16}$/);

// platforms
assert.equal(platformOf({ __TAURI_INTERNALS__: {} }), "tauri");
assert.equal(platformOf({ electronAPI: { isElectron: true, isTauri: true } }), "tauri");
assert.equal(platformOf({ electronAPI: { isElectron: true } }), "electron");
assert.equal(platformOf({ Capacitor: { isNativePlatform: () => true, getPlatform: () => "ios" } }), "ios");
assert.equal(platformOf({ Capacitor: { isNativePlatform: () => true, getPlatform: () => "android" } }), "android");
assert.equal(platformOf({ Capacitor: { isNativePlatform: () => false, getPlatform: () => "web" } }), "web");
assert.equal(platformOf({}), "web");

// device class + connection + browser
assert.equal(deviceClassOf({ deviceMemory: 2, hardwareConcurrency: 8 }), "low");
assert.equal(deviceClassOf({ deviceMemory: 4, hardwareConcurrency: 8 }), "mid");
assert.equal(deviceClassOf({ deviceMemory: 8, hardwareConcurrency: 8 }), "high");
assert.equal(deviceClassOf({ hardwareConcurrency: 6 }), "high", "iOS: cores only");
assert.equal(deviceClassOf({}), "");
assert.equal(connectionOf({ onLine: false }), "offline");
assert.equal(connectionOf({ connection: { type: "wifi", effectiveType: "4g" } }), "wifi");
assert.equal(connectionOf({ connection: { effectiveType: "slow-2g" } }), "2g");
assert.equal(connectionOf({ connection: { effectiveType: "3g" } }), "3g");
assert.equal(connectionOf({}), "");
assert.equal(browserOf("Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/124 Electron/30.0.1 Safari/537.36"), "Electron");
assert.equal(browserOf("Mozilla/5.0 (Linux; Android 14; wv) AppleWebKit/537.36 Chrome/124 Mobile Safari/537.36"), "WebView");
assert.equal(browserOf("Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/124 Safari/537.36 Edg/124"), "Edge");
assert.equal(browserOf("Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 Version/18 Mobile/15E148 Safari/604.1"), "Safari");
assert.equal(browserOf("Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148"), "WebView");

// routes
assert.equal(routeOf("/"), "/");
assert.equal(routeOf("/download/"), "/download");
assert.equal(routeOf("/blog/descall-on-every-device?x=1"), "/blog/descall-on-every-device");
assert.equal(routeOf("/invite/AbC123"), "/invite/:id");
assert.equal(routeOf("/app/anything"), "app");
assert.equal(routeOf("/whatever", "app/kanal"), "app/kanal");

// view timeline
const tl = createViewTimeline("");
tl.set("app/dm", 1000);
tl.set("app/kanal", 5000);
tl.set("app/kanal", 6000);
assert.equal(tl.at(500), "");
assert.equal(tl.at(4400), "app/dm");
assert.equal(tl.at(5200), "app/kanal");
assert.equal(tl.current(), "app/kanal");
assert.equal(tl.first(), "app/dm");
assert.equal(createViewTimeline("").first(), "");

// web-vitals attribution -> event
const inp = eventFromVital({ name: "INP", value: 412.4, attribution: { interactionTarget: "form > button.send", interactionType: "keyboard", loadState: "complete", inputDelay: 12.2, processingDuration: 300.4, presentationDelay: 99.8, interactionTime: 5200.6 } }, "app/kanal");
assert.deepEqual(inp, { m: "inp", v: 412, r: "app/kanal", a: { target: "form > button.send", type: "keyboard", load: "complete", delay: 12, proc: 300, pres: 100, at: 5201 } });
const lcp = eventFromVital({ name: "LCP", value: 2380, attribution: { element: "img.server-banner", timeToFirstByte: 400, resourceLoadDelay: NaN } }, "app/kanal");
assert.deepEqual(lcp.a, { element: "img.server-banner", ttfb: 400 });
assert.equal(eventFromVital({ name: "CLS", value: 0.0612, attribution: {} }, "/").v, 0.061);
assert.equal(eventFromVital({ name: "CLS", value: 0.0612, attribution: {} }, "/").a, undefined);
assert.equal(eventFromVital({ name: "FID", value: 3 }, "/"), null);
assert.equal(eventFromVital({ name: "LCP", value: -1 }, "/"), null);

// batching
const sent = [];
let clock = 0;
const timers = [];
const b = createBatcher({
  send: (p, o) => sent.push({ p, o }),
  base: () => ({ sid: "S", p: "web" }),
  idleMs: 1000,
  max: 3,
  schedule: (fn, ms) => timers.push({ fn, ms }) - 1,
  cancel: (id) => (timers[id] = null),
  now: () => clock,
});
b.add({ m: "lcp", v: 1 });
b.add({ m: "fcp", v: 1 });
assert.equal(sent.length, 0);
assert.equal(b.size(), 2);
b.add({ m: "ttfb", v: 1 });
assert.equal(sent.length, 1, "flush at max");
assert.equal(sent[0].p.v, 1);
assert.equal(sent[0].p.sid, "S");
assert.equal(sent[0].p.e.length, 3);
b.add({ m: "inp", v: 5 });
clock = 4000;
timers.filter(Boolean).at(-1).fn();
assert.equal(sent.length, 2, "idle flush");
assert.equal(sent[1].p.e[0].t, 4000, "age of a queued event travels with it");
b.add({ m: "cls", v: 0.1 });
assert.equal(b.flush(true), true);
assert.equal(sent[2].o.final, true);
assert.equal(b.flush(true), false, "nothing left");
const bad = createBatcher({ send: () => { throw new Error("x"); }, base: () => ({}), schedule: () => 0, cancel: () => {} });
bad.add({ m: "lcp", v: 1 });
assert.equal(bad.flush(true), false, "a failing send never throws into the app");

// rum.js: beacon is text/plain (no preflight), keepalive fallback, opt-outs, dev off
const src = readFileSync(new URL("./rum.js", import.meta.url), "utf8");
assert.match(src, /navigator\.sendBeacon\(beaconUrl, blob\)/);
assert.match(src, /type: "text\/plain;charset=UTF-8"/);
assert.match(src, /keepalive: true/);
assert.match(src, /globalPrivacyControl/);
assert.match(src, /import\("web-vitals\/attribution"\)/, "attribution build, own chunk");
assert.match(src, /\/api\/perf\/beacon/);
assert.ok(!/console\.log/.test(src));

console.log("rumCore.selftest: ok");
