import { useState, useEffect } from "react";
import { NavLink, Link, useLocation, useNavigate } from "react-router-dom";
import { useLocale, useT } from "../context/localeContextInstance";
import { Funnel } from "./analytics";
import { signalMarketingEngage } from "./analyticsGate";
import { SITE_OPERATOR } from "./siteIdentity";
import { isTrPath, withTrPrefix, stripLocalePrefix, TR_MIRROR_PATHS, enPathForHreflang, isTurkishMarketingPath, trDestinationForPath } from "./localePaths";
import EmailCapture from "./components/EmailCapture";
import "./site.css";

function IconMenu() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
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
  { to: "/dimaai", label: "DimaAI" },
  { to: "/download", label: "Download" },
  { to: "/faq", label: "FAQ" },
];

export default function MarketingLayout({ children, onSignIn, onSignUp }) {
  const t = useT();
  const { locale, setLocale } = useLocale();
  const location = useLocation();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
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
      {NAV.map((item) => (
        <NavLink
          key={item.to}
          to={L(item.to)}
          onClick={closeMenu}
          className={() =>
            stripLocalePrefix(location.pathname) === item.to ? "mkt-nav-link is-active" : "mkt-nav-link"
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
    <div className="mkt">
      <div className="mkt-bg" aria-hidden>
        <div className="mkt-orb mkt-orb-a" />
        <div className="mkt-orb mkt-orb-b" />
        <div className="mkt-grid" />
      </div>

      <header className="mkt-header">
        <Link to={L("/")} className="mkt-brand">
          <img src={`${import.meta.env.BASE_URL}brand/descall-icon.jpeg`} alt="" width={32} height={32} decoding="async" />
          <span>Descall</span>
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
          <Link to={L("/download")} className="mkt-btn mkt-btn-soft mkt-header-download">
            {t("Download")}
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
          <img src={`${import.meta.env.BASE_URL}brand/descall-icon.jpeg`} alt="" width={24} height={24} decoding="async" loading="lazy" />
          <div>
            <strong>Descall</strong>
            <span className="mkt-footer-beta">{t("Beta")}</span>
            <p className="mkt-footer-operator">
              {SITE_OPERATOR.operatorName} · {SITE_OPERATOR.country}
            </p>
          </div>
        </div>
        <div className="mkt-footer-grid">
          <section className="mkt-footer-col">
            <h2>{t("Product")}</h2>
            <Link to={L("/features")}>{t("Features")}</Link>
            <Link to={L("/dimaai")}>{t("DimaAI")}</Link>
            <Link to={L("/download")}>{t("Download")}</Link>
            <Link to={L("/faq")}>{t("FAQ")}</Link>
          </section>
          <section className="mkt-footer-col">
            <h2>{t("Explore")}</h2>
            <Link to="/discord-alternative">{t("Discord alternative")}</Link>
            <Link to="/discord-alternative-for-lfg">{t("Valorant LFG")}</Link>
            <Link to={L("/compare/discord")}>{t("vs Discord")}</Link>
            <Link to="/discord-alternative-turkey">{t("Turkey")}</Link>
            <Link to="/blog">{t("Blog")}</Link>
            <Link to="/status">{t("Status")}</Link>
            <a href="/sitemap.html">{t("Sitemap")}</a>
          </section>
          <section className="mkt-footer-col">
            <h2>{t("Company")}</h2>
            <Link to={L("/about")}>{t("About")}</Link>
            <Link to={locale === "tr" ? "/descall-sahibi" : "/who-owns-descall"}>{t("Who owns Descall?")}</Link>
            <Link to={L("/security")}>{t("Security")}</Link>
            <Link to={L("/contact")}>{t("Contact")}</Link>
            <Link to="/privacy">{t("Privacy Policy")}</Link>
            <Link to="/terms">{t("Terms")}</Link>
            <a href={SITE_OPERATOR.githubUrl} rel="noopener noreferrer" target="_blank">
              GitHub
            </a>
          </section>
        </div>
        <div className="mkt-footer-bottom">
          <LanguageToggle locale={locale} onSwitch={switchLocale} />
        </div>
        <EmailCapture source="footer" />
        <p className="mkt-footer-trust">
          {t("Status")}: {t("Beta")} · {t("Transport security")}: TLS / DTLS-SRTP ·{" "}
          <Link to="/status">{t("Live status")}</Link> · <Link to="/security">{t("Security details")}</Link>
        </p>
        <p className="mkt-footer-contact">
          <a href={`mailto:${SITE_OPERATOR.supportEmail}`}>{SITE_OPERATOR.supportEmail}</a>
        </p>
        <p className="mkt-footer-copy">
          © {SITE_OPERATOR.copyrightYear} {SITE_OPERATOR.operatorName}. {t("Descall is owned by Demir Sarp Kurtlar.")}{" "}
          {t("All rights reserved.")} {t("Last updated")}:{" "}
          {locale === "tr" ? SITE_OPERATOR.lastUpdatedLabelTr : SITE_OPERATOR.lastUpdatedLabel}.
        </p>
      </footer>
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
        aria-label="TR — Türkçe"
      >
        TR
      </button>
      <button
        type="button"
        className={locale === "en" ? "is-active" : ""}
        onClick={() => onSwitch("en")}
        aria-pressed={locale === "en"}
        aria-label="EN — English"
      >
        EN
      </button>
    </div>
  );
}
