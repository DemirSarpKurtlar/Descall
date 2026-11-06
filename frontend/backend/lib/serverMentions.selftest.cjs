"use strict";

/**
 * Messaging phase 5: role / @everyone / @here mention rules (lib/serverMentions.js).
 *   node frontend/backend/lib/serverMentions.selftest.cjs
 */

const assert = require("node:assert/strict");
const sm = require("./serverMentions");
const { Permissions, ALL_PERMISSIONS } = require("./serverPermissions");

const RID = "0a1b2c3d-0000-4000-8000-00000000abcd";
const RID2 = "0a1b2c3d-0000-4000-8000-00000000abce";

// Parsing.
assert.deepEqual(sm.parseServerMentions(`selam <@&${RID}> ve <@&${RID.toUpperCase()}>`), { roleIds: [RID], everyone: false, here: false }, "one id, case-insensitive");
assert.deepEqual(sm.parseServerMentions("@everyone toplantı"), { roleIds: [], everyone: true, here: false });
assert.deepEqual(sm.parseServerMentions("kim var? @here"), { roleIds: [], everyone: false, here: true });
assert.deepEqual(sm.parseServerMentions("mail ali@everyone.com ve @@here ve @hereford ve @everyoneX"), { roleIds: [], everyone: false, here: false }, "not words");
assert.deepEqual(sm.parseServerMentions("(@everyone)"), { roleIds: [], everyone: true, here: false });
assert.deepEqual(sm.parseServerMentions("<@&not-a-uuid> <@123>"), { roleIds: [], everyone: false, here: false });
const many = Array.from({ length: 30 }, (_, i) => `<@&0a1b2c3d-0000-4000-8000-${String(i).padStart(12, "0")}>`).join(" ");
assert.equal(sm.parseServerMentions(many).roleIds.length, sm.MAX_ROLE_PINGS, "capped");

// Who may ping.
const plain = { bits: Permissions.SEND_MESSAGES | Permissions.VIEW_CHANNEL, isOwner: false };
const vip = { bits: plain.bits | Permissions.MENTION_EVERYONE, isOwner: false };
const mod = { bits: plain.bits | Permissions.MANAGE_ROLES, isOwner: false };
const admin = { bits: ALL_PERMISSIONS, isOwner: false };
const adminBitOnly = { bits: Permissions.ADMINISTRATOR, isOwner: false };
const owner = { bits: 0n, isOwner: true };
assert.equal(sm.canManageMentions(plain), false);
assert.equal(sm.canManageMentions(vip), false);
assert.equal(sm.canManageMentions(mod), true);
assert.equal(sm.canManageMentions(admin), true);
assert.equal(sm.canManageMentions(adminBitOnly), true, "ADMINISTRATOR implies everything");
assert.equal(sm.canManageMentions(owner), true);
assert.equal(sm.canManageMentions(null), false);

assert.equal(sm.canPingEveryone(plain), false);
assert.equal(sm.canPingEveryone(vip), false, "default policy: admins only");
assert.equal(sm.canPingEveryone(vip, { policy: "permission" }), true, "permission policy: MENTION_EVERYONE counts");
assert.equal(sm.canPingEveryone(plain, { policy: "permission" }), false);
assert.equal(sm.canPingEveryone(mod), true);
assert.equal(sm.canPingEveryone(owner), true);

const roles = [
  { id: RID, name: "Tasarım", mentionable: true, is_everyone: false },
  { id: RID2, name: "Gizli", mentionable: false, is_everyone: false },
  { id: "e", name: "@everyone", mentionable: true, is_everyone: true },
];
assert.equal(sm.canPingRole(plain, roles[0]), true, "mentionable role: anyone");
assert.equal(sm.canPingRole(plain, roles[1]), false, "not mentionable: plain member no");
assert.equal(sm.canPingRole(mod, roles[1]), true, "MANAGE_ROLES yes");
assert.equal(sm.canPingRole(owner, roles[1]), true, "owner yes");
assert.equal(sm.canPingRole(owner, roles[2]), false, "@everyone role is never a role ping");
assert.equal(sm.canPingRole(owner, undefined), false, "unknown role (another server) no");
assert.deepEqual(sm.pingableRoleIds([RID, RID2, "x"], roles, plain), [RID]);
assert.deepEqual(sm.pingableRoleIds([RID.toUpperCase(), RID2], roles, mod), [RID.toUpperCase(), RID2]);

// Text for cards / pushes.
assert.equal(sm.roleTokensToText(`<@&${RID}> ve <@&${RID2}> ve <@&${"0a1b2c3d-0000-4000-8000-0000000000ff"}>`, roles), "@Tasarım ve @Gizli ve @rol");

// Rate limit: one per sender per channel per window.
let clock = 1_000_000;
const lim = sm.createMassPingLimiter({ windowMs: 60_000, now: () => clock });
assert.deepEqual(lim.check("c1", "u1"), { ok: true, retryAfterMs: 0 });
lim.mark("c1", "u1");
assert.equal(lim.check("c1", "u1").ok, false);
assert.equal(lim.check("c1", "u1").retryAfterMs, 60_000);
assert.equal(lim.check("c2", "u1").ok, true, "per channel");
assert.equal(lim.check("c1", "u2").ok, true, "per sender");
clock += 59_000;
assert.equal(lim.check("c1", "u1").retryAfterMs, 1_000);
clock += 1_000;
assert.equal(lim.check("c1", "u1").ok, true, "window over");
const off = sm.createMassPingLimiter({ windowMs: 0, now: () => clock });
off.mark("c", "u");
assert.equal(off.check("c", "u").ok, true, "0 disables the limit");
// Bounded memory.
const small = sm.createMassPingLimiter({ windowMs: 60_000, now: () => clock, maxKeys: 3 });
for (let i = 0; i < 10; i += 1) small.mark(`c${i}`, "u");
assert.equal(small.check("c9", "u").ok, false, "latest kept");

// Env configuration.
process.env.SERVER_EVERYONE_COOLDOWN_SEC = "15";
assert.equal(sm.createMassPingLimiter().windowMs, 15_000);
delete process.env.SERVER_EVERYONE_COOLDOWN_SEC;
assert.equal(sm.createMassPingLimiter().windowMs, 60_000);
process.env.SERVER_EVERYONE_PING_POLICY = "permission";
assert.equal(sm.canPingEveryone(vip), true);
delete process.env.SERVER_EVERYONE_PING_POLICY;

// @here presence.
const presence = new Map([["a", { status: "online" }], ["b", { status: "invisible" }], ["c", { status: "idle" }]]);
assert.equal(sm.isOnlineFor(presence, "a"), true);
assert.equal(sm.isOnlineFor(presence, "b"), false, "invisible is not online");
assert.equal(sm.isOnlineFor(presence, "c"), true);
assert.equal(sm.isOnlineFor(presence, "z"), false);

console.log("serverMentions selftest OK");
