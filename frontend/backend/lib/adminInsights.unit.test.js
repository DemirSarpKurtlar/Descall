"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  convKey,
  parseConvKey,
  previewFromDmRow,
  buildUserStats,
  rankUsers,
  summarizeLeaderboard,
  buildConversations,
  mapAdminDmMessage,
} = require("./adminInsights");

const now = Date.parse("2026-08-25T22:00:00.000Z");

test("conversation keys are order-independent", () => {
  assert.equal(convKey("b", "a"), "a::b");
  assert.deepEqual(parseConvKey("a::b"), { a: "a", b: "b" });
  assert.equal(parseConvKey("same::same"), null);
});

test("leaderboard counts persisted sends, not alphabetical zeros", () => {
  const stats = buildUserStats({
    nowMs: now,
    windowMs: 0,
    dmRows: [
      { from_user_id: "admin", to_user_id: "yigit", created_at: "2026-08-25T20:00:00.000Z" },
      { from_user_id: "admin", to_user_id: "yigit", created_at: "2026-08-25T21:00:00.000Z" },
      { from_user_id: "yigit", to_user_id: "admin", created_at: "2026-08-25T21:30:00.000Z" },
    ],
    groupRows: [
      { sender_id: "admin", created_at: "2026-08-25T19:00:00.000Z" },
    ],
    serverRows: [],
  });
  const ranked = rankUsers({
    stats,
    users: [
      { id: "aa5335", username: "aa5335", last_seen: null },
      { id: "admin", username: "admin", last_seen: "2026-08-25T21:50:00.000Z" },
      { id: "yigit", username: "yigit", last_seen: "2026-08-25T21:40:00.000Z" },
    ],
    presenceIds: ["admin"],
    nowMs: now,
    sort: "messages",
    limit: 20,
  });
  assert.equal(ranked[0].username, "admin");
  assert.equal(ranked[0].messageCount, 3);
  assert.equal(ranked[0].dmCount, 2);
  assert.equal(ranked[0].groupCount, 1);
  assert.equal(ranked[1].username, "yigit");
  assert.equal(ranked[1].messageCount, 1);
  assert.ok(!ranked.some((r) => r.username === "aa5335"));
});

test("activity rank puts a more recent last_seen above an older one", () => {
  const stats = buildUserStats({
    nowMs: now,
    windowMs: 0,
    dmRows: [],
    groupRows: [],
    serverRows: [],
  });
  const ranked = rankUsers({
    stats,
    users: [
      { id: "admin", username: "admin", last_seen: "2026-08-25T21:59:00.000Z" },
      { id: "demir", username: "demir", last_seen: "2026-08-25T21:59:55.000Z" },
    ],
    presenceIds: ["admin"],
    nowMs: now,
    sort: "activity",
    limit: 10,
  });
  assert.equal(ranked[0].username, "admin");
  assert.equal(ranked[0].isOnline, true);
  assert.equal(ranked[0].rank, 1);
  assert.equal(ranked[1].username, "demir");
  assert.ok(ranked[1].lastActiveMs > Date.parse("2026-08-25T21:59:00.000Z"));
  assert.equal(ranked[0].lastActiveAt, "2026-08-25T21:59:00.000Z");
});

test("activity among offline users is last_seen recency, not alphabetical", () => {
  const ranked = rankUsers({
    stats: new Map(),
    users: [
      { id: "aa5335", username: "aa5335", last_seen: "2026-08-01T00:00:00.000Z" },
      { id: "demir", username: "demir", last_seen: "2026-08-25T21:59:55.000Z" },
      { id: "admin", username: "admin", last_seen: "2026-08-25T21:59:00.000Z" },
    ],
    presenceIds: [],
    nowMs: now,
    sort: "activity",
    limit: 10,
  });
  assert.deepEqual(ranked.map((r) => r.username), ["demir", "admin", "aa5335"]);
});

test("summary counts every sender, not only the sliced leaderboard", () => {
  const stats = buildUserStats({
    nowMs: now,
    windowMs: 0,
    dmRows: [
      { from_user_id: "a", to_user_id: "b", created_at: "2026-08-25T20:00:00.000Z" },
      { from_user_id: "c", to_user_id: "d", created_at: "2026-08-25T20:01:00.000Z" },
    ],
    groupRows: [],
    serverRows: [],
  });
  const ranked = rankUsers({ stats, users: [], nowMs: now, sort: "messages", limit: 1 });
  const summary = summarizeLeaderboard(ranked, {
    stats,
    dmRows: [
      { from_user_id: "a", to_user_id: "b", created_at: "2026-08-25T20:00:00.000Z" },
      { from_user_id: "c", to_user_id: "d", created_at: "2026-08-25T20:01:00.000Z" },
    ],
    nowMs: now,
    windowMs: 0,
    presenceCount: 0,
  });
  assert.equal(ranked.length, 1);
  assert.equal(summary.messagesInWindow, 2);
  assert.equal(summary.sendersInWindow, 2);
  assert.equal(summary.dmThreads, 2);
});

test("window filter drops older messages", () => {
  const stats = buildUserStats({
    nowMs: now,
    windowMs: 24 * 60 * 60 * 1000,
    dmRows: [
      { from_user_id: "old", created_at: "2026-08-01T00:00:00.000Z" },
      { from_user_id: "new", created_at: "2026-08-25T12:00:00.000Z" },
    ],
    groupRows: [],
    serverRows: [],
  });
  assert.equal(stats.get("old"), undefined);
  assert.equal(stats.get("new").messageCount, 1);
});

test("DM inbox resolves people and last preview instead of raw keys", () => {
  const threads = buildConversations({
    nowMs: now,
    users: [
      { id: "admin", username: "admin", display_name: "Admin" },
      { id: "yigit", username: "yigit" },
    ],
    presenceIds: ["admin"],
    dmRows: [
      {
        id: "m1",
        from_user_id: "yigit",
        to_user_id: "admin",
        content: "sa",
        created_at: "2026-08-25T20:00:00.000Z",
      },
      {
        id: "m2",
        from_user_id: "admin",
        to_user_id: "yigit",
        content: "as",
        created_at: "2026-08-25T21:00:00.000Z",
      },
    ],
  });
  assert.equal(threads.length, 1);
  assert.equal(threads[0].messageCount, 2);
  assert.equal(threads[0].last.preview, "as");
  assert.deepEqual(threads[0].users.map((u) => u.username).sort(), ["admin", "yigit"]);
  assert.equal(threads[0].users.find((u) => u.username === "admin").isOnline, true);
});

test("media rows get a human preview", () => {
  assert.equal(previewFromDmRow({ media_type: "image" }), "📷 Photo");
  assert.equal(previewFromDmRow({ content: "__voice__:" }), "🎤 Voice message");
  const mapped = mapAdminDmMessage({
    id: "v1",
    from_user_id: "admin",
    to_user_id: "yigit",
    content: "__voice__:abc",
    media_type: "voice",
    created_at: "2026-08-25T21:00:00.000Z",
  });
  assert.equal(mapped.text, "🎤 Voice message");
});
