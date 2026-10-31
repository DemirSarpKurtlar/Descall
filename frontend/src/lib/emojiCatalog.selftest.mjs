import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { EMOJI_CATEGORIES, searchEmojis, foldEmojiQuery, loadRecentEmojis, pushRecentEmoji } from "./emojiCatalog.js";

assert.ok(EMOJI_CATEGORIES.length >= 8);
for (const c of EMOJI_CATEGORIES) {
  assert.ok(c.emojis.length > 10, c.id);
  assert.equal(c.emojis.length, c.entries.length);
  for (const e of c.entries) assert.ok(e.emoji && e.keywords, `${c.id}: ${e.emoji}`);
}
assert.equal(foldEmojiQuery("GÜLÜŞ"), "gulus");
// Keywords per locale: English is the base, Turkish adds its own words.
const heart = EMOJI_CATEGORIES.flatMap((c) => c.entries).find((e) => e.emoji === "❤️");
assert.equal(heart.keywordsByLocale.en, "red heart love");
assert.equal(heart.keywordsByLocale.tr, "kalp kırmızı aşk");
assert.ok(searchEmojis("kalp").includes("❤️"));
assert.ok(searchEmojis("heart").includes("❤️"));
assert.ok(searchEmojis("gul").includes("😄"));
assert.ok(searchEmojis("thumbs up").includes("👍"));
assert.deepEqual(searchEmojis("   "), []);
assert.deepEqual(searchEmojis("zzqqxx"), []);

const mem = new Map();
const st = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
assert.deepEqual(loadRecentEmojis(st), []);
pushRecentEmoji("🔥", st); pushRecentEmoji("👍", st); pushRecentEmoji("🔥", st);
assert.deepEqual(loadRecentEmojis(st), ["🔥", "👍"]);
for (let i = 0; i < 40; i++) pushRecentEmoji(String(i), st);
assert.equal(loadRecentEmojis(st).length, 24);

// iOS "More reactions" opens the full sheet and never the cramped inline grid.
const list = readFileSync(new URL("../components/chat/MessageList.jsx", import.meta.url), "utf8");
assert.doesNotMatch(list, /g-msg-picker/);
assert.match(list, /setEmojiSheetOpen\(true\)/);
assert.match(list, /<EmojiPickerSheet/);
const sheet = readFileSync(new URL("../components/chat/EmojiPickerSheet.jsx", import.meta.url), "utf8");
assert.match(sheet, /SPRINGS\.sheet/);
assert.match(sheet, /emoji-sheet-grabber/);
assert.match(sheet, /useDragControls/);
console.log("emojiCatalog selftest ok");
