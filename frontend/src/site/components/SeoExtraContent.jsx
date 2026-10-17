import { Link, useLocation } from "react-router-dom";
import { PAGE_EXTRAS } from "../seo/pageExtras";

/** Long-form copy shared with the prerendered shell (see seo/pageExtras.js). */
export default function SeoExtraContent({ path }) {
  const { pathname } = useLocation();
  const key = path || (pathname || "/").replace(/\/+$/, "") || "/";
  const extra = PAGE_EXTRAS[key];
  if (!extra) return null;
  return (
    <section className="mkt-section mkt-prose seo-extra">
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
      {extra.links?.length > 0 && (
        <ul className="seo-link-list">
          {extra.links.map((l) => (
            <li key={l.to}>
              <Link to={l.to}>{l.label}</Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
