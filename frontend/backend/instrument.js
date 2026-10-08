"use strict";

/**
 * Sentry error reporting for the backend. Required from server.js right after dotenv and before
 * express / routes so the SDK can instrument them. Does nothing unless SENTRY_DSN is set, so local
 * development without the env var is unaffected. Errors only (no tracing), privacy-scrubbed.
 */

const dsn = String(process.env.SENTRY_DSN || "").trim();
let Sentry = null;

function readAppVersion() {
  try {
    // App version is kept in sync across package.json files by electron/sync-version.cjs.
    return require("../package.json").version || null;
  } catch {
    return null;
  }
}

if (dsn) {
  try {
    Sentry = require("@sentry/node");
    const { scrubEvent, scrubBreadcrumb } = require("./lib/sentryScrub");
    const version = readAppVersion();
    Sentry.init({
      dsn,
      environment: process.env.NODE_ENV || "development",
      release: version ? `descall@${version}` : undefined,
      tracesSampleRate: 0,
      // Errors only: never add sentry-trace/baggage headers to outgoing requests (Supabase, Google, ...).
      tracePropagationTargets: [],
      // Keep Node's default crash-on-unhandled-rejection behaviour (Sentry's default "warn" would
      // swallow it); "strict" reports, flushes, then exits like before.
      integrations: [Sentry.onUnhandledRejectionIntegration({ mode: "strict" })],
      // SDK v11 replaced `sendDefaultPii` with `dataCollection`; this is the "no PII" equivalent.
      dataCollection: {
        userInfo: false,
        cookies: false,
        httpHeaders: { request: { deny: ["authorization", "cookie", "proxy-authorization", "x-api-key"] }, response: false },
        httpBodies: [],
        urlQueryParams: { deny: ["token", "access_token", "refresh_token", "id_token", "code", "key", "jwt", "password", "secret", "signature", "sig"] },
        stackFrameVariables: false,
        databaseQueryData: false,
        genAI: { inputs: false, outputs: false },
        graphQL: { document: false, variables: false },
        queues: false,
      },
      beforeSend: (event) => scrubEvent(event),
      beforeBreadcrumb: (crumb) => scrubBreadcrumb(crumb),
    });
    console.log(`[sentry] enabled (${process.env.NODE_ENV || "development"}, ${version ? `descall@${version}` : "no release"})`);
  } catch (err) {
    Sentry = null;
    console.warn("[sentry] init failed:", err && err.message ? err.message : err);
  }
}

/** Adds Sentry's Express error middleware when enabled (call after all routes, before own error handler). */
function setupSentryExpressErrorHandler(app) {
  if (!Sentry) return;
  try {
    Sentry.setupExpressErrorHandler(app);
  } catch (err) {
    console.warn("[sentry] express error handler setup failed:", err && err.message ? err.message : err);
  }
}

module.exports = { sentryEnabled: () => Boolean(Sentry), setupSentryExpressErrorHandler };
