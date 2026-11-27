// node scripts/lhci/store.selftest.mjs
// Lighthouse CI -> public.lighthouse_runs: rows per page and form factor, PR context,
// merged PR from the main commit message, budgets, no secret in any log line, quiet
// skip without secrets (fork PRs), warnings (never a failure) on a refused write.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mergedPrOf, rowsFromSummary, store } from "./store.mjs";

const summary = {
  version: 1,
  sha: "8f3c2a1aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  runs: 3,
  bundle: { raw: 700000, gzip: 250000, files: 1 },
  presets: {
    mobile: {
      "/": { scores: { performance: 0.93, accessibility: 1, "best-practices": 0.96, seo: 1 }, metrics: { lcp: 2100, cls: 0.02, tbt: 180, bytes: 900 * 1024 } },
      "/download": { scores: { performance: 0.84, accessibility: 1, "best-practices": 0.96, seo: 1 }, metrics: { lcp: 2600, cls: 0.01, tbt: 300, bytes: 900 * 1024 } },
    },
    desktop: { "/": { scores: { performance: 0.99, accessibility: 1, "best-practices": 0.96, seo: null }, metrics: { lcp: 900, cls: 0, tbt: 20, bytes: 900 * 1024 } } },
  },
};
const env = {
  GITHUB_EVENT_NAME: "pull_request",
  GITHUB_RUN_ID: "123456",
  RUN_URL: "https://github.com/acme/app/actions/runs/123456",
  GITHUB_REPOSITORY: "acme/app",
  PR_NUMBER: "456",
  PR_TITLE: "Voice room grid\nvirtualisation",
  PR_AUTHOR: "kaan",
  HEAD_SHA: "8F3C2A1BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
  BASE_SHA: "396c9b2",
  BRANCH: "kaan/voice-grid",
};
const rows = rowsFromSummary(summary, env);
assert.equal(rows.length, 3);
const dl = rows.find((r) => r.page === "/download");
assert.deepEqual(
  { pr: dl.pr_number, perf: dl.perf, a11y: dl.a11y, bp: dl.best_practices, seo: dl.seo, ff: dl.form_factor, sha: dl.sha, title: dl.pr_title, bundle: dl.bundle_gzip, failed: dl.budgets_failed, repo: dl.repo, merged: dl.merged_pr },
  { pr: 456, perf: 84, a11y: 100, bp: 96, seo: 100, ff: "mobile", sha: "8f3c2a1bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", title: "Voice room grid virtualisation", bundle: 250000, failed: 2, repo: "acme/app", merged: null },
);
assert.equal(rows.find((r) => r.form_factor === "desktop").seo, null);
assert.equal(rows.find((r) => r.page === "/" && r.form_factor === "mobile").budgets_failed, 0);

// main push: no PR fields, merged PR from the squash / merge commit message
const pushRows = rowsFromSummary(summary, { ...env, GITHUB_EVENT_NAME: "push", HEAD_SHA: "", GITHUB_SHA: "396c9b2cccccccccccccccccccccccccccccccc", HEAD_COMMIT_MESSAGE: "Lazy-load emoji picker (#455)\n\nbody" });
assert.ok(pushRows.every((r) => r.pr_number === null && r.pr_title === "" && r.merged_pr === 455));
assert.equal(pushRows[0].sha, "8f3c2a1aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "summary sha when HEAD_SHA is empty");
assert.equal(mergedPrOf("Merge pull request #452 from ece/discover-skel"), 452);
assert.equal(mergedPrOf("plain commit"), null);
assert.deepEqual(rowsFromSummary(summary, { ...env, HEAD_SHA: "not-a-sha" }).length, 3, "falls back to the summary sha");
assert.deepEqual(rowsFromSummary({ ...summary, sha: "" }, { ...env, HEAD_SHA: "zz" }), [], "no valid sha, no rows");
assert.equal(rowsFromSummary(summary, { ...env, RUN_URL: "https://evil.example/x" })[0].run_url, "");

// store: skip without secrets, POST upsert with the service key, warnings only
const logs = [];
const log = (m) => logs.push(m);
assert.deepEqual(await store(rows, { url: "", serviceKey: "", log }), { ok: true, skipped: true });
assert.match(logs.pop(), /skipped/);
const SECRET = "service-role-secret-value";
let req = null;
const ok = await store(rows, {
  url: "https://p.supabase.co/",
  serviceKey: SECRET,
  log,
  fetchImpl: async (u, o) => {
    req = { u, o };
    return { ok: true, status: 201, json: async () => ({}) };
  },
});
assert.equal(ok.ok, true);
assert.equal(req.u, "https://p.supabase.co/rest/v1/lighthouse_runs?on_conflict=run_id,sha,page,form_factor");
assert.equal(req.o.headers.Prefer, "resolution=merge-duplicates,return=minimal");
assert.equal(JSON.parse(req.o.body).length, 3);
const miss = await store(rows, { url: "https://p.supabase.co", serviceKey: SECRET, log, fetchImpl: async () => ({ ok: false, status: 404, json: async () => ({ code: "PGRST205" }) }) });
assert.equal(miss.ok, false);
assert.match(logs.at(-1), /20261124v_perf\.sql/);
await store(rows, { url: "https://p.supabase.co", serviceKey: SECRET, log, fetchImpl: async () => { throw new Error(`boom ${SECRET}`.replace(SECRET, "x")); } });
assert.ok(logs.every((l) => !l.includes(SECRET)), "the key never reaches the log");

// the workflow: secrets only in the store job, fork PRs skipped, comment in Turkish
const wf = readFileSync(new URL("../../../.github/workflows/lighthouse.yml", import.meta.url), "utf8");
const storeJob = wf.slice(wf.indexOf("\n  store:"));
assert.match(storeJob, /SUPABASE_SERVICE_ROLE_KEY: \$\{\{ secrets\.SUPABASE_SERVICE_ROLE_KEY \}\}/);
assert.match(storeJob, /github\.event\.pull_request\.head\.repo\.full_name == github\.repository/);
assert.equal((wf.match(/secrets\.SUPABASE_SERVICE_ROLE_KEY/g) || []).length, 1, "the key is used in one place only");
assert.ok(!/echo[^\n]*SUPABASE/.test(wf), "never echoed");
assert.match(wf, /PR_TITLE: \$\{\{ github\.event\.pull_request\.title \}\}/, "PR title through env, not interpolated into a script");
assert.ok(!/run:[^\n]*\$\{\{ github\.event\.pull_request\.title/.test(wf));

console.log("lhci store selftest OK");
