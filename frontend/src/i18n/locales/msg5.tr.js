/** Messaging phase 5 ("msg5.*"): role / @everyone / @here mentions, push previews,
 * scheduled sending with one attachment. Same keys in every msg5.<locale>.js. */
export const MSG5_TR = {
  roles: {
    section: "Roller",
    subRole: "Rol · üyelerine bildirim gider",
    subRoleAdmin: "Rol · yalnızca yöneticiler bahsedebilir",
    subEveryone: "Bu kanalı gören herkese bildirim gider",
    subHere: "Şu an çevrimiçi olanlara bildirim gider",
    unknown: "bilinmeyen rol",
    aria: "Rol: {name}",
    popover: "Rol · {name}",
    everyoneCooldown: "@everyone veya @here'i {wait} sn sonra tekrar kullanabilirsin.",
  },
  preview: {
    settingDesc: "Kapatırsan uygulama, tarayıcı ve telefon bildirimlerinde mesaj metni yerine yalnızca \"Yeni mesaj\" görünür.",
    saveError: "Kaydedilemedi. Biraz sonra tekrar dene.",
  },
  schedule: {
    addAttachment: "Dosya ekle",
    attachmentHint: "Bir fotoğraf veya dosya, en fazla 100 MB",
    attachment: "Ek",
    attachmentKept: "Ek aynı kalır; metni ve saati değiştirebilirsin.",
    removeAttachment: "Eki kaldır",
    errAttachment: "Bu dosya zamanlanamaz. Fotoğraf, video veya belge seç.",
    errTooLarge: "Dosya çok büyük. En fazla 100 MB olabilir.",
    errAttachNotReady: "Ekli zamanlama sunucuda henüz açılmadı. Eki kaldırıp yalnızca metni zamanlayabilirsin.",
    errUpload: "Dosya yüklenemedi. Bağlantını kontrol edip tekrar dene.",
  },
  reengage: {
    friendVoice: "Arkadaşın sesli sohbette",
    friendVoiceDesc: "Sen uzaktayken bir arkadaşın katılabileceğin bir ses kanalına girince bildirim. Günde en fazla birkaç tane, gece asla.",
    email: "E-posta bildirimleri",
    emailDesc: "Kaçırdığın arkadaşlık istekleri ve davetler hakkında e-postalar, yeni hesaplar için birkaç ipucu.",
  },
  media: {
    imageFailed: "Görsel yüklenemedi",
    videoFailed: "Video yüklenemedi",
  },
};
