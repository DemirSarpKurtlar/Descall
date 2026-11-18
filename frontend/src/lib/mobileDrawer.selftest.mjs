/**
 * Run: node frontend/src/lib/mobileDrawer.selftest.mjs
 * A chat opened from a push tap / deep link / reload closes the phone list
 * drawer (AppLayout), so the chat is never hidden under the list.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { conversationKey, shouldCloseDrawerForConversation } from "./mobileDrawer.js";

assert.equal(conversationKey({}), "");
assert.equal(conversationKey({ dm: { id: "u1" } }), "dm:u1");
assert.equal(conversationKey({ group: { id: "g1" } }), "group:g1");
assert.equal(conversationKey({ channel: { id: "c1", type: "text" } }), "channel:c1");
assert.equal(conversationKey({ channel: { id: "c0", type: "category" } }), "");
assert.equal(conversationKey({ dm: { id: "u1" }, channel: { id: "c1" } }), "dm:u1");
assert.equal(conversationKey({ dm: { username: "x" } }), "");

// Cold start: the list opens first, then the routed chat arrives.
assert.equal(shouldCloseDrawerForConversation("", "dm:u1"), true);
// Push tap / switch to another chat.
assert.equal(shouldCloseDrawerForConversation("dm:u1", "group:g1"), true);
// Same chat re-rendered (fresh object, same id): keep a hand-opened drawer.
assert.equal(shouldCloseDrawerForConversation("dm:u1", "dm:u1"), false);
// Back to the list.
assert.equal(shouldCloseDrawerForConversation("dm:u1", ""), false);
assert.equal(shouldCloseDrawerForConversation(undefined, ""), false);

// Wiring: AppLayout closes the drawer through this helper.
const here = dirname(fileURLToPath(import.meta.url));
const layout = readFileSync(join(here, "../components/layout/AppLayout.jsx"), "utf8");
assert.match(layout, /shouldCloseDrawerForConversation\(/);
assert.match(layout, /conversationKey\(/);

console.log("mobileDrawer selftest OK");
