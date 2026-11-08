"use strict";
/**
 * Sign-ups from an invite landing (lib/signupInvite.js): invite kind for the signup source,
 * referred_by = invite creator only when still empty, signup_invite_* columns optional.
 * Run: node backend/test/signupInvite.unit.test.cjs
 */
const assert = require("node:assert/strict");
const { createFakeSupabase } = require("./fakeSupabase.cjs");
const { cleanSignupInvite, signupInviteKind, applySignupInvite } = require("../lib/signupInvite");
const { classifySignupSource } = require("../lib/signupSourceTaxonomy");

assert.deepEqual(cleanSignupInvite({ kind: "server", code: "AbCd1234" }), { kind: "server", code: "AbCd1234" });
assert.deepEqual(cleanSignupInvite({ kind: "vanity", code: " Night-Owls " }), { kind: "vanity", code: "night-owls" });
assert.equal(cleanSignupInvite({ kind: "server", code: "a" }), null, "server codes are 4-32 characters");
assert.equal(cleanSignupInvite({ kind: "server", code: "AbCd'; drop" }), null);
assert.equal(cleanSignupInvite({ kind: "friend", code: "abcd" }), null);
assert.equal(cleanSignupInvite("AbCd1234"), null);
assert.equal(cleanSignupInvite(null), null);
assert.equal(signupInviteKind({ kind: "server", code: "AbCd1234" }), "server_invite");
assert.equal(signupInviteKind({ kind: "vanity", code: "night-owls" }), "server_invite");
assert.equal(signupInviteKind({ kind: "group", code: "grp42" }), "group_invite");
assert.equal(signupInviteKind(undefined), "");
assert.deepEqual(
  classifySignupSource({ invite_kind: signupInviteKind({ kind: "server", code: "AbCd1234" }), landing_page: "https://descall.com/features" }),
  { group: "invite", sub: "server_invite", detail: "" },
  "an invite sign-up counts as an invite even when the first page was elsewhere"
);

(async () => {
  const db = () =>
    createFakeSupabase({
      users: [
        { id: "new", referred_by: null },
        { id: "friend-linked", referred_by: "someone" },
        { id: "creator", referred_by: null },
      ],
      server_invites: [{ code: "AbCd1234", server_id: "s1", creator_id: "creator" }],
      group_invite_links: [{ code: "grp42", group_id: "g1", creator_id: "creator" }],
      servers: [{ id: "s1", owner_id: "owner", vanity_slug: "night-owls" }],
    });

  {
    const sb = db();
    const r = await applySignupInvite(sb, "new", { kind: "server", code: "AbCd1234" });
    assert.deepEqual(r, { applied: true, kind: "server", referredBy: "creator" });
    const row = sb._tables.users.rows.find((u) => u.id === "new");
    assert.equal(row.referred_by, "creator");
    assert.equal(row.signup_invite_kind, "server");
    assert.equal(row.signup_invite_code, "AbCd1234");
  }
  {
    const sb = db();
    await applySignupInvite(sb, "friend-linked", { kind: "group", code: "grp42" });
    assert.equal(sb._tables.users.rows.find((u) => u.id === "friend-linked").referred_by, "someone", "a friend invite that linked first wins");
  }
  {
    const sb = db();
    const r = await applySignupInvite(sb, "new", { kind: "vanity", code: "night-owls" });
    assert.equal(r.referredBy, null, "a vanity link names nobody");
    assert.equal(sb._tables.users.rows.find((u) => u.id === "new").referred_by, null);
    assert.equal(sb._tables.users.rows.find((u) => u.id === "new").signup_invite_code, "night-owls");
  }
  {
    const sb = db();
    const r = await applySignupInvite(sb, "creator", { kind: "server", code: "AbCd1234" });
    assert.equal(r.referredBy, null, "nobody refers themselves");
  }
  {
    const sb = db();
    const r = await applySignupInvite(sb, "new", { kind: "server", code: "Missing1" });
    assert.deepEqual(r, { applied: true, kind: "server", referredBy: null }, "an unknown code still records the source");
  }
  assert.deepEqual(await applySignupInvite(db(), "new", { kind: "server", code: "x" }), { applied: false });
  assert.deepEqual(await applySignupInvite(db(), "", { kind: "server", code: "AbCd1234" }), { applied: false });

  // Migration not applied yet: the signup_invite_* update fails, referred_by still lands, nothing throws.
  {
    const base = db();
    const sb = {
      from(table) {
        const q = base.from(table);
        const update = q.update.bind(q);
        q.update = (payload) => {
          if ("signup_invite_code" in payload) {
            const failing = { eq: () => Promise.resolve({ data: null, error: { code: "42703", message: 'column "signup_invite_code" does not exist' } }) };
            return failing;
          }
          return update(payload);
        };
        return q;
      },
    };
    const warn = console.warn;
    const warned = [];
    console.warn = (...a) => warned.push(a.join(" "));
    try {
      const r = await applySignupInvite(sb, "new", { kind: "server", code: "AbCd1234" });
      assert.equal(r.referredBy, "creator");
    } finally {
      console.warn = warn;
    }
    assert.deepEqual(warned, [], "a missing column is expected before the migration, no warning");
  }
  // Database down: sign-up goes on.
  {
    const broken = { from() { throw new Error("db down"); } };
    const warn = console.warn;
    console.warn = () => {};
    try {
      const r = await applySignupInvite(broken, "new", { kind: "group", code: "grp42" });
      assert.deepEqual(r, { applied: true, kind: "group", referredBy: null });
    } finally {
      console.warn = warn;
    }
  }
  console.log("signupInvite ok");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
