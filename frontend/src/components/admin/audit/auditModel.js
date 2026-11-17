/**
 * İşlem kaydı (owner pick Draft B "Konsol"): pure helpers for the page.
 * Every action code gets a label, a sentence, an icon, a tone and a severity
 * (the server sends category + severity; codes it does not know fall back to
 * their category and a generic sentence). Query bar tokens <-> query string,
 * relative / local / UTC time, details line, before/after rows, saved views.
 * Tested by audit.selftest.mjs.
 */
import { trAccusative, trDative, trGenitive } from "../../../lib/trSuffix.js";

export const CATEGORIES = ["sanctions", "content", "account", "economy", "system", "agent", "denied", "other"];
export const SEVERITIES = ["critical", "high", "medium", "low"];
export const RANGES = ["1h", "24h", "today", "7d", "30d", "all"];
export const TOKEN_KINDS = ["actor", "action", "cat", "target", "range", "sev", "source", "flag", "text"];

/** Category -> tone (draft family colours). */
export const CAT_TONE = {
  sanctions: "red",
  content: "violet",
  account: "blue",
  economy: "green",
  system: "cyan",
  agent: "violet",
  denied: "orange",
  other: "gray",
};

export const SEV_TONE = { critical: "red", high: "amber", medium: "blue", low: "gray" };

/** Codes with their own label (auditLog.act.<code>), icon and tone; sentence auditLog.s.<code> when SENTENCE has it. */
const ACT = {
  ban: ["ban", "red"],
  unban: ["unlock", "blue"],
  timeout: ["mute", "amber"],
  untimeout: ["unmute", "blue"],
  kick: ["logout", "amber"],
  ban_extend: ["ban", "red"],
  timeout_extend: ["mute", "amber"],
  force_status: ["user", "blue"],
  bulk: ["layers", "red"],
  access_ban: ["lock", "red"],
  access_unban: ["unlock", "blue"],
  access_denied: ["shield", "orange"],
  premium_denied: ["shield", "orange"],
  appeal_accept: ["check", "blue"],
  appeal_reject: ["x", "gray"],
  report_dismiss: ["flag", "gray"],
  report_assign: ["flag", "blue"],
  report_unassign: ["flag", "gray"],
  report_note: ["note", "gray"],
  sanction_message_edit: ["edit", "gray"],
  disconnect_all: ["power", "red"],
  message_delete: ["trash", "violet"],
  message_edit: ["edit", "violet"],
  message_flag: ["flag", "violet"],
  purge_user_messages: ["trash", "red"],
  reactions_clear: ["trash", "gray"],
  dm_view: ["eye", "violet"],
  dm_block: ["ban", "violet"],
  dm_conv_delete: ["trash", "violet"],
  dm_msg_delete: ["trash", "violet"],
  group_view: ["eye", "violet"],
  group_msg_delete: ["trash", "violet"],
  server_channel_view: ["eye", "violet"],
  server_msg_delete: ["trash", "violet"],
  server_directory_hide: ["eyeoff", "violet"],
  server_directory_show: ["eye", "violet"],
  server_invite_delete: ["link", "violet"],
  server_invites_revoke: ["link", "violet"],
  server_invites_resume: ["link", "violet"],
  server_delete: ["trash", "red"],
  flagged_context_view: ["eye", "violet"],
  broadcast: ["megaphone", "violet"],
  live_popup: ["bell", "violet"],
  announcement_create: ["megaphone", "violet"],
  announcement_delete: ["megaphone", "gray"],
  profanity_add: ["filter", "gray"],
  profanity_update: ["filter", "gray"],
  profanity_remove: ["filter", "gray"],
  user_create: ["userplus", "blue"],
  user_delete: ["trash", "red"],
  make_admin: ["crown", "blue"],
  remove_admin: ["crown", "red"],
  admin_permissions: ["key", "blue"],
  user_lens: ["eye", "blue"],
  data_export: ["download", "blue"],
  revoke_session: ["logout", "blue"],
  revoke_sessions: ["logout", "blue"],
  user_note_add: ["note", "gray"],
  user_note_delete: ["note", "gray"],
  feedback_status: ["check", "blue"],
  feedback_priority: ["flag", "gray"],
  feedback_reply: ["edit", "gray"],
  feedback_note: ["note", "gray"],
  feedback_delete: ["trash", "red"],
  "2fa_totp_enabled": ["key", "blue"],
  "2fa_recovery_regenerated": ["key", "blue"],
  descoin_grant: ["coin", "green"],
  descoin_reconcile_run: ["scale", "green"],
  descoin_reconcile_fix: ["scale", "green"],
  wallet_freeze: ["snow", "cyan"],
  wallet_unfreeze: ["snow", "blue"],
  credits_update: ["coin", "green"],
  credits_reset: ["coin", "amber"],
  shop_gift: ["gift", "green"],
  shop_gift_undo: ["undo", "green"],
  premium_grant: ["star", "green"],
  premium_extend: ["star", "green"],
  premium_cancel: ["star", "amber"],
  premium_change_plan: ["star", "green"],
  premium_set_end: ["star", "green"],
  premium_set_unlimited: ["star", "green"],
  premium_bulk: ["star", "green"],
  premium_plan_update: ["star", "green"],
  special_badge_grant: ["award", "green"],
  special_badge_revoke: ["award", "amber"],
  system_config: ["gear", "cyan"],
  chat_freeze: ["snow", "red"],
  slowmode: ["clock", "cyan"],
  maintenance: ["wrench", "red"],
  server_restart: ["power", "red"],
  audit_export: ["download", "cyan"],
  audit_rules_update: ["bell", "cyan"],
  audit_review: ["check", "cyan"],
  audit_suspend_request: ["key", "amber"],
  audit_note_add: ["note", "gray"],
  audit_view_create: ["bookmark", "gray"],
  audit_view_delete: ["bookmark", "gray"],
  agent_run: ["bot", "violet"],
  agent_tool: ["bot", "violet"],
  agent_settings: ["bot", "violet"],
  agent_scopes: ["bot", "violet"],
  agent_task_create: ["bot", "violet"],
  agent_task_delete: ["bot", "violet"],
  agent_plan_approve: ["bot", "violet"],
  agent_plan_run: ["bot", "violet"],
  agent_plan_undo: ["undo", "violet"],
  agent_plan_cancel: ["bot", "violet"],
  agent_plan_pause: ["bot", "violet"],
  security_lock_start: ["lock", "red"],
  security_lock_extend: ["lock", "amber"],
  security_lock_lift: ["unlock", "blue"],
  security_lock_expired: ["unlock", "gray"],
  security_remind_2fa: ["bell", "blue"],
  security_settings: ["shield", "cyan"],
  security_settings_revert: ["undo", "cyan"],
  system_flag: ["flag", "cyan"],
  system_flag_try: ["flag", "cyan"],
  system_flag_rollback: ["undo", "amber"],
  system_flag_auto_rollback: ["undo", "amber"],
  system_flag_restore: ["flag", "cyan"],
  system_limits: ["gear", "cyan"],
  system_limits_reset: ["gear", "amber"],
  system_switch: ["power", "red"],
  system_undo: ["undo", "cyan"],
  system_broadcast: ["megaphone", "cyan"],
  system_backup: ["download", "cyan"],
  system_restart: ["power", "red"],
  system_restart_exit: ["power", "amber"],
  announcement_publish: ["megaphone", "violet"],
  announcement_schedule: ["clock", "violet"],
  live_popup_recall: ["undo", "violet"],
  live_popup_schedule: ["clock", "violet"],
  credit_transfers_off: ["coin", "amber"],
  credit_transfers_on: ["coin", "green"],
  game_limits_set: ["coin", "green"],
  shop2_direct_sale: ["bag", "green"],
};

/** Every code with its own label (tests check each has a label in every language). */
export const ACTION_CODES = Object.keys(ACT);

/** Prefix fallbacks for codes built at runtime (icon, tone, label key of the family). */
export const PREFIX_FAMILIES = () => PREFIX.map((p) => p[3]);
const PREFIX = [
  ["agent_", "bot", "violet", "agent"],
  ["premium_", "star", "green", "premium"],
  ["shop_", "bag", "green", "shop"],
  ["shop2_", "bag", "green", "shop2"],
  ["descoin_", "coin", "green", "descoin"],
  ["credit", "coin", "green", "credits"],
  ["casino_", "coin", "green", "casino"],
  ["game_", "coin", "green", "casino"],
  ["leaderboard_", "trophy", "green", "casino"],
  ["antibot_", "shield", "amber", "antibot"],
  ["mod_", "shield", "red", "moddesk"],
  ["moddesk_", "shield", "red", "moddesk"],
  ["moderation_", "shield", "red", "moddesk"],
  ["flagged_", "flag", "violet", "flagged"],
  ["live_popup", "bell", "violet", "popup"],
  ["popup_", "bell", "violet", "popup"],
  ["announcement_", "megaphone", "violet", "announcement"],
  ["server_", "server", "violet", "server"],
  ["dm_", "msg", "violet", "dm"],
  ["group_", "msg", "violet", "group"],
  ["report_", "flag", "gray", "report"],
  ["appeal_", "scale", "blue", "appeal"],
  ["user_note", "note", "gray", "note"],
  ["user_", "user", "blue", "user"],
  ["2fa_", "key", "blue", "twofa"],
  ["audit_", "scroll", "cyan", "audit"],
  ["security_", "shield", "cyan", "security"],
  ["system_", "gear", "cyan", "system"],
  ["error_", "bug", "gray", "error"],
];

/** Codes whose sentence has its own template (auditLog.s.<code>). */
export const SENTENCE = new Set([
  "ban", "unban", "timeout", "untimeout", "kick", "ban_extend", "timeout_extend", "force_status", "bulk",
  "access_ban", "access_unban", "access_denied", "premium_denied", "appeal_accept", "appeal_reject",
  "report_dismiss", "report_assign", "report_unassign", "report_note", "disconnect_all",
  "message_delete", "message_edit", "purge_user_messages", "dm_view", "group_view", "server_channel_view",
  "server_directory_hide", "server_directory_show", "server_delete", "broadcast", "live_popup",
  "user_create", "user_delete", "make_admin", "remove_admin", "admin_permissions", "user_lens", "data_export",
  "revoke_sessions", "revoke_session", "user_note_add",
  "descoin_grant", "wallet_freeze", "wallet_unfreeze", "credits_update", "credits_reset", "shop_gift", "shop_gift_undo",
  "premium_grant", "premium_extend", "premium_cancel", "premium_bulk", "special_badge_grant", "special_badge_revoke",
  "system_config", "chat_freeze", "slowmode", "maintenance", "server_restart",
  "audit_export", "audit_review", "audit_suspend_request", "audit_rules_update",
  "agent_run", "agent_tool", "agent_plan_approve", "agent_plan_run", "agent_plan_undo",
  "shop2_direct_sale",
]);

/**
 * @param {string} code
 * @param {string} [category] server category (fallback)
 * @returns {{icon: string, tone: string, labelKey: string, known: boolean, family: string|null}}
 */
export function actionInfo(code, category = "other") {
  const c = String(code || "");
  if (ACT[c]) return { icon: ACT[c][0], tone: ACT[c][1], labelKey: `auditLog.act.${c}`, known: true, family: null };
  for (const [p, icon, tone, fam] of PREFIX) {
    if (c.startsWith(p)) return { icon, tone, labelKey: `auditLog.fam.${fam}`, known: false, family: fam };
  }
  return { icon: "dot", tone: CAT_TONE[category] || "gray", labelKey: `auditLog.cat.${CATEGORIES.includes(category) ? category : "other"}`, known: false, family: null };
}

/** "@kaan" with the Turkish case suffixes the sentences need. */
export function handle(name) {
  if (!name) return "";
  const s = String(name);
  return s.startsWith("@") ? s : `@${s}`;
}

export function caseForms(display) {
  const h = String(display || "");
  return { target: h, targetAcc: h ? trAccusative(h) : "", targetDat: h ? trDative(h) : "", targetGen: h ? trGenitive(h) : "" };
}

/** Duration label parts: { key, n } for "7 gün" / "Kalıcı" / "1 saat". */
export function durationOf(seconds) {
  const s = Number(seconds);
  if (!Number.isFinite(s) || s <= 0) return { key: "auditLog.dur.permanent", n: 0 };
  if (s % 86400 === 0) return { key: "auditLog.dur.days", n: s / 86400 };
  if (s % 3600 === 0) return { key: "auditLog.dur.hours", n: s / 3600 };
  return { key: "auditLog.dur.minutes", n: Math.max(1, Math.round(s / 60)) };
}

/** Seconds a ban / timeout lasts, from meta (expiresAt / until vs. the entry time, or durationSeconds). */
export function secondsOf(entry) {
  const m = entry?.meta || {};
  if (Number(m.durationSeconds) > 0) return Number(m.durationSeconds);
  if (Number(m.duration_seconds) > 0) return Number(m.duration_seconds);
  const end = Date.parse(m.expiresAt || m.until || m.expires_at || "");
  const at = Date.parse(entry?.at || "");
  if (Number.isFinite(end) && Number.isFinite(at) && end > at) {
    const raw = (end - at) / 1000;
    // Round to the preset the admin picked (1 h, 24 h, 3 d, 7 d, ...).
    for (const unit of [86400, 3600, 60]) if (Math.abs(raw / unit - Math.round(raw / unit)) < 0.02 && raw >= unit) return Math.round(raw / unit) * unit;
    return Math.round(raw);
  }
  return 0;
}

/** Who did it, as shown: "@demir", or the agent. */
export function actorName(entry, systemLabel = null) {
  if (systemLabel && !entry?.actorId && entry?.actorUsername === "system") return systemLabel;
  if (entry?.action === "agent_run" || entry?.action === "agent_tool") return handle(entry.actorUsername || "?");
  return entry?.actorUsername ? handle(entry.actorUsername) : "?";
}

/**
 * Target as shown, plus what kind it is.
 * @returns {{kind: "user"|"server"|"text"|"none", label: string, userId?: string, serverId?: string}}
 */
export function targetOf(entry, users = {}, servers = {}) {
  if (!entry || entry.target == null || entry.target === "") return { kind: "none", label: "" };
  const t = String(entry.target);
  const uid = entry.targetUserId || (users[t] ? t : null);
  if (uid && users[uid]) return { kind: "user", label: handle(users[uid].username), userId: uid };
  const sid = t.split("/")[0];
  if (/^server_/.test(entry.action || "") && servers[sid]) return { kind: "server", label: servers[sid].name || sid, serverId: sid };
  if (entry.targetUsername) return { kind: "user", label: handle(entry.targetUsername), userId: uid || null };
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(t)) return { kind: "text", label: `${t.slice(0, 8)}…` };
  return { kind: "text", label: t.length > 48 ? `${t.slice(0, 47)}…` : t };
}

/** Turkish case each sentence needs for its target ("@kaan'ı", "@kaan'a", "@kaan'ın"); others print the name as is. */
export const TR_CASE = {
  ban: "acc", timeout: "acc", kick: "acc", make_admin: "acc", server_delete: "acc", server_directory_hide: "acc", server_directory_show: "acc",
  unban: "gen", untimeout: "gen", ban_extend: "gen", timeout_extend: "gen", force_status: "gen", access_ban: "gen", access_unban: "gen",
  purge_user_messages: "gen", user_delete: "gen", remove_admin: "gen", admin_permissions: "gen", user_lens: "gen", data_export: "gen",
  revoke_sessions: "gen", revoke_session: "gen", wallet_freeze: "gen", wallet_unfreeze: "gen", credits_update: "gen", credits_reset: "gen",
  premium_extend: "gen", premium_cancel: "gen", special_badge_revoke: "gen", appeal_accept: "gen", appeal_reject: "gen", audit_suspend_request: "gen",
  descoin_grant: "dat", shop_gift: "dat", shop_gift_undo: "dat", premium_grant: "dat", special_badge_grant: "dat",
};

/**
 * Sentence key + variables for one entry ("@demir, @kaan'ı 7 gün yasakladı").
 * @returns {{key: string, vars: object, durKey?: string, durN?: number, labelKey?: string}}
 */
export function sentenceOf(entry, users = {}, servers = {}, { locale = "tr", systemLabel = null } = {}) {
  const action = String(entry?.action || "");
  const tgt = targetOf(entry, users, servers);
  const forms = caseForms(tgt.label);
  const m = entry?.meta || {};
  const secs = secondsOf(entry);
  const tr = String(locale || "").toLowerCase().startsWith("tr");
  const kase = TR_CASE[action];
  const target = tr && kase === "acc" ? forms.targetAcc : tr && kase === "dat" ? forms.targetDat : tr && kase === "gen" ? forms.targetGen : forms.target;
  const vars = {
    actor: actorName(entry, systemLabel),
    target,
    n: Number(m.count ?? m.rows ?? m.removed ?? entry?.count ?? 0) || 0,
    amount: Number(m.amount) || 0,
    tool: entry?.target || "",
    on: String(entry?.target) === "true" ? "true" : "false",
    value: entry?.target ?? "",
    has: tgt.label ? "yes" : "no",
  };
  if (action === "agent_run") vars.n = entry.count || (entry.tools || []).length;
  if (SENTENCE.has(action)) {
    const d = durationOf(secs);
    return { key: `auditLog.s.${action}`, vars, durKey: `auditLog.durS.${d.key.split(".").pop()}`, durN: d.n };
  }
  return { key: "auditLog.s._generic", vars, labelKey: actionInfo(action, entry?.category).labelKey };
}

/** Relative time: {key, n} — "şimdi", "30 sn", "30 dk", "3 sa", "Dün", "3 g", or a date. */
export function relTime(at, now = Date.now()) {
  const t = Date.parse(at || "");
  if (!Number.isFinite(t)) return { key: "auditLog.rel.unknown", n: 0 };
  const d = Math.max(0, now - t) / 1000;
  if (d < 45) return { key: "auditLog.rel.now", n: 0 };
  if (d < 3600) return { key: "auditLog.rel.min", n: Math.max(1, Math.round(d / 60)) };
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  if (t >= today.getTime()) return { key: "auditLog.rel.hour", n: Math.max(1, Math.floor(d / 3600)) };
  if (t >= today.getTime() - 86400e3) return { key: "auditLog.rel.yesterday", n: 1 };
  return { key: "auditLog.rel.days", n: Math.ceil((today.getTime() - t) / 86400e3) };
}

/** "23:13:02" in the viewer's local time. */
export function clock(at, locale = "tr-TR") {
  const t = Date.parse(at || "");
  if (!Number.isFinite(t)) return "";
  try {
    return new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(new Date(t));
  } catch {
    return new Date(t).toTimeString().slice(0, 8);
  }
}

/** "14 Kas 2026 23:41:18 (GMT+3)" */
export function fullLocal(at, locale = "tr-TR") {
  const t = Date.parse(at || "");
  if (!Number.isFinite(t)) return "";
  const d = new Date(t);
  let text;
  try {
    text = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(d);
  } catch {
    text = d.toString().slice(0, 24);
  }
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? "+" : "-";
  const h = Math.floor(Math.abs(off) / 60);
  const mm = Math.abs(off) % 60;
  return `${text} (GMT${sign}${h}${mm ? `:${String(mm).padStart(2, "0")}` : ""})`;
}

/** "20:41:18.584" UTC. */
export function utcStamp(at) {
  const t = Date.parse(at || "");
  if (!Number.isFinite(t)) return "";
  return new Date(t).toISOString().slice(11, 23);
}

/** Hour label "20:00" of a bucket in local time. */
export function hourLabel(at, locale = "tr-TR") {
  const t = Date.parse(at || "");
  if (!Number.isFinite(t)) return "";
  try {
    return new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(t));
  } catch {
    return `${String(new Date(t).getHours()).padStart(2, "0")}:00`;
  }
}

/* ------------------------------------------------------------------ */
/* query bar tokens                                                    */
/* ------------------------------------------------------------------ */

/**
 * Token list -> query params for GET /admin/audit.
 * @param {{kind: string, value: string|string[]}[]} tokens
 */
export function tokensToQuery(tokens, { merge = true } = {}) {
  const q = {};
  const add = (k, v) => {
    const arr = Array.isArray(v) ? v : [v];
    q[k] = [...new Set([...(q[k] ? String(q[k]).split(",") : []), ...arr.map(String)])].filter(Boolean).join(",");
  };
  const texts = [];
  for (const tok of tokens || []) {
    if (!tok) continue;
    if (tok.kind === "actor") add("actor", tok.value);
    else if (tok.kind === "cat") add("cat", tok.value);
    else if (tok.kind === "sev") add("sev", tok.value);
    else if (tok.kind === "action") add("action", tok.value);
    else if (tok.kind === "target") q.target = String(tok.value);
    else if (tok.kind === "source") q.source = String(tok.value);
    else if (tok.kind === "flag" && tok.value === "undo") q.undo = "1";
    else if (tok.kind === "range") {
      if (tok.value === "custom") {
        if (tok.from) q.from = tok.from;
        if (tok.to) q.to = tok.to;
      } else q.range = String(tok.value);
    } else if (tok.kind === "text") texts.push(String(tok.value));
  }
  if (texts.length) q.q = texts.join(" ");
  if (!merge) q.merge = "0";
  return q;
}

/** Query params (a saved view) -> tokens. */
export function queryToTokens(query = {}) {
  const q = query || {};
  const split = (v) => String(v || "").split(",").map((x) => x.trim()).filter(Boolean);
  const out = [];
  if (q.actor) out.push({ kind: "actor", value: split(q.actor) });
  if (q.action) out.push({ kind: "action", value: split(q.action) });
  if (q.cat) out.push({ kind: "cat", value: split(q.cat).filter((c) => CATEGORIES.includes(c)) });
  if (q.target) out.push({ kind: "target", value: String(q.target) });
  if (q.range && RANGES.includes(q.range) && q.range !== "all") out.push({ kind: "range", value: q.range });
  else if (q.from || q.to) out.push({ kind: "range", value: "custom", from: q.from || null, to: q.to || null });
  if (q.sev) out.push({ kind: "sev", value: split(q.sev).filter((s) => SEVERITIES.includes(s)) });
  if (q.source) out.push({ kind: "source", value: String(q.source) });
  if (String(q.undo || "") === "1") out.push({ kind: "flag", value: "undo" });
  if (q.q) out.push({ kind: "text", value: String(q.q) });
  return out.filter((t) => !Array.isArray(t.value) || t.value.length);
}

/** Replace the token of one kind (one per kind; text tokens add up). */
export function setToken(tokens, tok) {
  const list = (tokens || []).filter((t) => t.kind !== tok.kind || tok.kind === "text");
  if (tok.kind === "text" && list.some((t) => t.kind === "text" && t.value === tok.value)) return list;
  return [...list, tok];
}

/** Add one value to a multi-value token (actor, cat, sev, action). */
export function addTokenValue(tokens, kind, value) {
  const cur = (tokens || []).find((t) => t.kind === kind);
  if (!cur) return [...(tokens || []), { kind, value: [value] }];
  const vals = Array.isArray(cur.value) ? cur.value : [cur.value];
  if (vals.includes(value)) return tokens;
  return tokens.map((t) => (t === cur ? { ...t, value: [...vals, value] } : t));
}

function fold(s) {
  return String(s || "")
    .toLocaleLowerCase("tr")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ı/g, "i");
}

/**
 * Suggestions for what is typed in the query bar.
 * @param {string} text
 * @param {{admins: {username: string}[], t: (k: string, v?: object) => string}} ctx
 * @returns {{kind: string, value: any, label: string, hint: string}[]}
 */
export function suggestionsFor(text, { admins = [], t }) {
  const raw = String(text || "").trim();
  if (!raw) return [];
  const f = fold(raw.replace(/^@/, ""));
  const out = [];
  const tk = (k) => t(`auditLog.token.${k}`);
  if (raw.startsWith("@") || f.length >= 2) {
    for (const a of admins) {
      if (!a?.username || !fold(a.username).includes(f)) continue;
      out.push({ kind: "actor", value: a.username, label: `@${a.username}`, hint: tk("actor") });
      if (out.length >= 4) break;
    }
    if (fold("ajan").includes(f) || fold(t("auditLog.agent")).includes(f)) out.push({ kind: "actor", value: "agent", label: t("auditLog.agent"), hint: tk("actor") });
    out.push({ kind: "target", value: raw.replace(/^@/, ""), label: `@${raw.replace(/^@/, "")}`, hint: tk("target") });
  }
  for (const c of CATEGORIES) if (fold(t(`auditLog.cat.${c}`)).includes(f)) out.push({ kind: "cat", value: c, label: t(`auditLog.cat.${c}`), hint: tk("cat") });
  for (const s of SEVERITIES) if (fold(t(`auditLog.sev.${s}`)).includes(f)) out.push({ kind: "sev", value: s, label: t(`auditLog.sev.${s}`), hint: tk("sev") });
  for (const r of RANGES) if (r !== "all" && fold(t(`auditLog.range.${r}`)).includes(f)) out.push({ kind: "range", value: r, label: t(`auditLog.range.${r}`), hint: tk("range") });
  for (const code of Object.keys(ACT)) {
    if (out.filter((o) => o.kind === "action").length >= 4) break;
    if (fold(t(`auditLog.act.${code}`)).includes(f) || code.includes(f)) out.push({ kind: "action", value: code, label: t(`auditLog.act.${code}`), hint: tk("action") });
  }
  out.push({ kind: "text", value: raw, label: raw, hint: tk("text") });
  return out.slice(0, 10);
}

/** Text of one token chip: { kindLabel, valueLabel }. */
export function tokenText(tok, t) {
  const vals = Array.isArray(tok.value) ? tok.value : [tok.value];
  let value;
  if (tok.kind === "actor") value = vals.map((v) => (v === "agent" ? t("auditLog.agent") : v === "@me" ? t("auditLog.views.mine") : handle(v))).join(", ");
  else if (tok.kind === "cat") value = vals.map((v) => t(`auditLog.cat.${v}`)).join(", ");
  else if (tok.kind === "sev") value = vals.map((v) => t(`auditLog.sev.${v}`)).join(", ");
  else if (tok.kind === "action") value = vals.map((v) => t(actionInfo(v).labelKey)).join(", ");
  else if (tok.kind === "target") value = handle(vals[0]);
  else if (tok.kind === "source") value = t(`auditLog.source.${vals[0]}`);
  else if (tok.kind === "flag") value = t("auditLog.kpi.undone");
  else if (tok.kind === "range") value = vals[0] === "custom" ? t("auditLog.range.custom") : t(`auditLog.range.${vals[0]}`);
  else value = String(vals[0]);
  return { kindLabel: t(`auditLog.token.${tok.kind}`), valueLabel: value };
}

/* ------------------------------------------------------------------ */
/* views                                                               */
/* ------------------------------------------------------------------ */

/** Built-in views (draft order: Tümü, saved views, Kritik, Ajan, Ekonomi, Benim). */
export const BUILTIN_VIEWS = [
  { id: "all", icon: "list", query: {} },
  { id: "critical", icon: "alert", query: { sev: "critical" } },
  { id: "agent", icon: "bot", query: { source: "agent" } },
  { id: "economy", icon: "coin", query: { cat: "economy" } },
  { id: "mine", icon: "user", query: { actor: "@me" } },
];

/** Whether the current tokens are exactly a view's query. */
export function sameQuery(a, b) {
  const norm = (q) => {
    const o = {};
    for (const [k, v] of Object.entries(q || {})) {
      if (v == null || v === "" || k === "merge") continue;
      o[k] = String(v).split(",").map((x) => x.trim()).filter(Boolean).sort().join(",");
    }
    return JSON.stringify(Object.keys(o).sort().map((k) => [k, o[k]]));
  };
  return norm(a) === norm(b);
}

/** Query string from an object (skips empty values). */
export function qs(params) {
  const out = new URLSearchParams();
  for (const [k, v] of Object.entries(params || {})) {
    if (v === undefined || v === null || v === "") continue;
    out.set(k, String(v));
  }
  const s = out.toString();
  return s ? `?${s}` : "";
}

/* ------------------------------------------------------------------ */
/* details line, before / after, request                               */
/* ------------------------------------------------------------------ */

/**
 * Bits of the "Ayrıntı" column, each { key, vars } or { text }.
 * @param {object} entry
 * @param {{series?: {index: number, count: number}}} [ctx] anomaly series position
 */
export function detailBits(entry, ctx = {}) {
  const m = entry?.meta || {};
  const a = String(entry?.action || "");
  const bits = [];
  if (a === "ban" || a === "timeout" || a === "ban_extend" || a === "timeout_extend") {
    const d = durationOf(secondsOf(entry));
    bits.push({ key: d.key, vars: { n: d.n } });
    if (m.category) bits.push({ category: m.category });
  }
  if (a === "agent_run") {
    bits.push({ key: "auditLog.d.tools", vars: { n: entry.count || 0 } });
    bits.push({ key: entry.ok ? "auditLog.d.toolsOk" : "auditLog.d.toolsFailed", vars: {} });
  }
  if (a === "premium_denied" || a === "access_denied") {
    if (m.method || m.path) bits.push({ text: `${m.method || ""} ${m.path || entry.target || ""}`.trim() });
    bits.push({ text: String(m.status || 403) });
    bits.push({ key: "auditLog.d.noPermission", vars: {} });
  }
  if (a === "descoin_grant" && m.amount != null) bits.push({ key: "auditLog.d.amount", vars: { n: Number(m.amount) || 0 } });
  if ((a === "dm_view" || a === "group_view" || a === "server_channel_view") && m.purpose) bits.push({ key: `auditLog.d.purpose.${["report", "security", "legal"].includes(m.purpose) ? m.purpose : "other"}`, vars: {} });
  if (a === "appeal_accept" || a === "appeal_reject") bits.push({ key: m.lifted ? "auditLog.d.lifted" : "auditLog.d.appeal", vars: {} });
  if (m.fromReport) bits.push({ key: "auditLog.d.fromReport", vars: {} });
  if (m.via === "agent") bits.push({ key: "auditLog.d.viaAgent", vars: { code: m.planCode || "" } });
  if (m.undoOf) bits.push({ key: "auditLog.d.undoOf", vars: {} });
  if (m.linkedTo) bits.push({ key: "auditLog.d.linkedTo", vars: {} });
  const text = m.reason || m.note || m.title || m.name || m.message || null;
  if (text && typeof text === "string" && !bits.some((b) => b.text === text)) bits.push({ text: text.length > 80 ? `${text.slice(0, 79)}…` : text });
  if (ctx.series) bits.push({ key: "auditLog.d.series", vars: { i: ctx.series.index, n: ctx.series.count } });
  if (m.emailed) bits.push({ key: "auditLog.d.emailed", vars: {} });
  if (Number(m.sessionsRevoked) > 0) bits.push({ key: "auditLog.d.sessions", vars: { n: Number(m.sessionsRevoked) } });
  return bits;
}

/** Copies folded into the row: n >= 2 shows "n kayıt birleştirildi". */
export function mergedCount(entry) {
  return 1 + (entry?.merged?.length || 0) + (entry?.twins?.length || 0);
}

/**
 * Before / after rows for the "Değişiklik" tab.
 * @returns {{field: string, before: any, after: any, same?: boolean}[]} field = auditLog.diff.<field>
 */
export function diffRows(entry) {
  const m = entry?.meta || {};
  const a = String(entry?.action || "");
  const rows = [];
  if (a === "ban") {
    rows.push({ field: "status", before: { key: "auditLog.diff.active" }, after: { key: "auditLog.diff.banned" } });
    rows.push({ field: "banEnd", before: { key: "auditLog.diff.none" }, after: m.expiresAt ? { date: m.expiresAt } : { key: "auditLog.dur.permanent" } });
    if (m.category) rows.push({ field: "reason", before: { key: "auditLog.diff.none" }, after: { category: m.category } });
    if (m.sessionsRevoked != null) rows.push({ field: "sessions", before: { text: String(m.sessionsRevoked) }, after: { text: "0" } });
    rows.push({ field: "accessBan", before: { key: "auditLog.diff.none" }, after: Number(m.accessBan) > 0 ? { key: "auditLog.diff.added", n: Number(m.accessBan) } : { key: "auditLog.diff.none" }, same: !(Number(m.accessBan) > 0) });
  } else if (a === "unban" || a === "untimeout") {
    rows.push({ field: "status", before: { key: a === "unban" ? "auditLog.diff.banned" : "auditLog.diff.muted" }, after: { key: "auditLog.diff.active" } });
  } else if (a === "timeout") {
    rows.push({ field: "status", before: { key: "auditLog.diff.active" }, after: { key: "auditLog.diff.muted" } });
    if (m.until) rows.push({ field: "muteEnd", before: { key: "auditLog.diff.none" }, after: { date: m.until } });
    if (m.category) rows.push({ field: "reason", before: { key: "auditLog.diff.none" }, after: { category: m.category } });
  } else if (a === "wallet_freeze" || a === "wallet_unfreeze") {
    const frozen = a === "wallet_freeze";
    rows.push({ field: "wallet", before: { key: frozen ? "auditLog.diff.open" : "auditLog.diff.frozen" }, after: { key: frozen ? "auditLog.diff.frozen" : "auditLog.diff.open" } });
  } else if (a === "admin_permissions") {
    const list = (v) => (v === "all" || v == null ? { key: "auditLog.diff.allSections" } : { sections: Array.isArray(v) ? v : [] });
    rows.push({ field: "sections", before: list(m.before), after: list(m.after) });
  } else if (a === "ban_extend" || a === "timeout_extend") {
    rows.push({ field: a === "ban_extend" ? "banEnd" : "muteEnd", before: m.from ? { date: m.from } : { key: "auditLog.diff.none" }, after: m.until || m.to ? { date: m.until || m.to } : { key: "auditLog.diff.none" } });
  } else if (m.before !== undefined || m.after !== undefined) {
    rows.push({ field: "value", before: { text: fmtValue(m.before) }, after: { text: fmtValue(m.after) } });
  } else if (m.changes && typeof m.changes === "object") {
    for (const [k, v] of Object.entries(m.changes).slice(0, 12)) {
      if (v && typeof v === "object" && ("from" in v || "to" in v)) rows.push({ field: k, raw: true, before: { text: fmtValue(v.from) }, after: { text: fmtValue(v.to) } });
      else rows.push({ field: k, raw: true, before: { key: "auditLog.diff.unknown" }, after: { text: fmtValue(v) } });
    }
  }
  return rows;
}

function fmtValue(v) {
  if (v == null) return "—";
  if (Array.isArray(v)) return v.join(", ") || "—";
  if (typeof v === "object") {
    try {
      return JSON.stringify(v);
    } catch {
      return "…";
    }
  }
  return String(v);
}

/** "Descall Desktop 3.4 · Windows" from a user agent. */
export function deviceOf(ua) {
  const s = String(ua || "");
  if (!s) return "";
  let app = "";
  const m = s.match(/Descall[/ ]?(?:Desktop)?[/ ]?([0-9.]+)?/i);
  if (/Electron/i.test(s) || /DescallDesktop|Descall Desktop/i.test(s)) app = "Descall Desktop";
  else if (m) app = "Descall";
  else if (/Edg\//.test(s)) app = "Edge";
  else if (/Chrome\//.test(s)) app = "Chrome";
  else if (/Firefox\//.test(s)) app = "Firefox";
  else if (/Safari\//.test(s)) app = "Safari";
  const ver = (s.match(/(?:Descall(?:Desktop)?|Electron|Chrome|Firefox|Version|Edg)\/([0-9]+(?:\.[0-9]+)?)/) || [])[1];
  let os = "";
  if (/Windows NT 10/.test(s)) os = "Windows";
  else if (/Windows/.test(s)) os = "Windows";
  else if (/iPad/.test(s)) os = "iPadOS";
  else if (/iPhone/.test(s)) os = "iOS";
  else if (/Mac OS X|Macintosh/.test(s)) os = "macOS";
  else if (/Android/.test(s)) os = "Android";
  else if (/Linux/.test(s)) os = "Linux";
  const left = [app, ver].filter(Boolean).join(" ");
  return [left, os].filter(Boolean).join(" · ") || s.slice(0, 60);
}

/** Error code from an undo / review answer -> message key. */
export function errorKey(err) {
  const code = String(err?.code || "");
  const known = ["ALREADY_UNDONE", "ALREADY_REVERSED", "SUPERSEDED", "NO_PERMISSION", "NOT_UNDOABLE", "TARGET_MISSING", "REASON_REQUIRED", "ANOMALY_CLOSED", "VIEWS_UNAVAILABLE", "VIEWS_LIMIT", "RULES_UNAVAILABLE", "NOTES_UNAVAILABLE", "OWNER_ONLY", "SELF", "OWNER_PROTECTED", "STEP_UP_REQUIRED"];
  return known.includes(code) ? `auditLog.err.${code}` : null;
}

/** Undo copy family of an action (title / button keys under auditLog.undo.<family>). */
export function undoFamily(action) {
  return (
    {
      ban: "ban",
      timeout: "timeout",
      wallet_freeze: "wallet",
      access_ban: "access",
      premium_grant: "premium",
      special_badge_grant: "badge",
      server_directory_hide: "directory",
    }[String(action || "")] || null
  );
}

/** Dot positions (0..100 %) for the anomaly minute timeline. */
export function timelineDots(from, to, times) {
  const a = Date.parse(from || "");
  const b = Date.parse(to || "");
  const span = Math.max(1, b - a);
  return (times || []).map((x) => {
    const t = Date.parse(x || "");
    if (!Number.isFinite(t) || !Number.isFinite(a)) return 50;
    return Math.round(Math.min(96, Math.max(4, 4 + ((t - a) / span) * 92)) * 10) / 10;
  });
}

/** Deep link to one entry: "<origin>/admin/panel#audit/<id>". */
export function entryLink(origin, id) {
  return `${String(origin || "").replace(/\/$/, "")}/admin/panel#audit/${encodeURIComponent(id)}`;
}

export function parseEntryLink(hash) {
  const m = /^#audit\/(.+)$/.exec(String(hash || ""));
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]).slice(0, 120);
  } catch {
    return null;
  }
}

/** Avatar initial + gradient from a name (stable). */
const AV = [
  ["#4f7cff", "#3654c9"],
  ["#e0569b", "#a8336f"],
  ["#f0932b", "#b9631a"],
  ["#2fbf8f", "#1d8a66"],
  ["#ff9a5c", "#c75a26"],
  ["#5ac8d8", "#2f8f9c"],
  ["#9b5de5", "#6a3bb0"],
  ["#ff6f91", "#c0435f"],
  ["#c9a227", "#8f7212"],
  ["#6fd36f", "#3e9a3e"],
];
export function avatarStyle(name) {
  const s = String(name || "?");
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  const [a, b] = AV[h % AV.length];
  return { background: `linear-gradient(145deg, ${a}, ${b})` };
}

/** Series colours of the activity chart (draft: blue, pink, orange, green; others gray). */
export const SERIES_COLORS = ["#587af5", "#e0569b", "#f0932b", "#2fbf8f"];
export const OTHER_COLOR = "rgba(160, 166, 190, 0.45)";

/** Bar height (%) of the tallest stacked bucket = 100. */
export function chartScale(buckets) {
  let max = 1;
  for (const b of buckets || []) max = Math.max(max, (b.counts || []).reduce((s, x) => s + x, 0) + (b.other || 0));
  return max;
}

/** Undo choices the review dialog offers for an anomaly. */
export function reviewChoices(anomaly, { canUndo = true } = {}) {
  const out = [{ id: "reviewed" }];
  if (canUndo && ["ban", "timeout", "wallet_freeze", "access_ban", "premium_grant", "special_badge_grant"].includes(anomaly?.action)) out.push({ id: "undo" });
  if (anomaly?.section && anomaly?.actor && !anomaly.actor.owner) out.push({ id: "suspend" });
  return out;
}
