"use strict";

/**
 * Moderasyon İşlem masası over real HTTP with the fake Supabase: section guard,
 * step-up on writes, the word filter (seed on read, regex rules, test box, the
 * legacy /profanity routes as one source, /system lists), message gating
 * (block, flag, auto-timeout), the flagged queue (filter rows + open reports,
 * decide, remove, context audited), templates and escalation rules (seeded once),
 * bulk timeout with admin protection and escalation, active sanctions (extend,
 * early lift with a required reason), history search / export, and the 503
 * answer before the migration.
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
const MOD = id(2); // admin with the moderation section
const OTHER_ADMIN = id(3); // admin without it
const TROLL = id(10);
const SPAM = id(11);
const MERT = id(12);
const ELIF = id(13);
const S1 = id(100);
const C1 = id(101);
const TOTP_ON = { totp_enabled_at: "2026-10-01T00:00:00.000Z", totp_secret_enc: "enc" };
const now = Date.now();
const ago = (days) => new Date(now - days * 86400000).toISOString();
const user = (uid, username, extra = {}) => ({ id: uid, username, display_name: username, is_admin: false, is_banned: false, created_at: ago(100), active_sessions: [{ id: `s-${username}` }], ...extra });

const missing = [];
const fake = createFakeSupabase(
  {
    users: [
      user(OWNER, "admin", { is_admin: true, ...TOTP_ON }),
      user(MOD, "demir", { is_admin: true, admin_permissions: ["moderation"], ...TOTP_ON }),
      user(OTHER_ADMIN, "rep", { is_admin: true, admin_permissions: ["reports"], ...TOTP_ON }),
      user(TROLL, "troll42", { display_name: "Troll 42" }),
      user(SPAM, "spammer_99"),
      user(MERT, "mert.k"),
      user(ELIF, "elifsu", { created_at: ago(2) }),
    ],
    user_reports: [
      { id: id(600), reporter_id: ELIF, target_id: MERT, reason: "harassment", status: "open", context_type: "dm", snippet: "sen tam bir salaksın ya", created_at: ago(0.1) },
      { id: id(601), reporter_id: ELIF, target_id: TROLL, reason: "spam", status: "open", context_type: "profile", created_at: ago(0.2) },
    ],
    moderation_actions: [
      { id: id(700), action_type: "timeout", target_user_id: TROLL, actor_user_id: MOD, category: "language", reason: "Abusive Language", duration_seconds: 1800, expires_at: ago(9.9), created_at: ago(10), meta: {} },
      { id: id(701), action_type: "timeout", target_user_id: TROLL, actor_user_id: MOD, category: "language", reason: "Abusive Language", duration_seconds: 1800, expires_at: ago(4.9), created_at: ago(5), meta: {} },
    ],
    servers: [{ id: S1, name: "Minecraft SMP", owner_id: MERT }],
    server_channels: [{ id: C1, server_id: S1, name: "genel" }],
    server_messages: [
      { id: id(901), server_id: S1, channel_id: C1, sender_id: ELIF, content: "kim oyunu bozdu yine", created_at: ago(0.03) },
      { id: id(902), server_id: S1, channel_id: C1, sender_id: TROLL, content: "bu sunucudaki herkes gerizekalı", created_at: ago(0.02) },
      { id: id(903), server_id: S1, channel_id: C1, sender_id: ELIF, content: "yöneticiyi çağırıyorum", created_at: ago(0.01) },
    ],
    ban_appeals: [],
    profanity_rules: [],
    profanity_rule_hits: [],
    flagged_messages: [],
    moderation_templates: [],
    moderation_rules: [],
    admin_audit: [],
  },
  { missingTables: missing }
);
const supabasePath = require.resolve("../db/supabase");
require.cache[supabasePath] = { id: supabasePath, filename: supabasePath, loaded: true, exports: fake };

const express = require("express");
const { signToken, signStepUpToken } = require("../config/jwt");
const adminRouter = require("../routes/admin");
const state = require("../runtime/sharedState");
const contentFilter = require("../lib/contentFilter");
const desk = require("../lib/moderationDesk");

function assert(cond, msg) {
  if (!cond) throw new Error("FAIL: " + msg);
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const T = (name) => fake._tables[name].rows;

const emitted = [];
const io = {
  to(room) {
    return { emit: (event, payload) => emitted.push({ room, event, payload }) };
  },
  in() {
    return { fetchSockets: async () => [] };
  },
  sockets: { sockets: new Map(), adapter: { rooms: new Map() } },
};

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
  return { status: res.status, body: json, raw };
}

const session = (uid, username) => signToken({ id: uid, username, sid: `s-${username}` });
const stepUpFor = (uid, username) => signStepUpToken({ id: uid, sid: `s-${username}` });
const audited = (action) => state.auditLog.filter((e) => e.action === action);

async function run() {
  state.profanityWords.add("eskikelime");
  const { server, base } = await startServer();
  const tok = session(MOD, "demir");
  const step = stepUpFor(MOD, "demir");
  const W = { token: tok, stepUp: step };
  try {
    /* ---- 1. section guard + step-up ---- */
    let r = await call(base, "GET", "/api/admin/moderation/desk", { token: session(OTHER_ADMIN, "rep") });
    assert(r.status === 403 && r.body.section === "moderation", "desk needs moderation " + r.raw);
    r = await call(base, "POST", "/api/admin/moderation/templates", { token: tok, body: { action: "kick", category: "spam" } });
    assert(r.status === 403 && r.body.code === "STEP_UP_REQUIRED", "writes need step-up " + r.raw);

    /* ---- 2. word filter: seeded on read, legacy word migrated ---- */
    r = await call(base, "GET", "/api/admin/moderation/filter", { token: tok });
    assert(r.status === 200 && r.body.ready === true, "filter " + r.raw);
    assert(r.body.counts.defaults === 80, "80 built-in words " + r.body.counts.defaults);
    assert(r.body.rules.some((x) => x.pattern === "eskikelime" && x.source === "legacy"), "legacy word migrated");
    assert(r.body.counts.byLanguage.tr > 40 && r.body.counts.byLanguage.en > 20, "languages " + JSON.stringify(r.body.counts.byLanguage));

    r = await call(base, "POST", "/api/admin/moderation/filter/rules", { ...W, body: { pattern: "/(a+)+/", severity: "high" } });
    assert(r.status === 400 && r.body.code === "RULE_NESTED_QUANTIFIER", "unsafe regex refused " + r.raw);
    r = await call(base, "POST", "/api/admin/moderation/filter/rules", { ...W, body: { pattern: "/d[i1l]sc[o0]rd\\.gift\\/\\w+/", severity: "high", action: "block_timeout", language: "all" } });
    assert(r.status === 201 && r.body.rule.kind === "regex", "regex rule " + r.raw);
    const regexId = r.body.rule.id;
    r = await call(base, "POST", "/api/admin/moderation/filter/rules", { ...W, body: { pattern: "gerizekalı", severity: "high", language: "tr" } });
    assert(r.status === 201 && r.body.rule.action === "block_flag", "high word defaults to block + flag " + r.raw);
    r = await call(base, "POST", "/api/admin/moderation/filter/rules", { ...W, body: { pattern: "aptal*", severity: "medium", language: "tr" } });
    assert(r.status === 201 && r.body.rule.kind === "prefix" && r.body.rule.action === "mask_flag", "prefix rule " + r.raw);
    const aptalId = r.body.rule.id;
    r = await call(base, "POST", "/api/admin/moderation/filter/rules", { ...W, body: { pattern: "Aptal*", severity: "low" } });
    assert(r.status === 409, "duplicate refused " + r.raw);
    assert(audited("profanity_add").length >= 3, "rule adds audited");

    r = await call(base, "GET", `/api/admin/moderation/filter/test?text=${encodeURIComponent("selam dlscord.gift/ab12 acele et aptallar")}`, { token: tok });
    assert(r.status === 200 && r.body.matches.length === 2 && r.body.verdict.action === "block_timeout" && r.body.verdict.timeoutSeconds === 3600, "test box " + r.raw);

    r = await call(base, "PATCH", `/api/admin/moderation/filter/rules/${aptalId}`, { ...W, body: { severity: "low", action: "mask" } });
    assert(r.status === 200 && r.body.rule.severity === "low", "rule update " + r.raw);
    assert(audited("profanity_update")[0].meta.from.severity === "medium", "update audited with before/after");

    /* ---- 3. legacy /profanity routes write the same rules; /system lists ---- */
    state.userRoles.set(OWNER, "admin");
    r = await call(base, "POST", "/api/admin/profanity", { token: session(OWNER, "admin"), stepUp: stepUpFor(OWNER, "admin"), body: { word: "yenikelime" } });
    assert(r.status === 200, "legacy add " + r.raw);
    assert(T("profanity_rules").some((x) => x.pattern === "yenikelime" && !x.removed_at), "legacy add creates a rule");
    assert(state.profanityWords.has("yenikelime") && state.profanityWords.has("aptal*"), "masking list follows the rules");

    /* ---- 4. message gate: block + flag + auto-timeout, flag after send ---- */
    const blocked = contentFilter.gate({ io, userId: SPAM, text: "bedava için tıkla: dlscord.gift/x8K2", ctx: { convType: "server", serverId: S1, channelId: C1 } });
    assert(blocked.blocked === true, "regex rule blocks");
    const passed = contentFilter.gate({ io, userId: TROLL, text: "hepiniz aptalsınız", ctx: { convType: "server", serverId: S1, channelId: C1 } });
    assert(passed.blocked === false && passed.verdict && passed.verdict.flag === false, "low mask rule passes");
    const flaggedSend = contentFilter.gate({ io, userId: TROLL, text: "herkes gerizekalı", ctx: { convType: "server", serverId: S1, channelId: C1 } });
    assert(flaggedSend.blocked === true, "high word blocks");
    contentFilter.after({ ...flaggedSend.verdict, block: false }, { io, userId: TROLL, text: "bu sunucudaki herkes gerizekalı", messageId: id(902), ctx: { convType: "server", serverId: S1, channelId: C1 } });
    await wait(150);
    assert(T("flagged_messages").filter((f) => f.source === "filter").length >= 2, "filter flags saved " + T("flagged_messages").length);
    assert(T("flagged_messages").some((f) => f.where_label === "Minecraft SMP · #genel"), "where label");
    assert(state.timedOutUsers.has(SPAM), "block_timeout timed the sender out");
    assert(emitted.some((e) => e.room === `user:${SPAM}` && e.event === "system:timeout"), "timeout pushed to the user");
    assert(await contentFilter.flushHits() >= 1, "hits flushed");
    assert(T("profanity_rules").find((x) => x.id === regexId).hits_total >= 1, "hit counter");

    /* ---- 5. flagged queue: filter rows + report snippets, context, decide ---- */
    r = await call(base, "GET", "/api/admin/moderation/flagged", { token: tok });
    assert(r.status === 200 && r.body.ready === true, "flagged " + r.raw);
    const fromReport = r.body.items.find((i) => i.id === `report:${id(600)}`);
    assert(fromReport && fromReport.author.username === "mert.k" && fromReport.matches.length === 0, "report snippet listed (salak not a rule yet)");
    assert(!r.body.items.some((i) => i.id === `report:${id(601)}`), "profile reports without snippet stay in Şikayetler");
    const saved = r.body.items.find((i) => i.source === "filter" && i.canRemove);
    assert(saved && saved.matches.some((m) => m.pattern === "gerizekalı"), "highlights from current rules " + JSON.stringify(saved));

    r = await call(base, "GET", `/api/admin/moderation/flagged/${saved.id}/context`, { token: tok });
    assert(r.status === 200 && r.body.messages.length === 3, "context " + r.raw);
    assert(r.body.messages[1].flagged === true && r.body.messages[1].content === null && r.body.messages[0].content === "kim oyunu bozdu yine", "flagged line marked, neighbours shown");
    assert(audited("flagged_context_view").length === 1, "context view audited");

    r = await call(base, "POST", `/api/admin/moderation/flagged/${saved.id}/decide`, { ...W, body: { decision: "remove" } });
    assert(r.status === 200 && r.body.status === "removed", "remove " + r.raw);
    assert(!T("server_messages").some((m) => m.id === id(902)), "message deleted");
    assert(emitted.some((e) => e.event === "server:channel:message:deleted" && e.payload.messageId === id(902)), "clients told");
    r = await call(base, "POST", `/api/admin/moderation/flagged/report:${id(600)}/decide`, { ...W, body: { decision: "approve" } });
    assert(r.status === 200, "approve report " + r.raw);
    assert(T("user_reports").find((x) => x.id === id(600)).status === "dismissed", "report dismissed");
    r = await call(base, "GET", "/api/admin/moderation/flagged", { token: tok });
    assert(!r.body.items.some((i) => i.id === `report:${id(600)}` || i.id === saved.id), "decided items leave the queue");

    /* ---- 6. templates + rules seeded once ---- */
    r = await call(base, "GET", "/api/admin/moderation/templates", { token: tok });
    assert(r.status === 200 && r.body.templates.length === 4 && r.body.templates[0].name === "", "4 suggested templates " + r.raw);
    r = await call(base, "POST", "/api/admin/moderation/templates", { ...W, body: { name: "Davet spamı", action: "timeout", category: "spam", presetId: "6h", durationSeconds: 21600, message: "Merhaba {user}" } });
    assert(r.status === 201, "template create " + r.raw);
    r = await call(base, "DELETE", `/api/admin/moderation/templates/${r.body.template.id}`, W);
    assert(r.status === 200, "template delete");
    r = await call(base, "GET", "/api/admin/moderation/rules", { token: tok });
    assert(r.status === 200 && r.body.rules.length === 1 && r.body.rules[0].steps.length === 4, "suggested rule " + r.raw);
    const ruleId = r.body.rules[0].id;
    r = await call(base, "PUT", `/api/admin/moderation/rules/${ruleId}`, { ...W, body: { ...r.body.rules[0], steps: [{ kind: "timeout", seconds: 10 }] } });
    assert(r.status === 400 && r.body.code === "RULE_STEP", "short timeout step refused");

    /* ---- 7. escalation preview: troll42 has 2 language timeouts in 30 days ---- */
    r = await call(base, "GET", `/api/admin/moderation/escalation?userIds=${TROLL},${MERT}&category=language&action=timeout&seconds=3600`, { token: tok });
    assert(r.status === 200 && r.body.items.length === 2, "escalation " + r.raw);
    const tr = r.body.items.find((x) => x.userId === TROLL);
    assert(tr.nth === 3 && tr.step.kind === "ban" && tr.stronger === true, "3rd violation suggests a ban " + JSON.stringify(tr));
    assert(r.body.items.find((x) => x.userId === MERT).nth === 1, "first violation for mert");

    /* ---- 8. candidates ---- */
    r = await call(base, "GET", "/api/admin/moderation/candidates?filter=reported", { token: tok });
    assert(r.status === 200 && r.body.users.length === 1, "reported users (the dismissed report is gone) " + r.raw);
    const trollRow = r.body.users.find((u) => u.id === TROLL);
    assert(trollRow.sanctions30d === 2 && trollRow.reports === 1, "candidate facts " + JSON.stringify(trollRow));
    r = await call(base, "GET", "/api/admin/moderation/candidates?filter=new", { token: tok });
    assert(r.body.users.some((u) => u.username === "elifsu"), "new accounts");
    r = await call(base, "GET", "/api/admin/moderation/candidates?q=troll", { token: tok });
    assert(r.body.users.length === 1 && r.body.users[0].username === "troll42", "search");

    /* ---- 9. bulk timeout: admin protected, escalation returned ---- */
    r = await call(base, "POST", "/api/admin/moderation/bulk", {
      ...W,
      body: { action: "timeout", category: "language", presetId: "1h", items: [{ userId: TROLL, message: "Merhaba Troll 42" }, { userId: MERT }, { userId: OWNER }] },
    });
    assert(r.status === 200, "bulk " + r.raw);
    const byId = Object.fromEntries(r.body.results.map((x) => [x.userId, x]));
    assert(byId[TROLL].ok && byId[MERT].ok && byId[OWNER].code === "ADMIN_PROTECTED", "bulk results " + r.raw);
    assert(byId[TROLL].escalation && byId[TROLL].escalation.step.kind === "ban" && byId[TROLL].escalation.outcome === "suggested", "escalation after timeout " + JSON.stringify(byId[TROLL].escalation));
    assert(T("users").find((u) => u.id === TROLL).timeout_message === "Merhaba Troll 42", "per-user message");
    assert(audited("timeout").filter((a) => a.meta.bulk).length === 2, "bulk audited per user");
    assert(T("moderation_rules")[0].trigger_count >= 1, "rule trigger counted");

    /* ---- 10. active sanctions: extend, edit note, lift needs a reason ---- */
    r = await call(base, "GET", "/api/admin/moderation/sanctions", { token: tok });
    assert(r.status === 200 && r.body.items.filter((i) => i.type === "timeout").length === 3, "active timeouts " + r.raw);
    const mertItem = r.body.items.find((i) => i.user.id === MERT);
    assert(mertItem.actor.username === "demir", "actor shown");
    const before = Date.parse(T("users").find((u) => u.id === MERT).timeout_until);
    r = await call(base, "POST", `/api/admin/moderation/sanctions/${MERT}/extend`, { ...W, body: { type: "timeout", seconds: 3600 } });
    assert(r.status === 200 && Date.parse(r.body.until) - before === 3600000, "extend " + r.raw);
    assert(Date.parse(state.timedOutUsers.get(MERT).until) === Date.parse(r.body.until), "memory updated");
    r = await call(base, "PATCH", `/api/admin/moderation/sanctions/${MERT}/message`, { ...W, body: { type: "timeout", message: "Yeni not" } });
    assert(r.status === 200 && T("users").find((u) => u.id === MERT).timeout_message === "Yeni not", "note edit");
    r = await call(base, "POST", `/api/admin/moderation/sanctions/${MERT}/lift`, { ...W, body: { type: "timeout" } });
    assert(r.status === 400 && r.body.code === "LIFT_REASON", "lift needs a reason");
    r = await call(base, "POST", `/api/admin/moderation/sanctions/${MERT}/lift`, { ...W, body: { type: "timeout", reasonCode: "other", note: "" } });
    assert(r.status === 400 && r.body.code === "LIFT_NOTE", "other needs text");
    r = await call(base, "POST", `/api/admin/moderation/sanctions/${MERT}/lift`, { ...W, body: { type: "timeout", reasonCode: "wrong_person", note: "Kardeşi yazmış", notify: true, discount: true } });
    assert(r.status === 200, "lift " + r.raw);
    assert(!state.timedOutUsers.has(MERT) && !T("users").find((u) => u.id === MERT).timeout_until, "lifted");
    const liftedRow = T("moderation_actions").find((a) => a.target_user_id === MERT && a.action_type === "timeout");
    assert(liftedRow.revoked_at && liftedRow.meta.earlyLift && liftedRow.meta.liftReason === "wrong_person", "sanction row marked");
    assert(audited("untimeout").some((a) => a.meta.early && a.meta.reasonCode === "wrong_person"), "lift audited");

    /* ---- 11. history search + export ---- */
    r = await call(base, "GET", "/api/admin/moderation/history/search?days=14&type=timeout", { token: tok });
    assert(r.status === 200 && r.body.chart.length === 14, "history " + r.raw);
    const mertRow = r.body.rows.find((x) => x.target.id === MERT && x.action === "timeout");
    assert(mertRow.status === "lifted" && mertRow.liftedBy.username === "demir", "lifted status " + JSON.stringify(mertRow));
    const trollActive = r.body.rows.find((x) => x.target.id === TROLL && x.action === "timeout");
    assert(trollActive.status === "active", "active status");
    assert(r.body.rows.some((x) => x.target.id === SPAM && x.auto === true), "automatic timeout shows as auto");
    r = await call(base, "GET", `/api/admin/moderation/history/search?days=14&q=troll`, { token: tok });
    assert(r.body.rows.every((x) => x.target.username === "troll42"), "search filter");
    r = await call(base, "GET", "/api/admin/moderation/history/search?days=30&limit=2&offset=0", { token: tok });
    assert(r.body.rows.length === 2 && r.body.total > 2, "paging");
    r = await call(base, "GET", "/api/admin/moderation/history/export?days=30&format=csv", { token: tok });
    assert(r.status === 200 && r.raw.startsWith("created_at,action,target"), "csv export");
    assert(audited("moderation_history_export").length === 1, "export audited");

    /* ---- 12. summary ---- */
    r = await call(base, "GET", "/api/admin/moderation/desk", { token: tok });
    assert(r.status === 200 && r.body.activeTimeouts === 2 && r.body.todayActions >= 3, "summary " + r.raw);

    /* ---- 13. /system lists ---- */
    r = await call(base, "GET", "/api/admin/system", { token: session(OWNER, "admin") });
    assert(r.status === 200 && Array.isArray(r.body.profanityWords) && r.body.profanityWords.includes("aptal*"), "system words " + r.raw.slice(0, 300));
    assert(Array.isArray(r.body.flaggedMessages) && r.body.flaggedCount === r.body.flaggedMessages.length, "system flagged list");

    /* ---- 14. before the migration: reads empty, writes 503 ---- */
    missing.push("moderation_templates", "moderation_rules", "profanity_rules", "profanity_rule_hits", "flagged_messages");
    contentFilter.__resetForTests();
    desk.__resetForTests();
    r = await call(base, "GET", "/api/admin/moderation/filter", { token: tok });
    assert(r.status === 200 && r.body.ready === false && r.body.counts.defaults === 80, "fallback filter " + r.raw.slice(0, 200));
    r = await call(base, "POST", "/api/admin/moderation/filter/rules", { ...W, body: { pattern: "x1y2" } });
    assert(r.status === 503 && r.body.code === "MODERATION_DESK_UNAVAILABLE", "503 before migration " + r.raw);
    r = await call(base, "GET", "/api/admin/moderation/templates", { token: tok });
    assert(r.status === 200 && r.body.ready === false && r.body.templates.length === 0, "templates fallback");
    r = await call(base, "GET", "/api/admin/moderation/flagged", { token: tok });
    assert(r.status === 200 && r.body.ready === false, "flagged fallback " + r.raw);
    assert(contentFilter.gate({ io, userId: TROLL, text: "amk", ctx: { convType: "dm", peerId: ELIF } }).verdict.action === "mask", "built-in list still matches");

    console.log("moderationDesk integration: all checks passed");
  } finally {
    server.close();
    require("../lib/moderation").stopModerationSync?.();
  }
}

run()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
