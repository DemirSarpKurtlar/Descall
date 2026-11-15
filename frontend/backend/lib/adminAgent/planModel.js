"use strict";

/**
 * Admin agent, phase 2: the pure part of plans (no database, no sockets).
 *  - SCOPES: what the owner can switch on or off for the agent, with per-plan / per-day limits.
 *  - ACTIONS: every action a plan item can carry, the scope and panel section it needs,
 *    whether it is punitive (auto-excludes admins and, by default, Descall+ members)
 *    and whether it can be undone inside the 30-minute window.
 *  - normalizeProposal: the model's propose_plan input, validated and clipped.
 *  - evaluateItems: the dry run (what would happen to each item, and why).
 *  - diffPlans: what changed between two versions of a plan.
 * Tested by backend/test/adminAgentPlans.unit.test.cjs.
 */

const UNDO_WINDOW_MS = 30 * 60 * 1000;
const STEP_INTERVAL_MS = 1000; // "saniyede 1 işlem sınırı"
const FRESH_STEP_UP_MS = 2 * 60 * 1000;
const MAX_ITEMS = 200;

const SCOPES = Object.freeze([
  { id: "read", defaultOn: true },
  { id: "moderation", defaultOn: true, limit: { kind: "perPlan", value: 50, max: 500 } },
  { id: "wallet", defaultOn: true, limit: { kind: "perDay", value: 100000, max: 10000000 } },
  { id: "announcements", defaultOn: false },
  { id: "livepopup", defaultOn: false },
  { id: "shop", defaultOn: false, limit: { kind: "perPlan", value: 20, max: 500 } },
  { id: "badges", defaultOn: true, limit: { kind: "perPlan", value: 20, max: 500 } },
  { id: "dm", defaultOn: false },
]);
const SCOPE_IDS = SCOPES.map((s) => s.id);

const BAN_PRESETS = ["24h", "3d", "7d", "30d", "90d", "365d", "permanent"];
const TIMEOUT_PRESETS = ["5m", "15m", "30m", "1h", "6h", "12h", "24h", "3d", "7d", "14d", "30d"];

/**
 * scope: agent scope that must be on. section: panel section the approving admin must hold
 * (the same one the human route checks). target: "user" | "none" | "optional".
 */
const ACTIONS = Object.freeze({
  ban: { scope: "moderation", section: "moderation", target: "user", punitive: true, undoable: true },
  timeout: { scope: "moderation", section: "moderation", target: "user", punitive: true, undoable: true },
  kick: { scope: "moderation", section: "moderation", target: "user", punitive: true, undoable: false },
  revoke_sessions: { scope: "moderation", section: "people", target: "user", punitive: true, undoable: false },
  unban: { scope: "moderation", section: "moderation", target: "user", punitive: false, undoable: false },
  untimeout: { scope: "moderation", section: "moderation", target: "user", punitive: false, undoable: false },
  wallet_freeze: { scope: "wallet", section: "people", target: "user", punitive: true, undoable: true },
  wallet_unfreeze: { scope: "wallet", section: "people", target: "user", punitive: false, undoable: true },
  descoin_grant: { scope: "wallet", section: "casino", target: "user", punitive: false, undoable: true },
  badge_grant: { scope: "badges", section: "specialBadges", target: "user", punitive: false, undoable: true },
  badge_revoke: { scope: "badges", section: "specialBadges", target: "user", punitive: true, undoable: false },
  shop_gift: { scope: "shop", section: "casino", target: "user", punitive: false, undoable: false },
  announcement: { scope: "announcements", section: "announcements", target: "none", punitive: false, undoable: true },
  live_popup: { scope: "livepopup", section: "livepopup", target: "optional", punitive: false, undoable: false },
});
const ACTION_IDS = Object.keys(ACTIONS);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v) => UUID.test(String(v || ""));

function clip(value, max) {
  if (value === undefined || value === null) return "";
  return String(value).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim().slice(0, max);
}
function bool(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "string") return !["false", "0", "no", "off"].includes(value.toLowerCase());
  return Boolean(value);
}
function intIn(value, min, max) {
  const n = Math.round(Number(value));
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
}

class PlanError extends Error {
  constructor(code, message) {
    super(message || code);
    this.code = code;
  }
}

/* ---------------- scopes ---------------- */

/** Stored scopes json -> full map { id: { on, limit } } with defaults for anything missing. */
function normalizeScopes(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  const out = {};
  for (const s of SCOPES) {
    const r = src[s.id] && typeof src[s.id] === "object" ? src[s.id] : {};
    const entry = { on: bool(r.on, s.defaultOn) };
    if (s.limit) {
      const v = intIn(r.limit, 1, s.limit.max);
      entry.limit = v == null ? s.limit.value : v;
      entry.limitKind = s.limit.kind;
    }
    out[s.id] = entry;
  }
  return out;
}

function scopeOnCount(scopes) {
  const n = normalizeScopes(scopes);
  return SCOPE_IDS.filter((id) => n[id].on).length;
}

/** Owner's patch { scopes?: {id: {on?, limit?}}, require2faEach?, ownerApprovalPermanent?, excludePremium? }. */
function applyScopePatch(current, patch) {
  const scopes = normalizeScopes(current.scopes);
  const p = patch && typeof patch === "object" ? patch : {};
  if (p.scopes && typeof p.scopes === "object") {
    for (const id of SCOPE_IDS) {
      const r = p.scopes[id];
      if (!r || typeof r !== "object") continue;
      if (r.on !== undefined) scopes[id].on = bool(r.on, scopes[id].on);
      if (r.limit !== undefined && scopes[id].limit !== undefined) {
        const def = SCOPES.find((s) => s.id === id).limit;
        const v = intIn(r.limit, 1, def.max);
        if (v == null) throw new PlanError("BAD_LIMIT", `Limit for ${id} must be between 1 and ${def.max}.`);
        scopes[id].limit = v;
      }
    }
  }
  return {
    scopes,
    require_2fa_each: p.require2faEach === undefined ? current.require_2fa_each !== false : Boolean(p.require2faEach),
    owner_approval_permanent: p.ownerApprovalPermanent === undefined ? current.owner_approval_permanent !== false : Boolean(p.ownerApprovalPermanent),
    exclude_premium: p.excludePremium === undefined ? current.exclude_premium !== false : Boolean(p.excludePremium),
  };
}

/* ---------------- params ---------------- */

function moderationBase(raw) {
  const category = clip(raw.category, 40).toLowerCase().replace(/[^a-z_]/g, "") || "other";
  const out = { category };
  const otherText = clip(raw.otherText ?? raw.reason, 200);
  if (category === "other" && otherText) out.otherText = otherText;
  const message = clip(raw.message, 500);
  if (message) out.message = message;
  return out;
}

/** Validated params for one action; throws PlanError BAD_PARAMS. */
function normalizeParams(action, raw) {
  const p = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const bad = (msg) => { throw new PlanError("BAD_PARAMS", `${action}: ${msg}`); };
  switch (action) {
    case "ban": {
      const out = moderationBase(p);
      const secs = intIn(p.durationSeconds, 60, 10 * 365 * 86400);
      if (secs) out.durationSeconds = secs;
      else out.presetId = BAN_PRESETS.includes(p.presetId) ? p.presetId : "7d";
      out.revokeSessions = bool(p.revokeSessions, true);
      out.notifyEmail = bool(p.notifyEmail, true);
      out.alsoAccessBan = bool(p.alsoAccessBan, false);
      return out;
    }
    case "timeout": {
      const out = moderationBase(p);
      const secs = intIn(p.durationSeconds, 60, 30 * 86400);
      if (secs) out.durationSeconds = secs;
      else out.presetId = TIMEOUT_PRESETS.includes(p.presetId) ? p.presetId : "24h";
      out.notify = bool(p.notify, true);
      return out;
    }
    case "kick":
      return moderationBase(p);
    case "revoke_sessions":
      return {};
    case "unban":
    case "untimeout":
      return clip(p.note, 300) ? { note: clip(p.note, 300) } : {};
    case "wallet_freeze":
    case "wallet_unfreeze":
      return clip(p.reason, 300) ? { reason: clip(p.reason, 300) } : {};
    case "descoin_grant": {
      const amount = intIn(p.amount, -1000000, 1000000);
      if (!amount) bad("amount must be a non-zero whole number up to 1,000,000.");
      const out = { amount };
      if (clip(p.reason, 200)) out.reason = clip(p.reason, 200);
      if (clip(p.message, 300)) out.message = clip(p.message, 300);
      return out;
    }
    case "badge_grant":
    case "badge_revoke": {
      const badgeId = clip(p.badgeId, 64);
      if (!/^[A-Za-z0-9_\-]{1,64}$/.test(badgeId)) bad("badgeId is required.");
      const out = { badgeId };
      const note = clip(p.note ?? p.reason, 280);
      if (note) out[action === "badge_grant" ? "note" : "reason"] = note;
      return out;
    }
    case "shop_gift": {
      const itemId = clip(p.itemId, 80);
      if (!/^[A-Za-z0-9_\-:.]{1,80}$/.test(itemId)) bad("itemId is required.");
      const out = { itemId };
      if (clip(p.message, 300)) out.message = clip(p.message, 300);
      return out;
    }
    case "announcement": {
      const title = clip(p.title, 120);
      const content = clip(p.content, 2000);
      if (!title || !content) bad("title and content are required.");
      return { title, content, priority: ["normal", "high", "urgent"].includes(p.priority) ? p.priority : "normal", pinned: bool(p.pinned, false) };
    }
    case "live_popup": {
      const title = clip(p.title, 80);
      const body = clip(p.body, 600);
      if (!title || !body) bad("title and body are required.");
      const out = { title, body, severity: ["info", "success", "warning", "urgent"].includes(p.severity) ? p.severity : "info" };
      if (p.audience === "visible") out.audience = "visible";
      return out;
    }
    default:
      return bad("unknown action.");
  }
}

/* ---------------- evidence ---------------- */

const TONES = new Set(["hot", "warn", "info"]);
const tone = (v) => (TONES.has(v) ? v : "info");

function normalizeEvidence(raw) {
  const e = raw && typeof raw === "object" ? raw : {};
  const list = (v, n) => (Array.isArray(v) ? v.slice(0, n) : []);
  const out = {
    signals: list(e.signals, 6).map((s) => ({ label: clip(s?.label ?? s, 60), tone: tone(s?.tone) })).filter((s) => s.label),
    reason: clip(e.reason, 800),
    quote: clip(e.quote, 300),
    stats: list(e.stats, 6).map((s) => ({ label: clip(s?.label, 40), value: clip(s?.value, 40) })).filter((s) => s.label),
    links: list(e.links, 6)
      .map((l) => ({
        username: clip(l?.username, 40).replace(/^@/, ""),
        userId: isUuid(l?.userId) ? String(l.userId) : null,
        relation: clip(l?.relation, 40),
        tone: tone(l?.tone),
        note: clip(l?.note, 60),
      }))
      .filter((l) => l.username),
  };
  return out;
}

/**
 * The model's propose_plan input -> { title, summary, suggestions, revisesPlanId, items[] }.
 * Items with an unknown action, a missing target or bad params are dropped and reported in
 * `rejected` (the model sees them in the tool result). Duplicate (action, target) pairs keep the first.
 */
function normalizeProposal(input) {
  const src = input && typeof input === "object" ? input : {};
  const title = clip(src.title, 120);
  if (!title) throw new PlanError("BAD_PLAN", "title is required.");
  const rawItems = Array.isArray(src.items) ? src.items : [];
  if (!rawItems.length) throw new PlanError("BAD_PLAN", "items must list at least one action.");
  if (rawItems.length > MAX_ITEMS) throw new PlanError("BAD_PLAN", `A plan holds at most ${MAX_ITEMS} items.`);
  const items = [];
  const rejected = [];
  const seen = new Set();
  rawItems.forEach((raw, i) => {
    const action = String(raw?.action || "");
    const def = ACTIONS[action];
    if (!def) return rejected.push({ index: i, problem: `unknown action "${action}"` });
    const userId = raw?.userId ? String(raw.userId) : null;
    if (def.target === "user" && !isUuid(userId)) return rejected.push({ index: i, problem: "userId (uuid) is required" });
    if (def.target === "none" && userId) return rejected.push({ index: i, problem: `${action} takes no userId` });
    if (userId && !isUuid(userId)) return rejected.push({ index: i, problem: "userId must be a uuid" });
    let params;
    try {
      params = normalizeParams(action, raw?.params);
    } catch (err) {
      return rejected.push({ index: i, problem: err.message });
    }
    const key = itemKey({ action, target_user_id: userId, params });
    if (seen.has(key)) return rejected.push({ index: i, problem: "duplicate item" });
    seen.add(key);
    items.push({
      action,
      target_user_id: userId,
      params,
      risk: intIn(raw?.risk, 0, 100),
      cluster: clip(raw?.cluster, 60) || null,
      evidence: normalizeEvidence(raw?.evidence || raw),
    });
  });
  if (!items.length) throw new PlanError("BAD_PLAN", `No valid items: ${rejected.map((r) => r.problem).join("; ")}`);
  return {
    title,
    summary: clip(src.summary, 1200) || null,
    suggestions: (Array.isArray(src.suggestions) ? src.suggestions : []).map((s) => clip(s, 80)).filter(Boolean).slice(0, 3),
    revisesPlanId: isUuid(src.revisesPlanId) ? String(src.revisesPlanId) : null,
    items,
    rejected,
  };
}

/* ---------------- grouping and diff ---------------- */

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${stable(value[k])}`).join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

/** Items with the same action and the same params form one group ("Yasakla · Spam · 30 gün"). */
function groupKey(item) {
  return `${item.action}|${stable(item.params || {})}`;
}

/** Identity of an item across versions: the target for user actions, else the action + params. */
function itemKey(item) {
  if (item.target_user_id) return `${item.action}:u:${item.target_user_id}`;
  return `${item.action}:x:${stable(item.params || {})}`;
}

function targetKey(item) {
  return item.target_user_id ? `u:${item.target_user_id}` : `x:${item.action}|${stable(item.params || {})}`;
}

/**
 * What changed from `prev` to `next` (both lists of items). Matched by target; a matched
 * pair with a different action or params is "changed".
 */
function diffPlans(prev, next) {
  const out = { added: [], removed: [], changed: [] };
  const brief = (i) => ({ username: i.target_username || null, userId: i.target_user_id || null, action: i.action, params: i.params || {} });
  const before = [...(prev || [])];
  const after = [...(next || [])];
  const usedB = new Set();
  const pending = [];
  // 1. Same action on the same target: changed only when the params differ.
  for (const i of after) {
    const j = before.findIndex((o, idx) => !usedB.has(idx) && itemKey(o) === itemKey(i));
    if (j < 0) { pending.push(i); continue; }
    usedB.add(j);
    const old = before[j];
    if (stable(old.params || {}) !== stable(i.params || {})) out.changed.push({ ...brief(i), from: { action: old.action, params: old.params || {} } });
  }
  // 2. Another action on the same target ("yasak -> sustur").
  for (const i of pending) {
    const j = i.target_user_id ? before.findIndex((o, idx) => !usedB.has(idx) && targetKey(o) === targetKey(i)) : -1;
    if (j < 0) { out.added.push(brief(i)); continue; }
    usedB.add(j);
    out.changed.push({ ...brief(i), from: { action: before[j].action, params: before[j].params || {} } });
  }
  before.forEach((o, idx) => { if (!usedB.has(idx)) out.removed.push(brief(o)); });
  return out;
}

/* ---------------- dry run ---------------- */

const isPermanentBan = (item) => item.action === "ban" && !item.params?.durationSeconds && (item.params?.presetId || "7d") === "permanent";

/**
 * Exclusion that applies before anything else (shown in "Otomatik çıkarılanlar").
 * @returns {string|null} reason code
 */
function autoExclusion(item, target, { actorId, excludePremium = true } = {}) {
  const def = ACTIONS[item.action];
  if (!def || !item.target_user_id) return null;
  if (!target || !target.exists) return "not_found";
  if (String(item.target_user_id) === String(actorId || "")) return "self";
  if (def.punitive && (target.isAdmin || target.isOwner)) return "protected";
  if (def.punitive && excludePremium && target.premium) return "premium";
  return null;
}

/**
 * Dry run of the selected items, in order.
 * @param {object[]} items plan items (selected ones are evaluated; others get "unselected")
 * @param {object} ctx
 * @param {Map<string, object>} ctx.targets  id -> { exists, isAdmin, isOwner, premium, banned, timedOut, frozen }
 * @param {object} ctx.scopes normalized scopes
 * @param {string[]} ctx.sections the approving admin's sections
 * @param {string} ctx.actorId
 * @param {boolean} ctx.isOwner
 * @param {object} ctx.policy { owner_approval_permanent, exclude_premium }
 * @param {number} [ctx.walletUsedToday] DesCoin already granted by the agent today (UTC)
 * @returns {{ items: {id, verdict, code}[], summary: {apply, warn, skip, block, total} }}
 */
function evaluateItems(items, ctx) {
  const scopes = normalizeScopes(ctx.scopes);
  const sections = new Set(ctx.sections || []);
  const policy = ctx.policy || {};
  const perPlan = {};
  let walletLeft = Math.max(0, (scopes.wallet.limit || 0) - (Number(ctx.walletUsedToday) || 0));
  const out = [];
  for (const item of items) {
    const res = { id: item.id, verdict: "ok", code: null };
    const def = ACTIONS[item.action];
    const target = item.target_user_id ? ctx.targets?.get(String(item.target_user_id)) : null;
    const set = (verdict, code) => { res.verdict = verdict; res.code = code; };
    if (!item.selected) set("unselected", null);
    else if (!def) set("block", "unknown_action");
    else {
      const excl = autoExclusion(item, target, { actorId: ctx.actorId, excludePremium: policy.exclude_premium !== false });
      if (excl) set("skip", excl);
      else if (!scopes[def.scope]?.on) set("block", "scope_off");
      else if (!sections.has(def.section)) set("block", "no_section");
      else if (isPermanentBan(item) && policy.owner_approval_permanent !== false && !ctx.isOwner) set("block", "owner_approval");
      else {
        const lim = scopes[def.scope];
        if (lim?.limitKind === "perPlan") {
          perPlan[def.scope] = (perPlan[def.scope] || 0) + 1;
          if (perPlan[def.scope] > lim.limit) set("block", "limit_plan");
        }
        if (res.verdict === "ok" && item.action === "descoin_grant" && Number(item.params?.amount) > 0) {
          const amount = Number(item.params.amount);
          if (amount > walletLeft) set("block", "limit_day");
          else walletLeft -= amount;
        }
        if (res.verdict === "ok" && target) {
          if (item.action === "ban" && target.banned) set("skip", "already_banned");
          else if (item.action === "unban" && !target.banned) set("skip", "not_banned");
          else if (item.action === "untimeout" && !target.timedOut) set("skip", "not_timed_out");
          else if (item.action === "wallet_freeze" && target.frozen) set("skip", "already_frozen");
          else if (item.action === "wallet_unfreeze" && !target.frozen) set("skip", "not_frozen");
          else if (item.action === "timeout" && target.timedOut) set("warn", "extends_timeout");
          else if (item.action === "timeout" && target.banned) set("warn", "already_banned");
          else if (isPermanentBan(item)) set("warn", "permanent");
          else if (def.punitive && target.premium) set("warn", "premium");
        } else if (res.verdict === "ok" && (item.action === "announcement" || (item.action === "live_popup" && !item.target_user_id))) {
          set("warn", "everyone");
        }
      }
    }
    out.push(res);
  }
  const summary = { apply: 0, warn: 0, skip: 0, block: 0, total: 0 };
  for (const r of out) {
    if (r.verdict === "unselected") continue;
    summary.total += 1;
    if (r.verdict === "ok") summary.apply += 1;
    else summary[r.verdict] += 1;
  }
  return { items: out, summary };
}

/* ---------------- execution helpers ---------------- */

/** Plan statuses an admin may still approve / edit. */
const OPEN_STATUSES = new Set(["proposed"]);
const LIVE_STATUSES = new Set(["running", "paused", "scheduled"]);

function canUndoItem(plan, item, now = Date.now()) {
  if (!item || item.status !== "done" || !item.undo) return false;
  if (!ACTIONS[item.action]?.undoable) return false;
  const until = plan?.undo_until ? Date.parse(plan.undo_until) : 0;
  return until > now;
}

/** Counts for the queue header (Tamamlandı / Atlandı / Sürüyor / Sırada). */
function queueCounts(items) {
  const c = { done: 0, skipped: 0, failed: 0, running: 0, queued: 0, undone: 0, cancelled: 0, total: 0 };
  for (const i of items || []) {
    if (i.status === "proposed" || i.status === "excluded") continue;
    c.total += 1;
    if (i.status === "done") c.done += 1;
    else if (i.status === "skipped") c.skipped += 1;
    else if (i.status === "failed" || i.status === "undo_failed") c.failed += 1;
    else if (i.status === "running") c.running += 1;
    else if (i.status === "queued") c.queued += 1;
    else if (i.status === "undone") c.undone += 1;
    else if (i.status === "cancelled") c.cancelled += 1;
  }
  return c;
}

/** Whether a step-up token (decoded JWT) is fresh enough for an approval. */
function stepUpFresh(decoded, now = Date.now()) {
  const iat = Number(decoded?.iat || 0) * 1000;
  return Boolean(decoded?.stepUp) && iat > 0 && now - iat <= FRESH_STEP_UP_MS;
}

/* ---------------- scheduled tasks ---------------- */

const EVERY = ["hourly", "every6h", "daily", "weekly"];

/**
 * Next run after `from` (UTC instant) for a task, computed in Europe/Istanbul (UTC+3, no DST).
 * atMinute = minutes after local midnight (daily / weekly) or after the hour (hourly / every6h).
 */
function nextRunAt({ every, atMinute = 0, weekday = null }, from = Date.now()) {
  const OFFSET = 3 * 3600 * 1000;
  const local = new Date(from + OFFSET);
  const m = Math.max(0, Math.min(1439, Number(atMinute) || 0));
  const start = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  const candidates = [];
  if (every === "hourly" || every === "every6h") {
    const minute = m % 60;
    const step = every === "hourly" ? 1 : 6;
    for (let h = 0; h < 48; h += step) candidates.push(start + h * 3600000 + minute * 60000);
  } else if (every === "weekly") {
    const wd = Number.isInteger(weekday) ? weekday : 1;
    for (let d = 0; d < 15; d += 1) {
      const day = start + d * 86400000;
      if (new Date(day).getUTCDay() === wd) candidates.push(day + m * 60000);
    }
  } else {
    for (let d = 0; d < 3; d += 1) candidates.push(start + d * 86400000 + m * 60000);
  }
  const next = candidates.map((t) => t - OFFSET).find((t) => t > from + 1000);
  return new Date(next ?? from + 86400000).toISOString();
}

function normalizeTask(raw) {
  const p = raw && typeof raw === "object" ? raw : {};
  const title = clip(p.title, 80);
  const prompt = clip(p.prompt, 2000);
  if (!title || !prompt) throw new PlanError("BAD_TASK", "title and prompt are required.");
  const every = EVERY.includes(p.every) ? p.every : "daily";
  const atMinute = intIn(p.atMinute, 0, 1439) ?? 9 * 60;
  const weekday = every === "weekly" ? intIn(p.weekday, 0, 6) ?? 1 : null;
  return { title, prompt, every, at_minute: atMinute, weekday };
}

module.exports = {
  UNDO_WINDOW_MS,
  STEP_INTERVAL_MS,
  FRESH_STEP_UP_MS,
  MAX_ITEMS,
  SCOPES,
  SCOPE_IDS,
  ACTIONS,
  ACTION_IDS,
  BAN_PRESETS,
  TIMEOUT_PRESETS,
  OPEN_STATUSES,
  LIVE_STATUSES,
  EVERY,
  PlanError,
  isUuid,
  clip,
  normalizeScopes,
  scopeOnCount,
  applyScopePatch,
  normalizeParams,
  normalizeEvidence,
  normalizeProposal,
  groupKey,
  itemKey,
  diffPlans,
  isPermanentBan,
  autoExclusion,
  evaluateItems,
  canUndoItem,
  queueCounts,
  stepUpFresh,
  nextRunAt,
  normalizeTask,
};
