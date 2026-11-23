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

export function buildSummary(presets, { sha = "", createdAt = new Date().toISOString() } = {}) {
  return { version: SUMMARY_VERSION, sha, createdAt, runs: RUNS, presets };
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

function fmtMetric(key, v) {
  if (v == null) return "n/a";
  if (key === "lcp") return `${(v / 1000).toFixed(2)} s`;
  if (key === "tbt") return `${Math.round(v)} ms`;
  if (key === "cls") return v.toFixed(3);
  if (key === "bytes") return `${Math.round(v / 1024)} KB`;
  return String(v);
}

function fmtMetricDelta(key, d) {
  if (d == null || Math.abs(d) < (key === "cls" ? 0.0005 : key === "lcp" ? 5 : key === "bytes" ? 512 : 0.5)) return "";
  const sign = d > 0 ? "+" : "-";
  const a = Math.abs(d);
  if (key === "lcp") return ` (${sign}${(a / 1000).toFixed(2)})`;
  if (key === "tbt") return ` (${sign}${Math.round(a)})`;
  if (key === "cls") return ` (${sign}${a.toFixed(3)})`;
  if (key === "bytes") return ` (${sign}${Math.round(a / 1024)} KB)`;
  return "";
}

function fmtScore(v) {
  return v == null ? "n/a" : String(Math.round(v * 100));
}

function fmtScoreDelta(cur, base) {
  if (cur == null || base == null) return "";
  const d = Math.round(cur * 100) - Math.round(base * 100);
  if (!d) return "";
  return ` (${d > 0 ? "+" : ""}${d})`;
}

/** Markdown for the sticky PR comment / job summary. */
export function renderComment(current, baseline, { runUrl = "", level = budgetLevel() } = {}) {
  const usable = baseline && baseline.version === SUMMARY_VERSION && baseline.presets ? baseline : null;
  const lines = [COMMENT_MARKER, "### Lighthouse", ""];
  const shortSha = (s) => String(s || "").slice(0, 7);
  lines.push(
    usable
      ? `Median of ${current.runs || RUNS} runs per page. Deltas are against main \`${shortSha(usable.sha)}\` (${String(usable.createdAt || "").slice(0, 10)}).`
      : `Median of ${current.runs || RUNS} runs per page. No main baseline yet: deltas appear after the first run on main.`,
  );
  lines.push("");
  const labels = Object.fromEntries(PAGES.map((p) => [p.path, p.label]));
  for (const preset of PRESETS) {
    const pages = current.presets?.[preset] || {};
    const base = usable?.presets?.[preset] || {};
    lines.push(`#### ${preset === "mobile" ? "Mobile" : "Desktop"}`, "");
    if (!Object.keys(pages).length) {
      lines.push("No results (the run failed or was cancelled; see the job log).", "");
      continue;
    }
    lines.push(`| Page | ${CATEGORIES.map(([, l]) => l).join(" | ")} | ${METRICS.map(([, , l]) => l).join(" | ")} |`);
    lines.push(`|---|${CATEGORIES.map(() => "---:").join("|")}|${METRICS.map(() => "---:").join("|")}|`);
    const order = [...PAGES.map((p) => p.path), ...Object.keys(pages).filter((p) => !labels[p])];
    for (const path of order) {
      const page = pages[path];
      if (!page) continue;
      const b = base[path];
      const cells = [`${labels[path] || path} \`${path}\``];
      for (const [id] of CATEGORIES) cells.push(`${fmtScore(page.scores[id])}${fmtScoreDelta(page.scores[id], b?.scores?.[id])}`);
      for (const [audit, key] of METRICS) {
        const v = page.metrics[key];
        const max = BUDGETS[preset]?.[audit];
        const over = typeof max === "number" && typeof v === "number" && v > max;
        const delta = typeof v === "number" && typeof b?.metrics?.[key] === "number" ? v - b.metrics[key] : null;
        const text = `${fmtMetric(key, v)}${fmtMetricDelta(key, delta)}`;
        cells.push(over ? `**${text}**` : text);
      }
      lines.push(`| ${cells.join(" | ")} |`);
    }
    lines.push("");
  }
  const over = budgetViolations(current);
  if (over.length) {
    lines.push(
      `**Over budget** (${level === "error" ? "these fail the check" : "warnings only, nothing fails yet"}): ` +
        over.map((o) => `${o.preset} \`${o.path}\` ${o.metric.toUpperCase()} ${fmtMetric(o.metric, o.value)} > ${fmtMetric(o.metric, o.max)}`).join("; "),
      "",
    );
  } else {
    lines.push("All pages are within the LCP / CLS / TBT / bytes budgets.", "");
  }
  const appPages = PAGES.filter((p) => p.kind === "spa").map((p) => `\`${p.path}\``);
  lines.push(
    `Scores are 0-100 (higher is better); LCP, CLS, TBT and bytes: lower is better. Bold = over budget.` +
      (appPages.length ? ` ${appPages.join(", ")} is an app page and noindex on purpose, so its SEO score is not budgeted.` : "") +
      (runUrl ? ` Full HTML reports: [workflow run artifacts](${runUrl}).` : ""),
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
  const summary = buildSummary(presets, { sha: arg("sha", process.env.GITHUB_SHA || "") });
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
