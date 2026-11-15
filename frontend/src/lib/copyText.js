import { hapticSuccess } from "./fluid/haptics.js";

/**
 * The one way the app copies text. Every "Kopyala" button goes through here; no component
 * calls navigator.clipboard.writeText itself (copyText.selftest.mjs guards that).
 *
 * Order, first success wins:
 *  1. navigator.clipboard.writeText (call copyText straight from the click so the user
 *     gesture is still live);
 *  2. the desktop app's OS clipboard over IPC (preload electronAPI.writeClipboardText,
 *     electron/clipboardText.cjs), for when Chromium refuses the web API. That refusal was
 *     the Windows "Write permission denied" error: the session permission handler denied
 *     clipboard-sanitized-write for descall://app;
 *  3. a hidden textarea + document.execCommand("copy").
 *
 * Resolves true only when one of them wrote, false otherwise. Never rejects, so a refused
 * clipboard can never reach the error reporter as an unhandled rejection. Callers show
 * their success toast only on true and t("Could not copy to clipboard") on false.
 *
 * `deps` ({ navigator, window, document }) is for the self-test; the app passes nothing.
 */

export const COPY_TEXT_MAX_CHARS = 1_000_000;

function env(deps) {
  const g = typeof globalThis !== "undefined" ? globalThis : {};
  return {
    nav: deps && "navigator" in deps ? deps.navigator : g.navigator,
    win: deps && "window" in deps ? deps.window : g.window,
    doc: deps && "document" in deps ? deps.document : g.document,
  };
}

async function viaWebClipboard(nav, value) {
  try {
    if (!nav?.clipboard || typeof nav.clipboard.writeText !== "function") return false;
    await nav.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}

async function viaElectron(win, value) {
  try {
    const write = win?.electronAPI?.writeClipboardText;
    if (typeof write !== "function") return false;
    const res = await write(value);
    return Boolean(res && res.ok === true);
  } catch {
    return false;
  }
}

function viaExecCommand(doc, value) {
  let ta = null;
  try {
    if (!doc?.body || typeof doc.createElement !== "function" || typeof doc.execCommand !== "function") return false;
    const active = doc.activeElement;
    ta = doc.createElement("textarea");
    ta.value = value;
    ta.setAttribute("readonly", "");
    ta.setAttribute("aria-hidden", "true");
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    ta.style.top = "0";
    ta.style.opacity = "0";
    doc.body.appendChild(ta);
    ta.select();
    try { ta.setSelectionRange?.(0, value.length); } catch { /* iOS Safari needs the explicit range */ }
    const ok = doc.execCommand("copy") === true;
    try { active?.focus?.({ preventScroll: true }); } catch { /* focus is best effort */ }
    return ok;
  } catch {
    return false;
  } finally {
    try { ta?.remove?.(); } catch { /* already gone */ }
  }
}

/** Copies text. Resolves { ok, method } where method is "clipboard" | "electron" | "execCommand" | null. */
export async function copyTextResult(text, deps) {
  try {
    const value = String(text ?? "");
    if (value.length > COPY_TEXT_MAX_CHARS) return { ok: false, method: null };
    const { nav, win, doc } = env(deps);
    let method = null;
    if (await viaWebClipboard(nav, value)) method = "clipboard";
    else if (await viaElectron(win, value)) method = "electron";
    else if (viaExecCommand(doc, value)) method = "execCommand";
    if (!method) return { ok: false, method: null };
    // On the iOS app a success tick follows a real write; web/desktop stay silent.
    try { hapticSuccess(); } catch { /* haptics are best effort */ }
    return { ok: true, method };
  } catch {
    return { ok: false, method: null };
  }
}

/** Copies text. Resolves true when it reached the clipboard, false otherwise. Never rejects. */
export async function copyText(text, deps) {
  return (await copyTextResult(text, deps)).ok;
}
