import assert from "node:assert/strict";
import { decideDeferredApply as d, updateChipKey, setActivityFlag, getActivityBusy, subscribeActivityBusy, resetActivityForTests, USER_IDLE_MS } from "./updateTiming.js";
import { readFileSync } from "node:fs";

assert.equal(USER_IDLE_MS, 120000);
assert.deepEqual(d({ voiceBusy: true, hidden: true, idleMs: 1e9 }), { action: "wait", reason: "voice-busy" });
assert.deepEqual(d({ activityBusy: true, hidden: true }), { action: "wait", reason: "user-busy" });
assert.equal(d({ voiceBusy: true, explicit: true }).action, "apply");
assert.deepEqual(d({ hidden: true }), { action: "apply", reason: "hidden" });
assert.deepEqual(d({ idleMs: USER_IDLE_MS }), { action: "apply", reason: "user-idle" });
assert.deepEqual(d({ idleMs: USER_IDLE_MS - 1 }), { action: "wait", reason: "user-active" });
assert.equal(updateChipKey({ voiceBusy: true, activityBusy: true }), "updateToast.readyAfterCall");
assert.equal(updateChipKey({ activityBusy: true }), "updateToast.readyAfterWork");
assert.equal(updateChipKey({}), "updateToast.readyIdle");

resetActivityForTests();
const seen = [];
const off = subscribeActivityBusy((b) => seen.push(b));
setActivityFlag("composer:a", true);
setActivityFlag("composer:b", true);
setActivityFlag("composer:a", false);
assert.equal(getActivityBusy(), true);
setActivityFlag("composer:b", false);
assert.equal(getActivityBusy(), false);
assert.deepEqual(seen, [true, false]);
off();

const tr = readFileSync(new URL("../i18n/locales/tr.js", import.meta.url), "utf8");
assert.ok(tr.includes('"readyAfterCall": "Güncelleme hazır, aramadan sonra yüklenecek"'));
assert.ok(tr.includes('"installNow": "Şimdi yükle"'));
const composer = readFileSync(new URL("../components/chat/MessageComposer.jsx", import.meta.url), "utf8");
assert.ok(composer.includes("setActivityFlag"));
const mle = readFileSync(new URL("./moduleLoadError.js", import.meta.url), "utf8");
assert.ok(mle.includes("decideDeferredApply"));
console.log("updateTiming selftest OK");
