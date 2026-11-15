"use strict";

/**
 * Feature flag rollout (Sistem page, Draft A): a plain boolean still works, the bucket
 * is stable per user id (same answer on every call, device and refresh), the share of
 * users in a "rollout" rule follows the percent, platform and staff rules, the public
 * payload never carries staff ids, and the client copy (src/lib/featureRollout.js)
 * gives exactly the same answers as the server.
 *   node backend/test/featureRollout.test.cjs
 */

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = process.env.JWT_SECRET || "feature-rollout-test-secret-32chars";
process.env.SUPABASE_URL = process.env.SUPABASE_URL || "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "test-service-role-key";

const path = require("path");
const { pathToFileURL } = require("url");
const R = require("../lib/featureRollout");
const S = require("../lib/systemSettings");

function assert(cond, msg) {
  if (!cond) throw new Error("FAIL: " + msg);
}

const uid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

(async () => {
  /* ---- plain booleans keep working ---- */
  assert(R.evaluate(true, { flagKey: "desktopGlass" }) === true, "true stays on");
  assert(R.evaluate(false, { flagKey: "desktopGlass", userId: uid(1) }) === false, "false stays off");
  const legacy = S.pickFeatureFlags({ iosGlass: false, desktopGlass: true });
  assert(legacy.iosGlass === false && legacy.desktopGlass === true, "legacy booleans pass through pickFeatureFlags");
  const pub = S.publicFeatureFlags({ iosGlass: true, desktopGlass: false });
  assert(!("flagRules" in pub), "boolean-only flags send no rules (payload unchanged for old clients)");
  assert(Object.keys(pub).sort().join(",") === "desktopGlass,iosGlass,valorantCompanion,valorantLfg", "same public keys as before");

  /* ---- stable bucket per user id ---- */
  for (let i = 0; i < 50; i += 1) {
    const a = R.bucketOf("desktopGlass", uid(i));
    assert(a === R.bucketOf("desktopGlass", uid(i)), "same user, same bucket");
    assert(a === R.bucketOf("desktopGlass", uid(i).toUpperCase()), "id case does not matter");
    assert(a >= 0 && a < 100, "bucket in 0..99");
  }
  assert(R.bucketOf("desktopGlass", null) === null, "no user, no bucket");
  // Different flags reshuffle (not everyone in the first 5 % of every rollout).
  let same = 0;
  for (let i = 0; i < 400; i += 1) if (R.bucketOf("desktopGlass", uid(i)) === R.bucketOf("bootDiet", uid(i))) same += 1;
  assert(same < 40, "flags use independent buckets " + same);

  /* ---- percent follows the rule ---- */
  const rule25 = { mode: "rollout", percent: 25, platforms: [], staff: [] };
  let on = 0;
  const N = 4000;
  for (let i = 0; i < N; i += 1) if (R.evaluate(rule25, { flagKey: "desktopGlass", userId: uid(i), platform: "web" })) on += 1;
  assert(on / N > 0.21 && on / N < 0.29, "about 25 % of users get a 25 % rollout: " + on / N);
  // Raising the percent only adds users (nobody who had it loses it).
  for (let i = 0; i < 500; i += 1) {
    const ctx = { flagKey: "desktopGlass", userId: uid(i), platform: "web" };
    if (R.evaluate(rule25, ctx)) assert(R.evaluate({ ...rule25, percent: 50 }, ctx), "25 -> 50 keeps the first 25 %");
  }
  assert(!R.evaluate({ ...rule25, percent: 0 }, { flagKey: "x", userId: uid(3) }), "0 % reaches nobody");
  assert(R.evaluate({ mode: "all", platforms: [], staff: [] }, { flagKey: "x" }), "all reaches anonymous too");

  /* ---- platforms ---- */
  const webOnly = { mode: "all", platforms: ["web", "electron"], staff: [] };
  assert(R.evaluate(webOnly, { flagKey: "desktopGlass", platform: "web" }), "listed platform on");
  assert(!R.evaluate(webOnly, { flagKey: "desktopGlass", platform: "ios" }), "other platform off");
  assert(R.evaluate(webOnly, { flagKey: "desktopGlass" }), "unknown platform (shared /api/features) is not excluded");

  /* ---- staff ---- */
  const staffRule = { mode: "staff", percent: 0, platforms: ["web"], staff: [uid(7)] };
  assert(R.evaluate(staffRule, { flagKey: "desktopGlass", userId: uid(7), platform: "ios" }), "staff on every platform");
  assert(!R.evaluate(staffRule, { flagKey: "desktopGlass", userId: uid(8), platform: "web" }), "others off in staff mode");
  assert(!R.evaluate({ ...staffRule, mode: "off" }, { flagKey: "desktopGlass", userId: uid(7) }), "off beats staff");
  assert(R.evaluate({ mode: "rollout", percent: 1, platforms: [], staff: [uid(9)] }, { flagKey: "x", userId: uid(9) }), "staff always in a rollout");

  /* ---- normalize / compact ---- */
  const n = R.normalizeRule({ mode: "rollout", percent: 140, platforms: ["web", "web", "tv"], staff: ["nope", uid(1)], extra: 1 });
  assert(n.percent === 100 && n.platforms.join() === "web" && n.staff.join() === uid(1) && !("extra" in n), "normalize clamps and cleans");
  assert(R.compact({ mode: "all", platforms: [], staff: [] }) === true, "plain on stored as true");
  assert(R.compact({ mode: "off", percent: 0, platforms: [], staff: [] }) === false, "plain off stored as false");
  assert(typeof R.compact({ mode: "off", percent: 25, platforms: [], staff: [] }) === "object", "paused rollout keeps its percent");
  assert(R.toRule(true).mode === "all" && R.toRule(false).mode === "off" && R.toRule(undefined, true).mode === "all", "booleans as rules");

  /* ---- system settings: rules on rollout flags only ---- */
  const stored = S.pickFeatureFlags({ desktopGlass: { mode: "rollout", percent: 25, platforms: ["web", "electron"], staff: [uid(2)] }, presenceScoped: { mode: "rollout", percent: 10 } });
  assert(stored.desktopGlass.mode === "rollout" && stored.desktopGlass.percent === 25, "desktopGlass keeps its rule");
  assert(stored.presenceScoped === true, "server-wide flag stays a boolean (object reads as the old truthy value)");
  const p2 = S.publicFeatureFlags(stored, { userId: uid(2), platform: "ios" });
  assert(p2.desktopGlass === true, "staff resolved server-side for old clients");
  assert(p2.flagRules.desktopGlass.staff === true && !JSON.stringify(p2).includes(uid(2)), "public rule says staff=true, never the ids");
  const anon = S.publicFeatureFlags(stored);
  assert(anon.desktopGlass === false && anon.flagRules.desktopGlass.staff === false, "anonymous: rollout needs a user");
  assert(S.flagEnabledFor({}, "bootDiet", {}) === true && S.flagEnabledFor({ bootDiet: false }, "bootDiet", {}) === false, "flagEnabledFor defaults + booleans");

  /* ---- client copy gives the same answers ---- */
  const client = await import(pathToFileURL(path.join(__dirname, "../../src/lib/featureRollout.js")).href);
  for (let i = 0; i < 300; i += 1) {
    assert(client.bucketOf("desktopGlass", uid(i)) === R.bucketOf("desktopGlass", uid(i)), "same bucket client/server " + i);
    for (const platform of ["web", "electron", "ios", "android"]) {
      const ctx = { flagKey: "desktopGlass", userId: uid(i), platform };
      const rule = { mode: "rollout", percent: 37, platforms: ["web", "android"], staff: [] };
      assert(client.evaluateRule(R.publicRule(rule, ctx), ctx) === R.evaluate(rule, ctx), "same answer client/server");
    }
  }
  assert(client.resolveFlag({ desktopGlass: true }, "desktopGlass", {}) === true, "client falls back to the boolean");
  assert(client.resolveFlag({}, "desktopGlass", {}) === undefined, "client keeps 'not sent' as undefined");
  assert(client.resolveFlag({ desktopGlass: false, flagRules: { desktopGlass: { mode: "staff", staff: true } } }, "desktopGlass", { platform: "web" }) === true, "client honours the staff bit");

  console.log("featureRollout.test ok");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
