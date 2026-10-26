// node src/lib/groupMembers.selftest.mjs
// Adding a member to a group must show up at once on every screen: the
// sidebar row, the chat header count, the members panel and the info sheet
// (myGroups + activeGroup), from the HTTP response and from the socket echo.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { applyGroupMemberAdded, mergeGroupMember, upsertInvitedGroup } from "./groupMembers.js";

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(join(here, rel), "utf8");

const owner = { id: "u1", username: "owner" };
const ali = { id: "u2", username: "ali" };
const veli = { id: "u3", username: "veli" };
const g1 = { id: "g1", name: "Ekip", members: [owner, ali], memberIds: ["u1", "u2"], memberCount: 2, joinedAt: "j", lastMessage: "ali: selam" };
const g2 = { id: "g2", name: "Diğer", members: [owner], memberIds: ["u1"], memberCount: 1 };
const list = [g1, g2];

// Append from the socket payload (user + count).
let next = applyGroupMemberAdded(list, "g1", { user: veli, memberCount: 3 });
assert.notEqual(next, list);
assert.equal(next[1], g2, "other groups keep identity");
assert.deepEqual(next[0].members.map((m) => m.id), ["u1", "u2", "u3"]);
assert.deepEqual(next[0].memberIds, ["u1", "u2", "u3"]);
assert.equal(next[0].memberCount, 3);
assert.equal(next[0].joinedAt, "j");

// Idempotent: HTTP response then socket echo (or two tabs) never double-add.
const again = applyGroupMemberAdded(next, "g1", { user: veli, memberCount: 3 });
assert.equal(again, next, "same member twice is a no-op");
assert.equal(applyGroupMemberAdded(next, "g1", { user: veli }), next);

// Without a server count, the count follows the list.
const noCount = applyGroupMemberAdded(list, "g1", { user: veli });
assert.equal(noCount[0].memberCount, 3);

// The server group (fresh members[]) wins, keeping per-user fields.
const fresh = { id: "g1", name: "Ekip", members: [owner, ali, veli], memberIds: ["u1", "u2", "u3"], memberCount: 3, lastMessage: null };
const merged = mergeGroupMember(g1, { user: veli, group: fresh });
assert.equal(merged.memberCount, 3);
assert.equal(merged.joinedAt, "j");
assert.equal(merged.lastMessage, "ali: selam", "a null preview from the server does not wipe the row preview");

// Old list rows without members[] / memberIds still work.
const bare = applyGroupMemberAdded([{ id: "g9", memberCount: 4 }], "g9", { user: veli });
assert.equal(bare[0].memberCount, 5);
assert.deepEqual(bare[0].memberIds, ["u3"]);

// Unknown group / bad input leaves the list alone.
assert.equal(applyGroupMemberAdded(list, "nope", { user: veli }), list);
assert.equal(applyGroupMemberAdded(list, "g1", {}), list);
assert.equal(applyGroupMemberAdded(null, "g1", { user: veli }), null);

// group:invited: insert once, refresh a stale copy, ignore a bare duplicate.
const invited = { id: "g3", name: "Yeni", members: [owner, veli], memberIds: ["u1", "u3"], memberCount: 2 };
const withNew = upsertInvitedGroup(list, invited);
assert.equal(withNew.length, 3);
assert.ok(Date.parse(withNew[2].joinedAt) > Date.now() - 5000, "a group I was just added to is stamped joined now (sorts to the top)");
assert.equal(upsertInvitedGroup(list, { ...invited, joinedAt: "2026-01-01T00:00:00Z" })[2].joinedAt, "2026-01-01T00:00:00Z", "server join time kept");
assert.equal(upsertInvitedGroup(withNew, { id: "g3", name: "Yeni" }), withNew);
const refreshed = upsertInvitedGroup(list, fresh);
assert.equal(refreshed.length, 2);
assert.equal(refreshed[0].memberCount, 3);

// Wiring: the add sheet's result reaches App state, and App listens to the
// socket events (this was the bug: onMemberAdded was never passed in).
const sidebar = read("../components/layout/ServerSidebar.jsx");
const chat = read("../components/layout/ChatPanel.jsx");
const layout = read("../components/layout/AppLayout.jsx");
const app = read("../App.jsx");
const sheet = read("../components/groups/GroupAddMemberSheet.jsx");
assert.match(sidebar, /useGroupActions\(\{[^}]*onMemberAdded:\s*onGroupMemberAdded/, "sidebar group list wires onMemberAdded");
assert.match(chat, /useGroupActions\(\{[^}]*onMemberAdded:\s*onGroupMemberAdded/, "chat info sheet wires onMemberAdded");
assert.equal((layout.match(/onGroupMemberAdded=\{onGroupMemberAdded\}/g) || []).length, 2, "AppLayout passes it to sidebar + chat");
assert.match(app, /onGroupMemberAdded=\{/, "App provides onGroupMemberAdded");
assert.match(app, /socket\.on\("group:member:added"/, "App listens to group:member:added");
assert.match(app, /upsertInvitedGroup\(prev, group\)/, "group:invited refreshes a stale group");
assert.match(sheet, /onMemberAdded\?\.\(friend, body\)/, "sheet hands the server response up");

console.log("groupMembers selftest ok");
