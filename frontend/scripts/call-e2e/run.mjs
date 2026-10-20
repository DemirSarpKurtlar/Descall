// WebKit two-client DM call e2e on the iOS ICE path (TURN-only relay mode).
// node scripts/call-e2e/run.mjs [--runs=20] [--mode=fixed|old] [--relay=1]
// Needs: playwright webkit + node-turn (NODE_PATH or local install).
import http from "node:http";
import { createRequire } from "node:module";
import { build } from "esbuild";

const require = createRequire(import.meta.url);
const Turn = require("node-turn");
const { webkit } = require("playwright");
const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || "").split("=")[1] || d;
const RUNS = Number(arg("runs", 20)); const MODE = arg("mode", "fixed"); const RELAY = arg("relay", "1") === "1";
// ice-config latency of the 2nd (refresh) fetch, as on cellular / a cold backend.
const LATENCY = Number(arg("latency", 1500));

const turn = new Turn({ authMech: "long-term", credentials: { e2e: "secret" }, listeningIps: ["127.0.0.1"], relayIps: ["127.0.0.1"], listeningPort: 3478, debugLevel: "OFF" });
turn.start();
const out = await build({ entryPoints: [new URL("./entry.js", import.meta.url).pathname], bundle: true, write: false, format: "iife", define: { "import.meta.env": "{}" }, logLevel: "error" });
const js = out.outputFiles[0].text;
let fetches = 0;
const srv = http.createServer((req, res) => {
  if (req.url.startsWith("/api/webrtc/ice-config")) {
    fetches++;
    const authed = /^Bearer /.test(req.headers.authorization || "");
    // First fetch per page: valid TURN but already expired (resumed phone).
    const expired = fetches % 2 === 1;
    const body = authed
      ? { iceServers: [{ urls: "turn:127.0.0.1:3478?transport=udp", username: "e2e", credential: "secret" }], authenticated: true, ttlSeconds: 3600, expiresAt: new Date(Date.now() + (expired ? -1000 : 3600e3)).toISOString() }
      : { iceServers: [], authenticated: false };
    const delay = expired ? 0 : LATENCY;
    return setTimeout(() => { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(body)); }, delay);
  }
  if (req.url === "/b.js") { res.writeHead(200, { "content-type": "text/javascript" }); return res.end(js); }
  res.writeHead(200, { "content-type": "text/html" }); res.end('<!doctype html><script src="/b.js"></script>');
}).listen(0);
const origin = `http://127.0.0.1:${srv.address().port}`;
const browser = await webkit.launch();
const results = [];
for (let i = 0; i < RUNS; i++) {
  const ctx = await browser.newContext({ userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148" });
  await ctx.addInitScript((relay) => { localStorage.setItem("descall_token", "jwt-e2e"); if (relay) localStorage.setItem("descall:ice-relay", "1"); }, RELAY);
  const [a, b] = [await ctx.newPage(), await ctx.newPage()];
  await Promise.all([a.goto(origin), b.goto(origin)]);
  const pa = a.evaluate((m) => window.runPeer({ role: "caller", mode: m }), MODE);
  await a.waitForTimeout(300);
  const pb = b.evaluate((m) => window.runPeer({ role: "callee", mode: m }), MODE);
  const [ra, rb] = await Promise.all([pa, pb]);
  const ok = ra.ok && rb.ok;
  results.push(ok);
  console.log(`run ${i + 1}: ${ok ? "PASS" : "FAIL"} caller=${JSON.stringify(ra)} callee=${JSON.stringify(rb)}`);
  await ctx.close();
}
const pass = results.filter(Boolean).length;
console.log(`RESULT mode=${MODE} relay=${RELAY} ${pass}/${RUNS}`);
await browser.close(); srv.close(); turn.stop();
process.exit(pass === RUNS ? 0 : 1);
