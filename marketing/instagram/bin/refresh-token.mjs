#!/usr/bin/env node
/**
 * Exchanges the current IG_ACCESS_TOKEN (a still-valid user token) for a fresh
 * long-lived one (about 60 days). Run it on your own machine, not in CI.
 *
 *   META_APP_ID=... META_APP_SECRET=... IG_ACCESS_TOKEN=... node bin/refresh-token.mjs --gh-secret
 *
 * --gh-secret  pipes the new token straight into `gh secret set IG_ACCESS_TOKEN` (needs the
 *              GitHub CLI, logged in). The token is never printed.
 * --print      prints the token to stdout instead (only if you really need to copy it).
 * A System User token from Meta Business settings can be created without expiry; that
 * needs no refresh at all (see README).
 */
import { spawnSync } from "node:child_process";
import { exchangeLongLivedToken } from "../lib/graph.mjs";

const env = process.env;
if (!env.META_APP_ID || !env.META_APP_SECRET || !env.IG_ACCESS_TOKEN) {
  console.error("set META_APP_ID, META_APP_SECRET and IG_ACCESS_TOKEN");
  process.exit(2);
}
const toGh = process.argv.includes("--gh-secret");
const print = process.argv.includes("--print");
if (!toGh && !print) {
  console.error("choose --gh-secret (recommended) or --print");
  process.exit(2);
}
try {
  const r = await exchangeLongLivedToken({ appId: env.META_APP_ID, appSecret: env.META_APP_SECRET, token: env.IG_ACCESS_TOKEN, version: env.IG_GRAPH_VERSION || undefined });
  const days = r.expiresIn ? Math.round(r.expiresIn / 86400) : null;
  if (toGh) {
    const repo = env.GITHUB_REPOSITORY || "DemirSarpKurtlar/Descall";
    const p = spawnSync("gh", ["secret", "set", "IG_ACCESS_TOKEN", "--repo", repo], { input: r.accessToken, stdio: ["pipe", "inherit", "inherit"] });
    if (p.status !== 0) throw new Error("gh secret set failed");
    console.log(`IG_ACCESS_TOKEN updated in ${repo}${days ? `, valid for about ${days} days` : ""}`);
  } else {
    process.stdout.write(r.accessToken + "\n");
    if (days) console.error(`valid for about ${days} days`);
  }
} catch (e) {
  console.error(`refresh failed: ${e.message}`);
  process.exit(1);
}
