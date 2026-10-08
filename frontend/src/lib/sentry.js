/**
 * Sentry error reporting for the app: web (descall.com), Electron renderer, Capacitor iOS webview.
 *
 * - Production builds only, never from localhost / dev servers (native shells excepted: they
 *   serve the bundle from a localhost-like origin).
 * - Errors only: no tracing, no Session Replay, no session tracking, no console breadcrumbs.
 * - The SDK is lazy-loaded after first paint (keeps the marketing JS budget); errors thrown
 *   before it loads are buffered and sent once it is ready.
 */
import { scrubEvent, scrubBreadcrumb } from "./sentryScrub";

const SENTRY_DSN =
  "https://dd5fad1cc547154ece0dd5ff07edb982@o4512220968779776.ingest.de.sentry.io/4512221008035920";
// eslint-disable-next-line no-undef
const APP_VERSION = typeof __DESCALL_VERSION__ !== "undefined" ? __DESCALL_VERSION__ : null;
const MAX_EARLY = 20;

let enabled = null;
let sentry = null;
let loading = null;
const early = [];

// Cheap check via the global Capacitor bridge (injected before page scripts in the native shell),
// so @capacitor/core is not pulled into the first-paint entry chunk.
function capacitorGlobal() {
  return typeof window !== "undefined" ? window.Capacitor : null;
}

function isNativeShell() {
  try {
    const cap = capacitorGlobal();
    return Boolean(cap && typeof cap.isNativePlatform === "function" && cap.isNativePlatform());
  } catch {
    return false;
  }
}

function isElectron() {
  return typeof window !== "undefined" && Boolean(window.electronAPI?.isElectron);
}

/** Platform tag: 'ios' (native Capacitor iOS), 'electron', 'android' (native shell) or 'web'. */
export function sentryPlatform(isNativeIOS) {
  if (isNativeIOS()) return "ios";
  if (isElectron()) return "electron";
  if (isNativeShell()) {
    try {
      const p = capacitorGlobal().getPlatform();
      if (p) return p;
    } catch {
      /* fall through */
    }
  }
  return "web";
}

function isLocalHost(hostname) {
  const h = String(hostname || "").toLowerCase();
  return (
    h === "localhost" ||
    h === "0.0.0.0" ||
    h === "[::1]" ||
    h === "::1" ||
    h.endsWith(".localhost") ||
    h.endsWith(".local") ||
    /^127\./.test(h) ||
    /^10\./.test(h) ||
    /^192\.168\./.test(h)
  );
}

export function isErrorReportingEnabled() {
  if (enabled !== null) return enabled;
  enabled = false;
  try {
    if (!import.meta.env.PROD || typeof window === "undefined") return enabled;
    if (isElectron() || isNativeShell()) {
      // Electron dev loads http://localhost:5173; packaged builds use file://.
      enabled = !(isElectron() && window.location.protocol.startsWith("http") && isLocalHost(window.location.hostname));
      return enabled;
    }
    const { protocol, hostname } = window.location;
    enabled = (protocol === "https:" || protocol === "http:") && !isLocalHost(hostname);
  } catch {
    enabled = false;
  }
  return enabled;
}

function environmentName() {
  try {
    if (/staging/i.test(window.location.hostname || "")) return "staging";
  } catch {
    /* ignore */
  }
  return "production";
}

function onEarlyError(e) {
  if (early.length < MAX_EARLY) early.push({ error: e?.error || new Error(String(e?.message || "Script error")) });
}
function onEarlyRejection(e) {
  if (early.length < MAX_EARLY) {
    const r = e?.reason;
    early.push({ error: r instanceof Error ? r : new Error(`Unhandled rejection: ${String(r)}`) });
  }
}

function loadSdk() {
  if (loading) return loading;
  loading = import("./sentrySdk")
    .then((Sentry) => {
      const { isNativeIOS } = Sentry;
      Sentry.init({
        dsn: SENTRY_DSN,
        release: APP_VERSION ? `descall@${APP_VERSION}` : undefined,
        environment: environmentName(),
        sendDefaultPii: false,
        tracesSampleRate: 0,
        integrations: (defaults) =>
          defaults
            // Errors only: no release-health session pings.
            .filter((i) => i.name !== "BrowserSession" && i.name !== "Breadcrumbs")
            .concat(Sentry.breadcrumbsIntegration({ console: false })),
        ignoreErrors: ["ResizeObserver loop limit exceeded", "ResizeObserver loop completed with undelivered notifications"],
        initialScope: { tags: { platform: sentryPlatform(isNativeIOS) } },
        beforeSend: (event) => scrubEvent(event),
        beforeBreadcrumb: (crumb) => scrubBreadcrumb(crumb),
      });
      sentry = Sentry;
      window.removeEventListener("error", onEarlyError);
      window.removeEventListener("unhandledrejection", onEarlyRejection);
      for (const item of early.splice(0)) {
        if (item.react) Sentry.captureReactException(item.error, item.react);
        else Sentry.captureException(item.error, { mechanism: { type: "onerror", handled: false } });
      }
      return Sentry;
    })
    .catch(() => {
      // Offline / blocked chunk: reporting is best-effort, never break the app.
      window.removeEventListener("error", onEarlyError);
      window.removeEventListener("unhandledrejection", onEarlyRejection);
      early.length = 0;
      return null;
    });
  return loading;
}

/** Call once, as early as possible in the entry module. */
export function startErrorReporting() {
  if (!isErrorReportingEnabled()) return;
  window.addEventListener("error", onEarlyError);
  window.addEventListener("unhandledrejection", onEarlyRejection);
  const schedule = () => {
    const idle = window.requestIdleCallback;
    if (typeof idle === "function") idle(() => loadSdk(), { timeout: 3000 });
    else window.setTimeout(() => loadSdk(), 1500);
  };
  if (document.readyState === "complete") schedule();
  else window.addEventListener("load", schedule, { once: true });
}

/** Report an error caught by a React error boundary (UI is unaffected). */
export function reportReactError(error, errorInfo) {
  if (!isErrorReportingEnabled() || !error) return;
  const react = { componentStack: errorInfo?.componentStack || "" };
  if (sentry) {
    try {
      sentry.captureReactException(error, react);
    } catch {
      /* ignore */
    }
    return;
  }
  if (early.length < MAX_EARLY) early.push({ error, react });
  void loadSdk();
}
