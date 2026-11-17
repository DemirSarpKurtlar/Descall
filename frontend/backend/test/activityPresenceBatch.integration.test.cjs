"use strict";

/**
 * POST /api/activity/presence/batch (routes/activityPresenceBatch.js): one call for every
 * friend's live activity. Only accepted friends are answered; privacy, kind toggles and
 * invisible status apply as in the single-friend route.
 */

process.env.JWT_SECRET = "test-secret-do-not-use-in-prod";
process.env.SUPABASE_URL = "https://placeholder.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "placeholder-key";

const http = require("http");
const { createFakeSupabase } = require("./fakeSupabase.cjs");

const now = new Date().toISOString();
const row = (user_id, app_type = "game", display_name = "Chess") => ({ user_id, app_name: display_name, app_type, display_name, started_at: now, is_manual: false, updated_at: now });
const fake = createFakeSupabase({
  users: ["me", "f1", "f2", "f3", "f4", "f5", "stranger"].map((id) => ({ id, username: id, active_sessions: [{ id: `s-${id}` }], presence_status: id === "f5" ? "invisible" : "online" })),
  friendships: [
    { id: "a", user_id: "me", friend_id: "f1", status: "accepted" },
    { id: "b", user_id: "f2", friend_id: "me", status: "accepted" },
    { id: "c", user_id: "me", friend_id: "f3", status: "accepted" },
    { id: "d", user_id: "me", friend_id: "f4", status: "accepted" },
    { id: "e", user_id: "me", friend_id: "f5", status: "accepted" },
    { id: "p", user_id: "me", friend_id: "pending", status: "pending" },
  ],
  user_activity_settings: [
    { user_id: "f2", privacy: "hidden" },
    { user_id: "f3", privacy: "only-me" },
    { user_id: "f4", privacy: "friends", show_game_activity: false, show_app_activity: true, show_browser: false },
  ],
  user_presence: [row("f1"), row("f2"), row("f3"), row("f4"), row("f5"), row("stranger")],
});
const supabasePath = require.resolve("../db/supabase");
require.cache[supabasePath] = { id: supabasePath, filename: supabasePath, loaded: true, exports: fake };

const express = require("express");
const { signToken } = require("../config/jwt");
const router = require("../routes/activityPresenceBatch");

function assert(cond, msg) {
  if (!cond) throw new Error("FAIL: " + msg);
}

async function main() {
  const app = express();
  app.use(express.json());
  app.use("/api/activity", router);
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}/api/activity/presence/batch`;
  const token = signToken({ id: "me", username: "me", sid: "s-me" });
  const post = async (body, tok = token) => {
    const res = await fetch(base, { method: "POST", headers: { "Content-Type": "application/json", ...(tok ? { Authorization: `Bearer ${tok}` } : {}) }, body: JSON.stringify(body) });
    return { status: res.status, body: await res.json().catch(() => ({})) };
  };
  try {
    let r = await post({}, null);
    assert(r.status === 401, "needs auth, got " + r.status);

    r = await post({});
    assert(r.status === 200, "ok: " + r.status);
    const p = r.body.presence;
    assert(p.f1 && p.f1.display_name === "Chess" && !("user_id" in p.f1), "friend f1 visible: " + JSON.stringify(p.f1));
    assert(p.f2 === null, "hidden privacy gives null");
    assert(p.f3 && p.f3.privacy === "only-me", "only-me is restricted");
    assert(p.f4 === null, "game rows hidden when show_game_activity is off");
    assert(p.f5 === null, "an invisible friend shows nothing");
    assert(!("stranger" in p) && !("pending" in p), "non-friends are never answered");

    r = await post({ ids: ["f1", "stranger", "x,or(1.eq.1)", 5] });
    assert(Object.keys(r.body.presence).join(",") === "f1", "explicit ids are limited to friends: " + JSON.stringify(r.body.presence));

    console.log("activityPresenceBatch.integration: ok");
  } finally {
    server.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
