/**
 * Run: node frontend/src/components/layout/NavigationRail.tooltip.selftest.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const rail = readFileSync(join(root, "NavigationRail.jsx"), "utf8");
const css = readFileSync(join(root, "../../styles/app-layout.css"), "utf8");

assert(/function canUseHoverTooltips/.test(rail), "rail tooltips must gate on hover capability");
assert(
  /\(hover: hover\) and \(pointer: fine\)/.test(rail),
  "rail tooltips must require a real hover pointer, not iOS tap-hover",
);
assert(/event\.currentTarget\.blur\(\)/.test(rail), "clicking a rail item must blur so focus does not keep the tooltip");
assert(/hideTip\(\);\s*\n\s*event\.currentTarget\.blur/.test(rail), "click must dismiss the tooltip before navigating");
assert(
  /useEffect\(\(\) => \{\s*\n\s*hideTip\(\);\s*\n\s*\}, \[active, dismissToken\]\)/.test(rail),
  "changing view (play/dimaai) must dismiss any open rail tooltip",
);
assert(/dismissToken=\{activeView\}/.test(rail), "rail buttons must receive activeView as a dismiss token");
assert(
  /onFocus=\{showTip\}/.test(rail) === false,
  "focus must not always show the tooltip (mobile tap focuses the rail button)",
);
assert(
  /@media \(hover: none\) \{[\s\S]{0,80}\.rail-tooltip \{[\s\S]{0,60}display:\s*none\s*!important/.test(css),
  "touch devices must hide portaled rail tooltips in CSS as a fallback",
);

console.log("NavigationRail.tooltip.selftest.mjs: ok");

const polish = readFileSync(join(root, "../../styles/ui-polish.css"), "utf8");
const settings = readFileSync(join(root, "../../styles/settings.css"), "utf8");
assert(rail.includes("status-picker-actions"), "status picker must render a dedicated actions row");
assert(rail.includes('t("Save")') && rail.includes('t("Cancel")'), "Save and Cancel must be separate labeled buttons");
assert(!/\{t\("Save"\)\}\s*\{t\("Cancel"\)\}/.test(rail), "Save and Cancel must not share one text node");
assert(/\.status-picker-actions \{[\s\S]{0,80}display:\s*flex/.test(polish), "status picker actions need display:flex");
assert(/\.status-picker-actions \{[\s\S]{0,120}gap:\s*8px/.test(polish), "status picker actions need gap");
assert(/\.us-status-edit-row \{[\s\S]{0,80}display:\s*flex/.test(settings), "profile custom status row must be flex");
assert(/\.us-sticky-actions \{[\s\S]{0,160}display:\s*flex/.test(settings), "profile Save/Cancel row must be flex");
