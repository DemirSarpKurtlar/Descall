/**
 * Social preview images (og:image, twitter:image, Article.image).
 *
 * Every site language has its own default image with its own text; pages that set no
 * image, and localized pages whose English image carries English words (Features,
 * Download, ...), use the default of their language. English pages keep their page image.
 * The PNGs are rendered by scripts/generate-og-images.mjs and committed in public/.
 * No competitor names in the images.
 */

export const DEFAULT_OG_IMAGE_EN = "/og-default.png";

/** Image file per site locale id. The text drawn in each image lives in scripts/generate-og-images.mjs. */
export const OG_DEFAULT_IMAGES = {
  en: DEFAULT_OG_IMAGE_EN,
  tr: "/og-default-tr.png",
  de: "/og-default-de.png",
  es: "/og-default-es.png",
  fr: "/og-default-fr.png",
  "pt-BR": "/og-default-pt-br.png",
  ru: "/og-default-ru.png",
};

/** Comparison and niche pages (English): led by the Descall name, no competitor name. */
export const OG_DISCORD_IMAGE = "/og-discord.png";

/**
 * Invite link previews without a server / group icon (public/invite-preview.js, used by the
 * Pages worker; that file cannot import this one, so the selftest keeps the two in sync).
 */
export const OG_INVITE_IMAGES = {
  en: "/og-invite.png",
  tr: "/og-invite-tr.png",
};

/** English images whose text is English words; localized pages use their own default. */
const ENGLISH_TEXT_IMAGES = new Set([
  OG_DISCORD_IMAGE,
  "/og-download.png",
  "/og-features.png",
  "/og-privacy.png",
  "/og-terms.png",
  "/og-about.png",
  "/og-contact.png",
]);

function localeKey(locale) {
  const raw = String(locale || "en");
  if (OG_DEFAULT_IMAGES[raw]) return raw;
  const lower = raw.toLowerCase();
  if (lower === "pt-br" || lower === "pt") return "pt-BR";
  const base = lower.split("-")[0];
  return OG_DEFAULT_IMAGES[base] ? base : "en";
}

/** Default image path of a site language ("/og-default-tr.png"); English for unknown ids. */
export function defaultOgImage(locale) {
  return OG_DEFAULT_IMAGES[localeKey(locale)];
}

/** The image a page in `locale` should use, given the image its route asks for (may be empty). */
export function ogImageFor(image, locale) {
  const key = localeKey(locale);
  if (!image || image === DEFAULT_OG_IMAGE_EN) return OG_DEFAULT_IMAGES[key];
  if (key !== "en" && ENGLISH_TEXT_IMAGES.has(image)) return OG_DEFAULT_IMAGES[key];
  return image;
}
