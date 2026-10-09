# Liquid Glass — progress log

## Stage 3 — Sohbetler, DM, gruplar, mesaj menüsü, ek, composer, duyurular · 2.9.155

iPhone-only (`html.glass-ui`). Desktop, web, Electron, Android and iPad stay on the previous UI.

### Compare (440×956 @3x)

Geometry measured against `final/src/glass.css`. Shotkit names, previews and avatars are fixture data, so full-frame pixel % is not the acceptance number. Boxes below are in points.

| Screen | Result |
|---|---|
| 02 chats | Row 16×247×408×76, avatar 56, name line 22, preview line 19. Unread badge `#587AF6`, muted badge `rgba(255,255,255,0.18)`. |
| 02b groups | Row 16×247×408×89, squircle avatar, member stack 20pt. Shotkit has one group. |
| 03 DM | Back 12,60,48. Peer capsule 68,60,166×48. Action capsule 242,60,186×48 (five 36pt buttons). Composer plus 52 at y880, field 356×52. Other bubbles start at x60; own bubbles end at x426. |
| 04 menu | Emoji bar 296×56, menu 250×252.5, radius 26. Vertical position follows the pressed bubble. |
| 05 attach | Sheet 12,664,236×196, radius 30. Items at y672 / 732 / 792: Görsel Yükle, Dosya Yükle, GIF Gönder. |
| 16 announcements | Sheet from top 14%, inset 14, title “📢 Duyurular”. |

Long name + admin (`Ayşe Nur Karadenizlioğlu`, shield): one line with ellipsis at 440 and at 375. At 375 the header tightens to 44pt so the shield stays inline.

Side by side (mockup | app):

- `docs/glass-redesign/compare/stage3-02-chats-side-by-side.png`
- `docs/glass-redesign/compare/stage3-02b-groups-side-by-side.png`
- `docs/glass-redesign/compare/stage3-03-dm-side-by-side.png`
- `docs/glass-redesign/compare/stage3-04-menu-side-by-side.png`
- `docs/glass-redesign/compare/stage3-05-attach-side-by-side.png`
- `docs/glass-redesign/compare/stage3-16-announcements-side-by-side.png`

Known, not style bugs: Chrome has no SF Pro (both sides fall back; the app ships its own Inter, so glyph widths differ). Sample copy and avatars. One group in the fixture. Menu y follows the live message. Announcement badge has no API count. Open-swipe, light theme, a colored theme, Reduce Transparency, Increase Contrast and glass-lite were checked in CSS (tokens + `a11y-solid` / `a11y-contrast` / `--g-blur`) and not re-shot as full frames.

### Zero-diff

Glass off, synced mock servers. 0 px and identical DOM on desktop, mobile web, Electron, Android, iPad, groups, and iPhone with `descall:glass=0`.

Friends and calls differ only by the mock port inside the invite link (`localhost:3101` vs `localhost:3110`): 250–262 px. After normalising `localhost:\d+` the DOM matches. `glass-ui` was absent on every scenario.

### Tests

78 selftests pass. The five pre-existing failures are unchanged: Skeleton, AppLayout.view-transition, AdminPanel.analytics, useCall, sitemap. `npm run build:prod` perf-budget ok (marketing first-paint 202 KB / 220 KB). Styles gzip 106.72 KB.

### CI

Commit `b78b715`. Tag `v2.9.155` is pushed with this stage. CI results are filled in after TestFlight, the Windows release, Vercel, Render, and the quality gates finish.

### TestFlight kontrol listesi (Demir)

Sürüm **2.9.155**. Yalnız iPhone. Başka bir temada da bir kez dene.

- [ ] Sohbetler satırları: avatar 56, isim tek satır, önizleme, saat, okunmamış mavi rozet. Sessiz sohbette rozet soluk.
- [ ] Satırı sola kaydır: Sabitle (turuncu), Sessiz (mor), Okundu (mavi), Kapat (kırmızı). Parmakla birebir gider; hızlı fırlatınca açılır, ters bırakınca kapanır. Snap anında titreşim.
- [ ] Gruplar: yuvarlatılmış kare avatar, üye yığını, “N üye”.
- [ ] DM başlığı: geri · avatar + isim + “Çevrimiçi” · Ara, Sabitle, Ses, Görüntülü, Engelle. Uzun isim + yönetici kalkanı tek satırda, harf harf kırılmaz (375 ve büyük iPhone).
- [ ] Mesaja dokununca menü açılmaz. Basılı tutunca (hemen basış tepkisi, tetikte titreşim) menü balondan çıkar: 👍❤️😂😮😢, Yanıtla, Sabitle, Düzenle, Daha fazla tepki, Sil. Başkasının mesajında Düzenle/Sil yok, Şikayet var.
- [ ] Balonu yana kaydırınca yanıtla.
- [ ] + menüsü yalnız Görsel Yükle, Dosya Yükle, GIF Gönder. GIF seçici açılır.
- [ ] Sesli mesaj kaydı ve oynatma, “düzenlendi”, sabitlenmiş, “Yeni mesajlar”, yazıyor…
- [ ] Klavye açıkken composer klavyenin üstünde kalır.
- [ ] Duyurular: “📢 Duyurular”, zil, göreli süre.
- [ ] Masaüstü / web / Android aynı eski görünümde.
