/**
 * Crawlable EN/TR copy for prerendered #seo-static shells (visible until React hydrates).
 */
import { MARKETING_TR } from "../marketingPhrases.tr.js";

/** Extra TR strings for prerender bodies that are not always in the slim catalog. */
const EXTRA_TR = {
  "Descall Features — Free Voice, Screen Share & Servers":
    "Descall Özellikleri — Ücretsiz Ses, Ekran Paylaşımı ve Sunucular",
  "See what’s included for free: HD voice/video, screen share, Discord-style servers, roles, templates, and Valorant LFG.":
    "Ücretsiz neler var: HD ses/görüntü, ekran paylaşımı, Discord tarzı sunucular, roller, şablonlar ve Valorant LFG.",
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
  "Valorant LFG lobbies, party codes, and Riot Name#TAG linking":
    "Valorant LFG lobileri, parti kodları ve Riot Name#TAG bağlantısı",
  "Optional DesCoin cosmetics — core chat and calls stay free":
    "İsteğe bağlı DesCoin kozmetikleri — temel sohbet ve aramalar ücretsiz kalır",
  "Descall vs Discord": "Descall vs Discord",
  "Descall FAQ — Free Discord Alternative": "Descall SSS — Ücretsiz Discord Alternatifi",
  "Frequently asked questions about Descall": "Descall hakkında sıkça sorulan sorular",
  "Answers about accounts, servers, desktop download, calls, screen share, and privacy.":
    "Hesaplar, sunucular, masaüstü indirme, aramalar, ekran paylaşımı ve gizlilik hakkında yanıtlar.",
  "Contact support": "Destek ile iletişim",
  "Download Descall": "Descall’ı indir",
  "Download Descall for Windows — Free Voice Chat App":
    "Windows için Descall indir — Ücretsiz sesli sohbet",
  "Get the Windows desktop app, Android builds, or the full web app in your browser.":
    "Windows masaüstü uygulamasını, Android derlemelerini veya tarayıcıdaki tam web uygulamasını alın.",
  "Platforms": "Platformlar",
  "Windows installer for the native desktop client": "Yerel masaüstü istemcisi için Windows kurucusu",
  "Android APK builds for mobile": "Mobil için Android APK derlemeleri",
  "Full-featured web app at descall.com — no install required":
    "descall.com’da tam özellikli web uygulaması — kurulum gerekmez",
  "What you get": "Neler var",
  "Servers, roles, channels, and moderation tools": "Sunucular, roller, kanallar ve moderasyon araçları",
  "Chat, voice, video, and screen share": "Sohbet, ses, görüntü ve ekran paylaşımı",
  "Valorant LFG and friend presence": "Valorant LFG ve arkadaş durumu",
  "See features": "Özelliklere bak",
  "DimaAI — Ask Dima anything": "DimaAI — Dima’ya her şeyi sorun",
  "A ChatGPT-style assistant built into Descall. Fast, Thinking, and Deep models for writing, explaining, and brainstorming with your squad.":
    "Descall’a gömülü ChatGPT tarzı asistan. Yazmak, açıklamak ve ekiple fikir üretmek için Fast, Thinking ve Deep modelleri.",
  "Three modes": "Üç mod",
  "Dima 1.1 Fast — quick answers for everyday questions":
    "Dima 1.1 Fast — günlük sorular için hızlı yanıtlar",
  "Dima 1.2 Thinking — stronger reasoning when the problem needs a second look":
    "Dima 1.2 Thinking — ikinci bakış isteyen sorunlarda daha güçlü muhakeme",
  "Dima 1.3 Deep — long analysis and max quality": "Dima 1.3 Deep — uzun analiz ve en yüksek kalite",
  "About Descall": "Descall Hakkında",
  "Who owns Descall?": "Descall’ın sahibi kim?",
  "Descall is an independent messaging and voice platform built for friends, gaming squads, and small communities who want Discord-style servers without Nitro paywalls on core chat and calls.":
    "Descall; arkadaşlar, oyun ekipleri ve küçük topluluklar için Discord tarzı sunucular isteyen bağımsız bir mesajlaşma ve ses platformudur — temel sohbet ve aramalarda Nitro duvarı yoktur.",
  "Operator": "İşletmeci",
  "Owner / founder / CEO": "Sahip / kurucu / CEO",
  "Product": "Ürün",
  "Based in": "Ülke",
  "Support": "Destek",
  "Source": "Kaynak",
  "What we build": "Ne inşa ediyoruz",
  "Real-time messaging, Discord-style servers, WebRTC voice/video, screen share, and Valorant LFG — with privacy policies and security docs you can actually read.":
    "Anlık mesajlaşma, Discord tarzı sunucular, WebRTC ses/görüntü, ekran paylaşımı ve Valorant LFG — okunabilir gizlilik ve güvenlik dokümanlarıyla.",
  "Last updated": "Son güncelleme",
  "Contact": "İletişim",
  "Contact Descall": "Descall ile iletişim",
  "Support, feedback, press, and security reports.": "Destek, geri bildirim, basın ve güvenlik raporları.",
  "Support & feedback": "Destek ve geri bildirim",
  "Security": "Güvenlik",
  "Security at Descall": "Descall’da güvenlik",
  "How Descall protects chats and calls — encryption in transit, account security, and honest limits.":
    "Descall sohbet ve aramaları nasıl korur — aktarımda şifreleme, hesap güvenliği ve dürüst sınırlar.",
  "Report an issue": "Sorun bildir",
  "FAQ": "SSS",
  "Open the web app": "Web uygulamasını aç",
  "Descall is an independent beta product. Core chat, servers, and voice are free while we grow with real communities.":
    "Descall bağımsız bir beta üründür. Temel sohbet, sunucular ve ses, gerçek topluluklarla büyürken ücretsizdir.",
  "Accounts": "Hesaplar",
};

export function trCopy(s, isTr) {
  if (!isTr || s == null) return s;
  const key = String(s);
  return EXTRA_TR[key] || MARKETING_TR[key] || key;
}

export function navLabels(isTr) {
  return isTr
    ? {
        explore: "Keşfet",
        features: "Özellikler",
        dimaai: "DimaAI",
        alternative: "Discord alternatifi",
        alternatives: "Alternatifler",
        lfg: "Valorant LFG",
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
        dimaai: "DimaAI",
        alternative: "Discord alternative",
        alternatives: "Alternatives",
        lfg: "Valorant LFG",
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

export function authHref(isTr, mode) {
  const home = isTr ? "/tr" : "/";
  return `${home}?auth=${mode}`;
}

export function heroCtaHtml(isTr = false) {
  const n = navLabels(isTr);
  const h = (path) => prefixHref(path, isTr);
  return `<p class="seo-cta-row">
    <a class="seo-cta-primary" href="${authHref(isTr, "register")}" data-hydrate data-auth="register">${n.startFree}</a>
    <a class="seo-cta-soft" href="${authHref(isTr, "login")}" data-hydrate data-auth="login">${n.signIn}</a>
    <a class="seo-cta-soft" href="${h("/download")}">${n.download}</a>
  </p>`;
}

export function cookieCopy(isTr) {
  return isTr
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

export function homeHero(isTr) {
  return isTr
    ? {
        statusNote:
          "Descall bağımsız bir beta üründür. Temel sohbet, sunucular ve ses, gerçek topluluklarla büyürken ücretsizdir.",
        h1: "Birlikte konuşun",
        lead: "Arkadaşlar ve ekipler için daha hafif bir yuva — gerçek sunucular, HD aramalar, DimaAI ve Valorant LFG. Arkadaşlar ve oyuncular için ücretsiz sohbet.",
        why: "Ekipler neden geçiyor",
        bullets: [
          "Rol, kanal izni, davet ve moderasyonlu Discord tarzı sunucular",
          "Temel iletişimde Nitro duvarı olmadan HD ses/görüntü ve ekran paylaşımı",
          "Bot karmaşası olmadan yerleşik Valorant LFG",
          "Windows masaüstü, Android ve tam web uygulaması",
        ],
        core: "Temel özellikler",
        features: [
          "Sunucular ve kanallar — kategorili metin, ses ve sahne",
          "Roller ve izinler — hiyerarşi, staff odaları, kanal bazlı izin",
          "Gelişmiş şablonlar — Gaming, Valorant, Friends, Community, Study, Streaming",
          "Anlık sohbet — DM ve sunucu mesajlaşması",
          "Ses, görüntü ve ekran paylaşımı — kalite hazır ayarlı WebRTC",
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
            title: "Valorant LFG",
            body: "Bot karmaşası olmadan yerleşik lobi ve parti kodu",
          },
          {
            title: "Her cihaz",
            body: "Windows masaüstü, Android ve tam web uygulaması",
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
            body: "Gaming, Valorant, Friends, Community, Study, Streaming",
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
        lead: "A lighter home for friends and squads — real servers, HD calls, DimaAI, and Valorant LFG. Free chat for friends and gamers.",
        why: "Why teams switch",
        bullets: [
          "Discord-style servers with roles, channel overrides, invites, and moderation",
          "HD voice/video and screen share without Nitro paywalls on core communication",
          "Built-in Valorant LFG so squads queue without bot hell",
          "Windows desktop, Android, and full web app",
        ],
        core: "Core features",
        features: [
          "Servers & channels — text, voice, and stage with categories",
          "Roles & permissions — hierarchy, staff rooms, per-channel allow/deny",
          "Advanced templates — Gaming, Valorant, Friends, Community, Study, Streaming",
          "Real-time chat — DMs and server messaging with presence",
          "Voice, video & screen share — WebRTC calls with quality presets",
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
            title: "Valorant LFG",
            body: "Built-in lobbies and party codes — no bot hell",
          },
          {
            title: "Every device",
            body: "Windows desktop, Android, and full web app",
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
            body: "Gaming, Valorant, Friends, Community, Study, Streaming",
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

export function prefixHref(href, isTr) {
  if (!isTr) return href;
  if (href === "/tr" || href.startsWith("/tr/")) return href;
  if (href === "/") return "/tr";
  if (href === "/who-owns-descall" || href === "/descall-sahibi") return "/descall-sahibi";
  if (href === "/discord-alternative" || href === "/discord-alternative-turkey") {
    return "/discord-alternative-turkey";
  }
  const mirrored = new Set([
    "/features",
    "/download",
    "/faq",
    "/dimaai",
    "/compare/discord",
    "/about",
    "/contact",
    "/security",
  ]);
  if (mirrored.has(href)) return `/tr${href}`;
  return href;
}

export function cookieBannerHtml(isTr) {
  const c = cookieCopy(isTr);
  return `<div id="mkt-consent-static" role="dialog" aria-label="${c.aria}">
      <p>
        ${c.body}
        <a class="privacy" href="/privacy">${c.privacy}</a>
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

export function seoSiteNavHtml(isTr = false) {
  const n = navLabels(isTr);
  const h = (path) => prefixHref(path, isTr);
  const product = isTr ? "Ürün" : "Product";
  const company = isTr ? "Şirket" : "Company";
  return `<footer class="seo-footer">
  ${heroCtaHtml(isTr)}
  <div class="seo-footer-grid">
    <section>
      <h2>${product}</h2>
      <ul>
        ${footerItem(h("/features"), n.features)}
        ${footerItem(h("/dimaai"), n.dimaai)}
        ${footerItem(h("/download"), n.download)}
        ${footerItem(h("/faq"), n.faq)}
      </ul>
    </section>
    <section>
      <h2>${n.explore}</h2>
      <ul>
        ${footerItem(h("/discord-alternative"), n.alternative)}
        ${footerItem("/discord-alternative-for-lfg", n.lfg)}
        ${footerItem(h("/compare/discord"), n.vsDiscord)}
        ${footerItem("/alternatives", n.alternatives)}
        ${footerItem("/apps-like-discord", n.apps)}
        ${footerItem("/blog", n.blog)}
      </ul>
    </section>
    <section>
      <h2>${company}</h2>
      <ul>
        ${footerItem(h("/about"), n.about)}
        ${footerItem(isTr ? "/descall-sahibi" : "/who-owns-descall", isTr ? "Descall’ın sahibi kim?" : "Who owns Descall?")}
        ${footerItem(h("/contact"), n.contact)}
        ${footerItem(h("/privacy"), n.privacy)}
        ${footerItem(h("/terms"), n.terms)}
        ${footerItem(isTr ? "/" : "/tr", isTr ? "English" : n.turkish)}
      </ul>
    </section>
  </div>
</footer>`;
}

export function noscriptNavHtml(isTr = false) {
  const n = navLabels(isTr);
  const h = (path) => prefixHref(path, isTr);
  return `<noscript>
      <nav aria-label="Descall">
        <a href="${isTr ? "/tr" : "/"}">Descall</a>
        <a href="${h("/discord-alternative")}">${n.alternative}</a>
        <a href="${h("/features")}">${n.features}</a>
        <a href="${h("/download")}">${n.download}</a>
        <a href="${h("/faq")}">${n.faq}</a>
        <a href="${h("/about")}">${n.about}</a>
        <a href="${isTr ? "/descall-sahibi" : "/who-owns-descall"}">${isTr ? "Descall’ın sahibi kim?" : "Who owns Descall?"}</a>
        <a href="${h("/privacy")}">${n.privacy}</a>
        <a href="${h("/terms")}">${n.terms}</a>
        <a href="${h("/contact")}">${n.contact}</a>
      </nav>
    </noscript>`;
}
