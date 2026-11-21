"use strict";

/**
 * MCP endpoint for admin tokens (lib/adminTokens/mcp.js): POST / GET / DELETE /mcp,
 * Streamable HTTP transport, protocol 2025-06-18. Mounted in server.js before the SPA
 * fallback; canonicalHost leaves /mcp alone and CORS stays the app's allowlist (MCP
 * clients are not browsers and send no Origin).
 */

const express = require("express");
const mcp = require("../lib/adminTokens/mcp");

const router = express.Router();

router.post("/", mcp.mcpAuth, mcp.handlePost);
router.get("/", mcp.mcpAuth, mcp.handleGet);
router.delete("/", mcp.mcpAuth, mcp.handleDelete);
router.all("/", (_req, res) => {
  res.set("Allow", "GET, POST, DELETE");
  res.status(405).json({ error: "Method not allowed." });
});

module.exports = router;
module.exports.parseErrorHandler = mcp.parseErrorHandler;
