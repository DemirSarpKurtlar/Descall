# Admin Token (sahip için kılavuz)

Admin Token, bir botun (Claude Code, Claude Desktop, kendi betiklerin) Descall'a **senin
hesabınla, sahip yetkisiyle** bağlanmasını sağlar. Token ile yapılan her şey senin
yaptığın gibi uygulanır: uygulamadaki her işlem (REST ve socket) ve Yönetici Paneli'nin
her bölümü. Kapsam (scope) yoktur, onay kuyruğu yoktur; yasaklama, silme, DesCoin verme ve
duyuru gibi işlemler **hemen** uygulanır.

Sekmeyi yalnızca sahip hesabı görür ve yönetir (kullanıcı adı `admin` veya
`is_super_admin`). Diğer yöneticiler bu uçlara erişemez (`OWNER_ONLY`).

**Tokenlar tokenları yönetemez.** Bir token Admin Token sayfalarını okuyabilir ve yalnızca
yetkiyi azaltan işlemleri yapabilir: duraklatma, iptal etme, tümünü iptal etme ve bir
uyarıdan duraklatma. Yeni token oluşturma, döndürme, iptali geri alma, devam ettirme, ad
veya IP listesi değiştirme, bir uyarıyı yoksayma, "bu IP'ye izin ver" ve otomatik
duraklatma ayarları yalnızca senin oturumunla (2FA koduyla) yapılır; token bunlarda
`TOKEN_SELF_MANAGEMENT` (403) alır. Böylece sızan bir token kendine yeni token açamaz,
kendini geri getiremez ve uyarıları susturamaz.

## 0. Önce migration uygulanmalı

Özellik şu migration ile açılır:

```
supabase/migrations/20261121_admin_api_tokens.sql
```

Dosya yalnızca yeni tablolar ekler (mevcut hiçbir şeye dokunmaz), RLS açıktır ve hiçbir
public politika yoktur; tablolara yalnızca backend (service role) erişir. Supabase SQL
Editor'de çalıştırman yeterli; yeniden başlatma gerekmez (backend 60 saniye içinde fark eder).

Migration uygulanana kadar:

- Admin Token sekmesi "kurulmadı" durumunu gösterir (`GET /api/admin/tokens` -> `{ available: false }`).
- `dsk_admin_` ile başlayan her token 401 alır: `Admin tokens are not set up yet.`
- Uygulamanın geri kalanı hiç değişmez.

Oluşturulan tablolar: `admin_api_tokens`, `admin_api_token_usage_hourly`,
`admin_api_token_calls`, `admin_api_token_ips`, `admin_api_token_alerts`,
`admin_api_token_settings`.

## 1. Token oluşturma

1. Yönetici Paneli > Güvenlik > **Admin Token** > "Yeni token".
2. Bir ad ver (ör. "Claude Code - dizüstü"). Her bot için ayrı token aç; böylece birini
   iptal ettiğinde diğerleri çalışmaya devam eder ve işlem kaydında hangi botun ne yaptığı görünür.
3. Süre seç: 1 saat, 1 gün, 7 gün, 30 gün, 90 gün veya süresiz. Mümkün olan en kısa süreyi seç.
4. İstersen **IP izin listesi** gir (tek adres `203.0.113.7` veya aralık `203.0.113.0/24`,
   IPv6 de olur). Liste doluysa token yalnızca bu adreslerden çalışır.
5. Authenticator kodunu gir (oluşturma, döndürme, geri alma ve tümünü iptal etme 2FA ister).
6. En fazla **50 etkin token** olabilir (`TOKEN_LIMIT`); yer açmak için birini iptal et.
7. Token **yalnızca bir kez** gösterilir: `dsk_admin_` ile başlayan 53 karakterlik metin.
   Hemen kopyala ve güvenli bir yere (parola yöneticisi) kaydet. Sunucu tokenın kendisini
   saklamaz, yalnızca SHA-256 özetini saklar; kaybedersen geri getirilemez, döndürmen gerekir.

Listede token `dsk_admin_7Hq2…k9Xa` biçiminde (ilk 4 ve son 4 karakter) görünür.

Tokenı hangi adresten oluşturduğun kaydedilir. Token ilk kez başka bir adresten
kullanılırsa uyarı oluşur (bot başka bir sunucuda çalışıyorsa bu beklenen bir uyarıdır;
"Bu IP'ye izin ver" ile kapatabilirsin).

## 2. Claude Code ile bağlanma

```
claude mcp add --transport http descall https://des-call.onrender.com/mcp --header "Authorization: Bearer dsk_admin_..."
```

Sonra Claude Code içinde `/mcp` ile bağlantıyı kontrol et. API alan adı değişirse
(`https://api.descall.com`) adresi ona göre güncelle; panel her zaman güncel adresi gösterir.

Tokenı komut geçmişinde bırakmamak için önce bir ortam değişkenine koyabilirsin:

```
export DESCALL_ADMIN_TOKEN="dsk_admin_..."
claude mcp add --transport http descall https://des-call.onrender.com/mcp --header "Authorization: Bearer $DESCALL_ADMIN_TOKEN"
```

## 3. Claude Desktop ile bağlanma

Claude Desktop özel başlık (header) ile uzak MCP sunucusuna doğrudan bağlanamadığı için
`mcp-remote` köprüsü kullanılır. `claude_desktop_config.json` dosyasına ekle
(Ayarlar > Geliştirici > Yapılandırmayı düzenle):

```json
{
  "mcpServers": {
    "descall": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://des-call.onrender.com/mcp", "--header", "Authorization:${DESCALL_AUTH}"],
      "env": { "DESCALL_AUTH": "Bearer dsk_admin_..." }
    }
  }
}
```

Claude Desktop'ı yeniden başlat; araçlar "descall" altında görünür.

## 4. MCP araçları

Hazır araçlar (hepsi panelin kendi uçlarını aynı tokenla çağırır, aynı kontroller ve aynı
işlem kaydı geçerlidir):

- Genel: `overview`, `platform_stats`, `system_health`, `system_overview`, `security_overview`, `analytics`, `signup_attribution`, `signup_stats`, `retention`, `top_users`, `member_pulse`
- Kullanıcılar: `search_users`, `user_profile`, `user_dossier`, `user_activity`, `user_analytics`
- Moderasyon: `reports_summary`, `reports`, `dismiss_report`, `moderation_active`, `moderation_history`, `access_bans`, `access_ban_hits`, `ban_user`, `unban_user`, `timeout_user`, `untimeout_user`
- Şüpheli hesaplar: `suspicious_overview`, `suspicious_accounts`, `suspicious_clusters`, `suspicious_feed`, `suspicious_user`
- Mesajlar: `dm_conversations`, `group_conversations`, `read_dm`, `read_group` (okuma amaç + gerekçe ister ve işlem kaydına yazılır)
- Ekonomi: `economy`, `descoin_reconciliation`, `descoin_history`, `descoin_grant`, `shop_items`, `shop_gift`, `premium_dashboard`, `premium_finance`, `promo_codes`, `special_badges`
- İçerik ve sunucular: `create_announcement`, `list_servers`, `get_server`, `server_members`
- Kayıtlar: `admin_audit`, `error_groups`, `error_group`, `feedback`
- Her şey için: `describe_api` (tüm REST uçlarının listesi) ve `api_request` (`/api/` ile başlayan herhangi bir uç)

Botun REST ile çalışması için OpenAPI belgesi: `GET /api/admin/openapi.json`
(sahip oturumu veya token gerekir).

REST örneği:

```
curl -H "Authorization: Bearer dsk_admin_..." https://des-call.onrender.com/api/admin/overview
```

## 5. İzleme, uyarılar, otomatik duraklatma

Her tokenın sayfasında son 24 saatin grafiği, en çok çağrılan uçlar, hata oranı, gecikme,
MCP/REST payı, son 7 günün IP adresleri ve **canlı konsol** (her 3 saniyede yenilenen son
çağrılar) vardır. Yıkıcı çağrılar (yasaklama, silme, DesCoin/kredi verme, toplu duyuru/popup)
işaretlenir ve işlem kaydındaki kayda bağlanır. Token ile yapılan her işlem işlem kaydında
token adıyla görünür (`actor_via: "token"`).

Uyarılar:

- **Yeni IP**: token son 7 günde kullanmadığı bir adresten çağrıldı.
- **Yeni ülke**: son 7 günde görülmeyen bir ülkeden çağrıldı.
- **Ani artış**: son 5 dakikada en az 50 istek ve olağan hızın 10 katından fazlası.
- **İlk kullanım**: token ilk kez oluşturulduğu adresten başka bir adresten kullanıldı.
- **Uzun aradan sonra**: 7 günden uzun kullanılmayan token, daha önce hiç görülmemiş bir
  adresten yeniden kullanıldı.

Adres ve ülke sıkı biçimde belirlenir: yalnızca tek bir Cloudflare geçişi kabul edilir ve
ülke yalnızca Cloudflare'in `cf-ipcountry` bilgisinden alınır. Ülkesi bilinmeyen yeni bir
adres (Cloudflare'siz doğrudan bağlantı, `XX`, `T1`) **yeni ülke** sayılır ve varsayılan
ayarla tokenı duraklatır. Yerel, özel ağ veya Cloudflare adresi gibi güvenilmeyen adresler
IP izin listesine hiçbir zaman uymaz ve her zaman yeni adres sayılır. Botu mümkünse
Cloudflare arkasındaki API adresine bağla ve beklenen ilk uyarıyı "Bu IP'ye izin ver" ile kapat.

Otomatik duraklatma açıksa ve ilgili kural seçiliyse token hemen duraklatılır (yeni ülke
kuralında o istek de reddedilir). Uyarı sana canlı bildirim ve e-posta olarak gelir. Uyarı
üzerinden: "Yoksay", "Duraklat" veya "Bu IP'ye izin ver" (otomatik duraklatmayı da kaldırır).

## 6. Duraklatma, döndürme, iptal

- **Duraklat / devam ettir**: token hemen durur, açık socket ve MCP oturumları kapanır.
  Devam ettirme yalnızca senin oturumunla yapılır.
- **Döndür (rotate)**: yeni bir token üretir. İstersen eski token 60 dakika veya 24 saat daha
  çalışır (geçiş süresi), böylece botu kesintisiz güncellersin. Geçiş süresi seçmezsen eski
  token hemen geçersiz olur. Eski tokenla açılmış socket ve MCP oturumları geçiş süresi
  bitince (geçiş süresi yoksa hemen) kapanır; ikinci bir döndürme, önceki geçiş tokenını hemen kapatır.
- **İptal et**: sebep seç (sızdı, kullanılmıyor, değiştirildi, diğer) ve onay için tokenın
  adını yaz. İptal **10 dakika** içinde 2FA ile geri alınabilir; sonra kalıcıdır.
- **Tümünü iptal et**: tüm tokenları tek seferde iptal eder; onay için `TÜMÜNÜ İPTAL ET` yazılır.
  Bir token da bunu yapabilir (yetkiyi yalnızca azaltır).

Geçersiz tokenlarla çok deneme yapan bir adres (10 dakikada 30 hatalı token) bir süre engellenir.

İptal ve duraklatma birkaç saniye içinde her yerde geçerli olur.

## 7. Güvenlik uyarıları

- Admin Token **senin hesabının tam yetkisidir**. Tokenı ele geçiren kişi kullanıcıları
  yasaklayabilir, DesCoin dağıtabilir, özel mesajları okuyabilir ve herkese duyuru gönderebilir.
- Tokenı asla git deposuna, ekran görüntüsüne, sohbet mesajına, e-postaya veya paylaşılan
  bir belgeye koyma. `.env` dosyalarını commit etme.
- Mümkün olan en kısa süreyi ve IP izin listesini kullan; süresiz token yalnızca gerçekten gerekiyorsa.
- Her bot için ayrı token aç ve kullanılmayanları iptal et.
- Bir tokenın sızdığından şüphelenirsen hemen **İptal et** (sebep: sızdı); emin değilsen
  önce **Duraklat**. Ardından işlem kaydında o tokenın yaptıklarını kontrol et; yasaklama
  gibi işlemler oradan geri alınabilir.
- Botlara yıkıcı işlemlerden önce sana sormalarını söyle; token işlemleri onaysız uygular.
- Tokenları düzenli olarak döndür (ör. 90 günde bir).
