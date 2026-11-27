"use strict";

/**
 * "Bug Avcısı": confirm a feedback item as a real bug, link duplicates, undo, the "Düzeltildi"
 * follow-up, badge levels and the admin leaderboard. Rules: ./model.js. Tables:
 * supabase/migrations/20261125d_bug_hunter.sql (feedback_bug_reports, bug_hunter_levels).
 *
 * Idempotent by feedback id: feedback_bug_reports.feedback_id is the primary key, so a second
 * confirm of the same item answers "already" and pays nothing; a re-confirm after an undo reuses
 * the row with round + 1. The DesCoin bonus goes through lib/descoin.js (reason bug_bounty,
 * meta.idempotency_key "bug_bounty:<feedback>:<round>", unique in the ledger), the take-back on
 * undo through descoin.debit (bug_bounty_revoke) and only while the coins are unspent; otherwise
 * they stay and the audit entry says "kept". Badges: the EXISTING #11 "bughunter" (and #32
 * "glitch" for a visual / UI bug) through lib/specialBadges.js with the admin badge tools' source
 * ("admin", the confirming admin as actor) and their audit codes (special_badge_grant / _revoke).
 *
 * Every step after the confirmation row is best effort and reported back (a failed push never
 * fails the admin's action); the row and the audit entry are the source of truth.
 */

const model = require("./model");

class BugHuntError extends Error {
  constructor(code, status = 409, extra = {}) {
    super(code);
    this.code = code;
    this.status = status;
    Object.assign(this, extra);
  }
}

function defaultDeps() {
  return {
    supabase: require("../../db/supabase"),
    descoin: require("../descoin"),
    specialBadges: require("../specialBadges"),
    badgeNotify: require("../specialBadgeNotify"),
    notify: require("./notify"),
    audit: (actor, action, target, meta) => {
      try {
        return require("../../runtime/sharedState").appendAudit(actor?.id || null, actor?.username || "system", action, target, meta);
      } catch {
        return null;
      }
    },
    now: () => new Date(),
  };
}

let override = null;
const deps = () => ({ ...defaultDeps(), ...(override || {}) });

const FEEDBACK_COLS = "id, user_id, username, status, subject, message, category, kind, admin_replies, created_at";
const isMissing = (error) => Boolean(error) && (error.code === "PGRST205" || error.code === "42P01" || /schema cache|does not exist/i.test(String(error.message || "")));

async function loadFeedback(sb, feedbackId) {
  const { data, error } = await sb.from("user_feedback").select(FEEDBACK_COLS).eq("id", feedbackId).maybeSingle();
  if (error) throw error;
  return data || null;
}

async function loadConfirmation(sb, feedbackId) {
  const { data, error } = await sb.from("feedback_bug_reports").select("*").eq("feedback_id", feedbackId).maybeSingle();
  if (error) {
    if (isMissing(error)) throw new BugHuntError("NOT_INSTALLED", 503);
    throw error;
  }
  return data || null;
}

async function liveRowsOf(sb, userId) {
  const { data, error } = await sb.from("feedback_bug_reports").select("*").eq("user_id", userId).is("undone_at", null);
  if (error) throw error;
  return data || [];
}

async function levelRow(sb, userId) {
  const { data } = await sb.from("bug_hunter_levels").select("*").eq("user_id", userId).maybeSingle();
  return data || null;
}

/** Recount one person's totals from their live rows and store them (self-healing). */
async function recount(sb, userId, patch = {}) {
  const rows = await liveRowsOf(sb, userId);
  const t = model.tally(rows).get(String(userId)) || { first: 0, also: 0, critical: 0, visual: 0, bySeverity: { low: 0, medium: 0, high: 0, critical: 0 }, since: null };
  const prev = await levelRow(sb, userId);
  const row = {
    user_id: userId,
    first_count: t.first,
    also_count: t.also,
    critical_count: t.bySeverity.critical,
    high_count: t.bySeverity.high,
    medium_count: t.bySeverity.medium,
    low_count: t.bySeverity.low,
    visual_count: t.visual,
    legacy_count: Number(prev?.legacy_count) || 0,
    legacy_since: prev?.legacy_since || null,
    since: t.since || null,
    badge_granted_at: prev?.badge_granted_at || null,
    glitch_granted_at: prev?.glitch_granted_at || null,
    ...patch,
    updated_at: new Date().toISOString(),
  };
  row.level = model.levelFor(model.levelCount(row));
  const { error } = await sb.from("bug_hunter_levels").upsert(row, { onConflict: "user_id" });
  if (error) throw error;
  return { prev, next: row };
}

async function appendThread(sb, feedback, entries, extra = {}) {
  const cur = Array.isArray(feedback.admin_replies) ? feedback.admin_replies : [];
  const replies = [...cur, ...entries];
  const update = { admin_replies: replies, updated_at: new Date().toISOString(), ...extra };
  const { error } = await sb.from("user_feedback").update(update).eq("id", feedback.id);
  if (error) throw error;
  feedback.admin_replies = replies;
  return replies;
}

/**
 * Grant a badge the way the admin badge tools do (source "admin", the admin as actor, an
 * special_badge_grant audit entry); "owned" (already held) is not an error and is not
 * announced again. Returns { granted, owned, rowId, serial }.
 */
async function grantBadge(d, userId, badgeId, actor, note, feedbackId) {
  try {
    const g = await d.specialBadges.grant({ userId, badgeId, actorId: actor?.id || null, note });
    d.audit(actor, "special_badge_grant", userId, { badgeId, serial: g.serial ?? null, via: "bug_hunter", feedbackId });
    return { granted: true, owned: false, rowId: g.rowId || null, serial: g.serial ?? null };
  } catch (err) {
    if (err?.code === "owned") return { granted: false, owned: true };
    return { granted: false, owned: false, error: err?.code || err?.message || "grant_failed" };
  }
}

/** Pay the bonus. Returns { state, amount, balance, skipped }. */
async function payReward(d, { userId, amount, key, meta }) {
  if (!(amount > 0)) return { state: "none", amount: 0 };
  try {
    const res = await d.descoin.credit(userId, amount, "bug_bounty", { ...meta, idempotency_key: key });
    return { state: "paid", amount: Number(res?.credited) || amount, balance: res?.balance ?? null };
  } catch (err) {
    const code = err?.code || err?.message;
    // The ledger's unique key already holds this round: it was paid before (a retry).
    if (code === "23505") return { state: "paid", amount, balance: null, repeat: true };
    if (code === "WALLET_FROZEN") return { state: "none", amount: 0, skipped: "frozen" };
    return { state: "none", amount: 0, skipped: "error" };
  }
}

/** Take the bonus back while it is unspent; else it stays ("kept"). */
async function reverseReward(d, { userId, amount, key, meta }) {
  if (!(amount > 0)) return { state: "none", amount: 0 };
  try {
    const res = await d.descoin.debit(userId, amount, "bug_bounty_revoke", { ...meta, idempotency_key: key });
    return { state: "reversed", amount, balance: res?.balance ?? null };
  } catch (err) {
    const code = err?.code || err?.message;
    if (code === "23505") return { state: "reversed", amount, repeat: true };
    if (code === "INSUFFICIENT_BALANCE") return { state: "kept", amount, why: "spent" };
    if (code === "WALLET_FROZEN") return { state: "kept", amount, why: "frozen" };
    return { state: "kept", amount, why: "error" };
  }
}

function userView(entry) {
  const { adminUsername, ...rest } = entry;
  return rest;
}

/**
 * Confirm a feedback item as a real bug.
 * @param {{ feedbackId: string, body: object, actor: {id, username}, io?: object }} args
 * @returns {Promise<object>} { ok, already?, confirmation, level, badge, reward, ... }
 */
async function confirm({ feedbackId, body, actor, io = null }) {
  const d = deps();
  const sb = d.supabase;
  if (!model.isUuid(String(feedbackId || ""))) throw new BugHuntError("NOT_FOUND", 404);
  const input = model.sanitizeConfirm(body);
  const visual = input.visual === true;
  if (input.error) throw new BugHuntError(input.error, 400);
  if (input.duplicateOf === feedbackId) throw new BugHuntError("BAD_DUPLICATE", 400);

  const feedback = await loadFeedback(sb, feedbackId);
  if (!feedback) throw new BugHuntError("NOT_FOUND", 404);
  if (!feedback.user_id) throw new BugHuntError("NO_REPORTER", 409);
  if (actor?.id && String(feedback.user_id) === String(actor.id)) throw new BugHuntError("SELF_CONFIRM", 409);

  const loaded = await loadConfirmation(sb, feedbackId);
  // A copy: the row is rewritten below and the earlier round's bonus state must stay readable.
  const existing = loaded ? { ...loaded } : null;
  if (existing && model.isLive(existing)) {
    return { ok: true, already: true, confirmation: model.shapeConfirmation(existing) };
  }

  let credit = "first";
  let severity = input.severity;
  let root = null;
  if (input.duplicateOf) {
    root = await loadConfirmation(sb, input.duplicateOf);
    // Links always point at the root: a link to a duplicate follows it one step.
    if (root && root.credit === "also" && root.duplicate_of) root = await loadConfirmation(sb, root.duplicate_of);
    if (!root || !model.isLive(root)) throw new BugHuntError("ROOT_NOT_CONFIRMED", 409);
    if (root.feedback_id === feedbackId) throw new BugHuntError("BAD_DUPLICATE", 400);
    if (String(root.user_id) === String(feedback.user_id)) throw new BugHuntError("SAME_REPORTER", 409);
    credit = "also";
    severity = severity || root.severity;
  }

  const nowIso = d.now().toISOString();
  const round = existing ? (Number(existing.round) || 1) + 1 : 1;
  const fixedNow = feedback.status === "resolved";
  const row = {
    feedback_id: feedbackId,
    user_id: feedback.user_id,
    severity,
    credit,
    duplicate_of: root ? root.feedback_id : null,
    note: input.note,
    visual,
    round,
    reward: 0,
    reward_state: "none",
    reward_key: null,
    level_after: null,
    confirmed_by: actor?.id || null,
    confirmed_at: nowIso,
    undone_at: null,
    undone_by: null,
    undo_reason: null,
    fixed_at: fixedNow ? nowIso : null,
    updated_at: nowIso,
  };

  if (existing) {
    // Re-confirm after an undo: only the caller that flips undone_at back wins.
    const { data, error } = await sb.from("feedback_bug_reports").update(row).eq("feedback_id", feedbackId).not("undone_at", "is", null).select("*").maybeSingle();
    if (error) throw error;
    if (!data) {
      const now = await loadConfirmation(sb, feedbackId);
      return { ok: true, already: true, confirmation: model.shapeConfirmation(now) };
    }
  } else {
    const { error } = await sb.from("feedback_bug_reports").insert({ ...row, created_at: nowIso });
    if (error) {
      if (error.code === "23505") {
        const now = await loadConfirmation(sb, feedbackId);
        return { ok: true, already: true, confirmation: model.shapeConfirmation(now) };
      }
      if (isMissing(error)) throw new BugHuntError("NOT_INSTALLED", 503);
      throw error;
    }
  }

  const userId = String(feedback.user_id);
  const out = { ok: true, already: false, credit, severity, round, steps: {} };

  // Totals, level, badges (#11 for a first credit, #32 too for a visual / UI bug).
  let level = 0, levelBefore = 0, badge = "none", count = 0, glitchGranted = false, badgeGrant = null;
  try {
    const { next } = await recount(sb, userId);
    level = next.level;
    count = model.levelCount(next);
    const counts = credit === "first" || model.ALSO_LEVELS;
    levelBefore = counts ? model.levelFor(count - 1) : level;
    const patch = {};
    if (counts && level >= 1) {
      badgeGrant = await grantBadge(d, userId, model.BADGE_ID, actor, `${model.GRANT_NOTE}:${feedbackId}`, feedbackId);
      if (badgeGrant.granted) {
        badge = "new";
        patch.badge_granted_at = nowIso;
      } else if (badgeGrant.owned) {
        // Already held (an earlier bug, or a promo / hand grant): a level up, or one more bug.
        badge = level > levelBefore && levelBefore >= 1 ? "up" : "more";
      }
    }
    if (credit === "first" && visual) {
      const g = await grantBadge(d, userId, model.GLITCH_BADGE_ID, actor, `${model.GRANT_NOTE}:${feedbackId}`, feedbackId);
      glitchGranted = g.granted;
      if (g.granted) patch.glitch_granted_at = nowIso;
      out.steps.glitch = g.granted ? "granted" : g.owned ? "owned" : g.error || "failed";
      if (g.granted && g.rowId) out.glitchRowId = g.rowId;
    }
    if (Object.keys(patch).length) await sb.from("bug_hunter_levels").update(patch).eq("user_id", userId);
    out.steps.badge = badgeGrant ? (badgeGrant.granted ? "granted" : badgeGrant.owned ? "owned" : badgeGrant.error || "failed") : "none";
  } catch (err) {
    out.steps.badge = "error";
    console.warn("[bug-hunter] level/badge step failed:", err?.message || err);
  }

  // DesCoin: a round whose earlier bonus was kept (spent before an undo) does not pay twice.
  let reward = { state: "none", amount: 0 };
  const carried = existing && existing.reward_state === "kept" && Number(existing.reward) > 0;
  if (carried) {
    reward = { state: "paid", amount: Number(existing.reward), carried: true };
  } else {
    const key = model.rewardKey(feedbackId, round);
    reward = await payReward(d, {
      userId,
      amount: model.rewardFor(credit, severity),
      key,
      meta: { feedbackId, round, severity, credit, by: actor?.id || null },
    });
    reward.key = key;
  }
  out.steps.reward = reward.carried ? "carried" : reward.skipped || reward.state;
  await sb.from("feedback_bug_reports").update({
    reward: reward.amount,
    reward_state: reward.state,
    reward_key: reward.key || existing?.reward_key || null,
    level_after: level,
  }).eq("feedback_id", feedbackId);

  // The sender's thread: the celebration line. A new item moves to "in progress".
  const entry = model.threadEntry({
    event: credit === "also" ? "also" : "confirmed",
    severity,
    level,
    badge,
    count,
    glitch: glitchGranted,
    fixedNow,
    reward: reward.carried ? 0 : reward.amount,
    round,
    adminUsername: actor?.username || null,
    at: nowIso,
  });
  try {
    await appendThread(sb, feedback, [entry], feedback.status === "new" ? { status: "in_progress" } : {});
    out.steps.thread = "ok";
  } catch (err) {
    out.steps.thread = "error";
    console.warn("[bug-hunter] thread line failed:", err?.message || err);
  }

  // Tell the sender: live card (with the badge art), bell list, iOS push. The generic
  // "badge arrived" popup is skipped when the live card reached a socket.
  const online = d.badgeNotify.isOnline ? d.badgeNotify.isOnline(io, userId) : false;
  d.notify.bugHunt(io, userId, {
    feedbackId,
    entry: userView(entry),
    badge: badge === "none" ? null : { id: model.BADGE_ID, level, serial: badgeGrant?.serial ?? null, isNew: badge === "new", glitch: glitchGranted },
    reward: reward.carried ? 0 : reward.amount,
    balance: reward.balance ?? null,
  });
  const fresh = [badgeGrant?.rowId, out.glitchRowId].filter(Boolean);
  delete out.glitchRowId;
  if (online && fresh.length) {
    try { await d.specialBadges.markNotified(userId, fresh); } catch { /* popup on next connect */ }
  } else if (io && d.badgeNotify.deliverPending) {
    // Offline (or the card missed): the deferred popup shows on the next connect.
    void Promise.resolve(d.badgeNotify.deliverPending(io, userId)).catch(() => {});
  }
  if (badge !== "none" || glitchGranted) void Promise.resolve(d.badgeNotify.broadcastProfile?.(io, userId)).catch(() => {});

  d.audit(actor, "feedback_bug_confirm", userId, {
    feedbackId,
    severity,
    credit,
    duplicateOf: root ? root.feedback_id : null,
    round,
    reward: reward.amount,
    rewardState: out.steps.reward,
    level,
    badge,
    visual,
    glitch: glitchGranted,
    ...(input.note ? { note: input.note } : {}),
  });

  out.level = level;
  out.badge = badge;
  out.glitch = glitchGranted;
  out.reward = { amount: reward.amount, state: reward.state, carried: Boolean(reward.carried), skipped: reward.skipped || null };
  out.confirmation = model.shapeConfirmation(await loadConfirmation(sb, feedbackId));
  return out;
}

/**
 * Undo a confirmation (reason required). `audit: false` when the İşlem kaydı console calls
 * it: the console writes its own reverse entry with meta.undoOf.
 */
async function undo({ feedbackId, reason, actor, io = null, audit = true }) {
  const d = deps();
  const sb = d.supabase;
  const why = model.sanitizeReason(reason);
  if (!why) throw new BugHuntError("REASON_REQUIRED", 400);
  if (!model.isUuid(String(feedbackId || ""))) throw new BugHuntError("NOT_FOUND", 404);
  const row = await loadConfirmation(sb, feedbackId);
  if (!row) throw new BugHuntError("NOT_CONFIRMED", 404);
  if (!model.isLive(row)) throw new BugHuntError("ALREADY_UNDONE", 409);
  if (row.credit === "first") {
    const { data: dups } = await sb.from("feedback_bug_reports").select("feedback_id").eq("duplicate_of", feedbackId).is("undone_at", null);
    if (dups && dups.length) throw new BugHuntError("HAS_DUPLICATES", 409, { count: dups.length });
  }
  const nowIso = d.now().toISOString();
  const { data: flipped, error } = await sb.from("feedback_bug_reports")
    .update({ undone_at: nowIso, undone_by: actor?.id || null, undo_reason: why, updated_at: nowIso })
    .eq("feedback_id", feedbackId).is("undone_at", null).select("*").maybeSingle();
  if (error) throw error;
  if (!flipped) throw new BugHuntError("ALREADY_UNDONE", 409);

  const userId = String(row.user_id);
  const out = { ok: true, steps: {} };

  // DesCoin back, only while unspent.
  let reward = { state: row.reward_state || "none", amount: Number(row.reward) || 0 };
  if (row.reward_state === "paid" && Number(row.reward) > 0) {
    reward = await reverseReward(d, {
      userId,
      amount: Number(row.reward),
      key: model.rewardKey(feedbackId, row.round, "revoke"),
      meta: { feedbackId, round: row.round, by: actor?.id || null, reason: why },
    });
  }
  await sb.from("feedback_bug_reports").update({ reward_state: reward.state === "paid" ? "kept" : reward.state }).eq("feedback_id", feedbackId);
  out.reward = { amount: reward.amount, state: reward.state, why: reward.why || null };

  // Totals; take back only badges this feature gave, once nothing is left to hold them up
  // (a promo / hand-granted #11 and the pre-feature history always stay).
  let badgeRevoked = false, glitchRevoked = false, level = 0;
  const takeBack = async (badgeId) => {
    try {
      const r = await d.specialBadges.revoke({ userId, badgeId, actorId: actor?.id || null, reason: why });
      d.audit(actor, "special_badge_revoke", userId, { badgeId, serial: r?.serial ?? null, via: "bug_hunter", feedbackId });
      return true;
    } catch (err) {
      if (err?.code !== "not_owned") console.warn("[bug-hunter] badge revoke failed:", badgeId, err?.code || err?.message || err);
      return false;
    }
  };
  try {
    const { next } = await recount(sb, userId);
    level = next.level;
    const patch = {};
    if (model.levelCount(next) === 0 && next.badge_granted_at) {
      badgeRevoked = await takeBack(model.BADGE_ID);
      patch.badge_granted_at = null;
    }
    if (next.visual_count === 0 && next.glitch_granted_at) {
      glitchRevoked = await takeBack(model.GLITCH_BADGE_ID);
      patch.glitch_granted_at = null;
    }
    if (Object.keys(patch).length) await sb.from("bug_hunter_levels").update(patch).eq("user_id", userId);
  } catch (err) {
    out.steps.level = "error";
    console.warn("[bug-hunter] recount on undo failed:", err?.message || err);
  }

  // Thread: this round's celebration lines are hidden from the sender; admins see the undo.
  try {
    const feedback = await loadFeedback(sb, feedbackId);
    if (feedback) {
      const cur = Array.isArray(feedback.admin_replies) ? feedback.admin_replies : [];
      feedback.admin_replies = cur.map((r) => (r && r.type === "bughunt" && (Number(r.round) || 1) === (Number(row.round) || 1) && r.event !== "fixed" ? { ...r, void: true } : r));
      await appendThread(sb, feedback, [model.undoLine({ adminUsername: actor?.username || null, reason: why, at: nowIso })]);
    }
    out.steps.thread = "ok";
  } catch (err) {
    out.steps.thread = "error";
  }

  if (io) {
    if (badgeRevoked || glitchRevoked) void Promise.resolve(d.badgeNotify.deliverPending?.(io, userId)).catch(() => {});
    void Promise.resolve(d.badgeNotify.broadcastProfile?.(io, userId)).catch(() => {});
  }
  d.notify.bugHuntUndone(io, userId, { feedbackId, balance: reward.balance ?? null, delta: reward.state === "reversed" ? -reward.amount : 0 });

  out.level = level;
  out.badgeRevoked = badgeRevoked;
  out.glitchRevoked = glitchRevoked;
  out.meta = { feedbackId, reason: why, round: row.round, severity: row.severity, credit: row.credit, reward: reward.amount, rewardState: reward.state, keptWhy: reward.why || null, badgeRevoked, glitchRevoked, level };
  if (audit) d.audit(actor, "feedback_bug_undo", userId, out.meta);
  out.confirmation = model.shapeConfirmation(await loadConfirmation(sb, feedbackId));
  return out;
}

/** One confirmation's "Düzeltildi" line + notification (fixed_at is the once-only guard). */
async function markFixed(d, sb, row, io, nowIso) {
  const { data: won } = await sb.from("feedback_bug_reports").update({ fixed_at: nowIso, updated_at: nowIso })
    .eq("feedback_id", row.feedback_id).is("fixed_at", null).is("undone_at", null).select("feedback_id").maybeSingle();
  if (!won) return false;
  const feedback = await loadFeedback(sb, row.feedback_id);
  if (!feedback) return false;
  const entry = model.threadEntry({ event: "fixed", severity: row.severity, round: row.round, at: nowIso });
  await appendThread(sb, feedback, [entry]);
  d.notify.bugHunt(io, String(row.user_id), { feedbackId: row.feedback_id, entry: userView(entry), badge: null, reward: 0, balance: null });
  return feedback;
}

/**
 * The feedback was marked resolved (PATCH status). For a confirmed bug: the sender gets the
 * "Düzeltildi" follow-up once; linked duplicates are resolved too and their senders hear it.
 * Returns { handled } so the route skips its generic "resolved" notification.
 */
async function onResolved({ feedbackId, actor = null, io = null }) {
  const d = deps();
  const sb = d.supabase;
  let row;
  try {
    row = await loadConfirmation(sb, feedbackId);
  } catch {
    return { handled: false };
  }
  if (!row || !model.isLive(row)) return { handled: false };
  const nowIso = d.now().toISOString();
  const out = { handled: true, fixed: false, duplicates: 0 };
  try {
    out.fixed = Boolean(await markFixed(d, sb, row, io, nowIso));
    if (row.credit === "first") {
      const { data: dups } = await sb.from("feedback_bug_reports").select("*").eq("duplicate_of", row.feedback_id).is("undone_at", null);
      for (const dup of dups || []) {
        const fb = await markFixed(d, sb, dup, io, nowIso);
        if (!fb) continue;
        out.duplicates += 1;
        if (fb.status === "new" || fb.status === "in_progress") {
          const { put } = require("../botText");
          const who = actor?.username || "admin";
          const line = put({ id: Math.random().toString(36).slice(2, 12), type: "system", status: "resolved", adminUsername: who, created_at: nowIso }, "text", "bot.feedback.statusChanged", { who, status: { key: "bot.feedback.status.resolved" } });
          await appendThread(sb, fb, [line], { status: "resolved" });
        }
      }
    }
    if (out.fixed || out.duplicates) d.audit(actor, "feedback_bug_fixed", String(row.user_id), { feedbackId: row.feedback_id, duplicates: out.duplicates });
  } catch (err) {
    console.warn("[bug-hunter] fixed follow-up failed:", err?.message || err);
  }
  return out;
}

/** Map userId -> badge stats (level, bugs, also, critical, since) for profile payloads. */
async function levelsFor(userIds) {
  const ids = [...new Set((userIds || []).map(String).filter(model.isUuid))];
  const out = new Map();
  if (!ids.length) return out;
  try {
    const { data, error } = await deps().supabase.from("bug_hunter_levels").select("*").in("user_id", ids);
    if (error) return out;
    for (const r of data || []) out.set(String(r.user_id), model.badgeStats(r));
  } catch {
    /* tolerant: profiles keep working before the migration */
  }
  return out;
}

/** Admin workspace: every confirmation (newest first), leaderboard, totals, rules. */
async function workspace({ limit = 5000 } = {}) {
  const sb = deps().supabase;
  const { data, error } = await sb.from("feedback_bug_reports").select("*").order("confirmed_at", { ascending: false }).limit(Math.max(1, Math.min(10000, limit)));
  if (error) {
    if (isMissing(error)) return { installed: false, confirmations: [], leaderboard: [], people: {}, totals: model.totals([]), rules: rules() };
    throw error;
  }
  const rows = data || [];
  const live = rows.filter(model.isLive);
  const levels = new Map();
  const { data: lv } = await sb.from("bug_hunter_levels").select("*").limit(5000);
  for (const r of lv || []) levels.set(String(r.user_id), r);
  const userIds = [...new Set([...live.map((r) => String(r.user_id)), ...[...levels.keys()]].filter(Boolean))];
  const users = new Map();
  for (let i = 0; i < userIds.length; i += 200) {
    const { data: us } = await sb.from("users").select("id, username, display_name, avatar_url").in("id", userIds.slice(i, i + 200));
    for (const u of us || []) users.set(String(u.id), u);
  }
  return {
    installed: true,
    confirmations: rows.map(model.shapeConfirmation),
    leaderboard: model.leaderboard(live, users, { limit: 10, levels }),
    // Per reporter (for the confirm panel's "what happens" line): level, bugs, also, badge history.
    people: Object.fromEntries([...levels.entries()].map(([uid, r]) => [uid, model.badgeStats(r)])),
    totals: model.totals(rows),
    rules: rules(),
  };
}

function rules() {
  return { tiers: model.TIERS, rewards: model.REWARDS, alsoLevels: model.ALSO_LEVELS };
}

function __setDepsForTests(x) {
  override = x;
}

module.exports = { BugHuntError, confirm, undo, onResolved, levelsFor, workspace, rules, __setDepsForTests };
