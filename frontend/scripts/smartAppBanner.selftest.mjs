/**
 * iOS Smart App Banner (apple-itunes-app): exactly once on every prerendered marketing
 * shell, never in the native app copy (capacitor:copy:after hook), App Store id in one place.
 * The Pages worker side (no banner on app paths, invite URL as app-argument) is covered by
 * src/site/invitePreview.selftest.mjs.
 * Run: node scripts/smartAppBanner.selftest.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");
const { registerSiteCatalogs } = await import("./siteCatalogs.mjs");
await registerSiteCatalogs();
const { injectMeta } = await import(pathToFileURL(path.join(here, "prerender-seo.mjs")).href);
const { stripSmartBanner, stripDir, NATIVE_WEB_DIRS } = await import(pathToFileURL(path.join(here, "strip-smart-banner.mjs")).href);
const { PUBLIC_ROUTES } = await import(pathToFileURL(path.join(root, "src/site/seoConfig.js")).href);
const { APP_STORE_ID, APP_STORE_URL, SMART_APP_BANNER_META } = await import(pathToFileURL(path.join(root, "src/site/appStoreLink.js")).href);

const template = fs.readFileSync(path.join(root, "index.html"), "utf8");
const BANNER = /<meta name="apple-itunes-app" content="([^"]*)" \/>/g;

assert.equal(APP_STORE_URL, `https://apps.apple.com/app/id${APP_STORE_ID}`);
assert.equal(SMART_APP_BANNER_META, '<meta name="apple-itunes-app" content="app-id=6820558264" />');
assert.ok(template.includes(SMART_APP_BANNER_META), "index.html (homepage + crawl shell) carries the banner");

// Every indexable marketing shell: exactly one banner, plain app-id (no app-argument).
const indexable = PUBLIC_ROUTES.filter((r) => !r.noindex);
assert.ok(indexable.length > 50, "the marketing routes are loaded");
for (const p of ["/", "/features", "/download", "/tr", "/tr/discord-alternatifi", "/de/faq", "/blog/discord-competitors"]) {
  const route = indexable.find((r) => r.path === p);
  assert.ok(route, `${p} is an indexable route`);
  const html = injectMeta(template, route);
  const hits = [...html.matchAll(BANNER)];
  assert.equal(hits.length, 1, `${p}: one Smart App Banner`);
  assert.equal(hits[0][1], `app-id=${APP_STORE_ID}`, `${p}: app id`);
}
// A shell without the tag (older template) still gets one.
{
  const route = indexable.find((r) => r.path === "/features");
  const html = injectMeta(stripSmartBanner(template), route);
  assert.equal([...html.matchAll(BANNER)].length, 1, "added by prerender, not only copied from the template");
}

// Native app copy: the capacitor:copy:after hook strips the banner (and its comment) only.
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
assert.equal(pkg.scripts["capacitor:copy:after"], "node scripts/strip-smart-banner.mjs", "Capacitor runs the strip hook after copy/sync");
assert.deepEqual(NATIVE_WEB_DIRS, { ios: "ios/App/App/public", android: "android/app/src/main/assets/public" });
{
  const stripped = stripSmartBanner(template);
  assert.ok(!/apple-itunes-app|Smart App Banner/.test(stripped), "banner and comment removed");
  const otherLines = (s) => s.split("\n").filter((l) => !/apple-itunes-app|Smart App Banner/.test(l));
  assert.deepEqual(otherLines(stripped), otherLines(template), "nothing else changes");

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "smart-banner-"));
  try {
    fs.mkdirSync(path.join(tmp, "tr"), { recursive: true });
    fs.writeFileSync(path.join(tmp, "index.html"), template);
    fs.writeFileSync(path.join(tmp, "tr", "download.html"), injectMeta(template, indexable.find((r) => r.path === "/tr")));
    fs.writeFileSync(path.join(tmp, "app.js"), "/* apple-itunes-app */");
    assert.equal(stripDir(tmp), 2, "both HTML files changed");
    assert.ok(!fs.readFileSync(path.join(tmp, "tr", "download.html"), "utf8").includes("apple-itunes-app"));
    assert.equal(fs.readFileSync(path.join(tmp, "app.js"), "utf8"), "/* apple-itunes-app */", "only HTML files are touched");
    assert.equal(stripDir(tmp), 0, "idempotent");
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

console.log("smartAppBanner selftest ok");
