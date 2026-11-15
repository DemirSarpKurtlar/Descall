"use strict";

/**
 * Moderasyon İşlem masası (admin remake, owner-approved Draft A, Nov 2026).
 * Data behind routes/adminModerationDesk.js: page summary, user candidates,
 * templates, escalation rules, active sanctions (extend / early lift / note),
 * filtered and paged history, the İşaretli mesajlar queue (decide, context) and
 * appeals by user. Bans themselves go through BanDialog → POST /users/:id/ban.
 * Every table here is optional until 20261115_moderation_desk.sql is applied:
 * reads come back empty with ready: false, writes answer 503.
 */

const supabase = require("../db/supabase");
const state = require("../runtime/sharedState");
const moderation = require("./moderation");
const model = require("./moderationDeskModel");
const contentFilter = require("./contentFilter");
const core = require("./contentFilterCore");

const isMissingTable = contentFilter.isMissingTable;
const DAY = 86400000;
const CATEGORY_IDS = new Set(moderation.MOD_CATEGORIES.map((c) => c.id));

function httpError(status, message, code) {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  return err;
}

function isUuid(v) {
  return typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

async function soft(promise, fallback = { data: [], error: null }) {
  try {
    const res = await promise;
    return res || fallback;
  } catch (e) {
    return { data: fallback.data, error: { message: e?.message || String(e) } };
  }
}

async function usersById(ids) {
  const list = [...new Set((ids || []).filter(Boolean).map(String))];
  const out = {};
  if (!list.length) return out;
  for (let i = 0; i < list.length; i += 200) {
    const { data } = await soft(
      supabase.from("users").select("id, username, display_name, avatar_url, is_admin, created_at").in("id", list.slice(i, i + 200))
    );
    for (const u of data || []) out[u.id] = u;
  }
  return out;
}

function publicUser(u, id) {
  if (!u) return id ? { id, username: state.usernameById?.get?.(String(id)) || null, displayName: null, avatarUrl: null } : null;
  return { id: u.id, username: u.username || null, displayName: u.display_name || null, avatarUrl: u.avatar_url || null, isAdmin: Boolean(u.is_admin) };
}

/* ======================= templates ======================= */

function templateOut(row) {
  return {
    id: row.id,
    name: row.name || "",
    action: row.action,
    category: row.category,
    presetId: row.preset_id || null,
    durationSeconds: row.duration_seconds ?? null,
    message: row.message || null,
    useCount: Number(row.use_count) || 0,
  };
}

async function listTemplates() {
  let { data, error } = await supabase.from("moderation_templates").select("*").order("created_at", { ascending: true }).limit(200);
  if (error) {
    if (isMissingTable(error)) return { ready: false, templates: [] };
    throw new Error(error.message);
  }
  if (!(data || []).length) {
    const seed = await supabase.from("moderation_templates").insert(model.SUGGESTED_TEMPLATES.map((t) => ({ ...t })));
    if (!seed.error) ({ data } = await supabase.from("moderation_templates").select("*").order("created_at", { ascending: true }).limit(200));
  }
  return { ready: true, templates: (data || []).filter((r) => !r.archived_at).map(templateOut) };
}

async function createTemplate(body, actorId) {
  const clean = model.validateTemplate(body, CATEGORY_IDS);
  const { data, error } = await supabase.from("moderation_templates").insert({ ...clean, created_by: actorId || null }).select("*").single();
  if (error) {
    if (isMissingTable(error)) throw contentFilter.unavailable();
    throw new Error(error.message);
  }
  return templateOut(data);
}

async function archiveTemplate(id) {
  if (!isUuid(id)) throw httpError(400, "Invalid template.", "TEMPLATE_INVALID");
  const { data, error } = await supabase.from("moderation_templates").update({ archived_at: new Date().toISOString() }).eq("id", id).select("*");
  if (error) {
    if (isMissingTable(error)) throw contentFilter.unavailable();
    throw new Error(error.message);
  }
  if (!data || !data.length) throw httpError(404, "Template not found.", "TEMPLATE_NOT_FOUND");
  return templateOut(data[0]);
}

async function bumpTemplate(id) {
  if (!isUuid(id)) return;
  const { data } = await soft(supabase.from("moderation_templates").select("id, use_count").eq("id", id).maybeSingle(), { data: null });
  if (!data) return;
  await soft(supabase.from("moderation_templates").update({ use_count: (Number(data.use_count) || 0) + 1, updated_at: new Date().toISOString() }).eq("id", id));
}

/* ======================= escalation rules ======================= */

function ruleOut(row) {
  return {
    id: row.id,
    name: row.name || "",
    enabled: row.enabled !== false,
    categories: row.categories || [],
    windowDays: Number(row.window_days) || 30,
    steps: Array.isArray(row.steps) ? row.steps : [],
    banSuggestOnly: row.ban_suggest_only !== false,
    discountEarlyLift: row.discount_early_lift !== false,
    triggerCount: Number(row.trigger_count) || 0,
    recentTriggers: Array.isArray(row.recent_triggers) ? row.recent_triggers : [],
    updatedAt: row.updated_at || row.created_at || null,
  };
}

let rulesCache = { at: 0, rows: null, ready: false };

async function loadRuleRows({ force = false } = {}) {
  if (!force && rulesCache.rows && Date.now() - rulesCache.at < 30000) return rulesCache;
  let { data, error } = await supabase.from("moderation_rules").select("*").order("created_at", { ascending: true }).limit(100);
  if (error) {
    rulesCache = { at: Date.now(), rows: [], ready: false };
    return rulesCache;
  }
  if (!(data || []).length) {
    const seed = await supabase.from("moderation_rules").insert({ ...model.SUGGESTED_RULE, steps: model.SUGGESTED_RULE.steps.map((s) => ({ ...s })), categories: [...model.SUGGESTED_RULE.categories] });
    if (!seed.error) ({ data } = await supabase.from("moderation_rules").select("*").order("created_at", { ascending: true }).limit(100));
  }
  rulesCache = { at: Date.now(), rows: (data || []).filter((r) => !r.archived_at), ready: true };
  return rulesCache;
}

async function listRules() {
  const c = await loadRuleRows({ force: true });
  return { ready: c.ready, rules: c.rows.map(ruleOut) };
}

async function saveRule(id, body, actorId) {
  const clean = model.validateRule(body, CATEGORY_IDS);
  const now = new Date().toISOString();
  let res;
  if (id) {
    if (!isUuid(id)) throw httpError(400, "Invalid rule.", "RULE_INVALID");
    res = await supabase.from("moderation_rules").update({ ...clean, updated_by: actorId || null, updated_at: now }).eq("id", id).select("*");
  } else {
    res = await supabase.from("moderation_rules").insert({ ...clean, created_by: actorId || null, updated_by: actorId || null }).select("*");
  }
  if (res.error) {
    if (isMissingTable(res.error)) throw contentFilter.unavailable();
    throw new Error(res.error.message);
  }
  const row = Array.isArray(res.data) ? res.data[0] : res.data;
  if (!row) throw httpError(404, "Rule not found.", "RULE_NOT_FOUND");
  await loadRuleRows({ force: true });
  return ruleOut(row);
}

async function archiveRule(id) {
  if (!isUuid(id)) throw httpError(400, "Invalid rule.", "RULE_INVALID");
  const { data, error } = await supabase.from("moderation_rules").update({ archived_at: new Date().toISOString(), enabled: false }).eq("id", id).select("*");
  if (error) {
    if (isMissingTable(error)) throw contentFilter.unavailable();
    throw new Error(error.message);
  }
  if (!data || !data.length) throw httpError(404, "Rule not found.", "RULE_NOT_FOUND");
  await loadRuleRows({ force: true });
  return ruleOut(data[0]);
}

async function sanctionRows(userIds, { sinceDays = 365 } = {}) {
  const ids = [...new Set((userIds || []).filter(isUuid))];
  const byUser = new Map(ids.map((id) => [id, []]));
  if (!ids.length) return byUser;
  const since = new Date(Date.now() - sinceDays * DAY).toISOString();
  const { data } = await soft(
    supabase
      .from("moderation_actions")
      .select("id, action_type, target_user_id, category, created_at, expires_at, revoked_at, meta")
      .in("target_user_id", ids)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(5000)
  );
  for (const r of data || []) byUser.get(r.target_user_id)?.push(r);
  return byUser;
}

/**
 * What the enabled rules say about giving these users this sanction now.
 * @returns {Promise<Array<{ userId: string, ruleId: string, ruleName: string, nth: number, step: object, stronger: boolean }>>}
 */
async function escalationPreview(userIds, { category, action, seconds }) {
  const c = await loadRuleRows();
  const rules = (c.rows || []).filter((r) => r.enabled !== false);
  if (!rules.length || !category) return [];
  const maxWindow = Math.max(...rules.map((r) => Number(r.window_days) || 30));
  const rows = await sanctionRows(userIds, { sinceDays: maxWindow });
  const now = Date.now();
  const out = [];
  for (const [userId, list] of rows) {
    const s = model.escalationFor(rules, list, { category, action, seconds, now });
    if (s) out.push({ userId, ...s });
  }
  return out;
}

async function recordTrigger(rule, entry) {
  const recent = [entry, ...(Array.isArray(rule.recent_triggers) ? rule.recent_triggers : [])].slice(0, 20);
  await soft(
    supabase
      .from("moderation_rules")
      .update({ trigger_count: (Number(rule.trigger_count) || 0) + 1, recent_triggers: recent })
      .eq("id", rule.id)
  );
  rule.trigger_count = (Number(rule.trigger_count) || 0) + 1;
  rule.recent_triggers = recent;
}

/**
 * Hook on the timeout / kick path, after the sanction was saved. Returns the
 * strongest suggestion (or null). Automatic sanctions (content filter) step up
 * to a longer timeout or a kick by themselves; a ban step is never applied
 * automatically, it is announced to the admin room as a suggestion.
 */
async function afterSanction({ io, userId, category, actionType, auto = false, appliedSeconds = null }) {
  const c = await loadRuleRows();
  const rules = (c.rows || []).filter((r) => r.enabled !== false && Array.isArray(r.categories) && r.categories.includes(category));
  if (!rules.length) return null;
  const maxWindow = Math.max(...rules.map((r) => Number(r.window_days) || 30));
  const rows = (await sanctionRows([userId], { sinceDays: maxWindow })).get(userId) || [];
  const now = Date.now();
  const best = model.escalationFor(rules, rows, { category, action: actionType, seconds: appliedSeconds, now, includeCurrent: true });
  if (!best) return null;
  let outcome = "noted";
  if (best.step.kind === "ban") outcome = "suggested";
  else if (auto && best.stronger && best.step.kind === "timeout" && best.step.seconds) {
    await moderation.applyTimeout({ targetUserId: userId, actorUserId: null, category, durationSeconds: best.step.seconds });
    try {
      io?.to?.(`user:${userId}`)?.emit?.("system:timeout", moderation.getActiveTimeout(userId));
    } catch {
      /* best effort */
    }
    outcome = "applied";
  } else if (auto && best.stronger && best.step.kind === "kick") {
    try {
      await require("../socket/adminHandlers").kickUser(io, { actorId: null, actorUsername: "auto", targetUserId: userId, reason: moderation.categoryLabel(category), action: "kick", category });
    } catch {
      /* no sockets */
    }
    outcome = "applied";
  }
  const rule = rules.find((r) => r.id === best.ruleId);
  if (rule) await recordTrigger(rule, { at: new Date(now).toISOString(), userId, nth: best.nth, step: best.step, outcome });
  if (outcome === "suggested") {
    try {
      require("../socket/adminHandlers").notifyAdminRoom(io, { type: "escalation", userId, ruleId: best.ruleId, nth: best.nth, step: best.step });
    } catch {
      /* no sockets */
    }
  }
  return { ...best, outcome };
}

/* ======================= active sanctions ======================= */

const ACTIVE_COLS =
  "id, username, display_name, avatar_url, is_banned, ban_category, ban_reason, ban_message, banned_at, banned_by, ban_expires_at, timeout_until, timeout_category, timeout_reason, timeout_message, timed_out_at, timed_out_by";

async function latestAppeals(userIds) {
  const out = new Map();
  if (!userIds.length) return out;
  const { data, error } = await soft(
    supabase.from("ban_appeals").select("id, user_id, status, type, created_at").in("user_id", userIds).order("created_at", { ascending: false }).limit(2000)
  );
  if (error) return out;
  for (const a of data || []) if (!out.has(a.user_id)) out.set(a.user_id, a);
  return out;
}

async function listActive({ now = Date.now() } = {}) {
  const nowIso = new Date(now).toISOString();
  const [bans, timeouts] = await Promise.all([
    soft(supabase.from("users").select(ACTIVE_COLS).eq("is_banned", true).limit(1000)),
    soft(supabase.from("users").select(ACTIVE_COLS).not("timeout_until", "is", null).gt("timeout_until", nowIso).limit(1000)),
  ]);
  const banRows = (bans.data || []).filter((r) => !r.ban_expires_at || Date.parse(r.ban_expires_at) > now);
  const toRows = (timeouts.data || []).filter((r) => r.timeout_until && Date.parse(r.timeout_until) > now && !r.is_banned);
  const actors = await usersById([...banRows.map((r) => r.banned_by), ...toRows.map((r) => r.timed_out_by)]);
  const appeals = await latestAppeals(banRows.map((r) => r.id));
  const user = (r) => ({ id: r.id, username: r.username, displayName: r.display_name || null, avatarUrl: r.avatar_url || null });
  const items = [];
  for (const r of banRows) {
    const ap = appeals.get(r.id);
    items.push({
      key: `ban:${r.id}`,
      type: "ban",
      user: user(r),
      category: r.ban_category || "other",
      reason: r.ban_reason || null,
      message: r.ban_message || null,
      startedAt: r.banned_at || null,
      endsAt: r.ban_expires_at || null,
      actor: r.banned_by ? publicUser(actors[r.banned_by], r.banned_by) : null,
      auto: !r.banned_by,
      appeal: ap && (!r.banned_at || Date.parse(ap.created_at) >= Date.parse(r.banned_at) - 1000) ? { id: ap.id, status: ap.status } : null,
    });
  }
  for (const r of toRows) {
    items.push({
      key: `timeout:${r.id}`,
      type: "timeout",
      user: user(r),
      category: r.timeout_category || "other",
      reason: r.timeout_reason || null,
      message: r.timeout_message || null,
      startedAt: r.timed_out_at || null,
      endsAt: r.timeout_until,
      actor: r.timed_out_by ? publicUser(actors[r.timed_out_by], r.timed_out_by) : null,
      auto: !r.timed_out_by,
      appeal: null,
    });
  }
  items.sort((a, b) => (a.endsAt ? Date.parse(a.endsAt) : Infinity) - (b.endsAt ? Date.parse(b.endsAt) : Infinity));
  return items;
}

async function latestActionRow(userId, type) {
  const { data } = await soft(
    supabase
      .from("moderation_actions")
      .select("*")
      .eq("target_user_id", userId)
      .eq("action_type", type)
      .order("created_at", { ascending: false })
      .limit(1),
    { data: [] }
  );
  return (data || [])[0] || null;
}

const MAX_EXTEND = 365 * 86400;

async function extendSanction({ io, userId, type, seconds, actor }) {
  if (!isUuid(userId)) throw httpError(400, "Invalid user.", "USER_INVALID");
  const secs = Math.floor(Number(seconds));
  if (!(secs >= 60) || secs > MAX_EXTEND) throw httpError(400, "Choose a length between a minute and a year.", "EXTEND_INVALID");
  const { data: row } = await soft(supabase.from("users").select(ACTIVE_COLS).eq("id", userId).maybeSingle(), { data: null });
  if (!row) throw httpError(404, "User not found.", "USER_NOT_FOUND");
  const now = Date.now();
  if (type === "timeout") {
    if (!row.timeout_until || Date.parse(row.timeout_until) <= now) throw httpError(409, "This user is not muted.", "NOT_ACTIVE");
    const until = new Date(Date.parse(row.timeout_until) + secs * 1000).toISOString();
    const { error } = await supabase.from("users").update({ timeout_until: until }).eq("id", userId);
    if (error) throw new Error(error.message);
    const entry = state.timedOutUsers.get(String(userId));
    if (entry) entry.until = until;
    else state.timedOutUsers.set(String(userId), { until, category: row.timeout_category || "other", reason: row.timeout_reason, message: row.timeout_message, timedOutAt: row.timed_out_at, actorId: row.timed_out_by });
    const last = await latestActionRow(userId, "timeout");
    if (last) await soft(supabase.from("moderation_actions").update({ expires_at: until, duration_seconds: (Number(last.duration_seconds) || 0) + secs }).eq("id", last.id));
    await moderation.recordAction({ actionType: "timeout_extend", targetUserId: userId, actorUserId: actor.id, category: row.timeout_category, durationSeconds: secs, expiresAt: until, meta: { from: row.timeout_until, to: until } });
    try {
      io?.to?.(`user:${userId}`)?.emit?.("system:timeout", moderation.getActiveTimeout(userId));
    } catch {
      /* best effort */
    }
    return { type, from: row.timeout_until, until, username: row.username };
  }
  if (type === "ban") {
    if (!row.is_banned) throw httpError(409, "This user is not banned.", "NOT_ACTIVE");
    if (!row.ban_expires_at) throw httpError(409, "A permanent ban cannot be extended.", "BAN_PERMANENT");
    const base = Math.max(now, Date.parse(row.ban_expires_at));
    const until = new Date(base + secs * 1000).toISOString();
    const { error } = await supabase.from("users").update({ ban_expires_at: until }).eq("id", userId);
    if (error) throw new Error(error.message);
    const detail = state.banDetailsByUser.get(String(userId));
    if (detail) detail.expiresAt = until;
    const last = await latestActionRow(userId, "ban");
    if (last) await soft(supabase.from("moderation_actions").update({ expires_at: until }).eq("id", last.id));
    await moderation.recordAction({ actionType: "ban_extend", targetUserId: userId, actorUserId: actor.id, category: row.ban_category, durationSeconds: secs, expiresAt: until, meta: { from: row.ban_expires_at, to: until } });
    return { type, from: row.ban_expires_at, until, username: row.username };
  }
  throw httpError(400, "Unknown sanction.", "TYPE_INVALID");
}

async function editSanctionMessage({ io, userId, type, message, actor }) {
  if (!isUuid(userId)) throw httpError(400, "Invalid user.", "USER_INVALID");
  const msg = String(message || "").trim().slice(0, 500) || null;
  const col = type === "ban" ? "ban_message" : type === "timeout" ? "timeout_message" : null;
  if (!col) throw httpError(400, "Unknown sanction.", "TYPE_INVALID");
  const { data, error } = await supabase.from("users").update({ [col]: msg }).eq("id", userId).select("id, username").maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw httpError(404, "User not found.", "USER_NOT_FOUND");
  if (type === "timeout") {
    const entry = state.timedOutUsers.get(String(userId));
    if (entry) entry.message = msg;
    try {
      const active = moderation.getActiveTimeout(userId);
      if (active) io?.to?.(`user:${userId}`)?.emit?.("system:timeout", active);
    } catch {
      /* best effort */
    }
  } else {
    const detail = state.banDetailsByUser.get(String(userId));
    if (detail) detail.message = msg;
  }
  const last = await latestActionRow(userId, type);
  if (last) await soft(supabase.from("moderation_actions").update({ message: msg }).eq("id", last.id));
  return { type, message: msg, username: data.username, actorId: actor?.id || null };
}

/**
 * Erken kaldır: reason required, recorded on the sanction row (revoked_at,
 * meta.earlyLift / liftReason / discount) and in the unban / untimeout row.
 */
async function liftSanction({ io, userId, type, reasonCode, note, notify = false, discount = false, actor }) {
  if (!isUuid(userId)) throw httpError(400, "Invalid user.", "USER_INVALID");
  if (!model.LIFT_REASONS.includes(reasonCode)) throw httpError(400, "Pick a reason.", "LIFT_REASON");
  const text = String(note || "").trim().slice(0, 500);
  if (reasonCode === "other" && text.length < 3) throw httpError(400, "Write the reason.", "LIFT_NOTE");
  const last = await latestActionRow(userId, type === "ban" ? "ban" : "timeout");
  if (last && !last.revoked_at) {
    await soft(
      supabase
        .from("moderation_actions")
        .update({ revoked_at: new Date().toISOString(), revoked_by: actor.id, meta: { ...(last.meta || {}), earlyLift: true, liftReason: reasonCode, liftNote: text || null, discount: Boolean(discount) } })
        .eq("id", last.id)
    );
  }
  const noteText = text ? `${reasonCode}: ${text}` : reasonCode;
  if (type === "ban") {
    await moderation.revokeBan({ targetUserId: userId, actorUserId: actor.id, note: noteText });
  } else if (type === "timeout") {
    await moderation.revokeTimeout({ targetUserId: userId, actorUserId: actor.id, note: noteText });
    try {
      io?.to?.(`user:${userId}`)?.emit?.("system:timeout:cleared", { ok: true });
    } catch {
      /* best effort */
    }
  } else {
    throw httpError(400, "Unknown sanction.", "TYPE_INVALID");
  }
  if (notify && type === "timeout") {
    try {
      const { pushNotification } = require("../socket/handlers");
      pushNotification(io, userId, { type: "moderation_timeout_lifted", titleKey: "modDesk.notify.liftedTitle", bodyKey: "modDesk.notify.liftedBody", meta: {} });
    } catch {
      /* the notification is best effort */
    }
  }
  return { type, reasonCode, discount: Boolean(discount), notified: Boolean(notify && type === "timeout") };
}

/* ======================= history ======================= */

const HISTORY_PERIODS = Object.freeze({ "1": 1, "7": 7, "14": 14, "30": 30, "90": 90 });

function parseHistoryQuery(q) {
  const days = HISTORY_PERIODS[String(q.days || "14")] || 14;
  const type = model.HISTORY_TYPES.includes(q.type) ? q.type : "";
  const category = q.category && CATEGORY_IDS.has(q.category) ? q.category : "";
  const actor = q.actor === "auto" || isUuid(q.actor) ? q.actor : "";
  const userId = isUuid(q.userId) ? q.userId : "";
  const search = String(q.q || "").trim().toLowerCase().slice(0, 80);
  const limit = Math.max(1, Math.min(200, Math.floor(Number(q.limit) || 40)));
  const offset = Math.max(0, Math.floor(Number(q.offset) || 0));
  return { days, type, category, actor, userId, search, limit, offset, all: q.all === "1" };
}

async function queryHistory(rawQuery, { now = Date.now() } = {}) {
  const q = parseHistoryQuery(rawQuery || {});
  const since = new Date(now - q.days * DAY).toISOString();
  let query = supabase.from("moderation_actions").select("*").gte("created_at", since).order("created_at", { ascending: false }).limit(5000);
  if (q.userId) query = query.eq("target_user_id", q.userId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  const all = data || [];
  const people = await usersById(all.flatMap((r) => [r.target_user_id, r.actor_user_id]));
  const appeals = await latestAppeals([...new Set(all.filter((r) => r.action_type === "ban").map((r) => r.target_user_id))]);
  const lifts = new Map(); // userId -> [lift rows] (unban / untimeout)
  for (const r of all) if (r.action_type === "unban" || r.action_type === "untimeout") {
    if (!lifts.has(r.target_user_id)) lifts.set(r.target_user_id, []);
    lifts.get(r.target_user_id).push(r);
  }
  const latestOf = new Map();
  for (const r of all) if ((r.action_type === "ban" || r.action_type === "timeout") && !latestOf.has(`${r.action_type}:${r.target_user_id}`)) latestOf.set(`${r.action_type}:${r.target_user_id}`, r.id);

  const rows = all.map((r) => {
    const target = people[r.target_user_id];
    const actorRow = r.actor_user_id ? people[r.actor_user_id] : null;
    const liftType = r.action_type === "ban" ? "unban" : r.action_type === "timeout" ? "untimeout" : null;
    const laterLift = liftType
      ? (lifts.get(r.target_user_id) || []).find((l) => l.action_type === liftType && Date.parse(l.created_at) > Date.parse(r.created_at) && (!r.expires_at || Date.parse(l.created_at) < Date.parse(r.expires_at)))
      : null;
    const isLatest = latestOf.get(`${r.action_type}:${r.target_user_id}`) === r.id;
    const currentlyActive =
      isLatest &&
      ((r.action_type === "ban" && state.bannedUserIds.has(String(r.target_user_id))) ||
        (r.action_type === "timeout" && moderation.isTimedOut(r.target_user_id)));
    const ap = r.action_type === "ban" ? appeals.get(r.target_user_id) : null;
    const appeal = ap && Date.parse(ap.created_at) >= Date.parse(r.created_at) - 1000 ? ap.status : null;
    const status = model.historyStatus(r, { now, laterLift, currentlyActive, appeal });
    const lifter = r.revoked_by ? people[r.revoked_by] || null : laterLift?.actor_user_id ? people[laterLift.actor_user_id] || null : null;
    return {
      id: r.id,
      createdAt: r.created_at,
      action: r.action_type,
      target: publicUser(target, r.target_user_id),
      category: r.category || null,
      reason: r.reason || null,
      message: r.message || null,
      durationSeconds: r.duration_seconds ?? null,
      expiresAt: r.expires_at || null,
      actor: actorRow ? publicUser(actorRow) : null,
      auto: !r.actor_user_id,
      status,
      liftedBy: status === "lifted" && lifter ? { id: lifter.id, username: lifter.username } : null,
      liftReason: r.meta?.liftReason || null,
    };
  });

  const actors = new Map();
  for (const r of rows) if (r.actor) actors.set(r.actor.id, r.actor.username);
  const filtered = rows.filter((r) => {
    if (q.type && r.action !== q.type) return false;
    if (q.category && r.category !== q.category) return false;
    if (q.actor === "auto" && !r.auto) return false;
    if (q.actor && q.actor !== "auto" && r.actor?.id !== q.actor) return false;
    if (q.search) {
      const hay = `${r.target?.username || ""} ${r.target?.displayName || ""} ${r.message || ""} ${r.reason || ""}`.toLowerCase();
      if (!hay.includes(q.search)) return false;
    }
    return true;
  });
  const chart = model.dailyBuckets(filtered, { days: q.days, now });
  return {
    total: filtered.length,
    offset: q.offset,
    limit: q.all ? filtered.length : q.limit,
    rows: q.all ? filtered : filtered.slice(q.offset, q.offset + q.limit),
    chart,
    actors: [...actors.entries()].map(([id, username]) => ({ id, username })),
    days: q.days,
  };
}

/* ======================= summary, candidates ======================= */

async function deskSummary({ now = Date.now() } = {}) {
  const startOfDay = new Date(now);
  startOfDay.setUTCHours(0, 0, 0, 0);
  const [active, today, flagged, appeals, reports] = await Promise.all([
    listActive({ now }),
    soft(supabase.from("moderation_actions").select("id", { count: "exact", head: true }).gte("created_at", startOfDay.toISOString())),
    flaggedCounts(),
    soft(supabase.from("ban_appeals").select("id", { count: "exact", head: true }).eq("status", "pending"), { data: null, count: 0 }),
    openReportSnippets(),
  ]);
  const timeouts = active.filter((a) => a.type === "timeout");
  const bans = active.filter((a) => a.type === "ban");
  const pendingReports = reports.filter((r) => !flagged.reportIds.has(r.id));
  const oldest = [flagged.oldestAt, ...pendingReports.map((r) => r.created_at)].filter(Boolean).sort()[0] || null;
  return {
    activeTimeouts: timeouts.length,
    activeBans: bans.length,
    permanentBans: bans.filter((b) => !b.endsAt).length,
    endingWithinHour: active.filter((a) => a.endsAt && Date.parse(a.endsAt) - now <= 3600000).length,
    todayActions: Number(today.count) || 0,
    flaggedPending: flagged.pending + pendingReports.length,
    flaggedOldestAt: oldest,
    openAppeals: appeals.error ? null : Number(appeals.count) || 0,
    endingSoon: active.filter((a) => a.endsAt).slice(0, 6),
    ready: { desk: flagged.ready },
  };
}

const CANDIDATE_FILTERS = Object.freeze(["reported", "online", "new", "all"]);

async function candidates({ filter = "reported", q = "", ids = [] } = {}) {
  const f = CANDIDATE_FILTERS.includes(filter) ? filter : "reported";
  const term = String(q || "").trim().slice(0, 60);
  let userIds = [];
  const openReports = await soft(supabase.from("user_reports").select("target_id").eq("status", "open").limit(2000));
  const reportCount = new Map();
  for (const r of openReports.data || []) reportCount.set(r.target_id, (reportCount.get(r.target_id) || 0) + 1);
  const wanted = (Array.isArray(ids) ? ids : []).filter(isUuid).slice(0, 50);
  if (wanted.length) userIds = wanted;
  else if (term) {
    if (isUuid(term)) userIds = [term];
    else {
      const like = `%${term.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
      const [a, b] = await Promise.all([
        soft(supabase.from("users").select("id").ilike("username", like).limit(30)),
        soft(supabase.from("users").select("id").ilike("display_name", like).limit(30)),
      ]);
      userIds = [...new Set([...(a.data || []), ...(b.data || [])].map((r) => r.id))].slice(0, 40);
    }
  } else if (f === "reported") {
    userIds = [...reportCount.entries()].sort((x, y) => y[1] - x[1]).slice(0, 40).map(([id]) => id);
  } else if (f === "online") {
    userIds = [...(state.presence?.keys?.() || [])].map(String).filter(isUuid).slice(0, 60);
  } else {
    const since = new Date(Date.now() - (f === "new" ? 7 : 3650) * DAY).toISOString();
    const { data } = await soft(supabase.from("users").select("id").gte("created_at", since).order("created_at", { ascending: false }).limit(40));
    userIds = (data || []).map((r) => r.id);
  }
  if (!userIds.length) return { filter: f, users: [] };
  const [{ data: rows }, sanctions] = await Promise.all([
    soft(supabase.from("users").select("id, username, display_name, avatar_url, is_admin, is_banned, created_at, timeout_until").in("id", userIds)),
    sanctionRows(userIds, { sinceDays: 365 }),
  ]);
  const now = Date.now();
  const order = new Map(userIds.map((id, i) => [id, i]));
  const users = (rows || [])
    .map((u) => {
      const list = sanctions.get(u.id) || [];
      const in30 = list.filter((r) => Date.parse(r.created_at) >= now - 30 * DAY);
      return {
        id: u.id,
        username: u.username,
        displayName: u.display_name || null,
        avatarUrl: u.avatar_url || null,
        isAdmin: Boolean(u.is_admin) || u.username === "admin",
        createdAt: u.created_at || null,
        online: Boolean(state.presence?.has?.(u.id) || state.presence?.has?.(String(u.id))),
        reports: reportCount.get(u.id) || 0,
        timeouts: list.filter((r) => r.action_type === "timeout").length,
        bans: list.filter((r) => r.action_type === "ban").length,
        sanctions30d: in30.filter((r) => model.SANCTION_TYPES.includes(r.action_type)).length,
        timedOut: Boolean(u.timeout_until && Date.parse(u.timeout_until) > now),
        banned: Boolean(u.is_banned),
      };
    })
    .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  return { filter: f, users };
}

/* ======================= flagged queue ======================= */

async function flaggedCounts() {
  const res = await soft(supabase.from("flagged_messages").select("id, created_at, report_id").eq("status", "pending").order("created_at", { ascending: true }).limit(2000));
  const decided = await soft(supabase.from("flagged_messages").select("report_id").not("report_id", "is", null).limit(5000));
  if (res.error && isMissingTable(res.error)) return { ready: false, pending: 0, oldestAt: null, reportIds: new Set() };
  const list = res.data || [];
  return {
    ready: !res.error,
    pending: list.length,
    oldestAt: list[0]?.created_at || null,
    reportIds: new Set((decided.data || []).map((r) => r.report_id).filter(Boolean)),
  };
}

/** Open user reports that carry a message snippet (dm / group / server). */
async function openReportSnippets() {
  const { data } = await soft(
    supabase.from("user_reports").select("*").eq("status", "open").order("created_at", { ascending: false }).limit(200)
  );
  return (data || []).filter((r) => r.snippet && ["dm", "group", "server"].includes(r.context_type));
}

const DECISIONS = Object.freeze({ approve: "approved", remove: "removed", sanctioned: "sanctioned" });

async function listFlagged({ status = "pending", source = "all" } = {}, { compiled } = {}) {
  const wantPending = status !== "decided";
  const src = ["filter", "user_report", "admin", "all"].includes(source) ? source : "all";
  let q = supabase.from("flagged_messages").select("*").order("created_at", { ascending: !wantPending ? false : true }).limit(200);
  q = wantPending ? q.eq("status", "pending") : q.neq("status", "pending");
  const res = await soft(q);
  const ready = !(res.error && isMissingTable(res.error));
  const rows = (res.data || []).filter((r) => src === "all" || r.source === src);
  let reportItems = [];
  if (wantPending && (src === "all" || src === "user_report")) {
    const mirrored = new Set();
    if (ready) {
      const m = await soft(supabase.from("flagged_messages").select("report_id").not("report_id", "is", null).limit(5000));
      for (const r of m.data || []) mirrored.add(r.report_id);
    }
    reportItems = (await openReportSnippets()).filter((r) => !mirrored.has(r.id));
  }
  const people = await usersById([...rows.map((r) => r.author_id), ...rows.map((r) => r.decided_by), ...reportItems.flatMap((r) => [r.target_id, r.reporter_id])]);
  const matchesOf = (text) => (text ? core.matchText(text, compiled).map(({ start, end, severity, kind, pattern }) => ({ start, end, severity, kind, pattern })) : []);
  const items = rows.map((r) => ({
    id: r.id,
    source: r.source,
    status: r.status,
    convType: r.conv_type,
    where: r.where_label || null,
    createdAt: r.created_at,
    author: publicUser(people[r.author_id], r.author_id),
    content: r.content || "",
    matches: matchesOf(r.content),
    severity: r.severity || null,
    ruleKind: r.rule_kind || null,
    category: r.category || null,
    reason: r.reason || null,
    blocked: Boolean(r.blocked),
    canRemove: Boolean(r.message_id) && r.conv_type !== "general",
    canContext: Boolean(r.message_id) && r.conv_type !== "general",
    decidedBy: r.decided_by ? publicUser(people[r.decided_by], r.decided_by) : null,
    decidedAt: r.decided_at || null,
    reportId: r.report_id || null,
  }));
  for (const r of reportItems) {
    items.push({
      id: `report:${r.id}`,
      source: "user_report",
      status: "pending",
      convType: r.context_type,
      where: null,
      reporter: publicUser(people[r.reporter_id], r.reporter_id),
      createdAt: r.occurred_at || r.created_at,
      author: publicUser(people[r.target_id], r.target_id),
      content: r.snippet || "",
      matches: matchesOf(r.snippet),
      severity: null,
      ruleKind: null,
      category: r.reason || null,
      reason: r.reason || null,
      blocked: false,
      canRemove: false,
      canContext: false,
      decidedBy: null,
      decidedAt: null,
      reportId: r.id,
    });
  }
  if (wantPending) items.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  return { ready, items };
}

async function deleteFlaggedMessage(io, row) {
  const id = row.message_id;
  if (row.conv_type === "server") {
    const { error } = await supabase.from("server_messages").delete().eq("id", id).eq("channel_id", row.channel_id);
    if (error) throw new Error(error.message);
    try {
      io?.to?.(`server-channel:${row.channel_id}`)?.emit?.("server:channel:message:deleted", { serverId: row.server_id, channelId: row.channel_id, messageId: id });
    } catch {
      /* best effort */
    }
  } else if (row.conv_type === "dm") {
    const { error } = await supabase.from("dm_messages").delete().eq("id", id).eq("from_user_id", row.author_id);
    if (error) throw new Error(error.message);
    try {
      io?.to?.(`user:${row.author_id}`)?.emit?.("dm:message:deleted", { messageId: id, withUserId: row.peer_id });
      if (row.peer_id) io?.to?.(`user:${row.peer_id}`)?.emit?.("dm:message:deleted", { messageId: id, withUserId: row.author_id });
    } catch {
      /* best effort */
    }
  } else if (row.conv_type === "group") {
    const { error } = await supabase.from("group_messages").delete().eq("id", id).eq("group_id", row.group_id);
    if (error) throw new Error(error.message);
    try {
      io?.to?.(`group:${row.group_id}`)?.emit?.("group:message:deleted", { groupId: row.group_id, messageId: id });
    } catch {
      /* best effort */
    }
  }
}

async function decideFlagged({ io, id, decision, note, actor }) {
  const status = DECISIONS[decision];
  if (!status) throw httpError(400, "Unknown decision.", "DECISION_INVALID");
  const now = new Date().toISOString();
  const noteText = String(note || "").trim().slice(0, 500) || null;
  if (String(id).startsWith("report:")) {
    const reportId = String(id).slice(7);
    if (!isUuid(reportId)) throw httpError(400, "Invalid item.", "FLAG_INVALID");
    if (decision === "remove") throw httpError(409, "This report has no message to remove.", "NO_MESSAGE");
    const { data: rep } = await soft(supabase.from("user_reports").select("*").eq("id", reportId).maybeSingle(), { data: null });
    if (!rep) throw httpError(404, "Item not found.", "FLAG_NOT_FOUND");
    const ins = await supabase
      .from("flagged_messages")
      .insert({ source: "user_report", status, conv_type: ["dm", "group", "server"].includes(rep.context_type) ? rep.context_type : "server", author_id: rep.target_id, content: rep.snippet || null, category: rep.reason || null, reason: rep.reason || null, report_id: reportId, decided_by: actor.id, decided_at: now, decision_note: noteText })
      .select("id")
      .single();
    if (ins.error && isMissingTable(ins.error)) throw contentFilter.unavailable();
    try {
      await require("./userReports").resolveReport(reportId, { actorId: actor.id, status: decision === "approve" ? "dismissed" : "actioned", resolution: decision === "approve" ? "no_violation" : "moderation_desk" });
    } catch (e) {
      if (e?.code !== "NOT_FOUND") console.warn("[moderationDesk] resolve report:", e?.message || e);
    }
    return { id, status, authorId: rep.target_id, reportId };
  }
  if (!isUuid(id)) throw httpError(400, "Invalid item.", "FLAG_INVALID");
  const { data: row, error } = await supabase.from("flagged_messages").select("*").eq("id", id).maybeSingle();
  if (error) {
    if (isMissingTable(error)) throw contentFilter.unavailable();
    throw new Error(error.message);
  }
  if (!row) throw httpError(404, "Item not found.", "FLAG_NOT_FOUND");
  if (decision === "remove") {
    if (!row.message_id || row.conv_type === "general") throw httpError(409, "This message was never saved.", "NO_MESSAGE");
    await deleteFlaggedMessage(io, row);
  }
  await supabase.from("flagged_messages").update({ status, decided_by: actor.id, decided_at: now, decision_note: noteText }).eq("id", id);
  return { id, status, authorId: row.author_id, convType: row.conv_type, messageId: row.message_id || null };
}

const CONTEXT_BEFORE = 3;
const CONTEXT_AFTER = 2;

async function flaggedContext(id) {
  if (!isUuid(id)) throw httpError(400, "Invalid item.", "FLAG_INVALID");
  const { data: row, error } = await supabase.from("flagged_messages").select("*").eq("id", id).maybeSingle();
  if (error) {
    if (isMissingTable(error)) throw contentFilter.unavailable();
    throw new Error(error.message);
  }
  if (!row) throw httpError(404, "Item not found.", "FLAG_NOT_FOUND");
  if (!row.message_id) return { row, messages: [] };
  let table;
  let scope;
  let senderCol = "sender_id";
  if (row.conv_type === "server") {
    table = "server_messages";
    scope = (q) => q.eq("channel_id", row.channel_id);
  } else if (row.conv_type === "group") {
    table = "group_messages";
    scope = (q) => q.eq("group_id", row.group_id);
  } else if (row.conv_type === "dm") {
    table = "dm_messages";
    senderCol = "from_user_id";
    scope = null;
  } else {
    return { row, messages: [] };
  }
  const cols = `id, ${senderCol}, content, created_at`;
  const { data: msg } = await soft(supabase.from(table).select(cols).eq("id", row.message_id).maybeSingle(), { data: null });
  const at = msg?.created_at || row.created_at;
  let before = [];
  let afterRows = [];
  if (table === "dm_messages") {
    const pair = [row.author_id, row.peer_id].filter(Boolean);
    const [b, a] = await Promise.all([
      soft(supabase.from(table).select(`${cols}, to_user_id`).in("from_user_id", pair).lt("created_at", at).order("created_at", { ascending: false }).limit(40)),
      soft(supabase.from(table).select(`${cols}, to_user_id`).in("from_user_id", pair).gt("created_at", at).order("created_at", { ascending: true }).limit(40)),
    ]);
    const inPair = (m) => pair.includes(m.from_user_id) && pair.includes(m.to_user_id);
    before = (b.data || []).filter(inPair).slice(0, CONTEXT_BEFORE);
    afterRows = (a.data || []).filter(inPair).slice(0, CONTEXT_AFTER);
  } else {
    const [b, a] = await Promise.all([
      soft(scope(supabase.from(table).select(cols)).lt("created_at", at).order("created_at", { ascending: false }).limit(CONTEXT_BEFORE)),
      soft(scope(supabase.from(table).select(cols)).gt("created_at", at).order("created_at", { ascending: true }).limit(CONTEXT_AFTER)),
    ]);
    before = b.data || [];
    afterRows = a.data || [];
  }
  const list = [...before.reverse(), ...(msg ? [msg] : []), ...afterRows];
  const people = await usersById(list.map((m) => m[senderCol]));
  const messages = list.map((m) => ({
    id: m.id,
    author: publicUser(people[m[senderCol]], m[senderCol]),
    createdAt: m.created_at,
    content: m.id === row.message_id ? null : String(m.content || "").startsWith("__voice__:") ? "" : String(m.content || "").slice(0, 300),
    flagged: m.id === row.message_id,
  }));
  return { row, messages };
}

/* ======================= appeals by user ======================= */

async function appealsForUsers(userIds) {
  const ids = (userIds || []).filter(isUuid).slice(0, 50);
  if (!ids.length) return [];
  const { data, error } = await supabase.from("ban_appeals").select("id").in("user_id", ids).order("created_at", { ascending: false }).limit(100);
  if (error) {
    if (isMissingTable(error)) return [];
    throw new Error(error.message);
  }
  if (!(data || []).length) return [];
  return require("./banExperience").listAppealsByIds(data.map((r) => r.id));
}

/**
 * GET /admin/system used to send only counts, so the old Content filters box
 * listed nothing. Lists from the word filter and the flagged queue.
 */
async function systemLists() {
  const rules = (await contentFilter.loadRules()).filter((r) => !r.removedAt && r.source !== "default");
  const { data, error } = await soft(supabase.from("flagged_messages").select("id, content, reason, severity, source, created_at").eq("status", "pending").order("created_at", { ascending: false }).limit(50));
  const flagged = error ? [] : data || [];
  const counts = await flaggedCounts();
  return {
    profanityWords: rules.map((r) => core.displayPattern(r)),
    flaggedMessages: flagged.map((r) => ({ id: r.id, text: r.content || "", reason: r.reason || r.severity || r.source, at: r.created_at })),
    flaggedCount: counts.ready ? counts.pending : state.flaggedMessages.length,
  };
}

function __resetForTests() {
  rulesCache = { at: 0, rows: null, ready: false };
}

module.exports = {
  isUuid,
  listTemplates,
  createTemplate,
  archiveTemplate,
  bumpTemplate,
  listRules,
  saveRule,
  archiveRule,
  escalationPreview,
  afterSanction,
  listActive,
  extendSanction,
  editSanctionMessage,
  liftSanction,
  queryHistory,
  parseHistoryQuery,
  deskSummary,
  candidates,
  listFlagged,
  decideFlagged,
  flaggedContext,
  flaggedCounts,
  appealsForUsers,
  systemLists,
  __resetForTests,
};
