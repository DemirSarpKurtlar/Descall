// 3D world gate: admins only (phase 1), desktop only, hardware WebGL2 only; quality presets.
// Run: node src/world3d/gate.selftest.mjs
import assert from "node:assert/strict";
import { canShowWorld, isWorldAdmin, rendererVerdict, WORLD3D_PUBLIC, detectEnvironment } from "./gate.js";
import { autoPreset, PRESETS, resolvePreset } from "./engine/quality.js";

const admin = { id: "1", username: "demir", is_admin: true };
const named = { id: "2", username: "admin" };
const user = { id: "3", username: "ayse", is_admin: false };
const desk = { ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/140 Electron/42", screenShort: 1080 };

assert.equal(WORLD3D_PUBLIC, false, "phase 1: the world stays off for everyone but admins");
assert.equal(isWorldAdmin(admin), true);
assert.equal(isWorldAdmin(named), true);
assert.equal(isWorldAdmin(user), false);
assert.equal(isWorldAdmin(null), false);

assert.deepEqual(canShowWorld({ me: admin, ...desk }), { ok: true });
assert.deepEqual(canShowWorld({ me: named, ...desk }), { ok: true });
assert.equal(canShowWorld({ me: user, ...desk }).reason, "flag");
assert.equal(canShowWorld({ me: null, ...desk }).reason, "signed_out");
assert.deepEqual(canShowWorld({ me: user, ...desk, publicEnabled: true }), { ok: true }, "owner can open it later");
// Never on mobile / native / touch, even for admins.
assert.equal(canShowWorld({ me: admin, ...desk, buildEnabled: false }).reason, "build");
assert.equal(canShowWorld({ me: admin, ...desk, native: true }).reason, "native");
assert.equal(canShowWorld({ me: admin, ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)", screenShort: 390 }).reason, "mobile");
assert.equal(canShowWorld({ me: admin, ua: "Mozilla/5.0 (Linux; Android 15; Pixel 9) Mobile", screenShort: 412 }).reason, "mobile");
assert.equal(canShowWorld({ me: admin, ua: "Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X)", screenShort: 820 }).reason, "mobile");
assert.equal(canShowWorld({ me: admin, ...desk, coarsePointer: true }).reason, "touch");
assert.equal(canShowWorld({ me: admin, ...desk, screenShort: 600 }).reason, "small_screen");

// Renderer: WebGL2 + hardware; software rendering falls back unless explicitly allowed (tests).
assert.equal(rendererVerdict({ webgl2: false }).reason, "no_webgl2");
assert.deepEqual(rendererVerdict({ webgl2: true, renderer: "ANGLE (Intel, Intel(R) Iris(R) Xe Graphics Direct3D11)" }), { ok: true, software: false });
assert.equal(rendererVerdict({ webgl2: true, renderer: "ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)))" }).reason, "software");
assert.equal(rendererVerdict({ webgl2: true, renderer: "llvmpipe (LLVM 17.0.6, 256 bits)" }).reason, "software");
assert.equal(rendererVerdict({ webgl2: true, renderer: "ANGLE (Microsoft, Microsoft Basic Render Driver Direct3D11)" }).reason, "software");
assert.deepEqual(rendererVerdict({ webgl2: true, renderer: "SwiftShader", allowSoftware: true }), { ok: true, software: true });

// Environment probe without a window.
assert.deepEqual(detectEnvironment(undefined), { native: false, ua: "", coarsePointer: false, screenShort: 1080 });
assert.equal(detectEnvironment({ Capacitor: { isNativePlatform: () => true }, navigator: { userAgent: "x" }, screen: { width: 1920, height: 1080 } }).native, true);

// Quality presets. "auto" starts from a sensible medium (also on discrete GPUs: high is a
// manual choice); software rendering, weak integrated GPUs and 2-core machines get low.
assert.equal(autoPreset({ software: true }), "low");
assert.equal(autoPreset({ cores: 2, renderer: "NVIDIA GeForce RTX 4070" }), "low");
assert.equal(autoPreset({ cores: 12, renderer: "ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 Direct3D11)" }), "medium");
assert.equal(autoPreset({ cores: 8, renderer: "ANGLE (Intel, Intel(R) Iris(R) Xe Graphics Direct3D11)" }), "medium");
assert.equal(autoPreset({ cores: 4, renderer: "ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11)" }), "low");
assert.equal(resolvePreset("high", {}).id, "high");
assert.equal(resolvePreset("auto", { software: true }).id, "low");
assert.equal(resolvePreset("bogus", { cores: 8 }).id, "medium");
for (const p of Object.values(PRESETS)) {
  assert.ok(p.maxPixelRatio <= 1.5, `${p.id}: device pixel ratio cap 1.5`);
  assert.ok(!(p.fxaa && p.msaa > 1), `${p.id}: one anti-aliasing method, not MSAA + FXAA`);
  assert.equal(p.ssao, false, `${p.id}: SSAO stays off`);
}
assert.ok(PRESETS.medium.maxPixelRatio <= 1.25 && !PRESETS.medium.dof && !PRESETS.medium.mirror, "medium skips the expensive effects");
assert.ok(PRESETS.medium.bloomScale <= 0.25, "medium bloom on a quarter-size target");

console.log("gate.selftest: ok");
