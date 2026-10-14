import { Link } from "react-router-dom";
import { useT } from "../../context/localeContextInstance";
import { useMarketingHref } from "../useMarketingHref";

function Chevron() {
  return (
    <svg className="seo-pill-chevron" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
      <path d="m9 18 6-6-6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Cluster-aware internal linking, glass chips, not a bullet list. */
export default function SeoRelatedLinks({ title = "Keep exploring", links = [] }) {
  const t = useT();
  const href = useMarketingHref();
  if (!links?.length) return null;
  return (
    <section className="seo-section seo-related" aria-label={t(title)}>
      <h2>{t(title)}</h2>
      <ul className="seo-pills">
        {links.map((item) => (
          <li key={item.to}>
            <Link to={href(item.to)}>
              {t(item.label)}
              <Chevron />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
