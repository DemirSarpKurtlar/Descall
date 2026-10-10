"use strict";

const zlib = require("zlib");

/**
 * Gzip JSON bodies over 2 KB when the client accepts gzip.
 * Fetch and WKWebView decode Content-Encoding themselves.
 */
function gzipJson(req, res, next) {
  const accept = req.headers["accept-encoding"];
  if (req.method === "HEAD" || typeof accept !== "string" || !/\bgzip\b/.test(accept)) {
    return next();
  }
  const orig = res.json.bind(res);
  res.json = function gzipJsonBody(body) {
    let payload;
    try {
      payload = JSON.stringify(body);
    } catch {
      return orig(body);
    }
    if (!payload || payload.length < 2048) return orig(body);
    zlib.gzip(Buffer.from(payload), (err, buf) => {
      if (err || res.headersSent) {
        if (!res.headersSent) orig(body);
        return;
      }
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Content-Encoding", "gzip");
      res.setHeader("Vary", "Accept-Encoding");
      res.setHeader("Content-Length", String(buf.length));
      res.end(buf);
    });
  };
  next();
}

module.exports = gzipJson;
