import React, { Suspense, lazy } from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, HashRouter } from "react-router-dom";
import ErrorBoundary from "../components/ErrorBoundary";
import MarketingLocaleProvider, { resolveBootMarketingLocale } from "./MarketingLocaleProvider";
import CookieConsentBanner from "./CookieConsentBanner";
import { isPrefixedLocale } from "./siteLocales.js";
import { loadSiteCatalogWithin } from "./loadSiteCatalog.js";

const MarketingBoot = lazy(() => import("./MarketingBoot.jsx"));

const Router =
  typeof window !== "undefined" && window.location.protocol === "file:"
    ? HashRouter
    : BrowserRouter;

/**
 * Isolated marketing React tree, no Toast/motion, no full i18n catalogs,
 * no authenticated App/LiveKit. Analytics only after cookie consent.
 */
export async function hydrateMarketing() {
  // A prefixed site language (de, es, ...) renders only once its catalog is here:
  // the prerendered localized shell stays up meanwhile, so English never flashes over it.
  const bootLocale = resolveBootMarketingLocale();
  await Promise.all([
    import("./marketing-entry.css"),
    isPrefixedLocale(bootLocale) ? loadSiteCatalogWithin(bootLocale) : null,
  ]);

  const rootEl = document.getElementById("root");
  if (!rootEl) return;

  ReactDOM.createRoot(rootEl).render(
    <React.StrictMode>
      <ErrorBoundary>
        <MarketingLocaleProvider>
          {/* react-router 7 wraps router updates in React.startTransition by
              default; v6 rendered them synchronously. Keep the v6 behaviour so a
              route change paints before the next click (same UX as before the upgrade). */}
          <Router useTransitions={false}>
            <Suspense fallback={null}>
              <MarketingBoot />
            </Suspense>
            <CookieConsentBanner />
          </Router>
        </MarketingLocaleProvider>
      </ErrorBoundary>
    </React.StrictMode>
  );
}
