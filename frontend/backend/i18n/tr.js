"use strict";

/**
 * Turkish server-side catalog. Same key tree and {placeholders} as en.js
 * (backend/i18n/backendI18n.selftest.cjs). Owner-approved wording, "sen" address.
 * Turkish case variants ({nameGen} ...) may be passed next to the base variable.
 */
module.exports = {
  email: {
    email_verify_signup: {
      subject: "{code} – Descall doğrulama kodun",
      eyebrow: "E-posta doğrulama",
      title: "Descall'a hoş geldin, {name}!",
      titleNoName: "Descall'a hoş geldin!",
      intro: "Hesabın hazır. Son bir adım kaldı: e-posta adresini doğrulamak için aşağıdaki kodu uygulamaya gir.",
      preheader: "Doğrulama kodun: {code} · {minutes} dakika geçerli",
      ignore: "Bu hesabı sen oluşturmadıysan bu e-postayı yok sayabilirsin. Adres doğrulanmadıkça hiçbir hesaba bağlanmaz.",
    },
    email_verify: {
      subject: "{code} – Descall e-posta doğrulama kodun",
      eyebrow: "E-posta doğrulama",
      title: "E-posta adresini doğrula",
      intro: "Descall hesabına bu e-posta adresini eklemek için aşağıdaki kodu uygulamaya gir.",
      preheader: "Doğrulama kodun: {code} · {minutes} dakika geçerli",
      ignore: "Bu isteği sen yapmadıysan bu e-postayı yok sayabilirsin. Adresin hiçbir hesaba eklenmez.",
    },
    "2fa_login": {
      subject: "{code} – Descall giriş kodun",
      eyebrow: "Giriş kodu",
      codeLabel: "Giriş kodun",
      title: "Girişini tamamla",
      intro: "Hesabına giriş yapmak için bu kodu Descall'a gir.",
      preheader: "Giriş kodun: {code} · {minutes} dakika geçerli",
      ignore: "Giriş yapmaya çalışan sen değilsen şifren başkasının elinde olabilir. Hemen şifreni değiştir ve Ayarlar › Güvenlik'ten doğrulama uygulamasını aç.",
    },
    email_reauth: {
      subject: "{code} – Descall onay kodun",
      eyebrow: "Hesap güvenliği",
      codeLabel: "Onay kodun",
      title: "Bu sen misin?",
      intro: "Hesabındaki e-posta adresini değiştirmek için bu kodu gir.",
      preheader: "Onay kodun: {code} · {minutes} dakika geçerli",
      ignore: "Bu değişikliği sen istemediysen kodu kimseyle paylaşma ve şifreni değiştir. Kod olmadan adres değiştirilemez.",
    },
    password_reset: {
      subject: "{code} – Descall şifre sıfırlama kodun",
      eyebrow: "Şifre sıfırlama",
      codeLabel: "Sıfırlama kodun",
      title: "Şifreni sıfırla",
      intro: "Yeni bir şifre belirlemek için bu kodu Descall'a gir.",
      preheader: "Şifre sıfırlama kodun: {code} · {minutes} dakika geçerli",
      ignore: "Şifre sıfırlamayı sen istemediysen bu e-postayı yok sayabilirsin; şifren değişmez.",
    },
    common: {
      hi: "Merhaba {name},",
      codeLabel: "Doğrulama kodun",
      valid: "{minutes} dakika geçerli",
      copyHint: "Kodu seçip kopyalayabilirsin.",
      never: "Descall ekibi kodunu hiçbir zaman istemez. Kimseyle paylaşma.",
      nextTitle: "Sırada ne var?",
      step1Title: "Arkadaşlarını ekle",
      step1Body: "Kullanıcı adlarıyla bul ya da davet bağlantını paylaş.",
      step2Title: "Bir sunucuya katıl",
      step2Body: "Topluluklara katıl ya da kendi sunucunu birkaç saniyede kur.",
      step3Title: "Konuşmaya başla",
      step3Body: "Mesajlaş, sesli ve görüntülü ara, ekranını paylaş.",
      getApp: "Descall her yerde seninle",
      appWin: "Windows için indir",
      appIos: "App Store'dan indir",
      appWeb: "Tarayıcıda aç",
      help: "Yardıma mı ihtiyacın var?",
      write: "Bize yaz:",
      privacy: "Gizlilik",
      terms: "Kullanım Koşulları",
      why: "Bu e-postayı Descall hesabınla ilgili bir işlem yapıldığı için aldın.",
      privacyPath: "/gizlilik",
      termsPath: "/kosullar",
      downloadPath: "/tr/download",
      textCode: "Kodun",
      textValid: "{minutes} dakika geçerli.",
    },
  },

  marketing: {
    subject: "Descall ürün güncellemelerini onaylayın",
    text: "Descall ürün notlarını almak için bu bağlantıyı açın. Onaylamazsanız size yazmayız.",
    htmlLead: "Descall ürün notlarını almak için aşağıdaki bağlantıyı açın. Onaylamazsanız size yazmayız.",
    confirmLabel: "Aboneliği onayla",
    pageConfirm: "Aboneliğiniz onaylandı. İstediğiniz zaman abonelikten çıkabilirsiniz.",
    pageGone: "Bu bağlantı geçersiz veya süresi dolmuş.",
    pageUnsub: "Abonelikten çıktınız. Size bir daha ürün e-postası göndermeyeceğiz.",
    unsubscribeAnyTime: "İstediğiniz zaman abonelikten çıkın:",
    goToSite: "descall.com'a git",
  },

  push: {
    someone: "Birisi",
    newMessage: "Yeni mesaj",
    voice: "🎤 Sesli mesaj",
    media: "📎 Dosya gönderdi",
    photo: "📷 Fotoğraf",
    video: "🎬 Video",
    group: "Grup",
    mentioned: "{from} senden bahsetti",
    mentionedShort: "Senden bahsetti",
    friendTitle: "Arkadaşlık İsteği",
    friendBody: "{from} seni arkadaş olarak eklemek istiyor",
    calling: "{from} arıyor",
    voiceCall: "Sesli arama",
    videoCall: "Görüntülü arama",
    groupCallTitle: "{groupName} — Grup Araması",
    groupCallBody: "{from} grup araması başlattı",
    ownerTitle: "Sunucu sahipliği",
    ownerBody: "{serverNameGen} sahibi artık sensin",
    ownerServerFallback: "Sunucu",
    feedbackTitle: "Descall Ekibi yanıt verdi",
    feedbackBody: "Geri bildirimine yanıt geldi",
    antibotTitle: "Anti-bot uyarısı",
    antibotBody: "{count} hesap risk eşiğini geçti (en yüksek {topScore})",
    antibotWatchBody: "İzleme listesinde {count} yeni uyarı",
    voicePlain: "Sesli mesaj",
    attachmentPlain: "Dosya gönderdi",
    incomingCall: "Gelen arama",
    incomingCallBody: "Descall'da biri seni arıyor",
    missedCallFrom: "Cevapsız arama: {name}",
    answeredElsewhere: "Arama başka bir cihazda yanıtlandı.",
    declinedElsewhere: "Arama başka bir cihazda reddedildi.",
    missedCallBody: "Aramayı kaçırdın.",
    groupCall: "Grup araması",
    groupCallDefaultBody: "Descall'da biri grup araması başlattı",
    groupCallJoinVoice: "Gruptaki sesli aramaya katıl.",
    groupCallJoinVideo: "Gruptaki görüntülü aramaya katıl.",
    messageRequestTitle: "Mesaj isteği",
    messageRequestBody: "{from} sana mesaj isteği gönderdi",
  },

  maintenance: {
    emergencyTitle: "Acil bakım",
    plannedTitle: "Planlı bakım",
  },

  starter: {
    textCategory: "Metin kanalları",
    text: "genel",
    voiceCategory: "Ses kanalları",
    voice: "Lobi",
  },

  security: {
    passwordChangedSubject: "Descall şifren değişti",
    passwordChangedBody: "Descall hesabının şifresi az önce değiştirildi. Bu sen değilsen destek ile iletişime geç.",
    emailChangeSubject: "Descall e-posta değişikliği",
    emailChangeBody: "Descall hesabında e-posta adresini değiştirme isteği var. Bu sen değilsen hemen şifreni değiştir ve destek ile iletişime geç.",
  },

  dataExport: {
    note: "Bu dosya Descall'ın hesabın hakkında tuttuğu kişisel verilerin kopyasıdır (KVKK md. 11). Gönderdiğin mesajlar burada; başkalarının sana gönderdiği mesajlar onların verisi olduğu için yok. Şifre, iki adımlı doğrulama sırları, oturum ve bildirim anahtarları güvenlik nedeniyle eklenmedi. Dolandırıcılık ve kötüye kullanım önleme kayıtları, kötüye kullanılmasın diye paylaşılmaz (KVKK md. 28/2-ç). Seni kimin şikayet ettiği gösterilmez. Sorular için: destek@descall.com",
    filePrefix: "descall-verilerim",
    accountFallback: "hesap",
  },

  watch: {
    photo: "Fotoğraf",
    gif: "GIF",
    video: "Video",
    voice: "Sesli mesaj",
    file: "Dosya",
    poll: "Anket",
    call: "Arama",
  },

  stats: {
    weekOf: "{date} haftası",
    sourceDirect: "Doğrudan",
    sourceGoogleOrganic: "Google (organik)",
    sourceReferral: "Arkadaş daveti",
    other: "Diğer",
    unknown: "Bilinmiyor",
    csvPeriod: "donem",
    csvSignups: "kayit",
    csvAverage: "ortalama",
    csvFilePrefix: "kayit-istatistikleri",
  },

  // Server templates (lib/serverTemplates.js): written into the database in the creator's language.
  templates: {
    gaming: {
      name: "Oyun merkezi",
      description: "Ekip toplama kanalı, oyun sohbetleri, klipler, staff odası ve ranked ses lobileriyle squad’a hazır kurulum.",
      descriptionSeed: "Bir oyun topluluğu: takım arkadaşı bul, klip paylaş, sese katıl.",
      rulesText: "1) Saygılı ol.\n2) Nefret, spam ve işaretli kanallar dışında NSFW yok.\n3) Ekip ilanlarını net yaz (oyun + rank + bölge).\n4) Yetkili kararları kesindir.\n5) Eğlen ve adil oyna.",
      highlights: ["Ekip toplama kanalı", "Klip kanalı", "Staff rolleri", "Lobi sesi"],
      roles: ["Yönetici", "Moderatör", "Yardımcı", "VIP", "Üye"],
      categories: [
        {
          name: "Hoş geldin",
          channels: [
            {
              name: "duyurular",
              topic: "Resmi sunucu haberleri ve yama notları. Üyeler için salt okunur.",
            },
            {
              name: "kurallar",
              topic: "Sunucu kuralları: topluluk kanallarında yazmadan önce kabul et.",
            },
            {
              name: "tanisma",
              topic: "Merhaba de: oyun, rank, bölge ve ne oynadığın.",
            },
          ],
        },
        {
          name: "Topluluk",
          channels: [
            {
              name: "genel",
              topic: "Oyunla ilgili her şey için ana sohbet.",
            },
            {
              name: "ekip-kur",
              topic: "Ekip ilanları: oyun · rank · bölge · mikrofon var/yok.",
            },
            {
              name: "klipler-ve-one-cikanlar",
              topic: "En iyi kliplerini ve ekran görüntülerini paylaş.",
            },
            {
              name: "mizah",
              topic: "Hafif tut. Taciz yok.",
            },
          ],
        },
        {
          name: "Ses lobileri",
          channels: [
            {
              name: "Lobi",
            },
            {
              name: "İkili Sıra",
            },
            {
              name: "Beşli Ekip",
            },
            {
              name: "AFK / Takılma",
            },
            {
              name: "Turnuva Sahnesi",
              topic: "Birlikte izleme ve turnuva brifingleri.",
            },
          ],
        },
        {
          name: "Yetkililer",
          channels: [
            {
              name: "yetkili-sohbet",
              topic: "Yetkililer için özel koordinasyon.",
            },
            {
              name: "mod-kayitlari",
              topic: "Moderasyon notları ve vaka kaydı.",
            },
            {
              name: "Yetkili Sesi",
            },
          ],
        },
      ],
    },
    friends: {
      name: "Arkadaş takılması",
      description: "Samimi, özel bir grup düzeni: sohbet salonu, planlar, müzik geceleri ve hep açık ses odaları.",
      descriptionSeed: "Arkadaşlar için özel bir buluşma yeri: planlar, mizah ve gece geç saat sesli sohbet.",
      rulesText: "1) Dramayı gruptan uzak tut.\n2) Yeni birini eklemeden önce sor.\n3) Özel sohbetleri dışarı sızdırma.\n4) Ortak seste AFK iken mikrofonu kapat.\n5) Nazik ol, burası bizim alanımız.",
      highlights: ["Lounge sohbet", "Plan panosu", "Müzik gecesi", "Sürekli VC"],
      roles: ["Yönetici", "Yardımcı Ev Sahibi", "Kanka", "Arkadaş"],
      categories: [
        {
          name: "Ana Sayfa",
          channels: [
            {
              name: "salon",
              topic: "Günlük sohbet, mizah serbest.",
            },
            {
              name: "planlar",
              topic: "Buluşmalar, birlikte izleme, geziler.",
            },
            {
              name: "fotograflar",
              topic: "Buluşmalardan ve gezilerden fotoğraf paylaş.",
            },
            {
              name: "muzik-ve-baglantilar",
              topic: "Çalma listeleri, TikTok'lar ve rastgele bağlantılar.",
            },
          ],
        },
        {
          name: "Ses",
          channels: [
            {
              name: "Oturma Odası",
            },
            {
              name: "Gece Yarısı",
            },
            {
              name: "Birlikte İzleme",
            },
            {
              name: "Benimle Çalış",
            },
          ],
        },
        {
          name: "Özel",
          channels: [
            {
              name: "sadece-yoneticiler",
              topic: "Yönetici / yardımcı ev sahibi planlaması.",
            },
          ],
        },
      ],
    },
    community: {
      name: "Topluluk & içerik üreticileri",
      description: "Duyurular, destek, etkinlikler, stage ve tam staff hiyerarşisiyle topluluğa hazır.",
      descriptionSeed: "İçerik üreticilerine uygun bir topluluk: duyurular, destek ve etkinlikler.",
      rulesText: "1) Discord/Descall kullanım koşullarına uy.\n2) Spam, dolandırıcılık ve #tanitim dışında reklam yok.\n3) Herkese saygı göster, nefret söylemine sıfır tolerans.\n4) Konular için doğru kanalı kullan.\n5) Yardım için #destek kanalında yetkililere yaz.",
      highlights: ["Duyurular", "Destek masası", "Etkinlikler", "Sahne"],
      roles: ["Sahip Ekibi", "Yönetici", "Moderatör", "Etkinlik Sunucusu", "Katkıda Bulunan", "Üye"],
      categories: [
        {
          name: "Buradan başla",
          channels: [
            {
              name: "duyurular",
              topic: "Resmi güncellemeler. Üyeler buraya yazamaz.",
            },
            {
              name: "kurallar",
              topic: "Topluluk kuralları.",
            },
            {
              name: "hos-geldin",
              topic: "Yeni üyeler kendini burada tanıtır.",
            },
            {
              name: "roller",
              topic: "İlgi alanı rolleri / katkı etiketleri iste.",
            },
          ],
        },
        {
          name: "Topluluk",
          channels: [
            {
              name: "genel",
              topic: "Ana sohbet.",
            },
            {
              name: "destek",
              topic: "Yardım mı lazım? Yetkililer burada yanıt verir.",
            },
            {
              name: "etkinlikler",
              topic: "Yaklaşan etkinlikler ve katılım bildirimleri.",
            },
            {
              name: "tanitim",
              topic: "Kendi tanıtımın yalnızca burada: günde bir gönderi.",
            },
            {
              name: "vitrin",
              topic: "İşlerini, yayınlarını ve başarılarını paylaş.",
            },
          ],
        },
        {
          name: "Ses & sahne",
          channels: [
            {
              name: "Topluluk Salonu",
            },
            {
              name: "İş Birliği Odası",
            },
            {
              name: "Genel Toplantı",
              topic: "Soru-cevaplar, duyurular ve canlı etkinlikler.",
            },
          ],
        },
        {
          name: "Yetkililer",
          channels: [
            {
              name: "yetkili-sohbet",
              topic: "Yetkililer arası iç tartışma.",
            },
            {
              name: "mod-kuyrugu",
              topic: "Şikayetler ve açık moderasyon vakaları.",
            },
            {
              name: "Yetkili Sesi",
            },
          ],
        },
      ],
    },
    study: {
      name: "Ders & kampüs",
      description: "Odak odaları, ders kanalları, ödev yardımı, sessiz VC ve mentor rolleri.",
      descriptionSeed: "Birlikte çalış: odak seansları, ödev yardımı ve kampüs sohbeti.",
      rulesText: "1) Çalışma odalarını dikkat dağıtıcılardan uzak tut.\n2) Kopya ve sınav sızdırma yok.\n3) Kaynakları sahibini belirterek paylaş.\n4) Konuya özel yardım için ders kanallarını kullan.\n5) Destekleyici ol, herkes kendi hızında öğrenir.",
      highlights: ["Odak odaları", "Ödev yardımı", "Sessiz VC", "Mentor rolü"],
      roles: ["Yönetici", "Moderatör", "Mentor", "Çalışma Arkadaşı", "Öğrenci"],
      categories: [
        {
          name: "Kampüs",
          channels: [
            {
              name: "duyurular",
              topic: "Son tarihler, seanslar ve kampüs haberleri.",
            },
            {
              name: "kurallar",
              topic: "Çalışma topluluğu kuralları.",
            },
            {
              name: "tanisma",
              topic: "Bölümün, sınıfın ve ne çalıştığın.",
            },
          ],
        },
        {
          name: "Ders",
          channels: [
            {
              name: "genel",
              topic: "Konu dışı kampüs sohbeti.",
            },
            {
              name: "odev-yardimi",
              topic: "Soru sor, çözümünü de göster.",
            },
            {
              name: "kaynaklar",
              topic: "Notlar, bağlantılar ve çalışma rehberleri.",
            },
            {
              name: "hedef-takibi",
              topic: "Günlük hedefler ve durum bildirimleri.",
            },
          ],
        },
        {
          name: "Odak sesi",
          channels: [
            {
              name: "Sessiz Odak",
            },
            {
              name: "Pomodoro Odası",
            },
            {
              name: "Grup Projesi A",
            },
            {
              name: "Grup Projesi B",
            },
            {
              name: "Görüşme Saatleri",
              topic: "Mentorların yönettiği soru-cevap seansları.",
            },
          ],
        },
        {
          name: "Yetkililer",
          channels: [
            {
              name: "mentor-odasi",
              topic: "Mentorlar ve modlar yardım seanslarını planlar.",
            },
          ],
        },
      ],
    },
    streaming: {
      name: "Yayıncı & içerik",
      description: "Canlı bildirimleri, klip kasası, collab panosu, VIP lounge ve mod/VIP rolleri.",
      descriptionSeed: "İçerik üreticisi merkezi: canlı yayın bildirimleri, klipler, iş birlikleri ve VIP ayrıcalıkları.",
      rulesText: "1) İçerik üreticisini destekle, yayınları baltalama.\n2) Tekrar yayınlarda #canli-sohbet kanalında spoiler yok.\n3) Kendi tanıtımın yalnızca #is-birlikleri kanalında.\n4) Havayı VIP'ler belirler, ayrıcalıkları kötüye kullanma.\n5) Canlı yayında sohbet kurallarını modlar uygular.",
      highlights: ["Canlı kanalı", "Klip kasası", "VIP salonu", "Mod ekibi"],
      roles: ["İçerik Üreticisi", "Moderatör", "Editör", "VIP", "Abone", "İzleyici"],
      categories: [
        {
          name: "Yayın",
          channels: [
            {
              name: "duyurular",
              topic: "Yayın takvimi ve büyük duyurular.",
            },
            {
              name: "canli-yayin",
              topic: "Yalnızca canlı yayın bildirimleri.",
            },
            {
              name: "kurallar",
              topic: "Yayınlar ve tekrar yayınlar için sohbet kuralları.",
            },
          ],
        },
        {
          name: "Topluluk",
          channels: [
            {
              name: "genel",
              topic: "Toplulukla takıl.",
            },
            {
              name: "canli-sohbet",
              topic: "Yayın sırasında aktif, spoiler verme.",
            },
            {
              name: "klipler",
              topic: "Yayınlardan en iyi anlar.",
            },
            {
              name: "is-birlikleri",
              topic: "İş birliği istekleri ve selamlar.",
            },
            {
              name: "oneriler",
              topic: "İçerik üreticisi için içerik fikirleri.",
            },
          ],
        },
        {
          name: "VIP",
          channels: [
            {
              name: "vip-salonu",
              topic: "VIP / Abone için ayrıcalıklı sohbet.",
            },
            {
              name: "VIP Sesi",
            },
          ],
        },
        {
          name: "Ses",
          channels: [
            {
              name: "Bekleme Odası",
            },
            {
              name: "İş Birliği VC",
            },
            {
              name: "Yayın Sonrası",
              topic: "Yayın sonrası buluşmalar ve soru-cevaplar.",
            },
          ],
        },
        {
          name: "Ekip",
          channels: [
            {
              name: "mod-sohbet",
              topic: "Canlı yayın sırasında moderasyon.",
            },
            {
              name: "Ekip Sesi",
            },
          ],
        },
      ],
    },
  },
};
