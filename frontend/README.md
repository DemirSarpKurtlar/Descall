# Descall Frontend (Vite + React + Socket.IO)

## 1) Install

```bash
cd frontend
npm install
```

## 2) Configure Render backend URL

Copy `.env.example` to `.env` and set:

```bash
VITE_API_BASE_URL=https://YOUR-RENDER-URL.onrender.com
```

## 3) Run

```bash
npm run dev
```

## 4) Build for production

```bash
npm run build
npm run preview
```

## Notes

- API base URL is centralized in `src/config/api.js`.
- Socket connection is isolated in `src/socket.js`.
- Auth API calls are isolated in `src/api/auth.js`.
- JWT token and user state are persisted in localStorage.

## Android performance bench

`scripts/perf/android-bench.mjs` measures the app as the native Android shell
(Capacitor WebView user agent, `window.Capacitor` with platform `android`) on
the Pixel 7 profile with 4x CPU throttling, and the same flow on the iPhone 15
profile (platform `ios`) for comparison. It serves a built `dist/` together
with the synthetic heavy account from `e2e/perf/mockBackend.cjs` (1000-message
DM, 300 friends, 40 groups, 60 servers) on 127.0.0.1; every other host is
unreachable. Nothing talks to the real backend.

```bash
# the mock API must be baked in (on 127.0.0.1 the app ignores the runtime override)
VITE_WORLD3D=0 VITE_API_BASE_URL=http://127.0.0.1:5391 VITE_SOCKET_URL=http://127.0.0.1:5391 \
  npx vite build --outDir /tmp/dist-perf
node scripts/perf/android-bench.mjs --dist=/tmp/dist-perf --out=/tmp/android-bench --runs=3
```

Options: `--devices=android,iphone`, `--cpu=4`, `--rounds=3` (gestures / taps
per scenario), `--runs=3` (fresh-context repeats; the table shows medians),
`--profile=0` (skip CPU sampling), `--shots` (small screenshots), `--port`,
`--glass=full|lite|auto` (default `full`: pins the full Android material,
because the app's frame-rate sample flips a loaded bench machine to
`glass-lite` at random; `auto` keeps the app's own decision).

Output: `results.json` (all raw numbers) and `report.md` with

- boot: first paint, FCP, app shell (tab bar up, splash gone), chat list,
  first interactive (first 1 s without a long task), long tasks / TBT
- frame drops (frames over 25 ms, p95 frame time) while scrolling the DM list,
  the friends list and the 1000-message chat with touch gestures
- input-to-paint latency for opening a chat, the message long-press sheet and
  each bottom tab
- JS heap, DOM nodes, composited layer count and the biggest layers,
  elements with `backdrop-filter`, running / infinite animations, `will-change`
- hotspot evidence: long animation frame script attribution and the top CPU
  self-time functions per scenario (`chunk:function:line:col`)

Headless Chromium rasterises on the CPU and the iPhone profile runs Blink, not
WebKit: compare builds and code paths with it, and read the layer and
backdrop counts as the GPU-side evidence. The machine is shared, so compare
medians of `--runs=3` taken back to back.
