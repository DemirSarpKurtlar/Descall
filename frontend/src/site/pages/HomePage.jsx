import SeoExtraContent from "../components/SeoExtraContent";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useLocale } from "../../context/localeContextInstance";
import { Funnel, getFeatureFlag, getFeatureFlagPayload } from "../analytics";
import { useMarketingHref } from "../useMarketingHref";
import { useMirrorCopy } from "../useMirrorCopy";
import JsonLd, { buildEntityGraphLd } from "../JsonLd";
import SeoProductPreview from "../components/SeoProductPreview";
import { APP_STORE_URL } from "../appStoreLink";
import { useIsAppleMobile } from "../useIsAppleMobile";
import { useDocumentMarker } from "../../hooks/useDocumentMarker";
import ProductFrame from "../components/ProductFrame";
import { IconAndroid, IconApple, IconBrowser, IconWindows } from "../icons";

export default function HomePage({ onSignIn, onSignUp }) {
  useDocumentMarker("has-mkt-hh"); // was body:has(.mkt-hh), see lib/documentMarker.js
  const { t, locale } = useLocale();
  const href = useMarketingHref();
  // Links to the niche twins once a locale serves them (identity on en and tr).
  const mirror = useMirrorCopy();
  const openRegister = onSignUp || onSignIn;
  const appleMobile = useIsAppleMobile();
  const [heroVariant, setHeroVariant] = useState("control");
  const [heroPayload, setHeroPayload] = useState(null);

  useEffect(() => {
    const variant = getFeatureFlag("hero_cta_variant", "control");
    const payload = getFeatureFlagPayload("hero_cta_variant", null);
    setHeroVariant(typeof variant === "string" ? variant : "control");
    setHeroPayload(payload && typeof payload === "object" ? payload : null);
    Funnel.landingView({ page: "home", path: "/", hero_cta_variant: variant });
  }, []);

  const trackCta = (placement, label) => {
    Funnel.ctaClick({
      page: "home",
      placement,
      label,
      intent: "register",
      hero_cta_variant: heroVariant,
    });
  };

  const useExperimentCopy = locale === "en" && heroPayload && typeof heroPayload === "object";
  const heroCtaLabel = useExperimentCopy && heroPayload.cta ? String(heroPayload.cta) : t("Start free");

  return (
    <>
      <JsonLd data={[buildEntityGraphLd()]} />
      <section className="mkt-hh" aria-labelledby="mkt-hh-title">
        <div className="mkt-hh-copy">
          <h1 id="mkt-hh-title">{t("Talk together")}</h1>
          <p className="mkt-hh-lead">
            {useExperimentCopy && heroPayload.sub ? (
              String(heroPayload.sub)
            ) : (
              <>
                <span className="mkt-hh-lead-long">
                  {t("Voice chat, screen sharing, and servers with your friends. One account on iPhone, Android, Windows, and the browser.")}
                </span>
                <span className="mkt-hh-lead-short">{t("Voice chat, screen sharing, and servers.")}</span>
              </>
            )}
          </p>
          <div className="mkt-hh-cta">
            <button
              type="button"
              className="mkt-hh-btn is-primary"
              onClick={() => {
                trackCta("hero", "start_free");
                openRegister?.({ mode: "register", source: "home_hero" });
              }}
            >
              {heroCtaLabel}
            </button>
            {appleMobile ? (
              <a
                href={APP_STORE_URL}
                className="mkt-hh-btn is-secondary"
                rel="noopener noreferrer"
                onClick={() => Funnel.ctaClick({ page: "home", placement: "hero", label: "app_store", intent: "download" })}
              >
                <IconApple size={18} />
                {t("Download on the App Store")}
              </a>
            ) : (
              <Link
                to={href("/download")}
                className="mkt-hh-btn is-secondary"
                onClick={() => Funnel.ctaClick({ page: "home", placement: "hero", label: "download", intent: "download" })}
              >
                <IconWindows size={18} />
                {t("Download the desktop app")}
              </Link>
            )}
          </div>
          <ul className="mkt-hh-platforms" aria-label={t("Platforms")}>
            <li><IconApple size={16} />iPhone</li>
            <li><IconAndroid size={16} />Android</li>
            <li><IconWindows size={16} />Windows</li>
            <li><IconBrowser size={16} />Web</li>
          </ul>
        </div>
        <ProductFrame kind="chats" priority alt={t("Descall chat, with servers and a voice channel in the same window")} />
      </section>

      <section className="mkt-shot-row mkt-hh-second">
        <ProductFrame kind="dm" alt={t("A direct message with a poll on Descall")} />
        <div className="mkt-shot-copy">
          <h2>{t("Voice next to the chat")}</h2>
          <p>
            {t("Join a voice channel from the server list. Share your screen at 720p. iPhone, Android, Windows, and the browser use one account.")}
          </p>
          <div className="mkt-cta-row" style={{ marginTop: 24 }}>
            <button
              type="button"
              className="mkt-btn mkt-btn-primary"
              onClick={() => {
                trackCta("mid_page", "start_free");
                openRegister?.({ mode: "register", source: "home_mid" });
              }}
            >
              {t("Create free account")}
            </button>
            <Link to={href("/compare/discord")} className="mkt-btn mkt-btn-ghost">
              {t("Compare with Discord")}
            </Link>
          </div>
        </div>
      </section>

      <section className="mkt-section">
        <div className="mkt-servers-panel">
          <div>
            <h2>{t("Servers with roles and channels")}</h2>
            <p className="lead">
              {t(
                "Start from a template or an empty server. Templates include text channels, voice channels, and roles such as Admin, Moderator, and Member."
              )}
            </p>
            <ul className="mkt-plain-list">
              <li>{t("Announcements, squad-up, and staff channels are already in the templates.")}</li>
              <li>{t("Staff can kick, ban, timeout, and read an audit log.")}</li>
              <li>{t("Voice channels sit beside the text channels.")}</li>
            </ul>
            <div className="mkt-cta-row" style={{ marginTop: 24 }}>
              <Link to={href("/features")} className="mkt-btn mkt-btn-primary">
                {t("Explore server features")}
              </Link>
              <Link to={mirror.href("/discord-alternative-for-communities")} className="mkt-btn mkt-btn-ghost">
                {t("For communities")}
              </Link>
            </div>
          </div>
          <SeoProductPreview
            mode="servers"
            frame="flat"
            caption={t("Server list with text and voice channels")}
          />
        </div>
      </section>

      <SeoExtraContent collapsible showLinks={false} />
    </>
  );
}
