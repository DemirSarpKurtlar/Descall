"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

process.env.SUPABASE_URL = process.env.SUPABASE_URL || "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "test-service-role-key";

const { buildDescription, buildTitle, publicRow, parseKind, dmUploaderAllowed } = require("./voiceRecordings");

const WHEN = "2026-08-26T20:02:00.000Z"; // 23:02 Europe/Istanbul (UTC+3)

test("buildDescription DM is a Turkish sentence with people, when, duration", () => {
  const text = buildDescription({
    kind: "dm",
    participantUsernames: ["Ali", "Ayşe"],
    startedAt: WHEN,
    durationMs: 4 * 60 * 1000 + 12 * 1000,
  });
  assert.match(text, /Özel \(DM\) sesli görüşme/);
  assert.match(text, /Ali ve Ayşe/);
  assert.match(text, /26 Ağustos 2026/);
  assert.match(text, /23:02/);
  assert.match(text, /4 dakika 12 saniye/);
  assert.equal(text.endsWith("."), true);
});

test("buildDescription group names the room", () => {
  const text = buildDescription({
    kind: "group",
    groupName: "Arkadaşlar",
    participantUsernames: ["Ali", "Ayşe", "Mehmet"],
    startedAt: WHEN,
    durationMs: 12 * 60 * 1000,
  });
  assert.match(text, /Grup sesli görüşmesi/);
  assert.match(text, /“Arkadaşlar”/);
  assert.match(text, /Ali, Ayşe ve Mehmet/);
  assert.match(text, /12 dakika/);
});

test("buildDescription server names server and channel", () => {
  const text = buildDescription({
    kind: "server",
    serverName: "Descall",
    channelName: "Genel",
    participantUsernames: ["Ali", "Ayşe"],
    startedAt: WHEN,
    durationMs: 8 * 60 * 1000 + 5 * 1000,
  });
  assert.match(text, /Sunucu sesli sohbeti/);
  assert.match(text, /Descall sunucusunda/);
  assert.match(text, /“Genel”/);
  assert.match(text, /8 dakika 5 saniye/);
});

test("buildDescription falls back when names are missing", () => {
  const text = buildDescription({ kind: "dm", startedAt: WHEN, durationMs: 3000 });
  assert.match(text, /bilinmeyen katılımcılar/);
  assert.match(text, /3 saniye/);
});

test("buildTitle is compact for admin tabs", () => {
  assert.equal(buildTitle({ kind: "dm", participantUsernames: ["Ali", "Ayşe"] }), "DM · Ali · Ayşe");
  assert.equal(buildTitle({ kind: "group", groupName: "Arkadaşlar" }), "Grup · Arkadaşlar");
  assert.equal(
    buildTitle({ kind: "server", serverName: "Descall", channelName: "Genel" }),
    "Sunucu · Descall / Genel"
  );
});

test("parseKind and publicRow shape", () => {
  assert.equal(parseKind("DM"), "dm");
  assert.equal(parseKind("nope"), null);
  const pub = publicRow({
    id: "id-1",
    kind: "dm",
    status: "ready",
    title: "DM · Ali",
    description: "x",
    dm_peer_ids: ["a", "b"],
    participant_ids: ["a", "b"],
    participant_usernames: ["Ali", "Ayşe"],
    started_at: WHEN,
    ended_at: WHEN,
    duration_ms: 4000,
    byte_size: 12,
    storage_path: "voice-recordings/dm/id-1.mp3",
    created_at: WHEN,
    updated_at: WHEN,
  });
  assert.equal(pub.hasAudio, true);
  assert.equal(pub.kind, "dm");
  assert.deepEqual(pub.dmPeerIds, ["a", "b"]);
  assert.equal(pub.durationMs, 4000);
});

test("dmUploaderAllowed allows 1-peer hangup snapshot", () => {
  const me = "11111111-1111-4111-8111-111111111111";
  const other = "22222222-2222-4222-8222-222222222222";
  assert.equal(dmUploaderAllowed(me, [me]), true);
  assert.equal(dmUploaderAllowed(me, []), true);
  assert.equal(dmUploaderAllowed(me, [me, other]), true);
  assert.equal(dmUploaderAllowed(me, [other]), false);
  assert.equal(dmUploaderAllowed(null, [me]), false);
});
