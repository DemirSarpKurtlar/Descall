# Masaüstü (Tauri) imza anahtarları

Bu belge, Rust/Tauri masaüstü sürümünü imzalayan anahtarların nasıl üretileceğini ve nereye konacağını anlatır. Yayın akışı: `.github/workflows/tauri-release.yml`.

## Önce şunu oku: özel anahtarlar nereye GİTMEZ

- Özel anahtar (private key) ve parolası **hiçbir zaman** repoya, commit'e, issue'ya, PR'a, Discord'a, e-postaya ya da bir yapay zekâ sohbetine yazılmaz veya yapıştırılmaz. Claude dahil hiçbir asistana gösterme.
- Özel anahtarlar yalnızca iki yerde durur: **kendi bilgisayarında repo dışındaki bir klasörde** (aşağıda `%USERPROFILE%\descall-anahtarlar`) ve **GitHub Secrets** içinde.
- Repoya yalnızca **açık anahtarlar** girer: `desktop/keys/setup-manifest.pub` ve `desktop/keys/tauri-updater.pub`. Bunlar herkese açık olabilir.
- Özel anahtarların bir yedeğini çevrim dışı tut (parola yöneticisi ya da şifreli USB). **Güncelleyici anahtarı kaybolursa, kurulu uygulamalar bir daha güncelleme alamaz.** Kullanıcıların yeni sürümü elle kurması gerekir.
- İş akışı repodaki bir anahtara asla geri düşmez. Secret yoksa o parçayı atlar ve nedenini özet ekranına yazar.

## Hangi anahtar ne işe yarar

| Anahtar | Ne imzalar | Açık anahtar (repoda) | GitHub secret (özel) |
|---|---|---|---|
| Kurulum manifesti (Ed25519) | `DescallSetup.exe` indirdiği `manifest.json` dosyasını doğrular. Manifest de her parçanın SHA-256 değerini taşır. | `desktop/keys/setup-manifest.pub` | `DESCALL_SETUP_SIGNING_KEY` |
| Tauri güncelleyici (minisign) | Kurulu uygulamanın indirdiği güncelleme kurulum dosyası | `desktop/keys/tauri-updater.pub` | `TAURI_SIGNING_PRIVATE_KEY` ve `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` |
| Authenticode (isteğe bağlı) | `.exe` dosyalarının Windows imzası (SmartScreen) | yok (sertifika) | `WIN_CSC_LINK` ve `WIN_CSC_KEY_PASSWORD` (Electron'un kullandıklarıyla aynı) |

İki anahtar bilerek ayrıdır: biri sızarsa diğeri etkilenmez.

## Hazırlık (bir kez)

Komutlar Windows PowerShell içindir. Repo kökünde (`Descall` klasörü) çalıştır.

```powershell
# Python ve cryptography (kurulum manifesti anahtarı için)
python -m pip install --upgrade cryptography

# GitHub CLI ile giriş (secret yüklemek için)
winget install --id GitHub.cli -e
gh auth login

# Özel anahtarların duracağı klasör: REPONUN DIŞINDA
New-Item -ItemType Directory -Force "$env:USERPROFILE\descall-anahtarlar" | Out-Null
```

## 1. Kurulum manifesti anahtarı (Ed25519)

```powershell
python desktop\crates\descall-setup\tools\release.py keygen "$env:USERPROFILE\descall-anahtarlar\setup-manifest.key" desktop\keys\setup-manifest.pub
```

- `setup-manifest.key`: **özel**. Tek satır base64. Komut var olan bir anahtarın üzerine yazmaz.
- `desktop\keys\setup-manifest.pub`: **açık**. Yer tutucunun yerine yazılır; bunu commit'le.

Özel anahtarı secret'a yükle. Komut dosyayı okur, ekrana basmaz:

```powershell
Get-Content -Raw "$env:USERPROFILE\descall-anahtarlar\setup-manifest.key" | gh secret set DESCALL_SETUP_SIGNING_KEY --repo DemirSarpKurtlar/Descall
```

Alternatif olarak minisign da kullanılabilir. `-W` parolasız anahtar üretir; iş akışı parolalı minisign anahtarını okuyamaz:

```powershell
minisign -G -W -p desktop\keys\setup-manifest.pub -s "$env:USERPROFILE\descall-anahtarlar\setup-manifest.key"
Get-Content -Raw "$env:USERPROFILE\descall-anahtarlar\setup-manifest.key" | gh secret set DESCALL_SETUP_SIGNING_KEY --repo DemirSarpKurtlar/Descall
```

## 2. Tauri güncelleyici anahtarı (minisign)

```powershell
# Tauri CLI (bir kez). Alternatif: her komutta "npx @tauri-apps/cli@2" yaz.
cargo install tauri-cli --version "^2" --locked

# Anahtar çifti: parolayı komut kendisi sorar. Parolayı buraya ya da bir sohbete yazma.
cargo tauri signer generate -w "$env:USERPROFILE\descall-anahtarlar\tauri-updater.key"
```

Bu komut iki dosya üretir:

- `tauri-updater.key`: **özel**
- `tauri-updater.key.pub`: **açık**

Açık anahtarı repoya koy (dosya tek satırdır, olduğu gibi kopyalanır):

```powershell
Copy-Item "$env:USERPROFILE\descall-anahtarlar\tauri-updater.key.pub" desktop\keys\tauri-updater.pub -Force
```

Özel anahtarı ve parolasını secret'a yükle. İkinci komut parolayı gizli olarak sorar:

```powershell
Get-Content -Raw "$env:USERPROFILE\descall-anahtarlar\tauri-updater.key" | gh secret set TAURI_SIGNING_PRIVATE_KEY --repo DemirSarpKurtlar/Descall
gh secret set TAURI_SIGNING_PRIVATE_KEY_PASSWORD --repo DemirSarpKurtlar/Descall
```

`tauri.conf.json` içindeki `pubkey` yer tutucu olarak kalabilir. Yayın iş akışı `desktop/keys/tauri-updater.pub` dosyasını derleme sırasında oraya koyar.

## 3. Authenticode (isteğe bağlı, Electron ile aynı)

Electron yayını için `WIN_CSC_LINK` ve `WIN_CSC_KEY_PASSWORD` zaten tanımlıysa Tauri yayını da onları kullanır; başka bir şey yapma. Yeni tanımlanacaksa:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("$env:USERPROFILE\descall-anahtarlar\descall.pfx")) | gh secret set WIN_CSC_LINK --repo DemirSarpKurtlar/Descall
gh secret set WIN_CSC_KEY_PASSWORD --repo DemirSarpKurtlar/Descall
```

Sertifika yoksa `.exe` dosyaları imzasız çıkar. SmartScreen "bilinmeyen yayıncı" der; yayın yine de çalışır.

## 4. Kontrol et, commit'le

```powershell
python desktop\tools\publish\desktop_release.py key-status setup desktop\keys\setup-manifest.pub
python desktop\tools\publish\desktop_release.py key-status updater desktop\keys\tauri-updater.pub
git status   # yalnızca desktop/keys/*.pub değişmiş olmalı; .key dosyası listede GÖRÜNMEMELİ
git add desktop/keys/setup-manifest.pub desktop/keys/tauri-updater.pub
git commit -m "desktop: release public keys"
```

İlk iki komut açık anahtarı yazdırır ve 0 ile biter. Yer tutucu hâlâ duruyorsa nedenini söyler.

## 5. Yayın

```powershell
gh workflow run tauri-release.yml --repo DemirSarpKurtlar/Descall -f version=4.0.0
```

Önce sürümü üç yerde aynı yap: `desktop/app/src-tauri/tauri.conf.json`, `desktop/app/src-tauri/Cargo.toml` ve `desktop/crates/descall-setup/Cargo.toml`. İş akışı uyuşmazlıkta durur.

- Çıktı ayrı bir **ön sürüme** gider: `desktop-vX.Y.Z`. Electron yayını `vX.Y.Z` ve onun güncelleme akışı hiç değişmez. Ön sürüm hiçbir zaman "latest" olmaz.
- `desktop-latest` ön sürümü sabit adresleri taşır: `latest.json` (güncelleyici yedeği) ve `manifest.json` ile `.minisig` (DescallSetup). `promote: false` verilirse bu kanal yerinde kalır.
- Bir secret yoksa o parça atlanır, gerisi yayımlanır. Neyin imzalandığı, neyin neden atlandığı iş akışı özetinde yazar.
- Secret var ama repodaki açık anahtarla eşleşmiyorsa iş akışı uzun derlemeden **önce** açık bir hata ile durur.

## Anahtar sızarsa veya değişirse

- **Kurulum manifesti:** yeni bir çift üret. `.pub` dosyasını değiştir, secret'ı güncelle, yeni `DescallSetup.exe` yayımla. Eski kurulum dosyaları yeni manifesti reddeder; kullanıcıya yenisini indirmesini söyle.
- **Güncelleyici:** yeni anahtar yalnızca onu taşıyan uygulama sürümünden sonra geçerli olur. Önce yeni açık anahtarla bir sürümü **eski** anahtarla imzalayıp yayımla, sonra secret'ı değiştir. Eski özel anahtar tamamen kaybolduysa kurulu uygulamalar elle güncellenmelidir.
- Sızan bir secret'ı GitHub'da hemen sil veya değiştir: Settings → Secrets and variables → Actions.
