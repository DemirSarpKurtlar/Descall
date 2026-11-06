import { Link } from "react-router-dom";
import { useT } from "../../context/localeContextInstance";
import { useMarketingHref } from "../useMarketingHref";

export default function NotFoundPage() {
  const t = useT();
  const href = useMarketingHref();
  return (
    <section className="mkt-404">
      <h1>{t("This page doesn’t exist")}</h1>
      <p className="lead">{t("The link may be outdated or mistyped. Go back home or check the service status.")}</p>
      <div className="mkt-cta-row">
        <Link to={href("/")} className="mkt-btn mkt-btn-primary">
          {t("Home")}
        </Link>
        <Link to={href("/status")} className="mkt-btn mkt-btn-ghost">
          {t("Status")}
        </Link>
      </div>
    </section>
  );
}
