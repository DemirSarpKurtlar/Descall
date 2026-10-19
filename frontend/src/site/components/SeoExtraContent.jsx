import { Link, useLocation } from "react-router-dom";
import { PAGE_EXTRAS } from "../seo/pageExtras";
import { useLocale } from "../../context/localeContextInstance";

/** Long-form copy shared with the prerendered shell (see seo/pageExtras.js). */
export default function SeoExtraContent({ path, collapsible = false, showLinks = true }) {
  const { t } = useLocale();
  const { pathname } = useLocation();
  const key = path || (pathname || "/").replace(/\/+$/, "") || "/";
  const extra = PAGE_EXTRAS[key];
  if (!extra) return null;
  const body = (
    <>
      {extra.sections.map((s) => (
        <div key={s.h} className="seo-section">
          <h2>{s.h}</h2>
          {s.p.map((p) => (
            <p key={p.slice(0, 40)}>{p}</p>
          ))}
          {s.list?.length > 0 && (
            <ul className="mkt-plain-list">
              {s.list.map((li) => (
                <li key={li}>{li}</li>
              ))}
            </ul>
          )}
        </div>
      ))}
      {showLinks && extra.links?.length > 0 && (
        <ul className="seo-link-list">
          {extra.links.map((l) => (
            <li key={l.to}>
              <Link to={l.to}>{l.label}</Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
  if (collapsible) {
    return (
      <section className="mkt-section mkt-prose seo-extra">
        <details className="seo-extra-more">
          <summary>{t("More about Descall")}</summary>
          {body}
        </details>
      </section>
    );
  }
  return <section className="mkt-section mkt-prose seo-extra">{body}</section>;
}
