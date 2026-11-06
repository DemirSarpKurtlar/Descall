"use strict";

/**
 * Link previews (messaging phase 4). The server fetches the page, never the
 * client, with strict SSRF protection:
 *
 *  - http / https only, ports 80 and 443 only, no user:pass@, no IP literals
 *    or names that resolve into private, loopback, link-local, CGNAT,
 *    multicast, reserved, documentation or IPv4-mapped / NAT64 forms of them;
 *  - every name is resolved here and EVERY address must be public; the
 *    socket then connects to that checked address (pinned through the
 *    request's `lookup`), so a DNS answer cannot change between check and
 *    connect (rebinding);
 *  - redirects are followed by hand (at most MAX_REDIRECTS), each hop is
 *    checked again from scratch;
 *  - one deadline for the whole preview (TOTAL_TIMEOUT_MS), a byte cap on the
 *    page (MAX_HTML_BYTES, reading stops at </head>) and on the image
 *    (MAX_IMAGE_BYTES, png / jpeg / gif / webp only, never svg);
 *  - results (and failures, shorter) are cached in memory with a count and a
 *    byte budget, and concurrent requests for one URL share one fetch.
 *
 * The preview image comes back as a data: URI, so the client never contacts
 * the site either.
 */

const net = require("net");
const dns = require("dns");
const http = require("http");
const https = require("https");

const MAX_URL_LENGTH = 2048;
const MAX_REDIRECTS = 3;
const TOTAL_TIMEOUT_MS = 6000;
const MAX_HTML_BYTES = 512 * 1024;
const MAX_IMAGE_BYTES = 300 * 1024;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const FAIL_TTL_MS = 30 * 60 * 1000;
const CACHE_MAX_ENTRIES = 500;
const CACHE_MAX_BYTES = 24 * 1024 * 1024;
const USER_AGENT = "DescallLinkPreview/1.0 (+https://descall.com)";
const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/jpg", "image/gif", "image/webp"]);

class PreviewError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

// ---- address policy -------------------------------------------------------------------

// Two lists: a BlockList given an IPv6 ::ffff:0:0/96 rule also matches plain IPv4.
// Mapped / NAT64 / compatible forms are unwrapped by embeddedIpv4 and checked as IPv4.
const blocked4 = new net.BlockList();
const blocked6 = new net.BlockList();
for (const [addr, prefix] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16],
  ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.88.99.0", 24], ["192.168.0.0", 16],
  ["198.18.0.0", 15], ["198.51.100.0", 24], ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
]) blocked4.addSubnet(addr, prefix, "ipv4");
for (const [addr, prefix] of [
  ["::", 128], ["::1", 128], ["64:ff9b:1::", 48], ["100::", 64],
  ["2001::", 32], ["2001:db8::", 32], ["2002::", 16], ["fc00::", 7], ["fe80::", 10], ["fec0::", 10], ["ff00::", 8],
]) blocked6.addSubnet(addr, prefix, "ipv6");

/** Embedded IPv4 of an IPv4-mapped / -compatible / NAT64 / 6to4 address, or null. */
function embeddedIpv4(ip) {
  const lower = String(ip).toLowerCase();
  const dotted = /^(?:::ffff:|::|64:ff9b::)(\d+\.\d+\.\d+\.\d+)$/.exec(lower);
  if (dotted && net.isIPv4(dotted[1])) return dotted[1];
  const hex = /^(?:::ffff:|64:ff9b::)([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(lower);
  if (hex) {
    const a = parseInt(hex[1], 16);
    const b = parseInt(hex[2], 16);
    return `${a >> 8}.${a & 255}.${b >> 8}.${b & 255}`;
  }
  return null;
}

/** true for any address a preview must never connect to. */
function isBlockedAddress(ip) {
  const s = String(ip || "").replace(/^\[|\]$/g, "").split("%")[0];
  const fam = net.isIP(s);
  if (!fam) return true;
  if (fam === 4) return blocked4.check(s, "ipv4");
  const v4 = embeddedIpv4(s);
  if (v4) return blocked4.check(v4, "ipv4");
  // Any other IPv4-mapped (::ffff:a.b.c.d written oddly) or IPv4-compatible form: refuse.
  if (/^::ffff:/i.test(s) || /^::[0-9a-f]{1,4}:[0-9a-f]{1,4}$/i.test(s)) return true;
  return blocked6.check(s, "ipv6");
}

/** Parsed URL if it may be fetched at all (before DNS), else throws PreviewError. */
function checkUrl(raw) {
  const str = String(raw || "").trim();
  if (!str || str.length > MAX_URL_LENGTH) throw new PreviewError("bad_url");
  let u;
  try {
    u = new URL(str);
  } catch {
    throw new PreviewError("bad_url");
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new PreviewError("bad_scheme");
  if (u.username || u.password) throw new PreviewError("bad_url");
  const port = u.port ? Number(u.port) : u.protocol === "https:" ? 443 : 80;
  if (port !== 80 && port !== 443) throw new PreviewError("bad_port");
  const host = u.hostname.replace(/^\[|\]$/g, "").toLowerCase().replace(/\.$/, "");
  if (!host) throw new PreviewError("bad_url");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal") || host.endsWith(".home.arpa")) {
    throw new PreviewError("blocked_host");
  }
  if (net.isIP(host) && isBlockedAddress(host)) throw new PreviewError("blocked_address");
  // Integer / octal / hex IPv4 spellings ("http://2130706433/", "0x7f.1") never reach DNS.
  if (/^[0-9.]+$/.test(host) && !net.isIP(host)) throw new PreviewError("blocked_address");
  if (/^0x[0-9a-f]+$/i.test(host) || /(^|\.)0x[0-9a-f]+(\.|$)/i.test(host)) throw new PreviewError("blocked_address");
  u.hash = "";
  return { url: u, host, port };
}

/** Resolve and require every address to be public. Returns { address, family }. */
async function resolvePublic(host, lookupAll) {
  if (net.isIP(host)) {
    if (isBlockedAddress(host)) throw new PreviewError("blocked_address");
    return { address: host, family: net.isIP(host) };
  }
  let addrs;
  try {
    addrs = await lookupAll(host);
  } catch {
    throw new PreviewError("dns_failed");
  }
  if (!Array.isArray(addrs) || !addrs.length) throw new PreviewError("dns_failed");
  if (addrs.some((a) => isBlockedAddress(a.address))) throw new PreviewError("blocked_address");
  return addrs[0];
}

const defaultLookupAll = (host) => dns.promises.lookup(host, { all: true, verbatim: true });

// ---- fetching -------------------------------------------------------------------------

/**
 * One GET to an already checked, pinned address. Resolves { status, headers, body }
 * with at most `maxBytes` of body (`stopAt` ends the read early).
 */
function requestOnce({ url, port, pinned, deadline, maxBytes, accept, stopAt, transport }) {
  return new Promise((resolve, reject) => {
    const remaining = deadline - Date.now();
    if (remaining <= 0) return reject(new PreviewError("timeout"));
    const lib = transport || (url.protocol === "https:" ? https : http);
    const req = lib.request({
      protocol: url.protocol,
      hostname: url.hostname.replace(/^\[|\]$/g, ""),
      port,
      path: `${url.pathname || "/"}${url.search || ""}`,
      method: "GET",
      headers: {
        "user-agent": USER_AGENT,
        accept,
        "accept-language": "tr,en;q=0.8",
        "accept-encoding": "identity",
      },
      // Connect only to the address that was checked (no second DNS answer).
      lookup: (_host, opts, cb) => {
        if (opts && opts.all) cb(null, [{ address: pinned.address, family: pinned.family }]);
        else cb(null, pinned.address, pinned.family);
      },
      timeout: remaining,
      agent: false,
    });
    const timer = setTimeout(() => req.destroy(new PreviewError("timeout")), remaining);
    req.on("timeout", () => req.destroy(new PreviewError("timeout")));
    req.on("error", (err) => {
      clearTimeout(timer);
      reject(err instanceof PreviewError ? err : new PreviewError("fetch_failed"));
    });
    req.on("response", (res) => {
      // Defence in depth: the socket really went to the checked address.
      const remote = res.socket && res.socket.remoteAddress;
      if (remote && isBlockedAddress(remote)) {
        req.destroy();
        clearTimeout(timer);
        return reject(new PreviewError("blocked_address"));
      }
      const declared = Number(res.headers["content-length"]);
      if (Number.isFinite(declared) && declared > maxBytes && !(res.statusCode >= 300 && res.statusCode < 400) && !stopAt) {
        res.destroy();
        clearTimeout(timer);
        return reject(new PreviewError("too_large"));
      }
      const chunks = [];
      let size = 0;
      let done = false;
      const finish = (truncated) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        res.destroy();
        resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks), truncated });
      };
      res.on("data", (chunk) => {
        if (done) return;
        size += chunk.length;
        if (size > maxBytes) {
          if (stopAt) {
            chunks.push(chunk.subarray(0, Math.max(0, chunk.length - (size - maxBytes))));
            return finish(true);
          }
          done = true;
          clearTimeout(timer);
          res.destroy();
          return reject(new PreviewError("too_large"));
        }
        chunks.push(chunk);
        if (stopAt && stopAt.test(chunk.toString("latin1"))) finish(true);
      });
      res.on("end", () => finish(false));
      res.on("error", () => finish(true));
    });
    req.end();
  });
}

/** GET with hand-followed, re-checked redirects. */
async function safeGet(rawUrl, { deadline, maxBytes, accept, stopAt, lookupAll = defaultLookupAll, transport } = {}) {
  let current = rawUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const { url, host, port } = checkUrl(current);
    const pinned = await resolvePublic(host, lookupAll);
    const res = await requestOnce({ url, port, pinned, deadline, maxBytes, accept, stopAt, transport });
    if (res.status >= 300 && res.status < 400 && res.headers.location) {
      if (hop === MAX_REDIRECTS) throw new PreviewError("too_many_redirects");
      current = new URL(String(res.headers.location), url).toString();
      continue;
    }
    if (res.status < 200 || res.status >= 300) throw new PreviewError("http_status");
    return { ...res, finalUrl: url.toString() };
  }
  throw new PreviewError("too_many_redirects");
}

// ---- parsing --------------------------------------------------------------------------

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'" };
function decodeEntities(s) {
  return String(s || "").replace(/&(#x[0-9a-f]+|#\d+|[a-z]+\d*);/gi, (m, e) => {
    if (e[0] === "#") {
      const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : "";
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

function clean(s, max) {
  const out = decodeEntities(s).replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  return out.length > max ? `${out.slice(0, max - 1)}…` : out;
}

function attr(tag, name) {
  const re = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i");
  const m = re.exec(tag);
  return m ? (m[2] ?? m[3] ?? m[4] ?? "") : null;
}

/** Title, description, site name and image URL from a page's <head>. */
function parseHead(html, baseUrl) {
  const head = String(html || "").slice(0, MAX_HTML_BYTES);
  const meta = {};
  for (const m of head.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = m[0];
    const key = (attr(tag, "property") || attr(tag, "name") || "").toLowerCase().trim();
    const content = attr(tag, "content");
    if (key && content != null && !(key in meta)) meta[key] = content;
  }
  const titleTag = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(head);
  const title = clean(meta["og:title"] || meta["twitter:title"] || (titleTag ? titleTag[1] : ""), 200);
  const description = clean(meta["og:description"] || meta["twitter:description"] || meta.description || "", 400);
  let host = "";
  try { host = new URL(baseUrl).hostname.replace(/^www\./, ""); } catch { /* ignore */ }
  const siteName = clean(meta["og:site_name"] || host, 80);
  let image = null;
  const rawImage = meta["og:image:secure_url"] || meta["og:image"] || meta["og:image:url"] || meta["twitter:image"] || meta["twitter:image:src"];
  if (rawImage) {
    try {
      const u = new URL(decodeEntities(rawImage).trim(), baseUrl);
      if (u.protocol === "http:" || u.protocol === "https:") image = u.toString();
    } catch { /* ignore */ }
  }
  return { title, description, siteName, image };
}

function charsetOf(contentType) {
  const m = /charset=([\w-]+)/i.exec(String(contentType || ""));
  return m ? m[1].toLowerCase() : "utf-8";
}

function decodeBody(buf, contentType) {
  const cs = charsetOf(contentType);
  try {
    return new TextDecoder(cs === "utf8" ? "utf-8" : cs).decode(buf);
  } catch {
    return buf.toString("utf8");
  }
}

/** Image bytes → data: URI when it is a small raster image (checked by magic bytes too). */
function imageDataUri(buf, contentType) {
  const type = String(contentType || "").split(";")[0].trim().toLowerCase();
  if (!IMAGE_TYPES.has(type) || !buf || !buf.length || buf.length > MAX_IMAGE_BYTES) return null;
  const sig = buf.subarray(0, 12);
  const isPng = sig[0] === 0x89 && sig[1] === 0x50 && sig[2] === 0x4e && sig[3] === 0x47;
  const isJpeg = sig[0] === 0xff && sig[1] === 0xd8;
  const isGif = sig.toString("latin1", 0, 3) === "GIF";
  const isWebp = sig.toString("latin1", 0, 4) === "RIFF" && sig.toString("latin1", 8, 12) === "WEBP";
  const real = isPng ? "image/png" : isJpeg ? "image/jpeg" : isGif ? "image/gif" : isWebp ? "image/webp" : null;
  if (!real) return null;
  return `data:${real};base64,${buf.toString("base64")}`;
}

// ---- cache + public entry ------------------------------------------------------------

function createLinkPreviewService({ lookupAll = defaultLookupAll, transport = null, now = () => Date.now(), log = console, timeoutMs = TOTAL_TIMEOUT_MS } = {}) {
  const cache = new Map(); // key → { at, ttl, value, bytes }
  const inflight = new Map();
  let bytes = 0;

  const keyOf = (raw) => {
    try {
      const u = new URL(String(raw).trim());
      u.hash = "";
      return u.toString();
    } catch {
      return String(raw);
    }
  };
  function put(key, value, ttl) {
    const size = value ? JSON.stringify(value).length : 64;
    const old = cache.get(key);
    if (old) { bytes -= old.bytes; cache.delete(key); }
    cache.set(key, { at: now(), ttl, value, bytes: size });
    bytes += size;
    while (cache.size > CACHE_MAX_ENTRIES || bytes > CACHE_MAX_BYTES) {
      const [k, v] = cache.entries().next().value;
      cache.delete(k);
      bytes -= v.bytes;
    }
  }
  function get(key) {
    const hit = cache.get(key);
    if (!hit) return undefined;
    if (now() - hit.at > hit.ttl) {
      cache.delete(key);
      bytes -= hit.bytes;
      return undefined;
    }
    // LRU: most recent at the end.
    cache.delete(key);
    cache.set(key, hit);
    return hit.value;
  }

  async function build(raw) {
    const deadline = now() + timeoutMs;
    const page = await safeGet(raw, {
      deadline,
      maxBytes: MAX_HTML_BYTES,
      accept: "text/html,application/xhtml+xml;q=0.9",
      stopAt: /<\/head>/i,
      lookupAll,
      transport,
    });
    const type = String(page.headers["content-type"] || "").split(";")[0].trim().toLowerCase();
    if (type !== "text/html" && type !== "application/xhtml+xml") throw new PreviewError("not_html");
    const parsed = parseHead(decodeBody(page.body, page.headers["content-type"]), page.finalUrl);
    if (!parsed.title && !parsed.description) throw new PreviewError("no_meta");
    let image = null;
    if (parsed.image && deadline - now() > 150) {
      try {
        const img = await safeGet(parsed.image, { deadline, maxBytes: MAX_IMAGE_BYTES, accept: "image/png,image/jpeg,image/gif,image/webp", lookupAll, transport });
        image = imageDataUri(img.body, img.headers["content-type"]);
      } catch {
        image = null; // the card still shows without its picture
      }
    }
    return { url: page.finalUrl, siteName: parsed.siteName, title: parsed.title, description: parsed.description, image };
  }

  /** { ok: true, preview } or { ok: false, error }. Never throws. */
  async function preview(raw) {
    let key;
    try {
      checkUrl(raw);
      key = keyOf(raw);
    } catch (err) {
      return { ok: false, error: err.code || "bad_url" };
    }
    const cached = get(key);
    if (cached !== undefined) return cached ? { ok: true, preview: cached, cached: true } : { ok: false, error: "unavailable", cached: true };
    if (inflight.has(key)) return inflight.get(key);
    const p = build(raw)
      .then((value) => {
        put(key, value, CACHE_TTL_MS);
        return { ok: true, preview: value };
      })
      .catch((err) => {
        const code = err instanceof PreviewError ? err.code : "failed";
        if (!(err instanceof PreviewError)) log.warn?.("[link-preview] failed:", err?.message || err);
        put(key, null, FAIL_TTL_MS);
        return { ok: false, error: code };
      })
      .finally(() => inflight.delete(key));
    inflight.set(key, p);
    return p;
  }

  return { preview, _cache: cache };
}

module.exports = {
  MAX_REDIRECTS,
  TOTAL_TIMEOUT_MS,
  MAX_HTML_BYTES,
  MAX_IMAGE_BYTES,
  CACHE_TTL_MS,
  PreviewError,
  isBlockedAddress,
  embeddedIpv4,
  checkUrl,
  resolvePublic,
  safeGet,
  parseHead,
  imageDataUri,
  createLinkPreviewService,
};
