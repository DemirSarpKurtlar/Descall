// node src/lib/privateMediaUrls.selftest.mjs — 2.11.2 private chat media: expiry detection,
// batched refresh through /api/media/refresh, cache of the freshest URL per storage path.
import assert from "node:assert/strict";

const store = new Map([["descall_token", "tok-1"]]);
globalThis.window = {
  location: { origin: "https://descall.com", hostname: "descall.com" },
  localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) },
  addEventListener() {},
};
const { SECURE_TOKEN_KEY } = await import("./secureToken.js");
store.set(SECURE_TOKEN_KEY, "tok-1");
const m = await import("./privateMediaUrls.js");

const nowS = Math.floor(Date.now() / 1000);
const fresh = `https://des-call.onrender.com/api/media/f/images/1-a.png?e=${nowS + 7200}&s=abc`;
const stale = `https://des-call.onrender.com/api/media/f/images/1-a.png?e=${nowS + 30}&s=old`;
const legacy = "https://x.supabase.co/storage/v1/object/public/media/files/2-b.pdf";

assert.equal(m.mediaPathOf(fresh), "images/1-a.png");
assert.equal(m.mediaPathOf(legacy), "files/2-b.pdf");
assert.equal(m.mediaPathOf("https://x.supabase.co/storage/v1/object/public/media/avatars/1.png"), null, "avatars untouched");
assert.equal(m.mediaPathOf("https://media.tenor.com/a.gif"), null);
assert.equal(m.isPrivateMediaUrl(fresh), true);
assert.equal(m.isPrivateMediaUrl(legacy), false);
assert.equal(m.needsRefresh(fresh), false);
assert.equal(m.needsRefresh(stale), true, "refresh shortly before expiry");
assert.equal(m.needsRefresh(legacy), false);

const calls = [];
const newer = `https://des-call.onrender.com/api/media/f/images/1-a.png?e=${nowS + 10800}&s=new`;
const fetchImpl = async (url, init) => {
  calls.push({ url, auth: init.headers.Authorization, body: JSON.parse(init.body) });
  return { ok: true, json: async () => ({ urls: { [stale]: newer } }) };
};
const [a, b, c] = await Promise.all([
  m.refreshMediaUrl(stale, { fetchImpl }),
  m.refreshMediaUrl(stale, { fetchImpl }),
  m.refreshMediaUrl(legacy, { fetchImpl }),
]);
assert.equal(calls.length, 1, "one batched request");
assert.match(calls[0].url, /\/api\/media\/refresh$/);
assert.equal(calls[0].auth, "Bearer tok-1");
assert.deepEqual(calls[0].body.urls.sort(), [legacy, stale].sort());
assert.equal(a, newer);
assert.equal(b, newer);
assert.equal(c, null, "not allowed → null (no URL invented)");
assert.equal(m.bestKnownUrl(stale), newer, "cache serves the freshest URL for the path");
assert.equal(m.bestKnownUrl(fresh), newer);
assert.equal(await m.refreshMediaUrl("https://media.tenor.com/a.gif", { fetchImpl }), null);
assert.equal(calls.length, 1);
console.log("privateMediaUrls selftest OK");
