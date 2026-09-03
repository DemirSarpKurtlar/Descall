import { Link } from "react-router-dom";
import { IconSparkles, IconMessage, IconLayers, IconShield } from "../icons";
import { useT } from "../../context/localeContextInstance";
import JsonLd, { buildBreadcrumbLd, buildSoftwareApplicationLd } from "../JsonLd";
import SeoRelatedLinks from "../components/SeoRelatedLinks";
import { SEO_DEFAULT_RELATED } from "../seoHubLinks";
import { Funnel } from "../analytics";
import { useMarketingHref } from "../useMarketingHref";

const crumbs = [
  { label: "Home", to: "/" },
  { label: "DimaAI", to: "/dimaai" },
];

const MODELS = [
  {
    name: "Dima 1.1 Fast",
    blurb: "Quick answers for chat, drafts, and everyday questions.",
  },
  {
    name: "Dima 1.2 Thinking",
    blurb: "Slower, stronger reasoning when the problem needs a second look.",
  },
  {
    name: "Dima 1.3 Deep",
    blurb: "Long analysis and max quality for research-style prompts.",
  },
];

const HIGHLIGHTS = [
  {
    icon: IconMessage,
    title: "ChatGPT-style threads",
    desc: "A clean conversation view with markdown, code, and stop — inside Descall, not another tab.",
  },
  {
    icon: IconLayers,
    title: "Pick the model for the job",
    desc: "Fast for quick asks, Thinking for harder problems, Deep when you want maximum quality.",
  },
  {
    icon: IconShield,
    title: "Stays with your squad",
    desc: "Jump from a server or DM into Dima without leaving the app. Sign in once — chat, voice, and AI together.",
  },
];

export default function DimaAiLandingPage({ onSignIn, onSignUp }) {
  const t = useT();
  const href = useMarketingHref();
  const openRegister = () => {
    Funnel.ctaClick({ page: "/dimaai", placement: "dima_hero", label: "start_free", intent: "register" });
    (onSignUp || onSignIn)?.({ mode: "register", source: "dimaai_landing" });
  };

  return (
    <>
      <JsonLd data={[buildBreadcrumbLd(crumbs), buildSoftwareApplicationLd()]} />
      <section className="mkt-dima-hero">
        <div>
          <div className="mkt-kicker">
            <IconSparkles size={14} /> DimaAI
          </div>
          <h1>{t("Ask Dima anything")}</h1>
          <p className="lead" style={{ marginBottom: 24 }}>
            {t(
              "A ChatGPT-style assistant built into Descall — Fast, Thinking, and Deep models for writing, explaining, and brainstorming with your squad."
            )}
          </p>
          <div className="mkt-cta-row">
            <button type="button" className="mkt-btn mkt-btn-primary" onClick={openRegister}>
              {t("Start free")}
            </button>
            <Link to={href("/download")} className="mkt-btn mkt-btn-ghost">
              {t("Download")}
            </Link>
          </div>
        </div>
        <div className="mkt-dima-panel" aria-hidden>
          <h3>Dima 1.2 Thinking</h3>
          <div className="mkt-dima-line is-user" />
          <div className="mkt-dima-line is-ai" />
          <div className="mkt-dima-line is-ai" style={{ width: "54%" }} />
          <div className="mkt-dima-line is-user" style={{ width: "36%" }} />
          <div className="mkt-dima-line is-ai" style={{ width: "68%" }} />
        </div>
      </section>

      <section className="mkt-section">
        <h2>{t("Three modes, one assistant")}</h2>
        <p className="lead">{t("Choose speed or depth without leaving the conversation.")}</p>
        <div className="mkt-feature-grid">
          {MODELS.map((m) => (
            <article key={m.name} className="mkt-feature">
              <div className="mkt-icon">
                <IconSparkles size={18} />
              </div>
              <h3>{t(m.name)}</h3>
              <p>{t(m.blurb)}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mkt-section">
        <h2>{t("Why Dima lives in Descall")}</h2>
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
          <button type="button" className="mkt-btn mkt-btn-primary" onClick={openRegister}>
            {t("Create free account")}
          </button>
          <Link to={href("/features")} className="mkt-btn mkt-btn-soft">
            {t("See all features")}
          </Link>
        </div>
      </section>
      <SeoRelatedLinks title={t("Keep exploring")} links={SEO_DEFAULT_RELATED} />
    </>
  );
}
