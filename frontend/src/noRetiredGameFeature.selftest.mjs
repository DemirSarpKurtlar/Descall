/**
 * 2.13.0: the game tab, its lobbies, the account link and every mention of
 * that game, its publisher and the team-finder are gone from Descall.
 * This guard scans everything that ships to users (app source, i18n,
 * marketing site, public assets, index.html, Electron, the App Store
 * listing files) and fails on any case-insensitive hit.
 * Run: node frontend/src/noRetiredGameFeature.selftest.mjs
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const frontend = join(here, "..");
const repo = join(frontend, "..");

// Built from parts so this file does not trip its own scan.
const BANNED = new RegExp(["valo" + "rant", "\\bri" + "ot", "ri" + "ot[A-Z_]", "lf" + "g", "takım " + "bul", "looking for " + "group", "play sek" + "me", "play " + "tab"].join("|"), "i");

// Redirect rules have to name the retired paths to send them home.
const ALLOW = new Set([
  "frontend/public/_redirects",
  "frontend/public/_worker.js",
]);
const TEXT = /\.(jsx?|mjs|cjs|css|html|json|txt|webmanifest|xml|md|plist|xcprivacy|strings|py)$/;
const SKIP_DIR = new Set(["node_modules", "dist", "build", "release", ".vite", "Pods", "public-dist"]);

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (SKIP_DIR.has(name)) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (TEXT.test(name) && !/\.selftest\./.test(name)) out.push(p);
  }
  return out;
}

const roots = [
  join(frontend, "src"),
  join(frontend, "public"),
  join(frontend, "index.html"),
  join(frontend, "scripts"),
  join(frontend, "electron"),
  join(frontend, "ios/App/App"),
  join(repo, "appstore/metadata.json"),
  join(repo, "appstore/review-notes.txt"),
];
const files = roots.flatMap((r) => (existsSync(r) && statSync(r).isFile() ? [r] : walk(r)));
assert.ok(files.length > 200, "scanned the shipped sources");

const hits = [];
for (const file of files) {
  const rel = relative(repo, file).replaceAll("\\", "/");
  if (ALLOW.has(rel)) continue;
  readFileSync(file, "utf8").split("\n").forEach((line, i) => {
    if (BANNED.test(line)) hits.push(`${rel}:${i + 1}: ${line.trim().slice(0, 140)}`);
  });
}
assert.deepEqual(hits, [], `retired game feature words found:\n${hits.join("\n")}`);

for (const gone of [
  "src/components/lfg",
  "src/components/valorant",
  "src/api/lfg.js",
  "src/api/riot.js",
  "backend/routes/lfg.js",
  "backend/routes/riot.js",
  "backend/routes/valorant.js",
  "electron/riotRsoAuth.cjs",
  "electron/riotLocalAuth.cjs",
]) {
  assert.equal(existsSync(join(frontend, gone)), false, `${gone} must stay deleted`);
}

console.log(`noRetiredGameFeature.selftest.mjs: ok (${files.length} files)`);
