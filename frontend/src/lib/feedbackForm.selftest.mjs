// Run: node src/lib/feedbackForm.selftest.mjs
// 3.7.14 Geri bildirim A: form body, open detail, relative time + the window's wiring.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  KINDS, buildSubmitBody, canSubmit, emptyForm, feedbackOpenDetail, relTime, totalUnread,
} from "./feedbackForm.js";

const t = (k, v = {}) => k.replace(/\{(\w+)\}/g, (_, n) => v[n]);

assert.deepEqual(KINDS.map((k) => k.id), ["suggestion", "bug", "praise"]);
assert.equal(emptyForm("nope").kind, "suggestion");
assert.equal(emptyForm("bug").includeDevice, true, "device info on by default");

let f = { ...emptyForm("bug"), text: "Ses gidiyor bazen", area: "voice", frequency: "always", rating: 4, likes: ["voice"],
  shots: [{ id: 1, url: "https://a/1.png" }, { id: 2, uploading: true }, { id: 3, url: "https://a/3.png", error: true }] };
assert.equal(canSubmit(f), false, "waits for uploads");
f = { ...f, shots: f.shots.filter((s) => !s.uploading) };
assert.equal(canSubmit(f), true);
let body = buildSubmitBody(f, { platform: "Windows", version: "3.7.14" });
assert.deepEqual(body, { kind: "bug", message: "Ses gidiyor bazen", includeDevice: true, attachments: ["https://a/1.png"], area: "voice", frequency: "always", platform: "Windows", appVersion: "3.7.14" },
  "bug: no rating / likes, failed upload dropped");
body = buildSubmitBody({ ...emptyForm("praise"), text: "Harika uygulama", rating: 5, likes: ["design", "x"], frequency: "always", includeDevice: false }, { platform: "Windows" });
assert.deepEqual(body, { kind: "praise", message: "Harika uygulama", includeDevice: false, attachments: [], rating: 5, likes: ["design"] }, "praise: stars + likes, no device");
assert.equal(canSubmit({ ...emptyForm(), text: "abcd" }), false, "min 5 characters");

assert.deepEqual(feedbackOpenDetail({}), { type: "suggestion", tab: "new", feedbackId: null });
assert.deepEqual(feedbackOpenDetail({ type: "bug", tab: "mine" }), { type: "bug", tab: "mine", feedbackId: null });
assert.deepEqual(feedbackOpenDetail({ feedbackId: 42 }), { type: "suggestion", tab: "mine", feedbackId: "42" });

const now = Date.parse("2026-10-31T12:00:00Z");
assert.equal(relTime("2026-10-31T11:59:40Z", t, now), "fbk.justNow");
assert.equal(relTime("2026-10-31T11:55:00Z", t, now), "fbk.minAgo");
assert.equal(relTime("2026-10-29T12:00:00Z", t, now), "fbk.dayAgo");
assert.equal(totalUnread([{ unread: 2 }, { unread: 0 }, {}]), 2);

// Wiring
const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const modal = read("../components/feedback/QuickFeedbackModal.jsx");
const css = read("../styles/feedback-a.css");
const app = read("../App.jsx");
const layout = read("../components/layout/AppLayout.jsx");
const tr = read("../i18n/locales/feedback.tr.js");
const en = read("../i18n/locales/feedback.en.js");
assert.match(modal, /createPortal\(/);
assert.match(modal, /className="feedback-overlay fbk-overlay"/);
assert.match(modal, /className="feedback-modal fbk"/);
assert.match(modal, /role="tablist"/);
assert.match(modal, /fbk\.tabMine/);
assert.match(modal, /replyMyFeedback\(openId, text\)/);
assert.match(modal, /role="switch"/, "device info is a switch, not a native checkbox");
assert.doesNotMatch(modal, /type="checkbox"/);
assert.doesNotMatch(modal, /[✓✔\u{1F300}-\u{1FAFF}]/u, "no emoji / check glyphs");
assert.match(modal, /descall:feedback-live/);
assert.match(app, /socket\.on\("feedback:reply", \(\{ text, feedbackId \} = \{\}\)/);
assert.match(app, /onOpen: feedbackId \? \(\) => openFeedbackModal\(\{ feedbackId, source: "toast" \}\)/);
assert.match(app, /type === "feedback-reply" && data\.feedbackId/);
assert.match(layout, /initialId=\{feedbackOpen\.id\}/);
assert.match(css, /:root\[data-theme="light"\] \.feedback-modal\.fbk/);
assert.match(css, /prefers-reduced-motion: reduce/);
assert.match(css, /@media \(max-width: 520px\)/);
const keys = (src) => [...src.matchAll(/^\s{2}(\w+):/gm)].map((m) => m[1]).sort();
assert.deepEqual(keys(tr), keys(en), "tr / en keys match");
for (const k of [...modal.matchAll(/t\("fbk\.(\w+)"/g)].map((m) => m[1])) assert.ok(keys(tr).includes(k), `missing fbk.${k}`);
console.log("feedbackForm.selftest ok");
