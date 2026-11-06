// Selftest: messaging keyboard shortcuts (messaging phase 4).
//   node frontend/src/lib/shortcuts.selftest.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  SHORTCUTS, RESERVED, BROWSER_KEYS, EXISTING, sameCombo, matchShortcut, allowedIn, typingTarget, keyCaps,
  shortcutSections, stepConversation,
} from "./shortcuts.js";

// No clash: with each other, with the app's own keys, with browser keys.
for (let i = 0; i < SHORTCUTS.length; i += 1) {
  for (let j = i + 1; j < SHORTCUTS.length; j += 1) assert.ok(!sameCombo(SHORTCUTS[i], SHORTCUTS[j]), `${SHORTCUTS[i].id} vs ${SHORTCUTS[j].id}`);
  for (const r of RESERVED) assert.ok(!sameCombo(SHORTCUTS[i], r), `${SHORTCUTS[i].id} clashes with an app shortcut`);
  for (const b of BROWSER_KEYS) assert.ok(!sameCombo(SHORTCUTS[i], b), `${SHORTCUTS[i].id} clashes with a browser key`);
}
// RESERVED really lists what the code uses (so the check above means something).
const here = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(here, p), "utf8");
assert.ok(read("./voiceProfile.js").includes('{ id: "mod+shift+m"') && read("./voiceProfile.js").includes('{ id: "alt+shift+m"'));
assert.ok(/k === "d" \|\| code === "KeyD"\) return "deafen"/.test(read("./userVoicePanel.js")));
assert.ok(/e\.shiftKey && !e\.altKey && String\(e\.key\)\.toLowerCase\(\) === "g"/.test(read("../premium/gaming/PremiumGamingHost.jsx")));
assert.ok(read("../../electron/main.cjs").includes("globalShortcut.register('CommandOrControl+Shift+I'"));
// Every existing keydown handler in the chat surface was looked at: the composer only
// takes Ctrl+1..5 while the slash menu is open.
assert.ok(/if \(\(e\.metaKey \|\| e\.ctrlKey\) && \/\^\[1-5\]\$\/\.test\(e\.key\)\)/.test(read("../components/chat/MessageComposer.jsx")));

const ev = (o) => ({ key: "", code: "", ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...o });
assert.equal(matchShortcut(ev({ key: "/", code: "Slash", ctrlKey: true })), "help");
assert.equal(matchShortcut(ev({ key: "/", code: "Slash", metaKey: true })), "help", "⌘/ on a Mac");
assert.equal(matchShortcut(ev({ key: "/", code: "Digit7", ctrlKey: true, shiftKey: true })), "help", "Turkish / German layouts type / with Shift+7");
assert.equal(matchShortcut(ev({ key: "F", code: "KeyF", ctrlKey: true, shiftKey: true })), "search");
assert.equal(matchShortcut(ev({ key: "f", code: "KeyF", ctrlKey: true })), null, "Ctrl+F stays the browser's find");
assert.equal(matchShortcut(ev({ key: "ArrowDown", code: "ArrowDown", altKey: true })), "nextChat");
assert.equal(matchShortcut(ev({ key: "ArrowUp", code: "ArrowUp", altKey: true, shiftKey: true })), "prevUnread");
assert.equal(matchShortcut(ev({ key: "ArrowLeft", code: "ArrowLeft", altKey: true })), null, "Alt+← stays browser back");
assert.equal(matchShortcut(ev({ key: "PageUp", code: "PageUp", shiftKey: true })), "jumpUnread");
assert.equal(matchShortcut(ev({ key: "m", code: "KeyM", ctrlKey: true, shiftKey: true })), null, "mute stays the voice shortcut");
assert.equal(matchShortcut(ev({ key: "/", code: "Slash", ctrlKey: true, isComposing: true })), null, "IME composition");

// Where they may run.
const composer = { tagName: "TEXTAREA", value: "", closest: (s) => (s === ".composer-container" ? {} : null) };
const typed = { ...composer, value: "merhaba" };
const search = { tagName: "INPUT", type: "search", value: "", closest: () => null };
assert.equal(typingTarget({ tagName: "BUTTON" }), null);
assert.equal(allowedIn("help", search), true, "Ctrl combos work in any field");
assert.equal(allowedIn("nextChat", composer), true, "Alt+↓ works from the composer");
assert.equal(allowedIn("nextChat", search), false, "but not in other fields");
assert.equal(allowedIn("jumpUnread", composer), true, "Shift+PageUp from an empty composer");
assert.equal(allowedIn("jumpUnread", typed), false, "Shift+PageUp selects text when there is text");
assert.equal(allowedIn("jumpUnread", null), true);

// Key caps.
assert.deepEqual(keyCaps({ mod: true, shift: true, key: "f" }, false), ["Ctrl", "Shift", "F"]);
assert.deepEqual(keyCaps({ mod: true, shift: true, key: "f" }, true), ["⌘", "⇧", "F"]);
assert.deepEqual(keyCaps({ alt: true, key: "ArrowUp" }, true), ["⌥", "↑"]);

// Help sheet lists every new shortcut and the existing ones.
const rows = shortcutSections().flatMap((s) => s.rows);
assert.equal(rows.length, SHORTCUTS.length + EXISTING.length);
for (const s of SHORTCUTS) assert.ok(rows.some((r) => r.id === s.id), s.id);

// Chat stepping: plain steps stop at the ends, unread steps skip read chats.
const list = ["a", "b", "c", "d"].map((id) => ({ id, unread: id === "d" || id === "a" }));
const isUnread = (el) => el.unread;
assert.equal(stepConversation(list, 1, 1).id, "c");
assert.equal(stepConversation(list, 3, 1), null, "last chat: no wrap");
assert.equal(stepConversation(list, -1, 1).id, "a", "nothing open: the first chat");
assert.equal(stepConversation(list, 1, 1, { unreadOnly: true, isUnread }).id, "d");
assert.equal(stepConversation(list, 1, -1, { unreadOnly: true, isUnread }).id, "a");
assert.equal(stepConversation([], 0, 1), null);

// Wiring: one window listener in the app host, the search button is reachable, the sheet is lazy.
const host = read("../components/chat/ChatSheetsHost.jsx");
assert.ok(host.includes('window.addEventListener("keydown", onKey);'));
assert.ok(host.includes('lazy(() => import("./ShortcutsSheet.jsx"))'));
assert.ok(read("../components/layout/ChatPanel.jsx").includes('data-shortcut="chat-search"'));

console.log("shortcuts selftest OK");
