/**
 * Canlı popup admin page (Draft B "Kontrol merkezi"): pure helpers, no React.
 * Mirrors backend/lib/livePopup/model.js where both sides must agree (tones,
 * durations, rule types, platforms, languages, receipt statuses, filters).
 */

export const TABS = ["live", "queue", "history", "templates"];
export const TONES = ["info", "success", "warning", "urgent"];
export const TONE_COLOR = Object.freeze({ info: "#587af5", success: "#34c77b", warning: "#f2a93b", urgent: "#f23f43" });
export const TONE_CHIP = Object.freeze({ info: "blue", success: "green", warning: "gold", urgent: "red" });
export const DURATIONS = [0, 10_000, 30_000, 60_000, 120_000];
export const PLATFORMS = ["desktop", "web", "ios", "android"];
export const LANGS = ["tr", "en", "de", "es", "fr", "pt-BR", "ru"];
export const RULE_TYPES = ["voice", "platform", "language", "premium", "server", "users", "accountAge", "visibility"];
export const FILTERS = ["all", "seen", "acked", "clicked", "open", "dismissed", "missed"];
export const RECALL_MODES = ["silent", "note", "edited"];
export const MAX_TITLE = 80;
export const MAX_BODY = 800;
export const MIN_NOTE = 5;
export const DAILY_LIMIT = 10;

/** Built-in templates (copy in livePopup.templates.<id>.*). */
export const BUILTIN_TEMPLATES = Object.freeze([
  { id: "builtin:maintenance", key: "maintenance", severity: "warning", icon: "wrench", requireAck: true, autoResolve: false, durationMs: 0, cta: false, audience: { rules: [] } },
  { id: "builtin:outage", key: "outage", severity: "urgent", icon: "siren", requireAck: true, autoResolve: true, durationMs: 0, cta: true, audience: { rules: [{ type: "voice" }] } },
  { id: "builtin:feature", key: "feature", severity: "success", icon: "party", requireAck: false, autoResolve: false, durationMs: 0, cta: false, audience: { rules: [] } },
  { id: "builtin:event", key: "event", severity: "info", icon: "megaphone", requireAck: false, autoResolve: false, durationMs: 0, cta: false, audience: { rules: [] } },
  { id: "builtin:security", key: "security", severity: "urgent", icon: "lock", requireAck: true, autoResolve: false, durationMs: 0, cta: false, audience: { rules: [] } },
]);

export function emptyDraft() {
  return {
    templateId: null,
    templateName: "",
    severity: "info",
    icon: "megaphone",
    title: "",
    body: "",
    rules: [],
    durationMs: 0,
    when: "now",
    scheduleAt: "",
    requireAck: false,
    autoResolve: false,
    includeSelf: false,
    ctaLabel: "",
    ctaUrl: "",
  };
}

export function defaultIcon(severity) {
  return { info: "megaphone", success: "party", warning: "wrench", urgent: "siren" }[severity] || "megaphone";
}

/** Switching the tone moves the icon to that tone's default and turns "OK required" on for urgent. */
export function applyTone(draft, severity) {
  return {
    ...draft,
    severity,
    icon: defaultIcon(severity),
    requireAck: severity === "urgent" ? true : draft.severity === "urgent" ? false : draft.requireAck,
  };
}

/** A built-in (`t` localizes) or saved template -> draft. */
export function draftFromTemplate(tpl, t) {
  const base = emptyDraft();
  if (!tpl) return base;
  if (String(tpl.id || "").startsWith("builtin:")) {
    const k = `livePopup.templates.${tpl.key}`;
    return {
      ...base,
      templateId: null,
      templateName: t(`${k}.name`),
      severity: tpl.severity,
      icon: tpl.icon,
      title: t(`${k}.title`),
      body: t(`${k}.body`),
      rules: (tpl.audience?.rules || []).map((r) => ({ ...r })),
      requireAck: tpl.requireAck,
      autoResolve: tpl.autoResolve,
      durationMs: tpl.durationMs,
      ctaLabel: tpl.cta ? t(`${k}.cta`) : "",
      ctaUrl: tpl.cta ? "descall.com/durum" : "",
    };
  }
  return {
    ...base,
    templateId: tpl.id,
    templateName: tpl.name || "",
    severity: tpl.severity || "info",
    icon: tpl.icon || defaultIcon(tpl.severity),
    title: tpl.title || "",
    body: tpl.body || "",
    rules: (tpl.audience?.rules || []).map((r) => ({ ...r })),
    requireAck: Boolean(tpl.requireAck),
    autoResolve: Boolean(tpl.autoResolve),
    durationMs: Number(tpl.durationMs) || 0,
    ctaLabel: tpl.ctaLabel || "",
    ctaUrl: tpl.ctaUrl || "",
  };
}

/** A campaign (history / scheduled) -> draft ("Kopyala ve düzenle", queue edit). */
export function draftFromCampaign(c, { keepSchedule = false } = {}) {
  return {
    ...emptyDraft(),
    severity: c.severity || "info",
    icon: c.icon || defaultIcon(c.severity),
    title: c.title || "",
    body: c.body || "",
    rules: (c.audience?.rules || []).map((r) => ({ ...r })),
    requireAck: Boolean(c.requireAck),
    autoResolve: Boolean(c.autoResolve),
    includeSelf: Boolean(c.includeSelf),
    durationMs: Number(c.durationMs) || 0,
    ctaLabel: c.ctaLabel || "",
    ctaUrl: c.ctaUrl || "",
    when: keepSchedule && c.scheduledAt ? "schedule" : "now",
    scheduleAt: keepSchedule && c.scheduledAt ? toLocalInput(c.scheduledAt) : "",
  };
}

export function draftContent(d) {
  return {
    title: d.title.trim(),
    body: d.body.trim(),
    severity: d.severity,
    icon: d.icon,
    durationMs: d.requireAck ? 0 : d.durationMs,
    requireAck: d.requireAck,
    autoResolve: d.autoResolve,
    ctaLabel: d.ctaLabel.trim(),
    ctaUrl: d.ctaUrl.trim(),
  };
}

/** The rules as the server takes them (users carry their usernames for the chips). */
export function audiencePayload(rules) {
  return { rules: (rules || []).filter((r) => ruleComplete(r)) };
}

export function ruleComplete(r) {
  if (!r?.type) return false;
  if (r.type === "platform" || r.type === "language") return Array.isArray(r.values) && r.values.length > 0;
  if (r.type === "server") return Boolean(r.serverId);
  if (r.type === "users") return Array.isArray(r.users) && r.users.length > 0;
  if (r.type === "accountAge") return Number(r.days) >= 1;
  return true;
}

export function newRule(type) {
  if (type === "platform") return { type, values: ["desktop", "web"] };
  if (type === "language") return { type, values: ["tr"] };
  if (type === "premium") return { type, value: "member" };
  if (type === "server") return { type, serverId: "", name: "" };
  if (type === "users") return { type, users: [] };
  if (type === "accountAge") return { type, op: "older", days: 7 };
  if (type === "visibility") return { type, value: "visible" };
  return { type };
}

export function upsertRule(rules, rule) {
  const out = (rules || []).filter((r) => r.type !== rule.type);
  out.push(rule);
  return RULE_TYPES.filter((t) => out.some((r) => r.type === t)).map((t) => out.find((r) => r.type === t));
}

export function removeRule(rules, type) {
  return (rules || []).filter((r) => r.type !== type);
}

/** "2026-11-15T20:00" (local, for <input type=datetime-local>) <-> ISO. */
export function toLocalInput(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function fromLocalInput(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Validation for the composer: list of error keys (livePopup.composer.errors.*). */
export function draftErrors(d, now = Date.now()) {
  const out = [];
  if (!d.title.trim()) out.push("title");
  if (!d.body.trim()) out.push("body");
  if (Boolean(d.ctaLabel.trim()) !== Boolean(d.ctaUrl.trim())) out.push("cta");
  if (d.when === "schedule") {
    const iso = fromLocalInput(d.scheduleAt);
    if (!iso || Date.parse(iso) < now + 60_000) out.push("schedule");
  }
  return out;
}

export function draftPayload(d) {
  return {
    content: draftContent(d),
    audience: audiencePayload(d.rules),
    includeSelf: d.includeSelf,
    scheduleAt: d.when === "schedule" ? fromLocalInput(d.scheduleAt) : null,
    templateId: d.templateId || null,
  };
}

export function draftDirty(d) {
  const e = emptyDraft();
  return d.title.trim() !== e.title || d.body.trim() !== e.body || (d.rules || []).length > 0 || d.ctaLabel.trim() !== "" || d.ctaUrl.trim() !== "";
}

/* ---------------- labels ---------------- */

export function listLabel(values, map, t) {
  return (values || []).map((v) => t(`${map}.${v}`)).join(", ");
}

/** Chip text for one rule. */
export function ruleLabel(r, t) {
  switch (r.type) {
    case "voice":
      return t("livePopup.aud.voice");
    case "platform":
      return t("livePopup.aud.platform", { list: listLabel(r.values, "livePopup.platform", t) });
    case "language":
      return t("livePopup.aud.language", { list: listLabel(r.values, "livePopup.lang", t) });
    case "premium":
      return t(r.value === "non" ? "livePopup.aud.premiumNon" : "livePopup.aud.premiumMember");
    case "server":
      return r.name ? t("livePopup.aud.server", { name: r.name }) : t("livePopup.aud.serverMembers");
    case "users": {
      const names = (r.users || []).map((u) => u.username || "?");
      const shown = names.slice(0, 2).join(", ");
      const list = names.length > 2 ? t("livePopup.aud.usersMore", { list: shown, n: names.length - 2 }) : shown;
      return t("livePopup.aud.users", { list });
    }
    case "accountAge":
      return t(r.op === "newer" ? "livePopup.aud.accountNewer" : "livePopup.aud.accountOlder", { n: r.days });
    case "visibility":
      return t("livePopup.aud.visible");
    default:
      return r.type;
  }
}

export function audienceLabel(audience, t) {
  const rules = audience?.rules || [];
  if (audience?.fromCampaign) return t("livePopup.aud.previous");
  if (!rules.length) return t("livePopup.everyone");
  return rules.map((r) => (r.type === "server" ? t("livePopup.aud.serverMembers") : ruleLabel(r, t))).join(" · ");
}

/* ---------------- numbers / time ---------------- */

export function fmtNumber(n, locale) {
  try {
    return new Intl.NumberFormat(locale || "tr").format(Number(n) || 0);
  } catch {
    return String(Number(n) || 0);
  }
}

export function pct(n, d) {
  return d > 0 ? Math.round((Number(n) / Number(d)) * 100) : 0;
}

/** Short elapsed time: "şimdi", "8 sn", "4 dk", "3 sa", "2 gün". */
export function shortAgo(iso, t, now = Date.now()) {
  const ms = now - Date.parse(iso);
  if (!Number.isFinite(ms) || ms < 5_000) return t("livePopup.now");
  const s = Math.floor(ms / 1000);
  if (s < 60) return t("livePopup.secShort", { n: s });
  const m = Math.floor(s / 60);
  if (m < 60) return t("livePopup.minShort", { n: m });
  const h = Math.floor(m / 60);
  if (h < 24) return t("livePopup.hourShort", { n: h });
  return t("livePopup.dayShort", { n: Math.floor(h / 24) });
}

/** Countdown to a schedule: "20 sa 41 dk", "1 gün", "9 dk". */
export function countdown(iso, t, now = Date.now()) {
  const ms = Date.parse(iso) - now;
  if (!Number.isFinite(ms) || ms <= 0) return t("livePopup.now");
  const m = Math.ceil(ms / 60000);
  if (m < 60) return t("livePopup.minShort", { n: m });
  const h = Math.floor(m / 60);
  if (h < 24) return t("livePopup.hourMin", { h, m: m % 60 });
  return t("livePopup.dayShort", { n: Math.floor(h / 24) });
}

export function secondsLabel(ms, t) {
  if (ms == null) return "";
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return t("livePopup.secShort", { n: s });
  return t("livePopup.minShort", { n: Math.round(s / 60) });
}

export function clock(iso, locale) {
  if (!iso) return "";
  try {
    return new Intl.DateTimeFormat(locale || "tr", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Europe/Istanbul" }).format(new Date(iso));
  } catch {
    return "";
  }
}

export function dayTime(iso, locale) {
  if (!iso) return "";
  try {
    return new Intl.DateTimeFormat(locale || "tr", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Europe/Istanbul" }).format(new Date(iso));
  } catch {
    return "";
  }
}

/* ---------------- live view ---------------- */

export function funnelRows(stats) {
  const s = stats || {};
  const total = Number(s.targeted) || 0;
  const row = (id, value, color) => ({ id, value: Number(value) || 0, pct: pct(value, total), color });
  return [
    { ...row("targeted", total, "rgba(255,255,255,.18)"), pct: total ? 100 : 0, hidePct: true },
    row("delivered", s.delivered, "#587af5"),
    row("seen", s.seen, "#7b93ff"),
    row("acked", s.acked, "#34c77b"),
    row("clicked", s.clicked, "#9b5de5"),
    row("missed", s.missed, "#f2a93b"),
  ];
}

/** Bar heights (0..100) for the seen-per-minute spark; the tallest bucket is 100. */
export function sparkHeights(spark) {
  const list = Array.isArray(spark) ? spark : [];
  const max = Math.max(0, ...list);
  return list.map((v) => (max ? Math.max(v ? 6 : 3, Math.round((v / max) * 100)) : 3));
}

const EVENT_COLOR = { acked: "#34c77b", clicked: "#9b5de5", seen: "#7b93ff", delivered: "#587af5", dismissed: "rgba(235,238,255,.45)", missed: "#f2a93b" };

/** One live-feed line: { key, vars, sub: [..], color }. */
export function eventLine(e) {
  const user = e.username || "?";
  if (e.kind === "missed") {
    const key = e.reason === "left" ? "missedLeft" : e.reason === "connection" ? "missedConnection" : "missedOffline";
    return { key: `livePopup.event.${key}`, vars: { user }, platform: e.platform, extraKey: e.pending ? "livePopup.event.atLogin" : "livePopup.event.notShown", color: EVENT_COLOR.missed };
  }
  const base = { key: `livePopup.event.${e.kind}`, vars: { user }, platform: e.platform, color: EVENT_COLOR[e.kind] || "#587af5" };
  if (e.kind === "clicked" && e.url) return { ...base, extra: prettyUrl(e.url) };
  if (e.kind === "seen" && e.open) return { ...base, extraKey: "livePopup.event.openOnScreen" };
  return { ...base, lang: e.language };
}

export function prettyUrl(url) {
  return String(url || "").replace(/^https?:\/\//, "").replace(/\/$/, "");
}

/* ---------------- recipients table ---------------- */

export function rowStatus(row) {
  switch (row.status) {
    case "acked":
      return { key: "livePopup.rowStatus.acked", tone: "green", timed: true };
    case "clicked":
      return { key: "livePopup.rowStatus.clicked", tone: "blue" };
    case "open":
      return { key: "livePopup.rowStatus.open", tone: "gold" };
    case "seen":
      return { key: "livePopup.rowStatus.seen", tone: "gray" };
    case "unseen":
      return { key: "livePopup.rowStatus.unseen", tone: "gray" };
    case "dismissed":
      return { key: "livePopup.rowStatus.dismissed", tone: "gray" };
    case "sending":
      return { key: "livePopup.rowStatus.sending", tone: "blue" };
    default: {
      const r = row.missedReason === "left" ? "missedLeft" : row.missedReason === "connection" ? "missedConnection" : "missedOffline";
      return { key: `livePopup.rowStatus.${r}`, tone: "red" };
    }
  }
}

/** Footer hint when every selected person has not seen it or missed it. */
export function selectionKind(rows, selected) {
  const sel = rows.filter((r) => selected.has(r.userId));
  if (!sel.length || sel.length !== selected.size) return "";
  return sel.every((r) => ["unseen", "missed", "sending"].includes(r.status)) ? "unseen-missed" : "";
}

export function toggleSet(set, id) {
  const next = new Set(set);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

/* ---------------- recall ---------------- */

export function normalizeConfirm(s, locale) {
  try {
    return String(s || "").trim().replace(/\s+/g, " ").toLocaleUpperCase(locale || "tr");
  } catch {
    return String(s || "").trim().toUpperCase();
  }
}

export function canRecall({ reason, typed, word, mode, note, editedTitle, editedBody }, locale) {
  if (String(reason || "").trim().length < MIN_NOTE) return false;
  if (normalizeConfirm(typed, locale) !== normalizeConfirm(word, locale)) return false;
  if (mode === "note" && !String(note || "").trim()) return false;
  if (mode === "edited" && (!String(editedTitle || "").trim() || !String(editedBody || "").trim())) return false;
  return true;
}

export function recallPayload({ reason, mode, note, editedTitle, editedBody, campaign }) {
  const out = { mode, reason: String(reason || "").trim() };
  if (mode === "note") out.note = String(note || "").trim();
  if (mode === "edited") {
    out.edited = {
      title: String(editedTitle || "").trim(),
      body: String(editedBody || "").trim(),
      severity: campaign?.severity,
      icon: campaign?.icon,
      requireAck: campaign?.requireAck,
      durationMs: campaign?.durationMs,
      ctaLabel: campaign?.ctaLabel || "",
      ctaUrl: campaign?.ctaUrl || "",
    };
  }
  return out;
}

/** Error code from the server -> livePopup.err.* key. */
export function errorKey(err) {
  const code = err?.code;
  const known = ["DAILY_LIMIT", "RATE_LIMITED", "NO_RECIPIENTS", "NOTE_REQUIRED", "CORRECTION_REQUIRED", "BAD_CTA_URL", "CTA_URL_REQUIRED", "CTA_LABEL_REQUIRED", "SCHEDULE_PAST", "SCHEDULE_FAR", "BAD_STATE", "NOT_FOUND", "NO_DEVICE", "TEMPLATES_UNAVAILABLE", "EXEMPTIONS_UNAVAILABLE"];
  return known.includes(code) ? `livePopup.err.${code}` : null;
}

/** Live campaign shown on the "Canlı" tab: the picked one, else the newest live one. */
export function pickLive(overview, selectedId) {
  const live = overview?.live || [];
  if (selectedId) return selectedId;
  return live[0]?.id || null;
}

export function distinctLanguages(stats) {
  return (stats?.languages || []).filter((l) => l.n > 0 && l.id !== "other").length || (stats?.languages || []).length;
}

/** Click a link to download text as a file. */
export function downloadText(filename, text, type = "text/csv;charset=utf-8") {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
