// node src/lib/messageSearch.selftest.mjs
// Mesaj araması (3.7.7): request shape per conversation, highlight split,
// ChatPanel wiring (server results, not the old loaded-page filter).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const rd = (f) => readFileSync(new URL(f, import.meta.url), "utf8");
const lib = rd("./messageSearch.js");
const src = lib.slice(lib.indexOf("export const SEARCH_MIN"), lib.indexOf("export function searchMessages"))
  + "\n" + lib.slice(lib.indexOf("/** Split a snippet"), lib.indexOf("/** Scroll to a loaded"));
const m = await import(`data:text/javascript,${encodeURIComponent(src)}`);

const dm = m.searchParams({ kind: "dm", withUserId: "p1" }, " oyun ");
assert.equal(dm.get("kind"), "dm");
assert.equal(dm.get("peerId"), "p1");
assert.equal(dm.get("q"), "oyun");
const g = m.searchParams({ kind: "group", groupId: "g1" }, "x", { before: "2026-10-01T00:00:00Z", from: "u1" });
assert.equal(g.get("groupId"), "g1");
assert.equal(g.get("before"), "2026-10-01T00:00:00Z");
assert.equal(g.get("from"), "u1");
const ch = m.searchParams({ kind: "server", serverId: "s1", channelId: "c1" }, "x");
assert.deepEqual([ch.get("kind"), ch.get("serverId"), ch.get("channelId")], ["channel", "s1", "c1"]);
assert.equal(m.searchParams({ kind: "server", serverId: "s1" }, "x"), null, "a channel needs both ids");
assert.equal(m.searchParams(null, "x"), null);
assert.deepEqual(m.snippetParts({ text: "Bu akşam oyun gecesi", start: 9, end: 13 }), ["Bu akşam ", "oyun", " gecesi"]);
assert.deepEqual(m.snippetParts({ text: "abc", start: -1, end: -1 }), ["abc", "", ""]);

// ChatPanel shows server results and no longer filters the loaded page.
const panel = rd("../components/layout/ChatPanel.jsx");
assert.match(panel, /<SearchResults\s+conversationKey=\{conversationKey\}/);
assert.ok(!/searchQuery: showSearch \? searchQuery/.test(panel));
const results = rd("../components/chat/search/SearchResults.jsx");
assert.match(results, /if \(jumpToLoadedMessage\(r\.id\)\) return;/, "a loaded hit scrolls, an older one opens in context");
assert.match(results, /setTimeout\(\(\) => \{[\s\S]*?\}, 300\)/, "debounced");

// Copy, no emoji, phone sizes, iPhone glass card under the fixed bar.
const tr = rd("../i18n/locales/tr.js");
const en = rd("../i18n/locales/en.js");
const sheet = rd("../components/chat/search/MessageContextSheet.jsx");
for (const key of new Set([...(results + sheet).matchAll(/t\("search\.(\w+)"/g)].map((x) => x[1]))) {
  assert.ok(new RegExp(`"search": \\{[\\s\\S]*?"${key}":`).test(tr), `tr search.${key}`);
  assert.ok(new RegExp(`"search": \\{[\\s\\S]*?"${key}":`).test(en), `en search.${key}`);
}
assert.ok(![...results + sheet].some((c) => (c.codePointAt(0) >= 0x1f300 && c.codePointAt(0) <= 0x1faff) || (c.codePointAt(0) >= 0x2600 && c.codePointAt(0) <= 0x27bf)), "no emoji");
assert.match(sheet, /<OverlayPortal>/);
const css = rd("../styles/message-search.css");
assert.match(css, /@media \(max-width: 720px\)[\s\S]*height: 44px/);
const glass = rd("../styles/glass/chat.css");
assert.match(glass, /html\.glass-ui \.app-root\.g-shell\.in-conversation \.msr \{\s*position: fixed;\s*top: calc\(var\(--g-conv-top\) \+ 44px \+ 8px\);/);
console.log("messageSearch.selftest: ok");
