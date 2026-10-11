import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  IconDownload,
  IconMonitor,
  IconSmartphone,
  IconSparkles,
  IconShield,
  IconGlobe,
  IconMessage,
  IconMic,
  IconVideo,
  IconUsers,
  IconCheck,
  IconGithub,
  IconStar,
  IconZap,
} from "../icons";
import { fetchLatestDesktopRelease } from "../../lib/githubRelease";
import { formatReleaseLabel } from "../../lib/releaseVersion";
import { DESKTOP_RELEASE_FALLBACK } from "../../lib/desktopRelease";
import { useT } from "../../context/localeContextInstance";
import JsonLd, { buildBreadcrumbLd, buildSoftwareApplicationLd } from "../JsonLd";
import SeoRelatedLinks from "../components/SeoRelatedLinks";
import { SEO_PILLARS } from "../seoHubLinks";
import { Funnel } from "../analytics";
import { signalMarketingEngage } from "../analyticsGate";
import { useMarketingHref } from "../useMarketingHref";

const GITHUB_REPO = "DemirSarpKurtlar/Descall";
const FALLBACK_WINDOWS_URL = DESKTOP_RELEASE_FALLBACK.windowsDownloadUrl;
const ANDROID_RELEASES_PAGE_URL = `https://github.com/${GITHUB_REPO}/releases/latest`;

const FEATURES = [
  { icon: IconMessage, title: "Real-time Chat", desc: "Instant messaging with typing indicators" },
  { icon: IconMic, title: "Voice Messages", desc: "Crystal clear voice recordings" },
  { icon: IconVideo, title: "Video Calls", desc: "HD video calling with screen share" },
  { icon: IconUsers, title: "Group Chats", desc: "Create groups with unlimited members" },
];

function AppStoreBadge({ label }) {
  const url = import.meta.env.VITE_APP_STORE_URL;
  if (!url) return null;
  return (
    <a className="mkt-app-store" href={url} rel="noopener noreferrer" title={label}>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path
          fill="#fff"
          d="M16.37 1.43c0 1.14-.49 2.27-1.18 3.08-.74.9-1.99 1.57-2.99 1.57-.12 0-.23-.02-.3-.03-.01-.06-.04-.22-.04-.39 0-1.15.57-2.27 1.21-2.98.8-.94 2.14-1.64 3.25-1.68.03.13.05.28.05.43zm4.56 15.71c-.03.07-.46 1.58-1.52 3.12-.94 1.34-1.94 2.71-3.43 2.71-1.52 0-1.9-.88-3.63-.88-1.7 0-2.3.91-3.67.91-1.38 0-2.33-1.26-3.43-2.8C4.97 18.38 3.93 15.57 3.93 12.92c0-4.28 2.8-6.55 5.55-6.55 1.45 0 2.68.95 3.6.95.87 0 2.22-1.01 3.9-1.01.61 0 2.89.06 4.37 2.19-.13.09-2.38 1.37-2.38 4.19 0 3.26 2.85 4.42 2.96 4.45z"
        />
      </svg>
      <span>
        <small>Download on the</small>
        <strong>App Store</strong>
      </span>
    </a>
  );
}

const crumbs = [
  { label: "Home", to: "/" },
  { label: "Download", to: "/download" },
];

/**
 * Marketing download page — same mkt-* chrome as Home / Features.
 */
export default function MarketingDownloadPage({ onOpenRegister, onSignIn }) {
  const t = useT();
  const href = useMarketingHref();
  const [selectedPlatform, setSelectedPlatform] = useState("windows");
  const [loading, setLoading] = useState(true);
  const [releaseLabel, setReleaseLabel] = useState("");
  const [windowsUrl, setWindowsUrl] = useState(FALLBACK_WINDOWS_URL);
  const [androidUrl, setAndroidUrl] = useState(null);

  useEffect(() => {
    const ua = navigator.userAgent.toLowerCase();
    if (ua.includes("android")) setSelectedPlatform("android");
    else if (ua.includes("win")) setSelectedPlatform("windows");

    let cancelled = false;
    (async () => {
      try {
        const data = await fetchLatestDesktopRelease();
        if (cancelled) return;
        const win =
          data.windowsDownloadUrl && !/portable/i.test(data.windowsDownloadUrl)
            ? data.windowsDownloadUrl
            : FALLBACK_WINDOWS_URL;
        setWindowsUrl(win);
        setAndroidUrl(data.androidDownloadUrl || null);
        setReleaseLabel(formatReleaseLabel(data.tagName) || "");
      } catch {
        if (!cancelled) setWindowsUrl(FALLBACK_WINDOWS_URL);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const downloadUrl =
    selectedPlatform === "android"
      ? androidUrl || ANDROID_RELEASES_PAGE_URL
      : windowsUrl || FALLBACK_WINDOWS_URL;

  const versionLine = loading
    ? t("Checking for updates…")
    : releaseLabel
      ? t("{label} available", { label: releaseLabel })
      : t("Latest release");

  const openAuth = () => {
    signalMarketingEngage({ source: "download", intent: "register" });
    Funnel.ctaClick({ page: "/download", placement: "download_hero", label: "start_free", intent: "register" });
    (onOpenRegister || onSignIn)?.({ mode: "register", source: "download" });
  };

  const trackDownload = () => {
    Funnel.ctaClick({
      page: "/download",
      placement: "download_primary",
      label: selectedPlatform,
      intent: "download",
    });
  };

  return (
    <>
      <JsonLd data={[buildBreadcrumbLd(crumbs), buildSoftwareApplicationLd()]} />

      <section className="mkt-hero-split mkt-download-hero">
        <div className="mkt-hero-copy">
          <div className="mkt-kicker">
            <IconSparkles size={14} />
            {t("Download")}
            {" · "}
            {versionLine}
          </div>
          <h1>{t("Download Descall")}</h1>
          <p>
            {t("Windows installer plus Android builds — or use the full web app in the browser.")}
          </p>
          <div className="mkt-cta-row">
            <a
              className="mkt-btn mkt-btn-primary"
              href={downloadUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={trackDownload}
            >
              <IconDownload size={18} />
              {selectedPlatform === "android" ? t("Download APK") : t("Download for Windows")}
            </a>
            <button type="button" className="mkt-btn mkt-btn-soft" onClick={openAuth}>
              {t("Start free")}
            </button>
            <Link to={href("/")} className="mkt-btn mkt-btn-ghost">
              {t("Open the web app")}
            </Link>
          </div>
        </div>

        <div className="mkt-download-panel">
          <p className="mkt-download-panel-kicker">{t("Platform")}</p>
          <div className="mkt-download-platforms" role="tablist" aria-label={t("Platform")}>
            <button
              type="button"
              role="tab"
              aria-selected={selectedPlatform === "windows"}
              className={`mkt-download-platform${selectedPlatform === "windows" ? " is-active" : ""}`}
              onClick={() => setSelectedPlatform("windows")}
            >
              <IconMonitor size={20} />
              <strong>Windows</strong>
              <span>Descall-Setup.exe</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={selectedPlatform === "android"}
              className={`mkt-download-platform${selectedPlatform === "android" ? " is-active" : ""}`}
              onClick={() => setSelectedPlatform("android")}
            >
              <IconSmartphone size={20} />
              <strong>Android</strong>
              <span>Descall-APK.apk</span>
            </button>
          </div>
          <p className="mkt-download-panel-meta">{versionLine}</p>
          <AppStoreBadge label={t("Download on the App Store")} />
        </div>
      </section>

      <ul className="mkt-download-trust">
        <li>
          <span>
            <IconShield size={16} /> TLS
          </span>
        </li>
        <li>
          <span>
            <IconZap size={16} /> {t("Free")}
          </span>
        </li>
        <li>
          <Link to={href("/")}>
            <IconGlobe size={16} /> Web
          </Link>
        </li>
        <li>
          <button type="button" onClick={() => setSelectedPlatform("windows")}>
            <IconMonitor size={16} /> Windows
          </button>
        </li>
        <li>
          <button type="button" onClick={() => setSelectedPlatform("android")}>
            <IconSmartphone size={16} /> Android
          </button>
        </li>
        <li>
          <a href={`https://github.com/${GITHUB_REPO}`} rel="noopener noreferrer" target="_blank">
            <IconGithub size={16} /> GitHub
          </a>
        </li>
        <li>
          <span>
            <IconStar size={16} /> {t("Beta")}
          </span>
        </li>
      </ul>

      <section className="mkt-section">
        <h2>{t("Why Choose Descall?")}</h2>
        <p className="lead">
          {t("Servers, chat, calls, and screen share in one quieter app — built for friends, gamers, and communities.")}
        </p>
        <div className="mkt-feature-grid">
          {FEATURES.map((f) => {
            const Icon = f.icon;
            return (
              <article className="mkt-feature" key={f.title}>
                <div className="mkt-icon">
                  <Icon size={20} />
                </div>
                <h3>{t(f.title)}</h3>
                <p>{t(f.desc)}</p>
              </article>
            );
          })}
        </div>
        <ul className="seo-checklist mkt-download-checklist">
          <li>
            <IconCheck size={16} /> {t("No Nitro paywall on core chat & calls")}
          </li>
          <li>
            <IconCheck size={16} />
            <span>
              {t("Servers, roles, channels, and")}{" "}
              <Link to={href("/discord-alternative-for-lfg")}>{t("LFG")}</Link>
            </span>
          </li>
          <li>
            <IconCheck size={16} />
            <Link to={href("/discord-alternative")}>{t("Discord alternative")}</Link>
          </li>
        </ul>
        <div className="mkt-cta-row" style={{ marginTop: 28 }}>
          <a
            className="mkt-btn mkt-btn-primary"
            href={downloadUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={trackDownload}
          >
            <IconDownload size={18} />
            {selectedPlatform === "android" ? t("Download APK") : t("Download for Windows")}
          </a>
          <Link to={href("/features")} className="mkt-btn mkt-btn-soft">
            {t("See all features")}
          </Link>
        </div>
      </section>

      <SeoRelatedLinks title="Keep exploring" links={SEO_PILLARS} />
    </>
  );
}
