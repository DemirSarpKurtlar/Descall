import { Link, useLocation } from "react-router-dom";
import { localizedPageExtras, numberedSteps } from "../seo/pageExtras";

function Paragraph({ text }) {
  const n = numberedSteps(text);
  if (!n) return <p>{text}</p>;
  return (
    <>
      <ol className="seo-numbered">
        {n.steps.map((step) => (
          <li key={step.slice(0, 40)}>{step}</li>
        ))}
      </ol>
      {n.after ? <p>{n.after}</p> : null}
    </>
  );
}
import { useLocale } from "../../context/localeContextInstance";
import { marketingHref } from "../useMarketingHref";

/** Long-form copy shared with the prerendered shell (see seo/pageExtras.js). */
/** layout="split": heading left, copy right on wide screens (download page). */
export default function SeoExtraContent({ path, collapsible = false, showLinks = true, layout = "" }) {
  const { t, locale } = useLocale();
  const { pathname } = useLocation();
  const key = path || (pathname || "/").replace(/\/+$/, "") || "/";
  // English and Turkish entries render as written; /de/... reuses the English entry
  // translated through t() (the site catalog) with links to the /de twins.
  const found = localizedPageExtras(key, {
    text: (s) => t(s),
    href: (to) => marketingHref(to, { locale, pathname }),
  });
  if (!found) return null;
  const { extra } = found;
  const body = (
    <>
      {extra.sections.map((s) => (
        <div key={s.h} className="seo-section">
          <h2>{s.h}</h2>
          <div className="seo-section-body">
          {s.p.map((p) => (
            <Paragraph key={p.slice(0, 40)} text={p} />
          ))}
          {s.list?.length > 0 && (
            <ul className="mkt-plain-list">
              {s.list.map((li) => (
                <li key={li}>{li}</li>
              ))}
            </ul>
          )}
          </div>
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
  return <section className={`mkt-section mkt-prose seo-extra${layout === "split" ? " is-split" : ""}`}>{body}</section>;
}
