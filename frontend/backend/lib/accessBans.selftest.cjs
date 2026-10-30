"use strict";

// node backend/lib/accessBans.selftest.cjs
// Erişim yasakları (3.5.0): hashing never keeps raw values, address / network /
// device bans match, admins pass, expiry and revoke work, account bans use the
// saved sessions, missing tables fail open.
process.env.JWT_SECRET = process.env.JWT_SECRET || "selftest-secret";
const assert = require("assert");
const { createFakeSupabase } = require("../test/fakeSupabase.cjs");
const bans = require("./accessBans");

const ACTOR = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", username: "admin" };
const TROLL = "22222222-2222-4222-8222-222222222222";
const DEV = "dev_0123456789abcdef0123";

let n = 0;
const ok = (name) => console.log(`ok ${++n} - ${name}`);

async function main() {
  const fp = bans.fingerprintOf({ ip: "88.230.1.2", deviceId: DEV });
  assert.ok(fp.ip && fp.network && fp.device);
  assert.ok(!JSON.stringify(fp).includes("88.230"), "no raw address in hashes");
  assert.notStrictEqual(fp.ip, bans.fingerprintOf({ ip: "88.230.1.3" }).ip);
  assert.strictEqual(fp.network, bans.fingerprintOf({ ip: "88.230.1.99" }).network, "same /24");
  assert.deepStrictEqual(bans.fingerprintOf({ ip: "10.196.1.2", deviceId: "short" }), { ip: null, network: null, device: null }, "private address / bad device id ignored");
  ok("hashes: keyed, no raw values, /24 shared, private and malformed ignored");

  assert.strictEqual(bans.expiryFor("permanent"), null);
  assert.strictEqual(bans.expiryFor("nope"), undefined);
  assert.ok(Date.parse(bans.expiryFor("7d", 0)) === 7 * 86400 * 1000);
  ok("durations");

  const db = createFakeSupabase({
    users: [
      { id: TROLL, username: "trol", is_admin: false, active_sessions: [
        { id: "s1", ip: "95.1.2.3", device: "Chrome on Windows", deviceHash: bans.fingerprintOf({ deviceId: DEV }).device },
        { id: "s2", ip: "10.196.0.1", device: "Safari on iOS" },
      ] },
      { id: ACTOR.id, username: "admin", is_admin: true, active_sessions: [{ id: "s3", ip: "77.7.7.7" }] },
    ],
    access_bans: [],
    access_ban_hits: [],
  });
  bans.__setDbForTests(db);

  await assert.rejects(bans.banAddress({ ip: "10.0.0.1", kind: "ip", duration: "permanent", actor: ACTOR }), (e) => e.code === "BAD_IP");
  await assert.rejects(bans.banAddress({ ip: "88.230.1.2", kind: "ip", duration: "1y", actor: ACTOR }), (e) => e.status === 400);
  const [ipBan] = await bans.banAddress({ ip: "88.230.1.2", kind: "ip", duration: "permanent", reason: "spam", actor: ACTOR });
  assert.strictEqual(ipBan.label, "88.230.x.x");
  assert.ok(!JSON.stringify(db._tables.access_bans.rows).includes("88.230.1.2"), "raw IP never stored");
  await assert.rejects(bans.banAddress({ ip: "88.230.1.2", kind: "ip", duration: "permanent", actor: ACTOR }), (e) => e.code === "ALREADY_BANNED");
  ok("address ban: public IPs only, valid duration, masked label, no duplicates");

  let hit = await bans.check({ ip: "88.230.1.2", action: "login" });
  assert.ok(hit && hit.publicBody.code === "ACCESS_BANNED");
  assert.strictEqual(await bans.check({ ip: "88.230.1.3", action: "login" }), null, "neighbour IP passes");
  assert.strictEqual(await bans.check({ ip: "88.230.1.2", action: "login", isAdmin: true }), null, "admins pass");
  await new Promise((r) => setTimeout(r, 10));
  assert.strictEqual(db._tables.access_ban_hits.rows.length, 1);
  assert.strictEqual(db._tables.access_ban_hits.rows[0].ip_masked, "88.230.x.x");
  ok("check: banned IP blocked with ACCESS_BANNED, others and admins pass, hit stored masked");

  await bans.banAddress({ ip: "31.5.6.7", kind: "network", duration: "1d", actor: ACTOR });
  assert.ok(await bans.check({ ip: "31.5.6.200", action: "register" }), "whole /24 blocked");
  assert.strictEqual(await bans.check({ ip: "31.5.7.1", action: "register" }), null);
  ok("network ban covers the /24");

  const acc = await bans.banAccountAccess({ userId: TROLL, duration: "30d", reason: "ban evasion", actor: ACTOR });
  assert.deepStrictEqual(acc.added.map((b) => b.kind).sort(), ["device", "ip"], "device + public session IP, private one skipped");
  assert.ok(acc.added.every((b) => b.sourceUsername === "trol"));
  assert.ok(await bans.check({ ip: "1.2.3.4", deviceId: DEV, action: "socket" }), "device blocked from any address");
  const again = await bans.banAccountAccess({ userId: TROLL, duration: "30d", actor: ACTOR });
  assert.strictEqual(again.added.length, 0);
  assert.strictEqual(again.skipped, 2);
  await assert.rejects(bans.banAccountAccess({ userId: ACTOR.id, duration: "1d", actor: ACTOR }), (e) => e.code === "IS_ADMIN");
  ok("account ban: its devices and public IPs, idempotent, never an admin");

  const revoked = await bans.revokeBan({ id: ipBan.id, actor: ACTOR });
  assert.ok(revoked.revokedAt && !revoked.active);
  assert.strictEqual(await bans.check({ ip: "88.230.1.2", action: "login" }), null, "revoked ban no longer applies");
  await assert.rejects(bans.revokeBan({ id: ipBan.id, actor: ACTOR }), (e) => e.status === 404);
  ok("revoke takes effect at once");

  db._tables.access_bans.rows.forEach((r) => {
    if (r.kind === "network") r.expires_at = new Date(Date.now() - 1000).toISOString();
  });
  await bans.refresh({ force: true });
  assert.strictEqual(await bans.check({ ip: "31.5.6.200", action: "register" }), null, "expired ban ignored");
  const listed = await bans.listBans({ status: "ended" });
  assert.ok(listed.bans.some((b) => b.kind === "network") && listed.bans.some((b) => b.revokedAt));
  ok("expired bans stop applying and show under ended");

  bans.__setDbForTests(createFakeSupabase({}, { missingTables: ["access_bans", "access_ban_hits"] }));
  const prev = console.warn;
  console.warn = () => {};
  assert.strictEqual(await bans.check({ ip: "88.230.1.2", action: "login" }), null);
  console.warn = prev;
  assert.deepStrictEqual(await bans.listBans(), { bans: [], available: false });
  ok("missing tables: nobody is blocked, list says unavailable");

  console.log(`\n${n} passed`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
