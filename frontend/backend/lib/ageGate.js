/**
 * Age gate helpers (Oct 2026, App Store prep).
 *  - Under MIN_AGE (13) cannot create an account.
 *  - Casino / DesCoin games and transfers need ADULT_AGE (18) and a known birth date.
 * Birth dates are stored as `users.birth_date` (date, nullable for older accounts).
 */
const supabase = require("../db/supabase");

const MIN_AGE = 13;
const ADULT_AGE = 18;
const MAX_AGE = 120;

/** Parse "YYYY-MM-DD" into a UTC date string, or null if invalid. */
function parseBirthDate(raw) {
  const s = String(raw || "").trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return s;
}

function ageFromBirthDate(birthDate, now = new Date()) {
  const s = parseBirthDate(birthDate);
  if (!s) return null;
  const [y, mo, d] = s.split("-").map(Number);
  let age = now.getUTCFullYear() - y;
  const beforeBirthday =
    now.getUTCMonth() + 1 < mo || (now.getUTCMonth() + 1 === mo && now.getUTCDate() < d);
  if (beforeBirthday) age -= 1;
  return age;
}

/**
 * Validate a birth date coming from a client.
 * Returns { ok: true, birthDate, age } or { ok: false, status, code, error }.
 */
function validateBirthDate(raw) {
  const birthDate = parseBirthDate(raw);
  if (!birthDate) {
    return { ok: false, status: 400, code: "birth_date_invalid", error: "Enter a valid date of birth." };
  }
  const age = ageFromBirthDate(birthDate);
  if (age == null || age < 0 || age > MAX_AGE) {
    return { ok: false, status: 400, code: "birth_date_invalid", error: "Enter a valid date of birth." };
  }
  if (age < MIN_AGE) {
    return {
      ok: false,
      status: 403,
      code: "under_age",
      error: "You must be at least 13 years old to use Descall.",
    };
  }
  return { ok: true, birthDate, age };
}

function ageGroup(age) {
  if (age == null) return "unknown";
  if (age < MIN_AGE) return "child";
  if (age < ADULT_AGE) return "teen";
  return "adult";
}

// Small per-user cache so every casino command doesn't hit the DB.
const CACHE_MS = 5 * 60 * 1000;
const birthCache = new Map();

function forgetBirthDateCache(userId) {
  birthCache.delete(String(userId));
}

async function getBirthDate(userId) {
  const key = String(userId);
  const hit = birthCache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;
  const { data, error } = await supabase.from("users").select("birth_date").eq("id", userId).maybeSingle();
  if (error) throw error;
  const value = data?.birth_date || null;
  birthCache.set(key, { value, at: Date.now() });
  return value;
}

/** Casino needs a known birth date and 18+. */
async function casinoAccess(userId) {
  let birthDate = null;
  try {
    birthDate = await getBirthDate(userId);
  } catch {
    return { ok: false, text: "Casino is temporarily unavailable. Try again." };
  }
  if (!birthDate) {
    return { ok: false, text: "Add your date of birth to play casino games." };
  }
  const age = ageFromBirthDate(birthDate);
  if (age == null || age < ADULT_AGE) {
    return { ok: false, text: "Casino games are only available to users 18 and over." };
  }
  return { ok: true };
}

module.exports = {
  MIN_AGE,
  ADULT_AGE,
  parseBirthDate,
  ageFromBirthDate,
  validateBirthDate,
  ageGroup,
  casinoAccess,
  forgetBirthDateCache,
};
