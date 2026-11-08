import { test } from "node:test";
import assert from "node:assert/strict";
import { GraphClient, GraphError, debugToken, exchangeLongLivedToken, redact } from "../lib/graph.mjs";
import { res, scriptedFetch } from "./fixtures.mjs";

const TOKEN = "test-token-aaaa";
const noSleep = async () => {};
const client = (fetch, extra = {}) => new GraphClient({ igUserId: "1784", accessToken: TOKEN, version: "v24.0", fetch, sleep: noSleep, ...extra });
const form = (init) => Object.fromEntries(new URLSearchParams(init.body));

test("creates a REELS container with the token in the header, never in the URL", async () => {
  const f = scriptedFetch([res(200, { id: "c1" })]);
  const id = await client(f).createReelContainer({ videoUrl: "https://x.supabase.co/v.mp4", caption: "Merhaba #descall", coverUrl: "https://x.supabase.co/c.jpg" });
  assert.equal(id, "c1");
  const { url, init } = f.calls[0];
  assert.equal(url, "https://graph.facebook.com/v24.0/1784/media");
  assert.equal(init.method, "POST");
  assert.equal(init.headers.Authorization, `Bearer ${TOKEN}`);
  assert.ok(!url.includes(TOKEN) && !init.body.includes(TOKEN));
  assert.deepEqual(form(init), { media_type: "REELS", video_url: "https://x.supabase.co/v.mp4", caption: "Merhaba #descall", share_to_feed: "true", cover_url: "https://x.supabase.co/c.jpg" });
});

test("refuses a non-https video URL", async () => {
  await assert.rejects(client(scriptedFetch([])).createReelContainer({ videoUrl: "http://x/v.mp4", caption: "a" }), /public https/);
});

test("polls status_code until FINISHED", async () => {
  const f = scriptedFetch([res(200, { status_code: "IN_PROGRESS" }), res(200, { status_code: "IN_PROGRESS" }), res(200, { status_code: "FINISHED" })]);
  const r = await client(f).waitForContainer("c1", { intervalMs: 1, timeoutMs: 1000 });
  assert.deepEqual(r, { statusCode: "FINISHED", polls: 3 });
  assert.match(f.calls[0].url, /\/c1\?fields=status_code%2Cstatus$/);
});

test("ERROR and EXPIRED containers fail with the status text", async () => {
  const f = scriptedFetch([res(200, { status_code: "ERROR", status: "Error: video codec not supported" })]);
  await assert.rejects(client(f).waitForContainer("c1", { intervalMs: 1 }), /ERROR: Error: video codec/);
  const g = scriptedFetch([res(200, { status_code: "EXPIRED" })]);
  await assert.rejects(client(g).waitForContainer("c1", { intervalMs: 1 }), /EXPIRED/);
});

test("polling gives up after the timeout", async () => {
  const f = scriptedFetch(Array.from({ length: 5 }, () => res(200, { status_code: "IN_PROGRESS" })));
  await assert.rejects(client(f).waitForContainer("c1", { intervalMs: 400, timeoutMs: 500 }), /not ready/);
});

test("full publish flow: container, poll, media_publish, permalink", async () => {
  const f = scriptedFetch([
    res(200, { id: "c9" }),
    res(200, { status_code: "FINISHED" }),
    res(200, { id: "m42" }),
    res(200, { id: "m42", permalink: "https://www.instagram.com/reel/abc/", timestamp: "2026-11-10T16:20:00+0000" }),
  ]);
  const r = await client(f).publishReel({ videoUrl: "https://s/v.mp4", caption: "c", pollIntervalMs: 1 });
  assert.deepEqual(r, { containerId: "c9", mediaId: "m42", permalink: "https://www.instagram.com/reel/abc/", timestamp: "2026-11-10T16:20:00+0000" });
  assert.equal(f.calls[2].url, "https://graph.facebook.com/v24.0/1784/media_publish");
  assert.deepEqual(form(f.calls[2].init), { creation_id: "c9" });
});

test("a lost media_publish response does not post twice", async () => {
  const f = scriptedFetch([
    () => { throw new Error("socket hang up"); },
    res(200, { status_code: "PUBLISHED" }),
    res(200, { data: [{ id: "m77", caption: "c" }] }),
  ]);
  assert.equal(await client(f).publish("c9"), "m77");
  assert.equal(f.calls.filter((c) => c.url.endsWith("/media_publish")).length, 1);
});

test("media_publish is retried while the container is still unpublished", async () => {
  const f = scriptedFetch([
    res(500, { error: { message: "temporary", code: 2 } }),
    res(200, { status_code: "FINISHED" }),
    res(200, { id: "m5" }),
  ]);
  assert.equal(await client(f).publish("c1"), "m5");
});

test("permanent errors are not retried", async () => {
  const f = scriptedFetch([res(400, { error: { message: "Invalid parameter", code: 100 } }), res(200, { status_code: "FINISHED" })]);
  await assert.rejects(client(f).publish("c1"), (e) => e instanceof GraphError && e.code === 100);
});

test("GET requests retry transient failures with backoff", async () => {
  const waits = [];
  const f = scriptedFetch([res(503, "busy"), res(200, { error: { message: "rate", code: 4 } }), res(200, { id: "1784", username: "descall" })]);
  const c = client(f, { sleep: async (ms) => waits.push(ms) });
  assert.deepEqual(await c.getAccount(), { id: "1784", username: "descall" });
  assert.deepEqual(waits, [2000, 4000]);
});

test("content_publishing_limit is parsed", async () => {
  const f = scriptedFetch([res(200, { data: [{ quota_usage: 3, config: { quota_total: 100, quota_duration: 86400 } }] })]);
  const l = await client(f).getPublishingLimit();
  assert.deepEqual([l.used, l.total, l.remaining], [3, 100, 97]);
  assert.match(f.calls[0].url, /\/1784\/content_publishing_limit\?fields=config%2Cquota_usage$/);
});

test("errors never carry the token", async () => {
  const f = scriptedFetch([res(400, { error: { message: `bad token ${TOKEN} access_token=${TOKEN}`, code: 190 } })]);
  await assert.rejects(client(f).getAccount(), (e) => !e.message.includes(TOKEN) && /\[redacted\]/.test(e.message));
  assert.equal(redact("x?access_token=abc&y=1", []), "x?access_token=[redacted]&y=1");
});

test("long-lived token exchange and debug_token", async () => {
  const f = scriptedFetch([res(200, { access_token: "new-token-aaaa", token_type: "bearer", expires_in: 5183944 })]);
  const r = await exchangeLongLivedToken({ appId: "app", appSecret: "secret-aaaa", token: TOKEN, fetch: f });
  assert.deepEqual(r, { accessToken: "new-token-aaaa", expiresIn: 5183944, tokenType: "bearer" });
  const u = new URL(f.calls[0].url);
  assert.equal(u.searchParams.get("grant_type"), "fb_exchange_token");
  const bad = scriptedFetch([res(400, { error: { message: "Error validating client secret secret-aaaa" } })]);
  await assert.rejects(exchangeLongLivedToken({ appId: "app", appSecret: "secret-aaaa", token: TOKEN, fetch: bad }), (e) => !e.message.includes("secret-aaaa"));
  const d = scriptedFetch([res(200, { data: { is_valid: true, expires_at: 0, scopes: ["instagram_basic", "instagram_content_publish"], type: "SYSTEM_USER" } })]);
  const t = await debugToken({ appId: "app", appSecret: "s", token: TOKEN, fetch: d });
  assert.equal(t.isValid, true);
  assert.equal(t.expiresAt, null);
  assert.deepEqual(t.scopes, ["instagram_basic", "instagram_content_publish"]);
});
