/**
 * Clipboard history (Descall+). Privacy first: only what the user copies inside Descall
 * (a "copy" event in this window) or pastes into Descall is kept. The system clipboard is
 * never read or watched. Local only, capped, clearable. Text only, 4 KB per item.
 */
import { readLocal, writeLocal } from "./bridge.js";

export const MAX_ITEMS = 50;
export const MAX_CHARS = 4000;
const NAME = "clipboard";
const EMPTY = [];

export function clipboardItems() {
  return readLocal(NAME, EMPTY);
}

/** Pure: add a text to the list (newest first, de-duplicated, capped). */
export function addItem(list, text, source, now = Date.now()) {
  const v = String(text || "").replace(/\u0000/g, "").trim();
  if (!v) return list;
  const clipped = v.slice(0, MAX_CHARS);
  const rest = (list || []).filter((i) => i.text !== clipped);
  return [{ text: clipped, source: source === "paste" ? "paste" : "copy", at: now }, ...rest].slice(0, MAX_ITEMS);
}

export function recordClip(text, source) {
  writeLocal(NAME, addItem(clipboardItems(), text, source));
}

export function clearClipboardHistory() {
  writeLocal(NAME, []);
}

export function removeClipboardItem(at) {
  writeLocal(NAME, clipboardItems().filter((i) => i.at !== at));
}

/** Listen to copy / paste inside this document only. Returns a detach function. */
export function captureClipboard(doc = document) {
  const onCopy = () => {
    try {
      const sel = doc.getSelection ? String(doc.getSelection() || "") : "";
      const active = doc.activeElement;
      let text = sel;
      if (!text && active && typeof active.value === "string" && active.selectionStart != null) {
        text = active.value.slice(active.selectionStart, active.selectionEnd);
      }
      if (text && !(active && active.type === "password")) recordClip(text, "copy");
    } catch { /* ignore */ }
  };
  const onPaste = (e) => {
    try {
      const active = doc.activeElement;
      if (active && active.type === "password") return;
      const text = e.clipboardData?.getData?.("text/plain");
      if (text) recordClip(text, "paste");
    } catch { /* ignore */ }
  };
  doc.addEventListener("copy", onCopy, true);
  doc.addEventListener("cut", onCopy, true);
  doc.addEventListener("paste", onPaste, true);
  return () => {
    doc.removeEventListener("copy", onCopy, true);
    doc.removeEventListener("cut", onCopy, true);
    doc.removeEventListener("paste", onPaste, true);
  };
}
