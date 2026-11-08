import { test } from "node:test";
import assert from "node:assert/strict";
import { GithubReleaseStorage, SupabaseStorage, storageFromEnv, verifyPublicUrl } from "../lib/storage.mjs";
import { res, scriptedFetch } from "./fixtures.mjs";

const KEY = "test-key-aaaa";

test("Supabase: upload with service-role headers and return the public URL", async () => {
  const f = scriptedFetch([res(200, { Key: "marketing-reels/reels/2026-11-10-a.mp4" })]);
  const s = new SupabaseStorage({ url: "https://proj.supabase.co/", serviceKey: KEY, fetch: f });
  const url = await s.upload("reels/2026-11-10-a.mp4", Buffer.from("x"), "video/mp4");
  assert.equal(url, "https://proj.supabase.co/storage/v1/object/public/marketing-reels/reels/2026-11-10-a.mp4");
  const { url: called, init } = f.calls[0];
  assert.equal(called, "https://proj.supabase.co/storage/v1/object/marketing-reels/reels/2026-11-10-a.mp4");
  assert.equal(init.headers.Authorization, `Bearer ${KEY}`);
  assert.equal(init.headers.apikey, KEY);
  assert.equal(init.headers["x-upsert"], "true");
  assert.equal(init.headers["Content-Type"], "video/mp4");
});

test("Supabase: creates the public bucket once, refuses a private one", async () => {
  const f = scriptedFetch([res(404, { error: "Bucket not found" }), res(200, { name: "marketing-reels" })]);
  const s = new SupabaseStorage({ url: "https://p.supabase.co", serviceKey: KEY, fetch: f });
  assert.deepEqual(await s.ensureBucket(), { created: true });
  assert.equal(JSON.parse(f.calls[1].init.body).public, true);
  const g = scriptedFetch([res(200, { id: "marketing-reels", public: true })]);
  assert.deepEqual(await new SupabaseStorage({ url: "https://p.supabase.co", serviceKey: KEY, fetch: g }).ensureBucket(), { created: false });
  const h = scriptedFetch([res(200, { id: "marketing-reels", public: false })]);
  await assert.rejects(new SupabaseStorage({ url: "https://p.supabase.co", serviceKey: KEY, fetch: h }).ensureBucket(), /not public/);
});

test("Supabase: upload errors are redacted", async () => {
  const f = scriptedFetch([res(403, { message: `bad key ${KEY}` })]);
  const s = new SupabaseStorage({ url: "https://p.supabase.co", serviceKey: KEY, fetch: f });
  await assert.rejects(s.upload("a.mp4", Buffer.from("x"), "video/mp4"), (e) => !e.message.includes(KEY) && /403/.test(e.message));
});

test("GitHub release fallback: creates the prerelease, replaces an old asset, returns the download URL", async () => {
  const f = scriptedFetch([
    res(404, {}),
    res(201, { id: 7, assets: [] }),
    res(201, { browser_download_url: "https://github.com/o/r/releases/download/instagram-reels-media/reels-a.mp4" }),
  ]);
  const s = new GithubReleaseStorage({ repo: "o/r", token: "ghs_x", fetch: f });
  const url = await s.upload("reels/a.mp4", Buffer.from("x"), "video/mp4");
  assert.equal(url, "https://github.com/o/r/releases/download/instagram-reels-media/reels-a.mp4");
  assert.equal(JSON.parse(f.calls[1].init.body).prerelease, true);
  assert.equal(f.calls[2].url, "https://uploads.github.com/repos/o/r/releases/7/assets?name=reels-a.mp4");
  const g = scriptedFetch([res(200, { id: 7, assets: [{ id: 99, name: "reels-a.mp4" }] }), res(204, ""), res(201, { browser_download_url: "u" })]);
  await new GithubReleaseStorage({ repo: "o/r", token: "t", fetch: g }).upload("reels/a.mp4", Buffer.from("x"), "video/mp4");
  assert.equal(g.calls[1].init.method, "DELETE");
});

test("storageFromEnv prefers Supabase, uses the release fallback only when asked", () => {
  assert.equal(storageFromEnv({ SUPABASE_URL: "https://p", SUPABASE_SERVICE_ROLE_KEY: "k" }).kind, "supabase");
  assert.equal(storageFromEnv({ GITHUB_TOKEN: "t", GITHUB_REPOSITORY: "o/r" }), null);
  assert.equal(storageFromEnv({ GITHUB_TOKEN: "t", GITHUB_REPOSITORY: "o/r", IG_MEDIA_FALLBACK: "github-release" }).kind, "github-release");
});

test("verifyPublicUrl checks reachability and type", async () => {
  await verifyPublicUrl("https://p/v.mp4", "video/mp4", { fetch: scriptedFetch([res(200, "", { "content-type": "video/mp4" })]) });
  await assert.rejects(verifyPublicUrl("https://p/v.mp4", "video/mp4", { fetch: scriptedFetch([res(404, "")]) }), /not reachable/);
  await assert.rejects(verifyPublicUrl("https://p/v.mp4", "video/mp4", { fetch: scriptedFetch([res(200, "", { "content-type": "text/html" })]) }), /text\/html/);
});
