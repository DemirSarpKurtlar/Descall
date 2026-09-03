import { Link } from "react-router-dom";
import { useT } from "../../context/localeContextInstance";
import { useMarketingHref } from "../useMarketingHref";

/** Cluster-aware internal linking block — keeps crawl depth low. */
export default function SeoRelatedLinks({ title = "Keep exploring", links = [] }) {
  const t = useT();
  const href = useMarketingHref();
  if (!links?.length) return null;
  return (
    <section className="seo-section seo-related" aria-label={t(title)}>
      <h2>{t(title)}</h2>
      <ul className="seo-link-list">
        {links.map((item) => (
          <li key={item.to}>
            <Link to={href(item.to)}>{t(item.label)}</Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
