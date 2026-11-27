"use strict";

const crypto = require("crypto");
const supabase = require("../db/supabase");
const clock = require("./callClock");

function nowIso() {
  return new Date(clock.now()).toISOString();
}

/** @type {Map<string, object>} key = `${callerId}:${calleeId}` */
const pendingDmCalls = new Map();

/**
 * Pair key → ms when its last call was finalized. A late renegotiation from a
 * peer that has not processed the hang-up yet must not resurrect that call.
 */
const recentlyEndedPairs = new Map();
const RECENTLY_ENDED_MS = 120_000;

function pairKey(a, b) {
  return [a, b].sort().join("::");
}

function endedRecently(a, b, now = clock.now()) {
  const at = recentlyEndedPairs.get(pairKey(a, b));
  return typeof at === "number" && now - at < RECENTLY_ENDED_MS;
}

function pendingKey(callerId, calleeId) {
  return `${callerId}:${calleeId}`;
}

function findPending(userA, userB) {
  const direct = pendingDmCalls.get(pendingKey(userA, userB));
  if (direct) return { key: pendingKey(userA, userB), call: direct };
  const swapped = pendingDmCalls.get(pendingKey(userB, userA));
  if (swapped) return { key: pendingKey(userB, userA), call: swapped };
  return null;
}

/** A re-sent ring within this window keeps its CallKit UUID (no second ring). */
const RING_UUID_REUSE_MS = 60_000;
/** iOS asks for a ringing offer again after a VoIP wake; older offers are dead. */
const RESUME_MAX_AGE_MS = 60_000;
/**
 * Answered on a locked iPhone (CallKit) but the web app can't join until the
 * phone is unlocked: the ring stays resumable this long after that answer.
 */
const ANSWERING_MAX_AGE_MS = 120_000;
const MAX_BUFFERED_ICE = 64;
/**
 * Caller ICE that reaches the server while its call:offer is still being
 * checked (block list / friendship lookups await the database). The ring
 * record does not exist yet, so bufferCallerIce used to drop those
 * candidates. A callee whose app was not running (VoIP wake, call:resume-
 * pending) then got the offer with NO caller candidates, answered, and ICE
 * never connected: "Bağlanıyor..." on the caller until the iPhone's 30 s
 * connect timeout hung up (27 Nov 2026 incident, first call after a deploy:
 * cold block-list cache + slow database).
 */
const EARLY_ICE_MS = 30_000;
/** pendingKey → { at, list } for offers that arrived but are not tracked yet. */
const earlyCallerIce = new Map();

/** The `a=ice-ufrag` of an SDP (one per ICE session), or "". */
function iceUfrag(sdpOrDesc) {
  const sdp = typeof sdpOrDesc === "string" ? sdpOrDesc : sdpOrDesc && typeof sdpOrDesc.sdp === "string" ? sdpOrDesc.sdp : "";
  const m = /a=ice-ufrag:([^\s]+)/.exec(sdp);
  return m ? m[1].slice(0, 64) : "";
}

/** Keep only candidates of this ICE session (no ufrag on either side = keep). */
function sameIceSession(candidate, ufrag) {
  if (!ufrag || !candidate || typeof candidate !== "object") return true;
  const own = typeof candidate.usernameFragment === "string" ? candidate.usernameFragment : "";
  if (own) return own === ufrag;
  const m = /\bufrag\s+([^\s]+)/.exec(String(candidate.candidate || ""));
  return m ? m[1] === ufrag : true;
}

function pruneEarlyIce(now = clock.now()) {
  for (const [key, entry] of earlyCallerIce) {
    if (now - entry.at > EARLY_ICE_MS) earlyCallerIce.delete(key);
  }
}

/**
 * call:offer arrived from `callerId` (before its async checks). From now its
 * ICE to `calleeId` is kept until trackOffer takes it or EARLY_ICE_MS passes.
 */
function noteOfferStarted(callerId, calleeId) {
  if (!callerId || !calleeId) return;
  const now = clock.now();
  pruneEarlyIce(now);
  const key = pendingKey(callerId, calleeId);
  const entry = earlyCallerIce.get(key);
  if (entry) entry.at = now;
  else earlyCallerIce.set(key, { at: now, list: [] });
}

/** An offer from caller → callee is being checked right now (not tracked yet). */
function hasOfferInFlight(callerId, calleeId) {
  const entry = earlyCallerIce.get(pendingKey(callerId, calleeId));
  return Boolean(entry && clock.now() - entry.at <= EARLY_ICE_MS);
}

/** The offer was refused (blocked / not friends): forget its early ICE. */
function dropEarlyIce(callerId, calleeId) {
  earlyCallerIce.delete(pendingKey(callerId, calleeId));
}
/** A caller that was suspended (locked iPhone) can fetch the answer this long. */
const ANSWER_REPLAY_MS = 60_000;

/** Still worth replaying to a (VoIP-woken / just-unlocked) callee? */
function isResumable(call, now = clock.now()) {
  if (!call || call.status !== "ringing") return false;
  if (now - Date.parse(call.offeredAt || 0) <= RESUME_MAX_AGE_MS) return true;
  return Boolean(call.answeringAt) && now - call.answeringAt <= ANSWERING_MAX_AGE_MS;
}

function newCallUuid() {
  return crypto.randomUUID();
}

/**
 * Track a DM call:offer.
 *
 * `renegotiation` (camera / screen / ICE restart inside a connected call)
 * keeps the connected record (status, startedAt, callUuid) instead of turning
 * it back into a ring. Fresh rings get a stable per-ring `callUuid` (CallKit
 * call id) and keep the initial offer + caller ICE in memory so a callee woken
 * by a VoIP push can fetch them (call:resume-pending).
 *
 * @returns {{ callUuid: string, renegotiation: boolean }}
 */
function trackOffer({ callerId, calleeId, callType, offer = null, renegotiation = false }) {
  if (!callerId || !calleeId) return { callUuid: "", renegotiation: false };
  const key = pendingKey(callerId, calleeId);
  // Early ICE (see EARLY_ICE_MS) belongs to this offer, whatever it turns out to be.
  const early = earlyCallerIce.get(key);
  earlyCallerIce.delete(key);
  const existing = findPending(callerId, calleeId);
  if (renegotiation && existing && existing.call.status === "active") {
    if (callType === "video") existing.call.callType = "video";
    return { callUuid: existing.call.callUuid || "", renegotiation: true };
  }
  if (renegotiation && !existing && !endedRecently(callerId, calleeId)) {
    // A renegotiation (ICE restart after a socket reconnect, camera toggle)
    // for a call the server no longer tracks — e.g. the backend restarted
    // mid-call. The two peers are clearly connected: track it as active
    // (from now, the best we know) instead of a fresh ring that would end up
    // logged as "missed" with no duration.
    const call = ensureActiveDmCall({ userId: callerId, peerId: calleeId });
    if (call && callType === "video") call.callType = "video";
    if (call && !call.callUuid) call.callUuid = newCallUuid();
    return { callUuid: call?.callUuid || "", renegotiation: true };
  }
  const prev = pendingDmCalls.get(key);
  const prevAge = prev ? clock.now() - Date.parse(prev.offeredAt || 0) : Infinity;
  const reuseUuid =
    prev && prev.callUuid && prev.status === "ringing" && prevAge < RING_UUID_REUSE_MS;
  const callUuid = reuseUuid ? prev.callUuid : newCallUuid();
  const ufrag = iceUfrag(offer);
  // A re-sent offer of the same ring (ack retry, caller-resume "unknown")
  // carries the same SDP: its candidates were trickled once and will not be
  // sent again, so they must survive. A new peer connection (new ufrag) does
  // not reuse them.
  const kept =
    reuseUuid && Array.isArray(prev.callerIce) && (!ufrag || !prev.offerUfrag || prev.offerUfrag === ufrag)
      ? prev.callerIce.filter((c) => sameIceSession(c, ufrag))
      : [];
  const earlyList = early && clock.now() - early.at <= EARLY_ICE_MS ? early.list.filter((c) => sameIceSession(c, ufrag)) : [];
  const callerIce = dedupeCandidates([...kept, ...earlyList]).slice(0, MAX_BUFFERED_ICE);
  pendingDmCalls.set(key, {
    callerId,
    calleeId,
    callType: callType === "video" ? "video" : "voice",
    status: "ringing",
    offeredAt: nowIso(),
    startedAt: null,
    callUuid,
    offer: offer || null,
    offerUfrag: ufrag,
    callerIce,
  });
  return { callUuid, renegotiation: false, keptIce: kept.length, earlyIce: earlyList.length };
}

function candidateKey(c) {
  if (!c || typeof c !== "object") return String(c);
  return `${c.sdpMid ?? ""}|${c.sdpMLineIndex ?? ""}|${c.candidate ?? ""}`;
}

function dedupeCandidates(list) {
  const seen = new Set();
  const out = [];
  for (const c of list) {
    const k = candidateKey(c);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(c);
  }
  return out;
}

/** Pending record for caller → callee (either direction), or null. */
function getPendingCall(userA, userB) {
  return findPending(userA, userB)?.call || null;
}

/**
 * Remember caller ICE while ringing so a late (VoIP-woken) callee gets it too.
 * Candidates that arrive while the offer is still being checked go to the
 * early buffer and join the ring in trackOffer.
 * @returns {"ringing"|"early"|"full"|"ignored"} where the candidate went
 */
function bufferCallerIce({ callerId, calleeId, candidate }) {
  if (!candidate) return "ignored";
  const key = pendingKey(callerId, calleeId);
  const call = pendingDmCalls.get(key);
  if (call && call.status === "ringing") {
    if (!Array.isArray(call.callerIce)) call.callerIce = [];
    if (call.callerIce.length >= MAX_BUFFERED_ICE) return "full";
    call.callerIce.push(candidate);
    return "ringing";
  }
  if (call && call.status === "active") return "ignored";
  const early = earlyCallerIce.get(key);
  if (!early || clock.now() - early.at > EARLY_ICE_MS) return "ignored";
  if (early.list.length >= MAX_BUFFERED_ICE) return "full";
  early.list.push(candidate);
  return "early";
}

/** Caller candidates a VoIP-woken callee would get with the offer right now. */
function bufferedCallerIceCount(callerId, calleeId) {
  const call = pendingDmCalls.get(pendingKey(callerId, calleeId));
  return call && Array.isArray(call.callerIce) ? call.callerIce.length : 0;
}

/** Callee ICE right after the answer (same replay purpose as `answer`). */
function bufferCalleeIce({ fromId, toId, candidate }) {
  const call = pendingDmCalls.get(pendingKey(toId, fromId));
  if (!call || call.status !== "active" || !call.answer || !candidate) return;
  if (clock.now() - (call.answeredAtMs || 0) > ANSWER_REPLAY_MS) return;
  if (call.calleeIce.length < MAX_BUFFERED_ICE) call.calleeIce.push(candidate);
}

/**
 * Answer (+ callee ICE) for a caller that reconnects during the first
 * ANSWER_REPLAY_MS after the callee picked up, else null.
 */
function answerReplayForCaller(callerId, calleeId) {
  const call = pendingDmCalls.get(pendingKey(callerId, calleeId));
  if (!call || call.status !== "active" || !call.answer) return null;
  if (clock.now() - (call.answeredAtMs || 0) > ANSWER_REPLAY_MS) return null;
  return { answer: call.answer, candidates: [...(call.calleeIce || [])] };
}

/** Ringing offers addressed to `calleeId` that are still fresh enough to answer. */
function listRingingForCallee(calleeId) {
  const out = [];
  const now = clock.now();
  for (const call of pendingDmCalls.values()) {
    if (call.calleeId !== calleeId || call.status !== "ringing" || !call.offer) continue;
    if (!isResumable(call, now)) continue;
    out.push(call);
  }
  return out;
}

/** "ringing" | "active" | "ended" for a CallKit call UUID the callee was woken for. */
function callStateByUuid(callUuid, calleeId) {
  if (!callUuid) return "ended";
  for (const call of pendingDmCalls.values()) {
    if (call.callUuid !== callUuid || call.calleeId !== calleeId) continue;
    if (call.status === "active") return "active";
    return isResumable(call) ? "ringing" : "ended";
  }
  return "ended";
}

/** The ringing call with this CallKit UUID addressed to `calleeId`, or null. */
function findRingingByUuid(callUuid, calleeId) {
  if (!callUuid || !calleeId) return null;
  for (const call of pendingDmCalls.values()) {
    if (call.callUuid === callUuid && call.calleeId === calleeId && call.status === "ringing") return call;
  }
  return null;
}

/**
 * The callee answered this ring on CallKit (e.g. lock screen) and is waiting
 * for the app to open. Keeps the offer resumable a while longer.
 * @returns {object|null} the call, when it is still ringing
 */
function markCalleeAnswering(callUuid, calleeId) {
  const call = findRingingByUuid(callUuid, calleeId);
  if (!call) return null;
  if (!call.answeringAt) call.answeringAt = clock.now();
  return call;
}

/**
 * The callee's SDP answer reached the server: the call is connected from now.
 * A repeated answer (renegotiation, iOS CallKit answer + in-app answer) keeps
 * the first connect time so the duration is never reset mid-call.
 */
function markAnswered({ callerId, calleeId, answer = null }) {
  const hit = findPending(callerId, calleeId);
  if (!hit) return null;
  const wasRinging = hit.call.status === "ringing";
  hit.call.status = "active";
  if (wasRinging && answer) {
    // Kept briefly so a caller whose phone was locked while it rang (socket
    // suspended, answer missed) still gets it when its socket comes back.
    hit.call.answer = answer;
    hit.call.answeredAtMs = clock.now();
    hit.call.calleeIce = [];
  }
  hit.call.startedAt = hit.call.startedAt || nowIso();
  hit.call.offer = null;
  hit.call.callerIce = [];
  return hit.call;
}

/**
 * Crossed calls: `answererId` just answered `callerId`'s ring while its own
 * ring to `callerId` was still out (both pressed call at the same moment).
 * That reverse ring is part of the call that connected: drop it without a
 * history row (it was not missed). Without this its 45 s timeout logged a
 * missed call and sent call:declined (no_answer), which hung up the call.
 * @returns {object|null} the dropped ring
 */
function dropCrossedRing(answererId, callerId) {
  if (!answererId || !callerId) return null;
  const key = pendingKey(answererId, callerId);
  const call = pendingDmCalls.get(key);
  if (!call || call.status !== "ringing") return null;
  pendingDmCalls.delete(key);
  return call;
}

/**
 * Seed / refresh a connected DM after Render restart so Admin Canlı can list it.
 * Connected (active) only — ringing offers stay ringing until markAnswered.
 */
function ensureActiveDmCall({ userId, peerId }) {
  if (!userId || !peerId) return null;
  const hit = findPending(userId, peerId);
  if (hit) {
    if (hit.call.status !== "active") {
      hit.call.status = "active";
      hit.call.startedAt = hit.call.startedAt || nowIso();
    }
    return hit.call;
  }
  const call = {
    callerId: userId,
    calleeId: peerId,
    callType: "voice",
    status: "active",
    offeredAt: nowIso(),
    startedAt: nowIso(),
    callerIce: [],
  };
  pendingDmCalls.set(pendingKey(userId, peerId), call);
  return call;
}

/** Connected (active) DMs only — ringing is not an ongoing call. */
function listActiveDmCalls() {
  const out = [];
  for (const call of pendingDmCalls.values()) {
    if (call.status === "active") out.push(call);
  }
  return out;
}

function isActiveDmCall(userA, userB) {
  const hit = findPending(userA, userB);
  return Boolean(hit && hit.call.status === "active");
}

async function persistCall(row) {
  try {
    const { data, error } = await supabase
      .from("dm_calls")
      .insert(row)
      .select("id")
      .maybeSingle();
    if (error) {
      console.warn("[dmCallLog] insert failed:", error.message || error);
      return null;
    }
    return data?.id || null;
  } catch (err) {
    console.warn("[dmCallLog] insert error:", err?.message || err);
    return null;
  }
}

/**
 * Finalize a pending DM call and persist it.
 * @returns {Promise<object|null>} public call record (without peer join)
 */
async function finalizeCall(userA, userB, status) {
  earlyCallerIce.delete(pendingKey(userA, userB));
  earlyCallerIce.delete(pendingKey(userB, userA));
  const hit = findPending(userA, userB);
  if (!hit) return null;
  pendingDmCalls.delete(hit.key);
  const nowMs = clock.now();
  recentlyEndedPairs.set(pairKey(userA, userB), nowMs);
  for (const [key, at] of recentlyEndedPairs) {
    if (nowMs - at >= RECENTLY_ENDED_MS) recentlyEndedPairs.delete(key);
  }

  const call = hit.call;
  const endedAt = new Date(nowMs);
  const startedAt = call.startedAt ? new Date(call.startedAt) : null;
  let finalStatus = status;
  if (!finalStatus) {
    finalStatus = startedAt ? "completed" : "missed";
  }
  if (finalStatus === "completed" && !startedAt) {
    finalStatus = "missed";
  }
  // Once answered, any way of hanging up is a completed call: a late
  // "decline" (stale CallKit UI, a busy second device) or a "cancel" from a
  // caller whose UI had not flipped to active yet must not erase the duration.
  if ((finalStatus === "cancelled" || finalStatus === "missed" || finalStatus === "declined") && startedAt) {
    finalStatus = "completed";
  }

  const durationSeconds =
    startedAt && finalStatus === "completed"
      ? Math.max(0, Math.round((endedAt.getTime() - startedAt.getTime()) / 1000))
      : null;

  const row = {
    caller_id: call.callerId,
    callee_id: call.calleeId,
    call_type: call.callType,
    status: finalStatus,
    started_at: startedAt ? startedAt.toISOString() : null,
    ended_at: endedAt.toISOString(),
    duration_seconds: durationSeconds,
  };

  const id = await persistCall(row);
  return {
    id: id || `local-${endedAt.getTime()}`,
    kind: "dm",
    callerId: call.callerId,
    calleeId: call.calleeId,
    callType: call.callType,
    status: finalStatus,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    durationSeconds,
    participantCount: finalStatus === "completed" ? 2 : 1,
    createdAt: endedAt.toISOString(),
  };
}

function mapCallRow(row, meId, peersById = {}) {
  const iAmCaller = row.caller_id === meId;
  const peerId = iAmCaller ? row.callee_id : row.caller_id;
  const peer = peersById[peerId] || null;
  return {
    id: row.id,
    kind: "dm",
    direction: iAmCaller ? "outgoing" : "incoming",
    callType: row.call_type,
    status: row.status,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    durationSeconds: row.duration_seconds,
    createdAt: row.created_at || row.ended_at,
    peer: peer
      ? {
          id: peer.id,
          username: peer.username,
          displayName: peer.display_name || peer.displayName || null,
          avatarUrl: peer.avatar_url || peer.avatarUrl || null,
          updated_at: peer.updated_at || null,
        }
      : {
          id: peerId,
          username: "Unknown",
          displayName: null,
          avatarUrl: null,
        },
  };
}

async function listDmCallsForUser(userId, { limit = 50 } = {}) {
  const capped = Math.min(Math.max(Number(limit) || 50, 1), 100);
  const { data, error } = await supabase
    .from("dm_calls")
    .select("id, caller_id, callee_id, call_type, status, started_at, ended_at, duration_seconds, created_at")
    .or(`caller_id.eq.${userId},callee_id.eq.${userId}`)
    .order("created_at", { ascending: false })
    .limit(capped);

  if (error) throw error;

  const rows = data || [];
  const peerIds = [
    ...new Set(rows.flatMap((r) => [r.caller_id, r.callee_id]).filter((id) => id && id !== userId)),
  ];
  let peersById = {};
  if (peerIds.length) {
    const { data: users } = await supabase
      .from("users")
      .select("id, username, display_name, avatar_url, updated_at")
      .in("id", peerIds);
    peersById = Object.fromEntries((users || []).map((u) => [u.id, u]));
  }
  return rows.map((r) => ({
    ...mapCallRow(r, userId, peersById),
    kind: "dm",
  }));
}

function mapGroupCallRow(row, userId, { joined = true } = {}) {
  const status =
    row.status === "active" && !row.ended_at
      ? "active"
      : joined
        ? "completed"
        : "missed";
  const direction = row.started_by === userId ? "outgoing" : "incoming";
  return {
    id: `group-${row.id}`,
    kind: "group",
    direction,
    callType: row.call_type === "video" ? "video" : "voice",
    status,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    durationSeconds: row.duration_seconds ?? null,
    createdAt: row.ended_at || row.started_at || row.created_at,
    participantCount: row.participant_count ?? null,
    initiatorId: row.started_by,
    peer: null,
    group: {
      id: row.group_id,
      name: row.group_name || "Group",
      avatarUrl: row.group_avatar_url || null,
    },
  };
}

async function listGroupCallsForUser(userId, { limit = 50 } = {}) {
  const capped = Math.min(Math.max(Number(limit) || 50, 1), 100);

  // Calls the user actually joined
  const joined = await supabase
    .from("group_call_participants")
    .select(
      `
      call_id,
      group_calls (
        id, group_id, started_by, call_type, started_at, ended_at,
        duration_seconds, participant_count, status
      )
    `
    )
    .eq("user_id", userId)
    .limit(capped);

  let joinedRows = [];
  if (!joined.error) {
    joinedRows = (joined.data || [])
      .map((r) => r.group_calls)
      .filter(Boolean);
  } else {
    // Fallback without embed: two-step query
    console.warn("[callLog] group participant embed failed:", joined.error.message);
    const { data: parts } = await supabase
      .from("group_call_participants")
      .select("call_id")
      .eq("user_id", userId)
      .limit(capped);
    const callIds = [...new Set((parts || []).map((p) => p.call_id).filter(Boolean))];
    if (callIds.length) {
      const { data: calls } = await supabase
        .from("group_calls")
        .select("id, group_id, started_by, call_type, started_at, ended_at, duration_seconds, participant_count, status")
        .in("id", callIds);
      joinedRows = calls || [];
    }
  }

  const joinedIds = new Set(joinedRows.map((r) => r.id));

  // Missed: ended group calls in my groups that I never joined
  const { data: memberships } = await supabase
    .from("group_members")
    .select("group_id")
    .eq("user_id", userId);
  const groupIds = (memberships || []).map((m) => m.group_id).filter(Boolean);

  let missedRows = [];
  if (groupIds.length) {
    const { data: endedCalls, error: endedErr } = await supabase
      .from("group_calls")
      .select("id, group_id, started_by, call_type, started_at, ended_at, duration_seconds, participant_count, status")
      .in("group_id", groupIds)
      .not("ended_at", "is", null)
      .order("ended_at", { ascending: false })
      .limit(capped);
    if (!endedErr) {
      missedRows = (endedCalls || []).filter((c) => !joinedIds.has(c.id) && c.started_by !== userId);
    }
  }

  const allRows = [...joinedRows, ...missedRows];
  const uniqueById = new Map();
  for (const row of allRows) {
    if (!row?.id || uniqueById.has(row.id)) continue;
    uniqueById.set(row.id, {
      row,
      joined: joinedIds.has(row.id),
    });
  }

  const groupIdSet = [...new Set([...uniqueById.values()].map((x) => x.row.group_id).filter(Boolean))];
  let groupsById = {};
  if (groupIdSet.length) {
    const { data: groups } = await supabase
      .from("groups")
      .select("id, name, avatar_url")
      .in("id", groupIdSet);
    groupsById = Object.fromEntries((groups || []).map((g) => [g.id, g]));
  }

  const mapped = [...uniqueById.values()].map(({ row, joined: didJoin }) => {
    const g = groupsById[row.group_id];
    return mapGroupCallRow(
      {
        ...row,
        group_name: g?.name,
        group_avatar_url: g?.avatar_url,
      },
      userId,
      { joined: didJoin }
    );
  });

  mapped.sort((a, b) => {
    const ta = new Date(a.endedAt || a.startedAt || a.createdAt || 0).getTime();
    const tb = new Date(b.endedAt || b.startedAt || b.createdAt || 0).getTime();
    return tb - ta;
  });

  return mapped.slice(0, capped);
}

/**
 * Unified DM + group call history for the Calls tab.
 */
async function listCallsForUser(userId, { limit = 50 } = {}) {
  const capped = Math.min(Math.max(Number(limit) || 50, 1), 100);
  const [dms, groups] = await Promise.all([
    listDmCallsForUser(userId, { limit: capped }),
    listGroupCallsForUser(userId, { limit: capped }).catch((err) => {
      console.warn("[callLog] group list failed:", err?.message || err);
      return [];
    }),
  ]);

  const merged = [...dms, ...groups].sort((a, b) => {
    const ta = new Date(a.endedAt || a.createdAt || a.startedAt || 0).getTime();
    const tb = new Date(b.endedAt || b.createdAt || b.startedAt || 0).getTime();
    return tb - ta;
  });

  return merged.slice(0, capped);
}

/** Build a public group-call history record after a call ends (for socket push). */
function buildGroupCallHistoryRecord({ callRow, group, meId, joined = true }) {
  if (!callRow?.id) return null;
  return mapGroupCallRow(
    {
      ...callRow,
      group_name: group?.name,
      group_avatar_url: group?.avatarUrl || group?.avatar_url,
    },
    meId,
    { joined }
  );
}

/** Test helper: forget every in-memory DM call. */
function _resetDmCallStateForTests() {
  pendingDmCalls.clear();
  recentlyEndedPairs.clear();
  earlyCallerIce.clear();
}

module.exports = {
  // Hybrid server: replicated across nodes by lib/cluster/sharedStore.js.
  pendingDmCalls,
  recentlyEndedPairs,
  _resetDmCallStateForTests,
  trackOffer,
  noteOfferStarted,
  hasOfferInFlight,
  dropEarlyIce,
  bufferedCallerIceCount,
  iceUfrag,
  sameIceSession,
  EARLY_ICE_MS,
  getPendingCall,
  endedRecently,
  bufferCallerIce,
  listRingingForCallee,
  callStateByUuid,
  findRingingByUuid,
  markCalleeAnswering,
  isResumable,
  markAnswered,
  dropCrossedRing,
  bufferCalleeIce,
  answerReplayForCaller,
  ANSWER_REPLAY_MS,
  ensureActiveDmCall,
  isActiveDmCall,
  listActiveDmCalls,
  finalizeCall,
  listCallsForUser,
  listDmCallsForUser,
  listGroupCallsForUser,
  buildGroupCallHistoryRecord,
  mapGroupCallRow,
};
