// Run: node src/lib/callSummary.selftest.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  resolveCallSummary,
  summaryDurationSeconds,
  formatSummaryDuration,
  summaryParticipantCount,
} from "./callSummary.js";

// Exact DM shape the backend has sent since 2.9.88: tagged type, numbers only
// inside the JSON text. Up to 2.9.142 this rendered "< 1s · 0 participants".
const storedJson = JSON.stringify({
  type: "call_summary",
  callType: "voice",
  status: "completed",
  initiatorId: "u-a",
  initiatorUsername: "alice",
  participantCount: 2,
  durationSeconds: 56,
  durationMinutes: 0,
  endedAt: "2026-10-08T19:01:09.000Z",
});
const legacyDm = {
  id: "m1",
  from: { id: "u-a", username: "alice" },
  text: storedJson,
  type: "call_summary",
  timestamp: "2026-10-08T19:01:09.739Z",
};
const s1 = resolveCallSummary(legacyDm);
assert.equal(s1.type, "call_summary");
assert.equal(s1.id, "m1");
assert.equal(s1.durationSeconds, 56);
assert.equal(s1.participantCount, 2);
assert.equal(s1.status, "completed");
assert.equal(formatSummaryDuration(summaryDurationSeconds(s1)), "56s");
assert.equal(summaryParticipantCount(s1), 2);

// New backend payload: fields lifted onto the message.
const lifted = { ...legacyDm, durationSeconds: 754, participantCount: 2, status: "completed", durationMinutes: 12 };
const s2 = resolveCallSummary(lifted);
assert.equal(formatSummaryDuration(summaryDurationSeconds(s2)), "12m 34s");

// Untagged legacy raw-JSON row is still recovered.
const s3 = resolveCallSummary({ id: "m3", text: storedJson, timestamp: "t" });
assert.equal(s3.type, "call_summary");
assert.equal(s3.durationSeconds, 56);

// Missed / declined: 1 participant, no duration.
const missed = resolveCallSummary({
  id: "m4",
  type: "call_summary",
  text: JSON.stringify({ type: "call_summary", status: "missed", participantCount: 1, durationSeconds: 0 }),
});
assert.equal(missed.status, "missed");
assert.equal(summaryParticipantCount(missed), 1);
assert.equal(formatSummaryDuration(summaryDurationSeconds(missed)), null); // → "< 1s"

// Group summaries (already structured) pass through unchanged.
const group = resolveCallSummary({ id: "g1", type: "call_summary", callType: "video", participantCount: 3, durationSeconds: 3725 });
assert.equal(group.participantCount, 3);
assert.equal(formatSummaryDuration(summaryDurationSeconds(group)), "1h 2m");

// Fallbacks for rows without a count; minutes-only rows.
assert.equal(summaryParticipantCount({ status: "completed" }), 2);
assert.equal(summaryParticipantCount({ status: "declined" }), 1);
assert.equal(summaryDurationSeconds({ durationMinutes: 3 }), 180);
assert.equal(formatSummaryDuration(0), null);
assert.equal(formatSummaryDuration(60), "1m");

// Plain messages are not summaries.
assert.equal(resolveCallSummary({ id: "x", text: "hello" }), null);
assert.equal(resolveCallSummary({ id: "y", text: "{not json" }), null);
assert.equal(resolveCallSummary(null), null);

// The chat list must resolve every message through the helper (the old
// "only parse when not tagged" branch is what broke DM cards).
const list = readFileSync(fileURLToPath(new URL("../components/chat/MessageList.jsx", import.meta.url)), "utf8");
assert.match(list, /resolveCallSummary\(msg\)/);
assert.doesNotMatch(list, /msg\?\.type !== "call_summary" && typeof msg\?\.text === "string"/);
const bubble = readFileSync(fileURLToPath(new URL("../components/chat/CallSummaryBubble.jsx", import.meta.url)), "utf8");
assert.match(bubble, /summaryParticipantCount\(summary\)/);
assert.doesNotMatch(bubble, /participantCount \?\? 0/);

console.log("callSummary selftest: ok");
