import React, { Suspense, lazy } from "react";
import { removeBootSplashNow, rootHasPainted } from "./lib/bootSplashDirect.js";
import ReactDOM from "react-dom/client";
import { BrowserRouter, HashRouter } from "react-router-dom";
import ErrorBoundary from "./components/ErrorBoundary";
import { resolveInitialLocale, translate, loadI18nCatalogs } from "./i18n";
import { isPublicMarketingPath } from "./site/marketingPaths";
import { isCapacitorNativeShell, shouldBootMarketingShell } from "./lib/entryShell";
import { getToken, hydrateSecureToken } from "./lib/storage";
import { isAnalyticsAllowed } from "./site/analyticsGate";
import { clearModuleLoadRecovery } from "./lib/moduleLoadError";
import { captureVisit } from "./lib/attribution";
import { installAndroidBack } from "./lib/androidBack";
import { installFlagFont } from "./lib/flagFont.js";
import { startErrorReporting } from "./lib/sentry";
import { applyDocumentTheme } from "./lib/themeDocument";

// On-device viewport readout (?vpdebug=1 / ?vpdebug=0). Loaded only when asked.
try {
  if (typeof window !== "undefined" && (/[?&]vpdebug=/.test(window.location.search) || window.localStorage?.getItem("descall:vpdebug") === "1")) {
    import("./lib/viewportDebug.js").then((m) => {
      if (!m.viewportDebugWanted(window.location.search, window.localStorage)) return;
      const go = () => m.installViewportDebug();
      if (document.body) go();
      else window.addEventListener("DOMContentLoaded", go, { once: true });
    });
  }
} catch {
  /* debug only */
}

// Crash/error reporting (prod only, lazy-loaded after first paint, buffers earlier errors).
startErrorReporting();

try {
  captureVisit();
} catch {
  /* first-touch capture is best-effort */
}
installAndroidBack();
// Windows has no flag emoji glyphs: use the bundled Twemoji flag subset there.
installFlagFont();
// Lazy so the marketing first-paint bundle does not pull Capacitor in.
if (isCapacitorNativeShell()) {
  import("./lib/fluid/haptics.js")
    .then((mod) => mod.installIosHapticHints())
    .catch(() => {});
}

const path = typeof window !== "undefined" ? window.location.pathname || "/" : "/";
const isElectronDesktop =
  typeof window !== "undefined" && Boolean(window.electronAPI?.isElectron);
// Yönetici › Kayıt İstatistikleri window (Electron opens it as its own BrowserWindow):
// boot only that page, not the whole app (no socket, no second session shell).
const isSignupStatsWindow = /^\/admin\/signup-stats\/?$/.test(path);
// Native Capacitor app (iOS/Android), the landing page is web-only.
const isNativeApp = isCapacitorNativeShell();

/**
 * Schedule third-party analytics only after an explicit cookie accept.
 * No idle auto-grant: Reject stays as easy as Accept, including in the signed-in app.
 */
function scheduleAnalytics({ preferMarketing }) {
  let started = false;
  const start = () => {
    if (!isAnalyticsAllowed()) {
      started = false;
      import("./site/analytics")
        .then((m) => m.shutdownAnalytics())
        .catch(() => {});
      return;
    }
    if (started) return;
    started = true;
    import("./site/analytics")
      .then((m) => m.initAnalytics())
      .catch(() => {});
  };

  window.addEventListener("descall:analytics-allowed", start);
  window.addEventListener("descall:cookie-consent", start);
  // Re-check if consent already stored from a prior visit.
  if (isAnalyticsAllowed()) {
    window.setTimeout(start, preferMarketing ? 1500 : 500);
  }
}

function preloadAppStyles() {
  import("./lib/noiseSuppression")
    .then((m) => m.preloadNoiseSuppression?.())
    .catch(() => {});
  import("./styles/blackjack.css").catch(() => {});
  import("./styles/slot-cabinet.css").catch(() => {});
  import("./styles/coinflip.css").catch(() => {});
}

const Router =
  typeof window !== "undefined" && window.location.protocol === "file:"
    ? HashRouter
    : BrowserRouter;

try {
  /* Cheap first-paint theme (marketing pages and the boot splash). The full
     Settings › Görünüm (auto theme, text size, reduce motion / transparency)
     is applied by lib/appearanceSync.js before the app renders, see
     prefetchAppChunk(). Kept out of this entry so the marketing JS budget
     holds. */
  const raw =
    localStorage.getItem("descall_user_settings") ||
    localStorage.getItem("descall_settings") ||
    "{}";
  const settings = JSON.parse(raw);
  const theme = settings.premiumThemeKey || (settings.darkMode === false ? "light" : "dark");
  const accentColor = settings.premiumThemeKey ? null : settings.accentColor;
  applyDocumentTheme(document.documentElement, theme, { accentColor });
} catch {
  document.documentElement.setAttribute("data-theme", "dark");
}

const bootLocale = resolveInitialLocale();
const statusEl = document.getElementById("boot-status");
// Keep status for screen readers only, splash UI is logo + thin bar (no STARTING wall).
// The inline splash already wrote "Yükleniyor" (window.__descallBootTr). Catalogs
// are still loading here, so translate() would flip it to English "Loading" (B2).
if (statusEl && !window.__descallBootTr) statusEl.textContent = translate(bootLocale, "Loading");

/**
 * Progressive marketing hydration: paint #seo-static first (LCP / crawlers),
 * then swap to the real MarketingLayout nav, never leave humans stuck on the
 * crawler text shell (looks like a broken menu).
 */
function scheduleMarketingHydration(run) {
  let started = false;
  let prefetched = false;
  const prefetch = () => {
    if (prefetched) return;
    prefetched = true;
    import("./site/hydrateMarketing.jsx").catch(() => {});
  };
  const start = () => {
    if (started) return;
    started = true;
    cleanup();
    run();
  };
  const onHydrateEvent = () => start();
  const onPrefetch = () => prefetch();
  const onEngage = (e) => {
    const t = e?.target;
    if (!t || typeof t.closest !== "function") return;
    // Native SEO <a href> stays MPA, full navigation, no client hydrate required.
    if (t.closest("#seo-static a[href]")) return;
    // Explicit hydrate hooks in prerender shell / CTAs (Start free, Sign in, …).
    if (t.closest("[data-hydrate], [data-auth], button, [role='button']")) start();
  };
  const cleanup = () => {
    window.removeEventListener("descall:hydrate-marketing", onHydrateEvent);
    window.removeEventListener("descall:prefetch-hydrate", onPrefetch);
    window.removeEventListener("pointerdown", onEngage);
    window.removeEventListener("keydown", onEngage);
  };
  window.addEventListener("descall:hydrate-marketing", onHydrateEvent);
  window.addEventListener("descall:prefetch-hydrate", onPrefetch);
  window.addEventListener("pointerdown", onEngage, { passive: true });
  window.addEventListener("keydown", onEngage);
  // Deep-link auth routes must hydrate immediately.
  if (/^\/(login|register|tr\/login|tr\/register)\/?$/.test(path) || /[?&]auth=/.test(window.location.search || "")) {
    start();
    return;
  }
  if (!isPublicMarketingPath(path)) return;
  // Hydrate right away on every public marketing route. The prerender shell is
  // for crawlers only: index.html keeps it invisible (html.seo-hold) until the
  // real page commits, so any delay here would just be a longer blank screen.
  // (It used to be visible and flashed as a plain "old" landing before the real one.)
  start();
}

async function bootApp() {
  // Authenticated (or non-marketing) boot: never leave prerendered marketing HTML
  // visible above the React app, that stacks Privacy links over the app.
  try {
    document.documentElement.setAttribute("data-react-ready", "1");
    document.documentElement.setAttribute("data-app-shell", "1");
    if (isElectronDesktop) {
      document.documentElement.classList.add("electron-app");
      document.body.classList.add("electron-app");
    }
    if (isNativeApp) {
      document.documentElement.classList.add("native-app");
    }
    document.documentElement.setAttribute("data-marketing-ready", "1");
    document.getElementById("seo-static")?.remove();
    const consent = document.getElementById("mkt-consent-static");
    if (consent) {
      consent.hidden = true;
      consent.style.display = "none";
    }
  } catch {
    /* ignore */
  }

  // One parallel wave (was two sequential ones): providers, styles, i18n,
  // glass flags and the boot skeleton. App.jsx was already requested in
  // boot() (prefetchAppChunk), so it downloads/parses alongside.
  const [
    { ToastProvider },
    { LocaleProvider },
    { default: IosPwaInstallBanner },
    { default: AppBootSkeleton },
  ] =
    await Promise.all([
      import("./context/ToastContext"),
      import("./context/LocaleContext"),
      import("./components/IosPwaInstallBanner"),
      import("./components/boot/AppBootSkeleton.jsx"),
      // Same cascade order as before: app styles, then the skeleton's.
      import("./styles.css").then(() => import("./styles/boot-skeleton.css")),
      loadI18nCatalogs(),
      // iPhone + mobile web Liquid Glass (html.glass-ui) and desktop Liquid Glass
      // (html.glass-desktop, on at >=960px unless a kill switch says otherwise).
      import("./lib/glassUi.js").then((m) => m.initGlassUi()).catch(() => {}),
      import("./lib/glassDesktop.js").then((m) => m.initGlassDesktop()).catch(() => {}),
    ]);

  const RootApp = isSignupStatsWindow
    ? lazy(() => import("./components/admin/signupStats/SignupStatsPage.jsx"))
    : lazy(() => prefetchAppChunk());

  ReactDOM.createRoot(document.getElementById("root")).render(
    <React.StrictMode>
      <ErrorBoundary>
        <ToastProvider>
          <LocaleProvider>
            {/* react-router 7 wraps router updates in React.startTransition by
                default; v6 rendered them synchronously. Keep the v6 behaviour so a
                route change paints before the next click (same UX as before the upgrade). */}
            <Router useTransitions={false}>
              <Suspense fallback={<AppBootSkeleton />}>
                <RootApp />
              </Suspense>
              <IosPwaInstallBanner />
            </Router>
          </LocaleProvider>
        </ToastProvider>
      </ErrorBoundary>
    </React.StrictMode>
  );

  // Only a boot whose App chunk really loaded re-arms the one-shot module
  // reload. Clearing on a bare timer turned a chunk that keeps failing into an
  // endless reload loop behind "Yükleniyor" (2.11.9); now the second failure
  // reaches the ErrorBoundary's error screen with its retry button.
  (isSignupStatsWindow ? Promise.resolve() : prefetchAppChunk())
    .then(() => window.setTimeout(() => clearModuleLoadRecovery(), 4000))
    .catch(() => {});

  // Hand off to the real shell/skeleton ASAP, do not wait for getMe / sessionChecked.
  // Brand flash ~0.45s, hard cap ~1.8s so hard refresh never sticks on the splash.
  try {
    requestAnimationFrame(() => {
      // Native: the splash is the system launch screen's twin, so a minimum
      // "brand flash" is only waiting; hide it on the app's first paint.
      window.__descallDismissBootSplash?.({ minMs: isNativeApp ? 0 : 450, maxMs: 1800 });
    });
  } catch {
    /* ignore */
  }
}

let appChunkPromise = null;
/** Start downloading / parsing the app bundle once; lazy() reuses the promise. */
function prefetchAppChunk() {
  if (!appChunkPromise) {
    // Görünüm lands before the first app frame; App.jsx keeps it in sync after.
    const appearance = Promise.all([import("./lib/appearanceSync.js"), import("./lib/appearancePrefs.js")])
      .then(([sync, prefs]) => {
        sync.applyStoredAppearance({ premium: prefs.readStoredSettings().premiumThemeKey || null });
        sync.installFontShortcuts();
      })
      .catch(() => {});
    appChunkPromise = Promise.all([import("./App.jsx"), appearance]).then(([mod]) => mod);
  }
  return appChunkPromise;
}

async function boot() {
  // Native shells and the desktop app always boot the app (never the
  // marketing shell): fetch the big App chunk while the Keychain read runs,
  // instead of after it and after the provider wave (cold-start waterfall).
  if ((isNativeApp || isElectronDesktop) && !isSignupStatsWindow) prefetchAppChunk().catch(() => {});
  // iOS: copy the Keychain token into memory before any getToken() / render.
  // Web, Android, and Electron return immediately and keep their existing store.
  await hydrateSecureToken();
  const hasSession = Boolean(getToken());
  const preferMarketingShell = !isSignupStatsWindow && shouldBootMarketingShell({
    pathname: path,
    search: typeof window !== "undefined" ? window.location.search || "" : "",
    hasSession,
    isElectron: isElectronDesktop,
    isNativeApp,
  });
  scheduleAnalytics({ preferMarketing: preferMarketingShell });
  if (!preferMarketingShell) preloadAppStyles();

  if (preferMarketingShell) {
    scheduleMarketingHydration(() => {
      import("./site/hydrateMarketing.jsx")
        .then((m) => {
          m.hydrateMarketing();
          // Only a boot whose App chunk really loaded re-arms the one-shot module
  // reload. Clearing on a bare timer turned a chunk that keeps failing into an
  // endless reload loop behind "Yükleniyor" (2.11.9); now the second failure
  // reaches the ErrorBoundary's error screen with its retry button.
  prefetchAppChunk()
    .then(() => window.setTimeout(() => clearModuleLoadRecovery(), 4000))
    .catch(() => {});
        })
        .catch((err) => {
          console.error("[boot] marketing hydrate failed", err);
          // Show the crawlable shell instead of a blank page if the chunk failed.
          try {
            window.__descallReleaseSeoHold?.();
          } catch {
            /* ignore */
          }
        });
    });
    return;
  }
  await bootApp();
}

boot().catch((err) => {
  console.error("[boot] failed", err);
  try {
    window.__descallBootFailed?.();
  } catch {
    /* ignore */
  }
  import("./lib/moduleLoadError")
    .then((mod) => {
      if (mod.isModuleLoadError(err)) mod.recoverFromModuleLoadError();
    })
    .catch(() => {});
});

// Absolute failsafe, splash must never exceed ~2s even if React boot stalls.
// Without index.html's inline boot scripts (CSP) remove it here once the app painted.
window.setTimeout(() => {
  try {
    if (typeof window.__descallDismissBootSplash === "function") {
      window.__descallDismissBootSplash({ minMs: 0, maxMs: 0 });
    } else if (rootHasPainted()) {
      removeBootSplashNow();
    }
  } catch {
    /* ignore */
  }
}, 2000);
