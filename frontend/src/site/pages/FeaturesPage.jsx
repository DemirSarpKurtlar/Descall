import { Link } from "react-router-dom";
import { useT } from "../../context/localeContextInstance";
import { useMarketingHref } from "../useMarketingHref";
import JsonLd, { buildBreadcrumbLd, buildSoftwareApplicationLd } from "../JsonLd";
import SeoRelatedLinks from "../components/SeoRelatedLinks";
import SeoProductPreview from "../components/SeoProductPreview";
import { SEO_DEFAULT_RELATED } from "../seoHubLinks";

const GROUPS = [
  {
    mode: "servers",
    title: "Servers with roles and channels",
    caption: "Server list with text and voice channels",
    items: [
      "Full server structure with categories, text, voice, and stage channels, topics, slowmode, and NSFW flags included.",
      "Role hierarchy with hoist/mention, plus per-channel allow/deny overrides for staff rooms, announcements, and VIP spaces.",
      "Gaming, Community, Study, Friends, and Streaming templates with roles and staff rooms preconfigured.",
      "Kick, ban, timeout, audit logs, and community rules for servers that need staff workflows.",
    ],
  },
  {
    mode: "call",
    title: "Voice, video, and screen share",
    caption: "A server voice channel with the people already in the call",
    flip: true,
    items: [
      "WebRTC voice for DMs, groups, and server lobbies with noise controls when you need them.",
      "Group video for hangouts, watch parties, and squad briefings, browser or desktop.",
      "Share games, VODs, or docs with quality presets tuned for smooth capture while you play.",
      "DMs and server chat with typing indicators, reactions, replies, and media, without Nitro walls on core chat.",
    ],
  },
  {
    mode: "lfg",
    title: "Friends and LFG",
    caption: "Friends list, ready for a lobby or a call",
    items: [
      "Create and join ranked LFG lobbies, share party codes.",
      "Friend requests, online presence, and quick invites so your squad can jump into chat or voice.",
      "Windows installer plus Android builds, or use the full web app in the browser.",
      "DesCoin cosmetics stay optional. Chat, servers, voice, and screen share remain free.",
    ],
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
        <h1 className="seo-page-h1">{t("Features of a modern Discord alternative")}</h1>
        <p className="lead">
          {t("Servers, direct messages, voice, screen share, and LFG. Chat and calls stay free.")}
        </p>
        {GROUPS.map((group) => (
          <div className={`mkt-shot-row${group.flip ? " is-flip" : ""}`} key={group.title}>
            <SeoProductPreview mode={group.mode} frame="flat" caption={t(group.caption)} />
            <div className="mkt-shot-copy">
              <h2>{t(group.title)}</h2>
              <ul className="mkt-plain-list">
                {group.items.map((item) => (
                  <li key={item}>{t(item)}</li>
                ))}
              </ul>
            </div>
          </div>
        ))}
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
