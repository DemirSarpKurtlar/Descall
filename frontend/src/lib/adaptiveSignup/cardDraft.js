/**
 * Half-finished sign-up (growth 1B): the email (or username) and the chosen username stay on
 * this device for a day, so a closed app or a reload continues where the person was.
 * Never the password, the date of birth or anything else. Cleared after a sign-in or sign-up.
 */
const KEY = "descall:signupCard:v1";
const TTL_MS = 24 * 60 * 60 * 1000;

function store() {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function loadCardDraft(now = Date.now(), s = store()) {
  try {
    const raw = s?.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw);
    if (!v || typeof v !== "object" || !(now - Number(v.at) < TTL_MS)) {
      s.removeItem(KEY);
      return null;
    }
    return {
      identifier: typeof v.identifier === "string" ? v.identifier.slice(0, 254) : "",
      username: typeof v.username === "string" ? v.username.slice(0, 24) : "",
    };
  } catch {
    return null;
  }
}

export function saveCardDraft(patch, now = Date.now(), s = store()) {
  try {
    if (!s) return;
    const cur = loadCardDraft(now, s) || {};
    const next = { ...cur, ...patch };
    const identifier = String(next.identifier || "").trim();
    const username = String(next.username || "").trim();
    if (!identifier && !username) {
      s.removeItem(KEY);
      return;
    }
    s.setItem(KEY, JSON.stringify({ identifier: identifier.slice(0, 254), username: username.slice(0, 24), at: now }));
  } catch {
    /* storage off */
  }
}

export function clearCardDraft(s = store()) {
  try {
    s?.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
