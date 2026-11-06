"use strict";

/**
 * Messaging phase 4: server-side link previews with SSRF protection.
 *   node frontend/backend/test/linkPreview.unit.test.cjs
 * No real network: a scripted transport stands in for http/https, and a real
 * local server proves that blocked targets are never contacted.
 */

process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret-do-not-use-in-prod";
process.env.SUPABASE_URL = process.env.SUPABASE_URL || "https://placeholder.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "placeholder-key";

const assert = require("node:assert/strict");
const http = require("http");
const { EventEmitter } = require("events");
const lp = require("../lib/linkPreview");

const { isBlockedAddress, checkUrl, resolvePublic, parseHead, imageDataUri, createLinkPreviewService, PreviewError } = lp;

// ---- address policy ----
for (const ip of [
  "127.0.0.1", "127.8.9.10", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "100.64.0.1",
  "0.0.0.0", "224.0.0.1", "255.255.255.255", "198.18.0.1", "::1", "::", "fe80::1", "fd00::1", "fc00::5", "ff02::1",
  "::ffff:127.0.0.1", "::ffff:7f00:1", "::ffff:10.0.0.1", "64:ff9b::a9fe:a9fe", "64:ff9b::127.0.0.1", "2001:db8::1", "not-an-ip",
]) assert.equal(isBlockedAddress(ip), true, `${ip} must be blocked`);
for (const ip of ["8.8.8.8", "1.1.1.1", "93.184.216.34", "2606:4700:4700::1111", "2a00:1450:4001:80b::200e"]) {
  assert.equal(isBlockedAddress(ip), false, `${ip} is public`);
}

// ---- URL rules (before any DNS) ----
const rejects = (u, code) => assert.throws(() => checkUrl(u), (e) => e instanceof PreviewError && (!code || e.code === code), u);
rejects("ftp://example.com/a", "bad_scheme");
rejects("file:///etc/passwd", "bad_scheme");
rejects("javascript:alert(1)", "bad_scheme");
rejects("http://localhost/", "blocked_host");
rejects("http://api.localhost/", "blocked_host");
rejects("http://printer.local/", "blocked_host");
rejects("http://127.0.0.1/", "blocked_address");
rejects("http://[::1]/", "blocked_address");
rejects("http://[::ffff:127.0.0.1]/", "blocked_address");
rejects("http://169.254.169.254/latest/meta-data/", "blocked_address");
rejects("http://2130706433/", "blocked_address");
rejects("http://0x7f000001/", "blocked_address");
rejects("http://0177.0.0.1/", "blocked_address");
rejects("http://user:pass@example.com/", "bad_url");
rejects("http://example.com:8080/", "bad_port");
rejects("https://example.com:22/", "bad_port");
rejects(`https://example.com/${"a".repeat(2100)}`, "bad_url");
assert.equal(checkUrl("https://example.com/x#frag").url.toString(), "https://example.com/x");
assert.equal(checkUrl("http://example.com:80/").port, 80);

// ---- DNS: every answer must be public (one private answer is enough to refuse) ----
(async () => {
  await assert.rejects(resolvePublic("evil.test", async () => [{ address: "93.184.216.34", family: 4 }, { address: "10.0.0.5", family: 4 }]), (e) => e.code === "blocked_address");
  await assert.rejects(resolvePublic("evil.test", async () => [{ address: "::ffff:169.254.169.254", family: 6 }]), (e) => e.code === "blocked_address");
  await assert.rejects(resolvePublic("gone.test", async () => { throw new Error("ENOTFOUND"); }), (e) => e.code === "dns_failed");
  assert.deepEqual(await resolvePublic("ok.test", async () => [{ address: "93.184.216.34", family: 4 }]), { address: "93.184.216.34", family: 4 });

  // ---- parsing ----
  const head = `<html><head><title>Yedek &amp; başlık</title>
    <meta property="og:title" content="Descall Turnuvası &#8211; 2026">
    <meta name="description" content="Kayıtlar açık">
    <meta property='og:site_name' content='Örnek Site'>
    <meta property="og:image" content="/img/kapak.png"></head><body>…`;
  const parsed = parseHead(head, "https://www.example.com/turnuva");
  assert.equal(parsed.title, "Descall Turnuvası – 2026");
  assert.equal(parsed.description, "Kayıtlar açık");
  assert.equal(parsed.siteName, "Örnek Site");
  assert.equal(parsed.image, "https://www.example.com/img/kapak.png");
  assert.equal(parseHead("<title>x</title>", "https://www.example.com/").siteName, "example.com");
  assert.equal(parseHead('<meta property="og:image" content="javascript:alert(1)">', "https://a.com/").image, null);

  // ---- images: raster only, magic bytes must match, size capped ----
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
  assert.match(imageDataUri(png, "image/png"), /^data:image\/png;base64,/);
  assert.equal(imageDataUri(Buffer.from("<svg/>"), "image/svg+xml"), null, "never svg");
  assert.equal(imageDataUri(Buffer.from("<html>"), "image/png"), null, "type must match the bytes");
  assert.equal(imageDataUri(Buffer.alloc(lp.MAX_IMAGE_BYTES + 1, 0xff), "image/jpeg"), null);

  // ---- the service against a scripted transport ----
  const routes = new Map();
  const hits = [];
  const transport = {
    request(opts) {
      const req = new EventEmitter();
      req.destroy = (err) => { if (err) setImmediate(() => req.emit("error", err)); };
      req.end = () => {
        opts.lookup(opts.hostname, {}, (err, address) => {
          const key = `${opts.protocol}//${opts.hostname}${opts.path}`;
          hits.push({ key, address });
          const route = routes.get(key);
          if (!route || route === "hang") return; // never answers: the deadline must end it
          const res = new EventEmitter();
          res.statusCode = route.status || 200;
          res.headers = route.headers || {};
          res.socket = { remoteAddress: address };
          res.destroy = () => {};
          req.emit("response", res);
          setImmediate(() => {
            for (const chunk of route.chunks || []) res.emit("data", Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
            res.emit("end");
          });
        });
      };
      return req;
    },
  };
  const dnsTable = { "example.com": "93.184.216.34", "img.example.com": "93.184.216.35", "evil.example": "10.0.0.7", "rebind.example": "169.254.169.254" };
  const lookupAll = async (host) => {
    if (!dnsTable[host]) throw new Error("ENOTFOUND");
    return [{ address: dnsTable[host], family: 4 }];
  };
  const svc = createLinkPreviewService({ lookupAll, transport, timeoutMs: 400, log: { warn() {} } });
  const html = (extra = "") => ({ headers: { "content-type": "text/html; charset=utf-8" }, chunks: [`<html><head><meta property="og:title" content="Başlık"><meta property="og:description" content="Açıklama">${extra}</head><body>`, "x".repeat(1000)] });

  routes.set("https://example.com/a", html('<meta property="og:image" content="https://img.example.com/k.png">'));
  routes.set("https://img.example.com/k.png", { headers: { "content-type": "image/png" }, chunks: [png] });
  let r = await svc.preview("https://example.com/a");
  assert.equal(r.ok, true);
  assert.equal(r.preview.title, "Başlık");
  assert.match(r.preview.image, /^data:image\/png;base64,/, "the image comes back inline");
  assert.equal(hits.find((h) => h.key === "https://example.com/a").address, "93.184.216.34", "the socket is pinned to the checked address");
  const before = hits.length;
  r = await svc.preview("https://example.com/a#again");
  assert.equal(r.ok && r.cached, true, "cached (fragment ignored)");
  assert.equal(hits.length, before, "no second fetch");

  // Concurrent requests share one fetch.
  routes.set("https://example.com/b", html());
  const n0 = hits.length;
  const [x, y] = await Promise.all([svc.preview("https://example.com/b"), svc.preview("https://example.com/b")]);
  assert.equal(x.ok && y.ok, true);
  assert.equal(hits.length - n0, 1);

  // Redirects: re-checked at every hop.
  routes.set("https://example.com/r1", { status: 302, headers: { location: "http://127.0.0.1/admin" } });
  r = await svc.preview("https://example.com/r1");
  assert.deepEqual([r.ok, r.error], [false, "blocked_address"]);
  routes.set("https://example.com/r2", { status: 301, headers: { location: "https://evil.example/" } });
  r = await svc.preview("https://example.com/r2");
  assert.deepEqual([r.ok, r.error], [false, "blocked_address"], "a redirect to a name that resolves privately");
  assert.ok(!hits.some((h) => /evil\.example|127\.0\.0\.1/.test(h.key)), "blocked hops are never requested");
  routes.set("https://example.com/r3", { status: 302, headers: { location: "/r4" } });
  routes.set("https://example.com/r4", { status: 302, headers: { location: "/r5" } });
  routes.set("https://example.com/r5", { status: 302, headers: { location: "/r6" } });
  routes.set("https://example.com/r6", { status: 302, headers: { location: "/a" } });
  r = await svc.preview("https://example.com/r3");
  assert.deepEqual([r.ok, r.error], [false, "too_many_redirects"]);
  routes.set("https://example.com/r7", { status: 302, headers: { location: "https://example.com/a" } });
  r = await svc.preview("https://example.com/r7");
  assert.equal(r.ok, true, "a public redirect is followed");

  // Names that resolve to metadata / private addresses are refused before any request.
  r = await svc.preview("http://rebind.example/");
  assert.deepEqual([r.ok, r.error], [false, "blocked_address"]);

  // Size, type and time limits.
  routes.set("https://example.com/big", { headers: { "content-type": "text/html" }, chunks: [Buffer.alloc(lp.MAX_HTML_BYTES + 10, 0x61)] });
  r = await svc.preview("https://example.com/big");
  assert.equal(r.ok, false, "a page with no head inside the cap has no preview");
  routes.set("https://example.com/file.zip", { headers: { "content-type": "application/zip" }, chunks: ["PK"] });
  r = await svc.preview("https://example.com/file.zip");
  assert.deepEqual([r.ok, r.error], [false, "not_html"]);
  routes.set("https://example.com/slow", "hang");
  const t0 = Date.now();
  r = await svc.preview("https://example.com/slow");
  assert.deepEqual([r.ok, r.error], [false, "timeout"]);
  assert.ok(Date.now() - t0 < 1500, "the deadline ends a hanging site");
  // Failures are cached too (no hammering a broken site).
  const n1 = hits.length;
  r = await svc.preview("https://example.com/slow");
  assert.equal(r.cached, true);
  assert.equal(hits.length, n1);

  // ---- real sockets: a blocked target never receives a connection ----
  let contacted = 0;
  const local = http.createServer((req, res) => { contacted += 1; res.end("<title>secret</title>"); });
  await new Promise((resolve) => local.listen(0, "127.0.0.1", resolve));
  const port = local.address().port;
  const real = createLinkPreviewService({ lookupAll: async () => [{ address: "127.0.0.1", family: 4 }], timeoutMs: 1000 });
  for (const u of [`http://127.0.0.1:${port}/`, "http://localhost/", "http://internal-name.test/", `http://[::ffff:127.0.0.1]:${port}/`]) {
    const out = await real.preview(u);
    assert.equal(out.ok, false, u);
  }
  assert.equal(contacted, 0, "nothing reached the local server");
  local.close();

  // ---- route: auth required, 400 without url ----
  const { createFakeSupabase } = require("./fakeSupabase.cjs");
  const uid = "00000000-0000-4000-8000-000000000001";
  const supabasePath = require.resolve("../db/supabase");
  require.cache[supabasePath] = { id: supabasePath, filename: supabasePath, loaded: true, exports: createFakeSupabase({ users: [{ id: uid, username: "a", active_sessions: [{ id: "s-a" }] }] }) };
  const express = require("express");
  const { signToken } = require("../config/jwt");
  const { createLinkPreviewRouter } = require("../routes/linkPreview");
  const app = express();
  app.use("/api/link-preview", createLinkPreviewRouter({ service: { preview: async (u) => ({ ok: true, preview: { url: u, title: "T" } }) } }));
  const srv = http.createServer(app);
  await new Promise((resolve) => srv.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${srv.address().port}/api/link-preview`;
  let res = await fetch(`${base}?url=${encodeURIComponent("https://example.com/")}`);
  assert.equal(res.status, 401);
  const auth = { Authorization: `Bearer ${signToken({ id: uid, username: "a", sid: "s-a" })}` };
  res = await fetch(base, { headers: auth });
  assert.equal(res.status, 400);
  res = await fetch(`${base}?url=${encodeURIComponent("https://example.com/")}`, { headers: auth });
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.preview.title, "T");
  srv.close();
  console.log("linkPreview unit test OK");
})().catch((err) => { console.error(err); process.exit(1); });
