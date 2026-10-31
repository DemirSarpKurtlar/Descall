#!/usr/bin/env node
"use strict";

/**
 * API / socket message phrases (see lib/apiError.js): the server speaks English and the
 * app translates through src/i18n/locales/api.tr.js (API_TR, keyed by the English text).
 *
 * Finds the user-facing English literals the backend sends: `error:` / `message:` /
 * `reason:` / `text:` / `hint:` fields, `new Error("...")` / `bad("...")` sentences that
 * routes relay as err.message, and the templates given to apiError / apiText /
 * templatedError. Code-like values ("not_found", "bad_url") and the SKIP list (developer /
 * diagnostic text no screen shows) are left out.
 *
 *   node backend/scripts/apiMessages.cjs           list phrases (with one location each)
 *   node backend/scripts/apiMessages.cjs --check   exit 1 when a phrase has no Turkish in API_TR
 *   node backend/scripts/apiMessages.cjs --json    phrases as JSON (for tooling)
 *
 * backend/i18n/backendI18n.selftest.cjs runs the check on every PR.
 */

const fs = require("fs");
const path = require("path");

const BACKEND = path.join(__dirname, "..");
const ROOTS = ["lib", "routes", "socket", "games", "middleware", "server.js"];

// Owner / staff email that only the Descall team reads (Turkish on purpose).
const INTERNAL_ONLY = new Set([
  "lib/signupReport.js",
  "lib/reportAlertEmail.js",
  "lib/feedbackEmail.js",
  "lib/descoinAntibot/alerts.js",
]);

// Developer / diagnostic text: never shown in the app (logs, health checks, protocol
// errors, operator hints, request-shape errors that only a broken client can trigger).
const SKIP = new Set([
  "Internal server error",
  "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment variables.",
  "Not allowed by CORS",
  "Supabase not configured",
  "Database not configured",
  "invalid payload shape",
  // Sign in with Apple token checks (caught; the user sees "Sign in with Apple failed.")
  "Unknown Apple signing key",
  "Malformed Apple identity token",
  "Apple nonce mismatch",
  "Apple token has no subject",
  // Internal / operator text
  "Invalid secret payload",
  "Email is not configured",
  "Invalid error data",
  "Failed to log error",
  "IO not ready.",
  "Descall API",
  "Socket connected successfully.",
  "Missing or malformed Authorization header.",
  "Failed to create user. Database columns are missing. Run pending migrations.",
  "Google Sign-In is not configured. Set GOOGLE_CLIENT_ID on the server.",
  "Frontend not built. Deploy must run: cd frontend && npm install --include=dev && npm run build:prod",
  // Stored consent record (what the visitor agreed to), not shown back
  "Get occasional release notes — no spam, unsubscribe anytime.",
]);
// Literal patterns to skip: env / migration hints, HTTP / protocol diagnostics.
const SKIP_RE = [
  /^Authentication (failed|required)/,
  /\b(SUPABASE|JWT|VAPID|APNS|FCM|TURN|RESEND|SMTP)[A-Z_]*\b/,
  /\bmigration\b.*\.sql/i,
  /^Unknown (permission key|capped DesCoin reason|shop category)/,
  /^HTTP \d/,
  /^Apple keys HTTP/,
  /^ffmpeg/,
];

const FIELD_RE = /(?:^|[\s{,(])(error|message|reason|text|hint|detail)\s*:\s*(["'])((?:\\.|(?!\2)[^\\\n])*)\2/g;
const THROW_RE = /\b(?:new Error|bad|fail|httpError|badRequest)\(\s*(["'])((?:\\.|(?!\1)[^\\\n])*)\1/g;
// Message maps and constants: `CODE: "Sentence."`, `const X = "Sentence."` (ends in . ! ?).
const SENTENCE_RE = /(?:^|[\s{,])(?:[A-Za-z_$][\w$]*\s*:|const\s+[A-Z][A-Z0-9_]*\s*=)\s*(["'])((?:\\.|(?!\1)[^\\\n])*[.!?])\1/g;
const TEMPLATE_RE = /\b(?:apiError|templatedError)\(\s*(["'])((?:\\.|(?!\1)[^\\\n])*)\1|\bapiText\(\s*["']\w+["']\s*,\s*(["'])((?:\\.|(?!\3)[^\\\n])*)\3/g;

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) walk(p, out);
    else if (/\.(js|cjs)$/.test(name) && !/\.(selftest|test|unit\.test|integration\.test)\.(js|cjs)$/.test(name)) out.push(p);
  }
  return out;
}

function stripComments(code) {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:"'`\\])\/\/[^\n]*/g, (m, p) => p + " ".repeat(m.length - p.length));
}

function unescape(q, body) {
  try {
    return JSON.parse(`"${body.replace(/\\'/g, "'").replace(/(^|[^\\])"/g, '$1\\"')}"`);
  } catch {
    return body;
  }
}

/** A sentence a person reads: starts with a capital letter (or "@" / "{"), has a space. */
function isPhrase(s) {
  if (!s || s.length < 3) return false;
  if (!/\s/.test(s.trim())) return false;
  if (!/^[A-Z{@"“(]/.test(s.trim())) return false;
  if (/^[A-Z_]+$/.test(s)) return false;
  if (SKIP.has(s) || SKIP_RE.some((re) => re.test(s))) return false;
  return true;
}

function collect() {
  const files = [];
  for (const r of ROOTS) {
    const p = path.join(BACKEND, r);
    if (!fs.existsSync(p)) continue;
    if (fs.statSync(p).isDirectory()) walk(p, files);
    else files.push(p);
  }
  const phrases = new Map(); // text -> first location
  for (const file of files) {
    const rel = path.relative(BACKEND, file).split(path.sep).join("/");
    if (INTERNAL_ONLY.has(rel) || rel.startsWith("scripts/") || rel.startsWith("i18n/")) continue;
    // Words that live in the backend catalogs (backend/i18n/*.js), not API phrases.
    if (rel === "lib/serverTemplates.js") continue;
    const lines = stripComments(fs.readFileSync(file, "utf8")).split("\n");
    lines.forEach((line, i) => {
      if (/\bconsole\.(log|warn|error|info|debug)\(/.test(line)) return;
      const add = (q, body) => {
        const text = unescape(q, body);
        if (isPhrase(text) && !phrases.has(text)) phrases.set(text, `${rel}:${i + 1}`);
      };
      let m;
      FIELD_RE.lastIndex = 0;
      while ((m = FIELD_RE.exec(line))) add(m[2], m[3]);
      THROW_RE.lastIndex = 0;
      while ((m = THROW_RE.exec(line))) add(m[1], m[2]);
      SENTENCE_RE.lastIndex = 0;
      while ((m = SENTENCE_RE.exec(line))) add(m[1], m[2]);
      TEMPLATE_RE.lastIndex = 0;
      while ((m = TEMPLATE_RE.exec(line))) {
        if (m[2] != null) add(m[1], m[2]);
        else add(m[3], m[4]);
      }
    });
  }
  return phrases;
}

async function loadApiTr() {
  const { pathToFileURL } = require("url");
  const file = path.join(BACKEND, "..", "src", "i18n", "locales", "api.tr.js");
  const mod = await import(pathToFileURL(file).href);
  return mod.API_TR || {};
}

async function check() {
  const phrases = collect();
  const tr = await loadApiTr();
  const missing = [...phrases].filter(([text]) => !tr[text]);
  return { phrases, missing };
}

async function main() {
  const args = new Set(process.argv.slice(2));
  if (args.has("--check")) {
    const { phrases, missing } = await check();
    if (missing.length) {
      console.error(`${missing.length} API phrase(s) have no Turkish in src/i18n/locales/api.tr.js:`);
      for (const [text, at] of missing) console.error(`  ${JSON.stringify(text)}  (${at})`);
      process.exit(1);
    }
    console.log(`api phrases: ${phrases.size}, all translated`);
    return;
  }
  const phrases = collect();
  if (args.has("--json")) {
    console.log(JSON.stringify(Object.fromEntries(phrases), null, 2));
    return;
  }
  for (const [text, at] of [...phrases].sort((a, b) => a[0].localeCompare(b[0]))) console.log(`${JSON.stringify(text)}\t${at}`);
  console.error(`${phrases.size} phrases`);
}

module.exports = { collect, check, isPhrase, SKIP, INTERNAL_ONLY };

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
