/**
 * "Ada" (draft A, 27 Nov 2026): a minimized call on a phone becomes a black pill
 * that wraps the hardware Dynamic Island (devices without one: centered in, or
 * just under, the status bar). It never sits over the app's content.
 *
 * Pure model, no React / DOM, unit-tested in adaPill.selftest.mjs:
 *   - one view of every call source (native CallKit call, DM, group, server voice)
 *   - what the left / right ends of the pill show (face, stack, server, spinner;
 *     wave, red mic, screen, video, amber signal)
 *   - event bubbles (joined, left, reconnecting, screen share, camera)
 *   - gesture thresholds (tap, pull down, long press, horizontal swipe = mute)
 *   - geometry per device (island, notch, plain status bar, no room)
 *   - the output (audio route) button of the long-press panel
 */

export const ADA = Object.freeze({
  /** Press this long without moving: the quick panel opens (draft: 0.35 s). */
  LONG_PRESS_MS: 350,
  /** Movement under this is still a tap / press. */
  TAP_SLOP: 10,
  /** Pull down this far: full screen. */
  PULL_DY: 24,
  /** Swipe sideways this far (and mostly sideways): toggle mute. */
  SWIPE_DX: 44,
  /** Hold "End" this long to hang up (the destructive action's confirmation). */
  HOLD_END_MS: 900,
  /** Event bubble on screen. */
  EVENT_MS: 2500,
  /** "Undo" after a swipe mute. */
  UNDO_MS: 1800,
  /** Ended state (red end icon, duration, call back) before the pill retracts. */
  ENDED_MS: 5000,
  /** The quick panel closes by itself after this long without a touch. */
  PANEL_IDLE_MS: 5000,
  /** Pill to full screen (spring), reduced motion: fade only. */
  MORPH_MS: 360,
  MORPH_REDUCED_MS: 160,
  /** Visual height on Dynamic Island iPhones (same as the hardware island). */
  ISLAND_H: 37,
  ISLAND_TOP: 11,
  /** Draft width of the closed pill on a 390 / 393 pt wide iPhone. */
  WIDTH: 214,
  /** Minimum touch target (Apple HIG). */
  TOUCH: 44,
});

const str = (v, max = 80) => String(v ?? "").trim().slice(0, max);

/** Person shape the pill draws (face, name). */
export function adaPerson(p) {
  if (!p || p.id == null) return null;
  const name = str(p.displayName || p.display_name || p.globalName || p.username || p.name || "", 64);
  return {
    id: String(p.id),
    name,
    avatarUrl: p.avatarUrl || p.avatar_url || null,
    user: p,
  };
}

function uniquePeople(list, myId) {
  const seen = new Set();
  const out = [];
  for (const raw of Array.isArray(list) ? list : []) {
    const p = adaPerson(raw);
    if (!p || seen.has(p.id) || (myId != null && p.id === String(myId))) continue;
    seen.add(p.id);
    out.push({ ...p, raw });
  }
  return out;
}

function speakerOf(people, speakerId) {
  if (!people.length) return null;
  return people.find((p) => p.id === String(speakerId || "")) || people[0];
}

function stripRaw(p) {
  if (!p) return null;
  const { raw, ...rest } = p;
  void raw;
  return rest;
}

/**
 * DM call (useCall) or the native CallKit call adapter (nativeCallAdapter.js,
 * `native: true`). Incoming rings belong to CallKit / the incoming card: no pill.
 * @param {object} call  useCall() value or the adapter
 * @param {{ remoteVideo?: boolean, speaking?: boolean }} extra  measured by the host
 */
export function adaFromDmCall(call, extra = {}) {
  const mode = call?.mode;
  if (!mode || mode === "idle" || mode === "incoming") return null;
  const peer = adaPerson(call.peer);
  if (!peer) return null;
  const source = call.native ? "native" : "dm";
  let phase = "live";
  if (call.ending) phase = "ended";
  else if (mode === "outgoing") phase = "ringing";
  else if (call.peerConnectionState === "reconnecting") phase = "reconnecting";
  else if (call.peerConnectionState === "connecting" || call.remoteMediaReady === false) phase = "connecting";
  const screen = call.remoteScreenSharing
    ? { id: peer.id, name: peer.name, stream: call.remoteScreenStream || null }
    : null;
  const rtt = Number(call.networkStats?.rttMs);
  return {
    source,
    key: `${source}:${peer.id}`,
    phase,
    title: peer.name,
    callType: call.callType === "video" ? "video" : "voice",
    people: [peer],
    speaker: peer,
    speaking: Boolean(extra.speaking) && phase === "live",
    count: 2,
    muted: Boolean(call.muted),
    deafened: Boolean(call.deafened),
    video: Boolean(extra.remoteVideo ?? (call.remoteCameraOn === true && call.callType === "video")),
    screen,
    startedAt: Number(call.durationStartedAt) || null,
    stoppedAt: Number(call.durationStoppedAt) || null,
    quality: call.connectionQuality && call.connectionQuality !== "unknown" ? String(call.connectionQuality) : null,
    rttMs: Number.isFinite(rtt) && rtt > 0 ? Math.round(rtt) : null,
    chat: { kind: "dm", peer: peer.user },
    callBack: { kind: "dm", peer: peer.user, callType: call.callType === "video" ? "video" : "voice" },
  };
}

function troubled(p) {
  const s = p?.connectionState || p?.peerConnectionState || null;
  const q = p?.connectionQuality || null;
  return s === "reconnecting" || s === "disconnected" || s === "failed" || q === "reconnecting" || q === "failed";
}

/**
 * Group call (useGroupCall).
 * @param {{ me?: object, group?: object, speakerId?: string|null, speakingIds?: string[] }} extra
 */
export function adaFromGroupCall(gc, extra = {}) {
  if (!gc?.isInCall) return null;
  const myId = extra.me?.id != null ? String(extra.me.id) : null;
  const remote = uniquePeople(gc.participants, myId);
  const speaking = new Set((extra.speakingIds || []).map(String));
  const speaker = speakerOf(remote, extra.speakerId);
  let phase = "live";
  if (remote.length > 0 && remote.every((p) => troubled(p.raw))) phase = "reconnecting";
  const sharer = remote.find((p) => p.raw?.isScreenSharing);
  const groupId = gc.activeGroupId != null ? String(gc.activeGroupId) : "";
  return {
    source: "group",
    key: `group:${groupId}`,
    phase,
    title: str(extra.group?.name || gc.groupName || "", 80),
    callType: gc.callType === "video" ? "video" : "voice",
    people: remote.map(stripRaw),
    speaker: stripRaw(speaker),
    speaking: Boolean(speaker && speaking.has(speaker.id)),
    count: remote.length + 1,
    muted: Boolean(gc.isMuted),
    deafened: Boolean(gc.deafened),
    video: remote.some((p) => p.raw?.isCameraOn === true && p.raw?.stream),
    screen: sharer ? { id: sharer.id, name: sharer.name, stream: sharer.raw?.screenStream || null } : null,
    startedAt: Number(gc.durationStartedAt) || null,
    stoppedAt: null,
    quality: null,
    rttMs: null,
    groupId,
    chat: { kind: "group", groupId },
    callBack: null,
  };
}

/**
 * Server voice channel (useServerVoice).
 * @param {{ me?: object, server?: object, speakerId?: string|null, speakingIds?: string[], startedAt?: number }} extra
 */
export function adaFromServerVoice(sv, extra = {}) {
  if (!sv || !(sv.isInVoice || sv.connecting) || !sv.activeChannelId) return null;
  const myId = extra.me?.id != null ? String(extra.me.id) : sv.myUserId != null ? String(sv.myUserId) : null;
  const remote = uniquePeople(sv.participants, myId);
  const speaking = new Set((extra.speakingIds || []).map(String));
  const speaker = speakerOf(remote, extra.speakerId);
  let phase = "live";
  if (sv.connecting) phase = "connecting";
  else if (["connecting", "reconnecting", "disconnected"].includes(sv.liveKitLink)) phase = "reconnecting";
  const sharer = remote.find((p) => p.raw?.isScreenSharing);
  const server = extra.server || null;
  return {
    source: "server",
    key: `server:${sv.activeChannelId}`,
    phase,
    title: str(sv.channelName || "", 80),
    serverName: str(server?.name || "", 80),
    server: server ? { id: String(server.id ?? sv.activeServerId ?? ""), name: str(server.name, 80), iconUrl: server.iconUrl || null, raw: server } : { id: String(sv.activeServerId || ""), name: "", iconUrl: null, raw: null },
    callType: "voice",
    people: remote.map(stripRaw),
    speaker: stripRaw(speaker),
    speaking: Boolean(speaker && speaking.has(speaker.id)),
    count: remote.length + 1,
    muted: Boolean(sv.muted),
    deafened: Boolean(sv.deafened),
    video: remote.some((p) => p.raw?.isCameraOn === true),
    screen: sharer ? { id: sharer.id, name: sharer.name, stream: sharer.raw?.screenStream || null } : null,
    startedAt: Number(extra.startedAt) || null,
    stoppedAt: null,
    quality: null,
    rttMs: null,
    serverId: String(sv.activeServerId || ""),
    channelId: String(sv.activeChannelId),
    chat: { kind: "server", serverId: String(sv.activeServerId || "") },
    callBack: { kind: "server", serverId: String(sv.activeServerId || ""), channel: { id: String(sv.activeChannelId), name: str(sv.channelName, 80), type: sv.channelType || "voice" } },
  };
}

/**
 * Which call the pill shows. One is normally live; if two overlap the native
 * CallKit call wins (it owns the audio), then the DM, the group, the voice channel.
 */
export function pickAdaModel({ dm = null, group = null, server = null } = {}) {
  if (dm && dm.source === "native") return dm;
  return dm || group || server || null;
}

/**
 * Is the pill on screen? DM / group / native: only while the full-screen call is
 * minimized. Server voice: everywhere except the voice channel's own screen
 * (that screen is its full-screen view).
 */
export function adaVisible(model, { minimized = false, onVoiceRoute = false } = {}) {
  if (!model) return false;
  if (model.source === "server") return !onVoiceRoute;
  return Boolean(minimized);
}

/**
 * The two ends of the closed pill.
 * left:  face | stack | server | spinner | end | ring
 * right: wave | count-wave | mic-off | screen | video | signal | timer | dots
 * tone:  green | blue | red | amber
 */
export function adaFace(model) {
  if (!model) return null;
  const { phase, source } = model;
  if (phase === "ended") return { mode: "ended", left: "end", right: "timer", tone: "red" };
  if (phase === "reconnecting") return { mode: "recon", left: "spinner", right: "signal", tone: "amber" };
  const left = source === "server" ? "server" : source === "group" && model.people.length > 1 ? "stack" : "face";
  if (phase === "ringing" || phase === "connecting") {
    return { mode: "connecting", left, right: model.muted ? "mic-off" : "dots", tone: model.muted ? "red" : "blue" };
  }
  // Mute is always visible: it wins over share / video / wave.
  if (model.muted) return { mode: "muted", left, right: "mic-off", tone: "red", count: source === "group" ? model.count : null };
  if (model.screen) return { mode: "share", left, right: "screen", tone: "blue" };
  if (model.video) return { mode: "video", left, right: "video", tone: "blue" };
  if (source === "server") return { mode: "voice", left, right: "wave", tone: "blue" };
  if (source === "group") return { mode: "group", left, right: "count-wave", tone: "green", count: model.count };
  return { mode: "call", left, right: "wave", tone: "green" };
}

/** Ended copy of the last live model (red end icon, frozen duration, call back). */
export function adaEndedModel(last, now = Date.now()) {
  if (!last) return null;
  return {
    ...last,
    key: `${last.key}:ended`,
    phase: "ended",
    speaking: false,
    screen: null,
    video: false,
    stoppedAt: last.stoppedAt || (last.startedAt ? now : null),
    endedAt: now,
  };
}

/**
 * What happened between two renders of the same call: bubbles, oldest first.
 * kinds: joined, left, reconnecting, reconnected, screen, video.
 */
export function adaEvents(prev, next) {
  if (!prev || !next || prev.key !== next.key) return [];
  if (next.phase === "ended") return [];
  const out = [];
  if (next.source === "group" || next.source === "server") {
    const before = new Map((prev.people || []).map((p) => [p.id, p]));
    const after = new Map((next.people || []).map((p) => [p.id, p]));
    for (const [id, p] of after) if (!before.has(id)) out.push({ kind: "joined", id, name: p.name, person: p });
    for (const [id, p] of before) if (!after.has(id)) out.push({ kind: "left", id, name: p.name, person: p });
  }
  if (prev.phase !== "reconnecting" && next.phase === "reconnecting") out.push({ kind: "reconnecting" });
  if (prev.phase === "reconnecting" && next.phase === "live") out.push({ kind: "reconnected" });
  if (!prev.screen && next.screen) out.push({ kind: "screen", id: next.screen.id, name: next.screen.name });
  if (!prev.video && next.video) out.push({ kind: "video", name: next.source === "dm" || next.source === "native" ? next.title : "" });
  return out;
}

// ---- gestures ------------------------------------------------------------------------------

/**
 * While the finger moves. "swipe" (mostly sideways, far enough), "pull" (down),
 * "up", "moving" (past the tap slop, nothing decided), "still".
 */
export function adaGestureOnMove({ dx = 0, dy = 0 } = {}) {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (ax >= ADA.SWIPE_DX && ax > ay * 1.5) return "swipe";
  if (dy >= ADA.PULL_DY && dy > ax) return "pull";
  if (dy <= -ADA.PULL_DY && ay > ax) return "up";
  if (Math.hypot(dx, dy) > ADA.TAP_SLOP) return "moving";
  return "still";
}

/** Finger up: "tap" | "pull" | "swipe" | "none" (long press already fired, or a drag that decided nothing). */
export function adaGestureOnEnd({ dx = 0, dy = 0, elapsedMs = 0, longPressed = false } = {}) {
  if (longPressed) return "none";
  const move = adaGestureOnMove({ dx, dy });
  if (move === "swipe" || move === "pull") return move;
  if (move === "still" && elapsedMs < ADA.LONG_PRESS_MS) return "tap";
  return "none";
}

/** Can the long-press timer still fire at this movement? */
export function adaLongPressAlive({ dx = 0, dy = 0 } = {}) {
  return Math.hypot(dx, dy) <= ADA.TAP_SLOP;
}

/** 0..1 progress of the hold-to-end ring. */
export function adaHoldProgress(elapsedMs) {
  const v = Number(elapsedMs) / ADA.HOLD_END_MS;
  return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0;
}

// ---- geometry ------------------------------------------------------------------------------

/**
 * Where the pill sits on this device.
 * kind:
 *   island  iPhone with a Dynamic Island (top inset >= 51): wraps the island, 0 pt into content
 *   notch   iPhone with a notch (40..50): just under the notch, the app moves down by `reserve`
 *   bar     Android / tall plain status bar: centered in it, `reserve` tops the touch zone up to 44
 *   strip   no room (iPhone SE, mobile browser): a 44 pt strip above the app (`reserve`)
 * Every kind keeps the content clear: the app root moves down by `reserve` px.
 * @param {{ safeTop:number, viewportW:number, platform?:"ios"|"android"|"web" }} env
 */
export function adaLayout({ safeTop = 0, viewportW = 390, platform = "web" } = {}) {
  const top = Math.max(0, Math.round(Number(safeTop) || 0));
  const vw = Math.max(280, Math.round(Number(viewportW) || 390));
  const width = Math.round(Math.min(ADA.WIDTH, vw * 0.55));
  let kind = "strip";
  if (platform === "ios" && top >= 51) kind = "island";
  else if (platform === "ios" && top >= 40) kind = "notch";
  else if (platform !== "ios" && top >= 24) kind = "bar";
  let visualTop;
  let visualH;
  let zoneBottom;
  if (kind === "island") {
    visualTop = ADA.ISLAND_TOP;
    visualH = ADA.ISLAND_H;
    zoneBottom = top - 5; // the status bar ends a few pt above the safe area
  } else if (kind === "notch") {
    visualH = 30;
    visualTop = top - 15;
    zoneBottom = visualTop + visualH + 7;
  } else if (kind === "bar") {
    visualH = Math.max(24, Math.min(34, top - 6));
    zoneBottom = Math.max(top, ADA.TOUCH);
    visualTop = Math.round((Math.min(top, zoneBottom) - visualH) / 2);
    if (visualTop + visualH > zoneBottom - 4) visualTop = Math.max(2, zoneBottom - 4 - visualH);
  } else {
    visualH = 32;
    visualTop = top + 6;
    zoneBottom = top + ADA.TOUCH;
  }
  const hitTop = Math.max(0, Math.min(visualTop - 4, zoneBottom - ADA.TOUCH));
  const hitH = Math.max(ADA.TOUCH, zoneBottom - hitTop);
  return {
    kind,
    width,
    visualTop,
    visualH,
    hitTop,
    hitH,
    zoneBottom: Math.max(zoneBottom, hitTop + hitH),
    /** The app root moves down this much while the pill is up (0 on island iPhones). */
    reserve: kind === "island" ? 0 : Math.max(0, Math.max(zoneBottom, hitTop + hitH) - top),
    expandedTop: kind === "island" || kind === "notch" ? 8 : top + 6,
    expandedInset: 8,
    /** Space at the top of the open panel / bubble for the hardware island or notch. */
    expandedPadTop: kind === "island" ? 56 : kind === "notch" ? 40 : 14,
  };
}

/**
 * Native chrome while the pill is up.
 * statusBarHidden: the open panel / event bubble covers the status bar, so iOS-style
 *   the clock and signal glyphs step aside (they would print over the black panel).
 * scrollsToTop: a tap on the island area must not also scroll the web view to the top.
 */
export function adaChrome({ visible = false, expanded = false, layout = null } = {}) {
  const coversStatusBar = Boolean(visible && expanded && layout && layout.kind !== "strip");
  return { statusBarHidden: coversStatusBar, scrollsToTop: !visible };
}

// ---- audio output ------------------------------------------------------------------------------

const BUILT_IN = new Set(["receiver", "speaker"]);

/**
 * The panel's output button, from the native iOS route snapshot (useIosAudioRoute /
 * the hooks' iosAudioRoute) or, elsewhere, the web output devices.
 * `selected` is what iOS really plays (DescallAudioRouter.state "selected").
 * action: "toggle" (only earpiece and loudspeaker: one tap flips) | "menu" | "none".
 */
export function adaRouteModel({ ios = null, webDevices = null, webSelected = "" } = {}) {
  const routes = Array.isArray(ios?.routes) ? ios.routes.filter((r) => r && r.id) : [];
  if (ios && routes.length) {
    const sel = String(ios.selected || "");
    const options = routes.map((r) => ({ id: String(r.id), kind: String(r.kind || r.id), name: str(r.name, 40), selected: String(r.id) === sel }));
    if (!options.some((o) => o.selected)) {
      const cur = String(ios.current || "");
      const byKind = options.find((o) => o.kind === cur);
      if (byKind) byKind.selected = true;
    }
    const current = options.find((o) => o.selected) || null;
    const onlyBuiltIn = options.every((o) => BUILT_IN.has(o.kind));
    let toggleTo = null;
    if (onlyBuiltIn && options.length === 2) toggleTo = current?.kind === "speaker" ? options.find((o) => o.kind === "receiver")?.id : options.find((o) => o.kind === "speaker")?.id;
    return {
      native: true,
      options,
      current,
      action: options.length < 2 ? "none" : toggleTo ? "toggle" : "menu",
      toggleTo: toggleTo || null,
      speakerOn: current?.kind === "speaker",
    };
  }
  const list = (Array.isArray(webDevices) ? webDevices : []).filter((d) => d && typeof d.deviceId === "string" && d.deviceId !== "default" && d.deviceId !== "communications");
  if (list.length < 2) return { native: false, options: [], current: null, action: "none", toggleTo: null, speakerOn: false };
  const options = list.map((d) => ({ id: d.deviceId, kind: "other", name: str(d.label, 40), selected: d.deviceId === webSelected }));
  if (!options.some((o) => o.selected)) options[0].selected = true;
  return { native: false, options, current: options.find((o) => o.selected), action: "menu", toggleTo: null, speakerOn: false };
}

/**
 * Phone layout only (tablets and desktop keep MiniCallCard / the return bar):
 * the screen's short side is phone-sized (every iPhone < 600 pt, every iPad >= 744)
 * and it is a touch device (the native app, or a coarse pointer on the web).
 */
export function isAdaPhone({ screenShort = 0, native = false, coarse = false } = {}) {
  const s = Number(screenShort) || 0;
  return s > 0 && s < 600 && Boolean(native || coarse);
}
