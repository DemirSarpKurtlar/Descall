/**
 * Ended-call summary cards in chat.
 *
 * DM summaries arrive as a message whose `text` is the stored JSON and which
 * is already tagged `type: "call_summary"`. Up to 2.9.142 the chat only parsed
 * the JSON for untagged rows, so every tagged DM card rendered without its
 * numbers ("< 1s", "0 participants joined"). Always merge the JSON in.
 */

const SUMMARY_KEYS = [
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

function parseSummaryJson(text) {
  if (typeof text !== "string") return null;
  const raw = text.trim();
  if (!raw.startsWith("{")) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && (parsed.type === "call_summary" || parsed.callType || parsed.durationSeconds !== undefined)) {
      return parsed;
    }
  } catch {
    /* not a summary */
  }
  return null;
}

/**
 * Summary object for a chat message, or null when it is not a call summary.
 * Fields already on the message win; missing ones come from the JSON text.
 */
export function resolveCallSummary(msg) {
  if (!msg) return null;
  const parsed = parseSummaryJson(msg.text) || parseSummaryJson(msg.content);
  if (msg.type !== "call_summary" && !parsed) return null;
  const merged = { ...(parsed || {}) };
  for (const key of SUMMARY_KEYS) {
    if (msg[key] !== undefined && msg[key] !== null) merged[key] = msg[key];
  }
  return {
    ...msg,
    ...merged,
    id: msg.id || parsed?.id,
    timestamp: msg.timestamp || parsed?.endedAt,
    type: "call_summary",
  };
}

/** Whole seconds of a summary (durationSeconds, else durationMinutes). */
export function summaryDurationSeconds(summary) {
  const secs = Number(summary?.durationSeconds);
  if (Number.isFinite(secs) && secs > 0) return Math.floor(secs);
  const mins = Number(summary?.durationMinutes);
  if (Number.isFinite(mins) && mins > 0) return Math.floor(mins * 60);
  return 0;
}

/** "1h 2m", "2m 5s", "42s", or null for < 1 s. */
export function formatSummaryDuration(totalSeconds) {
  const total = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  if (total < 1) return null;
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h${m > 0 ? ` ${m}m` : ""}`;
  if (m > 0) return `${m}m${s > 0 ? ` ${s}s` : ""}`;
  return `${s}s`;
}

/** People who actually joined; old DM rows without a count fall back by status. */
export function summaryParticipantCount(summary) {
  const n = Number(summary?.participantCount);
  if (Number.isFinite(n) && n > 0) return Math.floor(n);
  if (summary?.status === "completed") return 2;
  if (summary?.status === "missed" || summary?.status === "declined" || summary?.status === "cancelled") return 1;
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
}
