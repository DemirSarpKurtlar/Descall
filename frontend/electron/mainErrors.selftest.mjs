/**
 * Main-process errors are logged and forwarded without paths or user names.
 * Run: node frontend/electron/mainErrors.selftest.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { scrubPaths, summarizeError, createErrorRelay } = require("./mainErrors.cjs");
const here = dirname(fileURLToPath(import.meta.url));
let failures = 0;
const assert = (c, m) => { if (!c) { failures += 1; console.error(`FAIL ${m}`); } };

assert(!scrubPaths("at x (C:\\Users\\demir\\AppData\\Local\\Programs\\Descall\\resources\\app.asar\\electron\\main.cjs:12:3)").includes("demir"), "Windows user path scrubbed");
assert(!scrubPaths("ENOENT: /home/ayse/.config/Descall/x.json").includes("ayse"), "Linux home scrubbed");
assert(!scrubPaths("/Users/mert/Library/x").includes("mert"), "macOS home scrubbed");
const s = summarizeError(new TypeError("boom at C:\\Users\\demir\\x.txt"), "uncaughtException");
assert(s.name === "TypeError" && s.kind === "uncaughtException" && !s.message.includes("demir"), "summary");
assert(summarizeError("plain").message === "plain" && summarizeError(undefined).message === "null", "non-Error values");
assert(summarizeError(new Error("x".repeat(900))).message.length === 300, "message capped");

const relay = createErrorRelay({ max: 2 });
relay.push({ n: 1 }); relay.push({ n: 2 }); relay.push({ n: 3 });
assert(relay.size() === 2, "queue capped");
const got = [];
relay.attach((x) => { got.push(x.n); return true; });
assert(got.join() === "2,3" && relay.size() === 0, "flushed in order once attached");

const main = readFileSync(join(here, "main.cjs"), "utf8");
for (const hook of ["process.on('uncaughtException'", "process.on('unhandledRejection'", "app.on('child-process-gone'", "'unresponsive'"]) {
  assert(main.includes(hook), `main installs ${hook}`);
}
const preload = readFileSync(join(here, "preload.cjs"), "utf8");
assert(preload.includes("onMainError"), "preload exposes onMainError");

if (failures) { console.error(`mainErrors.selftest: ${failures} failure(s)`); process.exit(1); }
console.log("mainErrors.selftest: ok");
