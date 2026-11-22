"use strict";
// Tauri updater feed (/api/desktop/tauri/{{target}}/{{arch}}/{{current_version}}): before this
// route existed every installed app got a 404 here every 5 minutes before falling back to GitHub.
const assert = require("assert");
const http = require("http");
const express = require("express");
const { createFeed, answer, compareVersions, validManifest } = require("../lib/desktopTauriUpdates");
const { createRouter } = require("../routes/desktopTauriUpdates");

const SIG = "dW50cnVzdGVkIGNvbW1lbnQ6IHNpZ25hdHVyZQ==";
function manifest(version, url = `https://github.com/DemirSarpKurtlar/Descall/releases/download/desktop-v${version}/Descall-Desktop-${version}-x64-setup.exe`) {
  const entry = { signature: SIG, url };
  return { version, notes: "n", pub_date: "2026-11-22T00:00:00Z", platforms: { "windows-x86_64-nsis": entry, "windows-x86_64": entry } };
}

function fakeFetch(script) {
  const calls = [];
  const fn = async (url, opts) => {
    calls.push(url);
    const step = script.length > 1 ? script.shift() : script[0];
    if (step instanceof Error) throw step;
    if (step === "hang") {
      return new Promise((_res, rej) => opts.signal.addEventListener("abort", () => rej(new Error("aborted"))));
    }
    return { ok: step.status === 200, status: step.status, text: async () => (typeof step.body === "string" ? step.body : JSON.stringify(step.body)) };
  };
  fn.calls = calls;
  return fn;
}

const quiet = { warn() {} };

async function request(app, path) {
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address();
  try {
    const res = await fetch(`http://127.0.0.1:${port}${path}`);
    const text = await res.text();
    return { status: res.status, text, cache: res.headers.get("cache-control") };
  } finally {
    await new Promise((r) => server.close(r));
  }
}

(async () => {
  // semver order the plugin uses
  assert.strictEqual(compareVersions("4.1.1", "4.1.0"), 1);
  assert.strictEqual(compareVersions("4.1.0", "4.1.0"), 0);
  assert.strictEqual(compareVersions("4.10.0", "4.9.9"), 1);
  assert.strictEqual(compareVersions("4.1.0", "4.1.0-beta.2"), 1);
  assert.strictEqual(compareVersions("4.1.0-beta.10", "4.1.0-beta.2"), 1);
  assert.strictEqual(compareVersions("x", "4.1.0"), null);

  // shape checks: no signature or a download off GitHub is not served
  assert.ok(validManifest(manifest("4.2.0")));
  assert.strictEqual(validManifest({ ...manifest("4.2.0"), platforms: { "darwin-aarch64": { url: "https://github.com/a", signature: "s" } } }), null);
  assert.strictEqual(validManifest(manifest("4.2.0", "https://evil.example/x.exe")), null);
  assert.strictEqual(validManifest(manifest("4.2.0", "http://github.com/x.exe")), null);
  const noSig = manifest("4.2.0");
  noSig.platforms["windows-x86_64"] = { url: noSig.platforms["windows-x86_64"].url, signature: "" };
  assert.strictEqual(validManifest(noSig), null);

  // newer -> 200 with the manifest; same or older -> 204 (the plugin stops there)
  let t = 0;
  const now = () => t;
  let f = fakeFetch([{ status: 200, body: manifest("4.2.0") }]);
  let feed = createFeed({ fetchImpl: f, now, log: quiet });
  let out = await answer(feed, { target: "windows", arch: "x86_64", currentVersion: "4.1.0" }, {});
  assert.strictEqual(out.status, 200);
  assert.strictEqual(out.body.version, "4.2.0");
  assert.strictEqual((await answer(feed, { target: "windows", arch: "x86_64", currentVersion: "4.2.0" }, {})).status, 204);
  assert.strictEqual((await answer(feed, { target: "windows", arch: "x86_64", currentVersion: "4.3.0" }, {})).status, 204);
  assert.strictEqual(f.calls.length, 1, "cached for 5 minutes");
  assert.ok(/desktop-latest\/latest\.json$/.test(f.calls[0]), "reads the desktop-latest channel");

  // bad input -> 400 (client tries GitHub), unknown target too
  assert.strictEqual((await answer(feed, { target: "darwin", arch: "x86_64", currentVersion: "4.1.0" }, {})).status, 400);
  assert.strictEqual((await answer(feed, { target: "windows", arch: "x86_64", currentVersion: "abc" }, {})).status, 400);

  // GitHub down after a good fetch -> stale copy is served (updates keep working)
  f = fakeFetch([{ status: 200, body: manifest("4.2.0") }, new Error("ETIMEDOUT")]);
  feed = createFeed({ fetchImpl: f, now, log: quiet });
  t = 0;
  assert.strictEqual((await answer(feed, { target: "windows", arch: "x86_64", currentVersion: "4.1.0" }, {})).status, 200);
  t = 6 * 60 * 1000;
  out = await answer(feed, { target: "windows", arch: "x86_64", currentVersion: "4.1.0" }, {});
  assert.strictEqual(out.status, 200, "stale copy while GitHub fails");
  assert.strictEqual(f.calls.length, 2);
  t = 25 * 60 * 60 * 1000;
  assert.strictEqual((await answer(feed, { target: "windows", arch: "x86_64", currentVersion: "4.1.0" }, {})).status, 503, "too old -> fall through");

  // never fetched and GitHub down / 404 / garbage -> 503, NOT 204 (204 would stop the client)
  for (const step of [new Error("down"), { status: 404, body: "Not Found" }, { status: 200, body: "<html>" }, { status: 200, body: { version: "4.2.0" } }]) {
    feed = createFeed({ fetchImpl: fakeFetch([step]), now, log: quiet });
    assert.strictEqual((await answer(feed, { target: "windows", arch: "x86_64", currentVersion: "4.1.0" }, {})).status, 503);
  }

  // a hanging GitHub is cut off by the timeout
  feed = createFeed({ fetchImpl: fakeFetch(["hang"]), now, timeoutMs: 30, log: quiet });
  assert.strictEqual((await answer(feed, { target: "windows", arch: "x86_64", currentVersion: "4.1.0" }, {})).status, 503);

  // concurrent requests share one fetch
  f = fakeFetch([{ status: 200, body: manifest("4.2.0") }]);
  feed = createFeed({ fetchImpl: f, now, log: quiet });
  await Promise.all([1, 2, 3].map(() => answer(feed, { target: "windows", arch: "x86_64", currentVersion: "4.1.0" }, {})));
  assert.strictEqual(f.calls.length, 1);

  // operator brake
  assert.strictEqual((await answer(feed, { target: "windows", arch: "x86_64", currentVersion: "4.1.0" }, { DESKTOP_TAURI_UPDATES_PAUSED: "1" })).status, 204);

  // HTTP: the exact URL tauri.conf.json builds
  f = fakeFetch([{ status: 200, body: manifest("4.2.0") }]);
  const app = express();
  app.use("/api/desktop/tauri", createRouter({ feed: createFeed({ fetchImpl: f, now, log: quiet }), env: {} }));
  let r = await request(app, "/api/desktop/tauri/windows/x86_64/4.1.0");
  assert.strictEqual(r.status, 200);
  assert.strictEqual(JSON.parse(r.text).platforms["windows-x86_64-nsis"].signature, SIG);
  r = await request(app, "/api/desktop/tauri/windows/x86_64/4.2.0");
  assert.strictEqual(r.status, 204);
  r = await request(app, "/api/desktop/tauri/windows/x86_64/4.2.0-rc.1");
  assert.strictEqual(r.status, 200);
  const down = express();
  down.use("/api/desktop/tauri", createRouter({ feed: createFeed({ fetchImpl: fakeFetch([new Error("down")]), now, log: quiet }), env: {} }));
  r = await request(down, "/api/desktop/tauri/windows/x86_64/4.1.0");
  assert.strictEqual(r.status, 503);
  assert.strictEqual(r.cache, "no-store");

  // server.js mounts it where tauri.conf.json points
  const fs = require("fs");
  const path = require("path");
  const server = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
  assert.ok(server.includes('app.use("/api/desktop/tauri", require("./routes/desktopTauriUpdates"))'));
  const conf = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "..", "desktop", "app", "src-tauri", "tauri.conf.json"), "utf8"));
  const eps = conf.plugins.updater.endpoints;
  assert.strictEqual(eps[0], "https://api.descall.com/api/desktop/tauri/{{target}}/{{arch}}/{{current_version}}");
  assert.ok(eps[1].endsWith("/desktop-latest/latest.json"), "GitHub stays the fallback");

  console.log("desktopTauriUpdates.integration: ok");
})().catch((e) => { console.error(e); process.exit(1); });
