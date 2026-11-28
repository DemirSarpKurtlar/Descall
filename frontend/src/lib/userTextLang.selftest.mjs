// Run: node src/lib/userTextLang.selftest.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { userTextLang } from "./userTextLang.js";

const servers = join(dirname(fileURLToPath(import.meta.url)), "..", "components", "servers");
const read = (p) => readFileSync(join(servers, p), "utf8");

assert.equal(userTextLang("community", "tr"), "und");
assert.equal(userTextLang("voice lobbies", "tr"), "und");
assert.equal(userTextLang("", "tr"), "und");
assert.equal(userTextLang(null, "tr"), "und");
assert.equal(userTextLang("Oyun gecesi ışıkları", "tr"), "tr");
assert.equal(userTextLang("İstanbul", "en"), "tr");
assert.equal(userTextLang("dağ evi", "de"), "tr");
// Shared letters: Turkish only when the app is in Turkish.
assert.equal(userTextLang("çiçek", "tr"), "tr");
assert.equal(userTextLang("çiçek", "tr-TR"), "tr");
assert.equal(userTextLang("Grüße", "de"), "und");
assert.equal(userTextLang("München", "en"), "und");

// Every uppercase surface that shows a user-provided name carries the hint.
const sidebar = read("ServersSidebar.jsx");
// Category names show the reader's language on localized servers (draft C, lib/serverL10n.js).
assert.match(sidebar, /<span lang=\{userTextLang\(channelDisplayName\(node\)\)\}>\{channelDisplayName\(node\)\}<\/span>/);
assert.match(sidebar, /<span lang=\{userTextLang\(folder\.name\)\}>\{folder\.name\}<\/span>/);
assert.match(sidebar, /className="server-voice-member-menu-title" lang=\{userTextLang\(title\)\}/);
assert.match(read("ServerMembersPanel.jsx"), /lang=\{section\.userLabel \? userTextLang\(section\.label\) : undefined\}/);
assert.match(read("VoiceMemberContextMenu.jsx"), /className="server-voice-member-menu-title" lang=\{userTextLang\(name\)\}/);
assert.match(read("hub/pagesChannels.jsx"), /<Sec><UserName>\{cat\.name\}<\/UserName><\/Sec>/);
console.log("userTextLang selftest ok");
