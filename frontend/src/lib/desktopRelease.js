/**
 * Known-good Windows NSIS installer for when GitHub API is rate-limited.
 * Update this whenever cutting a new Electron release tag.
 */
export const DESKTOP_RELEASE_FALLBACK = {
  tagName: "v2.9.15",
  version: "2.9.15",
  name: "2.9.15",
  htmlUrl: "https://github.com/DemirSarpKurtlar/Descall/releases/tag/v2.9.15",
  windowsDownloadUrl:
    "https://github.com/DemirSarpKurtlar/Descall/releases/download/v2.9.15/Descall-Setup-2.9.15.exe",
  repo: "DemirSarpKurtlar/Descall",
  fallback: true,
};
