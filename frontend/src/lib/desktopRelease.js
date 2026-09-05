/**
 * Known-good Windows NSIS installer for when GitHub API is rate-limited.
 * Update this whenever cutting a new Electron release tag.
 */
export const DESKTOP_RELEASE_FALLBACK = {
  tagName: "v2.9.32",
  version: "2.9.32",
  name: "2.9.32",
  htmlUrl: "https://github.com/DemirSarpKurtlar/Descall/releases/tag/v2.9.32",
  windowsDownloadUrl:
    "https://github.com/DemirSarpKurtlar/Descall/releases/download/v2.9.32/Descall-Setup-2.9.32.exe",
  repo: "DemirSarpKurtlar/Descall",
  fallback: true,
};
