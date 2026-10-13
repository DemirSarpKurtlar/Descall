# Descall Public Site (signed-out) — Liquid Glass design notes

Scope: every public route of descall.com (see `feature-inventory-public.md`), **36 frames × 2 breakpoints**
(`<frame>-desktop.png` 1440 px wide, full page height; `<frame>-mobile.png` 390 px wide, full page; @2x). Overlay frames
(auth modal, sheet, cookie banner, invite/confirm cards) are viewport captures 1440×900 / 390×844. `overview.png` = contact sheet.
Visual system = the approved desktop/web set (`../desktop/`, `docs/glass-redesign/desktop/`) — `src/public.css` **@imports
`../../desktop/src/desktop.css` unchanged**, so tokens, the glass material, avatars, chips, toggles, buttons are byte-identical.
Logo: original `frontend/public/brand/descall-icon.png` (verified identical). Footer: “© 2026 Demir Sarp Kurtlar.”
Language: EN routes rendered in EN (`/tr/*` mirrors use the same layout with `tr.js` strings — `17-turkey` shows TR copy fitting the layout).

## 1 · Tokens (shared with the app — do not fork)

| Token | Value | Use on the site |
| --- | --- | --- |
| `--brand` / `--brand-hi` | `#587AF6` / `#8FA6FF` | primary CTA gradient (`.tint-brand`), links, active lens, focus ring |
| `--deep` | `#0D0E13` | page base under the ambient scene |
| `--t1…t4` | white .96 / .72 / .50 / .30 | headings / body / meta / disabled |
| `--ok --idle --red --gold` | `#30D158 #FFD60A #FF453A #FFC94D` | status pulse, errors, cookie icon |
| `--font` | SF Pro Text → Inter → Segoe UI Variable | body; `--font-display` (SF Pro Display → Inter) for H1/H2 |
| radii | panel 24 · card 18 · tile 22 · section 32 · modal 32 · capsule = h/2 | |
| spacing | 8 pt grid; page gutter 40 (desktop) / 16 (phone); content max 1200 | |
| Site-only | `--maxw 1200` `--pad 40/16` `--hdr 64/56` `--r-section 32` `--r-tile 22` | new, layout only |

**Material ladder (same as app):** `glass` (header capsule, tiles, FAQ, tables) → `glass.panel` (footer, big bento sections, TOC) →
`glass.heavy` (modals, invite cards, featured tiles, status card, cookie banner) → `glass-chip` (nav segment, kicker, crumbs,
language toggle, inputs rows) → `lens` (active nav item / segment). Each has the 3-layer build: 1 px specular mask edge (`::before`),
inner refraction highlight (`::after`), soft drop shadow.
**Ambient scene:** the app’s blue/violet light pools, re-tiled every 1500 px (`.site-bg::before`, `background-size:100% 1500px`) so long pages
keep colour for the glass to pick up; faint 32 px dot grid fades out after the first viewport (inherits the old site’s `.mkt-grid`).

## 2 · Type scale (site)

| Role | Desktop | Phone | Weight / tracking |
| --- | --- | --- | --- |
| Hero display (Home, Download) | 76 / 1.0 (Download 68) | 50 | 750 · −0.045em · white→`#b9c6ff` vertical gradient text (`.grad`) |
| Page H1 | 56 / 1.05 (SEO hero 52) | 38 | 740 · −0.04em |
| Section H2 | 40 / 1.1 | 29 | 720 · −0.034em |
| Card H3 | 18 / 1.3 | 17 | 680 · −0.02em |
| Lead | 19 / 1.55 | 17 | 400 · `--t2` · max 680 px |
| Body / prose | 16.5 / 1.7 | 15 | 400 · `--t2` · max 760 px |
| Eyebrow | 12 · UPPERCASE | 12 | 700 · +0.08em · `--t3` |

## 3 · Layout & responsive rules

Breakpoints: **≥1025 desktop**, **601–1024 tablet**, **≤600 phone** (render targets 1440 and 390).
- **Header** = sticky floating glass capsule, 16 px from top, 64 px tall, max 1200. Desktop: logo+Beta · nav segment (lens on active) · TR/EN · Sign In (ghost) · Start free (brand) · Download (soft). ≤1024: nav + desktop actions hide → **Start free (small) + menu button** (glass-chip circle 44); menu opens a `glass.heavy` sheet below the capsule (frame 31) with scrim.
- **Hero**: 2-col grid `0.9fr / 1.25fr` (SEO + Download `1fr / 1.05fr`), min-height 640, preview device tilted `rotateY(-9deg) rotateX(3deg)` with a brand halo and 2 floating glass chips (Home only). ≤1024 one column, device flat; ≤600 CTAs full-width stacked (52 px), floating chips hidden.
- **Grids**: g3 / g4 / g2 → g4 becomes 2-col ≤1024; all 1-col ≤600 where tiles switch to icon-left rows (`grid-template-columns:44px 1fr`).
- **Bento sections** (`.panel2.split`): copy + screenshot side-by-side → stacked ≤1024.
- **Tables** (compare): glass container, Descall column tinted brand 8–12 %; ≤600 horizontal scroll inside the glass (min-width 520) — never shrink text below 13.5.
- **Legal**: summary cards (3-col → 1-col), **sticky TOC** 280 px left (`glass.panel`, current item = brand tint, driven by the existing IntersectionObserver) → hidden ≤1024; each section is its own glass card with a coloured squircle icon; the “Your rights” section gets a brand outline.
- **FAQ**: sticky left column (H1, lead, group navigator with counts, Contact) + accordions right → single column ≤1024 (navigator hidden on phone).
- **Modals**: centered 440–460 px `glass.heavy` over scrim (`rgba(5,6,10,.52)` + blur 8). **≤600 they become bottom sheets** (radius 34 top, grab handle, safe-area padding 34).
- **Footer**: one `glass.panel` slab, brand + email capture left, 3 link columns right → phone: stacked, link columns 2-up, Company list in 2 CSS columns.
- **Cookie banner**: floating glass pill bottom-center 560 → phone: full-width card, two equal buttons.

## 4 · Motion specs (Apple fluid principles: interruptible, physical, quick)

| Interaction | Spec |
| --- | --- |
| Hover (buttons, tiles, pills, nav) | tint +4–6 % brightness, 120 ms ease-out; tiles lift `translateY(-2px)` + shadow +20 % |
| Press | `scale(.97)` spring (stiffness 500, damping 32) — same as app |
| Nav lens | lens slides between items: spring 0.35 s, `cubic-bezier(.2,.8,.2,1)`; never cross-fade |
| Header on scroll | after 24 px scroll: capsule tint +0.04, shadow +, height 64 → 56 (200 ms); stays sticky |
| Hero entrance | copy: opacity 0→1 + y 12→0, 420 ms, 60 ms stagger (kicker, H1, lead, CTAs); device: y 24→0 + rotateY −14→−9°, 600 ms spring |
| Scroll reveal | sections fade/translate 16 px when 15 % visible, 360 ms, once; no parallax beyond the device tilt (±2°, follows pointer on desktop only) |
| FAQ accordion | height auto via grid-rows 0fr→1fr 260 ms spring, chevron rotate 180°, opened row gets `rgba(255,255,255,.04)` |
| Modal | scrim 0→1 180 ms; dialog scale .96→1 + opacity, 280 ms `cubic-bezier(.16,1,.3,1)` (same curve as `GroupInviteLanding`); phone sheet slides from bottom, drag-to-dismiss with velocity > 600 px/s |
| Auth step change (login → forgot → code) | content cross-slide 16 px + height morph 240 ms; dialog never re-mounts |
| Status pulse | 2 s breathing ring on `.pulse` (paused when reduced motion) |
| Reduced motion | all springs → 120 ms opacity; no tilt, no reveal translate, pulse static |

## 5 · Per-page implementation notes (map to existing components — no new features)

- **MarketingLayout.jsx** → replace `.mkt-header` with the capsule (`glass` + `.navseg.glass-chip` + `lens` on `NavLink` active); keep `LanguageToggle`, CTA handlers, mobile menu state. Footer markup can stay; restyle with `.foot-panel.glass.panel`. Keep `EmailCapture` states (style success/error with `.okb` / `.err`).
- **SeoProductPreview.jsx** → render `<img>` of the approved app mockups (webp in `public/brand/previews/`, `loading="lazy"` except home hero `fetchpriority="high"`, explicit width/height to keep CLS 0) inside `.device.glass`; keep `figcaption` and `aria-label`. Map `mode`: chat → `02-dm`, servers → `06-server`, call → `09-server-voice`, lfg → `06-server`.
- **HomePage / FeaturesPage / MarketingDownloadPage** → `.mkt-feature` → `.tile2.glass` + coloured `.ico` squircle (colour per icon, list in mockups). Feature `to` links keep `.mkt-feature-link` behaviour with a “Learn more ›” affordance.
- **Download**: platform tabs become two selectable glass cards (`role=tab`, selected = `lens` + check badge); version line keeps the three states; add App Store badge component behind `import.meta.env.VITE_APP_STORE_URL` (render nothing when unset). Trust list → glass pills.
- **FaqPage** → keep `<details>/<summary>` (SEO + a11y); style summary as `.qa .q`, add the sticky group navigator (anchor links to each `mkt-faq-group`).
- **SeoLandingShell** → hero becomes 2-col when `heroExtra` exists; breadcrumbs → `.crumbs.glass-chip`; FAQ → glass accordion; bottom CTA → `glass.heavy` panel with logo and radial brand light.
- **CompareDiscordPage / DiscordAlternativePage** → `.mkt-table` inside `.tbl.glass`; tint Descall column; verdict → heavy glass callout with green check.
- **AlternativesPage** → option cards; Descall card (`highlight: true`) = `glass.heavy` + brand outline + logo, no extra label.
- **Legal (`LegalDocument.jsx`, `legal-doc.css`)** → hero, “At a glance” cards (`.brief a.glass`), sticky TOC (`.toc.glass.panel`), section cards (`.lsec.glass`), contact card heavy. Same component powers `LegalContentModal` in the auth flow — share the CSS.
- **Status** → `.stat.glass.heavy` with pulse colour per state (ok green / checking grey / degraded amber / unreachable red); list → `.dl` rows.
- **About / Who owns / Contact / Security** → prose max 760–860, info lists as `.dl.glass` rows with squircle icons; keep the exact ownership sentences (they are SEO/LLM-critical).
- **Blog** → cards (`.post-card.glass`), first card spans 2 columns (`feat`); post page = 780 px column, body in one glass sheet; keep JSON-LD.
- **MarketingAuthModal** → `glass.heavy` dialog (radius 32), white Google button (Google brand rules), inputs `.fi` (inset dark well, focus ring `#8FA6FF` 1.5 px + 5 px halo), password strength = existing `PasswordStrength` restyled to 4 segments; 2FA + reset code as 6 single-digit cells over the existing single `<input>` (keep one real input with `autocomplete="one-time-code"`, cells are visual). Phone = bottom sheet.
- **GroupInviteLanding / ServerVanityLanding** → centered `glass.heavy` card 460 on the ambient scene, target in a `glass-chip` well; keep framer-motion entrance (already the spec curve).
- **marketingOptIn.pageHtml** (server HTML) → tiny inline-CSS version of `.plain-card` (no JS, no external CSS needed: dark bg + one card, icon, H1 “Descall”, sentence, “Go to descall.com”, © line). Keep `escapeHtml`.
- **sitemap.html** (Express) → same inline-CSS card grid grouping the existing link list by section.
- **CookieConsentBanner** → floating heavy-glass pill; Reject and Accept equal weight (consent rule: Reject as easy as Accept).

## 6 · Performance (public site = first impression, often low-end phones)

- Max ~6 live `backdrop-filter` layers per viewport: header, 1–2 hero chips, device frame, cookie banner, modal. Tiles below the fold use the **static fallback**: same tint at ×2 opacity + specular edge, `backdrop-filter:none` — visually identical on the flat ambient background and much cheaper. Switch with an IntersectionObserver class or simply apply blur only to `header, .glass.heavy, .device`.
- Ambient = CSS gradients only (no images). Screenshots as webp (q≈86, 2880×1800 → serve 1440 w + `srcset` 2x).
- `prefers-reduced-transparency: reduce` → opaque fallback (`rgba(24,26,36,.92)`), keep edges. Text never sits directly on the ambient without a glass or dark well.
- Prerender (`site/seo/prerenderCopy.js`) markup must keep the same H1/lead so the swap from `#seo-static` is invisible; give the static shell the same background colour `#0D0E13` to avoid a flash.

## 7 · Accessibility

Contrast as in the app set (t1 ≥12:1, t2 ≥7:1, brand-on-white CTA text ≥4.5:1). Focus ring `0 0 0 2px #0d0e13, 0 0 0 4px #8FA6FF` on every link/button/summary.
Header capsule keeps landmark `nav[aria-label="Primary navigation"]`, `aria-current="page"` on the lens item. Accordions stay native `<details>`.
Modal: `role=dialog`, focus trap, Esc closes, close button `aria-label="Close"`; sheet grab handle is decorative. Tables keep `<th scope>`.
Touch targets ≥44 px on phone (buttons 44–52, nav rows 56).

## 8 · Files & reproduction

```
public/
  src/public.css          site layout (imports ../../desktop/src/desktop.css)
  src/shared.mjs          header capsule, footer, helpers, copy-cleaning (no VALORANT/Riot), App Store badge
  src/screens-a.mjs       Home, Features, Download, FAQ, Security, Status, About, Who owns, Contact, 404
  src/screens-b.mjs       SEO shell pages, Turkey, Blog, Blog post, Privacy/Terms/Copyright (data from repo files)
  src/screens-c.mjs       auth modal states, forgot/2FA/social, invite + vanity, confirm/unsubscribe, sitemap, cookie, mobile menu
  src/build-screens.mjs   → src/screens/*.html (fails on brand-rule violations)
  render.mjs              Playwright → <frame>-desktop.png / <frame>-mobile.png (@2x, full page)
  tools/overview.mjs      → overview.png
  data/legal.json, data/seo.json   content dumped from the repo (legalContent.js, discordSeoContent.js, nicheLandings.js)
  assets/brand, assets/shots       Konsept 2 logo; approved desktop mockups (webp) used as product previews
```
`node src/build-screens.mjs && node render.mjs [frame…] [--desktop|--mobile] && node tools/overview.mjs`

**Repo layout** (`docs/glass-redesign/public/`): `mockups/<frame>-desktop.webp` + `mockups/<frame>-mobile.webp` (31-mobile-menu is mobile-only), `overview.webp`,
plus the sources above. `src/screens/*.html` open directly in a browser from the repo (they resolve `../public.css` → `../../desktop/src/desktop.css` and `../../assets/`).
The screen builders read copy straight from a repo checkout at `/workspace/Descall/frontend/src/…` (faqData, ownershipFacts, blogBodies) — adjust that path to rebuild elsewhere.

**AGENTS.md note for the implementer:** “The public download page must offer only Windows and Android APK latest-release assets; do not list macOS or Linux.”
The App Store badge is for the iOS app (not a desktop build) and was requested by the owner; ship it behind `VITE_APP_STORE_URL` so nothing renders until the listing URL exists.
Implementing these mockups is a UI change → per AGENTS.md release policy it needs a **patch** bump + tag when shipped (this docs-only commit does not).
