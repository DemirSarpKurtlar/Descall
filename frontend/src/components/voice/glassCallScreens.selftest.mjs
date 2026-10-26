// 3.0.0 native glass call screens (#01 incoming, #02 control capsule, #09 iPad).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(here, p), "utf8");
const card = read("IncomingCallCard.jsx");
const overlay = read("../CallOverlay.jsx");
const glassCss = read("../../styles/glass/call.css");
const desktopCss = read("../../styles/glass-desktop/calls.css");
const tr = read("../../i18n/locales/tr.js");

// #01: blurred photo backdrop, name alone, optional Sessize al.
assert.ok(card.includes("g-incoming-backdrop"));
assert.ok(card.includes("glass && !isGroup ? name"), "glass DM shows the name on its own");
assert.ok(card.includes("onSilence"));
assert.ok(overlay.includes('audioManager.stop("incomingCall")'), "Sessize al stops only the ringtone");
assert.ok(/\.g-incoming \.incoming-call-avatar-wrap \.ui-avatar \{\s*border-radius: 50%;/.test(glassCss), "ring sits on the round photo, not the square box");
assert.ok(/"Silence": "Sessize al"/.test(tr));

// #02 / #09: the controls are one capsule and End is a separate circle.
const capsuleOpen = overlay.indexOf('className={glass ? "call-ctrl-capsule g-glass" : "call-ctrl-capsule"}');
const endBtn = overlay.indexOf('className={glass ? "g-cb is-end" : "is-end"}');
assert.ok(capsuleOpen > 0 && endBtn > capsuleOpen);
assert.ok(/<\/div>\s*<CircleBtn\s*$/.test(overlay.slice(capsuleOpen, endBtn)), "End sits outside the capsule");
assert.ok(overlay.includes('glass || glassDesktop ? undefined : { display: "contents" }'), "classic layout unchanged");
assert.ok(glassCss.includes(".call-control-bar.g-call-ctrl > .call-ctrl-capsule"));
assert.ok(/\.g-cb\.is-end \{[^}]*border-radius: 50% !important;/.test(glassCss));
assert.ok(desktopCss.includes(".call-control-bar > .call-ctrl-capsule"));
const gdBar = desktopCss.slice(desktopCss.indexOf("html.glass-desktop .call-control-bar {"));
assert.ok(!gdBar.slice(0, gdBar.indexOf("}")).includes("translateX"), "iPad bar centred with left/right, no translateX");

console.log("glassCallScreens.selftest: ok");
