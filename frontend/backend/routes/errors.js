const express = require("express");
const router = express.Router();
const supabase = require("../db/supabase");
const state = require("../runtime/sharedState");
const { requireAuth } = require("../middleware/auth");

console.log("[ERRORS-JS] File loaded! Routes being registered...");

// Store error from frontend
router.post("/", async (req, res) => {
  try {
    const { message, stack, componentStack, url, userAgent, timestamp, userId, username, severity = "error", source = "frontend" } = req.body;

    // Store error in Supabase
    const { data, error } = await supabase
      .from("error_logs")
      .insert({
        message,
        stack,
        component_stack: componentStack,
        url,
        user_agent: userAgent,
        user_id: userId || "anonymous",
        timestamp: timestamp || new Date().toISOString(),
        resolved: false,
        severity,
        source,
      })
      .select();

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
    console.error("[Error Log] Failed to log error:", error);
    res.status(500).json({ error: "Failed to log error" });
  }
});

// Get all errors (admin only)
router.get("/", async (req, res) => {
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
router.patch("/:id/resolve", async (req, res) => {
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
router.delete("/:id", async (req, res) => {
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

// GET test - çalışıyor mu kontrol
router.get("/feedback-test", (_req, res) => {
  console.log("[ROUTE-TEST] GET /api/errors/feedback-test - WORKING!");
  res.json({ message: "GET working", time: Date.now() });
});

// POST test - aynı route üzerine
router.post("/feedback-test", (req, res) => {
  console.log("[ROUTE-TEST] POST /api/errors/feedback-test - HIT!");
  console.log("[ROUTE-TEST] Body received:", JSON.stringify(req.body));
  res.json({ success: true, received: req.body, time: Date.now() });
});

// SUPER SIMPLE POST TEST - No auth, no supabase, just test if POST works
router.post("/simple-test", (req, res) => {
  console.log("[SIMPLE-TEST] POST /api/errors/simple-test - HIT!");
  console.log("[SIMPLE-TEST] Body:", JSON.stringify(req.body));
  res.json({ success: true, received: req.body, time: Date.now() });
});

// Submit feedback (authenticated users)
console.log("[ERRORS-JS] Registering POST /feedback route...");
router.post("/feedback", (req, res, next) => {
  console.log("[ROUTE-MATCH] POST /api/errors/feedback - Route matched!");
  console.log("[ROUTE-MATCH] Body:", JSON.stringify(req.body));
  next();
}, requireAuth, async (req, res) => {
  console.log("[Feedback] ========== START ==========");
  
  try {
    console.log("[Feedback] Step 1: Parsing request body");
    const { category, priority, message, attachments = [] } = req.body;
    const user = req.user;
    
    console.log("[Feedback] Step 2: Got user:", JSON.stringify(user));
    console.log("[Feedback] Step 3: Body data:", { category, priority, messageLength: message?.length, attachmentsCount: attachments?.length });

    if (!category || !priority || !message) {
      console.log("[Feedback] ERROR: Missing fields");
      return res.status(400).json({ error: "Missing required fields" });
    }

    console.log("[Feedback] Step 4: Building insert data");
    
    // Kullanıcı ID'sini kontrol et - UUID formatında mı?
    let userId = user.id;
    console.log("[Feedback] Step 5: User ID type:", typeof userId, "value:", userId);
    
    // Eğer userId string değilse veya undefined ise hata ver
    if (!userId) {
      console.log("[Feedback] ERROR: userId is undefined!");
      return res.status(400).json({ error: "Invalid user ID" });
    }

    // attachments'ı JSON'a çevir (eğer array değilse)
    let attachmentsJson = attachments;
    if (typeof attachments === 'string') {
      try {
        attachmentsJson = JSON.parse(attachments);
      } catch (e) {
        attachmentsJson = [];
      }
    }
    
    // JSONB için attachments'ı doğru formatta hazırla
    const attachmentsForDb = Array.isArray(attachmentsJson) ? attachmentsJson : [];
    
    const insertData = {
      user_id: userId,
      username: user.username || 'anonymous',
      category,
      priority,
      message,
      attachments: attachmentsForDb,  // Supabase JS client JSONB'yi otomatik handle eder
      status: "new",
      created_at: new Date().toISOString(),
    };
    
    console.log("[Feedback] Step 6: Insert data prepared:");
    console.log("  - user_id:", insertData.user_id);
    console.log("  - username:", insertData.username);
    console.log("  - category:", insertData.category);
    console.log("  - priority:", insertData.priority);
    console.log("  - message length:", insertData.message?.length);
    console.log("  - attachments:", JSON.stringify(insertData.attachments));
    console.log("  - status:", insertData.status);
    console.log("[Feedback] Step 7: Supabase client check - supabase is:", typeof supabase);

    console.log("[Feedback] Step 8: Calling supabase insert...");
    console.log("[Feedback] Step 8a: Table name: user_feedback");
    console.log("[Feedback] Step 8b: Insert data keys:", Object.keys(insertData));
    
    let data, error;
    try {
      const result = await supabase
        .from("user_feedback")
        .insert(insertData)
        .select();
      
      data = result.data;
      error = result.error;
    } catch (supabaseErr) {
      console.error("[Feedback] Step 8c: Supabase threw exception:", supabaseErr);
      console.error("[Feedback] Step 8d: Exception message:", supabaseErr.message);
      throw supabaseErr;
    }

    console.log("[Feedback] Step 9: Supabase response received");
    console.log("[Feedback] Step 9a: Error object:", JSON.stringify(error));
    console.log("[Feedback] Step 9b: Data object:", JSON.stringify(data));
    
    if (error) {
      console.error("[Feedback] Step 9c: Supabase ERROR details:");
      console.error("  - message:", error.message);
      console.error("  - code:", error.code);
      console.error("  - details:", error.details);
      console.error("  - hint:", error.hint);
      throw new Error(`Supabase error: ${error.message} (code: ${error.code})`);
    }

    if (!data || data.length === 0) {
      console.log("[Feedback] Step 9d: WARNING - No error but data is empty!");
      console.log("[Feedback] This usually means RLS blocked the insert or trigger failed silently");
    }

    console.log("[Feedback] Step 10: Supabase success, data:", JSON.stringify(data));

    console.log("[Feedback] Step 11: Adding to in-memory state");
    const feedback = state.addFeedback(
      { id: userId, username: user.username, avatar_url: user.avatar_url },
      category,
      priority,
      message,
      attachmentsJson
    );

    console.log("[Feedback] Step 12: Checking socket.io");
    try {
      const io = req.app.get("io");
      console.log("[Feedback] Step 13: io is:", typeof io);
      if (io) {
        io.to("admin").emit("feedback:new", feedback);
        console.log("[Feedback] Step 14: Socket event emitted");
      }
    } catch (socketErr) {
      console.error("[Feedback] Socket error (non-critical):", socketErr.message);
    }

    console.log("[Feedback] Step 15: Sending response");
    const responseBody = { success: true, feedback, dbData: data };
    
    // Explicit response with proper headers
    res.set('Content-Type', 'application/json');
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    
    console.log("[Feedback] Sending JSON response:", JSON.stringify(responseBody).slice(0, 200));
    return res.status(200).json(responseBody);
    
  } catch (error) {
    console.error("[Feedback] CRITICAL ERROR:", error);
    console.error("[Feedback] ERROR MESSAGE:", error.message);
    console.error("[Feedback] ERROR STACK:", error.stack);
    
    // Her zaman JSON dön
    return res.status(500).json({ 
      error: "Failed to submit feedback", 
      details: error.message || "Unknown error",
      code: error.code || "UNKNOWN"
    });
  } finally {
    console.log("[Feedback] ========== END ==========");
  }
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
