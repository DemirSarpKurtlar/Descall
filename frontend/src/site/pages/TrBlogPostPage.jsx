import { Link, useParams } from "react-router-dom";
import SeoLandingShell from "../components/SeoLandingShell";
import SeoRelatedLinks from "../components/SeoRelatedLinks";
import { buildArticleLd, buildBreadcrumbLd, buildFaqLd } from "../JsonLd";
import { TR_BLOG_POSTS, TR_BLOG_BODIES, TR_BLOG_FAQ_BY_SLUG } from "../seo/trBlog";
import NotFoundPage from "./NotFoundPage";
import { formatPostDate } from "../useMirrorCopy";
import { SITE_OPERATOR } from "../siteIdentity";
import { MARKETING_TR } from "../marketingPhrases.tr.js";
import { TR_BLOG_RELATED as RELATED, relatedForPost } from "../seo/blogLinks.js";

export default function TrBlogPostPage({ onSignIn, onSignUp }) {
  const { slug } = useParams();
  const post = TR_BLOG_POSTS.find((p) => p.slug === slug);
  const body = TR_BLOG_BODIES[slug];
  if (!post || !body) return <NotFoundPage />;
  const faq = TR_BLOG_FAQ_BY_SLUG[slug] || [];
  const crumbs = [
    { label: "Ana sayfa", to: "/tr" },
    { label: "Blog", to: "/tr/blog" },
    { label: post.h1 || post.title, to: post.path },
  ];
  const startFree = () => (onSignUp || onSignIn)?.({ mode: "register", source: "tr_blog" });

  return (
    <SeoLandingShell
      breadcrumbs={crumbs}
      kicker={post.tags.join(" · ")}
      title={post.h1 || post.title}
      lead={post.description}
      faq={faq}
      jsonLd={[
        buildBreadcrumbLd(crumbs),
        ...(faq.length ? [buildFaqLd(faq)] : []),
        buildArticleLd({
          type: "BlogPosting",
          title: post.h1 || post.title,
          description: post.description,
          path: post.path,
          datePublished: post.date,
          dateModified: post.updated || post.date,
          inLanguage: "tr",
        }),
      ]}
      primaryCta={
        <button type="button" className="mkt-btn mkt-btn-primary" onClick={startFree}>
          Descall’ı dene
        </button>
      }
      secondaryCta={
        <Link to="/tr/discord-alternatifi" className="mkt-btn mkt-btn-ghost">
          Discord alternatifi
        </Link>
      }
    >
      <p className="seo-note">
        Yayın: <time dateTime={post.date}>{formatPostDate(post.date, "tr")}</time>
        {post.updated && post.updated !== post.date ? (
          <>
            {" · "}Güncelleme: <time dateTime={post.updated}>{formatPostDate(post.updated, "tr")}</time>
          </>
        ) : null}
        {` · ${MARKETING_TR.Author}: `}
        <Link to={SITE_OPERATOR.personPathTr}>{SITE_OPERATOR.operatorName}</Link>
      </p>
      {body.sections.map((s) => (
        <section className="seo-section" key={s.h}>
          <h2>{s.h}</h2>
          <p>{s.p}</p>
        </section>
      ))}
      <SeoRelatedLinks
        title="İlgili rehberler"
        links={relatedForPost(post, TR_BLOG_POSTS, RELATED, { labelOf: (p) => p.h1 || p.title })}
      />
      <section className="seo-section">
        <p className="seo-note">
          <Link to="/tr/blog">← Bloga dön</Link>
        </p>
      </section>
    </SeoLandingShell>
  );
}
