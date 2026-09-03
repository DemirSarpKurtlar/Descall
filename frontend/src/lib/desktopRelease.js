/**
 * Known-good Windows NSIS installer for when GitHub API is rate-limited.
 * Update this whenever cutting a new Electron release tag.
 */
export const DESKTOP_RELEASE_FALLBACK = {
  tagName: "v2.9.10",
  version: "2.9.10",
  name: "2.9.10",
  htmlUrl: "https://github.com/DemirSarpKurtlar/Descall/releases/tag/v2.9.10",
  windowsDownloadUrl:
    "https://github.com/DemirSarpKurtlar/Descall/releases/download/v2.9.10/Descall-Setup-2.9.10.exe",
  repo: "DemirSarpKurtlar/Descall",
  fallback: true,
};
