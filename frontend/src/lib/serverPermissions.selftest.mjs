/**
 * Run: node frontend/src/lib/serverPermissions.selftest.mjs
 */
import {
  serverIsOwner,
  serverHighestPosition,
  canActOnServerMember,
  isAssignableServerRole,
  serverHasPermission,
  canEditServerRole,
  canGrantServerPermission,
} from "./serverPermissions.js";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const ownerViaFlag = { isOwner: false, myPermissions: { isOwner: true, highestPosition: 0, flags: {} } };
assert(serverIsOwner(ownerViaFlag), "myPermissions.isOwner must count as owner");
assert(serverHighestPosition(ownerViaFlag) > 99, "owner can assign any custom role");
assert(
  isAssignableServerRole(ownerViaFlag, { id: "r1", isEveryone: false, position: 50 }),
  "owner can assign high roles"
);
assert(
  canActOnServerMember(ownerViaFlag, { userId: "u2", isOwner: false, highestPosition: 50 }),
  "owner can moderate members even when highestPosition is 0"
);
assert(
  !canActOnServerMember(ownerViaFlag, { userId: "u1", isOwner: true, highestPosition: 0 }),
  "nobody can moderate the server owner"
);

const manager = {
  isOwner: false,
  myPermissions: { isOwner: false, highestPosition: 5, flags: { MANAGE_ROLES: true } },
};
assert(serverHasPermission(manager, "MANAGE_ROLES"), "manager keeps MANAGE_ROLES");
assert(isAssignableServerRole(manager, { id: "r2", isEveryone: false, position: 4 }), "can assign roles below self");
assert(!isAssignableServerRole(manager, { id: "r3", isEveryone: false, position: 5 }), "cannot assign equal roles");
assert(!isAssignableServerRole(manager, { id: "everyone", isEveryone: true, position: 0 }), "@everyone is not assignable");
assert(canActOnServerMember(manager, { isOwner: false, highestPosition: 2 }), "can moderate lower members");
assert(!canActOnServerMember(manager, { isOwner: false, highestPosition: 5 }), "cannot moderate equal members");
assert(
  !canActOnServerMember(manager, { userId: "me", isOwner: false, highestPosition: 0 }, "me"),
  "cannot change own roles even with a higher position than a stale 0"
);
assert(
  canActOnServerMember(manager, { userId: "other", isOwner: false, highestPosition: 0 }, "me"),
  "can still moderate members who only have @everyone"
);
assert(
  !canActOnServerMember(manager, { userId: "ghost", isOwner: false, highestPosition: Number.NaN }, "me"),
  "missing highestPosition must fail closed"
);

const adminOnly = {
  isOwner: false,
  myPermissions: { isOwner: false, highestPosition: 1, flags: { ADMINISTRATOR: true } },
};
assert(
  !isAssignableServerRole(adminOnly, { id: "r4", isEveryone: false, position: 1 }),
  "ADMINISTRATOR does not skip role hierarchy"
);
assert(canEditServerRole(manager, { id: "r2", isEveryone: false, position: 4 }), "can edit roles below self");
assert(!canEditServerRole(manager, { id: "r3", isEveryone: false, position: 5 }), "cannot edit equal roles");
assert(canEditServerRole(manager, { id: "everyone", isEveryone: true, position: 0 }), "can edit @everyone when above it");
assert(canGrantServerPermission(manager, "MANAGE_ROLES"), "manager can grant MANAGE_ROLES");
assert(!canGrantServerPermission(manager, "BAN_MEMBERS"), "manager cannot grant BAN they lack");
assert(!canGrantServerPermission(manager, "ADMINISTRATOR"), "manager cannot grant ADMINISTRATOR");
assert(canGrantServerPermission(adminOnly, "BAN_MEMBERS"), "administrator can grant any bit");

console.log("serverPermissions.selftest.mjs: ok");
