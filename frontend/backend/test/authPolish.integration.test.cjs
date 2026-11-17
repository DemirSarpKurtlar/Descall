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

    console.log("authPolish.integration.test.cjs: ok");
  } finally {
    server.close();
  }
}

run().catch((err) => {
  console.error(err.stack || err.message);
  process.exit(1);
});
