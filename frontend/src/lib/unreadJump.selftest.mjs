// Selftest: jump to the first unread (messaging phase 4).
//   node frontend/src/lib/unreadJump.selftest.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { separatorAbove, jumpTarget, headerOverlap, pillTopFor, JUMP_UNREAD_EVENT } from "./unreadJump.js";

// The separator counts as "above" only while all of it is hidden under the header.
assert.equal(separatorAbove({ sepBottom: 100, scrollerTop: 0, headerSpace: 120 }), true);
assert.equal(separatorAbove({ sepBottom: 130, scrollerTop: 0, headerSpace: 120 }), false, "partly visible is seen");
assert.equal(separatorAbove({ sepBottom: -400, scrollerTop: 60 }), true);
assert.equal(separatorAbove({ sepBottom: NaN, scrollerTop: 0 }), false);

// The jump puts the separator just under the header.
assert.equal(jumpTarget({ scrollTop: 2000, sepTop: -500, scrollerTop: 100, headerSpace: 80, gap: 8 }), 2000 - 600 - 88);
assert.equal(jumpTarget({ scrollTop: 10, sepTop: 0, scrollerTop: 100, headerSpace: 80 }), 0, "never negative");

// Header overlap (phone glass header floats over the list) and the pill row position.
assert.equal(headerOverlap({ bottom: 56 }, { top: 0 }), 56);
assert.equal(headerOverlap({ bottom: 40 }, { top: 60 }), 0, "a header above the list overlaps nothing");
assert.equal(pillTopFor({ headerBottom: 128, hostTop: 0 }), 136);
assert.equal(pillTopFor({ headerBottom: 160, hostTop: 100, gap: 10 }), 70);
assert.equal(pillTopFor({}), 8);

// Wiring in the message list: separator ref, pill on the chat panel, shortcut event.
const here = dirname(fileURLToPath(import.meta.url));
const list = readFileSync(join(here, "../components/chat/MessageList.jsx"), "utf8");
assert.ok(list.includes('ref={unreadSepRef} className="message-unread-sep"'));
assert.ok(list.includes("pinRef.current?.suspendPin?.(1600)"), "the jump suspends pin-to-bottom so it is not pulled back down");
assert.ok(/createPortal\(\s*<div className="msg-unread-dock"/.test(list), "pill row lives on the chat panel (above the phone header fade)");
assert.ok(list.includes("window.addEventListener(JUMP_UNREAD_EVENT, onJump)"));
assert.ok(list.includes('t("msg4.unread.pill", { count: unreadCount })'));
assert.equal(JUMP_UNREAD_EVENT, "descall:jump-unread");
const css = readFileSync(join(here, "../styles/messaging-phase4.css"), "utf8");
assert.ok(/\.main-panel > \.msg-unread-dock \{[^}]*z-index: 46;/.test(css), "pill row paints above the phone scroll-edge fade (z 45)");
assert.ok(!/font-size:\s*\d+px/.test(css), "type scale tokens only");

console.log("unreadJump selftest OK");
