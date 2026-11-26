/**
 * Real-user performance collection, pure part (no DOM access of its own; tested by
 * rumCore.selftest.mjs). lib/perf/rum.js wires it to web-vitals and sendBeacon.
 *
 * What goes out per sampled page load: a random session id (never stored, new on every
 * load), platform, app version, device class, connection type, browser family, the route
 * the metric belongs to, the value and a few attribution fields (CSS selectors, phases).
 * The session token is put in the body so the server can derive the user id (the only
 * personal data kept); the country comes from the edge on the server side.
 */

export const RUM_VERSION = 1;
export const DEFAULT_SAMPLE_RATE = 0.25;
export const MAX_BATCH = 30;

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

/** 16 random characters (crypto when there is one). */
export function newSessionId(rand = null) {
  let bytes = null;
  if (!rand) {
    try {
      bytes = globalThis.crypto?.getRandomValues?.(new Uint8Array(16)) || null;
    } catch {
      bytes = null;
    }
  }
  let out = "";
  for (let i = 0; i < 16; i++) {
    const n = bytes ? bytes[i] : Math.floor((rand || Math.random)() * 256);
    out += ALPHABET[n % ALPHABET.length];
  }
  return out;
}

/** One sampling decision per page load. */
export function shouldSample(rate = DEFAULT_SAMPLE_RATE, rand = Math.random) {
  const r = Number(rate);
  if (!(r > 0)) return false;
  if (r >= 1) return true;
  return rand() < r;
}

/** "tauri" | "electron" | "ios" | "android" | "web". */
export function platformOf(win) {
  const w = win || (typeof window !== "undefined" ? window : null);
  if (!w) return "web";
  try {
    if ((w.__TAURI_INTERNALS__ && typeof w.__TAURI_INTERNALS__ === "object") || w.electronAPI?.isTauri === true) return "tauri";
    if (w.electronAPI?.isElectron) return "electron";
    const cap = w.Capacitor;
    if (cap) {
      const native = typeof cap.isNativePlatform === "function" ? cap.isNativePlatform() : false;
      const p = typeof cap.getPlatform === "function" ? cap.getPlatform() : "";
      if (native && (p === "ios" || p === "android")) return p;
    }
  } catch {
    /* locked-down window */
  }
  return "web";
}

/** "low" | "mid" | "high" | "" from device memory (GB) and logical cores. */
export function deviceClassOf(nav) {
  const n = nav || (typeof navigator !== "undefined" ? navigator : null);
  if (!n) return "";
  const mem = Number(n.deviceMemory);
  const cores = Number(n.hardwareConcurrency);
  const hasMem = Number.isFinite(mem) && mem > 0;
  const hasCores = Number.isFinite(cores) && cores > 0;
  if (!hasMem && !hasCores) return "";
  if ((hasMem && mem <= 2) || (hasCores && cores <= 2)) return "low";
  if ((hasMem && mem <= 4) || (hasCores && cores <= 4)) return "mid";
  return "high";
}

/** "wifi" | "ethernet" | "4g" | "3g" | "2g" | "offline" | "". */
export function connectionOf(nav) {
  const n = nav || (typeof navigator !== "undefined" ? navigator : null);
  if (!n) return "";
  if (n.onLine === false) return "offline";
  const c = n.connection || n.mozConnection || n.webkitConnection;
  if (!c) return "";
  if (c.type === "wifi" || c.type === "ethernet") return c.type;
  const e = String(c.effectiveType || "");
  if (e === "4g" || e === "3g") return e;
  if (e === "2g" || e === "slow-2g") return "2g";
  return "";
}

/** Browser family only (no version): Chrome, Safari, Firefox, Edge, WebView, Electron. */
export function browserOf(ua) {
  const s = String(ua || "");
  if (/Electron\//.test(s)) return "Electron";
  if (/Edg\//.test(s)) return "Edge";
  if (/; wv\)/.test(s)) return "WebView";
  if (/Firefox\//.test(s)) return "Firefox";
  if (/Chrome\//.test(s) || /CriOS\//.test(s)) return "Chrome";
  if (/Safari\//.test(s)) return "Safari";
  if (/AppleWebKit/.test(s)) return "WebView";
  return "";
}

/** Route for a pathname when no app view is set: marketing pages keep their path. */
export function routeOf(pathname, view = "") {
  if (view) return view;
  const p = String(pathname || "/").split(/[?#]/)[0].toLowerCase();
  if (p === "/" || p === "") return "/";
  if (/^\/(app|channels|dm|servers|admin)(\/|$)/.test(p)) return "app";
  const parts = p.replace(/\/+$/, "").split("/").slice(0, 3);
  // ids and slugs deeper than two levels collapse ("/blog/<slug>" stays, "/invite/<code>" -> :id)
  if (parts[1] === "invite" || parts[1] === "i") return `/${parts[1]}/:id`;
  return parts.join("/") || "/";
}

/**
 * View timeline: which app view was on screen at a given time (ms since the page started).
 * INP is reported late (page hide); its interaction time decides the route it belongs to.
 */
export function createViewTimeline(start = "") {
  const marks = [{ at: 0, view: start }];
  return {
    set(view, at) {
      const v = String(view || "");
      const last = marks[marks.length - 1];
      if (last.view === v) return;
      marks.push({ at: Number(at) || 0, view: v });
      if (marks.length > 200) marks.splice(1, marks.length - 200);
    },
    at(time) {
      const t = Number(time);
      if (!Number.isFinite(t)) return marks[marks.length - 1].view;
      let v = marks[0].view;
      for (const m of marks) {
        if (m.at <= t) v = m.view;
        else break;
      }
      return v;
    },
    current() {
      return marks[marks.length - 1].view;
    },
    /** First real view shown within `withinMs` of the start (the page the load landed on). */
    first(withinMs = 15000) {
      const m = marks.find((x) => x.view && x.at <= withinMs);
      return m ? m.view : "";
    },
  };
}

/** web-vitals (attribution build) metric -> beacon event. */
export function eventFromVital(metric, route, sentAgoMs = 0) {
  const name = String(metric?.name || "").toLowerCase();
  if (!["lcp", "inp", "cls", "fcp", "ttfb"].includes(name)) return null;
  const v = Number(metric.value);
  if (!Number.isFinite(v) || v < 0) return null;
  const a = metric.attribution || {};
  let attr = null;
  if (name === "inp") {
    attr = {
      target: a.interactionTarget || "",
      type: a.interactionType || "",
      load: a.loadState || "",
      delay: a.inputDelay,
      proc: a.processingDuration,
      pres: a.presentationDelay,
      at: a.interactionTime,
    };
  } else if (name === "lcp") {
    attr = { element: a.element || "", ttfb: a.timeToFirstByte, loadDelay: a.resourceLoadDelay, loadTime: a.resourceLoadDuration ?? a.resourceLoadTime, renderDelay: a.elementRenderDelay };
  } else if (name === "cls") {
    attr = { target: a.largestShiftTarget || "" };
  }
  const out = { m: name, v: name === "cls" ? Math.round(v * 1000) / 1000 : Math.round(v), r: route };
  if (attr) {
    for (const k of Object.keys(attr)) if (attr[k] === "" || attr[k] == null || (typeof attr[k] === "number" && !Number.isFinite(attr[k]))) delete attr[k];
    for (const k of ["delay", "proc", "pres", "at", "ttfb", "loadDelay", "loadTime", "renderDelay"]) if (typeof attr[k] === "number") attr[k] = Math.round(attr[k]);
    if (Object.keys(attr).length) out.a = attr;
  }
  if (sentAgoMs > 0) out.t = Math.round(sentAgoMs);
  return out;
}

/**
 * Batches events and hands them to `send(payload, { final })`. Flushes at MAX_BATCH events,
 * after `idleMs`, and on demand (page hide). Never throws into the app.
 */
export function createBatcher({ send, base, idleMs = 20000, max = MAX_BATCH, schedule = (fn, ms) => setTimeout(fn, ms), cancel = (id) => clearTimeout(id), now = () => Date.now() }) {
  let queue = [];
  let timer = null;
  const flush = (final = false) => {
    if (timer != null) {
      cancel(timer);
      timer = null;
    }
    if (!queue.length) return false;
    const t = now();
    const events = queue.splice(0, max).map(({ at, ev }) => (t - at > 1000 ? { ...ev, t: (ev.t || 0) + (t - at) } : ev));
    let ok = false;
    try {
      ok = send({ v: RUM_VERSION, ...base(), e: events }, { final }) !== false;
    } catch {
      ok = false;
    }
    if (queue.length) flush(final);
    return ok;
  };
  return {
    add(ev) {
      if (!ev) return;
      queue.push({ at: now(), ev });
      if (queue.length >= max) flush(false);
      else if (timer == null) timer = schedule(() => {
        timer = null;
        flush(false);
      }, idleMs);
    },
    flush,
    size: () => queue.length,
  };
}
