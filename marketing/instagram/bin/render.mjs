#!/usr/bin/env node
/**
 * Render one or more scripts to MP4 + cover after validating them.
 *   node bin/render.mjs --id <script-id> [--id <other>] --out <dir> [--fps 30]
 * Videos never go into the repo: pass an --out outside it (default: $TMPDIR/descall-reels).
 */
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { loadPolicy, REPO_ROOT } from "../lib/config.mjs";
import { loadLibrary } from "../lib/library.mjs";
import { loadScreenshotAllowlist, validateScript } from "../lib/validator.mjs";
import { validateVideoFile } from "../lib/mp4.mjs";
import { renderReel } from "../lib/render/render.mjs";
import { buildCaption } from "../lib/caption.mjs";
import { writeFileSync } from "node:fs";

function args(argv) {
  const o = { ids: [], out: join(tmpdir(), "descall-reels"), fps: 30 };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--id") o.ids.push(argv[++i]);
    else if (a === "--out") o.out = resolve(argv[++i]);
    else if (a === "--fps") o.fps = Number(argv[++i]);
  }
  return o;
}

const opts = args(process.argv);
if (!opts.ids.length) {
  console.error("usage: node bin/render.mjs --id <script-id> [--out dir]");
  process.exit(2);
}
if (resolve(opts.out).startsWith(REPO_ROOT + "/")) {
  console.error("refusing to render into the repository; pick an --out outside it");
  process.exit(2);
}
const policy = loadPolicy();
const screenshots = loadScreenshotAllowlist(policy);
const library = loadLibrary();
let failed = false;
for (const id of opts.ids) {
  const script = library.find((s) => s.id === id);
  if (!script) {
    console.error(`unknown script ${id}`);
    failed = true;
    continue;
  }
  const errors = validateScript(script, { policy, screenshots });
  if (errors.length) {
    console.error(`${id} is invalid:\n  ${errors.join("\n  ")}`);
    failed = true;
    continue;
  }
  const started = Date.now();
  const r = await renderReel(script, { outDir: opts.out, screenshots, fps: opts.fps, log: (m) => console.log(m) });
  writeFileSync(join(opts.out, `${id}-caption.txt`), buildCaption(script) + "\n");
  const check = validateVideoFile(r.video, { minSec: policy.limits.minDurationSec, maxSec: policy.limits.maxDurationSec });
  const i = check.info;
  console.log(`${id}: ${r.video} ${i.width}x${i.height} ${i.fps}fps ${i.duration.toFixed(2)}s ${(i.size / 1024 / 1024).toFixed(2)} MB ${i.videoCodec}/${i.audioCodec} ${i.audioRate}Hz boxes=${i.boxes.join(",")} (${((Date.now() - started) / 1000).toFixed(1)}s)`);
  console.log(`${id}: cover ${r.cover}`);
  if (!check.ok) {
    console.error(`${id}: video spec errors: ${check.errors.join("; ")}`);
    failed = true;
  }
}
process.exit(failed ? 1 : 0);
