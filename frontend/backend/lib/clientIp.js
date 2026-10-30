"use strict";

/**
 * The visitor's real IP address (3.5.0).
 *
 * Render puts its own proxies in front of the app (and Cloudflare in front of
 * Render), so the TCP peer and the last X-Forwarded-For hop are internal
 * 10.x addresses. Before 3.5.0 `trust proxy = 1` returned exactly that hop:
 * every session showed a 10.19x.x.x address and per-IP rate limits were shared
 * by everyone behind the same proxy.
 *
 * Express (`trust proxy`) and the socket path both use the same rule: walk
 * X-Forwarded-For from the right and skip hops that are our own infrastructure
 * (loopback, private / unique-local, link-local, Cloudflare). The first
 * address that is none of those is the client. A client cannot spoof this by
 * sending its own X-Forwarded-For: anything it writes ends up to the LEFT of
 * the real address the proxies append.
 */

const proxyaddr = require("proxy-addr");

// https://www.cloudflare.com/ips/ (stable for years; extend if Cloudflare adds ranges)
const CLOUDFLARE = [
  "173.245.48.0/20",
  "103.21.244.0/22",
  "103.22.200.0/22",
  "103.31.4.0/22",
  "141.101.64.0/18",
  "108.162.192.0/18",
  "190.93.240.0/20",
  "188.114.96.0/20",
  "197.234.240.0/22",
  "198.41.128.0/17",
  "162.158.0.0/15",
  "104.16.0.0/13",
  "104.24.0.0/14",
  "172.64.0.0/13",
  "131.0.72.0/22",
  "2400:cb00::/32",
  "2606:4700::/32",
  "2803:f800::/32",
  "2405:b500::/32",
  "2405:8100::/32",
  "2a06:98c0::/29",
  "2c0f:f248::/32",
];

/** Value for app.set("trust proxy", …) and the socket resolver. */
const TRUSTED_PROXIES = Object.freeze(["loopback", "linklocal", "uniquelocal", ...CLOUDFLARE]);
const trust = proxyaddr.compile(TRUSTED_PROXIES);

function clean(ip) {
  const s = String(ip || "").trim().replace(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i, "$1");
  return s || "unknown";
}

/** Real client address of an HTTP request (or any IncomingMessage). */
function ipOfRequest(req) {
  if (!req) return "unknown";
  try {
    if (!req.connection && !req.socket) return "unknown";
    return clean(proxyaddr(req, trust));
  } catch {
    return clean(req.socket?.remoteAddress || req.connection?.remoteAddress);
  }
}

/** Real client address of a Socket.IO socket (direct or through the edge hub). */
function ipOfSocket(socket) {
  const headers = socket?.handshake?.headers || {};
  // Edge hub virtual connections (lib/edgeBridge.js VirtualConn, created only
  // on the server): the hub already resolved the visitor and passes it as the
  // only X-Forwarded-For value. A client-sent "x-descall-edge" header alone
  // proves nothing, so the check is on the server-side connection object.
  if (socket?.conn?.__edgeCid != null) {
    const v = String(headers["x-forwarded-for"] || "").split(",")[0];
    return clean(v);
  }
  const req = socket?.request;
  if (req && (req.connection || req.socket)) return ipOfRequest(req);
  // No raw request (tests, adapters): same rule over the handshake fields.
  const peer = socket?.handshake?.address;
  return ipOfRequest({ headers, connection: { remoteAddress: peer }, socket: { remoteAddress: peer } });
}

/** "203.0.113.7" → "203.0.x.x", IPv6 → first two groups. For admin screens. */
function maskIp(ip) {
  const s = clean(ip);
  const v4 = s.match(/^(\d+)\.(\d+)\.\d+\.\d+$/);
  if (v4) return `${v4[1]}.${v4[2]}.x.x`;
  if (s.includes(":")) return `${s.split(":").slice(0, 2).join(":")}:…`;
  return s === "unknown" ? s : "…";
}

function isPublicIp(ip) {
  const s = clean(ip);
  if (s === "unknown") return false;
  try {
    return !proxyaddr.compile(["loopback", "linklocal", "uniquelocal"])(s, 0);
  } catch {
    return false;
  }
}

module.exports = { TRUSTED_PROXIES, CLOUDFLARE, ipOfRequest, ipOfSocket, maskIp, isPublicIp };
