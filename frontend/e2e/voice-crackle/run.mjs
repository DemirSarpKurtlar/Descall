// node e2e/voice-crackle/run.mjs [label]  — local only. Needs `playwright` resolvable
// (PLAYWRIGHT_MODULE=/path/to/node_modules/playwright) with firefox + chromium installed.
import { createServer } from "vite";
import { fileURLToPath } from "node:url";
import path from "node:path";
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const pw = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const server = await createServer({ root, configFile: false, cacheDir: "/tmp/vite-crackle-cache", logLevel: "error", server: { port: 5199, strictPort: false } });
await server.listen();
const url = `http://localhost:${server.config.server.port}/e2e/voice-crackle/harness.html`;
const out = [];
import { spawn } from "node:child_process";
import os from "node:os";
const hogs = [];
for (let i = 0; i < Number(process.env.STRESS || 0) * os.cpus().length; i++) hogs.push(spawn(process.execPath, ["-e", "for(;;){}"], { stdio: "ignore" }));
process.on("exit", () => hogs.forEach((h) => h.kill()));
const browsers = (process.env.BROWSERS || "firefox,chromium").split(",");
const levels = (process.env.LEVELS || "-54,-20").split(",").map(Number);
for (const name of browsers) {
  const browser = await pw[name].launch({ headless: true, args: name === "chromium" ? ["--autoplay-policy=no-user-gesture-required"] : [], firefoxUserPrefs: { "media.autoplay.default": 0, "media.navigator.permission.disabled": true, "media.peerconnection.ice.loopback": true, "media.peerconnection.ice.obfuscate_host_addresses": false, "media.peerconnection.ice.no_host": false, "media.peerconnection.ice.proxy_only": false, "media.peerconnection.ice.default_address_only": false, "media.peerconnection.ice.relay_only": false, "network.proxy.type": 0, "media.peerconnection.mtransport_process": false, "network.process.enabled": false } });
  const modes = (process.env.MODES || "speech").split(",");
  for (const mode of modes) for (const ns of (process.env.NS || "on,off").split(",")) for (const dbfs of (mode === "noise" ? [-52] : levels)) {
    const page = await browser.newPage();
    page.on("console", (m) => { if (process.env.VERBOSE) console.log(`[${name}] ${m.text()}`); });
    await page.goto(`${url}?mode=${mode}&ns=${ns}&dbfs=${dbfs}&seconds=${process.env.SECONDS || 10}${process.env.FORCE_FALLBACK ? `&forceFallbackAt=${process.env.FORCE_FALLBACK}` : ""}`);
    await page.waitForFunction(() => window.__ready, null, { timeout: 60000 });
    await page.click('#go');
    const r = await page.evaluate(() => window.__result);
    out.push({ browser: name, ...r });
    await page.close();
  }
  await browser.close();
}
await server.close();
hogs.forEach((h) => h.kill());
for (const r of out) {
  const { gumCalls, diag, ...rest } = r;
  console.log(JSON.stringify({ ...rest, diag, gumNS: gumCalls.map((c) => c?.noiseSuppression) }));
}
