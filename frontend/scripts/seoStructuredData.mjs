/**
 * Structured-data rules of the prerendered pages (seo-validate --dist, Nov 2026 round 2).
 * checkStructuredData(html, page) returns a list of problems for one page:
 *
 *  - every JSON-LD block parses; Organization, WebSite and SoftwareApplication are present
 *    (the entity graph), WebSite lists every site language;
 *  - SoftwareApplication names the real platforms and the App Store app, price 0;
 *  - no rating or review markup anywhere (Descall has none to show);
 *  - every page below a home has a BreadcrumbList from that home to its own canonical URL;
 *  - blog posts are BlogPosting with headline, dates, author, publisher logo, image, the
 *    page language and the canonical URL;
 *  - FAQPage at most once, and only with questions that are on the page.
 *
 * page: { path, canonical, lang, home, isBlogPost }
 */

const SITE_LANGS = ["en", "tr", "de", "es", "fr", "pt-BR", "ru"];

function decode(s) {
  return String(s)
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
}

const norm = (s) => decode(s).replace(/\s+/g, " ").trim();

/** Every node with an @type, @graph included. */
function nodes(value, out = []) {
  if (Array.isArray(value)) value.forEach((v) => nodes(v, out));
  else if (value && typeof value === "object") {
    if (value["@type"]) out.push(value);
    if (value["@graph"]) nodes(value["@graph"], out);
  }
  return out;
}

const typeOf = (n) => (Array.isArray(n["@type"]) ? n["@type"] : [n["@type"]]);

export function checkStructuredData(html, page) {
  const problems = [];
  const blocks = [...html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  const all = [];
  for (const raw of blocks) {
    try {
      nodes(JSON.parse(raw), all);
    } catch (err) {
      problems.push(`JSON-LD does not parse (${err.message})`);
    }
  }
  const of = (t) => all.filter((n) => typeOf(n).includes(t));
  for (const t of ["Organization", "WebSite", "SoftwareApplication"]) {
    if (!of(t).length) problems.push(`${t} JSON-LD missing`);
  }
  // Brand entity (Nov 13): the Organization names the brand, its home, a square logo of at
  // least 112 px and the App Store app in sameAs, so Google can tie "Descall" to the site.
  const org = of("Organization").find((n) => n["@id"] === "https://descall.com/#organization") || of("Organization")[0];
  if (org) {
    if (org.name !== "Descall") problems.push(`Organization.name is ${org.name}, not Descall`);
    if (org.url !== "https://descall.com/") problems.push("Organization.url is not https://descall.com/");
    const logo = typeof org.logo === "string" ? { url: org.logo } : org.logo || {};
    if (!/^https:\/\/descall\.com\/.+\.png(\?|$)/.test(String(logo.url || ""))) problems.push("Organization.logo is not a descall.com PNG");
    if (logo.width && (logo.width !== logo.height || logo.width < 112)) problems.push("Organization.logo is not square or under 112 px");
    if (![].concat(org.sameAs || []).some((u) => /^https:\/\/apps\.apple\.com\/app\/id\d+$/.test(u))) {
      problems.push("Organization.sameAs has no App Store URL");
    }
  }
  const site = of("WebSite")[0];
  if (site) {
    if (site.logo) problems.push("WebSite.logo is not a WebSite property (the logo belongs on the Organization)");
    if (site.potentialAction) problems.push("WebSite.potentialAction (SearchAction) without a site search page");
    const langs = [].concat(site.inLanguage || []);
    const missing = SITE_LANGS.filter((l) => !langs.includes(l));
    if (missing.length) problems.push(`WebSite.inLanguage misses ${missing.join(", ")}`);
  }
  const app = of("SoftwareApplication")[0];
  if (app) {
    const os = String(app.operatingSystem || "");
    for (const p of ["Windows", "iOS", "Android", "Web"]) if (!os.includes(p)) problems.push(`SoftwareApplication.operatingSystem misses ${p}`);
    const urls = [].concat(app.downloadUrl || [], app.installUrl || [], app.sameAs || []).join(" ");
    if (!/https:\/\/apps\.apple\.com\//.test(urls)) problems.push("SoftwareApplication has no App Store URL");
    const offers = [].concat(app.offers || []);
    if (!offers.some((o) => String(o.price) === "0")) problems.push("SoftwareApplication offer is not free (price 0)");
  }
  const joined = blocks.join("\n");
  if (/"(aggregateRating|reviewRating|review|AggregateRating|Review)"/.test(joined)) {
    problems.push("rating / review markup found (Descall publishes none)");
  }

  const crumbs = of("BreadcrumbList");
  if (page.path !== page.home && page.path !== "/") {
    if (crumbs.length !== 1) problems.push(`expected 1 BreadcrumbList, found ${crumbs.length}`);
    const items = crumbs[0]?.itemListElement || [];
    if (crumbs.length) {
      if (items.length < 2) problems.push("BreadcrumbList has fewer than 2 items");
      items.forEach((it, i) => {
        if (it.position !== i + 1) problems.push(`BreadcrumbList position ${it.position} at index ${i}`);
        if (!String(it.name || "").trim()) problems.push(`BreadcrumbList item ${i + 1} has no name`);
      });
      const homeUrl = `https://descall.com${page.home === "/" ? "/" : page.home}`;
      if (items[0]?.item !== homeUrl) problems.push(`BreadcrumbList starts at ${items[0]?.item}, not ${homeUrl}`);
      if (items.at(-1)?.item !== page.canonical) problems.push(`BreadcrumbList ends at ${items.at(-1)?.item}, not the canonical ${page.canonical}`);
    }
  }

  if (page.isBlogPost) {
    const post = of("BlogPosting")[0];
    if (!post) problems.push("BlogPosting JSON-LD missing");
    else {
      const iso = /^\d{4}-\d{2}-\d{2}/;
      if (!post.headline || String(post.headline).length > 110) problems.push("BlogPosting.headline missing or over 110 characters");
      if (!iso.test(post.datePublished || "")) problems.push("BlogPosting.datePublished missing");
      if (!iso.test(post.dateModified || "")) problems.push("BlogPosting.dateModified missing");
      if (post.dateModified < post.datePublished) problems.push("BlogPosting.dateModified is before datePublished");
      if (!post.author?.name) problems.push("BlogPosting.author.name missing");
      if (!post.publisher?.logo) problems.push("BlogPosting.publisher.logo missing");
      if (![].concat(post.image || []).length) problems.push("BlogPosting.image missing");
      if (post.inLanguage !== page.lang) problems.push(`BlogPosting.inLanguage ${post.inLanguage} on a ${page.lang} page`);
      if (post.mainEntityOfPage !== page.canonical) problems.push("BlogPosting.mainEntityOfPage is not the canonical URL");
    }
  }

  const faqs = of("FAQPage");
  if (faqs.length > 1) problems.push(`${faqs.length} FAQPage blocks (at most 1)`);
  if (faqs.length) {
    const visible = norm(
      html
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]+>/g, " ")
    );
    for (const q of faqs[0].mainEntity || []) {
      const name = norm(q.name || "");
      if (!name || !visible.includes(name)) problems.push(`FAQPage question not on the page: "${name.slice(0, 60)}"`);
      const answer = norm(q.acceptedAnswer?.text || "").slice(0, 80);
      if (answer && !visible.includes(answer)) problems.push(`FAQPage answer not on the page: "${answer.slice(0, 60)}"`);
    }
  }
  return problems;
}
