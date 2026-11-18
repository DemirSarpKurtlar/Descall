/**
 * Yönetici Paneli > Ajan, operasyon modu (Taslak B · Plan paneli): pure helpers for the
 * plan panel. No React, no fetch. Tested by agentOps.selftest.mjs.
 */
import { formatNumber } from "../../../i18n/format.js";
import { getLocale } from "../../../i18n/runtime.js";

export const MODES = Object.freeze(["read", "dry", "apply"]);
export const MODE_KEY = "descall:agentMode";
export const SCOPE_IDS = Object.freeze(["read", "moderation", "wallet", "announcements", "livepopup", "shop", "badges", "dm"]);
export const TABS = Object.freeze(["plan", "queue", "history", "scopes"]);
export const GROUP_MODES = Object.freeze(["grouped", "risk", "cluster"]);
export const ROWS_PER_GROUP = 4;
export const UNDO_WINDOW_MS = 30 * 60 * 1000;

/** Chip tone and icon per action (draft classes .act.ban / .mute / .coin / .watch). */
export const ACTION_META = Object.freeze({
  ban: { tone: "ban", icon: "ban" },
  timeout: { tone: "mute", icon: "timer" },
  kick: { tone: "ban", icon: "logout" },
  revoke_sessions: { tone: "ban", icon: "logout" },
  unban: { tone: "ok", icon: "unlock" },
  untimeout: { tone: "ok", icon: "unlock" },
  wallet_freeze: { tone: "coin", icon: "coin" },
  wallet_unfreeze: { tone: "coin", icon: "coin" },
  descoin_grant: { tone: "coin", icon: "coin" },
  badge_grant: { tone: "ok", icon: "badge" },
  badge_revoke: { tone: "watch", icon: "badge" },
  shop_gift: { tone: "watch", icon: "gift" },
  announcement: { tone: "watch", icon: "mega" },
  live_popup: { tone: "watch", icon: "win" },
});

export const SCOPE_META = Object.freeze({
  read: { icon: "eye", tone: "green" },
  moderation: { icon: "ban", tone: "red" },
  wallet: { icon: "coin", tone: "violet" },
  announcements: { icon: "mega", tone: "blue" },
  livepopup: { icon: "win", tone: "blue" },
  shop: { icon: "bag", tone: "amber" },
  badges: { icon: "badge", tone: "green" },
  dm: { icon: "mail", tone: "red" },
});

const UNDOABLE = new Set(["ban", "timeout", "wallet_freeze", "wallet_unfreeze", "descoin_grant", "badge_grant", "announcement"]);

export function normalizeMode(raw) {
  return MODES.includes(raw) ? raw : "dry";
}

/** "#P-0412" */
export function planCode(code) {
  const n = Number(code);
  return `P-${String(Number.isFinite(n) ? n : 0).padStart(4, "0")}`;
}

/** Risk colour class: h (70+), m (50+), l. */
export function riskClass(risk) {
  const n = Number(risk);
  if (!Number.isFinite(n)) return "l";
  return n >= 70 ? "h" : n >= 50 ? "m" : "l";
}

/** Signal tone -> chip class. */
export function toneClass(tone) {
  return tone === "hot" ? "hot" : tone === "warn" ? "am" : "";
}

/**
 * Duration of a ban / timeout item as an i18n key + vars: {key: "agentOps.dur.30d"} or
 * {key: "agentOps.dur.seconds", vars: {n: minutes}}.
 */
export function durationKey(params = {}) {
  if (params.durationSeconds) return { key: "agentOps.dur.seconds", vars: { n: Math.round(Number(params.durationSeconds) / 60) } };
  if (params.presetId) return { key: `agentOps.dur.${params.presetId}`, vars: {} };
  return null;
}

/**
 * Parts of an action chip label ("Yasakla · Spam · 30 gün"): [{key, vars} | {text}].
 * `categoryText` turns a category id into its label.
 */
export function actionLabelParts(action, params = {}, categoryText = (id) => id) {
  const p = params || {};
  const parts = [];
  if (action === "descoin_grant" && Number(p.amount) < 0) parts.push({ key: "agentOps.act.descoin_revoke" });
  else parts.push({ key: `agentOps.act.${action}` });
  if (["ban", "timeout", "kick"].includes(action) && p.category) parts.push({ text: categoryText(p.category, p.otherText) });
  if (action === "ban" || action === "timeout") {
    const d = durationKey(p);
    if (d) parts.push(d);
  }
  if (action === "descoin_grant" && p.amount) parts.push({ text: `${formatNumber(Math.abs(Number(p.amount)), getLocale())} DC` });
  if ((action === "badge_grant" || action === "badge_revoke") && p.badgeId) parts.push({ text: p.badgeId });
  if ((action === "announcement" || action === "live_popup") && p.title) parts.push({ text: p.title });
  return parts;
}

export function joinLabel(parts, t) {
  return parts.map((p) => (p.text != null ? p.text : t(p.key, p.vars))).filter(Boolean).join(" · ");
}

/** Stable key of a group: same action and same params. */
export function groupKey(item) {
  return `${item.action}|${stableJson(item.params || {})}`;
}

function stableJson(v) {
  if (Array.isArray(v)) return `[${v.map(stableJson).join(",")}]`;
  if (v && typeof v === "object") return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stableJson(v[k])}`).join(",")}}`;
  return JSON.stringify(v ?? null);
}

function fold(s) {
  return String(s || "")
    .toLocaleLowerCase("tr-TR")
    .replace(/ı/g, "i")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

/** Whether an item matches the plan search box (username, signals, cluster, reason). */
export function matchesQuery(item, query) {
  const q = fold(query).trim().replace(/^@/, "");
  if (!q) return true;
  const ev = item.evidence || {};
  const hay = [item.username, item.cluster, ev.reason, ev.quote, ...(ev.signals || []).map((s) => s.label), item.params?.title]
    .map(fold)
    .join(" ");
  return hay.includes(q);
}

/**
 * Plan rows for the Plan tab.
 * mode "grouped": one group per action + params (draft B1), in plan order;
 * "risk": one flat group sorted by risk (highest first);
 * "cluster": one group per cluster name.
 * Excluded items are returned separately.
 * @returns {{ groups: {key, kind, action?, params?, cluster?, items}[], excluded: object[], total: number, selected: number }}
 */
export function buildGroups(items, { mode = "grouped", query = "" } = {}) {
  const live = (items || []).filter((i) => i.status !== "excluded");
  const excluded = (items || []).filter((i) => i.status === "excluded");
  const visible = live.filter((i) => matchesQuery(i, query));
  const groups = [];
  if (mode === "risk") {
    const sorted = [...visible].sort((a, b) => (Number(b.risk) || -1) - (Number(a.risk) || -1) || a.seq - b.seq);
    if (sorted.length) groups.push({ key: "risk", kind: "risk", items: sorted });
  } else if (mode === "cluster") {
    const by = new Map();
    for (const i of visible) {
      const k = i.cluster || "";
      if (!by.has(k)) by.set(k, []);
      by.get(k).push(i);
    }
    for (const [k, list] of by) groups.push({ key: `c:${k}`, kind: "cluster", cluster: k || null, items: list });
    groups.sort((a, b) => (a.cluster ? 0 : 1) - (b.cluster ? 0 : 1) || b.items.length - a.items.length);
  } else {
    const by = new Map();
    for (const i of visible) {
      const k = groupKey(i);
      if (!by.has(k)) by.set(k, { key: k, kind: "action", action: i.action, params: i.params || {}, items: [] });
      by.get(k).items.push(i);
    }
    groups.push(...by.values());
  }
  return {
    groups,
    excluded,
    total: live.length,
    selected: live.filter((i) => i.selected).length,
  };
}

/** Group checkbox state: "on" | "off" | "mix". */
export function groupCheckState(items) {
  const sel = (items || []).filter((i) => i.selected).length;
  if (!sel) return "off";
  return sel === items.length ? "on" : "mix";
}

/** Account age "2 gün" as {key, count} from an ISO date. */
export function ageKey(createdAt, now = Date.now()) {
  const t = Date.parse(createdAt || "");
  if (!Number.isFinite(t)) return null;
  const mins = Math.max(0, Math.floor((now - t) / 60000));
  if (mins < 60) return { key: "agentOps.age.minutes", count: mins };
  const hours = Math.floor(mins / 60);
  if (hours < 24) return { key: "agentOps.age.hours", count: hours };
  const days = Math.floor(hours / 24);
  if (days < 60) return { key: "agentOps.age.days", count: days };
  const months = Math.floor(days / 30);
  if (months < 24) return { key: "agentOps.age.months", count: months };
  return { key: "agentOps.age.years", count: Math.floor(days / 365) };
}

/** Widths (percent) of the dry-run bar: green apply, amber warn, red skip + block. */
export function dryBar(summary) {
  const s = summary || {};
  const total = Math.max(0, Number(s.total) || 0);
  if (!total) return { g: 0, a: 0, r: 0 };
  const pct = (n) => Math.round(((Number(n) || 0) / total) * 1000) / 10;
  return { g: pct(s.apply), a: pct(s.warn), r: pct((Number(s.skip) || 0) + (Number(s.block) || 0)) };
}

/** Queue progress bar: done green, skipped/failed red, running striped blue. */
export function queueBar(counts) {
  const c = counts || {};
  const total = Math.max(0, Number(c.total) || 0);
  if (!total) return { g: 0, r: 0, b: 0 };
  const pct = (n) => Math.round(((Number(n) || 0) / total) * 1000) / 10;
  return { g: pct((c.done || 0) + (c.undone || 0)), r: pct((c.skipped || 0) + (c.failed || 0) + (c.cancelled || 0)), b: pct(c.running) };
}

/** "29:12" (mm:ss) left until `until`; null when closed. */
export function countdown(until, now = Date.now()) {
  const t = Date.parse(until || "");
  if (!Number.isFinite(t)) return null;
  const left = Math.floor((t - now) / 1000);
  if (left <= 0) return null;
  const m = Math.floor(left / 60);
  const s = left % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** Items shown in the Kuyruk table (everything that was queued at approval). */
export function queueItems(items) {
  return (items || []).filter((i) => !["proposed", "excluded"].includes(i.status) || i.result?.phase === "approval");
}

/** Row state for the queue table: ok | fail | run | q | undo | cancel. */
export function rowState(item) {
  switch (item?.status) {
    case "done": return "ok";
    case "skipped":
    case "failed":
    case "undo_failed": return "fail";
    case "running": return "run";
    case "queued": return "q";
    case "undone": return "undo";
    case "cancelled": return "cancel";
    default: return "q";
  }
}

export function isLive(status) {
  return status === "running" || status === "paused" || status === "scheduled";
}

/** Whether "Tümünü geri al" applies: any done, undoable item while the window is open. */
export function canUndoAny(plan, items, now = Date.now()) {
  if (!countdown(plan?.undoUntil, now)) return false;
  return (items || []).some((i) => i.status === "done" && UNDOABLE.has(i.action));
}

/**
 * Chips under an assistant message that changed a plan (draft: "− @selinsu",
 * "@tuana.pxl: yasak → sustur"). Returns [{tone, key, vars}] for t().
 */
export function diffChips(diff, actionText = (a) => a) {
  const d = diff || {};
  const out = [];
  for (const r of d.removed || []) out.push(r.username ? { tone: "hot", key: "agentOps.diff.removed", vars: { name: r.username } } : { tone: "hot", key: "agentOps.diff.removedOther", vars: { action: actionText(r.action, r.params) } });
  for (const c of d.changed || []) out.push({ tone: "am", key: "agentOps.diff.changed", vars: { name: c.username || "", from: actionText(c.from?.action, c.from?.params), to: actionText(c.action, c.params) } });
  for (const a of d.added || []) out.push(a.username ? { tone: "gr", key: "agentOps.diff.added", vars: { name: a.username } } : { tone: "gr", key: "agentOps.diff.addedOther", vars: { action: actionText(a.action, a.params) } });
  return out;
}

/** Per-row diff mark for "v1 ile farkı gör": "added" | "changed" | null. */
export function rowDiffMark(item, diff) {
  if (!diff || !item) return null;
  const same = (x) => (x.userId ? x.userId === item.userId : x.action === item.action);
  if ((diff.added || []).some((a) => same(a) && a.action === item.action)) return "added";
  if ((diff.changed || []).some((c) => same(c) && c.action === item.action)) return "changed";
  return null;
}

/** Tool chips: consecutive uses of the same tool collapse into "Dosya ×14". */
export function toolChips(tools) {
  const out = [];
  for (const tool of tools || []) {
    const last = out[out.length - 1];
    if (last && last.name === tool.name) {
      last.count += 1;
      if (tool.status === "start") last.status = "start";
      else if (tool.status === "error" && last.status !== "start") last.status = "error";
    } else {
      out.push({ name: tool.name, count: 1, status: tool.status || "done" });
    }
  }
  return out;
}

/** Scope limit chip: { key, vars } or null. */
export function scopeLimit(id, scope) {
  if (id === "dm") return { key: "agentOps.scopes.lim.dm", vars: {} };
  if (!scope || scope.limit == null) return null;
  return { key: `agentOps.scopes.lim.${id}`, vars: { n: compactNumber(scope.limit) } };
}

/** 100000 -> "100K", 1500000 -> "1,5M" */
export function compactNumber(n) {
  const v = Number(n) || 0;
  if (v >= 1_000_000) return `${trimZero((v / 1_000_000).toFixed(1))}M`;
  if (v >= 10_000) return `${trimZero((v / 1000).toFixed(v % 1000 ? 1 : 0))}K`;
  return String(v);
}
function trimZero(s) {
  return s.replace(/\.0$/, "").replace(".", ",");
}

export function onCount(scopes) {
  return SCOPE_IDS.filter((id) => scopes?.[id]?.on).length;
}

/** Time picker presets for "Planı zamanla" (local time). */
export function schedulePresets(now = new Date()) {
  const in1h = new Date(now.getTime() + 60 * 60 * 1000);
  const tonight = new Date(now);
  tonight.setHours(3, 0, 0, 0);
  if (tonight <= now) tonight.setDate(tonight.getDate() + 1);
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(9, 0, 0, 0);
  return [
    { id: "in1h", at: in1h },
    { id: "tonight", at: tonight },
    { id: "tomorrow", at: tomorrow },
  ];
}

/** <input type="datetime-local"> value for a Date (local time). */
export function toLocalInput(date) {
  const d = date instanceof Date ? date : new Date(date);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** The user message that produced a plan: the last user text before the plan's message index. */
export function promptForPlan(messages, planId) {
  const list = messages || [];
  const idx = list.findIndex((m) => m.role === "assistant" && (m.plans || []).some((p) => p.planId === planId));
  const upto = idx < 0 ? list.length : idx;
  for (let i = upto - 1; i >= 0; i -= 1) if (list[i].role === "user" && list[i].text) return list[i].text;
  return "";
}

/** "09:30" <-> minutes after midnight. */
export function minutesToClock(m) {
  const v = Math.max(0, Math.min(1439, Number(m) || 0));
  return `${String(Math.floor(v / 60)).padStart(2, "0")}:${String(v % 60).padStart(2, "0")}`;
}
export function clockToMinutes(s) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || "").trim());
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (h > 23 || mi > 59) return null;
  return h * 60 + mi;
}

/** Ban params of a plan group -> the BanDialog form, and back. */
export function banFormFromParams(p = {}) {
  return {
    category: p.category || "spam",
    otherText: p.otherText || "",
    message: p.message || "",
    durationId: p.durationSeconds ? "custom" : p.presetId || "7d",
    customMinutes: p.durationSeconds ? String(Math.round(p.durationSeconds / 60)) : "",
    flags: {
      revokeSessions: p.revokeSessions !== false,
      notifyEmail: p.notifyEmail !== false,
      alsoAccessBan: Boolean(p.alsoAccessBan),
    },
  };
}
