/**
 * The iOS call answered on the lock screen / CallKit runs entirely in Swift
 * (DescallNativeCall.swift, audio only) while useCall stays idle. Until 28 Nov 2026
 * the app only drew a fixed card over the chat for it (NativeCallCard): no full
 * screen, no way to return to one, and it covered the header and first messages.
 *
 * This adapter shows that native call to the UI as a DM call (the useCall shape the
 * full-screen CallOverlay, the phone "Ada" pill, the Live Activity and Siri read), so
 * it gets the same full screen, minimize / restore and controls. Pure: the native
 * actions are injected (lib/iosNativeCall.js in the app, fakes in the selftest).
 *
 * Capabilities: audio only. `native: true` tells CallOverlay to hide camera, deafen,
 * screen share and the More menu, and to give the second button to the audio output.
 */

/**
 * @param {object} snapshot  normalizeNativeCall() state ({ active, uuid, callerId, callerName, phase, muted, connectedAt, mediaVerified })
 * @param {{ peer?: object|null, route?: object|null, selectRoute?: Function, setMuted?: Function, hangup?: Function }} deps
 * @returns {object|null} a useCall-like value, or null when no native call is live
 */
export function nativeCallAsCall(snapshot, deps = {}) {
  if (!snapshot?.active) return null;
  const callerId = String(snapshot.callerId || "");
  const friend = deps.peer && String(deps.peer.id) === callerId ? deps.peer : null;
  const peer = friend
    ? { ...friend }
    : { id: callerId || snapshot.uuid, username: "", displayName: snapshot.callerName || "Descall" };
  if (!peer.displayName && !peer.display_name && snapshot.callerName) peer.displayName = snapshot.callerName;
  const phase = snapshot.phase;
  const connected = phase === "connected" && snapshot.mediaVerified !== false;
  const peerConnectionState =
    phase === "reconnecting" ? "reconnecting" : connected ? "connected" : "connecting";
  const muted = Boolean(snapshot.muted);
  const setMuted = deps.setMuted || (() => Promise.resolve());
  const hangup = deps.hangup || (() => Promise.resolve());
  return {
    native: true,
    nativeUuid: snapshot.uuid,
    mode: "active",
    callType: "voice",
    peer,
    muted,
    deafened: false,
    cameraOn: false,
    screenSharing: false,
    remoteCameraOn: false,
    remoteScreenSharing: false,
    remoteMuted: false,
    remoteDeafened: false,
    remoteStream: null,
    remoteScreenStream: null,
    localStream: null,
    peerConnectionState,
    remoteMediaReady: connected,
    mediaFlow: connected ? "flowing" : "connecting",
    connectionQuality: "unknown",
    networkStats: null,
    durationStartedAt: Number(snapshot.connectedAt) || null,
    durationStoppedAt: null,
    iosAudioRoute: deps.route || null,
    selectIosRoute: deps.selectRoute || (() => {}),
    audioInputDevices: [],
    audioOutputDevices: [],
    videoInputDevices: [],
    toggleMute: () => setMuted(!muted),
    setMuted: (v) => setMuted(Boolean(v)),
    endCall: () => hangup(),
  };
}

/** Stable identity for memoizing the adapter (only what the UI draws). */
export function nativeCallAdapterKey(snapshot, peer, route) {
  if (!snapshot?.active) return "";
  return JSON.stringify([
    snapshot.uuid,
    snapshot.callerId,
    snapshot.callerName,
    snapshot.phase,
    Boolean(snapshot.muted),
    snapshot.connectedAt || 0,
    snapshot.mediaVerified !== false,
    peer ? [peer.id, peer.username, peer.displayName || peer.display_name || "", peer.avatarUrl || peer.avatar_url || ""] : null,
    route ? [route.active, route.selected, route.current, (route.routes || []).map((r) => `${r.id}:${r.kind}:${r.name}`)] : null,
  ]);
}
