"use strict";

// Passkeys (routes/passkeys.js + lib/passkeys/*): the real router and the real
// @simplewebauthn/server verification, driven by a software authenticator
// (test/softAuthenticator.cjs) over HTTP. The database, mail and the /login gates of
// routes/auth.js are in-memory stand-ins.
//   node frontend/backend/routes/passkeys.selftest.cjs

process.env.JWT_SECRET = process.env.JWT_SECRET || "selftest-jwt-secret-selftest-jwt-secret";

const assert = require("node:assert/strict");
const http = require("node:http");
const crypto = require("node:crypto");
const express = require("express");
const { readConfig, normalizeFingerprint, androidOriginFromFingerprint } = require("../lib/passkeys/config");
const { createMemoryStore } = require("../lib/passkeys/store");
const { userHandleFor } = require("../lib/passkeys/service");
const meta = require("../lib/passkeys/meta");
const { createPasskeyRouter } = require("./passkeys");
const { createSoftAuthenticator } = require("../test/softAuthenticator.cjs");
const jwt = require("../config/jwt");

const FP = "14:6D:E9:83:C5:73:06:50:D8:EE:B9:95:2F:34:FC:64:16:A0:83:42:E6:1D:BE:A8:8A:04:96:B2:3F:CF:44:E5";
const ANDROID_ORIGIN = androidOriginFromFingerprint(FP);

// ---- config ------------------------------------------------------------------------------
{
  const c = readConfig({ PASSKEY_ANDROID_CERT_SHA256: `${FP}, not-a-fingerprint` });
  assert.equal(c.rpId, "descall.com");
  assert.deepEqual([...c.webOrigins], ["https://descall.com"]);
  assert.ok(!c.origins.includes("https://www.descall.com"), "www only redirects, it never hosts a page");
  assert.equal(ANDROID_ORIGIN, `android:apk-key-hash:${Buffer.from(FP.replace(/:/g, ""), "hex").toString("base64url")}`);
  assert.deepEqual([...c.origins], ["https://descall.com", ANDROID_ORIGIN]);
  assert.equal(normalizeFingerprint(FP.toLowerCase().replace(/:/g, "")), FP);
  assert.equal(normalizeFingerprint("AA:BB"), null);
  const evil = readConfig({ PASSKEY_ORIGINS: "https://evil.com,http://descall.com,https://app.descall.com" });
  assert.deepEqual([...evil.webOrigins], ["https://app.descall.com"], "only https origins of the rp id survive");
  assert.equal(readConfig({ PASSKEYS_ENABLED: "0" }).enabled, false);
  assert.equal(readConfig({ ANDROID_CERT_SHA256: FP }).androidOrigins.length, 1, "build-time variable name works too");
}

// ---- meta helpers ------------------------------------------------------------------------
{
  assert.equal(meta.defaultPasskeyName({ aaguid: "fbfc3007-154e-4ecc-8c0b-6e020557d7bd", userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)" }), "iCloud Keychain (iPhone)");
  assert.equal(meta.defaultPasskeyName({ aaguid: "08987058-cadc-4b81-b6e1-30de50dcbe96", platform: "windows" }), "Windows Hello");
  assert.equal(meta.defaultPasskeyName({ platform: "android" }), "Android passkey");
  assert.equal(meta.sanitizeName("  My\u0000 key ‮ "), "My key");
  assert.equal(meta.sanitizeName("   "), null);
  assert.equal(meta.sanitizeName("x".repeat(100)).length, 64);
  assert.equal(meta.normalizePlatform("tauri"), "windows");
  assert.equal(meta.normalizePlatform("haxx"), "other");
}

// ---- harness -----------------------------------------------------------------------------
const UID = { a: "11111111-1111-4111-8111-111111111111", b: "22222222-2222-4222-8222-222222222222", tfa: "33333333-3333-4333-8333-333333333333", banned: "44444444-4444-4444-8444-444444444444", nopw: "55555555-5555-4555-8555-555555555555" };
const HASH = "hash:pw";
const users = new Map([
  [UID.a, { id: UID.a, username: "alice", email: "a@example.com", email_confirmed_at: "2026-01-01", password_hash: HASH, two_factor_enabled: false }],
  [UID.b, { id: UID.b, username: "bob", email: "b@example.com", email_confirmed_at: "2026-01-01", password_hash: HASH, two_factor_enabled: false }],
  [UID.tfa, { id: UID.tfa, username: "tfa", email: "t@example.com", email_confirmed_at: "2026-01-01", password_hash: HASH, two_factor_enabled: true }],
  [UID.banned, { id: UID.banned, username: "banned", email: null, password_hash: HASH, is_banned: true, ban_expires_at: null }],
  [UID.nopw, { id: UID.nopw, username: "googler", email: "g@example.com", email_confirmed_at: "2026-01-01", password_hash: null, reauthentication_token: "h:654321", reauthentication_sent_at: new Date().toISOString() }],
]);

const sessions = [];
const mails = [];
const events = [];
const emits = [];
let clock = Date.now();
let store = createMemoryStore();
const config = readConfig({ PASSKEY_ANDROID_CERT_SHA256: FP });

const kit = {
  async rejectIfBanned(res, user) {
    if (!user.is_banned) return false;
    res.status(403).json({ error: "Account banned.", code: "ACCOUNT_BANNED", banTicket: "ticket" });
    return true;
  },
  async rejectIfChildAccount() {
    return false;
  },
  async accessGate(req, res) {
    if (req.get("x-test-access-ban") !== "1") return false;
    res.status(403).json({ error: "Access banned.", code: "ACCESS_BANNED" });
    return true;
  },
  async hasSecondFactor(user) {
    return Boolean(user.two_factor_enabled);
  },
  async secondFactorGate(res, user) {
    if (!user.two_factor_enabled) return false;
    res.status(200).json({ requires2fa: true, method: "email", pendingToken: "pending" });
    return true;
  },
  authUserPayload: (u) => ({ id: u.id, username: u.username }),
  resolveEquippedExtra: async () => ({}),
  async judgeCode({ code, storedHash }) {
    return storedHash === `h:${code}` ? { ok: true } : { ok: false, reason: "mismatch" };
  },
  codeLockedBody: async () => ({ error: "locked", code: "code_locked" }),
};

function buildApp() {
  const router = createPasskeyRouter({
    __noDefaults: true,
    config,
    get store() {
      return store;
    },
    now: () => clock,
    kit,
    requireAuth(req, res, next) {
      const id = req.get("x-test-user");
      if (!id) return res.status(401).json({ error: "Missing auth" });
      req.user = { id, username: users.get(id)?.username, sid: req.get("x-test-sid") || "sid-1" };
      if (req.get("x-test-api-token") === "1") req.apiToken = { id: "tok" };
      next();
    },
    clientIp: (req) => req.get("x-test-ip") || "10.0.0.1",
    async createSession(userId, opts) {
      const session = { id: crypto.randomUUID(), method: opts.method };
      sessions.push({ userId, ...session });
      return { session };
    },
    signToken: ({ id, sid }) => `token:${id}:${sid}`,
    signReauthToken: jwt.signPasskeyReauthToken,
    verifyToken: jwt.verifyToken,
    loadLoginUser: async (id) => users.get(id) || null,
    loadBasicUser: async (id) => users.get(id) || null,
    clearReauthCode: async (id) => {
      users.get(id).reauthentication_token = null;
    },
    verifyPassword: async (pw, hash) => hash === HASH && pw === "correct horse",
    totpState: async () => ({ enabled: false }),
    verifyTotp: async () => false,
    cancelDeletion: async () => {},
    afterLogin: async () => {},
    securityNote: (type, o) => events.push({ type, reason: o.reason, userId: o.userId }),
    audit: () => {},
    notify: async (user, kind, _req, vars) => mails.push({ to: user.email, kind, vars }),
    emit: (_req, userId, event, payload) => emits.push({ userId, event, payload }),
  });
  const app = express();
  app.use(express.json({ limit: "200kb" }));
  app.use("/api/auth/passkeys", router);
  return app;
}

// The router reads `store` once (lazy deps); swap it by rebuilding.
let server;
let base;
async function start() {
  if (server) await new Promise((r) => server.close(r));
  server = http.createServer(buildApp());
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${server.address().port}/api/auth/passkeys`;
}

async function call(method, path, { body, user, sid, headers = {}, ip } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: {
      "content-type": "application/json",
      ...(user ? { "x-test-user": user } : {}),
      ...(sid ? { "x-test-sid": sid } : {}),
      ...(ip ? { "x-test-ip": ip } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { status: res.status, body: json };
}

async function reauthToken(user, sid) {
  const r = await call("POST", "/reauth", { user, sid, body: { password: "correct horse" } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return r.body.reauthToken;
}

async function registerPasskey(auth, user, { origin = "https://descall.com", name, platform = "web", sid, uv = true } = {}) {
  const token = await reauthToken(user, sid);
  const opts = await call("POST", "/register/options", { user, sid, body: { reauthToken: token, platform } });
  assert.equal(opts.status, 200, JSON.stringify(opts.body));
  const response = auth.create(opts.body, { origin, uv });
  return call("POST", "/register/verify", { user, sid, body: { reauthToken: token, response, name, platform } });
}

async function signIn(auth, o = {}) {
  const opts = await call("POST", "/auth/options", { body: { platform: o.platform || "web" }, ip: o.ip });
  assert.equal(opts.status, 200, JSON.stringify(opts.body));
  assert.equal(opts.body.userVerification, "required", "sign-in asks for user verification");
  assert.deepEqual(opts.body.allowCredentials || [], [], "discoverable: no username, no allow list");
  const response = auth.get(opts.body, o);
  return call("POST", "/auth/verify", { body: { response, platform: o.platform || "web" }, ip: o.ip, headers: o.headers || {} });
}

(async () => {
  await start();

  // Config endpoint.
  {
    const r = await call("GET", "/config");
    assert.equal(r.status, 200);
    assert.deepEqual(r.body, { enabled: true, ready: true, rpId: "descall.com", android: true });
  }

  const authA = createSoftAuthenticator();

  // Registration needs a signed-in session and a fresh re-auth for this session.
  {
    assert.equal((await call("POST", "/register/options", { body: {} })).status, 401, "signed out");
    const noReauth = await call("POST", "/register/options", { user: UID.a, body: {} });
    assert.equal(noReauth.status, 428);
    assert.equal(noReauth.body.code, "REAUTH_REQUIRED");
    const bad = await call("POST", "/reauth", { user: UID.a, body: { password: "wrong" } });
    assert.equal(bad.status, 401);
    assert.equal(bad.body.code, "BAD_PASSWORD");
    const other = await reauthToken(UID.a, "sid-other");
    const wrongSid = await call("POST", "/register/options", { user: UID.a, sid: "sid-1", body: { reauthToken: other } });
    assert.equal(wrongSid.status, 428, "a re-auth proof of another session does not count");
    const bobToken = await reauthToken(UID.b);
    const wrongUser = await call("POST", "/register/options", { user: UID.a, body: { reauthToken: bobToken } });
    assert.equal(wrongUser.status, 428, "a re-auth proof of another account does not count");
    const apiTok = await call("POST", "/register/options", { user: UID.a, headers: { "x-test-api-token": "1" }, body: { reauthToken: await reauthToken(UID.a) } });
    assert.equal(apiTok.status, 403, "admin API tokens never manage passkeys");
    // A session token is not a re-auth proof.
    const sessionTok = await call("POST", "/register/options", { user: UID.a, body: { reauthToken: jwt.signToken({ id: UID.a, username: "alice", sid: "sid-1" }) } });
    assert.equal(sessionTok.status, 428);
  }

  // No-password account (Google / Apple): the e-mail reauth code, single use.
  {
    const wrong = await call("POST", "/reauth", { user: UID.nopw, body: { code: "111111" } });
    assert.equal(wrong.status, 401);
    const ok = await call("POST", "/reauth", { user: UID.nopw, body: { code: "654321" } });
    assert.equal(ok.status, 200);
    assert.ok(ok.body.reauthToken);
    const again = await call("POST", "/reauth", { user: UID.nopw, body: { code: "654321" } });
    assert.equal(again.status, 401, "the code is cleared after use");
    const pw = await call("POST", "/reauth", { user: UID.nopw, body: { password: "x" } });
    assert.equal(pw.body.code, "NO_PASSWORD");
  }

  // Register on the web.
  let passkeyA;
  {
    const r = await registerPasskey(authA, UID.a, { name: "  Laptop  " });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    passkeyA = r.body.passkey;
    assert.equal(passkeyA.name, "Laptop");
    assert.equal(passkeyA.provider, "iCloud Keychain");
    assert.equal(passkeyA.synced, true);
    assert.equal(passkeyA.platform, "web");
    assert.ok(!("public_key" in passkeyA) && !("publicKey" in passkeyA), "never sends the public key back");
    assert.ok(mails.some((m) => m.kind === "passkeyAdded" && m.to === "a@example.com" && m.vars.name === "Laptop"), "new passkey mails the owner");
    assert.ok(emits.some((e) => e.userId === UID.a && e.event === "passkeys:changed"));
    const list = await call("GET", "/", { user: UID.a });
    assert.equal(list.status, 200);
    assert.equal(list.body.passkeys.length, 1);
    assert.equal(list.body.max, 20);
    assert.deepEqual(list.body.reauthMethods, ["password", "passkey"]);
    assert.equal(list.body.userHandle, Buffer.from(userHandleFor(UID.a)).toString("base64url"));
    assert.equal(list.body.passkeys[0].credentialId.length > 16, true);
  }

  // Registration: origin allow-list, rp id, user verification, single-use challenge.
  {
    for (const origin of ["https://evil.example", "https://www.descall.com", "http://descall.com", "android:apk-key-hash:AAAA"]) {
      const r = await registerPasskey(createSoftAuthenticator(), UID.a, { origin });
      assert.equal(r.status, 400, `origin ${origin} refused`);
    }
    const noUv = await registerPasskey(createSoftAuthenticator(), UID.a, { uv: false });
    assert.equal(noUv.status, 400, "registration requires user verification");
    // A response for another rp id.
    const token = await reauthToken(UID.a);
    const opts = await call("POST", "/register/options", { user: UID.a, body: { reauthToken: token } });
    const resp = createSoftAuthenticator().create(opts.body, { rpIdOverride: "evil.example" });
    assert.equal((await call("POST", "/register/verify", { user: UID.a, body: { reauthToken: token, response: resp } })).status, 400);
    // Replaying a used challenge.
    const opts2 = await call("POST", "/register/options", { user: UID.a, body: { reauthToken: token } });
    const soft = createSoftAuthenticator();
    const first = soft.create(opts2.body);
    assert.equal((await call("POST", "/register/verify", { user: UID.a, body: { reauthToken: token, response: first } })).status, 201);
    const replay = soft.create(opts2.body);
    const rr = await call("POST", "/register/verify", { user: UID.a, body: { reauthToken: token, response: replay } });
    assert.equal(rr.status, 400);
    assert.equal(rr.body.code, "CHALLENGE_EXPIRED");
    // Options issued for Alice cannot register on Bob's account.
    const opts3 = await call("POST", "/register/options", { user: UID.a, body: { reauthToken: token } });
    const bobTok = await reauthToken(UID.b);
    const cross = await call("POST", "/register/verify", { user: UID.b, body: { reauthToken: bobTok, response: createSoftAuthenticator().create(opts3.body) } });
    assert.equal(cross.status, 400);
    assert.equal(cross.body.code, "CHALLENGE_MISMATCH");
    // Expired challenge.
    const opts4 = await call("POST", "/register/options", { user: UID.a, body: { reauthToken: token } });
    clock += 6 * 60 * 1000;
    const late = await call("POST", "/register/verify", { user: UID.a, body: { reauthToken: await reauthToken(UID.a), response: createSoftAuthenticator().create(opts4.body) } });
    assert.equal(late.body.code, "CHALLENGE_EXPIRED");
    clock = Date.now();
  }

  // Android app origin (android:apk-key-hash of the signing certificate).
  const authAndroid = createSoftAuthenticator({ aaguid: "ea9b8d66-4d01-1d21-3ce4-b6b48cb575d4" });
  {
    const r = await registerPasskey(authAndroid, UID.b, { origin: ANDROID_ORIGIN, platform: "android" });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.passkey.provider, "Google Password Manager");
    assert.equal(r.body.passkey.name, "Google Password Manager (Android)");
    const s = await signIn(authAndroid, { origin: ANDROID_ORIGIN, platform: "android" });
    assert.equal(s.status, 200, JSON.stringify(s.body));
    assert.equal(s.body.token.split(":")[1], UID.b);
  }

  // Sign-in with user verification: a session, method passkey.
  {
    const r = await signIn(authA);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.method, "passkey");
    assert.ok(r.body.token.startsWith(`token:${UID.a}:`));
    assert.equal(sessions.at(-1).method, "passkey", "session metadata notes the sign-in method");
    const list = await call("GET", "/", { user: UID.a });
    const row = list.body.passkeys.find((p) => p.id === passkeyA.id);
    assert.ok(row.lastUsedAt, "last used is recorded");
    assert.equal(row.useCount, 1);
  }

  // Wrong origin on sign-in.
  {
    const r = await signIn(authA, { origin: "https://evil.example" });
    assert.equal(r.status, 401);
    assert.equal(r.body.code, "VERIFY_FAILED");
    assert.ok(events.some((e) => e.type === "failed_login" && e.reason === "passkey_verify_failed"), "failed passkey sign-in is a security event");
  }

  // 2FA is skipped only with user verification.
  const authT = createSoftAuthenticator();
  {
    assert.equal((await registerPasskey(authT, UID.tfa)).status, 201);
    const uv = await signIn(authT);
    assert.equal(uv.status, 200);
    assert.ok(uv.body.token, "UV passkey satisfies the second step");
    assert.ok(!uv.body.requires2fa);
    const noUv = await signIn(authT, { uv: false });
    assert.equal(noUv.status, 200);
    assert.equal(noUv.body.requires2fa, true, "without UV the account's second factor is asked");
    assert.ok(!noUv.body.token);
    const noUvNo2fa = await signIn(authA, { uv: false });
    assert.equal(noUvNo2fa.status, 401);
    assert.equal(noUvNo2fa.body.code, "UV_REQUIRED", "without UV and without 2FA there is no session");
  }

  // Ban and access-ban checks exactly like /login.
  const authBan = createSoftAuthenticator();
  {
    users.get(UID.banned).is_banned = false;
    assert.equal((await registerPasskey(authBan, UID.banned)).status, 201);
    users.get(UID.banned).is_banned = true;
    const r = await signIn(authBan);
    assert.equal(r.status, 403);
    assert.equal(r.body.code, "ACCOUNT_BANNED");
    assert.ok(r.body.banTicket);
    const before = sessions.length;
    const ab = await signIn(authA, { headers: { "x-test-access-ban": "1" } });
    assert.equal(ab.status, 403);
    assert.equal(ab.body.code, "ACCESS_BANNED");
    assert.equal(sessions.length, before, "no session for a banned sign-in");
  }

  // Unknown credential and a userHandle of another account.
  {
    const ghost = createSoftAuthenticator();
    const opts = await call("POST", "/register/options", { user: UID.a, body: { reauthToken: await reauthToken(UID.a) } });
    ghost.create(opts.body); // never verified: not stored
    const r = await signIn(ghost);
    assert.equal(r.status, 401);
    assert.equal(r.body.code, "UNKNOWN_CREDENTIAL");
    assert.ok(r.body.credentialId, "the client can signal the platform to drop it");
    const swapped = await signIn(authA, { userHandle: Buffer.from(userHandleFor(UID.b)).toString("base64url") });
    assert.equal(swapped.status, 401, "userHandle must belong to the key's account");
    const noHandle = await signIn(authA, { userHandle: null });
    assert.equal(noHandle.status, 401, "discoverable sign-in needs the user handle");
  }

  // Counter regression: suspected clone, key suspended, owner mailed.
  {
    const authC = createSoftAuthenticator();
    const reg = await registerPasskey(authC, UID.b);
    assert.equal(reg.status, 201);
    const id = reg.body.passkey.id;
    assert.equal((await signIn(authC, { counter: 5 })).status, 200);
    assert.equal((await signIn(authC, { counter: 7 })).status, 200);
    const cloned = await signIn(authC, { counter: 6 });
    assert.equal(cloned.status, 403);
    assert.equal(cloned.body.code, "CLONED");
    assert.ok(mails.some((m) => m.kind === "passkeyCloned" && m.to === "b@example.com"));
    const after = await signIn(authC, { counter: 50 });
    assert.equal(after.body.code, "SUSPENDED", "a suspended key never signs in again");
    const list = await call("GET", "/", { user: UID.b });
    assert.equal(list.body.passkeys.find((p) => p.id === id).suspended, true);
    // Synced passkeys that always report 0 keep working.
    assert.equal((await signIn(authA)).status, 200);
    assert.equal((await signIn(authA)).status, 200);
  }

  // Challenge for sign-in is single use.
  {
    const opts = await call("POST", "/auth/options", { body: {} });
    const resp = authA.get(opts.body);
    assert.equal((await call("POST", "/auth/verify", { body: { response: resp } })).status, 200);
    const again = await call("POST", "/auth/verify", { body: { response: resp } });
    assert.equal(again.body.code, "CHALLENGE_EXPIRED");
    // Garbage bodies.
    assert.equal((await call("POST", "/auth/verify", { body: { response: { id: "x" } } })).status, 400);
    assert.equal((await call("POST", "/auth/verify", { body: {} })).status, 400);
  }

  // Rename / delete: only your own passkeys.
  {
    const bobRename = await call("PATCH", `/${passkeyA.id}`, { user: UID.b, body: { name: "mine now" } });
    assert.equal(bobRename.status, 404);
    const bobDelete = await call("DELETE", `/${passkeyA.id}`, { user: UID.b });
    assert.equal(bobDelete.status, 404);
    assert.equal((await call("PATCH", `/${passkeyA.id}`, { user: UID.a, body: { name: "  " } })).status, 400);
    assert.equal((await call("PATCH", `/not-a-uuid`, { user: UID.a, body: { name: "x" } })).status, 404);
    const ren = await call("PATCH", `/${passkeyA.id}`, { user: UID.a, body: { name: "Work laptop" } });
    assert.equal(ren.status, 200);
    assert.equal(ren.body.passkey.name, "Work laptop");
  }

  // Re-auth with an existing passkey (UV required), bound to the account.
  {
    const opts = await call("POST", "/reauth/options", { user: UID.a, body: {} });
    assert.equal(opts.status, 200);
    assert.ok(opts.body.allowCredentials.length >= 1);
    const ok = await call("POST", "/reauth/verify", { user: UID.a, body: { response: authA.get(opts.body) } });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    assert.ok(ok.body.reauthToken);
    const opts2 = await call("POST", "/reauth/options", { user: UID.a, body: {} });
    const noUv = await call("POST", "/reauth/verify", { user: UID.a, body: { response: authA.get(opts2.body, { uv: false }) } });
    assert.equal(noUv.body.code, "UV_REQUIRED");
    const opts3 = await call("POST", "/reauth/options", { user: UID.b, body: {} });
    const wrong = await call("POST", "/reauth/verify", { user: UID.b, body: { response: authA.get(opts3.body) } });
    assert.equal(wrong.status, 401, "another account's passkey is no re-auth");
  }

  // Desktop browser handoff: sign-in.
  {
    const h = await call("POST", "/handoff", { body: { platform: "electron" } });
    assert.equal(h.status, 201);
    assert.match(h.body.url, /^https:\/\/descall\.com\/passkey\/desktop#c=[A-Za-z0-9_-]{43}$/, "the one-time code travels in the URL fragment only");
    assert.match(h.body.matchCode, /^\d{4}$/);
    const code = h.body.url.split("#c=")[1];
    assert.notEqual(code, h.body.pollSecret);
    const pending = await call("POST", "/handoff/poll", { body: { pollSecret: h.body.pollSecret } });
    assert.equal(pending.body.status, "pending");
    const info = await call("POST", "/handoff/info", { body: { code } });
    assert.equal(info.body.kind, "signin");
    assert.equal(info.body.matchCode, h.body.matchCode);
    assert.equal((await call("POST", "/handoff/info", { body: { code: "x".repeat(43) } })).status, 404);
    // A plain sign-in challenge is not accepted for the handoff (bound to it).
    const plain = await call("POST", "/auth/options", { body: {} });
    const mismatch = await call("POST", "/handoff/auth/verify", { body: { code, response: authA.get(plain.body) } });
    assert.equal(mismatch.body.code, "CHALLENGE_MISMATCH");
    const opts = await call("POST", "/handoff/auth/options", { body: { code } });
    assert.equal(opts.status, 200);
    const done = await call("POST", "/handoff/auth/verify", { body: { code, response: authA.get(opts.body) } });
    assert.equal(done.status, 200, JSON.stringify(done.body));
    assert.ok(!done.body.token, "the browser never gets the app's session");
    assert.equal((await call("POST", "/handoff/poll", { body: { pollSecret: "y".repeat(43) } })).status, 404);
    const got = await call("POST", "/handoff/poll", { body: { pollSecret: h.body.pollSecret } });
    assert.equal(got.status, 200, JSON.stringify(got.body));
    assert.ok(got.body.token.startsWith(`token:${UID.a}:`));
    const twice = await call("POST", "/handoff/poll", { body: { pollSecret: h.body.pollSecret } });
    assert.equal(twice.status, 410, "single use");
    assert.equal((await call("POST", "/handoff/info", { body: { code } })).status, 404, "used code is gone");
  }

  // Desktop browser handoff: adding a passkey needs the signed-in app plus re-auth.
  {
    assert.equal((await call("POST", "/handoff/register", { body: {} })).status, 401);
    assert.equal((await call("POST", "/handoff/register", { user: UID.b, body: {} })).status, 428);
    const h = await call("POST", "/handoff/register", { user: UID.b, body: { reauthToken: await reauthToken(UID.b), platform: "electron" } });
    assert.equal(h.status, 201);
    const code = h.body.url.split("#c=")[1];
    const info = await call("POST", "/handoff/info", { body: { code } });
    assert.equal(info.body.username, "bob");
    assert.equal((await call("POST", "/handoff/auth/options", { body: { code } })).status, 404, "a register link cannot sign in");
    const opts = await call("POST", "/handoff/register/options", { body: { code } });
    assert.equal(opts.status, 200);
    assert.equal(opts.body.user.name, "bob");
    const soft = createSoftAuthenticator({ aaguid: "08987058-cadc-4b81-b6e1-30de50dcbe96" });
    const reg = await call("POST", "/handoff/register/verify", { body: { code, response: soft.create(opts.body) } });
    assert.equal(reg.status, 201, JSON.stringify(reg.body));
    assert.equal(reg.body.passkey.platform, "electron");
    const got = await call("POST", "/handoff/poll", { body: { pollSecret: h.body.pollSecret } });
    assert.equal(got.body.status, "registered");
    assert.equal(got.body.passkey.name, "Windows Hello");
  }

  // Delete, with the owner's e-mail.
  {
    const del = await call("DELETE", `/${passkeyA.id}`, { user: UID.a });
    assert.equal(del.status, 200);
    assert.ok(del.body.credentialId);
    assert.ok(mails.some((m) => m.kind === "passkeyRemoved" && m.to === "a@example.com"));
    const r = await signIn(authA);
    assert.equal(r.body.code, "UNKNOWN_CREDENTIAL", "a removed passkey no longer signs in");
  }

  // Rate limit like /login: 40 failures per address.
  {
    let last;
    for (let i = 0; i < 45; i += 1) {
      last = await call("POST", "/auth/verify", { ip: "10.9.9.9", body: { response: { id: "A".repeat(43), rawId: "A".repeat(43), type: "public-key", response: { clientDataJSON: "e30", authenticatorData: "AA", signature: "AA" } } } });
    }
    assert.equal(last.status, 429);
  }

  // Migration not applied: 503 and no crash.
  {
    store = createMemoryStore({ unavailable: true });
    await start();
    const r = await call("POST", "/auth/options", { body: {}, ip: "10.1.1.1" });
    assert.equal(r.status, 503);
    assert.equal(r.body.code, "PASSKEYS_UNAVAILABLE");
    assert.equal((await call("GET", "/", { user: UID.a })).status, 503);
    const cfg = await call("GET", "/config");
    assert.deepEqual(cfg.body.enabled, false, "clients hide passkeys until the migration is applied");
  }

  await new Promise((r) => server.close(r));
  console.log("passkeys selftest OK");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
