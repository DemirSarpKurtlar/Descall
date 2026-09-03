/**
 * Run: node frontend/src/components/dimaai/DimaSettingsPanel.selftest.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const panel = readFileSync(join(root, "DimaSettingsPanel.jsx"), "utf8");
const css = readFileSync(join(root, "../../styles/dimaai.css"), "utf8");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(panel.includes("us-toggle"), "Dima settings must use the shared User Settings toggle");
assert(panel.includes("onBlur={(e) => onSave?.({ customInstructions: e.target.value })}"), "custom instructions must save the textarea value on blur");
assert(panel.includes("us-card"), "Dima settings must use the shared settings cards");
assert(panel.includes("us-section-label"), "Dima settings must use shared section labels");
assert(!/type=["']checkbox["']/.test(panel), "Dima settings must not use native checkboxes");
assert(
  /linear-gradient\(180deg,\s*rgba\(28,16,48/.test(css) === false
    || !/\.dima-settings-panel \{[\s\S]{0,280}linear-gradient\(180deg,\s*rgba\(28,16,48/.test(css),
  "settings sheet must not keep the old purple-only gradient",
);
assert(/\.dima-settings-panel \{[\s\S]{0,220}var\(--surface-1\)/.test(css), "settings sheet must use app surface tokens");
assert(panel.includes("createPortal"), "settings sheet must portal out of the Dima workspace so ChatGPT chrome cannot restyle it");
assert(/position:\s*fixed/.test(css) && /\.dima-settings-overlay \{[\s\S]{0,160}z-index:\s*100050/.test(css), "settings overlay must be a fixed high sheet, not an in-workspace layer");

console.log("DimaSettingsPanel.selftest.mjs: ok");
