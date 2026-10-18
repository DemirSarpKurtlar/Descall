import { t } from "../../i18n/runtime";
import "../../styles/boot-skeleton.css";

/**
 * Boot error (2.11.5): /auth/me never answered and there is no cached session.
 * Same aurora + mark as RouteLoadingScreen, no progress bar, a short Turkish /
 * English message and one action: "Tekrar dene" re-runs the session check.
 */
export default function BootErrorScreen({ onRetry } = {}) {
  const base = import.meta.env.BASE_URL || "/";
  // 2.11.14: same glass tile + wordmark as the splash error state
  // (spec splash-header-2026-10-18 §3.2, splash-error.png).
  return (
    <div className="route-loading route-loading--error" role="alert" data-boot-error="1">
      <div className="route-loading__aurora" aria-hidden="true" />
      <div className="route-loading__card">
        <span className="route-loading__tile" aria-hidden="true">
          <span className="route-loading__tile-spec" />
          <img src={`${base}brand/descall-symbol-gradient.svg`} alt="" width={64} height={64} />
        </span>
        <img className="route-loading__wordmark" src={`${base}brand/descall-wordmark-white.svg`} alt="Descall" width={121} height={28} />
        <p className="route-loading__label">{t("Descall could not start")}</p>
        <p className="route-loading__detail">
          {t("The server did not answer in time. Check your connection and try again.")}
        </p>
        <button type="button" className="route-loading__retry" onClick={() => onRetry?.()} autoFocus>
          {t("Boot retry")}
        </button>
      </div>
    </div>
  );
}
