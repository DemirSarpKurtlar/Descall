/**
 * Per-feature settings for Descall+ panels (src/premium/settings/*.jsx).
 *
 *   const [settings, update] = useFeatureSettings("mini_mode", { enabled: true });
 *   update({ autoOnMinimize: true });
 *
 * Desktop app: stored by Electron main in userData/premium-settings.json
 * (IPC premium:settings:get / premium:settings:set), so main-process modules read the
 * same values and start or stop when "enabled" changes.
 * Web / mobile: localStorage "descall:premium:<key>" (per device).
 */
import { useCallback, useEffect, useState } from "react";

const LS_PREFIX = "descall:premium:";
const cache = new Map();
const listeners = new Set();

function bridge() {
  return typeof window !== "undefined" ? window.descallPremium || null : null;
}

export function isDesktopApp() {
  return Boolean(bridge());
}

function readLocal(key) {
  try {
    const raw = window.localStorage.getItem(LS_PREFIX + key);
    const v = raw ? JSON.parse(raw) : {};
    return v && typeof v === "object" && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}

function writeLocal(key, value) {
  try { window.localStorage.setItem(LS_PREFIX + key, JSON.stringify(value)); } catch { /* private mode */ }
}

function emit(key, value) {
  for (const fn of [...listeners]) {
    try { fn(key, value); } catch { /* ignore */ }
  }
}

let bridgeHooked = false;
function hookBridge() {
  const b = bridge();
  if (bridgeHooked || !b) return;
  bridgeHooked = true;
  b.on("premium:settings-changed", (msg) => {
    if (!msg || typeof msg.key !== "string") return;
    cache.set(msg.key, msg.settings || {});
    emit(msg.key, msg.settings || {});
  });
}

/** Settings of one feature (cached; first read on desktop goes to main). */
export async function getFeatureSettings(key) {
  if (cache.has(key)) return cache.get(key);
  const b = bridge();
  let value = {};
  if (b) {
    hookBridge();
    try {
      const r = await b.invoke("premium:settings:get", key);
      value = r?.ok && r.settings ? r.settings : {};
    } catch {
      value = {};
    }
  } else if (typeof window !== "undefined") {
    value = readLocal(key);
  }
  cache.set(key, value);
  return value;
}

/** Shallow-merge a patch (null removes a field). Resolves with the stored settings. */
export async function setFeatureSettings(key, patch) {
  const b = bridge();
  let next;
  if (b) {
    hookBridge();
    const r = await b.invoke("premium:settings:set", key, patch || {});
    if (!r?.ok) throw new Error(r?.error || "settings-failed");
    next = r.settings || {};
  } else {
    next = { ...(cache.get(key) || readLocal(key)) };
    for (const [k, v] of Object.entries(patch || {})) {
      if (v === null || v === undefined) delete next[k];
      else next[k] = v;
    }
    writeLocal(key, next);
  }
  cache.set(key, next);
  emit(key, next);
  return next;
}

export function onFeatureSettings(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** React binding. `defaults` fill fields that were never set. */
export function useFeatureSettings(key, defaults = {}) {
  const [value, setValue] = useState(() => ({ ...defaults, ...(cache.get(key) || {}) }));
  useEffect(() => {
    let live = true;
    getFeatureSettings(key).then((v) => { if (live) setValue({ ...defaults, ...v }); });
    const off = onFeatureSettings((k, v) => { if (k === key && live) setValue({ ...defaults, ...v }); });
    return () => { live = false; off(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const update = useCallback((patch) => {
    setValue((prev) => ({ ...prev, ...patch }));
    return setFeatureSettings(key, patch).catch(() => getFeatureSettings(key));
  }, [key]);
  return [value, update];
}
