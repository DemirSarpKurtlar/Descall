/**
 * descall.com is a static Vite host. POST /api/errors (and every other
 * /api/* call) was answered 405 by the SPA fallback: the external rewrite in
 * vercel.json is not what the live edge applies, and api/index.js only
 * matches /api exactly.
 *
 * Proxy the remainder to the Render API so a same-origin client still logs.
 */
const RENDER_ORIGIN = "https://des-call.onrender.com";

function requestPath(req) {
  const raw = req.url || "/";
  if (raw.startsWith("http://") || raw.startsWith("https://")) {
    const url = new URL(raw);
    return url.pathname + url.search;
  }
  return raw.startsWith("/") ? raw : `/${raw}`;
}

async function requestBody(req) {
  if (req.method === "GET" || req.method === "HEAD") return undefined;
  if (Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === "string") return req.body;
  if (req.body && typeof req.body === "object") return JSON.stringify(req.body);
  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  if (!chunks.length) return undefined;
  return Buffer.concat(chunks);
}

export default async function handler(req, res) {
  const path = requestPath(req);
  const target = `${RENDER_ORIGIN}${path.startsWith("/api/") || path === "/api" ? path : `/api${path}`}`;
  try {
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers || {})) {
      if (value == null) continue;
      const lower = key.toLowerCase();
      if (lower === "host" || lower === "connection" || lower === "content-length" || lower === "accept-encoding") {
        continue;
      }
      headers.set(key, Array.isArray(value) ? value.join(", ") : String(value));
    }
    const body = await requestBody(req);
    const upstream = await fetch(target, {
      method: req.method,
      headers,
      body,
      redirect: "manual",
    });
    res.statusCode = upstream.status;
    upstream.headers.forEach((value, key) => {
      const lower = key.toLowerCase();
      if (lower === "transfer-encoding" || lower === "content-encoding" || lower === "content-length") return;
      res.setHeader(key, value);
    });
    const bytes = Buffer.from(await upstream.arrayBuffer());
    res.setHeader("content-length", String(bytes.length));
    res.end(bytes);
  } catch (error) {
    res.statusCode = 502;
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ error: "api_proxy_failed", message: error?.message || "proxy failed" }));
  }
}
