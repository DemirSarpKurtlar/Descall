// node backend/routes/appRelease.selftest.cjs
// Screenshot 77 (Nov 2026): with the GitHub API rate-limited, /api/app/latest-release served
// the fallback with no version, so the download card read a bare "Latest release". The
// fallback now takes the tag from the releases/latest redirect, which has no API limit.
"use strict";
const assert = require("node:assert/strict");
const { _test } = require("./appRelease");
const { tagFromLocation, latestTagFromRedirect, fallbackWithTag, FALLBACK_RELEASE } = _test;

assert.equal(tagFromLocation("https://github.com/DemirSarpKurtlar/Descall/releases/tag/v4.1.4"), "v4.1.4");
assert.equal(tagFromLocation("https://github.com/x/y/releases/tag/4.2.0-beta.1"), "4.2.0-beta.1");
assert.equal(tagFromLocation("https://github.com/x/y/releases"), null, "no tag: plain releases page");
assert.equal(tagFromLocation("https://github.com/x/y/releases/tag/%3Cscript%3E"), null, "only version tags");
assert.equal(tagFromLocation(null), null);

const fb = fallbackWithTag("v4.1.4");
assert.equal(fb.tagName, "v4.1.4");
assert.equal(fb.version, "4.1.4");
assert.equal(fb.fallback, true);
assert.equal(fb.windowsDownloadUrl, FALLBACK_RELEASE.windowsDownloadUrl, "the stable Setup link keeps working");
assert.match(fb.htmlUrl, /\/releases\/tag\/v4\.1\.4$/);
assert.equal(fallbackWithTag(null), FALLBACK_RELEASE);

(async () => {
  const seen = [];
  const fake = async (url, init) => {
    seen.push({ url, init });
    return { headers: { get: (h) => (h.toLowerCase() === "location" ? "https://github.com/DemirSarpKurtlar/Descall/releases/tag/v9.9.9" : null) } };
  };
  assert.equal(await latestTagFromRedirect(fake), "v9.9.9");
  assert.equal(seen[0].init.redirect, "manual", "reads the redirect, does not follow it");
  assert.match(seen[0].url, /\/releases\/latest$/);
  assert.equal(await latestTagFromRedirect(async () => { throw new Error("offline"); }), null, "network error: no tag, no throw");
  console.log("appRelease selftest ok");
})().catch((e) => { console.error(e); process.exit(1); });
