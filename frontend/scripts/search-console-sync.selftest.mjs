/**
 * Search Console sync (scripts/search-console-sync.mjs): skip without the secret, RS256 JWT
 * that verifies with the service account's public key, date range, startRow paging and the
 * Supabase upsert, all against a fake fetch (no network).
 * Run: node scripts/search-console-sync.selftest.mjs
 */
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  CONFLICT_COLUMNS,
  DIMENSIONS,
  ROW_LIMIT,
  SCOPE,
  dateRange,
  parseServiceAccount,
  run,
  signJwt,
  toTableRow,
} from "./search-console-sync.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../..");

// 1. No secret: a notice, exit 0, no request.
{
  const logs = [];
  let calls = 0;
  const out = await run({}, { fetchImpl: async () => { calls += 1; }, log: (m) => logs.push(m) });
  assert.deepEqual(out, { skipped: true });
  assert.equal(calls, 0, "no request without the secret");
  assert.ok(logs.some((m) => m.startsWith("::notice::")), "skips with a notice");
}

// 2. JWT: RS256 over header.claims, verifies with the public key.
const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
const pem = privateKey.export({ type: "pkcs8", format: "pem" });
const keyJson = JSON.stringify({ type: "service_account", client_email: "sync@example.iam.gserviceaccount.com", private_key: pem, token_uri: "https://oauth2.googleapis.com/token" });
const account = parseServiceAccount(keyJson);
const jwt = signJwt(account, 1_700_000_000);
const [h, c, s] = jwt.split(".");
const dec = (part) => JSON.parse(Buffer.from(part.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
assert.deepEqual(dec(h), { alg: "RS256", typ: "JWT" });
assert.deepEqual(dec(c), { iss: account.clientEmail, scope: SCOPE, aud: "https://oauth2.googleapis.com/token", iat: 1_700_000_000, exp: 1_700_003_600 });
assert.ok(
  crypto.createVerify("RSA-SHA256").update(`${h}.${c}`).verify(publicKey, Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64")),
  "signature verifies"
);
assert.throws(() => parseServiceAccount("{not json"), /not valid JSON/);
assert.throws(() => parseServiceAccount({ type: "authorized_user", client_email: "x", private_key: "y" }), /service_account/);
assert.throws(() => parseServiceAccount({ type: "service_account" }), /client_email/);

// 3. Date range: 28 days ending yesterday (UTC).
assert.deepEqual(dateRange(28, new Date("2026-11-08T10:00:00Z")), { startDate: "2026-10-11", endDate: "2026-11-07" });
assert.deepEqual(dateRange(1, new Date("2026-03-01T00:30:00Z")), { startDate: "2026-02-28", endDate: "2026-02-28" });
assert.equal(dateRange(500).startDate < dateRange(90).endDate, true, "capped at 90 days");

// 4. Row mapping.
assert.deepEqual(toTableRow({ keys: ["2026-11-01", "descall", "https://descall.com/", "tur", "MOBILE"], clicks: 3, impressions: 40, ctr: 0.075, position: 2.4 }, "T"), {
  date: "2026-11-01", query: "descall", page: "https://descall.com/", country: "tur", device: "MOBILE",
  clicks: 3, impressions: 40, ctr: 0.075, position: 2.4, synced_at: "T",
});

// 5. Full run against a fake Google and a fake Supabase: two full pages and a short one.
{
  const pageSizes = [ROW_LIMIT, ROW_LIMIT, 7];
  const queries = [];
  const upserts = [];
  const logs = [];
  const fakeFetch = async (url, init = {}) => {
    const u = String(url);
    if (u === "https://oauth2.googleapis.com/token") {
      const body = new URLSearchParams(String(init.body));
      assert.equal(body.get("grant_type"), "urn:ietf:params:oauth:grant-type:jwt-bearer");
      assert.equal(body.get("assertion").split(".").length, 3);
      return new Response(JSON.stringify({ access_token: "tok-123", expires_in: 3600 }), { status: 200 });
    }
    if (u === "https://searchconsole.googleapis.com/webmasters/v3/sites/sc-domain%3Adescall.com/searchAnalytics/query") {
      assert.equal(init.headers.authorization, "Bearer tok-123");
      const q = JSON.parse(init.body);
      queries.push(q);
      const n = pageSizes[queries.length - 1] ?? 0;
      const rows = Array.from({ length: n }, (_, i) => ({ keys: ["2026-11-01", `q${q.startRow + i}`, "https://descall.com/", "tur", "DESKTOP"], clicks: 1, impressions: 2, ctr: 0.5, position: 1 }));
      return new Response(JSON.stringify({ rows }), { status: 200 });
    }
    if (u === `https://ref.supabase.co/rest/v1/seo_search_console_daily?on_conflict=${CONFLICT_COLUMNS}`) {
      assert.equal(init.headers.apikey, "service-key");
      assert.match(init.headers.prefer, /resolution=merge-duplicates/);
      upserts.push(JSON.parse(init.body).length);
      return new Response(null, { status: 201 });
    }
    throw new Error(`unexpected request ${u}`);
  };
  const out = await run(
    { GSC_SERVICE_ACCOUNT_JSON: keyJson, GSC_SITE_URL: "sc-domain:descall.com", SUPABASE_URL: "https://ref.supabase.co/", SUPABASE_SERVICE_ROLE_KEY: "service-key" },
    { fetchImpl: fakeFetch, log: (m) => logs.push(m), now: new Date("2026-11-08T05:17:00Z"), delayMs: 0 }
  );
  assert.equal(queries.length, 3, "pages until a short page");
  assert.deepEqual(queries.map((q) => q.startRow), [0, ROW_LIMIT, 2 * ROW_LIMIT], "startRow paging");
  assert.ok(queries.every((q) => q.rowLimit === ROW_LIMIT && q.startDate === "2026-10-11" && q.endDate === "2026-11-07"));
  assert.deepEqual(queries[0].dimensions, DIMENSIONS);
  assert.deepEqual(DIMENSIONS, ["date", "query", "page", "country", "device"]);
  assert.equal(out.rows, 2 * ROW_LIMIT + 7);
  assert.equal(out.written, out.rows);
  assert.ok(upserts.every((n) => n <= 1000), "upsert batches of at most 1000 rows");
  assert.equal(upserts.reduce((a, b) => a + b, 0), out.rows);
  assert.ok(!logs.some((m) => /tok-123|service-key|PRIVATE KEY/.test(m)), "no secret in the log outside GitHub Actions");
}

// 6. A retry on 429, then a clear error on 403.
{
  let n = 0;
  const flaky = async (url) => {
    if (String(url).includes("oauth2")) return new Response(JSON.stringify({ access_token: "t" }), { status: 200 });
    n += 1;
    if (n === 1) return new Response("{}", { status: 429 });
    return new Response(JSON.stringify({ error: { message: "User does not have sufficient permission" } }), { status: 403 });
  };
  await assert.rejects(
    run({ GSC_SERVICE_ACCOUNT_JSON: keyJson, GSC_SITE_URL: "sc-domain:descall.com", GSC_DRY_RUN: "1" }, { fetchImpl: flaky, log: () => {}, delayMs: 0 }),
    /HTTP 403.*Users and permissions/s
  );
  assert.equal(n, 2, "429 is retried");
}

// 7. Missing configuration fails loudly once the secret is set.
await assert.rejects(run({ GSC_SERVICE_ACCOUNT_JSON: keyJson }, { log: () => {} }), /GSC_SITE_URL/);
await assert.rejects(run({ GSC_SERVICE_ACCOUNT_JSON: keyJson, GSC_SITE_URL: "sc-domain:descall.com" }, { log: () => {} }), /SUPABASE_URL/);

// 8. The workflow and the migration match the script.
const wf = fs.readFileSync(path.join(repo, ".github/workflows/search-console-sync.yml"), "utf8");
assert.match(wf, /schedule:/);
assert.match(wf, /workflow_dispatch:/);
assert.match(wf, /secrets\.GSC_SERVICE_ACCOUNT_JSON/);
assert.match(wf, /vars\.GSC_SITE_URL/);
assert.match(wf, /secrets\.SUPABASE_URL/);
assert.match(wf, /secrets\.SUPABASE_SERVICE_ROLE_KEY/);
assert.match(wf, /node frontend\/scripts\/search-console-sync\.mjs/);
const sql = fs.readFileSync(path.join(repo, "supabase/migrations/20261111_search_console.sql"), "utf8");
assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.seo_search_console_daily/);
assert.match(sql, /PRIMARY KEY \(date, query, page, country, device\)/);
assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
assert.match(sql, /REVOKE ALL ON public\.seo_search_console_daily FROM anon, authenticated/);
assert.doesNotMatch(sql, /CREATE POLICY/);
for (const col of ["clicks", "impressions", "ctr", "position"]) assert.match(sql, new RegExp(`\\b${col}\\b`));

console.log("search-console-sync.selftest.mjs: ok");
