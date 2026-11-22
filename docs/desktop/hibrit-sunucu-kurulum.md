# Hibrit sunucu kurulumu (Render + ev bilgisayarı)

Bu rehber, ev bilgisayarını Render'ın yanında ikinci bir Descall sunucusu (düğüm) olarak açmak için
yapman gereken her şeyi sırayla anlatır. Kod hazır; aşağıdaki adımları yapmadıkça hiçbir şey değişmez:
`REDIS_URL` tanımlı değilken Render bugünkü gibi tek başına çalışır.

Kısaca düzen şöyle:

- Render ana sunucudur (her zaman açık, varsayılan lider).
- Bilgisayar ikinci sunucudur. Kullanıcılara `https://pc.descall.com` üzerinden, Cloudflare Tunnel ile
  ulaşır; modemde port açmak gerekmez. Bilgisayardaki backend yalnız `127.0.0.1:3210` dinler.
- İki sunucu canlı durumu ücretsiz bir Render Key Value (Redis) üzerinden paylaşır. Key Value
  ulaşılamazsa her sunucu tek başına çalışmaya devam eder.
- Render'ın RAM'i %60'ı geçince yeni bağlantılar bilgisayara, bilgisayar kendi payının %85'ine gelince
  tekrar Render'a gider. Bilgisayar kapanırken kullanıcılar birkaç saniyede Render'a aktarılır.

## 1. Render Key Value oluştur (ücretsiz)

1. Render panelinde **New > Key Value**.
2. Ad: `descall-kv`. Bölge: web servisinle **aynı bölge** (iç adres yalnız aynı bölgede çalışır).
3. Plan: **Free** (25 MB). Maxmemory policy: varsayılan kalabilir.
4. Oluşunca Key Value sayfasında **Connect** bölümünü aç. İki adres göreceksin:
   - **Internal** (`redis://red-...:6379`): Render web servisi bunu kullanır.
   - **External** (`rediss://red-...:<parola>@<bölge>-keyvalue.render.com:6379`): bilgisayar bunu kullanır.
5. Aynı sayfada **Access Control** (gelen IP izin listesi) bölümüne evinin genel IP adresini ekle
   (öğrenmek için bilgisayardan "what is my ip" araması yeterli). Listede olmayan adresler dış adrese
   bağlanamaz.
   - Ev IP'n değişirse (çoğu ev bağlantısında ara sıra değişir) bilgisayar kümeye bağlanamaz ve tek
     başına kalır; Admin > Sunucu Ağı'nda Key Value bağlantısı kopuk görünür. O zaman yeni IP'yi listeye ekle.
   - Ücretsiz Key Value yeniden başlayabilir ve verisini kaybedebilir; bu bekleniyor, sunucular durumu
     kendiliğinden yeniden yazar.

## 2. Render web servisine ortam değişkenlerini ekle

Render > web servisi (`des-call`) > **Environment** bölümüne şunları ekle, sonra kaydet (servis
yeniden başlar):

| Değişken | Değer |
| --- | --- |
| `REDIS_URL` | 1. adımdaki **Internal** adres |
| `DESCALL_NODE_ROLE` | `primary` |
| `DESCALL_NODE_ID` | `render` |
| `DESCALL_NODE_PUBLIC_URL` | `https://des-call.onrender.com` |
| `DESCALL_NODE_MEMORY_MB` | `512` |

Mevcut değişkenlerin (Supabase, JWT, LiveKit, web push ...) hepsi olduğu gibi kalır.

## 3. Veritabanı geçişini uygula

Supabase > **SQL Editor** içinde `supabase/migrations/20261122_node_cluster.sql` dosyasının içeriğini
çalıştır. Bu dosya yalnız yeni tablolar ekler (`node_keys`, `node_settings`, `node_events`; RLS açık,
yalnız sunucu erişir), mevcut hiçbir tabloyu değiştirmez. Uygulanmadan önce Sunucu Ağı sekmesi açılır
ama düğüm anahtarı oluşturulamaz.

## 4. Cloudflare Tunnel: `pc.descall.com`

1. Cloudflare > **Zero Trust > Networks > Tunnels > Create a tunnel**, tür **Cloudflared**, ad `descall-pc`.
2. "Install and run a connector" ekranındaki komutta görünen uzun jetonu (`eyJ...`) kopyala.
   **Komutu çalıştırma**: cloudflared'i Descall Node uygulaması kendisi çalıştırır.
3. **Public Hostnames > Add a public hostname**: Subdomain `pc`, Domain `descall.com`,
   Service **HTTP**, URL `localhost:3210`. Kaydet. (WebSocket varsayılan olarak açıktır.)
4. Jetonu kimseyle paylaşma; 6. adımda uygulamanın formuna yapıştıracaksın.

## 5. Düğüm anahtarı oluştur

1. Descall'a sahip hesabınla gir: **Admin paneli > Sistem > Sunucu Ağı**.
2. **Düğüm anahtarları > Anahtar oluştur**, ad örneğin `ev-pc`. İki adımlı doğrulama ister.
3. Gösterilen `dsk_node_...` anahtarını kopyala. Bir daha gösterilmez (sunucuda yalnız SHA-256 özeti
   saklanır). Kaybolursa eskisini iptal edip yenisini oluştur.

## 6. Bilgisayara Descall Node uygulamasını kur

1. GitHub > Actions > **Descall Node** iş akışının `descall-node-setup` çıktısından kurulumu indir ve
   çalıştır. Saatin yanında **DN** simgesi belirir, panel **İlk kurulum** formuyla açılır.
2. Formu doldur. Uygulama değerleri Windows DPAPI ile şifreli saklar; düz metin dosyaya yazmaz.

| Formdaki alan | Değer |
| --- | --- |
| Render ana sunucu adresi | `https://des-call.onrender.com` |
| Bu PC'nin genel adresi | boş bırak (`https://pc.descall.com` kullanılır) |
| Düğüm anahtarı | 5. adımdaki `dsk_node_...` |
| Cloudflare tünel jetonu | 4. adımdaki `eyJ...` |
| Supabase URL ve service role anahtarı | Render'daki `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` |
| JWT gizlisi | Render'daki `JWT_SECRET` (birebir aynı olmalı) |
| Key Value (Redis) dış adresi | 1. adımdaki **External** `rediss://...` adres |
| LiveKit URL / API anahtarı / API gizlisi | Render'daki `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` |
| Ek ortam değişkenleri | Render'daki diğer gizliler, `KEY=değer` satırları halinde (ör. `TOTP_ENC_KEY`, web push anahtarları) |

3. **Kaydet ve başlat**'a bas. Uygulama bilgisayar tarafındaki şu değişkenleri kendisi verir, elle
   yazman gerekmez: `DESCALL_NODE_ROLE=secondary`, `DESCALL_NODE_ID=pc-xxxxxx`, `PORT=3210`,
   `DESCALL_NODE_PRIMARY_URL`, `DESCALL_NODE_PUBLIC_URL`, `DESCALL_NODE_KEY`, `DESCALL_NODE_MEMORY_MB`,
   `DESCALL_NODE_CORES` ve her açılışta rastgele üretilen `DESCALL_NODE_CONTROL_TOKEN`.
4. Windows Güvenlik Duvarı node.exe için izin sorarsa **izin verme**; tünel yerel bağlantı kullanır.

Ayrıntılı kullanım (duraklatma, oyun modu, zaman planı, kaldırma): `docs/desktop/descall-node.md`.

## 7. Kontrol et

1. Admin > Sunucu Ağı'nda iki düğüm görünmeli: `render` (lider) ve `pc-xxxxxx` (aktif). Key Value
   kartı "bağlı" göstermeli.
2. Tarayıcıda `https://pc.descall.com/api/node/health` açıldığında `{"ok":true,...,"role":"secondary"}`
   dönmeli.
3. **Hızlı işlemler > Devir provası yap** ile bilgisayardaki kullanıcıların Render'a aktarılıp geri
   geldiğini dene.
4. PC payını (RAM 0,5-8 GB, CPU 1-8 çekirdek), yük kuralını, oyun modunu ve haftalık planı aynı sekmeden
   ayarla; tepsi panelindeki kaydırıcılar da aynı ayarı değiştirir.

## Acil durum ve geri alma

- **Herkesi Render'a al (acil)** (sebep yazıp onaylarsın): bilgisayardaki herkes Render'a aktarılır ve kaldırana
  kadar yeni kimse bilgisayara gönderilmez. Bilgisayar o an bağlantısızsa bile geri geldiğinde kendini boşaltır.
  Kaldırmak için Sunucu Ağı > Hızlı işlemler > **PC'yi geri al**; acil durum işareti de kalkar.
- **Bilgisayar kaybolur veya çalınırsa**: Sunucu Ağı'nda düğüm anahtarını iptal et, Cloudflare'de tüneli
  sil, sonra Supabase service role anahtarını, `JWT_SECRET`'i, LiveKit gizlisini ve Key Value parolasını
  yenileyip Render'a yaz.
- **Tamamen kapatmak için**: Render'dan `REDIS_URL` değişkenini sil. Render eskisi gibi tek sunucu olarak
  çalışır; bilgisayardaki uygulamayı da kaldırabilirsin.
