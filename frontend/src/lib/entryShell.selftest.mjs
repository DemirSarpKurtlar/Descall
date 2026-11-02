/**
 * Run: node frontend/src/lib/entryShell.selftest.mjs
 */
import { existsSync, readFileSync } from "node:fs";
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

const decide = (win, pathname, hasSession = false, search = "") =>
  shouldBootMarketingShell({
    pathname,
    search,
    hasSession,
    isElectron: isElectronShell(win),
    isNativeApp: isCapacitorNativeShell(win),
  });

// Web: landing + marketing pages stay exactly as before.
assert(decide(webWin, "/") === true, "web logged-out / keeps the landing page");
assert(decide(webWin, "/tr") === true, "web logged-out /tr keeps the landing page");
assert(decide(webWin, "/download") === true, "web /download stays marketing");
assert(decide(webWin, "/login") === true, "web /login stays the marketing auth modal");
assert(decide(webWin, "/login", false, "?glass-desktop=1") === false, "glass preview on /login boots app auth");
assert(decide(webWin, "/register", false, "?gd=1") === false, "glass preview on /register boots app auth");
assert(decide(webWin, "/", false, "?glass-desktop=1") === true, "glass preview does not replace the marketing home");
assert(decide(webWin, "/", true) === false, "web with session boots the app");
assert(decide(webWin, "/direct") === false, "web app route boots the app");
assert(decide(webWin, "/missing-public-page") === true, "unknown web paths boot the marketing 404");
assert(decide(webWin, "/invite/abc") === false, "group invites stay in the app");
assert(decide(webWin, "/i/abcd") === false, "short invites stay in the app");
assert(decide(webWin, "/s/myserver") === false, "server vanity stays in the app");

// Native iOS / Android: never the landing, straight to the app's own auth screen.
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

// Mobile boot: launch-style splash, never the skeleton.
assert(/classList\.add\("boot-mobile"\)/.test(indexHtml), "index.html must flag the mobile boot surface before paint");
assert(/window\.__descallHoldBootSplash = function/.test(indexHtml), "index.html must expose the boot splash hold");
assert((indexHtml.match(/if \(window\.__descallBootHolds > 0\) return;/g) || []).length >= 5, "every splash dismiss path must respect holds");
assert(/html\.boot-mobile #boot-splash,\s*\.descall-boot-splash\s*\{[^}]*background: #1e1f22;/.test(indexHtml), "mobile splash must be the app's dark surface #1E1F22 like the launch screen");
assert(/html\.boot-mobile #boot-splash \.boot-title\s*\{/.test(indexHtml) || /html\.boot-mobile #boot-splash \.boot-orb,\s*html\.boot-mobile #boot-splash \.boot-title/.test(indexHtml), "mobile splash must hide the title/orbs (logo only, no text)");
// Native app: Aurora splash (option A), the web first paint continues the LaunchAurora screen.
assert(/html\.native-app #boot-splash,\s*html\.native-app \.descall-boot-splash\s*\{[^}]*--u: max\(100vw \/ 393, 100vh \/ 852\);[^}]*url\("\/brand\/splash-aurora-bg\.jpg"\) center \/ cover/.test(indexHtml), "native splash must draw the baked aurora background with cover scaling like Aspect Fill");
assert(/html\.native-app #boot-splash \.boot-mark,[^{]*\{[^}]*backdrop-filter: blur\(calc\(28 \* var\(--t\)\)\)/.test(indexHtml), "native splash tile must be live glass at the launch-screen scale");
assert(/--t: min\(var\(--u\), 1\.2px\);/.test(indexHtml), "iPad: tile scale is the cover scale capped at 1.2 (158pt tile), not 2-3x");
{
  const nativeBlock = indexHtml.slice(indexHtml.indexOf('splash option A "Aurora"'), indexHtml.indexOf("@keyframes boot-aurora-drift"));
  assert(!/calc\([^)]*var\(--u\)/.test(nativeBlock), "tile / loader sizes use the capped --t, never the uncapped --u");
}
assert(/messageHandlers\.descallSplashPainted/.test(indexHtml) && /img\.decode/.test(indexHtml), "web splash must report its first paint after the background decodes");
assert(/@media \(prefers-reduced-motion: reduce\)\s*\{\s*html\.native-app #boot-splash::before,[^}]*\{\s*animation: none;/.test(indexHtml), "reduced motion stops the blob drift");
assert(existsSync(join(here, "..", "..", "public", "brand", "splash-aurora-bg.jpg")), "aurora background asset must ship");
const capConfig = readFileSync(join(here, "..", "..", "capacitor.config.ts"), "utf8");
assert(/ios:\s*\{[\s\S]*?backgroundColor: "#0D1030"/.test(capConfig), "iOS WebView background must be the aurora base color");
assert(/android:\s*\{[\s\S]*?backgroundColor: "#1E1F22"/.test(capConfig), "Android keeps its own splash surface");
const launchStoryboard = readFileSync(join(here, "..", "..", "ios", "App", "App", "Base.lproj", "LaunchScreen.storyboard"), "utf8");
// 3.7.29 animated splash: the launch screen is the plain first frame of the splash video.
assert(/<color key="backgroundColor" name="SplashBackground"\/>/.test(launchStoryboard), "LaunchScreen is the SplashBackground color (first video frame)");
assert(!/<imageView/.test(launchStoryboard), "LaunchScreen draws no image (no flash before the video)");
{
  const assets = join(here, "..", "..", "ios", "App", "App", "Assets.xcassets");
  const color = JSON.parse(readFileSync(join(assets, "SplashBackground.colorset", "Contents.json"), "utf8"));
  const comps = color.colors.map((c) => c.color.components);
  assert(comps.some((c) => c.red === "0xF4" && c.blue === "0xF6") && comps.some((c) => c.red === "0x1E" && c.blue === "0x29"), "SplashBackground light #F4F4F6 / dark #1E2029");
  for (const k of ["oneshot", "loop"]) for (const t of ["light", "dark"]) {
    assert(existsSync(join(assets, `SplashVideo-${k}-${t}.dataset`, `descall-splash-${k}-${t}.mp4`)), `splash video ${k} ${t}`);
  }
}
const bridgeVc = readFileSync(join(here, "..", "..", "ios", "App", "App", "DescallBridgeViewController.swift"), "utf8");
assert(/splashPaintedHandler = "descallSplashPainted"/.test(bridgeVc) && /func webSplashDidPaint\(\)/.test(bridgeVc), "native launch view still listens for the web splash paint");
assert(/final class DescallLaunchSplashView/.test(bridgeVc) && /AVPlayerLooper/.test(bridgeVc) && /isReduceMotionEnabled/.test(bridgeVc), "native splash: one-shot, loop while loading, static frame on Reduce Motion");
const bootSkeleton = readFileSync(join(here, "..", "components", "boot", "AppBootSkeleton.jsx"), "utf8");
assert(/isMobileBootSurface\(\) && isNativeBootSurface\(\)\) return <MobileBootSplash \/>;/.test(bootSkeleton), "native mobile boot still uses the launch splash");
assert(/isMobileBootSurface\(\)\) return <WebBootSplash \/>;/.test(bootSkeleton), "phone web boot uses the aurora loader");
assert(/__descallHoldBootSplash/.test(bootSkeleton) && /descall-boot-splash/.test(bootSkeleton) && /boot-symbol/.test(bootSkeleton), "mobile boot placeholder must hold the HTML splash and draw the same tile");
const mobileBranch = bootSkeleton.slice(bootSkeleton.indexOf("function MobileBootSplash"), bootSkeleton.indexOf("export default function AppBootSkeleton"));
assert(mobileBranch && !/Loading Descall|app-boot-skeleton/.test(mobileBranch), "mobile boot placeholder must have no skeleton / English text");

console.log("entryShell.selftest.mjs: ok");
