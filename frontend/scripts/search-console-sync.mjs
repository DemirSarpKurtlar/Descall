#!/usr/bin/env node
/**
 * Google Search Console -> Supabase (SEO audit item 6, Nov 2026).
 *
 * Reads the last 28 days of searchanalytics.query (dimensions date, query, page, country,
 * device; 25,000 rows per request, paged with startRow) for one Search Console property
 * and upserts them into public.seo_search_console_daily
 * (supabase/migrations/20261111_search_console.sql). Run daily by
 * .github/workflows/search-console-sync.yml; owner steps in docs/ops/search-console-sync.md.
 *
 * No dependencies: the service account JWT is signed with node:crypto (RS256) and every
 * call is a plain fetch.
 *
 * Environment:
 *   GSC_SERVICE_ACCOUNT_JSON   service account key file content (JSON). Not set: the job
 *                              prints a notice and exits 0 (nothing to sync yet).
 *   GSC_SITE_URL               property, e.g. "sc-domain:descall.com" or "https://descall.com/"
 *   SUPABASE_URL               https://<ref>.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY  service role key (the table has no anon / authenticated grants)
 *   GSC_DAYS                   optional, days to read (default 28, max 90)
 *   GSC_DRY_RUN=1              optional, read from Google but do not write to Supabase
 *
 * Secrets are never printed; in GitHub Actions the access token is masked.
 */
import crypto from "node:crypto";
import { pathToFileURL } from "node:url";

export const SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";
export const TOKEN_URL = "https://oauth2.googleapis.com/token";
export const API_BASE = "https://searchconsole.googleapis.com/webmasters/v3";
export const DIMENSIONS = ["date", "query", "page", "country", "device"];
export const ROW_LIMIT = 25000;
export const TABLE = "seo_search_console_daily";
export const CONFLICT_COLUMNS = "date,query,page,country,device";
const UPSERT_BATCH = 1000;
const MAX_PAGES = 200; // 5 million rows: far above what one property returns in 28 days

const b64url = (input) => Buffer.from(input).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");

/** Parse and check the service account key (the JSON file Google Cloud downloads). */
export function parseServiceAccount(raw) {
  let key;
  try {
    key = typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    throw new Error("GSC_SERVICE_ACCOUNT_JSON is not valid JSON (paste the whole key file).");
  }
  if (!key || typeof key !== "object") throw new Error("GSC_SERVICE_ACCOUNT_JSON is empty.");
  if (key.type && key.type !== "service_account") throw new Error(`Key type is "${key.type}", expected "service_account".`);
  if (!key.client_email || !key.private_key) throw new Error("The key has no client_email or private_key.");
  return { clientEmail: key.client_email, privateKey: key.private_key, tokenUri: key.token_uri || TOKEN_URL };
}

/** Signed RS256 JWT for the OAuth 2.0 JWT bearer grant. */
export function signJwt({ clientEmail, privateKey, tokenUri = TOKEN_URL }, nowSeconds = Math.floor(Date.now() / 1000)) {
  const header = { alg: "RS256", typ: "JWT" };
  const claims = { iss: clientEmail, scope: SCOPE, aud: tokenUri, iat: nowSeconds, exp: nowSeconds + 3600 };
  const unsigned = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claims))}`;
  const signature = crypto.createSign("RSA-SHA256").update(unsigned).end().sign(privateKey);
  return `${unsigned}.${b64url(signature)}`;
}

/** YYYY-MM-DD in UTC. */
export function isoDay(date) {
  return date.toISOString().slice(0, 10);
}

/**
 * Date range of `days` days ending yesterday (UTC). Search Console has no data for today
 * and the last two or three days fill in late, so the daily run re-reads 28 days and the
 * upsert corrects earlier rows.
 */
export function dateRange(days = 28, now = new Date()) {
  const n = Math.max(1, Math.min(90, Math.round(Number(days) || 28)));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1));
  const start = new Date(end.getTime() - (n - 1) * 86400000);
  return { startDate: isoDay(start), endDate: isoDay(end) };
}

/** One API row -> one table row. */
export function toTableRow(row, syncedAt) {
  const [date, query, page, country, device] = row.keys || [];
  return {
    date,
    query: query ?? "",
    page: page ?? "",
    country: country ?? "",
    device: device ?? "",
    clicks: Math.round(Number(row.clicks) || 0),
    impressions: Math.round(Number(row.impressions) || 0),
    ctr: Number(row.ctr) || 0,
    position: Number(row.position) || 0,
    synced_at: syncedAt,
  };
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

/** fetch with retries on 429 / 5xx and network errors (exponential backoff). */
async function request(fetchImpl, url, init, { label, attempts = 4, delayMs = 1000 } = {}) {
  let lastError;
  for (let i = 0; i < attempts; i += 1) {
    try {
      const res = await fetchImpl(url, init);
      if (res.status === 429 || res.status >= 500) {
        lastError = new Error(`${label}: HTTP ${res.status}`);
      } else {
        return res;
      }
    } catch (err) {
      lastError = new Error(`${label}: ${err?.message || err}`);
    }
    if (i < attempts - 1) await sleep(delayMs * 2 ** i);
  }
  throw lastError;
}

async function errorText(res) {
  try {
    const body = await res.json();
    return body?.error_description || body?.error?.message || body?.message || JSON.stringify(body).slice(0, 300);
  } catch {
    return `HTTP ${res.status}`;
  }
}

/** Exchange the signed JWT for an access token. */
export async function fetchAccessToken(account, { fetchImpl = fetch, delayMs } = {}) {
  const body = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion: signJwt(account),
  });
  const res = await request(
    fetchImpl,
    account.tokenUri || TOKEN_URL,
    { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body },
    { label: "token", delayMs }
  );
  if (!res.ok) throw new Error(`Google token request failed: ${await errorText(res)}`);
  const json = await res.json();
  if (!json.access_token) throw new Error("Google token response has no access_token.");
  return json.access_token;
}

/** Every searchanalytics.query row of the range, page by page (startRow). */
export async function fetchSearchAnalytics({ token, siteUrl, startDate, endDate, fetchImpl = fetch, rowLimit = ROW_LIMIT, delayMs }) {
  const url = `${API_BASE}/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`;
  const rows = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const res = await request(
      fetchImpl,
      url,
      {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ startDate, endDate, dimensions: DIMENSIONS, type: "web", rowLimit, startRow: rows.length }),
      },
      { label: "searchanalytics.query", delayMs }
    );
    if (!res.ok) {
      const hint =
        res.status === 403
          ? " Add the service account e-mail as a user of the property in Search Console (Settings, Users and permissions) and check GSC_SITE_URL."
          : "";
      throw new Error(`Search Console query failed (HTTP ${res.status}): ${await errorText(res)}.${hint}`);
    }
    const json = await res.json();
    const batch = Array.isArray(json.rows) ? json.rows : [];
    rows.push(...batch);
    if (batch.length < rowLimit) break;
  }
  return rows;
}

/** Upsert rows into Supabase (PostgREST), merging on the primary key. */
export async function upsertRows({ supabaseUrl, serviceKey, rows, fetchImpl = fetch, batchSize = UPSERT_BATCH, delayMs }) {
  const url = `${supabaseUrl.replace(/\/+$/, "")}/rest/v1/${TABLE}?on_conflict=${CONFLICT_COLUMNS}`;
  let written = 0;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const res = await request(
      fetchImpl,
      url,
      {
        method: "POST",
        headers: {
          apikey: serviceKey,
          authorization: `Bearer ${serviceKey}`,
          "content-type": "application/json",
          prefer: "resolution=merge-duplicates,return=minimal",
        },
        body: JSON.stringify(batch),
      },
      { label: "supabase upsert", delayMs }
    );
    if (!res.ok) {
      const hint = res.status === 404 ? " Apply supabase/migrations/20261111_search_console.sql first." : "";
      throw new Error(`Supabase upsert failed (HTTP ${res.status}): ${await errorText(res)}.${hint}`);
    }
    written += batch.length;
  }
  return written;
}

/**
 * The whole job. Returns { skipped } or { rows, written, startDate, endDate }.
 * `log` gets one-line progress messages; secrets never reach it.
 */
export async function run(env = process.env, { fetchImpl = fetch, log = console.log, now = new Date(), delayMs } = {}) {
  const raw = String(env.GSC_SERVICE_ACCOUNT_JSON || "").trim();
  if (!raw) {
    log("::notice::GSC_SERVICE_ACCOUNT_JSON is not set, so there is nothing to sync yet. See docs/ops/search-console-sync.md.");
    return { skipped: true };
  }
  const siteUrl = String(env.GSC_SITE_URL || "").trim();
  if (!siteUrl) throw new Error("GSC_SITE_URL is not set (repository variable), e.g. sc-domain:descall.com.");
  const dryRun = /^(1|true|yes)$/i.test(String(env.GSC_DRY_RUN || ""));
  const supabaseUrl = String(env.SUPABASE_URL || "").trim();
  const serviceKey = String(env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!dryRun && (!supabaseUrl || !serviceKey)) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (repository secrets), or set GSC_DRY_RUN=1.");
  }

  const account = parseServiceAccount(raw);
  const { startDate, endDate } = dateRange(env.GSC_DAYS || 28, now);
  log(`Search Console: ${siteUrl}, ${startDate} to ${endDate}, as ${account.clientEmail}`);
  const token = await fetchAccessToken(account, { fetchImpl, delayMs });
  if (env.GITHUB_ACTIONS) log(`::add-mask::${token}`);

  const apiRows = await fetchSearchAnalytics({ token, siteUrl, startDate, endDate, fetchImpl, delayMs });
  const syncedAt = now.toISOString();
  const rows = apiRows.map((r) => toTableRow(r, syncedAt)).filter((r) => r.date);
  log(`Search Console returned ${rows.length} rows.`);
  if (dryRun) {
    log("GSC_DRY_RUN is set: nothing written to Supabase.");
    return { rows: rows.length, written: 0, startDate, endDate, dryRun: true };
  }
  const written = await upsertRows({ supabaseUrl, serviceKey, rows, fetchImpl, delayMs });
  log(`Upserted ${written} rows into public.${TABLE}.`);
  return { rows: rows.length, written, startDate, endDate };
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  run().catch((err) => {
    console.error(`::error::${err?.message || err}`);
    process.exit(1);
  });
}
