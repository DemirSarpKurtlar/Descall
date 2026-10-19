import SeoExtraContent from "../components/SeoExtraContent";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useLocale } from "../../context/localeContextInstance";
import { Funnel, getFeatureFlag, getFeatureFlagPayload } from "../analytics";
import { useMarketingHref } from "../useMarketingHref";
import JsonLd, { buildEntityGraphLd } from "../JsonLd";
import SeoRelatedLinks from "../components/SeoRelatedLinks";
import SeoProductPreview from "../components/SeoProductPreview";
import { SEO_DEFAULT_RELATED } from "../seoHubLinks";

export default function HomePage({ onSignIn, onSignUp }) {
  const { t, locale } = useLocale();
  const href = useMarketingHref();
  const openRegister = onSignUp || onSignIn;
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

  const useExperimentCopy = locale !== "tr" && heroPayload && typeof heroPayload === "object";
  const heroCtaLabel = useExperimentCopy && heroPayload.cta ? String(heroPayload.cta) : t("Start free");

  return (
    <>
      <JsonLd data={[buildEntityGraphLd()]} />
      <section className="mkt-hero-split">
        <div className="mkt-hero-copy">
          <h1>{t("Talk together")}</h1>
          <p>
            {useExperimentCopy && heroPayload.sub
              ? String(heroPayload.sub)
              : (
                <>
                  {t("Group voice, video, and screen share. Servers with text and voice channels for your whole crew.")}
                </>
              )}
          </p>
          <div className="mkt-cta-row">
            <button
              type="button"
              className="mkt-btn mkt-btn-primary"
              onClick={() => {
                trackCta("hero", "start_free");
                openRegister?.({ mode: "register", source: "home_hero" });
              }}
            >
              {heroCtaLabel}
            </button>
            <Link
              to={href("/download")}
              className="mkt-btn mkt-btn-soft"
              onClick={() => Funnel.ctaClick({ page: "home", placement: "hero", label: "download", intent: "download" })}
            >
              {t("Download")} {t("Desktop")}
            </Link>
          </div>
        </div>
        <SeoProductPreview
          mode="chat"
          frame="tilt"
          chips
          priority
          chipScreen={t("Screen share")}
          chipVoice={t("Voice · Lobby")}
          caption={t("Descall chat, with servers and a voice channel in the same window")}
        />
      </section>

      <section className="mkt-shot-row">
        <SeoProductPreview
          mode="call"
          frame="flat"
          caption={t("A server voice channel with the people already in the call")}
        />
        <div className="mkt-shot-copy">
          <h2>{t("Voice next to the chat")}</h2>
          <p>
            {t("Join a voice channel from the server list. Share your screen at 720p. Windows, Android, and the browser use one account.")}
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
              <Link to="/discord-alternative-for-communities" className="mkt-btn mkt-btn-ghost">
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

      <SeoExtraContent />
      <SeoRelatedLinks title="Keep exploring" links={SEO_DEFAULT_RELATED} />
    </>
  );
}
