// node src/site/pages/marketingDownloadLinks.selftest.mjs
// Screenshot 77 (Nov 2026): "Windows için indir" looked dead. The .exe link opened with
// target="_blank": a blank tab flashed and closed and nothing changed on the page. A direct
// file now downloads from this tab, the page says the download is on its way, and offers a
// direct link plus the releases page.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "MarketingDownloadPage.jsx"), "utf8");

// The helper, evaluated from the source (the page itself needs React and the router).
const m = src.match(/export function downloadLinkProps\(url\) \{[\s\S]*?\n\}/);
assert.ok(m, "downloadLinkProps is exported");
const downloadLinkProps = new Function(`${m[0].replace("export ", "")}; return downloadLinkProps;`)();
assert.deepEqual(downloadLinkProps("https://github.com/o/r/releases/latest/download/Descall-Setup.exe"), { rel: "noopener" });
assert.deepEqual(downloadLinkProps("https://github.com/o/r/releases/download/v4.1.4/Descall-APK-v4.1.4.apk"), { rel: "noopener" });
assert.equal(downloadLinkProps("https://github.com/o/r/releases/latest").target, "_blank", "a web page opens in a new tab");

// Every link to downloadUrl goes through the helper; none hard-codes target="_blank".
const anchors = src.match(/<a\b[^>]*href=\{downloadUrl\}[^>]*>/g) || [];
assert.ok(anchors.length >= 3, "primary, secondary and direct-link anchors");
for (const a of anchors) {
  assert.match(a, /\{\.\.\.downloadLinkProps\(downloadUrl\)\}/, a);
  assert.doesNotMatch(a, /target="_blank"/, a);
}
assert.match(src, /setStarted\(selectedPlatform\)/, "a click records the started state");
assert.match(src, /className="mkt-download-started" role="status"/, "the started line is announced");
assert.match(src, /t\("All releases on GitHub"\)/, "fallback to the releases page");

// The prerendered twin's CTA is a plain same-tab link too.
const twins = readFileSync(join(here, "../seo/pageTwins.js"), "utf8");
assert.doesNotMatch(twins.match(/seo-tw-dl-cta[^>]*>/)[0], /_blank/);

console.log("marketingDownloadLinks selftest ok");
