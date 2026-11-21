"use strict";

/**
 * Client address for admin-token checks (IP allowlist, new IP / new country alerts,
 * the auth failure limit). Stricter than lib/clientIp.js, which trusts every Cloudflare
 * range as a proxy hop (fine for the app, but a Cloudflare Worker egress lets anyone
 * choose the X-Forwarded-For value). The rest of the app keeps lib/clientIp.js.
 *
 * Walk X-Forwarded-For (plus the TCP peer) from the right:
 *  1. skip Render's own hops (loopback, private, link-local, unique-local);
 *  2. the next address is the client, unless it is a Cloudflare address: then exactly one
 *     Cloudflare hop is allowed and the address to its left is the client.
 * A result that is loopback / private / link-local / inside a Cloudflare range (or not an
 * address at all) is untrusted: it never matches an allowlist entry and always counts as
 * a new address. The country is only taken from cf-ipcountry, and only when the request
 * came through that single verified Cloudflare hop.
 */

const net = require("net");
const proxyaddr = require("proxy-addr");
const { CLOUDFLARE } = require("../clientIp");

const internal = proxyaddr.compile(["loopback", "linklocal", "uniquelocal"]);
const cloudflare = proxyaddr.compile(CLOUDFLARE);

function clean(v) {
  let s = String(v ?? "").trim();
  if (/^\[[^\]]+\](:\d+)?$/.test(s)) s = s.slice(1, s.indexOf("]"));
  else if (/^\d+\.\d+\.\d+\.\d+:\d+$/.test(s)) s = s.split(":")[0];
  return s.replace(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i, "$1");
}

const isIp = (s) => Boolean(net.isIP(s));
const isInternal = (s) => isIp(s) && Boolean(internal(s, 0));
const isCloudflare = (s) => isIp(s) && Boolean(cloudflare(s, 0));

function headerOf(headers, name) {
  const v = headers?.[name];
  return Array.isArray(v) ? v.join(",") : String(v ?? "");
}

/**
 * @param {{ peer: string, xff?: string, cfCountry?: string }} p
 * @returns {{ ip: string, trusted: boolean, viaCloudflare: boolean, country: string|null }}
 */
function derive({ peer, xff = "", cfCountry = "" }) {
  const chain = String(xff || "").split(",").map(clean).filter(Boolean);
  chain.push(clean(peer) || "unknown");
  let i = chain.length - 1;
  while (i >= 0 && isInternal(chain[i])) i -= 1;
  if (i < 0) return { ip: chain[0] || "unknown", trusted: false, viaCloudflare: false, country: null };
  let ip = chain[i];
  let viaCloudflare = false;
  if (isCloudflare(ip)) {
    viaCloudflare = true;
    ip = i > 0 ? chain[i - 1] : ip;
  }
  const trusted = isIp(ip) && !isInternal(ip) && !isCloudflare(ip);
  const verified = trusted && viaCloudflare;
  const cc = String(cfCountry || "").trim().toUpperCase();
  const country = verified && /^[A-Z]{2}$/.test(cc) && cc !== "XX" && cc !== "T1" ? cc : null;
  return { ip: ip || "unknown", trusted, viaCloudflare: verified, country };
}

function ofRequest(req) {
  const headers = req?.headers || {};
  return derive({
    peer: req?.socket?.remoteAddress || req?.connection?.remoteAddress || "",
    xff: headerOf(headers, "x-forwarded-for"),
    cfCountry: headerOf(headers, "cf-ipcountry"),
  });
}

function ofSocket(socket) {
  const headers = socket?.handshake?.headers || {};
  const peer = socket?.request?.socket?.remoteAddress || socket?.conn?.remoteAddress || socket?.handshake?.address || "";
  return derive({ peer, xff: headerOf(headers, "x-forwarded-for"), cfCountry: headerOf(headers, "cf-ipcountry") });
}

module.exports = { derive, ofRequest, ofSocket, isInternal, isCloudflare };
