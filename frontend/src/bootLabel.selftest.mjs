// B2: the phone splash label must not flip "Yükleniyor" -> "Loading" for Turkish
// users while the i18n catalogs are still loading.
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
const src = readFileSync(new URL("./main.jsx", import.meta.url), "utf8");
assert.doesNotMatch(src, /^if \(statusEl\) statusEl\.textContent = translate\(bootLocale, "Loading"\);/m, "unguarded boot label overwrite is back");
assert.match(src, /if \(statusEl && !window\.__descallBootTr\) statusEl\.textContent = translate\(bootLocale, "Loading"\);/);
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
assert.match(html, /bootLabel\.textContent = "Yükleniyor"/, "inline splash still sets the Turkish label");
assert.doesNotMatch(html, /status\.textContent = "Ready";/, "hide path must not force English for Turkish users");
assert.equal(html.match(/window\.__descallBootTr \? "Hazır" : "Ready"/g)?.length, 2, "both splash hide paths keep the Turkish label");
assert.match(html, /window\.__descallBootTr = bootTr;/);
console.log("bootLabel.selftest ok");
