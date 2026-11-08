#!/usr/bin/env bash
# Install frontend/backend deps from the lockfile. ffmpeg-static's install script downloads
# its binary from GitHub releases, which sometimes answers 504 for minutes at a time. Try a
# normal install three times; if it still fails, install without that download. The backend
# then uses the runner's system ffmpeg (lib/voiceTranscode.js falls back to "ffmpeg" on PATH)
# and the ffmpeg tests skip their encode checks if none is found.
set -uo pipefail
for i in 1 2 3; do
  npm ci --no-audit --no-fund && exit 0
  echo "npm ci failed (attempt $i), retrying in 20s"
  sleep 20
done
echo "npm ci kept failing; installing without the ffmpeg-static download"
npm ci --no-audit --no-fund --ignore-scripts || exit 1
# Run the remaining install scripts (none of them downloads anything).
npm rebuild --no-audit --no-fund @firebase/util protobufjs || exit 1
command -v ffmpeg >/dev/null && ffmpeg -version | head -1 || echo "no system ffmpeg either"
