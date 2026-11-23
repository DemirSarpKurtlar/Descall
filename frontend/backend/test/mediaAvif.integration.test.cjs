"use strict";
// routes/media.js AVIF variants against the fake Supabase:
//  - avatar / banner / public image: AVIF sibling stored first, original gets the "-av1" name
//  - not smaller / GIF / encoder off: plain upload, unmarked name (unchanged behaviour)
//  - chat image: answers at once, sibling encoded in the background in the private bucket
//  - GET /api/media/f negotiates on Accept (Vary: Accept), falls back to the original
//    when the sibling is missing or the client does not list image/avif
process.env.JWT_SECRET = "test-secret-do-not-use-in-prod";
process.env.SUPABASE_URL = "https://placeholder.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "placeholder-key";
process.env.MEDIA_PUBLIC_BASE_URL = "http://media.test";

const http = require("http");
const zlib = require("zlib");
const assert = require("node:assert/strict");
const { createFakeSupabase } = require("./fakeSupabase.cjs");
const fake = createFakeSupabase({
  users: [{ id: "u-alice", username: "alice", active_sessions: [{ id: "s-a" }] }],
  media_uploads: [],
});
const supabasePath = require.resolve("../db/supabase");
require.cache[supabasePath] = { id: supabasePath, filename: supabasePath, loaded: true, exports: fake };

const express = require("express");
const { signToken } = require("../config/jwt");
const iv = require("../lib/imageVariants");
const media = require("../routes/media");

function png(w, h) {
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlib.crc32(td) >>> 0);
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const raw = Buffer.alloc(h * (1 + w * 4), 0x42);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

let mode = "small";
const fakeSharp = () => {
  const chain = {
    metadata: async () => ({ pages: 1 }),
    rotate: () => chain,
    resize: () => chain,
    avif: () => chain,
    timeout: () => chain,
    async toBuffer() {
      if (mode === "fail") throw new Error("encoder failed");
      return { data: mode === "big" ? Buffer.alloc(1_000_000) : Buffer.from("AVIFDATA"), info: { width: 1, height: 1 } };
    },
  };
  return chain;
};

const alice = signToken({ id: "u-alice", username: "alice", sid: "s-a" });
const pub = () => [...(fake.storage._buckets.media?.keys() || [])];
const priv = () => [...(fake.storage._buckets["media-private"]?.keys() || [])];
const user = () => fake._tables.users.rows.find((r) => r.id === "u-alice");

(async () => {
  iv._resetForTests();
  iv._setSharpForTests(fakeSharp);
  const realWarn = console.warn;
  console.warn = () => {};
  const app = express();
  app.use("/api/media", media);
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (route, field, buf, type, name, extra = {}) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(extra)) fd.append(k, v);
    fd.append(field, new Blob([buf], { type }), name);
    return fetch(`${base}/api/media/${route}`, { method: "POST", headers: { Authorization: `Bearer ${alice}` }, body: fd });
  };
  const image = png(64, 64);
  try {
    // Avatar: sibling first, then the marked original; the stored URL carries the mark.
    let res = await post("avatar", "avatar", image, "image/png", "me.png");
    assert.equal(res.status, 200);
    const avatarUrl = (await res.json()).avatarUrl;
    assert.match(avatarUrl, /\/storage\/v1\/object\/public\/media\/avatars\/\d+-[a-z0-9]+-av1\.png$/, "marked avatar URL");
    const avatarPath = avatarUrl.split("/public/media/")[1];
    assert.ok(pub().includes(avatarPath), "original stored");
    assert.ok(pub().includes(iv.avifSiblingPath(avatarPath)), "AVIF sibling stored");
    assert.equal(fake.storage._buckets.media.get(iv.avifSiblingPath(avatarPath)).contentType, "image/avif");
    assert.equal(user().avatar_url, avatarUrl, "profile row points at the marked original");

    // Picker banner (JPEG named .jpeg by the client): extension comes from the real type.
    const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(4000, 3)]);
    res = await post("banner-image", "banner", jpeg, "image/jpeg", "wide.JPEG");
    assert.equal(res.status, 200);
    const bannerUrl = (await res.json()).url;
    assert.match(bannerUrl, /\/banners\/\d+-[a-z0-9]+-av1\.jpg$/);
    assert.ok(pub().includes(iv.avifSiblingPath(bannerUrl.split("/public/media/")[1])));

    // AVIF not smaller: plain upload, no mark, no sibling.
    mode = "big";
    const before = pub().length;
    res = await post("avatar", "avatar", image, "image/png", "me.png");
    assert.equal(res.status, 200);
    let url = (await res.json()).avatarUrl;
    assert.match(url, /\/avatars\/\d+-[a-z0-9]+\.png$/, "unmarked when AVIF is not smaller");
    assert.equal(pub().length, before + 1, "only the original stored");

    // GIF avatar: never converted.
    mode = "small";
    const gif = Buffer.concat([Buffer.from("GIF89a"), Buffer.alloc(64, 1)]);
    res = await post("avatar", "avatar", gif, "image/gif", "anim.gif");
    url = (await res.json()).avatarUrl;
    assert.match(url, /\/avatars\/\d+-[a-z0-9]+\.gif$/, "GIF stays as it is");

    // Public image (group photo / server icon).
    res = await post("upload", "file", image, "image/png", "icon.png");
    assert.match((await res.json()).url, /\/images\/\d+-[a-z0-9]+-av1\.png$/);

    // Encoder off (MEDIA_AVIF=off): unchanged behaviour.
    process.env.MEDIA_AVIF = "off";
    res = await post("upload", "file", image, "image/png", "icon.png");
    assert.match((await res.json()).url, /\/images\/\d+-[a-z0-9]+\.png$/, "MEDIA_AVIF=off: plain upload");
    delete process.env.MEDIA_AVIF;

    // Chat image (private): marked at once, sibling arrives in the background.
    res = await post("upload", "file", image, "image/png", "photo.png", { purpose: "message" });
    assert.equal(res.status, 200);
    const chatUrl = (await res.json()).url;
    const chatPath = new URL(chatUrl).pathname.replace(/^\/api\/media\/f\//, "");
    assert.match(chatPath, /^images\/\d+-[a-z0-9]+-av1\.png$/);
    for (let i = 0; i < 50 && !priv().includes(iv.avifSiblingPath(chatPath)); i++) await new Promise((r) => setTimeout(r, 10));
    assert.ok(priv().includes(iv.avifSiblingPath(chatPath)), "background AVIF stored in the private bucket");

    // Accept negotiation on GET /f.
    const signed = new URL(chatUrl);
    const get = (accept, dest) => fetch(`${base}${signed.pathname}${signed.search}`, {
      redirect: "manual",
      headers: { accept, ...(dest ? { "sec-fetch-dest": dest } : {}) },
    });
    const IMG = "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8";
    res = await get(IMG, "image");
    assert.equal(res.status, 302);
    assert.match(res.headers.get("location"), /-av1\.avif\?/, "AVIF-capable <img> gets the sibling");
    assert.match(res.headers.get("vary") || "", /Accept/i, "Vary: Accept");
    assert.match(res.headers.get("cache-control") || "", /no-store/);
    res = await get("image/webp,image/png,image/svg+xml,image/*;q=0.8,*/*;q=0.5", "image");
    assert.match(res.headers.get("location"), /-av1\.png\?/, "no image/avif in Accept: original");
    res = await get("*/*", "empty");
    assert.match(res.headers.get("location"), /-av1\.png\?/, "fetch() download: original");
    res = await get("text/html,application/xhtml+xml,image/avif,*/*;q=0.8", "document");
    assert.match(res.headers.get("location"), /-av1\.png\?/, "opened in a tab: original");

    // Encoder failed for a chat image: the marked original still loads for AVIF clients.
    mode = "fail";
    res = await post("upload", "file", image, "image/png", "photo2.png", { purpose: "message" });
    const chat2 = new URL((await res.json()).url);
    await new Promise((r) => setTimeout(r, 50));
    assert.ok(!priv().includes(iv.avifSiblingPath(chat2.pathname.replace(/^\/api\/media\/f\//, ""))), "no sibling after a failed encode");
    res = await fetch(`${base}${chat2.pathname}${chat2.search}`, { redirect: "manual", headers: { accept: IMG, "sec-fetch-dest": "image" } });
    assert.equal(res.status, 302);
    assert.match(res.headers.get("location"), /-av1\.png\?/, "missing sibling: original");
    res = await fetch(`${base}${chat2.pathname}${chat2.search}`, { redirect: "manual", headers: { accept: IMG, "sec-fetch-dest": "image" } });
    assert.match(res.headers.get("location"), /-av1\.png\?/, "missing sibling remembered: original again");

    // Bad signature still refused before any negotiation.
    res = await fetch(`${base}${signed.pathname}?e=1&s=x`, { redirect: "manual", headers: { accept: IMG } });
    assert.equal(res.status, 403);
    console.log("mediaAvif: all checks passed");
  } finally {
    console.warn = realWarn;
    server.close();
    iv._resetForTests();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
