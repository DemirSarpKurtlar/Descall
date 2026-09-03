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
const shopIcons = readFileSync(join(root, "lib/shopIcons.jsx"), "utf8");
const cosmetics = readFileSync(join(root, "components/ui/Cosmetics.jsx"), "utf8");

assert(/window\.location\.replace\(home\)/.test(app), "web logout must hard-navigate so iOS never lazy-loads marketing inside the app");
assert(/Capacitor\.isNativePlatform\(\)/.test(app.split("handleLogout")[1] || app), "native logout must stay in the app shell");
assert(/electronAPI\?\.isElectron/.test(app.split("handleLogout")[1] || app), "Electron logout must soft-clear (no hard-nav white screen)");
assert(/!isElectronDesktop/.test(app.split("handleLogout")[1] || app), "Electron must be excluded from web location.replace logout");
assert(/isElectronDesktop/.test(app.split("if (!me)")[1] || app) || /electronAPI\?\.isElectron/.test(app), "Electron logged-out must render AuthView");
assert(/isModuleLoadError/.test(boundary), "ErrorBoundary must recognize Safari module-import crashes");
assert(/recoverFromModuleLoadError/.test(boundary), "ErrorBoundary must auto-reload once on chunk load failure");
assert(/clearModuleLoadRecovery/.test(main), "successful boot must clear the module-reload latch");
assert(/SHOP_ICON_BY_EMOJI/.test(shopIcons) && /resolveShopBadgeIcon/.test(shopIcons), "shopIcons must map emoji + keys to Lucide");
assert(/ShopBadgeIcon/.test(cosmetics), "Cosmetics BadgeIcon must use Lucide ShopBadgeIcon");
assert(/ShopTitleTag/.test(cosmetics), "Cosmetics TitleTag must use Lucide ShopTitleTag");

const meBlock = app.split("if (!me) {").pop() || "";
const electronAuthIdx = meBlock.search(/nativeOrDesktop|Capacitor\.isNativePlatform\(\) \|\| isElectronDesktop/);
const navigateIdx = meBlock.indexOf('<Navigate to="/" replace />');
assert(
  electronAuthIdx !== -1 && (navigateIdx === -1 || electronAuthIdx < navigateIdx),
  "Electron AuthView must render before Navigate-to-/ to avoid a blank white frame",
);

console.log("App.logout.selftest.mjs: ok");
