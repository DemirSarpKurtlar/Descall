"use strict";

/**
 * Auth polish regressions (3.9.x scan): forgot password by a mixed-case username,
 * the five-wrong-codes lock that must not keep emailing refused codes, and the
 * other auth fixes from the same pass.
 */

process.env.PASSWORD_HIBP = "0";
process.env.JWT_SECRET = "test-secret-do-not-use-in-prod";
process.env.JWT_EXPIRES_IN = "7d";
process.env.SUPABASE_URL = "https://placeholder.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "placeholder-key";
process.env.RESEND_API_KEY = "test-resend-key";
process.env.FEEDBACK_EMAIL_FROM = "support@descall.com";

const http = require("http");
const { createFakeSupabase } = require("./fakeSupabase.cjs");

const sentEmails = [];
const realFetch = global.fetch;
global.fetch = async (url, opts) => {
  if (url === "https://api.resend.com/emails") {
    sentEmails.push(JSON.parse(opts.body));
    return { ok: true, json: async () => ({ id: "fake_email_id" }) };
  }
  return realFetch(url, opts);
};

const supabasePath = require.resolve("../db/supabase");
const fakeSupabase = createFakeSupabase({ users: [], auth_code_attempts: [] });
require.cache[supabasePath] = { id: supabasePath, filename: supabasePath, loaded: true, exports: fakeSupabase };

const express = require("express");
const authRouter = require("../routes/auth");

function assert(cond, msg) {
  if (!cond) throw new Error("FAIL: " + msg);
}

function mailsTo(email) {
  return sentEmails.filter((e) => e.to[0] === email);
}

function lastCode(email) {
  const m = mailsTo(email).slice(-1)[0];
  const match = String(m?.text || "").match(/(?:code is|Kodun:|Your code:)\s*(\d{6})/);
  return match ? match[1] : null;
}

async function startServer() {
  const app = express();
  app.use(express.json());
  app.set("io", { sockets: { sockets: new Map() } });
  app.use("/api/auth", authRouter);
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  return { server, base: `http://127.0.0.1:${server.address().port}` };
}

async function req(base, method, urlPath, { body, token, headers } = {}) {
  const res = await fetch(`${base}${urlPath}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(headers || {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, body: json };
}

async function register(base, username, email) {
  const r = await req(base, "POST", "/api/auth/register", {
    body: { username, password: "password123", termsAccepted: true, birthDate: "2000-01-15", email },
  });
  assert(r.status === 201, "register " + username + " " + JSON.stringify(r.body));
  const v = await req(base, "POST", "/api/auth/email/verify", { token: r.body.token, body: { code: lastCode(email) } });
  assert(v.status === 200, "verify " + username + " " + JSON.stringify(v.body));
  return r.body;
}

async function run() {
  const { server, base } = await startServer();
  try {
    // auth-01: a username with capitals gets its reset code, typed in any case.
    await register(base, "Ahmet", "ahmet@example.com");
    for (const typed of ["Ahmet", "ahmet", "AHMET"]) {
      const before = mailsTo("ahmet@example.com").length;
      fakeSupabase._tables.users.rows.find((u) => u.username === "Ahmet").password_reset_sent_at = null;
      const r = await req(base, "POST", "/api/auth/password/forgot", { body: { usernameOrEmail: typed } });
      assert(r.status === 200, "forgot stays 200");
      assert(mailsTo("ahmet@example.com").length === before + 1, `reset code sent for "${typed}"`);
    }
    const code = lastCode("ahmet@example.com");
    let r = await req(base, "POST", "/api/auth/password/reset", {
      body: { usernameOrEmail: "ahmet", code, newPassword: "another-long-secret" },
    });
    assert(r.status === 200, "reset by lowercased username works: " + JSON.stringify(r.body));

    // auth-08: reset mails follow the request language, not the stale users.language
    // column (default "en", never written by the app).
    const ahmetRow = fakeSupabase._tables.users.rows.find((u) => u.username === "Ahmet");
    ahmetRow.language = "en";
    ahmetRow.password_reset_sent_at = null;
    await req(base, "POST", "/api/auth/password/forgot", { body: { usernameOrEmail: "ahmet@example.com" }, headers: { "Accept-Language": "tr" } });
    let mail = mailsTo("ahmet@example.com").slice(-1)[0];
    assert(/sıfırlama/.test(mail.subject), "Turkish app gets a Turkish reset mail: " + mail.subject);
    ahmetRow.password_reset_sent_at = null;
    await req(base, "POST", "/api/auth/password/forgot", { body: { usernameOrEmail: "Ahmet" }, headers: { "Accept-Language": "en" } });
    mail = mailsTo("ahmet@example.com").slice(-1)[0];
    assert(/reset/i.test(mail.subject) && !/sıfırlama/.test(mail.subject), "English app gets an English reset mail: " + mail.subject);

    // auth-02: five wrong 2FA codes lock the purpose; a new login sends no new code
    // and the answer says how long to wait.
    const bob = await register(base, "bob", "bob@example.com");
    r = await req(base, "POST", "/api/auth/2fa/enable", { token: bob.token });
    assert(r.status === 200, "bob enables email 2FA");
    let login = await req(base, "POST", "/api/auth/login", { body: { username: "bob", password: "password123" } });
    assert(login.body.requires2fa, "bob needs a code");
    for (let i = 0; i < 5; i += 1) {
      await req(base, "POST", "/api/auth/2fa/verify-login", { body: { pendingToken: login.body.pendingToken, code: "00000" + i } });
    }
    r = await req(base, "POST", "/api/auth/2fa/verify-login", { body: { pendingToken: login.body.pendingToken, code: "000009" } });
    assert(r.status === 429 && r.body.code === "code_locked", "sixth code is locked: " + JSON.stringify(r.body));
    assert(/Try again in \d+ minutes?/.test(r.body.error) && r.body.errorKey && r.body.errorVars?.minutes >= 1, "lock answer carries the wait: " + JSON.stringify(r.body));
    const mailsBefore = mailsTo("bob@example.com").length;
    login = await req(base, "POST", "/api/auth/login", { body: { username: "bob", password: "password123" } });
    assert(login.status === 429 && login.body.code === "code_locked", "login while locked answers the wait: " + JSON.stringify(login.body));
    assert(mailsTo("bob@example.com").length === mailsBefore, "no refused code is emailed while locked");

    // auth-13: a Google-only account turns email 2FA off only with the emailed code.
    const gina = await register(base, "gina", "gina@example.com");
    const ginaRow = fakeSupabase._tables.users.rows.find((u) => u.username === "gina");
    ginaRow.password_hash = null;
    ginaRow.auth_provider = "google";
    await req(base, "POST", "/api/auth/2fa/enable", { token: gina.token });
    r = await req(base, "POST", "/api/auth/2fa/disable", { token: gina.token, body: {} });
    assert(r.status === 428 && r.body.code === "reauth_required", "session alone cannot turn 2FA off: " + JSON.stringify(r.body));
    r = await req(base, "POST", "/api/auth/2fa/disable", { token: gina.token, body: { code: "123456" } });
    assert(r.status === 401, "wrong reauth code refused");
    r = await req(base, "POST", "/api/auth/email/reauth", { token: gina.token });
    assert(r.status === 200, "reauth code sent: " + JSON.stringify(r.body));
    r = await req(base, "POST", "/api/auth/2fa/disable", { token: gina.token, body: { code: lastCode("gina@example.com") } });
    assert(r.status === 200 && ginaRow.two_factor_enabled === false, "reauth code turns 2FA off: " + JSON.stringify(r.body));

    // auth-13: wrong passwords on account delete are rate limited.
    const dave = await register(base, "dave", "dave@example.com");
    let last = null;
    for (let i = 0; i < 12; i += 1) {
      last = await req(base, "POST", "/api/auth/account/delete", { token: dave.token, body: { password: "nope-" + i } });
    }
    assert(last.status === 429, "delete password guesses are limited: " + last.status);

    // auth-18: the legacy switch refuses while the authenticator app is on.
    const erin = await register(base, "erin", "erin@example.com");
    const erinRow = fakeSupabase._tables.users.rows.find((u) => u.username === "erin");
    Object.assign(erinRow, { totp_enabled_at: new Date().toISOString(), totp_secret_enc: "x", totp_pending_enc: null, totp_pending_at: null, totp_last_counter: null, totp_recovery_hashes: [], two_factor_enabled: true });
    r = await req(base, "POST", "/api/auth/2fa/disable", { token: erin.token, body: { password: "password123" } });
    assert(r.status === 409 && r.body.code === "totp_on" && erinRow.two_factor_enabled === true, "TOTP stays consistent: " + JSON.stringify(r.body));

    // auth-10: an address left unverified for over a day does not block a new account;
    // one typed minutes ago (someone mid sign-up) still does.
    const old = new Date(Date.now() - 3 * 86400000).toISOString();
    fakeSupabase._tables.users.rows.push(
      { id: "aaaaaaaa-0000-4000-8000-000000000001", username: "squat", email: "victim@example.com", email_confirmed_at: null, confirmation_sent_at: old, created_at: old },
      { id: "aaaaaaaa-0000-4000-8000-000000000002", username: "midway", email: "fresh@example.com", email_confirmed_at: null, confirmation_sent_at: new Date().toISOString(), created_at: new Date().toISOString() }
    );
    r = await req(base, "POST", "/api/auth/register", {
      body: { username: "victim", password: "password123", termsAccepted: true, birthDate: "2000-01-15", email: "victim@example.com" },
    });
    assert(r.status === 201, "stale unverified holder does not block sign-up: " + JSON.stringify(r.body));
    assert(fakeSupabase._tables.users.rows.find((u) => u.username === "squat").email === null, "stale holder lost the address");
    r = await req(base, "POST", "/api/auth/register", {
      body: { username: "second", password: "password123", termsAccepted: true, birthDate: "2000-01-15", email: "fresh@example.com" },
    });
    assert(r.status === 409, "a fresh unverified holder keeps the address");

    // auth-09: verify never says "verified" when the address was taken meanwhile.
    const fay = await register(base, "fay", "fay@example.com");
    r = await req(base, "POST", "/api/auth/email/set", { token: fay.token, body: { email: "shared@example.com", password: "password123" } });
    assert(r.status === 200, "fay starts a change");
    const setCode = lastCode("shared@example.com");
    fakeSupabase._tables.users.rows.push({ id: "aaaaaaaa-0000-4000-8000-000000000003", username: "quick", email: "shared@example.com", email_confirmed_at: new Date().toISOString() });
    r = await req(base, "POST", "/api/auth/email/verify", { token: fay.token, body: { code: setCode } });
    assert(r.status === 409, "taken address is not reported as verified: " + JSON.stringify(r.body));
    const fayRow = fakeSupabase._tables.users.rows.find((u) => u.username === "fay");
    assert(fayRow.email === "fay@example.com" && fayRow.pending_email === "shared@example.com", "old address kept, change still pending");

    console.log("authPolish.integration.test.cjs: ok");
  } finally {
    server.close();
  }
}

run().catch((err) => {
  console.error(err.stack || err.message);
  process.exit(1);
});
