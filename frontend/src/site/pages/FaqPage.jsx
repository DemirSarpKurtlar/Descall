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
      <JsonLd data={buildFaqLd(FAQ_ITEMS.map((item) => ({ q: t(item.q), a: t(item.a) })))} />
      <section className="mkt-faq-layout">
        <aside className="mkt-faq-nav">
          <h1>{t("FAQ")}</h1>
          <p className="lead">
            {t("Accounts, the Windows and Android downloads, calls, screen share, and what we store.")}
          </p>
          <nav className="mkt-faq-jump" aria-label={t("FAQ")}>
            {FAQ_GROUPS.map((group) => (
              <a key={group.id} href={`#faq-${group.id}`}>
                {t(group.title)}
                <span>{group.items.length}</span>
              </a>
            ))}
          </nav>
          <Link to={href("/contact")} className="mkt-btn mkt-btn-soft">
            {t("Contact")}
          </Link>
        </aside>
        <div>
          {FAQ_GROUPS.map((group) => (
            <div className="mkt-faq-group" id={`faq-${group.id}`} key={group.id}>
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
        </div>
      </section>
    </>
  );
}
