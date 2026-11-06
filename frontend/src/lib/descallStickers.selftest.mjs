// Selftest: Descall logo emoji and stickers (messaging phase 4).
//   node frontend/src/lib/descallStickers.selftest.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DESCALL_EMOJI, DESCALL_STICKERS, MARK_PATH, stickerOf, splitLogoEmoji, stickerPreviewText, stickerSvg,
} from "./descallStickers.js";

const here = dirname(fileURLToPath(import.meta.url));

// Built from the real Descall mark (public/brand/descall-symbol.svg), brand blue.
const symbol = readFileSync(join(here, "../../public/brand/descall-symbol.svg"), "utf8");
assert.ok(symbol.includes(MARK_PATH), "the mark path is the brand symbol's path");
assert.ok(symbol.includes('fill="#587AF5"'));

// The set: 6 logo emoji, 8 stickers, unique ids and tokens, every image a self-contained SVG.
assert.equal(DESCALL_EMOJI.length, 6);
assert.equal(DESCALL_STICKERS.length, 8);
const tokens = [...DESCALL_EMOJI, ...DESCALL_STICKERS].map((x) => x.token);
assert.equal(new Set(tokens).size, tokens.length);
for (const item of [...DESCALL_EMOJI, ...DESCALL_STICKERS]) {
  assert.ok(item.src.startsWith("data:image/svg+xml;charset=utf-8,"), item.id);
  const raw = stickerSvg(item.id);
  assert.ok(raw.startsWith('<svg xmlns="http://www.w3.org/2000/svg"'), item.id);
  assert.ok(raw.includes(MARK_PATH) || item.id === "ok", `${item.id} carries the Descall mark`);
  assert.ok(!/<(script|image|use|foreignObject|style)\b|href=|url\((?!#)/i.test(raw), `${item.id}: nothing external or scripted`);
  // Only brand blues and white.
  for (const c of raw.match(/#[0-9A-Fa-f]{6}/g) || []) assert.ok(["#587AF5", "#3E5BD8", "#8FA7FF", "#DCE4FF", "#FFFFFF"].includes(c.toUpperCase()), `${item.id}: ${c}`);
  assert.ok(item.label.startsWith("msg4.stickers."));
}
assert.ok(stickerSvg("ok").includes("#587AF5"));

// A sticker is the whole message; anything else is text.
assert.equal(stickerOf(":ds-sticker-party:").id, "party");
assert.equal(stickerOf("  :ds-sticker-love:\n").id, "love");
assert.equal(stickerOf("bak :ds-sticker-party:"), null);
assert.equal(stickerOf(":ds-sticker-nope:"), null);
assert.equal(stickerOf(null), null);

// Inline emoji split.
assert.deepEqual(splitLogoEmoji("selam"), [{ text: "selam" }]);
const parts = splitLogoEmoji("GG :ds-gg: herkes :descall:");
assert.deepEqual(parts.map((p) => p.text ?? p.emoji.id), ["GG ", "ds-gg", " herkes ", "descall"]);
assert.deepEqual(splitLogoEmoji(":ds-unknown:"), [{ text: ":ds-unknown:" }]);

// Previews read as words.
const t = (k) => ({ "msg4.stickers.preview": "Çıkartma", "msg4.stickers.emoji.ds-love": "Descall sevgi" }[k] || k);
assert.equal(stickerPreviewText(":ds-sticker-ok:", t), "Çıkartma");
assert.equal(stickerPreviewText("çok iyi :ds-love:", t), "çok iyi Descall sevgi");
assert.equal(stickerPreviewText("düz metin", t), "düz metin");

// Wiring: bubbles, inline text, picker, list previews and notifications.
const list = readFileSync(join(here, "../components/chat/MessageList.jsx"), "utf8");
assert.ok(list.includes('<img className="msg-sticker" src={sticker.src}'));
assert.ok(list.includes('${sticker ? "has-sticker" : ""}'));
assert.ok(readFileSync(join(here, "../components/chat/MessageContent.jsx"), "utf8").includes('className="msg-logo-emoji"'));
const composer = readFileSync(join(here, "../components/chat/MessageComposer.jsx"), "utf8");
assert.ok(composer.includes('data-testid="ds-picker"') && composer.includes("onSend?.(withReply(st.token));"));
assert.ok(readFileSync(join(here, "./listPreview.js"), "utf8").includes("stripPreviewMarkdown(stickerPreviewText(body, t))"));
assert.ok(readFileSync(join(here, "./notificationService.js"), "utf8").includes("stickerPreviewText(text"));
const css = readFileSync(join(here, "../styles/messaging-phase4.css"), "utf8");
assert.ok(css.includes(":is(html, html.glass-ui .app-root.g-shell, html.glass-desktop .app-root) .message-bubble.has-sticker.has-sticker.has-sticker.has-sticker"), "the sticker bubble beats the glass bubble fill");

console.log("descallStickers selftest OK");
