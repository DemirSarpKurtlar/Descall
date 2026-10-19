/**
 * Bottom-left user + voice panel (2.10.115, web + Electron only).
 * Pure helpers so the state machine is testable without React:
 *   deriveVoiceSession  – one view of DM call / group call / server voice
 *   pingTone            – 80 / 200 ms colour thresholds
 *   matchVoiceShortcut  – Ctrl/⌘+Shift+M (mic), Ctrl/⌘+Shift+D (deafen)
 *   statusSubline       – "Boşta · Minecraft oynuyor" (narrow: game only)
 *   read/writeDeafenPref – deafen chosen while idle, applied on join
 */

export const UVP_STATUS_EVENT = "descall:uvp-status";
export const PING_GOOD_MS = 80;
export const PING_WARN_MS = 200;
export const DEAFEN_PREF_KEY = "descall:voice-deafened";

/** "good" < 80 ms ≤ "warn" ≤ 200 ms < "bad"; null/invalid → "unknown". */
export function pingTone(ms) {
  const n = Number(ms);
  if (ms == null || !Number.isFinite(n) || n < 0) return "unknown";
  if (n < PING_GOOD_MS) return "good";
  if (n <= PING_WARN_MS) return "warn";
  return "bad";
}

/** Median of the last samples (smooths one slow ack). */
export function smoothPing(samples) {
  const list = (samples || []).filter((v) => Number.isFinite(v) && v >= 0).slice(-3);
  if (!list.length) return null;
  const sorted = [...list].sort((a, b) => a - b);
  return Math.round(sorted[Math.floor(sorted.length / 2)]);
}

function nameOf(entity) {
  if (!entity) return "";
  return String(entity.displayName || entity.display_name || entity.name || entity.username || "").trim();
}

function findById(list, id) {
  if (id == null || !Array.isArray(list)) return null;
  return list.find((x) => x && String(x.id) === String(id)) || null;
}

/**
 * Priority: server voice > group call > DM call (only one is normally live;
 * the order only decides which one the panel controls if two overlap).
 * phase: "idle" | "connecting" | "connected".
 */
export function deriveVoiceSession({ call, groupCall, serverVoice, groups, servers } = {}) {
  const sv = serverVoice || null;
  if (sv && (sv.isInVoice || sv.connecting)) {
    const server = findById(servers, sv.activeServerId);
    return {
      kind: "server",
      phase: sv.connecting ? "connecting" : "connected",
      title: nameOf(server),
      subtitle: String(sv.channelName || "").trim(),
      muted: Boolean(sv.muted),
      deafened: Boolean(sv.deafened),
      screenSharing: Boolean(sv.isScreenSharing),
      canScreenShare: sv.canStream !== false,
      mediaRtt: null,
    };
  }
  const gc = groupCall || null;
  if (gc && gc.isInCall) {
    const group = findById(groups, gc.activeGroupId);
    return {
      kind: "group",
      phase: "connected",
      title: nameOf(group),
      subtitle: gc.callType === "video" ? "video" : "voice",
      muted: Boolean(gc.isMuted),
      deafened: Boolean(gc.deafened),
      screenSharing: Boolean(gc.isScreenSharing),
      canScreenShare: true,
      mediaRtt: null,
    };
  }
  const c = call || null;
  if (c && (c.mode === "outgoing" || c.mode === "active")) {
    const connected = c.mode === "active" && (c.peerConnectionState === "connected" || c.remoteMediaReady || c.peerConnectionState === "idle");
    return {
      kind: "dm",
      phase: connected ? "connected" : "connecting",
      title: nameOf(c.peer),
      subtitle: "",
      muted: Boolean(c.muted),
      deafened: Boolean(c.deafened),
      screenSharing: Boolean(c.screenSharing),
      canScreenShare: c.mode === "active",
      mediaRtt: Number.isFinite(c.networkStats?.rttMs) ? Math.round(c.networkStats.rttMs) : null,
    };
  }
  return { kind: "none", phase: "idle", title: "", subtitle: "", muted: false, deafened: false, screenSharing: false, canScreenShare: false, mediaRtt: null };
}

/** Second line under the status: "Grup / Kanal" or the person. */
export function sessionRoomLabel(session, t) {
  if (!session || session.kind === "none") return "";
  if (session.kind === "server") return [session.title, session.subtitle].filter(Boolean).join(" / ");
  if (session.kind === "group") return [session.title || t("Group"), t(session.subtitle === "video" ? "uvp.videoRoom" : "uvp.voiceRoom")].join(" / ");
  return session.title || t("uvp.directCall");
}

/** e is a KeyboardEvent-like. Returns "mute" | "deafen" | null. */
export function matchVoiceShortcut(e) {
  if (!e || e.repeat) return null;
  if (!(e.ctrlKey || e.metaKey) || !e.shiftKey || e.altKey) return null;
  const k = String(e.key || "").toLowerCase();
  const code = String(e.code || "");
  if (k === "m" || code === "KeyM") return "mute";
  if (k === "d" || code === "KeyD") return "deafen";
  return null;
}

/** Game label from useActivity's currentActivity ({displayName: "Playing X"} or {name}). */
export function activityGameName(activity) {
  if (!activity) return "";
  const raw = String(activity.gameName || activity.name || activity.displayName || activity.display_name || "").trim();
  if (!raw) return "";
  const m = raw.match(/^(?:playing|oynuyor:?)\s+(.+)$/i);
  return (m ? m[1] : raw).trim();
}

/**
 * Subline under the name. statusLabel is already translated ("Boşta").
 * custom status wins over the presence label; narrow drops the prefix when a game exists.
 */
export function statusSubline({ statusLabel = "", customStatus = "", game = "", narrow = false, t }) {
  const tr = typeof t === "function" ? t : (s) => s;
  const gameText = game ? tr("uvp.playing", { name: game }) : "";
  const lead = String(customStatus || "").trim() || statusLabel;
  // Narrow: the gamepad icon already says "playing", so just the game name.
  if (gameText && narrow) return { text: game, hasGame: true, title: gameText };
  if (gameText) {
    const text = lead ? `${lead} · ${gameText}` : gameText;
    return { text, hasGame: true, title: text };
  }
  return { text: lead, hasGame: false, title: lead };
}

function store() {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
}

export function readDeafenPref(s = store()) {
  try {
    return s?.getItem(DEAFEN_PREF_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeDeafenPref(on, s = store()) {
  try {
    s?.setItem(DEAFEN_PREF_KEY, on ? "1" : "0");
  } catch {
    /* private mode */
  }
}

/** Panel is web + Electron desktop only: never mobile layout, glass phone shell, or native iOS/Android. */
export function shouldShowUserVoicePanel({ isMobile, glassShell, native, view }) {
  if (isMobile || glassShell || native) return false;
  return true;
}
