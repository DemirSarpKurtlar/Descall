"use strict";

/**
 * Snapshot of the live "Descall Topluluk" rows (servers, server_channels and the six
 * opening server_messages, read 28 Nov 2026) for the localization selftests, the
 * integration test and the e2e mock. Public server content only, no user data.
 */

const SERVER = {
  id: "be4b140c-f5a3-487c-b301-8b66b17086fa",
  name: "Descall Topluluk",
  description: "Descall'un resmi topluluk sunucusu. Yeni gelenler burada tanışır, soru sorar, oyun ve sohbet arkadaşı bulur. Duyurular, ipuçları ve etkinlikler de burada.",
  owner_id: "d6a94c7c-c160-4a12-8d74-a175d96b45d2",
  is_public: true,
};

const c = (id, name, type, topic, position, parent_id) => ({ id, server_id: SERVER.id, name, type, topic, position, parent_id });

const CHANNELS = [
  c("3bda105d-e9e7-42a5-8959-76b9749728d2", "Başla", "category", null, 0, null),
  c("2accd626-957e-4061-b124-c04cae1ceda3", "Sohbet", "category", null, 1, null),
  c("4cecb85e-8516-419c-a0b7-78589c5238eb", "Destek", "category", null, 2, null),
  c("d675a989-13d6-4f23-916a-0edce90e1f60", "Ses Odaları", "category", null, 3, null),
  c("63912efe-1020-4a45-9cab-e3738473d7bd", "Ekip", "category", null, 4, null),
  c("1d8aa1d9-6e54-4442-ac21-75146c266638", "hos-geldin", "text", "Descall Topluluk'a hoş geldin! Kuralları oku, #tanisma kanalında kendini tanıt, soruların için #yardim kanalına yaz.", 5, "3bda105d-e9e7-42a5-8959-76b9749728d2"),
  c("681005ed-6314-4586-8a61-5df82c668102", "kurallar", "text", "Topluluk kuralları. Sohbete başlamadan önce oku ve kabul et.", 6, "3bda105d-e9e7-42a5-8959-76b9749728d2"),
  c("786ff977-45c2-471b-ba12-7b17d4c222bf", "duyurular", "announcement", "Descall'dan resmi haberler, yeni sürümler ve güncellemeler.", 7, "3bda105d-e9e7-42a5-8959-76b9749728d2"),
  c("c56332d1-22f4-43d3-8a14-99b670253a22", "tanisma", "text", "Kendini tanıt: adın ya da lakabın, nelerle uğraşıyorsun, hangi oyunları oynuyorsun, ne dinliyorsun. Yeni gelenlere bir selam ver.", 8, "3bda105d-e9e7-42a5-8959-76b9749728d2"),
  c("60d46fa3-4ab7-4b41-a6d1-a311ada3098d", "etkinlikler", "text", "Turnuvalar, izleme partileri, ders kampları ve topluluk geceleri. Haber almak için Etkinlik Bildirimi rolünü al.", 9, "3bda105d-e9e7-42a5-8959-76b9749728d2"),
  c("84f0161e-0f02-493c-818b-7b1e14f8a429", "genel", "text", "Her konuda sohbet. Saygılı ol, yeni gelenlere yardım et.", 10, "2accd626-957e-4061-b124-c04cae1ceda3"),
  c("3f72f85a-1546-419c-b976-cc6a729942a4", "oyun", "text", "Oyun sohbeti ve birlikte oynayacak arkadaş arama. Oyun, platform ve saat yaz, sesli odaya geç.", 11, "2accd626-957e-4061-b124-c04cae1ceda3"),
  c("bb17d38b-48eb-4d1c-aa7d-0e8149f8760b", "muzik", "text", "Ne dinliyorsun? Çalma listeleri, yeni şarkılar ve konser haberleri.", 12, "2accd626-957e-4061-b124-c04cae1ceda3"),
  c("9915bb32-ebe6-4162-bacd-77ed51fbedb1", "ders-calisma", "text", "YKS, LGS, üniversite ve kendi kendine öğrenme. Soru sor, kaynak paylaş, birlikte çalışma saati ayarla.", 13, "2accd626-957e-4061-b124-c04cae1ceda3"),
  c("2872b721-0cde-4473-b682-ba5122411d14", "film-dizi-anime", "text", "Film, dizi ve anime önerileri. Spoiler verirken uyar.", 14, "2accd626-957e-4061-b124-c04cae1ceda3"),
  c("ef01ea44-c79e-4575-b9fd-31d4aa8e657c", "yazilim-teknoloji", "text", "Kod, donanım, yapay zeka ve teknoloji haberleri.", 15, "2accd626-957e-4061-b124-c04cae1ceda3"),
  c("8fd19fbd-016d-4a8f-ad61-5edcec18925e", "paylasim", "text", "Fotoğraf, klip, çizim, kendi yaptıkların. Sadece paylaşım, sohbet #genel kanalında.", 16, "2accd626-957e-4061-b124-c04cae1ceda3"),
  c("9b89cfb3-3744-4e5b-8ce6-5e0b03b27cf1", "yardim", "text", "Descall'u kullanırken takıldığın her şey: hesap, ses, ekran paylaşımı, sunucu ayarları. Rehberler ve ekip burada yanıtlar.", 17, "4cecb85e-8516-419c-a0b7-78589c5238eb"),
  c("d4579943-c892-43f1-92a1-628d83c8f8ca", "hata-bildir", "text", "Bir hata mı buldun? Ne yaptığını, ne beklediğini, ne olduğunu ve cihazını yaz. Doğrulanan gerçek hatalar Bug Avcısı rozeti ve DesCoin kazandırır.", 18, "4cecb85e-8516-419c-a0b7-78589c5238eb"),
  c("ea318873-1d74-422d-b320-66480708576f", "oneri-ve-fikir", "text", "Descall'da görmek istediğin özellikler ve fikirler. Beğendiğin öneriye tepki ver, ekip okuyor.", 19, "4cecb85e-8516-419c-a0b7-78589c5238eb"),
  c("f7e8552e-8a75-4abe-b872-af794037364d", "descall-ipuclari", "text", "Kısayollar, gizli özellikler, ses ve görüntü ayarları, Descall+ ve DesCoin hakkında ipuçları.", 20, "4cecb85e-8516-419c-a0b7-78589c5238eb"),
  c("15631bf6-8065-46e4-a736-93e2a852dd46", "Lobi", "voice", null, 21, "d675a989-13d6-4f23-916a-0edce90e1f60"),
  c("36fb2004-ba39-477a-b4e6-9f1709510b5f", "Sohbet Odası", "voice", null, 22, "d675a989-13d6-4f23-916a-0edce90e1f60"),
  c("767948ef-3b44-4ef1-a1e8-faa5aadbf79d", "Oyun Odası", "voice", null, 23, "d675a989-13d6-4f23-916a-0edce90e1f60"),
  c("f0915cac-3bc2-4650-9f20-e4c4122ac32f", "Müzik Odası", "voice", null, 24, "d675a989-13d6-4f23-916a-0edce90e1f60"),
  c("281cdc0e-404a-4bed-9017-207c14a7dc32", "Ders Çalışma (Sessiz)", "voice", null, 25, "d675a989-13d6-4f23-916a-0edce90e1f60"),
  c("18ffdefc-1c25-491e-b7df-c5778917e56c", "Etkinlik Sahnesi", "stage", null, 26, "d675a989-13d6-4f23-916a-0edce90e1f60"),
  c("0be60255-f680-4ba0-b002-e24262d3f233", "AFK", "voice", null, 27, "d675a989-13d6-4f23-916a-0edce90e1f60"),
  c("02e56afc-a555-47c8-9ae9-15e460e65b82", "ekip-sohbet", "text", "Ekip içi koordinasyon. Sadece Descall Ekibi ve moderatörler görür.", 28, "63912efe-1020-4a45-9cab-e3738473d7bd"),
  c("f4f4a8a4-fb14-442b-a642-79b25378bac7", "mod-kayitlari", "text", "Moderasyon notları ve vaka kayıtları.", 29, "63912efe-1020-4a45-9cab-e3738473d7bd"),
  c("4adf9f02-9766-4371-8e15-6018ce362864", "Ekip Odası", "voice", null, 30, "63912efe-1020-4a45-9cab-e3738473d7bd"),
];

const PINNED_AT = "2026-11-28T14:52:00.256Z";
const m = (id, channel_id, content, pinned, i) => ({
  id,
  server_id: SERVER.id,
  channel_id,
  sender_id: SERVER.owner_id,
  content,
  media_url: null,
  media_type: null,
  message_type: "text",
  created_at: `2026-11-28T14:52:0${i}.256Z`,
  updated_at: PINNED_AT,
  edited_at: null,
  pinned_at: pinned ? PINNED_AT : null,
});

const MESSAGES = [
  m("401e70db-e932-4393-86be-0425a241b85a", "1d8aa1d9-6e54-4442-ac21-75146c266638", "Descall Topluluk'a hoş geldin!\n\nBurası Descall'un resmi topluluk sunucusu. Yeni insanlarla tanışabilir, sohbet ve oyun arkadaşı bulabilir, Descall ile ilgili her şeyi doğrudan ekibe sorabilirsin.\n\nBaşlamak için:\n1. #kurallar kanalını oku ve kabul et.\n2. #tanisma kanalında kendini kısaca tanıt.\n3. Sohbet etmek için #genel, oyun için #oyun, sesli takılmak için Lobi'ye gel.\n\nBir sorun mu var? #yardim kanalına yaz.\nBir hata mı buldun? #hata-bildir kanalına yaz. Gerçek hata bulanlara Bug Hunter rozeti veriyoruz.\nBir fikrin mi var? #oneri-ve-fikir kanalında bekliyoruz.\n\nİyi sohbetler!", true, 1),
  m("81d1ae52-594a-479a-a2b1-2a9a3fff5d2f", "681005ed-6314-4586-8a61-5df82c668102", "**Sunucu kuralları**\n\n1. Saygılı ol. Hakaret, taciz, nefret söylemi, ayrımcılık ve tehdit yasak.\n2. Spam, flood, reklam ve izinsiz davet bağlantısı paylaşma.\n3. +18, şiddet içeren veya rahatsız edici içerik paylaşma.\n4. Kişisel bilgileri (adres, telefon, şifre, fotoğraf) paylaşma, başkasınınkini hiç paylaşma.\n5. Doğru kanalı kullan: sorular #yardim, hatalar #hata-bildir, fikirler #oneri-ve-fikir kanalına.\n6. Ses odalarında müzik veya ses efektiyle başkalarını rahatsız etme.\n7. Descall Ekibi veya moderatör gibi davranma, kimseden şifre ya da kod isteme.\n8. Moderatörlerin uyarılarına uy. Bir karara itirazın varsa #yardim kanalına yaz.\n9. Descall Kullanım Koşulları burada da geçerlidir.\n\nKuralları ihlal edenler uyarılır, susturulur veya sunucudan uzaklaştırılır.", true, 2),
  m("b29422b8-e12d-4553-9e6a-79ab1d173e45", "786ff977-45c2-471b-ba12-7b17d4c222bf", "**Descall 4.2.0 yayında**\n\nYenilikler:\n- Uygulaması kapalı birini arayınca \"Bağlanıyor\"da takılan aramalar düzeldi. Arama sırasında ahizeye geçiş de artık çalışıyor.\n- iPhone'da küçültülen arama artık ekranın tepesinde küçük bir hap: hiçbir şeyin üstüne binmiyor, dokununca tam ekrana dönüyor.\n- Davet Merkezi: arkadaşlarını davet et, katıldıkça ödül ve özel kozmetik kazan.\n- Bir süredir görünmeyen arkadaşını tek dokunuşla geri çağır; dönerse ikiniz de DesCoin kazanırsınız.\n- Bildirim Merkezi: kimden ne zaman bildirim alacağını sen seç.\n- Bug Avcısı: geri bildirimde gerçek hata bulana rozet ve DesCoin.\n- iPad artık masaüstü düzeninde; mağaza setleri düzgün görünüyor.\n\nGüncellemek için: Windows ve masaüstü uygulaması kendiliğinden güncellenir. iPhone ve Android sürümleri yakında mağazalarda.", true, 3),
  m("96103f26-5a8d-4117-82c5-ca7a967ef8fd", "f7e8552e-8a75-4abe-b872-af794037364d", "**Descall'u daha iyi kullanmak için 5 ipucu**\n\n1. Bir mesajı uzun bas (masaüstünde sağ tıkla) ve \"İlet\" ile birden fazla sohbete aynı anda gönder.\n2. Mesajı hemen göndermek istemiyorsan zamanla: \"Yarın sabah\" gibi seçenekler var.\n3. Ctrl + / ile bütün klavye kısayollarını gör.\n4. Ayarlar > Bildirimler'den yalnızca @bahsetmelerde bildirim almayı seçebilirsin.\n5. Ekranını 1080p'de ücretsiz paylaşabilirsin.", false, 4),
  m("722be690-0077-4616-ad6a-c8dd083a9367", "c56332d1-22f4-43d3-8a14-99b670253a22", "Hadi tanışalım! Kendini birkaç cümleyle tanıt:\n- Adın ya da takma adın\n- Nerelisin\n- En çok ne oynuyorsun / izliyorsun / dinliyorsun\n- Descall'u nereden duydun\n\nİlk ben başlayayım: Ben Demir, Descall'u yapan ekipteyim. Burada hepinizle tanışmak ve uygulamayı birlikte geliştirmek için varım.", false, 5),
  m("f7abbf08-668f-4201-b7b0-96aa1ab75f6a", "84f0161e-0f02-493c-818b-7b1e14f8a429", "Hoş geldiniz! Bugün ne yapıyorsunuz, ne oynuyorsunuz? Lobi ses odası her zaman açık, gelin takılalım.", false, 6),
];

module.exports = { SERVER, CHANNELS, MESSAGES };
