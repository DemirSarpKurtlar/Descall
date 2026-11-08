/**
 * Link previews for invite URLs (used by _worker.js).
 *
 * WhatsApp, Instagram DMs, Telegram, X and iMessage read the HTML head without running
 * JavaScript, so every invite link showed the generic homepage card. For an invite path
 * the worker asks the backend for the same public preview the invite page shows a
 * logged-out visitor, then rewrites the head of the app shell: title, description,
 * Open Graph, Twitter card, noindex and the iOS Smart App Banner with the invite URL as
 * app-argument. Any failure (timeout, unknown code, backend down) keeps the shell as it is.
 *
 * Invite URLs (src/lib/serverInviteRoute.js, src/lib/inviteLinks.js):
 *   /servers/join/:code, /invite/s/:code   server invite  GET /api/servers/invites/:code
 *   /s/:slug                               server vanity  GET /api/servers/vanity/:slug
 *   /invite/:code, /i/:code                group invite   GET /api/groups/invite-links/:code
 *
 * Only the default export of _worker.js may exist, so the helpers live here.
 * Tested by src/site/invitePreview.selftest.mjs (no network).
 */

/** Keep in sync with src/site/appStoreLink.js (the selftest checks it). */
export const APP_STORE_ID = "6820558264";
export const SMART_BANNER_CONTENT = `app-id=${APP_STORE_ID}`;
/** The API host the web app uses on descall.com (src/config/api.js PRODUCTION_URL). */
export const DEFAULT_API_ORIGIN = "https://des-call.onrender.com";
export const SITE_ORIGIN = "https://descall.com";
/** Successful previews are kept at the edge this long. */
export const PREVIEW_TTL_SECONDS = 300;
/** Unknown / expired codes are kept a little, so a bad link cannot hammer the backend. */
export const MISSING_TTL_SECONDS = 60;
/** Link-preview crawlers wait for the HTML; people should not wait on a cold backend. */
export const BOT_TIMEOUT_MS = 2500;
export const VISITOR_TIMEOUT_MS = 700;

const SERVER_CODE_RE = /^[A-Za-z0-9_-]{4,32}$/;
const GROUP_CODE_RE = /^[A-Za-z0-9_-]{2,64}$/;
const VANITY_RE = /^[a-z0-9][a-z0-9-]{2,31}$/;

const PREVIEW_BOT_RE =
  /facebookexternalhit|facebot|meta-externalagent|whatsapp|instagram|telegrambot|twitterbot|slackbot|discordbot|linkedinbot|skypeuripreview|applebot|imessage|redditbot|pinterest|vkshare|embedly|bingpreview|googlebot|google-inspectiontool|yandex|snapchat|viber|line\/|kakaotalk|signal|mastodon|bluesky|preview/i;

function decodeSegment(raw) {
  try {
    return decodeURIComponent(String(raw || ""));
  } catch {
    return "";
  }
}

/**
 * Invite target of a (bare, no trailing slash) path, or null.
 * @returns {{ kind: "server"|"vanity"|"group", code: string, apiPath: string } | null}
 */
export function inviteTarget(pathname) {
  const path = String(pathname || "");
  let m = path.match(/^\/servers\/join\/([^/]+)$/i) || path.match(/^\/invite\/s\/([^/]+)$/i);
  if (m) {
    const code = decodeSegment(m[1]);
    return SERVER_CODE_RE.test(code) ? { kind: "server", code, apiPath: `/api/servers/invites/${encodeURIComponent(code)}` } : null;
  }
  m = path.match(/^\/s\/([^/]+)$/i);
  if (m) {
    const slug = decodeSegment(m[1]).toLowerCase();
    return VANITY_RE.test(slug) ? { kind: "vanity", code: slug, apiPath: `/api/servers/vanity/${encodeURIComponent(slug)}` } : null;
  }
  m = path.match(/^\/(?:invite|i)\/([^/]+)$/i);
  if (m) {
    const code = decodeSegment(m[1]);
    return GROUP_CODE_RE.test(code) ? { kind: "group", code, apiPath: `/api/groups/invite-links/${encodeURIComponent(code)}` } : null;
  }
  return null;
}

/** True when the path is an invite URL at all (even with a malformed code). */
export function isInvitePath(pathname) {
  return /^\/(?:servers\/join|invite|i|s)(?:\/|$)/i.test(String(pathname || ""));
}

export function isPreviewBot(userAgent) {
  return PREVIEW_BOT_RE.test(String(userAgent || ""));
}

/** "en" or "tr" from Accept-Language (highest q wins, ties keep the header order). Fallback en. */
export function previewLang(acceptLanguage) {
  let best = { lang: "en", q: -1 };
  for (const part of String(acceptLanguage || "").split(",")) {
    const [tag, ...params] = part.trim().split(";");
    const base = tag.trim().toLowerCase().split("-")[0];
    if (base !== "en" && base !== "tr") continue;
    const qParam = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
    const q = qParam ? Number(qParam.slice(2)) : 1;
    if (Number.isFinite(q) && q > best.q) best = { lang: base, q };
  }
  return best.lang;
}

/** Plain one-line text: no control characters, collapsed spaces, at most `max` characters. */
export function cleanText(value, max = 100) {
  const s = String(value ?? "")
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2066-\u2069]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (s.length <= max) return s;
  return `${s.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

/** Safe inside an HTML attribute value and in text content. */
export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function count(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
}

function httpsUrl(value) {
  const s = String(value || "").trim();
  if (!s || s.length > 2048) return null;
  try {
    const u = new URL(s);
    return u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

/**
 * The fields a logged-out visitor already sees on the invite page, from the backend reply.
 * Server / vanity: anonymousServerPreview (routes/servers.js). Group: GET /groups/invite-links/:code.
 */
export function normalizePreview(kind, body) {
  if (!body || typeof body !== "object") return null;
  if (kind === "group") {
    const g = body.group;
    const name = cleanText(g?.name, 100);
    if (!name) return null;
    return { kind, name, iconUrl: httpsUrl(g?.avatarUrl), memberCount: count(g?.memberCount), onlineCount: null, description: "" };
  }
  const s = body.server;
  const name = cleanText(s?.name, 100);
  if (!name) return null;
  return {
    kind,
    name,
    iconUrl: httpsUrl(s?.iconUrl),
    memberCount: count(s?.memberCount),
    onlineCount: count(s?.onlineCount),
    description: cleanText(s?.description, 160),
  };
}

const COPY = {
  en: {
    locale: "en_US",
    intl: "en-US",
    serverTitle: (name) => `Join ${name} on Descall`,
    groupTitle: (name) => `Join ${name} on Descall`,
    members: (n, f) => (n === 1 ? "1 member" : `${f(n)} members`),
    online: (n, f) => `${f(n)} online`,
    serverTail: "Voice chat, servers and screen share. Free to join.",
    groupTail: "You're invited to a group chat on Descall. Free to join.",
    imageAlt: (name) => `${name} on Descall`,
    defaultImage: "/og-invite.png",
  },
  tr: {
    locale: "tr_TR",
    intl: "tr-TR",
    serverTitle: (name) => `Descall'da ${name} sunucusuna katıl`,
    groupTitle: (name) => `Descall'da ${name} grubuna katıl`,
    members: (n, f) => `${f(n)} üye`,
    online: (n, f) => `${f(n)} çevrimiçi`,
    serverTail: "Sesli sohbet, sunucular ve ekran paylaşımı. Katılmak ücretsiz.",
    groupTail: "Descall'da bir grup sohbetine davet edildin. Katılmak ücretsiz.",
    imageAlt: (name) => `Descall'da ${name}`,
    defaultImage: "/og-invite-tr.png",
  },
};

/**
 * Head markup for one invite (every value escaped).
 * @param {ReturnType<typeof normalizePreview>} preview
 * @param {{ lang?: string, url: string, appArgument?: string|null }} opts
 *   url: the invite URL shown in the preview; appArgument: what the Smart App Banner opens
 */
export function inviteHeadHtml(preview, { lang = "en", url, appArgument = null }) {
  const c = COPY[lang] || COPY.en;
  const nf = new Intl.NumberFormat(c.intl);
  const f = (n) => nf.format(n);
  const title = preview.kind === "group" ? c.groupTitle(preview.name) : c.serverTitle(preview.name);
  const counts = [];
  if (preview.memberCount) counts.push(c.members(preview.memberCount, f));
  if (preview.onlineCount) counts.push(c.online(preview.onlineCount, f));
  const tail = preview.kind === "group" ? c.groupTail : preview.description || c.serverTail;
  const description = cleanText([counts.join(", "), tail].filter(Boolean).join(" · "), 300);
  const image = preview.iconUrl || `${SITE_ORIGIN}${c.defaultImage}`;
  const a = escapeHtml;
  const tags = [
    `<title>${a(title)}</title>`,
    `<meta name="description" content="${a(description)}" />`,
    `<meta name="robots" content="noindex, follow" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="Descall" />`,
    `<meta property="og:title" content="${a(title)}" />`,
    `<meta property="og:description" content="${a(description)}" />`,
    `<meta property="og:url" content="${a(url)}" />`,
    `<meta property="og:image" content="${a(image)}" />`,
    ...(preview.iconUrl
      ? []
      : [
          `<meta property="og:image:type" content="image/png" />`,
          `<meta property="og:image:width" content="1200" />`,
          `<meta property="og:image:height" content="630" />`,
        ]),
    `<meta property="og:image:alt" content="${a(c.imageAlt(preview.name))}" />`,
    `<meta property="og:locale" content="${c.locale}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${a(title)}" />`,
    `<meta name="twitter:description" content="${a(description)}" />`,
    `<meta name="twitter:image" content="${a(image)}" />`,
    `<meta name="twitter:image:alt" content="${a(c.imageAlt(preview.name))}" />`,
    smartBannerTag(appArgument),
  ];
  return `\n    ${tags.join("\n    ")}\n  `;
}

/** iOS Smart App Banner; the app opens `argument` (an https descall.com URL) when given. */
export function smartBannerTag(argument) {
  const content = argument ? `${SMART_BANNER_CONTENT}, app-argument=${argument}` : SMART_BANNER_CONTENT;
  return `<meta name="apple-itunes-app" content="${escapeHtml(content)}" />`;
}

/** Public URL of the invite page (path only, no query: tracking parameters stay out). */
export function inviteUrl(pathname) {
  return `${SITE_ORIGIN}${pathname}`;
}

function cacheKey(target) {
  return new Request(`${SITE_ORIGIN}/__edge/invite-preview/v1/${target.kind}/${encodeURIComponent(target.code)}`);
}

/**
 * Public invite preview, edge-cached for PREVIEW_TTL_SECONDS. Never throws: null on any failure.
 * @param {{ kind: string, code: string, apiPath: string }} target
 * @param {{ apiOrigin?: string, fetchImpl?: typeof fetch, cache?: Cache | null, timeoutMs?: number,
 *           clientIp?: string, waitUntil?: (p: Promise<unknown>) => void }} opts
 */
export async function fetchInvitePreview(target, opts = {}) {
  const {
    apiOrigin = DEFAULT_API_ORIGIN,
    fetchImpl = fetch,
    cache = null,
    timeoutMs = VISITOR_TIMEOUT_MS,
    clientIp = "",
    waitUntil = null,
  } = opts;
  const key = cacheKey(target);
  if (cache) {
    try {
      const hit = await cache.match(key);
      if (hit) {
        const body = await hit.json().catch(() => null);
        return body && !body.missing ? normalizePreview(target.kind, body) : null;
      }
    } catch {
      /* cache unavailable: ask the backend */
    }
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res;
  try {
    const headers = { accept: "application/json", "user-agent": "DescallLinkPreview/1.0 (+https://descall.com)" };
    // Per-visitor lookup limit on the backend (rejectJoinRate) instead of one bucket for the edge.
    if (clientIp) headers["x-forwarded-for"] = clientIp;
    res = await fetchImpl(`${String(apiOrigin).replace(/\/$/, "")}${target.apiPath}`, {
      headers,
      signal: controller.signal,
      redirect: "manual",
    });
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }

  const store = (body, ttl) => {
    if (!cache) return;
    const put = cache
      .put(
        key,
        new Response(JSON.stringify(body), {
          headers: { "content-type": "application/json", "cache-control": `public, max-age=${ttl}` },
        })
      )
      .catch(() => {});
    if (waitUntil) waitUntil(put);
  };

  if (res.status === 404 || res.status === 410 || res.status === 400) {
    store({ missing: true }, MISSING_TTL_SECONDS);
    return null;
  }
  if (!res.ok) return null;
  let body;
  try {
    body = await res.json();
  } catch {
    return null;
  }
  const preview = normalizePreview(target.kind, body);
  if (!preview) return null;
  // Store only what the preview uses, never the rest of the reply.
  store(
    target.kind === "group"
      ? { group: { name: preview.name, avatarUrl: preview.iconUrl, memberCount: preview.memberCount } }
      : {
          server: {
            name: preview.name,
            iconUrl: preview.iconUrl,
            memberCount: preview.memberCount,
            onlineCount: preview.onlineCount,
            description: preview.description,
          },
        },
    PREVIEW_TTL_SECONDS
  );
  return preview;
}

/** Head tags the invite markup replaces (and nothing else). */
const REPLACED_HEAD_SELECTORS = [
  "title",
  'meta[name="description"]',
  'meta[name="keywords"]',
  'meta[name="robots"]',
  'link[rel="canonical"]',
  "link[rel=\"alternate\"][hreflang]",
  'meta[property^="og:"]',
  'meta[name^="twitter:"]',
  'meta[name="apple-itunes-app"]',
];

const remove = { element: (el) => el.remove() };

/**
 * App shell response for an SPA path (HTMLRewriter):
 *   invite with preview  -> per-invite head (title, description, OG, Twitter, noindex, banner)
 *   invite, no preview   -> shell head; banner: true keeps the plain Smart App Banner,
 *                           a URL string makes it open that invite in the app
 *   any other app path   -> shell head without the Smart App Banner (the app is not marketing)
 */
export function rewriteShell(response, { headHtml = null, banner = false } = {}) {
  if (typeof HTMLRewriter === "undefined") return response;
  const rewriter = new HTMLRewriter();
  if (headHtml) {
    for (const selector of REPLACED_HEAD_SELECTORS) rewriter.on(selector, remove);
    rewriter.on("head", { element: (el) => el.append(headHtml, { html: true }) });
  } else if (typeof banner === "string" && banner) {
    rewriter.on('meta[name="apple-itunes-app"]', remove);
    rewriter.on("head", { element: (el) => el.append(smartBannerTag(banner), { html: true }) });
  } else if (!banner) {
    rewriter.on('meta[name="apple-itunes-app"]', remove);
  } else {
    return response;
  }
  return rewriter.transform(response);
}

/**
 * app-argument for an invite: only server invites. The iOS app routes https://descall.com
 * /servers/join/:code and /invite/s/:code (src/lib/deepLinks.js); a group invite URL there
 * would open as a server invite, and /s/:slug opens the home screen, so those get the plain
 * banner (open or install the app) without an argument.
 */
export function bannerArgumentFor(target, url) {
  return target && target.kind === "server" ? url : null;
}
