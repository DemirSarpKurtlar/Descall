import {
  appPathForView,
  directPath,
  groupPath,
  isAuthenticatedAppPath,
  parseAppRoute,
} from "./appRoutes.js";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(directPath("Ada Test") === "/direct/Ada%20Test", "encode direct usernames");
assert(groupPath("group-123") === "/groups/group-123", "group route");
assert(appPathForView("friends") === "/friends", "friends menu route");
assert(isAuthenticatedAppPath("/direct/ada"), "recognize DM app route");
assert(!isAuthenticatedAppPath("/features"), "keep marketing route public");
assert(parseAppRoute("/direct/Ada%20Test").username === "Ada Test", "parse DM username");
assert(parseAppRoute("/groups/group-123").groupId === "group-123", "parse group id");
assert(parseAppRoute("/settings/voice").settingsTab === "voice", "parse settings tab");
assert(parseAppRoute("/not-real").unknown, "unknown route fallback");
// Pasted Market 2.0 look links open the shop, never the unknown-route fallback (/direct).
assert(isAuthenticatedAppPath("/shop/look/set/gece-limani"), "look link is an app route");
assert(!parseAppRoute("/shop/look/set/gece-limani").unknown, "look link is not unknown");
assert(parseAppRoute("/shop/look/item/abc-1").settingsTab === "shop", "look link opens the shop");

// An invite landing is not server "join": the route guard ("server not in my list" ->
// /servers) bounced the user off the server they had just joined through the invite.
{
  const r = parseAppRoute("/servers/join/GOODCODE");
  assert(r.view === "servers", "invite path stays in the servers view");
  assert(r.serverId === null, "invite path has no server id");
  assert(r.channelId === null, "invite path has no channel id");
  assert(r.serverInvite === "GOODCODE", "invite path keeps the code");
  assert(parseAppRoute("/servers/JOIN/abc1").serverInvite === "abc1", "invite path is case-insensitive");
  assert(parseAppRoute("/servers/join").serverInvite === "", "bare /servers/join is still an invite path");
  const s = parseAppRoute("/servers/s-1/c-2");
  assert(s.serverId === "s-1" && s.channelId === "c-2" && s.serverInvite === undefined, "real server routes unchanged");
  assert(parseAppRoute("/servers").serverId === null && parseAppRoute("/servers").serverInvite === undefined, "servers home unchanged");
}

console.log("appRoutes.selftest.mjs: ok");
