// node src/lib/onboarding.selftest.mjs
// "Başla panosu" client helpers: interests toggle, the ready first sentence, quick replies,
// sparkline paths, undo countdown, inactive cache, wiring of the app shell slots.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as m from "./onboarding.js";
import { ONB_TR } from "../i18n/locales/onb.tr.js";
import { ONB_EN } from "../i18n/locales/onb.en.js";

// A tiny translator over the real Turkish catalog ({name} style only).
const get = (cat, key) => key.split(".").reduce((o, k) => (o ? o[k] : undefined), cat);
const tr = (key, vars = {}) => {
  const raw = get({ onb: ONB_TR }, key);
  assert.equal(typeof raw, "string", `missing ${key}`);
  return raw.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ""));
};

// Interests: toggle keeps catalog order, unknown ids ignored, cap of 8.
assert.deepEqual(m.toggleInterest([], "music"), ["music"]);
assert.deepEqual(m.toggleInterest(["music"], "study"), ["study", "music"]);
assert.deepEqual(m.toggleInterest(["study", "music"], "study"), ["music"]);
assert.deepEqual(m.toggleInterest(["music"], "nope"), ["music"]);
assert.equal(m.toggleInterest(m.INTEREST_IDS.slice(0, 8), "gaming-other").length, 8);
assert.equal(m.INTEREST_IDS.length, 12);
assert.ok(!m.INTEREST_IDS.some((x) => /valorant/i.test(x)));
for (const id of m.INTEREST_IDS) {
  assert.ok(ONB_TR.interest[id] && ONB_EN.interest[id], `label for ${id}`);
  assert.ok(ONB_TR.intro[id] && ONB_TR.quick[id], `intro and quick reply for ${id}`);
}

// Ready first sentence: name, the server's own topic first, then one more interest.
assert.equal(
  m.introSentence(tr, { name: "Ece", category: "study", interests: ["study", "music"] }),
  "Selam, ben Ece. Ders çalışıyorum, birlikte çalışacak arkadaş arıyorum."
);
assert.equal(
  m.introSentence(tr, { name: "Ece", category: "gaming-minecraft", interests: ["study"] }),
  "Selam, ben Ece. Minecraft oynuyorum, birlikte oynayacak birilerini arıyorum.",
  "the room's own topic wins"
);
assert.equal(m.introSentence(tr, { name: "Ece", category: null, interests: ["music", "study"] }), "Selam, ben Ece. Müzik dinlemeyi seviyorum, önerilere açığım.", "else the first interest");
assert.equal(m.introSentence(tr, { name: "", interests: [] }), "Selam, ben yeni biri. Descall'da yeniyim, tanışmak isterim.");
assert.ok(m.introSentence(tr, { name: "x".repeat(400) }).length <= 300);

// Quick replies: hello + interests, always three.
const q = m.quickReplies(tr, { name: "Ece", interests: ["study", "music", "anime"] });
assert.deepEqual(q, ["Selam, ben Ece!", "YKS'ye hazırlanıyorum", "Lofi dinleyen var mı?"]);
assert.equal(m.quickReplies(tr, { name: "Ece", interests: [] }).length, 3);

// Sparkline.
assert.equal(m.sparkPath([1]), "");
const d = m.sparkPath([0, 5, 10], 100, 20);
assert.ok(d.startsWith("M2.0 18.0"), d);
assert.ok(d.endsWith("L98.0 2.0"), d);
assert.ok(m.sparkArea([0, 1], 50, 10).endsWith("Z"));
assert.equal(m.sparkPath([0, 0, 0], 10, 10), "M2.0 8.0 L5.0 8.0 L8.0 8.0", "all zero sits on the baseline");

// Avatars and initials are stable.
assert.equal(m.avatarTone("Zeynep"), m.avatarTone("Zeynep"));
assert.equal(m.serverInitials("Ders Kampı YKS 2027"), "DK");
assert.equal(m.serverInitials("lofi"), "LO");
assert.equal(m.serverInitials(""), "?");
assert.equal(m.initial("ışık"), "I");

// Undo countdown and ring.
assert.equal(m.undoLeft(1000, 1000), 10);
assert.equal(m.undoLeft(1000, 5500), 6);
assert.equal(m.undoLeft(1000, 11000), 0);
assert.equal(m.undoLeft(null), 0);
assert.equal(m.ringPercent(1, 5), 20);
assert.equal(m.ringPercent(9, 5), 100);
assert.equal(m.ringPercent(1, 0), 0);

// Crowd bars never collapse to nothing.
assert.deepEqual(m.crowdBars([{ v: 0 }, { v: 100, peak: true }]), [{ h: 8, peak: false }, { h: 100, peak: true }]);
assert.equal(m.crowdBars(null).length, 12);

// Inactive cache (old accounts stop asking).
const mem = new Map();
const store = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)) };
assert.equal(m.isKnownInactive(store, "u1"), false);
m.rememberInactive(store, "u1");
assert.equal(m.isKnownInactive(store, "u1"), true);
assert.equal(m.isKnownInactive(store, "u2"), false);
assert.equal(m.isKnownInactive({ getItem() { throw new Error("private"); } }, "u1"), false);

// Rich text split.
assert.deepEqual(m.splitRich(`a${m.RICH}b`), ["a", "b"]);

// Step subtitles.
assert.equal(m.stepSub(tr, { id: "interests" }, { interests: ["a", "b", "c"] }), "3 seçili");
assert.equal(m.stepSub(tr, { id: "join" }, { previewName: "Ders Kampı" }), "Ders Kampı önizleniyor");
assert.equal(m.stepSub(tr, { id: "first_message" }), "İlk Selam rozeti de var");

// App shell wiring: one slot per surface, the dashboard stays lazy.
const rd = (f) => readFileSync(new URL(f, import.meta.url), "utf8");
const chat = rd("../components/layout/ChatPanel.jsx");
const side = rd("../components/layout/ServerSidebar.jsx");
const app = rd("../App.jsx");
const slots = rd("../components/onboarding/slots.jsx");
assert.match(chat, /<OnbMainSlot isMobile=\{isMobile\} \/>/);
assert.match(chat, /<OnbJoinedSlot channelId=\{activeChannel\?\.id\} \/>/);
assert.match(side, /<OnbListSlot isMobile=\{isMobile\} \/>/);
assert.match(side, /<OnbFriendsSlot isMobile=\{isMobile\} \/>/);
assert.match(app, /<OnboardingProvider[\s\S]*<AppLayout[\s\S]*<\/AppLayout>\s*<\/OnboardingProvider>/);
assert.match(slots, /lazy\(\(\) => import\("\.\/StartDashboard"\)\)/);
assert.ok(!/from "\.\/StartDashboard"/.test(slots), "the dashboard is never imported eagerly");

console.log("onboarding.selftest: ok");
