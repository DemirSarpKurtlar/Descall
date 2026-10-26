import { Capacitor, registerPlugin } from "@capacitor/core";

/**
 * 3.0.0 (A4, native glass #07): on iOS the "friend came online" toast is a
 * native Liquid Glass capsule under the Dynamic Island (DescallToastPlugin.swift)
 * instead of the small web card in the corner. Double tap or "Mesaj" opens the
 * DM through the same path as a notification tap. Older app builds without the
 * plugin, and every other platform, keep the web toast.
 */

const IS_IOS = typeof window !== "undefined" && Capacitor.isNativePlatform() && Capacitor.getPlatform() === "ios";
const OPEN_ACTIONS = new Set(["double", "message"]);
const DONE_ACTIONS = new Set(["double", "message", "dismiss", "timeout"]);

const COPY = {
  tr: { online: (n) => `${n} çevrimiçi`, sub: "Az önce bağlandı", action: "Mesaj" },
  en: { online: (n) => `${n} is online`, sub: "Just connected", action: "Message" },
};

/** Pure: the plugin arguments for a presence capsule (unit-tested). */
export function presenceCapsuleArgs({ name, user, locale = "tr", id }) {
  const copy = COPY[locale] || COPY.tr;
  const display = String(name || user?.displayName || user?.username || "").trim();
  if (!display) return null;
  const userId = user?.id != null ? String(user.id) : "";
  const avatar = [user?.avatarUrl, user?.avatar_url, user?.avatar].find((u) => typeof u === "string" && /^https:\/\//i.test(u)) || "";
  return {
    id: id || `presence-${userId || display}-${Date.now()}`,
    title: copy.online(display),
    sub: copy.sub,
    name: display,
    seed: userId || display,
    avatar,
    online: true,
    action: userId ? copy.action : "",
    duration: 3000,
  };
}

/** Pure: what a capsule event means for the web (unit-tested). */
export function capsuleOutcome(action, { userId, name }) {
  if (OPEN_ACTIONS.has(action) && userId) {
    return { open: { type: "dm", conversationId: userId, fromId: userId, from: name || "" }, done: true };
  }
  return { open: null, done: DONE_ACTIONS.has(action) };
}

let plugin = null;
let listening = false;
const handlers = new Map();

function nativePlugin() {
  if (!IS_IOS) return null;
  if (!plugin) plugin = registerPlugin("DescallToast");
  return plugin;
}

function ensureListener(p) {
  if (listening) return;
  listening = true;
  Promise.resolve()
    .then(() => p.addListener("capsule", (event) => {
      const handler = handlers.get(event?.id);
      if (handler) handler(String(event?.action || ""));
    }))
    .catch(() => { listening = false; });
}

function openChat(detail) {
  try {
    window.dispatchEvent(new CustomEvent("descall:notification-click", { detail }));
  } catch {
    /* ignore */
  }
}

export function nativeToastSupported() {
  return IS_IOS;
}

/**
 * Show the presence capsule natively. Resolves true when the native capsule is
 * on screen, false when the caller should fall back to the web toast.
 */
export async function showPresenceCapsule({ name, user, locale }) {
  const p = nativePlugin();
  if (!p) return false;
  const args = presenceCapsuleArgs({ name, user, locale });
  if (!args) return false;
  ensureListener(p);
  const userId = user?.id != null ? String(user.id) : "";
  const timer = setTimeout(() => handlers.delete(args.id), 30_000);
  handlers.set(args.id, (action) => {
    const { open, done } = capsuleOutcome(action, { userId, name: args.name });
    if (open) openChat(open);
    if (done) {
      clearTimeout(timer);
      handlers.delete(args.id);
    }
  });
  try {
    await p.show(args);
    return true;
  } catch {
    clearTimeout(timer);
    handlers.delete(args.id);
    return false;
  }
}
