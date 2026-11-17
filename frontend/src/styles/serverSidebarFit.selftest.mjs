// Polish pass (Nov 2026): server sidebar layout guards.
//  - owner report: the last channel row was cut at the panel's rounded bottom in the
//    Electron app (hidden icon picker became a 22px flex row + forced height:100%);
//  - category actions were invisible but tappable on touch (cascade order);
//  - role editor checkboxes stretched into bars (.server-check span rule).
// Run: node src/styles/serverSidebarFit.selftest.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const servers = readFileSync(join(here, "servers.css"), "utf8");
const checkbox = readFileSync(join(here, "checkbox.css"), "utf8");
const glassSocial = readFileSync(join(here, "glass", "social.css"), "utf8");
const sidebar = readFileSync(join(here, "..", "components", "servers", "ServersSidebar.jsx"), "utf8");

const block = (css, selector) => {
  const at = css.indexOf(selector);
  assert.ok(at >= 0, `missing rule ${selector}`);
  return css.slice(at, css.indexOf("}", at) + 1);
};

// Hidden file pickers are out of flow even against `html.glass-desktop .sidebar-secondary > *`.
const hidden = block(servers, "input.server-hidden-file,\nhtml.glass-desktop .sidebar-secondary > input.server-hidden-file {");
assert.match(hidden, /position: absolute !important;/);
assert.match(hidden, /height: 1px;/);

// The list column flexes instead of claiming 100% (Electron forces height:100% !important).
const electron = block(servers, "body.electron-app .servers-sidebar > .sidebar-inner {");
assert.match(electron, /height: auto !important;/);
assert.match(electron, /flex: 1 1 0 !important;/);
assert.match(electron, /min-height: 0 !important;/);

// Room under the last row and for keyboard scrolling.
const scroll = block(servers, ".servers-sidebar .server-channels-scroll {");
assert.match(scroll, /min-height: 0;/);
assert.match(scroll, /scroll-padding-bottom: 28px;/);
assert.match(servers, /html\.glass-desktop \.servers-sidebar \.server-channels-scroll \{[\s\S]*?padding-bottom: calc\(20px \+ var\(--gd-r-panel, 20px\) \/ 2\);/);

// The "open a channel" hint only shows when nothing is open (it sat under the list for good).
assert.match(sidebar, /channelListReady && !activeChannel && !serverVoice\?\.activeChannelId \? \(\s*<p className="server-step-hint">/);

// Category actions: hidden ones take no clicks, and the touch rule comes after the default.
const catDefault = servers.indexOf(".server-channel-cat-actions {\n  display: flex;");
assert.ok(catDefault >= 0);
assert.match(block(servers, ".server-channel-cat-actions {\n  display: flex;"), /pointer-events: none;/);
const touchRule = servers.indexOf("@media (hover: none) {\n  .server-channel-cat-actions {", catDefault);
assert.ok(touchRule > catDefault, "the (hover: none) reveal must come after the hidden default");
assert.match(servers, /\.server-channel-cat-btn > svg \{\s*flex: 0 0 auto;/);
assert.match(glassSocial, /\.g-server-pane \.server-channel-cat-actions \{\s*display: none;/);

// Role editor toggles keep the 22px checkbox face.
assert.match(checkbox, /\.server-check > \.dc-check,\n\.server-check \.dc-check-box \{\s*flex: 0 0 22px;/);

console.log("serverSidebarFit selftest ok");
