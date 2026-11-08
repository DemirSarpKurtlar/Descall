#!/usr/bin/env node
/**
 * Prints the account's API publishing quota and token health. Needs IG_USER_ID and
 * IG_ACCESS_TOKEN; with META_APP_ID + META_APP_SECRET it also shows the token expiry.
 *   node bin/check-limit.mjs
 */
import { GraphClient, debugToken } from "../lib/graph.mjs";

const env = process.env;
if (!env.IG_USER_ID || !env.IG_ACCESS_TOKEN) {
  console.error("set IG_USER_ID and IG_ACCESS_TOKEN");
  process.exit(2);
}
const graph = new GraphClient({ igUserId: env.IG_USER_ID, accessToken: env.IG_ACCESS_TOKEN, version: env.IG_GRAPH_VERSION || undefined });
try {
  const account = await graph.getAccount();
  console.log(`account: ${account.username ? "@" + account.username : "(no username field)"} id=${account.id}`);
  const limit = await graph.getPublishingLimit();
  console.log(`publishing limit: ${limit.used} used of ${limit.total ?? "unknown"} in the moving 24 h window`);
  if (env.META_APP_ID && env.META_APP_SECRET) {
    const t = await debugToken({ appId: env.META_APP_ID, appSecret: env.META_APP_SECRET, token: env.IG_ACCESS_TOKEN, version: env.IG_GRAPH_VERSION || undefined });
    const days = t.expiresAt ? Math.floor((t.expiresAt - Date.now()) / 86400000) : null;
    console.log(`token: valid=${t.isValid} type=${t.type} expires=${t.expiresAt ? `${t.expiresAt.toISOString()} (${days} days)` : "never"}`);
    console.log(`scopes: ${t.scopes.join(", ")}`);
    if (days != null && days < 10) console.log("::warning::Instagram token expires in less than 10 days; run bin/refresh-token.mjs");
  }
} catch (e) {
  console.error(`check failed: ${e.message}`);
  process.exit(1);
}
