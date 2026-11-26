#!/usr/bin/env node
// Writes one Lighthouse CI run into public.lighthouse_runs (Yönetici Paneli › Performans ›
// Lighthouse CI), the same way scripts/turnstile-provision.mjs writes turnstile_config:
// PostgREST with the service role key from SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.
//
//   node scripts/lhci/store.mjs --summary <summary.json>
//
// One row per page and form factor: PR number, sha, page, form factor, the 4 scores,
// LCP / CLS / TBT, bytes, entry bundle gzip size. Context comes from the environment
// (GITHUB_*, PR_NUMBER, PR_TITLE, PR_AUTHOR, HEAD_SHA, BASE_SHA, BRANCH, HEAD_COMMIT_MESSAGE,
// RUN_URL). Never prints a secret; without the secrets (fork pull requests) it skips quietly
// and exits 0; a missing table or a refused write is a warning, never a failed CI run.
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PERF_SCORE_BUDGET, budgetViolations } from "./report.mjs";

const CATS = [
  ["performance", "perf"],
  ["accessibility", "a11y"],
  ["best-practices", "best_practices"],
  ["seo", "seo"],
];

const clip = (v, n) => String(v ?? "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, n);
const score = (v) => (typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.min(100, Math.round(v * 100))) : null);
const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** "Voice grid (#456)" / "Merge pull request #456 from ..." -> 456 */
export function mergedPrOf(message) {
  const first = String(message || "").split("\n")[0];
  const m = /\(#(\d{1,7})\)\s*$/.exec(first) || /^Merge pull request #(\d{1,7})\b/.exec(first);
  return m ? Number(m[1]) : null;
}

/** Rows for public.lighthouse_runs from a report.mjs summary + the workflow context. */
export function rowsFromSummary(summary, env = process.env) {
  const event = ["pull_request", "push", "workflow_dispatch"].includes(env.GITHUB_EVENT_NAME) ? env.GITHUB_EVENT_NAME : "";
  const sha = [env.HEAD_SHA, summary?.sha, env.GITHUB_SHA].map((x) => clip(x, 40).toLowerCase()).find((x) => /^[0-9a-f]{7,40}$/.test(x));
  if (!sha) return [];
  const pr = /^\d{1,7}$/.test(String(env.PR_NUMBER || "")) ? Number(env.PR_NUMBER) : null;
  const repo = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(String(env.GITHUB_REPOSITORY || "")) ? env.GITHUB_REPOSITORY : "";
  const over = budgetViolations(summary);
  const base = {
    run_id: clip(env.GITHUB_RUN_ID, 40),
    run_url: /^https:\/\/github\.com\//.test(String(env.RUN_URL || "")) ? clip(env.RUN_URL, 300) : "",
    repo,
    event,
    pr_number: event === "pull_request" ? pr : null,
    merged_pr: event === "push" ? mergedPrOf(env.HEAD_COMMIT_MESSAGE) : null,
    pr_title: event === "pull_request" ? clip(env.PR_TITLE, 200) : "",
    pr_author: event === "pull_request" ? clip(env.PR_AUTHOR, 60) : "",
    branch: clip(env.BRANCH || env.GITHUB_HEAD_REF || String(env.GITHUB_REF || "").replace(/^refs\/heads\//, ""), 120),
    sha,
    base_sha: clip(env.BASE_SHA, 40).toLowerCase(),
    bundle_gzip: typeof summary?.bundle?.gzip === "number" ? Math.round(summary.bundle.gzip) : null,
  };
  const rows = [];
  for (const [formFactor, pages] of Object.entries(summary?.presets || {})) {
    if (formFactor !== "mobile" && formFactor !== "desktop") continue;
    for (const [page, r] of Object.entries(pages || {})) {
      const row = { ...base, page: clip(page, 120), form_factor: formFactor };
      for (const [id, col] of CATS) row[col] = score(r?.scores?.[id]);
      row.lcp_ms = num(r?.metrics?.lcp);
      row.cls = num(r?.metrics?.cls);
      row.tbt_ms = num(r?.metrics?.tbt);
      row.bytes = num(r?.metrics?.bytes) == null ? null : Math.round(r.metrics.bytes);
      row.budgets_failed = over.filter((o) => o.preset === formFactor && o.path === page).length + (formFactor === "mobile" && row.perf != null && row.perf < PERF_SCORE_BUDGET ? 1 : 0);
      rows.push(row);
    }
  }
  return rows;
}

/** POST the rows (upsert on run_id, sha, page, form_factor). Returns { ok, skipped?, status? }. */
export async function store(rows, { url, serviceKey, fetchImpl = fetch, log = (m) => console.log(m) }) {
  if (!url || !serviceKey) {
    log("[lhci-store] no Supabase secrets (fork pull request or not configured): skipped.");
    return { ok: true, skipped: true };
  }
  if (!rows.length) {
    log("[lhci-store] nothing to store.");
    return { ok: true, skipped: true };
  }
  const endpoint = `${String(url).replace(/\/+$/, "")}/rest/v1/lighthouse_runs?on_conflict=run_id,sha,page,form_factor`;
  let res;
  try {
    res = await fetchImpl(endpoint, {
      method: "POST",
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(rows),
    });
  } catch (err) {
    log(`[lhci-store] warning: Supabase unreachable (${String(err?.message || err).slice(0, 120)}).`);
    return { ok: false, status: 0 };
  }
  if (res.ok) {
    log(`[lhci-store] stored ${rows.length} rows.`);
    return { ok: true, status: res.status };
  }
  const data = await res.json().catch(() => ({}));
  const missing = res.status === 404 || data?.code === "PGRST205" || data?.code === "42P01";
  log(missing ? "[lhci-store] warning: table lighthouse_runs is missing; apply supabase/migrations/20261124v_perf.sql." : `[lhci-store] warning: Supabase refused the write (HTTP ${res.status}${data?.code ? `, ${data.code}` : ""}).`);
  return { ok: false, status: res.status };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const i = process.argv.indexOf("--summary");
  const path = i > 0 ? process.argv[i + 1] : "";
  if (!path || !existsSync(path)) {
    console.log("[lhci-store] no summary.json: skipped.");
    process.exit(0);
  }
  let summary = null;
  try {
    summary = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    console.log("[lhci-store] unreadable summary.json: skipped.");
    process.exit(0);
  }
  const rows = rowsFromSummary(summary);
  await store(rows, { url: process.env.SUPABASE_URL || "", serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY || "" });
  // Never fail the workflow over the dashboard copy.
  process.exit(0);
}
