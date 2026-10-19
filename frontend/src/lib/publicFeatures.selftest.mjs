/**
 * Run: node frontend/src/lib/publicFeatures.selftest.mjs
 * 2.13.0: the Play tab is gone. Public features carry only the glass switches,
 * and nothing the server sends can bring a Play destination back.
 */
import { readFileSync } from "node:fs";
import {
  applyPublicFeatures,
  filterMainNavItems,
  getPublicFeatures,
  normalizePublicFeatures,
} from "./publicFeatures.js";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const legacy = normalizePublicFeatures({ voice: false, valorantLfg: true, valorantCompanion: true });
assert(Object.keys(legacy).sort().join(",") === "desktopGlass,iosGlass", "only glass switches survive");
assert(legacy.iosGlass === true, "iOS glass defaults on");
assert(legacy.desktopGlass === false, "desktop glass stays off until the server says true");
assert(normalizePublicFeatures({ desktopGlass: true }).desktopGlass === true, "desktop glass on when flagged");
applyPublicFeatures({ iosGlass: false });
assert(getPublicFeatures().iosGlass === false, "iOS glass kill switch applies");
applyPublicFeatures({});

const items = [{ id: "chat" }, { id: "servers" }, null, { id: "friends" }];
assert(filterMainNavItems(items).map((i) => i.id).join(",") === "chat,servers,friends", "no gaps in the nav list");

const src = readFileSync(new URL("./publicFeatures.js", import.meta.url), "utf8");
assert(!/valorant|lfg|riot/i.test(src), "no Play/Valorant flags in the client");

console.log("publicFeatures.selftest.mjs ok");
