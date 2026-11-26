/**
 * Real-user performance monitoring for Yönetici Paneli › Performans.
 *
 *   startRum()           once, after the first screen (main.jsx): sampling decision, web-vitals
 *                        (attribution build, own chunk) for LCP, INP, CLS, FCP, TTFB
 *   markAppStart()       the signed-in app shell is on screen (cold start, every platform)
 *   rumIntent(name)      the user asked for something we time (open a conversation, join voice)
 *   rumDone(name, ...)   ... and it is on screen / connected
 *   setRumView(view)     which app view is showing ("app/kanal", "app/dm", "app/ses", ...)
 *
 * Sampled per page load (DEFAULT_SAMPLE_RATE), batched, sent with navigator.sendBeacon
 * (text/plain, no preflight) to POST /api/perf/beacon; fetch keepalive when sendBeacon is
 * missing or refuses. Nothing is sent when the browser asks for Do Not Track / Global
 * Privacy Control, in development builds, or when the page is not sampled.
 */
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

const state = {
  started: false,
  sampled: false,
  sid: "",
  rate: DEFAULT_SAMPLE_RATE,
  batcher: null,
  views: createViewTimeline(""),
  intents: new Map(),
  appStartSent: false,
  pendingAppStart: null,
  version: "",
};

const now = () => (typeof performance !== "undefined" && performance.now ? performance.now() : Date.now());

function optedOut() {
  try {
    const n = typeof navigator !== "undefined" ? navigator : {};
    if (n.globalPrivacyControl === true) return true;
    if (n.doNotTrack === "1" || (typeof window !== "undefined" && window.doNotTrack === "1")) return true;
  } catch {
    /* ignore */
  }
  return false;
}

function devBuild() {
  try {
    return Boolean(import.meta.env?.DEV) && !/[?&]rum=1/.test(window.location.search);
  } catch {
    return false;
  }
}

async function token() {
  try {
    const { getToken } = await import("../storage.js");
    return getToken() || "";
  } catch {
    return "";
  }
}

let cachedToken = "";

function baseFields() {
  const nav = typeof navigator !== "undefined" ? navigator : null;
  let nt = "";
  try {
    nt = performance.getEntriesByType?.("navigation")?.[0]?.type || "";
  } catch {
    nt = "";
  }
  return {
    sid: state.sid,
    p: platformOf(),
    ver: state.version,
    dc: deviceClassOf(nav),
    cn: connectionOf(nav),
    br: browserOf(nav?.userAgent),
    nt: String(nt).replace(/[^a-z_-]/g, "").slice(0, 16),
    sr: state.rate,
    ...(cachedToken ? { tk: cachedToken } : {}),
  };
}

let beaconUrl = "";

function send(payload) {
  if (!beaconUrl) return false;
  const body = JSON.stringify(payload);
  try {
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      const blob = new Blob([body], { type: "text/plain;charset=UTF-8" });
      if (navigator.sendBeacon(beaconUrl, blob)) return true;
    }
  } catch {
    /* fall through to fetch */
  }
  try {
    fetch(beaconUrl, { method: "POST", body, keepalive: true, credentials: "omit", headers: { "Content-Type": "text/plain;charset=UTF-8" } }).catch(() => {});
    return true;
  } catch {
    return false;
  }
}

function add(ev) {
  if (!state.sampled || !state.batcher) return;
  state.batcher.add(ev);
}

function currentRoute(at = null) {
  const view = at == null ? state.views.current() : state.views.at(at);
  return routeOf(typeof location !== "undefined" ? location.pathname : "/", view);
}

/** Which app view is on screen; the route of every sample taken while it shows. */
export function setRumView(view) {
  state.views.set(String(view || ""), now());
}

/** The signed-in app is on screen: app start = time since the page (or webview) started. */
export function markAppStart() {
  if (state.appStartSent) return;
  state.appStartSent = true;
  const v = Math.round(now());
  if (!state.started) {
    state.pendingAppStart = v;
    return;
  }
  add({ m: "appstart", v, r: "app", a: { at: 0 } });
}

/** Start of something we time (message list of a conversation, voice join). */
export function rumIntent(name, key = "") {
  state.intents.set(name, { at: now(), key: String(key || "") });
}

/**
 * End of a timed action. `fallbackStart` (performance.now) is used when no intent was
 * recorded (deep link, first load). Intents older than 30 s are dropped.
 */
export function rumDone(name, { key = "", route = "", kind = "", fallbackStart = null } = {}) {
  const intent = state.intents.get(name);
  state.intents.delete(name);
  const t = now();
  let start = null;
  if (intent && (!key || !intent.key || intent.key === String(key)) && t - intent.at < 30000) start = intent.at;
  else if (Number.isFinite(fallbackStart)) start = fallbackStart;
  if (start == null) return null;
  const v = Math.round(t - start);
  if (v < 0 || v > 120000) return null;
  add({ m: name, v, r: route || currentRoute(), a: { ...(kind ? { kind } : {}), at: Math.round(start) } });
  return v;
}

function flushNow(final = false) {
  if (!state.batcher) return;
  state.batcher.flush(final);
}

/** Start once, after the first screen. `sampleRate` only for tests / owner overrides. */
export async function startRum({ sampleRate = DEFAULT_SAMPLE_RATE, version = "" } = {}) {
  if (state.started || typeof window === "undefined") return false;
  state.started = true;
  if (optedOut() || devBuild()) return false;
  state.rate = sampleRate;
  if (!shouldSample(sampleRate)) return false;
  state.sampled = true;
  state.sid = newSessionId();
  state.version = String(version || (typeof __DESCALL_VERSION__ !== "undefined" ? __DESCALL_VERSION__ : "")).slice(0, 24);
  try {
    const { apiBase } = await import("../nodeRouting.js");
    beaconUrl = `${apiBase()}/api/perf/beacon`;
  } catch {
    try {
      const { API_BASE_URL } = await import("../../config/api.js");
      beaconUrl = `${API_BASE_URL}/api/perf/beacon`;
    } catch {
      return false;
    }
  }
  cachedToken = await token();
  state.batcher = createBatcher({ send, base: baseFields });
  add({ m: "sess", v: 1, r: currentRoute() });
  if (state.pendingAppStart != null) {
    add({ m: "appstart", v: state.pendingAppStart, r: "app", a: { at: 0 } });
    state.pendingAppStart = null;
  }
  const onHide = () => {
    if (document.visibilityState === "hidden") {
      token().then((t) => (cachedToken = t)).catch(() => {});
      flushNow(true);
    }
  };
  document.addEventListener("visibilitychange", onHide, { capture: true });
  window.addEventListener("pagehide", () => flushNow(true), { capture: true });
  try {
    const wv = await import("web-vitals/attribution");
    const report = (metric) => {
      const name = metric?.name;
      let route;
      if (name === "INP") route = currentRoute(metric?.attribution?.interactionTime);
      else if (name === "CLS") route = currentRoute();
      // Load metrics belong to the page the load landed on (the first view, if any).
      else route = routeOf(typeof location !== "undefined" ? location.pathname : "/", state.views.first());
      add(eventFromVital(metric, route));
    };
    wv.onLCP(report);
    wv.onINP(report);
    wv.onCLS(report);
    wv.onFCP(report);
    wv.onTTFB(report);
  } catch {
    /* app timings still go out */
  }
  return true;
}

/** Test hook: internal state snapshot. */
export function __rumState() {
  return { started: state.started, sampled: state.sampled, sid: state.sid, queued: state.batcher?.size() || 0, view: state.views.current() };
}
