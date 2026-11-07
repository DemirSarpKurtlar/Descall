import { Link } from "react-router-dom";
import { useT } from "../../context/localeContextInstance";
import { useMarketingHref } from "../useMarketingHref";
import JsonLd, { buildBreadcrumbLd } from "../JsonLd";
import SeoRelatedLinks from "../components/SeoRelatedLinks";
import SeoProductPreview from "../components/SeoProductPreview";
import { SEO_DEFAULT_RELATED } from "../seoHubLinks";
import { FEATURE_GROUPS as GROUPS } from "../seo/featureGroups.js";

const crumbs = [
  { label: "Home", to: "/" },
  { label: "Features", to: "/features" },
];

export default function FeaturesPage() {
  const t = useT();
  const href = useMarketingHref();
  return (
    <>
      <JsonLd data={[buildBreadcrumbLd(crumbs)]} />
      <section className="mkt-section seo-features">
        <h1 className="seo-page-h1">{t("Features of a modern Discord alternative")}</h1>
        <p className="lead">
          {t("Servers, direct messages, voice, and screen share. Chat and calls stay free.")}
        </p>
        {GROUPS.map((group) => (
          <div className={`mkt-shot-row${group.flip ? " is-flip" : ""}`} key={group.title}>
            <SeoProductPreview mode={group.mode} frame="flat" caption={t(group.caption)} />
            <div className="mkt-shot-copy">
              <h2>{t(group.title)}</h2>
              <ul className="mkt-plain-list">
                {group.items.map((item) => (
                  <li key={item}>{t(item)}</li>
                ))}
              </ul>
            </div>
          </div>
        ))}
        <div className="mkt-cta-row" style={{ marginTop: 28 }}>
          <Link to={href("/download")} className="mkt-btn mkt-btn-primary">
            {t("Download")}
          </Link>
          <Link to={href("/discord-alternative")} className="mkt-btn mkt-btn-soft">
            {t("Discord alternative")}
          </Link>
          <Link to={href("/faq")} className="mkt-btn mkt-btn-ghost">
            {t("FAQ")}
          </Link>
        </div>
        <SeoRelatedLinks title="Explore by use case" links={SEO_DEFAULT_RELATED} />
      </section>
    </>
  );
}
