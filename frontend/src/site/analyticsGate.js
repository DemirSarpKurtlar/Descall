/**
 * Consent + analytics gate.
 * Third parties stay cold until the visitor explicitly accepts analytics cookies.
 * A signed-in session never grants analytics by itself.
 * Accounts under 16 are never measured, even if they accept.
 */
import { ageFromBirthDate } from "../lib/age.js";

const CONSENT_KEY = "descall:cookie_consent_v1";
const ALLOWED_KEY = "descall:analytics_allowed";
const USER_KEY = "descall_user";

/** Analytics and ads stay off below this age (stricter than the 13+ account minimum). */
export const ANALYTICS_MIN_AGE = 16;

function readStorage(key) {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function getCookieConsent() {
  try {
    const raw = readStorage(CONSENT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.choice === "accepted" || parsed?.choice === "rejected") return parsed;
  } catch {
    /* ignore */
  }
  return null;
}

/** True when the signed-in account has a known birth date under 16. Unknown age is allowed. */
export function analyticsBlockedByAge(user) {
  let record = user;
  if (record === undefined) {
    try {
      const raw = readStorage(USER_KEY);
      record = raw ? JSON.parse(raw) : null;
    } catch {
      return false;
    }
  }
  const birth = record?.birthDate || record?.birth_date || null;
  if (!birth) return false;
  const age = ageFromBirthDate(birth);
  return age != null && age < ANALYTICS_MIN_AGE;
}

export function setCookieConsent(choice) {
  const payload = { choice, at: new Date().toISOString() };
  try {
    localStorage.setItem(CONSENT_KEY, JSON.stringify(payload));
  } catch {
    /* ignore */
  }
  if (choice === "accepted" && !analyticsBlockedByAge()) markAnalyticsAllowed();
  else clearAnalyticsAllowed();
  try {
    window.dispatchEvent(new CustomEvent("descall:cookie-consent", { detail: payload }));
  } catch {
    /* ignore */
  }
  return payload;
}

export function isAnalyticsAllowed() {
  if (analyticsBlockedByAge()) return false;
  return getCookieConsent()?.choice === "accepted";
}

export function markAnalyticsAllowed() {
  if (analyticsBlockedByAge()) {
    clearAnalyticsAllowed();
    return;
  }
  try {
    sessionStorage.setItem(ALLOWED_KEY, "1");
  } catch {
    /* ignore */
  }
  if (typeof window !== "undefined") {
    window.__descallAnalyticsAllowed = true;
    try {
      window.dispatchEvent(new CustomEvent("descall:analytics-allowed"));
    } catch {
      /* ignore */
    }
  }
}

export function clearAnalyticsAllowed() {
  try {
    sessionStorage.removeItem(ALLOWED_KEY);
  } catch {
    /* ignore */
  }
  if (typeof window !== "undefined") window.__descallAnalyticsAllowed = false;
}

/** Product CTA / auth intent — does NOT grant analytics by itself (consent does). */
export function signalMarketingEngage(detail = {}) {
  try {
    window.dispatchEvent(new CustomEvent("descall:marketing-engage", { detail }));
  } catch {
    /* ignore */
  }
  // Hydrate React shell for interactive UI (auth, language, menu).
  try {
    window.dispatchEvent(new CustomEvent("descall:hydrate-marketing", { detail }));
  } catch {
    /* ignore */
  }
}
