/** "Paylaş > Descall" share sheet ("shareSheet.*", src/components/share). Same keys in every shareSheet.<locale>.js; scripts/gen-share-native-strings.mjs copies them to iOS (DescallShare/ShareStrings.swift) and Android (res/values(-xx)/share_strings.xml). */
export const SHARE_SHEET_TR = {
  "title": "Descall'a gönder",
  "source": "{app} · {items}",
  "itemsSize": "{items} · {size}",
  "items": "{count, plural, one {# öğe} other {# öğe}}",
  "chats": "{count, plural, one {# sohbet} other {# sohbet}}",
  "cancel": "Vazgeç",
  "close": "Kapat",
  "done": "Bitti",
  "hide": "Gizle",
  "options": "Seçenekler",
  "remove": "Kaldır",
  "search": "Kişi, grup veya kanal ara",
  "clearSearch": "Aramayı temizle",
  "tabs": {
    "all": "Tümü",
    "friends": "Arkadaşlar",
    "groups": "Gruplar",
    "servers": "Sunucular"
  },
  "sec": {
    "friends": "Arkadaşlar",
    "groups": "Gruplar",
    "channels": "Sunucu kanalları",
    "suggested": "Önerilen"
  },
  "server": {
    "channels": "{count, plural, one {# kanal} other {# kanal}}",
    "sendable": "Gönderebileceğin {count} kanal",
    "none": "Gönderebileceğin kanal yok"
  },
  "saved": "%{percent} küçük",
  "presence": {
    "online": "Çevrimiçi",
    "idle": "Boşta",
    "dnd": "Rahatsız etmeyin",
    "offline": "Çevrimdışı"
  },
  "row": {
    "channel": "Sunucu kanalı",
    "slowMode": "Yavaş mod: {seconds} sn",
    "lastShared": {
      "today": "En son sen paylaştın · bugün",
      "yesterday": "En son sen paylaştın · dün",
      "days": "En son sen paylaştın · {count} gün önce"
    },
    "members": "{members} üye",
    "membersOnline": "{members} üye · {online} çevrimiçi",
    "groupShared": {
      "today": "{members} üye · bugün {count} öğe paylaştınız",
      "yesterday": "{members} üye · dün {count} öğe paylaştınız",
      "days": "{members} üye · {days} gün önce {count} öğe paylaştınız"
    },
    "dmShared": {
      "today": "{presence} · bugün {count} öğe paylaştınız",
      "yesterday": "{presence} · dün {count} öğe paylaştınız",
      "days": "{presence} · {days} gün önce {count} öğe paylaştınız"
    }
  },
  "reason": {
    "no_permission": "Yazma iznin yok",
    "announcement": "Yazma iznin yok (yalnızca yöneticiler)",
    "timed_out": "Zaman aşımındasın",
    "no_attach": "Dosya gönderme iznin yok",
    "blocked": "Engelli",
    "not_friends": "Artık arkadaş değilsiniz",
    "unknown": "Kullanılamıyor",
    "rules_required": "Önce sunucu kurallarını kabul et",
    "failed": "Gönderilemedi",
    "offline": "Bağlantı koptu",
    "upload_failed": "Yüklenemedi",
    "timeout": "Zaman aşımı",
    "too_large": "100 MB sınırını aşıyor",
    "type": "Bu dosya türü gönderilemez",
    "slowmode": "Yavaş mod",
    "rate_limited": "Çok hızlı; biraz bekle",
    "content_blocked": "İçerik filtresine takıldı",
    "attachment_unavailable": "Ek kullanılamıyor",
    "signed_out": "Oturum kapalı",
    "cancelled": "Durduruldu",
    "too_many_scheduled": "Çok fazla zamanlanmış mesaj var",
    "too_long": "Mesaj çok uzun"
  },
  "message": "Mesaj ekle (isteğe bağlı)",
  "quality": {
    "original": "Orijinal",
    "originalDesc": "Tam çözünürlük, 4K video korunur · {size}",
    "high": "Yüksek (önerilen)",
    "highDesc": "JPEG, 1080p video · {size}",
    "saver": "Veri tasarrufu",
    "saverDesc": "Hücresel veride hızlı · {size}",
    "chip": {
      "original": "Orijinal",
      "high": "Yüksek",
      "saver": "Tasarruf"
    },
    "title": "Gönderim kalitesi"
  },
  "location": {
    "title": "Konum bilgisini kaldır",
    "desc": "Fotoğraflardaki GPS ve cihaz bilgisi",
    "chipOn": "Konum yok",
    "chipOff": "Konumlu"
  },
  "silent": "Sessiz",
  "silentHint": "Bildirim gitmez; mesaj yine okunmamış görünür",
  "scheduleChip": "Zamanla",
  "scheduleTitle": "Ne zaman gönderilsin?",
  "schedule": {
    "inHour": "1 saat sonra",
    "tonight": "Bu akşam 20:00",
    "tomorrow": "Yarın 09:00",
    "custom": "Tarih ve saat seç",
    "set": "Ayarla",
    "now": "Hemen gönder",
    "invalid": "En az 1 dakika sonrasını seç"
  },
  "send": "{count, plural, one {# sohbete gönder} other {# sohbete gönder}}",
  "sendShort": "{count, plural, one {# sohbete} other {# sohbete}}",
  "sendScheduled": "{count, plural, one {# sohbete zamanla} other {# sohbete zamanla}}",
  "pick": "Alıcı seç",
  "when": {
    "today": "bugün",
    "yesterday": "dün",
    "days": "{count} gün önce"
  },
  "dup": {
    "link": "Bu bağlantıyı {when} {name} sohbetine göndermiştin",
    "file": "Bunu {when} {name} sohbetine göndermiştin",
    "body": "Yine de gönderilecek. İstersen {name} sohbetini bu gönderimden çıkar.",
    "remove": "Çıkar"
  },
  "limitTargets": "En fazla {count} sohbet seçebilirsin",
  "limitItems": "En fazla {count} öğe paylaşılabilir; fazlası çıkarıldı",
  "targetRemoved": "{name} çıkarıldı: {reason}",
  "errorTitle": "Liste yüklenemedi",
  "errorOffline": "İnternet yok. Seçimlerin hazır olunca gönderim kuyruğa alınır.",
  "retry": "Tekrar dene",
  "signedOutTitle": "Descall'da oturum açık değil",
  "signedOutBody": "Paylaşmak için önce Descall uygulamasında oturum aç.",
  "openApp": "Descall'ı aç",
  "emptyTitle": "Henüz kimse yok",
  "emptyBody": "Arkadaş ekleyince ya da bir sunucuya katılınca burada görünürler.",
  "emptySearch": "“{query}” için sonuç yok",
  "noItems": "Paylaşılacak bir şey yok",
  "run": {
    "title": "Gönderiliyor",
    "sub": "{items} · {chats}",
    "hero": "{count, plural, one {# sohbete gönderiliyor} other {# sohbete gönderiliyor}}",
    "stats": "{sent} / {total} · {speed}/sn · yaklaşık {eta} sn",
    "statsShort": "{sent} / {total}",
    "uploaded": "{done}/{count} öğe yüklendi",
    "uploading": "Yükleniyor · %{percent}",
    "queued": "Sırada · aynı dosyalar tekrar yüklenmez",
    "sending": "Gönderiliyor",
    "canClose": "Bu sayfayı kapatabilirsin",
    "canCloseBody": "Gönderim arka planda sürer; bitince bildirim gelir.",
    "background": "Arka planda devam et",
    "stop": "Gönderimi durdur"
  },
  "sent": {
    "title": "Gönderildi",
    "hero": "{count, plural, one {# sohbete gönderildi} other {# sohbete gönderildi}}",
    "sub": "{items} · {size} · {seconds} saniyede",
    "allArrived": "Hepsi ulaştı",
    "delivered": "Teslim edildi · {time}",
    "open": "Aç",
    "openInApp": "Descall'da aç"
  },
  "undo": {
    "button": "Geri al",
    "title": "Geri al",
    "body": "{seconds} saniye içinde herkesten kaldırılır",
    "bodyScheduled": "Zamanlama {seconds} saniye içinde iptal edilebilir",
    "busy": "Geri alınıyor…"
  },
  "scheduled": {
    "title": "Zamanlandı",
    "hero": "{count, plural, one {# sohbete zamanlandı} other {# sohbete zamanlandı}}",
    "sub": "{when} gönderilecek",
    "row": "Zamanlandı · {time}"
  },
  "slowRow": "Yavaş mod: kalanlar {time} itibarıyla gider",
  "partial": {
    "title": "Kısmen gönderildi",
    "hero": "{done}/{count} sohbete gönderildi",
    "sub": "{name}: {reason}",
    "itemsIn": "{ok}/{count} öğe ulaştı",
    "itemsFailed": "{count, plural, one {# öğe gitmedi: {reason}} other {# öğe gitmedi: {reason}}}",
    "retryOne": "Tekrar",
    "infoTitle": "Gidenler ulaştı",
    "infoBody": "Tekrar denediğinde yalnızca eksikler gönderilir; aynı dosyalar baştan yüklenmez.",
    "retryFailed": "Başarısızı tekrar dene",
    "dropFailed": "Eksikleri bırak, kalanı tamam say"
  },
  "offline": {
    "title": "Gönderilemedi",
    "hero": "İnternet bağlantısı yok",
    "subNone": "Hiçbir öğe gönderilmedi",
    "subSome": "{done}/{count} sohbete ulaştı, kalanı bekliyor",
    "kept": "Cihazda saklanıyor",
    "queuedTitle": "Gönderim kuyruğa alındı",
    "queuedBody": "Bağlantı gelince {items} {chats} için otomatik gönderilir. Bildirimden takip edebilirsin.",
    "row": "Kuyrukta · otomatik denenecek",
    "retryNow": "Şimdi tekrar dene",
    "saveDraft": "Taslak olarak kaydet",
    "remove": "Kuyruktan çıkar",
    "draftSaved": "Taslak kaydedildi; bildirimden gönderebilirsin"
  },
  "failed": {
    "title": "Gönderilemedi",
    "hero": "Gönderilemedi"
  },
  "undone": {
    "title": "Geri alındı",
    "hero": "Gönderim geri alındı",
    "sub": "Mesajlar herkesten kaldırıldı",
    "failed": "Bazı mesajlar kaldırılamadı"
  },
  "notif": {
    "channel": "Paylaşımlar",
    "sending": "{count, plural, one {# sohbete gönderiliyor} other {# sohbete gönderiliyor}}",
    "sent": "Gönderildi",
    "failedItems": "{count, plural, one {# öğe gönderilemedi} other {# öğe gönderilemedi}}",
    "waiting": "İnternet bekleniyor · kuyrukta",
    "stop": "Durdur",
    "undo": "Geri al · {seconds} sn",
    "openChat": "Sohbeti aç",
    "retry": "Tekrar dene",
    "details": "Ayrıntılar",
    "sendDraft": "Gönder",
    "draft": "Taslak: {items} · {chats}"
  },
  "kind": {
    "photos": "Fotoğraflar",
    "files": "Dosyalar",
    "link": "Bağlantı",
    "text": "Metin"
  },
  "pdf": "PDF"
};
