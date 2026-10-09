# Descall · Liquid Glass FINAL — Tasarım Notları

## Malzeme
- Light-tint cam: `rgba(255,255,255,0.06–0.13)` + `backdrop-filter: blur(26–40px) saturate(190%)`
- Specular rim (`::before` mask gradient) + iç refraksiyon (`::after` inset highlight)
- Floating capsule chrome; scroll-edge fade; soft shadow
- Material weight = hierarchy (heavy sheet / lens / chip)

## Tipografi & grid
- SF/Inter; large title −0.026em; 8pt grid
- Safe: Island altı chrome y=60; tab/composer bottom=24

## Navigasyon kararı
Gerçek 2.9.147 mobilde bottom tab **gizli**; NavigationRail 7 öğe + avatar. Mockupta aynı 7 öğe floating glass tab bar olarak (Sohbetler · Gruplar · Sunucular · Oyna · Arkadaşlar · Aktivite · Aramalar). Avatar toolbar’da.

## İsimler
- Mock grup: **Akşam Ekibi** (Valorant Squad kaldırıldı)
- Play/LFG’deki Valorant ürün adı korundu (özellik parity)

## Mesajlar
MessageList yapısı: message-group (+own), avatar+status, author, timestamp, bubble, reply-quote, pinned, reactions, ✓/✓✓.

## Hareket (not)
Spring damping 1.0 / response 0.35–0.4; sheet 0.8/0.3 — statik mockupta poz ile temsil.

## Dosyalar
`/workspace/glass-redesign/final/{01..21}*.png`, `02b-groups.png`, `overview.png`, `feature-inventory.md`, `src/`
v1 ve v2 dokunulmadı.
