/**
 * Imperative confirm and prompt. The shared GlassConfirm host (mounted from
 * App) paints the in-app glass dialog on Electron, web, iOS, and Android.
 * window.confirm / window.prompt remain only when that host is not mounted
 * (tests, or a paint before App).
 */
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

function presentCopy({ title, message, confirmLabel, cancelLabel, danger, input }) {
  const split = !title && message ? splitConfirmCopy(message) : null;
  return {
    title: split ? split.title : title || message,
    message: split ? split.message : title ? message : "",
    confirmLabel,
    cancelLabel,
    danger,
    input: input || null,
  };
}

/**
 * @returns {Promise<boolean>} true when the person confirms.
 * The host fires the warning haptic. Without a host, danger still haptics
 * and the platform confirm is used.
 */
export async function confirmAction({
  title = "",
  message = "",
  confirmLabel = "OK",
  cancelLabel = "Cancel",
  danger = true,
} = {}) {
  const desktopText = [title, message].filter(Boolean).join("\n\n");
  if (typeof present === "function") {
    const answer = await present(presentCopy({ title, message, confirmLabel, cancelLabel, danger }));
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

/**
 * @returns {Promise<string|null>} the typed text, or null when cancelled.
 * Empty string is a confirm with no text (same as window.prompt).
 */
export async function promptAction({
  title = "",
  message = "",
  confirmLabel = "OK",
  cancelLabel = "Cancel",
  defaultValue = "",
  placeholder = "",
  danger = false,
} = {}) {
  const desktopText = [title, message].filter(Boolean).join("\n\n");
  if (typeof present === "function") {
    const value = await present(presentCopy({
      title,
      message,
      confirmLabel,
      cancelLabel,
      danger,
      input: { defaultValue: defaultValue ?? "", placeholder },
    }));
    if (value == null) return null;
    return String(value);
  }
  try {
    if (typeof window !== "undefined" && typeof window.prompt === "function") {
      return window.prompt(desktopText, defaultValue ?? "");
    }
  } catch {
    /* no prompt available */
  }
  return null;
}
