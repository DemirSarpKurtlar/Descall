"use strict";
// node backend/lib/userLens.selftest.cjs
// Kullanıcının gözünden (3.7.2): pure parts (channel visibility, platform switches).
process.env.SUPABASE_URL = process.env.SUPABASE_URL || "http://127.0.0.1:9";
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "test";
const assert = require("assert");
const { channelAccess, policyChecks } = require("./userLens");
const { Permissions, EVERYONE_DEFAULT, toPgBigint } = require("./serverPermissions");

const V = Permissions.VIEW_CHANNEL;
const server = { id: "s1", owner_id: "owner" };
const roles = [
  { id: "r-every", is_everyone: true, position: 0, permissions: toPgBigint(EVERYONE_DEFAULT) },
  { id: "r-mod", is_everyone: false, position: 5, permissions: toPgBigint(V | Permissions.SEND_MESSAGES) },
];
const channels = [
  { id: "cat", name: "Yetkili", type: "category", position: 0 },
  { id: "c1", name: "genel", type: "text", position: 1 },
  { id: "c2", name: "yetkili-sohbet", type: "text", parent_id: "cat", position: 2 },
  { id: "c3", name: "duyurular", type: "text", position: 3 },
  { id: "v1", name: "Ses", type: "voice", position: 4 },
];
const overrides = [
  // Category hides from @everyone and allows the mod role; c2 has no own rows so it inherits.
  { channel_id: "cat", target_type: "role", target_id: "r-every", allow_permissions: "0", deny_permissions: toPgBigint(V) },
  { channel_id: "cat", target_type: "role", target_id: "r-mod", allow_permissions: toPgBigint(V), deny_permissions: "0" },
  // Read-only announcements for @everyone.
  { channel_id: "c3", target_type: "role", target_id: "r-every", allow_permissions: "0", deny_permissions: toPgBigint(Permissions.SEND_MESSAGES) },
];
const by = (list) => Object.fromEntries(list.map((c) => [c.id, c]));

// Plain member: sees genel + duyurular (read only) + voice, not the staff channel.
const member = by(channelAccess({ server, userId: "u", roles, assignedRoleIds: [], channels, overrides }));
assert.equal(member.c1.view, true);
assert.equal(member.c1.send, true);
assert.equal(member.c2.view, false, "category rule inherited");
assert.equal(member.c3.view, true);
assert.equal(member.c3.send, false, "read-only channel");
assert.equal(member.v1.connect, true);
assert.equal(member.v1.send, false, "voice is never 'send'");

// Mod role: sees the staff channel through the category allow.
const mod = by(channelAccess({ server, userId: "m", roles, assignedRoleIds: ["r-mod"], channels, overrides }));
assert.equal(mod.c2.view, true);

// Owner sees everything.
const owner = by(channelAccess({ server, userId: "owner", roles, assignedRoleIds: [], channels, overrides }));
assert.ok(Object.values(owner).every((c) => c.view));

// Platform switches.
const ids = (cfg, o) => Object.fromEntries(policyChecks(cfg, o).map((c) => [c.id, c]));
let p = ids({ chatFrozen: false, dmEnabled: true, groupCreationEnabled: true });
assert.equal(p.sendMessages.status, "ok");
assert.equal(p.sendDms.status, "ok");
assert.ok(!p.rateLimits);
p = ids({ chatFrozen: true });
assert.equal(p.sendMessages.status, "blocked");
assert.equal(p.sendDms.code, "CHAT_FROZEN");
p = ids({ dmEnabled: false, groupCreationEnabled: false, slowModeSeconds: 10 });
assert.equal(p.sendDms.code, "DMS_DISABLED");
assert.equal(p.createGroups.status, "blocked");
assert.equal(p.rateLimits.slowModeSeconds, 10);
assert.deepEqual(policyChecks({ chatFrozen: true }, { isAdmin: true }).map((c) => c.id), ["policyAdmin"], "admins are exempt");
console.log("userLens.selftest: ok");
