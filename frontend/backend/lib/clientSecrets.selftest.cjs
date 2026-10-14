"use strict";

/**
 * Server credentials must not ship in the client source or the Vite bundle.
 * Prints pattern names and file paths only, never the matching text.
 * Run: node backend/lib/clientSecrets.selftest.cjs
 */

const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..", "..");
const patterns = [
  { name: "service-role", re: /SUPABASE_SERVICE_ROLE(?:_KEY)?\s*[:=]\s*['"]?[A-Za-z0-9_\-.]{20,}/ },
  { name: "jwt-secret-assignment", re: /JWT_SECRET\s*[:=]\s*['"]?[^\s'"]{12,}/ },
  { name: "resend-key", re: /RESEND_API_KEY\s*[:=]\s*['"]?\S{8,}/ },
  { name: "turn-credential", re: /TURN_CREDENTIAL\s*[:=]\s*['"]?[^\s'"]{8,}/ },
  { name: "riot-client-secret", re: /RIOT_CLIENT_SECRET\s*[:=]\s*['"]?[^\s'"]{8,}/ },
  { name: "private-key-block", re: /BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY/ },
  { name: "stripe-live", re: /sk_live_/ },
  { name: "aws-access-key", re: /AKIA[0-9A-Z]{16}/ },
];

const sourceRoots = [
  path.join(root, "src"),
  path.join(root, "public"),
  path.join(root, "index.html"),
];
const envFile = path.join(root, ".env.production");
const distDir = path.join(root, "dist");

function walk(entry, out) {
  if (!fs.existsSync(entry)) return;
  const stat = fs.statSync(entry);
  if (stat.isDirectory()) {
    if (path.basename(entry) === "node_modules") return;
    for (const name of fs.readdirSync(entry)) walk(path.join(entry, name), out);
    return;
  }
  if (stat.size > 8_000_000) return;
  const ext = path.extname(entry).toLowerCase();
  if (![".js", ".mjs", ".cjs", ".jsx", ".css", ".html", ".json", ".txt", ".svg", ".webmanifest", ".map", ".xml"].includes(ext) && ext !== "") return;
  if (ext === "") return;
  out.push(entry);
}

const files = [];
for (const entry of sourceRoots) walk(entry, files);
if (fs.existsSync(envFile)) files.push(envFile);
const scanDist = fs.existsSync(distDir);
if (scanDist) walk(distDir, files);

const hits = [];
for (const file of files) {
  let text;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch {
    continue;
  }
  for (const pattern of patterns) {
    if (pattern.re.test(text)) {
      hits.push(`${pattern.name} ${path.relative(root, file)}`);
    }
  }
}

const allowedEnv = new Set([
  "VITE_API_BASE_URL",
  "VITE_SOCKET_URL",
  "VITE_GOOGLE_CLIENT_ID",
  "VITE_PUBLIC_POSTHOG_KEY",
  "VITE_PUBLIC_POSTHOG_HOST",
]);
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const key = trimmed.split("=", 1)[0].trim();
    if (!key.startsWith("VITE_") || !allowedEnv.has(key)) {
      hits.push(`unexpected-env-key ${key}`);
    }
  }
}

if (hits.length) {
  console.error("clientSecrets.selftest: server secret patterns in the client");
  for (const hit of hits) console.error(`  ${hit}`);
  process.exit(1);
}

console.log(`clientSecrets.selftest ok (${files.length} files${scanDist ? ", including dist" : ""})`);
