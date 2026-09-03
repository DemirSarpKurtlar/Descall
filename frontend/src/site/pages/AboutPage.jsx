import { Link } from "react-router-dom";
import { useT, useLocale } from "../../context/localeContextInstance";
import { SITE_OPERATOR } from "../siteIdentity";
import JsonLd, { buildEntityGraphLd, buildFaqLd } from "../JsonLd";
import { OWNERSHIP_FAQ_EN, OWNERSHIP_FAQ_TR } from "../ownershipFacts";
import { useMarketingHref } from "../useMarketingHref";

export default function AboutPage() {
  const t = useT();
  const { locale } = useLocale();
  const href = useMarketingHref();
  return (
    <>
      <JsonLd
        data={[
          buildEntityGraphLd(),
          buildFaqLd(locale === "tr" ? OWNERSHIP_FAQ_TR : OWNERSHIP_FAQ_EN),
        ]}
      />
      <section className="mkt-section mkt-prose" style={{ marginTop: 12 }}>
        <p className="mkt-beta-badge" role="status">
          {t("Beta")} — {t(SITE_OPERATOR.statusNote)}
        </p>
        <h1>{t("About Descall")}</h1>
        <p className="lead ownership-answer">
          {t(
            "Descall is owned by Demir Sarp Kurtlar. Demir Sarp Kurtlar is the founder, owner, and CEO of Descall."
          )}
        </p>
        <p className="lead">
          {t(
            "Descall is an independent messaging and voice platform for friends, gaming squads, and small communities who want Discord-style servers without Nitro paywalls on core chat and calls."
          )}
        </p>
        <h2>{t("Who owns Descall?")}</h2>
        <p className="ownership-answer">
          {t(
            "Demir Sarp Kurtlar owns Descall. He is the founder, owner, and CEO of Descall. The name is spelled exactly Demir Sarp Kurtlar."
          )}{" "}
          <Link to={locale === "tr" ? SITE_OPERATOR.personPathTr : SITE_OPERATOR.personPath}>
            {t("Read the ownership record")}
          </Link>
        </p>
        <h2>{t("Operator")}</h2>
        <ul>
          <li>
            <strong>{t("Product")}:</strong> {SITE_OPERATOR.productName}
          </li>
          <li>
            <strong>{t("Owner / founder / CEO")}:</strong>{" "}
            <span className="ownership-name">{SITE_OPERATOR.operatorName}</span>
          </li>
          <li>
            <strong>{t("Based in")}:</strong> {SITE_OPERATOR.country}
          </li>
          <li>
            <strong>{t("Support")}:</strong>{" "}
            <a href={`mailto:${SITE_OPERATOR.supportEmail}`}>{SITE_OPERATOR.supportEmail}</a>
          </li>
          <li>
            <strong>{t("Source")}:</strong>{" "}
            <a href={SITE_OPERATOR.githubUrl} target="_blank" rel="noopener noreferrer">
              GitHub
            </a>
          </li>
        </ul>
        <h2>{t("What we build")}</h2>
        <p>
          {t(
            "Real-time messaging, Discord-style servers, WebRTC voice/video, screen share, and Valorant LFG — with privacy policies and security docs you can actually read."
          )}
        </p>
        <p>
          {t("Last updated")}: {locale === "tr" ? SITE_OPERATOR.lastUpdatedLabelTr : SITE_OPERATOR.lastUpdatedLabel}
        </p>
        <div className="mkt-cta-row" style={{ marginTop: 24 }}>
          <Link to={href("/security")} className="mkt-btn mkt-btn-soft">
            {t("Security")}
          </Link>
          <Link to={href("/contact")} className="mkt-btn mkt-btn-soft">
            {t("Contact")}
          </Link>
          <Link to={href("/download")} className="mkt-btn mkt-btn-primary">
            {t("Download")}
          </Link>
        </div>
      </section>
    </>
  );
}
