"use strict";

/**
 * POST /auth/register says which field failed (`field`, `code`) and records the rule
 * in signup_attempts.reason_detail; every sign-up stores signup_platform (the app's
 * clientPlatform hint wins over the WebView user agent); invites are attributed
 * (users.joined_via_invite_code, users.referred_by); POST /auth/heard-about keeps
 * the first answer. In-memory fake Supabase, no network.
 */

process.env.NODE_ENV = "test";
process.env.PASSWORD_HIBP = "0";
process.env.JWT_SECRET = "test-secret-do-not-use-in-prod";
process.env.SUPABASE_URL = "https://placeholder.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "placeholder-key";

const http = require("http");
const { createFakeSupabase } = require("./fakeSupabase.cjs");

const realFetch = global.fetch;
global.fetch = async (url, opts) => {
  if (url === "https://api.resend.com/emails") return { ok: true, json: async () => ({ id: "fake_email_id" }) };
  return realFetch(url, opts);
};

const supabasePath = require.resolve("../db/supabase");
const fake = createFakeSupabase({
  users: [{ id: "u-inviter", username: "inviter", email: "inviter@example.com", email_confirmed_at: "2026-01-01T00:00:00.000Z", created_at: "2026-01-01T00:00:00.000Z" }],
  signup_attempts: [],
  friendships: [],
});
require.cache[supabasePath] = { id: supabasePath, filename: supabasePath, loaded: true, exports: fake };

const express = require("express");
const authRouter = require("../routes/auth");

function assert(cond, msg) {
  if (!cond) throw new Error("FAIL: " + msg);
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const IOS_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148";
const base = { password: "password123", termsAccepted: true, birthDate: "2000-01-15" };

async function run() {
  const app = express();
  app.use(express.json());
  app.set("io", { sockets: { sockets: new Map() }, to: () => ({ emit() {} }) });
  app.use("/api/auth", authRouter);
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, r));
  const url = `http://127.0.0.1:${server.address().port}/api/auth`;
  const post = async (path, body, { token, ua } = {}) => {
    const res = await fetch(url + path, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(ua ? { "User-Agent": ua } : {}) },
      body: JSON.stringify(body),
    });
    return { status: res.status, body: await res.json().catch(() => ({})) };
  };
  const lastAttempt = () => fake._tables.signup_attempts.rows.at(-1);
  try {
    let r = await post("/register", { ...base, username: "ali veli", email: "a@example.com" });
    assert(r.status === 400 && r.body.field === "username" && r.body.code === "username_chars", `username chars: ${JSON.stringify(r.body)}`);
    await wait(20);
    assert(lastAttempt().reason === "validation" && lastAttempt().reason_detail === "username_chars", `attempt detail: ${JSON.stringify(lastAttempt())}`);

    r = await post("/register", { ...base, username: "alice", password: "short", email: "a@example.com" });
    assert(r.status === 400 && r.body.field === "password" && r.body.code === "weak_password", `password short keeps its code: ${JSON.stringify(r.body)}`);
    await wait(20);
    assert(lastAttempt().reason_detail === "password_short", "password_short recorded");

    r = await post("/register", { ...base, username: "alice", email: "nope" });
    assert(r.status === 400 && r.body.field === "email" && r.body.code === "EMAIL_INVALID", `email invalid keeps its code: ${JSON.stringify(r.body)}`);
    await wait(20);
    assert(lastAttempt().reason_detail === "email_invalid", "email_invalid recorded");

    r = await post("/register", { ...base, username: "alice", email: "a@example.com", termsAccepted: false });
    assert(r.status === 400 && r.body.field === "terms", "terms field");
    await wait(20);
    assert(lastAttempt().reason_detail === "terms_missing", "terms_missing recorded");

    r = await post("/register", { ...base, username: "Inviter", email: "x@example.com" });
    assert(r.status === 409 && r.body.code === "username_taken" && Array.isArray(r.body.suggestions), `taken with suggestions: ${JSON.stringify(r.body)}`);
    await wait(20);
    assert(lastAttempt().reason === "conflict" && lastAttempt().reason_detail === "username_taken", "username_taken recorded");

    // iOS app sign-up through a server invite.
    r = await post("/register", { ...base, username: "iosuser", email: "ios@example.com", clientPlatform: "ios", inviteCode: "server:AbCd1234" }, { ua: IOS_UA });
    assert(r.status === 201, `ios register: ${JSON.stringify(r.body)}`);
    await wait(30);
    let row = fake._tables.users.rows.find((u) => u.username === "iosuser");
    assert(row.signup_platform === "ios_app", `platform from the app hint: ${row.signup_platform}`);
    assert(row.signup_source_group === "invite" && row.signup_source_sub === "server_invite", `source: ${row.signup_source_group}/${row.signup_source_sub}`);
    assert(row.joined_via_invite_code === "server:AbCd1234", `invite stored: ${row.joined_via_invite_code}`);
    assert(lastAttempt().status === "completed" && !lastAttempt().reason_detail, "completed attempt has no detail");

    // Web sign-up without any hint still gets a platform.
    r = await post("/register", { ...base, username: "webuser", email: "web@example.com" }, { ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130" });
    assert(r.status === 201, "web register");
    row = fake._tables.users.rows.find((u) => u.username === "webuser");
    assert(row.signup_platform === "web_desktop", `web platform: ${row.signup_platform}`);
    assert(row.joined_via_invite_code == null, "no invite");

    // Friend invite: referred_by + friend:<username>, even when no reward is paid.
    r = await post("/register", { ...base, username: "friendee", email: "f@example.com", invitedBy: "inviter" });
    assert(r.status === 201, `friend register: ${JSON.stringify(r.body)}`);
    await wait(30);
    row = fake._tables.users.rows.find((u) => u.username === "friendee");
    assert(row.referred_by === "u-inviter", `referred_by: ${row.referred_by}`);
    assert(row.joined_via_invite_code === "friend:inviter", `friend invite value: ${row.joined_via_invite_code}`);

    // Junk invite values are ignored.
    r = await post("/register", { ...base, username: "junkinv", email: "j@example.com", inviteCode: "evil:<script>" });
    assert(r.status === 201, "junk invite register");
    await wait(20);
    assert(fake._tables.users.rows.find((u) => u.username === "junkinv").joined_via_invite_code == null, "junk invite not stored");

    // Heard about: first answer wins, bad answers refused, auth required.
    const token = r.body.token;
    let h = await post("/heard-about", { answer: "tiktok" });
    assert(h.status === 401, "heard-about needs a session");
    h = await post("/heard-about", { answer: "<b>x</b>" }, { token });
    assert(h.status === 400, "unknown answer refused");
    h = await post("/heard-about", { answer: "tiktok" }, { token });
    assert(h.status === 200 && h.body.stored === true, `stored: ${JSON.stringify(h.body)}`);
    h = await post("/heard-about", { answer: "google" }, { token });
    assert(h.status === 200 && h.body.stored === false, "second answer ignored");
    row = fake._tables.users.rows.find((u) => u.username === "junkinv");
    assert(row.heard_about === "tiktok" && row.heard_about_at, "first answer kept");
  } finally {
    server.close();
  }
  console.log("signupForm.integration.test ok");
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
