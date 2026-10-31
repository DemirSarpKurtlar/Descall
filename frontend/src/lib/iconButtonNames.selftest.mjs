/**
 * Run: node frontend/src/lib/iconButtonNames.selftest.mjs
 * Icon-only buttons need an accessible name. Visible text, a child *Content
 * row, aria-label, or aria-labelledby all count. title= alone does not.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { scanSource, walkJsxFiles } from "./iconButtonNames.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const files = walkJsxFiles(root);
const gaps = [];

for (const file of files) {
  const src = readFileSync(file, "utf8");
  const { titled, unlabeled } = scanSource(src);
  for (const item of titled) {
    gaps.push(`${file}:${item.line} has title but no aria-label`);
  }
  for (const item of unlabeled) {
    const preview = (item.body || item.open).replace(/\s+/g, " ").trim().slice(0, 70);
    gaps.push(`${file}:${item.line} unlabeled icon button (${preview})`);
  }
}

if (gaps.length) {
  console.error(gaps.slice(0, 40).join("\n"));
  console.error(`iconButtonNames: ${gaps.length} unlabeled icon button(s)`);
  process.exit(1);
}

const call = readFileSync(join(root, "components/CallOverlay.jsx"), "utf8");
// 2.11.1 moved the minimized end-call button into the mini call card.
const miniCard = readFileSync(join(root, "components/call/MiniCallCard.jsx"), "utf8");
if (!call.includes('aria-label={t("End Call")}') && !miniCard.includes('aria-label={t("End Call")}')) {
  console.error("CallOverlay end-call button must be named");
  process.exit(1);
}
if (call.includes("t(\"Raise hand\")") || call.includes("t(\"Lower hand\")")) {
  console.error("CallOverlay must not offer a raise-hand control");
  process.exit(1);
}

console.log("iconButtonNames.selftest.mjs: ok");
