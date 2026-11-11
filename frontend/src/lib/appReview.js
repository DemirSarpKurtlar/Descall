/**
 * App Store rating request (iOS app only). Uses Apple's own sheet through
 * DescallDisplay.requestReview (StoreKit); Apple decides whether it appears, shows it at
 * most three times a year and never in TestFlight builds. We never draw our own
 * "do you like Descall?" gate in front of it (App Store Review Guideline 5.6.1).
 *
 * We only ask after a good moment: a call that lasted a while, for someone who has used
 * the app on a few different days, and not again for months.
 */

const KEY = "descall.appReview.v1";
const DAY = 24 * 60 * 60 * 1000;

export const REVIEW_RULES = {
  minDaysSinceFirstOpen: 2,
  minOpenDays: 3,
  minCallMs: 2 * 60 * 1000,
  cooldownDays: 120,
  maxPerYear: 3,
};

function read(storage) {
  try {
    const raw = storage?.getItem(KEY);
    const v = raw ? JSON.parse(raw) : null;
    if (v && typeof v === "object") {
      return {
        firstOpen: Number(v.firstOpen) || 0,
        openDays: Array.isArray(v.openDays) ? v.openDays.filter((d) => typeof d === "string").slice(-30) : [],
        asked: Array.isArray(v.asked) ? v.asked.filter((n) => Number.isFinite(n)).slice(-10) : [],
      };
    }
  } catch {
    /* private mode or bad JSON: start fresh */
  }
  return { firstOpen: 0, openDays: [], asked: [] };
}

function write(storage, state) {
  try {
    storage?.setItem(KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

function dayKey(now) {
  return new Date(now).toISOString().slice(0, 10);
}

/** Pure eligibility check, exported for the selftest. */
export function reviewEligible(state, { now, callMs }, rules = REVIEW_RULES) {
  if (!state.firstOpen) return false;
  if (now - state.firstOpen < rules.minDaysSinceFirstOpen * DAY) return false;
  if (new Set(state.openDays).size < rules.minOpenDays) return false;
  if (!(callMs >= rules.minCallMs)) return false;
  const last = state.asked.length ? Math.max(...state.asked) : 0;
  if (last && now - last < rules.cooldownDays * DAY) return false;
  const inYear = state.asked.filter((t) => now - t < 365 * DAY).length;
  return inYear < rules.maxPerYear;
}

function iosPlugin(win) {
  try {
    const cap = win?.Capacitor;
    if (!cap?.isNativePlatform?.() || cap.getPlatform?.() !== "ios") return null;
    const plugin = cap.Plugins?.DescallDisplay;
    return typeof plugin?.requestReview === "function" ? plugin : null;
  } catch {
    return null;
  }
}

/** Call once per app start: remembers the first open and which days the app was used. */
export function noteAppOpen({ win = globalThis.window, storage = globalThis.localStorage, now = Date.now() } = {}) {
  if (!iosPlugin(win)) return;
  const state = read(storage);
  if (!state.firstOpen) state.firstOpen = now;
  const today = dayKey(now);
  if (!state.openDays.includes(today)) state.openDays.push(today);
  write(storage, state);
}

/**
 * After a call ends. Returns true when the rating sheet was requested, so the caller can
 * skip other prompts (the feedback banner) for this moment.
 */
export function maybeRequestAppReview({ callMs = 0, win = globalThis.window, storage = globalThis.localStorage, now = Date.now(), delayMs = 1500 } = {}) {
  const plugin = iosPlugin(win);
  if (!plugin) return false;
  const state = read(storage);
  if (!reviewEligible(state, { now, callMs })) return false;
  state.asked.push(now);
  write(storage, state);
  setTimeout(() => {
    Promise.resolve(plugin.requestReview()).catch(() => {});
  }, delayMs);
  return true;
}
