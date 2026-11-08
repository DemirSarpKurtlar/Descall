# Search Console verilerini Supabase'e aktarma

Amaç: Google Search Console'daki arama sorgusu verileri (hangi aramada, hangi sayfa, kaç tıklama, kaç gösterim, ortalama sıra) her gün otomatik olarak Supabase'e gelsin. Böylece kimsenin sohbete bir anahtar ya da şifre yapıştırması gerekmez. Anahtar yalnızca GitHub'ın şifreli "secret" alanında durur.

Parçalar:

- İş akışı: `.github/workflows/search-console-sync.yml` (her gün 05:17 UTC, yani Türkiye saatiyle 08:17; ayrıca elle çalıştırılabilir).
- Betik: `frontend/scripts/search-console-sync.mjs` (ek paket yok; Google'a giriş için gereken imzayı Node'un kendi `crypto` modülüyle atar). Testi: `node frontend/scripts/search-console-sync.selftest.mjs`.
- Tablo: `public.seo_search_console_daily`, göç dosyası `supabase/migrations/20261111_search_console.sql`. Sütunlar: `date`, `query`, `page`, `country`, `device`, `clicks`, `impressions`, `ctr`, `position`. Birincil anahtar `(date, query, page, country, device)`. RLS açık, hiçbir politika yok, `anon` ve `authenticated` rollerinin hiçbir yetkisi yok; tabloyu yalnızca service role okur ve yazar.

İş her çalıştığında son 28 günü (dünden geriye) okur, sayfa sayfa (her istekte 25.000 satır) ilerler ve satırları tabloya "upsert" eder. Search Console son 2-3 günü geç doldurduğu için aynı günler birkaç kez yeniden okunur; upsert eski satırları düzeltir, çift kayıt oluşmaz.

Secret eklenmemişse iş bir bilgi notu yazıp yeşil biter. Yani aşağıdaki adımlar bitene kadar hiçbir şey bozulmaz.

---

## Senin yapman gerekenler (bir kez, yaklaşık 15 dakika)

### 1. Göçü uygula

Supabase panelinde SQL Editor'ü aç, `supabase/migrations/20261111_search_console.sql` dosyasının içeriğini yapıştır ve çalıştır. Dosya yalnızca yeni bir tablo ekler; var olan hiçbir şeye dokunmaz.

### 2. Google Cloud'da bir proje oluştur

1. https://console.cloud.google.com adresine Search Console'u kullandığın Google hesabıyla gir.
2. Üstteki proje seçicisinden **New Project** (Yeni proje) de. Ad olarak örneğin `descall-search-console` yaz ve oluştur.
3. Ücretlendirme açmana gerek yok; Search Console API ücretsizdir.

### 3. Search Console API'yi etkinleştir

1. Yeni proje seçiliyken **APIs & Services > Library** (API'ler ve Hizmetler > Kitaplık) sayfasına git.
2. "Google Search Console API" ara, aç ve **Enable** (Etkinleştir) düğmesine bas.

### 4. Bir hizmet hesabı ve JSON anahtarı oluştur

1. **IAM & Admin > Service Accounts** (IAM ve Yönetici > Hizmet hesapları) sayfasında **Create service account** de.
2. Ad olarak örneğin `search-console-sync` yaz. Projede herhangi bir rol vermene gerek yok; rol adımlarını boş geç ve bitir.
3. Oluşan hesabı aç, **Keys** (Anahtarlar) sekmesinde **Add key > Create new key > JSON** seç. Bilgisayarına bir `.json` dosyası iner.
4. Bu dosyayı kimseyle paylaşma, sohbete yapıştırma, depoya ekleme. Sadece 6. adımda GitHub'a gireceksin; sonra bilgisayarından silebilirsin.
5. Hizmet hesabının e-posta adresini not al. Şuna benzer: `search-console-sync@descall-search-console.iam.gserviceaccount.com`.

### 5. Hizmet hesabını Search Console'a "Kısıtlı" kullanıcı olarak ekle

1. https://search.google.com/search-console adresinde Descall mülkünü seç.
2. **Ayarlar > Kullanıcılar ve izinler** sayfasında **Kullanıcı ekle** de.
3. 4. adımda not aldığın hizmet hesabı e-postasını yaz, izin olarak **Kısıtlı** seç ve ekle. Kısıtlı izin verileri okumaya yeter; hesap hiçbir ayarı değiştiremez.
4. Mülkün tam adını not al: alan adı mülküyse `sc-domain:descall.com`, URL ön eki mülküyse `https://descall.com/` (sondaki eğik çizgiyle).

### 6. GitHub'a secret ve değişkeni ekle

Depoda **Settings > Secrets and variables > Actions** sayfasına git.

- **Secrets** sekmesinde **New repository secret**:
  - Ad: `GSC_SERVICE_ACCOUNT_JSON`, değer: 4. adımda inen JSON dosyasının **tüm içeriği** (dosyayı bir metin düzenleyicide aç, hepsini kopyala, yapıştır).
  - `SUPABASE_URL` ve `SUPABASE_SERVICE_ROLE_KEY` henüz yoksa onları da ekle. Değerler Render'daki backend ile aynıdır (Supabase panelinde **Project Settings > API**: Project URL ve `service_role` anahtarı).
- **Variables** sekmesinde **New repository variable**:
  - Ad: `GSC_SITE_URL`, değer: 5. adımda not aldığın mülk adı, örneğin `sc-domain:descall.com`.

### 7. İşi bir kez elle çalıştır

1. Depoda **Actions** sekmesinde soldan **Search Console sync** iş akışını seç.
2. **Run workflow** de. İstersen önce **dry_run** kutusunu işaretle: o zaman iş sadece Google'dan okur, Supabase'e yazmaz ve kaç satır geldiğini gösterir.
3. İş yeşil bitince günlükte "Upserted N rows into public.seo_search_console_daily." satırını görmelisin. Bundan sonra iş her sabah kendiliğinden çalışır.

---

## Sık karşılaşılan hatalar

- **HTTP 403, "User does not have sufficient permission"**: hizmet hesabı Search Console mülküne eklenmemiş ya da `GSC_SITE_URL` mülkün adıyla birebir aynı değil (`sc-domain:` öneki, `https://` ve sondaki `/` önemli). 5. adımı kontrol et.
- **"GSC_SERVICE_ACCOUNT_JSON is not valid JSON"**: secret'a dosyanın sadece bir kısmı yapıştırılmış. Dosyanın tamamını, süslü parantezler dahil yeniden yapıştır.
- **Supabase HTTP 404**: tablo yok; 1. adımdaki göçü uygula.
- **Supabase HTTP 401**: `SUPABASE_SERVICE_ROLE_KEY` yanlış ya da `anon` anahtarı girilmiş; `service_role` anahtarını kullan.
- **Satır sayısı 0**: mülk yeni doğrulandıysa Search Console'un veri toplaması birkaç gün sürer. Ayrıca Google, çok az aranan sorguları gizlilik için listelemez; bu yüzden toplam tıklama Search Console panelindeki toplamdan biraz düşük görünebilir.

## Güvenlik notları

- Anahtar yalnızca GitHub secret'ında durur. İş günlüğüne yazılmaz; Google'dan alınan geçici erişim belirteci de günlükte maskelenir.
- Hizmet hesabının Search Console'da yalnızca **Kısıtlı** (okuma) izni var ve betik yalnızca `webmasters.readonly` kapsamını ister.
- Anahtarı iptal etmek istersen Google Cloud'da hizmet hesabının **Keys** sekmesinden sil ve GitHub'daki `GSC_SERVICE_ACCOUNT_JSON` secret'ını kaldır. İş bir sonraki çalışmada bilgi notu yazıp atlar.

## Verilere bakmak

Supabase SQL Editor'de örneğin son 28 günün en çok tıklanan sorguları:

```sql
select query, sum(clicks) as clicks, sum(impressions) as impressions,
       round(sum(clicks)::numeric / nullif(sum(impressions), 0) * 100, 2) as ctr_percent,
       round((sum(position * impressions) / nullif(sum(impressions), 0))::numeric, 1) as avg_position
from public.seo_search_console_daily
where date >= current_date - 28
group by query
order by clicks desc
limit 50;
```

Sayfalar için aynı sorguda `query` yerine `page` kullan; Türkiye için `where country = 'tur'` ekle (ülke kodları üç harflidir).
