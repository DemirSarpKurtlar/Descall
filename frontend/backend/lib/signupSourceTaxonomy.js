"use strict";

/**
 * Granular signup source taxonomy (group -> sub-source).
 *
 * Inputs are only first-party data we already collect (or collect additively):
 * UTM params, click ids, referrer host, landing path, invite context and the
 * client platform. No user identifiers are read or logged here.
 *
 * Why "Direkt" used to swallow most signups: the old classifier fell back to
 * "direct" whenever no referrer was present — which is true for the iOS app,
 * Electron (file://), in-app browsers that strip the referrer, server-invite
 * and friend-invite landings, email links without UTM, and even signups where
 * no attribution snapshot was sent at all. All of those now get their own bucket.
 */

const GROUPS = [
  "paid",
  "search",
  "social",
  "video",
  "community",
  "messaging",
  "app_store",
  "invite",
  "email",
  "campaign",
  "website",
  "app_direct",
  "direct",
  "unknown",
];

const PAID_MEDIA = new Set(["cpc", "ppc", "paid", "paidsearch", "paid_search", "paid_social", "paidsocial", "cpm", "cpv", "display", "banner", "ads", "ad", "sponsored", "pam"]);
const EMAIL_MEDIA = new Set(["email", "e-mail", "mail", "newsletter", "e_mail"]);

// host pattern -> [group, sub]
const HOST_RULES = [
  [/(^|\.)googleadservices\.com$|(^|\.)doubleclick\.net$|(^|\.)googlesyndication\.com$/, "paid", "google_ads"],
  [/(^|\.)(accounts|myaccount)\.google\./, "unknown", "oauth_return"],
  [/(^|\.)appleid\.apple\.com$/, "unknown", "oauth_return"],
  [/(^|\.)mail\.google\.com$|(^|\.)outlook\.(live|office)\.com$|(^|\.)mail\.yahoo\.com$|(^|\.)mail\.yandex\.|(^|\.)icloud\.com$|(^|\.)proton(mail)?\.me$/, "email", "webmail"],
  [/(^|\.)google\.[a-z.]+$|^google$/, "search", "google"],
  [/(^|\.)bing\.com$|(^|\.)msn\.com$/, "search", "bing"],
  [/(^|\.)yandex\.[a-z.]+$|(^|\.)ya\.ru$/, "search", "yandex"],
  [/(^|\.)duckduckgo\.com$/, "search", "duckduckgo"],
  [/(^|\.)yahoo\.[a-z.]+$/, "search", "yahoo"],
  [/(^|\.)ecosia\.org$/, "search", "ecosia"],
  [/(^|\.)search\.brave\.com$/, "search", "brave"],
  [/(^|\.)baidu\.com$/, "search", "baidu"],
  [/(^|\.)(chatgpt\.com|openai\.com|perplexity\.ai|gemini\.google\.com|claude\.ai|copilot\.microsoft\.com)$/, "search", "ai_assistant"],
  [/(^|\.)instagram\.com$|^l\.instagram\.com$/, "social", "instagram"],
  [/(^|\.)tiktok\.com$/, "social", "tiktok"],
  [/^t\.co$|(^|\.)twitter\.com$|^x\.com$/, "social", "x"],
  [/(^|\.)facebook\.com$|^fb\.com$|^m\.facebook\.com$|^lm\.facebook\.com$/, "social", "facebook"],
  [/(^|\.)threads\.net$|(^|\.)threads\.com$/, "social", "threads"],
  [/(^|\.)linkedin\.com$|^lnkd\.in$/, "social", "linkedin"],
  [/(^|\.)snapchat\.com$/, "social", "snapchat"],
  [/(^|\.)pinterest\.[a-z.]+$/, "social", "pinterest"],
  [/(^|\.)bsky\.app$/, "social", "bluesky"],
  [/(^|\.)youtube\.com$|^youtu\.be$/, "video", "youtube"],
  [/(^|\.)twitch\.tv$/, "video", "twitch"],
  [/(^|\.)kick\.com$/, "video", "kick"],
  [/(^|\.)reddit\.com$|^redd\.it$/, "community", "reddit"],
  [/(^|\.)discord\.com$|(^|\.)discordapp\.com$|^discord\.gg$/, "community", "discord"],
  [/(^|\.)eksisozluk\.com$|(^|\.)eksisozluk1923\.com$/, "community", "eksisozluk"],
  [/(^|\.)technopat\.net$|(^|\.)donanimhaber\.com$|(^|\.)r10\.net$|(^|\.)forum\./, "community", "forum"],
  [/(^|\.)producthunt\.com$/, "community", "producthunt"],
  [/(^|\.)news\.ycombinator\.com$/, "community", "hackernews"],
  [/(^|\.)github\.com$/, "community", "github"],
  [/(^|\.)whatsapp\.com$|^wa\.me$/, "messaging", "whatsapp"],
  [/(^|\.)telegram\.(org|me)$|^t\.me$/, "messaging", "telegram"],
  [/(^|\.)messenger\.com$/, "messaging", "messenger"],
  [/(^|\.)apps\.apple\.com$|(^|\.)itunes\.apple\.com$/, "app_store", "app_store"],
  [/(^|\.)testflight\.apple\.com$/, "app_store", "testflight"],
  [/(^|\.)play\.google\.com$/, "app_store", "google_play"],
  [/(^|\.)microsoft\.com$/, "app_store", "microsoft_store"],
];

// utm_source keyword -> [group, sub]
const UTM_RULES = {
  google: ["search", "google"], googleads: ["paid", "google_ads"], adwords: ["paid", "google_ads"], google_ads: ["paid", "google_ads"], google_organic: ["search", "google"],
  bing: ["search", "bing"], yandex: ["search", "yandex"], duckduckgo: ["search", "duckduckgo"], ddg: ["search", "duckduckgo"], yahoo: ["search", "yahoo"],
  chatgpt: ["search", "ai_assistant"], "chatgpt.com": ["search", "ai_assistant"], openai: ["search", "ai_assistant"], perplexity: ["search", "ai_assistant"],
  instagram: ["social", "instagram"], ig: ["social", "instagram"], tiktok: ["social", "tiktok"], tt: ["social", "tiktok"],
  twitter: ["social", "x"], x: ["social", "x"], facebook: ["social", "facebook"], fb: ["social", "facebook"], meta: ["social", "facebook"],
  threads: ["social", "threads"], linkedin: ["social", "linkedin"], snapchat: ["social", "snapchat"], pinterest: ["social", "pinterest"], bluesky: ["social", "bluesky"],
  youtube: ["video", "youtube"], yt: ["video", "youtube"], twitch: ["video", "twitch"], kick: ["video", "kick"],
  reddit: ["community", "reddit"], discord: ["community", "discord"], eksisozluk: ["community", "eksisozluk"], producthunt: ["community", "producthunt"], github: ["community", "github"],
  whatsapp: ["messaging", "whatsapp"], wa: ["messaging", "whatsapp"], telegram: ["messaging", "telegram"], messenger: ["messaging", "messenger"],
  appstore: ["app_store", "app_store"], app_store: ["app_store", "app_store"], ios: ["app_store", "app_store"], testflight: ["app_store", "testflight"], googleplay: ["app_store", "google_play"], google_play: ["app_store", "google_play"],
  newsletter: ["email", "newsletter"], email: ["email", "email_campaign"], mail: ["email", "email_campaign"], resend: ["email", "transactional"],
  referral: ["invite", "referral_code"], invite: ["invite", "friend_invite"], friend: ["invite", "friend_invite"],
  direct: ["direct", "typed"],
};

const PAID_SUB = { google: "google_ads", bing: "bing_ads", yandex: "yandex_ads", facebook: "meta_ads", instagram: "meta_ads", tiktok: "tiktok_ads", x: "x_ads", reddit: "reddit_ads", youtube: "youtube_ads", linkedin: "linkedin_ads", snapchat: "snapchat_ads", app_store: "apple_search_ads" };

const PLATFORMS = ["web_desktop", "web_mobile", "web_tablet", "electron_windows", "electron_macos", "electron_linux", "ios_app", "ipad_app", "android_app", "watch", "unknown"];

const OWN_HOST_RE = /(^|\.)descall\.com$|^localhost$|^127\.0\.0\.1$|^descall\.vercel\.app$/;

function lc(value, max = 160) {
  return String(value == null ? "" : value).replace(/<[^>]*>/g, "").trim().slice(0, max).toLowerCase();
}

function hostOf(referrer) {
  const raw = String(referrer || "").trim();
  if (!raw) return "";
  if (/^android-app:\/\//i.test(raw)) {
    const pkg = raw.replace(/^android-app:\/\//i, "").split("/")[0].toLowerCase();
    return `android-app:${pkg}`;
  }
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    return url.hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

function pathOf(landing) {
  const raw = String(landing || "").trim();
  if (!raw) return "";
  if (raw.startsWith("/")) return raw.split("#")[0];
  try {
    const url = new URL(raw);
    return `${url.pathname}${url.search}`;
  } catch {
    return "";
  }
}

const ANDROID_APP_HOSTS = {
  "com.instagram.android": ["social", "instagram"],
  "com.zhiliaoapp.musically": ["social", "tiktok"],
  "com.twitter.android": ["social", "x"],
  "com.facebook.katana": ["social", "facebook"],
  "com.whatsapp": ["messaging", "whatsapp"],
  "org.telegram.messenger": ["messaging", "telegram"],
  "com.discord": ["community", "discord"],
  "com.reddit.frontpage": ["community", "reddit"],
  "com.google.android.youtube": ["video", "youtube"],
  "com.google.android.gm": ["email", "webmail"],
  "com.google.android.googlequicksearchbox": ["search", "google"],
};

function classifyHost(host) {
  if (!host) return null;
  if (host.startsWith("android-app:")) {
    const hit = ANDROID_APP_HOSTS[host.slice(12)];
    return hit ? { group: hit[0], sub: hit[1] } : { group: "website", sub: "android_app_other" };
  }
  for (const [re, group, sub] of HOST_RULES) {
    if (re.test(host)) return { group, sub };
  }
  return null;
}

function siteDetail(host) {
  return host.replace(/^(m|l|lm|mobile|amp)\./, "").slice(0, 80);
}

/** Landing path / query hints that imply an invite. */
function inviteFromPath(path) {
  const p = String(path || "");
  if (/^\/(servers\/join|invite\/s)\/[A-Za-z0-9_-]+/i.test(p) || /[?&]si=[A-Za-z0-9_-]+/.test(p)) return "server_invite";
  if (/^\/(invite|i)\/[A-Za-z0-9_-]+/i.test(p) || /[?&](invite|i)=[A-Za-z0-9_-]+/.test(p)) return "group_invite";
  if (/[?&](ref|inviteBy)=[A-Za-z0-9_.-]{2,24}/.test(p)) return "friend_invite";
  if (/[?&](code|referral|promo)=[A-Za-z0-9_-]{3,}/i.test(p)) return "referral_code";
  return "";
}

/**
 * Client platform from an explicit client hint + user-agent.
 * hint: what the client says it is (web | electron | ios | android | watch).
 */
function resolvePlatform({ clientPlatform, userAgent, signupOs, signupDevice } = {}) {
  const hint = lc(clientPlatform, 32);
  const ua = String(userAgent || "");
  const os = lc(signupOs, 16) || (/iPhone|iPad|iPod/i.test(ua) ? "ios" : /Android/i.test(ua) ? "android" : /Windows NT/i.test(ua) ? "windows" : /Mac OS X/i.test(ua) ? "macos" : /Linux/i.test(ua) ? "linux" : "");
  const device = lc(signupDevice, 16) || (/iPad|Tablet/i.test(ua) ? "tablet" : /Mobile|Android|iPhone|iPod/i.test(ua) ? "mobile" : ua ? "desktop" : "");
  if (hint === "watch" || /watchOS|AppleWatch/i.test(ua)) return "watch";
  if (hint === "electron" || /Electron\//i.test(ua) || /Descall-Desktop/i.test(ua)) {
    if (os === "windows") return "electron_windows";
    if (os === "macos") return "electron_macos";
    if (os === "linux") return "electron_linux";
    return "electron_windows";
  }
  if (hint === "ios" || hint === "ipad" || /DescallApp|Capacitor/i.test(ua)) {
    if (hint === "ipad" || device === "tablet") return "ipad_app";
    if (os === "android") return "android_app";
    return "ios_app";
  }
  if (hint === "android") return "android_app";
  if (!device && !os) return "unknown";
  if (device === "mobile") return "web_mobile";
  if (device === "tablet") return "web_tablet";
  return "web_desktop";
}

function isNativePlatform(platform) {
  return /^(electron_|ios_app|ipad_app|android_app|watch)/.test(platform || "");
}

/**
 * Classify one signup.
 * @returns {{group:string, sub:string, detail:string}}
 */
function classifySignupSource(input = {}) {
  const utmSource = lc(input.utm_source, 64).replace(/\s+/g, "_");
  const utmMedium = lc(input.utm_medium, 64);
  const campaign = String(input.utm_campaign || "").trim().slice(0, 80);
  const host = hostOf(input.referrer);
  const path = pathOf(input.landing_page || input.landing_path);
  const platform = input.platform || "unknown";
  const paid = PAID_MEDIA.has(utmMedium);

  // 1. Paid click ids are the strongest signal.
  if (input.gclid || input.gbraid || input.wbraid) return { group: "paid", sub: "google_ads", detail: campaign };
  if (input.msclkid) return { group: "paid", sub: "bing_ads", detail: campaign };
  if (input.yclid) return { group: "paid", sub: "yandex_ads", detail: campaign };
  if (input.ttclid) return { group: "paid", sub: "tiktok_ads", detail: campaign };
  if (input.twclid) return { group: "paid", sub: "x_ads", detail: campaign };
  if (input.fbclid && paid) return { group: "paid", sub: "meta_ads", detail: campaign };

  // 2. Explicit invite context (server invite, group invite, friend ref, code).
  const inviteKind = lc(input.invite_kind, 32);
  if (inviteKind === "server_invite" || inviteKind === "group_invite" || inviteKind === "friend_invite" || inviteKind === "referral_code") {
    return { group: "invite", sub: inviteKind, detail: "" };
  }
  if (input.invitedBy || input.referred_by) return { group: "invite", sub: "friend_invite", detail: "" };
  const pathInvite = inviteFromPath(path);
  if (pathInvite) return { group: "invite", sub: pathInvite, detail: "" };

  // 3. UTM tags.
  if (utmSource || utmMedium) {
    if (EMAIL_MEDIA.has(utmMedium)) {
      return { group: "email", sub: utmMedium === "newsletter" ? "newsletter" : utmSource === "resend" || /transactional|welcome|verify/.test(campaign.toLowerCase()) ? "transactional" : "email_campaign", detail: campaign || utmSource };
    }
    const rule = UTM_RULES[utmSource] || null;
    if (paid) {
      const key = rule ? rule[1] : utmSource;
      const sub = PAID_SUB[key] || (rule && rule[0] === "social" ? "paid_social" : "paid_other");
      return { group: "paid", sub, detail: sub === "paid_other" || sub === "paid_social" ? utmSource || campaign : campaign };
    }
    if (rule) return { group: rule[0], sub: rule[1], detail: campaign };
    if (/^(qr|qrcode|poster|flyer|print|sticker)$/.test(utmSource) || utmMedium === "qr" || utmMedium === "offline") {
      return { group: "campaign", sub: "qr_offline", detail: campaign || utmSource };
    }
    if (utmMedium === "influencer" || utmMedium === "creator" || utmMedium === "sponsor") {
      return { group: "campaign", sub: "influencer", detail: utmSource || campaign };
    }
    if (utmMedium === "social") return { group: "social", sub: "social_other", detail: utmSource };
    if (utmMedium === "organic" || utmMedium === "search") return { group: "search", sub: "search_other", detail: utmSource };
    return { group: "campaign", sub: "utm_other", detail: utmSource || utmMedium };
  }
  if (input.fbclid) return { group: "social", sub: "facebook", detail: "" };

  // 4. Referrer host.
  if (host && !OWN_HOST_RE.test(host)) {
    const hit = classifyHost(host);
    if (hit) return { ...hit, detail: hit.group === "website" ? host : "" };
    return { group: "website", sub: "other_site", detail: siteDetail(host) };
  }

  // 5. No external referrer: native app opens vs real direct vs no data.
  const hasSnapshot = Boolean(input.has_snapshot || input.landing_page || input.landing_path || input.captured_at);
  if (isNativePlatform(platform)) {
    if (platform === "ios_app" || platform === "ipad_app") return { group: "app_direct", sub: "ios_app", detail: "" };
    if (platform === "android_app") return { group: "app_direct", sub: "android_app", detail: "" };
    if (platform === "watch") return { group: "app_direct", sub: "watch", detail: "" };
    if (platform === "electron_macos") return { group: "app_direct", sub: "desktop_macos", detail: "" };
    if (platform === "electron_linux") return { group: "app_direct", sub: "desktop_linux", detail: "" };
    return { group: "app_direct", sub: "desktop_windows", detail: "" };
  }
  if (!hasSnapshot) {
    return { group: "unknown", sub: input.legacy ? "legacy" : "no_data", detail: "" };
  }
  if (host && OWN_HOST_RE.test(host)) return { group: "direct", sub: "internal_nav", detail: "" };
  const lp = path.split("?")[0];
  if (/^\/(download|indir)/i.test(lp)) return { group: "direct", sub: "download_page", detail: "" };
  if (lp === "/" || lp === "") return { group: "direct", sub: "typed", detail: "" };
  return { group: "direct", sub: "deep_link", detail: lp.slice(0, 60) };
}

/**
 * Reclassify a stored users row (read-time; never writes). Prefers the new
 * signup_source_* columns, otherwise derives from legacy first_touch_* data.
 */
function classifyUserRow(row = {}) {
  const platform = row.signup_platform || resolvePlatform({ signupOs: row.signup_os, signupDevice: row.signup_device });
  if (row.signup_source_group && GROUPS.includes(row.signup_source_group)) {
    return { group: row.signup_source_group, sub: row.signup_source_sub || "other", detail: row.signup_source_detail || "", platform };
  }
  const legacySource = lc(row.first_touch_source, 64);
  const hasAny = Boolean(legacySource || row.first_touch_referrer || row.first_touch_landing_page || row.first_touch_gclid || row.referred_by);
  if (!hasAny) return { group: "unknown", sub: "legacy", detail: "", platform };
  // Legacy snapshots store a bare path only when the page was not http(s):
  // capacitor:// (iOS/Android app) or file:// (Electron). The web always
  // stored a full https URL, so a bare path + no referrer is a native app open.
  const lpRaw = String(row.first_touch_landing_page || "");
  if ((legacySource === "direct" || !legacySource) && lpRaw.startsWith("/") && !row.first_touch_referrer && !row.referred_by) {
    const os = lc(row.signup_os, 16);
    const nativePlatform = os === "ios" ? (lc(row.signup_device) === "tablet" ? "ipad_app" : "ios_app") : os === "android" ? "android_app" : os === "macos" ? "electron_macos" : os === "linux" ? "electron_linux" : os === "windows" ? "electron_windows" : "";
    if (nativePlatform) {
      const r = classifySignupSource({ platform: nativePlatform });
      return { ...r, platform: row.signup_platform || nativePlatform };
    }
  }
  let utmSource = "";
  let utmMedium = "";
  if (legacySource === "google_ads" || legacySource === "bing_ads") {
    utmSource = legacySource.replace(/_ads$/, "");
    utmMedium = "cpc";
  } else if (legacySource && !["direct", "other", "google_organic", "bing_organic", "referral"].includes(legacySource)) {
    utmSource = legacySource;
    const m = lc(row.first_touch_medium, 64);
    if (m && !["none", "referral", "organic"].includes(m)) utmMedium = m;
  }
  const res = classifySignupSource({
    utm_source: utmSource,
    utm_medium: utmMedium,
    utm_campaign: row.first_touch_campaign,
    gclid: row.first_touch_gclid,
    referrer: row.first_touch_referrer,
    landing_page: row.first_touch_landing_page,
    referred_by: row.referred_by,
    invite_kind: legacySource === "referral" ? "friend_invite" : "",
    platform,
    has_snapshot: Boolean(row.first_touch_landing_page || row.first_touch_referrer),
    legacy: true,
  });
  if (res.group === "unknown" && (legacySource === "google_organic" || legacySource === "bing_organic")) {
    return { group: "search", sub: legacySource.replace("_organic", ""), detail: "", platform };
  }
  if (res.group === "unknown" && legacySource === "other") return { group: "website", sub: "other_site", detail: "", platform };
  return { ...res, platform };
}

function pct(n, total) {
  return total ? Math.round((n / total) * 1000) / 10 : 0;
}

/** Group -> sub -> detail tree with counts and percentages. */
function aggregateSourceBreakdown(rows = []) {
  const total = rows.length;
  const groups = new Map();
  const platforms = new Map();
  for (const row of rows) {
    const c = classifyUserRow(row);
    if (!groups.has(c.group)) groups.set(c.group, { count: 0, subs: new Map() });
    const g = groups.get(c.group);
    g.count += 1;
    if (!g.subs.has(c.sub)) g.subs.set(c.sub, { count: 0, details: new Map(), platforms: new Map() });
    const s = g.subs.get(c.sub);
    s.count += 1;
    if (c.detail) s.details.set(c.detail, (s.details.get(c.detail) || 0) + 1);
    s.platforms.set(c.platform, (s.platforms.get(c.platform) || 0) + 1);
    platforms.set(c.platform, (platforms.get(c.platform) || 0) + 1);
  }
  const sortDesc = (a, b) => b.count - a.count || String(a.key).localeCompare(String(b.key));
  const groupList = [...groups.entries()]
    .map(([key, g]) => ({
      key,
      count: g.count,
      pct: pct(g.count, total),
      subs: [...g.subs.entries()]
        .map(([subKey, s]) => ({
          key: subKey,
          count: s.count,
          pct: pct(s.count, total),
          pctOfGroup: pct(s.count, g.count),
          details: [...s.details.entries()].map(([k, n]) => ({ key: k, count: n })).sort(sortDesc).slice(0, 15),
          platforms: [...s.platforms.entries()].map(([k, n]) => ({ key: k, count: n })).sort(sortDesc),
        }))
        .sort(sortDesc),
    }))
    .sort(sortDesc);
  return {
    total,
    groups: groupList,
    platforms: [...platforms.entries()].map(([key, count]) => ({ key, count, pct: pct(count, total) })).sort(sortDesc),
  };
}

/** New nullable users columns written at signup. */
function buildSignupSourceColumns({ snapshot = {}, invitedBy, userAgent } = {}) {
  const platform = resolvePlatform({ clientPlatform: snapshot.client_platform, userAgent });
  const hasSnapshot = Boolean(snapshot && (snapshot.landing_page || snapshot.landing_path || snapshot.captured_at));
  const c = classifySignupSource({ ...snapshot, invitedBy, platform, has_snapshot: hasSnapshot });
  return {
    signup_source_group: c.group,
    signup_source_sub: c.sub,
    signup_source_detail: c.detail ? String(c.detail).slice(0, 120) : null,
    signup_platform: platform,
    first_touch_utm_source: snapshot.utm_source ? String(snapshot.utm_source).slice(0, 128) : null,
  };
}

module.exports = {
  GROUPS,
  PLATFORMS,
  classifySignupSource,
  classifyUserRow,
  resolvePlatform,
  aggregateSourceBreakdown,
  buildSignupSourceColumns,
  inviteFromPath,
  hostOf,
};
