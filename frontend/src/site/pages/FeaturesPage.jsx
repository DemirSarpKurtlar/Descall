import { Link } from "react-router-dom";
import {
  IconMessage,
  IconMic,
  IconVideo,
  IconUsers,
  IconMonitor,
  IconShield,
  IconGamepad,
  IconSparkles,
  IconServer,
  IconLayers,
  IconHash,
  IconScroll,
} from "../icons";
import { useT } from "../../context/localeContextInstance";
import { useMarketingHref } from "../useMarketingHref";
import JsonLd, { buildBreadcrumbLd, buildSoftwareApplicationLd } from "../JsonLd";
import SeoRelatedLinks from "../components/SeoRelatedLinks";
import { SEO_DEFAULT_RELATED } from "../seoHubLinks";

const FEATURES = [
  {
    icon: IconServer,
    tone: "blue",
    title: "Servers & channels",
    desc: "Full server structure with categories, text, voice, and stage channels — topics, slowmode, and NSFW flags included.",
  },
  {
    icon: IconShield,
    tone: "violet",
    title: "Roles & permissions",
    desc: "Role hierarchy with hoist/mention, plus per-channel allow/deny overrides for staff rooms, announcements, and VIP spaces.",
  },
  {
    icon: IconLayers,
    tone: "teal",
    title: "Templates that ship ready",
    desc: "Gaming, Community, Study, Friends, and Streaming templates with roles and staff rooms preconfigured.",
  },
  {
    icon: IconMessage,
    tone: "sky",
    title: "Real-time messaging",
    desc: "DMs and server chat with typing indicators, reactions, replies, and media — without Nitro walls on core chat.",
  },
  {
    icon: IconMic,
    tone: "green",
    title: "Voice chat",
    desc: "WebRTC voice for DMs, groups, and server lobbies with noise controls when you need them.",
  },
  {
    icon: IconVideo,
    tone: "pink",
    title: "HD video calls",
    desc: "Group video for hangouts, watch parties, and squad briefings — browser or desktop.",
  },
  {
    icon: IconMonitor,
    tone: "orange",
    title: "Screen share quality",
    desc: "Share games, VODs, or docs with quality presets tuned for smooth capture while you play.",
  },
  {
    icon: IconGamepad,
    tone: "red",
    title: "LFG",
    desc: "Create and join ranked LFG lobbies, share party codes.",
    to: "/discord-alternative-for-lfg",
  },
  {
    icon: IconUsers,
    tone: "sky",
    title: "Friends & presence",
    desc: "Friend requests, online presence, and quick invites so your squad can jump into chat or voice.",
  },
  {
    icon: IconHash,
    tone: "slate",
    title: "Moderation tools",
    desc: "Kick, ban, timeout, audit logs, and community rules for servers that need staff workflows.",
  },
  {
    icon: IconScroll,
    tone: "blue",
    title: "Desktop & Android",
    desc: "Windows installer plus Android builds — or use the full web app in the browser.",
  },
  {
    icon: IconSparkles,
    tone: "orange",
    title: "Optional cosmetics",
    desc: "DesCoin cosmetics stay optional. Chat, servers, voice, and screen share remain free.",
  },
];

const crumbs = [
  { label: "Home", to: "/" },
  { label: "Features", to: "/features" },
];

export default function FeaturesPage() {
  const t = useT();
  const href = useMarketingHref();
  return (
    <>
      <JsonLd data={[buildBreadcrumbLd(crumbs), buildSoftwareApplicationLd()]} />
      <section className="mkt-section seo-features" style={{ marginTop: 12 }}>
        <div className="mkt-kicker">{t("Product")}</div>
        <h1 className="seo-page-h1">{t("Features of a modern Discord alternative")}</h1>
        <p className="lead">
          {t(
            "Servers with roles and channels, messaging, calls, screen share, and LFG — everything friend groups and communities need, without turning your PC into a second operating system."
          )}
        </p>
        <div className="mkt-feature-grid">
          {FEATURES.map((f) => {
            const body = (
              <>
              <div className={`mkt-icon is-${f.tone}`}>
                <f.icon size={20} />
              </div>
              <h2 className="mkt-feature-title">{t(f.title)}</h2>
              <p>{t(f.desc)}</p>
              </>
            );
            return f.to ? (
              <Link key={f.title} to={href(f.to)} className="mkt-feature mkt-feature-link">
                {body}
              </Link>
            ) : (
              <article key={f.title} className="mkt-feature">
                {body}
              </article>
            );
          })}
        </div>
        <div className="mkt-cta-row" style={{ marginTop: 28 }}>
          <Link to={href("/download")} className="mkt-btn mkt-btn-primary">
            {t("Download")}
          </Link>
          <Link to="/discord-alternative" className="mkt-btn mkt-btn-soft">
            {t("Discord alternative")}
          </Link>
          <Link to={href("/faq")} className="mkt-btn mkt-btn-ghost">
            {t("FAQ")}
          </Link>
        </div>
        <SeoRelatedLinks title="Explore by use case" links={SEO_DEFAULT_RELATED} />
      </section>
    </>
  );
}
