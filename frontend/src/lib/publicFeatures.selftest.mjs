/**
 * Run: node frontend/src/lib/publicFeatures.selftest.mjs
 */
import {
  applyPublicFeatures,
  filterMainNavItems,
  getPublicFeatures,
  normalizePublicFeatures,
  resolveValorantTab,
  valorantPlayVisible,
} from "./publicFeatures.js";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const items = [
  { id: "chat" },
  { id: "servers" },
  { id: "play" },
  { id: "friends" },
];

applyPublicFeatures({ valorantLfg: true, valorantCompanion: true });
let visible = filterMainNavItems(items, getPublicFeatures());
assert(visible.map((item) => item.id).join(",") === "chat,servers,play,friends", "both valorant features keep Play");
assert(resolveValorantTab("lfg", getPublicFeatures()) === "lfg", "stored lfg kept when both on");
assert(resolveValorantTab(null, getPublicFeatures()) === "companion", "default tab is companion");

applyPublicFeatures({ valorantLfg: false, valorantCompanion: true });
visible = filterMainNavItems(items, getPublicFeatures());
assert(visible.some((item) => item.id === "play"), "companion alone keeps Play");
assert(resolveValorantTab("lfg", getPublicFeatures()) === "companion", "disabled lfg cannot stay selected");
assert(!visible.some((item) => item.id === "play" && item.hidden), "play is removed from the list, not hidden in place");

applyPublicFeatures({ valorantLfg: true, valorantCompanion: false });
assert(resolveValorantTab("companion", getPublicFeatures()) === "lfg", "disabled companion falls back to lfg");
assert(valorantPlayVisible(getPublicFeatures()), "lfg alone keeps the play destination");

applyPublicFeatures({ valorantLfg: false, valorantCompanion: false });
visible = filterMainNavItems(items, getPublicFeatures());
assert(!visible.some((item) => item.id === "play"), "both valorant features off removes Play");
assert(visible.map((item) => item.id).join(",") === "chat,servers,friends", "no gap where Play was");
assert(resolveValorantTab("companion", getPublicFeatures()) === null, "hub exits when both are off");

const legacy = normalizePublicFeatures({ voice: false });
assert(legacy.valorantLfg && legacy.valorantCompanion, "missing flags default on");
applyPublicFeatures({});
assert(getPublicFeatures().valorantLfg === true, "empty payload stays enabled");

const stale = "lfg";
// Native iOS shell never offers the Companion tab.
globalThis.window = { Capacitor: { isNativePlatform: () => true, getPlatform: () => "ios" } };
assert(normalizePublicFeatures({ valorantLfg: true, valorantCompanion: true }).valorantCompanion === false, "iOS hides Companion");
assert(resolveValorantTab("companion", { valorantLfg: true, valorantCompanion: true }) === "lfg", "iOS falls back to LFG");
delete globalThis.window;

assert(resolveValorantTab(stale, { valorantLfg: false, valorantCompanion: true }) === "companion", "stale session tab is ignored");

console.log("publicFeatures.selftest.mjs ok");
