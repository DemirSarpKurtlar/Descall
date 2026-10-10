// Glass reply preview is a strip above the composer capsule (device bug, 2.9.174).
// Edit stays inline in the bubble — it does not use this bar.
// Run: node frontend/src/lib/composerReplyStrip.selftest.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const composer = readFileSync(join(root, "components/chat/MessageComposer.jsx"), "utf8");
const list = readFileSync(join(root, "components/chat/MessageList.jsx"), "utf8");
const bubble = readFileSync(join(root, "components/chat/MessageBubble.jsx"), "utf8");
const chat = readFileSync(join(root, "styles/glass/chat.css"), "utf8");
const polish = readFileSync(join(root, "styles/ui-polish.css"), "utf8");

const replyAt = composer.indexOf('className="composer-reply-bar"');
const rowAt = composer.indexOf('className="composer-row"');
const rightAt = composer.indexOf('className="composer-right"');
assert.ok(replyAt > 0 && rowAt > replyAt && rightAt > rowAt, "reply strip is a sibling above the capsule row");
assert.ok(composer.includes("framerSpring(SPRINGS.default)"), "reply strip uses the standard spring");
assert.ok(composer.includes("REDUCED_MOTION_FADE"), "reduced motion fades the strip");
assert.ok(composer.includes("onPointerDown={keepComposerFocus}"), "cancel does not blur the field");
assert.ok(composer.includes("keepComposerFocus = (event) => {\n    event.preventDefault();"), "pointer down keeps the keyboard");
assert.ok(!composer.includes("blur()"), "composer never blurs the field when the strip changes");
assert.ok(!composer.includes("msg-edit-box"), "edit mode is not this bar");

assert.ok(list.includes('className="msg-edit-box"'), "message edit stays inline");
assert.ok(bubble.includes('className="msg-edit-box"'), "bubble edit stays inline");
assert.ok(!list.includes("composer-reply-bar") && !bubble.includes("composer-reply-bar"), "edit does not render the reply strip");

assert.ok(polish.includes(".composer-row {\n  display: flex;"), "non-glass row stays a normal flex line");

for (const piece of [
  "flex-direction: column",
  ".composer-row {\n  display: flex;\n  align-items: center;",
  "height: 52px;",
  "position: relative;",
  ".composer-reply-bar {\n  align-items: center;",
  "text-overflow: ellipsis;",
  "white-space: nowrap;",
  ".composer-reply-bar .composer-reply-clear",
  "padding-bottom: calc(var(--g-bar-bottom) + 142px)",
]) {
  assert.ok(chat.includes(piece), `glass chat.css missing ${piece.split("\n")[0]}`);
}

const replyRule = chat.slice(chat.indexOf("html.glass-ui .app-root.g-shell .composer-reply-bar {"));
assert.ok(replyRule.startsWith("html.glass-ui"), "reply strip rule is glass-scoped");
assert.ok(!/^\.composer-reply-bar/m.test(chat), "chat.css does not restyle the reply bar outside glass");

console.log("composerReplyStrip.selftest ok");
