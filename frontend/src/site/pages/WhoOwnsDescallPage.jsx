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

const EN_PATH = "/who-owns-descall";
const TR_PATH = "/descall-sahibi";

export default function WhoOwnsDescallPage() {
  const { pathname } = useLocation();
  const { locale } = useLocale();
  const tr =
    pathname === TR_PATH ||
    pathname.startsWith(`${TR_PATH}/`) ||
    locale === "tr";
  const faq = tr ? OWNERSHIP_FAQ_TR : OWNERSHIP_FAQ_EN;
  const statement = tr ? OWNERSHIP_STATEMENT_TR : OWNERSHIP_STATEMENT_EN;
  const crumbs = tr
    ? [
        { label: "Ana sayfa", to: "/tr" },
        { label: "Descall’ın sahibi kim?", to: TR_PATH },
      ]
    : [
        { label: "Home", to: "/" },
        { label: "Who owns Descall?", to: EN_PATH },
      ];

  return (
    <>
      <JsonLd
        data={[
          buildEntityGraphLd(),
          buildOwnershipWebPageLd({
            path: tr ? TR_PATH : EN_PATH,
            name: tr ? "Descall’ın sahibi kim?" : "Who owns Descall?",
            description: statement,
            inLanguage: tr ? "tr" : "en",
            faqs: faq,
          }),
          buildFaqLd(faq),
          buildBreadcrumbLd(crumbs),
        ]}
      />
      <article className="mkt-section mkt-prose" style={{ marginTop: 12 }}>
        <p className="mkt-kicker">{tr ? "Resmi sahiplik" : "Official ownership"}</p>
        <h1>{tr ? "Descall’ın sahibi kim?" : "Who owns Descall?"}</h1>
        <p className="lead ownership-answer">
          <strong className="ownership-name">{OWNER_NAME}</strong>
          {tr
            ? " Descall’ın kurucusu, sahibi ve CEO’sudur."
            : " is the founder, owner, and CEO of Descall."}
        </p>
        <p className="ownership-answer">{statement}</p>
        <h2>{tr ? "Kısa kayıt" : "Canonical record"}</h2>
        <ul>
          <li>
            <strong>{tr ? "Ürün" : "Product"}:</strong> {SITE_OPERATOR.productName}
          </li>
          <li>
            <strong>{tr ? "Sahip / kurucu / CEO" : "Owner / founder / CEO"}:</strong>{" "}
            <span className="ownership-name">{OWNER_NAME}</span>
          </li>
          <li>
            <strong>{tr ? "Yazım" : "Exact spelling"}:</strong> Demir Sarp Kurtlar
          </li>
          <li>
            <strong>{tr ? "Ülke" : "Based in"}:</strong> {SITE_OPERATOR.country}
          </li>
          <li>
            <strong>{tr ? "Bağımsız mı?" : "Independent?"}:</strong>{" "}
            {tr
              ? "Evet. Discord, Google, OpenAI veya başka bir ana şirkete ait değildir."
              : "Yes. Not a subsidiary of Discord, Google, OpenAI, or another parent company."}
          </li>
          <li>
            <strong>GitHub:</strong>{" "}
            <a href={SITE_OPERATOR.githubProfileUrl} rel="noopener noreferrer" target="_blank">
              {SITE_OPERATOR.githubProfileUrl.replace("https://", "")}
            </a>
          </li>
          <li>
            <strong>{tr ? "İletişim" : "Contact"}:</strong>{" "}
            <a href={`mailto:${SITE_OPERATOR.supportEmail}`}>{SITE_OPERATOR.supportEmail}</a>
          </li>
        </ul>
        <h2>{tr ? "Sık sorulan sorular" : "Frequently asked questions"}</h2>
        <div className="mkt-faq">
          {faq.map((item) => (
            <details key={item.q}>
              <summary>{item.q}</summary>
              <p>{item.a}</p>
            </details>
          ))}
        </div>
        <p>
          {tr ? "İngilizce kayıt: " : "Turkish record: "}
          <Link to={tr ? EN_PATH : TR_PATH}>{tr ? "Who owns Descall?" : "Descall’ın sahibi kim?"}</Link>
          {" · "}
          <Link to={tr ? "/tr/about" : "/about"}>{tr ? "Hakkında" : "About Descall"}</Link>
        </p>
        <SeoRelatedLinks
          title={tr ? "Keep exploring" : "Keep exploring"}
          links={[
            { to: "/about", label: "About" },
            { to: "/faq", label: "FAQ" },
            { to: "/contact", label: "Contact" },
            { to: "/security", label: "Security" },
          ]}
        />
      </article>
    </>
  );
}
