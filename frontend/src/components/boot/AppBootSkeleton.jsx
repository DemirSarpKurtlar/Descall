import { useEffect } from "react";
import { isDesktopShell } from "../../lib/desktopShell.js";
import { useT } from "../../context/localeContextInstance";
import RouteLoadingScreen from "./RouteLoadingScreen";
import { removeBootSplashNow } from "../../lib/bootSplashDirect.js";

/** Set before first paint by index.html (native app + phone/touch web, never Electron). */
function isMobileBootSurface() {
  try {
    return typeof document !== "undefined" && document.documentElement.classList.contains("boot-mobile");
  } catch {
    return false;
  }
}

function isNarrowBoot() {
  try {
    if (typeof window === "undefined") return false;
    if (isDesktopShell()) return false;
    const width = window.innerWidth || 0;
    return width > 0 && width < 960;
  } catch {
    return false;
  }
}

function isNativeBootSurface() {
  try {
    return typeof document !== "undefined" && document.documentElement.classList.contains("native-app");
  } catch {
    return false;
  }
}

/** Native Capacitor shell on Android (html.native-app from index.html + Android WebView UA). */
function isAndroidNativeBoot() {
  try {
    return isNativeBootSurface() && /Android/i.test(navigator.userAgent || "");
  } catch {
    return false;
  }
}

/**
 * Android cold start: the release above only schedules the dismiss (timer, then
 * index.html's paint check, then another timer). The app's first commit runs
 * all its mount effects right here, so on a throttled phone those hops waited
 * 0.6-2 s behind long tasks while the finished first screen sat under the
 * splash. This placeholder unmounting means the app tree is committed: start
 * the fade now, in the same frame, unless another hold is still up or a new
 * boot placeholder replaced this one.
 */
function handOffAndroidBootSplash() {
  try {
    if (Number(window.__descallBootHolds || 0) > 0) return;
    if (document.querySelector("#root .descall-boot-splash")) return;
    // Something real is in #root (textContent: no forced layout, unlike innerText).
    const root = document.getElementById("root");
    if (!root || !root.firstElementChild || !String(root.textContent || "").trim()) return;
    const splash = document.getElementById("boot-splash");
    if (!splash || splash.classList.contains("boot-splash--hide")) return;
    if (splash.getAttribute("data-boot-failed") === "1") return;
    removeBootSplashNow();
  } catch {
    /* index.html's own dismiss still runs */
  }
}

/**
 * Mobile: never a skeleton. Keep the launch-style splash (Aurora: deep
 * gradient, blurred blobs and the frosted Konsept 2 tile, same picture as the
 * native LaunchAurora launch screen) up for as long as the app is booting: hold the
 * pre-React #boot-splash so it does not fade into a placeholder, and paint the
 * identical splash underneath for the cases where the HTML splash is already
 * gone. Styles live in index.html (.descall-boot-splash).
 */
function MobileBootSplash() {
  const t = useT();
  useEffect(() => {
    const hold = typeof window !== "undefined" ? window.__descallHoldBootSplash : null;
    const release = typeof hold === "function" ? hold() : null;
    return () => {
      if (release) release();
      if (isAndroidNativeBoot()) handOffAndroidBootSplash();
    };
  }, []);
  return (
    <div className="descall-boot-splash" role="status" aria-busy="true" aria-label={t("Loading")}>
      <div className="boot-card" aria-hidden="true">
        {/* Aurora splash (index.html, html.native-app): live glass tile over
            /brand/splash-aurora-bg.jpg, same picture as the LaunchAurora screen. */}
        <div className="boot-mark">
          <img className="boot-symbol" src={`${import.meta.env.BASE_URL || "/"}brand/descall-symbol-gradient.svg`} alt="" width="64" height="64" />
        </div>
        <div className="boot-bar">
          <i />
        </div>
      </div>
    </div>
  );
}

/**
 * Visible shell while the authenticated app chunk hydrates / session resolves.
 * Replaces the empty black #root that made hard navigations look crashed.
 * Desktop web / Electron: skeleton (unchanged). Mobile: launch splash.
 */
/** Phone web: same aurora screen as the HTML splash, once React is up. */
function WebBootSplash() {
  useEffect(() => {
    const hold = typeof window !== "undefined" ? window.__descallHoldBootSplash : null;
    return typeof hold === "function" ? hold() : undefined;
  }, []);
  return <RouteLoadingScreen />;
}

export default function AppBootSkeleton(props) {
  if (isMobileBootSurface() && isNativeBootSurface()) return <MobileBootSplash />;
  if (isMobileBootSurface()) return <WebBootSplash />;
  if (isNarrowBoot()) return <WebBootSplash />;
  return <DesktopBootSkeleton {...props} />;
}

// 2.11.14: mirrors the real desktop layout block for block (spec
// splash-header-2026-10-18 §4): rail, list column, user/voice panel, and the
// chat panel with the floating header pills, bubbles and composer capsule.
// One shared shimmer sweeps the whole window (boot-skeleton.css).
const LIST_ROWS = [[52, 70], [60, 82], [72, 58], [48, 78], [66, 55], [74, 62], [50, 85]];
const BUBBLES = [
  ["in", 52, 46], ["out", 42, 30], ["in", 58, 46], ["in", 38, 30], ["out", 64, 46], ["in", 48, 30],
];

function DesktopBootSkeleton({ label }) {
  const t = useT();
  return (
    <div className="app-boot-skeleton" role="status" aria-busy="true" aria-label={label || t("core.boot.loadingDescall")}>
      <div className="app-boot-skeleton__rail" aria-hidden="true">
        {Array.from({ length: 7 }).map((_, i) => (
          <span key={i} className="app-boot-skeleton__sk app-boot-skeleton__rail-dot" />
        ))}
        <span className="app-boot-skeleton__rail-sep" />
        {Array.from({ length: 2 }).map((_, i) => (
          <span key={`b${i}`} className="app-boot-skeleton__sk app-boot-skeleton__rail-dot" />
        ))}
      </div>
      <div className="app-boot-skeleton__sidebar" aria-hidden="true">
        <div className="app-boot-skeleton__list-head">
          <span className="app-boot-skeleton__sk app-boot-skeleton__title-pill" />
          <span className="app-boot-skeleton__sk app-boot-skeleton__round" />
          <span className="app-boot-skeleton__sk app-boot-skeleton__round" />
        </div>
        <div className="app-boot-skeleton__sk app-boot-skeleton__search" />
        <div className="app-boot-skeleton__sk app-boot-skeleton__section" />
        {LIST_ROWS.map(([a, b], i) => (
          <div key={i} className="app-boot-skeleton__row">
            <span className="app-boot-skeleton__sk app-boot-skeleton__avatar" />
            <span className="app-boot-skeleton__lines">
              <i className="app-boot-skeleton__sk" style={{ width: `${a}%` }} />
              <i className="app-boot-skeleton__sk" style={{ width: `${b}%` }} />
            </span>
          </div>
        ))}
      </div>
      <div className="app-boot-skeleton__uvp" aria-hidden="true">
        <span className="app-boot-skeleton__sk app-boot-skeleton__uvp-status" />
        <div className="app-boot-skeleton__uvp-row">
          <span className="app-boot-skeleton__sk app-boot-skeleton__uvp-avatar" />
          <span className="app-boot-skeleton__lines app-boot-skeleton__uvp-lines">
            <i className="app-boot-skeleton__sk" style={{ width: "70%" }} />
            <i className="app-boot-skeleton__sk" style={{ width: "48%" }} />
          </span>
          <span className="app-boot-skeleton__sk app-boot-skeleton__uvp-btn" />
          <span className="app-boot-skeleton__sk app-boot-skeleton__uvp-btn" />
          <span className="app-boot-skeleton__sk app-boot-skeleton__uvp-btn app-boot-skeleton__uvp-btn--sm" />
        </div>
      </div>
      <div className="app-boot-skeleton__main" aria-hidden="true">
        <div className="app-boot-skeleton__head">
          <span className="app-boot-skeleton__sk app-boot-skeleton__pill" style={{ width: 168 }} />
          <span className="app-boot-skeleton__sk app-boot-skeleton__pill" style={{ width: 246 }} />
        </div>
        <div className="app-boot-skeleton__main-body">
          {BUBBLES.map(([side, w, h], i) => (
            <div key={i} className={`app-boot-skeleton__bubble-row is-${side}`}>
              {side === "in" ? <span className="app-boot-skeleton__sk app-boot-skeleton__bubble-avatar" /> : null}
              <span className="app-boot-skeleton__sk app-boot-skeleton__bubble" style={{ width: `${w}%`, height: h }} />
            </div>
          ))}
        </div>
        <div className="app-boot-skeleton__sk app-boot-skeleton__composer" />
      </div>
      <p className="app-boot-skeleton__label">{label}</p>
    </div>
  );
}
