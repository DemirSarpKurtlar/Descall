// node src/components/chat/cosmeticOwner.selftest.mjs
// Typing flares and reaction bursts are worn by the person who acts (bughunt Nov 2026):
//  - the typing bar wears the TYPING person's flare (lib/typingFlare.js), never the viewer's;
//  - my reaction burst plays when my reaction lands on any message, not only on my own ones.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const chat = readFileSync(new URL("../layout/ChatPanel.jsx", import.meta.url), "utf8");
assert.ok(!/flareKey=\{me\?\.equippedTypingFlare/.test(chat), "typing bar must not wear the viewer's own flare");
assert.ok(/typingFlareKey\(/.test(chat), "typing bar reads the typer's flare through typingFlareKey");

const list = readFileSync(new URL("./MessageList.jsx", import.meta.url), "utf8");
assert.ok(!/burstKey=\{isOwn \? reactionBurstKey : null\}/.test(list), "burst must not be limited to my own messages");
assert.ok(/reactionBurstKey=\{me\?\.equippedReactionBurst/.test(list), "burst is the reactor's (me) cosmetic");
console.log("[cosmeticOwner] ok");
