import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  COUNTRY_PRICE,
  codeFromFlag,
  countryName,
  countryRegions,
  flagEmoji,
  groupByLetter,
  isCountryItem,
  isTerritory,
  matchesCountry,
  sortCountries,
} from "./countryFlags.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");

const tr = { id: "1", category: "countries", country_code: "TR", name: "Türkiye", country_region: "europe,asia", country_kind: "country" };
const jp = { id: "2", category: "countries", country_code: "JP", name: "Japonya", country_region: "asia", country_kind: "country" };
const de = { id: "3", category: "countries", country_code: "DE", name: "Almanya", country_region: "europe", country_kind: "country" };
const pr = { id: "4", category: "countries", country_code: "PR", name: "Porto Riko", country_region: "north_america", country_kind: "territory" };

assert.equal(COUNTRY_PRICE, 250, "every flag costs 250 DesCoin");
assert.equal(flagEmoji("tr"), "🇹🇷");
assert.equal(codeFromFlag("🇯🇵"), "JP");
assert.equal(flagEmoji("X"), "", "invalid codes draw nothing");
assert.ok(isCountryItem(tr));
assert.equal(isCountryItem({ category: "profile_title", country_code: "TR" }), false);
assert.deepEqual(countryRegions(tr), ["europe", "asia"], "transcontinental countries list both regions");
assert.ok(isTerritory(pr));
assert.equal(countryName(tr, "tr"), "Türkiye");
assert.equal(countryName(jp, "en"), "Japan");

// Search: Turkish name, English name, ISO code, accent / dotless-i folding.
assert.ok(matchesCountry(tr, "turk"), "turk finds Türkiye");
assert.ok(matchesCountry(tr, "türkiye"));
assert.ok(matchesCountry(jp, "japan"), "English name");
assert.ok(matchesCountry(jp, "JP"), "ISO code");
assert.ok(matchesCountry(de, "germ"));
assert.equal(matchesCountry(de, "japan"), false);
assert.ok(matchesCountry(de, ""), "empty query matches everything");

const az = sortCountries([tr, jp, de], "az", "tr").map((i) => i.country_code);
assert.deepEqual(az, ["DE", "JP", "TR"], "Almanya < Japonya < Türkiye in Turkish order");
assert.equal(sortCountries([de, jp, tr], "popular", "tr")[0].country_code, "TR", "Türkiye leads Popular");
const groups = groupByLetter(sortCountries([tr, jp, de], "az", "tr"), "tr");
assert.deepEqual(groups.map((g) => g.letter), ["A", "J", "T"]);
const ax = { id: "5", category: "countries", country_code: "AX", name: "Åland Adaları", country_region: "europe", country_kind: "territory" };
const at = { id: "6", category: "countries", country_code: "AT", name: "Avusturya", country_region: "europe", country_kind: "sovereign" };
const tr2 = groupByLetter(sortCountries([de, ax, at, tr], "az", "tr"), "tr").map((g) => g.letter);
assert.deepEqual(tr2, ["A", "T"], "Åland folds into A, no duplicate A group");

// Bundled flag font + licence credit (Windows has no flag glyphs).
assert.ok(existsSync(join(root, "public", "fonts", "TwemojiCountryFlags.woff2")), "flag font is bundled");
const css = readFileSync(join(root, "src", "styles", "countries.css"), "utf8");
assert.match(css, /@font-face[\s\S]*Twemoji Country Flags[\s\S]*unicode-range: U\+1F1E6-1F1FF/);
assert.match(css, /html\.flag-font \{\s*--font-ui: "Twemoji Country Flags"/);
assert.match(readFileSync(join(root, "src", "styles.css"), "utf8"), /@import '\.\/styles\/countries\.css';/);
const panel = readFileSync(join(root, "src", "components", "layout", "UserPanel.jsx"), "utf8");
assert.match(panel, /id: "licenses"/, "Settings has a Licences page");
assert.match(panel, /CC-BY 4\.0/, "Twemoji credit names the licence");
assert.match(readFileSync(join(root, "src", "main.jsx"), "utf8"), /installFlagFont\(\);/);

console.log("countryFlags selftest OK");
