import { Link } from "react-router-dom";
import SeoLandingShell from "../components/SeoLandingShell";
import { buildBreadcrumbLd } from "../JsonLd";
import { BLOG_POSTS } from "../content/discordSeoContent";
import { useT } from "../../context/localeContextInstance";
import { useMirrorCopy } from "../useMirrorCopy";

const crumbs = [
  { label: "Home", to: "/" },
  { label: "Blog", to: "/blog" },
];

export default function BlogIndexPage() {
  const t = useT();
  // Card text, links and dates change only on /de-style mirrors (see useMirrorCopy).
  const mirror = useMirrorCopy();
  return (
    <SeoLandingShell
      breadcrumbs={crumbs}
      kicker="Blog"
      title={t("Descall blog, Discord alternatives & voice chat")}
      lead={t(
        "Practical guides on Discord alternatives, voice chat, and moving friend groups to Descall."
      )}
      jsonLd={[buildBreadcrumbLd(mirror.crumbs(crumbs))]}
    >
      <section className="seo-section">
        <div className="seo-blog-grid">
          {BLOG_POSTS.map((post) => (
            <article key={post.slug} className="seo-blog-card">
              <time dateTime={post.date}>{mirror.date(post.date)}</time>
              <h2>
                <Link to={mirror.href(post.path)}>{mirror.text(post.title)}</Link>
              </h2>
              <p>{mirror.text(post.description)}</p>
              <div className="seo-tags">
                {post.tags.map((tag) => (
                  <span key={tag}>{mirror.text(tag)}</span>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>
    </SeoLandingShell>
  );
}
