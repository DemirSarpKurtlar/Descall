"use strict";
// Polish messaging-09: DM unread counts come back after a restart.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createFakeSupabase } = require("./fakeSupabase.cjs");
const { hydrateDmUnread, resetForTests, MAX_COUNT } = require("../lib/dmUnread");

(async () => {
  const rows = [];
  for (let i = 0; i < 3; i++) rows.push({ id: `a${i}`, from_user_id: "bob", to_user_id: "me", read_at: null });
  rows.push({ id: "r1", from_user_id: "bob", to_user_id: "me", read_at: "2026-11-17T10:00:00Z" });
  for (let i = 0; i < 120; i++) rows.push({ id: `c${i}`, from_user_id: "carol", to_user_id: "me", read_at: null });
  rows.push({ id: "x1", from_user_id: "stranger", to_user_id: "me", read_at: null });
  rows.push({ id: "o1", from_user_id: "me", to_user_id: "bob", read_at: null });
  const db = createFakeSupabase({ dm_messages: rows });

  resetForTests();
  const map = new Map([["carol", 2]]);
  assert.equal(await hydrateDmUnread({ db, userId: "me", unreadMap: map, friendIds: new Set(["bob", "carol"]) }), true);
  assert.equal(map.get("bob"), 3, "unread rows only");
  assert.equal(map.get("carol"), MAX_COUNT, "capped, and the higher count wins");
  assert.equal(map.has("stranger"), false, "friends only");
  assert.equal(map.has("me"), false, "my own sent rows never count");

  map.set("bob", 7);
  assert.equal(await hydrateDmUnread({ db, userId: "me", unreadMap: map }), false, "once per process");
  assert.equal(map.get("bob"), 7, "a live count is never lowered");

  const handlers = fs.readFileSync(path.join(__dirname, "../socket/handlers.js"), "utf8");
  assert.ok(handlers.includes('require("../lib/dmUnread")') && handlers.includes("hydrateDmUnread({ db: supabase, userId, unreadMap: dmMap"), "buildSyncState hydrates");
  console.log("dmUnread unit OK");
})().catch((e) => { console.error(e); process.exit(1); });
