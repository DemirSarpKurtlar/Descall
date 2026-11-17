"use strict";
// Regression (security scan 17 Nov 2026): PUT /api/user/profile stored any type, any length
// and any URL (a 60 000 character display name, a third-party "avatar" or a javascript: banner
// was saved and broadcast). Now lib/profileInput.js checks every field; unchanged stored values
// (older rows, Google avatars) are kept as they are.
process.env.NODE_ENV = "test"; process.env.VERCEL = "1"; process.env.PORT = "0";
process.env.JWT_SECRET = "test-secret-do-not-use-in-prod";
process.env.SUPABASE_URL = "https://placeholder.supabase.co"; process.env.SUPABASE_SERVICE_ROLE_KEY = "placeholder-key";
const assert = require("assert");
const { createFakeSupabase } = require("./fakeSupabase.cjs");
const GOOGLE = "https://lh3.googleusercontent.com/a/abc";
const fake = createFakeSupabase({
  users: [{ id: "u-a", username: "demir", display_name: "Demir", avatar_url: GOOGLE, active_sessions: [{ id: "s-a" }] }],
});
require.cache[require.resolve("../db/supabase")] = { id: "s", filename: "s", loaded: true, exports: fake };
const quiet = { log: console.log, warn: console.warn };
console.log = () => {}; console.warn = () => {};
const httpServer = require("../server.js");
const { signToken } = require("../config/jwt");
const P = require("../lib/profileInput");
(async () => {
  await new Promise((r) => httpServer.listen(0, "127.0.0.1", r));
  const base = "http://127.0.0.1:" + httpServer.address().port;
  const tok = signToken({ id: "u-a", username: "demir", sid: "s-a" });
  const put = async (path, body) => {
    const r = await fetch(base + path, { method: "PUT", headers: { "content-type": "application/json", authorization: "Bearer " + tok }, body: JSON.stringify(body) });
    return { status: r.status, body: await r.json().catch(() => ({})) };
  };
  const row = () => fake._tables.users.rows[0];
  const OWN = "https://placeholder.supabase.co/storage/v1/object/public/media/avatars/1-a.png";

  let r = await put("/api/user/profile", { displayName: "x".repeat(60000) });
  assert.strictEqual(r.status, 400); assert.strictEqual(r.body.code, "TOO_LONG"); assert.strictEqual(row().display_name, "Demir");
  r = await put("/api/user/profile", { bio: "y".repeat(191) });
  assert.strictEqual(r.status, 400, "bio over 190");
  for (const bad of ["http://203.0.113.9/ip-logger.gif", "javascript:alert(1)", "https://evil.test/a.png", 'https://placeholder.supabase.co/storage/v1/object/a.png"),url("https://evil.test/x']) {
    r = await put("/api/user/profile", { avatarUrl: bad });
    assert.strictEqual(r.status, 400, `avatar refused: ${bad}`);
    r = await put("/api/user/profile", { bannerUrl: bad });
    assert.strictEqual(r.status, 400, `banner refused: ${bad}`);
  }
  r = await put("/api/user/profile", { displayName: "admin" });
  assert.strictEqual(r.status, 400); assert.strictEqual(r.body.code, "DISPLAY_NAME_RESERVED");
  r = await put("/api/user/profile", { fontSize: "999px; position:fixed" });
  assert.strictEqual(r.status, 400, "fontSize enum");
  r = await put("/api/user/profile", { bio: { $ne: 1 } });
  assert.strictEqual(r.status, 400, "non-string bio");
  assert.strictEqual(row().avatar_url, GOOGLE, "nothing above was stored");

  // Valid saves; the stored Google avatar is resent unchanged and kept.
  r = await put("/api/user/profile", { displayName: "  Demir K  ", bio: "Merhaba\n\n\n\nselam", customStatus: "oyunda", avatarUrl: GOOGLE, bannerUrl: OWN });
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  assert.strictEqual(row().display_name, "Demir K");
  assert.strictEqual(row().bio, "Merhaba\n\nselam");
  assert.strictEqual(row().avatar_url, GOOGLE);
  assert.strictEqual(row().banner_url, OWN);
  r = await put("/api/user/profile", { avatarUrl: "" });
  assert.strictEqual(r.status, 200); assert.strictEqual(row().avatar_url, null, "clearing works");

  r = await put("/api/user/notifications", { soundVolume: "huge" });
  assert.strictEqual(r.status, 400);
  r = await put("/api/user/notifications", { soundEnabled: false, soundVolume: 40 });
  assert.strictEqual(r.status, 200); assert.strictEqual(row().sound_enabled, false);
  r = await put("/api/user/privacy", { profileVisibleTo: "anything" });
  assert.strictEqual(r.status, 400);
  r = await put("/api/user/privacy", { profileVisibleTo: "friends", allowGroupInvites: false });
  assert.strictEqual(r.status, 200); assert.strictEqual(row().profile_visible_to, "friends");
  r = await put("/api/user/regional", { timezone: "Mars/Olympus" });
  assert.strictEqual(r.status, 400);
  r = await put("/api/user/regional", { timezone: "Europe/Istanbul" });
  assert.strictEqual(r.status, 200); assert.strictEqual(row().timezone, "Europe/Istanbul");

  assert.ok(!P.isOwnMediaUrl("https://evil.supabase.co.test/storage/v1/object/x"));
  quiet.log("profileInput test ok");
  process.exit(0);
})().catch((e) => { quiet.log(e); process.exit(1); });
