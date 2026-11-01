#!/usr/bin/env node
/**
 * Builds the 3D world engine bundle into dist/world3d/engine/ (after `vite build`).
 * Mobile builds set VITE_WORLD3D=0: this step then removes dist/world3d entirely
 * (engine and room / avatar assets), so nothing of the world ships in the iOS or
 * Android app. Usage: node scripts/build-world3d.mjs
 */
import { existsSync, rmSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "dist", "world3d");

function sizeOf(dir) {
  let total = 0;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    total += st.isDirectory() ? sizeOf(p) : st.size;
  }
  return total;
}

if (process.env.VITE_WORLD3D === "0") {
  if (existsSync(out)) rmSync(out, { recursive: true, force: true });
  console.log("[world3d] VITE_WORLD3D=0: no 3D world in this build (dist/world3d removed)");
  process.exit(0);
}

if (!existsSync(join(root, "dist", "index.html"))) {
  console.error("[world3d] run vite build first (dist/index.html missing)");
  process.exit(1);
}

await build({ configFile: join(root, "vite.world3d.config.js"), root });
const engineDir = join(out, "engine");
const kb = (sizeOf(engineDir) / 1024).toFixed(0);
const assets = (sizeOf(out) / 1024 / 1024).toFixed(2);
console.log(`[world3d] engine bundle ${kb} KB, dist/world3d total ${assets} MB`);
