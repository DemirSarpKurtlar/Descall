// Bakım UI contract: heavy frosted glass (blur + opaque fill), mobile layout,
// typed İPTAL confirm, no fake status page, tab wired into the admin panel.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const css = read("./maintenance.css");
const tab = read("../components/admin/MaintenanceTab.jsx");
const ui = read("../components/maintenance/MaintenanceUi.jsx");
const gate = read("../components/maintenance/MaintenanceGate.jsx");
const panel = read("../components/admin/AdminPanel.jsx");
const app = read("../App.jsx");

const glass = /\.mt-glass\{([^}]*)\}/.exec(css)[1];
assert(/backdrop-filter:blur\(40px\)/.test(glass), "heavy blur");
const fill = /background:linear-gradient\(165deg,([^;]*)\)/.exec(glass)[1];
for (const a of fill.matchAll(/rgba\([^)]*,(\.\d+)\)/g)) assert(Number(a[1]) >= 0.9, "glass fill must stay ≥ .9 opaque: " + a[0]);
assert(!/background:\s*transparent;[^}]*backdrop/.test(css), "no transparent glass");
assert(/\.mt-banner\{[^}]*rgba\(74,56,30,\.95\)/.test(css), "banner keeps its opaque amber glass");
assert(/@media \(max-width:640px\)\{[\s\S]*\.mt-two\{grid-template-columns:1fr/.test(css), "date fields stack on phones");
assert(/@media \(max-width:640px\)\{[\s\S]*\.mt-in\{height:44px;font-size:16px/.test(css), "44pt touch fields, 16px text (no iOS zoom)");
assert(/@media \(max-width:900px\)\{\s*\.mt-grid\{grid-template-columns:1fr/.test(css), "single column below 900px");
assert(/toLocaleUpperCase\("tr-TR"\) !== "İPTAL"/.test(tab), "cancel button waits for İPTAL");
assert(/maint\.cancelReason/.test(tab), "optional reason field");
assert(/s\.nextStartsAt \?/.test(tab) && /s\.monthDowntimeMs \?/.test(tab) && /s\.recentlyActiveUsers \?/.test(tab), "cards only with data");
for (const src of [tab, ui, gate]) assert(!/status\.descall/i.test(src), "no fake status page");
assert(/<MaintenanceTab socket=\{socket\} \/>/.test(panel), "tab mounted");
assert(/<MaintenanceGate socket=\{socketApi\}/.test(app), "user gate mounted in App");
assert(/maintenance:state/.test(gate) && /maintenance:ended/.test(gate), "realtime via socket");
console.log("maintenance UI selftest: ok");
