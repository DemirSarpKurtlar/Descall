#!/usr/bin/env node
/**
 * Retired (Nov 2026, SEO audit). This script used to push every marketing URL to the
 * Google Indexing API, plus IndexNow and the old Google sitemap ping.
 *
 * Google allows the Indexing API only for pages with JobPosting or BroadcastEvent
 * (livestream) structured data. Descall has neither, so using it for marketing pages
 * breaks Google's terms and can get the key or the site ignored. The sitemap ping
 * endpoint was shut down by Google in 2023.
 *
 * How pages get discovered instead:
 *   - https://descall.com/sitemap.xml (sitemap index, written by generate-seo-files.mjs),
 *     submitted once in Google Search Console and Bing Webmaster Tools.
 *   - accurate lastmod values in the sitemaps, so search engines recrawl changed pages.
 *   - Search Console "URL inspection > Request indexing" for a single urgent page.
 *
 * The script refuses to run so nobody calls the API by accident from an old note.
 */
const message = `request-indexing: refused.

The Google Indexing API is only allowed for job posting and livestream pages
(JobPosting / BroadcastEvent). Descall marketing pages must not use it.

Discovery works through the sitemap instead:
  https://descall.com/sitemap.xml
Submit it once in Google Search Console (Sitemaps) and Bing Webmaster Tools.
For one urgent page, use Search Console > URL inspection > Request indexing.

See frontend/docs/SEO_INDEXING.md.`;

console.error(message);
process.exit(1);
