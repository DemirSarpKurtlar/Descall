// Run: node src/lib/socketResume.selftest.mjs
// iPhone idle energy: the frozen-page heartbeat only runs while the page is hidden
// (no 1 s timer for the whole foreground session), and a page frozen while hidden
// still gets its acked probe when it comes back.
import assert from "node:assert/strict";

let t = 1_000_000;
const intervals = new Map();
let nextId = 1;
const docL = {};
const winL = {};
globalThis.setInterval = (fn, ms) => { const id = nextId++; intervals.set(id, { fn, ms }); return id; };
globalThis.clearInterval = (id) => { intervals.delete(id); };
globalThis.document = {
  visibilityState: "visible",
  addEventListener: (e, f) => { (docL[e] ||= []).push(f); },
  removeEventListener: (e, f) => { docL[e] = (docL[e] || []).filter((x) => x !== f); },
};
globalThis.window = {
  addEventListener: (e, f) => { (winL[e] ||= []).push(f); },
  removeEventListener: (e, f) => { winL[e] = (winL[e] || []).filter((x) => x !== f); },
};
const fireVis = (state) => { globalThis.document.visibilityState = state; (winL.visibilitychange || []).forEach((f) => f()); };
const tickAll = (n) => { for (let i = 0; i < n; i++) { t += 1000; [...intervals.values()].forEach((v) => v.ms === 1000 && v.fn()); } };

const { installSocketResumeWatchdog } = await import("./socketResume.js");

const emits = [];
const pings = [];
const ping = () => pings.forEach((f) => f());
const socket = {
  active: true,
  connected: true,
  io: { engine: { _pingInterval: 25_000, on() {}, off() {} }, on: (ev, f) => { if (ev === "ping") pings.push(f); }, off() {} },
  on() {},
  off() {},
  timeout() { return { emit: (ev, cb) => emits.push({ ev, cb }) }; },
  disconnect() {},
  connect() {},
};
const wd = installSocketResumeWatchdog(socket, { now: () => t, log: () => {} });
assert.equal(intervals.size, 0, "no heartbeat while the page is visible");
assert.equal(wd.ensureFresh("focus"), true);
assert.equal(emits.length, 0, "a visible page is never probed on focus");

// Hidden: the heartbeat runs; the page keeps running (call with background audio).
fireVis("hidden");
assert.equal(intervals.size, 1, "heartbeat while hidden");
tickAll(10);
ping();
fireVis("visible");
assert.equal(emits.length, 0, "page that kept running: no probe");
assert.equal(intervals.size, 0, "heartbeat stops in the foreground");

// Hidden and frozen (iOS suspends the WebView): no ticks, then visible → probe.
t += 500; // past the debounce
ping();
fireVis("hidden");
t += 20_000; // frozen: interval never fired
fireVis("visible");
assert.equal(emits.length, 1, "frozen page gets the acked app:ping probe");
assert.equal(emits[0].ev, "app:ping");
emits[0].cb(null);
assert.equal(intervals.size, 0);

// Capacitor pause without a visibilitychange still starts the heartbeat.
t += 500;
(docL.pause || []).forEach((f) => f());
assert.equal(intervals.size, 1, "pause starts the heartbeat");
t += 500;
(docL.resume || []).forEach((f) => f());
assert.equal(intervals.size, 0, "resume on a visible page stops it");

wd.dispose();
assert.equal((docL.pause || []).length, 0);
assert.equal((winL.visibilitychange || []).length, 0, "dispose removes the listener");
console.log("socketResume.selftest ok");
