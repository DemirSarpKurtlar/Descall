"use strict";

const state = require("../runtime/sharedState");

/**
 * Global feature visibility. Not a substitute for auth.
 * Admin system routes are mounted separately and are not wrapped by this.
 */
function requirePublicFeature(flag) {
  return function requirePublicFeatureMiddleware(req, res, next) {
    const flags = state.systemConfig?.featureFlags || {};
    if (flags[flag] === false) {
      return res.status(403).json({
        error: "Feature disabled.",
        code: "FEATURE_DISABLED",
        feature: flag,
      });
    }
    return next();
  };
}

module.exports = { requirePublicFeature };
