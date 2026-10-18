"use strict";

/** Pure poll rules. Run: node frontend/backend/lib/pollCore.selftest.cjs */

const assert = require("node:assert/strict");
const core = require("./pollCore");

// Validation
let r = core.normalizePollInput({ question: "  Cuma akşamı   ne oynayalım? ", options: [{ text: "Fortnite", emoji: "🪂" }, "Minecraft", "", { text: "Rocket League", emoji: "abc" }] });
assert.equal(r.ok, true);
assert.equal(r.poll.question, "Cuma akşamı ne oynayalım?");
assert.deepEqual(r.poll.options, [{ text: "Fortnite", emoji: "🪂" }, { text: "Minecraft", emoji: null }, { text: "Rocket League", emoji: null }]);
assert.equal(r.poll.durationSeconds, 86400, "default 24 sa");
assert.equal(r.poll.multi, false);
assert.equal(core.normalizePollInput({ question: "x", options: ["a", "a"] }).code, "DUPLICATE_OPTION");
assert.equal(core.normalizePollInput({ question: "x", options: ["a", "A"] }).code, "DUPLICATE_OPTION", "case-insensitive");
assert.equal(core.normalizePollInput({ question: "x", options: ["a"] }).code, "TOO_FEW_OPTIONS");
assert.equal(core.normalizePollInput({ question: "x", options: Array.from({ length: 11 }, (_, i) => `o${i}`) }).code, "TOO_MANY_OPTIONS");
assert.equal(core.normalizePollInput({ question: "", options: ["a", "b"] }).code, "BAD_QUESTION");
assert.equal(core.normalizePollInput({ question: "x", options: ["a", "b"], durationSeconds: 999 }).poll.durationSeconds, 86400, "unknown duration → default");
assert.equal(core.normalizePollInput({ question: "x", options: ["a", "b"], durationSeconds: 3600 }).poll.durationSeconds, 3600);
assert.equal(core.normalizePollInput({ question: "q".repeat(400), options: ["a", "b"] }).poll.question.length, 300);
assert.equal(core.normalizePollInput(null).ok, false);

// /poll quick form
assert.deepEqual(core.parsePollArgs("Pizza? | Evet | Hayır"), { question: "Pizza?", options: ["Evet", "Hayır"] });
assert.equal(core.parsePollArgs("only | one"), null);
assert.equal(core.parsePollArgs(""), null);

// Fallback text (old clients, previews): plain, no markdown.
assert.equal(core.pollFallbackText({ question: "Q?", options: [{ text: "A", emoji: "🪂" }, { text: "B" }] }), "📊 Anket: Q?\n1. 🪂 A\n2. B");

// Snapshot: results hidden until the viewer votes; voter total always visible.
const poll = { id: "p1", scope: "server", server_message_id: "m1", creator_id: "u1", question: "Q?", allow_multiselect: false, anonymous: false, ends_at: new Date(Date.now() + 3600e3).toISOString(), closed_at: null, version: 3 };
const options = [{ id: "o2", position: 1, text: "B" }, { id: "o1", position: 0, text: "A", emoji: "🪂" }];
const tally = { counts: { o1: 14, o2: 18 }, voters: 32, mine: [] };
let s = core.buildPollSnapshot(poll, options, tally, { viewerId: "u2" });
assert.equal(s.revealed, false);
assert.equal(s.voters, 32);
assert.deepEqual(s.options.map((o) => o.id), ["o1", "o2"], "sorted by position");
assert.ok(s.options.every((o) => o.votes === null && o.percent === null), "no counts before voting");
assert.equal(s.totalVotes, null);
assert.equal(s.canVote, true);
assert.equal(s.canClose, false, "not creator, not mod");
s = core.buildPollSnapshot(poll, options, { ...tally, mine: ["o1"] }, { viewerId: "u2" });
assert.equal(s.revealed, true);
assert.deepEqual(s.options.map((o) => [o.votes, o.percent]), [[14, 44], [18, 56]]);
assert.deepEqual(s.myVotes, ["o1"]);
assert.equal(s.options.some((o) => o.winner), false, "no winner while open");

// Multi-select: % of voters (can exceed 100 in sum).
const multi = { ...poll, allow_multiselect: true };
s = core.buildPollSnapshot(multi, options, { counts: { o1: 8, o2: 6 }, voters: 10, mine: ["o1", "o2"] }, { viewerId: "u2" });
assert.deepEqual(s.options.map((o) => o.percent), [80, 60]);
assert.equal(s.totalVotes, 14);

// Creator: may close; may edit only before the first vote.
s = core.buildPollSnapshot(poll, options, { counts: {}, voters: 0, mine: [] }, { viewerId: "u1" });
assert.equal(s.canClose, true);
assert.equal(s.canEdit, true);
s = core.buildPollSnapshot(poll, options, tally, { viewerId: "u1" });
assert.equal(s.canEdit, false, "no edit after the first vote");
// Moderator (MANAGE_MESSAGES) may close, not edit.
s = core.buildPollSnapshot(poll, options, tally, { viewerId: "u9", canManage: true });
assert.equal(s.canClose, true);
assert.equal(s.canEdit, false);
// Timed-out viewer: sees, cannot vote.
assert.equal(core.buildPollSnapshot(poll, options, tally, { viewerId: "u2", canVote: false }).canVote, false);

// Ended (closed or past ends_at): results for everyone, winner(s) marked, no actions.
const ended = { ...poll, ends_at: new Date(Date.now() - 1000).toISOString() };
s = core.buildPollSnapshot(ended, options, tally, { viewerId: "u2" });
assert.equal(s.closed, true);
assert.equal(s.revealed, true);
assert.equal(s.closeReason, "expired");
assert.deepEqual(s.options.filter((o) => o.winner).map((o) => o.id), ["o2"]);
assert.equal(s.canVote, false);
assert.equal(s.canClose, false);
assert.equal(core.pollEndText(s), "📊 “Q?” anketi sona erdi · Kazanan: B (%56)");
const tie = core.buildPollSnapshot({ ...ended }, options, { counts: { o1: 5, o2: 5 }, voters: 10, mine: [] }, {});
assert.equal(core.pollEndText(tie), "📊 “Q?” anketi sona erdi · Berabere: 🪂 A, B (%50)");
assert.equal(core.pollEndText(core.buildPollSnapshot(ended, options, { counts: {}, voters: 0, mine: [] }, {})), "📊 “Q?” anketi sona erdi · Kimse oy vermedi");

// Postgres RAISE → Turkish message.
assert.deepEqual(core.voteError({ message: "POLL_CLOSED" }), { code: "POLL_CLOSED", message: "Bu anket sona erdi." });
assert.equal(core.voteError({ message: "weird" }).code, "POLL_ERROR");
assert.equal(core.percent(1, 3), 33);
assert.equal(core.percent(1, 0), 0);

console.log("pollCore selftest ok");
