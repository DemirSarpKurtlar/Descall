// Descall+ main-process foundation: gate intersection (a tampered renderer cannot widen
// access), verify failure handling, and the JSON settings store.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createGate, intersectEntitlements, parseServer } = require("./gate.cjs");
const { createStore } = require("./store.cjs");

const err = (status) => Object.assign(new Error(`HTTP ${status}`), { status });
const flush = () => new Promise((r) => setImmediate(r));

test("intersection: renderer ∩ server, lower plan wins", () => {
  const r = intersectEntitlements(["mini_mode", "desktop_sidebar", "pip_call"], "ultra", new Set(["mini_mode", "pip_call"]), "plus");
  assert.equal(r.plan, "plus");
  assert.deepEqual([...r.keys].sort(), ["mini_mode", "pip_call"]);
  assert.equal(intersectEntitlements(["mini_mode"], "plus", null, null).keys.size, 0);
  assert.equal(intersectEntitlements(["mini_mode"], null, new Set(["mini_mode"]), "plus").keys.size, 0);
});

test("parseServer: only active plans, only keys the plan allows", () => {
  const s = parseServer({ plan: "plus", status: "active", features: ["mini_mode", "desktop_sidebar", "x"] });
  assert.deepEqual([...s.keys], ["mini_mode"]);
  assert.equal(parseServer({ plan: "plus", status: "expired" }).plan, null);
  assert.ok(parseServer({ plan: "ultra", status: "active" }).keys.has("window_layouts"));
});

test("gate: nothing before main verified; tampered renderer claim is cut to the server answer", async () => {
  let server = { plan: "plus", status: "active", features: ["mini_mode", "pip_call"] };
  let calls = 0;
  const gate = createGate({ fetchMe: async () => { calls += 1; return server; } });
  const changes = [];
  gate.onChange((s) => changes.push(s));
  assert.equal(gate.has("mini_mode"), false);
  gate.setEntitlements(["mini_mode", "pip_call", "desktop_sidebar", "window_layouts"], "ultra");
  assert.equal(gate.has("mini_mode"), false, "not before the server answered");
  await gate.verify();
  await flush();
  assert.equal(calls, 1);
  assert.equal(gate.has("mini_mode"), true);
  assert.equal(gate.has("desktop_sidebar"), false, "renderer cannot unlock ultra keys");
  assert.equal(gate.plan(), "plus");
  assert.ok(changes.length >= 1);

  // Renderer narrows (user turned a feature off): narrowing works without the server.
  gate.setEntitlements(["pip_call"], "plus");
  assert.equal(gate.has("mini_mode"), false);
  assert.equal(gate.has("pip_call"), true);
});

test("gate: server says free (401 / 404 / no token) -> everything off", async () => {
  for (const failure of [err(401), err(404), Object.assign(new Error("x"), { code: "no-token" })]) {
    const gate = createGate({ fetchMe: async () => { throw failure; } });
    gate.setEntitlements(["mini_mode"], "plus");
    await gate.verify({ force: true });
    assert.equal(gate.has("mini_mode"), false, String(failure.message));
  }
});

test("gate: network failure keeps the last verified answer", async () => {
  let fail = false;
  const gate = createGate({ fetchMe: async () => { if (fail) throw err(0); return { plan: "plus", status: "active" }; } });
  gate.setEntitlements(["mini_mode"], "plus");
  await gate.verify({ force: true });
  assert.equal(gate.has("mini_mode"), true);
  fail = true;
  await gate.verify({ force: true });
  assert.equal(gate.has("mini_mode"), true);
  gate.reset();
  assert.equal(gate.has("mini_mode"), false);
});

test("gate: downgrade on the server removes keys at the next verify", async () => {
  let plan = "ultra";
  const gate = createGate({ fetchMe: async () => ({ plan, status: "active" }) });
  gate.setEntitlements(["desktop_sidebar", "mini_mode"], "ultra");
  await gate.verify({ force: true });
  assert.equal(gate.has("desktop_sidebar"), true);
  plan = "plus";
  await gate.verify({ force: true });
  assert.equal(gate.has("desktop_sidebar"), false);
  assert.equal(gate.has("mini_mode"), true);
});

test("store: get/set/patchFeature, persisted, corrupt file recovers", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "descall-premium-store-"));
  const file = path.join(dir, "premium-settings.json");
  const s = createStore(file, { flushMs: 5 });
  const seen = [];
  s.onChange((p) => seen.push(p));
  assert.deepEqual(s.feature("mini_mode"), {});
  s.patchFeature("mini_mode", { enabled: true, opacity: 0.9 });
  s.patchFeature("mini_mode", { opacity: null, autoOnMinimize: true });
  assert.deepEqual(s.feature("mini_mode"), { enabled: true, autoOnMinimize: true });
  s.set("windows.main", { x: 1, y: 2, width: 3, height: 4 });
  assert.equal(s.get("windows.main.width"), 3);
  assert.equal(s.get("missing.path", "dflt"), "dflt");
  assert.throws(() => s.set("__proto__.x", 1));
  assert.ok(s.flush());
  const again = createStore(file);
  assert.deepEqual(again.feature("mini_mode"), { enabled: true, autoOnMinimize: true });
  assert.ok(seen.includes("features.mini_mode"));

  fs.writeFileSync(file, "{ not json");
  const recovered = createStore(file);
  assert.deepEqual(recovered.all(), {});
  assert.ok(fs.readdirSync(dir).some((f) => f.includes(".corrupt-")));
});
