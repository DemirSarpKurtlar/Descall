#!/usr/bin/env node
// Post-build guard: every inline <script> in dist/**/*.html must be covered by a sha256 in the
// shipped CSP (dist/security-policy.js and dist/_headers), script-src must not allow
// 'unsafe-inline', and no HTML may use inline event handlers or javascript: URLs.
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, dirname, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { inlineScriptHashes } from "./csp-sync-lib.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = process.argv[2] ? resolve(process.argv[2]) : join(root, "dist");
if (!existsSync(join(dist, "security-policy.js"))) {
  console.log("csp-verify-dist: no dist/security-policy.js (Electron/other build), skipped");
  process.exit(0);
}
const { SITE_CSP, INLINE_SCRIPT_HASHES } = await import(pathToFileURL(join(dist, "security-policy.js")).href);
const allowed = new Set(INLINE_SCRIPT_HASHES);
const problems = [];
const scriptSrc = (SITE_CSP.match(/script-src[^;]*/) || [""])[0];
if (/'unsafe-inline'/.test(scriptSrc)) problems.push("script-src still contains 'unsafe-inline'");
const headers = existsSync(join(dist, "_headers")) ? readFileSync(join(dist, "_headers"), "utf8") : "";
if (!headers.includes(SITE_CSP)) problems.push("dist/_headers CSP differs from security-policy.js");

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (name.endsWith(".html")) out.push(p);
  }
  return out;
}
let pages = 0;
for (const file of walk(dist)) {
  pages++;
  const html = readFileSync(file, "utf8");
  const rel = relative(dist, file);
  for (const h of inlineScriptHashes(html)) if (!allowed.has(h)) problems.push(`${rel}: inline script ${h} is not in the CSP (run node scripts/csp-sync.mjs)`);
  const tagHandlers = html.match(/<[a-z][^>]*\son[a-z]+\s*=\s*["'][^"']*["'][^>]*>/gi) || [];
  for (const t of tagHandlers) problems.push(`${rel}: inline event handler blocked by CSP: ${t.slice(0, 120)}`);
  if (/href\s*=\s*["']\s*javascript:/i.test(html)) problems.push(`${rel}: javascript: URL blocked by CSP`);
}
if (problems.length) {
  console.error(`csp-verify-dist: ${problems.length} problem(s)\n` + problems.slice(0, 50).join("\n"));
  process.exit(1);
}
console.log(`csp-verify-dist: ${pages} HTML files, all inline scripts hashed, no 'unsafe-inline' in script-src`);
