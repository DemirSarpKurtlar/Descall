/** Passkeys ("passkey.*"): sign-in entry, Settings > Security (control center, draft A), sign-in states, post-sign-in suggestion, "not me" page, re-auth, errors, desktop handoff page. Same keys in every passkey.<locale>.js. */
export const PASSKEY_TR = {
  "signIn": {
    "button": "Passkey ile giriş yap",
    "busy": "Passkey bekleniyor…",
    "handoffTitle": "Tarayıcında devam et",
    "handoffLead": "Descall tarayıcında açıldı. Oradaki kodun {code} olduğunu kontrol et ve passkey'inle onayla.",
    "handoffReopen": "Sayfayı yeniden aç",
    "cancel": "Vazgeç",
    "autofillHint": "Kullanıcı adı alanına dokununca kayıtlı passkey'lerin de görünür."
  },
  "settings": {
    "title": "Passkey'ler",
    "lead": "Şifren her zaman kalır. Passkey, parmak izin, yüzün veya cihaz PIN'inle daha hızlı ve güvenli giriş yapmanın ek bir yolu.",
    "empty": "Henüz passkey eklemedin.",
    "add": "Passkey ekle",
    "nameLabel": "Passkey adı",
    "namePlaceholder": "Ad (isteğe bağlı), örneğin İş bilgisayarı",
    "created": "Eklendi: {date}",
    "lastUsed": "Son kullanım: {date}",
    "neverUsed": "Henüz kullanılmadı",
    "synced": "Senkronize",
    "thisDevice": "Tek cihaz",
    "suspended": "Kapatıldı: kopyalanmış olabilir. Kaldırıp yenisini ekle.",
    "rename": "Yeniden adlandır",
    "save": "Kaydet",
    "cancel": "Vazgeç",
    "remove": "Kaldır",
    "removeTitle": "Passkey kaldırılsın mı?",
    "removeLead": "\"{name}\" ile artık giriş yapamazsın. Şifrenle ve diğer passkey'lerinle giriş yapmaya devam edersin. Cihazındaki kopyayı cihazın şifre ayarlarından da silebilirsin.",
    "added": "Passkey eklendi.",
    "removed": "Passkey kaldırıldı.",
    "renamed": "Ad kaydedildi.",
    "unavailableHere": "Bu cihaz veya tarayıcı passkey desteklemiyor. Desteklenen bir cihazdan ekleyebilirsin.",
    "loadFailed": "Passkey'ler yüklenemedi.",
    "sessionMethod": "Passkey ile",
    "retry": "Tekrar dene",
    "count": "{count, plural, one {# passkey} other {# passkey}}",
    "platform": {
      "web": "Web",
      "ios": "iPhone / iPad",
      "android": "Android",
      "windows": "Windows",
      "electron": "Masaüstü",
      "macos": "Mac",
      "linux": "Linux",
      "other": "Diğer"
    }
  },
  "reauth": {
    "title": "Önce kimliğini doğrula",
    "lead": "Passkey eklemek için hesabın sana ait olduğunu doğrula.",
    "password": "Mevcut şifre",
    "code": "6 haneli kod",
    "sendCode": "E-postama kod gönder",
    "codeSent": "{email} adresine kod gönderildi.",
    "withPasskey": "Mevcut passkey ile doğrula",
    "totpHint": "Doğrulama uygulamandaki kodu da girebilirsin.",
    "continue": "Devam"
  },
  "err": {
    "cancelled": "İptal edildi.",
    "no_credential": "Bu cihazda Descall için kayıtlı passkey yok. Şifrenle giriş yap, sonra Ayarlar > Güvenlik bölümünden passkey ekle.",
    "timeout": "Süre doldu. Tekrar dene.",
    "already_registered": "Bu cihazda zaten bir Descall passkey'in var.",
    "unsupported": "Bu cihaz passkey desteklemiyor.",
    "security": "Bu cihaz Descall alan adını henüz doğrulamadı. Biraz sonra tekrar dene.",
    "busy": "Başka bir passkey isteği açık.",
    "aborted": "İptal edildi.",
    "network": "Descall'a ulaşılamıyor. Bağlantını kontrol et.",
    "server": "Bir şeyler ters gitti. Tekrar dene.",
    "unknown": "Passkey işlemi tamamlanamadı. Tekrar dene.",
    "uvRequired": "Cihazın senin olduğunu doğrulamadı (PIN, parmak izi veya yüz). Tekrar dene ya da şifrenle giriş yap.",
    "unknownCredential": "Bu passkey artık hesabında değil. Şifrenle giriş yap.",
    "suspended": "Bu passkey kopyalanmış olabileceği için kapatıldı. Şifrenle giriş yap ve Ayarlar > Güvenlik bölümünden kaldır.",
    "unavailable": "Passkey şu anda kullanılamıyor. Şifrenle giriş yap.",
    "reauthRequired": "Önce kimliğini doğrula.",
    "limit": "En fazla passkey sayısına ulaştın. Önce birini kaldır.",
    "handoffExpired": "Bağlantının süresi doldu. Yeniden başlat.",
    "badPassword": "Şifre yanlış.",
    "badCode": "Kod yanlış.",
    "badName": "Bir ad gir.",
    "rateLimited": "Çok fazla deneme. Biraz bekle."
  },
  "desktop": {
    "title": "Descall masaüstü uygulaması için passkey",
    "signinLead": "Descall uygulamasında giriş yapmak için passkey'ini kullan.",
    "registerLead": "@{username} hesabına bu tarayıcıdan veya telefonundan bir passkey ekle.",
    "matchLabel": "Uygulamadaki kod",
    "matchHint": "Bu kod Descall uygulamasında gördüğün kodla aynı değilse devam etme.",
    "signinButton": "Passkey ile onayla",
    "registerButton": "Passkey oluştur",
    "doneSignin": "Tamam. Descall uygulamasına dönebilirsin.",
    "doneRegister": "Passkey eklendi. Descall uygulamasına dönebilirsin.",
    "expired": "Bu bağlantının süresi doldu ya da kullanıldı. Descall uygulamasında yeniden başlat.",
    "noCode": "Bu sayfa Descall masaüstü uygulamasından açılır.",
    "unsupported": "Bu tarayıcı passkey desteklemiyor. Güncel bir Chrome, Edge, Safari veya Firefox ile aç.",
    "loading": "Yükleniyor…"
  },
  "login": {
    "button": {
      "passkey": "Passkey ile giriş yap",
      "face": "Face ID ile giriş yap",
      "finger": "Parmak iziyle giriş yap",
      "hello": "Windows Hello ile giriş yap"
    },
    "note": "Face ID, parmak izi ya da Windows Hello. Şifren de her zaman geçerli."
  },
  "state": {
    "method": {
      "windows": "Windows Hello",
      "ios": "Face ID",
      "android": "Parmak izi",
      "web": "Passkey"
    },
    "waitTitle": {
      "windows": "Windows Hello bekleniyor",
      "ios": "Face ID bekleniyor",
      "android": "Parmak izi bekleniyor",
      "web": "Passkey bekleniyor"
    },
    "waitLead": {
      "windows": "Açılan sistem penceresinde yüzünü, parmak izini ya da PIN'ini kullan.",
      "ios": "Açılan sistem penceresinde Face ID'yi kullan.",
      "android": "Açılan sistem penceresinde parmak izini ya da ekran kilidini kullan.",
      "web": "Tarayıcının açtığı pencerede passkey'ini seç ve onayla."
    },
    "okTitle": "Hoş geldin, {name}",
    "okTitleNoName": "Hoş geldin",
    "okLead": "{method} ile girdin. Bu giriş 2 adımlı doğrulama sayılır, kod sormuyoruz.",
    "okProgress": "Sunucuların açılıyor",
    "cancelTitle": "Giriş iptal edildi",
    "cancelLead": "Sorun değil. Tekrar deneyebilir ya da şifrenle girebilirsin.",
    "retry": "Tekrar dene",
    "password": "Şifreyle gir",
    "errTitle": "Passkey doğrulanamadı",
    "errLead": "Bu passkey hesabından kaldırılmış olabilir ya da istek zaman aşımına uğradı.",
    "errDetail": "Ayrıntı: {detail}",
    "noneTitle": "Bu cihazda passkey yok",
    "noneLead": "Descall passkey'in başka bir cihazda olabilir.",
    "optPhone": "Telefonunla giriş yap",
    "optPhoneSub": "Kodu passkey'li telefonla tara",
    "optKey": "Güvenlik anahtarı",
    "optKeySub": "USB veya NFC",
    "optPassword": "Şifreyle giriş yap",
    "optPasswordSub": "Sonra bu cihaza passkey ekleyebilirsin",
    "label": {
      "wait": "Sistem penceresi açık",
      "ok": "Başarılı",
      "cancel": "İptal edildi",
      "err": "Hata",
      "none": "Bu cihazda passkey yok"
    },
    "foot": {
      "windows": {
        "wait": "Windows Hello penceresi açık (yüz, parmak izi ya da PIN).",
        "ok": "Bir an sonra uygulama açılır.",
        "cancel": "Windows penceresinde İptal'e basıldı.",
        "err": "Sunucu passkey'i tanımadı ya da süre doldu.",
        "none": "Windows bu bilgisayarda Descall passkey'i bulamadı."
      },
      "ios": {
        "wait": "iOS alt penceresi ve Face ID animasyonu açık.",
        "ok": "Haptik onay, ardından sohbetler açılır.",
        "cancel": "Sistem penceresi kapatıldı.",
        "err": "Sunucu passkey'i tanımadı ya da süre doldu.",
        "none": "iCloud Anahtar Zinciri'nde Descall passkey'i yok."
      },
      "android": {
        "wait": "Google Şifre Yöneticisi alt penceresi açık.",
        "ok": "Titreşimli onay, ardından sohbetler açılır.",
        "cancel": "Pencere geri tuşuyla kapatıldı.",
        "err": "Sunucu passkey'i tanımadı ya da süre doldu.",
        "none": "Bu telefonda Descall passkey'i yok."
      }
    }
  },
  "os": {
    "winHeader": "Windows Güvenliği",
    "winTitle": "Passkey ile oturum aç",
    "winText": "{site} hesabına oturum açmak için Windows Hello'yu kullan.",
    "winRecognizing": "Seni tanımaya çalışıyor",
    "winMore": "Diğer seçenekler",
    "cancel": "İptal",
    "qrTitle": "Telefonunla oturum aç",
    "qrText": "Passkey'in kayıtlı olduğu telefonun kamerasıyla bu kodu tara.",
    "usbTitle": "Güvenlik anahtarını kullan",
    "usbText": "Güvenlik anahtarını USB bağlantı noktasına tak ve üzerindeki düğmeye dokun.",
    "usbWait": "Anahtar bekleniyor",
    "gpmHeader": "Google Şifre Yöneticisi",
    "gpmTitle": "Kayıtlı passkey'ini kullan",
    "gpmText": "descall.com için. Bilgisayarının ekran kilidiyle onayla.",
    "webText": "{provider} içindeki passkey'ini seç ve onayla.",
    "iosTitle": "Oturum aç",
    "iosText": "descall.com için kayıtlı passkey'ini kullanmak istiyor musun?",
    "iosSub": "iCloud Anahtar Zinciri · Passkey",
    "continue": "Devam",
    "nfcTitle": "Güvenlik anahtarı",
    "nfcText": "Anahtarı telefonun üst kenarına yaklaştır.",
    "nfcSub": "NFC ile",
    "nfcWait": "Bekleniyor",
    "andText": "Descall'da oturum açmak için",
    "andSub": "Passkey · Google Şifre Yöneticisi",
    "andTouch": "Parmak izi sensörüne dokun"
  },
  "preview": {
    "title": "Girişte göreceğin",
    "live": "Canlı",
    "selected": "Seçili: {name}. Bu passkey ile girişte açılan pencere:",
    "desktop": "Masaüstü · Windows",
    "phone": "Telefon",
    "text": {
      "windows": "Windows Hello passkey'i yalnızca bu bilgisayarda. Telefonda görünmez; orada şifre ya da telefonun kendi passkey'i kullanılır.",
      "ios": "iCloud Anahtar Zinciri: iPhone, iPad ve Mac'te tek dokunuş. Windows'ta karekodu iPhone ile tarayıp onaylarsın.",
      "mac": "iCloud Anahtar Zinciri: Mac, iPhone ve iPad'de tek dokunuş. Windows'ta karekodu iPhone ile tarayıp onaylarsın.",
      "android": "Google Şifre Yöneticisi: Android ve Chrome'da görünür.",
      "key": "Güvenlik anahtarı: her cihazda çalışır; bilgisayarda USB, telefonda NFC ile.",
      "web": "{provider}: bu yöneticinin kurulu olduğu tarayıcı ve telefonlarda görünür."
    },
    "idle": "{count, plural, one {# gündür kullanılmadı.} other {# gündür kullanılmadı.}}",
    "states": "Durumlar",
    "platform": "Platform",
    "plat": {
      "windows": "Windows",
      "ios": "iPhone",
      "android": "Android"
    }
  },
  "time": {
    "today": "Bugün {time}",
    "yesterday": "Dün {time}",
    "yesterdayShort": "Dün",
    "daysAgo": "{count, plural, one {# gün önce} other {# gün önce}}",
    "never": "Hiç kullanılmadı",
    "now": "şimdi"
  },
  "center": {
    "crumbLabel": "Konum",
    "crumbSecurity": "Güvenlik",
    "lead": "Şifresiz ve hızlı giriş. Şifren de geçerli kalır.",
    "kpi": {
      "count": "Passkey",
      "platforms": "{count, plural, one {# platformda} other {# platformda}}",
      "share": "Passkey girişi",
      "basis": "Son {count} oturuma göre",
      "mixLabel": "Passkey %{passkey}, şifre %{password}, Google ve Apple %{social}",
      "noData": "Henüz veri yok",
      "speed": "Ortalama giriş",
      "seconds": "{s} sn",
      "passwordSpeed": "Şifreyle: {s} sn",
      "noMeasure": "Henüz ölçüm yok",
      "decimal": ",",
      "security": "Güvenlik",
      "methods": "{count, plural, one {# yöntem} other {# yöntem}}"
    },
    "level": {
      "excellent": "Çok iyi",
      "good": "İyi",
      "fair": "Orta",
      "weak": "Zayıf"
    },
    "check": {
      "password": "Şifre ya da doğrulanmış giriş",
      "email": "Doğrulanmış e-posta",
      "secondFactor": "İki adımlı doğrulama",
      "passkey": "En az bir passkey",
      "backup": "Farklı platformda ikinci passkey",
      "fresh": "Kullanılmayan ya da kapalı passkey yok"
    },
    "chip": {
      "password": "Şifre",
      "alwaysOn": "Her zaman açık",
      "none": "Yok",
      "app": "Doğrulama uygulaması",
      "email2fa": "E-posta kodu",
      "on": "Açık",
      "off": "Kapalı",
      "passkey": "Passkey",
      "registered": "{count} kayıtlı"
    },
    "stale": "\"{name}\" passkey'i {count} gündür kullanılmadı. O cihazı artık kullanmıyorsan kaldırman iyi olur.",
    "suspendedShort": "kopyalanmış olabileceği için kapatıldı. Kaldırıp yenisini ekle.",
    "review": "İncele",
    "offline": "Bağlantı yok. Değişiklikler bağlanınca yapılabilir; liste bağlanınca yenilenir.",
    "col": {
      "passkey": "Passkey",
      "last": "Son kullanım",
      "added": "Eklendi",
      "usage": "30 gün"
    },
    "pill": {
      "thisDevice": "Bu cihaz",
      "days": "{count} gün",
      "off": "Kapalı",
      "counts2fa": "2FA sayılır",
      "localOnly": "Yalnızca bu cihaz",
      "synced": "Eşitlenir",
      "noSync": "Eşitlenmez"
    },
    "kind": {
      "windows": "Windows Hello",
      "ios": "iCloud Anahtar Zinciri",
      "mac": "iCloud Anahtar Zinciri",
      "android": "Google Şifre Yöneticisi",
      "key": "Güvenlik anahtarı",
      "web": "Passkey"
    },
    "client": {
      "web": "Web",
      "ios": "iPhone",
      "android": "Android",
      "windows": "Masaüstü",
      "electron": "Masaüstü",
      "macos": "Mac",
      "linux": "Linux",
      "other": "Diğer"
    },
    "via": {
      "web": "Web",
      "ios": "iPhone uygulaması",
      "android": "Android uygulaması",
      "windows": "Masaüstü uygulaması",
      "electron": "Masaüstü uygulaması",
      "macos": "Mac",
      "linux": "Linux",
      "other": "Diğer"
    },
    "sync": {
      "local": "Yalnızca bu cihaz",
      "icloud": "iPhone, iPad ve Mac ile eşitlenir",
      "google": "Android ve Chrome ile eşitlenir",
      "key": "USB / NFC, eşitlenmez",
      "manager": "{provider} ile eşitlenir",
      "synced": "Cihazların arasında eşitlenir"
    },
    "drawer": {
      "sync": "Eşitleme",
      "created": "Oluşturuldu",
      "where": "Nerede",
      "lastUsed": "Son kullanım",
      "place": "Konum",
      "placeUnknown": "Bilinmiyor",
      "total": "Toplam giriş",
      "last30": "Son 30 gün",
      "count30": "{count, plural, one {# giriş} other {# giriş}}",
      "info": "Bu passkey ile girişte ayrıca kod sorulmaz; giriş 2 adımlı doğrulama sayılır.",
      "rename": "Adını değiştir"
    },
    "remove": {
      "title": "\"{name}\" kaldırılsın mı?",
      "lead": "Bu passkey ile artık giriş yapılamaz. Şifren ve diğer passkey'lerin etkilenmez.",
      "current": "Şu an bu passkey ile girdin; bu oturum açık kalır.",
      "reason": "Sebep",
      "reasons": {
        "lost": "Cihazı kaybettim",
        "unused": "Artık kullanmıyorum",
        "readd": "Yeniden ekleyeceğim",
        "other": "Diğer"
      },
      "endSessions": "Bu passkey ile açılan diğer oturumları da kapat",
      "sessionsEnded": "{count, plural, one {# oturum kapatıldı.} other {# oturum kapatıldı.}}"
    },
    "added": {
      "title": "Passkey eklendi",
      "sub": "{provider} · bu cihaz",
      "name": "Adı",
      "undo": "Geri al",
      "undone": "Geri alındı, passkey kaldırıldı."
    },
    "names": {
      "home": "Ev bilgisayarı",
      "work": "İş bilgisayarı",
      "laptop": "Dizüstü",
      "gaming": "Oyun PC",
      "macbook": "MacBook",
      "iphone": "iPhone'um",
      "ipad": "iPad",
      "phone": "Telefonum",
      "tablet": "Tablet",
      "keyMain": "Ana anahtar",
      "keyBackup": "Yedek anahtar",
      "keyChain": "Anahtarlıktaki"
    },
    "add": {
      "ready": "Hazır. Devam edince cihazının passkey penceresi açılır.",
      "thisDevice": {
        "passkey": "Bu cihaz ya da tarayıcının şifre yöneticisi",
        "face": "Bu iPhone · Face ID",
        "finger": "Bu telefon · parmak izi",
        "hello": "Bu bilgisayar · Windows Hello"
      },
      "prefer": {
        "remoteDevice": "Telefonunda: karekodu tara, telefonunla kaydet",
        "securityKey": "Güvenlik anahtarı: USB ya da NFC"
      }
    },
    "activity": {
      "title": "Son etkinlik",
      "all": "Tümü",
      "empty": "Henüz etkinlik yok.",
      "signin": "{name} ile giriş",
      "added": "{name} eklendi",
      "renamed": "{name} olarak adlandırıldı",
      "removed": "{name} kaldırıldı",
      "new_place": "{name} yeni bir yerden kullanıldı",
      "suspended": "{name} kapatıldı",
      "report_confirmed": "{name}: \"Bendim\" yanıtı",
      "report_revoked": "{name}: \"Ben değildim\", oturumlar kapatıldı"
    },
    "backup": {
      "cap": "Yedek önerisi",
      "title": "İkinci bir passkey ekle",
      "lead": "Tek cihazı kaybedersen diğeriyle girersin. Farklı platform en güvenlisi.",
      "remoteDevice": "Telefonunda ekle",
      "remoteDeviceSub": "Karekodu tara, telefonunla kaydet",
      "securityKey": "Güvenlik anahtarı",
      "securityKeySub": "USB ya da NFC",
      "computer": "Bilgisayarında ekle",
      "computerSub": "descall.com › Ayarlar › Güvenlik › Passkey'ler"
    },
    "email": {
      "cap": "Güvenlik e-postası",
      "title": "Hesabına yeni bir passkey eklendi",
      "body": "\"{name}\" adlı passkey{provider} {when} tarihinde {from} eklendi. Sen değilsen hemen kaldır ve şifreni değiştir.",
      "fromPlace": "{place} konumundan",
      "fromSomewhere": "bilinmeyen bir konumdan",
      "notMe": "Ben değildim",
      "itWasMe": "Bendim",
      "lead": "Yeni passkey eklendiğinde ya da biri yeni bir yerden kullanıldığında bu e-posta gelir. \"Ben değildim\" passkey'i kaldırır ve tüm oturumları kapatır.",
      "noEmail": "E-posta adresin doğrulanmadığı için bu e-postalar gelmez. Güvenlik bölümünden doğrulayabilirsin."
    },
    "alert": {
      "cap": "Olağan dışı kullanım",
      "titleCity": "{name}, yeni bir şehirden kullanıldı",
      "titleCountry": "{name}, yeni bir ülkeden kullanıldı",
      "signin": "Giriş: {place}",
      "before": "Daha önce yalnızca {places}",
      "firstFar": "Bu passkey burada ilk kez kullanıldı",
      "usual": "Alışılmış konum",
      "me": "Bendim",
      "revoke": "Kaldır ve oturumları kapat",
      "confirmTitle": "Passkey kaldırılsın ve diğer oturumlar kapatılsın mı?",
      "confirmLead": "\"{name}\" kaldırılır ve bu cihaz dışındaki tüm oturumlar kapanır. Ardından şifreni değiştirmen iyi olur.",
      "doneMe": "Tamam, uyarıyı kapattık.",
      "doneRevoke": "{count, plural, one {Passkey kaldırıldı, # oturum kapatıldı.} other {Passkey kaldırıldı, # oturum kapatıldı.}}",
      "noneTitle": "Olağan dışı kullanım yok",
      "noneLead": "Bir passkey daha önce kullanılmadığı bir şehirden girerse burada ve e-postayla uyarırız.",
      "countryOnly": "Bu bağlantıda konum yalnızca ülke düzeyinde biliniyor; uyarı yeni bir ülkede çıkar."
    },
    "empty": {
      "title": "Henüz passkey yok",
      "lead": {
        "passkey": "Bu cihaza bir passkey ekle; bir dahaki girişte şifre ve kod yazmazsın.",
        "face": "Face ID ile bir passkey ekle; bir dahaki girişte şifre ve kod yazmazsın.",
        "finger": "Parmak izinle bir passkey ekle; bir dahaki girişte şifre ve kod yazmazsın.",
        "hello": "Windows Hello ile bir passkey ekle; bir dahaki girişte şifre ve kod yazmazsın."
      }
    },
    "suggestToggle": "Şifreyle girişten sonra passkey öner",
    "suggestToggleSub": "Yalnızca bu cihaz için",
    "entry": {
      "title": "Passkey'ler",
      "desc": "{count} kayıtlı · Güvenlik {score}",
      "none": "Şifresiz ve hızlı giriş. Henüz passkey yok.",
      "alerts": "{count, plural, one {# uyarı} other {# uyarı}}"
    }
  },
  "suggest": {
    "title": {
      "windows": "Bir dahaki sefere Windows Hello ile gir",
      "ios": "Bir dahaki sefere Face ID ile gir",
      "android": "Bir dahaki sefere parmak izinle gir",
      "web": "Bir dahaki sefere passkey ile gir"
    },
    "phoneTitle": {
      "windows": "Windows Hello ile daha hızlı gir",
      "ios": "Face ID ile daha hızlı gir",
      "android": "Parmak izinle daha hızlı gir",
      "web": "Passkey ile daha hızlı gir"
    },
    "lead": "Şifre ve kod yazmadan, yaklaşık 2 saniyede.",
    "phoneLead": "Bir dahaki girişte şifre ve kod yok. Şifren de geçerli kalır.",
    "c1": "Şifren aynen kalır; passkey ek ve daha hızlı bir yol.",
    "c2": "Passkey ile giriş 2 adımlı doğrulama sayılır, kod sormayız.",
    "c2short": "2 adımlı doğrulama sayılır.",
    "c3": "Yüzün ya da parmak izin bu cihazdan hiç çıkmaz.",
    "c3ios": "iCloud Anahtar Zinciri ile iPad ve Mac'inde de çalışır.",
    "c3android": "Google Şifre Yöneticisi ile diğer Android cihazlarında da çalışır.",
    "later": "Sonra hatırlat",
    "notNow": "Şimdi değil",
    "never": "Bu cihazda bir daha sorma",
    "mini": "Passkey önerisi",
    "expand": "Passkey önerisini aç",
    "done": "Passkey eklendi. Bir dahaki sefere {method} ile gir.",
    "needsReauth": "Eklemek için Ayarlar'da kimliğini doğrula.",
    "openSettings": "Ayarlar'da ekle",
    "signedIn": {
      "password": "Şifreyle giriş yapıldı",
      "2fa": "Şifre ve doğrulama koduyla giriş yapıldı",
      "google": "Google ile giriş yapıldı",
      "apple": "Apple ile giriş yapıldı"
    }
  },
  "report": {
    "loading": "Yükleniyor…",
    "invalidTitle": "Bağlantı geçerli değil",
    "invalid": "Bu bağlantı geçerli değil ya da eksik kopyalandı. E-postadaki düğmeye yeniden dokun.",
    "expiredTitle": "Bağlantının süresi doldu",
    "expired": "Bu bağlantının süresi doldu. Giriş yap ve Ayarlar > Güvenlik > Passkey'ler bölümüne bak.",
    "network": "Descall'a ulaşılamıyor. Bağlantını kontrol edip tekrar dene.",
    "title": {
      "added": "Hesabına yeni bir passkey eklendi",
      "newPlace": "Passkey'in yeni bir yerden kullanıldı"
    },
    "passkey": "Passkey",
    "when": "Zaman",
    "place": "Konum",
    "device": "Cihaz",
    "question": "Bu sen miydin?",
    "notMe": "Ben değildim",
    "revokeLead": "\"{name}\" hesabından kaldırılır ve hesabındaki tüm oturumlar kapanır. Sonra şifrenle yeniden girip şifreni değiştirmeni öneririz.",
    "revokeLeadGone": "Passkey zaten kaldırılmış. Hesabındaki tüm oturumları kapatırız; sonra şifreni değiştir.",
    "revokeButton": "Kaldır ve tüm oturumları kapat",
    "itWasMe": "Bendim",
    "confirmLead": "Hiçbir şey değişmez; uyarıyı kapatırız.",
    "confirmButton": "Evet, bendim",
    "doneRevokedTitle": "Hesabın güvende",
    "doneRevoked": "{count, plural, one {Passkey kaldırıldı ve # oturum kapatıldı. Şimdi şifreni değiştir.} other {Passkey kaldırıldı ve # oturum kapatıldı. Şimdi şifreni değiştir.}}",
    "doneConfirmedTitle": "Teşekkürler",
    "doneConfirmed": "Uyarıyı kapattık.",
    "alreadyRevoked": "Bu bağlantı zaten kullanıldı: passkey kaldırıldı ve oturumlar kapatıldı.",
    "alreadyConfirmed": "Bu uyarı zaten yanıtlandı: \"Bendim\".",
    "openApp": "Descall'a git",
    "changePassword": "Giriş yap ve şifreni değiştir"
  }
};
