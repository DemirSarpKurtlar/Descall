/**
 * Google Play listing drafts (docs/play-store/listings/<locale>/) stay inside Play's limits
 * and free of words the store copy must never use, and the website does not advertise
 * Google Play before the app is published there.
 * Run: node scripts/playStoreListing.selftest.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repo = path.resolve(frontend, "..");
const listings = path.join(repo, "docs/play-store/listings");

const LOCALES = ["tr-TR", "en-US", "de-DE", "es-ES", "fr-FR", "pt-BR", "ru-RU"];
const LIMITS = {
  "title.txt": 30,
  "short_description.txt": 80,
  "full_description.txt": 4000,
  "release_notes_template.txt": 500,
};
// Same list as appstore/asc_metadata.py BANNED_LISTING plus src/noRetiredGameFeature.selftest.mjs.
const BANNED = new RegExp(
  ["valo" + "rant", "\\bri" + "ot", "lf" + "g", "looking for " + "group", "takım " + "bul", "dima ?ai", "call recording", "record calls", "arama kayd", "görüşme kayd"].join("|"),
  "i",
);
// The Android listing must not promise iOS-only features.
const IOS_ONLY = /iPhone|iPad|Apple|App Store|CallKit|Watch/;
const EMOJI = /\p{Extended_Pictographic}/u;

assert.deepEqual(fs.readdirSync(listings).sort(), [...LOCALES].sort(), "one folder per Play locale");
for (const locale of LOCALES) {
  for (const [file, max] of Object.entries(LIMITS)) {
    const p = path.join(listings, locale, file);
    assert.ok(fs.existsSync(p), `${locale}/${file} exists`);
    const text = fs.readFileSync(p, "utf8").replace(/\n$/, "");
    const length = [...text].length;
    assert.ok(length > 0 && length <= max, `${locale}/${file}: ${length} chars (max ${max})`);
    assert.ok(!BANNED.test(text), `${locale}/${file} uses a banned word`);
    assert.ok(!IOS_ONLY.test(text), `${locale}/${file} mentions an iOS-only feature`);
    assert.ok(!EMOJI.test(text), `${locale}/${file} has an emoji`);
    if (file === "title.txt" || file === "short_description.txt") {
      assert.ok(!text.includes("\n"), `${locale}/${file} is one line`);
    }
  }
  const full = fs.readFileSync(path.join(listings, locale, "full_description.txt"), "utf8");
  assert.ok(full.includes("https://descall.com/privacy"), `${locale} links the privacy policy`);
}

for (const doc of ["README.md", "data-safety.md", "content-rating.md", "screenshots.md", "assetlinks.template.json"]) {
  assert.ok(fs.existsSync(path.join(repo, "docs/play-store", doc)), `docs/play-store/${doc} exists`);
}
const template = JSON.parse(fs.readFileSync(path.join(repo, "docs/play-store/assetlinks.template.json"), "utf8"));
assert.equal(template[0].target.package_name, "com.descall.app");
assert.deepEqual(template[0].relation, ["delegate_permission/common.handle_all_urls"]);

// Not on Google Play yet: no store link on the site, its structured data or download pages.
for (const rel of [
  "src/site/jsonLdBuilders.js",
  "src/site/pages/MarketingDownloadPage.jsx",
  "src/components/download/DownloadPage.jsx",
  "src/site/seo/pageTwins.js",
  "index.html",
]) {
  const text = fs.readFileSync(path.join(frontend, rel), "utf8");
  assert.ok(!/play\.google\.com|market:\/\//.test(text), `${rel} must not link Google Play yet`);
}

console.log("playStoreListing selftest ok");
