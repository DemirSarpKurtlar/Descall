"use strict";
// Regression (security scan 17 Nov 2026): GET /api/activity/friend/:userId/presence and
// /history require an accepted friendship (default privacy "friends"), respect the
// show_* switches and hide live presence for an invisible user.
process.env.NODE_ENV = "test"; process.env.JWT_SECRET = "test-secret-do-not-use-in-prod";
process.env.SUPABASE_URL = "https://placeholder.supabase.co"; process.env.SUPABASE_SERVICE_ROLE_KEY = "placeholder-key";
const assert = require("assert");
const http = require("http");
const express = require("express");
const { createFakeSupabase } = require("./fakeSupabase.cjs");
const V = "22222222-2222-4222-8222-222222222222", S = "11111111-1111-4111-8111-111111111111", F = "33333333-3333-4333-8333-333333333333";
const fake = createFakeSupabase({
  users: [
    { id: S, username: "stranger", active_sessions: [{ id: "s-s" }] },
    { id: F, username: "friend", active_sessions: [{ id: "s-f" }] },
    { id: V, username: "victim", active_sessions: [{ id: "s-v" }], presence_status: "online" },
  ],
  friendships: [{ id: "f1", user_id: V, friend_id: F, status: "accepted" }],
  user_activity_settings: [],
  user_presence: [{ user_id: V, app_name: "Secret Game", app_type: "game", display_name: "Secret Game", started_at: "2026-11-17T20:00:00Z", is_manual: false, updated_at: "2026-11-17T21:00:00Z" }],
  user_activity_log: [{ id: "l1", user_id: V, app_name: "Secret Game", app_type: "game", display_name: "Secret Game", started_at: "2026-11-17T20:00:00Z", ended_at: "2026-11-17T20:30:00Z", duration_sec: 1800, is_manual: false }],
});
require.cache[require.resolve("../db/supabase")] = { id: "s", filename: "s", loaded: true, exports: fake };
const { signToken } = require("../config/jwt");
const { presence } = require("../runtime/sharedState");
const app = express(); app.use(express.json()); app.use("/api/activity", require("../routes/activity"));
(async () => {
  const srv = http.createServer(app); await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  const base = "http://127.0.0.1:" + srv.address().port + "/api/activity/friend/";
  const get = async (who, sid, p) => (await fetch(base + p, { headers: { authorization: "Bearer " + signToken({ id: who, username: who, sid }) } })).json();
  // A stranger sees nothing.
  assert.strictEqual((await get(S, "s-s", V + "/presence")).presence, null, "stranger: no presence");
  assert.deepStrictEqual((await get(S, "s-s", V + "/history")).history, [], "stranger: no history");
  // A friend sees the live game and the history.
  assert.strictEqual((await get(F, "s-f", V + "/presence")).presence.app_name, "Secret Game", "friend sees presence");
  assert.ok((await get(F, "s-f", V + "/history")).history.length > 0, "friend sees history");
  // Games hidden by the owner: hidden for friends, still visible to the owner.
  fake._tables.user_activity_settings.rows.push({ user_id: V, privacy: "friends", show_game_activity: false });
  assert.strictEqual((await get(F, "s-f", V + "/presence")).presence, null, "show_game_activity off hides the game");
  assert.deepStrictEqual((await get(F, "s-f", V + "/history")).history, [], "and the game history");
  assert.strictEqual((await get(V, "s-v", V + "/presence")).presence.app_name, "Secret Game", "owner still sees it");
  fake._tables.user_activity_settings.rows.length = 0;
  // Invisible: no live presence, even for friends.
  presence.set(V, { status: "invisible" });
  assert.strictEqual((await get(F, "s-f", V + "/presence")).presence, null, "invisible hides presence");
  presence.delete(V);
  // Crafted ids are refused.
  const bad = await fetch(base + encodeURIComponent("x),or(id.not.is.null") + "/presence", { headers: { authorization: "Bearer " + signToken({ id: S, username: "s", sid: "s-s" }) } });
  assert.strictEqual(bad.status, 400);
  console.log("activityAccess test ok");
  srv.close();
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
