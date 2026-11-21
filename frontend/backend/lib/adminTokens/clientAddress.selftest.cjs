"use strict";

/** lib/adminTokens/clientAddress.js: strict client address and country for admin-token checks. */

const assert = require("assert");
const { derive } = require("./clientAddress");

const CF = "173.245.48.5";
const RENDER = "10.204.1.7";

// Straight to Render: the first non-internal address from the right; no country.
let a = derive({ peer: RENDER, xff: "198.51.100.7", cfCountry: "TR" });
assert.deepStrictEqual(a, { ip: "198.51.100.7", trusted: true, viaCloudflare: false, country: null });
// A forged left part is ignored: Render appended the real address.
a = derive({ peer: RENDER, xff: "1.2.3.4, 198.51.100.7" });
assert.strictEqual(a.ip, "198.51.100.7");
// One Cloudflare hop: the address to its left, and cf-ipcountry is trusted.
a = derive({ peer: RENDER, xff: `198.51.100.7, ${CF}`, cfCountry: "tr" });
assert.deepStrictEqual(a, { ip: "198.51.100.7", trusted: true, viaCloudflare: true, country: "TR" });
// Several internal hops are skipped.
a = derive({ peer: "127.0.0.1", xff: `198.51.100.7, ${CF}, 10.0.0.1, 192.168.1.2` });
assert.strictEqual(a.ip, "198.51.100.7");
assert.strictEqual(a.trusted, true);
// Two Cloudflare hops (a Worker egress): the value left of the first one is not trusted.
a = derive({ peer: RENDER, xff: `198.51.100.7, 173.245.48.9, ${CF}`, cfCountry: "TR" });
assert.strictEqual(a.ip, "173.245.48.9");
assert.strictEqual(a.trusted, false);
assert.strictEqual(a.country, null);
// A Cloudflare address alone, private or loopback addresses: untrusted.
assert.strictEqual(derive({ peer: RENDER, xff: CF }).trusted, false);
assert.strictEqual(derive({ peer: RENDER, xff: `10.9.9.9, ${CF}` }).trusted, false);
assert.strictEqual(derive({ peer: "127.0.0.1" }).trusted, false);
assert.strictEqual(derive({ peer: "127.0.0.1", xff: "not-an-ip" }).trusted, false);
assert.strictEqual(derive({ peer: "::ffff:127.0.0.1", xff: "" }).ip, "127.0.0.1");
// XX / T1 are unknown countries.
assert.strictEqual(derive({ peer: RENDER, xff: `198.51.100.7, ${CF}`, cfCountry: "T1" }).country, null);
assert.strictEqual(derive({ peer: RENDER, xff: `198.51.100.7, ${CF}`, cfCountry: "XX" }).country, null);
// IPv6 through Cloudflare.
a = derive({ peer: RENDER, xff: "2001:db8::5, 2606:4700::1", cfCountry: "DE" });
assert.deepStrictEqual(a, { ip: "2001:db8::5", trusted: true, viaCloudflare: true, country: "DE" });

console.log("adminTokens clientAddress selftest: ok");
