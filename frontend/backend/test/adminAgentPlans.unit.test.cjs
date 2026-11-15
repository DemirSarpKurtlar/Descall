"use strict";

/**
 * Admin agent, phase 2: plans. The pure model (proposal validation, dry run, diff,
 * scopes, schedule), and the plan service end to end with an in-memory database and
 * fake action handlers: propose -> auto-exclusions -> new version with diff -> approve
 * -> one item at a time, re-checked -> skip / fail-pauses / resume -> undo window -> cancel.
 * Plus the scheduled task runner. No network, no key.
 */
const assert = require("node:assert/strict");
process.env.SUPABASE_URL = process.env.SUPABASE_URL || "https://placeholder.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "placeholder";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret-for-agent-plans";

const model = require("../lib/adminAgent/planModel");
const planStore = require("../lib/adminAgent/planStore");
const actions = require("../lib/adminAgent/actions");
const plans = require("../lib/adminAgent/plans");
const scheduler = require("../lib/adminAgent/scheduler");
const state = require("../runtime/sharedState");
const actionsUndo = actions.undo;

/* ---------- tiny in-memory Supabase with the chains planStore uses ---------- */
function fakeDb(seed = {}) {
  const tables = { agent_plans: [], agent_plan_items: [], agent_scopes: [], agent_saved_prompts: [], agent_scheduled_tasks: [], users: [], ...seed };
  let code = 410;
  let n = 0;
  const uuid = () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;
  function q(name) {
    if (!tables[name]) tables[name] = [];
    const st = { filters: [], or: null, op: "select", payload: null, single: false, order: null, limit: null, returning: false };
    const pass = (r) => st.filters.every((f) => f(r)) && (!st.or || st.or(r));
    const api = {
      select() { if (st.op !== "select") st.returning = true; return api; },
      eq(k, v) { st.filters.push((r) => String(r[k]) === String(v)); return api; },
      in(k, vs) { st.filters.push((r) => vs.map(String).includes(String(r[k]))); return api; },
      gte(k, v) { st.filters.push((r) => r[k] != null && String(r[k]) >= String(v)); return api; },
      lte(k, v) { st.filters.push((r) => r[k] != null && String(r[k]) <= String(v)); return api; },
      or(expr) {
        const parts = expr.split(",").map((c) => {
          const [col, op, ...rest] = c.split(".");
          const val = rest.join(".");
          if (op === "is") return (r) => r[col] == null;
          if (op === "lt") return (r) => r[col] != null && String(r[col]) < val;
          if (op === "eq") return (r) => String(r[col]) === val;
          return () => false;
        });
        st.or = (r) => parts.some((f) => f(r));
        return api;
      },
      order(k, { ascending }) { st.order = [k, ascending]; return api; },
      limit(x) { st.limit = x; return api; },
      insert(p) { st.op = "insert"; st.payload = Array.isArray(p) ? p : [p]; return api; },
      upsert(p) { st.op = "upsert"; st.payload = p; return api; },
      update(p) { st.op = "update"; st.payload = p; return api; },
      delete() { st.op = "delete"; return api; },
      maybeSingle() { st.single = true; return api; },
      single() { st.single = true; return api; },
      then(res, rej) { return Promise.resolve(exec()).then(res, rej); },
    };
    function exec() {
      const t = tables[name];
      if (st.op === "insert") {
        const made = st.payload.map((r) => {
          const row = { id: uuid(), created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...JSON.parse(JSON.stringify(r)) };
          if (name === "agent_plans" && row.code == null) row.code = ++code;
          return row;
        });
        t.push(...made);
        return { data: st.single ? made[0] : made, error: null };
      }
      if (st.op === "upsert") {
        const i = t.findIndex((r) => r.id === st.payload.id);
        if (i >= 0) Object.assign(t[i], st.payload); else t.push({ ...st.payload });
        return { data: null, error: null };
      }
      const rows = t.filter(pass);
      if (st.op === "update") { rows.forEach((r) => Object.assign(r, JSON.parse(JSON.stringify(st.payload)))); return { data: st.returning ? rows : null, error: null }; }
      if (st.op === "delete") { tables[name] = t.filter((r) => !pass(r)); return { data: null, error: null }; }
      let out = rows;
      if (st.order) out = [...out].sort((a, b) => (a[st.order[0]] > b[st.order[0]] ? 1 : a[st.order[0]] < b[st.order[0]] ? -1 : 0) * (st.order[1] ? 1 : -1));
      if (st.limit) out = out.slice(0, st.limit);
      return { data: st.single ? out[0] || null : out, error: null };
    }
    return api;
  }
  return { from: q, tables };
}

/* ---------- fixtures ---------- */
const U = (k) => `11111111-1111-4111-8111-${String(k).padStart(12, "0")}`;
const ADMIN = { id: U(1), username: "demir" };
const users = {
  [U(2)]: { username: "kazanc_botu41" },
  [U(3)]: { username: "descoin.farm07" },
  [U(4)]: { username: "ayse.k_2011", banned: true },
  [U(5)]: { username: "selinsu", premium: "plus" },
  [U(6)]: { username: "mod_ali", isAdmin: true },
  [U(7)]: { username: "tuana.pxl" },
};

function installFakes() {
  const executed = [];
  const undone = [];
  const failOn = new Set();
  actions.loadTargets = async (ids) => {
    const m = new Map();
    for (const id of ids || []) {
      const u = users[id];
      m.set(String(id), u ? { exists: true, id, username: u.username, isAdmin: Boolean(u.isAdmin), isOwner: false, premium: u.premium || null, banned: Boolean(u.banned), timedOut: false, frozen: false } : { exists: false, id });
    }
    return m;
  };
  actions.execute = async (item) => {
    if (failOn.has(item.target_user_id)) throw Object.assign(new Error("db down"), { code: "DB" });
    if (users[item.target_user_id]?.banned && item.action === "ban") return { status: "skipped", result: { code: "already_banned" }, undo: null };
    executed.push([item.action, users[item.target_user_id]?.username]);
    return { status: "done", result: {}, undo: item.action === "ban" ? { kind: "unban" } : item.action === "timeout" ? { kind: "untimeout" } : null };
  };
  actions.undo = async (item) => { undone.push(users[item.target_user_id]?.username); return { result: {} }; };
  return { executed, undone, failOn };
}

const perms = (sections, owner = false) => ({
  invalidate() {},
  async loadRow(id) { return { id, is_admin: true, is_super_admin: owner }; },
  sectionsFor() { return sections; },
  isOwner() { return owner; },
});

(async () => {
  /* ===== pure model ===== */
  const scopes = model.normalizeScopes({});
  assert.equal(model.scopeOnCount(scopes), 4, "draft default: Okuma, Moderasyon, Cüzdan, Rozetler on");
  assert.equal(scopes.moderation.limit, 50);
  assert.equal(scopes.wallet.limit, 100000);
  assert.equal(scopes.dm.on, false);
  assert.throws(() => model.applyScopePatch({ scopes }, { scopes: { moderation: { limit: 0 } } }), (e) => e.code === "BAD_LIMIT");
  const patched = model.applyScopePatch({ scopes, require_2fa_each: true }, { scopes: { shop: { on: true } }, require2faEach: false });
  assert.equal(patched.scopes.shop.on, true);
  assert.equal(patched.require_2fa_each, false);

  // Proposal validation: unknown action, missing target, bad params and duplicates are reported, not stored.
  const prop = model.normalizeProposal({
    title: "Şüpheli hesaplar",
    items: [
      { action: "ban", userId: U(2), params: { category: "spam", presetId: "30d" }, risk: 94, evidence: { signals: [{ label: "Aynı cihaz · @coinfarm_tr", tone: "hot" }], reason: "x", links: [{ username: "@coinfarm_tr", relation: "Aynı cihaz", tone: "hot" }] } },
      { action: "ban", userId: U(2), params: { category: "spam" } },
      { action: "nuke", userId: U(3) },
      { action: "timeout", params: {} },
      { action: "descoin_grant", userId: U(3), params: { amount: 0 } },
      { action: "announcement", params: { title: "Bakım", content: "Bu gece" } },
    ],
  });
  assert.equal(prop.items.length, 2);
  assert.equal(prop.rejected.length, 4);
  assert.equal(prop.items[0].params.presetId, "30d");
  assert.equal(prop.items[0].params.revokeSessions, true, "ban flags default like the BanDialog");
  assert.equal(prop.items[0].evidence.links[0].username, "coinfarm_tr");
  assert.throws(() => model.normalizeProposal({ title: "x", items: [{ action: "nuke" }] }), (e) => e.code === "BAD_PLAN");
  assert.equal(model.normalizeParams("timeout", { presetId: "nope" }).presetId, "24h");

  // Diff: removed, added and "yasak -> sustur".
  const d = model.diffPlans(
    [{ action: "ban", target_user_id: U(5), target_username: "selinsu", params: {} }, { action: "ban", target_user_id: U(7), target_username: "tuana.pxl", params: { presetId: "30d" } }],
    [{ action: "timeout", target_user_id: U(7), target_username: "tuana.pxl", params: { presetId: "24h" } }, { action: "ban", target_user_id: U(2), target_username: "kazanc_botu41", params: {} }],
  );
  assert.deepEqual(d.removed.map((x) => x.username), ["selinsu"]);
  assert.deepEqual(d.added.map((x) => x.username), ["kazanc_botu41"]);
  assert.equal(d.changed[0].username, "tuana.pxl");
  assert.equal(d.changed[0].from.action, "ban");

  // Dry run verdicts.
  const targets = await (async () => { installFakes(); return actions.loadTargets([U(2), U(4), U(5), U(6)]); })();
  const ev = model.evaluateItems([
    { id: "a", action: "ban", target_user_id: U(2), params: { presetId: "30d" }, selected: true },
    { id: "b", action: "ban", target_user_id: U(4), params: { presetId: "30d" }, selected: true },
    { id: "c", action: "ban", target_user_id: U(5), params: {}, selected: true },
    { id: "d", action: "ban", target_user_id: U(6), params: {}, selected: true },
    { id: "e", action: "ban", target_user_id: U(2), params: { presetId: "permanent" }, selected: true },
    { id: "f", action: "shop_gift", target_user_id: U(2), params: { itemId: "x" }, selected: true },
    { id: "g", action: "timeout", target_user_id: U(2), params: {}, selected: false },
  ], { targets, scopes, sections: ["moderation", "casino"], actorId: ADMIN.id, isOwner: false, policy: { owner_approval_permanent: true, exclude_premium: true } });
  const v = Object.fromEntries(ev.items.map((r) => [r.id, `${r.verdict}:${r.code}`]));
  assert.equal(v.a, "ok:null");
  assert.equal(v.b, "skip:already_banned");
  assert.equal(v.c, "skip:premium");
  assert.equal(v.d, "skip:protected");
  assert.equal(v.e, "block:owner_approval");
  assert.equal(v.f, "block:scope_off");
  assert.equal(v.g, "unselected:null");
  assert.deepEqual(ev.summary, { apply: 1, warn: 0, skip: 3, block: 2, total: 6 });
  // Per-plan limit and the daily DesCoin limit.
  const lim = model.evaluateItems([1, 2, 3].map((k) => ({ id: `m${k}`, action: "kick", target_user_id: U(2), params: {}, selected: true })),
    { targets, scopes: { ...scopes, moderation: { on: true, limit: 2, limitKind: "perPlan" } }, sections: ["moderation"], actorId: ADMIN.id, policy: {} });
  assert.deepEqual(lim.items.map((r) => r.code), [null, null, "limit_plan"]);
  const wal = model.evaluateItems([{ id: "w", action: "descoin_grant", target_user_id: U(2), params: { amount: 600 }, selected: true }],
    { targets, scopes: { ...scopes, wallet: { on: true, limit: 1000, limitKind: "perDay" } }, sections: ["casino"], actorId: ADMIN.id, policy: {}, walletUsedToday: 500 });
  assert.equal(wal.items[0].code, "limit_day");

  // Step-up freshness and the schedule (Europe/Istanbul, UTC+3).
  const now = Date.parse("2026-11-15T06:00:00Z"); // 09:00 Istanbul
  assert.equal(model.stepUpFresh({ stepUp: true, iat: now / 1000 - 30 }, now), true);
  assert.equal(model.stepUpFresh({ stepUp: true, iat: now / 1000 - 600 }, now), false);
  assert.equal(model.nextRunAt({ every: "daily", atMinute: 9 * 60 + 30 }, now), "2026-11-15T06:30:00.000Z");
  assert.equal(model.nextRunAt({ every: "daily", atMinute: 8 * 60 }, now), "2026-11-16T05:00:00.000Z");
  assert.equal(model.nextRunAt({ every: "hourly", atMinute: 15 }, now), "2026-11-15T06:15:00.000Z");
  assert.equal(new Date(model.nextRunAt({ every: "weekly", atMinute: 600, weekday: 1 }, now)).getUTCDay(), 1);
  assert.throws(() => model.normalizeTask({ title: "", prompt: "x" }), (e) => e.code === "BAD_TASK");

  /* ===== service, end to end ===== */
  const db = fakeDb({ agent_scopes: [{ id: 1, scopes: {}, require_2fa_each: true, owner_approval_permanent: true, exclude_premium: true }] });
  planStore.__setDbForTests(db);
  const fx = installFakes();
  const sleeps = [];
  plans.__setForTests({ clock: { now: () => Date.now(), sleep: async (ms) => { sleeps.push(ms); } }, perms: perms(["overview", "agent", "moderation", "people"]) });
  const audits = [];
  const realAppend = state.appendAudit;
  state.appendAudit = (actorId, actorUsername, action, target, meta) => { audits.push({ actorId, action, target, meta }); return {}; };

  const v1 = await plans.createFromProposal({
    admin: ADMIN,
    threadId: null,
    toolUseId: "tu1",
    input: {
      title: "Şüpheli hesaplar",
      suggestions: ["Sadece riski 80 üstü"],
      items: [
        { action: "ban", userId: U(2), params: { category: "spam", presetId: "30d" }, risk: 94 },
        { action: "ban", userId: U(3), params: { category: "spam", presetId: "30d" }, risk: 91 },
        { action: "ban", userId: U(4), params: { category: "spam", presetId: "30d" }, risk: 82 },
        { action: "ban", userId: U(5), params: { category: "spam", presetId: "30d" }, risk: 70 },
        { action: "ban", userId: U(6), params: { category: "spam", presetId: "30d" }, risk: 60 },
        { action: "ban", userId: U(7), params: { category: "spam", presetId: "30d" }, risk: 52 },
      ],
    },
  });
  assert.equal(v1.plan.version, 1);
  assert.equal(v1.excluded, 2, "the Descall+ member and the admin are excluded automatically");
  const excl = v1.items.filter((i) => i.status === "excluded").map((i) => [i.target_username, i.excluded_reason]);
  assert.deepEqual(excl, [["selinsu", "premium"], ["mod_ali", "protected"]]);
  assert.equal(v1.plan.dry_run.summary.apply, 3);
  assert.equal(v1.plan.dry_run.summary.skip, 1, "ayse.k_2011 is already banned");
  assert.equal(fx.executed.length, 0, "proposing never executes anything");

  // The model revises it: v2 with a diff; v1 is superseded.
  const v2 = await plans.createFromProposal({
    admin: ADMIN,
    input: {
      title: "Şüpheli hesaplar",
      revisesPlanId: v1.plan.id,
      items: [
        { action: "ban", userId: U(2), params: { category: "spam", presetId: "30d" }, risk: 94 },
        { action: "ban", userId: U(3), params: { category: "spam", presetId: "30d" }, risk: 91 },
        { action: "ban", userId: U(4), params: { category: "spam", presetId: "30d" }, risk: 82 },
        { action: "timeout", userId: U(7), params: { category: "spam", presetId: "24h" }, risk: 52 },
      ],
    },
  });
  assert.equal(v2.plan.code, v1.plan.code);
  assert.equal(v2.plan.version, 2);
  assert.deepEqual(v2.plan.diff.removed.map((x) => x.username).sort(), ["mod_ali", "selinsu"]);
  assert.equal(v2.plan.diff.changed[0].username, "tuana.pxl");
  assert.equal((await planStore.getPlan(v1.plan.id)).status, "superseded");
  await assert.rejects(plans.approve(v1.plan.id, ADMIN), (e) => e.code === "PLAN_LOCKED", "an old version cannot be approved");

  // Admin edit from the bulk BanDialog: v3, only the ban group's params change.
  const banIds = v2.items.filter((i) => i.action === "ban").map((i) => i.id);
  const v3 = await plans.editItems(v2.plan.id, ADMIN, { itemIds: banIds, params: { category: "spam", presetId: "7d", message: "Toplu reklam" } });
  assert.equal(v3.version, 3);
  assert.equal(v3.source, "admin_edit");
  assert.equal(v3.diff.changed.length, 3);
  const v3Items = await planStore.getItems(v3.id);
  assert.ok(v3Items.filter((i) => i.action === "ban").every((i) => i.params.presetId === "7d" && i.params.message === "Toplu reklam"));
  await assert.rejects(plans.editItems(v3.id, ADMIN, { itemIds: [v3Items[0].id], action: "announcement" }), (e) => e.code === "BAD_PARAMS" || e.code === "BAD_EDIT");

  // Unselect one row: it never runs.
  const kaz = v3Items.find((i) => i.target_username === "descoin.farm07");
  await plans.setSelection(v3.id, ADMIN, { itemIds: [kaz.id], selected: false });

  // Approve: one fail pauses the run, resume continues, skips continue.
  fx.failOn.add(U(7));
  await plans.approve(v3.id, ADMIN, { mode: "apply" });
  assert.ok(audits.some((a) => a.action === "agent_plan_approve" && a.meta.planId === v3.id), "approval is audited with the plan id");
  await plans.runners.get(v3.id);
  let view = await plans.view(v3.id);
  assert.equal(view.plan.status, "paused", "a real error stops the run and waits for the admin");
  const byName = Object.fromEntries(view.items.map((i) => [i.username, i.status]));
  assert.equal(byName["kazanc_botu41"], "done");
  assert.equal(byName["ayse.k_2011"], "skipped");
  assert.equal(byName["descoin.farm07"], "proposed", "unselected rows are left alone");
  assert.equal(byName["tuana.pxl"], "failed");
  assert.equal(sleeps.length >= 1, true, "one action per second");
  assert.deepEqual(fx.executed, [["ban", "kazanc_botu41"]]);

  // Undo inside the window (only done + undoable items).
  const undoOut = await plans.undo(v3.id, ADMIN, {});
  assert.deepEqual(undoOut, { undone: 1, failed: 0 });
  assert.deepEqual(fx.undone, ["kazanc_botu41"]);
  assert.ok(audits.some((a) => a.action === "agent_plan_undo"));
  await assert.rejects(plans.undo(v3.id, ADMIN, {}), (e) => e.code === "NOTHING_TO_UNDO");

  // Cancel the paused plan.
  await plans.cancel(v3.id, ADMIN);
  assert.equal((await planStore.getPlan(v3.id)).status, "cancelled");

  // Scope switched off between approval and run: the item is skipped at run time, not executed.
  const p2 = await plans.createFromProposal({ admin: ADMIN, input: { title: "Sustur", items: [{ action: "timeout", userId: U(3), params: { presetId: "1h" } }] } });
  await plans.approve(p2.plan.id, ADMIN, { mode: "apply" });
  // (runner already started; turn moderation off before it reaches the item is racy, so test recheck directly)
  await plans.runners.get(p2.plan.id);
  assert.equal((await plans.view(p2.plan.id)).items[0].status, "done");
  const p3 = await plans.createFromProposal({ admin: ADMIN, input: { title: "Sustur", items: [{ action: "timeout", userId: U(2), params: { presetId: "1h" } }] } });
  const p3plan = await planStore.getPlan(p3.plan.id);
  await planStore.updatePlan(p3plan.id, { status: "running", approved_by: ADMIN.id, approved_by_username: ADMIN.username, undo_until: new Date(Date.now() + 60000).toISOString() });
  await planStore.updateItemsWhere(p3plan.id, {}, { status: "queued" });
  db.tables.agent_scopes[0].scopes = { moderation: { on: false } };
  await plans.runPlan(p3plan.id);
  const p3view = await plans.view(p3plan.id);
  assert.equal(p3view.items[0].status, "skipped");
  assert.equal(p3view.items[0].result.code, "scope_off");
  assert.equal(p3view.plan.status, "done");
  db.tables.agent_scopes[0].scopes = {};

  // Approval needs the section; a permanent ban needs the owner.
  const p4 = await plans.createFromProposal({ admin: ADMIN, input: { title: "Kalıcı", items: [{ action: "ban", userId: U(7), params: { presetId: "permanent" } }] } });
  await assert.rejects(plans.approve(p4.plan.id, ADMIN), (e) => e.code === "NOTHING_TO_RUN");
  assert.equal(p4.plan.dry_run.items[0].code, "owner_approval");

  // Scheduled approval: runs only when the tick finds it due.
  const p5 = await plans.createFromProposal({ admin: ADMIN, input: { title: "Zamanlı", items: [{ action: "kick", userId: U(2), params: {} }] } });
  await assert.rejects(plans.approve(p5.plan.id, ADMIN, { scheduleAt: new Date(Date.now() + 1000).toISOString() }), (e) => e.code === "BAD_SCHEDULE");
  await plans.approve(p5.plan.id, ADMIN, { scheduleAt: new Date(Date.now() + 5 * 60000).toISOString() });
  assert.equal((await planStore.getPlan(p5.plan.id)).status, "scheduled");
  await plans.tick();
  assert.equal((await planStore.getPlan(p5.plan.id)).status, "scheduled", "not due yet");
  await planStore.updatePlan(p5.plan.id, { scheduled_for: new Date(Date.now() - 1000).toISOString() });
  await plans.tick();
  await plans.runners.get(p5.plan.id);
  assert.equal((await planStore.getPlan(p5.plan.id)).status, "done");

  /* ===== scheduled task runner ===== */
  const task = await planStore.createTask({ admin_id: ADMIN.id, admin_username: "demir", session_id: "sess-1", title: "Şüpheli tarama", prompt: "Şüpheli hesapları bul", every: "daily", at_minute: 540, enabled: true, next_run_at: new Date(Date.now() - 1000).toISOString() });
  const seen = [];
  scheduler.__setForTests({
    runChat: async (p) => {
      seen.push(p);
      p.onEvent({ type: "thread", threadId: "t-1" });
      p.onEvent({ type: "plan", planId: "p-1" });
    },
  });
  const sessionGuard = require("../lib/sessionGuard");
  const realAllowed = sessionGuard.sessionAllowed;
  sessionGuard.sessionAllowed = async (d) => ({ ok: d.sid === "sess-1" });
  const r = await scheduler.runTask(await planStore.getTask(task.id));
  assert.equal(r.status, "plan");
  assert.equal(seen[0].mode, "dry", "a scheduled run can only propose");
  assert.equal(seen[0].source, "task");
  assert.match(seen[0].authHeader, /^Bearer /);
  const after = await planStore.getTask(task.id);
  assert.equal(after.last_plan_id, "p-1");
  assert.equal(after.run_count, 1);
  assert.ok(Date.parse(after.next_run_at) > Date.now());
  // Signed out: the task stops instead of running without a session.
  await planStore.updateTask(task.id, { session_id: "gone", next_run_at: new Date(Date.now() - 1000).toISOString() });
  const r2 = await scheduler.runTask(await planStore.getTask(task.id));
  assert.equal(r2.status, "session_ended");
  assert.equal((await planStore.getTask(task.id)).enabled, false);
  assert.equal(seen.length, 1);
  sessionGuard.sessionAllowed = realAllowed;

  /* ===== routes: approval needs a code entered just now ===== */
  {
    const express = require("express");
    const { signStepUpToken } = require("../config/jwt");
    const jwt = require("jsonwebtoken");
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => { req.user = { id: ADMIN.id, username: "admin", sid: "s1" }; req.adminTotpKnown = true; next(); });
    app.use(require("../routes/adminAgentPlans"));
    const server = await new Promise((r) => { const s = app.listen(0, "127.0.0.1", () => r(s)); });
    const base = `http://127.0.0.1:${server.address().port}`;
    const call = (path, { method = "GET", body, headers = {} } = {}) =>
      fetch(base + path, { method, headers: { "content-type": "application/json", ...headers }, body: body ? JSON.stringify(body) : undefined }).then(async (r) => ({ status: r.status, json: await r.json() }));
    const pr = await plans.createFromProposal({ admin: ADMIN, input: { title: "Rota", items: [{ action: "kick", userId: U(3), params: {} }] } });
    const view = await call(`/agent/plans/${pr.plan.id}`);
    assert.equal(view.status, 200);
    assert.equal(view.json.items[0].verdict.verdict, "ok");
    const noCode = await call(`/agent/plans/${pr.plan.id}/approve`, { method: "POST", body: {} });
    assert.equal(noCode.status, 403);
    assert.equal(noCode.json.code, "STEP_UP_REQUIRED");
    const stale = jwt.sign({ sub: ADMIN.id, sid: "s1", stepUp: true, iat: Math.floor(Date.now() / 1000) - 600 }, process.env.JWT_SECRET, { algorithm: "HS256", expiresIn: "15m" });
    const old = await call(`/agent/plans/${pr.plan.id}/approve`, { method: "POST", body: {}, headers: { "x-admin-step-up": stale } });
    assert.equal(old.json.code, "STEP_UP_REQUIRED", "a 10-minute-old code is not enough to approve");
    const otherSession = signStepUpToken({ id: ADMIN.id, sid: "other" });
    assert.equal((await call(`/agent/plans/${pr.plan.id}/approve`, { method: "POST", body: {}, headers: { "x-admin-step-up": otherSession } })).json.code, "STEP_UP_REQUIRED");
    const ok = await call(`/agent/plans/${pr.plan.id}/approve`, { method: "POST", body: { mode: "apply" }, headers: { "x-admin-step-up": signStepUpToken({ id: ADMIN.id, sid: "s1" }) } });
    assert.equal(ok.status, 200);
    assert.ok(["running", "done"].includes(ok.json.plan.status));
    await plans.runners.get(pr.plan.id);
    assert.equal((await call(`/agent/plans/${pr.plan.id}/approve`, { method: "POST", body: {}, headers: { "x-admin-step-up": signStepUpToken({ id: ADMIN.id, sid: "s1" }) } })).status, 409);
    // Scopes: the owner saves; a bad limit is refused.
    const sc = await call("/agent/scopes", { method: "PUT", body: { scopes: { shop: { on: true, limit: 5 } } } });
    assert.equal(sc.status, 200);
    assert.equal(sc.json.scopes.shop.on, true);
    assert.equal(sc.json.onCount, 5);
    assert.equal((await call("/agent/scopes", { method: "PUT", body: { scopes: { shop: { limit: -1 } } } })).json.code, "BAD_LIMIT");
    db.tables.agent_scopes[0].scopes = {};
    // Saved prompts and tasks.
    const pc = await call("/agent/prompts", { method: "POST", body: { title: "Tarama", prompt: "Şüpheli hesapları bul" } });
    assert.equal(pc.status, 201);
    assert.equal((await call("/agent/prompts")).json.prompts.length, 1);
    const tc = await call("/agent/tasks", { method: "POST", body: { title: "Gece", prompt: "Tara", every: "daily", atMinute: 180 } });
    assert.equal(tc.status, 201);
    assert.equal(tc.json.task.every, "daily");
    assert.ok(Date.parse(tc.json.task.nextRunAt) > Date.now());
    assert.equal(db.tables.agent_scheduled_tasks.find((x) => x.id === tc.json.task.id).session_id, "s1", "a task is bound to the creating session");
    server.close();
  }

  /* ===== action handlers call the panel's own internal functions ===== */
  const calls = [];
  const hAudits = [];
  actions.__setDepsForTests({
    banExperience: {
      async banTarget(id) { return { found: id !== "missing", protected: id === U(6), row: { username: "kazanc_botu41" } }; },
      async performBan(p) { calls.push(["performBan", p.targetUserId, p.presetId, p.revokeSessions, p.alsoAccessBan]); return { category: "spam", reason: "Spam", expiresAt: "2026-12-15T00:00:00Z", sessionsRevoked: 2, emailed: true, accessBan: { added: 1 } }; },
      banOptionsFrom: require("../lib/banExperience").banOptionsFrom,
    },
    moderation: {
      isBanned: (id) => id === U(4),
      isTimedOut: () => false,
      async revokeBan(p) { calls.push(["revokeBan", p.targetUserId]); },
    },
    descoin: { async setWalletFrozen(id, f) { calls.push(["freeze", id, f]); return { frozen: f }; } },
    adminSockets: { notifyAdminRoom() {} },
    audit: (actor, action, target, meta) => hAudits.push({ actor: actor.id, action, target, meta }),
  });
  const hctx = { actor: ADMIN, io: null, plan: { id: "plan-1", code: 412, version: 2 } };
  const ban = (id) => ({ id: "item-1", action: "ban", target_user_id: id, params: { category: "spam", presetId: "30d", revokeSessions: true, notifyEmail: true, alsoAccessBan: true } });
  assert.equal((await actions.HANDLERS.ban(ban(U(6)), hctx)).result.code, "protected", "an admin is never banned, even if the plan says so");
  assert.equal((await actions.HANDLERS.ban(ban(U(4)), hctx)).result.code, "already_banned");
  const banned = await actions.HANDLERS.ban(ban(U(2)), hctx);
  assert.equal(banned.status, "done");
  assert.deepEqual(calls.at(-1), ["performBan", U(2), "30d", true, true]);
  assert.equal(hAudits[0].action, "ban");
  assert.deepEqual([hAudits[0].actor, hAudits[0].meta.via, hAudits[0].meta.planId, hAudits[0].meta.planCode], [ADMIN.id, "agent", "plan-1", 412]);
  await actionsUndo({ ...ban(U(2)), status: "done", undo: banned.undo }, hctx);
  assert.deepEqual(calls.at(-1), ["revokeBan", U(2)]);
  assert.equal(hAudits.at(-1).action, "unban");
  assert.equal(hAudits.at(-1).meta.undo, true);
  const fr = await actions.HANDLERS.wallet_freeze({ id: "i2", action: "wallet_freeze", target_user_id: U(3), params: { reason: "Kazanç istismarı" } }, hctx);
  assert.deepEqual(fr.undo, { kind: "wallet_unfreeze" });
  assert.equal(hAudits.at(-1).action, "wallet_freeze");
  actions.__setDepsForTests(null);

  // Tables not applied yet: reads are empty, writes say TABLES_MISSING.
  planStore.__setDbForTests({ from: () => { const e = { data: null, error: { code: "PGRST205", message: "Could not find the table" } }; const api = new Proxy({}, { get: (_, k) => (k === "then" ? (res) => res(e) : () => api) }); return api; } });
  assert.deepEqual(await planStore.listPlans({}), []);
  assert.equal((await planStore.getScopes()).missing, true);
  await assert.rejects(planStore.createPrompt(ADMIN.id, { title: "a", prompt: "b" }), (e) => e.code === "TABLES_MISSING");

  state.appendAudit = realAppend;
  console.log("adminAgentPlans.unit.test: ok");
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
