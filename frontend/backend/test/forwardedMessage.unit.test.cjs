"use strict";

/**
 * Messaging phase 4: forwarded messages. The mark rides in reply_to as
 * { forwarded: true } on all three send paths, a forward never quotes, and
 * group history survives a database without group_messages.reply_to.
 *   node frontend/backend/test/forwardedMessage.unit.test.cjs
 */

const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { forwardedReplyMeta, isForwardedMeta, isMissingColumn, isForwardRequest } = require("../lib/forwardedMessage");

// Only a literal `true` asks for a forward (no truthy strings from old clients).
assert.deepEqual(forwardedReplyMeta(true), { forwarded: true });
assert.equal(forwardedReplyMeta("true"), null);
assert.equal(forwardedReplyMeta(1), null);
assert.equal(forwardedReplyMeta(undefined), null);
assert.equal(isForwardRequest(true), true);
// Each call is a fresh object (never the frozen constant, which a later spread could not extend).
const a = forwardedReplyMeta(true);
a.extra = 1;
assert.deepEqual(forwardedReplyMeta(true), { forwarded: true });

// The mark is told apart from a real quote by the missing id.
assert.equal(isForwardedMeta({ forwarded: true }), true);
assert.equal(isForwardedMeta({ forwarded: true, id: "m1" }), false);
assert.equal(isForwardedMeta({ id: "m1", text: "x" }), false);
assert.equal(isForwardedMeta(null), false);

// Missing column detection (PostgREST schema cache and Postgres codes).
assert.equal(isMissingColumn({ code: "PGRST204", message: "Could not find the 'reply_to' column of 'group_messages' in the schema cache" }, "reply_to"), true);
assert.equal(isMissingColumn({ code: "42703", message: 'column group_messages.reply_to does not exist' }, "reply_to"), true);
assert.equal(isMissingColumn({ code: "23505", message: "duplicate key" }, "reply_to"), false);
assert.equal(isMissingColumn({ code: "42703", message: "column x does not exist" }, "reply_to"), false);
assert.equal(isMissingColumn(null, "reply_to"), false);

// Wiring: every send path takes `forwarded`, and the forward mark wins over any replyTo.
const read = (p) => fs.readFileSync(path.join(__dirname, "..", p), "utf8");
const dm = read("socket/handlers.js");
assert.ok(/socket\.on\("dm:send", async \(\{[^}]*\breplyTo, forwarded,/.test(dm), "dm:send reads forwarded");
assert.ok(dm.includes("const replyMeta = forwardedReplyMeta(forwarded) || await resolveDmReplyMeta(supabase, replyTo, myId, toUserId)"), "DM: the mark replaces a quote; quotes come from the database");
const group = read("socket/groupHandlers.js");
assert.ok(/socket\.on\("group:message", async \(\{[^}]*\breplyTo, forwarded,/.test(group), "group:message reads forwarded");
assert.ok(group.includes("const replyMeta = forwardedReplyMeta(forwarded) || await resolveGroupReplyMeta(supabase, replyTo, groupId)"), "group: quotes come from the database");
assert.ok(group.includes(".insert(replyMeta ? { ...baseRow, reply_to: replyMeta } : baseRow)"), "group reply_to is stored");
assert.ok(/isMissingColumn\(error, "reply_to"\)\) \{[\s\S]{0,260}\.insert\(baseRow\)/.test(group), "group send retries without reply_to before the migration");
const channel = read("socket/serverChannelHandlers.js");
assert.ok(/async \(\{[^}]*\breplyTo, forwarded, poll: pollInput \} = \{\}\) =>/.test(channel), "server:channel:message reads forwarded");
assert.ok(channel.includes("const replyMeta = forwardedReplyMeta(forwarded) || await resolveServerReplyMeta(replyTo, channelId);"));
const groups = read("routes/groups.js");
assert.ok(groups.includes("messages = await withGroupReplyMeta(messages);"), "group history merges reply_to");
assert.ok(/if \(isMissingColumn\(error, "reply_to"\)\) groupReplyColumn = false;\s*return rows;/.test(groups), "history keeps working without the column");

// The group history helper, against a fake client.
(async () => {
  const src = groups;
  const start = src.indexOf("let groupReplyColumn = true;");
  const end = src.indexOf("const GROUP_MESSAGE_COLUMNS");
  const make = (supabase) => new Function("supabase", "isMissingColumn", `${src.slice(start, end)}; return withGroupReplyMeta;`)(supabase, isMissingColumn);
  const rows = [{ id: "g1", content: "a" }, { id: "g2", content: "b" }];
  const ok = make({ from: () => ({ select: () => ({ in: async () => ({ data: [{ id: "g2", reply_to: { forwarded: true } }], error: null }) }) }) });
  const merged = await ok(rows);
  assert.deepEqual(merged[1].reply_to, { forwarded: true });
  assert.equal(merged[0].reply_to, undefined);
  let calls = 0;
  const missing = make({ from: () => ({ select: () => ({ in: async () => { calls += 1; return { data: null, error: { code: "42703", message: "column group_messages.reply_to does not exist" } }; } }) }) });
  assert.equal(await missing(rows), rows, "no column: rows unchanged");
  assert.equal(await missing(rows), rows);
  assert.equal(calls, 1, "the missing column is remembered (no query per page)");
  console.log("forwardedMessage unit test OK");
})().catch((err) => { console.error(err); process.exit(1); });
