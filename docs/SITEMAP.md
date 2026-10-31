# Sitemap / SEO

In production descall.com is a static Cloudflare Pages build: `npm run build:prod` writes `robots.txt`, `llms.txt`, `llms-full.txt`, `sitemap.xml` (index), `sitemap-{core,niches,blog,company}.xml`, `sitemap-pages.xml`, `sitemap.html` and the prerendered pages into `dist/` (`scripts/generate-seo-files.mjs`, `scripts/prerender-seo.mjs`, route list `src/site/sitemapCatalog.js`). The Express backend (`backend/routes/sitemap.js`) still answers the same URLs for self-hosted / API-host deployments.

## 3.7.14 rules

- One URL per page: `public/_worker.js` 301s a trailing-slash path (not `/`, not app routes) to the slashless one, query kept.
- App shell routes (`/app`, `/login`, `/register`, ...) send `x-robots-tag: noindex, follow`; they are never in a sitemap.
- Each sitemap `<url>` carries `xhtml:link` en / tr / x-default (`hreflangPair`), the same pairs as the page `<link rel=alternate>`.
- Prerendered JSON-LD has `data-prerendered-jsonld="<path>"`; `JsonLd.jsx` keeps it on that path instead of adding a second copy, and replaces it after a client-side route change.
- `robots.txt` names the AI search crawlers (OAI-SearchBot, Claude-SearchBot, Claude-User, Perplexity-User) and allows them; `llms.txt` keeps the Ownership section first.
- `node scripts/seo-validate.mjs` (part of `build:prod`): title <= 70, description <= 170.

## Policy

**Only real, indexable marketing URLs** are published. Group invites and `?announcement=` query URLs are **not** in the sitemap index (they are ephemeral / have no public landing).

Client routes live under `frontend/src/site/` and must stay in sync with `staticPages()` in `frontend/backend/routes/sitemap.js`.

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
