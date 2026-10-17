import { Link, useParams } from "react-router-dom";
import SeoLandingShell from "../components/SeoLandingShell";
import SeoRelatedLinks from "../components/SeoRelatedLinks";
import { buildArticleLd, buildBreadcrumbLd, buildFaqLd } from "../JsonLd";
import { TR_BLOG_POSTS, TR_BLOG_BODIES, TR_BLOG_FAQ_BY_SLUG } from "../seo/trBlog";
import NotFoundPage from "./NotFoundPage";

const RELATED = [
  { to: "/tr/discord-alternatifi", label: "Discord alternatifi" },
  { to: "/tr/discord-alternatifleri", label: "Discord alternatifleri" },
  { to: "/tr/discord-acildi-mi", label: "Discord açıldı mı?" },
  { to: "/tr/compare/discord", label: "Discord mu Descall mı?" },
  { to: "/tr/blog", label: "Tüm rehberler" },
];

export default function TrBlogPostPage({ onSignIn, onSignUp }) {
  const { slug } = useParams();
  const post = TR_BLOG_POSTS.find((p) => p.slug === slug);
  const body = TR_BLOG_BODIES[slug];
  if (!post || !body) return <NotFoundPage />;
  const faq = TR_BLOG_FAQ_BY_SLUG[slug] || [];
  const crumbs = [
    { label: "Ana sayfa", to: "/tr" },
    { label: "Blog", to: "/tr/blog" },
    { label: post.title, to: post.path },
  ];
  const startFree = () => (onSignUp || onSignIn)?.({ mode: "register", source: "tr_blog" });

  return (
    <SeoLandingShell
      breadcrumbs={crumbs}
      kicker={post.tags.join(" · ")}
      title={post.title}
      lead={post.description}
      faq={faq}
      jsonLd={[
        buildBreadcrumbLd(crumbs),
        ...(faq.length ? [buildFaqLd(faq)] : []),
        buildArticleLd({
          title: post.title,
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
        Yayın: {post.date}
        {post.updated && post.updated !== post.date ? ` · Güncelleme: ${post.updated}` : ""}
      </p>
      {body.sections.map((s) => (
        <section className="seo-section" key={s.h}>
          <h2>{s.h}</h2>
          <p>{s.p}</p>
        </section>
      ))}
      <SeoRelatedLinks title="İlgili rehberler" links={RELATED} />
      <section className="seo-section">
        <p className="seo-note">
          <Link to="/tr/blog">← Bloga dön</Link>
        </p>
      </section>
    </SeoLandingShell>
  );
}
