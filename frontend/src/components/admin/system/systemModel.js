/**
 * Yönetici Paneli › Sistem (Draft A "Kontrol merkezi"): pure helpers, no React, no I/O.
 * Covered by system.selftest.mjs.
 */

export const PLATFORMS = Object.freeze(["web", "electron", "ios", "android"]);
export const MODES = Object.freeze(["off", "staff", "rollout", "all"]);
export const EDGE_STAGES = Object.freeze(["shadow", "team", "p5", "p25", "p50", "p100"]);
export const STAGE_PERCENT = Object.freeze({ shadow: 0, team: 0, p5: 5, p25: 25, p50: 50, p100: 100 });
export const TICKS = Object.freeze([0, 25, 50, 75, 100]);
export const REASON_MAX = 300;
export const BROADCAST_MAX = 500;
export const SWITCH_CUTS = Object.freeze({
  chatFrozen: true,
  maintenanceMode: true,
  registrationEnabled: false,
  dmEnabled: false,
  groupCreationEnabled: false,
  voice: false,
  video: false,
  screen: false,
});

/* ---------------- numbers and time ---------------- */

/** Uptime as { d, h, m } (for "6 g 14 sa"). */
export function uptimeParts(sec) {
  const s = Math.max(0, Math.floor(Number(sec) || 0));
  return { d: Math.floor(s / 86400), h: Math.floor((s % 86400) / 3600), m: Math.floor((s % 3600) / 60) };
}

/** Locale key + vars for an uptime: days+hours, hours+minutes, or minutes. */
export function uptimeLabel(sec) {
  const p = uptimeParts(sec);
  if (p.d > 0) return { key: "sysx.time.dh", vars: { d: p.d, h: p.h } };
  if (p.h > 0) return { key: "sysx.time.hm", vars: { h: p.h, m: p.m } };
  return { key: "sysx.time.m", vars: { m: p.m } };
}

/** Short "3 g önce" style: { key, vars } with n minutes / hours / days. */
export function agoLabel(at, now = Date.now()) {
  const t = Date.parse(at);
  if (!Number.isFinite(t)) return null;
  const sec = Math.max(0, Math.floor((now - t) / 1000));
  if (sec < 60) return { key: "sysx.ago.now", vars: {} };
  const min = Math.floor(sec / 60);
  if (min < 60) return { key: "sysx.ago.m", vars: { n: min } };
  const h = Math.floor(min / 60);
  if (h < 24) return { key: "sysx.ago.h", vars: { n: h } };
  return { key: "sysx.ago.d", vars: { n: Math.floor(h / 24) } };
}

/** Compact "3 g" (no "önce") for the limit field notes. */
export function agoShortLabel(at, now = Date.now()) {
  const l = agoLabel(at, now);
  if (!l || l.key === "sysx.ago.now") return l;
  return { key: `${l.key}Short`, vars: l.vars };
}

/** "Render · yayında 2 sa": hours (or minutes / days) since the process started. */
export function liveForLabel(sec) {
  const p = uptimeParts(sec);
  if (p.d > 0) return { key: "sysx.ago.dShort", vars: { n: p.d } };
  if (p.h > 0) return { key: "sysx.ago.hShort", vars: { n: p.h } };
  return { key: "sysx.ago.mShort", vars: { n: Math.max(1, p.m) } };
}

/** 2400000 -> { value: 2.4, unit: "MB" } (1000-based like the draft's "2,4 MB"). */
export function bytesParts(bytes) {
  const b = Math.max(0, Number(bytes) || 0);
  if (b >= 1e6) return { value: Math.round(b / 1e5) / 10, unit: "MB" };
  if (b >= 1e3) return { value: Math.round(b / 1e2) / 10, unit: "KB" };
  return { value: Math.round(b), unit: "B" };
}

/** m:ss for the restart strip. */
export function clock(sec) {
  const s = Math.max(0, Math.ceil(Number(sec) || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/* ---------------- sparklines and charts ---------------- */

/**
 * Sparkline path for values (nulls skipped). Same geometry as the draft:
 * 3 px bottom pad, 8 px total vertical pad, flat line in the middle when constant.
 */
export function sparkPaths(values, w = 160, h = 30) {
  const pts = [];
  const list = (values || []).map((v) => (v == null || !Number.isFinite(Number(v)) ? null : Number(v)));
  const real = list.filter((v) => v != null);
  if (real.length < 2) return { line: "", area: "", last: real.length ? real[0] : null };
  const mx = Math.max(...real);
  const mn = Math.min(...real);
  const r = mx - mn;
  const n = list.length;
  list.forEach((v, i) => {
    if (v == null) return;
    const x = (i / (n - 1)) * w;
    const y = r === 0 ? h / 2 : h - 3 - ((v - mn) / r) * (h - 8);
    pts.push([x, y]);
  });
  const line = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");
  const area = `${line} L${pts[pts.length - 1][0].toFixed(1)} ${h} L${pts[0][0].toFixed(1)} ${h}Z`;
  return { line, area, last: real[real.length - 1] };
}

/** Line in a fixed 0..max box (the 14-day edge chart shares one scale for both series). */
export function linePath(values, w, h, max) {
  const n = (values || []).length;
  if (n < 2 || !(max > 0)) return "";
  return values
    .map((v, i) => {
      const y = h - (Math.max(0, Number(v) || 0) / max) * h;
      return `${i ? "L" : "M"}${((i / (n - 1)) * w).toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
}

/** A nice round top for the chart scale (1284 -> 1400). */
export function niceMax(values) {
  const mx = Math.max(0, ...(values || []).map((v) => Number(v) || 0));
  if (mx <= 0) return 10;
  const pow = 10 ** Math.floor(Math.log10(mx));
  const step = pow / 5;
  return Math.ceil((mx * 1.08) / step) * step;
}

/** Where on the 14-day axis a marker (ISO time) falls, 0..1, or null when outside. */
export function markerX(at, days) {
  if (!days?.length) return null;
  const first = Date.parse(`${days[0].day}T00:00:00+03:00`);
  const last = Date.parse(`${days[days.length - 1].day}T00:00:00+03:00`);
  const t = Date.parse(at);
  if (!Number.isFinite(t) || t < first) return null;
  const span = last - first;
  if (span <= 0) return 0;
  return Math.min(1, Math.max(0, (t - first) / span));
}

/** Keep one marker per stage (the latest), so labels do not stack. */
export function dedupeMarkers(markers) {
  const by = new Map();
  for (const m of markers || []) if (m?.stage) by.set(m.stage, m);
  return [...by.values()].sort((a, b) => String(a.at).localeCompare(String(b.at)));
}

/* ---------------- flags ---------------- */

export function normalizeRule(rule) {
  const r = rule && typeof rule === "object" ? rule : {};
  const mode = MODES.includes(r.mode) ? r.mode : "off";
  const pct = Math.min(100, Math.max(0, Math.round(Number(r.percent) || 0)));
  return {
    mode,
    percent: mode === "all" ? 100 : pct,
    platforms: PLATFORMS.filter((p) => Array.isArray(r.platforms) && r.platforms.includes(p)),
    staff: Array.isArray(r.staff) ? [...new Set(r.staff.map((x) => String(x).toLowerCase()))] : [],
  };
}

export function sameRule(a, b) {
  const x = normalizeRule(a);
  const y = normalizeRule(b);
  return (
    x.mode === y.mode &&
    (x.mode !== "rollout" || x.percent === y.percent) &&
    x.platforms.join() === y.platforms.join() &&
    [...x.staff].sort().join() === [...y.staff].sort().join()
  );
}

/**
 * Table "Yayılım" column: label key, the figure, bar width.
 *   all -> Herkes %100 · staff -> Ekip 4 kişi · rollout -> Kısmi %25 · off -> Kapalı
 */
export function rolloutCell(rule) {
  const r = normalizeRule(rule);
  if (r.mode === "all") return { key: "sysx.reach.all", value: { key: "sysx.pct", vars: { n: 100 } }, bar: 100, tone: "on" };
  if (r.mode === "staff") return { key: "sysx.reach.staff", value: { key: "sysx.people", vars: { n: r.staff.length } }, bar: r.staff.length ? 4 : 0, tone: "staff" };
  if (r.mode === "rollout") return { key: "sysx.reach.partial", value: { key: "sysx.pct", vars: { n: r.percent } }, bar: r.percent, tone: "on" };
  return { key: "sysx.reach.off", value: r.percent > 0 ? { key: "sysx.pausedAt", vars: { n: r.percent } } : null, bar: 0, tone: "off" };
}

/** Table "Kapsam" chip: platform label keys, or "Tümü". */
export function scopeKeys(flag) {
  const r = normalizeRule(flag?.rule);
  if (flag?.kind === "server") return ["sysx.platform.all"];
  const list = r.platforms.length ? r.platforms : flag?.allowed?.length === 1 ? flag.allowed : [];
  if (!list.length || list.length === PLATFORMS.length) return ["sysx.platform.all"];
  // Draft order: Masaüstü before Web reads "Masaüstü, Web".
  const order = ["ios", "electron", "web", "android"];
  return order.filter((p) => list.includes(p)).map((p) => `sysx.platform.${p}`);
}

/** "Yaklaşık 1.940 / 7.760 kullanıcı": users a rule reaches (rounded to 10 above 100). */
export function reachEstimate(rule, totalUsers) {
  const total = Math.max(0, Number(totalUsers) || 0);
  const r = normalizeRule(rule);
  let n = 0;
  if (r.mode === "all") n = total;
  else if (r.mode === "rollout") n = Math.round((total * r.percent) / 100);
  else if (r.mode === "staff") n = r.staff.length;
  if (r.mode !== "staff" && n > 100) n = Math.round(n / 10) * 10;
  return { n, total };
}

/** History row title parts: mode label key, percent, platform keys ("Kademeli %25 · Web, Masaüstü"). */
export function stateTitle(state) {
  if (!state) return null;
  const r = normalizeRule(state);
  const parts = [];
  if (r.mode === "off") parts.push({ key: "sysx.mode.off" });
  else if (r.mode === "staff") parts.push({ key: "sysx.mode.staff" });
  else if (r.mode === "all") parts.push({ key: "sysx.mode.all" });
  else parts.push({ key: "sysx.mode.rolloutPct", vars: { n: r.percent } });
  if (r.mode !== "off" && r.mode !== "staff" && r.platforms.length && r.platforms.length < PLATFORMS.length) {
    parts.push({ list: ["web", "electron", "ios", "android"].filter((p) => r.platforms.includes(p)).map((p) => `sysx.platform.${p}`) });
  }
  return parts;
}

/** Can the editor save this rule? Returns an error key or null. */
export function ruleError(flag, rule) {
  const r = normalizeRule(rule);
  if (flag?.kind === "server" && (r.mode === "staff" || r.mode === "rollout")) return "sysx.err.serverWide";
  if (r.mode === "rollout" && (r.percent <= 0 || r.percent >= 100)) return "sysx.err.percent";
  if (r.mode === "staff" && !r.staff.length && flag?.kind !== "edge") return "sysx.err.noStaff";
  if (r.mode !== "off" && flag?.kind !== "server" && flag?.allowed?.length > 1 && !r.platforms.length && flag?.kind === "client") return "sysx.err.noPlatform";
  return null;
}

/** The body PATCH /system/flags/:key sends. */
export function flagBody(rule, { reason = "", autoRollback = false } = {}) {
  const r = normalizeRule(rule);
  return { rule: r, reason: String(reason || "").replace(/\s+/g, " ").trim().slice(0, REASON_MAX), autoRollback: Boolean(autoRollback) };
}

/** Pipeline pills: done / current / pending per stage. */
export function stageStates(current) {
  const idx = EDGE_STAGES.indexOf(current);
  return EDGE_STAGES.map((s, i) => ({ stage: s, state: idx < 0 ? "pending" : i < idx ? "done" : i === idx ? "current" : "pending" }));
}

/* ---------------- kill switches ---------------- */

/** Which of these changes cut something off (needs a reason in the confirm dialog). */
export function cuttingKeys(patch) {
  return Object.entries(patch || {})
    .filter(([k, v]) => k in SWITCH_CUTS && SWITCH_CUTS[k] === v)
    .map(([k]) => k);
}

/**
 * "Alana göre" (groups as the server sends them) or "Duruma göre": everything that is
 * cut off now first, then the rest.
 */
export function switchRows(groups, switches, order = "area") {
  const rows = [];
  for (const g of groups || []) for (const k of g.keys) rows.push({ group: g.id, key: k });
  if (order !== "state") return groups || [];
  const isCut = (k) => (k === "slowModeSeconds" ? Number(switches?.slowModeSeconds) > 0 : k in SWITCH_CUTS && switches?.[k] === SWITCH_CUTS[k]);
  const cut = rows.filter((r) => isCut(r.key)).map((r) => r.key);
  const rest = rows.filter((r) => !isCut(r.key)).map((r) => r.key);
  return [
    ...(cut.length ? [{ id: "cut", keys: cut }] : []),
    { id: "normal", keys: rest },
  ];
}

/** Slow mode stepper steps (seconds). */
export const SLOW_STEPS = Object.freeze([0, 5, 10, 15, 30, 60, 120, 300, 600]);
export function slowStep(current, dir) {
  const cur = Math.max(0, Number(current) || 0);
  if (dir > 0) return SLOW_STEPS.find((s) => s > cur) ?? SLOW_STEPS[SLOW_STEPS.length - 1];
  const lower = SLOW_STEPS.filter((s) => s < cur);
  return lower.length ? lower[lower.length - 1] : 0;
}

/* ---------------- limits ---------------- */

/** Changed limit values only, as numbers; or { error: key } when one is out of range. */
export function limitsPatch(form, values, ranges) {
  const patch = {};
  for (const [k, raw] of Object.entries(form || {})) {
    const n = Number(String(raw).replace(/[^\d]/g, ""));
    if (String(raw).trim() === "" || !Number.isFinite(n)) return { error: k };
    const [min, max] = ranges?.[k] || [0, Infinity];
    if (n < min || n > max) return { error: k };
    if (n !== Number(values?.[k])) patch[k] = n;
  }
  return { patch };
}

/* ---------------- maintenance ---------------- */

/** "1 g 9 sa" until the planned window (or null when it is running / gone). */
export function untilLabel(startsAt, now = Date.now()) {
  const t = Date.parse(startsAt);
  if (!Number.isFinite(t) || t <= now) return null;
  return uptimeLabel((t - now) / 1000);
}

/** Planned maintenance within the next 48 hours (the restart dialog warns). */
export function maintenanceSoon(m, now = Date.now()) {
  if (!m || m.status !== "scheduled") return false;
  const t = Date.parse(m.startsAt);
  return Number.isFinite(t) && t > now && t - now <= 48 * 3600 * 1000;
}

/* ---------------- safe restart ---------------- */

export const RESTART_STEPS = Object.freeze(["stop", "notify", "drain", "backup", "exit"]);

/** Typed confirmation: the locale's phrase, spaces collapsed, case-insensitive. */
export function typedMatches(typed, word) {
  const a = String(typed || "").replace(/\s+/g, " ").trim();
  const b = String(word || "").trim();
  if (!a || !b) return false;
  return a === b || a.toLocaleUpperCase("tr-TR") === b || a.toUpperCase() === b;
}

/** Can the restart be sent? */
export function restartReady({ reason, typed, word, busy }) {
  return !busy && String(reason || "").trim().length >= 5 && typedMatches(typed, word);
}

/** Step rows of the dialog with their live status from the run (or idle). */
export function restartStepRows(run) {
  const steps = run?.steps || [];
  return RESTART_STEPS.map((key, i) => ({ key, n: i + 1, status: steps.find((s) => s.key === key)?.status || "pending" }));
}

/** Seconds of downtime between the old and new boot (when the new one is back). */
export function downtimeSec(exitAt, backAt) {
  const a = Date.parse(exitAt);
  const b = Date.parse(backAt);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.round((b - a) / 1000));
}

/** Avatar colour for a username (stable). */
const AV = ["#f0703e", "#9b5de5", "#22c3a6", "#4f7cff", "#e5484d", "#f2a93b", "#3fb5e8"];
export function avatarColor(name) {
  let h = 0;
  for (const ch of String(name || "")) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AV[h % AV.length];
}
