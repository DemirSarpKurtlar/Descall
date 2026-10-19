import { Link, Navigate, useLocation } from "react-router-dom";
import { IconCheck as Check } from "../icons";
import SeoLandingShell from "../components/SeoLandingShell";
import SeoRelatedLinks from "../components/SeoRelatedLinks";
import SeoProductPreview from "../components/SeoProductPreview";
import { buildBreadcrumbLd, buildFaqLd, buildDiscordAlternativeAppLd } from "../JsonLd";
import { TR_LANDINGS } from "../seo/trLandings";

function previewForPath(path) {
  if (path.includes("oyuncu")) return { tone: "gaming", mode: "friends" };
  if (path.includes("sesli")) return { tone: "voice", mode: "call" };
  if (path.includes("turk")) return { tone: "community", mode: "servers" };
  return { tone: "compare", mode: "chat" };
}

/** Turkish long-form landings (/tr/discord-alternatifi, /tr/turk-discord, …). */
export default function TrLandingPage({ onSignIn, onSignUp }) {
  const { pathname } = useLocation();
  const clean = (pathname || "/").replace(/\/+$/, "") || "/";
  const page = TR_LANDINGS[clean];
  if (!page) return <Navigate to="/tr" replace />;
  const preview = previewForPath(clean);
  const startFree = () => (onSignUp || onSignIn)?.({ mode: "register", source: "tr_landing" });

  const crumbs = [
    { label: "Ana sayfa", to: "/tr" },
    { label: page.h1.split(":")[0].trim(), to: page.path },
  ];

  return (
    <SeoLandingShell
      breadcrumbs={crumbs}
      kicker={page.kicker}
      title={page.h1}
      lead={page.lead}
      tone={preview.tone}
      faq={page.faq}
      jsonLd={[buildBreadcrumbLd(crumbs), buildFaqLd(page.faq), buildDiscordAlternativeAppLd(page.path)]}
      primaryCta={
        <button type="button" className="mkt-btn mkt-btn-primary" onClick={startFree}>
          Ücretsiz başla
        </button>
      }
      secondaryCta={
        <Link to="/tr/download" className="mkt-btn mkt-btn-soft">
          İndir
        </Link>
      }
      heroExtra={<SeoProductPreview mode={preview.mode} caption={page.h1} />}
    >
      {page.updatedLabel && (
        <p className="seo-note">
          <time dateTime={page.updated}>{page.updatedLabel}</time>
        </p>
      )}
      {page.sections.map((s) => (
        <section className="seo-section" key={s.h}>
          <h2>{s.h}</h2>
          {s.p.map((para) => (
            <p key={para.slice(0, 40)}>{para}</p>
          ))}
          {s.list?.length > 0 && (
            <ul className="seo-checklist">
              {s.list.map((item) => (
                <li key={item}>
                  <Check size={16} aria-hidden />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
      <SeoRelatedLinks title="İlgili sayfalar" links={page.related} />
    </SeoLandingShell>
  );
}
