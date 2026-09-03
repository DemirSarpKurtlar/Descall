import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  IconMessage,
  IconMic,
  IconMonitor,
  IconServer,
  IconShield,
  IconLayers,
  IconHash,
} from "../icons";
import { useLocale } from "../../context/localeContextInstance";
import { Funnel, getFeatureFlag, getFeatureFlagPayload } from "../analytics";
import { useMarketingHref } from "../useMarketingHref";
import JsonLd, { buildEntityGraphLd } from "../JsonLd";
import SeoRelatedLinks from "../components/SeoRelatedLinks";
import SeoProductPreview from "../components/SeoProductPreview";
import { SEO_DEFAULT_RELATED } from "../seoHubLinks";

const HIGHLIGHTS = [
  {
    icon: IconServer,
    title: "Servers & channels",
    desc: "Text, voice, and stage channels with categories — a lighter home for real communities",
  },
  {
    icon: IconShield,
    title: "Roles & permissions",
    desc: "Role hierarchy, staff rooms, and per-channel overrides ready for real communities",
  },
  {
    icon: IconLayers,
    title: "Advanced templates",
    desc: "Gaming, Valorant, friends, community, study & streaming — roles and channels pre-built",
  },
  {
    icon: IconMessage,
    title: "Real-time Chat",
    desc: "DMs that feel instant — typing, replies, and media without a Nitro wall",
  },
  {
    icon: IconMic,
    title: "Voice & video",
    desc: "Crystal-clear group and server calls",
  },
  {
    icon: IconMonitor,
    title: "Screen share",
    desc: "Share your screen in calls with quality presets",
  },
];

const SERVER_POINTS = [
  {
    icon: IconHash,
    title: "Channels that match the job",
    desc: "Announcements, LFG, clips, VIP lounges, staff ops — topics and slowmode included in templates.",
  },
  {
    icon: IconShield,
    title: "Roles that actually work",
    desc: "Admin, Moderator, Helper, VIP and more — with kick, ban, timeout, and audit logs.",
  },
  {
    icon: IconMic,
    title: "Voice built into the server",
    desc: "Lobby, scrim, focus, and stage rooms so your crew can hop in without leaving the app.",
  },
];

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
          <div className="mkt-kicker">
            <span className="mkt-header-beta">{t("Beta")}</span>
            {" · "}
            {t("Voice")} · {t("Servers")} · DimaAI
          </div>
          <h1>{t("Talk together")}</h1>
          <p>
            {useExperimentCopy && heroPayload.sub
              ? String(heroPayload.sub)
              : (
                <>
                  {t(
                    "A lighter home for friends and squads — real servers, HD calls, DimaAI, and"
                  )}{" "}
                  <Link to="/discord-alternative-for-lfg">{t("Valorant LFG")}</Link>.
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
            <Link
              to={href("/dimaai")}
              className="mkt-btn mkt-btn-ghost"
              onClick={() => Funnel.ctaClick({ page: "home", placement: "hero", label: "dimaai", intent: "seo" })}
            >
              DimaAI
            </Link>
          </div>
        </div>
        <SeoProductPreview
          mode="chat"
          caption={t("Descall UI — servers, chat, voice, and LFG in one app")}
        />
      </section>

      <section className="mkt-section">
        <h2>{t("Why Choose Descall?")}</h2>
        <p className="lead">
          {t("Servers, chat, calls, and DimaAI in one quieter app — built for friends, gamers, and communities.")}
        </p>
        <div className="mkt-feature-grid">
          {HIGHLIGHTS.map((item) => (
            <article key={item.title} className="mkt-feature">
              <div className="mkt-icon">
                <item.icon size={20} />
              </div>
              <h3>{t(item.title)}</h3>
              <p>{t(item.desc)}</p>
            </article>
          ))}
        </div>
        <div className="mkt-cta-row" style={{ marginTop: "1.75rem" }}>
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
          <Link to={href("/features")} className="mkt-btn mkt-btn-soft">
            {t("See all features")}
          </Link>
        </div>
      </section>

      <section className="mkt-section">
        <h2>{t("Servers ready to run")}</h2>
        <p className="lead">
          {t(
            "Create a server from scratch or pick an advanced template. Roles, text & voice channels, and permission overrides come fully prepared."
          )}
        </p>
        <div className="mkt-feature-grid">
          {SERVER_POINTS.map((item) => (
            <article key={item.title} className="mkt-feature">
              <div className="mkt-icon">
                <item.icon size={20} />
              </div>
              <h3>{t(item.title)}</h3>
              <p>{t(item.desc)}</p>
            </article>
          ))}
        </div>
        <div className="mkt-cta-row" style={{ marginTop: "1.75rem" }}>
          <Link to={href("/features")} className="mkt-btn mkt-btn-primary">
            {t("Explore server features")}
          </Link>
          <Link to="/discord-alternative-for-communities" className="mkt-btn mkt-btn-ghost">
            {t("For communities")}
          </Link>
        </div>
      </section>
      <SeoRelatedLinks title="Keep exploring" links={SEO_DEFAULT_RELATED} />
    </>
  );
}
