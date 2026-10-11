# Descall — Public (signed-out) pages: content inventory

Source of truth: `frontend/src/site/**` (React Router in `MarketingApp.jsx`), `frontend/src/App.jsx` (invite / vanity landings),
`frontend/src/components/auth/*`, `frontend/src/legal/legalContent.js`, `frontend/backend/server.js` + `lib/marketingOptIn.js`
(confirm / unsubscribe HTML) and `frontend/backend/routes/sitemap.js` (`/sitemap.html`).
Live check (2026-10-12 01:30 TRT): every route below answers **200** on https://descall.com (Cloudflare → Vercel project `descall`,
`frontend/vercel.json`: Vite build `npm run build:prod`, `dist/`, host/HTTP→HTTPS + legacy 301s; SPA prerender bodies in `site/seo/`).
Electron and the native iOS/Android shells never show these pages (logged-out desktop = `AuthView`, already covered in `../desktop/01-login`).

**Copy rules applied in every mockup** (only deltas from the live copy):
- No VALORANT / Riot: “Valorant LFG” → “LFG”; “Gaming, Valorant, Community…” → “Gaming, Community…”; sentences that name Riot ID are dropped
  (e.g. FAQ “Does Descall support LFG?” keeps “The Play tab lets you create and join LFG lobbies.”). TR: “Valorant partileri” → “oyun partileri”.
  The build script fails if any rendered text still contains valorant / riot / dimaai.
- No DimaAI (already 301 → `/`), no call-recording feature (Security keeps the factual “Descall never records…” statement).
- Footer copyright line: “© 2026 Demir Sarp Kurtlar.” + existing ownership / rights / last-updated sentence.
- App Store badge: only on **Download** (hero), reserved for the planned iOS listing; the repo/site has no App Store URL yet → hide the badge until `APP_STORE_URL` is set.
- Product preview: the decorative `SeoProductPreview` boxes are replaced by the approved desktop glass mockups (`../desktop/02-dm`, `06-server`, `09-server-voice`) inside a glass device frame — same caption text.

## Shared chrome (MarketingLayout)
- Header: logo (`/brand/descall-icon.png`) + “Descall” + **Beta** chip (title = status note) · nav **Features / Download / FAQ** · TR/EN toggle · **Sign In** · **Start free** · **Download** · mobile menu toggle (≤1024).
- Mobile menu: Features, Download, FAQ, Sign In, Start free, Download link, “Language” + TR/EN.
- Footer: brand + Beta + “Demir Sarp Kurtlar · Türkiye”; **Product** (Features, Download, FAQ); **Explore** (Discord alternative, LFG, vs Discord, Turkey, Blog, Status, Sitemap); **Company** (About, Who owns Descall?, Security, Contact, Privacy Policy, Terms, Copyright, GitHub); language toggle; **EmailCapture** “Product updates” / “Get occasional release notes — no spam, unsubscribe anytime.” / you@example.com / Notify me (states: Sending…, “Check your inbox to confirm…”, “Enter a valid email”, mailto fallback); trust line “Status: Beta · Transport security: TLS / DTLS-SRTP · Live status · Security details”; contact@descall.com; © line.
- Cookie banner (first visit): “Cookie preferences” · “Optional analytics only. Essentials stay on.” · Privacy · Reject · Accept.
- Auth modal (`MarketingAuthModal`) opens over the current page from any Sign In / Start free CTA, `/login`, `/register`, `?auth=`, `?ref=`.

## Pages

| # | Route(s) | Mockup | Existing content kept |
|---|---|---|---|
| 01 | `/`, `/tr` (TR mirror) | `01-home` | Kicker “Beta · Voice · Servers · LFG”; H1 **Talk together**; lead “A lighter home for friends and squads — real servers, HD calls, screen share, and LFG.” (A/B `hero_cta_variant` may swap CTA/sub); CTAs Start free, Download Desktop; preview caption; **Why Choose Descall?** + lead + 6 highlights (Servers & channels, Roles & permissions, Advanced templates, Real-time Chat, Voice & video, Screen share); CTAs Create free account / Compare with Discord / See all features; **Servers ready to run** + lead + 3 points (Channels that match the job, Roles that actually work, Voice built into the server); CTAs Explore server features / For communities; “Keep exploring” links (SEO_DEFAULT_RELATED). |
| 02 | `/features`, `/tr/features` | `02-features` | Breadcrumb; kicker Product; H1 “Features of a modern Discord alternative”; lead; 12 feature cards (Servers & channels, Roles & permissions, Templates that ship ready, Real-time messaging, Voice chat, HD video calls, Screen share quality, LFG → link card, Friends & presence, Moderation tools, Desktop & Android, Optional cosmetics); CTAs Download / Discord alternative / FAQ; “Explore by use case”. |
| 03 | `/download`, `/tr/download` | `03-download` | Kicker “Download · {vX available / Checking for updates… / Latest release}”; H1 Download Descall; lead; CTA Download for Windows / Download APK (platform), Start free, Open the web app; platform panel Windows `Descall-Setup.exe` / Android `Descall-APK.apk` + version line; trust chips TLS · Free · Web · Windows · Android · GitHub · Beta; Why Choose Descall? + 4 features (Real-time Chat, Voice Messages, Video Calls, Group Chats); checklist (No Nitro paywall…, Servers, roles, channels, and LFG, Discord alternative); CTAs; Keep exploring (SEO_PILLARS). **+ App Store badge (planned).** |
| 04 | `/faq`, `/tr/faq` | `04-faq` | H1 FAQ; lead; 4 groups (Product 7, Servers & LFG 4, Download & accounts 3, Support 1) from `faqData.js`; Contact button. |
| 05 | `/security`, `/tr/security` | `05-security` | H1 Security at Descall; lead; Transport encryption (not default E2E); Voice & video; Accounts; Report an issue (email + GitHub). |
| 06 | `/status` | `06-status` | Breadcrumb; kicker Status; H1 Descall service status; status note + Last updated; live card **API / realtime**: Checking… / Operational — API reachable / Degraded — HTTP n / Unreachable from this browser — Timed out·Network error; list Product stage Beta, Transport security, Operator, Support, GitHub; links Security details · Contact. No uptime numbers. |
| 07 | `/privacy` (`/privacy-policy` →) | `07-privacy` | LegalDocument: kicker Descall, title, “Last updated: October 10, 2026”, intro, **At a glance** summary cards, sticky TOC (14 sections: Data controller … 13. Contact Us), section cards, Contact (“For privacy requests, email: contact@descall.com · Demir Sarp Kurtlar (Türkiye)”). Mockup shows 6 sections in full, rest identical. |
| 08 | `/terms` (`/terms-of-service` →) | `08-terms` | Same LegalDocument; 18 sections (1. Acceptance and Eligibility … 18. General Provisions and Contact); contact “Questions:”. |
| 09 | `/copyright` | `09-copyright` | Same LegalDocument; 2 sections (What a notice must include, Counter-notice); contact. |
| 10 | `/about`, `/tr/about` | `10-about` | Beta badge + status note; H1 About Descall; ownership answer; independence lead; Who owns Descall? + “Read the ownership record”; Operator list (Product, Owner / founder / CEO, Based in, Support, Source GitHub); What we build; Last updated; CTAs Security / Contact / Download. |
| 11 | `/who-owns-descall`, `/descall-sahibi` (TR); `/founder` `/owner` `/kurucu` `/sahip` → | `11-who-owns` | Kicker Official ownership; H1; “Demir Sarp Kurtlar is the founder, owner, and CEO of Descall.”; ownership statement; Canonical record (Product, Owner/founder/CEO, Exact spelling, Based in, Independent?, GitHub, Contact); 6 FAQ; Turkish record link + About; related links. |
| 12 | `/contact`, `/tr/contact` | `12-contact` | H1 Contact; lead; Support & feedback (email); Operator; Security. |
| 13 | `/discord-alternative` (`/best-discord-alternative` →) | `13-discord-alternative` | SeoLandingShell: breadcrumbs, kicker “Discord alternative · 2026”, H1, lead, Start free / Compare with Discord, preview; Switch in three steps; Why people search… + 6 checklist; 6 pillars; Descall vs Discord at a glance table (18 rows) + link; Who should switch (4); related guides (10); FAQ (5); bottom CTA (Ready to try… / Start free / Download Descall / Explore features). |
| 14 | `/compare/discord`, `/tr/compare/discord` | `14-compare-discord` | Shell; Quick verdict; preview; Feature-by-feature comparison table; Where Descall is the better… (5) / Where Discord still leads (3); How to migrate (5 steps) + guide link; More comparisons; FAQ (8); bottom CTA. |
| 15 | `/alternatives` (`/discord-alternatives` →) | `15-alternatives` | Shell; How to choose (lead + 3 steps); Top Discord alternatives compared (Descall highlighted, Discord, Guilded, TeamSpeak / Mumble, Telegram, Slack + Learn more); Deep dives; FAQ (5); bottom CTA. |
| 16 | `/discord-alternative-for-communities` — same template: `-for-lfg`, `-for-voice-chat`, `-for-friends`, `/apps-like-discord`, `/discord-replacement`; `/best-discord-alternative-for-gamers` (own page, same shell: checklist + link list) | `16-niche-communities` | Shell from `NICHE_LANDINGS[path]`: kicker, h1, lead, Start free / Download, preview; answerTitle + answer; bullets; 3 sections; FAQ; bottom CTA. |
| 17 | `/discord-alternative-turkey` (`/tr/discord-alternative` →) | `17-turkey` | TR copy: kicker, H1, lead, Ücretsiz kayıt ol / Windows / Android indir; Neden Türkiye’de…; Descall ile neler yaparsın? (8); seçerken nelere bak? (3 paragraphs); İlgili sayfalar (5); FAQ TR (8); bottom CTA (TR). |
| 18 | `/blog` | `18-blog` | Shell (no hero CTA): kicker Blog, H1, lead; 9 post cards (date, title, description, tags); bottom CTA. |
| 19 | `/blog/:slug` (9 posts) | `19-blog-post` | Shell: breadcrumbs, kicker tags, H1 title, lead description, Try Descall / Discord alternative, Published / Updated; body sections (BLOG_BODIES); FAQ (BLOG_FAQ_BY_SLUG); Related guides; ← Back to blog. Mockup: `discord-vs-descall`. |
| 20 | `*` | `20-not-found` | 404; “This page does not exist on Descall.”; Home / Download. |
| 21 | `/login`, `/tr/login`, `?auth=login`, any Sign In | `21-login` | Modal: Welcome Back / Sign in to your account; Google button; “or”; Username, Password; Forgot your password?; Sign in; Need an account? Register; error box. |
| 22 | `/register`, `/tr/register`, `?auth=register`, `?ref=user` | `22-register` | Create Account / Join Descall today (or “Join {name} on Descall — free chat, voice, and calls.” + “Invited by @{username}”); Google; “Fastest path…”; Username, Password (+ strength), Date of birth, Email (optional) + hint; Terms consent + zero-tolerance line; Create account; Already have an account? Sign in. |
| 23 | Forgot password (modal step) | `23a/23b/23c` | Forgot your password? / Reset your password with a secure email code; Username or email → Send reset code; code step (6-digit code, New password, Confirm new password, Reset password, Resend code, errors: min 10 chars, mismatch, wait a minute, no email on account); Password updated / You can now sign in…; Back to login. |
| 24 | 2FA after password login | `24-two-factor` | Two-Factor Verification / Enter the code we sent to {email}; Verification code; Verify; Incorrect code.; Back to login. |
| 25 | New Google account (428 `google_signup_required`) | `25-social-signup` | Create Account / Finish creating your account; birth date; Terms consent; Create Account; Back to login. (Web marketing has no Apple button.) |
| 26 | `/invite/:code`, `/i/:code`, `?invite=` (group) | `26-group-invite`, `27b-invite-error` | Descall; You've been invited to join a group; avatar, name, “{count} members”; Already a member banner; Log in to join (logged-out) / Accept invite / Open group; Back / Maybe later; Loading invite… skeleton; Invite not found + Back to Descall. |
| 27 | `/s/:slug` (server vanity) | `27-server-invite` | You've been invited to join a server; icon, name, “{count} members · Already a member”; Not now; Log in to join / Accept Invite / Open server / Joining…; Server not found; Dismiss. |
| 28 | `/api/marketing/confirm`, `/api/marketing/unsubscribe` | `28a/28b/28c` | Server HTML (title Descall + one sentence): “You are confirmed. You can unsubscribe any time.” / “You are unsubscribed. We will not send you product emails.” / “This link is invalid or has already been used.” (TR equivalents). |
| 29 | `/sitemap.html` | `29-sitemap` | Express HTML list of all indexable pages (pages-only; invites/announcements excluded). |
| 30 | Cookie banner (overlay) | `30-cookie-consent` | see Shared chrome. |
| 31 | Mobile menu (≤1024) | `31-mobile-menu` (mobile only) | see Shared chrome. |

Not public pages / intentionally not mocked: `/dimaai*` (301 → `/`), `/app` & authenticated routes (noindex app), XML sitemaps / robots / llms.txt (machine files),
Electron logged-out screen (already `../desktop/01-login`, `01b-register`), announcements (no public landing — `?announcement=` is disallowed in robots).
