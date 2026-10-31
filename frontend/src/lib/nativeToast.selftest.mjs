import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { presenceCapsuleArgs, capsuleOutcome, nativeToastSupported } from "./nativeToast.js";

// Copy comes from the i18n catalogs in the UI language: load them and use Turkish.
globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };
const { loadI18nCatalogs } = await import("../i18n/index.js");
const { setRuntimeLocale } = await import("../i18n/runtime.js");
await loadI18nCatalogs("tr");
setRuntimeLocale("tr");

// Node is not iOS: the web toast stays.
assert.equal(nativeToastSupported(), false);

const a = presenceCapsuleArgs({ name: "Mert", user: { id: "u1", avatarUrl: "https://cdn.descall.com/m.png" }, id: "x" });
assert.deepEqual(a, {
  id: "x", title: "Mert çevrimiçi", sub: "Az önce bağlandı", name: "Mert", seed: "u1",
  avatar: "https://cdn.descall.com/m.png", online: true, action: "Mesaj", duration: 3000,
});
setRuntimeLocale("en");
const en = presenceCapsuleArgs({ name: "Mert", user: { id: "u1" }, id: "x" });
setRuntimeLocale("tr");
assert.equal(en.title, "Mert is online");
assert.equal(en.sub, "Just connected");
assert.equal(en.action, "Message");
assert.equal(en.avatar, "", "no photo → letter avatar on the native side");
assert.equal(presenceCapsuleArgs({ name: "Mert", user: { id: "u1", avatarUrl: "http://x/m.png" } }).avatar, "", "http photo refused");
assert.equal(presenceCapsuleArgs({ name: "Mert", user: { id: "u1", avatarUrl: "data:text/html,x" } }).avatar, "");
assert.equal(presenceCapsuleArgs({ name: "Ece", user: null }).action, "", "no user id → no Mesaj");
assert.equal(presenceCapsuleArgs({ name: "Ece", user: null }).seed, "Ece");
assert.equal(presenceCapsuleArgs({ name: "", user: {} }), null);
assert.equal(presenceCapsuleArgs({ name: "Mert", user: { id: 7 } }).seed, "7", "numeric id stringified");

// Double tap / Mesaj open the DM through the notification-click path.
assert.deepEqual(capsuleOutcome("message", { userId: "u1", name: "Mert" }), {
  open: { type: "dm", conversationId: "u1", fromId: "u1", from: "Mert" }, done: true,
});
assert.equal(capsuleOutcome("double", { userId: "u1", name: "Mert" }).open.conversationId, "u1");
assert.deepEqual(capsuleOutcome("tap", { userId: "u1" }), { open: null, done: false });
assert.deepEqual(capsuleOutcome("expand", { userId: "u1" }), { open: null, done: false });
assert.deepEqual(capsuleOutcome("dismiss", { userId: "u1" }), { open: null, done: true });
assert.deepEqual(capsuleOutcome("timeout", { userId: "u1" }), { open: null, done: true });
assert.deepEqual(capsuleOutcome("message", { userId: "" }), { open: null, done: true });

// The plugin proxy is never used as a promise value (see nativeGlassTabBar 2.13.11).
const src = readFileSync(new URL("./nativeToast.js", import.meta.url), "utf8");
assert.doesNotMatch(src, /resolve\(\s*plugin\s*\)|return\s+plugin;\s*\n\s*}\s*\)/);
assert.match(src, /registerPlugin\("DescallToast"\)/);

// ToastContext routes presence toasts through the native capsule with a web fallback.
const ctx = readFileSync(new URL("../context/ToastContext.jsx", import.meta.url), "utf8");
assert.match(ctx, /showPresenceCapsule\(/);
assert.match(ctx, /nativeToastSupported\(\)/);
console.log("nativeToast selftest ok");
