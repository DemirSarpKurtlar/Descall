// node scripts/ciConfig.selftest.mjs
// Dependabot, CodeQL and Lighthouse CI configuration: files parse, every directory and path
// they name exists, schedules / limits / ignores are the quiet ones the owner asked for, and
// the workflows keep minimal permissions and never publish reports publicly.
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "..", "..");
const read = (rel) => readFileSync(join(repo, rel), "utf8");

let yaml = null;
try {
  yaml = createRequire(import.meta.url)("js-yaml");
} catch {
  /* js-yaml comes with the frontend dev dependencies; without it only text checks run */
}
const parse = (rel) => {
  const text = read(rel);
  if (!yaml) return null;
  return yaml.load(text);
};

// ── Dependabot ──────────────────────────────────────────────────────────────
const MANIFEST = {
  npm: ["package.json"],
  cargo: ["Cargo.toml", "Cargo.lock"],
  gradle: ["build.gradle"],
  "github-actions": [".github/workflows"],
};
const depText = read(".github/dependabot.yml");
assert.doesNotMatch(depText, /package-ecosystem:\s*swift/, "Swift is not listed (Capacitor-generated Package.swift cannot resolve)");
const dep = parse(".github/dependabot.yml");
if (dep) {
  assert.equal(dep.version, 2);
  assert.ok(Array.isArray(dep.updates) && dep.updates.length >= 4);
  const ecosystems = new Set(dep.updates.map((u) => u["package-ecosystem"]));
  for (const e of ["npm", "cargo", "github-actions", "gradle"]) assert.ok(ecosystems.has(e), `${e} configured`);
  const dirsSeen = new Set();
  for (const u of dep.updates) {
    const eco = u["package-ecosystem"];
    const dirs = u.directories || [u.directory];
    assert.ok(dirs.length && dirs.every(Boolean), `${eco}: directory set`);
    for (const d of dirs) {
      assert.ok(d.startsWith("/"), `${eco} ${d}: absolute repo path`);
      for (const m of MANIFEST[eco] || []) {
        const p = eco === "github-actions" ? join(repo, m) : join(repo, d, m);
        assert.ok(existsSync(p), `${eco} ${d}: ${m} exists`);
      }
      dirsSeen.add(`${eco}:${d}`);
    }
    const s = u.schedule;
    assert.ok(s && ["weekly", "monthly"].includes(s.interval), `${eco}: weekly or monthly`);
    assert.equal(s.timezone, "Europe/Istanbul", `${eco}: Istanbul time`);
    if (s.interval === "weekly") assert.equal(s.day, "monday", `${eco}: Monday`);
    assert.match(String(s.time), /^0[6-9]:\d\d$/, `${eco}: morning`);
    assert.ok(Number(u["open-pull-requests-limit"]) <= 3, `${eco}: small PR limit`);
    assert.ok(Array.isArray(u.labels) && u.labels.includes("dependencies"), `${eco}: labelled`);
    assert.ok(u["commit-message"]?.prefix, `${eco}: commit prefix`);
    const groups = Object.values(u.groups || {});
    assert.ok(groups.length, `${eco}: grouped`);
    if (eco !== "github-actions") {
      assert.ok(groups.some((g) => g["applies-to"] === "security-updates"), `${eco}: security updates in their own group`);
    }
    if (Number(u["open-pull-requests-limit"]) > 0 && eco !== "github-actions") {
      assert.ok(groups.some((g) => g["applies-to"] === "version-updates" && g["update-types"]?.join() === "minor,patch"), `${eco}: one minor+patch PR`);
    }
    for (const ig of u.ignore || []) {
      for (const t of ig["update-types"] || []) assert.match(t, /^version-update:semver-(major|minor|patch)$/, `${eco}: valid update type ${t}`);
    }
  }
  for (const d of ["/frontend", "/frontend/backend", "/frontend/electron"]) assert.ok(dirsSeen.has(`npm:${d}`), `npm ${d} covered`);
  assert.ok(dirsSeen.has("cargo:/desktop"), "cargo workspace covered");
  const productNpm = dep.updates.find((u) => u["package-ecosystem"] === "npm" && (u.directories || []).includes("/frontend"));
  const majorIgnored = (name) => (productNpm.ignore || []).some((i) => i["dependency-name"] === name && i["update-types"].includes("version-update:semver-major"));
  for (const n of ["electron", "@capacitor/*", "react", "react-dom", "vite"]) assert.ok(majorIgnored(n), `npm: ${n} majors by hand`);
  const cargo = dep.updates.find((u) => u["package-ecosystem"] === "cargo");
  assert.ok((cargo.ignore || []).some((i) => i["dependency-name"] === "tauri*" && i["update-types"].includes("version-update:semver-major")), "cargo: tauri majors by hand");
} else {
  console.log("ciConfig: js-yaml missing, dependabot.yml checked as text only");
}

// ── CodeQL ──────────────────────────────────────────────────────────────────
const codeqlText = read(".github/workflows/codeql.yml");
assert.doesNotMatch(codeqlText, /language:\s*swift|languages:\s*swift/, "Swift not scanned (needs a macOS build)");
assert.match(codeqlText, /github\/codeql-action\/init@v4/);
assert.match(codeqlText, /github\/codeql-action\/analyze@v4/);
const codeql = parse(".github/workflows/codeql.yml");
if (codeql) {
  const on = codeql.on || codeql[true]; // YAML 1.1 reads a bare `on` key as true
  assert.deepEqual(on.pull_request.branches, ["main"]);
  assert.deepEqual(on.push.branches, ["main"]);
  assert.ok(Array.isArray(on.schedule) && on.schedule[0].cron, "weekly schedule");
  assert.deepEqual(codeql.permissions, { contents: "read" }, "workflow token read-only by default");
  const langs = codeql.jobs.analyze.strategy.matrix.include.map((m) => m.language);
  for (const l of ["javascript-typescript", "actions", "java-kotlin"]) assert.ok(langs.includes(l), `${l} scanned`);
  assert.ok(codeql.jobs.analyze.strategy.matrix.include.every((m) => m["build-mode"] === "none"), "no builds needed");
  assert.equal(codeql.jobs.analyze.permissions["security-events"], "write");
  for (const job of Object.values(codeql.jobs)) {
    const init = job.steps.find((s) => String(s.uses || "").startsWith("github/codeql-action/init"));
    assert.ok(existsSync(join(repo, init.with["config-file"])), "CodeQL config file exists");
  }
}
// Nothing waits for CodeQL: release, TestFlight and publish workflows never depend on it.
for (const f of readdirSync(join(repo, ".github/workflows"))) {
  if (f === "codeql.yml" || !/\.ya?ml$/.test(f)) continue;
  assert.doesNotMatch(read(`.github/workflows/${f}`), /codeql\.yml|workflow_run:[\s\S]{0,200}CodeQL/, `${f} must not depend on CodeQL`);
}
const cqConfig = parse(".github/codeql/codeql-config.yml");
if (cqConfig) {
  assert.ok(Array.isArray(cqConfig["paths-ignore"]) && cqConfig["paths-ignore"].length);
  for (const p of cqConfig["paths-ignore"]) {
    if (/[*?]/.test(p)) continue;
    assert.ok(existsSync(join(repo, p)), `CodeQL paths-ignore ${p} exists`);
  }
  assert.ok(!cqConfig["paths-ignore"].some((p) => p === "frontend/src" || p === "frontend/backend"), "app code is scanned");
}

// ── Lighthouse ─────────────────────────────────────────────────────────────
const lhText = read(".github/workflows/lighthouse.yml");
assert.doesNotMatch(lhText.replace(/^\s*#.*$/gm, ""), /temporary-public-storage/, "reports never public");
const { LHCI_VERSION } = await import(pathToFileURL(join(here, "lhci/config.mjs")).href);
assert.match(lhText, new RegExp(`LHCI_VERSION: "${LHCI_VERSION.replace(/\./g, "\\.")}"`), "workflow pins the same @lhci/cli as config.mjs");
assert.match(lhText, /@lhci\/cli@\$LHCI_VERSION/);
const lh = parse(".github/workflows/lighthouse.yml");
if (lh) {
  const on = lh.on || lh[true];
  assert.ok(on.pull_request.paths.includes("frontend/src/**"), "PRs touching the frontend");
  assert.ok("workflow_dispatch" in on, "manual run");
  assert.deepEqual(lh.permissions, { contents: "read" });
  assert.deepEqual(lh.jobs.lighthouse.permissions, { contents: "read" });
  assert.deepEqual(lh.jobs.comment.permissions, { "pull-requests": "write" }, "only the comment job may write, and only PR comments");
  assert.match(lh.jobs.comment.if, /head\.repo\.full_name == github\.repository/, "no comment attempt from forks");
  const steps = lh.jobs.lighthouse.steps;
  const build = steps.find((s) => /Build/.test(s.name || ""));
  assert.match(build.env.VITE_API_BASE_URL, /^http:\/\/127\.0\.0\.1:/, "built against the local stub API");
  const save = steps.find((s) => String(s.uses || "").startsWith("actions/cache/save"));
  assert.match(save.if, /refs\/heads\/main/, "baseline saved from main only");
  assert.match(save.with.key, /^lhci-baseline-main-/);
  const restore = steps.find((s) => String(s.uses || "").startsWith("actions/cache/restore"));
  assert.match(restore.with["restore-keys"], /lhci-baseline-main-/);
}

// ── shared: actions pinned to a major, checkout without persisted credentials ──
for (const f of ["codeql.yml", "lighthouse.yml"]) {
  const text = read(`.github/workflows/${f}`);
  for (const m of text.matchAll(/uses:\s*([^\s#]+)/g)) assert.match(m[1], /@v\d+$/, `${f}: ${m[1]} pinned to a major tag`);
  assert.match(text, /actions\/checkout@v\d+\s+with:\s+persist-credentials: false/, `${f}: checkout does not keep the token`);
}

console.log("ciConfig selftest OK");
