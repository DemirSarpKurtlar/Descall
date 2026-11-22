"use strict";

/**
 * İşlem kaydı (admin audit console, owner pick Draft B "Konsol", Nov 2026): pure
 * helpers shared by routes/adminAuditConsole.js and the tests.
 *
 *  - classify(code): category + severity for every action code (catalog, then
 *    prefix rules, then a generic fallback), plus which codes can be undone.
 *  - parseFilter / matchesFilter: the server-side filters (actor, category,
 *    action, target, date range, severity, source, full text). The database
 *    narrows what it can; every row still passes matchesFilter.
 *  - mergeEntries: one row per real action. A moderation_actions row is folded
 *    into its admin_audit twin (same actor, target and action within 5 s);
 *    the same actor + action + target within 2 s merges ("3 kayıt
 *    birleştirildi"); a burst of agent tool calls becomes one "agent_run" row.
 *  - detectAnomalies: rule windows per admin (e.g. more than 5 bans in 60 s)
 *    with the admin's usual hourly rate for the same action.
 *  - summarize: KPI tiles, the hourly chart, the 7-day leaderboard.
 *  - toCsv: the export file.
 */

const CATEGORIES = Object.freeze(["sanctions", "content", "account", "economy", "system", "agent", "denied", "other"]);
const SEVERITIES = Object.freeze(["critical", "high", "medium", "low"]);
const SEV_RANK = { critical: 4, high: 3, medium: 2, low: 1 };

// code -> [category, severity]
const CATALOG = {
  // Yaptırımlar
  ban: ["sanctions", "critical"],
  unban: ["sanctions", "high"],
  timeout: ["sanctions", "high"],
  untimeout: ["sanctions", "medium"],
  kick: ["sanctions", "high"],
  ban_extend: ["sanctions", "high"],
  timeout_extend: ["sanctions", "medium"],
  force_status: ["sanctions", "medium"],
  bulk: ["sanctions", "high"],
  access_ban: ["sanctions", "critical"],
  access_unban: ["sanctions", "high"],
  appeal_accept: ["sanctions", "medium"],
  appeal_reject: ["sanctions", "low"],
  report_dismiss: ["sanctions", "low"],
  report_assign: ["sanctions", "low"],
  report_unassign: ["sanctions", "low"],
  report_note: ["sanctions", "low"],
  sanction_message_edit: ["sanctions", "low"],
  mod_template_create: ["sanctions", "low"],
  mod_template_delete: ["sanctions", "low"],
  mod_rule_create: ["sanctions", "medium"],
  mod_rule_update: ["sanctions", "medium"],
  mod_rule_delete: ["sanctions", "medium"],
  moderation_history_export: ["sanctions", "medium"],
  disconnect_all: ["sanctions", "critical"],
  // İçerik ve inceleme
  message_delete: ["content", "medium"],
  message_edit: ["content", "medium"],
  message_flag: ["content", "low"],
  purge_user_messages: ["content", "critical"],
  reactions_clear: ["content", "low"],
  dm_view: ["content", "high"],
  dm_block: ["content", "medium"],
  dm_unblock: ["content", "medium"],
  dm_conv_delete: ["content", "high"],
  dm_msg_delete: ["content", "medium"],
  group_view: ["content", "high"],
  group_msg_delete: ["content", "medium"],
  server_channel_view: ["content", "high"],
  server_msg_delete: ["content", "medium"],
  server_directory_hide: ["content", "medium"],
  server_directory_show: ["content", "low"],
  server_invite_delete: ["content", "medium"],
  server_invites_revoke: ["content", "medium"],
  server_invites_resume: ["content", "medium"],
  server_delete: ["content", "critical"],
  flagged_context_view: ["content", "high"],
  broadcast: ["content", "high"],
  live_popup: ["content", "medium"],
  announcement_create: ["content", "medium"],
  announcement_delete: ["content", "medium"],
  profanity_add: ["content", "low"],
  profanity_update: ["content", "low"],
  profanity_remove: ["content", "low"],
  // Hesap ve yetki
  user_create: ["account", "medium"],
  user_delete: ["account", "critical"],
  make_admin: ["account", "critical"],
  remove_admin: ["account", "critical"],
  admin_permissions: ["account", "critical"],
  user_lens: ["account", "medium"],
  data_export: ["account", "high"],
  revoke_session: ["account", "high"],
  revoke_sessions: ["account", "high"],
  user_note_add: ["account", "low"],
  user_note_delete: ["account", "low"],
  feedback_status: ["content", "low"],
  feedback_priority: ["content", "low"],
  feedback_reply: ["content", "low"],
  feedback_note: ["content", "low"],
  feedback_delete: ["content", "medium"],
  "2fa_totp_enabled": ["account", "medium"],
  "2fa_recovery_regenerated": ["account", "medium"],
  // Ekonomi ve Descall+
  descoin_grant: ["economy", "high"],
  descoin_reconcile_run: ["economy", "medium"],
  descoin_reconcile_fix: ["economy", "high"],
  wallet_freeze: ["economy", "high"],
  wallet_unfreeze: ["economy", "medium"],
  credits_update: ["economy", "medium"],
  credits_reset: ["economy", "high"],
  shop_gift: ["economy", "medium"],
  shop_gift_undo: ["economy", "medium"],
  premium_grant: ["economy", "high"],
  premium_cancel: ["economy", "high"],
  premium_set_unlimited: ["economy", "high"],
  premium_bulk: ["economy", "critical"],
  premium_plan_update: ["economy", "high"],
  premium_denied: ["denied", "high"],
  special_badge_grant: ["economy", "medium"],
  special_badge_revoke: ["economy", "medium"],
  // Sistem
  system_config: ["system", "high"],
  chat_freeze: ["system", "critical"],
  slowmode: ["system", "medium"],
  maintenance: ["system", "critical"],
  server_restart: ["system", "critical"],
  audit_export: ["system", "medium"],
  audit_rules_update: ["system", "high"],
  audit_review: ["system", "medium"],
  audit_suspend_request: ["system", "high"],
  audit_note_add: ["system", "low"],
  audit_view_create: ["system", "low"],
  audit_view_delete: ["system", "low"],
  access_denied: ["denied", "high"],
  // Yönetim ajanı
  agent_tool: ["agent", "low"],
  agent_run: ["agent", "low"],
  agent_settings: ["agent", "high"],
  agent_scopes: ["agent", "high"],
  agent_plan_approve: ["agent", "high"],
  agent_plan_run: ["agent", "high"],
  agent_plan_undo: ["agent", "high"],
  // Güvenlik Merkezi / Sistem (Nov 2026 remakes)
  security_lock_start: ["system", "critical"],
  security_lock_extend: ["system", "high"],
  security_lock_lift: ["system", "high"],
  security_lock_expired: ["system", "medium"],
  security_remind_2fa: ["account", "medium"],
  security_settings: ["system", "high"],
  security_settings_revert: ["system", "high"],
  system_flag: ["system", "high"],
  system_flag_try: ["system", "medium"],
  system_flag_rollback: ["system", "high"],
  system_flag_auto_rollback: ["system", "high"],
  system_flag_restore: ["system", "high"],
  system_limits: ["system", "high"],
  system_limits_reset: ["system", "high"],
  system_switch: ["system", "critical"],
  system_undo: ["system", "high"],
  system_broadcast: ["system", "high"],
  system_backup: ["system", "medium"],
  system_restart: ["system", "critical"],
  system_restart_exit: ["system", "high"],
  // Hybrid server: the PC node fetched the shared environment (service role key included).
  system_node_bootstrap: ["system", "critical"],
  system_node_key_bootstrap_open: ["system", "high"],
  system_node_key_bootstrap_close: ["system", "medium"],
  announcement_publish: ["content", "high"],
  credit_transfers_off: ["economy", "medium"],
  credit_transfers_on: ["economy", "medium"],
  game_limits_set: ["economy", "medium"],
  shop2_direct_sale: ["economy", "medium"],
};

// Prefix rules for codes built at runtime (premium_${kind}, antibot_${action}, error_${status}, ...).
const PREFIXES = [
  ["agent_", "agent", "medium"],
  ["premium_", "economy", "medium"],
  ["shop_", "economy", "low"],
  ["shop2_", "economy", "low"],
  ["descoin_", "economy", "medium"],
  ["credit", "economy", "medium"],
  ["casino_", "economy", "low"],
  ["game_", "economy", "medium"],
  ["leaderboard_", "economy", "low"],
  ["special_badge", "economy", "medium"],
  ["wallet_", "economy", "high"],
  ["antibot_", "sanctions", "medium"],
  ["mod_", "sanctions", "low"],
  ["moddesk_", "sanctions", "medium"],
  ["moderation_", "sanctions", "medium"],
  ["report_", "sanctions", "low"],
  ["appeal_", "sanctions", "medium"],
  ["access_", "sanctions", "high"],
  ["live_popup", "content", "medium"],
  ["popup_", "content", "medium"],
  ["announcement_", "content", "medium"],
  ["flagged_", "content", "medium"],
  ["server_", "content", "medium"],
  ["dm_", "content", "high"],
  ["group_", "content", "medium"],
  ["message_", "content", "medium"],
  ["profanity_", "content", "low"],
  ["feedback_", "content", "low"],
  ["user_note", "account", "low"],
  ["user_", "account", "medium"],
  ["2fa_", "account", "medium"],
  ["admin_", "account", "high"],
  ["staff_", "account", "high"],
  ["audit_", "system", "low"],
  ["security_", "system", "high"],
  ["error_", "system", "low"],
  ["maintenance", "system", "high"],
  ["system_", "system", "high"],
];

/** Reverse of each action the console can undo, and the section the reverse needs. */
const UNDO = Object.freeze({
  ban: { reverse: "unban", section: "moderation" },
  timeout: { reverse: "untimeout", section: "moderation" },
  wallet_freeze: { reverse: "wallet_unfreeze", section: "people" },
  access_ban: { reverse: "access_unban", section: "accessBans" },
  premium_grant: { reverse: "premium_cancel", section: "premium" },
  special_badge_grant: { reverse: "special_badge_revoke", section: "specialBadges" },
  server_directory_hide: { reverse: "server_directory_show", section: "moderation" },
});

/** Section an action's forward route needs (permission suspension in the anomaly review). */
const ACTION_SECTION = Object.freeze({
  ban: "moderation",
  unban: "moderation",
  timeout: "moderation",
  untimeout: "moderation",
  kick: "moderation",
  descoin_grant: "casino",
  credits_update: "casino",
  shop_gift: "casino",
  premium_grant: "premium",
  dm_view: "dmReview",
  group_view: "dmReview",
  server_channel_view: "serverReview",
  access_ban: "accessBans",
});

function classify(code) {
  const c = String(code || "");
  const hit = CATALOG[c];
  if (hit) return { category: hit[0], severity: hit[1], known: true };
  for (const [prefix, category, severity] of PREFIXES) {
    if (c.startsWith(prefix)) return { category, severity, known: false };
  }
  return { category: "other", severity: "low", known: false };
}

/** Severity with the meta taken into account (a 50k DesCoin grant is critical). */
function severityOf(entry) {
  const base = classify(entry?.action).severity;
  const meta = entry?.meta || {};
  if (entry?.action === "descoin_grant" && Math.abs(Number(meta.amount) || 0) >= 50000) return "critical";
  if (entry?.action === "timeout" && Number(meta.durationSeconds || 0) >= 7 * 86400) return "critical";
  if (/^error_5/.test(String(entry?.action || ""))) return "medium";
  return base;
}

/** Codes of the catalog in one category (for the database `in` filter); prefixes listed apart. */
function codesForCategories(categories) {
  const want = new Set(categories || []);
  const codes = Object.keys(CATALOG).filter((c) => want.has(CATALOG[c][0]));
  const prefixes = PREFIXES.filter(([, cat]) => want.has(cat)).map(([p]) => p);
  return { codes, prefixes };
}

function isUndoable(code) {
  return Boolean(UNDO[String(code || "")]);
}

/* ------------------------------------------------------------------ */
/* filters                                                             */
/* ------------------------------------------------------------------ */

const RANGES = { "1h": 3600e3, "24h": 86400e3, today: null, "7d": 7 * 86400e3, "30d": 30 * 86400e3, all: null };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function list(v, max = 20) {
  if (v == null || v === "") return [];
  const arr = Array.isArray(v) ? v : String(v).split(",");
  return [...new Set(arr.map((x) => String(x).trim()).filter(Boolean))].slice(0, max);
}

function isoOrNull(v) {
  if (!v) return null;
  const ms = Date.parse(String(v));
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

function startOfIstanbulDay(nowMs) {
  // Europe/Istanbul is UTC+3 all year.
  const off = 3 * 3600e3;
  const d = new Date(nowMs + off);
  d.setUTCHours(0, 0, 0, 0);
  return d.getTime() - off;
}

/**
 * Query string -> filter. Unknown values are dropped, never thrown.
 * @returns {{actors: string[], categories: string[], actions: string[], severities: string[], target: string|null,
 *   from: string|null, to: string|null, after: string|null, q: string, source: string|null, range: string, merge: boolean}}
 */
function parseFilter(query = {}, { now = Date.now() } = {}) {
  const q = query || {};
  const range = Object.prototype.hasOwnProperty.call(RANGES, String(q.range || "")) ? String(q.range) : q.from || q.to ? "custom" : "all";
  let from = isoOrNull(q.from);
  let to = isoOrNull(q.to);
  if (range !== "custom" && range !== "all") {
    from = range === "today" ? new Date(startOfIstanbulDay(now)).toISOString() : new Date(now - RANGES[range]).toISOString();
    to = null;
  }
  const actors = list(q.actor).map((a) => a.replace(/^@/, "").slice(0, 64));
  return {
    actors,
    categories: list(q.cat || q.category).filter((c) => CATEGORIES.includes(c)),
    actions: list(q.action, 60).map((a) => a.slice(0, 80)).filter((a) => /^[a-z0-9_:.\-]+$/i.test(a)),
    severities: list(q.sev || q.severity).filter((s) => SEVERITIES.includes(s)),
    target: q.target ? String(q.target).replace(/^@/, "").slice(0, 200) : null,
    from,
    to,
    after: isoOrNull(q.after),
    q: String(q.q || "").trim().slice(0, 120),
    source: ["agent", "panel"].includes(String(q.source || "")) ? String(q.source) : null,
    undone: String(q.undo || "") === "1",
    range,
    merge: String(q.merge ?? "1") !== "0",
  };
}

function fold(s) {
  return String(s ?? "")
    .toLocaleLowerCase("tr")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ı/g, "i");
}

function isAgent(entry) {
  return entry?.action === "agent_tool" || entry?.action === "agent_run" || entry?.meta?.via === "agent";
}

/**
 * @param {object} entry normalized entry
 * @param {ReturnType<typeof parseFilter>} f
 * @param {{targetIds?: string[], actorIds?: string[]}} [resolved] ids the names resolved to
 */
function matchesFilter(entry, f, resolved = {}) {
  if (!entry) return false;
  const at = Date.parse(entry.at || "");
  if (f.from && !(at >= Date.parse(f.from))) return false;
  if (f.to && !(at <= Date.parse(f.to))) return false;
  if (f.after && !(at > Date.parse(f.after))) return false;
  if (f.actors.length) {
    const name = String(entry.actorUsername || "").toLowerCase();
    const ok = f.actors.some((a) => {
      const al = a.toLowerCase();
      if (al === "agent" || al === "ajan") return isAgent(entry);
      return al === name || (entry.actorId && String(entry.actorId) === a) || (resolved.actorIds || []).includes(String(entry.actorId || ""));
    });
    if (!ok) return false;
  }
  const cls = classify(entry.action);
  if (f.categories.length && !f.categories.includes(cls.category)) return false;
  if (f.actions.length && !f.actions.includes(String(entry.action))) return false;
  if (f.severities.length && !f.severities.includes(severityOf(entry))) return false;
  if (f.undone && !(entry.meta && entry.meta.undoOf)) return false;
  if (f.source === "agent" && !isAgent(entry)) return false;
  if (f.source === "panel" && isAgent(entry)) return false;
  if (f.target) {
    const t = String(entry.target ?? "");
    const ids = resolved.targetIds || [];
    if (!(t === f.target || t.toLowerCase() === f.target.toLowerCase() || ids.includes(t) || (entry.targetUserId && ids.includes(String(entry.targetUserId))))) return false;
  }
  if (f.q) {
    const hay = fold(
      [entry.actorUsername, entry.action, entry.target, entry.targetUsername, safeJson(entry.meta)].filter(Boolean).join(" ")
    );
    const words = fold(f.q).split(/\s+/).filter(Boolean);
    if (!words.every((w) => hay.includes(w.replace(/^@/, "")))) return false;
  }
  return true;
}

function safeJson(v) {
  try {
    return JSON.stringify(v ?? {});
  } catch {
    return "";
  }
}

/* ------------------------------------------------------------------ */
/* normalize + merge                                                   */
/* ------------------------------------------------------------------ */

const MOD_TWIN = { ban: "ban", unban: "unban", timeout: "timeout", untimeout: "untimeout", kick: "kick", ban_extend: "ban_extend", timeout_extend: "timeout_extend" };

/** admin_audit row / memory entry / moderation_actions row -> one shape. */
function normalize(raw, source) {
  if (!raw) return null;
  if (source === "mod" || (raw.action_type && !raw.action)) {
    const meta = raw.meta && typeof raw.meta === "object" ? { ...raw.meta } : {};
    for (const k of ["category", "reason", "message", "duration_seconds", "expires_at"]) {
      if (raw[k] != null && meta[k] == null) meta[k === "duration_seconds" ? "durationSeconds" : k === "expires_at" ? "expiresAt" : k] = raw[k];
    }
    return {
      id: String(raw.id),
      at: raw.created_at || raw.at || null,
      actorId: raw.actor_user_id || null,
      actorUsername: raw.actorUsername || raw.actor_username || null,
      action: raw.action_type || raw.action || "unknown",
      target: raw.target_user_id || null,
      meta,
      source: "moderation_actions",
    };
  }
  return {
    id: String(raw.id),
    at: raw.at || raw.created_at || null,
    actorId: raw.actorId || raw.actor_id || null,
    actorUsername: raw.actorUsername || raw.actor_username || raw.actor || null,
    action: raw.action || "unknown",
    target: raw.target == null ? null : String(raw.target),
    meta: raw.meta && typeof raw.meta === "object" ? raw.meta : {},
    source: source === "memory" ? "memory" : "admin_audit",
    request: raw.request || requestOf(raw),
  };
}

function requestOf(row) {
  if (!row) return null;
  const r = {
    ipMasked: row.ip_masked || row.meta?._req?.ip || null,
    userAgent: row.user_agent || row.meta?._req?.ua || null,
    requestId: row.request_id || row.meta?._req?.rid || null,
    endpoint: row.endpoint || row.meta?._req?.ep || null,
    stepUp: row.meta?._req?.su ?? null,
  };
  return r.ipMasked || r.userAgent || r.requestId || r.endpoint ? r : null;
}

function ms(e) {
  const v = Date.parse(e?.at || "");
  return Number.isFinite(v) ? v : -Infinity;
}

function sameActor(a, b) {
  if (a.actorId && b.actorId) return String(a.actorId) === String(b.actorId);
  return String(a.actorUsername || "") === String(b.actorUsername || "") && Boolean(a.actorUsername);
}

/**
 * @param {object[]} entries normalized entries from every source (any order, may repeat ids)
 * @param {{mergeWindowMs?: number, twinWindowMs?: number, agentGapMs?: number, merge?: boolean}} [opts]
 * @returns {object[]} newest first
 */
function mergeEntries(entries, opts = {}) {
  const mergeWindow = opts.mergeWindowMs ?? 2000;
  const twinWindow = opts.twinWindowMs ?? 5000;
  const agentGap = opts.agentGapMs ?? 90 * 1000;
  const doMerge = opts.merge !== false;

  // 1. one row per id (durable wins over memory: it comes first in the input)
  const byId = new Map();
  for (const e of entries || []) {
    if (!e || !e.id) continue;
    if (!byId.has(e.id)) byId.set(e.id, { ...e, merged: [], twins: [] });
  }
  let rows = [...byId.values()].sort((a, b) => ms(b) - ms(a));

  // 2. moderation_actions rows folded into their admin_audit twin
  const audits = rows.filter((r) => r.source !== "moderation_actions");
  const out = [];
  for (const r of rows) {
    if (r.source !== "moderation_actions") {
      out.push(r);
      continue;
    }
    const twin = audits.find(
      (a) =>
        MOD_TWIN[r.action] === a.action &&
        String(a.target || "") === String(r.target || "") &&
        (!r.actorId || !a.actorId || String(a.actorId) === String(r.actorId)) &&
        Math.abs(ms(a) - ms(r)) <= twinWindow
    );
    if (twin) {
      twin.twins.push({ id: r.id, source: r.source, at: r.at });
      for (const [k, v] of Object.entries(r.meta || {})) if (twin.meta[k] == null && v != null) twin.meta = { ...twin.meta, [k]: v };
    } else {
      out.push(r);
    }
  }
  rows = out;
  if (!doMerge) return rows.map(finish);

  // 3. same actor + action + target within the window -> one row
  const merged = [];
  for (const r of rows) {
    // Look back over the rows still inside the window (another action may sit between two copies).
    let prev = null;
    for (let k = merged.length - 1; k >= 0; k -= 1) {
      const cand = merged[k];
      if (ms(cand._last || cand) - ms(r) > mergeWindow) break;
      if (
        cand.action === r.action &&
        r.action !== "agent_tool" &&
        String(cand.target ?? "") === String(r.target ?? "") &&
        sameActor(cand, r)
      ) {
        prev = cand;
        break;
      }
    }
    if (prev) {
      prev.merged.push({ id: r.id, source: r.source, at: r.at });
      for (const t of r.twins) prev.twins.push(t);
      prev._last = r;
      if (!prev.request && r.request) prev.request = r.request;
      continue;
    }
    merged.push(r);
  }

  // 4. agent tool bursts -> one "agent_run" row (other rows may sit between the calls)
  const final = [];
  const openRuns = new Map();
  for (const r of merged) {
    if (r.action !== "agent_tool") {
      final.push(r);
      continue;
    }
    const thread = r.meta?.threadId || null;
    const key = `${r.actorId || r.actorUsername || "?"}|${thread || ""}`;
    const run = openRuns.get(key);
    if (run && ms(run._oldest) - ms(r) <= agentGap) {
      run.tools.push(toolOf(r));
      run._oldest = r;
      run.from = r.at;
      continue;
    }
    const fresh = {
      id: `agentrun:${r.id}`,
      at: r.at,
      from: r.at,
      actorId: r.actorId,
      actorUsername: r.actorUsername,
      action: "agent_run",
      target: null,
      meta: { threadId: thread },
      source: r.source,
      merged: [],
      twins: [],
      tools: [toolOf(r)],
      _oldest: r,
    };
    openRuns.set(key, fresh);
    final.push(fresh);
  }
  return final.map(finish);
}

function toolOf(r) {
  return { id: r.id, tool: r.target || null, path: r.meta?.path || null, status: r.meta?.status ?? null, at: r.at };
}

function finish(r) {
  const { _last, _oldest, ...rest } = r;
  const cls = classify(rest.action);
  const out = { ...rest, category: cls.category, severity: severityOf(rest) };
  if (rest.action === "agent_run") {
    out.tools = [...rest.tools].reverse(); // oldest first, the order they ran
    out.count = out.tools.length;
    out.ok = out.tools.every((t) => t.status == null || Number(t.status) < 400);
    out.severity = out.ok ? "low" : "medium";
  }
  out.undoable = isUndoable(rest.action);
  return out;
}

/**
 * Multi-source paging: each source returned at most `limit` raw rows newer than
 * the cursor. Rows older than the newest "last row" of a full source may be
 * missing from the other sources, so the page stops there.
 * @param {{rows: object[], full: boolean}[]} sources
 * @returns {string|null} ISO cut-off (rows with at >= cut-off are complete), null = no cut
 */
function pageCutoff(sources) {
  let cut = null;
  for (const s of sources) {
    if (!s.full || !s.rows.length) continue;
    const oldest = s.rows.reduce((m, r) => Math.min(m, ms(r)), Infinity);
    if (cut === null || oldest > cut) cut = oldest;
  }
  return cut === null ? null : new Date(cut).toISOString();
}

/* ------------------------------------------------------------------ */
/* anomalies                                                           */
/* ------------------------------------------------------------------ */

const DEFAULT_RULES = Object.freeze([
  { key: "ban_burst", actions: ["ban"], limit: 5, windowSec: 60, enabled: true },
  { key: "timeout_burst", actions: ["timeout"], limit: 10, windowSec: 60, enabled: true },
  { key: "denied_repeat", actions: ["premium_denied", "access_denied"], limit: 2, windowSec: 600, enabled: true },
  { key: "economy_burst", actions: ["descoin_grant", "credits_update", "premium_grant", "shop_gift", "special_badge_grant"], limit: 10, windowSec: 600, enabled: true },
  { key: "sensitive_reads", actions: ["dm_view", "group_view", "server_channel_view", "flagged_context_view"], limit: 5, windowSec: 3600, enabled: true },
]);

/** Stored rule rows over the defaults (limit 1..1000, window 10 s .. 1 day). */
function effectiveRules(stored) {
  const byKey = new Map((stored || []).map((r) => [String(r.key), r]));
  return DEFAULT_RULES.map((d) => {
    const s = byKey.get(d.key);
    if (!s) return { ...d };
    const limit = Math.min(1000, Math.max(1, Math.round(Number(s.limit ?? s.threshold) || d.limit)));
    const windowSec = Math.min(86400, Math.max(10, Math.round(Number(s.window_sec ?? s.windowSec) || d.windowSec)));
    return { ...d, limit, windowSec, enabled: s.enabled !== false };
  });
}

/**
 * @param {object[]} entries merged or raw entries (any order)
 * @param {object[]} rules effectiveRules()
 * @param {{reviewedKeys?: Set<string>|string[], history?: object[]}} [opts] history = 7 days of the
 *   same entries for the usual rate
 */
function detectAnomalies(entries, rules, opts = {}) {
  const reviewed = new Set(opts.reviewedKeys || []);
  const history = opts.history || entries;
  const out = [];
  for (const rule of rules || []) {
    if (!rule.enabled) continue;
    const want = new Set(rule.actions);
    const byActor = new Map();
    for (const e of entries || []) {
      if (!want.has(e.action)) continue;
      const k = e.actorId || e.actorUsername || "?";
      if (!byActor.has(k)) byActor.set(k, []);
      // A merged row stands for every copy only once: it is one action.
      byActor.get(k).push(e);
    }
    for (const [actorKey, rows] of byActor) {
      rows.sort((a, b) => ms(a) - ms(b));
      let i = 0;
      while (i < rows.length) {
        let j = i;
        while (j + 1 < rows.length && ms(rows[j + 1]) - ms(rows[i]) <= rule.windowSec * 1000) j += 1;
        const count = j - i + 1;
        if (count > rule.limit) {
          const cluster = rows.slice(i, j + 1);
          const key = `${rule.key}:${actorKey}:${cluster[0].id}`;
          if (!reviewed.has(key)) {
            const ids = new Set(cluster.map((c) => c.id));
            out.push({
              key,
              rule: rule.key,
              limit: rule.limit,
              windowSec: rule.windowSec,
              actorId: cluster[0].actorId || null,
              actorUsername: cluster[0].actorUsername || null,
              from: cluster[0].at,
              to: cluster[cluster.length - 1].at,
              count,
              action: cluster[0].action,
              entryIds: cluster.map((c) => c.id),
              targets: cluster.map((c) => ({ entryId: c.id, target: c.target, at: c.at, meta: c.meta || {} })),
              usualPerHour: usualRate(history, actorKey, want, ids),
              severity: "critical",
            });
          }
          i = j + 1;
        } else {
          i += 1;
        }
      }
    }
  }
  return out.sort((a, b) => Date.parse(b.to) - Date.parse(a.to));
}

/** Same actions per active hour over the history, the anomaly itself left out. */
function usualRate(history, actorKey, actions, skipIds) {
  const hours = new Set();
  let n = 0;
  for (const e of history || []) {
    if ((e.actorId || e.actorUsername || "?") !== actorKey) continue;
    hours.add(Math.floor(ms(e) / 3600e3));
    if (actions.has(e.action) && !skipIds.has(e.id)) n += 1;
  }
  if (!hours.size) return 0;
  return Math.round((n / hours.size) * 10) / 10;
}

/* ------------------------------------------------------------------ */
/* summary                                                             */
/* ------------------------------------------------------------------ */

const AGENT_KEY = "agent";

function actorKeyOf(e) {
  if (isAgent(e)) return AGENT_KEY;
  return e.actorUsername || e.actorId || "?";
}

/**
 * @param {object[]} merged merged entries of the last 7 days (newest first)
 * @param {{now?: number, raw?: object[], anomalies?: object[]}} opts raw = unmerged rows (agent tool count)
 */
function summarize(merged, { now = Date.now(), raw = null, anomalies = [] } = {}) {
  const day = 86400e3;
  const last24 = merged.filter((e) => ms(e) > now - day);
  const prev24 = merged.filter((e) => ms(e) <= now - day && ms(e) > now - 2 * day);
  const crit = (rows) => rows.filter((e) => e.severity === "critical").length;
  const agentTools = raw
    ? raw.filter((e) => e.action === "agent_tool" && ms(e) > now - day).length
    : last24.reduce((n, e) => n + (e.action === "agent_run" ? e.count || 0 : e.action === "agent_tool" ? 1 : 0), 0);
  const agentRuns = last24.filter((e) => e.action === "agent_run").length;
  const denied = last24.filter((e) => e.category === "denied");
  const deniedTop = topBy(denied, (e) => e.actorUsername || "?");
  const undone = last24.filter((e) => e.meta && e.meta.undoOf);
  const pct = prev24.length ? Math.round(((last24.length - prev24.length) / prev24.length) * 100) : null;

  // hourly chart: 24 buckets ending with the current hour
  const hourNow = Math.floor(now / 3600e3) * 3600e3;
  const start = hourNow - 23 * 3600e3;
  const totals = new Map();
  for (const e of last24) totals.set(actorKeyOf(e), (totals.get(actorKeyOf(e)) || 0) + 1);
  const series = [...totals.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([k]) => k);
  const buckets = Array.from({ length: 24 }, (_, i) => ({ at: new Date(start + i * 3600e3).toISOString(), counts: series.map(() => 0), other: 0, hot: false }));
  for (const e of last24) {
    const idx = Math.floor((ms(e) - start) / 3600e3);
    if (idx < 0 || idx > 23) continue;
    const s = series.indexOf(actorKeyOf(e));
    if (s >= 0) buckets[idx].counts[s] += 1;
    else buckets[idx].other += 1;
  }
  for (const a of anomalies || []) {
    const idx = Math.floor((Date.parse(a.to) - start) / 3600e3);
    if (idx >= 0 && idx <= 23) buckets[idx].hot = true;
  }

  // 7-day leaderboard with a daily sparkline (oldest day first)
  const dayStart = startOfIstanbulDay(now) - 6 * day;
  const board = new Map();
  for (const e of merged) {
    if (ms(e) < dayStart) continue;
    const k = actorKeyOf(e);
    if (!board.has(k)) board.set(k, { key: k, actorId: k === AGENT_KEY ? null : e.actorId || null, username: k === AGENT_KEY ? null : e.actorUsername || null, count: 0, days: Array(7).fill(0), hotDay: -1 });
    const row = board.get(k);
    row.count += 1;
    const d = Math.min(6, Math.max(0, Math.floor((ms(e) - dayStart) / day)));
    row.days[d] += 1;
  }
  for (const a of anomalies || []) {
    const row = board.get(a.actorUsername || a.actorId);
    if (row) row.hotDay = Math.min(6, Math.max(0, Math.floor((Date.parse(a.to) - dayStart) / day)));
  }
  const leaderboard = [...board.values()].sort((a, b) => b.count - a.count).slice(0, 6);

  return {
    kpis: {
      total: { value: last24.length, deltaPct: pct },
      critical: { value: crit(last24), delta: crit(last24) - crit(prev24) },
      agent: { value: agentTools, runs: agentRuns },
      denied: { value: denied.length, top: deniedTop },
      undone: { value: undone.length, people: new Set(undone.map((e) => e.target).filter(Boolean)).size },
    },
    chart: { series, buckets },
    leaderboard,
  };
}

function topBy(rows, keyFn) {
  const m = new Map();
  for (const r of rows) m.set(keyFn(r), (m.get(keyFn(r)) || 0) + 1);
  let best = null;
  for (const [k, v] of m) if (!best || v > best[1]) best = [k, v];
  return best ? best[0] : null;
}

/* ------------------------------------------------------------------ */
/* export                                                              */
/* ------------------------------------------------------------------ */

function csvCell(v) {
  const s = v == null ? "" : typeof v === "object" ? safeJson(v) : String(v);
  // Spreadsheet formula injection: a leading = + - @ is read as text.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r;]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

function istanbulLocal(iso) {
  const t = Date.parse(iso || "");
  if (!Number.isFinite(t)) return "";
  return new Date(t + 3 * 3600e3).toISOString().replace("T", " ").slice(0, 19);
}

function toCsv(entries, users = {}) {
  const head = ["id", "at_utc", "at_istanbul", "actor", "action", "category", "severity", "target", "target_username", "merged", "source", "meta"];
  const lines = [head.join(",")];
  for (const e of entries) {
    const u = users[e.target] || users[e.targetUserId] || null;
    lines.push(
      [
        e.id,
        e.at,
        istanbulLocal(e.at),
        e.actorUsername || e.actorId || "",
        e.action,
        e.category,
        e.severity,
        e.target ?? "",
        u?.username || "",
        1 + (e.merged?.length || 0) + (e.twins?.length || 0),
        e.source || "",
        e.action === "agent_run" ? { tools: (e.tools || []).map((x) => x.tool) } : stripPrivate(e.meta),
      ]
        .map(csvCell)
        .join(",")
    );
  }
  return lines.join("\r\n") + "\r\n";
}

function stripPrivate(meta) {
  if (!meta || typeof meta !== "object") return {};
  const { _req, ...rest } = meta;
  return rest;
}

module.exports = {
  CATEGORIES,
  SEVERITIES,
  SEV_RANK,
  CATALOG,
  PREFIXES,
  UNDO,
  ACTION_SECTION,
  DEFAULT_RULES,
  UUID_RE,
  classify,
  severityOf,
  codesForCategories,
  isUndoable,
  parseFilter,
  matchesFilter,
  normalize,
  requestOf,
  mergeEntries,
  pageCutoff,
  effectiveRules,
  detectAnomalies,
  summarize,
  toCsv,
  stripPrivate,
  isAgent,
  startOfIstanbulDay,
  fold,
};
