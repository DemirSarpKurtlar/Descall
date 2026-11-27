"use strict";

/**
 * Yönetici Paneli › Performans: pure model (no I/O). Shared by the beacon route, the
 * rollup / alert job and the admin routes; tested by perfModel.selftest.cjs.
 *
 *  - metric catalogue + web.dev thresholds (good / needs improvement / poor)
 *  - beacon payload validation (whitelists, clamps, no free text beyond selectors)
 *  - log-scale histograms: merge exactly, read p75 from the merged counts (~5 %)
 *  - release regressions (the live detector and the "last 90 days" rule preview use
 *    the same function, so the preview is what the rule would really have done)
 */

const METRICS = Object.freeze({
  lcp: { good: 2500, poor: 4000, unit: "ms" },
  inp: { good: 200, poor: 500, unit: "ms" },
  // CLS is unitless; stored x1000 so it fits the same integer-ish histogram.
  cls: { good: 100, poor: 250, unit: "cls" },
  fcp: { good: 1800, poor: 3000, unit: "ms" },
  ttfb: { good: 800, poor: 1800, unit: "ms" },
  msglist: { good: 1000, poor: 2500, unit: "ms" },
  voicejoin: { good: 1500, poor: 3000, unit: "ms" },
  appstart: { good: 2000, poor: 4000, unit: "ms" },
});
const METRIC_KEYS = Object.freeze(Object.keys(METRICS));
const ALL_METRICS = Object.freeze([...METRIC_KEYS, "sess"]);
const PLATFORMS = Object.freeze(["web", "ios", "android", "electron", "tauri"]);
const DEVICE_CLASSES = Object.freeze(["low", "mid", "high"]);
const CONNECTIONS = Object.freeze(["wifi", "ethernet", "4g", "3g", "2g", "offline"]);
const RANGES = Object.freeze({ "24h": 1, "7d": 7, "28d": 28, "90d": 90 });
const MAX_VALUE = 600000;
const BASE = 1.1;
const LN_BASE = Math.log(BASE);
const RAW_RETENTION_DAYS = 14;

/* ---------------- ratings + histogram ---------------- */

function rate(metric, value) {
  const m = METRICS[metric];
  if (!m || !Number.isFinite(value)) return 0;
  if (value <= m.good) return 0;
  if (value <= m.poor) return 1;
  return 2;
}

/** Histogram bucket of a value (same formula as SQL perf_hour_buckets). */
function bucketOf(value) {
  const v = Number(value);
  if (!Number.isFinite(v) || v <= 1) return 0;
  return 1 + Math.floor(Math.log(v) / LN_BASE + 1e-9);
}

/** Representative value of a bucket (geometric middle of its range). */
function bucketValue(b) {
  const k = Number(b);
  if (!(k > 0)) return 1;
  return Math.pow(BASE, k - 0.5);
}

function emptyAgg() {
  return { n: 0, good: 0, ni: 0, poor: 0, total: 0, hist: {} };
}

/** Add one rollup-like row ({n, good, ni, poor, total, hist}) into agg (mutates agg). */
function addInto(agg, row) {
  agg.n += Number(row.n) || 0;
  agg.good += Number(row.good) || 0;
  agg.ni += Number(row.ni) || 0;
  agg.poor += Number(row.poor) || 0;
  agg.total += Number(row.total) || 0;
  const h = row.hist && typeof row.hist === "object" ? row.hist : {};
  for (const [k, c] of Object.entries(h)) {
    const n = Number(c) || 0;
    if (n > 0) agg.hist[k] = (agg.hist[k] || 0) + n;
  }
  return agg;
}

/** Value at quantile q (0..1) of a histogram, null when empty. */
function quantile(hist, q = 0.75) {
  const entries = Object.entries(hist || {})
    .map(([k, c]) => [Number(k), Number(c) || 0])
    .filter(([k, c]) => Number.isFinite(k) && c > 0)
    .sort((a, b) => a[0] - b[0]);
  const total = entries.reduce((s, [, c]) => s + c, 0);
  if (!total) return null;
  const want = Math.max(1, Math.ceil(total * q));
  let seen = 0;
  for (const [k, c] of entries) {
    seen += c;
    if (seen >= want) return bucketValue(k);
  }
  return bucketValue(entries[entries.length - 1][0]);
}

/** {n, p75, dist: [good%, ni%, poor%], mean} of an aggregate. */
function summarize(agg, metric) {
  const n = Number(agg?.n) || 0;
  if (!n) return { n: 0, p75: null, dist: [0, 0, 0], mean: null };
  let p75 = quantile(agg.hist, 0.75);
  if (p75 != null && METRICS[metric]?.unit === "cls") p75 = p75 / 1000;
  const pct = (x) => Math.round(((Number(x) || 0) / n) * 100);
  const g = pct(agg.good);
  const p = pct(agg.poor);
  return { n, p75, dist: [g, Math.max(0, 100 - g - p), p], mean: agg.total / n };
}

/** Group rows by keyFn into aggregates. */
function aggregate(rows, keyFn) {
  const out = new Map();
  for (const r of rows || []) {
    const key = keyFn(r);
    if (key == null) continue;
    let a = out.get(key);
    if (!a) {
      a = emptyAgg();
      out.set(key, a);
    }
    addInto(a, r);
  }
  return out;
}

/** Raw events -> rollup rows keyed by dimensions (JS twin of perf_hour_buckets). */
function rollupFromEvents(events, bucketKey) {
  const out = new Map();
  for (const e of events || []) {
    const dims = [e.metric, e.route || "", e.platform, e.app_version || "", e.device_class || "", e.connection || "", e.country || ""];
    const key = dims.join("\u0001");
    let row = out.get(key);
    if (!row) {
      row = { ...bucketKey, metric: dims[0], route: dims[1], platform: dims[2], app_version: dims[3], device_class: dims[4], connection: dims[5], country: dims[6], ...emptyAgg() };
      out.set(key, row);
    }
    const v = Number(e.value) || 0;
    const b = String(e.bucket != null ? e.bucket : bucketOf(v));
    const c = Number(e.cnt) || 1;
    row.n += c;
    const rating = e.rating != null ? Number(e.rating) : rate(e.metric, v);
    if (e.cnt != null) {
      row.good += Number(e.good) || 0;
      row.ni += Number(e.ni) || 0;
      row.poor += Number(e.poor) || 0;
      row.total += Number(e.total) || 0;
    } else {
      if (rating === 0) row.good += 1;
      else if (rating === 1) row.ni += 1;
      else row.poor += 1;
      row.total += v;
    }
    row.hist[b] = (row.hist[b] || 0) + c;
  }
  return [...out.values()];
}

/* ---------------- beacon validation ---------------- */

const ROUTE_RE = /^[a-z0-9/_.:-]{0,80}$/i;
const SESSION_RE = /^[A-Za-z0-9_-]{8,32}$/;
const VERSION_RE = /^[0-9]{1,4}(\.[0-9]{1,4}){0,3}([-+][0-9A-Za-z.]{1,12})?$/;
const SELECTOR_RE = /[^A-Za-z0-9 #.:_>()[\]="'*+~-]/g;

/** App route as the panel shows it: lowercase, ids collapsed, no query / hash. */
function normalizeRoute(route) {
  let r = String(route || "").split(/[?#]/)[0].trim().toLowerCase();
  if (!r) return "";
  r = r
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, ":id")
    .replace(/\/\d{3,}(?=\/|$)/g, "/:id")
    .replace(/\/{2,}/g, "/");
  if (r.length > 1) r = r.replace(/\/+$/, "");
  return ROUTE_RE.test(r) ? r : "";
}

/** CSS selector from the attribution build, cut to something safe to store and show. */
function cleanSelector(s) {
  const v = String(s || "").replace(SELECTOR_RE, "").replace(/\s+/g, " ").trim();
  // Keep the last two steps ("ul.member-list > li") so it reads like the panel draft.
  const parts = v.split(">").map((x) => x.trim()).filter(Boolean);
  return parts.slice(-2).join(" > ").slice(0, 80);
}

function pick(list, v) {
  const s = String(v || "").toLowerCase();
  return list.includes(s) ? s : "";
}

function num(v, lo, hi) {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.min(hi, Math.max(lo, n));
}

function cleanAttribution(metric, a) {
  if (!a || typeof a !== "object") return null;
  const out = {};
  if (metric === "inp") {
    if (a.target) out.target = cleanSelector(a.target);
    if (a.type === "keyboard" || a.type === "pointer") out.type = a.type;
    if (["loading", "dom-interactive", "dom-content-loaded", "complete"].includes(a.load)) out.load = a.load;
    for (const k of ["delay", "proc", "pres"]) {
      const v = num(a[k], 0, MAX_VALUE);
      if (v != null) out[k] = Math.round(v);
    }
  } else if (metric === "lcp") {
    if (a.element) out.element = cleanSelector(a.element);
    for (const k of ["ttfb", "loadDelay", "loadTime", "renderDelay"]) {
      const v = num(a[k], 0, MAX_VALUE);
      if (v != null) out[k] = Math.round(v);
    }
  } else if (metric === "cls") {
    if (a.target) out.target = cleanSelector(a.target);
  } else if (metric === "msglist" || metric === "voicejoin") {
    if (a.kind === "server" || a.kind === "dm" || a.kind === "group" || a.kind === "mesh" || a.kind === "sfu") out.kind = a.kind;
  }
  // When it happened (ms since the page started): the session timeline in the side panel.
  const at = num(a.at, 0, 6 * 3600e3);
  if (at != null && ["inp", "msglist", "voicejoin", "appstart"].includes(metric)) out.at = Math.round(at);
  return Object.keys(out).length ? out : null;
}

/**
 * Validate one beacon body. Returns { ok, events, error }. The user id never comes from
 * the payload (the route adds it from the verified session token).
 * @param {any} body parsed JSON
 * @param {{ country?: string|null, now?: number }} ctx
 */
function validateBatch(body, { country = null, now = Date.now() } = {}) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { ok: false, error: "BAD_BODY", events: [] };
  if (Number(body.v) !== 1) return { ok: false, error: "BAD_VERSION", events: [] };
  const sid = String(body.sid || "");
  if (!SESSION_RE.test(sid)) return { ok: false, error: "BAD_SESSION", events: [] };
  const platform = pick(PLATFORMS, body.p);
  if (!platform) return { ok: false, error: "BAD_PLATFORM", events: [] };
  const list = Array.isArray(body.e) ? body.e : [];
  if (!list.length) return { ok: false, error: "EMPTY", events: [] };
  if (list.length > 40) return { ok: false, error: "TOO_MANY", events: [] };
  const version = VERSION_RE.test(String(body.ver || "")) ? String(body.ver) : "";
  const sr = num(body.sr, 0.001, 1) || 1;
  const base = {
    session_id: sid,
    platform,
    app_version: version,
    device_class: pick(DEVICE_CLASSES, body.dc),
    connection: pick(CONNECTIONS, body.cn),
    country: /^[A-Z]{2}$/.test(String(country || "")) ? String(country) : "",
    browser: /^[A-Za-z ]{1,24}$/.test(String(body.br || "")) ? String(body.br) : "",
    nav_type: /^[a-z_-]{1,16}$/.test(String(body.nt || "")) ? String(body.nt) : "",
    sample_rate: sr,
  };
  const events = [];
  const seen = new Set();
  for (const raw of list) {
    if (!raw || typeof raw !== "object") continue;
    const metric = String(raw.m || "");
    if (!ALL_METRICS.includes(metric)) continue;
    let value = Number(raw.v);
    if (!Number.isFinite(value) || value < 0) continue;
    if (metric === "cls") value = Math.round(value * 1000);
    if (value > MAX_VALUE) continue;
    const route = normalizeRoute(raw.r);
    // One value per metric + route per page load (web-vitals reports a final value).
    const once = `${metric}|${route}`;
    if (metric !== "msglist" && metric !== "voicejoin" && seen.has(once)) continue;
    seen.add(once);
    const age = Number(raw.t);
    const at = Number.isFinite(age) && age >= 0 && age < 6 * 3600e3 ? new Date(now - age).toISOString() : new Date(now).toISOString();
    events.push({
      ...base,
      at,
      metric,
      value: metric === "sess" ? 1 : Math.round(value * 10) / 10,
      rating: metric === "sess" ? 0 : rate(metric, value),
      route,
      attribution: metric === "sess" ? null : cleanAttribution(metric, raw.a),
    });
  }
  if (!events.length) return { ok: false, error: "NO_VALID_EVENTS", events: [] };
  return { ok: true, events };
}

/* ---------------- query filters ---------------- */

const FILTER_KEYS = Object.freeze(["platform", "version", "route", "device", "connection", "country"]);
const FILTER_COL = Object.freeze({ platform: "platform", version: "app_version", route: "route", device: "device_class", connection: "connection", country: "country" });

/** Clean the panel's query ({range, platform:[], version:[], route:[], device:[], connection:[], country:[], user}). */
function parseQuery(q = {}) {
  const src = q && typeof q === "object" ? q : {};
  const list = (v) => (Array.isArray(v) ? v : typeof v === "string" && v ? v.split(",") : []).map((x) => String(x).trim()).filter(Boolean).slice(0, 12);
  const out = { range: RANGES[src.range] ? src.range : "28d" };
  out.platform = list(src.platform).filter((x) => PLATFORMS.includes(x));
  out.version = list(src.version).filter((x) => VERSION_RE.test(x));
  out.route = list(src.route).map(normalizeRoute).filter(Boolean);
  out.device = list(src.device).filter((x) => DEVICE_CLASSES.includes(x));
  out.connection = list(src.connection).filter((x) => CONNECTIONS.includes(x));
  out.country = list(src.country).map((x) => x.toUpperCase()).filter((x) => /^[A-Z]{2}$/.test(x));
  const user = String(src.user || "").trim().toLowerCase();
  out.user = /^[0-9a-f-]{8,36}$/.test(user) ? user : "";
  return out;
}

/** Row predicate for a parsed query (dimensions only; time is the caller's). */
function rowMatches(row, query, skip = null) {
  for (const k of FILTER_KEYS) {
    if (k === skip) continue;
    const want = query[k];
    if (want && want.length && !want.includes(String(row[FILTER_COL[k]] || ""))) return false;
  }
  return true;
}

/* ---------------- versions + regressions ---------------- */

function versionParts(v) {
  return String(v || "")
    .split(/[-+]/)[0]
    .split(".")
    .map((x) => Number(x) || 0);
}

function compareVersions(a, b) {
  const x = versionParts(a);
  const y = versionParts(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] || 0) - (y[i] || 0);
    if (d) return d;
  }
  return 0;
}

/**
 * Release regressions from daily rows ({day, metric, platform, app_version, n, ..., hist}).
 * For every platform and metric of the rule, each release is compared with the release
 * before it (by version number) over the window: p75 worse by more than threshold % with
 * at least minSessions samples on the new release fires.
 * @returns {{key, metric, platform, version, prevVersion, prevP75, curP75, deltaPct, sessions, firstDay}[]}
 */
function findRegressions(rows, rule, { onlyLatest = false } = {}) {
  const metrics = (rule?.metrics || []).filter((m) => METRICS[m]);
  const platforms = (rule?.platforms || []).filter((p) => PLATFORMS.includes(p));
  const thr = Math.max(1, Number(rule?.threshold_pct ?? rule?.thresholdPct) || 15);
  const minN = Math.max(1, Number(rule?.min_sessions ?? rule?.minSessions) || 1);
  const out = [];
  for (const platform of platforms) {
    for (const metric of metrics) {
      const mine = (rows || []).filter((r) => r.metric === metric && r.platform === platform && r.app_version);
      const byVer = new Map();
      for (const r of mine) {
        let v = byVer.get(r.app_version);
        if (!v) {
          v = { agg: emptyAgg(), first: r.day };
          byVer.set(r.app_version, v);
        }
        addInto(v.agg, r);
        if (String(r.day) < String(v.first)) v.first = r.day;
      }
      const versions = [...byVer.keys()].sort(compareVersions);
      const pairs = onlyLatest ? versions.slice(-1) : versions.slice(1);
      for (const ver of pairs) {
        const i = versions.indexOf(ver);
        if (i < 1) continue;
        const prev = versions[i - 1];
        const cur = summarize(byVer.get(ver).agg, metric);
        const before = summarize(byVer.get(prev).agg, metric);
        if (cur.n < minN || !before.n || cur.p75 == null || before.p75 == null || before.p75 <= 0) continue;
        const deltaPct = ((cur.p75 - before.p75) / before.p75) * 100;
        if (deltaPct <= thr) continue;
        out.push({
          key: `${platform}|${metric}|${ver}`,
          metric,
          platform,
          version: ver,
          prevVersion: prev,
          prevP75: before.p75,
          curP75: cur.p75,
          deltaPct: Math.round(deltaPct * 10) / 10,
          sessions: cur.n,
          firstDay: String(byVer.get(ver).first),
        });
      }
    }
  }
  return out.sort((a, b) => String(b.firstDay).localeCompare(String(a.firstDay)) || b.deltaPct - a.deltaPct);
}

/** "Kural son 90 günde kaç kez tetiklenirdi": every regression the rule would have raised. */
function previewRule(rows90, rule) {
  let fires = findRegressions(rows90, rule);
  // "7 gün": after one alert the rule stays silent for a week (every release).
  if (rule?.mute === "7d") {
    const kept = [];
    for (const f of [...fires].sort((a, b) => String(a.firstDay).localeCompare(String(b.firstDay)))) {
      const last = kept[kept.length - 1];
      if (last && Date.parse(f.firstDay) - Date.parse(last.firstDay) < 7 * 86400e3) continue;
      kept.push(f);
    }
    fires = kept.reverse();
  }
  return { count: fires.length, fires: fires.slice(0, 12) };
}

/** Normalize a rule body from the dialog. Returns { ok, rule, error }. */
function cleanRule(body = {}) {
  const metrics = [...new Set((Array.isArray(body.metrics) ? body.metrics : []).filter((m) => METRICS[m]))];
  const platforms = [...new Set((Array.isArray(body.platforms) ? body.platforms : []).filter((p) => PLATFORMS.includes(p)))];
  const channels = [...new Set((Array.isArray(body.channels) ? body.channels : []).filter((c) => ["adminRoom", "ownerPush", "email", "errorLog"].includes(c)))];
  const threshold = Math.round(Number(body.thresholdPct));
  const minSessions = Math.round(Number(body.minSessions));
  const mute = ["none", "release24h", "7d"].includes(body.mute) ? body.mute : "release24h";
  if (!metrics.length) return { ok: false, error: "NO_METRIC" };
  if (!platforms.length) return { ok: false, error: "NO_PLATFORM" };
  if (!(threshold >= 1 && threshold <= 500)) return { ok: false, error: "BAD_THRESHOLD" };
  if (!(minSessions >= 10 && minSessions <= 10000000)) return { ok: false, error: "BAD_MIN_SESSIONS" };
  return {
    ok: true,
    rule: {
      name: String(body.name || "").replace(/\s+/g, " ").trim().slice(0, 80),
      enabled: body.enabled !== false,
      metrics,
      platforms,
      threshold_pct: threshold,
      min_sessions: minSessions,
      channels,
      mute,
    },
  };
}

const DEFAULT_RULE = Object.freeze({
  id: "default",
  name: "",
  enabled: true,
  metrics: ["inp", "appstart"],
  platforms: ["ios", "android", "electron", "tauri"],
  threshold_pct: 15,
  min_sessions: 2000,
  channels: ["adminRoom", "ownerPush", "errorLog"],
  mute: "release24h",
});

/** Mute window in ms for a rule ("release24h": same release silent for 24 h). */
function muteMs(mute) {
  if (mute === "7d") return 7 * 86400e3;
  if (mute === "release24h") return 86400e3;
  return 0;
}

/* ---------------- formatting for notifications ---------------- */

function fmtValue(metric, v) {
  if (v == null || !Number.isFinite(v)) return "-";
  if (METRICS[metric]?.unit === "cls") return v.toFixed(2);
  if (v >= 1000) return `${(v / 1000).toFixed(2)} s`;
  return `${Math.round(v)} ms`;
}

const METRIC_LABEL = Object.freeze({ lcp: "LCP", inp: "INP", cls: "CLS", fcp: "FCP", ttfb: "TTFB", msglist: "message list", voicejoin: "voice join", appstart: "app start" });
const PLATFORM_LABEL = Object.freeze({ web: "Web", ios: "iOS", android: "Android", electron: "Electron", tauri: "Tauri" });

function alertText(a) {
  return `${a.version} ${PLATFORM_LABEL[a.platform] || a.platform} ${METRIC_LABEL[a.metric] || a.metric} p75 ${fmtValue(a.metric, a.prevP75)} -> ${fmtValue(a.metric, a.curP75)} (+${Math.round(a.deltaPct)}%), ${a.sessions} samples`;
}

module.exports = {
  METRICS,
  METRIC_KEYS,
  ALL_METRICS,
  PLATFORMS,
  DEVICE_CLASSES,
  CONNECTIONS,
  RANGES,
  FILTER_KEYS,
  FILTER_COL,
  RAW_RETENTION_DAYS,
  DEFAULT_RULE,
  rate,
  bucketOf,
  bucketValue,
  emptyAgg,
  addInto,
  quantile,
  summarize,
  aggregate,
  rollupFromEvents,
  normalizeRoute,
  cleanSelector,
  validateBatch,
  parseQuery,
  rowMatches,
  compareVersions,
  findRegressions,
  previewRule,
  cleanRule,
  muteMs,
  fmtValue,
  alertText,
};
