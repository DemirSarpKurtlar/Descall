#!/usr/bin/env node
// Runs every node test file under frontend/ (selftests, unit and integration tests) in parallel.
// Discovery is by file name, so a new *.selftest.* / *.test.* file is picked up without editing CI.
//   node scripts/run-tests.mjs [--shard=1/2] [--jobs=N] [--timeout=120] [--list]
// Quarantined files (tests.quarantine.json, each with a reason) still run but cannot fail the job.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { spawn } from "node:child_process";
import { cpus } from "node:os";
import { join, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const [k, v] = a.replace(/^--/, "").split("=");
  return [k, v ?? true];
}));
const SKIP_DIRS = new Set(["node_modules", "dist", "release", "android", "ios", ".vercel", "public"]);
const TEST_RE = /\.(selftest|test|unit\.test|integration\.test)\.(mjs|cjs|js)$/;
const HELPERS = new Set(["backend/test/fakeSupabase.cjs"]);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name) || name.startsWith(".")) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (TEST_RE.test(name)) out.push(relative(root, p).split("\\").join("/"));
  }
  return out;
}

const quarantine = JSON.parse(readFileSync(join(root, "tests.quarantine.json"), "utf8"));
delete quarantine._doc;
let files = walk(root).filter((f) => !HELPERS.has(f)).sort();
for (const q of Object.keys(quarantine)) {
  if (!files.includes(q)) { console.error(`tests.quarantine.json lists a missing file: ${q}`); process.exit(2); }
  if (!String(quarantine[q] || "").trim()) { console.error(`quarantine entry without a reason: ${q}`); process.exit(2); }
}
if (args.shard) {
  const [i, n] = String(args.shard).split("/").map(Number);
  files = files.filter((_, idx) => idx % n === i - 1);
}
if (args.list) { files.forEach((f) => console.log(f)); process.exit(0); }

const jobs = Number(args.jobs) || Math.max(2, cpus().length);
const timeoutMs = (Number(args.timeout) || 120) * 1000;
const results = [];

function runOne(file) {
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(process.execPath, [file], {
      cwd: root,
      env: { ...process.env, CI: process.env.CI || "1", NODE_ENV: "test" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (d) => { output += d; });
    child.stderr.on("data", (d) => { output += d; });
    const timer = setTimeout(() => { output += `\n[run-tests] timed out after ${timeoutMs / 1000}s`; child.kill("SIGKILL"); }, timeoutMs);
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      resolve({ file, ok: code === 0, code: code ?? signal, ms: Date.now() - started, output });
    });
  });
}

const queue = [...files];
await Promise.all(Array.from({ length: Math.min(jobs, queue.length) }, async () => {
  while (queue.length) results.push(await runOne(queue.shift()));
}));
results.sort((a, b) => a.file.localeCompare(b.file));

const failed = results.filter((r) => !r.ok && !quarantine[r.file]);
const qFailed = results.filter((r) => !r.ok && quarantine[r.file]);
const qPassing = results.filter((r) => r.ok && quarantine[r.file]);
const passed = results.filter((r) => r.ok && !quarantine[r.file]);

for (const r of failed) {
  console.log(`\n::group::FAIL ${r.file} (exit ${r.code}, ${r.ms} ms)`);
  console.log(r.output.trim().split("\n").slice(-60).join("\n"));
  console.log("::endgroup::");
  if (process.env.GITHUB_ACTIONS) console.log(`::error file=frontend/${r.file}::test failed (exit ${r.code})`);
}
for (const r of qFailed) console.log(`QUARANTINED ${r.file}: ${quarantine[r.file]}`);
for (const r of qPassing) {
  const msg = `${r.file} is quarantined but passes now; remove it from tests.quarantine.json`;
  console.log(process.env.GITHUB_ACTIONS ? `::warning::${msg}` : `WARN ${msg}`);
}
const slow = [...results].sort((a, b) => b.ms - a.ms).slice(0, 5).map((r) => `${r.file} ${r.ms}ms`);
console.log(`\nSlowest: ${slow.join(", ")}`);
const summary = `Tests: ${results.length} files, ${passed.length} passed, ${failed.length} failed, ${qFailed.length + qPassing.length} quarantined (${qPassing.length} of them passing)`;
console.log(summary);
if (process.env.GITHUB_STEP_SUMMARY) {
  const { appendFileSync } = await import("node:fs");
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### ${summary}\n` + (failed.length ? failed.map((r) => `- FAIL \`${r.file}\``).join("\n") + "\n" : "") +
    Object.entries(quarantine).map(([f, why]) => `- quarantined \`${f}\`: ${why}`).join("\n") + "\n");
}
process.exit(failed.length ? 1 : 0);
