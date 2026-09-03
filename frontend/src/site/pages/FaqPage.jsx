import { Link } from "react-router-dom";
import { useT } from "../../context/localeContextInstance";
import { FAQ_ITEMS, FAQ_GROUPS } from "../faqData";
import JsonLd, { buildFaqLd } from "../JsonLd";
import { useMarketingHref } from "../useMarketingHref";

export default function FaqPage() {
  const t = useT();
  const href = useMarketingHref();
  return (
    <>
      <JsonLd data={buildFaqLd(FAQ_ITEMS)} />
      <section className="mkt-section" style={{ marginTop: 12 }}>
        <h1>{t("FAQ")}</h1>
        <p className="lead">
          {t("Frequently asked questions about Descall — accounts, desktop download, calls, screen share, and privacy.")}
        </p>
        {FAQ_GROUPS.map((group) => (
          <div className="mkt-faq-group" key={group.id}>
            <h2>{t(group.title)}</h2>
            <div className="mkt-faq">
              {group.items.map((item) => (
                <details key={item.q}>
                  <summary>{t(item.q)}</summary>
                  <p>{t(item.a)}</p>
                </details>
              ))}
            </div>
          </div>
        ))}
        <div className="mkt-cta-row" style={{ marginTop: 24 }}>
          <Link to={href("/contact")} className="mkt-btn mkt-btn-soft">
            {t("Contact")}
          </Link>
        </div>
      </section>
    </>
  );
}
