"use strict";
// Run: node frontend/backend/lib/groupAvatar.selftest.cjs
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { validateGroupAvatarUrl, canEditGroupAvatar } = require("./groupAvatar");

const base = "https://abc.supabase.co";
const ok = `${base}/storage/v1/object/public/media/images/1-x.gif`;
assert.deepStrictEqual(validateGroupAvatarUrl(ok, { supabaseUrl: base }), { ok: true, url: ok });
assert.deepStrictEqual(validateGroupAvatarUrl(ok, { supabaseUrl: base + "/" }), { ok: true, url: ok });
assert.deepStrictEqual(validateGroupAvatarUrl(null, { supabaseUrl: base }), { ok: true, url: null });
assert.deepStrictEqual(validateGroupAvatarUrl("", { supabaseUrl: base }), { ok: true, url: null });
assert.strictEqual(validateGroupAvatarUrl("https://evil.example/x.png", { supabaseUrl: base }).ok, false);
assert.strictEqual(validateGroupAvatarUrl("javascript:alert(1)", { supabaseUrl: "" }).ok, false);
assert.strictEqual(validateGroupAvatarUrl("not a url", { supabaseUrl: "" }).ok, false);
assert.strictEqual(validateGroupAvatarUrl(42, { supabaseUrl: "" }).ok, false);
assert.strictEqual(validateGroupAvatarUrl(`${base}/storage/v1/object/public/` + "a".repeat(600), { supabaseUrl: base }).ok, false);

assert.strictEqual(canEditGroupAvatar({ userId: "u1", createdBy: "u2", isMember: true }), true);
assert.strictEqual(canEditGroupAvatar({ userId: "u2", createdBy: "u2", isMember: false }), true);
assert.strictEqual(canEditGroupAvatar({ userId: "u3", createdBy: "u2", isMember: false }), false);
assert.strictEqual(canEditGroupAvatar({ userId: null, createdBy: null, isMember: true }), false);

// Wiring: the route uses the helpers and supports removal; list exposes avatarUrl.
const routes = fs.readFileSync(path.join(__dirname, "../routes/groups.js"), "utf8");
assert.match(routes, /validateGroupAvatarUrl\(/);
assert.match(routes, /canEditGroupAvatar\(/);
assert.match(routes, /router\.delete\("\/:groupId\/avatar"/);
const list = fs.readFileSync(path.join(__dirname, "groupList.js"), "utf8");
assert.match(list, /avatarUrl: group\.avatar_url/);

console.log("groupAvatar.selftest ok");
