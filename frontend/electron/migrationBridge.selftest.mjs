// Electron -> Tauri migration bridge: OFF in shipped builds, signed plan only (pinned
// Ed25519 key, bound to install + user, not expired), verified downloads, secrets piped
// to the migrator over stdin only, quit only after the handoff was sealed, quiet moment,
// retry policy, rollback outcome report, crash resume and the side-by-side forwarder.
//   node frontend/electron/migrationBridge.selftest.mjs
import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { EventEmitter } from "node:events";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const dir = path.dirname(fileURLToPath(import.meta.url));
const bridge = require("./migrationBridge.cjs");
const config = require("./migrationBridgeConfig.cjs");

const { privateKey, publicKey } = crypto.generateKeyPairSync("ed25519");
const SPKI = publicKey.export({ format: "der", type: "spki" }).toString("base64");
const other = crypto.generateKeyPairSync("ed25519");
const sign = (body, key = privateKey) => crypto.sign(null, Buffer.from(body, "utf8"), key).toString("base64");

const USER = "00000000-0000-4000-8000-000000000001";
const b64u = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const TOKEN = `${b64u({ alg: "HS256" })}.${b64u({ sub: USER, username: "admin" })}.c2lnbmF0dXJl`;
const MIGRATOR = Buffer.from("MZ-fake-migrator");
const SETUP = Buffer.from("MZ-fake-tauri-setup");
const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");
const NOW = 1_800_000_000_000;

function planBody(over = {}) {
  return JSON.stringify({
    v: 1,
    action: "migrate",
    reason: "allowlist",
    wave: "allowlist",
    installId: "3f2c9a1e-1111-4222-8333",
    userId: USER,
    issuedAt: NOW / 1000 - 5,
    expiresAt: NOW / 1000 + 3600,
    migrationId: "mig-0123456789abcdef01234567",
    minWinBuild: 19041,
    healthTimeoutSec: 180,
    retryFailed: false,
    migrator: { url: "https://github.com/x/y/releases/download/v4/DescallMigrator.exe", sha256: sha(MIGRATOR), size: MIGRATOR.length },
    setup: { url: "https://github.com/x/y/releases/download/v4/Descall-Setup-4.0.0.exe", sha256: sha(SETUP), size: SETUP.length, version: "4.0.0", args: ["/S", "/D={dir}"] },
    ...over,
  });
}

function fakeChild(onStdin, exitCode = 0) {
  const c = new EventEmitter();
  c.stdout = new EventEmitter();
  c.stdin = {
    on() {},
    end(text) {
      onStdin?.(text);
      setImmediate(() => c.emit("exit", exitCode));
    },
  };
  c.kill = () => {};
  c.unref = () => {};
  return c;
}

/** A Windows-like Electron world in a temp folder. */
function world(over = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "descall-bridge-"));
  const userData = path.join(root, "Roaming", "Descall");
  const local = path.join(root, "Local");
  fs.mkdirSync(path.join(userData, "premium", "accounts", "0123456789ab"), { recursive: true });
  fs.writeFileSync(path.join(userData, "auth-token.bin"), "enc:" + TOKEN);
  fs.writeFileSync(path.join(userData, "premium", "accounts", "0123456789ab", "auth-token.bin"), "enc:" + TOKEN);
  fs.writeFileSync(path.join(userData, "premium-settings.json"), '{"features":{}}');
  fs.writeFileSync(path.join(userData, "premium", "accounts.json"), '{"accounts":[]}');
  fs.writeFileSync(path.join(userData, ".updaterId"), "3f2c9a1e-1111-4222-8333");
  const calls = { spawned: [], piped: [], reports: [], quit: 0, fetched: [] };
  let quiet = true;
  const responses = {
    plan: () => {
      const body = planBody();
      return { ok: true, status: 200, text: async () => body, headers: { get: (h) => (h === "x-descall-plan-sig" ? sign(body) : null) } };
    },
  };
  const deps = {
    app: {
      isPackaged: true,
      getVersion: () => "3.10.0",
      getPath: (k) => ({ userData, exe: "C:\\Users\\Demir\\AppData\\Local\\Programs\\Descall\\Descall.exe", temp: os.tmpdir() })[k],
    },
    fs,
    config: { ...config, PLAN_PUBLIC_KEYS: [SPKI] },
    env: { LOCALAPPDATA: local },
    argv: [],
    platform: "win32",
    arch: "x64",
    osRelease: "10.0.22631",
    now: () => NOW,
    log: { info() {}, warn() {} },
    looksLikeJwt: (t) => /^[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]*$/.test(t),
    readEncryptedFile: async (file) => fs.readFileSync(file, "utf8").replace(/^enc:/, ""),
    readToken: async () => TOKEN,
    getMainWindow: () => ({
      isDestroyed: () => false,
      isVisible: () => false, // in the tray
      isMaximized: () => true,
      getNormalBounds: () => ({ x: 10, y: 20, width: 1280, height: 800 }),
      webContents: { isDestroyed: () => false, executeJavaScript: async () => JSON.stringify({ theme: "dark", descall_token: TOKEN, token: TOKEN }) },
    }),
    readOpenAtLogin: () => true,
    getLocale: () => "tr",
    isQuietMoment: () => quiet,
    quitForMigration: () => { calls.quit += 1; },
    fetch: async (url, opts = {}) => {
      calls.fetched.push(url);
      if (url.includes("/plan?")) return responses.plan(url, opts);
      if (url.includes("/report")) {
        calls.reports.push(JSON.parse(opts.body));
        return { ok: true, status: 200 };
      }
      const buf = url.endsWith("DescallMigrator.exe") ? MIGRATOR : SETUP;
      return { ok: true, status: 200, headers: { get: () => String(buf.length) }, arrayBuffer: async () => buf };
    },
    spawn: (exe, args, opts) => {
      calls.spawned.push({ exe, args, opts });
      if (args[0] === "--receive-handoff") return fakeChild((text) => calls.piped.push(text), over.handoffExit ?? 0);
      if (args[0] === "--status") {
        const c = fakeChild();
        setImmediate(() => { c.stdout.emit("data", JSON.stringify(over.status || {})); c.emit("exit", 0); });
        return c;
      }
      return fakeChild();
    },
    ...over.deps,
  };
  return { root, userData, local, deps, calls, responses, setQuiet: (q) => { quiet = q; } };
}

test("shipped builds have the bridge switched off and no key pinned", () => {
  assert.equal(config.MIGRATION_BRIDGE_ENABLED, false);
  assert.equal(config.PLAN_PUBLIC_KEYS.length, 0);
  assert.ok(Object.isFrozen(config));
  const main = fs.readFileSync(path.join(dir, "main.cjs"), "utf8");
  const fn = main.slice(main.indexOf("function startMigrationBridge()"));
  assert.match(fn.slice(0, 400), /if \(!bridgeConfig\.MIGRATION_BRIDGE_ENABLED \|\| process\.platform !== 'win32'\) return;/);
  assert.ok(fn.indexOf("MIGRATION_BRIDGE_ENABLED") < fn.indexOf("require('./migrationBridge.cjs')"), "the bridge module loads only behind the flag");
  assert.equal((main.match(/migrationBridge\.cjs/g) || []).length, 1, "no other entry point");
});

test("plan signature: pinned key only, exact bytes", () => {
  const body = planBody();
  assert.ok(bridge.verifyPlanSignature(body, sign(body), [SPKI]));
  assert.ok(!bridge.verifyPlanSignature(body, sign(body, other.privateKey), [SPKI]), "other key");
  assert.ok(!bridge.verifyPlanSignature(body.replace("4.0.0", "4.0.1"), sign(body), [SPKI]), "tampered");
  assert.ok(!bridge.verifyPlanSignature(body, sign(body), []), "no pinned key, never valid");
  assert.ok(!bridge.verifyPlanSignature(body, "", [SPKI]));
  assert.ok(bridge.verifyPlanSignature(body, sign(body), ["garbage", SPKI]), "rotation list");
});

test("plan parsing binds install, user and time, and checks artifacts", () => {
  const ctx = { installId: "3f2c9a1e-1111-4222-8333", userId: USER, nowSec: NOW / 1000 };
  assert.equal(bridge.parsePlan(planBody(), ctx).action, "migrate");
  assert.throws(() => bridge.parsePlan(planBody({ installId: "other-install-1" }), ctx), /plan_other_install/);
  assert.throws(() => bridge.parsePlan(planBody({ userId: "someone-else" }), ctx), /plan_other_user/);
  assert.throws(() => bridge.parsePlan(planBody({ expiresAt: NOW / 1000 - 1 }), ctx), /plan_expired/);
  assert.throws(() => bridge.parsePlan(planBody({ v: 2 }), ctx), /plan_version/);
  assert.throws(() => bridge.parsePlan(planBody({ migrator: { url: "https://evil.example/m.exe", sha256: sha(MIGRATOR), size: 3 } }), ctx), /plan_bad_migrator/);
  assert.throws(() => bridge.parsePlan(planBody({ setup: { url: "http://github.com/s.exe", sha256: sha(SETUP), size: 3, version: "4" } }), ctx), /plan_bad_setup/);
  assert.equal(bridge.parsePlan(planBody({ action: "none", migrator: null }), ctx).action, "none");
  assert.equal(bridge.tokenSubject(TOKEN), USER);
  assert.equal(bridge.winBuild("10.0.19045"), 19045);
  assert.equal(bridge.winBuild("6.1.7601"), 0);
});

test("downloads must match size and SHA-256", async () => {
  const w = world();
  const dest = path.join(w.local, "dl", "m.exe");
  const fetchImpl = async () => ({ ok: true, headers: { get: () => null }, arrayBuffer: async () => MIGRATOR });
  await bridge.downloadVerified({ fetchImpl, url: "https://github.com/m.exe", sha256: sha(MIGRATOR), size: MIGRATOR.length, dest });
  assert.deepEqual(fs.readFileSync(dest), MIGRATOR);
  await assert.rejects(bridge.downloadVerified({ fetchImpl, url: "https://github.com/m.exe", sha256: "0".repeat(64), size: MIGRATOR.length, dest: dest + "2" }), /sha256_mismatch/);
  await assert.rejects(bridge.downloadVerified({ fetchImpl, url: "https://github.com/m.exe", sha256: sha(MIGRATOR), size: 99, dest: dest + "3" }), /size_mismatch/);
  await assert.rejects(bridge.downloadVerified({ fetchImpl, url: "https://evil.example/m.exe", sha256: sha(MIGRATOR), size: MIGRATOR.length, dest: dest + "4" }), /bad_url/);
  assert.ok(!fs.existsSync(dest + "2") && !fs.existsSync(dest + "2.part"), "nothing left after a bad download");
});

test("a full attempt pipes the secrets over stdin, then starts the migrator and quits", async () => {
  const w = world();
  assert.equal(await bridge.tryMigrate(w.deps), "started");
  const [handoffCall] = w.calls.spawned.filter((c) => c.args[0] === "--receive-handoff");
  assert.deepEqual(handoffCall.opts.stdio, ["pipe", "ignore", "ignore"]);
  const env = JSON.parse(w.calls.piped[0]);
  assert.equal(env.handoff.token, TOKEN);
  assert.equal(env.handoff.migrationId, env.job.id);
  assert.equal(env.handoff.accounts[0].id, "0123456789ab");
  assert.equal(env.handoff.localStorage.theme, "dark");
  assert.ok(!("descall_token" in env.handoff.localStorage) && !("token" in env.handoff.localStorage), "token never in the localStorage export");
  assert.equal(env.handoff.locale, "tr");
  assert.ok(env.handoff.premiumFiles["premium-settings.json"] && env.handoff.premiumFiles["premium.accounts.json"]);
  assert.deepEqual(env.handoff.windowState, { x: 10, y: 20, width: 1280, height: 800, maximized: true, unit: "dip" });
  assert.equal(env.job.launchHidden, true, "tray user: new app starts hidden");
  assert.equal(env.job.setup.sha256, sha(SETUP));
  assert.equal(env.job.setup.size, SETUP.length);
  assert.ok(env.job.setup.path.endsWith("Descall-Setup-4.0.0.exe"));
  assert.equal(env.job.electronExe, "C:\\Users\\Demir\\AppData\\Local\\Programs\\Descall\\Descall.exe");
  // Secrets never written to disk by the bridge.
  for (const f of fs.readdirSync(path.join(w.local, "Descall-Migration"))) {
    assert.ok(!fs.readFileSync(path.join(w.local, "Descall-Migration", f), "utf8").includes(TOKEN), f);
  }
  const run = w.calls.spawned.find((c) => c.args[0] === "--run");
  assert.ok(run && run.opts.detached, "--run is detached");
  assert.equal(w.calls.quit, 1);
  assert.deepEqual(w.calls.reports.map((r) => r.event), ["offered", "downloaded", "handoff_ok", "started"]);
  assert.ok(w.calls.reports.every((r) => !JSON.stringify(r).includes(TOKEN)), "reports carry no secrets");
});

test("no quiet moment, no move; a failed handoff keeps Electron running", async () => {
  const w = world();
  w.setQuiet(false);
  assert.equal(await bridge.tryMigrate(w.deps), "wait");
  assert.equal(w.calls.quit, 0);
  assert.equal(w.calls.piped.length, 0);

  const f = world({ handoffExit: 12 });
  assert.equal(await bridge.tryMigrate(f.deps), "handoff-failed");
  assert.equal(f.calls.quit, 0, "Electron stays");
  assert.ok(!f.calls.spawned.some((c) => c.args[0] === "--run"));
  assert.equal(f.calls.reports.at(-1).event, "handoff_failed");
  assert.equal(f.calls.reports.at(-1).code, "exit_12");
  assert.equal(await bridge.tryMigrate(f.deps), "backoff", "3 days before the next try");
});

test("unsigned, badly signed, unpinned or not-for-us plans do nothing", async () => {
  const w = world();
  w.responses.plan = () => ({ ok: true, status: 200, text: async () => planBody(), headers: { get: () => null } });
  assert.equal(await bridge.tryMigrate(w.deps), "unsigned");
  w.responses.plan = () => {
    const body = planBody();
    return { ok: true, status: 200, text: async () => body, headers: { get: () => sign(body, other.privateKey) } };
  };
  await assert.rejects(bridge.tryMigrate(w.deps), /plan_signature_invalid/);
  assert.equal(w.calls.quit, 0);

  const n = world({ deps: { config: { ...config, PLAN_PUBLIC_KEYS: [] } } });
  assert.equal(await bridge.tryMigrate(n.deps), "no-key");
  assert.ok(!n.calls.fetched.length, "no key pinned: not even a request");

  const old = world({ deps: { osRelease: "10.0.18363" } });
  assert.equal(await bridge.tryMigrate(old.deps), "unsupported-os");
  assert.equal(old.calls.reports[0].event, "unsupported_os");
  assert.equal(await bridge.tryMigrate(old.deps), "unsupported-os");
  assert.equal(old.calls.reports.length, 1, "reported once");

  const mac = world({ deps: { platform: "darwin" } });
  assert.equal(await bridge.tryMigrate(mac.deps), "skip");
  const signedOut = world({ deps: { readToken: async () => null } });
  assert.equal(await bridge.tryMigrate(signedOut.deps), "signed-out");
});

test("retry policy", () => {
  const plan = { migrationId: "mig-a", retryFailed: false };
  assert.ok(bridge.shouldAttempt({}, plan, NOW));
  assert.ok(!bridge.shouldAttempt({ migrationId: "mig-a", attempts: 3 }, plan, NOW));
  assert.ok(bridge.shouldAttempt({ migrationId: "mig-a", attempts: 3 }, { ...plan, retryFailed: true }, NOW));
  assert.ok(!bridge.shouldAttempt({ migrationId: "mig-a", attempts: 1, lastFailureAt: NOW - 3600_000 }, plan, NOW));
  assert.ok(bridge.shouldAttempt({ migrationId: "mig-a", attempts: 1, lastFailureAt: NOW - 4 * 86400_000 }, plan, NOW));
  assert.ok(bridge.shouldAttempt({ migrationId: "mig-old", attempts: 3 }, plan, NOW), "a new migration id starts fresh");
});

test("after a rollback relaunch the outcome is reported", async () => {
  const status = { installId: "3f2c9a1e-1111-4222-8333", migrationId: "mig-0123456789abcdef01234567", event: "rollback_ok", step: "await_health", code: "health_timeout", durationMs: 190000, strategy: "in_place", perMachine: false, resumes: 0, steps: [] };
  const w = world({ status, deps: { argv: ["Descall.exe", "--migration-failed"] } });
  fs.mkdirSync(path.join(w.local, "Descall-Migration"), { recursive: true });
  fs.writeFileSync(path.join(w.local, "Descall-Migration", "DescallMigrator.exe"), MIGRATOR);
  assert.equal(await bridge.reportRelaunchOutcome(w.deps), "rollback_ok");
  assert.equal(w.calls.reports[0].event, "rollback_ok");
  assert.equal(w.calls.reports[0].code, "health_timeout");
  assert.ok(JSON.parse(fs.readFileSync(path.join(w.userData, "migration-bridge.json"), "utf8")).lastFailureAt, "backs off after a rollback");
  const plain = world();
  assert.equal(await bridge.reportRelaunchOutcome(plain.deps), null, "normal start: nothing to report");
});

test("an interrupted migration is resumed, a finished one is not", () => {
  const w = world();
  const wd = path.join(w.local, "Descall-Migration");
  fs.mkdirSync(wd, { recursive: true });
  fs.writeFileSync(path.join(wd, "DescallMigrator.exe"), MIGRATOR);
  fs.writeFileSync(path.join(wd, "state.json"), JSON.stringify({ step: "install_new" }));
  assert.equal(bridge.resumeIfInterrupted(w.deps), true);
  assert.deepEqual(w.calls.spawned.at(-1).args, ["--resume"]);
  for (const step of ["done", "skipped", "needs_help", "ready"]) {
    fs.writeFileSync(path.join(wd, "state.json"), JSON.stringify({ step }));
    assert.equal(bridge.resumeIfInterrupted(w.deps), false, step);
  }
});

test("side-by-side move done: the old shortcut forwards to the new app", () => {
  const w = world({ deps: { app: { isPackaged: true, getVersion: () => "3.10.0", getPath: (k) => (k === "exe" ? path.join("C:\\Program Files\\Descall", "Descall.exe") : os.tmpdir()) } } });
  const wd = path.join(w.local, "Descall-Migration");
  fs.mkdirSync(wd, { recursive: true });
  const newExe = path.join(w.local, "Programs", "Descall", "Descall.exe");
  fs.mkdirSync(path.dirname(newExe), { recursive: true });
  fs.writeFileSync(newExe, "tauri");
  fs.writeFileSync(path.join(wd, "cleanup.json"), JSON.stringify({ strategy: "side_by_side", oldDir: path.dirname(w.deps.app.getPath("exe")) }));
  assert.equal(bridge.forwardIfMigrated(w.deps), true);
  assert.equal(w.calls.spawned.at(-1).exe, newExe);
  assert.equal(w.calls.quit, 1);
  fs.writeFileSync(path.join(wd, "cleanup.json"), JSON.stringify({ strategy: "in_place", oldDir: "x" }));
  assert.equal(bridge.forwardIfMigrated(w.deps), false);
});

test("install id comes from electron-updater's .updaterId", () => {
  const w = world();
  assert.equal(bridge.installIdFor(w.deps), "3f2c9a1e-1111-4222-8333");
  fs.unlinkSync(path.join(w.userData, ".updaterId"));
  const a = bridge.installIdFor(w.deps);
  assert.match(a, /^[0-9a-f-]{36}$/);
  assert.equal(bridge.installIdFor(w.deps), a, "stable once created");
});
