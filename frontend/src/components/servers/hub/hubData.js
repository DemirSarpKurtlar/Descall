/* Pure helpers for the server sheets (no React). Tested by hubData.selftest.mjs. */
import { fmt } from "./strings.js";

export const ROLE_SWATCHES = ["#ff6b6b", "#f5b942", "#5ad19a", "#1AA6B7", "#5b8cff", "#9B5DE5", "#E8457A"];

export function colorToHex(color) {
  const n = Math.max(0, Math.min(0xffffff, Number(color) || 0));
  return `#${n.toString(16).padStart(6, "0")}`;
}
export function hexToColor(hex) {
  const n = parseInt(String(hex || "").replace("#", "").trim(), 16);
  return Number.isFinite(n) ? n : 0;
}
/** Colour of a role for dots/chips; 0 = no colour → the kit's gray. */
export function roleHex(role) {
  if (!role) return "#8E8E93";
  if (role.isEveryone) return "#8E8E93";
  const n = Number(role.color) || 0;
  return n ? colorToHex(n) : "#8E8E93";
}

export function isTextLike(ch) {
  return ch?.type === "text" || ch?.type === "announcement";
}
export function isVoiceLike(ch) {
  return ch?.type === "voice" || ch?.type === "stage";
}
/** "# genel" for text-like channels, the bare name for voice/stage/category. */
export function channelLabel(ch) {
  if (!ch) return "";
  return isTextLike(ch) ? `# ${ch.name}` : ch.name;
}
export function channelIcon(ch) {
  switch (ch?.type) {
    case "announcement": return { n: "mega", c: "orange" };
    case "voice": return { n: "volume", c: "green" };
    case "stage": return { n: "stage", c: "purple" };
    case "category": return { n: "folder", c: "gray" };
    default: return { n: "hash", c: "brand" };
  }
}
/** Channel name rule used by the backend: lowercase, dashes, ≤100. Voice keeps spaces/case. */
export function normalizeChannelName(raw, type) {
  const s = String(raw || "");
  if (type === "voice" || type === "stage" || type === "category") return s.replace(/\s+/g, " ").slice(0, 100);
  return s.toLocaleLowerCase("tr").replace(/\s+/g, "-").replace(/-{2,}/g, "-").slice(0, 100);
}

export function rulesList(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*(?:\d+[.)]|[-•*])\s*/, "").trim())
    .filter(Boolean);
}

export function countServerChannels(server) {
  return (server?.channels || []).filter((c) => c.type !== "category").length;
}

export function presenceOf(onlineUsers, userId) {
  if (!userId || !onlineUsers) return null;
  const list = Array.isArray(onlineUsers) ? onlineUsers : Object.values(onlineUsers);
  const hit = list.find((u) => String(u?.id ?? u?.userId) === String(userId));
  if (!hit) return null;
  const st = String(hit.status || "online").toLowerCase();
  if (st === "invisible" || st === "offline") return null;
  return st === "idle" || st === "dnd" ? st : "online";
}

/** "3 ay", "2 yıl", "12 gün", "bugün". */
export function memberAge(joinedAt, s, now = Date.now()) {
  const t = new Date(joinedAt).getTime();
  if (!Number.isFinite(t)) return "";
  const days = Math.max(0, Math.floor((now - t) / 86400000));
  if (days < 1) return s.ageToday;
  if (days < 30) return fmt(s.ageDays, { n: days });
  const months = Math.floor(days / 30.44);
  if (months < 12) return fmt(s.ageMonths, { n: months });
  return fmt(s.ageYears, { n: Math.floor(months / 12) });
}

const TR_MONTHS_SHORT = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];
const TR_MONTHS = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
export function shortDate(d, locale) {
  const x = new Date(d);
  if (!Number.isFinite(x.getTime())) return "";
  if (locale === "tr") return `${x.getDate()} ${TR_MONTHS_SHORT[x.getMonth()]}`;
  return x.toLocaleDateString("en-US", { day: "numeric", month: "short" });
}
export function longDate(d, locale) {
  const x = new Date(d);
  if (!Number.isFinite(x.getTime())) return "";
  if (locale === "tr") return `${x.getDate()} ${TR_MONTHS[x.getMonth()]} ${x.getFullYear()}`;
  return x.toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric" });
}
export function dayTitle(d, s, locale, now = new Date()) {
  const x = new Date(d);
  const a = new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const b = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const diff = Math.round((b - a) / 86400000);
  if (diff === 0) return s.today;
  if (diff === 1) return s.yesterday;
  if (locale === "tr") return `${x.getDate()} ${TR_MONTHS[x.getMonth()]}${x.getFullYear() !== now.getFullYear() ? ` ${x.getFullYear()}` : ""}`;
  return x.toLocaleDateString("en-US", { day: "numeric", month: "long", ...(x.getFullYear() !== now.getFullYear() ? { year: "numeric" } : null) });
}
export function hhmm(d) {
  const x = new Date(d);
  if (!Number.isFinite(x.getTime())) return "";
  return `${String(x.getHours()).padStart(2, "0")}:${String(x.getMinutes()).padStart(2, "0")}`;
}

/** Short duration: 600 → "10 dk", 3600 → "1 saat", 86400 → "1 gün". */
export function durationLabel(seconds, s) {
  const n = Math.max(0, Math.round(Number(seconds) || 0));
  if (n < 60) return fmt(s.sec5.replace(/\d+/, "{n}"), { n });
  if (n < 3600) return fmt(s.minutes, { n: Math.round(n / 60) });
  if (n < 86400) return fmt(s.hour1.replace(/\d+/, "{n}"), { n: Math.round(n / 3600) });
  if (n < 7 * 86400) return fmt(s.day1.replace(/\d+/, "{n}"), { n: Math.round(n / 86400) });
  return fmt(s.week1.replace(/\d+/, "{n}"), { n: Math.round(n / (7 * 86400)) });
}

export function timeLeftLabel(until, s, now = Date.now()) {
  const ms = new Date(until).getTime() - now;
  if (!Number.isFinite(ms) || ms <= 0) return null;
  const min = Math.ceil(ms / 60000);
  if (min < 60) return fmt(s.leftMin, { n: min });
  const h = Math.round(ms / 3600000);
  if (h < 24) return fmt(s.leftHours, { n: Math.max(1, h) });
  return fmt(s.leftDays, { n: Math.round(ms / 86400000) });
}

/** Active invite sub line: "Demir · 42 kullanım · süresiz" / "Mert · 3 / 10 · 1 gün kaldı". */
export function inviteSub(inv, creatorName, s, now = Date.now()) {
  const uses = inv?.maxUses != null ? fmt(s.usesOf, { n: inv.uses || 0, max: inv.maxUses }) : fmt(s.nUses, { n: inv?.uses || 0 });
  const left = inv?.expiresAt ? timeLeftLabel(inv.expiresAt, s, now) : s.forever;
  return [creatorName, uses, left].filter(Boolean).join(" · ");
}
export function inviteActive(inv, now = Date.now()) {
  if (!inv) return false;
  if (inv.expiresAt && new Date(inv.expiresAt).getTime() <= now) return false;
  if (inv.maxUses != null && (inv.uses || 0) >= inv.maxUses) return false;
  return true;
}
export function inviteCodeFromInput(raw) {
  const s = String(raw || "").trim();
  if (!s) return { kind: null, value: "" };
  const m = s.match(/(?:^|\/)(?:invite\/s|servers\/join|invite|i)\/([A-Za-z0-9_-]+)/);
  if (m) return { kind: "invite", value: m[1] };
  const v = s.match(/(?:^|\/)s\/([a-z0-9-]+)/i);
  if (v) return { kind: "vanity", value: v[1].toLowerCase() };
  if (/^[A-Za-z0-9]{6,12}$/.test(s) && /\d/.test(s) && /[A-Z]/.test(s)) return { kind: "invite", value: s };
  if (/^[a-z0-9-]{2,32}$/.test(s)) return { kind: "either", value: s };
  if (/^[A-Za-z0-9_-]+$/.test(s)) return { kind: "invite", value: s };
  return { kind: null, value: "" };
}

/** Audit log category for the filter chips. */
export function auditCategory(action) {
  const a = String(action || "");
  if (a.startsWith("MEMBER_") || a === "RULES_ACCEPT" || a === "OWNERSHIP_TRANSFER") return "members";
  if (a.startsWith("ROLE_")) return "roles";
  if (a.startsWith("CHANNEL_")) return "channels";
  return "server";
}
const AUDIT_ICON = {
  MEMBER_BAN: ["ban", "red"], MEMBER_UNBAN: ["ban", "gray"], MEMBER_KICK: ["boot", "red"], MEMBER_TIMEOUT: ["clock", "orange"], MEMBER_TIMEOUT_CLEAR: ["clock", "gray"],
  MEMBER_ROLE_ADD: ["shield", "yellow"], MEMBER_ROLE_REMOVE: ["shield", "gray"], MEMBER_JOIN: ["user", "green"], MEMBER_LEAVE: ["out", "gray"], MEMBER_NICKNAME: ["pen", "gray"],
  ROLE_CREATE: ["shield", "yellow"], ROLE_UPDATE: ["shield", "yellow"], ROLE_DELETE: ["shield", "red"],
  CHANNEL_CREATE: ["hash", "brand"], CHANNEL_UPDATE: ["hash", "brand"], CHANNEL_DELETE: ["hash", "red"], CHANNEL_OVERRIDE_SET: ["lock", "gray"], CHANNEL_OVERRIDE_DELETE: ["lock", "gray"], CHANNEL_OVERRIDE_CLEAR: ["lock", "gray"],
  INVITE_CREATE: ["link", "blue"], INVITE_DELETE: ["link", "gray"], OWNERSHIP_TRANSFER: ["crown", "yellow"], RULES_ACCEPT: ["book", "teal"], SERVER_CREATE: ["gear", "gray"], SERVER_UPDATE: ["gear", "gray"],
};

/**
 * One audit row → { ico, c, t (actor), sub (what), val (HH:MM) }.
 * ctx: { s, cases:{dat,gen,acc}, names: Map(userId → name), roleName(id), channelName(id) }
 */
export function auditRow(log, ctx) {
  const { s, cases, names } = ctx;
  const ch = log?.changes && typeof log.changes === "object" ? log.changes : {};
  const action = String(log?.action || "");
  const actor = log?.actorDisplayName || log?.actorUsername || names?.get(String(log?.actorId)) || s.someone;
  const targetName = names?.get(String(log?.targetId)) || ch.username || ch.displayName || s.aMember;
  const role = ch.roleName || ch.name || ctx.roleName?.(ch.roleId || log?.targetId) || s.aRole;
  const channel = ch.name || ctx.channelName?.(log?.targetId) || s.aChannel;
  const vars = {
    targetAcc: cases.acc(targetName), targetDat: cases.dat(targetName), targetGen: cases.gen(targetName),
    role, channel: String(channel).replace(/^#\s*/, ""), name: ch.name || "",
    dur: ch.until && log?.createdAt ? durationLabel((new Date(ch.until) - new Date(log.createdAt)) / 1000, s) : "",
  };
  let key = `au_${action}`;
  if (action === "SERVER_UPDATE" && ch.name) key = "au_SERVER_RENAME";
  if (action === "OWNERSHIP_TRANSFER") vars.targetDat = cases.dat(names?.get(String(ch.to)) || ch.toName || targetName);
  if (!s[key]) key = "au_OTHER";
  let sub = fmt(s[key], vars);
  if (log?.reason && (action === "MEMBER_BAN" || action === "MEMBER_KICK" || action === "MEMBER_TIMEOUT")) sub += ` · ${log.reason}`;
  const [ico, c] = AUDIT_ICON[action] || ["list", "gray"];
  return { ico, c, t: actor, sub, val: hhmm(log?.createdAt) };
}

/** Group by local day, newest first: [{ title, items }]. */
export function groupByDay(logs, s, locale, now = new Date()) {
  const out = [];
  const sorted = [...(logs || [])].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  for (const log of sorted) {
    const title = dayTitle(log.createdAt, s, locale, now);
    const last = out[out.length - 1];
    if (last && last.title === title) last.items.push(log);
    else out.push({ title, items: [log] });
  }
  return out;
}

/** Override → "inherit" | "allow" | "deny" for one key. */
export function triState(override, key) {
  if (!override) return "inherit";
  if (override.allow?.[key]) return "allow";
  if (override.deny?.[key]) return "deny";
  return "inherit";
}
export function overrideChangedCount(override) {
  if (!override) return 0;
  const a = Object.values(override.allow || {}).filter(Boolean).length;
  const d = Object.values(override.deny || {}).filter(Boolean).length;
  return a + d;
}
/** Draft {key: tri} → PUT payload {key: "allow"|"deny"} (inherit omitted). */
export function draftToOverride(draft) {
  const out = {};
  for (const [k, v] of Object.entries(draft || {})) if (v === "allow" || v === "deny") out[k] = v;
  return out;
}
/** Is the channel restricted (everyone denied VIEW_CHANNEL)? */
export function channelIsPrivate(overrides, everyoneRoleId) {
  const o = (overrides || []).find((x) => x.targetType === "role" && String(x.targetId) === String(everyoneRoleId));
  return Boolean(o?.deny?.VIEW_CHANNEL);
}

export const CHANNEL_PERM_ORDER = [
  "VIEW_CHANNEL", "SEND_MESSAGES", "MANAGE_MESSAGES", "CREATE_INSTANT_INVITE", "MENTION_EVERYONE", "ATTACH_FILES", "EMBED_LINKS", "ADD_REACTIONS", "READ_MESSAGE_HISTORY",
  "CONNECT", "SPEAK", "REQUEST_TO_SPEAK", "PRIORITY_SPEAKER", "STREAM", "MUTE_MEMBERS", "DEAFEN_MEMBERS", "MOVE_MEMBERS",
];
export const ROLE_PERM_ORDER = [
  "MANAGE_CHANNELS", "MANAGE_MESSAGES", "MODERATE_MEMBERS", "KICK_MEMBERS", "BAN_MEMBERS", "MANAGE_ROLES", "MANAGE_GUILD", "VIEW_AUDIT_LOG", "MANAGE_NICKNAMES", "CHANGE_NICKNAME",
  "CREATE_INSTANT_INVITE", "VIEW_CHANNEL", "SEND_MESSAGES", "MENTION_EVERYONE", "ATTACH_FILES", "EMBED_LINKS", "ADD_REACTIONS", "READ_MESSAGE_HISTORY", "USE_APPLICATION_COMMANDS",
  "CONNECT", "SPEAK", "REQUEST_TO_SPEAK", "PRIORITY_SPEAKER", "STREAM", "MUTE_MEMBERS", "DEAFEN_MEMBERS", "MOVE_MEMBERS", "ADMINISTRATOR",
];
export function orderKeys(keys, order) {
  const set = new Set(keys || []);
  const head = order.filter((k) => set.has(k));
  const rest = (keys || []).filter((k) => !order.includes(k));
  return [...head, ...rest];
}
export const EVERYONE_LOCKED_KEYS = new Set(["ADMINISTRATOR", "MANAGE_ROLES", "MANAGE_GUILD", "MANAGE_CHANNELS", "KICK_MEMBERS", "BAN_MEMBERS", "MODERATE_MEMBERS"]);

/** Members sorted: owner first, then by highest role, then name. */
export function memberName(m) {
  return m?.nickname || m?.displayName || m?.username || "?";
}
export function sortMembers(members) {
  return [...(members || [])].sort((a, b) => {
    if (a.isOwner !== b.isOwner) return a.isOwner ? -1 : 1;
    const p = (Number(b.highestPosition) || 0) - (Number(a.highestPosition) || 0);
    if (p) return p;
    return memberName(a).localeCompare(memberName(b), "tr");
  });
}
export function memberRoleLine(m, rolesById, s) {
  if (m?.isOwner) return s.ownerRole;
  const names = (m?.roleIds || [])
    .map((id) => rolesById.get(String(id)))
    .filter((r) => r && !r.isEveryone)
    .sort((a, b) => (b.position || 0) - (a.position || 0))
    .map((r) => r.name);
  return names.join(" · ");
}

/** Slow-mode choices (seconds). */
export const SLOWMODE_OPTIONS = [0, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200, 21600];
export const AFK_TIMEOUT_OPTIONS = [60, 300, 900, 1800, 3600];
export const TIMEOUT_OPTIONS = [60, 300, 600, 3600, 86400, 604800];
export const INVITE_AGE_OPTIONS = [3600, 86400, 604800, 0];
export const INVITE_USE_OPTIONS = [0, 1, 5, 10, 25, 100];
export const VERIFICATION_LEVELS = ["none", "low", "medium", "high", "highest"];

export function slowmodeLabel(sec, s) {
  const n = Number(sec) || 0;
  if (!n) return s.off;
  return durationLabel(n, s);
}
export function inviteAgeLabel(sec, s) {
  const n = Number(sec) || 0;
  if (!n) return s.never;
  if (n === 604800) return s.days7;
  return durationLabel(n, s);
}
export function inviteUsesLabel(n, s) {
  const v = Number(n) || 0;
  if (!v) return s.unlimited;
  return fmt(s.nUses, { n: v }).replace(/^1 uses$/, "1 use");
}
export function vanityValid(slug) {
  return /^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/.test(String(slug || ""));
}

/** Same rule as the backend's confirmName check (cleanName + toLowerCase), so the green tick never lies. */
export function confirmNameMatches(typed, name) {
  const c = (v) => String(v || "").trim().replace(/\s+/g, " ").toLowerCase();
  return c(typed).length > 0 && c(typed) === c(name);
}
