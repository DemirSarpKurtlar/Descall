import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
function assert(c, m) { if (!c) throw new Error(m); }
const appLayout = readFileSync(join(root, "app-layout.css"), "utf8");
const servers = readFileSync(join(root, "servers.css"), "utf8");
const mobile = readFileSync(join(root, "mobile.css"), "utf8");
const stylesIndex = readFileSync(join(root, "../styles.css"), "utf8");

const threeCol = /\.app-root\[data-view="servers"\]\s*\{[\s\S]*?grid-template-columns:\s*var\(--nav-rail-width\)\s+var\(--sidebar-width\)\s+minmax\(0,\s*1fr\)/;
assert(threeCol.test(appLayout), "app-layout servers view must be rail | sidebar | minmax(0,1fr) — no empty 72px icon track");
assert(threeCol.test(servers), "servers.css must keep the same 3-column grid with minmax(0,1fr)");
assert(threeCol.test(mobile), "tablet mobile.css servers view must not reserve an empty 72px column");
assert(
  !/\.app-root\[data-view="servers"\][\s\S]{0,220}grid-template-columns:\s*var\(--nav-rail-width\)\s+72px/.test(appLayout + servers + mobile),
  "no servers view may reserve an empty 72px server-icon column",
);
assert(
  !/\.app-root\[data-view="servers"\][\s\S]{0,160}grid-column:\s*3/.test(appLayout),
  "servers sidebar must stay on column 2 (not pushed to track 3 for a missing icon rail)",
);
assert(/@import '\.\/styles\/app-layout\.css';[\s\S]*@import '\.\/styles\/servers\.css';/.test(stylesIndex), "servers.css loads after app-layout.css");
console.log("servers.layout.selftest: ok");
