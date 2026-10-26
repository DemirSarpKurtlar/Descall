/**
 * 3.0.0 (A2 §4.5): the composer never focuses itself when a chat opens.
 * Only an explicit "Yanıtla" (Reply) focuses it, and that must happen inside
 * the user's tap so iOS opens the keyboard. MessageList calls
 * focusComposerForReply() synchronously from the reply gesture.
 */
let current = null;

export function registerComposerInput(el) {
  current = el || null;
  return () => {
    if (current === el) current = null;
  };
}

export function getComposerInput() {
  return current && current.isConnected !== false ? current : null;
}

/** Focus the composer and put the caret at the end. Returns true on success. */
export function focusComposerForReply() {
  const el = getComposerInput();
  if (!el || typeof el.focus !== "function") return false;
  try {
    el.focus({ preventScroll: true });
  } catch {
    try { el.focus(); } catch { return false; }
  }
  try {
    const end = String(el.value || "").length;
    el.setSelectionRange?.(end, end);
  } catch { /* ignore */ }
  return true;
}
