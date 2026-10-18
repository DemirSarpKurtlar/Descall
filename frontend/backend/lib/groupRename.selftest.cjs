"use strict";
const assert = require("node:assert/strict");
const { normalizeGroupName, canRenameGroup, GROUP_NAME_MAX } = require("./groupRename");

assert.deepEqual(normalizeGroupName("  Hafta  Sonu \n Ekibi "), { ok: true, name: "Hafta Sonu Ekibi" });
assert.equal(normalizeGroupName("").ok, false);
assert.equal(normalizeGroupName("   ").code, "NAME_REQUIRED");
assert.equal(normalizeGroupName(null).code, "NAME_REQUIRED");
assert.equal(normalizeGroupName(42).ok, false);
assert.equal(normalizeGroupName("x").ok, true);
assert.equal(normalizeGroupName("a".repeat(GROUP_NAME_MAX)).ok, true);
assert.equal(normalizeGroupName("a".repeat(GROUP_NAME_MAX + 1)).code, "NAME_TOO_LONG");
// Emoji count as one character each.
assert.equal(normalizeGroupName("🎮".repeat(GROUP_NAME_MAX)).ok, true);
assert.equal(normalizeGroupName("VAL\u0000Night").name, "VAL Night");

// Any member may rename (the 2.10.111 bug: only the creator could).
assert.equal(canRenameGroup({ userId: "u1", createdBy: "u2", isMember: true }), true);
assert.equal(canRenameGroup({ userId: "u1", createdBy: "u1", isMember: true }), true);
assert.equal(canRenameGroup({ userId: "u1", createdBy: "u2", isMember: false }), false);
assert.equal(canRenameGroup({ userId: null, createdBy: null, isMember: true }), false);

console.log("groupRename.selftest ok");
