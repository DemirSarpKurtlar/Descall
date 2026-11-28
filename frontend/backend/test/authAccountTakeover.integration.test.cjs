"use strict";

/**
 * Account takeover regressions (auth audit, 28 Nov 2026):
 *  1. Google / Apple sign-in linked an existing account by e-mail with an unescaped
 *     ILIKE, so "_" in the provider's verified address matched any one character
 *     ("john_doe@outlook.com" matched "john.doe@outlook.com") and the attacker's
 *     Google / Apple identity was linked to, and signed in as, someone else.
 *  2. The authenticator-app (TOTP) code at sign-in had only the in-memory limiter
 *     (30 per 15 minutes, gone on restart, per node); e-mail codes already lock after
 *     five wrong codes for the rolling hour in auth_code_attempts.
 */

process.env.PASSWORD_HIBP = "0";
process.env.JWT_SECRET = "test-secret-do-not-use-in-prod";
process.env.JWT_EXPIRES_IN = "7d";
process.env.SUPABASE_URL = "https://placeholder.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "placeholder-key";
process.env.RESEND_API_KEY = "test-resend-key";
process.env.FEEDBACK_EMAIL_FROM = "support@descall.com";
process.env.GOOGLE_CLIENT_ID = "test-google-client.apps.googleusercontent.com";

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

// Google ID token check: the payload the test sets is what Google "verified".
let googlePayload = null;
const { OAuth2Client } = require("google-auth-library");
OAuth2Client.prototype.verifyIdToken = async function verifyIdToken() {
  if (!googlePayload) throw new Error("no google payload");
  const p = googlePayload;
  return { getPayload: () => p };
};

const supabasePath = require.resolve("../db/supabase");
const fakeSupabase = createFakeSupabase({ users: [], auth_code_attempts: [] });
require.cache[supabasePath] = { id: supabasePath, filename: supabasePath, loaded: true, exports: fakeSupabase };

const express = require("express");
const authRouter = require("../routes/auth");
const appleAuth = require("../lib/appleAuth");
const totp = require("../lib/totp");
const { resetLimits } = require("../lib/rateLimit");

function assert(cond, msg) {
  if (!cond) throw new Error("FAIL: " + msg);
}

function lastCode(email) {
  const m = sentEmails.filter((e) => e.to[0] === email).slice(-1)[0];
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

async function req(base, method, urlPath, { body, token } = {}) {
  const res = await fetch(`${base}${urlPath}`, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, body: json };
}

async function registerVerified(base, username, email) {
  const r = await req(base, "POST", "/api/auth/register", {
    body: { username, password: "password123", termsAccepted: true, birthDate: "2000-01-15", email },
  });
  assert(r.status === 201, "register " + username + " " + JSON.stringify(r.body));
  const v = await req(base, "POST", "/api/auth/email/verify", { token: r.body.token, body: { code: lastCode(email) } });
  assert(v.status === 200, "verify " + username + " " + JSON.stringify(v.body));
  return fakeSupabase._tables.users.rows.find((u) => u.username === username);
}

async function run() {
  const { server, base } = await startServer();
  const realAppleVerify = appleAuth.verifyIdentityToken;
  try {
    // ---- 1a. Google: "_" in the Google address must not match another account ----
    const victim = await registerVerified(base, "victim", "john.doe@outlook.com");
    googlePayload = { sub: "google-attacker", email: "john_doe@outlook.com", email_verified: true, name: "Attacker" };
    let r = await req(base, "POST", "/api/auth/google", { body: { credential: "x" } });
    assert(!(r.body?.user?.id === victim.id), "Google sign-in with a look-alike address does not sign in as the victim: " + JSON.stringify(r.body));
    assert(r.body?.token == null || r.body?.user?.id !== victim.id, "no victim session for the attacker");
    assert(victim.google_id == null, "victim's account is not linked to the attacker's Google identity");
    assert(victim.display_name !== "Attacker", "victim's profile is untouched");

    // Control: the exact address still links (the documented behaviour).
    const exact = await registerVerified(base, "exactg", "exact.g@outlook.com");
    googlePayload = { sub: "google-exact", email: "Exact.G@outlook.com", email_verified: true };
    r = await req(base, "POST", "/api/auth/google", { body: { credential: "x" } });
    assert(r.status === 200 && r.body.user?.id === exact.id, "Google links the account with the same verified address: " + JSON.stringify(r.body));
    assert(exact.google_id === "google-exact", "exact match is linked");

    // ---- 1b. Apple: same rule ----
    const appleVictim = await registerVerified(base, "janedoe", "jane.doe@outlook.com");
    appleAuth.verifyIdentityToken = async () => ({ sub: "apple-attacker", email: "jane_doe@outlook.com", emailVerified: true, isPrivateEmail: false });
    r = await req(base, "POST", "/api/auth/apple", { body: { identityToken: "x" } });
    assert(r.body?.user?.id !== appleVictim.id, "Apple sign-in with a look-alike address does not sign in as the victim: " + JSON.stringify(r.body));
    assert(appleVictim.apple_sub == null, "victim's account is not linked to the attacker's Apple identity");

    const appleExact = await registerVerified(base, "exacta", "exact.a@outlook.com");
    appleAuth.verifyIdentityToken = async () => ({ sub: "apple-exact", email: "exact.a@outlook.com", emailVerified: true, isPrivateEmail: false });
    r = await req(base, "POST", "/api/auth/apple", { body: { identityToken: "x" } });
    assert(r.status === 200 && r.body.user?.id === appleExact.id, "Apple links the account with the same verified address: " + JSON.stringify(r.body));
    appleAuth.verifyIdentityToken = realAppleVerify;

    // ---- 2. TOTP at sign-in: five wrong codes lock it (persisted, survives a restart) ----
    const secret = totp.generateSecret();
    const totpUser = await registerVerified(base, "totpuser", "totp.user@example.com");
    Object.assign(totpUser, {
      totp_secret_enc: totp.encryptSecret(secret),
      totp_pending_enc: null,
      totp_pending_at: null,
      totp_enabled_at: new Date().toISOString(),
      totp_last_counter: null,
      totp_recovery_hashes: [],
      two_factor_enabled: true,
    });
    const login = async () => {
      const l = await req(base, "POST", "/api/auth/login", { body: { username: "totpuser", password: "password123" } });
      assert(l.status === 200 && l.body.requires2fa && l.body.method === "totp", "password step asks for the app code: " + JSON.stringify(l.body));
      return l.body.pendingToken;
    };
    const currentCode = () => totp.hotp(secret, Math.floor(Date.now() / 30000));
    const wrongCode = () => {
      const good = new Set([-1, 0, 1].map((d) => totp.hotp(secret, Math.floor(Date.now() / 30000) + d)));
      let c = "000000";
      for (let i = 0; good.has(c); i += 1) c = String(i).padStart(6, "0");
      return c;
    };

    let pending = await login();
    for (let i = 0; i < 5; i += 1) {
      r = await req(base, "POST", "/api/auth/2fa/verify-login", { body: { pendingToken: pending, code: wrongCode() } });
      assert(r.status === 401, `wrong app code ${i + 1} is refused: ` + JSON.stringify(r.body));
    }
    r = await req(base, "POST", "/api/auth/2fa/verify-login", { body: { pendingToken: pending, code: currentCode() } });
    assert(r.status === 429 && r.body.code === "code_locked" && !r.body.token, "after five wrong app codes even the right one is locked: " + JSON.stringify(r.body));
    // A restart (or another node) clears the in-memory limiter; the lock must stay.
    resetLimits();
    r = await req(base, "POST", "/api/auth/2fa/verify-login", { body: { pendingToken: pending, code: currentCode() } });
    assert(r.status === 429 && r.body.code === "code_locked", "the lock survives a wiped in-memory limiter: " + JSON.stringify(r.body));
    // The password step says so too instead of handing out another pending token.
    r = await req(base, "POST", "/api/auth/login", { body: { username: "totpuser", password: "password123" } });
    assert(r.status === 429 && r.body.code === "code_locked", "sign-in answers the lock: " + JSON.stringify(r.body));

    // Control: a typo or two, then the right code, still signs in and clears the count.
    fakeSupabase._tables.auth_code_attempts.rows.length = 0;
    require("../lib/authAttempts").resetAttemptMemory();
    resetLimits();
    totpUser.totp_last_counter = null;
    pending = await login();
    r = await req(base, "POST", "/api/auth/2fa/verify-login", { body: { pendingToken: pending, code: wrongCode() } });
    assert(r.status === 401, "one typo is refused");
    r = await req(base, "POST", "/api/auth/2fa/verify-login", { body: { pendingToken: pending, code: currentCode() } });
    assert(r.status === 200 && r.body.token, "the right code signs in: " + JSON.stringify(r.body));
    const left = fakeSupabase._tables.auth_code_attempts.rows.filter((x) => x.user_id === totpUser.id && x.purpose === "2fa_totp");
    assert(!left.length || left.every((x) => !x.attempts), "a successful code clears the count");

    console.log("authAccountTakeover.integration.test: ok");
  } finally {
    appleAuth.verifyIdentityToken = realAppleVerify;
    server.close();
  }
}

run().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  }
);
