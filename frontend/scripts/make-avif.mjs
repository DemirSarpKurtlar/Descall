#!/usr/bin/env node
// One-off / on-change AVIF copies of static marketing images in public/.
//
//   npm i --no-save --prefix /tmp/avif sharp@0.35.5          (sharp is not a frontend dependency)
//   SHARP_PATH=/tmp/avif/node_modules/sharp node scripts/make-avif.mjs          (re)write the .avif copies
//   node scripts/make-avif.mjs --check                                          no sharp needed: lists missing copies
//
// Each image in AVIF_SOURCE_DIRS gets <name>.avif next to it, kept only when it is at least
// 10% smaller. Components list the .avif first in <picture> (type="image/avif") and keep the
// original as the fallback, so browsers without AVIF (iOS 15, old WebViews) are unaffected.
// OG / social images, icons and the native boot splash stay PNG/JPEG on purpose: crawlers and
// launch screens do not take AVIF, and the splash ships inside the app (no download).
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = join(root, "public");

/** Directories (under public/) whose .webp / .png / .jpg files get an AVIF copy. */
export const AVIF_SOURCE_DIRS = ["brand/previews"];
/** Screenshots with UI text: full chroma (4:4:4) keeps coloured text edges crisp. */
export const AVIF_SETTINGS = { quality: 50, effort: 6, chromaSubsampling: "4:4:4" };
export const MIN_SAVING = 0.1;

export function avifPathFor(file) {
  return file.replace(/\.(webp|png|jpe?g)$/i, ".avif");
}

export function listSources(dir = publicDir) {
  const out = [];
  for (const sub of AVIF_SOURCE_DIRS) {
    const abs = join(dir, sub);
    if (!existsSync(abs)) continue;
    for (const name of readdirSync(abs).sort()) {
      if (/\.(webp|png|jpe?g)$/i.test(name)) out.push(join(abs, name));
    }
  }
  return out;
}

function loadSharp() {
  const require = createRequire(import.meta.url);
  const tries = [process.env.SHARP_PATH, "sharp"].filter(Boolean);
  for (const t of tries) {
    try {
      return require(t);
    } catch {
      /* next */
    }
  }
  return null;
}

async function main() {
  const check = process.argv.includes("--check");
  const sources = listSources();
  if (check) {
    const missing = sources.filter((f) => !existsSync(avifPathFor(f)));
    for (const f of missing) console.log(`missing: ${relative(root, avifPathFor(f))}`);
    console.log(`[make-avif] ${sources.length - missing.length}/${sources.length} AVIF copies present`);
    return;
  }
  const sharp = loadSharp();
  if (!sharp) {
    console.error("[make-avif] sharp not found: npm i --no-save --prefix /tmp/avif sharp@0.35.5 and set SHARP_PATH=/tmp/avif/node_modules/sharp");
    process.exit(1);
  }
  let before = 0;
  let after = 0;
  for (const file of sources) {
    const src = readFileSync(file);
    const out = await sharp(src).avif(AVIF_SETTINGS).toBuffer();
    const rel = relative(root, file);
    if (out.length > src.length * (1 - MIN_SAVING)) {
      console.log(`${rel}: AVIF not smaller (${src.length} -> ${out.length}), skipped`);
      continue;
    }
    writeFileSync(avifPathFor(file), out);
    before += src.length;
    after += out.length;
    console.log(`${rel}: ${src.length} -> ${out.length} bytes (-${Math.round((1 - out.length / src.length) * 100)}%)`);
  }
  if (before) console.log(`[make-avif] total ${before} -> ${after} bytes (-${Math.round((1 - after / before) * 100)}%)`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
