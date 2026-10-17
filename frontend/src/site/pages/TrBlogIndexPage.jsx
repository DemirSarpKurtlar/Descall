import { Link } from "react-router-dom";
import SeoLandingShell from "../components/SeoLandingShell";
import SeoRelatedLinks from "../components/SeoRelatedLinks";
import { buildBreadcrumbLd } from "../JsonLd";
import { TR_BLOG_POSTS } from "../seo/trBlog";
import { TR_LANDINGS } from "../seo/trLandings";

const crumbs = [
  { label: "Ana sayfa", to: "/tr" },
  { label: "Blog", to: "/tr/blog" },
];

export default function TrBlogIndexPage() {
  const hubs = Object.values(TR_LANDINGS).map((p) => ({ to: p.path, label: p.h1.split(":")[0].trim() }));
  return (
    <SeoLandingShell
      breadcrumbs={crumbs}
      kicker="Blog"
      title="Descall blog: Discord alternatifleri ve sesli sohbet rehberleri"
      lead="Discord alternatifleri, Discord’dan geçiş, LFG, sesli sohbet ve topluluk yönetimi üzerine Türkçe, pratik rehberler."
      jsonLd={[buildBreadcrumbLd(crumbs)]}
    >
      <section className="seo-section">
        <div className="seo-blog-grid">
          {TR_BLOG_POSTS.map((post) => (
            <article key={post.slug} className="seo-blog-card">
              <time dateTime={post.date}>{post.date}</time>
              <h2>
                <Link to={post.path}>{post.title}</Link>
              </h2>
              <p>{post.description}</p>
              <div className="seo-tags">
                {post.tags.map((tag) => (
                  <span key={tag}>{tag}</span>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>
      <SeoRelatedLinks title="Türkçe rehber sayfaları" links={hubs} />
    </SeoLandingShell>
  );
}
