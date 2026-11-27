#!/usr/bin/env node
// Static server for Lighthouse CI (.github/workflows/lighthouse.yml).
//
// Serves a built frontend/dist the way descall.com (Vercel) does, so the scores match the
// real site as closely as a CI runner can:
//   - clean URLs: /features -> features.html, /blog/x -> blog/x.html, /de -> de.html
//   - SPA fallback: app routes without a prerendered file (/login, /register, /direct/...)
//     get index.html with status 200, like the vercel.json rewrites
//   - brotli / gzip for text assets, long cache for hashed /assets/*
//   - no backend: /api/* answers at once (401 for /api/auth/me = logged out, 404 for the
//     rest) and /socket.io/* is refused, so public pages render their logged-out state and
//     nothing ever reaches production.
//
//   node scripts/lhci/serve-dist.mjs [--dist dist] [--port 4173] [--host 127.0.0.1]
// Prints "lhci-serve ready on <url>" when listening (LHCI startServerReadyPattern).
import { createServer } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, resolve, sep } from "node:path";
import { brotliCompressSync, constants as zc, gzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";

export const READY_TEXT = "lhci-serve ready on";

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".xml": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".wav": "audio/wav",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".wasm": "application/wasm",
  ".glb": "model/gltf-binary",
};
const COMPRESSIBLE = new Set([".html", ".js", ".mjs", ".css", ".json", ".webmanifest", ".svg", ".xml", ".txt"]);

/**
 * File (relative to dist) that answers `urlPath`, or null for a 404.
 * `isFile(rel)` reports whether dist/<rel> is a regular file.
 * Returns { file, spa } where spa=true means the SPA shell answered an app route.
 */
export function resolveDistPath(urlPath, isFile) {
  let p;
  try {
    p = decodeURIComponent(String(urlPath || "/").split("?")[0].split("#")[0]);
  } catch {
    return null;
  }
  if (!p.startsWith("/") || p.includes("\0")) return null;
  // Normalise and refuse anything that climbs out of dist.
  const parts = [];
  for (const seg of p.split("/")) {
    if (!seg || seg === ".") continue;
    if (seg === "..") return null;
    parts.push(seg);
  }
  const rel = parts.join("/");
  if (!rel) return { file: "index.html", spa: false };
  if (isFile(rel)) return { file: rel, spa: false };
  if (isFile(`${rel}.html`)) return { file: `${rel}.html`, spa: false };
  if (isFile(`${rel}/index.html`)) return { file: `${rel}/index.html`, spa: false };
  // A missing file with an extension (asset, image, script) is a real 404, never the shell.
  if (extname(parts[parts.length - 1])) return null;
  return { file: "index.html", spa: true };
}

/** Stub answer for backend calls: { status, body } (always JSON). */
export function apiStub(urlPath) {
  const p = String(urlPath || "").split("?")[0];
  if (/^\/api\/auth\/me\/?$/.test(p)) return { status: 401, body: { error: "unauthorized", code: "LHCI_NO_BACKEND" } };
  return { status: 404, body: { error: "not_found", code: "LHCI_NO_BACKEND" } };
}

/** Preferred encoding for an Accept-Encoding header: "br", "gzip" or null. */
export function pickEncoding(acceptEncoding) {
  const v = String(acceptEncoding || "").toLowerCase();
  if (/\bbr\b/.test(v)) return "br";
  if (/\bgzip\b/.test(v)) return "gzip";
  return null;
}

export function startServer({ dist, port = 4173, host = "127.0.0.1", log = console.log } = {}) {
  const root = resolve(dist);
  if (!existsSync(join(root, "index.html"))) throw new Error(`no index.html in ${root} (build the frontend first)`);
  const encCache = new Map();
  const isFile = (rel) => {
    const abs = resolve(root, rel);
    if (abs !== root && !abs.startsWith(root + sep)) return false;
    try {
      return statSync(abs).isFile();
    } catch {
      return false;
    }
  };

  const server = createServer((req, res) => {
    const url = req.url || "/";
    if (req.method !== "GET" && req.method !== "HEAD") {
      if (url.startsWith("/api/")) {
        const stub = apiStub(url);
        res.writeHead(stub.status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
        return res.end(JSON.stringify(stub.body));
      }
      res.writeHead(405, { Allow: "GET, HEAD" });
      return res.end();
    }
    if (url.startsWith("/api/")) {
      const stub = apiStub(url);
      res.writeHead(stub.status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
      return res.end(JSON.stringify(stub.body));
    }
    if (url.startsWith("/socket.io/")) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      return res.end("no realtime backend in lighthouse ci");
    }
    const hit = resolveDistPath(url, isFile);
    if (!hit) {
      const notFound = isFile("404.html") ? readFileSync(join(root, "404.html")) : Buffer.from("Not found");
      res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
      return res.end(req.method === "HEAD" ? undefined : notFound);
    }
    const ext = extname(hit.file).toLowerCase();
    const headers = {
      "Content-Type": TYPES[ext] || "application/octet-stream",
      "Cache-Control": hit.file.startsWith("assets/") ? "public, max-age=31536000, immutable" : "no-cache",
      "X-Content-Type-Options": "nosniff",
    };
    let body = readFileSync(join(root, hit.file));
    const enc = COMPRESSIBLE.has(ext) ? pickEncoding(req.headers["accept-encoding"]) : null;
    if (enc) {
      const key = `${enc}:${hit.file}`;
      let packed = encCache.get(key);
      if (!packed) {
        packed = enc === "br"
          ? brotliCompressSync(body, { params: { [zc.BROTLI_PARAM_QUALITY]: 9 } })
          : gzipSync(body, { level: 9 });
        encCache.set(key, packed);
      }
      body = packed;
      headers["Content-Encoding"] = enc;
      headers.Vary = "Accept-Encoding";
    }
    headers["Content-Length"] = String(body.length);
    res.writeHead(200, headers);
    res.end(req.method === "HEAD" ? undefined : body);
  });

  return new Promise((ok, fail) => {
    server.once("error", fail);
    server.listen(port, host, () => {
      log(`${READY_TEXT} http://${host}:${server.address().port}`);
      ok(server);
    });
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = (name, fallback) => {
    const i = process.argv.indexOf(`--${name}`);
    return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
  };
  startServer({ dist: arg("dist", "dist"), port: Number(arg("port", 4173)), host: arg("host", "127.0.0.1") }).catch((err) => {
    console.error(`[lhci-serve] ${err.message}`);
    process.exit(1);
  });
}
