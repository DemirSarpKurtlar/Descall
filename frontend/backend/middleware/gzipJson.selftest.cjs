"use strict";
// node frontend/backend/middleware/gzipJson.selftest.cjs
const assert = require("assert");
const http = require("http");
const zlib = require("zlib");
const express = require("express");
const gzipJson = require("./gzipJson");

const app = express();
app.use(gzipJson);
const big = { items: Array.from({ length: 400 }, (_, i) => ({ i, name: `item-${i}` })) };
app.get("/big", (req, res) => res.json(big));
app.get("/small", (req, res) => res.json({ ok: true }));
app.get("/cached", (req, res) => {
  res.setHeader("Cache-Control", "public, max-age=30");
  res.json(big);
});
app.get("/err", (req, res) => res.status(404).json({ error: "x" }));
app.post("/big", (req, res) => res.json(big));

function req(path, { method = "GET", headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const r = http.request({ host: "127.0.0.1", port: server.address().port, path, method, headers }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    r.on("error", reject);
    r.end();
  });
}

const server = app.listen(0, "127.0.0.1", async () => {
  try {
    const a = await req("/big", { headers: { "accept-encoding": "gzip", authorization: "Bearer x" } });
    assert.strictEqual(a.status, 200);
    assert.strictEqual(a.headers["content-encoding"], "gzip");
    assert.ok(a.headers.etag && !a.headers.etag.startsWith("W/"));
    assert.strictEqual(a.headers["cache-control"], "private, no-cache");
    assert.deepStrictEqual(JSON.parse(zlib.gunzipSync(a.body)), big);

    const b = await req("/big", { headers: { "accept-encoding": "gzip", authorization: "Bearer x", "if-none-match": a.headers.etag } });
    assert.strictEqual(b.status, 304);
    assert.strictEqual(b.body.length, 0);

    const c = await req("/big", { headers: { "if-none-match": `W/${a.headers.etag}` } });
    assert.strictEqual(c.status, 304, "weak comparison for If-None-Match");

    const d = await req("/big", { headers: { "if-none-match": '"nope"' } });
    assert.strictEqual(d.status, 200);
    assert.deepStrictEqual(JSON.parse(d.body), big);
    assert.strictEqual(d.headers["cache-control"], undefined, "no auth → no forced cache-control");

    const s1 = await req("/small", { headers: { authorization: "Bearer x" } });
    const s2 = await req("/small", { headers: { "if-none-match": s1.headers.etag } });
    assert.strictEqual(s2.status, 304);

    const k = await req("/cached", { headers: { authorization: "Bearer x" } });
    assert.strictEqual(k.headers["cache-control"], "public, max-age=30", "route header wins");

    const e = await req("/err", { headers: { "if-none-match": "*" } });
    assert.strictEqual(e.status, 404);

    const p = await req("/big", { method: "POST", headers: { "accept-encoding": "gzip" } });
    assert.strictEqual(p.status, 200);
    assert.strictEqual(p.headers.etag, undefined);
    assert.strictEqual(p.headers["content-encoding"], "gzip");

    console.log("gzipJson.selftest.cjs: ok");
    server.close();
  } catch (err) {
    console.error(err);
    server.close();
    process.exit(1);
  }
});
