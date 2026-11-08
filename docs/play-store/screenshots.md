# Google Play graphics and screenshot plan

Play Console > Grow users > Store presence > Main store listing. The App Store screenshots in
`appstore/screenshots/` show iPhone/iPad UI and status bars and must not be reused: Play
screenshots have to show the Android app.

## Required assets

| Asset | Size / format | Count | Notes |
|---|---|---|---|
| App icon | 512 x 512 PNG, 32-bit, up to 1 MB | 1 | Same artwork as the launcher icon (`frontend/android/app/src/main/res/mipmap-*/ic_launcher*.png`, source `Descall Icon.png`). Full square, Play applies the mask; no extra shadow or rounded corners |
| Feature graphic | 1024 x 500 PNG or JPEG, no transparency | 1 | Logo + one short line per locale (for example "Chat, calls and servers" / "Sohbet, sesli arama ve sunucular"); keep text in the centre safe area, no device frames |
| Phone screenshots | 1080 x 1920 (9:16) PNG or JPEG, up to 8 MB each | 4 to 8 (minimum 2) | Every side 320-3840 px, long side at most 2x the short side. 4+ at 1080 px or more makes the listing eligible for promotion |
| 7-inch tablet screenshots | 1200 x 1920 | optional, up to 8 | Only if the tablet layout is checked |
| 10-inch tablet screenshots | 1600 x 2560 | optional, up to 8 | Same |
| Promo video | YouTube URL | optional | |

## Screens (phone, in this order)

1. **Chats**: DM list with avatars, unread badges and online dots.
2. **Conversation**: a chat with an image, a voice message, emoji reactions and a reply.
3. **Group call**: a group voice/video call with several tiles and the speaking indicator.
4. **Server**: a server with categories, text channels and a voice room showing who is inside.
5. **Voice room**: inside the voice room, camera on for one participant.
6. **Friends and profile**: friends list with presence, plus the profile banner card.
7. **Safety**: block / report menu on a message (supports the UGC policy review).

## Rules

- Captured from a real Android build (debug APK from the Android build workflow is fine) on a
  1080 x 2400 or 1080 x 1920 phone or emulator; crop or pad to 1080 x 1920 without stretching.
- Demo accounts and demo content only: no real user names, avatars or messages.
- Light captions on top are allowed (one short sentence, same font as the App Store set).
  Localise captions for tr-TR and en-US; other locales can reuse en-US screenshots.
- No iPhone frames, no "App Store" badges, no claims like "#1" or "best", no prices.
- Status bar: clean (full battery, no notifications), Android navigation bar visible or
  hidden consistently across all shots.
- Suggested folder when they exist: `docs/play-store/graphics/<locale>/phone/01.png ...`
  (not created yet).
