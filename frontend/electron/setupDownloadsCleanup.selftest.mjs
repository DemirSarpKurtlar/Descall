/**
 * Unit selftest for Downloads Setup cleanup (no Electron runtime needed).
 * Run: node frontend/electron/setupDownloadsCleanup.selftest.mjs
 */
import { createRequire } from "node:module";
import { mkdtempSync, writeFileSync, existsSync, rmSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const require = createRequire(import.meta.url);
const {
  cleanOldDescallSetups,
  isDescallSetupDownloadUrl,
  filenameFromSetupUrl,
  versionFromSetupFilename,
  cmpSemver,
} = require("./setupDownloadsCleanup.cjs");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const dir = mkdtempSync(join(tmpdir(), "descall-setup-cleanup-"));
const fakeApp = { getPath: () => dir };

try {
  writeFileSync(join(dir, "Descall-Setup-2.9.28.exe"), "old");
  writeFileSync(join(dir, "Descall-Setup-2.9.29.exe"), "mid");
  writeFileSync(join(dir, "Descall-Setup-2.9.29.exe.blockmap"), "bm");
  writeFileSync(join(dir, "Descall-Setup-2.9.30.exe"), "new");
  writeFileSync(join(dir, "vacation-photos.zip"), "keep-me");
  writeFileSync(join(dir, "notes.txt"), "keep-me");

  const result = cleanOldDescallSetups({ app: fakeApp, keepVersion: "2.9.30", log: { info() {}, warn() {} } });
  assert(result.kept === "Descall-Setup-2.9.30.exe", `kept newest/current, got ${result.kept}`);
  assert(existsSync(join(dir, "Descall-Setup-2.9.30.exe")), "2.9.30 exe must remain");
  assert(!existsSync(join(dir, "Descall-Setup-2.9.28.exe")), "2.9.28 must be deleted");
  assert(!existsSync(join(dir, "Descall-Setup-2.9.29.exe")), "2.9.29 must be deleted");
  assert(!existsSync(join(dir, "Descall-Setup-2.9.29.exe.blockmap")), "old blockmap must be deleted");
  assert(existsSync(join(dir, "vacation-photos.zip")), "unrelated zip must remain");
  assert(existsSync(join(dir, "notes.txt")), "unrelated txt must remain");

  // Prefer matching keepVersion over newer file when keepVersion is older? 
  // keepVersion 2.9.29 with only 2.9.30 present → keep newest (2.9.30) since match missing
  writeFileSync(join(dir, "Descall-Setup-2.9.28.exe"), "old-again");
  const r2 = cleanOldDescallSetups({ app: fakeApp, keepVersion: "2.9.30", log: { info() {}, warn() {} } });
  assert(r2.kept === "Descall-Setup-2.9.30.exe", "still keep 2.9.30");
  assert(!existsSync(join(dir, "Descall-Setup-2.9.28.exe")), "re-added old must be deleted");

  assert(isDescallSetupDownloadUrl("https://github.com/DemirSarpKurtlar/Descall/releases/download/v2.9.30/Descall-Setup-2.9.30.exe"));
  assert(!isDescallSetupDownloadUrl("https://example.com/other.exe"));
  assert(filenameFromSetupUrl("https://github.com/x/y/Descall-Setup-2.9.30.exe") === "Descall-Setup-2.9.30.exe");
  assert(versionFromSetupFilename("Descall-Setup-2.9.30.exe") === "2.9.30");
  assert(cmpSemver("2.9.30", "2.9.29") > 0);

  const leftover = readdirSync(dir).filter((n) => n.startsWith("Descall-Setup-"));
  assert(leftover.length === 1 && leftover[0] === "Descall-Setup-2.9.30.exe", `leftover=${leftover}`);

  console.log("setupDownloadsCleanup.selftest: ok");
} finally {
  rmSync(dir, { recursive: true, force: true });
}
