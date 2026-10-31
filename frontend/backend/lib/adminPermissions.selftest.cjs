"use strict";

// node backend/lib/adminPermissions.selftest.cjs
const assert = require("assert");
const perms = require("./adminPermissions");

let n = 0;
const ok = (name, fn) => {
  fn();
  n += 1;
  console.log(`ok ${n} - ${name}`);
};

ok("paths map to panel sections", () => {
  const cases = {
    "/step-up": null,
    "/overview": "overview",
    "/me/permissions": "overview",
    "/stats": "overview",
    "/staff": "staff",
    "/staff/abc/sections": "staff",
    "/make-admin/abc": "staff",
    "/remove-admin/abc": "staff",
    "/signup-stats": "signupStats",
    "/maintenance/windows/1/end": "maintenance",
    "/maintenance": "system",
    "/people/search": "people",
    "/reports/summary": "reports",
    "/reports/1/ban": "reports",
    "/promo-codes/x/redemptions": "promo",
    "/special-badges/a/grant": "specialBadges",
    "/announcements/5": "announcements",
    "/popup/recent": "livepopup",
    "/broadcast": "livepopup",
    "/antibot/feed": "suspicious",
    "/feedback/1/reply": "feedback",
    "/audit": "audit",
    "/errors/stats": "security",
    "/security-logs": "security",
    "/credits/update": "casino",
    "/descoin/grant": "casino",
    "/shop/gift": "casino",
    "/shop/items/3": "shop",
    "/users/u1/ban": "moderation",
    "/users/u1/timeout": "moderation",
    "/users/bulk": "moderation",
    "/moderation/history": "moderation",
    "/dm/conversations": "dmReview",
    "/dm/a::b/view": "dmReview",
    "/activity/leaderboard": "topUsers",
    "/growth/retention": "retention",
    "/growth/economy": "economy",
    "/activity/recent": "directory",
    "/messages/m1": "moderation",
    "/users/u1/analytics": "analytics",
    "/analytics": "analytics",
    "/users": "directory",
    "/users/u1": "directory",
    "/directory": "directory",
    "/member-pulse": "directory",
    "/system": "system",
    "/chat/freeze": "system",
    "/restart": "system",
    "/something-new": "system",
  };
  for (const [path, want] of Object.entries(cases)) assert.strictEqual(perms.sectionForPath(path), want, path);
});

ok("owner sees everything incl. staff; nobody else gets staff", () => {
  const owner = perms.sectionsFor({ username: "admin" }, { is_admin: true, admin_permissions: [] });
  assert(owner.includes("staff") && owner.includes("system") && owner.includes("overview"));
  const superRow = perms.sectionsFor({ username: "x" }, { is_admin: true, is_super_admin: true });
  assert(superRow.includes("staff"));
  const legacy = perms.sectionsFor({ username: "x" }, { is_admin: true, admin_permissions: null });
  assert(!legacy.includes("staff"));
  assert.deepStrictEqual(legacy, ["overview", ...perms.LEGACY_SECTIONS]);
  assert(!legacy.includes("dmReview"), "legacy admins never get DM inceleme by default");
  assert(perms.sectionsFor({ username: "x" }, { is_admin: true, admin_permissions: ["dmReview"] }).includes("dmReview"), "granted explicitly");
  assert(perms.sectionsFor({ username: "admin" }, { is_admin: true }).includes("dmReview"), "owner sees it");
  const tried = perms.sectionsFor({ username: "x" }, { is_admin: true, admin_permissions: ["staff", "reports"] });
  assert.deepStrictEqual(tried, ["overview", "reports"]);
});

ok("non-admins and the empty grant", () => {
  assert.deepStrictEqual(perms.sectionsFor({ username: "x" }, { is_admin: false }), []);
  assert.deepStrictEqual(perms.sectionsFor({ username: "x" }, null), []);
  assert.deepStrictEqual(perms.sectionsFor({ username: "x" }, { is_admin: true, admin_permissions: [] }), ["overview"]);
  assert.strictEqual(perms.canOpen({ username: "x" }, { is_admin: true, admin_permissions: [] }, null), true);
});

ok("normalizeSections keeps menu order and drops unknown ids", () => {
  assert.deepStrictEqual(perms.normalizeSections(["audit", "nope", "reports", "reports", "overview"]), ["reports", "audit"]);
  assert.deepStrictEqual(perms.normalizeSections("reports"), []);
});

async function main() {
  const rows = {
    owner: { id: "owner", username: "admin", is_admin: true },
    a: { id: "a", username: "alice", is_admin: true, admin_permissions: ["reports"] },
    b: { id: "b", username: "bob", is_admin: false },
  };
  perms.__setDbForTests({
    from: () => {
      const q = { id: null };
      const chain = {
        select: () => chain,
        eq: (_c, v) => {
          q.id = v;
          return chain;
        },
        maybeSingle: async () => ({ data: rows[q.id] ? { ...rows[q.id] } : null, error: null }),
      };
      return chain;
    },
  });
  const run = async (user, path) => {
    let status = 200;
    let nextCalled = false;
    const req = { user, path };
    const res = { status: (c) => ((status = c), res), json: () => res };
    await perms.requireAdminSection(req, res, () => {
      nextCalled = true;
    });
    return nextCalled ? 200 : status;
  };
  assert.strictEqual(await run({ id: "a", username: "alice" }, "/reports"), 200);
  assert.strictEqual(await run({ id: "a", username: "alice" }, "/overview"), 200);
  assert.strictEqual(await run({ id: "a", username: "alice" }, "/system"), 403);
  assert.strictEqual(await run({ id: "a", username: "alice" }, "/staff"), 403);
  assert.strictEqual(await run({ id: "a", username: "alice" }, "/step-up"), 200);
  assert.strictEqual(await run({ id: "b", username: "bob" }, "/overview"), 403);
  assert.strictEqual(await run({ id: "owner", username: "admin" }, "/staff"), 200);
  rows.a.admin_permissions = ["system"];
  assert.strictEqual(await run({ id: "a", username: "alice" }, "/system"), 403, "cached for a moment");
  perms.invalidate("a");
  assert.strictEqual(await run({ id: "a", username: "alice" }, "/system"), 200, "invalidate takes effect");
  n += 1;
  console.log(`ok ${n} - requireAdminSection allows granted sections, blocks the rest, cache invalidates`);
  console.log(`\n${n} passed`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
