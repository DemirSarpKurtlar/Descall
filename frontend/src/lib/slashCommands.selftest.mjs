import assert from "node:assert/strict";
import {
  filterSlashCommandMatches,
  findSlashCommand,
  foldTr,
  getSlashCommandsForSurface,
  groupSlashMatches,
  isDmSlashCommand,
  slashArgState,
  slashInsertText,
  slashMenuSections,
  slashQueryOf,
  SLASH_COMMANDS,
  SLASH_GROUPS,
  TIMEOUT_DURATIONS,
} from "./slashCommands.js";
import { loadI18nCatalogs } from "../i18n/index.js";
import { setRuntimeLocale } from "../i18n/runtime.js";

// Texts come from the slash.* catalog in the UI language; these checks run in Turkish.
await loadI18nCatalogs("tr");
setRuntimeLocale("tr");

const CASINO = ["bj", "slot", "coinflip", "pay", "daily", "credits", "top"];
const names = (list) => list.map((c) => c.name);

// Every label is Turkish (no English source keys left in the menu).
for (const c of SLASH_COMMANDS) {
  assert.ok(c.label && c.description, `/${c.name} has a label and description`);
  assert.doesNotMatch(`${c.label} ${c.description}`, /\b(Show|Start|Send|Claim|Change|Delete|Time out|Kick|Ban|List|Spin|Flip)\b/, `/${c.name} still English`);
}

// Group DM: casino + general, no server/moderation commands.
const group = getSlashCommandsForSurface({ activeGroup: { id: "g" }, hideCasino: false });
for (const name of CASINO) assert.ok(names(group).includes(name), `group picker missing /${name}`);
assert.equal(names(group).includes("kick"), false);
assert.equal(names(group).includes("server"), false);
assert.ok(group.every((c) => !c.locked), "nothing is locked outside servers");

// One row per command: aliases are chips, not rows.
assert.equal(names(group).includes("cf"), false);
assert.deepEqual(group.find((c) => c.name === "coinflip").aliases, ["cf"]);
assert.deepEqual(group.find((c) => c.name === "pay").aliases, ["gonder", "send", "tip"]);
assert.deepEqual(group.find((c) => c.name === "help").aliases, ["yardım"]);

// Server text channel: commands without permission stay visible, greyed out with a lock.
const server = getSlashCommandsForSurface({
  activeChannel: { type: "text" },
  permissionFlags: { USE_APPLICATION_COMMANDS: true, KICK_MEMBERS: true, CHANGE_NICKNAME: true },
  hideCasino: false,
});
for (const name of CASINO) assert.ok(names(server).includes(name), `server picker missing /${name}`);
const byName = (list, n) => list.find((c) => c.name === n);
assert.equal(byName(server, "kick").locked, false);
assert.equal(byName(server, "ban").locked, true);
assert.equal(byName(server, "ban").lockReason, "“Üyeleri yasakla” yetkisi gerekiyor");
assert.equal(byName(server, "purge").locked, true);
const bare = getSlashCommandsForSurface({ activeChannel: { type: "text" }, permissionFlags: {}, hideCasino: false });
for (const name of CASINO) assert.equal(byName(bare, name).locked, false, `casino /${name} locked`);
assert.equal(byName(bare, "user").locked, true, "app commands need USE_APPLICATION_COMMANDS");
assert.equal(byName(bare, "user").lockPermission, "USE_APPLICATION_COMMANDS");
// /poll needs only Send Messages.
assert.equal(byName(bare, "poll").locked, false);
assert.equal(byName(getSlashCommandsForSurface({ activeChannel: { type: "text" }, permissionFlags: { SEND_MESSAGES: false } }), "poll").locked, true);
// Owner / administrator: nothing locked.
assert.ok(getSlashCommandsForSurface({ activeChannel: { type: "text" }, isOwner: true }).every((c) => !c.locked));
assert.ok(getSlashCommandsForSurface({ activeChannel: { type: "text" }, permissionFlags: { ADMINISTRATOR: true } }).every((c) => !c.locked));

// 1:1 DM: casino + DM-safe general commands only.
const dm = getSlashCommandsForSurface({ activeDmUser: { id: "u2" }, hideCasino: false });
assert.deepEqual(names(dm).sort(), [...CASINO, "help", "user", "avatar", "poll"].sort());
assert.ok(names(getSlashCommandsForSurface({ activeChannel: { type: "text" }, activeDmUser: { id: "u2" }, isOwner: true })).includes("purge"));
assert.deepEqual(getSlashCommandsForSurface({}), []);
assert.deepEqual(getSlashCommandsForSurface({ activeChannel: { type: "voice" } }), []);

// Turkish folding.
assert.equal(foldTr("KULLANICI"), "kullanici");
assert.equal(foldTr("Kullanıcı"), "kullanici");
assert.equal(foldTr("Şğüöç İ"), "sguoc i");

// Fuzzy search: name prefix, alias prefix, Turkish label, keywords, accent-free.
assert.deepEqual(names(filterSlashCommandMatches(group, "/")), names(group));
const kul = filterSlashCommandMatches(server, "/kul");
assert.equal(kul[0].name, "user", "label “Kullanıcı kartı” wins");
assert.deepEqual(kul[0].highlight, { field: "label", ranges: [[0, 3]] });
for (const n of ["avatar", "timeout", "kick", "ban", "pay"]) assert.ok(names(kul).includes(n), `/kul finds /${n}`);
assert.equal(filterSlashCommandMatches(server, "/kullanici")[0].name, "user");
assert.equal(filterSlashCommandMatches(server, "/anket")[0].name, "poll");
assert.equal(filterSlashCommandMatches(server, "/oylama")[0].name, "poll");
const cf = filterSlashCommandMatches(group, "/cf");
assert.equal(cf[0].name, "coinflip");
assert.equal(cf[0].matchedAlias, "cf");
assert.equal(slashInsertText(cf[0]), "/cf 100");
assert.equal(slashInsertText(filterSlashCommandMatches(group, "/coin")[0]), "/coinflip 100");
assert.equal(filterSlashCommandMatches(group, "/BAK")[0].name, "credits");
assert.equal(filterSlashCommandMatches(group, "/yar")[0].name, "help");
assert.equal(filterSlashCommandMatches(group, "/yardım")[0].name, "help");
assert.deepEqual(filterSlashCommandMatches(group, "/pay 500"), []);
assert.deepEqual(filterSlashCommandMatches(group, "hello"), []);
assert.deepEqual(filterSlashCommandMatches(group, "/selam"), [], "unknown → empty state");
assert.equal(slashQueryOf("/user yi"), null);
assert.equal(slashQueryOf("/us"), "us");

// Sections: category order without a query, "En iyi eşleşme" first with one.
const grouped = groupSlashMatches(filterSlashCommandMatches(server, "/"));
assert.deepEqual(grouped.map((g) => g.id), ["general", "moderation", "games", "credits"]);
assert.equal(grouped[0].items[0].name, "poll", "/poll leads Genel");
const sec = slashMenuSections(kul, { query: "kul" });
assert.equal(sec[0].label, "En iyi eşleşme");
assert.deepEqual(names(sec[0].items), ["user"]);
assert.deepEqual(slashMenuSections(filterSlashCommandMatches(server, "/"), { category: "moderation" }).map((s) => s.id), ["moderation"]);

// Argument step.
assert.deepEqual(
  (({ cmd, argIndex, argText }) => [cmd.name, argIndex, argText])(slashArgState("/timeout @yi")),
  ["timeout", 0, "@yi"]
);
assert.equal(slashArgState("/timeout @yigit 5").argIndex, 1);
assert.equal(slashArgState("/user"), null);
assert.equal(findSlashCommand("yardım").name, "help");
assert.equal(findSlashCommand("anket").name, "poll");

// DM send routing.
for (const t of ["/cf 100 yazı", "/coinflip 50", "/pay @a 5", "/gonder @a 5", "/bakiye", "/help", "/yardım", "/Yardım", "/hit", "/poll a | b | c", "/anket a | b", " /daily "]) {
  assert.ok(isDmSlashCommand(t), t);
}
for (const t of ["/kick @a", "/purge 5", "/server", "hello /cf", "/", "//cf"]) assert.equal(isDmSlashCommand(t), false, t);

// The same menu in English: labels, hints and keywords follow the UI language.
setRuntimeLocale("en");
assert.equal(findSlashCommand("user").label, "User card");
assert.deepEqual(findSlashCommand("timeout").args.map((x) => x.name), ["@user", "duration", "reason"]);
assert.equal(byName(getSlashCommandsForSurface({ activeChannel: { type: "text" }, permissionFlags: {} }), "ban").lockReason, "Requires the “Use application commands” permission");
assert.equal(filterSlashCommandMatches(getSlashCommandsForSurface({ activeGroup: { id: "g" } }), "/vot")[0].name, "poll", "English keyword");
assert.deepEqual(SLASH_GROUPS.map((g) => g.label), ["General", "Moderation", "Games", "Credits"]);
assert.match(TIMEOUT_DURATIONS[1].label, /^5 min/);
assert.deepEqual(findSlashCommand("help").usage, [["/help", ""], ["/yardım", "same command"]]);
setRuntimeLocale("tr");
assert.equal(TIMEOUT_DURATIONS[5].label, "1 hafta");
assert.equal(findSlashCommand("poll").usage[1][0], "/poll Soru | Evet | Hayır");

// Native iOS app: casino commands are hidden from the picker.
const iosGroup = names(getSlashCommandsForSurface({ activeGroup: { id: "g" }, hideCasino: true }));
for (const name of CASINO) assert.equal(iosGroup.includes(name), false, `iOS picker still shows /${name}`);

console.log("slashCommands selftest ok");
