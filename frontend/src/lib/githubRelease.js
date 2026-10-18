import { API_BASE_URL } from "../config/api";
import { fetchPublic } from "./edgeApi.js";

/**
 * Fetches latest desktop release via backend (avoids GitHub API CORS in browser).
 */
export async function fetchLatestDesktopRelease() {
  const base = (API_BASE_URL || "").replace(/\/$/, "") || window.location.origin;
  // Public + cacheable: goes through the Cloudflare edge when it is live.
  const res = await fetchPublic("/api/app/latest-release", { credentials: "omit" }, { origin: base });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data.error || `Release check failed (${res.status})`);
  }

  return data;
}
