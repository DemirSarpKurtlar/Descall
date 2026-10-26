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
assert.ok(card.includes("look && !isGroup ? name"), "glass DM shows the name on its own");
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

// S14 iPad: the same glass language as #01 in a centred sheet (touch tablets only).
assert.ok(card.includes("const sheet = !glass && glassDesktop && isTouchTablet()"));
assert.ok(card.includes('"incoming-call-card gd-incoming"') && card.includes('"gd-incoming-sheet"'));
assert.ok(card.includes("(hover: none) and (pointer: coarse)"), "mouse desktops keep the banner");
const sheetCss = desktopCss.slice(desktopCss.indexOf("html.glass-desktop .incoming-call-card.gd-incoming {"));
assert.ok(sheetCss.length > 0 && !sheetCss.slice(0, sheetCss.indexOf("}")).includes("translateX"), "sheet centred without translateX");
assert.ok(/\.gd-incoming \.incoming-call-avatar-wrap \.ui-avatar \{\s*border-radius: 50%;/.test(desktopCss), "iPad ring on the round photo");
assert.ok(desktopCss.includes(".gd-incoming .g-incoming-backdrop.has-photo"), "blurred caller photo backdrop on iPad");
assert.ok(/@media \(max-height: 860px\)[\s\S]*gd-incoming/.test(desktopCss), "landscape fit");

console.log("glassCallScreens.selftest: ok");
