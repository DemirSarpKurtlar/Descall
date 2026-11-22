// Every CSP the app ships allows the hybrid server's PC node (src/config/nodeOrigins.js):
// web (public/security-policy.js -> _headers, vercel.json), Electron (electron/cspPolicy.cjs),
// Tauri (desktop/app/src-tauri/tauri.conf.json). Capacitor (iOS / Android) loads dist/index.html
// with no CSP meta; if one is ever added it has to allow the PC node as well.
// Run: node src/config/nodeOrigins.selftest.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PC_NODE_ORIGIN, PC_NODE_WS_ORIGIN, NODE_ORIGINS } from "./nodeOrigins.js";

const here = dirname(fileURLToPath(import.meta.url));
const front = join(here, "../..");
const repo = join(front, "..");
const require = createRequire(import.meta.url);

assert.equal(PC_NODE_ORIGIN, "https://pc.descall.com");
assert.equal(PC_NODE_WS_ORIGIN, PC_NODE_ORIGIN.replace(/^https:/, "wss:"));
assert.ok(NODE_ORIGINS.includes(PC_NODE_ORIGIN));

function directive(csp, name) {
  const m = new RegExp(`(?:^|;)\\s*${name}\\s+([^;]*)`).exec(csp);
  return m ? m[1].trim().split(/\s+/) : null;
}
function check(label, csp) {
  const connect = directive(csp, "connect-src");
  assert.ok(connect, `${label}: connect-src`);
  assert.ok(connect.includes(PC_NODE_ORIGIN), `${label}: connect-src allows ${PC_NODE_ORIGIN}`);
  assert.ok(connect.includes(PC_NODE_WS_ORIGIN), `${label}: connect-src allows ${PC_NODE_WS_ORIGIN}`);
  for (const d of ["img-src", "media-src"]) {
    const v = directive(csp, d);
    assert.ok(v && v.includes(PC_NODE_ORIGIN), `${label}: ${d} allows ${PC_NODE_ORIGIN}`);
  }
}

// Web: the policy module and the two files csp-sync.mjs writes from it.
const policy = await import(join(front, "public/security-policy.js"));
assert.equal(policy.PC_NODE_ORIGIN, PC_NODE_ORIGIN, "security-policy.js constant matches");
assert.equal(policy.PC_NODE_WS_ORIGIN, PC_NODE_WS_ORIGIN, "security-policy.js ws constant matches");
check("SITE_CSP", policy.SITE_CSP);
const headers = readFileSync(join(front, "public/_headers"), "utf8");
assert.ok(headers.includes(policy.SITE_CSP), "_headers carries SITE_CSP (run node scripts/csp-sync.mjs)");
const vercel = JSON.parse(readFileSync(join(front, "vercel.json"), "utf8"));
const vercelCsp = vercel.headers.flatMap((r) => r.headers || []).find((h) => h.key === "Content-Security-Policy");
check("vercel.json", vercelCsp.value);

// Electron: packaged and dev policies.
const { buildElectronCsp } = require(join(front, "electron/cspPolicy.cjs"));
check("Electron", buildElectronCsp("<script>1</script>"));
check("Electron (no index.html)", buildElectronCsp(null));
check("Electron dev", buildElectronCsp(null, { dev: true }));

// Tauri.
const tauri = JSON.parse(readFileSync(join(repo, "desktop/app/src-tauri/tauri.conf.json"), "utf8"));
const tcsp = tauri.app.security.csp;
check("Tauri", Object.entries(tcsp).map(([k, v]) => `${k} ${v}`).join("; "));

// Capacitor / iOS / Android: no CSP meta in index.html today.
const indexHtml = readFileSync(join(front, "index.html"), "utf8");
const meta = /<meta[^>]+http-equiv=["']Content-Security-Policy["'][^>]*content=["']([^"']+)["']/i.exec(indexHtml);
if (meta) check("index.html meta", meta[1]);

console.log("nodeOrigins.selftest: ok");
