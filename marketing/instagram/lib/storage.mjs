/**
 * Puts the rendered MP4 and cover at a public https URL Instagram can fetch.
 *
 * Primary: Supabase Storage public bucket "marketing-reels" (service-role key, the same
 * SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY pair the backend uses).
 * Fallback: an asset on a GitHub prerelease (the repo is public). Its download URL
 * redirects to a signed objects.githubusercontent.com URL.
 */
import { STORAGE_BUCKET } from "./config.mjs";
import { redact } from "./graph.mjs";

export class SupabaseStorage {
  constructor({ url, serviceKey, bucket = STORAGE_BUCKET, fetch: f = globalThis.fetch }) {
    if (!url || !serviceKey) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
    this.url = url.replace(/\/+$/, "");
    this.key = serviceKey;
    this.bucket = bucket;
    this.fetch = f;
  }

  headers(extra = {}) {
    return { Authorization: `Bearer ${this.key}`, apikey: this.key, ...extra };
  }

  async #json(res) {
    const text = await res.text();
    try {
      return text ? JSON.parse(text) : {};
    } catch {
      return { raw: text.slice(0, 200) };
    }
  }

  /** Create the public bucket when it does not exist yet. */
  async ensureBucket() {
    const got = await this.fetch(`${this.url}/storage/v1/bucket/${this.bucket}`, { headers: this.headers() });
    if (got.ok) {
      const b = await this.#json(got);
      if (b && b.public === false) throw new Error(`bucket ${this.bucket} exists but is not public; make it public in Supabase Storage`);
      return { created: false };
    }
    const res = await this.fetch(`${this.url}/storage/v1/bucket`, {
      method: "POST",
      headers: this.headers({ "Content-Type": "application/json" }),
      body: JSON.stringify({ id: this.bucket, name: this.bucket, public: true, file_size_limit: 104857600, allowed_mime_types: ["video/mp4", "image/jpeg"] }),
    });
    if (res.ok) return { created: true };
    const body = await this.#json(res);
    if (/already exists/i.test(JSON.stringify(body))) return { created: false };
    throw new Error(redact(`bucket create failed (${res.status}): ${JSON.stringify(body)}`, [this.key]));
  }

  publicUrl(path) {
    return `${this.url}/storage/v1/object/public/${this.bucket}/${path.split("/").map(encodeURIComponent).join("/")}`;
  }

  async upload(path, bytes, contentType) {
    const res = await this.fetch(`${this.url}/storage/v1/object/${this.bucket}/${path.split("/").map(encodeURIComponent).join("/")}`, {
      method: "POST",
      headers: this.headers({ "Content-Type": contentType, "x-upsert": "true", "cache-control": "3600" }),
      body: bytes,
    });
    if (!res.ok) {
      const body = await this.#json(res);
      throw new Error(redact(`upload ${path} failed (${res.status}): ${JSON.stringify(body)}`, [this.key]));
    }
    return this.publicUrl(path);
  }
}

export class GithubReleaseStorage {
  constructor({ repo, token, tag = "instagram-reels-media", fetch: f = globalThis.fetch }) {
    if (!repo || !token) throw new Error("GITHUB_REPOSITORY and GITHUB_TOKEN are required");
    this.repo = repo;
    this.token = token;
    this.tag = tag;
    this.fetch = f;
  }

  headers(extra = {}) {
    return { Authorization: `Bearer ${this.token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", ...extra };
  }

  async release() {
    const got = await this.fetch(`https://api.github.com/repos/${this.repo}/releases/tags/${this.tag}`, { headers: this.headers() });
    if (got.ok) return got.json();
    const res = await this.fetch(`https://api.github.com/repos/${this.repo}/releases`, {
      method: "POST",
      headers: this.headers({ "Content-Type": "application/json" }),
      body: JSON.stringify({ tag_name: this.tag, name: "Instagram Reels media", body: "Rendered Reels for the Instagram publisher (marketing/instagram). Not an app release.", prerelease: true }),
    });
    if (!res.ok) throw new Error(redact(`release create failed (${res.status})`, [this.token]));
    return res.json();
  }

  async upload(path, bytes, contentType) {
    const rel = await this.release();
    const name = path.replace(/\//g, "-");
    const existing = (rel.assets || []).find((a) => a.name === name);
    if (existing) {
      await this.fetch(`https://api.github.com/repos/${this.repo}/releases/assets/${existing.id}`, { method: "DELETE", headers: this.headers() });
    }
    const res = await this.fetch(`https://uploads.github.com/repos/${this.repo}/releases/${rel.id}/assets?name=${encodeURIComponent(name)}`, {
      method: "POST",
      headers: this.headers({ "Content-Type": contentType }),
      body: bytes,
    });
    if (!res.ok) throw new Error(redact(`asset upload failed (${res.status})`, [this.token]));
    const asset = await res.json();
    return asset.browser_download_url;
  }
}

/** HEAD the public URL (following redirects) and check the type before Instagram fetches it. */
export async function verifyPublicUrl(url, expectedType, { fetch: f = globalThis.fetch } = {}) {
  const res = await f(url, { method: "HEAD", redirect: "follow" });
  if (!res.ok) throw new Error(`public URL is not reachable (${res.status}): ${url.split("?")[0]}`);
  const type = res.headers?.get?.("content-type") || "";
  if (expectedType && type && !type.startsWith(expectedType) && !type.startsWith("application/octet-stream")) {
    throw new Error(`public URL serves ${type}, expected ${expectedType}`);
  }
  return true;
}

/** Storage from the environment: Supabase when configured, else the GitHub release fallback. */
export function storageFromEnv(env = process.env, f = globalThis.fetch) {
  if (env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) {
    return { kind: "supabase", store: new SupabaseStorage({ url: env.SUPABASE_URL, serviceKey: env.SUPABASE_SERVICE_ROLE_KEY, bucket: env.IG_STORAGE_BUCKET || STORAGE_BUCKET, fetch: f }) };
  }
  if (env.IG_MEDIA_FALLBACK === "github-release" && env.GITHUB_TOKEN && env.GITHUB_REPOSITORY) {
    return { kind: "github-release", store: new GithubReleaseStorage({ repo: env.GITHUB_REPOSITORY, token: env.GITHUB_TOKEN, fetch: f }) };
  }
  return null;
}
