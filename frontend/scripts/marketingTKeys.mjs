/**
 * Collect t("…") keys used by marketing JSX (not SEO content objects).
 */
import fs from "node:fs";
import path from "node:path";

const KEY_RE = /\bt\(\s*(["'])((?:\\.|(?!\1)[\s\S])*?)\1/g;
const SKIP_SUFFIXES = ["marketingPhrases.tr.js", "seoConfig.js", "content/discordSeoContent.js"];

function walk(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, acc);
    else if (/\.(js|jsx)$/.test(entry.name)) acc.push(full);
  }
  return acc;
}

export function collectMarketingTKeys(siteDir) {
  const keys = new Set();
  for (const file of walk(siteDir)) {
    const rel = path.relative(siteDir, file).replaceAll("\\", "/");
    if (SKIP_SUFFIXES.some((s) => rel.endsWith(s) || rel.includes("/content/"))) continue;
    if (rel.includes("/seo/") && !rel.endsWith("prerenderCopy.js")) continue;
    const src = fs.readFileSync(file, "utf8");
    KEY_RE.lastIndex = 0;
    let m;
    while ((m = KEY_RE.exec(src))) {
      const raw = m[2].replace(/\\n/g, "\n").replace(/\\"/g, '"').replace(/\\'/g, "'");
      if (raw.trim()) keys.add(raw);
    }
  }
  return keys;
}

export const MARKETING_IDENTITY_KEYS = new Set([
  "DimaAI",
  "Beta",
  "Descall",
  "Blog",
  "Valorant LFG",
  "GitHub",
]);
