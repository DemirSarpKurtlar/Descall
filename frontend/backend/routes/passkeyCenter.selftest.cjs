"use strict";

// Passkey control center (draft A): lib/passkeys/center.js helpers, the security e-mail, and
// the routes GET /center, DELETE /:id { reason, endSessions }, POST /alerts/:id/resolve,
// POST /report/info|resolve, the fresh-sign-in re-auth and the new-place alert, driven by
// the real router + @simplewebauthn/server and a software authenticator.
//   node frontend/backend/routes/passkeyCenter.selftest.cjs

process.env.JWT_SECRET = process.env.JWT_SECRET || "selftest-jwt-secret-selftest-jwt-secret";

const assert = require("node:assert/strict");
const http = require("node:http");
const crypto = require("node:crypto");
const express = require("express");
const { readConfig } = require("../lib/passkeys/config");
const { createMemoryStore } = require("../lib/passkeys/store");
const center = require("../lib/passkeys/center");
const { buildPasskeySecurityEmail } = require("../lib/passkeys/securityMail");
const { createPasskeyRouter } = require("./passkeys");
const { createSoftAuthenticator } = require("../test/softAuthenticator.cjs");
const jwt = require("../config/jwt");

// ---- pure helpers ------------------------------------------------------------------------
{
  assert.deepEqual(center.placeFromHeaders({ "CF-IPCountry": "tr", "cf-ipcity": "%C4%B0zmir" }), { country: "TR", city: "İzmir" });
  assert.deepEqual(center.placeFromHeaders({ "x-vercel-ip-country": "DE", "x-vercel-ip-city": "Berlin" }), { country: "DE", city: "Berlin" });
  assert.deepEqual(center.placeFromHeaders({ "cf-ipcountry": "XX", "cf-ipcity": "Nowhere" }), { country: "", city: "" }, "unknown country: no place at all");
  assert.deepEqual(center.placeFromHeaders({ "cf-ipcountry": "TR", "cf-ipcity": "<script>" }), { country: "TR", city: "" }, "markup in a city is dropped");

  const ist = { country: "TR", city: "İstanbul" };
  assert.equal(center.isNewPlace([], ist), false, "the first place is never new");
  const one = center.mergePlace([], ist, "2026-11-01T10:00:00Z");
  assert.equal(center.isNewPlace(one, { country: "TR", city: "istanbul" }), false, "case-insensitive city");
  assert.equal(center.isNewPlace(one, { country: "TR", city: "İzmir" }), true, "another city");
  assert.equal(center.isNewPlace(one, { country: "TR", city: "" }), false, "country only: same country is fine");
  assert.equal(center.isNewPlace(one, { country: "DE", city: "" }), true, "country only: another country");
  assert.equal(center.isNewPlace(one, { country: "", city: "" }), false, "no geo, no alert");
  const countryOnly = center.mergePlace([], { country: "TR", city: "" }, "2026-11-01T10:00:00Z");
  assert.equal(center.isNewPlace(countryOnly, { country: "TR", city: "Ankara" }), false, "a country-level place covers its cities");
  const upgraded = center.mergePlace(countryOnly, { country: "TR", city: "Ankara" }, "2026-11-02T10:00:00Z");
  assert.equal(upgraded.length, 1);
  assert.equal(upgraded[0].city, "Ankara");
  assert.equal(upgraded[0].n, 2);
  let many = [];
  for (let i = 0; i < 20; i += 1) many = center.mergePlace(many, { country: "TR", city: `C${i}` }, `2026-11-${String(i + 1).padStart(2, "0")}T00:00:00Z`);
  assert.equal(many.length, center.MAX_PLACES);
  assert.equal(many[0].city, "C19", "newest first");

  assert.equal(center.cleanDuration(1800), 1800);
  assert.equal(center.cleanDuration(20), null);
  assert.equal(center.cleanDuration("abc"), null);
  assert.equal(center.cleanReason("LOST"), "lost");
  assert.equal(center.cleanReason("drop table"), "other");

  const mix = center.methodMix([{ method: "passkey" }, { method: "passkey" }, { method: "password", signInMs: 16000 }, { method: "2fa_email", signInMs: 20000 }, { method: "google" }, {}]);
  assert.deepEqual(mix, { passkey: 2, password: 2, social: 1, total: 5, avgPasswordMs: 18000 });

  const now = Date.parse("2026-11-24T12:00:00Z");
  const fresh = { platform: "windows", backup_state: false, last_used_at: "2026-11-23T20:00:00Z", transports: ["internal"] };
  const phone = { platform: "ios", backup_state: true, provider: "iCloud Keychain", last_used_at: "2026-11-24T09:00:00Z" };
  const stale = { platform: "android", backup_state: true, provider: "Google Password Manager", last_used_at: "2026-10-08T09:00:00Z" };
  const key = { platform: "web", backup_state: false, transports: ["usb", "nfc"], last_used_at: "2026-11-15T09:00:00Z" };
  assert.equal(center.familyOf(key), "key");
  assert.equal(center.familyOf(phone), "apple");
  assert.equal(center.idleDays(stale, now), 47);
  const user = { password_hash: "x", email: "a@b.c", email_confirmed_at: "2026-01-01", two_factor_enabled: false };
  const s1 = center.securityScore({ user, totp: true, passkeys: [fresh, phone, key], nowMs: now });
  assert.equal(s1.value, 100);
  assert.equal(s1.level, "excellent");
  assert.equal(s1.methods, 3);
  const s2 = center.securityScore({ user, totp: true, passkeys: [fresh, phone, stale, key], nowMs: now });
  assert.equal(s2.value, 85, "one passkey unused for 47 days costs the fresh check");
  assert.equal(s2.staleCount, 1);
  const s3 = center.securityScore({ user: { ...user, email_confirmed_at: null }, passkeys: [], nowMs: now });
  assert.equal(s3.level, "weak");
  assert.equal(center.isReportToken(center.newReportToken().token), true);
  assert.equal(center.isReportToken("short"), false);
}

// ---- e-mail ------------------------------------------------------------------------------
{
  const token = "A".repeat(43);
  const m = buildPasskeySecurityEmail({ kind: "added", lang: "tr", name: "Ev bilgisayarı", provider: "Windows Hello", at: "2026-11-03T18:12:00Z", place: { country: "TR", city: "İstanbul" }, timeZone: "Europe/Istanbul", token });
  assert.match(m.subject, /passkey/i);
  assert.match(m.html, /Ben değildim/);
  assert.match(m.html, /Bendim/);
  assert.ok(m.html.includes(`/passkey/report#t=${token}&amp;a=revoke`), "the button opens the confirm page, the token in the fragment");
  assert.match(m.text, /21:12/, "time in the request's zone");
  assert.match(m.text, /İstanbul/);
  assert.match(m.text, /"Ev bilgisayarı" adlı passkey \(Windows Hello\) .+ tarihinde İstanbul, Türkiye konumundan eklendi\./, "tr: name, date, place in their places");
  // No place: one whole phrase, not "bilinmeyen bir konum konumundan" (the reported line).
  const u = buildPasskeySecurityEmail({ kind: "added", lang: "tr", name: "Ev bilgisayarı", at: "2026-11-28T14:58:00Z", timeZone: "Europe/Istanbul", token });
  assert.match(u.text, /"Ev bilgisayarı" adlı passkey 28 Kasım 2026 17:58 tarihinde bilinmeyen bir konumdan eklendi\./);
  assert.ok(!/konum konumundan/.test(u.text + u.html));
  const un = buildPasskeySecurityEmail({ kind: "newPlace", lang: "tr", name: "iPhone", at: "2026-11-28T14:58:00Z", token });
  assert.match(un.text, /bilinmeyen bir konumdan giriş yapıldı/);
  for (const lang of ["tr", "en", "de", "es", "fr", "pt-BR", "ru"]) {
    for (const kind of ["added", "newPlace"]) {
      for (const place of [undefined, { country: "DE", city: "Berlin" }]) {
        const mm = buildPasskeySecurityEmail({ kind, lang, name: "Key", at: "2026-11-28T14:58:00Z", place, token });
        assert.ok(!/[{}]/.test(mm.text), `${lang} ${kind}: every placeholder filled: ${mm.text}`);
        assert.ok(place ? mm.text.includes("Berlin") : !mm.text.includes("Berlin"), `${lang} ${kind}: the place`);
        assert.match(mm.text, /2026/, `${lang} ${kind}: the date`);
      }
    }
  }
  const x = buildPasskeySecurityEmail({ kind: "added", lang: "en", name: '<img src=x onerror=alert(1)>', token });
  assert.ok(!x.html.includes("<img src=x"), "the name is escaped");
  const r = buildPasskeySecurityEmail({ kind: "revoked", lang: "de", name: "Pixel", sessions: 3 });
  assert.ok(!r.html.includes("/passkey/report"), "the revoked mail has no report buttons");
  assert.match(r.text, /3/);
}

// ---- routes ------------------------------------------------------------------------------
const UID = { a: "11111111-1111-4111-8111-111111111111", b: "22222222-2222-4222-8222-222222222222" };
const users = new Map([
  [UID.a, { id: UID.a, username: "ece", email: "e@example.com", email_confirmed_at: "2026-01-01", password_hash: "hash:pw", two_factor_enabled: false }],
  [UID.b, { id: UID.b, username: "bob", email: "b@example.com", email_confirmed_at: "2026-01-01", password_hash: "hash:pw", two_factor_enabled: false }],
]);
let clock = Date.now();
const store = createMemoryStore();
const config = readConfig({});
const mails = [];
const emits = [];
const revoked = [];
const sessionRows = new Map(); // userId -> [{ id, method, createdAt, passkeyId, signInMs }]
const sessionsOf = (id) => {
  if (!sessionRows.has(id)) sessionRows.set(id, []);
  return sessionRows.get(id);
};

const kit = {
  rejectIfBanned: async () => false,
  rejectIfChildAccount: async () => false,
  accessGate: async () => false,
  hasSecondFactor: async () => false,
  secondFactorGate: async () => false,
  authUserPayload: (u) => ({ id: u.id, username: u.username }),
  resolveEquippedExtra: async () => ({}),
  judgeCode: async () => ({ ok: false }),
  codeLockedBody: async () => ({}),
};

const router = createPasskeyRouter({
  __noDefaults: true,
  config,
  store,
  now: () => clock,
  kit,
  requireAuth(req, res, next) {
    const id = req.get("x-test-user");
    if (!id) return res.status(401).json({ error: "Missing auth" });
    req.user = { id, username: users.get(id)?.username, sid: req.get("x-test-sid") || "sid-old" };
    next();
  },
  clientIp: (req) => req.get("x-test-ip") || "10.0.0.1",
  async createSession(userId, opts) {
    const session = { id: crypto.randomUUID(), method: opts.method, createdAt: new Date(clock).toISOString(), passkeyId: opts.passkeyId, signInMs: opts.signInMs };
    sessionsOf(userId).unshift(session);
    return { session };
  },
  signToken: ({ id, sid }) => `token:${id}:${sid}`,
  signReauthToken: jwt.signPasskeyReauthToken,
  verifyToken: jwt.verifyToken,
  loadLoginUser: async (id) => users.get(id) || null,
  loadBasicUser: async (id) => users.get(id) || null,
  clearReauthCode: async () => {},
  verifyPassword: async (pw, hash) => hash === "hash:pw" && pw === "pw",
  totpState: async () => ({ enabled: true }),
  verifyTotp: async () => false,
  cancelDeletion: async () => {},
  afterLogin: async () => {},
  securityNote: () => {},
  audit: () => {},
  notify: async (user, kind, _req, vars) => mails.push({ to: user.email, kind, vars }),
  emit: (_req, userId, event, payload) => emits.push({ userId, event, payload }),
  sessionsOf: async (id) => sessionsOf(id).slice(),
  async endSessions(_req, userId, ids) {
    const list = sessionsOf(userId);
    const removed = list.filter((s) => ids.includes(s.id)).map((s) => s.id);
    sessionRows.set(userId, list.filter((s) => !ids.includes(s.id)));
    revoked.push(...removed);
    return removed;
  },
  geo: (req) => center.placeFromHeaders(req.headers),
});
const app = express();
app.use(express.json());
app.use("/p", router);

let base;
async function call(method, path, { body, user, sid, headers = {} } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { "content-type": "application/json", ...(user ? { "x-test-user": user } : {}), ...(sid ? { "x-test-sid": sid } : {}), ...headers },
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

const IST = { "cf-ipcountry": "TR", "cf-ipcity": "%C4%B0stanbul", "cf-timezone": "Europe/Istanbul" };
const IZM = { "cf-ipcountry": "TR", "cf-ipcity": "%C4%B0zmir" };

(async () => {
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${server.address().port}/p`;
  const auth = createSoftAuthenticator({ aaguid: "08987058-cadc-4b81-b6e1-30de50dcbe96" });
  try {
    // A session older than 10 minutes needs the re-auth prompt; a fresh sign-in does not.
    sessionsOf(UID.a).push({ id: "sid-old", method: "password", createdAt: new Date(clock - 3600e3).toISOString() });
    sessionsOf(UID.a).push({ id: "sid-fresh", method: "password", createdAt: new Date(clock - 60e3).toISOString(), signInMs: 16000 });
    sessionsOf(UID.a).push({ id: "sid-api", method: "unknown", createdAt: new Date(clock - 60e3).toISOString() });
    assert.equal((await call("POST", "/register/options", { user: UID.a, sid: "sid-old", body: {} })).status, 428);
    assert.equal((await call("POST", "/register/options", { user: UID.a, sid: "sid-api", body: {} })).status, 428, "an unknown method is not a sign-in");
    const opts = await call("POST", "/register/options", { user: UID.a, sid: "sid-fresh", body: { platform: "windows", prefer: "securityKey" } });
    assert.equal(opts.status, 200, JSON.stringify(opts.body));
    assert.deepEqual(opts.body.hints, ["security-key"], "prefer: securityKey becomes a WebAuthn hint");
    const response = auth.create(opts.body, { origin: "https://descall.com" });
    const reg = await call("POST", "/register/verify", { user: UID.a, sid: "sid-fresh", headers: IST, body: { response, name: "Ev bilgisayarı", platform: "windows" } });
    assert.equal(reg.status, 201, JSON.stringify(reg.body));
    const pk = reg.body.passkey;
    const added = mails.find((m) => m.kind === "passkeyAdded");
    assert.ok(added && center.isReportToken(added.vars.token), "the added mail carries a one-time report token");
    assert.deepEqual(added.vars.place, { country: "TR", city: "İstanbul" });

    // Sign in from Istanbul (known), then Izmir (new): one alert, one mail.
    const signIn = async (headers, durationMs) => {
      const o = await call("POST", "/auth/options", { body: { platform: "web" } });
      const r = auth.get(o.body, { origin: "https://descall.com" });
      return call("POST", "/auth/verify", { headers, body: { response: r, platform: "web", durationMs } });
    };
    clock += 60e3;
    const s1 = await signIn(IST, 1800);
    assert.equal(s1.status, 200, JSON.stringify(s1.body));
    const newest = sessionsOf(UID.a)[0];
    assert.equal(newest.passkeyId, pk.id, "the session remembers the passkey that opened it");
    assert.equal(newest.signInMs, 1800);
    assert.equal(mails.filter((m) => m.kind === "passkeyNewPlace").length, 0);
    clock += 60e3;
    const s2 = await signIn(IZM, 2200);
    assert.equal(s2.status, 200);
    const np = mails.filter((m) => m.kind === "passkeyNewPlace");
    assert.equal(np.length, 1, "a sign-in from a new city mails once");
    assert.deepEqual(np[0].vars.place, { country: "TR", city: "İzmir" });
    clock += 60e3;
    await signIn(IZM, 2000);
    assert.equal(mails.filter((m) => m.kind === "passkeyNewPlace").length, 1, "Izmir is known now");

    // The center.
    const c = await call("GET", "/center", { user: UID.a, sid: "sid-fresh", headers: IST });
    assert.equal(c.status, 200, JSON.stringify(c.body));
    assert.equal(c.body.passkeys.length, 1);
    const row = c.body.passkeys[0];
    assert.equal(row.uses30.length, 3);
    assert.equal(row.lastCity, "İzmir");
    assert.equal(row.createdCity, "İstanbul");
    assert.equal(row.family, "windows");
    assert.equal(c.body.summary.avgPasskeyMs, 2000);
    assert.equal(c.body.summary.avgPasswordMs, 16000);
    assert.equal(c.body.summary.mix.passkey, 3);
    assert.equal(c.body.summary.totp, true);
    assert.equal(c.body.summary.score.methods, 3);
    assert.equal(c.body.freshSignIn, true);
    assert.equal(c.body.geo, "city");
    assert.equal(c.body.alerts.length, 1);
    assert.equal(c.body.alerts[0].city, "İzmir");
    assert.deepEqual(c.body.alerts[0].previous, [{ country: "TR", city: "İstanbul" }]);
    assert.ok(c.body.activity.some((e) => e.kind === "added"));
    assert.ok(!JSON.stringify(c.body).includes("report_hash"), "hashes never leave the server");

    // Alert answered "it was me": closed, cannot be answered twice; bob cannot touch it.
    const alertId = c.body.alerts[0].id;
    assert.equal((await call("POST", `/alerts/${alertId}/resolve`, { user: UID.b, body: { action: "me" } })).status, 404);
    assert.equal((await call("POST", `/alerts/${alertId}/resolve`, { user: UID.a, body: { action: "maybe" } })).status, 400);
    assert.equal((await call("POST", `/alerts/${alertId}/resolve`, { user: UID.a, body: { action: "me" } })).status, 200);
    assert.equal((await call("POST", `/alerts/${alertId}/resolve`, { user: UID.a, body: { action: "me" } })).status, 409);
    assert.equal((await call("GET", "/center", { user: UID.a })).body.alerts.length, 0);

    // The e-mail link: info, then "Bendim" closes it; the token works once.
    const tok = np[0].vars.token;
    const info = await call("POST", "/report/info", { body: { token: tok } });
    assert.equal(info.status, 200);
    assert.equal(info.body.kind, "new_place");
    assert.equal(info.body.resolution, "confirmed", "answered in the app already");
    assert.equal((await call("POST", "/report/resolve", { body: { token: tok, action: "revoke" } })).status, 409);
    assert.equal((await call("POST", "/report/info", { body: { token: "B".repeat(43) } })).status, 404);

    // Rename keeps a history row.
    assert.equal((await call("PATCH", `/${pk.id}`, { user: UID.a, body: { name: "Oyun PC" } })).status, 200);

    // "Ben degildim" from the added mail: passkey removed, every session ended, one time.
    const t2 = added.vars.token;
    assert.equal((await call("POST", "/report/info", { body: { token: t2 } })).body.passkeyExists, true);
    const before = sessionsOf(UID.a).length;
    assert.ok(before >= 3);
    const rv = await call("POST", "/report/resolve", { body: { token: t2, action: "revoke" } });
    assert.equal(rv.status, 200, JSON.stringify(rv.body));
    assert.equal(rv.body.removed, true);
    assert.equal(rv.body.sessionsEnded, before);
    assert.equal(sessionsOf(UID.a).length, 0);
    assert.ok(mails.some((m) => m.kind === "passkeyRevokedByReport" && m.vars.sessions === before));
    assert.equal((await call("POST", "/report/resolve", { body: { token: t2, action: "revoke" } })).status, 409, "single use");
    assert.equal(store._creds.size, 0);

    // Expired link.
    const old = center.newReportToken(clock - 8 * 86400e3);
    await store.insertEvent({ user_id: UID.a, kind: "added", credential_name: "x", report_hash: old.hash, report_expires_at: old.expiresAt });
    assert.equal((await call("POST", "/report/info", { body: { token: old.token } })).status, 410);

    // Remove with a reason; "end the sessions of this passkey" spares the current session.
    sessionsOf(UID.a).push({ id: "sid-now", method: "password", createdAt: new Date(clock).toISOString() });
    const auth2 = createSoftAuthenticator();
    const o2 = await call("POST", "/register/options", { user: UID.a, sid: "sid-now", body: {} });
    const reg2 = await call("POST", "/register/verify", { user: UID.a, sid: "sid-now", body: { response: auth2.create(o2.body, { origin: "https://descall.com" }) } });
    assert.equal(reg2.status, 201);
    const id2 = reg2.body.passkey.id;
    sessionsOf(UID.a).push({ id: "sid-pk-1", method: "passkey", passkeyId: id2, createdAt: new Date(clock).toISOString() });
    sessionsOf(UID.a).push({ id: "sid-pk-2", method: "passkey", passkeyId: id2, createdAt: new Date(clock).toISOString() });
    sessionsOf(UID.a).push({ id: "sid-other", method: "passkey", passkeyId: crypto.randomUUID(), createdAt: new Date(clock).toISOString() });
    const mailCount = mails.length;
    const del = await call("DELETE", `/${id2}`, { user: UID.a, sid: "sid-pk-1", body: { reason: "lost", endSessions: true } });
    assert.equal(del.status, 200, JSON.stringify(del.body));
    assert.equal(del.body.sessionsEnded, 1, "only the other session of this passkey; the current one stays");
    assert.deepEqual(sessionsOf(UID.a).map((s) => s.id).sort(), ["sid-now", "sid-other", "sid-pk-1"]);
    assert.ok(mails.length > mailCount, "a removal is mailed");
    const hist = (await call("GET", "/center", { user: UID.a, sid: "sid-now" })).body.activity;
    const removedEv = hist.find((e) => e.kind === "removed" && e.passkeyId === id2);
    assert.equal(removedEv.reason, "lost");

    // Undo right after adding: no e-mail.
    const o3 = await call("POST", "/register/options", { user: UID.a, sid: "sid-now", body: {} });
    const reg3 = await call("POST", "/register/verify", { user: UID.a, sid: "sid-now", body: { response: createSoftAuthenticator().create(o3.body, { origin: "https://descall.com" }) } });
    const mc = mails.filter((m) => m.kind === "passkeyRemoved").length;
    assert.equal((await call("DELETE", `/${reg3.body.passkey.id}`, { user: UID.a, sid: "sid-now", body: { reason: "undo" } })).status, 200);
    assert.equal(mails.filter((m) => m.kind === "passkeyRemoved").length, mc, "undo within minutes is quiet");

    // Without the control-center migration everything still answers.
    const bare = createMemoryStore({ noExtras: true });
    assert.deepEqual(await bare.listEvents(UID.a), []);
    assert.equal(await bare.insertEvent({ user_id: UID.a, kind: "added" }), null);
    assert.equal(await bare.setPlaces("x", {}), false);
  } finally {
    server.close();
  }
  console.log("passkeyCenter selftest OK");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
