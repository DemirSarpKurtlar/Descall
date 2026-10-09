"use strict";

process.env.JWT_SECRET = process.env.JWT_SECRET || "public-features-selftest-secret-32ch";
process.env.SUPABASE_URL = process.env.SUPABASE_URL || "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "test-service-role-key";

const http = require("http");
const express = require("express");
const state = require("../runtime/sharedState");
const { publicFeatureFlags } = require("./systemSettings");
const publicFeatureRoutes = require("../routes/publicFeatures");
const { requirePublicFeature } = require("../middleware/requirePublicFeature");
const { requireAuth } = require("../middleware/auth");

function assert(cond, msg) {
  if (!cond) throw new Error("FAIL: " + msg);
}

const original = { ...state.systemConfig.featureFlags };

function listen(app) {
  return new Promise((resolve) => {
    const server = http.createServer(app);
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

async function getJson(port, path, headers) {
  const res = await fetch(`http://127.0.0.1:${port}${path}`, { headers });
  const body = await res.json();
  return { status: res.status, body };
}

(async () => {
  const pub = publicFeatureFlags({ voice: false, screen: false });
  assert(pub.valorantLfg === true && pub.valorantCompanion === true, "legacy row defaults new flags on");
  assert(!("voice" in pub) && !("screen" in pub), "public payload omits private flags");

  state.systemConfig.featureFlags = {
    ...original,
    valorantLfg: false,
    valorantCompanion: true,
  };

  const app = express();
  app.use("/api/features", publicFeatureRoutes);
  app.use("/api/lfg", requirePublicFeature("valorantLfg"));
  app.get("/api/lfg/meta", (_req, res) => res.json({ ok: true }));
  app.get("/api/admin/system", requireAuth, (_req, res) => res.json({ config: state.systemConfig }));

  const server = await listen(app);
  try {
    const port = server.address().port;
    const features = await getJson(port, "/api/features");
    assert(features.status === 200, "public features status");
    assert(Object.keys(features.body).sort().join(",") === "iosGlass,valorantCompanion,valorantLfg", "only public keys");
    assert(features.body.valorantLfg === false, "persisted ram flags are returned");
    assert(features.body.valorantCompanion === true, "companion stays on");
    assert(features.body.iosGlass === true, "iOS glass kill switch defaults on");
    assert(features.body.voice === undefined && features.body.maintenanceMode === undefined, "no admin config leak");

    const blocked = await getJson(port, "/api/lfg/meta");
    assert(blocked.status === 403 && blocked.body.code === "FEATURE_DISABLED", "disabled lfg is rejected");

    const unauth = await getJson(port, "/api/admin/system");
    assert(unauth.status === 401, "admin config requires auth");
  } finally {
    state.systemConfig.featureFlags = original;
    await new Promise((resolve) => server.close(resolve));
  }

  console.log("publicFeatures.selftest.cjs ok");
})().catch((err) => {
  state.systemConfig.featureFlags = original;
  console.error(err);
  process.exit(1);
});