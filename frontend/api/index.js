/**
 * Vercel no longer hosts the Descall API.
 * Production API + Socket.IO: https://des-call.onrender.com
 * Leftover /api hits must not boot Express on Vercel.
 */
export default function handler(req, res) {
  res.statusCode = 410;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "public, max-age=60");
  res.end(JSON.stringify({
    error: "api_moved",
    message: "Descall API runs on Render, not Vercel.",
    api: "https://des-call.onrender.com",
  }));
}
