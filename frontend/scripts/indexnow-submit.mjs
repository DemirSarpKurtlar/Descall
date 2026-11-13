#!/usr/bin/env node
/**
 * IndexNow (Bing, Yandex, Seznam, Naver, ...): tell search engines which descall.com pages
 * changed in a deploy. Google does not read IndexNow; it uses the sitemaps. Never call the
 * Google Indexing API for these pages (see scripts/request-indexing.mjs).
 *
 * Run by .github/workflows/indexnow.yml on pushes to main:
 *   1. snapshot   read the live sitemaps before Cloudflare Pages has deployed the commit
 *   2. wait       poll https://descall.com/build-id.txt until it names the pushed commit
 *   3. submit     read the new sitemaps and POST the URLs that are new or whose <lastmod>
 *                 moved to https://api.indexnow.org/indexnow (key file in public/)
 *
 * Usage:
 *   node scripts/indexnow-submit.mjs snapshot --out before.json
 *   node scripts/indexnow-submit.mjs wait --sha <commit> [--timeout 2400]
 *   node scripts/indexnow-submit.mjs submit --before before.json [--since YYYY-MM-DD] [--dry-run]
 *   node scripts/indexnow-submit.mjs submit --all [--dry-run]          (every sitemap URL)
 *   node scripts/indexnow-submit.mjs submit --url https://descall.com/tr [--url ...]
 *
 * Only URLs that are in the live sitemaps are sent (indexable, canonical, https://descall.com).
 */
import fs from "node:fs";
import { pathToFileURL } from "node:url";

export const SITE = "https://descall.com";
export const HOST = "descall.com";
/** Public key; the same value is served at https://descall.com/<key>.txt (generate-seo-files). */
export const INDEXNOW_KEY = "4f463b15fd51f502c6bb73abbeb38e3c";
export const KEY_LOCATION = `${SITE}/${INDEXNOW_KEY}.txt`;
export const INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow";
/** Written to dist/ by generate-seo-files.mjs: the commit of the deployed build. */
export const BUILD_ID_FILE = "build-id.txt";
/** IndexNow accepts up to 10,000 URLs per request. */
export const MAX_URLS = 10000;

const decode = (s) =>
  s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'");

/** Child sitemap URLs of a <sitemapindex>. */
export function parseSitemapIndex(xml) {
  if (!/<sitemapindex[\s>]/.test(xml)) return [];
  return [...xml.matchAll(/<sitemap>[\s\S]*?<loc>([^<]+)<\/loc>[\s\S]*?<\/sitemap>/g)].map((m) => decode(m[1].trim()));
}

/** Page entries of a <urlset>: { loc, lastmod } (image and hreflang URLs are not pages). */
export function parseUrlset(xml) {
  const out = [];
  for (const m of xml.matchAll(/<url>([\s\S]*?)<\/url>/g)) {
    const loc = m[1].match(/<loc>([^<]+)<\/loc>/)?.[1];
    if (!loc) continue;
    out.push({ loc: decode(loc.trim()), lastmod: (m[1].match(/<lastmod>([^<]+)<\/lastmod>/)?.[1] || "").trim() });
  }
  return out;
}

/** A URL IndexNow may receive for this key: https, on descall.com, no fragment. */
export function isSubmittable(url) {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && u.host === HOST && !u.hash;
  } catch {
    return false;
  }
}

/**
 * URLs to submit: in `after` and either missing from `before` or with another lastmod.
 * Without a usable `before` (the snapshot was taken after the deploy, or the first run),
 * the URLs whose lastmod day is on or after `sinceDay` (YYYY-MM-DD) instead.
 * @param {Record<string,string>|null} before loc -> lastmod
 * @param {Record<string,string>} after loc -> lastmod
 */
export function changedUrls(before, after, { sinceDay = null } = {}) {
  const out = [];
  for (const [loc, lastmod] of Object.entries(after)) {
    if (!isSubmittable(loc)) continue;
    if (before) {
      if (!(loc in before) || before[loc] !== lastmod) out.push(loc);
    } else if (sinceDay && String(lastmod).slice(0, 10) >= sinceDay) {
      out.push(loc);
    }
  }
  return out.sort();
}

/** JSON body of an IndexNow request. */
export function buildPayload(urls) {
  const urlList = [...new Set(urls)].filter(isSubmittable);
  if (urlList.length > MAX_URLS) throw new Error(`IndexNow takes at most ${MAX_URLS} URLs per request (${urlList.length})`);
  return { host: HOST, key: INDEXNOW_KEY, keyLocation: KEY_LOCATION, urlList };
}

/** What an IndexNow status code means (https://www.indexnow.org/documentation). */
export function describeStatus(status) {
  if (status === 200) return "ok: URLs submitted";
  if (status === 202) return "accepted: key validation pending";
  if (status === 400) return "bad request";
  if (status === 403) return "forbidden: key not valid (key file missing or different)";
  if (status === 422) return "unprocessable: URLs do not belong to the host or the key does not match";
  if (status === 429) return "too many requests";
  return `unexpected status ${status}`;
}

async function fetchText(url) {
  const res = await fetch(url, { headers: { "user-agent": "descall-indexnow/1.0", "cache-control": "no-cache" } });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.text();
}

/** loc -> lastmod of every page in the live sitemap index. */
export async function readLiveSitemaps(site = SITE) {
  const index = await fetchText(`${site}/sitemap.xml`);
  const children = parseSitemapIndex(index);
  const map = {};
  for (const child of children.length ? children : [`${site}/sitemap.xml`]) {
    const xml = children.length ? await fetchText(child) : index;
    for (const { loc, lastmod } of parseUrlset(xml)) map[loc] = lastmod;
  }
  return map;
}

async function liveBuildId(site = SITE) {
  try {
    return (await fetchText(`${site}/${BUILD_ID_FILE}?t=${Date.now()}`)).trim();
  } catch {
    return null;
  }
}

function arg(name, args) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
}

function args(name, list) {
  const out = [];
  list.forEach((a, i) => {
    if (a === `--${name}` && list[i + 1]) out.push(list[i + 1]);
  });
  return out;
}

async function main(argv) {
  const [cmd, ...rest] = argv;
  if (cmd === "snapshot") {
    const out = arg("out", rest) || "indexnow-before.json";
    const buildId = await liveBuildId();
    const pages = await readLiveSitemaps();
    fs.writeFileSync(out, JSON.stringify({ buildId, takenAt: new Date().toISOString(), pages }, null, 1));
    console.log(`indexnow: snapshot of ${Object.keys(pages).length} sitemap URLs (live build ${buildId || "unknown"}) -> ${out}`);
    return 0;
  }
  if (cmd === "wait") {
    const sha = arg("sha", rest);
    if (!sha) throw new Error("wait needs --sha");
    const timeoutS = Number(arg("timeout", rest) || 2400);
    const deadline = Date.now() + timeoutS * 1000;
    // GitHub Actions step output `deployed` (true / false) gates the submit step.
    const output = (value) => {
      if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `deployed=${value}\n`);
    };
    for (;;) {
      const live = await liveBuildId();
      if (live === sha) {
        console.log(`indexnow: descall.com serves ${sha}`);
        output("true");
        return 0;
      }
      if (Date.now() > deadline) {
        // Not an error of the commit: Pages may have skipped the build or is still busy.
        console.log(`::warning::indexnow: descall.com still serves ${live || "no build id"} after ${timeoutS}s, not ${sha}; nothing submitted`);
        output("false");
        return 3;
      }
      await new Promise((r) => setTimeout(r, 20000));
    }
  }
  if (cmd === "submit") {
    const dryRun = rest.includes("--dry-run");
    const after = await readLiveSitemaps();
    let urls;
    const explicit = args("url", rest);
    if (explicit.length) {
      urls = explicit.filter((u) => u in after);
      for (const u of explicit) if (!(u in after)) console.log(`indexnow: skipped ${u} (not in the live sitemaps)`);
    } else if (rest.includes("--all")) {
      urls = Object.keys(after).filter(isSubmittable);
    } else {
      const beforeFile = arg("before", rest);
      const snap = beforeFile && fs.existsSync(beforeFile) ? JSON.parse(fs.readFileSync(beforeFile, "utf8")) : null;
      const sha = arg("sha", rest);
      // A snapshot taken after this commit was already live cannot show what changed.
      const usable = snap && !(sha && snap.buildId === sha) ? snap.pages : null;
      urls = changedUrls(usable, after, { sinceDay: arg("since", rest) || null });
      console.log(`indexnow: compared with ${usable ? "the pre-deploy snapshot" : `lastmod >= ${arg("since", rest) || "(none)"}`}`);
    }
    if (!urls.length) {
      console.log("indexnow: no changed URLs, nothing to submit");
      return 0;
    }
    const payload = buildPayload(urls);
    console.log(`indexnow: ${payload.urlList.length} URL(s)\n  ${payload.urlList.join("\n  ")}`);
    if (dryRun) {
      console.log("indexnow: dry run, not sent");
      return 0;
    }
    const res = await fetch(INDEXNOW_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify(payload),
    });
    console.log(`indexnow: ${INDEXNOW_ENDPOINT} -> ${res.status} (${describeStatus(res.status)})`);
    return res.status === 200 || res.status === 202 ? 0 : 1;
  }
  console.error("usage: indexnow-submit.mjs snapshot|wait|submit (see the file header)");
  return 2;
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code === 3 ? 0 : code),
    (err) => {
      console.error(`indexnow: ${err?.message || err}`);
      process.exit(1);
    }
  );
}
