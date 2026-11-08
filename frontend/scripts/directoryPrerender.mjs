/**
 * Public server directory pages in the prerender (item 8): data, crawlable HTML, JSON-LD.
 * Used by scripts/prerender-seo.mjs (pages, dist/directory-manifest.json),
 * scripts/generate-seo-files.mjs and scripts/seo-validate.mjs (the manifest).
 *
 * Data: GET <api>/api/directory/snapshot at build time (DIRECTORY_API_URL, else
 * VITE_API_BASE_URL, else the production API), or DIRECTORY_SNAPSHOT_FILE (a saved
 * snapshot JSON, for local checks). DIRECTORY_PRERENDER=0 skips the request. Any failure
 * (offline build, timeout, migration not applied) falls back to empty lists: the build
 * never fails, the pages still render, and every category page is noindex and out of the
 * sitemap until a later build sees enough servers.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const imp = (rel) => import(pathToFileURL(path.join(root, rel)).href);

const {
  DIRECTORY_CATEGORIES,
  DIRECTORY_MIN_PAGE_SERVERS,
  directoryPath,
  directoryTwinPath,
  directoryPageServers,
  directoryPageCount,
  summarizeDirectoryCards,
  thinDirectoryPaths,
} = await imp("src/site/directory/directoryPaths.js");
const { directoryCopy, directoryText, directoryLanguageName, directoryCrumbs } = await imp("src/site/directory/directoryRoutes.js");
const { buildDirectoryItemListLd, directoryCardId } = await imp("src/site/directory/directoryLd.js");
const { DIRECTORY_LANGUAGES, DIRECTORY_DESCRIPTION_MAX, DIRECTORY_TAGS_MAX } = await imp("src/lib/serverDirectory.js");

export const DIRECTORY_MANIFEST = "directory-manifest.json";
const PRODUCTION_API = "https://des-call.onrender.com";
const CATEGORY_PAGE_MAX = 48;
const INDEX_POPULAR_MAX = 12;

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function cleanCard(raw) {
  if (!raw || typeof raw !== "object" || !raw.id) return null;
  if (!DIRECTORY_CATEGORIES.includes(raw.category)) return null;
  const icon = typeof raw.iconUrl === "string" && /^https:\/\/[^\s"'<>]+$/.test(raw.iconUrl) ? raw.iconUrl : null;
  return {
    id: String(raw.id),
    name: String(raw.name || "").slice(0, 100),
    iconUrl: icon,
    description: raw.description ? String(raw.description).slice(0, DIRECTORY_DESCRIPTION_MAX) : null,
    category: raw.category,
    language: DIRECTORY_LANGUAGES.includes(raw.language) ? raw.language : "other",
    tags: (Array.isArray(raw.tags) ? raw.tags : []).slice(0, DIRECTORY_TAGS_MAX).map((t) => String(t).slice(0, 24)),
    memberCount: Math.max(0, Math.floor(Number(raw.memberCount) || 0)),
    onlineCount: Math.max(0, Math.floor(Number(raw.onlineCount) || 0)),
    listedAt: raw.listedAt ? String(raw.listedAt) : null,
  };
}

/** Normalized directory data: { source, available, cards, categories, thin }. */
export function directoryDataFrom(json, source) {
  const cards = (Array.isArray(json?.servers) ? json.servers : []).map(cleanCard).filter(Boolean);
  const available = Boolean(json?.available) && cards.length > 0;
  const categories = summarizeDirectoryCards(cards);
  return { source, available, builtAt: json?.builtAt || null, cards, categories, thin: thinDirectoryPaths(available ? categories : null) };
}

export function emptyDirectoryData(source) {
  return directoryDataFrom({ available: false, servers: [] }, source);
}

export async function loadDirectoryData({ env = process.env, fetchImpl = globalThis.fetch, timeoutMs = 8000, log = console } = {}) {
  if (env.DIRECTORY_SNAPSHOT_FILE) {
    try {
      return directoryDataFrom(JSON.parse(fs.readFileSync(env.DIRECTORY_SNAPSHOT_FILE, "utf8")), "file");
    } catch (err) {
      log.warn(`[directory] could not read DIRECTORY_SNAPSHOT_FILE (${err?.message || err}), using empty lists`);
      return emptyDirectoryData("fallback");
    }
  }
  if (env.DIRECTORY_PRERENDER === "0" || typeof fetchImpl !== "function") return emptyDirectoryData("disabled");
  const base = String(env.DIRECTORY_API_URL || env.VITE_API_BASE_URL || PRODUCTION_API).replace(/\/+$/, "");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(`${base}/api/directory/snapshot`, { signal: ctrl.signal, headers: { accept: "application/json" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = directoryDataFrom(await res.json(), "api");
    log.log(`[directory] ${data.cards.length} listed servers from ${base}; ${data.thin.length} thin category pages (noindex)`);
    return data;
  } catch (err) {
    log.warn(`[directory] ${base} unreachable (${err?.name === "AbortError" ? "timeout" : err?.message || err}): pages render with empty lists, category pages are noindex`);
    return emptyDirectoryData("fallback");
  } finally {
    clearTimeout(timer);
  }
}

/** dist/directory-manifest.json: what this build decided (read by sitemap and validator). */
export function writeDirectoryManifest(distDir, data) {
  const body = {
    source: data.source,
    available: data.available,
    builtAt: data.builtAt,
    minPageServers: DIRECTORY_MIN_PAGE_SERVERS,
    thin: data.thin,
    counts: Object.fromEntries(
      ["en", "tr"].map((lang) => [lang, Object.fromEntries(DIRECTORY_CATEGORIES.map((id) => [id, directoryPageCount(data.categories, lang, id)]))])
    ),
  };
  fs.writeFileSync(path.join(distDir, DIRECTORY_MANIFEST), `${JSON.stringify(body, null, 2)}\n`, "utf8");
  return body;
}

/** Thin paths of the last build, or every category page when there is no manifest. */
export function readDirectoryThinPaths(distDir) {
  try {
    const body = JSON.parse(fs.readFileSync(path.join(distDir, DIRECTORY_MANIFEST), "utf8"));
    if (Array.isArray(body.thin)) return body.thin;
  } catch {
    /* no manifest: treat every category page as thin */
  }
  return thinDirectoryPaths(null);
}

function sortByMembers(list) {
  return [...list].sort((a, b) => b.memberCount - a.memberCount || a.name.localeCompare(b.name));
}

/** Servers a page shows (same order as the React page's default sort). */
export function directoryPageList(data, lang, category) {
  const list = sortByMembers(directoryPageServers(data?.cards || [], lang, category));
  return list.slice(0, category ? CATEGORY_PAGE_MAX : INDEX_POPULAR_MAX);
}

function cardHtml(lang, s, joinHref) {
  const t = (key, vars) => directoryText(lang, key, vars);
  const meta = [
    t("members", { count: s.memberCount }),
    s.onlineCount ? t("online", { count: s.onlineCount }) : "",
    `${t("languageLabel")}: ${directoryLanguageName(lang, s.language)}`,
  ].filter(Boolean);
  const icon = s.iconUrl
    ? `<img class="seo-dir-icon" src="${esc(s.iconUrl)}" width="48" height="48" alt="${esc(s.name)}" loading="lazy" decoding="async" />`
    : "";
  const tags = s.tags.length ? `<p class="seo-note">${esc(t("tagsLabel"))}: ${s.tags.map((x) => `#${esc(x)}`).join(" ")}</p>` : "";
  return `<li class="seo-dir-item" id="${directoryCardId(s.id)}">${icon}<h3>${esc(s.name)}</h3>${
    s.description ? `<p>${esc(s.description)}</p>` : ""
  }<p class="seo-note">${meta.map(esc).join(" · ")}</p>${tags}<p><a class="seo-lbtn is-soft" href="${esc(joinHref(s))}" rel="nofollow">${esc(t("join"))}</a></p></li>`;
}

function categoryLinksHtml(lang, data, current) {
  const copy = directoryCopy(lang);
  const t = (key, vars) => directoryText(lang, key, vars);
  const items = DIRECTORY_CATEGORIES.map((id) => {
    const href = directoryPath(lang, id);
    const count = directoryPageCount(data.categories, lang, id);
    const label = `${copy.cat[id].h1} (${t("categoryCount", { count })})`;
    return `<li><a href="${href}"${id === current ? ' aria-current="page"' : ""}>${esc(label)}</a></li>`;
  });
  if (current) items.unshift(`<li><a href="${directoryPath(lang)}">${esc(t("allTopics"))}</a></li>`);
  return `<nav class="seo-lrelated" aria-label="${esc(t("categoriesTitle"))}"><h2>${esc(t("categoriesTitle"))}</h2><ul>${items.join("")}</ul></nav>`;
}

/**
 * Crawlable <main> of a directory route. `ui` gives the prerender's own pieces:
 * { landingHeroHtml, seoSiteNav, brand }.
 */
export function directoryBodyHtml(route, data, ui) {
  const { lang, category } = route.directory;
  const copy = directoryCopy(lang);
  const t = (key, vars) => directoryText(lang, key, vars);
  const pagePath = directoryPath(lang, category);
  const servers = directoryPageList(data, lang, category);
  // The join button reopens this page with ?join=<id>; the React page asks the API for the
  // server's invite and opens it. Crawlers see a nofollow link back to the page itself.
  const joinHref = (s) => `${pagePath}?join=${encodeURIComponent(s.id)}`;
  const crumbs = directoryCrumbs(lang, category).map((c) => [c.path, c.name]);
  const twin = directoryTwinPath(pagePath, lang === "tr" ? "en" : "tr");
  const listTitle = category ? t("listTitle") : t("popularTitle");
  const list = servers.length
    ? `<ol class="seo-dir-list">${servers.map((s) => cardHtml(lang, s, joinHref)).join("")}</ol>`
    : `<p><strong>${esc(t("emptyTitle"))}</strong></p><p>${esc(t("emptyBody"))}</p>`;
  return `
<main class="seo-main-landing">
  ${ui.brand}
  <article class="seo-landing">
  ${ui.landingHeroHtml({
    loc: lang,
    crumbs,
    h1: category ? copy.cat[category].h1 : copy.home.h1,
    lead: category ? copy.cat[category].intro : copy.home.lead,
    startLabel: t("ctaStart"),
    secondary: twin ? { href: twin, label: t("otherLanguage") } : null,
  })}
  <div class="seo-lbody">
  <section class="seo-lsec"><h2>${esc(listTitle)}</h2>
  ${list}
  </section>
  <section class="seo-lsec"><h2>${esc(t("howTitle"))}</h2>
  ${copy.ui.how.map((p) => `<p>${esc(p)}</p>`).join("\n  ")}
  </section>
  <section class="seo-lsec"><h2>${esc(t("ctaTitle"))}</h2><p>${esc(t("ctaBody"))}</p><p><a class="seo-lbtn is-soft" href="${lang === "tr" ? "/tr/download" : "/download"}">${esc(t("ctaDownload"))}</a></p></section>
  </div>
  ${categoryLinksHtml(lang, data, category)}
  </article>
  ${ui.seoSiteNav(lang)}
</main>`;
}

/** JSON-LD graphs of a directory route: BreadcrumbList + ItemList. */
export function directoryJsonLd(route, data, buildBreadcrumbLd) {
  const { lang, category } = route.directory;
  const graphs = [buildBreadcrumbLd(directoryCrumbs(lang, category))];
  const list = buildDirectoryItemListLd({ lang, category, servers: directoryPageList(data, lang, category) });
  if (list) graphs.push(list);
  return graphs;
}
