// The call duration must not tick in useCall / useGroupCall state: App
// consumes both hooks, so a per-second setState there re-rendered the whole
// app once a second during every call. The hooks expose a stable
// durationStartedAt; only the components that show the timer tick
// (hooks/useCallTimer.js on the shared clock in lib/callClock.js).
//
// The real hooks are bundled with esbuild and run on a tiny hook runtime
// (React's hook API, no DOM) under fake timers. The dev glass-QA bridge puts
// each hook into a live call, then 3 simulated seconds pass and the renders
// are counted.
import assert from "node:assert/strict";
import { build } from "esbuild";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, "..");
const out = mkdtempSync(join(tmpdir(), "call-duration-"));

// ---- minimal hook runtime standing in for "react" ----
const shim = `
let current = null;
const same = (a, b) => a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
function slot(init) {
  const inst = current;
  const i = inst.idx++;
  if (!(i in inst.slots)) inst.slots[i] = init(inst);
  return inst.slots[i];
}
export function createContext(defaultValue) {
  const ctx = { _currentValue: defaultValue };
  ctx.Provider = ({ children }) => children ?? null;
  ctx.Consumer = ({ children }) => (typeof children === "function" ? children(defaultValue) : null);
  return ctx;
}
export const useContext = (ctx) => ctx?._currentValue;
export function useState(init) {
  const s = slot((inst) => {
    const st = { value: typeof init === "function" ? init() : init };
    st.set = (u) => {
      const next = typeof u === "function" ? u(st.value) : u;
      if (Object.is(next, st.value)) return;
      st.value = next;
      inst.schedule();
    };
    return st;
  });
  return [s.value, s.set];
}
export function useReducer(reducer, arg, init) {
  const [v, set] = useState(() => (init ? init(arg) : arg));
  return [v, (a) => set((prev) => reducer(prev, a))];
}
export const useRef = (v) => slot(() => ({ current: v }));
export function useMemo(fn, deps) {
  const s = slot(() => ({ deps: null, value: undefined }));
  if (!deps || !s.deps || !same(deps, s.deps)) { s.value = fn(); s.deps = deps || null; }
  return s.value;
}
export const useCallback = (fn, deps) => useMemo(() => fn, deps);
export function useEffect(fn, deps) {
  const inst = current;
  const s = slot(() => ({ deps: null, cleanup: undefined, ran: false }));
  if (deps && s.ran && same(deps, s.deps)) return;
  s.ran = true;
  s.deps = deps || null;
  inst.pending.push(() => {
    if (typeof s.cleanup === "function") s.cleanup();
    const c = fn();
    s.cleanup = typeof c === "function" ? c : undefined;
  });
  inst.effects.add(s);
}
export const useLayoutEffect = useEffect;
export const useInsertionEffect = useEffect;
export function useSyncExternalStore(subscribe, getSnapshot) {
  const inst = current;
  const value = getSnapshot();
  const s = slot(() => ({ value }));
  s.value = value;
  s.get = getSnapshot;
  useEffect(() => subscribe(() => { if (!Object.is(s.get(), s.value)) inst.schedule(); }), [subscribe]);
  return value;
}
let ids = 0;
export const useId = () => useMemo(() => ":r" + (ids++) + ":", []);
export const useTransition = () => [false, (fn) => fn()];
export const startTransition = (fn) => fn();
export const useDeferredValue = (v) => v;
export const useImperativeHandle = () => {};
export const useDebugValue = () => {};
export const memo = (c) => c;
export const forwardRef = (c) => c;
export const lazy = (f) => f;
export const createElement = (type, props, ...children) => ({ type, props: { ...props, children } });
export const cloneElement = (el) => el;
export const isValidElement = () => false;
export const createRef = () => ({ current: null });
export const Fragment = "fragment";
export const Suspense = "suspense";
export const StrictMode = "strict";
export class Component {}
export class PureComponent {}
export const Children = { map: (c, f) => [].concat(c ?? []).map(f), forEach: (c, f) => [].concat(c ?? []).forEach(f), count: (c) => [].concat(c ?? []).length, only: (c) => c, toArray: (c) => [].concat(c ?? []) };
export const version = "18.3.1-shim";
export const jsx = createElement;
export const jsxs = createElement;
export const jsxDEV = createElement;
const React = { createContext, useContext, useState, useReducer, useRef, useMemo, useCallback, useEffect, useLayoutEffect, useInsertionEffect, useSyncExternalStore, useId, useTransition, startTransition, useDeferredValue, useImperativeHandle, useDebugValue, memo, forwardRef, lazy, createElement, cloneElement, isValidElement, createRef, Fragment, Suspense, StrictMode, Component, PureComponent, Children, version };
export default React;

/** Mounts a hook-calling function; returns { result(), renders(), unmount() }. */
export function mount(fn) {
  const inst = { slots: [], idx: 0, pending: [], effects: new Set(), renders: 0, dirty: false, busy: false, result: undefined, dead: false };
  const run = () => {
    inst.busy = true;
    let guard = 0;
    try {
      while (inst.dirty && !inst.dead) {
        if (++guard > 100) throw new Error("render loop");
        inst.dirty = false;
        current = inst;
        inst.idx = 0;
        try { inst.result = fn(); } finally { current = null; }
        inst.renders += 1;
        const effects = inst.pending.splice(0);
        for (const e of effects) e();
      }
    } finally { inst.busy = false; }
  };
  inst.schedule = () => { if (inst.dead) return; inst.dirty = true; if (!inst.busy) run(); };
  inst.schedule();
  return {
    result: () => inst.result,
    renders: () => inst.renders,
    unmount: () => {
      inst.dead = true;
      for (const s of inst.effects) if (typeof s.cleanup === "function") s.cleanup();
    },
  };
}
`;
const shimFile = join(out, "react-shim.mjs");
writeFileSync(shimFile, shim);

const entry = `
export { mount } from ${JSON.stringify(shimFile)};
export { useCall } from ${JSON.stringify(join(src, "hooks/useCall.js"))};
export { useGroupCall } from ${JSON.stringify(join(src, "hooks/useGroupCall.js"))};
export { useElapsedSeconds, useCallTimer } from ${JSON.stringify(join(src, "hooks/useCallTimer.js"))};
export * as callClock from ${JSON.stringify(join(src, "lib/callClock.js"))};
`;
const file = join(out, "bundle.mjs");
await build({
  stdin: { contents: entry, resolveDir: src, loader: "js" },
  bundle: true,
  platform: "node",
  format: "esm",
  outfile: file,
  jsx: "automatic",
  logLevel: "silent",
  plugins: [{
    name: "react-shim-and-stubs",
    setup(b) {
      b.onResolve({ filter: /^react(\/jsx-runtime|\/jsx-dev-runtime)?$/ }, () => ({ path: shimFile }));
      b.onResolve({ filter: /\?(url|raw|worker|inline|worker&url)$/ }, (args) => ({ path: args.path, namespace: "stub" }));
      b.onLoad({ filter: /.*/, namespace: "stub" }, () => ({ contents: "export default 'stub';", loader: "js" }));
    },
  }],
  loader: { ".js": "jsx", ".css": "empty", ".png": "empty", ".svg": "empty", ".mp3": "empty", ".webp": "empty", ".gif": "empty", ".woff2": "empty" },
  // DEV loads the glass-QA bridge, which is how the hooks are put into a live call here.
  define: { "import.meta.env": JSON.stringify({ MODE: "test", DEV: true, PROD: false }) },
  banner: { js: "import { createRequire as __cr } from 'module'; const require = __cr(import.meta.url);" },
});

// ---- browser globals the hooks read ----
const store = new Map();
const el = () => ({
  style: {}, dataset: {}, classList: { add() {}, remove() {}, contains: () => false, toggle() {} },
  setAttribute() {}, getAttribute: () => null, removeAttribute() {}, appendChild() {}, remove() {},
  addEventListener() {}, removeEventListener() {}, getContext: () => null, play: () => Promise.resolve(),
});
globalThis.window ??= globalThis;
globalThis.localStorage ??= { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
globalThis.sessionStorage ??= globalThis.localStorage;
Object.defineProperty(globalThis, "navigator", { value: { userAgent: "node", mediaDevices: undefined, platform: "Linux" }, configurable: true });
globalThis.matchMedia ??= () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
globalThis.location ??= { hostname: "descall.com", href: "https://descall.com/", pathname: "/", search: "", hash: "", origin: "https://descall.com", protocol: "https:" };
globalThis.addEventListener ??= () => {};
globalThis.removeEventListener ??= () => {};
globalThis.dispatchEvent ??= () => true;
globalThis.fetch = () => Promise.reject(new Error("offline in selftest"));
globalThis.document ??= {
  documentElement: el(), body: el(), head: el(), createElement: el, querySelector: () => null, querySelectorAll: () => [],
  getElementById: () => null, addEventListener() {}, removeEventListener() {}, visibilityState: "visible", hidden: false, cookie: "",
};
for (const k of ["AudioWorkletNode", "AudioContext", "MediaStream", "RTCPeerConnection", "RTCSessionDescription", "RTCIceCandidate", "HTMLElement", "HTMLMediaElement", "Element", "Node", "Event", "CustomEvent", "Image", "Audio", "ResizeObserver", "IntersectionObserver", "MutationObserver", "BroadcastChannel"]) {
  globalThis[k] ??= class { constructor() {} observe() {} disconnect() {} unobserve() {} addEventListener() {} removeEventListener() {} postMessage() {} close() {} play() { return Promise.resolve(); } pause() {} load() {} };
}

// ---- fake timers (installed after the build: esbuild needs the real ones) ----
const real = { setTimeout, clearTimeout, setInterval, clearInterval, now: Date.now };
const clock = { now: 1_800_000_000_000, seq: 0, timers: new Map() };
globalThis.setTimeout = (fn, ms = 0, ...args) => { const id = ++clock.seq; clock.timers.set(id, { at: clock.now + Math.max(0, Number(ms) || 0), fn, args, every: 0 }); return id; };
globalThis.setInterval = (fn, ms = 0, ...args) => { const every = Math.max(1, Number(ms) || 0); const id = ++clock.seq; clock.timers.set(id, { at: clock.now + every, fn, args, every }); return id; };
globalThis.clearTimeout = (id) => { clock.timers.delete(id); };
globalThis.clearInterval = globalThis.clearTimeout;
globalThis.requestAnimationFrame = (cb) => globalThis.setTimeout(() => cb(clock.now), 16);
globalThis.cancelAnimationFrame = (id) => globalThis.clearTimeout(id);
Date.now = () => clock.now;
const settle = () => new Promise((r) => setImmediate(r));
async function advance(ms) {
  const end = clock.now + ms;
  for (;;) {
    let nextId = null;
    let next = null;
    for (const [id, t] of clock.timers) if (t.at <= end && (!next || t.at < next.at || (t.at === next.at && id < nextId))) { next = t; nextId = id; }
    if (!next) break;
    clock.now = next.at;
    if (next.every) next.at += next.every; else clock.timers.delete(nextId);
    try { next.fn(...next.args); } catch (err) { console.warn("[timer]", err?.message || err); }
    await settle();
  }
  clock.now = end;
  await settle();
}

const quiet = console.info;
console.info = () => {};
const api = await import(pathToFileURL(file).href);
const { mount, useCall, useGroupCall, useElapsedSeconds, useCallTimer, callClock } = api;

const socket = { connected: true, id: "sock", on() {}, off() {}, emit() {}, once() {}, onAny() {}, offAny() {} };
const me = { id: "u-me", username: "me" };
store.set("descall_user", JSON.stringify(me));

// The QA bridge applies these scenes as soon as it loads (DEV only).
globalThis.__glassQaScenes = [
  { scene: "dm-call", peer: { id: "u-peer", username: "peer" }, callType: "voice", durationSeconds: 0, cameraOn: false, remoteCameraOn: false },
  { scene: "group-call", groupId: "g1", callType: "voice", durationSeconds: 0, cameraOn: false, participants: [{ id: "u-2", username: "two" }] },
];

const dm = mount(() => useCall(socket));
const group = mount(() => useGroupCall(socket, me.id));
await settle();
await advance(50); // let the QA bridge's dynamic import resolve and apply the scenes
await settle();

assert.equal(dm.result().mode, "active", "QA bridge put the DM hook into an active call");
assert.equal(group.result().isInCall, true, "QA bridge put the group hook into a call");

// ---- 1) the hooks do not re-render on the second ticks ----
const dmBefore = dm.renders();
const groupBefore = group.renders();
await advance(3000);
const dmTicks = dm.renders() - dmBefore;
const groupTicks = group.renders() - groupBefore;
console.log(`renders over 3 s of a live call: useCall ${dmTicks}, useGroupCall ${groupTicks}`);
assert.equal(dmTicks, 0, `useCall re-rendered ${dmTicks}x in 3 s of a call (its state must not tick)`);
assert.equal(groupTicks, 0, `useGroupCall re-rendered ${groupTicks}x in 3 s of a call (its state must not tick)`);

// ---- 2) they expose a stable start instead, and the same seconds as before ----
const dmCall = dm.result();
const groupCall = group.result();
assert.equal(typeof dmCall.durationStartedAt, "number", "useCall exposes durationStartedAt");
assert.equal(typeof groupCall.durationStartedAt, "number", "useGroupCall exposes durationStartedAt");
assert.equal(dmCall.durationStoppedAt, null);
assert.equal(groupCall.durationStoppedAt, null);
assert.ok(!("duration" in dmCall) && !("duration" in groupCall), "no ticking duration value on the hooks");
assert.equal(callClock.elapsedSeconds(dmCall.durationStartedAt, dmCall.durationStoppedAt), 3);
assert.equal(callClock.elapsedSeconds(groupCall.durationStartedAt, groupCall.durationStoppedAt), 3);

// ---- 3) a timer component ticks itself, once per second ----
const seen = [];
const timer = mount(() => {
  const s = useElapsedSeconds(groupCall.durationStartedAt, null);
  const text = useCallTimer(groupCall.durationStartedAt, null);
  seen.push([s, text]);
  return text;
});
const twin = mount(() => useCallTimer(groupCall.durationStartedAt, null));
assert.equal(timer.result(), "0:03");
assert.equal(callClock.activeCallClockCount(), 1, "one shared ticker for both timers of the call");
const timerBefore = timer.renders();
await advance(3000);
assert.equal(timer.renders() - timerBefore, 3, "the timer re-renders once per second");
assert.deepEqual(seen.slice(-3), [[4, "0:04"], [5, "0:05"], [6, "0:06"]]);
assert.equal(twin.result(), "0:06");
assert.equal(dm.renders() - dmBefore, 0, "the hooks still did not re-render");
assert.equal(group.renders() - groupBefore, 0);
await advance(54_000);
assert.equal(timer.result(), "1:00");
timer.unmount();
twin.unmount();
assert.equal(callClock.activeCallClockCount(), 0, "the ticker stops with its last subscriber");

// ---- 4) a stopped DM call freezes; formatting matches the old call screen ----
const start = dm.result().durationStartedAt;
const frozen = mount(() => useCallTimer(start, start + 75_400));
const frozenRenders = frozen.renders();
await advance(5000);
assert.equal(frozen.result(), "1:15");
assert.equal(frozen.renders(), frozenRenders, "a stopped timer does not tick");
assert.equal(callClock.activeCallClockCount(), 0);
frozen.unmount();
assert.equal(callClock.formatCallTimer(0), "");
assert.equal(callClock.formatCallTimer(59), "0:59");
assert.equal(callClock.formatCallTimer(754), "12:34");
assert.equal(callClock.formatCallTimer(3725), "62:05");
assert.equal(callClock.elapsedSeconds(null), 0);
assert.equal(callClock.elapsedSeconds(1000, 999), 0);

dm.unmount();
group.unmount();
console.info = quiet;
Object.assign(globalThis, { setTimeout: real.setTimeout, clearTimeout: real.clearTimeout, setInterval: real.setInterval, clearInterval: real.clearInterval });
Date.now = real.now;
console.log("callDuration.selftest ok");
process.exit(0);
