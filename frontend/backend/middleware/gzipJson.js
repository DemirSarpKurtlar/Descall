"use strict";

const crypto = require("crypto");
const zlib = require("zlib");
const { mayContainRef, rewriteOutgoing } = require("../lib/privateMedia");

/**
 * JSON responses:
 *  - GET 200: strong ETag over the JSON text, before compression. A matching
 *    If-None-Match answers 304 with no body (browsers, Electron and WKWebView
 *    revalidate on their own). Authenticated responses get
 *    `Cache-Control: private, no-cache` unless the route set its own, so a
 *    shared cache never stores them and the browser always revalidates.
 *  - Bodies over 2 KB are gzipped when the client accepts gzip.
 */
function etagFor(payload) {
  return `"${crypto.createHash("sha1").update(payload).digest("base64url").slice(0, 27)}"`;
}

function noneMatch(header, tag) {
  if (typeof header !== "string" || !header) return false;
  if (header.trim() === "*") return true;
  return header
    .split(",")
    .map((t) => t.trim().replace(/^W\//, ""))
    .includes(tag);
}

function gzipJson(req, res, next) {
  const accept = req.headers["accept-encoding"];
  const canGzip = req.method !== "HEAD" && typeof accept === "string" && /\bgzip\b/.test(accept);
  const isGet = req.method === "GET" || req.method === "HEAD";
  if (!canGzip && !isGet) return next();
  const orig = res.json.bind(res);
  res.json = function gzipJsonBody(rawBody) {
    // Private media refs must become signed URLs before the body is serialised here.
    const body = mayContainRef(rawBody) ? rewriteOutgoing(rawBody) : rawBody;
    let payload;
    try {
      payload = JSON.stringify(body);
    } catch {
      return orig(body);
    }
    if (payload === undefined) return orig(body);
    if (isGet && res.statusCode === 200 && !res.headersSent) {
      if (req.headers.authorization && !res.getHeader("Cache-Control")) {
        res.setHeader("Cache-Control", "private, no-cache");
      }
      if (!res.getHeader("ETag")) res.setHeader("ETag", etagFor(payload));
      const tag = String(res.getHeader("ETag"));
      if (noneMatch(req.headers["if-none-match"], tag.replace(/^W\//, ""))) {
        res.removeHeader("Content-Type");
        res.removeHeader("Content-Length");
        res.statusCode = 304;
        return res.end();
      }
    }
    if (!canGzip || payload.length < 2048) return orig(body);
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
module.exports.etagFor = etagFor;
module.exports.noneMatch = noneMatch;
