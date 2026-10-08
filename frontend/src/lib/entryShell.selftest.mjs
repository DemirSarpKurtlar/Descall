/**
 * Run: node frontend/src/lib/entryShell.selftest.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  initialAuthMode,
  isCapacitorNativeShell,
  isElectronShell,
  shouldBootMarketingShell,
} from "./entryShell.js";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const iosWin = { Capacitor: { isNativePlatform: () => true, getPlatform: () => "ios" } };
const androidWin = { Capacitor: { isNativePlatform: () => true, getPlatform: () => "android" } };
const webCapWin = { Capacitor: { isNativePlatform: () => false, getPlatform: () => "web" } };
const electronWin = { electronAPI: { isElectron: true } };
const webWin = {};

assert(isCapacitorNativeShell(iosWin), "native iOS bridge detected");
assert(isCapacitorNativeShell(androidWin), "native Android bridge detected");
assert(!isCapacitorNativeShell(webCapWin), "web Capacitor runtime is not native");
assert(!isCapacitorNativeShell(webWin), "plain browser is not native");
assert(!isCapacitorNativeShell(null), "no window is not native");
assert(isElectronShell(electronWin) && !isElectronShell(webWin), "electron detection");

const decide = (win, pathname, hasSession = false) =>
  shouldBootMarketingShell({
    pathname,
    hasSession,
    isElectron: isElectronShell(win),
    isNativeApp: isCapacitorNativeShell(win),
  });

// Web: landing + marketing pages stay exactly as before.
assert(decide(webWin, "/") === true, "web logged-out / keeps the landing page");
assert(decide(webWin, "/tr") === true, "web logged-out /tr keeps the landing page");
assert(decide(webWin, "/download") === true, "web /download stays marketing");
assert(decide(webWin, "/login") === true, "web /login stays the marketing auth modal");
assert(decide(webWin, "/", true) === false, "web with session boots the app");
assert(decide(webWin, "/direct") === false, "web app route boots the app");

// Native iOS / Android: never the landing — straight to the app's own auth screen.
for (const path of ["/", "/tr", "/download", "/tr/download", "/features", "/faq", "/login", "/register", "/privacy", "/blog/x"]) {
  assert(decide(iosWin, path) === false, `iOS ${path} must not boot marketing`);
  assert(decide(androidWin, path) === false, `Android ${path} must not boot marketing`);
}
assert(decide(iosWin, "/", true) === false, "iOS with session boots the app");

// Electron: unchanged (never marketing).
assert(decide(electronWin, "/") === false, "Electron / never boots marketing");

assert(initialAuthMode("/") === "login", "default tab is login");
assert(initialAuthMode("/register") === "register", "/register opens sign-up");
assert(initialAuthMode("/tr/register/") === "register", "/tr/register opens sign-up");
assert(initialAuthMode("/", "?auth=register") === "register", "?auth=register opens sign-up");
assert(initialAuthMode("/login") === "login", "/login opens login");

// Wiring: the boot decision, the pre-React index.html guards and the native styles.
const here = dirname(fileURLToPath(import.meta.url));
const main = readFileSync(join(here, "..", "main.jsx"), "utf8");
const indexHtml = readFileSync(join(here, "..", "..", "index.html"), "utf8");
const stylesCss = readFileSync(join(here, "..", "styles.css"), "utf8");
const authView = readFileSync(join(here, "..", "components", "AuthView.jsx"), "utf8");
assert(/shouldBootMarketingShell\(/.test(main), "main.jsx must use shouldBootMarketingShell");
assert(/isNativeApp/.test(main) && /isCapacitorNativeShell\(\)/.test(main), "main.jsx must pass the native flag");
assert((indexHtml.match(/isNativePlatform\(\)/g) || []).length >= 3, "index.html must skip gtag, the /tr redirect and the marketing shell in the native app");
assert(/!isApp && !hasToken && !nativeShell/.test(indexHtml), "native app must boot the app shell (no marketing shell)");
assert(/&& !nativeApp\)/.test(indexHtml), "native app must not reload into the /tr marketing mirror");
assert(/@import '\.\/styles\/native-app\.css';/.test(stylesCss), "native-app.css must be imported");
const analyticsJs = readFileSync(join(here, "..", "site", "analytics.js"), "utf8");
assert(/if \(isNativeIosShell\(\)\) return;/.test(analyticsJs), "native iOS app must never load gtag (Google Ads) from analytics.js");
const nativeCss = readFileSync(join(here, "..", "styles", "native-app.css"), "utf8");
assert(/html\.native-app \.toast-stack\s*\{[^}]*safe-area-inset-top/.test(nativeCss), "native toasts must sit below the Dynamic Island");
assert(/html\.native-app \.app-feedback-banner,[\s\S]{0,80}\{[^}]*safe-area-inset-top/.test(nativeCss), "native top banners must pad for the Dynamic Island");
assert(/is-native/.test(authView) && /auth-legal-links/.test(authView), "AuthView must render native safe-area class + legal links");

// Mobile boot: launch-style splash (logo on #393C4D), never the skeleton.
assert(/classList\.add\("boot-mobile"\)/.test(indexHtml), "index.html must flag the mobile boot surface before paint");
assert(/window\.__descallHoldBootSplash = function/.test(indexHtml), "index.html must expose the boot splash hold");
assert((indexHtml.match(/if \(window\.__descallBootHolds > 0\) return;/g) || []).length >= 5, "every splash dismiss path must respect holds");
assert(/html\.boot-mobile #boot-splash,\s*\.descall-boot-splash\s*\{[^}]*background: #393c4d;/.test(indexHtml), "mobile splash must be flat #393C4D like the launch screen");
assert(/html\.boot-mobile #boot-splash \.boot-title,/.test(indexHtml), "mobile splash must hide the title/bar/orbs (logo only)");
const bootSkeleton = readFileSync(join(here, "..", "components", "boot", "AppBootSkeleton.jsx"), "utf8");
assert(/if \(isMobileBootSurface\(\)\) return <MobileBootSplash \/>;/.test(bootSkeleton), "AppBootSkeleton must render the splash on mobile");
assert(/__descallHoldBootSplash/.test(bootSkeleton) && /descall-boot-splash/.test(bootSkeleton), "mobile boot placeholder must hold the HTML splash");
const mobileBranch = bootSkeleton.slice(bootSkeleton.indexOf("function MobileBootSplash"), bootSkeleton.indexOf("export default function AppBootSkeleton"));
assert(mobileBranch && !/Loading Descall|app-boot-skeleton/.test(mobileBranch), "mobile boot placeholder must have no skeleton / English text");

console.log("entryShell.selftest.mjs: ok");
