/**
 * First-party signup attribution capture.
 * Marketing source (UTM / gclid / referrer) is independent of Google OAuth.
 */

const FIRST_KEY = "descall:attribution:first";
const LAST_KEY = "descall:attribution:last";
const SESSION_KEY = "descall:attribution:session";
const VID_KEY = "descall:vid";
const VID_RE = /^[a-zA-Z0-9_-]{8,64}$/;

const PARAMS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "gclid", "fbclid"];

// Round-trips of our own flow (our pages, Google/Apple OAuth screens) must not
// overwrite last-touch when they carry no new marketing signal.
const PASS_THROUGH = /\/\/[^/]*(accounts\.google|appleid\.apple|descall\.com)/;

function readJson(key, storage) {
  if (!storage) return null;
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function writeJson(key, value, storage) {
  if (!storage) return;
  try {
    storage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota / private mode */
  }
}

export function collectSnapshotFromLocation({
  search = "",
  href = "",
  pathname = "/",
  referrer = "",
  now = new Date().toISOString(),
} = {}) {
  const params = new URLSearchParams(search.startsWith("?") ? search : search ? `?${search}` : "");
  const snap = {
    referrer: String(referrer || ""),
    landing_page: String(href || "").split("#")[0],
    landing_path: String(pathname || "/") || "/",
    captured_at: now,
  };
  for (const key of PARAMS) snap[key] = params.get(key) || "";
  return snap;
}

export function hasMarketingSignal(snap) {
  return Boolean(snap && typeof snap === "object" && PARAMS.some((k) => snap[k]));
}

export function getVisitorKey(env = typeof window !== "undefined" ? window : null) {
  const storage = env?.localStorage;
  if (!storage) return "";
  try {
    const existing = storage.getItem(VID_KEY);
    if (existing && VID_RE.test(existing)) return existing;
    const uuid = typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID().replace(/-/g, "")
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 14)}`;
    const key = `v${String(uuid).replace(/[^a-zA-Z0-9]/g, "").slice(0, 31)}`;
    if (!VID_RE.test(key)) return "";
    storage.setItem(VID_KEY, key);
    return key;
  } catch {
    return "";
  }
}

export function captureVisit(env = typeof window !== "undefined" ? window : null) {
  if (!env) return null;
  try {
    getVisitorKey(env);
    const incoming = collectSnapshotFromLocation({
      search: env.location?.search || "",
      href: env.location?.href || "",
      pathname: env.location?.pathname || "/",
      referrer: env.document?.referrer || "",
      now: new Date().toISOString(),
    });
    const localStorage = env.localStorage;
    const sessionStorage = env.sessionStorage;
    if (!readJson(FIRST_KEY, localStorage)) writeJson(FIRST_KEY, incoming, localStorage);
    if (hasMarketingSignal(incoming) || !PASS_THROUGH.test(incoming.referrer)) writeJson(LAST_KEY, incoming, localStorage);
    try {
      sessionStorage?.setItem(SESSION_KEY, "1");
    } catch {
      /* ignore */
    }
    if (typeof window !== "undefined" && env === window) {
      import("./firstPartyAnalytics.js")
        .then((mod) => mod.trackVisit())
        .catch(() => {});
    }
    return peekAttribution(env);
  } catch {
    return null;
  }
}

export function peekAttribution(env = typeof window !== "undefined" ? window : null) {
  if (!env?.localStorage) return null;
  const first = readJson(FIRST_KEY, env.localStorage);
  const last = readJson(LAST_KEY, env.localStorage) || first;
  if (!first && !last) return null;
  return {
    first: first || last,
    last: last || first,
    visitorKey: getVisitorKey(env),
  };
}
