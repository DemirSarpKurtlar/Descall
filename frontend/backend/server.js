"use strict";

/**
 * DESCALL BACKEND - CLEAN VERSION
 * Simple, robust, error-proof
 */

const path = require("path");
const fs = require("fs");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
// Sentry must load before express/routes so it can instrument them (no-op without SENTRY_DSN).
const { setupSentryExpressErrorHandler } = require("./instrument");

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

// Routes
const authRoutes = require("./routes/auth");
const adminRoutes = require("./routes/admin");
const mediaRoutes = require("./routes/media");
const groupRoutes = require("./routes/groups");
const reactionRoutes = require("./routes/reactions");
const friendsRoutes = require("./routes/friends");
const activityRoutes = require("./routes/activity");
const serverRoutes = require("./routes/servers");
const webrtcRoutes = require("./routes/webrtc");
const appReleaseRoutes = require("./routes/appRelease");
const errorRoutes = require("./routes/errors");
const callsRoutes = require("./routes/calls");
const webPushRoutes = require("./routes/webPush");
const shopRoutes = require("./routes/shop");
const publicFeatureRoutes = require("./routes/publicFeatures");
const analyticsRoutes = require("./routes/analytics");
const dmPrefsRoutes = require("./routes/dmPrefs");
const reportsRoutes = require("./routes/reports");
const { goneRouter } = require("./routes/gone");
const { sitemapRouter } = require("./routes/sitemap");
const state = require("./runtime/sharedState");
const { sendFeedbackEmail } = require("./lib/feedbackEmail");

// Inline feedback - no external file needed
const { requireAuth } = require("./middleware/auth");
const { requireAdmin } = require("./middleware/requireAdmin");
const { debugRoutesEnabled } = require("./lib/debugGate");
const { claimWaitlistNotify } = require("./lib/waitlistNotify");
const { recordFailure, rejectIfLimited } = require("./lib/rateLimit");
const supabase = require("./db/supabase");

// Socket
const { socketAuthMiddleware } = require("./middleware/socketAuth");
const { registerSocketHandlers } = require("./socket/handlers");
const { cacheUserProfile, broadcastUserProfileUpdate, toPublicUser } = require("./lib/userProfile");
const { registerActivityHandlers } = require("./socket/activityHandlers");
const { registerGameHandlers } = require("./socket/gameHandlers");

const PORT = process.env.PORT || 3000;

const app = express();
const httpServer = http.createServer(app);

const isVercel = Boolean(process.env.VERCEL);
const { isAllowedOrigin, corsOrigin } = require("./lib/corsOrigins");
const { securityHeadersMiddleware } = require("./middleware/securityHeaders");

const io = new Server(httpServer, {
  path: isVercel ? "/api/socket.io" : "/socket.io",
  addTrailingSlash: isVercel ? false : undefined,
  cors: { origin: corsOrigin, methods: ["GET", "POST"], credentials: false },
  transports: ["websocket", "polling"],
  allowUpgrades: true,
  // A dead link (Wi-Fi ↔ cellular switch, NAT rebinding, sleeping radio) is
  // noticed after pingInterval + pingTimeout. 25 s + 20 s left a call without
  // signaling for up to 45 s, so an ICE restart offer could not get through;
  // 12 s + 10 s keeps that under ~22 s at a negligible ping cost.
  pingInterval: 12000,
  pingTimeout: 10000,
  // 2.11.4 (scale S0): compress only big frames (boot lists, roster
  // snapshots). Small chat/typing frames stay raw. Small zlib window and no
  // context takeover keep memory per socket at ~12 KB instead of ~300 KB.
  perMessageDeflate: {
    threshold: 2048,
    serverNoContextTakeover: true,
    clientNoContextTakeover: true,
    serverMaxWindowBits: 10,
    zlibDeflateOptions: { level: 1, memLevel: 4, windowBits: 10 },
  },
});

app.set("io", io);
// 2.11.2: private message media. Every outgoing Socket.IO payload / JSON body gets its
// sb://media-private/... refs replaced with short-lived signed URLs.
require("./lib/privateMedia").installPrivateMediaHooks({ io, express });
// Needed so req.protocol / x-forwarded-* are correct behind Render/Vercel proxies.
app.set("trust proxy", 1);

const { canonicalHostMiddleware } = require("./middleware/canonicalHost");

// Middleware
const compression = require("compression");
{
  const { isEdgePublicPath } = require("./lib/edgeConfig");
  const appCors = cors({ origin: corsOrigin, credentials: false });
  const publicCors = cors({ origin: "*", credentials: false, methods: ["GET", "HEAD", "OPTIONS"] });
  // Edge-cacheable public reads answer `*` (CDN caches ignore Vary: Origin).
  app.use((req, res, next) => (isEdgePublicPath(req.path) && (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") ? publicCors : appCors)(req, res, next));
}
app.use(securityHeadersMiddleware);
// HTTP→HTTPS, www→apex, Render HTML→descall.com (API paths excluded)
app.use(canonicalHostMiddleware);
app.use(compression({ threshold: 1024 }));

app.use(express.json());
app.use(require("./middleware/gzipJson"));

// Vercel rewrites backend traffic onto /api (api/index.js). Restore the
// original path, then strip a synthetic /api prefix for root mounts.
if (isVercel) {
  const STRIP_API_PREFIXES = [
    "/auth",
    "/friends",
    "/health",
    "/groups",
    "/media",
    "/reactions",
    "/servers",
    "/calls",
    "/dm",
    "/reports",
    "/voice-recordings",
  ];
  app.use((req, _res, next) => {
    const headers = req.headers || {};
    const forwarded = headers["x-forwarded-uri"] || headers["x-invoke-path"] || "";
    let raw = req.url || "";
    const onlyApi = raw === "/api" || raw === "/api/" || raw.startsWith("/api?");
    if (onlyApi && typeof forwarded === "string" && forwarded.startsWith("/")) {
      raw = forwarded;
    }
    const q = raw.indexOf("?");
    const pathname = q >= 0 ? raw.slice(0, q) : raw;
    const search = q >= 0 ? raw.slice(q) : "";
    req.url = pathname + search;
    for (const prefix of STRIP_API_PREFIXES) {
      const withApi = "/api" + prefix;
      if (pathname === withApi || pathname.startsWith(withApi + "/")) {
        req.url = (pathname.slice(4) + search) || ("/" + search);
        break;
      }
    }
    next();
  });
}

app.use("/api/web-push", webPushRoutes);
app.use("/api/shop", shopRoutes);
app.use("/api/dimaai", goneRouter("This feature has been removed."));

// Debug - log all requests (skip noise in production)
if (process.env.NODE_ENV !== "production") {
  app.use((req, res, next) => {
    console.log(`[REQ] ${req.method} ${req.path}`);
    next();
  });
}

// Off unless ENABLE_DEBUG_ROUTES=true. NODE_ENV alone must not expose table peeks.
// Admin JWT required even then.
if (debugRoutesEnabled()) app.get("/debug/tables", requireAuth, requireAdmin, async (_req, res) => {
  try {
    const { data, error } = await supabase
      .from("information_schema.tables")
      .select("table_name")
      .eq("table_schema", "public");
    if (error) {
      // fallback: try raw SQL via rpc
      const { data: d2, error: e2 } = await supabase.rpc("list_tables");
      return res.json({ rpcResult: d2, rpcError: e2?.message, originalError: error?.message });
    }
    return res.json({ tables: data });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// TEMP DEBUG: show first 5 rows of any table
if (debugRoutesEnabled()) app.get("/debug/peek/:tableName", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from(req.params.tableName)
      .select("*")
      .limit(5);
    return res.json({ data, error: error?.message });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// API status (not served at / — root serves the React app)
app.get("/api/status", (_req, res) => {
  res.json({
    status: "ok",
    message: "Descall API",
    timestamp: new Date().toISOString(),
    version: "3.0.0"
  });
});

app.use("/api/features", publicFeatureRoutes);
// 2.11.7 (scale S3): public ES256 keys for the Cloudflare edge. Empty until
// JWT_ES256_PRIVATE_KEY is set. Public by design; shared cache 1 h.
app.get("/api/jwks.json", (_req, res) => {
  require("./lib/edgeConfig").publicCache(res, { maxAge: 300, sMaxAge: 3600 });
  res.json(require("./config/jwt").publicJwks());
});

// Health check
function sendHealth(_req, res) {
  res.json({
    status: "healthy",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
}
app.get("/health", sendHealth);
app.get("/api/health", sendHealth);

// Public marketing waitlist + consent beacons (no auth).
// Opt-ins persist when marketing_subscribers exists; a missing table still returns { ok: true }.
const marketingOptIn = require("./lib/marketingOptIn");
app.post("/api/marketing/waitlist", async (req, res) => {
  try {
    const ip = req.ip || req.socket?.remoteAddress || "unknown";
    if (rejectIfLimited(res, [recordFailure(`waitlist:${ip}`, { windowMs: 60 * 60 * 1000, max: 8 })])) {
      return;
    }
    const email = String(req.body?.email || "")
      .trim()
      .toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: "Invalid email" });
    }
    const source = String(req.body?.source || "unknown").slice(0, 64);
    const pathName = String(req.body?.path || "").slice(0, 128);
    const locale = String(req.body?.locale || "en").slice(0, 16);
    await marketingOptIn.subscribe({
      email,
      source,
      path: pathName,
      locale,
      consentText: "Get occasional release notes — no spam, unsubscribe anytime.",
    });
    if (claimWaitlistNotify(email)) {
      try {
        const { sendEmail } = require("./lib/mailer");
        await sendEmail({
          to: process.env.WAITLIST_NOTIFY_TO || "contact@descall.com",
          subject: `Descall waitlist: ${email}`,
          text: `New waitlist signup\nEmail: ${email}\nSource: ${source}\nPath: ${pathName}\n`,
        }).catch(() => {});
      } catch {
        /* mailer optional */
      }
    }
    return res.json({ ok: true });
  } catch (e) {
    if (e?.status === 400) return res.status(400).json({ error: "Invalid email" });
    console.error("[marketing] waitlist failed:", e?.message || e);
    return res.status(500).json({ error: "Could not save that request." });
  }
});

app.post("/api/marketing/contact", async (req, res) => {
  try {
    const ip = req.ip || req.socket?.remoteAddress || "unknown";
    if (rejectIfLimited(res, [recordFailure(`contact:${ip}`, { windowMs: 60 * 60 * 1000, max: 6 })])) {
      return;
    }
    const email = String(req.body?.email || "")
      .trim()
      .toLowerCase();
    const name = String(req.body?.name || "").trim().slice(0, 80);
    const message = String(req.body?.message || "").trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
      return res.status(400).json({ error: "Invalid email" });
    }
    if (message.length < 5 || message.length > 2000) {
      return res.status(400).json({ error: "Message must be 5–2000 characters" });
    }
    const { sendEmail } = require("./lib/mailer");
    const result = await sendEmail({
      to: process.env.WAITLIST_NOTIFY_TO || process.env.REPORT_ALERT_EMAIL || "contact@descall.com",
      replyTo: email,
      subject: `Descall contact: ${name || email}`.slice(0, 120),
      text: `Contact form\nName: ${name || "(none)"}\nEmail: ${email}\n\n${message}\n`,
    });
    return res.json({ ok: true, delivered: !result?.skipped });
  } catch (e) {
    console.error("[marketing] contact failed:", e?.message || e);
    return res.status(500).json({ error: "Could not send that message." });
  }
});

app.get("/api/marketing/confirm", async (req, res) => {
  const result = await marketingOptIn.confirmByToken(req.query?.token);
  const copy = marketingOptIn.copyFor(result.locale);
  const body = result.ok ? copy.pageConfirm : copy.pageGone;
  res.status(result.ok ? 200 : 404).type("html").send(marketingOptIn.pageHtml("Descall", body));
});

app.get("/api/marketing/unsubscribe", async (req, res) => {
  const result = await marketingOptIn.unsubscribeByToken(req.query?.token);
  const copy = marketingOptIn.copyFor(result.locale);
  const body = result.ok ? copy.pageUnsub : copy.pageGone;
  res.status(result.ok ? 200 : 404).type("html").send(marketingOptIn.pageHtml("Descall", body));
});

function consentPayload(req) {
  const body = req.body;
  if (body && typeof body === "object" && !Buffer.isBuffer(body)) return body;
  if (typeof body === "string" && body.trim()) {
    try {
      const parsed = JSON.parse(body);
      if (parsed && typeof parsed === "object") return parsed;
    } catch {
      /* ignore */
    }
  }
  return {};
}

// text/plain beacons skip the JSON parser. Parse them here, and always echo
// ACAO for the public site so the browser can record the event.
const consentText = express.text({ type: ["text/plain", "text/plain;charset=UTF-8"], limit: "4kb" });
app.options("/api/marketing/consent-event", (req, res) => {
  const origin = req.get("origin");
  if (origin && isAllowedOrigin(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "content-type");
  }
  return res.status(204).end();
});
app.post("/api/marketing/consent-event", (req, res, next) => {
  const type = String(req.headers["content-type"] || "");
  if (type.includes("text/plain")) return consentText(req, res, next);
  return next();
}, (req, res) => {
  try {
    const origin = req.get("origin");
    if (origin && isAllowedOrigin(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
    }
    const payload = consentPayload(req);
    const choice = String(payload.choice || "").slice(0, 32);
    const pathName = String(payload.path || "").slice(0, 128);
    if (choice) {
      console.log("[marketing] consent", choice, pathName);
    }
    return res.status(204).end();
  } catch {
    return res.status(204).end();
  }
});

// SEO: robots + advanced sitemap (index, pages, invites, announcements, HTML)
// The DimaAI landing page and app view were removed in 2.9.141: send old links home.
app.get(["/dimaai", "/dimaai/*"], (_req, res) => res.redirect(301, "/"));
app.get(["/tr/dimaai", "/tr/dimaai/*"], (_req, res) => res.redirect(301, "/tr"));
app.use(sitemapRouter);

// Test endpoint - no auth required
app.post("/api/test", (req, res) => {
  console.log("[TEST] POST /api/test received");
  res.json({
    success: true,
    message: "Test endpoint works",
    received: req.body,
    timestamp: new Date().toISOString()
  });
});

// Frontend build info, needed early — see the SPA-vs-API disambiguation
// middleware immediately below, which must run *before* /groups, /friends,
// /calls, and /servers are mounted (some of those routers have a real GET "/" handler
// of their own, which would otherwise intercept a browser page navigation
// before it ever reached the later catch-all).
const distPath = path.join(__dirname, "..", "dist");
const indexPath = path.join(distPath, "index.html");
const hasFrontend = fs.existsSync(indexPath);

// /groups, /friends, /calls, and /servers are mounted below as bare Express routers
// for the API (e.g. GET /groups/my) *and* are real client-side SPA routes
// (see src/lib/appRoutes.js) — a browser navigating straight to
// https://descall.com/groups (typed URL, refresh, bookmark, shared link)
// needs the app's index.html, not whatever (or nothing) that path's API
// router does with a bare GET. Serve the SPA for those before the ambiguous
// routers get a chance to intercept — real browser navigations are
// distinguished from the app's own fetch()/XHR calls via Fetch Metadata's
// Sec-Fetch-Mode: navigate and/or an Accept header that actually lists
// text/html (fetch()'s default Accept is "*/*", never text/html, unless a
// caller sets it explicitly).
const { shouldServeSpaShell } = require("./lib/spaNavigation");
// Same SPA-vs-API disambiguation on Vercel and elsewhere. vercel.json also
// rewrites document navigations to /index.html, but the function can still
// see these paths (rewrite miss, local, Render). Missing dist must not 500.
app.get("*", (req, res, next) => {
  if (!shouldServeSpaShell(req)) return next();
  if (!hasFrontend) return next();
  res.setHeader("Cache-Control", "no-cache");
  return res.sendFile(indexPath, (err) => {
    if (err) return next();
  });
});

// Register main routes (both with and without /api prefix)
app.use("/auth", authRoutes);
app.use("/admin", adminRoutes);
app.use("/media", mediaRoutes);
app.use("/groups", groupRoutes);
app.use("/reactions", reactionRoutes);
app.use("/friends", friendsRoutes);
app.use("/servers", serverRoutes);
app.use("/calls", callsRoutes);

// /api/* aliases — frontend calls mix /api/... and /... so support both
app.use("/api/auth", authRoutes);
require("./lib/accountDeletion").startDeletionSweeper();
app.use("/api/admin", adminRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/media", mediaRoutes);
app.use("/api/groups", groupRoutes);
app.use("/api/reactions", reactionRoutes);
app.use("/api/friends", friendsRoutes);
app.use("/api/activity", activityRoutes);
app.use("/api/servers", serverRoutes);
app.use("/api/webrtc", webrtcRoutes);
app.use("/api/errors", errorRoutes);
app.use("/api/app", appReleaseRoutes);
app.use("/api/calls", callsRoutes);
app.use("/api/web-push", webPushRoutes);
app.use("/api/dm", dmPrefsRoutes);
app.use("/dm", dmPrefsRoutes);
app.use("/api/reports", reportsRoutes);
app.use("/reports", reportsRoutes);
// Call recording was removed: uploads from old clients are refused and never stored.
const voiceRecordingsGone = goneRouter("Call recording has been removed. Calls are not recorded.");
app.use("/api/voice-recordings", voiceRecordingsGone);
app.use("/voice-recordings", voiceRecordingsGone);

// ============================================================================
// INLINE FEEDBACK ENDPOINTS - Direct in server.js (most reliable)
// ============================================================================

// Submit feedback - POST /api/feedback/submit
app.post("/api/feedback/submit", requireAuth, async (req, res) => {
  console.log("[FEEDBACK] POST /api/feedback/submit - START");
  console.log("[FEEDBACK] User:", req.user?.username);
  
  try {
    const { category, priority, subject, message, attachments, platform, appVersion } = req.body;
    
    // Validation
    if (!message || typeof message !== "string" || message.trim().length === 0) {
      return res.status(400).json({ success: false, error: "Message is required" });
    }
    
    // Prepare data
    const feedbackData = {
      user_id: String(req.user.id),
      username: req.user.username || "Anonymous",
      category: String(category || "general").toLowerCase(),
      priority: String(priority || "medium").toLowerCase(),
      subject: String(subject || message.trim().split(/\r?\n/, 1)[0]).trim().slice(0, 200),
      message: message.trim(),
      attachments: Array.isArray(attachments) ? attachments.slice(0, 10) : [],
      platform: String(platform || req.get("user-agent") || "unknown").slice(0, 160),
      app_version: String(appVersion || req.get("x-app-version") || "unknown").slice(0, 80),
      status: "new",
      viewed: false,
      admin_replies: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    
    console.log("[FEEDBACK] Inserting...");
    
    // Insert to Supabase
    const { data, error } = await supabase
      .from("user_feedback")
      .insert(feedbackData)
      .select()
      .single();
    
    if (error) {
      console.error("[FEEDBACK] Error:", error);
      return res.status(500).json({ success: false, error: error.message });
    }
    
    console.log("[FEEDBACK] SUCCESS! ID:", data?.id);

    let emailDelivery = { sent: false, skipped: true };
    try {
      emailDelivery = await sendFeedbackEmail(data);
      await supabase
        .from("user_feedback")
        .update({
          email_status: emailDelivery.sent ? "sent" : "skipped",
          email_provider_id: emailDelivery.providerId,
          email_sent_at: emailDelivery.sent ? new Date().toISOString() : null,
          email_error: emailDelivery.error || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", data.id);
    } catch (emailError) {
      const message = String(emailError?.message || "Email delivery failed").slice(0, 500);
      console.error("[FEEDBACK] Email delivery failed:", message);
      await supabase
        .from("user_feedback")
        .update({
          email_status: "failed",
          email_error: message,
          updated_at: new Date().toISOString(),
        })
        .eq("id", data.id);
      emailDelivery = { sent: false, error: message };
    }
    
    return res.status(200).json({
      success: true,
      message: "Feedback submitted successfully",
      feedbackId: data?.id,
      emailSent: Boolean(emailDelivery.sent)
    });
    
  } catch (err) {
    console.error("[FEEDBACK] ERROR:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// List feedback - GET /api/feedback/list
app.get("/api/feedback/list", requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("user_feedback")
      .select("*")
      .order("created_at", { ascending: false });
    
    if (error) {
      return res.status(500).json({ success: false, error: error.message });
    }
    
    return res.status(200).json({ success: true, feedback: data || [] });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Mark as viewed - POST /api/feedback/:id/view
app.post("/api/feedback/:id/view", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    
    const { data, error } = await supabase
      .from("user_feedback")
      .update({ viewed: true, viewed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();
    
    if (error) return res.status(500).json({ success: false, error: error.message });
    
    return res.status(200).json({ success: true, feedback: data });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Admin reply - POST /api/feedback/:id/reply
app.post("/api/feedback/:id/reply", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { message } = req.body;
    
    if (!message || message.trim().length === 0) {
      return res.status(400).json({ success: false, error: "Reply message required" });
    }
    
    // Get current
    const { data: current, error: fetchError } = await supabase
      .from("user_feedback")
      .select("admin_replies")
      .eq("id", id)
      .single();
    
    if (fetchError) return res.status(500).json({ success: false, error: fetchError.message });
    
    // Add reply
    const replies = current?.admin_replies || [];
    replies.push({
      id: Date.now().toString(),
      admin_id: req.user.id,
      admin_username: req.user.username,
      message: message.trim(),
      created_at: new Date().toISOString()
    });
    
    // Update
    const { data, error } = await supabase
      .from("user_feedback")
      .update({ admin_replies: replies, status: "in_progress", updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();
    
    if (error) return res.status(500).json({ success: false, error: error.message });
    
    return res.status(200).json({ success: true, feedback: data });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Delete feedback - DELETE /api/feedback/:id
app.delete("/api/feedback/:id", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    
    const { error } = await supabase.from("user_feedback").delete().eq("id", id);
    
    if (error) return res.status(500).json({ success: false, error: error.message });
    
    return res.status(200).json({ success: true, message: "Feedback deleted" });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ========== PROFILE SETTINGS ENDPOINTS ==========

// Update profile - PUT /api/user/profile
app.put("/api/user/profile", requireAuth, async (req, res) => {
  try {
    const { displayName, bio, customStatus, accentColor, fontSize, uiDensity, bubbleStyle, avatarUrl, bannerUrl } = req.body;
    
    const updateData = {};
    if (displayName !== undefined) {
      const trimmed = typeof displayName === "string" ? displayName.trim() : "";
      updateData.display_name = trimmed || null;
    }
    if (bio !== undefined) updateData.bio = bio;
    if (customStatus !== undefined) updateData.custom_status = customStatus;
    if (accentColor !== undefined) updateData.accent_color = accentColor;
    if (fontSize !== undefined) updateData.font_size = fontSize;
    if (uiDensity !== undefined) updateData.ui_density = uiDensity;
    if (bubbleStyle !== undefined) updateData.bubble_style = bubbleStyle;
    if (avatarUrl !== undefined) updateData.avatar_url = avatarUrl;
    if (bannerUrl !== undefined) updateData.banner_url = bannerUrl;
    if (avatarUrl !== undefined || displayName !== undefined || bio !== undefined || customStatus !== undefined) {
      updateData.updated_at = new Date().toISOString();
    }
    
    const { data, error } = await supabase
      .from("users")
      .update(updateData)
      .eq("id", req.user.id)
      .select()
      .single();
    
    if (error) return res.status(500).json({ success: false, error: error.message });

    cacheUserProfile(data);
    const io = req.app.get("io");
    if (io) await broadcastUserProfileUpdate(io, req.user.id);

    return res.json({ success: true, user: toPublicUser(cacheUserProfile(data)) });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Update notification settings - PUT /api/user/notifications
app.put("/api/user/notifications", requireAuth, async (req, res) => {
  try {
    const { soundEnabled, soundVolume, desktopNotifications, callNotifications, mentionNotifications } = req.body;
    
    const updateData = {};
    if (soundEnabled !== undefined) updateData.sound_enabled = soundEnabled;
    if (soundVolume !== undefined) updateData.sound_volume = soundVolume;
    if (desktopNotifications !== undefined) updateData.desktop_notifications = desktopNotifications;
    if (callNotifications !== undefined) updateData.call_notifications = callNotifications;
    if (mentionNotifications !== undefined) updateData.mention_notifications = mentionNotifications;
    
    const { data, error } = await supabase
      .from("users")
      .update(updateData)
      .eq("id", req.user.id)
      .select()
      .single();
    
    if (error) return res.status(500).json({ success: false, error: "Could not save notification settings." });

    return res.json({ success: true, user: toPublicUser(data) });
  } catch (err) {
    console.error("[user] notifications update failed:", err?.message || err);
    return res.status(500).json({ success: false, error: "Could not save notification settings." });
  }
});

// Update privacy settings - PUT /api/user/privacy
app.put("/api/user/privacy", requireAuth, async (req, res) => {
  try {
    const { onlineStatusVisible, lastSeenVisible, typingIndicatorVisible, profileVisibleTo, allowFriendRequests, allowGroupInvites } = req.body;
    
    const updateData = {};
    if (onlineStatusVisible !== undefined) updateData.online_status_visible = onlineStatusVisible;
    if (lastSeenVisible !== undefined) updateData.last_seen_visible = lastSeenVisible;
    if (typingIndicatorVisible !== undefined) updateData.typing_indicator_visible = typingIndicatorVisible;
    if (profileVisibleTo !== undefined) updateData.profile_visible_to = profileVisibleTo;
    if (allowFriendRequests !== undefined) updateData.allow_friend_requests = allowFriendRequests;
    if (allowGroupInvites !== undefined) updateData.allow_group_invites = allowGroupInvites;
    
    const { data, error } = await supabase
      .from("users")
      .update(updateData)
      .eq("id", req.user.id)
      .select()
      .single();
    
    if (error) return res.status(500).json({ success: false, error: "Could not save privacy settings." });

    return res.json({ success: true, user: toPublicUser(data) });
  } catch (err) {
    console.error("[user] privacy update failed:", err?.message || err);
    return res.status(500).json({ success: false, error: "Could not save privacy settings." });
  }
});

// Update regional settings - PUT /api/user/regional
app.put("/api/user/regional", requireAuth, async (req, res) => {
  try {
    const { language, timezone } = req.body;
    
    const updateData = {};
    if (language !== undefined) updateData.language = language;
    if (timezone !== undefined) updateData.timezone = timezone;
    
    const { data, error } = await supabase
      .from("users")
      .update(updateData)
      .eq("id", req.user.id)
      .select()
      .single();
    
    if (error) return res.status(500).json({ success: false, error: "Could not save regional settings." });

    return res.json({ success: true, user: toPublicUser(data) });
  } catch (err) {
    console.error("[user] regional update failed:", err?.message || err);
    return res.status(500).json({ success: false, error: "Could not save regional settings." });
  }
});

// ========== ANNOUNCEMENTS ENDPOINTS ==========

// Get all active announcements - GET /api/announcements
// 2.11.5: same list for everyone → 30 s memory cache (cleared by the admin
// routes below) + shared edge cache 60 s.
const announcementsCache = { at: 0, rows: null };
function invalidateAnnouncementsCache() {
  announcementsCache.at = 0;
  announcementsCache.rows = null;
}
app.get("/api/announcements", async (req, res) => {
  try {
    if (announcementsCache.rows && Date.now() - announcementsCache.at < 30_000) {
      require("./lib/edgeConfig").publicCache(res, { maxAge: 30, sMaxAge: 60 });
      return res.json({ success: true, announcements: announcementsCache.rows });
    }
    const { data, error } = await supabase
      .from("announcements")
      .select("id, title, content, created_at, priority, color, emoji, pinned, target, author")
      .eq("is_active", true)
      .order("pinned", { ascending: false })
      .order("created_at", { ascending: false });
    
    if (error) return res.status(500).json({ success: false, error: "Failed to load announcements." });
    announcementsCache.rows = data || [];
    announcementsCache.at = Date.now();
    require("./lib/edgeConfig").publicCache(res, { maxAge: 30, sMaxAge: 60 });
    return res.json({ success: true, announcements: data || [] });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Create announcement - POST /api/admin/announcements
app.post("/api/admin/announcements", requireAuth, async (req, res) => {
  res.on("finish", invalidateAnnouncementsCache);
  try {
    const { data: requester } = await supabase
      .from("users")
      .select("username, is_admin")
      .eq("id", req.user.id)
      .single();
    
    const isAdmin = requester?.is_admin || req.user.username === "admin";
    
    if (!isAdmin) {
      return res.status(403).json({ success: false, error: "Not authorized" });
    }
    
    const { title, content, priority = "normal", color = "#5865F2", emoji = "📢", pinned = false, target = "all" } = req.body;
    
    if (!title?.trim() || !content?.trim()) {
      return res.status(400).json({ success: false, error: "Title and content are required" });
    }

    const { data, error } = await supabase
      .from("announcements")
      .insert({
        title: title.trim(),
        content: content.trim(),
        created_by: req.user.id,
        author: requester.username,
        priority,
        color,
        emoji,
        pinned,
        target,
      })
      .select()
      .single();
    
    if (error) return res.status(500).json({ success: false, error: error.message });
    
    // Broadcast to all connected users
    const io = req.app.get("io");
    io.emit("announcement:new", data);
    
    return res.json({ success: true, announcement: data });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Toggle pin on announcement - PATCH /api/admin/announcements/:id
app.patch("/api/admin/announcements/:id", requireAuth, async (req, res) => {
  res.on("finish", invalidateAnnouncementsCache);
  try {
    const { data: requester } = await supabase
      .from("users")
      .select("username, is_admin")
      .eq("id", req.user.id)
      .single();
    
    const isAdmin = requester?.is_admin || req.user.username === "admin";
    if (!isAdmin) return res.status(403).json({ success: false, error: "Not authorized" });

    const { pinned } = req.body;
    if (typeof pinned !== "boolean") {
      return res.status(400).json({ success: false, error: "pinned must be a boolean" });
    }

    const { data, error } = await supabase
      .from("announcements")
      .update({ pinned })
      .eq("id", req.params.id)
      .select()
      .single();
    
    if (error) return res.status(500).json({ success: false, error: error.message });

    const io = req.app.get("io");
    io.emit("announcement:updated", data);

    return res.json({ success: true, announcement: data });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Delete announcement - DELETE /api/admin/announcements/:id
app.delete("/api/admin/announcements/:id", requireAuth, async (req, res) => {
  res.on("finish", invalidateAnnouncementsCache);
  try {
    const { data: requester } = await supabase
      .from("users")
      .select("username, is_admin")
      .eq("id", req.user.id)
      .single();
    
    const isAdmin = requester?.is_admin || req.user.username === "admin";
    
    if (!isAdmin) {
      return res.status(403).json({ success: false, error: "Not authorized" });
    }
    
    const { error } = await supabase
      .from("announcements")
      .update({ is_active: false })
      .eq("id", req.params.id);
    
    if (error) return res.status(500).json({ success: false, error: error.message });
    
    // Broadcast deletion
    const io = req.app.get("io");
    io.emit("announcement:deleted", { id: req.params.id });
    
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Mark announcement as read - POST /api/announcements/:id/read
app.post("/api/announcements/:id/read", requireAuth, async (req, res) => {
  try {
    const { error } = await supabase
      .from("announcement_reads")
      .upsert({
        user_id: req.user.id,
        announcement_id: req.params.id,
        read_at: new Date().toISOString(),
      }, { onConflict: ["user_id", "announcement_id"] });
    
    if (error) return res.status(500).json({ success: false, error: error.message });
    
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Get unread announcement count - GET /api/announcements/unread/count
app.get("/api/announcements/unread/count", requireAuth, async (req, res) => {
  try {
    // Get all active announcements
    const { data: announcements, error: annError } = await supabase
      .from("announcements")
      .select("id")
      .eq("is_active", true);
    
    if (annError) return res.status(500).json({ success: false, error: annError.message });
    
    // Get read announcements for this user
    const { data: reads, error: readError } = await supabase
      .from("announcement_reads")
      .select("announcement_id")
      .eq("user_id", req.user.id);
    
    if (readError) return res.status(500).json({ success: false, error: readError.message });
    
    const readIds = new Set((reads || []).map((r) => r.announcement_id));
    const unreadCount = (announcements || []).filter((a) => !readIds.has(a.id)).length;
    
    return res.json({ success: true, count: unreadCount });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ========== ADMIN ENDPOINTS ==========

// Make user admin - PUT /api/admin/make-admin/:userId
app.put("/api/admin/make-admin/:userId", requireAuth, async (req, res) => {
  try {
    // Check if requester is admin (by username or is_admin field)
    const { data: requester } = await supabase
      .from("users")
      .select("username, is_admin")
      .eq("id", req.user.id)
      .single();
    
    const isAdmin = requester?.is_admin || req.user.username === "admin";
    
    if (!isAdmin) {
      return res.status(403).json({ success: false, error: "Not authorized" });
    }
    
    const { userId } = req.params;
    
    const { data, error } = await supabase
      .from("users")
      .update({ is_admin: true })
      .eq("id", userId)
      .select()
      .single();
    
    if (error) return res.status(500).json({ success: false, error: error.message });
    
    // Notify the user via Socket.IO to refresh their data
    const io = req.app.get("io");
    io.to(`user:${userId}`).emit("user:updated", { is_admin: true });
    
    return res.json({ success: true, user: data });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Remove admin - PUT /api/admin/remove-admin/:userId
app.put("/api/admin/remove-admin/:userId", requireAuth, async (req, res) => {
  try {
    // Check if requester is admin (by username or is_admin field)
    const { data: requester } = await supabase
      .from("users")
      .select("username, is_admin")
      .eq("id", req.user.id)
      .single();
    
    const isAdmin = requester?.is_admin || req.user.username === "admin";
    
    if (!isAdmin) {
      return res.status(403).json({ success: false, error: "Not authorized" });
    }
    
    const { userId } = req.params;
    
    const { data, error } = await supabase
      .from("users")
      .update({ is_admin: false })
      .eq("id", userId)
      .select()
      .single();
    
    if (error) return res.status(500).json({ success: false, error: error.message });
    
    return res.json({ success: true, user: data });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Get all users - GET /api/admin/users
app.get("/api/admin/users", requireAuth, async (req, res) => {
  try {
    console.log("[ADMIN-USERS] Request from user ID:", req.user.id);
    console.log("[ADMIN-USERS] Token username:", req.user.username);
    
    // Check if requester is admin (by username or is_admin field)
    const { data: requester } = await supabase
      .from("users")
      .select("username, is_admin")
      .eq("id", req.user.id)
      .single();
    
    console.log("[ADMIN-USERS] Requester from DB:", requester);
    
    // Use token username if DB lookup fails
    const isAdmin = requester?.is_admin || req.user.username === "admin";
    
    if (!isAdmin) {
      console.log("[ADMIN-USERS] Authorization failed - is_admin:", requester?.is_admin, "username:", req.user.username);
      return res.status(403).json({ success: false, error: "Not authorized" });
    }
    
    const { data, error, count } = await supabase
      .from("users")
      .select("id, username, avatar_url, is_admin, created_at", { count: "exact" })
      .order("username", { ascending: true });
    
    if (error) return res.status(500).json({ success: false, error: error.message });
    
    // Add online status from Socket.IO presence
    const state = require("./runtime/sharedState");
    const usersWithStatus = (data || []).map(user => ({
      ...user,
      isOnline: state.presence.has(user.id),
      status: state.presence.get(user.id)?.status || "offline"
    }));
    
    console.log("[ADMIN-USERS] Returning", usersWithStatus.length, "users");
    return res.json({
      success: true,
      users: usersWithStatus,
      total: count ?? usersWithStatus.length,
    });
  } catch (err) {
    console.error("[ADMIN-USERS] Error:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

console.log("[SERVER] Routes registered:");
console.log("  - /auth");
console.log("  - /admin");
console.log("  - /media");
console.log("  - /groups");
console.log("  - /api/feedback");
console.log("  - /api/announcements");
console.log("  - /api/admin/announcements");
console.log("  - /api/user/profile");
console.log("  - /api/user/notifications");
console.log("  - /api/user/privacy");
console.log("  - /api/user/regional");
console.log("  - /api/admin/make-admin/:userId");
console.log("  - /api/admin/remove-admin/:userId");
console.log("  - /api/admin/users");
console.log("  - /api/test (no auth)");
console.log("  - /api/status");
console.log("  - /health");
console.log("  - /robots.txt");
console.log("  - /sitemap.xml (+ pages/html; invites/announcements excluded from index)");

// Static files
app.use("/media/files", express.static(path.join(__dirname, "uploads")));

// Discord-style invite deep links → root query.
// Vite builds with base "./", so serving the SPA under /invite/:code breaks
// relative asset URLs (./assets/...) and leaves the boot splash stuck.
app.get(["/invite/:code", "/i/:code"], (req, res) => {
  const code = String(req.params.code || "").trim();
  if (!code) return res.redirect(302, "/");
  return res.redirect(302, `/?invite=${encodeURIComponent(code)}`);
});

// Serve React frontend (Vite build output: frontend/dist).
// distPath / indexPath / hasFrontend, and the early SPA-vs-API
// disambiguation for /groups, /friends, /calls, /servers, are set up above, before
// those routers are mounted.
const API_PREFIXES = [
  "/api", "/auth", "/admin", "/media", "/groups",
  "/friends", "/servers", "/reactions", "/health", "/debug", "/calls",
  "/sitemap.xml", "/sitemap-pages.xml", "/sitemap-invites.xml",
  "/sitemap-announcements.xml", "/sitemap.html", "/sitemap.xsl", "/robots.txt",
];

if (hasFrontend && !isVercel) {
  console.log("[STATIC] Serving frontend from:", distPath);
  app.use(express.static(distPath, {
    setHeaders(res, filePath) {
      const hashed = `${path.sep}assets${path.sep}`;
      if (filePath.includes(hashed)) {
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        return;
      }
      if (filePath.endsWith(`${path.sep}index.html`) || filePath.endsWith(".html")) {
        res.setHeader("Cache-Control", "no-cache");
      }
    },
  }));
  app.get("*", (req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD") return next();
    if (API_PREFIXES.some((prefix) => req.path === prefix || req.path.startsWith(`${prefix}/`))) {
      return next();
    }
    res.setHeader("Cache-Control", "no-cache");
    res.sendFile(indexPath);
  });
} else {
  console.warn("[STATIC] frontend/dist/index.html not found — run: cd frontend && npm run build:prod");
  app.get("/", (_req, res) => {
    res.status(503).json({
      status: "error",
      message: "Frontend not built. Deploy must run: cd frontend && npm install --include=dev && npm run build:prod",
    });
  });
}

// 404 handler
app.use((_req, res) => {
  console.log("[404]", _req.method, _req.path);
  res.status(404).json({ error: "Not found" });
});

// Sentry captures 5xx errors here, then passes them on to our handler (no-op without SENTRY_DSN).
setupSentryExpressErrorHandler(app);

// Error handler
app.use((err, _req, res, _next) => {
  console.error("[ERROR]", err);
  res.status(500).json({ error: "Internal server error." });
});

// Socket.IO
io.use(socketAuthMiddleware);
// 2.11.6 (scale S2): Render ↔ Cloudflare Hub bridge. Off unless EDGE_BRIDGE_URL
// and EDGE_BRIDGE_SECRET are set; edge clients then join this same io server.
require("./runtime/edgeRuntime").startEdgeBridgeFromEnv(io);
io.engine.on("connection_error", () => {});
registerSocketHandlers(io);

// Activity handlers run on every authenticated socket connection
// (registerSocketHandlers already sets up the main io.on('connection') listener;
//  we attach ours after, which is safe — multiple listeners are allowed)
io.on('connection', (socket) => {
  if (socket.user) {
    registerActivityHandlers(io, socket);
    registerGameHandlers(io, socket);
  }
});

// Start server
console.log("=== Descall Backend v3.0 ===");
console.log("PORT:", PORT);
console.log("VERCEL:", isVercel);
console.log("ENV check:");
console.log("  SUPABASE_URL:", !!process.env.SUPABASE_URL);
console.log("  SUPABASE_SERVICE_ROLE_KEY:", !!process.env.SUPABASE_SERVICE_ROLE_KEY);
console.log("  JWT_SECRET:", !!process.env.JWT_SECRET);

let bootStarted = false;
async function runBoot() {
  if (bootStarted) return;
  bootStarted = true;
  try {
    // Daily read-only DesCoin balance vs ledger check (never modifies balances).
    require("./lib/descoinReconcile").startReconcileScheduler();
  } catch (e) {
    console.warn("[boot] descoin reconcile scheduler failed:", e.message);
  }
  try {
    const { loadModerationStateFromDb } = require("./lib/moderation");
    await loadModerationStateFromDb();
  } catch (e) {
    console.warn("[boot] moderation load failed:", e.message);
  }
  try {
    const state = require("./runtime/sharedState");
    const supabase = require("./db/supabase");
    const { loadSystemSettings, applySystemConfigToState } = require("./lib/systemSettings");
    const settings = await loadSystemSettings(supabase);
    applySystemConfigToState(state, settings.config);
  } catch (e) {
    console.warn("[boot] system settings load failed:", e.message);
  }
  try {
    const { retireSoundPacks } = require("./lib/shop");
    await retireSoundPacks();
  } catch (e) {
    console.warn("[boot] sound pack retire failed:", e.message);
  }
  try {
    const { ensureChatBubbleCatalog } = require("./lib/shop");
    await ensureChatBubbleCatalog();
  } catch (e) {
    console.warn("[boot] chat bubble catalog failed:", e.message);
  }
  try {
    const { ensureNameEffectCatalog } = require("./lib/shop");
    await ensureNameEffectCatalog();
  } catch (e) {
    console.warn("[boot] name effect catalog failed:", e.message);
  }
  try {
    const { ensureGlassThemeCatalog } = require("./lib/shop");
    await ensureGlassThemeCatalog();
  } catch (e) {
    console.warn("[boot] glass theme catalog failed:", e.message);
  }
}

if (isVercel) {
  void runBoot();
  module.exports = httpServer;
} else {
  httpServer.listen(PORT, async () => {
    console.log(`Server listening on port ${PORT}`);
    await runBoot();
  });
}
