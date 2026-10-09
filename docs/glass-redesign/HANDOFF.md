# Descall · iOS Liquid Glass redesign — HANDOFF (Stages 3–7)

Self-contained brief for the Cursor cloud agent continuing this work in the repo
`DemirSarpKurtlar/Descall`. Everything referenced here is committed under
**`docs/glass-redesign/`** (no secrets in it). Owner: **Demir Sarp Kurtlar**.

> **Forget the previous/old Descall design language entirely. The ONLY design
> references are the approved final mockups (`docs/glass-redesign/final/*.png` +
> `final/src/screens/*.html` + `final/src/glass.css`), `docs/glass-redesign/apple-design.md`
> and the decisions below. Existing old styles are not a reference.** Old CSS is only
> something you must not break on desktop/web/Android/iPad.

---

## 1. Status

| Stage | What | Version | State |
|---|---|---|---|
| 1 | Glass foundation (tokens, materials, physics, hooks, native display plugin) + login (01) | 2.9.151 | shipped, Demir tested OK |
| fix | Mobile DM header: name wrapped one letter per line next to the admin badge | 2.9.153 | shipped |
| 2 | Navigation shell: floating 7-tab glass bar, toolbar (me-btn · bgroup · +), large titles, search, scroll-edge, status menu (02/02b/09/11/19/20 chrome, 18) | 2.9.154 · commit 8907c8c · tag v2.9.154 | shipped; CI green (TestFlight, Windows release, Vercel, Render, Marketing gates) — awaiting Demir's TestFlight test |
| 3 | Chats / DM / groups rows, message menu, attach, composer, announcements (02, 02b, 03, 04, 05, 16) | 2.9.155 | shipped in this commit — see PROGRESS.md; CI must be green before Stage 4 |
| 4 | Calls (06, 07, 08, 19) | | TODO |
| 5 | Friends, add friend, servers, channel, server menu, profile (09, 10, 11, 12, 13, 14, 14b) | | TODO |
| 6 | Settings, notifications, Play, Activity, Shop (15, 15b, 17, 20, 21, 21b) | | TODO |
| 7 | Final QA + App Store screenshots (submission only with Demir's explicit OK) | | TODO |

Full plan (Turkish): `docs/glass-redesign/uygulama-plani.md` — §3 has per-stage files, technique, Apple principles, checklist, risks. Version numbers in it are "earliest"; always take the next free one.

## 2. Demir's rules (non-negotiable)

- **All UI copy is Turkish** (i18n keys in `frontend/src/i18n/locales/tr.js`, gaps in `trGaps.js` / `trInAppGaps.js`); copy must match the mockup text character for character.
- **Feature parity**: nothing the current app can do may disappear; nothing new invented. Checklist: `docs/glass-redesign/final/feature-inventory.md`. When a mockup omits a control, keep the action reachable (menu, sheet) — see Stage 2 servers "+" menu and status-menu admin entry.
- **Original Descall logo only** (`components/brand/DescallBrand.jsx`), never a redrawn one.
- **No black bars** top/bottom; **nothing under the Dynamic Island**: chrome starts at `--g-chrome-top` = `env(safe-area-inset-top) − 2px` (= y 60 on a 62pt inset), floating bars at `--g-bar-bottom` (24pt above the bottom on Face ID phones). Backgrounds run edge to edge.
- **Motion/feel = `docs/glass-redesign/apple-design.md`** (instant response on touch-down, 1:1 tracking, interruptible springs = damping ratio + response, velocity handoff, momentum projection, rubber-band, materials convey hierarchy, Reduce Motion / Transparency / Contrast). Use `src/lib/fluid/` + hooks, not ad-hoc CSS transitions.
- **Desktop / web / Electron / Android / iPad must stay pixel-identical** (zero-diff, see §6).
- **Never touch App Store Connect submissions** (2.9.147 is in review — do not touch it) **or production data**. Never print tokens/secrets.
- No destructive git (force-push, tag deletion, re-tagging) without Demir's confirmation. Existing tags are never re-pushed.

## 3. The 7 decisions (from Demir, final)

1. **iOS-only gate**: `html.glass-ui`, set by `src/lib/glassUi.js` only for the Capacitor iOS app on a phone (short side < 600pt). Kill switches: build flag `VITE_GLASS_UI=0`, remote public feature flag `iosGlass` (Admin › System switch, cached in localStorage), QA override `localStorage["descall:glass"]="0"|"1"`. Every glass rule is scoped under `html.glass-ui` (`glass-scope.selftest.mjs` enforces it).
2. **All themes get glass**, tinted by the theme: `styles/glass/themes.css` is GENERATED from `design-tokens.css` by `node frontend/scripts/generate-glass-themes.mjs` (re-run after touching themes or the generator; selftest checks `--check`). Default dark theme = mockup values verbatim (`tokens.css`).
3. **SF Pro system font**: `--g-font: -apple-system, "SF Pro Text", "SF Pro Display", Inter, system-ui, sans-serif`. base.css has `* { font-family: var(--font-ui) !important }`, so glass surfaces must set `font-family: var(--g-font) !important` (see `shell.css`, `auth.css`). Shell roots also set the mockup body type: 15px, `letter-spacing -0.012em`, `line-height: normal`, `font-feature-settings "cv11" 1, "ss01" 1`, `text-rendering: auto`.
4. **Root tabs: edge swipe is inert** (no rubber-band, no navigation). Swipe-back exists only on inner screens (`useEdgeSwipeBack`, AGENTS.md).
5. **Message menu = iOS long-press** (scrim + blur, bubble stays in place, emoji bar on top, actions below, menu grows from the bubble) — Stage 3.
6. **No pilots — full stages**, each shipped as its own version with a mockup compare report.
7. **Companion hidden on iOS** (parity with today; Play shows only LFG).

## 4. Pixel-exact mockup workflow (mandatory per stage)

Mockups: `docs/glass-redesign/final/NN-name.png` (rendered 440×956 @3x) and the HTML sources `final/src/screens/NN-name.html` + `final/src/glass.css` (the CSS is the geometry/material spec — read values from it, e.g. `.tabbar`, `.toolbar`, `.peer`, `.menu`). `final/src/shared.mjs` shows how each screen is built (`listHeader`, `tabBar`, `convNav`, `composer`, …). Design notes: `final/design-notes.md`.

Tooling (`docs/glass-redesign/compare/`, deps: `npm i` there → playwright-core, pixelmatch@5, pngjs@7; uses `/usr/bin/google-chrome`):
- `docs/glass-redesign/shotkit/` = mock backend (`node mock-server.cjs`, env `PORT`, `DIST`=frontend/dist, `MOCK_BADGES=1` (Sohbetler 5 / Arkadaşlar 1), `MOCK_STATUS=1` (custom status 🔥), `AYSE_ADMIN=1`, `AYSE_USERNAME`, `AYSE_NAME`) + `inject.js` fake Capacitor iOS bridge (incl. `DescallDisplay` stub). Build first: `cd frontend && npx vite build`.
- `compare-shell.mjs --port <mock> --status-port <mock> --dsf 3 --version X` — Stage 2 compare: pairs of mockup selector ↔ app selector → geometry (±1pt), computed styles, texts; chrome-only pixel diff (content hidden on both sides, status bar/home indicator masked); writes `*-side-by-side.png`, `*-chrome-side-by-side.png`, `results-X.json`. Extend its `SCREENS`/pairs for Stages 3–6 (add `data-gid`-like selectors).
- `report-shell.mjs X` → `report-X.html`. `compare.mjs` = Stage 1 login compare. `shoot-app.mjs` quick shots (`W`/`H` env for 375 etc.). `dm-header.mjs` = 2.9.153 header check at 440/375/390/1280.
- `zero-diff.mjs` (env `BEFORE`/`AFTER` ports, `OUT`, `ONLY`): before = last release build, after = working tree; desktop/web/Electron/Android/iPad/iPhone-glass-off scenarios; requires **0 different pixels and identical DOM**. Start both mocks at the same moment (timestamps).
- Acceptance: geometry ±1pt and radii exact; styles exact; Turkish text exact; pixel diff ≤0.5% outside known data/font differences (list them in the report). Known unavoidable: Chrome has no SF Pro → both sides fall back to Inter, but the app ships its own Inter build, so glyph widths differ slightly (e.g. tab label "Arkadaşlar" 1.3pt) — on device it's SF Pro; sample data/avatars; the announcement badge has no API count.
- Also verify at **375 and 440** widths, light + one colored theme, Reduce Transparency (`html.a11y-solid`), Increase Contrast (`a11y-contrast`), `glass-lite`.

## 5. Architecture built so far

**Stage 1 (2.9.151)**
- Gate: `src/lib/glassUi.js` (+ selftest), `src/hooks/useGlassUi.js`; `main.jsx` calls `initGlassUi()`; `App.jsx` `applyRemoteGlassFlag`; `lib/publicFeatures.js` + backend `systemSettings.js` `iosGlass`; Admin panel switch.
- Display/a11y: `src/lib/glassDisplay.js` ↔ native `ios/App/App/DescallDisplayPlugin.swift` → `a11y-solid`, `a11y-contrast`, `glass-lite`, dynamic status-bar style (`DescallBridgeViewController.swift`).
- Physics: `src/lib/fluid/{physics,springs,animator,drag}.js` (`SPRINGS.default/move/sheet/flick/press/materialize`, `framerSpring`, `createValueAnimator(initial, onUpdate)` with `.to(target,{preset,velocity})` / `.set()`), hooks `usePressFeedback` (scale 0.97 on pointer-down, `data-pressed`), `useDragSpring`, `useMaterialize`.
- CSS `src/styles/glass/`: `index.css` (imports), `tokens.css` (`--g-*` palette/material/geometry), `themes.css` (generated), `material.css` (`.g-glass`, `.g-heavy`, `.g-chip`, `.g-lens`, `.g-static`, `.g-tint-brand|red|green`, `.g-ambient`, a11y/lite variants), `auth.css` (login), `shell.css` (Stage 2).
- Login: `components/AuthView.jsx` glass branch.

**DM header fix (2.9.153)**: `styles/mobile.css` (end) + `styles/mobile-header.selftest.mjs`: under 768px `.header-title-block` `flex:1 1 0; min-width:0`, title one line nowrap + ellipsis, admin badge `.dsc-admin-badge--inline` icon-only (label hidden), ≤430px compact header icons.

**Stage 2 (2.9.154)**
- `components/layout/glass/GlassShell.jsx`: `GlassShellContext` (value `{me, myStatus, onRefresh}` only when `glassShell`), `useGlassShell()`, `GlassTabBar` (lens on `SPRINGS.move`, badges), `GlassListHeader({title, sub, inlineTitle, buttons:[{id,icon,label,onClick,badge}], plus, search, searchCollapsible})`, `GlassMeButton`/`GlassMeAvatar`, `GlassToolbarMenu`, `GLASS_STATUS_EVENT`.
- `AppLayout.jsx`: `glassShell = useGlassUi() && isMobile`; `.app-root.g-shell`; glass tab bar + `.g-edge-bot` replace the (hidden) classic `.mobile-tab-bar` under the same `showMobileTabBar && !isPlayPage` flag; tab switch = 0.18s cross-fade.
- `NavigationRail.jsx` (`glass` prop): rail stays mounted but hidden; owns the status picker which opens on `GLASS_STATUS_EVENT` as the mockup-18 glass menu (`.g-status-menu`, scrim, me-lens), plus "Yönetici Paneli" for admins.
- Headers: `ServerSidebar.jsx` (Sohbetler/Gruplar/Arkadaşlar/Aramalar), `servers/ServersSidebar.jsx` (inline "Sunucular" + "+" menu: create/join/folder/reorder, "Tamam" while reordering), `activity/ActivitySidebar.jsx`.
- `shell.css`: list pages full-screen on the ambient, rail hidden, content `padding-top` by header variant (`.g-head-search|sub|title|inline ~ .sidebar-content`), bar hidden on `html.kb-open`, narrow-width tab type, Stage-3 `.g-peer*` contract.
- Tests: `components/layout/glass/navInventory.selftest.mjs` (every rail/header action reachable in glass), `lib/edgeSwipeBack.selftest.mjs` updated.

## 6. Stage 3 DM header rule (admin badge + long names)

The glass conversation header (mockup 03: back `cbtn` 48 · `.peer` capsule (avatar + name + status) · `bgroup`) MUST use the classes already defined in `shell.css`: `.g-peer` (flex 1, min-width 0) › `.g-peer-text` › `.g-peer-name` (flex, nowrap) › `.g-peer-name-text` (nowrap + ellipsis, never `overflow-wrap:anywhere`) + inline `AdminBadge` (`.dsc-admin-badge--inline`, icon-only ≤430pt) and `.g-peer-status` below. Test with `AYSE_ADMIN=1 AYSE_USERNAME=ayse_uzun_kullanici_adi AYSE_NAME="Ayşe Nur Karadenizlioğlu"` at 375 and 440: name on one line, badge visible, no letter-per-line. Same in group headers and profile rows.

## 7. Release / version policy (AGENTS.md)

1. `git pull --rebase --autostash`.
2. Next free version: `git ls-remote --tags origin | grep -o 'v2\.9\.[0-9]*$' | sort -V | tail` — **other agents (e.g. Electron releases) also tag**, never reuse.
3. `node frontend/electron/sync-version.cjs X.Y.Z` and set **both** `"version"` fields in `frontend/package-lock.json`.
4. Selftests (`find frontend/src frontend/scripts frontend/electron frontend/backend -path "*/node_modules" -prune -o -name "*.selftest.*" -print`, run each with node; 5 pre-existing failures: AdminPanel.analytics, AppLayout.view-transition, Skeleton, useCall, frontend/backend/routes/sitemap) + `cd frontend && npm run build:prod` (includes perf budget).
5. `git add` specific files only; commit as `Demir Sarp Kurtlar <87864665+DemirSarpKurtlar@users.noreply.github.com>`.
6. `git push origin main`, then `git tag vX.Y.Z && git push origin vX.Y.Z` → triggers **iOS TestFlight** and **Publish Descall release** (Windows/Electron); main triggers Vercel, Render, Marketing quality gates. Wait and confirm all green.
7. Give Demir a **Turkish TestFlight checklist** per stage (template: uygulama-plani.md §3 "Kontrol listesi").

## 8. Gotchas

- Glass branches must render the exact old JSX when off (context null / `useGlassUi()` false). Prefer separate glass CSS files under `styles/glass/`, scoped `html.glass-ui …`.
- `position: fixed` inside transformed drawers (`.app-sidebar-shell`) is relative to the drawer.
- Rows are `<button>`s (UA `text-align:center`) — glass lists set `text-align:start`.
- Playwright tap leaves the mouse where it was → hover popovers in screenshots are artefacts.
- Port 3000 on the shared box belongs to another agent; use 31xx/32xx for mocks.

## 9. Stage 2 results (2.9.154)

- Compare @3x (geometry ±1pt pairs · chrome pixel Δ>8 / Δ>32): 02-chats 25/25 · 0.67% / 0.56%; 02b-groups 25/25 · 0.68% / 0.56%; 09-friends 25/26 · 0.91% / 0.79% (tab label "Arkadaşlar" 1.27pt narrower: Inter build difference); 11-servers 19/19 · 0.51% / 0.43%; 19-calls 20/21 · 3.89% / 1.13% (title/sub glyph rendering, same font cause); 20-activity 23/23 · 0.84% / 0.63%; 18-status 24/24 · 2.83% / 0.61%.
- Zero-diff (22 desktop/web/Electron/Android/iPad/iPhone-glass-off scenarios): 0 px, DOM identical. Exception: 3 friends/calls scenarios differ only by the mock-server port in the invite link (localhost:3200 vs :3201): a harness artifact (when the port is normalised they are identical). For Stage 3+, start before/after on the same port one after the other, or normalise `localhost:\d+` in zero-diff.mjs.
- Selftests: 77 pass + the 5 known pre-existing failures. `npm run build:prod` ok (perf-budget ok).
