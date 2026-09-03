/**
 * Run: node frontend/src/components/admin/AdminPanel.analytics.selftest.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const panel = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "AdminPanel.jsx"), "utf8");
const tabsBlock = panel.slice(panel.indexOf("const TABS = ["), panel.indexOf("export default function AdminPanel"));

assert.match(panel, /useState\("analytics"\)/, "admin must open on the analytics page");
assert.ok(panel.includes('tab === "security"') && panel.includes("loadSystem()"), "security tab must load system config");
assert.match(panel, /onBlur=\{\(e\) => act\(async \(\) => \{/, "rate limits must save on blur, not every keystroke");
assert.match(tabsBlock, /id: "analytics"/, "analytics tab must remain");

const removed = [
  "overview",
  "members",
  "activity",
  "engagement",
  "growth",
  "topusers",
  "users",
  "messages",
  "dm",
  "sockets",
  "errors",
];
for (const id of removed) {
  assert.equal(tabsBlock.includes(`id: "${id}"`), false, `${id} must not be in the admin tab strip`);
  assert.equal(panel.includes(`{tab === "${id}"`), false, `${id} page must be removed`);
}

console.log("AdminPanel.analytics.selftest.mjs: ok");
