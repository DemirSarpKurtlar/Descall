import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { GROUP_INFO_ACTIONS, shouldDismissSheet, sortGroupMembers } from "./groupInfo.js";

assert.deepEqual(GROUP_INFO_ACTIONS.map((a) => a.id), ["invite", "add", "rename", "photo", "leave"]);
assert.equal(GROUP_INFO_ACTIONS.find((a) => a.id === "leave").destructive, true);

assert.equal(shouldDismissSheet(120, 0), true, "dragged far enough");
assert.equal(shouldDismissSheet(20, 900), true, "flicked down");
assert.equal(shouldDismissSheet(40, 200), false);
assert.equal(shouldDismissSheet(-200, -2000), false, "up never dismisses");

const sorted = sortGroupMembers(
  [{ id: "c", username: "cem" }, { id: "a", username: "ali" }, { id: "o", username: "zed" }, { id: "b", username: "banu" }],
  { ownerId: "o", isOnline: (id) => id === "b" },
);
assert.deepEqual(sorted.map((m) => m.id), ["o", "b", "a", "c"]);
assert.equal(sorted[0]._isOwner, true);
assert.equal(sorted[1]._online, true);
assert.deepEqual(sortGroupMembers(null), []);

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const chat = read("../components/layout/ChatPanel.jsx");
assert.match(chat, /<GroupInfoSheet/);
assert.match(chat, /onClick=\{headerDm \? \(\) => setProfileTarget\(headerDm\) : headerGroup \? \(\) => setGroupInfoOpen\(true\)/);
// Same handlers as the sidebar swipe actions.
assert.match(chat, /useGroupActions\(/);
assert.match(chat, /onAction=\{\(action\) => groupActions\.run\(activeGroup, action\)\}/);
const sidebar = read("../components/layout/ServerSidebar.jsx");
assert.match(sidebar, /export function useGroupActions\(/);
assert.match(sidebar, /const groupActions = useGroupActions\(/);
const sheet = read("../components/groups/GroupInfoSheet.jsx");
assert.match(sheet, /drag=\{reduceMotion \? false : "y"\}/);
assert.match(sheet, /shouldDismissSheet\(info\.offset\.y, info\.velocity\.y\)/);
assert.match(sheet, /<GroupIcon group=\{group\} size=\{104\}/);
const tr = read("../i18n/locales/tr.js");
assert.match(tr, /"Group info": "Grup bilgisi"/);

console.log("groupInfo.selftest ok");
