"use strict";

/**
 * Sistem (admin section system, Draft A "Kontrol merkezi") over real HTTP with the fake
 * Supabase and a fake Socket.IO server: section gate, overview, flag editor (rule
 * validation, storage, shared settings history with meta.flagState, audit, per-socket
 * features:updated), row toggle keeping a paused rollout, "Buna dön", edge stages,
 * kill switches (reason when something is cut off), limits + reset, undo, broadcast,
 * the backup file download, the safe restart (reason, typed confirm, drain, exit hook)
 * and the retired legacy restart. Pure helpers of the page are covered at the end.
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
const SYSADMIN = id(2);
const OTHERADMIN = id(3);
const ELIF = id(10);
const MERT = id(11);
const TOTP_ON = { totp_enabled_at: "2026-10-01T00:00:00.000Z", totp_secret_enc: "enc" };
const now = Date.now();
const ago = (ms) => new Date(now - ms).toISOString();
const user = (uid, username, extra = {}) => ({ id: uid, username, display_name: username, is_admin: false, active_sessions: [{ id: `s-${username}` }], language: "tr", created_at: ago(400 * 86400000), ...extra });

const fake = createFakeSupabase({
  users: [
    user(OWNER, "admin", { is_admin: true, ...TOTP_ON }),
    user(SYSADMIN, "demir", { is_admin: true, admin_permissions: ["system"], ...TOTP_ON }),
    user(OTHERADMIN, "other", { is_admin: true, admin_permissions: ["reports"], ...TOTP_ON }),
    user(ELIF, "elifk", { is_admin: true, admin_permissions: ["reports"], ...TOTP_ON }),
    user(MERT, "mert"),
  ],
  security_setting_changes: [],
  admin_audit: [],
  system_settings: [{ id: "default", config: {}, started_at: ago(86400000) }],
  maintenance_windows: [],
});
const supabasePath = require.resolve("../db/supabase");
require.cache[supabasePath] = { id: supabasePath, filename: supabasePath, loaded: true, exports: fake };

const express = require("express");
const { signToken, signStepUpToken } = require("../config/jwt");
const adminRouter = require("../routes/admin");
const state = require("../runtime/sharedState");
const history = require("../lib/settingsHistory");
const restart = require("../lib/systemRestart");
const model = require("../lib/systemControlModel");
const flagsLib = require("../lib/systemFlags");
const boot = require("../lib/systemBoot");
const healthLib = require("../lib/systemHealth");

function assert(cond, msg) {
  if (!cond) throw new Error("FAIL: " + msg);
}

/* ---- fake Socket.IO ---- */
const emitted = [];
const sockets = new Map();
const middlewares = [];
const room = (name) => ({ emit: (event, payload) => emitted.push({ room: name, event, payload }), to: (other) => room(`${name}+${other}`) });
const ns = { sockets, adapter: { rooms: new Map() } };
const io = {
  to: (name) => room(name),
  emit: (event, payload) => emitted.push({ room: "*", event, payload }),
  of: () => ns,
  use: (fn) => middlewares.push(fn),
  engine: { get clientsCount() { return sockets.size; } },
  sockets: { adapter: ns.adapter, sockets },
};
function connect(uid, username, app = "web") {
  const s = {
    id: `sock-${uid}-${app}`,
    user: { id: uid, username },
    handshake: { auth: { app }, headers: {} },
    own: [],
    disconnected: false,
    emit: (event, payload) => s.own.push({ event, payload }),
    disconnect: () => {
      s.disconnected = true;
      sockets.delete(s.id);
    },
  };
  sockets.set(s.id, s);
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
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(stepUp ? { "X-Admin-Step-Up": stepUp } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const raw = await res.text();
  let json = {};
  try {
    json = JSON.parse(raw);
  } catch {
    json = {};
  }
  return { status: res.status, body: json, raw, headers: res.headers };
}

const session = (uid, username) => signToken({ id: uid, username, sid: `s-${username}` });
const stepUpFor = (uid, username) => signStepUpToken({ id: uid, sid: `s-${username}` });
const audits = (action) => state.auditLog.filter((e) => e.action === action);
const lastFeatures = (s) => [...s.own].reverse().find((e) => e.event === "features:updated")?.payload;

async function run() {
  history.__setDbForTests(fake);
  const exits = [];
  restart.__resetForTests({ exit: (code) => exits.push(code), timing: { countdownSec: 0, gapMs: 0 } });
  healthLib.__configureForTests({ getIo: () => io, supabase: fake });
  const { server, base } = await startServer();
  const tok = session(SYSADMIN, "demir");
  const step = stepUpFor(SYSADMIN, "demir");
  const A = "/api/admin/system";
  const elifWeb = connect(ELIF, "elifk", "web");
  const mertIos = connect(MERT, "mert", "ios");
  const mertWeb = connect(MERT, "mert", "web");
  try {
    /* ---- 1. section gate ---- */
    let r = await call(base, "GET", `${A}/overview`, { token: session(OTHERADMIN, "other") });
    assert(r.status === 403, "admin without the system section is refused " + r.raw);

    /* ---- 2. overview ---- */
    r = await call(base, "GET", `${A}/overview`, { token: tok });
    assert(r.status === 200, "overview " + r.raw);
    const ov = r.body;
    assert(ov.flags.map((f) => f.key).join() === "iosGlass,desktopGlass,presenceScoped,bootDiet,edgeRealtime", "five flags in the draft order");
    assert(ov.flags[0].rule.mode === "all" && ov.flags[0].rule.platforms.join() === "ios", "iOS glass: everyone on iOS");
    assert(ov.flags[1].rule.mode === "off", "desktop glass off by default");
    assert(ov.health && ov.health.current && typeof ov.health.current.rssMb === "number", "health tiles");
    assert(ov.switches.registrationEnabled === true && ov.switches.voice === true, "switch view");
    assert(ov.limits.values.maxMessageLength === 2000 && ov.limits.defaults.maxMessagesPerMinute === 60, "limits");
    assert(ov.edge.stages.length === 6 && ov.edge.stage === null, "edge pipeline, off");
    assert(ov.info.bootId && ov.info.version, "header chips " + JSON.stringify(ov.info));

    /* ---- 3. flag editor ---- */
    r = await call(base, "PATCH", `${A}/flags/presenceScoped`, { token: tok, stepUp: step, body: { rule: { mode: "rollout", percent: 20 } } });
    assert(r.status === 400 && r.body.code === "SERVER_WIDE", "server-wide flag only on / off");
    r = await call(base, "PATCH", `${A}/flags/desktopGlass`, { token: tok, stepUp: step, body: { rule: { mode: "rollout", percent: 0 } } });
    assert(r.status === 400 && r.body.code === "BAD_PERCENT", "rollout needs 1..99 %");
    r = await call(base, "PATCH", `${A}/flags/desktopGlass`, { token: tok, body: { rule: { mode: "staff" } } });
    assert(r.status === 403 && r.body.code === "STEP_UP_REQUIRED", "writes need the step-up code");
    r = await call(base, "PATCH", `${A}/flags/nope`, { token: tok, stepUp: step, body: { rule: { mode: "all" } } });
    assert(r.status === 404, "unknown flag");

    r = await call(base, "PATCH", `${A}/flags/desktopGlass`, { token: tok, stepUp: step, body: { rule: { mode: "staff", platforms: ["web", "electron"], staff: [ELIF] }, reason: "İlk deneme" } });
    assert(r.status === 200 && r.body.changed, "staff only " + r.raw);
    const firstId = r.body.entry.id;
    r = await call(base, "PATCH", `${A}/flags/desktopGlass`, { token: tok, stepUp: step, body: { rule: { mode: "rollout", percent: 25, platforms: ["web", "electron", "ios"], staff: [ELIF] }, reason: "Ekip testi bitti", autoRollback: true } });
    assert(r.status === 200 && r.body.guard && r.body.guard.threshold === 0.02, "rollout with the error guard " + r.raw);
    const stored = state.systemConfig.featureFlags.desktopGlass;
    assert(stored.mode === "rollout" && stored.percent === 25 && stored.platforms.join() === "web,electron" && stored.staff.join() === ELIF, "stored rule (iOS cut: separate flag) " + JSON.stringify(stored));
    const persisted = (await fake.from("system_settings").select("*")).data[0].config.featureFlags.desktopGlass;
    assert(persisted.mode === "rollout" && persisted.percent === 25, "persisted in system_settings");
    const entries = (await fake.from("security_setting_changes").select("*")).data;
    const e2 = entries.find((e) => e.reason === "Ekip testi bitti");
    assert(e2 && e2.source === "system" && e2.meta.flag === "desktopGlass" && e2.meta.flagState.percent === 25, "shared settings history with the whole rule");
    assert(e2.changes[0].key === "featureFlags.desktopGlass" && e2.changes[0].from.mode === "staff" && e2.changes[0].to.mode === "rollout", "old and new value in the change");
    assert(audits("system_flag").length === 2 && audits("system_flag")[0].meta.changes.length === 1, "audited with the diff");
    const fElif = lastFeatures(elifWeb);
    assert(fElif.desktopGlass === true && fElif.flagRules.desktopGlass.staff === true, "staff gets it, told per socket");
    assert(!JSON.stringify(fElif).includes(ELIF), "no staff ids in the client payload");
    assert(lastFeatures(mertIos).desktopGlass === false, "iOS not in the platforms");
    const mertBucket = require("../lib/featureRollout").bucketOf("desktopGlass", MERT);
    assert(lastFeatures(mertWeb).desktopGlass === mertBucket < 25, "web user by bucket");
    assert(emitted.some((e) => e.room === "admin" && e.event === "admin:update" && e.payload.type === "system_config"), "admin room told");
    flagsLib.clearGuard("desktopGlass");

    /* ---- 4. row toggle keeps the paused rollout ---- */
    r = await call(base, "POST", `${A}/flags/desktopGlass/toggle`, { token: tok, stepUp: step, body: { on: false } });
    assert(r.status === 200 && r.body.flag.rule.mode === "off" && r.body.flag.rule.percent === 25, "off keeps 25 % " + r.raw);
    r = await call(base, "POST", `${A}/flags/desktopGlass/toggle`, { token: tok, stepUp: step, body: { on: true } });
    assert(r.body.flag.rule.mode === "rollout" && r.body.flag.rule.percent === 25, "on resumes the rollout");

    /* ---- 5. history + Buna dön ---- */
    r = await call(base, "GET", `${A}/flags/desktopGlass/history`, { token: tok });
    assert(r.status === 200 && r.body.entries.length >= 4, "flag history " + r.raw);
    assert(r.body.entries[0].current === true, "newest entry is ŞU AN");
    assert(r.body.names[ELIF] === "elifk", "staff usernames resolved");
    r = await call(base, "POST", `${A}/flags/desktopGlass/restore`, { token: tok, stepUp: step, body: { historyId: firstId, reason: "Geri" } });
    assert(r.status === 200 && r.body.flag.rule.mode === "staff", "Buna dön puts the staff-only state back " + r.raw);
    assert(audits("system_flag_restore").length === 1, "restore audited");

    /* ---- 6. try on my account ---- */
    const me = connect(SYSADMIN, "demir", "electron");
    r = await call(base, "POST", `${A}/flags/desktopGlass/try`, { token: tok, stepUp: step, body: { rule: { mode: "all" } } });
    assert(r.status === 200 && r.body.reached === 1 && lastFeatures(me).desktopGlass === true, "only my sockets get the trial");
    assert(state.systemConfig.featureFlags.desktopGlass.mode === "staff", "trial stores nothing");
    r = await call(base, "POST", `${A}/flags/bootDiet/try`, { token: tok, stepUp: step, body: { rule: { mode: "all" } } });
    assert(r.status === 400 && r.body.code === "TRY_CLIENT_ONLY", "trial only for client flags");

    /* ---- 7. edge stages ---- */
    r = await call(base, "POST", `${A}/edge/stage`, { token: tok, stepUp: step, body: { stage: "p25" } });
    assert(r.status === 200 && r.body.edge.stage === "p25", "edge to 25 % " + r.raw);
    assert(state.systemConfig.featureFlags.edgeRealtime === true && state.systemConfig.edgeRealtimePercent === 25, "edge config written");
    r = await call(base, "GET", `${A}/edge/history`, { token: tok });
    assert(r.status === 200 && r.body.days.length === 14 && r.body.markers.some((m) => m.stage === "p25"), "14 days + stage markers " + r.raw);

    /* ---- 8. kill switches ---- */
    r = await call(base, "PATCH", `${A}/switches`, { token: tok, stepUp: step, body: { patch: { dmEnabled: false } } });
    assert(r.status === 400 && r.body.code === "REASON_REQUIRED", "cutting DMs needs a reason");
    r = await call(base, "PATCH", `${A}/switches`, { token: tok, stepUp: step, body: { patch: { dmEnabled: false, voice: false }, reason: "Spam dalgası" } });
    assert(r.status === 200 && r.body.switches.dmEnabled === false && r.body.switches.voice === false, "switches applied " + r.raw);
    assert(state.systemConfig.featureFlags.voice === false && state.systemConfig.featureFlags.desktopGlass.mode === "staff", "voice flag off, other flags kept");
    const swEntry = r.body.entry.id;
    r = await call(base, "PATCH", `${A}/switches`, { token: tok, stepUp: step, body: { patch: { slowModeSeconds: 5000 } } });
    assert(r.status === 400 && r.body.key === "slowModeSeconds", "slow mode range");
    r = await call(base, "PATCH", `${A}/switches`, { token: tok, stepUp: step, body: { patch: { slowModeSeconds: 10 } } });
    assert(r.status === 200 && state.systemConfig.slowModeSeconds === 10, "slow mode without a reason");

    /* ---- 9. undo ---- */
    r = await call(base, "POST", `${A}/history/${swEntry}/undo`, { token: tok, stepUp: step, body: {} });
    assert(r.status === 200 && state.systemConfig.dmEnabled === true && state.systemConfig.featureFlags.voice === true, "undo restores " + r.raw);
    r = await call(base, "POST", `${A}/history/${swEntry}/undo`, { token: tok, stepUp: step, body: {} });
    assert(r.status === 409, "undo once");

    /* ---- 10. limits ---- */
    r = await call(base, "PATCH", `${A}/limits`, { token: tok, stepUp: step, body: { patch: { maxMessageLength: 0 } } });
    assert(r.status === 400, "limit range");
    r = await call(base, "PATCH", `${A}/limits`, { token: tok, stepUp: step, body: { patch: { maxMessageLength: 4000, rateLimitGlobalMs: 250 } } });
    assert(r.status === 200 && r.body.limits.values.maxMessageLength === 4000 && r.body.limits.last.maxMessageLength.by === "demir", "limits saved with who " + r.raw);
    r = await call(base, "POST", `${A}/limits/reset`, { token: tok, stepUp: step, body: {} });
    assert(r.status === 200 && state.systemConfig.maxMessageLength === 2000 && state.systemConfig.rateLimitGlobalMs === 0, "back to defaults");

    /* ---- 11. broadcast ---- */
    r = await call(base, "POST", `${A}/broadcast`, { token: tok, stepUp: step, body: { text: "  Bakım 02:00'de  " } });
    assert(r.status === 200 && r.body.reach === 3, "broadcast reach = connected users " + r.raw);
    assert(emitted.some((e) => e.room === "*" && e.event === "server:announcement" && e.payload.text === "Bakım 02:00'de"), "sent to everyone");
    r = await call(base, "GET", `${A}/broadcasts`, { token: tok });
    assert(r.body.entries[0].text === "Bakım 02:00'de" && r.body.entries[0].reach === 3, "broadcast history");

    /* ---- 12. backup download ---- */
    r = await call(base, "POST", `${A}/backup`, { token: tok, stepUp: step, body: {} });
    assert(r.status === 200 && /attachment; filename="descall-backup-\d{4}-\d{2}-\d{2}-\d{4}\.json"/.test(r.headers.get("content-disposition")), "file download " + r.headers.get("content-disposition"));
    assert(r.body.kind === "descall-memory-backup" && r.body.systemConfig && Array.isArray(r.body.generalMessages), "backup content");
    assert(audits("system_backup")[0].meta.bytes === Number(r.headers.get("x-backup-bytes")), "backup size audited");

    /* ---- 13. safe restart ---- */
    r = await call(base, "POST", "/api/admin/restart", { token: tok, stepUp: step, body: {} });
    assert(r.status === 410 && r.body.code === "USE_SAFE_RESTART", "legacy restart retired");
    r = await call(base, "GET", `${A}/restart`, { token: tok });
    assert(r.status === 200 && r.body.confirmWords.tr === "YENİDEN BAŞLAT" && r.body.sockets === sockets.size, "restart dialog data " + r.raw);
    r = await call(base, "POST", `${A}/restart`, { token: tok, stepUp: step, body: { reason: "kısa", confirm: "YENİDEN BAŞLAT" } });
    assert(r.status === 400 && r.body.code === "REASON_REQUIRED", "reason required");
    r = await call(base, "POST", `${A}/restart`, { token: tok, stepUp: step, body: { reason: "Bellek 900 MB'ı geçti", confirm: "yeniden" } });
    assert(r.status === 400 && r.body.code === "CONFIRM_MISMATCH", "typed confirm");
    r = await call(base, "POST", `${A}/restart`, { token: tok, stepUp: step, body: { reason: "Bellek 900 MB'ı geçti", confirm: "yeniden başlat", notifyTeam: false, backupBytes: 2400000 } });
    assert(r.status === 200 && r.body.run.steps[0].status === "done", "restart started " + r.raw);
    await new Promise((res) => setTimeout(res, 1500));
    assert(exits.length === 1 && exits[0] === 0, "process exit after the drain");
    assert(elifWeb.disconnected && mertIos.disconnected, "sockets drained");
    assert(elifWeb.own.some((e) => e.event === "server:restarting"), "clients told before the drain");
    assert(restart.isDraining(), "health says draining");
    assert(middlewares.length === 1, "new connections refused");
    let refused = null;
    middlewares[0]({}, (err) => {
      refused = err;
    });
    assert(refused && refused.message === "server_draining", "middleware refuses during the drain");
    assert(audits("system_restart").length === 1 && audits("system_restart")[0].meta.reason === "Bellek 900 MB'ı geçti", "restart audited");
    r = await call(base, "POST", `${A}/restart`, { token: tok, stepUp: step, body: { reason: "Bellek 900 MB'ı geçti", confirm: "RESTART" } });
    assert(r.status === 409 && r.body.code === "RESTART_RUNNING", "one run at a time");
  } finally {
    server.close();
    restart.__resetForTests();
  }

  /* ---- pure helpers ---- */
  assert(restart.confirmMatches("YENİDEN BAŞLAT") && restart.confirmMatches(" yeniden   başlat ") && restart.confirmMatches("restart") && !restart.confirmMatches("YENIDEN"), "typed confirm rules");
  assert(model.backupFileName(Date.parse("2026-11-14T00:00:00Z")) === "descall-backup-2026-11-14-0300.json", "backup name in Istanbul time");
  const v = model.validateSwitchPatch({ patch: { chatFrozen: true, registrationEnabled: true } });
  assert(v.cutting.join() === "chatFrozen", "freezing cuts, enabling does not");
  assert(boot.causeOf(null, {}) === "first" && boot.causeOf({ exit_at: "x" }, {}) === "admin" && boot.causeOf({ commit: "a" }, { commit: "b" }) === "deploy" && boot.causeOf({ commit: "a" }, { commit: "a" }) === "auto", "restart causes");
  assert(boot.downtimeOf({ exit_at: "2026-11-12T03:10:00Z" }, "2026-11-12T03:10:41Z") === 41, "downtime from the exit");
  assert(boot.availabilityOf([{ started_at: new Date().toISOString(), downtime_sec: 518 }], 30) === 99.98, "availability over 30 days");
  const er = flagsLib.errorRate([{ timestamp: new Date().toISOString(), user: { id: "a" } }, { at: new Date().toISOString(), userId: "b" }, { timestamp: new Date().toISOString(), userId: "c", severity: "warning" }], new Date(Date.now() - 1000).toISOString(), 50);
  assert(er.users === 2 && er.rate === 0.04, "error rate " + JSON.stringify(er));
  assert(!flagsLib.shouldRollBack(er) && flagsLib.shouldRollBack({ users: 3, rate: 0.03 }), "rollback needs 3 users and > 2 %");
  assert(flagsLib.edgeStage({ mode: "staff", percent: 0, staff: [] }) === "shadow" && flagsLib.edgeStage({ mode: "staff", percent: 0, staff: ["x"] }) === "team", "shadow vs team");
  assert(healthLib.levels({ cpu: 95, rssMb: 100, memLimitMb: 1000, lagP99: 18, dbMs: null }).cpu === "bad", "health levels");
  console.log("adminSystem.integration.test ok");
}

run().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  }
);
