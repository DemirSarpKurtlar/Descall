/** Yönetici Paneli › Performans ("perfAdmin.*", owner pick Draft A "Konsol"). Same keys in every perfAdmin.<locale>.js. */
export const PERF_ADMIN_TR = {
  "title": "Performans",
  "crumb": "Sistem › Performans · gerçek kullanıcı ölçümleri ve Lighthouse CI",
  "sampling": "örnekleme {pct}",
  "dataAgoSec": "veri {n} sn önce",
  "dataAgoMin": "veri {n} dk önce",
  "notReady": "Performans tabloları henüz kurulmadı (20261124v_perf.sql). Veri, geçiş uygulanınca toplanmaya başlar.",
  "retry": "Yeniden dene",
  "close": "Kapat",
  "cancel": "Vazgeç",
  "save": "Kaydet",
  "saving": "Kaydediliyor…",
  "undo": "Geri al",
  "and": "ve",
  "unit": {
    "ms": "{n} ms",
    "s": "{n} sn"
  },
  "tab": {
    "rum": "Gerçek kullanıcılar",
    "rumShort": "Kullanıcılar",
    "lh": "Lighthouse CI",
    "lhShort": "Lighthouse",
    "alerts": "Uyarılar"
  },
  "live": {
    "long": "Canlı · {n} oturum / 5 dk",
    "short": "Canlı · {n}",
    "waiting": "Canlı · bekleniyor",
    "title": "Son 5 dakikada ölçülen (örneklenen) sayfa açılışları"
  },
  "export": {
    "button": "Dışa aktar",
    "done": "{n} satır CSV olarak indirildi · bu işlem kayda yazıldı",
    "failed": "Dışa aktarılamadı."
  },
  "rules": {
    "button": "Uyarı kuralları",
    "title": "Uyarı kuralı",
    "subtitle": "Yeni sürümde bir metrik kötüleşince yönetici odasına ve sana haber verir.",
    "metric": "Metrik",
    "platform": "Platform",
    "condition": "Koşul",
    "conditionText": "p75, önceki sürüme göre",
    "threshold": "Kötüleşme",
    "thresholdUnit": "%'ten fazla",
    "minSessions": "En az ölçüm",
    "minUnit": "ölçüm",
    "notify": "Bildir",
    "ch": {
      "adminRoom": "Yönetici odası (sistem mesajı)",
      "ownerPush": "Sahibe anlık bildirim (telefon)",
      "email": "E-posta özeti",
      "errorLog": "Hata Kayıtları'nda kayıt aç"
    },
    "chSub": {
      "adminRoom": "paneli açık yöneticiler",
      "ownerPush": "web, iOS, Android",
      "email": "günde 1 kez",
      "errorLog": "uyarı başına bir kez"
    },
    "mute": "Sessize al",
    "muteOpt": {
      "none": "Hiç",
      "release24h": "Aynı sürüm için 24 sa",
      "7d": "7 gün"
    },
    "save": "Kuralı kaydet",
    "saved": "Kural kaydedildi; değişiklik İşlem kaydı'na yazıldı.",
    "previewTitle": "Önizleme · son 90 gün",
    "previewSome": "kez tetiklenirdi: her biri gerçek bir sürüm gerilemesi.",
    "previewNone": "kez: bu kural son 90 günde hiç tetiklenmezdi.",
    "previewInvalid": "Önizleme için en az bir metrik ve platform seç.",
    "fire": "{version} · {platform} · {metric} +{pct}",
    "roomTitle": "Yönetici odasında böyle görünür",
    "roomOff": "Yönetici odası kapalı: bu mesaj gönderilmez.",
    "auditNote": "Kural değişiklikleri İşlem kaydı'na yazılır, oradan geri alınabilir."
  },
  "query": {
    "label": "Performans sorgusu",
    "placeholder": "Filtre ekle: sayfa, platform, sürüm, cihaz, bağlantı, ülke, kullanıcı kimliği",
    "filters": "Filtreler",
    "remove": "{label} filtresini kaldır",
    "suggestions": "Öneriler"
  },
  "tok": {
    "range": "son",
    "platform": "platform",
    "version": "sürüm",
    "route": "sayfa",
    "device": "cihaz",
    "connection": "bağlantı",
    "country": "ülke",
    "user": "kullanıcı"
  },
  "range": {
    "24h": "24 saat",
    "7d": "7 gün",
    "28d": "28 gün",
    "90d": "90 gün"
  },
  "platform": {
    "web": "Web",
    "ios": "iOS",
    "android": "Android",
    "electron": "Electron",
    "tauri": "Tauri (Rust)"
  },
  "device": {
    "low": "Düşük",
    "mid": "Orta",
    "high": "Yüksek"
  },
  "conn": {
    "wifi": "Wi-Fi",
    "ethernet": "Ethernet",
    "4g": "4G",
    "3g": "3G",
    "2g": "2G",
    "offline": "Çevrimdışı"
  },
  "metric": {
    "lcp": "LCP",
    "inp": "INP",
    "cls": "CLS",
    "fcp": "FCP",
    "ttfb": "TTFB",
    "msglist": "İlk mesaj listesi",
    "voicejoin": "Sese katılma",
    "appstart": "Uygulama açılışı"
  },
  "metricSub": {
    "lcp": "En büyük içerik",
    "inp": "Etkileşim gecikmesi",
    "cls": "Düzen kayması",
    "fcp": "İlk içerik",
    "ttfb": "İlk bayt",
    "msglist": "kanal açılınca",
    "voicejoin": "odaya bağlanma",
    "appstart": "soğuk açılış"
  },
  "dist": {
    "good": "İyi {pct}",
    "ni": "Orta {pct}",
    "poor": "Kötü {pct}"
  },
  "route": {
    "app_kanal": "Sunucu kanalı",
    "app_dm": "Özel mesajlar",
    "app_grup": "Grup sohbeti",
    "app_ses": "Sesli oda",
    "app": "Uygulama",
    "_": "Giriş sayfası",
    "_download": "İndir sayfası",
    "_features": "Özellikler",
    "_login": "Giriş",
    "_blog": "Blog"
  },
  "views": {
    "label": "Kayıtlı görünümler",
    "all": "Tümü",
    "mobileSlow": "Mobil · yavaş ağ",
    "desktopStart": "Masaüstü açılış",
    "voice": "Sesli oda",
    "release": "{platform} {version}",
    "regression": "gerileme",
    "save": "Görünümü kaydet",
    "copyLink": "Bağlantıyı kopyala",
    "linkCopied": "Bağlantı kopyalandı: açan yönetici aynı filtreleri görür.",
    "notReady": "Kayıtlı görünümler geçiş uygulanınca açılır.",
    "menu": "Görünüm",
    "delete": "Görünümü sil",
    "deleted": "“{name}” silindi.",
    "saved": "“{name}” kaydedildi.",
    "saveTitle": "Görünümü kaydet",
    "saveSubtitle": "Bu filtreler tek tıkla geri gelir.",
    "name": "Ad",
    "namePh": "ör. Android 4.1.4 gerilemesi",
    "contains": "İçerdiği filtreler",
    "shared": "Diğer yöneticilerle paylaş",
    "sharedSub": "Performans bölümü olan herkes görür."
  },
  "alert": {
    "lead": "{version} sürümünde {platform} {metric} p75 {from} → {to} (+{pct}).",
    "sessions": "{n} ölçüm.",
    "mostOn": "En çok",
    "also": "Ayrıca {n} uyarı daha var.",
    "firstSeen": "İlk görülme {when}.",
    "share": "Sürüm şu an kullanıcıların {pct} kadarında.",
    "review": "İncele",
    "errorLog": "Hata kaydı aç",
    "errorAgain": "Hata kaydını gör",
    "errorOpened": "Hata Kayıtları'nda kayıt açıldı.",
    "errorExists": "Bu uyarının hata kaydı zaten var.",
    "gotoErrors": "Hata Kayıtları'nda aç",
    "hide": "Gizle",
    "hidden": "Uyarı gizlendi (herkes için).",
    "show": "Geri göster",
    "shown": "Uyarı yeniden gösteriliyor.",
    "vsPrev": "önceki sürüm {version}",
    "hasError": "hata kaydı açık"
  },
  "alerts": {
    "open": "Açık uyarılar",
    "hidden": "Gizlenenler",
    "none": "Açık uyarı yok. Yeni sürümler eşiği aşınca burada görünür.",
    "how": "Her 15 dakikada bir, her platformun en yeni sürümü bir öncekiyle p75 üzerinden karşılaştırılır; kural eşiği aşılınca uyarı açılır."
  },
  "chart": {
    "title": "p75 eğilimi",
    "metric": "Grafik metriği",
    "app": "Uygulama",
    "hint": "Çizgiye tıkla: o platformu filtrele",
    "aria": "{metric} p75 eğilimi, platforma göre",
    "goodLine": "İyi sınırı · {value}",
    "tipTitle": "{when} · p75",
    "flag": "bayrak: {name} {pct}",
    "flagOff": "kapalı",
    "empty": "Bu aralıkta veri yok.",
    "noData": "Bu filtrelerle ölçüm yok."
  },
  "releases": {
    "title": "Sürüm karşılaştırması",
    "version": "Sürüm",
    "share": "Pay",
    "start": "Açılış",
    "empty": "Henüz sürüm verisi yok.",
    "mix": "Platform payı",
    "sessions": "{n} oturum"
  },
  "group": {
    "route": "Sayfa",
    "platform": "Platform",
    "version": "Sürüm",
    "device": "Cihaz sınıfı",
    "connection": "Bağlantı",
    "country": "Ülke"
  },
  "table": {
    "title": {
      "route": "En yavaş sayfalar",
      "platform": "Platformlar",
      "version": "Sürümler",
      "device": "Cihaz sınıfları",
      "connection": "Bağlantılar",
      "country": "Ülkeler"
    },
    "groupBy": "Gruplama",
    "distOf": "Dağılım: {metric}",
    "sortBy": "{metric} p75'e göre",
    "sortLabel": "Sıralama",
    "platform": "Platform",
    "sessions": "Oturum",
    "dist": "Dağılım",
    "trend": "Eğilim",
    "empty": "Bu filtrelerle ölçüm yok.",
    "emptySub": "Filtreleri gevşet ya da daha uzun bir aralık seç.",
    "rowMenu": "Satır işlemleri",
    "open": "Ayrıntıyı aç",
    "filterTo": "Yalnızca {value}",
    "p75": "{metric} p75"
  },
  "drawer": {
    "tab": {
      "summary": "Özet",
      "breakdown": "Kırılımlar",
      "attribution": "Atıf",
      "users": "Yavaş kullanıcılar",
      "lighthouse": "Lighthouse"
    },
    "sessions": "{n} oturum",
    "allPlatforms": "tüm platformlar",
    "copy": "Değeri kopyala",
    "copied": "Kopyalandı.",
    "heatTitle": "INP p75 · platform × cihaz sınıfı",
    "heatHint": "hücreye tıkla: filtre olur",
    "none": "yok",
    "samples": "{n} ölçüm",
    "noData": "Veri yok.",
    "attrTitle": "Atıf · en yavaş etkileşimler (INP)",
    "attrEmpty": "Son {days} günde atıf verisi yok.",
    "itype": {
      "keyboard": "keydown · klavye",
      "pointer": "click · dokunma / tık",
      "other": "etkileşim"
    },
    "shareOf": "etkileşimlerin {pct}",
    "lcpEl": "LCP öğesi:",
    "onPages": "açılışların {pct}",
    "usersTitle": "En yavaş kullanıcılar",
    "usersHint": "yalnızca kullanıcı kimliği",
    "usersEmpty": "Oturum açmış yavaş kullanıcı yok.",
    "dossier": "Kullanıcı dosyası",
    "userSessions": "Bu kullanıcının {n} oturumu",
    "userSessionsAll": "Bu kullanıcının oturumları",
    "lhTitle": "Lighthouse · main",
    "lhNone": "Bu sayfa Lighthouse CI'da ölçülmüyor.",
    "lhApp": "Uygulama ekranları Lighthouse'ta ölçülmez; yalnızca herkese açık sayfalar.",
    "saveView": "Görünüm olarak kaydet",
    "openLh": "Lighthouse'ta aç",
    "lhMain": "main · {sha}"
  },
  "room": {
    "name": "Descall Sistem",
    "badge": "SİSTEM",
    "text": "Performans uyarısı: {version} {platform} {metric} p75 {from} → {to} (+{pct}), {n} ölçüm.",
    "open": "Panelde aç"
  },
  "filters": {
    "title": "Filtreler",
    "subtitle": "Birden çok değer seçilebilir; boş bırakılan her şeyi kapsar.",
    "userPh": "Kullanıcı kimliği (tam ya da ilk 8 karakter)",
    "clear": "Temizle",
    "apply": "Uygula"
  },
  "err": {
    "generic": "Bir şeyler ters gitti.",
    "load": "Yüklenemedi.",
    "NO_METRIC": "En az bir metrik seç.",
    "NO_PLATFORM": "En az bir platform seç.",
    "BAD_THRESHOLD": "Eşik 1 ile 500 arasında olmalı.",
    "BAD_MIN_SESSIONS": "En az ölçüm 10 veya daha fazla olmalı.",
    "NAME_REQUIRED": "Bir ad yaz.",
    "PERF_UNAVAILABLE": "Performans tabloları henüz kurulmadı."
  },
  "lh": {
    "placeholder": "PR numarası, dal, yazar, sayfa…",
    "tok": {
      "compare": "karşılaştır",
      "state": "durum",
      "text": "ara"
    },
    "rerun": "Tümünü yeniden çalıştır",
    "rerunHint": "GitHub Actions'ta Lighthouse iş akışını açar",
    "view": {
      "open": "Açık PR'lar",
      "over": "Bütçeyi aşanlar",
      "main": "main geçmişi",
      "merged": "Son birleşenler"
    },
    "method": "{pages} sayfa × 3 tekrar · ortanca",
    "lastRun": "son çalıştırma {when}",
    "minAgo": "{n} dk önce",
    "hourAgo": "{n} sa önce",
    "yesterday": "dün",
    "overLead": "#{pr} performans bütçesini aşıyor:",
    "budget": "(bütçe {n}).",
    "bundle": "Ana paket {kb} KB (gzip).",
    "tbt": "Ortalama TBT {ms} ms.",
    "openPr": "PR'ı aç",
    "report": "Raporu gör",
    "empty": "Henüz Lighthouse sonucu yok. Bir sonraki PR ya da main çalıştırmasından sonra burada görünür.",
    "cat": {
      "perf": "Performans",
      "a11y": "Erişilebilirlik",
      "best_practices": "En iyi uygulamalar",
      "seo": "SEO"
    },
    "catShort": {
      "perf": "Perf",
      "a11y": "Erş",
      "best_practices": "EİU",
      "seo": "SEO"
    },
    "weekDelta": "{n} bu hafta",
    "weekFlat": "bu hafta değişmedi",
    "thisWeek": "Bu hafta",
    "runs": "çalıştırma",
    "passed": "Geçti {n}",
    "warned": "Uyarı {n}",
    "over": "Aştı {n}",
    "history": "main geçmişi",
    "historySub": "son {n} birleşme",
    "noHistory": "Grafik için en az iki main çalıştırması gerekir.",
    "budgetLbl": "Bütçe · {n}",
    "perPage": "Sayfa başına · main",
    "noMain": "main için henüz sonuç yok.",
    "noindexNote": "Uygulama sayfaları bilerek noindex; SEO puanları bütçe dışında tutulur.",
    "prs": "Pull request'ler",
    "prsSub": "main'e göre fark · {pages} sayfanın ortalaması",
    "author": "Yazar",
    "state": "Durum",
    "noPrs": "Bu görünümde PR yok.",
    "st": {
      "over": "Bütçe aşıldı",
      "warn": "Uyarı",
      "pass": "Geçti",
      "merged": "Birleşti",
      "mergedWarn": "Birleşti · uyarı"
    },
    "pr": "PR"
  },
  "new": "YENİ"
};
