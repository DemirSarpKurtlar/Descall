/**
 * Performans console (owner pick Draft A "Konsol"): pure helpers shared by the screens.
 * Metric catalogue (same thresholds as backend/lib/perfModel.js), value formatting,
 * query tokens <-> server query, shareable view links. Tested by perf.selftest.mjs.
 */

export const METRICS = Object.freeze({
  lcp: { label: "LCP", good: 2500, poor: 4000 },
  inp: { label: "INP", good: 200, poor: 500 },
  cls: { label: "CLS", good: 0.1, poor: 0.25, unitless: true },
  fcp: { label: "FCP", good: 1800, poor: 3000 },
  ttfb: { label: "TTFB", good: 800, poor: 1800 },
  msglist: { good: 1000, poor: 2500, app: true },
  voicejoin: { good: 1500, poor: 3000, app: true },
  appstart: { good: 2000, poor: 4000, app: true },
});
export const KPI_ORDER = Object.freeze(["lcp", "inp", "cls", "fcp", "ttfb", "msglist", "voicejoin", "appstart"]);
export const CHART_METRICS = Object.freeze(["lcp", "inp", "cls", "fcp", "ttfb", "appstart"]);
export const PLATFORMS = Object.freeze([
  { k: "web", c: "#7b93ff" },
  { k: "ios", c: "#5ac8d8" },
  { k: "android", c: "#e879a6" },
  { k: "electron", c: "#b38cff" },
  { k: "tauri", c: "#cfd6e6" },
]);
export const PLATFORM_COLOR = Object.freeze(Object.fromEntries(PLATFORMS.map((p) => [p.k, p.c])));
export const DEVICES = Object.freeze(["low", "mid", "high"]);
export const CONNECTIONS = Object.freeze(["wifi", "ethernet", "4g", "3g", "2g", "offline"]);
export const RANGES = Object.freeze(["24h", "7d", "28d", "90d"]);
export const GROUPS = Object.freeze(["route", "platform", "version", "device", "connection", "country"]);
export const TOKEN_KINDS = Object.freeze(["range", "platform", "version", "route", "device", "connection", "country", "user"]);
export const LIST_KINDS = Object.freeze(["platform", "version", "route", "device", "connection", "country"]);

/** "g" | "n" | "p" | "x" (no data). */
export function rating(metric, v) {
  const m = METRICS[metric];
  if (!m || v == null || !Number.isFinite(v)) return "x";
  if (v <= m.good) return "g";
  if (v <= m.poor) return "n";
  return "p";
}

/** "2,14 sn" / "196 ms" / "0,05" in the viewer's locale. */
export function fmtValue(metric, v, locale = "tr", t = null) {
  if (v == null || !Number.isFinite(v)) return "—";
  const nf = (n, d) => new Intl.NumberFormat(locale, { minimumFractionDigits: d, maximumFractionDigits: d }).format(n);
  if (METRICS[metric]?.unitless) return nf(v, 2);
  if (v >= 1000) return t ? t("perfAdmin.unit.s", { n: nf(v / 1000, 2) }) : `${nf(v / 1000, 2)} s`;
  return t ? t("perfAdmin.unit.ms", { n: nf(Math.round(v), 0) }) : `${Math.round(v)} ms`;
}

/** KPI change chip: "+%9" / "-0,01" and whether it is worse ("up", red) or better ("dn"). */
export function deltaChip(metric, d, locale = "tr") {
  if (d == null || !Number.isFinite(d)) return null;
  if (METRICS[metric]?.unitless) {
    if (Math.abs(d) < 0.005) return { text: "0", tone: "flat" };
    const s = new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: "always" }).format(d);
    return { text: s, tone: d > 0 ? "up" : "dn" };
  }
  if (d === 0) return { text: "0", tone: "flat" };
  const pct = new Intl.NumberFormat(locale, { style: "percent", signDisplay: "always", maximumFractionDigits: 0 }).format(d / 100);
  return { text: pct, tone: d > 0 ? "up" : "dn" };
}

export function fmtPct(v, locale = "tr") {
  if (v == null || !Number.isFinite(v)) return "—";
  return new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 0 }).format(v / 100);
}

export function fmtInt(v, locale = "tr") {
  if (v == null || !Number.isFinite(v)) return "—";
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(v);
}

/** Short user id ("#3f2a9c1e") — the panel never shows anything else about a person. */
export function shortUser(id) {
  return `#${String(id || "").replace(/-/g, "").slice(0, 8)}`;
}

/* ---------------- query tokens ---------------- */

export const DEFAULT_TOKENS = Object.freeze([{ kind: "range", value: "28d" }]);

/** Tokens -> server query ({ range, platform: [], ..., user }). */
export function tokensToQuery(tokens) {
  const q = { range: "28d" };
  for (const k of LIST_KINDS) q[k] = [];
  q.user = "";
  for (const tok of tokens || []) {
    if (tok.kind === "range" && RANGES.includes(tok.value)) q.range = tok.value;
    else if (LIST_KINDS.includes(tok.kind)) {
      const vals = Array.isArray(tok.value) ? tok.value : [tok.value];
      for (const v of vals) if (v && !q[tok.kind].includes(v)) q[tok.kind].push(String(v));
    } else if (tok.kind === "user" && tok.value) q.user = String(tok.value).replace(/^#/, "").toLowerCase();
  }
  return q;
}

/** Server query -> tokens (range first, then dimensions in catalogue order). */
export function queryToTokens(q = {}) {
  const out = [{ kind: "range", value: RANGES.includes(q.range) ? q.range : "28d" }];
  for (const k of LIST_KINDS) {
    const vals = Array.isArray(q[k]) ? q[k].filter(Boolean) : [];
    if (vals.length) out.push({ kind: k, value: vals.map(String) });
  }
  if (q.user) out.push({ kind: "user", value: String(q.user) });
  return out;
}

/** Add a value to a token (list kinds merge, single kinds replace). */
export function addToken(tokens, kind, value) {
  if (!TOKEN_KINDS.includes(kind) || value == null || value === "") return tokens;
  if (!LIST_KINDS.includes(kind)) return [...tokens.filter((x) => x.kind !== kind), { kind, value: String(value) }];
  const cur = tokens.find((x) => x.kind === kind);
  if (!cur) return [...tokens, { kind, value: [String(value)] }];
  const vals = Array.isArray(cur.value) ? cur.value : [cur.value];
  return vals.includes(String(value)) ? tokens : tokens.map((x) => (x === cur ? { ...x, value: [...vals, String(value)] } : x));
}

/** Toggle one value (chart legend / heat-map cell). */
export function toggleToken(tokens, kind, value) {
  const cur = tokens.find((x) => x.kind === kind);
  const vals = cur ? (Array.isArray(cur.value) ? cur.value : [cur.value]) : [];
  if (!vals.includes(String(value))) return addToken(tokens, kind, value);
  const rest = vals.filter((v) => v !== String(value));
  return rest.length ? tokens.map((x) => (x === cur ? { ...x, value: rest } : x)) : tokens.filter((x) => x !== cur);
}

export function sameQuery(a, b) {
  const norm = (q) => {
    const x = tokensToQuery(queryToTokens(q || {}));
    for (const k of LIST_KINDS) x[k] = [...x[k]].sort();
    return JSON.stringify(x);
  };
  return norm(a) === norm(b);
}

/**
 * Suggestions for what the admin typed: "and" -> platform Android, "4.1" -> versions,
 * "app/" -> routes, "tr" -> country, a hex id -> user id. `facets` from the summary.
 */
export function suggestionsFor(text, facets = {}, labels = {}) {
  const s = String(text || "").trim().toLowerCase();
  const out = [];
  const push = (kind, value, label) => out.push({ kind, value, label: label || value });
  if (!s) {
    for (const r of RANGES) push("range", r, labels.range?.(r));
    return out.slice(0, 8);
  }
  for (const p of PLATFORMS) if (p.k.includes(s) || String(labels.platform?.(p.k) || "").toLowerCase().includes(s)) push("platform", p.k, labels.platform?.(p.k));
  for (const v of facets.version || []) if (v.toLowerCase().startsWith(s)) push("version", v);
  for (const r of facets.route || []) if (r.toLowerCase().includes(s)) push("route", r);
  for (const d of DEVICES) if (d.startsWith(s) || String(labels.device?.(d) || "").toLowerCase().startsWith(s)) push("device", d, labels.device?.(d));
  for (const c of CONNECTIONS) if (c.startsWith(s) || String(labels.connection?.(c) || "").toLowerCase().startsWith(s)) push("connection", c, labels.connection?.(c));
  for (const c of facets.country || []) if (c.toLowerCase().startsWith(s)) push("country", c, labels.country?.(c));
  if (/^#?[0-9a-f-]{8,36}$/.test(s)) push("user", s.replace(/^#/, ""), shortUser(s.replace(/^#/, "")));
  for (const r of RANGES) if (r.startsWith(s)) push("range", r, labels.range?.(r));
  return out.slice(0, 10);
}

/* ---------------- shareable links ---------------- */

const b64 = (s) => (typeof btoa === "function" ? btoa(s) : Buffer.from(s, "binary").toString("base64"));
const unb64 = (s) => (typeof atob === "function" ? atob(s) : Buffer.from(s, "base64").toString("binary"));

/** "/admin/panel?tab=perf#perf=<base64url JSON>" for "Bağlantıyı kopyala". */
export function viewLink(origin, query, tab = "rum") {
  const json = JSON.stringify({ ...tokensToQuery(queryToTokens(query)), tab });
  const enc = b64(unescape(encodeURIComponent(json))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${String(origin || "").replace(/\/+$/, "")}/admin/panel?tab=perf#perf=${enc}`;
}

/** Query from a "#perf=..." hash, or null. */
export function parseViewLink(hash) {
  const m = /#perf=([A-Za-z0-9_-]{4,2000})/.exec(String(hash || ""));
  if (!m) return null;
  try {
    const pad = m[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = decodeURIComponent(escape(unb64(pad + "===".slice((pad.length + 3) % 4))));
    const q = JSON.parse(json);
    if (!q || typeof q !== "object") return null;
    return { query: tokensToQuery(queryToTokens(q)), tab: q.tab === "lh" ? "lh" : "rum" };
  } catch {
    return null;
  }
}

/** Built-in views of the draft ("Tümü", "Mobil · yavaş ağ", "Masaüstü açılış", "Sesli oda"). */
export const BUILTIN_VIEWS = Object.freeze([
  { id: "all", query: { range: "28d" } },
  { id: "mobileSlow", query: { range: "28d", platform: ["ios", "android"], connection: ["3g", "2g"] } },
  { id: "desktopStart", query: { range: "28d", platform: ["electron", "tauri"] }, chart: "appstart" },
  { id: "voice", query: { range: "28d", route: ["app/ses"] } },
]);

/* ---------------- chart geometry ---------------- */

/** y-axis ticks for a metric's value range. */
export function niceTicks(min, max, count = 3) {
  const span = Math.max(1e-9, max - min);
  const raw = span / count;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((x) => x >= raw) || raw;
  const out = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) out.push(Math.round(v * 1e6) / 1e6);
  return out;
}

/** Domain for the p75 chart: covers the series and the "good" threshold line. */
export function chartDomain(series, metric) {
  const vals = Object.values(series || {}).flat().filter((v) => v != null && Number.isFinite(v));
  const good = METRICS[metric]?.good ?? 0;
  if (!vals.length) return { min: 0, max: good * 1.6 || 1 };
  const lo = Math.min(...vals, good);
  const hi = Math.max(...vals, good);
  const pad = (hi - lo) * 0.18 || hi * 0.2 || 1;
  return { min: Math.max(0, lo - pad), max: hi + pad };
}
