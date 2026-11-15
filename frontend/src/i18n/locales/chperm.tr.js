/** Channel permission notices: read-only channels, attachments, synced category rules, channel moves, user limit ("chperm.*", server audit P2 / P5). Same keys in every chperm.<locale>.js. */
export const CHPERM_TR = {
  "readOnlyChannel": "Bu kanala mesaj gönderemezsin.",
  "readOnlyAnnouncement": "Bu duyuru kanalına yalnızca moderatörler yazabilir.",
  "noAttachments": "Bu kanalda dosya ekleyemezsin.",
  "noVoiceMessages": "Bu kanalda sesli mesaj gönderemezsin.",
  "syncedWith": "{name} kategorisiyle eşitli: bunlar kategorinin kuralları. Burada birini değiştirirsen kanal kendi kurallarını alır.",
  "category": "kategori",
  "userLimit": "Kullanıcı sınırı",
  "userLimitSub": "Aynı anda kaç kişi katılabilir. 0 = sınırsız (en çok 99).",
  "userLimitNone": "Sınırsız",
  "userLimitInvalid": "0 ile 99 arasında bir sayı gir.",
  "fromCategory": "Kategoriden",
  "moveSyncTitle": "Yeni kategorideki izinler",
  "moveSyncMsg": "#{channel} kanalının kendi izinleri var, {category} kategorisinin izinleri farklı. Hangisini kullansın?",
  "moveSyncUse": "{category} ile eşitle",
  "moveSyncKeep": "Kendi izinlerini koru",
  "movedKeptOwn": "#{channel}, {category} içinde kendi izinlerini korudu.",
};
