/**
 * Run: node frontend/src/components/valorant/ValorantHub.selftest.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const hub = readFileSync(join(root, "ValorantHub.jsx"), "utf8");
const layout = readFileSync(join(root, "../layout/AppLayout.jsx"), "utf8");
const css = readFileSync(join(root, "../../styles/valorant.css"), "utf8");
const appCss = readFileSync(join(root, "../../styles/app-layout.css"), "utf8");
const mobileCss = readFileSync(join(root, "../../styles/mobile.css"), "utf8");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(hub.includes('import LfgWorkspace from "../lfg/LfgWorkspace"'), "hub must mount existing LFG");
assert(hub.includes("<LfgWorkspace"), "hub must render LfgWorkspace");
assert(!hub.includes("onClose={onClose}"), "hub must own Back — do not pass onClose into LFG");
assert(hub.includes('useState("lfg")'), "default tab must be LFG for Adım 1 regression");
assert(hub.includes('role="tablist"'), "hub tabs must be accessible");
assert(hub.includes("CompanionPlaceholder") || hub.includes("companionSoon"), "companion placeholder required");
assert(layout.includes("<ValorantHub"), "AppLayout Play slot mounts ValorantHub");
assert(!/activeView === "play" \? \([\s\S]{0,40}<LfgWorkspace/.test(layout), "LFG must not mount bare from AppLayout");
assert(css.includes(".valorant-hub"), "valorant hub styles exist");
assert(css.includes(".valorant-hub-tab"), "tab styles exist");
assert(/\[data-view="play"\]\s*\.valorant-hub/.test(appCss), "play overlay targets valorant-hub");
assert(/:not\(\[data-view="play"\]\)\s*\.valorant-hub/.test(appCss), "leftover hide for valorant-hub");
assert(/@media \(max-width: 768px\)/.test(css) && css.includes(".valorant-hub-tabs"), "valorant hub has mobile tab layout");
assert(mobileCss.includes('[data-view="play"] .valorant-hub'), "mobile play view sizes valorant-hub");

console.log("ValorantHub.selftest.mjs: ok");
