"use strict";

/**
 * Auth security: enumeration, email/password takeover, persisted OTP attempts,
 * and session revocation that survives a wiped in-memory set.
 */

process.env.PASSWORD_HIBP = "0";
process.env.JWT_SECRET = "test-secret-do-not-use-in-prod";
process.env.JWT_EXPIRES_IN = "7d";
process.env.SUPABASE_URL = "https://placeholder.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "placeholder-key";
process.env.RESEND_API_KEY = "test-resend-key";
process.env.FEEDBACK_EMAIL_FROM = "support@descall.com";

const http = require("http");
const jwt = require("jsonwebtoken");
const { createFakeSupabase } = require("./fakeSupabase.cjs");

const sentEmails = [];
const realFetch = global.fetch;
global.fetch = async (url, opts) => {
  if (url === "https://api.resend.com/emails") {
    const body = JSON.parse(opts.body);
    sentEmails.push(body);
    return { ok: true, json: async () => ({ id: "fake_email_id" }) };
  }
  return realFetch(url, opts);
};

const supabasePath = require.resolve("../db/supabase");
const fakeSupabase = createFakeSupabase({ users: [] });
require.cache[supabasePath] = { id: supabasePath, filename: supabasePath, loaded: true, exports: fakeSupabase };

const express = require("express");
const authRouter = require("../routes/auth");
const errorsRouter = require("../routes/errors");
const { revokedSessionIds } = require("../runtime/sharedState");
const { userIsSuperAdmin } = require("../middleware/requireAdmin");
const { SESSION_LESS_ACCEPT_BEFORE_MS } = require("../lib/sessionGuard");

function assert(cond, msg) {
  if (!cond) throw new Error("FAIL: " + msg);
}

function lastCodeFor(email, subjectIncludes) {
  const rows = sentEmails.filter((e) => e.to[0] === email && (!subjectIncludes || String(e.subject || "").includes(subjectIncludes)));
  const email_ = rows.slice(-1)[0];
  const match = email_?.text?.match(/code is (\d{6})/);
  return match ? match[1] : null;
}

async function startServer() {
  const app = express();
  app.use(express.json());
  app.set("io", { sockets: { sockets: new Map() } });
  app.use("/api/auth", authRouter);
  app.use("/api/errors", errorsRouter);
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  return { server, base: `http://127.0.0.1:${server.address().port}` };
}

async function req(base, method, urlPath, { body, token } = {}) {
  const res = await fetch(`${base}${urlPath}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, body: json, retryAfter: res.headers.get("retry-after") };
}

async function register(base, username, extra = {}) {
  const r = await req(base, "POST", "/api/auth/register", {
    body: {
      username,
      password: "password123",
      termsAccepted: true,
      birthDate: "2000-01-15",
      ...extra,
    },
  });
  assert(r.status === 201, "register " + username + " " + JSON.stringify(r.body));
  return r.body;
}

async function run() {
  const { server, base } = await startServer();
  try {
    const missing = await req(base, "GET", "/api/auth/test");
    assert(missing.status === 404, "public auth test route is gone");

    const errors = await req(base, "GET", "/api/errors");
    assert(errors.status === 401, "error log list requires auth");
    const feedbackTest = await req(base, "GET", "/api/errors/feedback-test");
    assert(feedbackTest.status === 401 || feedbackTest.status === 404, "feedback test route is not public");

    const alice = await register(base, "alice", { email: "alice@example.com" });
    const code = lastCodeFor("alice@example.com");
    let r = await req(base, "POST", "/api/auth/email/verify", { token: alice.token, body: { code } });
    assert(r.status === 200, "alice verifies email");
    await req(base, "POST", "/api/auth/2fa/enable", { token: alice.token });

    r = await req(base, "POST", "/api/auth/email/set", {
      token: alice.token,
      body: { email: "stolen@example.com" },
    });
    assert(r.status === 400 && /şifre/i.test(r.body.error || ""), "email change without password is blocked: " + JSON.stringify(r.body));
    let row = fakeSupabase._tables.users.rows.find((u) => u.username === "alice");
    assert(row.email === "alice@example.com", "email unchanged");
    assert(row.email_confirmed_at, "confirmed email kept");
    assert(row.two_factor_enabled === true, "2FA stays on");

    r = await req(base, "POST", "/api/auth/email/set", {
      token: alice.token,
      body: { email: "next@example.com", password: "password123" },
    });
    assert(r.status === 200, "email change with password starts pending verify: " + JSON.stringify(r.body));
    row = fakeSupabase._tables.users.rows.find((u) => u.username === "alice");
    assert(row.email === "alice@example.com" && row.pending_email === "next@example.com", "pending email does not replace the confirmed one");
    assert(row.two_factor_enabled === true, "2FA still bound to the old email");
    const pendingCode = lastCodeFor("next@example.com");
    r = await req(base, "POST", "/api/auth/email/verify", { token: alice.token, body: { code: pendingCode } });
    assert(r.status === 200, "new email verifies");
    row = fakeSupabase._tables.users.rows.find((u) => u.username === "alice");
    assert(row.email === "next@example.com" && !row.pending_email, "pending email is promoted");
    assert(row.two_factor_enabled === true, "2FA remains enabled after confirm");

    await register(base, "googleonly");
    const googleRow = fakeSupabase._tables.users.rows.find((u) => u.username === "googleonly");
    googleRow.password_hash = null;
    googleRow.auth_provider = "google";

    const unknown = await req(base, "POST", "/api/auth/login", { body: { username: "nobody", password: "password123" } });
    const wrong = await req(base, "POST", "/api/auth/login", { body: { username: "alice", password: "not-the-password" } });
    const social = await req(base, "POST", "/api/auth/login", { body: { username: "googleonly", password: "password123" } });
    assert(unknown.status === 401 && wrong.status === 401 && social.status === 401, "all login failures are 401");
    assert(unknown.body.error === wrong.body.error && wrong.body.error === social.body.error, "login errors do not enumerate: " + JSON.stringify([unknown.body, wrong.body, social.body]));

    const forgotUser = await req(base, "POST", "/api/auth/password/forgot", { body: { username: "missing-user" } });
    const forgotEmail = await req(base, "POST", "/api/auth/password/forgot", { body: { email: "missing@example.com" } });
    await register(base, "unconfirmed", { email: "plain@example.com" });
    const forgotPlain = await req(base, "POST", "/api/auth/password/forgot", { body: { username: "unconfirmed" } });
    assert(forgotUser.status === 200 && forgotEmail.status === 200 && forgotPlain.status === 200, "forgot stays 200");
    assert(
      forgotUser.body.message === forgotEmail.body.message && forgotEmail.body.message === forgotPlain.body.message,
      "forgot messages match"
    );
    const resetMissing = await req(base, "POST", "/api/auth/password/reset", {
      body: { username: "missing-user", code: "123456", newPassword: "a-reasonably-long-secret" },
    });
    assert(resetMissing.status === 400 && resetMissing.status !== 404, "reset does not 404");

    r = await req(base, "POST", "/api/auth/password/request", { token: alice.token });
    assert(r.status === 200, "signed-in reset sends a code: " + JSON.stringify(r.body));
    const resetCode = lastCodeFor("next@example.com", "password reset");
    r = await req(base, "POST", "/api/auth/password/confirm", {
      token: alice.token,
      body: { code: resetCode, newPassword: "a-reasonably-long-secret" },
    });
    assert(r.status === 400 && /şifre/i.test(r.body.error || ""), "signed-in change needs the current password");

    const second = await req(base, "POST", "/api/auth/login", { body: { username: "alice", password: "password123" } });
    assert(second.body.requires2fa || second.body.token, "alice can still sign in");
    let secondToken = second.body.token;
    if (second.body.requires2fa) {
      const loginCode = lastCodeFor("next@example.com");
      const done = await req(base, "POST", "/api/auth/2fa/verify-login", {
        body: { pendingToken: second.body.pendingToken, code: loginCode },
      });
      assert(done.status === 200, "2FA login " + JSON.stringify(done.body));
      secondToken = done.body.token;
    }
    r = await req(base, "POST", "/api/auth/password/request", { token: secondToken });
    const code2 = lastCodeFor("next@example.com", "password reset");
    for (let i = 0; i < 5; i += 1) {
      await req(base, "POST", "/api/auth/password/confirm", {
        token: secondToken,
        body: { code: "000000", newPassword: "a-reasonably-long-secret", currentPassword: "password123" },
      });
    }
    await req(base, "POST", "/api/auth/password/request", { token: secondToken });
    const persisted = await req(base, "POST", "/api/auth/password/confirm", {
      token: secondToken,
      body: { code: "000000", newPassword: "a-reasonably-long-secret", currentPassword: "password123" },
    });
    assert(/too many/i.test(persisted.body.error || ""), "new code does not reset attempt count: " + JSON.stringify(persisted.body));
    const attemptRow = fakeSupabase._tables.auth_code_attempts.rows.find(
      (row) => row.purpose === "password_reset" && row.attempts >= 5
    );
    assert(attemptRow, "attempts live in auth_code_attempts");

    fakeSupabase._tables.auth_code_attempts.rows.splice(0);
    r = await req(base, "POST", "/api/auth/password/request", { token: secondToken });
    const goodCode = lastCodeFor("next@example.com", "password reset");
    const beforeReset = secondToken;
    r = await req(base, "POST", "/api/auth/password/confirm", {
      token: secondToken,
      body: { code: goodCode, newPassword: "another-long-secret", currentPassword: "password123" },
    });
    assert(r.status === 200, "password change with current password works: " + JSON.stringify(r.body) + " code " + code2);
    revokedSessionIds.clear();
    const still = await req(base, "GET", "/api/auth/sessions", { token: alice.token });
    assert(still.status === 401, "other sessions stay revoked after the memory set is cleared");
    const current = await req(base, "GET", "/api/auth/sessions", { token: beforeReset });
    assert(current.status === 200, "the session that changed the password stays signed in");

    const legacy = jwt.sign(
      {
        sub: row.id,
        username: "alice",
        iat: Math.floor((SESSION_LESS_ACCEPT_BEFORE_MS - 86400000) / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
      },
      process.env.JWT_SECRET
    );
    const legacyRes = await req(base, "GET", "/api/auth/sessions", { token: legacy });
    assert(legacyRes.status === 200, "pre-cutoff token without sid still works");
    const future = jwt.sign(
      {
        sub: row.id,
        username: "alice",
        iat: Math.floor((SESSION_LESS_ACCEPT_BEFORE_MS + 86400000) / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
      },
      process.env.JWT_SECRET
    );
    const futureRes = await req(base, "GET", "/api/auth/sessions", { token: future });
    assert(futureRes.status === 401, "post-cutoff token without sid is rejected");

    assert(await userIsSuperAdmin({ user: { id: "x", username: "admin" } }), "username admin is super admin");
    const modId = "22222222-2222-2222-2222-222222222222";
    fakeSupabase._tables.users.rows.push({ id: modId, username: "mod", is_super_admin: false, is_admin: true });
    assert(!(await userIsSuperAdmin({ user: { id: modId, username: "mod" } })), "ordinary admin cannot promote");
    fakeSupabase._tables.users.rows.find((u) => u.id === modId).is_super_admin = true;
    assert(await userIsSuperAdmin({ user: { id: modId, username: "mod" } }), "is_super_admin flag grants it");

    console.log("authSecurity.integration.test.cjs: ok");
  } finally {
    server.close();
  }
}

run().catch((err) => {
  console.error(err.stack || err.message);
  process.exit(1);
});
