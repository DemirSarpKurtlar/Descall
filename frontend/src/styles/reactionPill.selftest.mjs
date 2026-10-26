// Reactions hang off the bubble edge and never widen it (msg-16 regression).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const pill = read("./reaction-pill.css");
const glass = read("./glass/chat.css");
const list = read("../components/chat/MessageList.jsx");
const rx = read("../components/chat/MessageReactions.jsx");
const entry = read("../styles.css");

assert.ok(entry.includes("@import './styles/reaction-pill.css';"), "reaction-pill.css is imported");
assert.match(pill, /\.message-bubble > \.message-reactions \{[^}]*position: absolute;[^}]*top: calc\(100% - 6px\);/s, "the row is out of flow and hangs off the bottom edge");
assert.match(pill, /\.message-bubble\.has-reactions \{\s*margin-bottom: 20px;/, "the bubble makes room below for the pill");
assert.match(pill, /@media \(hover: none\) \{[^}]*\.reaction-add-wrapper \{\s*display: none;/s, "no always-on smiley on touch");
assert.match(pill, /\[data-theme="light"\][^{]*\.reaction-chip/, "light-theme pill");
assert.ok(!/\.message-reactions \{\s*margin-left: 46px;/.test(glass), "glass/chat.css no longer pushes the in-bubble row 46px right");
assert.ok(list.includes('reactions.length > 0 ? "has-reactions" : ""'), "bubble gets has-reactions");
assert.ok(rx.includes("burst?.emoji === emoji ? ` burst-chip-${burstKey}`"), "burst glow only while the burst plays");
console.log("reactionPill selftest ok");
