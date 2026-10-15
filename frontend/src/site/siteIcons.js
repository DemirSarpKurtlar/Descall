/**
 * Public favicon set for every HTML shell (SPA index, prerendered marketing
 * pages, sitemap.html).
 *
 * FAVICON_VERSION is an icon revision, not the app version. Bump it only when
 * the mark artwork changes so Google keeps one stable favicon URL.
 */
export const FAVICON_VERSION = "concept2";

export const FAVICON_FILES = [
  { file: "favicon.ico", type: "image/x-icon", ico: [16, 32, 48] },
  { file: "favicon.svg", type: "image/svg+xml" },
  { file: "favicon-32.png", type: "image/png", size: 32 },
  { file: "favicon-48.png", type: "image/png", size: 48 },
  { file: "favicon-96.png", type: "image/png", size: 96 },
  { file: "favicon-144.png", type: "image/png", size: 144 },
  { file: "favicon-192.png", type: "image/png", size: 192 },
  { file: "favicon-512.png", type: "image/png", size: 512 },
  { file: "apple-touch-icon.png", type: "image/png", size: 180 },
];

/**
 * Google Search uses the first square icon whose size is a multiple of 48.
 * That file is listed first. /favicon.ico stays the stable multi-size
 * (16/32/48) URL browsers and Googlebot request directly.
 */
export const FAVICON_LINK_SPECS = [
  { rel: "icon", href: "/favicon-48.png", type: "image/png", sizes: "48x48" },
  { rel: "icon", href: "/favicon-96.png", type: "image/png", sizes: "96x96" },
  { rel: "icon", href: "/favicon-144.png", type: "image/png", sizes: "144x144" },
  { rel: "icon", href: "/favicon-192.png", type: "image/png", sizes: "192x192" },
  { rel: "icon", href: "/favicon.ico", type: "image/x-icon", sizes: "16x16 32x32 48x48" },
  { rel: "icon", href: "/favicon-32.png", type: "image/png", sizes: "32x32" },
  { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
  { rel: "apple-touch-icon", href: "/apple-touch-icon.png", type: "image/png", sizes: "180x180" },
];

export function withFaviconVersion(path) {
  const [base, query = ""] = String(path).split("?");
  const params = new URLSearchParams(query);
  params.set("v", FAVICON_VERSION);
  return `${base}?${params.toString()}`;
}

export function faviconLinksHtml(indent = "") {
  const lines = FAVICON_LINK_SPECS.map((spec) => {
    const attrs = [`rel="${spec.rel}"`, `href="${withFaviconVersion(spec.href)}"`];
    if (spec.type) attrs.push(`type="${spec.type}"`);
    if (spec.sizes) attrs.push(`sizes="${spec.sizes}"`);
    return `${indent}<link ${attrs.join(" ")} />`;
  });
  lines.push(`${indent}<link rel="manifest" href="${withFaviconVersion("/manifest.webmanifest")}" />`);
  return lines.join("\n");
}

/** Square Konsept 2 mark. Google's organization logo needs ≥112px; we ship 512. */
export function organizationLogoLd(absoluteUrl) {
  const url = absoluteUrl(withFaviconVersion("/favicon-512.png"));
  return {
    "@type": "ImageObject",
    url,
    contentUrl: url,
    width: 512,
    height: 512,
  };
}
