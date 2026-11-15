/**
 * Canlı popup on the member side (admin remake, Nov 2026).
 *  - receipts: delivered (arrived), seen (on screen while the app is visible),
 *    clicked (button), acked ("Tamam"), dismissed (closed, timed out). Only for
 *    popups the server tracks (`track: true`), at most once per kind per popup;
 *  - `admin:popup:recall`: an admin took the popup back. It leaves the queue;
 *    with a correction note a short info popup takes its place;
 *  - `admin:popup:close`: acknowledged or closed on another of my devices.
 */

// Per delivered popup object: a resent popup arrives as a new object and reports again.
let sent = new WeakMap();

function currentLang() {
  try {
    const saved = window.localStorage?.getItem("descall_language");
    if (saved) return saved;
  } catch {
    /* storage blocked */
  }
  try {
    return document.documentElement.lang || navigator.language || "";
  } catch {
    return "";
  }
}

/** Emit one receipt (once per kind for each delivery). Returns whether it was sent. */
export function sendPopupReceipt(socket, popup, kind) {
  if (!socket || typeof socket.emit !== "function" || !popup?.track || !popup?.id || typeof popup !== "object") return false;
  const kinds = sent.get(popup) || new Set();
  if (kinds.has(kind)) return false;
  kinds.add(kind);
  sent.set(popup, kinds);
  try {
    socket.emit("popup:receipt", { id: popup.id, kind, lang: currentLang() });
  } catch {
    return false;
  }
  return true;
}

/**
 * Queue after a recall. `makeNote(payload)` builds the correction popup (localized by the caller).
 */
export function applyPopupRecall(queue, payload, makeNote) {
  const id = payload?.id;
  if (!id) return queue;
  const had = queue.some((row) => row.id === id);
  const next = queue.filter((row) => row.id !== id);
  if (had && payload.mode === "note" && payload.note && typeof makeNote === "function") {
    const note = makeNote(payload);
    if (note && !next.some((row) => row.id === note.id)) next.unshift(note);
  }
  return next.length === queue.length && !had ? queue : next;
}

export function applyPopupClose(queue, payload) {
  const id = payload?.id;
  if (!id || !queue.some((row) => row.id === id)) return queue;
  return queue.filter((row) => row.id !== id);
}

/** Test hook. */
export function __resetPopupReceipts() {
  sent = new WeakMap();
}
