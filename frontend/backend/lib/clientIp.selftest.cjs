"use strict";

// node backend/lib/clientIp.selftest.cjs
// The visitor IP behind Render + Cloudflare: skip our proxies, ignore what the
// client writes into X-Forwarded-For, trust the edge hub only on its own conns.
const assert = require("assert");
const c = require("./clientIp");

const req = (xff, peer) => ({ headers: xff ? { "x-forwarded-for": xff } : {}, connection: { remoteAddress: peer }, socket: { remoteAddress: peer } });

// Render internal hop only (the 3.4 bug: sessions showed 10.19x.x.x).
assert.strictEqual(c.ipOfRequest(req("88.230.1.2, 10.196.3.4", "10.196.9.9")), "88.230.1.2");
// Cloudflare edge in between.
assert.strictEqual(c.ipOfRequest(req("88.230.1.2, 172.70.1.1", "10.196.9.9")), "88.230.1.2");
assert.strictEqual(c.ipOfRequest(req("2a02:e0:1::5, 2606:4700::1", "10.1.1.1")), "2a02:e0:1::5");
// A client-written first value is ignored.
assert.strictEqual(c.ipOfRequest(req("1.1.1.1, 88.230.1.2", "10.196.9.9")), "88.230.1.2");
assert.strictEqual(c.ipOfRequest(req("10.0.0.5, 88.230.1.2, 10.196.3.4", "10.196.9.9")), "88.230.1.2");
// Direct connection from a public address: that address, XFF ignored.
assert.strictEqual(c.ipOfRequest(req("1.1.1.1", "88.230.1.2")), "88.230.1.2");
// IPv4-mapped IPv6 peer.
assert.strictEqual(c.ipOfRequest(req("", "::ffff:88.230.1.2")), "88.230.1.2");
console.log("ok - requests");

// Sockets: real request, test shape without request, edge hub.
assert.strictEqual(c.ipOfSocket({ request: req("88.230.1.2, 10.196.3.4", "10.196.9.9"), handshake: { headers: {} } }), "88.230.1.2");
assert.strictEqual(c.ipOfSocket({ handshake: { headers: { "x-forwarded-for": "203.0.113.5" }, address: "10.0.0.1" } }), "203.0.113.5");
assert.strictEqual(c.ipOfSocket({ conn: { __edgeCid: 7 }, handshake: { headers: { "x-descall-edge": "1", "x-forwarded-for": "95.1.2.3" } } }), "95.1.2.3");
// A client cannot claim to be the edge hub with a header.
const spoof = { request: req("95.1.2.3", "88.230.1.2"), handshake: { headers: { "x-descall-edge": "1", "x-forwarded-for": "95.1.2.3" } } };
assert.strictEqual(c.ipOfSocket(spoof), "88.230.1.2");
console.log("ok - sockets");

assert.strictEqual(c.maskIp("88.230.1.2"), "88.230.x.x");
assert.strictEqual(c.maskIp("2a02:e0:1::5"), "2a02:e0:…");
assert.strictEqual(c.isPublicIp("10.1.1.1"), false);
assert.strictEqual(c.isPublicIp("88.230.1.2"), true);
assert.ok(c.TRUSTED_PROXIES.includes("uniquelocal") && c.TRUSTED_PROXIES.includes("172.64.0.0/13"));
console.log("ok - helpers\nclientIp.selftest: ok");
