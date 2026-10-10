/**
 * Imperative confirm for call sites that use window.confirm today.
 *
 * On the iPhone Liquid Glass UI this asks the shared GlassConfirm host
 * (mounted from App). Everywhere else it stays window.confirm, so desktop,
 * web and Android keep their current dialogs and copy.
 */
import { isGlassUiEnabled } from "./glassUi.js";
import { hapticWarning } from "./fluid/haptics.js";

let present = null;

/** @param {(options: object) => Promise<boolean>} fn */
export function registerGlassConfirm(fn) {
  present = fn;
  return () => {
    if (present === fn) present = null;
  };
}

/**
 * Long "Question? Explanation." strings become a title plus a body.
 * Short questions stay a title. The original string is what desktop confirms.
 */
export function splitConfirmCopy(text) {
  const s = String(text || "").trim();
  const q = s.indexOf("?");
  if (q > 0 && q < s.length - 1 && s.length > 40) {
    const title = s.slice(0, q + 1).trim();
    const message = s.slice(q + 1).trim();
    if (title && message) return { title, message };
  }
  return { title: s, message: "" };
}

/**
 * @returns {Promise<boolean>} true when the person confirms.
 * Glass path: the host fires the warning haptic. Desktop path: warning haptic
 * for danger, then window.confirm with the original text.
 */
export async function confirmAction({
  title = "",
  message = "",
  confirmLabel = "OK",
  cancelLabel = "Cancel",
  danger = true,
} = {}) {
  const desktopText = [title, message].filter(Boolean).join("\n\n");
  if (isGlassUiEnabled() && typeof present === "function") {
    const split = !title && message ? splitConfirmCopy(message) : null;
    const answer = await present({
      title: split ? split.title : title || message,
      message: split ? split.message : title ? message : "",
      confirmLabel,
      cancelLabel,
      danger,
    });
    return Boolean(answer);
  }
  if (danger) hapticWarning();
  try {
    if (typeof window !== "undefined" && typeof window.confirm === "function") {
      return Boolean(window.confirm(desktopText));
    }
  } catch {
    /* no confirm available: continue */
  }
  return true;
}
