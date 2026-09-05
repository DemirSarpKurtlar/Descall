/**
 * Run: node frontend/src/styles/mobilePlayDimaai.selftest.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const root = dirname(fileURLToPath(import.meta.url));
const mobile = readFileSync(join(root, "mobile.css"), "utf8");
const layout = readFileSync(join(root, "app-layout.css"), "utf8");
function assert(c, m) { if (!c) throw new Error(m); }
assert(mobile.includes('grid-column: 1 / -1 !important'), "mobile play/dimaai main-slot must span column 1");
assert(mobile.includes('display: none !important') && mobile.includes('[data-view="play"] .nav-rail'), "mobile play hides nav-rail from grid");
assert(!/is-mobile\[data-view="play"\][\s\S]{0,200}grid-template-columns:\s*1fr\s*!important/.test(mobile) || mobile.includes("minmax(0, 1fr)"), "use minmax(0,1fr)");
assert(layout.includes('data-view="play"] > .app-main-slot'), "desktop still places main in col 2");
console.log("mobilePlayDimaai.selftest.mjs: ok");
