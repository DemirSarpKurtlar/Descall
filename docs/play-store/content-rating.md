# Content rating questionnaire (IARC) and other App content forms (draft)

Play Console > App content. Answers follow the App Store age rating already in use
(`appstore/age-rating.json`: 13+, user-generated content and messaging = yes, everything
else none).

## Content rating (IARC)

- Email address for IARC: contact@descall.com
- Category: **Social / Communication** ("Social networking, forums, blogs and user-generated
  content sharing" if offered; the app is a chat, voice/video call and community app).

| Question (short form) | Answer | Note |
|---|---|---|
| Violence (any kind, realistic or fantasy) | No | The app itself has no such content |
| Fear / horror | No | |
| Sexuality, nudity, sexual references | No | Prohibited by the Terms; users can report |
| Language: profanity or crude humour in the app's own content | No | User messages are user content; profanity is masked with *** |
| Controlled substances (drugs, alcohol, tobacco) | No | |
| Gambling, simulated gambling, real-money betting | No | DesCoin is earned, cannot be bought or cashed out |
| Loot boxes / paid random items | No | |
| Does the app allow users to interact or exchange content? | **Yes** | DMs, group chats, servers, voice/video calls, media sharing |
| Does the app share the user's current physical location with other users? | No | |
| Does the app allow users to purchase digital goods? | No | No in-app purchases or real-money payments |
| Unrestricted internet access (web browser / search engine) | No | Links open in the system browser |
| Is the app a web browser or search engine? | No | |
| Does the app contain content promoting or depicting crime? | No | |

Expected result: around PEGI 12 / ESRB Teen / USK 12 with the "Users Interact" interactive
element. Keep whatever IARC returns; do not try to lower it.

## Target audience and content

- Target age groups: **13-15, 16-17, 18 and over**. Not under 13 (Terms and privacy policy:
  13+, under-13 accounts are closed).
- Appeals to children: No. Store listing and graphics must not target children.

## Other App content declarations

| Form | Answer |
|---|---|
| Privacy policy | https://descall.com/privacy |
| Ads | No, the app does not contain ads |
| App access | All functionality needs an account: give App Review a demo username and password (the same kind of review account as `ASC_DEMO_USERNAME` for Apple, never committed) and say "Sign in with username and password on the first screen" |
| Government app | No |
| Financial features | None |
| Health | No |
| News app | No |
| Data safety | See `data-safety.md` |
| Foreground service permissions | Types used: **microphone** and **mediaPlayback** (`CallForegroundService`). Description: "During an active voice or video call the app keeps the microphone and call audio running while the user switches to another app or locks the screen. The service starts when a call connects and stops when the call ends; an ongoing notification is shown the whole time." Attach a short video: start a call, press Home, show the ongoing notification, keep talking, return and hang up. |
| Full-screen intent | Not declared (the app does not request `USE_FULL_SCREEN_INTENT`) |
| User-generated content policy | In-app: report messages and users, block users, profanity masking, server moderation tools (kick, ban, timeout, delete). Terms: https://descall.com/terms |
