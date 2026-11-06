/**
 * Messaging keyboard shortcuts (messaging phase 4). Ctrl+/ (⌘/ on a Mac)
 * opens a help sheet that lists these and the ones that already existed.
 *
 * New shortcuts were picked so they clash with nothing: not with the app's
 * own (RESERVED below: zoom / text size, mute / deafen, push to talk, the
 * Descall+ gaming HUD, slash menu categories, Electron dev tools / full
 * screen), and not with browser keys a page cannot take over (Ctrl+T/W/N,
 * Alt+←/→ history, Ctrl+F find, Ctrl+Shift+N/T, ...). The selftest checks it.
 */

/** Combos the app already uses. mod = Ctrl on Windows/Linux, ⌘ on a Mac. */
export const RESERVED = Object.freeze([
  { mod: true, key: "0" }, { mod: true, key: "=" }, { mod: true, key: "+" }, { mod: true, key: "-" }, // zoom / text size
  { mod: true, shift: true, key: "m" }, // mute (and push to talk default)
  { mod: true, shift: true, key: "d" }, // deafen
  { mod: true, shift: true, key: " " }, // push to talk
  { alt: true, shift: true, key: "m" }, // push to talk
  { mod: true, shift: true, key: "g" }, // Descall+ gaming HUD
  { mod: true, key: "1" }, { mod: true, key: "2" }, { mod: true, key: "3" }, { mod: true, key: "4" }, { mod: true, key: "5" }, // slash menu categories
  { mod: true, shift: true, key: "i" }, { key: "F12" }, { key: "F11" }, // Electron dev tools / full screen
]);

/** Browser / OS keys a web page should never claim. */
export const BROWSER_KEYS = Object.freeze([
  { mod: true, key: "t" }, { mod: true, key: "w" }, { mod: true, key: "n" }, { mod: true, key: "r" }, { mod: true, key: "l" },
  { mod: true, key: "f" }, { mod: true, key: "p" }, { mod: true, key: "s" }, { mod: true, key: "e" }, { mod: true, key: "k" },
  { mod: true, shift: true, key: "n" }, { mod: true, shift: true, key: "t" }, { mod: true, shift: true, key: "s" }, { mod: true, shift: true, key: "u" },
  { alt: true, key: "ArrowLeft" }, { alt: true, key: "ArrowRight" }, { mod: true, key: "Tab" },
]);

/** The new messaging shortcuts. */
export const SHORTCUTS = Object.freeze([
  { id: "help", mod: true, key: "/", group: "general", label: "msg4.keys.help" },
  { id: "search", mod: true, shift: true, key: "f", group: "general", label: "msg4.keys.search" },
  { id: "prevChat", alt: true, key: "ArrowUp", group: "chats", label: "msg4.keys.prevChat", inComposer: true },
  { id: "nextChat", alt: true, key: "ArrowDown", group: "chats", label: "msg4.keys.nextChat", inComposer: true },
  { id: "prevUnread", alt: true, shift: true, key: "ArrowUp", group: "chats", label: "msg4.keys.prevUnread", inComposer: true },
  { id: "nextUnread", alt: true, shift: true, key: "ArrowDown", group: "chats", label: "msg4.keys.nextUnread", inComposer: true },
  { id: "jumpUnread", shift: true, key: "PageUp", group: "chats", label: "msg4.keys.jumpUnread" },
]);

/** Rows the help sheet lists that already existed (handled elsewhere). */
export const EXISTING = Object.freeze([
  { group: "composer", keys: [{ key: "Enter" }], label: "msg4.keys.send" },
  { group: "composer", keys: [{ shift: true, key: "Enter" }], label: "msg4.keys.newline" },
  { group: "composer", keys: [{ key: "Tab" }], label: "msg4.keys.complete" },
  { group: "composer", keys: [{ key: "Escape" }], label: "msg4.keys.cancel" },
  { group: "voice", keys: [{ mod: true, shift: true, key: "m" }], label: "msg4.keys.mute" },
  { group: "voice", keys: [{ mod: true, shift: true, key: "d" }], label: "msg4.keys.deafen" },
  { group: "app", keys: [{ mod: true, key: "+" }, { mod: true, key: "-" }], label: "msg4.keys.zoom" },
  { group: "app", keys: [{ mod: true, key: "0" }], label: "msg4.keys.zoomReset" },
]);

export const SHORTCUT_GROUPS = Object.freeze(["general", "chats", "composer", "voice", "app"]);

const norm = (k) => {
  const s = String(k || "");
  return s.length === 1 ? s.toLowerCase() : s;
};

/** Same combo (modifiers + key). */
export function sameCombo(a, b) {
  return Boolean(a.mod) === Boolean(b.mod)
    && Boolean(a.shift) === Boolean(b.shift)
    && Boolean(a.alt) === Boolean(b.alt)
    && norm(a.key) === norm(b.key);
}

/** The key of a KeyboardEvent, layout safe for letters, "/" and arrows. */
function eventKey(e) {
  const code = String(e.code || "");
  if (/^Key[A-Z]$/.test(code)) return code.slice(3).toLowerCase();
  if (code === "Slash") return "/";
  if (code === "NumpadDivide") return "/";
  return norm(e.key);
}

/** The shortcut id a keydown means, or null. */
export function matchShortcut(e) {
  if (!e || e.isComposing) return null;
  const pressed = { mod: Boolean(e.ctrlKey || e.metaKey), shift: Boolean(e.shiftKey), alt: Boolean(e.altKey), key: eventKey(e) };
  // "/" is Shift+7 on Turkish/German layouts: Ctrl+/ must still match there.
  const hit = SHORTCUTS.find((s) => sameCombo(s, pressed) || (s.key === "/" && pressed.key === "/" && pressed.mod && !pressed.alt));
  return hit ? hit.id : null;
}

/** Text field the user is typing in (shortcuts that use plain keys stay out of it). */
export function typingTarget(el) {
  if (!el || typeof el !== "object") return null;
  const tag = String(el.tagName || "").toUpperCase();
  if (tag === "TEXTAREA" || el.isContentEditable) return el;
  if (tag === "INPUT") {
    const type = String(el.type || "text").toLowerCase();
    return ["text", "search", "email", "url", "password", "tel", "number"].includes(type) ? el : null;
  }
  return null;
}

/** Whether the shortcut may run with focus on `target`. */
export function allowedIn(id, target) {
  const field = typingTarget(target);
  if (!field) return true;
  const s = SHORTCUTS.find((x) => x.id === id);
  if (!s) return false;
  if (s.mod) return true; // Ctrl/⌘ combos never type text
  const inComposer = typeof field.closest === "function" && Boolean(field.closest(".composer-container"));
  if (s.inComposer && inComposer) return true;
  // Shift+PageUp in an empty composer only (otherwise it selects text).
  if (id === "jumpUnread" && inComposer && !String(field.value || "").trim()) return true;
  return false;
}

export function isMacPlatform(nav = typeof navigator !== "undefined" ? navigator : null) {
  const p = String(nav?.userAgentData?.platform || nav?.platform || nav?.userAgent || "");
  return /mac|iphone|ipad|ipod/i.test(p);
}

const KEY_LABELS = { ArrowUp: "↑", ArrowDown: "↓", ArrowLeft: "←", ArrowRight: "→", " ": "Space", Escape: "Esc", PageUp: "Page Up", Enter: "Enter", Tab: "Tab" };

/** Key caps for one combo, e.g. ["Ctrl", "Shift", "F"] or ["⌘", "⇧", "F"]. */
export function keyCaps(combo, mac = isMacPlatform()) {
  const out = [];
  if (combo.mod) out.push(mac ? "⌘" : "Ctrl");
  if (combo.alt) out.push(mac ? "⌥" : "Alt");
  if (combo.shift) out.push(mac ? "⇧" : "Shift");
  const k = combo.key;
  out.push(KEY_LABELS[k] || (String(k).length === 1 ? String(k).toUpperCase() : String(k)));
  return out;
}

/** Help sheet rows per group. */
export function shortcutSections() {
  const rows = [
    ...SHORTCUTS.map((s) => ({ group: s.group, keys: [s], label: s.label, id: s.id })),
    ...EXISTING.map((r, i) => ({ ...r, id: `existing-${i}` })),
  ];
  return SHORTCUT_GROUPS.map((g) => ({ group: g, rows: rows.filter((r) => r.group === g) })).filter((s) => s.rows.length);
}

/**
 * Next / previous conversation row in the visible chat list (DOM order),
 * optionally only rows with unread messages. Returns the element or null.
 */
export function stepConversation(rows, activeIndex, dir, { unreadOnly = false, isUnread = () => false } = {}) {
  const list = Array.from(rows || []);
  if (!list.length) return null;
  const n = list.length;
  const start = activeIndex >= 0 ? activeIndex : dir > 0 ? -1 : n;
  for (let i = 1; i <= n; i += 1) {
    const idx = start + dir * i;
    if (idx < 0 || idx >= n) {
      if (!unreadOnly) return null; // the plain step stops at the ends
      continue;
    }
    const el = list[idx];
    if (!unreadOnly || isUnread(el)) return el;
  }
  return null;
}

export const OPEN_SHORTCUTS_EVENT = "descall:shortcuts-help";
