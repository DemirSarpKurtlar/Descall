"use strict";

const crypto = require("crypto");
const supabase = require("../db/supabase");

/** @type {Map<string, object>} key = `${callerId}:${calleeId}` */
const pendingDmCalls = new Map();

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

/** Still worth replaying to a (VoIP-woken / just-unlocked) callee? */
function isResumable(call, now = Date.now()) {
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
  const existing = findPending(callerId, calleeId);
  if (renegotiation && existing && existing.call.status === "active") {
    if (callType === "video") existing.call.callType = "video";
    return { callUuid: existing.call.callUuid || "", renegotiation: true };
  }
  const prev = pendingDmCalls.get(key);
  const prevAge = prev ? Date.now() - Date.parse(prev.offeredAt || 0) : Infinity;
  const reuseUuid =
    prev && prev.callUuid && prev.status === "ringing" && prevAge < RING_UUID_REUSE_MS;
  const callUuid = reuseUuid ? prev.callUuid : newCallUuid();
  pendingDmCalls.set(key, {
    callerId,
    calleeId,
    callType: callType === "video" ? "video" : "voice",
    status: "ringing",
    offeredAt: new Date().toISOString(),
    startedAt: null,
    callUuid,
    offer: offer || null,
    callerIce: [],
  });
  return { callUuid, renegotiation: false };
}

/** Pending record for caller → callee (either direction), or null. */
function getPendingCall(userA, userB) {
  return findPending(userA, userB)?.call || null;
}

/** Remember caller ICE while ringing so a late (VoIP-woken) callee gets it too. */
function bufferCallerIce({ callerId, calleeId, candidate }) {
  const call = pendingDmCalls.get(pendingKey(callerId, calleeId));
  if (!call || call.status !== "ringing" || !candidate) return;
  if (call.callerIce.length < MAX_BUFFERED_ICE) call.callerIce.push(candidate);
}

/** Ringing offers addressed to `calleeId` that are still fresh enough to answer. */
function listRingingForCallee(calleeId) {
  const out = [];
  const now = Date.now();
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
  if (!call.answeringAt) call.answeringAt = Date.now();
  return call;
}

function markAnswered({ callerId, calleeId }) {
  const hit = findPending(callerId, calleeId);
  if (!hit) return;
  hit.call.status = "active";
  hit.call.startedAt = hit.call.startedAt || new Date().toISOString();
  hit.call.offer = null;
  hit.call.callerIce = [];
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
      hit.call.startedAt = hit.call.startedAt || new Date().toISOString();
    }
    return hit.call;
  }
  const call = {
    callerId: userId,
    calleeId: peerId,
    callType: "voice",
    status: "active",
    offeredAt: new Date().toISOString(),
    startedAt: new Date().toISOString(),
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
  const hit = findPending(userA, userB);
  if (!hit) return null;
  pendingDmCalls.delete(hit.key);

  const call = hit.call;
  const endedAt = new Date();
  const startedAt = call.startedAt ? new Date(call.startedAt) : null;
  let finalStatus = status;
  if (!finalStatus) {
    finalStatus = startedAt ? "completed" : "missed";
  }
  if (finalStatus === "completed" && !startedAt) {
    finalStatus = "missed";
  }
  if ((finalStatus === "cancelled" || finalStatus === "missed") && startedAt) {
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

module.exports = {
  trackOffer,
  getPendingCall,
  bufferCallerIce,
  listRingingForCallee,
  callStateByUuid,
  findRingingByUuid,
  markCalleeAnswering,
  isResumable,
  markAnswered,
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
