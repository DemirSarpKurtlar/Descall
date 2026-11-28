"use strict";

/**
 * Payment providers behind one face. Each one reports "configured" from its environment variables
 * only (never their values). With nothing configured every checkout answers 503
 * provider_not_configured and the admin console shows which variables are missing.
 *
 * Google Play Billing is not built (Android is low priority; the Capacitor shell has no billing
 * plugin): Android shows the plans without a buy button until it is.
 */

const apple = require("./apple");
const paddle = require("./paddle");
const iyzico = require("./iyzico");
const revenuecat = require("./revenuecat");

const google = {
  status: () => ({ id: "google", configured: false, missing: ["not_built"], webhook: null, notBuilt: true }),
};

const PROVIDERS = { apple, paddle, iyzico, revenuecat, google };

function statusAll(env = process.env) {
  return Object.values(PROVIDERS).map((p) => p.status(env));
}

function isConfigured(id, env = process.env) {
  const p = PROVIDERS[id];
  return Boolean(p && p.status(env).configured);
}

/** Which provider sells on a platform with this config ("apple" on iOS, the web provider elsewhere). */
function providerFor(cfg, platform) {
  if (platform === "ios") return cfg?.mobileProvider === "revenuecat" ? "revenuecat" : "apple";
  if (platform === "android") return "google";
  return cfg?.webProvider === "paddle" ? "paddle" : "iyzico";
}

module.exports = { PROVIDERS, apple, paddle, iyzico, revenuecat, google, statusAll, isConfigured, providerFor };
