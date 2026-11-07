/** "İlgili rehberler" guides under every Turkish blog post (TrBlogPostPage and its prerendered twin). */
export const TR_BLOG_RELATED = [
  { to: "/tr/discord-alternatifi", label: "Discord alternatifi" },
  { to: "/tr/discord-alternatifleri", label: "Discord alternatifleri" },
  { to: "/tr/discord-acildi-mi", label: "Discord açıldı mı?" },
  { to: "/tr/compare/discord", label: "Discord mu Descall mı?" },
  { to: "/tr/blog", label: "Tüm rehberler" },
];

const DISCORD_TOPIC = /discord|nitro|alternative|competitor/i;
/** Stable per-pair number, so equally close posts link to different neighbours. */
const pairHash = (a, b) => [...`${a}|${b}`].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
const words = (post) => new Set((post.tags || []).flatMap((t) => String(t).toLowerCase().split(/[^a-z0-9ğüşöçıİ]+/i)).filter((w) => w.length > 2));

/**
 * "Related guides" under a blog post: the 4 closest other posts (shared tag words, then the
 * same topic family, Discord comparisons or how-to guides; ties spread by a stable hash so
 * every post is somebody's neighbour), then the guide pages of that family (the Discord
 * cluster for a Discord post, 2 product pages for a how-to). It used to be every other post plus every guide (19 links on
 * every post), which said nothing about which pages belong together.
 * Used by BlogPostPage, TrBlogPostPage and their prerendered twins.
 */
export function relatedForPost(post, posts, guides = [], { posts: postCount = 4, guides: guideCount = 2, labelOf = (p) => p.title } = {}) {
  const mine = words(post);
  const family = DISCORD_TOPIC.test(post.slug);
  const scored = posts
    .filter((p) => p.slug !== post.slug)
    .map((p) => {
      const shared = [...words(p)].filter((w) => mine.has(w)).length;
      return { p, score: shared * 2 + (DISCORD_TOPIC.test(p.slug) === family ? 1 : 0) };
    })
    .sort((a, b) => b.score - a.score || pairHash(post.slug, a.p.slug) - pairHash(post.slug, b.p.slug))
    .slice(0, postCount)
    .map(({ p }) => ({ to: p.path, label: labelOf(p) }));
  const guidePool = guides.filter((g) => DISCORD_TOPIC.test(g.to) === family);
  // A Discord comparison post links its whole cluster of Discord guide pages (pillar and
  // niche pages live off these links); a how-to post links two product pages.
  const pickedGuides = family ? guidePool : (guidePool.length >= guideCount ? guidePool : guides).slice(0, guideCount);
  return [...scored, ...pickedGuides];
}
