import { Link, Navigate, useLocation } from "react-router-dom";
import { IconCheck as Check } from "../icons";
import SeoLandingShell from "../components/SeoLandingShell";
import SeoRelatedLinks from "../components/SeoRelatedLinks";
import SeoProductPreview from "../components/SeoProductPreview";
import { buildArticleLd, buildBreadcrumbLd, buildFaqLd, buildDiscordAlternativeAppLd } from "../JsonLd";
import { TR_LANDINGS, trLandingLabel } from "../seo/trLandings";

function previewForPath(path) {
  if (path.includes("oyuncu")) return { tone: "gaming", mode: "friends" };
  if (path.includes("sesli") || path.includes("teamspeak") || path.includes("ekran")) return { tone: "voice", mode: "call" };
  if (path.includes("turk")) return { tone: "community", mode: "servers" };
  return { tone: "compare", mode: "chat" };
}

/** Turkish long-form landings (/tr/discord-alternatifi, /tr/turk-sohbet-uygulamasi, …). */
export default function TrLandingPage({ onSignIn, onSignUp }) {
  const { pathname } = useLocation();
  const clean = (pathname || "/").replace(/\/+$/, "") || "/";
  const page = TR_LANDINGS[clean];
  if (!page) return <Navigate to="/tr" replace />;
  const preview = previewForPath(clean);
  const startFree = () => (onSignUp || onSignIn)?.({ mode: "register", source: "tr_landing" });

  const crumbs = [
    { label: "Ana sayfa", to: "/tr" },
    { label: trLandingLabel(page), to: page.path },
  ];

  return (
    <SeoLandingShell
      breadcrumbs={crumbs}
      kicker={page.kicker}
      title={page.h1}
      lead={page.lead}
      tone={preview.tone}
      faq={page.faq}
      jsonLd={[
        buildBreadcrumbLd(crumbs),
        buildFaqLd(page.faq),
        buildDiscordAlternativeAppLd(page.path),
        ...(page.published && page.updated
          ? [
              buildArticleLd({
                title: page.h1,
                description: page.lead,
                path: page.path,
                datePublished: page.published,
                dateModified: page.updated,
                inLanguage: "tr",
              }),
            ]
          : []),
      ]}
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
          {s.table && (
            <div className="seo-table-wrap">
              <table className="mkt-table">
                <thead>
                  <tr>
                    {s.table.head.map((cell, i) => (
                      <th key={i} scope="col">
                        {cell}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {s.table.rows.map((row) => (
                    <tr key={row[0]}>
                      {row.map((cell, i) => (
                        <td key={i}>{cell}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ))}
      <SeoRelatedLinks title="İlgili sayfalar" links={page.related} />
    </SeoLandingShell>
  );
}
