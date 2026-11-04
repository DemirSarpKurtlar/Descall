/**
 * First-party signup attribution capture.
 * Marketing source (UTM / gclid / referrer) is independent of Google OAuth.
 */

const FIRST_KEY = "descall:attribution:first";
const LAST_KEY = "descall:attribution:last";
const SESSION_KEY = "descall:attribution:session";
const VID_KEY = "descall:vid";
const VID_RE = /^[a-zA-Z0-9_-]{8,64}$/;

const PARAMS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "gclid",
  "gbraid",
  "wbraid",
  "fbclid",
  "msclkid",
  "yclid",
  "ttclid",
  "twclid",
];

// Referrers that are a round-trip of our own flow (OAuth consent screens, our
// own pages). A visit coming back from these must not overwrite last-touch.
const PASS_THROUGH_REFERRER = /(^|\.)(accounts\.google\.[a-z.]+|appleid\.apple\.com|descall\.com)$/i;

/** web | electron | ios | ipad | android | watch */
export function detectClientPlatform(env = typeof window !== "undefined" ? window : null) {
  try {
    if (!env) return "web";
    if (env.electronAPI || /Electron\//.test(env.navigator?.userAgent || "")) return "electron";
    const cap = env.Capacitor;
    if (cap && (typeof cap.isNativePlatform === "function" ? cap.isNativePlatform() : false)) {
      const p = typeof cap.getPlatform === "function" ? cap.getPlatform() : "";
      if (p === "android") return "android";
      if (/iPad/.test(env.navigator?.userAgent || "") || (env.navigator?.maxTouchPoints > 1 && /Macintosh/.test(env.navigator?.userAgent || ""))) return "ipad";
      return "ios";
    }
  } catch {
    /* ignore */
  }
  return "web";
}

/** Invite context implied by the landing URL (server/group invite, friend ref, code). */
export function inviteKindFromLocation(pathname = "/", search = "") {
  const p = String(pathname || "/");
  const q = String(search || "");
  if (/^\/(servers\/join|invite\/s)\/[A-Za-z0-9_-]+/i.test(p) || /[?&]si=[A-Za-z0-9_-]+/.test(q)) return "server_invite";
  if (/^\/(invite|i)\/[A-Za-z0-9_-]+/i.test(p) || /[?&](invite|i)=[A-Za-z0-9_-]+/.test(q)) return "group_invite";
  if (/[?&](ref|inviteBy)=[A-Za-z0-9_.-]{2,24}/.test(q)) return "friend_invite";
  if (/[?&](referral|promo)=[A-Za-z0-9_-]{3,}/i.test(q)) return "referral_code";
  return "";
}

function referrerHostname(referrer) {
  try {
    return new URL(String(referrer || "")).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}


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
  clientPlatform = "web",
} = {}) {
  const params = new URLSearchParams(search.startsWith("?") ? search : search ? `?${search}` : "");
  const snap = {
    utm_source: "",
    utm_medium: "",
    utm_campaign: "",
    utm_term: "",
    utm_content: "",
    gclid: "",
    fbclid: "",
    referrer: String(referrer || ""),
    landing_page: String(href || "").split("#")[0],
    landing_path: String(pathname || "/") || "/",
    captured_at: now,
    client_platform: clientPlatform,
    invite_kind: inviteKindFromLocation(pathname, search),
  };
  for (const key of PARAMS) {
    const value = params.get(key);
    if (value) snap[key] = value;
  }
  return snap;
}

export function hasMarketingSignal(snap) {
  if (!snap || typeof snap !== "object") return false;
  return Boolean(
    snap.gclid ||
      snap.fbclid ||
      snap.utm_source ||
      snap.utm_medium ||
      snap.utm_campaign ||
      snap.utm_term ||
      snap.utm_content ||
      snap.gbraid ||
      snap.wbraid ||
      snap.msclkid ||
      snap.yclid ||
      snap.ttclid ||
      snap.twclid ||
      snap.invite_kind
  );
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
      clientPlatform: detectClientPlatform(env),
    });
    const localStorage = env.localStorage;
    const sessionStorage = env.sessionStorage;
    // sessionStorage mirrors localStorage so private mode / storage quirks
    // still keep the landing data until signup in this tab.
    const existingFirst = readJson(FIRST_KEY, localStorage) || readJson(FIRST_KEY, sessionStorage);
    if (!existingFirst) {
      writeJson(FIRST_KEY, incoming, localStorage);
      writeJson(FIRST_KEY, incoming, sessionStorage);
    }
    // Last touch follows the latest landing, except a round-trip from our own
    // pages or an OAuth consent screen (SPA reloads, Google/Apple redirects)
    // with no new marketing signal: that would erase the real source.
    const host = referrerHostname(incoming.referrer);
    const passThrough = !hasMarketingSignal(incoming) && host && PASS_THROUGH_REFERRER.test(host);
    const existingLast = readJson(LAST_KEY, localStorage) || readJson(LAST_KEY, sessionStorage);
    if (!passThrough || !existingLast) {
      writeJson(LAST_KEY, incoming, localStorage);
      writeJson(LAST_KEY, incoming, sessionStorage);
    }
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
  if (!env?.localStorage && !env?.sessionStorage) return null;
  const first = readJson(FIRST_KEY, env.localStorage) || readJson(FIRST_KEY, env.sessionStorage);
  const last = readJson(LAST_KEY, env.localStorage) || readJson(LAST_KEY, env.sessionStorage) || first;
  if (!first && !last) return null;
  return {
    first: first || last,
    last: last || first,
    visitorKey: getVisitorKey(env),
  };
}
