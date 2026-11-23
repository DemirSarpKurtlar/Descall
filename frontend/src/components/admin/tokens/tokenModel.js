/**
 * Yönetici Paneli › Admin Token (owner pick Draft B "Liste ve çalışma alanı"): pure helpers.
 * No React, no DOM: status and expiry labels, relative times, list filter and search,
 * sparkline and bar chart geometry, IP / CIDR validation, connection snippets built from
 * the MCP URL, destructive-call detection, alert copy and the typed confirmations.
 * Tested by adminTokens.selftest.mjs.
 */
import { CHART } from "../adminPalette.js";

export const STATUSES = Object.freeze(["active", "paused", "expired", "revoked"]);
export const EXPIRY_OPTIONS = Object.freeze(["1h", "1d", "7d", "30d", "90d", "never"]);
export const EXPIRY_MS = Object.freeze({ "1h": 3600e3, "1d": 86400e3, "7d": 7 * 86400e3, "30d": 30 * 86400e3, "90d": 90 * 86400e3, never: 0 });
export const DEFAULT_EXPIRY = "30d";
export const GRACE_OPTIONS = Object.freeze([0, 60, 1440]);
export const DEFAULT_GRACE = 60;
export const REVOKE_REASONS = Object.freeze(["leaked", "unused", "replaced", "other"]);
export const AUTO_PAUSE_RULES = Object.freeze(["newCountry", "newIp", "burst"]);
export const FILTERS = Object.freeze(["all", "live", "dead"]);
export const SNIPPET_TABS = Object.freeze(["claudeCode", "desktop", "curl"]);
export const NAME_MAX = 60;
export const OTP_LENGTH = 6;
export const RESTORE_WINDOW_MS = 10 * 60 * 1000;
export const FRESH_SECRET_MS = 10 * 60 * 1000;
export const CALLS_POLL_MS = 3000;
export const LIST_POLL_MS = 30000;
export const CALLS_MAX = 50;
export const TOKEN_PREFIX = "dsk_admin_";
export const PLACEHOLDER = "<TOKEN>";
/** The server checks this exact phrase on POST /tokens/revoke-all (contract). */
export const PANIC_WORD = "T\u00dcM\u00dcN\u00dc \u0130PTAL ET";

// Red stays for danger (destructive marks, revoke), so no token is drawn red.
const PALETTE = CHART;

/* ---------- small utilities ---------- */

function ms(iso) {
  if (iso == null || iso === "") return NaN;
  const v = iso instanceof Date ? iso.getTime() : Date.parse(iso);
  return Number.isFinite(v) ? v : NaN;
}

/** Lower case, Turkish letters folded, so "gece" finds "Gece raporu" and "isik" finds "Işık". */
export function fold(text) {
  return String(text || "")
    .toLocaleLowerCase("tr")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ı/g, "i");
}

export function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

/* ---------- identity ---------- */

export const isLive = (t) => t?.status === "active" || t?.status === "paused";
export const statusKey = (s) => `atok.status.${STATUSES.includes(s) ? s : "expired"}`;
export const expiryKey = (e) => `atok.exp.${EXPIRY_OPTIONS.includes(e) ? e : "never"}`;

export function maskToken(t) {
  if (t?.masked) return String(t.masked);
  return `${TOKEN_PREFIX}${t?.prefix || "····"}…${t?.last4 || "····"}`;
}

/** "Claude Code" -> "CC", "moderasyon asistanı" -> "MA", "x" -> "X". */
export function initials(name) {
  const words = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "?";
  const letters = words.length === 1 ? [...words[0]].slice(0, 2) : words.slice(0, 2).map((w) => [...w][0]);
  return letters.join("").toLocaleUpperCase("tr");
}

/** Stable colour per token id (the list icon, the hero icon, the chart bars). */
export function tokenColor(id) {
  const s = String(id || "?");
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

/** Token colours by creation order (oldest first), so neighbours differ and a colour never moves. */
export function assignColors(tokens) {
  const order = [...(tokens || [])].sort((a, b) => (ms(a.createdAt) || 0) - (ms(b.createdAt) || 0) || String(a.id).localeCompare(String(b.id)));
  const map = new Map(order.map((t, i) => [t.id, PALETTE[i % PALETTE.length]]));
  return (tokens || []).map((t) => (t.color === map.get(t.id) ? t : { ...t, color: map.get(t.id) }));
}

export const colorOf = (t) => t?.color || tokenColor(t?.id);

/* ---------- list ---------- */

export function filterTokens(tokens, { filter = "all", query = "" } = {}) {
  const q = fold(query).trim();
  return (tokens || []).filter((t) => {
    if (filter === "live" && !isLive(t)) return false;
    if (filter === "dead" && isLive(t)) return false;
    if (!q) return true;
    return [t.name, t.prefix, t.last4, maskToken(t), t.lastClient].some((v) => fold(v).includes(q));
  });
}

export function countByFilter(tokens) {
  const list = tokens || [];
  const live = list.filter(isLive).length;
  return { all: list.length, live, dead: list.length - live };
}

/** Which token the workspace opens first: the one with an open alert, else the first live one. */
export function defaultSelection(tokens) {
  const list = tokens || [];
  return (list.find((t) => t.hasOpenAlert && isLive(t)) || list.find((t) => t.status === "active") || list.find(isLive) || list[0] || null)?.id || null;
}

/* ---------- time ---------- */

/** Relative time as a locale key: "şimdi", "13 sn önce", "4 dk önce", "10 sa önce", "3 gün önce". */
export function agoLabel(iso, now = Date.now()) {
  const t = ms(iso);
  if (!Number.isFinite(t)) return { key: "atok.ago.never", vars: {} };
  const s = Math.max(0, Math.floor((now - t) / 1000));
  if (s < 5) return { key: "atok.ago.now", vars: {} };
  if (s < 60) return { key: "atok.ago.s", vars: { n: s } };
  const m = Math.floor(s / 60);
  if (m < 60) return { key: "atok.ago.m", vars: { n: m } };
  const h = Math.floor(m / 60);
  if (h < 24) return { key: "atok.ago.h", vars: { n: h } };
  return { key: "atok.ago.d", vars: { n: Math.floor(h / 24) } };
}

/** Time left until an instant: "12 dk kaldı", "5 sa kaldı" (under 48 h), "21 gün kaldı". */
export function leftLabel(iso, now = Date.now()) {
  const t = ms(iso);
  if (!Number.isFinite(t)) return { key: "atok.left.none", vars: {} };
  const s = (t - now) / 1000;
  if (s <= 0) return { key: "atok.left.over", vars: {} };
  const m = Math.max(1, Math.floor(s / 60));
  if (m < 60) return { key: "atok.left.m", vars: { n: m } };
  const h = Math.floor(m / 60);
  if (h < 48) return { key: "atok.left.h", vars: { n: h } };
  return { key: "atok.left.d", vars: { n: Math.floor(h / 24) } };
}

/** The Geçerlilik sub line of a token. */
export function validityLabel(token, now = Date.now()) {
  if (!token) return { key: "atok.left.none", vars: {} };
  if (token.status === "revoked") return { key: "atok.left.revoked", vars: {} };
  if (token.status === "expired") return { key: "atok.left.over", vars: {} };
  if (!token.expiresAt) return { key: "atok.left.none", vars: {} };
  return leftLabel(token.expiresAt, now);
}

export function expiryEnd(expiresIn, now = Date.now()) {
  const d = EXPIRY_MS[expiresIn];
  return d ? new Date(now + d) : null;
}

/** Seconds left to undo a revoke (0 when the window closed). */
export function restoreLeft(token, now = Date.now()) {
  if (!token || token.status !== "revoked") return 0;
  const t = ms(token.restorableUntil);
  return Number.isFinite(t) ? Math.max(0, Math.floor((t - now) / 1000)) : 0;
}

export function clock(sec) {
  const s = Math.max(0, Math.floor(sec || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Live tokens that stop working within `within` ms (the alerts panel's reminder). */
export function expiringSoon(tokens, now = Date.now(), within = 24 * 3600e3) {
  return (tokens || []).filter((t) => {
    if (t.status !== "active") return false;
    const e = ms(t.expiresAt);
    return Number.isFinite(e) && e > now && e - now <= within;
  });
}

/** Old secret still accepted after a rotate. */
export function inGrace(token, now = Date.now()) {
  const g = ms(token?.graceUntil);
  return Number.isFinite(g) && g > now;
}

/* ---------- numbers ---------- */

/** Change against yesterday in whole percent; null when yesterday had no traffic. */
export function deltaPct(cur, prev) {
  const c = Number(cur) || 0;
  const p = Number(prev) || 0;
  if (p <= 0) return null;
  return Math.round((c / p - 1) * 100);
}

/** A 0..1 ratio as a percent number with at most one decimal (0.006 -> 0.6, 0.58 -> 58). */
export function pct(ratio, digits = 1) {
  const v = (Number(ratio) || 0) * 100;
  const f = 10 ** digits;
  return Math.round(v * f) / f;
}

/** MCP / REST split that always adds up to 100. */
export function shareSplit(mcp, rest) {
  const a = Math.max(0, Number(mcp) || 0);
  const b = Math.max(0, Number(rest) || 0);
  const sum = a + b;
  if (!sum) return { mcp: 0, rest: 0 };
  const m = Math.round((a / sum) * 100);
  return { mcp: m, rest: 100 - m };
}

/** Upper bound of a chart axis: 1, 2 or 5 times a power of ten (980 -> 1000, 1284 -> 2000). */
export function niceMax(values, floor = 10) {
  const max = Math.max(floor, ...(values || []).map((v) => Number(v) || 0));
  const p = 10 ** Math.floor(Math.log10(max));
  for (const m of [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * p >= max) return Math.round(m * p);
  return Math.round(10 * p);
}

/* ---------- charts ---------- */

/** Sparkline paths in a w x h box. One point or none draws nothing; a flat line sits low. */
export function sparkPaths(values, w = 100, h = 30) {
  const v = (values || []).map((x) => (Number.isFinite(Number(x)) ? Number(x) : 0));
  if (v.length < 2) return { line: "", area: "", max: v[0] || 0 };
  const max = Math.max(...v);
  const pad = 2;
  const pts = v.map((x, i) => [(i * w) / (v.length - 1), max > 0 ? h - pad - (x / max) * (h - pad * 2) : h - pad]);
  const line = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");
  return { line, area: `${line} L${w.toFixed(1)} ${h.toFixed(1)} L0.0 ${h.toFixed(1)} Z`, max };
}

/**
 * 24 hourly bars (oldest first). Each: total height and the red destructive part, both in
 * percent of the axis top; a destructive hour always shows at least a 3 % sliver.
 */
export function hourBars(hourly, top) {
  const list = (hourly || []).map((h) => ({ hour: h?.hour || null, count: Math.max(0, Number(h?.count) || 0), destructive: Math.max(0, Number(h?.destructive) || 0) }));
  const axis = top || niceMax(list.map((h) => h.count));
  return list.map((h) => {
    const total = axis ? (h.count / axis) * 100 : 0;
    const dest = h.destructive ? Math.max(3, Math.min(total, (Math.min(h.count, h.destructive * 14) / axis) * 100)) : 0;
    return { ...h, total: clamp(total, 0, 100), dest: clamp(dest, 0, 100), normal: clamp(total - dest, 0, 100) };
  });
}

/** Busiest hour, first hour with traffic, hourly average (the "günün özeti" tiles). */
export function daySummary(hourly) {
  const list = hourly || [];
  let peak = -1;
  let peakCount = 0;
  let first = -1;
  let sum = 0;
  list.forEach((h, i) => {
    const c = Number(h?.count) || 0;
    sum += c;
    if (c > peakCount) {
      peak = i;
      peakCount = c;
    }
    if (c > 0 && first < 0) first = i;
  });
  return {
    peakHour: peak >= 0 ? list[peak].hour : null,
    peakCount,
    firstHour: first >= 0 ? list[first].hour : null,
    perHour: list.length ? Math.round(sum / list.length) : 0,
    total: sum,
  };
}

/** Indices of the x axis labels: start, every 6 hours, now. */
export function axisTicks(n = 24) {
  if (n < 2) return [];
  const out = [];
  for (let i = 0; i < n - 1; i += 6) out.push(i);
  out.push(n - 1);
  return out;
}

/* ---------- destructive calls ---------- */

/** "ban" | "delete" | "descoin" | "broadcast" | null for a call or an endpoint row. */
export function destructiveKind(row) {
  if (!row) return null;
  if (["ban", "delete", "descoin", "broadcast"].includes(row.destructiveKind)) return row.destructiveKind;
  const method = String(row.method || "").toUpperCase();
  const path = String(row.tool || row.path || "").toLowerCase();
  if (/\b(ban|ban_user|timeout|kick)\b|\/ban\b|_ban\b/.test(path)) return "ban";
  if (/credit|descoin|wallet\/grant|grant_credits|\/grant\b/.test(path)) return "descoin";
  if (/announce|broadcast|popup/.test(path) && method !== "GET") return "broadcast";
  if (method === "DELETE" || /delete_|remove_message/.test(path)) return "delete";
  return null;
}

export function isDestructiveRow(row) {
  if (row && typeof row.destructive === "boolean") return row.destructive;
  if (String(row?.method || "").toUpperCase() === "GET") return false;
  return destructiveKind(row) != null;
}

/** "12 yasaklama · 9 silme · 14 DesCoin · 2 duyuru" pieces (zero counts left out). */
export function destructiveParts(d) {
  const src = d || {};
  return [
    ["ban", src.ban],
    ["delete", src.delete],
    ["descoin", src.descoin],
    ["broadcast", src.broadcast],
  ]
    .map(([kind, n]) => ({ kind, n: Math.max(0, Number(n) || 0) }))
    .filter((x) => x.n > 0);
}

/** MCP tools of the selected token, busiest first ("tools/call search_users" -> "search_users"). */
export function topTools(endpoints, limit = 6) {
  const out = [];
  for (const e of endpoints || []) {
    if (String(e?.method || "").toUpperCase() !== "MCP") continue;
    const m = /tools\/call\s+([\w.-]+)/.exec(String(e.path || ""));
    const name = m ? m[1] : String(e.path || "").trim();
    if (!name || out.some((x) => x.name === name)) continue;
    out.push({ name, count: Number(e.count) || 0, destructive: destructiveKind({ method: "MCP", path: name }) != null });
  }
  return out.sort((a, b) => b.count - a.count).slice(0, limit);
}

/** "MCP" when most of the token's traffic is MCP, else "REST". */
export function clientChannel(usage) {
  if (!usage) return null;
  const { mcp, rest } = shareSplit(usage.mcpShare, usage.restShare);
  if (!mcp && !rest) return null;
  return mcp >= rest ? "mcp" : "rest";
}

/* ---------- live calls ---------- */

/** Merge newly polled calls in front of the list (newest first, no duplicates, capped). */
export function mergeCalls(prev, incoming, max = CALLS_MAX) {
  const seen = new Set();
  const out = [];
  for (const c of [...(incoming || []), ...(prev || [])]) {
    if (!c || c.id == null || seen.has(c.id)) continue;
    seen.add(c.id);
    out.push(c);
  }
  out.sort((a, b) => (ms(b.at) || 0) - (ms(a.at) || 0));
  return out.slice(0, max);
}

export function newestAt(calls) {
  let best = null;
  let bestMs = -Infinity;
  for (const c of calls || []) {
    const v = ms(c?.at);
    if (Number.isFinite(v) && v > bestMs) {
      best = c.at;
      bestMs = v;
    }
  }
  return best;
}

export function statusTone(code) {
  const n = Number(code) || 0;
  if (n >= 500) return "s5";
  if (n >= 400) return "s4";
  return "s2";
}

/* ---------- IP lists ---------- */

function ipv4Parts(s) {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(s);
  if (!m) return null;
  const parts = m.slice(1).map(Number);
  if (parts.some((p) => p > 255)) return null;
  if (m.slice(1).some((p) => p.length > 1 && p.startsWith("0"))) return null;
  return parts;
}

function isIpv6(s) {
  if (!/^[0-9a-f:.]+$/i.test(s) || !s.includes(":")) return false;
  if ((s.match(/::/g) || []).length > 1) return false;
  let groups = s.split(":");
  const tail = groups[groups.length - 1];
  let extra = 0;
  if (tail.includes(".")) {
    if (!ipv4Parts(tail)) return false;
    groups = groups.slice(0, -1);
    extra = 2;
  }
  const filled = groups.filter((g) => g !== "");
  if (filled.some((g) => !/^[0-9a-f]{1,4}$/i.test(g))) return false;
  const count = filled.length + extra;
  return s.includes("::") ? count < 8 : count === 8;
}

/** One IPv4 / IPv6 address, or a CIDR range of one ("185.94.12.0/24", "2001:db8::/32"). */
export function isValidIpOrCidr(value) {
  const s = String(value || "").trim();
  if (!s || s.length > 64) return false;
  const [addr, bits, more] = s.split("/");
  if (more !== undefined) return false;
  const v4 = ipv4Parts(addr);
  const v6 = !v4 && isIpv6(addr);
  if (!v4 && !v6) return false;
  if (bits === undefined) return true;
  if (!/^\d{1,3}$/.test(bits)) return false;
  return Number(bits) <= (v4 ? 32 : 128);
}

/** Textarea / input text -> { list (deduped, in order), invalid }. Newlines, commas, spaces split. */
export function parseIpList(text) {
  const list = [];
  const invalid = [];
  for (const raw of String(text || "").split(/[\s,;]+/)) {
    const s = raw.trim();
    if (!s) continue;
    if (!isValidIpOrCidr(s)) {
      if (!invalid.includes(s)) invalid.push(s);
      continue;
    }
    const norm = s.toLowerCase();
    if (!list.includes(norm)) list.push(norm);
  }
  return { list, invalid };
}

/** Whether an address is covered by a list entry (IPv4 ranges; IPv6 exact match). */
export function ipAllowedBy(ip, list) {
  const a = ipv4Parts(String(ip || "").trim());
  const plain = String(ip || "").trim().toLowerCase();
  for (const entry of list || []) {
    const [base, bits] = String(entry).toLowerCase().split("/");
    if (bits === undefined) {
      if (base === plain) return true;
      continue;
    }
    const b = ipv4Parts(base);
    if (!a || !b) continue;
    const n = Number(bits);
    const toInt = (p) => ((p[0] << 24) >>> 0) + (p[1] << 16) + (p[2] << 8) + p[3];
    const mask = n === 0 ? 0 : (0xffffffff << (32 - n)) >>> 0;
    if (((toInt(a) & mask) >>> 0) === ((toInt(b) & mask) >>> 0)) return true;
  }
  return false;
}

/* ---------- connection snippets ---------- */

/** "https://api.descall.com/mcp" -> "https://api.descall.com". */
export function apiOrigin(mcpUrl) {
  const s = String(mcpUrl || "").trim();
  try {
    return new URL(s).origin;
  } catch {
    return s.replace(/\/mcp\/?$/, "").replace(/\/$/, "");
  }
}

export function mcpHost(mcpUrl) {
  try {
    const u = new URL(String(mcpUrl || ""));
    return `${u.host}${u.pathname.replace(/\/$/, "")}`;
  } catch {
    return String(mcpUrl || "").replace(/^https?:\/\//, "");
  }
}

/**
 * Snippet parts [cls, text] for one tab; cls: c command, s string, k key, p punctuation,
 * ph placeholder, tok the real secret (right after create / rotate). Text = parts joined.
 */
export function snippetParts(kind, mcpUrl, secret = null) {
  const url = String(mcpUrl || "").trim() || "https://example.invalid/mcp";
  const tok = secret ? ["tok", secret] : ["ph", PLACEHOLDER];
  if (kind === "desktop") {
    return [
      ["p", "{\n  "], ["k", "\"mcpServers\""], ["p", ": {\n    "], ["k", "\"descall\""], ["p", ": {\n      "],
      ["k", "\"command\""], ["p", ": "], ["s", "\"npx\""], ["p", ",\n      "], ["k", "\"args\""], ["p", ": [\n        "],
      ["s", "\"-y\""], ["p", ", "], ["s", "\"mcp-remote\""], ["p", ",\n        "], ["s", `"${url}"`], ["p", ",\n        "],
      ["s", "\"--header\""], ["p", ", "], ["s", "\"Authorization: Bearer "], tok, ["s", "\""], ["p", "\n      ]\n    }\n  }\n}"],
    ];
  }
  if (kind === "curl") {
    return [
      ["c", "curl"], ["p", " "], ["s", `"${apiOrigin(url)}/api/admin/users?limit=5"`], ["p", " \\\n  -H "],
      ["s", "\"Authorization: Bearer "], tok, ["s", "\""], ["p", " \\\n  -H "], ["s", "\"Accept: application/json\""],
    ];
  }
  return [
    ["c", "claude"], ["p", " mcp add --transport http descall "], ["s", url], ["p", " --header "],
    ["s", "\"Authorization: Bearer "], tok, ["s", "\""],
  ];
}

export function snippetText(kind, mcpUrl, secret = null) {
  return snippetParts(kind, mcpUrl, secret).map((p) => p[1]).join("");
}

/* ---------- alerts ---------- */

/** Extra line for why an address counts as new (detail.reason), or null. */
export function alertReason(detail) {
  const d = detail || {};
  if (d.reason === "first_use") return { key: "atok.alert.reasonFirstUse", vars: {} };
  if (d.reason === "idle_return") return d.idleDays != null ? { key: "atok.alert.reasonIdleReturn", vars: { days: Number(d.idleDays) || 0 } } : null;
  if (d.reason === "untrusted_address") return { key: "atok.alert.reasonUntrusted", vars: {} };
  return null;
}

/** Title and body keys of an alert (contract Alert), with their values; `reason` may add a line. */
export function alertCopy(alert) {
  const a = alert || {};
  const d = a.detail || {};
  const reason = alertReason(d);
  const base = { token: a.tokenName || "", ip: a.ip || "-", country: a.country || "-" };
  if (a.kind === "burst") {
    const times = d.baseline ? Math.max(1, Math.round((Number(d.count) || 0) / Number(d.baseline))) : null;
    return {
      icon: "burst",
      tone: "med",
      reason,
      title: { key: "atok.alert.burstTitle", vars: { count: Number(d.count) || 0, min: Number(d.windowMin) || 5 } },
      body: times
        ? { key: "atok.alert.burstBody", vars: { ...base, baseline: Number(d.baseline) || 0, min: Number(d.windowMin) || 5, times } }
        : { key: "atok.alert.burstBodyNoBase", vars: { ...base, min: Number(d.windowMin) || 5 } },
    };
  }
  const isCountry = a.kind === "new_country";
  const hasPrev = d.previousCount != null && (d.previousIp || d.previousCountry);
  const untrusted = d.reason === "untrusted_address";
  return {
    icon: "globe",
    tone: "high",
    reason,
    title: { key: untrusted ? "atok.alert.untrustedTitle" : isCountry ? "atok.alert.countryTitle" : "atok.alert.ipTitle", vars: base },
    body: hasPrev
      ? { key: isCountry ? "atok.alert.countryBodyPrev" : "atok.alert.ipBodyPrev", vars: { ...base, prevCount: Number(d.previousCount) || 0, prevIp: d.previousIp || "-", prevCountry: d.previousCountry || "-" } }
      : { key: isCountry ? "atok.alert.countryBody" : "atok.alert.ipBody", vars: base },
  };
}

export const openAlerts = (alerts) => (alerts || []).filter((a) => a && a.status === "open");

/** "Yeni IP ve ani artış" style summary keys of the open alerts. */
export function alertKinds(alerts) {
  const kinds = new Set(openAlerts(alerts).map((a) => (a.kind === "burst" ? "burst" : a.kind === "new_country" ? "country" : "ip")));
  return ["ip", "country", "burst"].filter((k) => kinds.has(k));
}

/* ---------- audit ---------- */

/** Icon family of a token audit row (lifecycle actions, else a destructive action it made). */
export function auditKind(action) {
  const a = String(action || "").toLowerCase();
  if (/revoke_all|revoke-all|panic/.test(a)) return "panic";
  if (/restor/.test(a)) return "restore";
  if (/revok/.test(a)) return "revoke";
  if (/rotat/.test(a)) return "rotate";
  if (/resum/.test(a)) return "resume";
  if (/paus/.test(a)) return "pause";
  if (/creat/.test(a)) return "create";
  if (/alert/.test(a)) return "alert";
  if (/ip|allowlist/.test(a)) return "ip";
  if (/renam/.test(a)) return "edit";
  if (/auto_pause|autopause/.test(a)) return "pause";
  return "dest";
}

/** Paused by an alert rule rather than by hand (Token.pausedReason). */
export function autoPaused(token) {
  return token?.status === "paused" && Boolean(token.pausedReason) && token.pausedReason !== "manual";
}

/** "allow_ip" adds the address only when the token has an allowlist; otherwise it approves it. */
export const allowIpMode = (token) => ((token?.ipAllowlist || []).length ? "add" : "approve");

/**
 * The panel opened with an admin token instead of the owner's session: the server only lets
 * a token reduce power (pause, revoke, revoke-all, pause from an alert), so the rest is off.
 */
export function isTokenSession(sessionToken) {
  return String(sessionToken || "").startsWith(TOKEN_PREFIX);
}

/* ---------- forms ---------- */

export function cleanOtp(v) {
  return String(v || "").replace(/\D/g, "").slice(0, OTP_LENGTH);
}

export const otpReady = (code) => cleanOtp(code).length === OTP_LENGTH;

/** Typed confirmation: trims, collapses spaces, compares in Turkish upper case. */
export function typedMatches(typed, word) {
  const norm = (s) => String(s || "").trim().replace(/\s+/g, " ").toLocaleUpperCase("tr");
  return norm(typed) !== "" && norm(typed) === norm(word);
}

/** Problems of the create form, in display order: "name", "ip", "code". */
export function createErrors({ name, ipText, code }) {
  const out = [];
  const n = String(name || "").trim();
  if (!n || n.length > NAME_MAX) out.push("name");
  if (parseIpList(ipText).invalid.length) out.push("ip");
  if (!otpReady(code)) out.push("code");
  return out;
}

export function createBody({ name, expiresIn, ipText }) {
  return {
    name: String(name || "").trim().replace(/\s+/g, " ").slice(0, NAME_MAX),
    expiresIn: EXPIRY_OPTIONS.includes(expiresIn) ? expiresIn : DEFAULT_EXPIRY,
    ipAllowlist: parseIpList(ipText).list,
  };
}

export function revokeReady({ reason, typed, name, busy = false }) {
  return !busy && REVOKE_REASONS.includes(reason) && String(typed || "").trim() === String(name || "").trim() && String(name || "").trim() !== "";
}

export function panicReady({ reason, typed, code, count, busy = false }) {
  return !busy && count > 0 && String(reason || "").trim().length > 0 && typedMatches(typed, PANIC_WORD) && otpReady(code);
}

/** Expiry option a "same settings" re-create starts from. */
export function sameSettings(token) {
  return {
    name: String(token?.name || ""),
    expiresIn: EXPIRY_OPTIONS.includes(token?.expiresIn) ? token.expiresIn : DEFAULT_EXPIRY,
    ipText: (token?.ipAllowlist || []).join("\n"),
  };
}

/** Error code -> locale key. */
const ERR = {
  TOKENS_UNAVAILABLE: "atok.err.unavailable",
  TOKEN_NOT_FOUND: "atok.err.notFound",
  NAME_REQUIRED: "atok.err.name",
  BAD_EXPIRY: "atok.err.expiry",
  BAD_IP: "atok.err.ip",
  CONFIRM_MISMATCH: "atok.err.confirm",
  RESTORE_EXPIRED: "atok.err.restoreExpired",
  OWNER_ONLY: "atok.err.ownerOnly",
  BAD_CODE: "atok.err.code",
  TOKEN_REVOKED: "atok.err.revoked",
  BAD_REASON: "atok.err.reason",
  BAD_GRACE: "atok.err.grace",
  BAD_ACTION: "atok.err.action",
  ALERT_NOT_FOUND: "atok.err.alertNotFound",
  TOKEN_SELF_MANAGEMENT: "atok.err.selfManagement",
  TOKEN_LIMIT: "atok.err.limit",
  TOKEN_AUTH_RATE_LIMITED: "atok.err.authRate",
  MCP_TOO_MANY_STREAMS: "atok.err.mcpStreams",
  STEP_UP_REQUIRED: "atok.err.stepUp",
  STEP_UP_CANCELLED: "atok.err.stepUpCancelled",
};
export function errorKey(err) {
  if (err?.code && ERR[err.code]) return ERR[err.code];
  if (err?.status === 404) return "atok.err.notDeployed";
  if (err?.status === 403) return "atok.err.ownerOnly";
  return "atok.err.generic";
}
export const ERROR_CODES = Object.freeze(Object.keys(ERR));
