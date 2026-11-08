#!/usr/bin/env node
/**
 * Validate the whole content library (and the posted log). Exit 1 on any error.
 *   node bin/validate.mjs [--json]
 */
import { loadPolicy } from "../lib/config.mjs";
import { loadLibrary, readPostedLog } from "../lib/library.mjs";
import { loadScreenshotAllowlist, validateLibrary } from "../lib/validator.mjs";
import { buildTimeline } from "../lib/script.mjs";

const policy = loadPolicy();
const screenshots = loadScreenshotAllowlist(policy);
const scripts = loadLibrary();
const { results, valid, errorCount } = validateLibrary(scripts, { policy, screenshots });

const posts = readPostedLog();
const logErrors = [];
posts.forEach((p, i) => {
  for (const k of ["scriptId", "date", "mediaId"]) if (!p[k]) logErrors.push(`posted-log[${i}] is missing ${k}`);
});

if (process.argv.includes("--json")) {
  console.log(JSON.stringify({ scripts: scripts.length, valid: valid.length, results, logErrors }, null, 2));
} else {
  const byTheme = {};
  for (const s of valid) byTheme[s.theme] = (byTheme[s.theme] || 0) + 1;
  for (const r of results) {
    if (r.errors.length) console.log(`FAIL ${r.id} (${r.file})\n  - ${r.errors.join("\n  - ")}`);
  }
  for (const e of logErrors) console.log(`FAIL ${e}`);
  const durations = valid.map((s) => buildTimeline(s).total);
  console.log(`${valid.length}/${scripts.length} scripts valid, ${Object.keys(byTheme).length} themes, durations ${Math.min(...durations)}-${Math.max(...durations)}s`);
  for (const [t, n] of Object.entries(byTheme)) console.log(`  ${t}: ${n}`);
  const missing = Object.keys(policy.themes).filter((t) => !byTheme[t]);
  if (missing.length) console.log(`themes without a valid script: ${missing.join(", ")}`);
  console.log(`posted log: ${posts.length} entries`);
}
process.exit(errorCount + logErrors.length ? 1 : 0);
