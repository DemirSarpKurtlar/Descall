"use strict";

// node backend/lib/serverReview.selftest.cjs
// Sunucu inceleme: the gate, staff detection, explainable risk, list query,
// channel tree, gated message shape, DM-style edit history.
const assert = require("assert");
const review = require("./serverReview");
const { Permissions } = require("./serverPermissions");
const { createFakeSupabase } = require("../test/fakeSupabase.cjs");
const { updateServerMessageWithHistory } = require("./serverMessageHistory");

let n = 0;
const ok = async (name, fn) => {
  await fn();
  n += 1;
  console.log(`ok ${n} - ${name}`);
};

(async () => {
  await ok("view gate: purpose + reason >= 10, same rule as DMs", () => {
    assert.deepStrictEqual([...review.SERVER_VIEW_PURPOSES], ["report", "security", "legal"]);
    assert.strictEqual(review.checkViewRequest({ purpose: "curious", reason: "0123456789 long" }).code, "SERVER_VIEW_PURPOSE");
    assert.strictEqual(review.checkViewRequest({ purpose: "report", reason: "short" }).code, "SERVER_VIEW_REASON");
    assert.strictEqual(review.checkViewRequest({ purpose: "report", reason: "   012345678   " }).code, "SERVER_VIEW_REASON");
    const good = review.checkViewRequest({ purpose: "legal", reason: "  Court order 2026/14  " });
    assert.deepStrictEqual(good, { ok: true, purpose: "legal", reason: "Court order 2026/14" });
    assert.strictEqual(review.checkViewRequest({ purpose: "security", reason: "x".repeat(900) }).reason.length, 300);
    assert.strictEqual(review.checkViewRequest(null).ok, false);
  });

  await ok("dangerous permissions: ADMINISTRATOR implies all, plain roles are not staff", () => {
    assert.deepStrictEqual(review.dangerousPermissions(String(Permissions.ADMINISTRATOR | Permissions.SEND_MESSAGES)), ["ADMINISTRATOR"]);
    assert.deepStrictEqual(review.dangerousPermissions((Permissions.BAN_MEMBERS | Permissions.MANAGE_MESSAGES).toString()), ["BAN_MEMBERS", "MANAGE_MESSAGES"]);
    assert.deepStrictEqual(review.dangerousPermissions(String(Permissions.SEND_MESSAGES | Permissions.VIEW_CHANNEL)), []);
    assert.deepStrictEqual(review.dangerousPermissions("not a number"), []);
  });

  const now = Date.parse("2026-11-14T12:00:00Z");
  await ok("risk is explainable and capped", () => {
    const calm = review.riskOf({ createdAt: "2025-01-01T00:00:00Z", members: 40, joins7d: 1 }, now);
    assert.deepStrictEqual(calm, { score: 0, factors: [] });
    const hot = review.riskOf(
      {
        serverReports: 5,
        memberReports: 9,
        createdAt: "2026-11-10T00:00:00Z",
        joins7d: 80,
        members: 90,
        invitesActive: 12,
        listed: true,
        hidden: false,
        modEvents7d: 4,
        isPublic: true,
      },
      now
    );
    assert.strictEqual(hot.score, 100);
    assert.deepStrictEqual(hot.factors, ["serverReports", "memberReports", "newFastGrowth", "manyInvites", "directoryListed", "moderationEvents", "publicDiscovery"]);
    assert.ok(!review.riskOf({ listed: true, hidden: true }, now).factors.includes("directoryListed"), "hidden listing is not a risk");
    assert.deepStrictEqual(review.riskOf({ createdAt: "2024-01-01T00:00:00Z", members: 20, joins7d: 10 }, now).factors, ["fastGrowth"]);
    assert.strictEqual(review.riskLevel(10), "low");
    assert.strictEqual(review.riskLevel(25), "medium");
    assert.strictEqual(review.riskLevel(70), "high");
  });

  const servers = [
    { id: "11111111-1111-4111-8111-111111111111", name: "Kahve Sohbeti", owner_id: "u1", created_at: "2024-02-01T00:00:00Z", listed_in_directory: true, is_public: true },
    { id: "22222222-2222-4222-8222-222222222222", name: "Şüpheli Pazar", owner_id: "u2", created_at: "2026-11-12T00:00:00Z" },
    { id: "33333333-3333-4333-8333-333333333333", name: "Sessiz Oda", owner_id: "u1", created_at: "2025-06-01T00:00:00Z", directory_hidden_at: "2026-11-01T00:00:00Z", listed_in_directory: true },
  ];
  const rows = review.buildServerRows({
    servers,
    stats: new Map([
      [servers[0].id, { members: 120, joins7d: 3, msgs7d: 400, msgs30d: 1500 }],
      [servers[1].id, { members: 60, joins7d: 58, msgs7d: 50, msgs30d: 50, invitesActive: 14 }],
    ]),
    owners: new Map([
      ["u1", { id: "u1", username: "elif", display_name: "Elif" }],
      ["u2", { id: "u2", username: "kaan" }],
    ]),
    reports: new Map([[servers[1].id, { server: 2, members: 1 }]]),
    nowMs: now,
  });

  await ok("list rows carry metadata only", () => {
    const json = JSON.stringify(rows);
    for (const forbidden of ["content", "description", "topic", "snippet", "text"]) assert.ok(!json.includes(`"${forbidden}"`), forbidden);
    assert.strictEqual(rows[1].risk.level, "high");
    assert.strictEqual(rows[0].owner.username, "elif");
    assert.deepStrictEqual(rows[2].directory, { listed: true, hidden: true, hiddenAt: "2026-11-01T00:00:00Z" });
  });

  await ok("list query: filters, search by name / id / owner, sorts, pages", () => {
    const q = (o) => review.queryServers(rows, review.parseListQuery(o), now);
    assert.strictEqual(q({}).servers[0].name, "Şüpheli Pazar", "risk sort first");
    assert.deepStrictEqual(q({ filter: "reported" }).servers.map((r) => r.name), ["Şüpheli Pazar"]);
    assert.deepStrictEqual(q({ filter: "listed" }).servers.map((r) => r.name), ["Kahve Sohbeti"]);
    assert.deepStrictEqual(q({ filter: "hidden" }).servers.map((r) => r.name), ["Sessiz Oda"]);
    assert.deepStrictEqual(q({ filter: "new" }).servers.map((r) => r.name), ["Şüpheli Pazar"]);
    assert.deepStrictEqual(q({ q: "supheli" }).servers.map((r) => r.name), ["Şüpheli Pazar"], "Turkish folding");
    assert.deepStrictEqual(q({ q: "@ELIF", sort: "newest" }).servers.map((r) => r.name), ["Sessiz Oda", "Kahve Sohbeti"]);
    assert.deepStrictEqual(q({ q: "33333333" }).servers.map((r) => r.name), ["Sessiz Oda"], "id prefix");
    assert.deepStrictEqual(q({ sort: "messages" }).servers.map((r) => r.name)[0], "Kahve Sohbeti");
    const paged = q({ limit: 2, page: 2, sort: "members" });
    assert.strictEqual(paged.total, 3);
    assert.strictEqual(paged.pages, 2);
    assert.deepStrictEqual(paged.servers.map((r) => r.name), ["Sessiz Oda"]);
    assert.strictEqual(review.parseListQuery({ sort: "drop table", filter: "x", limit: 5000 }).sort, "risk");
    assert.strictEqual(review.parseListQuery({ limit: 5000 }).limit, 100);
  });

  await ok("channel tree groups by category in position order", () => {
    const tree = review.channelTree(
      [
        { id: "c2", name: "genel", type: "text", position: 1, parent_id: "cat" },
        { id: "cat", name: "Sohbet", type: "category", position: 0 },
        { id: "c1", name: "kurallar", type: "text", position: 0, parent_id: "cat" },
        { id: "c3", name: "Ses", type: "voice", position: 0 },
      ],
      new Map([["c2", { messages: 42, lastAt: "2026-11-13T00:00:00Z" }]])
    );
    assert.deepStrictEqual(tree.loose.map((c) => c.id), ["c3"]);
    assert.deepStrictEqual(tree.categories[0].children.map((c) => [c.name, c.messages]), [["kurallar", 0], ["genel", 42]]);
  });

  await ok("gated message shape: kinds, edits, pins, no voice marker text", () => {
    const people = new Map([["u1", { id: "u1", username: "kaan", display_name: "Kaan" }], ["u2", { id: "u2", username: "mod" }]]);
    const text = review.mapReviewMessage(
      { id: "m1", sender_id: "u1", content: "merhaba", created_at: "t", edited_at: "t2", edit_history: [{ text: "merhba", editedAt: "t2" }, { bad: 1 }], pinned_at: "t3", pinned_by: "u2" },
      people
    );
    assert.strictEqual(text.kind, "text");
    assert.deepStrictEqual(text.edits, [{ text: "merhba", editedAt: "t2" }]);
    assert.strictEqual(text.pinnedBy, "mod");
    assert.strictEqual(text.mediaUrl, null);
    const voice = review.mapReviewMessage({ id: "m2", sender_id: "u1", content: "__voice__:3.4", media_url: "sb://media-private/files/a.m4a", media_type: "voice" }, people);
    assert.deepStrictEqual([voice.kind, voice.text, voice.voiceSeconds], ["voice", "", 3]);
    assert.strictEqual(review.mapReviewMessage({ id: "m3", media_url: "x", media_type: "image", content: "cap" }).kind, "image");
    assert.strictEqual(review.mapReviewMessage({ id: "m4", media_url: "x", media_type: "document" }).kind, "file");
    assert.strictEqual(review.mapReviewMessage({ id: "m5", message_type: "system", system_kind: "member_join", content: "x" }).text, "");
    assert.strictEqual(review.mapReviewMessage({ id: "m6", media_type: "poll_v2", content: "Poll: a / b" }).kind, "poll");
  });

  await ok("paging cursor stays a timestamp; range for the audit", () => {
    assert.deepStrictEqual(review.parseCursor({}), { before: null, after: null, limit: 50, direction: "latest" });
    const older = review.parseCursor({ before: "2026-11-01T10:00:00Z", after: "2026-11-02T00:00:00Z", limit: 999 });
    assert.deepStrictEqual(older, { before: "2026-11-01T10:00:00.000Z", after: null, limit: 100, direction: "older" });
    assert.strictEqual(review.parseCursor({ after: "not a date" }).direction, "latest");
    assert.strictEqual(review.parseCursor({ before: "x".repeat(60) }).before, null);
    const range = review.rangeOf(older, [{ timestamp: "a" }, { timestamp: "b" }]);
    assert.deepStrictEqual(range, { direction: "older", from: "a", to: "b", count: 2 });
  });

  await ok("edit history: DM shape, capped at 50", () => {
    assert.deepStrictEqual(review.appendEditHistory([], "v1", "t1"), [{ text: "v1", editedAt: "t1" }]);
    let h = [];
    for (let i = 0; i < 60; i += 1) h = review.appendEditHistory(h, `v${i}`, `t${i}`);
    assert.strictEqual(h.length, 50);
    assert.strictEqual(h[0].text, "v10");
    assert.strictEqual(h[49].text, "v59");
  });

  await ok("edit keeps the previous text when the column exists; plain edit without it", async () => {
    const withCol = createFakeSupabase({
      server_messages: [{ id: "m1", channel_id: "c1", sender_id: "u1", content: "first", edit_history: [] }],
    });
    let r = await updateServerMessageWithHistory(withCol, { messageId: "m1", channelId: "c1", senderId: "u1", previousText: "first", newText: "second", editedAt: "t1" });
    assert.deepStrictEqual(r, { error: null, historySaved: true });
    r = await updateServerMessageWithHistory(withCol, { messageId: "m1", channelId: "c1", senderId: "u1", previousText: "second", newText: "third", editedAt: "t2" });
    const row = withCol._tables.server_messages.rows[0];
    assert.strictEqual(row.content, "third");
    assert.deepStrictEqual(row.edit_history, [{ text: "first", editedAt: "t1" }, { text: "second", editedAt: "t2" }]);
    assert.strictEqual(row.edited_at, "t2");

    const noCol = createFakeSupabase({ server_messages: [{ id: "m1", channel_id: "c1", sender_id: "u1", content: "first" }] });
    r = await updateServerMessageWithHistory(noCol, { messageId: "m1", channelId: "c1", senderId: "u1", previousText: "first", newText: "second", editedAt: "t1" });
    assert.deepStrictEqual(r, { error: null, historySaved: false });
    assert.strictEqual(noCol._tables.server_messages.rows[0].content, "second");
    assert.ok(!("edit_history" in noCol._tables.server_messages.rows[0]), "never writes the column on an older database");

    // Someone else's message is never touched.
    r = await updateServerMessageWithHistory(withCol, { messageId: "m1", channelId: "c1", senderId: "u2", previousText: "third", newText: "hacked", editedAt: "t3" });
    assert.strictEqual(withCol._tables.server_messages.rows[0].content, "third");
  });

  await ok("typed delete confirmation is exact", () => {
    assert.strictEqual(review.deleteConfirmed("Şüpheli Pazar", "Şüpheli Pazar"), true);
    assert.strictEqual(review.deleteConfirmed("Şüpheli Pazar", "  Şüpheli Pazar "), true);
    assert.strictEqual(review.deleteConfirmed("Şüpheli Pazar", "şüpheli pazar"), false);
    assert.strictEqual(review.deleteConfirmed("Şüpheli Pazar", ""), false);
    assert.strictEqual(review.deleteConfirmed("", ""), false);
  });

  console.log(`\n${n} passed`);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
