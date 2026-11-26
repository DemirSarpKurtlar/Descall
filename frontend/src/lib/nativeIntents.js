/**
 * 4.2: Siri / Shortcuts / Spotlight (iOS), launcher shortcuts (Android) and the Windows
 * jump list, the web app's side. One module, three shells:
 *
 *   iOS     DescallIntents plugin (ios/App/App/DescallIntentsPlugin.swift): the signed-in
 *           profile for DescallKit's shared session (the token itself is mirrored natively
 *           by DescallKeychainPlugin), the live call state, and the actions an App Intent
 *           hands to the running app (mute / deafen / leave / join voice).
 *   Android DescallShortcuts plugin (android/.../DescallShortcutsPlugin.java): recent DMs as
 *           dynamic launcher shortcuts, "add to home screen", and the static shortcut actions.
 *   Windows electronAPI.setJumpList (electron/jumpList.cjs): "Yeni mesaj", status and recent DMs.
 *
 * Pure helpers are exported for nativeIntents.selftest.mjs; the React glue is
 * hooks/useNativeIntents.js. Web and older shells: every call is a no-op.
 */

export const INTENT_STATUSES = Object.freeze(["online", "idle", "dnd", "invisible"]);
export const INTENT_ACTIONS = Object.freeze([
  "toggleMute",
  "toggleDeafen",
  "leave",
  "joinVoice",
  "setStatus",
  "toggleDnd",
  "newMessage",
  "openFriends",
  "openPath",
  // Widgets draft B: "Kaan'i ara" (a favourite's Siri / Spotlight shortcut) starts a DM call.
  "callFriend",
]);
export const MAX_RECENT_SHORTCUTS = 4;
export const PLUGIN_TIMEOUT_MS = 2500;

const ID_RE = /^[0-9A-Za-z-]{1,64}$/;
const USERNAME_RE = /^[\p{L}\p{N}_.-]{1,64}$/u;

function str(v, max = 80) {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

/** "ios" | "android" | "" for the Capacitor shell this page runs in. */
export function nativePlatform(win = typeof window !== "undefined" ? window : null) {
  try {
    const cap = win?.Capacitor;
    if (!cap?.isNativePlatform?.()) return "";
    const p = cap.getPlatform?.();
    return p === "ios" || p === "android" ? p : "";
  } catch {
    return "";
  }
}

/** Only https avatars leave the page (native code downloads them). */
export function safeAvatarUrl(url) {
  return typeof url === "string" && /^https:\/\/[^\s]{1,490}$/.test(url) ? url : "";
}

/**
 * What the shared session needs from the signed-in user, or null when there is none.
 * The token is never part of it.
 */
export function profilePayload(me, { apiBase = "", locale = "" } = {}) {
  const userId = str(me?.id, 64);
  if (!userId || !ID_RE.test(userId)) return null;
  return {
    userId,
    username: str(me.username, 64),
    displayName: str(me.displayName || me.display_name || "", 80),
    avatarUrl: safeAvatarUrl(me.avatarUrl || me.avatar_url || ""),
    apiBase: str(apiBase, 200),
    locale: str(locale, 16),
  };
}

/**
 * Sign-in / profile change / sign-out from the last synced payload to the next one.
 * "sync" when there is something new to send, "clear" on sign-out, null otherwise.
 */
export function sessionSyncPlan(prev, next) {
  if (!next) return prev ? "clear" : null;
  if (!prev) return "sync";
  return JSON.stringify(prev) === JSON.stringify(next) ? null : "sync";
}

/**
 * The active voice session (DM call, group call or voice channel), same precedence as
 * the desktop overlay (hooks/useElectronOverlay.js).
 */
export function callStatePayload({ call, groupCall, serverVoice } = {}) {
  const dm = call?.mode === "active" || call?.mode === "outgoing";
  const group = Boolean(groupCall?.isInCall);
  const server = Boolean(serverVoice?.isInVoice);
  if (!dm && !group && !server) return { active: false };
  if (dm) {
    const peer = call?.peer || {};
    return {
      active: true,
      kind: "dm",
      title: str(peer.displayName || peer.display_name || peer.username || "", 80),
      muted: Boolean(call?.muted),
      deafened: Boolean(call?.deafened),
    };
  }
  if (group) {
    return {
      active: true,
      kind: "group",
      title: str(groupCall?.groupName || groupCall?.activeGroup?.name || "", 80),
      muted: Boolean(groupCall?.isMuted),
      deafened: Boolean(groupCall?.deafened),
    };
  }
  return {
    active: true,
    kind: "server",
    title: str(serverVoice?.channelName || "", 80),
    muted: Boolean(serverVoice?.muted),
    deafened: Boolean(serverVoice?.deafened),
  };
}

/** An action from a shell, validated, or null. */
export function parseIntentAction(raw) {
  if (!raw || typeof raw !== "object") return null;
  const type = typeof raw.type === "string" ? raw.type : "";
  if (!INTENT_ACTIONS.includes(type)) return null;
  const id = typeof raw.id === "string" ? raw.id.slice(0, 64) : "";
  const p = raw.payload && typeof raw.payload === "object" ? raw.payload : {};
  if (type === "joinVoice") {
    const serverId = str(p.serverId, 64);
    const channelId = str(p.channelId, 64);
    if (!ID_RE.test(serverId) || !ID_RE.test(channelId)) return null;
    return { id, type, payload: { serverId, channelId, channelName: str(p.channelName, 80), type: p.type === "stage" ? "stage" : "voice" } };
  }
  if (type === "setStatus") {
    return INTENT_STATUSES.includes(p.status) ? { id, type, payload: { status: p.status } } : null;
  }
  if (type === "callFriend") {
    const userId = str(p.userId, 64);
    const username = str(p.username, 64);
    if (!ID_RE.test(userId) || (username && !USERNAME_RE.test(username))) return null;
    return { id, type, payload: { userId, username, video: p.video === true } };
  }
  if (type === "openPath") {
    const path = str(p.path, 200);
    // In-app paths only (the deep link router made them): never a URL.
    return /^\/(direct|groups|servers|friends|calls|activity|settings)(\/[\p{L}\p{N}_.%-]{1,80}){0,2}$/u.test(path)
      ? { id, type, payload: { path } }
      : null;
  }
  return { id, type, payload: {} };
}

/**
 * Run a validated action with the app's own handlers. Resolves { ok, error?, state? }
 * (error codes the Swift side maps to spoken answers: no_call, no_permission, mic_denied,
 * not_ready, failed).
 */
export async function runIntentAction(action, ctx = {}) {
  const a = parseIntentAction(action);
  if (!a) return { ok: false, error: "bad_action" };
  const callState = () => callStatePayload(ctx.getVoice?.() || {});
  try {
    switch (a.type) {
      case "toggleMute":
      case "toggleDeafen":
      case "leave": {
        const voice = ctx.getVoice?.() || {};
        const before = callStatePayload(voice);
        if (!before.active) return { ok: false, error: "no_call" };
        const done = await ctx.callAction?.(a.type, voice);
        if (done === false) return { ok: false, error: "failed" };
        if (a.type === "leave") return { ok: true, state: { active: false } };
        // The hooks update their state on the next render: report the expected value.
        const key = a.type === "toggleMute" ? "muted" : "deafened";
        return { ok: true, state: { ...before, [key]: !before[key] } };
      }
      case "joinVoice": {
        if (!ctx.joinVoice) return { ok: false, error: "not_ready" };
        const res = await ctx.joinVoice(a.payload);
        if (res && res.ok === false) return { ok: false, error: res.error || "failed" };
        return { ok: true, state: callState() };
      }
      case "setStatus":
        ctx.setStatus?.(a.payload.status);
        return { ok: true, state: { status: a.payload.status } };
      case "toggleDnd": {
        const next = ctx.getStatus?.() === "dnd" ? "online" : "dnd";
        ctx.setStatus?.(next);
        return { ok: true, state: { status: next } };
      }
      case "newMessage":
        ctx.navigate?.("/direct");
        ctx.onNewMessage?.();
        return { ok: true };
      case "callFriend": {
        if (!ctx.callFriend) return { ok: false, error: "not_ready" };
        if (callStatePayload(ctx.getVoice?.() || {}).active) return { ok: false, error: "busy" };
        const res = await ctx.callFriend(a.payload);
        if (res && res.ok === false) return { ok: false, error: res.error || "failed" };
        return { ok: true };
      }
      case "openFriends":
        ctx.navigate?.("/friends");
        return { ok: true };
      case "openPath":
        ctx.navigate?.(a.payload.path);
        return { ok: true };
      default:
        return { ok: false, error: "bad_action" };
    }
  } catch (err) {
    const msg = String(err?.name || err?.message || "");
    if (/NotAllowed|Permission/i.test(msg)) return { ok: false, error: "mic_denied" };
    return { ok: false, error: "failed" };
  }
}

/**
 * Recent DMs for launcher shortcuts / the jump list: friends with a conversation, newest
 * first, at most `max`. Each { id, username, name, avatarUrl, path }.
 */
export function recentConversations(friends = [], lastActivity = {}, { max = MAX_RECENT_SHORTCUTS, blocked = null } = {}) {
  const at = (id) => {
    const t = Date.parse(lastActivity?.[id] || "");
    return Number.isFinite(t) ? t : 0;
  };
  return (Array.isArray(friends) ? friends : [])
    .filter((f) => f?.id && ID_RE.test(String(f.id)) && USERNAME_RE.test(String(f.username || "")) && at(f.id) > 0)
    .filter((f) => !blocked || !blocked(f.id))
    .sort((a, b) => at(b.id) - at(a.id))
    .slice(0, Math.max(0, max))
    .map((f) => ({
      id: String(f.id),
      username: String(f.username),
      name: str(f.displayName || f.display_name || f.username, 60) || String(f.username),
      avatarUrl: safeAvatarUrl(f.avatarUrl || f.avatar_url || ""),
      path: `/direct/${encodeURIComponent(String(f.username))}`,
    }));
}

// ---- recent DMs store (Settings > Voice shortcuts reads it) ------------------------------

let recentItems = [];
const recentListeners = new Set();

export function publishRecentShortcuts(items) {
  const next = Array.isArray(items) ? items : [];
  if (JSON.stringify(next) === JSON.stringify(recentItems)) return;
  recentItems = next;
  for (const fn of [...recentListeners]) {
    try {
      fn();
    } catch {
      /* a listener's own problem */
    }
  }
}

export function getRecentShortcuts() {
  return recentItems;
}

export function subscribeRecentShortcuts(fn) {
  recentListeners.add(fn);
  return () => recentListeners.delete(fn);
}

// ---- plugin plumbing ---------------------------------------------------------------------

let importCore = () => import("@capacitor/core");
const boxes = new Map();

/** `{ plugin }` (never the proxy itself: a Capacitor proxy answers `then`, see storage.js). */
function pluginBox(name) {
  if (!boxes.has(name)) {
    boxes.set(
      name,
      Promise.resolve()
        .then(() => importCore())
        .then(({ registerPlugin }) => ({ plugin: registerPlugin(name) }))
        .catch(() => {
          boxes.delete(name);
          return { plugin: null };
        })
    );
  }
  return boxes.get(name);
}

function withTimeout(promise, ms = PLUGIN_TIMEOUT_MS) {
  let timer = null;
  return Promise.race([
    Promise.resolve(promise).finally(() => clearTimeout(timer)),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error("plugin-timeout")), ms);
    }),
  ]);
}

const PLUGIN_FOR = { ios: "DescallIntents", android: "DescallShortcuts" };

async function call(method, args = {}, { platform = nativePlatform() } = {}) {
  const name = PLUGIN_FOR[platform];
  if (!name) return null;
  const { plugin } = await pluginBox(name);
  if (!plugin || typeof plugin[method] !== "function") return null;
  try {
    return await withTimeout(plugin[method](args));
  } catch {
    return null; // older native build without the method, or the shell is busy
  }
}

/** iOS: profile for the shared session. Android: nothing to sync but a sign-out clear. */
export async function syncNativeSession(payload) {
  if (nativePlatform() !== "ios" || !payload) return null;
  return call("syncSession", payload);
}

/** Sign-out: iOS clears the shared session and Siri donations, Android its shortcuts. */
export async function clearNativeSession() {
  const p = nativePlatform();
  if (p === "ios") return call("clearSession");
  if (p === "android") return call("clear");
  return null;
}

export async function reportNativeCallState(state) {
  if (nativePlatform() !== "ios") return null;
  return call("reportCallState", state || { active: false });
}

/** Something the user just did, so Siri can suggest it (iOS 17+). */
export async function donateIntent(kind, data = {}) {
  if (nativePlatform() !== "ios") return null;
  return call("donate", { ...data, kind });
}

export async function getVoiceShortcutsAvailability() {
  const p = nativePlatform();
  if (p === "ios") return { platform: p, ...((await call("getAvailability")) || {}) };
  if (p === "android") return { platform: p, ...((await call("getAvailability")) || {}) };
  return { platform: "" };
}

export async function presentSiriShortcuts() {
  return nativePlatform() === "ios" ? call("presentShortcuts") : null;
}

export async function setRecentShortcuts(items, labels = {}) {
  if (nativePlatform() !== "android") return null;
  return call("setRecentConversations", { items, labels });
}

/** Android "Ana ekrana ekle" for one DM. Resolves { requested, supported } or null. */
export async function pinConversationShortcut(item, { openChat = "" } = {}) {
  if (nativePlatform() !== "android" || !item?.id) return null;
  return call("pinConversation", { id: item.id, username: item.username, name: item.name, avatarUrl: item.avatarUrl || "", openChat });
}

/**
 * Listen for actions from the shell and run them; also takes the ones queued before the
 * page was ready (cold start from Siri / a launcher shortcut). Returns stop().
 */
export function startNativeIntents(ctxRef, { platform = nativePlatform() } = {}) {
  const name = PLUGIN_FOR[platform];
  if (!name) return () => {};
  let stopped = false;
  let handle = null;
  const seen = new Set();

  const handle1 = async (raw) => {
    const id = typeof raw?.id === "string" ? raw.id : "";
    if (id) {
      if (seen.has(id)) return;
      seen.add(id);
      if (seen.size > 50) seen.delete(seen.values().next().value);
    }
    const out = await runIntentAction(raw, ctxRef.current || {});
    if (!id) return;
    const { plugin } = await pluginBox(name);
    try {
      await plugin?.completeAction?.({ id, ok: Boolean(out.ok), error: out.error || "", state: out.state || {} });
    } catch {
      /* the intent already timed out */
    }
  };

  const drain = async () => {
    const res = await call("takePendingActions", {}, { platform });
    for (const a of Array.isArray(res?.actions) ? res.actions : []) {
      if (stopped) return;
      await handle1(a);
    }
  };

  pluginBox(name)
    .then(({ plugin }) => plugin?.addListener?.("action", (a) => handle1(a)))
    .then((h) => {
      if (stopped) h?.remove?.();
      else handle = h;
      if (!stopped) drain();
    })
    .catch(() => {});

  return () => {
    stopped = true;
    try {
      handle?.remove?.();
    } catch {
      /* ignore */
    }
  };
}

/** Selftests only. */
export const __nativeIntentsForTests = {
  setCoreImporter(fn) {
    importCore = fn;
    boxes.clear();
  },
  reset() {
    importCore = () => import("@capacitor/core");
    boxes.clear();
  },
};
