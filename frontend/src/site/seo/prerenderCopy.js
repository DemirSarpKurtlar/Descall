/**
 * Crawlable copy for prerendered #seo-static shells (visible until React hydrates).
 *
 * Every helper takes a site locale `loc`: "en", "tr" or a prefixed locale ("de", ...).
 * `true` / `false` still mean "tr" / "en" for older call sites. Turkish keeps its
 * hand-written objects; prefixed locales translate the English values through the
 * site catalog (siteText.js), so translators always work from the English text.
 */
import { MARKETING_TR } from "../marketingPhrases.tr.js";
import { hreflangPair } from "../localePaths.js";
import { siteText } from "../siteText.js";
import { SITE_LOCALES, isMirrorPath, isPrefixedLocale, localeNativeName, localePrefix, withLocalePrefix } from "../siteLocales.js";

/** Extra TR strings for prerender bodies that are not always in the slim catalog. */
const EXTRA_TR = {
  "Descall Features, Free Voice, Screen Share & Servers":
    "Descall Özellikleri, Ücretsiz Ses, Ekran Paylaşımı ve Sunucular",
  "See what’s included for free: HD voice/video, screen share, Discord-style servers, roles, and templates.":
    "Ücretsiz neler var: HD ses/görüntü, ekran paylaşımı, Discord tarzı sunucular, roller ve şablonlar.",
  "Servers & community tools": "Sunucular ve topluluk araçları",
  "Full server structure with categories, text, voice, and stage channels":
    "Kategorili metin, ses ve sahne kanallarıyla tam sunucu yapısı",
  "Role hierarchy with hoist/mention and per-channel permission overrides":
    "Hoist/mention’lı rol hiyerarşisi ve kanal bazlı izinler",
  "Kick, ban, timeout, audit logs, community rules, and invite links":
    "Kick, ban, timeout, denetim kayıtları, topluluk kuralları ve davet linkleri",
  "Advanced templates with ready-made roles and staff rooms":
    "Hazır roller ve staff odalarıyla gelişmiş şablonlar",
  "Chat, calls & screen share": "Sohbet, aramalar ve ekran paylaşımı",
  "Real-time DMs and server chat with typing indicators":
    "Yazıyor göstergeli anlık DM ve sunucu sohbeti",
  "WebRTC voice and HD video for groups and server lobbies":
    "Gruplar ve sunucu lobileri için WebRTC ses ve HD görüntü",
  "Screen share with quality presets for games, VODs, and watch parties":
    "Oyun, VOD ve izleme partileri için kalite hazır ayarlı ekran paylaşımı",
  "Gaming extras": "Oyun ekstraları",
  "Gaming server templates with squad-up and scrim rooms":
    "Ekip toplama ve scrim odalı oyun sunucusu şablonları",
  "Optional DesCoin cosmetics, core chat and calls stay free":
    "İsteğe bağlı DesCoin kozmetikleri, temel sohbet ve aramalar ücretsiz kalır",
  "Descall vs Discord": "Descall vs Discord",
  "Descall FAQ, Free Discord Alternative": "Descall SSS, Ücretsiz Discord Alternatifi",
  "Frequently asked questions about Descall": "Descall hakkında sıkça sorulan sorular",
  "Answers about accounts, servers, desktop download, calls, screen share, and privacy.":
    "Hesaplar, sunucular, masaüstü indirme, aramalar, ekran paylaşımı ve gizlilik hakkında yanıtlar.",
  "Contact support": "Destek ile iletişim",
  "Download Descall": "Descall’ı indir",
  "Download Descall for Windows, Free Voice Chat App":
    "Windows için Descall indir, Ücretsiz sesli sohbet",
  "Get the Windows desktop app, Android builds, or the full web app in your browser.":
    "Windows masaüstü uygulamasını, Android derlemelerini veya tarayıcıdaki tam web uygulamasını alın.",
  "Platforms": "Platformlar",
  "Windows installer for the native desktop client": "Yerel masaüstü istemcisi için Windows kurucusu",
  "Android APK builds for mobile": "Mobil için Android APK derlemeleri",
  "Full-featured web app at descall.com, no install required":
    "descall.com’da tam özellikli web uygulaması, kurulum gerekmez",
  "What you get": "Neler var",
  "Servers, roles, channels, and moderation tools": "Sunucular, roller, kanallar ve moderasyon araçları",
  "Chat, voice, video, and screen share": "Sohbet, ses, görüntü ve ekran paylaşımı",
  "Friend presence and activity": "Arkadaş durumu ve etkinlik",
  "See features": "Özelliklere bak",
  "About Descall": "Descall Hakkında",
  "Who owns Descall?": "Descall’ın sahibi kim?",
  "Descall is an independent messaging and voice platform built for friends, gaming squads, and small communities who want Discord-style servers without Nitro paywalls on core chat and calls.":
    "Descall; arkadaşlar, oyun ekipleri ve küçük topluluklar için Discord tarzı sunucular isteyen bağımsız bir mesajlaşma ve ses platformudur, temel sohbet ve aramalarda Nitro duvarı yoktur.",
  "Operator": "İşletmeci",
  "Owner / founder / CEO": "Sahip / kurucu / CEO",
  "Product": "Ürün",
  "Based in": "Ülke",
  "Support": "Destek",
  "Source": "Kaynak",
  "What we build": "Ne inşa ediyoruz",
  "Real-time messaging, Discord-style servers, WebRTC voice/video, and screen share, with privacy policies and security docs you can actually read.":
    "Anlık mesajlaşma, Discord tarzı sunucular, WebRTC ses/görüntü ve ekran paylaşımı, okunabilir gizlilik ve güvenlik dokümanlarıyla.",
  "Last updated": "Son güncelleme",
  "Contact": "İletişim",
  "Contact Descall": "Descall ile iletişim",
  "Support, feedback, press, and security reports.": "Destek, geri bildirim, basın ve güvenlik raporları.",
  "Support & feedback": "Destek ve geri bildirim",
  "Security": "Güvenlik",
  "Security at Descall": "Descall’da güvenlik",
  "How Descall protects chats and calls, encryption in transit, account security, and honest limits.":
    "Descall sohbet ve aramaları nasıl korur, aktarımda şifreleme, hesap güvenliği ve dürüst sınırlar.",
  "Report an issue": "Sorun bildir",
  "FAQ": "SSS",
  "Open the web app": "Web uygulamasını aç",
  "Descall is an independent beta product. Core chat, servers, and voice are free while we grow with real communities.":
    "Descall bağımsız bir beta üründür. Temel sohbet, sunucular ve ses, gerçek topluluklarla büyürken ücretsizdir.",
  "Accounts": "Hesaplar",
};

/** Normalise a locale argument: true -> "tr", false / empty -> "en". */
export function siteLoc(loc) {
  if (loc === true) return "tr";
  if (!loc) return "en";
  return String(loc);
}

/** English text in the visitor's language: Turkish copy for tr, the site catalog for prefixed locales. */
export function trCopy(s, loc) {
  const l = siteLoc(loc);
  if (l === "en" || s == null) return s;
  const key = String(s);
  if (l === "tr") return EXTRA_TR[key] || MARKETING_TR[key] || key;
  return siteText(key, l);
}

/**
 * English text that the Turkish shells also show in English (no Turkish copy exists).
 * Only prefixed locales translate it, so Turkish output stays exactly as it was.
 */
export function newCopy(s, loc) {
  const l = siteLoc(loc);
  if (s == null || !isPrefixedLocale(l)) return s;
  return siteText(String(s), l);
}

/** Turkish text for tr, otherwise the English text (translated for prefixed locales). */
export function localeCopy(loc, en, tr) {
  return siteLoc(loc) === "tr" ? tr : newCopy(en, loc);
}

/** Every string value in a plain object / array tree through newCopy. */
function translateTree(value, loc, skip = new Set()) {
  if (typeof value === "string") return newCopy(value, loc);
  if (Array.isArray(value)) return value.map((v) => translateTree(v, loc));
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = skip.has(k) ? v : translateTree(v, loc);
    return out;
  }
  return value;
}

/** Home URL of a site language: "/", "/tr", "/de". */
export function homeHref(loc) {
  const l = siteLoc(loc);
  if (l === "tr") return "/tr";
  if (isPrefixedLocale(l)) return localePrefix(l);
  return "/";
}

export function navLabels(loc) {
  const l = siteLoc(loc);
  if (isPrefixedLocale(l)) return translateTree(navLabels("en"), l, new Set(["turkish"]));
  return l === "tr"
    ? {
        explore: "Keşfet",
        features: "Özellikler",
        alternative: "Discord alternatifi",
        alternatives: "Alternatifler",
        vsDiscord: "Discord karşılaştırması",
        apps: "Discord benzeri uygulamalar",
        blog: "Blog",
        faq: "SSS",
        download: "İndir",
        privacy: "Gizlilik",
        terms: "Şartlar",
        about: "Hakkında",
        contact: "İletişim",
        startFree: "Ücretsiz başla",
        signIn: "Giriş yap",
        turkish: "Türkçe",
      }
    : {
        explore: "Explore",
        features: "Features",
        alternative: "Discord alternative",
        alternatives: "Alternatives",
        vsDiscord: "vs Discord",
        apps: "Apps like Discord",
        blog: "Blog",
        faq: "FAQ",
        download: "Download",
        privacy: "Privacy",
        terms: "Terms",
        about: "About",
        contact: "Contact",
        startFree: "Start free",
        signIn: "Sign in",
        turkish: "Türkçe",
      };
}

export function authHref(loc, mode) {
  return `${homeHref(loc)}?auth=${mode}`;
}

export function heroCtaHtml(loc = "en") {
  const n = navLabels(loc);
  const h = (path) => prefixHref(path, loc);
  return `<p class="seo-cta-row">
    <a class="seo-cta-primary" href="${authHref(loc, "register")}" data-hydrate data-auth="register">${n.startFree}</a>
    <a class="seo-cta-soft" href="${authHref(loc, "login")}" data-hydrate data-auth="login">${n.signIn}</a>
    <a class="seo-cta-soft" href="${h("/download")}">${n.download}</a>
  </p>`;
}

export function cookieCopy(loc) {
  const l = siteLoc(loc);
  if (isPrefixedLocale(l)) return translateTree(cookieCopy("en"), l);
  return l === "tr"
    ? {
        aria: "Çerez tercihleri",
        body: "İsteğe bağlı analitik. Zorunlu çerezler açık kalır.",
        privacy: "Gizlilik",
        reject: "Reddet",
        accept: "Kabul et",
      }
    : {
        aria: "Cookie preferences",
        body: "Optional analytics only. Essentials stay on.",
        privacy: "Privacy",
        reject: "Reject",
        accept: "Accept",
      };
}

export function homeHero(loc) {
  const l = siteLoc(loc);
  if (isPrefixedLocale(l)) return translateTree(homeHero("en"), l);
  return l === "tr"
    ? {
        statusNote:
          "Descall bağımsız bir beta üründür. Temel sohbet, sunucular ve ses, gerçek topluluklarla büyürken ücretsizdir.",
        h1: "Birlikte konuşun",
        lead: "Arkadaşlarınla sesli sohbet, ekran paylaşımı ve sunucular. iPhone, Android, Windows ve tarayıcıda aynı hesap.",
        voiceTitle: "Sohbetin yanında ses",
        voiceBody: "Ses kanalına sunucu listesinden katıl. Ekranı 720p paylaş. iPhone, Android, Windows ve tarayıcı aynı hesabı kullanır.",
        serversTitle: "Rol ve kanallı sunucular",
        serversBody: "Şablondan ya da boş bir sunucudan başla. Şablonlarda metin kanalları, ses kanalları ve Yönetici, Moderatör, Üye rolleri vardır.",
        serversPoints: [
          "Duyuru, ekip toplama ve yetkili kanalları şablonlarda hazırdır.",
          "Staff kick, ban, timeout uygulayabilir ve denetim kaydını okuyabilir.",
          "Ses kanalları metin kanallarının yanındadır.",
        ],
        why: "Ekipler neden geçiyor",
        bullets: [
          "Rol, kanal izni, davet ve moderasyonlu Discord tarzı sunucular",
          "Temel iletişimde Nitro duvarı olmadan HD ses/görüntü ve ekran paylaşımı",
          "Bot karmaşası olmadan hazır oyun şablonları",
          "iPhone, Windows masaüstü, Android ve tam web uygulaması",
        ],
        core: "Temel özellikler",
        features: [
          "Sunucular ve kanallar, kategorili metin, ses ve sahne",
          "Roller ve izinler, hiyerarşi, staff odaları, kanal bazlı izin",
          "Gelişmiş şablonlar, Gaming, Friends, Community, Study, Streaming",
          "Anlık sohbet, DM ve sunucu mesajlaşması",
          "Ses, görüntü ve ekran paylaşımı, kalite hazır ayarlı WebRTC",
        ],
        downloadDescall: "Descall’ı indir",
        exploreFeatures: "Özellikleri keşfet",
        whyCards: [
          {
            title: "Gerçek sunucular",
            body: "Rol, kanal izni, davet ve moderasyonlu Discord tarzı sunucular",
          },
          {
            title: "HD aramalar",
            body: "Temel iletişimde Nitro duvarı olmadan ses, görüntü ve ekran paylaşımı",
          },
          {
            title: "Oyun şablonları",
            body: "Bot karmaşası olmadan hazır ekip toplama ve scrim kanalları",
          },
          {
            title: "Her cihaz",
            body: "iPhone, Windows masaüstü, Android ve tam web uygulaması",
          },
        ],
        featureCards: [
          {
            title: "Sunucular ve kanallar",
            body: "Kategorili metin, ses ve sahne",
          },
          {
            title: "Roller ve izinler",
            body: "Hiyerarşi, staff odaları, kanal bazlı izin",
          },
          {
            title: "Gelişmiş şablonlar",
            body: "Gaming, Friends, Community, Study, Streaming",
          },
          {
            title: "Anlık sohbet",
            body: "DM ve sunucu mesajlaşması",
          },
          {
            title: "Ses ve ekran paylaşımı",
            body: "Kalite hazır ayarlı WebRTC",
          },
        ],
      }
    : {
        statusNote:
          "Descall is an independent beta product. Core chat, servers, and voice are free while we grow with real communities.",
        h1: "Talk together",
        lead: "Voice chat, screen sharing, and servers with your friends. One account on iPhone, Android, Windows, and the browser.",
        voiceTitle: "Voice next to the chat",
        voiceBody: "Join a voice channel from the server list. Share your screen at 720p. iPhone, Android, Windows, and the browser use one account.",
        serversTitle: "Servers with roles and channels",
        serversBody: "Start from a template or an empty server. Templates include text channels, voice channels, and roles such as Admin, Moderator, and Member.",
        serversPoints: [
          "Announcements, squad-up, and staff channels are already in the templates.",
          "Staff can kick, ban, timeout, and read an audit log.",
          "Voice channels sit beside the text channels.",
        ],
        why: "Why teams switch",
        bullets: [
          "Discord-style servers with roles, channel overrides, invites, and moderation",
          "HD voice/video and screen share without Nitro paywalls on core communication",
          "Gaming templates so squads get set up without bot hell",
          "iPhone, Windows desktop, Android, and full web app",
        ],
        core: "Core features",
        features: [
          "Servers & channels, text, voice, and stage with categories",
          "Roles & permissions, hierarchy, staff rooms, per-channel allow/deny",
          "Advanced templates, Gaming, Friends, Community, Study, Streaming",
          "Real-time chat, DMs and server messaging with presence",
          "Voice, video & screen share, WebRTC calls with quality presets",
        ],
        downloadDescall: "Download Descall",
        exploreFeatures: "Explore features",
        whyCards: [
          {
            title: "Real servers",
            body: "Discord-style servers with roles, channel overrides, invites, and moderation",
          },
          {
            title: "HD calls",
            body: "Voice, video, and screen share without Nitro paywalls on core communication",
          },
          {
            title: "Gaming templates",
            body: "Ready-made squad-up and scrim channels, no bot hell",
          },
          {
            title: "Every device",
            body: "iPhone, Windows desktop, Android, and full web app",
          },
        ],
        featureCards: [
          {
            title: "Servers & channels",
            body: "Text, voice, and stage with categories",
          },
          {
            title: "Roles & permissions",
            body: "Hierarchy, staff rooms, per-channel allow/deny",
          },
          {
            title: "Advanced templates",
            body: "Gaming, Friends, Community, Study, Streaming",
          },
          {
            title: "Real-time chat",
            body: "DMs and server messaging with presence",
          },
          {
            title: "Voice & screen share",
            body: "WebRTC calls with quality presets",
          },
        ],
      };
}

/**
 * Map an EN marketing href to its twin: the Turkish pair (true 1:1 pairs only) for tr,
 * the /<prefix> mirror for prefixed locales. Pages without a twin keep the EN href.
 */
export function prefixHref(href, loc) {
  const l = siteLoc(loc);
  if (l === "en") return href;
  if (href === "/tr" || href.startsWith("/tr/")) return href;
  if (l === "tr") {
    const pair = hreflangPair(href);
    if (pair) return pair.tr;
    return href;
  }
  return isMirrorPath(href) ? withLocalePrefix(href, l) : href;
}

export function cookieBannerHtml(loc) {
  const c = cookieCopy(loc);
  const privacyHref = siteLoc(loc) === "tr" ? "/gizlilik" : prefixHref("/privacy", loc);
  return `<div id="mkt-consent-static" role="dialog" aria-label="${c.aria}">
      <p>
        ${c.body}
        <a class="privacy" href="${privacyHref}">${c.privacy}</a>
      </p>
      <div class="actions">
        <button type="button" class="reject" data-consent="rejected">${c.reject}</button>
        <button type="button" class="accept" data-consent="accepted">${c.accept}</button>
      </div>
    </div>`;
}

function footerItem(href, label) {
  return `<li><a href="${href}">${label}</a></li>`;
}

/** Turkish hub pages linked from every Turkish shell footer. */
export const TR_HUB_LINKS = [
  ["/tr/discord-acildi-mi", "Discord açıldı mı?"],
  ["/tr/discord-alternatifleri", "Discord alternatifleri"],
  ["/tr/turk-discord", "Türk Discord’u"],
  ["/tr/discord-yerine-ne-kullanilir", "Discord yerine ne kullanılır?"],
  ["/tr/sesli-sohbet-uygulamasi", "Sesli sohbet uygulaması"],
  ["/tr/oyuncu-sohbet-uygulamasi", "Oyuncu sohbet uygulaması"],
];

/** Other site languages as footer links to their home pages ("Türkçe" on English pages). */
function languageLinks(loc, locales) {
  const l = siteLoc(loc);
  return locales
    .filter((id) => id !== l)
    .map((id) => footerItem(homeHref(id), id === "en" ? "English" : localeNativeName(id)));
}

export function seoSiteNavHtml(loc = "en", { locales = SITE_LOCALES } = {}) {
  const l = siteLoc(loc);
  const isTr = l === "tr";
  const n = navLabels(l);
  const h = (path) => prefixHref(path, l);
  const product = isTr ? "Ürün" : newCopy("Product", l);
  const company = isTr ? "Şirket" : newCopy("Company", l);
  return `<footer class="seo-footer">
  ${heroCtaHtml(l)}
  <div class="seo-footer-grid">
    <section>
      <h2>${product}</h2>
      <ul>
        ${footerItem(h("/features"), n.features)}
        ${footerItem(h("/download"), n.download)}
        ${footerItem(h("/faq"), n.faq)}
      </ul>
    </section>
    <section>
      <h2>${n.explore}</h2>
      <ul>
        ${
          isTr
            ? [
                footerItem("/tr/discord-alternatifi", n.alternative),
                ...TR_HUB_LINKS.map(([to, label]) => footerItem(to, label)),
                footerItem("/tr/compare/discord", n.vsDiscord),
                footerItem("/tr/blog", n.blog),
              ].join("\n        ")
            : [
                footerItem(h("/discord-alternative"), n.alternative),
                footerItem(h("/compare/discord"), n.vsDiscord),
                footerItem(h("/alternatives"), n.alternatives),
                footerItem("/apps-like-discord", n.apps),
                footerItem("/blog", n.blog),
              ].join("\n        ")
        }
      </ul>
    </section>
    <section>
      <h2>${company}</h2>
      <ul>
        ${footerItem(h("/about"), n.about)}
        ${footerItem(isTr ? "/descall-sahibi" : h("/who-owns-descall"), isTr ? "Descall’ın sahibi kim?" : newCopy("Who owns Descall?", l))}
        ${footerItem(h("/contact"), n.contact)}
        ${footerItem(h("/privacy"), n.privacy)}
        ${footerItem(h("/terms"), n.terms)}
        ${footerItem(h("/copyright"), isTr ? "Telif hakkı" : newCopy("Copyright", l))}
        ${languageLinks(l, locales).join("\n        ")}
      </ul>
    </section>
  </div>
</footer>`;
}

export function noscriptNavHtml(loc = "en") {
  const l = siteLoc(loc);
  const isTr = l === "tr";
  const n = navLabels(l);
  const h = (path) => prefixHref(path, l);
  return `<noscript>
      <nav aria-label="Descall">
        <a href="${homeHref(l)}">Descall</a>
        <a href="${h("/discord-alternative")}">${n.alternative}</a>
        <a href="${h("/features")}">${n.features}</a>
        <a href="${h("/download")}">${n.download}</a>
        <a href="${h("/faq")}">${n.faq}</a>
        <a href="${h("/about")}">${n.about}</a>
        <a href="${isTr ? "/descall-sahibi" : h("/who-owns-descall")}">${isTr ? "Descall’ın sahibi kim?" : newCopy("Who owns Descall?", l)}</a>
        <a href="${h("/privacy")}">${n.privacy}</a>
        <a href="${h("/terms")}">${n.terms}</a>
        <a href="${h("/copyright")}">${isTr ? "Telif hakkı" : newCopy("Copyright", l)}</a>
        <a href="${h("/contact")}">${n.contact}</a>
      </nav>
    </noscript>`;
}
