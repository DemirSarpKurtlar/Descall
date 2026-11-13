/**
 * What Descall runs on, in Turkish (checked against the code on 2026-11-13): the Windows
 * build is x64 only (package.json build.win) on Electron 45, so Windows 10 or later; the
 * iOS deployment target is 15.0 (ios/App/App.xcodeproj); Android minSdk is 24, Android 7.0
 * (android/variables.gradle). iPhone and iPad cannot share their own screen. Small on
 * purpose: pageExtras.js (home and download pages) imports it.
 */
export const SYSTEM_REQUIREMENTS = [
  "Windows: Windows 10 veya 11, 64 bit. Kurulum dosyası indirme sayfasında; uygulama yeni sürüm çıktığında kendini günceller.",
  "iPhone ve iPad: App Store’dan, iOS ve iPadOS 15 ya da üzeri. Başkalarının ekran paylaşımını izleyebilirsin, kendi ekranını paylaşmak için bilgisayar gerekir.",
  "Android: Android 7.0 ya da üzeri. APK her sürümle Descall’ın GitHub sürümler sayfasında yayımlanır; bağlantısı indirme sayfasında.",
  "Tarayıcı: kurulum yok, descall.com/app adresinden güncel bir masaüstü tarayıcısıyla. macOS ve Linux için masaüstü uygulaması olmadığından o bilgisayarlarda tarayıcıyı kullan.",
];
