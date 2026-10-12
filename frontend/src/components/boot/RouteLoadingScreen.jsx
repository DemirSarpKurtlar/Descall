import { t } from "../../i18n/runtime";
import "../../styles/boot-skeleton.css";

/**
 * Full-screen route and boot loader: glass aurora, the Descall mark, a short
 * progress bar, and the locale's "Loading" string (Yükleniyor in Turkish).
 */
export default function RouteLoadingScreen({ label } = {}) {
  const text = label || t("Loading");
  const logo = `${import.meta.env.BASE_URL || "/"}brand/descall-icon.png`;
  return (
    <div className="route-loading" role="status" aria-busy="true" aria-label={text}>
      <div className="route-loading__aurora" aria-hidden="true" />
      <div className="route-loading__card">
        <img className="route-loading__logo" src={logo} alt="" width={88} height={88} />
        <div className="route-loading__bar" aria-hidden="true">
          <i />
        </div>
        <p className="route-loading__label">{text}</p>
      </div>
    </div>
  );
}
