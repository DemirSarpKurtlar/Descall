/**
 * 3.0.0 (A2 §4.4): the composer grows with its text up to N lines, then
 * scrolls inside. iPhone (glass-ui) 5 lines, iPad 8, desktop keeps its
 * previous 120 px cap.
 */
export const IPHONE_MAX_LINES = 5;
export const IPAD_MAX_LINES = 8;
export const DESKTOP_MAX_PX = 120;

/** "iphone" | "ipad" | "desktop" */
export function composerDeviceClass({ glass = false, coarse = false } = {}) {
  if (glass) return "iphone";
  if (coarse) return "ipad";
  return "desktop";
}

export function maxComposerHeight({ device = "desktop", lineHeight = 24, paddingY = 0, borderY = 0 } = {}) {
  const lh = Number.isFinite(lineHeight) && lineHeight > 0 ? lineHeight : 24;
  const chrome = (Number(paddingY) || 0) + (Number(borderY) || 0);
  if (device === "iphone") return Math.round(lh * IPHONE_MAX_LINES + chrome);
  if (device === "ipad") return Math.round(lh * IPAD_MAX_LINES + chrome);
  return Math.max(DESKTOP_MAX_PX, Math.round(lh + chrome));
}

/**
 * Height for the textarea given its natural scrollHeight.
 * Returns { height, scroll } where scroll=true means the cap was hit and the
 * field should scroll internally.
 */
export function composerHeight({ scrollHeight = 0, minHeight = 0, maxHeight = Infinity, borderY = 0 } = {}) {
  const natural = Math.max(Number(minHeight) || 0, (Number(scrollHeight) || 0) + (Number(borderY) || 0));
  const cap = Number.isFinite(maxHeight) ? maxHeight : natural;
  return { height: Math.min(natural, cap), scroll: natural > cap + 0.5 };
}

/** Enter that belongs to an IME composition (Japanese, Chinese, Korean, Turkish-Q dead keys). */
export function isImeEnter(e) {
  if (!e) return false;
  return Boolean(e.isComposing || e.nativeEvent?.isComposing || e.keyCode === 229 || e.nativeEvent?.keyCode === 229);
}

/** Whether a keydown should send: plain Enter, not Shift+Enter, not mid-IME. */
export function shouldSendOnEnter(e, { composing = false } = {}) {
  if (!e || e.key !== "Enter") return false;
  if (e.shiftKey) return false;
  if (composing || isImeEnter(e)) return false;
  return true;
}
