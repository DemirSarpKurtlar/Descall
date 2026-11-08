/**
 * Instagram Graph API client (Instagram account linked to a Facebook Page, graph.facebook.com).
 *
 * Reels publishing flow:
 *   POST /{ig-user-id}/media           media_type=REELS, video_url, caption, share_to_feed, cover_url
 *   GET  /{container-id}?fields=status_code,status   until FINISHED (or ERROR / EXPIRED)
 *   POST /{ig-user-id}/media_publish   creation_id
 *   GET  /{media-id}?fields=permalink,timestamp
 * Rate limit: GET /{ig-user-id}/content_publishing_limit?fields=config,quota_usage
 *
 * The token travels in the Authorization header, never in a logged URL. Errors are
 * redacted before they are thrown. fetch and sleep are injectable for tests.
 */
import { GRAPH_DEFAULT_VERSION } from "./config.mjs";

const TRANSIENT_CODES = new Set([1, 2, 4, 17, 32, 341, 613]);

export class GraphError extends Error {
  constructor(message, { status, code, subcode, type, fbtraceId, transient } = {}) {
    super(message);
    this.name = "GraphError";
    this.status = status;
    this.code = code;
    this.subcode = subcode;
    this.type = type;
    this.fbtraceId = fbtraceId;
    this.transient = Boolean(transient);
  }
}

export function redact(text, secrets) {
  let out = String(text ?? "");
  for (const s of secrets) if (s && s.length >= 6) out = out.split(s).join("[redacted]");
  return out.replace(/(access_token|client_secret|fb_exchange_token|input_token)=[^&\s"]+/gi, "$1=[redacted]");
}

const defaultSleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class GraphClient {
  /**
   * @param {object} o
   * @param {string} o.igUserId
   * @param {string} o.accessToken
   * @param {string} [o.version]
   * @param {Function} [o.fetch]
   * @param {Function} [o.sleep]
   * @param {Function} [o.log]
   * @param {string} [o.baseUrl]
   */
  constructor({ igUserId, accessToken, version = GRAPH_DEFAULT_VERSION, fetch: f = globalThis.fetch, sleep = defaultSleep, log = () => {}, baseUrl = "https://graph.facebook.com" }) {
    if (!igUserId) throw new Error("IG user id is required");
    if (!accessToken) throw new Error("access token is required");
    this.igUserId = String(igUserId);
    this.token = accessToken;
    this.version = version;
    this.fetch = f;
    this.sleep = sleep;
    this.log = log;
    this.base = `${baseUrl}/${version}`;
  }

  async request(method, path, { query, form, retries = method === "GET" ? 3 : 1 } = {}) {
    const url = new URL(`${this.base}/${path.replace(/^\//, "")}`);
    for (const [k, v] of Object.entries(query || {})) if (v != null) url.searchParams.set(k, String(v));
    const init = { method, headers: { Authorization: `Bearer ${this.token}` } };
    if (form) {
      const body = new URLSearchParams();
      for (const [k, v] of Object.entries(form)) if (v != null) body.set(k, String(v));
      init.body = body.toString();
      init.headers["Content-Type"] = "application/x-www-form-urlencoded";
    }
    let attempt = 0;
    for (;;) {
      attempt += 1;
      try {
        return await this.#send(url, init);
      } catch (e) {
        const transient = e instanceof GraphError ? e.transient : true;
        if (!transient || attempt > retries) throw e;
        const wait = Math.min(30000, 2000 * 2 ** (attempt - 1));
        this.log(`graph ${method} ${path}: transient error, retry ${attempt}/${retries} in ${wait / 1000}s`);
        await this.sleep(wait);
      }
    }
  }

  async #send(url, init) {
    let res;
    try {
      res = await this.fetch(url.toString(), init);
    } catch (e) {
      throw new GraphError(redact(`network error: ${e?.message || e}`, [this.token]), { transient: true });
    }
    const text = await res.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { raw: text.slice(0, 300) };
    }
    if (!res.ok || data?.error) {
      const g = data?.error || {};
      throw new GraphError(redact(`Graph API ${res.status}: ${g.message || data?.raw || "error"}`, [this.token]), {
        status: res.status,
        code: g.code,
        subcode: g.error_subcode,
        type: g.type,
        fbtraceId: g.fbtrace_id,
        transient: res.status >= 500 || res.status === 429 || TRANSIENT_CODES.has(g.code) || Boolean(g.is_transient),
      });
    }
    return data;
  }

  /** Account check: confirms the token can read the IG user. */
  getAccount() {
    return this.request("GET", this.igUserId, { query: { fields: "id,username" } });
  }

  /** { used, total, remaining } of API-published posts in the moving 24 h window. */
  async getPublishingLimit() {
    const data = await this.request("GET", `${this.igUserId}/content_publishing_limit`, { query: { fields: "config,quota_usage" } });
    const row = Array.isArray(data?.data) ? data.data[0] || {} : data || {};
    const used = Number(row.quota_usage ?? 0);
    const total = Number(row.config?.quota_total ?? 0) || null;
    return { used, total, remaining: total == null ? null : Math.max(0, total - used), raw: row };
  }

  /** Captions of the latest posts (newest first), for a second duplicate guard. */
  async recentMedia(limit = 30) {
    const data = await this.request("GET", `${this.igUserId}/media`, { query: { fields: "id,caption,timestamp,permalink,media_product_type", limit } });
    return Array.isArray(data?.data) ? data.data : [];
  }

  /** Step 1: create a REELS container. Returns the container id. */
  async createReelContainer({ videoUrl, caption, coverUrl, shareToFeed = true, thumbOffsetMs }) {
    if (!/^https:\/\//.test(videoUrl || "")) throw new Error("video_url must be a public https URL");
    const data = await this.request("POST", `${this.igUserId}/media`, {
      form: {
        media_type: "REELS",
        video_url: videoUrl,
        caption,
        share_to_feed: shareToFeed ? "true" : "false",
        cover_url: coverUrl || undefined,
        thumb_offset: coverUrl ? undefined : thumbOffsetMs,
      },
      retries: 2,
    });
    if (!data?.id) throw new GraphError("container creation returned no id");
    return data.id;
  }

  getContainerStatus(containerId) {
    return this.request("GET", containerId, { query: { fields: "status_code,status" } });
  }

  /** Step 2: poll until FINISHED. Throws on ERROR / EXPIRED / timeout. */
  async waitForContainer(containerId, { intervalMs = 10000, timeoutMs = 15 * 60 * 1000 } = {}) {
    const started = Date.now();
    let polls = 0;
    let waited = 0;
    for (;;) {
      const st = await this.getContainerStatus(containerId);
      polls += 1;
      const code = st?.status_code;
      this.log(`container ${containerId}: ${code}${st?.status ? ` (${st.status})` : ""}`);
      if (code === "FINISHED" || code === "PUBLISHED") return { statusCode: code, polls };
      if (code === "ERROR" || code === "EXPIRED") throw new GraphError(`container ${containerId} ${code}: ${st?.status || "no detail"}`);
      waited += intervalMs;
      if (Math.max(waited, Date.now() - started) > timeoutMs) throw new GraphError(`container ${containerId} not ready after ${Math.round(timeoutMs / 1000)}s (last ${code})`);
      await this.sleep(intervalMs);
    }
  }

  /**
   * Step 3: publish. A failed call is retried only while the container is not yet
   * PUBLISHED, so a lost response never posts twice.
   */
  async publish(containerId) {
    for (let attempt = 1; ; attempt++) {
      try {
        const data = await this.request("POST", `${this.igUserId}/media_publish`, { form: { creation_id: containerId }, retries: 0 });
        if (!data?.id) throw new GraphError("media_publish returned no id");
        return data.id;
      } catch (e) {
        let st = null;
        try {
          st = await this.getContainerStatus(containerId);
        } catch {
          st = null;
        }
        if (st?.status_code === "PUBLISHED") {
          const recent = await this.recentMedia(1);
          if (recent[0]?.id) return recent[0].id;
          throw new GraphError(`container ${containerId} is PUBLISHED but the media id could not be read`);
        }
        const transient = e instanceof GraphError ? e.transient : true;
        if (!transient || attempt >= 3) throw e;
        await this.sleep(5000 * attempt);
      }
    }
  }

  getMedia(mediaId) {
    return this.request("GET", mediaId, { query: { fields: "id,permalink,timestamp,media_product_type" } });
  }

  /** Whole flow. Returns { containerId, mediaId, permalink, timestamp }. */
  async publishReel({ videoUrl, caption, coverUrl, pollIntervalMs, pollTimeoutMs }) {
    const containerId = await this.createReelContainer({ videoUrl, caption, coverUrl });
    this.log(`container created: ${containerId}`);
    await this.waitForContainer(containerId, { intervalMs: pollIntervalMs, timeoutMs: pollTimeoutMs });
    const mediaId = await this.publish(containerId);
    let media = {};
    try {
      media = await this.getMedia(mediaId);
    } catch (e) {
      this.log(`permalink lookup failed: ${e.message}`);
    }
    return { containerId, mediaId, permalink: media.permalink || null, timestamp: media.timestamp || null };
  }
}

/**
 * Exchange a valid long-lived (or short-lived) user token for a fresh long-lived one
 * (about 60 days). Needs the Meta app id and secret.
 */
export async function exchangeLongLivedToken({ appId, appSecret, token, version = GRAPH_DEFAULT_VERSION, fetch: f = globalThis.fetch }) {
  if (!appId || !appSecret || !token) throw new Error("appId, appSecret and token are required");
  const url = new URL(`https://graph.facebook.com/${version}/oauth/access_token`);
  url.searchParams.set("grant_type", "fb_exchange_token");
  url.searchParams.set("client_id", appId);
  url.searchParams.set("client_secret", appSecret);
  url.searchParams.set("fb_exchange_token", token);
  const res = await f(url.toString(), { method: "GET" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error || !data.access_token) {
    throw new GraphError(redact(`token exchange failed (${res.status}): ${data?.error?.message || "no token"}`, [appSecret, token]), { status: res.status, code: data?.error?.code });
  }
  return { accessToken: data.access_token, expiresIn: data.expires_in ?? null, tokenType: data.token_type || "bearer" };
}

/** Token health via /debug_token: { isValid, expiresAt (Date|null, null = never), scopes }. */
export async function debugToken({ appId, appSecret, token, version = GRAPH_DEFAULT_VERSION, fetch: f = globalThis.fetch }) {
  const url = new URL(`https://graph.facebook.com/${version}/debug_token`);
  url.searchParams.set("input_token", token);
  const res = await f(url.toString(), { method: "GET", headers: { Authorization: `Bearer ${appId}|${appSecret}` } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) throw new GraphError(redact(`debug_token failed (${res.status}): ${data?.error?.message || ""}`, [appSecret, token]), { status: res.status });
  const d = data.data || {};
  return {
    isValid: Boolean(d.is_valid),
    expiresAt: d.expires_at ? new Date(d.expires_at * 1000) : null,
    dataAccessExpiresAt: d.data_access_expires_at ? new Date(d.data_access_expires_at * 1000) : null,
    scopes: d.scopes || [],
    type: d.type || null,
  };
}
