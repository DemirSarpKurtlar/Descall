"use strict";

/**
 * Admin agent, phase 2: the plan service.
 *
 *   model -> propose_plan (createFromProposal)       status "proposed", nothing changes
 *   admin -> selection / edit (new version) / dry run
 *   admin -> approve with a fresh 2FA code             status "running" (or "scheduled")
 *   runner -> one item per second, each re-checked     items "done" / "skipped" / "failed"
 *   admin -> pause / resume / cancel / undo (30 min)
 *
 * Execution only happens here, after approval; actions.js does the work with the panel's
 * own internal functions.
 */

const crypto = require("crypto");
const model = require("./planModel");
const store = require("./planStore");
const actions = require("./actions");
const state = require("../../runtime/sharedState");

const { ACTIONS, PlanError } = model;
const LEASE_MS = 30 * 1000;

let ioRef = null;
function setIo(io) {
  if (io) ioRef = io;
}
const getIo = () => ioRef;

let clock = { now: () => Date.now(), sleep: (ms) => new Promise((r) => setTimeout(r, ms)) };
let permsOverride = null;
function perms() {
  return permsOverride || require("../adminPermissions");
}

function audit(actor, action, target, meta) {
  try {
    state.appendAudit(actor.id, actor.username, action, target, meta);
  } catch {
    /* audit is best effort */
  }
}

function notify(payload) {
  try {
    const io = getIo();
    if (io) require("../../socket/adminHandlers").notifyAdminRoom(io, { type: "agent_plan", ...payload });
  } catch {
    /* best effort */
  }
}

/** The approving / asking admin's sections and owner flag, read fresh. */
async function adminAccess(admin) {
  const p = perms();
  p.invalidate?.(admin.id);
  const row = await p.loadRow(admin.id);
  return { sections: p.sectionsFor(admin, row), isOwner: p.isOwner(admin, row), isAdmin: Boolean(row?.is_admin) || admin.username === "admin" || Boolean(row?.is_super_admin) };
}

function targetMeta(t) {
  if (!t || !t.exists) return { exists: false };
  return {
    exists: true,
    username: t.username,
    displayName: t.displayName,
    avatarUrl: t.avatarUrl,
    createdAt: t.createdAt,
    emailVerified: t.emailVerified,
    isAdmin: t.isAdmin,
    isOwner: t.isOwner,
    premium: t.premium,
  };
}

/* ---------------- dry run ---------------- */

async function dryRun(plan, items, admin, { save = true } = {}) {
  const [targets, scopes, access, walletUsed] = await Promise.all([
    actions.loadTargets(items.map((i) => i.target_user_id).filter(Boolean)),
    store.getScopes(),
    adminAccess(admin),
    store.walletUsedToday(new Date(clock.now())),
  ]);
  const evalItems = items.map((i) => (i.status === "excluded" ? { ...i, selected: false } : i));
  const res = model.evaluateItems(evalItems, {
    targets,
    scopes: scopes.scopes,
    sections: access.sections,
    actorId: admin.id,
    isOwner: access.isOwner,
    policy: scopes,
    walletUsedToday: walletUsed,
  });
  const dry = { at: new Date(clock.now()).toISOString(), by: admin.id, version: plan.version, summary: res.summary, items: res.items };
  if (save) await store.updatePlan(plan.id, { dry_run: dry, dry_run_at: dry.at });
  return { dry, targets, scopes, access };
}

/* ---------------- create ---------------- */

/**
 * The model's propose_plan input -> a stored plan (v1, or the next version of revisesPlanId).
 * Targets are resolved; admins / the owner / Descall+ members (for punitive actions), the
 * asking admin and unknown ids are auto-excluded with a reason.
 */
async function createFromProposal({ input, admin, threadId = null, toolUseId = null, source = "chat", taskId = null }) {
  const proposal = model.normalizeProposal(input);
  let parent = null;
  if (proposal.revisesPlanId) {
    parent = await store.getPlan(proposal.revisesPlanId);
    if (!parent || (threadId && parent.thread_id && parent.thread_id !== threadId)) throw new PlanError("NO_PLAN", "revisesPlanId is not a plan of this conversation.");
    if (!model.OPEN_STATUSES.has(parent.status)) throw new PlanError("PLAN_LOCKED", `Plan #${parent.code} v${parent.version} is ${parent.status}; propose a new plan instead.`);
  }
  const targets = await actions.loadTargets(proposal.items.map((i) => i.target_user_id).filter(Boolean));
  const scopes = await store.getScopes();
  const prevItems = parent ? await store.getItems(parent.id) : [];
  const prevSel = new Map(prevItems.map((i) => [model.itemKey(i), i.selected]));
  const items = proposal.items.map((it) => {
    const t = it.target_user_id ? targets.get(it.target_user_id) : null;
    const excl = model.autoExclusion(it, t, { actorId: admin.id, excludePremium: scopes.exclude_premium });
    const keySel = prevSel.get(model.itemKey(it));
    return {
      ...it,
      target_username: t?.username || null,
      target_meta: t ? targetMeta(t) : {},
      selected: excl ? false : keySel === undefined ? true : keySel,
      excluded_reason: excl,
      status: excl ? "excluded" : "proposed",
    };
  });
  const row = {
    version: parent ? parent.version + 1 : 1,
    parent_id: parent?.id || null,
    thread_id: threadId,
    tool_use_id: toolUseId,
    admin_id: admin.id,
    source,
    task_id: taskId,
    title: proposal.title,
    summary: proposal.summary,
    suggestions: proposal.suggestions,
    diff: parent ? model.diffPlans(prevItems, items) : null,
    status: "proposed",
  };
  if (parent) row.code = parent.code;
  const plan = await store.createPlan(row, items);
  if (parent) await store.updatePlan(parent.id, { status: "superseded" }, { expect: ["proposed"] });
  const stored = await store.getItems(plan.id);
  const { dry } = await dryRun(plan, stored, admin);
  notify({ planId: plan.id, status: "proposed" });
  return { plan: { ...plan, dry_run: dry }, items: stored, rejected: proposal.rejected, excluded: items.filter((i) => i.excluded_reason).length };
}

/** Admin edit: new version with new params (and optionally a new action) for some items. */
async function editItems(planId, admin, { itemIds, action, params }) {
  const plan = await store.getPlan(planId);
  if (!plan) throw new PlanError("NO_PLAN", "Plan not found.");
  if (!model.OPEN_STATUSES.has(plan.status)) throw new PlanError("PLAN_LOCKED", "This plan can no longer be edited.");
  const items = await store.getItems(plan.id);
  const ids = new Set((itemIds || []).map(String));
  if (!ids.size) throw new PlanError("BAD_EDIT", "Pick at least one item.");
  if (action && !ACTIONS[action]) throw new PlanError("BAD_EDIT", "Unknown action.");
  const next = items.map((i) => {
    const base = {
      action: i.action, target_user_id: i.target_user_id, target_username: i.target_username, target_meta: i.target_meta,
      params: i.params, risk: i.risk, cluster: i.cluster, evidence: i.evidence, selected: i.selected,
      excluded_reason: i.excluded_reason, status: i.status,
    };
    if (!ids.has(String(i.id)) || i.status === "excluded") return base;
    const nextAction = action || i.action;
    if (ACTIONS[nextAction].target === "user" && !i.target_user_id) throw new PlanError("BAD_EDIT", "That action needs a user.");
    return { ...base, action: nextAction, params: model.normalizeParams(nextAction, params ?? i.params) };
  });
  const row = {
    code: plan.code, version: plan.version + 1, parent_id: plan.id, thread_id: plan.thread_id, admin_id: plan.admin_id,
    source: "admin_edit", task_id: plan.task_id, title: plan.title, summary: plan.summary, suggestions: plan.suggestions,
    diff: model.diffPlans(items, next), status: "proposed",
  };
  const created = await store.createPlan(row, next);
  await store.updatePlan(plan.id, { status: "superseded" }, { expect: ["proposed"] });
  const stored = await store.getItems(created.id);
  await dryRun(created, stored, admin);
  audit(admin, "agent_plan_edit", created.id, { planCode: plan.code, from: plan.version, to: created.version, items: ids.size, action: action || null });
  return created;
}

async function setSelection(planId, admin, { itemIds, selected }) {
  const plan = await store.getPlan(planId);
  if (!plan) throw new PlanError("NO_PLAN", "Plan not found.");
  if (!model.OPEN_STATUSES.has(plan.status)) throw new PlanError("PLAN_LOCKED", "This plan can no longer be edited.");
  const ids = (itemIds || []).map(String).filter(model.isUuid);
  if (!ids.length) throw new PlanError("BAD_EDIT", "Pick at least one item.");
  await store.updateItemsWhere(plan.id, { ids, statuses: ["proposed"] }, { selected: Boolean(selected) });
  const items = await store.getItems(plan.id);
  await dryRun(plan, items, admin);
}

async function discard(planId, admin) {
  const plan = await store.updatePlan(planId, { status: "discarded" }, { expect: ["proposed"] });
  if (!plan) throw new PlanError("PLAN_LOCKED", "Only a proposed plan can be discarded.");
  audit(admin, "agent_plan_discard", plan.id, { planCode: plan.code, version: plan.version });
  return plan;
}

/* ---------------- approve and run ---------------- */

/**
 * Approve a proposed plan. The route has already checked the fresh 2FA step-up.
 * @param {{mode?: "dry"|"apply", scheduleAt?: string}} opts
 */
async function approve(planId, admin, { mode = "apply", scheduleAt = null } = {}) {
  const plan = await store.getPlan(planId);
  if (!plan) throw new PlanError("NO_PLAN", "Plan not found.");
  if (!model.OPEN_STATUSES.has(plan.status)) throw new PlanError("PLAN_LOCKED", "This plan is not waiting for approval.");
  if (mode === "dry" && !plan.dry_run_at) throw new PlanError("DRY_RUN_REQUIRED", "Run the dry run first.");
  const items = await store.getItems(plan.id);
  const { dry } = await dryRun(plan, items, admin);
  const verdicts = new Map(dry.items.map((v) => [String(v.id), v]));
  const runnable = items.filter((i) => i.selected && i.status === "proposed" && ["ok", "warn"].includes(verdicts.get(String(i.id))?.verdict));
  if (!runnable.length) throw new PlanError("NOTHING_TO_RUN", "No selected item can run.");
  let when = null;
  if (scheduleAt) {
    when = Date.parse(scheduleAt);
    if (!Number.isFinite(when) || when < clock.now() + 60 * 1000 || when > clock.now() + 14 * 86400000) {
      throw new PlanError("BAD_SCHEDULE", "Pick a time between 1 minute and 14 days from now.");
    }
  }
  const nowIso = new Date(clock.now()).toISOString();
  const patch = {
    status: when ? "scheduled" : "running",
    approved_by: admin.id,
    approved_by_username: admin.username || null,
    approved_at: nowIso,
    approve_mode: mode,
    scheduled_for: when ? new Date(when).toISOString() : null,
    started_at: when ? null : nowIso,
    undo_until: when ? null : new Date(clock.now() + model.UNDO_WINDOW_MS).toISOString(),
  };
  const updated = await store.updatePlan(plan.id, patch, { expect: ["proposed"] });
  if (!updated) throw new PlanError("PLAN_LOCKED", "This plan is not waiting for approval.");
  const runIds = runnable.map((i) => i.id);
  await store.updateItemsWhere(plan.id, { ids: runIds }, { status: "queued" });
  for (const i of items) {
    if (i.status !== "proposed" || !i.selected || runIds.includes(i.id)) continue;
    const v = verdicts.get(String(i.id));
    await store.updateItem(i.id, { status: "skipped", result: { code: v?.code || "blocked", phase: "approval" } });
  }
  audit(admin, "agent_plan_approve", plan.id, {
    planId: plan.id, planCode: plan.code, version: plan.version, items: runIds.length, mode,
    scheduledFor: patch.scheduled_for, threadId: plan.thread_id,
  });
  notify({ planId: plan.id, status: patch.status });
  if (!when) startRunner(plan.id);
  return updated;
}

const runners = new Map();

function startRunner(planId) {
  if (runners.has(planId)) return runners.get(planId);
  const p = runPlan(planId)
    .catch((err) => console.error("[admin-agent] plan runner failed:", err?.message || err))
    .finally(() => runners.delete(planId));
  runners.set(planId, p);
  return p;
}

/** Re-check one queued item right before it runs. Returns a skip code or null. */
async function recheck(item, approver, scopes, access) {
  const def = ACTIONS[item.action];
  if (!def) return "unknown_action";
  if (!access.isAdmin) return "approver_not_admin";
  if (!scopes.scopes[def.scope]?.on) return "scope_off";
  if (!access.sections.includes(def.section)) return "no_section";
  if (model.isPermanentBan(item) && scopes.owner_approval_permanent && !access.isOwner) return "owner_approval";
  if (item.target_user_id) {
    const t = (await actions.loadTargets([item.target_user_id])).get(String(item.target_user_id));
    const excl = model.autoExclusion(item, t, { actorId: approver.id, excludePremium: scopes.exclude_premium });
    if (excl) return excl;
  }
  if (item.action === "descoin_grant" && Number(item.params?.amount) > 0) {
    const used = await store.walletUsedToday(new Date(clock.now()));
    if (used + Number(item.params.amount) > (scopes.scopes.wallet.limit || 0)) return "limit_day";
  }
  return null;
}

async function runPlan(planId) {
  if (!(await store.claimLease(planId, LEASE_MS))) return;
  let failures = 0;
  for (;;) {
    const plan = await store.getPlan(planId);
    if (!plan) return;
    if (plan.status !== "running") {
      await store.updatePlan(planId, { lease_until: null });
      return;
    }
    await store.renewLease(planId, LEASE_MS);
    const items = await store.getItems(planId);
    const next = items.find((i) => i.status === "queued");
    if (!next) {
      const counts = model.queueCounts(items);
      const status = counts.done === 0 && counts.failed > 0 ? "failed" : "done";
      const finishedAt = new Date(clock.now()).toISOString();
      await store.updatePlan(planId, { status, finished_at: finishedAt, lease_until: null }, { expect: ["running"] });
      const approver = { id: plan.approved_by, username: plan.approved_by_username };
      audit(approver, "agent_plan_run", plan.id, {
        planId: plan.id, planCode: plan.code, version: plan.version, status,
        done: counts.done, skipped: counts.skipped, failed: counts.failed,
        items: items.filter((i) => i.status !== "proposed" && i.status !== "excluded").map((i) => ({ id: i.id, action: i.action, target: i.target_user_id, status: i.status })),
      });
      notify({ planId, status });
      return;
    }
    const approver = { id: plan.approved_by, username: plan.approved_by_username || "admin" };
    const ctx = { actor: approver, io: getIo(), plan };
    await store.updateItem(next.id, { status: "running" });
    notify({ planId, itemId: next.id, status: "running" });
    try {
      const [scopes, access] = await Promise.all([store.getScopes(), adminAccess(approver)]);
      const code = await recheck(next, approver, scopes, access);
      if (code) {
        await store.updateItem(next.id, { status: "skipped", result: { code, phase: "run" }, executed_at: new Date(clock.now()).toISOString() });
      } else {
        const out = await actions.execute(next, ctx);
        await store.updateItem(next.id, {
          status: out.status,
          result: out.result || {},
          undo: out.undo || null,
          executed_at: new Date(clock.now()).toISOString(),
        });
      }
    } catch (err) {
      failures += 1;
      await store.updateItem(next.id, {
        status: "failed",
        error: String(err?.message || err || "failed").slice(0, 300),
        result: { code: err?.code || "failed" },
        executed_at: new Date(clock.now()).toISOString(),
      });
      // A real error stops the run; the admin decides whether to resume or cancel.
      await store.updatePlan(planId, { status: "paused", lease_until: null }, { expect: ["running"] });
      notify({ planId, status: "paused", itemId: next.id });
      return;
    }
    notify({ planId, itemId: next.id });
    await clock.sleep(model.STEP_INTERVAL_MS);
  }
}

async function pause(planId, admin) {
  const plan = await store.updatePlan(planId, { status: "paused" }, { expect: ["running"] });
  if (!plan) throw new PlanError("PLAN_LOCKED", "Only a running plan can be paused.");
  audit(admin, "agent_plan_pause", plan.id, { planCode: plan.code, version: plan.version });
  notify({ planId, status: "paused" });
  return plan;
}

async function resume(planId, admin) {
  const plan = await store.getPlan(planId);
  if (!plan || plan.status !== "paused") throw new PlanError("PLAN_LOCKED", "Only a paused plan can be resumed.");
  if (String(plan.approved_by) !== String(admin.id)) {
    const access = await adminAccess(admin);
    if (!access.isOwner) throw new PlanError("NOT_APPROVER", "Only the admin who approved this plan (or the owner) can resume it.");
  }
  const updated = await store.updatePlan(planId, { status: "running", lease_until: null }, { expect: ["paused"] });
  if (!updated) throw new PlanError("PLAN_LOCKED", "Only a paused plan can be resumed.");
  audit(admin, "agent_plan_resume", plan.id, { planCode: plan.code, version: plan.version });
  notify({ planId, status: "running" });
  startRunner(planId);
  return updated;
}

async function cancel(planId, admin) {
  const plan = await store.updatePlan(planId, { status: "cancelled", finished_at: new Date(clock.now()).toISOString(), lease_until: null }, { expect: ["running", "paused", "scheduled"] });
  if (!plan) throw new PlanError("PLAN_LOCKED", "This plan is not running.");
  await store.updateItemsWhere(planId, { statuses: ["queued"] }, { status: "cancelled" });
  audit(admin, "agent_plan_cancel", plan.id, { planCode: plan.code, version: plan.version });
  notify({ planId, status: "cancelled" });
  return plan;
}

/** Undo executed items (all undoable ones when itemIds is empty) inside the window. */
async function undo(planId, admin, { itemIds } = {}) {
  const plan = await store.getPlan(planId);
  if (!plan) throw new PlanError("NO_PLAN", "Plan not found.");
  const items = await store.getItems(planId);
  const want = itemIds?.length ? new Set(itemIds.map(String)) : null;
  const picked = items.filter((i) => (!want || want.has(String(i.id))) && model.canUndoItem(plan, i, clock.now()));
  if (!picked.length) throw new PlanError("NOTHING_TO_UNDO", "Nothing here can be undone any more.");
  const access = await adminAccess(admin);
  const ctx = { actor: { id: admin.id, username: admin.username }, io: getIo(), plan };
  const out = { undone: 0, failed: 0 };
  for (const item of picked) {
    if (!access.sections.includes(ACTIONS[item.action].section)) {
      out.failed += 1;
      await store.updateItem(item.id, { error: "no_section" });
      continue;
    }
    try {
      const r = await actions.undo(item, ctx);
      await store.updateItem(item.id, { status: "undone", undone_at: new Date(clock.now()).toISOString(), undone_by: admin.id, result: { ...(item.result || {}), undo: r.result || {}, undoneBy: admin.username || null } });
      out.undone += 1;
    } catch (err) {
      out.failed += 1;
      await store.updateItem(item.id, { status: "undo_failed", error: String(err?.message || "undo failed").slice(0, 300) });
    }
  }
  audit(admin, "agent_plan_undo", plan.id, { planId: plan.id, planCode: plan.code, version: plan.version, ...out, itemIds: picked.map((i) => i.id) });
  notify({ planId, status: plan.status, undo: out });
  return out;
}

/* ---------------- views ---------------- */

function publicPlan(plan, items = null) {
  const counts = items ? model.queueCounts(items) : null;
  return {
    id: plan.id,
    code: plan.code,
    version: plan.version,
    parentId: plan.parent_id,
    threadId: plan.thread_id,
    toolUseId: plan.tool_use_id,
    adminId: plan.admin_id,
    source: plan.source,
    taskId: plan.task_id,
    title: plan.title,
    summary: plan.summary,
    suggestions: Array.isArray(plan.suggestions) ? plan.suggestions : [],
    diff: plan.diff || null,
    status: plan.status,
    dryRun: plan.dry_run || null,
    approvedBy: plan.approved_by,
    approvedByUsername: plan.approved_by_username,
    approvedAt: plan.approved_at,
    approveMode: plan.approve_mode,
    scheduledFor: plan.scheduled_for,
    startedAt: plan.started_at,
    finishedAt: plan.finished_at,
    undoUntil: plan.undo_until,
    createdAt: plan.created_at,
    counts,
  };
}

function publicItem(item, plan, verdict, now = clock.now()) {
  return {
    id: item.id,
    seq: item.seq,
    action: item.action,
    userId: item.target_user_id,
    username: item.target_username,
    target: item.target_meta || {},
    params: item.params || {},
    risk: item.risk,
    cluster: item.cluster,
    evidence: item.evidence || {},
    selected: item.selected,
    excludedReason: item.excluded_reason,
    status: item.status,
    result: item.result || null,
    error: item.error || null,
    executedAt: item.executed_at,
    undoneAt: item.undone_at,
    canUndo: model.canUndoItem(plan, item, now),
    undoable: Boolean(ACTIONS[item.action]?.undoable),
    verdict: verdict ? { verdict: verdict.verdict, code: verdict.code } : null,
  };
}

async function view(planId) {
  const plan = await store.getPlan(planId);
  if (!plan) return null;
  const items = await store.getItems(plan.id);
  const verdicts = new Map((plan.dry_run?.items || []).map((v) => [String(v.id), v]));
  const versions = await store.listPlans({ code: plan.code, limit: 20 });
  return {
    plan: publicPlan(plan, items),
    items: items.map((i) => publicItem(i, plan, verdicts.get(String(i.id)))),
    versions: versions.map((v) => ({ id: v.id, version: v.version, status: v.status, createdAt: v.created_at, source: v.source })).sort((a, b) => a.version - b.version),
  };
}

/** Resume plans whose runner died with the process; start scheduled plans that are due. */
async function tick() {
  const live = await store.listPlans({ statuses: ["running", "scheduled"], limit: 20 });
  const now = clock.now();
  for (const plan of live) {
    if (plan.status === "running") {
      const leaseLeft = plan.lease_until ? Date.parse(plan.lease_until) - now : -1;
      if (leaseLeft < 0 && !runners.has(plan.id)) startRunner(plan.id);
    } else if (plan.status === "scheduled" && plan.scheduled_for && Date.parse(plan.scheduled_for) <= now) {
      const started = await store.updatePlan(plan.id, {
        status: "running",
        started_at: new Date(now).toISOString(),
        undo_until: new Date(now + model.UNDO_WINDOW_MS).toISOString(),
      }, { expect: ["scheduled"] });
      if (started) {
        notify({ planId: plan.id, status: "running" });
        startRunner(plan.id);
      }
    }
  }
}

function __setForTests({ clock: c, perms: p } = {}) {
  if (c) clock = c;
  if (p !== undefined) permsOverride = p;
}

module.exports = {
  setIo,
  getIo,
  dryRun,
  createFromProposal,
  editItems,
  setSelection,
  discard,
  approve,
  startRunner,
  runPlan,
  pause,
  resume,
  cancel,
  undo,
  view,
  publicPlan,
  publicItem,
  tick,
  runners,
  newId: () => crypto.randomUUID(),
  __setForTests,
};
