import { Link } from "react-router-dom";
import SeoLandingShell from "../components/SeoLandingShell";
import SeoRelatedLinks from "../components/SeoRelatedLinks";
import SeoExtraContent from "../components/SeoExtraContent";
import { buildBreadcrumbLd, buildFaqLd } from "../JsonLd";
import { ALTERNATIVES_FAQ } from "../content/discordSeoContent";
import { useT } from "../../context/localeContextInstance";
import { useMirrorCopy } from "../useMirrorCopy";

const crumbs = [
  { label: "Home", to: "/" },
  { label: "Alternatives", to: "/alternatives" },
];

const OPTIONS = [
  {
    name: "Descall",
    blurb:
      "Best free Discord alternative for friend groups: chat, voice, video, screen share, Windows + Android.",
    href: "/discord-alternative",
    highlight: true,
  },
  {
    name: "Discord",
    blurb:
      "Still the default for huge communities and bots. Heavy for small groups that only need calls and a small server.",
    href: "/compare/discord",
    highlight: false,
  },
  {
    name: "Guilded",
    blurb:
      "Servers + calendars with a gaming tilt. More structure than friend DMs need; Descall stays lighter for daily voice.",
    href: "/best-discord-alternative-for-gamers",
    highlight: false,
  },
  {
    name: "TeamSpeak / Mumble",
    blurb: "Voice-first classics. Weak for modern chat, presence, and mobile.",
    href: "/best-discord-alternative-for-gamers",
    highlight: false,
  },
  {
    name: "Telegram",
    blurb:
      "Great messengers and channels. Not a drop-in Discord alternative for persistent group voice + screen share habits.",
    href: "/discord-alternative",
    highlight: false,
  },
  {
    name: "Slack",
    blurb:
      "Work-first chat. Huddles exist, but gamers looking for a Discord alternative usually want evenings, not tickets.",
    href: "/compare/discord",
    highlight: false,
  },
];

export default function AlternativesPage() {
  const t = useT();
  // Links to the blog / niche twins once a locale serves them (identity on en and tr).
  const mirror = useMirrorCopy();
  return (
    <SeoLandingShell
      breadcrumbs={crumbs}
      kicker={t("Discord alternatives · 2026")}
      title={t("Discord alternatives compared, pick by what you actually need")}
      lead={t(
        "Searching for Discord alternatives? Most lists recycle the same voice apps. Here’s a clearer take, and why Descall wins for friends, servers, and free core chat/calls."
      )}
      faq={ALTERNATIVES_FAQ}
      jsonLd={[buildBreadcrumbLd(crumbs), buildFaqLd(ALTERNATIVES_FAQ)]}
      primaryCta={
        <Link to="/discord-alternative" className="mkt-btn mkt-btn-primary">
          {t("Why Descall")}
        </Link>
      }
      secondaryCta={
        <Link to="/download" className="mkt-btn mkt-btn-ghost">
          {t("Download")}
        </Link>
      }
    >
      <section className="seo-section">
        <h2>{t("How to choose a Discord alternative")}</h2>
        <p>
          {t(
            "Start with your real job-to-be-done: friend DMs, group voice, screen share, or a gaming server. If you need mega-servers and bot ecosystems, Discord still leads. If you want a lighter Discord alternative that keeps communication free, Descall is built for you."
          )}
        </p>
        <ol className="seo-steps">
          <li>{t("List must-have features (voice, screen share, servers, mobile).")}</li>
          <li>{t("Check whether core chat/calls are free or paywalled.")}</li>
          <li>{t("Try a week with your actual friend group, not a demo account.")}</li>
          <li>{t("Keep Discord only if you still need giant community servers.")}</li>
        </ol>
      </section>

      <section className="seo-section">
        <h2>{t("Top Discord alternatives compared")}</h2>
        <div className="seo-option-grid">
          {OPTIONS.map((opt) => (
            <article key={opt.name} className={`seo-option${opt.highlight ? " is-highlight" : ""}`}>
              <h3>{opt.name}</h3>
              <p>{t(opt.blurb)}</p>
              <Link to={mirror.href(opt.href)}>{t("Learn more")}</Link>
            </article>
          ))}
        </div>
      </section>

      <section className="seo-section">
        <h2>{t("Deep dives")}</h2>
        <ul className="seo-link-list">
          <li>
            <Link to="/compare/discord">{t("Descall vs Discord")}</Link>
          </li>
          <li>
            <Link to={mirror.href("/best-discord-alternative-for-gamers")}>{t("Best for gamers")}</Link>
          </li>
          <li>
            <Link to="/tr/discord-alternatifi">{t("Türkiye / Turkish")}</Link>
          </li>
          <li>
            <Link to={mirror.href("/blog/leave-nitro-keep-voice-chat")}>{t("Leave Nitro guide")}</Link>
          </li>
        </ul>
      </section>
      <SeoExtraContent showLinks={false} />
      <SeoRelatedLinks
        title="Related comparisons"
        links={[
          { to: "/discord-alternative", label: "Free Discord alternative" },
          { to: "/compare/discord", label: "Discord vs Descall" },
          { to: "/apps-like-discord", label: "Apps like Discord" },
          { to: "/discord-replacement", label: "Discord replacement" },
          { to: "/tr/discord-alternatifi", label: "Discord alternatifi (TR)" },
          { to: "/download", label: "Download" },
        ]}
      />
    </SeoLandingShell>
  );
}
