/** Client mirror of backend/lib/ageGate.js (server is the source of truth). */
export const MIN_AGE = 13;
export const ADULT_AGE = 18;

export function parseBirthDate(raw) {
  const m = String(raw || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return { y, mo, d };
}

export function ageFromBirthDate(raw, now = new Date()) {
  const p = parseBirthDate(raw);
  if (!p) return null;
  let age = now.getFullYear() - p.y;
  if (now.getMonth() + 1 < p.mo || (now.getMonth() + 1 === p.mo && now.getDate() < p.d)) age -= 1;
  return age;
}

/** "unknown" | "child" | "teen" | "adult" */
export function ageGroupOf(raw) {
  const age = ageFromBirthDate(raw);
  if (age == null) return "unknown";
  if (age < MIN_AGE) return "child";
  if (age < ADULT_AGE) return "teen";
  return "adult";
}

export function isEligibleBirthDate(raw) {
  const age = ageFromBirthDate(raw);
  return age != null && age >= MIN_AGE && age <= 120;
}

/** After an under-13 signup attempt, this device refuses registration for 30 days. */
export const UNDER13_BLOCK_KEY = "descall:under13_signup_block";
export const UNDER13_BLOCK_MS = 30 * 24 * 60 * 60 * 1000;
export const DEVICE_SIGNUP_BLOCK_MESSAGE = "This device can't create an account right now. Try again later.";

function signupStorage(storage) {
  if (storage) return storage;
  try {
    if (typeof localStorage !== "undefined") return localStorage;
  } catch {
    /* ignore */
  }
  return null;
}

export function rememberUnder13SignupBlock(storage, now = Date.now()) {
  const s = signupStorage(storage);
  if (!s) return;
  try {
    s.setItem(UNDER13_BLOCK_KEY, JSON.stringify({ at: now }));
  } catch {
    /* ignore */
  }
}

export function under13SignupBlocked(storage, now = Date.now()) {
  const s = signupStorage(storage);
  if (!s) return false;
  try {
    const raw = s.getItem(UNDER13_BLOCK_KEY);
    if (!raw) return false;
    const at = Number(JSON.parse(raw)?.at);
    if (!Number.isFinite(at)) return false;
    if (now - at > UNDER13_BLOCK_MS) {
      s.removeItem(UNDER13_BLOCK_KEY);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/** Remember the device block when the entered date is under 13. Returns true if blocked. */
export function noteUnder13BirthDate(raw, storage, now = Date.now()) {
  const age = ageFromBirthDate(raw, new Date(now));
  if (age != null && age < MIN_AGE) {
    rememberUnder13SignupBlock(storage, now);
    return true;
  }
  return under13SignupBlocked(storage, now);
}
