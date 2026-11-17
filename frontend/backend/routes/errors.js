const express = require("express");
const router = express.Router();
const supabase = require("../db/supabase");
const state = require("../runtime/sharedState");
const { requireAuth } = require("../middleware/auth");
const { requireAdmin } = require("../middleware/requireAdmin");
const { requireAdmin2fa, requireStepUp } = require("../middleware/adminSecondFactor");
const { requireSection } = require("../lib/adminPermissions");
const { verifyToken } = require("../config/jwt");
const { sessionAllowed } = require("../lib/sessionGuard");
const { recordFailure, rejectIfLimited } = require("../lib/rateLimit");
const errorGroups = require("../lib/errorGroups");

console.log("[ERRORS-JS] File loaded! Routes being registered...");

// Store error from frontend
function clipText(value, max) {
  if (value == null || value === "") return null;
  const text = String(value);
  return text.length > max ? text.slice(0, max) : text;
}

function safeTimestamp(value) {
  const date = new Date(value || Date.now());
  return Number.isFinite(date.getTime()) ? date.toISOString() : new Date().toISOString();
}

function clientIp(req) {
  return req.ip || req.socket?.remoteAddress || "unknown";
}

async function authenticatedReporter(req) {
  const header = req.headers.authorization || "";
  if (!header.startsWith("Bearer ")) return null;
  try {
    const decoded = verifyToken(header.slice(7));
    if (!decoded || decoded.pending2fa) return null;
    const session = await sessionAllowed(decoded);
    if (!session.ok) return null;
    return {
      id: decoded.sub,
      username: decoded.username || null,
    };
  } catch {
    return null;
  }
}

router.post("/", async (req, res) => {
  if (rejectIfLimited(res, [recordFailure(`client-error:${clientIp(req)}`, { windowMs: 10 * 60 * 1000, max: 30 })])) {
    return;
  }
  try {
    const { stack, componentStack, url, userAgent, timestamp, severity = "error", source = "frontend" } = req.body || {};
    const reporter = await authenticatedReporter(req);
    const userId = reporter?.id ? clipText(reporter.id, 80) : "anonymous";
    const username = reporter?.username ? clipText(reporter.username, 80) : null;
    const message = clipText(req.body?.message, 4000) || "Unknown client error";

    // Store error in Supabase (3.7.0: with its issue fingerprint, see lib/errorGroups.js)
    const row = {
      message,
      stack: clipText(stack, 12000),
      component_stack: clipText(componentStack, 12000),
      url: clipText(url, 2000),
      user_agent: clipText(userAgent, 1000),
      user_id: clipText(userId, 80) || "anonymous",
      timestamp: safeTimestamp(timestamp),
      resolved: false,
      severity: clipText(severity, 32) || "error",
      source: clipText(source, 64) || "frontend",
    };
    const grouped = {
      ...row,
      fingerprint: errorGroups.fingerprint(row.message, row.stack),
      platform: errorGroups.platformOf(row.user_agent, row.source),
      app_version: clipText(req.body?.appVersion, 32),
    };
    let { data, error } = await supabase.from("error_logs").insert(grouped).select("id");
    if (error && /fingerprint|platform|app_version/.test(String(error.message || ""))) {
      ({ data, error } = await supabase.from("error_logs").insert(row).select("id"));
    }

    if (error) throw error;

    // Also store in enhanced in-memory error logs
    state.appendErrorLog(source, message, {
      severity,
      stack,
      componentStack,
      url,
      userAgent,
      request: { url, userAgent },
    }, userId, username);

    // Emit to admin in real-time
    const io = req.app.get("io");
    if (io) {
      io.to("admin").emit("error:new", {
        id: data?.[0]?.id,
        timestamp,
        severity,
        source,
        message,
        stack,
        user: userId ? { id: userId, username } : null,
      });
    }

    res.json({ success: true, id: data?.[0]?.id });
  } catch (error) {
    console.error("[Error Log] Failed to log error:", error?.message || error);
    res.status(500).json({ error: "Failed to log error" });
  }
});

// Get all errors (admin only)
router.get("/", requireAuth, requireAdmin, requireAdmin2fa, requireStepUp, requireSection("security"), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("error_logs")
      .select("*")
      .order("timestamp", { ascending: false })
      .limit(100);

    if (error) throw error;

    res.json(data || []);
  } catch (error) {
    console.error("[Error Log] Failed to fetch errors:", error);
    res.status(500).json({ error: "Failed to fetch errors" });
  }
});

// Mark error as resolved
router.patch("/:id/resolve", requireAuth, requireAdmin, requireAdmin2fa, requireStepUp, requireSection("security"), async (req, res) => {
  try {
    const { error } = await supabase
      .from("error_logs")
      .update({ resolved: true })
      .eq("id", req.params.id);

    if (error) throw error;

    res.json({ success: true });
  } catch (error) {
    console.error("[Error Log] Failed to resolve error:", error);
    res.status(500).json({ error: "Failed to resolve error" });
  }
});

// Delete error
router.delete("/:id", requireAuth, requireAdmin, requireAdmin2fa, requireStepUp, requireSection("security"), async (req, res) => {
  try {
    const { error } = await supabase
      .from("error_logs")
      .delete()
      .eq("id", req.params.id);

    if (error) throw error;

    res.json({ success: true });
  } catch (error) {
    console.error("[Error Log] Failed to delete error:", error);
    res.status(500).json({ error: "Failed to delete error" });
  }
});

// ========== USER FEEDBACK ENDPOINTS ==========

// Submit feedback (authenticated users)
console.log("[ERRORS-JS] Registering POST /feedback route...");
// Legacy feedback submit. It stored category / priority / message / attachments unchecked
// (any URL, including javascript:, reached the admin feedback view) with no rate limit and
// logged every step (security scan 17 Nov 2026). It now runs the same handler as
// POST /api/feedback/submit: sanitized fields, own-media attachments only, rate limited.
router.post("/feedback", requireAuth, (req, res) => {
  const { submitHandler } = require("./myFeedback");
  const { sendFeedbackEmail } = require("../lib/feedbackEmail");
  return submitHandler({ sendFeedbackEmail })(req, res);
});

// Get user's own feedback history
router.get("/feedback/my", requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("user_feedback")
      .select("*")
      .eq("user_id", req.user.id)
      .order("created_at", { ascending: false });

    if (error) throw error;

    res.json(data || []);
  } catch (error) {
    console.error("[Feedback] Failed to fetch feedback:", error);
    res.status(500).json({ error: "Failed to fetch feedback" });
  }
});

console.log("[ERRORS-JS] All routes registered. Exporting router...");
module.exports = router;
