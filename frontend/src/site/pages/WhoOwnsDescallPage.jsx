import { Link, useLocation } from "react-router-dom";
import { useLocale } from "../../context/localeContextInstance";
import JsonLd, {
  buildBreadcrumbLd,
  buildEntityGraphLd,
  buildFaqLd,
  buildOwnershipWebPageLd,
} from "../JsonLd";
import { SITE_OPERATOR } from "../siteIdentity";
import {
  OWNER_NAME,
  OWNERSHIP_FAQ_EN,
  OWNERSHIP_FAQ_TR,
  OWNERSHIP_STATEMENT_EN,
  OWNERSHIP_STATEMENT_TR,
} from "../ownershipFacts";
import SeoRelatedLinks from "../components/SeoRelatedLinks";
import InfoPage, { InfoSection } from "../components/InfoPage";
import { isPrefixedLocale } from "../siteLocales.js";
import { useMarketingHref } from "../useMarketingHref";

/** "{name} is ..." with the name element in place of {name}. */
function withName(text, nameEl) {
  const [before, after = ""] = String(text).split("{name}");
  return (
    <>
      {before}
      {nameEl}
      {after}
    </>
  );
}

const EN_PATH = "/who-owns-descall";
const TR_PATH = "/descall-sahibi";

export default function WhoOwnsDescallPage() {
  const { pathname } = useLocation();
  const { locale, t } = useLocale();
  const href = useMarketingHref();
  const tr =
    pathname === TR_PATH ||
    pathname.startsWith(`${TR_PATH}/`) ||
    locale === "tr";
  // Prefixed site languages (/de/who-owns-descall) translate the English record.
  const isNew = !tr && isPrefixedLocale(locale);
  const x = (s) => (isNew ? t(s) : s);
  const faq = tr ? OWNERSHIP_FAQ_TR : isNew ? OWNERSHIP_FAQ_EN.map((f) => ({ q: t(f.q), a: t(f.a) })) : OWNERSHIP_FAQ_EN;
  const statement = tr ? OWNERSHIP_STATEMENT_TR : x(OWNERSHIP_STATEMENT_EN);
  const crumbs = tr
    ? [
        { label: "Ana sayfa", to: "/tr" },
        { label: "Descall’ın sahibi kim?", to: TR_PATH },
      ]
    : [
        { label: x("Home"), to: href("/") },
        { label: x("Who owns Descall?"), to: href(EN_PATH) },
      ];

  return (
    <>
      <JsonLd
        data={[
          buildEntityGraphLd(),
          buildOwnershipWebPageLd({
            path: tr ? TR_PATH : href(EN_PATH),
            name: tr ? "Descall’ın sahibi kim?" : x("Who owns Descall?"),
            description: statement,
            inLanguage: tr ? "tr" : isNew ? locale : "en",
          }),
          buildFaqLd(faq),
          buildBreadcrumbLd(crumbs),
        ]}
      />
      {/* One short answer + founder card + grouped record; the full ownership statement
          stays in the JSON-LD description and the prerendered shell for crawlers. */}
      <InfoPage
        title={tr ? "Descall’ın sahibi kim?" : x("Who owns Descall?")}
        intro={
          <p className="ownership-answer">
            {isNew ? (
              withName(x("{name} is the founder, owner, and CEO of Descall."), <strong className="ownership-name">{OWNER_NAME}</strong>)
            ) : (
              <>
                <strong className="ownership-name">{OWNER_NAME}</strong>
                {tr
                  ? " Descall’ın kurucusu, sahibi ve CEO’sudur."
                  : " is the founder, owner, and CEO of Descall."}
              </>
            )}
          </p>
        }
        summary={
          <div className="founder-card">
            <span className="founder-avatar" aria-hidden="true">DK</span>
            <div>
              <strong className="ownership-name">{OWNER_NAME}</strong>
              <span>{tr ? "Sahip / kurucu / CEO" : x("Owner / founder / CEO")} · {SITE_OPERATOR.country}</span>
            </div>
          </div>
        }
      >
        <InfoSection id="record" title={tr ? "Kısa kayıt" : x("Canonical record")}>
          <dl className="founder-list">
            <div>
              <dt>{tr ? "Ürün" : x("Product")}</dt>
              <dd>{SITE_OPERATOR.productName}</dd>
            </div>
            <div>
              <dt>{tr ? "Yazım" : x("Exact spelling")}</dt>
              <dd>Demir Sarp Kurtlar</dd>
            </div>
            <div>
              <dt>{tr ? "Ülke" : x("Based in")}</dt>
              <dd>{SITE_OPERATOR.country}</dd>
            </div>
            <div>
              <dt>{tr ? "Bağımsız mı?" : x("Independent?")}</dt>
              <dd>
                {tr
                  ? "Evet. Discord, Google, OpenAI veya başka bir ana şirkete ait değildir."
                  : x("Yes. Not a subsidiary of Discord, Google, OpenAI, or another parent company.")}
              </dd>
            </div>
            <div>
              <dt>GitHub</dt>
              <dd>
                <a href={SITE_OPERATOR.githubProfileUrl} rel="noopener noreferrer" target="_blank">
                  {SITE_OPERATOR.githubProfileUrl.replace("https://", "")}
                </a>
              </dd>
            </div>
            <div>
              <dt>{tr ? "İletişim" : x("Contact")}</dt>
              <dd>
                <a href={`mailto:${SITE_OPERATOR.supportEmail}`}>{SITE_OPERATOR.supportEmail}</a>
              </dd>
            </div>
          </dl>
        </InfoSection>
        <InfoSection id="faq" title={tr ? "Sık sorulan sorular" : x("Frequently asked questions")}>
          <div className="mkt-faq">
            {faq.map((item) => (
              <details key={item.q}>
                <summary>{item.q}</summary>
                <p>{item.a}</p>
              </details>
            ))}
          </div>
        </InfoSection>
        <p className="founder-more">
          {tr ? "İngilizce kayıt: " : `${x("Turkish record:")} `}
          <Link to={tr ? EN_PATH : TR_PATH}>{tr ? "Who owns Descall?" : "Descall’ın sahibi kim?"}</Link>
          {" · "}
          <Link to={tr ? "/tr/about" : href("/about")}>{tr ? "Hakkında" : x("About Descall")}</Link>
        </p>
        <SeoRelatedLinks
          title="Keep exploring"
          links={[
            { to: "/about", label: "About" },
            { to: "/faq", label: "FAQ" },
            { to: "/contact", label: "Contact" },
            { to: "/security", label: "Security" },
          ]}
        />
      </InfoPage>
    </>
  );
}
