/**
 * Android home screen widgets and the ongoing call notification (draft B "Yuzler"), the
 * web app's side. The native side is android/app/src/main/java/com/descall/app/widget/
 * (JS plugin name DescallWidgets):
 *
 *   setSession / clearSession  the widgets' own encrypted session copy (sign-in / sign-out).
 *                              Android only: the token never leaves the device and native
 *                              code cannot read the WebView's localStorage.
 *   requestRefresh             the app saw a change (socket events): the native side fetches
 *                              /api/native/* at most every 20 s and only when a widget exists.
 *   setCallState               the running call for the call widget and the CallStyle
 *                              notification: room, server, who talks, people, mute, timer.
 *   "action" events            mute / sound / leave / open / join from a widget or the
 *                              notification, run by lib/nativeIntents.js (startNativeIntents).
 *
 * Pure helpers are exported for androidWidgets.selftest.mjs; the React glue is
 * hooks/useAndroidWidgets.js. iOS, desktop and web: every call is a no-op.
 */
import { nativePlatform, safeAvatarUrl } from "./nativeIntents.js";

export const WIDGETS_PLUGIN = "DescallWidgets";
export const PLUGIN_TIMEOUT_MS = 2500;
/** Socket events after which the widgets' data may have changed. */
export const REFRESH_EVENTS = Object.freeze([
  "presence:delta",
  "users:update",
  "friend:list",
  "friend:accepted",
  "friend:blocked",
  "dm:message",
  "dm:unread:sync",
  "group:message",
  "server:channel:message",
  "server:channel:notify",
  "server:voice:channel-state",
  "server:voice:states",
  "server:voice:member-joined",
  "friend:wave",
]);
/** Wait after the last event before asking (the native side has its own 20 s floor). */
export const REFRESH_DEBOUNCE_MS = 4000;
export const MAX_CALL_PEOPLE = 8;

const ID_RE = /^[0-9A-Za-z-]{1,64}$/;

function str(v, max = 80) {
  return typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

/** What the widgets need to call /api/native/* as this user, or null (signed out / bad data). */
export function widgetSessionPayload(me, token, apiBase = "") {
  const userId = str(me?.id, 64);
  const t = typeof token === "string" ? token.trim() : "";
  if (!userId || !ID_RE.test(userId) || !t || t.length > 4096 || /[\r\n]/.test(t)) return null;
  return { token: t, apiBase: str(apiBase, 200), userId };
}

/** "sync" | "clear" | null from the last sent session to the next one (only the key matters). */
export function widgetSessionPlan(prevKey, next) {
  const key = next ? `${next.userId}|${next.apiBase}|${next.token}` : "";
  if (!key) return { plan: prevKey ? "clear" : null, key: "" };
  return { plan: key === prevKey ? null : "sync", key };
}

/** A call participant for the native side: { id, name, avatarUrl } or null. */
export function personOf(raw, friendsById = null) {
  if (!raw || typeof raw !== "object") return null;
  const id = str(String(raw.id ?? raw.userId ?? raw.user_id ?? ""), 64);
  if (!ID_RE.test(id)) return null;
  const friend = friendsById?.get?.(id) || null;
  const name =
    str(raw.displayName || raw.display_name || "", 40) ||
    str(friend?.displayName || friend?.display_name || "", 40) ||
    str(raw.username && raw.username !== "Member" ? raw.username : "", 40) ||
    str(friend?.username || "", 40) ||
    str(raw.username || "", 40);
  const avatarUrl = safeAvatarUrl(raw.avatarUrl || raw.avatar_url || friend?.avatarUrl || friend?.avatar_url || "");
  return { id, name: name || "?", avatarUrl };
}

/**
 * The running call for the call widget and notification (same precedence as
 * nativeIntents.callStatePayload: DM call, then group call, then voice channel).
 *
 * @param {object} a
 * @param {object} a.call         useCall()
 * @param {object} a.groupCall    useGroupCall()
 * @param {object} a.serverVoice  useServerVoice()
 * @param {object} a.me           signed-in user
 * @param {Array}  a.friends      friend list (names / avatars for bare participants)
 * @param {Array}  a.servers      myServers (the voice channel's server name)
 * @param {Array}  a.speakers     active speaker ids (lib/activeSpeakers.js, voice channels)
 * @param {string} a.speakerScope channel the speaker list belongs to
 * @param {number} a.startedAt    when this call started on this device (ms)
 */
export function widgetCallPayload({ call, groupCall, serverVoice, me, friends = [], servers = [], speakers = [], speakerScope = null, startedAt = 0, groupName = "" } = {}) {
  const friendsById = new Map((Array.isArray(friends) ? friends : []).filter((f) => f?.id).map((f) => [String(f.id), f]));
  const mePerson = personOf(me, null);
  const others = (list) => {
    const out = [];
    for (const raw of Array.isArray(list) ? list : []) {
      const p = personOf(raw, friendsById);
      if (!p || (mePerson && p.id === mePerson.id) || out.some((o) => o.id === p.id)) continue;
      out.push(p);
      if (out.length >= MAX_CALL_PEOPLE) break;
    }
    return out;
  };
  const dm = call?.mode === "active" || call?.mode === "outgoing";
  const group = Boolean(groupCall?.isInCall);
  const server = Boolean(serverVoice?.isInVoice);
  if (!dm && !group && !server) return { active: false };
  const base = { active: true, me: mePerson, startedAt: Number(startedAt) > 0 ? Math.floor(startedAt) : 0 };
  if (dm) {
    const peer = personOf(call?.peer, friendsById);
    const durationStart = Number(call?.durationStartedAt) || 0;
    return {
      ...base,
      kind: "dm",
      title: peer?.name || "",
      subtitle: "",
      participants: peer ? [peer] : [],
      count: peer ? 2 : 1,
      speaker: null,
      muted: Boolean(call?.muted),
      deafened: Boolean(call?.deafened),
      connecting: call?.mode === "outgoing",
      startedAt: durationStart > 0 ? durationStart : base.startedAt,
    };
  }
  if (group) {
    const participants = others(groupCall?.participants);
    const durationStart = Number(groupCall?.durationStartedAt) || 0;
    return {
      ...base,
      kind: "group",
      title: str(groupName || groupCall?.groupName || groupCall?.activeGroup?.name || "", 60),
      subtitle: "",
      participants,
      count: participants.length + 1,
      speaker: null,
      muted: Boolean(groupCall?.isMuted),
      deafened: Boolean(groupCall?.deafened),
      connecting: false,
      startedAt: durationStart > 0 ? durationStart : base.startedAt,
    };
  }
  const channelId = str(String(serverVoice?.activeChannelId ?? ""), 64);
  const serverId = str(String(serverVoice?.activeServerId ?? ""), 64);
  const participants = others(serverVoice?.participants);
  const serverRow = (Array.isArray(servers) ? servers : []).find((s) => String(s?.id) === serverId);
  let speaker = null;
  if (speakerScope != null && String(speakerScope) === channelId) {
    for (const id of Array.isArray(speakers) ? speakers : []) {
      const p = participants.find((x) => x.id === String(id)) || (mePerson && mePerson.id === String(id) ? mePerson : null);
      if (p) {
        speaker = p;
        break;
      }
    }
  }
  return {
    ...base,
    kind: "server",
    title: str(serverVoice?.channelName || "", 60),
    subtitle: str(serverRow?.name || "", 60),
    serverId: ID_RE.test(serverId) ? serverId : "",
    channelId: ID_RE.test(channelId) ? channelId : "",
    participants,
    count: participants.length + 1,
    speaker,
    muted: Boolean(serverVoice?.muted),
    deafened: Boolean(serverVoice?.deafened),
    connecting: Boolean(serverVoice?.connecting),
  };
}

/** Identity of a call for its start time: the same room keeps its timer across updates. */
export function callIdentity(payload) {
  if (!payload?.active) return "";
  return `${payload.kind}|${payload.channelId || ""}|${payload.title || ""}`;
}

// ---- plugin plumbing ---------------------------------------------------------------------

let importCore = () => import("@capacitor/core");
let box = null;

function pluginBox() {
  if (!box) {
    box = Promise.resolve()
      .then(() => importCore())
      .then(({ registerPlugin }) => ({ plugin: registerPlugin(WIDGETS_PLUGIN) }))
      .catch(() => {
        box = null;
        return { plugin: null };
      });
  }
  return box;
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

async function call(method, args = {}, { platform = nativePlatform() } = {}) {
  if (platform !== "android") return null;
  const { plugin } = await pluginBox();
  if (!plugin || typeof plugin[method] !== "function") return null;
  try {
    return await withTimeout(plugin[method](args));
  } catch {
    return null; // an older native build without the widgets, or the shell is busy
  }
}

export const setWidgetSession = (payload) => (payload ? call("setSession", payload) : null);
export const clearWidgetSession = () => call("clearSession");
export const requestWidgetRefresh = (reason = "") => call("requestRefresh", { reason: str(reason, 40) });
export const setWidgetCallState = (state) => call("setCallState", state || { active: false });
export const getWidgetStatus = () => call("getStatus");

/** Selftests only. */
export const __androidWidgetsForTests = {
  setCoreImporter(fn) {
    importCore = fn;
    box = null;
  },
  reset() {
    importCore = () => import("@capacitor/core");
    box = null;
  },
};
