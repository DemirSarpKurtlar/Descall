/**
 * Run: node frontend/src/lib/callGridLayout.selftest.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { dmRingingLabelKey, planCallGrid } from "./callGridLayout.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const solo = planCallGrid({ isDm: true, ringing: false, remoteSlot: false });
assert.equal(solo.count, 1);
assert.equal(solo.bucket, "is-n1");
assert.equal(solo.ringing, false);

const dialing = planCallGrid({ isDm: true, ringing: true, remoteSlot: false });
assert.equal(dialing.count, 2);
assert.equal(dialing.bucket, "is-n2");
assert.equal(dialing.ringing, true);

const connected = planCallGrid({ isDm: true, ringing: true, remoteSlot: true });
assert.equal(connected.count, 2);
assert.equal(connected.ringing, false, "a live remote replaces the placeholder");

const afterLeave = planCallGrid({ isDm: false, remoteCount: 0 });
assert.deepEqual(
  { count: afterLeave.count, bucket: afterLeave.bucket },
  { count: 1, bucket: "is-n1" },
  "group remote leave recenters the remaining self tile",
);

assert.equal(planCallGrid({ remoteCount: 1 }).bucket, "is-n2");
assert.equal(planCallGrid({ remoteCount: 2 }).bucket, "is-n4");
assert.equal(planCallGrid({ remoteCount: 3 }).bucket, "is-n4");
assert.equal(planCallGrid({ remoteCount: 4 }).bucket, "is-n6");
assert.equal(planCallGrid({ remoteCount: 5 }).bucket, "is-n6");
assert.equal(planCallGrid({ remoteCount: 8 }).bucket, "is-n9");

assert.equal(dmRingingLabelKey({ connectionQuality: "failed" }), "Waiting…");
assert.equal(dmRingingLabelKey({ calleeAnswering: true }), "Waiting…");
assert.equal(dmRingingLabelKey({ connectionQuality: "unknown" }), "Calling...");

const desktop = readFileSync(join(root, "styles/glass-desktop/calls.css"), "utf8");
assert.equal(desktop.includes("bottom: 116px"), false, "desktop DM grid must not pin self to the corner");
assert.equal(desktop.includes(":nth-child(1)"), false, "desktop DM grid must not absolute-position the first tile");

const phone = readFileSync(join(root, "styles/glass/call.css"), "utf8");
assert.equal(phone.includes(":first-child:not(:only-child)"), false, "phone DM grid must not keep a corner PiP");
assert.equal(phone.includes(":only-child"), false, "phone DM grid must not special-case a lone absolute tile");

const overlay = readFileSync(join(root, "components/CallOverlay.jsx"), "utf8");
assert.equal(overlay.includes('t("Raise hand")'), false, "raise hand control is removed");
assert.equal(overlay.includes("CallRingingTile"), true);
assert.equal(overlay.includes("planCallGrid"), true);

const tr = readFileSync(join(root, "i18n/locales/tr.js"), "utf8");
assert.match(tr, /"Waiting…": "Bekleniyor"/);
assert.match(tr, /"Calling\.\.\.": "Aranıyor…"/);

console.log("callGridLayout.selftest.mjs: ok");
