"use strict";

/**
 * Performans console views built from rollup rows (pure; perfQueries.selftest.cjs).
 * Rows: { day | bucket, metric, route, platform, app_version, device_class, connection,
 * country, n, good, ni, poor, total, hist }.
 */

const model = require("./perfModel");

const DAY = 86400e3;
const KPI_METRICS = Object.freeze(["lcp", "inp", "cls", "fcp", "ttfb", "msglist", "voicejoin", "appstart"]);
const CHART_METRICS = Object.freeze(["lcp", "inp", "cls", "fcp", "ttfb", "appstart"]);
const GROUPS = Object.freeze({ route: "route", platform: "platform", version: "app_version", device: "device_class", connection: "connection", country: "country" });

const keyOf = (r) => String(r.day || r.bucket || "");

/** Time axis of a range: ISO days (daily) or ISO hours (24 h). */
function axis(range, now = Date.now()) {
  if (range === "24h") {
    const end = new Date(now);
    end.setUTCMinutes(0, 0, 0);
    return Array.from({ length: 24 }, (_, i) => new Date(end.getTime() - (23 - i) * 3600e3).toISOString());
  }
  const days = model.RANGES[range] || 28;
  const today = Date.parse(new Date(now).toISOString().slice(0, 10));
  return Array.from({ length: days }, (_, i) => new Date(today - (days - 1 - i) * DAY).toISOString().slice(0, 10));
}

function normKey(k) {
  const s = String(k || "");
  return s.length > 10 ? new Date(Date.parse(s)).toISOString() : s.slice(0, 10);
}

/** Raw events (user filter) -> rollup-like rows per day or hour. */
function rowsFromRaw(events, grain) {
  const byKey = new Map();
  for (const e of events || []) {
    const t = Date.parse(e.at);
    if (!Number.isFinite(t)) continue;
    let k;
    if (grain === "hourly") {
      const d = new Date(t);
      d.setUTCMinutes(0, 0, 0);
      k = d.toISOString();
    } else k = new Date(t).toISOString().slice(0, 10);
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k).push(e);
  }
  const out = [];
  for (const [k, list] of byKey) out.push(...model.rollupFromEvents(list, grain === "hourly" ? { bucket: k } : { day: k }));
  return out;
}

function p75Of(rows, metric) {
  const agg = model.emptyAgg();
  for (const r of rows) if (r.metric === metric) model.addInto(agg, r);
  return model.summarize(agg, metric);
}

function pctChange(cur, prev, metric) {
  if (cur == null || prev == null) return null;
  if (metric === "cls") return Math.round((cur - prev) * 100) / 100;
  if (!prev) return null;
  return Math.round(((cur - prev) / prev) * 100);
}

/** Eight KPI tiles: p75, good / ni / poor split, change against the previous period. */
function kpis(rows, prevRows, spark = []) {
  return KPI_METRICS.map((metric) => {
    const cur = p75Of(rows, metric);
    const prev = p75Of(prevRows || [], metric);
    return { metric, n: cur.n, p75: cur.p75, dist: cur.dist, delta: pctChange(cur.p75, prev.p75, metric), spark: spark.length ? sparkOf(rows, metric, spark) : [] };
  });
}

/** p75 per axis point (null where there is no data). */
function sparkOf(rows, metric, keys, filter = null) {
  const by = new Map(keys.map((k) => [k, model.emptyAgg()]));
  for (const r of rows) {
    if (r.metric !== metric || (filter && !filter(r))) continue;
    const a = by.get(normKey(keyOf(r)));
    if (a) model.addInto(a, r);
  }
  return keys.map((k) => model.summarize(by.get(k), metric).p75);
}

/** p75 trend per platform + release and flag markers on the same axis. */
function chart(rows, metric, keys, { releases = [], flags = [], alerts = [] } = {}) {
  const series = {};
  for (const p of model.PLATFORMS) {
    const vals = sparkOf(rows, metric, keys, (r) => r.platform === p);
    if (vals.some((v) => v != null)) series[p] = vals;
  }
  const markers = [];
  for (const rel of releases) {
    const i = keys.findIndex((k) => k >= rel.key);
    if (i < 0) continue;
    const bad = alerts.some((a) => a.app_version === rel.version && a.status === "open");
    markers.push({ i, kind: "release", label: rel.version, bad });
  }
  for (const f of flags) {
    const i = keys.findIndex((k) => k >= normKey(f.at).slice(0, keys[0]?.length || 10));
    if (i < 0) continue;
    markers.push({ i, kind: "flag", flag: f.key, percent: f.percent, mode: f.mode, at: f.at });
  }
  markers.sort((a, b) => a.i - b.i);
  return { metric, keys, series, markers };
}

/** First axis point where a release reaches 1 % of that day's sampled page loads. */
function releaseStarts(sessRows, keys) {
  const perKey = new Map();
  for (const r of sessRows) {
    if (r.metric !== "sess" || !r.app_version) continue;
    const k = normKey(keyOf(r));
    if (!perKey.has(k)) perKey.set(k, new Map());
    const m = perKey.get(k);
    m.set(r.app_version, (m.get(r.app_version) || 0) + (Number(r.n) || 0));
  }
  const first = new Map();
  for (const k of keys) {
    const m = perKey.get(k);
    if (!m) continue;
    const total = [...m.values()].reduce((s, x) => s + x, 0);
    for (const [v, n] of m) if (!first.has(v) && total && n / total >= 0.01) first.set(v, k);
  }
  // The oldest version in the range is the baseline, not a release inside the range.
  const sorted = [...first.entries()].sort((a, b) => model.compareVersions(a[0], b[0]));
  return sorted.slice(1).map(([version, key]) => ({ version, key }));
}

/** Release comparison card: newest four versions, p75 LCP / INP / app start, share. */
function releaseTable(rows, shareRows, alerts = []) {
  const versions = [...new Set(rows.filter((r) => r.app_version).map((r) => r.app_version))].sort(model.compareVersions).reverse();
  const shareTotal = shareRows.filter((r) => r.metric === "sess").reduce((s, r) => s + (Number(r.n) || 0), 0);
  const out = versions.slice(0, 5).map((version) => {
    const mine = rows.filter((r) => r.app_version === version);
    const share = shareRows.filter((r) => r.metric === "sess" && r.app_version === version).reduce((s, r) => s + (Number(r.n) || 0), 0);
    return {
      version,
      sharePct: shareTotal ? Math.round((share / shareTotal) * 100) : null,
      lcp: p75Of(mine, "lcp").p75,
      inp: p75Of(mine, "inp").p75,
      appstart: p75Of(mine, "appstart").p75,
      sessions: p75Of(mine, "sess").n,
    };
  });
  for (let i = 0; i < out.length; i++) {
    const prev = out[i + 1];
    for (const m of ["lcp", "inp", "appstart"]) {
      out[i][`${m}Delta`] = prev ? pctChange(out[i][m], prev[m], m) : null;
      out[i][`${m}Hot`] = alerts.some((a) => a.status === "open" && a.app_version === out[i].version && a.metric === m);
    }
  }
  return out.slice(0, 4);
}

/** Sampled page loads per platform (mix bar), share in %. */
function platformMix(rows) {
  const by = {};
  let total = 0;
  for (const r of rows) {
    if (r.metric !== "sess") continue;
    by[r.platform] = (by[r.platform] || 0) + (Number(r.n) || 0);
    total += Number(r.n) || 0;
  }
  const mix = {};
  for (const p of model.PLATFORMS) mix[p] = total ? Math.round(((by[p] || 0) / total) * 100) : 0;
  return { mix, total };
}

/** Distinct values per dimension (pills "Sayfa 14 · Platform 5 …") + suggestions. */
function facets(rows) {
  const out = {};
  for (const [k, col] of Object.entries(GROUPS)) {
    const vals = new Map();
    for (const r of rows) {
      const v = String(r[col] || "");
      if (!v) continue;
      vals.set(v, (vals.get(v) || 0) + (Number(r.n) || 0));
    }
    out[k] = [...vals.entries()].sort((a, b) => b[1] - a[1]).map(([v]) => v).slice(0, 60);
  }
  return out;
}

const SEV_ORDER = { "": 0, amber: 1, red: 2 };

/** "En yavaş sayfalar" (or any dimension): one row per value, sorted by the sort metric. */
function table(rows, { group = "route", sort = "inp", keys = [], alerts = [], limit = 60 } = {}) {
  const col = (typeof group === "string" && Object.hasOwn(GROUPS, group) && GROUPS[group]) || "route";
  const by = new Map();
  for (const r of rows) {
    const v = String(r[col] || "");
    if (!v) continue;
    if (!by.has(v)) by.set(v, []);
    by.get(v).push(r);
  }
  const hotRoutes = new Set(alerts.filter((a) => a.status === "open").flatMap((a) => a.top_routes || []));
  const out = [];
  for (const [value, list] of by) {
    const sess = p75Of(list, "sess").n;
    const lcp = p75Of(list, "lcp");
    const inp = p75Of(list, "inp");
    const cls = p75Of(list, "cls");
    const sortSum = p75Of(list, sort);
    const mix = platformMix(list).mix;
    const ratings = [lcp.p75 != null ? model.rate("lcp", lcp.p75) : 0, inp.p75 != null ? model.rate("inp", inp.p75) : 0, cls.p75 != null ? model.rate("cls", cls.p75 * 1000) : 0];
    let sev = Math.max(...ratings) >= 2 ? "red" : Math.max(...ratings) === 1 ? "amber" : "";
    if (group === "route" && hotRoutes.has(value) && SEV_ORDER[sev] < 2) sev = "red";
    const counted = sess || Math.max(lcp.n, inp.n);
    if (!counted && sortSum.n === 0) continue;
    out.push({
      key: value,
      sessions: counted,
      lcp: lcp.p75,
      inp: inp.p75,
      cls: cls.p75,
      sort: sortSum.p75,
      dist: sortSum.dist,
      mix,
      spark: keys.length ? sparkOf(list, sort, keys.slice(-20)) : [],
      sev,
    });
  }
  out.sort((a, b) => (b.sort ?? -1) - (a.sort ?? -1) || b.sessions - a.sessions);
  return out.slice(0, limit);
}

/** INP p75, platform x device class (side panel heat map). */
function heat(rows, metric = "inp") {
  const cells = [];
  for (const p of model.PLATFORMS) {
    const row = { platform: p, cells: [] };
    for (const d of model.DEVICE_CLASSES) {
      const s = p75Of(rows.filter((r) => r.platform === p && r.device_class === d), metric);
      row.cells.push({ device: d, p75: s.n >= 1 ? s.p75 : null, n: s.n });
    }
    if (row.cells.some((c) => c.p75 != null)) cells.push(row);
  }
  const top = (r) => Math.max(...r.cells.map((c) => c.p75 || 0));
  cells.sort((a, b) => top(b) - top(a));
  let worst = null;
  for (const r of cells) for (const c of r.cells) if (c.p75 != null && (!worst || c.p75 > worst.p75)) worst = { ...c, platform: r.platform };
  if (worst && model.rate(metric, worst.p75) >= 1) {
    for (const r of cells) for (const c of r.cells) c.hot = r.platform === worst.platform && c.device === worst.device;
  }
  return cells;
}

/** Top INP targets / LCP elements from raw events. */
function attribution(events) {
  const inp = (events || []).filter((e) => e.metric === "inp" && e.attribution?.target);
  const total = inp.length || 1;
  const byTarget = new Map();
  for (const e of inp) {
    const k = `${e.attribution.target}|${e.attribution.type || ""}`;
    if (!byTarget.has(k)) byTarget.set(k, { target: e.attribution.target, type: e.attribution.type || "", values: [] });
    byTarget.get(k).values.push(Number(e.value) || 0);
  }
  const p75 = (vals) => {
    const s = [...vals].sort((a, b) => a - b);
    return s.length ? s[Math.max(0, Math.ceil(s.length * 0.75) - 1)] : null;
  };
  const targets = [...byTarget.values()]
    .map((x) => ({ target: x.target, type: x.type, sharePct: Math.round((x.values.length / total) * 100), p75: p75(x.values), n: x.values.length }))
    .sort((a, b) => b.n * (b.p75 || 0) - a.n * (a.p75 || 0))
    .slice(0, 3);
  const lcpEv = (events || []).filter((e) => e.metric === "lcp" && e.attribution?.element);
  const byEl = new Map();
  for (const e of lcpEv) {
    if (!byEl.has(e.attribution.element)) byEl.set(e.attribution.element, []);
    byEl.get(e.attribution.element).push(Number(e.value) || 0);
  }
  const topEl = [...byEl.entries()].sort((a, b) => b[1].length - a[1].length)[0];
  const lcp = topEl ? { element: topEl[0], sharePct: Math.round((topEl[1].length / (lcpEv.length || 1)) * 100), p75: p75(topEl[1]) } : null;
  return { inp: targets, lcp };
}

/** Slowest users by worst INP (user id only) + their session count. */
function slowUsers(events, sessCounts = new Map(), limit = 5) {
  const by = new Map();
  for (const e of events || []) {
    if (e.metric !== "inp" || !e.user_id) continue;
    const cur = by.get(e.user_id);
    if (!cur || Number(e.value) > Number(cur.value)) by.set(e.user_id, e);
  }
  const all = [...by.values()].sort((a, b) => Number(b.value) - Number(a.value));
  return {
    total: all.filter((e) => model.rate("inp", Number(e.value)) >= 1).length,
    users: all.slice(0, limit).map((e) => ({
      userId: e.user_id,
      value: Number(e.value),
      platform: e.platform,
      device: e.device_class,
      connection: e.connection,
      country: e.country,
      browser: e.browser || "",
      sessionId: e.session_id,
      sessions: sessCounts.get(e.user_id) || null,
    })),
  };
}

/** One page load as a waterfall: [{metric, start, end, value, label}] in ms from the start. */
function timeline(events) {
  const list = (events || []).filter((e) => e.metric !== "sess");
  const sess = (events || []).find((e) => e.metric === "sess");
  const t0 = sess ? Date.parse(sess.at) : Math.min(...list.map((e) => Date.parse(e.at)));
  const order = ["ttfb", "fcp", "lcp", "appstart", "msglist", "voicejoin", "inp", "cls"];
  const rows = [];
  for (const e of list) {
    const v = Number(e.value) || 0;
    if (e.metric === "cls") continue;
    let start = 0;
    let end = v;
    if (["inp", "msglist", "voicejoin"].includes(e.metric)) {
      const at = Number(e.attribution?.at);
      start = Number.isFinite(at) ? at : Math.max(0, Date.parse(e.at) - t0 - v);
      end = start + v;
    }
    rows.push({ metric: e.metric, start: Math.round(start), end: Math.round(end), value: v, rating: e.rating, target: e.attribution?.target || e.attribution?.element || null });
  }
  rows.sort((a, b) => order.indexOf(a.metric) - order.indexOf(b.metric) || a.start - b.start);
  const span = Math.max(1000, ...rows.map((r) => r.end));
  const first = (events || [])[0] || {};
  return { span, rows, platform: first.platform || "", version: first.app_version || "", device: first.device_class || "", connection: first.connection || "", country: first.country || "", at: sess?.at || first.at || null };
}

/* ---------------- Lighthouse ---------------- */

const CATS = ["perf", "a11y", "best_practices", "seo"];
const avg = (xs) => {
  const v = xs.filter((x) => Number.isFinite(x));
  return v.length ? Math.round(v.reduce((s, x) => s + x, 0) / v.length) : null;
};

function groupRuns(rows) {
  const by = new Map();
  for (const r of rows || []) {
    const k = `${r.run_id || r.created_at}|${r.sha}`;
    if (!by.has(k)) by.set(k, { id: k, runId: r.run_id, runUrl: r.run_url, repo: r.repo, event: r.event, pr: r.pr_number, mergedPr: r.merged_pr, title: r.pr_title, author: r.pr_author, branch: r.branch, sha: r.sha, baseSha: r.base_sha, at: r.created_at, pages: [], bundle: r.bundle_gzip, budgetsFailed: 0 });
    const run = by.get(k);
    run.pages.push(r);
    run.budgetsFailed += Number(r.budgets_failed) || 0;
    if (Date.parse(r.created_at) < Date.parse(run.at)) run.at = r.created_at;
  }
  return [...by.values()].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}

function runScores(run, ff = "mobile") {
  const pages = run.pages.filter((p) => p.form_factor === ff);
  const use = pages.length ? pages : run.pages;
  const out = {};
  for (const c of CATS) out[c] = avg(use.map((p) => Number(p[c])));
  out.tbt = avg(use.map((p) => Number(p.tbt_ms)));
  out.perPage = Object.fromEntries(use.map((p) => [p.page, { perf: p.perf, a11y: p.a11y, best_practices: p.best_practices, seo: p.seo, lcp: p.lcp_ms, cls: p.cls, tbt: p.tbt_ms, bytes: p.bytes }]));
  return out;
}

/** The Lighthouse CI tab: main averages, history, per page, pull requests, this week. */
function lighthouse(rows, { now = Date.now(), budget = 90 } = {}) {
  const runs = groupRuns(rows);
  const mainRuns = runs.filter((r) => r.event === "push" || (!r.pr && r.branch === "main"));
  const latestMain = mainRuns[0] || null;
  const mainScores = latestMain ? runScores(latestMain) : null;
  const weekAgo = mainRuns.find((r) => now - Date.parse(r.at) >= 7 * DAY) || mainRuns[mainRuns.length - 1] || null;
  const weekScores = weekAgo && weekAgo !== latestMain ? runScores(weekAgo) : null;
  const history = mainRuns.slice(0, 30).reverse().map((r) => ({ sha: r.sha, at: r.at, mergedPr: r.mergedPr, ...runScores(r), perPage: undefined }));
  const merged = new Set(mainRuns.map((r) => r.mergedPr).filter(Boolean));
  const latestPr = new Map();
  for (const r of runs) if (r.pr && !latestPr.has(r.pr)) latestPr.set(r.pr, r);
  const prs = [...latestPr.values()].map((r) => {
    const s = runScores(r);
    const over = Object.entries(s.perPage).filter(([, p]) => Number(p.perf) < budget).map(([page, p]) => ({ page, perf: p.perf }));
    const delta = {};
    for (const c of CATS) delta[c] = mainScores && s[c] != null && mainScores[c] != null ? s[c] - mainScores[c] : null;
    const dropped = CATS.some((c) => delta[c] != null && delta[c] <= -3);
    const isMerged = merged.has(r.pr);
    const status = over.length || r.budgetsFailed ? "over" : dropped ? "warn" : "pass";
    return {
      pr: r.pr,
      title: r.title,
      author: r.author,
      branch: r.branch,
      sha: r.sha,
      at: r.at,
      runUrl: r.runUrl,
      repo: r.repo,
      merged: isMerged,
      open: !isMerged && now - Date.parse(r.at) < 30 * DAY,
      scores: { perf: s.perf, a11y: s.a11y, best_practices: s.best_practices, seo: s.seo },
      delta,
      perPage: s.perPage,
      over,
      bundleDelta: latestMain?.bundle != null && r.bundle != null ? r.bundle - latestMain.bundle : null,
      tbtDelta: s.tbt != null && mainScores?.tbt != null ? s.tbt - mainScores.tbt : null,
      status,
    };
  });
  prs.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  const week = runs.filter((r) => now - Date.parse(r.at) < 7 * DAY);
  const weekStats = { runs: week.length, passed: 0, warned: 0, over: 0 };
  for (const r of week) {
    const s = runScores(r);
    const over = Object.values(s.perPage).some((p) => Number(p.perf) < budget) || r.budgetsFailed > 0;
    const dropped = mainScores && CATS.some((c) => s[c] != null && mainScores[c] != null && s[c] - mainScores[c] <= -3);
    if (over) weekStats.over += 1;
    else if (dropped) weekStats.warned += 1;
    else weekStats.passed += 1;
  }
  const spark = {};
  for (const c of CATS) spark[c] = history.slice(-14).map((h) => h[c]);
  const weekDelta = {};
  for (const c of CATS) weekDelta[c] = mainScores && weekScores && mainScores[c] != null && weekScores[c] != null ? mainScores[c] - weekScores[c] : null;
  const alert = prs.find((p) => p.open && p.status === "over") || null;
  return {
    main: latestMain ? { sha: latestMain.sha, at: latestMain.at, runUrl: latestMain.runUrl, scores: { perf: mainScores.perf, a11y: mainScores.a11y, best_practices: mainScores.best_practices, seo: mainScores.seo }, perPage: mainScores.perPage, pages: Object.keys(mainScores.perPage).length } : null,
    weekDelta,
    spark,
    history,
    prs,
    week: weekStats,
    alert,
    repo: runs.find((r) => r.repo)?.repo || "",
    budget,
  };
}

module.exports = {
  KPI_METRICS,
  CHART_METRICS,
  GROUPS,
  axis,
  rowsFromRaw,
  p75Of,
  kpis,
  sparkOf,
  chart,
  releaseStarts,
  releaseTable,
  platformMix,
  facets,
  table,
  heat,
  attribution,
  slowUsers,
  timeline,
  lighthouse,
};
