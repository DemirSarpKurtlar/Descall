/**
 * Pure CallKit ↔ useCall glue for the native iOS app (no Capacitor imports, so
 * it is unit-testable in Node). The hook in hooks/useIosCallKitBridge.js wires
 * it to the plugin, the socket and the useCall() object.
 *
 * One CallKit call (uuid) per INCOMING DM call (server callUuid, same uuid as
 * the VoIP push). Outgoing calls are not reported to CallKit since 2.9.135:
 * CallKit activating the audio session while WKWebView's microphone capture
 * is running silences it (2.9.133 "ses karşıya gitmiyor"), and the outgoing
 * CallKit UI added nothing the app needs. (REPORT_OUTGOING_TO_CALLKIT)
 *
 * Answering: the web app starts its microphone only after CallKit activated
 * the audio session (or after AUDIO_ACTIVATION_WAIT_MS), so capture starts
 * inside the call session instead of being interrupted by it.
 *
 * Locked phone: WKWebView can't capture the mic / run the web app while the
 * phone is locked. Native code shows "open Descall to connect", tells the
 * caller to keep waiting, and ends the call after 60 s ("joinTimeout"). When
 * the user opens the app in time, the pending answer joins automatically.
 *
 * Cold start (VoIP push woke the app, user answered on the lock screen
 * before the web app had the offer): the answer is kept as `pendingAnswer`,
 * the socket asks the server to replay the ringing offer
 * (call:resume-pending), and the call is accepted as soon as useCall shows
 * that incoming call.
 */

const ENDED_HINT_MS = 5_000;
// Native ends a locked-screen answer after 60 s (DescallCallManager.lockedJoinTimeout).
const PENDING_ANSWER_MS = 75_000;
const AUDIO_ACTIVATION_WAIT_MS = 1_200;
const REPORT_OUTGOING_TO_CALLKIT = false;
const RESUME_THROTTLE_MS = 1_500;
const OFFER_SETTLE_MS = 1_500;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function normUuid(value) {
  const text = String(value || "").trim().toLowerCase();
  return UUID_RE.test(text) ? text : "";
}

function displayName(peer) {
  return String(peer?.displayName || peer?.display_name || peer?.username || "Descall").slice(0, 64);
}

export function createCallKitController({
  plugin,
  getCall,
  getSocket,
  onFallbackRing = () => {},
  onAudioSessionActivated = () => {},
  onAudioReleased = () => {},
  isHidden = () => typeof document !== "undefined" && document.visibilityState === "hidden",
  newUuid,
  now = () => Date.now(),
  setTimer = (fn, ms) => setTimeout(fn, ms),
  clearTimer = (id) => clearTimeout(id),
  log = () => {},
}) {
  let current = null; // { uuid, direction, peerId, answered, endedByCallKit, fallback }
  let prevMode = null;
  let lastMuted = false;
  let pendingAnswer = null; // { uuid, callerId, timer }
  const pendingDeclines = new Map(); // callerId -> uuid (declined on CallKit before the offer arrived)
  const knownPushes = new Map(); // uuid -> { callerId, at }
  const endedUuids = new Set(); // ended on CallKit; a late offer for them is declined silently
  let remoteEnd = null; // { peerId, reason, at }
  let lastResumeAt = -Infinity;
  let audioActive = false; // CallKit didActivate … didDeactivate
  let acceptTimer = null; // waiting for didActivate before starting the mic
  // Answered on the lock screen (native "awaitingJoin"): WKWebView can't
  // capture the mic while hidden, so the answer waits for the app to be opened.
  let waitingForUnlock = false;

  const safe = (promise) => {
    if (promise && typeof promise.catch === "function") {
      promise.catch((err) => log("plugin call failed", err?.message || err));
    }
    return promise;
  };

  function socketConnected() {
    return Boolean(getSocket()?.connected);
  }

  function rememberEnded(uuid) {
    endedUuids.add(uuid);
    if (endedUuids.size > 32) endedUuids.delete(endedUuids.values().next().value);
  }

  function requestResume(force = false) {
    const sock = getSocket();
    if (!sock?.connected) return false;
    const ids = [...knownPushes.keys()];
    if (pendingAnswer && !ids.includes(pendingAnswer.uuid)) ids.push(pendingAnswer.uuid);
    if (!ids.length) return false;
    if (!force && now() - lastResumeAt < RESUME_THROTTLE_MS) return false;
    lastResumeAt = now();
    sock.emit("call:resume-pending", { callUuids: ids.slice(0, 8) });
    return true;
  }

  function flushPendingDeclines() {
    const sock = getSocket();
    if (!sock?.connected || !pendingDeclines.size) return;
    for (const [callerId] of pendingDeclines) {
      sock.emit("call:decline", { toUserId: callerId });
    }
    pendingDeclines.clear();
  }

  function clearPendingAnswer() {
    if (pendingAnswer?.timer != null) clearTimer(pendingAnswer.timer);
    pendingAnswer = null;
  }

  function clearAcceptTimer() {
    if (acceptTimer != null) clearTimer(acceptTimer);
    acceptTimer = null;
  }

  /** Answered on CallKit: start the mic once CallKit's audio session is up. */
  function acceptWhenAudioReady() {
    if (waitingForUnlock && isHidden()) return; // onAppVisible() accepts
    waitingForUnlock = false;
    if (audioActive) {
      clearAcceptTimer();
      acceptNow();
      return;
    }
    if (acceptTimer != null) return;
    acceptTimer = setTimer(() => {
      acceptTimer = null;
      acceptNow();
    }, AUDIO_ACTIVATION_WAIT_MS);
  }

  function acceptNow() {
    const c = getCall();
    if (c?.mode !== "incoming") return;
    try {
      const p = c.acceptIncoming?.();
      if (p && typeof p.catch === "function") p.catch(() => {});
    } catch (err) {
      log("acceptIncoming failed", err?.message || err);
    }
  }

  // ── useCall mode transitions ────────────────────────────────────────────

  function beginIncoming(c) {
    const peerId = c.peer?.id;
    let uuid = normUuid(c.callUuid);
    if (pendingAnswer && pendingAnswer.callerId === peerId) uuid = pendingAnswer.uuid;
    if (!uuid) {
      for (const [id, info] of knownPushes) {
        if (info.callerId === peerId) {
          uuid = id;
          break;
        }
      }
    }
    if (!uuid) uuid = newUuid();
    knownPushes.delete(uuid);
    current = { uuid, direction: "incoming", peerId, answered: false, endedByCallKit: false, fallback: false };

    if (endedUuids.has(uuid) || pendingDeclines.has(peerId)) {
      // Declined on the lock screen before the offer reached the web app.
      pendingDeclines.delete(peerId);
      current.endedByCallKit = true;
      c.declineIncoming?.();
      return;
    }

    const answerQueued = Boolean(pendingAnswer && pendingAnswer.callerId === peerId);
    if (answerQueued) {
      clearPendingAnswer();
      current.answered = true;
    }

    const reported = safe(
      plugin.reportIncomingCall({
        uuid,
        callerId: peerId || "",
        callerName: displayName(c.peer),
        video: c.callType === "video",
        conversationId: peerId || "",
      })
    );
    if (reported && typeof reported.then === "function") {
      reported.then((res) => {
        const status = res?.status || "failed";
        if (!current || current.uuid !== uuid || current.answered) return;
        // dnd / blocked: respect the system and stay quiet.
        if (status === "busy" || status === "failed" || status === "unentitled" || status === "unavailable") {
          current.fallback = true;
          onFallbackRing(true);
        }
      }, () => {
        if (!current || current.uuid !== uuid || current.answered) return;
        current.fallback = true;
        onFallbackRing(true);
      });
    }

    if (answerQueued) acceptWhenAudioReady();
  }

  function beginOutgoing(c) {
    if (!REPORT_OUTGOING_TO_CALLKIT) return;
    const uuid = newUuid();
    current = { uuid, direction: "outgoing", peerId: c.peer?.id, answered: true, endedByCallKit: false, fallback: false };
    safe(
      plugin.startOutgoingCall({
        uuid,
        calleeId: c.peer?.id || "",
        calleeName: displayName(c.peer),
        video: c.callType === "video",
      })
    );
  }

  function markActive() {
    if (!current) return;
    if (current.direction === "outgoing") {
      safe(plugin.reportOutgoingCallConnected({ uuid: current.uuid }));
      return;
    }
    if (!current.answered) {
      // Accepted in the web UI (chat banner / fallback card): tell CallKit.
      current.answered = true;
      safe(plugin.answerCall({ uuid: current.uuid }));
    }
    // Clears the locked-screen "open Descall" hint and its join timeout.
    if (typeof plugin.callJoined === "function") safe(plugin.callJoined({ uuid: current.uuid }));
    if (current.fallback) {
      current.fallback = false;
      onFallbackRing(false);
    }
  }

  function finish() {
    const cur = current;
    current = null;
    clearAcceptTimer();
    waitingForUnlock = false;
    if (cur.fallback) onFallbackRing(false);
    if (cur.endedByCallKit) return;
    const hint =
      remoteEnd && remoteEnd.peerId === cur.peerId && now() - remoteEnd.at < ENDED_HINT_MS ? remoteEnd.reason : null;
    remoteEnd = null;
    if (hint) {
      safe(plugin.reportCallEnded({ uuid: cur.uuid, reason: hint }));
    } else if (cur.direction === "incoming" && !cur.answered && !cur.fallback) {
      // Nobody answered (web auto-decline after 30 s).
      safe(plugin.reportCallEnded({ uuid: cur.uuid, reason: "unanswered" }));
    } else {
      safe(plugin.endCall({ uuid: cur.uuid }));
    }
  }

  function syncMute(c) {
    const muted = Boolean(c?.muted);
    if (!current || !current.answered || !c?.mode) {
      lastMuted = muted;
      return;
    }
    if (muted !== lastMuted) {
      lastMuted = muted;
      safe(plugin.setMuted({ uuid: current.uuid, muted }));
    }
  }

  /** Call after every render where call.mode / peer / callUuid / muted may have changed. */
  function sync() {
    const c = getCall();
    const mode = c?.mode ?? null;
    const peerChanged = Boolean(mode && current && c.peer?.id && current.peerId && c.peer.id !== current.peerId);
    if (mode !== prevMode || peerChanged) {
      prevMode = mode;
      if (peerChanged && current) finish();
      if (mode === "incoming" && !current) beginIncoming(c);
      else if (mode === "outgoing" && !current) beginOutgoing(c);
      else if (mode === "active") markActive();
      else if (mode === null && current) finish();
    }
    syncMute(c);
  }

  // ── CallKit events ──────────────────────────────────────────────────────

  function onAnswer(data) {
    const uuid = normUuid(data.uuid);
    if (!uuid) return;
    knownPushes.delete(uuid);
    if (data.awaitingJoin && isHidden()) waitingForUnlock = true;
    const c = getCall();
    if (current && current.uuid === uuid) {
      if (current.answered) return;
      current.answered = true;
      if (current.fallback) {
        current.fallback = false;
        onFallbackRing(false);
      }
      acceptWhenAudioReady();
      return;
    }
    if (!current && c?.mode === "incoming" && data.callerId && c.peer?.id === data.callerId) {
      current = { uuid, direction: "incoming", peerId: c.peer.id, answered: true, endedByCallKit: false, fallback: false };
      prevMode = "incoming";
      acceptWhenAudioReady();
      return;
    }
    // Cold start: the offer hasn't reached the web app yet.
    clearPendingAnswer();
    pendingAnswer = {
      uuid,
      callerId: data.callerId || "",
      timer: setTimer(() => {
        if (pendingAnswer?.uuid !== uuid) return;
        const callerId = pendingAnswer.callerId;
        pendingAnswer = null;
        rememberEnded(uuid);
        safe(plugin.reportCallEnded({ uuid, reason: "failed" }));
        // Don't leave the caller ringing for a call this phone can't join.
        const sock = getSocket();
        if (callerId && sock?.connected) sock.emit("call:decline", { toUserId: callerId });
      }, PENDING_ANSWER_MS),
    };
    requestResume(true);
  }

  function onEnd(data) {
    const uuid = normUuid(data.uuid);
    if (!uuid) return;
    rememberEnded(uuid);
    knownPushes.delete(uuid);
    if (pendingAnswer?.uuid === uuid) clearPendingAnswer();
    const c = getCall();
    if (current && current.uuid === uuid) {
      current.endedByCallKit = true;
      if (c?.mode === "incoming") c.declineIncoming?.();
      else if (c?.mode) c.endCall?.();
      return;
    }
    if (data.callerId && !data.answered) {
      pendingDeclines.set(data.callerId, uuid);
      flushPendingDeclines();
    }
  }

  function onMute(data) {
    const uuid = normUuid(data.uuid);
    const c = getCall();
    if (!current || current.uuid !== uuid || !c) return;
    const want = Boolean(data.muted);
    lastMuted = want;
    if (Boolean(c.muted) !== want) c.toggleMute?.();
  }

  function onReset() {
    clearPendingAnswer();
    knownPushes.clear();
    pendingDeclines.clear();
    const c = getCall();
    if (current) {
      current.endedByCallKit = true;
      if (c?.mode === "incoming") c.declineIncoming?.();
      else if (c?.mode) c.endCall?.();
    }
  }

  function onRingTimeout(data) {
    const uuid = normUuid(data.uuid);
    if (!uuid) return;
    rememberEnded(uuid);
    knownPushes.delete(uuid);
    const c = getCall();
    if (current && current.uuid === uuid && !current.answered) {
      current.endedByCallKit = true;
      if (c?.mode === "incoming") c.declineIncoming?.();
    }
  }

  /** Native gave up on a locked-screen answer (app not opened in time). */
  function onJoinTimeout(data) {
    const uuid = normUuid(data.uuid);
    if (!uuid) return;
    rememberEnded(uuid);
    knownPushes.delete(uuid);
    if (pendingAnswer?.uuid === uuid) clearPendingAnswer();
    waitingForUnlock = false;
    const c = getCall();
    if (current && current.uuid === uuid) {
      current.endedByCallKit = true;
      clearAcceptTimer();
      // The backend already ended the ring for the caller (voip-status "failed").
      if (c?.mode === "incoming" || c?.mode === "active") c.cleanup?.();
    }
  }

  /**
   * Last resort when the microphone stays silent under CallKit: end the
   * CallKit entry (frees the call-priority audio session) and keep the web
   * call going on the plain session. Returns true when released.
   */
  function releaseAudio() {
    if (!current || current.direction !== "incoming" || !current.answered || current.endedByCallKit) return false;
    current.endedByCallKit = true;
    safe(plugin.reportCallEnded({ uuid: current.uuid, reason: "failed" }));
    onAudioReleased();
    return true;
  }

  /** The app became visible: a locked-screen answer can join now. */
  function onAppVisible() {
    if (waitingForUnlock) {
      const c = getCall();
      if (current?.answered && current.direction === "incoming" && c?.mode === "incoming") {
        acceptWhenAudioReady();
      }
    }
    if (pendingAnswer || knownPushes.size) requestResume(true);
  }

  function onIncomingReportFailed(data) {
    // Push-reported call already ended natively (busy / DND / blocked).
    const uuid = normUuid(data.uuid);
    if (uuid) knownPushes.delete(uuid);
  }

  function handleEvent(name, data = {}) {
    switch (name) {
      case "incomingPush": {
        const uuid = normUuid(data.uuid);
        if (!uuid || current?.uuid === uuid) return;
        knownPushes.set(uuid, { callerId: data.callerId || "", at: now() });
        if (knownPushes.size > 8) knownPushes.delete(knownPushes.keys().next().value);
        if (!current) requestResume();
        return;
      }
      case "answer":
        return onAnswer(data);
      case "end":
        return onEnd(data);
      case "mute":
        return onMute(data);
      case "ringTimeout":
        return onRingTimeout(data);
      case "incomingReportFailed":
        return onIncomingReportFailed(data);
      case "reset":
        return onReset();
      case "audioSessionActivated":
        audioActive = true;
        if (acceptTimer != null) {
          clearAcceptTimer();
          acceptNow();
        }
        return onAudioSessionActivated(data);
      case "audioSessionDeactivated":
        audioActive = false;
        return undefined;
      case "joinTimeout":
        return onJoinTimeout(data);
      default:
        return undefined;
    }
  }

  // ── Socket events ───────────────────────────────────────────────────────

  function onSocketConnect() {
    flushPendingDeclines();
    if (knownPushes.size || pendingAnswer) requestResume(true);
  }

  /** call:cancelled / call:ended / call:declined from the peer. */
  function onRemoteEnded(fromUserId) {
    if (!fromUserId) return;
    remoteEnd = { peerId: fromUserId, reason: "remoteEnded", at: now() };
  }

  /** Another device of mine answered / declined this ring. */
  function onHandledElsewhere(kind, { fromUserId, callUuid } = {}) {
    const reason = kind === "answered" ? "answeredElsewhere" : "declinedElsewhere";
    const uuid = normUuid(callUuid);
    const c = getCall();
    if (current && current.direction === "incoming" && !current.answered && (current.uuid === uuid || current.peerId === fromUserId)) {
      remoteEnd = { peerId: current.peerId, reason, at: now() };
      c?.cleanup?.(); // local only; the other device already told the caller
      return;
    }
    if (uuid && (knownPushes.has(uuid) || pendingAnswer?.uuid === uuid)) {
      knownPushes.delete(uuid);
      if (pendingAnswer?.uuid === uuid) clearPendingAnswer();
      rememberEnded(uuid);
      safe(plugin.reportCallEnded({ uuid, reason }));
    }
  }

  /** Server answer to call:resume-pending. */
  function onResumeResult({ calls } = {}) {
    for (const entry of Array.isArray(calls) ? calls : []) {
      const uuid = normUuid(entry?.callUuid);
      if (!uuid || entry.state === "ringing") continue;
      if (current && current.uuid === uuid) continue;
      const tracked = knownPushes.has(uuid) || pendingAnswer?.uuid === uuid;
      if (!tracked) continue;
      knownPushes.delete(uuid);
      if (pendingAnswer?.uuid === uuid) clearPendingAnswer();
      rememberEnded(uuid);
      safe(plugin.reportCallEnded({ uuid, reason: entry.state === "active" ? "answeredElsewhere" : "remoteEnded" }));
    }
  }

  /** Any call:offer seen by the socket: a push-reported ring useCall refused (busy) must stop. */
  function onOfferSeen({ fromUser, callUuid } = {}, settle = (fn) => setTimer(fn, OFFER_SETTLE_MS)) {
    const uuid = normUuid(callUuid);
    if (!uuid || !knownPushes.has(uuid)) return;
    settle(() => {
      const c = getCall();
      if (current?.uuid === uuid) return;
      if (c?.mode === "incoming" && c.peer?.id === fromUser?.id) return;
      if (pendingAnswer?.uuid === uuid) return;
      if (!knownPushes.has(uuid)) return;
      knownPushes.delete(uuid);
      rememberEnded(uuid);
      safe(plugin.reportCallEnded({ uuid, reason: "unanswered" }));
    });
  }

  return {
    sync,
    handleEvent,
    onSocketConnect,
    onRemoteEnded,
    onHandledElsewhere,
    onResumeResult,
    onOfferSeen,
    onAppVisible,
    releaseAudio,
    // for tests / diagnostics
    _state: () => ({
      current,
      pendingAnswer,
      knownPushes: [...knownPushes.keys()],
      pendingDeclines: [...pendingDeclines.keys()],
      audioActive,
      acceptPending: acceptTimer != null,
      waitingForUnlock,
    }),
  };
}
