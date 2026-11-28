/* Applies Settings › Görünüm everywhere and keeps it on the account.
   localStorage stays the cache (paints before the network); the account copy
   wins when it is newer, so every device ends up the same. */
import {
  APPEARANCE_EVENT,
  DEFAULT_ACCENT,
  LEGACY_SETTINGS_KEY,
  SETTINGS_KEY,
  SOLID_KEY,
  FONT_STEPS,
  SYNC_KEYS,
  applyAppearance,
  normalizeAppearance,
  readAppearance,
  readStoredSettings,
  writeAppearance,
} from "./appearancePrefs.js";
import {
  CALL_COIN_PREFS_EVENT,
  callCoinSyncFields,
  readCallCoinPrefs,
  sanitizeCallCoinPatch,
  writeCallCoinPrefs,
} from "./callCoinPrefs.js";

const FONT_STEP_MAX = FONT_STEPS.length - 1;
let premiumThemeKey = null;
let pushTimer = null;
let autoWatch = null;

function transparencySideEffects(on) {
  if (typeof window === "undefined") return;
  try {
    if (on) window.localStorage?.setItem(SOLID_KEY, "1");
    else window.localStorage?.removeItem(SOLID_KEY);
  } catch {
    /* ignore */
  }
  // Desktop: the forced "lite" key (no blur). Off only drops a forced "1",
  // so the automatic slow-GPU fallback keeps working.
  try {
    const LITE = "descall:glass-desktop-lite";
    const cur = window.localStorage?.getItem(LITE);
    if (on && cur !== "1") {
      window.localStorage?.setItem(LITE, "1");
      import("./glassDesktop.js").then((m) => m.setGlassDesktopLitePreference?.(true)).catch(() => {});
    } else if (!on && cur === "1") {
      import("./glassDesktop.js").then((m) => m.setGlassDesktopLitePreference?.(false)).catch(() => {});
    }
  } catch {
    /* ignore */
  }
  const root = document.documentElement;
  if (!root.classList.contains("glass-ui")) return;
  if (on) {
    root.classList.add("a11y-solid");
    return;
  }
  // Off: let the device signals decide again (Reduce Transparency, forced colors).
  import("./glassDisplay.js").then((m) => m.refreshDisplayClasses?.()).catch(() => {});
  import("./glassUi.js").then((m) => m.syncGlassUi?.(window)).catch(() => {});
}

function watchAuto(prefs) {
  if (typeof window === "undefined" || !window.matchMedia) return;
  if (prefs.themeMode !== "auto") {
    autoWatch?.();
    autoWatch = null;
    return;
  }
  if (autoWatch) return;
  const mq = window.matchMedia("(prefers-color-scheme: light)");
  const onChange = () => applyNow(readAppearance());
  mq.addEventListener?.("change", onChange);
  autoWatch = () => mq.removeEventListener?.("change", onChange);
}

let motionSkipped = false;
function motionSideEffects(on) {
  const want = Boolean(on);
  if (want === motionSkipped) return;
  motionSkipped = want;
  // Framer springs run in JS, so the CSS rule alone does not reach them.
  import("framer-motion")
    .then((m) => {
      if (m.MotionGlobalConfig) m.MotionGlobalConfig.skipAnimations = want;
    })
    .catch(() => {});
}

function applyNow(prefs) {
  const applied = applyAppearance(prefs, { premiumThemeKey });
  transparencySideEffects(applied?.reduceTransparency);
  motionSideEffects(applied?.reduceMotion);
  watchAuto(applied || prefs);
  return applied;
}

/** The equipped shop theme (App.jsx / UserPanel) owns the palette while it is on. */
export function setPremiumThemeKey(key) {
  premiumThemeKey = key || null;
}

export function applyStoredAppearance({ premium } = {}) {
  if (premium !== undefined) setPremiumThemeKey(premium);
  return applyNow(readAppearance());
}

/* The account's look (shop theme, accent, light/dark) belongs to the account, not
   the device. Text size and the reduce motion / transparency choices stay: they are
   about the person at this screen and the sign-in page should honour them too. */
const ACCOUNT_LOOK_KEYS = ["premiumThemeKey", "accentColor", "themeMode", "darkMode", "appearanceUpdatedAt"];

/**
 * Pure: the cached settings blob without the signed-out account's look. Dropping
 * appearanceUpdatedAt matters: the next sign-in then pulls the account copy instead
 * of pushing these blanks over it (pullAccountAppearance compares the two times).
 */
export function withoutAccountLook(settings) {
  const next = { ...(settings && typeof settings === "object" ? settings : {}) };
  for (const key of ACCOUNT_LOOK_KEYS) delete next[key];
  return next;
}

/** Removes the account's look from this device's cache (both settings keys). */
export function forgetAccountLook(storage = typeof localStorage !== "undefined" ? localStorage : null) {
  if (!storage) return;
  try {
    const json = JSON.stringify(withoutAccountLook(readStoredSettings(storage)));
    storage.setItem(SETTINGS_KEY, json);
    storage.setItem(LEGACY_SETTINGS_KEY, json);
  } catch {
    /* quota / private mode */
  }
}

/**
 * Signed out (sign-in and sign-up screens): Descall's own look, dark with the logo
 * blue, never the last account's colourful shop theme. With forget, the device cache
 * also drops it so a cold start paints the same. The account's look comes back from
 * the server on the next sign-in (App.jsx: equipped theme + pullAccountAppearance).
 */
export function applySignedOutAppearance({ forget = false } = {}) {
  setPremiumThemeKey(null);
  if (forget) forgetAccountLook();
  return applyNow({ ...readAppearance(), themeMode: "dark", accentColor: DEFAULT_ACCENT });
}

function emit(prefs) {
  try {
    window.dispatchEvent(new CustomEvent(APPEARANCE_EVENT, { detail: prefs }));
  } catch {
    /* ignore */
  }
}

function pickSync(prefs) {
  const p = normalizeAppearance(prefs);
  // The end-of-call DesCoin summary setting rides on the same account copy.
  return { ...Object.fromEntries(SYNC_KEYS.map((k) => [k, p[k]])), ...callCoinSyncFields(readCallCoinPrefs()) };
}

function emitCallCoin(prefs) {
  try {
    window.dispatchEvent(new CustomEvent(CALL_COIN_PREFS_EVENT, { detail: prefs }));
  } catch {
    /* ignore */
  }
}

/** Settings › Cüzdan ve kazanç: cache, tell open views, push to the account (debounced). */
export function updateCallCoinPrefs(patch) {
  const next = writeCallCoinPrefs(patch, { updatedAt: new Date().toISOString() });
  emitCallCoin(next);
  if (typeof window !== "undefined") {
    window.clearTimeout(pushTimer);
    pushTimer = window.setTimeout(pushNow, 600);
  }
  return next;
}

async function pushNow() {
  pushTimer = null;
  try {
    const { putAccountAppearance } = await import("../api/appearance.js");
    const res = await putAccountAppearance(pickSync(readAppearance()));
    if (res?.updatedAt) writeAppearance(readAppearance(), { updatedAt: res.updatedAt });
  } catch {
    /* offline: the next pull/push reconciles */
  }
}

/** Settings changed a value: cache, apply, and push to the account (debounced). */
export function updateAppearance(patch) {
  const next = normalizeAppearance({ ...readAppearance(), ...patch });
  writeAppearance(next, { updatedAt: new Date().toISOString() });
  const applied = applyNow(next);
  emit(next);
  if (typeof window !== "undefined") {
    window.clearTimeout(pushTimer);
    pushTimer = window.setTimeout(pushNow, 600);
  }
  return applied;
}

/** On login / focus: the newer copy wins. */
export async function pullAccountAppearance() {
  try {
    const { getAccountAppearance } = await import("../api/appearance.js");
    const res = await getAccountAppearance();
    const localAt = Date.parse(readStoredSettings().appearanceUpdatedAt || "") || 0;
    const remoteAt = Date.parse(res?.updatedAt || "") || 0;
    if (res?.appearance && remoteAt > localAt) {
      const next = normalizeAppearance({ ...readAppearance(), ...res.appearance });
      writeAppearance(next, { updatedAt: res.updatedAt });
      const coin = sanitizeCallCoinPatch(res.appearance);
      if (Object.keys(coin).length) emitCallCoin(writeCallCoinPrefs(coin));
      applyNow(next);
      emit(next);
      return next;
    }
    if ((!res?.appearance || remoteAt < localAt) && localAt > 0) await pushNow();
  } catch {
    /* signed out / offline */
  }
  return readAppearance();
}

/** Pure: the font step a Ctrl/⌘ shortcut moves to, or null when it is not one. */
export function fontStepForShortcut(event, current) {
  if (!event || !(event.ctrlKey || event.metaKey) || event.altKey) return null;
  const key = event.key;
  const step = Number(current) || 0;
  if (key === "+" || key === "=" || key === "Add") return Math.min(FONT_STEP_MAX, step + 1);
  if (key === "-" || key === "_" || key === "Subtract") return Math.max(0, step - 1);
  if (key === "0") return 1;
  return null;
}

let shortcutsInstalled = false;
/** Desktop + web: Ctrl + / Ctrl − / Ctrl 0 change Settings › Görünüm › Yazı boyutu. */
export function installFontShortcuts(win = typeof window !== "undefined" ? window : undefined) {
  if (!win || shortcutsInstalled) return;
  shortcutsInstalled = true;
  win.addEventListener(
    "keydown",
    (event) => {
      if (win.document?.documentElement?.classList.contains("glass-ui")) return;
      const current = readAppearance().fontStep;
      const next = fontStepForShortcut(event, current);
      if (next == null) return;
      event.preventDefault();
      if (next !== current) updateAppearance({ fontStep: next });
    },
    true
  );
}
