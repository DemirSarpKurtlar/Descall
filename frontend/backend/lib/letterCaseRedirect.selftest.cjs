"use strict";
// Run: node backend/lib/letterCaseRedirect.selftest.cjs
const assert = require("assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { letterCaseRedirect, letterCaseTarget } = require("./letterCaseRedirect");

const dist = fs.mkdtempSync(path.join(os.tmpdir(), "letter-case-"));
try {
  for (const f of ["index.html", "features.html", "tr.html", "tr/blog.html", "de/compare/discord.html", "assets/App-X.js"]) {
    fs.mkdirSync(path.dirname(path.join(dist, f)), { recursive: true });
    fs.writeFileSync(path.join(dist, f), "x");
  }
  assert.equal(letterCaseTarget(dist, "/Features"), "/features");
  assert.equal(letterCaseTarget(dist, "/TR/Blog"), "/tr/blog");
  assert.equal(letterCaseTarget(dist, "/TR"), "/tr");
  assert.equal(letterCaseTarget(dist, "/De/Compare/Discord/"), "/de/compare/discord");
  assert.equal(letterCaseTarget(dist, "/features"), null, "lower case is served as is");
  assert.equal(letterCaseTarget(dist, "/Nope"), null, "unknown page: no redirect (404 / app shell)");
  assert.equal(letterCaseTarget(dist, "/assets/App-X.js"), null, "files are never folded");
  assert.equal(letterCaseTarget(dist, "/s/AbC"), null, "invite codes keep their case");
  assert.equal(letterCaseTarget(dist, "/API/Status"), null, "API paths are never folded");
  assert.equal(letterCaseTarget(dist, "/../Etc/Passwd"), null, "never outside dist");

  const calls = [];
  const res = { setHeader() {}, redirect: (code, to) => calls.push([code, to]) };
  let nexts = 0;
  const mw = letterCaseRedirect(dist);
  mw({ method: "GET", path: "/Features", originalUrl: "/Features?ref=x" }, res, () => nexts++);
  mw({ method: "POST", path: "/Features", originalUrl: "/Features" }, res, () => nexts++);
  mw({ method: "GET", path: "/features", originalUrl: "/features" }, res, () => nexts++);
  assert.deepEqual(calls, [[301, "/features?ref=x"]], "301 with the query kept");
  assert.equal(nexts, 2);

  // Wired into the server before the SPA fallbacks.
  const server = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
  const use = server.indexOf("letterCaseRedirect(distPath)");
  assert.ok(use > 0, "server.js mounts letterCaseRedirect");
  assert.ok(use < server.indexOf("shouldServeSpaShell(req)"), "before the SPA shell fallback");
} finally {
  fs.rmSync(dist, { recursive: true, force: true });
}
console.log("letterCaseRedirect.selftest: ok");
