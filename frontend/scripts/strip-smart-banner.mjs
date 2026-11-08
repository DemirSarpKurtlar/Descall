#!/usr/bin/env node
/**
 * The native app never carries the iOS Smart App Banner meta (it advertises the app to
 * Safari visitors of descall.com). The marketing shells in dist/ keep it; after
 * `npx cap copy|sync <platform>` copied dist/ into the native project, this removes the
 * tag from every copied HTML file. Runs as the Capacitor `capacitor:copy:after` hook
 * (package.json), which sets CAPACITOR_PLATFORM_NAME.
 *
 *   node scripts/strip-smart-banner.mjs            (hook: ios / android copy target)
 *   node scripts/strip-smart-banner.mjs <dir>      (any folder)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Native web folders Capacitor copies dist/ into. */
export const NATIVE_WEB_DIRS = {
  ios: "ios/App/App/public",
  android: "android/app/src/main/assets/public",
};

const BANNER_RE = /[ \t]*<meta\s+name="apple-itunes-app"[^>]*>[ \t]*\r?\n?/gi;
const BANNER_COMMENT_RE = /[ \t]*<!--\s*iOS Smart App Banner[\s\S]*?-->[ \t]*\r?\n?/gi;

export function stripSmartBanner(html) {
  return String(html).replace(BANNER_COMMENT_RE, "").replace(BANNER_RE, "");
}

function htmlFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) htmlFiles(p, out);
    else if (entry.name.endsWith(".html")) out.push(p);
  }
  return out;
}

/** Strips every HTML file under `dir`; returns how many files changed. */
export function stripDir(dir) {
  let changed = 0;
  for (const file of htmlFiles(dir)) {
    const before = fs.readFileSync(file, "utf8");
    const after = stripSmartBanner(before);
    if (after !== before) {
      fs.writeFileSync(file, after, "utf8");
      changed += 1;
    }
  }
  return changed;
}

function main() {
  const arg = process.argv[2];
  const platform = String(process.env.CAPACITOR_PLATFORM_NAME || "");
  const rel = arg || NATIVE_WEB_DIRS[platform];
  if (!rel) {
    console.log(`[strip-smart-banner] nothing to do for platform "${platform || "none"}"`);
    return;
  }
  const dir = path.resolve(process.env.CAPACITOR_ROOT_DIR || root, rel);
  if (!fs.existsSync(dir)) {
    console.error(`[strip-smart-banner] ${dir} does not exist`);
    process.exit(1);
  }
  const changed = stripDir(dir);
  console.log(`[strip-smart-banner] removed the Smart App Banner from ${changed} file(s) in ${path.relative(root, dir) || dir}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) main();
