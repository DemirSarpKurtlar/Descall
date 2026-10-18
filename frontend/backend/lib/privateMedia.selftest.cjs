"use strict";
// node lib/privateMedia.selftest.cjs
const assert = require("assert");
process.env.JWT_SECRET = "selftest-secret";
process.env.MEDIA_PUBLIC_BASE_URL = "https://api.example.test";
const pm = require("./privateMedia");

(async () => {
  const now = Date.parse("2026-10-18T12:10:00Z");
  const url = pm.signedUrlForPath("images/1-abc.png", now);
  assert.ok(url.startsWith("https://api.example.test/api/media/f/images/1-abc.png?e="));
  const u = new URL(url);
  const e = Number(u.searchParams.get("e"));
  assert.ok(e * 1000 >= now + 2 * 3600 * 1000, "at least 2h validity");
  assert.strictEqual(e % 3600, 0, "hour bucketed");
  assert.ok(pm.verifySignature("images/1-abc.png", e, u.searchParams.get("s"), now));
  assert.ok(!pm.verifySignature("images/1-abd.png", e, u.searchParams.get("s"), now), "path bound");
  assert.ok(!pm.verifySignature("images/1-abc.png", e + 3600, u.searchParams.get("s"), now), "expiry bound");
  assert.ok(!pm.verifySignature("images/1-abc.png", e, u.searchParams.get("s"), e * 1000 + 1), "expired");
  assert.ok(!pm.verifySignature("../etc/passwd", e, "x", now));
  assert.strictEqual(pm.signedUrlForPath("avatars/x.png"), null, "avatars are never private");
  assert.strictEqual(pm.signedUrlForPath("images/../x"), null);
  // Same hour → same URL (cacheable).
  assert.strictEqual(pm.signedUrlForPath("images/1-abc.png", now + 60_000), url);

  // parse
  assert.deepStrictEqual(pm.parseMediaUrl("sb://media-private/files/9-x.pdf"), { path: "files/9-x.pdf", kind: "ref" });
  assert.deepStrictEqual(pm.parseMediaUrl(url), { path: "images/1-abc.png", kind: "signed" });
  assert.deepStrictEqual(
    pm.parseMediaUrl("https://abc.supabase.co/storage/v1/object/public/media/images/2-y.jpg"),
    { path: "images/2-y.jpg", kind: "legacy" }
  );
  assert.strictEqual(pm.parseMediaUrl("https://abc.supabase.co/storage/v1/object/public/media/avatars/2-y.jpg"), null);
  assert.strictEqual(pm.parseMediaUrl("https://evil.test/storage/v1/object/public/media/images/2-y.jpg"), null);
  assert.strictEqual(pm.parseMediaUrl("https://media.tenor.com/x.gif"), null);

  // copy-on-write rewrite
  const shared = { id: 1, media_url: "sb://media-private/images/1-abc.png", nested: { keep: { a: 1 } }, list: ["x", { mediaUrl: "sb://media-private/files/2-b.pdf" }] };
  const frozen = JSON.stringify(shared);
  const out = pm.rewriteOutgoing(shared, now);
  assert.strictEqual(JSON.stringify(shared), frozen, "input not mutated");
  assert.strictEqual(out.media_url, url);
  assert.ok(out.list[1].mediaUrl.includes("/api/media/f/files/2-b.pdf?e="));
  assert.strictEqual(out.nested, shared.nested, "untouched subtrees keep identity");
  const plain = { a: "b" };
  assert.strictEqual(pm.rewriteOutgoing(plain), plain);
  assert.ok(!pm.mayContainRef({ a: ["https://x"] }));
  assert.ok(pm.mayContainRef([{ a: { b: "sb://media-private/images/1-abc.png" } }]));
  const d = new Date();
  assert.strictEqual(pm.rewriteOutgoing(d), d);

  // access checks with a fake supabase
  const rows = {
    media_uploads: [{ uploader_id: "u-up", storage_path: "images/1-abc.png" }],
    dm_messages: [{ from_user_id: "u-a", to_user_id: "u-b", media_url: "sb://media-private/images/1-abc.png" }],
    group_messages: [{ group_id: "g1", media_url: "https://p.supabase.co/storage/v1/object/public/media/files/7-v.webm" }],
    server_messages: [{ server_id: "s1", media_url: "sb://media-private/files/8-z.pdf" }],
    group_members: [{ group_id: "g1", user_id: "u-g" }],
    server_members: [{ server_id: "s1", user_id: "u-s" }],
  };
  const fake = {
    from(table) {
      const filters = [];
      const q = {
        select() { return q; },
        eq(col, v) { filters.push((r) => String(r[col]) === String(v)); return q; },
        like(col, pat) {
          const re = new RegExp("^" + pat.split("%").map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*") + "$");
          filters.push((r) => re.test(String(r[col] || "")));
          return q;
        },
        limit() { return q; },
        then(res, rej) { return Promise.resolve({ data: (rows[table] || []).filter((r) => filters.every((f) => f(r))) }).then(res, rej); },
      };
      return q;
    },
  };
  assert.ok(await pm.canAccessPath(fake, "u-up", "images/1-abc.png"), "uploader");
  assert.ok(await pm.canAccessPath(fake, "u-a", "images/1-abc.png"), "dm sender");
  assert.ok(await pm.canAccessPath(fake, "u-b", "images/1-abc.png"), "dm recipient");
  assert.ok(!(await pm.canAccessPath(fake, "u-x", "images/1-abc.png")), "stranger");
  assert.ok(await pm.canAccessPath(fake, "u-g", "files/7-v.webm"), "group member via legacy url");
  assert.ok(!(await pm.canAccessPath(fake, "u-s", "files/7-v.webm")), "non member of group");
  assert.ok(await pm.canAccessPath(fake, "u-s", "files/8-z.pdf"), "server member");
  assert.ok(!(await pm.canAccessPath(fake, "u-g", "files/8-z.pdf")), "non server member");

  // send-time normalisation
  assert.strictEqual(await pm.normalizeIncomingMediaUrl(fake, "u-a", url), "sb://media-private/images/1-abc.png");
  assert.strictEqual(await pm.normalizeIncomingMediaUrl(fake, "u-x", url), null, "cannot forward a file you cannot see");
  assert.strictEqual(await pm.normalizeIncomingMediaUrl(fake, "u-x", "https://media.tenor.com/a.gif"), "https://media.tenor.com/a.gif");
  const avatar = "https://p.supabase.co/storage/v1/object/public/media/avatars/1.png";
  assert.strictEqual(await pm.normalizeIncomingMediaUrl(fake, "u-x", avatar), avatar);
  console.log("privateMedia selftest OK");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
