"use strict";

const express = require("express");
const { verifyToken } = require("../config/jwt");
const {
  recordAnalyticsEvent,
  classifyVisitSource,
} = require("../lib/userAnalyticsStore");
const { parseUserAgent, countryFromHeaders } = require("../lib/signupAttribution");

const router = express.Router();
const hits = new Map();
const MAX_PER_MIN = 40;

function clientIp(req) {
  const xf = String(req.headers["x-forwarded-for"] || "")
    .split(",")[0]
    .trim();
  return xf || String(req.ip || "unknown");
}

function rateLimited(req) {
  const ip = clientIp(req);
  const now = Date.now();
  const windowStart = now - 60_000;
  const list = (hits.get(ip) || []).filter((t) => t > windowStart);
  if (list.length >= MAX_PER_MIN) {
    hits.set(ip, list);
    return true;
  }
  list.push(now);
  hits.set(ip, list);
  return false;
}

function optionalUser(req) {
  const header = String(req.headers.authorization || "");
  if (!header.startsWith("Bearer ")) return null;
  try {
    const decoded = verifyToken(header.slice(7));
    if (decoded?.pending2fa || !decoded?.sub) return null;
    return { id: decoded.sub, username: decoded.username };
  } catch {
    return null;
  }
}

router.post("/collect", async (req, res) => {
  try {
    if (rateLimited(req)) {
      return res.status(204).end();
    }
    const user = optionalUser(req);
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const headers = req.headers || {};
    const ua = parseUserAgent(headers["user-agent"]);
    const country = countryFromHeaders(headers);
    const attribution = body.attribution && typeof body.attribution === "object" ? body.attribution : null;
    const source = classifyVisitSource(attribution);
    const gclid = attribution?.first?.gclid || attribution?.last?.gclid || "";

    void recordAnalyticsEvent({
      userId: user?.id || null,
      visitorKey: body.visitorKey || "",
      event: body.event,
      props: body.props,
      source,
      hasGclid: Boolean(gclid),
      country,
      device: ua.device,
    });
    return res.status(204).end();
  } catch {
    return res.status(204).end();
  }
});

module.exports = router;
