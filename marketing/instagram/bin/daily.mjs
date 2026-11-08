#!/usr/bin/env node
/**
 * Daily Reel run (used by .github/workflows/instagram-reels.yml).
 *   node bin/daily.mjs --mode dry-run|publish [--script-id <id>] [--out <dir>]
 * Writes <out>/result.json, caption.txt, plan.json, the MP4 and the cover.
 * Publish mode needs IG_AUTOPOST_ENABLED=true, IG_USER_ID, IG_ACCESS_TOKEN and storage env.
 * Exit codes: 0 = published / rendered / skipped, 1 = failed, 3 = library exhausted.
 */
import { appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { loadPolicy } from "../lib/config.mjs";
import { runDaily } from "../lib/daily.mjs";
import { loadLibrary, readPostedLog, writePostedLog } from "../lib/library.mjs";
import { validateVideoFile } from "../lib/mp4.mjs";
import { renderReel } from "../lib/render/render.mjs";
import { loadScreenshotAllowlist } from "../lib/validator.mjs";

const argv = process.argv.slice(2);
const arg = (name, def) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : def;
};
const mode = arg("mode", "dry-run");
if (!["dry-run", "publish"].includes(mode)) {
  console.error("--mode must be dry-run or publish");
  process.exit(2);
}
const outDir = resolve(arg("out", join(tmpdir(), "descall-reel")));
const policy = loadPolicy();
const screenshots = loadScreenshotAllowlist(policy);

function output(key, value) {
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${String(value ?? "").replace(/\n/g, " ")}\n`);
}

try {
  const result = await runDaily(
    { mode, scriptId: arg("script-id", "") || undefined, outDir, policy, scripts: loadLibrary(), posts: readPostedLog(), screenshots },
    {
      render: (script, dir) => renderReel(script, { outDir: dir, screenshots, log: (m) => console.log(m) }),
      checkVideo: (file) => validateVideoFile(file, { minSec: policy.limits.minDurationSec, maxSec: policy.limits.maxDurationSec }),
      writeLog: (posts) => writePostedLog(posts),
      log: (m) => console.log(m),
    },
  );
  console.log(`result: ${result.status} - ${result.reason}${result.scriptId ? ` (${result.scriptId})` : ""}`);
  if (result.video) console.log(`video: ${result.video.width}x${result.video.height}, ${result.video.duration?.toFixed?.(2)}s, ${(result.video.size / 1048576).toFixed(2)} MB`);
  output("status", result.status);
  output("script_id", result.scriptId || "");
  output("permalink", result.entry?.permalink || "");
  output("out_dir", outDir);
  if (result.status === "exhausted") {
    console.log("::warning::Instagram content library exhausted; add scripts under marketing/instagram/content/");
    process.exit(3);
  }
  process.exit(result.status === "failed" ? 1 : 0);
} catch (e) {
  // Messages from lib/graph.mjs and lib/storage.mjs are already redacted.
  console.error(`daily run failed: ${e?.message || e}`);
  output("status", "failed");
  process.exit(1);
}
