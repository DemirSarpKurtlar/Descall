# Electron desktop releases & version numbers

The **website never hardcodes** a desktop version. The landing page calls `GET /api/app/latest-release`, which reads GitHub `releases/latest` for `DemirSarpKurtlar/Descall` and shows e.g. **`v2.4.0 available`**.

## Semver bump rules (by change size)

| Bump | When to use | Example |
|------|-------------|---------|
| **patch** | Bug fixes, small UI tweaks, security patches | `2.3.1` → `2.3.2` |
| **minor** | New features, noticeable improvements, no breaking API | `2.3.1` → `2.4.0` |
| **major** | Breaking changes, large rewrites, incompatible updates | `2.3.1` → `3.0.0` |

## Release from Windows (recommended)

In `frontend/electron` with `GH_TOKEN` set:

```bash
cd frontend/electron
npm run release          # patch bump + build + GitHub release + tag vX.Y.Z
npm run release:minor    # minor bump
npm run release:major    # major bump
```

`release.cjs` will:

1. Bump `frontend/electron/package.json` (and sync the same semver to `frontend/package.json` + root `package.json` via `sync-version.cjs`)
2. Build `Descall-Setup-<version>.exe`
3. Create GitHub release **`v<version>`** on **`Descall`** (correct repo casing)
4. Upload `.exe`, blockmap, and `latest.yml` for auto-update

After publish, the **site updates automatically** on the next page load (and when the tab becomes visible again).

## CI release (tag push)

Pushing a tag `v*` on `main` runs `.github/workflows/release.yml`, which syncs `electron/package.json` from the tag and publishes the Windows installer.

## Agents / maintainers

- Do **not** edit the landing page to show a fixed version like `2.3.1`.
- Always bump semver via `release.cjs` (or a new `v*` tag) when shipping Electron.
- Keep `GITHUB_RELEASE_REPO` (optional env) aligned with `DemirSarpKurtlar/Descall` if you fork.
- Electron **always** uses production API `https://des-call.onrender.com` (build + runtime). Do not point desktop builds at staging.
- After each release, update the fallback installer URLs in:
  - `frontend/src/lib/desktopRelease.js`
  - `frontend/backend/routes/appRelease.js` (`FALLBACK_RELEASE`)
  so the landing page still downloads when GitHub API rate-limits Render.
- Electron title bar (`TitleBar`) must stay mounted for the whole desktop session
  (login + logged-in app). Content offsets via `body.electron-app` / `--electron-titlebar-h`.
- Auto-update (NSIS Setup only): generic feed
  `https://github.com/DemirSarpKurtlar/Descall/releases/latest/download/`,
  Discord-style **prelaunch splash** checks before the main window opens;
  if GitHub `latest` is newer, download + `quitAndInstall(true, true)` from the
  splash (main UI stays closed). While running, re-check every 10 minutes.
  `verifyUpdateCodeSignature=false` (unsigned).

## Standing rule (Office)

**Every shipped app/code change also cuts a new Electron Windows Setup.** Bump semver, tag `vX.Y.Z`, and publish `Descall-Setup-*.exe` + blockmap + `latest.yml`. Do not leave the desktop installer on an old tag after a web/API fix.

The packaged app checks GitHub `latest` on launch (splash), every 5 minutes while running (including tray / unfocused), and on minimize/blur. It **downloads in the background** and applies on quit or next launch so the window is never yanked to the front. Splash still `quitAndInstall` before the main window opens.

## Downloads cleanup (Electron-only)

When the desktop app downloads a new Setup (electron-updater `update-downloaded`),
on launch after an update is applied, or when an in-app GitHub `Descall-Setup-*.exe`
download finishes inside Electron, Descall quietly deletes **older**
`Descall-Setup-*.exe` (and matching `.exe.blockmap`) files from the user's
**Downloads** folder. It keeps the installer matching the current/new app version
when present, otherwise the newest Setup. Unrelated Downloads files are never
touched; cleanup is logged only (no focus-stealing dialogs).

**Web browser downloads cannot delete files from Downloads** — this cleanup runs
in the Electron main process only (`frontend/electron/setupDownloadsCleanup.cjs`).
Users who download the installer from Chrome/Edge/Firefox keep older Setup copies
until they remove them manually or open/update via the desktop app.
