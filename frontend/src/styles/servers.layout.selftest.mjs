import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
function assert(c, m) { if (!c) throw new Error(m); }
const appLayout = readFileSync(join(root, "app-layout.css"), "utf8");
const servers = readFileSync(join(root, "servers.css"), "utf8");
const stylesIndex = readFileSync(join(root, "../styles.css"), "utf8");
const fourCol = /\.app-root\[data-view="servers"\]\s*\{[\s\S]*?grid-template-columns:\s*var\(--nav-rail-width\)\s+72px\s+var\(--sidebar-width\)\s+minmax\(0,\s*1fr\)/;
assert(fourCol.test(appLayout), "app-layout servers view must be 4 columns with minmax(0,1fr) main");
assert(fourCol.test(servers), "servers.css must keep the same 4-column grid");
assert(!/\.app-root\[data-view="servers"\]\s*\{[\s\S]*?grid-template-columns:\s*var\(--nav-rail-width\)\s+var\(--sidebar-width\)\s+1fr/.test(servers), "old 3-column override must be gone");
assert(/@import '\.\/styles\/app-layout\.css';[\s\S]*@import '\.\/styles\/servers\.css';/.test(stylesIndex), "servers.css loads after app-layout.css");
console.log("servers.layout.selftest: ok");
