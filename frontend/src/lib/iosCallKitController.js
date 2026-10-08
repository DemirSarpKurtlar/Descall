/**
 * Pure CallKit ↔ useCall glue for the native iOS app (no Capacitor imports, so
 * it is unit-testable in Node). The hook in hooks/useIosCallKitBridge.js wires
 * it to the plugin, the socket and the useCall() object.
 *
 * One CallKit call (uuid) per DM call session:
 *   incoming  → server callUuid (same uuid as the VoIP push)
 *   outgoing  → fresh uuid, CXStartCallAction
 *
 * Cold start (VoIP push woke the app, user answered on the lock screen
 * before the web app had the offer): the answer is kept as `pendingAnswer`,
 * the socket asks the server to replay the ringing offer
 * (call:resume-pending), and the call is accepted as soon as useCall shows
 * that incoming call.
 */

const ENDED_HINT_MS = 5_000;
const PENDING_ANSWER_MS = 25_000;
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

    if (answerQueued) acceptNow();
  }

  function beginOutgoing(c) {
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
    if (current.fallback) {
      current.fallback = false;
      onFallbackRing(false);
    }
  }

  function finish() {
    const cur = current;
    current = null;
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
    const c = getCall();
    if (current && current.uuid === uuid) {
      if (current.answered) return;
      current.answered = true;
      if (current.fallback) {
        current.fallback = false;
        onFallbackRing(false);
      }
      acceptNow();
      return;
    }
    if (!current && c?.mode === "incoming" && data.callerId && c.peer?.id === data.callerId) {
      current = { uuid, direction: "incoming", peerId: c.peer.id, answered: true, endedByCallKit: false, fallback: false };
      prevMode = "incoming";
      acceptNow();
      return;
    }
    // Cold start: the offer hasn't reached the web app yet.
    clearPendingAnswer();
    pendingAnswer = {
      uuid,
      callerId: data.callerId || "",
      timer: setTimer(() => {
        if (pendingAnswer?.uuid !== uuid) return;
        pendingAnswer = null;
        safe(plugin.reportCallEnded({ uuid, reason: "failed" }));
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
        return onAudioSessionActivated();
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
    // for tests / diagnostics
    _state: () => ({ current, pendingAnswer, knownPushes: [...knownPushes.keys()], pendingDeclines: [...pendingDeclines.keys()] }),
  };
}
