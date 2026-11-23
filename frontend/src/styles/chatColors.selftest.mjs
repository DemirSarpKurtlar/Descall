// Chat color pass (Nov 2026): readable ink in bubbles, accent-following
// selections, light-theme coverage of the emoji sheet / search / menus,
// one presence palette on iPhone glass.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const bubble = read("./default-bubble-glass.css");
const picker = read("./reaction-picker.css");
const pill = read("./reaction-pill.css");
const search = read("./message-search.css");
const glassChat = read("./glass/chat.css");
const glassSocial = read("./glass/social.css");
const sheet = read("../components/chat/EmojiPickerSheet.css");
const groupInfo = read("../components/groups/GroupInfoSheet.css");

// Bubble ink
assert.match(bubble, /\.message-bubble:not\(\.own\):not\(\.cosmetic-chat-bubble\) \.msg-link,[^{]*\.msg-mention \{\s*color: var\(--g-brand-hi\);/s, "incoming links and mentions use the readable accent ink");
assert.match(bubble, /\.message-bubble\.own:not\(\.cosmetic-chat-bubble\) \.msg-inline-code \{\s*color: #fff;\s*background: rgba\(255, 255, 255, 0\.2\);/, "inline code in an own bubble is a white-on-tint chip");
assert.match(bubble, /\.message-bubble\.own:not\(\.cosmetic-chat-bubble\) \.msg-code-block code \{\s*color: #fff;/, "code block text in an own bubble stays white in the light theme");

// Accent-following selections (no fixed blue that ignores themes / custom accents)
assert.ok(!/rgba\(10, 132, 255/.test(picker), "hover bar active state uses the accent, not iOS system blue");
assert.ok(!/rgba\(56, 70, 130/.test(pill), "own reaction pill follows the accent");
assert.ok(!/rgba\(226, 233, 255/.test(pill), "own reaction pill (light) follows the accent");
assert.match(glassChat, /\.reaction-chip\.reaction-mine \{\s*background: rgba\(var\(--g-brand-rgb/, "glass own reaction chip follows the accent");
assert.ok(!/#8a5cf6/i.test(glassChat) && !/#8a5cf6/i.test(groupInfo), "no blue-to-purple default group icon ramp");

// Red only for destructive meaning, readable in light
assert.match(glassChat, /\.header-right \.icon-btn\.active \{\s*color: var\(--g-brand-hi/, "an open header panel (search, pins) is accent, not red");
assert.match(glassChat, /html\.glass-ui\[data-theme="light"\] \.app-root\.g-shell \.message-unread-sep/, "unread divider red is darkened for the light theme");
assert.match(picker, /:root\[data-theme="light"\] \.mhb-mi\.danger \{ color: var\(--danger-text/, "Delete keeps its red in the light hover menu");

// Light theme coverage
assert.ok(!/--text-primary|--text-secondary/.test(search), "search panel uses defined text tokens");
assert.ok(!/--text-primary/.test(sheet), "emoji sheet uses defined text tokens");
assert.match(sheet, /:is\(html\[data-theme="light"\], html\.theme-light\) :is\(\.emoji-sheet-cat, \.emoji-sheet-empty\)/, "emoji sheet labels are dark in the light theme");

// One presence palette on iPhone glass
for (const s of ["online", "idle", "dnd"]) {
  assert.match(glassSocial, new RegExp(`html\\.glass-ui \\.status-badge\\.status-${s} \\{ background: var\\(--g-`), `StatusBadge ${s} uses the glass presence color`);
}
console.log("chatColors selftest ok");
