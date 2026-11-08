import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { decideMode, runDaily } from "../lib/daily.mjs";
import { GraphClient } from "../lib/graph.mjs";
import { loadScreenshotAllowlist } from "../lib/validator.mjs";
import { makeScript, policy, res, scriptedFetch } from "./fixtures.mjs";

const screenshots = loadScreenshotAllowlist(policy);
const NOW = new Date("2026-11-10T16:15:00Z"); // 19:15 Istanbul
const FULL_ENV = { IG_AUTOPOST_ENABLED: "true", IG_USER_ID: "1784", IG_ACCESS_TOKEN: "test-token-bbbb", SUPABASE_URL: "https://p.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "k" };

test("gate: dry run by default on manual runs, kill switch and secrets on real runs", () => {
  assert.equal(decideMode({ env: {}, event: "workflow_dispatch", dryRunInput: "true", now: NOW }).mode, "dry-run");
  assert.equal(decideMode({ env: {}, event: "workflow_dispatch", now: NOW }).mode, "dry-run");
  assert.match(decideMode({ env: { ...FULL_ENV, IG_AUTOPOST_ENABLED: "false" }, event: "schedule", now: NOW }).reason, /kill switch/);
  assert.match(decideMode({ env: { ...FULL_ENV, IG_AUTOPOST_ENABLED: "TRUE" }, event: "schedule", now: NOW }).reason, /kill switch/);
  assert.match(decideMode({ env: { ...FULL_ENV, IG_ACCESS_TOKEN: "" }, event: "schedule", now: NOW }).reason, /IG_USER_ID/);
  assert.match(decideMode({ env: { ...FULL_ENV, SUPABASE_URL: "" }, event: "schedule", now: NOW }).reason, /no public storage/);
  assert.equal(decideMode({ env: { ...FULL_ENV, SUPABASE_URL: "", IG_MEDIA_FALLBACK: "github-release", GITHUB_TOKEN: "t" }, event: "schedule", now: NOW }).mode, "publish");
  assert.equal(decideMode({ env: FULL_ENV, event: "schedule", now: NOW }).mode, "publish");
  assert.equal(decideMode({ env: FULL_ENV, event: "workflow_dispatch", dryRunInput: "false", now: NOW }).mode, "publish");
  assert.match(decideMode({ env: FULL_ENV, event: "schedule", posts: [{ date: "2026-11-10" }], now: NOW }).reason, /already posted today/);
  assert.match(decideMode({ env: FULL_ENV, event: "schedule", now: new Date("2026-11-10T21:30:00Z") }).reason, /outside/);
});

function setup() {
  const dir = mkdtempSync(join(tmpdir(), "reel-daily-"));
  const video = join(dir, "v.mp4");
  const cover = join(dir, "c.jpg");
  writeFileSync(video, "video");
  writeFileSync(cover, "cover");
  const calls = { render: 0, logs: [] };
  const deps = {
    render: async () => { calls.render++; return { video, cover, total: 15 }; },
    checkVideo: () => ({ ok: true, errors: [], info: { width: 1080, height: 1920, duration: 15, size: 5 } }),
    writeLog: (posts) => { calls.written = posts; },
    log: (m) => calls.logs.push(m),
    verifyUrl: async () => true,
    pollIntervalMs: 1,
  };
  return { dir, deps, calls, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

const scripts = [makeScript({ id: "one" }), makeScript({ id: "two", theme: "oyun", hook: { lines: ["Başka hook"] }, caption: "Başka caption" })];

test("dry run renders and checks but never touches Instagram or the log", async () => {
  const { dir, deps, calls, cleanup } = setup();
  const r = await runDaily({ mode: "dry-run", outDir: dir, policy, scripts, posts: [], screenshots, env: {}, now: NOW }, deps);
  assert.equal(r.status, "rendered");
  assert.equal(r.scriptId, "one");
  assert.equal(calls.render, 1);
  assert.equal(calls.written, undefined);
  cleanup();
});

test("publish refuses without the kill switch even if called directly", async () => {
  const { dir, deps, calls, cleanup } = setup();
  const r = await runDaily({ mode: "publish", outDir: dir, policy, scripts, posts: [], screenshots, env: { ...FULL_ENV, IG_AUTOPOST_ENABLED: "no" }, now: NOW }, deps);
  assert.equal(r.status, "skipped");
  assert.equal(calls.render, 0);
  cleanup();
});

test("publish: upload, container, poll, publish, posted log", async () => {
  const { dir, deps, calls, cleanup } = setup();
  const f = scriptedFetch([
    res(200, { id: "1784", username: "descall" }),
    res(200, { data: [{ quota_usage: 1, config: { quota_total: 100 } }] }),
    res(200, { data: [] }),
    res(200, { id: "c1" }),
    res(200, { status_code: "IN_PROGRESS" }),
    res(200, { status_code: "FINISHED" }),
    res(200, { id: "m1" }),
    res(200, { id: "m1", permalink: "https://www.instagram.com/reel/x/" }),
  ]);
  const uploads = [];
  deps.graph = new GraphClient({ igUserId: "1784", accessToken: "test-token-bbbb", fetch: f, sleep: async () => {} });
  deps.storage = { kind: "test", store: { upload: async (path, bytes, type) => { uploads.push([path, type]); return `https://cdn.example/${path}`; } } };
  const r = await runDaily({ mode: "publish", outDir: dir, policy, scripts, posts: [], screenshots, env: FULL_ENV, now: NOW }, deps);
  assert.equal(r.status, "published", r.reason);
  assert.deepEqual(uploads, [["reels/2026-11-10-one.mp4", "video/mp4"], ["reels/2026-11-10-one.jpg", "image/jpeg"]]);
  const create = Object.fromEntries(new URLSearchParams(f.calls[3].init.body));
  assert.equal(create.video_url, "https://cdn.example/reels/2026-11-10-one.mp4");
  assert.equal(create.cover_url, "https://cdn.example/reels/2026-11-10-one.jpg");
  assert.equal(calls.written.length, 1);
  assert.equal(calls.written[0].scriptId, "one");
  assert.equal(calls.written[0].mediaId, "m1");
  assert.equal(calls.written[0].permalink, "https://www.instagram.com/reel/x/");
  assert.equal(calls.written[0].date, "2026-11-10");
  assert.equal(f.pending(), 0);
  cleanup();
});

test("publish skips near the API publishing limit", async () => {
  const { dir, deps, calls, cleanup } = setup();
  const f = scriptedFetch([res(200, { id: "1784" }), res(200, { data: [{ quota_usage: 96, config: { quota_total: 100 } }] })]);
  deps.graph = new GraphClient({ igUserId: "1784", accessToken: "test-token-bbbb", fetch: f, sleep: async () => {} });
  const r = await runDaily({ mode: "publish", outDir: dir, policy, scripts, posts: [], screenshots, env: FULL_ENV, now: NOW }, deps);
  assert.equal(r.status, "skipped");
  assert.match(r.reason, /near the publishing limit/);
  assert.equal(calls.render, 0);
  cleanup();
});

test("a failed video check stops before upload", async () => {
  const { dir, deps, cleanup } = setup();
  deps.checkVideo = () => ({ ok: false, errors: ["resolution 720x1280"], info: {} });
  const r = await runDaily({ mode: "dry-run", outDir: dir, policy, scripts, posts: [], screenshots, env: {}, now: NOW }, deps);
  assert.equal(r.status, "failed");
  assert.match(r.reason, /720x1280/);
  cleanup();
});

test("an invalid forced script fails with the validator's reasons", async () => {
  const { dir, deps, cleanup } = setup();
  const bad = makeScript({ id: "bad", caption: "Türkiye'nin en iyi uygulaması" });
  const r = await runDaily({ mode: "dry-run", scriptId: "bad", outDir: dir, policy, scripts: [bad], posts: [], screenshots, env: {}, now: NOW }, deps);
  assert.equal(r.status, "failed");
  assert.match(r.reason, /en iyi/);
  cleanup();
});
