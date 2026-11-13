# Sitemap / SEO

In production descall.com is a static Cloudflare Pages build: `npm run build:prod` writes `robots.txt`, `llms.txt`, `llms-full.txt`, `sitemap.xml` (index), `sitemap-{core,niches,blog,company}.xml`, `sitemap-pages.xml`, `sitemap.html` and the prerendered pages into `dist/` (`scripts/generate-seo-files.mjs`, `scripts/prerender-seo.mjs`, route list `src/site/sitemapCatalog.js`). The Express backend (`backend/routes/sitemap.js`) still answers the same URLs for self-hosted / API-host deployments.

## 3.7.14 rules

- One URL per page: `public/_worker.js` 301s a trailing-slash path (not `/`, not app routes) to the slashless one, query kept.
- App shell routes (`/app`, `/login`, `/register`, ...) send `x-robots-tag: noindex, follow`; they are never in a sitemap.
- Each sitemap `<url>` carries `xhtml:link` alternates for every served language (en, tr, de, es, fr, pt-BR, ru) plus x-default, the same set as the page `<link rel=alternate>` (`hreflangAlternates` in `src/site/localePaths.js`).
- Prerendered JSON-LD has `data-prerendered-jsonld="<path>"`; `JsonLd.jsx` keeps it on that path instead of adding a second copy, and replaces it after a client-side route change.
- `robots.txt` names the AI crawlers in one group (see round 5) and allows them, app paths excepted; `llms.txt` keeps the Ownership section first.
- `node scripts/seo-validate.mjs` (part of `build:prod`): title <= 60, description <= 160 in every language (Nov 2026; it prints a per-language length report). `scripts/site-i18n.mjs` applies the same limits to translated titles.

## Nov 2026 SEO audit rules

Audit: `docs/reports/2026-11-06-seo-denetimi.md`.

- **lastmod = content date.** `src/site/seo/contentDates.js` holds the day each page's copy last changed (`PAGE_UPDATED`); blog posts use their `date` / `updated`, dated Turkish landings their `updated`, prefixed languages follow the English page (never before `LOCALE_LIVE_SINCE`, plus `TRANSLATION_UPDATED`). Change a date only when the copy changes, never for code or style work. `sitemapCatalog.js` uses it by default, so the static and the Render sitemaps agree; `seo-validate` fails a route without a date.
- **Merged pages.** `src/site/seo/mergedPages.js` lists the URLs merged into a stronger page (same search intent): `/blog/discord-vs-descall` -> `/compare/discord`, `/blog/apps-like-discord` -> `/apps-like-discord`, `/blog/voice-chat-alternative-to-discord` -> `/discord-alternative-for-voice-chat`, `/blog/discord-alternative-for-communities-guide` -> `/discord-alternative-for-communities`, `/blog/migrate-from-discord-to-descall` -> `/discord-replacement`, the same under `/de`, `/es`, `/fr`, `/pt-br`, `/ru`, and the Turkish posts to the Turkish hub with the same intent. They answer 301 in `public/_redirects`, `public/_worker.js`, `vercel.json` and `backend/server.js` (`pagesWorkerRoutes.selftest.mjs` checks all four) and are not routes, shells, sitemap entries or hreflang alternates. Their sections live on the kept page (`src/site/seo/mergedGuides.js`). To merge another page: add it there, remove the route, add the hosting rules.
- **Internal links.** `scripts/seo-link-audit.mjs` (part of `build:prod`) counts, in the built shells, how many other pages link to each route and fails under 3.
- **Trademark.** Titles that name Discord start with Descall (or clearly feature it); Discord is never a generic word for Descall; no Nitro in titles; every footer says "Descall is not affiliated with Discord Inc." in the page language.
- **Discord in Türkiye (Nov 7).** Never state the block as a current, verified fact. Write it like `/tr/discord-acildi-mi`: what public reports said and when (court order of 9 October 2024), that we do not test access ourselves, that it may have changed, and link to `/tr/discord-acildi-mi` (English pages: "Discord in Türkiye: dated reports (Turkish)"). Only that page carries a month.
- **How-to guides (Nov 7).** Six non-Discord guides under `/blog/*` and `/tr/blog/*` (EN bodies `src/site/seo/guideBodies.js`, TR bodies `src/site/seo/trGuideBodies.js`, meta and FAQ with the other posts): screen sharing, study groups, mic and noise, community servers, chat privacy, which app per device. They are in the blog page group, so every prefixed language serves them; claims were checked against the code on the day they were written (see the file headers).
- **Structured data.** A FAQPage only where its questions are visible on the page, in the page language, at most one per page. `SoftwareApplication` lists Windows, iOS, iPadOS, Android and Web with the App Store URL (`src/site/appStoreLink.js`).
- **First paint.** The prerendered page is visible immediately (no `html.seo-hold`); see `frontend/docs/SEO_INDEXING.md`.

## Nov 2026 round 2 rules

- **Sitemaps per language.** `/sitemap.xml` lists `sitemap-en.xml`, `sitemap-tr.xml`, `sitemap-de.xml`, `sitemap-es.xml`, `sitemap-fr.xml`, `sitemap-pt-br.xml`, `sitemap-ru.xml` (`SITEMAP_LANG_TABLES` in `src/site/sitemapCatalog.js`); every URL is in exactly one (its language: `/tr/...` and the Turkish-only pages are `tr`). Each `<url>` has `image:image` entries for the product shots of its page. The topic tables (`sitemap-core.xml` ...) are still served but not in the index. The Render backend answers the same files.
- **Letter case.** The Pages worker 301s `/Features` or `/TR/Download` to the existing lower-case page. Only page paths that 404 as typed; files and app paths (case-sensitive invite codes) are never folded.
- **Structured data** (`scripts/seoStructuredData.mjs`, run by `seo-validate --dist`): every page has Organization, WebSite (7 languages) and SoftwareApplication (Windows, iOS, Android, Web, App Store URL, price 0); no rating or review markup; every page below a home has one BreadcrumbList from the language home to its canonical (`breadcrumbsForRoute` in `prerender-seo.mjs`); blog posts are `BlogPosting` with dates, author, publisher logo, image, language; FAQPage at most once, every question and answer visible on the page.
- **Links and images** (`scripts/seo-link-audit.mjs`): at least 3 linking pages per route, every page within 3 clicks of `/` (4 until Nov 13), no link to a redirect or a 404 (checked through the production worker), every shell image with alt (empty only when `aria-hidden`) and width / height.
- **hreflang** reciprocity, self reference and x-default are checked without a build by `scripts/hreflang.selftest.mjs` and on the built HTML by `seo-validate --dist`.
- **Indexing.** No Google Indexing API (`scripts/request-indexing.mjs` refuses to run); the sitemap is the discovery path.

## Nov 2026 round 3 rules

- **Letter case.** `backend/server.js` folds `/Features` to `/features` with the same rule as the Pages worker (`backend/lib/letterCaseRedirect.js`: only page paths in `dist`, never files, API paths or invite codes). On Render the canonical-host hop to descall.com comes first and the worker folds the case. `vercel.json` has no such rule: descall.com is not served by Vercel, and a redirect there cannot check that the lower-case page exists.
- **Hand-over twins** for the compare, alternatives, gamers, blog index, about, security and ownership pages: see `frontend/docs/SEO_INDEXING.md`.
- **Site catalogs per page.** `src/site/i18n/<id>/` holds `core.js` plus one file per page; `node scripts/site-i18n.mjs layout` rewrites it, `check` fails when a string is in a part its page does not load.

## Nov 2026 round 5 rules (Nov 8)

- **Own-brand Turkish URL.** `/tr/turk-discord` moved to `/tr/turk-sohbet-uygulamasi` (title "Descall: Türkiye’de Geliştirilen Ücretsiz Sohbet Uygulaması"); the old URL answers 301 in `public/_redirects`, `public/_worker.js` (`PERMANENT_REDIRECTS`), `vercel.json` and `backend/server.js` (`pagesWorkerRoutes.selftest.mjs` checks all four). Never put a competitor's brand in a slug, title or H1 as a generic word.
- **AI assistants.** `robots.txt` has one group for the AI crawlers (`AI_CRAWLERS` in `scripts/generate-seo-files.mjs`: GPTBot, OAI-SearchBot, ChatGPT-User, ClaudeBot, Claude-SearchBot, Claude-User, PerplexityBot, Perplexity-User, Google-Extended, ...). A named group replaces `*` for that crawler, so the group repeats the app-path `Disallow` lines; `seo-validate --dist` fails if a named group lacks them. `llms.txt` / `llms-full.txt` come from `src/site/ownershipFacts.js`; `seo-validate` fails when they link a page that is not a live route.
- **Quick answers.** The FAQ page starts with an open "Quick answers" group (free, iPhone, voice chat in Turkey, moving from Discord); its FAQPage JSON-LD carries the same visible questions. The Turkish own-brand landing shows the same questions in Turkish.
- **Guides of Nov 8.** Four posts (`move-discord-community-to-descall`, `descall-voice-settings-guide`, `game-team-voice-setup`, `screen-share-online-classes`) are live in English and Turkish. They form the page group `guides` (`SITE_PAGE_GROUPS` in `src/site/siteLocales.js`), staged for de, es, fr, pt-BR and ru in `SITE_DRAFT_PAGE_GROUPS` until their bodies are translated (`node scripts/site-i18n.mjs export`, translate the parts, `import`, then remove the locales from the list). Their titles and descriptions are already translated because the served blog index links them.
- **Search Console data.** `.github/workflows/search-console-sync.yml` copies the last 28 days of query data into `public.seo_search_console_daily` every day; owner steps in `docs/ops/search-console-sync.md`.

## Nov 2026 round 6 rules (Nov 13, indexing audit)

Measured on the live site as Googlebot (225 sitemap URLs, all 200, self canonical, one H1, unique titles and descriptions, reciprocal hreflang) and rendered with Playwright (mobile, slow 4G, 4x CPU: LCP 0.5 to 1.6 s, CLS 0, TBT under 100 ms on `/`, `/tr`, `/download`, `/tr/discord-alternatifi`, a blog post and `/de/features`).

- **Locales stay indexed.** de, es, fr, pt-BR and ru pages share at most 8 % of their five-word sequences with the English page (fully translated), are 0.9 to 1.3 times its length, and no two pages of one language share more than 25 % of their own text. No locale-wide noindex.
- **noindex,follow pages** (`src/site/seo/indexPolicy.js`, `NOINDEX_FOLLOW_PAGES`): `/status` (about 130 words, no live data) and `/copyright` (66 to 72 % of its text is also in `/terms`), in every language. They are still prerendered and linked, carry `<meta name="robots" content="noindex,follow" data-noindex-path="...">`, no hreflang, and are in no sitemap (`indexableRoutes()` in `sitemapCatalog.js`, so the Render sitemap follows). To change the list, edit that file; `seo-validate --dist` checks the meta, the missing hreflang and the sitemaps.
- **React keeps a prerendered noindex.** `SeoHead` used to rewrite every robots tag to `index,follow` after hydration, so the thin directory topic pages (noindex in the HTML) became indexable in the rendered page Google uses. It now keeps `noindex,follow` when the shell's tag has `data-noindex-path` for the current path (`prerenderedNoindexPath`, `robotsContent` in `indexPolicy.js`).
- **Brand query.** The home titles say what Descall is: "Descall: Free Voice Chat App with Servers & Screen Share" and "Descall: Ücretsiz Sesli Sohbet, Sunucular, Ekran Paylaşımı"; the first paragraph of the home page starts with "Descall is a free voice chat app" / "Descall, ... ücretsiz bir sesli sohbet uygulaması" in every language; `/tr/sesli-sohbet-uygulamasi` leads with its main query and names Descall in title and description.
- **Brand entity.** Organization: name, url, a 512 px square PNG logo, `sameAs` = App Store app + GitHub (no social profile exists in the repo yet; add one to `jsonLdBuilders.js` when it does). WebSite has no `logo` (not a WebSite property) and no SearchAction (the site has no search page). Descriptions in the entity graph describe Descall, not a competitor. `seoStructuredData.mjs` checks all of this.
- **Turkish pages one click from every page.** Non-Turkish footers (React and shell) link `/tr/sesli-sohbet-uygulamasi` and `/tr/discord-alternatifi` (`TR_MONEY_LINKS` in `src/site/seoHubLinks.js`, `lang="tr"`).
- **Sitemap XML order.** Each `<url>` is `loc, lastmod, changefreq, priority`, then `xhtml:link` and `image:image` (sitemaps.org schema; the extensions used to come before `lastmod`). `seo-validate --dist` checks the order and the lastmod format.
- **Cloudflare email obfuscation.** The zone rewrites `mailto:` links into `/cdn-cgi/l/email-protection` links and "[email protected]" text (64 live pages). The shell body is wrapped in `<!--email_off-->` ... `<!--/email_off-->`, which Cloudflare leaves alone; `seo-validate --dist` checks the markers.
- **IndexNow.** `.github/workflows/indexnow.yml` runs on pushes to main that touch `frontend/`: it snapshots the live sitemaps, waits until `https://descall.com/build-id.txt` (written by `generate-seo-files.mjs` from `CF_PAGES_COMMIT_SHA`) names the commit, then posts the URLs that are new or whose `lastmod` moved to `api.indexnow.org` with the key file `public/4f463b15fd51f502c6bb73abbeb38e3c.txt` (`scripts/indexnow-submit.mjs`, selftest next to it). A manual run can submit every sitemap URL or a list. Google ignores IndexNow; it reads the sitemaps. Never the Google Indexing API.

## Nov 2026 round 6 content (Nov 13, Turkish keyword gaps)

- **Turkish keyword map.** `docs/seo/keyword-map-tr.md` groups the Turkish queries (from Google autocomplete, `hl=tr`) by intent, with the target URL, whether the page fits and who ranks today. Update it when Search Console data arrives.
- **Eight Turkish landings** (`src/site/seo/trLandingsNov13.js`, titles in `trMeta.js`, merged into `TR_LANDINGS`): `/tr/sesli-sohbet-programi`, `/tr/teamspeak-alternatifi`, `/tr/ekran-paylasimi-programi`, `/tr/ucretsiz-grup-sesli-arama`, `/tr/minecraft-sesli-sohbet`, `/tr/cs2-sesli-sohbet`, `/tr/lol-sesli-sohbet`, `/tr/pubg-mobile-sesli-sohbet`. Turkish only (no English twin), like the other `/tr` landings; each has a visible FAQ with FAQPage JSON-LD and a route in `MarketingApp.jsx`. A landing section can carry a `table: { head, rows }` (rendered by `TrLandingPage.jsx` and `prerender-seo.mjs`).
- **System requirements** live in `src/site/seo/trSystemRequirements.js` (Windows 10/11 x64, iOS/iPadOS 15+, Android 7.0+, browser) and are reused by the landings and the `/tr` and `/tr/download` extras. Change them with the build settings they come from.
- **Turkish main pages** answer free / iPhone / works in Türkiye without a VPN / is it safe / system requirements; their titles and H1s start with their main query (`/tr/discord-alternatifi`, `/tr/sesli-sohbet-uygulamasi`, `/tr/turk-sohbet-uygulamasi`). Competitor names stay descriptive (Discord, TeamSpeak); the retired game and its publisher stay out (`noRetiredGameFeature.selftest.mjs`).
- **i18n ratchet.** Turkish-only SEO copy is hard-coded Turkish by design; `scripts/i18n-hardcoded-baseline.json` was raised for the touched `src/site/seo/*` files, as in earlier rounds.

## Server directory (item 8, Nov 2026)

- **Pages.** `/communities` and `/tr/topluluklar` plus one page per topic (`/communities/<slug>`, `/tr/topluluklar/<slug>`, slugs in `src/site/directory/directoryPaths.js`). English pages list servers in every language, Turkish pages list servers whose main language is Turkish, so they carry no hreflang pair (only a visible link to the other language). Copy: `src/i18n/locales/dirSeo.{en,tr}.js`. Not mirrored under `/de`, `/es`, ... on purpose.
- **Build data.** `scripts/prerender-seo.mjs` reads `GET <api>/api/directory/snapshot` (`DIRECTORY_API_URL`, else `VITE_API_BASE_URL`, else production; `DIRECTORY_SNAPSHOT_FILE` for a saved JSON, `DIRECTORY_PRERENDER=0` to skip). Any failure renders empty lists; the build never fails.
- **Thin pages.** A topic page that lists fewer than 3 servers is `noindex,follow` and out of every sitemap. The prerender writes the decision to `dist/directory-manifest.json`; `generate-seo-files.mjs` and `seo-validate.mjs --dist` read it. The Render sitemap uses the live directory. The two index pages are always indexable.
- **Structured data.** BreadcrumbList (home > directory > topic) and an ItemList (topic pages on the index, server cards on a topic page). Lastmod is the copy date (`DIRECTORY_COPY_UPDATED`), not the list.

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
