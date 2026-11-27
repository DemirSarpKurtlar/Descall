"use strict";

/**
 * Yönetici Paneli › Performans (section "perf", owner pick Draft A "Konsol", Nov 2026).
 * Mounted inside routes/admin.js after requireAuth, requireAdmin, 2FA, step-up and the
 * section check. Every view reads the rollups (any time range / filter merges exactly);
 * the user-id filter and the side panel's attribution / slow users read the raw events
 * (kept 14 days).
 *
 *   GET    /perf/summary?q=&chart=inp        tiles, p75 chart + markers, releases, mix, alerts, facets
 *   GET    /perf/table?q=&group=route&sort=inp
 *   GET    /perf/detail?q=&dim=route&value=  side panel: tiles, heat map, attribution, slow users, Lighthouse
 *   GET    /perf/session/:id                 one page load as a waterfall (slow user row)
 *   GET    /perf/export?q=&group=&sort=      CSV of the table (audited)
 *   GET    /perf/views | POST /perf/views | DELETE /perf/views/:id
 *   GET    /perf/rules | PUT /perf/rules/:id | DELETE /perf/rules/:id | POST /perf/rules/preview
 *   GET    /perf/alerts | POST /perf/alerts/:id/hide | /unhide | /error-log
 *   GET    /perf/lighthouse                  Lighthouse CI tab
 */

const express = require("express");
const model = require("../lib/perfModel");
const store = require("../lib/perfStore");
const Q = require("../lib/perfQueries");
const state = require("../runtime/sharedState");
const { apiError } = require("../lib/apiError");

const router = express.Router();
const DAY = 86400e3;
const CACHE_MS = 30e3;
const cache = new Map();
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function fail(res, err, fallback) {
  if (err?.code === "PERF_UNAVAILABLE") return res.status(200).json({ ready: false, code: "PERF_UNAVAILABLE" });
  const status = err?.status && err.status < 500 ? err.status : 500;
  if (status >= 500) console.error("[perf]", err?.message || err);
  return res.status(status).json({ error: status >= 500 ? fallback : err.message, code: err?.code || null });
}

function audit(req, action, target, meta) {
  try {
    state.appendAudit(req.user.id, req.user.username, action, target, meta);
  } catch {
    /* audit is best-effort here */
  }
}

function queryOf(req) {
  let raw = {};
  try {
    raw = req.query.q ? JSON.parse(String(req.query.q)) : {};
  } catch {
    raw = {};
  }
  return model.parseQuery(raw);
}

async function cached(key, fn) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;
  const value = await fn();
  cache.set(key, { at: Date.now(), value });
  if (cache.size > 200) cache.delete(cache.keys().next().value);
  return value;
}

function windowOf(range, now = Date.now(), back = 0) {
  if (range === "24h") {
    const end = new Date(now);
    end.setUTCMinutes(0, 0, 0);
    const to = end.getTime() + 3600e3 - back * DAY;
    return { grain: "hourly", from: new Date(to - DAY).toISOString(), to: new Date(to).toISOString() };
  }
  const days = model.RANGES[range] || 28;
  const today = Date.parse(new Date(now).toISOString().slice(0, 10));
  const to = today + DAY - back * days * DAY;
  return { grain: "daily", from: new Date(to - days * DAY).toISOString().slice(0, 10), to: new Date(to).toISOString().slice(0, 10) };
}

/** Rollup rows for a query (raw events when filtered by user id). */
async function rowsFor(query, { back = 0, metrics = null, skip = null } = {}) {
  const w = windowOf(query.range, Date.now(), back ? 1 : 0);
  if (query.user) {
    const from = new Date(Math.max(Date.parse(w.from), Date.now() - model.RAW_RETENTION_DAYS * DAY)).toISOString();
    const ev = await store.rawEvents({ from, query, userId: UUID_RE.test(query.user) ? query.user : null, metrics, limit: 4000 });
    const mine = UUID_RE.test(query.user) ? ev : ev.filter((e) => String(e.user_id || "").startsWith(query.user));
    return Q.rowsFromRaw(mine.filter((e) => !w.to || Date.parse(e.at) < Date.parse(w.to)), w.grain);
  }
  return store.loadRollups({ grain: w.grain, from: w.from, to: w.to, metrics, query, skip });
}

async function flagMarkers(fromIso) {
  try {
    const history = require("../lib/settingsHistory");
    const flags = require("../lib/systemFlags");
    const page = await history.list({ limit: 200 });
    const out = [];
    for (const e of page.entries || []) {
      if (Date.parse(e.at) < Date.parse(fromIso)) continue;
      const key = flags.FLAG_KEYS.find((k) => (e.changes || []).some((c) => flags.historyKeysOf(k).includes(c.key)));
      if (!key) continue;
      const st = flags.stateFromEntry(key, e) || {};
      out.push({ key, at: e.at, percent: Number(st.percent) || 0, mode: st.mode || "" });
    }
    return out.slice(0, 20);
  } catch {
    return [];
  }
}

/* ---------------- summary ---------------- */

router.get("/perf/summary", async (req, res) => {
  const query = queryOf(req);
  const chartMetric = Q.CHART_METRICS.includes(req.query.chart) ? req.query.chart : "inp";
  try {
    const value = await cached(`s|${JSON.stringify(query)}|${chartMetric}`, async () => {
      const w = windowOf(query.range);
      const keys = Q.axis(query.range);
      const [rows, prevRows, alerts, live, last, flagsList, shareRows] = await Promise.all([
        rowsFor(query),
        rowsFor(query, { back: 1 }).catch(() => []),
        store.listAlerts({ since: new Date(Date.now() - 60 * DAY).toISOString(), limit: 50 }),
        store.liveSessions().catch(() => null),
        store.lastEventAt().catch(() => null),
        flagMarkers(w.grain === "hourly" ? w.from : `${w.from}T00:00:00.000Z`),
        store.loadRollups({ grain: "hourly", from: new Date(Date.now() - DAY).toISOString(), metrics: ["sess"], query: { ...query, version: [] } }).catch(() => []),
      ]);
      const releases = Q.releaseStarts(rows, keys);
      const mix = Q.platformMix(rows);
      return {
        ready: true,
        range: query.range,
        sampleRate: last?.sample_rate != null ? Number(last.sample_rate) : null,
        lastEventAt: last?.at || null,
        live,
        kpis: Q.kpis(rows, prevRows, keys.slice(-16)),
        chart: Q.chart(rows, chartMetric, keys, { releases, flags: flagsList, alerts }),
        releases: Q.releaseTable(rows, shareRows, alerts),
        mix: mix.mix,
        sessions: mix.total,
        alerts: alerts.filter((a) => a.status === "open").map(alertView),
        hiddenAlerts: alerts.filter((a) => a.status === "hidden").slice(0, 5).map(alertView),
        facets: Q.facets(rows),
      };
    });
    res.set("Cache-Control", "no-store");
    res.json(value);
  } catch (err) {
    fail(res, err, "Could not load the performance summary.");
  }
});

function alertView(a) {
  return {
    id: a.id,
    key: a.alert_key,
    metric: a.metric,
    platform: a.platform,
    version: a.app_version,
    prevVersion: a.prev_version,
    prevP75: a.prev_p75,
    curP75: a.cur_p75,
    deltaPct: a.delta_pct,
    sessions: a.sessions,
    sharePct: a.share_pct,
    topRoutes: a.top_routes || [],
    firstSeen: a.first_seen,
    status: a.status,
    errorLogId: a.error_log_id || null,
    at: a.created_at,
  };
}

/* ---------------- table ---------------- */

async function tableFor(req) {
  const query = queryOf(req);
  const group = typeof req.query.group === "string" && Object.hasOwn(Q.GROUPS, req.query.group) ? req.query.group : "route";
  const sort = model.METRICS[req.query.sort] ? req.query.sort : "inp";
  return cached(`t|${JSON.stringify(query)}|${group}|${sort}`, async () => {
    const [rows, alerts] = await Promise.all([rowsFor(query), store.listAlerts({ status: "open", limit: 20 }).catch(() => [])]);
    return { ready: true, group, sort, rows: Q.table(rows, { group, sort, keys: Q.axis(query.range), alerts }), facets: Q.facets(rows) };
  });
}

router.get("/perf/table", async (req, res) => {
  try {
    res.set("Cache-Control", "no-store");
    res.json(await tableFor(req));
  } catch (err) {
    fail(res, err, "Could not load the table.");
  }
});

router.get("/perf/export", async (req, res) => {
  try {
    const t = await tableFor(req);
    const esc = (v) => {
      const s = v == null ? "" : String(v);
      return /[",\n;]/.test(s) || /^[=+\-@]/.test(s) ? `"${s.replace(/^([=+\-@])/, "'$1").replace(/"/g, '""')}"` : s;
    };
    const head = [t.group, "sessions", "lcp_p75_ms", "inp_p75_ms", "cls_p75", `${t.sort}_good_pct`, `${t.sort}_ni_pct`, `${t.sort}_poor_pct`];
    const lines = [head.join(",")];
    for (const r of t.rows) lines.push([r.key, r.sessions, r.lcp != null ? Math.round(r.lcp) : "", r.inp != null ? Math.round(r.inp) : "", r.cls != null ? r.cls.toFixed(3) : "", ...r.dist].map(esc).join(","));
    audit(req, "perf_export", t.group, { rows: t.rows.length });
    res.json({ filename: `descall-performans-${new Date().toISOString().slice(0, 10)}.csv`, mime: "text/csv;charset=utf-8", content: `﻿${lines.join("\n")}\n`, rows: t.rows.length });
  } catch (err) {
    fail(res, err, "Could not export.");
  }
});

/* ---------------- side panel ---------------- */

router.get("/perf/detail", async (req, res) => {
  const query = queryOf(req);
  // Own keys only: "constructor" / "__proto__" are not dimensions.
  const dim = typeof req.query.dim === "string" && Object.hasOwn(Q.GROUPS, req.query.dim) ? req.query.dim : "route";
  const value = String(req.query.value || "").slice(0, 80);
  if (!value) return res.status(400).json(apiError("Invalid id", null, { code: "BAD_VALUE" }));
  const q2 = { ...query, [dim]: [dim === "route" ? model.normalizeRoute(value) || value : value] };
  try {
    const out = await cached(`d|${JSON.stringify(q2)}|${dim}`, async () => {
      const w = windowOf(query.range);
      const rawFrom = new Date(Math.max(Date.parse(w.grain === "hourly" ? w.from : `${w.from}T00:00:00.000Z`), Date.now() - model.RAW_RETENTION_DAYS * DAY)).toISOString();
      const [rows, raw, lhRows] = await Promise.all([
        rowsFor(q2),
        store.rawEvents({ from: rawFrom, metrics: ["inp", "lcp"], query: q2, userId: query.user && UUID_RE.test(query.user) ? query.user : null, limit: 3000 }).catch(() => []),
        dim === "route" && value.startsWith("/") ? store.lighthouseRuns({ since: new Date(Date.now() - 30 * DAY).toISOString(), limit: 600 }).catch(() => []) : Promise.resolve([]),
      ]);
      const users = Q.slowUsers(raw);
      const counts = new Map();
      await Promise.all(
        users.users.map(async (u) => {
          const s = await store.userSessions(u.userId, rawFrom).catch(() => []);
          counts.set(u.userId, s.length);
        })
      );
      users.users.forEach((u) => (u.sessions = counts.get(u.userId) ?? null));
      const lh = lhRows.length ? Q.lighthouse(lhRows.filter((r) => r.page === value)) : null;
      return {
        ready: true,
        dim,
        value,
        sessions: Q.p75Of(rows, "sess").n,
        kpis: ["lcp", "inp", "cls", "msglist"].map((m) => ({ metric: m, ...Q.p75Of(rows, m) })),
        heat: Q.heat(rows, "inp"),
        attribution: Q.attribution(raw),
        slowUsers: users,
        lighthouse: lh && lh.main ? { main: lh.main, history: lh.history.slice(-10) } : null,
        rawDays: Math.round((Date.now() - Date.parse(rawFrom)) / DAY),
      };
    });
    res.set("Cache-Control", "no-store");
    res.json(out);
  } catch (err) {
    fail(res, err, "Could not load the details.");
  }
});

router.get("/perf/session/:id", async (req, res) => {
  const id = String(req.params.id || "");
  if (!/^[A-Za-z0-9_-]{8,32}$/.test(id)) return res.status(400).json(apiError("Invalid session.", null, { code: "BAD_SESSION" }));
  try {
    const events = await store.sessionEvents(id);
    res.set("Cache-Control", "no-store");
    res.json({ ready: true, ...Q.timeline(events) });
  } catch (err) {
    fail(res, err, "Could not load the session.");
  }
});

/* ---------------- views ---------------- */

router.get("/perf/views", async (_req, res) => {
  try {
    res.json({ ready: true, views: await store.listViews() });
  } catch (err) {
    fail(res, err, "Could not load the views.");
  }
});

router.post("/perf/views", async (req, res) => {
  const name = String(req.body?.name || "").replace(/\s+/g, " ").trim().slice(0, 60);
  if (!name) return res.status(400).json(apiError("Name required", null, { code: "NAME_REQUIRED" }));
  const query = model.parseQuery(req.body?.query || {});
  try {
    const view = await store.saveView({ owner_id: req.user.id, owner_username: req.user.username || null, name, query: { ...query, tab: req.body?.tab === "lh" ? "lh" : "rum" }, shared: req.body?.shared !== false });
    audit(req, "perf_view_save", view.id, { name });
    res.json({ view });
  } catch (err) {
    fail(res, err, "Could not save the view.");
  }
});

router.delete("/perf/views/:id", async (req, res) => {
  const id = String(req.params.id || "");
  if (!UUID_RE.test(id)) return res.status(400).json(apiError("Invalid id", null, { code: "BAD_ID" }));
  try {
    const views = await store.listViews();
    const v = views.find((x) => x.id === id);
    if (!v) return res.status(404).json(apiError("Not found", null, { code: "NOT_FOUND" }));
    await store.deleteView(id);
    audit(req, "perf_view_delete", id, { name: v.name });
    res.json({ ok: true });
  } catch (err) {
    fail(res, err, "Could not delete the view.");
  }
});

/* ---------------- rules ---------------- */

router.get("/perf/rules", async (_req, res) => {
  try {
    const rules = await store.listRules();
    res.json({ ready: true, rules: rules.length ? rules : [{ ...model.DEFAULT_RULE }], isDefault: !rules.length });
  } catch (err) {
    fail(res, err, "Could not load the rules.");
  }
});

async function previewOf(rule) {
  const from = new Date(Date.now() - 90 * DAY).toISOString().slice(0, 10);
  const rows = await store.loadRollups({ grain: "daily", from, metrics: rule.metrics, query: { platform: rule.platforms } });
  return model.previewRule(rows, rule);
}

router.post("/perf/rules/preview", async (req, res) => {
  const c = model.cleanRule(req.body || {});
  if (!c.ok) return res.status(400).json({ error: c.error, code: c.error });
  try {
    res.json({ ready: true, ...(await previewOf(c.rule)) });
  } catch (err) {
    fail(res, err, "Could not compute the preview.");
  }
});

router.put("/perf/rules/:id", async (req, res) => {
  const c = model.cleanRule(req.body || {});
  if (!c.ok) return res.status(400).json({ error: c.error, code: c.error });
  const id = String(req.params.id || "");
  if (id !== "default" && id !== "new" && !UUID_RE.test(id)) return res.status(400).json(apiError("Invalid id", null, { code: "BAD_ID" }));
  try {
    const before = id !== "default" && id !== "new" ? (await store.listRules()).find((r) => r.id === id) || null : null;
    const saved = await store.saveRule(before ? id : null, { ...c.rule, updated_by: req.user.id, ...(before ? {} : { created_by: req.user.id }) });
    audit(req, "perf_rule_save", saved.id, { before: before ? { metrics: before.metrics, platforms: before.platforms, threshold: before.threshold_pct, minSessions: before.min_sessions, channels: before.channels, mute: before.mute } : null, after: { metrics: saved.metrics, platforms: saved.platforms, threshold: saved.threshold_pct, minSessions: saved.min_sessions, channels: saved.channels, mute: saved.mute } });
    cache.clear();
    res.json({ rule: saved });
  } catch (err) {
    fail(res, err, "Could not save the rule.");
  }
});

router.delete("/perf/rules/:id", async (req, res) => {
  const id = String(req.params.id || "");
  if (!UUID_RE.test(id)) return res.status(400).json(apiError("Invalid id", null, { code: "BAD_ID" }));
  try {
    await store.deleteRule(id);
    audit(req, "perf_rule_delete", id, {});
    res.json({ ok: true });
  } catch (err) {
    fail(res, err, "Could not delete the rule.");
  }
});

/* ---------------- alerts ---------------- */

router.get("/perf/alerts", async (_req, res) => {
  try {
    const rows = await store.listAlerts({ since: new Date(Date.now() - 90 * DAY).toISOString(), limit: 100 });
    res.json({ ready: true, alerts: rows.map(alertView) });
  } catch (err) {
    fail(res, err, "Could not load the alerts.");
  }
});

async function setAlertStatus(req, res, status) {
  const id = String(req.params.id || "");
  if (!UUID_RE.test(id)) return res.status(400).json(apiError("Invalid id", null, { code: "BAD_ID" }));
  try {
    const row = await store.updateAlert(id, { status, hidden_by: status === "hidden" ? req.user.id : null });
    audit(req, status === "hidden" ? "perf_alert_hide" : "perf_alert_unhide", id, { metric: row.metric, platform: row.platform, version: row.app_version });
    cache.clear();
    notifyAdmins(req, { type: "perf_alert", id });
    res.json({ alert: alertView(row) });
  } catch (err) {
    fail(res, err, "Could not update the alert.");
  }
}

function notifyAdmins(req, payload) {
  try {
    req.app.get("io")?.to("admin").emit("admin:update", payload);
  } catch {
    /* tests */
  }
}

router.post("/perf/alerts/:id/hide", (req, res) => setAlertStatus(req, res, "hidden"));
router.post("/perf/alerts/:id/unhide", (req, res) => setAlertStatus(req, res, "open"));

router.post("/perf/alerts/:id/error-log", async (req, res) => {
  const id = String(req.params.id || "");
  if (!UUID_RE.test(id)) return res.status(400).json(apiError("Invalid id", null, { code: "BAD_ID" }));
  try {
    const rows = await store.listAlerts({ limit: 200 });
    const row = rows.find((a) => a.id === id);
    if (!row) return res.status(404).json(apiError("Not found", null, { code: "NOT_FOUND" }));
    let logId = row.error_log_id;
    if (!logId) {
      logId = await require("../lib/perfJobs").openErrorLog(row);
      await store.updateAlert(id, { error_log_id: logId });
      audit(req, "perf_alert_error_log", id, { errorLogId: logId });
    }
    res.json({ errorLogId: logId, existed: Boolean(row.error_log_id) });
  } catch (err) {
    fail(res, err, "Could not open the error record.");
  }
});

/* ---------------- Lighthouse ---------------- */

router.get("/perf/lighthouse", async (_req, res) => {
  try {
    const value = await cached("lh", async () => {
      const rows = await store.lighthouseRuns({ since: new Date(Date.now() - 120 * DAY).toISOString() });
      return { ready: true, ...Q.lighthouse(rows) };
    });
    res.set("Cache-Control", "no-store");
    res.json(value);
  } catch (err) {
    fail(res, err, "Could not load Lighthouse results.");
  }
});

router.__clearCache = () => cache.clear();

module.exports = router;
