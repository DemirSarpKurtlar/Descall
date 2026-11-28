/**
 * Desktop tray panel (owner pick, draft B "Gelismis menu"), the page's side.
 *
 * The desktop shells (Electron main.cjs, Tauri tray_menu.rs) draw the panel; the page only
 * says what it shows and runs what the user picks there, with the app's own code:
 *   - state:   electronAPI.setTrayState(compact object), debounced, whenever it changes;
 *   - actions: electronAPI.onTrayAction({ action, arg }) -> the registered handler.
 * Parts come from where the data already lives: App.jsx (profile, status, badges,
 * navigation), UserVoicePanel (mic / deafen, with or without a call), the Descall+ gaming
 * host (instant clip). Web and mobile builds have no electronAPI.setTrayState: no-op.
 * No React import here; hooks/useDesktopTray.js is the React glue.
 */

export const TRAY_STATUSES = Object.freeze(["online", "idle", "dnd", "invisible"]);
export const TRAY_APP_ACTIONS = Object.freeze(["status", "mute", "deafen", "clip", "openDms", "openRequests", "openSettings"]);
export const TRAY_PUSH_DELAY_MS = 150;

const KEY_NAMES = { CommandOrControl: "Ctrl", CmdOrCtrl: "Ctrl", Control: "Ctrl", Command: "Cmd", Cmd: "Cmd", Super: "Win", Meta: "Win", Option: "Alt", Up: "↑", Down: "↓", Left: "←", Right: "→", Space: "Space" };

/** "CommandOrControl+Alt+M" (Electron / Descall+ accelerator) -> "Ctrl+Alt+M". */
export function acceleratorLabel(accel, { mac = false } = {}) {
  const parts = String(accel || "").split("+").map((p) => p.trim()).filter(Boolean);
  if (!parts.length || parts.length > 5) return "";
  return parts
    .map((p) => {
      if (mac && (p === "CommandOrControl" || p === "CmdOrCtrl")) return "Cmd";
      if (/^Mouse[345]$/i.test(p)) return `Mouse ${p.slice(5)}`;
      return KEY_NAMES[p] || (p.length === 1 ? p.toUpperCase() : p);
    })
    .join("+");
}

const num = (v) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/**
 * The compact object the shells expect (they normalise it again, see
 * electron/trayMenuModel.cjs normalizeAppState). voice wins over call when the
 * bottom-left panel published it (it also knows the idle mic / deafen choice).
 */
export function buildTrayState({ app = {}, voice = null, call = null, clip = null, hints = {}, look = {} } = {}) {
  const v = voice || { inCall: Boolean(call?.active), micMuted: Boolean(call?.muted), deafened: Boolean(call?.deafened) };
  return {
    signedIn: Boolean(app.signedIn),
    name: String(app.name || ""),
    avatarUrl: String(app.avatarUrl || ""),
    status: TRAY_STATUSES.includes(app.status) ? app.status : "online",
    statusUntil: 0, // the app has no timed status yet
    statusText: String(app.statusText || ""),
    unreadMessages: num(app.unreadMessages),
    friendRequests: num(app.friendRequests),
    badgeCount: num(app.badgeCount), // taskbar / dock badge, 0 = none (lib/taskbarBadgePref.js)
    micMuted: Boolean(v.micMuted),
    deafened: Boolean(v.deafened),
    inCall: Boolean(v.inCall),
    clipAvailable: Boolean(clip?.available),
    notificationsMutedUntil: 0, // the shell owns the snooze
    hints: {
      open: "",
      mute: String(hints.mute || ""),
      deafen: String(hints.deafen || ""),
      clip: clip?.available ? String(clip?.hotkey || "") : "",
    },
    theme: look.theme === "light" ? "light" : "dark",
    accent: String(look.accent || ""),
    locale: String(look.locale || ""),
  };
}

export function sameTrayState(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** { action, arg } the page accepts from the shell, else null. */
export function parseTrayAction(msg) {
  if (!msg || typeof msg !== "object") return null;
  const action = typeof msg.action === "string" ? msg.action : "";
  if (!TRAY_APP_ACTIONS.includes(action)) return null;
  if (action === "status") return TRAY_STATUSES.includes(msg.arg) ? { action, arg: msg.arg } : null;
  return { action, arg: null };
}

/** Theme of the document: light when the glass scheme or data-theme says so. */
export function readDocumentLook(doc = typeof document !== "undefined" ? document : null) {
  if (!doc?.documentElement) return { theme: "dark", accent: "", locale: "" };
  const root = doc.documentElement;
  let scheme = "";
  let accent = "";
  try {
    const cs = getComputedStyle(root);
    scheme = cs.getPropertyValue("--g-scheme").trim();
    const rgb = cs.getPropertyValue("--g-brand-rgb").trim();
    if (/^\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}$/.test(rgb)) accent = rgb.replace(/\s+/g, "");
  } catch {
    /* no layout yet */
  }
  const theme = scheme === "light" || (!scheme && root.getAttribute("data-theme") === "light") ? "light" : "dark";
  return { theme, accent, locale: String(root.lang || "") };
}

// ---- runtime (one per page) ------------------------------------------------------------

const parts = { app: {}, voice: null, call: null, clip: null, hints: {}, look: {} };
const handlers = new Map();
let api = null;
let timer = null;
let lastSent = null;

function schedule() {
  if (!api || timer) return;
  timer = setTimeout(flush, TRAY_PUSH_DELAY_MS);
}

function flush() {
  timer = null;
  if (!api) return;
  const next = buildTrayState(parts);
  if (lastSent && sameTrayState(next, lastSent)) return;
  lastSent = next;
  try { api.setTrayState(next); } catch { /* shell gone */ }
}

/** Update one part of the state ("app", "voice", "call", "clip", "hints", "look"). */
export function publishTray(part, value) {
  if (!Object.prototype.hasOwnProperty.call(parts, part)) return;
  parts[part] = value ?? (part === "voice" || part === "call" || part === "clip" ? null : {});
  schedule();
}

/**
 * Register what runs for an action; returns the unregister function. The latest
 * registration wins and the earlier one comes back when it unregisters. A fallback
 * ({ fallback: true }) only runs while no normal handler is registered (App.jsx keeps a
 * call-only mute fallback under the bottom-left panel's own toggle).
 */
export function setTrayHandler(action, fn, { fallback = false } = {}) {
  if (!TRAY_APP_ACTIONS.includes(action) || typeof fn !== "function") return () => {};
  const key = fallback ? `fallback:${action}` : action;
  const stack = handlers.get(key) || [];
  const entry = { fn };
  stack.push(entry);
  handlers.set(key, stack);
  return () => {
    const cur = handlers.get(key) || [];
    const i = cur.indexOf(entry);
    if (i >= 0) cur.splice(i, 1);
    if (!cur.length) handlers.delete(key);
  };
}

function handlerFor(action) {
  for (const key of [action, `fallback:${action}`]) {
    const stack = handlers.get(key);
    if (stack && stack.length) return stack[stack.length - 1].fn;
  }
  return null;
}

/** Run an action from the shell. True when a handler took it. */
export function runTrayAction(msg) {
  const a = parseTrayAction(msg);
  if (!a) return false;
  const fn = handlerFor(a.action);
  if (!fn) return false;
  try {
    fn(a.arg);
  } catch (err) {
    console.warn("[tray] action failed:", a.action, err);
  }
  return true;
}

/** Start pushing state and listening for actions. Returns stop(). No-op without the bridge. */
export function startDesktopTray(bridge = typeof window !== "undefined" ? window.electronAPI : null) {
  if (!bridge || typeof bridge.setTrayState !== "function") return () => {};
  api = bridge;
  lastSent = null;
  schedule();
  const off = typeof bridge.onTrayAction === "function" ? bridge.onTrayAction((msg) => runTrayAction(msg)) : null;
  return () => {
    if (typeof off === "function") off();
    if (timer) clearTimeout(timer);
    timer = null;
    if (api === bridge) api = null;
  };
}

/** Tests only. */
export function __resetDesktopTrayForTests() {
  parts.app = {};
  parts.voice = null;
  parts.call = null;
  parts.clip = null;
  parts.hints = {};
  parts.look = {};
  handlers.clear();
  if (timer) clearTimeout(timer);
  timer = null;
  api = null;
  lastSent = null;
}
