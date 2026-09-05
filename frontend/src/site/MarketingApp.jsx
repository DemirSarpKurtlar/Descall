import { useEffect, useLayoutEffect, useState, useCallback, lazy, Suspense } from "react";
import { Routes, Route, Navigate, useLocation, useNavigate } from "react-router-dom";
import {
  persistInviteRef,
  peekInviteRef,
  readInviteRefFromLocation,
} from "../lib/referral";
import { captureVisit } from "../lib/attribution";
import { Funnel, trackPageView } from "./analytics";
import { signalMarketingEngage } from "./analyticsGate";
import MarketingLayout from "./MarketingLayout";
import SeoHead from "./SeoHead";
const MarketingAuthModal = lazy(() => import("./MarketingAuthModal"));
const AuthView = lazy(() => import("../components/AuthView"));

const DownloadPage = lazy(() => import("./pages/MarketingDownloadPage"));
const HomePage = lazy(() => import("./pages/HomePage"));
const FeaturesPage = lazy(() => import("./pages/FeaturesPage"));
const FaqPage = lazy(() => import("./pages/FaqPage"));
const SecurityPage = lazy(() => import("./pages/SecurityPage"));
const PrivacyPage = lazy(() => import("./pages/PrivacyPage"));
const TermsPage = lazy(() => import("./pages/TermsPage"));
const AboutPage = lazy(() => import("./pages/AboutPage"));
const WhoOwnsDescallPage = lazy(() => import("./pages/WhoOwnsDescallPage"));
const ContactPage = lazy(() => import("./pages/ContactPage"));
const StatusPage = lazy(() => import("./pages/StatusPage"));
const CompareDiscordPage = lazy(() => import("./pages/CompareDiscordPage"));
const DiscordAlternativePage = lazy(() => import("./pages/DiscordAlternativePage"));
const AlternativesPage = lazy(() => import("./pages/AlternativesPage"));
const DiscordAlternativeGamersPage = lazy(() => import("./pages/DiscordAlternativeGamersPage"));
const DiscordAlternativeTurkeyPage = lazy(() => import("./pages/DiscordAlternativeTurkeyPage"));
const DiscordAlternativeNichePage = lazy(() => import("./pages/DiscordAlternativeNichePage"));
const BlogIndexPage = lazy(() => import("./pages/BlogIndexPage"));
const BlogPostPage = lazy(() => import("./pages/BlogPostPage"));
const DimaAiLandingPage = lazy(() => import("./pages/DimaAiLandingPage"));
const NotFoundPage = lazy(() => import("./pages/NotFoundPage"));

/**
 * Hide #seo-static only after the lazy page has committed — keeps crawlable H1
 * visible through the Suspense gap (no blank / "Loading" flash).
 */
function RevealMarketingShell() {
  useLayoutEffect(() => {
    document.documentElement.setAttribute("data-marketing-ready", "1");
    const seo = document.getElementById("seo-static");
    if (seo) {
      seo.setAttribute("hidden", "");
      seo.setAttribute("aria-hidden", "true");
    }
  }, []);
  return null;
}

function enableMarketingScroll() {
  const html = document.documentElement;
  const body = document.body;
  const root = document.getElementById("root");
  const prev = {
    htmlOverflow: html.style.overflow,
    bodyOverflow: body.style.overflow,
    htmlHeight: html.style.height,
    bodyHeight: body.style.height,
    rootOverflow: root?.style.overflow,
    rootHeight: root?.style.height,
  };
  html.style.overflow = "auto";
  html.style.height = "auto";
  body.style.overflow = "auto";
  body.style.height = "auto";
  if (root) {
    root.style.overflow = "visible";
    root.style.height = "auto";
  }
  return () => {
    html.style.overflow = prev.htmlOverflow;
    html.style.height = prev.htmlHeight;
    body.style.overflow = prev.bodyOverflow;
    body.style.height = prev.bodyHeight;
    if (root) {
      root.style.overflow = prev.rootOverflow;
      root.style.height = prev.rootHeight;
    }
  };
}


function withLayout(Page, openAuth, pageProps = {}) {
  // Suspend the whole layout (not just the page) so #root stays empty while the
  // chunk loads and #seo-static remains the only visible H1/body.
  return (
    <Suspense fallback={null}>
      <MarketingLayout onSignIn={openAuth} onSignUp={(opts) => openAuth({ mode: "register", ...opts })}>
        <Page
          onSignIn={openAuth}
          onSignUp={(opts) => openAuth({ mode: "register", ...opts })}
          {...pageProps}
        />
        <RevealMarketingShell />
      </MarketingLayout>
    </Suspense>
  );
}

/**
 * Logged-out public marketing shell (SEO routes).
 * Authenticated app stays in App.jsx and should force noindex.
 */
let lastSeoAuthIntent = "";

function takeSeoAuthIntent(next) {
  if (next) lastSeoAuthIntent = String(next);
  try {
    const stored = sessionStorage.getItem("descall:open_auth") || "";
    if (stored) {
      lastSeoAuthIntent = stored;
      sessionStorage.removeItem("descall:open_auth");
    }
  } catch {
    /* ignore */
  }
  return lastSeoAuthIntent;
}

function clearSeoAuthIntent() {
  lastSeoAuthIntent = "";
  try {
    sessionStorage.removeItem("descall:open_auth");
  } catch {
    /* ignore */
  }
}

export default function MarketingApp(props) {
  // Separate component so Electron can skip marketing hooks entirely
  // (Rules of Hooks). Logged-out desktop must show Giriş/Kayıt, not SEO.
  if (typeof window !== "undefined" && window.electronAPI?.isElectron) {
    return (
      <Suspense fallback={null}>
        <AuthView
          onLogin={props.onLogin}
          onRegister={props.onRegister}
          onGoogleLogin={props.onGoogleLogin}
          onVerify2fa={props.onVerify2fa}
          loading={props.authLoading}
          error={props.authError}
        />
      </Suspense>
    );
  }
  return <MarketingAppSite {...props} />;
}

function MarketingAppSite({
  onLogin,
  onRegister,
  onGoogleLogin,
  onVerify2fa,
  authLoading,
  authError,
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const [authOpen, setAuthOpen] = useState(() => Boolean(takeSeoAuthIntent()));
  const [authMode, setAuthMode] = useState(() => {
    const pending = takeSeoAuthIntent();
    return pending === "register" || pending === "signup" ? "register" : "login";
  });
  const [authSource, setAuthSource] = useState("modal");
  const [inviteRef, setInviteRef] = useState(() => peekInviteRef());

  useEffect(() => {
    trackPageView(location.pathname + location.search);
  }, [location.pathname, location.search]);

  useEffect(() => {
    // All marketing routes need document scroll — /download previously skipped this
    // and stayed stuck under critical html/body overflow:hidden after hydrate.
    return enableMarketingScroll();
  }, [location.pathname]);

  useEffect(() => {
    try {
      captureVisit();
    } catch {
      /* ignore */
    }
    // Capture ?ref= / invite attribution + deep-link auth modes
    const fromUrl = readInviteRefFromLocation(location.search);
    if (fromUrl) {
      persistInviteRef(fromUrl);
      setInviteRef(fromUrl);
      Funnel.inviteLanding({ invited_by: fromUrl, path: location.pathname });
    } else {
      const peeked = peekInviteRef();
      if (peeked) setInviteRef(peeked);
    }

    const params = new URLSearchParams(location.search);
    const authParam = (params.get("auth") || "").toLowerCase();
    const path = location.pathname;

    if (path === "/register" || path === "/tr/register" || authParam === "register" || authParam === "signup" || fromUrl) {
      setAuthMode("register");
      setAuthSource(fromUrl ? "invite_link" : path.endsWith("/register") ? "register_route" : "query");
      setAuthOpen(true);
    } else if (path === "/login" || path === "/tr/login" || authParam === "login" || authParam === "signin") {
      setAuthMode("login");
      setAuthSource(path.endsWith("/login") ? "login_route" : "query");
      setAuthOpen(true);
    }
  }, [location.pathname, location.search]);

  useEffect(() => {
    const applyIntent = (raw) => {
      const mode = String(raw || takeSeoAuthIntent(raw) || "").toLowerCase();
      if (!mode) return;
      takeSeoAuthIntent(mode);
      setAuthMode(mode === "register" || mode === "signup" ? "register" : "login");
      setAuthSource("seo_static");
      setAuthOpen(true);
    };
    applyIntent(takeSeoAuthIntent());
    const onOpen = (e) => {
      applyIntent(e?.detail?.auth || takeSeoAuthIntent());
    };
    window.addEventListener("descall:open-auth", onOpen);
    return () => {
      window.removeEventListener("descall:open-auth", onOpen);
    };
  }, []);

  const openAuth = useCallback((opts = {}) => {
    const mode = opts.mode === "register" || opts.mode === "signup" ? "register" : "login";
    setAuthMode(mode);
    setAuthSource(opts.source || "cta");
    setAuthOpen(true);
    signalMarketingEngage({ source: opts.source || "cta", intent: mode });
    Funnel.ctaClick({
      page: location.pathname,
      placement: opts.source || "cta",
      label: mode === "register" ? "start_free" : "sign_in",
      intent: mode,
    });
  }, [location.pathname]);

  const closeAuth = useCallback(() => {
    clearSeoAuthIntent();
    setAuthOpen(false);
    if (
      location.pathname === "/register" ||
      location.pathname === "/login" ||
      location.pathname === "/tr/register" ||
      location.pathname === "/tr/login"
    ) {
      navigate(location.pathname.startsWith("/tr") ? "/tr" : "/", { replace: true });
    } else if (location.search.includes("auth=")) {
      const params = new URLSearchParams(location.search);
      params.delete("auth");
      const next = params.toString();
      navigate({ pathname: location.pathname, search: next ? `?${next}` : "" }, { replace: true });
    }
  }, [location.pathname, location.search, navigate]);

  const authProps = {
    onLogin,
    onRegister,
    onGoogleLogin,
    onVerify2fa,
    authLoading,
    authError,
  };

  return (
    <>
      <SeoHead />
      <Routes>
        <Route
          path="/download"
          element={withLayout(DownloadPage, openAuth, {
            onOpenRegister: () => openAuth({ mode: "register", source: "download" }),
          })}
        />
        <Route path="/" element={withLayout(HomePage, openAuth)} />
        <Route path="/register" element={withLayout(HomePage, openAuth)} />
        <Route path="/login" element={withLayout(HomePage, openAuth)} />
        <Route path="/features" element={withLayout(FeaturesPage, openAuth)} />
        <Route path="/dimaai" element={withLayout(DimaAiLandingPage, openAuth)} />
        <Route path="/faq" element={withLayout(FaqPage, openAuth)} />
        <Route path="/security" element={withLayout(SecurityPage, openAuth)} />
        <Route path="/status" element={withLayout(StatusPage, openAuth)} />
        <Route path="/privacy" element={withLayout(PrivacyPage, openAuth)} />
        <Route path="/privacy-policy" element={<Navigate to="/privacy" replace />} />
        <Route path="/terms" element={withLayout(TermsPage, openAuth)} />
        <Route path="/terms-of-service" element={<Navigate to="/terms" replace />} />
        <Route path="/about" element={withLayout(AboutPage, openAuth)} />
        <Route path="/who-owns-descall" element={withLayout(WhoOwnsDescallPage, openAuth)} />
        <Route path="/descall-sahibi" element={withLayout(WhoOwnsDescallPage, openAuth)} />
        <Route path="/founder" element={<Navigate to="/who-owns-descall" replace />} />
        <Route path="/owner" element={<Navigate to="/who-owns-descall" replace />} />
        <Route path="/kurucu" element={<Navigate to="/descall-sahibi" replace />} />
        <Route path="/sahip" element={<Navigate to="/descall-sahibi" replace />} />
        <Route path="/tr/who-owns-descall" element={<Navigate to="/descall-sahibi" replace />} />
        <Route path="/contact" element={withLayout(ContactPage, openAuth)} />
        <Route path="/discord-alternative" element={withLayout(DiscordAlternativePage, openAuth)} />
        {/* TR locale mirrors — same pages, /tr prefix + forced TR locale in layout */}
        <Route path="/tr" element={withLayout(HomePage, openAuth)} />
        <Route path="/tr/register" element={withLayout(HomePage, openAuth)} />
        <Route path="/tr/login" element={withLayout(HomePage, openAuth)} />
        <Route path="/tr/features" element={withLayout(FeaturesPage, openAuth)} />
        <Route path="/tr/dimaai" element={withLayout(DimaAiLandingPage, openAuth)} />
        <Route
          path="/tr/download"
          element={withLayout(DownloadPage, openAuth, {
            onOpenRegister: () => openAuth({ mode: "register", source: "download_tr" }),
          })}
        />
        <Route path="/tr/faq" element={withLayout(FaqPage, openAuth)} />
        <Route path="/tr/discord-alternative" element={<Navigate to="/discord-alternative-turkey" replace />} />
        <Route path="/tr/about" element={withLayout(AboutPage, openAuth)} />
        <Route path="/tr/contact" element={withLayout(ContactPage, openAuth)} />
        <Route path="/tr/security" element={withLayout(SecurityPage, openAuth)} />
        <Route path="/tr/compare/discord" element={withLayout(CompareDiscordPage, openAuth)} />
        <Route path="/alternatives" element={withLayout(AlternativesPage, openAuth)} />
        <Route path="/compare/discord" element={withLayout(CompareDiscordPage, openAuth)} />
        <Route
          path="/best-discord-alternative-for-gamers"
          element={withLayout(DiscordAlternativeGamersPage, openAuth)}
        />
        <Route
          path="/discord-alternative-for-communities"
          element={withLayout(DiscordAlternativeNichePage, openAuth)}
        />
        <Route
          path="/discord-alternative-for-lfg"
          element={withLayout(DiscordAlternativeNichePage, openAuth)}
        />
        <Route
          path="/discord-alternative-for-voice-chat"
          element={withLayout(DiscordAlternativeNichePage, openAuth)}
        />
        <Route
          path="/discord-alternative-for-friends"
          element={withLayout(DiscordAlternativeNichePage, openAuth)}
        />
        <Route path="/apps-like-discord" element={withLayout(DiscordAlternativeNichePage, openAuth)} />
        <Route path="/discord-replacement" element={withLayout(DiscordAlternativeNichePage, openAuth)} />
        <Route
          path="/discord-alternative-turkey"
          element={withLayout(DiscordAlternativeTurkeyPage, openAuth)}
        />
        <Route path="/discord-alternatives" element={<Navigate to="/alternatives" replace />} />
        <Route path="/best-discord-alternative" element={<Navigate to="/discord-alternative" replace />} />
        <Route path="/blog" element={withLayout(BlogIndexPage, openAuth)} />
        <Route path="/blog/:slug" element={withLayout(BlogPostPage, openAuth)} />
        <Route path="*" element={withLayout(NotFoundPage, openAuth)} />
      </Routes>
      {authOpen ? (
        <Suspense fallback={null}>
          <MarketingAuthModal
            open={authOpen}
            onClose={closeAuth}
            initialMode={authMode}
            authSource={authSource}
            inviteRef={inviteRef}
            {...authProps}
          />
        </Suspense>
      ) : null}
    </>
  );
}
