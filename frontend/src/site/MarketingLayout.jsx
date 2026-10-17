import { useState, useEffect } from "react";
import { NavLink, Link, useLocation, useNavigate } from "react-router-dom";
import { useLocale, useT } from "../context/localeContextInstance";
import { Funnel } from "./analytics";
import { signalMarketingEngage } from "./analyticsGate";
import { SITE_OPERATOR } from "./siteIdentity";
import { isTrPath, withTrPrefix, stripLocalePrefix, TR_MIRROR_PATHS, enPathForHreflang, isTurkishMarketingPath, trDestinationForPath } from "./localePaths";
import EmailCapture from "./components/EmailCapture";
import "./site.css";
import "./glass-public.css";
import "./glass-public-frames.css";

function IconMenu() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function IconDownload() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 4v11m0 0-4-4m4 4 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 19h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function IconClose() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

const NAV = [
  { to: "/features", label: "Features" },
  { to: "/download", label: "Download" },
  { to: "/faq", label: "FAQ" },
];

/** Turkish header adds the Turkish hubs (they have no EN twin). */
const NAV_TR_EXTRA = [
  { to: "/tr/discord-alternatifi", label: "Discord alternatifi" },
  { to: "/tr/blog", label: "Blog" },
];

/** Turkish hubs in the footer "Explore" column. */
const TR_FOOTER_HUBS = [
  { to: "/tr/discord-alternatifi", label: "Discord alternatifi" },
  { to: "/tr/discord-alternatifleri", label: "Discord alternatifleri" },
  { to: "/tr/discord-acildi-mi", label: "Discord açıldı mı?" },
  { to: "/tr/turk-discord", label: "Türk Discord’u" },
  { to: "/tr/discord-yerine-ne-kullanilir", label: "Discord yerine ne kullanılır?" },
  { to: "/tr/sesli-sohbet-uygulamasi", label: "Sesli sohbet uygulaması" },
  { to: "/tr/oyuncu-sohbet-uygulamasi", label: "Oyuncu sohbet uygulaması" },
  { to: "/tr/compare/discord", label: "Discord mu Descall mı?" },
  { to: "/tr/blog", label: "Blog" },
];

export default function MarketingLayout({ children, onSignIn, onSignUp }) {
  const t = useT();
  const { locale, setLocale } = useLocale();
  const location = useLocation();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const pathIsTr = isTrPath(location.pathname);
  const useTrUrls = pathIsTr || locale === "tr";
  const L = (to) => {
    const bare = stripLocalePrefix(to);
    if (useTrUrls && TR_MIRROR_PATHS.includes(bare)) return withTrPrefix(bare);
    return to;
  };

  // Turkish URL → Turkish locale. Do not include `locale` in deps:
  // clicking EN used to race (still on /tr) and force Turkish back on.
  useEffect(() => {
    if (isTurkishMarketingPath(location.pathname)) setLocale("tr");
  }, [location.pathname, setLocale]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (locale !== "tr") return;
    if (isTurkishMarketingPath(location.pathname)) return;
    const dest = trDestinationForPath(location.pathname);
    if (dest && dest !== location.pathname) {
      navigate(dest + location.search, { replace: true });
    }
  }, [locale, location.pathname, location.search, navigate]);

  const closeMenu = () => setMenuOpen(false);
  const openRegister = () => {
    signalMarketingEngage({ source: "header", intent: "register" });
    Funnel.ctaClick({ page: "nav", placement: "header", label: "start_free", intent: "register" });
    (onSignUp || onSignIn)?.({ mode: "register", source: "header" });
  };
  const openLogin = () => {
    signalMarketingEngage({ source: "header", intent: "login" });
    Funnel.ctaClick({ page: "nav", placement: "header", label: "sign_in", intent: "login" });
    onSignIn?.({ mode: "login", source: "header" });
  };

  const switchLocale = (next) => {
    setLocale(next);
    if (next === "tr") {
      const dest = trDestinationForPath(location.pathname);
      if (dest && dest !== location.pathname) navigate(dest + location.search);
      return;
    }
    navigate(enPathForHreflang(location.pathname) + location.search);
  };

  const nav = (
    <nav
      id="marketing-navigation"
      className={`mkt-nav${menuOpen ? " is-open" : ""}`}
      aria-label={t("Primary navigation")}
    >
      {(useTrUrls ? [...NAV, ...NAV_TR_EXTRA] : NAV).map((item) => (
        <NavLink
          key={item.to}
          to={L(item.to)}
          onClick={closeMenu}
          className={() =>
            stripLocalePrefix(location.pathname) === item.to || location.pathname === item.to
              ? "mkt-nav-link is-active"
              : "mkt-nav-link"
          }
        >
          {t(item.label)}
        </NavLink>
      ))}
      <button
        type="button"
        className="mkt-mobile-download mkt-btn mkt-btn-ghost"
        onClick={() => {
          closeMenu();
          openLogin();
        }}
      >
        {t("Sign In")}
      </button>
      <button
        type="button"
        className="mkt-mobile-download mkt-btn mkt-btn-primary"
        onClick={() => {
          closeMenu();
          openRegister();
        }}
      >
        {t("Start free")}
      </button>
      <Link to={L("/download")} onClick={closeMenu} className="mkt-mobile-download">
        {t("Download")}
      </Link>
      <div className="mkt-mobile-language">
        <span>{t("Language")}</span>
        <LanguageToggle locale={locale} onSwitch={switchLocale} />
      </div>
    </nav>
  );

  return (
    <div className={`mkt${menuOpen ? " is-menu-open" : ""}`}>
      <div className="mkt-bg" aria-hidden>
        <div className="mkt-orb mkt-orb-a" />
        <div className="mkt-orb mkt-orb-b" />
        <div className="mkt-grid" />
      </div>

      <header className={`mkt-header${scrolled ? " is-scrolled" : ""}`}>
        <Link to={L("/")} className="mkt-brand" aria-label="Descall">
          <img
            className="mkt-brand-lockup"
            src={`${import.meta.env.BASE_URL}brand/descall-lockup.svg`}
            alt="Descall"
            height={28}
            decoding="async"
          />
          <span className="mkt-header-beta" title={t(SITE_OPERATOR.statusNote)}>
            {t("Beta")}
          </span>
        </Link>
        {nav}
        <div className="mkt-header-actions">
          <div className="mkt-desktop-language">
            <LanguageToggle locale={locale} onSwitch={switchLocale} />
          </div>
          <button type="button" className="mkt-btn mkt-btn-ghost" onClick={openLogin} aria-label={t("Sign In")}>
            {t("Sign In")}
          </button>
          <button type="button" className="mkt-btn mkt-btn-primary" onClick={openRegister} aria-label={t("Start free")}>
            {t("Start free")}
          </button>
          <Link
            to={L("/download")}
            className="mkt-btn mkt-btn-soft mkt-header-download"
            aria-label={t("Download")}
            title={t("Download")}
          >
            <IconDownload />
          </Link>
          <button
            type="button"
            className="mkt-menu-toggle"
            onClick={() => setMenuOpen((open) => !open)}
            aria-expanded={menuOpen}
            aria-controls="marketing-navigation"
            aria-label={menuOpen ? t("Close menu") : t("Open menu")}
          >
            {menuOpen ? <IconClose /> : <IconMenu />}
          </button>
        </div>
      </header>

      <main className="mkt-main" id="main-content">
        {children}
      </main>

      <footer className="mkt-footer">
        <div className="mkt-footer-brand">
          <div>
            <div className="mkt-footer-lockup-row">
              <img
                className="mkt-brand-lockup"
                src={`${import.meta.env.BASE_URL}brand/descall-lockup.svg`}
                alt="Descall"
                height={22}
                decoding="async"
                loading="lazy"
              />
              <span className="mkt-footer-beta">{t("Beta")}</span>
            </div>
            <p className="mkt-footer-operator">
              {SITE_OPERATOR.operatorName} · {SITE_OPERATOR.country}
            </p>
          </div>
        </div>
        <div className="mkt-footer-grid">
          <section className="mkt-footer-col">
            <h2>{t("Product")}</h2>
            <Link to={L("/features")}>{t("Features")}</Link>
            <Link to={L("/download")}>{t("Download")}</Link>
            <Link to={L("/faq")}>{t("FAQ")}</Link>
          </section>
          <section className="mkt-footer-col">
            <h2>{t("Explore")}</h2>
            {useTrUrls ? (
              TR_FOOTER_HUBS.map((item) => (
                <Link key={item.to} to={item.to}>
                  {item.label}
                </Link>
              ))
            ) : (
              <>
                <Link to="/discord-alternative">{t("Discord alternative")}</Link>
                <Link to="/discord-alternative-for-lfg">{t("LFG")}</Link>
                <Link to="/compare/discord">{t("vs Discord")}</Link>
                <Link to="/tr/discord-alternatifi">Türkçe: Discord alternatifi</Link>
                <Link to="/blog">{t("Blog")}</Link>
              </>
            )}
            <Link to="/status">{t("Status")}</Link>
            <a href="/sitemap">{t("Sitemap")}</a>
          </section>
          <section className="mkt-footer-col">
            <h2>{t("Company")}</h2>
            <Link to={L("/about")}>{t("About")}</Link>
            <Link to={locale === "tr" ? "/descall-sahibi" : "/who-owns-descall"}>{t("Who owns Descall?")}</Link>
            <Link to={L("/security")}>{t("Security")}</Link>
            <Link to={locale === "tr" || isTurkishMarketingPath(location.pathname) ? "/iletisim" : "/contact"}>
              {t("Contact")}
            </Link>
            <Link to={locale === "tr" || isTurkishMarketingPath(location.pathname) ? "/gizlilik" : "/privacy"}>
              {t("Privacy Policy")}
            </Link>
            <Link to={locale === "tr" || isTurkishMarketingPath(location.pathname) ? "/kosullar" : "/terms"}>
              {t("Terms")}
            </Link>
            <Link to="/copyright">{t("Copyright")}</Link>
            <a href={SITE_OPERATOR.githubUrl} rel="noopener noreferrer" target="_blank">
              GitHub
            </a>
          </section>
        </div>
        <EmailCapture source="footer" />
        <div className="mkt-footer-meta">
          <LanguageToggle locale={locale} onSwitch={switchLocale} />
          <div className="mkt-footer-trust">
            <span className="mkt-trust-chip">
              {t("Status")}: {t("Beta")}
            </span>
            <span className="mkt-trust-chip">
              {t("Transport security")}: TLS / DTLS-SRTP
            </span>
            <Link className="mkt-trust-chip is-link" to="/status">
              {t("Live status")}
            </Link>
            <Link className="mkt-trust-chip is-link" to={L("/security")}>
              {t("Security details")}
            </Link>
          </div>
          <a className="mkt-footer-contact" href={`mailto:${SITE_OPERATOR.supportEmail}`}>
            {SITE_OPERATOR.supportEmail}
          </a>
        </div>
        <p className="mkt-footer-copy">
          © {SITE_OPERATOR.copyrightYear} {SITE_OPERATOR.operatorName}. {t("Descall is owned by Demir Sarp Kurtlar.")}{" "}
          {t("All rights reserved.")} {t("Last updated")}:{" "}
          {locale === "tr" ? SITE_OPERATOR.lastUpdatedLabelTr : SITE_OPERATOR.lastUpdatedLabel}.
        </p>
      </footer>
      <StickyMobileCta onStart={openRegister} downloadTo={L("/download")} />
    </div>
  );
}

function StickyMobileCta({ onStart, downloadTo }) {
  const t = useT();
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const footer = document.querySelector(".mkt-footer");
    if (!footer || typeof IntersectionObserver === "undefined") return undefined;
    const observer = new IntersectionObserver(
      ([entry]) => setHidden(Boolean(entry?.isIntersecting)),
      { threshold: 0.08 }
    );
    observer.observe(footer);
    return () => observer.disconnect();
  }, []);

  return (
    <div className={`mkt-sticky-cta${hidden ? " is-hidden" : ""}`} role="region" aria-label={t("Start free")}>
      <button type="button" className="mkt-btn mkt-btn-primary" onClick={onStart}>
        {t("Start free")}
      </button>
      <Link to={downloadTo} className="mkt-btn mkt-btn-ghost">
        {t("Download")}
      </Link>
    </div>
  );
}

function LanguageToggle({ locale, onSwitch }) {
  const t = useT();
  return (
    <div className="mkt-language-toggle" role="group" aria-label={t("Language")}>
      <button
        type="button"
        className={locale === "tr" ? "is-active" : ""}
        onClick={() => onSwitch("tr")}
        aria-pressed={locale === "tr"}
        aria-label="TR, Türkçe"
      >
        TR
      </button>
      <button
        type="button"
        className={locale === "en" ? "is-active" : ""}
        onClick={() => onSwitch("en")}
        aria-pressed={locale === "en"}
        aria-label="EN, English"
      >
        EN
      </button>
    </div>
  );
}
