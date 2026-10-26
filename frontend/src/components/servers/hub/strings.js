/* Copy for the 3.0.0 server sheets. Turkish is the approved mockup copy ("sen" dili);
 * English mirrors it key for key (strings.selftest.mjs checks parity + placeholders). */
import { trDative, trGenitive, trAccusative } from "../../../lib/trSuffix.js";

export const SVH_TR = {
  close: "Kapat", cancel: "İptal", giveUp: "Vazgeç", done: "Bitti", save: "Kaydet", create: "Oluştur", back: "Geri",
  server: "Sunucu", none: "Yok", off: "Kapalı", on: "Açık", loading: "Yükleniyor", retry: "Tekrar dene", failed: "Bir şeyler ters gitti.",
  saved: "Kaydedildi", copied: "Kopyalandı", notNow: "Şimdi değil",
  // hub root (03)
  heroMeta: "{members} üye · {online} çevrimiçi · {voice} seste", heroMetaNoOnline: "{members} üye · {voice} seste",
  qInvite: "Davet et", qNotif: "Bildirimler", qAddChannel: "Kanal ekle", qSearch: "Ara",
  secServer: "Sunucu", secMembers: "Üyeler", secModeration: "Moderasyon", secForYou: "Senin için",
  rOverview: "Genel bakış", rOverviewSub: "Ad, simge, banner, sistem kanalları", rChannels: "Kanallar", rCommunity: "Topluluk ve Keşif",
  rRules: "Kurallar", rRulesVal: "{n} madde", rMembers: "Üyeler", rRoles: "Roller", rInvites: "Davetler", rInvitesVal: "{n} aktif",
  rBans: "Yasaklar", rAudit: "Denetim kaydı", rNotif: "Bildirimler", rFolder: "Klasör", noFolder: "Klasörsüz",
  transfer: "Sahipliği devret", leave: "Sunucudan ayrıl", del: "Sunucuyu sil",
  lvlAll: "Tüm mesajlar", lvlMentions: "Sadece @bahsetmeler", lvlNone: "Hiçbiri",
  // overview (04)
  changeBanner: "Banner'ı değiştir", changeIcon: "Simgeyi değiştir", secIdentity: "Kimlik", name: "Ad", description: "Açıklama",
  descPh: "Sunucunu birkaç kelimeyle anlat", secSystem: "Sistem kanalları", systemMsgs: "Sistem mesajları", afkChannel: "AFK kanalı", afkTimeout: "AFK süresi",
  systemFoot: "Yeni üye karşılaması ve sistem mesajları bu kanala düşer. Boşta kalanlar AFK süresinden sonra AFK kanalına taşınır.",
  secQuick: "Hızlı bilgiler", createdAt: "Oluşturulma", owner: "Sunucu sahibi", minutes: "{n} dk", hours: "{n} saat",
  nameTooShort: "Sunucu adı en az 2 karakter olmalı.", uploading: "Yükleniyor…", imageType: "JPG, PNG, WebP veya GIF seç.", imageSize: "Görsel en fazla 8 MB olabilir.",
  removeBanner: "Banner'ı kaldır", removeIcon: "Simgeyi kaldır", pickImage: "Görsel seç",
  // cropper (05)
  cropTitle: "Simgeyi taşı ve ölçekle", cropSub: "İki parmakla yakınlaştır · Önizleme: sunucu listesi", cropPreview: "Sunucu ikonu nasıl görünecek", choose: "Seç",
  bannerCropTitle: "Banner'ı taşı ve ölçekle", bannerCropSub: "İki parmakla yakınlaştır",
  // channels (06-09)
  createChannel: "Kanal oluştur", channelType: "Kanal türü", tText: "Metin", tTextSub: "Mesaj, resim, GIF ve bağlantılar", tAnn: "Duyuru", tAnnSub: "Sadece yetkililer yazar, üyeler takip eder",
  tVoice: "Ses", tVoiceSub: "Sesli sohbet, ekran paylaşımı ve kamera", tStage: "Sahne", tStageSub: "Konuşmacılar ve dinleyiciler",
  channelName: "Kanal adı", channelNamePh: "yeni-kanal", secSettings: "Ayarlar", category: "Kategori", noCategory: "Kategorisiz", privateChannel: "Özel kanal", privateChannelSub: "Sadece seçtiğin roller görür",
  createChannelFoot: "Yavaş mod, konu ve yaş sınırı kanalı oluşturduktan sonra Kanal ayarları'nda.",
  createCategory: "Kategori oluştur", categoryName: "Kategori adı", categoryNamePh: "Yeni kategori", privateCategory: "Özel kategori", privateCategorySub: "İçindeki kanallar seçilen rollere açık",
  createCategoryFoot: "Kategori, kanalları kenar çubuğunda gruplar. Kanalları sürükleyip içine bırakabilirsin.",
  secChannel: "Kanal", topic: "Konu", topicPh: "Bu kanal ne hakkında?", secChat: "Sohbet", slowmode: "Yavaş mod", nsfw: "Yaş sınırlı (+18)", secAccess: "Erişim",
  channelAccess: "Kanal erişimi", accessEveryone: "Herkes", accessLimited: "Seçili roller", channelNotif: "Bildirimler", serverDefault: "Sunucu varsayılanı",
  deleteChannel: "Kanalı sil", deleteCategory: "Kategoriyi sil", delChTitle: "#{name} silinsin mi?", delChMsgCount: "Kanaldaki {n} mesaj ve tüm dosyalar kalıcı olarak silinir. Bu işlem geri alınamaz.",
  delChMsg: "Kanaldaki tüm mesajlar ve dosyalar kalıcı olarak silinir. Bu işlem geri alınamaz.", delVoiceMsg: "Sesli kanal kalıcı olarak silinir. Bu işlem geri alınamaz.",
  delCatTitle: "{name} kategorisi silinsin mi?", delCatMsg: "İçindeki kanallar silinmez, kategorisiz kalır.",
  channelDeleted: "Kanal silindi", channelCreated: "Kanal oluşturuldu", categoryCreated: "Kategori oluşturuldu", newChannel: "Yeni kanal", newCategory: "Yeni kategori",
  channelsFoot: "Kanalları kenar çubuğunda basılı tutup sürükleyerek sıralayabilirsin.", textChannels: "Metin kanalları", voiceChannels: "Ses kanalları",
  sec5: "5 sn", sec10: "10 sn", sec15: "15 sn", sec30: "30 sn", min1: "1 dk", min2: "2 dk", min5: "5 dk", min10: "10 dk", min15: "15 dk", min30: "30 dk", hour1: "1 saat", hour2: "2 saat", hour6: "6 saat",
  // access (10)
  accessTitle: "{channel} · Erişim", everyoneSub: "Varsayılan · herkes", noOverride: "Özel izin yok", nChanged: "{n} izin değişti", addRoleOrMember: "Rol veya üye ekle",
  triLegend: "izin ver · varsayılan · engelle", triAllow: "İzin ver", triInherit: "Varsayılan", triDeny: "Engelle",
  permFoot: "Varsayılan, rolün sunucu iznini kullanır. Değişiklikler sadece {channel} için geçerli.", removeOverride: "Özel izinleri kaldır", addTarget: "Ekle", rolesSec: "Roller", membersSec: "Üyeler", memberTarget: "Üye",
  p_VIEW_CHANNEL: "Kanalı gör", p_SEND_MESSAGES: "Mesaj gönder", p_MANAGE_MESSAGES: "Mesajları yönet", p_CREATE_INSTANT_INVITE: "Davet oluştur", p_MENTION_EVERYONE: "@everyone etiketle",
  p_ATTACH_FILES: "Dosya ekle", p_EMBED_LINKS: "Bağlantı önizlemesi", p_ADD_REACTIONS: "Tepki ekle", p_READ_MESSAGE_HISTORY: "Mesaj geçmişini oku", p_CONNECT: "Bağlan", p_SPEAK: "Konuş",
  p_REQUEST_TO_SPEAK: "Söz iste", p_PRIORITY_SPEAKER: "Öncelikli konuşmacı", p_STREAM: "Yayın ve kamera", p_MUTE_MEMBERS: "Üyeleri sustur", p_DEAFEN_MEMBERS: "Üyeleri sağırlaştır", p_MOVE_MEMBERS: "Üyeleri taşı",
  p_MANAGE_CHANNELS: "Kanalları yönet", p_MANAGE_GUILD: "Sunucuyu yönet", p_MANAGE_ROLES: "Rolleri yönet", p_USE_APPLICATION_COMMANDS: "Uygulama komutlarını kullan", p_KICK_MEMBERS: "Üyeleri at",
  p_BAN_MEMBERS: "Üyeleri yasakla", p_MODERATE_MEMBERS: "Üyelere zaman aşımı uygula", p_CHANGE_NICKNAME: "Kendi takma adını değiştir", p_MANAGE_NICKNAMES: "Takma adları yönet", p_VIEW_AUDIT_LOG: "Denetim kaydını gör", p_ADMINISTRATOR: "Yönetici",
  // roles (11-12)
  rolesSort: "Roller · sürükleyerek sırala", nMembers: "{n} üye", everyoneAll: "Herkes · {n} üye", createRole: "Rol oluştur", rolesFoot: "Üstteki rol, alttakileri yönetebilir. Sahip her zaman en üsttedir.",
  secLook: "Görünüm", color: "Renk", hoist: "Üyeleri ayrı göster", mentionable: "Herkes @bahsedebilir", secPerms: "İzinler", deleteRole: "Rolü sil", newRole: "Yeni rol",
  delRoleTitle: "{name} rolü silinsin mi?", delRoleMsg: "Bu rol tüm üyelerden kaldırılır. Bu işlem geri alınamaz.", roleSaved: "Rol kaydedildi", roleDeleted: "Rol silindi", roleCreated: "Rol oluşturuldu",
  memberSearch: "Üye ara", roleMembersSec: "{role} · {n} üye", addSec: "Ekle", roleMembersFoot: "Seçtiklerin Kaydet'e bastığında {role} rolünü alır.", noMembersYet: "Henüz kimse yok",
  roleLocked: "Bu rolü düzenleyemezsin; senden üstte ya da eşit.", reorderSaved: "Sıralama kaydedildi",
  // members (13)
  searchInN: "{n} üyede ara", onlineN: "Çevrimiçi · {n}", offlineN: "Çevrimdışı · {n}", ownerRole: "Sahip", memberFor: "@{handle} · üye: {age}",
  ageDays: "{n} gün", ageMonths: "{n} ay", ageYears: "{n} yıl", ageToday: "bugün",
  aMessage: "Mesaj", aCall: "Ara", aProfile: "Profil", aMore: "Diğer", secOnServer: "Sunucuda", nickname: "Takma ad", nicknamePh: "Takma ad", roles: "Roller", timeout: "Zaman aşımı",
  timeoutLeft: "{t} kaldı", kick: "Sunucudan at", ban: "Yasakla", block: "Engelle", unblock: "Engeli kaldır", report: "Şikayet et", copyId: "Kimliği kopyala", copyName: "Kullanıcı adını kopyala",
  kickTitle: "{name} sunucudan atılsın mı?", kickMsg: "Yeni bir davetle tekrar katılabilir.", kickDone: "Üye atıldı", banPrompt: "{name} yasaklansın mı? İstersen bir sebep yaz:", banDone: "Üye yasaklandı",
  timeoutRemove: "Zaman aşımını kaldır", timeoutDone: "Zaman aşımı uygulandı", timeoutCleared: "Zaman aşımı kaldırıldı", nickSaved: "Takma ad güncellendi", min60s: "60 sn", day1: "1 gün", week1: "1 hafta",
  nicknameFoot: "Boş bırakırsan kullanıcı adı görünür.", noRoles: "Atanabilir rol yok", youTag: "Sen",
  // voice member (14)
  vInChannel: "{channel} · mikrofonu açık", vInChannelMuted: "{channel} · mikrofonu kapalı", vMuteForMe: "Senin için sessize al", vUnmuteForMe: "Senin için sesi aç", vProfile: "Profili gör", vMessage: "Mesaj gönder",
  vServerMute: "Sunucuda sustur", vServerUnmute: "Sunucuda susturmayı kaldır", vDeafen: "Sağırlaştır", vUndeafen: "Sağırlaştırmayı kaldır", vMove: "Kanala taşı", vDisconnect: "Bağlantıyı kes", vScreen: "Ekran sesi", vMoveTo: "Şuraya taşı",
  // invites (15)
  inviteTitle: "Davet et", yourLink: "Davet linkin", share: "Paylaş", copy: "Kopyala", inviteFriends: "Arkadaşlarını davet et", inviteBtn: "Davet et", invited: "Gönderildi",
  linkSettings: "Link ayarları", expiry: "Geçerlilik", useLimit: "Kullanım sınırı", unlimited: "Sınırsız", temporary: "Geçici üyelik", activeInvites: "Aktif davetler",
  days7: "7 gün", never: "Süresiz", nUses: "{n} kullanım", usesOf: "{n} / {max}", leftDays: "{n} gün kaldı", leftHours: "{n} saat kaldı", leftMin: "{n} dk kaldı", forever: "süresiz",
  maxUses1: "1 kullanım", maxUses5: "5 kullanım", maxUses10: "10 kullanım", maxUses25: "25 kullanım", maxUses100: "100 kullanım", newLink: "Yeni link oluştur", revoke: "Daveti iptal et", revoked: "Davet iptal edildi",
  noInvites: "Aktif davet yok", inviteMsg: "{server} sunucusuna gel: {url}", noFriends: "Davet edebileceğin arkadaş yok", inviteNoPerm: "Davet oluşturma iznin yok.",
  // community (16)
  secCommunity: "Topluluk", communityFeatures: "Topluluk özellikleri", communityFeaturesSub: "Kurallar, karşılama ekranı, doğrulama", discoverable: "Keşifte listele", discoverableSub: "Herkes bulup katılabilir",
  communityFoot: "Keşifte listelemek için en az 25 üye ve kurallar gerekir. Sende {members} üye ve {rules} kural var.", secEntry: "Giriş", verification: "Doğrulama seviyesi",
  vNone: "Yok", vLow: "Düşük", vMedium: "Orta", vHigh: "Yüksek", vHighest: "En yüksek", vNoneSub: "Herkes hemen yazabilir", vLowSub: "Doğrulanmış e-posta", vMediumSub: "5 dakikadan eski hesap", vHighSub: "10 dakikadır üye", vHighestSub: "Doğrulanmış telefon",
  vanity: "Özel adres", vanityPh: "ozel-adres", vanityFoot: "Küçük harf, rakam ve tire. Boş bırakırsan özel adres kaldırılır.", secPreview: "Önizleme", previewMeta: "{desc} · {n} üye", previewMetaNoDesc: "{n} üye",
  discoverNeeds: "Keşif için en az 25 üye ve kurallar gerekir.", rulesTitle: "Kurallar", rulesSec: "Her satır bir kural", rulesPh: "Herkese saygılı ol.", rulesFoot: "Topluluk açıkken yeni üyeler katılmadan önce bu kuralları kabul eder.",
  // rules gate (17)
  welcomeTo: "{serverDat} hoş geldin", gateMsg: "Sohbete başlamadan önce kuralları okuyup kabul etmen gerekiyor.", serverRules: "Sunucu kuralları", iAccept: "Kuralları okudum ve kabul ediyorum", acceptJoin: "Kabul et ve katıl", rulesAccepted: "Kurallar kabul edildi",
  // moderation (18)
  moderation: "Moderasyon", bansN: "Yasaklar · {n}", bansTab: "Yasaklar", searchBans: "Yasaklı ara", nBanned: "{n} yasaklı", unban: "Kaldır", bansFoot: "Yasağı kaldırınca kişi yeni bir davetle tekrar katılabilir.",
  unbanned: "Yasak kaldırıldı", noBans: "Yasaklı kimse yok", fAll: "Tümü", fMembers: "Üyeler", fRoles: "Roller", fChannels: "Kanallar", fServer: "Sunucu", today: "Bugün", yesterday: "Dün", noLogs: "Kayıt yok", someone: "Biri", aMember: "bir üye",
  au_SERVER_CREATE: "Sunucuyu oluşturdu", au_SERVER_UPDATE: "Sunucu ayarlarını değiştirdi", au_SERVER_RENAME: "Sunucu adını {name} yaptı", au_MEMBER_JOIN: "Sunucuya katıldı", au_MEMBER_LEAVE: "Sunucudan ayrıldı",
  au_MEMBER_KICK: "{targetAcc} sunucudan attı", au_MEMBER_BAN: "{targetAcc} yasakladı", au_MEMBER_UNBAN: "{targetGen} yasağını kaldırdı", au_MEMBER_ROLE_ADD: "{targetDat} {role} rolünü verdi", au_MEMBER_ROLE_REMOVE: "{targetGen} {role} rolünü aldı",
  au_MEMBER_TIMEOUT: "{targetDat} {dur} zaman aşımı verdi", au_MEMBER_TIMEOUT_CLEAR: "{targetGen} zaman aşımını kaldırdı", au_MEMBER_NICKNAME: "{targetGen} takma adını değiştirdi",
  au_ROLE_CREATE: "{role} rolünü oluşturdu", au_ROLE_UPDATE: "{role} rolünü düzenledi", au_ROLE_DELETE: "{role} rolünü sildi", au_CHANNEL_CREATE: "#{channel} kanalını oluşturdu", au_CHANNEL_UPDATE: "#{channel} kanalını düzenledi",
  au_CHANNEL_DELETE: "#{channel} kanalını sildi", au_CHANNEL_OVERRIDE_SET: "#{channel} erişimini değiştirdi", au_CHANNEL_OVERRIDE_DELETE: "#{channel} özel izinlerini kaldırdı", au_CHANNEL_OVERRIDE_CLEAR: "#{channel} özel izinlerini kaldırdı",
  au_INVITE_CREATE: "Davet linki oluşturdu", au_INVITE_DELETE: "Bir daveti iptal etti", au_OWNERSHIP_TRANSFER: "Sahipliği {targetDat} devretti", au_RULES_ACCEPT: "Kuralları kabul etti", au_OTHER: "Bir değişiklik yaptı",
  aChannel: "kanal", aRole: "rol",
  // notifications (19)
  notifyMe: "Bana bildir", muteServer: "Sunucuyu sessize al", muteFoot: "Sessize alınca okunmamış rozetleri görünmez; @bahsetmeler yine gelir.", channelExceptions: "Kanal istisnaları", addException: "İstisna ekle",
  mute1h: "1 saat", mute8h: "8 saat", mute24h: "24 saat", muteForever: "Süresiz", unmute: "Sesi aç", mutedUntil: "{t} kadar", mutedForever: "Süresiz", muteSub: "1 saat · 8 saat · Süresiz", notifSaved: "Bildirim ayarı güncellendi",
  pickChannel: "Kanal seç", noExceptions: "İstisna yok",
  // folder
  folderTitle: "Klasör", newFolder: "Yeni klasör…", folderNamePh: "Klasör adı", folderMoved: "Klasöre taşındı", folderFoot: "Klasörler sadece senin sunucu listende görünür.",
  // leave / delete / transfer (20-22)
  leaveTitle: "{serverAbl} ayrılmak istiyor musun?", leaveMsg: "Tekrar katılmak için yeni bir davete ihtiyacın olacak.", leaveBtn: "Ayrıl",
  delTitle: "{server} silinsin mi?", delMsg: "{channels} kanal, {members} üyenin erişimi ve tüm mesajlar kalıcı olarak silinir. Bu işlem geri alınamaz.", delTypeName: "Onaylamak için sunucu adını yaz",
  delBtn: "Sunucuyu kalıcı olarak sil", delTransferFirst: "Önce sahipliği devret", ownerSheetTitle: "{serverGen} sahibisin", ownerSheetSub: "Ayrılmadan önce sunucu ne olacak?", ownerDelLeave: "Sunucuyu sil ve ayrıl",
  pickOwner: "Yeni sahibi seç", transferNotice: "<b>{name}</b> sunucunun sahibi olur. Sen rollerinle üye olarak kalırsın; geri almak için {nameGen} onayı gerekir.",
  transferNoticeLeave: "<b>{name}</b> sunucunun sahibi olur ve sen sunucudan ayrılırsın.", transferNoticeNone: "Sahipliği devretmek için bir üye seç.", transferTo: "Sahipliği {nameDat} devret",
  transferConfirm: "Son adım", transferConfirmMsg: "Sunucu adını ve şifreni yazınca sahiplik {nameDat} geçer.", password: "Şifren", passwordPh: "Hesap şifren", transferBtn: "Devret", noCandidates: "Sahipliği alabilecek başka üye yok", noResults: "Sonuç yok", reasonOpt: "Sebep (isteğe bağlı)", ok: "Tamam", kickShort: "At", roleNameNeeded: "Rol adı gerekli", removeOverrideMsg: "{target} için {channel} kanalındaki özel izinler silinir; varsayılanlar geçerli olur.", delVoiceTitle: "{name} silinsin mi?", transferDone: "Sahiplik {nameDat} devredildi", nameMismatch: "Sunucu adı eşleşmiyor", wrongPassword: "Şifre yanlış", blocked: "Engellendi", unblocked: "Engel kaldırıldı", reorderDrag: "Sıralamak için sürükle",
  // create / join (01-02)
  createTitle: "Sunucu oluştur", createIntro: "Bir şablonla başla; kanallar ve roller hazır gelsin. Sonra istediğin gibi değiştirebilirsin.", pickTemplate: "Şablon seç",
  tplGaming: "Oyun ekibi", tplGamingSub: "Lobi, rekabetçi ses, klipler, turnuva rolleri", tplFriends: "Arkadaş grubu", tplFriendsSub: "Genel sohbet, planlar, müzik gecesi", tplSchool: "Okul ve kulüp", tplSchoolSub: "Duyurular, ders kanalları, etkinlikler",
  tplCommunity: "Topluluk", tplCommunitySub: "Kurallar, keşif, moderasyon hazır", tplBlank: "Sıfırdan oluştur", tplBlankSub: "Sadece #genel ve Lobi", haveInvite: "Davetin mi var?", joinServer: "Sunucuya katıl", joinServerSub: "Davet linkini veya kodunu gir",
  ownedFoot: "Sahip olabileceğin sunucu: {n} / {max}", ownedFull: "En fazla {max} sunucuya sahip olabilirsin.", serverNameSec: "Sunucu adı", serverNamePh: "{name} sunucusu", serverIcon: "Simge", addIcon: "Simge ekle",
  createFoot: "Oluşturunca davet linkin hazır olur.", created: "Sunucu oluşturuldu", inviteLink: "Davet linki", inviteFoot: "Link, kod ({code}) ya da özel adres yapıştırabilirsin.", invitePh: "descall.com/i/…",
  onlineCount: "{n} çevrimiçi", inviterLine: "<b>{name}</b> seni davet etti", validFor: "{n} gün geçerli", validForHours: "{n} saat geçerli", validForever: "süresiz geçerli", notFound: "Bu davet geçersiz ya da süresi dolmuş.", alreadyMember: "Zaten bu sunucudasın",
  joined: "Sunucuya katıldın", openServer: "Sunucuya git", banned: "Bu sunucudan yasaklandın.",
  // sheets extras
  createDetails: "Sunucunu özelleştir", discoverRow: "Herkese açık sunucuları keşfet", discoverSub: "Keşifte listelenen topluluklar",
  discoverTitle: "Keşfet", searchServers: "Sunucu ara", noPublic: "Sunucu bulunamadı", joinFailed: "Sunucuya katılamadın.",
  vVolume: "Ses seviyesi", vSpeak: "Konuşmaya davet et", vAudience: "Dinleyicilere al", unfiled: "Klasörsüz", folderCreated: "Klasör oluşturuldu", movedOut: "Klasörden çıkarıldı",
  // long-press menus (23-24)
  markRead: "Okundu olarak işaretle", mute: "Sessize al", notifications: "Bildirimler", invitePeople: "İnsanları davet et", moveToFolder: "Klasöre taşı", serverSettings: "Sunucu ayarları",
  folderSubNone: "Yeni klasör…", rename: "Yeniden adlandır", folderColor: "Klasör rengi", markAllRead: "Tümünü okundu say", muteAll: "Tümünü sessize al", unmuteAll: "Tümünün sesini aç", ungroup: "Klasörü dağıt", ungroupSub: "Sunucular klasörsüz kalır",
  deleteFolder: "Klasörü sil", nServers: "{n} sunucu", renamePrompt: "Klasörün yeni adı", markedRead: "Okundu olarak işaretlendi", mutedDone: "Sessize alındı", unmutedDone: "Sesi açıldı", folderDeleted: "Klasör silindi", ungrouped: "Klasör dağıtıldı",
  delFolderTitle: "{name} klasörü silinsin mi?", delFolderMsg: "Sunucular silinmez, klasörsüz kalır.", listMeta: "{members} üye · {online} çevrimiçi", listMetaNoOnline: "{members} üye",
};

export const SVH_EN = {
  close: "Close", cancel: "Cancel", giveUp: "Cancel", done: "Done", save: "Save", create: "Create", back: "Back",
  server: "Server", none: "None", off: "Off", on: "On", loading: "Loading", retry: "Try again", failed: "Something went wrong.",
  saved: "Saved", copied: "Copied", notNow: "Not now",
  heroMeta: "{members} members · {online} online · {voice} in voice", heroMetaNoOnline: "{members} members · {voice} in voice",
  qInvite: "Invite", qNotif: "Notifications", qAddChannel: "Add channel", qSearch: "Search",
  secServer: "Server", secMembers: "Members", secModeration: "Moderation", secForYou: "For you",
  rOverview: "Overview", rOverviewSub: "Name, icon, banner, system channels", rChannels: "Channels", rCommunity: "Community & Discovery",
  rRules: "Rules", rRulesVal: "{n} rules", rMembers: "Members", rRoles: "Roles", rInvites: "Invites", rInvitesVal: "{n} active",
  rBans: "Bans", rAudit: "Audit log", rNotif: "Notifications", rFolder: "Folder", noFolder: "No folder",
  transfer: "Transfer ownership", leave: "Leave server", del: "Delete server",
  lvlAll: "All messages", lvlMentions: "Only @mentions", lvlNone: "Nothing",
  changeBanner: "Change banner", changeIcon: "Change icon", secIdentity: "Identity", name: "Name", description: "Description",
  descPh: "Describe your server in a few words", secSystem: "System channels", systemMsgs: "System messages", afkChannel: "AFK channel", afkTimeout: "AFK timeout",
  systemFoot: "New member welcomes and system messages land in this channel. Idle members move to the AFK channel after the AFK timeout.",
  secQuick: "Quick facts", createdAt: "Created", owner: "Server owner", minutes: "{n} min", hours: "{n} h",
  nameTooShort: "Server name must be at least 2 characters.", uploading: "Uploading…", imageType: "Choose a JPG, PNG, WebP or GIF.", imageSize: "Image must be 8 MB or smaller.",
  removeBanner: "Remove banner", removeIcon: "Remove icon", pickImage: "Choose image",
  cropTitle: "Move and scale the icon", cropSub: "Pinch to zoom · Preview: server list", cropPreview: "How the server icon will look", choose: "Choose",
  bannerCropTitle: "Move and scale the banner", bannerCropSub: "Pinch to zoom",
  createChannel: "Create channel", channelType: "Channel type", tText: "Text", tTextSub: "Messages, images, GIFs and links", tAnn: "Announcement", tAnnSub: "Only staff post, members follow",
  tVoice: "Voice", tVoiceSub: "Voice chat, screen share and camera", tStage: "Stage", tStageSub: "Speakers and listeners",
  channelName: "Channel name", channelNamePh: "new-channel", secSettings: "Settings", category: "Category", noCategory: "No category", privateChannel: "Private channel", privateChannelSub: "Only roles you pick can see it",
  createChannelFoot: "Slow mode, topic and age limit live in Channel settings after you create it.",
  createCategory: "Create category", categoryName: "Category name", categoryNamePh: "New category", privateCategory: "Private category", privateCategorySub: "Channels inside are open to picked roles",
  createCategoryFoot: "A category groups channels in the sidebar. Drag channels into it.",
  secChannel: "Channel", topic: "Topic", topicPh: "What is this channel about?", secChat: "Chat", slowmode: "Slow mode", nsfw: "Age-restricted (18+)", secAccess: "Access",
  channelAccess: "Channel access", accessEveryone: "Everyone", accessLimited: "Selected roles", channelNotif: "Notifications", serverDefault: "Server default",
  deleteChannel: "Delete channel", deleteCategory: "Delete category", delChTitle: "Delete #{name}?", delChMsgCount: "The channel's {n} messages and all files are deleted for good. This can't be undone.",
  delChMsg: "All messages and files in the channel are deleted for good. This can't be undone.", delVoiceMsg: "The voice channel is deleted for good. This can't be undone.",
  delCatTitle: "Delete the {name} category?", delCatMsg: "Channels inside are kept, without a category.",
  channelDeleted: "Channel deleted", channelCreated: "Channel created", categoryCreated: "Category created", newChannel: "New channel", newCategory: "New category",
  channelsFoot: "Long-press and drag channels in the sidebar to reorder them.", textChannels: "Text channels", voiceChannels: "Voice channels",
  sec5: "5 s", sec10: "10 s", sec15: "15 s", sec30: "30 s", min1: "1 min", min2: "2 min", min5: "5 min", min10: "10 min", min15: "15 min", min30: "30 min", hour1: "1 hour", hour2: "2 hours", hour6: "6 hours",
  accessTitle: "{channel} · Access", everyoneSub: "Default · everyone", noOverride: "No overrides", nChanged: "{n} permissions changed", addRoleOrMember: "Add role or member",
  triLegend: "allow · default · deny", triAllow: "Allow", triInherit: "Default", triDeny: "Deny",
  permFoot: "Default uses the role's server permission. Changes only apply to {channel}.", removeOverride: "Remove overrides", addTarget: "Add", rolesSec: "Roles", membersSec: "Members", memberTarget: "Member",
  p_VIEW_CHANNEL: "View channel", p_SEND_MESSAGES: "Send messages", p_MANAGE_MESSAGES: "Manage messages", p_CREATE_INSTANT_INVITE: "Create invite", p_MENTION_EVERYONE: "Mention @everyone",
  p_ATTACH_FILES: "Attach files", p_EMBED_LINKS: "Link previews", p_ADD_REACTIONS: "Add reactions", p_READ_MESSAGE_HISTORY: "Read message history", p_CONNECT: "Connect", p_SPEAK: "Speak",
  p_REQUEST_TO_SPEAK: "Request to speak", p_PRIORITY_SPEAKER: "Priority speaker", p_STREAM: "Stream and camera", p_MUTE_MEMBERS: "Mute members", p_DEAFEN_MEMBERS: "Deafen members", p_MOVE_MEMBERS: "Move members",
  p_MANAGE_CHANNELS: "Manage channels", p_MANAGE_GUILD: "Manage server", p_MANAGE_ROLES: "Manage roles", p_USE_APPLICATION_COMMANDS: "Use app commands", p_KICK_MEMBERS: "Kick members",
  p_BAN_MEMBERS: "Ban members", p_MODERATE_MEMBERS: "Time out members", p_CHANGE_NICKNAME: "Change own nickname", p_MANAGE_NICKNAMES: "Manage nicknames", p_VIEW_AUDIT_LOG: "View audit log", p_ADMINISTRATOR: "Administrator",
  rolesSort: "Roles · drag to reorder", nMembers: "{n} members", everyoneAll: "Everyone · {n} members", createRole: "Create role", rolesFoot: "A role can manage the roles below it. The owner is always on top.",
  secLook: "Appearance", color: "Color", hoist: "Show members separately", mentionable: "Anyone can @mention", secPerms: "Permissions", deleteRole: "Delete role", newRole: "New role",
  delRoleTitle: "Delete the {name} role?", delRoleMsg: "The role is removed from every member. This can't be undone.", roleSaved: "Role saved", roleDeleted: "Role deleted", roleCreated: "Role created",
  memberSearch: "Search members", roleMembersSec: "{role} · {n} members", addSec: "Add", roleMembersFoot: "People you pick get the {role} role when you tap Save.", noMembersYet: "Nobody yet",
  roleLocked: "You can't edit this role; it's above or equal to yours.", reorderSaved: "Order saved",
  searchInN: "Search {n} members", onlineN: "Online · {n}", offlineN: "Offline · {n}", ownerRole: "Owner", memberFor: "@{handle} · member for {age}",
  ageDays: "{n} days", ageMonths: "{n} months", ageYears: "{n} years", ageToday: "today",
  aMessage: "Message", aCall: "Call", aProfile: "Profile", aMore: "More", secOnServer: "On this server", nickname: "Nickname", nicknamePh: "Nickname", roles: "Roles", timeout: "Timeout",
  timeoutLeft: "{t} left", kick: "Kick from server", ban: "Ban", block: "Block", unblock: "Unblock", report: "Report", copyId: "Copy ID", copyName: "Copy username",
  kickTitle: "Kick {name} from the server?", kickMsg: "They can rejoin with a new invite.", kickDone: "Member kicked", banPrompt: "Ban {name}? Add a reason if you like:", banDone: "Member banned",
  timeoutRemove: "Remove timeout", timeoutDone: "Timeout applied", timeoutCleared: "Timeout removed", nickSaved: "Nickname updated", min60s: "60 s", day1: "1 day", week1: "1 week",
  nicknameFoot: "Leave empty to show the username.", noRoles: "No assignable roles", youTag: "You",
  vInChannel: "{channel} · mic on", vInChannelMuted: "{channel} · mic off", vMuteForMe: "Mute for you", vUnmuteForMe: "Unmute for you", vProfile: "View profile", vMessage: "Send message",
  vServerMute: "Server mute", vServerUnmute: "Remove server mute", vDeafen: "Deafen", vUndeafen: "Undeafen", vMove: "Move to channel", vDisconnect: "Disconnect", vScreen: "Screen audio", vMoveTo: "Move to",
  inviteTitle: "Invite", yourLink: "Your invite link", share: "Share", copy: "Copy", inviteFriends: "Invite your friends", inviteBtn: "Invite", invited: "Sent",
  linkSettings: "Link settings", expiry: "Expires after", useLimit: "Max uses", unlimited: "No limit", temporary: "Temporary membership", activeInvites: "Active invites",
  days7: "7 days", never: "Never", nUses: "{n} uses", usesOf: "{n} / {max}", leftDays: "{n} days left", leftHours: "{n} h left", leftMin: "{n} min left", forever: "never expires",
  maxUses1: "1 use", maxUses5: "5 uses", maxUses10: "10 uses", maxUses25: "25 uses", maxUses100: "100 uses", newLink: "Create new link", revoke: "Revoke invite", revoked: "Invite revoked",
  noInvites: "No active invites", inviteMsg: "Join me on {server}: {url}", noFriends: "No friends to invite", inviteNoPerm: "You can't create invites.",
  secCommunity: "Community", communityFeatures: "Community features", communityFeaturesSub: "Rules, welcome screen, verification", discoverable: "List in Discover", discoverableSub: "Anyone can find and join",
  communityFoot: "Discover needs at least 25 members and rules. You have {members} members and {rules} rules.", secEntry: "Entry", verification: "Verification level",
  vNone: "None", vLow: "Low", vMedium: "Medium", vHigh: "High", vHighest: "Highest", vNoneSub: "Anyone can post right away", vLowSub: "Verified email", vMediumSub: "Account older than 5 minutes", vHighSub: "Member for 10 minutes", vHighestSub: "Verified phone",
  vanity: "Custom address", vanityPh: "custom-address", vanityFoot: "Lowercase letters, digits and dashes. Leave empty to remove it.", secPreview: "Preview", previewMeta: "{desc} · {n} members", previewMetaNoDesc: "{n} members",
  discoverNeeds: "Discover needs at least 25 members and rules.", rulesTitle: "Rules", rulesSec: "One rule per line", rulesPh: "Be kind to everyone.", rulesFoot: "With community on, new members accept these rules before joining.",
  welcomeTo: "Welcome to {serverDat}", gateMsg: "Read and accept the rules before you start chatting.", serverRules: "Server rules", iAccept: "I've read and accept the rules", acceptJoin: "Accept and join", rulesAccepted: "Rules accepted",
  moderation: "Moderation", bansN: "Bans · {n}", bansTab: "Bans", searchBans: "Search bans", nBanned: "{n} banned", unban: "Revoke", bansFoot: "Once unbanned, they can rejoin with a new invite.",
  unbanned: "Ban revoked", noBans: "Nobody is banned", fAll: "All", fMembers: "Members", fRoles: "Roles", fChannels: "Channels", fServer: "Server", today: "Today", yesterday: "Yesterday", noLogs: "No entries", someone: "Someone", aMember: "a member",
  au_SERVER_CREATE: "Created the server", au_SERVER_UPDATE: "Changed server settings", au_SERVER_RENAME: "Renamed the server to {name}", au_MEMBER_JOIN: "Joined the server", au_MEMBER_LEAVE: "Left the server",
  au_MEMBER_KICK: "Kicked {targetAcc}", au_MEMBER_BAN: "Banned {targetAcc}", au_MEMBER_UNBAN: "Unbanned {targetGen}", au_MEMBER_ROLE_ADD: "Gave {targetDat} the {role} role", au_MEMBER_ROLE_REMOVE: "Removed {role} from {targetGen}",
  au_MEMBER_TIMEOUT: "Timed out {targetDat} for {dur}", au_MEMBER_TIMEOUT_CLEAR: "Removed {targetGen} timeout", au_MEMBER_NICKNAME: "Changed {targetGen} nickname",
  au_ROLE_CREATE: "Created the {role} role", au_ROLE_UPDATE: "Edited the {role} role", au_ROLE_DELETE: "Deleted the {role} role", au_CHANNEL_CREATE: "Created #{channel}", au_CHANNEL_UPDATE: "Edited #{channel}",
  au_CHANNEL_DELETE: "Deleted #{channel}", au_CHANNEL_OVERRIDE_SET: "Changed #{channel} access", au_CHANNEL_OVERRIDE_DELETE: "Removed #{channel} overrides", au_CHANNEL_OVERRIDE_CLEAR: "Removed #{channel} overrides",
  au_INVITE_CREATE: "Created an invite link", au_INVITE_DELETE: "Revoked an invite", au_OWNERSHIP_TRANSFER: "Transferred ownership to {targetDat}", au_RULES_ACCEPT: "Accepted the rules", au_OTHER: "Made a change",
  aChannel: "channel", aRole: "role",
  notifyMe: "Notify me about", muteServer: "Mute server", muteFoot: "While muted, unread badges are hidden; @mentions still come through.", channelExceptions: "Channel exceptions", addException: "Add exception",
  mute1h: "1 hour", mute8h: "8 hours", mute24h: "24 hours", muteForever: "Until I turn it off", unmute: "Unmute", mutedUntil: "Until {t}", mutedForever: "Indefinitely", muteSub: "1 hour · 8 hours · Indefinitely", notifSaved: "Notification setting updated",
  pickChannel: "Pick a channel", noExceptions: "No exceptions",
  folderTitle: "Folder", newFolder: "New folder…", folderNamePh: "Folder name", folderMoved: "Moved to folder", folderFoot: "Folders only show in your own server list.",
  leaveTitle: "Leave {serverAbl}?", leaveMsg: "You'll need a new invite to join again.", leaveBtn: "Leave",
  delTitle: "Delete {server}?", delMsg: "{channels} channels, access for {members} members and every message are deleted for good. This can't be undone.", delTypeName: "Type the server name to confirm",
  delBtn: "Delete server permanently", delTransferFirst: "Transfer ownership first", ownerSheetTitle: "You own {serverGen}", ownerSheetSub: "What happens to the server before you leave?", ownerDelLeave: "Delete server and leave",
  pickOwner: "Pick the new owner", transferNotice: "<b>{name}</b> becomes the owner. You stay as a member with your roles; getting it back needs {nameGen} approval.",
  transferNoticeLeave: "<b>{name}</b> becomes the owner and you leave the server.", transferNoticeNone: "Pick a member to transfer ownership.", transferTo: "Transfer ownership to {nameDat}",
  transferConfirm: "Last step", transferConfirmMsg: "Type the server name and your password to hand ownership to {nameDat}.", password: "Your password", passwordPh: "Account password", transferBtn: "Transfer", noCandidates: "No other member can take ownership", noResults: "No results", reasonOpt: "Reason (optional)", ok: "OK", kickShort: "Kick", roleNameNeeded: "Role name is required", removeOverrideMsg: "Overrides for {target} in {channel} are removed; defaults apply again.", delVoiceTitle: "Delete {name}?", transferDone: "Ownership transferred to {nameDat}", nameMismatch: "The server name doesn't match", wrongPassword: "Wrong password", blocked: "Blocked", unblocked: "Unblocked", reorderDrag: "Drag to reorder",
  createTitle: "Create a server", createIntro: "Start from a template; channels and roles come ready. Change anything later.", pickTemplate: "Pick a template",
  tplGaming: "Gaming squad", tplGamingSub: "Lobby, competitive voice, clips, tournament roles", tplFriends: "Friend group", tplFriendsSub: "General chat, plans, music night", tplSchool: "School & club", tplSchoolSub: "Announcements, class channels, events",
  tplCommunity: "Community", tplCommunitySub: "Rules, discovery, moderation ready", tplBlank: "Start from scratch", tplBlankSub: "Just #general and Lobby", haveInvite: "Got an invite?", joinServer: "Join a server", joinServerSub: "Enter an invite link or code",
  ownedFoot: "Servers you can own: {n} / {max}", ownedFull: "You can own at most {max} servers.", serverNameSec: "Server name", serverNamePh: "{name}'s server", serverIcon: "Icon", addIcon: "Add icon",
  createFoot: "Your invite link is ready once you create it.", created: "Server created", inviteLink: "Invite link", inviteFoot: "Paste a link, a code ({code}) or a custom address.", invitePh: "descall.com/i/…",
  onlineCount: "{n} online", inviterLine: "<b>{name}</b> invited you", validFor: "valid for {n} days", validForHours: "valid for {n} hours", validForever: "never expires", notFound: "This invite is invalid or expired.", alreadyMember: "You're already in this server",
  joined: "You joined the server", openServer: "Open server", banned: "You are banned from this server.",
  markRead: "Mark as read", mute: "Mute", notifications: "Notifications", invitePeople: "Invite people", moveToFolder: "Move to folder", serverSettings: "Server settings",
  folderSubNone: "New folder…", rename: "Rename", folderColor: "Folder color", markAllRead: "Mark all as read", muteAll: "Mute all", unmuteAll: "Unmute all", ungroup: "Ungroup folder", ungroupSub: "Servers stay, without a folder",
  deleteFolder: "Delete folder", nServers: "{n} servers", renamePrompt: "New folder name", markedRead: "Marked as read", mutedDone: "Muted", unmutedDone: "Unmuted", folderDeleted: "Folder deleted", ungrouped: "Folder ungrouped",
  // sheets extras
  createDetails: "Customize your server", discoverRow: "Browse public servers", discoverSub: "Communities listed in Discover",
  discoverTitle: "Discover", searchServers: "Search servers", noPublic: "No servers found", joinFailed: "Couldn't join the server.",
  vVolume: "Volume", vSpeak: "Invite to speak", vAudience: "Move to audience", unfiled: "Unfiled", folderCreated: "Folder created", movedOut: "Removed from folder",
  delFolderTitle: "Delete the {name} folder?", delFolderMsg: "Servers are kept, without a folder.", listMeta: "{members} members · {online} online", listMetaNoOnline: "{members} members",
};

const VOW = "aeıioöuü";
const lowerTr = (s) => String(s || "").replace(/I/g, "ı").replace(/İ/g, "i").toLowerCase();
/** "Müzik Kulübü" → "Müzik Kulübü'nden", "Oyun Gecesi" → "Oyun Gecesi'nden", "Kod" → "Kod'dan". */
export function trAblative(name) {
  const printed = String(name || "").trim();
  if (!printed) return "";
  const sound = lowerTr(printed.replace(/[^\p{L}\p{N}]+$/u, ""));
  let v = "";
  for (let i = sound.length - 1; i >= 0; i -= 1) if (VOW.includes(sound[i])) { v = sound[i]; break; }
  const a = v && "aıou".includes(v) ? "a" : "e";
  const last = sound.slice(-1);
  if (VOW.includes(last)) return isPossessiveCompound(printed) ? `${printed}'nd${a}n` : `${printed}'d${a}n`;
  return `${printed}'${"fstkçşhp".includes(last) ? "t" : "d"}${a}n`;
}

export function fmt(str, vars) {
  if (!vars || typeof str !== "string") return str || "";
  return str.replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? String(vars[k]) : ""));
}

/** Multi-word names ending in a possessive vowel ("Oyun Gecesi", "Müzik Kulübü") take the
 * pronominal n: "Oyun Gecesi'ne", "Müzik Kulübü'nü". Single words keep the y buffer ("Ali'ye"). */
function isPossessiveCompound(name) {
  const words = String(name || "").trim().split(/\s+/);
  if (words.length < 2) return false;
  const w = lowerTr(words[words.length - 1]);
  return /[\p{L}]{2,}[ıiuü]$/u.test(w);
}
function harmonyA(name) {
  const sound = lowerTr(name);
  for (let i = sound.length - 1; i >= 0; i -= 1) if (VOW.includes(sound[i])) return "aıou".includes(sound[i]) ? "a" : "e";
  return "e";
}
function fourWay(name) {
  const sound = lowerTr(name);
  for (let i = sound.length - 1; i >= 0; i -= 1) {
    const v = sound[i];
    if (!VOW.includes(v)) continue;
    if ("aı".includes(v)) return "ı";
    if ("ei".includes(v)) return "i";
    if ("ou".includes(v)) return "u";
    return "ü";
  }
  return "i";
}
export function trDativeName(name) {
  const n = String(name || "").trim();
  return isPossessiveCompound(n) ? `${n}'n${harmonyA(n)}` : trDative(n);
}
export function trAccusativeName(name) {
  const n = String(name || "").trim();
  return isPossessiveCompound(n) ? `${n}'n${fourWay(n)}` : trAccusative(n);
}

/** Case-aware name helpers: Turkish adds the suffix, English keeps the name (genitive gets 's). */
export function caseHelpers(locale) {
  const tr = locale === "tr";
  return {
    dat: (n) => (tr ? trDativeName(n) : n),
    gen: (n) => (tr ? trGenitive(n) : `${n}'s`),
    acc: (n) => (tr ? trAccusativeName(n) : n),
    abl: (n) => (tr ? trAblative(n) : n),
  };
}
