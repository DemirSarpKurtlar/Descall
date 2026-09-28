import assert from "node:assert/strict";
import { filterSlashCommandMatches, getSlashCommandsForSurface } from "./slashCommands.js";

const NEW_CASINO = ["slot", "coinflip", "cf", "pay", "send", "gonder", "tip"];

const group = getSlashCommandsForSurface({ activeGroup: { id: "g" } });
const groupNames = group.map((cmd) => cmd.name);
for (const name of ["bj", "daily", "credits", "top", ...NEW_CASINO]) {
  assert.ok(groupNames.includes(name), `group picker missing /${name}`);
}
assert.equal(groupNames.includes("kick"), false);
assert.equal(groupNames.includes("server"), false);

const server = getSlashCommandsForSurface({
  activeChannel: { type: "text" },
  permissionFlags: { USE_APPLICATION_COMMANDS: true, KICK_MEMBERS: true },
});
const serverNames = server.map((cmd) => cmd.name);
for (const name of NEW_CASINO) {
  assert.ok(serverNames.includes(name), `server picker missing /${name}`);
}
assert.ok(serverNames.includes("kick"));

const lockedServer = getSlashCommandsForSurface({
  activeChannel: { type: "text" },
  permissionFlags: {},
});
for (const name of NEW_CASINO) {
  assert.ok(lockedServer.some((cmd) => cmd.name === name), `casino /${name} hidden without app-command permission`);
}
assert.equal(lockedServer.some((cmd) => cmd.name === "kick"), false);

assert.deepEqual(getSlashCommandsForSurface({}), []);
assert.deepEqual(
  getSlashCommandsForSurface({ activeChannel: { type: "voice" } }).map((cmd) => cmd.name),
  []
);

const typedSlash = filterSlashCommandMatches(group, "/").map((cmd) => cmd.name);
assert.deepEqual(typedSlash, groupNames);
for (const name of NEW_CASINO) {
  assert.ok(typedSlash.includes(name), `typing / hid /${name}`);
}

assert.deepEqual(
  filterSlashCommandMatches(group, "/s").map((cmd) => cmd.name),
  ["slot", "send"]
);
assert.deepEqual(
  filterSlashCommandMatches(group, "/cf").map((cmd) => cmd.name),
  ["cf"]
);
assert.deepEqual(filterSlashCommandMatches(group, "/pay 500"), []);
assert.deepEqual(filterSlashCommandMatches(group, "hello"), []);

console.log("slashCommands.selftest ok", typedSlash.join(" "));
