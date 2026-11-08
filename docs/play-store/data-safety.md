# Google Play Data safety form (draft)

Play Console > App content > Data safety. Derived from what the app actually does, from these
sources (keep them in sync when this changes):

- Privacy policy: `frontend/src/legal/legalContent.js` (`PRIVACY_CONTENT`), served at https://descall.com/privacy
- iOS privacy manifest and its comment: `frontend/ios/App/App/PrivacyInfo.xcprivacy` (same data, App Store labels)
- Analytics gating: `frontend/src/site/analytics.js`; push: `frontend/src/lib/nativePush.js`, `frontend/backend/lib/fcm.js`

Play's definitions: "collected" = sent off the device; transfers to service providers that
process data on Descall's behalf (Supabase, Render, Resend, Firebase Cloud Messaging, LiveKit,
TURN relays, PostHog, Sentry) are NOT "sharing". Nothing is sold. No advertising SDK is in the
Android build.

## Overview answers

| Question | Answer |
|---|---|
| Does your app collect or share any of the required user data types? | Yes |
| Is all of the user data collected by your app encrypted in transit? | Yes (HTTPS/TLS and WSS only; `usesCleartextTraffic="false"`) |
| Do you provide a way for users to request that their data is deleted? | Yes: in-app Settings > delete account (14-day deletion period), or email contact@descall.com |
| Delete account URL (required field) | https://descall.com/privacy (sections 7 and 9 describe deletion). A dedicated "delete your account" web page is better; see README follow-ups. |
| Independent security review | No |
| Committed to the Play Families Policy | No (the app is 13+, not designed for children) |

## Data types

"Optional" = the user can use the app without providing it. "Ephemeral" = processed in memory
only, never stored.

| Play category > type | Collected | Shared | Ephemeral | Required / optional | Purposes | What it is in Descall |
|---|---|---|---|---|---|---|
| Personal info > Name | Yes | No | No | Required | App functionality, Account management, Analytics | Username and display name (PostHog identify) |
| Personal info > Email address | Yes | No | No | Optional | App functionality, Account management, Developer communications, Analytics | Optional account email: verification, 2FA, security mails, opt-in product-update list; sent to PostHog identify when set |
| Personal info > User IDs | Yes | No | No | Required | App functionality, Account management, Analytics | Account id, username |
| Personal info > Other info | Yes | No | No | Required | App functionality | Birth date for the age gate (13+) |
| Location > Approximate location | Yes | No | No | Required | App functionality, Analytics | Sign-up country from the edge IP-country header; PostHog GeoIP. No GPS, no location permission |
| Messages > Other in-app messages | Yes | No | No | Required | App functionality | DMs, group and server messages, reactions, pins |
| Photos and videos > Photos | Yes | No | No | Optional | App functionality | Avatar, banner, image attachments |
| Photos and videos > Videos | Yes | No | Yes for live call video, No for attachments | Optional | App functionality | Video attachments; camera video in calls is relayed live (LiveKit/TURN) and never stored |
| Audio > Voice or sound recordings | Yes | No | Yes for live call audio, No for voice messages | Optional | App functionality | Voice messages the user sends; call audio is relayed live and never stored |
| Files and docs > Files and docs | Yes | No | No | Optional | App functionality | File attachments |
| App activity > App interactions | Yes | No | No | Optional (analytics consent) / Required (presence) | Analytics, App functionality | PostHog and first-party product events (only after consent, never for accounts under 16); online presence |
| App activity > Other user-generated content | Yes | No | No | Optional | App functionality | Profile bio and status, server/channel names and topics, user reports and feedback |
| App activity > Other actions | Yes | No | No | Required | App functionality | Block list, friend requests, DesCoin activity counters (anti-cheat, see privacy policy section 7) |
| App info and performance > Crash logs | Yes | No | No | Required | App functionality, Analytics | Sentry (EU) and PostHog exception events, scrubbed of name, email, message text and tokens |
| App info and performance > Diagnostics | Yes | No | No | Required | App functionality, Analytics | Call connection quality, web vitals, app/OS version, user agent |
| Device or other IDs > Device or other IDs | Yes | No | No | Required | App functionality, Analytics | FCM registration token (push), PostHog anonymous id, first-party analytics visitor key |

Not collected (answer "No"): Financial info (no real-money payments; the DesCoin shop uses
earned virtual coins only), Health and fitness, Contacts, Calendar, Web browsing history,
Precise location, Emails, SMS or MMS, Music files, Other audio files, Installed apps,
Race/ethnicity, Political or religious beliefs, Sexual orientation.

## Points to decide before submitting

- GIF search: the search text and IP go directly from the device to GIPHY when the user
  searches GIFs (privacy policy section 4). Google exempts transfers the user initiates and
  reasonably expects; if you do not rely on that, declare App activity > In-app search history
  as "Shared" with purpose App functionality.
- Google Ads conversion tag: the web build only loads it when `VITE_GOOGLE_ADS_ID` is set and
  the user consented. `frontend/.env.production` does not set it and the Android workflow does
  not either, so the Android app has no ads or ad measurement. If that ever changes, Data safety
  must declare sharing for Advertising or marketing, and the Ads declaration changes too.
- Google Sign-In inside the Android WebView: if you enable it, the Google account email and
  profile are received for Account management (already covered by Name/Email above).
- The Data safety answers must stay identical to the privacy policy. Update both together.
