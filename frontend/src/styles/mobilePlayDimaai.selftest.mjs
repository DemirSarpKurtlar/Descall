/**
 * Run: node frontend/src/styles/mobilePlayDimaai.selftest.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const root = dirname(fileURLToPath(import.meta.url));
const mobile = readFileSync(join(root, "mobile.css"), "utf8");
const layout = readFileSync(join(root, "app-layout.css"), "utf8");
const valorant = readFileSync(join(root, "valorant.css"), "utf8");
const lfg = readFileSync(join(root, "lfg.css"), "utf8");
function assert(c, m) { if (!c) throw new Error(m); }
assert(mobile.includes('grid-column: 1 / -1 !important'), "mobile play/dimaai main-slot must span column 1");
assert(mobile.includes('display: none !important') && mobile.includes('[data-view="play"] .nav-rail'), "mobile play hides nav-rail from grid");
assert(!/is-mobile\[data-view="play"\][\s\S]{0,200}grid-template-columns:\s*1fr\s*!important/.test(mobile) || mobile.includes("minmax(0, 1fr)"), "use minmax(0,1fr)");
assert(layout.includes('data-view="play"] > .app-main-slot'), "desktop still places main in col 2");
const playHub = mobile.split('[data-view="play"] .valorant-hub')[1] || "";
assert(!/padding-bottom:\s*calc\(56px/.test(playHub.slice(0, 500)), "hub outer must not pad for tab bar (causes black void)");
assert(mobile.includes("height: var(--vv-height, 100dvh) !important"), "play/dimaai root uses visual viewport height");
assert(mobile.includes("padding-bottom: 0 !important"), "outer/hub-panel padding zero for void");
assert(!/Scrollable companion[\s\S]{0,160}\.valorant-hub-panel,[\s\S]{0,120}\.valorant-companion/.test(mobile), "hub-panel must not share scroll padding with companion");
assert(mobile.includes("Never min-height:100dvh"), "must avoid min-height 100dvh fighting visualViewport");
assert(/min-height:\s*0\s*!important/.test(mobile), "play root min-height 0");
assert(mobile.includes("height: calc(60px + env(safe-area-inset-bottom, 0px))"), "bottom seal matches 60px tab bar");
assert(!/::after[\s\S]{0,120}height:\s*calc\(56px/.test(mobile), "seal must not use stale 56px height");
assert(mobile.includes(".valorant-companion.is-mobile-accordion") && mobile.includes("height: auto !important"), "companion accordion must not force height 100%");
assert(mobile.includes(".lfg-sidebar") && mobile.includes("flex-direction: column !important"), "LFG sidebar flex-fills on mobile play");
assert(valorant.includes("is-mobile-accordion"), "accordion styles present");
assert(!/is-mobile-accordion \{[\s\S]{0,120}height:\s*100%/.test(valorant), "accordion must not use height 100%");
assert(lfg.includes("minmax(0, 1fr)") || lfg.includes("flex: 1 1 0"), "LFG mobile workspace fills row");
assert(mobile.includes(".lfg-lobby-list") && mobile.includes("padding-bottom: calc(60px + env(safe-area-inset-bottom, 0px)) !important"), "LFG list keeps tab clearance");
console.log("mobilePlayDimaai.selftest.mjs: ok");
