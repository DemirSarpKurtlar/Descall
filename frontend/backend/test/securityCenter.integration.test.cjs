"use strict";

/**
 * Güvenlik Merkezi (admin section security, Draft A "Komuta merkezi" remake) over real
 * HTTP with the fake Supabase and a fake Socket.IO server: section gate, the overview
 * (score from settings + admin 2FA, KPIs, chart, top sources, threat level), the
 * merged / capped event recorder with brute-force detection and masked addresses only,
 * the live push, security settings with history { key, from, to } + audit + reason
 * rule, emergency locks (enforced by the platform policy, info band, extend, lift,
 * expiry sweep with audit), history revert with step-up, PATCH /system history, the
 * source ban through /access-bans, the DM account age guard, the 2FA reminder, and the
 * memory-only mode while the tables are missing.
 */

process.env.NODE_ENV = "test";
process.env.PASSWORD_HIBP = "0";
process.env.JWT_SECRET = "test-secret-do-not-use-in-prod";
process.env.JWT_EXPIRES_IN = "7d";
process.env.SUPABASE_URL = "https://placeholder.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "placeholder-key";

const http = require("http");
const { createFakeSupabase } = require("./fakeSupabase.cjs");

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const OWNER = id(1);
const SECADMIN = id(2);
const OTHERADMIN = id(3);
const NO2FA = id(4);
const ELIF = id(10);
const MERT = id(11);
const NEWBIE = id(12);

const TOTP_ON = { totp_enabled_at: "2026-10-01T00:00:00.000Z", totp_secret_enc: "enc" };
const now = Date.now();
const ago = (ms) => new Date(now - ms).toISOString();
const user = (uid, username, extra = {}) => ({ id: uid, username, display_name: username, is_admin: false, active_sessions: [{ id: `s-${username}` }], language: "tr", created_at: ago(400 * 86400000), ...extra });

const seed = () => ({
  users: [
    user(OWNER, "admin", { is_admin: true, ...TOTP_ON }),
    user(SECADMIN, "demir", { is_admin: true, admin_permissions: ["security", "accessBans", "moderation"], ...TOTP_ON }),
    user(OTHERADMIN, "other", { is_admin: true, admin_permissions: ["reports"], ...TOTP_ON }),
    user(NO2FA, "selin", { is_admin: true, admin_permissions: ["reports"], language: "en" }),
    user(ELIF, "elifkaya"),
    user(MERT, "mertdemir"),
    user(NEWBIE, "yeni_hesap", { created_at: ago(2 * 3600000) }),
  ],
  security_events: [],
  security_setting_changes: [],
  access_bans: [],
  access_ban_hits: [],
  admin_audit: [],
  system_settings: [{ id: "default", config: {}, started_at: ago(86400000) }],
  dm_messages: [],
});

const fake = createFakeSupabase(seed());
const supabasePath = require.resolve("../db/supabase");
require.cache[supabasePath] = { id: supabasePath, filename: supabasePath, loaded: true, exports: fake };

const express = require("express");
const { signToken, signStepUpToken } = require("../config/jwt");
const adminRouter = require("../routes/admin");
const state = require("../runtime/sharedState");
const events = require("../lib/securityEvents");
const locks = require("../lib/securityLocks");
const center = require("../lib/securityCenter");
const history = require("../lib/settingsHistory");
const policy = require("../lib/platformPolicy");
const sec = require("../lib/securitySettings");

function assert(cond, msg) {
  if (!cond) throw new Error("FAIL: " + msg);
}

/* ---- fake Socket.IO ---- */
const emitted = [];
const sockets = new Map();
const room = (name) => ({
  emit: (event, payload) => emitted.push({ room: name, event, payload }),
  to: (other) => room(`${name}+${other}`),
});
const io = {
  to: (name) => room(name),
  emit: (event, payload) => emitted.push({ room: "*", event, payload }),
  in() {
    return { fetchSockets: async () => [] };
  },
  sockets: { adapter: { rooms: new Map() }, sockets },
};
function connect(uid, username) {
  const s = { id: `sock-${uid}`, user: { id: uid, username }, own: [], emit: (event, payload) => s.own.push({ event, payload }) };
  sockets.set(s.id, s);
  state.presence.set(uid, { username, status: "online", socketId: s.id });
  return s;
}

async function startServer() {
  const app = express();
  app.use(express.json());
  app.set("io", io);
  app.use("/api/admin", adminRouter);
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, r));
  return { server, base: `http://127.0.0.1:${server.address().port}` };
}

async function call(base, method, path, { body, token, stepUp } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(stepUp ? { "X-Admin-Step-Up": stepUp } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const raw = await res.text();
  let json = {};
  try {
    json = JSON.parse(raw);
  } catch {
    json = {};
  }
  return { status: res.status, body: json, raw };
}

const session = (uid, username) => signToken({ id: uid, username, sid: `s-${username}` });
const stepUpFor = (uid, username) => signStepUpToken({ id: uid, sid: `s-${username}` });
const audits = (action) => state.auditLog.filter((e) => e.action === action);
const table = (name) => fake._tables?.[name] || fake.tables?.[name] || null;

async function rows(name) {
  const { data } = await fake.from(name).select("*");
  return data || [];
}

async function run() {
  events.__resetForTests(fake);
  events.attachIo(io);
  history.__setDbForTests(fake);
  center.__setDbForTests(fake);
  policy.resetPlatformPolicyForTests();
  const { server, base } = await startServer();
  const tok = session(SECADMIN, "demir");
  const step = stepUpFor(SECADMIN, "demir");
  const S = "/api/admin/security";
  try {
    /* ---- 1. section gate ---- */
    let r = await call(base, "GET", `${S}/overview`, { token: session(OTHERADMIN, "other") });
    assert(r.status === 403 && r.body.section === "security", "admin without the section is refused " + r.raw);
    r = await call(base, "GET", `${S}/overview`, { token: session(ELIF, "elifkaya") });
    assert(r.status === 403, "non-admin refused");

    /* ---- 2. recorder: merge, brute force, masked addresses ---- */
    const attacker = "88.230.12.34";
    for (let i = 0; i < 25; i += 1) {
      events.note("failed_login", { ip: attacker, userId: i % 5 === 0 ? ELIF : null, username: i % 5 === 0 ? "elifkaya" : null, accountKey: `acct${i % 6}`, detail: { method: "password" } });
    }
    events.note("rate_limit", { ip: null, userId: MERT, reason: "dm", detail: { kind: "dm", limit: 60 } });
    events.note("rate_limit", { ip: null, userId: MERT, reason: "dm", detail: { kind: "dm", limit: 60 } });
    events.note("ip_blocked", { ip: "31.223.40.50", reason: "login", detail: { scope: "login" } });
    events.note("signup_denied", { ip: "95.70.1.2", reason: "disposable", detail: { email: "t***@tempmail.io" } });
    events.note("access_ban", { ip: "78.180.9.9", reason: "login", detail: { action: "login", kind: "network", label: "78.180.x.x network" } });
    events.note("not_a_type", { ip: attacker });
    const pend = events.__pendingForTests();
    assert(pend.length <= 8, "notes are merged per type / source / account, not one row each: " + pend.length);
    const flushed = await events.flush();
    assert(flushed >= 6, "flush wrote merged rows " + flushed);
    const stored = await rows("security_events");
    assert(stored.length === flushed, "one stored row per merged bucket");
    const fl = stored.filter((x) => x.type === "failed_login");
    assert(fl.reduce((n, x) => n + x.count, 0) === 25, "failed login count kept in the merged rows");
    const bf = stored.find((x) => x.type === "brute_force");
    assert(bf && bf.detail.attempts >= 20 && bf.detail.accounts >= 3, "brute-force burst derived from many accounts " + JSON.stringify(bf));
    assert(bf.detail.sample === "elifkaya", "burst names a real account only");
    assert(stored.every((x) => !JSON.stringify(x).includes(attacker) && !JSON.stringify(x).includes("31.223.40.50")), "the raw address is never stored");
    assert(fl[0].ip_masked === "88.230.x.x" && fl[0].net_label === "88.230.x.0/24" && /^[0-9a-f]{48}$/.test(fl[0].ip_hash), "masked address + match hash");
    assert(!stored.some((x) => x.type === "not_a_type"), "unknown types ignored");
    const push = emitted.filter((e) => e.event === "admin:security" && e.payload.type === "events");
    assert(push.length === 1 && push[0].room === "admin+admin-security" && push[0].payload.events.length === flushed, "live push to the admin rooms");
    assert(push[0].payload.events.every((e) => !("ip_hash" in e) && e.sourceRef !== undefined), "pushed events are the public shape");

    /* ---- 3. overview ---- */
    r = await call(base, "GET", `${S}/overview`, { token: tok });
    assert(r.status === 200, "overview " + r.raw);
    const ov = r.body;
    assert(ov.stats.kpis.failedLogins.value === 25, "failed logins KPI " + JSON.stringify(ov.stats.kpis));
    assert(ov.stats.kpis.rateLimits.value === 2, "rate limit KPI");
    assert(ov.stats.kpis.blockedIps.value === 2, "blocked IP KPI (limiter + access ban)");
    assert(ov.stats.series.failed.length === 48 && ov.stats.series.failed.reduce((a, b) => a + b, 0) === 25, "48 half-hour buckets");
    assert(ov.stats.spike && ov.stats.spike.ipMasked === "88.230.x.x", "brute-force wave marked on the chart");
    assert(ov.stats.sources[0].ipMasked === "88.230.x.x" && ov.stats.sources[0].attempts === 25 && ov.stats.sources[0].pct === 100, "top source");
    assert(ov.stats.counts.bruteForce === 1 && ov.stats.counts.signupDenied === 1, "filter counts " + JSON.stringify(ov.stats.counts));
    assert(ov.threat === "elevated" || ov.threat === "high", "threat level reacts to a burst: " + ov.threat);
    const c2fa = ov.score.checks.find((c) => c.id === "admin2fa");
    assert(!c2fa.ok && c2fa.vars.missing === 1 && c2fa.vars.total === 4 && c2fa.action === "remind", "2FA check from the staff list " + JSON.stringify(c2fa));
    const human = ov.score.checks.find((c) => c.id === "humanCheck");
    assert(!human.ok && human.action === "explain", "human check is honest: needs a provider");
    assert(ov.score.score > 0 && ov.score.score < 100 && ov.score.potential > ov.score.score, "score and potential " + JSON.stringify([ov.score.score, ov.score.potential]));
    assert(ov.score.checks[0].ok === false, "failed checks first");
    assert(ov.alerts.some((a) => a.kind === "burst") && ov.alerts.some((a) => a.kind === "admin2fa"), "alerts menu");

    /* ---- 4. feed ---- */
    r = await call(base, "GET", `${S}/events?filter=failedLogin`, { token: tok });
    assert(r.status === 200 && r.body.events.length >= 1 && r.body.events.every((e) => ["failed_login", "account_locked"].includes(e.type)), "filtered feed");
    r = await call(base, "GET", `${S}/events`, { token: tok });
    const burst = r.body.events.find((e) => e.type === "brute_force");
    r = await call(base, "GET", `${S}/events/${burst.id}`, { token: tok });
    assert(r.status === 200 && r.body.related.bySource.length >= 1 && r.body.sourceBanned === false, "event detail with the same source's events");

    /* ---- 5. settings: reason rule, history, audit, step-up ---- */
    r = await call(base, "PATCH", `${S}/settings`, { token: tok, body: { patch: { maxMessagesPerMinute: 40 } } });
    assert(r.status === 403 && r.body.code === "STEP_UP_REQUIRED", "changes need a fresh code");
    r = await call(base, "PATCH", `${S}/settings`, { token: tok, stepUp: step, body: { patch: { dmEnabled: false } } });
    assert(r.status === 400 && r.body.code === "REASON_REQUIRED", "switching something off needs a reason");
    r = await call(base, "PATCH", `${S}/settings`, { token: tok, stepUp: step, body: { patch: { securityLocks: {} } } });
    assert(r.status === 400, "locks are not a settings key");
    r = await call(base, "PATCH", `${S}/settings`, { token: tok, stepUp: step, body: { patch: { maxMessagesPerMinute: 40 }, reason: "Spam baskini sirasinda dusuruldu" } });
    assert(r.status === 200 && r.body.changes.length === 1, "settings saved " + r.raw);
    assert(JSON.stringify(r.body.changes[0]) === JSON.stringify({ key: "maxMessagesPerMinute", from: 60, to: 40 }), "diff keeps old and new value");
    assert(state.systemConfig.maxMessagesPerMinute === 40, "live config updated");
    const rateEntryId = r.body.entry.id;
    let a = audits("security_settings")[0];
    assert(a && a.meta.changes[0].from === 60 && a.meta.changes[0].to === 40 && a.meta.reason, "audit has old + new values and the reason");
    assert((await rows("security_setting_changes")).length === 1, "history row stored");
    r = await call(base, "PATCH", `${S}/settings`, { token: tok, stepUp: step, body: { patch: { dmMinAccountAgeHours: 24, disposableEmailBlock: true }, recommended: true } });
    assert(r.status === 200 && r.body.settings.dmMinAccountAgeHours === 24 && r.body.settings.disposableEmailBlock === true, "recommendations applied");

    /* ---- 6. DM account age guard ---- */
    const young = await center.dmAccountAgeBlock({ config: state.systemConfig, userId: NEWBIE });
    assert(young && young.code === "DM_ACCOUNT_TOO_NEW" && young.retryAfterMs > 0, "2 h old account cannot DM with a 24 h minimum");
    assert((await center.dmAccountAgeBlock({ config: state.systemConfig, userId: ELIF })) === null, "old account can");
    assert((await center.dmAccountAgeBlock({ config: state.systemConfig, userId: NEWBIE, isAdmin: true })) === null, "admins exempt");

    /* ---- 7. emergency locks ---- */
    connect(ELIF, "elifkaya");
    r = await call(base, "POST", `${S}/locks`, { token: tok, stepUp: step, body: { modes: ["registration", "dm"], duration: "1h", reason: "x" } });
    assert(r.status === 400 && r.body.code === "REASON_REQUIRED", "lock needs a reason");
    r = await call(base, "POST", `${S}/locks`, { token: tok, stepUp: step, body: { modes: ["registration", "dm"], duration: "2h", reason: "Bot kayit dalgasi" } });
    assert(r.status === 400 && r.body.code === "BAD_DURATION", "only the dialog durations");
    r = await call(base, "POST", `${S}/locks`, { token: tok, stepUp: step, body: { modes: ["registration", "dm"], duration: "1h", reason: "20:09'dan beri 88.230.x.x kaynakli kaba kuvvet", banner: true } });
    assert(r.status === 201 && r.body.started.length === 2, "two locks started " + r.raw);
    assert(!policy.checkRegistration({ config: state.systemConfig }).ok, "registration lock enforced");
    assert(state.systemConfig.registrationEnabled === true, "the permanent switch is untouched");
    const dmVerdict = policy.checkMessageSend({ config: state.systemConfig, userId: ELIF, kind: "dm" });
    assert(!dmVerdict.ok && dmVerdict.code === "DMS_DISABLED", "DM lock enforced");
    assert(policy.checkMessageSend({ config: state.systemConfig, userId: ELIF, kind: "server" }).ok, "server chat stays open under the DM lock");
    assert(policy.checkMessageSend({ config: state.systemConfig, userId: ELIF, kind: "dm", isAdmin: true }).ok, "admins exempt");
    const notice = emitted.filter((e) => e.event === "platform:notice").pop();
    assert(notice && notice.room === "*" && notice.payload.modes.join() === "registration,dm" && notice.payload.until, "info band pushed to every app");
    const lockEntry = r.body.entry;
    assert(lockEntry.category === "locks" && lockEntry.changes.some((c) => c.key === "lock.registration" && c.from === null && c.to.until), "lock history entry");
    assert(audits("security_lock_start").length === 1, "lock audited");
    r = await call(base, "POST", `${S}/locks`, { token: tok, stepUp: step, body: { modes: ["registration"], duration: "1h", reason: "tekrar" } });
    assert(r.status === 409 && r.body.code === "ALREADY_ON", "an active lock is not started twice");
    r = await call(base, "POST", `${S}/locks/extend`, { token: tok, stepUp: step, body: { mode: "dm", minutes: 360 } });
    assert(r.status === 200 && Date.parse(r.body.locks.dm.until) - Date.now() > 5.9 * 3600000, "lock extended");
    r = await call(base, "GET", `${S}/history`, { token: tok });
    const hLock = r.body.entries.find((e) => e.id === lockEntry.id);
    assert(hLock && hLock.isLock && hLock.lockLive && hLock.revertible, "a live lock can be undone from the history");

    // read-only lock blocks groups and servers too
    r = await call(base, "POST", `${S}/locks`, { token: tok, stepUp: step, body: { modes: ["readOnly"], duration: "15m", reason: "Toplu oltalama", banner: false } });
    assert(r.status === 201, "read-only lock");
    assert(policy.checkMessageSend({ config: state.systemConfig, userId: MERT, kind: "group" }).code === "CHAT_FROZEN", "read-only stops every message");
    assert(policy.checkGroupCreate({ config: state.systemConfig }).code === "READ_ONLY", "and new groups");
    assert(policy.checkServerCreate({ config: state.systemConfig }).code === "READ_ONLY", "and new servers");
    assert(sec.publicNotice(state.systemConfig).modes.join() === "registration,dm", "no band for a lock started without it");

    // expiry: the policy treats an expired lock as off at once, the sweep records it
    state.systemConfig.securityLocks.readOnly.until = new Date(Date.now() - 1000).toISOString();
    assert(policy.checkGroupCreate({ config: state.systemConfig }).ok, "expired lock is off before the sweep");
    const swept = await locks.sweep(io);
    assert(swept.join() === "readOnly" && !state.systemConfig.securityLocks.readOnly, "sweep clears the expired lock");
    const exp = audits("security_lock_expired")[0];
    assert(exp && exp.actorUsername === "system" && exp.meta.changes.some((c) => c.key === "lock.readOnly" && c.to === null), "expiry audited with the change");

    // undo a lock from the history (= lift)
    r = await call(base, "POST", `${S}/history/${lockEntry.id}/revert`, { token: tok, stepUp: step, body: { reason: "Baskin bitti" } });
    assert(r.status === 200, "lock undone " + r.raw);
    assert(policy.checkRegistration({ config: state.systemConfig }).ok && !sec.lockActive(state.systemConfig, "dm"), "both locks lifted");
    assert(audits("security_lock_lift").length === 1, "lift audited");
    assert(emitted.filter((e) => e.event === "platform:notice").pop().payload === null, "band removed");

    /* ---- 8. revert a setting ---- */
    r = await call(base, "POST", `${S}/history/${rateEntryId}/revert`, { token: tok, body: { reason: "Baskin bitti, normal sinira" } });
    assert(r.status === 403 && r.body.code === "STEP_UP_REQUIRED", "revert needs step-up");
    r = await call(base, "POST", `${S}/history/${rateEntryId}/revert`, { token: tok, stepUp: step, body: { reason: "" } });
    assert(r.status === 400 && r.body.code === "REASON_REQUIRED", "revert needs a reason");
    r = await call(base, "POST", `${S}/history/${rateEntryId}/revert`, { token: tok, stepUp: step, body: { reason: "Baskin bitti, normal sinira donuyoruz" } });
    assert(r.status === 200 && state.systemConfig.maxMessagesPerMinute === 60, "value put back " + r.raw);
    assert(r.body.entry.revertOf === rateEntryId && r.body.changes[0].from === 40 && r.body.changes[0].to === 60, "revert recorded as its own change");
    assert(audits("security_settings_revert")[0].meta.revertOf === rateEntryId, "revert audited");
    r = await call(base, "POST", `${S}/history/${rateEntryId}/revert`, { token: tok, stepUp: step, body: { reason: "ikinci kez" } });
    assert(r.status === 409, "not reverted twice");
    r = await call(base, "GET", `${S}/history?category=rateLimits`, { token: tok });
    assert(r.body.entries.length === 2 && r.body.entries.every((e) => e.category === "rateLimits"), "category filter");
    assert(r.body.entries.find((e) => e.id === rateEntryId).revertedAt && !r.body.entries.find((e) => e.revertOf).revertible, "reverted flags");

    /* ---- 9. PATCH /system keeps old and new values ---- */
    r = await call(base, "PATCH", "/api/admin/system", { token: session(OWNER, "admin"), stepUp: stepUpFor(OWNER, "admin"), body: { maxLoginAttempts: 8, bogusKey: 1 } });
    assert(r.status === 200 && r.body.config.maxLoginAttempts === 8 && !("bogusKey" in r.body.config), "PATCH /system picks known keys");
    a = audits("system_config")[0];
    assert(a.meta.changes.length === 1 && a.meta.changes[0].from === 5 && a.meta.changes[0].to === 8 && a.meta.source === "system", "PATCH /system audit has old + new values");
    r = await call(base, "GET", `${S}/history`, { token: tok });
    assert(r.body.entries[0].source === "system" && r.body.entries[0].revertible, "Sistem changes are in the same history");

    /* ---- 10. ban a source by its hash ---- */
    const src = (await call(base, "GET", `${S}/overview`, { token: tok })).body.stats.sources[0];
    r = await call(base, "POST", "/api/admin/access-bans", { token: tok, stepUp: step, body: { mode: "source", sourceRef: src.sourceRef, kind: "network", duration: "7d", reason: "Kaba kuvvet" } });
    assert(r.status === 201 && r.body.added[0].kind === "network" && r.body.added[0].label.includes("88.230.x.0/24"), "network ban from the feed " + r.raw);
    const accessBans = require("../lib/accessBans");
    assert(accessBans.match(accessBans.fingerprintOf({ ip: "88.230.12.99" })), "the ban matches the real network");
    r = await call(base, "GET", `${S}/overview`, { token: tok });
    assert(r.body.stats.sources[0].banned === true && r.body.stats.kpis.blockedIps.activeBans === 1, "source shows as banned");
    r = await call(base, "POST", "/api/admin/access-bans", { token: tok, stepUp: step, body: { mode: "source", sourceRef: "f".repeat(48), kind: "ip", duration: "7d" } });
    assert(r.status === 404, "unknown source");

    /* ---- 11. 2FA reminder + impact ---- */
    const sSelin = connect(NO2FA, "selin");
    r = await call(base, "POST", `${S}/remind-2fa`, { token: tok, stepUp: step });
    assert(r.status === 200 && r.body.missing === 1 && r.body.reached === 1, "reminder " + r.raw);
    const pop = sSelin.own.find((e) => e.event === "admin:popup");
    assert(pop && pop.payload.title.includes("2FA") && !pop.payload.emoji && pop.payload.track === false, "popup in the admin's language, no emoji");
    assert(audits("security_remind_2fa").length === 1, "reminder audited");
    r = await call(base, "GET", `${S}/impact`, { token: tok });
    assert(r.status === 200 && r.body.online >= 1 && r.body.signupsLastHour === 0, "impact preview " + r.raw);

    /* ---- 12. tables missing: memory mode ---- */
    const missing = createFakeSupabase(seed(), { missingTables: ["security_events", "security_setting_changes"] });
    events.__resetForTests(missing);
    history.__setDbForTests(missing);
    events.note("failed_login", { ip: "176.88.1.2", accountKey: "x" });
    await events.flush();
    const feed = await events.listFeed({});
    assert(feed.events.length === 1 && feed.persistent === false, "memory feed while the table is missing");
    const h = await history.record({ actor: { id: SECADMIN, username: "demir" }, changes: [{ key: "dmEnabled", from: true, to: false }] });
    const hl = await history.list({});
    assert(hl.persistent === false && hl.entries[0].id === h.id, "memory history while the table is missing");
    const stats = events.computeStats(await events.rowsSince(ago(48 * 3600000)), Date.now(), {});
    assert(stats.kpis.failedLogins.value === 1, "stats from memory");

    console.log("securityCenter.integration ok");
  } finally {
    locks.stopTimer();
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
