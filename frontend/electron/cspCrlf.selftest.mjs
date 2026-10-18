// 2.11.11: the Windows build checked out CRLF, Electron hashed the raw bytes, Chromium hashes
// the parser-normalized (LF) text, so every inline <script> was blocked and the boot splash
// never went away. This guards every link of that chain.
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { inlineScriptHashes as webHashes } from "../scripts/csp-sync-lib.mjs";

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const front = join(here, "..");
const repo = join(front, "..");
const { inlineScriptHashes, buildElectronCsp, normalizeNewlines } = require("./cspPolicy.cjs");
const smoke = require("./bootSmoke.cjs");

const html = readFileSync(join(front, "index.html"), "utf8").replace(/\r\n?/g, "\n");
const crlf = html.replace(/\n/g, "\r\n");
const lf = inlineScriptHashes(html);
assert.ok(lf.length >= 5, "index.html has inline scripts");
assert.deepEqual(inlineScriptHashes(crlf), lf, "Electron hashes a CRLF index.html like Chromium (LF)");
assert.deepEqual(inlineScriptHashes(html.replace(/\n/g, "\r")), lf, "lone CR is LF too");
assert.deepEqual(webHashes(crlf), webHashes(html), "csp-sync hashes CRLF like LF");
assert.deepEqual(lf.map((h) => h.slice(1, -1)), webHashes(html), "Electron and website hash the same scripts");
assert.equal(normalizeNewlines("a\r\nb\rc\n"), "a\nb\nc\n");

// The shipped website policy lists exactly these hashes.
const policy = readFileSync(join(front, "public/security-policy.js"), "utf8");
for (const h of webHashes(html)) assert.ok(policy.includes(h), `security-policy.js has ${h}`);

// Directives the app needs (Google avatars, PostHog extensions, gtag after consent).
const csp = buildElectronCsp(crlf);
const dir = (name) => (csp.match(new RegExp(`${name}[^;]*`)) || [""])[0];
assert.ok(!/'unsafe-inline'/.test(dir("script-src")), "Electron script-src has no 'unsafe-inline'");
assert.ok(dir("img-src").includes("https://*.googleusercontent.com"), "Google profile pictures load");
assert.ok(dir("script-src").includes("https://eu-assets.i.posthog.com"), "PostHog extensions load");
assert.ok(dir("script-src").includes("https://www.googletagmanager.com"), "gtag.js (after consent) loads");
assert.ok(policy.includes("https://*.googleusercontent.com"), "website img-src allows Google avatars");
assert.ok(/script-src[^"]*eu-assets\.i\.posthog\.com/.test(policy.replace(/\n/g, " ")) || policy.includes("join(\" \")} https://eu-assets.i.posthog.com"), "website script-src allows PostHog extensions");

// LF everywhere, and the release build stops on a failing build step.
const attrs = readFileSync(join(repo, ".gitattributes"), "utf8");
assert.match(attrs, /^\* text=auto eol=lf$/m, ".gitattributes forces LF");
const release = readFileSync(join(repo, ".github/workflows/release.yml"), "utf8");
// The pwsh guards belong to the Windows job (web-gate runs bash; 2.11.11 put them there by mistake).
const winJob = release.slice(release.indexOf("\n  windows:"), release.indexOf("\n  publish:") > 0 ? release.indexOf("\n  publish:") : undefined);
const webGate = release.slice(release.indexOf("\n  web-gate:"), release.indexOf("\n  selftests:"));
assert.ok(winJob.length > 100 && webGate.length > 100, "release.yml has web-gate and windows jobs");
assert.match(winJob, /shell: pwsh[\s\S]*npm run build:prod\s*\n\s*if \(\$LASTEXITCODE -ne 0\)/, "Windows build checks the build:prod exit code");
assert.match(winJob, /git ls-files --eol index\.html/, "Windows build refuses a CRLF index.html");
assert.equal(/\$LASTEXITCODE|throw "/.test(webGate), false, "no PowerShell in the bash web-gate step");
assert.match(release, /--descall-smoke-boot/, "release boots the packaged app");
assert.match(release, /\$env:DESCALL_SMOKE = "boot"/, "boot smoke does not inherit DESCALL_SMOKE=1");
assert.match(release, /smoke-boot\.json[\s\S]*ConvertFrom-Json[\s\S]*-not \$result\.ok/, "boot smoke result must exist and be ok");
assert.match(release, /Wait-Installer \(Join-Path \$dest "Descall\.exe"\)\s*\n\s*if \(-not \(Test-Path/, "silent install is awaited");

// No script asset may be inlined as data: (blocked by script-src 'self').
const vite = readFileSync(join(front, "vite.config.js"), "utf8");
assert.match(vite, /assetsInlineLimit:\s*\(filePath\)\s*=>/, "vite never inlines .js assets");
const dist = join(front, "dist");
if (existsSync(join(dist, "assets"))) {
  for (const f of readdirSync(join(dist, "assets"))) {
    if (!f.endsWith(".js") || statSync(join(dist, "assets", f)).size > 5e6) continue;
    assert.ok(!readFileSync(join(dist, "assets", f), "utf8").includes("data:text/javascript;base64"), `dist/assets/${f} has no data: script`);
  }
}

// Protocol: SPA routes serve the app document (reload on /direct was -9 ERR_UNEXPECTED).
const main = readFileSync(join(here, "main.cjs"), "utf8");
assert.match(main, /if \(!path\.extname\(rel\)\) rel = '\/index\.html';/);
assert.match(main, /rescueStuckSplash/, "main removes a splash stuck over a painted app");
assert.match(main, /const smokeBoot = process\.argv\.includes\('--descall-smoke-boot'\)/, "--descall-smoke-boot wins over DESCALL_SMOKE=1");
assert.match(main, /const smokeLaunch = !smokeBoot &&/);

// Boot smoke verdicts.
const ok = { splashes: 0, inlineRan: true, rootPainted: true };
assert.equal(smoke.evaluateBootSmoke({ sample: ok, appMounted: true, elapsedMs: 3500 }).ok, true);
assert.equal(smoke.evaluateBootSmoke({ sample: ok, appMounted: true, elapsedMs: 1000 }).done, false, "settles first");
assert.equal(smoke.evaluateBootSmoke({ sample: ok, appMounted: false, elapsedMs: 3500 }).done, false, "waits for React");
assert.match(smoke.evaluateBootSmoke({ sample: ok, cspInlineBlocked: 2, appMounted: true, elapsedMs: 3500 }).reason, /blocked by CSP/);
assert.match(smoke.evaluateBootSmoke({ sample: { ...ok, inlineRan: false }, appMounted: true, elapsedMs: 3500 }).reason, /inline boot scripts/);
assert.match(smoke.evaluateBootSmoke({ sample: { ...ok, splashes: 1 }, appMounted: true, elapsedMs: 46000 }).reason, /splash still on screen/);
assert.equal(smoke.isInlineCspViolation("Executing inline script violates the following Content Security Policy directive"), true);
assert.equal(smoke.isInlineCspViolation("Loading the image 'x' violates the following Content Security Policy directive"), false);

console.log("cspCrlf selftest ok");
