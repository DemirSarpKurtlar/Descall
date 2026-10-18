#!/usr/bin/env node
// Recomputes the sha256 of every inline <script> in index.html and writes them into
// public/security-policy.js (INLINE_SCRIPT_HASHES), then copies the resulting CSP into
// public/_headers and vercel.json.  `--check` only reports drift (exit 1).
import { readFileSync, writeFileSync } from "node:fs";
import { inlineScriptHashes } from "./csp-sync-lib.mjs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const check = process.argv.includes("--check");

const hashes = inlineScriptHashes(readFileSync(join(root, "index.html"), "utf8"));
const policyPath = join(root, "public/security-policy.js");
let policy = readFileSync(policyPath, "utf8");
const block = /( *\/\/ @csp-hashes-start\n)[\s\S]*?( *\/\/ @csp-hashes-end)/;
const nextPolicy = policy.replace(block, (_, a, b) => a + hashes.map((h) => `  "${h}",\n`).join("") + b);
let drift = nextPolicy !== policy;
if (!check) writeFileSync(policyPath, nextPolicy);

const mod = await import(pathToFileURL(policyPath).href + `?t=${Date.now()}`);
const csp = check ? null : mod.SITE_CSP;
if (!check) {
  const headersPath = join(root, "public/_headers");
  const headers = readFileSync(headersPath, "utf8").replace(/^(\s*Content-Security-Policy: ).*$/m, (_, p) => p + csp);
  writeFileSync(headersPath, headers);
  const vercelPath = join(root, "vercel.json");
  const vercel = JSON.parse(readFileSync(vercelPath, "utf8"));
  for (const rule of vercel.headers || []) {
    for (const h of rule.headers || []) if (h.key === "Content-Security-Policy" && rule.source === "/(.*)") h.value = csp;
  }
  writeFileSync(vercelPath, JSON.stringify(vercel, null, 2) + "\n");
  console.log(`csp-sync: ${hashes.length} inline script hashes written to security-policy.js, _headers, vercel.json`);
} else if (drift) {
  console.error("csp-sync --check: INLINE_SCRIPT_HASHES is out of date. Run: node scripts/csp-sync.mjs");
  process.exit(1);
} else {
  console.log(`csp-sync --check: ${hashes.length} hashes up to date`);
}
