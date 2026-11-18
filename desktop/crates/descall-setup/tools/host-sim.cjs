// Drives the UI exactly like the Rust engine does (same patch shapes as src/win/mod.rs and
// job.rs), with a fake window.ipc that records what the page sends back. Checks the wiring and
// screenshots the exe-mode window for each step.
// usage: node tools/host-sim.cjs <outDir>
const path = require("path");
const fs = require("fs");
let pw;
try { pw = require("playwright"); } catch { pw = require("/opt/node-tools/node_modules/playwright"); }
const UI = path.resolve(__dirname, "..", "ui", "index.html");
const OUT = path.resolve(process.argv[2] || "host-sim");
fs.mkdirSync(OUT, { recursive: true });
const MB = 1048576;

(async () => {
  const browser = await pw.chromium.launch();
  const page = await (await browser.newContext({ deviceScaleFactor: 2, viewport: { width: 900, height: 560 } })).newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.stack || e.message));
  await page.addInitScript(() => {
    window.__sent = [];
    window.ipc = { postMessage: (s) => window.__sent.push(JSON.parse(s)) };
  });
  await page.goto("file://" + UI);
  await page.evaluate(() => document.fonts.ready);
  const sent = () => page.evaluate(() => window.__sent.splice(0));
  const patch = (v) => page.evaluate((v) => window.__setup.patch(v), v);
  const log = (k, a, lv = "", rep = false) => page.evaluate((e) => window.__setup.log(e), { t: "16:42:07", k, a, lv, rep });
  const shot = async (n) => { await page.waitForTimeout(250); await (await page.$(".frame")).screenshot({ path: path.join(OUT, n + ".png"), omitBackground: true }); };
  const expect = (cond, msg) => { if (!cond) { console.error("FAIL", msg); process.exitCode = 1; } else console.log("ok  ", msg); };

  let s = await sent();
  expect(s.some((m) => m.cmd === "ready"), "page reports ready");

  // Engine::on_ready (Install mode)
  await patch({ lang: "en", version: "4.0.0", publisher: "Descall", logPath: "C:\\Users\\ada\\AppData\\Local\\Descall-Setup\\logs\\setup-1.log",
    dir: "C:\\Users\\ada\\AppData\\Local\\Programs\\Descall",
    sys: { os: "Windows 11", osOk: true, wvOk: true, diskOk: true }, opts: { autostart: true, desktop: true, autoUpdate: true }, existing: null });
  await patch({ dir: "C:\\Users\\ada\\AppData\\Local\\Programs\\Descall", drive: "C:", need: 92 * MB, free: 120e9, sys: { diskOk: true } });
  await patch({ screen: "welcome" });
  await patch({ version: "4.0.0", metrics: { download: 18.4 * MB }, upd: { v: "4.0.0", size: 18.4 * MB, notes: [] }, mig: { to: "4.0.0", days: 14 }, dl: { files: { done: 0, total: 346 } }, sys: { osOk: true } });
  await shot("01-welcome");
  expect(await page.textContent(".h1") === "Ready to install", "welcome in English");
  await page.click('[data-act="toggle"][data-arg="desktop"]');
  await page.click('[data-act="install"]');
  s = await sent();
  const inst = s.find((m) => m.cmd === "install");
  expect(inst && inst.opts.desktop === false && inst.opts.autostart === true && inst.lang === "en", "install sends the chosen options");

  // start_install -> fetch_payload (Web)
  await patch({ screen: "progress", dl: { phase: "connect" } });
  await shot("02-connect");
  await patch({ dl: { phase: "download", embedded: false, parts: 14, part: 1, got: 0, total: 18.4 * MB, server: { label: "Istanbul", ms: 18 }, files: { done: 0, total: 346 } } });
  await log("l_mirror", { host: "cdn-ist.descall.com", ms: 18 });
  await log("l_connected", { host: "cdn-ist.descall.com", tls: "TLS 1.3" });
  await log("l_manifest", { v: "4.0.0", n: 14, size: 18.4 * MB });
  for (let i = 1; i <= 8; i++) await log("l_part_ok", { i, n: 14, size: 1.3 * MB, secs: 0.4 });
  await log("l_part_dl", { i: 9, n: 14, got: 0.2 * MB, size: 1.3 * MB }, "", true);
  await log("l_part_dl", { i: 9, n: 14, got: 0.8 * MB, size: 1.3 * MB }, "", true);
  await patch({ dl: { phase: "download", paused: false, part: 9, got: 11.4 * MB, speed: 3.1 * MB, eta: 2.2 } });
  await shot("03-download");
  const lines = await page.$$eval(".log .ln", (l) => l.map((x) => x.textContent));
  expect(lines.filter((x) => x.includes("part 09/14 downloading")).length === 1, "live part line is replaced, not repeated");
  expect((await page.textContent(".pct")).replace(/\s/g, "") === "62%", "percent rounds like the draft (62)");
  await page.click('[data-act="pause"]');
  s = await sent();
  expect(s.some((m) => m.cmd === "pause"), "pause goes to the engine");
  await patch({ dl: { paused: true, speed: 0 } });
  await shot("04-paused");
  await page.click('[data-act="close"]');
  expect(!!(await page.waitForSelector(".confirm", { timeout: 2000 }).catch(() => null)), "closing mid-download asks first");
  await page.click('[data-act="cancel-no"]');
  await patch({ dl: { paused: false } });

  // network loss -> show_error(Net)
  await log("l_net_lost", { code: "NET-2EFD" }, "err");
  await log("l_saved", { n: 9, size: 11.4 * MB });
  await patch({ dl: { parts: 14, got: 11.4 * MB, total: 18.4 * MB } });
  await patch({ err: { kind: "net", code: "NET-2EFD", pct: 61, partsReady: 9, kept: 11.4 * MB, left: 7 * MB, diag: { net: false, proxy: false, sig: true }, retryIn: 8, attempt: 1 }, screen: "error" });
  await patch({ err: { retryIn: 7 } });
  await shot("05-error-net");
  expect((await page.textContent('[data-b="cd"]')).startsWith("7"), "retry countdown ticks");
  await page.click('[data-act="resume"]');
  s = await sent();
  expect(s.some((m) => m.cmd === "resume"), "resume from error");
  await page.click('[data-act="openlog"]');
  s = await sent();
  expect(s.some((m) => m.cmd === "openlog"), "log path link");

  // back_to_progress -> verify -> install -> done
  await patch({ screen: "progress", err: null });
  await patch({ dl: { phase: "verify", got: 18.4 * MB, part: 14, speed: 0, verify: 0.5 } });
  await shot("06-verify");
  await patch({ dl: { phase: "install", files: { done: 200, total: 346 } } });
  await shot("07-install");
  await patch({ screen: "done", done: { secs: 31, files: 346, autostart: true, desktop: "kept" } });
  await shot("08-done");
  await page.click('[data-act="launch"][data-arg="friends"]');
  s = await sent();
  expect(s.some((m) => m.cmd === "launch" && m.open === "friends"), "first-step tile launches Descall with a deep link");

  // Update toast, passive install
  await patch({ screen: "update", upd: { v: "4.0.1", phase: "installing", size: 2.4 * MB, secs: 4 }, dl: { phase: "download", got: 1.2 * MB, total: 2.4 * MB } });
  await page.waitForTimeout(200);
  s = await sent();
  expect(s.some((m) => m.cmd === "resize" && m.w === 452), "toast asks the host to resize the window");
  await shot("09-update-installing");

  // Migration rows as run_migration_rows sends them
  await patch({ screen: "migration", mig: { from: "3.9.3", to: "4.0.1", days: 14, installing: true, rows: { set: { st: "wait" }, ses: { st: "wait" }, sh: { st: "wait" }, cl: { st: "wait" } } } });
  await patch({ dl: { phase: "install", files: { done: 100, total: 346 } } });
  await shot("10-migration-installing");
  await patch({ mig: { installing: false, rows: { set: { st: "ok", n: 42 } } } });
  await patch({ mig: { rows: { ses: { st: "warn" } } } });
  await patch({ mig: { rows: { sh: { st: "ok", n: 18 } } } });
  await patch({ mig: { rows: { cl: { st: "run", done: 60 * MB, total: 184 * MB } } } });
  await shot("11-migration-relogin");
  await patch({ mig: { rows: { cl: { st: "ok" } }, finished: true, launchIn: 3 } });
  await shot("12-migration-finished");

  expect(errors.length === 0, "no page errors" + (errors.length ? ": " + errors.join("; ") : ""));
  await browser.close();
})();
