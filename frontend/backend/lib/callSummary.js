"use strict";

/**
 * Ended-call summary cards ("Voice call · 2m 5s · 2 participants joined").
 *
 * DM summaries are stored as JSON in dm_messages.content; group summaries as
 * JSON in group_messages.content (message_type = "call_summary").
 *
 * Since 2.9.88 DM chat payloads were tagged `type: "call_summary"` but the
 * numbers stayed inside the JSON `text`, so the chat rendered "< 1s" and
 * "0 participants joined" for every DM call. `callSummaryMessageFields`
 * lifts the fields onto the message so every client (old ones included)
 * renders the real values.
 */

const SUMMARY_FIELDS = [
  "callType",
  "status",
  "initiatorId",
  "initiatorUsername",
  "participantCount",
  "durationSeconds",
  "durationMinutes",
  "connectedAt",
  "endedAt",
  "hangout",
];

/** Parsed call summary from stored JSON text, or null. */
function parseCallSummaryText(text) {
  const raw = String(text || "").trim();
  if (!raw.startsWith("{") || !raw.includes('"call_summary"')) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && parsed.type === "call_summary" ? parsed : null;
  } catch {
    return null;
  }
}

/** Only the summary fields (no id / type / timestamps of the message itself). */
function callSummaryMessageFields(summary) {
  if (!summary || typeof summary !== "object") return {};
  const out = {};
  for (const key of SUMMARY_FIELDS) {
    if (summary[key] !== undefined) out[key] = summary[key];
  }
  return out;
}

function wholeSeconds(ms) {
  return Math.max(0, Math.floor(Number(ms) / 1000) || 0);
}

/**
 * DM summary from a finalized dm call record (lib/dmCallLog.finalizeCall).
 * Answered calls: 2 participants, duration = answer → end.
 * Missed / declined / cancelled: 1 participant, no duration.
 */
function buildDmCallSummary(record, initiatorUsername) {
  const status = record?.status || "missed";
  const answered = status === "completed";
  const durationSeconds = answered ? Math.max(0, Math.round(Number(record.durationSeconds) || 0)) : 0;
  return {
    type: "call_summary",
    callType: record?.callType === "video" ? "video" : "voice",
    status,
    initiatorId: record?.callerId || null,
    initiatorUsername: initiatorUsername || "User",
    participantCount: answered ? 2 : 1,
    durationSeconds,
    durationMinutes: Math.floor(durationSeconds / 60),
    connectedAt: answered ? record?.startedAt || null : null,
    endedAt: record?.endedAt || new Date().toISOString(),
  };
}

/**
 * Group call bookkeeping: a participant joined (accepted the ring or joined
 * from the banner). The call counts as connected from the moment a second
 * distinct person is in it.
 */
function markGroupParticipantJoined(activeCall, userId, nowMs) {
  if (!activeCall || !userId) return;
  if (!activeCall.participants) activeCall.participants = new Set();
  if (!activeCall.allParticipants) activeCall.allParticipants = new Set();
  activeCall.participants.add(userId);
  activeCall.allParticipants.add(userId);
  if (!activeCall.connectedAt && activeCall.allParticipants.size >= 2) {
    activeCall.connectedAt = nowMs;
  }
}

/**
 * Summary numbers for an ending group call.
 * Duration runs from when the first other person joined (not from the ring),
 * participants = distinct people who actually joined (initiator included).
 * Nobody else ever joined → "missed" (or plain 0s for an open hangout room).
 */
function computeGroupCallSummary(activeCall, nowMs) {
  const participantCount = activeCall?.allParticipants?.size || 0;
  const connectedAt =
    activeCall?.connectedAt || (participantCount >= 2 ? activeCall?.startTime : null) || null;
  const durationSeconds = connectedAt ? wholeSeconds(nowMs - connectedAt) : 0;
  let status = "completed";
  if (!connectedAt) status = activeCall?.hangout ? "completed" : "missed";
  return {
    participantCount,
    durationSeconds,
    durationMinutes: Math.floor(durationSeconds / 60),
    connectedAt: connectedAt ? new Date(connectedAt).toISOString() : null,
    status,
  };
}

module.exports = {
  SUMMARY_FIELDS,
  parseCallSummaryText,
  callSummaryMessageFields,
  buildDmCallSummary,
  markGroupParticipantJoined,
  computeGroupCallSummary,
};
