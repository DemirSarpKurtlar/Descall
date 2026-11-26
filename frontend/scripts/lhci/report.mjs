#!/usr/bin/env node
// Turns Lighthouse CI filesystem uploads into one summary + one PR comment.
//
//   node scripts/lhci/report.mjs --mobile <dir> --desktop <dir> [--baseline summary.json]
//        --out <dir> [--sha <sha>] [--run-url <url>]
//
// <dir> is an LHCI `upload.target=filesystem` outputDir (manifest.json + report files).
// Writes <out>/summary.json (the next baseline when run on main) and <out>/comment.md (the
// sticky PR comment, starts with COMMENT_MARKER so the workflow can update it in place).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { gzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { BUDGETS, PAGES, PRESETS, RUNS, budgetLevel } from "./config.mjs";

export const COMMENT_MARKER = "<!-- descall-lighthouse-ci -->";
export const SUMMARY_VERSION = 1;

const CATEGORIES = [
  ["performance", "Perf"],
  ["accessibility", "A11y"],
  ["best-practices", "BP"],
  ["seo", "SEO"],
];
const METRICS = [
  ["largest-contentful-paint", "lcp", "LCP"],
  ["cumulative-layout-shift", "cls", "CLS"],
  ["total-blocking-time", "tbt", "TBT"],
  ["total-byte-weight", "bytes", "Bytes"],
];

function pathOf(url) {
  try {
    const u = new URL(url);
    return u.pathname || "/";
  } catch {
    return String(url || "/");
  }
}

/**
 * Representative (median) run per page from an LHCI manifest.
 * readLhr(jsonPath) returns the parsed Lighthouse result.
 */
export function summarizePreset(manifest, readLhr) {
  const out = {};
  for (const entry of Array.isArray(manifest) ? manifest : []) {
    if (!entry || !entry.isRepresentativeRun) continue;
    const path = pathOf(entry.url);
    let lhr = null;
    try {
      lhr = entry.jsonPath ? readLhr(entry.jsonPath) : null;
    } catch {
      lhr = null;
    }
    const scores = {};
    for (const [id] of CATEGORIES) {
      const fromLhr = lhr?.categories?.[id]?.score;
      const fromSummary = entry.summary?.[id];
      const v = typeof fromLhr === "number" ? fromLhr : typeof fromSummary === "number" ? fromSummary : null;
      scores[id] = v;
    }
    const metrics = {};
    for (const [audit, key] of METRICS) {
      const v = lhr?.audits?.[audit]?.numericValue;
      metrics[key] = typeof v === "number" && Number.isFinite(v) ? v : null;
    }
    out[path] = { scores, metrics };
  }
  return out;
}

export function buildSummary(presets, { sha = "", createdAt = new Date().toISOString(), bundle = null } = {}) {
  return { version: SUMMARY_VERSION, sha, createdAt, runs: RUNS, presets, ...(bundle ? { bundle } : {}) };
}

/** gzip size of the entry script(s) index.html loads (the "Ana paket" line). */
export function entryBundleSize(distDir) {
  const htmlPath = join(distDir, "index.html");
  if (!existsSync(htmlPath)) return null;
  const html = readFileSync(htmlPath, "utf8");
  const srcs = [...html.matchAll(/<script[^>]+type="module"[^>]+src="([^"]+)"/g)].map((m) => m[1]).filter((s) => !/^https?:/.test(s));
  let raw = 0;
  let gzip = 0;
  for (const src of srcs) {
    const file = join(distDir, src.replace(/^\//, ""));
    if (!existsSync(file)) continue;
    const buf = readFileSync(file);
    raw += buf.length;
    gzip += gzipSync(buf, { level: 9 }).length;
  }
  return srcs.length && raw ? { raw, gzip, files: srcs.length } : null;
}

/** Pages / metrics over their budget: [{ preset, path, metric, value, max }]. */
export function budgetViolations(summary) {
  const out = [];
  for (const preset of PRESETS) {
    const pages = summary?.presets?.[preset] || {};
    for (const [path, page] of Object.entries(pages)) {
      for (const [audit, key] of METRICS) {
        const max = BUDGETS[preset]?.[audit];
        const value = page?.metrics?.[key];
        if (typeof max === "number" && typeof value === "number" && value > max) out.push({ preset, path, metric: key, value, max });
      }
    }
  }
  return out;
}

const METRIC_TR = { lcp: "LCP", cls: "CLS", tbt: "TBT", bytes: "Boyut" };
/** Admin panel link that opens Performans on the Lighthouse CI tab (perfAdminModel.parseViewLink). */
export const ADMIN_LH_URL = `https://descall.com/admin/panel?tab=perf#perf=${Buffer.from(JSON.stringify({ range: "28d", tab: "lh" })).toString("base64url")}`;

/** Performance score budget (0-100) the PR comment checks every page against (draft: "bütçe 90"). */
export const PERF_SCORE_BUDGET = 90;

const CAT_TR = [
  ["performance", "Performans"],
  ["accessibility", "Erişilebilirlik"],
  ["best-practices", "En iyi uygulamalar"],
  ["seo", "SEO"],
];

function trNum(n, digits = 0) {
  return Number(n).toLocaleString("tr-TR", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function fmtMetricTr(key, v) {
  if (v == null) return "yok";
  if (key === "lcp") return `${trNum(v / 1000, 2)} sn`;
  if (key === "tbt") return `${trNum(Math.round(v))} ms`;
  if (key === "cls") return trNum(v, 3);
  if (key === "bytes") return `${trNum(Math.round(v / 1024))} KB`;
  return String(v);
}

function fmtMetricDeltaTr(key, d) {
  if (d == null || Math.abs(d) < (key === "cls" ? 0.0005 : key === "lcp" ? 5 : key === "bytes" ? 512 : 0.5)) return "";
  const sign = d > 0 ? "+" : "-";
  const a = Math.abs(d);
  if (key === "lcp") return ` (${sign}${trNum(a / 1000, 2)})`;
  if (key === "tbt") return ` (${sign}${trNum(Math.round(a))})`;
  if (key === "cls") return ` (${sign}${trNum(a, 3)})`;
  if (key === "bytes") return ` (${sign}${trNum(Math.round(a / 1024))} KB)`;
  return "";
}

/** "93 ▼ -3" against main (Draft A comment). */
function scoreCell(cur, base, { bold = false } = {}) {
  if (cur == null) return "yok";
  const v = Math.round(cur * 100);
  const txt = bold ? `**${v}**` : String(v);
  if (base == null) return txt;
  const d = v - Math.round(base * 100);
  if (!d) return txt;
  return `${txt} ${d < 0 ? "▼" : "▲"} ${d > 0 ? "+" : ""}${d}`;
}

/** Pages whose performance score is under PERF_SCORE_BUDGET: [{ preset, path, score }]. */
export function scoreViolations(summary, preset = "mobile") {
  const out = [];
  for (const [path, page] of Object.entries(summary?.presets?.[preset] || {})) {
    const s = page?.scores?.performance;
    if (typeof s === "number" && Math.round(s * 100) < PERF_SCORE_BUDGET) out.push({ preset, path, score: Math.round(s * 100) });
  }
  return out;
}

function avgOf(pages, key) {
  const v = Object.values(pages || {}).map((p) => p?.metrics?.[key]).filter((x) => typeof x === "number");
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

function scoreTable(pages, base, order, labels) {
  const lines = [`| Sayfa | ${CAT_TR.map(([, l]) => l).join(" | ")} |`, `|---|${CAT_TR.map(() => ":-:").join("|")}|`];
  for (const path of order) {
    const page = pages[path];
    if (!page) continue;
    const b = base?.[path];
    const cells = [`\`${path}\``];
    for (const [id] of CAT_TR) {
      const low = id === "performance" && typeof page.scores[id] === "number" && Math.round(page.scores[id] * 100) < PERF_SCORE_BUDGET;
      cells.push(scoreCell(page.scores[id], b?.scores?.[id], { bold: low }));
    }
    lines.push(`| ${cells.join(" | ")} |`);
  }
  return lines;
}

function metricTable(pages, base, preset, order) {
  const lines = [`| Sayfa | ${METRICS.map(([, key]) => METRIC_TR[key]).join(" | ")} |`, `|---|${METRICS.map(() => "---:").join("|")}|`];
  for (const path of order) {
    const page = pages[path];
    if (!page) continue;
    const b = base?.[path];
    const cells = [`\`${path}\``];
    for (const [audit, key] of METRICS) {
      const v = page.metrics[key];
      const max = BUDGETS[preset]?.[audit];
      const over = typeof max === "number" && typeof v === "number" && v > max;
      const delta = typeof v === "number" && typeof b?.metrics?.[key] === "number" ? v - b.metrics[key] : null;
      const text = `${fmtMetricTr(key, v)}${fmtMetricDeltaTr(key, delta)}`;
      cells.push(over ? `**${text}**` : text);
    }
    lines.push(`| ${cells.join(" | ")} |`);
  }
  return lines;
}

/**
 * Markdown for the sticky PR comment / job summary (Draft A, in Turkish by owner decision):
 * one score table (mobile, deltas against main), the budget line, bundle and TBT change,
 * lab metrics and desktop scores folded, links to the reports and the admin panel.
 */
export function renderComment(current, baseline, { runUrl = "", level = budgetLevel(), adminUrl = ADMIN_LH_URL } = {}) {
  const usable = baseline && baseline.version === SUMMARY_VERSION && baseline.presets ? baseline : null;
  const shortSha = (s) => String(s || "").slice(0, 7);
  const lines = [COMMENT_MARKER, "## Lighthouse CI", ""];
  const mobile = current.presets?.mobile || {};
  const nPages = Object.keys(mobile).length || Object.keys(current.presets?.desktop || {}).length;
  const runs = current.runs || RUNS;
  lines.push(
    usable
      ? `\`${shortSha(current.sha)}\` commit'i \`main\` (\`${shortSha(usable.sha)}\`, ${String(usable.createdAt || "").slice(0, 10)}) ile karşılaştırıldı · ${nPages} sayfa · ${runs} çalıştırmanın ortancası`
      : `\`${shortSha(current.sha)}\` · ${nPages} sayfa · ${runs} çalıştırmanın ortancası · henüz \`main\` ölçümü yok, farklar ilk main çalıştırmasından sonra görünür`,
  );
  lines.push("");
  const labels = Object.fromEntries(PAGES.map((p) => [p.path, p.label]));
  const orderOf = (pages) => [...PAGES.map((p) => p.path), ...Object.keys(pages).filter((p) => !labels[p])];
  if (!Object.keys(mobile).length) {
    lines.push("Mobil sonuç yok (çalıştırma başarısız oldu ya da iptal edildi; iş günlüğüne bak).", "");
  } else {
    lines.push(...scoreTable(mobile, usable?.presets?.mobile, orderOf(mobile), labels), "");
  }
  const scoreOver = scoreViolations(current, "mobile");
  const metricOver = budgetViolations(current);
  const fails = [
    ...scoreOver.map((o) => `\`${o.path}\` performans ${o.score} < ${PERF_SCORE_BUDGET}`),
    ...metricOver.map((o) => `${o.preset === "mobile" ? "mobil" : "masaüstü"} \`${o.path}\` ${o.metric.toUpperCase()} ${fmtMetricTr(o.metric, o.value)} > ${fmtMetricTr(o.metric, o.max)}`),
  ];
  const extra = [];
  const bundle = current.bundle?.gzip;
  const baseBundle = usable?.bundle?.gzip;
  if (typeof bundle === "number") {
    const d = typeof baseBundle === "number" ? bundle - baseBundle : null;
    extra.push(d == null ? `Ana paket **${trNum(bundle / 1000, 1)} KB** gzip` : `Ana paket **${d >= 0 ? "+" : "-"}${trNum(Math.abs(d) / 1000, 1)} KB** gzip`);
  }
  const tbt = avgOf(mobile, "tbt");
  const baseTbt = avgOf(usable?.presets?.mobile, "tbt");
  if (tbt != null && baseTbt != null && Math.abs(tbt - baseTbt) >= 1) extra.push(`Toplam Engelleme Süresi ortalama **${tbt > baseTbt ? "+" : "-"}${trNum(Math.round(Math.abs(tbt - baseTbt)))} ms**`);
  if (fails.length) {
    lines.push(`**${fails.length} bütçe aşıldı** (${level === "error" ? "bunlar kontrolü düşürür" : "şimdilik yalnızca uyarı, kontrolü düşürmez"}): ${fails.join(", ")}${extra.length ? "  " : ""}`);
  } else {
    lines.push(`Tüm sayfalar bütçe içinde (performans ${PERF_SCORE_BUDGET} ve üstü; LCP, CLS, TBT, boyut sınırları).${extra.length ? "  " : ""}`);
  }
  if (extra.length) lines.push(extra.join(" · "));
  lines.push("");
  lines.push("<details><summary>Sayfa başına laboratuvar ölçümleri (LCP, TBT, CLS)</summary>", "");
  for (const preset of PRESETS) {
    const pages = current.presets?.[preset] || {};
    if (!Object.keys(pages).length) continue;
    lines.push(`**${preset === "mobile" ? "Mobil" : "Masaüstü"}**`, "", ...metricTable(pages, usable?.presets?.[preset], preset, orderOf(pages)), "");
  }
  lines.push("</details>", "");
  const desktop = current.presets?.desktop || {};
  if (Object.keys(desktop).length) {
    lines.push("<details><summary>Masaüstü puanları</summary>", "", ...scoreTable(desktop, usable?.presets?.desktop, orderOf(desktop), labels), "", "</details>", "");
  }
  const appPages = PAGES.filter((p) => p.kind === "spa").map((p) => `\`${p.path}\``);
  const links = ["Her push'ta güncellenir"];
  if (runUrl) links.push(`[Tam raporlar](${runUrl})`);
  if (adminUrl) links.push(`[Descall yönetici › Performans'ta aç](${adminUrl})`);
  lines.push(
    `<sub>${links.join(" · ")}. Puanlar 0-100 (yüksek iyi); LCP, CLS, TBT ve boyut düşük iyi; kalın = bütçe dışı.${appPages.length ? ` ${appPages.join(", ")} uygulama sayfası, bilerek noindex; SEO puanı bütçeye girmez.` : ""}</sub>`,
  );
  return `${lines.join("\n")}\n`;
}

function loadPreset(dir) {
  const manifestPath = join(dir, "manifest.json");
  if (!existsSync(manifestPath)) return {};
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  return summarizePreset(manifest, (p) => JSON.parse(readFileSync(isAbsolute(p) ? p : join(dir, p), "utf8")));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = (name, fallback = "") => {
    const i = process.argv.indexOf(`--${name}`);
    return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
  };
  const outDir = arg("out", "lhci-out");
  mkdirSync(outDir, { recursive: true });
  const presets = {};
  for (const preset of PRESETS) {
    const dir = arg(preset);
    presets[preset] = dir ? loadPreset(dir) : {};
  }
  const dist = arg("dist");
  const summary = buildSummary(presets, { sha: arg("sha", process.env.GITHUB_SHA || ""), bundle: dist ? entryBundleSize(dist) : null });
  let baseline = null;
  const basePath = arg("baseline");
  if (basePath && existsSync(basePath)) {
    try {
      baseline = JSON.parse(readFileSync(basePath, "utf8"));
    } catch {
      baseline = null;
    }
  }
  writeFileSync(join(outDir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
  writeFileSync(join(outDir, "comment.md"), renderComment(summary, baseline, { runUrl: arg("run-url") }));
  const pages = PRESETS.reduce((n, p) => n + Object.keys(presets[p]).length, 0);
  console.log(`[lhci-report] ${pages} page results, baseline: ${baseline ? baseline.sha || "yes" : "none"}`);
  if (!pages) {
    console.error("[lhci-report] no Lighthouse results found");
    process.exit(1);
  }
}
