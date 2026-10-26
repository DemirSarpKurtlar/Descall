"use strict";

const assert = require("node:assert/strict");
const r = require("../lib/groupRoles");
const { formatGroupListPreview, assembleGroupList } = require("../lib/groupList");

const owner = "u-o";
const base = { ownerId: owner, actorIsMember: true, targetIsMember: true };

// Permission matrix.
assert.deepEqual(r.canRemoveMember({ ...base, actorId: owner, targetId: "u-a", targetRole: "admin" }), { ok: true });
assert.deepEqual(r.canRemoveMember({ ...base, actorId: owner, targetId: "u-m" }), { ok: true });
assert.equal(r.canRemoveMember({ ...base, actorId: owner, targetId: owner }).code, "CANNOT_REMOVE_SELF");
assert.deepEqual(r.canRemoveMember({ ...base, actorId: "u-a", actorRole: "admin", targetId: "u-m" }), { ok: true });
assert.equal(r.canRemoveMember({ ...base, actorId: "u-a", actorRole: "admin", targetId: "u-a2", targetRole: "admin" }).status, 403);
assert.equal(r.canRemoveMember({ ...base, actorId: "u-a", actorRole: "admin", targetId: owner, targetRole: "admin" }).code, "CANNOT_REMOVE_OWNER");
assert.equal(r.canRemoveMember({ ...base, actorId: "u-m", targetId: "u-m2" }).code, "NOT_ALLOWED");
assert.equal(r.canRemoveMember({ ...base, actorId: "u-x", actorIsMember: false, targetId: "u-m" }).code, "NOT_MEMBER");
assert.equal(r.canRemoveMember({ ...base, actorId: owner, targetId: "u-x", targetIsMember: false }).status, 404);
// A non-admin probing does not learn who is a member.
assert.equal(r.canRemoveMember({ ...base, actorId: "u-m", targetId: "u-x", targetIsMember: false }).status, 403);

assert.deepEqual(r.canSetRole({ actorId: owner, ownerId: owner, targetId: "u-m", role: "admin" }), { ok: true });
assert.equal(r.canSetRole({ actorId: "u-a", ownerId: owner, targetId: "u-m", role: "admin" }).status, 403);
assert.equal(r.canSetRole({ actorId: owner, ownerId: owner, targetId: owner, role: "admin" }).status, 400);
assert.equal(r.canSetRole({ actorId: owner, ownerId: owner, targetId: "u-m", role: "owner" }).code, "BAD_ROLE");

// Reason.
assert.deepEqual(r.normalizeReason(undefined), { ok: true, reason: null });
assert.deepEqual(r.normalizeReason("   "), { ok: true, reason: null });
assert.deepEqual(r.normalizeReason("  a\n\tb  "), { ok: true, reason: "a b" });
assert.equal(r.normalizeReason("ğ".repeat(140)).ok, true);
assert.equal(r.normalizeReason("ğ".repeat(141)).code, "REASON_TOO_LONG");
assert.equal(r.normalizeReason({}).ok, false);

// Cooldown.
const now = Date.parse("2026-10-26T12:00:05Z");
assert.equal(r.readdCooldownLeft("2026-10-26T12:00:00Z", now), 0);
assert.equal(r.readdCooldownLeft("2026-10-26T12:00:02Z", now), 2000);
assert.equal(r.readdCooldownLeft(null, now), 0);

// Rate limiter.
let clock = 0;
const take = r.createRateLimiter({ max: 2, windowMs: 1000, now: () => clock });
assert.equal(take("a"), 0);
assert.equal(take("a"), 0);
assert.equal(take("a"), 1000);
assert.equal(take("b"), 0);
clock = 1001;
assert.equal(take("a"), 0);

// Previews.
const removed = { message_type: "member_removed", content: JSON.stringify({ actorId: "u-d", actorName: "demir", targetId: "u-c", targetName: "can" }), sender: { username: "demir" } };
assert.equal(formatGroupListPreview(removed), "demir removed can");
assert.equal(formatGroupListPreview(removed, "u-c"), "demir removed you");
assert.equal(formatGroupListPreview({ message_type: "member_left", content: JSON.stringify({ actorId: "u-c", actorName: "can" }) }), "can left the group");
assert.equal(formatGroupListPreview({ message_type: "member_removed", content: "garbage" }), null);

const [g] = assembleGroupList({
  memberships: [],
  groups: [{ id: "g", created_by: "u-o" }],
  memberRows: [
    { group_id: "g", user_id: "u-o", role: "admin" },
    { group_id: "g", user_id: "u-a", role: "admin" },
    { group_id: "g", user_id: "u-m" },
  ],
  users: [],
  lastRows: [],
});
assert.deepEqual(g.adminIds, ["u-a"], "owner is not listed as admin");

console.log("groupRoles ok");
