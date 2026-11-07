import { useLocation } from "react-router-dom";
import { useLocale } from "../../context/localeContextInstance";
import { localizedMergedGuide } from "../seo/mergedGuides";

/**
 * Sections of the blog post that was merged into this page (seo/mergedGuides.js), in the
 * page language. Same markup as SeoExtraContent; the prerender prints the same text.
 */
export default function MergedGuideSections() {
  const { t } = useLocale();
  const { pathname } = useLocation();
  const path = (pathname || "/").replace(/\/+$/, "") || "/";
  const sections = localizedMergedGuide(path, (s) => t(s));
  if (!sections) return null;
  return (
    <section className="mkt-section mkt-prose seo-extra">
      {sections.map((s) => (
        <div key={s.h} className="seo-section">
          <h2>{s.h}</h2>
          <div className="seo-section-body">
            <p>{s.p}</p>
          </div>
        </div>
      ))}
    </section>
  );
}
