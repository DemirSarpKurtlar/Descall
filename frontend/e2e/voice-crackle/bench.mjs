import { createServer } from "vite";
import { fileURLToPath } from "node:url";
import path from "node:path";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const pw = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const server = await createServer({ root, configFile: false, cacheDir: "/tmp/vite-crackle-cache", logLevel: "error", server: { port: 5198 } });
await server.listen();
for (const name of ["firefox", "chromium"]) {
  const b = await pw[name].launch({ headless: true });
  const p = await b.newPage();
  await p.goto(`http://localhost:${server.config.server.port}/e2e/voice-crackle/bench.html`);
  await p.waitForFunction(() => window.__ready, null, { timeout: 60000 });
  console.log(name, "ms CPU per 1 s audio:", JSON.stringify(await p.evaluate(() => window.__bench(20))));
  await b.close();
}
await server.close();
