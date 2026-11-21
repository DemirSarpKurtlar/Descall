// node src/lib/memoStableProps.selftest.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { propsEqualWithChildren, sameChildren } from "./memoStableProps.js";

function Row() {
  return null;
}
const fn = () => {};

// Data props: shallow compare, children element by type, key and props.
assert.equal(propsEqualWithChildren({ a: 1, b: fn }, { a: 1, b: fn }), true);
assert.equal(propsEqualWithChildren({ a: 1 }, { a: 2 }), false);
assert.equal(propsEqualWithChildren({ a: 1 }, { a: 1, extra: undefined }), false);
assert.equal(
  propsEqualWithChildren(
    { a: 1, children: createElement(Row, { messages: [], onReply: fn }) },
    { a: 1, children: createElement(Row, { messages: [], onReply: fn }) },
  ),
  false,
  "a new messages array is a change",
);
const messages = [];
assert.equal(
  sameChildren(createElement(Row, { messages, onReply: fn }), createElement(Row, { messages, onReply: fn })),
  true,
);
assert.equal(sameChildren(createElement(Row, { key: "a" }), createElement(Row, { key: "b" })), false);
assert.equal(sameChildren("text", "text"), true);

// Wiring: App's layout, the rail and the closed-by-default modals use it.
const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
assert.match(read("../App.jsx"), /const AppLayout = memoStableProps\(AppLayoutView, "AppLayout"\)/);
assert.match(read("../components/layout/NavigationRail.jsx"), /export default memoStableProps\(NavigationRail/);
assert.match(read("../components/social/ReportUserModal.jsx"), /export default memoStableProps\(ReportUserModal/);
assert.match(read("../components/announcements/AnnouncementsSheet.jsx"), /export default memoStableProps\(AnnouncementsSheet/);

// MessageList roving focus runs on list changes only, not after every render.
assert.match(read("../components/chat/MessageList.jsx"), /newest\.tabIndex = 0;\n  \}, \[groupedMessages, revealedBlocked, loading\]\);/);

console.log("memoStableProps selftest ok");
