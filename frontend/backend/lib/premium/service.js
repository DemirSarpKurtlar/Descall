"use strict";

/**
 * Descall+ / Ultra server side (docs/premium/CONTRACT.md). Thin layer over the SQL functions in
 * supabase/migrations/20261106_premium_memberships.sql: input parsing, error -> HTTP status
 * mapping, campaign and plan validation, the events / audit readers and the 5-minute scheduler.
 * Every membership write happens inside one SQL function call (one transaction).
 */

const { featuresFor, isFeatureKey } = require("./features");

let dbOverride = null;
const db = () => dbOverride || require("../../db/supabase");

class PremiumError extends Error {
  constructor(code, status = 400, cause = null) {
    super(code);
    this.code = code;
    this.status = status;
    this.cause = cause;
  }
}

const ERROR_STATUS = {
  invalid_op: 400,
  invalid_plan: 400,
  invalid_duration: 400,
  invalid_end: 400,
  reason_required: 400,
  too_long: 400,
  invalid_request_id: 400,
  invalid_body: 400,
  no_users: 400,
  too_many_users: 400,
  user_not_found: 404,
  not_found: 404,
  plan_archived: 409,
  already_active: 409,
  not_active: 409,
  already_unlimited: 409,
  not_unlimited: 409,
  same_plan: 409,
  // redeem
  invalid: 404,
  expired: 410,
  used: 409,
  limit: 409,
  not_redeemable: 409,
  unavailable: 409,
  code_taken: 409,
};

const MISSING_FN = new Set(["PGRST202", "42883", "42P01", "PGRST205"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const OPS = ["grant", "extend", "change_plan", "cancel", "set_end", "set_unlimited"];
const PLAN_ID = /^[a-z][a-z0-9_]{1,31}$/;
const REQUEST_ID = /^[A-Za-z0-9:_.-]{8,100}$/;
const EVENT_KINDS = ["grant", "extend", "change_plan", "cancel", "set_end", "set_unlimited", "expire", "coin_grant", "campaign_redeem", "trial"];

function isMissing(error) {
  return Boolean(error && (MISSING_FN.has(error.code) || /does not exist|Could not find the function/i.test(error.message || "")));
}

async function rpc(name, args) {
  const { data, error } = await db().rpc(name, args);
  if (error) {
    if (isMissing(error)) throw new PremiumError("premium_unavailable", 503, error);
    throw new PremiumError("server_error", 500, error);
  }
  return data;
}

/** Throws the function's own error code with its HTTP status when ok === false. */
function unwrap(result) {
  if (result && result.ok === false) {
    throw new PremiumError(result.error || "server_error", ERROR_STATUS[result.error] || 400);
  }
  return result;
}

/* ---------------- input parsing ---------------- */

function cleanText(value, max) {
  if (value === undefined || value === null) return null;
  const s = String(value).trim();
  if (!s) return null;
  if (s.length > max) throw new PremiumError("too_long", 400);
  return s;
}

function parseIso(value) {
  if (value === undefined || value === null || value === "") return null;
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) throw new PremiumError("invalid_end", 400);
  return d.toISOString();
}

function parseDays(value) {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 3650) throw new PremiumError("invalid_duration", 400);
  return n;
}

function parseBool(value) {
  if (value === undefined || value === null || value === "") return null;
  if (value === true || value === "true" || value === 1 || value === "1") return true;
  if (value === false || value === "false" || value === 0 || value === "0") return false;
  throw new PremiumError("invalid_body", 400);
}

function parseRequestId(value, { required = false } = {}) {
  if (value === undefined || value === null || value === "") {
    if (required) throw new PremiumError("invalid_request_id", 400);
    return null;
  }
  const s = String(value);
  if (!REQUEST_ID.test(s)) throw new PremiumError("invalid_request_id", 400);
  return s;
}

/** Body of POST /users/:id/apply and POST /bulk (without user ids). */
function parseApplyBody(body) {
  const b = body && typeof body === "object" ? body : {};
  const op = String(b.op || "");
  if (!OPS.includes(op)) throw new PremiumError("invalid_op", 400);
  const plan = b.plan === undefined || b.plan === null || b.plan === "" ? null : String(b.plan);
  if (plan !== null && !PLAN_ID.test(plan)) throw new PremiumError("invalid_plan", 400);
  const reason = cleanText(b.reason, 500);
  if (!reason) throw new PremiumError("reason_required", 400);
  return {
    op,
    plan,
    days: parseDays(b.days),
    ends_at: parseIso(b.ends_at),
    unlimited: parseBool(b.unlimited),
    is_free: parseBool(b.is_free),
    reason,
    note: cleanText(b.note, 2000),
    request_id: parseRequestId(b.request_id),
  };
}

function applyArgs(actorId, userId, p, batchId = null) {
  return {
    p_actor: actorId,
    p_user: userId,
    p_op: p.op,
    p_plan: p.plan,
    p_days: p.days,
    p_ends_at: p.ends_at,
    p_unlimited: p.unlimited,
    p_is_free: p.is_free,
    p_reason: p.reason,
    p_note: p.note,
    p_request_id: p.request_id,
    p_batch: batchId,
  };
}

/* ---------------- memberships ---------------- */

async function apply(actorId, userId, body) {
  if (!UUID.test(String(userId || ""))) throw new PremiumError("user_not_found", 404);
  const p = parseApplyBody(body);
  return unwrap(await rpc("premium_admin_apply", applyArgs(actorId, userId, p)));
}

const BULK_MAX = 500;

async function bulk(actorId, body) {
  const b = body && typeof body === "object" ? body : {};
  if (!Array.isArray(b.user_ids) || b.user_ids.length === 0) throw new PremiumError("no_users", 400);
  if (b.user_ids.length > BULK_MAX) throw new PremiumError("too_many_users", 400);
  const ids = [...new Set(b.user_ids.map((x) => String(x)))];
  const valid = ids.filter((x) => UUID.test(x));
  const p = parseApplyBody(b);
  const requestId = parseRequestId(b.request_id, { required: true });
  let result = { ok: true, batch: null, results: [] };
  if (valid.length) {
    result = unwrap(await rpc("premium_admin_bulk", {
      p_actor: actorId,
      p_user_ids: valid,
      p_op: p.op,
      p_plan: p.plan,
      p_days: p.days,
      p_ends_at: p.ends_at,
      p_unlimited: p.unlimited,
      p_is_free: p.is_free,
      p_reason: p.reason,
      p_note: p.note,
      p_request_id: requestId,
    }));
  }
  // Ids that are not even UUIDs never reach the database; they are reported per user as well.
  const bad = ids.filter((x) => !UUID.test(x)).map((x) => ({ user_id: x, ok: false, error: "user_not_found" }));
  const batch = result.batch
    ? { ...result.batch, total: result.batch.total + bad.length, failed: result.batch.failed + bad.length }
    : { id: null, total: bad.length, ok: 0, failed: bad.length, created_at: new Date().toISOString() };
  return { batch, results: [...(result.results || []), ...bad], replay: Boolean(result.replay) };
}

async function bulkGet(batchId) {
  if (!UUID.test(String(batchId || ""))) throw new PremiumError("not_found", 404);
  return unwrap(await rpc("premium_bulk_get", { p_batch: batchId }));
}

async function me(userId) {
  return rpc("premium_me", { p_user: userId });
}

async function redeem(userId, code) {
  const raw = String(code || "").trim();
  if (!raw || raw.length > 64) throw new PremiumError("invalid", 404);
  return unwrap(await rpc("premium_campaign_redeem", { p_user: userId, p_code: raw }));
}

async function userSearch(q, limit = 20) {
  const query = String(q || "").trim().slice(0, 120);
  if (!query) return [];
  const rows = await rpc("premium_admin_user_search", { p_q: query, p_limit: Math.max(1, Math.min(50, Number(limit) || 20)) });
  // Whitelist: only the masked e-mail ever leaves the server.
  return (Array.isArray(rows) ? rows : []).map((u) => ({
    id: u.id,
    username: u.username ?? null,
    display_name: u.display_name ?? null,
    avatar_url: u.avatar_url ?? null,
    email_masked: u.email_masked ?? null,
    subscription: u.subscription ?? null,
  }));
}

async function userDetail(userId) {
  if (!UUID.test(String(userId || ""))) throw new PremiumError("user_not_found", 404);
  const data = await rpc("premium_admin_user", { p_user: userId, p_limit: 200 });
  if (!data) throw new PremiumError("user_not_found", 404);
  return data;
}

/* ---------------- plans ---------------- */

async function listPlans({ visibleOnly = false } = {}) {
  let q = db().from("premium_plans").select("id, name, description, features, status, visible, monthly_descoin, price_minor, currency, sort, created_at, updated_at");
  if (visibleOnly) q = q.eq("visible", true).eq("status", "active");
  const { data, error } = await q.order("sort", { ascending: true });
  if (error) throw new PremiumError(isMissing(error) ? "premium_unavailable" : "server_error", isMissing(error) ? 503 : 500, error);
  return data || [];
}

/** Only name, description, features, visible and status can change; prices stay null in phase 1. */
function parsePlanPatch(body) {
  const b = body && typeof body === "object" ? body : {};
  const patch = {};
  if (b.name !== undefined) {
    const name = cleanText(b.name, 60);
    if (!name) throw new PremiumError("invalid_body", 400);
    patch.name = name;
  }
  if (b.description !== undefined) patch.description = cleanText(b.description, 500);
  if (b.features !== undefined) {
    if (!Array.isArray(b.features) || b.features.length > 200) throw new PremiumError("invalid_body", 400);
    const keys = [...new Set(b.features.map((x) => String(x)))];
    if (!keys.every(isFeatureKey)) throw new PremiumError("unknown_feature", 400);
    patch.features = keys;
  }
  if (b.visible !== undefined) patch.visible = parseBool(b.visible);
  if (b.status !== undefined) {
    if (!["active", "archived"].includes(String(b.status))) throw new PremiumError("invalid_body", 400);
    patch.status = String(b.status);
  }
  for (const k of ["price_minor", "currency", "monthly_descoin", "id"]) {
    if (b[k] !== undefined) throw new PremiumError("field_not_editable", 400);
  }
  if (!Object.keys(patch).length) throw new PremiumError("invalid_body", 400);
  patch.updated_at = new Date().toISOString();
  return patch;
}

async function patchPlan(planId, body) {
  if (!PLAN_ID.test(String(planId || ""))) throw new PremiumError("not_found", 404);
  const patch = parsePlanPatch(body);
  const { data, error } = await db().from("premium_plans").update(patch).eq("id", planId).select("*").maybeSingle();
  if (error) throw new PremiumError("server_error", 500, error);
  if (!data) throw new PremiumError("not_found", 404);
  return data;
}

/** Visible plans for users: no prices in phase 1, features from the shared key list. */
function publicPlan(row) {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? null,
    features: featuresFor(row.id).length ? featuresFor(row.id) : Array.isArray(row.features) ? row.features : [],
    monthly_descoin: row.monthly_descoin,
    sort: row.sort,
  };
}

/* ---------------- campaigns ---------------- */

const CAMPAIGN_COLS = "id, code, name, kind, plan_id, duration_days, percent_off, amount_off_minor, currency, starts_at, ends_at, total_limit, per_user_limit, allowed_user_ids, used_count, active, note, created_by, created_at, updated_at";

function normalizeCode(raw) {
  return String(raw || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function intOrNull(value, min, max) {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) throw new PremiumError("invalid_body", 400);
  return n;
}

function parseCampaign(body, { partial = false } = {}) {
  const b = body && typeof body === "object" ? body : {};
  const row = {};
  const has = (k) => b[k] !== undefined;
  if (!partial || has("code")) {
    const code = normalizeCode(b.code);
    if (!/^[A-Z0-9]{4,32}$/.test(code)) throw new PremiumError("invalid_code", 400);
    row.code = code;
  }
  if (!partial || has("kind")) {
    const kind = String(b.kind || "free_membership");
    if (!["free_membership", "percent", "fixed"].includes(kind)) throw new PremiumError("invalid_body", 400);
    row.kind = kind;
  }
  if (has("name")) row.name = cleanText(b.name, 80);
  if (has("note")) row.note = cleanText(b.note, 500);
  if (has("plan_id") || has("plan")) {
    const plan = b.plan_id ?? b.plan;
    if (plan !== null && plan !== "" && !PLAN_ID.test(String(plan))) throw new PremiumError("invalid_plan", 400);
    row.plan_id = plan ? String(plan) : null;
  }
  if (has("duration_days")) row.duration_days = intOrNull(b.duration_days, 1, 3650);
  if (has("percent_off")) row.percent_off = intOrNull(b.percent_off, 1, 100);
  if (has("amount_off_minor")) row.amount_off_minor = intOrNull(b.amount_off_minor, 1, 100000000);
  if (has("currency")) {
    const c = b.currency ? String(b.currency).toUpperCase() : null;
    if (c && !/^[A-Z]{3}$/.test(c)) throw new PremiumError("invalid_body", 400);
    row.currency = c;
  }
  if (has("starts_at")) row.starts_at = parseIso(b.starts_at) || new Date().toISOString();
  if (has("ends_at")) row.ends_at = parseIso(b.ends_at);
  if (has("total_limit")) row.total_limit = intOrNull(b.total_limit, 1, 10000000);
  if (has("per_user_limit")) row.per_user_limit = intOrNull(b.per_user_limit, 1, 100) ?? 1;
  if (has("allowed_user_ids")) {
    if (b.allowed_user_ids === null) row.allowed_user_ids = null;
    else {
      if (!Array.isArray(b.allowed_user_ids) || b.allowed_user_ids.length > 5000) throw new PremiumError("invalid_body", 400);
      const ids = [...new Set(b.allowed_user_ids.map(String))];
      if (!ids.every((x) => UUID.test(x))) throw new PremiumError("invalid_body", 400);
      row.allowed_user_ids = ids.length ? ids : null;
    }
  }
  if (has("active")) row.active = parseBool(b.active);
  if (!partial) {
    if (row.kind === "free_membership" && (!row.plan_id || !row.duration_days)) throw new PremiumError("invalid_body", 400);
    if (row.kind === "percent" && !row.percent_off) throw new PremiumError("invalid_body", 400);
    if (row.kind === "fixed" && (!row.amount_off_minor || !row.currency)) throw new PremiumError("invalid_body", 400);
  }
  if (row.starts_at && row.ends_at && new Date(row.ends_at) <= new Date(row.starts_at)) throw new PremiumError("invalid_end", 400);
  if (partial && !Object.keys(row).length) throw new PremiumError("invalid_body", 400);
  return row;
}

function dbWriteError(error) {
  if (error?.code === "23505") return new PremiumError("code_taken", 409, error);
  if (error?.code === "23514" || error?.code === "23503") return new PremiumError("invalid_body", 400, error);
  if (isMissing(error)) return new PremiumError("premium_unavailable", 503, error);
  return new PremiumError("server_error", 500, error);
}

async function listCampaigns() {
  const { data, error } = await db().from("premium_campaigns").select(CAMPAIGN_COLS).order("created_at", { ascending: false }).limit(500);
  if (error) throw dbWriteError(error);
  return data || [];
}

async function createCampaign(actorId, body) {
  const row = { ...parseCampaign(body), created_by: actorId };
  const { data, error } = await db().from("premium_campaigns").insert(row).select(CAMPAIGN_COLS).maybeSingle();
  if (error) throw dbWriteError(error);
  return data;
}

async function updateCampaign(id, body) {
  if (!UUID.test(String(id || ""))) throw new PremiumError("not_found", 404);
  const row = { ...parseCampaign(body, { partial: true }), updated_at: new Date().toISOString() };
  const { data, error } = await db().from("premium_campaigns").update(row).eq("id", id).select(CAMPAIGN_COLS).maybeSingle();
  if (error) throw dbWriteError(error);
  if (!data) throw new PremiumError("not_found", 404);
  return data;
}

async function campaignStats(id) {
  if (!UUID.test(String(id || ""))) throw new PremiumError("not_found", 404);
  const data = await rpc("premium_campaign_stats", { p_campaign: id });
  if (!data) throw new PremiumError("not_found", 404);
  return data;
}

/* ---------------- dashboards ---------------- */

async function dashboard() {
  return rpc("premium_admin_dashboard", {});
}

const DAY_MS = 24 * 60 * 60 * 1000;

function parseRange(query, { defaultDays = 30 } = {}) {
  const q = query || {};
  const to = q.to ? new Date(String(q.to)) : new Date();
  const from = q.from ? new Date(String(q.from)) : new Date(to.getTime() - defaultDays * DAY_MS);
  if (Number.isNaN(to.getTime()) || Number.isNaN(from.getTime()) || from >= to) throw new PremiumError("invalid_range", 400);
  return { from: from.toISOString(), to: to.toISOString() };
}

async function analytics(query) {
  const { from, to } = parseRange(query);
  const bucket = ["day", "week", "month"].includes(String(query?.bucket)) ? String(query.bucket) : "day";
  return rpc("premium_admin_analytics", { p_from: from, p_to: to, p_bucket: bucket });
}

/** No payment provider yet: nothing here is revenue, and nothing is invented. */
async function finance() {
  const dash = await dashboard().catch(() => null);
  return {
    payments_integrated: false,
    revenue: null,
    mrr: null,
    arr: null,
    refunds: null,
    transactions: null,
    currency: null,
    paid_count: null,
    free_count: dash ? dash.free_count : null,
    active_total: dash ? dash.active_total : null,
    // The client shows "Odeme altyapisi henuz entegre edilmedi" from its catalogs under this key.
    message_key: "premium.finance.notIntegrated",
  };
}

/* ---------------- events + audit ---------------- */

function encodeCursor(row) {
  return Buffer.from(`${row.created_at}|${row.id}`).toString("base64url");
}

function decodeCursor(raw) {
  if (!raw) return null;
  try {
    const [at, id] = Buffer.from(String(raw), "base64url").toString("utf8").split("|");
    if (Number.isNaN(new Date(at).getTime()) || !UUID.test(id || "")) return null;
    return { at, id };
  } catch {
    return null;
  }
}

async function listEvents(query) {
  const q = query || {};
  const limit = Math.max(1, Math.min(200, Number(q.limit) || 50));
  let sel = db().from("subscription_events").select("*");
  if (q.user) {
    if (!UUID.test(String(q.user))) throw new PremiumError("invalid_body", 400);
    sel = sel.eq("user_id", String(q.user));
  }
  if (q.kind) {
    if (!EVENT_KINDS.includes(String(q.kind))) throw new PremiumError("invalid_body", 400);
    sel = sel.eq("kind", String(q.kind));
  }
  if (q.plan) {
    if (!PLAN_ID.test(String(q.plan))) throw new PremiumError("invalid_plan", 400);
    sel = sel.or(`new_plan.eq.${q.plan},prev_plan.eq.${q.plan}`);
  }
  if (q.actor) {
    if (!UUID.test(String(q.actor))) throw new PremiumError("invalid_body", 400);
    sel = sel.eq("actor_id", String(q.actor));
  }
  if (q.batch) {
    if (!UUID.test(String(q.batch))) throw new PremiumError("invalid_body", 400);
    sel = sel.eq("batch_id", String(q.batch));
  }
  if (q.from) sel = sel.gte("created_at", parseIso(q.from));
  if (q.to) sel = sel.lte("created_at", parseIso(q.to));
  const cursor = decodeCursor(q.cursor);
  if (cursor) sel = sel.lt("created_at", cursor.at);
  const { data, error } = await sel.order("created_at", { ascending: false }).limit(limit + 1);
  if (error) throw dbWriteError(error);
  const rows = data || [];
  const page = rows.slice(0, limit);
  return { events: page, next_cursor: rows.length > limit && page.length ? encodeCursor(page[page.length - 1]) : null };
}

/** Premium admin actions from the durable admin audit log (actions named premium_*). */
async function listAudit(query, memoryEntries = []) {
  const q = query || {};
  const limit = Math.max(1, Math.min(500, Number(q.limit) || 100));
  const search = String(q.q || "").trim().slice(0, 80).replace(/[%_\\,()"]/g, "");
  const from = q.from ? parseIso(q.from) : null;
  const to = q.to ? parseIso(q.to) : null;
  const actor = q.actor ? String(q.actor) : null;
  if (actor && !UUID.test(actor)) throw new PremiumError("invalid_body", 400);
  let rows = null;
  try {
    let sel = db().from("admin_audit").select("id, at, actor_id, actor_username, action, target, meta").like("action", "premium%");
    if (actor) sel = sel.eq("actor_id", actor);
    if (from) sel = sel.gte("at", from);
    if (to) sel = sel.lte("at", to);
    if (search) sel = sel.or(`action.ilike.%${search}%,target.ilike.%${search}%,actor_username.ilike.%${search}%`);
    const res = await sel.order("at", { ascending: false }).limit(limit);
    if (!res.error) {
      rows = (res.data || []).map((r) => ({ id: r.id, at: r.at, actorId: r.actor_id, actorUsername: r.actor_username, action: r.action, target: r.target, meta: r.meta || {} }));
    }
  } catch {
    rows = null;
  }
  const memory = (memoryEntries || []).filter((e) => String(e.action || "").startsWith("premium")
    && (!actor || e.actorId === actor)
    && (!from || e.at >= from) && (!to || e.at <= to)
    && (!search || [e.action, e.target, e.actorUsername].some((v) => String(v || "").toLowerCase().includes(search.toLowerCase()))));
  const seen = new Set();
  const merged = [...(rows || []), ...memory].filter((e) => (seen.has(e.id) ? false : (seen.add(e.id), true)));
  merged.sort((a, b) => String(b.at).localeCompare(String(a.at)));
  return { entries: merged.slice(0, limit), durable: rows !== null };
}

/* ---------------- scheduler ---------------- */

const SCHEDULE_MS = 5 * 60 * 1000;
let timer = null;

/**
 * One tick: premium_run_scheduled() takes a transaction advisory lock, so with several backend
 * instances only one does the work; the others get { skipped: true }. Affected users get
 * premium:updated so their clients refetch.
 */
async function runScheduledOnce({ io = null, notify = null } = {}) {
  const result = await rpc("premium_run_scheduled", {});
  if (result && !result.skipped) {
    const ids = new Set([...(result.expire?.user_ids || []), ...(result.coin_user_ids || [])].map(String));
    for (const id of ids) {
      if (notify) notify(id);
      else if (io) require("../../socket/premium").emitPremiumUpdated(io, id, { reason: "scheduled" });
    }
  }
  return result;
}

function startPremiumScheduler({ io = null, intervalMs = SCHEDULE_MS } = {}) {
  if (timer || process.env.PREMIUM_SCHEDULER === "off" || process.env.NODE_ENV === "test") return null;
  let warned = false;
  const tick = () =>
    runScheduledOnce({ io }).catch((err) => {
      if (err?.code === "premium_unavailable") {
        if (!warned) console.warn("[premium] scheduler: functions missing; apply supabase/migrations/20261106_premium_memberships.sql");
        warned = true;
        return;
      }
      console.warn("[premium] scheduler tick failed:", err?.code || err?.message || "error");
    });
  const first = setTimeout(tick, 30 * 1000);
  timer = setInterval(tick, intervalMs);
  first.unref?.();
  timer.unref?.();
  return timer;
}

function stopPremiumScheduler() {
  if (timer) clearInterval(timer);
  timer = null;
}

function __setDbForTests(client) {
  dbOverride = client;
}

module.exports = {
  PremiumError,
  ERROR_STATUS,
  OPS,
  BULK_MAX,
  SCHEDULE_MS,
  rpc,
  unwrap,
  parseApplyBody,
  parsePlanPatch,
  parseCampaign,
  normalizeCode,
  parseRange,
  apply,
  bulk,
  bulkGet,
  me,
  redeem,
  userSearch,
  userDetail,
  listPlans,
  patchPlan,
  publicPlan,
  listCampaigns,
  createCampaign,
  updateCampaign,
  campaignStats,
  dashboard,
  analytics,
  finance,
  listEvents,
  listAudit,
  encodeCursor,
  decodeCursor,
  runScheduledOnce,
  startPremiumScheduler,
  stopPremiumScheduler,
  __setDbForTests,
};
