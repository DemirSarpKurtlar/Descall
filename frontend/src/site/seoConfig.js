/** Canonical public marketing routes + head metadata. */

import { stripLocalePrefix } from "./localePaths.js";
import { TR_LANDING_META, TR_BLOG_META } from "./seo/trMeta.js";
import { PREFIXED_SITE_LOCALES, SITE_LOCALES, mirrorPathsFor, withLocalePrefix } from "./siteLocales.js";
import { directoryRoutes } from "./directory/directoryRoutes.js";

export const SITE_NAME = "Descall";
// descall.com is the canonical public host; the Render hostname is infrastructure.
export const DEFAULT_ORIGIN = "https://descall.com";
// PNG, Instagram/Facebook rasterize SVG poorly (dark smudge next to wordmark).
export const DEFAULT_OG_IMAGE = "/og-default.png";
/** Languages the public site serves (en, tr, plus prefixed locales out of draft). */
export const SUPPORTED_LOCALES = SITE_LOCALES;

/** Runtime origin (API / preview hosts). Prefer this only for non-SEO needs. */
export function siteOrigin() {
  try {
    if (typeof window !== "undefined" && window.location?.origin) {
      const o = window.location.origin;
      if (o && !o.startsWith("file:")) return o.replace(/\/$/, "");
    }
  } catch {
    /* ignore */
  }
  return DEFAULT_ORIGIN;
}

/**
 * Canonical public origin for SEO (canonical, OG, JSON-LD, hreflang).
 * Always descall.com, never preview/onrender hosts, so Google consolidates signals.
 */
export function canonicalOrigin() {
  return DEFAULT_ORIGIN;
}

export function absoluteUrl(path = "/") {
  const origin = canonicalOrigin();
  if (!path || path === "/") return `${origin}/`;
  return `${origin}${path.startsWith("/") ? path : `/${path}`}`;
}

/** English and Turkish routes; PUBLIC_ROUTES adds the prefixed mirrors below. */
const BASE_ROUTES = [
  {
    path: "/",
    title: "Descall | Voice Chat, Servers & Screen Share",
    description:
      "HD voice, video, screen share, and Discord-style servers. Free chat for friends and gamers. Start in the browser or download Windows.",
    image: "/og-default.png",
    changefreq: "daily",
    priority: "1.0",
  },
  {
    path: "/download",
    title: "Download Descall for Windows, iPhone and Android",
    description:
      "Get the Windows desktop app, the iPhone and iPad app, the Android app, or the full web app. Free voice, video, screen share, and servers.",
    image: "/og-download.png",
    changefreq: "weekly",
    priority: "0.9",
    keywords: "download descall, descall windows, descall iphone, descall android",
  },
  {
    path: "/features",
    title: "Descall Features | Free Voice, Screen Share & Servers",
    description:
      "See what’s included for free: HD voice/video, screen share, Discord-style servers, roles, and templates. No Nitro wall on talking.",
    image: "/og-features.png",
    changefreq: "weekly",
    priority: "0.85",
    keywords: "descall features, free voice chat, screen share app",
  },
  {
    path: "/discord-alternative",
    title: "Descall: Free Discord Alternative for Voice and Servers",
    description:
      "A free Discord alternative with real servers, HD voice and video, and screen share. Core chat and calls stay free, with no subscription.",
    image: "/og-discord.png",
    h1: "The best free Discord alternative for friends & gamers",
    changefreq: "weekly",
    priority: "0.95",
    keywords: "discord alternative, free discord alternative, best discord alternative",
  },
  {
    path: "/alternatives",
    title: "Descall Guide: Discord Alternatives Compared (2026)",
    description:
      "Honest 2026 comparison of Discord alternatives: Descall, Discord, Guilded, TeamSpeak, Telegram. Free voice, screen share, and friend-group servers.",
    h1: "Discord alternatives compared | pick by what you actually need",
    changefreq: "weekly",
    priority: "0.9",
    keywords: "discord alternatives, apps like discord, best discord alternatives 2026",
  },
  {
    path: "/compare/discord",
    title: "Descall vs Discord (2026): Which Should You Use?",
    description:
      "Side-by-side Discord vs Descall: servers, roles, voice, screen share, mobile, and price. Clear verdict for friend groups vs mega-communities.",
    h1: "Discord vs Descall | which fits your group in 2026?",
    changefreq: "weekly",
    priority: "0.95",
    keywords: "discord vs descall, descall vs discord",
  },
  {
    path: "/best-discord-alternative-for-gamers",
    title: "Descall for Gamers: A Free Discord Alternative",
    description:
      "Discord alternative for gamers: free voice, screen share, and gaming server templates without Nitro or bot hell.",
    changefreq: "weekly",
    priority: "0.9",
    keywords: "discord alternative for gamers, gaming chat alternative",
  },
  {
    path: "/discord-alternative-for-communities",
    title: "Descall for Communities: A Discord Alternative",
    description:
      "Community chat platform with real servers: roles, channels, templates, invites, and voice. Descall is a Discord alternative for private and growing communities.",
    changefreq: "weekly",
    priority: "0.88",
    keywords: "discord alternative for communities, community chat platform, discord server alternative",
  },
  {
    path: "/discord-alternative-for-voice-chat",
    title: "Descall Voice Chat: A Free Alternative to Discord",
    description:
      "A free voice chat alternative to Discord: WebRTC calls, screen share with quality presets, and no subscription for talking to friends.",
    changefreq: "weekly",
    priority: "0.88",
    keywords: "voice chat alternative to discord, discord alternative for voice chat",
  },
  {
    path: "/discord-alternative-for-friends",
    title: "Descall for Friends: A Discord Alternative",
    description:
      "Discord alternative for friends: DMs, groups, presence, and free voice/video. Skip server admin, keep the people you actually call.",
    changefreq: "weekly",
    priority: "0.88",
    keywords: "discord alternative for friends, group chat alternative to discord",
  },
  {
    path: "/apps-like-discord",
    title: "Descall and Other Apps Like Discord (2026)",
    description:
      "Looking for apps like Discord, websites like Discord, or platforms like Discord? Compare options and see when Descall is the better free pick.",
    changefreq: "weekly",
    priority: "0.9",
    keywords: "apps like discord, websites like discord, platforms like discord",
  },
  {
    path: "/discord-replacement",
    title: "Descall as a Discord Replacement: Migration Guide",
    description:
      "Need a Discord replacement for nightly voice and DMs? Migrate your friend group to Descall in two weeks, keep Discord only for mega-servers.",
    changefreq: "weekly",
    priority: "0.88",
    keywords: "discord replacement, alternative to discord, switch from discord",
  },
  {
    path: "/blog",
    title: "Descall Blog: Guides to Voice Chat and Communities",
    description:
      "Practical guides on Discord alternatives, Discord competitors, voice chat, and migrating friend groups to Descall.",
    changefreq: "weekly",
    priority: "0.8",
  },
  {
    path: "/blog/leave-nitro-keep-voice-chat",
    title: "Keep Voice Chat Free, Skip the Subscription | Descall",
    description:
      "Move your friend group off Discord Nitro habits to a free Discord alternative with voice, video, and screen share.",
    changefreq: "monthly",
    priority: "0.8",
    ogType: "article",
  },
  {
    path: "/blog/best-discord-alternatives-2026",
    title: "Descall Blog: Best Discord Alternatives in 2026",
    description:
      "Best Discord alternatives in 2026 for friends, servers, and voice, how Descall, Discord, Guilded, and others actually compare.",
    changefreq: "monthly",
    priority: "0.85",
    ogType: "article",
  },
  {
    path: "/blog/discord-competitors",
    title: "Descall Blog: Discord Competitors in 2026",
    description:
      "Map of Discord competitors in 2026: lighter friend apps, gaming suites, and voice classics, plus where Descall competes honestly.",
    changefreq: "monthly",
    priority: "0.85",
    ogType: "article",
  },
  {
    path: "/blog/screen-share-with-friends",
    title: "How to Screen Share With Friends for Free | Descall",
    description:
      "Share a game, slides or homework in a DM call, group call or server voice channel: quality settings, sound, privacy tips and fixes for lag.",
    changefreq: "monthly",
    priority: "0.8",
    ogType: "article",
  },
  {
    path: "/blog/online-study-group-voice-chat",
    title: "Online Study Group With Voice Chat: A Guide | Descall",
    description:
      "Set up a study server with subject channels, focus rooms and a quiet voice room, then run sessions that people actually join. Free on Descall.",
    changefreq: "monthly",
    priority: "0.8",
    ogType: "article",
  },
  {
    path: "/blog/better-mic-sound-voice-chat",
    title: "Sound Better in Voice Chat: Mic and Noise Tips | Descall",
    description:
      "Fix echo, background noise and quiet mics in group voice chat with headphones, a mic test, noise suppression, push-to-talk and per-person volume.",
    changefreq: "monthly",
    priority: "0.8",
    ogType: "article",
  },
  {
    path: "/blog/set-up-a-community-server",
    title: "How to Set Up a Community Server | Descall Guide",
    description:
      "Plan channels, roles and permissions for a small community server, then add rules, invites, moderation and your first event, step by step.",
    changefreq: "monthly",
    priority: "0.8",
    ogType: "article",
  },
  {
    path: "/blog/private-group-chat-guide",
    title: "How Private Is Your Group Chat? | Descall Guide",
    description:
      "What a chat app can see, what encryption in transit means, and the privacy settings worth changing: read receipts, previews, status and 2FA.",
    changefreq: "monthly",
    priority: "0.8",
    ogType: "article",
  },
  {
    path: "/blog/descall-on-every-device",
    title: "Descall Apps: Windows, iPhone, Android or Browser?",
    description:
      "Which Descall app fits you: the Windows desktop app, iPhone and iPad, Android or the browser, what each does best and how one account syncs.",
    changefreq: "monthly",
    priority: "0.8",
    ogType: "article",
  },
  {
    path: "/faq",
    title: "Descall FAQ | Is It Free? Voice, Screen Share & Apps",
    description:
      "Quick answers: is Descall free, how calls and screen share work, Windows/Android download, accounts, and privacy.",
    changefreq: "weekly",
    priority: "0.75",
  },
  {
    path: "/security",
    title: "Descall Security | TLS, WebRTC DTLS/SRTP & Accounts",
    description:
      "Descall security: HTTPS/TLS for web, WebRTC DTLS/SRTP for calls, bcrypt passwords, and honest limits, no default E2E claim for stored chat history.",
    changefreq: "monthly",
    priority: "0.6",
  },
  {
    path: "/status",
    title: "Descall Status | Beta service & API health",
    description:
      "Descall public status: Beta product stage, API health probe, transport security, and how to reach support.",
    changefreq: "daily",
    priority: "0.55",
  },
  {
    path: "/privacy",
    title: "Descall Privacy Policy | GDPR/KVKK data practices",
    image: "/og-privacy.png",
    description:
      "Descall Privacy Policy: what we collect (account, messages, IP, call metadata), how long we keep it, our processors, and your access and deletion rights.",
    changefreq: "monthly",
    priority: "0.5",
  },
  {
    path: "/copyright",
    title: "Descall copyright notices",
    description:
      "How to send a copyright notice or counter-notice to Descall at contact@descall.com, and how repeat infringement is handled.",
    changefreq: "yearly",
    priority: "0.4",
  },
  {
    path: "/terms",
    title: "Descall Terms of Service | Age, Acceptable Use & Accounts",
    image: "/og-terms.png",
    description:
      "Terms of Service for Descall web and desktop apps: age requirements (13+), acceptable use, account suspension, DesCoin cosmetics, and liability limits.",
    changefreq: "monthly",
    priority: "0.5",
  },
  {
    path: "/about",
    title: "About Descall | Independent Chat App from Türkiye",
    image: "/og-about.png",
    description:
      "Descall is owned by Demir Sarp Kurtlar, the founder, owner, and CEO. Independent beta voice-and-chat app from Türkiye. Contact contact@descall.com.",
    changefreq: "monthly",
    priority: "0.75",
    keywords: "who owns descall, descall owner, descall founder, demir sarp kurtlar, descall ceo",
  },
  {
    path: "/who-owns-descall",
    title: "Who owns Descall? Demir Sarp Kurtlar | Founder, Owner & CEO",
    description:
      "Descall is owned by Demir Sarp Kurtlar. He is the founder, owner, and CEO of Descall. Exact spelling: Demir Sarp Kurtlar.",
    h1: "Who owns Descall?",
    changefreq: "monthly",
    priority: "0.8",
    keywords: "who owns descall, descall owner, who founded descall, descall ceo, demir sarp kurtlar",
  },
  {
    path: "/descall-sahibi",
    title: "Descall’ın sahibi kim? Demir Sarp Kurtlar, kurucu ve CEO",
    description:
      "Descall’ın sahibi Demir Sarp Kurtlar’dır. Demir Sarp Kurtlar, Descall’ın kurucusu, sahibi ve CEO’sudur.",
    h1: "Descall’ın sahibi kim?",
    lang: "tr",
    changefreq: "monthly",
    priority: "0.8",
    keywords: "descall sahibi kim, descall sahibi kimdir, descall kurucusu, demir sarp kurtlar",
  },
  {
    path: "/contact",
    title: "Contact Descall Support | Email & Security Reports",
    description:
      "Email contact@descall.com for Descall support, feedback, press, or security reports. Operated by Demir Sarp Kurtlar in Türkiye.",
    image: "/og-contact.png",
  },
  {
    path: "/iletisim",
    title: "Descall İletişim | Destek, sahip ve güvenlik",
    description:
      "Descall iletişim: contact@descall.com. Sahip ve kurucu Demir Sarp Kurtlar. Destek, geri bildirim ve güvenlik bildirimleri.",
    lang: "tr",
    image: "/og-contact.png",
    changefreq: "monthly",
    priority: "0.55",
  },
  {
    path: "/gizlilik",
    title: "Descall Gizlilik Politikası | KVKK ve veriler",
    description:
      "Descall gizlilik politikası Türkçe: hesap, mesajlar, IP ve arama üst verisi, saklama süreleri, erişim ve silme hakları.",
    lang: "tr",
    image: "/og-privacy.png",
    changefreq: "monthly",
    priority: "0.4",
  },
  {
    path: "/kosullar",
    title: "Descall Kullanım Koşulları | Yaş, kurallar, hesap",
    description:
      "Descall hizmet şartları Türkçe: 13 yaş sınırı, kabul edilebilir kullanım, hesaplar ve iletişim için contact@descall.com.",
    lang: "tr",
    image: "/og-terms.png",
    changefreq: "monthly",
    priority: "0.4",
  },
  {
    path: "/tr",
    title: "Descall | Sesli Sohbet, Sunucular ve Ekran Paylaşımı",
    description:
      "HD ses, görüntü, ekran paylaşımı ve sunucular. Arkadaş grupları ve oyuncular için ücretsiz sohbet. Tarayıcı veya Windows.",
    image: "/og-default.png",
    changefreq: "weekly",
    priority: "0.9",
  },
  {
    path: "/tr/features",
    title: "Descall Özellikleri | Ücretsiz Ses ve Ekran Paylaşımı",
    description:
      "Ücretsiz neler var: HD ses/görüntü, ekran paylaşımı, sunucular, roller ve şablonlar. Konuşmak için abonelik yok.",
    image: "/og-features.png",
    changefreq: "weekly",
    priority: "0.8",
  },
  {
    path: "/tr/download",
    title: "Descall İndir | Windows, iPhone ve Android için Ücretsiz",
    description:
      "Windows uygulaması, iPhone ve iPad uygulaması, Android veya tarayıcı. Ücretsiz ses, görüntü, ekran paylaşımı ve sunucular, bir dakikada kur.",
    image: "/og-download.png",
    changefreq: "weekly",
    priority: "0.85",
  },
  {
    path: "/tr/faq",
    title: "Descall SSS | Ücretsiz mi, indirme, arama, gizlilik",
    description:
      "Descall sık sorulan sorular: ücretsiz mi, Windows ve Android indirme, sesli arama, ekran paylaşımı, hesap ve gizlilik.",
    changefreq: "weekly",
    priority: "0.7",
  },
  {
    path: "/tr/compare/discord",
    title: "Descall mı Discord mu? 2026 Karşılaştırması",
    description:
      "Discord vs Descall yan yana: sunucular, roller, ses, ekran paylaşımı ve fiyat. Arkadaş grubu için hangisi daha uygun?",
    h1: "Discord mu Descall mı | 2026 karşılaştırması",
    changefreq: "weekly",
    priority: "0.9",
    keywords: "descall vs discord, discord alternatifi karşılaştırma",
  },
  {
    path: "/tr/about",
    title: "Descall Hakkında | Türkiye’den bağımsız uygulama",
    image: "/og-about.png",
    description:
      "Descall, Demir Sarp Kurtlar tarafından Türkiye’de geliştirilen bağımsız bir beta uygulamasıdır. Destek: contact@descall.com.",
    changefreq: "monthly",
    priority: "0.55",
  },
  {
    path: "/tr/security",
    title: "Descall Güvenlik | TLS, hesaplar ve aramalar",
    description:
      "Descall güvenlik özeti Türkçe: HTTPS/TLS, WebRTC DTLS/SRTP, hesap koruması ve saklanan sohbet için dürüst sınırlar.",
    changefreq: "monthly",
    priority: "0.5",
  },
  {
    path: "/tr/blog",
    title: "Descall Blog | Sesli Sohbet ve Topluluk Rehberleri",
    description:
      "Türkçe rehberler: Discord alternatifleri, Discord’dan geçiş, sesli sohbet ve topluluk yönetimi. Arkadaş grupları ve oyuncular için pratik yazılar.",
    changefreq: "weekly",
    priority: "0.75",
    lang: "tr",
  },
  ...TR_LANDING_META.map((m) => ({
    path: m.path,
    title: m.title,
    description: m.description,
    h1: m.h1,
    image: "/og-discord.png",
    changefreq: "weekly",
    priority: m.path === "/tr/discord-alternatifi" ? "0.9" : "0.8",
    lang: "tr",
  })),
  ...TR_BLOG_META.map((p) => ({
    path: p.path,
    title: p.title,
    description: p.description,
    ogType: "article",
    changefreq: "monthly",
    priority: "0.5",
    lang: "tr",
  })),
  // Public server directory (item 8): /communities and /tr/topluluklar, one page per
  // category. Category pages with fewer than 3 listed servers are noindex at build time
  // (scripts/prerender-seo.mjs writes dist/directory-manifest.json).
  ...directoryRoutes(),
];

/**
 * Routes of a prefixed locale: one per mirrored English page (SITE_MIRROR_PATHS plus the
 * page groups the locale serves, see mirrorPathsFor), copied from the English route with
 * `locale` / `enPath` set. Title and description stay English here and are translated
 * where they are rendered (localizeRouteMeta), because the catalogs load lazily in the
 * browser. English keywords are dropped. Tooling passes `paths` to get staged pages too.
 */
export function localeMirrorRoutes(locale, { paths = mirrorPathsFor(locale) } = {}) {
  return paths.map((enPath) => {
    const en = BASE_ROUTES.find((r) => r.path === enPath);
    if (!en) throw new Error(`[seoConfig] mirror path without an English route: ${enPath}`);
    const { keywords: _keywords, ...rest } = en;
    return { ...rest, path: withLocalePrefix(enPath, locale), lang: locale, locale, enPath };
  });
}

/** Public indexable routes (must match sitemap staticPages + MarketingApp). */
export const PUBLIC_ROUTES = [...BASE_ROUTES, ...PREFIXED_SITE_LOCALES.flatMap((id) => localeMirrorRoutes(id))];

/** Title / description / h1 of a prefixed-locale route through `translate(text, locale)`. */
export function localizeRouteMeta(route, translate) {
  if (!route?.locale || typeof translate !== "function") return route;
  const out = { ...route, title: translate(route.title, route.locale), description: translate(route.description, route.locale) };
  if (route.h1) out.h1 = translate(route.h1, route.locale);
  return out;
}

export function routeMeta(pathname) {
  const clean = (pathname || "/").replace(/\/+$/, "") || "/";
  const hit = PUBLIC_ROUTES.find((r) => r.path === clean);
  if (hit) return { ...hit, noindex: false };
  const stripped = stripLocalePrefix(clean);
  if (stripped !== clean) {
    const enHit = PUBLIC_ROUTES.find((r) => r.path === stripped);
    if (enHit) return { ...enHit, noindex: false };
  }
  // Auth deep-links, crawlable entry should be marketing pages, not thin auth URLs
  if (clean === "/register" || clean === "/login") {
    return {
      path: clean,
      title: clean === "/register" ? "Create account | Descall" : "Sign in | Descall",
      description: "Create a free Descall account for chat, voice, video, and screen share.",
      noindex: true,
    };
  }
  if (clean.startsWith("/app")) {
    return {
      path: clean,
      title: "Descall",
      description: "Descall app",
      noindex: true,
    };
  }
  return {
    path: clean,
    title: "Page not found | Descall",
    description: "This page does not exist on Descall.",
    noindex: true,
  };
}

const TR_TITLES = {
  "/privacy": {
    title: "Descall Gizlilik Politikası",
    description:
      "Descall gizlilik politikası: hesap, mesajlar, IP ve arama üst verisi, saklama süreleri ve erişim/silme hakları.",
  },
  "/terms": {
    title: "Descall Hizmet Şartları",
    description:
      "Descall web ve masaüstü uygulaması için hizmet şartları: yaş (13+), kabul edilebilir kullanım ve hesaplar.",
  },
  "/copyright": {
    title: "Descall telif hakkı bildirimleri",
    description:
      "Descall’a telif bildirimi veya karşı bildirim göndermek için contact@descall.com adresini kullan.",
  },
  "/login": {
    title: "Giriş yap | Descall",
    description: "Descall hesabına giriş yap. Sohbet, ses, görüntü ve ekran paylaşımı.",
  },
  "/register": {
    title: "Hesap oluştur | Descall",
    description: "Ücretsiz Descall hesabını oluştur. Sohbet, ses, görüntü ve ekran paylaşımı.",
  },
  "/status": {
    title: "Descall hizmet durumu",
    description: "Descall beta hizmet durumu, API sağlığı ve destek.",
  },
  "/blog": {
    title: "Descall blog | Discord alternatifleri ve sesli sohbet",
    description: "Descall rehberleri: Discord alternatifi, sunucular ve sesli sohbet.",
  },
  "/alternatives": {
    title: "Discord alternatifleri | Descall karşılaştırması",
    description: "Discord alternatiflerini Descall ile karşılaştırın. Ücretsiz ses, sunucular ve ekran paylaşımı.",
  },
};

/** Document title follows the active locale, including English-canonical URLs. */
export function routeMetaForLocale(pathname, locale) {
  const meta = routeMeta(pathname);
  // Prefixed-locale pages carry `locale`; SeoHead translates their title and description.
  if (meta.locale) return meta;
  if (locale !== "tr") return meta;
  const clean = (pathname || "/").replace(/\/+$/, "") || "/";
  const bare = stripLocalePrefix(clean);
  const override = TR_TITLES[bare] || TR_TITLES[clean];
  if (override) return { ...meta, ...override, lang: "tr" };
  if (meta.title === "Page not found, Descall") {
    return {
      ...meta,
      title: "Sayfa bulunamadı | Descall",
      description: "Bu sayfa Descall’da bulunmuyor.",
      lang: "tr",
    };
  }
  if (!clean.startsWith("/tr")) {
    const trHit = PUBLIC_ROUTES.find((r) => r.path === `/tr${bare === "/" ? "" : bare}`);
    if (trHit) {
      return { ...meta, title: trHit.title, description: trHit.description || meta.description, lang: "tr" };
    }
  }
  return { ...meta, lang: meta.lang || "tr" };
}
