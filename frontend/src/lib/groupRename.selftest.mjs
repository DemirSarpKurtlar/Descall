import assert from "node:assert/strict";
import fs from "node:fs";
import { validateGroupRename, normalizeGroupNameInput, applyGroupRename, renameErrorKey, GROUP_NAME_MAX } from "./groupRename.js";

assert.equal(normalizeGroupNameInput("  a \n  b "), "a b");
assert.deepEqual(validateGroupRename("  Yeni  Ad ", "Eski"), { ok: true, name: "Yeni Ad", reason: "" });
assert.equal(validateGroupRename("   ", "Eski").reason, "empty");
assert.equal(validateGroupRename("Eski ", "Eski").reason, "unchanged");
assert.equal(validateGroupRename("x".repeat(GROUP_NAME_MAX + 1), "Eski").reason, "too-long");
assert.equal(validateGroupRename("🎮".repeat(GROUP_NAME_MAX), "Eski").ok, true);
assert.equal(validateGroupRename("X", "Eski").ok, true, "1 character is allowed (matches backend)");

const list = [{ id: "g1", name: "A" }, { id: "g2", name: "B" }];
const renamed = applyGroupRename(list, "g2", "C");
assert.notEqual(renamed, list);
assert.equal(renamed[1].name, "C");
assert.equal(renamed[0], list[0], "untouched rows keep identity");
assert.equal(applyGroupRename(list, "g2", "B"), list, "no-op keeps identity");
assert.equal(applyGroupRename(list, "nope", "Z"), list);

assert.match(renameErrorKey("NOT_MEMBER"), /member/);
assert.match(renameErrorKey("whatever"), /Could not rename/);

// Wiring guards: the live update and the any-member rule must stay in place.
const read = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8");
const app = read("../App.jsx");
assert.match(app, /socket\.on\("group:renamed"/, "App listens for group:renamed");
const route = read("../../backend/routes/groups.js");
assert.doesNotMatch(route, /Only creator can rename/, "any member may rename");
assert.match(route, /emit\("group:renamed"/, "rename broadcasts to the group room");
const sidebar = read("../components/layout/ServerSidebar.jsx");
assert.doesNotMatch(sidebar, /window\.prompt\(/, "no window.prompt (blocked in iOS WKWebView)");
const addSheet = read("../components/groups/GroupAddMemberSheet.jsx");
assert.doesNotMatch(addSheet, /autoFocus/, "add member search must not auto-focus (keyboard)");

console.log("groupRename.selftest ok");
