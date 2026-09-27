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
  { id: "dimaai" },
  { id: "friends" },
];

applyPublicFeatures({ valorantLfg: true, valorantCompanion: true, dimaai: true });
let visible = filterMainNavItems(items, getPublicFeatures());
assert(visible.map((item) => item.id).join(",") === "chat,servers,play,dimaai,friends", "both valorant features keep Play");
assert(resolveValorantTab("lfg", getPublicFeatures()) === "lfg", "stored lfg kept when both on");
assert(resolveValorantTab(null, getPublicFeatures()) === "companion", "default tab is companion");

applyPublicFeatures({ valorantLfg: false, valorantCompanion: true, dimaai: true });
visible = filterMainNavItems(items, getPublicFeatures());
assert(visible.some((item) => item.id === "play"), "companion alone keeps Play");
assert(resolveValorantTab("lfg", getPublicFeatures()) === "companion", "disabled lfg cannot stay selected");
assert(!visible.some((item) => item.id === "play" && item.hidden), "play is removed from the list, not hidden in place");

applyPublicFeatures({ valorantLfg: true, valorantCompanion: false, dimaai: true });
assert(resolveValorantTab("companion", getPublicFeatures()) === "lfg", "disabled companion falls back to lfg");
assert(valorantPlayVisible(getPublicFeatures()), "lfg alone keeps the play destination");

applyPublicFeatures({ valorantLfg: false, valorantCompanion: false, dimaai: true });
visible = filterMainNavItems(items, getPublicFeatures());
assert(!visible.some((item) => item.id === "play"), "both valorant features off removes Play");
assert(visible.map((item) => item.id).join(",") === "chat,servers,dimaai,friends", "no gap where Play was");
assert(resolveValorantTab("companion", getPublicFeatures()) === null, "hub exits when both are off");

applyPublicFeatures({ valorantLfg: true, valorantCompanion: true, dimaai: false });
visible = filterMainNavItems(items, getPublicFeatures());
assert(!visible.some((item) => item.id === "dimaai"), "dimaai off removes its nav item");
assert(visible.map((item) => item.id).join(",") === "chat,servers,play,friends", "no gap where DimaAI was");

const legacy = normalizePublicFeatures({ voice: false });
assert(legacy.valorantLfg && legacy.valorantCompanion && legacy.dimaai, "missing flags default on");
applyPublicFeatures({});
assert(getPublicFeatures().dimaai === true, "empty payload stays enabled");

const stale = "lfg";
assert(resolveValorantTab(stale, { valorantLfg: false, valorantCompanion: true, dimaai: true }) === "companion", "stale session tab is ignored");

console.log("publicFeatures.selftest.mjs ok");
