import assert from "node:assert/strict";
import {
  filterSlashCommandMatches,
  getSlashCommandsForSurface,
  groupSlashMatches,
  isDmSlashCommand,
  slashInsertText,
} from "./slashCommands.js";

const CASINO = ["bj", "slot", "coinflip", "pay", "daily", "credits", "top"];
const names = (list) => list.map((c) => c.name);

// Group DM: casino + general, no server/moderation commands.
const group = getSlashCommandsForSurface({ activeGroup: { id: "g" } });
for (const name of CASINO) assert.ok(names(group).includes(name), `group picker missing /${name}`);
assert.equal(names(group).includes("kick"), false);
assert.equal(names(group).includes("server"), false);

// One row per command: aliases are chips, not rows.
assert.equal(names(group).includes("cf"), false);
assert.equal(names(group).includes("send"), false);
assert.deepEqual(group.find((c) => c.name === "coinflip").aliases, ["cf"]);
assert.deepEqual(group.find((c) => c.name === "pay").aliases, ["gonder", "send", "tip"]);
assert.deepEqual(group.find((c) => c.name === "bj").aliases, ["blackjack"]);

// Server text channel honours permissions; casino stays visible.
const server = getSlashCommandsForSurface({
  activeChannel: { type: "text" },
  permissionFlags: { USE_APPLICATION_COMMANDS: true, KICK_MEMBERS: true },
});
for (const name of CASINO) assert.ok(names(server).includes(name), `server picker missing /${name}`);
assert.ok(names(server).includes("kick"));
assert.equal(names(server).includes("ban"), false);
const locked = getSlashCommandsForSurface({ activeChannel: { type: "text" }, permissionFlags: {} });
for (const name of CASINO) assert.ok(names(locked).includes(name), `casino /${name} hidden without app-command permission`);
assert.equal(names(locked).includes("kick"), false);

// 1:1 DM: casino + DM-safe general commands only.
const dm = getSlashCommandsForSurface({ activeDmUser: { id: "u2" } });
assert.deepEqual(names(dm).sort(), [...CASINO, "help", "user", "avatar", "poll"].sort());
// A text channel wins over a stale DM selection.
assert.ok(names(getSlashCommandsForSurface({ activeChannel: { type: "text" }, activeDmUser: { id: "u2" }, isOwner: true })).includes("purge"));

assert.deepEqual(getSlashCommandsForSurface({}), []);
assert.deepEqual(getSlashCommandsForSurface({ activeChannel: { type: "voice" } }), []);

// Filtering by name or alias.
assert.deepEqual(names(filterSlashCommandMatches(group, "/")), names(group));
const s = filterSlashCommandMatches(group, "/s");
assert.deepEqual(names(s), ["slot", "pay"]);
assert.equal(s[0].matchedAlias, undefined);
assert.equal(s[1].matchedAlias, "send");
const cf = filterSlashCommandMatches(group, "/cf");
assert.deepEqual(names(cf), ["coinflip"]);
assert.equal(cf[0].matchedAlias, "cf");
assert.equal(slashInsertText(cf[0]), "/cf 100");
assert.equal(slashInsertText(filterSlashCommandMatches(group, "/coin")[0]), "/coinflip 100");
assert.deepEqual(names(filterSlashCommandMatches(group, "/BAK")), ["credits"]);
assert.deepEqual(names(filterSlashCommandMatches(group, "/yar")), ["help"]);
assert.deepEqual(filterSlashCommandMatches(group, "/pay 500"), []);
assert.deepEqual(filterSlashCommandMatches(group, "hello"), []);
// A match from an earlier keystroke does not leak its alias.
assert.equal(filterSlashCommandMatches(cf, "/co")[0].matchedAlias, null);

// Grouped in menu order.
const grouped = groupSlashMatches(filterSlashCommandMatches(server, "/"));
assert.deepEqual(grouped.map((g) => g.id), ["games", "credits", "general", "moderation"]);
assert.deepEqual(names(grouped[0].items), ["bj", "slot", "coinflip"]);
assert.deepEqual(names(grouped[1].items), ["pay", "daily", "credits", "top"]);
assert.deepEqual(groupSlashMatches(filterSlashCommandMatches(group, "/zzz")), []);

// DM send routing.
for (const t of ["/cf 100 yazı", "/coinflip 50", "/pay @a 5", "/gonder @a 5", "/bakiye", "/help", "/yardım", "/hit", "/poll a | b | c", " /daily "]) {
  assert.ok(isDmSlashCommand(t), t);
}
for (const t of ["/kick @a", "/purge 5", "/server", "hello /cf", "/", "//cf"]) assert.equal(isDmSlashCommand(t), false, t);

// Native iOS app: casino commands are hidden from the picker.
const iosGroup = names(getSlashCommandsForSurface({ activeGroup: { id: "g" }, hideCasino: true }));
for (const name of CASINO) assert.equal(iosGroup.includes(name), false, `iOS picker still shows /${name}`);
assert.ok(iosGroup.includes("help"));
assert.deepEqual(names(getSlashCommandsForSurface({ activeDmUser: { id: "u2" }, hideCasino: true })).sort(), ["avatar", "help", "poll", "user"]);
globalThis.window = { Capacitor: { isNativePlatform: () => true, getPlatform: () => "ios" } };
assert.equal(getSlashCommandsForSurface({ activeGroup: { id: "g" } }).some((c) => c.casino), false);
delete globalThis.window;

console.log("slashCommands.selftest ok");
