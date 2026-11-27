/**
 * Pure helpers behind the passkey screens (control center, sign-in states, post-sign-in
 * suggestion). No React, no network: selftest visual.selftest.mjs.
 */

export const STALE_DAYS = 30;
export const USAGE_DAYS = 30;
const DAY = 86400000;

/**
 * What a passkey is, for its tile, the live preview and the advice:
 * windows | ios | mac | android | key | web (a password manager or an unknown provider).
 */
export function passkeyKind(p) {
  if (!p) return "web";
  const provider = String(p.provider || "").toLowerCase();
  const transports = Array.isArray(p.transports) ? p.transports : [];
  if (p.family === "key" || (!p.synced && (transports.includes("usb") || transports.includes("nfc")) && !transports.includes("internal"))) return "key";
  if (/yubikey|security key/.test(provider)) return "key";
  if (/icloud|apple/.test(provider) || p.family === "apple") return String(p.device || "") === "Mac" || p.platform === "macos" ? "mac" : "ios";
  if (/google|samsung/.test(provider) || p.family === "google") return "android";
  if (/windows/.test(provider) || p.family === "windows") return "windows";
  if (p.platform === "ios") return "ios";
  if (p.platform === "android") return "android";
  if (p.platform === "windows" || p.platform === "electron") return "windows";
  if (p.platform === "macos") return "mac";
  return "web";
}

/** Platform family for "a second passkey on another platform". */
export function kindFamily(kind) {
  return kind === "ios" || kind === "mac" ? "apple" : kind;
}

/** Sign-ins per local day, oldest first, `days` long (the 30-day bars). */
export function usageBars(timestamps = [], now = Date.now(), days = USAGE_DAYS) {
  const bars = new Array(days).fill(0);
  const end = new Date(now);
  end.setHours(24, 0, 0, 0);
  const endMs = end.getTime();
  for (const t of timestamps) {
    const ms = typeof t === "number" ? t : Date.parse(t);
    if (!Number.isFinite(ms) || ms > now + 60000) continue;
    const back = Math.floor((endMs - 1 - ms) / DAY);
    if (back >= 0 && back < days) bars[days - 1 - back] += 1;
  }
  return bars;
}

/** Days since last use (or since it was added, when never used). */
export function idleDays(p, now = Date.now()) {
  const ref = Date.parse(p?.lastUsedAt || p?.createdAt || "");
  if (Number.isFinite(ref)) return Math.max(0, Math.floor((now - ref) / DAY));
  return Number.isFinite(p?.idleDays) ? p.idleDays : 0;
}

/** Working passkeys unused for `days`, longest first. */
export function stalePasskeys(list = [], now = Date.now(), days = STALE_DAYS) {
  return list
    .filter((p) => !p.suspended && idleDays(p, now) >= days)
    .sort((a, b) => idleDays(b, now) - idleDays(a, now));
}

/** { passkey, password, social } as whole percentages that add up to 100 (null without data). */
export function mixPercent(mix) {
  const total = Number(mix?.total) || 0;
  if (!total) return null;
  const raw = ["passkey", "password", "social"].map((k) => ((Number(mix[k]) || 0) * 100) / total);
  const floor = raw.map(Math.floor);
  let rest = 100 - floor.reduce((a, b) => a + b, 0);
  const order = raw.map((v, i) => [v - floor[i], i]).sort((a, b) => b[0] - a[0]);
  for (const [, i] of order) {
    if (rest <= 0) break;
    floor[i] += 1;
    rest -= 1;
  }
  return { passkey: floor[0], password: floor[1], social: floor[2] };
}

/** Seconds with one decimal for the KPI ("1,8 sn"); null stays null. */
export function seconds(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return null;
  return Math.round(ms / 100) / 10;
}

/** Name ideas right after adding (i18n keys under passkey.center.names.*). */
export function nameSuggestions(kind) {
  switch (kind) {
    case "windows":
    case "web":
      return ["home", "work", "laptop", "gaming"];
    case "mac":
      return ["macbook", "work", "home"];
    case "ios":
      return ["iphone", "ipad", "work"];
    case "android":
      return ["phone", "tablet", "work"];
    case "key":
      return ["keyMain", "keyBackup", "keyChain"];
    default:
      return ["home", "work", "laptop"];
  }
}

/**
 * "Add a second passkey on another platform": null when nothing to advise, else the ways
 * this device can add one. Desktop / web: a phone over QR (remoteDevice) or a security key.
 * Phones: on a computer (descall.com in a browser). Never when there is no passkey at all
 * (the main button covers that) or when two families already exist.
 */
export function backupAdvice(list = [], path = "web") {
  const active = list.filter((p) => !p.suspended);
  if (!active.length) return null;
  const families = new Set(active.map((p) => kindFamily(passkeyKind(p))));
  if (families.size >= 2) return null;
  const only = [...families][0];
  if (path === "ios" || path === "android") return { only, options: ["computer"] };
  const options = [];
  if (only !== "apple" && only !== "android") options.push("remoteDevice");
  if (only !== "key") options.push("securityKey");
  if (!options.length) options.push("remoteDevice");
  return { only, options };
}

/**
 * The live preview for a passkey: which system window opens on a Windows computer and on a
 * phone when this passkey signs in.
 *   desktop: hello (Windows Hello on this PC) | qr (phone over QR) | gpm (Google Password
 *            Manager in Chrome) | usb (security key) | web (the browser's own list)
 *   phone:   none (not on phones) | ios (iCloud sheet) | android (Google sheet) | nfc
 */
export function previewFor(kind) {
  switch (kind) {
    case "windows":
      return { desktop: "hello", phone: "none" };
    case "ios":
    case "mac":
      return { desktop: "qr", phone: "ios" };
    case "android":
      return { desktop: "gpm", phone: "android" };
    case "key":
      return { desktop: "usb", phone: "nfc" };
    default:
      return { desktop: "web", phone: "ios" };
  }
}

/** Which word the sign-in button uses here: face (Face ID), finger, hello, passkey. */
export function signInStyle(path, win = typeof window !== "undefined" ? window : undefined) {
  if (path === "ios") return "face";
  if (path === "android") return "finger";
  if (path === "tauri") return "hello";
  if (path === "handoff") {
    const ua = String(win?.navigator?.userAgent || "");
    return /Windows/i.test(ua) ? "hello" : "passkey";
  }
  return "passkey";
}

/** State card platform for this device: windows | ios | android | web. */
export function statePlatform(path, win = typeof window !== "undefined" ? window : undefined) {
  if (path === "ios") return "ios";
  if (path === "android") return "android";
  if (path === "tauri") return "windows";
  if (path === "handoff") return "windows";
  const ua = String(win?.navigator?.userAgent || "");
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
  if (/Android/i.test(ua)) return "android";
  if (/Windows/i.test(ua)) return "windows";
  return "web";
}

/**
 * The state card for a failed ceremony: cancel | none | err (null: say nothing).
 * "none" when the platform says this device has no Descall passkey.
 */
export function stateForError(e) {
  if (!e) return null;
  if (e.code === "aborted") return null;
  if (e.code === "cancelled") return "cancel";
  if (e.code === "no_credential") return "none";
  return "err";
}

// ---- post-sign-in suggestion (draft A, section 3) ---------------------------------------

export const SUGGEST_KEY = "descall.pk.suggest.v1";
const MAX_REMINDERS = 3;
const REMIND_AFTER = 3;

function readState(storage) {
  try {
    const raw = storage?.getItem(SUGGEST_KEY);
    const v = raw ? JSON.parse(raw) : null;
    if (v && typeof v === "object") return { never: Boolean(v.never), signIns: Number(v.signIns) || 0, nextAt: Number(v.nextAt) || 1, reminders: Number(v.reminders) || 0, pending: Boolean(v.pending) };
  } catch {
    /* corrupt: start over */
  }
  return { never: false, signIns: 0, nextAt: 1, reminders: 0, pending: false };
}

function writeState(storage, s) {
  try {
    storage?.setItem(SUGGEST_KEY, JSON.stringify(s));
  } catch {
    /* private mode */
  }
}

export function suggestionState(storage) {
  return readState(storage);
}

/** A password / Google / Apple sign-in just finished on this device. */
export function noteSignIn(storage, method) {
  if (method === "passkey") return readState(storage);
  const s = readState(storage);
  s.signIns += 1;
  s.pending = true;
  writeState(storage, s);
  return s;
}

/** Show the card now? (once per sign-in, rules: "Sonra hatirlat" after 3 sign-ins, at most 3 times). */
export function shouldSuggest(storage, { available = false, localPasskey = false } = {}) {
  const s = readState(storage);
  if (!available || localPasskey || s.never || !s.pending) return false;
  if (s.reminders >= MAX_REMINDERS) return false;
  return s.signIns >= s.nextAt;
}

/** later | never | added | shown (the card was seen; the pending flag is cleared). */
export function answerSuggestion(storage, answer) {
  const s = readState(storage);
  s.pending = false;
  if (answer === "later") {
    s.reminders += 1;
    s.nextAt = s.signIns + REMIND_AFTER;
  } else if (answer === "never" || answer === "added") {
    s.never = true;
  }
  writeState(storage, s);
  return s;
}

/** Settings: turn the suggestion back on for this device. */
export function resetSuggestion(storage) {
  writeState(storage, { never: false, signIns: 0, nextAt: 1, reminders: 0, pending: false });
}
