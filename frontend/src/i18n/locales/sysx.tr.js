/** Yönetici Paneli › Sistem ("sysx.*", Draft A "Kontrol merkezi"). Same keys in every sysx.<locale>.js. */
export const SYSX_TR = {
  "title": "Sistem",
  "crumb": "Sunucu sağlığı, özellik bayrakları, acil anahtarlar ve bakım tek ekranda",
  "backupBtn": "Yedeği indir",
  "restartBtn": "Güvenli yeniden başlat",
  "close": "Kapat",
  "cancel": "Vazgeç",
  "retry": "Tekrar dene",
  "loading": "Yükleniyor…",
  "saving": "Kaydediliyor…",
  "system": "sistem",
  "pct": "%{n}",
  "pctDec": "%{n}",
  "people": "{n} kişi",
  "sec": "{n} sn",
  "bytes": "{n} {unit}",
  "pausedAt": "%{n} beklemede",
  "ver": {
    "front": "Ön yüz {v}",
    "server": "Sunucu {c}",
    "local": "yerel",
    "host": "Render · yayında {t}",
    "hostLocal": "Sunucu · yayında {t}"
  },
  "time": {
    "dh": "{d} g {h} sa",
    "hm": "{h} sa {m} dk",
    "m": "{m} dk"
  },
  "ago": {
    "now": "az önce",
    "m": "{n} dk önce",
    "h": "{n} sa önce",
    "d": "{n} g önce",
    "mShort": "{n} dk",
    "hShort": "{n} sa",
    "dShort": "{n} g"
  },
  "level": {
    "ok": "Normal",
    "warn": "Yüksek",
    "bad": "Kritik",
    "unknown": "Ölçülüyor"
  },
  "tile": {
    "cpu": "İşlemci",
    "cores": "{n} çekirdek",
    "mem": "Bellek (RSS)",
    "ofMb": "/ {n} MB",
    "lag": "Olay döngüsü",
    "p99": "p99 {n} ms",
    "lagUnit": "ms gecikme",
    "sockets": "Bağlı soket",
    "edgeN": "{n} edge",
    "live": "canlı",
    "db": "Veritabanı",
    "supabase": "Supabase",
    "dbDown": "Yanıt yok",
    "dbUnit": "ms yanıt",
    "uptime": "Çalışma süresi"
  },
  "memAlert": {
    "title": {
      "warn": "Bellek yüksek",
      "bad": "Bellek kritik seviyede",
      "peak": "Bugün bellek zirve yaptı"
    },
    "body": {
      "warn": "Sunucu {rss} / {limit} MB kullanıyor (%{pct}); son {min} dakikadır %{sustained} ve üstünde.",
      "bad": "Sunucu {rss} / {limit} MB kullanıyor (%{pct}). Bellek dolarsa sunucu yeniden başlar ve herkesin bağlantısı kopar.",
      "peak": "Şu an normal (%{pct}), ama bugün %{peak} seviyesine çıktı."
    },
    "advice": "Render'da Instance Type'ı Standard'a ({gb} GB) yükseltmen önerilir.",
    "watch": "Şimdilik bir şey yapmana gerek yok; tekrar ederse planı büyütmeyi düşün.",
    "plan": "Render planını aç"
  },
  "flags": {
    "title": "Özellik bayrakları",
    "count": "{n} bayrak",
    "history": "Değişiklik geçmişi",
    "historyTitle": "Bayrak değişiklik geçmişi",
    "historySub": "Her bayrak değişikliği, kim yaptı ve neden. Satıra tıkla, bayrağı aç.",
    "openAria": "{name} ayarlarını aç",
    "toggleAria": "{name} aç veya kapat",
    "tipTitle": "Satıra tıkla",
    "tipBody": "Platform, yüzde ve yalnızca ekip ayarı; her değişiklik geçmişe yazılır ve tek tıkla geri alınır."
  },
  "col": {
    "flag": "Bayrak",
    "scope": "Kapsam",
    "reach": "Yayılım"
  },
  "flag": {
    "iosGlass": { "name": "iOS Liquid Glass", "desc": "iPhone ve Android uygulaması", "long": "iPhone ve Android uygulamasının cam arayüzü" },
    "desktopGlass": { "name": "Masaüstü Liquid Glass", "desc": "masaüstü ve web", "long": "masaüstü ve web arayüzü" },
    "presenceScoped": { "name": "Kapsamlı çevrimiçi listesi", "desc": "acil anahtar", "long": "çevrimiçi durumu yalnızca arkadaşlara ve ortak sunuculara gider" },
    "bootDiet": { "name": "Yeniden bağlanmada hafif açılış", "desc": "acil anahtar", "long": "yeniden bağlanırken değişmeyen arkadaş listesi tekrar gönderilmez" },
    "edgeRealtime": { "name": "Edge realtime", "desc": "Cloudflare", "long": "gerçek zamanlı bağlantılar Cloudflare üzerinden" }
  },
  "reach": {
    "all": "Herkes",
    "staff": "Ekip",
    "partial": "Kısmi",
    "off": "Kapalı"
  },
  "platform": {
    "web": "Web",
    "electron": "Masaüstü",
    "ios": "iOS",
    "android": "Android",
    "all": "Tümü"
  },
  "mode": {
    "off": "Kapalı",
    "staff": "Yalnızca ekip",
    "rollout": "Kademeli",
    "all": "Herkes",
    "rolloutPct": "Kademeli %{n}"
  },
  "drawer": {
    "status": "Durum",
    "platforms": "Platformlar",
    "separateFlag": "{name} · ayrı bayrak",
    "serverWide": "Bu bayrak sunucu genelinde çalışır: yalnızca kapalı veya herkes.",
    "percent": "Yayılım yüzdesi",
    "approx": "Yaklaşık {n} / {total} kullanıcı · kullanıcı kimliğine göre sabit, yenilemede değişmez",
    "staff": "Her zaman açık (ekip)",
    "staffEdge": "Ekip kullanıcıları (her platformda)",
    "add": "Ekle",
    "addStaff": "Ekibe kişi ekle",
    "removeStaff": "@{name} çıkar",
    "searchPh": "Kullanıcı adı ara",
    "noResults": "Kimse bulunamadı",
    "staffChip": "Ekip",
    "reason": "Sebep (denetim kaydına yazılır)",
    "reasonPh": "Neden değiştirdiğini yaz",
    "autoRollback": "Hata oranı %2'yi aşarsa 15 dk içinde otomatik geri al",
    "tryFirst": "Kaydetmeden önce kendi hesabımda dene",
    "tryClientOnly": "Kendi hesabında deneme yalnızca uygulama bayraklarında",
    "tryNow": "Kendi hesabımda dene",
    "tried": "Yalnızca senin açık uygulamalarında açıldı. Kontrol et, sonra herkes için yayınla.",
    "publishNow": "Şimdi yayınla",
    "save": "Kaydet ve yayınla",
    "guardOn": "Otomatik geri alma izliyor · {time} saatine kadar",
    "history": "Değişiklik geçmişi",
    "historyMemory": "Geçmiş şimdilik bellekte tutuluyor; sunucu yeniden başlarsa silinir.",
    "emptyHistory": "Henüz değişiklik yok",
    "now": "Şu an",
    "revert": "Buna dön",
    "reverted": "geri alındı",
    "autoReverted": "otomatik geri alındı",
    "unknownState": "Ayrıntı yok"
  },
  "edge": {
    "title": "Edge realtime (Cloudflare)",
    "masterAria": "Edge realtime ana anahtarı",
    "bridgeOpen": "Köprü bağlı",
    "bridgeDown": "Köprü kopuk",
    "bridgeNone": "Köprü kurulmamış",
    "stats": "{n} edge soket · %{p} trafik",
    "legendAll": "Tüm soketler",
    "legendEdge": "Edge soketleri",
    "days": "{n} gün",
    "chartAria": "Son 14 günde en yüksek bağlı soket ve edge soket sayısı",
    "chartEmpty": "Henüz ölçüm yok",
    "stageLabel": "Yayılım aşaması",
    "platforms": "Platformlar",
    "team": "Ekip kullanıcıları",
    "teamValue": "{n} kişi · her platformda"
  },
  "stage": {
    "shadow": "Gölge",
    "team": "Ekip",
    "p5": "%5",
    "p25": "%25",
    "p50": "%50",
    "p100": "%100"
  },
  "kill": {
    "title": "Acil anahtarlar",
    "orderLabel": "Sıralama",
    "order": {
      "area": "Alana göre",
      "state": "Duruma göre"
    },
    "planned": "Planlı: {range}",
    "plannedActive": "Bakım sürüyor: {range}",
    "noPlan": "Planlı bakım yok · Bakım sayfası"
  },
  "group": {
    "chat": "Sohbet",
    "account": "Hesap ve mesajlaşma",
    "media": "Ses ve görüntü",
    "maintenance": "Bakım",
    "cut": "Şu an kapalı olanlar",
    "normal": "Diğerleri"
  },
  "sw": {
    "chatFrozen": "Sohbeti dondur",
    "slowModeSeconds": "Yavaş mod",
    "slower": "Yavaş modu azalt",
    "faster": "Yavaş modu artır",
    "registrationEnabled": "Yeni kayıtlar",
    "dmEnabled": "Direkt mesajlar",
    "groupCreationEnabled": "Grup oluşturma",
    "voice": "Ses",
    "video": "Görüntü",
    "screen": "Ekran",
    "media": "Ses · Görüntü · Ekran",
    "maintenanceMode": "Bakım modu"
  },
  "state": {
    "on": "Açık",
    "off": "Kapalı"
  },
  "cut": {
    "apply": "Uygula",
    "reasonPh": "Neden yapıyorsun? Denetim kaydına geçer.",
    "chatFrozen": { "title": "Sohbet dondurulsun mu?", "body": "Kimse mesaj gönderemez; yöneticiler etkilenmez. Tek tıkla geri alınır." },
    "maintenanceMode": { "title": "Bakım modu açılsın mı?", "body": "Kullanıcılar bakım ekranını görür. Planlı bakım için Bakım sayfasını kullan." },
    "registrationEnabled": { "title": "Yeni kayıtlar kapatılsın mı?", "body": "Kayıt ekranı yeni hesap açmaz; mevcut hesaplar etkilenmez." },
    "dmEnabled": { "title": "Direkt mesajlar kapatılsın mı?", "body": "Kimse yeni direkt mesaj gönderemez; sunucu kanalları çalışır." },
    "groupCreationEnabled": { "title": "Grup oluşturma kapatılsın mı?", "body": "Yeni grup açılamaz; var olan gruplar çalışır." },
    "voice": { "title": "Ses kapatılsın mı?", "body": "Sesli aramalar ve sesli kanallar başlamaz." },
    "video": { "title": "Görüntü kapatılsın mı?", "body": "Kameralar açılmaz; sesli görüşmeler sürer." },
    "screen": { "title": "Ekran paylaşımı kapatılsın mı?", "body": "Yeni ekran paylaşımı başlamaz." }
  },
  "lim": {
    "title": "Limitler",
    "reset": "Varsayılanlara dön",
    "resetTitle": "Limitler varsayılana dönsün mü?",
    "resetBody": "Mesaj uzunluğu 2.000, istek sınırı kapalı, dakikada 60 mesaj. Geri alınabilir.",
    "maxMessageLength": "Mesaj uzunluğu",
    "rateLimitGlobalMs": "İstek sınırı",
    "maxMessagesPerMinute": "Dakikada mesaj",
    "unit": {
      "maxMessageLength": "karakter",
      "rateLimitGlobalMs": "ms",
      "maxMessagesPerMinute": "mesaj"
    },
    "default": "Varsayılan {n}",
    "off": "Kapalı",
    "invalid": "Değer {min} ile {max} arasında olmalı."
  },
  "bc": {
    "title": "Yayın",
    "history": "Geçmiş · {n}",
    "historyTitle": "Son yayınlar",
    "ph": "Herkese anlık duyuru yaz…",
    "preview": "Önizle",
    "send": "Gönder",
    "last": "Son yayın {date} · {n} kişiye ulaştı",
    "none": "Henüz yayın yok",
    "noText": "Metin kaydedilmemiş",
    "more": "Hedefli ve zamanlanmış:",
    "toAnnouncements": "Duyurular",
    "toLivePopup": "Canlı pop-up",
    "previewTitle": "Kullanıcılar böyle görecek",
    "sendTitle": "Herkese gönderilsin mi?",
    "reach": "Şu an {n} kişi çevrimiçi; hepsi anında görür.",
    "seen": "Kullanıcıların göreceği",
    "seenNote": "Uygulamada 8 saniyelik bildirim olarak çıkar. Çevrimdışı olanlar görmez.",
    "desktop": "Masaüstü ve web",
    "phone": "Telefon",
    "notice": "Sunucu: {text}",
    "sendN": "{n} kişiye gönder"
  },
  "bk": {
    "title": "Yedek ve filtre",
    "last": "Son yedek {date}",
    "none": "Henüz yedek yok · şimdi indir",
    "filterMoved": "Küfür filtresi Moderasyon'a taşındı"
  },
  "rs": {
    "title": "Sunucu güvenli şekilde yeniden başlatılsın mı?",
    "sub": "{n} bağlı soket · {e} edge · Render hizmeti {svc} · tahmini kesinti {min}-{max} sn",
    "subNoSvc": "{n} bağlı soket · {e} edge · tahmini kesinti {min}-{max} sn",
    "step": {
      "stop": { "t": "Yeni bağlantıları durdur", "d": "Render sağlık kontrolü 'boşaltılıyor' döner" },
      "notify": { "t": "Kullanıcılara haber ver", "d": "Uygulamada {n} sn geri sayımlı şerit gösterilir", "dSkip": "Şerit geri sayımsız gösterilir" },
      "drain": { "t": "Soketleri boşalt", "d": "{n} → 0 · edge istemcileri ana sunucuya geçmez" },
      "backup": { "t": "Bellek yedeği al", "d": "Genel sohbet, ayarlar, denetim örneği · indirilir", "dSkip": "Bu sefer yedek indirilmeyecek" },
      "exit": { "t": "Süreci yeniden başlat", "d": "Render yeni süreci açar, istemciler kendiliğinden bağlanır" }
    },
    "time": {
      "now": "anında",
      "drain": "~20 sn",
      "exit": "~40 sn",
      "download": "indirilir",
      "skipped": "atlandı"
    },
    "backupFirst": "Önce yedeği indir",
    "notifyTeam": "Ekibe bildirim gönder",
    "skipCountdown": "Geri sayımı atla",
    "reason": "Sebep (zorunlu, denetim kaydına yazılır)",
    "reasonPh": "Örn. Bellek 900 MB'ı geçti, sızıntı şüphesi",
    "typeLabel": "Onaylamak için {word} yaz",
    "confirmWord": "YENİDEN BAŞLAT",
    "go": "Boşalt ve yeniden başlat",
    "downloading": "Yedek indiriliyor…",
    "preview": "Kullanıcıların göreceği",
    "recent": "Son yeniden başlatmalar",
    "cause": {
      "admin": "yönetici",
      "deploy": "dağıtım",
      "auto": "otomatik",
      "first": "ilk açılış"
    },
    "deploy": "Render dağıtımı {v}",
    "downtime": "{n} sn kesinti",
    "noHistory": "Henüz kayıtlı yeniden başlatma yok",
    "noHistoryTable": "Geçmiş, veritabanı tablosu kurulunca görünür",
    "maintWarn": "Planlı bakım {date}'de. Acil değilse o pencereye bırakmak kullanıcıları daha az etkiler.",
    "running": "Boşaltılıyor; adımlar sırayla ilerliyor.",
    "waiting": "Sunucu kapandı, yeni süreç bekleniyor…",
    "back": "Sunucu geri döndü · {n} sn kesinti",
    "active": "sürüyor",
    "done": "tamam",
    "left": "{n} kaldı"
  },
  "strip": {
    "text": "Yeniden başlıyor, birazdan dönüyoruz",
    "reconnecting": "Yeniden bağlanıyor…"
  },
  "toast": {
    "undo": "Geri al",
    "undone": "Geri alındı",
    "saved": "Kaydedildi",
    "noChange": "Değişiklik yok",
    "flagOn": "{name} açıldı",
    "flagOff": "{name} kapatıldı",
    "flagSaved": "{name} yayınlandı",
    "restored": "{name} önceki hâline döndü",
    "stage": "Edge aşaması: {stage}",
    "switched": "{name}: {state}",
    "slow": "Yavaş mod: {n} sn",
    "limits": "Limit kaydedildi",
    "limitsReset": "Limitler varsayılana döndü",
    "backup": "Yedek indirildi · {size}",
    "broadcast": "{n} kişiye gönderildi",
    "rollback": "Hata oranı yükseldi; {name} otomatik geri alındı"
  },
  "err": {
    "generic": "Bir şey ters gitti. Tekrar dene.",
    "load": "Sistem bilgileri yüklenemedi.",
    "stepUp": "Bu işlem için doğrulama kodu gerekiyor.",
    "reason": "Sebep gerekli.",
    "percent": "Kademeli yayılım %1 ile %99 arasında olmalı.",
    "serverWide": "Bu bayrak sunucu genelinde: yalnızca kapalı veya herkes.",
    "noStaff": "Yalnızca ekip için en az bir kişi ekle.",
    "noPlatform": "En az bir platform seç.",
    "confirm": "Onay metni eşleşmiyor.",
    "running": "Zaten bir yeniden başlatma sürüyor.",
    "stale": "Bu ayar o zamandan beri yine değişti.",
    "alreadyUndone": "Bu değişiklik zaten geri alınmış.",
    "permission": "Bu bölüm için yetkin yok.",
    "textLong": "Duyuru en fazla 500 karakter olabilir."
  }
};
