"use strict";

/**
 * Performans background job (leader node only, every 5 minutes):
 *   1. hourly rollup of the current and the previous hour (SQL perf_hour_buckets)
 *   2. daily rollup of the days those hours belong to (merged hourly histograms)
 *   3. every 15 minutes: release regressions per alert rule -> perf_alerts, then the
 *      rule's channels: admin room (system message), owner push, Hata Kayıtları entry,
 *      daily e-mail digest
 *   4. once a day: raw events older than 14 days, hourly rows older than 35 days
 */

const model = require("./perfModel");
const store = require("./perfStore");

const TICK_MS = 5 * 60e3;
const ALERT_EVERY_MS = 15 * 60e3;
const PURGE_EVERY_MS = 24 * 3600e3;
const DIGEST_EVERY_MS = 24 * 3600e3;

let timer = null;
let ioRef = null;
let running = null;
let lastAlertRun = 0;
let lastPurge = 0;
let lastDigest = 0;
let deps = {
  isLeader: () => require("./cluster").isLeader(),
  db: () => require("../db/supabase"),
  push: (ids, alert) => require("./webPush").sendAdminPerfPush?.(ids, alert),
  mail: (m) => require("./mailer").sendEmail(m),
};

const hourStart = (t) => {
  const d = new Date(t);
  d.setUTCMinutes(0, 0, 0);
  return d.getTime();
};
const dayOf = (t) => new Date(t).toISOString().slice(0, 10);

async function rollupHour(startMs) {
  const from = new Date(startMs).toISOString();
  const to = new Date(startMs + 3600e3).toISOString();
  const runAt = new Date().toISOString();
  const { rows } = await store.hourBuckets(from, to);
  const out = model.rollupFromEvents(rows, { bucket: from });
  await store.upsertRollups("hourly", out);
  await store.deleteStale("hourly", from, runAt);
  return out.length;
}

async function rollupDay(day) {
  const from = `${day}T00:00:00.000Z`;
  const to = new Date(Date.parse(from) + 86400e3).toISOString();
  const runAt = new Date().toISOString();
  const hourly = await store.loadRollups({ grain: "hourly", from, to });
  const groups = model.aggregate(hourly, (r) => [r.metric, r.route, r.platform, r.app_version, r.device_class, r.connection, r.country].join("\u0001"));
  const out = [];
  for (const [key, agg] of groups) {
    const [metric, route, platform, app_version, device_class, connection, country] = key.split("\u0001");
    out.push({ day, metric, route, platform, app_version, device_class, connection, country, ...agg });
  }
  await store.upsertRollups("daily", out);
  await store.deleteStale("daily", day, runAt);
  return out.length;
}

/* ---------------- alerts ---------------- */

async function rulesInForce() {
  const rows = await store.listRules().catch((err) => {
    if (err?.code === "PERF_UNAVAILABLE") throw err;
    return [];
  });
  return rows.length ? rows.filter((r) => r.enabled !== false) : [{ ...model.DEFAULT_RULE }];
}

async function ownerIds() {
  try {
    const db = deps.db();
    const [a, b] = await Promise.all([
      db.from("users").select("id").eq("is_super_admin", true).limit(10),
      db.from("users").select("id").eq("username", "admin").limit(1),
    ]);
    return [...new Set([...(a?.data || []), ...(b?.data || [])].map((u) => u.id).filter(Boolean))];
  } catch {
    return [];
  }
}

/** Busiest routes of a release in the last 7 days (banner: "en çok app/kanal ve app/dm"). */
async function topRoutes(r) {
  try {
    const rows = await store.loadRollups({ grain: "daily", from: new Date(Date.now() - 7 * 86400e3).toISOString().slice(0, 10), metrics: [r.metric], query: { platform: [r.platform], version: [r.version] } });
    const by = model.aggregate(rows, (x) => x.route || null);
    return [...by.entries()]
      .map(([route, agg]) => ({ route, n: agg.n, p75: model.summarize(agg, r.metric).p75 || 0 }))
      .sort((a, b) => b.n * b.p75 - a.n * a.p75)
      .slice(0, 2)
      .map((x) => x.route);
  } catch {
    return [];
  }
}

async function shareOf(version, platform) {
  try {
    const rows = await store.loadRollups({ grain: "hourly", from: new Date(Date.now() - 24 * 3600e3).toISOString(), metrics: ["sess"], query: { platform: [platform] } });
    let all = 0;
    let mine = 0;
    for (const r of rows) {
      all += Number(r.n) || 0;
      if (r.app_version === version) mine += Number(r.n) || 0;
    }
    return all ? Math.round((mine / all) * 100) : null;
  } catch {
    return null;
  }
}

function alertPayload(row) {
  return {
    id: row.id,
    key: row.alert_key,
    metric: row.metric,
    platform: row.platform,
    version: row.app_version,
    prevVersion: row.prev_version,
    prevP75: row.prev_p75,
    curP75: row.cur_p75,
    deltaPct: row.delta_pct,
    sessions: row.sessions,
    sharePct: row.share_pct,
    topRoutes: row.top_routes || [],
    firstSeen: row.first_seen,
    status: row.status,
    errorLogId: row.error_log_id || null,
    at: row.created_at,
  };
}

async function openErrorLog(row) {
  const errorGroups = require("./errorGroups");
  const message = `Performance regression: ${model.alertText({ version: row.app_version, platform: row.platform, metric: row.metric, prevP75: row.prev_p75, curP75: row.cur_p75, deltaPct: row.delta_pct, sessions: row.sessions })}`;
  const base = {
    message,
    stack: null,
    url: "/admin/panel?tab=perf",
    user_agent: "descall-perf-job",
    user_id: "system",
    timestamp: new Date().toISOString(),
    resolved: false,
    severity: "warning",
    source: "perf",
  };
  const db = deps.db();
  let res = await db.from("error_logs").insert({ ...base, fingerprint: errorGroups.fingerprint(`perf ${row.platform} ${row.metric} ${row.app_version}`, null), platform: "other", app_version: row.app_version }).select("id");
  if (res?.error) res = await db.from("error_logs").insert(base).select("id");
  if (res?.error) throw new Error(res.error.message || "error_logs insert failed");
  return res.data?.[0]?.id || null;
}

async function notify(row, rule) {
  const channels = new Set(rule.channels || []);
  const notified = { ...(row.notified || {}) };
  const payload = alertPayload(row);
  if (channels.has("adminRoom") && ioRef) {
    try {
      ioRef.to("admin").emit("admin:perf-alert", { ...payload, at: new Date().toISOString() });
      ioRef.to("admin").emit("admin:update", { type: "perf_alert", id: row.id });
      notified.adminRoom = new Date().toISOString();
    } catch {
      /* no sockets */
    }
  }
  if (channels.has("ownerPush")) {
    try {
      const ids = await ownerIds();
      if (ids.length) await deps.push(ids, payload);
      notified.ownerPush = new Date().toISOString();
    } catch (err) {
      console.warn("[perf] push failed:", err?.message || err);
    }
  }
  let errorLogId = row.error_log_id || null;
  if (channels.has("errorLog") && !errorLogId) {
    try {
      errorLogId = await openErrorLog(row);
      notified.errorLog = new Date().toISOString();
    } catch (err) {
      console.warn("[perf] error log failed:", err?.message || err);
    }
  }
  if (channels.has("email")) notified.emailPending = true;
  return store.updateAlert(row.id, { notified, error_log_id: errorLogId });
}

/** One pass over the rules. Returns the alerts raised in this pass. */
async function evaluateAlerts({ now = Date.now() } = {}) {
  const rules = await rulesInForce();
  if (!rules.length) return [];
  const metrics = [...new Set(rules.flatMap((r) => r.metrics || []))];
  const platforms = [...new Set(rules.flatMap((r) => r.platforms || []))];
  const rows = await store.loadRollups({ grain: "daily", from: dayOf(now - 28 * 86400e3), metrics, query: { platform: platforms } });
  const raised = [];
  const recent = await store.listAlerts({ since: new Date(now - 8 * 86400e3).toISOString(), limit: 200 });
  for (const rule of rules) {
    const found = model.findRegressions(rows, rule, { onlyLatest: true });
    const ruleKey = rule.id || "default";
    for (const r of found) {
      const key = `${ruleKey}|${r.key}`;
      const existing = await store.alertByKey(key);
      if (existing) {
        await store.updateAlert(existing.id, { cur_p75: r.curP75, prev_p75: r.prevP75, delta_pct: r.deltaPct, sessions: r.sessions });
        continue;
      }
      // "7 gün": nothing new from this rule for a week after its last alert.
      if (rule.mute === "7d" && recent.some((a) => (a.rule_id || "default") === (rule.id || "default") && now - Date.parse(a.created_at) < 7 * 86400e3)) continue;
      const row = await store.insertAlert({
        alert_key: key,
        rule_id: rule.id && rule.id !== "default" ? rule.id : null,
        metric: r.metric,
        platform: r.platform,
        app_version: r.version,
        prev_version: r.prevVersion,
        prev_p75: r.prevP75,
        cur_p75: r.curP75,
        delta_pct: r.deltaPct,
        sessions: r.sessions,
        share_pct: await shareOf(r.version, r.platform),
        top_routes: await topRoutes(r),
        first_seen: `${r.firstDay}T00:00:00.000Z`,
        status: "open",
        notified: {},
        created_at: new Date(now).toISOString(),
      });
      raised.push(await notify(row, rule));
    }
  }
  return raised;
}

async function emailDigest({ now = Date.now() } = {}) {
  if (now - lastDigest < DIGEST_EVERY_MS) return 0;
  const pending = (await store.listAlerts({ since: new Date(now - 7 * 86400e3).toISOString(), limit: 100 })).filter((a) => a.notified?.emailPending && !a.notified?.email);
  if (!pending.length) return 0;
  lastDigest = now;
  const lines = pending.map((a) => `- ${model.alertText({ version: a.app_version, platform: a.platform, metric: a.metric, prevP75: a.prev_p75, curP75: a.cur_p75, deltaPct: a.delta_pct, sessions: a.sessions })}`);
  await deps.mail({
    to: process.env.REPORT_ALERT_EMAIL || "demirkurtlar@icloud.com",
    subject: `Descall performans özeti: ${pending.length} gerileme`,
    text: `Yönetici Paneli > Performans\n\n${lines.join("\n")}\n`,
  });
  for (const a of pending) await store.updateAlert(a.id, { notified: { ...a.notified, emailPending: false, email: new Date(now).toISOString() } });
  return pending.length;
}

/* ---------------- tick ---------------- */

async function tick({ now = Date.now(), force = false } = {}) {
  if (!force && !deps.isLeader()) return { skipped: true };
  if (running) return running;
  running = (async () => {
    const out = { hours: 0, days: 0, alerts: 0 };
    try {
      await store.flush().catch(() => {});
      const cur = hourStart(now);
      const prev = cur - 3600e3;
      out.hours += await rollupHour(prev);
      out.hours += await rollupHour(cur);
      const days = [...new Set([dayOf(prev), dayOf(cur)])];
      for (const d of days) out.days += await rollupDay(d);
      if (force || now - lastAlertRun >= ALERT_EVERY_MS) {
        lastAlertRun = now;
        out.alerts = (await evaluateAlerts({ now })).length;
        await emailDigest({ now }).catch((err) => console.warn("[perf] digest:", err?.message || err));
      }
      if (now - lastPurge >= PURGE_EVERY_MS) {
        lastPurge = now;
        await store.purge({ now });
      }
    } catch (err) {
      if (err?.code !== "PERF_UNAVAILABLE") console.warn("[perf] job:", err?.message || err);
      out.error = err?.code || "ERROR";
    } finally {
      running = null;
    }
    return out;
  })();
  return running;
}

function start(io) {
  ioRef = io || ioRef;
  if (timer || process.env.NODE_ENV === "test") return;
  timer = setInterval(() => tick().catch(() => {}), TICK_MS);
  timer.unref?.();
  // First pass shortly after boot (late beacons of the previous hour).
  setTimeout(() => tick().catch(() => {}), 45e3).unref?.();
}

function stop() {
  if (timer) clearInterval(timer);
  timer = null;
}

function __setDeps(next) {
  deps = { ...deps, ...next };
  lastAlertRun = 0;
  lastPurge = 0;
  lastDigest = 0;
}

module.exports = { start, stop, tick, rollupHour, rollupDay, evaluateAlerts, emailDigest, openErrorLog, alertPayload, __setDeps, setIo: (io) => (ioRef = io) };
