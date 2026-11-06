# SEO indexing & Search Console

Descall ships static sitemaps. Search engines find pages through them; nothing pushes URLs to Google. You still need Google Search Console ownership once.

## Already automated in-repo

```bash
cd frontend
npm run seo:link-audit  # internal links counted in the built HTML (runs in build:prod)
npm run seo:prod-check  # live HTML/CWV smoke
```

### Google Indexing API: not used (Nov 2026)

Google allows the Indexing API only for pages with `JobPosting` or `BroadcastEvent` (livestream) structured data. Descall has neither, so it must not be used for marketing pages. `scripts/request-indexing.mjs` (`npm run seo:index`) now refuses to run and points to the sitemap. The old Google sitemap ping endpoint is gone too (Google retired it in 2023).

How a change gets picked up instead:

1. `https://descall.com/sitemap.xml` is submitted in Search Console (Domain property) and Bing Webmaster Tools.
2. Sitemap `lastmod` follows real content dates, so crawlers trust it (see `docs/SITEMAP.md`).
3. For one urgent page: Search Console > URL inspection > Request indexing, by hand.

## Google Search Console

**Domain property + DNS TXT is enough.** `descall.com` verified as a Domain property already covers `https://`, `http://`, `www`, and other hostnames. Do **not** create a URL-prefix property (`https://descall.com`) just to get an HTML token.

`VITE_GSC_VERIFICATION` is **not required**. Vite injects `<meta name="google-site-verification">` only if that env var is set. Skip it.

Use the HTML meta path only if you later add a *separate* URL-prefix property and choose HTML-tag verification there. That is optional duplication, not a ranking requirement.

Still do in the existing Domain property:

1. Sitemap: `https://descall.com/sitemap.xml`
2. Optional Bing Webmaster: `VITE_BING_SITE_VERIFICATION` (injects `msvalidate.01`) — Bing has no Domain-property DNS equivalent in this repo
3. Do not set up the Google Indexing API (see above).

## Mobile LCP notes (DES-50)

- Marketing CSS self-hosts Inter + Outfit (latin subsets only) — no Google Fonts RTT
- Build injects `rel=preload` for Outfit 700 (H1 / brand display face) when the hashed woff2 is emitted
- The prerendered page is the first paint (Nov 2026: `html.seo-hold`, which hid it until React committed, is gone). Every shell starts with a twin of the React header; the home page has a twin of the hero (`index.html` `.seo-hh`, `src/site/seo/corePageBodies.js`) and niche / Turkish landings a twin of `SeoLandingShell` (`.seo-lhero`, `scripts/prerender-seo.mjs` `landingHeroHtml`). Keep their sizes in step with `home-hero.css` / the landing CSS: header, H1 and first button must sit at the same pixels in both, or the hand-over shows a jump. React takes over with a 180 ms cross-fade (`RevealMarketingShell` in `MarketingApp.jsx`).
- Homepage LCP is the hero product shot (`fetchpriority="high"`) or the H1 in the prerendered hero.
- The app boot splash on `/` is an inert `<template>` mounted only for an app boot (token, app route, native app); visitors and crawlers never see it.
- `npm run perf:budget` prints the 235 KB "Total" gate plus the gzip critical path for `/features`, `/de/features` and `/`: "content visible" (HTML and render-blocking files) and "React page ready" (the whole hydrate chain).
- Track `web_vital` (LCP/INP/CLS) in PostHog after cookie accept

## IndexNow

The key file is still published at `/4f463b15fd51f502c6bb73abbeb38e3c.txt` so Bing Webmaster Tools keeps the site verified for IndexNow. The repo no longer sends IndexNow pings; Bing reads the sitemap.

## GSC playbook (legitimate only)

Do **not** click your own Google results, hire click farms, buy links, or stuff keywords. That can get the site filtered.

What *does* help, using Search Console data:

1. **HTTP leftovers in a Domain property.** Domain properties list `http://descall.com/` and `https://descall.com/` as separate URLs. That is expected, not a missing verification. `vercel.json` 301s HTTP→HTTPS and sends HSTS. Inspect a few `http://` URLs; Google should follow the 301 to the HTTPS canonical.
2. **Exact-match pillar.** `/discord-alternative` owns `discord alternative`. Homepage titles stay brand-first (`Descall — Voice Chat…`) so they do not steal that query.
3. **CTR on pages that already rank.** `/alternatives` (~position 4, 0 clicks) and `/compare/discord` (~position 9, 0 clicks) are snippet problems, not crawl problems — titles/descriptions are written to earn the click.
4. **Turkish queries** (`discord alternatifi`, `muadili`, `benzeri`) consolidate on `/tr/discord-alternatifi`; `/discord-alternative-turkey` and `/tr/discord-alternative` 301 there so the TR URLs do not compete.
5. **Unique FAQ JSON-LD** per commercial URL, only with questions that are visible on that page and in its language. Do not copy the same FAQPage onto hub, compare, list, and blog posts.
6. **One URL per search intent.** Same-intent pages are merged with a 301 (see `docs/SITEMAP.md`, "Merged pages"). Before adding a page, check that no existing page already answers the query.
7. **"Discord açıldı mı?"** is evergreen: re-check the access status every month and move `DISCORD_TR_STATUS_CHECKED` and `CHECKED` in `src/site/seo/trLandings.js` (page date, Article `dateModified` and sitemap lastmod follow). `/status` shows `SITE_OPERATOR.statusReviewedIso`.
8. After a deploy nothing needs to be pushed: the sitemap and its `lastmod` values carry the change. Rankings take days/weeks; judge in GSC, not by searching Google yourself.

## Host split note (`www` vs `app`)

- Canonical marketing host: `https://descall.com` (www → apex 301 in `vercel.json`)
- API/realtime stays on Render (`des-call.onrender.com`) — see `src/config/api.js`
- Authenticated app routes boot the full bundle; public marketing paths use static-first hydrate
- A full `app.descall.com` DNS cutover is optional later; current hybrid already keeps marketing JS lean
