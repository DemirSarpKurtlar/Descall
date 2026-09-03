/**
 * Lightweight permission overwrite / fail-closed checks (no Jest).
 * Run: node frontend/backend/lib/serverPermissions.selftest.mjs
 */
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const {
  Permissions,
  hasPermission,
  applyOverwrites,
  EVERYONE_DEFAULT,
  canBrowsePrivateChannels,
} = require("./serverPermissions.js");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const everyoneRoleId = "role-everyone";
const staffRoleId = "role-staff";
const userId = "user-1";

// Staff-only channel: @everyone denied VIEW, staff allowed VIEW
const overwrites = [
  {
    target_type: "role",
    target_id: everyoneRoleId,
    deny_permissions: String(Permissions.VIEW_CHANNEL),
    allow_permissions: "0",
    _position: 0,
  },
  {
    target_type: "role",
    target_id: staffRoleId,
    deny_permissions: "0",
    allow_permissions: String(Permissions.VIEW_CHANNEL),
    _position: 10,
  },
];

const everyoneBits = applyOverwrites(EVERYONE_DEFAULT, overwrites, {
  everyoneRoleId,
  memberRoleIds: new Set([everyoneRoleId]),
  userId,
});
assert(!hasPermission(everyoneBits, Permissions.VIEW_CHANNEL), "@everyone must not see staff channel");

const staffBits = applyOverwrites(EVERYONE_DEFAULT, overwrites, {
  everyoneRoleId,
  memberRoleIds: new Set([everyoneRoleId, staffRoleId]),
  userId,
});
assert(hasPermission(staffBits, Permissions.VIEW_CHANNEL), "staff must see staff channel");

// Member-specific deny beats role allow
const memberDeny = [
  ...overwrites,
  {
    target_type: "member",
    target_id: userId,
    deny_permissions: String(Permissions.VIEW_CHANNEL),
    allow_permissions: "0",
  },
];
const deniedStaff = applyOverwrites(EVERYONE_DEFAULT, memberDeny, {
  everyoneRoleId,
  memberRoleIds: new Set([everyoneRoleId, staffRoleId]),
  userId,
});
assert(!hasPermission(deniedStaff, Permissions.VIEW_CHANNEL), "member deny must win");

assert(
  canBrowsePrivateChannels({ isMember: true, isOwner: true, bits: 0n }),
  "owner must see private channels"
);
assert(
  canBrowsePrivateChannels({
    isMember: true,
    isOwner: false,
    bits: Permissions.ADMINISTRATOR,
  }),
  "ADMINISTRATOR must see private channels"
);
assert(
  !canBrowsePrivateChannels({
    isMember: true,
    isOwner: false,
    bits: Permissions.MANAGE_ROLES,
  }),
  "MANAGE_ROLES must not reveal private channels"
);
assert(
  !canBrowsePrivateChannels({
    isMember: true,
    isOwner: false,
    bits: Permissions.MANAGE_CHANNELS,
  }),
  "MANAGE_CHANNELS must not reveal private channels"
);
assert(
  !canBrowsePrivateChannels({
    isMember: true,
    isOwner: false,
    bits: EVERYONE_DEFAULT,
  }),
  "regular members must not browse hidden channels"
);

const { clipRolePermissions, EVERYONE_PRIVILEGE_BITS } = require("./serverPermissions.js");
const modBits = Permissions.MANAGE_ROLES | Permissions.VIEW_CHANNEL | Permissions.SEND_MESSAGES;
const escalated = clipRolePermissions({
  desiredBits: Permissions.ADMINISTRATOR | Permissions.BAN_MEMBERS | Permissions.MANAGE_ROLES,
  existingBits: 0n,
  actorBits: modBits,
  isOwner: false,
  isEveryone: false,
});
assert((escalated & Permissions.ADMINISTRATOR) === 0n, "mod cannot grant ADMINISTRATOR");
assert((escalated & Permissions.BAN_MEMBERS) === 0n, "mod cannot grant bits they lack");
assert((escalated & Permissions.MANAGE_ROLES) === Permissions.MANAGE_ROLES, "mod can grant MANAGE_ROLES they have");

const everyoneEscalation = clipRolePermissions({
  desiredBits: EVERYONE_PRIVILEGE_BITS | Permissions.VIEW_CHANNEL,
  existingBits: EVERYONE_DEFAULT,
  actorBits: Permissions.ADMINISTRATOR,
  isOwner: true,
  isEveryone: true,
});
assert(
  (everyoneEscalation & EVERYONE_PRIVILEGE_BITS) === 0n,
  "@everyone must never receive privilege bits"
);
assert(
  (everyoneEscalation & Permissions.VIEW_CHANNEL) === Permissions.VIEW_CHANNEL,
  "@everyone can keep VIEW_CHANNEL"
);

console.log("serverPermissions.selftest: ok");
