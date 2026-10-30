# Sürüm & merge iş akışı (standing rule)

> Owner kuralı (Ekim 2026). Her **anlamlı** değişiklik uçtan uca bitirilir: **branch → PR → CI yeşil → squash-merge main → sürüm tag'i**. Tek `vX.Y.Z` tag'i hem Windows installer'ı hem iOS TestFlight build'ini çıkarır. App Store'a inceleme gönderimi yalnızca owner açıkça isteyince yapılır.

## 0. Kapsam — ne release gerektirir?
- **Release gerekir:** kullanıcıya giden kod/UI/davranış değişikliği (frontend, backend, electron, iOS, android).
- **Release GEREKMEZ (ama yine merge edilir):** sadece döküman, test, CI/altyapı, yorum. Bunlar PR + merge ile main'e girer, tag çıkmaz.

## 1. Branch'te bitir
- Oturumun feature branch'inde geliştir (ör. `claude/...`).
- Repro + doğrulama (selftest / görsel kanıt). İlgili `AGENTS.md` bölümünü oku, o özelliğin selftest'lerini çalıştır.
- Commit mesajı + atıf satırları session reminder'daki gibi.

## 2. Semver kararı
| Bump | Ne zaman | Örnek |
|------|----------|-------|
| **patch** | bug fix, küçük UI | `3.0.1 → 3.0.2` |
| **minor** | yeni özellik | `3.0.1 → 3.1.0` |
| **major** | kırıcı değişiklik | `3.0.1 → 4.0.0` |

## 3. Sürüm bump
```bash
node frontend/electron/sync-version.cjs <version>   # root + frontend + electron package.json + iOS MARKETING_VERSION
```
Sonra `frontend/package-lock.json` içindeki **yalnızca 2 kendi-versiyon alanını** elle güncelle (satır ~3 `"version"` ve satır ~9 `packages[""].version`) — dependency versiyonlarına dokunma.

Fallback installer URL'leri sabit `Descall-Setup.exe` (versiyonsuz) olduğu için release başına düzenleme gerekmez.

## 4. PR aç + squash-merge
- Feature branch'i push et, `main`'e PR aç.
- **CI yeşil** olunca `squash` ile merge et. Kırmızıyken asla merge etme; önce düzelt.
- PR açıklaması: Türkçe, değişiklik + doğrulama.

## 5. Tag → Windows + TestFlight
- Merge edilmiş `main` HEAD'ine tag at:
```bash
git fetch origin main && git checkout main && git pull --ff-only origin main
git tag vX.Y.Z && git push origin vX.Y.Z
```
- Tag `v*` push'u tetikler:
  - `.github/workflows/release.yml` → Windows `Descall-Setup-X.Y.Z.exe` + blockmap + `latest.yml` (electron-updater).
  - `.github/workflows/ios-testflight.yml` → Capacitor iOS build, ASC API key ile imza, **TestFlight**'a yükleme. `CFBundleShortVersionString = frontend/package.json`, `CFBundleVersion = UTC YYYYMMDD.HHMM` (her build daha yüksek).
- **CI yeşil olana kadar** sürümü "çıktı" diye raporlama.

## 6. Release notları (Türkçe, zorunlu)
GitHub release notlarında **ve** owner raporunda ayrıntılı kontrol listesi. Her değişiklik için: **ne**, **nerede**, **hangi platform** (Electron / web / iOS / Android), **adımlar**, **beklenen sonuç**.

## 7. App Store (owner-gated)
- Tag zaten TestFlight'a build gönderir — iç test otomatik.
- Apple'a **inceleme gönderimi** owner onayı ister. Owner "App Store'a gönder" dediğinde:
  1. `appstore-metadata.yml` `mode=verify` (read-only rapor).
  2. `mode=apply` (listing + build iliştir, submit etmez).
  3. `mode=submit` (verify temizse inceleme gönderir).
  4. Gerekirse `mode=release-auto` (owner tam build numarasını onaylayınca).
- App Privacy etiketleri ASC web UI'da owner tarafından; `appstore/metadata.json`, `age-rating.json`, `review-notes.txt`, screenshots commit'li kaynaktır (sürüm bump gerektirmez).

## Kırmızı çizgiler
- CI kırmızıyken merge/tag yok. Testi geçmek için test silme/devre dışı bırakma yok.
- Owner açıkça istemeden App Store'a submit yok.
- Download sayfasında yalnızca Windows + Android APK; macOS/Linux listelenmez.
- Desktop build'leri her zaman production API (`https://des-call.onrender.com`).
