import React, { Suspense, lazy } from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, HashRouter } from "react-router-dom";
import ErrorBoundary from "./components/ErrorBoundary";
import { resolveInitialLocale, translate, loadI18nCatalogs } from "./i18n";
import { isPublicMarketingPath } from "./site/marketingPaths";
import { isCapacitorNativeShell, shouldBootMarketingShell } from "./lib/entryShell";
import { getToken } from "./lib/storage";
import { isAnalyticsAllowed, markAnalyticsAllowed } from "./site/analyticsGate";
import { clearModuleLoadRecovery } from "./lib/moduleLoadError";
import { captureVisit } from "./lib/attribution";
import { installAndroidBack } from "./lib/androidBack";
import { startErrorReporting } from "./lib/sentry";

// Crash/error reporting (prod only, lazy-loaded after first paint, buffers earlier errors).
startErrorReporting();

try {
  captureVisit();
} catch {
  /* first-touch capture is best-effort */
}
installAndroidBack();

const path = typeof window !== "undefined" ? window.location.pathname || "/" : "/";
const hasSession = Boolean(getToken());
const isElectronDesktop =
  typeof window !== "undefined" && Boolean(window.electronAPI?.isElectron);
// Native Capacitor app (iOS/Android) — the landing page is web-only.
const isNativeApp = isCapacitorNativeShell();
// Desktop and the native apps must never hydrate the SEO/marketing shell —
// logged-out first paint is the app + its own AuthView (login / sign-up).
// Web marketing paths stay unchanged.
const preferMarketingShell = shouldBootMarketingShell({
  pathname: path,
  hasSession,
  isElectron: isElectronDesktop,
  isNativeApp,
});

/**
 * Schedule third-party analytics only after cookie consent (or app idle allow).
 */
function scheduleAnalytics({ preferMarketing }) {
  let started = false;
  const start = () => {
    if (started) return;
    if (!isAnalyticsAllowed()) return;
    started = true;
    import("./site/analytics")
      .then((m) => m.initAnalytics())
      .catch(() => {});
  };

  window.addEventListener("descall:analytics-allowed", start);
  // Re-check if consent already stored from a prior visit.
  if (isAnalyticsAllowed()) {
    window.setTimeout(start, preferMarketing ? 1500 : 500);
  } else if (!preferMarketing) {
    // Authenticated app: allow product analytics after short idle (not marketing).
    window.setTimeout(() => {
      markAnalyticsAllowed();
      start();
    }, 2500);
  }
}

scheduleAnalytics({ preferMarketing: preferMarketingShell });

if (!preferMarketingShell) {
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
  const raw =
    localStorage.getItem("descall_user_settings") ||
    localStorage.getItem("descall_settings") ||
    "{}";
  const settings = JSON.parse(raw);
  document.documentElement.setAttribute(
    "data-theme",
    settings.premiumThemeKey || (settings.darkMode === false ? "light" : "dark")
  );
  const accent = settings.accentColor;
  if (accent && !settings.premiumThemeKey) {
    const hex = String(accent).replace("#", "");
    if (hex.length === 6) {
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      const root = document.documentElement.style;
      root.setProperty("--primary", accent);
      root.setProperty("--primary-2", accent);
      root.setProperty("--primary-soft", `rgba(${r}, ${g}, ${b}, 0.12)`);
      root.setProperty("--primary-glow", `rgba(${r}, ${g}, ${b}, 0.35)`);
      root.setProperty("--accent", accent);
    }
  }
  if (settings.chatFontSize) {
    document.documentElement.style.setProperty("--chat-font-size", `${settings.chatFontSize}px`);
  }
  if (settings.uiDensity) {
    document.documentElement.setAttribute("data-density", settings.uiDensity);
  }
  if (settings.bubbleStyle) {
    document.documentElement.setAttribute("data-bubble", settings.bubbleStyle);
  }
} catch {
  document.documentElement.setAttribute("data-theme", "dark");
}

const bootLocale = resolveInitialLocale();
const statusEl = document.getElementById("boot-status");
// Keep status for screen readers only — splash UI is logo + thin bar (no STARTING wall).
if (statusEl) statusEl.textContent = translate(bootLocale, "Loading");

/**
 * Progressive marketing hydration: paint #seo-static first (LCP / crawlers),
 * then swap to the real MarketingLayout nav — never leave humans stuck on the
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
    // Native SEO <a href> stays MPA — full navigation, no client hydrate required.
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
  // visible above the React app — that stacks Privacy / Valorant LFG links over /play.
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
    const seo = document.getElementById("seo-static");
    if (seo) {
      seo.setAttribute("hidden", "");
      seo.setAttribute("aria-hidden", "true");
      seo.style.display = "none";
    }
    const consent = document.getElementById("mkt-consent-static");
    if (consent) {
      consent.hidden = true;
      consent.style.display = "none";
    }
  } catch {
    /* ignore */
  }

  const [{ ToastProvider }, { LocaleProvider }, { default: IosPwaInstallBanner }] =
    await Promise.all([
      import("./context/ToastContext"),
      import("./context/LocaleContext"),
      import("./components/IosPwaInstallBanner"),
      import("./styles.css"),
      loadI18nCatalogs(),
      // Liquid Glass gate (iPhone app only; adds html.glass-ui before first paint).
      isNativeApp
        ? import("./lib/glassUi.js").then((m) => m.initGlassUi()).catch(() => {})
        : null,
    ]);

  const [{ default: AppBootSkeleton }] = await Promise.all([
    import("./components/boot/AppBootSkeleton.jsx"),
    import("./styles/boot-skeleton.css"),
  ]);
  const RootApp = lazy(() => import("./App.jsx"));
  const AnalyticsLazy = lazy(() =>
    import("@vercel/analytics/react").then((m) => ({ default: m.Analytics }))
  );

  ReactDOM.createRoot(document.getElementById("root")).render(
    <React.StrictMode>
      <ErrorBoundary>
        <ToastProvider>
          <LocaleProvider>
            <Router>
              <Suspense fallback={<AppBootSkeleton />}>
                <RootApp />
              </Suspense>
              <IosPwaInstallBanner />
              {/* Vercel Web Analytics only exists on the Vercel-hosted web app; in the
                  native shell its /_vercel/insights script is a dead local request. */}
              {!isNativeApp && (
                <Suspense fallback={null}>
                  <AnalyticsLazy />
                </Suspense>
              )}
            </Router>
          </LocaleProvider>
        </ToastProvider>
      </ErrorBoundary>
    </React.StrictMode>
  );

  window.setTimeout(() => clearModuleLoadRecovery(), 4000);

  // Hand off to the real shell/skeleton ASAP — do not wait for getMe / sessionChecked.
  // Brand flash ~0.45s, hard cap ~1.8s so hard refresh never sticks on the splash.
  try {
    requestAnimationFrame(() => {
      window.__descallDismissBootSplash?.({ minMs: 450, maxMs: 1800 });
    });
  } catch {
    /* ignore */
  }
}

async function boot() {
  if (preferMarketingShell) {
    scheduleMarketingHydration(() => {
      import("./site/hydrateMarketing.jsx")
        .then((m) => {
          m.hydrateMarketing();
          window.setTimeout(() => clearModuleLoadRecovery(), 4000);
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

// Absolute failsafe — splash must never exceed ~2s even if React boot stalls.
window.setTimeout(() => {
  try {
    window.__descallDismissBootSplash?.({ minMs: 0, maxMs: 0 });
  } catch {
    /* ignore */
  }
}, 2000);
