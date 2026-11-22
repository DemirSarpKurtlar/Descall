"use strict";

/**
 * Tauri desktop updater feed (first endpoint in desktop/app/src-tauri/tauri.conf.json):
 *   GET /api/desktop/tauri/{{target}}/{{arch}}/{{current_version}}
 *
 * Serves the same latest.json the GitHub `desktop-latest` channel holds (written by
 * tauri-release.yml, desktop/tools/publish/desktop_release.py latest-json), with a cache:
 *  - fresh for FRESH_MS; one fetch at a time (concurrent requests share it);
 *  - when GitHub is slow or down, the last good copy is served for up to STALE_MS, so
 *    installed apps keep seeing the update without waiting on GitHub's manifest URL.
 *
 * tauri-plugin-updater semantics (2.14, updater.rs Updater::check):
 *  - 204 No Content = "no update", and the client does NOT try the next endpoint;
 *  - any other non-2xx (or a body that is not a release) = try the next endpoint (GitHub).
 * So 204 is only answered when we KNOW the client is current (or updates are paused on
 * purpose); every failure is a 503 so the client falls through to GitHub.
 *
 * The manifest is not trusted for safety: the client verifies the installer's minisign
 * signature against the public key compiled into the app, and only accepts a higher version.
 * We still validate the shape (and that the download URL is on GitHub) before serving it.
 *
 * DESKTOP_TAURI_UPDATES_PAUSED=1 holds every client on its current version (204) without a
 * new release: the operator's brake when a promoted build turns out bad. GitHub's channel
 * file is not affected by it, but the client never reaches GitHub after our 204.
 */

const FRESH_MS = 5 * 60 * 1000;
const STALE_MS = 24 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 8000;
const MAX_BYTES = 64 * 1024;

const SEMVER_RE = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;
const TARGETS = new Set(["windows"]);
const ARCHES = new Set(["x86_64"]);
const DOWNLOAD_HOSTS = new Set(["github.com", "objects.githubusercontent.com", "release-assets.githubusercontent.com"]);

function parseVersion(v) {
  const m = SEMVER_RE.exec(String(v || "").trim());
  if (!m) return null;
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]), pre: m[4] ? m[4].split(".") : [] };
}

function comparePre(a, b) {
  if (!a.length && !b.length) return 0;
  if (!a.length) return 1; // 4.1.0 > 4.1.0-beta
  if (!b.length) return -1;
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    if (a[i] === undefined) return -1;
    if (b[i] === undefined) return 1;
    const na = /^\d+$/.test(a[i]);
    const nb = /^\d+$/.test(b[i]);
    if (na && nb) {
      const d = Number(a[i]) - Number(b[i]);
      if (d) return Math.sign(d);
    } else if (na !== nb) {
      return na ? -1 : 1;
    } else if (a[i] !== b[i]) {
      return a[i] < b[i] ? -1 : 1;
    }
  }
  return 0;
}

/** semver order (build metadata ignored); null when either side is not a version. */
function compareVersions(a, b) {
  const x = parseVersion(a);
  const y = parseVersion(b);
  if (!x || !y) return null;
  for (const k of ["major", "minor", "patch"]) {
    if (x[k] !== y[k]) return Math.sign(x[k] - y[k]);
  }
  return comparePre(x.pre, y.pre);
}

function isGithubDownload(url) {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && DOWNLOAD_HOSTS.has(u.hostname);
  } catch {
    return false;
  }
}

/** The latest.json shape the plugin needs; null when it is not usable. */
function validManifest(m) {
  if (!m || typeof m !== "object" || Array.isArray(m)) return null;
  if (!parseVersion(m.version)) return null;
  const platforms = m.platforms;
  if (!platforms || typeof platforms !== "object") return null;
  const keys = ["windows-x86_64-nsis", "windows-x86_64"].filter((k) => platforms[k]);
  if (!keys.length) return null;
  for (const k of keys) {
    const p = platforms[k];
    if (!p || typeof p.signature !== "string" || !p.signature.trim() || !isGithubDownload(p.url)) return null;
  }
  return m;
}

function defaultManifestUrl(env = process.env) {
  if (env.DESKTOP_TAURI_LATEST_JSON_URL) return env.DESKTOP_TAURI_LATEST_JSON_URL;
  const repo = env.GITHUB_RELEASE_REPO || "DemirSarpKurtlar/Descall";
  return `https://github.com/${repo}/releases/download/desktop-latest/latest.json`;
}

function createFeed({ fetchImpl = globalThis.fetch, now = Date.now, url = defaultManifestUrl(), freshMs = FRESH_MS, staleMs = STALE_MS, timeoutMs = FETCH_TIMEOUT_MS, log = console } = {}) {
  let cache = null; // { at, manifest }
  let inflight = null;

  async function fetchManifest() {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetchImpl(url, { headers: { Accept: "application/json", "User-Agent": "Descall-Server" }, redirect: "follow", signal: controller.signal });
      if (!res.ok) throw new Error(`latest.json HTTP ${res.status}`);
      const text = await res.text();
      if (text.length > MAX_BYTES) throw new Error("latest.json too large");
      const manifest = validManifest(JSON.parse(text));
      if (!manifest) throw new Error("latest.json has no usable windows-x86_64 entry");
      return manifest;
    } finally {
      clearTimeout(timer);
    }
  }

  /** The newest good manifest, or null when none is known (fetch failed and no usable copy). */
  async function latest() {
    const t = now();
    if (cache && t - cache.at < freshMs) return cache.manifest;
    if (!inflight) {
      inflight = fetchManifest()
        .then((manifest) => {
          cache = { at: now(), manifest };
          return manifest;
        })
        .catch((err) => {
          log.warn?.(`[desktop-updates] ${err.message}${cache ? " (serving the cached copy)" : ""}`);
          return null;
        })
        .finally(() => {
          inflight = null;
        });
    }
    const fetched = await inflight;
    if (fetched) return fetched;
    if (cache && now() - cache.at < staleMs) return cache.manifest;
    return null;
  }

  return { latest, _reset: () => { cache = null; inflight = null; } };
}

/**
 * Decide the answer for one client: { status: 200, body } | { status: 204 } | { status: 400|503 }.
 */
async function answer(feed, { target, arch, currentVersion }, env = process.env) {
  if (!TARGETS.has(target) || !ARCHES.has(arch) || !parseVersion(currentVersion)) return { status: 400 };
  if (env.DESKTOP_TAURI_UPDATES_PAUSED === "1" || env.DESKTOP_TAURI_UPDATES_PAUSED === "true") return { status: 204 };
  const manifest = await feed.latest();
  if (!manifest) return { status: 503 };
  const cmp = compareVersions(manifest.version, currentVersion);
  if (cmp === null || cmp <= 0) return { status: 204 };
  return { status: 200, body: manifest };
}

module.exports = { createFeed, answer, compareVersions, validManifest, defaultManifestUrl, FRESH_MS, STALE_MS };
