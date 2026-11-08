/**
 * The optional "How did you hear about us?" question, asked once right after a new
 * account is created (users.heard_about via POST /auth/heard-about).
 *
 * Every sign-up path (App.jsx password / Google / Apple, site/MarketingBoot.jsx) calls
 * markHeardAboutPending() next to "descall:justRegistered"; HeardAboutPrompt shows the
 * question when the flag is there and removes it on an answer or "Skip". localStorage,
 * so a web sign-up that continues in the app tab, or an app relaunch, still asks once.
 */

export const HEARD_ABOUT_PENDING_KEY = "descall:heardAboutPending";
/** A pending question older than this is dropped (the sign-up moment has passed). */
export const HEARD_ABOUT_TTL_MS = 3 * 24 * 60 * 60 * 1000;

/** Answer ids, in the order they are offered (backend lib/signupStats.js HEARD_ABOUT_KEYS). */
export const HEARD_ABOUT_OPTIONS = ["google", "ai_assistant", "instagram", "tiktok", "youtube", "friend", "discord", "forum", "other"];

function store(storage) {
  if (storage) return storage;
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
}

export function markHeardAboutPending(userId, { now = Date.now(), storage } = {}) {
  const s = store(storage);
  if (!s) return false;
  try {
    s.setItem(HEARD_ABOUT_PENDING_KEY, JSON.stringify({ at: now, uid: userId ? String(userId) : null }));
    return true;
  } catch {
    return false;
  }
}

/** Cheap check before loading the prompt: is any question waiting on this device? */
export function hasHeardAboutPendingFlag({ storage } = {}) {
  try {
    return Boolean(store(storage)?.getItem(HEARD_ABOUT_PENDING_KEY));
  } catch {
    return false;
  }
}

/** True when the signed-in user `userId` still has the question waiting. */
export function isHeardAboutPending(userId, { now = Date.now(), storage } = {}) {
  const s = store(storage);
  if (!s || !userId) return false;
  let parsed = null;
  try {
    parsed = JSON.parse(s.getItem(HEARD_ABOUT_PENDING_KEY) || "null");
  } catch {
    parsed = null;
  }
  if (!parsed || !Number.isFinite(parsed.at)) return false;
  if (now - parsed.at > HEARD_ABOUT_TTL_MS || parsed.at > now + 60_000) {
    clearHeardAboutPending({ storage: s });
    return false;
  }
  return !parsed.uid || parsed.uid === String(userId);
}

export function clearHeardAboutPending({ storage } = {}) {
  const s = store(storage);
  try {
    s?.removeItem(HEARD_ABOUT_PENDING_KEY);
  } catch {
    /* ignore */
  }
}
