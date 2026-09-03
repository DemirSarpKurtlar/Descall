/**
 * Run: node frontend/src/App.logout.selftest.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const app = readFileSync(join(root, "App.jsx"), "utf8");
const boundary = readFileSync(join(root, "components/ErrorBoundary.jsx"), "utf8");
const main = readFileSync(join(root, "main.jsx"), "utf8");

assert(/window\.location\.replace\(home\)/.test(app), "web logout must hard-navigate so iOS never lazy-loads marketing inside the app");
assert(/Capacitor\.isNativePlatform\(\)/.test(app.split("handleLogout")[1] || app), "native logout must stay in the app shell");
assert(/isModuleLoadError/.test(boundary), "ErrorBoundary must recognize Safari module-import crashes");
assert(/recoverFromModuleLoadError/.test(boundary), "ErrorBoundary must auto-reload once on chunk load failure");
assert(/clearModuleLoadRecovery/.test(main), "successful boot must clear the module-reload latch");

console.log("App.logout.selftest.mjs: ok");
