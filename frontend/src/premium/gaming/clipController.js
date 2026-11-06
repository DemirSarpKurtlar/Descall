/**
 * One instant-clip recorder per app, outside React. The host configures it from the
 * instant_clip settings; the settings panel and the editor subscribe to its state.
 */
import { useSyncExternalStore } from "react";
import { ClipRecorder, clipSupported } from "./instantClip.js";
import { pinvoke, logPremiumEvent } from "./bridge.js";

let recorder = null;
let current = { key: "" };
let state = { running: false, info: null, error: "", editor: null, cost: null };
const listeners = new Set();
let infoTimer = null;

function set(patch) {
  state = { ...state, ...patch };
  for (const fn of [...listeners]) {
    try { fn(); } catch { /* ignore */ }
  }
}

export function clipState() {
  return state;
}

export function useClipState() {
  return useSyncExternalStore((fn) => { listeners.add(fn); return () => listeners.delete(fn); }, clipState, clipState);
}

function stopRecorder() {
  clearInterval(infoTimer);
  infoTimer = null;
  if (recorder) recorder.stop();
  recorder = null;
  set({ running: false, info: null });
}

/** Apply settings: { on, sourceId, windowSec }. Starts, restarts or stops the ring. */
export async function configureClip(settings = {}, allowed = true) {
  const want = Boolean(allowed && settings.on && settings.sourceId && clipSupported());
  const key = want ? `${settings.sourceId}|${settings.windowSec}` : "";
  if (key === current.key && (Boolean(recorder) === want)) return state;
  current = { key };
  stopRecorder();
  if (!want) {
    set({ error: settings.on && !clipSupported() ? "unsupported" : "" });
    return state;
  }
  const r = new ClipRecorder({
    sourceId: settings.sourceId,
    windowSec: Number(settings.windowSec) === 60 ? 60 : 30,
    onError: () => { set({ error: "encoder" }); stopRecorder(); },
  });
  recorder = r;
  try {
    const info = await r.start();
    if (recorder !== r) { r.stop(); return state; }
    set({ running: true, info, error: "" });
    infoTimer = setInterval(() => { if (recorder) set({ info: recorder.info() }); }, 2000);
  } catch (err) {
    if (recorder === r) recorder = null;
    set({ running: false, error: String(err?.message || "start") === "no_codec" ? "no_codec" : "start" });
  }
  return state;
}

/** Hotkey or button: freeze the buffer and open the editor. */
export function saveClip() {
  if (!recorder || !state.running) return false;
  const snap = recorder.snapshot();
  if (!snap.chunks.length) return false;
  set({ editor: snap });
  logPremiumEvent("clip", "");
  return true;
}

export function closeClipEditor() {
  set({ editor: null });
}

/** CPU / RAM now (main process metrics) plus the ring's own numbers. */
export async function measureClipCost() {
  const m = await pinvoke("premium:instant_clip:metrics");
  const cost = { at: Date.now(), main: m?.ok ? m : null, info: recorder ? recorder.info() : null };
  set({ cost });
  return cost;
}

export function stopClip() {
  current = { key: "" };
  stopRecorder();
}
