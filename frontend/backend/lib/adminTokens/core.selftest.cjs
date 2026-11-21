"use strict";

/** lib/adminTokens/core.js: secret format, expiry, IP allowlist, status, paths, destructive kinds, client labels. */

const assert = require("assert");
const crypto = require("crypto");
const core = require("./core");

// Secret: dsk_admin_ + 43 base64url characters (32 bytes); only the SHA-256 hex is stored.
const secret = core.newSecret();
assert.ok(/^dsk_admin_[A-Za-z0-9_-]{43}$/.test(secret), secret);
assert.ok(core.isWellFormed(secret));
assert.ok(!core.isWellFormed("dsk_admin_short"));
assert.ok(core.looksLikeToken("dsk_admin_short"));
assert.ok(!core.looksLikeToken("eyJhbGciOi"));
assert.notStrictEqual(core.newSecret(), secret, "secrets are random");
assert.strictEqual(core.hashSecret(secret), crypto.createHash("sha256").update(secret).digest("hex"));
const parts = core.displayParts(secret);
assert.strictEqual(parts.prefix, secret.slice(10, 14));
assert.strictEqual(parts.last4, secret.slice(-4));
assert.strictEqual(core.masked("7Hq2", "k9Xa"), "dsk_admin_7Hq2…k9Xa");
assert.ok(core.sameHash("ab", "ab") && !core.sameHash("ab", "ac") && !core.sameHash("", ""));

// Names and expiry
assert.deepStrictEqual(core.cleanName("  Claude   Code  "), { ok: true, value: "Claude Code" });
assert.strictEqual(core.cleanName("").code, "NAME_REQUIRED");
assert.strictEqual(core.cleanName("x".repeat(61)).code, "NAME_REQUIRED");
const now = Date.parse("2026-11-21T10:00:00.000Z");
assert.strictEqual(core.expiresAtFor("1h", now).value, "2026-11-21T11:00:00.000Z");
assert.strictEqual(core.expiresAtFor("90d", now).value, "2027-02-19T10:00:00.000Z");
assert.strictEqual(core.expiresAtFor("never", now).value, null);
assert.strictEqual(core.expiresAtFor("2w", now).code, "BAD_EXPIRY");
assert.deepStrictEqual(core.EXPIRY_OPTIONS, ["1h", "1d", "7d", "30d", "90d", "never"]);

// IP allowlist
assert.deepStrictEqual(core.cleanAllowlist([" 203.0.113.7 ", "10.0.0.0/8", "2001:DB8::/32", "", "203.0.113.7"]).value, ["203.0.113.7", "10.0.0.0/8", "2001:db8::/32"]);
assert.strictEqual(core.cleanAllowlist(["300.1.1.1"]).code, "BAD_IP");
assert.strictEqual(core.cleanAllowlist(["10.0.0.0/33"]).code, "BAD_IP");
assert.strictEqual(core.cleanAllowlist("10.0.0.1").code, "BAD_IP");
assert.strictEqual(core.cleanAllowlist(["evil.example.com"]).entry, "evil.example.com");
assert.ok(core.ipAllowed("1.2.3.4", []), "empty list allows all");
assert.ok(core.ipAllowed("10.20.30.40", ["10.0.0.0/8"]));
assert.ok(core.ipAllowed("::ffff:10.20.30.40", ["10.0.0.0/8"]));
assert.ok(!core.ipAllowed("11.0.0.1", ["10.0.0.0/8"]));
assert.ok(core.ipAllowed("2001:db8::5", ["2001:db8::/32"]));
assert.ok(!core.ipAllowed("unknown", ["10.0.0.0/8"]));

// Status
const base = { revoked_at: null, expires_at: null, paused: false };
assert.strictEqual(core.statusOf(base, now), "active");
assert.strictEqual(core.statusOf({ ...base, paused: true }, now), "paused");
assert.strictEqual(core.statusOf({ ...base, paused: true, expires_at: "2026-11-21T09:00:00Z" }, now), "expired");
assert.strictEqual(core.statusOf({ ...base, revoked_at: "2026-11-21T09:59:00Z", paused: true }, now), "revoked");
assert.strictEqual(core.restorableUntil({ revoked_at: "2026-11-21T09:55:00.000Z" }, now), "2026-11-21T10:05:00.000Z");
assert.strictEqual(core.restorableUntil({ revoked_at: "2026-11-21T09:45:00.000Z" }, now), null);
assert.strictEqual(core.graceUntil({ grace_hash: "x", grace_until: "2026-11-21T11:00:00Z" }, now), "2026-11-21T11:00:00Z");
assert.strictEqual(core.graceUntil({ grace_hash: "x", grace_until: "2026-11-21T09:00:00Z" }, now), null);

// Paths and destructive kinds
assert.strictEqual(core.normalisePath("/api/admin/users/00000000-0000-4000-8000-000000000001/ban?x=1"), "/api/admin/users/:id/ban");
assert.strictEqual(core.normalisePath("/api/admin/feedback/123/reply/"), "/api/admin/feedback/:id/reply");
assert.strictEqual(core.normalisePath("/api/admin/dm/aaa%3Abbb/view"), "/api/admin/dm/:id/view");
assert.strictEqual(core.normalisePath("/api/admin/dm/conversations"), "/api/admin/dm/conversations");
assert.strictEqual(core.destructiveKind("POST", "/api/admin/users/u1/ban"), "ban");
assert.strictEqual(core.destructiveKind("POST", "/admin/reports/r1/ban"), "ban");
assert.strictEqual(core.destructiveKind("POST", "/api/admin/users/u1/unban"), null);
assert.strictEqual(core.destructiveKind("DELETE", "/api/servers/s1"), "delete");
assert.strictEqual(core.destructiveKind("POST", "/api/admin/descoin/grant"), "descoin");
assert.strictEqual(core.destructiveKind("POST", "/api/admin/shop/gift"), "descoin");
assert.strictEqual(core.destructiveKind("POST", "/api/admin/announcements"), "broadcast");
assert.strictEqual(core.destructiveKind("POST", "/api/admin/announcements/a1/publish"), "broadcast");
assert.strictEqual(core.destructiveKind("POST", "/api/admin/popup/campaigns/c1/send-now"), "broadcast");
assert.strictEqual(core.destructiveKind("GET", "/api/admin/users/u1/ban"), null);
assert.strictEqual(core.destructiveKind("POST", "/api/admin/announcements/audience/preview"), null);
assert.strictEqual(core.adminRelative("/api/admin/users"), "/users");
assert.strictEqual(core.adminRelative("/api/servers"), null);

// Client labels
assert.strictEqual(core.clientLabel({ clientInfo: { name: "claude-code", version: "2.4.1" } }), "Claude Code 2.4");
assert.strictEqual(core.clientLabel({ clientInfo: { name: "claude-ai", version: "0.1.0" } }), "Claude Desktop 0.1");
assert.strictEqual(core.clientLabel({ userAgent: "curl/8.5.0" }), "curl 8.5");
assert.strictEqual(core.clientLabel({ userAgent: "" }), null);
assert.strictEqual(core.countryOf({ "cf-ipcountry": "tr" }), "TR");
assert.strictEqual(core.countryOf({ "cf-ipcountry": "XX" }), null);
assert.strictEqual(core.hourKey("2026-11-21T10:42:13.000Z"), "2026-11-21T10:00:00.000Z");
assert.strictEqual(core.percentile([5, 1, 3, 2, 4], 50), 3);
assert.strictEqual(core.percentile([], 95), 0);

console.log("adminTokens core selftest: ok");
