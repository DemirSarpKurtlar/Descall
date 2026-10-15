import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(here, "conv-rows.css"), "utf8");
const styles = readFileSync(join(here, "../styles.css"), "utf8");
const sidebar = readFileSync(join(here, "../components/layout/ServerSidebar.jsx"), "utf8");

assert.match(
  styles,
  /@import '\.\/styles\/activity-card\.css';\s*@import '\.\/styles\/conv-rows\.css';/
);
assert.match(css, /button\.dm-item,\s*button\.group-item/);
assert.match(css, /text-align:\s*start/);
assert.match(css, /\.conv-group-wrap\.is-desktop > \.conv-more-btn/);
assert.match(css, /position:\s*relative/);
assert.match(css, /transform:\s*none/);
assert.match(css, /align-self:\s*center/);
assert.doesNotMatch(sidebar, /paddingRight: !isMobile \? 40/);
assert.equal(css.includes("html.glass-ui"), false);

const layout = readFileSync(join(here, "app-layout.css"), "utf8");
const desktopChat = readFileSync(join(here, "glass-desktop/chat.css"), "utf8");
assert.match(
  layout,
  /\.conv-row-top \.dm-name,\s*\.conv-row-top \.group-name\s*\{[^}]*white-space:\s*nowrap;[^}]*overflow-wrap:\s*normal/
);
assert.doesNotMatch(layout, /DM list: show the full name/);
assert.match(
  desktopChat,
  /html\.glass-desktop \.conv-row-top \.dm-name,\s*html\.glass-desktop \.conv-row-top \.group-name\s*\{[^}]*min-width:\s*0;[^}]*text-overflow:\s*ellipsis;[^}]*white-space:\s*nowrap/
);

console.log("conv-rows.selftest ok");
