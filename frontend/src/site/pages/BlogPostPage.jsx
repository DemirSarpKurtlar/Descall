import { Link, useLocation, useParams } from "react-router-dom";
import SeoLandingShell from "../components/SeoLandingShell";
import SeoRelatedLinks from "../components/SeoRelatedLinks";
import { buildArticleLd, buildBreadcrumbLd, buildFaqLd } from "../JsonLd";
import { BLOG_POSTS, BLOG_RELATED, BLOG_FAQ_BY_SLUG, GAMER_FAQ } from "../content/discordSeoContent";
import { BLOG_BODIES } from "../seo/blogBodies";
import { useT } from "../../context/localeContextInstance";
import { formatPostDate, useMirrorCopy } from "../useMirrorCopy";
import { SITE_OPERATOR } from "../siteIdentity";
import NotFoundPage from "./NotFoundPage";

export default function BlogPostPage({ onSignIn }) {
  const params = useParams();
  const { pathname } = useLocation();
  // /blog/:slug passes the slug; the /de/blog/<slug> mirrors are plain paths.
  const slug = params.slug || String(pathname || "").replace(/\/+$/, "").split("/").pop();
  const t = useT();
  const mirror = useMirrorCopy();
  const post = BLOG_POSTS.find((p) => p.slug === slug);
  const body = BLOG_BODIES[slug];
  if (!post || !body) return <NotFoundPage />;

  const faq = BLOG_FAQ_BY_SLUG[slug] || GAMER_FAQ.slice(0, 2);
  const dateLocale = mirror.prefixed ? mirror.locale : "en";
  // The other posts first, then the guides (same list as the prerendered post).
  const related = [
    ...BLOG_POSTS.filter((p) => p.slug !== slug).map((p) => ({ to: p.path, label: p.title })),
    ...BLOG_RELATED.filter((l) => l.to !== "/status"),
  ];
  const crumbs = [
    { label: "Home", to: "/" },
    { label: "Blog", to: "/blog" },
    { label: post.title, to: post.path },
  ];

  return (
    <SeoLandingShell
      breadcrumbs={crumbs}
      kicker={post.tags.map((tag) => t(tag)).join(" · ")}
      title={t(post.title)}
      lead={t(post.description)}
      faq={faq}
      jsonLd={[
        buildBreadcrumbLd(mirror.crumbs(crumbs)),
        buildFaqLd(mirror.faq(faq)),
        buildArticleLd({
          type: "BlogPosting",
          title: mirror.text(post.title),
          description: mirror.text(post.description),
          path: mirror.href(post.path),
          datePublished: post.date,
          dateModified: post.updated || post.date,
          inLanguage: mirror.prefixed ? mirror.locale : "en",
        }),
      ]}
      primaryCta={
        <button type="button" className="mkt-btn mkt-btn-primary" onClick={onSignIn}>
          {t("Try Descall")}
        </button>
      }
      secondaryCta={
        <Link to={mirror.href("/discord-alternative")} className="mkt-btn mkt-btn-ghost">
          {t("Discord alternative")}
        </Link>
      }
    >
      <p className="seo-note">
        {t("Published")}: <time dateTime={post.date}>{formatPostDate(post.date, dateLocale)}</time>
        {post.updated && post.updated !== post.date ? (
          <>
            {` · ${t("Updated")}: `}
            <time dateTime={post.updated}>{formatPostDate(post.updated, dateLocale)}</time>
          </>
        ) : null}
        {` · ${t("Author")}: `}
        <Link to={mirror.href("/who-owns-descall")}>{SITE_OPERATOR.operatorName}</Link>
      </p>
      {body.sections.map((s) => (
        <section className="seo-section" key={s.h}>
          <h2>{t(s.h)}</h2>
          <p>{t(s.p)}</p>
        </section>
      ))}
      <SeoRelatedLinks title="Related guides" links={related} />
      <section className="seo-section">
        <p className="seo-note">
          <Link to={mirror.href("/blog")}>{t("← Back to blog")}</Link>
        </p>
      </section>
    </SeoLandingShell>
  );
}
