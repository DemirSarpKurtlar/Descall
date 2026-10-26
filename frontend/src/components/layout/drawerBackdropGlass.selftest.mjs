// B2 black flash: on phone Liquid Glass (<=768px) the list "drawer" is a
// full-screen page, so the dimming drawer backdrop must not mount there. It
// faded a 55% black + blur layer over every chat open/back and, in WebKit,
// could stay stuck over the open conversation.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "AppLayout.jsx"), "utf8");
const at = src.indexOf('className="mobile-drawer-backdrop"');
assert.ok(at > 0, "backdrop still rendered by AppLayout");
const guard = src.slice(Math.max(0, at - 400), at);
assert.match(guard, /mobileDrawerOpen && !\(glassShell && drawerIsPage\)/, "glass full-screen list must not mount the drawer backdrop");
assert.match(src, /matchMedia\?\.\("\(max-width: 768px\)"\)/, "drawerIsPage follows the glass/shell.css full-screen breakpoint");
const shell = readFileSync(join(here, "../../styles/glass/shell.css"), "utf8");
assert.match(shell, /@media \(max-width: 768px\) \{\s*html\.glass-ui \.app-root\.g-shell \.app-sidebar-shell,/, "breakpoint in shell.css changed, update drawerIsPage");
console.log("drawerBackdropGlass.selftest ok");
