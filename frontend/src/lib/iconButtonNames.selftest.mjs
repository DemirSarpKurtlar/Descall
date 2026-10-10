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
if (!call.includes('aria-label={t("End Call")}')) {
  console.error("CallOverlay end-call button must be named");
  process.exit(1);
}
if (!call.includes("aria-label={handRaised ? t(\"Lower hand\") : t(\"Raise hand\")}")) {
  console.error("CallOverlay hand button must copy its title onto aria-label");
  process.exit(1);
}

const toggles = readFileSync(join(root, "components/profile/ProfileCustomizationPanel.jsx"), "utf8");
if (toggles.includes("aria-pressed={customization.notifications}") || toggles.includes("aria-pressed={customization.privacy}")) {
  console.error("toggle aria-pressed must be the boolean field, not the settings object");
  process.exit(1);
}

console.log("iconButtonNames.selftest.mjs: ok");
