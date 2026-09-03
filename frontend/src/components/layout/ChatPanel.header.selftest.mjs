/**
 * Run: node frontend/src/components/layout/ChatPanel.header.selftest.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const stylesRoot = join(root, "../../styles");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const chatPanel = readFileSync(join(root, "ChatPanel.jsx"), "utf8");
const appLayout = readFileSync(join(root, "AppLayout.jsx"), "utf8");
const css = readFileSync(join(stylesRoot, "app-layout.css"), "utf8");

const headerRight = chatPanel.split('className="header-right"')[1]?.split("</header>")[0] || "";

assert(headerRight.length > 0, "ChatPanel must have a header-right actions row");
assert(!/title=\{t\("Settings"\)\}/.test(headerRight), "chat header must not include a Settings gear");
assert(!/<Settings\b/.test(headerRight), "chat header must not render a Settings icon");
assert(!/\bonSettings\b/.test(chatPanel), "ChatPanel must not take an onSettings prop");
assert(!/onSettings=\{openUserPanel\}/.test(appLayout), "AppLayout must not pass settings into ChatPanel");
assert(/<Search\b/.test(headerRight), "chat header must keep Search");
assert(/<Users\b/.test(headerRight), "chat header must keep Members");
assert(/<Pin\b/.test(headerRight), "chat header must keep Pinned messages");
assert(/<Phone\b/.test(headerRight), "chat header must keep Voice Call");
assert(/aria-label=\{t\("Search"\)\}/.test(headerRight), "Search needs an accessible name");
assert(/aria-label=\{t\("Members"\)\}/.test(headerRight), "Members needs an accessible name");
assert(/aria-label=\{t\("Voice Call"\)\}/.test(headerRight), "Voice Call needs an accessible name");
assert(/aria-label=\{t\("Video Call"\)\}/.test(headerRight), "Video Call needs an accessible name");
assert(
  /\.header-right \{[\s\S]{0,120}margin-left:\s*auto/.test(css),
  "header actions must sit on the right via margin-left: auto",
);
assert(
  /\.header-title-text \{[\s\S]{0,120}text-overflow:\s*ellipsis/.test(css),
  "chat title must ellipsize instead of overlapping icons",
);

console.log("ChatPanel.header.selftest.mjs: ok");
