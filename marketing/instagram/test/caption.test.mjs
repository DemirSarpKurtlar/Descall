import { test } from "node:test";
import assert from "node:assert/strict";
import { CAPTION_CTA_LINE, buildCaption, captionHash } from "../lib/caption.mjs";
import { loadLibrary } from "../lib/library.mjs";
import { extractHashtags, hasEmoji } from "../lib/text.mjs";
import { makeScript, policy } from "./fixtures.mjs";

test("body, download line and hashtags are separate paragraphs", () => {
  const c = buildCaption(makeScript());
  const parts = c.split("\n\n");
  assert.equal(parts[0], "Gürültü engelleme varsayılan olarak açık.");
  assert.equal(parts[1], CAPTION_CTA_LINE);
  assert.equal(parts[2], "#descall #seslisohbet #mikrofon");
});

test("no second download line when the body already links descall.com", () => {
  const c = buildCaption(makeScript({ caption: "Hemen indir: descall.com" }));
  assert.equal(c.split("descall.com").length - 1, 1);
});

test("whitespace is normalised and duplicate hashtags dropped", () => {
  const c = buildCaption(makeScript({ caption: "  Bir\r\n\r\n\r\n\r\nİki  ", hashtags: ["#a1", "#a1", " #b2 "] }));
  assert.equal(c, `Bir\n\nİki\n\n${CAPTION_CTA_LINE}\n\n#a1 #b2`);
});

test("the hash ignores case, punctuation and spacing but not words", () => {
  assert.equal(captionHash("Merhaba, Dünya!"), captionHash("merhaba   dünya"));
  assert.notEqual(captionHash("Merhaba dünya"), captionHash("Merhaba Türkiye"));
});

test("every library caption fits Instagram: <= 2200 chars, 3-8 hashtags, no emoji, has descall.com", () => {
  for (const s of loadLibrary()) {
    const c = buildCaption(s);
    assert.ok(c.length <= policy.limits.maxCaptionChars, s.id);
    const n = extractHashtags(c).length;
    assert.ok(n >= 3 && n <= 8, `${s.id}: ${n} hashtags`);
    assert.ok(!hasEmoji(c), s.id);
    assert.match(c, /descall\.com/);
  }
});
