import { t } from "../../i18n/runtime";
import "../../styles/boot-skeleton.css";

/**
 * Boot error (2.11.5): /auth/me never answered and there is no cached session.
 * Same aurora + mark as RouteLoadingScreen, no progress bar, a short Turkish /
 * English message and one action: "Tekrar dene" re-runs the session check.
 */
export default function BootErrorScreen({ onRetry } = {}) {
  const logo = `${import.meta.env.BASE_URL || "/"}brand/descall-icon.png`;
  return (
    <div className="route-loading route-loading--error" role="alert" data-boot-error="1">
      <div className="route-loading__aurora" aria-hidden="true" />
      <div className="route-loading__card">
        <img className="route-loading__logo" src={logo} alt="" width={88} height={88} />
        <p className="route-loading__label">{t("Descall could not start")}</p>
        <p className="route-loading__detail">
          {t("The server did not answer in time. Check your connection and try again.")}
        </p>
        <button type="button" className="route-loading__retry" onClick={() => onRetry?.()}>
          {t("Boot retry")}
        </button>
      </div>
    </div>
  );
}
