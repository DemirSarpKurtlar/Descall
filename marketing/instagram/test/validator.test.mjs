import { test } from "node:test";
import assert from "node:assert/strict";
import { loadLibrary } from "../lib/library.mjs";
import { RETIRED_TERMS, checkAgainstLog, loadScreenshotAllowlist, validateLibrary, validateScript } from "../lib/validator.mjs";
import { buildCaption, captionHash } from "../lib/caption.mjs";
import { buildTimeline } from "../lib/script.mjs";
import { compilePhrase, hasEmoji, wordCount } from "../lib/text.mjs";
import { makeScript, policy } from "./fixtures.mjs";

const screenshots = loadScreenshotAllowlist(policy);
const v = (s) => validateScript(s, { policy, screenshots });
const has = (errors, re) => errors.some((e) => re.test(e));

test("the shipped library is fully valid, has 30+ scripts and covers every theme", () => {
  const scripts = loadLibrary();
  const { results, valid } = validateLibrary(scripts, { policy, screenshots });
  const bad = results.filter((r) => r.errors.length);
  assert.deepEqual(bad, [], JSON.stringify(bad, null, 2));
  assert.ok(valid.length >= 30, `only ${valid.length} scripts`);
  for (const theme of Object.keys(policy.themes)) assert.ok(valid.some((s) => s.theme === theme), `no script for ${theme}`);
  for (const s of valid) {
    const t = buildTimeline(s).total;
    assert.ok(t >= 10 && t <= 30, `${s.id} lasts ${t}s`);
  }
});

test("a valid fixture passes", () => {
  assert.deepEqual(v(makeScript()), []);
});

test("emoji are rejected on screen, in visuals and in the caption", () => {
  assert.ok(hasEmoji("hey \u{1F525}"));
  assert.ok(hasEmoji("\u2764\uFE0F"));
  assert.ok(hasEmoji("\u{1F1F9}\u{1F1F7}"));
  assert.ok(!hasEmoji("Ctrl+Shift+M #descall 1080p %0-200 Alt+\u2191"));
  assert.ok(has(v(makeScript({ hook: { lines: ["Klavye \u{1F3AE} sesin"] } })), /hook.lines\[0\]: emoji/));
  assert.ok(has(v(makeScript({ scenes: [...makeScript().scenes.slice(0, 2), { lines: ["Tamam"], visual: { type: "chips", items: ["Oyun \u2705"] } }] })), /visual\[0\]: emoji/));
  assert.ok(has(v(makeScript({ caption: "Harika \u{1F680}" })), /caption: emoji/));
});

test("banned phrases: superlatives, disparaging words, pricing, legal topics", () => {
  assert.ok(has(v(makeScript({ caption: "Türkiye'nin en iyi sesli sohbet uygulaması." })), /en iyi/));
  assert.ok(has(v(makeScript({ hook: { lines: ["Gecikmesiz ses"] } })), /gecikmesiz/));
  assert.ok(has(v(makeScript({ caption: "Diğer uygulamalar berbattı." })), /berbat/));
  assert.ok(has(v(makeScript({ caption: "Rakiplerden daha hızlı." })), /daha hızlı/));
  assert.ok(has(v(makeScript({ caption: "Hemen satın al." })), /satın al/));
  assert.ok(has(v(makeScript({ caption: "VPN olmadan bağlan." })), /vpn/));
  assert.ok(has(v(makeScript({ caption: "Sınırsız grup." })), /sınırsız/));
  // Suffix and case handling.
  assert.ok(compilePhrase("kötü*").test("kötüdür"));
  assert.ok(!compilePhrase("dns").test("dnsx"));
  assert.ok(!compilePhrase("en iyi*").test("seni iyi"));
});

test("the retired game integration can never be mentioned", () => {
  for (const term of RETIRED_TERMS) {
    const word = term.replace("*", "");
    const errors = v(makeScript({ caption: `Akşam ${word.toUpperCase()} oynuyoruz.` }));
    assert.ok(has(errors, /retired game integration/), `${term} slipped through`);
  }
});

test("Discord is only named in the moving theme; iPhone not in release highlights", () => {
  const caption = "Discord sunucunu taşı.";
  assert.ok(has(v(makeScript({ caption })), /discord.*not allowed in theme ses-kalitesi/i));
  const moving = makeScript({ theme: "discord-tasima", caption });
  assert.deepEqual(v(moving), []);
  const rel = makeScript({ theme: "surum-notlari", caption: "iPhone'da da var.", sources: [{ claim: "x", file: "docs/release-notes/v3.7.39.md", match: "Taslaklar" }] });
  assert.ok(has(v(rel), /iphone.*surum-notlari/i));
});

test("word, character, line and scene limits", () => {
  assert.equal(wordCount("Bir iki üç dört beş altı yedi"), 7);
  assert.ok(has(v(makeScript({ hook: { lines: ["Bir iki üç dört beş altı yedi sekiz"] } })), /8 words/));
  assert.ok(has(v(makeScript({ hook: { lines: ["Çokuzunbirkelimeçokuzunbirkelimeçokuzun"] } })), /characters/));
  assert.ok(has(v(makeScript({ hook: { lines: ["a", "b", "c"] } })), /hook has 3 lines/));
  assert.ok(has(v(makeScript({ scenes: makeScript().scenes.slice(0, 2) })), /scenes: 2/));
  const many = Array.from({ length: 7 }, () => ({ lines: ["Kısa"] }));
  assert.ok(has(v(makeScript({ scenes: many })), /scenes: 7/));
  assert.ok(has(v(makeScript({ scenes: [{ lines: ["Bir", "İki", "Üç", "Dört"] }, ...makeScript().scenes.slice(1)] })), /4 lines/));
});

test("duration must stay within 10-30 s and the hook within 2.5 s", () => {
  const long = makeScript({ scenes: Array.from({ length: 6 }, (_, i) => ({ lines: [`Sahne ${i}`], duration: 4.6 })) });
  assert.ok(has(v(long), /duration .* outside 10-30s/));
  const short = makeScript({ hook: { lines: ["Kısa"], duration: 1.2 }, scenes: Array.from({ length: 3 }, () => ({ lines: ["a"], duration: 1.3 })), cta: { duration: 1.5 } });
  assert.ok(has(v(short), /outside 10-30s/));
  assert.ok(has(v(makeScript({ hook: { lines: ["Yavaş"], duration: 3 } })), /hook lasts 3s/));
});

test("caption: length and 3-8 hashtags", () => {
  assert.ok(has(v(makeScript({ hashtags: ["#descall"] })), /1 hashtags/));
  const nine = Array.from({ length: 9 }, (_, i) => `#etiket${i}`);
  assert.ok(has(v(makeScript({ hashtags: nine })), /9 hashtags/));
  assert.ok(has(v(makeScript({ caption: "a".repeat(2200) })), /caption is \d+ characters/));
  assert.ok(has(v(makeScript({ hashtags: ["#descall", "#descall", "#ses"] })), /duplicates/));
  assert.ok(has(v(makeScript({ hashtags: ["descall", "#a b", "#ok"] })), /malformed/));
});

test("claims need a real repo file that contains the proof", () => {
  assert.ok(has(v(makeScript({ sources: [] })), /at least one claim/));
  assert.ok(has(v(makeScript({ sources: [{ claim: "x", file: "frontend/src/lib/nope.js", match: "x" }] })), /does not exist/));
  assert.ok(has(v(makeScript({ sources: [{ claim: "x", file: "frontend/src/lib/voiceProfile.js", match: "teleportation" }] })), /does not contain/));
  assert.ok(has(v(makeScript({ sources: [{ claim: "x", file: "../secrets.txt", match: "abc" }] })), /repo-relative/));
  assert.ok(has(v(makeScript({ sources: [{ claim: "x", file: "README.md", match: "Descall" }] })), /outside the source roots/));
  assert.ok(has(v(makeScript({ sources: [{ claim: "x", file: "frontend/src/lib/voiceProfile.js", match: "" }] })), /too short/));
});

test("screenshots must be allowlisted, and the iPhone one stays out of restricted themes", () => {
  const scenes = [...makeScript().scenes.slice(0, 2), { lines: ["Bak"], visual: { type: "screenshot", ref: "random-shot" } }];
  assert.ok(has(v(makeScript({ scenes })), /not in the screenshot allowlist/));
  const ok = [...makeScript().scenes.slice(0, 2), { lines: ["Bak"], visual: { type: "screenshot", ref: "servers-ios" } }];
  assert.deepEqual(v(makeScript({ scenes: ok })), []);
  const plus = makeScript({ theme: "descall-plus", scenes: ok });
  assert.ok(has(v(plus), /shows the iPhone app/));
});

test("unknown theme, bad id and bad visual type are rejected", () => {
  assert.ok(has(v(makeScript({ theme: "nope" })), /unknown theme/));
  assert.ok(has(v(makeScript({ id: "Bad ID" })), /kebab-case/));
  const scenes = [{ lines: ["a"], visual: { type: "hologram" } }, ...makeScript().scenes.slice(1)];
  assert.ok(has(v(makeScript({ scenes })), /hologram/));
});

test("duplicates of the last 30 posts and of the library are rejected", () => {
  const s = makeScript();
  const entry = { scriptId: "other", date: "2026-11-01", captionHash: captionHash(buildCaption(s)), hook: "Klavye sesin gitmesin" };
  const errors = checkAgainstLog(s, [entry], policy);
  assert.ok(has(errors, /caption matches/) && has(errors, /hook matches/));
  assert.ok(has(checkAgainstLog(s, [{ scriptId: "test-script", date: "2025-01-01" }], policy), /already posted/));
  // Outside the 30-post window, a caption/hook match no longer blocks (the id rule still does).
  const old = [entry, ...Array.from({ length: 30 }, (_, i) => ({ scriptId: `x${i}`, date: "2026-11-02" }))];
  assert.deepEqual(checkAgainstLog(s, old, policy), []);
  // Instagram's own recent captions are the second guard.
  assert.ok(has(checkAgainstLog(s, [], policy, [buildCaption(s)]), /recent post on the Instagram account/));
  const lib = validateLibrary([makeScript(), makeScript({ id: "copy" })], { policy, screenshots });
  assert.ok(has(lib.results[1].errors, /duplicate hook/));
  assert.ok(has(lib.results[1].errors, /duplicate caption/));
});
