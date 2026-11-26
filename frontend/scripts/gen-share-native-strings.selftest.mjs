// The iOS share extension and the Android share worker carry the same strings as the web
// share sheet (src/i18n/locales/shareSheet.*.js). Fails when a generated copy is stale.
// Run: node scripts/gen-share-native-strings.selftest.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { generate } from "./gen-share-native-strings.mjs";

const { cat, files } = await generate();
for (const [path, body] of files) {
  assert.equal(readFileSync(path, "utf8"), body, `${path} is out of date: run node scripts/gen-share-native-strings.mjs`);
}
const keys = Object.keys(cat.en).sort();
for (const id of Object.keys(cat)) assert.deepEqual(Object.keys(cat[id]).sort(), keys, `${id}: same keys as en`);
const xml = readFileSync(files.find(([p]) => p.endsWith("values-ru/share_strings.xml"))[0], "utf8");
assert.match(xml, /<item quantity="few">Отправка в %1\$d чата<\/item>/, "Russian plural forms survive");
assert.match(readFileSync(files[0][0], "utf8"), /"tr": \[/);
console.log("gen-share-native-strings selftest: ok");
