import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  MESSAGE_MENU_LONG_PRESS_MS,
  liftMediaBox,
  messageMenuOpensOnTap,
  pressToActivate,
  visualMediaPreview,
} from "./glassMessageMenu.js";

assert.equal(messageMenuOpensOnTap(false), true);
assert.equal(messageMenuOpensOnTap(true), false);
assert.ok(MESSAGE_MENU_LONG_PRESS_MS >= 350 && MESSAGE_MENU_LONG_PRESS_MS <= 600);

function click() {
  return {
    defaulted: false,
    stopped: false,
    preventDefault() { this.defaulted = true; },
    stopPropagation() { this.stopped = true; },
  };
}

const ran = [];
const row = pressToActivate(() => ran.push("edit"));
const leaked = click();
row.onClick(leaked);
assert.equal(ran.length, 0);
assert.equal(leaked.defaulted, true);
assert.equal(leaked.stopped, true);

row.onPointerDown({ button: 0 });
row.onClick(click());
assert.deepEqual(ran, ["edit"]);

row.onClick(click());
assert.equal(ran.length, 1);

const right = pressToActivate(() => ran.push("right"));
right.onPointerDown({ button: 2 });
right.onClick(click());
assert.equal(ran.length, 1);

assert.equal(visualMediaPreview({ mediaUrl: "https://cdn.example/a.jpg", mediaType: "image" })?.src, "https://cdn.example/a.jpg");
assert.equal(visualMediaPreview({ mediaUrl: "https://cdn.example/a.jpg", mediaType: "image" })?.isGif, false);
assert.equal(visualMediaPreview({ mediaUrl: "https://media.giphy.com/x", mediaType: "gif" })?.isGif, true);
assert.equal(
  visualMediaPreview({ mediaUrl: "https://cdn.example/sign/abc?token=1", mediaType: "image" })?.src,
  "https://cdn.example/sign/abc?token=1"
);
assert.equal(
  visualMediaPreview({ mediaUrl: "https://cdn.example/file.bin", mediaType: "file", originalName: "shot.png" })?.src,
  "https://cdn.example/file.bin"
);
assert.equal(visualMediaPreview({ mediaUrl: "https://cdn.example/notes.pdf", mediaType: "document" }), null);
assert.equal(visualMediaPreview({ mediaUrl: "", mediaType: "image" }), null);
assert.deepEqual(liftMediaBox({ width: 180, height: 120 }, { width: 200 }), { width: 180, height: 120 });
assert.equal(liftMediaBox({ width: 0, height: 0 }, { width: 220 }).width >= 160, true);

const list = readFileSync(new URL("../components/chat/MessageList.jsx", import.meta.url), "utf8");
const chatCss = readFileSync(new URL("../styles/glass/chat.css", import.meta.url), "utf8");

assert.match(list, /preview=\{mediaPreview\}/);
assert.match(list, /visualMediaPreview\(message\)/);
assert.match(list, /img\.message-image, \.message-media img/);
assert.match(list, /liftMediaBox/);
assert.match(list, /width: shot\.width, height: shot\.height/);
assert.match(list, /g-lift-media/);
assert.match(list, /preview\?\.src/);
assert.match(list, /caption \? <div className=\{`g-lift-bub/);
assert.match(list, /fromMedia: true/);
assert.match(list, /suppressMediaClickUntil/);
assert.match(list, /beginMenuPress\(e, \{ pressed: true \}\)/);
assert.doesNotMatch(list, /className=\{`g-lift-bub \$\{isOwn \? "own" : "other"\}`\}>\{text\}<\/div>/);

assert.match(chatCss, /html\.glass-ui \.g-lift-media \{/);
assert.match(chatCss, /html\.glass-ui \.g-lift-media img \{[\s\S]*width: 100%;/);
assert.match(chatCss, /html\.glass-ui \.g-lift-bub:empty/);
assert.match(chatCss, /html\.glass-ui \.message-bubble\.menu-open \{\s*visibility: hidden/);
assert.match(chatCss, /max-height: 240px;/);

console.log("glassMessageMenu.selftest ok");
