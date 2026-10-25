"use strict";

/**
 * lib/uploadGuard: storage-key extensions are sanitized, and in-flight
 * uploads (buffered fully in memory by multer) are capped per user.
 */

const http = require("http");
const express = require("express");
const { safeExtension, uploadConcurrencyGate } = require("../lib/uploadGuard");

function assert(c, msg) {
  if (!c) throw new Error("FAIL: " + msg);
}

async function run() {
  assert(safeExtension("photo.JPG") === "jpg", "normal extension kept (lowercased)");
  assert(safeExtension("voice.m4a") === "m4a", "m4a kept");
  assert(safeExtension("noext") === "bin", "no extension -> bin");
  assert(safeExtension("trailing.") === "bin", "trailing dot -> bin");
  assert(safeExtension("a./x/../../evil") === "bin", "slashes rejected");
  assert(safeExtension("x.p/hp") === "bin", "slash in extension rejected");
  assert(safeExtension("x.aaaaaaaaaaaaaaaa") === "bin", "overlong extension rejected");
  assert(safeExtension(undefined) === "bin", "missing name -> bin");

  const gate = uploadConcurrencyGate({ maxPerUser: 2 });
  const pending = [];
  const app = express();
  app.use((req, _res, next) => {
    req.user = { id: String(req.headers["x-user"] || "u1") };
    next();
  });
  app.post("/up", gate, (req, res) => {
    pending.push(() => res.json({ ok: true }));
  });
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (user) => fetch(base + "/up", { method: "POST", headers: { "x-user": user } });
  try {
    const a = post("u1");
    const b = post("u1");
    while (pending.length < 2) await new Promise((r) => setTimeout(r, 10));
    const c = await post("u1");
    assert(c.status === 429, "third concurrent upload for same user refused");
    const other = post("u2");
    while (pending.length < 3) await new Promise((r) => setTimeout(r, 10));
    pending.splice(0).forEach((fn) => fn());
    const results = await Promise.all([a, b, other]);
    assert(results.every((r) => r.status === 200), "uploads within the cap succeed, other users unaffected");
    await new Promise((r) => setTimeout(r, 20));
    assert(gate._inFlight.size === 0, "slots released after responses");
    const d = post("u1");
    while (pending.length < 1) await new Promise((r) => setTimeout(r, 10));
    pending.splice(0).forEach((fn) => fn());
    assert((await d).status === 200, "user can upload again after slots free up");
    console.log("uploadGuard: all checks passed");
  } finally {
    server.close();
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
