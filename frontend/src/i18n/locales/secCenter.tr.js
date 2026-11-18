/** Yönetici Paneli › Güvenlik Merkezi ("secCenter.*"). Same keys in every secCenter.<locale>.js. */
export const SEC_CENTER_TR = {
  "title": "Güvenlik merkezi",
  "subtitle": "Saldırıları canlı izle, platformu tek tuşla kilitle, her ayar değişikliğini geri alınabilir tut",
  "threatLevel": "Tehdit seviyesi: {level}",
  "level": { "normal": "Normal", "elevated": "Dikkat", "high": "Yüksek" },
  "history": "Ayar geçmişi",
  "alertsBtn": "Uyarılar",
  "emergencyLock": "Acil kilit",
  "live": "Canlı",
  "polling": "30 sn'de bir",
  "loading": "Yükleniyor…",
  "saving": "Kaydediliyor…",
  "retry": "Tekrar dene",
  "cancel": "Vazgeç",
  "close": "Kapat",
  "reason": "Sebep",
  "reasonRequired": "Sebep (zorunlu, denetim kaydına yazılır)",
  "memoryOnly": "Olay kaydı ve ayar geçmişi henüz kalıcı değil: veritabanı tabloları kurulana kadar sunucu yeniden başlarsa silinir.",
  "time": {
    "now": "şimdi",
    "nowCap": "Şimdi",
    "min": "{n} dk",
    "hour": "{n} sa",
    "day": "{n} g",
    "hm": "{h} sa {m} dk",
    "hours": "{n} saat",
    "minutes": "{n} dakika",
    "today": "Bugün {time}",
    "yesterday": "Dün {time}",
    "yesterdayShort": "Dün {time}"
  },
  "score": {
    "title": "Güvenlik puanı",
    "how": "Nasıl hesaplanır",
    "aria": "Güvenlik puanı 100 üzerinden {score}",
    "passed": "{total} kontrolden {passed} tamam",
    "lastWeek": "Geçen hafta {n}",
    "firstWeek": "Haftalık karşılaştırma için ilk ölçüm",
    "potential": "{n} öneriyi uygularsan {score} olur",
    "allApplied": "Uygulanabilecek öneri kalmadı",
    "checks": "Güvenlik kontrolleri",
    "points": "+{n} puan",
    "remind": "Hatırlat",
    "remindGo": "Hatırlatma gönder",
    "viewLocks": "Kilitler",
    "okSr": "tamam"
  },
  "grade": { "excellent": "Çok iyi", "good": "İyi", "fair": "Orta", "poor": "Zayıf" },
  "check": {
    "humanCheck": {
      "name": "Kayıtta insan doğrulaması",
      "ok": "Kayıtta insan doğrulaması açık",
      "fail": "Kayıtta insan doğrulaması kapalı",
      "why": "Bot kayıtlarını kayıt anında durdurmak için bir insan doğrulama servisi (ör. Cloudflare Turnstile) gerekir. Bu servis henüz kurulu değil; kurulana kadar kayıt dondurma ve tek kullanımlık e-posta engeli bot dalgalarına karşı korur."
    },
    "admin2fa": {
      "name": "Yöneticilerde 2FA",
      "ok": "{total} yöneticinin hepsinde 2FA açık",
      "fail": "{total} yöneticiden {missing}nde 2FA yok",
      "why": "2FA'sı olmayan yöneticiler Yönetici Paneli'ni açamaz. Hatırlatma, bu yöneticilere şu an bağlıysalar kimlik doğrulama uygulamasını açmalarını söyleyen bir bildirim gösterir."
    },
    "totpEnforced": {
      "name": "Yönetici 2FA zorunluluğu",
      "ok": "Yönetici işlemleri kodla korunuyor",
      "fail": "Yönetici 2FA zorunluluğu devrede değil",
      "why": "Kimlik doğrulama uygulaması tabloları kurulmadan yönetici işlemleri doğrulama kodu istemez. Veritabanı geçişinin uygulanması gerekir."
    },
    "dmMinAge": {
      "name": "DM için en az hesap yaşı",
      "ok": "DM için en az hesap yaşı {hours} sa",
      "fail": "DM için en az hesap yaşı yok",
      "why": "Yeni açılan hesaplar ilk saatlerinde toplu DM gönderemez; spam ve oltalama dalgalarını büyük ölçüde keser. Öneri: 24 saat."
    },
    "loginLimit": {
      "name": "Giriş denemesi sınırı",
      "ok": "Giriş denemesi sınırı {n} / dk",
      "fail": "Giriş denemesi sınırı çok yüksek ({n} / dk)",
      "why": "Bir hesaba dakikada yapılabilecek yanlış şifre denemesi. Düşük tutmak kaba kuvvet saldırılarını yavaşlatır. Öneri: 5 / dk."
    },
    "disposableEmail": {
      "name": "Tek kullanımlık e-posta engeli",
      "ok": "Tek kullanımlık e-posta engeli açık",
      "fail": "Tek kullanımlık e-posta engeli kapalı",
      "why": "Geçici e-posta servisleriyle (tempmail, yopmail…) açılan şifreli kayıtları reddeder. Bot kayıtlarının en yaygın kaynağıdır."
    },
    "messageRate": {
      "name": "Mesaj hız limiti",
      "ok": "Mesaj hız limiti {n} / dk",
      "fail": "Mesaj hız limiti güvenli aralıkta değil ({n} / dk)",
      "why": "Bir kişinin dakikada gönderebileceği mesaj sayısı. 1 ile 120 arası tutmak spam baskınlarını sınırlar. Öneri: 60 / dk."
    },
    "dmRate": {
      "name": "DM aralığı",
      "ok": "Ardışık DM aralığı {ms} ms",
      "fail": "Ardışık DM aralığı çok kısa ({ms} ms)",
      "why": "İki DM arasındaki en kısa süre. Çok kısa olursa betikler saniyede onlarca DM atabilir. Öneri: 200 ms."
    },
    "accessBans": {
      "name": "Erişim yasakları",
      "ok": "IP ve cihaz yasakları çalışıyor",
      "fail": "IP ve cihaz yasakları çalışmıyor",
      "why": "Erişim yasağı tabloları veya imza anahtarı eksik; IP ve ağ yasakları şu an kimseyi durdurmuyor."
    },
    "eventLog": {
      "name": "Güvenlik olay kaydı",
      "ok": "Güvenlik olayları kalıcı kaydediliyor",
      "fail": "Güvenlik olayları yalnızca bellekte",
      "why": "Olay tablosu kurulana kadar canlı akış sunucu yeniden başlayınca silinir ve haftalık karşılaştırma yapılamaz."
    },
    "auditLog": {
      "name": "Denetim kaydı",
      "ok": "Denetim kaydı kalıcı",
      "fail": "Denetim kaydı kalıcı değil",
      "why": "Denetim kaydı tablosu eksik; yönetici işlemleri yalnızca bellekte tutuluyor."
    },
    "noOpenLock": {
      "name": "Süresiz kilit",
      "ok": "Süresiz açık kalan kilit yok",
      "fail": "Süresiz kilit açık: {modes}",
      "why": "Elle kaldırılana kadar süren bir acil kilit unutulursa kullanıcılar gereksiz yere etkilenir."
    }
  },
  "explain": {
    "title": "Puan nasıl hesaplanır",
    "body": "Her kontrolün bir ağırlığı var; puan, geçen kontrollerin toplam ağırlığa oranıdır (100 üzerinden). Puan her 12 saatte bir kaydedilir, geçen haftayla karşılaştırılır.",
    "grades": "90 ve üzeri çok iyi, 75 ve üzeri iyi, 50 ve üzeri orta, altı zayıf."
  },
  "fix": {
    "title": "Öneriyi uygula",
    "sets": "Ayarlanacak",
    "score": "Puan",
    "apply": "Uygula",
    "all": "Tümünü uygula ({n})"
  },
  "threat": {
    "title": "Tehdit özeti",
    "window": "son 24 saat",
    "spike": "{time} kaba kuvvet dalgası",
    "calm": "Kaba kuvvet dalgası yok",
    "chartAria": "Son 24 saatte başarısız giriş, hız limiti ve engellenen IP sayıları"
  },
  "kpi": {
    "failed": "Başarısız giriş",
    "locked": "Kilitli hesap",
    "blocked": "Engellenen IP",
    "rate": "Limit aşımı",
    "vsYesterday": "{pct} dünden",
    "flat": "dünle aynı",
    "new": "dün yoktu",
    "activeBans": "{n} aktif yasak"
  },
  "legend": { "failed": "Başarısız giriş", "rate": "Hız limiti", "blocked": "Engellenen IP" },
  "locks": {
    "title": "Acil kilit modları",
    "liftAll": "Tümünü aç",
    "permanent": "Kalıcı erişim ayarları",
    "fromSystem": "Sistem’den açık",
    "sysChatFrozen": "Sohbet donduruldu",
    "chatFrozenSub": "Kimse mesaj gönderemiyor",
    "regOff": "Yeni kayıtlar kapalı",
    "regOffSub": "Yeni hesap açılamıyor",
    "openSystem": "Sistem’i aç",
    "liftsIn": "{time} sonra kalkar",
    "untilLifted": "Elle kaldırılana kadar",
    "detailAria": "{name} kilidinin ayrıntıları"
  },
  "lockMode": {
    "registration": {
      "name": "Kayıt dondurma",
      "short": "kayıt dondurma",
      "desc": "Yeni hesap açılamaz",
      "long": "Yeni hesap açılamaz (e-posta, Google, Apple). Var olan hesaplar giriş yapabilir."
    },
    "dm": {
      "name": "DM dondurma",
      "short": "DM dondurma",
      "desc": "Yeni DM gönderilemez",
      "long": "Yeni doğrudan mesaj gönderilemez, sunucu ve grup sohbetleri açık kalır."
    },
    "readOnly": {
      "name": "Salt okunur mod",
      "short": "salt okunur mod",
      "desc": "Kimse mesaj gönderemez",
      "long": "Hiçbir yerde mesaj gönderilemez, grup ve sunucu oluşturulamaz."
    }
  },
  "perm": {
    "groups": {
      "name": "Grup oluşturma",
      "on": "Kullanıcılar yeni grup açabilir",
      "off": "Yeni grup açılamıyor",
      "offTitle": "Grup oluşturma kapatılsın mı?",
      "offBody": "Kullanıcılar yeni grup açamaz; var olan gruplar çalışmaya devam eder. Yöneticiler etkilenmez."
    },
    "dm": {
      "name": "Doğrudan mesajlar",
      "on": "DM özelliği açık",
      "off": "DM özelliği kapalı",
      "offTitle": "Doğrudan mesajlar kalıcı olarak kapatılsın mı?",
      "offBody": "Kimse yeni DM gönderemez; bu kalıcı bir ayardır, kendiliğinden açılmaz. Geçici durumlar için DM dondurma kilidini kullan."
    },
    "offGo": "Kapat"
  },
  "lift": {
    "title": "{name} kaldırılsın mı?",
    "titleAll": "{n} kilit kaldırılsın mı?",
    "body": "Ayarlar kilitten önceki haline döner, kullanıcıların bilgi bandı kalkar ve denetim kaydına yazılır.",
    "go": "Kilidi kaldır"
  },
  "lockInfo": {
    "reason": "Sebep",
    "by": "Başlatan",
    "started": "Başladı",
    "ends": "Bitiş",
    "band": "Bilgi bandı",
    "extend": "Süreyi uzat",
    "plus": "+{time}",
    "lift": "Kilidi kaldır"
  },
  "lockDlg": {
    "title": "Acil kilit başlat",
    "sub": "Seçtiğin modlar tüm platformda hemen devreye girer; yöneticiler etkilenmez.",
    "modes": "Kilitlenecekler",
    "alreadyOn": "Etkin · {time}",
    "duration": "Otomatik bitiş",
    "reason": "Sebep (zorunlu, denetim kaydına yazılır)",
    "reasonPh": "Ne oluyor? Ör. 20:09'dan beri tek kaynaktan kaba kuvvet ve bot kayıt dalgası.",
    "code": "Doğrulama kodu",
    "banner": "Kullanıcılara bilgi bandı göster",
    "pickOne": "En az bir kilit seç",
    "starting": "Başlatılıyor…",
    "confirm": {
      "15m": "{n, plural, one {Kilidi 15 dakikalığına başlat} other {# kilidi 15 dakikalığına başlat}}",
      "1h": "{n, plural, one {Kilidi 1 saatliğine başlat} other {# kilidi 1 saatliğine başlat}}",
      "6h": "{n, plural, one {Kilidi 6 saatliğine başlat} other {# kilidi 6 saatliğine başlat}}",
      "24h": "{n, plural, one {Kilidi 24 saatliğine başlat} other {# kilidi 24 saatliğine başlat}}",
      "manual": "{n, plural, one {Kilidi elle kaldırılana kadar başlat} other {# kilidi elle kaldırılana kadar başlat}}"
    },
    "impact": "Etki önizlemesi",
    "online": "Çevrim içi kullanıcı",
    "signups": "Son 1 saatte yeni kayıt",
    "dms": "Son 1 saatte yeni DM",
    "autoEnd": "Otomatik kalkış",
    "bandTitle": "Kullanıcının göreceği bant",
    "device": "Önizleme cihazı",
    "desktop": "Masaüstü",
    "phone": "Telefon",
    "noBand": "Bilgi bandı gösterilmeyecek",
    "pickForBand": "Bir kilit seçince bant burada görünür",
    "registrationWhere": "Kayıt olmaya çalışanlar bu mesajı kayıt ekranında görür.",
    "noteAuto": "Süre dolduğunda ayarlar kilitten önceki haline döner ve yönetici odasına bildirim gider.",
    "noteManual": "Kilit sen kaldırana kadar sürer. Unutulmasın diye Uyarılar menüsünde ve puanda görünür."
  },
  "duration": { "15m": "15 dk", "1h": "1 saat", "6h": "6 saat", "24h": "24 saat", "manual": "Elle kaldırılana kadar" },
  "band": {
    "registration": "Yeni kayıtlar geçici olarak kapalı. {when}",
    "dm": "DM gönderimi geçici olarak kapalı. {when}",
    "readOnly": "Descall kısa bir süre salt okunur. Mesaj gönderilemiyor. {when}",
    "when": {
      "15m": "Yaklaşık 15 dakika içinde açılacak.",
      "1h": "Yaklaşık 1 saat içinde açılacak.",
      "6h": "Yaklaşık 6 saat içinde açılacak.",
      "24h": "Yaklaşık 24 saat içinde açılacak."
    },
    "whenManual": "En kısa sürede açılacak."
  },
  "feed": {
    "title": "Canlı tehdit akışı",
    "sub": "giriş, kayıt, hız limiti ve erişim yasağı olayları",
    "openAll": "Tümünü aç",
    "collapse": "Daralt",
    "filters": "Olay türü",
    "pause": "Akışı duraklat",
    "resume": "Akışı sürdür",
    "export": "CSV olarak indir",
    "newEvents": "{n, plural, one {# yeni olay · göster} other {# yeni olay · göster}}",
    "emptyTitle": "Sakin görünüyor",
    "emptyBody": "Son günlerde güvenlik olayı yok. Yeni olaylar burada canlı belirir.",
    "emptyFilter": "Bu türde olay yok.",
    "loadMore": "Daha eski olaylar",
    "sourceFilter": "Kaynak: {ip}",
    "clearSource": "Kaynak filtresini kaldır"
  },
  "filter": {
    "all": "Tümü",
    "bruteForce": "Kaba kuvvet",
    "failedLogin": "Başarısız giriş",
    "blockedIp": "Engellenen IP",
    "rateLimit": "Hız limiti",
    "signupDenied": "Kayıt reddi"
  },
  "ev": {
    "unknownAccount": "olmayan bir hesap",
    "brute_force": {
      "title": "Kaba kuvvet saldırısı",
      "line": "{accounts} hesaba {minutes} dakikada {attempts} deneme",
      "lineUser": "{user} dahil {accounts} hesaba {minutes} dakikada {attempts} deneme"
    },
    "failed_login": {
      "title": "Başarısız giriş",
      "lineUser": "{user} · yanlış şifre, {n} deneme",
      "lineUnknown": "Kayıtlı olmayan kullanıcı adı · {n} deneme"
    },
    "account_locked": {
      "title": "Hesap geçici kilitlendi",
      "lineMinute": "{user} · 1 dakikada {n} başarısız giriş, bekleme süresi",
      "lineWindow": "{user} · 15 dakikada çok fazla deneme, {n} kez reddedildi"
    },
    "ip_blocked": {
      "title": "IP sınırı aşıldı",
      "lineLogin": "Giriş denemeleri IP sınırını aştı · {n} kez reddedildi",
      "lineRegister": "Kayıt denemeleri IP sınırını aştı · {n} kez reddedildi"
    },
    "access_ban": {
      "title": "Erişim yasağına takıldı",
      "line": "{kind} {label} · {action} denemesi"
    },
    "rate_limit": {
      "title": "Hız limiti aşıldı",
      "line": "{user} · mesaj sınırı {limit} / dk, {n} deneme reddedildi"
    },
    "signup_denied": {
      "title": "Kayıt reddedildi",
      "lineDisposable": "{email} · tek kullanımlık e-posta",
      "lineClosed": "Kayıtlar kapalıyken {method} ile kayıt · {n} deneme"
    },
    "admin_step_up": {
      "title": "Yönetici adım doğrulaması",
      "lineOk": "{user} · kod doğru",
      "lineFail": "{user} · yanlış kod, {n} deneme"
    }
  },
  "banKind": { "ip": "IP yasağı", "network": "Ağ yasağı", "device": "Cihaz yasağı" },
  "banAction": { "login": "giriş", "register": "kayıt", "socket": "bağlantı", "oauth": "Google / Apple girişi", "api": "uygulama isteği" },
  "method": { "email": "e-posta", "google": "Google", "apple": "Apple" },
  "act": {
    "banIp": "IP engelle",
    "banNet": "Ağı engelle",
    "banUser": "Yasakla",
    "inspect": "İncele",
    "viewBan": "Yasak",
    "session": "Oturum"
  },
  "csv": { "time": "Zaman", "type": "Tür", "count": "Sayı", "source": "Kaynak", "network": "Ağ", "account": "Hesap", "detail": "Ayrıntı" },
  "sources": {
    "title": "En çok deneme yapan kaynaklar",
    "ban": "Engelle",
    "banned": "Engellendi",
    "empty": "Son 24 saatte deneme yapan kaynak yok.",
    "openFeed": "Bu kaynağın olaylarını göster",
    "unknownPlace": "Konum bilinmiyor"
  },
  "srcBan": {
    "title": "{ip} engellensin mi?",
    "sub": "Erişim yasağı bu adresten giriş, kayıt ve bağlantıyı durdurur; yöneticiler etkilenmez.",
    "what": "Ne engellensin",
    "ip": "Yalnızca bu IP",
    "network": "Tüm ağ (/24)",
    "netWarn": "Ağ yasağı aynı ağdaki herkesi engeller (ör. bir yurt veya iş yeri).",
    "duration": "Süre",
    "reasonPh": "Ör. 9 dakikada 214 deneme, 37 hesap",
    "privacy": "Adresin kendisi saklanmaz; yasak, olayla birlikte tutulan şifreli parmak iziyle yapılır.",
    "goIp": "IP'yi engelle",
    "goNet": "Ağı engelle",
    "banning": "Engelleniyor…"
  },
  "banDur": { "1d": "1 gün", "7d": "7 gün", "30d": "30 gün", "90d": "90 gün", "permanent": "Kalıcı" },
  "evd": {
    "title": "Olay",
    "when": "Zaman",
    "count": "Tekrar",
    "countVal": "{n} kez, ilki {from}",
    "source": "Kaynak",
    "network": "Ağ",
    "account": "Hesap",
    "status": "Kaynak durumu",
    "noSource": "Adres yok (uygulama içi)",
    "noAccount": "Hesap yok",
    "sourceBanned": "Yasaklı",
    "sourceOpen": "Yasak yok",
    "openUser": "Kullanıcı dosyası",
    "openBans": "Erişim yasakları",
    "allFromSource": "Bu kaynağın tüm olayları",
    "copy": "Özeti kopyala",
    "copied": "Kopyalandı",
    "timeline": "Aynı kaynak ve hesaptan son olaylar",
    "noRelated": "Başka olay yok."
  },
  "hist": {
    "heading": "Ayar değişikliği geçmişi",
    "sub": "Güvenlik ayarlarındaki her değişiklik, kim yaptığı ve önceki değeriyle",
    "filters": "Değişiklik türü",
    "cat": { "all": "Tümü", "locks": "Kilitler", "rateLimits": "Hız limitleri", "signup": "Kayıt koruması", "access": "Erişim" },
    "system": "sistem",
    "before": "önce",
    "after": "sonra",
    "noReason": "Sebep yazılmamış",
    "autoExpired": "Süre doldu, kilit kendiliğinden kalktı",
    "revert": "Geri al",
    "reverting": "Geri alınıyor…",
    "reverted": "Geri alındı {user}",
    "isRevert": "Geri alma",
    "expired": "Süresi doldu",
    "confirmTitle": "Bu değişiklik geri alınsın mı?",
    "revertOne": "{name} {to} değerinden {from} değerine döner.",
    "revertMany": "{n} ayar önceki değerine döner.",
    "revertLock": "Kilit ({modes}) şimdi kaldırılır.",
    "revertAudited": "Geri alma da denetim kaydına yazılır.",
    "stale": "Bu ayar o zamandan beri yeniden değişti; geri alma son değerin üzerine yazar.",
    "reasonPh": "Ör. Baskın bitti, normal sınıra dönüyoruz.",
    "memoryOnly": "Geçmiş henüz kalıcı değil: tablo kurulana kadar sunucu yeniden başlarsa silinir.",
    "emptyTitle": "Henüz değişiklik yok",
    "emptyBody": "Güvenlik ve sistem ayarlarındaki her değişiklik burada önceki değeriyle görünür.",
    "loadMore": "Daha eski değişiklikler",
    "title": {
      "lock": "Acil kilit: {modes}",
      "lockLift": "Acil kilit kaldırıldı: {modes}",
      "lockExpired": "Acil kilit süresi doldu: {modes}",
      "lockExtend": "Acil kilit süresi değişti: {modes}",
      "settings": "Güvenlik ayarları ({n})",
      "recommended": "Önerilen ayarlar uygulandı",
      "revert": "Geri alındı: {title}"
    }
  },
  "setting": {
    "registrationEnabled": "Kayıtlar",
    "dmEnabled": "Doğrudan mesajlar",
    "readOnlyMode": "Salt okunur mod",
    "groupCreationEnabled": "Grup oluşturma",
    "maxLoginAttempts": "Giriş denemesi sınırı",
    "maxMessagesPerMinute": "Mesaj hız limiti",
    "dmRateLimitMs": "DM aralığı",
    "dmMinAccountAgeHours": "DM için en az hesap yaşı",
    "disposableEmailBlock": "Tek kullanımlık e-posta engeli",
    "chatFrozen": "Sohbet dondurma",
    "maintenanceMode": "Bakım modu",
    "slowModeSeconds": "Yavaş mod",
    "rateLimitGlobalMs": "Genel mesaj aralığı",
    "maxMessageLength": "En uzun mesaj"
  },
  "val": {
    "on": "açık",
    "off": "kapalı",
    "none": "yok",
    "rule": "kademeli kural",
    "untilLifted": "elle kaldırılana kadar",
    "autoOnAt": "{time} otomatik açılır",
    "autoOffAt": "{time} otomatik kapanır"
  },
  "unit": { "perMin": "{n} / dk", "ms": "{n} ms", "hours": "{n} sa" },
  "alerts": {
    "title": "Uyarılar",
    "none": "Şu an dikkat gerektiren bir şey yok.",
    "desktop": "Kaba kuvvet dalgasında masaüstü bildirimi",
    "desktopHint": "Bu sayfa açıkken, bu tarayıcıda",
    "desktopBlocked": "Tarayıcı bildirimlere izin vermiyor.",
    "notifyTitle": "Kaba kuvvet dalgası",
    "notifyBody": "{ip} kaynağından çok sayıda hesaba giriş denemesi",
    "burst": { "title": "Kaba kuvvet dalgası", "body": "{ip} kaynağından, son 24 saatte {count} dalga" },
    "lock": { "title": "{mode} açık", "body": "{time} sonra kendiliğinden kalkar" },
    "lockOpen": { "title": "{mode} süresiz açık", "body": "Elle kaldırılana kadar sürüyor" },
    "failedSpike": { "title": "Başarısız girişlerde artış", "body": "Dünden {pct}% fazla" },
    "lockedSpike": { "title": "Kilitlenen hesaplarda artış", "body": "Dünden {n} fazla hesap kilitlendi" },
    "admin2fa": { "title": "2FA'sı olmayan yönetici var", "body": "{total} yöneticiden {missing}nde 2FA yok" }
  },
  "toast": {
    "saved": "Ayar kaydedildi, geçmişe yazıldı.",
    "applied": "Öneri uygulandı.",
    "appliedAll": "{n} öneri uygulandı.",
    "locked": "{n, plural, one {Kilit başladı.} other {# kilit başladı.}}",
    "lifted": "Kilit kaldırıldı.",
    "extended": "Kilit süresi güncellendi.",
    "reverted": "Değişiklik geri alındı.",
    "reminded": "{n} yöneticiye hatırlatma gönderildi, {online} kişi şu an gördü.",
    "bannedIp": "IP engellendi, {kicked} bağlantı kesildi.",
    "bannedNet": "Ağ engellendi, {kicked} bağlantı kesildi.",
    "userBanned": "Kullanıcı yasaklandı."
  },
  "err": {
    "generic": "Bir şeyler ters gitti. Tekrar dene.",
    "load": "Güvenlik verileri yüklenemedi.",
    "REASON_REQUIRED": "Bir sebep yaz.",
    "ALREADY_ON": "Bu kilit zaten açık.",
    "BAD_DURATION": "Geçersiz süre.",
    "NO_MODES": "En az bir kilit seç.",
    "NOT_ON": "Bu kilit açık değil.",
    "LOCK_ENDED": "Bu kilit zaten sona erdi.",
    "ALREADY_REVERTED": "Bu değişiklik zaten geri alındı.",
    "NOT_REVERTIBLE": "Bu değişiklik geri alınamaz.",
    "ALREADY_BANNED": "Bu adres zaten yasaklı.",
    "SOURCE_NOT_FOUND": "Bu kaynak artık güvenlik akışında yok.",
    "BANS_UNAVAILABLE": "Erişim yasakları henüz etkin değil.",
    "ADMIN_PERMISSION_DENIED": "Bu işlem için yetkin yok.",
    "STEP_UP_REQUIRED": "Bu işlem doğrulama kodu istiyor.",
    "replay": "Bu kod az önce kullanıldı. Sonraki kodu bekle.",
    "invalid": "Kod yanlış."
  },
  "notice": {
    "dm": "DM gönderimi geçici olarak kapalı.",
    "readOnly": "Descall kısa bir süre salt okunur; şu an mesaj gönderilemiyor.",
    "registration": "Yeni kayıtlar geçici olarak kapalı.",
    "until": "Yaklaşık {time} açılacak.",
    "soon": "En kısa sürede açılacak.",
    "dismiss": "Bandı gizle"
  }
};
