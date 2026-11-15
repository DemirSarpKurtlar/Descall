"use strict";

/**
 * Admin agent, phase 2: persistence for plans, plan items, saved prompts, scheduled tasks
 * and the owner's scope settings (supabase/migrations/20261115_agent_plans.sql).
 * Until that migration is applied every read answers empty and every write throws
 * TABLES_MISSING, so the panel hides the plan features instead of crashing.
 */

const { normalizeScopes, PlanError } = require("./planModel");

let dbOverride = null;
const db = () => dbOverride || require("../../db/supabase");

function isMissing(error) {
  const s = `${error?.code || ""} ${error?.message || ""}`;
  return /42P01|PGRST205|PGRST204|42703|does not exist|schema cache|Could not find the table/i.test(s);
}
function check(error) {
  if (!error) return;
  if (isMissing(error)) throw new PlanError("TABLES_MISSING", "The agent plan tables are not set up yet.");
  throw error;
}

const PLAN_COLS =
  "id, code, version, parent_id, thread_id, tool_use_id, admin_id, source, task_id, title, summary, suggestions, diff, status, dry_run, dry_run_at, approved_by, approved_by_username, approved_at, approve_mode, scheduled_for, started_at, finished_at, undo_until, lease_until, created_at, updated_at";
const ITEM_COLS =
  "id, plan_id, seq, action, target_user_id, target_username, target_meta, params, risk, cluster, evidence, selected, excluded_reason, status, result, error, undo, executed_at, undone_at, undone_by, created_at";

/* ---------------- scopes ---------------- */

const DEFAULT_POLICY = { require_2fa_each: true, owner_approval_permanent: true, exclude_premium: true };

async function getScopes() {
  const { data, error } = await db()
    .from("agent_scopes")
    .select("scopes, require_2fa_each, owner_approval_permanent, exclude_premium, updated_at, updated_by")
    .eq("id", 1)
    .maybeSingle();
  if (error || !data) return { scopes: normalizeScopes({}), ...DEFAULT_POLICY, missing: Boolean(error && isMissing(error)) };
  return {
    scopes: normalizeScopes(data.scopes),
    require_2fa_each: data.require_2fa_each !== false,
    owner_approval_permanent: data.owner_approval_permanent !== false,
    exclude_premium: data.exclude_premium !== false,
    updated_at: data.updated_at,
    updated_by: data.updated_by,
  };
}

async function saveScopes(row, actorId) {
  const { error } = await db()
    .from("agent_scopes")
    .upsert({ id: 1, ...row, updated_at: new Date().toISOString(), updated_by: actorId || null }, { onConflict: "id" });
  check(error);
  return getScopes();
}

/* ---------------- plans ---------------- */

async function createPlan(plan, items) {
  const { data, error } = await db().from("agent_plans").insert(plan).select(PLAN_COLS).single();
  check(error);
  const rows = items.map((it, i) => ({ ...it, plan_id: data.id, seq: i + 1 }));
  if (rows.length) {
    const res = await db().from("agent_plan_items").insert(rows).select(ITEM_COLS);
    if (res.error) {
      await db().from("agent_plans").delete().eq("id", data.id);
      check(res.error);
    }
  }
  return data;
}

async function getPlan(id) {
  const { data, error } = await db().from("agent_plans").select(PLAN_COLS).eq("id", id).maybeSingle();
  check(error);
  return data || null;
}

async function getItems(planId) {
  const { data, error } = await db().from("agent_plan_items").select(ITEM_COLS).eq("plan_id", planId).order("seq", { ascending: true });
  check(error);
  return data || [];
}

async function listPlans({ threadId, statuses, limit = 50, code } = {}) {
  let q = db().from("agent_plans").select(PLAN_COLS);
  if (threadId) q = q.eq("thread_id", threadId);
  if (code) q = q.eq("code", code);
  if (statuses?.length) q = q.in("status", statuses);
  const { data, error } = await q.order("created_at", { ascending: false }).limit(limit);
  if (error) {
    if (isMissing(error)) return [];
    throw error;
  }
  return data || [];
}

/** Items of many plans at once (history counts). */
async function itemsForPlans(planIds) {
  if (!planIds.length) return [];
  const { data, error } = await db().from("agent_plan_items").select("id, plan_id, action, status, target_user_id, target_username, selected, excluded_reason").in("plan_id", planIds);
  if (error) {
    if (isMissing(error)) return [];
    throw error;
  }
  return data || [];
}

/** Update a plan; with `expect` only when its status is one of those. Returns the row or null. */
async function updatePlan(id, patch, { expect } = {}) {
  let q = db().from("agent_plans").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);
  if (expect?.length) q = q.in("status", expect);
  const { data, error } = await q.select(PLAN_COLS);
  check(error);
  return Array.isArray(data) ? data[0] || null : data || null;
}

async function updateItem(id, patch) {
  const { error } = await db().from("agent_plan_items").update(patch).eq("id", id);
  check(error);
}

async function updateItemsWhere(planId, { ids, statuses }, patch) {
  let q = db().from("agent_plan_items").update(patch).eq("plan_id", planId);
  if (ids) q = q.in("id", ids);
  if (statuses) q = q.in("status", statuses);
  const { error } = await q;
  check(error);
}

/** Take the runner lease on a plan (one runner at a time, survives restarts). */
async function claimLease(planId, ms) {
  const now = new Date();
  const until = new Date(now.getTime() + ms).toISOString();
  const { data, error } = await db()
    .from("agent_plans")
    .update({ lease_until: until })
    .eq("id", planId)
    .or(`lease_until.is.null,lease_until.lt.${now.toISOString()}`)
    .select("id");
  if (error) return false;
  return Array.isArray(data) ? data.length > 0 : Boolean(data);
}

async function renewLease(planId, ms) {
  await db().from("agent_plans").update({ lease_until: new Date(Date.now() + ms).toISOString() }).eq("id", planId);
}

/** DesCoin granted by the agent since UTC midnight (the Cüzdan daily limit). */
async function walletUsedToday(now = new Date()) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
  const { data, error } = await db()
    .from("agent_plan_items")
    .select("params, status")
    .eq("action", "descoin_grant")
    .gte("executed_at", start)
    .limit(5000);
  if (error) return 0;
  return (data || []).filter((r) => r.status === "done").reduce((s, r) => s + Math.max(0, Number(r.params?.amount) || 0), 0);
}

/* ---------------- saved prompts ---------------- */

async function listPrompts(adminId) {
  const { data, error } = await db()
    .from("agent_saved_prompts")
    .select("id, admin_id, title, prompt, shared, use_count, last_used_at, created_at, updated_at")
    .or(`admin_id.eq.${adminId},shared.eq.true`)
    .order("updated_at", { ascending: false })
    .limit(100);
  if (error) {
    if (isMissing(error)) return [];
    throw error;
  }
  return data || [];
}

async function createPrompt(adminId, { title, prompt, shared }) {
  const { data, error } = await db()
    .from("agent_saved_prompts")
    .insert({ admin_id: adminId, title, prompt, shared: Boolean(shared) })
    .select("id, admin_id, title, prompt, shared, use_count, last_used_at, created_at, updated_at")
    .single();
  check(error);
  return data;
}

async function getPrompt(id) {
  const { data, error } = await db().from("agent_saved_prompts").select("id, admin_id, title, prompt, shared, use_count").eq("id", id).maybeSingle();
  check(error);
  return data || null;
}

async function deletePrompt(id) {
  const { error } = await db().from("agent_saved_prompts").delete().eq("id", id);
  check(error);
}

async function touchPrompt(id, useCount) {
  await db().from("agent_saved_prompts").update({ use_count: useCount + 1, last_used_at: new Date().toISOString() }).eq("id", id);
}

/* ---------------- scheduled tasks ---------------- */

const TASK_COLS =
  "id, admin_id, admin_username, session_id, title, prompt, every, at_minute, weekday, enabled, next_run_at, last_run_at, last_status, last_error, last_plan_id, last_thread_id, run_count, lease_until, created_at, updated_at";

async function listTasks() {
  const { data, error } = await db().from("agent_scheduled_tasks").select(TASK_COLS).order("created_at", { ascending: false }).limit(100);
  if (error) {
    if (isMissing(error)) return [];
    throw error;
  }
  return data || [];
}

async function getTask(id) {
  const { data, error } = await db().from("agent_scheduled_tasks").select(TASK_COLS).eq("id", id).maybeSingle();
  check(error);
  return data || null;
}

async function createTask(row) {
  const { data, error } = await db().from("agent_scheduled_tasks").insert(row).select(TASK_COLS).single();
  check(error);
  return data;
}

async function updateTask(id, patch) {
  const { data, error } = await db()
    .from("agent_scheduled_tasks")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select(TASK_COLS);
  check(error);
  return Array.isArray(data) ? data[0] || null : data || null;
}

async function deleteTask(id) {
  const { error } = await db().from("agent_scheduled_tasks").delete().eq("id", id);
  check(error);
}

async function dueTasks(now = new Date()) {
  const { data, error } = await db()
    .from("agent_scheduled_tasks")
    .select(TASK_COLS)
    .eq("enabled", true)
    .lte("next_run_at", now.toISOString())
    .limit(10);
  if (error) return [];
  return data || [];
}

async function claimTask(id, ms) {
  const now = new Date();
  const { data, error } = await db()
    .from("agent_scheduled_tasks")
    .update({ lease_until: new Date(now.getTime() + ms).toISOString() })
    .eq("id", id)
    .or(`lease_until.is.null,lease_until.lt.${now.toISOString()}`)
    .select("id");
  if (error) return false;
  return Array.isArray(data) ? data.length > 0 : Boolean(data);
}

function __setDbForTests(client) {
  dbOverride = client;
}

module.exports = {
  isMissing,
  getScopes,
  saveScopes,
  createPlan,
  getPlan,
  getItems,
  listPlans,
  itemsForPlans,
  updatePlan,
  updateItem,
  updateItemsWhere,
  claimLease,
  renewLease,
  walletUsedToday,
  listPrompts,
  createPrompt,
  getPrompt,
  deletePrompt,
  touchPrompt,
  listTasks,
  getTask,
  createTask,
  updateTask,
  deleteTask,
  dueTasks,
  claimTask,
  __setDbForTests,
};
