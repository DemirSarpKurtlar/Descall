// IndexNow helper: sitemap parsing, changed-URL diff, payload, key file and workflow wiring.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  BUILD_ID_FILE,
  INDEXNOW_ENDPOINT,
  INDEXNOW_KEY,
  KEY_LOCATION,
  buildPayload,
  changedUrls,
  describeStatus,
  isSubmittable,
  parseSitemapIndex,
  parseUrlset,
} from "./indexnow-submit.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const frontend = path.resolve(here, "..");
const repo = path.resolve(frontend, "..");

// Key file in public/ (copied to dist/ by Vite and rewritten by generate-seo-files).
assert.match(INDEXNOW_KEY, /^[a-f0-9]{32}$/);
assert.equal(fs.readFileSync(path.join(frontend, "public", `${INDEXNOW_KEY}.txt`), "utf8").trim(), INDEXNOW_KEY);
assert.equal(KEY_LOCATION, `https://descall.com/${INDEXNOW_KEY}.txt`);
assert.equal(INDEXNOW_ENDPOINT, "https://api.indexnow.org/indexnow");

// generate-seo-files writes the key file and the deploy marker the workflow waits for.
const gen = fs.readFileSync(path.join(here, "generate-seo-files.mjs"), "utf8");
assert.ok(gen.includes("INDEXNOW_KEY") && gen.includes("BUILD_ID_FILE"), "generate-seo-files must write the key file and build-id.txt");
assert.ok(gen.includes("CF_PAGES_COMMIT_SHA"), "build-id.txt must name the Cloudflare Pages commit");
assert.equal(BUILD_ID_FILE, "build-id.txt");

// Parsing (element order of the real files: loc, lastmod, ..., xhtml:link, image:image).
const index = `<?xml version="1.0"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap><loc>https://descall.com/sitemap-en.xml</loc><lastmod>2026-11-08T00:00:00.000Z</lastmod></sitemap>
  <sitemap><loc>https://descall.com/sitemap-tr.xml</loc></sitemap>
</sitemapindex>`;
assert.deepEqual(parseSitemapIndex(index), ["https://descall.com/sitemap-en.xml", "https://descall.com/sitemap-tr.xml"]);
assert.deepEqual(parseSitemapIndex("<urlset></urlset>"), []);
const urlset = `<urlset>
  <url>
    <loc>https://descall.com/</loc>
    <lastmod>2026-11-13T00:00:00.000Z</lastmod>
    <xhtml:link rel="alternate" hreflang="tr" href="https://descall.com/tr" />
    <image:image><image:loc>https://descall.com/brand/previews/a.webp</image:loc></image:image>
  </url>
  <url><loc>https://descall.com/a?x=1&amp;y=2</loc><lastmod>2026-11-01</lastmod></url>
</urlset>`;
assert.deepEqual(parseUrlset(urlset), [
  { loc: "https://descall.com/", lastmod: "2026-11-13T00:00:00.000Z" },
  { loc: "https://descall.com/a?x=1&y=2", lastmod: "2026-11-01" },
]);

// Only https://descall.com URLs.
assert.ok(isSubmittable("https://descall.com/tr"));
assert.ok(!isSubmittable("http://descall.com/tr"));
assert.ok(!isSubmittable("https://www.descall.com/tr"));
assert.ok(!isSubmittable("https://descall.com/#x"));
assert.ok(!isSubmittable("not a url"));

// Diff: new URLs and moved lastmod; removed URLs are not sent.
const before = { "https://descall.com/": "2026-11-07", "https://descall.com/a": "2026-11-01", "https://descall.com/gone": "2026-10-01" };
const after = { "https://descall.com/": "2026-11-13", "https://descall.com/a": "2026-11-01", "https://descall.com/new": "2026-11-13", "https://evil.example/": "2026-11-13" };
assert.deepEqual(changedUrls(before, after), ["https://descall.com/", "https://descall.com/new"]);
// No usable snapshot: lastmod day on or after `sinceDay`.
assert.deepEqual(changedUrls(null, after, { sinceDay: "2026-11-12" }), ["https://descall.com/", "https://descall.com/new"]);
assert.deepEqual(changedUrls(null, after), []);

// Payload.
const payload = buildPayload(["https://descall.com/", "https://descall.com/", "http://descall.com/x"]);
assert.deepEqual(payload, { host: "descall.com", key: INDEXNOW_KEY, keyLocation: KEY_LOCATION, urlList: ["https://descall.com/"] });
assert.throws(() => buildPayload(Array.from({ length: 10001 }, (_, i) => `https://descall.com/p${i}`)));
assert.match(describeStatus(202), /accepted/);
assert.match(describeStatus(403), /key/);

// Workflow: push to main, waits for the deploy, never the Google Indexing API.
const wf = fs.readFileSync(path.join(repo, ".github/workflows/indexnow.yml"), "utf8");
assert.ok(/branches: \[main\]/.test(wf), "indexnow.yml runs on main");
for (const step of ["snapshot", "wait --sha", "submit --before"]) assert.ok(wf.includes(step), `indexnow.yml misses the ${step} step`);
assert.ok(!/indexing\.googleapis|urlNotifications/i.test(wf + fs.readFileSync(path.join(here, "indexnow-submit.mjs"), "utf8")), "no Google Indexing API");

console.log("indexnow-submit.selftest: ok");
