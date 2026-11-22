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

Mevcut değişkenlerin (Supabase, JWT, web push ...) hepsi olduğu gibi kalır. Bilgisayar bunları
6. adımda Render'dan kendisi alır; elle kopyalaman gerekmez. LiveKit değişkenleri Render'da yoksa
sorun değil: iki sunucu da onlarsız çalışır.

## 3. Veritabanı geçişlerini uygula

Supabase > **SQL Editor** içinde sırayla şu iki dosyanın içeriğini çalıştır:

1. `supabase/migrations/20261122_node_cluster.sql`: yalnız yeni tablolar ekler (`node_keys`,
   `node_settings`, `node_events`; RLS açık, yalnız sunucu erişir), mevcut hiçbir tabloyu değiştirmez.
   Uygulanmadan önce Sunucu Ağı sekmesi açılır ama düğüm anahtarı oluşturulamaz.
2. `supabase/migrations/20261122b_node_bootstrap.sql`: `node_keys` tablosuna iki sütun ekler
   (`bootstrap_until`, `bootstrapped_at`; kurulum penceresi). Yalnız ekleme yapar, tekrar çalıştırmak
   güvenlidir. Uygulanmadan önce de otomatik kurulum çalışır (anahtar oluşturulduktan sonraki 30 dakika),
   yalnız "Kurulum penceresini aç" düğmesi "veritabanı değişikliği gerekli" der.

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
4. **Kurulum penceresi**: yeni anahtar oluşturulduktan sonraki **30 dakika** boyunca bilgisayar bu
   anahtarla gizli ayarları Render'dan alabilir. Süre geçtiyse Sunucu Ağı > **Düğüm anahtarları**'nda
   anahtarın yanındaki **Kurulum penceresini aç** düğmesine bas (iki adımlı doğrulama ister, işlem
   kaydına yazılır); pencere 30 dakika daha açılır. İşin bitince **Pencereyi kapat** ile hemen
   kapatabilirsin.

## 6. Bilgisayara Descall Node uygulamasını kur

1. GitHub > Actions > **Descall Node** iş akışının `descall-node-setup` çıktısından kurulumu indir ve
   çalıştır. Saatin yanında **DN** simgesi belirir, panel **İlk kurulum** formuyla açılır.
2. Formda yalnız dört alan var. Uygulama değerleri Windows DPAPI ile şifreli saklar; düz metin dosyaya
   yazmaz.

| Formdaki alan | Değer |
| --- | --- |
| Render ana sunucu adresi | hazır yazılı gelir: `https://des-call.onrender.com` |
| Düğüm anahtarı | 5. adımdaki `dsk_node_...` |
| Cloudflare tünel jetonu | 4. adımdaki `eyJ...` |
| Key Value (Redis) dış adresi | 1. adımdaki **External** `rediss://...` adres (Render yalnız iç adresi bildiği için elle yazılır) |

3. **Kaydet ve başlat**'a bas. Uygulama Render'a düğüm anahtarıyla bir kez sorar
   (`POST /api/node/bootstrap`) ve Supabase URL'si, service role anahtarı, `JWT_SECRET`, `TOTP_ENC_KEY`,
   web push / APNs anahtarları, e-posta ayarları gibi bilgisayarın ihtiyaç duyduğu bütün değerleri
   Render'ın kendi ortamından alır, DPAPI ile saklar ve düğümü başlatır. Render bunları yalnız açık bir
   kurulum penceresi içinde verir ve her seferinde telefonuna "PC kurulumu: gizli ayarlar alındı"
   bildirimi gelir; işlem kaydına ve Sunucu Ağı olaylarına da yazılır.
   - Render'ın kendine ait değerleri (`REDIS_URL` iç adresi, `PORT`, `NODE_ENV`, `RENDER_*`,
     `DESCALL_NODE_*`) asla gönderilmez; uygulama bilgisayar tarafındakileri kendisi verir:
     `DESCALL_NODE_ROLE=secondary`, `DESCALL_NODE_ID=pc-xxxxxx`, `PORT=3210`, `DESCALL_NODE_PRIMARY_URL`,
     `DESCALL_NODE_PUBLIC_URL`, `DESCALL_NODE_KEY`, `DESCALL_NODE_MEMORY_MB`, `DESCALL_NODE_CORES` ve her
     açılışta rastgele üretilen `DESCALL_NODE_CONTROL_TOKEN`.
   - Hata olursa formda Türkçe yazar ve yazdıkların silinmez:
     - "Kurulum penceresi kapalı": Admin > Sunucu Ağı > Düğüm anahtarları > **Kurulum penceresini aç**,
       sonra tekrar **Kaydet ve başlat**.
     - "Düğüm anahtarı ana sunucuda tanınmadı": anahtar yanlış kopyalanmış ya da iptal edilmiş; yenisini oluştur.
     - "Ana sunucuya ulaşılamadı": adresi ve internet bağlantısını kontrol et.
     - "Bu adres ana sunucu değil": Render adresini yaz (`pc.descall.com` değil).
4. **Gelişmiş (elle gir)** bölümü (formun altında, kapalı gelir): bu PC'nin genel adresi (boşsa
   `https://pc.descall.com`), Supabase URL / service role anahtarı, JWT gizlisi, LiveKit (isteğe bağlı)
   ve ek `KEY=değer` satırları. Buraya yazdığın her değer Render'dan geleni geçersiz kılar. "Sunucudan
   alma, yalnız elle girdiklerimi kullan" anahtarı açıksa Render'a hiç sorulmaz (o zaman Supabase URL,
   service role anahtarı ve JWT gizlisi elle yazılmalı).
5. Windows Güvenlik Duvarı node.exe için izin sorarsa **izin verme**; tünel yerel bağlantı kullanır.

### Ayarları sonradan yenilemek

Render'da bir değişkeni değiştirdiysen (ör. gizli bir anahtarı yeniledin): Admin > Sunucu Ağı'nda
anahtarın **Kurulum penceresini aç**, sonra tepsi panelinde **Kurulum > Ayarları sunucudan yenile**.
Uygulama yeni değerleri alır, kullanıcıları Render'a aktarır ve düğümü yeni ayarlarla yeniden başlatır.
Bittiğinde istersen **Pencereyi kapat**.

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
  sil, sonra Supabase service role anahtarını, `JWT_SECRET`'i, `TOTP_ENC_KEY`'i, web push / APNs
  anahtarlarını, varsa LiveKit gizlisini ve Key Value parolasını yenileyip Render'a yaz (bilgisayar
  bunların hepsini otomatik kurulumda almıştı).
- **Beklemediğin bir "PC kurulumu: gizli ayarlar alındı" bildirimi gelirse**: hemen o anahtarı iptal et
  ve yukarıdaki gibi gizlileri yenile; Sunucu Ağı olaylarında hangi anahtarın, hangi IP'den aldığı yazar.
- **Tamamen kapatmak için**: Render'dan `REDIS_URL` değişkenini sil. Render eskisi gibi tek sunucu olarak
  çalışır; bilgisayardaki uygulamayı da kaldırabilirsin.
