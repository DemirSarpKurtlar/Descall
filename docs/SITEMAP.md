# Sitemap / SEO

In production descall.com is a static Cloudflare Pages build: `npm run build:prod` writes `robots.txt`, `llms.txt`, `llms-full.txt`, `sitemap.xml` (index), `sitemap-{core,niches,blog,company}.xml`, `sitemap-pages.xml`, `sitemap.html` and the prerendered pages into `dist/` (`scripts/generate-seo-files.mjs`, `scripts/prerender-seo.mjs`, route list `src/site/sitemapCatalog.js`). The Express backend (`backend/routes/sitemap.js`) still answers the same URLs for self-hosted / API-host deployments.

## 3.7.14 rules

- One URL per page: `public/_worker.js` 301s a trailing-slash path (not `/`, not app routes) to the slashless one, query kept.
- App shell routes (`/app`, `/login`, `/register`, ...) send `x-robots-tag: noindex, follow`; they are never in a sitemap.
- Each sitemap `<url>` carries `xhtml:link` alternates for every served language (en, tr, de, es, fr, pt-BR, ru) plus x-default, the same set as the page `<link rel=alternate>` (`hreflangAlternates` in `src/site/localePaths.js`).
- Prerendered JSON-LD has `data-prerendered-jsonld="<path>"`; `JsonLd.jsx` keeps it on that path instead of adding a second copy, and replaces it after a client-side route change.
- `robots.txt` names the AI search crawlers (OAI-SearchBot, Claude-SearchBot, Claude-User, Perplexity-User) and allows them; `llms.txt` keeps the Ownership section first.
- `node scripts/seo-validate.mjs` (part of `build:prod`): title <= 60, description <= 160 in every language (Nov 2026; it prints a per-language length report). `scripts/site-i18n.mjs` applies the same limits to translated titles.

## Nov 2026 SEO audit rules

Audit: `docs/reports/2026-11-06-seo-denetimi.md`.

- **lastmod = content date.** `src/site/seo/contentDates.js` holds the day each page's copy last changed (`PAGE_UPDATED`); blog posts use their `date` / `updated`, dated Turkish landings their `updated`, prefixed languages follow the English page (never before `LOCALE_LIVE_SINCE`, plus `TRANSLATION_UPDATED`). Change a date only when the copy changes, never for code or style work. `sitemapCatalog.js` uses it by default, so the static and the Render sitemaps agree; `seo-validate` fails a route without a date.
- **Merged pages.** `src/site/seo/mergedPages.js` lists the URLs merged into a stronger page (same search intent): `/blog/discord-vs-descall` -> `/compare/discord`, `/blog/apps-like-discord` -> `/apps-like-discord`, `/blog/voice-chat-alternative-to-discord` -> `/discord-alternative-for-voice-chat`, `/blog/discord-alternative-for-communities-guide` -> `/discord-alternative-for-communities`, `/blog/migrate-from-discord-to-descall` -> `/discord-replacement`, the same under `/de`, `/es`, `/fr`, `/pt-br`, `/ru`, and the Turkish posts to the Turkish hub with the same intent. They answer 301 in `public/_redirects`, `public/_worker.js`, `vercel.json` and `backend/server.js` (`pagesWorkerRoutes.selftest.mjs` checks all four) and are not routes, shells, sitemap entries or hreflang alternates. Their sections live on the kept page (`src/site/seo/mergedGuides.js`). To merge another page: add it there, remove the route, add the hosting rules.
- **Internal links.** `scripts/seo-link-audit.mjs` (part of `build:prod`) counts, in the built shells, how many other pages link to each route and fails under 3.
- **Trademark.** Titles that name Discord start with Descall (or clearly feature it); Discord is never a generic word for Descall; no Nitro in titles; every footer says "Descall is not affiliated with Discord Inc." in the page language.
- **Structured data.** A FAQPage only where its questions are visible on the page, in the page language, at most one per page. `SoftwareApplication` lists Windows, iOS, iPadOS, Android and Web with the App Store URL (`src/site/appStoreLink.js`).
- **First paint.** The prerendered page is visible immediately (no `html.seo-hold`); see `frontend/docs/SEO_INDEXING.md`.
- **Indexing.** No Google Indexing API (`scripts/request-indexing.mjs` refuses to run); the sitemap is the discovery path.

## Policy

**Only real, indexable marketing URLs** are published. Group invites and `?announcement=` query URLs are **not** in the sitemap index (they are ephemeral / have no public landing).

Client routes live under `frontend/src/site/`; the route list is `PUBLIC_ROUTES` (`src/site/seoConfig.js`), split into sitemap tables by `src/site/sitemapCatalog.js`, which both the static build and `frontend/backend/routes/sitemap.js` read.

## Endpoints

| URL | Purpose |
|-----|---------|
| `/robots.txt` | Crawl rules + `Sitemap:` pointer |
| `/sitemap.xml` | Sitemap **index** (pages only) |
| `/sitemap-pages.xml` | Canonical public marketing pages |
| `/sitemap.html` | Human-readable HTML sitemap |
| `/sitemap.xsl` | Pretty XML stylesheet |
| `/api/sitemap/stats` | JSON diagnostics |

Legacy empty stubs (not linked from the index): `/sitemap-invites.xml`, `/sitemap-announcements.xml`.

## Config

- Prefer `PUBLIC_APP_URL` (or `SITE_URL`) for absolute URLs in production.
- Falls back to `X-Forwarded-*` / request host, then canonical host `https://descall.com`.

## Notes

- Authenticated app UI is `noindex` via client `SeoHead` (`forceNoindex`).
- Vite web builds use `base: "/"` so deep routes load assets; Electron builds set `ELECTRON_BUILD=1` for `base: "./"`.
